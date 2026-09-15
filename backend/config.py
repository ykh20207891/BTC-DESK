"""Settings: env-backed secrets, JSON-backed operator-editable limits, validation."""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field, replace
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
SETTINGS_PATH = DATA_DIR / "settings.json"


@dataclass
class RiskLimits:
    max_leverage: float = 3.0            # notional cap = equity * max_leverage
    risk_per_ticket: float = 0.02        # fraction of equity lost if the stop is hit
    daily_drawdown_guard: float = 0.042  # halt new tickets past this intraday drawdown
    kelly_fraction: float = 0.5          # half-Kelly
    min_edge_cents: float = 1.0          # do not trade below this model-vs-book edge
    max_open_tickets: int = 5
    horizon_bars: int = 1                # settle after N 15m bars
    stop_loss_pct: float = 0.006         # 0.6 %
    take_profit_pct: float = 0.009       # 0.9 %


RISK_BOUNDS: dict[str, tuple[float, float]] = {
    "max_leverage": (1.0, 10.0),
    "risk_per_ticket": (0.001, 0.10),
    "daily_drawdown_guard": (0.005, 0.50),
    "kelly_fraction": (0.05, 1.0),
    "min_edge_cents": (-100.0, 50.0),
    "max_open_tickets": (1, 20),
    "horizon_bars": (1, 16),
    "stop_loss_pct": (0.001, 0.05),
    "take_profit_pct": (0.001, 0.10),
}


def validate_risk(r: RiskLimits) -> None:
    for k, (lo, hi) in RISK_BOUNDS.items():
        v = getattr(r, k)
        if not (lo <= v <= hi):
            raise ValueError(f"risk.{k}={v} outside [{lo}, {hi}]")
    if r.take_profit_pct < r.stop_loss_pct * 0.5:
        raise ValueError("take_profit_pct must be at least half of stop_loss_pct")


@dataclass
class Learning:
    enabled: bool = True          # record predictions and fit the calibration layer
    mode: str = "shadow"          # shadow = report only | active = drive the desk once min_samples is reached
    min_samples: int = 300
    lr: float = 0.05


EDITABLE = ("mode", "approvals_only", "paused", "risk", "learning")


@dataclass
class Settings:
    symbol: str = "BTCUSDT"
    api_key: str = field(default_factory=lambda: os.getenv("BYBIT_API_KEY", ""))
    api_secret: str = field(default_factory=lambda: os.getenv("BYBIT_API_SECRET", ""))
    testnet: bool = field(default_factory=lambda: os.getenv("BYBIT_TESTNET", "false").lower() == "true")
    mode: str = field(default_factory=lambda: os.getenv("TRADING_MODE", "paper"))  # paper | live
    approvals_only: bool = False
    paused: bool = False
    seed_equity: float = field(default_factory=lambda: float(os.getenv("PAPER_SEED_EQUITY", "10000")))
    desk_token: str = field(default_factory=lambda: os.getenv("DESK_TOKEN", ""))
    host: str = field(default_factory=lambda: os.getenv("HOST", "127.0.0.1"))
    taker_fee: float = 0.00055
    slippage_bps: float = 1.5
    stage_pace_s: float = 1.4            # visible dwell per desk while a ticket is routed
    rescan_interval_s: int = 60
    risk: RiskLimits = field(default_factory=RiskLimits)
    learning: Learning = field(default_factory=Learning)

    def public(self) -> dict:
        d = asdict(self)
        d.pop("api_key")
        d.pop("api_secret")
        d.pop("desk_token")
        d["has_keys"] = bool(self.api_key and self.api_secret)
        d["token_required"] = bool(self.desk_token)
        return d

    def save(self) -> None:
        payload = {k: (asdict(getattr(self, k)) if k in ("risk", "learning") else getattr(self, k)) for k in EDITABLE}
        tmp = SETTINGS_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, indent=2))
        tmp.replace(SETTINGS_PATH)

    @classmethod
    def load(cls) -> Settings:
        s = cls()
        if SETTINGS_PATH.exists():
            try:
                saved = json.loads(SETTINGS_PATH.read_text())
                for k in EDITABLE:
                    if k not in saved:
                        continue
                    if k == "risk":
                        fields = RiskLimits.__dataclass_fields__
                        s.risk = RiskLimits(**{kk: vv for kk, vv in saved["risk"].items() if kk in fields})
                    elif k == "learning":
                        fields = Learning.__dataclass_fields__
                        s.learning = Learning(**{kk: vv for kk, vv in saved["learning"].items() if kk in fields})
                    else:
                        setattr(s, k, saved[k])
            except (OSError, ValueError, TypeError):
                pass
        try:
            validate_risk(s.risk)
        except ValueError:
            s.risk = RiskLimits()
        if s.mode not in ("paper", "live"):
            s.mode = "paper"
        if s.mode == "live" and not (s.api_key and s.api_secret):
            s.mode = "paper"
        return s

    def apply(self, patch: dict) -> list[str]:
        """Apply an operator patch atomically; returns the list of fields changed."""
        changed: list[str] = []
        new_risk = replace(self.risk)
        new_mode, new_appr, new_paused = self.mode, self.approvals_only, self.paused
        for k, v in patch.items():
            if k == "risk" and isinstance(v, dict):
                for kk, vv in v.items():
                    if kk not in RiskLimits.__dataclass_fields__:
                        continue
                    typ = type(getattr(new_risk, kk))
                    try:
                        setattr(new_risk, kk, typ(vv))
                    except (TypeError, ValueError):
                        raise ValueError(f"risk.{kk}: not a number")
                    changed.append(f"risk.{kk}")
            elif k == "learning" and isinstance(v, dict):
                if "mode" in v and v["mode"] not in ("shadow", "active"):
                    raise ValueError("learning.mode must be shadow or active")
                if "min_samples" in v and not (20 <= int(v["min_samples"]) <= 100_000):
                    raise ValueError("learning.min_samples outside [20, 100000]")
                if "lr" in v and not (0.001 <= float(v["lr"]) <= 0.5):
                    raise ValueError("learning.lr outside [0.001, 0.5]")
                for kk, vv in v.items():
                    if kk in Learning.__dataclass_fields__:
                        typ = type(getattr(self.learning, kk))
                        setattr(self.learning, kk, typ(vv))
                        changed.append(f"learning.{kk}")
            elif k == "approvals_only":
                new_appr = bool(v)
                changed.append(k)
            elif k == "paused":
                new_paused = bool(v)
                changed.append(k)
            elif k == "mode":
                if v not in ("paper", "live"):
                    raise ValueError("mode must be paper or live")
                if v == "live" and not (self.api_key and self.api_secret):
                    raise ValueError("live mode needs BYBIT_API_KEY / BYBIT_API_SECRET in .env")
                new_mode = v
                changed.append(k)
        validate_risk(new_risk)
        self.risk, self.mode, self.approvals_only, self.paused = new_risk, new_mode, new_appr, new_paused
        if changed:
            self.save()
        return changed
