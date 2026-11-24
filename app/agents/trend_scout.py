"""Trend-Scout: finds current, trending video ideas in the chosen niche."""
from __future__ import annotations

import re
import time
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus

import httpx

from .. import config, db, llm
from ..events import bus, emit_event
from .base import Agent

IDEAS_SCHEMA = {
    "type": "object",
    "properties": {
        "ideas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "angle": {"type": "string"},
                    "hook": {"type": "string"},
                    "why_now": {"type": "string"},
                    "score": {"type": "number"},
                    "sources": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["title", "angle", "hook", "why_now", "score", "sources"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["ideas"],
    "additionalProperties": False,
}


async def fetch_headlines(niche: str, limit: int = 25) -> list[dict]:
    """Free trend signal: Google News RSS for the niche (German edition)."""
    parts = [p.strip() for p in re.split(r"[&,/]| und ", niche) if p.strip()]
    queries = parts[:2] or [niche]
    items: list[dict] = []
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        for q in queries:
            url = f"https://news.google.com/rss/search?q={quote_plus(q)}+when:7d&hl=de&gl=DE&ceid=DE:de"
            try:
                r = await client.get(url)
                r.raise_for_status()
                root = ET.fromstring(r.text)
                for it in root.iter("item"):
                    items.append({"title": (it.findtext("title") or "").strip(),
                                  "link": (it.findtext("link") or "").strip(),
                                  "date": (it.findtext("pubDate") or "").strip()})
            except Exception:  # noqa: BLE001 - trend signal is best effort
                continue
    seen, out = set(), []
    for it in items:
        if it["title"] and it["title"] not in seen:
            seen.add(it["title"])
            out.append(it)
    return out[:limit]


class TrendScout(Agent):
    key = "trend_scout"
    name = "Trend-Scout"
    role = "Findet angesagte Themen & Videoideen"
    icon = "🔭"
    idle_interval = 60
    supports_manual_run = True
    auto_cooldown = 30 * 60  # don't auto-run more often than every 30 min

    def __init__(self) -> None:
        super().__init__()
        self._manual = False
        self._last_run = 0.0

    async def run_now(self) -> None:
        self._manual = True
        self.kick()

    async def find_work(self):
        if self._manual:
            self._manual = False
            return {"reason": "manuell gestartet"}
        if not config.get("autopilot"):
            return None
        backlog = len(db.list_ideas("new"))
        cooldown = max(5, config.get("scout_interval_minutes")) * 60
        if backlog < config.get("min_idea_backlog") and time.time() - self._last_run > cooldown:
            return {"reason": f"nur {backlog} Ideen im Speicher"}
        return None

    async def process(self, item) -> None:
        self._last_run = time.time()
        niche = config.get("niche")
        self.report(f"Suche Trends ({item['reason']})…", 5)
        headlines = await fetch_headlines(niche)
        self.report(f"{len(headlines)} aktuelle Schlagzeilen gefunden", 20)

        known = [i["title"] for i in db.list_ideas(limit=80)]
        if not llm.has_key():
            added = 0
            for h in headlines[:8]:
                title = re.sub(r"\s+-\s+[^-]+$", "", h["title"])  # strip " - Publisher"
                if title in known:
                    continue
                db.add_idea(title, angle="Aus Google News", hook="", why_now=h["date"],
                            sources=[h["link"]], score=5, origin="news")
                added += 1
            self.log(f"Kein Claude-Key: {added} Ideen direkt aus News übernommen", "warn")
            bus.publish("ideas", {})
            return

        self.report("Claude recherchiert & bewertet Themen (Websuche)…", 35)
        headline_text = "\n".join(f"- {h['title']} ({h['date']})" for h in headlines) or "(keine)"
        known_text = "\n".join(f"- {t}" for t in known) or "(keine)"
        system = (
            "Du bist Trend-Scout für einen Kurzvideo-Kanal (TikTok, Instagram Reels, YouTube Shorts). "
            "Du findest Themen, die gerade viral gehen können, und bewertest sie nüchtern. "
            "Antworte ausschließlich auf Deutsch."
        )
        prompt = f"""Nische des Kanals: {niche}
Zielgruppe: {config.get('audience')}
Heute ist {time.strftime('%d.%m.%Y')}.

Aktuelle Schlagzeilen (Google News, letzte 7 Tage):
{headline_text}

Bereits vorhandene Ideen (nicht wiederholen, auch nicht sinngemäß):
{known_text}

Aufgabe: Recherchiere mit der Websuche, was in dieser Nische gerade wirklich diskutiert wird,
und schlage 8 Ideen für 45–60-sekündige Informationsvideos vor. Mische tagesaktuelle News mit
"evergreen"-Erklärthemen, die gerade gesucht werden. Jede Idee braucht:
- title: knackiger Videotitel (max. 70 Zeichen)
- angle: worum genau es geht und welche überraschende Erkenntnis der Zuschauer mitnimmt
- hook: der erste Satz des Videos, der in 2 Sekunden fesselt
- why_now: warum das Thema gerade relevant ist
- score: 1–10, wie hoch das virale Potenzial ist
- sources: 1–3 URLs mit belastbaren Quellen
Keine Clickbait-Falschaussagen, keine Finanz- oder Gesundheitsversprechen."""
        cfg = config.agent_cfg(self.key)
        if cfg.get("instructions"):
            system += "\n\nZusätzliche Vorgaben des Betreibers:\n" + cfg["instructions"]
        result = await llm.json_call(system, prompt, IDEAS_SCHEMA, web_search=True, effort="medium", model=cfg.get("model"))
        ideas = result.get("ideas", [])
        self.report(f"{len(ideas)} Ideen erhalten – speichere…", 90)
        known_lower = {t.lower() for t in known}
        added = 0
        for idea in ideas:
            if idea["title"].lower() in known_lower:
                continue
            db.add_idea(idea["title"], idea["angle"], idea["hook"], idea["why_now"],
                        idea.get("sources", []), float(idea.get("score", 5)))
            added += 1
        self.log(f"{added} neue Videoideen gespeichert")
        bus.publish("ideas", {})
        emit_event("ideas.found", {"count": added, "titles": [i["title"] for i in ideas][:10]})
