import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTerrain, DEMO_TUNING } from '../../src/terrain.js';

// ── (a) determinism ───────────────────────────────────────────────────────────
test('determinism: same (x,z) ⇒ identical y across repeated calls', () => {
  const t = makeTerrain({ profile: 'demo', seed: 7 });
  for (const [x, z] of [[0, 0], [12.5, -33.7], [60, -40], [-88.2, 91.1]]) {
    const a = t.terrainHeightAt(x, z);
    const b = t.terrainHeightAt(x, z);
    assert.equal(a, b, `repeat call at ${x},${z}`);
  }
});

test('determinism: two separately-constructed same-seed terrains agree exactly', () => {
  const a = makeTerrain({ profile: 'demo', seed: 99 });
  const b = makeTerrain({ profile: 'demo', seed: 99 });
  for (let i = 0; i < 200; i++) {
    const x = (i * 7.13) % 240 - 120;
    const z = (i * 3.91) % 240 - 120;
    assert.equal(a.terrainHeightAt(x, z), b.terrainHeightAt(x, z),
      `host/client disagree at ${x},${z}`);
  }
});

test('determinism: different seeds produce a different field', () => {
  const a = makeTerrain({ profile: 'demo', seed: 1 });
  const b = makeTerrain({ profile: 'demo', seed: 2 });
  let diffs = 0;
  for (let i = 0; i < 100; i++) {
    const x = i * 2.3 - 100, z = i * 1.7 - 80;
    if (Math.abs(a.terrainHeightAt(x, z) - b.terrainHeightAt(x, z)) > 1e-6) diffs++;
  }
  assert.ok(diffs > 80, `expected most samples to differ, got ${diffs}/100`);
});

// ── (b) C0 continuity ───────────────────────────────────────────────────────────
test('C0 continuity: neighbouring samples never jump', () => {
  const t = makeTerrain({ profile: 'demo', seed: 42 });
  const d = 0.05;          // 5 cm step
  const maxJump = 0.10;    // ≤ 10 cm — well under any discontinuity
  let worst = 0;
  for (let i = 0; i < 4000; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 300 - 150;
    const z = (Math.sin(i * 78.233) * 12345.678 % 1) * 300 - 150;
    const h0 = t.terrainHeightAt(x, z);
    const dx = Math.abs(t.terrainHeightAt(x + d, z) - h0);
    const dz = Math.abs(t.terrainHeightAt(x, z + d) - h0);
    worst = Math.max(worst, dx, dz);
    assert.ok(dx < maxJump && dz < maxJump,
      `jump at ${x},${z}: dx=${dx} dz=${dz}`);
  }
  assert.ok(worst > 0, 'field should not be perfectly flat');
});

// ── (c) flat profile is exactly zero / placeable everywhere ────────────────────
test('flat profile: height exactly 0, slope 0, normal up, placeable', () => {
  const t = makeTerrain(); // default profile = flat
  assert.equal(t.profile, 'flat');
  for (const [x, z] of [[0, 0], [123.4, -567.8], [-500, 500], [9999, -9999]]) {
    assert.equal(t.terrainHeightAt(x, z), 0);
    assert.equal(t.terrainSlopeAt(x, z), 0);
    const n = t.terrainNormalAt(x, z);
    assert.deepEqual(n, { x: 0, y: 1, z: 0 });
    assert.equal(t.isPlaceable(x, z, 2), true);
  }
});

test('flat profile: reserved circles still block placement', () => {
  const t = makeTerrain({ reserved: [{ x: 0, z: 0, r: 10 }] });
  assert.equal(t.isPlaceable(0, 0, 0), false);
  assert.equal(t.isPlaceable(5, 0, 0), false);
  assert.equal(t.isPlaceable(20, 0, 1), true);
});

// ── (d) demo profile amplitude band ────────────────────────────────────────────
test('demo profile: amplitude within expected band', () => {
  const t = makeTerrain({ profile: 'demo', seed: 2026 });
  let min = Infinity, max = -Infinity;
  for (let x = -150; x <= 150; x += 2) {
    for (let z = -150; z <= 150; z += 2) {
      const y = t.terrainHeightAt(x, z);
      if (y < min) min = y;
      if (y > max) max = y;
    }
  }
  // fBm ~±5 m of headroom; the big hill peaks ~11 m above base.
  assert.ok(min > -8 && min < 0, `min out of band: ${min}`);
  assert.ok(max > 9 && max < 18, `max out of band (big hill ~11): ${max}`);
  // The big hill must actually be the highest feature, near its configured centre.
  const bh = DEMO_TUNING.bigHill;
  const peak = t.terrainHeightAt(bh.x, bh.z);
  assert.ok(peak > 9, `big hill not raised: ${peak}`);
});

// ── (e) slope / normal sanity ──────────────────────────────────────────────────
test('demo profile: hilltop is near-flat, flanks are sloped, all normals unit & up', () => {
  const t = makeTerrain({ profile: 'demo', seed: 2026 });
  const bh = DEMO_TUNING.bigHill;
  // hilltop ~ flat (gentle)
  assert.ok(t.terrainSlopeAt(bh.x, bh.z) < 0.12, 'hilltop should be near-flat');
  // a point out on the flank should be tilted but still walkable-ish
  const flank = t.terrainSlopeAt(bh.x + bh.sigma, bh.z);
  assert.ok(flank > 0.05, `flank should slope, got ${flank}`);
  // normals everywhere: unit length and pointing up (y > 0)
  for (let i = 0; i < 300; i++) {
    const x = i * 1.9 - 150, z = i * 1.3 - 120;
    const n = t.terrainNormalAt(x, z);
    const len = Math.hypot(n.x, n.y, n.z);
    assert.ok(Math.abs(len - 1) < 1e-9, `normal not unit at ${x},${z}: ${len}`);
    assert.ok(n.y > 0, `normal not upward at ${x},${z}`);
  }
});

test('demo profile: slopeLimit gates isPlaceable', () => {
  const t = makeTerrain({ profile: 'demo', seed: 2026, slopeLimit: 0.0 });
  // with a zero slope limit, only dead-flat points pass — essentially none on hills
  let placeable = 0;
  for (let x = -100; x <= 100; x += 10) {
    for (let z = -100; z <= 100; z += 10) {
      if (t.isPlaceable(x, z, 0)) placeable++;
    }
  }
  assert.ok(placeable < 5, `slopeLimit 0 should reject nearly all, got ${placeable}`);
});
