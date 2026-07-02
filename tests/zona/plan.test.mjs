import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTENT, PARCELS, ROADS, GATES, WATER, ZONES, zoneRects, inZone, lintPlan } from '../../src/zona-plan.js';

test('ZONES: 9 zones, rects in bounds, anchor inside its own zone', () => {
  assert.equal(ZONES.length, 9);
  for (const zn of ZONES) {
    for (const r of zoneRects(zn)) {
      assert.ok(r.x0 < r.x1 && r.z0 < r.z1, `${zn.id} degenerate rect`);
      for (const v of [r.x0, r.x1, r.z0, r.z1]) assert.ok(Math.abs(v) <= EXTENT, `${zn.id} rect out of bounds`);
    }
    assert.ok(inZone(zn, zn.anchor[0], zn.anchor[1]), `${zn.id} anchor outside zone`);
  }
});

test('registry counts match master plan v1.2', () => {
  assert.equal(EXTENT, 1250);
  assert.equal(PARCELS.filter(p => p.id.startsWith('P')).length, 9);   // P1–P9
  assert.equal(PARCELS.filter(p => p.id.startsWith('S')).length, 20);  // S01–S20
  assert.equal(PARCELS.filter(p => p.id.startsWith('E')).length, 8);   // E01–E08
  assert.equal(GATES.length, 5);
  assert.ok(ROADS.length >= 8); // R1, R2, forest loop, quarry link, rail, serpentine, perimeter, spurs
  assert.ok(WATER.river.pts.length >= 8);
});

test('every parcel and road vertex is inside map bounds', () => {
  for (const p of PARCELS) {
    assert.ok(Math.abs(p.x) <= EXTENT && Math.abs(p.z) <= EXTENT, p.id);
  }
  for (const r of ROADS) for (const [x, z] of r.pts) {
    assert.ok(Math.abs(x) <= EXTENT && Math.abs(z) <= EXTENT, `${r.id} (${x},${z})`);
  }
});

test('gates sit on their declared road (within 30 m of some vertex)', () => {
  for (const g of GATES) {
    const road = ROADS.find(r => r.id === g.roadId);
    assert.ok(road, `${g.id} road ${g.roadId}`);
    const near = road.pts.some(([x, z]) => Math.hypot(x - g.x, z - g.z) <= 30);
    assert.ok(near, `${g.id} not on ${g.roadId}`);
  }
});

test('lintPlan passes on the shipped registry', () => {
  const { errors } = lintPlan();
  assert.deepEqual(errors, []);
});

test('lintPlan catches an out-of-bounds parcel', () => {
  PARCELS.push({ id: 'XX', name: 'bogus', kind: 'disc', x: 9999, z: 0, r: 10, tier: 1 });
  try { assert.ok(lintPlan().errors.length > 0); }
  finally { PARCELS.pop(); }
});
