/* Lugger Produktionsstraße – side view of the video assembly line (dashboard home).
 * Like a car plant, but the product is a video: it rides a conveyor from station to station
 * and visibly gets assembled (idea → plan → script → voice → footage → video → QA → shipping).
 * Agents (in suits, sunglasses and earpieces) work behind the belt. The view is fixed in height;
 * swipe / drag / scroll horizontally to move along the line. */
"use strict";
(function () {
  const TAU = Math.PI * 2;
  const WH = 900, SW = 600, MARGIN = 220, N = 9;
  const WW = MARGIN * 2 + SW * N;
  const FLOOR = 790, BELT = 612, FEET = 724;           // y of floor, belt top, agents' feet
  const cx = (i) => MARGIN + SW * i + SW / 2;

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
  const LOOK = {   // skin, hair colour, hair style
    trend_scout: ["#f1c27d", "#2b1d12", "short"], producer: ["#8d5524", "#111111", "buzz"], script_writer: ["#ffdbac", "#a0522d", "long"],
    voice: ["#e0ac69", "#1b1b1b", "bun"], visuals: ["#c68642", "#3a2a1a", "short"], editor: ["#f1c27d", "#d9b26b", "side"], publisher: ["#ffdbac", "#4a3020", "long"],
  };
  const PATHS = {};
  const path = (k) => (PATHS[k] ||= new Path2D(ICONS[k]));

  const ST = [
    { key: "radar", n: 1, name: "Trend-Radar", sub: "Ideen finden", color: "#0a84ff", agent: "trend_scout" },
    { key: "leit", n: 2, name: "Leitstand", sub: "Produktion planen", color: "#5e5ce6", agent: "producer" },
    { key: "script", n: 3, name: "Schreibstube", sub: "Skript schreiben", color: "#e8a000", agent: "script_writer" },
    { key: "audio", n: 4, name: "Tonstudio", sub: "Stimme einsprechen", color: "#ff375f", agent: "voice" },
    { key: "archive", n: 5, name: "Bildarchiv", sub: "Material suchen", color: "#30b45a", agent: "visuals" },
    { key: "cut", n: 6, name: "Schnitt & Render", sub: "Video rendern", color: "#ff6a2b", agent: "editor" },
    { key: "approve", n: 7, name: "Prüfung", sub: "Deine Freigabe", color: "#ff9500", agent: null },
    { key: "send", n: 8, name: "Versand", sub: "Hochladen", color: "#bf5af2", agent: "publisher" },
    { key: "auto", n: null, name: "Automations-Werk", sub: "Deine Automatisierungen", color: "#00b3ab", agent: "automator" },
  ];
  const SI = Object.fromEntries(ST.map((s, i) => [s.key, i]));
  const STATUS_ST = { queued: 1, scripting: 2, scripted: 2, voicing: 3, voiced: 3, sourcing: 4, visuals_ready: 4, rendering: 5, rendered: 5,
    awaiting_approval: 6, rejected: 6, approved: 7, publishing: 7, publish_failed: 7, published: 8, ready: 8 };
  const ERROR_ST = { "Skript-Autor": 2, "Sprecher": 3, "Bild-Redakteur": 4, "Cutter": 5, "Publisher": 7 };

  // ---------------- theme ----------------
  const PAL = {
    light: { sky1: "#eef1f5", sky2: "#e2e6ec", wall: "#f6f7f9", wall2: "#e9ecf1", panel: "#ffffff", line: "rgba(20,30,50,.09)", floor1: "#d9dde4", floor2: "#c9ced7",
      steel: "#c3c9d2", steel2: "#a9b0bb", dark: "#2a2f38", belt: "#30353e", screen: "#141a26", text: "#1d1d1f", text2: "#6e6e73", shadow: "rgba(20,30,50,.16)",
      bubble: "rgba(255,255,255,.97)", bubbleLine: "rgba(0,0,0,.08)", lamp: "rgba(255,250,235,.55)", suit: "#1f2430", suit2: "#2c3342", night: false },
    dark: { sky1: "#0b0d12", sky2: "#07080b", wall: "#151820", wall2: "#10131a", panel: "#1b1f28", line: "rgba(255,255,255,.06)", floor1: "#141720", floor2: "#0c0e13",
      steel: "#3a404c", steel2: "#2b3039", dark: "#0e1015", belt: "#1a1d24", screen: "#080b12", text: "#f5f5f7", text2: "#a1a1a6", shadow: "rgba(0,0,0,.5)",
      bubble: "rgba(34,36,42,.97)", bubbleLine: "rgba(255,255,255,.1)", lamp: "rgba(120,170,255,.16)", suit: "#11141b", suit2: "#1c212b", night: true },
  };
  let P = PAL.light;
  const isDark = () => { const t = document.documentElement.getAttribute("data-theme"); return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const m = (c) => Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f)); return `rgb(${m(n >> 16)},${m((n >> 8) & 255)},${m(n & 255)})`; }
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

  // ---------------- state ----------------
  let wrap, canvas, ctx, opts, tip, nav, arrows, layer, layerS = 1;
  let scale = 1, scrollX = 0, targetX = null, vel = 0, follow = true, dragging = false;
  let now = 0, t0 = performance.now(), running = false, selected = null, beltPhase = 0, lastFocus = 1;
  const agents = {}, items = new Map(), effects = [];
  const srv = (k) => opts.getAgents()[k] || {};
  const working = (k) => srv(k).status === "working";
  const autoInfo = () => opts.getAutomation?.() || { active: [], recent: [], enabled: 0 };
  const viewW = () => canvas.width / (window.devicePixelRatio || 1) / scale;

  // ---------------- static layer (hall, machines, belt) ----------------
  function buildLayer() {
    P = isDark() ? PAL.dark : PAL.light;
    layerS = clamp((window.devicePixelRatio || 1) * scale, 0.8, 1.6);
    layer = document.createElement("canvas");
    layer.width = Math.ceil(WW * layerS); layer.height = Math.ceil(WH * layerS);
    const c = layer.getContext("2d"); c.scale(layerS, layerS);
    // back wall & ceiling
    const g = c.createLinearGradient(0, 0, 0, FLOOR); g.addColorStop(0, P.sky2); g.addColorStop(1, P.wall);
    c.fillStyle = g; c.fillRect(0, 0, WW, FLOOR);
    for (let x = 0; x < WW; x += 150) { c.fillStyle = P.line; c.fillRect(x, 150, 2, FLOOR - 150); }               // wall panel joints
    c.fillStyle = P.wall2; c.fillRect(0, 150, WW, 14);
    // ceiling trusses
    c.strokeStyle = P.steel2; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, 30); c.lineTo(WW, 30); c.moveTo(0, 96); c.lineTo(WW, 96); c.stroke();
    for (let x = 0; x < WW; x += 66) { c.beginPath(); c.moveTo(x, 30); c.lineTo(x + 33, 96); c.lineTo(x + 66, 30); c.stroke(); }
    // gantry rail carrying station signs
    c.fillStyle = P.steel; c.fillRect(0, 104, WW, 16); c.fillStyle = P.steel2; c.fillRect(0, 118, WW, 4);
    // floor
    const fg = c.createLinearGradient(0, FLOOR, 0, WH); fg.addColorStop(0, P.floor1); fg.addColorStop(1, P.floor2);
    c.fillStyle = fg; c.fillRect(0, FLOOR, WW, WH - FLOOR);
    c.fillStyle = P.line; for (let x = 0; x < WW; x += 120) c.fillRect(x, FLOOR, 1, WH - FLOOR);
    // safety lines
    for (let x = 0; x < WW; x += 40) { c.fillStyle = "#f5c400"; c.fillRect(x, FLOOR + 6, 20, 7); c.fillStyle = P.night ? "#20232a" : "#2a2a2a"; c.fillRect(x + 20, FLOOR + 6, 20, 7); }
    ST.forEach((s, i) => drawStation(c, s, i));
    drawBeltStatic(c);
    // divider wall before the automation hall
    const dx = MARGIN + SW * 8;
    c.fillStyle = P.wall2; c.fillRect(dx - 10, 150, 20, FLOOR - 150);
    c.fillStyle = P.steel; c.fillRect(dx - 14, 150, 28, 10);
    c.font = "700 13px -apple-system, BlinkMacSystemFont, Inter, sans-serif"; c.fillStyle = P.text2; c.save(); c.translate(dx + 4, 560); c.rotate(-Math.PI / 2); c.fillText("NEBENHALLE", 0, 0); c.restore();
  }
  function panel(c, x, y, w, h, r = 12, fill = P.panel) {
    c.save(); c.shadowColor = P.shadow; c.shadowBlur = 16; c.shadowOffsetY = 5; c.fillStyle = fill; rr(c, x, y, w, h, r); c.fill(); c.restore();
    c.strokeStyle = P.line; c.lineWidth = 1; rr(c, x + 0.5, y + 0.5, w - 1, h - 1, r); c.stroke();
  }
  function screen(c, x, y, w, h) { panel(c, x - 6, y - 6, w + 12, h + 12, 10, P.dark); c.fillStyle = P.screen; rr(c, x, y, w, h, 5); c.fill(); }
  function drawStation(c, s, i) {
    const x0 = MARGIN + SW * i, x = cx(i);
    // coloured bay on the wall + floor marking
    c.fillStyle = hexA(s.color, P.night ? 0.07 : 0.05); c.fillRect(x0 + 14, 164, SW - 28, FLOOR - 164);
    c.fillStyle = hexA(s.color, 0.75); c.fillRect(x0 + 14, 164, SW - 28, 5);
    c.fillStyle = hexA(s.color, 0.16); c.fillRect(x0 + 30, FLOOR + 22, SW - 60, 4);
    if (s.n) { c.font = "800 64px -apple-system, BlinkMacSystemFont, Inter, sans-serif"; c.fillStyle = hexA(s.color, P.night ? 0.22 : 0.18); c.textAlign = "center"; c.fillText(String(s.n), x, WH - 26); c.textAlign = "left"; }
    // ceiling lamp
    c.fillStyle = P.steel2; c.fillRect(x - 3, 122, 6, 26); rr(c, x - 50, 146, 100, 12, 6); c.fillStyle = P.dark; c.fill();
    const lg = c.createLinearGradient(0, 158, 0, FLOOR); lg.addColorStop(0, P.lamp); lg.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = lg; c.beginPath(); c.moveTo(x - 46, 158); c.lineTo(x + 46, 158); c.lineTo(x + 220, FLOOR); c.lineTo(x - 220, FLOOR); c.closePath(); c.fill();
    c.save(); c.translate(x0, 0); MACH[s.key]?.(c, s); c.restore();
  }
  const MACH = {
    radar(c) {
      c.fillStyle = P.steel2; c.fillRect(96, 330, 12, 300); rr(c, 70, 620, 64, 20, 6); c.fillStyle = P.steel; c.fill();
      screen(c, 360, 230, 190, 120);
      panel(c, 370, 380, 170, 150, 10, "#c49a6c");
    },
    leit(c) {
      for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) screen(c, 70 + k * 160, 220 + r * 110, 140, 86);
      panel(c, 60, 450, 480, 40, 10, P.steel);
    },
    script(c) {
      for (let k = 0; k < 2; k++) { panel(c, 40 + k * 100, 260, 86, 330, 8, "#8a6a4a"); for (let r = 0; r < 6; r++) for (let b = 0; b < 5; b++) { c.fillStyle = ["#ff9f0a", "#0a84ff", "#30d158", "#ff375f", "#bf5af2"][(r + b + k) % 5]; c.globalAlpha = 0.8; c.fillRect(48 + k * 100 + b * 15, 272 + r * 52, 11, 40); c.globalAlpha = 1; } }
      screen(c, 300, 240, 250, 170);
    },
    audio(c) {
      c.fillStyle = hexA("#64d2ff", P.night ? 0.08 : 0.12); rr(c, 40, 220, 220, 340, 14); c.fill();
      c.strokeStyle = hexA("#64d2ff", 0.6); c.lineWidth = 5; rr(c, 40, 220, 220, 340, 14); c.stroke();
      c.fillStyle = P.steel2; c.fillRect(146, 360, 6, 200); c.fillStyle = P.dark; rr(c, 134, 330, 30, 46, 15); c.fill();
      screen(c, 320, 250, 230, 120);
      panel(c, 330, 400, 90, 140, 10, P.dark); panel(c, 450, 400, 90, 140, 10, P.dark);
      for (const sx of [375, 495]) { c.fillStyle = "#3a3f4a"; c.beginPath(); c.arc(sx, 450, 26, 0, TAU); c.fill(); c.beginPath(); c.arc(sx, 510, 16, 0, TAU); c.fill(); }
    },
    archive(c) {
      for (let r = 0; r < 4; r++) { panel(c, 40, 230 + r * 92, 300, 22, 5, "#7a6a55"); for (let k = 0; k < 7; k++) { c.fillStyle = "#26282d"; c.beginPath(); c.arc(70 + k * 40, 210 + r * 92, 18, 0, TAU); c.fill(); c.fillStyle = "#9aa0a8"; c.beginPath(); c.arc(70 + k * 40, 210 + r * 92, 5, 0, TAU); c.fill(); } }
      screen(c, 380, 240, 170, 130);
    },
    cut(c) {
      for (let k = 0; k < 3; k++) screen(c, 40 + k * 140, 240, 120, 80);
      for (let k = 0; k < 3; k++) panel(c, 70 + k * 160, 360, 120, 230, 8, P.dark);
    },
    approve(c) {
      // QA gantry arch over the belt
      c.fillStyle = P.steel; c.fillRect(150, 330, 26, 300); c.fillRect(424, 330, 26, 300); rr(c, 140, 310, 320, 34, 8); c.fill();
      c.fillStyle = P.dark; rr(c, 170, 344, 260, 14, 5); c.fill();
      panel(c, 470, 220, 100, 70, 10);
      c.font = "700 13px -apple-system, Inter, sans-serif"; c.fillStyle = P.text2; c.textAlign = "center"; c.fillText("FREIGABE", 520, 262); c.textAlign = "left";
    },
    send(c) {
      // upload portal reaching to the ceiling
      c.fillStyle = P.steel; c.fillRect(110, 160, 30, 470); c.fillRect(460, 160, 30, 470); rr(c, 100, 200, 400, 40, 10); c.fill();
      [["YouTube", "#ff3b30"], ["TikTok", "#25c2d6"], ["Instagram", "#e1306c"]].forEach(([t, col], k) => {
        panel(c, 170 + k * 92, 260, 80, 44, 10); c.fillStyle = col; c.beginPath(); c.arc(186 + k * 92, 282, 6, 0, TAU); c.fill();
        c.font = "600 11px -apple-system, Inter, sans-serif"; c.fillStyle = P.text; c.fillText(t, 196 + k * 92, 286);
      });
    },
    auto(c) {
      screen(c, 70, 210, 460, 150);
      panel(c, 40, 660, 520, 30, 8, P.steel2);
      for (const bx of [140, 460]) { c.fillStyle = P.dark; rr(c, bx - 46, 740, 92, 50, 10); c.fill(); }
    },
  };
  function drawBeltStatic(c) {
    const x0 = MARGIN - 60, x1 = MARGIN + SW * 8 - 30;
    c.fillStyle = P.shadow; c.fillRect(x0, FLOOR - 6, x1 - x0, 10);
    for (let x = x0 + 40; x < x1; x += 180) { c.fillStyle = P.steel2; c.fillRect(x, 700, 14, FLOOR - 700); c.fillRect(x - 14, FLOOR - 8, 42, 8); }
    const g = c.createLinearGradient(0, BELT, 0, 700); g.addColorStop(0, P.steel); g.addColorStop(1, P.steel2);
    c.fillStyle = g; rr(c, x0, BELT + 14, x1 - x0, 700 - BELT - 14, 10); c.fill();
    c.fillStyle = P.dark; c.fillRect(x0, BELT, x1 - x0, 16);
    c.fillStyle = P.line; c.fillRect(x0, 680, x1 - x0, 3);
    ST.slice(0, 8).forEach((s, i) => { const x = cx(i); rr(c, x - 70, 646, 140, 28, 7); c.fillStyle = P.dark; c.fill(); c.fillStyle = s.color; rr(c, x - 70, 646, 8, 28, 3); c.fill();
      c.font = "700 14px -apple-system, Inter, sans-serif"; c.fillStyle = "#fff"; c.fillText(s.n ? `${s.n} · ${s.name.split(" ")[0]}` : s.name, x - 54, 665); });
  }

  // ---------------- videos on the belt ----------------
  function stationFor(v) {
    if (v.status === "failed") { const m = /^\[([^\]]+)\]/.exec(v.error || ""); return m && ERROR_ST[m[1]] != null ? ERROR_ST[m[1]] : null; }
    return STATUS_ST[v.status] ?? null;
  }
  function onVideo(v, prev) {
    let it = items.get(v.id);
    const st = stationFor(v);
    if (!it) {
      if (v.status === "published" || v.status === "ready") return;
      const start = !prev && v.status === "queued" ? 0 : (st ?? 1);
      it = { id: v.id, title: v.title || v.topic, status: v.status, st: start, stage: start, x: cx(start), born: now };
      items.set(v.id, it);
      if (start === 0) effects.push({ kind: "spawn", x: cx(0), t: now, life: 1.2 });
    }
    it.title = v.title || v.topic; it.status = v.status;
    if (st != null && st !== it.st) { it.st = st; lastFocus = st; }
    if ((v.status === "published" || v.status === "ready") && !it.launching) it.launchAt = true;
  }
  function onDeleted(id) { items.delete(id); }
  function itemTargets() {
    const by = {};
    for (const it of items.values()) if (!it.launching) (by[it.st] ||= []).push(it);
    for (const [st, list] of Object.entries(by)) {
      list.sort((a, b) => a.id - b.id);
      // the oldest is processed in front of the agent, the rest queue upstream on the belt
      list.forEach((it, k) => { it.tx = cx(+st) - k * 132; });
    }
  }

  // ---------------- simulation ----------------
  function ensureAgent(key, i) {
    return (agents[key] ||= { key, st: i, x: cx(i), tx: cx(i), walk: 0, moving: false, wanderAt: now + rnd(3, 9) });
  }
  function step(dt) {
    itemTargets();
    let beltMoving = false;
    for (const it of items.values()) {
      if (it.launching) continue;
      const d = it.tx - it.x;
      if (Math.abs(d) > 1) { it.x += Math.sign(d) * Math.min(Math.abs(d), (260 + Math.abs(d) * 1.6) * dt); beltMoving = true; }
      else it.x = it.tx;
      if (Math.abs(it.x - cx(it.st)) < 80) it.stage = it.st;
      else if (it.x > cx(it.stage) + SW * 0.5) it.stage = Math.min(it.st, it.stage + 1);
      if (it.launchAt && Math.abs(it.x - cx(7)) < 3) { it.launchAt = false; it.launching = true; effects.push({ kind: "launch", it, x: cx(7), t: now, life: 2.4 }); }
    }
    beltPhase += dt * (beltMoving ? 120 : 8);
    ST.forEach((s, i) => {
      if (!s.agent) return;
      const a = ensureAgent(s.agent, i);
      a.srv = s.agent === "automator" ? { name: "Automator", status: autoInfo().active.length ? "working" : "idle", task: autoInfo().active.length ? `Führt „${autoInfo().active[0].name}“ aus` : "Bereit" } : srv(s.agent);
      const busy = a.srv.status === "working";
      if (busy) a.tx = cx(i);
      else if (now > a.wanderAt) { a.wanderAt = now + rnd(5, 12); a.tx = cx(i) + (Math.random() < 0.5 ? 0 : rnd(-110, 110)); }
      const d = a.tx - a.x; a.moving = Math.abs(d) > 1.5;
      if (a.moving) { a.x += Math.sign(d) * Math.min(Math.abs(d), 70 * dt); a.walk += dt * 7; }
      if (busy && a.st !== lastFocus && !a._was) { lastFocus = a.st; }
      a._was = busy;
    });
    for (let i = effects.length - 1; i >= 0; i--) if (now - effects[i].t > (effects[i].life || 1.2)) effects.splice(i, 1);
    // camera
    const maxX = Math.max(0, WW - viewW());
    if (!dragging) {
      if (follow && targetX == null) { const want = clamp(cx(lastFocus) - viewW() / 2, 0, maxX); scrollX += (want - scrollX) * Math.min(1, dt * 1.6); }
      if (targetX != null) { scrollX += (targetX - scrollX) * Math.min(1, dt * 6); if (Math.abs(targetX - scrollX) < 1) targetX = null; }
      if (Math.abs(vel) > 2) { scrollX += vel * dt; vel *= Math.pow(0.04, dt); } else vel = 0;
    }
    scrollX = clamp(scrollX, 0, maxX);
  }

  // ---------------- drawing: products ----------------
  function itemColor(s) { return s === "failed" || s === "publish_failed" ? "#ff3b30" : s === "awaiting_approval" ? "#ff9500" : s === "published" || s === "ready" ? "#34c759" : "#0a84ff"; }
  function drawItem(c, it, x, y) {
    const stg = it.stage, col = itemColor(it.status);
    c.save(); c.translate(x, y);
    // pallet
    c.fillStyle = P.night ? "#3a3026" : "#b88a5a"; rr(c, -62, -12, 124, 12, 3); c.fill();
    c.fillStyle = "rgba(0,0,0,.18)"; c.fillRect(-56, -4, 112, 3);
    if (stg <= 0) {                         // idea: glowing bulb hologram
      const g = c.createRadialGradient(0, -62, 4, 0, -62, 50); g.addColorStop(0, "rgba(255,214,10,.85)"); g.addColorStop(1, "rgba(255,214,10,0)");
      c.fillStyle = g; c.beginPath(); c.arc(0, -62, 50, 0, TAU); c.fill();
      c.fillStyle = "#ffd60a"; c.beginPath(); c.arc(0, -66, 20, 0, TAU); c.fill(); c.fillStyle = "#c9a400"; rr(c, -9, -48, 18, 14, 3); c.fill();
    } else if (stg === 1) {                 // plan: clipboard
      card(c, -40, -104, 80, 92, "#f4efe4"); c.fillStyle = P.dark; rr(c, -16, -110, 32, 12, 4); c.fill();
      for (let k = 0; k < 4; k++) { c.fillStyle = k === 0 ? col : "#c7c0b0"; c.fillRect(-28, -86 + k * 16, k === 0 ? 40 : 56, 6); }
    } else if (stg === 2) {                 // script: paper stack with text
      card(c, -44, -96, 88, 84, "#ece6d8"); card(c, -40, -102, 88, 84, "#f7f3ea");
      for (let k = 0; k < 6; k++) { c.fillStyle = "#b9b2a2"; c.fillRect(-30, -90 + k * 12, 60 - (k % 3) * 12, 4); }
    } else if (stg === 3) {                 // + voice: script with waveform badge
      card(c, -44, -102, 88, 84, "#f7f3ea"); for (let k = 0; k < 4; k++) { c.fillStyle = "#b9b2a2"; c.fillRect(-30, -90 + k * 12, 56, 4); }
      rr(c, -34, -46, 68, 26, 8); c.fillStyle = "#ff375f"; c.fill();
      for (let k = 0; k < 9; k++) { const h = 4 + Math.abs(Math.sin(now * 6 + k)) * 12; c.fillStyle = "#fff"; c.fillRect(-26 + k * 6, -33 - h / 2, 3, h); }
    } else if (stg === 4) {                 // + footage: film strip
      card(c, -50, -98, 100, 70, "#26282d");
      for (let k = 0; k < 3; k++) { const g = c.createLinearGradient(0, -90, 0, -40); g.addColorStop(0, ["#3a7bd5", "#30b45a", "#ff9f0a"][k]); g.addColorStop(1, "#11141b"); c.fillStyle = g; rr(c, -42 + k * 29, -88, 25, 46, 3); c.fill(); }
      for (let k = 0; k < 8; k++) { c.fillStyle = "#f5f5f7"; c.fillRect(-46 + k * 12, -96, 5, 4); c.fillRect(-46 + k * 12, -34, 5, 4); }
    } else {                                // rendered video: vertical phone screen (+ QA tag / shipping box)
      if (stg >= 7) { c.fillStyle = P.night ? "#6b5537" : "#c9a06a"; rr(c, -48, -78, 96, 66, 6); c.fill(); c.fillStyle = "rgba(0,0,0,.12)"; c.fillRect(-48, -60, 96, 6); }
      const py = stg >= 7 ? -136 : -122;
      c.fillStyle = "#0e0f12"; rr(c, -30, py, 60, 108, 10); c.fill();
      const g = c.createLinearGradient(0, py, 0, py + 108); g.addColorStop(0, "#1d2b64"); g.addColorStop(1, "#2c5364");
      c.fillStyle = g; rr(c, -26, py + 4, 52, 100, 7); c.fill();
      c.fillStyle = "#ffd60a"; c.fillRect(-18, py + 22, 36, 6); c.fillStyle = "#fff"; c.fillRect(-20, py + 70, 40, 5);
      c.fillStyle = "rgba(255,255,255,.9)"; c.beginPath(); c.moveTo(-6, py + 42); c.lineTo(10, py + 52); c.lineTo(-6, py + 62); c.closePath(); c.fill();
      c.fillStyle = "#ffd60a"; c.fillRect(-26, py + 100, 52 * ((now * 0.25) % 1), 3);
      if (stg === 6) { c.fillStyle = it.status === "awaiting_approval" ? "#ff9500" : "#34c759"; rr(c, 16, py - 8, 34, 22, 6); c.fill(); c.fillStyle = "#fff"; c.font = "800 11px -apple-system, Inter, sans-serif"; c.fillText(it.status === "awaiting_approval" ? "QC" : "OK", 22, py + 7); }
      if (stg >= 7) ["#ff3b30", "#25c2d6", "#e1306c"].forEach((pc, k) => { c.fillStyle = pc; c.beginPath(); c.arc(-28 + k * 28, -44, 8, 0, TAU); c.fill(); });
    }
    if (it.status === "failed" || it.status === "publish_failed") { c.fillStyle = "#ff3b30"; c.beginPath(); c.arc(46, -110, 15, 0, TAU); c.fill(); c.fillStyle = "#fff"; c.font = "800 16px sans-serif"; c.textAlign = "center"; c.fillText("!", 46, -104); c.textAlign = "left"; }
    // tag
    c.font = "700 13px -apple-system, Inter, sans-serif";
    const tag = `#${it.id}`, tw = c.measureText(tag).width + 16;
    c.fillStyle = col; rr(c, -tw / 2, 6, tw, 20, 10); c.fill(); c.fillStyle = "#fff"; c.textAlign = "center"; c.fillText(tag, 0, 21); c.textAlign = "left";
    c.restore();
  }
  function card(c, x, y, w, h, fill) { c.save(); c.shadowColor = "rgba(0,0,0,.18)"; c.shadowBlur = 6; c.shadowOffsetY = 2; c.fillStyle = fill; rr(c, x, y, w, h, 6); c.fill(); c.restore(); }

  // ---------------- drawing: agents ----------------
  function drawAgent(c, a) {
    const key = a.key, col = AGENT_COLOR[key], s = a.srv.status, busy = s === "working" && !a.moving;
    const bob = a.moving ? Math.abs(Math.sin(a.walk)) * 5 : Math.sin(now * 1.6 + a.st) * 1.2;
    c.save(); c.translate(a.x, FEET - bob);
    if (s === "paused") c.globalAlpha = 0.5;
    if (key === "automator") { drawRobot(c, a, busy); c.restore(); return; }
    const [skin, hair, style] = LOOK[key];
    if (busy || selected === key) { const g = c.createRadialGradient(0, -200, 20, 0, -200, 180); g.addColorStop(0, hexA(col, selected === key ? 0.3 : 0.2 + 0.08 * Math.sin(now * 4))); g.addColorStop(1, hexA(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(0, -200, 180, 0, TAU); c.fill(); }
    // legs & hips (mostly hidden behind the belt)
    c.fillStyle = P.suit; rr(c, -30, -150, 26, 150, 8); c.fill(); rr(c, 4, -150, 26, 150, 8); c.fill();
    // torso / jacket
    c.fillStyle = P.suit2;
    c.beginPath(); c.moveTo(-50, -246); c.quadraticCurveTo(0, -262, 50, -246); c.lineTo(40, -138); c.quadraticCurveTo(0, -128, -40, -138); c.closePath(); c.fill();
    // shirt & tie
    c.fillStyle = "#f5f6f8"; c.beginPath(); c.moveTo(-17, -254); c.lineTo(17, -254); c.lineTo(0, -196); c.closePath(); c.fill();
    c.fillStyle = col; c.beginPath(); c.moveTo(-5, -250); c.lineTo(5, -250); c.lineTo(7, -240); c.lineTo(4, -186); c.lineTo(0, -178); c.lineTo(-4, -186); c.lineTo(-7, -240); c.closePath(); c.fill();
    // lapels
    c.fillStyle = P.suit; c.beginPath(); c.moveTo(-17, -254); c.lineTo(-4, -196); c.lineTo(-24, -222); c.lineTo(-30, -250); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(17, -254); c.lineTo(4, -196); c.lineTo(24, -222); c.lineTo(30, -250); c.closePath(); c.fill();
    c.fillStyle = "rgba(255,255,255,.08)"; c.fillRect(-1, -196, 2, 56);
    // ID badge with department icon
    c.fillStyle = "#fff"; rr(c, 18, -222, 22, 28, 4); c.fill(); c.fillStyle = col; rr(c, 18, -222, 22, 8, 3); c.fill();
    c.save(); c.translate(20.5, -212); c.scale(0.7, 0.7); c.strokeStyle = col; c.lineWidth = 2.4; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(path(key)); c.restore();
    // neck & head
    c.fillStyle = shade(skin, -0.12); rr(c, -10, -272, 20, 22, 6); c.fill();
    c.fillStyle = skin; c.beginPath(); c.ellipse(0, -298, 27, 31, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(-27, -296, 5, 8, 0, 0, TAU); c.ellipse(27, -296, 5, 8, 0, 0, TAU); c.fill();
    drawHair(c, hair, style);
    // sunglasses
    c.fillStyle = "#0b0c0f"; rr(c, -23, -306, 20, 12, 4); c.fill(); rr(c, 3, -306, 20, 12, 4); c.fill(); c.fillRect(-4, -303, 8, 3);
    c.strokeStyle = "#0b0c0f"; c.lineWidth = 2; c.beginPath(); c.moveTo(-23, -302); c.lineTo(-27, -298); c.moveTo(23, -302); c.lineTo(27, -298); c.stroke();
    c.fillStyle = "rgba(255,255,255,.45)"; c.fillRect(-19, -304, 6, 2); c.fillRect(7, -304, 6, 2);
    c.strokeStyle = shade(skin, -0.35); c.lineWidth = 2; c.lineCap = "round"; c.beginPath(); c.moveTo(-6, -279); c.quadraticCurveTo(0, busy ? -276 : -277, 6, -279); c.stroke();
    // earpiece & coiled wire
    c.fillStyle = "#d8dde4"; c.beginPath(); c.arc(28, -293, 4, 0, TAU); c.fill();
    c.strokeStyle = "rgba(216,221,228,.9)"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(28, -289);
    for (let k = 0; k < 10; k++) c.quadraticCurveTo(33 + (k % 2 ? -4 : 4), -284 + k * 3.4, 29, -280 + k * 3.4);
    c.lineTo(24, -246); c.stroke();
    if (key === "voice") { c.strokeStyle = "#1b1b1b"; c.lineWidth = 4; c.beginPath(); c.arc(0, -300, 32, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); c.fillStyle = "#1b1b1b"; rr(c, -36, -306, 10, 18, 4); c.fill(); }
    c.restore();
  }
  function drawHair(c, hair, style) {
    c.fillStyle = hair;
    if (style === "buzz") { c.beginPath(); c.ellipse(0, -312, 27, 18, 0, Math.PI, 0); c.fill(); return; }
    c.beginPath(); c.ellipse(0, -314, 29, 21, 0, Math.PI * 0.95, Math.PI * 2.05); c.fill();
    if (style === "side") { c.beginPath(); c.moveTo(-28, -312); c.quadraticCurveTo(-4, -342, 30, -318); c.lineTo(30, -306); c.quadraticCurveTo(6, -326, -28, -304); c.fill(); }
    if (style === "long") { rr(c, -31, -316, 10, 52, 5); c.fill(); rr(c, 21, -316, 10, 52, 5); c.fill(); }
    if (style === "bun") { c.beginPath(); c.arc(0, -336, 11, 0, TAU); c.fill(); }
  }
  function drawArms(c, a) {   // drawn after the product so hands work "on" it
    const key = a.key; if (key === "automator") return;
    const s = a.srv.status, busy = s === "working" && !a.moving;
    const [skin] = LOOK[key];
    const bob = a.moving ? Math.abs(Math.sin(a.walk)) * 5 : Math.sin(now * 1.6 + a.st) * 1.2;
    c.save(); c.translate(a.x, FEET - bob);
    if (s === "paused") c.globalAlpha = 0.5;
    const sw = a.moving ? Math.sin(a.walk) * 12 : 0;
    const arms = busy ? [[-1, Math.sin(now * 9) * 8], [1, Math.sin(now * 9 + 1.8) * 8]] : [[-1, sw], [1, -sw]];
    for (const [side, off] of arms) {
      const sx = side * 46, sy = -240;
      const ex = side * (busy ? 52 : 56), ey = busy ? -178 : -186 + off * 0.3;
      const hx = side * (busy ? 26 : 50) + (busy ? off * 0.5 : 0), hy = busy ? -128 + off : -136 + off;
      c.strokeStyle = P.suit2; c.lineCap = "round"; c.lineWidth = 22;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.lineTo(hx, hy); c.stroke();
      c.strokeStyle = "#f5f6f8"; c.lineWidth = 6; c.beginPath(); c.moveTo(hx - (hx - ex) * 0.12, hy - (hy - ey) * 0.12); c.lineTo(hx - (hx - ex) * 0.2, hy - (hy - ey) * 0.2); c.stroke();
      c.fillStyle = skin; c.beginPath(); c.arc(hx, hy, 10, 0, TAU); c.fill();
    }
    if (key === "voice" && !busy) { c.fillStyle = "#2a2f38"; rr(c, 44, -168, 10, 30, 4); c.fill(); c.beginPath(); c.arc(49, -172, 9, 0, TAU); c.fill(); }
    c.restore();
  }
  function drawRobot(c, a, busy) {
    const col = AGENT_COLOR.automator;
    c.fillStyle = P.steel2; rr(c, -26, -150, 20, 150, 8); c.fill(); rr(c, 6, -150, 20, 150, 8); c.fill();
    c.fillStyle = P.dark; rr(c, -32, -10, 30, 12, 4); c.fill(); rr(c, 2, -10, 30, 12, 4); c.fill();
    const g = c.createLinearGradient(-50, 0, 50, 0); g.addColorStop(0, "#f2f5f7"); g.addColorStop(1, "#b9c3ca");
    c.fillStyle = g; rr(c, -50, -258, 100, 118, 22); c.fill();
    c.fillStyle = col; rr(c, -30, -228, 60, 8, 4); c.fill();
    c.fillStyle = busy ? "#7dfff6" : "#5a6a70"; c.beginPath(); c.arc(0, -190, 16, 0, TAU); c.fill();
    c.fillStyle = g; rr(c, -40, -330, 80, 64, 20); c.fill();
    c.fillStyle = "#0e1a22"; rr(c, -30, -316, 60, 30, 12); c.fill();
    c.fillStyle = busy ? "#7dfff6" : col; c.beginPath(); c.arc(-12, -301, 6, 0, TAU); c.arc(12, -301, 6, 0, TAU); c.fill();
    c.strokeStyle = P.steel2; c.lineWidth = 4; c.beginPath(); c.moveTo(0, -330); c.lineTo(0, -350); c.stroke();
    c.fillStyle = busy && Math.sin(now * 10) > 0 ? "#7dfff6" : col; c.beginPath(); c.arc(0, -354, 7, 0, TAU); c.fill();
    const sw = busy ? Math.sin(now * 6) * 14 : 0;
    c.strokeStyle = "#c9d1d8"; c.lineWidth = 16; c.lineCap = "round";
    c.beginPath(); c.moveTo(-50, -240); c.lineTo(-66, -190 + sw); c.lineTo(-56, -150 - sw); c.stroke();
    c.beginPath(); c.moveTo(50, -240); c.lineTo(66, -190 - sw); c.lineTo(56, -150 + sw); c.stroke();
    c.fillStyle = col; c.beginPath(); c.arc(-56, -150 - sw, 10, 0, TAU); c.arc(56, -150 + sw, 10, 0, TAU); c.fill();
  }
  function drawKuka(c, bx, i) {
    const act = autoInfo().active.length, sp = act ? 1.8 : 0.4;
    const a1 = -1.9 + Math.sin(now * sp + i * 2) * 0.45, a2 = 1.4 + Math.sin(now * sp * 1.3 + i) * 0.5, a3 = Math.sin(now * sp * 2 + i) * 0.6;
    const base = { x: bx, y: 740 };
    c.fillStyle = "#e86a10"; rr(c, bx - 34, 700, 68, 44, 10); c.fill(); c.fillStyle = "#ff8a2b"; rr(c, bx - 26, 684, 52, 22, 8); c.fill();
    const j1 = { x: base.x + Math.cos(a1) * 150, y: 690 + Math.sin(a1) * 150 };
    const j2 = { x: j1.x + Math.cos(a1 + a2) * 120, y: j1.y + Math.sin(a1 + a2) * 120 };
    const j3 = { x: j2.x + Math.cos(a1 + a2 + a3) * 40, y: j2.y + Math.sin(a1 + a2 + a3) * 40 };
    c.lineCap = "round";
    c.strokeStyle = "#c95a0c"; c.lineWidth = 34; c.beginPath(); c.moveTo(bx, 690); c.lineTo(j1.x, j1.y); c.stroke();
    c.strokeStyle = "#ff8a2b"; c.lineWidth = 26; c.beginPath(); c.moveTo(bx, 690); c.lineTo(j1.x, j1.y); c.stroke();
    c.strokeStyle = "#e86a10"; c.lineWidth = 22; c.beginPath(); c.moveTo(j1.x, j1.y); c.lineTo(j2.x, j2.y); c.stroke();
    c.strokeStyle = P.dark; c.lineWidth = 10; c.beginPath(); c.moveTo(j2.x, j2.y); c.lineTo(j3.x, j3.y); c.stroke();
    for (const j of [{ x: bx, y: 690 }, j1, j2]) { c.fillStyle = P.dark; c.beginPath(); c.arc(j.x, j.y, 12, 0, TAU); c.fill(); c.fillStyle = "#ffd7b5"; c.beginPath(); c.arc(j.x, j.y, 5, 0, TAU); c.fill(); }
    if (act) { c.fillStyle = `rgba(125,255,246,${0.4 + 0.3 * Math.sin(now * 12)})`; c.beginPath(); c.arc(j3.x, j3.y, 10, 0, TAU); c.fill(); }
  }

  // ---------------- drawing: live station details ----------------
  function drawLive(c, x0v, x1v) {
    const ag = opts.getAgents(), st = opts.getStats() || {}, au = autoInfo();
    const vis = (i) => cx(i) + SW / 2 > x0v && cx(i) - SW / 2 < x1v;
    // 1 radar
    if (vis(0)) { const X = MARGIN, on = working("trend_scout");
      const sx = Math.cos(now * (on ? 2.4 : 0.6));
      c.fillStyle = P.steel; c.beginPath(); c.ellipse(X + 102, 320, Math.max(6, Math.abs(sx) * 70), 70, 0, 0, TAU); c.fill();
      c.strokeStyle = P.steel2; c.lineWidth = 3; c.beginPath(); c.moveTo(X + 102, 320); c.lineTo(X + 102 + sx * 60, 300); c.stroke();
      c.save(); c.beginPath(); c.rect(X + 360, 230, 190, 120); c.clip();
      const g = c.createConicGradient ? c.createConicGradient(now * (on ? 3 : 0.8), X + 455, 290) : null;
      if (g) { g.addColorStop(0, "rgba(10,132,255,.7)"); g.addColorStop(0.1, "rgba(10,132,255,0)"); g.addColorStop(1, "rgba(10,132,255,0)"); c.fillStyle = g; c.beginPath(); c.arc(X + 455, 290, 56, 0, TAU); c.fill(); }
      c.strokeStyle = "rgba(10,132,255,.4)"; c.lineWidth = 1; for (const r of [18, 36, 54]) { c.beginPath(); c.arc(X + 455, 290, r, 0, TAU); c.stroke(); }
      c.restore();
      const n = Math.min(st.ideas || 0, 15), cols = ["#ffd60a", "#ffb340", "#7ee081", "#7cc7ff", "#ff9fd0"];
      for (let i = 0; i < n; i++) { c.fillStyle = cols[i % 5]; rr(c, X + 382 + (i % 5) * 30, 394 + Math.floor(i / 5) * 40, 24, 30, 2); c.fill(); }
      c.font = "700 13px -apple-system, Inter, sans-serif"; c.fillStyle = P.night ? "#e5e5ea" : "#5a4632"; c.fillText(`${st.ideas || 0} Ideen`, X + 382, 524);
    }
    // 2 leitstand screens
    if (vis(1)) { const X = MARGIN + SW, slot = ag.producer?.next_slot ? new Date(ag.producer.next_slot).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "Autopilot aus";
      const sc = [["Nächstes Video", slot], ["In Arbeit", st.in_production ?? 0], ["Freigabe", st.awaiting_approval ?? 0], ["Online", st.published ?? 0], ["Ideen", st.ideas ?? 0], ["Automationen", au.enabled ?? 0]];
      sc.forEach(([l, v], k) => { const sx = X + 70 + (k % 3) * 160, sy = 220 + Math.floor(k / 3) * 110;
        c.font = "600 12px -apple-system, Inter, sans-serif"; c.fillStyle = "#8e8e93"; c.fillText(l, sx + 12, sy + 24);
        c.font = `800 ${typeof v === "number" ? 30 : 15}px -apple-system, Inter, sans-serif`; c.fillStyle = ["#fff", "#0a84ff", "#ff9500", "#30d158", "#ffd60a", "#00b3ab"][k]; c.fillText(String(v), sx + 12, sy + 62); });
    }
    // 3 script screen: typing lines
    if (vis(2)) { const X = MARGIN + SW * 2, on = working("script_writer");
      for (let k = 0; k < 8; k++) { const w = on ? Math.min(220, ((now * 120 + k * 60) % 300)) : 90 + (k * 37) % 120; c.fillStyle = k === 0 ? "#e8a000" : "rgba(229,229,234,.7)"; c.fillRect(X + 316, 260 + k * 18, Math.min(w, 220 - (k % 3) * 30), 6); }
      if (on && Math.sin(now * 6) > 0) { c.fillStyle = "#fff"; c.fillRect(X + 316 + 160, 386, 3, 12); } }
    // 4 studio
    if (vis(3)) { const X = MARGIN + SW * 3, on = working("voice");
      for (let k = 0; k < 26; k++) { const h = on ? 8 + Math.abs(Math.sin(now * 7 + k * 0.7)) * 90 : 6; c.fillStyle = h > 80 ? "#ff375f" : "#30d158"; c.fillRect(X + 332 + k * 8, 310 - h / 2, 5, h); }
      rr(c, X + 98, 186, 104, 28, 14); c.fillStyle = on ? (Math.sin(now * 6) > -0.3 ? "#ff3b30" : "#7a1a16") : P.steel2; c.fill();
      c.font = "800 13px -apple-system, Inter, sans-serif"; c.fillStyle = "#fff"; c.fillText("ON AIR", X + 124, 205);
      if (on) for (const sx of [375, 495]) { c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 2; const r = 26 + (now * 30) % 14; c.beginPath(); c.arc(X + sx, 450, r, 0, TAU); c.stroke(); } }
    // 5 archive scanner
    if (vis(4)) { const X = MARGIN + SW * 4, on = working("visuals");
      if (on) { const r = Math.floor(now * 1.2) % 4, k = (now * 180) % 280; c.fillStyle = "rgba(48,180,90,.35)"; c.fillRect(X + 50 + k, 188 + r * 92, 26, 44); }
      for (let k = 0; k < 6; k++) { const g = c.createLinearGradient(0, 248, 0, 362); g.addColorStop(0, on ? ["#3a7bd5", "#30b45a", "#ff9f0a"][k % 3] : "#2a2f38"); g.addColorStop(1, "#11141b"); c.fillStyle = g; rr(c, X + 390 + (k % 3) * 52, 250 + Math.floor(k / 3) * 58, 46, 52, 4); c.fill(); } }
    // 6 render
    if (vis(5)) { const X = MARGIN + SW * 5, on = working("editor"), pr = ag.editor?.progress;
      [0, 1, 2].forEach((k) => { c.fillStyle = on ? ["#ff6a2b", "#0a84ff", "#ffcc00"][k] : "#2a2f38"; for (let t = 0; t < 4; t++) c.fillRect(X + 50 + k * 140, 256 + t * 14, 40 + ((t * 31 + k * 17) % 60), 7); });
      for (let k = 0; k < 3; k++) for (let r = 0; r < 12; r++) for (let q = 0; q < 4; q++) { const lit = on ? Math.sin(now * (6 + q) + k * 2 + r) > 0.1 : (k + r + q + Math.floor(now / 2)) % 9 === 0; c.fillStyle = lit ? (on ? "#ff9a3d" : "#30d158") : "#2a2f38"; c.fillRect(X + 86 + k * 160 + q * 22, 380 + r * 17, 12, 6); }
      if (on && pr != null) { c.fillStyle = P.dark; rr(c, X + 70, 196, 460, 18, 9); c.fill(); c.fillStyle = "#ff6a2b"; rr(c, X + 70, 196, 460 * pr / 100, 18, 9); c.fill(); c.font = "700 12px -apple-system, Inter, sans-serif"; c.fillStyle = "#fff"; c.fillText(`Rendering ${Math.round(pr)} %`, X + 80, 209); } }
    // 7 QA arch
    if (vis(6)) { const X = MARGIN + SW * 6, waiting = [...items.values()].filter((i) => i.st === 6 && i.status === "awaiting_approval").length;
      c.fillStyle = waiting ? `rgba(255,149,0,${0.5 + 0.4 * Math.sin(now * 4)})` : "rgba(255,149,0,.25)"; rr(c, X + 170, 344, 260, 14, 5); c.fill();
      if (waiting) { const sy = 360 + ((now * 120) % 240); const g = c.createLinearGradient(0, sy - 20, 0, sy + 20); g.addColorStop(0, "rgba(255,149,0,0)"); g.addColorStop(0.5, "rgba(255,149,0,.35)"); g.addColorStop(1, "rgba(255,149,0,0)"); c.fillStyle = g; c.fillRect(X + 176, sy - 20, 248, 40);
        const t = waiting === 1 ? "1 Video wartet – klicken zum Prüfen" : `${waiting} Videos warten – klicken zum Prüfen`; c.font = "700 15px -apple-system, Inter, sans-serif"; const w = c.measureText(t).width + 32;
        c.fillStyle = "#ff9500"; rr(c, X + 300 - w / 2, 262, w, 34, 17); c.fill(); c.fillStyle = "#fff"; c.textAlign = "center"; c.fillText(t, X + 300, 284); c.textAlign = "left"; } }
    // 8 upload portal
    if (vis(7)) { const X = MARGIN + SW * 7, on = working("publisher");
      const g = c.createLinearGradient(0, 240, 0, 610); g.addColorStop(0, `rgba(191,90,242,${on ? 0.35 : 0.08})`); g.addColorStop(1, "rgba(191,90,242,0)");
      c.fillStyle = g; c.fillRect(X + 140, 240, 320, 370);
      c.font = "700 13px -apple-system, Inter, sans-serif"; c.fillStyle = P.text2; c.fillText(`${st.published ?? 0} Videos online`, X + 236, 336); }
    // automation hall
    if (vis(8)) { const X = MARGIN + SW * 8;
      c.font = "700 14px -apple-system, Inter, sans-serif"; c.fillStyle = "#7dfff6"; c.fillText(`${au.enabled ?? 0} AKTIV${au.active.length ? ` · ${au.active.length} LÄUFT` : ""}`, X + 90, 240);
      const rows = [...au.active.map((r) => ({ name: r.name, status: "running" })), ...au.recent].slice(0, 4);
      rows.forEach((r, k) => { const col = { running: "#0a84ff", success: "#30d158", skipped: "#8e8e93", error: "#ff3b30" }[r.status] || "#8e8e93"; c.fillStyle = col; c.beginPath(); c.arc(X + 96, 266 + k * 24, 5, 0, TAU); c.fill(); c.fillStyle = "#e5e5ea"; c.font = "500 15px -apple-system, Inter, sans-serif"; c.fillText((r.name || "").slice(0, 40), X + 110, 271 + k * 24); });
      if (!rows.length) { c.fillStyle = "#8e8e93"; c.font = "500 15px -apple-system, Inter, sans-serif"; c.fillText("Noch keine Läufe", X + 90, 270); }
      for (let k = 0; k < 18; k++) { const xx = X + 50 + ((k * 32 + now * (au.active.length ? 90 : 10)) % 500); c.fillStyle = P.line; c.fillRect(xx, 664, 16, 22); }
      drawKuka(c, X + 140, 0); drawKuka(c, X + 460, 1); }
    // overhead station signs (live status)
    ST.forEach((s, i) => { if (!vis(i)) return;
      let state = "idle";
      if (s.key === "approve") state = [...items.values()].some((it) => it.status === "awaiting_approval") ? "waiting" : "idle";
      else if (s.key === "auto") state = au.active.length ? "working" : "idle";
      else state = ag[s.agent]?.status || "idle";
      const label = { working: "Aktiv", idle: "Bereit", paused: "Pausiert", error: "Störung", waiting: "Wartet auf dich" }[state] || state;
      const col = { working: "#0a84ff", idle: "#34c759", paused: "#8e8e93", error: "#ff3b30", waiting: "#ff9500" }[state] || "#8e8e93";
      const x = cx(i), w = 330, y = 132;
      c.strokeStyle = P.steel2; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 110, 120); c.lineTo(x - 110, y); c.moveTo(x + 110, 120); c.lineTo(x + 110, y); c.stroke();
      c.save(); c.shadowColor = P.shadow; c.shadowBlur = 14; c.shadowOffsetY = 4; c.fillStyle = P.panel; rr(c, x - w / 2, y, w, 76, 16); c.fill(); c.restore();
      c.fillStyle = s.color; rr(c, x - w / 2, y, 10, 76, [16, 0, 0, 16]); c.fill();
      if (s.n) { c.fillStyle = s.color; c.beginPath(); c.arc(x - w / 2 + 44, y + 38, 22, 0, TAU); c.fill(); c.fillStyle = "#fff"; c.font = "800 22px -apple-system, Inter, sans-serif"; c.textAlign = "center"; c.fillText(String(s.n), x - w / 2 + 44, y + 46); c.textAlign = "left"; }
      else { c.save(); c.translate(x - w / 2 + 30, y + 24); c.strokeStyle = s.color; c.lineWidth = 2.6; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(new Path2D("M13 2.5L4.5 13.5h6.5l-1 8 8.5-11h-6.5z")); c.restore(); }
      c.fillStyle = P.text; c.font = "700 20px -apple-system, BlinkMacSystemFont, Inter, sans-serif"; c.fillText(s.name, x - w / 2 + 78, y + 32);
      const who = s.agent ? (srv(s.agent).name || (s.agent === "automator" ? "Automator" : "")) : "Du";
      c.fillStyle = P.text2; c.font = "500 14px -apple-system, Inter, sans-serif"; c.fillText(`${s.sub} · ${who}`, x - w / 2 + 78, y + 54);
      c.fillStyle = col; c.beginPath(); c.arc(x + w / 2 - 22, y + 22, 7 + (state === "working" || state === "waiting" ? Math.sin(now * 5) * 1.5 : 0), 0, TAU); c.fill();
      if (state !== "idle") { c.strokeStyle = hexA(col, 0.35); c.lineWidth = 3; c.beginPath(); c.arc(x + w / 2 - 22, y + 22, 12 + Math.sin(now * 4) * 2, 0, TAU); c.stroke(); }
      if (state === "waiting" || state === "error" || state === "paused") { c.font = "700 13px -apple-system, Inter, sans-serif"; const lw = c.measureText(label).width + 22; c.fillStyle = col; rr(c, x + w / 2 - lw - 8, y + 82, lw, 24, 12); c.fill(); c.fillStyle = "#fff"; c.fillText(label, x + w / 2 - lw + 3, y + 99); }
      if (state === "error") { c.fillStyle = `rgba(255,59,48,${0.06 + 0.05 * Math.sin(now * 5)})`; c.fillRect(MARGIN + SW * i + 14, 164, SW - 28, FLOOR - 164); }
      if (state === "paused") { c.fillStyle = hexA(isDark() ? "#000000" : "#ffffff", 0.35); c.fillRect(MARGIN + SW * i + 14, 220, SW - 28, FLOOR - 220); }
    });
  }
  function drawBeltLive(c, x0v, x1v) {
    const a = Math.max(MARGIN - 60, x0v), b = Math.min(MARGIN + SW * 8 - 30, x1v);
    for (let x = a - ((a + beltPhase) % 40); x < b; x += 40) { c.fillStyle = "rgba(255,255,255,.07)"; c.fillRect(x, BELT + 2, 18, 4); }
    for (let x = a - ((a - MARGIN) % 60); x < b; x += 60) { c.save(); c.translate(x, 698); c.rotate(beltPhase / 12); c.fillStyle = P.steel2; c.beginPath(); c.arc(0, 0, 7, 0, TAU); c.fill(); c.fillStyle = P.dark; c.fillRect(-1, -7, 2, 14); c.restore(); }
  }
  function drawBubble(c, a) {
    const s = a.srv.status; let text = null, col = P.text;
    if (s === "working") text = a.srv.task; else if (s === "error") { text = a.srv.task || "Fehler"; col = "#ff3b30"; } else if (s === "paused") text = "Pausiert";
    if (!text) return;
    text = text.length > 34 ? text.slice(0, 33) + "…" : text;
    c.font = "600 17px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
    const bw = c.measureText(text).width + 40, bh = 38, x = a.x - bw / 2, y = FEET - (a.key === "automator" ? 420 : 400);
    c.save(); c.shadowColor = "rgba(0,0,0,.16)"; c.shadowBlur = 12; c.shadowOffsetY = 3; c.fillStyle = P.bubble; rr(c, x, y, bw, bh, 19); c.fill(); c.restore();
    c.strokeStyle = P.bubbleLine; c.lineWidth = 1; rr(c, x, y, bw, bh, 19); c.stroke();
    c.fillStyle = P.bubble; c.beginPath(); c.moveTo(a.x - 8, y + bh); c.lineTo(a.x, y + bh + 10); c.lineTo(a.x + 8, y + bh); c.fill();
    c.fillStyle = AGENT_COLOR[a.key]; c.beginPath(); c.arc(x + 17, y + bh / 2, 5.5, 0, TAU); c.fill();
    c.fillStyle = col; c.fillText(text, x + 30, y + 25);
    if (s === "working" && a.srv.progress != null) { c.fillStyle = P.line; rr(c, x + 16, y + bh - 5, bw - 32, 3, 1.5); c.fill(); c.fillStyle = AGENT_COLOR[a.key]; rr(c, x + 16, y + bh - 5, (bw - 32) * a.srv.progress / 100, 3, 1.5); c.fill(); }
  }
  function drawEffects(c) {
    for (const e of effects) {
      const k = (now - e.t) / (e.life || 1.2);
      if (e.kind === "spawn") { c.strokeStyle = `rgba(255,214,10,${1 - k})`; c.lineWidth = 4; c.beginPath(); c.arc(e.x, BELT - 60, 30 + k * 90, 0, TAU); c.stroke(); }
      if (e.kind === "launch") {
        const it = e.it, lift = ease(Math.min(1, k)) * 520;
        const g = c.createLinearGradient(0, 160, 0, BELT); g.addColorStop(0, "rgba(191,90,242,0)"); g.addColorStop(1, `rgba(191,90,242,${0.5 * (1 - k)})`);
        c.fillStyle = g; c.fillRect(e.x - 50, 160, 100, BELT - 160);
        c.globalAlpha = Math.max(0, 1 - k * 1.1); drawItem(c, { ...it, stage: 7, status: "published" }, e.x, BELT - lift); c.globalAlpha = 1;
        c.globalAlpha = 1 - k; c.font = "800 22px -apple-system, Inter, sans-serif"; c.fillStyle = "#34c759"; c.fillText("Online!", e.x + 70, BELT - 120 - k * 60); c.globalAlpha = 1;
        if (k >= 0.99) items.delete(it.id);
      }
    }
  }

  // ---------------- frame ----------------
  function frame() {
    if (!running) return;
    const tn = performance.now(), dt = Math.min(0.05, (tn - t0) / 1000); t0 = tn; now += dt;
    step(dt);
    const dpr = window.devicePixelRatio || 1, cw = canvas.width / dpr, ch = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = P.sky1; ctx.fillRect(0, 0, cw, ch);
    ctx.scale(scale, scale); ctx.translate(-scrollX, 0);
    const vw = viewW(), x0v = scrollX, x1v = scrollX + vw;
    ctx.drawImage(layer, x0v * layerS, 0, vw * layerS, WH * layerS, x0v, 0, vw, WH);
    drawLive(ctx, x0v, x1v);
    // agents behind the belt, then belt details, products, arms, bubbles
    const ags = Object.values(agents).filter((a) => a.x > x0v - 120 && a.x < x1v + 120);
    for (const a of ags) if (a.key !== "automator") drawAgent(ctx, a);
    ctx.drawImage(layer, x0v * layerS, BELT * layerS, vw * layerS, (738 - BELT) * layerS, x0v, BELT, vw, 738 - BELT);   // belt in front of agents
    drawBeltLive(ctx, x0v, x1v);
    for (const it of items.values()) if (!it.launching && it.x > x0v - 100 && it.x < x1v + 100) drawItem(ctx, it, it.x, BELT);
    for (const a of ags) drawArms(ctx, a);
    for (const a of ags) if (a.key === "automator") drawAgent(ctx, a);
    drawEffects(ctx);
    for (const a of ags) drawBubble(ctx, a);
    updateNav();
    requestAnimationFrame(frame);
  }

  // ---------------- input: swipe / drag / wheel, no zoom ----------------
  function resize() {
    const r = wrap.getBoundingClientRect(); if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
    const ns = r.height / WH;
    const rebuild = !layer || Math.abs(clamp(dpr * ns, 0.8, 1.6) - layerS) > 0.25;
    scale = ns; if (rebuild) buildLayer();
  }
  const toWorld = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale + scrollX, y: (e.clientY - r.top) / scale }; };
  function hit(w) {
    for (const a of Object.values(agents)) if (Math.abs(w.x - a.x) < 60 && w.y > FEET - 360 && w.y < FEET - 100) return { type: "agent", a };
    for (const it of items.values()) if (!it.launching && Math.abs(w.x - it.x) < 64 && w.y > BELT - 150 && w.y < BELT + 30) return { type: "item", it };
    const i = Math.floor((w.x - MARGIN) / SW);
    if (i >= 0 && i < N && w.y > 120) return { type: "station", i };
    return null;
  }
  function bindInput() {
    let start = null, lastX = 0, lastT = 0, moved = false;
    canvas.addEventListener("pointerdown", (e) => { start = { x: e.clientX, sx: scrollX }; lastX = e.clientX; lastT = performance.now(); moved = false; vel = 0; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (start) {
        const dx = e.clientX - start.x;
        if (Math.abs(dx) > 5) { moved = true; dragging = true; follow = false; targetX = null; setFollowBtn(); }
        if (moved) { scrollX = start.sx - dx / scale; const t = performance.now(); vel = -(e.clientX - lastX) / scale / Math.max(0.008, (t - lastT) / 1000); lastX = e.clientX; lastT = t; }
        canvas.style.cursor = moved ? "grabbing" : "grab"; tip.hidden = true; return;
      }
      const h = hit(toWorld(e));
      canvas.style.cursor = h && (h.type !== "station" || ["approve", "auto"].includes(ST[h.i].key) || ST[h.i].agent) ? "pointer" : "grab";
      if (h?.type === "item") showTip(e, `#${h.it.id} · ${h.it.title}`);
      else if (h?.type === "agent") showTip(e, `${h.a.srv.name || h.a.key} · ${h.a.srv.task || ""}`);
      else if (h?.type === "station") showTip(e, `${ST[h.i].n ? ST[h.i].n + ". " : ""}${ST[h.i].name} – ${ST[h.i].sub}`);
      else tip.hidden = true;
    });
    const end = (e) => {
      if (start && !moved) {
        const h = hit(toWorld(e));
        if (h?.type === "item") opts.openVideo(h.it.id);
        else if (h?.type === "agent") { selected = h.a.key; opts.onAgent?.(h.a.key); }
        else if (h?.type === "station") {
          const s = ST[h.i];
          if (s.key === "approve") { const w = [...items.values()].filter((it) => it.status === "awaiting_approval").sort((a, b) => a.id - b.id)[0]; if (w) opts.openVideo(w.id); }
          else if (s.key === "auto") opts.onAutomations?.();
          else if (s.agent) { selected = s.agent; opts.onAgent?.(s.agent); }
        }
      }
      if (moved && Math.abs(vel) < 60) vel = 0;
      vel = clamp(vel, -3000, 3000);
      start = null; dragging = false; canvas.style.cursor = "grab";
    };
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", () => (tip.hidden = true));
    canvas.addEventListener("wheel", (e) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
      if (!d) return;            // vertical wheel keeps scrolling the page
      e.preventDefault(); follow = false; setFollowBtn(); targetX = null; vel = 0; scrollX += d / scale;
    }, { passive: false });
    wrap.tabIndex = 0;
    wrap.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { jump(1); e.preventDefault(); } if (e.key === "ArrowLeft") { jump(-1); e.preventDefault(); } });
    arrows[0].onclick = () => jump(-1); arrows[1].onclick = () => jump(1);
    new ResizeObserver(resize).observe(wrap);
    const re = () => buildLayer();
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", re);
    new MutationObserver(re).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  function centerIdx() { return clamp(Math.round((scrollX + viewW() / 2 - MARGIN - SW / 2) / SW), 0, N - 1); }
  function goStation(i) { follow = false; setFollowBtn(); vel = 0; targetX = clamp(cx(i) - viewW() / 2, 0, Math.max(0, WW - viewW())); }
  function jump(d) { goStation(clamp(centerIdx() + d, 0, N - 1)); }
  function showTip(e, text) {
    const r = wrap.getBoundingClientRect();
    tip.hidden = false; tip.textContent = text.length > 90 ? text.slice(0, 89) + "…" : text;
    tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 240) + "px"; tip.style.top = e.clientY - r.top + 16 + "px";
  }
  let followBtn, navSig = "";
  function setFollowBtn() { followBtn?.classList.toggle("on", follow); }
  function updateNav() {
    const ag = opts.getAgents(), ci = centerIdx(), au = autoInfo();
    const states = ST.map((s) => s.key === "approve" ? ([...items.values()].some((it) => it.status === "awaiting_approval") ? "waiting" : "idle") : s.key === "auto" ? (au.active.length ? "working" : "idle") : (ag[s.agent]?.status || "idle"));
    const sig = ci + "|" + states.join(",") + "|" + Math.round(scrollX / 20);
    if (sig === navSig) return; navSig = sig;
    nav.querySelectorAll(".ln-chip").forEach((b, i) => { b.classList.toggle("on", i === ci); b.querySelector("i").className = states[i]; });
    const maxX = Math.max(1, WW - viewW());
    nav.querySelector(".ln-thumb").style.left = `${(scrollX / maxX) * (100 - Math.min(100, viewW() / WW * 100))}%`;
    nav.querySelector(".ln-thumb").style.width = `${Math.min(100, viewW() / WW * 100)}%`;
    arrows[0].disabled = scrollX < 2; arrows[1].disabled = scrollX > maxX - 2;
  }

  window.Line = {
    ICONS, AGENT_COLOR,
    init(container, options) {
      opts = options;
      container.innerHTML = `
        <div class="ln-wrap"><canvas class="ln-canvas" aria-label="Produktionsstraße: Videos fahren von Station zu Station"></canvas>
          <button class="ln-arrow l" aria-label="Zur vorherigen Station"><svg class="i" viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg></button>
          <button class="ln-arrow r" aria-label="Zur nächsten Station"><svg class="i" viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg></button>
          <div class="ln-hint glass">← Wischen, um die Straße entlangzugehen →</div>
          <div class="ln-tip glass" hidden></div></div>
        <div class="ln-nav"><div class="ln-top"><div class="ln-track"><div class="ln-thumb"></div></div>
          <button class="ln-follow on" title="Automatisch der aktuellen Arbeit folgen"><svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>Live folgen</button></div>
          <div class="ln-chips">${ST.map((s, i) => `<button class="ln-chip" data-i="${i}"><b style="background:${s.color}">${s.n ?? "⚡"}</b><span>${s.name}</span><i></i></button>`).join("")}</div></div>`;
      wrap = container.querySelector(".ln-wrap"); canvas = container.querySelector("canvas"); ctx = canvas.getContext("2d");
      tip = container.querySelector(".ln-tip"); nav = container.querySelector(".ln-nav"); arrows = [...container.querySelectorAll(".ln-arrow")];
      followBtn = container.querySelector(".ln-follow");
      followBtn.onclick = () => { follow = !follow; targetX = null; setFollowBtn(); };
      nav.querySelectorAll(".ln-chip").forEach((b) => (b.onclick = () => goStation(+b.dataset.i)));
      setTimeout(() => container.querySelector(".ln-hint")?.classList.add("gone"), 5000);
      bindInput();
    },
    loadVideos(list) { for (const v of [...list].sort((a, b) => a.id - b.id)) if (!["published", "ready"].includes(v.status)) onVideo(v, v); },
    video: onVideo, deleted: onDeleted,
    select(k) { selected = k; const a = agents[k]; if (a) goStation(a.st); }, deselect() { selected = null; },
    start() { if (!running) { running = true; t0 = performance.now(); resize(); requestAnimationFrame(frame); } },
    stop() { running = false; },
  };
})();
