"""Lugger – Agenten-Zentrale für automatisierte Kurzvideos. FastAPI app + dashboard."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import automations as auto
from . import config, db
from .agents import registry
from .agents.base import AgentError
from .agents.producer import next_slot, start_production, upcoming_slots
from .events import bus, emit_event
from .paths import STATIC_DIR, VIDEOS_DIR, video_dir
from .publishers.platforms import enabled_platforms

PASSWORD = os.environ.get("DASHBOARD_PASSWORD", "")
COOKIE = "lugger_session"

IN_PROGRESS_RESET = {"scripting": "queued", "voicing": "scripted", "sourcing": "voiced",
                     "rendering": "visuals_ready", "publishing": "approved"}


def _token() -> str:
    return hmac.new(PASSWORD.encode(), b"lugger-dashboard", hashlib.sha256).hexdigest()


def _authed(cookies) -> bool:
    return not PASSWORD or hmac.compare_digest(cookies.get(COOKIE, ""), _token())


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.conn()
    for working, back in IN_PROGRESS_RESET.items():
        db.execute("UPDATE videos SET status=? WHERE status=?", (back, working))
    agents = registry.build()
    for a in agents:
        a.start()
    db.execute("UPDATE automation_runs SET status='error', finished_at=? WHERE status='running'", (__import__("time").time(),))
    auto.engine.start()
    db.add_log("system", "info", "Agenten-Zentrale gestartet")
    yield
    await auto.engine.stop()
    for a in agents:
        await a.stop()


app = FastAPI(title="Lugger Agenten-Zentrale", lifespan=lifespan)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if path in ("/login", "/healthz") or path.startswith(("/static/", "/hooks/")) or _authed(request.cookies):
        return await call_next(request)
    if path.startswith("/api/"):
        return JSONResponse({"detail": "Nicht angemeldet"}, status_code=401)
    return RedirectResponse("/login")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# ---------------- pages ----------------

@app.get("/", response_class=HTMLResponse)
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/login", response_class=HTMLResponse)
async def login_page():
    return FileResponse(STATIC_DIR / "login.html")


@app.post("/login")
async def login(request: Request):
    form = await request.form()
    if PASSWORD and hmac.compare_digest(str(form.get("password", "")), PASSWORD):
        resp = RedirectResponse("/", status_code=303)
        resp.set_cookie(COOKIE, _token(), httponly=True, samesite="lax", max_age=60 * 60 * 24 * 30)
        return resp
    return RedirectResponse("/login?error=1", status_code=303)


@app.get("/logout")
async def logout():
    resp = RedirectResponse("/login")
    resp.delete_cookie(COOKIE)
    return resp


@app.get("/healthz")
async def healthz():
    return {"ok": True}


# ---------------- state ----------------

def stats() -> dict:
    rows = db.query("SELECT status, COUNT(*) AS n FROM videos GROUP BY status")
    by = {r["status"]: r["n"] for r in rows}
    in_prod = sum(n for s, n in by.items() if s in (
        "queued", "scripting", "scripted", "voicing", "voiced", "sourcing", "visuals_ready",
        "rendering", "rendered", "approved", "publishing"))
    return {"ideas": len(db.list_ideas("new")), "in_production": in_prod,
            "awaiting_approval": by.get("awaiting_approval", 0), "published": by.get("published", 0),
            "failed": by.get("failed", 0) + by.get("publish_failed", 0), "by_status": by}


@app.get("/api/state")
async def state():
    slot = next_slot() if config.get("autopilot") else None
    return {"agents": [a.state() for a in registry.AGENTS], "stats": stats(),
            "autopilot": config.get("autopilot"), "require_approval": config.get("require_approval"),
            "niche": config.get("niche"), "next_slot": slot.isoformat() if slot else None,
            "upcoming": [s.isoformat() for s in upcoming_slots(6)] if config.get("autopilot") else [],
            "platforms": enabled_platforms(), "auth": bool(PASSWORD),
            "automations": {"total": len(auto.list_automations()), "active": sum(1 for a in auto.list_automations() if a["enabled"]),
                            "running": [dict(id=k, **v) for k, v in auto.engine.active.items()]}}


@app.get("/api/logs")
async def logs(limit: int = 200, video_id: int | None = None, agent: str | None = None):
    return db.recent_logs(limit, video_id, agent)


# ---------------- admin center ----------------

LLM_AGENTS = {"trend_scout", "script_writer"}


@app.get("/api/admin/agents")
async def admin_agents():
    day = __import__("time").time() - 86400
    out = []
    for a in registry.AGENTS:
        row = db.query_one("SELECT SUM(level='error') AS errors, COUNT(*) AS n FROM logs WHERE agent=? AND ts>=?", (a.key, day)) or {}
        out.append({**a.state(), "config": config.agent_cfg(a.key), "uses_llm": a.key in LLM_AGENTS,
                    "errors_24h": row.get("errors") or 0, "log_lines_24h": row.get("n") or 0})
    return out


@app.put("/api/admin/agents/{key}")
async def admin_agent_update(key: str, payload: dict = Body(...)):
    try:
        agent = registry.get(key)
    except KeyError:
        raise HTTPException(404, "Agent unbekannt")
    config.set_agent_cfg(key, payload)
    agent.log("Konfiguration im Admin-Center geändert")
    bus.publish("agent", agent.state())
    return {**agent.state(), "config": config.agent_cfg(key), "uses_llm": key in LLM_AGENTS}


@app.post("/api/admin/retry-failed")
async def admin_retry_failed():
    failed = db.query("SELECT id FROM videos WHERE status IN ('failed', 'publish_failed')")
    for row in failed:
        await retry(row["id"])
    db.add_log("system", "info", f"{len(failed)} fehlgeschlagene Videos erneut gestartet")
    return {"retried": len(failed)}


# ---------------- agents ----------------

@app.post("/api/agents/{key}/{action}")
async def agent_action(key: str, action: str):
    try:
        agent = registry.get(key)
    except KeyError:
        raise HTTPException(404, "Agent unbekannt")
    if action == "pause":
        agent.pause()
    elif action == "resume":
        agent.resume()
    elif action == "run":
        if not agent.enabled:
            agent.resume()
        await agent.run_now()
    elif action == "restart":
        await agent.restart()
    else:
        raise HTTPException(400, "Unbekannte Aktion")
    return agent.state()


@app.post("/api/autopilot")
async def autopilot(on: bool = Body(..., embed=True)):
    config.set_many({"autopilot": on})
    db.add_log("system", "info", f"Autopilot {'an' if on else 'aus'}")
    bus.publish("log", {"ts": 0, "agent": "system", "level": "info", "message": f"Autopilot {'an' if on else 'aus'}"})
    for a in registry.AGENTS:
        a.kick()
    return await state()


@app.post("/api/agents/all/{action}")
async def all_agents(action: str):
    for a in registry.AGENTS:
        a.pause() if action == "pause" else a.resume()
    return await state()


# ---------------- ideas ----------------

@app.get("/api/ideas")
async def ideas(status: str | None = None):
    return db.list_ideas(status)


@app.post("/api/ideas")
async def add_idea(payload: dict = Body(...)):
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(400, "Titel fehlt")
    iid = db.add_idea(title, payload.get("angle", ""), payload.get("hook", ""), "", [], 9, origin="manuell")
    bus.publish("ideas", {})
    return db.get_idea(iid)


@app.post("/api/ideas/{idea_id}/produce")
async def produce_idea(idea_id: int):
    try:
        vid = start_production(idea_id=idea_id)
    except AgentError as exc:
        raise HTTPException(400, str(exc))
    registry.get("script_writer").kick()
    return db.get_video(vid)


@app.post("/api/ideas/{idea_id}/discard")
async def discard_idea(idea_id: int):
    db.update_idea(idea_id, status="discarded")
    bus.publish("ideas", {})
    return {"ok": True}


@app.post("/api/produce")
async def produce(payload: dict = Body(default={})):
    try:
        vid = start_production(topic=(payload.get("topic") or "").strip() or None)
    except AgentError as exc:
        raise HTTPException(400, str(exc))
    registry.get("script_writer").kick()
    return db.get_video(vid)


# ---------------- videos ----------------

@app.get("/api/videos")
async def videos():
    return db.list_videos()


@app.get("/api/videos/{vid}")
async def get_video(vid: int):
    v = db.get_video(vid)
    if not v:
        raise HTTPException(404)
    return v


def _set_status(vid: int, status: str, **fields):
    db.update_video(vid, status=status, **fields)
    v = db.get_video(vid)
    bus.publish("video", v)
    return v


@app.post("/api/videos/{vid}/approve")
async def approve(vid: int):
    v = db.get_video(vid)
    if not v or v["status"] not in ("awaiting_approval", "rejected", "ready"):
        raise HTTPException(400, "Video kann in diesem Zustand nicht freigegeben werden")
    db.add_log("system", "info", f"Video #{vid} freigegeben", vid)
    v = _set_status(vid, "approved", error=None)
    emit_event("video.approved", {"id": vid, "title": v.get("title") or v["topic"]})
    registry.get("publisher").kick()
    return v


@app.post("/api/videos/{vid}/reject")
async def reject(vid: int):
    db.add_log("system", "info", f"Video #{vid} abgelehnt", vid)
    return _set_status(vid, "rejected")


@app.post("/api/videos/{vid}/retry")
async def retry(vid: int):
    v = db.get_video(vid)
    if not v:
        raise HTTPException(404)
    vdir = video_dir(vid)
    script = v["script"] or {}
    if not script.get("segments"):
        target = "queued"
    elif not (vdir / "timings.json").exists():
        target = "scripted"
    elif not script.get("visuals"):
        target = "voiced"
    elif not (v["video_path"] and Path(v["video_path"]).exists()):
        target = "visuals_ready"
    elif v["status"] == "publish_failed":
        target = "approved"
    else:
        target = "awaiting_approval" if config.get("require_approval") else "approved"
    for a in registry.AGENTS:
        a.kick()
    return _set_status(vid, target, error=None)


@app.post("/api/videos/{vid}/rerender")
async def rerender(vid: int, payload: dict = Body(default={})):
    """Restart from a chosen stage: script | voice | visuals | render."""
    stage = payload.get("stage", "render")
    target = {"script": "queued", "voice": "scripted", "visuals": "voiced", "render": "visuals_ready"}.get(stage)
    if not target:
        raise HTTPException(400, "Unbekannte Stufe")
    for a in registry.AGENTS:
        a.kick()
    return _set_status(vid, target, error=None)


@app.put("/api/videos/{vid}/meta")
async def update_meta(vid: int, payload: dict = Body(...)):
    v = db.get_video(vid)
    if not v or not v["script"]:
        raise HTTPException(404)
    script = v["script"]
    for k in ("title", "description"):
        if k in payload:
            script[k] = str(payload[k])
    if "hashtags" in payload:
        tags = payload["hashtags"]
        if isinstance(tags, str):
            tags = tags.split()
        script["hashtags"] = [t if t.startswith("#") else f"#{t}" for t in tags if t]
    db.update_video(vid, script=script, title=script["title"])
    v = db.get_video(vid)
    bus.publish("video", v)
    return v


@app.delete("/api/videos/{vid}")
async def delete_video(vid: int):
    db.execute("DELETE FROM videos WHERE id=?", (vid,))
    d = VIDEOS_DIR / f"{vid:05d}"
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)
    bus.publish("video_deleted", {"id": vid})
    return {"ok": True}


@app.get("/api/videos/{vid}/file")
async def video_file(vid: int, download: bool = False):
    v = db.get_video(vid)
    if not v or not v["video_path"] or not Path(v["video_path"]).exists():
        raise HTTPException(404)
    name = f"video_{vid}.mp4"
    return FileResponse(v["video_path"], media_type="video/mp4",
                        filename=name if download else None)


@app.get("/api/videos/{vid}/thumb")
async def video_thumb(vid: int):
    v = db.get_video(vid)
    if not v or not v["thumb_path"] or not Path(v["thumb_path"]).exists():
        raise HTTPException(404)
    return FileResponse(v["thumb_path"], media_type="image/jpeg")


# ---------------- automations ----------------

def _with_meta(a: dict, request: Request | None = None) -> dict:
    a = dict(a)
    a["webhook_path"] = f"/hooks/{a['webhook_token']}"
    a["running"] = a["id"] in auto.engine.active
    return a


@app.get("/api/automations")
async def automations_list():
    return [_with_meta(a) for a in auto.list_automations()]


@app.get("/api/automations/runs")
async def automation_runs_all(limit: int = 30):
    names = {a["id"]: a["name"] for a in auto.list_automations()}
    runs = auto.list_runs(None, limit)
    for r in runs:
        r["automation_name"] = names.get(r["automation_id"], "")
    return runs


@app.post("/api/automations")
async def automations_create(payload: dict = Body(...)):
    try:
        return _with_meta(auto.create(payload))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.put("/api/automations/{aid}")
async def automations_update(aid: int, payload: dict = Body(...)):
    if not auto.get_automation(aid):
        raise HTTPException(404, "Automatisierung nicht gefunden")
    try:
        return _with_meta(auto.update(aid, payload))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.post("/api/automations/{aid}/toggle")
async def automations_toggle(aid: int, enabled: bool = Body(..., embed=True)):
    if not auto.get_automation(aid):
        raise HTTPException(404, "Automatisierung nicht gefunden")
    return _with_meta(auto.set_enabled(aid, enabled))


@app.delete("/api/automations/{aid}")
async def automations_delete(aid: int):
    auto.delete(aid)
    return {"ok": True}


@app.post("/api/automations/{aid}/run")
async def automations_run(aid: int, payload: dict = Body(default={})):
    a = auto.get_automation(aid)
    if not a:
        raise HTTPException(404, "Automatisierung nicht gefunden")
    run_id = auto.engine.launch(a, {"type": "manual", "data": payload or {}})
    return {"ok": True, "run_id": run_id}


@app.get("/api/automations/{aid}/runs")
async def automations_runs(aid: int, limit: int = 30):
    return auto.list_runs(aid, limit)


@app.api_route("/hooks/{token}", methods=["GET", "POST"])
async def webhook(token: str, request: Request):
    a = auto.by_token(token)
    if not a or not a["enabled"] or a["trigger"].get("type") != "webhook":
        raise HTTPException(404, "Unbekannter Webhook")
    data: dict = dict(request.query_params)
    if request.method == "POST":
        try:
            body = await request.json()
            data.update(body if isinstance(body, dict) else {"body": body})
        except Exception:  # noqa: BLE001
            data["body"] = (await request.body()).decode(errors="replace")[:5000]
    run_id = auto.engine.launch(a, {"type": "webhook", "data": data})
    return {"ok": True, "run_id": run_id}


# ---------------- settings ----------------

@app.get("/api/settings")
async def get_settings():
    return config.public_settings()


@app.post("/api/settings")
async def save_settings(payload: dict = Body(...)):
    config.set_many(payload)
    db.add_log("system", "info", "Einstellungen gespeichert")
    for a in registry.AGENTS:
        a.kick()
    return config.public_settings()


# ---------------- live updates ----------------

@app.websocket("/ws")
async def ws(websocket: WebSocket):
    if not _authed(websocket.cookies):
        await websocket.close(code=4401)
        return
    await websocket.accept()
    q = bus.subscribe()
    try:
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=20)
                await websocket.send_text(msg)
            except asyncio.TimeoutError:
                await websocket.send_text('{"type":"ping"}')
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        bus.unsubscribe(q)
