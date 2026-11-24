"""SQLite persistence: ideas, videos, logs, settings."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from .paths import DATA_DIR

DB_PATH = DATA_DIR / "lugger.db"
_lock = threading.RLock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    angle TEXT,
    hook TEXT,
    why_now TEXT,
    sources TEXT,
    score REAL DEFAULT 5,
    origin TEXT DEFAULT 'trend_scout',
    status TEXT DEFAULT 'new',
    created_at REAL
);
CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idea_id INTEGER,
    topic TEXT NOT NULL,
    status TEXT NOT NULL,
    script TEXT,
    title TEXT,
    duration REAL,
    video_path TEXT,
    thumb_path TEXT,
    error TEXT,
    publish_results TEXT,
    created_at REAL,
    updated_at REAL
);
CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL,
    agent TEXT,
    level TEXT,
    message TEXT,
    video_id INTEGER
);
CREATE TABLE IF NOT EXISTS automations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    enabled INTEGER DEFAULT 1,
    trigger TEXT,
    steps TEXT,
    webhook_token TEXT,
    last_run_at REAL,
    last_status TEXT,
    last_slot TEXT,
    run_count INTEGER DEFAULT 0,
    created_at REAL,
    updated_at REAL
);
CREATE TABLE IF NOT EXISTS automation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    automation_id INTEGER,
    started_at REAL,
    finished_at REAL,
    status TEXT,
    trigger TEXT,
    results TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_auto ON automation_runs(automation_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
"""


def conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.executescript(SCHEMA)
    return _conn


def execute(sql: str, params: tuple | list = ()) -> sqlite3.Cursor:
    with _lock:
        return conn().execute(sql, params)


def query(sql: str, params: tuple | list = ()) -> list[dict[str, Any]]:
    with _lock:
        return [dict(r) for r in conn().execute(sql, params).fetchall()]


def query_one(sql: str, params: tuple | list = ()) -> dict[str, Any] | None:
    rows = query(sql, params)
    return rows[0] if rows else None


# ---------- settings ----------

def get_setting_raw(key: str) -> str | None:
    row = query_one("SELECT value FROM settings WHERE key=?", (key,))
    return row["value"] if row else None


def set_setting_raw(key: str, value: str) -> None:
    execute(
        "INSERT INTO settings(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )


def all_settings_raw() -> dict[str, str]:
    return {r["key"]: r["value"] for r in query("SELECT key, value FROM settings")}


# ---------- ideas ----------

def add_idea(title: str, angle: str = "", hook: str = "", why_now: str = "",
             sources: list[str] | None = None, score: float = 5, origin: str = "trend_scout") -> int:
    cur = execute(
        "INSERT INTO ideas(title, angle, hook, why_now, sources, score, origin, status, created_at) "
        "VALUES(?,?,?,?,?,?,?, 'new', ?)",
        (title, angle, hook, why_now, json.dumps(sources or []), score, origin, time.time()),
    )
    return cur.lastrowid


def get_idea(idea_id: int) -> dict | None:
    row = query_one("SELECT * FROM ideas WHERE id=?", (idea_id,))
    if row:
        row["sources"] = json.loads(row["sources"] or "[]")
    return row


def list_ideas(status: str | None = None, limit: int = 200) -> list[dict]:
    if status:
        rows = query("SELECT * FROM ideas WHERE status=? ORDER BY score DESC, id DESC LIMIT ?", (status, limit))
    else:
        rows = query("SELECT * FROM ideas ORDER BY id DESC LIMIT ?", (limit,))
    for r in rows:
        r["sources"] = json.loads(r["sources"] or "[]")
    return rows


def update_idea(idea_id: int, **fields) -> None:
    if not fields:
        return
    cols = ", ".join(f"{k}=?" for k in fields)
    execute(f"UPDATE ideas SET {cols} WHERE id=?", (*fields.values(), idea_id))


# ---------- videos ----------

def create_video(topic: str, idea_id: int | None = None) -> int:
    now = time.time()
    cur = execute(
        "INSERT INTO videos(idea_id, topic, status, created_at, updated_at, publish_results) "
        "VALUES(?,?, 'queued', ?, ?, '{}')",
        (idea_id, topic, now, now),
    )
    return cur.lastrowid


def _decode_video(row: dict) -> dict:
    row["script"] = json.loads(row["script"]) if row.get("script") else None
    row["publish_results"] = json.loads(row["publish_results"] or "{}")
    return row


def get_video(video_id: int) -> dict | None:
    row = query_one("SELECT * FROM videos WHERE id=?", (video_id,))
    return _decode_video(row) if row else None


def list_videos(limit: int = 100) -> list[dict]:
    return [_decode_video(r) for r in query("SELECT * FROM videos ORDER BY id DESC LIMIT ?", (limit,))]


def update_video(video_id: int, **fields) -> None:
    if not fields:
        return
    for k in ("script", "publish_results"):
        if k in fields and not isinstance(fields[k], str) and fields[k] is not None:
            fields[k] = json.dumps(fields[k], ensure_ascii=False)
    fields["updated_at"] = time.time()
    cols = ", ".join(f"{k}=?" for k in fields)
    execute(f"UPDATE videos SET {cols} WHERE id=?", (*fields.values(), video_id))


def claim_video(from_status: str, to_status: str) -> dict | None:
    """Atomically move the oldest video in `from_status` to `to_status` and return it."""
    with _lock:
        row = query_one("SELECT id FROM videos WHERE status=? ORDER BY id ASC LIMIT 1", (from_status,))
        if not row:
            return None
        execute("UPDATE videos SET status=?, updated_at=? WHERE id=? AND status=?",
                (to_status, time.time(), row["id"], from_status))
        return get_video(row["id"])


def count_videos_since(ts: float) -> int:
    row = query_one("SELECT COUNT(*) AS n FROM videos WHERE created_at>=?", (ts,))
    return row["n"] if row else 0


# ---------- logs ----------

def add_log(agent: str, level: str, message: str, video_id: int | None = None) -> dict:
    ts = time.time()
    cur = execute("INSERT INTO logs(ts, agent, level, message, video_id) VALUES(?,?,?,?,?)",
                  (ts, agent, level, message, video_id))
    # keep table bounded
    if cur.lastrowid and cur.lastrowid % 500 == 0:
        execute("DELETE FROM logs WHERE id < ?", (cur.lastrowid - 5000,))
    return {"id": cur.lastrowid, "ts": ts, "agent": agent, "level": level,
            "message": message, "video_id": video_id}


def recent_logs(limit: int = 200, video_id: int | None = None, agent: str | None = None) -> list[dict]:
    if agent:
        rows = query("SELECT * FROM logs WHERE agent=? ORDER BY id DESC LIMIT ?", (agent, limit))
    elif video_id:
        rows = query("SELECT * FROM logs WHERE video_id=? ORDER BY id DESC LIMIT ?", (video_id, limit))
    else:
        rows = query("SELECT * FROM logs ORDER BY id DESC LIMIT ?", (limit,))
    return list(reversed(rows))
