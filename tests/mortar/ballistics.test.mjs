// ballistics.test.mjs — node --test suite for src/mortar-ballistics.js.
//
// Locks the firing table + the co-op determinism contract: same seed → same impact,
// and the heading convention agrees with src/bearing.js (so the gunner's dial, the
// HUD угломер, and the host's impact all reference ONE datum).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ELEV_MIN_DEG, ELEV_MAX_DEG, RANGE_MIN, RANGE_MAX,
  RIG_X_AT_ELEV_MIN, RIG_X_AT_ELEV_MAX,
  elevToRange, rangeToElev, elevToRigX, firingDir,
  timeOfFlight, apexHeight, dispersion, impactPoint,
} from '../../src/mortar-ballistics.js';
import { dirToMils, wrap6000 } from '../../src/bearing.js';

const D2R = Math.PI / 180, TAU = Math.PI * 2;

// ── elevation ⇄ range ─────────────────────────────────────────────────────────
test('elevToRange: endpoints + monotonic decreasing + clamped', () => {
  assert.equal(elevToRange(ELEV_MIN_DEG * D2R), RANGE_MAX); // 45° → 600
  assert.equal(elevToRange(ELEV_MAX_DEG * D2R), RANGE_MIN); // 85° → 80
  let prev = Infinity;
  for (let d = ELEV_MIN_DEG; d <= ELEV_MAX_DEG; d += 2) {
    const r = elevToRange(d * D2R);
    assert.ok(r < prev, `range must shrink as elevation climbs (${d}°: ${r})`);
    assert.ok(r >= RANGE_MIN - 1e-9 && r <= RANGE_MAX + 1e-9, `range in band at ${d}°`);
    prev = r;
  }
  // out-of-band elevations clamp, never extrapolate
  assert.equal(elevToRange(30 * D2R), RANGE_MAX);
  assert.equal(elevToRange(95 * D2R), RANGE_MIN);
});

test('elevToRange ∘ rangeToElev round-trips', () => {
  for (let r = RANGE_MIN; r <= RANGE_MAX; r += 40) {
    const back = elevToRange(rangeToElev(r));
    assert.ok(Math.abs(back - r) < 1e-6, `round-trip ${r} → ${back}`);
  }
});

// ── elevation → rig hinge ───────────────────────────────────────────────────────
test('elevToRigX: endpoints match spec rig.range + monotonic', () => {
  assert.ok(Math.abs(elevToRigX(ELEV_MIN_DEG * D2R) - RIG_X_AT_ELEV_MIN) < 1e-9);
  assert.ok(Math.abs(elevToRigX(ELEV_MAX_DEG * D2R) - RIG_X_AT_ELEV_MAX) < 1e-9);
  // rest tube ≈ +52° must land near rig.x 0 (the authored neutral pose)
  assert.ok(Math.abs(elevToRigX(52 * D2R)) < 0.03, 'rest ≈52° ≈ rig.x 0');
  let prev = Infinity;
  for (let d = ELEV_MIN_DEG; d <= ELEV_MAX_DEG; d += 5) {
    const x = elevToRigX(d * D2R);
    assert.ok(x < prev, 'rig.x decreases as elevation climbs');
    prev = x;
  }
});

// ── firing direction agrees with the bearing.js datum ──────────────────────────
test('firingDir: cardinals + agrees with dirToMils', () => {
  const n = firingDir(0);            // +Z north
  assert.ok(Math.abs(n.dx) < 1e-9 && Math.abs(n.dz - 1) < 1e-9);
  const e = firingDir(Math.PI / 2);  // +X east
  assert.ok(Math.abs(e.dx - 1) < 1e-9 && Math.abs(e.dz) < 1e-9);
  // the whole point: dirToMils(firingDir(φ)) === φ in mils
  for (let phi = 0; phi < TAU; phi += 0.11) {
    const d = firingDir(phi);
    const a = dirToMils(d.dx, d.dz);
    const b = wrap6000(phi / TAU * 6000);
    assert.ok(Math.abs(((a - b + 3000) % 6000) - 3000) < 1e-6, `φ ${phi}: ${a} vs ${b}`);
  }
});

// ── arc shaping ─────────────────────────────────────────────────────────────────
test('timeOfFlight + apexHeight monotonic increasing, bounded', () => {
  let pt = -1, pa = -1;
  for (let r = RANGE_MIN; r <= RANGE_MAX; r += 50) {
    const t = timeOfFlight(r), a = apexHeight(r);
    assert.ok(t > pt && a >= pa, `monotonic at ${r}`);
    assert.ok(t > 0 && a >= 20 && a <= 120, `bounded at ${r}`);
    pt = t; pa = a;
  }
});

// ── dispersion determinism + bound ─────────────────────────────────────────────
test('dispersion: deterministic per seed, varies across seeds, bounded by σ', () => {
  const a1 = dispersion(12345, 300), a2 = dispersion(12345, 300);
  assert.deepEqual(a1, a2);                                   // same seed → identical
  const b = dispersion(999, 300);
  assert.ok(a1.dx !== b.dx || a1.dz !== b.dz);                // different seed → differs
  for (const seed of [0, 1, 42, 0xdeadbeef, 7777777]) {
    for (const range of [80, 240, 600]) {
      const d = dispersion(seed, range);
      assert.ok(Math.hypot(d.dx, d.dz) <= d.sigma + 1e-9, `|offset| ≤ σ (seed ${seed}, ${range}m)`);
    }
  }
});

// ── impact point ────────────────────────────────────────────────────────────────
test('impactPoint: lands within σ of the ideal range-along-φ point', () => {
  const mx = -326, mz = -304, phi = 0.4, range = 320, seed = 0x1234;
  const ideal = { x: mx + Math.sin(phi) * range, z: mz + Math.cos(phi) * range };
  const imp = impactPoint(mx, mz, phi, range, seed);
  const off = Math.hypot(imp.x - ideal.x, imp.z - ideal.z);
  assert.ok(off <= dispersion(seed, range).sigma + 1e-9, `within σ (${off})`);
  // the ideal point is exactly `range` from the mortar (sanity on firingDir·range)
  assert.ok(Math.abs(Math.hypot(ideal.x - mx, ideal.z - mz) - range) < 1e-9);
});

test('impactPoint: deterministic in seed (co-op contract)', () => {
  const args = [10, 20, 1.1, 450];
  assert.deepEqual(impactPoint(...args, 555), impactPoint(...args, 555));
  assert.notDeepEqual(impactPoint(...args, 555), impactPoint(...args, 556));
});
