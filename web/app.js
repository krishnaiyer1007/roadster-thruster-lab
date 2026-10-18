/* Roadster Thruster Lab : UI, drawing and animation. Physics lives in physics.js (window.RTL). */
(function () {
  "use strict";
  const R = window.RTL;
  const $ = s => document.querySelector(s);
  const TAU = Math.PI * 2;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- helpers ----------
  const col = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function palette() {
    return { bg: col("--bg"), panel: col("--panel"), ink: col("--ink"), muted: col("--muted"), line: col("--line"),
      frost: col("--frost"), amber: col("--amber"), good: col("--good"), bad: col("--bad"), sky1: col("--sky1"), sky2: col("--sky2"),
      ground: col("--ground"), car: col("--car"), glass: col("--glass"), obs: col("--obs"), obsInk: col("--obs-ink"),
      mono: col("--f-mono"), body: col("--f-body") };
  }
  function prep(cv, hCss) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(240, cv.parentElement.clientWidth);
    cv.style.height = hCss + "px";
    cv.width = Math.round(w * dpr); cv.height = Math.round(hCss * dpr);
    const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, w, h: hCss };
  }
  const f1 = v => v.toFixed(1), f2 = v => v.toFixed(2), f0 = v => Math.round(v).toLocaleString("en-GB");
  const mph = v => v * 2.23694;
  function kv(rows) { return rows.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join(""); }
  function setStatus(el, cls, text) { el.className = "status " + cls; el.textContent = text; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sampleAt(rec, t) { // binary search on rec[i].t
    if (t <= rec[0].t) return rec[0];
    if (t >= rec[rec.length - 1].t) return rec[rec.length - 1];
    let lo = 0, hi = rec.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rec[m].t <= t) lo = m; else hi = m; }
    return rec[lo];
  }
  function niceStep(span, n) { const raw = span / n; const p = Math.pow(10, Math.floor(Math.log10(raw))); const k = raw / p; return (k < 1.5 ? 1 : k < 3 ? 2 : k < 7 ? 5 : 10) * p; }
  function fmtTick(v, step) { const d = step < 1 ? Math.min(3, Math.ceil(-Math.log10(step))) : 0; return v.toFixed(d); }

  // ---------- line chart ----------
  function lineChart(cv, o) {
    const pal = palette();
    const { c, w, h } = prep(cv, o.h || 210);
    const pl = 48, pr = 14, pt = 14, pb = 38;
    const X = v => pl + (v - o.xMin) / (o.xMax - o.xMin) * (w - pl - pr);
    const Y = v => h - pb - (v - o.yMin) / (o.yMax - o.yMin) * (h - pt - pb);
    c.fillStyle = pal.panel; c.fillRect(0, 0, w, h);
    c.font = `11px ${pal.mono}`; c.textBaseline = "middle";
    const ys = niceStep(o.yMax - o.yMin, 4);
    for (let v = Math.ceil(o.yMin / ys) * ys; v <= o.yMax + 1e-9; v += ys) {
      c.strokeStyle = pal.line; c.lineWidth = 1; c.globalAlpha = 0.7; c.beginPath(); c.moveTo(pl, Y(v)); c.lineTo(w - pr, Y(v)); c.stroke(); c.globalAlpha = 1;
      c.fillStyle = pal.muted; c.textAlign = "right"; c.fillText(fmtTick(v, ys), pl - 6, Y(v));
    }
    const xs = niceStep(o.xMax - o.xMin, w < 420 ? 4 : 6);
    c.textAlign = "center"; c.textBaseline = "top";
    for (let v = Math.ceil(o.xMin / xs) * xs; v <= o.xMax + 1e-9; v += xs) { c.fillStyle = pal.muted; c.fillText(fmtTick(v, xs), X(v), h - pb + 6); }
    c.fillText(o.xLabel, pl + (w - pl - pr) / 2, h - 16);
    c.save(); c.translate(12, pt + (h - pt - pb) / 2); c.rotate(-Math.PI / 2); c.textBaseline = "middle"; c.fillText(o.yLabel, 0, 0); c.restore();
    c.strokeStyle = pal.ink; c.globalAlpha = 0.5; c.beginPath(); c.moveTo(pl, pt); c.lineTo(pl, h - pb); c.lineTo(w - pr, h - pb); c.stroke(); c.globalAlpha = 1;
    (o.refs || []).forEach(r => {
      c.strokeStyle = pal[r.color] || pal.muted; c.setLineDash([5, 4]); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(pl, Y(r.y)); c.lineTo(w - pr, Y(r.y)); c.stroke(); c.setLineDash([]);
      c.fillStyle = pal[r.color] || pal.muted; c.textAlign = "right"; c.textBaseline = "bottom"; c.fillText(r.label, w - pr - 4, Y(r.y) - 3);
    });
    if (o.vline !== undefined) { c.strokeStyle = pal.ink; c.globalAlpha = 0.4; c.beginPath(); c.moveTo(X(o.vline), pt); c.lineTo(X(o.vline), h - pb); c.stroke(); c.globalAlpha = 1; }
    o.series.forEach(s => {
      if (!s.pts.length) return;
      c.strokeStyle = pal[s.color]; c.lineWidth = s.width || 2; c.lineJoin = "round"; c.beginPath();
      s.pts.forEach((p, i) => { const x = X(Math.min(Math.max(p[0], o.xMin), o.xMax)), y = Y(Math.min(Math.max(p[1], o.yMin), o.yMax)); i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke();
      const e = s.pts[s.pts.length - 1];
      if (s.dot !== false) { c.fillStyle = pal[s.color]; c.beginPath(); c.arc(X(Math.min(e[0], o.xMax)), Y(Math.min(Math.max(e[1], o.yMin), o.yMax)), 3, 0, TAU); c.fill(); }
    });
    // legend
    let lx = pl + 8; const ly = pt + 4; c.textBaseline = "top"; c.textAlign = "left";
    o.series.forEach(s => { if (!s.label) return; c.fillStyle = pal[s.color]; c.fillRect(lx, ly + 5, 12, 3); c.fillStyle = pal.ink; c.fillText(s.label, lx + 16, ly); lx += c.measureText(s.label).width + 34; });
  }

  // ---------- car drawing (original generic sports-car profile, metres, origin at centre of mass) ----------
  const BODY = [[-2.2, -0.40], [2.12, -0.40], [2.2, -0.26], [2.05, -0.08], [1.25, 0.10], [0.35, 0.55], [-0.75, 0.58], [-1.65, 0.36], [-2.15, 0.22], [-2.22, 0.02]];
  const GLASS = [[1.05, 0.13], [0.33, 0.49], [-0.62, 0.52], [-1.3, 0.31], [-0.2, 0.24]];
  // nozzle positions in car frame: [x, y, dirx, diry]
  const NZ = {
    rear: [[-2.22, -0.2, -1, 0]],
    lift: [[-1.3, -0.4, 0, -1], [-0.45, -0.4, 0, -1], [0.45, -0.4, 0, -1], [1.3, -0.4, 0, -1]],
    noseUp: [[1.95, -0.38, 0, -1], [-2.0, 0.24, 0, 1]],   // front fires down, rear fires up: pitch nose up
    noseDown: [[1.6, 0.02, 0, 1], [-2.05, -0.38, 0, -1]]
  };
  function plume(c, n, len, wid, pal, flick) {
    const [x, y, dx, dy] = n; const L = len * (0.9 + 0.2 * flick);
    const ex = x + dx * L, ey = y + dy * L, px = -dy, py = dx;
    const g = c.createLinearGradient(x, y, ex, ey);
    g.addColorStop(0, pal.frost); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.globalAlpha = 0.85;
    c.beginPath(); c.moveTo(x + px * wid * 0.25, y + py * wid * 0.25); c.lineTo(ex + px * wid, ey + py * wid); c.lineTo(ex - px * wid, ey - py * wid); c.lineTo(x - px * wid * 0.25, y - py * wid * 0.25); c.closePath(); c.fill();
    c.globalAlpha = 1;
  }
  function drawCar(c, sx, sy, th, s, pal, jets) {
    c.save(); c.translate(sx, sy); c.rotate(-th); c.scale(s, -s);
    const flick = Math.random();
    if (jets) {
      if (jets.rear > 0) NZ.rear.forEach(n => plume(c, n, 1.0 + 2.4 * jets.rear, 0.26, pal, flick));
      if (jets.lift > 0) NZ.lift.forEach(n => plume(c, n, 0.5 + 1.6 * jets.lift, 0.18, pal, flick));
      if (jets.att > 0) NZ.noseUp.forEach(n => plume(c, n, 0.3 + 1.0 * jets.att, 0.12, pal, flick));
      if (jets.att < 0) NZ.noseDown.forEach(n => plume(c, n, 0.3 + 1.0 * -jets.att, 0.12, pal, flick));
    }
    c.lineWidth = 1.4 / s; c.strokeStyle = pal.ink;
    c.fillStyle = pal.car; c.beginPath(); BODY.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = pal.glass; c.beginPath(); GLASS.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill();
    c.strokeStyle = pal.bad; c.lineWidth = 3 / s; c.beginPath(); c.moveTo(-2.19, 0.1); c.lineTo(-2.19, -0.08); c.stroke();
    [-1.35, 1.35].forEach(wx => {
      c.fillStyle = pal.ink; c.beginPath(); c.arc(wx, -0.19, 0.36, 0, TAU); c.fill();
      c.fillStyle = pal.muted; c.beginPath(); c.arc(wx, -0.19, 0.2, 0, TAU); c.fill();
    });
    c.restore();
  }
  function arrow(c, x1, y1, x2, y2, color, label, pal) {
    const a = Math.atan2(y2 - y1, x2 - x1), L = Math.hypot(x2 - x1, y2 - y1);
    if (L < 2) return;
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2 - Math.cos(a) * 8, y2 - Math.sin(a) * 8); c.stroke();
    c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - Math.cos(a - 0.4) * 12, y2 - Math.sin(a - 0.4) * 12); c.lineTo(x2 - Math.cos(a + 0.4) * 12, y2 - Math.sin(a + 0.4) * 12); c.closePath(); c.fill();
    if (label) { c.font = `12px ${pal.mono}`; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(label, x2 + 8, y2); }
  }
  function sky(c, w, h, pal) { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, pal.sky1); g.addColorStop(1, pal.sky2); c.fillStyle = g; c.fillRect(0, 0, w, h); }

  // ---------- global setup ----------
  function bindRange(id, outId, fmt, apply) {
    const el = $(id), out = $(outId);
    const upd = (run) => { const v = +el.value; out.textContent = fmt(v); apply(v); if (run) rerun(); };
    el.addEventListener("input", () => upd(true));
    upd(false);
    return el;
  }
  bindRange("#g-p0", "#o-p0", v => `${v} bar · ${f0(v * 14.5038)} psi`, v => R.P.P0bar = v);
  bindRange("#g-mass", "#o-mass", v => `${f0(v)} kg`, v => R.P.dry = v);
  bindRange("#g-reg", "#o-reg", v => `${v} bar`, v => R.P.Pregbar = v);
  function renderDerived() {
    const m0 = R.airMass0(), isp = R.ispAt(R.P.Pregbar * 1e5, R.P.T0);
    $("#derived").innerHTML = kv([
      ["Air stored", `${f0(m0)} kg`],
      ["Specific impulse at 20 °C", `${f1(isp)} s`],
      ["Throat for a 13 kN nozzle", `${f1(R.throatDia(13000) * 1000)} mm`],
      ["Mass with full tank", `${f0(R.P.dry + m0)} kg`]
    ]);
  }

  // ---------- JUMP ----------
  const JS = { res: null };
  bindRange("#j-v0", "#o-v0", v => `${v} m/s · ${f0(mph(v))} mph`, v => R.J.v0 = v);
  bindRange("#j-lift", "#o-lift", v => `${f1(v)} kN`, v => R.J.liftKN = v);
  bindRange("#j-burn", "#o-burn", v => `${f2(v)} s`, v => R.J.burn = v);
  bindRange("#j-att", "#o-att", v => `${f1(v)} kN`, v => R.J.attKN = v);
  function setManoeuvre(spin) {
    R.J.spin = spin; $("#j-level").setAttribute("aria-pressed", String(!spin)); $("#j-spin").setAttribute("aria-pressed", String(spin));
    const set = (id, v) => { const el = $(id); el.value = v; el.dispatchEvent(new Event("input")); };
    if (spin) { set("#j-att", 15); set("#j-burn", 0.7); } else { set("#j-att", 5); set("#j-burn", 0.5); }
  }
  $("#j-level").addEventListener("click", () => setManoeuvre(false));
  $("#j-spin").addEventListener("click", () => setManoeuvre(true));

  function runJump() {
    const r = R.simJump(); JS.res = r;
    const st = $("#j-status");
    const hard = r.airtime !== null && (Math.abs(r.vLand) > 3 || Math.abs(r.landErr) > 0.35);
    if (r.clipped) setStatus(st, "bad", `Hits the ${r.clipped.n.toLowerCase()}`);
    else if (r.airtime === null) setStatus(st, "warn", "Never leaves the ground");
    else if (hard) setStatus(st, "warn", "Clears, hard landing");
    else setStatus(st, "good", "Clears all five, soft landing");
    const take = r.rec.find(p => p.phase !== "roll");
    $("#j-ro").innerHTML = kv([
      ["Highest point of the car", `${f1(r.apex)} m`],
      ["Closest gap to a vehicle", r.minClear === null ? "n/a" : `${f2(r.minClear)} m`],
      ["Time in the air", r.airtime ? `${f2(r.airtime)} s` : "n/a"],
      ["Touchdown speed", `${f1(Math.abs(r.vLand))} m/s`],
      ["Air used", `${f0(r.air)} kg · ${f0(r.air / r.air0 * 100)}%`],
      ["Burn starts before row", `${f1(R.ROW0 - (take ? take.x : 0))} m`]
    ]);
    // charts
    const t0 = take ? take.t : 0, rec = r.rec.filter(p => p.t >= t0 - 0.2 && p.phase !== "landed" || (p.phase === "landed" && p.t < (r.rec.find(q => q.phase === "landed") || { t: 1e9 }).t + 0.4));
    const tEnd = rec.length ? rec[rec.length - 1].t - t0 : 1;
    lineChart($("#ch-jump-f"), {
      xMin: -0.2, xMax: Math.max(1, tEnd), yMin: 0, yMax: Math.max(10, R.LAYOUT.lift * R.J.liftKN * 1.1),
      xLabel: "time from lift-off (s)", yLabel: "thrust (kN)",
      series: [
        { color: "frost", label: "lift, 4 nozzles", pts: rec.map(p => [p.t - t0, p.Fl / 1e3]), dot: false },
        { color: "amber", label: "attitude", pts: rec.map(p => [p.t - t0, p.Fa / 1e3]), dot: false }
      ],
      refs: [{ y: (R.P.dry + R.airMass0()) * R.G0 / 1e3, label: "car weight", color: "muted" }]
    });
    lineChart($("#ch-jump-p"), {
      xMin: -0.2, xMax: Math.max(1, tEnd), yMin: 0, yMax: R.P.P0bar * 1.08,
      xLabel: "time from lift-off (s)", yLabel: "tank pressure (bar)",
      series: [{ color: "frost", label: "", pts: rec.map(p => [p.t - t0, p.P / 1e5]) }],
      refs: [{ y: R.P.Pregbar, label: "regulator", color: "amber" }]
    });
    JS.restT = apexTime(r);
    drawJump(JS.restT);
  }
  function apexTime(r) { let best = r.rec[0], hi = -1; for (const p of r.rec) { if (p.phase !== "roll" && p.y > hi) { hi = p.y; best = p; } } return best.t; }
  function drawJump(t) {
    const r = JS.res; if (!r) return; const pal = palette(); const cv = $("#cv-jump");
    const w0 = Math.max(240, cv.parentElement.clientWidth);
    const xMin = Math.min(-16, r.plan.xBurn - 3), xMax = R.ROW1 + 16;
    const s = w0 / (xMax - xMin);
    const top = Math.max(8, Math.min(r.apex + 3, 24));
    const hCss = Math.max(w0 < 600 ? 220 : 300, Math.round(top * s + 46));
    const { c, w, h } = prep(cv, hCss);
    const gy = h - 30; const SX = x => (x - xMin) * s, SY = y => gy - y * s;
    sky(c, w, h, pal);
    // ground + distance ticks
    c.fillStyle = pal.ground; c.fillRect(0, gy, w, h - gy);
    c.font = `10px ${pal.mono}`; c.fillStyle = pal.bg; c.textAlign = "center"; c.textBaseline = "top";
    for (let x = Math.ceil(xMin / 10) * 10; x <= xMax; x += 10) { c.fillRect(SX(x), gy, 1, 6); c.fillText(`${x} m`, SX(x), gy + 9); }
    // obstacles
    R.OBS.forEach(o => {
      c.fillStyle = pal.obs; c.strokeStyle = pal.obsInk; c.lineWidth = 1;
      const x = SX(o.x0), y = SY(o.H), ww = o.L * s, hh = o.H * s, rr = Math.min(6, hh * 0.3);
      c.beginPath(); c.moveTo(x, gy); c.lineTo(x, y + rr); c.quadraticCurveTo(x, y, x + rr, y); c.lineTo(x + ww - rr, y); c.quadraticCurveTo(x + ww, y, x + ww, y + rr); c.lineTo(x + ww, gy); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = pal.ink; [0.22, 0.78].forEach(f => { c.beginPath(); c.arc(x + ww * f, gy - 0.32 * s, Math.max(2, 0.36 * s), 0, TAU); c.fill(); });
      if (s > 9) { c.fillStyle = pal.obsInk; c.font = `${s > 13 ? 11 : 10}px ${pal.mono}`; c.textAlign = "center"; c.textBaseline = "bottom"; c.fillText(o.n, x + ww / 2, y - 3); }
    });
    // planned path
    c.strokeStyle = pal.frost; c.globalAlpha = 0.55; c.setLineDash([4, 5]); c.lineWidth = 1.5; c.beginPath();
    r.rec.forEach((p, i) => { const X = SX(p.x), Y = SY(p.y); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    // travelled path
    c.strokeStyle = pal.frost; c.lineWidth = 2; c.beginPath(); let started = false;
    for (const p of r.rec) { if (p.t > t) break; const X = SX(p.x), Y = SY(p.y); started ? c.lineTo(X, Y) : (c.moveTo(X, Y), started = true); } c.stroke();
    // burn marker
    const bx = SX(r.plan.xBurn); c.fillStyle = pal.amber; c.fillRect(bx - 1, gy - 10, 2, 10); c.font = `10px ${pal.mono}`; c.textAlign = "center"; c.textBaseline = "bottom"; c.fillText("burn", bx, gy - 12);
    // car
    const p = sampleAt(r.rec, t); const fl = R.LAYOUT.lift * R.J.liftKN * 1e3; const tmax = 2 * R.J.attKN * 1e3 * R.CAR.arm;
    drawCar(c, SX(p.x), SY(p.y), p.th, s, pal, { lift: p.Fl / fl, att: p.tq / tmax, rear: 0 });
    if (r.clipped && t >= r.clipped.t) { c.strokeStyle = pal.bad; c.lineWidth = 3; const cx = SX(r.clipped.x), cy = SY(r.clipped.y); c.beginPath(); c.moveTo(cx - 8, cy - 8); c.lineTo(cx + 8, cy + 8); c.moveTo(cx + 8, cy - 8); c.lineTo(cx - 8, cy + 8); c.stroke(); }
    // HUD
    c.fillStyle = pal.ink; c.font = `12px ${pal.mono}`; c.textAlign = "left"; c.textBaseline = "top";
    const low = R.lowest(p.x, p.y, p.th);
    c.fillText(`t ${f2(Math.max(0, p.t - r.rec[0].t))} s   height ${f1(Math.max(0, low))} m   tank ${f0(p.P / 1e5)} bar`, 10, 10);
  }

  // ---------- LAUNCH ----------
  const LS = { res: null };
  bindRange("#l-rear", "#o-rear", v => `${f1(v)} kN`, v => R.L.rearKN = v);
  bindRange("#l-fan", "#o-fan", v => `${f1(v)} kPa`, v => R.L.fanKPa = v);
  bindRange("#l-mu", "#o-mu", v => f2(v), v => R.L.mu = v);
  bindRange("#l-pow", "#o-pow", v => `${f0(v)} kW`, v => R.L.motorKW = v);
  const LANES = [{ label: "Tyres only", color: "muted" }, { label: "+ suction fans", color: "amber" }, { label: "+ fans + 2 rear thrusters", color: "frost" }];
  function runLaunch() {
    const res = [0, 1, 2].map(m => R.simLaunch(m)); LS.res = res;
    const tt = r => r.t060 ? `${f2(r.t060)} s` : "over 8 s";
    const r2 = res[2];
    $("#l-ro").innerHTML = kv([
      ["0-60, tyres only", tt(res[0])], ["0-60, + fans", tt(res[1])], ["0-60, + fans + thrusters", tt(r2)],
      ["Distance to 60 mph", `${f1(r2.dist)} m`],
      ["Air used by thrusters", `${f1(r2.air)} kg · ${f0(r2.air / R.airMass0() * 100)}%`],
      ["Thruster air flow", `${f1(2 * R.L.rearKN * 1e3 / (R.ispAt(R.P.Pregbar * 1e5, R.P.T0) * R.G0))} kg/s`],
      ["Fan power", `${f0(r2.fanKW)} kW`]
    ]);
    LS.tMax = Math.max(...res.map(r => r.rec[r.rec.length - 1].t));
    lineChart($("#ch-launch-v"), {
      xMin: 0, xMax: Math.ceil(LS.tMax * 4) / 4 + 0.05, yMin: 0, yMax: 66, xLabel: "time (s)", yLabel: "speed (mph)",
      series: res.map((r, i) => ({ color: LANES[i].color, label: ["tyres", "+ fans", "+ thrusters"][i], pts: r.rec.map(p => [p.t, mph(p.v)]) })),
      refs: [{ y: 60, label: "60 mph", color: "muted" }]
    });
    drawLaunchBars();
    drawLaunch(LS.tMax);
  }
  function drawLaunchBars() {
    // force budget at 30 mph for the thruster car
    const cv = $("#ch-launch-b"); const pal = palette(); const { c, w, h } = prep(cv, 210);
    c.fillStyle = pal.panel; c.fillRect(0, 0, w, h);
    const m = R.P.dry + R.airMass0(), v = 13.41;
    const Nbase = m * R.G0, Nfan = R.L.fanKPa * 1e3 * R.FAN.A;
    const motorCap = R.L.motorKW * 1e3 / v;
    const tyreBase = Math.min(R.L.mu * Nbase, motorCap), tyreFan = Math.min(R.L.mu * (Nbase + Nfan), motorCap) - tyreBase;
    const thr = 2 * R.L.rearKN * 1e3, drag = 0.5 * 1.2 * R.L.CdA * v * v + R.L.crr * (Nbase + Nfan);
    const items = [["Tyres, own weight", tyreBase, "muted"], ["Extra grip from fans", Math.max(0, tyreFan), "amber"], ["Rear thrusters", thr, "frost"], ["Drag and rolling loss", -drag, "bad"]];
    const total = items.reduce((a, b) => a + b[1], 0);
    const maxV = Math.max(...items.map(i => Math.abs(i[1])), 1);
    const lw = Math.min(170, w * 0.42), x0 = lw + 8, bw = w - x0 - 70, rowH = (h - 40) / items.length;
    c.font = `12px ${pal.body}`; c.textBaseline = "middle";
    items.forEach((it, i) => {
      const y = 12 + i * rowH + rowH / 2; const len = Math.abs(it[1]) / maxV * bw;
      c.fillStyle = pal.ink; c.textAlign = "right"; c.fillText(it[0], lw, y);
      c.fillStyle = pal[it[2]]; c.fillRect(x0, y - 9, Math.max(1, len), 18);
      c.fillStyle = pal.ink; c.textAlign = "left"; c.font = `12px ${pal.mono}`; c.fillText(`${it[1] < 0 ? "−" : ""}${f1(Math.abs(it[1]) / 1e3)} kN`, x0 + len + 6, y); c.font = `12px ${pal.body}`;
    });
    c.fillStyle = pal.muted; c.font = `11px ${pal.mono}`; c.textAlign = "left"; c.textBaseline = "bottom";
    c.fillText(`net ${f1(total / 1e3)} kN = ${f2(total / m / R.G0)} g`, x0, h - 6);
  }
  function drawLaunch(t) {
    const res = LS.res; if (!res) return; const pal = palette(); const cv = $("#cv-launch");
    const w0 = Math.max(240, cv.parentElement.clientWidth);
    const dMax = Math.max(...res.map(r => r.dist)) + 8;
    const lw = w0 < 500 ? 0 : 0;
    const s = (w0 - 24 - lw) / dMax;
    const laneH = Math.max(64, Math.min(110, 2.6 * s + 34));
    const { c, w, h } = prep(cv, Math.round(laneH * 3 + 8));
    sky(c, w, h, pal);
    res.forEach((r, i) => {
      const top = 4 + i * laneH, gy = top + laneH - 16;
      c.fillStyle = pal.ground; c.fillRect(0, gy, w, 3);
      const SX = x => 12 + lw + (x + 2.3) * s;
      const fin = r.dist; c.fillStyle = pal[LANES[i].color]; c.fillRect(SX(fin) + 2.2 * s, gy - laneH * 0.55, 2, laneH * 0.55);
      const p = sampleAt(r.rec, t);
      const done = t >= r.rec[r.rec.length - 1].t;
      drawCar(c, SX(p.x), gy - 0.55 * s, 0, s, pal, { rear: (p.F || 0) / (2 * Math.max(R.L.rearKN, 1) * 1e3) * (done ? 0 : 1), lift: 0, att: 0 });
      c.font = `12px ${pal.body}`; c.fillStyle = pal.ink; c.textAlign = "left"; c.textBaseline = "top"; c.fillText(LANES[i].label, 10, top + 4);
      c.font = `12px ${pal.mono}`; c.textAlign = "right";
      c.fillText(`${f0(mph(p.v))} mph${done && r.t060 ? `  ·  ${f2(r.t060)} s` : ""}`, w - 10, top + 4);
    });
  }

  // ---------- HOVER ----------
  const HS = { res: null };
  bindRange("#h-alt", "#o-alt", v => `${f1(v)} m`, v => R.H.alt = v);
  bindRange("#h-lift", "#o-hlift", v => `${f1(v)} kN`, v => R.H.liftKN = v);
  function runHover() {
    const r = R.simHover(); HS.res = r;
    $("#h-ro").innerHTML = kv([
      ["Reached target height", r.reached ? "yes" : "no"],
      ["Time airborne", `${f1(r.flight)} s`],
      ["Time holding height", `${f2(r.holdTime)} s`],
      ["Touchdown speed", `${f1(Math.abs(r.vTouch))} m/s`],
      ["Air used", `${f0(r.air)} kg · ${f0(r.air / r.air0 * 100)}%`],
      ["Tank temperature at end", `${f0(r.Tend - 273.15)} °C`],
      ["Specific impulse, start to end", `${f0(r.isp0)} → ${f0(r.ispEnd)} s`]
    ]);
    const tEnd = r.rec[r.rec.length - 1].t;
    lineChart($("#ch-hover-p"), { xMin: 0, xMax: tEnd, yMin: 0, yMax: R.P.P0bar * 1.08, xLabel: "time (s)", yLabel: "pressure (bar)",
      series: [{ color: "frost", label: "tank", pts: r.rec.map(p => [p.t, p.P / 1e5]) }], refs: [{ y: R.P.Pregbar, label: "regulator", color: "amber" }] });
    lineChart($("#ch-hover-f"), { xMin: 0, xMax: tEnd, yMin: 0, yMax: Math.max(...r.rec.map(p => p.F / 1e3), 25) * 1.1, xLabel: "time (s)", yLabel: "force (kN)",
      series: [{ color: "frost", label: "lift thrust", pts: r.rec.map(p => [p.t, p.F / 1e3]) }, { color: "muted", label: "weight", pts: r.rec.map(p => [p.t, p.W / 1e3]), dot: false, width: 1.5 }] });
    let mid = r.rec.find(p => p.phase === "hold") || r.rec.reduce((a, b) => b.y > a.y ? b : a, r.rec[0]);
    HS.restT = mid.t; drawHover(HS.restT);
  }
  function drawHover(t) {
    const r = HS.res; if (!r) return; const pal = palette(); const cv = $("#cv-hover");
    const w0 = Math.max(240, cv.parentElement.clientWidth); const hCss = Math.round(Math.min(380, Math.max(240, w0 * 0.5)));
    const { c, w, h } = prep(cv, hCss);
    sky(c, w, h, pal);
    const gy = h - 34, topM = Math.max(3.2, R.H.alt + 1.6), s = Math.min((gy - 30) / (topM + 0.6), (w - 130) / 7.5);
    c.fillStyle = pal.ground; c.fillRect(0, gy, w, h - gy);
    // height ruler
    c.font = `10px ${pal.mono}`; c.textAlign = "right"; c.textBaseline = "middle";
    for (let m = 0; m <= topM; m += 0.5) { const y = gy - m * s; c.fillStyle = pal.muted; c.fillRect(30, y, m % 1 === 0 ? 10 : 5, 1); if (m % 1 === 0) c.fillText(`${m} m`, 27, y); }
    c.strokeStyle = pal.amber; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(44, gy - R.H.alt * s); c.lineTo(w - 110, gy - R.H.alt * s); c.stroke(); c.setLineDash([]);
    c.fillStyle = pal.amber; c.textAlign = "left"; c.fillText("target", 48, gy - R.H.alt * s - 9);
    const p = sampleAt(r.rec, t); const Fmax = R.LAYOUT.lift * R.H.liftKN * 1e3;
    const cx = 44 + (w - 160) / 2;
    drawCar(c, cx, gy - (p.y + 0.55) * s, 0, s, pal, { lift: p.F / Fmax, rear: 0, att: 0 });
    // tank gauge
    const gx = w - 70, gTop = 26, gH = gy - 60, gW = 28;
    c.strokeStyle = pal.ink; c.lineWidth = 1.5; c.beginPath(); c.roundRect ? c.roundRect(gx, gTop, gW, gH, 14) : c.rect(gx, gTop, gW, gH); c.stroke();
    const frac = Math.max(0, p.P / (R.P.P0bar * 1e5)); c.fillStyle = pal.frost; c.globalAlpha = 0.75;
    c.fillRect(gx + 3, gTop + 3 + (gH - 6) * (1 - frac), gW - 6, (gH - 6) * frac); c.globalAlpha = 1;
    const ry = gTop + 3 + (gH - 6) * (1 - R.P.Pregbar / R.P.P0bar); c.fillStyle = pal.amber; c.fillRect(gx - 6, ry, gW + 12, 2);
    c.fillStyle = pal.ink; c.font = `11px ${pal.mono}`; c.textAlign = "center"; c.textBaseline = "top";
    c.fillText(`${f0(p.P / 1e5)} bar`, gx + gW / 2, gTop + gH + 6); c.fillText(`${f0(p.T - 273.15)} °C`, gx + gW / 2, gTop + gH + 20);
    c.textBaseline = "bottom"; c.fillStyle = pal.muted; c.fillText("tank", gx + gW / 2, gTop - 4);
    c.fillStyle = pal.ink; c.textAlign = "left"; c.textBaseline = "top"; c.font = `12px ${pal.mono}`;
    c.fillText(`t ${f2(p.t)} s   height ${f2(p.y)} m   thrust ${f1(p.F / 1e3)} kN`, 48, 10);
  }

  // ---------- UPSIDE DOWN ----------
  bindRange("#u-ang", "#o-ang", v => `${v}°${v === 0 ? " · road" : v === 90 ? " · wall" : v === 180 ? " · ceiling" : ""}`, v => R.U.angle = v);
  bindRange("#u-dp", "#o-dp", v => `${f2(v)} kPa`, v => R.U.dp = v);
  bindRange("#u-gap", "#o-gap", v => `${f1(v)} mm`, v => R.U.gap = v);
  function runUpside() {
    const u = R.upside();
    setStatus($("#u-status"), u.holds ? "good" : "bad", u.holds ? "Car stays put" : (u.N <= 0 ? "Car falls off" : "Car slides"));
    $("#u-ro").innerHTML = kv([
      ["Suction force", `${f1(u.S / 1e3)} kN`], ["Weight", `${f1(u.W / 1e3)} kN`],
      ["Pressing tyres on", `${f1(Math.max(0, u.N) / 1e3)} kN`],
      ["Grip available / needed", `${f1(u.grip / 1e3)} / ${f1(u.shear / 1e3)} kN`],
      ["Air leaking under skirt", `${f1(u.Q)} m³/s`], ["Fan power", `${f0(u.Pw / 1e3)} kW`]
    ]);
    const angs = []; for (let a = 0; a <= 180; a += 2) angs.push(a);
    const pts = angs.map(a => R.upside(a));
    lineChart($("#ch-up-a"), { xMin: 0, xMax: 180, yMin: 0, yMax: Math.max(...pts.map(p => p.grip / 1e3), 25) * 1.08, xLabel: "surface angle (°)", yLabel: "force (kN)", vline: R.U.angle,
      series: [{ color: "frost", label: "grip available", pts: pts.map((p, i) => [angs[i], p.grip / 1e3]) }, { color: "amber", label: "grip needed", pts: pts.map((p, i) => [angs[i], p.shear / 1e3]) }] });
    const dps = []; for (let d = 0; d <= 15; d += 0.25) dps.push(d);
    lineChart($("#ch-up-p"), { xMin: 0, xMax: 15, yMin: 0, yMax: Math.max(20, R.fanPower(15e3, R.U.gap) / 1e3 * 1.08), xLabel: "underbody suction (kPa)", yLabel: "fan power (kW)", vline: R.U.dp,
      series: [{ color: "frost", label: `gap ${f1(R.U.gap)} mm`, pts: dps.map(d => [d, R.fanPower(d * 1e3, R.U.gap) / 1e3]) }],
      refs: [{ y: 0, label: "", color: "muted" }] });
    drawUpside();
  }
  function drawUpside() {
    const pal = palette(); const cv = $("#cv-upside"); const w0 = Math.max(240, cv.parentElement.clientWidth);
    const { c, w, h } = prep(cv, Math.round(Math.min(400, Math.max(260, w0 * 0.55))));
    sky(c, w, h, pal);
    const u = R.upside(); const a = R.U.angle * Math.PI / 180;
    const cx = w / 2, cy = h / 2, s = Math.min(w / 9, h / 5.2);
    // surface normal (pointing out of surface, towards car) in world, y up: rotate (0,1) by angle
    const nx = -Math.sin(a), ny = Math.cos(a), tx = Math.cos(a), ty = Math.sin(a);
    const toS = (x, y) => [cx + x * s, cy - y * s];
    // surface slab
    c.fillStyle = pal.ground; c.beginPath();
    const L = 6; const p1 = toS(-tx * L, -ty * L), p2 = toS(tx * L, ty * L), p3 = toS(tx * L - nx * 0.5, ty * L - ny * 0.5), p4 = toS(-tx * L - nx * 0.5, -ty * L - ny * 0.5);
    c.moveTo(...p1); c.lineTo(...p2); c.lineTo(...p3); c.lineTo(...p4); c.closePath(); c.fill();
    // car: bottom of wheels on surface, centre of mass 0.55 m along normal
    const [carX, carY] = toS(nx * 0.55, ny * 0.55);
    drawCar(c, carX, carY, a, s, pal, null);
    // force arrows scaled
    const k = (s * 2.2) / Math.max(u.W, u.S, 1);
    const [ox, oy] = [carX, carY];
    c.fillStyle = pal.ink; arrow(c, ox, oy, ox, oy + u.W * k, pal.ink, `weight ${f1(u.W / 1e3)} kN`, pal);
    arrow(c, ox, oy, ox - nx * u.S * k, oy + ny * u.S * k, pal.frost, `suction ${f1(u.S / 1e3)} kN`, pal);
    if (u.shear > 1) { const sgn = Math.sin(a) > 0 ? 1 : -1; const g = Math.min(u.grip, u.shear); arrow(c, ox, oy, ox + tx * sgn * g * k, oy - ty * sgn * g * k, u.holds ? pal.good : pal.bad, `grip ${f1(u.grip / 1e3)} kN`, pal); }
  }

  // ---------- RECHARGE ----------
  bindRange("#r-spec", "#o-spec", v => `${f2(v)} kWh`, v => R.RC.kwhPerM3 = v);
  bindRange("#r-comp", "#o-comp", v => `${v} kW`, v => R.RC.compKW = v);
  bindRange("#r-eff", "#o-eff", v => `${v} Wh/mi`, v => R.RC.whPerMile = v);
  function runRecharge() {
    const m0 = R.airMass0(); const full = R.rechargeFor(m0);
    const items = [
      ["Full tank", m0],
      ["One jump (level)", JS.res ? JS.res.air : 0],
      ["One hover", HS.res ? HS.res.air : 0],
      ["One launch", LS.res ? LS.res[2].air : 0]
    ].map(([n, kg]) => ({ n, kg, ...R.rechargeFor(kg) }));
    $("#r-ro").innerHTML = kv([
      ["Free air to fill", `${f0(full.fad)} m³`],
      ["Energy, full tank", `${f1(full.E)} kWh`],
      ["Theoretical minimum", `${f1(R.isothermalMin())} kWh`],
      ["Time to refill", `${full.hours < 1 ? f0(full.hours * 60) + " min" : f1(full.hours) + " h"}`],
      ["Range given up, full tank", `${f0(full.miles)} mi`],
      ["Range given up, one launch", `${f1(items[3].miles)} mi`]
    ]);
    const pal = palette(); const cv = $("#cv-recharge"); const w0 = Math.max(240, cv.parentElement.clientWidth);
    const { c, w, h } = prep(cv, 300); c.fillStyle = pal.panel; c.fillRect(0, 0, w, h);
    const lw = Math.min(150, w * 0.34), x0 = lw + 10, bw = w - x0 - 120, rowH = (h - 50) / items.length, maxE = Math.max(...items.map(i => i.E), 1);
    c.font = `12px ${pal.mono}`; c.fillStyle = pal.muted; c.textAlign = "left"; c.textBaseline = "top"; c.fillText("battery energy to refill, and equivalent driving range", 10, 10);
    items.forEach((it, i) => {
      const y = 38 + i * rowH + rowH / 2, len = it.E / maxE * bw;
      c.font = `13px ${pal.body}`; c.fillStyle = pal.ink; c.textAlign = "right"; c.textBaseline = "middle"; c.fillText(it.n, lw, y - 2);
      c.font = `11px ${pal.mono}`; c.fillStyle = pal.muted; c.fillText(`${f0(it.kg)} kg air`, lw, y + 13);
      c.fillStyle = i === 0 ? pal.frost : pal.amber; c.globalAlpha = i === 0 ? 1 : 0.85; c.fillRect(x0, y - 11, Math.max(1, len), 22); c.globalAlpha = 1;
      c.fillStyle = pal.ink; c.textAlign = "left"; c.font = `12px ${pal.mono}`; c.fillText(`${f1(it.E)} kWh · ${f0(it.miles)} mi`, x0 + len + 8, y);
    });
  }

  // ---------- run all + playback ----------
  function rerun() { stop(); renderDerived(); runJump(); runLaunch(); runHover(); runUpside(); runRecharge(); }
  let raf = null, playing = null;
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; if (playing) { $(`#run-${playing}`).textContent = `Run ${playing}`; playing = null; } }
  const PLAY = {
    jump: { t0: () => JS.res.rec[0].t, t1: () => JS.res.rec[JS.res.rec.length - 1].t, draw: drawJump, rest: () => JS.restT },
    launch: { t0: () => 0, t1: () => LS.tMax + 0.3, draw: drawLaunch, rest: () => LS.tMax },
    hover: { t0: () => 0, t1: () => HS.res.rec[HS.res.rec.length - 1].t, draw: drawHover, rest: () => HS.restT }
  };
  function speedOf(name) { const b = document.querySelector(`#s-${name} .seg button[data-speed][aria-pressed=true]`); return b ? +b.dataset.speed : 1; }
  function play(name) {
    if (playing === name) { stop(); PLAY[name].draw(PLAY[name].rest()); return; }
    stop(); const P = PLAY[name]; playing = name; $(`#run-${name}`).textContent = "Stop";
    if (reduceMotion) { P.draw(P.t1()); stop(); return; }
    const a = P.t0(), b = P.t1(), sp = speedOf(name); let start = null;
    const step = ts => { if (start === null) start = ts; const t = a + (ts - start) / 1000 * sp; P.draw(Math.min(t, b)); if (t < b) raf = requestAnimationFrame(step); else { raf = null; $(`#run-${name}`).textContent = `Replay ${name}`; playing = null; } };
    raf = requestAnimationFrame(step);
  }
  ["jump", "launch", "hover"].forEach(n => $(`#run-${n}`).addEventListener("click", () => play(n)));
  document.querySelectorAll(".seg").forEach(g => g.addEventListener("click", e => {
    const b = e.target.closest("button[data-speed]"); if (!b) return;
    g.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  }));

  // ---------- tabs ----------
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function show(id) {
    stop();
    tabs.forEach(t => { const on = t.id === "t-" + id; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; $("#" + t.getAttribute("aria-controls")).hidden = !on; });
    redraw();
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => { show(t.id.slice(2)); try { history.replaceState(null, "", "#" + t.id.slice(2)); } catch (e) {} });
    t.addEventListener("keydown", e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click(); } });
  });
  function current() { const t = tabs.find(x => x.getAttribute("aria-selected") === "true"); return t ? t.id.slice(2) : "jump"; }
  function redraw() {
    const c = current();
    if (c === "jump") runJump(); else if (c === "launch") runLaunch(); else if (c === "hover") runHover(); else if (c === "upside") runUpside(); else if (c === "recharge") runRecharge();
  }
  let rt = null; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (!playing) redraw(); }, 120); });
  try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!playing) redraw(); }); } catch (e) {}
  new MutationObserver(() => { if (!playing) redraw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // ---------- boot ----------
  const start = (location.hash || "").slice(1);
  rerun();
  if (tabs.some(t => t.id === "t-" + start)) show(start); else show("jump");
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!playing) redraw(); });
})();
