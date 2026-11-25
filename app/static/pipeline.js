/* Lugger Produktionslinie – command-centre view of the video pipeline (dashboard home).
 * All eight stations are visible at once (8 across, or 2×4 on narrow screens). Each bay shows
 * its operator agent at a holo console with the station's hologram; videos travel as glowing
 * tiles along the track underneath. No scrolling, no zoom: the layout always fits the card. */
"use strict";
(function () {
  const TAU = Math.PI * 2;
  const ICONS = {
    trend_scout: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 12l6-6",
    producer: "M4 10h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M4 10l1-4.5 15 3-.6 1.5 M9.5 5.6l1.2 3.4 M14.5 6.6l1.2 3.4",
    script_writer: "M16.5 3.5l4 4L8 20l-5 1 1-5z M14 6l4 4",
    voice: "M9 5.5a3 3 0 0 1 6 0V11a3 3 0 0 1-6 0z M5.5 11a6.5 6.5 0 0 0 13 0 M12 17.5V21",
    visuals: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 20",
    editor: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.2 7.8L20 19.5 M8.2 16.2L20 4.5",
    publisher: "M21 3L10.5 13.5 M21 3l-6.5 18-4-7.5L3 9.5z",
    automator: "M7 8h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z M12 8V4 M9 13.5h.01 M15 13.5h.01 M9.5 17h5",
    approve: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z M9 12l2 2 4-4",
  };
  const PRODUCT = {   // what the video looks like at each step
    0: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1V16h5v-.1c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z",
    1: "M9 4h6v3H9z M7 5.5H5.5v15h13v-15H17 M8.5 11h7M8.5 14.5h7M8.5 18h4",
    2: "M6 3h9l4 4v14H6z M14.5 3v4.5H19 M9 12h7M9 15.5h7M9 19h4",
    3: "M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2M21 12h0",
    4: "M4 5h16v14H4z M4 9h16M4 15h16M8 5v4M12 5v4M16 5v4M8 15v4M12 15v4M16 15v4",
    5: "M7 3h10a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 17 21H7a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 7 3z M10.5 9.5v5l4-2.5z",
    6: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z M9 12l2 2 4-4",
    7: "M21 3L10.5 13.5 M21 3l-6.5 18-4-7.5L3 9.5z",
  };
  const AGENT_COLOR = { trend_scout: "#38bdf8", producer: "#818cf8", script_writer: "#fbbf24", voice: "#fb7185",
    visuals: "#34d399", editor: "#fb923c", publisher: "#c084fc", automator: "#2dd4bf" };
  const ST = [
    { key: "radar", name: "Trend-Radar", sub: "Ideen", agent: "trend_scout", color: AGENT_COLOR.trend_scout },
    { key: "leit", name: "Leitstand", sub: "Planung", agent: "producer", color: AGENT_COLOR.producer },
    { key: "script", name: "Skript", sub: "Recherche & Text", agent: "script_writer", color: AGENT_COLOR.script_writer },
    { key: "audio", name: "Stimme", sub: "Einsprechen", agent: "voice", color: AGENT_COLOR.voice },
    { key: "archive", name: "Material", sub: "Stockvideos", agent: "visuals", color: AGENT_COLOR.visuals },
    { key: "cut", name: "Render", sub: "Schnitt", agent: "editor", color: AGENT_COLOR.editor },
    { key: "approve", name: "Freigabe", sub: "Du prüfst", agent: null, color: "#f59e0b" },
    { key: "send", name: "Upload", sub: "Plattformen", agent: "publisher", color: AGENT_COLOR.publisher },
  ];
  const STATUS_STEP = { queued: 1, scripting: 2, scripted: 2, voicing: 3, voiced: 3, sourcing: 4, visuals_ready: 4, rendering: 5, rendered: 5,
    awaiting_approval: 6, rejected: 6, approved: 7, publishing: 7, publish_failed: 7, published: 8, ready: 8 };
  const ERROR_STEP = { "Skript-Autor": 2, "Sprecher": 3, "Bild-Redakteur": 4, "Cutter": 5, "Publisher": 7 };
  const STATUS_COL = { working: "#38bdf8", idle: "#34d399", paused: "#64748b", error: "#f43f5e", waiting: "#f59e0b" };
  const PATHS = {};
  const icon = (d) => (PATHS[d] ||= new Path2D(d));
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let wrap, canvas, ctx, opts, tip, L = null, now = 0, t0 = performance.now(), running = false, selected = null;
  const tiles = new Map(), fx = [];
  const srv = (k) => (opts.getAgents()[k] || {});

  // ---------------- layout ----------------
  function layout() {
    const W = wrap.clientWidth;
    const cols = W >= 980 ? 8 : W >= 560 ? 4 : 2, rows = 8 / cols, pad = cols === 2 ? 8 : 14, gap = 10;
    const bw = (W - pad * 2 - gap * (cols - 1)) / cols;
    const bh = cols === 8 ? clamp(bw * 1.75, 250, 330) : cols === 4 ? clamp(bw * 1.45, 230, 300) : clamp(bw * 1.3, 220, 260);
    const rowH = bh + 64;
    const bays = ST.map((s, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = pad + c * (bw + gap), y = pad + r * rowH;
      return { ...s, i, x, y, w: bw, h: bh, cx: x + bw / 2, ty: y + bh + 34 };
    });
    return { W, H: pad + rows * rowH, cols, bw, bh, bays, pad };
  }
  function resize() {
    L = layout();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(L.W * dpr); canvas.height = Math.round(L.H * dpr);
    canvas.style.width = L.W + "px"; canvas.style.height = L.H + "px";
    for (const t of tiles.values()) { const p = anchor(t.step); if (!t.x) { t.x = p.x; t.y = p.y; } }
  }
  function anchor(step, k = 0) {
    const s = clamp(step, 0, 7), b = L.bays[s];
    const spread = Math.min(26, (b.w - 40) / 5);
    return { x: b.cx + (k ? (k % 2 ? -1 : 1) * Math.ceil(k / 2) * spread : 0), y: b.ty };
  }

  // ---------------- videos ----------------
  function stepFor(v) {
    if (v.status === "failed") { const m = /^\[([^\]]+)\]/.exec(v.error || ""); return m && ERROR_STEP[m[1]] != null ? ERROR_STEP[m[1]] : null; }
    return STATUS_STEP[v.status] ?? null;
  }
  function onVideo(v, prev) {
    let t = tiles.get(v.id);
    const st = stepFor(v);
    if (!t) {
      if (v.status === "published" || v.status === "ready") return;
      const start = !prev && v.status === "queued" ? 0 : (st ?? 1);
      t = { id: v.id, title: v.title || v.topic, status: v.status, step: start };
      if (L) { const p = anchor(start); t.x = p.x; t.y = p.y; }
      tiles.set(v.id, t);
      if (L) fx.push({ kind: "ring", x: t.x, y: t.y, t: now, color: ST[start].color });
    }
    t.title = v.title || v.topic; t.status = v.status;
    if (st != null && st < 8 && st !== t.step) { t.step = st; if (L) fx.push({ kind: "ring", x: anchor(st).x, y: anchor(st).y, t: now + 0.6, color: ST[st].color }); }
    if (st === 8 && !t.leaving) { t.leaving = true; t.step = 7; t.leaveAt = now + 0.8; }
  }
  function onDeleted(id) { tiles.delete(id); }

  // ---------------- simulation ----------------
  function step(dt) {
    const by = {};
    for (const t of tiles.values()) (by[t.step] ||= []).push(t);
    for (const list of Object.values(by)) list.sort((a, b) => a.id - b.id).forEach((t, k) => { const p = anchor(t.step, k); t.tx = p.x; t.ty = p.y; });
    for (const t of [...tiles.values()]) {
      if (t.x == null) { t.x = t.tx; t.y = t.ty; }
      const k = Math.min(1, dt * 3.2);
      t.x += (t.tx - t.x) * k; t.y += (t.ty - t.y) * k;
      if (t.leaving && now > t.leaveAt) { fx.push({ kind: "launch", x: t.x, y: t.y, t: now, life: 1.6 }); tiles.delete(t.id); }
    }
    for (let i = fx.length - 1; i >= 0; i--) if (now - fx[i].t > (fx[i].life || 1.2)) fx.splice(i, 1);
  }

  // ---------------- drawing ----------------
  function bayState(b) {
    if (b.key === "approve") return [...tiles.values()].some((t) => t.status === "awaiting_approval") ? "waiting" : "idle";
    return srv(b.agent).status || "idle";
  }
  function drawBay(c, b) {
    const s = srv(b.agent), state = bayState(b), col = b.color, busy = state === "working";
    const { x, y, w, h } = b;
    // shell
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, "#0d131d"); g.addColorStop(1, "#090d14");
    c.fillStyle = g; rr(c, x, y, w, h, 14); c.fill();
    c.strokeStyle = busy ? hexA(col, 0.55 + 0.2 * Math.sin(now * 3)) : state === "error" ? "rgba(244,63,94,.7)" : state === "waiting" ? `rgba(245,158,11,${0.5 + 0.3 * Math.sin(now * 4)})` : "rgba(148,163,184,.14)";
    c.lineWidth = busy || state !== "idle" ? 1.6 : 1; rr(c, x + 0.5, y + 0.5, w - 1, h - 1, 14); c.stroke();
    if (busy) { c.save(); c.shadowColor = hexA(col, 0.5); c.shadowBlur = 24; c.strokeStyle = hexA(col, 0.25); rr(c, x, y, w, h, 14); c.stroke(); c.restore(); }
    // floor grid
    c.save(); rr(c, x, y, w, h, 14); c.clip();
    const fy = y + h * 0.62;
    const fg = c.createLinearGradient(0, fy, 0, y + h); fg.addColorStop(0, hexA(col, 0.0)); fg.addColorStop(1, hexA(col, busy ? 0.14 : 0.06));
    c.fillStyle = fg; c.fillRect(x, fy, w, y + h - fy);
    c.strokeStyle = hexA(col, 0.1); c.lineWidth = 1;
    for (let k = 0; k < 6; k++) { const yy = fy + (k * k) * 3.2 + k * 6; c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke(); }
    for (let k = -4; k <= 4; k++) { c.beginPath(); c.moveTo(b.cx + k * w * 0.06, fy); c.lineTo(b.cx + k * w * 0.32, y + h); c.stroke(); }
    // hologram of the station's job
    drawHolo(c, b, busy);
    c.restore();
    // header
    c.fillStyle = col; c.beginPath(); c.arc(x + 20, y + 22, 11, 0, TAU); c.fill();
    c.fillStyle = "#05070b"; c.font = "800 12px 'JetBrains Mono', ui-monospace, Menlo, monospace"; c.textAlign = "center"; c.fillText(String(b.i + 1), x + 20, y + 26.5); c.textAlign = "left";
    c.fillStyle = "#e6edf7"; c.font = "700 14px Inter, -apple-system, sans-serif"; c.fillText(fit(c, b.name, w - 48), x + 38, y + 21);
    c.fillStyle = "#7b8aa3"; c.font = "500 11px Inter, -apple-system, sans-serif"; c.fillText(fit(c, b.agent ? (s.name || "") : "Du", w - 48), x + 38, y + 36);
    // status line
    const sc = STATUS_COL[state] || "#64748b";
    const label = { working: "AKTIV", idle: "BEREIT", paused: "PAUSE", error: "STÖRUNG", waiting: "WARTET AUF DICH" }[state] || state.toUpperCase();
    c.font = "600 10px 'JetBrains Mono', ui-monospace, Menlo, monospace";
    c.fillStyle = "rgba(9,13,20,.88)"; rr(c, x + 8, y + 44, c.measureText(label).width + 26, 17, 8.5); c.fill();
    c.fillStyle = sc; c.beginPath(); c.arc(x + 16, y + 52, 3.5, 0, TAU); c.fill();
    if (state === "working" || state === "waiting") { c.strokeStyle = hexA(sc, 0.4); c.lineWidth = 2; c.beginPath(); c.arc(x + 16, y + 52, 6 + Math.sin(now * 5), 0, TAU); c.stroke(); }
    c.font = "600 10px 'JetBrains Mono', ui-monospace, Menlo, monospace"; c.fillText(label, x + 26, y + 55.5);
    // queue badge
    const q = [...tiles.values()].filter((t) => t.step === b.i).length;
    if (q > 1) { const t = `${q} IN LINIE`; c.font = "700 9.5px 'JetBrains Mono', ui-monospace, monospace"; const tw = c.measureText(t).width + 12; c.fillStyle = hexA(col, 0.18); rr(c, x + w - tw - 8, y + 46, tw, 16, 8); c.fill(); c.fillStyle = col; c.fillText(t, x + w - tw - 2, y + 57.5); }
    // operator + console
    if (b.agent) drawOperator(c, b, s, busy, state);
    else drawReviewDesk(c, b, state);
    if (state === "paused") { c.fillStyle = "rgba(5,7,11,.55)"; rr(c, x, y + 66, w, h - 66, [0, 0, 14, 14]); c.fill(); c.fillStyle = "#94a3b8"; c.font = "700 12px 'JetBrains Mono', monospace"; c.textAlign = "center"; c.fillText("PAUSIERT", b.cx, y + h * 0.55); c.textAlign = "left"; }
    if (selected && selected === b.agent) { c.strokeStyle = "#e6edf7"; c.setLineDash([4, 5]); c.lineWidth = 1.5; rr(c, x - 3, y - 3, w + 6, h + 6, 16); c.stroke(); c.setLineDash([]); }
  }
  function fit(c, text, max) { if (c.measureText(text).width <= max) return text; let t = text; while (t.length > 1 && c.measureText(t + "…").width > max) t = t.slice(0, -1); return t + "…"; }
  function drawHolo(c, b, busy) {
    const col = b.color, cx = b.cx, cy = b.y + b.h * 0.36, R = Math.min(b.w * 0.28, 40);
    c.save(); c.globalAlpha = busy ? 0.95 : 0.45;
    const glow = c.createRadialGradient(cx, cy, 2, cx, cy, R * 1.6); glow.addColorStop(0, hexA(col, busy ? 0.28 : 0.12)); glow.addColorStop(1, hexA(col, 0));
    c.fillStyle = glow; c.beginPath(); c.arc(cx, cy, R * 1.6, 0, TAU); c.fill();
    c.strokeStyle = hexA(col, 0.9); c.fillStyle = hexA(col, 0.9); c.lineWidth = 1.5;
    const k = b.key, sp = busy ? 1 : 0.25;
    if (k === "radar") {
      for (const r of [R * 0.35, R * 0.7, R]) { c.globalAlpha *= 1; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke(); }
      const a = now * 2.4 * sp; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, a, a + 0.5); c.closePath(); c.fillStyle = hexA(col, 0.35); c.fill();
      for (let i = 0; i < 4; i++) { const bl = i * 1.7, d = R * (0.3 + (i * 0.17) % 0.6); c.fillStyle = hexA(col, Math.max(0.15, 1 - (((a - bl) % TAU + TAU) % TAU) / 3)); c.beginPath(); c.arc(cx + Math.cos(bl) * d, cy + Math.sin(bl) * d, 2.5, 0, TAU); c.fill(); }
    } else if (k === "leit") {
      for (let i = 0; i < 4; i++) { const hh = (0.3 + 0.7 * Math.abs(Math.sin(now * sp * 1.5 + i))) * R; c.fillStyle = hexA(col, 0.75); rr(c, cx - R + i * R * 0.52, cy + R * 0.6 - hh, R * 0.36, hh, 2); c.fill(); }
      c.strokeStyle = hexA(col, 0.6); c.beginPath(); c.moveTo(cx - R, cy + R * 0.62); c.lineTo(cx + R, cy + R * 0.62); c.stroke();
    } else if (k === "script") {
      for (let i = 0; i < 6; i++) { const ww = R * 2 * (0.45 + ((i * 37) % 50) / 100); const prog = busy ? Math.min(1, ((now * 0.8 + i * 0.2) % 1.6)) : 1; c.fillStyle = hexA(col, i === 0 ? 0.95 : 0.55); rr(c, cx - R, cy - R * 0.85 + i * R * 0.32, ww * prog, R * 0.13, 2); c.fill(); }
    } else if (k === "audio") {
      for (let i = 0; i < 15; i++) { const hh = busy ? (0.15 + 0.85 * Math.abs(Math.sin(now * 7 + i * 0.6))) * R : R * 0.15; c.fillStyle = hexA(col, 0.85); rr(c, cx - R + i * (R * 2 / 15), cy - hh / 2, R * 0.08, hh, 1); c.fill(); }
    } else if (k === "archive") {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const on = busy && Math.floor(now * 2) % 6 === i + j * 3; c.strokeStyle = hexA(col, on ? 1 : 0.5); c.fillStyle = hexA(col, on ? 0.35 : 0.08); rr(c, cx - R + i * R * 0.7, cy - R * 0.7 + j * R * 0.75, R * 0.6, R * 0.62, 3); c.fill(); c.stroke(); }
    } else if (k === "cut") {
      const pr = srv("editor").progress;
      c.beginPath(); c.arc(cx, cy, R * 0.85, -Math.PI / 2, -Math.PI / 2 + TAU * (busy && pr != null ? pr / 100 : 1)); c.lineWidth = 5; c.strokeStyle = hexA(col, busy ? 0.95 : 0.35); c.stroke();
      c.lineWidth = 1.5; c.strokeStyle = hexA(col, 0.4); c.beginPath(); c.arc(cx, cy, R * 0.6, now * sp, now * sp + 4); c.stroke();
      if (busy && pr != null) { c.fillStyle = "#e6edf7"; c.font = "700 13px 'JetBrains Mono', monospace"; c.textAlign = "center"; c.fillText(`${Math.round(pr)}%`, cx, cy + 4.5); c.textAlign = "left"; }
    } else if (k === "approve") {
      c.globalAlpha = 1; c.save(); c.translate(cx - R * 0.75, cy - R * 0.75); c.scale(R * 1.5 / 24, R * 1.5 / 24); c.lineWidth = 1.6; c.strokeStyle = hexA(col, busy ? 1 : 0.7); c.lineCap = "round"; c.lineJoin = "round"; c.stroke(icon(ICONS.approve)); c.restore();
    } else if (k === "send") {
      for (let i = 0; i < 3; i++) { const yy = cy + R * 0.7 - ((now * 40 * sp + i * R * 0.6) % (R * 1.6)); c.strokeStyle = hexA(col, 0.6); c.beginPath(); c.moveTo(cx - R * 0.5, yy + R * 0.25); c.lineTo(cx, yy); c.lineTo(cx + R * 0.5, yy + R * 0.25); c.stroke(); }
      ["#ff3b30", "#25c2d6", "#e1306c"].forEach((pc, i) => { c.fillStyle = pc; c.beginPath(); c.arc(cx - R * 0.6 + i * R * 0.6, cy + R * 0.95, 4, 0, TAU); c.fill(); });
    }
    c.restore();
  }
  function drawOperator(c, b, s, busy, state) {
    const col = b.color, cx = b.cx, foot = b.y + b.h - 30, S = clamp(b.h / 300, 0.75, 1.15);
    const breathe = Math.sin(now * 1.8 + b.i) * 1.2;
    c.save(); c.translate(cx, foot); c.scale(S, S);
    // ground ring
    c.strokeStyle = hexA(col, busy ? 0.7 : 0.3); c.lineWidth = 2; c.beginPath(); c.ellipse(0, 0, 34, 8, 0, 0, TAU); c.stroke();
    c.fillStyle = hexA(col, busy ? 0.18 : 0.08); c.beginPath(); c.ellipse(0, 0, 34, 8, 0, 0, TAU); c.fill();
    c.translate(0, breathe * 0.3);
    // legs
    const leg = (dx) => { const g = c.createLinearGradient(dx - 7, 0, dx + 7, 0); g.addColorStop(0, "#2a3446"); g.addColorStop(1, "#141a24"); c.fillStyle = g; c.beginPath(); c.moveTo(dx - 7, -62); c.lineTo(dx + 7, -62); c.lineTo(dx + 6, -4); c.lineTo(dx - 6, -4); c.closePath(); c.fill();
      c.fillStyle = "#0b0f16"; rr(c, dx - 8, -6, 16, 7, 3); c.fill(); c.fillStyle = hexA(col, 0.8); rr(c, dx - 5, -38, 10, 4, 2); c.fill(); };
    leg(-11); leg(11);
    // torso armour
    const tg = c.createLinearGradient(-26, -120, 26, -60); tg.addColorStop(0, "#3a4659"); tg.addColorStop(0.55, "#1f2836"); tg.addColorStop(1, "#121821");
    c.fillStyle = tg; c.beginPath(); c.moveTo(-24, -118 + breathe); c.quadraticCurveTo(0, -126 + breathe, 24, -118 + breathe); c.lineTo(19, -64); c.quadraticCurveTo(0, -58, -19, -64); c.closePath(); c.fill();
    c.strokeStyle = "rgba(255,255,255,.12)"; c.lineWidth = 1; c.stroke();
    // chest light & belt
    c.save(); c.shadowColor = col; c.shadowBlur = busy ? 14 : 6; c.fillStyle = hexA(col, busy ? 1 : 0.7);
    c.beginPath(); c.moveTo(-10, -104 + breathe); c.lineTo(10, -104 + breathe); c.lineTo(6, -88 + breathe); c.lineTo(-6, -88 + breathe); c.closePath(); c.fill(); c.restore();
    c.fillStyle = "#0b0f16"; rr(c, -19, -70, 38, 7, 3); c.fill(); c.fillStyle = hexA(col, 0.9); rr(c, -4, -69, 8, 5, 2); c.fill();
    // shoulders
    for (const sx of [-1, 1]) { const g = c.createRadialGradient(sx * 24, -118 + breathe, 2, sx * 24, -116 + breathe, 14); g.addColorStop(0, "#4b5870"); g.addColorStop(1, "#1a2230"); c.fillStyle = g; c.beginPath(); c.ellipse(sx * 25, -114 + breathe, 12, 9, 0, 0, TAU); c.fill(); c.fillStyle = hexA(col, 0.85); rr(c, sx * 25 - 6, -121 + breathe, 12, 3, 1.5); c.fill(); }
    // arms – working: hands on the console, idle: relaxed
    for (const sx of [-1, 1]) {
      const wob = busy ? Math.sin(now * 8 + sx) * 3 : 0;
      const ex = sx * (busy ? 30 : 30), ey = busy ? -92 : -88 + breathe;
      const hx = sx * (busy ? 16 : 28) + wob, hy = busy ? -78 + Math.cos(now * 8 + sx) * 2 : -64;
      c.strokeStyle = "#232c3b"; c.lineWidth = 9; c.lineCap = "round";
      c.beginPath(); c.moveTo(sx * 28, -112 + breathe); c.lineTo(ex, ey); c.lineTo(hx, hy); c.stroke();
      c.save(); c.shadowColor = col; c.shadowBlur = busy ? 10 : 0; c.fillStyle = busy ? hexA(col, 0.95) : "#3a4659"; c.beginPath(); c.arc(hx, hy, 4.5, 0, TAU); c.fill(); c.restore();
    }
    // head: helmet with glowing visor
    const hy = -140 + breathe;
    c.fillStyle = "#1a2230"; rr(c, -6, -126 + breathe, 12, 8, 3); c.fill();
    const hg = c.createLinearGradient(-15, hy - 16, 15, hy + 16); hg.addColorStop(0, "#4b5870"); hg.addColorStop(0.5, "#252f40"); hg.addColorStop(1, "#111720");
    c.fillStyle = hg; c.beginPath(); c.ellipse(0, hy, 15, 17, 0, 0, TAU); c.fill();
    c.strokeStyle = "rgba(255,255,255,.18)"; c.lineWidth = 1; c.beginPath(); c.ellipse(0, hy, 15, 17, 0, Math.PI * 1.1, Math.PI * 1.6); c.stroke();
    c.save(); c.shadowColor = col; c.shadowBlur = 12; c.fillStyle = hexA(col, busy ? 1 : 0.8);
    const vy = hy - 3 + (busy ? 1.5 : 0); rr(c, -12, vy, 24, 6.5, 3.25); c.fill(); c.restore();
    c.fillStyle = "rgba(255,255,255,.6)"; rr(c, -9, vy + 1, 6, 1.6, 0.8); c.fill();
    c.fillStyle = hexA(col, Math.sin(now * 3 + b.i) > 0 ? 1 : 0.4); c.beginPath(); c.arc(14, hy - 6, 2.2, 0, TAU); c.fill();
    if (state === "error") { c.fillStyle = "#f43f5e"; c.beginPath(); c.arc(16, hy - 18, 8, 0, TAU); c.fill(); c.fillStyle = "#fff"; c.font = "800 11px Inter, sans-serif"; c.textAlign = "center"; c.fillText("!", 16, hy - 14); c.textAlign = "left"; }
    c.restore();
    // holo console in front
    const cw = Math.min(b.w * 0.7, 120), cy = foot - 58 * S;
    c.save(); c.globalAlpha = busy ? 0.95 : 0.55;
    const pg = c.createLinearGradient(0, cy - 26, 0, cy + 8); pg.addColorStop(0, hexA(col, 0.32)); pg.addColorStop(1, hexA(col, 0.05));
    c.fillStyle = pg; c.beginPath(); c.moveTo(cx - cw / 2, cy); c.lineTo(cx + cw / 2, cy); c.lineTo(cx + cw / 2 - 10, cy - 24); c.lineTo(cx - cw / 2 + 10, cy - 24); c.closePath(); c.fill();
    c.strokeStyle = hexA(col, 0.9); c.lineWidth = 1.2; c.stroke();
    if (busy) {
      const pr = s.progress;
      for (let i = 0; i < 3; i++) { c.fillStyle = hexA(col, 0.8); c.fillRect(cx - cw / 2 + 16, cy - 19 + i * 6, ((now * 60 + i * 30) % (cw - 40)) + 8, 2); }
      if (pr != null) { c.fillStyle = hexA(col, 0.25); c.fillRect(cx - cw / 2 + 12, cy - 3, cw - 24, 2.5); c.fillStyle = col; c.fillRect(cx - cw / 2 + 12, cy - 3, (cw - 24) * pr / 100, 2.5); }
    }
    c.restore();
    // task line under the bay
    const task = busy ? (s.task || "") : state === "error" ? (s.task || "Fehler") : "";
    if (task) { c.font = "500 11px Inter, sans-serif"; c.fillStyle = state === "error" ? "#fda4af" : "#c7d2e3"; c.textAlign = "center"; c.fillText(fit(c, task, b.w - 16), cx, b.y + b.h - 10); c.textAlign = "left"; }
  }
  function drawReviewDesk(c, b, state) {
    const cx = b.cx, foot = b.y + b.h - 30, waiting = state === "waiting";
    c.save(); c.globalAlpha = waiting ? 1 : 0.5;
    c.strokeStyle = hexA(b.color, 0.8); c.lineWidth = 2; c.beginPath(); c.ellipse(cx, foot, 40, 9, 0, 0, TAU); c.stroke();
    c.font = "800 26px 'JetBrains Mono', monospace"; c.fillStyle = hexA(b.color, 0.9); c.textAlign = "center"; c.fillText("DU", cx, foot - 30);
    c.restore();
    if (waiting) { c.font = "600 11px Inter, sans-serif"; c.fillStyle = "#fcd34d"; c.textAlign = "center"; c.fillText("Klicken zum Prüfen", cx, b.y + b.h - 10); c.textAlign = "left"; }
  }
  function drawTrack(c) {
    const rows = {};
    for (const b of L.bays) (rows[Math.round(b.ty)] ||= []).push(b);
    for (const [ty, list] of Object.entries(rows)) {
      const y = +ty, x0 = list[0].x + 6, x1 = list[list.length - 1].x + list[list.length - 1].w - 6;
      c.strokeStyle = "rgba(148,163,184,.16)"; c.lineWidth = 6; c.lineCap = "round"; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
      c.strokeStyle = "rgba(56,189,248,.5)"; c.lineWidth = 2; c.setLineDash([3, 14]); c.lineDashOffset = -now * 30; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); c.setLineDash([]);
      for (const b of list) { c.fillStyle = "#0b1018"; c.strokeStyle = hexA(b.color, 0.6); c.lineWidth = 1.5; c.beginPath(); c.arc(b.cx, y, 5, 0, TAU); c.fill(); c.stroke(); }
      for (let i = 0; i < list.length - 1; i++) { const mx = (list[i].x + list[i].w + list[i + 1].x) / 2; c.fillStyle = "rgba(148,163,184,.4)"; c.beginPath(); c.moveTo(mx - 3, y - 5); c.lineTo(mx + 3, y); c.lineTo(mx - 3, y + 5); c.fill(); }
    }
  }
  function drawTile(c, t) {
    const col = t.status === "failed" || t.status === "publish_failed" ? "#f43f5e" : t.status === "awaiting_approval" ? "#f59e0b" : "#38bdf8";
    const x = t.x, y = t.y, s = 26;
    c.save(); c.shadowColor = col; c.shadowBlur = 14;
    c.fillStyle = "#0b1220"; rr(c, x - s / 2, y - s / 2, s, s, 7); c.fill(); c.restore();
    c.strokeStyle = col; c.lineWidth = 1.6; rr(c, x - s / 2, y - s / 2, s, s, 7); c.stroke();
    c.save(); c.translate(x - 8, y - 8); c.scale(16 / 24, 16 / 24); c.strokeStyle = col; c.lineWidth = 2; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(icon(PRODUCT[clamp(t.step, 0, 7)])); c.restore();
    c.font = "700 10px 'JetBrains Mono', monospace"; c.fillStyle = "#c7d2e3"; c.textAlign = "center"; c.fillText(`#${t.id}`, x, y + s / 2 + 12); c.textAlign = "left";
  }
  function drawFx(c) {
    for (const e of fx) {
      const k = (now - e.t) / (e.life || 1.2); if (k < 0) continue;
      if (e.kind === "ring") { c.strokeStyle = hexA(e.color, 1 - k); c.lineWidth = 2; c.beginPath(); c.arc(e.x, e.y, 10 + k * 26, 0, TAU); c.stroke(); }
      if (e.kind === "launch") { c.globalAlpha = 1 - k; c.strokeStyle = "#34d399"; c.lineWidth = 2; c.beginPath(); c.arc(e.x, e.y - k * 40, 12 + k * 10, 0, TAU); c.stroke();
        c.fillStyle = "#34d399"; c.font = "700 11px 'JetBrains Mono', monospace"; c.textAlign = "center"; c.fillText("ONLINE", e.x, e.y - 22 - k * 40); c.textAlign = "left"; c.globalAlpha = 1; }
    }
  }
  function frame() {
    if (!running) return;
    const tn = performance.now(), dt = Math.min(0.05, (tn - t0) / 1000); t0 = tn; now += dt;
    if (!L || Math.abs(L.W - wrap.clientWidth) > 1) resize();
    step(dt);
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, L.W, L.H);
    drawTrack(ctx);
    for (const b of L.bays) drawBay(ctx, b);
    for (const t of tiles.values()) drawTile(ctx, t);
    drawFx(ctx);
    requestAnimationFrame(frame);
  }

  // ---------------- input ----------------
  function hit(e) {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (const t of tiles.values()) if (Math.abs(x - t.x) < 16 && Math.abs(y - t.y) < 18) return { type: "tile", t };
    const b = L.bays.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    return b ? { type: "bay", b } : null;
  }
  function bindInput() {
    canvas.addEventListener("mousemove", (e) => {
      const h = hit(e); canvas.style.cursor = h ? "pointer" : "default";
      if (!h) { tip.hidden = true; return; }
      const r = wrap.getBoundingClientRect();
      tip.textContent = h.type === "tile" ? `#${h.t.id} · ${h.t.title}` : `${h.b.i + 1}. ${h.b.name} – ${h.b.agent ? (srv(h.b.agent).task || h.b.sub) : "Videos, die auf deine Freigabe warten"}`;
      tip.hidden = false; tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 260) + "px"; tip.style.top = e.clientY - r.top + 16 + "px";
    });
    canvas.addEventListener("mouseleave", () => (tip.hidden = true));
    canvas.addEventListener("click", (e) => {
      const h = hit(e); if (!h) return;
      if (h.type === "tile") return opts.openVideo(h.t.id);
      if (h.b.key === "approve") { const w = [...tiles.values()].filter((t) => t.status === "awaiting_approval").sort((a, b) => a.id - b.id)[0]; if (w) opts.openVideo(w.id); return; }
      selected = h.b.agent; opts.onAgent?.(h.b.agent);
    });
    new ResizeObserver(() => resize()).observe(wrap);
  }

  window.Pipeline = {
    ICONS, AGENT_COLOR, STEPS: ST, STATUS_STEP,
    init(container, options) {
      opts = options;
      container.innerHTML = `<div class="pl-wrap"><canvas class="pl-canvas" aria-label="Produktionslinie: acht Stationen, Videos wandern von links nach rechts"></canvas><div class="pl-tip" hidden></div></div>`;
      wrap = container.querySelector(".pl-wrap"); canvas = container.querySelector("canvas"); ctx = canvas.getContext("2d"); tip = container.querySelector(".pl-tip");
      bindInput();
    },
    loadVideos(list) { for (const v of [...list].sort((a, b) => a.id - b.id)) if (!["published", "ready"].includes(v.status)) onVideo(v, v); },
    video: onVideo, deleted: onDeleted,
    select(k) { selected = k; }, deselect() { selected = null; },
    start() { if (!running) { running = true; t0 = performance.now(); resize(); requestAnimationFrame(frame); } },
    stop() { running = false; },
  };
})();
