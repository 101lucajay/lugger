"""In-process pub/sub that fans events out to every connected dashboard (WebSocket)."""
from __future__ import annotations

import asyncio
import json
from typing import Any


class EventBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    def publish(self, event_type: str, data: Any) -> None:
        msg = json.dumps({"type": event_type, "data": data}, ensure_ascii=False, default=str)
        for q in list(self._subscribers):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                pass  # slow client: drop


bus = EventBus()


# ---- internal domain events (used by the automation engine) ----
_handlers: list = []


def on_event(fn) -> None:
    _handlers.append(fn)


def emit_event(name: str, data: Any | None = None) -> None:
    for fn in list(_handlers):
        try:
            fn(name, data or {})
        except Exception:  # noqa: BLE001 - an automation must never break the pipeline
            import traceback
            traceback.print_exc()
