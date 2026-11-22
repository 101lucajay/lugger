/* Lugger Factory – isometric live view of the whole operation.
 * One big underground hall: eight departments along a central walkway plus the
 * Automations-Werk. Agents work at their stations, carry each video as a crate to the
 * next department, and a robot runs your general automations.
 * Pure Canvas 2D: depth-sorted iso boxes, day/night palette from the page theme. */
"use strict";
(function () {
  const TAU = Math.PI * 2, S2 = Math.SQRT2;
  const HW = 32, HH = 16, ZS = 38;          // half tile width/height, px per z unit
  const HX = 44, HY = 24;                   // hall size in tiles
  const LANE = 12;                          // walkway centre line (y)
  const iso = (x, y, z = 0) => ({ x: (x - y) * HW, y: (x + y) * HH - z * ZS });

  // ---------------- icons & colours (shared with the dashboard) ----------------
  const ICONS = {
    trend_scout: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 12l6-6",
    producer: "M4 10h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M4 10l1-4.5 15 3-.6 1.5 M9.5 5.6l1.2 3.4 M14.5 6.6l1.2 3.4",
    script_writer: "M16.5 3.5l4 4L8 20l-5 1 1-5z M14 6l4 4",
    voice: "M9 5.5a3 3 0 0 1 6 0V11a3 3 0 0 1-6 0z M5.5 11a6.5 6.5 0 0 0 13 0 M12 17.5V21",
    visuals: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 20",
    editor: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.2 7.8L20 19.5 M8.2 16.2L20 4.5",
    publisher: "M21 3L10.5 13.5 M21 3l-6.5 18-4-7.5L3 9.5z",
    automator: "M7 8h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z M12 8V4 M12 4h.01 M9 13.5h.01 M15 13.5h.01 M9.5 17h5",
  };
  const AGENT_COLOR = { trend_scout: "#0a84ff", producer: "#5e5ce6", script_writer: "#f5a700", voice: "#ff375f",
    visuals: "#30b45a", editor: "#ff6a2b", publisher: "#bf5af2", automator: "#00c7be" };
  const SKIN = { trend_scout: "#f1c27d", producer: "#c68642", script_writer: "#ffdbac", voice: "#e0ac69", visuals: "#8d5524", editor: "#f1c27d", publisher: "#ffdbac" };
  const HAIR = { trend_scout: "#3b2a1a", producer: "#111", script_writer: "#b5651d", voice: "#2b1b10", visuals: "#111", editor: "#5a3b22", publisher: "#d9b26b" };

  // ---------------- layout ----------------
  const Z = (key, name, sub, x, y, w, h, color, row) => ({ key, name, sub, x, y, w, h, color, row });
  const ZONES = [
    Z("radar", "Trend-Radar", "Recherche", 0, 0, 9, 10, "#0a84ff", "A"),
    Z("leit", "Leitstand", "Planung", 9, 0, 9, 10, "#5e5ce6", "A"),
    Z("script", "Schreibstube", "Skript", 18, 0, 9, 10, "#f5a700", "A"),
    Z("audio", "Tonstudio", "Stimme", 27, 0, 9, 10, "#ff375f", "A"),
    Z("send", "Versand", "Upload", 0, 14, 9, 10, "#bf5af2", "B"),
    Z("approve", "Freigabe", "Deine Prüfung", 9, 14, 9, 10, "#ff9500", "B"),
    Z("cut", "Schnitt & Render", "Rendering", 18, 14, 9, 10, "#ff6a2b", "B"),
    Z("archive", "Bildarchiv", "Material", 27, 14, 9, 10, "#30b45a", "B"),
    Z("auto", "Automations-Werk", "Deine Automatisierungen", 36, 0, 8, 24, "#00c7be", "C"),
  ];
  const ZONE = Object.fromEntries(ZONES.map((z) => [z.key, z]));
  for (const z of ZONES) {
    if (z.row === "A") { z.door = { x: z.x + z.w / 2, y: z.y + z.h }; z.inside = { x: z.door.x, y: z.door.y - 1.4 }; }
    else if (z.row === "B") { z.door = { x: z.x + z.w / 2, y: z.y }; z.inside = { x: z.door.x, y: z.y + 1.6 }; }
    else { z.door = { x: z.x, y: LANE }; z.inside = { x: z.x + 1.6, y: LANE }; }
  }
  const HOME = {
    trend_scout: { zone: "radar", x: 6.8, y: 5.6 }, producer: { zone: "leit", x: 13.5, y: 3.9 },
    script_writer: { zone: "script", x: 23.8, y: 5.4 }, voice: { zone: "audio", x: 29.6, y: 3.0 },
    visuals: { zone: "archive", x: 34.0, y: 17.7 }, editor: { zone: "cut", x: 20.5, y: 17.4 },
    publisher: { zone: "send", x: 6.6, y: 17.4 }, automator: { zone: "auto", x: 41.4, y: 12 },
  };
  const INBOX = {
    radar: { x: 1.2, y: 7.4 }, leit: { x: 10.0, y: 7.6 }, script: { x: 18.9, y: 7.6 }, audio: { x: 33.0, y: 7.4 },
    archive: { x: 32.6, y: 21.0 }, cut: { x: 19.0, y: 21.0 }, approve: { x: 11.4, y: 17.5, z: 0.82 }, send: { x: 1.0, y: 15.4 },
  };
  const STATUS_ZONE = { queued: "leit", scripting: "script", scripted: "script", voicing: "audio", voiced: "audio",
    sourcing: "archive", visuals_ready: "archive", rendering: "cut", rendered: "cut", awaiting_approval: "approve",
    rejected: "approve", approved: "send", publishing: "send", publish_failed: "send", published: "send", ready: "send" };
  const CARRIER = { radar: "producer", leit: "producer", script: "script_writer", audio: "voice", archive: "visuals",
    cut: "editor", approve: "publisher", send: "publisher" };
  const ERROR_ZONE = { "Skript-Autor": "script", "Sprecher": "audio", "Bild-Redakteur": "archive", "Cutter": "cut", "Publisher": "send" };
  const ROBOT_SPOTS = [{ x: 39.7, y: 5.0 }, { x: 39.7, y: 12.9 }, { x: 39.7, y: 20.6 }];

  // ---------------- theme ----------------
  const PAL = {
    day: { bg1: "#e9ecf1", bg2: "#d7dce4", floor: "#e4e8ee", floor2: "#dde2e9", line: "rgba(20,30,50,.06)", walk: "#c9cfd8", walkLine: "rgba(255,255,255,.9)",
      wall: "#f4f5f7", trim: "#d0d5dd", mach: "#eef0f3", mach2: "#dfe3ea", dark: "#2b3240", screen: "#162033", glass: "rgba(190,225,255,.28)",
      shadow: "rgba(25,35,55,.14)", text: "#1d1d1f", text2: "#6e6e73", bubble: "rgba(255,255,255,.94)", bubbleLine: "rgba(0,0,0,.08)", night: 0 },
    night: { bg1: "#0b0e14", bg2: "#06080c", floor: "#1b2029", floor2: "#171b23", line: "rgba(255,255,255,.035)", walk: "#12161d", walkLine: "rgba(255,214,10,.55)",
      wall: "#262c37", trim: "#1d222b", mach: "#3a414e", mach2: "#2c323d", dark: "#151920", screen: "#0a1222", glass: "rgba(120,200,255,.18)",
      shadow: "rgba(0,0,0,.45)", text: "#f5f5f7", text2: "#a1a1a6", bubble: "rgba(28,30,36,.94)", bubbleLine: "rgba(255,255,255,.1)", night: 1 },
  };
  let P = PAL.day;
  const isDark = () => { const t = document.documentElement.getAttribute("data-theme"); return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };

  // ---------------- colour utils ----------------
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function shade(hex, f) {
    const [r, g, b] = hexToRgb(hex);
    const m = (c) => Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f));
    return `rgb(${m(r)},${m(g)},${m(b)})`;
  }
  const hexA = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

  // ---------------- drawing primitives ----------------
  function poly(c, pts, fill, stroke) {
    c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  }
  function box(c, x, y, z, w, d, h, base, o = {}) {
    const top = [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)];
    const left = [iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)];
    const right = [iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)];
    const a = o.alpha ?? 1;
    if (a < 1) c.globalAlpha = a;
    poly(c, left, o.left || shade(base, -0.1));
    poly(c, right, o.right || shade(base, -0.24));
    poly(c, top, o.top || shade(base, 0.08));
    if (a < 1) c.globalAlpha = 1;
    if (o.edge !== false) {
      c.strokeStyle = o.edgeColor || "rgba(255,255,255,.35)"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(top[3].x, top[3].y); c.lineTo(top[2].x, top[2].y); c.lineTo(top[1].x, top[1].y); c.stroke();
    }
  }
  // quad on the front-left face (plane y = const), u along x, v along z
  function faceY(c, x, y, z, u0, v0, u1, v1, fill) { poly(c, [iso(x + u0, y, z + v0), iso(x + u1, y, z + v0), iso(x + u1, y, z + v1), iso(x + u0, y, z + v1)], fill); }
  // quad on the front-right face (plane x = const), u along y, v along z
  function faceX(c, x, y, z, u0, v0, u1, v1, fill) { poly(c, [iso(x, y + u0, z + v0), iso(x, y + u1, z + v0), iso(x, y + u1, z + v1), iso(x, y + u0, z + v1)], fill); }
  function quadTop(c, x0, y0, x1, y1, z, fill, stroke) { poly(c, [iso(x0, y0, z), iso(x1, y0, z), iso(x1, y1, z), iso(x0, y1, z)], fill, stroke); }
  function cylinder(c, x, y, z, r, h, base, topFill) {
    const t = iso(x, y, z + h), b = iso(x, y, z), rx = r * HW * S2, ry = r * HH * S2;
    c.fillStyle = shade(base, -0.18);
    c.beginPath(); c.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI); c.lineTo(t.x - rx, t.y); c.ellipse(t.x, t.y, rx, ry, 0, Math.PI, 0, true); c.closePath(); c.fill();
    const g = c.createLinearGradient(t.x - rx, 0, t.x + rx, 0);
    g.addColorStop(0, shade(base, -0.02)); g.addColorStop(1, shade(base, -0.3));
    c.fillStyle = g; c.beginPath(); c.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI); c.lineTo(t.x - rx, t.y); c.ellipse(t.x, t.y, rx, ry, 0, Math.PI, 0, true); c.closePath(); c.fill();
    c.fillStyle = topFill || shade(base, 0.1); c.beginPath(); c.ellipse(t.x, t.y, rx, ry, 0, 0, TAU); c.fill();
  }
  // draw in floor-plane coordinates (1 unit = 1 tile) at height z, centred on (x,y)
  function floorSpace(c, x, y, z, fn) {
    const p = iso(x, y, z);
    c.save(); c.translate(p.x, p.y); c.transform(HW, HH, -HW, HH, 0, 0); fn(); c.restore();
  }
  function textOnFaceY(c, x, y, z, text, font, color, align = "left") {
    const p = iso(x, y, z); c.save(); c.translate(p.x, p.y); c.transform(1, 0.5, 0, 1, 0, 0);
    c.font = font; c.fillStyle = color; c.textAlign = align; c.fillText(text, 0, 0); c.restore();
  }
  function textOnFaceX(c, x, y, z, text, font, color, align = "left") {
    const p = iso(x, y, z); c.save(); c.translate(p.x, p.y); c.transform(1, -0.5, 0, 1, 0, 0);
    c.font = font; c.fillStyle = color; c.textAlign = align; c.fillText(text, 0, 0); c.restore();
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  function contactShadow(c, x, y, w, d, spread = 0.25) {
    poly(c, [iso(x - spread * 0.2, y + spread), iso(x + w + spread, y + spread * 0.2), iso(x + w + spread, y + d + spread), iso(x + spread * 0.2, y + d + spread)], P.shadow);
  }

  // ---------------- state ----------------
  let canvas, ctx, opts, tip, staticLayer, staticOrigin;
  let cam = { x: 0, y: 0, z: 1 }, camT = null, fitZ = 1, userMoved = false;
  const agents = {};
  const pkgs = new Map();
  const effects = [];
  let now = 0, t0 = performance.now(), running = false, selected = null;
  const machines = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const zoneAt = (p) => ZONES.find((z) => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) || null;
  const srvAgent = (k) => (opts.getAgents()[k] || {});
  const working = (k) => srvAgent(k).status === "working";

  // ---------------- machines (depth-sorted props) ----------------
  function M(x, y, w, d, draw, extra = {}) { machines.push({ x, y, w, d, depth: x + w / 2 + y + d / 2, draw, ...extra }); }
  function monitor(c, x, y, z, w, glow) {
    box(c, x, y, z, w, 0.12, 0.55, P.dark, { edge: false });
    faceY(c, x, y + 0.12, z, 0.06, 0.08, w - 0.06, 0.5, glow || P.screen);
  }
  function deskBox(c, x, y, w, d, col) {
    box(c, x, y, 0, w, d, 0.72, col || P.mach);
  }
  function buildMachines() {
    machines.length = 0;
    // --- Trend-Radar ---
    M(1.2, 1.6, 2.8, 2.8, (c) => {
      cylinder(c, 2.6, 3.0, 0, 1.35, 0.35, P.mach2);
      floorSpace(c, 2.6, 3.0, 0.36, () => {
        c.fillStyle = "#0a1730"; c.beginPath(); c.arc(0, 0, 1.18, 0, TAU); c.fill();
        c.strokeStyle = "rgba(10,132,255,.45)"; c.lineWidth = 0.025;
        for (const r of [0.4, 0.8, 1.15]) { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
        const a = now * (working("trend_scout") ? 3 : 0.8);
        const g = c.createConicGradient ? c.createConicGradient(a, 0, 0) : null;
        if (g) { g.addColorStop(0, "rgba(10,160,255,.75)"); g.addColorStop(0.12, "rgba(10,132,255,0)"); g.addColorStop(1, "rgba(10,132,255,0)"); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1.15, 0, TAU); c.fill(); }
        for (let i = 0; i < 6; i++) {
          const bl = (i * 1.9 + 0.4) % TAU, bd = 0.3 + ((i * 0.29) % 0.8), fade = ((a - bl) % TAU + TAU) % TAU;
          c.fillStyle = `rgba(120,200,255,${Math.max(0, 1 - fade / 2.3)})`; c.beginPath(); c.arc(Math.cos(bl) * bd, Math.sin(bl) * bd, 0.05, 0, TAU); c.fill();
        }
      });
    });
    M(5.2, 0.7, 3.2, 0.3, (c) => {
      box(c, 5.2, 0.7, 0, 0.12, 0.3, 2.4, P.dark); box(c, 8.3, 0.7, 0, 0.12, 0.3, 2.4, P.dark);
      box(c, 5.2, 0.7, 0.6, 3.2, 0.18, 1.7, "#b88a5a");
      const n = Math.min(opts.getStats()?.ideas || 0, 12), cols = ["#ffd60a", "#ffb340", "#7ee081", "#7cc7ff", "#ff9fd0"];
      for (let i = 0; i < n; i++) faceY(c, 5.2, 0.88, 0.6, 0.2 + (i % 6) * 0.48, 1.1 - Math.floor(i / 6) * 0.62 + 0.08, 0.58 + (i % 6) * 0.48, 1.6 - Math.floor(i / 6) * 0.62, cols[i % 5]);
    });
    M(5.6, 3.4, 2.5, 1.1, (c) => { deskBox(c, 5.6, 3.4, 2.5, 1.1); monitor(c, 6.2, 3.5, 0.72, 1.2, working("trend_scout") ? "#1f6fd6" : P.screen); box(c, 7.6, 3.9, 0.72, 0.3, 0.3, 0.12, P.dark); });
    // --- Leitstand ---
    M(10.3, 1.4, 6.4, 1.0, (c) => {
      deskBox(c, 10.3, 1.4, 6.4, 1.0, P.mach2);
      for (let i = 0; i < 5; i++) monitor(c, 10.6 + i * 1.22, 1.45, 0.72, 1.0, i === 2 ? (Math.sin(now * 2) > 0 ? "#3d3bb0" : "#2a2980") : P.screen);
    });
    M(13.5, 5.2, 0.1, 0.1, (c) => {
      cylinder(c, 13.5, 5.6, 0, 1.0, 0.75, P.mach2, "#1a1f3a");
      const p = iso(13.5, 5.6, 0.78);
      c.save(); c.globalAlpha = 0.55 + 0.2 * Math.sin(now * 2);
      const g = c.createLinearGradient(0, p.y - 70, 0, p.y);
      g.addColorStop(0, "rgba(94,92,230,0)"); g.addColorStop(1, "rgba(130,128,255,.65)");
      c.fillStyle = g; c.beginPath(); c.moveTo(p.x - 30, p.y); c.lineTo(p.x - 14, p.y - 64); c.lineTo(p.x + 14, p.y - 64); c.lineTo(p.x + 30, p.y); c.fill();
      c.strokeStyle = "#a9a7ff"; c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(p.x, p.y - 40 + 4 * Math.sin(now * 1.5), 14, 7, 0, 0, TAU); c.stroke();
      c.beginPath(); c.ellipse(p.x, p.y - 40 + 4 * Math.sin(now * 1.5), 7 + 3 * Math.sin(now * 3), 14, now, 0, TAU); c.stroke();
      c.restore();
    });
    // --- Schreibstube ---
    for (let i = 0; i < 3; i++) M(18.6 + i * 1.2, 0.5, 1.0, 0.6, (c) => {
      const x = 18.6 + i * 1.2; box(c, x, 0.5, 0, 1.0, 0.6, 2.4, "#8a6a4a");
      const cols = ["#ff9f0a", "#0a84ff", "#30d158", "#ff375f", "#bf5af2"];
      for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) faceY(c, x, 1.1, 0, 0.08 + k * 0.23, 0.15 + r * 0.58, 0.26 + k * 0.23, 0.55 + r * 0.58, cols[(i + r + k) % 5]);
    });
    M(22.3, 3.0, 2.8, 1.1, (c) => {
      deskBox(c, 22.3, 3.0, 2.8, 1.1); monitor(c, 23.2, 3.1, 0.72, 1.3, working("script_writer") ? "#a06a00" : P.screen);
      box(c, 22.5, 3.6, 0.72, 0.5, 0.35, 0.18, "#f4efe4"); box(c, 24.6, 3.5, 0.72, 0.35, 0.45, 0.1, "#f4efe4");
      if (working("script_writer")) for (let i = 0; i < 5; i++) {
        const ph = (now * 0.7 + i / 5) % 1, p = iso(23.6 + i * 0.15, 3.3, 1.4 + ph * 1.4);
        c.globalAlpha = 1 - ph; c.fillStyle = "#f5a700"; c.font = "700 11px -apple-system, Inter, sans-serif"; c.fillText("KIagent"[(i + Math.floor(now * 3)) % 7], p.x, p.y); c.globalAlpha = 1;
      }
    });
    M(19.2, 4.6, 2.2, 1.0, (c) => { deskBox(c, 19.2, 4.6, 2.2, 1.0, P.mach2); monitor(c, 19.7, 4.7, 0.72, 1.0); });
    // --- Tonstudio ---
    M(27.9, 1.0, 3.4, 3.2, (c) => {
      quadTop(c, 27.9, 1.0, 31.3, 4.2, 0.01, "rgba(255,55,95,.08)");
      cylinder(c, 29.6, 2.4, 0, 0.12, 1.25, P.dark); cylinder(c, 29.6, 2.4, 1.25, 0.16, 0.22, "#888");
      box(c, 27.9, 1.0, 0, 3.4, 3.2, 2.7, "#bfe3ff", { alpha: 0.22, edgeColor: "rgba(180,220,255,.9)", top: "rgba(200,230,255,.5)", left: "rgba(170,210,240,.6)", right: "rgba(140,190,230,.6)" });
      const t = [iso(27.9, 1.0, 2.7), iso(31.3, 1.0, 2.7), iso(31.3, 4.2, 2.7), iso(27.9, 4.2, 2.7)];
      c.strokeStyle = "rgba(160,200,235,.9)"; c.lineWidth = 1.5; poly(c, t, null, "rgba(160,200,235,.9)");
      const on = working("voice");
      faceY(c, 28.6, 0.02, 2.9, 0, 0, 1.6, 0.4, on ? (Math.sin(now * 6) > -0.3 ? "#ff3b30" : "#7a1a16") : "#3a2428");
      textOnFaceY(c, 28.75, 0.02, 3.02, "ON AIR", "700 11px -apple-system, Inter, sans-serif", on ? "#fff" : "#7a5a60");
    }, { depthBias: -1.2 });
    M(32.0, 2.0, 3.2, 1.4, (c) => {
      box(c, 32.0, 2.0, 0, 3.2, 1.4, 0.8, P.mach2);
      const on = working("voice");
      for (let i = 0; i < 12; i++) { const l = on ? 0.25 + 0.75 * Math.abs(Math.sin(now * (5 + i * 0.6) + i)) : 0.15; floorSpace(c, 32.2 + i * 0.24, 2.6, 0.81, () => { c.fillStyle = l > 0.8 ? "#ff375f" : "#30d158"; c.fillRect(0, -0.3 * l, 0.12, 0.6 * l + 0.05); }); }
      box(c, 31.6, 0.6, 0, 0.7, 0.7, 1.7, P.dark); box(c, 35.0, 0.6, 0, 0.7, 0.7, 1.7, P.dark);
      cylinder(c, 31.95, 1.3, 0.9, 0.22, 0.02, "#555", on ? "#777" : "#444"); cylinder(c, 35.35, 1.3, 0.9, 0.22, 0.02, "#555", on ? "#777" : "#444");
    });
    // --- Versand ---
    M(1.0, 18.0, 3.0, 3.0, (c) => {
      cylinder(c, 2.5, 19.5, 0, 1.5, 0.25, P.mach2, "#141a26");
      floorSpace(c, 2.5, 19.5, 0.27, () => {
        const on = working("publisher");
        c.strokeStyle = `rgba(191,90,242,${on ? 0.9 : 0.4})`; c.lineWidth = 0.06; c.setLineDash([0.2, 0.15]); c.lineDashOffset = -now * 0.6;
        c.beginPath(); c.arc(0, 0, 1.15, 0, TAU); c.stroke(); c.setLineDash([]);
        const g = c.createRadialGradient(0, 0, 0.05, 0, 0, 1); g.addColorStop(0, `rgba(191,90,242,${on ? 0.7 : 0.25})`); g.addColorStop(1, "rgba(191,90,242,0)");
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill();
      });
    });
    [["YT", "#ff3b30"], ["TT", "#25c2d6"], ["IG", "#e1306c"]].forEach(([t, col], i) => M(4.6 + i * 1.3, 15.4, 0.9, 0.6, (c) => {
      const x = 4.6 + i * 1.3; box(c, x, 15.4, 0, 0.9, 0.6, 1.6, P.mach);
      faceY(c, x, 16.0, 0, 0.1, 0.85, 0.8, 1.45, working("publisher") && Math.floor(now * 2) % 3 === i ? col : shade(col, -0.45));
      textOnFaceY(c, x + 0.27, 16.0, 1.05, t, "800 10px -apple-system, Inter, sans-serif", "#fff");
    }));
    M(4.8, 21.6, 3.6, 0.7, (c) => { box(c, 4.8, 21.6, 0, 3.6, 0.7, 0.55, "#8a6a4a"); });
    // --- Freigabe ---
    M(11.0, 17.0, 4.6, 1.6, (c) => {
      box(c, 11.0, 17.0, 0, 4.6, 1.6, 0.8, P.mach);
      const waiting = [...pkgs.values()].some((p) => p.zone === "approve" && p.status === "awaiting_approval" && !p.carriedBy);
      floorSpace(c, 13.3, 17.8, 0.81, () => { c.fillStyle = waiting ? `rgba(255,149,0,${0.15 + 0.12 * Math.sin(now * 4)})` : "rgba(255,149,0,.06)"; rr(c, -2.2, -0.7, 4.4, 1.4, 0.2); c.fill(); });
    });
    M(16.3, 15.2, 0.6, 0.6, (c) => {
      box(c, 16.3, 15.2, 0, 0.6, 0.6, 1.9, P.dark);
      const waiting = [...pkgs.values()].some((p) => p.status === "awaiting_approval");
      cylinder(c, 16.6, 15.5, 1.9, 0.3, 0.35, waiting ? "#ff9500" : "#5a4a2a", waiting ? (Math.sin(now * 5) > 0 ? "#ffd08a" : "#ff9500") : "#6a5a3a");
    });
    // --- Schnitt & Render ---
    M(19.0, 15.4, 3.2, 1.1, (c) => {
      deskBox(c, 19.0, 15.4, 3.2, 1.1, P.mach2);
      const on = working("editor");
      [0, 1, 2].forEach((i) => monitor(c, 19.15 + i * 1.02, 15.5, 0.72, 0.95, on ? ["#ff6a2b", "#0a84ff", "#ffcc00"][i] : P.screen));
      const pr = srvAgent("editor").progress;
      if (on && pr != null) floorSpace(c, 20.6, 16.3, 0.73, () => { c.fillStyle = "rgba(0,0,0,.3)"; c.fillRect(-1.3, -0.08, 2.6, 0.16); c.fillStyle = "#ff6a2b"; c.fillRect(-1.3, -0.08, 2.6 * pr / 100, 0.16); });
    });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) M(23.4 + i * 1.05, 15.2 + j * 2.4, 0.85, 0.85, (c) => {
      const x = 23.4 + i * 1.05, y = 15.2 + j * 2.4, on = working("editor");
      box(c, x, y, 0, 0.85, 0.85, 2.3, P.dark);
      for (let r = 0; r < 7; r++) for (let k = 0; k < 3; k++) {
        const lit = on ? Math.sin(now * (7 + k) + i * 2 + j * 3 + r) > 0.1 : (i + j + r + k + Math.floor(now / 2)) % 9 === 0;
        faceY(c, x, y + 0.85, 0, 0.12 + k * 0.24, 0.25 + r * 0.29, 0.24 + k * 0.24, 0.31 + r * 0.29, lit ? (on ? "#ff9a3d" : "#30d158") : "#2a2f3a");
      }
      if (on && Math.random() < 0.03) effects.push({ kind: "spark", x: x + 0.4, y: y + 0.9, z: 2.3, t: now, life: 0.6 });
    });
    // --- Bildarchiv ---
    for (let r = 0; r < 3; r++) M(28.0, 15.3 + r * 2.1, 3.8, 0.6, (c) => {
      const y = 15.3 + r * 2.1;
      box(c, 28.0, y, 0, 3.8, 0.6, 1.9, "#7a6a55");
      for (let k = 0; k < 7; k++) for (let l = 0; l < 3; l++) {
        const p = iso(28.25 + k * 0.52, y + 0.6, 0.35 + l * 0.6);
        c.fillStyle = "#2a2a2a"; c.beginPath(); c.ellipse(p.x, p.y, 7, 7, 0, 0, TAU); c.fill();
        c.fillStyle = (k + l + r) % 4 === 0 ? "#30b45a" : "#888"; c.beginPath(); c.ellipse(p.x, p.y, 2.5, 2.5, 0, 0, TAU); c.fill();
      }
      if (working("visuals") && Math.floor(now * 1.3) % 3 === r) {
        const k = (now * 3) % 3.6; faceY(c, 28.0, y + 0.62, 0, k, 0.05, k + 0.25, 1.85, "rgba(48,180,90,.45)");
      }
    });
    M(32.8, 15.8, 2.3, 1.0, (c) => { deskBox(c, 32.8, 15.8, 2.3, 1.0); monitor(c, 33.4, 15.9, 0.72, 1.1, working("visuals") ? "#1f8f44" : P.screen); });
    // --- Automations-Werk ---
    M(41.6, 1.0, 1.4, 22.0, (c) => {
      box(c, 41.6, 1.0, 0, 1.4, 22.0, 0.45, P.dark);
      const active = (opts.getAutomation?.().active || []).length;
      for (let k = 0; k < 44; k++) { const yy = 1.2 + ((k * 0.5 + now * (active ? 1.6 : 0.3)) % 21.6); quadTop(c, 41.7, yy, 42.9, yy + 0.18, 0.46, "rgba(255,255,255,.07)"); }
    }, { depthBias: -8 });
    ROBOT_SPOTS.forEach((s, i) => M(s.x - 0.8, s.y - 1.4, 1.2, 1.2, (c) => drawArm(c, 39.6, s.y - 0.8, i)));
  }
  function drawArm(c, x, y, i) {
    cylinder(c, x, y, 0, 0.45, 0.35, "#00a19a");
    const active = (opts.getAutomation?.().active || []).length;
    const sp = active ? 2.6 : 0.5;
    const a1 = Math.sin(now * sp + i * 1.7) * 0.6, a2 = Math.sin(now * sp * 1.3 + i) * 0.7;
    const base = iso(x, y, 0.35);
    const j1 = { x: base.x + Math.cos(-1.2 + a1) * 34, y: base.y + Math.sin(-1.2 + a1) * 34 - 6 };
    const j2 = { x: j1.x + Math.cos(-0.2 + a2) * 30, y: j1.y + Math.sin(-0.2 + a2) * 30 };
    c.lineCap = "round";
    c.strokeStyle = "#00857f"; c.lineWidth = 11; c.beginPath(); c.moveTo(base.x, base.y - 4); c.lineTo(j1.x, j1.y); c.stroke();
    c.strokeStyle = "#00c7be"; c.lineWidth = 8; c.beginPath(); c.moveTo(base.x, base.y - 4); c.lineTo(j1.x, j1.y); c.stroke();
    c.strokeStyle = "#00a19a"; c.lineWidth = 7; c.beginPath(); c.moveTo(j1.x, j1.y); c.lineTo(j2.x, j2.y); c.stroke();
    c.fillStyle = "#e8fffd"; c.beginPath(); c.arc(j1.x, j1.y, 5, 0, TAU); c.fill();
    c.fillStyle = active ? "#7dfff6" : "#5a6a70"; c.beginPath(); c.arc(j2.x, j2.y, 4.5, 0, TAU); c.fill();
    if (active) { c.fillStyle = "rgba(125,255,246,.35)"; c.beginPath(); c.arc(j2.x, j2.y, 9 + 2 * Math.sin(now * 10), 0, TAU); c.fill(); }
  }

  // ---------------- static layer: floor, zones, walls ----------------
  function bounds() {
    const pts = [iso(0, 0, 4.2), iso(HX, 0, 4.2), iso(HX, HY, 0), iso(0, HY, 0), iso(-0.4, 0, 4.2), iso(0, -0.4, 4.2)];
    return { x0: Math.min(...pts.map((p) => p.x)) - 20, x1: Math.max(...pts.map((p) => p.x)) + 20, y0: Math.min(...pts.map((p) => p.y)) - 60, y1: Math.max(...pts.map((p) => p.y)) + 20 };
  }
  function buildStatic() {
    P = isDark() ? PAL.night : PAL.day;
    const b = bounds(), S = 1.5;
    staticLayer = document.createElement("canvas");
    staticLayer.width = (b.x1 - b.x0) * S; staticLayer.height = (b.y1 - b.y0) * S;
    staticOrigin = { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
    const c = staticLayer.getContext("2d");
    c.scale(S, S); c.translate(-b.x0, -b.y0);
    // slab under the hall
    poly(c, [iso(0, HY, 0), iso(HX, HY, 0), iso(HX, HY, -0.5), iso(0, HY, -0.5)], shade(P.night ? "#1b2029" : "#c9ced7", -0.15));
    poly(c, [iso(HX, 0, 0), iso(HX, HY, 0), iso(HX, HY, -0.5), iso(HX, 0, -0.5)], shade(P.night ? "#1b2029" : "#c9ced7", -0.3));
    quadTop(c, 0, 0, HX, HY, 0, P.floor);
    // tiles
    c.strokeStyle = P.line; c.lineWidth = 1;
    for (let x = 0; x <= HX; x++) { const a = iso(x, 0), b2 = iso(x, HY); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b2.x, b2.y); c.stroke(); }
    for (let y = 0; y <= HY; y++) { const a = iso(0, y), b2 = iso(HX, y); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b2.x, b2.y); c.stroke(); }
    // walkway
    quadTop(c, 0, 10, 36, 14, 0.001, P.walk);
    floorSpace(c, 0, 0, 0.002, () => {
      c.strokeStyle = P.walkLine; c.lineWidth = 0.06; c.setLineDash([0.6, 0.5]);
      c.beginPath(); c.moveTo(0.3, LANE); c.lineTo(35.7, LANE); c.stroke(); c.setLineDash([]);
      c.fillStyle = "rgba(255,214,10,.75)";
      for (let x = 0; x < 36; x += 0.5) { c.fillRect(x, 10.02, 0.25, 0.12); c.fillRect(x + 0.25, 13.86, 0.25, 0.12); }
      c.fillStyle = P.night ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.85)";
      for (let x = 3; x < 34; x += 6) { c.beginPath(); c.moveTo(x, 11.1); c.lineTo(x + 0.8, 11.35); c.lineTo(x, 11.6); c.fill(); c.beginPath(); c.moveTo(x + 0.8, 12.4); c.lineTo(x, 12.65); c.lineTo(x + 0.8, 12.9); c.fill(); }
    });
    // zones
    for (const z of ZONES) {
      quadTop(c, z.x + 0.08, z.y + 0.08, z.x + z.w - 0.08, z.y + z.h - 0.08, 0.003, hexA(z.color, P.night ? 0.07 : 0.06));
      floorSpace(c, 0, 0, 0.004, () => {
        c.strokeStyle = hexA(z.color, 0.55); c.lineWidth = 0.07;
        c.strokeRect(z.x + 0.15, z.y + 0.15, z.w - 0.3, z.h - 0.3);
        c.fillStyle = P.walk; // doorway gap in the border
        if (z.row === "A") c.fillRect(z.door.x - 0.9, z.y + z.h - 0.25, 1.8, 0.2);
        else if (z.row === "B") c.fillRect(z.door.x - 0.9, z.y + 0.05, 1.8, 0.2);
        else c.fillRect(z.x + 0.05, LANE - 0.9, 0.2, 1.8);
        if (P.night) {
          const g = c.createRadialGradient(z.x + z.w / 2, z.y + z.h / 2, 0.2, z.x + z.w / 2, z.y + z.h / 2, Math.max(z.w, z.h) * 0.7);
          g.addColorStop(0, hexA(z.color, 0.16)); g.addColorStop(1, hexA(z.color, 0));
          c.fillStyle = g; c.fillRect(z.x, z.y, z.w, z.h);
        }
        c.save(); c.translate(z.x + 0.5, z.y + (z.row === "B" ? z.h - 0.6 : z.row === "C" ? z.h - 0.6 : 1.0)); c.fillStyle = hexA(z.color, 0.85);
        c.font = "700 0.55px -apple-system, Inter, sans-serif"; c.fillText(z.name.toUpperCase(), 0, 0); c.restore();
      });
    }
    // contact shadows for machines
    for (const m of machines) if (m.w > 0.3 && m.d > 0.3 && !m.noShadow) contactShadow(c, m.x, m.y, m.w, m.d, 0.3);
    // back walls
    const H = 3.6;
    box(c, -0.45, -0.45, 0, 0.45, HY + 0.45, H, P.wall, { edge: false, right: shade(P.wall, -0.06) });
    box(c, 0, -0.45, 0, HX, 0.45, H, P.wall, { edge: false, left: shade(P.wall, -0.02) });
    // wall trim & light strips
    faceY(c, 0, 0, 0, 0, 0, HX, 0.25, P.trim);
    faceX(c, 0, 0, 0, 0, 0, HY, 0.25, P.trim);
    for (const z of ZONES) {
      if (z.row === "A" || z.row === "C") faceY(c, z.x + 0.3, 0, 0, 0, H - 0.42, z.w - 0.6, H - 0.3, hexA(z.color, P.night ? 0.9 : 0.75));
    }
    faceX(c, 0, 0.3, 0, 0, H - 0.42, 9.4, H - 0.3, hexA("#0a84ff", 0.75));
    faceX(c, 0, 14.3, 0, 0, H - 0.42, 9.4, H - 0.3, hexA("#bf5af2", 0.75));
    // big brand lettering on the left wall
    textOnFaceX(c, 0, 11.6, 2.2, "LUGGER WERK", "800 30px -apple-system, Inter, sans-serif", P.night ? "rgba(255,255,255,.12)" : "rgba(30,40,60,.12)", "center");
    // vents
    for (let i = 0; i < 4; i++) { faceY(c, 2 + i * 11, 0, 0, 0, 2.4, 1.6, 2.9, P.night ? "#1d222b" : "#e2e5ea"); for (let k = 0; k < 4; k++) faceY(c, 2 + i * 11, 0, 0, 0.1, 2.48 + k * 0.1, 1.5, 2.52 + k * 0.1, P.night ? "#2c323d" : "#cfd4dc"); }
  }

  // ---------------- dynamic wall screens ----------------
  function drawWallScreens(c) {
    const st = opts.getStats() || {}, ag = opts.getAgents();
    // Leitstand big screen
    faceY(c, 10.0, 0.001, 0, 0, 1.55, 7.0, 3.0, P.screen);
    const slot = ag.producer?.next_slot ? new Date(ag.producer.next_slot).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "Autopilot aus";
    textOnFaceY(c, 10.25, 0.001, 2.65, "NÄCHSTE PRODUKTION", "600 9px -apple-system, Inter, sans-serif", "#8e8e93");
    textOnFaceY(c, 10.25, 0.001, 2.25, slot, "700 15px -apple-system, Inter, sans-serif", "#ffffff");
    [["IN ARBEIT", st.in_production ?? 0, "#0a84ff"], ["FREIGABE", st.awaiting_approval ?? 0, "#ff9500"], ["ONLINE", st.published ?? 0, "#30d158"]].forEach(([l, v, col], i) => {
      textOnFaceY(c, 13.6 + i * 1.12, 0.001, 2.65, l, "600 8px -apple-system, Inter, sans-serif", "#8e8e93");
      textOnFaceY(c, 13.6 + i * 1.12, 0.001, 2.1, String(v), "800 20px -apple-system, Inter, sans-serif", col);
    });
    // Automations-Werk board
    const au = opts.getAutomation?.() || { active: [], recent: [], total: 0 };
    faceY(c, 36.6, 0.001, 0, 0, 1.4, 6.8, 3.0, P.screen);
    textOnFaceY(c, 36.85, 0.001, 2.65, `AUTOMATISIERUNGEN · ${au.enabled ?? 0} AKTIV`, "600 9px -apple-system, Inter, sans-serif", "#7dfff6");
    const rows = [...au.active.map((r) => ({ name: r.name, status: "running" })), ...au.recent].slice(0, 3);
    rows.forEach((r, i) => {
      const col = r.status === "running" ? "#0a84ff" : r.status === "success" ? "#30d158" : r.status === "skipped" ? "#8e8e93" : "#ff3b30";
      faceY(c, 36.85, 0.001, 0, 0, 2.17 - i * 0.28, 0.12, 2.29 - i * 0.28, col);
      textOnFaceY(c, 37.1, 0.001, 2.14 - i * 0.28, (r.name || "").slice(0, 34), "500 10px -apple-system, Inter, sans-serif", "#e5e5ea");
    });
    if (!rows.length) textOnFaceY(c, 36.85, 0.001, 2.1, "Noch keine Läufe", "500 10px -apple-system, Inter, sans-serif", "#8e8e93");
  }

  // ---------------- agents ----------------
  function ensureAgent(key) {
    if (agents[key]) return agents[key];
    const h = HOME[key];
    return (agents[key] = { key, x: h.x, y: h.y, path: [], jobs: [], job: null, carrying: null, moving: false, walk: 0, face: 1,
      wanderAt: now + rnd(3, 9), lane: LANE + ((Object.keys(agents).length % 3) - 1) * 0.45, srv: {} });
  }
  function route(a, to) {
    const from = zoneAt(a), dest = zoneAt(to);
    if (from && dest && from.key === dest.key) return [{ ...to }];
    const pts = [];
    if (from) pts.push(from.inside, from.door, { x: from.door.x, y: a.lane });
    else pts.push({ x: a.x, y: a.lane });
    if (dest) pts.push({ x: dest.door.x, y: a.lane }, dest.door, dest.inside);
    pts.push(to);
    return pts.map((p) => ({ x: p.x + rnd(-0.08, 0.08), y: p.y + rnd(-0.08, 0.08) }));
  }
  const goTo = (a, to) => (a.path = route(a, to));

  // ---------------- packages (video crates) ----------------
  function zoneForVideo(v) {
    if (v.status === "failed") { const m = /^\[([^\]]+)\]/.exec(v.error || ""); return (m && ERROR_ZONE[m[1]]) || null; }
    return STATUS_ZONE[v.status] || null;
  }
  function makePkg(v, zone) {
    const s = INBOX[zone] || INBOX.leit;
    const p = { id: v.id, title: v.title || v.topic, status: v.status, zone, x: s.x, y: s.y, z: s.z || 0, moves: [], carriedBy: null,
      pending: false, launched: v.status === "published" || v.status === "ready", vis: true };
    pkgs.set(v.id, p);
    return p;
  }
  const lastDest = (p) => (p.moves.length ? p.moves[p.moves.length - 1] : p.zone);
  function onVideo(v, prev) {
    let p = pkgs.get(v.id);
    const target = zoneForVideo(v);
    if (!p) {
      if (!prev && v.status === "queued") { p = makePkg(v, "radar"); p.moves.push("leit"); }
      else p = makePkg(v, target || "leit");
    }
    p.title = v.title || v.topic;
    const was = p.status;
    p.status = v.status;
    if (target && target !== lastDest(p)) p.moves.push(target);
    if (v.status === "published" && was !== "published") p.launchPending = true;
  }
  function onDeleted(id) { const p = pkgs.get(id); if (p?.carriedBy && agents[p.carriedBy]) agents[p.carriedBy].carrying = null; pkgs.delete(id); }
  function schedulePackages() {
    for (const p of pkgs.values()) {
      if (p.pending || p.carriedBy || !p.moves.length) continue;
      const a = ensureAgent(CARRIER[p.zone] || "producer");
      p.pending = true;
      a.jobs.push({ pkg: p.id, to: p.moves[0] });
    }
  }
  function slotPositions() {
    const by = {};
    for (const p of pkgs.values()) if (!p.carriedBy && !p.launching) (by[p.zone] ||= []).push(p);
    for (const [zone, list] of Object.entries(by)) {
      list.sort((a, b) => a.id - b.id);
      let shown = list;
      if (zone === "send") {
        const done = list.filter((p) => p.launched && !p.launchPending);
        shown = list.filter((p) => !(p.launched && !p.launchPending));
        done.forEach((p) => (p.vis = false));
        done.slice(-10).forEach((p, i) => { p.tx = 5.0 + (i % 5) * 0.68; p.ty = 21.75 + Math.floor(i / 5) * 0.01; p.tz = 0.55 + Math.floor(i / 5) * 0.42; p.vis = true; p.small = true; });
      }
      const b = INBOX[zone] || { x: ZONE[zone].x + 1, y: ZONE[zone].y + 1 };
      const cols = zone === "approve" ? 6 : 4;
      shown.forEach((p, i) => { p.tx = b.x + (i % cols) * 0.62; p.ty = b.y + Math.floor(i / cols) * 0.62; p.tz = b.z || 0; p.vis = true; p.small = false; });
    }
  }

  // ---------------- simulation ----------------
  function step(dt) {
    schedulePackages(); slotPositions();
    for (const k of Object.keys(HOME)) ensureAgent(k);
    const srv = opts.getAgents();
    const au = opts.getAutomation?.() || { active: [] };
    for (const a of Object.values(agents)) {
      a.srv = a.key === "automator" ? { name: "Automator", role: "Führt deine Automatisierungen aus", status: au.active.length ? "working" : "idle",
        task: au.active.length ? `Führt „${au.active[0].name}“ aus` : "Bereit für Automatisierungen", icon: "" } : (srv[a.key] || {});
      if (a.key === "automator") { robotStep(a, dt, au); continue; }
      if (!a.job && a.jobs.length) {
        a.job = a.jobs.shift(); a.job.phase = "pickup";
        const p = pkgs.get(a.job.pkg);
        if (!p) { a.job = null; continue; }
        goTo(a, { x: (p.tx ?? p.x) + 0.35, y: (p.ty ?? p.y) + (p.zone === "approve" ? 1.4 : 0.55) });
      }
      if (a.job && !a.path.length) {
        const p = pkgs.get(a.job.pkg);
        if (!p) { a.job = null; a.carrying = null; }
        else if (a.job.phase === "pickup") {
          p.carriedBy = a.key; a.carrying = p.id; a.job.phase = "deliver";
          const b = INBOX[a.job.to] || { x: ZONE[a.job.to].inside.x, y: ZONE[a.job.to].inside.y };
          goTo(a, { x: b.x + rnd(0.3, 1.6), y: b.y + (a.job.to === "approve" ? 1.5 : 0.7) });
        } else {
          p.carriedBy = null; a.carrying = null; p.pending = false;
          p.zone = p.moves.shift() || a.job.to; p.x = a.x; p.y = a.y; p.z = 0.6;
          effects.push({ kind: "ring", x: a.x, y: a.y, t: now, color: ZONE[p.zone].color });
          if (p.zone === "send" && p.launchPending) startLaunch(p);
          a.job = null;
          if (!a.jobs.length) goTo(a, HOME[a.key]);
        }
      }
      if (!a.job && !a.path.length) {
        const h = HOME[a.key], atHome = dist(a, h) < 0.05, st = a.srv.status;
        if (st === "working" || st === "paused" || a.jobs.length) { if (!atHome) goTo(a, h); }
        else if (now > a.wanderAt) {
          a.wanderAt = now + rnd(6, 14);
          const z = ZONE[h.zone];
          if (atHome && Math.random() < 0.55) { a.path = [{ x: rnd(z.x + 1.2, z.x + z.w - 1.2), y: z.row === "A" ? rnd(z.y + 5.6, z.y + z.h - 1) : rnd(z.y + 2.2, z.y + 4.2) }]; a.slow = true; }
          else if (!atHome) { goTo(a, h); a.slow = true; }
        }
      }
      move(a, dt);
    }
    for (const p of pkgs.values()) {
      if (p.launching) continue;
      if (p.carriedBy && agents[p.carriedBy]) { const a = agents[p.carriedBy]; p.x = a.x; p.y = a.y; p.z = 0.95; }
      else if (p.tx != null) { const k = Math.min(1, dt * 6); p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; p.z += ((p.tz || 0) - p.z) * k; }
    }
    for (let i = effects.length - 1; i >= 0; i--) if (now - effects[i].t > (effects[i].life || 1.2)) effects.splice(i, 1);
  }
  function move(a, dt) {
    a.moving = false;
    if (!a.path.length) return;
    const t = a.path[0];
    const carried = a.carrying != null ? pkgs.get(a.carrying) : null;
    const behind = Math.max(0, carried ? carried.moves.length - 1 : 0);
    const speed = a.slow && !a.job ? 0.9 : (3.4 + a.jobs.length * 1.1) * (1 + 0.9 * behind);
    const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy);
    if (d < speed * dt + 0.01) { a.x = t.x; a.y = t.y; a.path.shift(); if (!a.path.length) a.slow = false; }
    else { a.x += (dx / d) * speed * dt; a.y += (dy / d) * speed * dt; }
    if (d > 0.01) { a.moving = true; a.walk += dt * speed * 3.2; const sx = dx - dy; if (Math.abs(sx) > 0.01) a.face = sx > 0 ? 1 : -1; }
  }
  let robotSpot = 0, robotNext = 0, lastActive = 0;
  function robotStep(a, dt, au) {
    const active = au.active.length;
    if (active && !lastActive) { robotNext = 0; }
    if (!active && lastActive) { effects.push({ kind: "check", x: a.x, y: a.y, t: now, life: 1.4, ok: (au.recent[0]?.status || "success") !== "error" }); a.path = [{ ...HOME.automator }]; }
    lastActive = active;
    if (active && !a.path.length && now > robotNext) { robotSpot = (robotSpot + 1) % ROBOT_SPOTS.length; a.path = [{ ...ROBOT_SPOTS[robotSpot] }]; robotNext = now + 1.4; }
    if (!active && !a.path.length && now > a.wanderAt) { a.wanderAt = now + rnd(5, 10); a.path = [{ x: rnd(37.6, 40.6), y: rnd(3, 21) }]; a.slow = true; }
    move(a, dt);
  }
  function startLaunch(p) { p.launchPending = false; p.launching = true; effects.push({ kind: "launch", t: now, life: 3, x: 2.5, y: 19.5, p, sx: p.x, sy: p.y }); }

  // ---------------- drawing entities ----------------
  function drawPerson(c, a, sel) {
    const col = AGENT_COLOR[a.key], s = a.srv.status, p = iso(a.x, a.y, 0);
    const busy = s === "working" && !a.moving && !a.job;
    c.save(); c.translate(p.x, p.y);
    if (s === "paused") c.globalAlpha = 0.55;
    // selection & work rings
    if (sel) { c.strokeStyle = "#fff"; c.lineWidth = 2; c.setLineDash([4, 4]); c.lineDashOffset = -now * 20; c.beginPath(); c.ellipse(0, 0, 20, 10, 0, 0, TAU); c.stroke(); c.setLineDash([]); }
    if (busy) { c.fillStyle = hexA(col, 0.22 + 0.1 * Math.sin(now * 4)); c.beginPath(); c.ellipse(0, 0, 19, 9.5, 0, 0, TAU); c.fill(); }
    c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(0, 0, 11, 5.2, 0, 0, TAU); c.fill();
    const sw = a.moving ? Math.sin(a.walk) : 0, bob = a.moving ? Math.abs(Math.cos(a.walk)) * 1.6 : 0;
    c.scale(a.face, 1);
    // legs
    c.fillStyle = "#2a2f3a";
    rr(c, -5, -13 - bob + Math.max(0, sw) * -2, 4, 13 + Math.max(0, sw) * 2, 2); c.fill();
    rr(c, 1, -13 - bob + Math.max(0, -sw) * -2, 4, 13 + Math.max(0, -sw) * 2, 2); c.fill();
    c.fillStyle = "#111"; rr(c, -6, -2 - bob, 5, 3, 1.5); c.fill(); rr(c, 1, -2 - bob, 5, 3, 1.5); c.fill();
    // torso
    const ty = -31 - bob;
    const g = c.createLinearGradient(-8, 0, 8, 0); g.addColorStop(0, shade(col, 0.12)); g.addColorStop(1, shade(col, -0.22));
    c.fillStyle = g; rr(c, -8, ty, 16, 19, 6); c.fill();
    c.fillStyle = "rgba(255,255,255,.25)"; rr(c, -2, ty + 3, 4, 8, 2); c.fill();
    // arms
    const arm = busy ? Math.sin(now * 14) * 2 : -sw * 3;
    c.fillStyle = shade(col, -0.1);
    rr(c, -11, ty + 2 + arm, 4, 12, 2); c.fill(); rr(c, 7, ty + 2 - arm, 4, 12, 2); c.fill();
    c.fillStyle = SKIN[a.key]; c.beginPath(); c.arc(-9, ty + 15 + arm, 2.3, 0, TAU); c.fill(); c.beginPath(); c.arc(9, ty + 15 - arm, 2.3, 0, TAU); c.fill();
    // head
    const hy = ty - 8;
    c.fillStyle = SKIN[a.key]; c.beginPath(); c.arc(0, hy, 7.5, 0, TAU); c.fill();
    c.fillStyle = HAIR[a.key]; c.beginPath(); c.arc(0, hy - 1.5, 7.7, Math.PI * 1.02, Math.PI * 1.98); c.fill(); c.fillRect(-7.7, hy - 2.5, 4, 4);
    c.fillStyle = "#1d1d1f"; c.beginPath(); c.arc(3.2, hy + 0.5, 1.1, 0, TAU); c.fill();
    if (a.key === "voice") { c.strokeStyle = "#222"; c.lineWidth = 2.5; c.beginPath(); c.arc(0, hy, 9, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); c.fillStyle = "#333"; rr(c, -10, hy - 2, 4, 6, 2); c.fill(); }
    if (a.key === "editor") { c.fillStyle = "#ff6a2b"; c.beginPath(); c.arc(0, hy - 2.5, 7.8, Math.PI, 0); c.fill(); c.fillRect(0, hy - 3, 11, 2.5); }
    if (a.key === "trend_scout") { c.fillStyle = "#0a84ff"; c.fillRect(-7, hy - 4, 14, 2.4); }
    c.restore();
    // carried crate
    if (a.carrying != null) { const pk = pkgs.get(a.carrying); if (pk) drawCrate(c, { ...pk, x: a.x + 0.18 * a.face, y: a.y + 0.18, z: 0.95 - bob / ZS }); }
    if (s === "error") { const q = iso(a.x, a.y, 1.75); c.fillStyle = "#ff3b30"; c.beginPath(); c.arc(q.x + 10, q.y - 4, 7, 0, TAU); c.fill(); c.fillStyle = "#fff"; c.font = "800 10px sans-serif"; c.textAlign = "center"; c.fillText("!", q.x + 10, q.y); c.textAlign = "left"; }
  }
  function drawRobot(c, a, sel) {
    const p = iso(a.x, a.y, 0), col = AGENT_COLOR.automator, act = a.srv.status === "working";
    const hover = 10 + Math.sin(now * 3) * 3;
    c.save(); c.translate(p.x, p.y);
    if (sel) { c.strokeStyle = "#fff"; c.lineWidth = 2; c.setLineDash([4, 4]); c.beginPath(); c.ellipse(0, 0, 20, 10, 0, 0, TAU); c.stroke(); c.setLineDash([]); }
    c.fillStyle = "rgba(0,0,0,.22)"; c.beginPath(); c.ellipse(0, 0, 12 - hover * 0.2, 5.5, 0, 0, TAU); c.fill();
    c.fillStyle = act ? "rgba(0,199,190,.45)" : "rgba(0,199,190,.2)"; c.beginPath(); c.moveTo(-6, -hover - 4); c.lineTo(6, -hover - 4); c.lineTo(0, -2); c.fill();
    const y = -hover - 30;
    const g = c.createLinearGradient(-12, 0, 12, 0); g.addColorStop(0, "#f2f5f7"); g.addColorStop(1, "#b9c3ca");
    c.fillStyle = g; rr(c, -12, y, 24, 26, 8); c.fill();
    c.fillStyle = "#0e1a22"; rr(c, -9, y + 5, 18, 10, 5); c.fill();
    c.fillStyle = act ? "#7dfff6" : col; c.beginPath(); c.arc(-4, y + 10, 2.2, 0, TAU); c.arc(4, y + 10, 2.2, 0, TAU); c.fill();
    c.strokeStyle = "#8a979f"; c.lineWidth = 2; c.beginPath(); c.moveTo(0, y); c.lineTo(0, y - 8); c.stroke();
    c.fillStyle = act && Math.sin(now * 10) > 0 ? "#7dfff6" : col; c.beginPath(); c.arc(0, y - 9, 3, 0, TAU); c.fill();
    c.fillStyle = col; rr(c, -12, y + 19, 24, 4, 2); c.fill();
    c.restore();
  }
  function drawCrate(c, p) {
    const col = p.status === "failed" || p.status === "publish_failed" ? "#ff3b30" : p.status === "awaiting_approval" ? "#ff9500"
      : p.status === "published" || p.status === "ready" ? "#30d158" : p.status === "rejected" ? "#8e8e93" : "#0a84ff";
    const s = p.small ? 0.32 : 0.42;
    const x = p.x - s / 2, y = p.y - s / 2, z = p.z || 0;
    if (p.status === "awaiting_approval" && !p.carriedBy) floorSpace(c, p.x, p.y, z + 0.01, () => { c.fillStyle = `rgba(255,149,0,${0.2 + 0.15 * Math.sin(now * 5)})`; c.beginPath(); c.arc(0, 0, 0.45, 0, TAU); c.fill(); });
    box(c, x, y, z, s, s, s * 0.85, "#e9ddc6", { edgeColor: "rgba(255,255,255,.6)" });
    faceY(c, x, y + s, z, 0.04, s * 0.32, s - 0.04, s * 0.55, col);
    faceX(c, x + s, y, z, 0.04, s * 0.32, s - 0.04, s * 0.55, shade(col, -0.2));
    quadTop(c, x + s * 0.3, y + s * 0.3, x + s * 0.7, y + s * 0.7, z + s * 0.85 + 0.001, col);
  }
  function drawBubble(c, a, sel) {
    const s = a.srv.status;
    let text = null, col = P.text;
    if (a.job) text = a.job.phase === "pickup" ? "Holt Video …" : `Bringt #${a.job.pkg} → ${ZONE[a.job.to].name}`;
    else if (s === "working") text = a.srv.task;
    else if (s === "error") { text = a.srv.task || "Fehler"; col = "#ff3b30"; }
    else if (s === "paused") text = "Pausiert";
    else if (sel || cam.z > 1.15) text = a.srv.name;
    if (!text) return;
    const sc = Math.max(0.9, 0.82 / cam.z);
    text = text.length > 38 ? text.slice(0, 37) + "…" : text;
    const p = iso(a.x, a.y, a.key === "automator" ? 1.85 : 1.6);
    const fs = 11.5 * sc;
    c.font = `600 ${fs}px -apple-system, BlinkMacSystemFont, Inter, sans-serif`;
    const tw = c.measureText(text).width, bw = tw + 26 * sc, bh = 24 * sc, x = p.x - bw / 2, y = p.y - bh - 8 * sc;
    c.fillStyle = P.bubble; rr(c, x, y, bw, bh, bh / 2); c.fill();
    c.strokeStyle = P.bubbleLine; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.moveTo(p.x - 5 * sc, y + bh); c.lineTo(p.x, y + bh + 6 * sc); c.lineTo(p.x + 5 * sc, y + bh); c.fillStyle = P.bubble; c.fill();
    c.fillStyle = AGENT_COLOR[a.key]; c.beginPath(); c.arc(x + 11 * sc, y + bh / 2, 3.5 * sc, 0, TAU); c.fill();
    c.fillStyle = col; c.fillText(text, x + 19 * sc, y + bh / 2 + fs * 0.36);
    if (s === "working" && !a.job && a.srv.progress != null) {
      c.fillStyle = "rgba(127,127,127,.25)"; rr(c, x + 12 * sc, y + bh - 4.5 * sc, bw - 24 * sc, 2.5 * sc, 1); c.fill();
      c.fillStyle = AGENT_COLOR[a.key]; rr(c, x + 12 * sc, y + bh - 4.5 * sc, (bw - 24 * sc) * a.srv.progress / 100, 2.5 * sc, 1); c.fill();
    }
  }
  function drawSigns(c) {
    const ag = opts.getAgents();
    for (const z of ZONES) {
      const owner = Object.keys(HOME).find((k) => HOME[k].zone === z.key);
      const st = owner === "automator" ? ((opts.getAutomation?.().active || []).length ? "working" : "idle") : owner ? (ag[owner]?.status || "idle") : (z.key === "approve" ? ([...pkgs.values()].some((p) => p.status === "awaiting_approval") ? "waiting" : "idle") : "idle");
      const pos = z.row === "C" ? iso(z.x + z.w / 2, 0.6, 4.4) : iso(z.x + z.w / 2, z.row === "A" ? 0.4 : z.y + 0.6, z.row === "A" ? 4.3 : 2.1);
      const sc = Math.max(0.85, 0.7 / cam.z);
      const label = { working: "Aktiv", idle: "Bereit", paused: "Pausiert", error: "Störung", waiting: "Wartet auf dich" }[st] || st;
      const scol = { working: "#0a84ff", idle: "#30d158", paused: "#8e8e93", error: "#ff3b30", waiting: "#ff9500" }[st] || "#8e8e93";
      c.font = `700 ${13 * sc}px -apple-system, BlinkMacSystemFont, Inter, sans-serif`;
      const w1 = c.measureText(z.name).width;
      c.font = `600 ${10.5 * sc}px -apple-system, Inter, sans-serif`;
      const w2 = c.measureText(label).width;
      const bw = Math.max(w1, w2 + 16 * sc) + 34 * sc, bh = 40 * sc, x = pos.x - bw / 2, y = pos.y - bh;
      c.fillStyle = P.night ? "rgba(22,24,30,.9)" : "rgba(255,255,255,.93)"; rr(c, x, y, bw, bh, 10 * sc); c.fill();
      c.strokeStyle = P.bubbleLine; c.lineWidth = 1; c.stroke();
      c.fillStyle = z.color; rr(c, x + 7 * sc, y + 8 * sc, 4 * sc, bh - 16 * sc, 2 * sc); c.fill();
      c.font = `700 ${13 * sc}px -apple-system, BlinkMacSystemFont, Inter, sans-serif`; c.fillStyle = P.text; c.fillText(z.name, x + 18 * sc, y + 17 * sc);
      c.fillStyle = scol; c.beginPath(); c.arc(x + 22 * sc, y + 29 * sc, 3.5 * sc, 0, TAU); c.fill();
      if (st === "working" || st === "waiting" || st === "error") { c.strokeStyle = hexA(scol, 0.4); c.lineWidth = 2 * sc; c.beginPath(); c.arc(x + 22 * sc, y + 29 * sc, (5 + 2 * Math.sin(now * 4)) * sc, 0, TAU); c.stroke(); }
      c.font = `600 ${10.5 * sc}px -apple-system, Inter, sans-serif`; c.fillStyle = P.text2; c.fillText(label, x + 30 * sc, y + 33 * sc);
      if (st === "error") { const zz = [iso(z.x, z.y, 0.01), iso(z.x + z.w, z.y, 0.01), iso(z.x + z.w, z.y + z.h, 0.01), iso(z.x, z.y + z.h, 0.01)]; poly(c, zz, `rgba(255,59,48,${0.07 + 0.05 * Math.sin(now * 5)})`); }
    }
  }
  function drawEffect(c, e) {
    const k = (now - e.t) / (e.life || 1.2);
    if (e.kind === "ring") floorSpace(c, e.x, e.y, 0.02, () => { c.strokeStyle = hexA(e.color, 1 - k); c.lineWidth = 0.07; c.beginPath(); c.arc(0, 0, 0.3 + k * 1.2, 0, TAU); c.stroke(); });
    else if (e.kind === "spark") { const p = iso(e.x, e.y, e.z + k * 0.8); c.fillStyle = `rgba(255,190,90,${1 - k})`; c.beginPath(); c.arc(p.x + k * 8, p.y, 2.2, 0, TAU); c.fill(); }
    else if (e.kind === "check") { const p = iso(e.x, e.y, 2.2 + k * 0.6); c.globalAlpha = 1 - k; c.fillStyle = e.ok ? "#30d158" : "#ff3b30"; c.beginPath(); c.arc(p.x, p.y, 11, 0, TAU); c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 2.5; c.beginPath(); if (e.ok) { c.moveTo(p.x - 5, p.y); c.lineTo(p.x - 1, p.y + 4); c.lineTo(p.x + 5, p.y - 4); } else { c.moveTo(p.x - 4, p.y - 4); c.lineTo(p.x + 4, p.y + 4); c.moveTo(p.x + 4, p.y - 4); c.lineTo(p.x - 4, p.y + 4); } c.stroke(); c.globalAlpha = 1; }
    else if (e.kind === "launch") {
      const p = e.p, base = iso(e.x, e.y, 0.3);
      if (k < 0.3) { const q = k / 0.3; drawCrate(c, { ...p, x: e.sx + (e.x - e.sx) * q, y: e.sy + (e.y - e.sy) * q, z: 0.3 + q * 0.2 }); }
      else {
        const q = (k - 0.3) / 0.7, top = base.y - 600;
        const g = c.createLinearGradient(0, top, 0, base.y); g.addColorStop(0, "rgba(191,90,242,0)"); g.addColorStop(1, `rgba(191,90,242,${0.6 * (1 - q)})`);
        c.fillStyle = g; c.fillRect(base.x - 26, top, 52, base.y - top);
        c.fillStyle = `rgba(255,255,255,${0.9 * (1 - q)})`; c.fillRect(base.x - 4, top, 8, base.y - top);
        drawCrate(c, { ...p, status: "published", x: e.x, y: e.y, z: 0.5 + q * 14 });
        c.globalAlpha = 1 - q; c.font = "800 16px -apple-system, Inter, sans-serif"; c.fillStyle = "#30d158"; c.fillText("Online!", base.x + 34, base.y - 50 - q * 30); c.globalAlpha = 1;
      }
      if (k >= 0.99) { p.launching = false; p.launched = true; }
    }
  }

  // ---------------- frame ----------------
  function frame() {
    if (!running) return;
    const tn = performance.now(), dt = Math.min(0.05, (tn - t0) / 1000);
    t0 = tn; now += dt;
    step(dt);
    if (camT) { const k = Math.min(1, dt * 5); cam.x += (camT.x - cam.x) * k; cam.y += (camT.y - cam.y) * k; cam.z += (camT.z - cam.z) * k; if (Math.abs(camT.z - cam.z) < 0.002 && Math.abs(camT.x - cam.x) < 0.5) camT = null; }
    if (selected && followSel) { const a = agents[selected]; if (a) { const p = iso(a.x, a.y, 0.8); cam.x += (p.x - cam.x) * Math.min(1, dt * 3); cam.y += (p.y - cam.y) * Math.min(1, dt * 3); } }
    const dpr = window.devicePixelRatio || 1, cw = canvas.width / dpr, ch = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, ch); bg.addColorStop(0, P.bg1); bg.addColorStop(1, P.bg2);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
    ctx.translate(cw / 2, ch / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    ctx.drawImage(staticLayer, staticOrigin.x, staticOrigin.y, staticOrigin.w, staticOrigin.h);
    drawWallScreens(ctx);
    for (const e of effects) if (e.kind === "ring") drawEffect(ctx, e);
    const items = machines.map((m) => ({ d: m.depth + (m.depthBias || 0), draw: () => m.draw(ctx) }));
    for (const p of pkgs.values()) if (p.vis !== false && !p.launching && !p.carriedBy) items.push({ d: p.x + p.y + (p.z ? 0.5 : 0), draw: () => drawCrate(ctx, p) });
    for (const a of Object.values(agents)) items.push({ d: a.x + a.y + 0.2, draw: () => (a.key === "automator" ? drawRobot(ctx, a, selected === a.key) : drawPerson(ctx, a, selected === a.key)) });
    items.sort((a, b) => a.d - b.d).forEach((i) => i.draw());
    for (const e of effects) if (e.kind !== "ring") drawEffect(ctx, e);
    drawSigns(ctx);
    for (const a of Object.values(agents).sort((p, q) => p.x + p.y - q.x - q.y)) drawBubble(ctx, a, selected === a.key);
    if (selected) opts.onSelect?.(selected, agents[selected]?.srv);
    requestAnimationFrame(frame);
  }

  // ---------------- camera & input ----------------
  let followSel = false;
  function insets() { return opts.getInsets?.() || { left: 20, right: 20, top: 20, bottom: 20 }; }
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
    if (!userMoved) fit(true);
  }
  function fitTarget(b) {
    const r = canvas.parentElement.getBoundingClientRect(), ins = insets();
    const z = Math.min((r.width - ins.left - ins.right) / (b.x1 - b.x0), (r.height - ins.top - ins.bottom) / (b.y1 - b.y0));
    return { z, x: (b.x0 + b.x1) / 2 - (ins.left - ins.right) / 2 / z, y: (b.y0 + b.y1) / 2 - (ins.top - ins.bottom) / 2 / z };
  }
  function fit(instant) {
    const t = fitTarget(bounds()); fitZ = t.z;
    if (instant) { cam = { ...t }; camT = null; } else camT = t;
    userMoved = false; followSel = false;
  }
  function focusZone(key) {
    const z = ZONE[key]; if (!z) return;
    const pts = [iso(z.x, z.y, 3), iso(z.x + z.w, z.y, 0), iso(z.x + z.w, z.y + z.h, 0), iso(z.x, z.y + z.h, 0)];
    const t = fitTarget({ x0: Math.min(...pts.map((p) => p.x)) - 30, x1: Math.max(...pts.map((p) => p.x)) + 30, y0: Math.min(...pts.map((p) => p.y)) - 60, y1: Math.max(...pts.map((p) => p.y)) + 20 });
    camT = { ...t, z: Math.min(t.z, fitZ * 3.2) }; userMoved = true; followSel = false;
  }
  function focusAgent(key) {
    const a = agents[key]; if (!a) return;
    selected = key; followSel = true; userMoved = true;
    camT = { x: iso(a.x, a.y, 0.8).x, y: iso(a.x, a.y, 0.8).y, z: Math.max(cam.z, fitZ * 2.2) };
  }
  function toWorld(px, py) {
    const r = canvas.getBoundingClientRect();
    return { x: (px - r.left - r.width / 2) / cam.z + cam.x, y: (py - r.top - r.height / 2) / cam.z + cam.y };
  }
  function screenToTile(w) { const a = w.x / HW, b = w.y / HH; return { x: (a + b) / 2, y: (b - a) / 2 }; }
  function hit(w) {
    for (const a of Object.values(agents)) { const p = iso(a.x, a.y, 0.6); if (Math.abs(p.x - w.x) < 13 && w.y > p.y - 34 && w.y < p.y + 22) return { type: "agent", a }; }
    for (const p of pkgs.values()) { if (p.vis === false || p.carriedBy || p.launching) continue; const q = iso(p.x, p.y, (p.z || 0) + 0.2); if (Math.hypot(q.x - w.x, q.y - w.y) < 13) return { type: "pkg", p }; }
    const t = screenToTile(w), z = zoneAt(t);
    if (z && t.x >= 0 && t.y >= 0) return { type: "zone", z };
    return null;
  }
  function bindInput() {
    let drag = null, moved = false, lastClick = 0;
    canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y }; moved = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; userMoved = true; followSel = false; camT = null; }
        if (moved) { cam.x = drag.cx - dx / cam.z; cam.y = drag.cy - dy / cam.z; }
      }
      const h = hit(toWorld(e.clientX, e.clientY));
      canvas.style.cursor = drag && moved ? "grabbing" : h ? "pointer" : "grab";
      if (h?.type === "pkg") showTip(e, `#${h.p.id} · ${h.p.title}`);
      else if (h?.type === "agent") showTip(e, `${h.a.srv.name || h.a.key} · ${h.a.srv.task || ""}`);
      else if (h?.type === "zone") showTip(e, `${h.z.name} · ${h.z.sub}${h.z.key === "approve" && [...pkgs.values()].some((p) => p.status === "awaiting_approval") ? " · Klicken zum Prüfen" : ""}`);
      else tip.hidden = true;
    });
    canvas.addEventListener("pointerup", (e) => {
      if (drag && !moved) {
        const h = hit(toWorld(e.clientX, e.clientY)), dbl = performance.now() - lastClick < 320;
        lastClick = performance.now();
        if (h?.type === "pkg") opts.openVideo(h.p.id);
        else if (h?.type === "agent") { selected = h.a.key; opts.onSelect?.(selected, h.a.srv, true); }
        else if (h?.type === "zone" && h.z.key === "approve" && [...pkgs.values()].some((p) => p.status === "awaiting_approval")) opts.openVideo([...pkgs.values()].filter((p) => p.status === "awaiting_approval").sort((a, b) => a.id - b.id)[0].id);
        else if (h?.type === "zone" && h.z.key === "auto") opts.onZone?.("auto");
        else if (h?.type === "zone" && dbl) focusZone(h.z.key);
        else { selected = null; followSel = false; opts.onSelect?.(null); }
      }
      drag = null;
    });
    canvas.addEventListener("pointerleave", () => (tip.hidden = true));
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault(); camT = null; followSel = false;
      const before = toWorld(e.clientX, e.clientY);
      cam.z = Math.max(fitZ * 0.6, Math.min(fitZ * 5, cam.z * Math.exp(-e.deltaY * 0.0015)));
      const after = toWorld(e.clientX, e.clientY);
      cam.x += before.x - after.x; cam.y += before.y - after.y; userMoved = true;
    }, { passive: false });
    new ResizeObserver(resize).observe(canvas.parentElement);
    const rebuild = () => buildStatic();
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", rebuild);
    new MutationObserver(rebuild).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  function showTip(e, text) {
    const r = canvas.parentElement.getBoundingClientRect();
    tip.hidden = false; tip.textContent = text.length > 90 ? text.slice(0, 89) + "…" : text;
    tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 220) + "px"; tip.style.top = e.clientY - r.top + 16 + "px";
  }

  // ---------------- public API ----------------
  window.Factory = {
    ICONS, AGENT_COLOR, ZONES,
    init(container, options) {
      opts = options;
      container.insertAdjacentHTML("afterbegin", `<canvas class="fx-canvas"></canvas><div class="fx-tip glass" hidden></div>`);
      canvas = container.querySelector(".fx-canvas");
      ctx = canvas.getContext("2d");
      tip = container.querySelector(".fx-tip");
      buildMachines(); buildStatic(); bindInput();
    },
    loadVideos(list) {
      const sorted = [...list].sort((a, b) => a.id - b.id);
      const done = sorted.filter((v) => v.status === "published" || v.status === "ready").slice(-10).map((v) => v.id);
      for (const v of sorted) { if ((v.status === "published" || v.status === "ready") && !done.includes(v.id)) continue; makePkg(v, zoneForVideo(v) || "leit"); }
    },
    video: onVideo,
    deleted: onDeleted,
    select(key) { focusAgent(key); },
    deselect() { selected = null; followSel = false; },
    fit: () => fit(false),
    zoom(f) { camT = null; followSel = false; cam.z = Math.max(fitZ * 0.6, Math.min(fitZ * 5, cam.z * f)); userMoved = true; },
    focusZone,
    start() { if (!running) { running = true; t0 = performance.now(); resize(); requestAnimationFrame(frame); } },
    stop() { running = false; },
  };
})();
