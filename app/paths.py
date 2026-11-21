import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("LUGGER_DATA_DIR", BASE_DIR / "data")).resolve()
VIDEOS_DIR = DATA_DIR / "videos"
MUSIC_DIR = DATA_DIR / "music"
STATIC_DIR = Path(__file__).resolve().parent / "static"


def video_dir(video_id: int) -> Path:
    d = VIDEOS_DIR / f"{video_id:05d}"
    d.mkdir(parents=True, exist_ok=True)
    return d
