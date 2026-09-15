/* THE OFFICE — six agent stations on luminous platforms around the core, energy beams routing every ticket.
   Rendering notes: glow is layered additive strokes (no shadowBlur, which is the slowest thing a 2D canvas can do);
   the static floor (rings, grid, spokes, glyph field) is rendered once to an offscreen canvas and re-used;
   the loop is capped at 30 fps; the canvas is backed at devicePixelRatio (max 2) so text stays sharp. */
window.Floor = (() => {
  const ORDER = ["spotter", "prior", "edge", "kelly", "taker", "closer"];
  const ANGLE = { spotter: -128, prior: -52, edge: -2, kelly: 52, taker: 128, closer: 182 };
  const COLOR = { spotter: "#22e6a4", prior: "#ffa63c", edge: "#ff3d8f", kelly: "#a35cff", taker: "#3f8dff", closer: "#ff4b3a" };
  const CYAN = "#35b6ff", CYAN2 = "#8ff0ff", BLUE = "#2f6dff", INK = "#eaf0f8", MUTED = "#8a95a8", GREEN = "#2df07a", RED = "#ff4d4d", AMBER = "#f5b942";
  const FONT = "Archivo, system-ui, sans-serif";
  const TS = 1.3; // global text scale
  const FRAME_MS = 1000 / 30;
  const L = (k, p) => (window.I18N ? window.I18N.t(k, p) : k);
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let canvas, ctx, W = 0, H = 0, dpr = 1, scale = 1, realW = 0, realH = 0, portrait = false, raf = 0, t0 = performance.now(), lastFrame = 0;
  let bg = null, bgCtx = null, bgStamp = -1;
  const desks = {};
  const flights = [];
  let S = null, holder = "spotter", coreState = "idle", online = false, lastTick = 0;
  const marks = [];
  const arcs = [];

  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const lighten = (hex, k = 80) => { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.min(255, ((n >> 16) & 255) + k)},${Math.min(255, ((n >> 8) & 255) + k)},${Math.min(255, (n & 255) + k)})`; };
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

  function init(el) {
    canvas = el; ctx = canvas.getContext("2d");
    bg = document.createElement("canvas"); bgCtx = bg.getContext("2d");
    ORDER.forEach((n) => (desks[n] = { x: 0, y: 0, state: "idle", progress: 0, history: [], pulse: 0, gauge: 0 }));
    for (let i = 0; i < 140; i++) marks.push({ x: rnd(), y: rnd(), kind: Math.floor(rnd() * 4), s: 0.6 + rnd() * 1.4, a: 0.15 + rnd() * 0.45, c: rnd() < 0.35 });
    for (let i = 0; i < 26; i++) arcs.push({ ring: 1 + Math.floor(rnd() * 8), a0: rnd() * Math.PI * 2, len: 0.2 + rnd() * 1.2, w: 1 + rnd() * 3, speed: (rnd() - 0.5) * 0.0004, a: 0.25 + rnd() * 0.55 });
    const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement);
    window.addEventListener("resize", resize);
    resize();
    document.addEventListener("visibilitychange", () => (document.hidden ? cancelAnimationFrame(raf) : loop()));
    loop();
  }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    realW = Math.max(1, Math.round(r.width)); realH = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(realW * dpr); canvas.height = Math.round(realH * dpr);
    canvas.style.width = realW + "px"; canvas.style.height = realH + "px";
    bg.width = canvas.width; bg.height = canvas.height;
    portrait = realH > realW * 0.95;
    scale = portrait ? 0.78 : realW < 1000 ? 0.82 : 1;
    W = realW / scale; H = realH / scale;
    bgStamp = -1;
    layout();
  }
  function layout() {
    const cx = W / 2, cy = H * 0.5 + (portrait ? 0 : 4);
    const rx = portrait ? W * 0.33 : Math.min(W * 0.245, 400), ry = portrait ? H * 0.34 : Math.min(H * 0.30, 170);
    const ANG = portrait ? { spotter: -118, prior: -62, edge: -8, kelly: 62, taker: 118, closer: 188 } : ANGLE;
    ORDER.forEach((n) => { const a = (ANG[n] * Math.PI) / 180; desks[n].x = cx + Math.cos(a) * rx; desks[n].y = cy + Math.sin(a) * ry; });
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

  /* ---------------- primitives (all take the context they draw on) ---------------- */
  const CX = () => W / 2, CY = () => H * 0.5 + (portrait ? 0 : 4), RATIO = () => (portrait ? 0.6 : 0.4);
  function ellipse(c, x, y, rx, ry, fill, stroke, lw = 1, dash) {
    c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { if (dash) c.setLineDash(dash); c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); if (dash) c.setLineDash([]); }
  }
  /** Additive "neon" ellipse: wide faint halo, mid halo, bright core. Cheap stand-in for shadowBlur. */
  function neonEllipse(c, x, y, rx, ry, color, a, lw, dash) {
    c.globalCompositeOperation = "lighter";
    if (dash) c.setLineDash(dash);
    c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
    c.strokeStyle = hexA(color, a * 0.10); c.lineWidth = lw + 14; c.stroke();
    c.strokeStyle = hexA(color, a * 0.25); c.lineWidth = lw + 5; c.stroke();
    c.strokeStyle = hexA(color, a); c.lineWidth = lw; c.stroke();
    if (dash) c.setLineDash([]);
    c.globalCompositeOperation = "source-over";
  }
  function neonLine(c, x1, y1, x2, y2, color, a, lw) {
    c.globalCompositeOperation = "lighter";
    c.lineCap = "round"; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.strokeStyle = hexA(color, a * 0.10); c.lineWidth = lw + 18; c.stroke();
    c.strokeStyle = hexA(color, a * 0.28); c.lineWidth = lw + 7; c.stroke();
    c.strokeStyle = hexA(color, a); c.lineWidth = lw; c.stroke();
    c.globalCompositeOperation = "source-over";
  }
  function neonCircle(c, x, y, r, color, a, lw) {
    c.globalCompositeOperation = "lighter";
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    c.strokeStyle = hexA(color, a * 0.12); c.lineWidth = lw + 14; c.stroke();
    c.strokeStyle = hexA(color, a * 0.3); c.lineWidth = lw + 5; c.stroke();
    c.strokeStyle = hexA(color, a); c.lineWidth = lw; c.stroke();
    c.globalCompositeOperation = "source-over";
  }
  function rrect(c, x, y, w, h, r, fill, stroke, lw = 1) {
    c.beginPath(); c.roundRect(x, y, w, h, r);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  function neonRect(c, x, y, w, h, r, color, a) {
    c.globalCompositeOperation = "lighter";
    c.beginPath(); c.roundRect(x, y, w, h, r);
    c.strokeStyle = hexA(color, a * 0.12); c.lineWidth = 10; c.stroke();
    c.strokeStyle = hexA(color, a * 0.3); c.lineWidth = 4; c.stroke();
    c.globalCompositeOperation = "source-over";
    c.strokeStyle = hexA(color, a); c.lineWidth = 1.4; c.stroke();
  }
  function text(c, s, x, y, color, size = 7, align = "left", weight = 700, ls = 0.12) {
    c.font = `${weight} ${Math.round(size * TS * 10) / 10}px ${FONT}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = "middle";
    if ("letterSpacing" in c) c.letterSpacing = ls + "em";
    c.fillText(s, x, y);
    if ("letterSpacing" in c) c.letterSpacing = "0em";
  }
  const P = (cx, cy, u, v, z = 0) => [cx + u * 0.87 - v * 0.87, cy + u * 0.5 + v * 0.5 - z];
  function poly(c, pts, fill, stroke, lw = 1) {
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  function isoBox(c, cx, cy, a, b, h, top, left, right, edge, lw = 1) {
    const A = P(cx, cy, -a / 2, -b / 2), B = P(cx, cy, a / 2, -b / 2), C = P(cx, cy, a / 2, b / 2), D = P(cx, cy, -a / 2, b / 2);
    poly(c, [D, C, [C[0], C[1] + h], [D[0], D[1] + h]], left, edge, lw);
    poly(c, [B, C, [C[0], C[1] + h], [B[0], B[1] + h]], right, edge, lw);
    poly(c, [A, B, C, D], top, edge, lw);
  }
  function spark(c, x, y, w, h, data, color, lw = 1.4) {
    if (!data || data.length < 2) return;
    let lo = Math.min(...data), hi = Math.max(...data); if (hi === lo) { hi += 1; lo -= 1; }
    c.beginPath();
    data.forEach((v, i) => { const px = x + (i / (data.length - 1)) * w, py = y + h - ((v - lo) / (hi - lo)) * h; i ? c.lineTo(px, py) : c.moveTo(px, py); });
    c.strokeStyle = color; c.lineWidth = lw; c.lineJoin = "round"; c.stroke();
  }
  function radialGlow(c, x, y, r, color, a0, ry = 1) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(color, a0)); g.addColorStop(0.5, hexA(color, a0 * 0.35)); g.addColorStop(1, hexA(color, 0));
    c.save(); c.globalCompositeOperation = "lighter"; c.translate(x, y); c.scale(1, ry); c.translate(-x, -y);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.restore();
  }

  /* ---------------- static floor, rendered to the offscreen canvas ---------------- */
  function renderBackground(t) {
    const c = bgCtx, cx = CX(), cy = CY(), R = RATIO();
    c.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    const g = c.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.75);
    g.addColorStop(0, "#0a1738"); g.addColorStop(0.35, "#061027"); g.addColorStop(0.7, "#040915"); g.addColorStop(1, "#02040a");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = "rgba(70,130,230,0.07)"; c.lineWidth = 1;
    for (let x = cx % 36; x < W; x += 36) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = cy % 36; y < H; y += 36) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
    c.globalCompositeOperation = "lighter";
    const hz = c.createLinearGradient(0, cy - 90, 0, cy + 90);
    hz.addColorStop(0, "rgba(40,110,255,0)"); hz.addColorStop(0.5, "rgba(50,140,255,0.16)"); hz.addColorStop(1, "rgba(40,110,255,0)");
    c.fillStyle = hz; c.fillRect(0, cy - 90, W, 180);
    const base = portrait ? W * 0.16 : 150, step = portrait ? W * 0.11 : 95;
    for (let i = 1; i <= 9; i++) {
      const rx = base + i * step, ry = rx * R, a = Math.max(0.06, 0.34 - i * 0.032);
      ellipse(c, cx, cy, rx, ry, null, `rgba(70,150,255,${a})`, i % 3 === 0 ? 1.6 : 1);
      if (i % 2 === 0) ellipse(c, cx, cy, rx - 8, (rx - 8) * R, null, `rgba(120,200,255,${a * 0.7})`, 1, [2, 6]);
    }
    arcs.forEach((s) => {
      const rx = base + s.ring * step, ry = rx * R, a0 = s.a0 + (reduced ? 0 : t * s.speed);
      c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, a0, a0 + s.len);
      c.strokeStyle = `rgba(110,200,255,${s.a * 0.25})`; c.lineWidth = s.w + 8; c.stroke();
      c.strokeStyle = `rgba(110,200,255,${s.a})`; c.lineWidth = s.w; c.stroke();
    });
    c.strokeStyle = "rgba(70,150,255,0.10)"; c.lineWidth = 1;
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * base, cy + Math.sin(a) * base * R); c.lineTo(cx + Math.cos(a) * (base + 9.5 * step), cy + Math.sin(a) * (base + 9.5 * step) * R); c.stroke();
    }
    marks.forEach((m) => {
      const x = m.x * W, y = m.y * H, col = m.c ? CYAN2 : BLUE;
      c.fillStyle = hexA(col, m.a); c.strokeStyle = hexA(col, m.a); c.lineWidth = 1.2;
      if (m.kind === 0) c.fillRect(x, y, 10 * m.s, 1.6);
      else if (m.kind === 1) { c.beginPath(); c.arc(x, y, 1.4 * m.s, 0, Math.PI * 2); c.fill(); }
      else if (m.kind === 2) { c.beginPath(); c.moveTo(x, y - 3 * m.s); c.lineTo(x + 3 * m.s, y); c.lineTo(x, y + 3 * m.s); c.stroke(); }
      else { c.fillRect(x, y, 1.6, 8 * m.s); c.fillRect(x + 4, y + 2, 1.6, 5 * m.s); }
    });
    // the core's luminous platform is static too
    const col = CYAN, k = portrait ? 0.72 : 1;
    radialGlow(c, cx, cy + 8, 260 * k, col, 0.5, R);
    radialGlow(c, cx, cy + 8, 120 * k, "#9fe8ff", 0.5, R);
    for (let j = 0; j < 12; j++) {
      const a = (j / 12) * Math.PI * 2;
      const lg = c.createLinearGradient(cx, cy + 8, cx + Math.cos(a) * 200 * k, cy + 8 + Math.sin(a) * 200 * k * R);
      lg.addColorStop(0, hexA(col, 0.5)); lg.addColorStop(1, hexA(col, 0));
      c.globalCompositeOperation = "lighter"; c.strokeStyle = lg; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cx, cy + 8); c.lineTo(cx + Math.cos(a) * 200 * k, cy + 8 + Math.sin(a) * 200 * k * R); c.stroke();
    }
    const st = c.createLinearGradient(cx - 300 * k, 0, cx + 300 * k, 0);
    st.addColorStop(0, hexA(col, 0)); st.addColorStop(0.5, hexA(col, 0.7)); st.addColorStop(1, hexA(col, 0));
    c.fillStyle = st; c.fillRect(cx - 300 * k, cy + 7, 600 * k, 2);
    // station platform halos
    ORDER.forEach((n) => radialGlow(c, desks[n].x, desks[n].y + 18, 150 * (portrait ? 0.8 : 1), COLOR[n], 0.32, 0.38));
    c.globalCompositeOperation = "source-over";
  }

  /* ---------------- core (dynamic part) ---------------- */
  function drawCore(t) {
    const c = ctx, cx = CX(), cy = CY(), R = RATIO();
    const busy = coreState === "routing";
    const col = coreState === "paused" ? AMBER : coreState === "guard" ? RED : CYAN;
    const k = portrait ? 0.72 : 1;
    const rings = [[215, 0.95, 3, null], [190, 0.55, 1.2, [26, 14]], [165, 0.9, 2.2, [3, 6]], [140, 0.5, 1, null], [112, 1, 3, [26, 14]], [90, 0.6, 1.2, [3, 6]], [70, 0.9, 2, null]];
    rings.forEach(([rx, a, lw, dash], i) => {
      c.lineDashOffset = reduced ? 0 : -(t * 0.02 * (i % 2 ? -1 : 1));
      neonEllipse(c, cx, cy + 8, rx * k, rx * k * R, col, a, lw, dash);
    });
    c.lineDashOffset = 0;
    c.globalCompositeOperation = "lighter"; c.strokeStyle = hexA(CYAN2, 0.9); c.lineWidth = 1.5;
    for (let j = 0; j < 48; j++) {
      const a = (j / 48) * Math.PI * 2 + (reduced ? 0 : t * 0.0003);
      const r1 = 222 * k, r2 = (j % 8 ? 230 : 240) * k;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, cy + 8 + Math.sin(a) * r1 * R); c.lineTo(cx + Math.cos(a) * r2, cy + 8 + Math.sin(a) * r2 * R); c.stroke();
    }
    const pil = c.createLinearGradient(cx, cy - 190 * k, cx, cy + 8);
    pil.addColorStop(0, hexA(col, 0)); pil.addColorStop(0.6, hexA(col, 0.35)); pil.addColorStop(1, hexA(col, 0.8));
    c.fillStyle = pil; c.fillRect(cx - 2, cy - 190 * k, 4, 198 * k);
    c.globalCompositeOperation = "source-over";
    // the orb
    const bob = reduced ? 0 : Math.sin(t * 0.0016) * 3;
    const oy = cy - 48 * k + bob, OR = 54 * k;
    radialGlow(c, cx, oy, OR * 2.4, col, busy ? 0.9 : 0.7);
    neonCircle(c, cx, oy, OR + 10, col, 0.9, 3);
    c.globalCompositeOperation = "lighter"; c.lineDashOffset = reduced ? 0 : -(t * 0.05); c.setLineDash([16, 22]);
    c.beginPath(); c.arc(cx, oy, OR + 22, 0, Math.PI * 2); c.strokeStyle = hexA(CYAN2, 0.7); c.lineWidth = 2; c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
    c.globalCompositeOperation = "source-over";
    const og = c.createRadialGradient(cx - OR * 0.3, oy - OR * 0.35, OR * 0.1, cx, oy, OR);
    og.addColorStop(0, "#ffffff"); og.addColorStop(0.8, "#f2f8ff"); og.addColorStop(1, "#cfe9ff");
    c.fillStyle = og; c.beginPath(); c.arc(cx, oy, OR, 0, Math.PI * 2); c.fill();
    const mark = coreState === "paused" ? "#8a6210" : coreState === "guard" ? "#7a2a1c" : "#07101f";
    c.strokeStyle = mark; c.lineWidth = OR * 0.2; c.lineCap = "round";
    const rot = busy && !reduced ? t * 0.0025 : -0.6;
    c.beginPath(); c.arc(cx, oy, OR * 0.44, rot + 0.55, rot + Math.PI * 2 - 0.55); c.stroke();
    c.fillStyle = mark; c.beginPath(); c.arc(cx, oy, OR * 0.15, 0, Math.PI * 2); c.fill();
    // plates
    rrect(c, cx - 64 * k, cy + 30 * k, 128 * k, 26 * k, 5, "rgba(4,9,20,0.95)"); neonRect(c, cx - 64 * k, cy + 30 * k, 128 * k, 26 * k, 5, col, 0.9);
    text(c, L("fl_core"), cx, cy + 43 * k, INK, 9.5 * k, "center", 800, 0.18);
    text(c, L("fl_engine"), cx, cy + 70 * k, hexA(CYAN2, 0.95), 7.5 * k, "center", 800, 0.2);
    if (S && S.model && S.model.p_up != null && !portrait) {
      const mo = S.model, up = mo.edge_cents >= 0;
      text(c, `${L("mvb_fair")} ${(mo.p_up * 100).toFixed(1)}¢   ${L("mvb_book")} ${(mo.p_market * 100).toFixed(1)}¢   ${L("mvb_edge")}`, cx - 14, cy + 86, MUTED, 7, "right", 700, 0.1);
      text(c, `${mo.edge_cents >= 0 ? "+" : ""}${mo.edge_cents.toFixed(1)}¢ ${window.I18N ? I18N.dir(mo.direction) : mo.direction}`, cx - 10, cy + 86, up ? GREEN : RED, 7.5, "left", 800, 0.1);
    }
  }

  /* ---------------- beams ---------------- */
  function drawBeam(n, t) {
    const c = ctx, d = desks[n], cx = CX(), cy = CY(), col = COLOR[n];
    const active = holder === n && coreState === "routing", run = d.state === "run", hot = active || run;
    const x1 = d.x, y1 = d.y + 16, x2 = cx, y2 = cy + 8;
    neonLine(c, x1, y1, x2, y2, col, hot ? 0.95 : 0.75, hot ? 6 : 4.5);
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = "rgba(255,255,255,0.8)"; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.setLineDash([10, 14]); c.lineDashOffset = reduced ? 0 : -(t * 0.09); c.strokeStyle = hexA(lighten(col, 60), 0.9); c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
    const k = hot ? 5 : 3;
    for (let i = 0; i < k; i++) {
      const u = reduced ? (i + 0.5) / k : ((t * 0.00022 + i / k + ORDER.indexOf(n) * 0.17) % 1);
      const px = x1 + (x2 - x1) * u, py = y1 + (y2 - y1) * u;
      c.fillStyle = hexA(col, 0.5); c.beginPath(); c.arc(px, py, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#fff"; c.beginPath(); c.arc(px, py, 1.8, 0, Math.PI * 2); c.fill();
    }
    c.globalCompositeOperation = "source-over";
  }

  /* ---------------- stations ---------------- */
  function cardMetrics(n) {
    if (!S) return [["–", "–"], ["–", "–"]];
    const m = S.market || {}, mo = S.model || {}, an = S.analog || {}, Lg = S.ledger || {}, open = (S.tickets && S.tickets.open) || [];
    const cc = (p) => (p * 100).toFixed(1) + "¢";
    switch (n) {
      case "spotter": return [["RSI 14", m.rsi14 != null ? m.rsi14.toFixed(1) : "–"], ["VOL Z", m.vol_z != null ? (m.vol_z >= 0 ? "+" : "") + m.vol_z.toFixed(2) : "–"]];
      case "prior": return [["P(UP)", mo.p_up != null ? cc(mo.p_up) : "–"], ["MATCH", an.ready ? Math.round(an.match * 100) + "%" : "–"]];
      case "edge": return [["EDGE", mo.edge_cents != null ? (mo.edge_cents >= 0 ? "+" : "") + mo.edge_cents.toFixed(1) + "¢" : "–"], ["BOOK", mo.p_market != null ? cc(mo.p_market) : "–"]];
      case "kelly": return [["STAKE", mo.kelly ? "$" + Math.round(mo.kelly.notional).toLocaleString("en-US") : "–"], ["NOTCH", (Lg.dd_notch || 0) + "/10"]];
      case "taker": return [["SPREAD", m.spread != null ? "$" + m.spread.toFixed(2) : "–"], ["OPEN", open.filter((x) => x.status === "open").length + "/" + ((S.risk && S.risk.max_open_tickets) || 5)]];
      case "closer": return [["WIN", Lg.n ? (Lg.win_rate * 100).toFixed(0) + "%" : "–"], ["HOLD", open.filter((x) => x.status === "open").length]];
    }
    return [];
  }

  function drawPlatform(x, y, col, hot, pulseA, t) {
    const c = ctx, R = 0.38, rx = 74, k = portrait ? 0.8 : 1;
    if (pulseA > 0) radialGlow(c, x, y + 18, 150 * k, col, pulseA * 0.4, R);
    ellipse(c, x, y + 18, rx * k, rx * k * R, "rgba(4,8,18,0.92)");
    const rings = [[rx, 1, 3.5, null], [rx - 12, 0.7, 1.5, [10, 8]], [rx - 24, 0.95, 2.2, null], [rx - 38, 0.6, 1.2, [3, 5]], [rx - 52, 0.9, 1.8, null]];
    rings.forEach(([r, a, lw, dash], i) => {
      c.lineDashOffset = reduced ? 0 : -(t * 0.03 * (i % 2 ? -1 : 1));
      neonEllipse(c, x, y + 18, r * k, r * k * R, col, hot ? a : a * 0.85, lw, dash);
    });
    c.lineDashOffset = 0;
    c.globalCompositeOperation = "lighter"; c.strokeStyle = hexA(lighten(col, 60), 0.9); c.lineWidth = 1.3;
    for (let j = 0; j < 24; j++) {
      const a = (j / 24) * Math.PI * 2;
      c.beginPath(); c.moveTo(x + Math.cos(a) * (rx + 4) * k, y + 18 + Math.sin(a) * (rx + 4) * k * R); c.lineTo(x + Math.cos(a) * (rx + (j % 4 ? 8 : 13)) * k, y + 18 + Math.sin(a) * (rx + (j % 4 ? 8 : 13)) * k * R); c.stroke();
    }
    c.globalCompositeOperation = "source-over";
    ellipse(c, x, y + 18, 20 * k, 20 * k * R, hexA(col, 0.45));
  }

  function drawRack(x, y, col) {
    const c = ctx, k = portrait ? 0.8 : 1;
    isoBox(c, x - 6 * k, y + 4, 30 * k, 22 * k, 30 * k, "#0f1a30", "#070d1c", "#0a1224", hexA(col, 0.85), 1.2);
    isoBox(c, x + 18 * k, y + 12, 16 * k, 14 * k, 18 * k, "#0f1a30", "#070d1c", "#0a1224", hexA(col, 0.6), 1);
    isoBox(c, x - 30 * k, y + 14, 14 * k, 12 * k, 12 * k, "#0f1a30", "#070d1c", "#0a1224", hexA(col, 0.5), 1);
    c.globalCompositeOperation = "lighter";
    for (let j = 0; j < 5; j++) { c.fillStyle = j % 2 ? hexA(col, 0.95) : hexA(CYAN2, 0.85); c.fillRect(x - 17 * k, y + 8 + j * 5, 8 * k, 1.6); c.fillStyle = hexA(col, 0.5); c.fillRect(x - 6 * k, y + 8 + j * 5, 3 * k, 1.6); }
    [[-40, 0.9, 26], [-46, 0.5, 14], [34, 0.7, 20]].forEach(([dx, a, h]) => {
      const lg = c.createLinearGradient(0, y - 10 - h, 0, y - 10); lg.addColorStop(0, hexA(col, 0)); lg.addColorStop(1, hexA(col, a));
      c.fillStyle = lg; c.fillRect(x + dx * k, y - 10 - h, 2, h);
      c.fillStyle = hexA(col, a); c.fillRect(x + dx * k - 2, y - 11, 6, 2);
    });
    c.globalCompositeOperation = "source-over";
    rrect(c, x - 52 * k, y - 34, 24 * k, 30, 2, hexA(col, 0.12), hexA(col, 0.7), 1);
  }

  function drawIcon(n, ox, oy, R, hot, t) {
    const c = ctx, col = COLOR[n];
    radialGlow(c, ox, oy, R * 2.4, col, hot ? 0.9 : 0.7);
    neonCircle(c, ox, oy, R + 6, col, 0.9, 2.5);
    const ig = c.createRadialGradient(ox - R * 0.3, oy - R * 0.35, R * 0.1, ox, oy, R);
    ig.addColorStop(0, lighten(col, 70)); ig.addColorStop(0.7, col); ig.addColorStop(1, hexA(col, 0.9));
    c.fillStyle = ig; c.beginPath(); c.arc(ox, oy, R, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(ox, oy, R - 3, 0, Math.PI * 2); c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1; c.stroke();
    const s = (R / 15) * 0.9;
    c.save(); c.translate(ox - 15 * s, oy - 15 * s); c.scale(s, s); drawGlyph(n); c.restore();
    if (hot) neonCircle(c, ox, oy, R + 14 + Math.sin(t * 0.006) * 2, col, 0.6, 1.2);
  }

  function drawCard(n, x, y, cw, ch) {
    const c = ctx, d = desks[n], col = COLOR[n];
    rrect(c, x, y, cw, ch, 7, "rgba(3,7,16,0.86)"); neonRect(c, x, y, cw, ch, 7, col, 0.85);
    text(c, n.toUpperCase(), x + 16, y + 20, col, 12, "left", 800, 0.16);
    c.fillStyle = hexA(col, 0.9); c.fillRect(x + 16, y + 32, 52, 1.8);
    c.globalCompositeOperation = "lighter"; spark(c, x + cw - 66, y + 12, 52, 20, d.history.slice(-24), hexA(lighten(col, 30), 0.95), 1.6); c.globalCompositeOperation = "source-over";
    const rows = cardMetrics(n);
    rows.forEach(([k, v], i) => { text(c, k, x + 16, y + 50 + i * 19, MUTED, 8, "left", 700, 0.16); text(c, String(v), x + 96, y + 50 + i * 19, INK, 9, "left", 800, 0.06); });
    const st = !online ? L("si_lost") : d.state === "idle" ? L("fl_online") : L("state_" + d.state);
    const stc = !online ? RED : d.state === "on_deck" ? AMBER : GREEN;
    text(c, L("fl_status"), x + 16, y + ch - 17, MUTED, 8, "left", 700, 0.16);
    text(c, st, x + 96, y + ch - 17, stc, 9, "left", 800, 0.14);
    radialGlow(c, x + cw - 18, y + ch - 17, 9, stc, 0.9);
    c.fillStyle = stc; c.beginPath(); c.arc(x + cw - 18, y + ch - 17, 3.2, 0, Math.PI * 2); c.fill();
  }

  function drawStation(n, t) {
    const c = ctx, d = desks[n], col = COLOR[n], run = d.state === "run", deck = d.state === "on_deck";
    const x = d.x, y = d.y;
    d.pulse = Math.max(0, d.pulse - 0.02);
    const hot = run || deck || d.pulse > 0;
    drawPlatform(x, y, col, hot, d.pulse, t);
    drawRack(x, y, col);
    const bob = reduced ? 0 : Math.sin(t * 0.0022 + ORDER.indexOf(n) * 1.3) * 4;
    const R = portrait ? 22 : 30, oy = y - (portrait ? 64 : 84) + bob;
    c.globalCompositeOperation = "lighter";
    const cg = c.createLinearGradient(x, oy + R, x, y + 10); cg.addColorStop(0, hexA(col, 0.35)); cg.addColorStop(1, hexA(col, 0));
    c.fillStyle = cg; c.fillRect(x - 16, oy + R, 32, y + 10 - (oy + R));
    c.globalCompositeOperation = "source-over";
    drawIcon(n, x, oy, R, hot, t);
    if (deck) text(c, L("fl_deck"), x, oy - R - 16, AMBER, 7, "center", 800, 0.16);
    if (portrait) {
      const rows = cardMetrics(n);
      rrect(c, x - 58, y + 46, 116, 40, 5, "rgba(3,7,16,0.9)"); neonRect(c, x - 58, y + 46, 116, 40, 5, col, 0.8);
      text(c, n.toUpperCase(), x, y + 58, col, 8.5, "center", 800, 0.16);
      if (rows[0]) text(c, rows[0][0] + "  " + rows[0][1], x, y + 75, INK, 7.5, "center", 800, 0.06);
      return;
    }
    const low = n === "taker" || n === "kelly", left = n === "spotter" || n === "taker" || n === "closer";
    const cw = 206, ch = 112, cxr = left ? x - 78 - cw : x + 78, cyr = low ? y - 56 : n === "spotter" ? y - 40 : y - 112;
    drawCard(n, cxr, cyr, cw, ch);
  }

  function drawGlyph(n) {
    const c = ctx;
    c.strokeStyle = "#fff"; c.lineWidth = 2.8; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath();
    switch (n) {
      case "spotter": c.arc(13.5, 13.5, 4.4, 0, Math.PI * 2); c.moveTo(16.9, 16.9); c.lineTo(21.5, 21.5); break;
      case "prior": c.moveTo(8, 20); c.bezierCurveTo(11, 20, 12, 9, 15, 9); c.bezierCurveTo(18, 9, 19, 20, 22, 20); break;
      case "edge": c.moveTo(8, 19); c.lineTo(14, 19); c.lineTo(14, 11); c.lineTo(21, 11); break;
      case "kelly": c.moveTo(10, 20); c.lineTo(10, 15); c.moveTo(15, 20); c.lineTo(15, 10); c.moveTo(20, 20); c.lineTo(20, 13); break;
      case "taker": c.moveTo(9, 15); c.lineTo(21, 15); c.moveTo(16.5, 10.5); c.lineTo(21, 15); c.lineTo(16.5, 19.5); break;
      case "closer": c.moveTo(9, 15.5); c.lineTo(13.5, 20); c.lineTo(21, 10.5); break;
    }
    c.stroke();
  }

  /* ---------------- ticket flights ---------------- */
  function drawFlights(t) {
    const c = ctx, cx = CX(), cy = CY();
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i], u = (t - f.t0) / f.dur;
      if (u >= 1.3) { flights.splice(i, 1); continue; }
      const A = [desks[f.from].x, desks[f.from].y + 16], C = [cx, cy + 8], B = [desks[f.to].x, desks[f.to].y + 16];
      let p; if (u < 0.5) { const v = u * 2; p = [A[0] + (C[0] - A[0]) * v, A[1] + (C[1] - A[1]) * v]; } else if (u < 1) { const v = (u - 0.5) * 2; p = [C[0] + (B[0] - C[0]) * v, C[1] + (B[1] - C[1]) * v]; } else p = B;
      const alpha = u < 1 ? 1 : 1 - (u - 1) / 0.3;
      c.save(); c.globalAlpha = alpha; radialGlow(c, p[0], p[1], 22, f.color, 0.9);
      c.fillStyle = f.color; c.beginPath(); c.roundRect(p[0] - 9, p[1] - 6, 18, 12, 2); c.fill();
      c.fillStyle = "rgba(255,255,255,0.95)"; c.fillRect(p[0] - 6, p[1] - 3, 10, 1.6); c.fillRect(p[0] - 6, p[1] + 1, 7, 1.6);
      c.restore();
    }
  }

  /* ---------------- HUD ---------------- */
  function drawHUD() {
    const c = ctx, m = (S && S.market) || {}, Lg = (S && S.ledger) || {}, mo = (S && S.model) || {}, risk = (S && S.risk) || {};
    const ok = online && !(S && S.paused) && !(S && S.halted);
    const stTxt = !online ? L("si_lost") : S && S.paused ? L("swarm_paused") : S && S.halted ? L("swarm_guard") : L("fl_allonline");
    const closes = S && S.candles_1m ? S.candles_1m.slice(-60).map((r) => r[4]) : [];
    if (portrait) {
      text(c, "BTC DESK", 14, 18, INK, 10, "left", 800, 0.12);
      text(c, L("fl_network"), 14, 31, hexA(CYAN2, 0.9), 6.5, "left", 800, 0.16);
      c.fillStyle = ok ? GREEN : AMBER; c.beginPath(); c.arc(W - 14 - c.measureText(stTxt).width - 10, 18, 2.5, 0, Math.PI * 2); c.fill();
      text(c, stTxt, W - 14, 18, ok ? GREEN : AMBER, 7.5, "right", 800, 0.14);
      c.globalCompositeOperation = "lighter"; spark(c, 14, H - 52, 110, 22, closes, hexA(CYAN2, 0.95)); c.globalCompositeOperation = "source-over";
      text(c, L("fl_realtime"), 14, H - 22, hexA(CYAN2, 0.95), 6.5, "left", 800, 0.14);
      const chg = m.chg24 || 0;
      text(c, "BTCUSDT", W - 14, H - 46, MUTED, 6.5, "right", 700, 0.14);
      text(c, m.last ? "$" + m.last.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "–", W - 14, H - 32, INK, 9, "right", 800, 0.04);
      text(c, (chg >= 0 ? "+" : "") + chg.toFixed(2) + "% " + L("h24"), W - 14, H - 18, chg >= 0 ? GREEN : RED, 7, "right", 800, 0.08);
      return;
    }
    if (scale < 0.8) return;
    c.fillStyle = CYAN2; c.beginPath(); c.moveTo(18, 30); c.lineTo(28, 10); c.lineTo(38, 30); c.lineTo(28, 24); c.closePath(); c.fill();
    text(c, "BTC DESK", 48, 16, INK, 13, "left", 800, 0.12);
    text(c, L("fl_network"), 48, 31, hexA(CYAN2, 0.95), 7.5, "left", 800, 0.2);
    ORDER.forEach((k, i) => {
      const on = S && S.stage && S.stage.holder === k && coreState === "routing";
      text(c, L("fl_verb_" + k), 20, 64 + i * 17, on ? COLOR[k] : hexA(CYAN2, 0.55), 8, "left", 800, 0.18);
      if (on) { radialGlow(c, 12, 64 + i * 17, 8, COLOR[k], 0.9); c.fillStyle = COLOR[k]; c.fillRect(9, 62 + i * 17, 3, 4); }
    });
    const rx = W - 18;
    c.strokeStyle = hexA(CYAN2, 0.6); c.lineWidth = 1; c.beginPath(); c.moveTo(rx - 230, 12); c.lineTo(rx, 12); c.lineTo(rx, 140); c.stroke();
    text(c, L("fl_sysstatus"), rx, 24, hexA(CYAN2, 0.9), 7.5, "right", 800, 0.2);
    radialGlow(c, rx - c.measureText(stTxt).width - 70, 40, 9, ok ? GREEN : AMBER, 0.9);
    c.fillStyle = ok ? GREEN : AMBER; c.beginPath(); c.arc(rx - c.measureText(stTxt).width - 70, 40, 2.8, 0, Math.PI * 2); c.fill();
    text(c, stTxt, rx, 40, ok ? GREEN : AMBER, 9, "right", 800, 0.16);
    const tot = (m.bid_depth || 0) + (m.ask_depth || 0);
    const bars = [
      [L("fl_bar_book"), tot ? (m.bid_depth / tot) : 0],
      [L("fl_bar_tickets"), S ? ((S.tickets.open || []).length / (risk.max_open_tickets || 5)) : 0],
      [L("fl_bar_dd"), risk.daily_drawdown_guard ? (Lg.dd_now || 0) / risk.daily_drawdown_guard : 0],
      [L("fl_bar_stake"), mo.kelly && Lg.equity ? mo.kelly.notional / (Lg.equity * (risk.max_leverage || 3)) : 0],
    ];
    bars.forEach(([k, v], i) => {
      const y = 66 + i * 19, bx = rx - 130, bw = 80, p = Math.max(0, Math.min(1, v));
      text(c, k, bx - 10, y, MUTED, 7.5, "right", 700, 0.16);
      c.fillStyle = "rgba(60,140,255,0.22)"; c.fillRect(bx, y - 2, bw, 4);
      c.globalCompositeOperation = "lighter"; c.fillStyle = hexA(CYAN2, 0.35); c.fillRect(bx - 2, y - 4, bw * p + 4, 8); c.fillStyle = CYAN2; c.fillRect(bx, y - 2, bw * p, 4); c.globalCompositeOperation = "source-over";
      text(c, Math.round(p * 100) + "%", rx, y, INK, 8, "right", 800, 0.06);
    });
    c.globalCompositeOperation = "lighter"; spark(c, 18, H - 96, 170, 34, closes, hexA(CYAN2, 0.95), 1.6); c.globalCompositeOperation = "source-over";
    text(c, L("fl_realtime"), 18, H - 50, hexA(CYAN2, 0.95), 9, "left", 800, 0.16);
    text(c, L("fl_tagline"), 18, H - 36, hexA(CYAN2, 0.65), 7.5, "left", 700, 0.16);
    c.strokeStyle = hexA(CYAN2, 0.6); c.beginPath(); c.moveTo(rx, H - 108); c.lineTo(rx, H - 22); c.lineTo(rx - 40, H - 22); c.stroke();
    const rows = [
      [L("tele_funding"), m.funding != null ? (m.funding * 100 >= 0 ? "+" : "") + (m.funding * 100).toFixed(4) + "%" : "–"],
      [L("tele_spread"), m.spread != null ? "$" + m.spread.toFixed(2) : "–"],
      [L("tele_oi"), m.oi != null ? (m.oi / 1000).toFixed(1) + "K BTC" : "–"],
      [L("tele_atr"), m.atr != null ? "$" + Math.round(m.atr) + " · " + ((m.atr / (m.last || 1)) * 100).toFixed(2) + "%" : "–"],
    ];
    rows.forEach(([k, v], i) => { const y = H - 96 + i * 18; text(c, k, rx - 110, y, hexA(CYAN2, 0.7), 7.5, "right", 700, 0.16); text(c, v, rx - 8, y, INK, 8.5, "right", 800, 0.06); });
  }

  function drawStatus() {
    if (!online || performance.now() - lastTick > 15000) {
      ctx.fillStyle = "rgba(2,4,10,0.5)"; ctx.fillRect(0, 0, W, H);
      text(ctx, L(online ? "fl_waiting" : "fl_offline"), W / 2, H * 0.5 + 110, RED, 8.5, "center", 800, 0.18);
    }
  }

  function loop() {
    cancelAnimationFrame(raf);
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (now - lastFrame < FRAME_MS) return;
      lastFrame = now;
      const t = now - t0;
      if (W <= 1 || H <= 1 || Math.abs(canvas.parentElement.clientWidth - realW) > 2) resize();
      // static floor refreshes twice a second (the arc drift is slow)
      const stamp = Math.floor(t / 500);
      if (stamp !== bgStamp) { bgStamp = stamp; renderBackground(t); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bg, 0, 0);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      ORDER.forEach((n) => drawBeam(n, t));
      const items = ORDER.map((n) => ({ y: desks[n].y, fn: () => drawStation(n, t) }));
      items.push({ y: CY() - 1, fn: () => drawCore(t) });
      items.sort((a, b) => a.y - b.y).forEach((i) => i.fn());
      drawFlights(t);
      drawHUD();
      drawStatus();
      ctx.globalCompositeOperation = "source-over";
    };
    raf = requestAnimationFrame(frame);
  }

  return { init, update, flight, pulse, ORDER, COLOR };
})();
