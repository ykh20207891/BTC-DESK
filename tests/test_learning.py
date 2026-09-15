"""The calibration layer: learns from resolved predictions, reports in shadow mode, drives the desk only when allowed."""
from __future__ import annotations

import random
import time

from backend.learner import INIT_W, TERMS, Learner
from tests.conftest import run_pipeline


def test_learner_moves_weights_toward_the_signal_that_actually_predicts():
    rng = random.Random(3)
    lr = Learner(lr=0.1, l2=0.001)
    for _ in range(600):
        contrib = {t: rng.gauss(0, 0.6) for t in TERMS}
        went_up = contrib["analog"] + 0.3 * rng.gauss(0, 1) > 0          # only "analog" carries information
        p_learn = lr.predict(contrib)
        lr.resolve(contrib, 0.5, p_learn, went_up)
    s = lr.summary()
    assert s["samples"] == 600
    assert lr.w["analog"] > INIT_W + 0.5                                   # trusted more
    assert all(lr.w[t] < INIT_W + 0.3 for t in TERMS if t != "analog")       # noise terms never gain trust
    assert s["brier_learn"] < s["brier_model"] and s["hit_learn"] > 0.6     # and it beats the flat 50¢ baseline
    clone = Learner(state=lr.dump())
    assert clone.predict({"analog": 1.0}) == lr.predict({"analog": 1.0})


async def test_predictions_are_recorded_resolved_and_only_drive_the_desk_when_active(engine, settings, store, rest):
    e = engine
    assert e.predictions and all(p["outcome"] is None for p in e.predictions.values())
    pid, pred = next(iter(e.predictions.items()))
    assert 0 < pred["p_model"] < 1 and pred["price"] > 0 and store.load_predictions(unresolved_only=True)
    # shadow: the desk still trades on the hand-set model
    assert e.model["p_up"] == e.model["p_hand"] and e.learning_state()["mode"] == "shadow" and not e.learning_state()["active"]
    # resolve: horizon passes, price moved up
    pred["horizon_ts"] = int(time.time() * 1000) - 1
    rest.price = pred["price"] * 1.01
    e.ticker = await rest.ticker("BTCUSDT")
    e._resolve_predictions()
    assert pid not in e.predictions and e.learner.samples == 1 and e.log[-1]["key"] == "learn"
    saved = next(p for p in store.load_predictions() if p["id"] == pid)
    assert saved["outcome"] == 1 and saved["resolved"] and store.get("learner")["samples"] == 1
    # active mode needs min_samples before it takes over
    settings.apply({"learning": {"mode": "active", "min_samples": 20}})
    e.recompute(full=False)
    assert not e.learning_active() and e.model["p_up"] == e.model["p_hand"]
    e.learner.samples = 20
    e.recompute(full=False)
    assert e.learning_active() and e.model["p_up"] == e.model["p_learn"]
    # a new ticket records a fresh prediction only once per bar
    n = len(e.predictions)
    await run_pipeline(e)
    assert len(e.predictions) <= n + 1
    # risk limits are untouched by anything the learner does
    assert settings.risk.max_leverage == 3.0 and settings.risk.risk_per_ticket == 0.02


def test_learning_settings_are_validated(settings):
    import pytest
    with pytest.raises(ValueError):
        settings.apply({"learning": {"mode": "yolo"}})
    with pytest.raises(ValueError):
        settings.apply({"learning": {"lr": 5}})
    settings.apply({"learning": {"min_samples": 50, "lr": 0.02}})
    assert settings.learning.min_samples == 50 and settings.learning.lr == 0.02
