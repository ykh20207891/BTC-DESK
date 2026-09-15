"""HTTP surface: health codes, token gate, validation, websocket push."""
from __future__ import annotations

import json

from fastapi.testclient import TestClient

from backend.engine import Engine
from backend.server import create_app


def _client(settings, rest, store, token=""):
    settings.desk_token = token
    eng = Engine(settings, store=store, rest=rest)
    return TestClient(create_app(eng)), eng


def test_health_state_and_websocket(settings, rest, store):
    client, _eng = _client(settings, rest, store)
    with client:
        r = client.get("/api/health")
        assert r.status_code == 200 and r.json()["ok"] is True and r.json()["mode"] == "paper"
        s = client.get("/api/state").json()
        assert s["online"] and s["model"]["p_up"] is not None and "health" in s and "candles_1m" in s
        with client.websocket_connect("/ws") as ws:
            msg = json.loads(ws.receive_text())
            assert msg["type"] == "state" and msg["state"]["symbol"] == "BTCUSDT"
            ws.send_text('{"type":"ping"}')
            assert json.loads(ws.receive_text())["type"] == "pong"
        assert client.get("/api/tickets?limit=5").status_code == 200
        pub = client.get("/api/settings").json()
        assert "api_key" not in pub and "desk_token" not in pub


def test_controls_require_token_when_configured_and_validate(settings, rest, store):
    client, eng = _client(settings, rest, store, token="secret")
    with client:
        assert client.post("/api/control", json={"action": "pause"}).status_code == 401
        r = client.post("/api/control", json={"action": "pause"}, headers={"X-Desk-Token": "secret"})
        assert r.status_code == 200 and eng.s.paused is True
        r = client.post("/api/control?token=secret", json={"action": "resume"})
        assert r.status_code == 200 and eng.s.paused is False
        assert client.post("/api/control", json={"action": "nope"}, headers={"X-Desk-Token": "secret"}).status_code == 400
        assert client.post("/api/settings", json={"risk": {"max_leverage": 99}}, headers={"X-Desk-Token": "secret"}).status_code == 400
        assert client.post("/api/control", json={"action": "mode", "value": "live"}, headers={"X-Desk-Token": "secret"}).status_code == 400
        r = client.post("/api/settings", json={"risk": {"min_edge_cents": 3}}, headers={"X-Desk-Token": "secret"})
        assert r.status_code == 200 and eng.s.risk.min_edge_cents == 3


def test_health_reports_503_when_stream_is_stale(settings, rest, store):
    client, eng = _client(settings, rest, store)
    with client:
        eng.online = False
        assert client.get("/api/health").status_code == 503
