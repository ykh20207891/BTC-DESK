"""ANALOG MATCHER — k-NN over z-scored 1m close windows ("seen this before")."""
from __future__ import annotations

import math


def zscore(seq: list[float]) -> list[float]:
    n = len(seq)
    if n == 0:
        return []
    m = sum(seq) / n
    var = sum((x - m) ** 2 for x in seq) / n
    sd = math.sqrt(var)
    if sd == 0:
        return [0.0] * n
    return [(x - m) / sd for x in seq]


def dtw(a: list[float], b: list[float], band: int = 6) -> float:
    """Sakoe-Chiba banded DTW, cost normalised by path length."""
    n, m = len(a), len(b)
    inf = float("inf")
    prev = [inf] * (m + 1)
    prev[0] = 0.0
    for i in range(1, n + 1):
        cur = [inf] * (m + 1)
        lo, hi = max(1, i - band), min(m, i + band)
        for j in range(lo, hi + 1):
            cost = abs(a[i - 1] - b[j - 1])
            cur[j] = cost + min(prev[j], cur[j - 1], prev[j - 1])
        prev = cur
    return prev[m] / (n + m)


class AnalogMatcher:
    def __init__(self, window: int = 48, horizon: int = 24, k: int = 7):
        self.window = window
        self.horizon = horizon
        self.k = k
        self.scanned_total = 0

    def empty(self) -> dict:
        return {
            "match": 0.0, "up": 0, "down": 0, "median_bps": 0.0, "horizon": self.horizon,
            "dtw": 0.0, "scanned": self.scanned_total, "now": [], "paths": [], "median_path": [],
            "signal": 0.0, "ready": False,
        }

    def match(self, closes: list[float]) -> dict:
        W, H, K = self.window, self.horizon, self.k
        n = len(closes)
        if n < W + H + W + 10:
            return self.empty()
        now = zscore(closes[-W:])
        cands: list[tuple[float, int]] = []
        # candidate window = closes[e-W:e]; must leave room for the outcome and not overlap "now"
        last_e = n - H - W
        for e in range(W, last_e):
            w = closes[e - W:e]
            m = sum(w) / W
            var = sum((x - m) ** 2 for x in w) / W
            if var == 0:
                continue
            inv = 1 / math.sqrt(var)
            d = 0.0
            for i in range(W):
                t = (w[i] - m) * inv - now[i]
                d += t * t
            cands.append((d / W, e))
        self.scanned_total += len(cands)
        if not cands:
            return self.empty()
        cands.sort()
        # de-duplicate near-identical neighbours (windows within 6 bars of a better match)
        top: list[tuple[float, int]] = []
        for d, e in cands:
            if all(abs(e - te) > 6 for _, te in top):
                top.append((d, e))
            if len(top) >= K:
                break
        paths, outcomes = [], []
        for d, e in top:
            base = closes[e - 1]
            path = [(closes[e - 1 + i] / base - 1) * 100 for i in range(1, H + 1)]
            paths.append({"dist": d, "path": path, "prior": zscore(closes[e - W:e])})
            outcomes.append(path[-1])
        up = sum(1 for o in outcomes if o > 0)
        down = len(outcomes) - up
        srt = sorted(outcomes)
        mid = len(srt) // 2
        median = srt[mid] if len(srt) % 2 else (srt[mid - 1] + srt[mid]) / 2
        median_path = []
        for i in range(H):
            col = sorted(p["path"][i] for p in paths)
            median_path.append(col[len(col) // 2] if len(col) % 2 else (col[len(col) // 2 - 1] + col[len(col) // 2]) / 2)
        best = top[0]
        match_score = max(0.0, min(1.0, 1 - math.sqrt(best[0]) / 2))
        dtw_val = dtw(now, paths[0]["prior"])
        return {
            "match": round(match_score, 3), "up": up, "down": down,
            "median_bps": round(median * 100, 1), "horizon": H, "dtw": round(dtw_val, 3),
            "scanned": self.scanned_total, "now": [round(x, 3) for x in now],
            "paths": [[round(x, 4) for x in p["path"]] for p in paths],
            "priors": [[round(x, 3) for x in p["prior"]] for p in paths[:3]],
            "median_path": [round(x, 4) for x in median_path],
            "signal": (up - down) / len(outcomes), "ready": True,
        }
