"""Produktionsleiter: decides *when* a new video is produced and picks the best idea."""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

from .. import config, db
from ..events import bus
from .base import Agent, AgentError


def effective_times() -> list[tuple[int, int]]:
    times = config.schedule_times()
    per_day = max(0, config.get("videos_per_day"))
    if per_day == 0:
        return []
    if len(times) >= per_day:
        return times[:per_day]
    # more videos than configured times: spread evenly between 10:00 and 20:00
    if per_day == 1:
        return [times[0]]
    step = (20 - 10) * 60 / (per_day - 1)
    return [(int((600 + i * step) // 60), int((600 + i * step) % 60)) for i in range(per_day)]


def _tz() -> ZoneInfo:
    try:
        return ZoneInfo(config.get("timezone"))
    except Exception:  # noqa: BLE001
        return ZoneInfo("Europe/Berlin")


def next_slot() -> dt.datetime | None:
    tz = _tz()
    now = dt.datetime.now(tz)
    times = effective_times()
    if not times:
        return None
    last = db.get_setting_raw("producer_last_slot") or ""
    for day in range(0, 3):
        d = (now + dt.timedelta(days=day)).date()
        for h, m in times:
            slot = dt.datetime(d.year, d.month, d.day, h, m, tzinfo=tz)
            if slot.strftime("%Y-%m-%d %H:%M") <= last:
                continue
            if slot >= now - dt.timedelta(hours=3):
                return slot
    return None


def start_production(idea_id: int | None = None, topic: str | None = None) -> int:
    """Create a new video job from an idea (best-scored if none given) or a free topic."""
    if topic:
        vid = db.create_video(topic)
    else:
        idea = db.get_idea(idea_id) if idea_id else (db.list_ideas("new", limit=1) or [None])[0]
        if not idea:
            raise AgentError("Keine Ideen im Speicher – Trend-Scout muss zuerst Ideen finden.")
        db.update_idea(idea["id"], status="used")
        text = idea["title"]
        if idea.get("angle"):
            text += f" — {idea['angle']}"
        vid = db.create_video(text, idea["id"])
        bus.publish("ideas", {})
    bus.publish("video", db.get_video(vid))
    return vid


class Producer(Agent):
    key = "producer"
    name = "Produktionsleiter"
    role = "Plant Veröffentlichungen & startet Produktionen"
    icon = "🎬"
    idle_interval = 20
    supports_manual_run = True

    def __init__(self) -> None:
        super().__init__()
        self._manual = False

    async def run_now(self) -> None:
        self._manual = True
        self.kick()

    def state(self):
        s = super().state()
        slot = next_slot() if config.get("autopilot") else None
        s["next_slot"] = slot.isoformat() if slot else None
        return s

    async def find_work(self):
        if self._manual:
            self._manual = False
            return {"reason": "manuell", "slot": None}
        if not config.get("autopilot"):
            if self.status != "waiting":
                self.set_status("waiting", "Autopilot aus – wartet auf manuellen Start")
            return None
        slot = next_slot()
        if slot and dt.datetime.now(slot.tzinfo) >= slot:
            return {"reason": f"Zeitplan {slot.strftime('%H:%M')}", "slot": slot}
        if slot and self.status in ("idle", "waiting"):
            msg = f"Nächste Produktion: {slot.strftime('%d.%m. %H:%M')}"
            if self.task != msg:
                self.set_status("waiting", msg)
        return None

    async def process(self, item) -> None:
        if item.get("slot"):
            db.set_setting_raw("producer_last_slot", item["slot"].strftime("%Y-%m-%d %H:%M"))
        self.report(f"Wähle beste Idee ({item['reason']})…", 30)
        if not db.list_ideas("new", limit=1):
            self.log("Keine Ideen vorhanden – beauftrage Trend-Scout", "warn")
            from . import registry
            scout = registry.get("trend_scout")
            await scout.run_now()
            raise AgentError("Keine Ideen vorhanden – Trend-Scout wurde beauftragt.")
        vid = start_production()
        video = db.get_video(vid)
        self.log(f"Produktion gestartet: „{video['topic'][:80]}“", video_id=vid)
