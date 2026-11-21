"""Sprecher: turns the script into a voice-over with word-level timings for subtitles."""
from __future__ import annotations

import base64
import json
import os
import re
from pathlib import Path

import httpx

from .. import config, media
from ..paths import video_dir
from .base import AgentError, VideoStageAgent


def estimate_words(text: str, total: float, offset: float = 0.0) -> list[dict]:
    """Spread words over `total` seconds proportional to their length (for TTS without timestamps)."""
    words = text.split()
    if not words:
        return []
    weights = [len(w) + 2 for w in words]
    scale = total / sum(weights)
    out, t = [], offset
    for w, wt in zip(words, weights):
        d = wt * scale
        out.append({"word": w, "start": round(t, 3), "end": round(t + d, 3)})
        t += d
    return out


def words_from_chars(chars: list[str], starts: list[float], ends: list[float]) -> list[dict]:
    out, cur, cs = [], "", None
    for ch, s, e in zip(chars, starts, ends):
        if ch.isspace():
            if cur:
                out.append({"word": cur, "start": cs, "end": prev_end})
            cur, cs = "", None
            continue
        if cs is None:
            cs = s
        cur += ch
        prev_end = e
    if cur:
        out.append({"word": cur, "start": cs, "end": prev_end})
    return out


def resolve_provider() -> str:
    p = config.get("tts_provider")
    if p != "auto":
        return p
    if config.get("elevenlabs_api_key"):
        return "elevenlabs"
    if config.get("openai_api_key"):
        return "openai"
    return "edge"


async def tts_edge(text: str, out_mp3: Path) -> list[dict]:
    import edge_tts
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    comm = edge_tts.Communicate(text, config.get("edge_voice"), rate=config.get("edge_rate"),
                                boundary="WordBoundary", proxy=proxy)
    words = []
    with open(out_mp3, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / 1e7
                words.append({"word": chunk["text"], "start": start,
                              "end": start + chunk["duration"] / 1e7})
    return words


async def tts_elevenlabs(text: str, out_mp3: Path) -> list[dict]:
    key = config.get("elevenlabs_api_key")
    if not key:
        raise AgentError("ElevenLabs API-Key fehlt")
    voice = config.get("elevenlabs_voice_id")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_128"
    payload = {"text": text, "model_id": config.get("elevenlabs_model"), "language_code": "de",
               "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.3}}
    async with httpx.AsyncClient(timeout=180) as client:
        r = await client.post(url, json=payload, headers={"xi-api-key": key})
        if r.status_code == 400 and "language_code" in r.text:
            payload.pop("language_code")
            r = await client.post(url, json=payload, headers={"xi-api-key": key})
    if r.status_code >= 400:
        raise AgentError(f"ElevenLabs Fehler {r.status_code}: {r.text[:200]}")
    data = r.json()
    out_mp3.write_bytes(base64.b64decode(data["audio_base64"]))
    al = data.get("alignment") or data.get("normalized_alignment")
    if al:
        return words_from_chars(al["characters"], al["character_start_times_seconds"],
                                al["character_end_times_seconds"])
    return []


async def tts_openai(text: str, out_mp3: Path) -> list[dict]:
    key = config.get("openai_api_key")
    if not key:
        raise AgentError("OpenAI API-Key fehlt")
    payload = {"model": config.get("openai_tts_model"), "voice": config.get("openai_tts_voice"),
               "input": text, "response_format": "mp3",
               "instructions": "Sprich Deutsch, energiegeladen und klar wie ein Wissens-Creator."}
    async with httpx.AsyncClient(timeout=180) as client:
        r = await client.post("https://api.openai.com/v1/audio/speech", json=payload,
                              headers={"Authorization": f"Bearer {key}"})
    if r.status_code >= 400:
        raise AgentError(f"OpenAI TTS Fehler {r.status_code}: {r.text[:200]}")
    out_mp3.write_bytes(r.content)
    return []


async def tts_test(text: str, out_mp3: Path) -> list[dict]:
    """Silent placeholder voice (for offline tests)."""
    secs = max(1.5, len(text.split()) * 0.38)
    await media.ffmpeg("-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", f"{secs:.2f}",
                       "-c:a", "libmp3lame", str(out_mp3))
    return []


PROVIDERS = {"edge": tts_edge, "elevenlabs": tts_elevenlabs, "openai": tts_openai, "test": tts_test}


def clean_for_speech(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("#", "").replace("*", "")).strip()


class VoiceArtist(VideoStageAgent):
    key = "voice"
    name = "Sprecher"
    role = "Spricht das Skript ein (Text-to-Speech)"
    icon = "🎙️"
    input_status, working_status, output_status = "scripted", "voicing", "voiced"

    async def process(self, video) -> None:
        script = video["script"]
        provider = resolve_provider()
        tts = PROVIDERS.get(provider)
        if not tts:
            raise AgentError(f"Unbekannter Stimmen-Anbieter: {provider}")
        vdir = video_dir(video["id"])
        seg_wavs, all_words, seg_times = [], [], []
        offset = 0.0
        n = len(script["segments"])
        for i, seg in enumerate(script["segments"]):
            self.report(f"Spreche Szene {i + 1}/{n} ein ({provider})", 5 + 85 * i / n)
            text = clean_for_speech(seg["text"])
            mp3 = vdir / f"voice_{i:02d}.mp3"
            wav = vdir / f"voice_{i:02d}.wav"
            words = await tts(text, mp3)
            # normalise every segment to the same wav format + small pause at the end
            await media.ffmpeg("-i", str(mp3), "-af", "apad=pad_dur=0.25", "-ar", "44100",
                               "-ac", "1", str(wav))
            dur = await media.duration(wav)
            if not words:
                words = estimate_words(text, max(0.1, dur - 0.3))
            for w in words:
                all_words.append({"word": w["word"], "start": round(w["start"] + offset, 3),
                                  "end": round(w["end"] + offset, 3), "seg": i})
            seg_times.append({"start": round(offset, 3), "end": round(offset + dur, 3)})
            seg_wavs.append(wav)
            offset += dur

        self.report("Füge Tonspur zusammen", 92)
        concat = vdir / "voice_list.txt"
        concat.write_text("".join(f"file '{p.name}'\n" for p in seg_wavs))
        await media.ffmpeg("-f", "concat", "-safe", "0", "-i", str(concat),
                           "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", str(vdir / "voice.wav"))
        (vdir / "timings.json").write_text(json.dumps({"words": all_words, "segments": seg_times},
                                                       ensure_ascii=False))
        script["voice"] = {"provider": provider, "duration": round(offset, 2)}
        self.log(f"Stimme fertig: {offset:.1f}s mit {provider}")
        self.advance(video["id"], script=script, duration=round(offset, 2))
