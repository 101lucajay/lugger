/* Lugger Agentenbasis – fixed top-down floor plan of the agent base (dashboard home).
 * No camera: the plan always fits its card. Departments are numbered in pipeline order,
 * agents work at their desks and carry each video (a tile) to the next department.
 * The Automations-Werk on the right hosts the automation robot. */
"use strict";
(function () {
  const TAU = Math.PI * 2;
  const W = 1600, H = 900, CY = 450;            // logical canvas, corridor centre line

  const ICONS = {
    trend_scout: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 12l6-6",
    producer: "M4 10h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M4 10l1-4.5 15 3-.6 1.5 M9.5 5.6l1.2 3.4 M14.5 6.6l1.2 3.4",
    script_writer: "M16.5 3.5l4 4L8 20l-5 1 1-5z M14 6l4 4",
    voice: "M9 5.5a3 3 0 0 1 6 0V11a3 3 0 0 1-6 0z M5.5 11a6.5 6.5 0 0 0 13 0 M12 17.5V21",
    visuals: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 20",
    editor: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.2 7.8L20 19.5 M8.2 16.2L20 4.5",
    publisher: "M21 3L10.5 13.5 M21 3l-6.5 18-4-7.5L3 9.5z",
    automator: "M7 8h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z M12 8V4 M9 13.5h.01 M15 13.5h.01 M9.5 17h5",
    approve: "M5 12.5l4.5 4.5L19 7.5",
  };
  const AGENT_COLOR = { trend_scout: "#0a84ff", producer: "#5e5ce6", script_writer: "#e8a000", voice: "#ff375f",
    visuals: "#30b45a", editor: "#ff6a2b", publisher: "#bf5af2", automator: "#00b3ab" };
  const PATHS = {};
  const path = (k) => (PATHS[k] ||= new Path2D(ICONS[k]));

  // ---------------- layout ----------------
  const RW = 290, RH = 345, GAP = 15, X0 = 20;
  const R = (key, step, name, sub, col, row, color, icon) => {
    const x = X0 + col * (RW + GAP), y = row === 0 ? 20 : 535;
    return { key, step, name, sub, color, icon, row, x, y, w: RW, h: RH,
      door: { x: x + RW / 2, y: row === 0 ? y + RH : y }, inside: { x: x + RW / 2, y: row === 0 ? y + RH - 40 : y + 60 } };
  };
  const ROOMS = [
    R("radar", 1, "Trend-Radar", "Ideen finden", 0, 0, "#0a84ff", "trend_scout"),
    R("leit", 2, "Leitstand", "Produktion planen", 1, 0, "#5e5ce6", "producer"),
    R("script", 3, "Schreibstube", "Skript schreiben", 2, 0, "#e8a000", "script_writer"),
    R("audio", 4, "Tonstudio", "Einsprechen", 3, 0, "#ff375f", "voice"),
    R("archive", 5, "Bildarchiv", "Material suchen", 0, 1, "#30b45a", "visuals"),
    R("cut", 6, "Schnitt & Render", "Video rendern", 1, 1, "#ff6a2b", "editor"),
    R("approve", 7, "Freigabe", "Deine Prüfung", 2, 1, "#ff9500", "approve"),
    R("send", 8, "Versand", "Hochladen", 3, 1, "#bf5af2", "publisher"),
  ];
  const AUTO = { key: "auto", name: "Automations-Werk", sub: "Deine Automatisierungen", color: "#00b3ab", x: 1240, y: 20, w: 340, h: 860,
    door: { x: 1240, y: CY }, inside: { x: 1290, y: CY } };
  const ROOM = Object.fromEntries([...ROOMS, AUTO].map((r) => [r.key, r]));
  const rel = (k, dx, dy) => ({ x: ROOM[k].x + dx, y: ROOM[k].y + dy });
  const HOME = {
    trend_scout: { room: "radar", ...rel("radar", 200, 250) }, producer: { room: "leit", ...rel("leit", 145, 250) },
    script_writer: { room: "script", ...rel("script", 145, 250) }, voice: { room: "audio", ...rel("audio", 95, 205) },
    visuals: { room: "archive", ...rel("archive", 200, 175) }, editor: { room: "cut", ...rel("cut", 145, 175) },
    publisher: { room: "send", ...rel("send", 200, 175) }, automator: { room: "auto", x: 1410, y: CY },
  };
  const INBOX = {
    radar: rel("radar", 30, 296), leit: rel("leit", 26, 296), script: rel("script", 26, 296), audio: rel("audio", 180, 296),
    archive: rel("archive", 26, 72), cut: rel("cut", 26, 72), approve: rel("approve", 78, 175), send: rel("send", 26, 72),
  };
  const STATUS_ROOM = { queued: "leit", scripting: "script", scripted: "script", voicing: "audio", voiced: "audio",
    sourcing: "archive", visuals_ready: "archive", rendering: "cut", rendered: "cut", awaiting_approval: "approve",
    rejected: "approve", approved: "send", publishing: "send", publish_failed: "send", published: "send", ready: "send" };
  const CARRIER = { radar: "producer", leit: "producer", script: "script_writer", audio: "voice", archive: "visuals",
    cut: "editor", approve: "publisher", send: "publisher" };
  const ERROR_ROOM = { "Skript-Autor": "script", "Sprecher": "audio", "Bild-Redakteur": "archive", "Cutter": "cut", "Publisher": "send" };
  const ROBOT_SPOTS = [{ x: 1320, y: 300 }, { x: 1320, y: 530 }, { x: 1320, y: 760 }];

  // ---------------- theme ----------------
  const PAL = {
    light: { ground: "#eef0f4", corr: "#e3e7ed", room: "#ffffff", wall: "#d9dde4", furn: "#f1f3f6", furn2: "#e6e9ee", line: "rgba(20,30,50,.08)",
      shadow: "rgba(25,35,55,.10)", text: "#1d1d1f", text2: "#6e6e73", text3: "#a1a1a6", screen: "#1c2230", bubble: "rgba(255,255,255,.96)",
      bubbleLine: "rgba(0,0,0,.08)", avatar: "#ffffff", flow: "rgba(0,111,255,.45)" },
    dark: { ground: "#0b0c0f", corr: "#15171c", room: "#1c1d21", wall: "#2f3138", furn: "#2a2c32", furn2: "#24262b", line: "rgba(255,255,255,.07)",
      shadow: "rgba(0,0,0,.5)", text: "#f5f5f7", text2: "#a1a1a6", text3: "#6e6e73", screen: "#0a0c12", bubble: "rgba(36,38,44,.96)",
      bubbleLine: "rgba(255,255,255,.1)", avatar: "#2c2c2e", flow: "rgba(10,132,255,.55)" },
  };
  let P = PAL.light;
  const isDark = () => { const t = document.documentElement.getAttribute("data-theme"); return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const roomAt = (p) => [...ROOMS, AUTO].find((r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) || null;

  // ---------------- state ----------------
  let canvas, ctx, opts, tip, layer, view = { s: 1, ox: 0, oy: 0 };
  const agents = {}, pkgs = new Map(), effects = [];
  let now = 0, t0 = performance.now(), running = false, selected = null;
  const srv = (k) => opts.getAgents()[k] || {};
  const working = (k) => srv(k).status === "working";
  const autoInfo = () => opts.getAutomation?.() || { active: [], recent: [], enabled: 0 };

  // ---------------- static layer ----------------
  function furn(c, x, y, w, h, r = 8, fill = P.furn) {
    c.save(); c.shadowColor = P.shadow; c.shadowBlur = 10; c.shadowOffsetY = 3; c.fillStyle = fill; rr(c, x, y, w, h, r); c.fill(); c.restore();
    c.strokeStyle = P.line; c.lineWidth = 1; rr(c, x + 0.5, y + 0.5, w - 1, h - 1, r); c.stroke();
  }
  function disc(c, x, y, r, fill = P.furn) {
    c.save(); c.shadowColor = P.shadow; c.shadowBlur = 10; c.shadowOffsetY = 3; c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore();
  }
  const screen = (c, x, y, w, h) => { c.fillStyle = P.screen; rr(c, x, y, w, h, 4); c.fill(); };
  function desk(c, x, y, w = 120) { furn(c, x - w / 2, y - 62, w, 40); screen(c, x - 26, y - 56, 52, 8); disc(c, x, y - 4, 12, P.furn2); }
  function plant(c, x, y) { disc(c, x, y, 13, P.furn2); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.fillStyle = i % 2 ? "#34c759" : "#28a745"; c.beginPath(); c.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 7, 3.6, a, 0, TAU); c.fill(); } }

  function buildLayer() {
    P = isDark() ? PAL.dark : PAL.light;
    const S = 2;
    layer = document.createElement("canvas"); layer.width = W * S; layer.height = H * S;
    const c = layer.getContext("2d"); c.scale(S, S);
    c.fillStyle = P.ground; c.fillRect(0, 0, W, H);
    // corridor with flow arrows
    c.fillStyle = P.corr; rr(c, 20, 380, 1225, 140, 14); c.fill();
    c.save(); c.setLineDash([2, 12]); c.lineCap = "round"; c.strokeStyle = P.flow; c.lineWidth = 3;
    c.beginPath(); c.moveTo(40, CY); c.lineTo(1230, CY); c.stroke(); c.restore();
    c.font = "600 12px -apple-system, BlinkMacSystemFont, Inter, sans-serif"; c.fillStyle = P.text3;
    c.fillText("HAUPTGANG", 36, 508);
    for (const r of ROOMS) drawRoom(c, r);
    drawAutoRoom(c);
  }
  function roomShell(c, r) {
    c.save(); c.shadowColor = P.shadow; c.shadowBlur = 16; c.shadowOffsetY = 4; c.fillStyle = P.room; rr(c, r.x, r.y, r.w, r.h, 16); c.fill(); c.restore();
    c.fillStyle = hexA(r.color, isDark() ? 0.07 : 0.045); rr(c, r.x, r.y, r.w, r.h, 16); c.fill();
    c.strokeStyle = P.wall; c.lineWidth = 2; rr(c, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 15); c.stroke();
    // doorway
    const dy = r.door.y - (r.row === 0 ? 3 : 1);
    if (r.key === "auto") { c.fillStyle = P.room; c.fillRect(r.x - 2, CY - 36, 6, 72); }
    else { c.fillStyle = P.room; c.fillRect(r.door.x - 36, dy, 72, 5); c.fillStyle = hexA(r.color, 0.6); c.fillRect(r.door.x - 38, dy, 3, 5); c.fillRect(r.door.x + 35, dy, 3, 5); }
  }
  function drawRoom(c, r) {
    roomShell(c, r);
    // header: step number, name, subtitle (status pill is drawn live)
    c.fillStyle = r.color; c.beginPath(); c.arc(r.x + 32, r.y + 34, 17, 0, TAU); c.fill();
    c.fillStyle = "#fff"; c.font = "700 17px -apple-system, BlinkMacSystemFont, Inter, sans-serif"; c.textAlign = "center"; c.fillText(String(r.step), r.x + 32, r.y + 40); c.textAlign = "left";
    c.fillStyle = P.text; c.font = "700 21px -apple-system, BlinkMacSystemFont, Inter, sans-serif"; c.fillText(r.name, r.x + 60, r.y + 32);
    c.fillStyle = P.text2; c.font = "500 14px -apple-system, Inter, sans-serif"; c.fillText(r.sub, r.x + 60, r.y + 53);
    c.save(); c.translate(r.x, r.y); FURN[r.key](c, r); c.restore();
  }
  const FURN = {
    radar(c) { disc(c, 85, 165, 62, P.screen); c.strokeStyle = "rgba(10,132,255,.35)"; c.lineWidth = 1; for (const k of [20, 40, 60]) { c.beginPath(); c.arc(85, 165, k, 0, TAU); c.stroke(); }
      furn(c, 168, 76, 104, 72, 8); desk(c, 200, 250); plant(c, 262, 312); },
    leit(c) { screen(c, 22, 72, 246, 50); disc(c, 145, 190, 36); disc(c, 145, 190, 20, P.room); desk(c, 145, 250, 140); plant(c, 262, 312); },
    script(c) { for (let i = 0; i < 3; i++) { furn(c, 22, 76 + i * 50, 30, 42, 5); ["#ff9f0a", "#0a84ff", "#30d158"].forEach((col, j) => { c.fillStyle = hexA(col, 0.65); c.fillRect(26 + j * 8, 80 + i * 50, 6, 34); }); }
      furn(c, 196, 80, 72, 44, 8); desk(c, 145, 250, 130); c.fillStyle = P.room; c.save(); c.translate(100, 194); c.rotate(-0.2); c.fillRect(0, 0, 14, 18); c.restore(); plant(c, 262, 312); },
    audio(c) { c.fillStyle = hexA("#64d2ff", 0.1); rr(c, 22, 74, 150, 158, 12); c.fill(); c.strokeStyle = hexA("#64d2ff", 0.55); c.lineWidth = 3; rr(c, 22, 74, 150, 158, 12); c.stroke();
      c.fillStyle = P.room; c.fillRect(75, 229, 44, 6); c.fillStyle = P.text3; c.beginPath(); c.arc(95, 150, 6, 0, TAU); c.fill();
      furn(c, 186, 92, 86, 74, 8); screen(c, 194, 100, 70, 44); },
    archive(c) { for (let r2 = 0; r2 < 3; r2++) { furn(c, 22, 110 + r2 * 50, 130, 30, 6); for (let k = 0; k < 6; k++) { c.fillStyle = P.line; c.beginPath(); c.arc(36 + k * 21, 125 + r2 * 50, 7, 0, TAU); c.fill(); } }
      desk(c, 200, 175 + 0, 110); plant(c, 262, 312); },
    cut(c) { furn(c, 60, 110, 170, 40); [0, 1, 2].forEach((i) => screen(c, 72 + i * 52, 116, 44, 8)); disc(c, 145, 171, 12, P.furn2);
      for (let i = 0; i < 4; i++) furn(c, 22 + i * 64, 236, 54, 80, 6, P.furn2); },
    approve(c) { furn(c, 60, 140, 170, 90, 14); c.fillStyle = P.text3; c.font = "600 10.5px -apple-system, Inter, sans-serif"; c.textAlign = "center"; c.fillText("PRÜFTISCH", 145, 250); c.textAlign = "left"; plant(c, 30, 312); plant(c, 262, 312); },
    send(c) { disc(c, 75, 250, 48); c.fillStyle = P.screen; c.beginPath(); c.arc(75, 250, 36, 0, TAU); c.fill();
      [["YT", "#ff3b30"], ["TT", "#25c2d6"], ["IG", "#e1306c"]].forEach(([t, col], i) => { furn(c, 140 + i * 46, 230, 38, 30, 7); c.fillStyle = col; c.font = "700 11px -apple-system, Inter, sans-serif"; c.textAlign = "center"; c.fillText(t, 159 + i * 46, 250); c.textAlign = "left"; });
      desk(c, 200, 175, 110); furn(c, 140, 300, 130, 22, 6, P.furn2); c.fillStyle = P.text3; c.font = "500 10px -apple-system, Inter, sans-serif"; c.fillText("Veröffentlicht", 140, 336); },
  };
  function drawAutoRoom(c) {
    const r = AUTO; roomShell(c, r);
    c.save(); c.translate(r.x, r.y);
    c.fillStyle = r.color; rr(c, 18, 18, 28, 28, 8); c.fill();
    c.save(); c.translate(20, 20); c.scale(1, 1); c.strokeStyle = "#fff"; c.lineWidth = 2; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(new Path2D("M13 2.5L4.5 13.5h6.5l-1 8 8.5-11h-6.5z")); c.restore();
    c.fillStyle = P.text; c.font = "700 21px -apple-system, BlinkMacSystemFont, Inter, sans-serif"; c.fillText(r.name, 56, 32);
    c.fillStyle = P.text2; c.font = "500 14px -apple-system, Inter, sans-serif"; c.fillText(r.sub, 56, 53);
    screen(c, 18, 70, 304, 140);
    furn(c, 238, 236, 60, 610, 10, P.furn2);                  // conveyor
    for (const s of ROBOT_SPOTS) disc(c, s.x - r.x - 40, s.y - r.y, 22, P.furn2);
    c.restore();
  }

  // ---------------- agents & packages ----------------
  function ensureAgent(key) {
    if (agents[key]) return agents[key];
    const h = HOME[key];
    return (agents[key] = { key, x: h.x, y: h.y, dir: -Math.PI / 2, path: [], jobs: [], job: null, carrying: null, moving: false, walk: 0,
      wanderAt: now + rnd(4, 10), lane: CY + ((Object.keys(agents).length % 3) - 1) * 22, srv: {} });
  }
  function route(a, to) {
    const from = roomAt(a), dest = roomAt(to);
    if (from && dest && from.key === dest.key) return [{ ...to }];
    const pts = [];
    if (from) pts.push(from.inside, from.door, { x: from.door.x, y: a.lane }); else pts.push({ x: a.x, y: a.lane });
    if (dest) pts.push({ x: dest.door.x, y: a.lane }, dest.door, dest.inside);
    pts.push(to);
    return pts.map((p) => ({ x: p.x + rnd(-3, 3), y: p.y + rnd(-3, 3) }));
  }
  const goTo = (a, to) => (a.path = route(a, to));
  function roomForVideo(v) {
    if (v.status === "failed") { const m = /^\[([^\]]+)\]/.exec(v.error || ""); return (m && ERROR_ROOM[m[1]]) || null; }
    return STATUS_ROOM[v.status] || null;
  }
  function makePkg(v, room) {
    const s = INBOX[room] || INBOX.leit;
    const p = { id: v.id, title: v.title || v.topic, status: v.status, room, x: s.x, y: s.y, moves: [], carriedBy: null, pending: false,
      launched: v.status === "published" || v.status === "ready", vis: true };
    pkgs.set(v.id, p); return p;
  }
  const lastDest = (p) => (p.moves.length ? p.moves[p.moves.length - 1] : p.room);
  function onVideo(v, prev) {
    let p = pkgs.get(v.id); const target = roomForVideo(v);
    if (!p) { if (!prev && v.status === "queued") { p = makePkg(v, "radar"); p.moves.push("leit"); } else p = makePkg(v, target || "leit"); }
    p.title = v.title || v.topic;
    const was = p.status; p.status = v.status;
    if (target && target !== lastDest(p)) p.moves.push(target);
    if (v.status === "published" && was !== "published") p.launchPending = true;
  }
  function onDeleted(id) { const p = pkgs.get(id); if (p?.carriedBy && agents[p.carriedBy]) agents[p.carriedBy].carrying = null; pkgs.delete(id); }
  function slotPositions() {
    const by = {};
    for (const p of pkgs.values()) if (!p.carriedBy && !p.launching) (by[p.room] ||= []).push(p);
    for (const [room, list] of Object.entries(by)) {
      list.sort((a, b) => a.id - b.id);
      let shown = list;
      if (room === "send") {
        const done = list.filter((p) => p.launched && !p.launchPending);
        shown = list.filter((p) => !(p.launched && !p.launchPending));
        done.forEach((p) => (p.vis = false));
        done.slice(-6).forEach((p, i) => { const s = rel("send", 152 + i * 20, 311); p.tx = s.x; p.ty = s.y; p.vis = true; p.small = true; });
      }
      const b = INBOX[room] || rel(room, 30, 70), cols = room === "approve" ? 5 : 4;
      shown.forEach((p, i) => { p.tx = b.x + (i % cols) * 34; p.ty = b.y + Math.floor(i / cols) * 36; p.vis = true; p.small = false; });
    }
  }

  // ---------------- simulation ----------------
  let robotSpot = 0, robotNext = 0, lastActive = 0;
  function step(dt) {
    for (const p of pkgs.values()) {
      if (p.pending || p.carriedBy || !p.moves.length) continue;
      const a = ensureAgent(CARRIER[p.room] || "producer"); p.pending = true; a.jobs.push({ pkg: p.id, to: p.moves[0] });
    }
    slotPositions();
    for (const k of Object.keys(HOME)) ensureAgent(k);
    const au = autoInfo();
    for (const a of Object.values(agents)) {
      a.srv = a.key === "automator" ? { name: "Automator", status: au.active.length ? "working" : "idle", task: au.active.length ? `Führt „${au.active[0].name}“ aus` : "Bereit" } : srv(a.key);
      if (a.key === "automator") {
        const act = au.active.length;
        if (act && !a.path.length && now > robotNext) { robotSpot = (robotSpot + 1) % 3; a.path = [{ ...ROBOT_SPOTS[robotSpot] }]; robotNext = now + 1.4; }
        if (!act && lastActive) { a.path = [{ ...HOME.automator }]; effects.push({ kind: "check", x: a.x, y: a.y, t: now, life: 1.4, ok: (au.recent[0]?.status || "success") !== "error" }); }
        lastActive = act; move(a, dt); continue;
      }
      if (!a.job && a.jobs.length) {
        a.job = a.jobs.shift(); a.job.phase = "pickup";
        const p = pkgs.get(a.job.pkg); if (!p) { a.job = null; continue; }
        goTo(a, { x: (p.tx ?? p.x) + 10, y: (p.ty ?? p.y) + 22 });
      }
      if (a.job && !a.path.length) {
        const p = pkgs.get(a.job.pkg);
        if (!p) { a.job = null; a.carrying = null; }
        else if (a.job.phase === "pickup") {
          p.carriedBy = a.key; a.carrying = p.id; a.job.phase = "deliver";
          const b = INBOX[a.job.to]; goTo(a, { x: b.x + rnd(10, 70), y: b.y + 26 });
        } else {
          p.carriedBy = null; a.carrying = null; p.pending = false;
          p.room = p.moves.shift() || a.job.to; p.x = a.x; p.y = a.y;
          effects.push({ kind: "ring", x: a.x, y: a.y, t: now, color: ROOM[p.room].color });
          if (p.room === "send" && p.launchPending) { p.launchPending = false; p.launching = true; effects.push({ kind: "launch", p, t: now, life: 2.6, x: ROOM.send.x + 75, y: ROOM.send.y + 250, sx: p.x, sy: p.y }); }
          a.job = null; if (!a.jobs.length) goTo(a, HOME[a.key]);
        }
      }
      if (!a.job && !a.path.length) {
        const h = HOME[a.key], atHome = dist(a, h) < 3, st = a.srv.status;
        if (st === "working" || st === "paused" || a.jobs.length) { if (!atHome) goTo(a, h); }
        else if (now > a.wanderAt) {
          a.wanderAt = now + rnd(7, 15); const r = ROOM[h.room];
          if (atHome && Math.random() < 0.5) { a.path = [{ x: rnd(r.x + 50, r.x + r.w - 50), y: r.row === 0 ? rnd(r.y + 200, r.y + 320) : rnd(r.y + 90, r.y + 200) }]; a.slow = true; }
          else if (!atHome) { goTo(a, h); a.slow = true; }
        }
      }
      move(a, dt);
    }
    for (const p of pkgs.values()) {
      if (p.launching) continue;
      if (p.carriedBy && agents[p.carriedBy]) { const a = agents[p.carriedBy]; p.x = a.x + Math.cos(a.dir) * 22; p.y = a.y + Math.sin(a.dir) * 22; }
      else if (p.tx != null) { const k = Math.min(1, dt * 6); p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; }
    }
    for (let i = effects.length - 1; i >= 0; i--) if (now - effects[i].t > (effects[i].life || 1.2)) effects.splice(i, 1);
  }
  function move(a, dt) {
    a.moving = false;
    if (!a.path.length) return;
    const t = a.path[0], carried = a.carrying != null ? pkgs.get(a.carrying) : null;
    const behind = Math.max(0, carried ? carried.moves.length - 1 : 0);
    const speed = a.slow && !a.job ? 55 : (230 + a.jobs.length * 70) * (1 + 0.9 * behind);
    const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy);
    if (d < speed * dt + 0.5) { a.x = t.x; a.y = t.y; a.path.shift(); if (!a.path.length) a.slow = false; }
    else { a.x += (dx / d) * speed * dt; a.y += (dy / d) * speed * dt; }
    if (d > 0.5) { a.dir = Math.atan2(dy, dx); a.moving = true; a.walk += dt * speed / 16; }
  }

  // ---------------- live drawing ----------------
  function drawLive(c) {
    const ag = opts.getAgents(), st = opts.getStats() || {}, au = autoInfo();
    // corridor pulses
    for (let i = 0; i < 16; i++) { const x = 40 + ((i * 80 + now * 80) % 1190); c.fillStyle = P.flow; c.beginPath(); c.arc(x, CY, 3, 0, TAU); c.fill(); }
    // radar sweep
    { const r = ROOM.radar, cx = r.x + 85, cy = r.y + 165, a = now * (working("trend_scout") ? 3 : 0.7);
      if (c.createConicGradient) { const g = c.createConicGradient(a, cx, cy); g.addColorStop(0, "rgba(10,132,255,.6)"); g.addColorStop(0.1, "rgba(10,132,255,0)"); g.addColorStop(1, "rgba(10,132,255,0)"); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, 60, 0, TAU); c.fill(); }
      const n = Math.min(st.ideas || 0, 12), cols = ["#ffd60a", "#ffb340", "#7ee081", "#7cc7ff", "#ff9fd0"];
      for (let i = 0; i < n; i++) { c.fillStyle = cols[i % 5]; rr(c, r.x + 176 + (i % 4) * 23, r.y + 84 + Math.floor(i / 4) * 21, 18, 16, 2); c.fill(); } }
    // leitstand screen
    { const r = ROOM.leit; const slot = ag.producer?.next_slot ? new Date(ag.producer.next_slot).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "Autopilot aus";
      c.font = "700 14px -apple-system, Inter, sans-serif"; c.fillStyle = "#e5e5ea"; c.fillText(`Nächstes Video: ${slot}`, r.x + 34, r.y + 96);
      c.font = "500 12.5px -apple-system, Inter, sans-serif"; c.fillStyle = "#8e8e93"; c.fillText(`Arbeit ${st.in_production ?? 0} · Freigabe ${st.awaiting_approval ?? 0} · Online ${st.published ?? 0}`, r.x + 34, r.y + 114); }
    // studio
    { const r = ROOM.audio, on = working("voice");
      for (let i = 0; i < 9; i++) { const l = on ? 0.25 + 0.75 * Math.abs(Math.sin(now * (5 + i * 0.7) + i)) : 0.12; c.fillStyle = l > 0.8 ? "#ff375f" : "#30d158"; rr(c, r.x + 198 + i * 7, r.y + 140 - l * 34, 4, l * 34, 1); c.fill(); }
      c.fillStyle = on ? (Math.sin(now * 6) > -0.3 ? "#ff3b30" : "#8a1f1a") : P.line; rr(c, r.x + 190, r.y + 180, 78, 24, 12); c.fill();
      c.font = "700 11px -apple-system, Inter, sans-serif"; c.fillStyle = on ? "#fff" : P.text3; c.fillText("ON AIR", r.x + 207, r.y + 196); }
    // render screens + farm leds
    { const r = ROOM.cut, on = working("editor");
      [0, 1, 2].forEach((i) => { c.fillStyle = on ? ["#ff6a2b", "#0a84ff", "#ffcc00"][i] : "#3a3a3c"; rr(c, r.x + 74 + i * 52, r.y + 117, 40, 6, 2); c.fill(); });
      for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) { const lit = on ? Math.sin(now * (7 + j) + i * 2 + j) > 0.1 : (i + j + Math.floor(now / 2)) % 7 === 0; c.fillStyle = lit ? (on ? "#ff9a3d" : "#34c759") : P.line; c.beginPath(); c.arc(r.x + 36 + i * 64 + (j % 3) * 12, r.y + 252 + Math.floor(j / 3) * 18 + (j % 2) * 8, 3, 0, TAU); c.fill(); }
      const pr = ag.editor?.progress; if (on && pr != null) { c.fillStyle = P.line; rr(c, r.x + 60, r.y + 210, 170, 6, 3); c.fill(); c.fillStyle = "#ff6a2b"; rr(c, r.x + 60, r.y + 210, 170 * pr / 100, 6, 3); c.fill(); } }
    // archive scan
    if (working("visuals")) { const r = ROOM.archive, row = Math.floor(now * 1.3) % 3, x = r.x + 26 + ((now * 120) % 120); c.fillStyle = "rgba(48,180,90,.3)"; rr(c, x, r.y + 106 + row * 50, 14, 38, 4); c.fill(); }
    // uplink glow
    { const r = ROOM.send, on = working("publisher"), g = c.createRadialGradient(r.x + 75, r.y + 250, 3, r.x + 75, r.y + 250, 36); g.addColorStop(0, on ? "rgba(191,90,242,.8)" : "rgba(191,90,242,.2)"); g.addColorStop(1, "rgba(191,90,242,0)"); c.fillStyle = g; c.beginPath(); c.arc(r.x + 75, r.y + 250, 36, 0, TAU); c.fill(); }
    // approval highlight
    { const r = ROOM.approve, waiting = [...pkgs.values()].filter((p) => p.room === "approve" && p.status === "awaiting_approval" && !p.carriedBy).length;
      if (waiting) { c.strokeStyle = `rgba(255,149,0,${0.45 + 0.4 * Math.sin(now * 4)})`; c.lineWidth = 4; rr(c, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 14); c.stroke();
        const t = waiting === 1 ? "1 Video wartet – klicken" : `${waiting} Videos warten – klicken`; c.font = "700 14px -apple-system, Inter, sans-serif"; const w = c.measureText(t).width + 28;
        c.fillStyle = "#ff9500"; rr(c, r.x + r.w / 2 - w / 2, r.y + 280, w, 30, 15); c.fill(); c.fillStyle = "#fff"; c.textAlign = "center"; c.fillText(t, r.x + r.w / 2, r.y + 300); c.textAlign = "left"; } }
    // automations board + conveyor + arms
    { const r = AUTO, act = au.active.length;
      c.font = "700 13px -apple-system, Inter, sans-serif"; c.fillStyle = "#7dfff6"; c.fillText(`${au.enabled ?? 0} AKTIV${act ? ` · ${act} LÄUFT` : ""}`, r.x + 32, r.y + 96);
      const rows = [...au.active.map((x) => ({ name: x.name, status: "running" })), ...au.recent].slice(0, 4);
      rows.forEach((x, i) => { const col = { running: "#0a84ff", success: "#30d158", skipped: "#8e8e93", error: "#ff3b30" }[x.status] || "#8e8e93";
        c.fillStyle = col; c.beginPath(); c.arc(r.x + 37, r.y + 118 + i * 22, 4, 0, TAU); c.fill(); c.fillStyle = "#e5e5ea"; c.font = "500 14px -apple-system, Inter, sans-serif"; c.fillText((x.name || "").slice(0, 30), r.x + 48, r.y + 123 + i * 22); });
      if (!rows.length) { c.fillStyle = "#8e8e93"; c.font = "500 14px -apple-system, Inter, sans-serif"; c.fillText("Noch keine Läufe", r.x + 32, r.y + 123); }
      for (let k = 0; k < 20; k++) { const y = r.y + 240 + ((k * 30 + now * (act ? 90 : 14)) % 600); c.fillStyle = P.line; c.fillRect(r.x + 242, y, 52, 5); }
      ROBOT_SPOTS.forEach((s, i) => { const bx = s.x - 40, by = s.y, sp = act ? 2.6 : 0.6, a1 = -0.4 + Math.sin(now * sp + i * 1.7) * 0.6, a2 = Math.sin(now * sp * 1.3 + i) * 0.8;
        const j1 = { x: bx + Math.cos(a1) * 34, y: by + Math.sin(a1) * 34 }, j2 = { x: j1.x + Math.cos(a1 + a2) * 30, y: j1.y + Math.sin(a1 + a2) * 30 };
        c.lineCap = "round"; c.strokeStyle = "#00b3ab"; c.lineWidth = 9; c.beginPath(); c.moveTo(bx, by); c.lineTo(j1.x, j1.y); c.stroke(); c.lineWidth = 6; c.beginPath(); c.moveTo(j1.x, j1.y); c.lineTo(j2.x, j2.y); c.stroke();
        c.fillStyle = act ? "#7dfff6" : "#5a6a70"; c.beginPath(); c.arc(j2.x, j2.y, 4.5, 0, TAU); c.fill(); }); }
    // status pills on rooms
    for (const r of [...ROOMS, AUTO]) {
      let s = "idle";
      if (r.key === "approve") s = [...pkgs.values()].some((p) => p.status === "awaiting_approval") ? "waiting" : "idle";
      else if (r.key === "auto") s = au.active.length ? "working" : "idle";
      else s = ag[r.icon]?.status || "idle";
      const label = { working: "Aktiv", idle: "Bereit", paused: "Pausiert", error: "Störung", waiting: "Wartet" }[s] || s;
      const col = { working: "#0a84ff", idle: "#34c759", paused: "#8e8e93", error: "#ff3b30", waiting: "#ff9500" }[s] || "#8e8e93";
      c.font = "600 13px -apple-system, Inter, sans-serif";
      const w = c.measureText(label).width + 30, x = r.x + r.w - w - 12, y = r.y + 36;
      c.fillStyle = hexA(col, 0.14); rr(c, x, y, w, 24, 12); c.fill();
      c.fillStyle = col; c.beginPath(); c.arc(x + 12, y + 12, 4 + (s === "working" ? Math.sin(now * 5) * 0.8 : 0), 0, TAU); c.fill(); c.fillText(label, x + 21, y + 16.5);
      if (s === "error") { c.fillStyle = `rgba(255,59,48,${0.05 + 0.04 * Math.sin(now * 5)})`; rr(c, r.x, r.y, r.w, r.h, 16); c.fill(); }
      if (s === "paused") { c.fillStyle = hexA(isDark() ? "#000000" : "#ffffff", 0.4); rr(c, r.x, r.y + 56, r.w, r.h - 56, 16); c.fill(); }
    }
    // effects (rings) below agents
    for (const e of effects) if (e.kind === "ring") { const k = (now - e.t) / 1.2; c.strokeStyle = hexA(e.color, 1 - k); c.lineWidth = 2.5; c.beginPath(); c.arc(e.x, e.y, 14 + k * 34, 0, TAU); c.stroke(); }
    for (const p of pkgs.values()) if (p.vis !== false && !p.launching && !p.carriedBy) drawTile(c, p);
    const order = Object.values(agents).sort((a, b) => a.y - b.y);
    for (const a of order) drawAgent(c, a);
    for (const p of pkgs.values()) if (p.carriedBy) drawTile(c, p);
    for (const e of effects) if (e.kind !== "ring") drawEffect(c, e);
    for (const a of order) drawBubble(c, a);
  }
  function tileColor(s) { return s === "failed" || s === "publish_failed" ? "#ff3b30" : s === "awaiting_approval" ? "#ff9500" : s === "published" || s === "ready" ? "#34c759" : s === "rejected" ? "#8e8e93" : "#0a84ff"; }
  function drawTile(c, p, at) {
    const x = at?.x ?? p.x, y = at?.y ?? p.y, col = tileColor(p.status), sz = p.small ? 16 : 24;
    if (p.status === "awaiting_approval" && !p.carriedBy) { c.fillStyle = `rgba(255,149,0,${0.18 + 0.12 * Math.sin(now * 5)})`; c.beginPath(); c.arc(x, y, 18, 0, TAU); c.fill(); }
    c.save(); c.shadowColor = "rgba(0,0,0,.22)"; c.shadowBlur = 5; c.shadowOffsetY = 2; c.fillStyle = P.avatar; rr(c, x - sz / 2, y - sz / 2, sz, sz, 5); c.fill(); c.restore();
    c.strokeStyle = col; c.lineWidth = 2; rr(c, x - sz / 2, y - sz / 2, sz, sz, 5); c.stroke();
    c.fillStyle = col; c.beginPath(); c.moveTo(x - sz * 0.14, y - sz * 0.22); c.lineTo(x + sz * 0.24, y); c.lineTo(x - sz * 0.14, y + sz * 0.22); c.closePath(); c.fill();
    if (!p.small) { c.font = "600 12px -apple-system, Inter, sans-serif"; c.fillStyle = P.text2; c.textAlign = "center"; c.fillText(`#${p.id}`, x, y + sz / 2 + 14); c.textAlign = "left"; }
  }
  function drawAgent(c, a) {
    const col = AGENT_COLOR[a.key], s = a.srv.status, busy = s === "working" && !a.moving && !a.job;
    c.save(); c.translate(a.x, a.y);
    if (s === "paused") c.globalAlpha = 0.5;
    if (busy) { c.fillStyle = hexA(col, 0.16 + 0.08 * Math.sin(now * 4)); c.beginPath(); c.arc(0, 0, 32 + 2 * Math.sin(now * 4), 0, TAU); c.fill(); }
    if (a.moving) { const g = c.createRadialGradient(0, 0, 5, 0, 0, 46); g.addColorStop(0, hexA(col, 0.35)); g.addColorStop(1, hexA(col, 0)); c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 46, a.dir - 0.5, a.dir + 0.5); c.closePath(); c.fill(); }
    const bob = a.moving ? -Math.abs(Math.sin(a.walk)) * 3 : 0;
    c.fillStyle = "rgba(0,0,0,.16)"; c.beginPath(); c.ellipse(0, 18, 13, 4, 0, 0, TAU); c.fill();
    c.translate(0, bob);
    c.shadowColor = "rgba(0,0,0,.22)"; c.shadowBlur = 8; c.shadowOffsetY = 2;
    c.fillStyle = P.avatar; c.beginPath(); c.arc(0, 0, 22, 0, TAU); c.fill(); c.shadowColor = "transparent";
    c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 22, 0, TAU); c.stroke();
    if (selected === a.key) { c.strokeStyle = hexA(col, 0.7); c.lineWidth = 2; c.setLineDash([3, 4]); c.beginPath(); c.arc(0, 0, 25, now, now + TAU); c.stroke(); c.setLineDash([]); }
    c.save(); c.translate(-13.2, -13.2); c.scale(1.1, 1.1); c.strokeStyle = col; c.lineWidth = 2.2; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(path(a.key)); c.restore();
    if (s === "error") { c.fillStyle = "#ff3b30"; c.beginPath(); c.arc(13, -13, 7, 0, TAU); c.fill(); c.fillStyle = "#fff"; c.font = "800 10px sans-serif"; c.textAlign = "center"; c.fillText("!", 13, -9.5); c.textAlign = "left"; }
    c.restore();
    // name label
    c.font = "600 14px -apple-system, BlinkMacSystemFont, Inter, sans-serif"; c.textAlign = "center";
    const name = a.srv.name || a.key, w = c.measureText(name).width + 14;
    c.fillStyle = hexA(isDark() ? "#000000" : "#ffffff", 0.8); rr(c, a.x - w / 2, a.y + 28 + bob, w, 21, 10.5); c.fill();
    c.fillStyle = P.text; c.fillText(name, a.x, a.y + 43 + bob); c.textAlign = "left";
    if (a.carrying != null) { const p = pkgs.get(a.carrying); if (p) drawTile(c, p); }
  }
  function drawBubble(c, a) {
    const s = a.srv.status;
    let text = null, col = P.text;
    if (a.job) text = a.job.phase === "pickup" ? "Holt Video …" : `Bringt #${a.job.pkg} → ${ROOM[a.job.to].name}`;
    else if (s === "working") text = a.srv.task;
    else if (s === "error") { text = a.srv.task || "Fehler"; col = "#ff3b30"; }
    if (!text) return;
    text = text.length > 30 ? text.slice(0, 29) + "…" : text;
    c.font = "600 15px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
    const bw = c.measureText(text).width + 34, bh = 32, x = Math.max(6, Math.min(W - bw - 6, a.x - bw / 2)), y = a.y - 72;
    c.save(); c.shadowColor = "rgba(0,0,0,.14)"; c.shadowBlur = 10; c.shadowOffsetY = 2; c.fillStyle = P.bubble; rr(c, x, y, bw, bh, 13); c.fill(); c.restore();
    c.strokeStyle = P.bubbleLine; c.lineWidth = 1; rr(c, x, y, bw, bh, 13); c.stroke();
    c.fillStyle = AGENT_COLOR[a.key]; c.beginPath(); c.arc(x + 14, y + bh / 2, 4.5, 0, TAU); c.fill();
    c.fillStyle = col; c.fillText(text, x + 24, y + 21);
    if (s === "working" && !a.job && a.srv.progress != null) { c.fillStyle = P.line; rr(c, x + 12, y + bh - 4, bw - 24, 2, 1); c.fill(); c.fillStyle = AGENT_COLOR[a.key]; rr(c, x + 12, y + bh - 4, (bw - 24) * a.srv.progress / 100, 2, 1); c.fill(); }
  }
  function drawEffect(c, e) {
    const k = (now - e.t) / (e.life || 1.2);
    if (e.kind === "check") { c.globalAlpha = 1 - k; c.fillStyle = e.ok ? "#34c759" : "#ff3b30"; c.beginPath(); c.arc(e.x, e.y - 40 - k * 20, 12, 0, TAU); c.fill(); c.globalAlpha = 1; }
    if (e.kind === "launch") {
      const p = e.p;
      if (k < 0.3) { const q = k / 0.3; drawTile(c, p, { x: e.sx + (e.x - e.sx) * q, y: e.sy + (e.y - e.sy) * q }); }
      else { const q = (k - 0.3) / 0.7; for (let i = 0; i < 3; i++) { c.strokeStyle = `rgba(191,90,242,${(1 - q) * (1 - i * 0.3)})`; c.lineWidth = 3; c.beginPath(); c.arc(e.x, e.y, 20 + q * 70 + i * 14, 0, TAU); c.stroke(); }
        c.globalAlpha = 1 - q; c.fillStyle = "#34c759"; c.font = "700 15px -apple-system, Inter, sans-serif"; c.fillText("Online!", e.x + 46, e.y - 24 - q * 20); c.globalAlpha = 1; }
      if (k >= 0.99) { p.launching = false; p.launched = true; }
    }
  }

  // ---------------- frame & input (no camera: always fits) ----------------
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect(); if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
    const s = Math.min(r.width / W, r.height / H);
    view = { s, ox: (r.width - W * s) / 2, oy: (r.height - H * s) / 2 };
  }
  function frame() {
    if (!running) return;
    const tn = performance.now(), dt = Math.min(0.05, (tn - t0) / 1000); t0 = tn; now += dt;
    step(dt);
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = P.ground; ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.translate(view.ox, view.oy); ctx.scale(view.s, view.s);
    ctx.drawImage(layer, 0, 0, W, H);
    drawLive(ctx);
    requestAnimationFrame(frame);
  }
  function toWorld(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - view.ox) / view.s, y: (e.clientY - r.top - view.oy) / view.s }; }
  function hit(w) {
    for (const a of Object.values(agents)) if (dist(a, w) < 26) return { type: "agent", a };
    for (const p of pkgs.values()) if (p.vis !== false && !p.carriedBy && !p.launching && dist(p, w) < 14) return { type: "pkg", p };
    const r = roomAt(w); return r ? { type: "room", r } : null;
  }
  function bindInput() {
    canvas.addEventListener("mousemove", (e) => {
      const h = hit(toWorld(e));
      const waiting = [...pkgs.values()].some((p) => p.status === "awaiting_approval");
      canvas.style.cursor = h && (h.type !== "room" || h.r.key === "auto" || (h.r.key === "approve" && waiting)) ? "pointer" : "default";
      if (h?.type === "pkg") showTip(e, `#${h.p.id} · ${h.p.title}`);
      else if (h?.type === "agent") showTip(e, `${h.a.srv.name || h.a.key} · ${h.a.srv.task || ""}`);
      else if (h?.type === "room") showTip(e, h.r.step ? `${h.r.step}. ${h.r.name} – ${h.r.sub}` : `${h.r.name} – ${h.r.sub}`);
      else tip.hidden = true;
    });
    canvas.addEventListener("mouseleave", () => (tip.hidden = true));
    canvas.addEventListener("click", (e) => {
      const h = hit(toWorld(e));
      if (h?.type === "pkg") opts.openVideo(h.p.id);
      else if (h?.type === "agent") { selected = h.a.key; opts.onAgent?.(h.a.key); }
      else if (h?.type === "room" && h.r.key === "approve") { const w = [...pkgs.values()].filter((p) => p.status === "awaiting_approval").sort((a, b) => a.id - b.id)[0]; if (w) opts.openVideo(w.id); }
      else if (h?.type === "room" && h.r.key === "auto") opts.onAutomations?.();
      else if (h?.type === "room" && h.r.icon && agents[h.r.icon]) { selected = h.r.icon; opts.onAgent?.(h.r.icon); }
    });
    new ResizeObserver(resize).observe(canvas.parentElement);
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", buildLayer);
    new MutationObserver(buildLayer).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  function showTip(e, text) {
    const r = canvas.parentElement.getBoundingClientRect();
    tip.hidden = false; tip.textContent = text.length > 90 ? text.slice(0, 89) + "…" : text;
    tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 230) + "px"; tip.style.top = e.clientY - r.top + 16 + "px";
  }

  window.Base = {
    ICONS, AGENT_COLOR,
    init(container, options) {
      opts = options;
      container.insertAdjacentHTML("afterbegin", `<canvas class="base-canvas" aria-label="Live-Grundriss der Agentenbasis"></canvas><div class="base-tip glass" hidden></div>`);
      canvas = container.querySelector(".base-canvas"); ctx = canvas.getContext("2d"); tip = container.querySelector(".base-tip");
      buildLayer(); bindInput();
    },
    loadVideos(list) {
      const sorted = [...list].sort((a, b) => a.id - b.id);
      const done = sorted.filter((v) => v.status === "published" || v.status === "ready").slice(-6).map((v) => v.id);
      for (const v of sorted) { if ((v.status === "published" || v.status === "ready") && !done.includes(v.id)) continue; makePkg(v, roomForVideo(v) || "leit"); }
    },
    video: onVideo, deleted: onDeleted,
    select(key) { selected = key; }, deselect() { selected = null; },
    start() { if (!running) { running = true; t0 = performance.now(); resize(); requestAnimationFrame(frame); } },
    stop() { running = false; },
  };
})();
