"""Publisher: uploads approved videos to TikTok, Instagram and YouTube."""
from __future__ import annotations

from pathlib import Path

from .. import db
from ..events import bus, emit_event
from ..publishers import platforms as pf
from .base import AgentError, VideoStageAgent


class Publisher(VideoStageAgent):
    key = "publisher"
    name = "Publisher"
    role = "Lädt freigegebene Videos auf TikTok, Instagram & YouTube hoch"
    icon = "🚀"
    input_status, working_status, output_status = "approved", "publishing", "published"

    async def process(self, video) -> None:
        path = Path(video["video_path"] or "")
        if not path.exists():
            raise AgentError("Videodatei nicht gefunden")
        script = video["script"]
        results: dict = dict(video.get("publish_results") or {})
        targets = pf.enabled_platforms()
        if not targets:
            self.log("Keine Plattform aktiv – Video liegt bereit zum Download", "warn")
            self.advance(video["id"], status="ready")
            return
        # skip platforms that already succeeded (retry only failed ones)
        todo = {p: m for p, m in targets.items() if not results.get(p, {}).get("ok")}

        via_service = [p for p, m in todo.items() if m == "uploadpost"]
        if via_service:
            self.report(f"Lade hoch via upload-post.com: {', '.join(via_service)}", 20)
            try:
                results.update(await pf.uploadpost_upload(path, script, via_service))
            except Exception as exc:  # noqa: BLE001
                for p in via_service:
                    results[p] = {"ok": False, "via": "upload-post", "error": str(exc)}
            self._save(video["id"], results)

        direct = [p for p, m in todo.items() if m == "direct"]
        for i, p in enumerate(direct):
            self.report(f"Lade auf {p.capitalize()} hoch (offizielle API)…", 40 + 50 * i / max(1, len(direct)))
            try:
                results[p] = {**await pf.DIRECT[p](path, script), "via": "direct"}
                self.log(f"{p.capitalize()}: hochgeladen {results[p].get('url', '')}")
            except Exception as exc:  # noqa: BLE001
                results[p] = {"ok": False, "via": "direct", "error": str(exc)}
                self.log(f"{p.capitalize()}: {exc}", "error")
            self._save(video["id"], results)

        failed = [p for p in targets if not results.get(p, {}).get("ok")]
        if failed:
            db.update_video(video["id"], status="publish_failed", publish_results=results,
                            error=f"Upload fehlgeschlagen: {', '.join(failed)}")
            bus.publish("video", db.get_video(video["id"]))
            raise AgentError(f"Upload fehlgeschlagen für: {', '.join(failed)}")
        self.log(f"Veröffentlicht auf {', '.join(targets)} 🎉")
        self.advance(video["id"], publish_results=results)
        bus.publish("notify", {"title": "Veröffentlicht", "message": script["title"], "video_id": video["id"]})
        emit_event("video.published", {"id": video["id"], "title": script["title"], "description": script.get("description", ""),
                                       "urls": {p: r.get("url", "") for p, r in results.items()},
                                       "youtube_url": results.get("youtube", {}).get("url", ""),
                                       "tiktok_url": results.get("tiktok", {}).get("url", ""),
                                       "instagram_url": results.get("instagram", {}).get("url", "")})

    def _save(self, vid: int, results: dict) -> None:
        db.update_video(vid, publish_results=results)
        bus.publish("video", db.get_video(vid))

    async def on_failure(self, item, exc) -> None:
        v = db.get_video(item["id"])
        if v and v["status"] != "publish_failed":
            await super().on_failure(item, exc)
