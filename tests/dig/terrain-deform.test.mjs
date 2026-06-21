import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTerrain } from '../../src/terrain.js';
import { planChunks } from '../../src/terrain-layout.js';
import { computeChunkArrays } from '../../src/terrain-mesh-arrays.js';
import { DeformField } from '../../src/dig.js';

const demo = () => makeTerrain({ profile: 'demo', seed: 1337 });

test('terrainHeightAt adds the deform offset (crater lowers the ground)', () => {
  const t = demo();
  const x = 18, z = -7;
  const before = t.terrainHeightAt(x, z);
  const df = new DeformField();
  t.setDeformField(df);
  assert.equal(t.terrainHeightAt(x, z), before, 'empty field = no change');
  df.add({ x, z, r: 4, depth: 3, lip: 0 });
  assert.ok(Math.abs(t.terrainHeightAt(x, z) - (before - 3)) < 1e-9, 'centre dropped by depth');
});

test('flat profile still digs (base 0 + deform)', () => {
  const t = makeTerrain({ profile: 'flat', deformField: new DeformField() });
  assert.equal(t.terrainHeightAt(5, 5), 0);
  t.deformField.add({ x: 5, z: 5, r: 3, depth: 2, lip: 0 });
  assert.ok(Math.abs(t.terrainHeightAt(5, 5) - (-2)) < 1e-9);
});

test('worker-vs-main parity: same deform stream ⇒ byte-identical chunk arrays (Option A)', () => {
  // The dig events the host carved, in order — both the main thread and the worker replay this list.
  const stream = [
    { x: 30, z: -12, r: 4, depth: 2.5, lip: 0.4 },
    { x: 24, z: -18, r: 3, depth: 1.5, lip: 0 },
    { x: 40, z: -5, r: 5, depth: 3, lip: 0.5 },
  ];
  const c = planChunks(158, 64)[5];

  // MAIN thread: terrain + its own field
  const main = makeTerrain({ profile: 'demo', seed: 1337 });
  main.setDeformField(new DeformField());
  for (const p of stream) main.deformField.add(p);

  // WORKER: terrain rebuilt from the serialized opts + a field fed the SAME ordered stream
  const opts = { profile: main.profile, seed: main.seed, slopeLimit: main.slopeLimit, tuning: main.tuning, reserved: main.reserved };
  const worker = makeTerrain(opts);
  worker.setDeformField(new DeformField());
  for (const p of stream) worker.deformField.add(p);

  const a = computeChunkArrays(main, c, 32);
  const b = computeChunkArrays(worker, c, 32);
  assert.deepEqual(a.positions, b.positions, 'positions diverge');
  assert.deepEqual(a.colors, b.colors, 'colors diverge (slope recolor in the bowl must match)');
  assert.deepEqual(a.normals, b.normals, 'normals diverge');
  assert.deepEqual(a.indices, b.indices, 'indices diverge');
});

test('a deform actually changes the mesh it overlaps (sanity: not a no-op)', () => {
  const c = planChunks(158, 64)[5];
  const plain = makeTerrain({ profile: 'demo', seed: 1337 });
  const dug = makeTerrain({ profile: 'demo', seed: 1337 });
  dug.setDeformField(new DeformField());
  // dig at the chunk centre so some vertices are inside the bowl
  dug.deformField.add({ x: c.centerX, z: c.centerZ, r: 8, depth: 4, lip: 0 });
  const a = computeChunkArrays(plain, c, 32);
  const b = computeChunkArrays(dug, c, 32);
  let differ = 0;
  for (let i = 0; i < a.positions.length; i++) if (a.positions[i] !== b.positions[i]) differ++;
  assert.ok(differ > 0, 'the bowl must move some vertices');
});
