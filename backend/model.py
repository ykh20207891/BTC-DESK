"""PRIOR (probability model), EDGE (model vs book), KELLY (sizing)."""
from __future__ import annotations

import math
from dataclasses import dataclass, asdict

from .config import RiskLimits
from .indicators import sigmoid


@dataclass
class Features:
    rsi: float = 50.0            # 15m RSI-14
    ema_gap_pct: float = 0.0     # 15m EMA9 / EMA21 - 1, in %
    vwap_dist_pct: float = 0.0   # (last - session VWAP) / VWAP, in %
    z: float = 0.0               # 15m z-band position
    vol_z: float = 0.0           # 1m volume z-score
    last_body_pct: float = 0.0   # last closed 15m candle body, in %
    mom_1h_pct: float = 0.0      # 1h price change, in %
    analog_signal: float = 0.0   # (up - down) / k from the analog matcher
    imbalance: float = 0.0       # (bid depth - ask depth) / total, top 50 levels
    funding: float = 0.0         # current funding rate
    atr_pct: float = 0.0         # 15m ATR / price, in %

    def dict(self) -> dict:
        return {k: round(v, 4) for k, v in asdict(self).items()}


def _sign(x: float) -> float:
    return 1.0 if x > 0 else (-1.0 if x < 0 else 0.0)


def prior(f: Features) -> tuple[float, dict]:
    """P(BTC closes the next 15m bar UP). Returns (p_up, contributions in logit units)."""
    c = {
        "momentum": 0.9 * math.tanh(f.ema_gap_pct / 0.15),
        "mean_rev": -0.5 * math.tanh(f.z / 2),
        "rsi": -0.6 * ((f.rsi - 50) / 50),
        "vwap": 0.4 * math.tanh(f.vwap_dist_pct / 0.3),
        "volume": 0.5 * math.tanh(f.vol_z / 2) * _sign(f.last_body_pct),
        "analog": 1.0 * f.analog_signal,
        "flow": 0.6 * math.tanh(f.imbalance * 3),
    }
    logit = 0.7 * sum(c.values())
    p = sigmoid(logit)
    p = max(0.05, min(0.95, p))
    return p, {k: round(v, 3) for k, v in c.items()}


def book_fair(f: Features) -> float:
    """What the market itself implies for P(UP): order-book pressure, 1h momentum, funding tilt."""
    x = f.imbalance * 1.5 + 0.4 * math.tanh(f.mom_1h_pct / 0.3) - f.funding * 40
    return max(0.1, min(0.9, 0.5 + 0.22 * math.tanh(x)))


def edge(p_model: float, p_market: float) -> tuple[str, float]:
    """Direction and edge in cents (percentage points of probability) for that direction."""
    if p_model >= 0.5:
        return "UP", (p_model - p_market) * 100
    return "DOWN", (p_market - p_model) * 100


def kelly(p_dir: float, equity: float, price: float, limits: RiskLimits, dd_notch: int, lot: float = 0.001) -> dict:
    b = limits.take_profit_pct / limits.stop_loss_pct if limits.stop_loss_pct else 1.0
    q = 1 - p_dir
    f_star = (b * p_dir - q) / b if b else 0.0
    f = max(0.0, f_star) * limits.kelly_fraction
    notional_kelly = f * equity * limits.max_leverage
    notional_risk = equity * limits.risk_per_ticket / limits.stop_loss_pct if limits.stop_loss_pct else 0.0
    notional_lev = equity * limits.max_leverage
    cap = min(notional_kelly, notional_risk, notional_lev)
    cut = max(0.0, 1 - dd_notch * 0.1)
    notional = cap * cut
    qty = math.floor(notional / price / lot) * lot if price > 0 else 0.0
    qty = round(qty, 3)
    binding = min(
        (("kelly", notional_kelly), ("risk", notional_risk), ("leverage", notional_lev)), key=lambda t: t[1]
    )[0]
    return {
        "f_star": round(f_star, 4), "f": round(f, 4), "notional": round(qty * price, 2), "qty": qty,
        "cap_kelly": round(notional_kelly, 2), "cap_risk": round(notional_risk, 2), "cap_lev": round(notional_lev, 2),
        "binding": binding, "cut": cut, "payoff": round(b, 2),
    }
