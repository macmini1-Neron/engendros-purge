// tests/terrain/lod.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLOD, LOD_BANDS, LOD_RESOLUTIONS } from '../../src/terrain-lod.js';

test('config is consistent: one more resolution than band edge', () => {
  assert.equal(LOD_RESOLUTIONS.length, LOD_BANDS.length + 1);
  // resolutions descend (high detail → low detail)
  for (let i = 1; i < LOD_RESOLUTIONS.length; i++) {
    assert.ok(LOD_RESOLUTIONS[i] < LOD_RESOLUTIONS[i - 1]);
  }
  // bands ascend
  for (let i = 1; i < LOD_BANDS.length; i++) assert.ok(LOD_BANDS[i] > LOD_BANDS[i - 1]);
});

test('no-hysteresis: returns the LOD index for a distance', () => {
  const bands = [100, 200];
  assert.equal(pickLOD(0,   bands), 0);
  assert.equal(pickLOD(99,  bands), 0);
  assert.equal(pickLOD(100, bands), 1);   // at the edge → coarser
  assert.equal(pickLOD(199, bands), 1);
  assert.equal(pickLOD(200, bands), 2);
  assert.equal(pickLOD(9e9, bands), 2);   // clamps at last level
});

test('hysteresis holds the previous level inside the margin band', () => {
  const bands = [100, 200], margin = 20;
  // sitting just past the 100 edge but still within margin → keep finer prev=0
  assert.equal(pickLOD(110, bands, 0, margin), 0);
  // past the edge by more than margin → commit to coarser
  assert.equal(pickLOD(121, bands, 0, margin), 1);
  // coming back finer: must drop below edge-margin (80) before committing to 0
  assert.equal(pickLOD(90, bands, 1, margin), 1);   // 90 > 80 → hold coarser
  assert.equal(pickLOD(79, bands, 1, margin), 0);   // 79 < 80 → commit finer
});

test('hysteresis tolerates multi-level jumps (teleport)', () => {
  const bands = [100, 200], margin = 20;
  assert.equal(pickLOD(500, bands, 0, margin), 2); // far jump from near → coarsest
  assert.equal(pickLOD(5,   bands, 2, margin), 0); // near jump from far → finest
});
