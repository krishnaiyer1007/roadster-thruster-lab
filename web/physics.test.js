// Regression tests for the physics core. Run: npm test (from the repo root)
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("./physics.js");

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ${b} ± ${tol}`);

test("nozzle and tank match hand calculation", () => {
  near(R.airMass0(), 197.2, 0.5, "air stored (kg)");
  near(R.ispAt(1e7, 293.15), 66.9, 0.2, "Isp at 100 bar, 20 C (s)");
  near(R.throatDia(13000) * 1000, 32.7, 0.2, "throat for 13 kN (mm)");
});

test("launch: thrusters + fans beat one second", () => {
  near(R.simLaunch(0).t060, 2.13, 0.03, "tyres only 0-60 (s)");
  near(R.simLaunch(1).t060, 1.20, 0.03, "with fans 0-60 (s)");
  const r = R.simLaunch(2);
  assert.ok(r.t060 < 1.0, "Thrust trim must be under 1 s");
});

test("default jump clears all five vehicles and lands softly", () => {
  const j = R.simJump();
  assert.equal(j.clipped, null);
  assert.ok(j.minClear > 0.2, "needs clearance");
  assert.ok(Math.abs(j.vLand) < 2, "soft landing");
});

test("hover ends with a controlled touchdown", () => {
  const h = R.simHover();
  assert.ok(h.reached);
  assert.ok(h.flight > 3 && h.flight < 7, `airborne ${h.flight}`);
  assert.ok(Math.abs(h.vTouch) < 3);
});

test("suction holds the car on a ceiling but not at 135 degrees", () => {
  assert.equal(R.upside(180).holds, true);
  assert.equal(R.upside(135).holds, false);
});
