import test from 'node:test';
import assert from 'node:assert/strict';
import { planChunks } from '../../src/terrain-layout.js';

test('covers the full map with no gaps and no overflow', () => {
  const extent = 128, chunk = 64;          // map spans [-128,128] on each axis = 256 m
  const chunks = planChunks(extent, chunk);
  // 256/64 = 4 chunks per axis = 16 total
  assert.equal(chunks.length, 16);
  // every chunk stays within map bounds
  for (const c of chunks) {
    assert.ok(c.minX >= -extent - 1e-9 && c.maxX <= extent + 1e-9);
    assert.ok(c.minZ >= -extent - 1e-9 && c.maxZ <= extent + 1e-9);
    assert.ok(c.sizeX > 0 && c.sizeZ > 0);
    assert.equal(c.centerX, (c.minX + c.maxX) / 2);
    assert.equal(c.centerZ, (c.minZ + c.maxZ) / 2);
  }
  // union of chunk areas == full map area (no gaps/overlap for an even split)
  const area = chunks.reduce((s, c) => s + c.sizeX * c.sizeZ, 0);
  assert.equal(area, (extent * 2) * (extent * 2));
});

test('clamps the final row/col when span is not divisible by chunkSize', () => {
  const extent = 100, chunk = 64;          // span 200, ceil(200/64) = 4 per axis
  const chunks = planChunks(extent, chunk);
  assert.equal(chunks.length, 16);
  // last column max must clamp to +extent, never overshoot
  const maxX = Math.max(...chunks.map((c) => c.maxX));
  const maxZ = Math.max(...chunks.map((c) => c.maxZ));
  assert.equal(maxX, extent);
  assert.equal(maxZ, extent);
  // a clamped edge chunk is narrower than a full one
  assert.ok(chunks.some((c) => c.sizeX < chunk - 1e-9));
});

test('rejects non-positive inputs', () => {
  assert.throws(() => planChunks(0, 64));
  assert.throws(() => planChunks(128, 0));
  assert.throws(() => planChunks(-5, 64));
});

test('chunk count per axis is ceil(span / chunkSize)', () => {
  assert.equal(planChunks(160, 64).length, Math.ceil(320 / 64) ** 2); // 5*5 = 25
});
