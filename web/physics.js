/*
 * Roadster Thruster Lab : physics core
 * Cold-gas thruster, tank blowdown, launch, jump, hover, suction and recharge models.
 * Units: SI throughout (m, kg, s, N, Pa, K) unless a name says otherwise.
 * Runs in the browser (globals) and in Node (module.exports) for testing.
 */
(function (root) {
  "use strict";

  // ---------- constants ----------
  const G0 = 9.80665;      // standard gravity, m/s^2
  const RG = 287.05;       // specific gas constant of air, J/(kg K)
  const GAM = 1.4;         // ratio of specific heats, air
  const PA = 101325;       // ambient pressure, Pa
  const RHO_AIR = 1.204;   // free air density at 20 C, kg/m^3
  const CK = Math.pow(2 / (GAM + 1), (GAM + 1) / (2 * (GAM - 1)));

  // ---------- vehicle + system parameters ----------
  // Tesla-confirmed (15 Oct 2026): 600 L tank, 10 thrusters, rechargeable air, suction fans.
  // Everything else is a labelled engineering assumption and can be changed in the UI.
  const P = {
    P0bar: 310,     // tank pressure, bar (assumed, about 4,500 psi)
    Pregbar: 100,   // regulated feed pressure to the nozzles, bar (assumed)
    V: 0.600,       // tank volume, m^3 (Tesla: 600 L)
    T0: 293.15,     // tank start temperature, K
    dry: 1900,      // car mass without air, kg (assumed)
    eps: 8          // nozzle exit/throat area ratio (assumed)
  };

  // Thruster layout used by the model: 2 rear + 4 lift + 4 attitude = 10
  const LAYOUT = { rear: 2, lift: 4, att: 4 };

  // ---------- nozzle (isentropic, choked) ----------
  const NOZ = { PR: 0, CFm: 0, Me: 0 };
  function machFromEps(eps) {
    let lo = 1.0001, hi = 12;
    for (let i = 0; i < 90; i++) {
      const M = (lo + hi) / 2;
      const f = (1 / M) * Math.pow((2 / (GAM + 1)) * (1 + (GAM - 1) / 2 * M * M), (GAM + 1) / (2 * (GAM - 1))) - eps;
      if (f < 0) lo = M; else hi = M;
    }
    return (lo + hi) / 2;
  }
  function setNozzle() {
    const M = machFromEps(P.eps);
    NOZ.Me = M;
    NOZ.PR = Math.pow(1 + (GAM - 1) / 2 * M * M, -GAM / (GAM - 1)); // pe / pc
    NOZ.CFm = Math.sqrt(2 * GAM * GAM / (GAM - 1) * Math.pow(2 / (GAM + 1), (GAM + 1) / (GAM - 1)) * (1 - Math.pow(NOZ.PR, (GAM - 1) / GAM)));
  }
  setNozzle();
  const Cf = pc => NOZ.CFm + (pc * NOZ.PR - PA) / pc * P.eps;     // thrust coefficient
  const cstar = T => Math.sqrt(RG * T / GAM) / CK;                  // characteristic velocity
  const ispAt = (pc, T) => Cf(pc) * cstar(T) / G0;                  // specific impulse, s
  const airMass0 = () => {
    const Z = 1 + 0.00039 * P.P0bar;                                // compressibility of air near 20 C
    return P.P0bar * 1e5 * P.V / (Z * RG * P.T0);
  };
  const throatDia = F => { const pc = P.Pregbar * 1e5; return Math.sqrt(4 * F / (Cf(pc) * pc) / Math.PI); };

  // ---------- tank with adiabatic blowdown ----------
  class Tank {
    constructor() { this.m0 = airMass0(); this.m = this.m0; this.P0 = P.P0bar * 1e5; this.P = this.P0; this.T = P.T0; }
    get pc() { return Math.min(P.Pregbar * 1e5, this.P); }
    isp() { return ispAt(Math.max(this.pc, 2e5), this.T); }
    // Request thrust Fdem (N) for dt (s). Returns delivered thrust (N).
    fire(Fdem, dt) {
      if (Fdem <= 0) return 0;
      const preg = P.Pregbar * 1e5, pc = this.pc;
      if (pc < 15e5) return 0;                       // too little pressure to run the nozzles
      const F = Fdem * pc / preg;                    // thrust falls with feed pressure once below regulator
      const mdot = F / (ispAt(pc, this.T) * G0);
      this.m = Math.max(this.m - mdot * dt, 1e-6);
      const r = this.m / this.m0;
      this.P = this.P0 * Math.pow(r, GAM);           // isentropic expansion of the gas left behind
      this.T = P.T0 * Math.pow(r, GAM - 1);
      return F;
    }
  }

  // ---------- suction fans ----------
  const FAN = { A: 3.0, perim: 11.6, Cd: 0.6, eta: 0.6 };
  function fanFlow(dp, gapMm) { return FAN.Cd * (gapMm / 1000) * FAN.perim * Math.sqrt(2 * Math.max(dp, 0) / 1.2); }
  function fanPower(dp, gapMm) { return fanFlow(dp, gapMm) * dp / FAN.eta; }

  // ---------- launch 0-60 mph ----------
  const L = { mu: 1.3, motorKW: 950, fanKPa: 6, rearKN: 13, CdA: 0.55, crr: 0.012, gap: 5 };
  const MPH60 = 26.8224;
  function simLaunch(mode) { // 0 tyres only, 1 + suction fans, 2 + fans + rear thrusters
    const tk = new Tank(); const dt = 2e-4;
    let v = 0, x = 0, t = 0, F = 0;
    const dp = mode >= 1 ? L.fanKPa * 1e3 : 0;
    const rec = [{ t: 0, v: 0, x: 0, F: 0 }];
    while (v < MPH60 && t < 8) {
      const m = P.dry + tk.m, N = m * G0 + dp * FAN.A;
      const Ft = Math.min(L.mu * N, L.motorKW * 1e3 / Math.max(v, 0.3));
      F = mode === 2 ? tk.fire(LAYOUT.rear * L.rearKN * 1e3, dt) : 0;
      const a = (Ft + F - 0.5 * 1.2 * L.CdA * v * v - L.crr * N) / m;
      v += a * dt; x += v * dt; t += dt;
      if (t - rec[rec.length - 1].t >= 0.004) rec.push({ t, v, x, F });
    }
    rec.push({ t, v, x, F });
    return { t060: v >= MPH60 ? t : null, dist: x, air: tk.m0 - tk.m, rec, fanKW: mode >= 1 ? fanPower(dp, L.gap) / 1e3 : 0 };
  }

  // ---------- jump over a row of vehicles ----------
  const J = { v0: 22, liftKN: 13, burn: 0.5, attKN: 5, spin: false };
  const CAR = { L: 4.4, cg: 0.55, top: 0.58, bot: -0.42, I: 3500, arm: 1.9 };
  const OBS_DEF = [
    { n: "Robotaxi", L: 4.2, H: 1.50 },
    { n: "Pickup", L: 5.7, H: 1.90 },
    { n: "Semi tractor", L: 7.0, H: 4.10 },
    { n: "SUV", L: 4.75, H: 1.62 },
    { n: "Saloon", L: 4.7, H: 1.44 }
  ];
  const OBS = (() => { let x = 0; return OBS_DEF.map(o => { const r = Object.assign({}, o, { x0: x, x1: x + o.L }); x += o.L + 0.6; return r; }); })();
  const ROW0 = OBS[0].x0, ROW1 = OBS[OBS.length - 1].x1;

  const CAR_PTS = (() => {
    const p = [];
    for (let i = 0; i <= 8; i++) { const x = -2.2 + i * 0.55; p.push([x, CAR.bot]); p.push([x, CAR.top]); }
    p.push([-2.2, 0.08], [2.2, -0.15], [-1.35, -0.55], [1.35, -0.55]);
    return p;
  })();
  function carPts(x, y, th) {
    const c = Math.cos(th), s = Math.sin(th);
    return CAR_PTS.map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
  }
  function lowest(x, y, th) { let m = Infinity; for (const p of carPts(x, y, th)) m = Math.min(m, p[1]); return m; }
  function angErr(th) { return th - 2 * Math.PI * Math.round(th / (2 * Math.PI)); }

  function planJump() {
    const m = P.dry + airMass0();
    const a = LAYOUT.lift * J.liftKN * 1e3 / m - G0;
    const vyb = a * J.burn, yb = 0.5 * a * J.burn * J.burn;
    const h = t => t <= J.burn ? 0.5 * a * t * t : yb + vyb * (t - J.burn) - 0.5 * G0 * (t - J.burn) ** 2;
    let tc = null;
    for (let t = 0; t < 4; t += 0.002) { if (h(t) >= OBS[0].H + 0.25) { tc = t; break; } }
    if (tc === null) tc = J.burn + Math.max(vyb, 0) / G0;
    return { xBurn: ROW0 - CAR.L / 2 - J.v0 * tc, a, vyb };
  }

  function simJump() {
    const pl = planJump(); const tk = new Tank(); const dt = 1e-3;
    let x = pl.xBurn - 14, y = CAR.cg, vx = J.v0, vy = 0, th = 0, om = 0, t = 0, phase = "roll", tb = 0, ts = 0;
    const Fl = LAYOUT.lift * J.liftKN * 1e3, Tmax = 2 * J.attKN * 1e3 * CAR.arm;
    const D = Math.max(0.6, Math.sqrt(1.15 * 5.774 * 2 * Math.PI * CAR.I / Tmax)); // shortest 360 the attitude thrusters can deliver
    const rec = []; let clipped = null, minClear = Infinity, apex = 0, tTake = null, tLand = null, vLand = 0, landErr = 0, lastRec = -1;
    const air = () => phase === "boost" || phase === "coast" || phase === "land";
    while (t < 14) {
      let Flift = 0, tau = 0, Fatt = 0;
      if (phase === "roll" && x >= pl.xBurn) { phase = "boost"; tb = t; tTake = t; om = 0.12; }
      if (phase === "boost") { Flift = tk.fire(Fl, dt); if (t - tb >= J.burn) { phase = "coast"; ts = t; } }
      if (air()) {
        let thRef = 0, omRef = 0, alRef = 0;
        if (J.spin && ts > 0) {
          const u = Math.min(1, Math.max(0, (t - ts) / D));
          thRef = 2 * Math.PI * (10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5);
          if (u < 1) { omRef = 2 * Math.PI * (30 * u ** 2 - 60 * u ** 3 + 30 * u ** 4) / D; alRef = 2 * Math.PI * (60 * u - 180 * u ** 2 + 120 * u ** 3) / (D * D); }
        }
        let tq = CAR.I * (alRef + 64 * (thRef - th) + 16 * (omRef - om));
        tq = Math.max(-Tmax, Math.min(Tmax, tq));
        const Fd = Math.abs(tq) / CAR.arm;
        if (Fd > 50) { Fatt = tk.fire(Fd, dt); tau = Math.sign(tq) * Fatt * CAR.arm; }
      }
      if (phase === "coast" && vy < 0) {
        const m = P.dry + tk.m, an = Fl * (tk.pc / (P.Pregbar * 1e5)) / m - G0;
        if (an > 0 && Math.abs(angErr(th)) < 0.25 && lowest(x, y, th) <= vy * vy / (2 * an) + 0.3) phase = "land";
      }
      if (phase === "land") { const mm = P.dry + tk.m; Flift = tk.fire(Math.max(0, Math.min(Fl, mm * (G0 + 8 * (-1.0 - vy)))), dt); }
      const m = P.dry + tk.m;
      if (air()) {
        vx += (-Math.sin(th) * Flift / m) * dt;
        vy += (Math.cos(th) * Flift / m - G0) * dt;
      }
      x += vx * dt; y += vy * dt; om += tau / CAR.I * dt; th += om * dt; t += dt;
      const pts = carPts(x, y, th);
      for (const o of OBS) for (const p of pts) {
        if (p[0] >= o.x0 && p[0] <= o.x1) {
          if (air()) minClear = Math.min(minClear, p[1] - o.H);
          if (p[1] < o.H && !clipped) clipped = { t, n: o.n, x: Math.min(Math.max(p[0], o.x0), o.x1), y: o.H };
        }
      }
      if (air()) {
        const low = lowest(x, y, th); apex = Math.max(apex, low);
        if (low <= 0 && vy < 0 && t - tb > 0.05) {
          tLand = t; vLand = vy; landErr = angErr(th); phase = "landed";
          y -= low; vy = 0; th = Math.round(th / (2 * Math.PI)) * 2 * Math.PI; om = 0; y = CAR.cg;
        }
      }
      if (t - lastRec >= 1 / 120) { rec.push({ t, x, y, th, Fl: Flift, Fa: Fatt, tq: tau, P: tk.P, phase }); lastRec = t; }
      if (phase === "landed" && x > ROW1 + 18) break;
      if (clipped && phase === "roll") break;
    }
    rec.push({ t, x, y, th, Fl: 0, Fa: 0, tq: 0, P: tk.P, phase });
    return {
      rec, clipped, minClear: isFinite(minClear) ? minClear : null, apex,
      airtime: tLand && tTake ? tLand - tTake : null, vLand, landErr,
      air: tk.m0 - tk.m, air0: tk.m0, plan: pl, xStart: pl.xBurn - 14
    };
  }

  // ---------- hover with altitude hold ----------
  const H = { alt: 1.5, liftKN: 13 };
  function simHover() {
    const tk = new Tank(); const dt = 1e-3; const preg = P.Pregbar * 1e5;
    let y = 0, vy = 0, t = 0, phase = "climb", tgt = H.alt, tReach = null, tDesc = null, vTouch = null, tLand = null;
    const Fmax = LAYOUT.lift * H.liftKN * 1e3; const rec = []; let last = -1; const isp0 = tk.isp();
    while (t < 60) {
      const m = P.dry + tk.m;
      if ((phase === "climb" || phase === "hold") && tk.P < 1.08 * preg) { phase = "descend"; tDesc = t; }
      if (phase === "climb" && y >= 0.95 * H.alt) { phase = "hold"; tReach = t; }
      let vref = 0;
      if (phase === "descend") { tgt = Math.max(0, tgt - 0.9 * dt); vref = tgt > 0 ? -0.9 : 0; }
      let F = 0;
      if (phase !== "landed") {
        const aCmd = G0 + 4 * (tgt - y) + 4.5 * (vref - vy);
        F = tk.fire(Math.max(0, Math.min(Fmax, m * aCmd)), dt);
      }
      let ay = F / m - G0;
      if (y <= 0 && ay < 0) { ay = 0; if (vy < 0) vy = 0; }
      const vPrev = vy;
      vy += ay * dt; y += vy * dt; t += dt;
      if (y < 0) {
        y = 0;
        if (phase !== "climb" && t > 0.5 && vTouch === null) { vTouch = vPrev; tLand = t; phase = "landed"; }
        vy = 0;
      }
      if (t - last >= 1 / 120) { rec.push({ t, y, P: tk.P, T: tk.T, F, W: m * G0, isp: tk.isp(), phase }); last = t; }
      if (phase === "landed" && t - tLand > 0.6) break;
    }
    return {
      rec, holdTime: tReach !== null && tDesc !== null ? Math.max(0, tDesc - tReach) : 0, reached: tReach !== null,
      flight: tLand || t, vTouch: vTouch || 0, air: tk.m0 - tk.m, air0: tk.m0, Tend: tk.T, isp0, ispEnd: tk.isp()
    };
  }

  // ---------- upside down: fans vs gravity ----------
  const U = { dp: 8, angle: 180, mu: 1.3, gap: 5 };
  function upside(angleDeg) {
    const ang = (angleDeg === undefined ? U.angle : angleDeg) * Math.PI / 180;
    const m = P.dry + airMass0(); const W = m * G0; const S = U.dp * 1e3 * FAN.A;
    const N = S + W * Math.cos(ang);                  // presses the tyres into the surface
    const shear = W * Math.abs(Math.sin(ang));        // tries to slide the car along the surface
    const grip = Math.max(0, N) * U.mu;
    return { W, S, N, shear, grip, holds: N > 0 && grip >= shear, Pw: fanPower(U.dp * 1e3, U.gap), Q: fanFlow(U.dp * 1e3, U.gap) };
  }

  // ---------- recharge ----------
  const RC = { kwhPerM3: 0.35, compKW: 20, whPerMile: 330 };
  function rechargeFor(airKg) {
    const fad = airKg / RHO_AIR, E = fad * RC.kwhPerM3;
    return { fad, E, hours: E / RC.compKW, miles: E * 1000 / RC.whPerMile };
  }
  function isothermalMin() { const m0 = airMass0(); return m0 * RG * P.T0 * Math.log(P.P0bar * 1e5 / PA) / 3.6e6; }

  const api = {
    G0, RG, GAM, PA, RHO_AIR, P, LAYOUT, NOZ, setNozzle, Cf, cstar, ispAt, airMass0, throatDia, Tank,
    FAN, fanFlow, fanPower, L, MPH60, simLaunch, J, CAR, OBS, ROW0, ROW1, carPts, lowest, angErr, planJump, simJump,
    H, simHover, U, upside, RC, rechargeFor, isothermalMin
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.RTL = api;
})(typeof window !== "undefined" ? window : globalThis);
