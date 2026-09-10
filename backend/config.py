"""Settings: env-backed secrets, JSON-backed operator-editable limits."""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
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


EDITABLE = ("mode", "approvals_only", "paused", "risk")


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
    taker_fee: float = 0.00055
    slippage_bps: float = 1.5
    stage_pace_s: float = 1.4            # visible dwell per desk while a ticket is routed
    rescan_interval_s: int = 60
    risk: RiskLimits = field(default_factory=RiskLimits)

    def public(self) -> dict:
        d = asdict(self)
        d.pop("api_key")
        d.pop("api_secret")
        d["has_keys"] = bool(self.api_key and self.api_secret)
        return d

    def save(self) -> None:
        payload = {k: (asdict(self.risk) if k == "risk" else getattr(self, k)) for k in EDITABLE}
        SETTINGS_PATH.write_text(json.dumps(payload, indent=2))

    @classmethod
    def load(cls) -> "Settings":
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
                    else:
                        setattr(s, k, saved[k])
            except Exception:
                pass
        if s.mode not in ("paper", "live"):
            s.mode = "paper"
        if s.mode == "live" and not (s.api_key and s.api_secret):
            s.mode = "paper"
        return s

    def apply(self, patch: dict) -> list[str]:
        """Apply an operator patch; returns the list of fields changed."""
        changed: list[str] = []
        for k, v in patch.items():
            if k == "risk" and isinstance(v, dict):
                for kk, vv in v.items():
                    if kk in RiskLimits.__dataclass_fields__:
                        typ = type(getattr(self.risk, kk))
                        setattr(self.risk, kk, typ(vv))
                        changed.append(f"risk.{kk}")
            elif k in ("approvals_only", "paused"):
                setattr(self, k, bool(v))
                changed.append(k)
            elif k == "mode" and v in ("paper", "live"):
                if v == "live" and not (self.api_key and self.api_secret):
                    raise ValueError("live mode needs BYBIT_API_KEY / BYBIT_API_SECRET in .env")
                self.mode = v
                changed.append(k)
        if changed:
            self.save()
        return changed
