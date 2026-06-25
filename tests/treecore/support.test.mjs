import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTrunk, cellIndex, carve, supportFlood } from '../../src/treecore.js';

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
