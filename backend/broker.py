"""Brokers: PaperBroker (virtual ledger on real prices) and LiveBroker (Bybit orders, verified fills)."""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import asdict, dataclass

from .bybit import BybitError, BybitREST, round_step

log = logging.getLogger("btcdesk.broker")


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
    """Real orders. Every fill is read back from the exchange; closes use the exchange's own position size."""

    name = "live"

    def __init__(self, rest: BybitREST, symbol: str, leverage: float, qty_step: float = 0.001, tick: float = 0.1):
        self.rest = rest
        self.symbol = symbol
        self.leverage = leverage
        self.qty_step = qty_step
        self.tick = tick
        self._lev_set = False
        self._mode_checked = False
        self.cash = 0.0

    async def _prepare(self):
        if not self._mode_checked:
            for p in await self.rest.positions(self.symbol):
                if int(p.get("positionIdx", 0)) != 0:
                    raise RuntimeError("account is in hedge mode; switch BTCUSDT to one-way mode before live trading")
            self._mode_checked = True
        if not self._lev_set:
            await self.rest.set_leverage(self.symbol, self.leverage)
            self._lev_set = True

    async def _fill(self, order_id: str) -> tuple[float, float, float]:
        """Wait for a market order to fill. Returns (avg_price, exec_fee, exec_qty)."""
        for _ in range(30):
            o = await self.rest.order_status(self.symbol, order_id)
            status = (o or {}).get("orderStatus")
            if status in ("Filled", "PartiallyFilledCanceled", "Cancelled", "Rejected"):
                qty = float(o.get("cumExecQty") or 0)
                if qty <= 0:
                    raise RuntimeError(f"order {order_id} ended {status} with no fill")
                return float(o.get("avgPrice") or 0), float(o.get("cumExecFee") or 0), qty
            await asyncio.sleep(0.3)
        # never leave an unknown order behind
        try:
            await self.rest.cancel_order(self.symbol, order_id)
        except BybitError as e:
            log.warning("cancel after fill timeout failed: %s", e)
        o = await self.rest.order_status(self.symbol, order_id)
        qty = float((o or {}).get("cumExecQty") or 0)
        if qty > 0:
            return float(o.get("avgPrice") or 0), float(o.get("cumExecFee") or 0), qty
        raise RuntimeError(f"order {order_id} not filled within timeout; cancelled")

    async def open(self, ticket_id: str, side: str, qty: float, mark: float, sl: float, tp: float) -> Position:
        await self._prepare()
        res = await self.rest.market_order(
            self.symbol, "Buy" if side == "UP" else "Sell", qty, qty_step=self.qty_step,
            take_profit=tp, stop_loss=sl, tick=self.tick, link_id=f"desk-{ticket_id}",
        )
        entry, fee, filled = await self._fill(res["orderId"])
        return Position(ticket_id, side, filled, entry or mark, fee, time.time(), sl, tp, res["orderId"])

    async def exchange_size(self) -> tuple[float, str]:
        """Net position size on the exchange and its side ('UP' | 'DOWN' | '')."""
        for p in await self.rest.positions(self.symbol):
            size = float(p.get("size") or 0)
            if size > 0:
                return size, "UP" if p.get("side") == "Buy" else "DOWN"
        return 0.0, ""

    async def close(self, pos: Position, mark: float) -> tuple[float, float]:
        size, side = await self.exchange_size()
        if size <= 0 or side != pos.side:
            # the exchange already flattened us (stop or target hit); settle at the mark we can see
            log.warning("close %s: no matching exchange position (size=%s side=%s); settling flat", pos.ticket_id, size, side)
            gross = (mark - pos.entry) * pos.qty * (1 if pos.side == "UP" else -1)
            return mark, gross - pos.fee
        qty = min(pos.qty, size)
        qty = round_step(qty, self.qty_step) or size
        res = await self.rest.market_order(
            self.symbol, "Sell" if pos.side == "UP" else "Buy", qty, qty_step=self.qty_step, reduce_only=True, link_id=f"desk-{pos.ticket_id}-x",
        )
        fill, fee, filled = await self._fill(res["orderId"])
        fill = fill or mark
        gross = (fill - pos.entry) * filled * (1 if pos.side == "UP" else -1)
        return fill, gross - fee - pos.fee

    def unrealized(self, pos: Position, mark: float) -> float:
        return (mark - pos.entry) * pos.qty * (1 if pos.side == "UP" else -1)

    async def equity(self, positions: list[Position], mark: float) -> float:
        wb = await self.rest.wallet_balance()
        self.cash = float(wb.get("totalEquity") or wb.get("totalWalletBalance") or self.cash)
        return self.cash
