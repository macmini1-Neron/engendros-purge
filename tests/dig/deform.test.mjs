import test from 'node:test';
import assert from 'node:assert/strict';
import { DeformField, isUndermined, craterShape, MAX_DIG, DEFORM_CAP, MIN_DIG_R } from '../../src/dig.js';

// small deterministic LCG so "random" sample points are reproducible (no Math.random flakiness)
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

// explicit brute-force reference: replicates dig.js's truncated-Gaussian math + bedrock clamp over
// the WHOLE primitive list (no spatial hash), in list order — the oracle for the hash test.
function bruteAt(prims, x, z, maxDig = MAX_DIG) {
  let sum = 0;
  for (const p of prims) {
    const r = Math.max(p.r, MIN_DIG_R), depth = Math.min(p.depth, 0.7 * r);   // mirror add()'s escapability clamps (MIN_DIG_R + WALK_K)
    const dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz, s = 3.8 * r;
    if (d2 > s * s) continue;
    let h = -depth * Math.exp(-d2 / (2 * r * r));
    if (p.lip > 0) { const w = r * 0.5, e = (Math.sqrt(d2) - r * 2.2) / w; h += p.lip * Math.exp(-0.5 * e * e); }
    sum += h;
  }
  return sum < -maxDig ? -maxDig : sum;
}

test('empty field: deformAt fast-path returns exactly 0', () => {
  const f = new DeformField();
  assert.equal(f.deformAt(0, 0), 0);
  assert.equal(f.deformAt(37.5, -12.25), 0);
  assert.equal(f.count, 0);
});

test('single crater: -depth at centre, →0 far away', () => {
  const f = new DeformField();
  f.add({ x: 10, z: -5, r: 3, depth: 0.8, lip: 0 });   // within the shallow MAX_DIG cap
  assert.ok(Math.abs(f.deformAt(10, -5) - (-0.8)) < 1e-9, 'hits -depth at centre');
  assert.ok(Math.abs(f.deformAt(10 + 30, -5)) < 1e-6, 'negligible 30 m away');
});

test('ejecta lip raises ground at the rim (positive contribution)', () => {
  const f = new DeformField();
  f.add({ x: 0, z: 0, r: 4, depth: 0.8, lip: 0.5 });
  assert.ok(f.deformAt(0, 0) < 0, 'still a pit at centre');
  // the ejecta ring peaks at ~2.2r (just outside the bowl) → ground there is raised
  assert.ok(f.deformAt(4 * 2.2, 0) > 0, `ejecta ring should be raised, got ${f.deformAt(8.8, 0)}`);
});

test('overlapping craters sum and clamp at the bedrock floor (-MAX_DIG)', () => {
  const f = new DeformField();
  // three deep, fully-overlapping bowls would sum past bedrock without the clamp
  f.add({ x: 0, z: 0, r: 3, depth: 5, lip: 0 });
  f.add({ x: 0, z: 0, r: 3, depth: 5, lip: 0 });
  f.add({ x: 0, z: 0, r: 3, depth: 5, lip: 0 });
  assert.equal(f.deformAt(0, 0), -MAX_DIG, 'clamped to bedrock, never deeper');
});

test('spatial hash is bit-exact vs. a brute-force sum over all primitives', () => {
  const prims = [];
  const rnd = lcg(99);
  for (let i = 0; i < 40; i++) prims.push({ x: (rnd() - 0.5) * 120, z: (rnd() - 0.5) * 120, r: 2 + rnd() * 4, depth: 1 + rnd() * 3, lip: rnd() < 0.5 ? rnd() : 0 });
  const hashed = new DeformField();
  for (const p of prims) hashed.add(p);
  for (let i = 0; i < 100; i++) {
    const x = (rnd() - 0.5) * 140, z = (rnd() - 0.5) * 140;
    assert.equal(hashed.deformAt(x, z), bruteAt(prims, x, z), `mismatch at ${x},${z}`);
  }
});

test('serialize → deserialize round-trips to an identical field', () => {
  const a = new DeformField();
  const rnd = lcg(7);
  for (let i = 0; i < 12; i++) a.add({ x: (rnd() - 0.5) * 80, z: (rnd() - 0.5) * 80, r: 2 + rnd() * 3, depth: 1 + rnd() * 2, lip: 0.2 });
  const b = DeformField.deserialize(a.serialize());
  assert.equal(b.count, a.count);
  const rnd2 = lcg(123);
  for (let i = 0; i < 60; i++) {
    const x = (rnd2() - 0.5) * 90, z = (rnd2() - 0.5) * 90;
    assert.equal(b.deformAt(x, z), a.deformAt(x, z), `sample ${i} diverged`);
  }
});

test('cap: two identical over-cap sequences yield byte-identical fields (deterministic eviction)', () => {
  const seq = [];
  const rnd = lcg(55);
  for (let i = 0; i < DEFORM_CAP + 50; i++) seq.push({ x: (rnd() - 0.5) * 300, z: (rnd() - 0.5) * 300, r: 2 + rnd() * 3, depth: 1 + rnd() * 3, lip: 0 });
  const a = new DeformField(), b = new DeformField();
  for (const p of seq) { a.add(p); b.add(p); }
  assert.equal(a.count, DEFORM_CAP, 'count is capped');
  assert.deepEqual(a.serialize(), b.serialize(), 'identical sequence ⇒ identical field');
});

test('add reports the evicted primitive once over cap', () => {
  const f = new DeformField({ cap: 3 });
  assert.equal(f.add({ x: 0, z: 0, r: 2, depth: 1 }).removed, null);
  f.add({ x: 5, z: 0, r: 2, depth: 1 });
  f.add({ x: 10, z: 0, r: 2, depth: 1 });
  const r = f.add({ x: 15, z: 0, r: 2, depth: 1 });      // 4th over cap=3 → evicts the first
  assert.ok(r.removed && r.removed.x === 0, 'oldest (x=0) evicted');
  assert.equal(f.count, 3);
});

test('craterShape: mild cosmetic dent — shallow + wide, never inescapable', () => {
  const bz = craterShape(6);                 // bazooka-ish blast radius
  assert.ok(bz.depth > 0.1 && bz.depth <= 0.4, 'just dents the dirt');
  assert.ok(bz.r >= MIN_DIG_R, 'at least the wide minimum radius');
  assert.ok(bz.depth / bz.r < 0.3, 'depth/radius stays gentle → walkable slope');
  const big = craterShape(14);               // mortar / FAB
  assert.ok(big.depth <= 0.4, 'capped shallow even for heavy ordnance');
  assert.equal(craterShape(0), null);
  assert.equal(craterShape(-3), null);
});

test('escapability: a narrow deep dig is widened to MIN_DIG_R and clamped to MAX_DIG', () => {
  const f = new DeformField();
  const { stored } = f.add({ x: 0, z: 0, r: 0.3, depth: 5 });   // tries to be a narrow 5 m pit
  assert.ok(stored.r >= MIN_DIG_R, 'radius widened to the minimum (no narrow shaft)');
  assert.equal(f.deformAt(0, 0), -MAX_DIG, 'depth clamped to the shallow bedrock');
  assert.ok(f.deformAt(MIN_DIG_R, 0) > -MAX_DIG + 0.05, 'ground recovers toward the rim — not a vertical wall');
});

test('isUndermined: fires only once enough of the footprint drops past the gap', () => {
  const fp = { minx: -1, minz: -1, maxx: 1, maxz: 1 };
  const baseY = 0;
  // flat ground at base → supported
  assert.equal(isUndermined(() => 0, fp, baseY), false);
  // whole footprint dug 2 m down → undermined
  assert.equal(isUndermined(() => -2, fp, baseY), true);
  // only the centre dug (1 of 5 samples) → still supported at frac=0.6
  const onlyCentre = (x, z) => (x === 0 && z === 0 ? -2 : 0);
  assert.equal(isUndermined(onlyCentre, fp, baseY), false);
  // a shallow dip within the gap tolerance → still supported
  assert.equal(isUndermined(() => -0.3, fp, baseY, 0.5), false);
});
