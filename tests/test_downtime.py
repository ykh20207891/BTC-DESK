"""What happens after the engine was down: positions settle at what really happened, learning never guesses."""
from __future__ import annotations

import time

from backend.broker import Position
from backend.engine import MIN_MS
from tests.conftest import run_pipeline

NOW_MIN = (int(time.time() * 1000) // MIN_MS) * MIN_MS


def flat_bars(e, start_ms: int, end_ms: int, price: float):
    """Replace the 1m history with flat bars at `price` from start to end (exclusive)."""
    e.candles_1m.clear()
    for ts in range(start_ms, end_ms, MIN_MS):
        e.candles_1m.append([ts, price, price + 1, price - 1, price, 1.0])


def open_paper(e, tid: str, side: str, entry: float, opened_ms: int, horizon_ms: int):
    sl = entry * (0.994 if side == "UP" else 1.006)
    tp = entry * (1.009 if side == "UP" else 0.991)
    pos = Position(tid, side, 0.005, entry, 0.2, opened_ms / 1000, sl, tp)
    e.positions[tid] = pos
    e.tickets[tid] = {"id": tid, "created": opened_ms / 1000, "status": "open", "direction": side, "qty": 0.005,
                      "edge": 3.0, "horizon_ts": horizon_ms, "position": pos.dict(), "stage": 5}
    return pos


async def test_stop_hit_while_down_settles_at_the_stop(engine):
    e = engine
    e.positions.clear()
    opened, horizon = NOW_MIN - 60 * MIN_MS, NOW_MIN - 30 * MIN_MS
    flat_bars(e, opened - 10 * MIN_MS, NOW_MIN, 77_000)
    pos = open_paper(e, "dn1", "UP", 77_000, opened, horizon)
    e.candles_1m[15][3] = pos.sl - 50                         # the low pierced the stop 5 minutes after entry
    await e._replay_downtime()
    t = e.tickets["dn1"]
    assert t["status"] == "settled" and t["reason"] == "stop" and t["exit"] < pos.entry and "dn1" not in e.positions


async def test_horizon_missed_while_down_settles_at_the_horizon_close(engine):
    e = engine
    e.positions.clear()
    opened, horizon = NOW_MIN - 60 * MIN_MS, NOW_MIN - 30 * MIN_MS
    flat_bars(e, opened - 10 * MIN_MS, NOW_MIN, 77_000)
    for row in e.candles_1m:                                  # after the horizon the price ran far up
        if row[0] >= horizon:
            row[1:5] = [80_000, 80_001, 79_999, 80_000]
    open_paper(e, "dn2", "DOWN", 77_000, opened, horizon)
    await e._closer_check()                                   # the live path: the horizon is 30 minutes late
    t = e.tickets["dn2"]
    assert t["status"] == "settled" and t["reason"] == "horizon" and abs(t["exit"] - 77_000) < 50  # not 80,000


async def test_position_older_than_history_is_booked_stale_not_replayed(engine):
    e = engine
    e.positions.clear()
    opened, horizon = NOW_MIN - 20 * 24 * 60 * MIN_MS, NOW_MIN - 20 * 24 * 60 * MIN_MS + 15 * MIN_MS
    flat_bars(e, NOW_MIN - 50 * MIN_MS, NOW_MIN, 77_000)
    open_paper(e, "dn3", "UP", 70_000, opened, horizon)
    await e._replay_downtime()
    assert e.tickets["dn3"]["status"] == "settled" and e.tickets["dn3"]["reason"] == "stale"


async def test_open_position_inside_its_horizon_is_kept(engine):
    e = engine
    e.positions.clear()
    opened, horizon = NOW_MIN - 5 * MIN_MS, NOW_MIN + 10 * MIN_MS
    flat_bars(e, opened - 10 * MIN_MS, NOW_MIN, 77_000)
    open_paper(e, "dn4", "UP", 77_000, opened, horizon)
    await e._replay_downtime()
    assert "dn4" in e.positions and e.tickets["dn4"]["status"] == "open"


async def test_restarts_inside_one_bar_cut_at_most_one_automatic_ticket(engine):
    e = engine
    n = len(e.tickets)                                        # the fixture's boot scan already cut this bar's ticket
    await run_pipeline(e, "boot scan")
    await run_pipeline(e, "boot scan")
    assert len(e.tickets) == n and e.log[-1]["key"] == "hold_bar"
    await run_pipeline(e, "manual scan")                      # the operator can still force one
    assert len(e.tickets) == n + 1


async def test_learning_grades_on_the_horizon_bar_and_drops_what_it_cannot_grade(engine):
    e = engine
    e.predictions.clear()
    flat_bars(e, NOW_MIN - 120 * MIN_MS, NOW_MIN, 77_000)
    for row in e.candles_1m:                                  # price fell after the late horizon below
        if row[0] >= NOW_MIN - 30 * MIN_MS:
            row[1:5] = [76_000, 76_001, 75_999, 76_000]
    late = NOW_MIN - 60 * MIN_MS                              # graded on the bar that closed at -60m: flat, not the later drop
    gone = NOW_MIN - 20 * 24 * 60 * MIN_MS                    # far outside the bar history
    for pid, h in (("pL", late), ("pG", gone)):
        e.predictions[pid] = {"id": pid, "ts": time.time(), "bar_ts": h - 15 * MIN_MS, "horizon_ts": h, "price": 76_990.0,
                              "contrib": {}, "p_model": 0.6, "p_learn": 0.6, "resolved": None, "outcome": None}
    n0 = e.learner.samples
    e._resolve_predictions()
    assert not e.predictions
    assert e.learner.samples == n0 + 1                        # only the gradable one trained
    assert any(x.get("key") == "learn_stale" for x in e.log)
    saved = {p["id"]: p for p in e.store.load_predictions()}
    assert saved["pL"]["outcome"] == 1 and saved["pL"]["horizon_price"] == 77_000   # 77,000 > 76,990, i.e. UP at the horizon
    assert saved["pG"]["outcome"] is None and saved["pG"]["stale"] is True
