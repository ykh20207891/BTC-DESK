"""FastAPI server: static UI, JSON state, WebSocket push, operator controls."""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import Settings
from .engine import Engine

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"

engine = Engine(Settings.load())


@asynccontextmanager
async def lifespan(app: FastAPI):
    await engine.start()
    try:
        yield
    finally:
        await engine.stop()


app = FastAPI(title="BTC DESK", lifespan=lifespan)


class NoCacheStatic(StaticFiles):
    """Static files that always revalidate, so UI edits never hide behind a cached copy."""

    def file_response(self, *args, **kwargs):
        resp = super().file_response(*args, **kwargs)
        resp.headers["Cache-Control"] = "no-cache"
        return resp


app.mount("/static", NoCacheStatic(directory=str(FRONTEND)), name="static")


@app.api_route("/", methods=["GET", "HEAD"])
async def index():
    return FileResponse(FRONTEND / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/api/health")
async def health():
    return {"ok": True, "online": engine.online, "mode": engine.s.mode}


@app.get("/api/state")
async def state():
    return JSONResponse(engine.snapshot())


@app.get("/api/settings")
async def get_settings():
    return engine.s.public()


@app.post("/api/settings")
async def patch_settings(patch: dict):
    try:
        changed = engine.s.apply(patch)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if changed:
        engine.log_event("core", "SYSTEM", None, "settings changed · " + ", ".join(changed))
    return {"changed": changed, "settings": engine.s.public()}


@app.post("/api/control")
async def control(body: dict):
    action = body.get("action")
    if action == "pause":
        engine.s.apply({"paused": True})
        engine.log_event("core", "HOLD", None, "operator paused the swarm · open tickets still settle")
    elif action == "resume":
        engine.s.apply({"paused": False})
        engine.log_event("core", "SYSTEM", None, "operator resumed the swarm")
    elif action == "approvals":
        engine.s.apply({"approvals_only": bool(body.get("value"))})
        engine.log_event("core", "SYSTEM", None, f"approvals-only {'on' if engine.s.approvals_only else 'off'}")
    elif action == "approve":
        msg = await engine.approve(str(body.get("ticket_id", "")))
        if msg != "ok":
            raise HTTPException(400, msg)
    elif action == "reject":
        msg = engine.reject(str(body.get("ticket_id", "")))
        if msg != "ok":
            raise HTTPException(400, msg)
    elif action == "scan":
        engine._schedule_pipeline(reason="manual scan")
    elif action == "mode":
        try:
            engine.s.apply({"mode": body.get("value")})
        except ValueError as e:
            raise HTTPException(400, str(e))
        engine.log_event("core", "SYSTEM", None, f"mode set to {engine.s.mode} · restart the engine to switch the broker")
    else:
        raise HTTPException(400, "unknown action")
    engine.dirty = True
    return {"ok": True, "settings": engine.s.public()}


@app.get("/api/tickets")
async def tickets(limit: int = 100):
    return engine.store.load_tickets(limit)


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    engine.clients.add(ws)
    try:
        await ws.send_text(json.dumps({"type": "state", "state": engine.snapshot()}, separators=(",", ":")))
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if msg.get("type") == "ping":
                await ws.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        engine.clients.discard(ws)
