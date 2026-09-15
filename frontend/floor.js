/* THE OFFICE — six agent stations on glowing platforms around the core, energy beams routing every ticket. */
window.Floor = (() => {
  const ORDER = ["spotter", "prior", "edge", "kelly", "taker", "closer"];
  const ANGLE = { spotter: -128, prior: -52, edge: -2, kelly: 52, taker: 128, closer: 182 };
  const COLOR = { spotter: "#22e0a0", prior: "#ffa03a", edge: "#ff3d8f", kelly: "#a05cff", taker: "#3d8bff", closer: "#ff4b3a" };
  const CYAN = "#35b6ff", CYAN2 = "#7fe0ff", INK = "#e7ebf2", MUTED = "#7d8798", DIM = "#4d5666", GREEN = "#22c55e", RED = "#ef4444", AMBER = "#f5b942";
  const FONT = "Archivo, system-ui, sans-serif";
  const L = (k, p) => (window.I18N ? window.I18N.t(k, p) : k);
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let canvas, ctx, W = 0, H = 0, dpr = 1, scale = 1, realW = 0, raf = 0, t0 = performance.now();
  const desks = {};
  const flights = [];
  let S = null, holder = "spotter", coreState = "idle", online = false, lastTick = 0;
  const ticks = [];   // deterministic background "data" marks

  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const lighten = (hex, k = 80) => { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.min(255, ((n >> 16) & 255) + k)},${Math.min(255, ((n >> 8) & 255) + k)},${Math.min(255, (n & 255) + k)})`; };

  function init(el) {
    canvas = el; ctx = canvas.getContext("2d");
    ORDER.forEach((n) => (desks[n] = { x: 0, y: 0, state: "idle", progress: 0, history: [], pulse: 0, gauge: 0 }));
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let i = 0; i < 90; i++) ticks.push({ x: rnd(), y: rnd(), w: 2 + rnd() * 12, h: 1 + rnd() * 2, a: 0.08 + rnd() * 0.3, v: 0.002 + rnd() * 0.006, c: rnd() < 0.2 });
    const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement);
    window.addEventListener("resize", resize);
    resize();
    document.addEventListener("visibilitychange", () => (document.hidden ? cancelAnimationFrame(raf) : loop()));
    loop();
  }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    realW = Math.max(1, Math.round(r.width)); const realH = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(realW * dpr); canvas.height = Math.round(realH * dpr);
    canvas.style.width = realW + "px"; canvas.style.height = realH + "px";
    scale = realW < 620 ? 0.62 : realW < 1000 ? 0.82 : 1;
    W = realW / scale; H = realH / scale;
    layout();
  }
  function layout() {
    const cx = W / 2, cy = H * 0.5 + 6, rx = Math.min(W * 0.27, 400), ry = Math.min(H * 0.30, 165);
    ORDER.forEach((n) => { const a = (ANGLE[n] * Math.PI) / 180; desks[n].x = cx + Math.cos(a) * rx; desks[n].y = cy + Math.sin(a) * ry; });
  }

  function update(state) {
    S = state; online = !!state.online;
    holder = state.stage ? state.stage.holder : holder;
    ORDER.forEach((n) => {
      const d = state.desks[n]; if (!d) return;
      const me = desks[n];
      if (d.state === "run" && me.state !== "run") me.pulse = 1;
      me.state = d.state; me.progress = d.progress; me.history = d.history || []; me.gauge = d.gauge;
    });
    const open = state.tickets && state.tickets.open ? state.tickets.open.length : 0;
    coreState = state.paused ? "paused" : state.halted ? "guard" : open ? "routing" : "idle";
    lastTick = performance.now();
  }
  function flight(from, to, color) {
    if (!desks[from] || !desks[to]) return;
    flights.push({ from, to, color: color || COLOR[to], t0: performance.now(), dur: reduced ? 1 : 1400 });
    if (flights.length > 12) flights.shift();
  }
  function pulse(name) { if (desks[name]) desks[name].pulse = 1; }

  /* ---------------- primitives ---------------- */
  function ellipse(x, y, rx, ry, fill, stroke, lw = 1, dash) {
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { if (dash) ctx.setLineDash(dash); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]); }
  }
  function rrect(x, y, w, h, r, fill, stroke, lw = 1) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function text(s, x, y, color, size = 7, align = "left", weight = 700, ls = 0.12) {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = ls + "em";
    ctx.fillText(s, x, y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0em";
  }
  function glow(color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
  function noGlow() { ctx.shadowBlur = 0; ctx.shadowColor = "transparent"; }
  const P = (cx, cy, u, v, z = 0) => [cx + u * 0.87 - v * 0.87, cy + u * 0.5 + v * 0.5 - z];
  function poly(pts, fill, stroke, lw = 1) {
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function isoBox(cx, cy, a, b, h, top, left, right, edge) {
    const A = P(cx, cy, -a / 2, -b / 2), B = P(cx, cy, a / 2, -b / 2), C = P(cx, cy, a / 2, b / 2), D = P(cx, cy, -a / 2, b / 2);
    poly([D, C, [C[0], C[1] + h], [D[0], D[1] + h]], left, edge);
    poly([B, C, [C[0], C[1] + h], [B[0], B[1] + h]], right, edge);
    poly([A, B, C, D], top, edge);
  }
  function spark(x, y, w, h, data, color) {
    if (!data || data.length < 2) return;
    let lo = Math.min(...data), hi = Math.max(...data); if (hi === lo) { hi += 1; lo -= 1; }
    ctx.beginPath();
    data.forEach((v, i) => { const px = x + (i / (data.length - 1)) * w, py = y + h - ((v - lo) / (hi - lo)) * h; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.lineJoin = "round"; ctx.stroke();
  }

  /* ---------------- background ---------------- */
  function drawBackground(t) {
    const cx = W / 2, cy = H * 0.5 + 6;
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.7);
    g.addColorStop(0, "#08122a"); g.addColorStop(0.45, "#050a17"); g.addColorStop(1, "#03050a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // fine tech grid
    ctx.strokeStyle = "rgba(60,120,220,0.06)"; ctx.lineWidth = 1;
    for (let x = (cx % 40); x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
    for (let y = (cy % 40); y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
    // concentric perspective rings
    const spin = reduced ? 0 : t * 0.00003;
    for (let i = 1; i <= 7; i++) {
      const rx = 110 + i * 105, ry = rx * 0.40, a = 0.26 - i * 0.03;
      ellipse(cx, cy, rx, ry, null, `rgba(60,140,255,${a})`, i % 3 === 0 ? 1.5 : 1);
      if (i % 2) { ctx.save(); ctx.lineDashOffset = -(t * 0.01 * (i % 4 ? 1 : -1)); ellipse(cx, cy, rx - 14, (rx - 14) * 0.40, null, `rgba(90,190,255,${a + 0.08})`, 2, [40, 60]); ctx.restore(); }
    }
    // radial spokes
    ctx.strokeStyle = "rgba(60,140,255,0.08)";
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + spin;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 120, cy + Math.sin(a) * 48); ctx.lineTo(cx + Math.cos(a) * 900, cy + Math.sin(a) * 360); ctx.stroke();
    }
    // drifting data ticks
    ticks.forEach((p) => {
      if (!reduced) { p.x += p.v * 0.004; if (p.x > 1.02) p.x = -0.02; }
      ctx.fillStyle = p.c ? `rgba(127,224,255,${p.a})` : `rgba(60,140,255,${p.a})`;
      ctx.fillRect(p.x * W, p.y * H, p.w, p.h);
    });
  }

  /* ---------------- core ---------------- */
  function drawCore(t) {
    const cx = W / 2, cy = H * 0.5 + 6;
    const busy = coreState === "routing";
    const col = coreState === "paused" ? AMBER : coreState === "guard" ? RED : CYAN;
    // energy plane
    const pg = ctx.createRadialGradient(cx, cy, 10, cx, cy, 230);
    pg.addColorStop(0, hexA(col, 0.35)); pg.addColorStop(0.5, hexA(col, 0.10)); pg.addColorStop(1, hexA(col, 0));
    ellipse(cx, cy + 6, 240, 92, pg);
    [[150, 58, 0.9, 2.5], [120, 46, 0.55, 1.5], [92, 35, 0.8, 2], [66, 25, 0.5, 1]].forEach(([rx, ry, a, lw], i) => {
      ctx.save(); glow(col, 14); ctx.lineDashOffset = -(t * 0.03 * (i % 2 ? -1 : 1)); ellipse(cx, cy + 6, rx, ry, null, hexA(col, a), lw, i % 2 ? [18, 10] : [3, 5]); ctx.restore();
    });
    // tick ring
    ctx.save(); ctx.strokeStyle = hexA(CYAN2, 0.7); ctx.lineWidth = 1.5;
    for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2 + (reduced ? 0 : t * 0.0004); const r1 = 168, r2 = k % 6 ? 176 : 184; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + 6 + Math.sin(a) * r1 * 0.39); ctx.lineTo(cx + Math.cos(a) * r2, cy + 6 + Math.sin(a) * r2 * 0.39); ctx.stroke(); }
    ctx.restore();
    // pillar of light
    const lg = ctx.createLinearGradient(cx, cy - 150, cx, cy + 10);
    lg.addColorStop(0, hexA(col, 0)); lg.addColorStop(1, hexA(col, 0.22));
    ctx.fillStyle = lg; ctx.fillRect(cx - 34, cy - 150, 68, 160);
    // orb
    const bob = reduced ? 0 : Math.sin(t * 0.0016) * 3;
    const oy = cy - 46 + bob, R = 44;
    ctx.save(); glow(col, busy ? 60 : 40);
    ctx.beginPath(); ctx.arc(cx, oy, R + 8, 0, Math.PI * 2); ctx.strokeStyle = hexA(col, 0.55); ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.lineDashOffset = reduced ? 0 : -(t * 0.05); ctx.setLineDash([14, 22]); ctx.beginPath(); ctx.arc(cx, oy, R + 18, 0, Math.PI * 2); ctx.strokeStyle = hexA(CYAN2, 0.5); ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    ctx.save(); glow("#ffffff", 34);
    const og = ctx.createRadialGradient(cx - R * 0.3, oy - R * 0.35, R * 0.1, cx, oy, R);
    og.addColorStop(0, "#ffffff"); og.addColorStop(0.75, "#eef5ff"); og.addColorStop(1, "#bfe3ff");
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(cx, oy, R, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    const mark = coreState === "paused" ? "#a0741a" : coreState === "guard" ? "#7a2a1c" : "#0b1220";
    ctx.strokeStyle = mark; ctx.lineWidth = R * 0.16; ctx.lineCap = "round";
    const rot = busy && !reduced ? t * 0.0025 : -0.6;
    ctx.beginPath(); ctx.arc(cx, oy, R * 0.42, rot + 0.5, rot + Math.PI * 2 - 0.5); ctx.stroke();
    ctx.fillStyle = mark; ctx.beginPath(); ctx.arc(cx, oy, R * 0.14, 0, Math.PI * 2); ctx.fill();
    // plate + engine line
    ctx.save(); glow(col, 10);
    rrect(cx - 46, cy + 26, 92, 20, 4, "rgba(6,10,20,0.92)", hexA(col, 0.8), 1); ctx.restore();
    text(L("fl_core"), cx, cy + 36.5, INK, 8.5, "center", 800, 0.16);
    text(L("fl_engine"), cx, cy + 58, hexA(CYAN2, 0.9), 7, "center", 800, 0.18);
    if (S && S.model && S.model.p_up != null) {
      const mo = S.model, up = mo.edge_cents >= 0;
      text(`${L("mvb_fair")} ${(mo.p_up * 100).toFixed(1)}¢  ·  ${L("mvb_book")} ${(mo.p_market * 100).toFixed(1)}¢  ·  ${L("mvb_edge")} `, cx - 16, cy + 74, MUTED, 7, "right", 700, 0.1);
      text(`${mo.edge_cents >= 0 ? "+" : ""}${mo.edge_cents.toFixed(1)}¢ ${window.I18N ? I18N.dir(mo.direction) : mo.direction}`, cx - 12, cy + 74, up ? GREEN : RED, 7.5, "left", 800, 0.1);
    }
  }

  /* ---------------- stations ---------------- */
  function drawBeam(n, t) {
    const d = desks[n], cx = W / 2, cy = H * 0.5 + 6, col = COLOR[n];
    const active = holder === n && coreState === "routing", run = d.state === "run";
    const x1 = d.x, y1 = d.y + 14, x2 = cx, y2 = cy + 6;
    const g = ctx.createLinearGradient(x1, y1, x2, y2); g.addColorStop(0, hexA(col, active || run ? 0.95 : 0.55)); g.addColorStop(1, hexA(CYAN2, 0.85));
    ctx.save(); glow(col, active || run ? 18 : 10);
    ctx.strokeStyle = g; ctx.lineWidth = active || run ? 3.5 : 2.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.setLineDash([6, 10]); ctx.lineDashOffset = reduced ? 0 : -(t * 0.08); ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
    // particles riding the beam toward the core
    const k = active || run ? 4 : 2;
    for (let i = 0; i < k; i++) {
      const u = reduced ? (i + 0.5) / k : ((t * 0.00025 + i / k + ORDER.indexOf(n) * 0.17) % 1);
      const px = x1 + (x2 - x1) * u, py = y1 + (y2 - y1) * u;
      ctx.save(); glow(col, 10); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }

  function cardMetrics(n) {
    if (!S) return [["–", "–"], ["–", "–"]];
    const m = S.market || {}, mo = S.model || {}, an = S.analog || {}, Lg = S.ledger || {}, open = (S.tickets && S.tickets.open) || [];
    const c = (p) => (p * 100).toFixed(1) + "¢";
    switch (n) {
      case "spotter": return [["RSI 14", m.rsi14 != null ? m.rsi14.toFixed(1) : "–"], ["VOL Z", m.vol_z != null ? (m.vol_z >= 0 ? "+" : "") + m.vol_z.toFixed(2) : "–"]];
      case "prior": return [["P(UP)", mo.p_up != null ? c(mo.p_up) : "–"], ["MATCH", an.ready ? Math.round(an.match * 100) + "%" : "–"]];
      case "edge": return [["EDGE", mo.edge_cents != null ? (mo.edge_cents >= 0 ? "+" : "") + mo.edge_cents.toFixed(1) + "¢" : "–"], ["BOOK", mo.p_market != null ? c(mo.p_market) : "–"]];
      case "kelly": return [["STAKE", mo.kelly ? "$" + Math.round(mo.kelly.notional).toLocaleString("en-US") : "–"], ["NOTCH", (Lg.dd_notch || 0) + "/10"]];
      case "taker": return [["SPREAD", m.spread != null ? "$" + m.spread.toFixed(2) : "–"], ["OPEN", open.filter((x) => x.status === "open").length + "/" + ((S.risk && S.risk.max_open_tickets) || 5)]];
      case "closer": return [["WIN", Lg.n ? (Lg.win_rate * 100).toFixed(0) + "%" : "–"], ["HOLD", open.filter((x) => x.status === "open").length]];
    }
    return [];
  }

  function drawStation(n, t) {
    const d = desks[n], col = COLOR[n], run = d.state === "run", deck = d.state === "on_deck";
    const x = d.x, y = d.y;
    d.pulse = Math.max(0, d.pulse - 0.012);
    const hot = run || deck || d.pulse > 0;
    // platform
    const pg = ctx.createRadialGradient(x, y + 18, 4, x, y + 18, 90);
    pg.addColorStop(0, hexA(col, 0.32 + d.pulse * 0.3)); pg.addColorStop(1, hexA(col, 0));
    ellipse(x, y + 18, 96, 38, pg);
    ellipse(x, y + 18, 64, 25, "rgba(5,8,16,0.9)");
    ctx.save(); glow(col, hot ? 22 : 12);
    ellipse(x, y + 18, 64, 25, null, hexA(col, 0.95), 2.5);
    ctx.lineDashOffset = reduced ? 0 : -(t * 0.03); ellipse(x, y + 18, 52, 20, null, hexA(col, 0.55), 1.5, [10, 8]);
    ellipse(x, y + 18, 38, 14.5, null, hexA(col, 0.4), 1);
    ctx.restore();
    ellipse(x, y + 18, 26, 10, hexA(col, 0.18));
    // server blocks
    isoBox(x - 4, y + 6, 26, 20, 26, "#111a2c", "#0a1020", "#0d1526", hexA(col, 0.75));
    isoBox(x + 16, y + 12, 16, 14, 16, "#111a2c", "#0a1020", "#0d1526", hexA(col, 0.55));
    for (let k = 0; k < 4; k++) { ctx.fillStyle = k % 2 ? hexA(col, 0.9) : hexA(CYAN2, 0.8); ctx.fillRect(x - 13, y + 8 + k * 5, 6, 1.5); }
    // holo screen
    ctx.save(); glow(col, 8); rrect(x - 44, y - 30, 22, 28, 2, hexA(col, 0.10), hexA(col, 0.55), 1); ctx.restore();
    spark(x - 41, y - 26, 16, 10, d.history.slice(-10), hexA(col, 0.9));
    for (let k = 0; k < 3; k++) { ctx.fillStyle = hexA(col, 0.5); ctx.fillRect(x - 41, y - 12 + k * 4, 10 + k * 3, 1.2); }
    // icon
    const bob = reduced ? 0 : Math.sin(t * 0.0022 + ORDER.indexOf(n) * 1.3) * 4;
    const ox = x, oy = y - 66 + bob, R = 24;
    ctx.save(); glow(col, hot ? 36 : 24);
    ctx.beginPath(); ctx.arc(ox, oy, R + 6, 0, Math.PI * 2); ctx.strokeStyle = hexA(col, 0.55); ctx.lineWidth = 2; ctx.stroke();
    const ig = ctx.createRadialGradient(ox - 8, oy - 9, 2, ox, oy, R);
    ig.addColorStop(0, lighten(col, 90)); ig.addColorStop(1, col);
    ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ox, oy, R, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(ox - 15 * 1.4, oy - 15 * 1.4); ctx.scale(1.4, 1.4); drawGlyph(n); ctx.restore();
    if (run) { ctx.beginPath(); ctx.arc(ox, oy, R + 12 + Math.sin(t * 0.006) * 2, 0, Math.PI * 2); ctx.strokeStyle = hexA(col, 0.45); ctx.lineWidth = 1; ctx.stroke(); }
    // light column between icon and platform
    const cg = ctx.createLinearGradient(x, oy + R, x, y + 10); cg.addColorStop(0, hexA(col, 0.25)); cg.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = cg; ctx.fillRect(x - 14, oy + R, 28, y + 10 - (oy + R));
    if (deck) text(L("fl_deck"), ox, oy - R - 16, AMBER, 7, "center", 800, 0.16);
    if (scale < 0.8) { text(n.toUpperCase(), x, y + 50, col, 7, "center", 800, 0.16); return; }
    // data card
    const low = n === "taker" || n === "kelly";   // bottom stations keep their card clear of the core plate
    const cw = 186, ch = 78, cxr = x + 62, cyr = low ? y - 22 : y - 78;
    ctx.save(); glow(col, 10);
    rrect(cxr, cyr, cw, ch, 6, "rgba(6,10,20,0.86)", hexA(col, 0.6), 1); ctx.restore();
    ctx.fillStyle = hexA(col, 0.9); ctx.fillRect(cxr, cyr + 8, 2, 14);
    text(n.toUpperCase(), cxr + 12, cyr + 15, col, 10, "left", 800, 0.14);
    spark(cxr + cw - 62, cyr + 8, 50, 16, d.history.slice(-24), hexA(col, 0.9));
    const rows = cardMetrics(n);
    rows.forEach(([k, v], i) => { text(k, cxr + 12, cyr + 34 + i * 14, MUTED, 7, "left", 700, 0.14); text(String(v), cxr + 78, cyr + 34 + i * 14, INK, 8, "left", 800, 0.06); });
    const st = !online ? L("si_lost") : d.state === "idle" ? L("fl_online") : L("state_" + d.state);
    const stc = !online ? RED : d.state === "on_deck" ? AMBER : GREEN;
    text(L("fl_status"), cxr + 12, cyr + 64, MUTED, 7, "left", 700, 0.14);
    text(st, cxr + 78, cyr + 64, stc, 8, "left", 800, 0.12);
    ctx.save(); glow(stc, 8); ctx.fillStyle = stc; ctx.beginPath(); ctx.arc(cxr + cw - 12, cyr + 64, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  function drawGlyph(n) {
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
    switch (n) {
      case "spotter": ctx.arc(13.5, 13.5, 4.2, 0, Math.PI * 2); ctx.moveTo(16.8, 16.8); ctx.lineTo(21, 21); break;
      case "prior": ctx.moveTo(8, 20); ctx.bezierCurveTo(11, 20, 12, 9, 15, 9); ctx.bezierCurveTo(18, 9, 19, 20, 22, 20); break;
      case "edge": ctx.moveTo(8, 19); ctx.lineTo(14, 19); ctx.lineTo(14, 11); ctx.lineTo(21, 11); break;
      case "kelly": ctx.moveTo(10, 20); ctx.lineTo(10, 15); ctx.moveTo(15, 20); ctx.lineTo(15, 10); ctx.moveTo(20, 20); ctx.lineTo(20, 13); break;
      case "taker": ctx.moveTo(9, 15); ctx.lineTo(21, 15); ctx.moveTo(16.5, 10.5); ctx.lineTo(21, 15); ctx.lineTo(16.5, 19.5); break;
      case "closer": ctx.moveTo(9, 15.5); ctx.lineTo(13.5, 20); ctx.lineTo(21, 10.5); break;
    }
    ctx.stroke();
  }

  /* ---------------- ticket flights ---------------- */
  function drawFlights(t) {
    const cx = W / 2, cy = H * 0.5 + 6;
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i], u = (t - f.t0) / f.dur;
      if (u >= 1.3) { flights.splice(i, 1); continue; }
      const A = [desks[f.from].x, desks[f.from].y + 14], C = [cx, cy + 6], B = [desks[f.to].x, desks[f.to].y + 14];
      let p; if (u < 0.5) { const v = u * 2; p = [A[0] + (C[0] - A[0]) * v, A[1] + (C[1] - A[1]) * v]; } else if (u < 1) { const v = (u - 0.5) * 2; p = [C[0] + (B[0] - C[0]) * v, C[1] + (B[1] - C[1]) * v]; } else p = B;
      const alpha = u < 1 ? 1 : 1 - (u - 1) / 0.3;
      ctx.save(); ctx.globalAlpha = alpha; glow(f.color, 18);
      ctx.fillStyle = f.color; ctx.beginPath(); ctx.roundRect(p[0] - 8, p[1] - 5, 16, 10, 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillRect(p[0] - 5, p[1] - 2, 9, 1.5); ctx.fillRect(p[0] - 5, p[1] + 1, 6, 1.5);
      ctx.restore();
    }
  }

  /* ---------------- HUD ---------------- */
  function drawHUD() {
    if (scale < 0.8) return;
    const m = (S && S.market) || {}, Lg = (S && S.ledger) || {}, mo = (S && S.model) || {}, risk = (S && S.risk) || {};
    // top-left: identity + pipeline verbs
    text("BTC DESK", 16, 20, INK, 11, "left", 800, 0.12);
    text(L("fl_network"), 16, 34, hexA(CYAN2, 0.9), 7, "left", 800, 0.18);
    const verbs = ["spotter", "prior", "edge", "kelly", "taker", "closer"];
    verbs.forEach((k, i) => {
      const on = S && S.stage && S.stage.holder === k && coreState === "routing";
      text(L("fl_verb_" + k), 16, 58 + i * 13, on ? COLOR[k] : DIM, 7.5, "left", 800, 0.16);
      if (on) { ctx.fillStyle = COLOR[k]; ctx.fillRect(8, 56 + i * 13, 3, 4); }
    });
    // top-right: system status bars
    const rx = W - 16;
    text(L("fl_sysstatus"), rx, 20, MUTED, 7, "right", 800, 0.18);
    const ok = online && !(S && S.paused) && !(S && S.halted);
    const stTxt = !online ? L("si_lost") : S && S.paused ? L("swarm_paused") : S && S.halted ? L("swarm_guard") : L("fl_allonline");
    ctx.save(); glow(ok ? GREEN : AMBER, 8); ctx.fillStyle = ok ? GREEN : AMBER; ctx.beginPath(); ctx.arc(rx - ctx.measureText(stTxt).width - 60, 34, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    text(stTxt, rx, 34, ok ? GREEN : AMBER, 8, "right", 800, 0.14);
    const tot = (m.bid_depth || 0) + (m.ask_depth || 0);
    const bars = [
      [L("fl_bar_book"), tot ? (m.bid_depth / tot) : 0],
      [L("fl_bar_tickets"), S ? ((S.tickets.open || []).length / (risk.max_open_tickets || 5)) : 0],
      [L("fl_bar_dd"), risk.daily_drawdown_guard ? (Lg.dd_now || 0) / risk.daily_drawdown_guard : 0],
      [L("fl_bar_stake"), mo.kelly && Lg.equity ? mo.kelly.notional / (Lg.equity * (risk.max_leverage || 3)) : 0],
    ];
    bars.forEach(([k, v], i) => {
      const y = 56 + i * 15, bx = rx - 130, bw = 88, p = Math.max(0, Math.min(1, v));
      text(k, bx - 8, y, MUTED, 7, "right", 700, 0.14);
      ctx.fillStyle = "rgba(60,140,255,0.18)"; ctx.fillRect(bx, y - 2, bw, 3);
      ctx.save(); glow(CYAN, 6); ctx.fillStyle = CYAN; ctx.fillRect(bx, y - 2, bw * p, 3); ctx.restore();
      text(Math.round(p * 100) + "%", rx, y, INK, 7.5, "right", 800, 0.06);
    });
    // bottom-left: live price trace
    const closes = S && S.candles_1m ? S.candles_1m.slice(-60).map((r) => r[4]) : [];
    ctx.save(); glow(CYAN, 8); spark(16, H - 84, 150, 30, closes, hexA(CYAN2, 0.95)); ctx.restore();
    text(L("fl_realtime"), 16, H - 44, hexA(CYAN2, 0.95), 8, "left", 800, 0.14);
    text(L("fl_tagline"), 16, H - 32, MUTED, 7, "left", 700, 0.14);
    // bottom-right: telemetry list
    const rows = [
      [L("tele_funding"), m.funding != null ? (m.funding * 100 >= 0 ? "+" : "") + (m.funding * 100).toFixed(4) + "%" : "–"],
      [L("tele_spread"), m.spread != null ? "$" + m.spread.toFixed(2) : "–"],
      [L("tele_oi"), m.oi != null ? (m.oi / 1000).toFixed(1) + "K BTC" : "–"],
      [L("tele_atr"), m.atr != null ? "$" + Math.round(m.atr) + " · " + ((m.atr / (m.last || 1)) * 100).toFixed(2) + "%" : "–"],
    ];
    rows.forEach(([k, v], i) => { const y = H - 80 + i * 14; text(k, rx - 78, y, MUTED, 7, "right", 700, 0.14); text(v, rx, y, INK, 8, "right", 800, 0.06); });
  }

  function drawStatus() {
    if (!online || performance.now() - lastTick > 15000) {
      ctx.fillStyle = "rgba(3,5,10,0.45)"; ctx.fillRect(0, 0, W, H);
      text(L(online ? "fl_waiting" : "fl_offline"), W / 2, H * 0.5 + 100, RED, 8, "center", 800, 0.18);
    }
  }

  function loop() {
    cancelAnimationFrame(raf);
    const frame = () => {
      const t = performance.now() - t0;
      if (W <= 1 || H <= 1 || Math.abs(canvas.parentElement.clientWidth - realW) > 2) resize();
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      drawBackground(t);
      ORDER.forEach((n) => drawBeam(n, t));
      const items = ORDER.map((n) => ({ y: desks[n].y, fn: () => drawStation(n, t) }));
      items.push({ y: H * 0.5 - 1, fn: () => drawCore(t) });
      items.sort((a, b) => a.y - b.y).forEach((i) => i.fn());
      drawFlights(t);
      drawHUD();
      drawStatus();
      noGlow();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  return { init, update, flight, pulse, ORDER, COLOR };
})();
