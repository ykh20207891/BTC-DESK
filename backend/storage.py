"""SQLite ledger: tickets, equity history, activity log, key-value state."""
from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path


class Storage:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, created REAL, status TEXT, body TEXT);
            CREATE TABLE IF NOT EXISTS equity (ts REAL, equity REAL);
            CREATE TABLE IF NOT EXISTS log (ts REAL, agent TEXT, action TEXT, amount TEXT, text TEXT);
            CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
            CREATE INDEX IF NOT EXISTS ix_equity_ts ON equity(ts);
            CREATE INDEX IF NOT EXISTS ix_log_ts ON log(ts);
            """
        )

    # ---- tickets ----
    def save_ticket(self, t: dict) -> None:
        with self._lock:
            self.db.execute(
                "INSERT OR REPLACE INTO tickets (id, created, status, body) VALUES (?,?,?,?)",
                (t["id"], t["created"], t["status"], json.dumps(t)),
            )
            self.db.commit()

    def load_tickets(self, limit: int = 200) -> list[dict]:
        rows = self.db.execute("SELECT body FROM tickets ORDER BY created DESC LIMIT ?", (limit,)).fetchall()
        return [json.loads(r[0]) for r in rows]

    # ---- equity ----
    def add_equity(self, ts: float, equity: float) -> None:
        with self._lock:
            self.db.execute("INSERT INTO equity (ts, equity) VALUES (?,?)", (ts, equity))
            self.db.commit()

    def load_equity(self, limit: int = 2000) -> list[list[float]]:
        rows = self.db.execute("SELECT ts, equity FROM equity ORDER BY ts DESC LIMIT ?", (limit,)).fetchall()
        return [[r[0], r[1]] for r in reversed(rows)]

    # ---- log ----
    def add_log(self, e: dict) -> None:
        with self._lock:
            self.db.execute(
                "INSERT INTO log (ts, agent, action, amount, text) VALUES (?,?,?,?,?)",
                (e["ts"], e["agent"], e["action"], e.get("amount"), e["text"]),
            )
            self.db.commit()

    def load_log(self, limit: int = 120) -> list[dict]:
        rows = self.db.execute(
            "SELECT ts, agent, action, amount, text FROM log ORDER BY ts DESC LIMIT ?", (limit,)
        ).fetchall()
        return [
            {"ts": r[0], "agent": r[1], "action": r[2], "amount": r[3], "text": r[4]} for r in reversed(rows)
        ]

    # ---- kv ----
    def get(self, key: str, default=None):
        row = self.db.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def set(self, key: str, value) -> None:
        with self._lock:
            self.db.execute("INSERT OR REPLACE INTO kv (key, value) VALUES (?,?)", (key, json.dumps(value)))
            self.db.commit()
