"""Settings: defaults <- environment variables <- values saved in the dashboard."""
from __future__ import annotations

import json
import os
from typing import Any

from . import db

# key: (default, type, secret, env var)
SETTINGS_SPEC: dict[str, tuple[Any, type, bool, str]] = {
    # --- content ---
    "niche": ("Künstliche Intelligenz & Zukunftstechnologien", str, False, "LUGGER_NICHE"),
    "audience": ("Deutschsprachige 18–40-Jährige, technikinteressiert, wenig Vorwissen", str, False, "LUGGER_AUDIENCE"),
    "language": ("de", str, False, "LUGGER_LANGUAGE"),
    "target_seconds": (50, int, False, "LUGGER_TARGET_SECONDS"),
    "channel_name": ("KI Kompakt", str, False, "LUGGER_CHANNEL_NAME"),
    # --- automation ---
    "autopilot": (True, bool, False, "LUGGER_AUTOPILOT"),
    "videos_per_day": (1, int, False, "LUGGER_VIDEOS_PER_DAY"),
    "schedule_times": ("17:00", str, False, "LUGGER_SCHEDULE_TIMES"),
    "timezone": ("Europe/Berlin", str, False, "TZ"),
    "require_approval": (True, bool, False, "LUGGER_REQUIRE_APPROVAL"),
    "min_idea_backlog": (6, int, False, "LUGGER_MIN_IDEA_BACKLOG"),
    # --- AI / LLM ---
    "anthropic_api_key": ("", str, True, "ANTHROPIC_API_KEY"),
    "llm_model": ("claude-opus-5-5", str, False, "LUGGER_LLM_MODEL"),
    "llm_web_search": (True, bool, False, "LUGGER_LLM_WEB_SEARCH"),
    # --- voice ---
    "tts_provider": ("auto", str, False, "LUGGER_TTS_PROVIDER"),  # auto|elevenlabs|openai|edge
    "edge_voice": ("de-DE-ConradNeural", str, False, "LUGGER_EDGE_VOICE"),
    "edge_rate": ("+8%", str, False, "LUGGER_EDGE_RATE"),
    "elevenlabs_api_key": ("", str, True, "ELEVENLABS_API_KEY"),
    "elevenlabs_voice_id": ("pNInz6obpgDQGcFmaJgB", str, False, "ELEVENLABS_VOICE_ID"),
    "elevenlabs_model": ("eleven_multilingual_v2", str, False, "ELEVENLABS_MODEL"),
    "openai_api_key": ("", str, True, "OPENAI_API_KEY"),
    "openai_tts_voice": ("onyx", str, False, "OPENAI_TTS_VOICE"),
    "openai_tts_model": ("gpt-4o-mini-tts", str, False, "OPENAI_TTS_MODEL"),
    # --- visuals ---
    "pexels_api_key": ("", str, True, "PEXELS_API_KEY"),
    "music_volume": (0.12, float, False, "LUGGER_MUSIC_VOLUME"),
    "subtitle_font": ("DejaVu Sans", str, False, "LUGGER_SUBTITLE_FONT"),
    "accent_color": ("#FFD400", str, False, "LUGGER_ACCENT_COLOR"),
    # --- publishing: mode per platform = off | direct | uploadpost ---
    "youtube_mode": ("off", str, False, "YOUTUBE_MODE"),
    "tiktok_mode": ("off", str, False, "TIKTOK_MODE"),
    "instagram_mode": ("off", str, False, "INSTAGRAM_MODE"),
    "uploadpost_api_key": ("", str, True, "UPLOADPOST_API_KEY"),
    "uploadpost_user": ("", str, False, "UPLOADPOST_USER"),
    "youtube_client_id": ("", str, False, "YOUTUBE_CLIENT_ID"),
    "youtube_client_secret": ("", str, True, "YOUTUBE_CLIENT_SECRET"),
    "youtube_refresh_token": ("", str, True, "YOUTUBE_REFRESH_TOKEN"),
    "youtube_privacy": ("public", str, False, "YOUTUBE_PRIVACY"),
    "tiktok_client_key": ("", str, False, "TIKTOK_CLIENT_KEY"),
    "tiktok_client_secret": ("", str, True, "TIKTOK_CLIENT_SECRET"),
    "tiktok_refresh_token": ("", str, True, "TIKTOK_REFRESH_TOKEN"),
    "tiktok_privacy": ("SELF_ONLY", str, False, "TIKTOK_PRIVACY"),
    "instagram_access_token": ("", str, True, "INSTAGRAM_ACCESS_TOKEN"),
    "instagram_user_id": ("", str, False, "INSTAGRAM_USER_ID"),
}

SECRET_MASK = "••••••••"


def _coerce(value: Any, typ: type) -> Any:
    if typ is bool:
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in ("1", "true", "yes", "on", "ja")
    if typ is int:
        return int(float(value))
    if typ is float:
        return float(value)
    return str(value)


def get(key: str) -> Any:
    default, typ, _secret, env = SETTINGS_SPEC[key]
    raw = db.get_setting_raw(key)
    if raw is not None:
        try:
            return _coerce(json.loads(raw), typ)
        except (ValueError, TypeError):
            return default
    if env and os.environ.get(env) not in (None, ""):
        return _coerce(os.environ[env], typ)
    return default


def set_many(values: dict[str, Any]) -> None:
    for key, value in values.items():
        if key not in SETTINGS_SPEC:
            continue
        _default, typ, secret, _env = SETTINGS_SPEC[key]
        if secret and value == SECRET_MASK:
            continue  # unchanged secret
        db.set_setting_raw(key, json.dumps(_coerce(value, typ)))


def public_settings() -> dict[str, Any]:
    """All settings for the dashboard; secrets are masked."""
    out = {}
    for key, (_d, _t, secret, _e) in SETTINGS_SPEC.items():
        val = get(key)
        out[key] = (SECRET_MASK if val else "") if secret else val
    return out


def schedule_times() -> list[tuple[int, int]]:
    times = []
    for part in str(get("schedule_times")).replace(";", ",").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            h, m = part.split(":")
            times.append((int(h) % 24, int(m) % 60))
        except ValueError:
            continue
    return sorted(times) or [(17, 0)]
