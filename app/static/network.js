/* Lugger Agenten-Netzwerk – the agent station as a live node graph (dashboard home).
 * Agents are glowing nodes, videos are data packets that glide along the edges and orbit the node
 * that is working on them. Published videos fly into the cloud node. Your automations hang off the
 * Automator hub; dashed edges show which pipeline event triggers them. Fixed layout, always fits. */
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
    cloud: "M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9.5z",
    bolt: "M13 2.5L4.5 13.5h6.5l-1 8 8.5-11h-6.5z",
  };
  const AGENT_COLOR = { trend_scout: "#38bdf8", producer: "#818cf8", script_writer: "#fbbf24", voice: "#fb7185",
    visuals: "#34d399", editor: "#fb923c", publisher: "#c084fc", automator: "#2dd4bf" };
  const NODES = [
    { key: "radar", agent: "trend_scout", role: "Ideen finden" },
    { key: "leit", agent: "producer", role: "Produktion planen" },
    { key: "script", agent: "script_writer", role: "Skript schreiben" },
    { key: "audio", agent: "voice", role: "Einsprechen" },
    { key: "archive", agent: "visuals", role: "Material suchen" },
    { key: "cut", agent: "editor", role: "Video rendern" },
    { key: "approve", agent: null, role: "Deine Freigabe" },
    { key: "send", agent: "publisher", role: "Hochladen" },
  ];
  const STATUS_STEP = { queued: 1, scripting: 2, scripted: 2, voicing: 3, voiced: 3, sourcing: 4, visuals_ready: 4, rendering: 5, rendered: 5,
    awaiting_approval: 6, rejected: 6, approved: 7, publishing: 7, publish_failed: 7, published: 8, ready: 8 };
  const ERROR_STEP = { "Skript-Autor": 2, "Sprecher": 3, "Bild-Redakteur": 4, "Cutter": 5, "Publisher": 7 };
  const EVENT_NODE = { "video.created": 1, "video.ready": 6, "video.approved": 6, "video.published": 8, "ideas.found": 0 };
  const STATUS_COL = { working: "#38bdf8", idle: "#34d399", paused: "#64748b", error: "#f43f5e", waiting: "#f59e0b" };
  const PATHS = {};
  const icon = (d) => (PATHS[d] ||= new Path2D(d));
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;

  let wrap, canvas, ctx, opts, tip, L = null, now = 0, t0 = performance.now(), running = false, selected = null;
  const packets = new Map(), fx = [];
  let online = 0;
  const srv = (k) => (opts.getAgents()[k] || {});
  const autos = () => (opts.getAutos?.() || []);

  // ---------------- layout ----------------
  function layout() {
    const W = wrap.clientWidth, narrow = W < 760;
    const R = narrow ? 24 : clamp(W / 40, 26, 34);
    let pos = [], cloud, hub, H;
    if (!narrow) {
      const xs = [0.1, 0.37, 0.63, 0.9].map((f) => W * f), y1 = 86, y2 = 268, y3 = 444;
      pos = [[xs[0], y1], [xs[1], y1], [xs[2], y1], [xs[3], y1], [xs[3], y2], [xs[2], y2], [xs[1], y2], [xs[0], y2]];
      cloud = { x: xs[0], y: y3 }; hub = { x: W * 0.5, y: y3 }; H = 548;
    } else {
      const x = 46, gap = 92;
      pos = NODES.map((_, i) => [x, 54 + i * gap]);
      cloud = { x, y: 54 + 8 * gap }; hub = { x, y: 54 + 9 * gap + 20 }; H = hub.y + 60 + Math.max(1, Math.min(6, autos().length)) * 58;
    }
    const nodes = NODES.map((n, i) => ({ ...n, i, x: pos[i][0], y: pos[i][1], r: n.key === "approve" ? R * 0.95 : R }));
    // automation satellites around the hub
    const list = autos().slice(0, 7);
    const sats = list.map((a, k) => {
      if (narrow) return { a, x: hub.x + 30, y: hub.y + 66 + k * 58 };
      const n = list.length, ang = n === 1 ? 0 : -1.05 + (2.1 * k) / (n - 1);
      return { a, x: hub.x + Math.cos(ang) * 190, y: hub.y + Math.sin(ang) * 78 };
    });
    return { W, H, R, narrow, nodes, cloud, hub, sats, more: Math.max(0, autos().length - 7) };
  }
  function resize() {
    L = layout();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(L.W * dpr); canvas.height = Math.round(L.H * dpr);
    canvas.style.width = L.W + "px"; canvas.style.height = L.H + "px";
  }
  const nodePos = (i) => (i >= 8 ? L.cloud : L.nodes[clamp(i, 0, 7)]);

  // ---------------- packets (videos) ----------------
  function stepFor(v) {
    if (v.status === "failed") { const m = /^\[([^\]]+)\]/.exec(v.error || ""); return m && ERROR_STEP[m[1]] != null ? ERROR_STEP[m[1]] : null; }
    return STATUS_STEP[v.status] ?? null;
  }
  function onVideo(v, prev) {
    let p = packets.get(v.id);
    const st = stepFor(v);
    if (!p) {
      if (v.status === "published" || v.status === "ready") return;
      const start = !prev && v.status === "queued" ? 0 : (st ?? 1);
      p = { id: v.id, title: v.title || v.topic, status: v.status, at: start, route: [], seg: 0, born: now };
      packets.set(v.id, p);
      if (L) fx.push({ kind: "ring", node: start, t: now });
    }
    p.title = v.title || v.topic; p.status = v.status;
    if (st != null) {
      const last = p.route.length ? p.route[p.route.length - 1] : p.at;
      if (st > last) for (let k = last + 1; k <= st; k++) p.route.push(k);
      else if (st < last && !p.route.length) p.at = st;          // re-render: jump back
    }
  }
  function onDeleted(id) { packets.delete(id); }
  function step(dt) {
    for (const p of [...packets.values()]) {
      if (p.route.length) {
        p.seg += dt * (1.1 + p.route.length * 0.6);
        if (p.seg >= 1) { p.seg = 0; p.at = p.route.shift(); fx.push({ kind: "ring", node: p.at, t: now }); if (p.at >= 8) { online++; fx.push({ kind: "online", t: now, life: 1.6 }); packets.delete(p.id); } }
      }
    }
    for (let i = fx.length - 1; i >= 0; i--) if (now - fx[i].t > (fx[i].life || 1.1)) fx.splice(i, 1);
  }
  function packetXY(p, orbitIndex, orbitCount) {
    if (p.route.length) {
      const a = nodePos(p.at), b = nodePos(p.route[0]), k = p.seg * p.seg * (3 - 2 * p.seg);
      return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), moving: true };
    }
    const n = nodePos(p.at), r = (n.r || L.R) + 14, ang = now * 0.9 + (orbitIndex * TAU) / Math.max(1, orbitCount);
    return { x: n.x + Math.cos(ang) * r, y: n.y + Math.sin(ang) * r * 0.82, moving: false };
  }

  // ---------------- drawing ----------------
  function nodeState(n) {
    if (n.key === "approve") return [...packets.values()].some((p) => p.status === "awaiting_approval" && !p.route.length) ? "waiting" : "idle";
    return srv(n.agent).status || "idle";
  }
  function nodeColor(n) { return n.key === "approve" ? "#f59e0b" : AGENT_COLOR[n.agent]; }
  function edge(c, a, b, col, active, dashed) {
    c.strokeStyle = "rgba(148,163,184,.16)"; c.lineWidth = 2; c.setLineDash(dashed ? [4, 6] : []);
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    c.setLineDash(dashed ? [2, 10] : [3, 13]); c.lineDashOffset = -now * (active ? 46 : 14);
    c.strokeStyle = hexA(col, active ? 0.85 : 0.35); c.lineWidth = active ? 2.4 : 1.6;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.setLineDash([]);
    if (!dashed) { // direction chevron in the middle
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ang = Math.atan2(b.y - a.y, b.x - a.x);
      c.save(); c.translate(mx, my); c.rotate(ang); c.fillStyle = hexA(col, 0.6); c.beginPath(); c.moveTo(-4, -5); c.lineTo(4, 0); c.lineTo(-4, 5); c.fill(); c.restore();
    }
  }
  function drawEdges(c) {
    for (let i = 0; i < 7; i++) {
      const a = L.nodes[i], b = L.nodes[i + 1];
      const active = nodeState(a) === "working" || nodeState(b) === "working" || [...packets.values()].some((p) => p.route.length && p.at === i);
      edge(c, a, b, nodeColor(b), active, false);
    }
    edge(c, L.nodes[7], L.cloud, "#c084fc", [...packets.values()].some((p) => p.route[0] === 8), false);
    // automations
    const hubActive = autos().some((a) => a.running);
    for (const s of L.sats) {
      edge(c, L.hub, s, "#2dd4bf", s.a.running, false);
      const ev = s.a.trigger?.type === "event" ? EVENT_NODE[s.a.trigger.event] : null;
      if (ev != null && !L.narrow) edge(c, nodePos(ev), s, "#2dd4bf", s.a.running, true);
    }
    void hubActive;
  }
  function fit(c, text, max) { if (c.measureText(text).width <= max) return text; let t = text; while (t.length > 1 && c.measureText(t + "…").width > max) t = t.slice(0, -1); return t + "…"; }
  function label(c, x, y, title, sub, subCol, align = "center", maxW = 170) {
    c.textAlign = align;
    c.font = "700 13px Inter, -apple-system, sans-serif"; c.fillStyle = "#e6edf7"; c.fillText(fit(c, title, maxW), x, y);
    if (sub) { c.font = "500 11.5px Inter, -apple-system, sans-serif"; c.fillStyle = subCol || "#8b9ab3"; c.fillText(fit(c, sub, maxW), x, y + 16); }
    c.textAlign = "left";
  }
  function drawNode(c, n) {
    const st = nodeState(n), col = nodeColor(n), s = n.agent ? srv(n.agent) : {}, busy = st === "working", { x, y, r } = n;
    // glow
    const g = c.createRadialGradient(x, y, r * 0.4, x, y, r * (busy || st === "waiting" ? 2.6 : 1.8));
    g.addColorStop(0, hexA(col, busy || st === "waiting" ? 0.32 + 0.1 * Math.sin(now * 3) : 0.12)); g.addColorStop(1, hexA(col, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.6, 0, TAU); c.fill();
    // body
    c.save(); c.translate(x, y);
    if (n.key === "approve") { c.rotate(Math.PI / 4); const s2 = r * 1.4; const bg = c.createLinearGradient(-s2 / 2, -s2 / 2, s2 / 2, s2 / 2); bg.addColorStop(0, "#1a2232"); bg.addColorStop(1, "#0b1018"); c.fillStyle = bg; rr(c, -s2 / 2, -s2 / 2, s2, s2, 8); c.fill();
      c.strokeStyle = hexA(col, st === "waiting" ? 0.6 + 0.4 * Math.sin(now * 4) : 0.5); c.lineWidth = 2.5; rr(c, -s2 / 2, -s2 / 2, s2, s2, 8); c.stroke(); c.rotate(-Math.PI / 4); }
    else {
      const bg = c.createLinearGradient(-r, -r, r, r); bg.addColorStop(0, "#1a2232"); bg.addColorStop(1, "#0b1018");
      c.fillStyle = bg; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
      c.strokeStyle = hexA(col, 0.3); c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
      if (busy) { const pr = s.progress != null ? s.progress / 100 : (now * 0.4) % 1; c.strokeStyle = col; c.lineWidth = 3.5; c.lineCap = "round";
        c.beginPath(); s.progress != null ? c.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + TAU * pr) : c.arc(0, 0, r, now * 3, now * 3 + 1.4); c.stroke(); c.lineCap = "butt"; }
      if (st === "error") { c.strokeStyle = `rgba(244,63,94,${0.6 + 0.4 * Math.sin(now * 6)})`; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r + 4, 0, TAU); c.stroke(); }
      if (selected && selected === n.agent) { c.strokeStyle = "#e6edf7"; c.setLineDash([3, 4]); c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, r + 9, now, now + TAU); c.stroke(); c.setLineDash([]); }
    }
    const is = r * 0.95; c.save(); c.translate(-is / 2, -is / 2); c.scale(is / 24, is / 24);
    c.strokeStyle = st === "paused" ? "#64748b" : col; c.lineWidth = 2; c.lineCap = "round"; c.lineJoin = "round";
    if (busy || st === "waiting") { c.shadowColor = col; c.shadowBlur = 10; }
    c.stroke(icon(n.agent ? ICONS[n.agent] : ICONS.approve)); c.restore();
    // status dot
    c.fillStyle = STATUS_COL[st] || "#64748b"; c.beginPath(); c.arc(r * 0.72, -r * 0.72, 5, 0, TAU); c.fill();
    c.strokeStyle = "#06080c"; c.lineWidth = 2; c.stroke();
    // step number
    c.fillStyle = "#06080c"; c.beginPath(); c.arc(-r * 0.72, -r * 0.72, 9, 0, TAU); c.fill(); c.strokeStyle = hexA(col, 0.8); c.lineWidth = 1.5; c.stroke();
    c.fillStyle = col; c.font = "700 10px 'JetBrains Mono', monospace"; c.textAlign = "center"; c.fillText(String(n.i + 1), -r * 0.72, -r * 0.72 + 3.5); c.textAlign = "left";
    c.restore();
    // queue badge
    const q = [...packets.values()].filter((p) => !p.route.length && p.at === n.i).length;
    // labels
    const name = n.agent ? (s.name || n.agent) : "Du · Freigabe";
    let sub = n.role, subCol;
    if (st === "working") { sub = s.task || n.role; subCol = hexA(col, 1); }
    else if (st === "error") { sub = s.task || "Fehler"; subCol = "#fb7185"; }
    else if (st === "paused") { sub = "Pausiert"; subCol = "#64748b"; }
    else if (st === "waiting") { sub = `${q} ${q === 1 ? "Video wartet" : "Videos warten"} – klicken`; subCol = "#fcd34d"; }
    else if (n.key === "radar") sub = `${opts.getStats()?.ideas ?? 0} Ideen im Speicher`;
    else if (n.key === "leit" && s.next_slot) sub = `Nächstes: ${new Date(s.next_slot).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
    if (L.narrow) label(c, x + r + 18, y - 2, name, sub, subCol, "left", L.W - x - r - 30);
    else label(c, x, y + r + 26, name, sub, subCol, "center", Math.min(190, L.W * 0.24));
    if (q > 1 && n.key !== "approve") { c.font = "700 10px 'JetBrains Mono', monospace"; const t = `${q} IN LINIE`, tw = c.measureText(t).width + 12;
      const bx = L.narrow ? x - tw / 2 : x - tw / 2, by = L.narrow ? y + r + 6 : y + r + 50; c.fillStyle = hexA(col, 0.16); rr(c, bx, by, tw, 16, 8); c.fill(); c.fillStyle = col; c.fillText(t, bx + 6, by + 11.5); }
  }
  function drawCloud(c) {
    const { x, y } = L.cloud, w = L.narrow ? 48 : 168, h = 52;
    const pulse = fx.some((e) => e.kind === "online");
    c.save(); c.shadowColor = "#c084fc"; c.shadowBlur = pulse ? 30 : 12;
    c.fillStyle = "#121a28"; rr(c, x - w / 2, y - h / 2, w, h, 26); c.fill(); c.restore();
    c.strokeStyle = hexA("#c084fc", pulse ? 0.95 : 0.45); c.lineWidth = 1.6; rr(c, x - w / 2, y - h / 2, w, h, 26); c.stroke();
    c.save(); c.translate(L.narrow ? x - 12 : x - w / 2 + 14, y - 12); c.strokeStyle = "#c084fc"; c.lineWidth = 2; c.lineJoin = "round"; c.stroke(icon(ICONS.cloud)); c.restore();
    if (!L.narrow) {
      ["#ff3b30", "#25c2d6", "#e1306c"].forEach((pc, k) => { c.fillStyle = pc; c.beginPath(); c.arc(x - w / 2 + 52 + k * 15, y - 6, 4.5, 0, TAU); c.fill(); });
      c.font = "700 13px 'JetBrains Mono', monospace"; c.fillStyle = "#e6edf7"; c.fillText(`${(opts.getStats()?.published ?? 0)}`, x - w / 2 + 100, y - 2);
      c.font = "500 10.5px Inter, sans-serif"; c.fillStyle = "#8b9ab3"; c.fillText("Videos online", x - w / 2 + 46, y + 13);
    } else label(c, x + 40, y - 2, "Online", `${opts.getStats()?.published ?? 0} Videos auf YouTube · TikTok · Instagram`, null, "left", L.W - x - 50);
  }
  function drawHub(c) {
    const { x, y } = L.hub, list = autos(), running = list.filter((a) => a.running).length, r = L.R * 0.9;
    const g = c.createRadialGradient(x, y, 3, x, y, r * 2.4); g.addColorStop(0, hexA("#2dd4bf", running ? 0.35 : 0.12)); g.addColorStop(1, hexA("#2dd4bf", 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.4, 0, TAU); c.fill();
    c.fillStyle = "#101a22"; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.strokeStyle = hexA("#2dd4bf", running ? 0.9 : 0.4); c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
    if (running) { c.strokeStyle = "#2dd4bf"; c.lineWidth = 3; c.lineCap = "round"; c.beginPath(); c.arc(x, y, r, now * 4, now * 4 + 1.2); c.stroke(); c.lineCap = "butt"; }
    const is = r * 0.95; c.save(); c.translate(x - is / 2, y - is / 2); c.scale(is / 24, is / 24); c.strokeStyle = "#2dd4bf"; c.lineWidth = 2; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(icon(ICONS.automator)); c.restore();
    const sub = running ? `${running} läuft gerade` : `${list.filter((a) => a.enabled).length} aktiv`;
    if (L.narrow) label(c, x + r + 18, y - 2, "Automator", sub, running ? "#2dd4bf" : null, "left", L.W - x - r - 30);
    else label(c, x, y + r + 24, "Automator", sub, running ? "#2dd4bf" : null);
    for (const s of L.sats) {
      const a = s.a, col = a.running ? "#2dd4bf" : !a.enabled ? "#475569" : ({ success: "#34d399", error: "#f43f5e", skipped: "#64748b" }[a.last_status] || "#2dd4bf");
      if (a.running) { c.fillStyle = hexA("#2dd4bf", 0.25 + 0.15 * Math.sin(now * 6)); c.beginPath(); c.arc(s.x, s.y, 22, 0, TAU); c.fill();
        const k = (now * 1.3) % 1; c.fillStyle = "#7dfff6"; c.beginPath(); c.arc(lerp(x, s.x, k), lerp(y, s.y, k), 3.5, 0, TAU); c.fill(); }
      c.fillStyle = "#0e151f"; c.beginPath(); c.arc(s.x, s.y, 15, 0, TAU); c.fill();
      c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(s.x, s.y, 15, 0, TAU); c.stroke();
      c.save(); c.translate(s.x - 8, s.y - 8); c.scale(16 / 24, 16 / 24); c.strokeStyle = col; c.lineWidth = 2.2; c.lineJoin = "round"; c.stroke(icon(ICONS.bolt)); c.restore();
      c.font = "600 11.5px Inter, sans-serif"; c.fillStyle = a.enabled ? "#c7d2e3" : "#64748b";
      c.fillText(fit(c, a.name, L.narrow ? L.W - s.x - 40 : 150), s.x + 22, s.y + 4);
    }
    if (L.more) { c.font = "500 11px Inter, sans-serif"; c.fillStyle = "#8b9ab3"; c.fillText(`+${L.more} weitere`, L.narrow ? x + 52 : x + 210, L.narrow ? L.H - 14 : y + 112); }
    if (!list.length) { c.font = "500 11.5px Inter, sans-serif"; c.fillStyle = "#64748b"; c.fillText("Noch keine Automatisierungen – klicke den Automator an", L.narrow ? x + 40 : x + 40, L.narrow ? y + 50 : y + 4); }
  }
  function drawPackets(c) {
    const at = {};
    for (const p of packets.values()) if (!p.route.length) (at[p.at] ||= []).push(p);
    for (const p of packets.values()) {
      const list = at[p.at] || [p], k = list.indexOf(p);
      const q = packetXY(p, Math.max(0, k), list.length);
      p._x = q.x; p._y = q.y;
      const col = p.status === "failed" || p.status === "publish_failed" ? "#f43f5e" : p.status === "awaiting_approval" ? "#f59e0b" : "#7dd3fc";
      if (q.moving) { const a = nodePos(p.at), ang = Math.atan2(nodePos(p.route[0]).y - a.y, nodePos(p.route[0]).x - a.x);
        const tr = c.createLinearGradient(q.x - Math.cos(ang) * 30, q.y - Math.sin(ang) * 30, q.x, q.y); tr.addColorStop(0, hexA(col, 0)); tr.addColorStop(1, hexA(col, 0.8));
        c.strokeStyle = tr; c.lineWidth = 4; c.lineCap = "round"; c.beginPath(); c.moveTo(q.x - Math.cos(ang) * 30, q.y - Math.sin(ang) * 30); c.lineTo(q.x, q.y); c.stroke(); c.lineCap = "butt"; }
      c.save(); c.shadowColor = col; c.shadowBlur = 12; c.fillStyle = col; c.beginPath(); c.arc(q.x, q.y, 6, 0, TAU); c.fill(); c.restore();
      c.fillStyle = "#06080c"; c.beginPath(); c.arc(q.x, q.y, 2.2, 0, TAU); c.fill();
      c.font = "700 10px 'JetBrains Mono', monospace"; c.fillStyle = col; c.fillText(`#${p.id}`, q.x + 9, q.y - 6);
    }
  }
  function drawFx(c) {
    for (const e of fx) {
      const k = (now - e.t) / (e.life || 1.1);
      if (e.kind === "ring") { const n = nodePos(e.node); c.strokeStyle = `rgba(125,211,252,${1 - k})`; c.lineWidth = 2; c.beginPath(); c.arc(n.x, n.y, (n.r || L.R) + k * 26, 0, TAU); c.stroke(); }
      if (e.kind === "online") { const { x, y } = L.cloud; c.globalAlpha = 1 - k; c.fillStyle = "#34d399"; c.font = "700 12px 'JetBrains Mono', monospace"; c.textAlign = "center"; c.fillText("ONLINE ✓", x, y - 34 - k * 20); c.textAlign = "left"; c.globalAlpha = 1; }
    }
  }
  function frame() {
    if (!running) return;
    const tn = performance.now(), dt = Math.min(0.05, (tn - t0) / 1000); t0 = tn; now += dt;
    const want = layout(); if (!L || want.W !== L.W || want.H !== L.H || want.sats.length !== L.sats.length) resize(); else L = { ...L, sats: want.sats, more: want.more };
    step(dt);
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, L.W, L.H);
    drawEdges(ctx); drawCloud(ctx); drawHub(ctx);
    for (const n of L.nodes) drawNode(ctx, n);
    drawPackets(ctx); drawFx(ctx);
    requestAnimationFrame(frame);
  }

  // ---------------- input ----------------
  function hit(e) {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (const p of packets.values()) if (p._x != null && Math.hypot(x - p._x, y - p._y) < 11) return { type: "packet", p };
    for (const n of L.nodes) if (Math.hypot(x - n.x, y - n.y) < n.r + 8) return { type: "node", n };
    for (const s of L.sats) if (Math.hypot(x - s.x, y - s.y) < 18 || (x > s.x && x < s.x + 170 && Math.abs(y - s.y) < 12)) return { type: "auto", a: s.a };
    if (Math.hypot(x - L.hub.x, y - L.hub.y) < L.R + 6) return { type: "hub" };
    if (Math.abs(x - L.cloud.x) < 90 && Math.abs(y - L.cloud.y) < 30) return { type: "cloud" };
    return null;
  }
  function bindInput() {
    canvas.addEventListener("mousemove", (e) => {
      const h = hit(e); canvas.style.cursor = h ? "pointer" : "default";
      if (!h) { tip.hidden = true; return; }
      const r = wrap.getBoundingClientRect();
      tip.textContent = h.type === "packet" ? `#${h.p.id} · ${h.p.title}` : h.type === "node" ? `${h.n.i + 1}. ${h.n.agent ? srv(h.n.agent).name : "Freigabe"} – ${h.n.agent ? (srv(h.n.agent).task || h.n.role) : "Videos, die auf dich warten"}`
        : h.type === "auto" ? `Automatisierung: ${h.a.name}` : h.type === "hub" ? "Automator – alle Automatisierungen" : "Veröffentlichte Videos";
      tip.hidden = false; tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 260) + "px"; tip.style.top = e.clientY - r.top + 16 + "px";
    });
    canvas.addEventListener("mouseleave", () => (tip.hidden = true));
    canvas.addEventListener("click", (e) => {
      const h = hit(e); if (!h) return;
      if (h.type === "packet") return opts.openVideo(h.p.id);
      if (h.type === "node") {
        if (h.n.key === "approve") { const w = [...packets.values()].filter((p) => p.status === "awaiting_approval").sort((a, b) => a.id - b.id)[0]; if (w) opts.openVideo(w.id); return; }
        selected = h.n.agent; return opts.onAgent?.(h.n.agent);
      }
      if (h.type === "auto") return opts.onAutomation?.(h.a.id);
      if (h.type === "hub") return opts.onAutomations?.();
      if (h.type === "cloud") return opts.onPublished?.();
    });
    new ResizeObserver(() => resize()).observe(wrap);
  }

  window.Network = {
    ICONS, AGENT_COLOR, STATUS_STEP,
    init(container, options) {
      opts = options;
      container.innerHTML = `<div class="nw-wrap"><canvas class="nw-canvas" aria-label="Agenten-Netzwerk: Videos fließen von Agent zu Agent"></canvas><div class="pl-tip" hidden></div></div>`;
      wrap = container.querySelector(".nw-wrap"); canvas = container.querySelector("canvas"); ctx = canvas.getContext("2d"); tip = container.querySelector(".pl-tip");
      bindInput();
    },
    loadVideos(list) { for (const v of [...list].sort((a, b) => a.id - b.id)) if (!["published", "ready"].includes(v.status)) onVideo(v, v); },
    video: onVideo, deleted: onDeleted,
    select(k) { selected = k; }, deselect() { selected = null; },
    start() { if (!running) { running = true; t0 = performance.now(); resize(); requestAnimationFrame(frame); } },
    stop() { running = false; },
  };
})();
