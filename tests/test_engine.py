"""The desk end to end on a synthetic exchange: booting, routing, settling, guarding, surviving restarts."""
from __future__ import annotations

import asyncio
import time

import pytest

from backend.broker import LiveBroker
from backend.engine import BAR_MS, Engine
from tests.conftest import FakeREST, run_pipeline, wait_pipeline


async def test_boot_loads_history_prices_model_and_cuts_a_ticket(engine):
    e = engine
    assert len(e.candles_1m) == 3000 and len(e.candles_15m) == 400
    assert e.online and e.model["p_up"] is not None and e.analog_state["ready"]
    assert e._last_bar_ts == e.candles_15m[-2][0]              # last CONFIRMED bar, not the forming one
    open_t = [t for t in e.tickets.values() if t["status"] == "open"]
    assert len(open_t) == 1 and open_t[0]["qty"] >= 0.001 and open_t[0]["qty"] * e.mark_price() >= 5
    assert open_t[0]["id"] in e.positions
    assert e.health()["ok"] is True


async def test_forming_bar_close_triggers_pipeline_and_a_second_close_queues(engine, rest):
    e = engine
    before = len(e.tickets)
    forming = e.candles_15m[-1][0]
    e.on_ws({"topic": "kline.15.BTCUSDT", "data": [{"start": forming, "end": forming + BAR_MS, "open": "1", "close": "1", "high": "1", "low": "1", "volume": "1", "confirm": True}]})
    assert e._pipeline_task is not None
    # a second confirm while the first ticket routes is remembered, not dropped
    e.on_ws({"topic": "kline.15.BTCUSDT", "data": [{"start": forming + BAR_MS, "end": forming + 2 * BAR_MS, "open": "1", "close": "1", "high": "1", "low": "1", "volume": "1", "confirm": True}]})
    await wait_pipeline(e)
    assert len(e.tickets) >= before + 2
    assert e._last_bar_ts == forming + BAR_MS


async def test_take_profit_stop_and_horizon_settle(engine, rest):
    e = engine
    tid, pos = next(iter(e.positions.items()))
    rest.price = pos.tp * (1.001 if pos.side == "UP" else 0.999)
    e.ticker = await rest.ticker("BTCUSDT")
    await e._closer_check()
    t = e.tickets[tid]
    assert t["status"] == "settled" and t["reason"] == "target" and t["pnl"] > 0 and tid not in e.positions
    st = e.stats()
    assert st["n"] == 1 and st["wins"] == 1 and st["last_dir"] == t["direction"]
    # next ticket: horizon expiry
    await run_pipeline(e)
    tid2, pos2 = next(iter(e.positions.items()))
    e.tickets[tid2]["horizon_ts"] = int(time.time() * 1000) - 1
    rest.price = pos2.entry
    e.ticker = await rest.ticker("BTCUSDT")
    await e._closer_check()
    assert e.tickets[tid2]["status"] == "settled" and e.tickets[tid2]["reason"] == "horizon"


async def test_drawdown_guard_halts_persists_and_survives_restart(engine, settings, rest, store):
    e = engine
    e.day_peak = e.equity / (1 - settings.risk.daily_drawdown_guard) * 1.01
    await e._mark_book()
    assert e.halted is True and store.get("day_state")["halted"] is True
    n = len(e.tickets)
    await run_pipeline(e)
    assert len(e.tickets) == n and e.log[-1]["key"] == "hold_guard"
    await e.stop()
    e2 = Engine(settings, store=store, rest=FakeREST())
    assert e2.halted is True and e2.day_peak == pytest.approx(e.day_peak)
    assert set(e2.positions) == set(e.positions)          # open paper position restored too


async def test_approvals_only_on_deck_reject_approve_and_expiry(engine, settings):
    e = engine
    for tid in list(e.positions):
        e.tickets[tid]["horizon_ts"] = 0
    await e._closer_check()
    settings.approvals_only = True
    await run_pipeline(e)
    deck = [t for t in e.tickets.values() if t["status"] == "on_deck"]
    assert len(deck) == 1 and e.desks["taker"]["state"] == "on_deck"
    assert e.reject(deck[0]["id"]) == "ok" and e.tickets[deck[0]["id"]]["status"] == "rejected"
    await run_pipeline(e)
    deck = next(t for t in e.tickets.values() if t["status"] == "on_deck")
    assert await e.approve(deck["id"]) == "ok" and deck["status"] == "open"
    await run_pipeline(e)
    deck = next(t for t in e.tickets.values() if t["status"] == "on_deck")
    deck["horizon_ts"] = 0
    e._sweep_stale()
    assert deck["status"] == "expired" and await e.approve(deck["id"]) != "ok"


async def test_pipeline_holds_when_paused_at_cap_or_offline(engine, settings):
    e = engine
    settings.paused = True
    await run_pipeline(e)
    assert e.log[-1]["key"] == "hold_paused"
    settings.paused = False
    settings.risk.max_open_tickets = 1
    await run_pipeline(e)
    assert e.log[-1]["key"] == "hold_cap"
    settings.risk.max_open_tickets = 5
    e.online = False
    await run_pipeline(e, "15m close")
    assert e.log[-1]["key"] == "hold_offline"


async def test_bad_stream_frame_is_contained_and_backfill_fires_missed_close(engine, rest):
    e = engine
    e.on_ws({"topic": "kline.1.BTCUSDT", "data": [{"broken": True}]})       # must not raise
    assert e.log[-1]["key"] == "err"
    # pretend a bar closed while we were disconnected: candles carry a newer confirmed bar
    forming = e.candles_15m[-1][0]
    e._merge_kline(e.candles_15m, [[forming + BAR_MS, 1, 1, 1, 1, 1]], raw=True)
    e._check_missed_close()
    assert e._last_bar_ts == forming
    e.on_ws_status(False)
    e.on_ws_status(True)                                                     # reconnect -> backfill task
    await asyncio.sleep(0.05)
    assert "klines:1" in rest.calls and any(x.get("key") == "backfill" for x in e.log)


async def test_sizing_respects_lot_min_notional_and_max(engine):
    e = engine
    k = e.size_ticket("UP", 0.9, e.mark_price())
    assert k["qty"] == round(k["qty"], 3) and k["qty"] * e.mark_price() >= e.min_notional
    e.min_notional = 1e9
    assert e.size_ticket("UP", 0.9, e.mark_price())["qty"] == 0
    e.min_notional = 5
    e.max_qty = 0.002
    assert e.size_ticket("UP", 0.9, e.mark_price())["qty"] <= 0.002


async def test_stale_routing_ticket_is_abandoned_and_memory_is_bounded(engine):
    e = engine
    e.tickets["zz"] = {"id": "zz", "created": time.time() - 3600, "status": "routing", "stage": 1, "horizon_ts": 0}
    e._sweep_stale()
    assert e.tickets["zz"]["status"] == "failed"
    for i in range(400):
        e.tickets[f"s{i}"] = {"id": f"s{i}", "created": i, "status": "settled", "pnl": 0.0, "settled": i, "direction": "UP", "edge": 1}
    e._last_prune = 0
    e._maintenance()
    assert len([t for t in e.tickets.values() if t["status"] == "settled"]) <= 300


# ---------------- live broker on the fake exchange ----------------
async def test_live_broker_fills_closes_with_exchange_size_and_refuses_hedge_mode(rest):
    b = LiveBroker(rest, "BTCUSDT", 3.0)
    pos = await b.open("t1", "UP", 0.01, 77_000, 76_500, 77_500)
    assert pos.qty == 0.01 and pos.entry == 77_000 and "leverage" in rest.calls
    rest.exchange_size = 0.008                                   # exchange holds less than we think
    await b.close(pos, 77_100)
    assert any(c.startswith("order:Sell:0.008:True") for c in rest.calls)
    rest.exchange_size = 0.0
    fill, _pnl = await b.close(pos, 77_100)                      # already flat: settle without an order
    assert fill == 77_100 and not any(c.startswith("order:Sell:0.0:True") for c in rest.calls)
    rest.hedge_mode = True
    b2 = LiveBroker(rest, "BTCUSDT", 3.0)
    with pytest.raises(RuntimeError, match="hedge"):
        await b2.open("t2", "UP", 0.01, 77_000, 76_500, 77_500)


async def test_live_broker_cancels_unfilled_orders(rest, monkeypatch):
    rest.fill_orders = False
    b = LiveBroker(rest, "BTCUSDT", 3.0)
    monkeypatch.setattr(asyncio, "sleep", lambda *_: _noop())
    with pytest.raises(RuntimeError, match="not filled"):
        await b.open("t1", "UP", 0.01, 77_000, 76_500, 77_500)
    assert "cancel" in rest.calls


async def _noop():
    return None
