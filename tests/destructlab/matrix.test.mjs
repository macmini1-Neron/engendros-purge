import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, LAB_WEAPONS, makePart, resolveHit, resolveBlast, resolvePenetration, coneContains } from '../../tools/destructlab/matrix.js';

test('pistol vs brick is cosmetic only (pen 0 < tier 3), hp untouched', () => {
  const p = makePart('w1', 'brick', [0, 0, 0], [1.5, 2.5, 0.3]);
  const r = resolveHit(p, LAB_WEAPONS.pistol);
  assert.equal(r.effect, 'cosmetic');
  assert.equal(p.hp, MATERIALS.brick.hp);
});

test('pistol kills a glass pane in one hit (tier 0, hp 1)', () => {
  const p = makePart('g1', 'glass', [0, 1, 0], [1, 2, 0.05]);
  const r = resolveHit(p, LAB_WEAPONS.pistol);
  assert.equal(r.effect, 'damage');
  assert.equal(r.killed, true);
});

test('rifle chews through a wood fence segment in 4 hits (60 hp / 15 dmg)', () => {
  const p = makePart('f1', 'wood', [0, 0, 0], [1.5, 1.2, 0.1]);
  let killed = false;
  for (let i = 0; i < 4; i++) killed = resolveHit(p, LAB_WEAPONS.rifle).killed;
  assert.equal(killed, true);
});

test('12.7 damages a trunk (pen 2 ≥ tier 2); rifle does not', () => {
  const p = makePart('t1', 'trunk', [0, 0, 0], [0.4, 7, 0.4]);
  assert.equal(resolveHit(p, LAB_WEAPONS.rifle).effect, 'cosmetic');
  assert.equal(resolveHit(p, LAB_WEAPONS.hmg127).effect, 'damage');
});

test('hpScale multiplies part hp (class-3 oak trunk = 3× trunk hp)', () => {
  const p = makePart('t3', 'trunk', [0, 0, 0], [1, 9, 1], 3);
  assert.equal(p.hp, MATERIALS.trunk.hp * 3);
});

test('resolveHit on an already-dead part is cosmetic (no double-kill events)', () => {
  const p = makePart('g9', 'glass', [0, 1, 0], [1, 2, 0.05]);
  resolveHit(p, LAB_WEAPONS.pistol);             // kill it
  const hpAfterKill = p.hp;
  const again = resolveHit(p, LAB_WEAPONS.pistol);
  assert.equal(again.effect, 'cosmetic');
  assert.equal(p.hp, hpAfterKill);
});

test('HE blast kills brick inside r1 but not concrete; far brick survives', () => {
  const near  = makePart('b1', 'brick',    [1, 0, 0],  [2.5, 2.5, 0.3]);   // ~1 m away
  const conc  = makePart('c1', 'concrete', [-2, 0, 0], [-0.5, 2.5, 0.3]);  // tier 4 > blast tier 3
  const far   = makePart('b2', 'brick',    [8, 0, 0],  [9.5, 2.5, 0.3]);   // ~8 m away
  const res = resolveBlast([near, conc, far], [0, 1.2, 0], LAB_WEAPONS.heRocket.blast);
  assert.deepEqual(res.killed, ['b1']);
  assert.equal(conc.dead, false);
  assert.equal(far.dead, false);
});

test('HE shatters glass in the wide r2 ring but not beyond', () => {
  const gNear = makePart('g1', 'glass', [4, 1, 0], [5, 2, 0.05]);   // ~4 m: outside r1, inside r2
  const gFar  = makePart('g2', 'glass', [9, 1, 0], [10, 2, 0.05]);  // ~9 m: outside r2
  const res = resolveBlast([gNear, gFar], [0, 1.2, 0], LAB_WEAPONS.heRocket.blast);
  assert.deepEqual(res.glass, ['g1']);
  assert.equal(gNear.dead, true);
  assert.equal(gFar.dead, false);
});

test('blast ignores already-dead parts', () => {
  const p = makePart('b9', 'brick', [1, 0, 0], [2, 2, 0.3]);
  p.dead = true;
  const res = resolveBlast([p], [0, 1, 0], LAB_WEAPONS.heRocket.blast);
  assert.deepEqual(res.killed, []);
});

test('APFSDS passes through two walls, damage decays, spall cone behind each', () => {
  // Two parallel brick walls along +Z, 4 m apart, shot from z=-5 along +Z.
  const w1 = makePart('w1', 'brick', [-1, 0, 0], [1, 2.5, 0.3]);
  const w2 = makePart('w2', 'brick', [-1, 0, 4], [1, 2.5, 4.3]);
  const res = resolvePenetration([w1, w2], [0, 1.2, -5], [0, 0, 1], LAB_WEAPONS.apfsds);
  assert.equal(res.hits.length, 2);
  assert.equal(res.hits[0].id, 'w1');                       // sorted near→far
  assert.ok(Math.abs(res.hits[0].dmg - 900) < 1e-9);
  assert.ok(Math.abs(res.hits[1].dmg - 900 * 0.6) < 1e-9);  // falloff per wall
  assert.equal(res.cones.length, 2);
  assert.ok(res.cones[0].apex[2] > 0.3 - 1e-9);             // apex at exit point
  assert.equal(res.hits[0].pierced, true);
  assert.equal(w1.dead, false);                              // wall segment STAYS (small hole, no removal)
  assert.equal(w1.hp, 0, 'hp clamped at 0, never negative');
});

test('APFSDS stops after maxWalls penetrations', () => {
  const walls = [0, 2, 4, 6, 8].map((z, i) =>
    makePart('w' + i, 'wood', [-1, 0, z], [1, 2.5, z + 0.3]));
  const res = resolvePenetration(walls, [0, 1, -5], [0, 0, 1], LAB_WEAPONS.apfsds);
  assert.equal(res.hits.length, LAB_WEAPONS.apfsds.through.maxWalls);
});

test('glass does not consume a wall slot and dies outright', () => {
  const g = makePart('g1', 'glass', [-1, 0, 0], [1, 2, 0.05]);
  const w = makePart('w1', 'brick', [-1, 0, 2], [1, 2.5, 2.3]);
  const res = resolvePenetration([g, w], [0, 1, -5], [0, 0, 1], LAB_WEAPONS.apfsds);
  assert.equal(g.dead, true);
  const wallHit = res.hits.find(h => h.id === 'w1');
  assert.ok(Math.abs(wallHit.dmg - 900) < 1e-9);   // full energy — glass cost nothing
});

test('coneContains: inside, behind-apex, and off-axis points', () => {
  const cone = { apex: [0, 1, 0], dir: [0, 0, 1], range: 6, halfAngle: 0.5 };
  assert.equal(coneContains(cone, [0.5, 1, 3]), true);
  assert.equal(coneContains(cone, [0, 1, -1]), false);   // behind apex
  assert.equal(coneContains(cone, [5, 1, 3]), false);    // way off axis
  assert.equal(coneContains(cone, [0, 1, 7]), false);    // beyond range
});
