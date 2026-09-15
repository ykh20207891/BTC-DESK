"""Minimal Bybit v5 client: signed REST with retries + clock sync, public WebSocket with a watchdog."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import ssl
import time
from collections.abc import Awaitable, Callable
from decimal import ROUND_DOWN, Decimal
from typing import Any

import httpx
import websockets

log = logging.getLogger("btcdesk.bybit")

MAINNET_REST = "https://api.bybit.com"
TESTNET_REST = "https://api-testnet.bybit.com"
MAINNET_WS = "wss://stream.bybit.com/v5/public/linear"
TESTNET_WS = "wss://stream-testnet.bybit.com/v5/public/linear"
RETRY_STATUS = {429, 500, 502, 503, 504}
TIMESTAMP_ERRORS = {10002}  # request timestamp outside recv_window: resync the clock and retry once


class BybitError(RuntimeError):
    def __init__(self, path: str, code: int, msg: str):
        super().__init__(f"{path}: {code} {msg}")
        self.code = code
        self.msg = msg


def ssl_context() -> ssl.SSLContext:
    """Default verification, minus the X509_STRICT flag Python 3.13+ enables by default.

    Bybit's certificate chain carries a CA whose basicConstraints extension is not marked
    critical, which strict mode rejects. Hostname and chain verification stay on.
    """
    ctx = ssl.create_default_context()
    try:
        import certifi  # bundled with httpx

        ctx.load_verify_locations(certifi.where())
    except (ImportError, OSError):
        pass
    ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return ctx


SSL_CTX = ssl_context()


def round_step(qty: float, step: float) -> float:
    """Round a quantity DOWN to the instrument's lot step without float drift."""
    if step <= 0:
        return qty
    q = (Decimal(str(qty)) / Decimal(str(step)) + Decimal("1e-9")).to_integral_value(rounding=ROUND_DOWN) * Decimal(str(step))
    return float(q)


def fmt_step(value: float, step: float) -> str:
    """Format a number with exactly the decimals of its step (0.001 -> 3 decimals)."""
    d = Decimal(str(step)).normalize()
    decimals = max(0, -d.as_tuple().exponent)
    return f"{value:.{decimals}f}"


class BybitREST:
    def __init__(self, api_key: str = "", api_secret: str = "", testnet: bool = False, recv_window: int = 5000):
        self.base = TESTNET_REST if testnet else MAINNET_REST
        self.key = api_key
        self.secret = api_secret
        self.recv_window = recv_window
        self.offset_ms = 0  # server clock minus local clock
        self._client = httpx.AsyncClient(base_url=self.base, timeout=10.0, verify=SSL_CTX)

    async def close(self):
        await self._client.aclose()

    # ---------- signing ----------
    def _headers(self, payload: str) -> dict:
        ts = str(int(time.time() * 1000) + self.offset_ms)
        raw = ts + self.key + str(self.recv_window) + payload
        sig = hmac.new(self.secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
        return {
            "X-BAPI-API-KEY": self.key,
            "X-BAPI-TIMESTAMP": ts,
            "X-BAPI-RECV-WINDOW": str(self.recv_window),
            "X-BAPI-SIGN": sig,
            "X-BAPI-SIGN-TYPE": "2",
            "Content-Type": "application/json",
        }

    async def sync_time(self) -> int:
        r = await self._client.get("/v5/market/time")
        r.raise_for_status()
        server_ms = int(r.json()["result"]["timeNano"]) // 1_000_000
        self.offset_ms = server_ms - int(time.time() * 1000)
        return self.offset_ms

    async def _send(self, method: str, path: str, *, params: dict | None = None, body: dict | None = None, private: bool = False) -> dict:
        params = {k: v for k, v in (params or {}).items() if v is not None}
        payload = json.dumps(body, separators=(",", ":")) if body is not None else ""
        last_exc: Exception | None = None
        resynced = False
        for attempt in range(4):
            headers = None
            if private:
                qs = "&".join(f"{k}={v}" for k, v in params.items()) if method == "GET" else payload
                headers = self._headers(qs)
            try:
                if method == "GET":
                    r = await self._client.get(path, params=params, headers=headers)
                else:
                    r = await self._client.post(path, content=payload, headers=headers)
            except (httpx.TransportError, httpx.TimeoutException) as e:
                last_exc = e
                await asyncio.sleep(0.5 * 2**attempt)
                continue
            if r.status_code in RETRY_STATUS:
                last_exc = BybitError(path, r.status_code, "http retry")
                await asyncio.sleep(0.5 * 2**attempt)
                continue
            r.raise_for_status()
            data = r.json()
            code = int(data.get("retCode", -1))
            if code == 0:
                return data.get("result", {})
            if code in TIMESTAMP_ERRORS and not resynced:
                resynced = True
                await self.sync_time()
                continue
            raise BybitError(path, code, str(data.get("retMsg")))
        raise BybitError(path, -1, f"gave up after retries: {last_exc}")

    async def _get(self, path: str, params: dict, private: bool = False) -> dict:
        return await self._send("GET", path, params=params, private=private)

    async def _post(self, path: str, body: dict) -> dict:
        return await self._send("POST", path, body=body, private=True)

    # ---------- public ----------
    async def klines(self, symbol: str, interval: str, limit: int = 1000, end: int | None = None) -> list[list[float]]:
        """Returns oldest-first rows [start_ms, o, h, l, c, v]."""
        res = await self._get(
            "/v5/market/kline",
            {"category": "linear", "symbol": symbol, "interval": interval, "limit": limit, "end": end},
        )
        rows = [[int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5])] for r in res["list"]]
        rows.sort(key=lambda r: r[0])
        return rows

    async def klines_history(self, symbol: str, interval: str, total: int) -> list[list[float]]:
        out: list[list[float]] = []
        end = None
        while len(out) < total:
            batch = await self.klines(symbol, interval, min(1000, total - len(out)), end)
            if not batch:
                break
            out = batch + out
            end = batch[0][0] - 1
            if len(batch) < 1000:
                break
        return out

    async def ticker(self, symbol: str) -> dict:
        res = await self._get("/v5/market/tickers", {"category": "linear", "symbol": symbol})
        return res["list"][0]

    async def orderbook(self, symbol: str, limit: int = 50) -> dict:
        return await self._get("/v5/market/orderbook", {"category": "linear", "symbol": symbol, "limit": limit})

    async def instrument(self, symbol: str) -> dict:
        """Lot/price filters the engine must respect: qty_step, min_qty, max_qty, tick, min_notional."""
        res = await self._get("/v5/market/instruments-info", {"category": "linear", "symbol": symbol})
        info = res["list"][0]
        lot = info.get("lotSizeFilter", {})
        return {
            "qty_step": float(lot.get("qtyStep", 0.001)),
            "min_qty": float(lot.get("minOrderQty", 0.001)),
            "max_qty": float(lot.get("maxMktOrderQty", lot.get("maxOrderQty", 100))),
            "min_notional": float(lot.get("minNotionalValue", 5)),
            "tick": float(info.get("priceFilter", {}).get("tickSize", 0.1)),
            "raw": info,
        }

    # ---------- private ----------
    async def wallet_balance(self) -> dict:
        res = await self._get("/v5/account/wallet-balance", {"accountType": "UNIFIED"}, private=True)
        return res["list"][0]

    async def set_leverage(self, symbol: str, leverage: float) -> dict:
        lev = f"{leverage:g}"
        try:
            return await self._post(
                "/v5/position/set-leverage",
                {"category": "linear", "symbol": symbol, "buyLeverage": lev, "sellLeverage": lev},
            )
        except BybitError as e:
            if e.code == 110043:  # leverage not modified
                return {}
            raise

    async def market_order(
        self, symbol: str, side: str, qty: float, qty_step: float = 0.001, reduce_only: bool = False,
        take_profit: float | None = None, stop_loss: float | None = None, tick: float = 0.1, link_id: str | None = None,
    ) -> dict:
        body: dict[str, Any] = {
            "category": "linear", "symbol": symbol, "side": side, "orderType": "Market",
            "qty": fmt_step(qty, qty_step), "timeInForce": "IOC", "reduceOnly": reduce_only, "positionIdx": 0,
        }
        if link_id:
            body["orderLinkId"] = link_id
        if take_profit:
            body["takeProfit"] = fmt_step(take_profit, tick)
        if stop_loss:
            body["stopLoss"] = fmt_step(stop_loss, tick)
        return await self._post("/v5/order/create", body)

    async def cancel_order(self, symbol: str, order_id: str) -> dict:
        return await self._post("/v5/order/cancel", {"category": "linear", "symbol": symbol, "orderId": order_id})

    async def positions(self, symbol: str) -> list[dict]:
        res = await self._get("/v5/position/list", {"category": "linear", "symbol": symbol}, private=True)
        return res["list"]

    async def order_status(self, symbol: str, order_id: str) -> dict | None:
        res = await self._get("/v5/order/realtime", {"category": "linear", "symbol": symbol, "orderId": order_id}, private=True)
        lst = res.get("list") or []
        if lst:
            return lst[0]
        res = await self._get("/v5/order/history", {"category": "linear", "symbol": symbol, "orderId": order_id}, private=True)
        lst = res.get("list") or []
        return lst[0] if lst else None


class BybitPublicWS:
    """Public stream with auto-reconnect, a 20 s heartbeat and a 45 s silence watchdog."""

    SILENCE_LIMIT = 45.0

    def __init__(
        self, topics: list[str], on_message: Callable[[dict], Awaitable[None] | None],
        on_status: Callable[[bool], None] | None = None, testnet: bool = False,
    ):
        self.url = TESTNET_WS if testnet else MAINNET_WS
        self.topics = topics
        self.on_message = on_message
        self.on_status = on_status
        self.connected = False
        self.last_msg = 0.0
        self.reconnects = 0
        self._stop = False

    async def run(self):
        backoff = 1.0
        while not self._stop:
            try:
                async with websockets.connect(self.url, ping_interval=None, max_size=2**22, ssl=SSL_CTX, open_timeout=15) as ws:
                    await ws.send(json.dumps({"op": "subscribe", "args": self.topics}))
                    self.connected = True
                    self.last_msg = time.time()
                    if self.on_status:
                        self.on_status(True)
                    backoff = 1.0
                    ping_task = asyncio.create_task(self._heartbeat(ws))
                    try:
                        async for raw in ws:
                            self.last_msg = time.time()
                            try:
                                msg = json.loads(raw)
                            except ValueError:
                                continue
                            if "topic" not in msg:
                                continue
                            try:
                                res = self.on_message(msg)
                                if asyncio.iscoroutine(res):
                                    await res
                            except Exception:  # a handler bug must not tear the stream down
                                log.exception("ws handler failed")
                    finally:
                        ping_task.cancel()
            except asyncio.CancelledError:
                raise
            except Exception as e:  # any transport failure: reconnect
                log.warning("ws connection lost: %s", e)
            self.connected = False
            if self.on_status:
                self.on_status(False)
            if self._stop:
                break
            self.reconnects += 1
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30.0)

    async def _heartbeat(self, ws):
        while True:
            await asyncio.sleep(20)
            try:
                await ws.send(json.dumps({"op": "ping"}))
            except Exception:
                return
            if time.time() - self.last_msg > self.SILENCE_LIMIT:
                log.warning("ws silent for %.0fs, forcing reconnect", time.time() - self.last_msg)
                try:
                    await ws.close()
                except Exception:
                    pass
                return

    def stop(self):
        self._stop = True
