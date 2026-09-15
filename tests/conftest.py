"""Offline test rig: a synthetic Bybit (REST + stream) and an engine factory on a temporary ledger."""
from __future__ import annotations

import asyncio
import math
import random
import time

import pytest

import backend.config as config_mod
import backend.engine as engine_mod
from backend.config import Settings
from backend.engine import Engine
from backend.storage import Storage

MIN_MS = 60_000


def make_candles(n: int, interval_ms: int, end_ms: int | None = None, start_price: float = 77_000.0, seed: int = 1) -> list[list[float]]:
    """Random-walk candles with a mild sine drift, oldest first: [ts, o, h, l, c, v]."""
    rng = random.Random(seed)
    end_ms = end_ms or (int(time.time() * 1000) // interval_ms) * interval_ms
    rows = []
    p = start_price
    for i in range(n):
        ts = end_ms - (n - 1 - i) * interval_ms
        drift = math.sin(i / 37) * 15
        o = p
        c = p + drift + rng.gauss(0, 25)
        h = max(o, c) + abs(rng.gauss(0, 12))
        lo = min(o, c) - abs(rng.gauss(0, 12))
        v = 5 + abs(rng.gauss(0, 3))
        rows.append([ts, round(o, 1), round(h, 1), round(lo, 1), round(c, 1), round(v, 3)])
        p = c
    return rows


class FakeREST:
    """Enough of BybitREST for the engine, with knobs the tests turn."""

    def __init__(self):
        self.price = 77_000.0
        self.calls: list[str] = []
        self.orders: dict[str, dict] = {}
        self.exchange_size = 0.0
        self.exchange_side = ""
        self.hedge_mode = False
        self.fill_orders = True
        self.wallet = 10_000.0
        self.offset_ms = 0
        self.c1 = make_candles(3000, MIN_MS, start_price=self.price)
        self.c15 = make_candles(400, 15 * MIN_MS, start_price=self.price, seed=2)

    async def close(self):
        pass

    async def sync_time(self):
        return 0

    async def instrument(self, symbol):
        self.calls.append("instrument")
        return {"qty_step": 0.001, "min_qty": 0.001, "max_qty": 100.0, "min_notional": 5.0, "tick": 0.1, "raw": {}}

    async def klines_history(self, symbol, interval, total):
        self.calls.append(f"history:{interval}")
        return (self.c1 if interval == "1" else self.c15)[-total:]

    async def klines(self, symbol, interval, limit=1000, end=None):
        self.calls.append(f"klines:{interval}")
        return (self.c1 if interval == "1" else self.c15)[-limit:]

    async def ticker(self, symbol):
        return {
            "symbol": symbol, "lastPrice": str(self.price), "markPrice": str(self.price), "indexPrice": str(self.price),
            "price24hPcnt": "-0.01", "highPrice24h": str(self.price * 1.02), "lowPrice24h": str(self.price * 0.98),
            "fundingRate": "0.0001", "nextFundingTime": "0", "openInterest": "50000", "openInterestValue": "1", "turnover24h": "1",
        }

    async def orderbook(self, symbol, limit=50):
        b = [[str(self.price - i * 0.1), "1.0"] for i in range(1, limit + 1)]
        a = [[str(self.price + i * 0.1), "1.0"] for i in range(1, limit + 1)]
        return {"b": b, "a": a}

    # ---- private ----
    async def positions(self, symbol):
        if self.hedge_mode:
            return [{"positionIdx": 1, "size": "0", "side": "Buy"}]
        if self.exchange_size > 0:
            return [{"positionIdx": 0, "size": str(self.exchange_size), "side": "Buy" if self.exchange_side == "UP" else "Sell"}]
        return [{"positionIdx": 0, "size": "0", "side": ""}]

    async def wallet_balance(self):
        return {"totalEquity": str(self.wallet)}

    async def set_leverage(self, symbol, leverage):
        self.calls.append("leverage")
        return {}

    async def market_order(self, symbol, side, qty, qty_step=0.001, reduce_only=False, take_profit=None, stop_loss=None, tick=0.1, link_id=None):
        oid = f"o{len(self.orders) + 1}"
        self.orders[oid] = {"side": side, "qty": qty, "reduce_only": reduce_only, "status": "Filled" if self.fill_orders else "New"}
        self.calls.append(f"order:{side}:{qty}:{reduce_only}")
        if self.fill_orders:
            if reduce_only:
                self.exchange_size = 0.0
            else:
                self.exchange_size, self.exchange_side = qty, "UP" if side == "Buy" else "DOWN"
        return {"orderId": oid}

    async def order_status(self, symbol, order_id):
        o = self.orders[order_id]
        if o["status"] == "Filled":
            return {"orderStatus": "Filled", "avgPrice": str(self.price), "cumExecFee": "0.5", "cumExecQty": str(o["qty"])}
        return {"orderStatus": "New", "cumExecQty": "0"}

    async def cancel_order(self, symbol, order_id):
        self.orders[order_id]["status"] = "Cancelled"
        self.calls.append("cancel")
        return {}


class FakeWS:
    instances: list[FakeWS] = []

    def __init__(self, topics, on_message, on_status=None, testnet=False):
        self.topics, self.on_message, self.on_status = topics, on_message, on_status
        self.connected = False
        self.reconnects = 0
        self.last_msg = 0.0
        self._stop = asyncio.Event()
        FakeWS.instances.append(self)

    async def run(self):
        self.connected = True
        if self.on_status:
            self.on_status(True)
        await self._stop.wait()

    def stop(self):
        self._stop.set()


@pytest.fixture(autouse=True)
def isolated_settings(tmp_path, monkeypatch):
    monkeypatch.setattr(config_mod, "SETTINGS_PATH", tmp_path / "settings.json")
    monkeypatch.setattr(engine_mod, "BybitPublicWS", FakeWS)
    monkeypatch.setattr(engine_mod, "DATA_DIR", tmp_path)
    FakeWS.instances.clear()
    yield


@pytest.fixture
def settings():
    s = Settings()
    s.mode = "paper"
    s.stage_pace_s = 0.0
    s.rescan_interval_s = 3600
    s.api_key = s.api_secret = ""
    s.risk.min_edge_cents = -100.0   # any edge trades, so tests can drive the pipeline deterministically
    return s


@pytest.fixture
def rest():
    return FakeREST()


@pytest.fixture
def store(tmp_path):
    return Storage(tmp_path / "ledger.sqlite")


@pytest.fixture
async def engine(settings, rest, store):
    e = Engine(settings, store=store, rest=rest)
    await e.start()
    await asyncio.sleep(0)            # let the stream fake connect
    if e._pipeline_task:
        await e._pipeline_task       # boot scan finishes before the test starts
    yield e
    await e.stop()


async def run_pipeline(e: Engine, reason: str = "test"):
    e._schedule_pipeline(reason)
    await wait_pipeline(e)


async def wait_pipeline(e: Engine):
    """Wait for the current pipeline task (and any queued follow-up) to finish."""
    for _ in range(3):
        if e._pipeline_task and not e._pipeline_task.done():
            await asyncio.wait_for(e._pipeline_task, 5)
        await asyncio.sleep(0)
