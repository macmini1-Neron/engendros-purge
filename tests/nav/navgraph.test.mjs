import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNavGraph, buildSurfaceFlow, surfaceDirAt } from '../../src/navgraph.js';

// mock world: boxes as [minx,miny,minz, maxx,maxy,maxz, struct?]; flat terrain (height 0).
const mkWorld = (HALF, boxes = [], opts = {}) => ({
  HALF,
  boxes: boxes.map((b) => ({ min: { x: b[0], y: b[1], z: b[2] }, max: { x: b[3], y: b[4], z: b[5] }, struct: !!b[6] })),
  terrain: { terrainHeightAt: () => 0 },
  _ladders: opts.ladders || [],
  _navLinks: opts.navLinks || [],
});
const cellOf = (g, x, z) => {
  const c = Math.max(0, Math.min(g.cols - 1, Math.floor((x - g.originX) / g.cell)));
  const r = Math.max(0, Math.min(g.rows - 1, Math.floor((z - g.originZ) / g.cell)));
  return r * g.cols + c;
};
const surfCount = (g, x, z) => { const i = cellOf(g, x, z); return g.cellStart[i + 1] - g.cellStart[i]; };

test('flat open world: one surface per cell, flow points toward the goal', () => {
  const g = buildNavGraph(mkWorld(12));
  assert.equal(g.M, g.cols * g.rows, 'one node per cell on open ground');
  assert.equal(surfCount(g, 0, 0), 1);
  const flow = buildSurfaceFlow(g, 9, 0, 0);          // goal far +X
  const sd = surfaceDirAt(flow, -9, 0, 0);            // agent far -X
  assert.ok(sd && sd.x > 0.6, `should steer +X toward goal, got ${sd && sd.x}`);
  assert.equal(sd.climb, 0, 'flat → no climb');
});

test('a raised platform is an island without a link, reachable with one', () => {
  const platform = [4, 0, -2, 8, 3, 2]; // solid block, top at y=3 (> stepUp from ground)
  // under the platform: only surface 3; outside: surface 0; Δh=3 → no walk edge between them.
  const noLink = buildNavGraph(mkWorld(12, [platform]));
  const fNo = buildSurfaceFlow(noLink, 6, 3, 0);       // player ON the platform
  assert.equal(surfaceDirAt(fNo, 2.5, 0, 0), null, 'ground is unreachable from the platform (island)');

  const withLink = buildNavGraph(mkWorld(12, [platform], { navLinks: [{ x0: 2.8, z0: 0, y0: 0, x1: 4.5, z1: 0, y1: 3 }] }));
  const fYes = buildSurfaceFlow(withLink, 6, 3, 0);
  const sd = surfaceDirAt(fYes, 2.8, 0, 0);            // agent on the ground at the link foot
  assert.ok(sd, 'ground now reaches the platform via the link');
  assert.equal(sd.climb, 1, 'the step toward the goal is the vertical link');
  assert.ok(sd.targetY > 2.5, `climb target should be the platform height, got ${sd.targetY}`);
});

test('a roof slab over open ground gives a cell TWO surfaces', () => {
  const slab = [4, 3, -2, 8, 3.4, 2]; // thin slab floating at y=3..3.4
  const g = buildNavGraph(mkWorld(12, [slab]));
  assert.equal(surfCount(g, 6, 0), 2, 'ground (0) + roof (3.4) under the slab');
});

test('a ladder zone connects ground to a roof slab above it (same XZ → two surfaces)', () => {
  const slab = [2, 3, -3, 8, 3.4, 3];                  // roof over open ground; the cell under it has surfaces 0 and 3.4
  const ladder = { minX: 4.2, maxX: 5.8, minZ: -0.8, maxZ: 0.8, bottom: -0.3, top: 3.4 };
  const g = buildNavGraph(mkWorld(12, [slab], { ladders: [ladder] }));
  const flow = buildSurfaceFlow(g, 5, 3.4, 0);          // player on the roof
  const sd = surfaceDirAt(flow, 5, 0, 0);              // ground directly under the ladder
  assert.ok(sd && sd.climb === 1, 'horde climbs the ladder up onto the roof');
  assert.ok(sd.targetY > 3, `climb target is the roof, got ${sd.targetY}`);
});

test('a solid staircase via a registered link routes bottom→top', () => {
  // 7 stacked steps along +X (top = (i+1)*0.5), plus the link world._stairs would register
  const steps = [];
  for (let i = 0; i < 7; i++) steps.push([5 + i * 0.85, 0, -2, 5 + (i + 1) * 0.85, (i + 1) * 0.5, 2]);
  const link = { x0: 4.4, z0: 0, y0: 0, x1: 11, z1: 0, y1: 3.5 }; // foot → top landing
  const g = buildNavGraph(mkWorld(14, steps, { navLinks: [link] }));
  const flow = buildSurfaceFlow(g, 12, 3.5, 0);        // player on the top landing
  const sd = surfaceDirAt(flow, 4.2, 0, 0);            // mob at the foot of the stairs
  assert.ok(sd, 'foot of the stairs reaches the top');
});

// ── Windowed nav-graph (bounds) — the map-size-independent surface graph. ─────────
// opts.bounds (world-space {minX,minZ,maxX,maxZ}) restricts the graph to a sub-window of the map,
// so M (nodes) and the build/flow cost scale with the window (player + structure), NOT the whole
// map. On the 1000m steppe the full graph is ~445k nodes (an ~80ms surface-flow freeze every
// 0.3s when elevated); windowed it is a few k. Node coords stay absolute → surfaceDirAt unchanged.

test('(w1) bounds → graph spans only the window (M = window cells on flat ground)', () => {
  const g = buildNavGraph(mkWorld(20, []), { bounds: { minX: -6, minZ: -6, maxX: 5.999, maxZ: 5.999 } });
  assert.equal(g.M, g.cols * g.rows, 'flat → one node per window cell');
  assert.ok(g.cols < Math.ceil(40 / g.cell), `window cols (${g.cols}) must be smaller than the full grid`);
  assert.ok(g.cols * g.rows < 200, `window must be small, got ${g.cols * g.rows} cells`);
});

test('(w2) a box fully OUTSIDE the window is ignored (no phantom edge surface)', () => {
  const farSlab = [40, 3, 40, 46, 3.4, 46];            // slab well outside a window around the origin
  const g = buildNavGraph(mkWorld(60, [farSlab]), { bounds: { minX: -9, minZ: -9, maxX: 8.999, maxZ: 8.999 } });
  assert.equal(g.M, g.cols * g.rows, 'far box must not bucket onto the window edge (M stays one-per-cell)');
});

test('(w3) inside the window, a linked platform still routes bottom→top (routing preserved)', () => {
  const platform = [4, 0, -2, 8, 3, 2];
  const opts = { navLinks: [{ x0: 2.8, z0: 0, y0: 0, x1: 4.5, z1: 0, y1: 3 }] };
  // window comfortably contains the platform + link + both probe points
  const g = buildNavGraph(mkWorld(30, [platform], opts), { bounds: { minX: -6, minZ: -8, maxX: 11.999, maxZ: 7.999 } });
  const flow = buildSurfaceFlow(g, 6, 3, 0);           // player ON the platform
  const sd = surfaceDirAt(flow, 2.8, 0, 0);            // mob on the ground at the link foot
  assert.ok(sd, 'ground reaches the platform via the link inside the window');
  assert.equal(sd.climb, 1, 'the step toward the goal is the vertical link');
  assert.ok(sd.targetY > 2.5, `climb target should be the platform height, got ${sd.targetY}`);
});
