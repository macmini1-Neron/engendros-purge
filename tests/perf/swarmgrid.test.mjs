import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSwarmGrid, eachNeighbor } from '../../src/swarmgrid.js';

// Deterministic LCG so the fixture is stable without Math.random.
function lcg(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

const mk = (x, z) => ({ pos: { x, z } });
const R2 = 2.6;            // the horde separation radius² (enemies.js)
const CELL = 2.0;         // production cell — ≥ √R2 (≈1.612) so a 3×3 block can't miss an in-range neighbour (with drift slack)

// brute-force: indices of OTHER items within √R2 of items[i]
function bruteNeighbors(items, i) {
  const out = [];
  for (let j = 0; j < items.length; j++) {
    if (j === i) continue;
    const dx = items[i].pos.x - items[j].pos.x, dz = items[i].pos.z - items[j].pos.z;
    if (dx * dx + dz * dz < R2) out.push(j);
  }
  return out.sort((a, b) => a - b);
}

test('eachNeighbor finds EXACTLY the in-range neighbours (no miss vs brute force)', () => {
  const rnd = lcg(12345);
  const items = [];
  for (let n = 0; n < 400; n++) items.push(mk((rnd() - 0.5) * 60, (rnd() - 0.5) * 60)); // dense 60×60 field
  items.forEach((it, idx) => { it._i = idx; });
  const grid = buildSwarmGrid(items, CELL);

  for (let i = 0; i < items.length; i++) {
    const found = [];
    eachNeighbor(grid, items[i].pos.x, items[i].pos.z, (o) => {
      if (o === items[i]) return;
      const dx = items[i].pos.x - o.pos.x, dz = items[i].pos.z - o.pos.z;
      if (dx * dx + dz * dz < R2) found.push(o._i);
    });
    found.sort((a, b) => a - b);
    assert.deepEqual(found, bruteNeighbors(items, i), `neighbour set mismatch at item ${i}`);
  }
});

test('works with negative coordinates (no truncation seam at 0)', () => {
  // two items 1.0 apart straddling the origin — must see each other
  const items = [mk(-0.5, -0.5), mk(0.5, 0.5)];
  const grid = buildSwarmGrid(items, CELL);
  let saw = 0;
  eachNeighbor(grid, items[0].pos.x, items[0].pos.z, (o) => { if (o !== items[0]) saw++; });
  assert.equal(saw, 1, 'the item across the origin must be found');
});

test('empty input is safe', () => {
  const grid = buildSwarmGrid([], CELL);
  let n = 0; eachNeighbor(grid, 0, 0, () => n++);
  assert.equal(n, 0);
});
