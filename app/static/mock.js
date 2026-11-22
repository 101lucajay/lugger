/* Demo backend: simulates the Lugger server (REST + WebSocket) inside the browser.
 * Only used for the standalone live demo (tools/build_demo.py) – never loaded by the real app. */
"use strict";
(function () {
  const NOW = () => Date.now() / 1000;
  const TOPICS = [
    "Warum KI-Chips gerade so knapp sind", "Was ist eigentlich ein KI-Agent?", "So erkennst du Deepfakes in Sekunden",
    "Der EU AI Act einfach erklärt", "Wie viel Strom frisst ChatGPT wirklich?", "Humanoide Roboter: Wer baut sie gerade?",
    "Quantencomputer vs. KI – was kommt zuerst?", "Diese 3 Jobs verändert KI zuerst", "Warum KI halluziniert",
    "Open-Source-KI: Wer gewinnt das Rennen?", "Wie selbstfahrende Autos sehen", "KI in der Medizin: Diagnose per Algorithmus",
    "Was steckt hinter KI-Musik?", "Wie lernt ein neuronales Netz?", "KI-Brillen: Das nächste Smartphone?", "Warum Rechenzentren ins Meer ziehen",
  ];
  const IDEAS = [
    ["Wie Smart Glasses mit KI den Alltag verändern", "Neue Modelle mit Echtzeit-Übersetzung", "Stell dir vor, deine Brille übersetzt jedes Gespräch live.", 8.6],
    ["KI erkennt Krankheiten an der Stimme", "Studien zu Stimm-Biomarkern", "Deine Stimme verrät mehr über deine Gesundheit als du denkst.", 8.1],
    ["Warum KI-Modelle immer kleiner werden", "On-Device-KI auf Smartphones", "Die stärkste KI passt bald in deine Hosentasche.", 7.4],
    ["Roboter-Taxis in Europa: Wann kommen sie?", "Erste Testfelder in Deutschland", "In diesen Städten fahren bald Autos ohne Fahrer.", 7.9],
    ["Wie KI Wettervorhersagen revolutioniert", "KI schlägt klassische Modelle", "Eine KI sagt das Wetter besser voraus als Supercomputer.", 6.8],
    ["KI-Agenten buchen jetzt deinen Urlaub", "Agenten, die selbst im Web handeln", "Was, wenn deine KI selbst einkauft?", 8.9],
  ];
  const A = (key, name, role, icon, manual = false) => ({ key, name, role, icon, enabled: true, status: "idle", task: "Wartet auf Arbeit",
    progress: null, video_id: null, last_error: "", processed: 0, failed: 0, started_at: null, manual });
  const agents = {
    trend_scout: A("trend_scout", "Trend-Scout", "Findet angesagte Themen & Videoideen", "🔭", true),
    producer: A("producer", "Produktionsleiter", "Plant Veröffentlichungen & startet Produktionen", "🎬", true),
    script_writer: A("script_writer", "Skript-Autor", "Recherchiert & schreibt das Videoskript", "✍️"),
    voice: A("voice", "Sprecher", "Spricht das Skript ein (Text-to-Speech)", "🎙️"),
    visuals: A("visuals", "Bild-Redakteur", "Sucht passendes Videomaterial je Szene", "🖼️"),
    editor: A("editor", "Cutter", "Schneidet & rendert das fertige Video", "🎞️"),
    publisher: A("publisher", "Publisher", "Lädt freigegebene Videos auf TikTok, Instagram & YouTube hoch", "🚀"),
  };
  const STAGES = [
    { agent: "script_writer", from: "queued", work: "scripting", to: "scripted", dur: 9,
      steps: ["Recherchiere Quellen (Websuche)", "Prüfe Fakten", "Claude schreibt das Skript", "Skript fertig: 6 Szenen, 128 Wörter"] },
    { agent: "voice", from: "scripted", work: "voicing", to: "voiced", dur: 7,
      steps: ["Spreche Szene 1/6 ein (elevenlabs)", "Spreche Szene 2/6 ein (elevenlabs)", "Spreche Szene 3/6 ein (elevenlabs)", "Spreche Szene 4/6 ein (elevenlabs)", "Spreche Szene 5/6 ein (elevenlabs)", "Spreche Szene 6/6 ein (elevenlabs)", "Füge Tonspur zusammen"] },
    { agent: "visuals", from: "voiced", work: "sourcing", to: "visuals_ready", dur: 7,
      steps: ["Szene 1/6: „robot hand typing“", "Szene 2/6: „data center servers“", "Szene 3/6: „neural network glow“", "Szene 4/6: „city at night drone“", "Szene 5/6: „person smartphone“", "Szene 6/6: „futuristic lab“"] },
    { agent: "editor", from: "visuals_ready", work: "rendering", to: "AFTER_RENDER", dur: 10,
      steps: ["Bereite Szene 1/6 vor", "Bereite Szene 4/6 vor", "Füge Szenen zusammen", "Erzeuge animierte Untertitel", "Rendere finales Video (Untertitel, Ton, Musik)", "Qualitätskontrolle & Vorschaubild"] },
    { agent: "publisher", from: "approved", work: "publishing", to: "published", dur: 8,
      steps: ["Lade auf YouTube hoch (offizielle API)", "Lade auf TikTok hoch via upload-post.com", "Lade auf Instagram hoch via upload-post.com", "Veröffentlicht auf youtube, tiktok, instagram"] },
  ];
  const settings = {
    niche: "Künstliche Intelligenz & Zukunftstechnologien", audience: "Deutschsprachige 18–40-Jährige, technikinteressiert", language: "de",
    target_seconds: 50, channel_name: "KI Kompakt", autopilot: true, videos_per_day: 3, schedule_times: "09:00,13:00,17:00",
    schedule_days: "1,2,3,4,5,6,7", timezone: "Europe/Berlin", require_approval: true, min_idea_backlog: 6, scout_interval_minutes: 30,
    anthropic_api_key: "••••••••", llm_model: "claude-opus-5-5", llm_web_search: true, tts_provider: "auto", edge_voice: "de-DE-ConradNeural",
    edge_rate: "+8%", elevenlabs_api_key: "••••••••", elevenlabs_voice_id: "pNInz6obpgDQGcFmaJgB", elevenlabs_model: "eleven_multilingual_v2",
    openai_api_key: "", openai_tts_voice: "onyx", openai_tts_model: "gpt-4o-mini-tts", pexels_api_key: "••••••••", music_volume: 0.12,
    subtitle_font: "DejaVu Sans", accent_color: "#FFD400", youtube_mode: "direct", tiktok_mode: "uploadpost", instagram_mode: "uploadpost",
    uploadpost_api_key: "••••••••", uploadpost_user: "ki-kompakt", youtube_client_id: "123-demo.apps.googleusercontent.com",
    youtube_client_secret: "••••••••", youtube_refresh_token: "••••••••", youtube_privacy: "public", tiktok_client_key: "", tiktok_client_secret: "",
    tiktok_refresh_token: "", tiktok_privacy: "SELF_ONLY", instagram_access_token: "", instagram_user_id: "",
  };
  const videos = new Map();
  const ideas = [];
  const logs = [];
  let vid = 1, iid = 1, lid = 1, topicIdx = 0;
  const subs = new Set();
  const emit = (type, data) => { const msg = JSON.stringify({ type, data }); subs.forEach((ws) => ws._recv(msg)); };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function log(agent, message, video_id = null, level = "info") {
    const e = { id: lid++, ts: NOW(), agent, level, message, video_id };
    logs.push(e); if (logs.length > 600) logs.shift();
    emit("log", e);
  }
  const pushAgent = (k) => emit("agent", clone(agents[k]));
  function script(topic) {
    return { title: topic, hook_text: "Das wusstest du noch nicht!", description: `${topic} – kompakt in unter einer Minute erklärt.`,
      hashtags: ["#KI", "#Technik", "#Zukunft", "#Wissen", "#Shorts"], sources: ["https://www.heise.de", "https://www.tagesschau.de"],
      segments: [
        { text: `${topic}? Die Antwort überrascht die meisten.`, visual_query: "futuristic technology", keyword: "HOOK" },
        { text: "Hinter den Kulissen passiert gerade enorm viel.", visual_query: "data center servers", keyword: "KONTEXT" },
        { text: "Drei Fakten, die du kennen solltest.", visual_query: "neural network glow", keyword: "FAKTEN" },
        { text: "Ein Beispiel zeigt, was das konkret bedeutet.", visual_query: "person smartphone", keyword: "BEISPIEL" },
        { text: "Für dich heißt das: Jetzt lohnt es sich hinzuschauen.", visual_query: "city at night drone", keyword: "FÜR DICH" },
        { text: "Folge für mehr KI in unter einer Minute!", visual_query: "smartphone social media", keyword: "FOLGEN" },
      ], voice: { provider: "elevenlabs", duration: 48.6 } };
  }
  function newVideo(topic, status, created, ideaId = null) {
    const v = { id: vid++, idea_id: ideaId, topic, status, script: null, title: topic, duration: null, video_path: null, thumb_path: null,
      error: null, publish_results: {}, created_at: created, updated_at: created };
    if (!["queued"].includes(status)) { v.script = script(topic); v.duration = 44 + Math.round(Math.random() * 12); }
    if (status === "published") v.publish_results = {
      youtube: { ok: true, via: "direct", url: "https://youtube.com/shorts/demo" },
      tiktok: { ok: true, via: "upload-post", url: "https://tiktok.com/@demo" },
      instagram: { ok: true, via: "upload-post", url: "https://instagram.com/reel/demo" } };
    videos.set(v.id, v);
    return v;
  }
  // ---- seed history (14 days) ----
  (function seed() {
    const day = 86400;
    for (let d = 13; d >= 1; d--) {
      const n = 1 + ((d * 7) % 3 === 0 ? 2 : (d % 2));
      for (let i = 0; i < n; i++) {
        const t = NOW() - d * day + i * 3600 * 4;
        const v = newVideo(TOPICS[topicIdx++ % TOPICS.length], d === 4 && i === 0 ? "failed" : "published", t);
        v.updated_at = t + 1800;
        if (v.status === "failed") v.error = "[Publisher] Upload fehlgeschlagen: instagram (Token abgelaufen)";
      }
    }
    const w = newVideo(TOPICS[topicIdx++ % TOPICS.length], "awaiting_approval", NOW() - 1200);
    w.waitSince = -1;
    for (const [title, angle, hook, score] of IDEAS) ideas.push({ id: iid++, title, angle, hook, why_now: "Diese Woche viel diskutiert", sources: ["https://www.heise.de"], score, origin: "trend_scout", status: "new", created_at: NOW() - 3600 * 5 });
    log("system", "Agenten-Zentrale gestartet (Demo)");
    Object.values(agents).forEach((a) => (a.processed = 10 + Math.floor(Math.random() * 20)));
  })();

  // ---- simulation ----
  const jobs = {};
  let simT = 0, nextProd = 3, scoutJob = null;
  const pace = 32; // seconds between scheduled productions in the demo
  function setVideo(v, patch) { Object.assign(v, patch, { updated_at: NOW() }); emit("video", clone(v)); }
  function stats() {
    const all = [...videos.values()];
    const by = {}; all.forEach((v) => (by[v.status] = (by[v.status] || 0) + 1));
    const prod = all.filter((v) => ["queued", "scripting", "scripted", "voicing", "voiced", "sourcing", "visuals_ready", "rendering", "rendered", "approved", "publishing"].includes(v.status)).length;
    return { ideas: ideas.filter((i) => i.status === "new").length, in_production: prod, awaiting_approval: by.awaiting_approval || 0,
      published: by.published || 0, failed: (by.failed || 0) + (by.publish_failed || 0), by_status: by };
  }
  function upcoming(n) {
    if (!settings.autopilot) return [];
    const out = []; let t = Date.now() + (nextProd - simT) * 1000;
    for (let i = 0; i < n; i++) { out.push(new Date(t).toISOString()); t += pace * 1000; }
    return out;
  }
  function stateObj() {
    const up = upcoming(6);
    agents.producer.next_slot = up[0] || null;
    return { agents: Object.values(agents).map(clone), stats: stats(), autopilot: settings.autopilot, require_approval: settings.require_approval,
      niche: settings.niche, next_slot: up[0] || null, upcoming: up, platforms: {}, auth: false, demo: true,
      automations: { total: autos.size, active: [...autos.values()].filter((a) => a.enabled).length, running: [] } };
  }
  function produce(ideaId = null, topic = null) {
    let idea = null;
    if (!topic) {
      idea = ideaId ? ideas.find((i) => i.id === ideaId) : ideas.filter((i) => i.status === "new").sort((a, b) => b.score - a.score)[0];
      if (!idea) { scout(true); return null; }
      idea.status = "used"; emit("ideas", {});
    }
    const v = newVideo(topic || idea.title, "queued", NOW(), idea?.id);
    emit("video", clone(v));
    fireEvent("video.created", { id: v.id, topic: v.topic });
    const p = agents.producer;
    Object.assign(p, { status: "working", task: `Wähle beste Idee: „${v.topic}“`, progress: 50, started_at: NOW(), video_id: v.id }); pushAgent("producer");
    log("producer", `Produktion gestartet: „${v.topic}“`, v.id);
    setTimeout(() => { Object.assign(p, { status: "idle", task: "Fertig – wartet auf Arbeit", progress: null, video_id: null }); p.processed++; pushAgent("producer"); }, 1600);
    return v;
  }
  function scout(manual = false) {
    const s = agents.trend_scout;
    if (scoutJob || !s.enabled) return;
    scoutJob = { t: 0, dur: 10 };
    Object.assign(s, { status: "working", task: manual ? "Suche Trends (manuell gestartet)…" : "Suche Trends (Vorrat niedrig)…", progress: 5, started_at: NOW() });
    pushAgent("trend_scout");
    log("trend_scout", s.task);
  }
  function tick(dt) {
    simT += dt;
    if (scoutJob) {
      const s = agents.trend_scout; scoutJob.t += dt;
      const k = scoutJob.t / scoutJob.dur, before = s.task;
      s.progress = Math.min(99, k * 100);
      s.task = k < 0.3 ? "25 aktuelle Schlagzeilen gefunden" : k < 0.8 ? "Claude recherchiert & bewertet Themen (Websuche)…" : "Speichere neue Ideen…";
      if (s.task !== before) log("trend_scout", s.task);
      if (k >= 1) {
        const n = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) { const [t, a, h, sc] = IDEAS[(iid + i) % IDEAS.length]; ideas.push({ id: iid++, title: `${t}${iid > 12 ? " (Update)" : ""}`, angle: a, hook: h, why_now: "Gerade in den News", sources: ["https://www.heise.de"], score: Math.max(5, sc - Math.random()), origin: "trend_scout", status: "new", created_at: NOW() }); }
        scoutJob = null; s.processed++;
        Object.assign(s, { status: "idle", task: "Fertig – wartet auf Arbeit", progress: null });
        log("trend_scout", `${n} neue Videoideen gespeichert`); emit("ideas", {}); fireEvent("ideas.found", { count: n });
      }
      pushAgent("trend_scout");
    } else if (settings.autopilot && ideas.filter((i) => i.status === "new").length < settings.min_idea_backlog) scout();

    for (const st of STAGES) {
      const a = agents[st.agent];
      if (!a.enabled) { if (a.status !== "paused") { Object.assign(a, { status: "paused", task: "Pausiert", progress: null }); pushAgent(st.agent); } continue; }
      let j = jobs[st.agent];
      if (!j) {
        const v = [...videos.values()].filter((x) => x.status === st.from).sort((x, y) => x.id - y.id)[0];
        if (!v) { if (a.status !== "idle") { Object.assign(a, { status: "idle", task: "Fertig – wartet auf Arbeit", progress: null, video_id: null }); pushAgent(st.agent); } continue; }
        j = jobs[st.agent] = { v, t: 0, step: -1 };
        setVideo(v, { status: st.work });
        Object.assign(a, { status: "working", video_id: v.id, started_at: NOW() });
      }
      j.t += dt;
      const k = Math.min(1, j.t / st.dur), si = Math.min(st.steps.length - 1, Math.floor(k * st.steps.length));
      a.progress = k * 100;
      if (si !== j.step) { j.step = si; a.task = st.steps[si]; log(st.agent, st.steps[si], j.v.id); }
      if (k >= 1) {
        a.processed++; delete jobs[st.agent];
        const patch = {};
        if (st.agent === "script_writer") { patch.script = script(j.v.topic); patch.title = j.v.topic; }
        if (st.to === "AFTER_RENDER") {
          patch.status = settings.require_approval ? "awaiting_approval" : "approved"; patch.duration = 44 + Math.round(Math.random() * 12);
          j.v.waitSince = simT;
          log("editor", `Video gerendert: ${patch.duration}s – ${settings.require_approval ? "wartet auf Freigabe" : "freigegeben"}`, j.v.id);
          emit("notify", { title: "Video fertig", message: j.v.title, video_id: j.v.id });
        } else patch.status = st.to;
        if (st.to === "published") {
          patch.publish_results = { youtube: { ok: true, via: "direct", url: "https://youtube.com/shorts/demo" }, tiktok: { ok: true, via: "upload-post", url: "https://tiktok.com/@demo" }, instagram: { ok: true, via: "upload-post", url: "https://instagram.com/reel/demo" } };
          emit("notify", { title: "Veröffentlicht", message: j.v.title, video_id: j.v.id });
          setTimeout(() => fireEvent("video.published", { id: j.v.id, title: j.v.title, youtube_url: "https://youtube.com/shorts/demo" }), 200);
        }
        setVideo(j.v, patch);
        Object.assign(a, { status: "idle", task: "Fertig – wartet auf Arbeit", progress: null, video_id: null });
      }
      pushAgent(st.agent);
    }
    // demo: approve automatically after a while so the flow keeps going
    for (const v of videos.values()) {
      if (v.status === "awaiting_approval" && v.waitSince != null && v.waitSince >= 0 && simT - v.waitSince > 18) {
        log("system", "Demo: automatisch freigegeben (du kannst auch selbst klicken)", v.id);
        setVideo(v, { status: "approved" });
      }
    }
    if (settings.autopilot && simT >= nextProd && agents.producer.enabled) { produce(); nextProd = simT + pace; emit("ideas", {}); }
  }
  let last = performance.now();
  setInterval(() => { const n = performance.now(); tick(Math.min(0.5, (n - last) / 1000)); last = n; }, 200);

  // ---- automations (simulated engine) ----
  const autos = new Map(); const runs = []; let aid = 1, rid = 1;
  function addAuto(o, extra = {}) { const a = { id: aid++, description: "", enabled: true, webhook_token: "demo" + aid, last_run_at: null, last_status: null, run_count: 0, created_at: NOW(), updated_at: NOW(), ...o, ...extra }; autos.set(a.id, a); return a; }
  const autoOut = (a) => ({ ...clone(a), webhook_path: `/hooks/${a.webhook_token}`, running: runs.some((r) => r.automation_id === a.id && r.status === "running") });
  addAuto({ name: "Neues Video → Discord", description: "Postet jedes veröffentlichte Video in den Community-Discord.", trigger: { type: "event", event: "video.published" },
    steps: [{ type: "discord", webhook_url: "https://discord.com/api/webhooks/…", message: "🎬 Neues Video online: **{{trigger.data.title}}**" }] });
  addAuto({ name: "Website-Monitor", description: "Prüft regelmäßig die Kanal-Website.", trigger: { type: "interval", minutes: 5 },
    steps: [{ type: "http", method: "GET", url: "https://ki-kompakt.example", fail_on_error: false }, { type: "filter", left: "{{steps.1.output.status}}", op: "not_equals", right: "200" },
      { type: "telegram", bot_token: "…", chat_id: "…", message: "🚨 Website antwortet mit {{steps.1.output.status}}" }] });
  addAuto({ name: "KI-News am Morgen", description: "Claude recherchiert die KI-News und schickt sie per Telegram.", trigger: { type: "schedule", times: "07:30", days: "1,2,3,4,5" },
    steps: [{ type: "claude", prompt: "Fasse die 5 wichtigsten KI-News von heute zusammen.", web_search: true }, { type: "telegram", bot_token: "…", chat_id: "…", message: "☀️ KI-News {{date}}\n\n{{steps.1.output}}" }] });
  addAuto({ name: "Webhook → Videoidee", description: "Themen aus Notion/Shortcuts landen direkt im Ideen-Speicher.", trigger: { type: "webhook" },
    steps: [{ type: "add_idea", title: "{{trigger.data.title}}" }] });
  addAuto({ name: "Fehler-Alarm", description: "Meldet Probleme in der Produktion sofort.", trigger: { type: "event", event: "video.failed" },
    steps: [{ type: "slack", webhook_url: "…", message: "⚠️ {{trigger.data.agent}}: {{trigger.data.error}}" }] }, { enabled: false });
  // seed history
  (function () {
    const mk = (a, t, status, results, trig) => { runs.unshift({ id: rid++, automation_id: a, started_at: t, finished_at: t + 3, status, trigger: trig, results }); const au = autos.get(a); au.last_run_at = t; au.last_status = status; au.run_count++; };
    mk(3, NOW() - 3600 * 15, "success", [{ n: 1, type: "claude", status: "ok", ms: 8200, output: "1. OpenAI stellt neues Agenten-Framework vor …\n2. EU veröffentlicht Leitlinien zum AI Act …\n3. Google zeigt KI-Brille mit Live-Übersetzung …" }, { n: 2, type: "telegram", status: "ok", ms: 310, output: { status: 200 } }], { type: "schedule", slot: "07:30" });
    mk(4, NOW() - 3600 * 6, "success", [{ n: 1, type: "add_idea", status: "ok", ms: 12, output: { idea_id: 3 } }], { type: "webhook", data: { title: "Wie KI Wettervorhersagen revolutioniert" } });
    for (let i = 4; i >= 1; i--) mk(2, NOW() - i * 300, "skipped", [{ n: 1, type: "http", status: "ok", ms: 180, output: { status: 200, body: "<!doctype html>…" } }, { n: 2, type: "filter", status: "skipped", ms: 0, output: "Bedingung nicht erfüllt: „200“ not_equals „200“" }], { type: "interval" });
    mk(1, NOW() - 5400, "success", [{ n: 1, type: "discord", status: "ok", ms: 260, output: { status: 204 } }], { type: "event", event: "video.published", label: "Video veröffentlicht", data: { title: "Warum KI halluziniert" } });
  })();
  function tplRender(v, ctx) {
    if (typeof v !== "string") return v;
    return v.replace(/\{\{\s*([\w.\-]+)\s*\}\}/g, (_, p) => { let c = ctx; for (const k of p.split(".")) { c = c == null ? "" : c[k]; } return c == null ? "" : typeof c === "object" ? JSON.stringify(c) : String(c); });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function fakeStep(s, ctx) {
    const r = {}; for (const [k, v] of Object.entries(s)) r[k] = tplRender(v, ctx);
    await sleep(500 + Math.random() * 900);
    switch (s.type) {
      case "http": return { status: 200, body: "<!doctype html><title>OK</title>…" };
      case "claude": await sleep(1500); return "Demo-Antwort von Claude: 1) Neue Agenten-Modelle 2) KI-Brillen 3) EU AI Act tritt in Phase 2 …";
      case "discord": return { status: 204 };
      case "slack": case "telegram": return { status: 200 };
      case "filter": { const ok = { contains: r.left.includes(r.right), not_contains: !r.left.includes(r.right), equals: r.left === r.right, not_equals: r.left !== r.right, not_empty: !!r.left, gt: +r.left > +r.right, lt: +r.left < +r.right }[r.op]; if (!ok) throw { skip: `Bedingung nicht erfüllt: „${r.left}“ ${r.op} „${r.right}“` }; return { passed: true }; }
      case "delay": await sleep(Math.min(3, +r.seconds || 0) * 1000); return { waited: +r.seconds || 0 };
      case "add_idea": { const i = { id: iid++, title: r.title || "Neue Idee", angle: r.angle || "", hook: "", why_now: "", sources: [], score: 8, origin: "automation", status: "new", created_at: NOW() }; ideas.push(i); emit("ideas", {}); return { idea_id: i.id }; }
      case "produce_video": { const v = produce(null, r.topic || null); return { video_id: v?.id }; }
      case "run_agent": r.agent === "producer" ? produce() : scout(true); return { agent: r.agent };
      case "autopilot": settings.autopilot = r.on === "true" || r.on === true; return { autopilot: settings.autopilot };
      case "log": log("automations", String(r.message)); return r.message;
    }
    return null;
  }
  async function runAuto(a, trigger) {
    const run = { id: rid++, automation_id: a.id, started_at: NOW(), finished_at: null, status: "running", trigger, results: [] };
    runs.unshift(run); if (runs.length > 80) runs.pop();
    a.last_run_at = NOW(); a.last_status = "running";
    const pub = () => emit("automation_run", { ...clone(run), automation_name: a.name });
    pub(); emit("automation", autoOut(a));
    const ctx = { trigger, steps: {}, date: new Date().toLocaleDateString("de-DE"), time: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }), stats: { published: stats().published, ideas: stats().ideas, awaiting_approval: stats().awaiting_approval } };
    let status = "success";
    for (let i = 0; i < a.steps.length; i++) {
      const s = a.steps[i], t = performance.now(), res = { n: i + 1, type: s.type };
      try { res.output = await fakeStep(s, ctx); res.status = "ok"; }
      catch (e) { if (e && e.skip) { res.status = "skipped"; res.output = e.skip; status = "skipped"; } else { res.status = "error"; res.output = String(e); status = "error"; } }
      res.ms = Math.round(performance.now() - t);
      run.results.push(res); ctx.steps[String(i + 1)] = res; ctx.steps.last = res; pub();
      if (status !== "success") break;
    }
    run.status = status; run.finished_at = NOW(); a.last_status = status; a.run_count++;
    log("automations", `„${a.name}“ ${{ success: "erfolgreich", skipped: "übersprungen", error: "mit Fehler beendet" }[status]}`);
    pub(); emit("automation", autoOut(a));
    return run;
  }
  function fireEvent(name, data) {
    for (const a of autos.values()) if (a.enabled && a.trigger.type === "event" && a.trigger.event === name) runAuto(a, { type: "event", event: name, label: name, data });
  }
  setInterval(() => {
    for (const a of autos.values()) if (a.enabled && a.trigger.type === "interval" && (!a.last_run_at || NOW() - a.last_run_at > 40) && !runs.some((r) => r.automation_id === a.id && r.status === "running")) runAuto(a, { type: "interval" });
  }, 3000);

  // ---- REST ----
  function respond(data, status = 200) { return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })); }
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (!url.pathname.startsWith("/api/")) return realFetch(input, init);
    const method = (init.method || "GET").toUpperCase();
    const body = init.body ? JSON.parse(init.body) : {};
    const p = url.pathname.replace(/^\/api\//, "").split("/");
    try {
      if (p[0] === "state") return respond(stateObj());
      if (p[0] === "automations") {
        if (p[1] === "runs") return respond(clone(runs.slice(0, +url.searchParams.get("limit") || 30)).map((r) => ({ ...r, automation_name: autos.get(r.automation_id)?.name || "" })));
        if (p.length === 1 && method === "POST") { if (!body.name) return respond({ detail: "Bitte gib der Automatisierung einen Namen." }, 400); const a = addAuto({ name: body.name, description: body.description || "", enabled: body.enabled !== false, trigger: body.trigger, steps: body.steps || [] }); emit("automation", autoOut(a)); return respond(autoOut(a)); }
        if (p.length === 1) return respond([...autos.values()].map(autoOut).reverse());
        const a = autos.get(+p[1]); if (!a) return respond({ detail: "Automatisierung nicht gefunden" }, 404);
        if (method === "DELETE") { autos.delete(a.id); emit("automation_deleted", { id: a.id }); return respond({ ok: true }); }
        if (method === "PUT") { Object.assign(a, { name: body.name, description: body.description || "", enabled: body.enabled !== false, trigger: body.trigger, steps: body.steps || [], updated_at: NOW() }); emit("automation", autoOut(a)); return respond(autoOut(a)); }
        if (p[2] === "toggle") { a.enabled = !!body.enabled; emit("automation", autoOut(a)); return respond(autoOut(a)); }
        if (p[2] === "run") { const r = runAuto(a, { type: "manual", data: body || {} }); return r.then ? respond({ ok: true, run_id: rid }) : respond({ ok: true }); }
        if (p[2] === "runs") return respond(clone(runs.filter((r) => r.automation_id === a.id)));
      }
      if (p[0] === "logs") {
        const vidq = +url.searchParams.get("video_id") || null, lim = +url.searchParams.get("limit") || 200;
        return respond(logs.filter((l) => !vidq || l.video_id === vidq).slice(-lim));
      }
      if (p[0] === "settings") { if (method === "POST") Object.assign(settings, body); return respond(clone(settings)); }
      if (p[0] === "autopilot") { settings.autopilot = !!body.on; if (settings.autopilot) nextProd = simT + 4; log("system", `Autopilot ${settings.autopilot ? "an" : "aus"}`); return respond(stateObj()); }
      if (p[0] === "agents") {
        if (p[1] === "all") { Object.keys(agents).forEach((k) => { agents[k].enabled = p[2] !== "pause"; if (!agents[k].enabled) Object.assign(agents[k], { status: "paused", task: "Pausiert" }); pushAgent(k); }); return respond(stateObj()); }
        const a = agents[p[1]]; if (!a) return respond({ detail: "Agent unbekannt" }, 404);
        if (p[2] === "pause") { a.enabled = false; if (a.status !== "working") Object.assign(a, { status: "paused", task: "Pausiert" }); log(a.key, "Agent pausiert"); }
        if (p[2] === "resume") { a.enabled = true; if (a.status === "paused") Object.assign(a, { status: "idle", task: "Wartet auf Arbeit" }); log(a.key, "Agent fortgesetzt"); }
        if (p[2] === "run") { a.enabled = true; a.key === "trend_scout" ? scout(true) : produce(); }
        pushAgent(a.key);
        return respond(clone(a));
      }
      if (p[0] === "produce") { const v = produce(null, (body.topic || "").trim() || null); return v ? respond(clone(v)) : respond({ detail: "Keine Ideen im Speicher – Trend-Scout wurde beauftragt." }, 400); }
      if (p[0] === "ideas") {
        if (p.length === 1 && method === "POST") { const i = { id: iid++, title: body.title, angle: body.angle || "", hook: "", why_now: "", sources: [], score: 9, origin: "manuell", status: "new", created_at: NOW() }; ideas.push(i); emit("ideas", {}); return respond(i); }
        if (p.length === 1) return respond(clone(ideas).reverse());
        const i = ideas.find((x) => x.id === +p[1]);
        if (p[2] === "produce") { const v = produce(i.id); return respond(clone(v)); }
        if (p[2] === "discard") { i.status = "discarded"; emit("ideas", {}); return respond({ ok: true }); }
      }
      if (p[0] === "videos") {
        if (p.length === 1) return respond([...videos.values()].map(clone).reverse());
        const v = videos.get(+p[1]); if (!v) return respond({ detail: "Nicht gefunden" }, 404);
        if (method === "DELETE") { videos.delete(v.id); emit("video_deleted", { id: v.id }); return respond({ ok: true }); }
        if (p[2] === "approve") { log("system", `Video #${v.id} freigegeben`, v.id); setVideo(v, { status: "approved" }); return respond(clone(v)); }
        if (p[2] === "reject") { setVideo(v, { status: "rejected" }); return respond(clone(v)); }
        if (p[2] === "retry") { setVideo(v, { status: v.status === "failed" || v.status === "publish_failed" ? "approved" : "queued", error: null }); return respond(clone(v)); }
        if (p[2] === "rerender") { setVideo(v, { status: { script: "queued", voice: "scripted", visuals: "voiced" }[body.stage] || "visuals_ready" }); return respond(clone(v)); }
        if (p[2] === "meta") { Object.assign(v.script, { title: body.title, description: body.description, hashtags: String(body.hashtags || "").split(/\s+/).filter(Boolean) }); setVideo(v, { title: body.title }); return respond(clone(v)); }
        return respond(clone(v));
      }
    } catch (e) { return respond({ detail: String(e) }, 500); }
    return respond({ detail: "Unbekannt" }, 404);
  };

  // ---- WebSocket ----
  class DemoSocket {
    constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; subs.add(this); this.onopen?.(); }, 150); }
    _recv(msg) { this.onmessage?.({ data: msg }); }
    send() {}
    close() { subs.delete(this); }
  }
  window.WebSocket = DemoSocket;
})();
