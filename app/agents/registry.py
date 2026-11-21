"""All agents of the station, in pipeline order."""
from __future__ import annotations

from .base import Agent
from .editor import Cutter
from .producer import Producer
from .publisher import Publisher
from .script_writer import ScriptWriter
from .trend_scout import TrendScout
from .visuals import VisualEditor
from .voice import VoiceArtist

AGENTS: list[Agent] = []


def build() -> list[Agent]:
    AGENTS.clear()
    AGENTS.extend([TrendScout(), Producer(), ScriptWriter(), VoiceArtist(), VisualEditor(), Cutter(), Publisher()])
    return AGENTS


def get(key: str) -> Agent:
    for a in AGENTS:
        if a.key == key:
            return a
    raise KeyError(key)
