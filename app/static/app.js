"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (id, cls = "i") => `<svg class="${cls}"><use href="#${id}"/></svg>`;
const agentIcon = (key) => `<svg class="i" viewBox="0 0 24 24"><path d="${Factory.ICONS[key] || ""}"/></svg>`;

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
  fabrik: ["Fabrik", "Live – deine Agenten bei der Arbeit"], stats: ["Statistik", ""], videos: ["Videos", "Prüfen, freigeben, verwalten"],
  ideas: ["Ideen", "Themen für kommende Videos"], channel: ["Kanal-Steuerung", "Zeitplan, Freigabe & Agenten des Faceless-Kanals"],
  automations: ["Automatisierungen", "Eigene Abläufe: Auslöser → Schritte"],
  log: ["Protokoll", "Alles, was die Agenten tun"], config: ["Einstellungen", "Konten, Stimme, Material & Zugänge"],
};

const state = { agents: {}, videos: new Map(), ideas: [], stats: {}, s: null, settings: null, page: "fabrik", videoFilter: "", logFilter: "",
  autos: new Map(), runs: [], feed: [], selAgent: null };

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
  if (!PAGES[page]) page = "fabrik";
  state.page = page;
  $$(".nav").forEach((n) => n.classList.toggle("active", n.dataset.page === page));
  $$("[data-view]").forEach((v) => (v.hidden = v.dataset.view !== page));
  $("#pageTitle").textContent = PAGES[page][0];
  $("#pageSub").textContent = page === "stats" ? (state.s?.niche || "") : PAGES[page][1];
  $("#sidebar").classList.remove("open");
  page === "fabrik" ? Factory.start() : Factory.stop();
  if (page === "stats") renderOverview();
  if (page === "automations") renderAutomations();
  if (page === "ideas") loadIdeas();
  if (page === "config") loadSettingsForm();
  if (page === "channel") renderAutomation();
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
  $("#logout").hidden = !s.auth;
  const b = $("#badgeApproval"); b.hidden = !s.stats.awaiting_approval; b.textContent = s.stats.awaiting_approval;
  if (state.page === "stats") $("#pageSub").textContent = s.niche;
  renderOverview();
  renderHud();
  if (state.page === "channel" && !document.activeElement?.closest("#automationView")) renderAutomation();
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
  if (state.page === "channel") renderAutomation();
  renderHud();
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
  const autos = [...state.autos.values()];
  $("#kAuto").textContent = autos.filter((a) => a.enabled).length;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  $("#kAutoS").textContent = `${state.runs.filter((r) => r.started_at * 1000 >= today.getTime()).length} Läufe heute · ${st.ideas} Ideen im Speicher`;
  const lc = $("#liveCount"); lc.hidden = !working; lc.textContent = working;

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
    const col = Factory.AGENT_COLOR[a.key];
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
  Factory.video(v, prev);
  renderVideos(); if (state.page === "stats") renderOverview(); renderHud();
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
        const col = Factory.AGENT_COLOR[a.key];
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
  const agent = state.agents[l.agent]?.name || ({ system: "System", automations: "Automatisierung" }[l.agent] || l.agent);
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
  if (sel.options.length === 1) { Object.values(state.agents).forEach((a) => sel.add(new Option(a.name, a.key))); sel.add(new Option("Automatisierungen", "automations")); sel.add(new Option("System", "system")); }
  const logs = await api("/api/logs?limit=300");
  $("#terminal").innerHTML = logs.filter((l) => !state.logFilter || l.agent === state.logFilter).reverse().map(logLine).join("");
}
$("#logFilter").addEventListener("change", (e) => { state.logFilter = e.target.value; loadLogs(); });

// ---------------- factory ----------------
Factory.init($("#fabrik"), {
  getAgents: () => state.agents,
  getStats: () => state.stats,
  getAutomation: () => ({ active: [...state.autos.values()].filter((a) => a.running).map((a) => ({ name: a.name })),
    recent: state.runs.filter((r) => r.status !== "running").slice(0, 5).map((r) => ({ name: r.automation_name, status: r.status })),
    enabled: [...state.autos.values()].filter((a) => a.enabled).length }),
  getInsets: () => {
    const w = $("#fabrik").clientWidth;
    return { left: w > 900 ? 215 : 8, right: w > 1100 ? 235 : 8, top: 70, bottom: 70 };
  },
  openVideo: (id) => openVideo(id),
  onSelect: (key, srv, clicked) => { if (clicked || key !== state.selAgent) { state.selAgent = key; renderAgentCard(); } },
  onZone: (z) => { if (z === "auto") go("automations"); },
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
      if (state.page === "stats") renderAgentList();
    } else if (type === "log") { if (data.ts) { appendLog(data); pushFeed(data); } }
    else if (type === "automation") { state.autos.set(data.id, data); if (state.page === "automations") renderAutomations(); }
    else if (type === "automation_deleted") { state.autos.delete(data.id); if (state.page === "automations") renderAutomations(); }
    else if (type === "automation_run") onRun(data);
    else if (type === "video") { upsertVideo(data); refreshState(); }
    else if (type === "video_deleted") { state.videos.delete(data.id); Factory.deleted(data.id); renderVideos(); refreshState(); }
    else if (type === "ideas") { refreshState(); if (state.page === "ideas") loadIdeas(); }
    else if (type === "notify") toast(data.title, data.message);
  };
}
setInterval(() => { if (state.page === "stats") renderAgentList(); if (state.page === "fabrik") renderHud(); }, 1000);

(async function init() {
  const [s, vids, settings, autos, runs, logs] = await Promise.all([api("/api/state"), api("/api/videos"), api("/api/settings"),
    api("/api/automations"), api("/api/automations/runs?limit=40"), api("/api/logs?limit=12")]);
  state.settings = settings;
  autos.forEach((a) => state.autos.set(a.id, a));
  state.runs = runs;
  state.feed = logs.slice(-10).reverse();
  vids.forEach((v) => state.videos.set(v.id, v));
  Factory.loadVideos(vids);
  applyState(s);
  renderVideos();
  go(location.hash.slice(1) || "fabrik");
  connect();
})();

// ======================================================================
// Sidebar (expanded by default, collapsible)
// ======================================================================
try { if (localStorage.getItem("lugger.sidebar") === "collapsed") $("#app").classList.add("collapsed"); } catch (e) { /* optional */ }
$("#collapseBtn").addEventListener("click", () => {
  const c = $("#app").classList.toggle("collapsed");
  try { localStorage.setItem("lugger.sidebar", c ? "collapsed" : "open"); } catch (e) { /* optional */ }
  setTimeout(() => window.dispatchEvent(new Event("resize")), 260);
});

// ======================================================================
// Fabrik HUD
// ======================================================================
const ago = (ts) => { const s = Math.max(0, Math.round(Date.now() / 1000 - ts)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} h` : `${Math.floor(s / 86400)} T`; };
function countdown(iso) {
  if (!iso) return "–";
  const s = Math.max(0, Math.round((new Date(iso) - Date.now()) / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function pushFeed(l) { state.feed.unshift(l); state.feed = state.feed.slice(0, 10); if (state.page === "fabrik") renderFeed(); }
function res(icon, col, value, label, click) {
  return `<button class="res ${click ? "click" : ""}" ${click ? `data-res="${click}"` : "tabindex=-1"}><span class="res-ico" style="background:${col}22;color:${col}">${ic(icon)}</span><span><b>${value}</b><small>${label}</small></span></button>`;
}
let lastHudSig = "";
function renderHud() {
  const s = state.s; if (!s) return;
  const st = s.stats, autos = [...state.autos.values()];
  const running = autos.filter((a) => a.running).length;
  $("#hudTop").innerHTML = [
    res("i-bulb", "#5e5ce6", st.ideas, "Ideen", "ideas"),
    res("i-factory", "#0a84ff", st.in_production, "In Produktion", "videos"),
    res("i-check", "#ff9500", st.awaiting_approval, "Freigabe", st.awaiting_approval ? "approve" : "videos"),
    res("i-send", "#30b45a", st.published, "Online", "stats"),
    `<span class="res-sep"></span>`,
    res("i-bolt", "#00a19a", `${autos.filter((a) => a.enabled).length}${running ? ` <span class="spin" style="width:10px;height:10px"></span>` : ""}`, "Automationen", "automations"),
    res("i-clock", "#8e8e93", s.autopilot ? countdown(s.next_slot) : "Aus", s.autopilot ? "Nächstes Video" : "Autopilot", "channel"),
  ].join("");
  const sig = JSON.stringify([Object.values(state.agents).map((a) => [a.status, a.task, Math.round(a.progress || 0)]), running, state.selAgent]);
  if (sig !== lastHudSig) {
    lastHudSig = sig;
    const list = [...Object.values(state.agents), { key: "automator", name: "Automator", status: running ? "working" : "idle", task: running ? `Führt „${autos.find((a) => a.running)?.name}“ aus` : "Bereit für Automatisierungen", role: "Führt deine Automatisierungen aus" }];
    $("#hudCrew").innerHTML = `<div class="hud-h"><span>Crew</span><span>${Object.values(state.agents).filter((a) => a.status === "working").length + (running ? 1 : 0)} aktiv</span></div>` + list.map((a) => {
      const col = Factory.AGENT_COLOR[a.key];
      return `<button class="crew ${state.selAgent === a.key ? "sel" : ""}" data-crew="${a.key}"><span class="crew-av" style="background:${col}22;color:${col}">${agentIcon(a.key)}<span class="st ${a.status}"></span></span>
        <span style="min-width:0"><div class="crew-n">${esc(a.name)}</div><div class="crew-t">${esc(a.status === "idle" ? (a.key === "automator" ? a.task : "Bereit") : a.task || "")}</div>
        ${a.status === "working" && a.progress != null ? `<div class="bar"><div style="width:${Math.round(a.progress)}%;background:${col}"></div></div>` : ""}</span></button>`;
    }).join("");
  }
  renderRightHud();
  if (state.selAgent) renderAgentCard();
}
let lastRightSig = "";
function renderRightHud() {
  const waiting = [...state.videos.values()].filter((v) => v.status === "awaiting_approval").sort((a, b) => a.id - b.id);
  const sig = JSON.stringify([waiting.map((v) => v.id), state.runs.slice(0, 4).map((r) => [r.id, r.status]), [...state.autos.values()].length]);
  if (sig === lastRightSig) return;
  lastRightSig = sig;
  const runs = state.runs.slice(0, 4);
  $("#hudRight").innerHTML = `
    <div class="glass hud-card"><div class="hud-h"><span>Wartet auf dich</span><span>${waiting.length}</span></div>
      ${waiting.length ? waiting.slice(0, 3).map((v) => `<div class="appr"><div class="appr-th"></div><div style="min-width:0"><div class="appr-t">${esc(v.title || v.topic)}</div>
        <div class="row"><button class="btn small ok" data-hq="approve" data-id="${v.id}">${ic("i-check")}Freigeben</button><button class="btn small" data-hq="open" data-id="${v.id}">Ansehen</button></div></div></div>`).join("")
        : `<div class="crew-t" style="padding:2px 4px 6px">Keine offenen Freigaben.</div>`}
    </div>
    <div class="glass hud-card"><div class="hud-h"><span>Live</span><span class="live on"><i></i></span></div><div class="feed" id="hudFeed"></div></div>
    <div class="glass hud-card"><div class="hud-h"><span>Automationen</span><button class="btn plain small" data-hq="autos" style="padding:0 2px">Alle</button></div>
      ${runs.length ? runs.map((r) => `<div class="fe" data-run="${r.id}" style="cursor:pointer"><i style="background:${runColor(r.status)}"></i><span>${esc(r.automation_name || "")}</span><small>${r.status === "running" ? "läuft" : ago(r.started_at)}</small></div>`).join("")
        : `<div class="crew-t" style="padding:2px 4px 6px">Noch keine Läufe. <a href="#automations">Automation erstellen</a></div>`}
    </div>`;
  renderFeed();
}
function renderFeed() {
  const el = $("#hudFeed"); if (!el) return;
  el.innerHTML = state.feed.slice(0, 7).map((l) => {
    const col = Factory.AGENT_COLOR[l.agent] || (l.agent === "automations" ? "#00c7be" : "#8e8e93");
    return `<div class="fe"><i style="background:${l.level === "error" ? "var(--red)" : col}"></i><span title="${esc(l.message)}">${esc(l.message)}</span><small>${new Date(l.ts * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</small></div>`;
  }).join("");
}
const runColor = (s) => ({ running: "var(--accent)", success: "var(--green)", skipped: "var(--text-3)", error: "var(--red)" }[s] || "var(--text-3)");
function renderAgentCard() {
  const el = $("#hudAgent");
  const key = state.selAgent;
  if (!key) { el.hidden = true; return; }
  const running = [...state.autos.values()].find((a) => a.running);
  const a = key === "automator" ? { key, name: "Automator", role: "Führt deine Automatisierungen aus", status: running ? "working" : "idle", task: running ? `Führt „${running.name}“ aus` : "Wartet auf den nächsten Auslöser", processed: state.runs.length, enabled: true } : state.agents[key];
  if (!a) return;
  const col = Factory.AGENT_COLOR[key];
  const st = { working: ["Arbeitet", "blue"], idle: ["Bereit", "green"], paused: ["Pausiert", ""], error: ["Fehler", "red"], waiting: ["Wartet", "blue"] }[a.status] || [a.status, ""];
  el.hidden = false;
  el.innerHTML = `<div class="ha-h"><div class="ha-av" style="background:${col}">${agentIcon(key)}</div>
    <div style="min-width:0;flex:1"><b>${esc(a.name)}</b><div class="crew-t">${esc(a.role)}</div></div><span class="chip ${st[1]}">${st[0]}</span>
    <button class="icon-btn" data-ha="close" aria-label="Schließen">${ic("i-x")}</button></div>
    <div style="font-size:13px">${esc(a.task || "–")}</div>
    ${a.status === "working" && a.progress != null ? `<div class="bar"><div style="width:${Math.round(a.progress)}%;background:${col}"></div></div>` : ""}
    <div class="row">${key === "automator" ? `<button class="btn small" data-ha="autos">${ic("i-bolt")}Automatisierungen</button>` : `
      <button class="btn small" data-ha="toggle">${ic(a.enabled ? "i-pause" : "i-play")}${a.enabled ? "Pausieren" : "Fortsetzen"}</button>
      ${a.manual ? `<button class="btn small" data-ha="run">${ic("i-bolt")}Jetzt ausführen</button>` : ""}
      ${a.video_id ? `<button class="btn small" data-ha="video">${ic("i-video")}Video #${a.video_id}</button>` : ""}`}
      <span class="crew-t" style="margin-left:auto">${a.processed ?? 0} erledigt</span></div>`;
}
$("#hudAgent").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ha]"); if (!b) return;
  const key = state.selAgent, act = b.dataset.ha;
  if (act === "close") { state.selAgent = null; Factory.deselect(); renderAgentCard(); lastHudSig = ""; renderHud(); }
  else if (act === "toggle") agentAction(key, state.agents[key].enabled ? "pause" : "resume");
  else if (act === "run") agentAction(key, "run");
  else if (act === "video") openVideo(state.agents[key].video_id);
  else if (act === "autos") go("automations");
});
$("#hudCrew").addEventListener("click", (e) => {
  const b = e.target.closest("[data-crew]"); if (!b) return;
  state.selAgent = b.dataset.crew; Factory.select(b.dataset.crew); lastHudSig = ""; renderHud();
});
$("#hudTop").addEventListener("click", (e) => {
  const b = e.target.closest("[data-res]"); if (!b) return;
  const t = b.dataset.res;
  if (t === "approve") { const w = [...state.videos.values()].filter((v) => v.status === "awaiting_approval").sort((a, b2) => a.id - b2.id)[0]; if (w) openVideo(w.id); }
  else go(t);
});
$("#hudRight").addEventListener("click", async (e) => {
  const run = e.target.closest("[data-run]"); if (run) return openRun(+run.dataset.run);
  const b = e.target.closest("[data-hq]"); if (!b) return;
  if (b.dataset.hq === "approve") await videoAction(+b.dataset.id, "approve");
  else if (b.dataset.hq === "open") openVideo(+b.dataset.id);
  else if (b.dataset.hq === "autos") go("automations");
});
$("#hudDock").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-dock]"); if (!b) return;
  const d = b.dataset.dock;
  if (d === "produce") $("#produceNow").click();
  else if (d === "scout") agentAction("trend_scout", "run");
  else if (d === "automation") openEditor(null);
  else if (d === "in") Factory.zoom(1.3);
  else if (d === "out") Factory.zoom(1 / 1.3);
  else if (d === "fit") Factory.fit();
  else if (d === "full") { try { document.fullscreenElement ? document.exitFullscreen() : $("#fabrik").requestFullscreen?.().catch(() => {}); } catch (err) { /* optional */ } }
});

// ======================================================================
// Automations: spec, templates, list, editor, runs
// ======================================================================
const EVENTS = { "video.created": "Neues Video gestartet", "video.ready": "Video wartet auf Freigabe", "video.approved": "Video freigegeben",
  "video.published": "Video veröffentlicht", "video.failed": "Fehler in der Produktion", "ideas.found": "Neue Ideen gefunden" };
const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const TRIGGERS = {
  manual: { label: "Manuell", icon: "i-play", color: "#8e8e93", desc: "Startet nur per Knopfdruck", fields: [] },
  schedule: { label: "Zeitplan", icon: "i-clock", color: "#0a84ff", desc: "Zu festen Uhrzeiten", fields: [
    { k: "times", label: "Uhrzeiten (HH:MM, kommagetrennt)", type: "text", def: "08:00", ph: "08:00, 18:30" },
    { k: "days", label: "Wochentage", type: "days", def: "1,2,3,4,5" }] },
  interval: { label: "Intervall", icon: "i-refresh", color: "#5e5ce6", desc: "Regelmäßig alle X Minuten", fields: [{ k: "minutes", label: "Alle … Minuten", type: "number", def: 60 }] },
  webhook: { label: "Webhook", icon: "i-link", color: "#ff6a2b", desc: "Wenn eine URL aufgerufen wird", fields: [] },
  event: { label: "Ereignis", icon: "i-bolt", color: "#00a19a", desc: "Wenn in der Fabrik etwas passiert", fields: [{ k: "event", label: "Wenn …", type: "select", options: Object.entries(EVENTS), def: "video.published", wide: true }] },
};
const STEPS = {
  http: { label: "HTTP-Anfrage", icon: "i-globe", color: "#0a84ff", fields: [
    { k: "method", label: "Methode", type: "select", options: [["GET", "GET"], ["POST", "POST"], ["PUT", "PUT"], ["PATCH", "PATCH"], ["DELETE", "DELETE"]], def: "GET" },
    { k: "url", label: "URL", type: "text", ph: "https://…", def: "" },
    { k: "headers", label: "Header (JSON, optional)", type: "textarea", ph: '{"Authorization": "Bearer …"}', wide: true },
    { k: "body", label: "Body (optional)", type: "textarea", wide: true },
    { k: "fail_on_error", label: "Bei Statuscode ab 400 abbrechen", type: "bool", def: true, wide: true }] },
  claude: { label: "Claude fragen", icon: "i-sparkle", color: "#d97757", fields: [
    { k: "prompt", label: "Aufgabe / Prompt", type: "textarea", wide: true, ph: "Fasse die wichtigsten KI-News von heute zusammen …" },
    { k: "system", label: "Rolle (optional)", type: "text", ph: "Du bist ein knapper Newsletter-Autor.", wide: true },
    { k: "web_search", label: "Im Web recherchieren", type: "bool", def: false, wide: true }] },
  discord: { label: "Discord-Nachricht", icon: "i-chat", color: "#5865f2", fields: [
    { k: "webhook_url", label: "Discord-Webhook-URL", type: "secret", wide: true }, { k: "message", label: "Nachricht", type: "textarea", wide: true }] },
  slack: { label: "Slack-Nachricht", icon: "i-chat", color: "#4a154b", fields: [
    { k: "webhook_url", label: "Slack-Webhook-URL", type: "secret", wide: true }, { k: "message", label: "Nachricht", type: "textarea", wide: true }] },
  telegram: { label: "Telegram-Nachricht", icon: "i-send", color: "#229ed9", fields: [
    { k: "bot_token", label: "Bot-Token", type: "secret" }, { k: "chat_id", label: "Chat-ID", type: "text" }, { k: "message", label: "Nachricht", type: "textarea", wide: true }] },
  filter: { label: "Bedingung", icon: "i-filter", color: "#ff9500", fields: [
    { k: "left", label: "Wert", type: "text", ph: "{{steps.1.output.status}}" },
    { k: "op", label: "Prüfung", type: "select", options: [["contains", "enthält"], ["not_contains", "enthält nicht"], ["equals", "ist gleich"], ["not_equals", "ist nicht gleich"], ["gt", "größer als"], ["lt", "kleiner als"], ["not_empty", "ist nicht leer"]], def: "equals" },
    { k: "right", label: "Vergleichswert", type: "text", wide: true }] },
  delay: { label: "Warten", icon: "i-hourglass", color: "#8e8e93", fields: [{ k: "seconds", label: "Sekunden (max. 3600)", type: "number", def: 60 }] },
  add_idea: { label: "Videoidee anlegen", icon: "i-bulb", color: "#5e5ce6", fields: [{ k: "title", label: "Titel", type: "text", wide: true }, { k: "angle", label: "Blickwinkel", type: "text", wide: true }] },
  produce_video: { label: "Video produzieren", icon: "i-video", color: "#bf5af2", fields: [{ k: "topic", label: "Thema (leer = beste Idee)", type: "text", wide: true }] },
  run_agent: { label: "Agent starten", icon: "i-users", color: "#30b45a", fields: [{ k: "agent", label: "Agent", type: "select", options: [["trend_scout", "Trend-Scout (Ideen suchen)"], ["producer", "Produktionsleiter (Video starten)"]], def: "trend_scout", wide: true }] },
  autopilot: { label: "Autopilot schalten", icon: "i-bolt", color: "#00a19a", fields: [{ k: "on", label: "Autopilot", type: "select", options: [["true", "Einschalten"], ["false", "Ausschalten"]], def: "true", wide: true }] },
  log: { label: "Protokoll-Eintrag", icon: "i-list", color: "#8e8e93", fields: [{ k: "message", label: "Text", type: "text", wide: true }] },
};
const TEMPLATES = [
  { name: "Neues Video → Discord", desc: "Postet jedes veröffentlichte Video in deinen Discord-Kanal.", trigger: { type: "event", event: "video.published" },
    steps: [{ type: "discord", webhook_url: "", message: "🎬 Neues Video online: **{{trigger.data.title}}**\n{{trigger.data.youtube_url}}" }] },
  { name: "KI-News am Morgen", desc: "Claude recherchiert jeden Werktag die KI-News und schickt sie per Telegram.", trigger: { type: "schedule", times: "07:30", days: "1,2,3,4,5" },
    steps: [{ type: "claude", prompt: "Fasse die 5 wichtigsten Nachrichten über Künstliche Intelligenz von heute ({{date}}) in kurzen deutschen Stichpunkten zusammen, jeweils mit Quelle.", web_search: true },
      { type: "telegram", bot_token: "", chat_id: "", message: "☀️ KI-News {{date}}\n\n{{steps.1.output}}" }] },
  { name: "Website-Monitor", desc: "Prüft alle 5 Minuten eine Website und schlägt bei Fehlern Alarm.", trigger: { type: "interval", minutes: 5 },
    steps: [{ type: "http", method: "GET", url: "https://example.com", fail_on_error: false },
      { type: "filter", left: "{{steps.1.output.status}}", op: "not_equals", right: "200" },
      { type: "discord", webhook_url: "", message: "🚨 Website antwortet mit Status {{steps.1.output.status}} ({{time}})" }] },
  { name: "Webhook → Videoidee", desc: "Andere Tools (z. B. Zapier, Shortcuts) schicken dir Themen per URL.", trigger: { type: "webhook" },
    steps: [{ type: "add_idea", title: "{{trigger.data.title}}", angle: "{{trigger.data.angle}}" }] },
  { name: "Fehler-Alarm", desc: "Meldet sofort, wenn ein Agent in der Produktion scheitert.", trigger: { type: "event", event: "video.failed" },
    steps: [{ type: "telegram", bot_token: "", chat_id: "", message: "⚠️ {{trigger.data.agent}}: {{trigger.data.error}}" }] },
  { name: "Wochenbericht", desc: "Freitags schreibt Claude einen kurzen Bericht für Slack.", trigger: { type: "schedule", times: "17:00", days: "5" },
    steps: [{ type: "claude", prompt: "Schreibe einen kurzen, motivierenden Wochenbericht für ein Faceless-KI-Videoprojekt. Zahlen: {{stats.published}} Videos online, {{stats.awaiting_approval}} warten auf Freigabe, {{stats.ideas}} Ideen im Speicher." },
      { type: "slack", webhook_url: "", message: "📊 Wochenbericht\n{{steps.1.output}}" }] },
];
const stepIcon = (t) => { const d = STEPS[t] || { icon: "i-bolt", color: "#8e8e93" }; return `<span class="si" style="background:${d.color}1f;color:${d.color}">${ic(d.icon)}</span>`; };
const trigIcon = (t) => { const d = TRIGGERS[t] || TRIGGERS.manual; return `<span class="si" style="background:${d.color}1f;color:${d.color}">${ic(d.icon)}</span>`; };
function trigSummary(t) {
  if (!t) return "";
  if (t.type === "schedule") { const d = String(t.days || "").split(",").filter(Boolean).map((x) => DAY_NAMES[+x - 1]).join(", "); return `${t.times || ""} · ${d.split(", ").length === 7 ? "täglich" : d}`; }
  if (t.type === "interval") return `Alle ${t.minutes} Min.`;
  if (t.type === "event") return EVENTS[t.event] || t.event;
  if (t.type === "webhook") return "Per URL-Aufruf";
  return "Per Knopfdruck";
}
const statusChip = (s) => ({ running: '<span class="chip blue"><span class="spin"></span>Läuft</span>', success: '<span class="chip green">Erfolgreich</span>', skipped: '<span class="chip">Übersprungen</span>', error: '<span class="chip red">Fehler</span>' }[s] || '<span class="chip">Noch nie</span>');

function renderAutomations() {
  const list = [...state.autos.values()].sort((a, b) => b.id - a.id);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const runsToday = state.runs.filter((r) => r.started_at * 1000 >= today.getTime());
  $("#autoView").innerHTML = `<div class="settings-col">
    <div class="auto-head"><div><h2>Automatisierungen</h2><p>Eigene Abläufe – mit oder ohne Bezug zum Kanal. Ein Auslöser startet beliebig viele Schritte.</p></div>
      <button class="btn primary" data-a="new">${ic("i-plus")}Neue Automatisierung</button></div>
    <div class="grid g-4">
      <div class="card kpi"><div class="kpi-top">Aktiv</div><div class="kpi-v">${list.filter((a) => a.enabled).length}<span style="font-size:15px;color:var(--text-3);font-weight:600"> / ${list.length}</span></div></div>
      <div class="card kpi"><div class="kpi-top">Läufe heute</div><div class="kpi-v">${runsToday.length}</div></div>
      <div class="card kpi"><div class="kpi-top">Erfolgsquote</div><div class="kpi-v">${state.runs.length ? Math.round(100 * state.runs.filter((r) => r.status !== "error").length / state.runs.length) : 100} %</div></div>
      <div class="card kpi"><div class="kpi-top">Gerade aktiv</div><div class="kpi-v">${list.filter((a) => a.running).length}</div></div>
    </div>
    <div><div class="group-title">${ic("i-sparkle")}Vorlagen – ein Klick, dann anpassen</div><div class="tpl-grid">
      ${TEMPLATES.map((t, i) => `<button class="tpl" data-tpl="${i}"><div class="tpl-icons">${trigIcon(t.trigger.type)}${t.steps.map((s) => `<span class="arrow">›</span>${stepIcon(s.type)}`).join("")}</div><b>${esc(t.name)}</b><span>${esc(t.desc)}</span></button>`).join("")}
    </div></div>
    <div><div class="group-title">${ic("i-bolt")}Deine Automatisierungen</div>
      ${list.length ? `<div class="auto-grid">${list.map(autoCard).join("")}</div>` : `<div class="empty">Noch keine Automatisierung. Starte mit einer Vorlage oder „Neue Automatisierung“.</div>`}
    </div>
    <div class="card"><div class="card-h"><h2>Letzte Läufe</h2><span class="meta">${state.runs.length} gespeichert</span></div>
      <div class="runs">${state.runs.slice(0, 15).map((r) => `<div class="run" data-run="${r.id}"><span class="t">${new Date(r.started_at * 1000).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b style="font-weight:600">${esc(r.automation_name || "")}</b> <span class="vmeta">· ${esc(TRIGGERS[r.trigger?.type]?.label || "")}${r.trigger?.label ? ": " + esc(r.trigger.label) : ""}</span></span>
        <span class="dur vmeta">${r.finished_at ? ((r.finished_at - r.started_at) < 1 ? "<1 s" : Math.round(r.finished_at - r.started_at) + " s") : ""}</span>${statusChip(r.status)}</div>`).join("") || '<div class="li-s">Noch keine Läufe.</div>'}</div></div>
  </div>`;
}
function autoCard(a) {
  return `<div class="acard ${a.enabled ? "" : "off"}" data-auto="${a.id}">
    <div class="acard-h">${trigIcon(a.trigger.type)}<div style="flex:1;min-width:0"><h3>${esc(a.name)}</h3><p>${esc(a.description || trigSummary(a.trigger))}</p></div>
      <label class="switch"><input type="checkbox" data-a="toggle" ${a.enabled ? "checked" : ""} aria-label="${esc(a.name)} aktiv"><span></span></label></div>
    <div class="flow"><span class="chip">${ic(TRIGGERS[a.trigger.type]?.icon || "i-play")}${esc(trigSummary(a.trigger))}</span>
      ${a.steps.map((s) => `<span class="arrow">›</span><span class="chip">${ic(STEPS[s.type]?.icon || "i-bolt")}${esc(STEPS[s.type]?.label || s.type)}</span>`).join("")}</div>
    <div class="acard-f">${a.running ? statusChip("running") : statusChip(a.last_status)}<span>${a.last_run_at ? `vor ${ago(a.last_run_at)}` : ""} · ${a.run_count} Läufe</span>
      <div class="row"><button class="btn small" data-a="run" ${a.running ? "disabled" : ""}>${ic("i-play")}Ausführen</button>
      <button class="icon-btn" data-a="edit" title="Bearbeiten">${ic("i-edit")}</button><button class="icon-btn" data-a="history" title="Verlauf">${ic("i-history")}</button></div></div>
  </div>`;
}
$("#autoView").addEventListener("click", async (e) => {
  const tpl = e.target.closest("[data-tpl]");
  if (tpl) return openEditor(null, JSON.parse(JSON.stringify(TEMPLATES[+tpl.dataset.tpl])));
  const runEl = e.target.closest("[data-run]");
  if (runEl) return openRun(+runEl.dataset.run);
  const b = e.target.closest("[data-a]"); if (!b || b.dataset.a === "toggle") return;
  const id = +e.target.closest("[data-auto]")?.dataset.auto;
  if (b.dataset.a === "new") openEditor(null);
  else if (b.dataset.a === "edit") openEditor(state.autos.get(id));
  else if (b.dataset.a === "run") { await api(`/api/automations/${id}/run`, { body: {} }); toast("Gestartet", state.autos.get(id)?.name); }
  else if (b.dataset.a === "history") openHistory(id);
});
$("#autoView").addEventListener("change", async (e) => {
  if (e.target.dataset.a !== "toggle") return;
  const id = +e.target.closest("[data-auto]").dataset.auto;
  const a = await api(`/api/automations/${id}/toggle`, { body: { enabled: e.target.checked } });
  state.autos.set(a.id, a); renderAutomations(); renderHud();
  toast(a.enabled ? "Aktiviert" : "Deaktiviert", a.name);
});
function onRun(run) {
  const i = state.runs.findIndex((r) => r.id === run.id);
  if (i >= 0) state.runs[i] = run; else state.runs.unshift(run);
  state.runs = state.runs.slice(0, 60);
  const a = state.autos.get(run.automation_id);
  if (a) { a.running = run.status === "running"; if (run.status !== "running") { a.last_status = run.status; } }
  if (state.page === "automations") renderAutomations();
  renderHud();
  if ($("#runDialog").open && +$("#runDialog").dataset.run === run.id) openRun(run.id);
}

// ---------- editor ----------
let draft = null;
function blankStep(type) { const d = { type }; for (const f of STEPS[type].fields) if (f.def !== undefined) d[f.k] = f.def; return d; }
function openEditor(a, tpl) {
  draft = a ? JSON.parse(JSON.stringify({ id: a.id, name: a.name, description: a.description, enabled: a.enabled, trigger: a.trigger, steps: a.steps, webhook_path: a.webhook_path }))
    : tpl ? { name: tpl.name, description: tpl.desc, enabled: true, trigger: tpl.trigger, steps: tpl.steps }
    : { name: "", description: "", enabled: true, trigger: { type: "manual" }, steps: [] };
  draft.palette = !draft.steps.length;
  renderEditor();
  $("#autoEditor").showModal();
  setTimeout(() => { if (!draft.name) $("#edName")?.focus(); }, 50);
}
function fieldHtml(f, val, path) {
  const id = `ed-${path}-${f.k}`.replace(/[^\w-]/g, "_");
  const v = val ?? f.def ?? "";
  let ctl;
  if (f.type === "textarea") ctl = `<textarea class="input" id="${id}" data-path="${path}" data-k="${f.k}" placeholder="${esc(f.ph || "")}" rows="3">${esc(v)}</textarea>`;
  else if (f.type === "select") ctl = `<select class="select" id="${id}" data-path="${path}" data-k="${f.k}">${f.options.map(([o, l]) => `<option value="${esc(o)}" ${String(o) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  else if (f.type === "bool") return `<div class="field ${f.wide ? "wide" : ""}"><label style="display:flex;align-items:center;gap:10px;color:var(--text);font-size:13px"><label class="switch"><input type="checkbox" data-path="${path}" data-k="${f.k}" ${v === true || v === "true" ? "checked" : ""}><span></span></label>${f.label}</label></div>`;
  else if (f.type === "days") { const set = new Set(String(v).split(",").map(Number)); ctl = `<div class="day-pills" data-path="${path}" data-k="${f.k}">${DAY_NAMES.map((n, i) => `<button type="button" data-day="${i + 1}" class="${set.has(i + 1) ? "on" : ""}">${n}</button>`).join("")}</div>`; }
  else ctl = `<input class="input" id="${id}" type="${f.type === "number" ? "number" : f.type === "secret" ? "password" : "text"}" data-path="${path}" data-k="${f.k}" value="${esc(v)}" placeholder="${esc(f.ph || "")}" autocomplete="off">`;
  return `<div class="field ${f.wide ? "wide" : ""}"><label for="${id}">${f.label}</label>${ctl}</div>`;
}
function renderEditor() {
  const d = draft, t = TRIGGERS[d.trigger.type];
  const hookUrl = d.webhook_path ? location.origin + d.webhook_path : null;
  $("#autoEditorBody").innerHTML = `<form class="ed" id="edForm">
    <div class="ed-h">${ic("i-bolt")}<input id="edName" value="${esc(d.name)}" placeholder="Name der Automatisierung" aria-label="Name" required>
      <label class="switch" title="Aktiv"><input type="checkbox" id="edEnabled" ${d.enabled ? "checked" : ""} aria-label="Aktiv"><span></span></label>
      <button type="button" class="icon-btn" data-ed="close" aria-label="Schließen">${ic("i-x")}</button></div>
    <div class="ed-b">
      <div class="node trigger">
        <div class="node-h">${trigIcon(d.trigger.type)}<div><small>Auslöser</small><br><b>${t.label}</b></div></div>
        <div class="seg" style="align-self:flex-start">${Object.entries(TRIGGERS).map(([k, v]) => `<button type="button" data-trig="${k}" class="${k === d.trigger.type ? "on" : ""}">${v.label}</button>`).join("")}</div>
        <div class="crew-t">${t.desc}</div>
        ${t.fields.length ? `<div class="node-fields">${t.fields.map((f) => fieldHtml(f, d.trigger[f.k], "trigger")).join("")}</div>` : ""}
        ${d.trigger.type === "webhook" ? (hookUrl ? `<div class="field"><label>Webhook-URL (GET oder POST mit JSON)</label><div class="hook-url"><code>${esc(hookUrl)}</code><button type="button" class="btn small" data-ed="copy">${ic("i-copy")}Kopieren</button></div></div>` : `<div class="crew-t">Die URL erscheint nach dem Speichern. Gesendete Daten erreichst du mit {{trigger.data.feldname}}.</div>`) : ""}
      </div>
      ${d.steps.map((s, i) => { const sp = STEPS[s.type]; return `<div class="connector"></div><div class="node">
        <div class="node-h">${stepIcon(s.type)}<div><small>Schritt ${i + 1}</small><br><b>${sp.label}</b></div>
          <div class="row"><button type="button" class="icon-btn" data-ed="up" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Nach oben">${ic("i-up")}</button>
          <button type="button" class="icon-btn" data-ed="down" data-i="${i}" ${i === d.steps.length - 1 ? "disabled" : ""} aria-label="Nach unten">${ic("i-down")}</button>
          <button type="button" class="icon-btn" data-ed="del" data-i="${i}" aria-label="Entfernen" style="color:var(--red)">${ic("i-trash")}</button></div></div>
        <div class="node-fields">${sp.fields.map((f) => fieldHtml(f, s[f.k], `steps.${i}`)).join("")}</div>
        ${s.type !== "filter" ? `<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-2)"><input type="checkbox" data-path="steps.${i}" data-k="continue_on_error" ${s.continue_on_error ? "checked" : ""}> Bei Fehler trotzdem weitermachen</label>` : ""}
      </div>`; }).join("")}
      <div class="connector"></div>
      ${d.palette ? `<div class="node"><div class="node-h"><b>Schritt hinzufügen</b>${d.steps.length ? `<button type="button" class="btn plain small" data-ed="nopal" style="margin-left:auto">Schließen</button>` : ""}</div>
        <div class="palette">${Object.entries(STEPS).map(([k, v]) => `<button type="button" class="pal" data-add="${k}">${stepIcon(k)}${v.label}</button>`).join("")}</div></div>`
        : `<button type="button" class="btn add-step" data-ed="pal">${ic("i-plus")}Schritt hinzufügen</button>`}
      <div class="vars" style="margin-top:18px">Variablen: ${["{{trigger.data.title}}", "{{steps.1.output}}", "{{steps.last.output}}", "{{date}}", "{{time}}", "{{stats.published}}"].map((v) => `<code data-var="${v}">${v}</code>`).join("")}</div>
    </div>
    <div class="ed-f">${d.id ? `<button type="button" class="btn danger" data-ed="delete">${ic("i-trash")}Löschen</button>` : ""}<span class="grow"></span>
      <button type="button" class="btn" data-ed="close">Abbrechen</button>
      <button type="button" class="btn" data-ed="test">${ic("i-play")}Speichern &amp; testen</button>
      <button type="submit" class="btn primary">${ic("i-check")}Speichern</button></div>
  </form>`;
}
function readDraftFields() {
  const root = $("#autoEditorBody");
  draft.name = $("#edName", root)?.value ?? draft.name;
  draft.enabled = $("#edEnabled", root)?.checked ?? draft.enabled;
  $$("[data-path][data-k]", root).forEach((el) => {
    const [base, idx] = el.dataset.path.split(".");
    const target = base === "trigger" ? draft.trigger : draft.steps[+idx];
    if (!target) return;
    if (el.classList.contains("day-pills")) target[el.dataset.k] = $$("button.on", el).map((b) => b.dataset.day).join(",");
    else if (el.type === "checkbox") target[el.dataset.k] = el.checked;
    else target[el.dataset.k] = el.type === "number" ? Number(el.value) : el.value;
  });
}
$("#autoEditorBody").addEventListener("click", async (e) => {
  const day = e.target.closest(".day-pills button"); if (day) { day.classList.toggle("on"); return; }
  const v = e.target.closest("[data-var]");
  if (v) { try { await navigator.clipboard.writeText(v.dataset.var); toast("Kopiert", v.dataset.var); } catch (err) { toast("Variable", v.dataset.var); } return; }
  const trig = e.target.closest("[data-trig]");
  if (trig) { readDraftFields(); draft.trigger = { type: trig.dataset.trig }; for (const f of TRIGGERS[trig.dataset.trig].fields) draft.trigger[f.k] = f.def; renderEditor(); return; }
  const add = e.target.closest("[data-add]");
  if (add) { readDraftFields(); draft.steps.push(blankStep(add.dataset.add)); draft.palette = false; renderEditor(); $("#autoEditorBody .ed-b").scrollTop = 1e6; return; }
  const b = e.target.closest("[data-ed]"); if (!b) return;
  const act = b.dataset.ed, i = +b.dataset.i;
  if (act === "close") { $("#autoEditor").close(); return; }
  if (act === "copy") { try { await navigator.clipboard.writeText(location.origin + draft.webhook_path); toast("URL kopiert"); } catch (err) { toast("URL", location.origin + draft.webhook_path); } return; }
  readDraftFields();
  if (act === "pal") draft.palette = true;
  else if (act === "nopal") draft.palette = false;
  else if (act === "del") draft.steps.splice(i, 1);
  else if (act === "up" && i > 0) [draft.steps[i - 1], draft.steps[i]] = [draft.steps[i], draft.steps[i - 1]];
  else if (act === "down" && i < draft.steps.length - 1) [draft.steps[i + 1], draft.steps[i]] = [draft.steps[i], draft.steps[i + 1]];
  else if (act === "delete") {
    if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.innerHTML = `${ic("i-trash")}Wirklich löschen?`; return; }
    await api(`/api/automations/${draft.id}`, { method: "DELETE" }); state.autos.delete(draft.id); $("#autoEditor").close(); renderAutomations(); toast("Gelöscht"); return;
  } else if (act === "test") { const a = await saveDraft(); if (a) { const r = await api(`/api/automations/${a.id}/run`, { body: {} }); toast("Testlauf gestartet", a.name); setTimeout(() => openRun(r.run_id), 400); } return; }
  renderEditor();
});
async function saveDraft() {
  readDraftFields();
  if (!draft.name.trim()) { toast("Name fehlt", "Gib der Automatisierung einen Namen.", true); $("#edName").focus(); return null; }
  const body = { name: draft.name, description: draft.description || "", enabled: draft.enabled, trigger: draft.trigger, steps: draft.steps };
  const a = draft.id ? await api(`/api/automations/${draft.id}`, { method: "PUT", body }) : await api("/api/automations", { body });
  state.autos.set(a.id, a);
  draft.id = a.id; draft.webhook_path = a.webhook_path;
  $("#autoEditor").close();
  if (state.page !== "automations") go("automations"); else renderAutomations();
  renderHud();
  toast("Gespeichert", a.name);
  return a;
}
$("#autoEditorBody").addEventListener("submit", (e) => { e.preventDefault(); saveDraft(); });

// ---------- runs ----------
async function openHistory(id) {
  const a = state.autos.get(id);
  const runs = await api(`/api/automations/${id}/runs`);
  const d = $("#runDialog"); d.dataset.run = "";
  $("#runDialogBody").innerHTML = `<div class="ed"><div class="ed-h">${ic("i-history")}<b style="flex:1">Verlauf · ${esc(a?.name || "")}</b><button class="icon-btn" onclick="this.closest('dialog').close()" aria-label="Schließen">${ic("i-x")}</button></div>
    <div class="ed-b" style="background:var(--bg-elev)"><div class="runs">${runs.map((r) => `<div class="run" data-run="${r.id}"><span class="t">${new Date(r.started_at * 1000).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
      <span class="vmeta">${esc(TRIGGERS[r.trigger?.type]?.label || "")} · ${r.results.length} Schritte</span><span class="dur vmeta">${r.finished_at ? Math.max(0, Math.round(r.finished_at - r.started_at)) + " s" : ""}</span>${statusChip(r.status)}</div>`).join("") || '<div class="li-s">Noch keine Läufe.</div>'}</div></div></div>`;
  if (!d.open) d.showModal();
}
async function openRun(id) {
  let r = state.runs.find((x) => x.id === id);
  if (!r) { const all = await api("/api/automations/runs?limit=60"); r = all.find((x) => x.id === id); }
  if (!r) return;
  const a = state.autos.get(r.automation_id);
  const d = $("#runDialog"); d.dataset.run = id;
  const fmt = (o) => typeof o === "string" ? o : JSON.stringify(o, null, 2);
  $("#runDialogBody").innerHTML = `<div class="ed"><div class="ed-h">${ic("i-history")}<div style="flex:1;min-width:0"><b>${esc(r.automation_name || a?.name || "")}</b><div class="vmeta">Lauf #${r.id} · ${new Date(r.started_at * 1000).toLocaleString("de-DE")} · ${esc(TRIGGERS[r.trigger?.type]?.label || "")}</div></div>${statusChip(r.status)}
    <button class="icon-btn" onclick="this.closest('dialog').close()" aria-label="Schließen">${ic("i-x")}</button></div>
    <div class="ed-b" style="background:var(--bg-elev)">
      ${r.trigger?.data && Object.keys(r.trigger.data).length ? `<div class="step-res"><b style="font-size:13px">Auslöser-Daten</b><pre>${esc(fmt(r.trigger.data))}</pre></div>` : ""}
      ${r.results.map((s) => `<div class="step-res"><div class="row">${stepIcon(s.type)}<b style="font-size:13px">${s.n}. ${esc(STEPS[s.type]?.label || s.type)}</b><span class="vmeta">${s.ms != null ? s.ms + " ms" : ""}</span>
        <span style="margin-left:auto">${{ ok: '<span class="chip green">OK</span>', error: '<span class="chip red">Fehler</span>', skipped: '<span class="chip">Bedingung nicht erfüllt</span>' }[s.status] || ""}</span></div>
        ${s.output !== undefined && s.output !== "" ? `<pre>${esc(fmt(s.output))}</pre>` : ""}</div>`).join("") || (r.status === "running" ? '<div class="li-s"><span class="spin"></span> Läuft …</div>' : '<div class="li-s">Keine Schritte.</div>')}
    </div>
    <div class="ed-f"><span class="grow"></span>${a ? `<button class="btn" data-rd="edit">${ic("i-edit")}Bearbeiten</button><button class="btn primary" data-rd="again">${ic("i-play")}Erneut ausführen</button>` : ""}</div></div>`;
  $$("[data-rd]", d).forEach((b) => b.addEventListener("click", async () => {
    if (b.dataset.rd === "edit") { d.close(); openEditor(a); }
    else { const res2 = await api(`/api/automations/${a.id}/run`, { body: {} }); toast("Gestartet", a.name); setTimeout(() => openRun(res2.run_id), 400); }
  }));
  if (!d.open) d.showModal();
}
$("#runDialogBody").addEventListener("click", (e) => { const r = e.target.closest(".runs [data-run]"); if (r) openRun(+r.dataset.run); });
