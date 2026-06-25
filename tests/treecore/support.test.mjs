import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTrunk, cellIndex, carve, supportFlood, orphanGroups, classifyPiece } from '../../src/treecore.js';

const aliveSupported = (t, sup) => { let n = 0; for (let i = 0; i < t.alive.length; i++) if (t.alive[i] && sup[i]) n++; return n; };

test('intact trunk: every alive cell is supported', () => {
  const t = makeTrunk({ height: 6, radius: 0.5, bands: 3, sectors: 6, rings: 2 });
  const sup = supportFlood(t);
  assert.equal(aliveSupported(t, sup), t.alive.length);
});

test('severing a whole middle band orphans everything above it', () => {
  const t = makeTrunk({ height: 9, radius: 0.5, bands: 3, sectors: 6, rings: 1, hp: 1 });
  // kill all of band 1
  for (let s = 0; s < t.sectors; s++) carve(t, 1.5 * t.bandH, s / t.sectors * Math.PI * 2, { pen: 1, dmg: 1000 });
  const sup = supportFlood(t);
  for (let s = 0; s < t.sectors; s++) assert.equal(sup[cellIndex(t, 2, s, 0)], 0);   // band 2 unsupported
  for (let s = 0; s < t.sectors; s++) assert.equal(sup[cellIndex(t, 0, s, 0)], 1);   // band 0 still supported
});

test('orphanGroups: severed top is ONE group spanning the upper bands → classified hinge', () => {
  const t = makeTrunk({ height: 12, radius: 0.5, bands: 4, sectors: 6, rings: 1, hp: 1 });
  for (let s = 0; s < t.sectors; s++) carve(t, 1.5 * t.bandH, s / t.sectors * Math.PI * 2, { pen: 1, dmg: 1000 }); // sever band 1
  const groups = orphanGroups(t, supportFlood(t));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].minB, 2);   // bands 2..3 above the cut
  assert.equal(classifyPiece(groups[0], t), 'hinge');
});

test('orphanGroups: a small disconnected clump → classified tumble', () => {
  // make a 1-cell island: kill its only downward + lateral links so it floats free
  const t = makeTrunk({ height: 9, radius: 0.5, bands: 3, sectors: 4, rings: 1, hp: 1 });
  // kill all of band 1 EXCEPT keep none → then band 2 fully orphan; but we want a SMALL group:
  // kill band1 sector0..3 and band2 sector1..3, leaving only band2 sector0 alive & orphaned (1 cell)
  for (let s = 0; s < 4; s++) carve(t, 1.5 * t.bandH, s / 4 * Math.PI * 2, { pen: 1, dmg: 1000 });
  for (let s = 1; s < 4; s++) carve(t, 2.5 * t.bandH, s / 4 * Math.PI * 2, { pen: 1, dmg: 1000 });
  const groups = orphanGroups(t, supportFlood(t));
  const small = groups.find(g => g.count === 1);
  assert.ok(small, 'expected a 1-cell orphan');
  assert.equal(classifyPiece(small, t), 'tumble');
});
