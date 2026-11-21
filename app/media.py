"""ffmpeg / ffprobe helpers."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from .agents.base import AgentError


async def run(cmd: list[str], timeout: float = 900, cwd: str | Path | None = None) -> str:
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        cwd=str(cwd) if cwd else None)
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise AgentError(f"{Path(cmd[0]).name} hat das Zeitlimit überschritten")
    if proc.returncode != 0:
        tail = err.decode(errors="replace").strip().splitlines()[-6:]
        raise AgentError(f"{Path(cmd[0]).name} fehlgeschlagen: {' | '.join(tail)}")
    return out.decode(errors="replace")


async def ffmpeg(*args: str, timeout: float = 900, cwd: str | Path | None = None) -> None:
    await run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], timeout=timeout, cwd=cwd)


async def duration(path: Path | str) -> float:
    out = await run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                     "-of", "json", str(path)], timeout=60)
    try:
        return float(json.loads(out)["format"]["duration"])
    except (KeyError, ValueError, TypeError):
        raise AgentError(f"Dauer von {Path(path).name} nicht lesbar")


async def video_size(path: Path | str) -> tuple[int, int]:
    out = await run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                     "-show_entries", "stream=width,height", "-of", "json", str(path)], timeout=60)
    s = json.loads(out)["streams"][0]
    return int(s["width"]), int(s["height"])
