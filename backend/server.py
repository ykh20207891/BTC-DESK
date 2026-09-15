"""FastAPI server: static UI, JSON state, WebSocket push, operator controls (token-gated when configured)."""
from __future__ import annotations

import json
import logging
import logging.handlers
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import DATA_DIR, Settings
from .engine import Engine

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"


def setup_logging() -> None:
    """Rotating file log next to the ledger, plus the console uvicorn already writes to."""
    root = logging.getLogger()
    if any(getattr(h, "_btcdesk", False) for h in root.handlers):
        return
    fh = logging.handlers.RotatingFileHandler(DATA_DIR / "engine.log", maxBytes=5_000_000, backupCount=5, encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    fh._btcdesk = True  # type: ignore[attr-defined]
    root.addHandler(fh)
    root.setLevel(logging.INFO)
    logging.getLogger("btcdesk").setLevel(logging.INFO)


def create_app(engine: Engine | None = None) -> FastAPI:
    setup_logging()
    eng = engine or Engine(Settings.load())

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if eng.s.host not in ("127.0.0.1", "localhost", "::1") and not eng.s.desk_token:
            logging.getLogger("btcdesk").warning("HOST=%s exposes the control API without DESK_TOKEN; anyone on the network can pause or re-mode the desk", eng.s.host)
        await eng.start()
        try:
            yield
        finally:
            await eng.stop()

    app = FastAPI(title="BTC DESK", lifespan=lifespan)
    app.state.engine = eng

    class NoCacheStatic(StaticFiles):
        def file_response(self, *args, **kwargs):
            resp = super().file_response(*args, **kwargs)
            resp.headers["Cache-Control"] = "no-cache"
            return resp

    app.mount("/static", NoCacheStatic(directory=str(FRONTEND)), name="static")

    def require_token(request: Request) -> None:
        token = eng.s.desk_token
        if not token:
            return
        given = request.headers.get("x-desk-token") or request.query_params.get("token")
        if given != token:
            raise HTTPException(401, "desk token required")

    @app.api_route("/", methods=["GET", "HEAD"])
    async def index():
        return FileResponse(FRONTEND / "index.html", headers={"Cache-Control": "no-store"})

    @app.get("/api/health")
    async def health():
        h = eng.health()
        return JSONResponse(h, status_code=200 if h["ok"] else 503)

    @app.get("/api/state")
    async def state():
        return JSONResponse(eng.snapshot())

    @app.get("/api/settings")
    async def get_settings():
        return eng.s.public()

    @app.post("/api/settings")
    async def patch_settings(patch: dict, request: Request):
        require_token(request)
        try:
            changed = eng.s.apply(patch)
        except ValueError as e:
            raise HTTPException(400, str(e))
        if changed:
            eng.log_event("core", "SYSTEM", None, "settings changed · " + ", ".join(changed), key="settings", fields=", ".join(changed))
        return {"changed": changed, "settings": eng.s.public()}

    @app.post("/api/control")
    async def control(body: dict, request: Request):
        require_token(request)
        action = body.get("action")
        if action == "pause":
            eng.s.apply({"paused": True})
            eng.log_event("core", "HOLD", None, "operator paused the swarm · open tickets still settle", key="op_pause")
        elif action == "resume":
            eng.s.apply({"paused": False})
            eng.log_event("core", "SYSTEM", None, "operator resumed the swarm", key="op_resume")
        elif action == "approvals":
            eng.s.apply({"approvals_only": bool(body.get("value"))})
            eng.log_event("core", "SYSTEM", None, f"approvals-only {'on' if eng.s.approvals_only else 'off'}", key="op_approvals", on=eng.s.approvals_only)
        elif action == "approve":
            msg = await eng.approve(str(body.get("ticket_id", "")))
            if msg != "ok":
                raise HTTPException(400, msg)
        elif action == "reject":
            msg = eng.reject(str(body.get("ticket_id", "")))
            if msg != "ok":
                raise HTTPException(400, msg)
        elif action == "scan":
            eng._schedule_pipeline(reason="manual scan")
        elif action == "mode":
            try:
                eng.s.apply({"mode": body.get("value")})
            except ValueError as e:
                raise HTTPException(400, str(e))
            eng.log_event("core", "SYSTEM", None, f"mode set to {eng.s.mode} · restart the engine to switch the broker", key="op_mode", mode=eng.s.mode.upper())
        else:
            raise HTTPException(400, "unknown action")
        eng.dirty = True
        return {"ok": True, "settings": eng.s.public()}

    @app.get("/api/tickets")
    async def tickets(limit: int = 100):
        return eng.store.load_tickets(min(max(limit, 1), 1000))

    @app.websocket("/ws")
    async def ws_endpoint(ws: WebSocket):
        await ws.accept()
        eng.clients.add(ws)
        try:
            await ws.send_text(json.dumps({"type": "state", "state": eng.snapshot()}, separators=(",", ":")))
            while True:
                raw = await ws.receive_text()
                try:
                    msg = json.loads(raw)
                except ValueError:
                    continue
                if msg.get("type") == "ping":
                    await ws.send_text('{"type":"pong"}')
        except WebSocketDisconnect:
            pass
        except Exception:  # a broken client must not raise out of the handler
            pass
        finally:
            eng.clients.discard(ws)

    return app


app = create_app()
