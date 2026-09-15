"""SQLite ledger: tickets, equity history, activity log, key-value state, pruning."""
from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path


class Storage:
    def __init__(self, path: Path | str):
        self.path = path
        self._lock = threading.Lock()
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=NORMAL")
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, created REAL, status TEXT, body TEXT);
            CREATE TABLE IF NOT EXISTS equity (ts REAL, equity REAL);
            CREATE TABLE IF NOT EXISTS log (ts REAL, agent TEXT, action TEXT, amount TEXT, text TEXT, key TEXT, params TEXT);
            CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
            CREATE INDEX IF NOT EXISTS ix_equity_ts ON equity(ts);
            CREATE INDEX IF NOT EXISTS ix_log_ts ON log(ts);
            CREATE INDEX IF NOT EXISTS ix_tickets_created ON tickets(created);
            """
        )
        for col in ("key TEXT", "params TEXT"):
            try:
                self.db.execute(f"ALTER TABLE log ADD COLUMN {col}")
            except sqlite3.OperationalError:
                pass

    def close(self) -> None:
        with self._lock:
            self.db.commit()
            self.db.close()

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

    def load_open_tickets(self) -> list[dict]:
        rows = self.db.execute("SELECT body FROM tickets WHERE status IN ('open','on_deck','routing') ORDER BY created").fetchall()
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
                "INSERT INTO log (ts, agent, action, amount, text, key, params) VALUES (?,?,?,?,?,?,?)",
                (e["ts"], e["agent"], e["action"], e.get("amount"), e["text"], e.get("key"),
                 json.dumps(e.get("p") or {}) if e.get("key") else None),
            )
            self.db.commit()

    def load_log(self, limit: int = 120) -> list[dict]:
        rows = self.db.execute(
            "SELECT ts, agent, action, amount, text, key, params FROM log ORDER BY ts DESC LIMIT ?", (limit,)
        ).fetchall()
        out = []
        for r in reversed(rows):
            e = {"ts": r[0], "agent": r[1], "action": r[2], "amount": r[3], "text": r[4]}
            if r[5]:
                e["key"] = r[5]
                try:
                    e["p"] = json.loads(r[6] or "{}")
                except ValueError:
                    e["p"] = {}
            out.append(e)
        return out

    # ---- maintenance ----
    def prune(self, keep_log: int = 20_000, keep_equity: int = 200_000, keep_tickets: int = 5_000) -> dict:
        """Keep the tables bounded on a machine that runs for months."""
        with self._lock:
            n = {}
            for table, ts_col, keep in (("log", "ts", keep_log), ("equity", "ts", keep_equity), ("tickets", "created", keep_tickets)):
                cur = self.db.execute(
                    f"DELETE FROM {table} WHERE {ts_col} < (SELECT COALESCE(MIN({ts_col}), 0) FROM (SELECT {ts_col} FROM {table} ORDER BY {ts_col} DESC LIMIT ?))",
                    (keep,),
                )
                n[table] = cur.rowcount
            self.db.commit()
            return n

    # ---- kv ----
    def get(self, key: str, default=None):
        row = self.db.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def set(self, key: str, value) -> None:
        with self._lock:
            self.db.execute("INSERT OR REPLACE INTO kv (key, value) VALUES (?,?)", (key, json.dumps(value)))
            self.db.commit()
