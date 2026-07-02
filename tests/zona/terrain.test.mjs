import test from 'node:test';
import assert from 'node:assert/strict';
import { makeZonaHeightFn, polylineProject, distToSeg } from '../../src/zona-terrain.js';

test('distToSeg: perpendicular + endpoint cases', () => {
  assert.equal(Math.round(distToSeg(0, 5, -10, 0, 10, 0).d), 5);
  assert.equal(Math.round(distToSeg(20, 0, -10, 0, 10, 0).d), 10); // beyond B → dist to B
});

test('polylineProject returns arc-length position', () => {
  const pts = [[0, 0], [10, 0], [10, 10]];
  const r = polylineProject(pts, 10.5, 5);
  assert.ok(Math.abs(r.s - 15) < 0.75, `s=${r.s}`); // 10 along seg0 + 5 along seg1
  assert.ok(r.d < 1);
});

test('pinned plan heights (stamps only — corridors/pads come later)', () => {
  const h = makeZonaHeightFn(704);
  assert.ok(Math.abs(h(50, 630) - 60) < 3, `P3 shelf ${h(50, 630)}`);          // abs plateau
  assert.ok(Math.abs(h(1000, 1060) - 200) < 5, `P8 saddle ${h(1000, 1060)}`);
  assert.ok(Math.abs(h(470, -850) - (-12)) < 1, `swamp ${h(470, -850)}`);
  assert.ok(Math.abs(h(-140, -260) - (-25)) < 3, `quarry ${h(-140, -260)}`);
  assert.ok(h(-50, 60) > 100, `massif crest ${h(-50, 60)}`); // ridge ~+150 minus fbm wobble
});

test('river channel carves below the surrounding field', () => {
  const h = makeZonaHeightFn(704);
  // on the river course at the S04 bridge vs 60 m east of it (off-channel, plain steppe)
  const onRiver = h(-470, -620), off = h(-410, -620);
  assert.ok(onRiver < off - 1.2, `channel ${onRiver} vs bank ${off}`);
});

test('determinism + totality on a coarse full-map sweep', () => {
  const a = makeZonaHeightFn(704), b = makeZonaHeightFn(704);
  for (let x = -1250; x <= 1250; x += 125) for (let z = -1250; z <= 1250; z += 125) {
    const ha = a(x, z);
    assert.ok(Number.isFinite(ha), `NaN at ${x},${z}`);
    assert.equal(ha, b(x, z), `mismatch at ${x},${z}`);
  }
});
