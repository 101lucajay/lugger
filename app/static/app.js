"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (id, cls = "i") => `<svg class="${cls}"><use href="#${id}"/></svg>`;
const agentIcon = (key) => `<svg class="i" viewBox="0 0 24 24"><path d="${Bunker.ICONS[key] || ""}"/></svg>`;

const STATUS = {
  queued: ["Warteschlange", "blue"], scripting: ["Skript", "blue"], scripted: ["Skript fertig", "blue"],
  voicing: ["Stimme", "blue"], voiced: ["Stimme fertig", "blue"], sourcing: ["Material", "blue"],
  visuals_ready: ["Material fertig", "blue"], rendering: ["Rendering", "blue"], rendered: ["Gerendert", "blue"],
  awaiting_approval: ["Freigabe", "orange"], approved: ["Freigegeben", "blue"], publishing: ["Upload", "blue"],
  published: ["Online", "green"], ready: ["Fertig (lokal)", "green"], failed: ["Fehler", "red"],
  publish_failed: ["Upload-Fehler", "red"], rejected: ["Abgelehnt", ""],
};
const PRODUCTION = new Set(["queued", "scripting", "scripted", "voicing", "voiced", "sourcing", "visuals_ready", "rendering", "rendered", "approved", "publishing"]);
const WORKING = new Set(["scripting", "voicing", "sourcing", "rendering", "publishing"]);
const AGENT_STATUS = { working: "Arbeitet", idle: "Bereit", paused: "Pausiert", error: "Fehler", waiting: "Wartet" };
const PLATFORMS = [["youtube", "YouTube Shorts", "#ff3b30"], ["tiktok", "TikTok", "#25c2d6"], ["instagram", "Instagram Reels", "#e1306c"]];
const MODE_LABEL = { off: "Aus", direct: "Offizielle API", uploadpost: "upload-post.com" };
const PAGES = {
  overview: ["Übersicht", ""], bunker: ["Bunker", "Live-Ansicht der Agentenbasis"], videos: ["Videos", "Prüfen, freigeben, verwalten"],
  ideas: ["Ideen", "Themen für kommende Videos"], automation: ["Automatisierung", "Zeitplan, Freigabe & Agenten"],
  log: ["Protokoll", "Alles, was die Agenten tun"], config: ["Einstellungen", "Konten, Stimme, Material & Zugänge"],
};

const state = { agents: {}, videos: new Map(), ideas: [], stats: {}, s: null, settings: null, page: "overview", videoFilter: "", logFilter: "" };

// ---------------- api / toast / theme ----------------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { location.href = "/login"; throw new Error("auth"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast("Das hat nicht geklappt", data.detail || res.statusText, true); throw new Error(data.detail || res.statusText); }
  return data;
}
function toast(title, msg = "", err = false) {
  const el = document.createElement("div");
  el.className = "toast glass" + (err ? " err" : "");
  el.innerHTML = `<b>${esc(title)}</b>${esc(msg)}`;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), 4200);
}
function currentTheme() {
  const t = document.documentElement.getAttribute("data-theme");
  return t || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
function applyThemeIcon() { $("#themeBtn").innerHTML = ic(currentTheme() === "dark" ? "i-sun" : "i-moon"); }
try { const t = localStorage.getItem("lugger.theme"); if (t) document.documentElement.setAttribute("data-theme", t); } catch (e) { /* optional */ }
$("#themeBtn").addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("lugger.theme", next); } catch (e) { /* optional */ }
  applyThemeIcon();
});
applyThemeIcon();

const fmtTime = (ts) => new Date(ts * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fmtDate = (ts) => new Date(ts * 1000).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtSlot = (iso) => new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const chip = (st) => { const [l, c] = STATUS[st] || [st, ""]; return `<span class="chip ${c}">${esc(l)}</span>`; };

// ---------------- navigation ----------------
function go(page) {
  if (!PAGES[page]) page = "overview";
  state.page = page;
  $$(".nav").forEach((n) => n.classList.toggle("active", n.dataset.page === page));
  $$("[data-view]").forEach((v) => (v.hidden = v.dataset.view !== page));
  $("#pageTitle").textContent = PAGES[page][0];
  $("#pageSub").textContent = page === "overview" ? (state.s?.niche || "") : PAGES[page][1];
  $("#sidebar").classList.remove("open");
  page === "bunker" ? Bunker.start() : Bunker.stop();
  if (page === "ideas") loadIdeas();
  if (page === "config") loadSettingsForm();
  if (page === "automation") renderAutomation();
  if (page === "log") loadLogs();
  if (location.hash.slice(1) !== page) history.replaceState(null, "", "#" + page);
}
$$(".nav").forEach((n) => n.addEventListener("click", () => go(n.dataset.page)));
$$("[data-goto]").forEach((b) => b.addEventListener("click", () => go(b.dataset.goto)));
window.addEventListener("hashchange", () => go(location.hash.slice(1)));
$("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

// ---------------- state ----------------
function applyState(s) {
  state.s = s;
  for (const a of s.agents) state.agents[a.key] = a;
  state.stats = s.stats;
  $("#autopilot").checked = s.autopilot;
  $("#pilotSub").textContent = s.autopilot ? (s.next_slot ? `Nächstes Video ${fmtSlot(s.next_slot)}` : "Kein Termin geplant") : "Aus · nur manuelle Produktion";
  $("#nicheSmall").textContent = s.niche;
  $("#logout").hidden = !s.auth;
  const b = $("#badgeApproval"); b.hidden = !s.stats.awaiting_approval; b.textContent = s.stats.awaiting_approval;
  if (state.page === "overview") $("#pageSub").textContent = s.niche;
  renderOverview();
  if (state.page === "automation" && !document.activeElement?.closest("#automationView")) renderAutomation();
}
let stateTimer;
function refreshState() { clearTimeout(stateTimer); stateTimer = setTimeout(() => api("/api/state").then(applyState), 250); }
$("#autopilot").addEventListener("change", (e) => setAutopilot(e.target.checked));
async function setAutopilot(on) {
  const s = await api("/api/autopilot", { body: { on } });
  applyState(s);
  toast(on ? "Autopilot an" : "Autopilot aus", on ? "Die Agenten arbeiten nach Zeitplan." : "Videos entstehen nur noch auf Knopfdruck.");
}
async function agentAction(key, action) {
  const a = await api(`/api/agents/${key}/${action}`, { body: {} });
  state.agents[a.key] = a;
  renderOverview();
  if (state.page === "automation") renderAutomation();
  if (action === "run") toast(a.name, "Auftrag erteilt");
}

// ---------------- overview ----------------
function greeting() { const h = new Date().getHours(); return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend"; }
function renderOverview() {
  const s = state.s; if (!s) return;
  const vids = [...state.videos.values()];
  const st = s.stats;
  $("#greeting").textContent = greeting();
  const parts = [];
  if (st.awaiting_approval) parts.push(`${st.awaiting_approval} ${st.awaiting_approval === 1 ? "Video wartet" : "Videos warten"} auf deine Freigabe`);
  if (st.in_production) parts.push(`${st.in_production} in Produktion`);
  if (s.autopilot && s.next_slot) parts.push(`nächstes Video ${fmtSlot(s.next_slot)}`);
  if (!s.autopilot) parts.push("Autopilot ist aus");
  $("#summary").textContent = parts.length ? parts.join(" · ") : "Alles ruhig. Die Agenten warten auf den nächsten Termin.";
  const ha = $("#heroAction");
  const waiting = vids.filter((v) => v.status === "awaiting_approval").sort((a, b) => a.id - b.id);
  if (waiting.length) { ha.hidden = false; ha.className = "btn primary"; ha.innerHTML = `${ic("i-check")}Jetzt prüfen`; ha.onclick = () => openVideo(waiting[0].id); }
  else if (!s.autopilot) { ha.hidden = false; ha.className = "btn"; ha.innerHTML = `${ic("i-bolt")}Autopilot einschalten`; ha.onclick = () => setAutopilot(true); }
  else ha.hidden = true;

  const week = Date.now() / 1000 - 7 * 86400;
  $("#kPublished").textContent = st.published;
  $("#kPublished7").textContent = `${vids.filter((v) => v.status === "published" && v.updated_at > week).length} in den letzten 7 Tagen`;
  $("#kProd").textContent = st.in_production;
  const working = Object.values(state.agents).filter((a) => a.status === "working").length;
  $("#kProdS").textContent = `${working} ${working === 1 ? "Agent arbeitet" : "Agenten arbeiten"} gerade`;
  $("#kApproval").textContent = st.awaiting_approval;
  $("#kIdeas").textContent = st.ideas;
  $("#kIdeasS").textContent = st.ideas < (state.settings?.min_idea_backlog ?? 6) ? "Trend-Scout sucht bald neue" : "Vorrat reicht";
  const lc = $("#liveCount"); lc.hidden = !working; lc.textContent = working; lc.style.background = "var(--accent)";

  renderChart(vids); renderFunnel(vids); renderAgentList(); renderTimeline(); renderRecent(vids); renderPlatforms();
}
function renderChart(vids) {
  const days = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); days.push({ d, start: d.getTime() / 1000, made: 0, pub: 0 }); }
  for (const v of vids) {
    const day = days.find((x) => v.created_at >= x.start && v.created_at < x.start + 86400);
    if (day) day.made++;
    const pd = days.find((x) => v.status === "published" && v.updated_at >= x.start && v.updated_at < x.start + 86400);
    if (pd) pd.pub++;
  }
  const max = Math.max(2, ...days.map((d) => Math.max(d.made, d.pub)));
  const W = 640, H = 190, base = 162, top = 12, bw = W / days.length;
  const y = (v) => base - (v / max) * (base - top);
  let g = "";
  for (const t of [0, Math.ceil(max / 2), max]) g += `<line class="grid-l" x1="0" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text x="${W - 2}" y="${y(t) - 3}" text-anchor="end">${t}</text>`;
  days.forEach((d, i) => {
    const x = i * bw + bw * 0.22, w = bw * 0.56;
    if (d.made) g += `<rect x="${x}" y="${y(d.made)}" width="${w}" height="${base - y(d.made)}" rx="4" fill="var(--fill)"/>`;
    if (d.pub) g += `<rect x="${x + w * 0.18}" y="${y(d.pub)}" width="${w * 0.64}" height="${base - y(d.pub)}" rx="3" fill="var(--accent)"/>`;
    if (i % 2 === 1 || i === 13) g += `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${d.d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</text>`;
  });
  $("#chart").innerHTML = g;
}
function renderFunnel(vids) {
  const stages = [["Skript", ["queued", "scripting", "scripted"]], ["Stimme", ["voicing", "voiced"]], ["Material", ["sourcing", "visuals_ready"]],
    ["Schnitt", ["rendering", "rendered"]], ["Freigabe", ["awaiting_approval"]], ["Upload", ["approved", "publishing"]], ["Online", ["published", "ready"]]];
  const counts = stages.map(([n, s]) => [n, vids.filter((v) => s.includes(v.status)).length]);
  const max = Math.max(1, ...counts.map((c) => c[1]));
  $("#funnel").innerHTML = counts.map(([n, c], i) => `<div class="fr"><span>${n}</span><div class="ft"><div style="width:${(c / max) * 100}%;background:${i === 4 ? "var(--orange)" : i === 6 ? "var(--green)" : "var(--accent)"}"></div></div><b>${c}</b></div>`).join("");
  $("#pipeMeta").textContent = `${vids.length} Videos gesamt`;
}
function renderAgentList() {
  const list = Object.values(state.agents);
  $("#agentList").innerHTML = list.map((a) => {
    const col = Bunker.AGENT_COLOR[a.key];
    return `<div class="li"><div class="li-ico" style="background:${col}1f;color:${col}">${agentIcon(a.key)}</div>
      <div style="min-width:0"><div class="li-t">${esc(a.name)}</div><div class="li-s">${esc(a.status === "working" || a.status === "error" || a.status === "waiting" ? a.task : a.role)}</div>
      ${a.status === "working" && a.progress != null ? `<div class="bar" style="margin-top:6px;max-width:320px"><div style="width:${Math.round(a.progress)}%;background:${col}"></div></div>` : ""}</div>
      <div class="li-r"><span class="dot ${a.status}"></span><span>${AGENT_STATUS[a.status] || a.status}</span>
      <button class="icon-btn" data-agent="${a.key}" data-act="${a.enabled ? "pause" : "resume"}" title="${a.enabled ? "Pausieren" : "Fortsetzen"}">${ic(a.enabled ? "i-pause" : "i-play")}</button></div></div>`;
  }).join("");
}
$("#agentList").addEventListener("click", (e) => { const b = e.target.closest("[data-agent]"); if (b) agentAction(b.dataset.agent, b.dataset.act); });
function renderTimeline() {
  const up = state.s?.upcoming || [];
  $("#timeline").innerHTML = up.length ? up.slice(0, 5).map((iso) => {
    const d = new Date(iso);
    return `<div class="tl"><span class="tt">${d.toLocaleDateString("de-DE", { weekday: "short" })} ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span><span class="tm"></span><span>Neues Video<div class="li-s">${d.toLocaleDateString("de-DE", { day: "2-digit", month: "long" })}</div></span></div>`;
  }).join("") : `<div class="li-s">${state.s?.autopilot ? "Keine Termine. Lege Uhrzeiten und Wochentage fest." : "Autopilot ist aus."}</div>`;
}
function thumbHtml(v) { return v.thumb_path ? `<img class="thumb" src="/api/videos/${v.id}/thumb?t=${Math.round(v.updated_at)}" alt="" loading="lazy">` : `<div class="thumb" style="display:grid;place-items:center;color:var(--text-3)">${ic("i-video")}</div>`; }
function renderRecent(vids) {
  const list = vids.sort((a, b) => b.id - a.id).slice(0, 5);
  $("#recent").innerHTML = list.length ? list.map((v) => `<div class="li click vid" data-vid="${v.id}">${thumbHtml(v)}
    <div style="min-width:0"><div class="li-t">${esc(v.title || v.topic)}</div><div class="li-s">#${v.id} · ${fmtDate(v.created_at)}${v.duration ? ` · ${Math.round(v.duration)} s` : ""}</div></div>
    <div class="li-r">${chip(v.status)}</div></div>`).join("") : `<div class="li-s">Noch keine Videos.</div>`;
}
$("#recent").addEventListener("click", (e) => { const r = e.target.closest("[data-vid]"); if (r) openVideo(+r.dataset.vid); });
function renderPlatforms() {
  const s = state.settings || {};
  $("#platforms").innerHTML = PLATFORMS.map(([k, name, col]) => {
    const mode = s[`${k}_mode`] || "off";
    return `<div class="li"><div class="li-ico" style="background:${col}1f;color:${col}">${ic("i-send")}</div>
      <div style="min-width:0"><div class="li-t">${name}</div><div class="li-s">${MODE_LABEL[mode] || mode}</div></div>
      <div class="li-r"><span class="dot ${mode === "off" ? "paused" : "idle"}"></span>${mode === "off" ? "Aus" : "Aktiv"}</div></div>`;
  }).join("");
}

// ---------------- videos ----------------
function renderVideos() {
  const f = state.videoFilter;
  let vids = [...state.videos.values()].sort((a, b) => b.id - a.id);
  if (f === "production") vids = vids.filter((v) => PRODUCTION.has(v.status));
  else if (f === "failed") vids = vids.filter((v) => ["failed", "publish_failed"].includes(v.status));
  else if (f === "published") vids = vids.filter((v) => ["published", "ready"].includes(v.status));
  else if (f) vids = vids.filter((v) => v.status === f);
  $("#videoGrid").innerHTML = vids.length ? vids.map((v) => `
    <div class="vcard" data-vid="${v.id}">
      <div class="vthumb">${v.thumb_path ? `<img src="/api/videos/${v.id}/thumb?t=${Math.round(v.updated_at)}" loading="lazy" alt="">` : ic("i-video")}${chip(v.status)}</div>
      <div class="vbody"><div class="vtitle">${esc(v.title || v.topic)}</div>
        <div class="vmeta">#${v.id} · ${fmtDate(v.created_at)}${v.duration ? ` · ${Math.round(v.duration)} s` : ""}</div>
        ${v.status === "awaiting_approval" ? `<div class="vactions"><button class="btn small ok" data-act="approve">${ic("i-check")}Freigeben</button><button class="btn small" data-act="reject">Ablehnen</button></div>` : ""}
        ${["failed", "publish_failed"].includes(v.status) ? `<div class="vactions"><button class="btn small" data-act="retry">${ic("i-refresh")}Erneut versuchen</button></div>` : ""}
      </div></div>`).join("") : `<div class="empty">Keine Videos in dieser Ansicht.</div>`;
}
$("#videoFilter").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  $$("#videoFilter button").forEach((x) => x.classList.toggle("on", x === b));
  state.videoFilter = b.dataset.f; renderVideos();
});
$("#videoGrid").addEventListener("click", async (e) => {
  const card = e.target.closest("[data-vid]"); if (!card) return;
  const act = e.target.closest("[data-act]")?.dataset.act, id = +card.dataset.vid;
  if (act) { e.stopPropagation(); await videoAction(id, act); } else openVideo(id);
});
async function videoAction(id, act) {
  if (act === "delete") {
    const btn = $("#mDelete");
    if (btn && !btn.dataset.confirm) { btn.dataset.confirm = "1"; btn.innerHTML = `${ic("i-trash")}Wirklich löschen?`; return; }
    await api(`/api/videos/${id}`, { method: "DELETE" }); $("#videoModal").close(); toast("Gelöscht"); return;
  }
  const v = await api(`/api/videos/${id}/${act}`, { body: {} });
  upsertVideo(v);
  toast({ approve: "Freigegeben", reject: "Abgelehnt", retry: "Neuer Versuch gestartet" }[act] || act, (v.title || v.topic).slice(0, 80));
  if (act === "approve" || act === "reject") $("#videoModal").close();
}
function upsertVideo(v) {
  if (!v) return;
  const prev = state.videos.get(v.id);
  state.videos.set(v.id, v);
  Bunker.video(v, prev);
  renderVideos(); renderOverview();
  const m = $("#videoModal");
  if (m.open && +m.dataset.vid === v.id && !m.dataset.editing && prev?.status !== v.status) openVideo(v.id, true);
}
function mockPhone(v) {
  const w = (v.title || v.topic).split(" ");
  return `<div class="mock-phone"><div class="kw">${esc((w[1] || "KI").toUpperCase())}</div><div class="sub"><b>${esc(w.slice(0, 2).join(" ").toUpperCase())}</b> ${esc(w.slice(2, 4).join(" ").toUpperCase())}</div><div class="pb"></div></div>`;
}
async function openVideo(id, silent = false) {
  const v = state.videos.get(id) || await api(`/api/videos/${id}`);
  const m = $("#videoModal"); m.dataset.vid = id;
  const s = v.script || {};
  const logs = silent ? null : await api(`/api/logs?video_id=${id}&limit=80`).catch(() => []);
  const pubs = Object.entries(v.publish_results || {});
  const canEdit = s.title && !["published", "publishing"].includes(v.status);
  const media = v.video_path ? `<video src="/api/videos/${id}/file?t=${Math.round(v.updated_at)}" controls playsinline preload="metadata"></video>`
    : state.s?.demo && !PRODUCTION.has(v.status) ? mockPhone(v) : `<div style="color:#8e8e93;text-align:center;padding:20px">Wird produziert …<br><br>${chip(v.status)}</div>`;
  $("#videoModalBody").innerHTML = `
    <div class="modal-media">${media}</div>
    <div class="modal-info">
      <button class="icon-btn close-x" onclick="this.closest('dialog').close()" aria-label="Schließen">${ic("i-x")}</button>
      <div class="row">${chip(v.status)}<span class="vmeta">#${v.id} · ${fmtDate(v.created_at)}${v.duration ? ` · ${v.duration} s` : ""}${s.voice ? ` · Stimme: ${esc(s.voice.provider)}` : ""}</span></div>
      <h3>${esc(v.title || v.topic)}</h3>
      ${v.error ? `<div class="chip red" style="white-space:normal">${esc(v.error)}</div>` : ""}
      <div class="row">
        ${["awaiting_approval", "rejected", "ready"].includes(v.status) ? `<button class="btn ok" data-m="approve">${ic("i-check")}Freigeben &amp; veröffentlichen</button>` : ""}
        ${v.status === "awaiting_approval" ? `<button class="btn" data-m="reject">Ablehnen</button>` : ""}
        ${["failed", "publish_failed"].includes(v.status) ? `<button class="btn" data-m="retry">${ic("i-refresh")}Erneut versuchen</button>` : ""}
        ${v.video_path ? `<a class="btn" href="/api/videos/${id}/file?download=1">${ic("i-download")}Download</a>` : ""}
        ${s.segments && !WORKING.has(v.status) && !state.s?.demo ? `<select class="select" id="rerenderStage" style="width:auto"><option value="render">Neu rendern</option><option value="visuals">Neues Material</option><option value="voice">Neu einsprechen</option><option value="script">Neues Skript</option></select><button class="btn" data-m="rerender">${ic("i-refresh")}</button>` : ""}
        <button class="btn danger" data-m="delete" id="mDelete">${ic("i-trash")}</button>
      </div>
      ${canEdit ? `<div class="field"><label for="mTitle">Titel</label><input class="input" id="mTitle" value="${esc(s.title)}"></div>
      <div class="field"><label for="mDesc">Beschreibung</label><textarea class="input" id="mDesc">${esc(s.description || "")}</textarea></div>
      <div class="field"><label for="mTags">Hashtags</label><input class="input" id="mTags" value="${esc((s.hashtags || []).join(" "))}"></div>
      <div><button class="btn small" data-m="savemeta">Texte speichern</button></div>` : ""}
      ${pubs.length ? `<div>${pubs.map(([p, r]) => `<div class="pub">${r.ok ? '<span class="chip green">Online</span>' : '<span class="chip red">Fehler</span>'}<b>${esc((PLATFORMS.find((x) => x[0] === p) || [0, p])[1])}</b>
        ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Ansehen</a>` : ""}${r.error ? `<span class="vmeta" style="color:var(--red)">${esc(String(r.error).slice(0, 200))}</span>` : ""}${r.note ? `<span class="vmeta">${esc(r.note)}</span>` : ""}</div>`).join("")}</div>` : ""}
      ${s.segments ? `<details ${silent ? "" : "open"}><summary>Skript · ${s.segments.length} Szenen</summary><div style="margin-top:10px">
        ${s.segments.map((g, i) => `<div class="seg-text">${esc(g.text)}<small>${esc(g.visual_query)} · ${esc(g.keyword)}${s.visuals?.[i] ? " · " + esc(s.visuals[i].source) : ""}</small></div>`).join("")}
        ${s.sources?.length ? `<div class="vmeta">Quellen: ${s.sources.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, "").slice(0, 40))}</a>`).join(" · ")}</div>` : ""}</div></details>` : ""}
      ${logs && logs.length ? `<details><summary>Protokoll</summary><div class="log-view" style="max-height:220px;margin-top:8px">${logs.map(logLine).join("")}</div></details>` : ""}
    </div>`;
  $$("[data-m]", m).forEach((b) => b.addEventListener("click", async () => {
    const act = b.dataset.m;
    if (act === "savemeta") {
      const nv = await api(`/api/videos/${id}/meta`, { method: "PUT", body: { title: $("#mTitle").value, description: $("#mDesc").value, hashtags: $("#mTags").value } });
      upsertVideo(nv); toast("Gespeichert");
    } else if (act === "rerender") {
      const nv = await api(`/api/videos/${id}/rerender`, { body: { stage: $("#rerenderStage").value } });
      upsertVideo(nv); toast("Neu gestartet", "Das Video läuft erneut durch die Pipeline.");
    } else await videoAction(id, act);
  }));
  m.querySelectorAll("input,textarea").forEach((i) => { i.addEventListener("focus", () => (m.dataset.editing = "1")); i.addEventListener("blur", () => delete m.dataset.editing); });
  if (!m.open) m.showModal();
}
$("#videoModal").addEventListener("close", () => $("#videoModal video")?.pause());
$("#videoModal").addEventListener("click", (e) => { if (e.target.id === "videoModal") e.target.close(); });
$("#produceNow").addEventListener("click", async () => {
  const v = await api("/api/produce", { body: { topic: "" } });
  toast("Produktion gestartet", (v.topic || "").slice(0, 80));
});

// ---------------- ideas ----------------
async function loadIdeas() {
  state.ideas = await api("/api/ideas");
  const st = { used: "produziert", discarded: "verworfen" };
  const list = state.ideas.sort((a, b) => (a.status === "new" ? 0 : 1) - (b.status === "new" ? 0 : 1) || b.score - a.score);
  $("#ideaList").innerHTML = list.length ? list.map((i) => `
    <div class="idea ${i.status}">
      <div class="score ${i.score >= 8 ? "hot" : ""}" title="Virales Potenzial">${Math.round(i.score)}</div>
      <div style="min-width:0"><div class="idea-t">${esc(i.title)} ${st[i.status] ? `<span class="chip">${st[i.status]}</span>` : ""}</div>
        ${i.angle ? `<div class="idea-s">${esc(i.angle)}</div>` : ""}${i.hook ? `<div class="idea-s">Hook: „${esc(i.hook)}“</div>` : ""}
        <div class="idea-s">${i.why_now ? esc(i.why_now) + " · " : ""}${(i.sources || []).slice(0, 3).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">Quelle</a>`).join(" · ")} ${esc(i.origin)} · ${fmtDate(i.created_at)}</div></div>
      <div class="row">${i.status === "new" ? `<button class="btn small primary" data-produce="${i.id}">${ic("i-play")}Produzieren</button><button class="icon-btn" data-discard="${i.id}" title="Verwerfen">${ic("i-x")}</button>` : ""}</div>
    </div>`).join("") : `<div class="empty">Noch keine Ideen. Der Trend-Scout sucht automatisch, sobald der Autopilot läuft.</div>`;
}
$("#ideaList").addEventListener("click", async (e) => {
  const p = e.target.closest("[data-produce]"), d = e.target.closest("[data-discard]");
  if (p) { const v = await api(`/api/ideas/${p.dataset.produce}/produce`, { body: {} }); toast("Produktion gestartet", v.topic.slice(0, 80)); }
  if (d) await api(`/api/ideas/${d.dataset.discard}/discard`, { body: {} });
  if (p || d) loadIdeas();
});
$("#ideaForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/api/ideas", { body: { title: $("#ideaTitle").value, angle: $("#ideaAngle").value } });
  e.target.reset(); loadIdeas(); toast("Idee gespeichert");
});
$("#scoutNow").addEventListener("click", () => agentAction("trend_scout", "run"));

// ---------------- automation ----------------
async function saveSetting(patch, msg = "Gespeichert") {
  state.settings = await api("/api/settings", { body: patch });
  toast(msg);
  refreshState();
}
function set(t, s, control, cls = "") { return `<div class="set ${cls}"><div class="set-l"><div class="set-t">${t}</div>${s ? `<div class="set-s">${s}</div>` : ""}</div><div class="set-c">${control}</div></div>`; }
function seg(name, options, value) { return `<div class="seg" data-seg="${name}">${options.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(v) === String(value) ? "on" : ""}">${l}</button>`).join("")}</div>`; }
function stepper(name, value, min, max) { return `<div class="stepper" data-step="${name}" data-min="${min}" data-max="${max}"><button type="button" data-d="-1" aria-label="weniger">−</button><output>${value}</output><button type="button" data-d="1" aria-label="mehr">+</button></div>`; }
function sw(name, checked) { return `<label class="switch"><input type="checkbox" data-sw="${name}" ${checked ? "checked" : ""} aria-label="${name}"><span></span></label>`; }

async function renderAutomation() {
  if (!state.settings) state.settings = await api("/api/settings");
  const s = state.settings, st = state.s || {};
  const times = String(s.schedule_times || "").split(",").map((t) => t.trim()).filter(Boolean);
  const days = new Set(String(s.schedule_days || "").split(",").map((d) => +d));
  const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const up = (st.upcoming || []).slice(0, 3).map(fmtSlot).join(" · ");
  $("#automationView").innerHTML = `
    <div class="group"><div class="pilot-hero"><div class="big-ico">${ic("i-bolt")}</div>
      <div style="flex:1;min-width:0"><h2>Autopilot</h2><div class="set-s">Findet Ideen, produziert nach Zeitplan und legt fertige Videos ${s.require_approval ? "zur Freigabe vor" : "direkt online"}.</div></div>
      ${sw("autopilot", s.autopilot)}</div></div>

    <div><div class="group-title">${ic("i-clock")}Zeitplan</div><div class="group">
      ${set("Videos pro Tag", "Mehr Termine als Uhrzeiten werden zwischen 10 und 20 Uhr verteilt.", stepper("videos_per_day", s.videos_per_day, 0, 10))}
      ${set("Uhrzeiten", "Zu diesen Zeiten startet der Produktionsleiter ein Video.", `<div class="time-chips">${times.map((t) => `<span class="time-chip">${esc(t)}<button type="button" data-rmtime="${esc(t)}" aria-label="${esc(t)} entfernen">${ic("i-x")}</button></span>`).join("")}
        <input class="input" type="time" id="newTime" value="12:00" aria-label="Neue Uhrzeit"><button type="button" class="btn small" id="addTime">${ic("i-plus")}Hinzufügen</button></div>`, "stack")}
      ${set("Wochentage", "", `<div class="day-pills">${dayNames.map((n, i) => `<button type="button" data-day="${i + 1}" class="${days.has(i + 1) ? "on" : ""}">${n}</button>`).join("")}</div>`)}
      ${set("Zeitzone", "", `<select class="select" data-sel="timezone">${["Europe/Berlin", "Europe/Vienna", "Europe/Zurich", "UTC"].map((z) => `<option ${z === s.timezone ? "selected" : ""}>${z}</option>`).join("")}</select>`)}
    </div><div class="group-note">${s.autopilot ? (up ? `Nächste Termine: ${up}` : "Keine Termine – wähle Uhrzeiten und Wochentage.") : "Der Zeitplan greift, sobald der Autopilot an ist."}</div></div>

    <div><div class="group-title">${ic("i-check")}Freigabe</div><div class="group">
      ${set("Vor dem Hochladen", s.require_approval ? "Fertige Videos warten auf deine Prüfung." : "Fertige Videos gehen ohne Prüfung online.", seg("require_approval", [["true", "Ich prüfe"], ["false", "Automatisch"]], String(!!s.require_approval)))}
    </div></div>

    <div><div class="group-title">${ic("i-bulb")}Ideen &amp; Trends</div><div class="group">
      ${set("Mindestvorrat an Ideen", "Fällt der Vorrat darunter, sucht der Trend-Scout neue Themen.", stepper("min_idea_backlog", s.min_idea_backlog, 1, 30))}
      ${set("Trend-Scout höchstens alle", "", `<select class="select" data-sel="scout_interval_minutes">${[15, 30, 60, 120, 240, 720].map((m) => `<option value="${m}" ${+s.scout_interval_minutes === m ? "selected" : ""}>${m < 60 ? m + " Minuten" : m / 60 + (m === 60 ? " Stunde" : " Stunden")}</option>`).join("")}</select>`)}
      ${set("Branche", esc(s.niche), `<button type="button" class="btn small" data-goto2="config">Ändern</button>`)}
    </div></div>

    <div><div class="group-title">${ic("i-video")}Video</div><div class="group">
      ${set("Ziel-Länge", "Länge des gesprochenen Skripts.", `<input type="range" min="20" max="90" step="5" value="${s.target_seconds}" data-range="target_seconds" aria-label="Ziel-Länge"><output style="min-width:44px;font-weight:600;font-variant-numeric:tabular-nums" id="lenOut">${s.target_seconds} s</output>`)}
    </div></div>

    <div><div class="group-title">${ic("i-send")}Veröffentlichung</div><div class="group">
      ${PLATFORMS.map(([k, name]) => set(name, "", seg(`${k}_mode`, [["off", "Aus"], ["direct", "Direkt"], ["uploadpost", "upload-post"]], s[`${k}_mode`]))).join("")}
    </div><div class="group-note">Zugangsdaten für die Plattformen trägst du unter Einstellungen ein.</div></div>

    <div><div class="group-title">${ic("i-layers")}Agenten</div><div class="group">
      ${Object.values(state.agents).map((a) => {
        const col = Bunker.AGENT_COLOR[a.key];
        return `<div class="set"><div class="li-ico" style="background:${col}1f;color:${col}">${agentIcon(a.key)}</div>
          <div class="set-l"><div class="set-t">${esc(a.name)}</div><div class="set-s"><span class="dot ${a.status}" style="width:7px;height:7px"></span> ${AGENT_STATUS[a.status] || a.status} · ${esc(a.role)}</div></div>
          <div class="set-c">${a.manual ? `<button type="button" class="btn small" data-run="${a.key}">Ausführen</button>` : ""}<label class="switch"><input type="checkbox" data-agent-sw="${a.key}" ${a.enabled ? "checked" : ""} aria-label="${esc(a.name)} aktiv"><span></span></label></div></div>`;
      }).join("")}
    </div></div>`;
}
$("#automationView").addEventListener("click", async (e) => {
  const t = e.target;
  const segBtn = t.closest("[data-seg] button");
  if (segBtn) {
    const name = segBtn.parentElement.dataset.seg, v = segBtn.dataset.v;
    await saveSetting({ [name]: name === "require_approval" ? v === "true" : v });
    return renderAutomation();
  }
  const st = t.closest("[data-step] button");
  if (st) {
    const box = st.parentElement, name = box.dataset.step, out = box.querySelector("output");
    const v = Math.min(+box.dataset.max, Math.max(+box.dataset.min, +out.textContent + +st.dataset.d));
    out.textContent = v; await saveSetting({ [name]: v }); return renderAutomation();
  }
  const day = t.closest("[data-day]");
  if (day) {
    const days = new Set(String(state.settings.schedule_days).split(",").map((d) => +d).filter(Boolean));
    const d = +day.dataset.day; days.has(d) ? days.delete(d) : days.add(d);
    await saveSetting({ schedule_days: [...days].sort().join(",") }); return renderAutomation();
  }
  const rm = t.closest("[data-rmtime]");
  if (rm) {
    const times = String(state.settings.schedule_times).split(",").map((x) => x.trim()).filter((x) => x && x !== rm.dataset.rmtime);
    await saveSetting({ schedule_times: times.join(",") }); return renderAutomation();
  }
  if (t.closest("#addTime")) {
    const nt = $("#newTime").value; if (!nt) return;
    const times = new Set(String(state.settings.schedule_times).split(",").map((x) => x.trim()).filter(Boolean)); times.add(nt);
    await saveSetting({ schedule_times: [...times].sort().join(",") }); return renderAutomation();
  }
  const run = t.closest("[data-run]");
  if (run) return agentAction(run.dataset.run, "run");
  if (t.closest("[data-goto2]")) go("config");
});
$("#automationView").addEventListener("change", async (e) => {
  const t = e.target;
  if (t.dataset.sw === "autopilot") { await setAutopilot(t.checked); return renderAutomation(); }
  if (t.dataset.agentSw) return agentAction(t.dataset.agentSw, t.checked ? "resume" : "pause");
  if (t.dataset.sel) { await saveSetting({ [t.dataset.sel]: t.value }); return renderAutomation(); }
  if (t.dataset.range) { await saveSetting({ [t.dataset.range]: +t.value }); }
});
$("#automationView").addEventListener("input", (e) => { if (e.target.dataset.range) $("#lenOut").textContent = e.target.value + " s"; });

// ---------------- settings ----------------
const SETTINGS_UI = [
  ["Inhalt & Kanal", "Worüber die Videos handeln und für wen.", [["niche", "Branche"], ["audience", "Zielgruppe"], ["channel_name", "Kanalname"]]],
  ["KI (Claude)", "Recherche, Ideen und Skripte. Ohne Schlüssel entstehen nur Demo-Skripte.", [
    ["anthropic_api_key", "Anthropic API-Schlüssel", "secret"], ["llm_model", "Modell", "select", ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]],
    ["llm_web_search", "Websuche für die Recherche", "check"]]],
  ["Stimme", "„auto“ nimmt ElevenLabs, dann OpenAI, sonst die kostenlose Edge-Stimme.", [
    ["tts_provider", "Anbieter", "select", ["auto", "elevenlabs", "openai", "edge"]],
    ["elevenlabs_api_key", "ElevenLabs API-Schlüssel", "secret"], ["elevenlabs_voice_id", "ElevenLabs Stimmen-ID"], ["elevenlabs_model", "ElevenLabs Modell"],
    ["openai_api_key", "OpenAI API-Schlüssel", "secret"], ["openai_tts_voice", "OpenAI Stimme"], ["openai_tts_model", "OpenAI Modell"],
    ["edge_voice", "Edge-Stimme", "select", ["de-DE-ConradNeural", "de-DE-KatjaNeural", "de-DE-FlorianMultilingualNeural", "de-DE-SeraphinaMultilingualNeural", "de-DE-KillianNeural", "de-DE-AmalaNeural"]],
    ["edge_rate", "Edge-Sprechtempo"]]],
  ["Bild & Schnitt", "Stockvideos von Pexels (kostenloser Schlüssel). Musik: MP3s in data/music ablegen.", [
    ["pexels_api_key", "Pexels API-Schlüssel", "secret"], ["accent_color", "Akzentfarbe der Untertitel", "color"],
    ["subtitle_font", "Untertitel-Schrift"], ["music_volume", "Musik-Lautstärke (0–1)", "number"]]],
  ["upload-post.com", "Ein Schlüssel für alle drei Plattformen.", [["uploadpost_api_key", "API-Schlüssel", "secret"], ["uploadpost_user", "Profil (User)"]]],
  ["YouTube", "Google Cloud: YouTube Data API v3 mit OAuth-Client (Desktop-App).", [
    ["youtube_client_id", "Client-ID"], ["youtube_client_secret", "Client-Secret", "secret"], ["youtube_refresh_token", "Refresh-Token", "secret"],
    ["youtube_privacy", "Sichtbarkeit", "select", ["public", "unlisted", "private"]]]],
  ["TikTok", "Content Posting API. Ungeprüfte Apps posten nur privat (SELF_ONLY).", [
    ["tiktok_client_key", "Client-Key"], ["tiktok_client_secret", "Client-Secret", "secret"], ["tiktok_refresh_token", "Refresh-Token", "secret"],
    ["tiktok_privacy", "Sichtbarkeit", "select", ["SELF_ONLY", "PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR"]]]],
  ["Instagram", "Business- oder Creator-Konto mit instagram_content_publish.", [["instagram_access_token", "Access-Token", "secret"], ["instagram_user_id", "Instagram-User-ID"]]],
];
async function loadSettingsForm() {
  state.settings = await api("/api/settings");
  const s = state.settings;
  $("#settingsForm").innerHTML = SETTINGS_UI.map(([title, hint, fields]) => `<div><div class="group-title">${title}</div><div class="group">
    ${fields.map(([k, label, type, opts]) => {
      const v = s[k], id = `f-${k}`;
      let ctl;
      if (type === "check") ctl = `<label class="switch"><input type="checkbox" id="${id}" name="${k}" ${v ? "checked" : ""}><span></span></label>`;
      else if (type === "select") ctl = `<select class="select" id="${id}" name="${k}">${[...new Set([...opts, v])].map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
      else {
        const t = type === "secret" ? "password" : type === "number" ? "number" : type === "color" ? "color" : "text";
        ctl = `<input class="input" id="${id}" type="${t}" name="${k}" value="${esc(v)}" ${type === "number" ? 'step="any"' : ""} ${type === "secret" ? 'autocomplete="off" placeholder="Nicht hinterlegt"' : ""} ${type === "color" ? 'style="width:60px;padding:2px"' : ""}>`;
      }
      return `<div class="set"><div class="set-l"><label class="set-t" for="${id}">${label}</label></div><div class="set-c">${ctl}</div></div>`;
    }).join("")}</div><div class="group-note">${hint}</div></div>`).join("") + `<div class="save-bar"><button class="btn primary" type="submit">${ic("i-check")}Einstellungen sichern</button></div>`;
}
$("#settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const out = {};
  $$("[name]", e.target).forEach((el) => { out[el.name] = el.type === "checkbox" ? el.checked : el.value; });
  state.settings = await api("/api/settings", { body: out });
  toast("Gesichert", "Die Einstellungen gelten ab sofort.");
  refreshState();
});

// ---------------- log ----------------
function logLine(l) {
  const agent = state.agents[l.agent]?.name || (l.agent === "system" ? "System" : l.agent);
  return `<div class="log ${l.level}"><span class="t">${fmtTime(l.ts)}</span><span class="a">${esc(agent)}</span><span class="m">${l.video_id ? `<span style="color:var(--text-3)">#${l.video_id}</span> ` : ""}${esc(l.message)}</span></div>`;
}
function appendLog(l) {
  if (state.page !== "log" || (state.logFilter && l.agent !== state.logFilter)) return;
  const t = $("#terminal");
  t.insertAdjacentHTML("afterbegin", logLine(l));
  while (t.children.length > 400) t.lastElementChild.remove();
}
async function loadLogs() {
  const sel = $("#logFilter");
  if (sel.options.length === 1) Object.values(state.agents).forEach((a) => sel.add(new Option(a.name, a.key)));
  const logs = await api("/api/logs?limit=300");
  $("#terminal").innerHTML = logs.filter((l) => !state.logFilter || l.agent === state.logFilter).reverse().map(logLine).join("");
}
$("#logFilter").addEventListener("change", (e) => { state.logFilter = e.target.value; loadLogs(); });

// ---------------- bunker ----------------
Bunker.init($("#bunker"), {
  getAgents: () => state.agents,
  getStats: () => state.stats,
  openVideo: (id) => openVideo(id),
  agentAction,
});

// ---------------- live connection ----------------
function connect() {
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => { $("#live").classList.add("on"); $("#live span").textContent = "Live"; refreshState(); };
  ws.onclose = () => { $("#live").classList.remove("on"); $("#live span").textContent = "Offline"; setTimeout(connect, 2000); };
  ws.onmessage = (ev) => {
    const { type, data } = JSON.parse(ev.data);
    if (type === "agent") {
      state.agents[data.key] = data;
      if (state.page === "overview") renderAgentList();
    } else if (type === "log") { if (data.ts) appendLog(data); }
    else if (type === "video") { upsertVideo(data); refreshState(); }
    else if (type === "video_deleted") { state.videos.delete(data.id); Bunker.deleted(data.id); renderVideos(); refreshState(); }
    else if (type === "ideas") { refreshState(); if (state.page === "ideas") loadIdeas(); }
    else if (type === "notify") toast(data.title, data.message);
  };
}
setInterval(() => { if (state.page === "overview") renderAgentList(); }, 2000);

(async function init() {
  const [s, vids, settings] = await Promise.all([api("/api/state"), api("/api/videos"), api("/api/settings")]);
  state.settings = settings;
  vids.forEach((v) => state.videos.set(v.id, v));
  Bunker.loadVideos(vids);
  applyState(s);
  renderVideos();
  go(location.hash.slice(1) || "overview");
  connect();
})();
