// destructible-geom.test.mjs — pure geometry/id helpers for the destructible runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { worldAABB, paneAABB, makeBid, hpScaleFor } from '../../src/buildings/destructible-geom.js';

test('worldAABB k=0 is a pure translation', () => {
  const w = worldAABB(0, 10, 0, 20, [-1, 0, -0.5], [1, 3, 0.5]);
  assert.deepEqual(w.min, [9, 0, 19.5]);
  assert.deepEqual(w.max, [11, 3, 20.5]);
});

test('worldAABB k=1 (90°) swaps extents exactly then translates — matches placeBuilding', () => {
  // local x∈[-2,2], z∈[-0.5,0.5] under 90°: (x,z)→(z,−x) ⇒ x∈[-0.5,0.5], z∈[-2,2]
  const w = worldAABB(1, 100, 5, 200, [-2, 0, -0.5], [2, 3, 0.5]);
  assert.ok(Math.abs((w.max[0] - w.min[0]) - 1) < 1e-9, 'x extent = old z extent');
  assert.ok(Math.abs((w.max[2] - w.min[2]) - 4) < 1e-9, 'z extent = old x extent');
  assert.equal(w.min[1], 5); assert.equal(w.max[1], 8);          // y untouched + translated
});

test('paneAABB: ry 0 is thin in z, ry 90 is thin in x', () => {
  const z = paneAABB({ x: 0, y: 1.5, z: 3, w: 1.2, h: 1.4, ry: 0 });
  assert.ok((z.max[0] - z.min[0]) > 1, 'ry0 spans w in x');
  assert.ok((z.max[2] - z.min[2]) < 0.1, 'ry0 thin in z');
  const x = paneAABB({ x: 3, y: 1.5, z: 0, w: 1.2, h: 1.4, ry: 90 });
  assert.ok((x.max[0] - x.min[0]) < 0.1, 'ry90 thin in x');
  assert.ok((x.max[2] - x.min[2]) > 1, 'ry90 spans w in z');
  assert.ok(Math.abs((x.max[1] - x.min[1]) - 1.4) < 1e-9, 'height in y both ways');
});

test('makeBid is placement-encoded and stable', () => {
  assert.equal(makeBid('zavod', 12.4, -7.6, 1), 'zavod@12,-8,1');
  assert.equal(makeBid('zavod', 12.4, -7.6, 1), makeBid('zavod', 12.4, -7.6, 1));
});

test('hpScaleFor resolves the source spec part by id prefix (default 1)', () => {
  const spec = { parts: [{ id: 'shell', op: 'shellBox', hpScale: 2.5 }, { id: 'roof', op: 'flatRoof' }] };
  assert.equal(hpScaleFor(spec, 'shell:N:seg3'), 2.5);
  assert.equal(hpScaleFor(spec, 'roof'), 1);
  assert.equal(hpScaleFor(spec, 'unknown:pane:0'), 1);
});
