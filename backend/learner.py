"""Calibration layer: learns how much to trust each desk signal from what actually happened next.

Every 15 minutes the desk makes a prediction (P(UP) from the hand-set PRIOR). The learner keeps the same
seven signal terms as inputs and fits its own weights online (logistic regression, SGD, L2 pull toward the
hand-set weights so a handful of samples cannot swing it). Each prediction is resolved one horizon later
against the real price, and both models are scored (Brier, hit rate) so the operator can compare them.

Shadow mode: the learner only reports. Active mode: its P(UP) drives the desk once `min_samples` is reached.
Risk limits are never an input or an output of this layer.
"""
from __future__ import annotations

import math
import time

TERMS = ["momentum", "mean_rev", "rsi", "vwap", "volume", "analog", "flow"]
INIT_W = 0.7          # the hand-set PRIOR applies this shrink to the sum of all terms
BRIER_EWMA = 0.02     # ~50-sample memory for the running scores


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-max(-30, min(30, x))))


class Learner:
    def __init__(self, lr: float = 0.05, l2: float = 0.01, state: dict | None = None):
        self.lr = lr
        self.l2 = l2
        self.w = {t: INIT_W for t in TERMS}
        self.b = 0.0
        self.samples = 0
        self.brier = {"model": 0.25, "learn": 0.25}
        self.hits = {"model": 0.5, "learn": 0.5}
        self.wins = {"model": 0, "learn": 0}
        if state:
            self.load(state)

    # ---- persistence ----
    def dump(self) -> dict:
        return {"w": self.w, "b": self.b, "samples": self.samples, "brier": self.brier, "hits": self.hits, "wins": self.wins}

    def load(self, st: dict) -> None:
        self.w.update({k: float(v) for k, v in (st.get("w") or {}).items() if k in self.w})
        self.b = float(st.get("b", 0.0))
        self.samples = int(st.get("samples", 0))
        self.brier.update(st.get("brier") or {})
        self.hits.update(st.get("hits") or {})
        self.wins.update(st.get("wins") or {})

    # ---- inference ----
    def predict(self, contrib: dict) -> float:
        z = self.b + sum(self.w[t] * float(contrib.get(t, 0.0)) for t in TERMS)
        return max(0.05, min(0.95, sigmoid(z)))

    # ---- learning ----
    def resolve(self, contrib: dict, p_model: float, p_learn: float, went_up: bool) -> dict:
        """Score both models on one resolved prediction, then take one SGD step on the learner."""
        y = 1.0 if went_up else 0.0
        for name, p in (("model", p_model), ("learn", p_learn)):
            self.brier[name] += BRIER_EWMA * ((p - y) ** 2 - self.brier[name])
            hit = 1.0 if (p >= 0.5) == went_up else 0.0
            self.hits[name] += BRIER_EWMA * (hit - self.hits[name])
            self.wins[name] += int(hit)
        err = p_learn - y
        for t in TERMS:
            x = float(contrib.get(t, 0.0))
            grad = err * x + self.l2 * (self.w[t] - INIT_W)
            self.w[t] -= self.lr * grad
        self.b -= self.lr * (err + self.l2 * self.b)
        self.samples += 1
        return {"y": y, "err": round(err, 4)}

    def summary(self) -> dict:
        return {
            "samples": self.samples,
            "weights": {t: round(w, 3) for t, w in self.w.items()},
            "bias": round(self.b, 3),
            "brier_model": round(self.brier["model"], 4), "brier_learn": round(self.brier["learn"], 4),
            "hit_model": round(self.hits["model"], 3), "hit_learn": round(self.hits["learn"], 3),
            "wins": dict(self.wins),
        }


def new_prediction(bar_ts: int, horizon_ts: int, price: float, contrib: dict, p_model: float, p_learn: float) -> dict:
    return {
        "id": f"p{bar_ts}", "ts": time.time(), "bar_ts": bar_ts, "horizon_ts": horizon_ts, "price": price,
        "contrib": {t: round(float(contrib.get(t, 0.0)), 4) for t in TERMS},
        "p_model": round(p_model, 4), "p_learn": round(p_learn, 4), "resolved": None, "outcome": None,
    }
