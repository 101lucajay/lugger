"""Cutter: renders the final 1080x1920 video – scenes, voice, animated subtitles, music."""
from __future__ import annotations

import json
import random

from .. import config, db, media
from ..events import bus
from ..paths import MUSIC_DIR, video_dir
from .base import AgentError, VideoStageAgent

W, H, FPS = 1080, 1920, 30


def ass_time(t: float) -> str:
    t = max(0.0, t)
    h = int(t // 3600)
    m = int(t % 3600 // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def ass_color(hex_color: str) -> str:
    h = hex_color.lstrip("#")
    if len(h) != 6:
        h = "FFD400"
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}".upper()


def ass_escape(text: str) -> str:
    return text.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", " ")


def build_ass(script: dict, timings: dict, font: str, accent: str) -> str:
    acc = ass_color(accent)
    lines = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}",
        "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, "
        "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Sub,{font},92,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,7,3,5,60,60,0,1",
        f"Style: Key,{font},120,{acc},&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,2,0,1,8,4,8,60,60,260,1",
        f"Style: Hook,{font},104,&H00FFFFFF,&H00FFFFFF,&H00000000,&HC8000000,-1,0,0,0,100,100,0,0,3,24,0,8,70,70,300,1",
        "", "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    segs = timings["segments"]
    # hook text box in the first seconds, then a keyword per later scene
    hook = ass_escape(script.get("hook_text", "")).upper()
    if hook and segs:
        end = min(segs[0]["end"], 3.2)
        lines.append(f"Dialogue: 2,{ass_time(0)},{ass_time(end)},Hook,,0,0,0,,"
                     f"{{\\fad(0,200)\\t(0,180,\\fscx108\\fscy108)\\t(180,320,\\fscx100\\fscy100)}}{hook}")
    for i, seg in enumerate(script["segments"]):
        if i == 0 and hook:
            continue
        kw = ass_escape(seg.get("keyword", "")).upper()
        if kw and i < len(segs):
            s, e = segs[i]["start"], segs[i]["end"]
            lines.append(f"Dialogue: 1,{ass_time(s)},{ass_time(e)},Key,,0,0,0,,"
                         f"{{\\fad(150,150)\\t(0,200,\\fscx110\\fscy110)\\t(200,350,\\fscx100\\fscy100)}}{kw}")

    # karaoke-style captions: groups of up to 3 words, active word highlighted
    words = timings["words"]
    groups: list[list[dict]] = []
    for w in words:
        if (groups and len(groups[-1]) < 3 and groups[-1][-1]["seg"] == w["seg"]
                and not groups[-1][-1]["word"].endswith((".", "!", "?", ":"))):
            groups[-1].append(w)
        else:
            groups.append([w])
    for gi, g in enumerate(groups):
        g_end = groups[gi + 1][0]["start"] if gi + 1 < len(groups) else g[-1]["end"] + 0.3
        g_end = min(g_end, g[-1]["end"] + 0.6)
        for wi, w in enumerate(g):
            start = w["start"]
            end = g[wi + 1]["start"] if wi + 1 < len(g) else g_end
            if end <= start:
                continue
            parts = []
            for wj, other in enumerate(g):
                txt = ass_escape(other["word"]).upper()
                if wj == wi:
                    parts.append(f"{{\\c{acc}\\fscx112\\fscy112}}{txt}{{\\c&H00FFFFFF&\\fscx100\\fscy100}}")
                else:
                    parts.append(txt)
            lines.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Sub,,0,0,0,,"
                         f"{{\\pos({W // 2},{int(H * 0.66)})}}{' '.join(parts)}")
    return "\n".join(lines) + "\n"


class Cutter(VideoStageAgent):
    key = "editor"
    name = "Cutter"
    role = "Schneidet & rendert das fertige Video"
    icon = "🎞️"
    input_status, working_status, output_status = "visuals_ready", "rendering", "rendered"

    async def process(self, video) -> None:
        vid = video["id"]
        vdir = video_dir(vid)
        script = video["script"]
        timings = json.loads((vdir / "timings.json").read_text())
        segs = timings["segments"]
        total = segs[-1]["end"]

        # 1) normalise every scene to 1080x1920@30 with exact length
        parts = []
        for i, vis in enumerate(script["visuals"]):
            dur = segs[i]["end"] - segs[i]["start"]
            self.report(f"Bereite Szene {i + 1}/{len(segs)} vor", 5 + 45 * i / len(segs))
            out = vdir / f"part_{i:02d}.mp4"
            zoom = "1.0+0.04*t/{:.2f}".format(max(dur, 0.1))
            vf = (f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
                  f"scale=w='trunc({W}*({zoom})/2)*2':h=-2:eval=frame,crop={W}:{H},"
                  f"fps={FPS},eq=brightness=-0.06:saturation=1.1,setsar=1,format=yuv420p")
            await media.ffmpeg("-stream_loop", "-1", "-i", str(vdir / vis["file"]), "-t", f"{dur:.3f}",
                               "-vf", vf, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
                               str(out))
            parts.append(out)

        self.report("Füge Szenen zusammen", 55)
        lst = vdir / "parts.txt"
        lst.write_text("".join(f"file '{p.name}'\n" for p in parts))
        await media.ffmpeg("-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(vdir / "scenes.mp4"))

        self.report("Erzeuge animierte Untertitel", 62)
        (vdir / "subs.ass").write_text(build_ass(script, timings, config.get("subtitle_font"),
                                                 config.get("accent_color")), encoding="utf-8")

        # 2) final render: subtitles + progress bar + voice (+ optional music)
        self.report("Rendere finales Video (Untertitel, Ton, Musik)…", 68)
        accent = config.get("accent_color").lstrip("#")
        vf = (f"subtitles=subs.ass,"
              f"drawbox=x=0:y=ih-14:w='iw*t/{total:.3f}':h=14:color=0x{accent}@0.95:t=fill")
        inputs = ["-i", "scenes.mp4", "-i", "voice.wav"]
        music = sorted([p for p in MUSIC_DIR.glob("*") if p.suffix.lower() in (".mp3", ".wav", ".m4a", ".ogg")])
        if music:
            track = random.choice(music)
            inputs += ["-stream_loop", "-1", "-i", str(track)]
            vol = config.get("music_volume")
            af = (f"[2:a]volume={vol},afade=t=out:st={max(total - 1.5, 0):.2f}:d=1.5[m];"
                  f"[1:a][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]")
            amap = ["-filter_complex", af, "-map", "0:v", "-map", "[a]"]
            self.log(f"Hintergrundmusik: {track.name}")
        else:
            amap = ["-map", "0:v", "-map", "1:a"]
        final = vdir / "final.mp4"
        # run inside the video folder so the subtitles filter path needs no escaping
        await media.ffmpeg(*inputs, "-vf", vf, *amap, "-t", f"{total:.3f}",
                           "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high",
                           "-pix_fmt", "yuv420p", "-r", str(FPS), "-c:a", "aac", "-b:a", "192k",
                           "-ar", "44100", "-movflags", "+faststart", "final.mp4",
                           timeout=1800, cwd=vdir)

        self.report("Qualitätskontrolle & Vorschaubild", 92)
        dur = await media.duration(final)
        w, h = await media.video_size(final)
        if (w, h) != (W, H) or dur < 5 or abs(dur - total) > 1.5:
            raise AgentError(f"QA fehlgeschlagen: {w}x{h}, {dur:.1f}s (erwartet {total:.1f}s)")
        thumb = vdir / "thumb.jpg"
        await media.ffmpeg("-ss", f"{min(1.0, dur / 2):.2f}", "-i", str(final), "-frames:v", "1",
                           "-vf", "scale=360:-2", "-q:v", "3", str(thumb))
        # clean intermediate files
        for p in [*parts, vdir / "scenes.mp4"]:
            p.unlink(missing_ok=True)

        next_status = "awaiting_approval" if config.get("require_approval") else "approved"
        self.log(f"Video gerendert: {dur:.1f}s – {'wartet auf Freigabe' if next_status == 'awaiting_approval' else 'freigegeben'}")
        db.update_video(vid, video_path=str(final), thumb_path=str(thumb), duration=round(dur, 2))
        self.advance(vid, status=next_status)
        bus.publish("notify", {"title": "Video fertig", "message": script["title"], "video_id": vid})
