"""Brokers: PaperBroker (virtual ledger on real prices) and LiveBroker (Bybit orders)."""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, asdict

from .bybit import BybitREST


@dataclass
class Position:
    ticket_id: str
    side: str          # UP | DOWN
    qty: float
    entry: float
    fee: float
    opened_ts: float
    sl: float
    tp: float
    order_id: str = ""

    def dict(self) -> dict:
        return asdict(self)


class PaperBroker:
    name = "paper"

    def __init__(self, cash: float, fee_rate: float, slippage_bps: float):
        self.cash = cash
        self.fee_rate = fee_rate
        self.slip = slippage_bps / 10_000

    async def open(self, ticket_id: str, side: str, qty: float, mark: float, sl: float, tp: float) -> Position:
        fill = mark * (1 + self.slip) if side == "UP" else mark * (1 - self.slip)
        fee = fill * qty * self.fee_rate
        self.cash -= fee
        return Position(ticket_id, side, qty, fill, fee, time.time(), sl, tp)

    async def close(self, pos: Position, mark: float) -> tuple[float, float]:
        fill = mark * (1 - self.slip) if pos.side == "UP" else mark * (1 + self.slip)
        gross = (fill - pos.entry) * pos.qty * (1 if pos.side == "UP" else -1)
        fee = fill * pos.qty * self.fee_rate
        self.cash += gross - fee
        return fill, gross - fee - pos.fee

    def unrealized(self, pos: Position, mark: float) -> float:
        return (mark - pos.entry) * pos.qty * (1 if pos.side == "UP" else -1)

    async def equity(self, positions: list[Position], mark: float) -> float:
        return self.cash + sum(self.unrealized(p, mark) for p in positions)


class LiveBroker:
    name = "live"

    def __init__(self, rest: BybitREST, symbol: str, leverage: float):
        self.rest = rest
        self.symbol = symbol
        self.leverage = leverage
        self._lev_set = False
        self.cash = 0.0

    async def _ensure_leverage(self):
        if not self._lev_set:
            await self.rest.set_leverage(self.symbol, self.leverage)
            self._lev_set = True

    async def _fill(self, order_id: str) -> tuple[float, float]:
        for _ in range(20):
            o = await self.rest.order_status(self.symbol, order_id)
            if o and o.get("orderStatus") in ("Filled", "PartiallyFilledCanceled"):
                return float(o.get("avgPrice") or 0), float(o.get("cumExecFee") or 0)
            await asyncio.sleep(0.3)
        raise RuntimeError(f"order {order_id} not filled")

    async def open(self, ticket_id: str, side: str, qty: float, mark: float, sl: float, tp: float) -> Position:
        await self._ensure_leverage()
        res = await self.rest.market_order(
            self.symbol, "Buy" if side == "UP" else "Sell", qty, take_profit=tp, stop_loss=sl
        )
        entry, fee = await self._fill(res["orderId"])
        return Position(ticket_id, side, qty, entry or mark, fee, time.time(), sl, tp, res["orderId"])

    async def close(self, pos: Position, mark: float) -> tuple[float, float]:
        res = await self.rest.market_order(
            self.symbol, "Sell" if pos.side == "UP" else "Buy", pos.qty, reduce_only=True
        )
        fill, fee = await self._fill(res["orderId"])
        fill = fill or mark
        gross = (fill - pos.entry) * pos.qty * (1 if pos.side == "UP" else -1)
        return fill, gross - fee - pos.fee

    def unrealized(self, pos: Position, mark: float) -> float:
        return (mark - pos.entry) * pos.qty * (1 if pos.side == "UP" else -1)

    async def equity(self, positions: list[Position], mark: float) -> float:
        try:
            wb = await self.rest.wallet_balance()
            self.cash = float(wb.get("totalEquity") or wb.get("totalWalletBalance") or self.cash)
        except Exception:
            pass
        return self.cash
