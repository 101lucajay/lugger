/* Lugger Bunker – live view of the agent base on three underground floors.
 * Floors: −1 Kommando, −2 Kreativ, −3 Technik, connected by an elevator.
 * Views: "Alle Ebenen" (stacked cutaway) or a single floor plan from above.
 * Agents are avatars that work at their desks and carry each video (a film tile)
 * from department to department – including elevator rides between floors. */
"use strict";
(function () {
  const TAU = Math.PI * 2;
  const FW = 1400, FH = 760;                 // one floor plan, local units
  const CY = 380;                             // corridor centre line
  const ELEV = { x: 1252, y: 292, w: 118, h: 176, door: { x: 1236, y: CY }, inn: { x: 1311, y: CY } };
  const STACK = { a: 1, b: 0, c: 0.45, d: 0.42, gap: 400 };   // oblique cutaway

  // ---------------- icons (24-grid strokes, shared with the dashboard) ----------------
  const ICONS = {
    trend_scout: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 12l6-6",
    producer: "M4 10h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M4 10l1-4.5 15 3-.6 1.5 M9.5 5.6l1.2 3.4 M14.5 6.6l1.2 3.4",
    script_writer: "M16.5 3.5l4 4L8 20l-5 1 1-5z M14 6l4 4",
    voice: "M9 5.5a3 3 0 0 1 6 0V11a3 3 0 0 1-6 0z M5.5 11a6.5 6.5 0 0 0 13 0 M12 17.5V21",
    visuals: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 20",
    editor: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.2 7.8L20 19.5 M8.2 16.2L20 4.5",
    publisher: "M21 3L10.5 13.5 M21 3l-6.5 18-4-7.5L3 9.5z",
  };
  const AGENT_COLOR = { trend_scout: "#0a84ff", producer: "#5e5ce6", script_writer: "#f5a700", voice: "#ff375f",
    visuals: "#30b45a", editor: "#ff6a2b", publisher: "#bf5af2" };
  const PATHS = {};
  const path = (k) => (PATHS[k] ||= new Path2D(ICONS[k]));

  // ---------------- building layout ----------------
  const SLOT = { TL: [30, 30, true], TR: [640, 30, true], BL: [30, 430, false], BR: [640, 430, false] };
  const FLOORS = [
    { lvl: "−1", name: "Kommando", rooms: [["radar", "Trend-Radar", "Recherche", "TL", "#0a84ff"], ["leit", "Leitstand", "Planung", "TR", "#5e5ce6"],
      ["send", "Sendezentrale", "Upload", "BL", "#bf5af2"], ["approve", "Freigabe", "Deine Prüfung", "BR", "#ff9500"]] },
    { lvl: "−2", name: "Kreativ", rooms: [["script", "Schreibstube", "Skript", "TL", "#f5a700"], ["audio", "Tonstudio", "Stimme", "TR", "#ff375f"],
      ["archive", "Bildarchiv", "Material", "BL", "#30b45a"], ["lounge", "Lounge", "Pause", "BR", "#64d2ff"]] },
    { lvl: "−3", name: "Technik", rooms: [["cut", "Schnittraum", "Schnitt", "TL", "#ff6a2b"], ["farm", "Render-Farm", "Rendering", "TR", "#0a84ff"],
      ["server", "Serverraum", "Infrastruktur", "BL", "#8e8e93"], ["power", "Energie", "Kühlung & Strom", "BR", "#ffcc00"]] },
  ];
  const ROOM = {};
  FLOORS.forEach((f, fi) => {
    f.rooms = f.rooms.map(([key, name, sub, slot, color]) => {
      const [x, y, top] = SLOT[slot];
      const r = { key, name, sub, color, floor: fi, x, y, w: 590, h: 300, top };
      r.door = { x: x + 295, y: top ? y + 300 : y };
      r.doorIn = { x: r.door.x, y: r.door.y + (top ? -40 : 40) };
      r.corr = { x: r.door.x, y: CY };
      ROOM[key] = r;
      return r;
    });
  });
  const rel = (room, dx, dy) => ({ x: ROOM[room].x + dx, y: ROOM[room].y + dy });
  const HOME = {
    trend_scout: { room: "radar", ...rel("radar", 455, 248) },
    producer: { room: "leit", ...rel("leit", 400, 205) },
    script_writer: { room: "script", ...rel("script", 330, 212) },
    voice: { room: "audio", ...rel("audio", 135, 165) },
    visuals: { room: "archive", ...rel("archive", 445, 232) },
    editor: { room: "cut", ...rel("cut", 295, 190) },
    publisher: { room: "send", ...rel("send", 420, 200) },
  };
  const INBOX = {
    radar: rel("radar", 262, 150), leit: rel("leit", 60, 236), send: rel("send", 60, 60), approve: rel("approve", 200, 148),
    script: rel("script", 430, 246), audio: rel("audio", 430, 246), archive: rel("archive", 60, 62), cut: rel("cut", 60, 246),
  };
  const STATUS_ROOM = { queued: "leit", scripting: "script", scripted: "script", voicing: "audio", voiced: "audio",
    sourcing: "archive", visuals_ready: "archive", rendering: "cut", rendered: "cut", awaiting_approval: "approve",
    rejected: "approve", approved: "send", publishing: "send", publish_failed: "send", published: "send", ready: "send" };
  const CARRIER = { radar: "producer", leit: "producer", script: "script_writer", audio: "voice", archive: "visuals",
    cut: "editor", approve: "publisher", send: "publisher" };
  const ERROR_ROOM = { "Skript-Autor": "script", "Sprecher": "audio", "Bild-Redakteur": "archive", "Cutter": "cut", "Publisher": "send" };

  // ---------------- theme ----------------
  const PAL = {
    light: { ground: "#e3e5ea", slab: "#f4f5f7", side: "#d5d8de", side2: "#c9ccd3", corr: "#eceef2", room: "#ffffff", wall: "#d4d7dd",
      furn: "#f3f4f6", line: "rgba(0,0,0,.07)", shadow: "rgba(30,35,50,.13)", text: "#1d1d1f", text2: "#6e6e73", text3: "#a1a1a6",
      glass: "rgba(255,255,255,.88)", glassLine: "rgba(0,0,0,.08)", screen: "#1c1c1e", screenText: "#e5e5ea", avatar: "#ffffff", flow: "rgba(0,111,255,.35)" },
    dark: { ground: "#050506", slab: "#141416", side: "#0d0d0f", side2: "#09090a", corr: "#19191c", room: "#1f1f22", wall: "#38383c",
      furn: "#2c2c30", line: "rgba(255,255,255,.07)", shadow: "rgba(0,0,0,.55)", text: "#f5f5f7", text2: "#a1a1a6", text3: "#6e6e73",
      glass: "rgba(40,40,44,.9)", glassLine: "rgba(255,255,255,.1)", screen: "#0a0a0b", screenText: "#d1d1d6", avatar: "#2c2c2e", flow: "rgba(10,132,255,.45)" },
  };
  let P = PAL.light;
  function isDark() {
    const t = document.documentElement.getAttribute("data-theme");
    if (t) return t === "dark";
    return matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // ---------------- state ----------------
  let canvas, ctx, opts, hud, info, tip, floorBtns;
  let layers = [];
  let view = "all";                 // "all" | floor index
  let cam = { x: 0, y: 0, z: 1 }, fitZ = 1, userMoved = false;
  const agents = {};
  const pkgs = new Map();
  const effects = [];
  let now = 0, t0 = performance.now(), running = false, selectedAgent = null;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const ease = (k) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;

  function roomAt(fi, p) {
    return FLOORS[fi].rooms.find((r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) || null;
  }

  // ---------------- projection ----------------
  function floorMatrix(fi) {
    if (view !== "all") return new DOMMatrix();
    const S = STACK;
    return new DOMMatrix([S.a, S.b, S.c, S.d, 0, fi * S.gap]);
  }
  function project(fi, p) { return floorMatrix(fi).transformPoint(new DOMPoint(p.x, p.y)); }
  function visibleFloor(fi) { return view === "all" || view === fi; }
  function worldBounds() {
    if (view !== "all") return { x0: -20, y0: -20, x1: FW + 20, y1: FH + 20 };
    const S = STACK;
    return { x0: -230, y0: -40, x1: FW + FH * S.c + 30, y1: 2 * S.gap + FH * S.d + 60 };
  }

  // ---------------- agents & routing ----------------
  function ensureAgent(key) {
    if (agents[key]) return agents[key];
    const h = HOME[key];
    if (!h) return null;
    return (agents[key] = { key, x: h.x, y: h.y, floor: ROOM[h.room].floor, dir: -Math.PI / 2, path: [], jobs: [], job: null,
      carrying: null, moving: false, walk: 0, ride: null, wanderAt: now + rnd(3, 9), srv: {} });
  }
  function route(a, to, toRoomKey) {
    const pts = [];
    const fromRoom = a.floor != null ? roomAt(a.floor, a) : null;
    const toRoom = ROOM[toRoomKey];
    if (fromRoom && toRoom && fromRoom.key === toRoom.key) return [{ ...to }];
    if (fromRoom) pts.push(fromRoom.doorIn, fromRoom.door, fromRoom.corr);
    else pts.push({ x: a.x, y: CY });
    if (toRoom && toRoom.floor !== a.floor) pts.push(ELEV.door, ELEV.inn, { ride: toRoom.floor }, ELEV.door);
    if (toRoom) pts.push(toRoom.corr, toRoom.door, toRoom.doorIn);
    pts.push(to);
    return pts.map((p) => (p.ride != null ? p : { x: p.x + rnd(-3, 3), y: p.y + rnd(-3, 3) }));
  }
  function goTo(a, target, roomKey) { a.path = route(a, target, roomKey); }

  // ---------------- packages ----------------
  function roomForVideo(v) {
    if (v.status === "failed") {
      const m = /^\[([^\]]+)\]/.exec(v.error || "");
      return (m && ERROR_ROOM[m[1]]) || null;
    }
    return STATUS_ROOM[v.status] || null;
  }
  function makePkg(v, room) {
    const s = INBOX[room] || INBOX.leit;
    const p = { id: v.id, title: v.title || v.topic, status: v.status, room, x: s.x, y: s.y, moves: [], carriedBy: null,
      pending: false, launched: v.status === "published" || v.status === "ready", vis: true };
    pkgs.set(v.id, p);
    return p;
  }
  const lastDest = (p) => (p.moves.length ? p.moves[p.moves.length - 1] : p.room);
  function onVideo(v, prev) {
    let p = pkgs.get(v.id);
    const target = roomForVideo(v);
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
  function onDeleted(id) {
    const p = pkgs.get(id);
    if (p?.carriedBy && agents[p.carriedBy]) agents[p.carriedBy].carrying = null;
    pkgs.delete(id);
  }
  function schedulePackages() {
    for (const p of pkgs.values()) {
      if (p.pending || p.carriedBy || !p.moves.length) continue;
      const a = ensureAgent(CARRIER[p.room] || "producer");
      if (!a) { p.room = p.moves.shift(); continue; }
      p.pending = true;
      a.jobs.push({ pkg: p.id, to: p.moves[0] });
    }
  }
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
        done.slice(-10).forEach((p, i) => { const s = rel("send", 338 + (i % 10) * 22, 262); p.tx = s.x; p.ty = s.y; p.vis = true; p.small = true; });
      }
      const base = INBOX[room] || { x: ROOM[room].x + 40, y: ROOM[room].y + 60 };
      shown.forEach((p, i) => { p.tx = base.x + (i % 6) * 26; p.ty = base.y + Math.floor(i / 6) * 26; p.vis = true; p.small = false; });
    }
  }
  function pkgFloor(p) {
    if (p.carriedBy && agents[p.carriedBy]) return agents[p.carriedBy].floor;
    return ROOM[p.room]?.floor ?? 0;
  }

  // ---------------- simulation ----------------
  function step(dt) {
    schedulePackages();
    slotPositions();
    for (const k of Object.keys(HOME)) ensureAgent(k);
    const srv = opts.getAgents();
    for (const a of Object.values(agents)) {
      a.srv = srv[a.key] || {};
      if (!a.job && a.jobs.length && !a.ride) {
        a.job = a.jobs.shift();
        a.job.phase = "pickup";
        const p = pkgs.get(a.job.pkg);
        if (!p) { a.job = null; continue; }
        goTo(a, { x: (p.tx ?? p.x) + 12, y: (p.ty ?? p.y) + 18 }, p.room);
      }
      if (a.job && !a.path.length && !a.ride) {
        const p = pkgs.get(a.job.pkg);
        if (!p) { a.job = null; a.carrying = null; }
        else if (a.job.phase === "pickup") {
          p.carriedBy = a.key; a.carrying = p.id; a.job.phase = "deliver";
          const box = INBOX[a.job.to] || rel(a.job.to, 60, 60);
          goTo(a, { x: box.x + rnd(10, 70), y: box.y + 34 }, a.job.to);
        } else {
          p.carriedBy = null; a.carrying = null; p.pending = false;
          p.room = p.moves.shift() || a.job.to; p.x = a.x; p.y = a.y;
          effects.push({ kind: "ring", floor: a.floor, x: a.x, y: a.y, t: now, color: ROOM[p.room].color });
          if (p.room === "send" && p.launchPending) startLaunch(p);
          a.job = null;
          if (!a.jobs.length) { const h = HOME[a.key]; goTo(a, h, h.room); }
        }
      }
      if (!a.job && !a.path.length && !a.ride) {
        const h = HOME[a.key], atHome = dist(a, h) < 3 && a.floor === ROOM[h.room].floor;
        const st = a.srv.status;
        if (st === "working" || st === "paused" || a.jobs.length) { if (!atHome) goTo(a, h, h.room); }
        else if (now > a.wanderAt) {
          a.wanderAt = now + rnd(6, 14);
          const r = ROOM[h.room];
          if (atHome && Math.random() < 0.6) { goTo(a, { x: rnd(r.x + 70, r.x + r.w - 70), y: rnd(r.y + 80, r.y + r.h - 60) }, h.room); a.slow = true; }
          else if (!atHome) { goTo(a, h, h.room); a.slow = true; }
        }
      }
      // elevator rides
      if (a.ride) {
        a.moving = false;
        if (now - a.ride.t0 >= a.ride.dur) {
          a.floor = a.ride.to; a.ride = null; a.x = ELEV.inn.x; a.y = ELEV.inn.y; a.path.shift();
          effects.push({ kind: "ding", floor: a.floor, t: now });
        }
        continue;
      }
      a.moving = false;
      if (a.path.length) {
        const tgt = a.path[0];
        if (tgt.ride != null) {
          a.ride = { from: a.floor, to: tgt.ride, t0: now, dur: 0.9 + 0.7 * Math.abs(tgt.ride - a.floor) };
          effects.push({ kind: "ding", floor: a.floor, t: now });
          a.floor = null;
          continue;
        }
        const carried = a.carrying != null ? pkgs.get(a.carrying) : null;
        const behind = Math.max(0, carried ? carried.moves.length - 1 : 0);
        const speed = a.slow && !a.job ? 60 : (210 + a.jobs.length * 70) * (1 + 0.9 * behind);
        const dx = tgt.x - a.x, dy = tgt.y - a.y, d = Math.hypot(dx, dy);
        if (d < speed * dt + 0.5) { a.x = tgt.x; a.y = tgt.y; a.path.shift(); if (!a.path.length) a.slow = false; }
        else { a.x += (dx / d) * speed * dt; a.y += (dy / d) * speed * dt; }
        if (d > 0.5) { a.dir = Math.atan2(dy, dx); a.moving = true; a.walk += dt * speed / 16; }
      }
    }
    for (const p of pkgs.values()) {
      if (p.launching) continue;
      if (p.carriedBy && agents[p.carriedBy]) {
        const a = agents[p.carriedBy];
        p.x = a.x + Math.cos(a.dir) * 20; p.y = a.y + Math.sin(a.dir) * 20;
      } else if (p.tx != null) {
        p.x += (p.tx - p.x) * Math.min(1, dt * 6); p.y += (p.ty - p.y) * Math.min(1, dt * 6);
      }
    }
    for (let i = effects.length - 1; i >= 0; i--) if (now - effects[i].t > (effects[i].life || 1.2)) effects.splice(i, 1);
  }
  function startLaunch(p) {
    p.launchPending = false; p.launching = true;
    const c = rel("send", 130, 175);
    effects.push({ kind: "launch", floor: ROOM.send.floor, t: now, life: 3, x: c.x, y: c.y, p, sx: p.x, sy: p.y });
  }

  // ---------------- static floor plans ----------------
  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  function furn(c, x, y, w, h, r = 8, fill = P.furn) {
    c.save(); c.shadowColor = P.shadow; c.shadowBlur = 14; c.shadowOffsetY = 4;
    c.fillStyle = fill; rr(c, x, y, w, h, r); c.fill(); c.restore();
    c.strokeStyle = P.line; c.lineWidth = 1; rr(c, x + 0.5, y + 0.5, w - 1, h - 1, r); c.stroke();
  }
  function disc(c, x, y, r, fill = P.furn) {
    c.save(); c.shadowColor = P.shadow; c.shadowBlur = 12; c.shadowOffsetY = 3;
    c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore();
    c.strokeStyle = P.line; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  }
  function screenRect(c, x, y, w, h) { c.fillStyle = P.screen; rr(c, x, y, w, h, 4); c.fill(); }
  function chair(c, x, y) { disc(c, x, y, 13, P.room); c.fillStyle = P.line; c.beginPath(); c.arc(x, y, 8, 0, TAU); c.fill(); }
  function plant(c, x, y, r = 16) {
    disc(c, x, y, r, P.furn);
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; c.fillStyle = i % 2 ? "#34c759" : "#28a745"; c.beginPath(); c.ellipse(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.42, r * 0.22, a, 0, TAU); c.fill(); }
  }

  function buildLayers() {
    P = isDark() ? PAL.dark : PAL.light;
    const S = 1.5;
    layers = FLOORS.map((f, fi) => {
      const cv = document.createElement("canvas");
      cv.width = FW * S; cv.height = FH * S;
      const c = cv.getContext("2d");
      c.scale(S, S);
      c.fillStyle = P.slab; rr(c, 0, 0, FW, FH, 22); c.fill();
      // corridor
      c.fillStyle = P.corr; rr(c, 30, 334, ELEV.x - 30, 92, 10); c.fill();
      c.save(); c.setLineDash([2, 14]); c.lineCap = "round"; c.strokeStyle = P.flow; c.lineWidth = 3;
      c.beginPath(); c.moveTo(60, CY); c.lineTo(ELEV.x - 30, CY); c.stroke(); c.restore();
      c.font = "600 13px -apple-system, BlinkMacSystemFont, Inter, sans-serif"; c.fillStyle = P.text3;
      c.fillText(`EBENE ${f.lvl}  ·  ${f.name.toUpperCase()}`, 52, 414);
      // rooms
      for (const r of f.rooms) drawRoom(c, r);
      // elevator core
      furn(c, ELEV.x, ELEV.y, ELEV.w, ELEV.h, 16, P.room);
      c.fillStyle = P.line; rr(c, ELEV.x + 18, ELEV.y + 26, ELEV.w - 36, ELEV.h - 52, 10); c.fill();
      c.strokeStyle = P.wall; c.lineWidth = 2; c.beginPath(); c.moveTo(ELEV.x, CY - 30); c.lineTo(ELEV.x, CY + 30); c.stroke();
      c.font = "600 11px -apple-system, BlinkMacSystemFont, Inter, sans-serif"; c.fillStyle = P.text2; c.textAlign = "center";
      c.fillText("AUFZUG", ELEV.x + ELEV.w / 2, ELEV.y + 18); c.textAlign = "left";
      return cv;
    });
  }

  function drawRoom(c, r) {
    c.save(); c.shadowColor = P.shadow; c.shadowBlur = 18; c.shadowOffsetY = 4;
    c.fillStyle = P.room; rr(c, r.x, r.y, r.w, r.h, 16); c.fill(); c.restore();
    c.fillStyle = hexA(r.color, 0.045); rr(c, r.x, r.y, r.w, r.h, 16); c.fill();
    c.strokeStyle = P.wall; c.lineWidth = 3; rr(c, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 15); c.stroke();
    // doorway
    c.fillStyle = P.room; c.fillRect(r.door.x - 34, r.top ? r.y + r.h - 4 : r.y - 1, 68, 6);
    c.fillStyle = hexA(r.color, 0.5); c.fillRect(r.door.x - 36, r.top ? r.y + r.h - 4 : r.y - 1, 3, 6); c.fillRect(r.door.x + 33, r.top ? r.y + r.h - 4 : r.y - 1, 3, 6);
    // label
    c.fillStyle = r.color; c.beginPath(); c.arc(r.x + 24, r.y + 27, 4, 0, TAU); c.fill();
    c.font = "600 15px -apple-system, BlinkMacSystemFont, Inter, sans-serif"; c.fillStyle = P.text; c.fillText(r.name, r.x + 36, r.y + 32);
    c.font = "500 11.5px -apple-system, BlinkMacSystemFont, Inter, sans-serif"; c.fillStyle = P.text2; c.fillText(r.sub, r.x + 36, r.y + 49);
    c.save(); c.translate(r.x, r.y); FURN[r.key]?.(c, r); c.restore();
  }

  const FURN = {
    radar(c) {
      disc(c, 130, 165, 98, P.screen);
      c.strokeStyle = "rgba(10,132,255,.35)"; c.lineWidth = 1.2;
      for (const k of [32, 64, 94]) { c.beginPath(); c.arc(130, 165, k, 0, TAU); c.stroke(); }
      c.beginPath(); c.moveTo(36, 165); c.lineTo(224, 165); c.moveTo(130, 71); c.lineTo(130, 259); c.stroke();
      furn(c, 362, 40, 200, 92, 10, P.furn);
      furn(c, 400, 182, 120, 40); screenRect(c, 430, 190, 60, 8); chair(c, 455, 248);
      plant(c, 555, 268);
    },
    leit(c) {
      screenRect(c, 40, 66, 510, 62);
      disc(c, 295, 205, 62, P.furn); disc(c, 295, 205, 36, P.room);
      chair(c, 400, 205); chair(c, 190, 205); chair(c, 295, 130 + 6);
      plant(c, 556, 268);
    },
    send(c) {
      disc(c, 130, 175, 70, P.furn); c.fillStyle = P.screen; c.beginPath(); c.arc(130, 175, 52, 0, TAU); c.fill();
      c.strokeStyle = "rgba(191,90,242,.55)"; c.lineWidth = 2; c.setLineDash([6, 6]); c.beginPath(); c.arc(130, 175, 60, 0, TAU); c.stroke(); c.setLineDash([]);
      c.font = "600 10.5px -apple-system, Inter, sans-serif"; c.fillStyle = P.text2; c.textAlign = "center"; c.fillText("UPLINK", 130, 270); c.textAlign = "left";
      [["YouTube", "#ff3b30"], ["TikTok", "#25c2d6"], ["Instagram", "#e1306c"]].forEach(([t, col], i) => {
        const x = 300 + i * 92;
        furn(c, x, 118, 80, 46, 10); c.fillStyle = col; c.beginPath(); c.arc(x + 16, 141, 5, 0, TAU); c.fill();
        c.font = "600 11px -apple-system, Inter, sans-serif"; c.fillStyle = P.text; c.fillText(t, x + 26, 145);
      });
      furn(c, 328, 248, 236, 28, 8, P.furn);
      c.font = "500 10.5px -apple-system, Inter, sans-serif"; c.fillStyle = P.text2; c.fillText("Veröffentlicht", 330, 292);
    },
    approve(c) {
      furn(c, 170, 118, 260, 96, 18, P.furn);
      c.font = "600 11px -apple-system, Inter, sans-serif"; c.fillStyle = P.text2; c.textAlign = "center"; c.fillText("PRÜFTISCH", 300, 236); c.textAlign = "left";
      chair(c, 300, 92); plant(c, 40, 268); plant(c, 556, 268);
    },
    script(c) {
      for (let i = 0; i < 4; i++) {
        furn(c, 22, 70 + i * 54, 40, 46, 6);
        for (let j = 0; j < 4; j++) { c.fillStyle = ["#ff9f0a", "#0a84ff", "#30d158", "#ff375f"][(i + j) % 4]; c.globalAlpha = 0.6; c.fillRect(28 + j * 8, 76 + i * 54, 6, 34); c.globalAlpha = 1; }
      }
      furn(c, 260, 128, 150, 46); screenRect(c, 305, 136, 60, 8);
      c.fillStyle = P.room; c.save(); c.translate(276, 150); c.rotate(-0.2); c.fillRect(0, 0, 16, 20); c.restore();
      chair(c, 330, 212);
      furn(c, 440, 70, 110, 44); furn(c, 110, 70, 100, 44); plant(c, 556, 268);
    },
    audio(c) {
      c.fillStyle = hexA("#64d2ff", 0.1); rr(c, 40, 62, 190, 180, 14); c.fill();
      c.strokeStyle = hexA("#64d2ff", 0.55); c.lineWidth = 3; rr(c, 40, 62, 190, 180, 14); c.stroke();
      c.fillStyle = P.room; c.fillRect(110, 239, 50, 6);
      c.fillStyle = P.text3; c.beginPath(); c.arc(135, 135, 7, 0, TAU); c.fill();
      c.strokeStyle = P.text3; c.lineWidth = 2; c.beginPath(); c.moveTo(135, 135); c.lineTo(170, 100); c.stroke();
      furn(c, 320, 88, 200, 70, 10); screenRect(c, 332, 98, 176, 50);
      furn(c, 300, 40, 240, 18, 6, P.furn);
    },
    archive(c) {
      for (let row = 0; row < 3; row++) {
        const y = 110 + row * 58;
        furn(c, 40, y, 270, 34, 8);
        for (let i = 0; i < 10; i++) { c.fillStyle = P.line; c.beginPath(); c.arc(56 + i * 26, y + 17, 9, 0, TAU); c.fill(); c.fillStyle = hexA("#30b45a", 0.45); c.beginPath(); c.arc(56 + i * 26, y + 17, 3, 0, TAU); c.fill(); }
      }
      furn(c, 385, 160, 120, 42); screenRect(c, 415, 168, 60, 8); chair(c, 445, 232); plant(c, 556, 268);
    },
    lounge(c) {
      furn(c, 60, 90, 200, 56, 22); furn(c, 60, 90, 200, 18, 9, P.furn);
      disc(c, 160, 196, 34); plant(c, 300, 110, 20); plant(c, 540, 260, 20);
      furn(c, 420, 60, 120, 44, 10); c.fillStyle = P.screen; rr(c, 432, 70, 28, 24, 5); c.fill();
      c.font = "500 10.5px -apple-system, Inter, sans-serif"; c.fillStyle = P.text2; c.fillText("Kaffee", 470, 87);
      disc(c, 420, 210, 28); chair(c, 382, 210); chair(c, 458, 210);
    },
    cut(c) {
      furn(c, 180, 104, 230, 46); screenRect(c, 192, 112, 60, 8); screenRect(c, 265, 108, 60, 8); screenRect(c, 338, 112, 60, 8);
      chair(c, 295, 190); furn(c, 460, 70, 90, 140, 10); plant(c, 556, 268);
    },
    farm(c) {
      for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) furn(c, 40 + i * 88, 80 + row * 100, 72, 72, 8, P.furn);
    },
    server(c) {
      for (let i = 0; i < 5; i++) furn(c, 50 + i * 100, 96, 70, 150, 8, P.furn);
      c.strokeStyle = hexA("#0a84ff", 0.3); c.lineWidth = 3; c.beginPath(); c.moveTo(40, 270); c.lineTo(550, 270); c.stroke();
    },
    power(c) {
      for (let i = 0; i < 3; i++) { disc(c, 110 + i * 170, 150, 54); c.fillStyle = P.line; c.beginPath(); c.arc(110 + i * 170, 150, 40, 0, TAU); c.fill(); }
      furn(c, 60, 240, 470, 30, 8);
    },
  };

  // ---------------- dynamic drawing (per floor, in floor-local coords) ----------------
  const working = (k) => opts.getAgents()[k]?.status === "working";

  function drawFloorDynamic(c, fi) {
    const ag = opts.getAgents(), stats = opts.getStats() || {};
    // corridor flow lights
    for (let i = 0; i < 14; i++) {
      const x = 60 + ((i * 90 + now * 70) % (ELEV.x - 100));
      c.fillStyle = P.flow; c.beginPath(); c.arc(x, CY, 3, 0, TAU); c.fill();
    }
    // elevator indicator
    const riders = Object.values(agents).filter((a) => a.ride && (a.ride.from === fi || a.ride.to === fi));
    c.fillStyle = riders.length ? "#0a84ff" : P.text3;
    c.beginPath(); c.arc(ELEV.x + ELEV.w / 2, ELEV.y + ELEV.h - 14, 4 + (riders.length ? Math.sin(now * 8) : 0), 0, TAU); c.fill();

    for (const r of FLOORS[fi].rooms) {
      c.save(); c.translate(r.x, r.y);
      ROOM_ANIM[r.key]?.(c, r, ag, stats);
      c.restore();
      // room status (rooms with a resident agent)
      const owner = Object.keys(HOME).find((k) => HOME[k].room === r.key);
      const special = r.key === "farm" ? "editor" : null;
      const key = owner || special;
      if (!key) continue;
      const s = ag[key]?.status || "idle";
      const label = { working: "Aktiv", idle: "Bereit", paused: "Pausiert", error: "Fehler", waiting: "Wartet" }[s] || s;
      const col = { working: "#0a84ff", idle: "#34c759", paused: "#8e8e93", error: "#ff3b30", waiting: "#5e5ce6" }[s] || "#8e8e93";
      if (s === "error") { c.fillStyle = `rgba(255,59,48,${0.05 + 0.04 * Math.sin(now * 5)})`; rr(c, r.x, r.y, r.w, r.h, 16); c.fill(); }
      if (s === "paused" && owner) { c.fillStyle = hexA(isDark() ? "#000000" : "#ffffff", 0.45); rr(c, r.x, r.y, r.w, r.h, 16); c.fill(); }
      c.font = "600 11px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
      const w = c.measureText(label).width + 26, x = r.x + r.w - w - 16, y = r.y + 16;
      c.fillStyle = hexA(col, 0.12); rr(c, x, y, w, 22, 11); c.fill();
      c.fillStyle = col; c.beginPath(); c.arc(x + 11, y + 11, 3.5, 0, TAU); c.fill();
      c.fillText(label, x + 19, y + 15);
    }
  }

  const ROOM_ANIM = {
    radar(c, r, ag, stats) {
      const sp = working("trend_scout") ? 3.2 : 0.7, a = now * sp;
      if (c.createConicGradient) {
        const g = c.createConicGradient(a, 130, 165);
        g.addColorStop(0, "rgba(10,132,255,.55)"); g.addColorStop(0.1, "rgba(10,132,255,0)"); g.addColorStop(1, "rgba(10,132,255,0)");
        c.fillStyle = g; c.beginPath(); c.arc(130, 165, 94, 0, TAU); c.fill();
      }
      for (let i = 0; i < 6; i++) {
        const bl = (i * 1.9 + 0.4) % TAU, bd = 24 + ((i * 29) % 64), fade = ((a - bl) % TAU + TAU) % TAU;
        c.fillStyle = `rgba(100,190,255,${Math.max(0, 1 - fade / 2.4)})`; c.beginPath(); c.arc(130 + Math.cos(bl) * bd, 165 + Math.sin(bl) * bd, 3, 0, TAU); c.fill();
      }
      const n = Math.min(stats.ideas || 0, 12), cols = ["#ffd60a", "#ffb340", "#7ee081", "#7cc7ff", "#ff9fd0"];
      for (let i = 0; i < n; i++) {
        c.save(); c.translate(376 + (i % 6) * 30, 52 + Math.floor(i / 6) * 36); c.rotate(((i * 7) % 5 - 2) * 0.04);
        c.fillStyle = cols[i % 5]; c.shadowColor = "rgba(0,0,0,.15)"; c.shadowBlur = 3; c.shadowOffsetY = 1; rr(c, 0, 0, 24, 24, 3); c.fill(); c.restore();
      }
      if (!n) { c.font = "500 11px -apple-system, Inter, sans-serif"; c.fillStyle = P.text3; c.fillText("Keine Ideen", 425, 90); }
    },
    leit(c, r, ag, stats) {
      const slot = ag.producer?.next_slot ? new Date(ag.producer.next_slot).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "Autopilot aus";
      c.font = "600 12px ui-monospace, SF Mono, Menlo, monospace"; c.fillStyle = P.screenText;
      c.fillText(`NÄCHSTE PRODUKTION  ${slot}`, 56, 92);
      c.fillStyle = "#8e8e93"; c.fillText(`IN ARBEIT ${stats.in_production ?? 0}   ·   FREIGABE ${stats.awaiting_approval ?? 0}   ·   ONLINE ${stats.published ?? 0}`, 56, 114);
      c.fillStyle = Math.sin(now * 3) > 0 ? "#30d158" : "#1c5c2c"; c.beginPath(); c.arc(532, 82, 4, 0, TAU); c.fill();
      c.save(); c.globalAlpha = 0.35 + 0.2 * Math.sin(now * 2); c.strokeStyle = "#5e5ce6"; c.lineWidth = 2;
      c.beginPath(); c.arc(295, 205, 18 + 6 * Math.sin(now * 1.6), 0, TAU); c.stroke(); c.restore();
    },
    script() {
      if (!working("script_writer")) return;
      for (let i = 0; i < 6; i++) {
        const ph = (now * 0.6 + i / 6) % 1;
        c_text(`${"KIagent"[(i + Math.floor(now * 3)) % 7]}`, 300 + i * 9, 122 - ph * 46, `rgba(245,167,0,${1 - ph})`);
      }
    },
    audio(c) {
      const on = working("voice");
      for (let i = 0; i < 14; i++) {
        const lvl = on ? 0.25 + 0.75 * Math.abs(Math.sin(now * (5 + i * 0.7) + i)) : 0.12;
        c.fillStyle = lvl > 0.82 ? "#ff375f" : "#30d158"; rr(c, 340 + i * 12, 142 - lvl * 40, 7, lvl * 40, 2); c.fill();
      }
      c.fillStyle = on ? (Math.sin(now * 6) > -0.3 ? "#ff3b30" : "#8a1f1a") : P.line; rr(c, 330, 186, 84, 26, 13); c.fill();
      c.font = "700 11.5px -apple-system, Inter, sans-serif"; c.fillStyle = on ? "#fff" : P.text3; c.fillText("ON AIR", 349, 203);
      if (on) {
        c.strokeStyle = "rgba(255,55,95,.6)"; c.lineWidth = 2;
        for (let k = 0; k < 3; k++) { const ph = (now * 1.2 + k / 3) % 1; c.globalAlpha = 1 - ph; c.beginPath(); c.arc(135, 135, 12 + ph * 42, -1.3, 0.3); c.stroke(); }
        c.globalAlpha = 1;
      }
    },
    archive(c) {
      if (!working("visuals")) return;
      const row = Math.floor(now * 1.4) % 3, x = 50 + ((now * 160) % 250);
      c.fillStyle = "rgba(48,180,90,.3)"; rr(c, x - 8, 106 + row * 58, 16, 42, 4); c.fill();
    },
    cut(c, r, ag) {
      const on = ag.editor?.status === "working";
      [[192, 112], [265, 108], [338, 112]].forEach(([x, y], i) => { c.fillStyle = on ? hexA(["#ff6a2b", "#0a84ff", "#ffcc00"][i], 0.75 + 0.2 * Math.sin(now * 4 + i)) : "#3a3a3c"; rr(c, x + 2, y + 1, 56, 6, 2); c.fill(); });
      if (on && ag.editor.progress != null) {
        c.fillStyle = P.line; rr(c, 180, 236, 230, 8, 4); c.fill();
        c.fillStyle = "#ff6a2b"; rr(c, 180, 236, 230 * ag.editor.progress / 100, 8, 4); c.fill();
        c.font = "600 11px -apple-system, Inter, sans-serif"; c.fillStyle = P.text2; c.fillText(`Rendering ${Math.round(ag.editor.progress)} %`, 180, 262);
      }
    },
    farm(c) {
      const on = working("editor");
      for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
        const lit = on ? Math.sin(now * (7 + j) + i * 2 + row * 3 + j) > 0.1 : (i + j + row + Math.floor(now / 2)) % 9 === 0;
        c.fillStyle = lit ? (on ? "#0a84ff" : "#34c759") : P.line;
        c.beginPath(); c.arc(54 + i * 88 + j * 14, 116 + row * 100, 3, 0, TAU); c.fill();
      }
      if (on) { c.font = "600 11px -apple-system, Inter, sans-serif"; c.fillStyle = "#0a84ff"; c.fillText("12 Kerne aktiv", 40, 270); }
    },
    server(c) {
      for (let i = 0; i < 5; i++) for (let j = 0; j < 8; j++) {
        const lit = Math.sin(now * 3 + i * 1.3 + j * 0.9) > 0.55;
        c.fillStyle = lit ? "#34c759" : P.line; c.fillRect(62 + i * 100, 108 + j * 16, 8, 4);
        c.fillStyle = lit && j % 3 === 0 ? "#0a84ff" : P.line; c.fillRect(74 + i * 100, 108 + j * 16, 8, 4);
      }
    },
    power(c) {
      const sp = Object.values(opts.getAgents()).some((a) => a.status === "working") ? 6 : 1.5;
      for (let i = 0; i < 3; i++) {
        const cx = 110 + i * 170;
        c.save(); c.translate(cx, 150); c.rotate(now * sp + i);
        c.fillStyle = P.text3; for (let k = 0; k < 4; k++) { c.rotate(TAU / 4); c.beginPath(); c.ellipse(16, 0, 18, 7, 0, 0, TAU); c.fill(); }
        c.restore();
      }
    },
    approve(c, r) {
      const waiting = [...pkgs.values()].filter((p) => p.room === "approve" && p.status === "awaiting_approval" && !p.carriedBy).length;
      if (!waiting) return;
      c.save(); c.strokeStyle = `rgba(255,149,0,${0.45 + 0.4 * Math.sin(now * 4)})`; c.lineWidth = 4; rr(c, 4, 4, r.w - 8, r.h - 8, 14); c.stroke(); c.restore();
      const t = waiting === 1 ? "1 Video wartet · Klicken zum Prüfen" : `${waiting} Videos warten · Klicken zum Prüfen`;
      c.font = "600 12.5px -apple-system, Inter, sans-serif";
      const w = c.measureText(t).width + 24;
      c.fillStyle = "#ff9500"; rr(c, 300 - w / 2, 262, w, 26, 13); c.fill();
      c.fillStyle = "#fff"; c.textAlign = "center"; c.fillText(t, 300, 279); c.textAlign = "left";
    },
    send(c) {
      const on = working("publisher");
      const g = c.createRadialGradient(130, 175, 4, 130, 175, 52);
      g.addColorStop(0, on ? "rgba(191,90,242,.75)" : "rgba(191,90,242,.18)"); g.addColorStop(1, "rgba(191,90,242,0)");
      c.fillStyle = g; c.beginPath(); c.arc(130, 175, 52, 0, TAU); c.fill();
    },
  };
  let c_ctx = null;
  function c_text(t, x, y, col) { c_ctx.font = "700 12px -apple-system, Inter, sans-serif"; c_ctx.fillStyle = col; c_ctx.fillText(t, x, y); }

  // ---------------- billboards: agents, packages, bubbles (world coords) ----------------
  function agentWorld(a) {
    if (a.ride) {
      const k = ease(Math.min(1, (now - a.ride.t0) / a.ride.dur));
      if (view === "all") {
        const p0 = project(a.ride.from, ELEV.inn), p1 = project(a.ride.to, ELEV.inn);
        return { x: p0.x + (p1.x - p0.x) * k, y: p0.y + (p1.y - p0.y) * k, riding: true };
      }
      return null;
    }
    if (!visibleFloor(a.floor)) return null;
    const p = project(a.floor, a);
    return { x: p.x, y: p.y };
  }
  function drawAvatar(c, a, w, scale) {
    const col = AGENT_COLOR[a.key], s = a.srv.status;
    const busy = s === "working" && !a.moving && !a.job;
    c.save(); c.translate(w.x, w.y); c.scale(scale, scale);
    if (s === "paused") c.globalAlpha = 0.5;
    if (busy) { c.fillStyle = hexA(col, 0.16 + 0.08 * Math.sin(now * 4)); c.beginPath(); c.arc(0, 0, 28 + 2 * Math.sin(now * 4), 0, TAU); c.fill(); }
    if (a.moving) { // heading cone like a maps location puck
      const g = c.createRadialGradient(0, 0, 4, 0, 0, 40);
      g.addColorStop(0, hexA(col, 0.35)); g.addColorStop(1, hexA(col, 0));
      c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 40, a.dir - 0.55, a.dir + 0.55); c.closePath(); c.fill();
    }
    const bob = a.moving ? Math.abs(Math.sin(a.walk)) * -3 : 0;
    c.fillStyle = "rgba(0,0,0,.18)"; c.beginPath(); c.ellipse(0, 15, 12, 4, 0, 0, TAU); c.fill();
    c.translate(0, bob);
    c.shadowColor = "rgba(0,0,0,.25)"; c.shadowBlur = 8; c.shadowOffsetY = 2;
    c.fillStyle = P.avatar; c.beginPath(); c.arc(0, 0, 15, 0, TAU); c.fill();
    c.shadowColor = "transparent";
    c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 15, 0, TAU); c.stroke();
    if (selectedAgent === a.key) { c.strokeStyle = hexA(col, 0.6); c.lineWidth = 2; c.setLineDash([3, 4]); c.beginPath(); c.arc(0, 0, 21, now, now + TAU); c.stroke(); c.setLineDash([]); }
    c.save(); c.translate(-9, -9); c.scale(0.75, 0.75); c.strokeStyle = col; c.lineWidth = 2.2; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(path(a.key)); c.restore();
    if (s === "error") { c.fillStyle = "#ff3b30"; c.beginPath(); c.arc(11, -11, 6, 0, TAU); c.fill(); c.fillStyle = "#fff"; c.font = "700 9px sans-serif"; c.textAlign = "center"; c.fillText("!", 11, -8); c.textAlign = "left"; }
    c.restore();
  }
  function drawPkg(c, p, w, scale) {
    const col = p.status === "failed" || p.status === "publish_failed" ? "#ff3b30" : p.status === "awaiting_approval" ? "#ff9500"
      : p.status === "published" || p.status === "ready" ? "#34c759" : p.status === "rejected" ? "#8e8e93" : "#0a84ff";
    const sz = (p.small ? 13 : 18) * scale;
    c.save(); c.translate(w.x, w.y);
    if (p.status === "awaiting_approval" && !p.carriedBy) { c.fillStyle = `rgba(255,149,0,${0.18 + 0.12 * Math.sin(now * 5)})`; c.beginPath(); c.arc(0, 0, sz * 1.05, 0, TAU); c.fill(); }
    c.shadowColor = "rgba(0,0,0,.22)"; c.shadowBlur = 6 * scale; c.shadowOffsetY = 2 * scale;
    c.fillStyle = P.avatar; rr(c, -sz / 2, -sz / 2, sz, sz, 4 * scale); c.fill();
    c.shadowColor = "transparent";
    c.strokeStyle = col; c.lineWidth = 2 * scale; rr(c, -sz / 2, -sz / 2, sz, sz, 4 * scale); c.stroke();
    c.fillStyle = col; c.beginPath(); c.moveTo(-sz * 0.15, -sz * 0.22); c.lineTo(sz * 0.25, 0); c.lineTo(-sz * 0.15, sz * 0.22); c.closePath(); c.fill();
    if (cam.z * scale > 0.6 && !p.small) { c.font = `600 ${9.5 * scale}px -apple-system, Inter, sans-serif`; c.fillStyle = P.text2; c.textAlign = "center"; c.fillText(`#${p.id}`, 0, sz * 0.5 + 11 * scale); c.textAlign = "left"; }
    c.restore();
  }
  function drawBubble(c, a, w, scale) {
    const s = a.srv.status;
    let text = null, col = P.text;
    if (a.ride) text = `Aufzug → Ebene ${FLOORS[a.ride.to].lvl}`;
    else if (a.job) text = a.job.phase === "pickup" ? "Holt Video …" : `Bringt #${a.job.pkg} → ${ROOM[a.job.to].name}`;
    else if (s === "working") text = a.srv.task;
    else if (s === "error") { text = a.srv.task || "Fehler"; col = "#ff3b30"; }
    else if (s === "paused") text = "Pausiert";
    if (!text || cam.z * scale < 0.38) return;
    text = text.length > 40 ? text.slice(0, 39) + "…" : text;
    const fs = 11.5 * scale;
    c.font = `500 ${fs}px -apple-system, BlinkMacSystemFont, Inter, sans-serif`;
    const tw = c.measureText(text).width, bw = tw + 22 * scale, bh = 24 * scale, x = w.x - bw / 2, y = w.y - 52 * scale;
    c.save(); c.shadowColor = "rgba(0,0,0,.16)"; c.shadowBlur = 10 * scale; c.shadowOffsetY = 2 * scale;
    c.fillStyle = P.glass; rr(c, x, y, bw, bh, bh / 2); c.fill(); c.restore();
    c.strokeStyle = P.glassLine; c.lineWidth = 1; rr(c, x, y, bw, bh, bh / 2); c.stroke();
    c.fillStyle = AGENT_COLOR[a.key]; c.beginPath(); c.arc(x + 10 * scale, y + bh / 2, 3 * scale, 0, TAU); c.fill();
    c.fillStyle = col; c.fillText(text, x + 17 * scale, y + bh / 2 + fs * 0.35);
    if (s === "working" && !a.job && !a.ride && a.srv.progress != null) {
      c.fillStyle = P.line; rr(c, x + 12 * scale, y + bh - 4 * scale, bw - 24 * scale, 2 * scale, 1); c.fill();
      c.fillStyle = AGENT_COLOR[a.key]; rr(c, x + 12 * scale, y + bh - 4 * scale, (bw - 24 * scale) * a.srv.progress / 100, 2 * scale, 1); c.fill();
    }
  }
  function drawEffect(c, e) {
    const k = (now - e.t) / (e.life || 1.2);
    if (e.floor != null && !visibleFloor(e.floor)) return;
    const sc = view === "all" ? 0.75 : 1;
    if (e.kind === "ring") {
      const w = project(e.floor, e);
      c.strokeStyle = hexA(e.color, 1 - k); c.lineWidth = 2.5; c.beginPath(); c.ellipse(w.x, w.y, (12 + k * 36) * sc, (12 + k * 36) * sc * (view === "all" ? STACK.d * 1.6 : 1), 0, 0, TAU); c.stroke();
    } else if (e.kind === "ding") {
      const w = project(e.floor, { x: ELEV.x + ELEV.w / 2, y: ELEV.y + 10 });
      c.globalAlpha = 1 - k; c.fillStyle = "#0a84ff"; c.font = "600 12px -apple-system, Inter, sans-serif"; c.textAlign = "center";
      c.fillText("●", w.x, w.y - k * 14); c.textAlign = "left"; c.globalAlpha = 1;
    } else if (e.kind === "launch") {
      const p = e.p, w = project(e.floor, e);
      if (k < 0.3) { const q = k / 0.3; const s = project(e.floor, { x: e.sx + (e.x - e.sx) * q, y: e.sy + (e.y - e.sy) * q }); drawPkg(c, p, s, sc); }
      else {
        const q = (k - 0.3) / 0.7, top = view === "all" ? -300 : w.y - 400;
        const g = c.createLinearGradient(0, top, 0, w.y);
        g.addColorStop(0, "rgba(191,90,242,0)"); g.addColorStop(1, `rgba(191,90,242,${0.55 * (1 - q)})`);
        c.fillStyle = g; c.fillRect(w.x - 16 * sc, top, 32 * sc, w.y - top);
        c.fillStyle = `rgba(255,255,255,${0.85 * (1 - q)})`; c.fillRect(w.x - 3 * sc, top, 6 * sc, w.y - top);
        const ty = w.y - (q * (w.y - top));
        drawPkg(c, { ...p, status: "published", small: false }, { x: w.x, y: ty }, sc);
        c.globalAlpha = 1 - q; c.font = "700 15px -apple-system, Inter, sans-serif"; c.fillStyle = "#34c759"; c.fillText("Online", w.x + 26, w.y - 30 - q * 20); c.globalAlpha = 1;
      }
      if (k >= 0.99) { p.launching = false; p.launched = true; }
    }
  }

  // ---------------- frame ----------------
  function drawStackChrome(c) {
    const S = STACK;
    // elevator shaft (behind floors)
    for (let fi = 0; fi < FLOORS.length - 1; fi++) {
      const a = project(fi, { x: ELEV.x + ELEV.w / 2, y: CY }), b = project(fi + 1, { x: ELEV.x + ELEV.w / 2, y: CY });
      c.fillStyle = isDark() ? "rgba(10,132,255,.08)" : "rgba(0,111,255,.07)";
      c.fillRect(a.x - 26, a.y, 52, b.y - a.y);
      c.strokeStyle = isDark() ? "rgba(10,132,255,.35)" : "rgba(0,111,255,.3)"; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(a.x - 26, a.y); c.lineTo(b.x - 26, b.y); c.moveTo(a.x + 26, a.y); c.lineTo(b.x + 26, b.y); c.stroke();
    }
    // surface line above the top floor
    c.strokeStyle = P.text3; c.setLineDash([4, 8]); c.lineWidth = 1;
    c.beginPath(); c.moveTo(-200, -26); c.lineTo(FW + FH * S.c + 20, -26); c.stroke(); c.setLineDash([]);
    c.font = "600 12px -apple-system, Inter, sans-serif"; c.fillStyle = P.text3; c.fillText("OBERFLÄCHE", -200, -34);
  }
  function drawSlab(c, fi) {
    const S = STACK, th = 16;
    const A = project(fi, { x: 0, y: FH }), B = project(fi, { x: FW, y: FH }), C = project(fi, { x: FW, y: 0 });
    c.fillStyle = P.side; c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.lineTo(B.x, B.y + th); c.lineTo(A.x, A.y + th); c.closePath(); c.fill();
    c.fillStyle = P.side2; c.beginPath(); c.moveTo(B.x, B.y); c.lineTo(C.x, C.y); c.lineTo(C.x, C.y + th); c.lineTo(B.x, B.y + th); c.closePath(); c.fill();
    c.save(); c.shadowColor = "rgba(0,0,0,.18)"; c.shadowBlur = 40; c.shadowOffsetY = 26;
    c.fillStyle = "rgba(0,0,0,0.001)"; c.beginPath(); c.moveTo(A.x, A.y + th); c.lineTo(B.x, B.y + th); c.lineTo(B.x - 20, B.y + th); c.fill(); c.restore();
    // floor label
    const L = project(fi, { x: 0, y: FH / 2 });
    c.textAlign = "right";
    c.font = "700 30px -apple-system, BlinkMacSystemFont, Inter, sans-serif"; c.fillStyle = P.text; c.fillText(FLOORS[fi].lvl, L.x - 26, L.y + 4);
    c.font = "500 14px -apple-system, Inter, sans-serif"; c.fillStyle = P.text2; c.fillText(FLOORS[fi].name, L.x - 26, L.y + 24);
    c.textAlign = "left";
  }

  function frame() {
    if (!running) return;
    const tn = performance.now(), dt = Math.min(0.05, (tn - t0) / 1000);
    t0 = tn; now += dt;
    step(dt);
    const dpr = window.devicePixelRatio || 1, cw = canvas.width / dpr, ch = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = P.ground; ctx.fillRect(0, 0, cw, ch);
    ctx.translate(cw / 2, ch / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    c_ctx = ctx;
    const order = view === "all" ? [0, 1, 2] : [view];
    if (view === "all") drawStackChrome(ctx);
    for (const fi of order) {
      if (view === "all") drawSlab(ctx, fi);
      ctx.save();
      const m = floorMatrix(fi);
      ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      ctx.drawImage(layers[fi], 0, 0, FW, FH);
      drawFloorDynamic(ctx, fi);
      ctx.restore();
    }
    // billboards
    const stack = view === "all";
    const sc = stack ? Math.max(0.9, 0.78 / cam.z) : 1;            // avatars keep a readable screen size
    const pkgSc = stack ? Math.max(0.8, 0.62 / cam.z) : 1;
    const bubSc = stack ? Math.max(0.9, 10.5 / (11.5 * cam.z)) : 1;
    const items = [];
    for (const p of pkgs.values()) {
      if (p.vis === false || p.launching || p.carriedBy) continue;
      const fi = pkgFloor(p);
      if (!visibleFloor(fi)) continue;
      items.push({ y: project(fi, p).y, draw: () => drawPkg(ctx, p, project(fi, p), pkgSc) });
    }
    for (const a of Object.values(agents)) {
      const w = agentWorld(a);
      if (!w) continue;
      a._w = w;
      items.push({ y: w.y, draw: () => {
        drawAvatar(ctx, a, w, sc);
        if (a.carrying != null) { const p = pkgs.get(a.carrying); if (p) drawPkg(ctx, p, { x: w.x + Math.cos(a.dir) * 18 * sc, y: w.y + Math.sin(a.dir) * 18 * sc * (view === "all" ? 0.5 : 1) - 6 * sc }, sc * 0.85); }
      } });
    }
    for (const a of Object.values(agents)) if (!a._w || !agentWorld(a)) a._w = null;
    items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());
    for (const e of effects) drawEffect(ctx, e);
    for (const a of Object.values(agents)) if (a._w && (!stack || a.job || a.ride || ["working", "error"].includes(a.srv.status) || a.key === selectedAgent)) drawBubble(ctx, a, a._w, bubSc);
    updateFloorButtons();
    if (selectedAgent) renderInfo();
    requestAnimationFrame(frame);
  }

  // ---------------- camera & input ----------------
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
    computeFit();
    if (!userMoved) fit();
  }
  function computeFit() {
    const r = canvas.parentElement.getBoundingClientRect(), b = worldBounds();
    const topPad = 64, pad = 24, botPad = 50;
    fitZ = Math.min((r.width - pad * 2) / (b.x1 - b.x0), (r.height - topPad - botPad) / (b.y1 - b.y0));
    return { b, topPad, pad, r };
  }
  function fit() {
    const { b, topPad, r } = computeFit();
    cam.z = fitZ;
    cam.x = (b.x0 + b.x1) / 2;
    cam.y = (b.y0 + b.y1) / 2 - (64 - 50) / 2 / cam.z;
    userMoved = false;
  }
  function setView(v) {
    view = v;
    userMoved = false;
    fit();
    try { localStorage.setItem("lugger.bunker.view", String(v)); } catch (e) { /* storage optional */ }
  }
  function toWorld(px, py) {
    const r = canvas.getBoundingClientRect();
    return { x: (px - r.left - r.width / 2) / cam.z + cam.x, y: (py - r.top - r.height / 2) / cam.z + cam.y };
  }
  function hit(wp) {
    for (const a of Object.values(agents)) if (a._w && Math.hypot(a._w.x - wp.x, a._w.y - wp.y) < 18 * (view === "all" ? Math.max(0.9, 0.78 / cam.z) : 1)) return { type: "agent", a };
    for (const p of pkgs.values()) {
      if (p.vis === false || p.carriedBy || p.launching) continue;
      const fi = pkgFloor(p); if (!visibleFloor(fi)) continue;
      const w = project(fi, p); if (Math.hypot(w.x - wp.x, w.y - wp.y) < 13) return { type: "pkg", p };
    }
    const order = view === "all" ? [2, 1, 0] : [view];
    for (const fi of order) {
      const local = floorMatrix(fi).inverse().transformPoint(new DOMPoint(wp.x, wp.y));
      if (local.x < 0 || local.x > FW || local.y < 0 || local.y > FH) continue;
      return { type: "floor", fi, room: roomAt(fi, local) };
    }
    return null;
  }
  function bindInput() {
    let drag = null, moved = false;
    canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y }; moved = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; userMoved = true; }
        cam.x = drag.cx - dx / cam.z; cam.y = drag.cy - dy / cam.z;
      }
      const h = hit(toWorld(e.clientX, e.clientY));
      canvas.style.cursor = drag && moved ? "grabbing" : h && (h.type !== "floor" || view === "all" || h.room?.key === "approve") ? "pointer" : "grab";
      if (h?.type === "pkg") showTip(e, `#${h.p.id} · ${h.p.title}`);
      else if (h?.type === "agent") showTip(e, `${h.a.srv.name || h.a.key} · ${h.a.srv.task || ""}`);
      else if (h?.type === "floor") showTip(e, h.room ? `${h.room.name} · Ebene ${FLOORS[h.fi].lvl}` : `Ebene ${FLOORS[h.fi].lvl} · ${FLOORS[h.fi].name}`);
      else tip.hidden = true;
    });
    canvas.addEventListener("pointerup", (e) => {
      if (drag && !moved) {
        const h = hit(toWorld(e.clientX, e.clientY));
        if (h?.type === "pkg") opts.openVideo(h.p.id);
        else if (h?.type === "agent") { selectedAgent = h.a.key; lastInfo = ""; renderInfo(); }
        else if (h?.type === "floor" && h.room?.key === "approve" && [...pkgs.values()].some((p) => p.status === "awaiting_approval")) {
          opts.openVideo([...pkgs.values()].find((p) => p.status === "awaiting_approval").id);
        } else if (h?.type === "floor" && view === "all") setView(h.fi);
        else { selectedAgent = null; info.hidden = true; }
      }
      drag = null;
    });
    canvas.addEventListener("pointerleave", () => (tip.hidden = true));
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const before = toWorld(e.clientX, e.clientY);
      cam.z = Math.max(fitZ * 0.7, Math.min(fitZ * 6, cam.z * Math.exp(-e.deltaY * 0.0015)));
      const after = toWorld(e.clientX, e.clientY);
      cam.x += before.x - after.x; cam.y += before.y - after.y; userMoved = true;
    }, { passive: false });
    hud.querySelector("[data-bk=fit]").onclick = fit;
    hud.querySelector("[data-bk=in]").onclick = () => { cam.z = Math.min(fitZ * 6, cam.z * 1.3); userMoved = true; };
    hud.querySelector("[data-bk=out]").onclick = () => { cam.z = Math.max(fitZ * 0.7, cam.z / 1.3); userMoved = true; };
    hud.querySelector("[data-bk=full]").onclick = () => {
      const el = canvas.parentElement;
      try { document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.().catch(() => {}); } catch (e) { /* optional */ }
    };
    floorBtns.forEach((b) => (b.onclick = () => setView(b.dataset.v === "all" ? "all" : +b.dataset.v)));
    new ResizeObserver(resize).observe(canvas.parentElement);
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", buildLayers);
    new MutationObserver(buildLayers).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  function showTip(e, text) {
    const r = canvas.parentElement.getBoundingClientRect();
    tip.hidden = false; tip.textContent = text.length > 90 ? text.slice(0, 89) + "…" : text;
    tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 200) + "px"; tip.style.top = e.clientY - r.top + 16 + "px";
  }
  let lastFloorSig = "";
  function updateFloorButtons() {
    const ag = opts.getAgents();
    const sig = view + "|" + Object.keys(HOME).map((k) => ag[k]?.status).join(",");
    if (sig === lastFloorSig) return;
    lastFloorSig = sig;
    floorBtns.forEach((b) => {
      const v = b.dataset.v === "all" ? "all" : +b.dataset.v;
      b.classList.toggle("on", v === view);
      if (v === "all") return;
      const ks = Object.keys(HOME).filter((k) => ROOM[HOME[k].room].floor === v);
      b.querySelector(".act").innerHTML = ks.map((k) => `<i class="${ag[k]?.status === "working" ? "w" : ""}" style="${ag[k]?.status === "error" ? "background:#ff3b30" : ag[k]?.status === "paused" ? "background:#8e8e93" : ""}"></i>`).join("");
    });
  }
  let lastInfo = "";
  function renderInfo() {
    const a = opts.getAgents()[selectedAgent];
    if (!a) return;
    const col = AGENT_COLOR[a.key];
    const st = { working: ["Arbeitet", "blue"], idle: ["Bereit", "green"], paused: ["Pausiert", ""], error: ["Fehler", "red"], waiting: ["Wartet", "blue"] }[a.status] || [a.status, ""];
    const fl = FLOORS[ROOM[HOME[a.key].room].floor];
    const html = `<div class="bk-info-h"><div class="bk-av" style="background:${col}"><svg class="i" viewBox="0 0 24 24"><path d="${ICONS[a.key]}"/></svg></div>
      <div style="min-width:0;flex:1"><b>${a.name}</b><div class="bk-sub">${a.role}</div></div>
      <button class="icon-btn" data-bk="close" aria-label="Schließen"><svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="row"><span class="chip ${st[1]}">${st[0]}</span><span class="chip">${ROOM[HOME[a.key].room].name} · Ebene ${fl.lvl}</span></div>
      <div class="bk-task">${String(a.task || "–").replace(/</g, "&lt;")}</div>
      ${a.status === "working" && a.progress != null ? `<div class="bar"><div style="width:${Math.round(a.progress)}%;background:${col}"></div></div>` : ""}
      <div class="bk-sub">${a.video_id ? `Video #${a.video_id} · ` : ""}${a.processed} erledigt${a.failed ? ` · ${a.failed} Fehler` : ""}</div>
      <div class="row">
        <button class="btn small" data-bk="toggle">${a.enabled ? "Pausieren" : "Fortsetzen"}</button>
        ${a.manual ? '<button class="btn small" data-bk="run">Jetzt ausführen</button>' : ""}
        ${a.video_id ? '<button class="btn small" data-bk="video">Video öffnen</button>' : ""}
      </div>`;
    if (html === lastInfo && !info.hidden) return;
    lastInfo = html; info.innerHTML = html; info.hidden = false;
    info.querySelector("[data-bk=close]").onclick = () => { selectedAgent = null; info.hidden = true; };
    info.querySelector("[data-bk=toggle]").onclick = () => opts.agentAction(a.key, a.enabled ? "pause" : "resume");
    info.querySelector("[data-bk=run]")?.addEventListener("click", () => opts.agentAction(a.key, "run"));
    info.querySelector("[data-bk=video]")?.addEventListener("click", () => opts.openVideo(a.video_id));
  }

  // ---------------- public API ----------------
  const ic = (id) => `<svg class="i"><use href="#${id}"/></svg>`;
  window.Bunker = {
    ICONS, AGENT_COLOR,
    init(container, options) {
      opts = options;
      container.innerHTML = `
        <canvas class="bk-canvas"></canvas>
        <div class="bk-hud">
          <div class="glass bk-floors">
            <button class="bk-floor" data-v="all"><span class="lv">${ic("i-layers")}</span><span class="nm">Alle Ebenen</span></button>
            ${FLOORS.map((f, i) => `<button class="bk-floor" data-v="${i}"><span class="lv">${f.lvl}</span><span class="nm">${f.name}</span><span class="act"></span></button>`).join("")}
          </div>
          <div class="glass bk-btns">
            <button class="icon-btn" data-bk="out" title="Verkleinern">${ic("i-zout")}</button>
            <button class="icon-btn" data-bk="in" title="Vergrößern">${ic("i-zin")}</button>
            <button class="icon-btn" data-bk="fit" title="Einpassen">${ic("i-fit")}</button>
            <button class="icon-btn" data-bk="full" title="Vollbild">${ic("i-expand")}</button>
          </div>
        </div>
        <div class="glass bk-legend"><span><i style="background:#0a84ff"></i>In Arbeit</span><span><i style="background:#ff9500"></i>Wartet auf dich</span><span><i style="background:#34c759"></i>Online</span><span><i style="background:#ff3b30"></i>Fehler</span><span>Klick auf eine Etage zum Hineinzoomen</span></div>
        <div class="glass bk-info" hidden></div><div class="glass bk-tip" hidden></div>`;
      canvas = container.querySelector("canvas");
      ctx = canvas.getContext("2d");
      hud = container.querySelector(".bk-hud");
      info = container.querySelector(".bk-info");
      tip = container.querySelector(".bk-tip");
      floorBtns = [...container.querySelectorAll(".bk-floor")];
      try { const v = localStorage.getItem("lugger.bunker.view"); if (v != null) view = v === "all" ? "all" : +v; } catch (e) { /* optional */ }
      buildLayers();
      bindInput();
    },
    loadVideos(list) {
      const sorted = [...list].sort((a, b) => a.id - b.id);
      const done = sorted.filter((v) => v.status === "published" || v.status === "ready").slice(-10).map((v) => v.id);
      for (const v of sorted) {
        if ((v.status === "published" || v.status === "ready") && !done.includes(v.id)) continue;
        makePkg(v, roomForVideo(v) || "leit");
      }
    },
    video: onVideo,
    deleted: onDeleted,
    start() { if (!running) { running = true; t0 = performance.now(); resize(); requestAnimationFrame(frame); } },
    stop() { running = false; },
  };
})();
