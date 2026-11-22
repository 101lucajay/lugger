"""Base class every agent in the station inherits from.

Each agent runs its own asyncio loop: look for work -> process it -> report live status.
Agents hand videos to each other through the `status` column of the videos table.
"""
from __future__ import annotations

import asyncio
import time
import traceback
from typing import Any

from .. import db
from ..events import bus, emit_event


class AgentError(Exception):
    """An expected, user-facing failure (missing key, API error...)."""


class Agent:
    key = "agent"
    name = "Agent"
    role = ""
    icon = "🤖"
    idle_interval = 3.0

    def __init__(self) -> None:
        self.enabled = True
        self.status = "idle"  # idle | working | paused | error | waiting
        self.task = ""
        self.progress: float | None = None
        self.video_id: int | None = None
        self.last_error = ""
        self.processed = 0
        self.failed = 0
        self.started_at: float | None = None
        self._kick = asyncio.Event()
        self._task: asyncio.Task | None = None

    # ---------- live state ----------
    def state(self) -> dict[str, Any]:
        return {
            "key": self.key, "name": self.name, "role": self.role, "icon": self.icon,
            "enabled": self.enabled, "status": self.status, "task": self.task,
            "progress": self.progress, "video_id": self.video_id,
            "last_error": self.last_error, "processed": self.processed, "failed": self.failed,
            "started_at": self.started_at, "manual": self.supports_manual_run,
        }

    def _emit(self) -> None:
        bus.publish("agent", self.state())

    def set_status(self, status: str, task: str | None = None, progress: float | None = None) -> None:
        self.status = status
        if task is not None:
            self.task = task
        self.progress = progress
        self._emit()

    def report(self, task: str, progress: float | None = None) -> None:
        """Update what the agent is doing right now (shown live in the station)."""
        self.task = task
        self.progress = progress
        self._emit()
        self.log(task)

    def log(self, message: str, level: str = "info", video_id: int | None = None) -> None:
        entry = db.add_log(self.key, level, message, video_id if video_id is not None else self.video_id)
        bus.publish("log", entry)

    # ---------- control ----------
    supports_manual_run = False

    def pause(self) -> None:
        self.enabled = False
        db.set_setting_raw(f"agent_enabled_{self.key}", "false")
        if self.status != "working":
            self.set_status("paused", "Pausiert")
        self.log("Agent pausiert")

    def resume(self) -> None:
        self.enabled = True
        db.set_setting_raw(f"agent_enabled_{self.key}", "true")
        if self.status in ("paused", "error"):
            self.set_status("idle", "Wartet auf Arbeit")
        self.log("Agent fortgesetzt")
        self.kick()

    def kick(self) -> None:
        self._kick.set()

    async def run_now(self) -> None:  # overridden by agents that support manual runs
        self.kick()

    # ---------- work loop ----------
    async def find_work(self) -> Any | None:
        raise NotImplementedError

    async def process(self, item: Any) -> None:
        raise NotImplementedError

    async def on_failure(self, item: Any, exc: Exception) -> None:
        """Called when process() raises. Default: mark the video as failed."""
        if isinstance(item, dict) and "id" in item and "topic" in item:
            db.update_video(item["id"], status="failed", error=f"[{self.name}] {exc}")
            bus.publish("video", db.get_video(item["id"]))
            emit_event("video.failed", {"id": item["id"], "topic": item["topic"], "agent": self.name, "error": str(exc)})

    def start(self) -> None:
        saved = db.get_setting_raw(f"agent_enabled_{self.key}")
        self.enabled = saved != "false"
        self.status = "idle" if self.enabled else "paused"
        self.task = "Wartet auf Arbeit" if self.enabled else "Pausiert"
        self._task = asyncio.create_task(self._loop(), name=f"agent-{self.key}")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass

    async def _sleep(self, seconds: float) -> None:
        try:
            await asyncio.wait_for(self._kick.wait(), timeout=seconds)
        except asyncio.TimeoutError:
            pass
        self._kick.clear()

    async def _loop(self) -> None:
        while True:
            try:
                if not self.enabled:
                    if self.status != "paused":
                        self.set_status("paused", "Pausiert")
                    await self._sleep(2)
                    continue
                item = await self.find_work()
                if item is None:
                    if self.status not in ("idle", "waiting", "error"):
                        self.video_id = None
                        self.started_at = None
                        self.set_status("idle", "Wartet auf Arbeit")
                    await self._sleep(self.idle_interval)
                    continue
                self.video_id = item.get("id") if isinstance(item, dict) and "topic" in item else None
                self.started_at = time.time()
                self.last_error = ""
                self.set_status("working", "Starte…", 0)
                try:
                    await self.process(item)
                    self.processed += 1
                    self.video_id = None
                    self.started_at = None
                    self.set_status("idle", "Fertig – wartet auf Arbeit")
                except asyncio.CancelledError:
                    raise
                except Exception as exc:  # noqa: BLE001
                    self.failed += 1
                    self.last_error = str(exc)
                    if not isinstance(exc, AgentError):
                        traceback.print_exc()
                    self.log(f"Fehler: {exc}", "error")
                    await self.on_failure(item, exc)
                    self.video_id = None
                    self.started_at = None
                    self.set_status("error", f"Fehler: {exc}"[:200])
                    await self._sleep(5)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - never let the loop die
                traceback.print_exc()
                self.last_error = str(exc)
                self.set_status("error", f"Interner Fehler: {exc}"[:200])
                await self._sleep(10)


class VideoStageAgent(Agent):
    """Agent that takes videos from one pipeline stage and moves them to the next."""
    input_status = ""
    working_status = ""
    output_status = ""

    async def find_work(self):
        video = db.claim_video(self.input_status, self.working_status)
        if video:
            bus.publish("video", video)
        return video

    def advance(self, video_id: int, status: str | None = None, **fields) -> None:
        db.update_video(video_id, status=status or self.output_status, error=None, **fields)
        bus.publish("video", db.get_video(video_id))
