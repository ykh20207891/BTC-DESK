/* Canvas chart renderers for BTC DESK. All functions take a <canvas> sized by CSS. */
window.Charts = (() => {
  const C = {
    up: "#22c55e", down: "#ef4444", amber: "#f5b942", taker: "#4a8dff", text: "#e7ebf2",
    muted: "#7d8798", dim: "#4d5666", line: "#151b26", line2: "#1e2633", edge: "#ff4f8f", kelly: "#9b6bff",
    spotter: "#22c993", prior: "#ff8a3d", closer: "#ff5a3c",
  };
  const FONT = "Archivo, system-ui, sans-serif";
  const L = (k, p) => (window.I18N ? window.I18N.t(k, p) : k);

  function fit(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  const hexA = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const TS = 1.3; // global text scale: the operator reads this from desk distance
  const label = (ctx, txt, x, y, color, size = 8, align = "left", weight = 700) => {
    ctx.font = `${weight} ${Math.round(size * TS * 10) / 10}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle";
    ctx.fillText(txt, x, y);
  };
  const fmt = (v) => "$" + Math.round(v).toLocaleString("en-US");

  /* ---------- sparkline ---------- */
  function spark(canvas, data, color, opts = {}) {
    const { ctx, w, h } = fit(canvas);
    if (!data || !data.length) return;
    if (data.length === 1) data = [data[0], data[0]];
    let lo = Math.min(...data), hi = Math.max(...data);
    if (opts.min != null) lo = Math.min(lo, opts.min);
    if (opts.max != null) hi = Math.max(hi, opts.max);
    if (hi === lo) { hi += 1; lo -= 1; }
    const pad = 2;
    const X = (i) => pad + (i / (data.length - 1)) * (w - pad * 2);
    const Y = (v) => h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2);
    if (opts.fill !== false) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hexA(color, opts.fillAlpha != null ? opts.fillAlpha : 0.28)); g.addColorStop(1, hexA(color, 0));
      ctx.beginPath(); ctx.moveTo(X(0), h);
      data.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
      ctx.lineTo(X(data.length - 1), h); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    }
    ctx.beginPath();
    data.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.strokeStyle = color; ctx.lineWidth = 1.25; ctx.lineJoin = "round"; ctx.stroke();
    const lx = X(data.length - 1), ly = Y(data[data.length - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 1.8, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }

  /* ---------- equity curve ---------- */
  function equity(canvas, hist, seed) {
    const { ctx, w, h } = fit(canvas);
    if (!hist || hist.length < 2) {
      ctx.setLineDash([2, 3]); ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke(); ctx.setLineDash([]);
      label(ctx, L("ch_history_empty"), 6, h / 2 - 10, C.dim, 7);
      return;
    }
    const vals = hist.map((p) => p[1]);
    let lo = Math.min(...vals, seed), hi = Math.max(...vals, seed);
    const span = Math.max(hi - lo, seed * 0.002);
    lo -= span * 0.15; hi += span * 0.15;
    const padR = 66;
    const X = (i) => (i / (hist.length - 1)) * (w - padR);
    const Y = (v) => h - 4 - ((v - lo) / (hi - lo)) * (h - 10);
    const last = vals[vals.length - 1];
    const col = last >= seed ? C.up : C.down;
    // seed line
    ctx.setLineDash([2, 3]); ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.moveTo(0, Y(seed)); ctx.lineTo(w - padR, Y(seed)); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, L("ch_seed") + " " + fmt(seed), w - padR + 4, Y(seed), C.dim, 7);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, hexA(col, 0.35)); g.addColorStop(1, hexA(col, 0));
    ctx.beginPath(); ctx.moveTo(X(0), h);
    vals.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
    ctx.lineTo(X(vals.length - 1), h); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath();
    vals.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
    const lx = X(vals.length - 1), ly = Y(last);
    ctx.setLineDash([1, 3]); ctx.strokeStyle = hexA(col, 0.5); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(w, ly); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(lx, ly, 2.5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    return { y: ly, color: col };
  }

  /* ---------- candle engine ---------- */
  function rollingBands(closes, n = 20, k = 2) {
    const up = [], lo = [], mid = [];
    for (let i = 0; i < closes.length; i++) {
      const w = closes.slice(Math.max(0, i - n + 1), i + 1);
      const m = w.reduce((a, b) => a + b, 0) / w.length;
      const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length);
      mid.push(m); up.push(m + k * sd); lo.push(m - k * sd);
    }
    return { up, lo, mid };
  }
  function sessionVwap(rows) {
    const out = []; let pv = 0, vol = 0, day = null;
    for (const [ts, o, h, l, c, v] of rows) {
      const d = Math.floor(ts / 86400000);
      if (d !== day) { day = d; pv = 0; vol = 0; }
      pv += ((h + l + c) / 3) * v; vol += v; out.push(vol ? pv / vol : c);
    }
    return out;
  }
  function candles(canvas, rows, opts = {}) {
    const { ctx, w, h } = fit(canvas);
    if (!rows || rows.length < 5) { label(ctx, L("ch_wait_tape"), 10, h / 2, C.dim, 8); return; }
    const axisW = 70, top = 12, volH = Math.round(h * 0.18), bottom = 16;
    const plotW = w - axisW, plotH = h - top - volH - bottom;
    const cw = 5, n = Math.min(rows.length, Math.floor(plotW / cw));
    if (n < 5 || plotH < 20) return;
    const data = rows.slice(-n);
    const closes = data.map((r) => r[4]);
    const bands = rollingBands(closes, 20, 2);
    const vwap = sessionVwap(rows).slice(-n);
    let lo = Math.min(...data.map((r) => r[3]), ...bands.lo.slice(20)), hi = Math.max(...data.map((r) => r[2]), ...bands.up.slice(20));
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const X = (i) => i * cw + cw / 2;
    const Y = (p) => top + (1 - (p - lo) / (hi - lo)) * plotH;
    // grid
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const p = lo + ((hi - lo) * g) / 4, y = Math.round(Y(p)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke();
      label(ctx, fmt(p), plotW + 6, y, C.dim, 8);
    }
    // z-bands
    ctx.beginPath();
    bands.up.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(X(i), Y(bands.lo[i]));
    ctx.closePath(); ctx.fillStyle = "rgba(74,141,255,0.06)"; ctx.fill();
    ctx.setLineDash([2, 3]); ctx.strokeStyle = "rgba(74,141,255,0.35)"; ctx.lineWidth = 1;
    [bands.up, bands.lo].forEach((s) => { ctx.beginPath(); s.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.stroke(); });
    ctx.setLineDash([]);
    // volume
    const vmax = Math.max(...data.map((r) => r[5])) || 1;
    data.forEach((r, i) => {
      const vh = (r[5] / vmax) * (volH - 4);
      ctx.fillStyle = r[4] >= r[1] ? hexA(C.up, 0.45) : hexA(C.down, 0.45);
      ctx.fillRect(X(i) - 1.5, h - bottom - vh, 3, vh);
    });
    // candles
    data.forEach((r, i) => {
      const [, o, hh, ll, c] = r, x = X(i), col = c >= o ? C.up : C.down;
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, Y(hh)); ctx.lineTo(x, Y(ll)); ctx.stroke();
      const y1 = Y(Math.max(o, c)), y2 = Y(Math.min(o, c));
      ctx.fillStyle = col; ctx.fillRect(x - 1.5, y1, 3, Math.max(1, y2 - y1));
    });
    // vwap
    ctx.beginPath(); vwap.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.strokeStyle = C.taker; ctx.lineWidth = 1.5; ctx.stroke();
    label(ctx, L("ch_vwap") + " " + fmt(vwap[n - 1]), X(n - 1) - 4, Y(vwap[n - 1]) + 9, C.taker, 7, "right");
    // ticket markers
    const t0 = data[0][0], t1 = data[n - 1][0] + 60000;
    let signals = 0;
    const labels = [];
    (opts.tickets || []).forEach((t) => {
      const ms = t.created * 1000;
      if (ms < t0 || ms > t1 || !t.direction || t.status === "passed" || t.status === "rejected") return;
      const i = Math.min(n - 1, Math.floor((ms - t0) / 60000)), x = X(i);
      signals++;
      const upT = t.direction === "UP", col = upT ? C.up : C.down;
      const y = upT ? Y(data[i][3]) + 8 : Y(data[i][2]) - 8;
      ctx.beginPath();
      if (upT) { ctx.moveTo(x, y - 4); ctx.lineTo(x - 3.5, y + 2); ctx.lineTo(x + 3.5, y + 2); }
      else { ctx.moveTo(x, y + 4); ctx.lineTo(x - 3.5, y - 2); ctx.lineTo(x + 3.5, y - 2); }
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
      if (t.status === "open" && t.entry) {
        ctx.setLineDash([3, 3]); ctx.strokeStyle = hexA(C.taker, 0.7); ctx.beginPath(); ctx.moveTo(x, Y(t.entry)); ctx.lineTo(plotW, Y(t.entry)); ctx.stroke();
        if (t.sl) { ctx.strokeStyle = hexA(C.down, 0.5); ctx.beginPath(); ctx.moveTo(x, Y(t.sl)); ctx.lineTo(plotW, Y(t.sl)); ctx.stroke(); }
        if (t.tp) { ctx.strokeStyle = hexA(C.up, 0.5); ctx.beginPath(); ctx.moveTo(x, Y(t.tp)); ctx.lineTo(plotW, Y(t.tp)); ctx.stroke(); }
        ctx.setLineDash([]);
        const nearEdge = x > plotW - 110;
        labels.push({ x: nearEdge ? x - 6 : x + 6, y: Y(t.entry) - 7, text: L(upT ? "ch_long" : "ch_short") + " " + t.qty + " BTC", align: nearEdge ? "right" : "left" });
      }
    });
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 9) labels[i].y = labels[i - 1].y + 9;
    labels.forEach((l) => label(ctx, l.text, l.x, l.y, C.taker, 7, l.align));
    // last price tag
    const last = opts.last || closes[n - 1], ly = Y(last), lc = last >= data[n - 1][1] ? C.up : C.down;
    ctx.setLineDash([1, 3]); ctx.strokeStyle = hexA(lc, 0.5); ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(plotW, ly); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = lc; ctx.fillRect(plotW + 2, ly - 9, axisW - 4, 18);
    label(ctx, fmt(last), plotW + 6, ly, "#05070b", 8, "left", 800);
    // time labels
    const first = new Date(data[0][0]), lastT = new Date(data[n - 1][0]);
    const tf = (d) => d.toISOString().slice(11, 16);
    label(ctx, tf(first) + " UTC", 2, h - 6, C.dim, 7);
    label(ctx, tf(lastT), plotW - 2, h - 6, C.dim, 7, "right");
    return { signals };
  }

  /* ---------- analog matcher ---------- */
  function analog(canvas, an) {
    const { ctx, w, h } = fit(canvas);
    const split = Math.round(w * 0.5), top = 20, bottom = 8, plotH = h - top - bottom;
    if (w < 40 || plotH < 10) return;
    // NOW divider
    ctx.strokeStyle = hexA(C.amber, 0.7); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(split + 0.5, top - 6); ctx.lineTo(split + 0.5, h - 2); ctx.stroke(); ctx.setLineDash([]);
    if (!an || !an.ready || !an.now || !an.now.length) { label(ctx, L("ch_scanning"), 10, h / 2, C.dim, 8); return; }
    // left: z-scored windows
    const priors = an.priors || [];
    const allZ = [...an.now, ...priors.flat()];
    let zlo = Math.min(...allZ), zhi = Math.max(...allZ); const zp = (zhi - zlo) * 0.1; zlo -= zp; zhi += zp;
    const LX = (i, n) => 10 + (i / (n - 1)) * (split - 22);
    const LY = (z) => top + (1 - (z - zlo) / (zhi - zlo)) * plotH;
    ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(10, LY(0) + 0.5); ctx.lineTo(split - 10, LY(0) + 0.5); ctx.stroke();
    const pcols = [C.edge, C.kelly, C.prior];
    priors.forEach((p, k) => {
      ctx.beginPath(); p.forEach((z, i) => (i ? ctx.lineTo(LX(i, p.length), LY(z)) : ctx.moveTo(LX(i, p.length), LY(z))));
      ctx.strokeStyle = hexA(pcols[k % 3], 0.55); ctx.lineWidth = 1; ctx.stroke();
    });
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, "rgba(231,235,242,0.16)"); g.addColorStop(1, "rgba(231,235,242,0)");
    ctx.beginPath(); ctx.moveTo(LX(0, an.now.length), h - bottom);
    an.now.forEach((z, i) => ctx.lineTo(LX(i, an.now.length), LY(z)));
    ctx.lineTo(LX(an.now.length - 1, an.now.length), h - bottom); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); an.now.forEach((z, i) => (i ? ctx.lineTo(LX(i, an.now.length), LY(z)) : ctx.moveTo(LX(i, an.now.length), LY(z))));
    ctx.strokeStyle = C.text; ctx.lineWidth = 1.6; ctx.stroke();
    const nx = LX(an.now.length - 1, an.now.length), ny = LY(an.now[an.now.length - 1]);
    ctx.beginPath(); ctx.arc(nx, ny, 3, 0, Math.PI * 2); ctx.fillStyle = C.amber; ctx.fill();
    // right: outcomes in %
    const paths = an.paths || [], med = an.median_path || [];
    const allR = [...paths.flat(), ...med, 0];
    let rlo = Math.min(...allR), rhi = Math.max(...allR); const rp = Math.max((rhi - rlo) * 0.15, 0.05); rlo -= rp; rhi += rp;
    const RX = (i, n) => split + 6 + ((i + 1) / n) * (w - split - 16);
    const RY = (r) => top + (1 - (r - rlo) / (rhi - rlo)) * plotH;
    ctx.strokeStyle = C.line2; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(split, RY(0) + 0.5); ctx.lineTo(w - 8, RY(0) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    paths.forEach((p) => {
      const col = p[p.length - 1] >= 0 ? C.up : C.down;
      ctx.beginPath(); ctx.moveTo(split, RY(0));
      p.forEach((r, i) => ctx.lineTo(RX(i, p.length), RY(r)));
      ctx.strokeStyle = hexA(col, 0.45); ctx.lineWidth = 1; ctx.stroke();
    });
    if (med.length) {
      ctx.beginPath(); ctx.moveTo(split, RY(0));
      med.forEach((r, i) => ctx.lineTo(RX(i, med.length), RY(r)));
      ctx.strokeStyle = C.amber; ctx.lineWidth = 2; ctx.stroke();
      const ex = RX(med.length - 1, med.length), ey = RY(med[med.length - 1]);
      ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, Math.PI * 2); ctx.fillStyle = C.amber; ctx.fill();
      label(ctx, L("ch_median") + " " + (med[med.length - 1] >= 0 ? "+" : "") + med[med.length - 1].toFixed(2) + "%", ex - 4, ey - 9, C.amber, 7, "right");
    }
    label(ctx, "+" + rhi.toFixed(2) + "%", w - 8, top + 4, C.dim, 7, "right");
    label(ctx, rlo.toFixed(2) + "%", w - 8, h - bottom - 4, C.dim, 7, "right");
    label(ctx, L("ch_bars", { n: an.horizon || 24 }), split + 8, h - 6, C.dim, 7);
  }

  /* ---------- model vs book bell ---------- */
  function bell(canvas, fair, book, color) {
    const { ctx, w, h } = fit(canvas);
    if (fair == null) return;
    const sigma = 11, X = (c) => (c / 100) * w, pdf = (c) => Math.exp(-((c - fair) ** 2) / (2 * sigma * sigma));
    ctx.beginPath(); ctx.moveTo(0, h - 3);
    for (let c = 0; c <= 100; c += 1) ctx.lineTo(X(c), h - 3 - pdf(c) * (h - 10));
    ctx.lineTo(w, h - 3); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, hexA(color, 0.5)); g.addColorStop(1, hexA(color, 0.02));
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); for (let c = 0; c <= 100; c += 1) { const y = h - 3 - pdf(c) * (h - 10); c ? ctx.lineTo(X(c), y) : ctx.moveTo(X(c), y); }
    ctx.strokeStyle = color; ctx.lineWidth = 1.25; ctx.stroke();
    ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.moveTo(0, h - 2.5); ctx.lineTo(w, h - 2.5); ctx.stroke();
    if (book != null) { ctx.setLineDash([2, 2]); ctx.strokeStyle = C.muted; ctx.beginPath(); ctx.moveTo(X(book), 2); ctx.lineTo(X(book), h - 3); ctx.stroke(); ctx.setLineDash([]); }
    ctx.strokeStyle = C.text; ctx.beginPath(); ctx.moveTo(X(fair), 2); ctx.lineTo(X(fair), h - 3); ctx.stroke();
    label(ctx, "0¢", 1, h - 8, C.dim, 6); label(ctx, "100¢", w - 1, h - 8, C.dim, 6, "right");
  }

  /* ---------- order-book depth ---------- */
  function depth(canvas, bid, ask) {
    const { ctx, w, h } = fit(canvas);
    const tot = (bid || 0) + (ask || 0);
    if (!tot) return;
    const bw = (bid / tot) * w, mid = Math.round(h / 2);
    ctx.fillStyle = hexA(C.up, 0.8); ctx.fillRect(0, mid - 3, bw - 1, 6);
    ctx.fillStyle = hexA(C.down, 0.8); ctx.fillRect(bw + 1, mid - 3, w - bw - 1, 6);
    label(ctx, L("ch_bid") + " " + bid.toFixed(1), 0, mid - 9, C.up, 6);
    label(ctx, ask.toFixed(1) + " " + L("ch_ask"), w, mid - 9, C.down, 6, "right");
    label(ctx, ((bid / tot) * 100).toFixed(0) + "%", 0, mid + 10, C.dim, 6);
    label(ctx, ((ask / tot) * 100).toFixed(0) + "%", w, mid + 10, C.dim, 6, "right");
  }

  return { fit, spark, equity, candles, analog, bell, depth, C };
})();
