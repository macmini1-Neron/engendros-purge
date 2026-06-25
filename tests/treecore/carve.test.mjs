import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTrunk, cellIndex, carve } from '../../src/treecore.js';

test('carve pen=1 kills only the OUTER ring at the hit sector; core survives', () => {
  const t = makeTrunk({ height: 6, radius: 0.6, bands: 3, sectors: 8, rings: 2, hp: 5 });
  const yMid = 1 * t.bandH + t.bandH / 2;      // band 1
  const dead = carve(t, yMid, 0, { pen: 1, dmg: 1000 });   // angle 0 → sector 0
  assert.ok(dead.includes(cellIndex(t, 1, 0, 0)));         // outer ring dead
  assert.equal(t.alive[cellIndex(t, 1, 0, 1)], 1);         // core still alive (pen can't reach)
});

test('carve accumulates damage; cell dies only when hp ≤ 0', () => {
  const t = makeTrunk({ height: 4, radius: 0.5, bands: 2, sectors: 4, rings: 1, hp: 10 });
  assert.equal(carve(t, 0.5, 0, { pen: 1, dmg: 4 }).length, 0);   // 10-4=6, alive
  assert.equal(carve(t, 0.5, 0, { pen: 1, dmg: 4 }).length, 0);   // 6-4=2, alive
  assert.equal(carve(t, 0.5, 0, { pen: 1, dmg: 4 }).length, 1);   // 2-4<0, dies
});

test('carve spread removes a footprint of neighbouring sectors/bands', () => {
  const t = makeTrunk({ height: 9, radius: 0.6, bands: 3, sectors: 8, rings: 1, hp: 1 });
  const dead = carve(t, 1.5 * t.bandH, 0, { pen: 1, dmg: 1000, spreadS: 1, spreadB: 1 });
  // 3 bands (0,1,2 clamped) × 3 sectors (7,0,1) = up to 9 cells
  assert.ok(dead.length >= 6);
});
