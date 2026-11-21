"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const STATUS = {
  queued: ["Warteschlange", "busy"], scripting: ["Skript wird geschrieben", "busy"], scripted: ["Skript fertig", "busy"],
  voicing: ["Wird eingesprochen", "busy"], voiced: ["Stimme fertig", "busy"], sourcing: ["Sucht Material", "busy"],
  visuals_ready: ["Material bereit", "busy"], rendering: ["Wird gerendert", "busy"], rendered: ["Gerendert", "busy"],
  awaiting_approval: ["Wartet auf Freigabe", "awaiting_approval"], approved: ["Freigegeben", "busy"],
  publishing: ["Wird hochgeladen", "busy"], published: ["Veröffentlicht", "published"], ready: ["Fertig (lokal)", "published"],
  failed: ["Fehler", "failed"], publish_failed: ["Upload-Fehler", "publish_failed"], rejected: ["Abgelehnt", "rejected"],
};
const BOARD = [
  ["Queue", ["queued"]], ["Skript", ["scripting", "scripted"]], ["Stimme", ["voicing", "voiced"]],
  ["Material", ["sourcing", "visuals_ready"]], ["Schnitt", ["rendering", "rendered"]],
  ["Freigabe", ["awaiting_approval"]], ["Upload", ["approved", "publishing"]], ["Online", ["published", "ready"]],
];
const WORKING = new Set(["scripting", "voicing", "sourcing", "rendering", "publishing"]);
const PLATFORM_LABEL = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" };

const state = { agents: {}, videos: new Map(), ideas: [], stats: {}, settings: null, logFilter: "" };

// ---------------- api ----------------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { location.href = "/login"; throw new Error("auth"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast("Fehler", data.detail || res.statusText, true); throw new Error(data.detail || res.statusText); }
  return data;
}

function toast(title, msg = "", err = false) {
  const el = document.createElement("div");
  el.className = "toast" + (err ? " err" : "");
  el.innerHTML = `<b>${esc(title)}</b>${esc(msg)}`;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), 5000);
}

const fmtTime = (ts) => new Date(ts * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fmtDate = (ts) => new Date(ts * 1000).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
function elapsed(ts) {
  if (!ts) return "";
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ---------------- bunker (live base view) ----------------
Bunker.init($("#bunker"), {
  getAgents: () => state.agents,
  getStats: () => state.stats,
  openVideo: (id) => openVideo(id),
  agentAction: (key, action) => api(`/api/agents/${key}/${action}`, { body: {} }).then(updateAgent),
});

// ---------------- tabs ----------------
$$(".tab").forEach((b) => b.addEventListener("click", () => {
  $$(".tab").forEach((t) => t.classList.toggle("active", t === b));
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + b.dataset.tab));
  if (b.dataset.tab === "settings" && !state.settings) loadSettings();
  if (b.dataset.tab === "ideas") loadIdeas();
  b.dataset.tab === "bunker" ? Bunker.start() : Bunker.stop();
  location.hash = b.dataset.tab;
}));
if (location.hash) $(`.tab[data-tab="${location.hash.slice(1)}"]`)?.click();

// ---------------- agents ----------------
function renderAgents() {
  const wrap = $("#agents");
  const list = Object.values(state.agents);
  for (const a of list) {
    let card = $(`#agent-${a.key}`);
    if (!card) {
      card = document.createElement("div");
      card.id = `agent-${a.key}`;
      card.innerHTML = `
        <div class="agent-head">
          <div class="agent-icon">${a.icon}</div>
          <div><div class="agent-name">${esc(a.name)}</div><div class="agent-role">${esc(a.role)}</div></div>
          <span class="pill"><i></i><span class="pill-t"></span></span>
        </div>
        <div class="agent-task"></div>
        <div class="bar"><div></div></div>
        <div class="agent-meta"><span class="m-video"></span><span class="m-time"></span><span class="m-count"></span></div>
        <div class="agent-actions">
          <button class="btn small toggle"></button>
          ${a.manual ? '<button class="btn small run">⚡ Jetzt ausführen</button>' : ""}
        </div>`;
      card.querySelector(".toggle").addEventListener("click", () =>
        api(`/api/agents/${a.key}/${state.agents[a.key].enabled ? "pause" : "resume"}`, { body: {} }).then(updateAgent));
      card.querySelector(".run")?.addEventListener("click", () =>
        api(`/api/agents/${a.key}/run`, { body: {} }).then((s) => { updateAgent(s); toast(a.name, "Auftrag erteilt"); }));
      wrap.append(card);
      const opt = document.createElement("option");
      opt.value = a.key; opt.textContent = a.name;
      $("#logFilter").append(opt);
    }
    const labels = { working: "arbeitet", idle: "bereit", paused: "pausiert", error: "Fehler", waiting: "wartet" };
    card.className = `agent ${a.status}`;
    card.querySelector(".pill").className = `pill ${a.status}`;
    card.querySelector(".pill-t").textContent = labels[a.status] || a.status;
    card.querySelector(".agent-task").textContent = a.task || "–";
    const bar = card.querySelector(".bar");
    bar.classList.toggle("indet", a.status === "working" && (a.progress == null));
    bar.firstElementChild.style.width = a.status === "working" ? `${Math.round(a.progress ?? 0)}%` : "0";
    card.querySelector(".m-video").textContent = a.video_id ? `Video #${a.video_id}` : "";
    card.querySelector(".m-time").textContent = a.status === "working" && a.started_at ? `⏱ ${elapsed(a.started_at)}` : "";
    card.querySelector(".m-count").textContent = `✓ ${a.processed}${a.failed ? `  ✗ ${a.failed}` : ""}`;
    const t = card.querySelector(".toggle");
    t.textContent = a.enabled ? "⏸ Pause" : "▶ Fortsetzen";
  }
}
function updateAgent(a) { state.agents[a.key] = a; renderAgents(); }
setInterval(renderAgents, 1000);

$$("[data-all]").forEach((b) => b.addEventListener("click", () => api(`/api/agents/all/${b.dataset.all}`, { body: {} }).then(applyState)));

// ---------------- state / kpis ----------------
function applyState(s) {
  for (const a of s.agents) state.agents[a.key] = a;
  state.stats = s.stats;
  renderAgents();
  $("#autopilot").checked = s.autopilot;
  $("#niche").textContent = s.niche;
  $("#niche").title = s.niche;
  $("#logout").hidden = !s.auth;
  $("#kIdeas").textContent = s.stats.ideas;
  $("#kProd").textContent = s.stats.in_production;
  $("#kApproval").textContent = s.stats.awaiting_approval;
  $("#kPublished").textContent = s.stats.published;
  $("#kNext").textContent = s.autopilot ? (s.next_slot ? new Date(s.next_slot).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "–") : "Autopilot aus";
  const badge = $("#badgeApproval");
  badge.hidden = !s.stats.awaiting_approval;
  badge.textContent = s.stats.awaiting_approval;
}
let stateTimer;
function refreshState() { clearTimeout(stateTimer); stateTimer = setTimeout(() => api("/api/state").then(applyState), 250); }

$("#autopilot").addEventListener("change", (e) =>
  api("/api/autopilot", { body: { on: e.target.checked } }).then((s) => { applyState(s); toast("Autopilot", s.autopilot ? "aktiv – Agenten arbeiten selbstständig" : "aus"); }));

$("#produceNow").addEventListener("click", async () => {
  const topic = prompt("Thema für das Video?\n(Leer lassen = beste Idee aus dem Speicher)", "");
  if (topic === null) return;
  const v = await api("/api/produce", { body: { topic } });
  toast("Produktion gestartet", v.topic.slice(0, 80));
});

// ---------------- videos ----------------
function statusBadge(st) {
  const [label, cls] = STATUS[st] || [st, ""];
  return `<span class="status s-${cls}">${esc(label)}</span>`;
}
function renderBoard() {
  const vids = [...state.videos.values()];
  $("#board").innerHTML = BOARD.map(([name, sts]) => {
    let items = vids.filter((v) => sts.includes(v.status)).sort((a, b) => b.id - a.id);
    const total = items.length;
    if (name === "Online") items = items.slice(0, 6);
    return `<div class="col"><div class="col-h"><span>${name}</span><span>${total}</span></div>
      ${items.map((v) => `<div class="chip ${WORKING.has(v.status) ? "busy" : ""} ${v.status === "awaiting_approval" ? "attn" : ""}" data-vid="${v.id}">
        <b>#${v.id}</b> ${esc((v.title || v.topic).slice(0, 60))}</div>`).join("")}</div>`;
  }).join("");
  const failed = vids.filter((v) => ["failed", "publish_failed"].includes(v.status));
  if (failed.length) {
    $("#board").insertAdjacentHTML("beforeend", `<div class="col" style="grid-column:1/-1;min-height:0"><div class="col-h"><span>Fehler</span><span>${failed.length}</span></div>
      ${failed.slice(0, 5).map((v) => `<div class="chip bad" data-vid="${v.id}"><b>#${v.id}</b> ${esc((v.title || v.topic).slice(0, 80))} — <span style="color:var(--red)">${esc((v.error || "").slice(0, 120))}</span></div>`).join("")}</div>`);
  }
}
$("#board").addEventListener("click", (e) => { const c = e.target.closest("[data-vid]"); if (c) openVideo(+c.dataset.vid); });

function renderVideos() {
  const f = $("#videoFilter").value;
  let vids = [...state.videos.values()].sort((a, b) => b.id - a.id);
  if (f === "production") vids = vids.filter((v) => STATUS[v.status]?.[1] === "busy");
  else if (f === "failed") vids = vids.filter((v) => ["failed", "publish_failed"].includes(v.status));
  else if (f === "published") vids = vids.filter((v) => ["published", "ready"].includes(v.status));
  else if (f) vids = vids.filter((v) => v.status === f);
  $("#videoGrid").innerHTML = vids.length ? vids.map((v) => `
    <div class="vcard" data-vid="${v.id}">
      <div class="vthumb">${v.thumb_path ? `<img src="/api/videos/${v.id}/thumb?t=${Math.round(v.updated_at)}" loading="lazy" alt="">` : "🎬"}
        <span class="st">${statusBadge(v.status)}</span></div>
      <div class="vbody">
        <div class="vtitle">${esc(v.title || v.topic)}</div>
        <div class="vmeta">#${v.id} · ${fmtDate(v.created_at)}${v.duration ? ` · ${Math.round(v.duration)}s` : ""}</div>
        ${v.status === "awaiting_approval" ? `<div class="vactions">
          <button class="btn small ok" data-act="approve">✓ Veröffentlichen</button>
          <button class="btn small danger" data-act="reject">✗</button></div>` : ""}
        ${["failed", "publish_failed"].includes(v.status) ? `<div class="vactions"><button class="btn small" data-act="retry">↻ Erneut versuchen</button></div>` : ""}
      </div>
    </div>`).join("") : `<div class="empty">Noch keine Videos. Klicke oben auf „Jetzt produzieren“.</div>`;
}
$("#videoFilter").addEventListener("change", renderVideos);
$("#videoGrid").addEventListener("click", async (e) => {
  const card = e.target.closest("[data-vid]");
  if (!card) return;
  const act = e.target.closest("[data-act]")?.dataset.act;
  const id = +card.dataset.vid;
  if (act) { e.stopPropagation(); await videoAction(id, act); return; }
  openVideo(id);
});

async function videoAction(id, act) {
  if (act === "delete" && !confirm("Video endgültig löschen?")) return;
  if (act === "delete") { await api(`/api/videos/${id}`, { method: "DELETE" }); $("#videoModal").close(); return; }
  const v = await api(`/api/videos/${id}/${act}`, { body: {} });
  upsertVideo(v);
  toast({ approve: "Freigegeben", reject: "Abgelehnt", retry: "Neuer Versuch" }[act] || act, (v.title || v.topic).slice(0, 80));
  if ($("#videoModal").open && act !== "approve") openVideo(id);
}

function upsertVideo(v) {
  if (!v) return;
  const prev = state.videos.get(v.id);
  state.videos.set(v.id, v);
  Bunker.video(v, prev);
  renderBoard(); renderVideos();
  if ($("#videoModal").open && +$("#videoModal").dataset.vid === v.id && !$("#videoModal").dataset.editing) openVideo(v.id, true);
}

async function openVideo(id, silent = false) {
  const v = state.videos.get(id) || await api(`/api/videos/${id}`);
  const m = $("#videoModal");
  m.dataset.vid = id;
  const s = v.script || {};
  const logs = silent ? null : await api(`/api/logs?video_id=${id}&limit=80`);
  const pubs = Object.entries(v.publish_results || {});
  const canEdit = s.title && !["published", "publishing"].includes(v.status);
  $("#videoModalBody").innerHTML = `
    <button class="close-x" onclick="this.closest('dialog').close()">×</button>
    <div class="modal-video">${v.video_path ? `<video src="/api/videos/${id}/file?t=${Math.round(v.updated_at)}" controls playsinline preload="metadata"></video>` : `<div class="vmeta">Video wird noch produziert…<br>${statusBadge(v.status)}</div>`}</div>
    <div class="modal-info">
      <div class="row gap" style="flex-wrap:wrap">${statusBadge(v.status)}<span class="vmeta">#${v.id} · ${fmtDate(v.created_at)}${v.duration ? ` · ${v.duration}s` : ""}${s.voice ? ` · Stimme: ${esc(s.voice.provider)}` : ""}</span></div>
      <h3>${esc(v.title || v.topic)}</h3>
      ${v.error ? `<div style="color:var(--red);font-size:13px">${esc(v.error)}</div>` : ""}
      <div class="row gap" style="flex-wrap:wrap">
        ${["awaiting_approval", "rejected", "ready"].includes(v.status) ? `<button class="btn ok" data-m="approve">✓ Freigeben & veröffentlichen</button>` : ""}
        ${v.status === "awaiting_approval" ? `<button class="btn danger" data-m="reject">✗ Ablehnen</button>` : ""}
        ${["failed", "publish_failed"].includes(v.status) ? `<button class="btn" data-m="retry">↻ Erneut versuchen</button>` : ""}
        ${v.video_path ? `<a class="btn ghost" href="/api/videos/${id}/file?download=1">⬇ Download</a>` : ""}
        ${s.segments && !WORKING.has(v.status) ? `<select class="small-select" id="rerenderStage"><option value="render">Neu rendern</option><option value="visuals">Neues Material</option><option value="voice">Neu einsprechen</option><option value="script">Neues Skript</option></select><button class="btn small" data-m="rerender">↻</button>` : ""}
        <button class="btn ghost danger" data-m="delete">🗑</button>
      </div>
      ${canEdit ? `
      <div class="field"><label>Titel</label><input id="mTitle" value="${esc(s.title)}"></div>
      <div class="field"><label>Beschreibung</label><textarea id="mDesc">${esc(s.description || "")}</textarea></div>
      <div class="field"><label>Hashtags</label><input id="mTags" value="${esc((s.hashtags || []).join(" "))}"></div>
      <div><button class="btn small" data-m="savemeta">💾 Texte speichern</button></div>` : ""}
      ${pubs.length ? `<div><div class="field"><label>Veröffentlichung</label></div>${pubs.map(([p, r]) => `
        <div class="pub"><span class="${r.ok ? "ok" : "bad"}">${r.ok ? "✓" : "✗"}</span><b>${PLATFORM_LABEL[p] || p}</b>
        <span class="vmeta">${esc(r.via || "")}</span>
        ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">ansehen ↗</a>` : ""}
        ${r.error ? `<span style="color:var(--red);font-size:12px">${esc(String(r.error).slice(0, 200))}</span>` : ""}
        ${r.note ? `<span class="vmeta">${esc(r.note)}</span>` : ""}</div>`).join("")}</div>` : ""}
      ${s.segments ? `<details ${silent ? "" : "open"}><summary>Skript (${s.segments.length} Szenen)</summary><div style="margin-top:10px">
        ${s.segments.map((g, i) => `<div class="script-seg">${esc(g.text)}<small>🎥 ${esc(g.visual_query)} · ${esc(g.keyword)}${s.visuals?.[i] ? " · " + esc(s.visuals[i].source) : ""}</small></div>`).join("")}
        ${s.sources?.length ? `<div class="vmeta">Quellen: ${s.sources.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, "").slice(0, 40))}</a>`).join(" · ")}</div>` : ""}
      </div></details>` : ""}
      ${logs ? `<details><summary>Protokoll</summary><div class="terminal" style="height:200px;margin-top:8px">${logs.map(logLine).join("")}</div></details>` : ""}
    </div>`;
  $$("[data-m]", m).forEach((b) => b.addEventListener("click", async () => {
    const act = b.dataset.m;
    if (act === "savemeta") {
      const nv = await api(`/api/videos/${id}/meta`, { method: "PUT", body: { title: $("#mTitle").value, description: $("#mDesc").value, hashtags: $("#mTags").value } });
      upsertVideo(nv); toast("Gespeichert");
    } else if (act === "rerender") {
      const nv = await api(`/api/videos/${id}/rerender`, { body: { stage: $("#rerenderStage").value } });
      upsertVideo(nv); toast("Neu gestartet", "Video läuft erneut durch die Pipeline");
    } else {
      await videoAction(id, act);
      if (act === "approve") m.close();
    }
  }));
  m.querySelectorAll("input,textarea").forEach((i) => {
    i.addEventListener("focus", () => (m.dataset.editing = "1"));
    i.addEventListener("blur", () => delete m.dataset.editing);
  });
  if (!m.open) m.showModal();
}
$("#videoModal").addEventListener("close", () => { $("#videoModal").querySelector("video")?.pause(); });
$("#videoModal").addEventListener("click", (e) => { if (e.target.id === "videoModal") e.target.close(); });

// ---------------- logs ----------------
function logLine(l) {
  const agent = state.agents[l.agent]?.name || l.agent;
  return `<div class="log ${l.level}"><span class="t">${fmtTime(l.ts)}</span><span class="a">${esc(agent)}</span><span class="m">${l.video_id ? `<b style="color:#586176">#${l.video_id}</b> ` : ""}${esc(l.message)}</span></div>`;
}
function appendLog(l) {
  if (state.logFilter && l.agent !== state.logFilter) return;
  const t = $("#terminal");
  const atBottom = t.scrollHeight - t.scrollTop - t.clientHeight < 40;
  t.insertAdjacentHTML("beforeend", logLine(l));
  while (t.children.length > 400) t.firstElementChild.remove();
  if (atBottom) t.scrollTop = t.scrollHeight;
}
async function loadLogs() {
  const logs = await api("/api/logs?limit=200");
  $("#terminal").innerHTML = "";
  logs.forEach(appendLog);
  $("#terminal").scrollTop = 1e9;
}
$("#logFilter").addEventListener("change", (e) => { state.logFilter = e.target.value; loadLogs(); });

// ---------------- ideas ----------------
async function loadIdeas() {
  state.ideas = await api("/api/ideas");
  const st = { new: "", used: "produziert", discarded: "verworfen" };
  $("#ideaList").innerHTML = state.ideas.length ? state.ideas.sort((a, b) => (a.status === "new" ? 0 : 1) - (b.status === "new" ? 0 : 1) || b.score - a.score).map((i) => `
    <div class="idea ${i.status}">
      <div class="score ${i.score >= 8 ? "hot" : ""}" title="Virales Potenzial">${Math.round(i.score)}</div>
      <div>
        <div class="idea-title">${esc(i.title)} ${st[i.status] ? `<span class="vmeta">· ${st[i.status]}</span>` : ""}</div>
        <div class="idea-sub">${esc(i.angle || "")}</div>
        ${i.hook ? `<div class="idea-sub">🎣 „${esc(i.hook)}“</div>` : ""}
        <div class="idea-sub">${i.why_now ? "🔥 " + esc(i.why_now) : ""} ${(i.sources || []).slice(0, 3).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">Quelle ↗</a>`).join(" ")}
          <span class="vmeta">· ${esc(i.origin)} · ${fmtDate(i.created_at)}</span></div>
      </div>
      <div class="row gap">${i.status === "new" ? `
        <button class="btn small primary" data-produce="${i.id}">▶ Produzieren</button>
        <button class="btn small ghost" data-discard="${i.id}">✗</button>` : ""}</div>
    </div>`).join("") : `<div class="empty">Noch keine Ideen. Der Trend-Scout sucht automatisch, sobald der Autopilot an ist – oder klicke „Neue Ideen suchen“.</div>`;
}
$("#ideaList").addEventListener("click", async (e) => {
  const p = e.target.closest("[data-produce]"), d = e.target.closest("[data-discard]");
  if (p) { const v = await api(`/api/ideas/${p.dataset.produce}/produce`, { body: {} }); toast("Produktion gestartet", v.topic.slice(0, 80)); }
  if (d) { await api(`/api/ideas/${d.dataset.discard}/discard`, { body: {} }); }
  loadIdeas();
});
$("#ideaForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await api("/api/ideas", { body: { title: f.get("title"), angle: f.get("angle") } });
  e.target.reset(); loadIdeas(); toast("Idee gespeichert");
});
$("#scoutNow").addEventListener("click", () => api("/api/agents/trend_scout/run", { body: {} }).then(() => toast("Trend-Scout", "sucht jetzt nach neuen Ideen…")));

// ---------------- settings ----------------
const SETTINGS_UI = [
  ["Inhalt & Kanal", "Worüber die Videos handeln.", [
    ["niche", "Branche / Nische"], ["audience", "Zielgruppe"], ["channel_name", "Kanalname"],
    ["target_seconds", "Ziel-Länge (Sekunden)", "number"],
  ]],
  ["Automatisierung", "Wann und wie oft produziert wird.", [
    ["autopilot", "Autopilot aktiv", "check"], ["require_approval", "Vor dem Hochladen Freigabe verlangen", "check"],
    ["videos_per_day", "Videos pro Tag", "number"], ["schedule_times", "Produktionszeiten (HH:MM, kommagetrennt)"],
    ["timezone", "Zeitzone"], ["min_idea_backlog", "Mindestanzahl Ideen im Speicher", "number"],
  ]],
  ["KI (Claude)", "Recherche, Ideen & Skripte. Ohne Key laufen Demo-Skripte.", [
    ["anthropic_api_key", "Anthropic API-Key", "secret"],
    ["llm_model", "Modell", "select", ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]],
    ["llm_web_search", "Websuche für Recherche nutzen", "check"],
  ]],
  ["Stimme", "„auto“ nimmt ElevenLabs → OpenAI → Edge (kostenlos), je nachdem, welcher Key hinterlegt ist.", [
    ["tts_provider", "Anbieter", "select", ["auto", "elevenlabs", "openai", "edge"]],
    ["elevenlabs_api_key", "ElevenLabs API-Key", "secret"], ["elevenlabs_voice_id", "ElevenLabs Voice-ID"],
    ["elevenlabs_model", "ElevenLabs Modell"],
    ["openai_api_key", "OpenAI API-Key", "secret"], ["openai_tts_voice", "OpenAI Stimme"], ["openai_tts_model", "OpenAI TTS-Modell"],
    ["edge_voice", "Edge-Stimme (kostenlos)", "select", ["de-DE-ConradNeural", "de-DE-KatjaNeural", "de-DE-FlorianMultilingualNeural", "de-DE-SeraphinaMultilingualNeural", "de-DE-KillianNeural", "de-DE-AmalaNeural"]],
    ["edge_rate", "Edge Sprechtempo (z. B. +8%)"],
  ]],
  ["Bild & Schnitt", "Stock-Videos von Pexels (kostenlos, Key unter pexels.com/api). Musik: MP3s in data/music ablegen.", [
    ["pexels_api_key", "Pexels API-Key", "secret"], ["accent_color", "Akzentfarbe Untertitel", "color"],
    ["subtitle_font", "Untertitel-Schrift"], ["music_volume", "Musik-Lautstärke (0–1)", "number"],
  ]],
  ["Upload: Plattformen", "Pro Plattform: aus, offizielle API direkt oder über upload-post.com.", [
    ["youtube_mode", "YouTube Shorts", "select", ["off", "direct", "uploadpost"]],
    ["tiktok_mode", "TikTok", "select", ["off", "direct", "uploadpost"]],
    ["instagram_mode", "Instagram Reels", "select", ["off", "direct", "uploadpost"]],
    ["uploadpost_api_key", "upload-post.com API-Key", "secret"], ["uploadpost_user", "upload-post.com Profil (User)"],
  ]],
  ["YouTube (offizielle API)", "Google Cloud → YouTube Data API v3 → OAuth-Client. Siehe README.", [
    ["youtube_client_id", "Client-ID"], ["youtube_client_secret", "Client-Secret", "secret"],
    ["youtube_refresh_token", "Refresh-Token", "secret"],
    ["youtube_privacy", "Sichtbarkeit", "select", ["public", "unlisted", "private"]],
  ]],
  ["TikTok (offizielle API)", "TikTok for Developers → Content Posting API. Ungeprüfte Apps posten nur privat (SELF_ONLY).", [
    ["tiktok_client_key", "Client-Key"], ["tiktok_client_secret", "Client-Secret", "secret"],
    ["tiktok_refresh_token", "Refresh-Token", "secret"],
    ["tiktok_privacy", "Sichtbarkeit", "select", ["SELF_ONLY", "PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR"]],
  ]],
  ["Instagram (offizielle API)", "Business/Creator-Account + Meta-App mit instagram_content_publish.", [
    ["instagram_access_token", "Access-Token (langlebig)", "secret"], ["instagram_user_id", "Instagram User-ID"],
  ]],
];
async function loadSettings() {
  state.settings = await api("/api/settings");
  const s = state.settings;
  $("#settingsForm").innerHTML = SETTINGS_UI.map(([title, hint, fields]) => `
    <fieldset><legend>${title}</legend><p class="hint">${hint}</p>
    ${fields.map(([k, label, type, opts]) => {
      const v = s[k];
      if (type === "check") return `<div class="field check"><input type="checkbox" id="f-${k}" name="${k}" ${v ? "checked" : ""}><label for="f-${k}">${label}</label></div>`;
      if (type === "select") return `<div class="field"><label>${label}</label><select name="${k}">${[...new Set([...opts, v])].map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
      const t = type === "secret" ? "password" : type === "number" ? "number" : type === "color" ? "color" : "text";
      return `<div class="field"><label>${label}</label><input type="${t}" name="${k}" value="${esc(v)}" ${type === "number" ? 'step="any"' : ""} ${type === "secret" ? 'autocomplete="off" placeholder="nicht gesetzt"' : ""}></div>`;
    }).join("")}</fieldset>`).join("") + `<div class="settings-save"><button class="btn primary" type="submit">💾 Einstellungen speichern</button></div>`;
}
$("#settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const out = {};
  $$("[name]", e.target).forEach((el) => { out[el.name] = el.type === "checkbox" ? el.checked : el.value; });
  state.settings = await api("/api/settings", { body: out });
  toast("Gespeichert", "Einstellungen sind sofort aktiv");
  refreshState();
});

// ---------------- websocket ----------------
function connect() {
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => { $("#live").classList.add("on"); $("#live span").textContent = "live"; refreshState(); };
  ws.onclose = () => { $("#live").classList.remove("on"); $("#live span").textContent = "offline"; setTimeout(connect, 2000); };
  ws.onmessage = (ev) => {
    const { type, data } = JSON.parse(ev.data);
    if (type === "agent") updateAgent(data);
    else if (type === "log") { if (data.ts) appendLog(data); }
    else if (type === "video") { upsertVideo(data); refreshState(); }
    else if (type === "video_deleted") { state.videos.delete(data.id); Bunker.deleted(data.id); renderBoard(); renderVideos(); refreshState(); }
    else if (type === "ideas") { refreshState(); if ($("#tab-ideas").classList.contains("active")) loadIdeas(); }
    else if (type === "notify") toast(data.title, data.message);
  };
}

(async function init() {
  const [s, vids] = await Promise.all([api("/api/state"), api("/api/videos")]);
  applyState(s);
  vids.forEach((v) => state.videos.set(v.id, v));
  Bunker.loadVideos(vids);
  if ($("#tab-bunker").classList.contains("active")) Bunker.start();
  renderBoard(); renderVideos();
  await loadLogs();
  connect();
})();
