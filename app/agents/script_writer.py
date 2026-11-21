"""Skript-Autor: researches the topic and writes a tight short-video script."""
from __future__ import annotations

from .. import config, db, llm
from .base import VideoStageAgent

SCRIPT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "hook_text": {"type": "string"},
        "segments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "visual_query": {"type": "string"},
                    "keyword": {"type": "string"},
                },
                "required": ["text", "visual_query", "keyword"],
                "additionalProperties": False,
            },
        },
        "description": {"type": "string"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
        "sources": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "hook_text", "segments", "description", "hashtags", "sources"],
    "additionalProperties": False,
}


def demo_script(topic: str) -> dict:
    """Used when no Claude key is configured so the pipeline can still be tested end to end."""
    return {
        "title": topic[:70],
        "hook_text": "Das wusstest du noch nicht!",
        "segments": [
            {"text": f"Heute geht es um: {topic[:90]}.", "visual_query": "futuristic technology", "keyword": "THEMA"},
            {"text": "Dies ist ein Demo-Video, weil noch kein Claude API-Key hinterlegt ist.", "visual_query": "computer code screen", "keyword": "DEMO"},
            {"text": "Trage deinen Key im Dashboard unter Einstellungen ein, dann schreibt der Skript-Autor echte, recherchierte Skripte.", "visual_query": "artificial intelligence robot", "keyword": "SETUP"},
            {"text": "Folge für mehr kompaktes Wissen!", "visual_query": "smartphone social media", "keyword": "FOLGEN"},
        ],
        "description": f"{topic}\n\n(Demo-Video)",
        "hashtags": ["#KI", "#Technik", "#Wissen", "#Shorts"],
        "sources": [],
        "demo": True,
    }


class ScriptWriter(VideoStageAgent):
    key = "script_writer"
    name = "Skript-Autor"
    role = "Recherchiert & schreibt das Videoskript"
    icon = "✍️"
    input_status, working_status, output_status = "queued", "scripting", "scripted"

    async def process(self, video) -> None:
        topic = video["topic"]
        idea = db.get_idea(video["idea_id"]) if video.get("idea_id") else None
        self.report(f"Recherchiere: {topic[:70]}", 10)

        if not llm.has_key():
            self.log("Kein Claude-Key – erstelle Demo-Skript", "warn")
            script = demo_script(topic)
        else:
            seconds = config.get("target_seconds")
            words = int(seconds * 2.5)
            extra = ""
            if idea:
                extra = (f"\nVorgeschlagener Hook: {idea.get('hook')}\nWarum jetzt: {idea.get('why_now')}"
                         f"\nQuellen: {', '.join(idea.get('sources') or [])}")
            system = (
                f"Du bist Autor für den Kurzvideo-Kanal „{config.get('channel_name')}“ "
                f"(Nische: {config.get('niche')}). Du schreibst gesprochene Skripte für "
                "vertikale Informationsvideos: faktisch korrekt, verständlich, mitreißend. "
                "Sprache: Deutsch, Du-Form, kurze Sätze, keine Emojis im gesprochenen Text."
            )
            prompt = f"""Thema: {topic}{extra}
Zielgruppe: {config.get('audience')}

Recherchiere die Fakten mit der Websuche (aktuelle, verlässliche Quellen) und schreibe dann ein
Skript für ein {seconds}-Sekunden-Video (ca. {words} Wörter gesprochen insgesamt).

Struktur:
1. Segment 1 = Hook: ein Satz, der sofort Neugier weckt (Zahl, Überraschung oder Frage).
2. 4–7 Segmente mit je 1–2 Sätzen: Kontext, die wichtigsten Fakten, ein konkretes Beispiel,
   was das für den Zuschauer bedeutet.
3. Letztes Segment: kurzes Fazit + Aufforderung zu folgen.

Pro Segment:
- text: gesprochener Text (Zahlen ausschreiben, wo es die Aussprache verbessert; keine Abkürzungen wie "z.B.")
- visual_query: 2–4 englische Suchbegriffe für passendes Stock-Video (z. B. "robot hand typing")
- keyword: 1–2 Wörter in GROSSBUCHSTABEN als Einblendung

Außerdem:
- title: Videotitel, max. 70 Zeichen, neugierig machend, ehrlich
- hook_text: max. 5 Wörter Text-Einblendung für die ersten Sekunden
- description: 2–3 Sätze Beschreibung für die Plattformen
- hashtags: 5–8 relevante Hashtags (mit #)
- sources: verwendete Quellen-URLs"""
            self.report("Claude schreibt das Skript…", 35)
            script = await llm.json_call(system, prompt, SCRIPT_SCHEMA, web_search=True, effort="medium")

        if not script.get("segments"):
            raise ValueError("Skript enthält keine Segmente")
        words = sum(len(s["text"].split()) for s in script["segments"])
        self.report(f"Skript fertig: {len(script['segments'])} Szenen, {words} Wörter", 100)
        self.advance(video["id"], script=script, title=script["title"])
