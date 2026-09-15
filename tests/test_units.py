"""Pure functions: indicators, model, sizing, lot maths, analog matcher, paper broker, storage, settings."""
from __future__ import annotations

import math
import sqlite3

import pytest

from backend.analog import AnalogMatcher, dtw, zscore
from backend.broker import PaperBroker
from backend.bybit import fmt_step, round_step
from backend.config import RiskLimits, Settings, validate_risk
from backend.indicators import atr, ema, rsi, session_vwap, volume_z, zbands
from backend.model import Features, book_fair, edge, kelly, prior
from backend.storage import Storage
from tests.conftest import make_candles


# ---------------- indicators ----------------
def test_ema_tracks_and_has_same_length():
    xs = [float(i) for i in range(50)]
    e = ema(xs, 9)
    assert len(e) == 50 and e[-1] < xs[-1] and e[-1] > xs[-10]


def test_rsi_is_bounded_and_neutral_on_flat():
    assert rsi([100.0] * 40) == 50.0 or rsi([100.0] * 40) == 100.0  # flat: no losses
    up = [100 + i for i in range(40)]
    assert 90 < rsi(up) <= 100
    down = [100 - i for i in range(40)]
    assert 0 <= rsi(down) < 10


def test_session_vwap_resets_at_utc_midnight():
    day = 86_400_000
    rows = [[day * 10 + i * 60_000, 100, 101, 99, 100, 1] for i in range(5)]
    rows += [[day * 11 + i * 60_000, 200, 201, 199, 200, 1] for i in range(5)]
    v = session_vwap(rows)
    assert abs(v[4] - 100) < 1e-6 and abs(v[5] - 200) < 1e-6


def test_zbands_and_atr_and_volume_z():
    closes = [100.0] * 30
    _, up, lo, z = zbands(closes, 20, 2)
    assert z[-1] == 0 and up[-1] == lo[-1] == 100
    rows = make_candles(60, 60_000)
    assert atr(rows, 14) > 0
    assert volume_z([1.0] * 60) == 0.0


# ---------------- lot maths ----------------
def test_round_step_and_fmt_step_have_no_float_drift():
    assert round_step(0.1234567, 0.001) == 0.123
    assert round_step(0.3 + 0.6, 0.1) == 0.9
    assert fmt_step(0.1, 0.001) == "0.100"
    assert fmt_step(77123.456, 0.1) == "77123.5"


# ---------------- model ----------------
def test_prior_and_book_are_probabilities_and_edge_is_consistent():
    f = Features(rsi=30, ema_gap_pct=0.3, vwap_dist_pct=0.2, z=-1, vol_z=1, last_body_pct=0.1, analog_signal=0.5, imbalance=0.2)
    p, contrib = prior(f)
    assert 0.05 <= p <= 0.95 and set(contrib) >= {"momentum", "analog", "flow"}
    b = book_fair(f)
    assert 0.1 <= b <= 0.9
    d, e = edge(0.7, 0.6)
    assert d == "UP" and abs(e - 10) < 1e-9
    d, e = edge(0.3, 0.6)
    assert d == "DOWN" and abs(e - 30) < 1e-9


def test_kelly_respects_caps_and_lot():
    r = RiskLimits()
    k = kelly(0.9, 10_000, 77_000, r, 0, 0.001)
    assert k["qty"] * 1000 == pytest.approx(round(k["qty"] * 1000))       # lot multiple
    assert k["notional"] <= 10_000 * r.max_leverage + 1e-6
    assert k["binding"] in ("kelly", "risk", "leverage")
    tiny = kelly(0.9, 5, 77_000, r, 0, 0.001)
    assert tiny["qty"] == 0
    cut = kelly(0.9, 10_000, 77_000, r, 5, 0.001)
    assert cut["notional"] < k["notional"]                                  # drawdown notches shrink size
    assert kelly(0.35, 10_000, 77_000, r, 0)["qty"] == 0                    # below break-even at 1.5:1 payoff, no size


# ---------------- analog ----------------
def test_analog_matcher_finds_neighbours_on_periodic_data():
    closes = [1000 + 20 * math.sin(i / 9) + 0.01 * i for i in range(1200)]
    m = AnalogMatcher(window=48, horizon=24, k=7)
    out = m.match(closes)
    assert out["ready"] and out["up"] + out["down"] == 7 and len(out["paths"]) == 7 and len(out["paths"][0]) == 24
    assert 0 <= out["match"] <= 1 and out["scanned"] > 0
    assert not m.match(closes[:100])["ready"]
    assert dtw(zscore(closes[:48]), zscore(closes[:48])) == 0


# ---------------- paper broker ----------------
async def test_paper_broker_pnl_includes_fees_and_slippage():
    b = PaperBroker(cash=10_000, fee_rate=0.001, slippage_bps=10)
    pos = await b.open("t1", "UP", 0.1, 70_000, 69_000, 71_000)
    assert pos.entry == pytest.approx(70_070)              # +10 bps slippage on a buy
    fill, pnl = await b.close(pos, 71_000)
    assert fill == pytest.approx(70_929)                    # -10 bps on the sell
    gross = (70_929 - 70_070) * 0.1
    fees = 70_070 * 0.1 * 0.001 + 70_929 * 0.1 * 0.001
    assert pnl == pytest.approx(gross - fees, rel=1e-6)
    assert b.cash == pytest.approx(10_000 + gross - fees, rel=1e-6)
    short = await b.open("t2", "DOWN", 0.1, 70_000, 71_000, 69_000)
    assert short.entry == pytest.approx(69_930)
    _, pnl2 = await b.close(short, 71_000)
    assert pnl2 < 0


# ---------------- storage ----------------
def test_storage_roundtrip_migration_and_prune(tmp_path):
    path = tmp_path / "old.sqlite"
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE log (ts REAL, agent TEXT, action TEXT, amount TEXT, text TEXT)")
    db.execute("INSERT INTO log VALUES (1, 'core', 'SYSTEM', NULL, 'legacy line')")
    db.commit()
    db.close()
    st = Storage(path)                                       # migrates the old schema
    st.add_log({"ts": 2, "agent": "edge", "action": "EDGE", "amount": "+1¢", "text": "x", "key": "edge_ok", "p": {"dir": "UP"}})
    rows = st.load_log(10)
    assert rows[0]["text"] == "legacy line" and "key" not in rows[0]
    assert rows[1]["key"] == "edge_ok" and rows[1]["p"] == {"dir": "UP"}
    st.save_ticket({"id": "a", "created": 1, "status": "open", "position": {"x": 1}})
    st.save_ticket({"id": "b", "created": 2, "status": "settled"})
    assert [t["id"] for t in st.load_open_tickets()] == ["a"]
    for i in range(50):
        st.add_equity(100 + i, 1.0)
    n = st.prune(keep_log=1, keep_equity=10, keep_tickets=1)
    assert n["equity"] == 40 and len(st.load_equity(100)) == 10
    st.set("k", {"v": 1})
    assert st.get("k") == {"v": 1}
    st.close()


# ---------------- settings ----------------
def test_settings_apply_is_validated_and_atomic():
    s = Settings()
    s.api_key = s.api_secret = ""
    with pytest.raises(ValueError):
        s.apply({"mode": "live"})
    with pytest.raises(ValueError):
        s.apply({"risk": {"max_leverage": 50}})
    with pytest.raises(ValueError):
        s.apply({"risk": {"stop_loss_pct": 0.02, "take_profit_pct": 0.001}})
    assert s.risk.max_leverage == 3.0                       # untouched after the failed patch
    changed = s.apply({"risk": {"min_edge_cents": 2.5, "max_open_tickets": "3"}, "paused": 1})
    assert "risk.min_edge_cents" in changed and s.risk.max_open_tickets == 3 and s.paused is True
    again = Settings.load()
    assert again.risk.min_edge_cents == 2.5 and again.paused is True
    validate_risk(RiskLimits())
    assert "api_key" not in s.public() and s.public()["token_required"] is False
