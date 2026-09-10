"""The office: six desks, one book, the core routes every ticket."""
from __future__ import annotations

import asyncio
import time
import uuid
from collections import deque
from datetime import datetime, timezone

from .analog import AnalogMatcher
from .broker import LiveBroker, PaperBroker, Position
from .bybit import BybitPublicWS, BybitREST
from .config import DATA_DIR, Settings
from .indicators import atr, ema, rsi, rsi_series, session_vwap, slope_pct, volume_z, zbands
from .model import Features, book_fair, edge as calc_edge, kelly as calc_kelly, prior
from .storage import Storage

DESKS = [
    ("spotter", "SCAN"), ("prior", "PRICING"), ("edge", "EDGE"),
    ("kelly", "SIZING"), ("taker", "EXECUTION"), ("closer", "SETTLEMENT"),
]
DESK_INDEX = {name: i for i, (name, _) in enumerate(DESKS)}
BAR_MS = 15 * 60 * 1000


def _now() -> float:
    return time.time()


def _fmt_money(x: float) -> str:
    sign = "+" if x >= 0 else "-"
    return f"{sign}${abs(x):,.2f}"


class Engine:
    def __init__(self, settings: Settings):
        self.s = settings
        self.rest = BybitREST(settings.api_key, settings.api_secret, settings.testnet)
        self.store = Storage(DATA_DIR / "ledger.sqlite")
        self.analog = AnalogMatcher(window=48, horizon=24, k=7)
        self.analog.scanned_total = int(self.store.get("scanned_total", 0))
        self.lot = 0.001
        self.started = _now()
        self.online = False
        self.dirty = True
        self.clients: set = set()

        # market
        self.candles_1m: deque[list[float]] = deque(maxlen=3000)
        self.candles_15m: deque[list[float]] = deque(maxlen=500)
        self.ticker: dict = {}
        self.bids: dict[float, float] = {}
        self.asks: dict[float, float] = {}
        self.tape: deque[dict] = deque(maxlen=40)
        self.market: dict = {}
        self.features = Features()
        self.model: dict = {}
        self.analog_state: dict = self.analog.empty()

        # desks
        self.desks: dict[str, dict] = {
            name: {"state": "idle", "progress": 0.0, "gauge": 0, "history": deque([0] * 40, maxlen=40), "note": ""}
            for name, _ in DESKS
        }
        self.holder = "spotter"
        self.stage = 0
        self.handoffs: deque[float] = deque(maxlen=5000)
        self.handoffs_total = int(self.store.get("handoffs_total", 0))

        # book
        seed = float(self.store.get("seed", settings.seed_equity))
        cash = float(self.store.get("cash", seed))
        self.seed = seed
        if settings.mode == "live":
            self.broker = LiveBroker(self.rest, settings.symbol, settings.risk.max_leverage)
        else:
            self.broker = PaperBroker(cash, settings.taker_fee, settings.slippage_bps)
        self.positions: dict[str, Position] = {}
        self.tickets: dict[str, dict] = {}
        for t in self.store.load_tickets(300):
            self.tickets[t["id"]] = t
            if t["status"] == "open" and t.get("position"):
                self.positions[t["id"]] = Position(**t["position"])
        self.equity = cash
        self.equity_hist: deque[list[float]] = deque(self.store.load_equity(2000), maxlen=2000)
        self.log: deque[dict] = deque(self.store.load_log(150), maxlen=150)
        self.day_peak = self.equity
        self.day = datetime.now(timezone.utc).date()
        self.halted = False
        self._last_eq_persist = 0.0
        self._pipeline_task: asyncio.Task | None = None
        self._last_bar_ts = 0
        self._tasks: list[asyncio.Task] = []
        self.ws: BybitPublicWS | None = None

    # ------------------------------------------------------------------ lifecycle
    async def start(self):
        sym = self.s.symbol
        net = "testnet" if self.s.testnet else "mainnet"
        self.log_event("core", "SYSTEM", None, f"desk booting · {self.s.mode.upper()} mode · {sym} 15M · {net} data", key="boot", mode=self.s.mode.upper(), sym=sym, net=net)
        try:
            inst = await self.rest.instrument(sym)
            self.lot = float(inst["lotSizeFilter"]["qtyStep"])
        except Exception as e:
            self.log_event("core", "SYSTEM", None, f"instrument lookup failed · {e}", key="inst_fail", err=str(e))
        try:
            for row in await self.rest.klines_history(sym, "1", 3000):
                self.candles_1m.append(row)
            for row in await self.rest.klines_history(sym, "15", 400):
                self.candles_15m.append(row)
            self.ticker = await self.rest.ticker(sym)
            ob = await self.rest.orderbook(sym, 50)
            self.bids = {float(p): float(q) for p, q in ob["b"]}
            self.asks = {float(p): float(q) for p, q in ob["a"]}
            self.log_event("spotter", "SCAN", None, f"loaded {len(self.candles_1m):,} 1m bars · {len(self.candles_15m)} 15m bars · book {len(self.bids)}×{len(self.asks)}", key="loaded", n1=f"{len(self.candles_1m):,}", n15=len(self.candles_15m), b=len(self.bids), a=len(self.asks))
        except Exception as e:
            self.log_event("core", "SYSTEM", None, f"history load failed · {e}", key="hist_fail", err=str(e))
        self._last_bar_ts = self.candles_15m[-1][0] if self.candles_15m else 0
        self.ws = BybitPublicWS(
            [f"kline.1.{sym}", f"kline.15.{sym}", f"tickers.{sym}", f"orderbook.50.{sym}", f"publicTrade.{sym}"],
            self.on_ws, self.on_ws_status, self.s.testnet,
        )
        self._tasks = [
            asyncio.create_task(self.ws.run()),
            asyncio.create_task(self._tick_loop()),
            asyncio.create_task(self._rescan_loop()),
            asyncio.create_task(self._broadcast_loop()),
        ]
        self.recompute(full=True)
        # first scan right away so the office is working from second one
        self._schedule_pipeline(reason="boot scan")

    async def stop(self):
        if self.ws:
            self.ws.stop()
        for t in self._tasks:
            t.cancel()
        await self.rest.close()

    # ------------------------------------------------------------------ websocket in
    def on_ws_status(self, ok: bool):
        self.online = ok
        self.log_event("core", "SYSTEM", None, "stream connected · swarm online" if ok else "stream lost · reconnecting", key="stream_on" if ok else "stream_off")
        self.dirty = True

    def on_ws(self, msg: dict):
        topic: str = msg["topic"]
        data = msg.get("data")
        if topic.startswith("kline.1."):
            self._merge_kline(self.candles_1m, data)
        elif topic.startswith("kline.15."):
            self._merge_kline(self.candles_15m, data)
            for k in data:
                if k.get("confirm") and int(k["start"]) > self._last_bar_ts:
                    self._last_bar_ts = int(k["start"])
                    self._schedule_pipeline(reason="15m close")
        elif topic.startswith("tickers."):
            self.ticker.update(data)
        elif topic.startswith("orderbook."):
            if msg.get("type") == "snapshot":
                self.bids = {float(p): float(q) for p, q in data["b"]}
                self.asks = {float(p): float(q) for p, q in data["a"]}
            else:
                for p, q in data.get("b", []):
                    p, q = float(p), float(q)
                    if q == 0:
                        self.bids.pop(p, None)
                    else:
                        self.bids[p] = q
                for p, q in data.get("a", []):
                    p, q = float(p), float(q)
                    if q == 0:
                        self.asks.pop(p, None)
                    else:
                        self.asks[p] = q
        elif topic.startswith("publicTrade."):
            for t in data:
                self.tape.append({"ts": int(t["T"]), "p": float(t["p"]), "q": float(t["v"]), "side": t["S"]})
        self.dirty = True

    @staticmethod
    def _merge_kline(store: deque, data: list[dict]):
        for k in data:
            row = [int(k["start"]), float(k["open"]), float(k["high"]), float(k["low"]), float(k["close"]), float(k["volume"])]
            if store and store[-1][0] == row[0]:
                store[-1] = row
            elif not store or row[0] > store[-1][0]:
                store.append(row)

    # ------------------------------------------------------------------ loops
    async def _tick_loop(self):
        while True:
            try:
                self.recompute(full=False)
                await self._mark_book()
                await self._closer_check()
            except Exception as e:
                self.log_event("core", "SYSTEM", None, f"tick error · {e}", key="err", what="tick", err=str(e))
            self.dirty = True
            await asyncio.sleep(1.0)

    async def _rescan_loop(self):
        await asyncio.sleep(3)
        n = 0
        while True:
            try:
                self.recompute(full=True)
                self._research_note(n)
                n += 1
            except Exception as e:
                self.log_event("core", "SYSTEM", None, f"rescan error · {e}", key="err", what="rescan", err=str(e))
            self.dirty = True
            await asyncio.sleep(self.s.rescan_interval_s)

    async def _broadcast_loop(self):
        while True:
            await asyncio.sleep(0.5)
            if not self.dirty or not self.clients:
                continue
            self.dirty = False
            snap = self.snapshot()
            import json
            payload = json.dumps({"type": "state", "state": snap}, separators=(",", ":"))
            dead = []
            for ws in list(self.clients):
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.clients.discard(ws)

    # ------------------------------------------------------------------ market maths
    def mark_price(self) -> float:
        try:
            return float(self.ticker.get("markPrice") or self.ticker.get("lastPrice"))
        except Exception:
            return self.candles_1m[-1][4] if self.candles_1m else 0.0

    def recompute(self, full: bool):
        c1 = list(self.candles_1m)
        c15 = list(self.candles_15m)
        if len(c15) < 30 or len(c1) < 60:
            return
        closes15 = [r[4] for r in c15]
        closes1 = [r[4] for r in c1]
        last = float(self.ticker.get("lastPrice") or closes1[-1])
        mark = self.mark_price()
        e9, e21 = ema(closes15, 9), ema(closes15, 21)
        vwap1 = session_vwap(c1[-600:])
        mid, up, lo, z = zbands(closes15[-60:], 20, 2.0)
        r15 = rsi(closes15[-100:], 14)
        bid_depth = sum(self.bids.values())
        ask_depth = sum(self.asks.values())
        tot = bid_depth + ask_depth
        imbalance = (bid_depth - ask_depth) / tot if tot else 0.0
        best_bid = max(self.bids) if self.bids else last
        best_ask = min(self.asks) if self.asks else last
        funding = float(self.ticker.get("fundingRate") or 0)
        a15 = atr(c15[-30:], 14)
        f = Features(
            rsi=r15,
            ema_gap_pct=(e9[-1] / e21[-1] - 1) * 100 if e21[-1] else 0.0,
            vwap_dist_pct=(last / vwap1[-1] - 1) * 100 if vwap1[-1] else 0.0,
            z=z[-1],
            vol_z=volume_z([r[5] for r in c1], 50),
            last_body_pct=(c15[-2][4] / c15[-2][1] - 1) * 100 if c15[-2][1] else 0.0,
            mom_1h_pct=(closes1[-1] / closes1[-61] - 1) * 100 if len(closes1) > 61 else 0.0,
            analog_signal=self.analog_state.get("signal", 0.0),
            imbalance=imbalance,
            funding=funding,
            atr_pct=a15 / last * 100 if last else 0.0,
        )
        if full:
            self.analog_state = self.analog.match(closes1)
            f.analog_signal = self.analog_state.get("signal", 0.0)
            self.store.set("scanned_total", self.analog.scanned_total)
        self.features = f
        p_up, contrib = prior(f)
        p_mkt = book_fair(f)
        direction, edge_c = calc_edge(p_up, p_mkt)
        p_dir = p_up if direction == "UP" else 1 - p_up
        kz = calc_kelly(p_dir, self.equity, mark or last, self.s.risk, self.dd_notch(), self.lot)
        self.model = {
            "p_up": round(p_up, 4), "p_market": round(p_mkt, 4), "direction": direction,
            "edge_cents": round(edge_c, 2), "confidence": round(abs(p_up - 0.5) * 2, 3),
            "contrib": contrib, "kelly": kz, "features": f.dict(),
        }
        self.market = {
            "last": last, "mark": mark, "index": float(self.ticker.get("indexPrice") or last),
            "chg24": float(self.ticker.get("price24hPcnt") or 0) * 100,
            "high24": float(self.ticker.get("highPrice24h") or 0), "low24": float(self.ticker.get("lowPrice24h") or 0),
            "funding": funding, "next_funding": int(self.ticker.get("nextFundingTime") or 0),
            "oi": float(self.ticker.get("openInterest") or 0), "oi_value": float(self.ticker.get("openInterestValue") or 0),
            "spread": round(best_ask - best_bid, 2), "bid": best_bid, "ask": best_ask,
            "bid_depth": round(bid_depth, 3), "ask_depth": round(ask_depth, 3), "imbalance": round(imbalance, 4),
            "rsi14": round(r15, 1), "vwap": round(vwap1[-1], 2), "ema9": round(e9[-1], 2), "ema21": round(e21[-1], 2),
            "z": round(z[-1], 2), "atr": round(a15, 2), "vol_z": round(f.vol_z, 2),
            "turnover24": float(self.ticker.get("turnover24h") or 0),
        }
        # desk gauges: what each desk is watching, 0-100
        g = self.desks
        g["spotter"]["gauge"] = int(max(0, min(100, 50 + 12 * f.vol_z + 40 * abs(f.ema_gap_pct) / 0.3)))
        g["prior"]["gauge"] = int(round(p_up * 100))
        g["edge"]["gauge"] = int(max(0, min(100, 50 + edge_c * 8)))
        g["kelly"]["gauge"] = int(max(0, min(100, kz["notional"] / (self.equity * self.s.risk.max_leverage) * 100 if self.equity else 0)))
        g["taker"]["gauge"] = int(max(0, min(100, 100 - self.market["spread"] / max(last, 1) * 1e5)))
        st = self.stats()
        g["closer"]["gauge"] = int(round(st["win_rate"] * 100)) if st["n"] else int(round(50 + self.dd_now() * -400))
        for d in g.values():
            d["history"].append(d["gauge"])

    # ------------------------------------------------------------------ book / risk
    def dd_now(self) -> float:
        return max(0.0, 1 - self.equity / self.day_peak) if self.day_peak else 0.0

    def dd_notch(self) -> int:
        guard = self.s.risk.daily_drawdown_guard
        return min(10, int(self.dd_now() / guard * 10)) if guard else 0

    async def _mark_book(self):
        mark = self.mark_price()
        if not mark:
            return
        if isinstance(self.broker, LiveBroker):
            if int(_now()) % 15 == 0:
                self.equity = await self.broker.equity(list(self.positions.values()), mark)
        else:
            self.equity = await self.broker.equity(list(self.positions.values()), mark)
        today = datetime.now(timezone.utc).date()
        if today != self.day:
            self.day, self.day_peak = today, self.equity
            if self.halted:
                self.halted = False
                self.log_event("closer", "GUARD", None, "new UTC day · drawdown guard reset · desk reopened", key="guard_reset")
        self.day_peak = max(self.day_peak, self.equity)
        if self.dd_now() >= self.s.risk.daily_drawdown_guard and not self.halted:
            self.halted = True
            self.log_event("closer", "GUARD", None, f"drawdown guard hit {self.dd_now()*100:.2f}% · no new tickets until next UTC day", key="guard_hit", dd=f"{self.dd_now()*100:.2f}%")
        now = _now()
        if now - self._last_eq_persist >= 15:
            self._last_eq_persist = now
            self.equity_hist.append([now, round(self.equity, 2)])
            self.store.add_equity(now, self.equity)
            if not isinstance(self.broker, LiveBroker):
                self.store.set("cash", self.broker.cash)
        for tid, pos in self.positions.items():
            t = self.tickets[tid]
            t["unrealized"] = round(self.broker.unrealized(pos, mark), 2)
            t["mark"] = mark

    async def _closer_check(self):
        mark = self.mark_price()
        if not mark:
            return
        for tid in list(self.positions):
            t = self.tickets[tid]
            pos = self.positions[tid]
            reason = None
            if pos.side == "UP" and mark <= pos.sl or pos.side == "DOWN" and mark >= pos.sl:
                reason = "stop"
            elif pos.side == "UP" and mark >= pos.tp or pos.side == "DOWN" and mark <= pos.tp:
                reason = "target"
            elif _now() * 1000 >= t["horizon_ts"]:
                reason = "horizon"
            if reason:
                await self.settle(tid, reason)

    async def settle(self, tid: str, reason: str):
        t = self.tickets[tid]
        pos = self.positions.pop(tid)
        self._desk_state("closer", "run", 0.5)
        self.holder = "closer"
        self.stage = 5
        mark = self.mark_price()
        try:
            fill, pnl = await self.broker.close(pos, mark)
        except Exception as e:
            self.positions[tid] = pos
            self.log_event("closer", "SETTLE", None, f"close failed · {e}", key="close_fail", err=str(e))
            self._desk_state("closer", "idle", 0)
            return
        t.update({"status": "settled", "exit": round(fill, 2), "pnl": round(pnl, 2), "settled": _now(), "reason": reason, "stage": 5})
        t.pop("unrealized", None)
        self.store.save_ticket(t)
        st = self.stats()
        self.log_event(
            "closer", "SETTLE", _fmt_money(pnl),
            f"settled BTC {t['direction']} 15M · {reason} · exit ${fill:,.1f} · book {st['wins']}W {st['losses']}L",
            key="settled", dir=t["direction"], reason=reason, exit=f"${fill:,.1f}", w=st["wins"], l=st["losses"],
        )
        self._handoff()
        self._desk_state("closer", "done", 1.0)
        self.dirty = True

    def stats(self) -> dict:
        settled = [t for t in self.tickets.values() if t["status"] == "settled"]
        wins = sum(1 for t in settled if t["pnl"] > 0)
        losses = len(settled) - wins
        avg_edge = sum(t["edge"] for t in settled) / len(settled) if settled else 0.0
        peak, mdd = 0.0, 0.0
        for _, eq in self.equity_hist:
            peak = max(peak, eq)
            if peak:
                mdd = max(mdd, 1 - eq / peak)
        last = max(settled, key=lambda t: t["settled"]) if settled else None
        since = _now() - 8 * 3600
        away = sum(t["pnl"] for t in settled if t["settled"] >= since)
        return {
            "n": len(settled), "wins": wins, "losses": losses,
            "win_rate": wins / len(settled) if settled else 0.0, "avg_edge": round(avg_edge, 2),
            "max_dd": round(mdd, 4), "last_pnl": last["pnl"] if last else 0.0,
            "last_label": f"SETTLED BTC {last['direction']} 15M" if last else "NO SETTLEMENT YET",
            "last_dir": last["direction"] if last else None,
            "away_pnl": round(away, 2),
        }

    # ------------------------------------------------------------------ pipeline
    def _schedule_pipeline(self, reason: str):
        if self._pipeline_task and not self._pipeline_task.done():
            return
        self._pipeline_task = asyncio.create_task(self._pipeline(reason))

    def _desk_state(self, name: str, state: str, progress: float, note: str = ""):
        d = self.desks[name]
        d["state"], d["progress"] = state, progress
        if note:
            d["note"] = note
        self.dirty = True

    def _handoff(self):
        self.handoffs.append(_now())
        self.handoffs_total += 1
        if self.handoffs_total % 10 == 0:
            self.store.set("handoffs_total", self.handoffs_total)

    async def _dwell(self, name: str, steps: int = 4):
        pace = self.s.stage_pace_s
        for i in range(1, steps + 1):
            self._desk_state(name, "run", i / steps)
            await asyncio.sleep(pace / steps)

    async def _pipeline(self, reason: str):
        if not self.market:
            return
        s = self.s
        for name, _ in DESKS:
            if name != "closer":
                self._desk_state(name, "idle", 0.0)
        if s.paused:
            self.log_event("core", "HOLD", None, f"{reason} · swarm paused · no ticket cut", key="hold_paused", reason=reason)
            return
        if self.halted:
            self.log_event("closer", "GUARD", None, f"{reason} · drawdown guard active · no ticket cut", key="hold_guard", reason=reason)
            return
        open_n = sum(1 for t in self.tickets.values() if t["status"] in ("open", "on_deck", "routing"))
        if open_n >= s.risk.max_open_tickets:
            self.log_event("kelly", "HOLD", None, f"{reason} · {open_n} tickets open · at cap", key="hold_cap", reason=reason, n=open_n)
            return
        tid = uuid.uuid4().hex[:8]
        bar_start = self._last_bar_ts or int(_now() * 1000 // BAR_MS * BAR_MS)
        t = {
            "id": tid, "created": _now(), "status": "routing", "stage": 0, "reason_open": reason,
            "horizon_ts": bar_start + BAR_MS * (s.risk.horizon_bars + 1), "mode": s.mode,
        }
        self.tickets[tid] = t
        self.stage = 0

        # 01 SPOTTER — scan
        self.holder = "spotter"
        await self._dwell("spotter")
        f = self.features
        m = self.market
        side = "above" if f.vwap_dist_pct >= 0 else "below"
        self.log_event(
            "spotter", "SCAN", None,
            f"ticket {tid} cut · RSI14 {m['rsi14']:.1f} · {side} VWAP {abs(f.vwap_dist_pct):.2f}% · z {f.z:+.2f} · vol z {f.vol_z:+.1f}",
            key="scan", tid=tid, rsi=f"{m['rsi14']:.1f}", side=side, vwap=f"{abs(f.vwap_dist_pct):.2f}%", z=f"{f.z:+.2f}", volz=f"{f.vol_z:+.1f}",
        )
        t.update({"features": f.dict()})
        self._desk_state("spotter", "done", 1.0)
        self._handoff()

        # 02 PRIOR — pricing
        self.holder, self.stage, t["stage"] = "prior", 1, 1
        await self._dwell("prior")
        p_up = self.model["p_up"]
        an = self.analog_state
        self.log_event(
            "prior", "PRICE", f"{p_up*100:.0f}¢",
            f"model fair {p_up*100:.1f}¢ UP · analog {an.get('up',0)}↑ {an.get('down',0)}↓ match {an.get('match',0):.2f} · momentum {self.model['contrib']['momentum']:+.2f}",
            key="price", p=f"{p_up*100:.1f}¢", up=an.get("up", 0), down=an.get("down", 0), match=f"{an.get('match',0):.2f}", mom=f"{self.model['contrib']['momentum']:+.2f}",
        )
        t.update({"p_model": p_up, "contrib": self.model["contrib"]})
        self._desk_state("prior", "done", 1.0)
        self._handoff()

        # 03 EDGE — model vs book
        self.holder, self.stage, t["stage"] = "edge", 2, 2
        await self._dwell("edge")
        p_mkt = self.model["p_market"]
        direction, edge_c = calc_edge(p_up, p_mkt)
        t.update({"p_market": p_mkt, "direction": direction, "edge": round(edge_c, 2)})
        self._desk_state("edge", "done", 1.0)
        self._handoff()
        if edge_c < s.risk.min_edge_cents:
            self.log_event(
                "edge", "PASS", f"{edge_c:+.1f}¢",
                f"{direction} edge {edge_c:+.1f}¢ vs book {p_mkt*100:.0f}¢ · below {s.risk.min_edge_cents:.1f}¢ floor · ticket passed",
                key="edge_pass", dir=direction, edge=f"{edge_c:+.1f}¢", book=f"{p_mkt*100:.0f}¢", floor=f"{s.risk.min_edge_cents:.1f}¢",
            )
            t.update({"status": "passed", "settled": _now(), "pnl": 0.0})
            self.store.save_ticket(t)
            self._reset_desks()
            return
        self.log_event("edge", "EDGE", f"{edge_c:+.1f}¢", f"{direction} · model {p_up*100:.1f}¢ vs book {p_mkt*100:.1f}¢ · edge cleared the floor", key="edge_ok", dir=direction, p=f"{p_up*100:.1f}¢", book=f"{p_mkt*100:.1f}¢")

        # 04 KELLY — sizing
        self.holder, self.stage, t["stage"] = "kelly", 3, 3
        await self._dwell("kelly")
        p_dir = p_up if direction == "UP" else 1 - p_up
        mark = self.mark_price()
        kz = calc_kelly(p_dir, self.equity, mark, s.risk, self.dd_notch(), self.lot)
        notch = self.dd_notch()
        t.update({"kelly": kz, "qty": kz["qty"], "stake": kz["notional"]})
        self._desk_state("kelly", "done", 1.0)
        self._handoff()
        if kz["qty"] <= 0:
            self.log_event("kelly", "PASS", "$0", f"size rounds to zero at ${mark:,.0f} · f* {kz['f_star']:.3f} · ticket passed", key="size_zero", mark=f"${mark:,.0f}", f=f"{kz['f_star']:.3f}")
            t.update({"status": "passed", "settled": _now(), "pnl": 0.0})
            self.store.save_ticket(t)
            self._reset_desks()
            return
        self.log_event(
            "kelly", "SIZE", f"${kz['notional']:,.0f}",
            f"{kz['qty']} BTC · half-Kelly f {kz['f']:.3f} · cap by {kz['binding']} · drawdown guard {notch}/10 · {'full size' if notch == 0 else f'size cut {notch} notch'}",
            key="size", qty=kz["qty"], f=f"{kz['f']:.3f}", binding=kz["binding"], notch=notch,
        )

        # 05 TAKER — execution
        self.holder, self.stage, t["stage"] = "taker", 4, 4
        if s.approvals_only:
            t["status"] = "on_deck"
            self._desk_state("taker", "on_deck", 0.0, "awaiting approval")
            self.log_event("taker", "HOLD", None, f"ticket {tid} on deck · human approval required · {direction} {kz['qty']} BTC", key="deck", tid=tid, dir=direction, qty=kz["qty"])
            self.store.save_ticket(t)
            return
        await self._execute(t)

    async def approve(self, tid: str) -> str:
        t = self.tickets.get(tid)
        if not t or t["status"] != "on_deck":
            return "ticket is not on deck"
        if _now() * 1000 >= t["horizon_ts"]:
            t.update({"status": "expired", "settled": _now(), "pnl": 0.0})
            self.store.save_ticket(t)
            self.log_event("taker", "PASS", None, f"ticket {tid} expired before approval", key="expired", tid=tid)
            self._reset_desks()
            return "ticket expired"
        self.log_event("core", "SYSTEM", None, f"ticket {tid} approved by operator", key="approved", tid=tid)
        await self._execute(t)
        return "ok"

    def reject(self, tid: str) -> str:
        t = self.tickets.get(tid)
        if not t or t["status"] != "on_deck":
            return "ticket is not on deck"
        t.update({"status": "rejected", "settled": _now(), "pnl": 0.0})
        self.store.save_ticket(t)
        self.log_event("core", "SYSTEM", None, f"ticket {tid} rejected by operator", key="rejected", tid=tid)
        self._reset_desks()
        return "ok"

    async def _execute(self, t: dict):
        tid = t["id"]
        self.holder, self.stage = "taker", 4
        await self._dwell("taker", 3)
        mark = self.mark_price()
        direction, qty = t["direction"], t["qty"]
        r = self.s.risk
        sl = mark * (1 - r.stop_loss_pct) if direction == "UP" else mark * (1 + r.stop_loss_pct)
        tp = mark * (1 + r.take_profit_pct) if direction == "UP" else mark * (1 - r.take_profit_pct)
        try:
            pos = await self.broker.open(tid, direction, qty, mark, round(sl, 1), round(tp, 1))
        except Exception as e:
            self.log_event("taker", "FILL", None, f"order failed · {e}", key="order_fail", err=str(e))
            t.update({"status": "failed", "settled": _now(), "pnl": 0.0, "error": str(e)})
            self.store.save_ticket(t)
            self._reset_desks()
            return
        self.positions[tid] = pos
        t.update({"status": "open", "entry": round(pos.entry, 2), "sl": round(sl, 1), "tp": round(tp, 1),
                  "fee": round(pos.fee, 4), "position": pos.dict(), "stage": 5})
        self.store.save_ticket(t)
        self.log_event(
            "taker", "FILL", f"${pos.entry * qty:,.0f}",
            f"{'bought' if direction == 'UP' else 'sold'} {qty} BTC at ${pos.entry:,.1f} · sl ${sl:,.0f} · tp ${tp:,.0f} · {self.broker.name}",
            key="fill", dir=direction, qty=qty, entry=f"${pos.entry:,.1f}", sl=f"${sl:,.0f}", tp=f"${tp:,.0f}", broker=self.broker.name,
        )
        self._desk_state("taker", "done", 1.0)
        self._handoff()
        self.holder, self.stage = "closer", 5
        self._desk_state("closer", "run", 0.15, "holding to horizon")

    def _reset_desks(self):
        for name, _ in DESKS:
            self._desk_state(name, "idle", 0.0)
        self.holder = "spotter"
        self.stage = 0

    # ------------------------------------------------------------------ research notes
    def _research_note(self, n: int):
        if not self.market:
            return
        m, f, an = self.market, self.features, self.analog_state
        unreal = _fmt_money(sum(t.get("unrealized", 0) for t in self.tickets.values() if t["status"] == "open"))
        binding = self.model.get("kelly", {}).get("binding", "-")
        notes = [
            ("spotter", "RESEARCH", None, f"rescan · {len(self.candles_1m):,} 1m bars · vol z {f.vol_z:+.2f} · atr {f.atr_pct:.2f}%",
             dict(key="r_spotter", n=f"{len(self.candles_1m):,}", volz=f"{f.vol_z:+.2f}", atr=f"{f.atr_pct:.2f}%")),
            ("prior", "RESEARCH", None, f"analog scan {an.get('scanned', 0):,} windows · best dtw {an.get('dtw', 0):.3f} · {an.get('up', 0)}↑ {an.get('down', 0)}↓ over {an.get('horizon', 24)} bars",
             dict(key="r_prior", n=f"{an.get('scanned', 0):,}", dtw=f"{an.get('dtw', 0):.3f}", up=an.get("up", 0), down=an.get("down", 0), h=an.get("horizon", 24))),
            ("edge", "RESEARCH", None, f"book imbalance {m['imbalance']:+.3f} over 50 levels · spread ${m['spread']:.2f} · funding {m['funding']*100:+.4f}%",
             dict(key="r_edge", imb=f"{m['imbalance']:+.3f}", spread=f"${m['spread']:.2f}", funding=f"{m['funding']*100:+.4f}%")),
            ("kelly", "RESEARCH", None, f"drawdown {self.dd_now()*100:.2f}% of {self.s.risk.daily_drawdown_guard*100:.1f}% guard · notch {self.dd_notch()}/10 · cap by {binding}",
             dict(key="r_kelly", dd=f"{self.dd_now()*100:.2f}%", guard=f"{self.s.risk.daily_drawdown_guard*100:.1f}%", notch=self.dd_notch(), binding=binding)),
            ("taker", "RESEARCH", None, f"mark ${m['mark']:,.1f} · index ${m['index']:,.1f} · oi {m['oi']:,.0f} BTC",
             dict(key="r_taker", mark=f"${m['mark']:,.1f}", index=f"${m['index']:,.1f}", oi=f"{m['oi']:,.0f}")),
            ("closer", "RESEARCH", None, f"{len(self.positions)} open · unrealized {unreal}",
             dict(key="r_closer", n=len(self.positions), unreal=unreal)),
        ]
        agent, action, amount, text, kw = notes[n % len(notes)]
        self.log_event(agent, action, amount, text, **kw)

    def log_event(self, agent: str, action: str, amount: str | None, text: str, key: str | None = None, **p):
        """English text is the record; `key` + params let the UI re-render the line in another language."""
        e = {"ts": _now(), "agent": agent, "action": action, "amount": amount, "text": text}
        if key:
            e["key"] = key
            e["p"] = p
        self.log.append(e)
        try:
            self.store.add_log(e)
        except Exception:
            pass
        self.dirty = True

    # ------------------------------------------------------------------ snapshot
    def snapshot(self) -> dict:
        now = _now()
        hpm = sum(1 for h in self.handoffs if h >= now - 60)
        open_t = [t for t in self.tickets.values() if t["status"] in ("routing", "on_deck", "open")]
        recent = sorted(self.tickets.values(), key=lambda t: t["created"], reverse=True)[:30]
        st = self.stats()
        an = dict(self.analog_state)
        return {
            "ts": now, "symbol": self.s.symbol, "mode": self.s.mode, "paused": self.s.paused,
            "approvals_only": self.s.approvals_only, "online": self.online, "halted": self.halted,
            "uptime_s": int(now - self.started), "handoffs_total": self.handoffs_total, "handoffs_per_min": hpm,
            "market": self.market, "model": self.model,
            "candles_1m": list(self.candles_1m)[-200:], "candles_15m": list(self.candles_15m)[-120:],
            "desks": {k: {"state": v["state"], "progress": v["progress"], "gauge": v["gauge"], "history": list(v["history"]), "note": v["note"]} for k, v in self.desks.items()},
            "stage": {"index": self.stage, "name": DESKS[self.stage][1], "holder": self.holder},
            "analog": an,
            "tickets": {"open": open_t, "recent": recent},
            "ledger": {
                "equity": round(self.equity, 2), "seed": self.seed, "cash": round(getattr(self.broker, "cash", 0.0), 2),
                "unrealized": round(sum(t.get("unrealized", 0) for t in open_t), 2),
                "roi": round((self.equity / self.seed - 1) * 100, 3) if self.seed else 0.0,
                "dd_now": round(self.dd_now(), 4), "dd_notch": self.dd_notch(), "day_peak": round(self.day_peak, 2),
                "history": list(self.equity_hist)[-400:], **st,
            },
            "risk": self.s.risk.__dict__, "has_keys": bool(self.s.api_key and self.s.api_secret),
            "log": list(self.log)[-80:], "tape": list(self.tape)[-30:],
            "day": self.day.isoformat(),
        }
