// Prints the web model's headline numbers as JSON so MATLAB can cross-check
// the Simulink models against it. Usage: node web/export_reference.js
const R = require("./physics.js");
const j = R.simJump(), h = R.simHover();
const take = j.rec.find(p => p.phase !== "roll");
const out = {
  airMass: R.airMass0(),
  isp: R.ispAt(R.P.Pregbar * 1e5, R.P.T0),
  throatMm: R.throatDia(13000) * 1000,
  t060: [0, 1, 2].map(m => R.simLaunch(m).t060),
  launchAir: R.simLaunch(2).air,
  jump: { apex: j.apex, minClear: j.minClear, airtime: j.airtime, vLand: Math.abs(j.vLand), air: j.air, xBurn: j.plan.xBurn, tTake: take ? take.t : null },
  hover: { flight: h.flight, hold: h.holdTime, vTouch: Math.abs(h.vTouch), air: h.air, Tend: h.Tend - 273.15 }
};
process.stdout.write(JSON.stringify(out));
