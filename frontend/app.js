/* BTC DESK — app wiring: state over WebSocket, DOM + chart rendering, operator controls. */
(() => {
  const DESKS = [
    { key: "spotter", name: "SPOTTER", stage: "01 · SCAN", shape: "circle" },
    { key: "prior", name: "PRIOR", stage: "02 · PRICING", shape: "circle" },
    { key: "edge", name: "EDGE", stage: "03 · EDGE", shape: "drop" },
    { key: "kelly", name: "KELLY", stage: "04 · SIZING", shape: "drop" },
    { key: "taker", name: "TAKER", stage: "05 · EXECUTION", shape: "circle" },
    { key: "closer", name: "CLOSER", stage: "06 · SETTLEMENT", shape: "circle" },
  ];
  const COLOR = { ...Floor.COLOR, core: "#c7cfdb" };
  const $ = (id) => document.getElementById(id);
  const money = (v, d = 0) => (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const smoney = (v, d = 0) => (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const cents = (p) => (p * 100).toFixed(1) + "¢";
  const scents = (c) => (c >= 0 ? "+" : "") + c.toFixed(1) + "¢";
  const pct = (v, d = 2) => (v >= 0 ? "+" : "") + v.toFixed(d) + "%";
  const setText = (id, v) => { const el = $(id); if (el && el.textContent !== String(v)) el.textContent = v; };
  const setNum = (id, v, text) => { const el = $(id); if (!el) return; el.textContent = text; el.classList.toggle("pos", v > 0); el.classList.toggle("neg", v < 0); };
  const hhmmss = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`; };

  /* ---------------- static DOM ---------------- */
  const icon = (d) => {
    const body = d.shape === "drop"
      ? `<path d="M15 2C15 2 27 12 27 18A12 12 0 0 1 3 18C3 12 15 2 15 2Z" fill="var(--c)"/>`
      : `<circle cx="15" cy="15" r="13" fill="var(--c)"/>`;
    const GLYPH = {
      spotter: '<circle cx="13.5" cy="13.5" r="4.2"/><path d="M16.8 16.8L21 21"/>',
      prior: '<path d="M8 20C11 20 12 9 15 9C18 9 19 20 22 20"/>',
      edge: '<path d="M8 19H14V11H21"/>',
      kelly: '<path d="M10 20V15M15 20V10M20 20V13"/>',
      taker: '<path d="M9 15H21M16.5 10.5L21 15L16.5 19.5"/>',
      closer: '<path d="M9 15.5L13.5 20L21 10.5"/>',
    };
    return `<svg class="desk-ico" viewBox="0 0 30 30" aria-hidden="true">${body}<g stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round">${GLYPH[d.key]}</g></svg>`;
  };
  $("desks").innerHTML = DESKS.map((d) => `
    <article class="desk" id="desk-${d.key}" style="--c:var(--${d.key})">
      <div class="desk-top"><span>${d.stage}</span><span class="st"><i></i><span id="dstate-${d.key}">IDLE</span></span></div>
      <div class="desk-mid">${icon(d)}<div><div class="desk-name">${d.name}</div><div class="desk-note" id="dnote-${d.key}">–</div></div></div>
      <div class="desk-bot"><span class="word" id="dword-${d.key}">IDLE</span><span id="dmetric-${d.key}">–</span></div>
      <div class="desk-bar"><i id="dbar-${d.key}"></i></div>
    </article>`).join("");
  $("gauges").innerHTML = DESKS.map((d) => `
    <div class="gauge" style="--c:var(--${d.key})"><div class="gauge-top"><b id="g-${d.key}">0</b><span>${d.name}</span></div><canvas id="gc-${d.key}"></canvas></div>`).join("");
  const TELE = [
    { key: "book", label: "BOOK · 50 LVL" }, { key: "funding", label: "FUNDING" }, { key: "spread", label: "SPREAD" },
    { key: "oi", label: "OPEN INTEREST" }, { key: "basis", label: "MARK − INDEX" }, { key: "atr", label: "ATR 15M" },
  ];
  $("telemetry").innerHTML = TELE.map((t) => `<div class="tele"><span>${t.label}</span><b id="tv-${t.key}">–</b><canvas id="tc-${t.key}"></canvas></div>`).join("");
  $("bias").innerHTML = [
    ["DIRECTIONAL BIAS", "bias-dir", "var(--up)"], ["MODEL CONFIDENCE", "bias-conf", "var(--kelly)"], ["BOOK PRESSURE", "bias-book", "var(--taker)"],
  ].map(([l, id, c]) => `<div style="--c:${c}"><span>${l}<b id="${id}-v">–</b></span><i id="${id}"></i></div>`).join("");

  /* ---------------- state ---------------- */
  let S = null, ws = null, wsTries = 0, lastLogTs = 0, lastTapeKey = "";
  const stageOf = {}; // ticket id -> last stage seen
  const hist = { funding: [], spread: [], oi: [], basis: [], atr: [] };
  const pushHist = (k, v) => { const a = hist[k]; if (a.length && a[a.length - 1] === v) return; a.push(v); if (a.length > 60) a.shift(); };

  Floor.init($("floorCanvas"));

  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { wsTries = 0; setSwarm(); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type !== "state") return;
      try { render(m.state); } catch (err) { console.error("render failed: " + (err && err.stack)); }
    };
    ws.onclose = () => { ws = null; setSwarm(); setTimeout(connect, Math.min(1000 * 2 ** wsTries++, 15000)); };
    ws.onerror = () => ws && ws.close();
  }
  setInterval(() => ws && ws.readyState === 1 && ws.send('{"type":"ping"}'), 25000);
  connect();

  /* ---------------- render ---------------- */
  function render(s) {
    const first = !S; S = s;
    const m = s.market || {}, mo = s.model || {}, L = s.ledger || {}, an = s.analog || {};
    const open = s.tickets.open || [], recent = s.tickets.recent || [];

    // top bar + strip
    setText("stUptime", hhmmss(s.uptime_s)); setText("stHandoffs", s.handoffs_total.toLocaleString()); setText("stSettled", L.n || 0);
    const chip = $("modeChip"); chip.textContent = s.mode.toUpperCase(); chip.classList.toggle("live", s.mode === "live");
    setSwarm();
    $("dotLive").className = "dot" + (s.online ? "" : " off");
    setText("siLive", s.online ? "AGENTS LIVE" : "STREAM LOST");
    setText("siHolder", (s.stage.holder || "spotter").toUpperCase());
    setText("siHpm", s.handoffs_per_min);
    if (mo.p_up != null) { setText("siFair", cents(mo.p_up)); setText("siBook", cents(mo.p_market)); setNum("siEdge", mo.edge_cents, scents(mo.edge_cents) + " " + mo.direction); }
    setText("siOpen", open.length);
    $("btnApprovals").setAttribute("aria-pressed", String(!!s.approvals_only));
    setNum("siAway", L.away_pnl || 0, smoney(L.away_pnl || 0, 2));
    setText("siDD", ((L.dd_now || 0) * 100).toFixed(2) + "%"); setText("siGuard", ((s.risk.daily_drawdown_guard || 0) * 100).toFixed(1) + "%");

    // desks
    DESKS.forEach((d, i) => {
      const st = s.desks[d.key], el = $("desk-" + d.key);
      el.className = "desk " + st.state;
      const word = st.state === "on_deck" ? "ON DECK" : st.state.toUpperCase();
      setText("dstate-" + d.key, s.stage.holder === d.key && open.length ? "HOLDING" : word);
      setText("dword-" + d.key, word);
      $("dbar-" + d.key).style.transform = `scaleX(${st.state === "done" ? 1 : st.progress})`;
      setText("dnote-" + d.key, deskNote(d.key, s));
      setText("dmetric-" + d.key, deskMetric(d.key, s));
      setText("g-" + d.key, st.gauge);
      Charts.spark($("gc-" + d.key), st.history, COLOR[d.key], { min: 0, max: 100, fillAlpha: 0.14 });
    });

    // office
    const routing = open.find((t) => t.status === "routing");
    const stage = s.stage.index, names = ["SCAN", "PRICING", "EDGE", "SIZING", "EXECUTION", "SETTLEMENT"];
    if (routing || open.length) setText("officeRight", `WORKING THE BOOK · STAGE 0${stage + 1} · ${names[stage]}`);
    else setText("officeRight", s.paused ? "SWARM PAUSED · OPEN TICKETS STILL SETTLE" : s.halted ? "DRAWDOWN GUARD · DESK CLOSED UNTIL 00:00 UTC" : `IDLE · NEXT SCAN ${nextScan()} UTC`);
    setText("ffLeft", "BTC CORE · " + (s.paused ? "PAUSED" : s.halted ? "GUARD" : open.length ? "ROUTING" : "IDLE"));
    if (m.last) { setText("ffPrice", money(m.last, 1)); setNum("ffChg", m.chg24, pct(m.chg24) + " 24H"); }
    const live = open.find((t) => t.status === "open") || routing || open[0];
    setText("ffRight", live ? `TICKET ${live.id.toUpperCase()} · ${live.direction || "–"} · ${live.status.toUpperCase()}` : "NO OPEN TICKET");
    if (mo.p_up != null) {
      setText("mvbFair", cents(mo.p_up)); setText("mvbBook", cents(mo.p_market)); setNum("mvbEdge", mo.edge_cents, scents(mo.edge_cents));
      setText("mvbStake", money(mo.kelly ? mo.kelly.notional : 0));
      Charts.bell($("bell"), mo.p_up * 100, mo.p_market * 100, mo.edge_cents >= 0 ? Charts.C.up : Charts.C.down);
    }
    Floor.update(s);
    // ticket flights on stage change
    recent.forEach((t) => {
      const prev = stageOf[t.id], cur = t.status === "settled" ? 6 : t.stage;
      if (prev != null && cur > prev) {
        const from = DESKS[Math.min(prev, 5)].key, to = DESKS[Math.min(cur, 5)].key;
        Floor.flight(from, cur === 6 ? "closer" : to, cur === 6 ? (t.pnl >= 0 ? Charts.C.up : Charts.C.down) : COLOR[to]);
      }
      stageOf[t.id] = cur;
    });
    // on deck
    const deck = open.find((t) => t.status === "on_deck");
    $("deck").hidden = !deck;
    if (deck) { $("deck").dataset.id = deck.id; setText("deckText", `${deck.direction} ${deck.qty} BTC · EDGE ${scents(deck.edge)} · ${money(deck.stake)} · TICKET ${deck.id.toUpperCase()}`); }

    // telemetry
    if (m.last) {
      setText("tv-book", (m.imbalance >= 0 ? "+" : "") + m.imbalance.toFixed(3)); Charts.depth($("tc-book"), m.bid_depth, m.ask_depth);
      pushHist("funding", m.funding * 100); setText("tv-funding", pct(m.funding * 100, 4)); Charts.spark($("tc-funding"), hist.funding, Charts.C.prior);
      pushHist("spread", m.spread); setText("tv-spread", money(m.spread, 2)); Charts.spark($("tc-spread"), hist.spread, Charts.C.taker);
      pushHist("oi", m.oi); setText("tv-oi", (m.oi / 1000).toFixed(1) + "K BTC"); Charts.spark($("tc-oi"), hist.oi, Charts.C.kelly);
      pushHist("basis", m.mark - m.index); setText("tv-basis", smoney(m.mark - m.index, 2)); Charts.spark($("tc-basis"), hist.basis, Charts.C.edge);
      pushHist("atr", m.atr); setText("tv-atr", money(m.atr) + " · " + ((m.atr / m.last) * 100).toFixed(2) + "%"); Charts.spark($("tc-atr"), hist.atr, Charts.C.closer);
    }

    // PnL
    const eq = L.equity || 0, seed = L.seed || 1, roi = L.roi || 0;
    $("pnlChip").textContent = s.mode.toUpperCase(); $("pnlChip").classList.toggle("live", s.mode === "live");
    setNum("pnlRun", roi, pct(roi));
    setText("pnlSub", `BTCUSDT · ${s.mode.toUpperCase()} BOOK · SIX AGENTS · ${L.n || 0} SETTLED`);
    const big = $("pnlBig"); big.textContent = money(eq); big.className = "pnl-big " + (eq > seed ? "" : eq < seed ? "neg" : "flat");
    const dc = $("pnlDelta"), lp = L.last_pnl || 0;
    dc.textContent = (lp > 0 ? "▲ " : lp < 0 ? "▼ " : "■ ") + smoney(lp, 2); dc.className = "delta-chip num " + (lp > 0 ? "" : lp < 0 ? "neg" : "flat");
    setText("pnlDeltaLbl", L.last_label || "NO SETTLEMENT YET");
    setNum("pnlRoi", roi, pct(roi, 3)); setText("pnlSeed", money(seed));
    setText("pnlWin", L.n ? (L.win_rate * 100).toFixed(1) + "%" : "–"); setNum("pnlEdge", L.avg_edge || 0, L.n ? scents(L.avg_edge) : "–");
    setText("pnlDD", ((L.max_dd || 0) * 100).toFixed(1) + "%");
    const eqr = Charts.equity($("equity"), L.history, seed);
    const tag = $("eqTag"); tag.textContent = money(eq); tag.classList.toggle("neg", eq < seed); if (eqr) tag.style.top = Math.max(0, eqr.y - 8) + "px";
    if (mo.p_up != null) {
      bar("bias-dir", mo.p_up, `${Math.round(mo.p_up * 100)}% UP / ${Math.round((1 - mo.p_up) * 100)}% DN`);
      bar("bias-conf", mo.confidence, `${Math.round(mo.confidence * 100)}%`);
      bar("bias-book", (m.imbalance + 1) / 2, `${Math.round(((m.imbalance + 1) / 2) * 100)}% BID`);
    }

    // candles
    const cr = Charts.candles($("candles"), s.candles_1m, { tickets: recent, last: m.last });
    setText("candleRight", `RSI 14 · ${m.rsi14 != null ? m.rsi14.toFixed(1) : "–"} · Z ${m.z != null ? (m.z >= 0 ? "+" : "") + m.z.toFixed(2) : "–"} · SIGNALS ${cr ? cr.signals : 0}`);

    // analog
    Charts.analog($("analog"), an);
    setText("analogRight", `DTW ${an.ready ? an.dtw.toFixed(3) : "–"} · SCAN ${(an.scanned || 0).toLocaleString()}`);
    setText("anMatch", an.ready ? an.match.toFixed(2) : "–"); setText("anUp", an.ready ? an.up : "–"); setText("anDown", an.ready ? an.down : "–");
    setNum("anMed", an.median_bps || 0, an.ready ? (an.median_bps >= 0 ? "+" : "") + an.median_bps.toFixed(1) + "bp" : "–");
    setText("anHor", (an.horizon || 24) + " BARS");

    // log + tape
    renderLog(s.log || []);
    // footer
    setText("footState", !s.online ? "STREAM LOST" : s.paused ? "PAUSED" : s.halted ? "GUARD" : "ONLINE");
    $("dotFoot").className = "dot" + (!s.online ? " off" : s.paused || s.halted ? " warn" : "");
    setText("footMode", `${s.mode.toUpperCase()} BOOK · SETTLES AT HORIZON · ${s.risk.horizon_bars * 15}M`);
    if (first) fillRisk(s.risk);
  }

  function bar(id, v, txt) { $(id).style.setProperty("--p", Math.max(0, Math.min(1, v)).toFixed(3)); setText(id + "-v", txt); }
  function nextScan() { const d = new Date(); const ms = 15 * 60000; return new Date(Math.ceil(d.getTime() / ms) * ms).toISOString().slice(11, 16); }
  function deskNote(k, s) {
    const d = s.desks[k]; if (d.note && d.state !== "idle" && d.state !== "done") return d.note;
    const m = s.market || {}, mo = s.model || {}, an = s.analog || {}, L = s.ledger || {};
    switch (k) {
      case "spotter": return m.rsi14 != null ? `RSI ${m.rsi14.toFixed(0)} · VOL Z ${(m.vol_z >= 0 ? "+" : "") + m.vol_z.toFixed(1)}` : "WAITING FOR TAPE";
      case "prior": return an.ready ? `ANALOG ${an.up}↑ ${an.down}↓ · MATCH ${an.match.toFixed(2)}` : "SCANNING HISTORY";
      case "edge": return mo.p_up != null ? `MODEL ${cents(mo.p_up)} VS BOOK ${cents(mo.p_market)}` : "–";
      case "kelly": return mo.kelly ? `CAP BY ${mo.kelly.binding.toUpperCase()} · NOTCH ${L.dd_notch}/10` : "–";
      case "taker": return `${s.mode.toUpperCase()} BROKER · SPREAD ${m.spread != null ? money(m.spread, 2) : "–"}`;
      case "closer": return `${(s.tickets.open || []).filter((t) => t.status === "open").length} HOLDING · ${L.wins || 0}W ${L.losses || 0}L`;
    }
    return "";
  }
  function deskMetric(k, s) {
    const m = s.market || {}, mo = s.model || {}, L = s.ledger || {};
    switch (k) {
      case "spotter": return m.z != null ? `Z ${(m.z >= 0 ? "+" : "") + m.z.toFixed(2)}` : "–";
      case "prior": return mo.p_up != null ? `P(UP) ${cents(mo.p_up)}` : "–";
      case "edge": return mo.edge_cents != null ? scents(mo.edge_cents) : "–";
      case "kelly": return mo.kelly ? money(mo.kelly.notional) : "–";
      case "taker": return `${s.handoffs_per_min}/MIN`;
      case "closer": return L.n ? `WIN ${(L.win_rate * 100).toFixed(0)}%` : "NO SETTLEMENTS";
    }
    return "";
  }

  function renderLog(log) {
    const last = log.length ? log[log.length - 1].ts : 0;
    if (last === lastLogTs) return;
    const newest = log.slice().reverse();
    if (lastLogTs) newest.filter((e) => e.ts > lastLogTs && e.action === "RESEARCH").forEach((e) => Floor.pulse(e.agent));
    lastLogTs = last;
    const el = $("log");
    if (!newest.length) { el.innerHTML = `<li class="log-empty">THE FIRST TICKET WRITES THE FIRST LINE</li>`; }
    else el.innerHTML = newest.slice(0, 60).map((e) => {
      const amt = e.amount || "", cls = amt.startsWith("+") ? "up" : amt.startsWith("-") ? "down" : "";
      const time = new Date(e.ts * 1000).toISOString().slice(11, 19);
      return `<li style="--c:var(--${e.agent === "core" ? "core" : e.agent})" title="${time} UTC"><i></i><span class="ag">${e.agent.toUpperCase()}</span><span class="ac">${e.action}</span><span class="am ${cls}">${amt}</span><span class="tx">${esc(e.text)}</span></li>`;
    }).join("");
    setText("logRight", `${log.length} ENTRIES · ${new Date(last * 1000).toISOString().slice(11, 19)} UTC`);
    const tapeItems = newest.slice(0, 14).map((e) => {
      const amt = e.amount ? `<span class="amt ${e.amount.startsWith("+") ? "up" : e.amount.startsWith("-") ? "down" : ""}">${e.amount}</span> ` : "";
      return `<span class="tp"><b style="color:var(--${e.agent === "core" ? "core" : e.agent})">${e.agent.toUpperCase()}</b> ${amt}${esc(e.text)}</span>`;
    }).join("");
    const key = tapeItems.length + ":" + last;
    if (key !== lastTapeKey) { lastTapeKey = key; $("tapeTrack").innerHTML = tapeItems + tapeItems; }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function setSwarm() {
    const b = $("btnSwarm"), lbl = $("swarmLabel");
    const connected = ws && ws.readyState === 1;
    b.className = "swarm" + (!connected ? " off" : S && S.paused ? " paused" : S && S.halted ? " halted" : "");
    lbl.textContent = !connected ? "ENGINE OFFLINE" : !S ? "CONNECTING" : S.paused ? "SWARM PAUSED" : S.halted ? "GUARD ACTIVE" : S.online ? "SWARM ONLINE" : "STREAM LOST";
    b.title = connected ? (S && S.paused ? "Resume the swarm" : "Pause the swarm (open tickets still settle)") : "Engine not reachable";
  }

  /* ---------------- clock ---------------- */
  const tick = () => setText("clock", new Date().toISOString().slice(11, 19));
  tick(); setInterval(tick, 1000);

  /* ---------------- controls ---------------- */
  const post = async (url, body) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || r.statusText);
    return j;
  };
  $("btnSwarm").addEventListener("click", () => S && post("/api/control", { action: S.paused ? "resume" : "pause" }).catch(alertErr));
  $("btnApprovals").addEventListener("click", () => S && post("/api/control", { action: "approvals", value: !S.approvals_only }).catch(alertErr));
  $("btnApprove").addEventListener("click", () => post("/api/control", { action: "approve", ticket_id: $("deck").dataset.id }).catch(alertErr));
  $("btnReject").addEventListener("click", () => post("/api/control", { action: "reject", ticket_id: $("deck").dataset.id }).catch(alertErr));
  $("btnScan").addEventListener("click", () => post("/api/control", { action: "scan" }).then(() => msg("SCAN QUEUED")).catch(alertErr));
  $("modeChip").addEventListener("click", () => {
    if (!S) return;
    if (!S.has_keys) { openDrawer(); msg("ADD API KEYS TO .env FOR LIVE MODE", true); return; }
    const to = S.mode === "paper" ? "live" : "paper";
    if (to === "live" && !window.confirm("Switch to LIVE? Real orders will be placed on Bybit after the engine restarts.")) return;
    post("/api/control", { action: "mode", value: to }).then(() => { openDrawer(); msg(`MODE ${to.toUpperCase()} SAVED · RESTART ENGINE`); }).catch(alertErr);
  });
  function alertErr(e) { msg(String(e.message || e).toUpperCase(), true); openDrawer(); }
  function msg(t, err) { const el = $("riskMsg"); el.textContent = t; el.className = "risk-msg" + (err ? " err" : ""); clearTimeout(msg.t); msg.t = setTimeout(() => (el.textContent = ""), 5000); }

  // nav
  document.querySelectorAll(".nav a").forEach((a) => a.addEventListener("click", (e) => {
    document.querySelectorAll(".nav a").forEach((x) => x.classList.toggle("on", x === a));
    const h = a.getAttribute("href");
    if (h === "#book") { e.preventDefault(); openDrawer(); }
    if (h === "#tape") { e.preventDefault(); $("tape-log").scrollIntoView({ behavior: "smooth", block: "start" }); }
  }));
  $("tgFit").addEventListener("click", () => setLayout("fit"));
  $("tgWide").addEventListener("click", () => setLayout("wide"));
  function setLayout(mode) {
    document.body.classList.toggle("fit", mode === "fit"); document.body.classList.toggle("wide", mode === "wide");
    $("tgFit").classList.toggle("on", mode === "fit"); $("tgWide").classList.toggle("on", mode === "wide");
    try { localStorage.setItem("btcdesk.layout", mode); } catch (e) { /* storage unavailable */ }
  }
  let layoutPref = "fit"; try { layoutPref = localStorage.getItem("btcdesk.layout") || "fit"; } catch (e) { /* ignore */ }
  setLayout(layoutPref);

  // drawer
  function openDrawer() { $("drawer").hidden = false; $("drawer").querySelector("input").focus(); }
  $("drawerClose").addEventListener("click", () => ($("drawer").hidden = true));
  document.addEventListener("keydown", (e) => e.key === "Escape" && ($("drawer").hidden = true));
  function fillRisk(r) { const f = $("riskForm"); Object.keys(r).forEach((k) => { if (f.elements[k]) f.elements[k].value = r[k]; }); }
  $("riskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target, risk = {};
    Array.from(f.elements).forEach((i) => { if (i.name) risk[i.name] = i.name.includes("tickets") || i.name.includes("bars") ? parseInt(i.value, 10) : parseFloat(i.value); });
    post("/api/settings", { risk }).then(() => msg("LIMITS SAVED · ENFORCED FROM THE NEXT TICKET")).catch(alertErr);
  });

  window.addEventListener("resize", () => S && render(S));
})();
