/* THE OFFICE — isometric floor: six desks around the core, tickets routed desk to desk. */
window.Floor = (() => {
  const ORDER = ["spotter", "prior", "edge", "kelly", "taker", "closer"];
  const ANGLE = { spotter: -128, prior: -52, edge: 4, kelly: 56, taker: 128, closer: 184 };
  const COLOR = { spotter: "#22c993", prior: "#ff8a3d", edge: "#ff4f8f", kelly: "#9b6bff", taker: "#4a8dff", closer: "#ff5a3c" };
  const SHAPE = { spotter: "circle", prior: "circle", edge: "drop", kelly: "drop", taker: "circle", closer: "circle" };
  const FONT = "Manrope, Segoe UI, system-ui, sans-serif";
  const EX = [0.87, 0.5], EY = [-0.87, 0.5];
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let canvas, ctx, W = 0, H = 0, dpr = 1, scale = 1, realW = 0, raf = 0, t0 = performance.now();
  const desks = {};      // name -> {x,y,state,progress,history,pulse}
  const flights = [];    // {from,to,color,t0,dur,pnl}
  const particles = [];
  let holder = "spotter", coreState = "idle", online = false, lastTick = 0;

  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const P = (cx, cy, u, v, z = 0) => [cx + u * EX[0] + v * EY[0], cy + u * EX[1] + v * EY[1] - z];

  function init(el) {
    canvas = el; ctx = canvas.getContext("2d");
    ORDER.forEach((n) => (desks[n] = { x: 0, y: 0, state: "idle", progress: 0, history: [], pulse: 0, gauge: 0 }));
    for (let i = 0; i < 40; i++) particles.push({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.2, v: 0.004 + Math.random() * 0.01, a: 0.15 + Math.random() * 0.3 });
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
    scale = realW < 620 ? 0.74 : 1;            // phones: draw the same office smaller
    W = realW / scale; H = realH / scale;
    layout();
  }

  function layout() {
    const cx = W / 2, cy = H * 0.5, rx = Math.min(W * 0.37, 470), ry = Math.min(H * 0.31, 150);
    ORDER.forEach((n) => { const a = (ANGLE[n] * Math.PI) / 180; desks[n].x = cx + Math.cos(a) * rx; desks[n].y = cy + Math.sin(a) * ry; });
  }

  function update(state) {
    online = !!state.online;
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

  function flight(from, to, color, pnl) {
    if (!desks[from] || !desks[to]) return;
    flights.push({ from, to, color: color || COLOR[to], t0: performance.now(), dur: reduced ? 1 : 1400, pnl });
    if (flights.length > 12) flights.shift();
  }
  function pulse(name) { if (desks[name]) desks[name].pulse = 1; }

  /* ---------------- drawing ---------------- */
  function poly(pts, fill, stroke) {
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function isoBox(cx, cy, a, b, h, top, left, right, edge) {
    const A = P(cx, cy, -a / 2, -b / 2), B = P(cx, cy, a / 2, -b / 2), C = P(cx, cy, a / 2, b / 2), D = P(cx, cy, -a / 2, b / 2);
    poly([D, C, [C[0], C[1] + h], [D[0], D[1] + h]], left, edge);
    poly([B, C, [C[0], C[1] + h], [B[0], B[1] + h]], right, edge);
    poly([A, B, C, D], top, edge);
  }
  function ellipse(x, y, rx, ry, fill, stroke, dash) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { if (dash) ctx.setLineDash(dash); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
  }
  function text(s, x, y, color, size = 7, align = "center", weight = 800, ls = 0.14) {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = ls + "em";
    ctx.fillText(s, x, y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0em";
  }

  function drawFloor(t) {
    const cx = W / 2, cy = H * 0.5;
    // iso grid
    ctx.save(); ctx.strokeStyle = "rgba(90,120,170,0.13)"; ctx.lineWidth = 1;
    const step = 34, span = Math.max(W, H) * 1.6;
    for (let i = -span; i <= span; i += step) {
      let p1 = P(cx, cy, i, -span), p2 = P(cx, cy, i, span); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      p1 = P(cx, cy, -span, i); p2 = P(cx, cy, span, i); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
    ctx.restore();
    // office carpet: one iso rhombus under the whole ring of desks
    const S = Math.min(W * 0.42, 520), Sy = S * 0.62;
    poly([P(cx, cy + 10, -S, -Sy), P(cx, cy + 10, S, -Sy), P(cx, cy + 10, S, Sy), P(cx, cy + 10, -S, Sy)], "rgba(18,26,44,0.55)", "rgba(90,120,170,0.22)");
    poly([P(cx, cy + 10, -S * 0.86, -Sy * 0.86), P(cx, cy + 10, S * 0.86, -Sy * 0.86), P(cx, cy + 10, S * 0.86, Sy * 0.86), P(cx, cy + 10, -S * 0.86, Sy * 0.86)], null, "rgba(90,120,170,0.12)");
    // pit under the core
    const g = ctx.createRadialGradient(cx, cy + 14, 4, cx, cy + 14, 190);
    g.addColorStop(0, "rgba(58,96,190,0.32)"); g.addColorStop(0.5, "rgba(40,70,150,0.12)"); g.addColorStop(1, "rgba(40,70,150,0)");
    ellipse(cx, cy + 14, 200, 78, g);
    const spin = reduced ? 0 : t * 0.00004;
    [[168, 64, 0.22], [126, 48, 0.28], [84, 32, 0.34]].forEach(([rx, ry, a], i) => {
      ctx.save(); ctx.lineDashOffset = -(t * 0.02 * (i % 2 ? -1 : 1)); ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.ellipse(cx, cy + 14, rx, ry, spin * (i + 1), 0, Math.PI * 2); ctx.strokeStyle = `rgba(110,150,230,${a})`; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    });
    ellipse(cx, cy + 14, 52, 20, "rgba(120,160,240,0.22)");
    // routes desk -> core
    ORDER.forEach((n) => {
      const d = desks[n], active = holder === n && coreState === "routing";
      ctx.save(); ctx.setLineDash([4, 5]); ctx.lineDashOffset = -(t * 0.03);
      ctx.strokeStyle = active ? hexA(COLOR[n], 0.95) : "rgba(190,210,245,0.62)"; ctx.lineWidth = active ? 2 : 1.3;
      ctx.beginPath(); ctx.moveTo(d.x, d.y + 6); ctx.quadraticCurveTo((d.x + cx) / 2, (d.y + cy) / 2 + 12, cx, cy + 14); ctx.stroke(); ctx.restore();
    });
  }

  function drawPlant(x, y, s) {
    ctx.save();
    poly([[x - 9 * s, y], [x + 9 * s, y], [x + 7 * s, y + 14 * s], [x - 7 * s, y + 14 * s]], "#151a24", "#242c3a");
    ctx.strokeStyle = "#1f6b3a"; ctx.lineWidth = 2 * s; ctx.lineCap = "round";
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.32, L = (26 + (i % 2) * 8) * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * L * 0.5, y + Math.sin(a) * L * 0.9, x + Math.cos(a) * L, y + Math.sin(a) * L * 0.55); ctx.stroke();
    }
    ctx.restore();
  }

  function drawDesk(n, t) {
    const d = desks[n], col = COLOR[n], run = d.state === "run", deck = d.state === "on_deck";
    const x = d.x, y = d.y;
    d.pulse = Math.max(0, d.pulse - 0.012);
    // floor glow
    if (run || deck || d.pulse > 0) {
      const a = (run ? 0.28 : deck ? 0.2 : 0) + d.pulse * 0.4;
      const g = ctx.createRadialGradient(x, y + 12, 2, x, y + 12, 70);
      g.addColorStop(0, hexA(col, a)); g.addColorStop(1, hexA(col, 0));
      ellipse(x, y + 12, 74, 30, g);
    }
    // chair behind the desk, cabinet beside it
    isoBox(x - 30, y - 24, 16, 14, 9, "#232b3a", "#131924", "#1a2130", "#2c3646");
    ctx.fillStyle = "#1c2331"; ctx.fillRect(x - 41, y - 42, 14, 14);
    isoBox(x + 44, y + 2, 14, 12, 20, "#1f2735", "#10151e", "#161c28", "#2a3444");
    ctx.fillStyle = "#3a4557"; ctx.fillRect(x + 40, y + 10, 8, 1.5); ctx.fillRect(x + 40, y + 16, 8, 1.5);
    // desk
    isoBox(x, y, 78, 46, 16, "#1b2231", "#0f141d", "#141a26", "#28313f");
    // papers and a mug on the desk
    poly([P(x, y, -20, 4), P(x, y, -8, 4), P(x, y, -8, 16), P(x, y, -20, 16)], "#cfd6e2");
    poly([P(x, y, -17, -1), P(x, y, -5, -1), P(x, y, -5, 11), P(x, y, -17, 11)], "#e7ebf2");
    ctx.fillStyle = "#2a3444"; ctx.fillRect(P(x, y, 22, 14)[0] - 2, P(x, y, 22, 14)[1] - 5, 5, 5);
    // monitor
    const mx = x + 8, my = y - 30, mw = 38, mh = 22;
    ctx.fillStyle = "#0a0f17"; ctx.fillRect(mx - mw / 2, my - mh / 2, mw, mh);
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = run ? 16 : 6;
    ctx.strokeStyle = hexA(col, run ? 0.9 : 0.45); ctx.lineWidth = 1; ctx.strokeRect(mx - mw / 2 + 0.5, my - mh / 2 + 0.5, mw - 1, mh - 1); ctx.restore();
    ctx.fillStyle = "#2a3444"; ctx.fillRect(mx - 1.5, my + mh / 2, 3, 5); ctx.fillRect(mx - 7, my + mh / 2 + 5, 14, 1.5);
    const hist = d.history.slice(-16);
    if (hist.length > 1) {
      const lo = Math.min(...hist), hi = Math.max(...hist) || 1, rng = hi - lo || 1;
      ctx.beginPath();
      hist.forEach((v, i) => { const px = mx - mw / 2 + 3 + (i / (hist.length - 1)) * (mw - 6), py = my + mh / 2 - 3 - ((v - lo) / rng) * (mh - 6); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
    }
    // label plate
    const lw = 64;
    ctx.fillStyle = "rgba(5,7,11,0.85)"; ctx.fillRect(x - lw / 2, y + 28, lw, 12);
    ctx.strokeStyle = run ? col : "#28313f"; ctx.lineWidth = 1; ctx.strokeRect(x - lw / 2 + 0.5, y + 28.5, lw - 1, 11);
    text(n.toUpperCase(), x, y + 34.5, run || deck ? col : "#8b95a7", 6.5, "center", 800, 0.16);
    // progress under plate
    if (run || d.state === "done") {
      ctx.fillStyle = "#151b26"; ctx.fillRect(x - lw / 2, y + 42, lw, 2);
      ctx.fillStyle = col; ctx.fillRect(x - lw / 2, y + 42, lw * (d.state === "done" ? 1 : d.progress), 2);
    }
    // agent orb
    const bob = reduced ? 0 : Math.sin(t * 0.0022 + ORDER.indexOf(n) * 1.3) * 4;
    const ox = x - 16, oy = y - 74 + bob;
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = run ? 26 : 14;
    const grad = ctx.createRadialGradient(ox - 4, oy - 5, 2, ox, oy, 17);
    grad.addColorStop(0, lighten(col)); grad.addColorStop(1, col);
    ctx.fillStyle = grad; ctx.beginPath();
    if (SHAPE[n] === "drop") { ctx.moveTo(ox, oy - 19); ctx.bezierCurveTo(ox + 17, oy - 2, ox + 17, oy + 7, ox, oy + 17); ctx.bezierCurveTo(ox - 17, oy + 7, ox - 17, oy - 2, ox, oy - 19); }
    else ctx.arc(ox, oy, 17, 0, Math.PI * 2);
    ctx.fill(); ctx.restore();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round";
    drawGlyph(n, ox, oy);
    if (run) { ctx.beginPath(); ctx.arc(ox, oy, 23 + Math.sin(t * 0.006) * 2, 0, Math.PI * 2); ctx.strokeStyle = hexA(col, 0.5); ctx.lineWidth = 1; ctx.stroke(); }
    if (deck) { text("ON DECK", ox, oy - 28, "#f5b942", 6, "center", 800, 0.16); }
    // shadow of the orb on the desk
    ellipse(ox, y - 10, 10 - bob * 0.3, 3.8, "rgba(0,0,0,0.35)");
  }

  // one glyph per desk, same stroke as the desk cards
  function drawGlyph(n, ox, oy) {
    ctx.save(); ctx.translate(ox - 15, oy - 15); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
    switch (n) {
      case "spotter": ctx.arc(13.5, 13.5, 4.2, 0, Math.PI * 2); ctx.moveTo(16.8, 16.8); ctx.lineTo(21, 21); break;
      case "prior": ctx.moveTo(8, 20); ctx.bezierCurveTo(11, 20, 12, 9, 15, 9); ctx.bezierCurveTo(18, 9, 19, 20, 22, 20); break;
      case "edge": ctx.moveTo(8, 19); ctx.lineTo(14, 19); ctx.lineTo(14, 11); ctx.lineTo(21, 11); break;
      case "kelly": ctx.moveTo(10, 20); ctx.lineTo(10, 15); ctx.moveTo(15, 20); ctx.lineTo(15, 10); ctx.moveTo(20, 20); ctx.lineTo(20, 13); break;
      case "taker": ctx.moveTo(9, 15); ctx.lineTo(21, 15); ctx.moveTo(16.5, 10.5); ctx.lineTo(21, 15); ctx.lineTo(16.5, 19.5); break;
      case "closer": ctx.moveTo(9, 15.5); ctx.lineTo(13.5, 20); ctx.lineTo(21, 10.5); break;
    }
    ctx.stroke(); ctx.restore();
  }
  function lighten(hex) { const n = parseInt(hex.slice(1), 16); const r = Math.min(255, ((n >> 16) & 255) + 70), g = Math.min(255, ((n >> 8) & 255) + 70), b = Math.min(255, (n & 255) + 70); return `rgb(${r},${g},${b})`; }

  function drawCore(t) {
    const cx = W / 2, cy = H * 0.5;
    const bob = reduced ? 0 : Math.sin(t * 0.0016) * 3;
    const ox = cx, oy = cy - 36 + bob, R = Math.min(38, H * 0.09);
    const busy = coreState === "routing";
    ctx.save(); ctx.shadowColor = coreState === "paused" ? "#f5b942" : coreState === "guard" ? "#ff5a3c" : "#ffffff"; ctx.shadowBlur = 44 + (busy ? Math.sin(t * 0.008) * 10 : 0);
    const g = ctx.createRadialGradient(ox - R * 0.35, oy - R * 0.4, R * 0.1, ox, oy, R);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.7, "#eef2f7"); g.addColorStop(1, "#b9c4d4");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox, oy, R, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    // core mark: an open ring with a centre point (the lens)
    const mark = coreState === "paused" ? "#a0741a" : coreState === "guard" ? "#7a2a1c" : "#0b1220";
    ctx.strokeStyle = mark; ctx.lineWidth = R * 0.16; ctx.lineCap = "round";
    const rot = busy && !reduced ? t * 0.0025 : -0.6;
    ctx.beginPath(); ctx.arc(ox, oy, R * 0.42, rot + 0.5, rot + Math.PI * 2 - 0.5); ctx.stroke();
    ctx.fillStyle = mark; ctx.beginPath(); ctx.arc(ox, oy, R * 0.14, 0, Math.PI * 2); ctx.fill();
    // label
    const lw = 52;
    ctx.fillStyle = "rgba(5,7,11,0.85)"; ctx.fillRect(cx - lw / 2, cy + 22, lw, 12);
    ctx.strokeStyle = "#28313f"; ctx.strokeRect(cx - lw / 2 + 0.5, cy + 22.5, lw - 1, 11);
    text("BTC CORE", cx, cy + 28.5, "#c7cfdb", 6.5, "center", 800, 0.16);
    ellipse(ox, cy + 14, R * 0.7 - bob * 0.4, R * 0.26, "rgba(0,0,0,0.35)");
  }

  function bez(p0, p1, p2, u) { const a = 1 - u; return [a * a * p0[0] + 2 * a * u * p1[0] + u * u * p2[0], a * a * p0[1] + 2 * a * u * p1[1] + u * u * p2[1]]; }
  function drawFlights(t) {
    const cx = W / 2, cy = H * 0.5;
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i], u = (t - f.t0) / f.dur;
      if (u >= 1.3) { flights.splice(i, 1); continue; }
      const A = [desks[f.from].x, desks[f.from].y - 10], C = [cx, cy - 20], B = [desks[f.to].x, desks[f.to].y - 10];
      let p, ang;
      if (u < 0.5) { const v = u * 2; p = bez(A, [(A[0] + C[0]) / 2, Math.min(A[1], C[1]) - 40], C, v); ang = Math.atan2(C[1] - A[1], C[0] - A[0]); }
      else if (u < 1) { const v = (u - 0.5) * 2; p = bez(C, [(C[0] + B[0]) / 2, Math.min(C[1], B[1]) - 40], B, v); ang = Math.atan2(B[1] - C[1], B[0] - C[0]); }
      else { p = B; ang = 0; }
      const alpha = u < 1 ? 1 : 1 - (u - 1) / 0.3;
      // trail
      for (let k = 1; k <= 5; k++) {
        const uu = u - k * 0.03; if (uu < 0) break;
        let q; if (uu < 0.5) q = bez(A, [(A[0] + C[0]) / 2, Math.min(A[1], C[1]) - 40], C, uu * 2); else q = bez(C, [(C[0] + B[0]) / 2, Math.min(C[1], B[1]) - 40], B, (uu - 0.5) * 2);
        ctx.fillStyle = hexA(f.color, (0.35 - k * 0.06) * alpha); ctx.beginPath(); ctx.arc(q[0], q[1], 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang * 0.25); ctx.globalAlpha = alpha;
      ctx.shadowColor = f.color; ctx.shadowBlur = 12;
      ctx.fillStyle = f.color; ctx.fillRect(-7, -5, 14, 10);
      ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(-4, -2, 8, 1.5); ctx.fillRect(-4, 1, 5, 1.5);
      ctx.restore();
    }
  }

  function drawParticles(t) {
    particles.forEach((p) => {
      if (!reduced) { p.y -= p.v * 0.016; if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); } }
      ctx.fillStyle = `rgba(150,180,240,${p.a})`; ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.s, 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawStatus(t) {
    // offline veil
    if (!online || performance.now() - lastTick > 15000) {
      ctx.fillStyle = "rgba(5,7,11,0.45)"; ctx.fillRect(0, 0, W, H);
      text(online ? "WAITING FOR STATE" : "STREAM OFFLINE · RECONNECTING", W / 2, H * 0.5 + 70, "#ef4444", 8, "center", 800, 0.18);
    }
  }

  function loop() {
    cancelAnimationFrame(raf);
    const frame = () => {
      const t = performance.now() - t0;
      if (W <= 1 || H <= 1 || Math.abs(canvas.parentElement.clientWidth - realW) > 2) resize();
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0); ctx.clearRect(0, 0, W, H);
      drawParticles(t);
      drawFloor(t);
      // paint back to front by y
      const items = ORDER.map((n) => ({ y: desks[n].y, fn: () => drawDesk(n, t) }));
      items.push({ y: H * 0.5 - 1, fn: () => drawCore(t) });
      items.sort((a, b) => a.y - b.y).forEach((i) => i.fn());
      drawFlights(t);
      drawStatus(t);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  return { init, update, flight, pulse, ORDER, COLOR };
})();
