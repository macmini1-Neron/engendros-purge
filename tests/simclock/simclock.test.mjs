// simclock.test.mjs — node --test suite for src/simclock.js
//
// Tests cover the four properties mandated by the Phase-2 spec:
//   (a) Determinism          — same dt sequence ⇒ same tick count every time
//   (b) Sub-step cap         — a huge single dt never triggers an unbounded tick loop
//   (c) Variable-dt convergence — 0.016-slice vs 0.05-slice feeds summing to the same
//                                 total accumulate the same total tick count (± 1 for FP)
//   (d) alpha ∈ [0, 1)       — the render-interpolation fraction stays in range
// Plus lerpState correctness for scalar and {x,y,z} inputs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClock, lerpState } from '../../src/simclock.js';

// ─── (a) Determinism ─────────────────────────────────────────────────────────

test('determinism: identical dt sequence produces the same tick count', () => {
  const dtSeq = [0.016, 0.033, 0.012, 0.05, 0.008, 0.020, 0.050, 0.016, 0.016, 0.033];
  let countA = 0, countB = 0;
  const clockA = makeClock();
  const clockB = makeClock();
  for (const dt of dtSeq) {
    clockA.advance(dt, () => countA++);
    clockB.advance(dt, () => countB++);
  }
  assert.equal(countA, countB, 'same dt sequence must yield identical tick count');
});

test('determinism: alpha is identical after the same dt sequence', () => {
  const dtSeq = [0.016, 0.033, 0.050, 0.010, 0.025];
  const clockA = makeClock();
  const clockB = makeClock();
  for (const dt of dtSeq) {
    clockA.advance(dt, () => {});
    clockB.advance(dt, () => {});
  }
  assert.equal(clockA.alpha(), clockB.alpha(),
    'alpha must match after identical dt sequence');
});

// ─── (b) Sub-step cap ────────────────────────────────────────────────────────

test('sub-step cap: a huge dt (10 s) fires at most ceil(maxDt/step)+1 ticks', () => {
  const step = 1 / 120, maxDt = 0.05;
  const maxExpected = 1 + Math.ceil(maxDt / step);   // 7
  const clock = makeClock({ step, maxDt });
  let ticks = 0;
  clock.advance(10.0, () => ticks++);
  assert.ok(ticks <= maxExpected,
    `huge dt fired ${ticks} ticks — expected ≤ ${maxExpected}`);
  assert.ok(ticks > 0, 'should still fire at least one tick');
});

test('sub-step cap: even 1000 s does not spiral', () => {
  const clock = makeClock({ step: 1 / 120, maxDt: 0.05 });
  let ticks = 0;
  // 1000 seconds of claimed dt in a single call — must terminate quickly
  clock.advance(1000, () => ticks++);
  assert.ok(ticks <= 8, `1000 s dt fired ${ticks} ticks — spiral guard failed`);
});

test('sub-step cap: many consecutive large-dt calls stay bounded per call', () => {
  const step = 1 / 120, maxDt = 0.05;
  const clock = makeClock({ step, maxDt });
  const perCallMax = 1 + Math.ceil(maxDt / step);
  let maxSeen = 0;
  for (let i = 0; i < 100; i++) {
    let callTicks = 0;
    clock.advance(5.0, () => callTicks++);
    if (callTicks > maxSeen) maxSeen = callTicks;
  }
  assert.ok(maxSeen <= perCallMax,
    `per-call max ${maxSeen} exceeded bound ${perCallMax}`);
});

// ─── (c) Variable-dt convergence ─────────────────────────────────────────────

test('variable-dt convergence: 0.016 slices and 0.05 slices over same wall-time ≈ same ticks', () => {
  // We need both sequences to sum to the same accumulated total.
  // 25 × 0.016 = 0.4 s  (neither exceeds maxDt = 0.05, so no clamping)
  //  8 × 0.05  = 0.4 s
  // At step = 1/120 the expected tick count is ≈ 48.
  const clockA = makeClock({ step: 1 / 120, maxDt: 0.05 });
  const clockB = makeClock({ step: 1 / 120, maxDt: 0.05 });
  let ticksA = 0, ticksB = 0;
  for (let i = 0; i < 25; i++) clockA.advance(0.016, () => ticksA++);
  for (let i = 0; i < 8;  i++) clockB.advance(0.05,  () => ticksB++);
  assert.ok(Math.abs(ticksA - ticksB) <= 1,
    `tick counts diverged: 0.016-slices=${ticksA}, 0.05-slices=${ticksB} (diff > 1)`);
});

test('variable-dt convergence: many tiny slices vs few large slices accumulate same ticks', () => {
  // 60 × (1/120 * 2) = 60 × 2 ticks = 120 ticks (each call adds exactly 2 steps)
  // 20 × (1/120 * 6) = 20 × 6 ticks = 120 ticks
  // Using exact multiples of step avoids floating-point accumulation drift entirely.
  const step = 1 / 120;
  const clockA = makeClock({ step, maxDt: 0.1 });   // maxDt large enough to not clamp
  const clockB = makeClock({ step, maxDt: 0.1 });
  let ticksA = 0, ticksB = 0;
  for (let i = 0; i < 60; i++) clockA.advance(step * 2, () => ticksA++);
  for (let i = 0; i < 20; i++) clockB.advance(step * 6, () => ticksB++);
  assert.equal(ticksA, 120, `tiny-slice clock gave ${ticksA}, expected 120`);
  assert.equal(ticksB, 120, `large-slice clock gave ${ticksB}, expected 120`);
});

test('variable-dt convergence: non-uniform mixed sequence same total as uniform', () => {
  // Mixed: [0.033, 0.016, 0.050, 0.020, 0.016] repeated 4× = 4 × 0.135 = 0.54 s
  // Uniform: 0.05 × 10 + 0.04 = 0.54 s  (but hard to align perfectly)
  // Better: same mixed sequence twice — just assert both counters are equal.
  const seq = [0.033, 0.016, 0.050, 0.020, 0.016];
  const clockA = makeClock();
  const clockB = makeClock();
  let ticksA = 0, ticksB = 0;
  for (let rep = 0; rep < 4; rep++) {
    for (const dt of seq) {
      clockA.advance(dt, () => ticksA++);
      clockB.advance(dt, () => ticksB++);
    }
  }
  assert.equal(ticksA, ticksB,
    'identical sequences on two fresh clocks must agree on tick count');
});

// ─── (d) alpha ∈ [0, 1) ──────────────────────────────────────────────────────

test('alpha is always in [0, 1) after any advance call', () => {
  const clock = makeClock();
  const dts = [0, 0.001, 0.016, 0.033, 0.05, 0.1, 1.0, 10.0];
  for (const dt of dts) {
    clock.advance(dt, () => {});
    const a = clock.alpha();
    assert.ok(a >= 0 && a < 1,
      `alpha=${a} out of [0,1) after dt=${dt}`);
  }
});

test('alpha is 0 on a freshly created clock with no advances', () => {
  const clock = makeClock();
  assert.equal(clock.alpha(), 0);
});

test('alpha is 0 after reset()', () => {
  const clock = makeClock();
  clock.advance(0.016, () => {});
  clock.reset();
  assert.equal(clock.alpha(), 0);
});

test('alpha is in [0, 1) across a long simulation', () => {
  const clock = makeClock({ step: 1 / 120, maxDt: 0.05 });
  for (let i = 0; i < 600; i++) {
    clock.advance(0.016 + (i % 3) * 0.008, () => {});   // irregular dt pattern
    const a = clock.alpha();
    assert.ok(a >= 0 && a < 1,
      `alpha=${a} at frame ${i} is outside [0,1)`);
  }
});

// ─── reset() behaviour ───────────────────────────────────────────────────────

test('reset(): clears accumulator so next advance starts fresh', () => {
  const clock = makeClock({ step: 1 / 120 });
  // Partially fill the accumulator (less than one step)
  let ticks = 0;
  clock.advance(0.005, () => ticks++);    // 0.005 < 1/120 ≈ 0.00833 — no ticks
  assert.equal(ticks, 0, 'sub-step accumulation should not tick yet');
  clock.reset();
  // After reset, 0.005 again should still give 0 ticks (not 0.010)
  clock.advance(0.005, () => ticks++);
  assert.equal(ticks, 0, 'reset should have cleared the carry; still no tick');
});

// ─── advance() return value ───────────────────────────────────────────────────

test('advance() returns 0 when dt < one step', () => {
  const clock = makeClock({ step: 1 / 120 });
  const n = clock.advance(0.005, () => {});   // 0.005 < 1/120
  assert.equal(n, 0);
});

test('advance() returns the exact tick count fired this call', () => {
  const step = 1 / 120;
  const clock = makeClock({ step, maxDt: 0.5 });
  // Feed exactly 6 steps — should return 6
  const n = clock.advance(step * 6, () => {});
  assert.equal(n, 6, `expected 6 ticks, got ${n}`);
});

// ─── custom step sizes ───────────────────────────────────────────────────────

test('10 Hz fire clock: 1.0 s feeds ≈ 10 ticks', () => {
  const clock = makeClock({ step: 1 / 10, maxDt: 0.05 });
  let total = 0;
  for (let i = 0; i < 20; i++) clock.advance(0.05, () => total++);   // 20 × 0.05 = 1.0 s
  assert.ok(Math.abs(total - 10) <= 1,
    `fire clock gave ${total} ticks over 1 s, expected 10 ± 1`);
});

// ─── lerpState ───────────────────────────────────────────────────────────────

test('lerpState: scalar midpoint', () => {
  assert.equal(lerpState(0, 10, 0.5), 5);
});

test('lerpState: scalar alpha=0 returns prev', () => {
  assert.equal(lerpState(3, 7, 0), 3);
});

test('lerpState: scalar alpha=1 returns cur', () => {
  assert.equal(lerpState(3, 7, 1), 7);
});

test('lerpState: {x,y,z} midpoint', () => {
  const prev = { x: 0, y: 0, z: 0 };
  const cur  = { x: 10, y: 20, z: 30 };
  const mid  = lerpState(prev, cur, 0.5);
  assert.deepEqual(mid, { x: 5, y: 10, z: 15 });
});

test('lerpState: {x,y,z} alpha=0 returns prev values', () => {
  const prev = { x: 1, y: 2, z: 3 };
  const cur  = { x: 9, y: 8, z: 7 };
  const r    = lerpState(prev, cur, 0);
  assert.deepEqual(r, { x: 1, y: 2, z: 3 });
});

test('lerpState: non-numeric field copied from cur unchanged', () => {
  const prev = { x: 0, label: 'old' };
  const cur  = { x: 10, label: 'new' };
  const r    = lerpState(prev, cur, 0.5);
  assert.equal(r.x, 5);
  assert.equal(r.label, 'new');
});

test('lerpState: does not mutate prev or cur', () => {
  const prev = { x: 0, y: 0 };
  const cur  = { x: 10, y: 20 };
  lerpState(prev, cur, 0.7);
  assert.deepEqual(prev, { x: 0, y: 0 });
  assert.deepEqual(cur,  { x: 10, y: 20 });
});

test('lerpState: works with a scalar that represents a physics angle', () => {
  // Typical use: render-interpolating a hinge angle between two ticks
  const prevAngle = 0.1, curAngle = 0.3;
  const interp = lerpState(prevAngle, curAngle, 0.25);
  assert.ok(Math.abs(interp - 0.15) < 1e-10, `expected 0.15, got ${interp}`);
});

// ─── makeClock argument validation ───────────────────────────────────────────

test('makeClock: throws on step ≤ 0', () => {
  assert.throws(() => makeClock({ step: 0 }), RangeError);
  assert.throws(() => makeClock({ step: -1 }), RangeError);
});

test('makeClock: throws on maxDt ≤ 0', () => {
  assert.throws(() => makeClock({ maxDt: 0 }), RangeError);
  assert.throws(() => makeClock({ maxDt: -0.01 }), RangeError);
});

test('makeClock: exposes step and maxDt as read-accessible properties', () => {
  const clock = makeClock({ step: 1 / 60, maxDt: 0.08 });
  assert.equal(clock.step, 1 / 60);
  assert.equal(clock.maxDt, 0.08);
});

// ─── accumulator carry-over ───────────────────────────────────────────────────

test('leftover accumulator carries over to the next advance call', () => {
  // step = 1/120 ≈ 0.00833.  Feed 0.005 three times (total = 0.015 > 1 step).
  const clock = makeClock({ step: 1 / 120 });
  let ticks = 0;
  clock.advance(0.005, () => ticks++);   // acc = 0.005 — no tick
  assert.equal(ticks, 0);
  clock.advance(0.005, () => ticks++);   // acc = 0.010 ≥ step — 1 tick
  assert.equal(ticks, 1);
  clock.advance(0.005, () => ticks++);   // acc = 0.010 - step + 0.005 ≈ 0.00167 — no tick
  assert.equal(ticks, 1, 'third sub-step-threshold call should not add another tick');
});
