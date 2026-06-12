import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, CALIBERS, makePart, resolveHit, resolveBlast, resolvePenetration, coneContains } from '../../src/destruct.js';

test('makePart yields the part-metadata contract { min, max, dmat, dhp, dpart, downer, dead }', () => {
  const p = makePart('w1', 'brick', [0, 0, 0], [1.5, 2.5, 0.3]);
  assert.equal(p.dpart, 'w1');
  assert.equal(p.dmat, 'brick');
  assert.equal(p.dhp, MATERIALS.brick.hp);
  assert.deepEqual(p.min, [0, 0, 0]);
  assert.deepEqual(p.max, [1.5, 2.5, 0.3]);
  assert.equal(p.downer, null);
  assert.equal(p.dead, false);
});

test('pistol vs brick is cosmetic only (pen 0 < tier 3), hp untouched', () => {
  const p = makePart('w1', 'brick', [0, 0, 0], [1.5, 2.5, 0.3]);
  const r = resolveHit(p, CALIBERS.pistol);
  assert.equal(r.effect, 'cosmetic');
  assert.equal(p.dhp, MATERIALS.brick.hp);
});

test('pistol kills a glass pane in one hit (tier 0, hp 1)', () => {
  const p = makePart('g1', 'glass', [0, 1, 0], [1, 2, 0.05]);
  const r = resolveHit(p, CALIBERS.pistol);
  assert.equal(r.effect, 'damage');
  assert.equal(r.killed, true);
});

test('rifle chews through a wood fence segment in 4 hits (60 hp / 15 dmg)', () => {
  const p = makePart('f1', 'wood', [0, 0, 0], [1.5, 1.2, 0.1]);
  let killed = false;
  for (let i = 0; i < 4; i++) killed = resolveHit(p, CALIBERS.rifle).killed;
  assert.equal(killed, true);
});

test('12.7 damages a trunk (pen 2 ≥ tier 2); rifle does not', () => {
  const p = makePart('t1', 'trunk', [0, 0, 0], [0.4, 7, 0.4]);
  assert.equal(resolveHit(p, CALIBERS.rifle).effect, 'cosmetic');
  assert.equal(resolveHit(p, CALIBERS.hmg127).effect, 'damage');
});

test('hpScale multiplies part hp (class-3 oak trunk = 3× trunk hp)', () => {
  const p = makePart('t3', 'trunk', [0, 0, 0], [1, 9, 1], 3);
  assert.equal(p.dhp, MATERIALS.trunk.hp * 3);
});

test('resolveHit on an already-dead part is cosmetic (no double-kill events)', () => {
  const p = makePart('g9', 'glass', [0, 1, 0], [1, 2, 0.05]);
  resolveHit(p, CALIBERS.pistol);
  const hpAfterKill = p.dhp;
  const again = resolveHit(p, CALIBERS.pistol);
  assert.equal(again.effect, 'cosmetic');
  assert.equal(p.dhp, hpAfterKill);
});

test('HE blast kills brick inside r1 but not concrete; far brick survives', () => {
  const near  = makePart('b1', 'brick',    [1, 0, 0],  [2.5, 2.5, 0.3]);
  const conc  = makePart('c1', 'concrete', [-2, 0, 0], [-0.5, 2.5, 0.3]);
  const far   = makePart('b2', 'brick',    [8, 0, 0],  [9.5, 2.5, 0.3]);
  const res = resolveBlast([near, conc, far], [0, 1.2, 0], CALIBERS.heRocket.blast);
  assert.deepEqual(res.killed, ['b1']);
  assert.equal(conc.dead, false);
  assert.equal(far.dead, false);
});

test('HE shatters glass in the wide r2 ring but not beyond', () => {
  const gNear = makePart('g1', 'glass', [4, 1, 0], [5, 2, 0.05]);
  const gFar  = makePart('g2', 'glass', [9, 1, 0], [10, 2, 0.05]);
  const res = resolveBlast([gNear, gFar], [0, 1.2, 0], CALIBERS.heRocket.blast);
  assert.deepEqual(res.glass, ['g1']);
  assert.equal(gNear.dead, true);
  assert.equal(gFar.dead, false);
});

test('blast ignores already-dead parts', () => {
  const p = makePart('b9', 'brick', [1, 0, 0], [2, 2, 0.3]);
  p.dead = true;
  const res = resolveBlast([p], [0, 1, 0], CALIBERS.heRocket.blast);
  assert.deepEqual(res.killed, []);
});

test('APFSDS passes through two structural walls, damage decays, spall cone behind each', () => {
  const w1 = makePart('w1', 'brick', [-1, 0, 0], [1, 2.5, 0.3]);
  const w2 = makePart('w2', 'brick', [-1, 0, 4], [1, 2.5, 4.3]);
  const res = resolvePenetration([w1, w2], [0, 1.2, -5], [0, 0, 1], CALIBERS.apfsds);
  assert.equal(res.hits.length, 2);
  assert.equal(res.hits[0].id, 'w1');                       // sorted near→far
  assert.ok(Math.abs(res.hits[0].dmg - 900) < 1e-9);
  assert.ok(Math.abs(res.hits[1].dmg - 900 * 0.6) < 1e-9);  // falloff per wall
  assert.equal(res.cones.length, 2);
  assert.ok(res.cones[0].apex[2] > 0.3 - 1e-9);             // apex at exit point
});

test('REFINED APFSDS: obliterates a tier ≤ 2 part on its path (wood + trunk killed)', () => {
  const wood  = makePart('f1', 'wood',  [-1, 0, 0], [1, 2, 0.3]);
  const trunk = makePart('t1', 'trunk', [-1, 0, 4], [1, 7, 4.4]);
  const res = resolvePenetration([wood, trunk], [0, 1.2, -5], [0, 0, 1], CALIBERS.apfsds);
  assert.equal(wood.dead, true);
  assert.equal(trunk.dead, true);
  assert.equal(res.hits.length, 2);
  assert.ok(res.hits.every(h => h.killed === true && h.kind === 'obliterate'));
  assert.equal(res.cones.length, 0, 'fragile parts make no spall cone (they are obliterated)');
});

test('REFINED APFSDS: leaves a tier ≥ 3 wall STANDING with a through-hole (dead:false)', () => {
  const wall = makePart('w1', 'concrete', [-1, 0, 0], [1, 2.5, 0.3]);
  const res = resolvePenetration([wall], [0, 1.2, -5], [0, 0, 1], CALIBERS.apfsds);
  assert.equal(wall.dead, false, 'structural wall stays — APFSDS makes a hole, not a breach');
  assert.equal(res.hits.length, 1);
  assert.equal(res.hits[0].kind, 'hole');
  assert.equal(res.hits[0].killed, false);
  assert.equal(res.cones.length, 1, 'one spall cone behind the penetrated wall');
});

test('REFINED APFSDS: spall cone catches a fragile part offset from the ray', () => {
  const wall = makePart('w1', 'brick', [-1, 0, 0], [1, 2.5, 0.3]);
  const off  = makePart('p2', 'wood',  [0.4, 0.5, 2], [0.9, 1.5, 2.1]);   // offset, not on the ray
  const res = resolvePenetration([wall, off], [0, 1, -5], [0, 0, 1], CALIBERS.apfsds);
  const cone = res.cones[0];
  assert.ok(cone.targets.includes('p2'), 'offset fragile board is a spall target');
});

test('APFSDS stops after maxWalls STRUCTURAL penetrations', () => {
  const walls = [0, 2, 4, 6, 8].map((z, i) =>
    makePart('w' + i, 'brick', [-1, 0, z], [1, 2.5, z + 0.3]));
  const res = resolvePenetration(walls, [0, 1, -5], [0, 0, 1], CALIBERS.apfsds);
  assert.equal(res.hits.length, CALIBERS.apfsds.through.maxWalls);
});

test('glass does not consume a wall slot and dies outright (full energy to the wall)', () => {
  const g = makePart('g1', 'glass', [-1, 0, 0], [1, 2, 0.05]);
  const w = makePart('w1', 'brick', [-1, 0, 2], [1, 2.5, 2.3]);
  const res = resolvePenetration([g, w], [0, 1, -5], [0, 0, 1], CALIBERS.apfsds);
  assert.equal(g.dead, true);
  const wallHit = res.hits.find(h => h.id === 'w1');
  assert.ok(Math.abs(wallHit.dmg - 900) < 1e-9);   // full energy — glass cost nothing
});

test('coneContains: inside, behind-apex, and off-axis points', () => {
  const cone = { apex: [0, 1, 0], dir: [0, 0, 1], range: 6, halfAngle: 0.5 };
  assert.equal(coneContains(cone, [0.5, 1, 3]), true);
  assert.equal(coneContains(cone, [0, 1, -1]), false);
  assert.equal(coneContains(cone, [5, 1, 3]), false);
  assert.equal(coneContains(cone, [0, 1, 7]), false);
});

test('MATERIALS.fuel: only wood/trunk/grass burn (fuel > 0); inorganics never ignite (fuel 0)', () => {
  assert.equal(MATERIALS.glass.fuel, 0);
  assert.equal(MATERIALS.wood.fuel, 6);
  assert.equal(MATERIALS.sheetmetal.fuel, 0);
  assert.equal(MATERIALS.trunk.fuel, 10);
  assert.equal(MATERIALS.brick.fuel, 0);
  assert.equal(MATERIALS.concrete.fuel, 0);
  assert.equal(MATERIALS.steel.fuel, 0);
  assert.equal(MATERIALS.grass.fuel, 2);
});

test('MATERIALS.sound buckets match the spec mapping', () => {
  assert.equal(MATERIALS.glass.sound, 'glass');
  assert.equal(MATERIALS.wood.sound, 'wood');
  assert.equal(MATERIALS.sheetmetal.sound, 'metal');
  assert.equal(MATERIALS.trunk.sound, 'wood');
  assert.equal(MATERIALS.brick.sound, 'masonry');
  assert.equal(MATERIALS.concrete.sound, 'masonry');
  assert.equal(MATERIALS.steel.sound, 'metal');
});
