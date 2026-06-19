import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTerrain } from '../../src/terrain.js';
import { planChunks } from '../../src/terrain-layout.js';
import { computeChunkArrays } from '../../src/terrain-mesh-arrays.js';

const terrain = () => makeTerrain({ profile: 'demo', seed: 1337 });
const oneChunk = () => planChunks(158, 64)[5]; // an off-centre chunk so heights vary

test('array shapes match the segment/skirt count', () => {
  const segs = 16, vpr = segs + 1;
  const total = vpr * vpr + 4 * segs;            // top grid + perimeter skirt ring
  const a = computeChunkArrays(terrain(), oneChunk(), segs);
  assert.equal(a.positions.length, total * 3);
  assert.equal(a.colors.length, total * 3);
  assert.equal(a.normals.length, total * 3);
  assert.equal(a.indices.length, segs * segs * 6 + 4 * segs * 12); // top tris + double-sided skirt quads
  assert.ok(a.positions instanceof Float32Array);
  assert.ok(a.indices instanceof Uint32Array);   // transferable index buffer
});

test('vertex Y equals the terrain height contract at that world point', () => {
  const t = terrain(), c = oneChunk(), segs = 8, vpr = segs + 1;
  const a = computeChunkArrays(t, c, segs);
  const halfX = c.sizeX / 2, halfZ = c.sizeZ / 2, dx = c.sizeX / segs, dz = c.sizeZ / segs;
  for (const [ix, iz] of [[0, 0], [4, 3], [segs, segs]]) {
    const i = iz * vpr + ix;
    const wx = c.centerX + (-halfX + ix * dx), wz = c.centerZ + (-halfZ + iz * dz);
    // positions is Float32Array → compare against the float32-rounded height
    assert.equal(a.positions[i * 3 + 1], Math.fround(t.terrainHeightAt(wx, wz)), `height mismatch at ${ix},${iz}`);
  }
});

test('determinism: same terrain + chunk ⇒ byte-identical arrays', () => {
  const c = oneChunk();
  const a = computeChunkArrays(terrain(), c, 16);
  const b = computeChunkArrays(terrain(), c, 16);
  assert.deepEqual(a.positions, b.positions);
  assert.deepEqual(a.colors, b.colors);
  assert.deepEqual(a.normals, b.normals);
  assert.deepEqual(a.indices, b.indices);
});

test('worker round-trip: terrain rebuilt from its serialized opts is byte-identical', () => {
  const src = terrain(), c = oneChunk();
  // what the client ships to the worker → worker does makeTerrain(opts)
  const opts = { profile: src.profile, seed: src.seed, slopeLimit: src.slopeLimit, tuning: src.tuning, reserved: src.reserved };
  const rebuilt = makeTerrain(opts);
  const a = computeChunkArrays(src, c, 32);
  const b = computeChunkArrays(rebuilt, c, 32);
  assert.deepEqual(a.positions, b.positions, 'positions diverge after rebuild');
  assert.deepEqual(a.colors, b.colors, 'colors diverge after rebuild');
  assert.deepEqual(a.normals, b.normals, 'normals diverge after rebuild');
  assert.deepEqual(a.indices, b.indices, 'indices diverge after rebuild');
});

test('flat profile is flat (top Y=0, skirt Y=-8, normals up)', () => {
  const segs = 8, vpr = segs + 1, topCount = vpr * vpr;
  const a = computeChunkArrays(makeTerrain({ profile: 'flat' }), oneChunk(), segs);
  for (let i = 0; i < a.positions.length / 3; i++) {
    const expectedY = i < topCount ? 0 : -8; // top surface flat; perimeter skirt drops SKIRT_DEPTH
    assert.equal(a.positions[i * 3 + 1], expectedY, `Y at vertex ${i}`);
    assert.equal(a.normals[i * 3 + 1], 1, `normal up at vertex ${i}`);
  }
});
