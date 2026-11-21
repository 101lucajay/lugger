"""Uploaders for YouTube, TikTok, Instagram (official APIs) and upload-post.com (one API for all)."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx

from .. import config, db
from ..agents.base import AgentError

PLATFORMS = ("youtube", "tiktok", "instagram")


def caption(script: dict, limit: int = 2200, with_title: bool = True) -> str:
    tags = " ".join(t if t.startswith("#") else f"#{t}" for t in script.get("hashtags", []))
    body = script.get("description", "")
    text = f"{script['title']}\n\n{body}\n\n{tags}" if with_title else f"{body}\n\n{tags}"
    return text.strip()[:limit]


def _err(platform: str, r: httpx.Response) -> AgentError:
    return AgentError(f"{platform} API {r.status_code}: {r.text[:300]}")


# ---------------- YouTube (Data API v3) ----------------

async def youtube_upload(path: Path, script: dict) -> dict:
    cid, secret, refresh = (config.get("youtube_client_id"), config.get("youtube_client_secret"),
                            config.get("youtube_refresh_token"))
    if not (cid and secret and refresh):
        raise AgentError("YouTube: Client-ID, Client-Secret oder Refresh-Token fehlt")
    size = path.stat().st_size
    async with httpx.AsyncClient(timeout=600) as c:
        r = await c.post("https://oauth2.googleapis.com/token", data={
            "client_id": cid, "client_secret": secret, "refresh_token": refresh,
            "grant_type": "refresh_token"})
        if r.status_code >= 400:
            raise _err("YouTube OAuth", r)
        token = r.json()["access_token"]
        title = script["title"][:95]
        if "#shorts" not in title.lower() and len(title) <= 87:
            title += " #Shorts"
        meta = {
            "snippet": {"title": title, "description": caption(script, 4900, with_title=False),
                        "tags": [t.lstrip("#") for t in script.get("hashtags", [])][:15],
                        "categoryId": "28", "defaultLanguage": "de", "defaultAudioLanguage": "de"},
            "status": {"privacyStatus": config.get("youtube_privacy"), "selfDeclaredMadeForKids": False,
                       "containsSyntheticMedia": True},
        }
        r = await c.post(
            "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
            json=meta, headers={"Authorization": f"Bearer {token}", "X-Upload-Content-Type": "video/mp4",
                                "X-Upload-Content-Length": str(size)})
        if r.status_code >= 400:
            raise _err("YouTube", r)
        location = r.headers["Location"]
        r = await c.put(location, content=path.read_bytes(),
                        headers={"Authorization": f"Bearer {token}", "Content-Type": "video/mp4"})
        if r.status_code >= 400:
            raise _err("YouTube Upload", r)
        vid = r.json()["id"]
    return {"ok": True, "id": vid, "url": f"https://youtube.com/shorts/{vid}"}


# ---------------- TikTok (Content Posting API) ----------------

async def _tiktok_token(c: httpx.AsyncClient) -> str:
    key, secret, refresh = (config.get("tiktok_client_key"), config.get("tiktok_client_secret"),
                            config.get("tiktok_refresh_token"))
    if not (key and secret and refresh):
        raise AgentError("TikTok: Client-Key, Client-Secret oder Refresh-Token fehlt")
    r = await c.post("https://open.tiktokapis.com/v2/oauth/token/", data={
        "client_key": key, "client_secret": secret, "grant_type": "refresh_token",
        "refresh_token": refresh}, headers={"Content-Type": "application/x-www-form-urlencoded"})
    data = r.json() if r.content else {}
    if r.status_code >= 400 or "access_token" not in data:
        raise _err("TikTok OAuth", r)
    if data.get("refresh_token") and data["refresh_token"] != refresh:
        config.set_many({"tiktok_refresh_token": data["refresh_token"]})  # TikTok rotates tokens
    return data["access_token"]


async def tiktok_upload(path: Path, script: dict) -> dict:
    size = path.stat().st_size
    chunk = size if size <= 64 * 1024 * 1024 else 10 * 1024 * 1024
    count = max(1, size // chunk)
    async with httpx.AsyncClient(timeout=600) as c:
        token = await _tiktok_token(c)
        auth = {"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=UTF-8"}
        body = {
            "post_info": {"title": caption(script, 2200), "privacy_level": config.get("tiktok_privacy"),
                          "disable_comment": False, "disable_duet": False, "disable_stitch": False},
            "source_info": {"source": "FILE_UPLOAD", "video_size": size, "chunk_size": chunk,
                            "total_chunk_count": count},
        }
        r = await c.post("https://open.tiktokapis.com/v2/post/publish/video/init/", json=body, headers=auth)
        data = r.json()
        if r.status_code >= 400 or data.get("error", {}).get("code") not in (None, "ok"):
            raise _err("TikTok", r)
        publish_id, upload_url = data["data"]["publish_id"], data["data"]["upload_url"]
        with open(path, "rb") as f:
            for i in range(count):
                start = i * chunk
                end = size - 1 if i == count - 1 else start + chunk - 1
                f.seek(start)
                part = f.read(end - start + 1)
                r = await c.put(upload_url, content=part, headers={
                    "Content-Type": "video/mp4", "Content-Length": str(len(part)),
                    "Content-Range": f"bytes {start}-{end}/{size}"})
                if r.status_code >= 400:
                    raise _err("TikTok Upload", r)
        status = "PROCESSING"
        for _ in range(30):
            await asyncio.sleep(10)
            r = await c.post("https://open.tiktokapis.com/v2/post/publish/status/fetch/",
                             json={"publish_id": publish_id}, headers=auth)
            status = r.json().get("data", {}).get("status", status)
            if status in ("PUBLISH_COMPLETE", "FAILED", "SEND_TO_USER_INBOX"):
                break
        if status == "FAILED":
            raise AgentError(f"TikTok Verarbeitung fehlgeschlagen: {r.text[:300]}")
    return {"ok": True, "id": publish_id, "status": status,
            "note": "Bei nicht geprüfter TikTok-App ist das Video nur privat sichtbar (SELF_ONLY)."}


# ---------------- Instagram Reels (Graph API, resumable upload) ----------------

async def instagram_upload(path: Path, script: dict) -> dict:
    token, user = config.get("instagram_access_token"), config.get("instagram_user_id")
    if not (token and user):
        raise AgentError("Instagram: Access-Token oder Instagram-User-ID fehlt")
    host = "graph.instagram.com" if token.startswith("IG") else "graph.facebook.com"
    base = f"https://{host}/v21.0"
    async with httpx.AsyncClient(timeout=600) as c:
        r = await c.post(f"{base}/{user}/media", data={
            "media_type": "REELS", "upload_type": "resumable", "caption": caption(script, 2200),
            "share_to_feed": "true", "access_token": token})
        if r.status_code >= 400:
            raise _err("Instagram", r)
        container = r.json()
        cid, uri = container["id"], container.get("uri") or f"https://rupload.facebook.com/ig-api-upload/v21.0/{container['id']}"
        r = await c.post(uri, content=path.read_bytes(), headers={
            "Authorization": f"OAuth {token}", "offset": "0", "file_size": str(path.stat().st_size)})
        if r.status_code >= 400:
            raise _err("Instagram Upload", r)
        for _ in range(60):
            await asyncio.sleep(5)
            r = await c.get(f"{base}/{cid}", params={"fields": "status_code,status", "access_token": token})
            sc = r.json().get("status_code")
            if sc == "FINISHED":
                break
            if sc in ("ERROR", "EXPIRED"):
                raise AgentError(f"Instagram Verarbeitung fehlgeschlagen: {r.text[:300]}")
        else:
            raise AgentError("Instagram: Verarbeitung dauert zu lange (Timeout)")
        r = await c.post(f"{base}/{user}/media_publish", data={"creation_id": cid, "access_token": token})
        if r.status_code >= 400:
            raise _err("Instagram Publish", r)
        media_id = r.json()["id"]
        r = await c.get(f"{base}/{media_id}", params={"fields": "permalink", "access_token": token})
        link = r.json().get("permalink", "") if r.status_code < 400 else ""
    return {"ok": True, "id": media_id, "url": link}


# ---------------- upload-post.com (one API for all platforms) ----------------

async def uploadpost_upload(path: Path, script: dict, platforms: list[str]) -> dict[str, dict]:
    key, user = config.get("uploadpost_api_key"), config.get("uploadpost_user")
    if not (key and user):
        raise AgentError("upload-post.com: API-Key oder Profilname (User) fehlt")
    data: dict = {"user": user, "title": caption(script, 2200),
                  "description": caption(script, 4900, with_title=False), "platform[]": list(platforms)}
    if "youtube" in platforms:
        data.update(youtube_title=script["title"][:95], privacyStatus=config.get("youtube_privacy"))
    async with httpx.AsyncClient(timeout=900) as c:
        r = await c.post("https://api.upload-post.com/api/upload", data=data,
                         files={"video": (path.name, path.read_bytes(), "video/mp4")},
                         headers={"Authorization": f"Apikey {key}"})
    try:
        body = r.json()
    except json.JSONDecodeError:
        body = {"raw": r.text[:500]}
    if r.status_code >= 400 or body.get("success") is False:
        raise AgentError(f"upload-post.com {r.status_code}: {json.dumps(body)[:300]}")
    results = body.get("results", {}) if isinstance(body, dict) else {}
    out = {}
    for p in platforms:
        res = results.get(p, {}) if isinstance(results, dict) else {}
        ok = res.get("success", True) if isinstance(res, dict) else True
        out[p] = {"ok": bool(ok), "via": "upload-post",
                  "url": (res.get("url") or res.get("post_url") or "") if isinstance(res, dict) else "",
                  "detail": res if not ok else None,
                  "error": (res.get("error") if isinstance(res, dict) else None) if not ok else None}
    return out


DIRECT = {"youtube": youtube_upload, "tiktok": tiktok_upload, "instagram": instagram_upload}


def enabled_platforms() -> dict[str, str]:
    return {p: config.get(f"{p}_mode") for p in PLATFORMS if config.get(f"{p}_mode") in ("direct", "uploadpost")}
