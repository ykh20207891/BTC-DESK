"""Pure-Python indicators over candle rows [ts, o, h, l, c, v]."""
from __future__ import annotations

import math


def _mean(w: list[float]) -> float:
    return sum(w) / len(w) if w else 0.0


def _std(w: list[float], m: float | None = None) -> float:
    if len(w) < 2:
        return 0.0
    m = _mean(w) if m is None else m
    return math.sqrt(sum((x - m) ** 2 for x in w) / len(w))


def ema(values: list[float], n: int) -> list[float]:
    if not values:
        return []
    k = 2 / (n + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append(v * k + out[-1] * (1 - k))
    return out


def rsi(closes: list[float], n: int = 14) -> float:
    if len(closes) < n + 1:
        return 50.0
    gains = losses = 0.0
    for i in range(1, n + 1):
        d = closes[i] - closes[i - 1]
        gains += max(d, 0)
        losses += max(-d, 0)
    ag, al = gains / n, losses / n
    for i in range(n + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        ag = (ag * (n - 1) + max(d, 0)) / n
        al = (al * (n - 1) + max(-d, 0)) / n
    if al == 0:
        return 100.0
    return 100 - 100 / (1 + ag / al)


def rsi_series(closes: list[float], n: int = 14) -> list[float]:
    """Wilder RSI as a series (single pass)."""
    out: list[float] = []
    if len(closes) < n + 1:
        return [50.0] * len(closes)
    ag = al = 0.0
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        g, l = max(d, 0), max(-d, 0)
        if i <= n:
            ag += g / n
            al += l / n
            out.append(50.0)
            continue
        ag = (ag * (n - 1) + g) / n
        al = (al * (n - 1) + l) / n
        out.append(100.0 if al == 0 else 100 - 100 / (1 + ag / al))
    return [50.0] + out


def session_vwap(candles: list[list[float]]) -> list[float]:
    """VWAP restarting at each UTC midnight."""
    out: list[float] = []
    pv = vol = 0.0
    day = None
    for ts, o, h, l, c, v in candles:
        d = int(ts // 86_400_000)
        if d != day:
            day, pv, vol = d, 0.0, 0.0
        tp = (h + l + c) / 3
        pv += tp * v
        vol += v
        out.append(pv / vol if vol else c)
    return out


def zbands(closes: list[float], n: int = 20, k: float = 2.0):
    """Returns (mid, upper, lower, z) series."""
    mid, up, lo, z = [], [], [], []
    for i in range(len(closes)):
        w = closes[max(0, i - n + 1): i + 1]
        m = _mean(w)
        sd = _std(w, m)
        mid.append(m)
        up.append(m + k * sd)
        lo.append(m - k * sd)
        z.append((closes[i] - m) / sd if sd else 0.0)
    return mid, up, lo, z


def atr(candles: list[list[float]], n: int = 14) -> float:
    if len(candles) < 2:
        return 0.0
    trs = []
    for i in range(1, len(candles)):
        _, o, h, l, c, v = candles[i]
        pc = candles[i - 1][4]
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    w = trs[-n:]
    return sum(w) / len(w)


def volume_z(vols: list[float], n: int = 50) -> float:
    w = vols[-n:]
    if len(w) < 5:
        return 0.0
    m = _mean(w)
    sd = _std(w, m)
    return (vols[-1] - m) / sd if sd else 0.0


def slope_pct(series: list[float], n: int = 5) -> float:
    if len(series) < n + 1 or series[-n - 1] == 0:
        return 0.0
    return (series[-1] / series[-n - 1] - 1) * 100


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))
