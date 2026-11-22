"""Thin wrapper around the Claude API for structured JSON answers (optionally with web search)."""
from __future__ import annotations

import json
from typing import Any

import anthropic

from . import config
from .agents.base import AgentError


def has_key() -> bool:
    return bool(config.get("anthropic_api_key"))


def _client() -> anthropic.AsyncAnthropic:
    key = config.get("anthropic_api_key")
    if not key:
        raise AgentError("Kein Anthropic API-Key hinterlegt (Einstellungen → KI).")
    return anthropic.AsyncAnthropic(api_key=key, timeout=600, max_retries=3)


async def json_call(system: str, prompt: str, schema: dict[str, Any], *,
                    web_search: bool = False, effort: str = "medium",
                    max_uses: int = 6) -> dict[str, Any]:
    """Ask Claude and get back a dict that matches `schema`."""
    client = _client()
    model = config.get("llm_model")
    tools = []
    if web_search and config.get("llm_web_search"):
        tools.append({"type": "web_search_20260209", "name": "web_search", "max_uses": max_uses,
                      "user_location": {"type": "approximate", "country": "DE"}})

    messages: list[dict[str, Any]] = [{"role": "user", "content": prompt}]
    kwargs: dict[str, Any] = dict(
        model=model,
        max_tokens=32000,
        system=system,
        thinking={"type": "adaptive"},
        output_config={"effort": effort,
                       "format": {"type": "json_schema", "schema": schema}},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if tools:
        kwargs["tools"] = tools

    try:
        for _ in range(5):  # resume server-tool turns that paused
            async with client.beta.messages.stream(messages=messages, **kwargs) as stream:
                response = await stream.get_final_message()
            if response.stop_reason == "pause_turn":
                messages = [*messages[:1], {"role": "assistant", "content": response.content}]
                continue
            break
    except anthropic.AuthenticationError as exc:
        raise AgentError("Anthropic API-Key ist ungültig.") from exc
    except anthropic.RateLimitError as exc:
        raise AgentError("Claude Rate-Limit erreicht – versuche es später erneut.") from exc
    except anthropic.BadRequestError as exc:
        raise AgentError(f"Claude-Anfrage abgelehnt: {exc.message}") from exc
    except anthropic.APIStatusError as exc:
        raise AgentError(f"Claude API-Fehler {exc.status_code}: {exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        raise AgentError("Keine Verbindung zur Claude API.") from exc

    if response.stop_reason == "refusal":
        raise AgentError("Claude hat diese Anfrage abgelehnt (refusal). Thema überspringen.")
    if response.stop_reason == "max_tokens":
        raise AgentError("Antwort von Claude war zu lang (max_tokens).")

    texts = [b.text for b in response.content if getattr(b, "type", "") == "text"]
    if not texts:
        raise AgentError("Claude hat keinen Text zurückgegeben.")
    raw = texts[-1]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: find the outermost JSON object in the combined text
        joined = "".join(texts)
        start, end = joined.find("{"), joined.rfind("}")
        if start >= 0 and end > start:
            return json.loads(joined[start:end + 1])
        raise AgentError("Claude-Antwort war kein gültiges JSON.")


async def text_call(system: str, prompt: str, *, web_search: bool = False, effort: str = "medium") -> str:
    """Free-form text answer (used by automation steps)."""
    client = _client()
    kwargs: dict[str, Any] = dict(model=config.get("llm_model"), max_tokens=16000, system=system,
                                  thinking={"type": "adaptive"}, output_config={"effort": effort},
                                  betas=["server-side-fallback-2026-07-01"], fallbacks="default")
    if web_search:
        kwargs["tools"] = [{"type": "web_search_20260209", "name": "web_search", "max_uses": 5}]
    messages: list[dict[str, Any]] = [{"role": "user", "content": prompt}]
    try:
        for _ in range(5):
            async with client.beta.messages.stream(messages=messages, **kwargs) as stream:
                response = await stream.get_final_message()
            if response.stop_reason == "pause_turn":
                messages = [*messages[:1], {"role": "assistant", "content": response.content}]
                continue
            break
    except anthropic.AuthenticationError as exc:
        raise AgentError("Anthropic API-Key ist ungültig.") from exc
    except anthropic.RateLimitError as exc:
        raise AgentError("Claude Rate-Limit erreicht.") from exc
    except anthropic.APIStatusError as exc:
        raise AgentError(f"Claude API-Fehler {exc.status_code}: {exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        raise AgentError("Keine Verbindung zur Claude API.") from exc
    if response.stop_reason == "refusal":
        raise AgentError("Claude hat diese Anfrage abgelehnt.")
    return "".join(b.text for b in response.content if getattr(b, "type", "") == "text").strip()
