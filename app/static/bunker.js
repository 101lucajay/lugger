/* Lugger Bunker – top-down live view of the agent base.
 * Rooms = departments, characters = agents, film canisters = videos.
 * Driven by the live dashboard state (agents + video status changes). */
"use strict";
(function () {
  const W = 1800, H = 1000, CORR_Y = 480;
  const TAU = Math.PI * 2;

  // ---------------- layout ----------------
  const R = (key, name, x, y, color, top) => ({ key, name, x, y, w: 410, h: 360, color, top });
  const ROOMS = [
    R("radar", "Trend-Radar", 40, 40, "#4da3ff", true),
    R("leit", "Leitstand", 470, 40, "#a78bfa", true),
    R("script", "Schreibstube", 900, 40, "#ffd400", true),
    R("audio", "Tonstudio", 1330, 40, "#ff5c6c", true),
    R("send", "Sendezentrale", 40, 600, "#ff4fd8", false),
    R("approve", "Freigabe-Schleuse", 470, 600, "#3ee6e6", false),
    R("cut", "Schnittraum", 900, 600, "#ff9a3d", false),
    R("archive", "Bildarchiv", 1330, 600, "#35d07f", false),
  ];
  const ROOM = Object.fromEntries(ROOMS.map((r) => [r.key, r]));
  for (const r of ROOMS) {
    r.door = { x: r.x + r.w / 2, y: r.top ? r.y + r.h : r.y };
    r.doorIn = { x: r.door.x, y: r.door.y + (r.top ? -45 : 45) };
    r.corr = { x: r.door.x, y: CORR_Y };
  }
  // agent homes (where they work) & package inboxes
  const HOME = {
    trend_scout: { room: "radar", x: 40 + 300, y: 40 + 268 },
    producer: { room: "leit", x: 470 + 205, y: 40 + 290 },
    script_writer: { room: "script", x: 900 + 250, y: 40 + 222 },
    voice: { room: "audio", x: 1330 + 112, y: 40 + 140 },
    visuals: { room: "archive", x: 1330 + 300, y: 600 + 250 },
    editor: { room: "cut", x: 900 + 205, y: 600 + 175 },
    publisher: { room: "send", x: 40 + 300, y: 600 + 178 },
  };
  const INBOX = {
    radar: { x: 40 + 250, y: 40 + 170 }, leit: { x: 470 + 40, y: 40 + 300 },
    script: { x: 900 + 40, y: 40 + 300 }, audio: { x: 1330 + 250, y: 40 + 300 },
    archive: { x: 1330 + 40, y: 600 + 70 }, cut: { x: 900 + 40, y: 600 + 70 },
    approve: { x: 470 + 120, y: 600 + 200 }, send: { x: 40 + 230, y: 600 + 70 },
  };
  const AGENT_COLOR = {
    trend_scout: "#4da3ff", producer: "#a78bfa", script_writer: "#ffd400", voice: "#ff5c6c",
    visuals: "#35d07f", editor: "#ff9a3d", publisher: "#ff4fd8",
  };
  const SKIN = { trend_scout: "#f1c27d", producer: "#c68642", script_writer: "#ffdbac", voice: "#e0ac69",
    visuals: "#8d5524", editor: "#f1c27d", publisher: "#ffdbac" };
  const STATUS_ROOM = {
    queued: "leit", scripting: "script", scripted: "script", voicing: "audio", voiced: "audio",
    sourcing: "archive", visuals_ready: "archive", rendering: "cut", rendered: "cut",
    awaiting_approval: "approve", rejected: "approve", approved: "send", publishing: "send",
    publish_failed: "send", published: "send", ready: "send",
  };
  // who carries a package out of a room
  const CARRIER = { radar: "producer", leit: "producer", script: "script_writer", audio: "voice",
    archive: "visuals", cut: "editor", approve: "publisher", send: "publisher" };
  const ERROR_ROOM = { "Skript-Autor": "script", "Sprecher": "audio", "Bild-Redakteur": "archive",
    "Cutter": "cut", "Publisher": "send" };

  // ---------------- state ----------------
  let canvas, ctx, staticLayer, opts, hud, info, tip;
  let cam = { x: W / 2, y: H / 2, z: 1 }, fitZ = 1;
  const agents = {};
  const pkgs = new Map();
  const effects = [];
  let t0 = performance.now(), now = 0;
  let running = false;
  let selectedAgent = null;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function roomAt(p) { return ROOMS.find((r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h); }

  function route(from, fromRoom, to, toRoom) {
    if (fromRoom && fromRoom === toRoom) return [{ ...to }];
    const pts = [];
    const a = ROOM[fromRoom], b = ROOM[toRoom];
    if (a) pts.push(a.doorIn, a.door, a.corr);
    else pts.push({ x: from.x, y: CORR_Y });
    if (b) pts.push(b.corr, b.door, b.doorIn);
    pts.push(to);
    return pts.map((p) => ({ x: p.x + rnd(-4, 4), y: p.y + rnd(-4, 4) }));
  }

  // ---------------- agents ----------------
  function ensureAgent(key) {
    if (agents[key]) return agents[key];
    const h = HOME[key];
    if (!h) return null;
    agents[key] = { key, x: h.x, y: h.y, room: h.room, dir: -Math.PI / 2, path: [], jobs: [], job: null,
      carrying: null, walk: 0, moving: false, wanderAt: now + rnd(3, 8), srv: {} };
    return agents[key];
  }
  function goTo(a, target, targetRoom) {
    a.path = route(a, a.room || roomAt(a)?.key, target, targetRoom);
    a.targetRoom = targetRoom;
  }

  // ---------------- packages ----------------
  function roomForVideo(v) {
    if (v.status === "failed") {
      const m = /^\[([^\]]+)\]/.exec(v.error || "");
      return (m && ERROR_ROOM[m[1]]) || null;
    }
    return STATUS_ROOM[v.status] || null;
  }
  function makePkg(v, room) {
    const p = { id: v.id, title: v.title || v.topic, status: v.status, room, x: 0, y: 0, moves: [],
      carriedBy: null, pending: false, launched: v.status === "published" || v.status === "ready", born: now };
    const slot = INBOX[room] || INBOX.leit;
    p.x = slot.x; p.y = slot.y;
    pkgs.set(v.id, p);
    return p;
  }
  function lastDest(p) { return p.moves.length ? p.moves[p.moves.length - 1] : p.room; }

  function onVideo(v, prev) {
    let p = pkgs.get(v.id);
    const target = roomForVideo(v);
    if (!p) {
      if (!prev && v.status === "queued") {
        // a fresh production: the producer fetches the idea from the trend radar first
        p = makePkg(v, "radar");
        p.moves.push("leit");
      } else {
        p = makePkg(v, target || "leit");
      }
    }
    p.title = v.title || v.topic;
    const wasPublished = p.status === "published";
    p.status = v.status;
    if (target && target !== lastDest(p)) p.moves.push(target);
    if (v.status === "published" && !wasPublished) p.launchPending = true;
  }
  function onDeleted(id) {
    const p = pkgs.get(id);
    if (p?.carriedBy && agents[p.carriedBy]) agents[p.carriedBy].carrying = null;
    pkgs.delete(id);
  }

  function schedulePackages() {
    for (const p of pkgs.values()) {
      if (p.pending || p.carriedBy || !p.moves.length) continue;
      const to = p.moves[0];
      const carrierKey = CARRIER[p.room] || "producer";
      const a = ensureAgent(carrierKey);
      if (!a) { p.room = p.moves.shift(); continue; }
      p.pending = true;
      a.jobs.push({ pkg: p.id, to });
    }
  }

  function slotPositions() {
    const byRoom = {};
    for (const p of pkgs.values()) {
      if (p.carriedBy || p.hidden) continue;
      (byRoom[p.room] ||= []).push(p);
    }
    for (const [room, list] of Object.entries(byRoom)) {
      const base = INBOX[room];
      list.sort((a, b) => a.id - b.id);
      let shown = list;
      if (room === "send") {
        // published canisters go to the trophy shelf
        const done = list.filter((p) => p.launched && !p.launchPending);
        const active = list.filter((p) => !(p.launched && !p.launchPending));
        done.slice(-12).forEach((p, i) => { p.tx = 40 + 250 + (i % 6) * 22; p.ty = 600 + 300 + Math.floor(i / 6) * 22; p.vis = true; });
        done.slice(0, -12).forEach((p) => (p.vis = false));
        shown = active;
      }
      shown.forEach((p, i) => {
        p.tx = base.x + (i % 6) * 24;
        p.ty = base.y + Math.floor(i / 6) * 24;
        p.vis = true;
      });
    }
  }

  // ---------------- simulation ----------------
  function step(dt) {
    schedulePackages();
    slotPositions();
    for (const key of Object.keys(HOME)) ensureAgent(key);
    const srvAgents = opts.getAgents();
    for (const a of Object.values(agents)) {
      a.srv = srvAgents[a.key] || {};
      // pick next job
      if (!a.job && a.jobs.length) {
        a.job = a.jobs.shift();
        a.job.phase = "pickup";
        const p = pkgs.get(a.job.pkg);
        if (!p) { a.job = null; continue; }
        goTo(a, { x: (p.tx ?? p.x) + 10, y: (p.ty ?? p.y) + 14 }, p.room);
      }
      if (a.job && !a.path.length) {
        const p = pkgs.get(a.job.pkg);
        if (!p) { a.job = null; a.carrying = null; }
        else if (a.job.phase === "pickup") {
          p.carriedBy = a.key; a.carrying = p.id; a.job.phase = "deliver";
          const box = INBOX[a.job.to];
          goTo(a, { x: box.x + rnd(0, 60), y: box.y + 30 }, a.job.to);
          effects.push({ kind: "pop", x: a.x, y: a.y - 20, t: now, text: "📦" });
        } else if (a.job.phase === "deliver") {
          p.carriedBy = null; a.carrying = null; p.pending = false;
          p.room = p.moves.shift() || a.job.to; p.x = a.x; p.y = a.y;
          effects.push({ kind: "ring", x: a.x, y: a.y, t: now, color: ROOM[p.room].color });
          if (p.room === "send" && p.launchPending) startLaunch(p);
          a.job = null;
          if (!a.jobs.length) { const h = HOME[a.key]; goTo(a, h, h.room); }
        }
      }
      // no job: go home when there is work, otherwise wander a little
      if (!a.job && !a.path.length) {
        const h = HOME[a.key];
        const atHome = dist(a, h) < 3;
        const srv = a.srv;
        if (srv.status === "working" || srv.status === "paused" || a.jobs.length) {
          if (!atHome) goTo(a, h, h.room);
        } else if (now > a.wanderAt) {
          a.wanderAt = now + rnd(5, 12);
          if (atHome && Math.random() < 0.65) {
            const r = ROOM[h.room];
            goTo(a, { x: rnd(r.x + 60, r.x + r.w - 60), y: rnd(r.y + 90, r.y + r.h - 60) }, h.room);
            a.slow = true;
          } else if (!atHome) { goTo(a, h, h.room); a.slow = true; }
        }
      }
      // movement
      a.moving = false;
      if (a.path.length) {
        const tgt = a.path[0];
        const dx = tgt.x - a.x, dy = tgt.y - a.y, d = Math.hypot(dx, dy);
        const carried = a.carrying != null ? pkgs.get(a.carrying) : null;
        const behind = Math.max(0, (carried ? carried.moves.length - 1 : 0));
        const speed = a.slow && !a.job ? 55 : (190 + a.jobs.length * 60) * (1 + 0.9 * behind);
        if (d < speed * dt + 0.5) { a.x = tgt.x; a.y = tgt.y; a.path.shift(); if (!a.path.length) a.slow = false; }
        else { a.x += (dx / d) * speed * dt; a.y += (dy / d) * speed * dt; }
        if (d > 0.5) { a.dir = Math.atan2(dy, dx); a.moving = true; a.walk += dt * (speed / 18); }
        const r = roomAt(a);
        a.room = r ? r.key : null;
      } else if (dist(a, HOME[a.key]) < 3) {
        a.dir = HOME[a.key].room === "audio" ? -Math.PI / 2 : (ROOM[HOME[a.key].room].top ? -Math.PI / 2 : -Math.PI / 2);
      }
    }
    // packages follow carriers / ease into slots
    for (const p of pkgs.values()) {
      if (p.launching) continue;
      if (p.carriedBy && agents[p.carriedBy]) {
        const a = agents[p.carriedBy];
        p.x = a.x + Math.cos(a.dir) * 16; p.y = a.y + Math.sin(a.dir) * 16 - 4;
      } else if (p.tx != null) {
        p.x += (p.tx - p.x) * Math.min(1, dt * 6);
        p.y += (p.ty - p.y) * Math.min(1, dt * 6);
      }
    }
    for (let i = effects.length - 1; i >= 0; i--) if (now - effects[i].t > (effects[i].life || 1.2)) effects.splice(i, 1);
  }

  function startLaunch(p) {
    p.launchPending = false;
    p.launching = true;
    const shaft = { x: 40 + 110, y: 600 + 215 };
    const sx = p.x, sy = p.y, st = now;
    effects.push({ kind: "launch", t: now, life: 3.2, x: shaft.x, y: shaft.y, p, sx, sy, st });
  }

  // ---------------- drawing: static layer ----------------
  function seeded(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

  function buildStatic() {
    const S = 1.6;
    staticLayer = document.createElement("canvas");
    staticLayer.width = W * S; staticLayer.height = H * S;
    const c = staticLayer.getContext("2d");
    c.scale(S, S);
    // bedrock
    c.fillStyle = "#06080b"; c.fillRect(0, 0, W, H);
    const rand = seeded(42);
    for (let i = 0; i < 1400; i++) {
      c.fillStyle = `rgba(${90 + rand() * 40},${90 + rand() * 30},${100 + rand() * 30},${0.04 + rand() * 0.07})`;
      const s = 1 + rand() * 5;
      c.beginPath(); c.arc(rand() * W, rand() * H, s, 0, TAU); c.fill();
    }
    // corridor
    c.fillStyle = "#11151c"; c.fillRect(30, 410, W - 60, 140);
    c.strokeStyle = "rgba(255,255,255,.03)"; c.lineWidth = 1;
    for (let x = 30; x < W - 30; x += 40) { c.beginPath(); c.moveTo(x, 410); c.lineTo(x, 550); c.stroke(); }
    for (let y = 410; y < 550; y += 40) { c.beginPath(); c.moveTo(30, y); c.lineTo(W - 30, y); c.stroke(); }
    hazard(c, 30, 410, W - 60, 8); hazard(c, 30, 542, W - 60, 8);
    // pipes along the corridor
    for (const [y, col] of [[426, "#1d2533"], [434, "#232c3d"]]) { c.strokeStyle = col; c.lineWidth = 5; c.beginPath(); c.moveTo(40, y); c.lineTo(W - 40, y); c.stroke(); }
    c.font = "700 13px Inter, system-ui, sans-serif"; c.fillStyle = "rgba(255,255,255,.12)";
    c.fillText("HAUPTKORRIDOR  ·  EBENE  -3", 60, 535);
    c.fillText("LUGGER  UNTERGRUND-STUDIO", W - 320, 535);
    // rooms
    for (const r of ROOMS) drawRoomStatic(c, r);
    // vignette
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.55)");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }

  function hazard(c, x, y, w, h) {
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.fillStyle = "#2b2410"; c.fillRect(x, y, w, h);
    c.fillStyle = "rgba(255,212,0,.35)";
    for (let i = x - 20; i < x + w; i += 20) { c.beginPath(); c.moveTo(i, y + h); c.lineTo(i + 10, y + h); c.lineTo(i + 20, y); c.lineTo(i + 10, y); c.fill(); }
    c.restore();
  }

  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }

  function desk(c, x, y, w, h, color) {
    c.fillStyle = "rgba(0,0,0,.35)"; rr(c, x + 4, y + 6, w, h, 6); c.fill();
    c.fillStyle = "#2a3140"; rr(c, x, y, w, h, 6); c.fill();
    c.strokeStyle = "rgba(255,255,255,.06)"; c.lineWidth = 1; c.stroke();
    if (color) { c.fillStyle = color; c.globalAlpha = .25; c.fillRect(x + 4, y + h - 4, w - 8, 2); c.globalAlpha = 1; }
  }
  function monitor(c, x, y, w = 46) {
    c.fillStyle = "#0d1118"; rr(c, x, y, w, 8, 2); c.fill();
    c.fillStyle = "#3a4560"; c.fillRect(x + w / 2 - 4, y + 8, 8, 5);
  }
  function chair(c, x, y, color) {
    c.fillStyle = "#1a1f29"; c.beginPath(); c.arc(x, y, 13, 0, TAU); c.fill();
    c.strokeStyle = color; c.globalAlpha = .4; c.lineWidth = 2; c.stroke(); c.globalAlpha = 1;
  }

  function drawRoomStatic(c, r) {
    // floor
    c.fillStyle = "#151a23"; c.fillRect(r.x, r.y, r.w, r.h);
    const g = c.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 10, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.75);
    g.addColorStop(0, hexA(r.color, .10)); g.addColorStop(1, hexA(r.color, .02));
    c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = "rgba(255,255,255,.035)"; c.lineWidth = 1;
    for (let x = r.x; x < r.x + r.w; x += 30) { c.beginPath(); c.moveTo(x, r.y); c.lineTo(x, r.y + r.h); c.stroke(); }
    for (let y = r.y; y < r.y + r.h; y += 30) { c.beginPath(); c.moveTo(r.x, y); c.lineTo(r.x + r.w, y); c.stroke(); }
    // furniture
    FURNITURE[r.key]?.(c, r);
    // walls
    c.save();
    c.strokeStyle = "#232a37"; c.lineWidth = 14; c.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    c.shadowColor = r.color; c.shadowBlur = 14; c.strokeStyle = hexA(r.color, .75); c.lineWidth = 2;
    c.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    c.restore();
    // door gap + corridor connector
    const dw = 74, dy = r.top ? r.y + r.h - 12 : r.y - 12;
    c.fillStyle = "#151a23"; c.fillRect(r.door.x - dw / 2, dy, dw, 24);
    c.fillStyle = "#11151c";
    if (r.top) c.fillRect(r.door.x - dw / 2, r.y + r.h + 4, dw, 410 - (r.y + r.h) - 4);
    else c.fillRect(r.door.x - dw / 2, 550, dw, r.y - 550 - 4);
    c.fillStyle = hexA(r.color, .8);
    c.fillRect(r.door.x - dw / 2 - 4, dy, 4, 24); c.fillRect(r.door.x + dw / 2, dy, 4, 24);
    // name plate
    c.font = "800 15px Inter, system-ui, sans-serif"; c.fillStyle = hexA(r.color, .95);
    c.fillText(r.name.toUpperCase(), r.x + 18, r.y + 30);
  }

  const FURNITURE = {
    radar(c, r) {
      const cx = r.x + 120, cy = r.y + 175;
      c.fillStyle = "#0a1420"; c.beginPath(); c.arc(cx, cy, 92, 0, TAU); c.fill();
      c.strokeStyle = "rgba(77,163,255,.35)"; c.lineWidth = 1.5;
      for (const rad of [30, 60, 90]) { c.beginPath(); c.arc(cx, cy, rad, 0, TAU); c.stroke(); }
      c.beginPath(); c.moveTo(cx - 90, cy); c.lineTo(cx + 90, cy); c.moveTo(cx, cy - 90); c.lineTo(cx, cy + 90); c.stroke();
      // idea pinboard
      c.fillStyle = "#3b2f22"; rr(c, r.x + 228, r.y + 48, 160, 92, 6); c.fill();
      c.strokeStyle = "#5c4a35"; c.lineWidth = 3; c.stroke();
      desk(c, r.x + 262, r.y + 210, 80, 34, r.color); monitor(c, r.x + 279, r.y + 214);
      chair(c, r.x + 300, r.y + 268, r.color);
    },
    leit(c, r) {
      c.fillStyle = "#0b0f18"; rr(c, r.x + 30, r.y + 46, r.w - 60, 72, 8); c.fill();
      c.strokeStyle = "rgba(167,139,250,.5)"; c.lineWidth = 2; c.stroke();
      c.fillStyle = "#262d3b"; c.beginPath(); c.arc(r.x + 205, r.y + 215, 58, 0, TAU); c.fill();
      c.strokeStyle = "rgba(167,139,250,.35)"; c.lineWidth = 3; c.stroke();
      c.fillStyle = "#0d1118"; c.beginPath(); c.arc(r.x + 205, r.y + 215, 34, 0, TAU); c.fill();
      chair(c, r.x + 205, r.y + 292, r.color);
      c.fillStyle = "rgba(255,255,255,.08)"; rr(c, r.x + 30, r.y + 286, 160, 56, 6); c.fill();
    },
    script(c, r) {
      for (let i = 0; i < 4; i++) {
        c.fillStyle = "#2a2116"; c.fillRect(r.x + 18, r.y + 50 + i * 60, 34, 52);
        for (let j = 0; j < 6; j++) { c.fillStyle = ["#a33", "#36a", "#3a6", "#aa3", "#a63", "#666"][(i + j) % 6]; c.fillRect(r.x + 22 + (j % 3) * 9, r.y + 54 + i * 60 + Math.floor(j / 3) * 24, 7, 20); }
      }
      desk(c, r.x + 190, r.y + 140, 120, 42, r.color); monitor(c, r.x + 227, r.y + 145);
      c.fillStyle = "#e8e2d0"; c.save(); c.translate(r.x + 205, r.y + 160); c.rotate(-.2); c.fillRect(0, 0, 16, 20); c.restore();
      c.fillStyle = "#e8e2d0"; c.save(); c.translate(r.x + 285, r.y + 152); c.rotate(.3); c.fillRect(0, 0, 14, 18); c.restore();
      chair(c, r.x + 250, r.y + 222, r.color);
      desk(c, r.x + 300, r.y + 60, 80, 34); desk(c, r.x + 110, r.y + 60, 60, 34);
    },
    audio(c, r) {
      // glass booth
      c.fillStyle = "rgba(255,92,108,.05)"; c.fillRect(r.x + 40, r.y + 50, 150, 150);
      c.strokeStyle = "rgba(180,220,255,.35)"; c.lineWidth = 4; c.strokeRect(r.x + 40, r.y + 50, 150, 150);
      c.fillStyle = "#151a23"; c.fillRect(r.x + 95, r.y + 196, 40, 8);
      c.fillStyle = "#555"; c.beginPath(); c.arc(r.x + 115, r.y + 108, 6, 0, TAU); c.fill();
      c.strokeStyle = "#777"; c.lineWidth = 2; c.beginPath(); c.moveTo(r.x + 115, r.y + 108); c.lineTo(r.x + 150, r.y + 80); c.stroke();
      // mixer
      desk(c, r.x + 240, r.y + 100, 140, 60, r.color);
      for (let i = 0; i < 10; i++) { c.fillStyle = "#11151d"; c.fillRect(r.x + 250 + i * 12, r.y + 110, 6, 38); }
      // acoustic panels
      for (let i = 0; i < 5; i++) { c.fillStyle = "#1e1418"; c.fillRect(r.x + 225 + i * 34, r.y + 46, 28, 26); }
    },
    archive(c, r) {
      for (let row = 0; row < 3; row++) {
        const y = r.y + 130 + row * 70;
        c.fillStyle = "#222a22"; c.fillRect(r.x + 30, y, 220, 26);
        for (let i = 0; i < 9; i++) {
          c.fillStyle = "#3d4a3d"; c.beginPath(); c.arc(r.x + 44 + i * 24, y + 13, 9, 0, TAU); c.fill();
          c.fillStyle = "#1a201a"; c.beginPath(); c.arc(r.x + 44 + i * 24, y + 13, 3, 0, TAU); c.fill();
        }
      }
      desk(c, r.x + 262, r.y + 190, 100, 36, r.color); monitor(c, r.x + 289, r.y + 195);
      chair(c, r.x + 300, r.y + 252, r.color);
    },
    cut(c, r) {
      desk(c, r.x + 120, r.y + 110, 170, 40, r.color);
      monitor(c, r.x + 130, r.y + 116, 44); monitor(c, r.x + 183, r.y + 112, 44); monitor(c, r.x + 236, r.y + 116, 44);
      chair(c, r.x + 205, r.y + 178, r.color);
      for (let i = 0; i < 4; i++) {
        c.fillStyle = "#1b2029"; c.fillRect(r.x + 330, r.y + 110 + i * 56, 56, 46);
        c.strokeStyle = "rgba(255,154,61,.3)"; c.lineWidth = 1; c.strokeRect(r.x + 330, r.y + 110 + i * 56, 56, 46);
      }
      c.font = "700 10px Inter, sans-serif"; c.fillStyle = "rgba(255,154,61,.6)"; c.fillText("RENDER-FARM", r.x + 322, r.y + 102);
    },
    approve(c, r) {
      c.fillStyle = "#1f2733"; rr(c, r.x + 100, r.y + 170, 210, 90, 10); c.fill();
      c.strokeStyle = "rgba(62,230,230,.4)"; c.lineWidth = 2; c.stroke();
      c.font = "800 12px Inter, sans-serif"; c.fillStyle = "rgba(62,230,230,.55)";
      c.fillText("DEINE FREIGABE", r.x + 152, r.y + 290);
      for (let i = 0; i < 2; i++) { c.fillStyle = "#1a2a2a"; c.beginPath(); c.arc(r.x + 60 + i * 290, r.y + 300, 18, 0, TAU); c.fill(); }
    },
    send(c, r) {
      const cx = r.x + 110, cy = r.y + 215;
      c.fillStyle = "#05070a"; c.beginPath(); c.arc(cx, cy, 62, 0, TAU); c.fill();
      c.lineWidth = 10; c.strokeStyle = "#2b2410"; c.stroke();
      c.save(); c.setLineDash([12, 12]); c.strokeStyle = "rgba(255,212,0,.5)"; c.lineWidth = 6; c.beginPath(); c.arc(cx, cy, 62, 0, TAU); c.stroke(); c.restore();
      c.font = "700 10px Inter, sans-serif"; c.fillStyle = "rgba(255,79,216,.6)"; c.fillText("UPLINK ZUR OBERFLÄCHE", cx - 62, cy + 88);
      const terms = [["YT", "#ff3b3b"], ["TT", "#25f4ee"], ["IG", "#e1306c"]];
      terms.forEach(([t, col], i) => {
        const x = r.x + 230 + i * 52, y = r.y + 130;
        c.fillStyle = "#1d2230"; rr(c, x, y, 42, 30, 6); c.fill();
        c.strokeStyle = col; c.globalAlpha = .6; c.lineWidth = 2; c.stroke(); c.globalAlpha = 1;
        c.font = "800 12px Inter, sans-serif"; c.fillStyle = col; c.fillText(t, x + 12, y + 20);
      });
      c.fillStyle = "#1a1f2a"; c.fillRect(r.x + 240, r.y + 290, 150, 50);
      c.font = "700 10px Inter, sans-serif"; c.fillStyle = "rgba(53,208,127,.55)"; c.fillText("VERÖFFENTLICHT", r.x + 250, r.y + 352);
    },
  };

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------------- drawing: dynamic ----------------
  function agentWorking(key) { return opts.getAgents()[key]?.status === "working"; }

  function drawDynamic(c) {
    const ag = opts.getAgents();
    const stats = opts.getStats() || {};
    // corridor flow lights
    for (let i = 0; i < 24; i++) {
      const x = 40 + ((i * 75 + now * 60) % (W - 80));
      c.fillStyle = "rgba(77,163,255,.35)"; c.fillRect(x, 428, 8, 4);
    }
    // radar sweep
    {
      const r = ROOM.radar, cx = r.x + 120, cy = r.y + 175;
      const sp = agentWorking("trend_scout") ? 3.5 : 0.8;
      const a = now * sp;
      const g = c.createConicGradient ? c.createConicGradient(a, cx, cy) : null;
      if (g) {
        g.addColorStop(0, "rgba(77,163,255,.45)"); g.addColorStop(0.12, "rgba(77,163,255,0)"); g.addColorStop(1, "rgba(77,163,255,0)");
        c.fillStyle = g; c.beginPath(); c.arc(cx, cy, 90, 0, TAU); c.fill();
      }
      for (let i = 0; i < 5; i++) {
        const bl = (i * 1.7 + 0.3) % TAU, bd = 25 + ((i * 37) % 60);
        const fade = ((a - bl) % TAU + TAU) % TAU;
        c.fillStyle = `rgba(150,210,255,${Math.max(0, 1 - fade / 2.5)})`;
        c.beginPath(); c.arc(cx + Math.cos(bl) * bd, cy + Math.sin(bl) * bd, 3, 0, TAU); c.fill();
      }
      // idea sticky notes
      const n = Math.min(stats.ideas || 0, 15);
      const cols = ["#ffe066", "#ffd6a5", "#caffbf", "#9bf6ff", "#ffc6ff"];
      for (let i = 0; i < n; i++) {
        c.save(); c.translate(r.x + 240 + (i % 5) * 29, r.y + 58 + Math.floor(i / 5) * 26); c.rotate(((i * 7) % 5 - 2) * 0.05);
        c.fillStyle = cols[i % cols.length]; c.fillRect(0, 0, 22, 20); c.restore();
      }
      if ((stats.ideas || 0) > 15) { c.font = "700 11px Inter"; c.fillStyle = "#ffe066"; c.fillText(`+${stats.ideas - 15}`, r.x + 360, r.y + 135); }
    }
    // leitstand big screen
    {
      const r = ROOM.leit;
      c.font = "600 12px ui-monospace, monospace"; c.fillStyle = "rgba(200,190,255,.85)";
      const slot = ag.producer?.next_slot ? new Date(ag.producer.next_slot).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "Autopilot aus";
      c.fillText(`NÄCHSTE PRODUKTION: ${slot}`, r.x + 44, r.y + 70);
      c.fillText(`IN PRODUKTION: ${stats.in_production ?? 0}   ONLINE: ${stats.published ?? 0}`, r.x + 44, r.y + 92);
      const blink = Math.sin(now * 3) > 0;
      c.fillStyle = blink ? "rgba(167,139,250,.9)" : "rgba(167,139,250,.3)"; c.beginPath(); c.arc(r.x + r.w - 46, r.y + 64, 4, 0, TAU); c.fill();
      // hologram on table
      c.save(); c.globalAlpha = .35 + .15 * Math.sin(now * 2);
      c.strokeStyle = "#a78bfa"; c.lineWidth = 1.5;
      c.beginPath(); c.arc(r.x + 205, r.y + 215, 22 + 6 * Math.sin(now * 1.5), 0, TAU); c.stroke();
      c.restore();
    }
    // writing particles
    if (agentWorking("script_writer")) {
      const r = ROOM.script;
      for (let i = 0; i < 6; i++) {
        const ph = (now * 0.6 + i / 6) % 1;
        c.fillStyle = `rgba(255,212,0,${1 - ph})`; c.font = "700 11px Inter";
        c.fillText("abcdefghijk"[(i + Math.floor(now * 4)) % 11], r.x + 230 + i * 8, r.y + 140 - ph * 50);
      }
    }
    // tonstudio
    {
      const r = ROOM.audio, on = agentWorking("voice");
      c.fillStyle = on ? (Math.sin(now * 6) > -0.3 ? "#ff3b3b" : "#7a1d1d") : "#3a1d22";
      rr(c, r.x + 250, r.y + 190, 80, 24, 5); c.fill();
      c.font = "800 12px Inter"; c.fillStyle = on ? "#fff" : "#6a4a50"; c.fillText("ON AIR", r.x + 266, r.y + 207);
      for (let i = 0; i < 10; i++) {
        const lvl = on ? (0.3 + 0.7 * Math.abs(Math.sin(now * (5 + i) + i))) : 0.15;
        c.fillStyle = lvl > 0.8 ? "#ff5c6c" : "#35d07f"; c.fillRect(r.x + 250 + i * 12, r.y + 148 - lvl * 36, 6, lvl * 36);
      }
      if (on) {
        c.strokeStyle = "rgba(255,92,108,.6)"; c.lineWidth = 2;
        for (let k = 1; k <= 3; k++) { const ph = (now * 1.2 + k / 3) % 1; c.globalAlpha = 1 - ph; c.beginPath(); c.arc(r.x + 115, r.y + 108, 10 + ph * 40, -1.2, 0.2); c.stroke(); }
        c.globalAlpha = 1;
      }
    }
    // archive scanner
    if (agentWorking("visuals")) {
      const r = ROOM.archive, row = Math.floor(now * 1.5) % 3, x = r.x + 44 + ((now * 120) % 200);
      c.fillStyle = "rgba(53,208,127,.35)"; c.fillRect(x - 6, r.y + 126 + row * 70, 12, 34);
    }
    // cutting room screens + render farm LEDs
    {
      const r = ROOM.cut, ed = ag.editor || {}, on = ed.status === "working";
      [[130, 116], [183, 112], [236, 116]].forEach(([dx, dy], i) => {
        c.fillStyle = on ? hexA(["#ff9a3d", "#4da3ff", "#ffd400"][i], .55 + .2 * Math.sin(now * 4 + i)) : "#1a2030";
        c.fillRect(r.x + dx + 2, r.y + dy + 1, 40, 6);
      });
      for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) {
        const lit = on ? Math.sin(now * (8 + j) + i * 3 + j) > 0 : (i + j + Math.floor(now)) % 7 === 0;
        c.fillStyle = lit ? (on ? "#ff9a3d" : "#35d07f") : "#2a2f3a";
        c.fillRect(r.x + 338 + j * 8, r.y + 120 + i * 56, 5, 4);
        c.fillRect(r.x + 338 + j * 8, r.y + 132 + i * 56, 5, 4);
      }
      if (on && ed.progress != null) {
        c.fillStyle = "#0b0e14"; rr(c, r.x + 120, r.y + 240, 170, 14, 7); c.fill();
        c.fillStyle = "#ff9a3d"; rr(c, r.x + 120, r.y + 240, 170 * ed.progress / 100, 14, 7); c.fill();
        c.font = "700 10px Inter"; c.fillStyle = "#ffd8b0"; c.fillText(`RENDER ${Math.round(ed.progress)}%`, r.x + 172, r.y + 274);
      }
    }
    // approval room pulse
    {
      const r = ROOM.approve, waiting = [...pkgs.values()].some((p) => p.room === "approve" && p.status === "awaiting_approval" && !p.carriedBy);
      if (waiting) {
        c.save(); c.strokeStyle = `rgba(255,165,61,${0.4 + 0.4 * Math.sin(now * 4)})`; c.lineWidth = 6;
        c.strokeRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16); c.restore();
        c.font = "800 13px Inter"; c.fillStyle = "#ffa53d";
        c.fillText("▶ VIDEO WARTET – KLICK ZUM PRÜFEN", r.x + 86, r.y + 120);
      }
    }
    // uplink shaft glow
    {
      const r = ROOM.send, cx = r.x + 110, cy = r.y + 215, on = agentWorking("publisher");
      const g = c.createRadialGradient(cx, cy, 5, cx, cy, 58);
      g.addColorStop(0, on ? "rgba(255,79,216,.55)" : "rgba(255,79,216,.12)"); g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, 58, 0, TAU); c.fill();
    }
    // room status lamps + alarms
    for (const [key, h] of Object.entries(HOME)) {
      const r = ROOM[h.room], s = ag[key]?.status || "idle";
      const col = { working: "#4da3ff", idle: "#35d07f", error: "#ff5c6c", paused: "#6b7280", waiting: "#a78bfa" }[s] || "#6b7280";
      const lx = r.x + r.w - 26, ly = r.y + 26;
      c.fillStyle = col; c.beginPath(); c.arc(lx, ly, 6 + (s === "working" ? Math.sin(now * 6) : 0), 0, TAU); c.fill();
      c.fillStyle = hexA("#000000", 0);
      if (s === "error") {
        c.fillStyle = `rgba(255,40,60,${0.08 + 0.08 * Math.sin(now * 5)})`; c.fillRect(r.x, r.y, r.w, r.h);
      }
      if (s === "paused") { c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(r.x, r.y, r.w, r.h); }
    }
    // packages
    for (const p of pkgs.values()) if (p.vis !== false && !p.launching && !p.carriedBy) drawPkg(c, p);
    // effects (under agents)
    for (const e of effects) drawEffect(c, e);
    // agents
    const order = Object.values(agents).sort((a, b) => a.y - b.y);
    for (const a of order) drawAgent(c, a);
    for (const p of pkgs.values()) if (p.carriedBy) drawPkg(c, p);
    for (const a of order) drawBubble(c, a);
  }

  function drawPkg(c, p) {
    const col = p.status === "failed" || p.status === "publish_failed" ? "#ff5c6c"
      : p.status === "awaiting_approval" ? "#ffa53d"
      : p.status === "published" || p.status === "ready" ? "#35d07f"
      : p.status === "rejected" ? "#6b7280" : "#ffd400";
    const x = p.x, y = p.y;
    c.fillStyle = "rgba(0,0,0,.4)"; c.beginPath(); c.ellipse(x + 2, y + 4, 10, 6, 0, 0, TAU); c.fill();
    if (p.status === "awaiting_approval") {
      c.fillStyle = hexA("#ffa53d", .25 + .2 * Math.sin(now * 5)); c.beginPath(); c.arc(x, y, 16, 0, TAU); c.fill();
    }
    c.fillStyle = col; c.beginPath(); c.arc(x, y, 9, 0, TAU); c.fill();
    c.fillStyle = "rgba(0,0,0,.55)";
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + now * (p.carriedBy ? 3 : 0); c.beginPath(); c.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 1.6, 0, TAU); c.fill(); }
    c.fillStyle = "#111"; c.beginPath(); c.arc(x, y, 2, 0, TAU); c.fill();
    if (cam.z > 0.75) {
      c.font = "700 9px ui-monospace, monospace"; c.fillStyle = "rgba(255,255,255,.75)";
      c.fillText(`#${p.id}`, x - 8, y + 21);
    }
  }

  function drawAgent(c, a) {
    const col = AGENT_COLOR[a.key], s = a.srv.status;
    const working = s === "working" && !a.moving && !a.job;
    c.save(); c.translate(a.x, a.y);
    if (s === "paused") c.globalAlpha = .55;
    // selection ring
    if (selectedAgent === a.key) { c.strokeStyle = "#fff"; c.lineWidth = 2; c.setLineDash([4, 4]); c.beginPath(); c.arc(0, 0, 24, now * 2, now * 2 + TAU); c.stroke(); c.setLineDash([]); }
    // working glow
    if (working) { c.fillStyle = hexA(col, .18 + .1 * Math.sin(now * 5)); c.beginPath(); c.arc(0, 0, 26, 0, TAU); c.fill(); }
    // shadow
    c.fillStyle = "rgba(0,0,0,.45)"; c.beginPath(); c.ellipse(3, 5, 15, 11, 0, 0, TAU); c.fill();
    c.rotate(a.dir + Math.PI / 2);
    // legs / feet
    const sw = a.moving ? Math.sin(a.walk) * 7 : 0;
    c.fillStyle = "#1b1f29";
    c.beginPath(); c.ellipse(-6, -sw, 4, 6, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(6, sw, 4, 6, 0, 0, TAU); c.fill();
    // arms
    const arm = working ? Math.sin(now * 14) * 2.5 : (a.moving ? -sw * 0.6 : 0);
    c.fillStyle = col;
    c.beginPath(); c.ellipse(-13, -2 + arm, 4, 6, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(13, -2 - arm, 4, 6, 0, 0, TAU); c.fill();
    // body (shoulders)
    c.fillStyle = col; rr(c, -12, -7, 24, 15, 7); c.fill();
    c.strokeStyle = "rgba(0,0,0,.35)"; c.lineWidth = 1.5; c.stroke();
    // head
    c.fillStyle = SKIN[a.key]; c.beginPath(); c.arc(0, -1, 7.5, 0, TAU); c.fill();
    c.fillStyle = "rgba(40,30,20,.85)"; c.beginPath(); c.arc(0, 1.5, 7.5, 0.15, Math.PI - 0.15); c.fill(); // hair
    if (a.key === "voice") { c.strokeStyle = "#222"; c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, 9, Math.PI + 0.3, TAU - 0.3); c.stroke(); }
    c.restore();
    // icon badge
    if (cam.z > 0.55) {
      c.font = "15px system-ui"; c.textAlign = "center";
      c.fillText(a.srv.icon || "", a.x, a.y - 22);
      c.font = "700 10px Inter, sans-serif"; c.fillStyle = "rgba(255,255,255,.85)";
      c.fillText(a.srv.name || a.key, a.x, a.y + 30);
      c.textAlign = "left";
    }
  }

  function drawBubble(c, a) {
    const s = a.srv.status;
    let text = null, col = "#e8ebf2", border = "rgba(255,255,255,.15)";
    if (a.job) text = a.job.phase === "pickup" ? "holt Video …" : `bringt #${a.job.pkg} → ${ROOM[a.job.to].name}`;
    else if (s === "working") text = a.srv.task;
    else if (s === "error") { text = "⚠ " + (a.srv.task || "Fehler"); col = "#ffb3bb"; border = "rgba(255,92,108,.6)"; }
    else if (s === "paused") text = "💤 pausiert";
    if (!text || cam.z < 0.5) return;
    text = text.length > 38 ? text.slice(0, 37) + "…" : text;
    c.font = "600 11px Inter, sans-serif";
    const w = c.measureText(text).width + 16, x = a.x - w / 2, y = a.y - 62;
    c.fillStyle = "rgba(10,12,18,.9)"; rr(c, x, y, w, 24, 8); c.fill();
    c.strokeStyle = border; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.moveTo(a.x - 5, y + 24); c.lineTo(a.x, y + 31); c.lineTo(a.x + 5, y + 24); c.fillStyle = "rgba(10,12,18,.9)"; c.fill();
    c.fillStyle = col; c.fillText(text, x + 8, y + 16);
    if (s === "working" && !a.job && a.srv.progress != null) {
      c.fillStyle = "rgba(255,255,255,.1)"; c.fillRect(x + 6, y + 20, w - 12, 2);
      c.fillStyle = AGENT_COLOR[a.key]; c.fillRect(x + 6, y + 20, (w - 12) * a.srv.progress / 100, 2);
    }
  }

  function drawEffect(c, e) {
    const k = (now - e.t) / (e.life || 1.2);
    if (e.kind === "ring") {
      c.strokeStyle = hexA(e.color, 1 - k); c.lineWidth = 3;
      c.beginPath(); c.arc(e.x, e.y, 10 + k * 40, 0, TAU); c.stroke();
    } else if (e.kind === "pop") {
      c.globalAlpha = 1 - k; c.font = "16px system-ui"; c.fillText(e.text, e.x - 8, e.y - k * 25); c.globalAlpha = 1;
    } else if (e.kind === "launch") {
      const p = e.p;
      if (k < 0.3) { const q = k / 0.3; p.x = e.sx + (e.x - e.sx) * q; p.y = e.sy + (e.y - e.sy) * q; drawPkg(c, p); }
      else {
        const q = (k - 0.3) / 0.7;
        c.fillStyle = `rgba(255,79,216,${0.6 * (1 - q)})`; c.fillRect(e.x - 14, 0, 28, e.y);
        c.fillStyle = `rgba(255,255,255,${0.9 * (1 - q)})`; c.fillRect(e.x - 4, 0, 8, e.y);
        c.strokeStyle = `rgba(53,208,127,${1 - q})`; c.lineWidth = 4; c.beginPath(); c.arc(e.x, e.y, 20 + q * 80, 0, TAU); c.stroke();
        c.globalAlpha = 1 - q; c.font = "800 16px Inter"; c.fillStyle = "#35d07f"; c.fillText("ONLINE! 🚀", e.x + 30, e.y - 40 - q * 30); c.globalAlpha = 1;
      }
      if (k >= 0.99) { p.launching = false; p.launched = true; }
    }
  }

  // ---------------- camera & render loop ----------------
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
    const nz = Math.min(r.width / W, r.height / H) * 0.98;
    if (cam.z === fitZ) cam.z = nz;
    fitZ = nz;
  }
  function fit() { cam = { x: W / 2, y: H / 2, z: fitZ }; }
  function toWorld(px, py) {
    const r = canvas.getBoundingClientRect();
    return { x: (px - r.left - r.width / 2) / cam.z + cam.x, y: (py - r.top - r.height / 2) / cam.z + cam.y };
  }

  function frame() {
    if (!running) return;
    const tNow = performance.now();
    const dt = Math.min(0.05, (tNow - t0) / 1000);
    t0 = tNow; now += dt;
    step(dt);
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.width / dpr, ch = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#040507"; ctx.fillRect(0, 0, cw, ch);
    ctx.translate(cw / 2, ch / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    ctx.drawImage(staticLayer, 0, 0, W, H);
    drawDynamic(ctx);
    // scanlines
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "rgba(255,255,255,.012)";
    for (let y = 0; y < ch; y += 3) ctx.fillRect(0, y, cw, 1);
    hud.querySelector(".bk-clock").textContent = new Date().toLocaleTimeString("de-DE");
    if (selectedAgent) renderInfo();
    requestAnimationFrame(frame);
  }

  // ---------------- interaction ----------------
  function hit(wp) {
    for (const a of Object.values(agents)) if (dist(a, wp) < 20) return { type: "agent", a };
    for (const p of pkgs.values()) if (p.vis !== false && dist(p, wp) < 14) return { type: "pkg", p };
    const r = roomAt(wp);
    if (r) return { type: "room", r };
    return null;
  }
  function bindInput() {
    let drag = null, moved = false;
    canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y }; moved = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        cam.x = drag.cx - dx / cam.z; cam.y = drag.cy - dy / cam.z;
      }
      const h = hit(toWorld(e.clientX, e.clientY));
      canvas.style.cursor = drag && moved ? "grabbing" : h && h.type !== "room" ? "pointer" : (h?.r?.key === "approve" ? "pointer" : "grab");
      if (h?.type === "pkg") showTip(e, `#${h.p.id} · ${h.p.title}`);
      else if (h?.type === "agent") showTip(e, `${h.a.srv.name}: ${h.a.srv.task || ""}`);
      else if (h?.type === "room") showTip(e, h.r.name);
      else tip.hidden = true;
    });
    canvas.addEventListener("pointerup", (e) => {
      if (drag && !moved) {
        const h = hit(toWorld(e.clientX, e.clientY));
        if (h?.type === "pkg") opts.openVideo(h.p.id);
        else if (h?.type === "agent") { selectedAgent = h.a.key; renderInfo(); }
        else if (h?.type === "room" && h.r.key === "approve") {
          const w = [...pkgs.values()].find((p) => p.status === "awaiting_approval");
          if (w) opts.openVideo(w.id);
        } else { selectedAgent = null; info.hidden = true; }
      }
      drag = null;
    });
    canvas.addEventListener("pointerleave", () => (tip.hidden = true));
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const before = toWorld(e.clientX, e.clientY);
      cam.z = Math.max(fitZ * 0.8, Math.min(3, cam.z * Math.exp(-e.deltaY * 0.0015)));
      const after = toWorld(e.clientX, e.clientY);
      cam.x += before.x - after.x; cam.y += before.y - after.y;
    }, { passive: false });
    hud.querySelector("[data-bk=fit]").onclick = fit;
    hud.querySelector("[data-bk=in]").onclick = () => (cam.z = Math.min(3, cam.z * 1.25));
    hud.querySelector("[data-bk=out]").onclick = () => (cam.z = Math.max(fitZ * 0.8, cam.z / 1.25));
    hud.querySelector("[data-bk=full]").onclick = () => {
      const el = canvas.parentElement;
      document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.();
    };
    new ResizeObserver(resize).observe(canvas.parentElement);
  }
  function showTip(e, text) {
    const r = canvas.parentElement.getBoundingClientRect();
    tip.hidden = false; tip.textContent = text.length > 90 ? text.slice(0, 89) + "…" : text;
    tip.style.left = e.clientX - r.left + 14 + "px"; tip.style.top = e.clientY - r.top + 14 + "px";
  }
  let lastInfo = "";
  function renderInfo() {
    const a = opts.getAgents()[selectedAgent];
    if (!a) return;
    const html = `<div class="bk-info-h"><span style="font-size:22px">${a.icon}</span><div><b>${a.name}</b><div class="bk-sub">${a.role}</div></div>
      <button class="bk-x" data-bk="close">×</button></div>
      <div class="bk-st s-${a.status}">${{ working: "arbeitet", idle: "bereit", paused: "pausiert", error: "Fehler", waiting: "wartet" }[a.status] || a.status}</div>
      <div class="bk-task">${(a.task || "–").replace(/</g, "&lt;")}</div>
      ${a.status === "working" && a.progress != null ? `<div class="bar"><div style="width:${Math.round(a.progress)}%"></div></div>` : ""}
      <div class="bk-sub">${a.video_id ? `Video #${a.video_id} · ` : ""}✓ ${a.processed} erledigt${a.failed ? ` · ✗ ${a.failed}` : ""}</div>
      <div class="row gap" style="margin-top:8px">
        <button class="btn small" data-bk="toggle">${a.enabled ? "⏸ Pause" : "▶ Fortsetzen"}</button>
        ${a.manual ? '<button class="btn small" data-bk="run">⚡ Ausführen</button>' : ""}
        ${a.video_id ? `<button class="btn small" data-bk="video">🎬 Video</button>` : ""}
      </div>`;
    if (html === lastInfo && !info.hidden) return;
    lastInfo = html; info.innerHTML = html; info.hidden = false;
    info.querySelector("[data-bk=close]").onclick = () => { selectedAgent = null; info.hidden = true; };
    info.querySelector("[data-bk=toggle]").onclick = () => opts.agentAction(a.key, a.enabled ? "pause" : "resume");
    info.querySelector("[data-bk=run]")?.addEventListener("click", () => opts.agentAction(a.key, "run"));
    info.querySelector("[data-bk=video]")?.addEventListener("click", () => opts.openVideo(a.video_id));
  }

  // ---------------- public API ----------------
  window.Bunker = {
    init(container, options) {
      opts = options;
      container.innerHTML = `
        <canvas class="bk-canvas"></canvas>
        <div class="bk-hud">
          <div class="bk-title"><span class="bk-dot"></span>BUNKER · EBENE -3 <span class="bk-clock"></span></div>
          <div class="bk-legend">
            <span><i style="background:#ffd400"></i>in Arbeit</span><span><i style="background:#ffa53d"></i>wartet auf dich</span>
            <span><i style="background:#35d07f"></i>online</span><span><i style="background:#ff5c6c"></i>Fehler</span>
          </div>
          <div class="bk-btns"><button class="btn small" data-bk="out">−</button><button class="btn small" data-bk="in">+</button>
            <button class="btn small" data-bk="fit">⌖ Übersicht</button><button class="btn small" data-bk="full">⛶</button></div>
        </div>
        <div class="bk-info" hidden></div><div class="bk-tip" hidden></div>`;
      canvas = container.querySelector("canvas");
      ctx = canvas.getContext("2d");
      hud = container.querySelector(".bk-hud");
      info = container.querySelector(".bk-info");
      tip = container.querySelector(".bk-tip");
      buildStatic();
      resize(); fit();
      bindInput();
    },
    loadVideos(list) {
      const sorted = [...list].sort((a, b) => a.id - b.id);
      const done = sorted.filter((v) => v.status === "published" || v.status === "ready").slice(-12).map((v) => v.id);
      for (const v of sorted) {
        if ((v.status === "published" || v.status === "ready") && !done.includes(v.id)) continue;
        const room = roomForVideo(v) || "leit";
        const p = makePkg(v, room);
        p.status = v.status;
      }
    },
    video: onVideo,
    deleted: onDeleted,
    start() { if (!running) { running = true; t0 = performance.now(); resize(); requestAnimationFrame(frame); } },
    stop() { running = false; },
  };
})();
