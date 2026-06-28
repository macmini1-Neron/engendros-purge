// framepacing.test.mjs — node --test suite for src/framepacing.js
//
// The pacer's job is to turn a jittery rAF dt stream into a smooth one WITHOUT
// (a) drifting away from real wall-clock time, or (b) making an already-clean stream worse.
// Properties covered:
//   1. No-op on a clean cadence            — smoothed ≈ raw when input is metronomic (Mac)
//   2. Kills jitter on a wobbly cadence     — output jitter ≪ input jitter (Windows)
//   3. Bounded drift                        — Σ smoothed ≈ Σ raw over a long jittery run
//   4. Real stalls pass through             — a genuine long frame is NOT snapped away
//   5. Tab-out / pause passthrough + reset  — huge gaps are returned untouched
//   6. Refresh detection                    — pacer.hz tracks 60 / 144 / 165
//   7. Garbage input                        — 0 / negative / NaN pass through safely
//   8. Output is a clean multiple of base   — the actual smoothness guarantee

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFramePacer } from '../../src/framepacing.js';

// Deterministic, REALISTIC rAF-jitter generator (no Math.random → reproducible).
// Real present times sit on the vsync grid plus bounded scheduling noise, and dt is their
// successive difference — so the jitter is naturally mean-reverting: a late frame is followed
// by an early one as the clock catches the grid back up, exactly like a real display. `ampS`
// is the presentation-time noise amplitude, so per-frame dt swings by up to ±2·ampS.
function jitterSeq(baseS, ampS, n, seed = 1) {
  const out = [];
  let s = seed, prevNoise = 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;        // LCG
    const r = (s / 0x7fffffff) * 2 - 1;               // [-1, 1)
    const noise = r * ampS;
    out.push(baseS + noise - prevNoise);              // diff of (grid + noise) → mean-reverting
    prevNoise = noise;
  }
  return out;
}

function stddevMs(arr) {
  const n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const v = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return Math.sqrt(v) * 1000;
}

// ─── 1. No-op on a clean cadence ──────────────────────────────────────────────

test('clean 144 Hz cadence: smoothed dt ≈ raw dt (safe on Mac)', () => {
  const pacer = makeFramePacer();
  const base = 1 / 144;
  let maxDelta = 0;
  for (let i = 0; i < 200; i++) {
    const o = pacer.smooth(base);
    maxDelta = Math.max(maxDelta, Math.abs(o - base));
  }
  // A perfectly clean stream must come out essentially unchanged.
  assert.ok(maxDelta < base * 0.01, `clean cadence perturbed by ${(maxDelta * 1000).toFixed(3)}ms`);
});

// ─── 2. Kills jitter on a wobbly cadence ──────────────────────────────────────

test('jittery 165 Hz cadence: output jitter is far below input jitter', () => {
  const pacer = makeFramePacer();
  const base = 1 / 165;
  const seq = jitterSeq(base, base * 0.22, 320);     // ±0.22 grid noise → up to ±44% dt swing
  const outputs = [];
  for (const dt of seq) outputs.push(pacer.smooth(dt));
  const warm = outputs.slice(40);                    // skip warm-up + any one-time base re-lock
  const inJ = stddevMs(seq.slice(40));
  const outJ = stddevMs(warm);
  assert.ok(inJ > 1, `test setup: input jitter ${inJ.toFixed(2)}ms should be substantial`);
  assert.ok(outJ < inJ * 0.1, `output jitter ${outJ.toFixed(3)}ms not ≪ input ${inJ.toFixed(2)}ms`);
});

test('pacer reports input jitter high and output jitter low', () => {
  const pacer = makeFramePacer();
  const seq = jitterSeq(1 / 165, (1 / 165) * 0.22, 100, 7);
  for (const dt of seq) pacer.smooth(dt);
  assert.ok(pacer.jitterMs > 0.8, `expected substantial raw jitter, got ${pacer.jitterMs}`);
  assert.ok(pacer.outJitterMs < pacer.jitterMs * 0.2,
    `expected smoothed jitter ≪ raw: out=${pacer.outJitterMs} raw=${pacer.jitterMs}`);
});

// ─── 3. Bounded drift ─────────────────────────────────────────────────────────

test('cumulative smoothed time tracks wall-clock within one frame', () => {
  const pacer = makeFramePacer();
  const base = 1 / 165;
  const seq = jitterSeq(base, base * 0.45, 2000, 3);
  let sumIn = 0, sumOut = 0;
  for (const dt of seq) { sumIn += dt; sumOut += pacer.smooth(dt); }
  assert.ok(Math.abs(sumIn - sumOut) < base,
    `drift ${((sumOut - sumIn) * 1000).toFixed(2)}ms exceeded one frame (${(base * 1000).toFixed(2)}ms)`);
});

test('asymmetric jitter (biased late) still does not drift unbounded', () => {
  const pacer = makeFramePacer();
  const base = 1 / 144;
  // All frames slightly LATE (positive bias) — a naive snapper would drift fast.
  let sumIn = 0, sumOut = 0;
  for (let i = 0; i < 1500; i++) {
    const dt = base + base * (0.1 + 0.2 * ((i % 5) / 5));   // always 10–28% late
    sumIn += dt; sumOut += pacer.smooth(dt);
  }
  assert.ok(Math.abs(sumIn - sumOut) < base * 1.5,
    `biased drift ${((sumOut - sumIn) * 1000).toFixed(2)}ms too large`);
});

// ─── 4. Real stalls pass through ──────────────────────────────────────────────

test('a genuine long frame in a clean stream is not snapped away', () => {
  const pacer = makeFramePacer();
  const base = 1 / 144;
  for (let i = 0; i < 30; i++) pacer.smooth(base);   // warm up
  const stall = base * 4.3;                           // a real 4.3× hitch
  const o = pacer.smooth(stall);
  // It may absorb at most a fraction of a frame of carry, but must remain a big frame.
  assert.ok(o > base * 3.5, `stall ${(stall * 1000).toFixed(1)}ms collapsed to ${(o * 1000).toFixed(1)}ms`);
});

// ─── 5. Tab-out / pause passthrough + reset ───────────────────────────────────

test('a multi-second gap (tab hidden) passes through untouched', () => {
  const pacer = makeFramePacer();
  for (let i = 0; i < 30; i++) pacer.smooth(1 / 144);
  const gap = 2.5;                                    // 2.5 s tab-out
  assert.equal(pacer.smooth(gap), gap, 'huge gap must pass through verbatim');
});

test('reset() clears state so the next stream warms up fresh', () => {
  const pacer = makeFramePacer();
  for (let i = 0; i < 30; i++) pacer.smooth(1 / 144);
  pacer.reset();
  assert.equal(pacer.hz, 0, 'hz should be 0 right after reset');
  assert.equal(pacer.jitterMs, 0, 'jitter should be 0 right after reset');
});

// ─── 6. Refresh detection ─────────────────────────────────────────────────────

for (const hz of [60, 144, 165]) {
  test(`detects ${hz} Hz from a jittery stream`, () => {
    const pacer = makeFramePacer();
    const seq = jitterSeq(1 / hz, (1 / hz) * 0.3, 90, hz);
    for (const dt of seq) pacer.smooth(dt);
    assert.equal(pacer.hz, hz, `expected ${hz}Hz, detected ${pacer.hz}Hz`);
  });
}

// ─── 7. Garbage input ─────────────────────────────────────────────────────────

test('garbage dt values pass through without throwing', () => {
  const pacer = makeFramePacer();
  for (let i = 0; i < 30; i++) pacer.smooth(1 / 144);
  assert.equal(pacer.smooth(0), 0);
  assert.equal(pacer.smooth(-0.01), -0.01);
  assert.ok(Number.isNaN(pacer.smooth(NaN)));
});

// ─── 8. Output is a clean multiple of base ────────────────────────────────────

test('every smoothed frame is a whole multiple of the detected base', () => {
  const pacer = makeFramePacer();
  const base = 1 / 165;
  const seq = jitterSeq(base, base * 0.22, 240, 11);
  const outputs = [];
  for (const dt of seq) outputs.push(pacer.smooth(dt));
  const b = pacer.vsync;
  assert.ok(b > 0, 'base should be detected');
  for (const o of outputs.slice(40)) {
    const k = o / b;
    assert.ok(Math.abs(k - Math.round(k)) < 1e-6,
      `output ${(o * 1000).toFixed(3)}ms is not a whole multiple of base ${(b * 1000).toFixed(3)}ms`);
  }
});

// ─── 9. Hitch resilience — the stuttery-machine case (the MEDIUM review fix) ───
// A lone slow frame (GC pause, one dropped frame) must NOT wipe the lock. The old reset
// threshold was 1/minHz (33 ms), so any 34 ms+ hitch forced a full re-warmup — worst exactly
// on the stuttery machines this whole module targets. Only a real pause (> pauseS) resets now.

test('a single mid-stream hitch frame does NOT drop the lock', () => {
  const pacer = makeFramePacer();
  const base = 1 / 165;
  for (let i = 0; i < 40; i++) pacer.smooth(base);        // warm + lock 165
  assert.equal(pacer.hz, 165, 'locked to 165 before the hitch');
  pacer.smooth(0.040);                                    // one 40 ms GC hitch (>33 ms, < pauseS)
  assert.equal(pacer.hz, 165, 'a single hitch must not reset the lock');
  const after = [];
  for (let i = 0; i < 20; i++) after.push(pacer.smooth(base));
  for (const o of after) {
    assert.ok(Math.abs(o - base) < base * 0.01, 'smoothing resumes cleanly right after the hitch');
  }
});

test('sporadic GC hitches keep the lock (old 33 ms reset would have wiped it each time)', () => {
  const pacer = makeFramePacer();
  const base = 1 / 144;
  for (let i = 0; i < 40; i++) pacer.smooth(base);
  for (let i = 0; i < 200; i++) pacer.smooth(i % 40 === 0 ? 0.045 : base);  // a 45 ms hitch every 40 frames
  assert.equal(pacer.hz, 144, 'lock survives sporadic hitches');
});

test('a real pause (> pauseS) DOES still reset the lock', () => {
  const pacer = makeFramePacer({ pauseS: 0.5 });
  const base = 1 / 165;
  for (let i = 0; i < 40; i++) pacer.smooth(base);
  assert.equal(pacer.hz, 165);
  pacer.smooth(0.8);                                       // 0.8 s > pauseS → genuine pause
  assert.equal(pacer.hz, 0, 'a real pause resets the lock');
});
