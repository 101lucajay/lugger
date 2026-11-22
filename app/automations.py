"""General-purpose automations: a trigger followed by a list of steps.

Triggers:  manual | interval | schedule | webhook | event
Steps:     http | claude | discord | slack | telegram | produce_video | add_idea | run_agent |
           autopilot | filter | delay | log

String fields support templates like {{trigger.data.title}}, {{steps.1.output}},
{{steps.last.output.status}}, {{date}}, {{time}}, {{stats.published}}.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import re
import secrets
import time
import traceback
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from . import config, db
from .events import bus, on_event

TRIGGER_TYPES = {"manual", "interval", "schedule", "webhook", "event"}
STEP_TYPES = {"http", "claude", "discord", "slack", "telegram", "produce_video", "add_idea", "run_agent",
              "autopilot", "filter", "delay", "log"}
EVENTS = {
    "video.created": "Neues Video gestartet",
    "video.ready": "Video wartet auf Freigabe",
    "video.approved": "Video freigegeben",
    "video.published": "Video veröffentlicht",
    "video.failed": "Fehler in der Produktion",
    "ideas.found": "Neue Ideen gefunden",
}
MAX_STEPS = 25
OUTPUT_LIMIT = 4000


class StopRun(Exception):
    """Raised by a filter step: the run ends early without being an error."""


# ---------------- storage ----------------

def _decode(row: dict | None) -> dict | None:
    if not row:
        return None
    row["trigger"] = json.loads(row["trigger"] or "{}")
    row["steps"] = json.loads(row["steps"] or "[]")
    row["enabled"] = bool(row["enabled"])
    return row


def list_automations() -> list[dict]:
    return [_decode(r) for r in db.query("SELECT * FROM automations ORDER BY id DESC")]


def get_automation(aid: int) -> dict | None:
    return _decode(db.query_one("SELECT * FROM automations WHERE id=?", (aid,)))


def validate(data: dict) -> dict:
    name = str(data.get("name", "")).strip()
    if not name:
        raise ValueError("Bitte gib der Automatisierung einen Namen.")
    trigger = data.get("trigger") or {"type": "manual"}
    if trigger.get("type") not in TRIGGER_TYPES:
        raise ValueError("Unbekannter Auslöser.")
    if trigger["type"] == "event" and trigger.get("event") not in EVENTS:
        raise ValueError("Bitte wähle ein Ereignis.")
    if trigger["type"] == "interval":
        trigger["minutes"] = max(1, int(float(trigger.get("minutes") or 60)))
    steps = data.get("steps") or []
    if not isinstance(steps, list) or len(steps) > MAX_STEPS:
        raise ValueError(f"Höchstens {MAX_STEPS} Schritte.")
    for s in steps:
        if s.get("type") not in STEP_TYPES:
            raise ValueError(f"Unbekannter Schritt: {s.get('type')}")
    return {"name": name[:120], "description": str(data.get("description", ""))[:500],
            "enabled": bool(data.get("enabled", True)), "trigger": trigger, "steps": steps}


def create(data: dict) -> dict:
    v = validate(data)
    now = time.time()
    cur = db.execute(
        "INSERT INTO automations(name, description, enabled, trigger, steps, webhook_token, run_count, created_at, updated_at) "
        "VALUES(?,?,?,?,?,?,0,?,?)",
        (v["name"], v["description"], int(v["enabled"]), json.dumps(v["trigger"], ensure_ascii=False),
         json.dumps(v["steps"], ensure_ascii=False), secrets.token_urlsafe(18), now, now))
    a = get_automation(cur.lastrowid)
    bus.publish("automation", a)
    return a


def update(aid: int, data: dict) -> dict:
    v = validate(data)
    db.execute("UPDATE automations SET name=?, description=?, enabled=?, trigger=?, steps=?, updated_at=? WHERE id=?",
               (v["name"], v["description"], int(v["enabled"]), json.dumps(v["trigger"], ensure_ascii=False),
                json.dumps(v["steps"], ensure_ascii=False), time.time(), aid))
    a = get_automation(aid)
    bus.publish("automation", a)
    return a


def set_enabled(aid: int, enabled: bool) -> dict:
    db.execute("UPDATE automations SET enabled=?, updated_at=? WHERE id=?", (int(enabled), time.time(), aid))
    a = get_automation(aid)
    bus.publish("automation", a)
    return a


def delete(aid: int) -> None:
    db.execute("DELETE FROM automations WHERE id=?", (aid,))
    db.execute("DELETE FROM automation_runs WHERE automation_id=?", (aid,))
    bus.publish("automation_deleted", {"id": aid})


def by_token(token: str) -> dict | None:
    return _decode(db.query_one("SELECT * FROM automations WHERE webhook_token=?", (token,)))


def _decode_run(r: dict) -> dict:
    r["trigger"] = json.loads(r["trigger"] or "{}")
    r["results"] = json.loads(r["results"] or "[]")
    return r


def list_runs(aid: int | None = None, limit: int = 50) -> list[dict]:
    if aid:
        rows = db.query("SELECT * FROM automation_runs WHERE automation_id=? ORDER BY id DESC LIMIT ?", (aid, limit))
    else:
        rows = db.query("SELECT * FROM automation_runs ORDER BY id DESC LIMIT ?", (limit,))
    return [_decode_run(r) for r in rows]


# ---------------- templating ----------------

_TPL = re.compile(r"\{\{\s*([\w\.\-]+)\s*\}\}")


def _lookup(ctx: Any, path: str) -> Any:
    cur = ctx
    for part in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        elif isinstance(cur, list) and part.isdigit():
            idx = int(part)
            cur = cur[idx] if idx < len(cur) else None
        else:
            return ""
        if cur is None:
            return ""
    return cur


def render(value: Any, ctx: dict) -> Any:
    if isinstance(value, str):
        def rep(m):
            v = _lookup(ctx, m.group(1))
            return json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else str(v)
        return _TPL.sub(rep, value)
    if isinstance(value, dict):
        return {k: render(v, ctx) for k, v in value.items()}
    if isinstance(value, list):
        return [render(v, ctx) for v in value]
    return value


def _short(text: Any) -> Any:
    if isinstance(text, str) and len(text) > OUTPUT_LIMIT:
        return text[:OUTPUT_LIMIT] + " …"
    return text


# ---------------- steps ----------------

async def _post_json(url: str, payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(url, json=payload)
    if r.status_code >= 400:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")
    return {"status": r.status_code}


async def execute_step(step: dict, ctx: dict) -> Any:
    t = step["type"]
    s = render({k: v for k, v in step.items() if k != "type"}, ctx)

    if t == "http":
        url = s.get("url", "").strip()
        if not url.startswith(("http://", "https://")):
            raise ValueError("Die URL muss mit http:// oder https:// beginnen.")
        headers = {}
        if s.get("headers"):
            try:
                headers = json.loads(s["headers"])
            except json.JSONDecodeError as exc:
                raise ValueError("Header müssen gültiges JSON sein, z. B. {\"Authorization\": \"Bearer …\"}") from exc
        method = (s.get("method") or "GET").upper()
        body = s.get("body") or None
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
            r = await c.request(method, url, headers=headers, content=body.encode() if body else None)
        out: dict[str, Any] = {"status": r.status_code, "body": _short(r.text)}
        try:
            out["json"] = r.json()
        except ValueError:
            pass
        if s.get("fail_on_error", True) not in (False, "false") and r.status_code >= 400:
            raise RuntimeError(f"HTTP {r.status_code}")
        return out

    if t == "claude":
        from . import llm
        text = await llm.text_call(s.get("system") or "Du bist ein hilfreicher Assistent. Antworte auf Deutsch.",
                                   s.get("prompt", ""), web_search=bool(s.get("web_search")))
        return _short(text)

    if t == "discord":
        return await _post_json(s["webhook_url"], {"content": s.get("message", "")[:1900]})

    if t == "slack":
        return await _post_json(s["webhook_url"], {"text": s.get("message", "")})

    if t == "telegram":
        url = f"https://api.telegram.org/bot{s['bot_token']}/sendMessage"
        return await _post_json(url, {"chat_id": s["chat_id"], "text": s.get("message", "")[:4000]})

    if t == "produce_video":
        from .agents.producer import start_production
        from .agents import registry
        vid = start_production(topic=(s.get("topic") or "").strip() or None)
        registry.get("script_writer").kick()
        return {"video_id": vid}

    if t == "add_idea":
        title = (s.get("title") or "").strip()
        if not title:
            raise ValueError("Die Idee braucht einen Titel.")
        iid = db.add_idea(title, s.get("angle", ""), "", "", [], 8, origin="automation")
        bus.publish("ideas", {})
        return {"idea_id": iid}

    if t == "run_agent":
        from .agents import registry
        agent = registry.get(s.get("agent") or "trend_scout")
        await agent.run_now()
        return {"agent": agent.key}

    if t == "autopilot":
        on = s.get("on") in (True, "true", "on", "1")
        config.set_many({"autopilot": on})
        return {"autopilot": on}

    if t == "filter":
        left, op, right = str(s.get("left", "")), s.get("op", "contains"), str(s.get("right", ""))
        ok = {
            "contains": right.lower() in left.lower(),
            "not_contains": right.lower() not in left.lower(),
            "equals": left == right,
            "not_equals": left != right,
            "not_empty": bool(left.strip()),
            "gt": _num(left) > _num(right),
            "lt": _num(left) < _num(right),
        }.get(op, False)
        if not ok:
            raise StopRun(f"Bedingung nicht erfüllt: „{left[:60]}“ {op} „{right[:60]}“")
        return {"passed": True}

    if t == "delay":
        secs = max(0, min(3600, float(s.get("seconds") or 0)))
        await asyncio.sleep(secs)
        return {"waited": secs}

    if t == "log":
        msg = str(s.get("message", ""))
        db.add_log("automations", "info", msg[:500])
        return msg

    raise ValueError(f"Unbekannter Schritt {t}")


def _num(v: str) -> float:
    try:
        return float(str(v).replace(",", "."))
    except ValueError:
        return 0.0


# ---------------- engine ----------------

class Engine:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self.active: dict[int, dict] = {}

    def start(self) -> None:
        on_event(self.handle_event)
        self._task = asyncio.create_task(self._loop(), name="automation-engine")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _loop(self) -> None:
        while True:
            try:
                self.check_time_triggers()
            except Exception:  # noqa: BLE001
                traceback.print_exc()
            await asyncio.sleep(15)

    def check_time_triggers(self) -> None:
        now = time.time()
        try:
            tz = ZoneInfo(config.get("timezone"))
        except Exception:  # noqa: BLE001
            tz = ZoneInfo("Europe/Berlin")
        local = dt.datetime.now(tz)
        for a in list_automations():
            if not a["enabled"] or a["id"] in self.active:
                continue
            t = a["trigger"]
            if t["type"] == "interval":
                if not a["last_run_at"] or now - a["last_run_at"] >= int(t.get("minutes", 60)) * 60:
                    self.launch(a, {"type": "interval"})
            elif t["type"] == "schedule":
                days = {int(d) for d in str(t.get("days") or "1,2,3,4,5,6,7").split(",") if d.strip().isdigit()}
                if local.isoweekday() not in days:
                    continue
                for part in str(t.get("times") or "08:00").split(","):
                    try:
                        h, m = (int(x) for x in part.strip().split(":"))
                    except ValueError:
                        continue
                    slot = local.replace(hour=h, minute=m, second=0, microsecond=0)
                    key = slot.strftime("%Y-%m-%d %H:%M")
                    if slot <= local < slot + dt.timedelta(minutes=10) and (a["last_slot"] or "") < key:
                        db.execute("UPDATE automations SET last_slot=? WHERE id=?", (key, a["id"]))
                        self.launch(a, {"type": "schedule", "slot": key})
                        break

    def handle_event(self, name: str, data: dict) -> None:
        for a in list_automations():
            t = a["trigger"]
            if a["enabled"] and t.get("type") == "event" and t.get("event") == name:
                self.launch(a, {"type": "event", "event": name, "label": EVENTS.get(name, name), "data": data})

    def launch(self, a: dict, trigger: dict) -> int:
        now = time.time()
        cur = db.execute("INSERT INTO automation_runs(automation_id, started_at, status, trigger, results) VALUES(?,?, 'running', ?, '[]')",
                         (a["id"], now, json.dumps(trigger, ensure_ascii=False, default=str)))
        run_id = cur.lastrowid
        db.execute("UPDATE automations SET last_run_at=?, last_status='running' WHERE id=?", (now, a["id"]))
        self.active[a["id"]] = {"run_id": run_id, "name": a["name"], "started_at": now}
        asyncio.get_event_loop().create_task(self._run(a, run_id, trigger))
        return run_id

    def _publish_run(self, run_id: int) -> None:
        row = db.query_one("SELECT * FROM automation_runs WHERE id=?", (run_id,))
        if row:
            run = _decode_run(row)
            run["automation_name"] = (get_automation(run["automation_id"]) or {}).get("name", "")
            bus.publish("automation_run", run)

    async def _run(self, a: dict, run_id: int, trigger: dict) -> None:
        stats = {r["status"]: r["n"] for r in db.query("SELECT status, COUNT(*) AS n FROM videos GROUP BY status")}
        now = dt.datetime.now()
        ctx: dict[str, Any] = {
            "trigger": trigger, "steps": {}, "now": now.isoformat(timespec="seconds"),
            "date": now.strftime("%d.%m.%Y"), "time": now.strftime("%H:%M"),
            "automation": {"name": a["name"], "id": a["id"]},
            "stats": {"published": stats.get("published", 0), "awaiting_approval": stats.get("awaiting_approval", 0),
                      "ideas": len(db.list_ideas("new"))},
        }
        results: list[dict] = []
        status = "success"
        self._publish_run(run_id)
        try:
            for i, step in enumerate(a["steps"], 1):
                t0 = time.time()
                res: dict[str, Any] = {"n": i, "type": step.get("type"), "label": step.get("label") or ""}
                try:
                    res["output"] = await execute_step(step, ctx)
                    res["status"] = "ok"
                except StopRun as stop:
                    res["status"], res["output"] = "skipped", str(stop)
                    status = "skipped"
                except Exception as exc:  # noqa: BLE001
                    res["status"], res["output"] = "error", str(exc)[:500]
                    if not step.get("continue_on_error"):
                        status = "error"
                res["ms"] = int((time.time() - t0) * 1000)
                results.append(res)
                ctx["steps"][str(i)] = res
                ctx["steps"]["last"] = res
                db.execute("UPDATE automation_runs SET results=? WHERE id=?", (json.dumps(results, ensure_ascii=False, default=str), run_id))
                self._publish_run(run_id)
                if status in ("error", "skipped"):
                    break
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            status = "error"
            results.append({"n": len(results) + 1, "type": "engine", "status": "error", "output": str(exc)})
        finally:
            end = time.time()
            db.execute("UPDATE automation_runs SET finished_at=?, status=?, results=? WHERE id=?",
                       (end, status, json.dumps(results, ensure_ascii=False, default=str), run_id))
            db.execute("UPDATE automations SET last_status=?, run_count=run_count+1 WHERE id=?", (status, a["id"]))
            self.active.pop(a["id"], None)
            label = {"success": "erfolgreich", "skipped": "übersprungen", "error": "mit Fehler beendet"}[status]
            entry = db.add_log("automations", "error" if status == "error" else "info", f"„{a['name']}“ {label}")
            bus.publish("log", entry)
            self._publish_run(run_id)
            bus.publish("automation", get_automation(a["id"]))
            # keep history bounded
            db.execute("DELETE FROM automation_runs WHERE automation_id=? AND id NOT IN "
                       "(SELECT id FROM automation_runs WHERE automation_id=? ORDER BY id DESC LIMIT 100)", (a["id"], a["id"]))


engine = Engine()
