import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNavGrid, lineBlocked } from '../../src/pathing.js';

// Minimal fake world: only the fields buildNavGrid reads.
//   box shape = { min:{x,z}, max:{x,y,z}, struct? }
function aabb(minx, minz, maxx, maxz, maxy = 3) {
  return { min: { x: minx, z: minz }, max: { x: maxx, y: maxy, z: maxz } };
}
function fakeWorld({ HALF = 20, boxes = [], hasTerrain = false, terrain = null } = {}) {
  return { HALF, boxes, hasTerrain, terrain };
}
const idx = (g, c, r) => r * g.cols + c;
const cOf = (g, x) => Math.floor((x - g.originX) / g.cell);
const rOf = (g, z) => Math.floor((z - g.originZ) / g.cell);

// A wall split into two boxes leaving a gap centred on x=0 (z slab -0.5..0.5).
function wallWithGap(gapHalf = 3) {
  return [aabb(-10, -0.5, -gapHalf, 0.5), aabb(gapHalf, -0.5, 10, 0.5)];
}

test('(a) default call == old constants (cell 2.5, inflate 1.7, no slope)', () => {
  const w = fakeWorld({ boxes: wallWithGap() });
  const def = buildNavGrid(w);
  const explicit = buildNavGrid(w, { cell: 2.5, inflate: 1.7, slopeAware: false });
  assert.equal(def.cell, 2.5, 'default cell stays 2.5');
  assert.equal(def.cols, Math.ceil(40 / 2.5), 'cols from HALF*2/cell');
  assert.equal(def.rows, def.cols);
  assert.deepEqual(Array.from(def.blocked), Array.from(explicit.blocked), 'default blocked == explicit-default blocked');
});

test('(b) a smaller inflate keeps the doorway gap cell open that the default closes', () => {
  const w = fakeWorld({ boxes: wallWithGap(3) });
  const gDef = buildNavGrid(w);                                   // inflate 1.7 → gap closes
  const gSmall = buildNavGrid(w, { cell: 2.5, inflate: 0.3 });    // inflate 0.3 → gap open
  const c = cOf(gDef, 0), r = rOf(gDef, 0);                       // cell containing (0,0)
  assert.equal(gDef.blocked[idx(gDef, c, r)], 1, 'default inflate closes the gap cell');
  assert.equal(gSmall.blocked[idx(gSmall, c, r)], 0, 'small inflate leaves the gap cell open');
});

test('(c) lineBlocked: true through a wall, false across open ground / through a gap', () => {
  const w = fakeWorld({ boxes: wallWithGap(3) });
  const gDef = buildNavGrid(w);                                   // gap closed
  const gSmall = buildNavGrid(w, { cell: 2.5, inflate: 0.3 });    // gap open
  // straight down x=0 crosses the (closed) wall row → blocked
  assert.equal(lineBlocked(gDef, 0, -5, 0, 5), true, 'line through the closed wall is blocked');
  // far from the wall → open
  assert.equal(lineBlocked(gDef, -18, -18, -18, 18), false, 'line across open ground is clear');
  // same x=0 line through the OPEN doorway gap → clear
  assert.equal(lineBlocked(gSmall, 0, -5, 0, 5), false, 'line through the open doorway is clear');
});

test('(d) slopeAware blocks steep cells; default ignores slope', () => {
  // terrain: steep (slope 1.2 rad) for x > 5, gentle elsewhere; limit 0.6 rad.
  const terrain = {
    slopeLimit: 0.6,
    terrainSlopeAt: (x, _z) => (x > 5 ? 1.2 : 0.1),
  };
  const w = fakeWorld({ HALF: 20, boxes: [], hasTerrain: true, terrain });
  const flat = buildNavGrid(w, { cell: 2.5, inflate: 1.7, slopeAware: false });
  const aware = buildNavGrid(w, { cell: 2.5, inflate: 1.7, slopeAware: true });
  const c = cOf(aware, 10), r = rOf(aware, 0);                    // cell centred near x=10 (steep)
  assert.equal(flat.blocked[idx(flat, c, r)], 0, 'slopeAware:false ignores terrain slope');
  assert.equal(aware.blocked[idx(aware, c, r)], 1, 'slopeAware:true blocks a too-steep cell');
  const cg = cOf(aware, -10), rg = rOf(aware, 0);                 // gentle side stays open
  assert.equal(aware.blocked[idx(aware, cg, rg)], 0, 'gentle cells stay walkable');
});
