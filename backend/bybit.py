"""Minimal Bybit v5 client: signed REST + public WebSocket (linear USDT perpetuals)."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import ssl
import time
from typing import Any, Awaitable, Callable

import httpx
import websockets

MAINNET_REST = "https://api.bybit.com"
TESTNET_REST = "https://api-testnet.bybit.com"
MAINNET_WS = "wss://stream.bybit.com/v5/public/linear"
TESTNET_WS = "wss://stream-testnet.bybit.com/v5/public/linear"


class BybitError(RuntimeError):
    pass


def ssl_context() -> ssl.SSLContext:
    """Default verification, minus the X509_STRICT flag Python 3.13+ enables by default.

    Bybit's certificate chain carries a CA whose basicConstraints extension is not marked
    critical, which strict mode rejects. Hostname and chain verification stay on.
    """
    ctx = ssl.create_default_context()
    try:
        import certifi  # bundled with httpx
        ctx.load_verify_locations(certifi.where())
    except Exception:
        pass
    ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return ctx


SSL_CTX = ssl_context()


class BybitREST:
    def __init__(self, api_key: str = "", api_secret: str = "", testnet: bool = False, recv_window: int = 5000):
        self.base = TESTNET_REST if testnet else MAINNET_REST
        self.key = api_key
        self.secret = api_secret
        self.recv_window = recv_window
        self._client = httpx.AsyncClient(base_url=self.base, timeout=10.0, verify=SSL_CTX)

    async def close(self):
        await self._client.aclose()

    # ---------- signing ----------
    def _headers(self, payload: str) -> dict:
        ts = str(int(time.time() * 1000))
        raw = ts + self.key + str(self.recv_window) + payload
        sig = hmac.new(self.secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
        return {
            "X-BAPI-API-KEY": self.key,
            "X-BAPI-TIMESTAMP": ts,
            "X-BAPI-RECV-WINDOW": str(self.recv_window),
            "X-BAPI-SIGN": sig,
            "X-BAPI-SIGN-TYPE": "2",
            "Content-Type": "application/json",
        }

    async def _get(self, path: str, params: dict, private: bool = False) -> dict:
        params = {k: v for k, v in params.items() if v is not None}
        headers = None
        if private:
            qs = "&".join(f"{k}={v}" for k, v in params.items())
            headers = self._headers(qs)
        r = await self._client.get(path, params=params, headers=headers)
        r.raise_for_status()
        data = r.json()
        if data.get("retCode") != 0:
            raise BybitError(f"{path}: {data.get('retCode')} {data.get('retMsg')}")
        return data["result"]

    async def _post(self, path: str, body: dict) -> dict:
        payload = json.dumps(body, separators=(",", ":"))
        r = await self._client.post(path, content=payload, headers=self._headers(payload))
        r.raise_for_status()
        data = r.json()
        if data.get("retCode") != 0:
            raise BybitError(f"{path}: {data.get('retCode')} {data.get('retMsg')}")
        return data["result"]

    # ---------- public ----------
    async def klines(self, symbol: str, interval: str, limit: int = 1000, end: int | None = None) -> list[list[float]]:
        """Returns oldest-first rows [start_ms, o, h, l, c, v]."""
        res = await self._get(
            "/v5/market/kline",
            {"category": "linear", "symbol": symbol, "interval": interval, "limit": limit, "end": end},
        )
        rows = [[int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5])] for r in res["list"]]
        rows.sort(key=lambda r: r[0])
        return rows

    async def klines_history(self, symbol: str, interval: str, total: int) -> list[list[float]]:
        out: list[list[float]] = []
        end = None
        while len(out) < total:
            batch = await self.klines(symbol, interval, min(1000, total - len(out)), end)
            if not batch:
                break
            out = batch + out
            end = batch[0][0] - 1
            if len(batch) < 1000:
                break
        return out

    async def ticker(self, symbol: str) -> dict:
        res = await self._get("/v5/market/tickers", {"category": "linear", "symbol": symbol})
        return res["list"][0]

    async def orderbook(self, symbol: str, limit: int = 50) -> dict:
        return await self._get("/v5/market/orderbook", {"category": "linear", "symbol": symbol, "limit": limit})

    async def instrument(self, symbol: str) -> dict:
        res = await self._get("/v5/market/instruments-info", {"category": "linear", "symbol": symbol})
        return res["list"][0]

    # ---------- private ----------
    async def wallet_balance(self) -> dict:
        res = await self._get("/v5/account/wallet-balance", {"accountType": "UNIFIED"}, private=True)
        return res["list"][0]

    async def set_leverage(self, symbol: str, leverage: float) -> dict:
        lev = f"{leverage:g}"
        try:
            return await self._post(
                "/v5/position/set-leverage",
                {"category": "linear", "symbol": symbol, "buyLeverage": lev, "sellLeverage": lev},
            )
        except BybitError as e:
            if "110043" in str(e):  # leverage not modified
                return {}
            raise

    async def market_order(
        self, symbol: str, side: str, qty: float, reduce_only: bool = False,
        take_profit: float | None = None, stop_loss: float | None = None,
    ) -> dict:
        body: dict[str, Any] = {
            "category": "linear", "symbol": symbol, "side": side, "orderType": "Market",
            "qty": f"{qty:.3f}", "timeInForce": "IOC", "reduceOnly": reduce_only, "positionIdx": 0,
        }
        if take_profit:
            body["takeProfit"] = f"{take_profit:.1f}"
        if stop_loss:
            body["stopLoss"] = f"{stop_loss:.1f}"
        return await self._post("/v5/order/create", body)

    async def positions(self, symbol: str) -> list[dict]:
        res = await self._get("/v5/position/list", {"category": "linear", "symbol": symbol}, private=True)
        return res["list"]

    async def order_status(self, symbol: str, order_id: str) -> dict | None:
        res = await self._get(
            "/v5/order/realtime", {"category": "linear", "symbol": symbol, "orderId": order_id}, private=True
        )
        lst = res.get("list") or []
        if lst:
            return lst[0]
        res = await self._get(
            "/v5/order/history", {"category": "linear", "symbol": symbol, "orderId": order_id}, private=True
        )
        lst = res.get("list") or []
        return lst[0] if lst else None


class BybitPublicWS:
    """Public stream with auto-reconnect and a 20 s heartbeat."""

    def __init__(
        self, topics: list[str], on_message: Callable[[dict], Awaitable[None] | None],
        on_status: Callable[[bool], None] | None = None, testnet: bool = False,
    ):
        self.url = TESTNET_WS if testnet else MAINNET_WS
        self.topics = topics
        self.on_message = on_message
        self.on_status = on_status
        self.connected = False
        self._stop = False

    async def run(self):
        backoff = 1.0
        while not self._stop:
            try:
                async with websockets.connect(self.url, ping_interval=None, max_size=2**22, ssl=SSL_CTX) as ws:
                    await ws.send(json.dumps({"op": "subscribe", "args": self.topics}))
                    self.connected = True
                    if self.on_status:
                        self.on_status(True)
                    backoff = 1.0
                    ping_task = asyncio.create_task(self._heartbeat(ws))
                    try:
                        async for raw in ws:
                            msg = json.loads(raw)
                            if "topic" not in msg:
                                continue
                            res = self.on_message(msg)
                            if asyncio.iscoroutine(res):
                                await res
                    finally:
                        ping_task.cancel()
            except asyncio.CancelledError:
                raise
            except Exception:
                pass
            self.connected = False
            if self.on_status:
                self.on_status(False)
            if self._stop:
                break
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30.0)

    async def _heartbeat(self, ws):
        while True:
            await asyncio.sleep(20)
            try:
                await ws.send(json.dumps({"op": "ping"}))
            except Exception:
                return

    def stop(self):
        self._stop = True
