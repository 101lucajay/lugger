"""Bild-Redakteur: finds a matching portrait stock clip for every scene (Pexels) or generates one."""
from __future__ import annotations

import json
import random

import httpx

from .. import config, media
from ..paths import video_dir
from .base import AgentError, VideoStageAgent

PALETTES = [
    ("0x0f2027", "0x2c5364"), ("0x41295a", "0x2f0743"), ("0x0b486b", "0xf56217"),
    ("0x1d2b64", "0xf8cdda"), ("0x134e5e", "0x71b280"), ("0x232526", "0x414345"),
]


async def pexels_search(client: httpx.AsyncClient, key: str, query: str) -> list[dict]:
    r = await client.get("https://api.pexels.com/videos/search",
                         params={"query": query, "orientation": "portrait", "per_page": 12, "size": "medium"},
                         headers={"Authorization": key})
    if r.status_code == 401:
        raise AgentError("Pexels API-Key ungültig")
    r.raise_for_status()
    return r.json().get("videos", [])


def pick_file(video: dict) -> dict | None:
    files = [f for f in video.get("video_files", [])
             if f.get("file_type") == "video/mp4" and f.get("height") and f.get("width")
             and f["height"] >= f["width"] and f["height"] >= 960]
    if not files:
        return None
    return min(files, key=lambda f: abs(f["height"] - 1920))


class VisualEditor(VideoStageAgent):
    key = "visuals"
    name = "Bild-Redakteur"
    role = "Sucht passendes Videomaterial je Szene"
    icon = "🖼️"
    input_status, working_status, output_status = "voiced", "sourcing", "visuals_ready"

    async def generated_clip(self, path, seconds: float, i: int) -> None:
        c0, c1 = PALETTES[i % len(PALETTES)]
        await media.ffmpeg("-f", "lavfi", "-i",
                           f"gradients=s=1080x1920:c0={c0}:c1={c1}:x0=0:y0=0:x1=1080:y1=1920:speed=0.015:r=30",
                           "-t", f"{seconds:.2f}", "-c:v", "libx264", "-preset", "veryfast",
                           "-pix_fmt", "yuv420p", str(path))

    async def process(self, video) -> None:
        vdir = video_dir(video["id"])
        timings = json.loads((vdir / "timings.json").read_text())
        segs = video["script"]["segments"]
        key = config.get("pexels_api_key")
        used_ids: set[int] = set()
        visuals = []
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
            for i, seg in enumerate(segs):
                t = timings["segments"][i]
                need = t["end"] - t["start"]
                path = vdir / f"clip_{i:02d}.mp4"
                self.report(f"Szene {i + 1}/{len(segs)}: „{seg['visual_query']}“", 5 + 90 * i / len(segs))
                source = "generated"
                if key:
                    try:
                        results = []
                        for q in (seg["visual_query"], " ".join(seg["visual_query"].split()[:2]), "technology"):
                            results = [v for v in await pexels_search(client, key, q) if v["id"] not in used_ids]
                            if results:
                                break
                        # prefer clips long enough for the scene
                        long_enough = [v for v in results if v.get("duration", 0) >= need] or results
                        random.shuffle(long_enough)
                        for v in long_enough:
                            f = pick_file(v)
                            if not f:
                                continue
                            async with client.stream("GET", f["link"]) as resp:
                                resp.raise_for_status()
                                with open(path, "wb") as out:
                                    async for chunk in resp.aiter_bytes(1 << 16):
                                        out.write(chunk)
                            used_ids.add(v["id"])
                            source = f"pexels:{v['id']}"
                            break
                    except AgentError:
                        raise
                    except Exception as exc:  # noqa: BLE001
                        self.log(f"Pexels-Suche fehlgeschlagen ({exc}) – generiere Hintergrund", "warn")
                if source == "generated":
                    await self.generated_clip(path, need + 0.5, i)
                visuals.append({"file": path.name, "source": source, "duration": round(need, 3)})
        if not key:
            self.log("Kein Pexels-Key – animierte Hintergründe generiert", "warn")
        script = video["script"]
        script["visuals"] = visuals
        self.advance(video["id"], script=script)
