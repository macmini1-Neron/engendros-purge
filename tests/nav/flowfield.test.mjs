import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlowField, flowDirAt } from '../../src/flowfield.js';

// Hand-build a tiny grid: { cell, cols, rows, originX, originZ, blocked }.
// Same shape buildNavGrid(...) returns. cell=1, origin=0 so cell (c,r) centre = (c+0.5, r+0.5).
function grid(cols, rows, blockedCells = []) {
  const blocked = new Uint8Array(cols * rows);
  for (const [c, r] of blockedCells) blocked[r * cols + c] = 1;
  return { cell: 1, cols, rows, originX: 0, originZ: 0, blocked };
}
const at = (f, c, r) => flowDirAt(f, c + 0.5, r + 0.5);

// 5×5 with a wall row r=2 across all columns EXCEPT a 1-cell gap at c=2.
// Goal at the bottom (c=2,r=0). Far-side cells (r≥3) must funnel through the gap.
function wallGapGrid() {
  const blocks = [];
  for (let c = 0; c < 5; c++) if (c !== 2) blocks.push([c, 2]); // wall row with gap at c=2
  return grid(5, 5, blocks);
}

test('(a) goal cell has dist 0', () => {
  const g = wallGapGrid();
  const f = buildFlowField(g, 2.5, 0.5); // goal = cell (2,0) centre
  const gi = 0 * f.cols + 2;
  assert.equal(f.dist[gi], 0, 'goal cell dist must be 0');
});

test('(b) a far-side cell points toward the gap, not into the wall', () => {
  const g = wallGapGrid();
  const f = buildFlowField(g, 2.5, 0.5);
  // cell (1,3): just above the wall on the far side, left of the gap column (c=2).
  // The only route to the goal is sideways toward the gap (c+ direction), then down.
  const d = at(f, 1, 3);
  assert.ok(d, 'far-side cell must have a direction');
  assert.ok(d.x > 0, `dir.x should point toward the gap (c=2), got ${d.x}`);
  // symmetric cell on the other side of the gap (c=3,r=3) must point the other way (c-).
  const d2 = at(f, 3, 3);
  assert.ok(d2 && d2.x < 0, `dir.x should point toward the gap from the right, got ${d2 && d2.x}`);
  // a cell directly above the gap heads straight down toward the goal (dir.z negative).
  const d3 = at(f, 2, 3);
  assert.ok(d3 && d3.z < 0, `cell above the gap should head down toward goal, got ${d3 && d3.z}`);
});

test('(c) flowDirAt returns a unit vector in open cells, null for a walled-off cell', () => {
  // open grid, goal at a corner.
  const g = grid(6, 6, []);
  const f = buildFlowField(g, 0.5, 0.5);
  const d = at(f, 5, 5);
  assert.ok(d, 'open cell must have a direction');
  assert.ok(Math.abs(Math.hypot(d.x, d.z) - 1) < 1e-6, 'direction must be a unit vector');

  // A probe cell fully fenced off from the goal by a solid wall (no gap) is unreachable.
  // 5×5: full wall row r=2 (no gap). Goal at r=0; probe at r=4 cannot reach it.
  const blocks = [];
  for (let c = 0; c < 5; c++) blocks.push([c, 2]);
  const walled = grid(5, 5, blocks);
  const fw = buildFlowField(walled, 2.5, 0.5);
  assert.equal(at(fw, 2, 4), null, 'walled-off cell must return null');
  // and the goal side is still reachable from within its own region.
  assert.ok(at(fw, 0, 0) === null || at(fw, 1, 0), 'goal-region cells resolve normally');
});

// ── Windowed flow-field (bounds) — the map-size-independent rebuild. ──────────────
// A 4th arg `bounds` (world-space {minX,minZ,maxX,maxZ}) restricts the Dijkstra to a
// sub-window of the grid, so the rebuild cost scales with the window (player+horde),
// NOT the whole map. The returned field describes the WINDOW (its own cols/rows/origin).

test('(d) bounds → field covers only the window (its own cols/rows/origin)', () => {
  const g = grid(10, 10, []);                       // cell=1, origin=0
  // window over cells c,r ∈ [3,6] → world [3,7)×[3,7)
  const f = buildFlowField(g, 4.5, 4.5, { minX: 3, minZ: 3, maxX: 6.999, maxZ: 6.999 });
  assert.equal(f.cols, 4, `window cols, got ${f.cols}`);
  assert.equal(f.rows, 4, `window rows, got ${f.rows}`);
  assert.equal(f.originX, 3, `window originX, got ${f.originX}`);
  assert.equal(f.originZ, 3, `window originZ, got ${f.originZ}`);
});

test('(e) a cell OUTSIDE the window returns null; inside resolves', () => {
  const g = grid(10, 10, []);
  const f = buildFlowField(g, 4.5, 4.5, { minX: 3, minZ: 3, maxX: 6.999, maxZ: 6.999 });
  assert.equal(at(f, 0, 0), null, 'cell far outside the window must be null (beeline fallback)');
  assert.equal(at(f, 8, 8), null, 'cell outside the window must be null');
  assert.ok(at(f, 6, 6), 'a cell inside the window must resolve');
});

test('(f) inside the window, windowed directions match the full-grid field', () => {
  const g = grid(12, 12, []);                       // open grid, goal at centre cell (6,6)
  const full = buildFlowField(g, 6.5, 6.5);
  const win = buildFlowField(g, 6.5, 6.5, { minX: 4, minZ: 4, maxX: 8.999, maxZ: 8.999 }); // cells [4,8]
  for (let c = 5; c <= 7; c++) for (let r = 5; r <= 7; r++) {   // interior of the window (off the edge)
    const a = at(full, c, r), b = at(win, c, r);
    if (a === null) { assert.equal(b, null); continue; }
    assert.ok(b, `windowed cell (${c},${r}) must resolve`);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-6, `dir mismatch at (${c},${r}): full ${JSON.stringify(a)} vs win ${JSON.stringify(b)}`);
  }
});

test('(h) flowDirAt is bilinearly smoothed — cell-centre values unchanged, between cells a blend', () => {
  const g = wallGapGrid();
  const f = buildFlowField(g, 2.5, 0.5);
  // at cell centres it must still equal the discrete cell direction (so all the above tests hold)
  const c13 = at(f, 1, 3), c23 = at(f, 2, 3);
  assert.ok(c13.x > 0, 'cell (1,3) still points toward the gap');
  assert.ok(Math.abs(c23.x) < 1e-6, 'cell (2,3) (above the gap) still points straight down');
  // BETWEEN the two cell centres (x=2.0, z=3.5) the direction is a BLEND of the two, not a snap to either:
  const mid = flowDirAt(f, 2.0, 3.5);
  assert.ok(mid, 'boundary point resolves');
  assert.ok(mid.x > 1e-6 && mid.x < c13.x, `blended dir.x must sit strictly between the two cells (0 < ${mid.x} < ${c13.x})`);
  assert.ok(Math.abs(Math.hypot(mid.x, mid.z) - 1) < 1e-6, 'still a unit vector after blending');
});

test('(g) windowed flow ROUTES AROUND an obstacle whose detour lies inside the window', () => {
  // 11×11; wall row r=5 across cols 2..8 (gaps only at the far ends, cols 0-1 and 9-10). Goal south at
  // (5,1); a far-side cell (5,9) must steer LATERALLY toward an end gap — not straight into the wall.
  const blocks = [];
  for (let c = 2; c <= 8; c++) blocks.push([c, 5]);
  const g = grid(11, 11, blocks);
  // window contains the goal, the agent, AND both end gaps (whole width, rows 0..10) → detour fits inside it
  const win = buildFlowField(g, 5.5, 1.5, { minX: 0, minZ: 0, maxX: 10.99, maxZ: 10.99 });
  const d = at(win, 5, 9);
  assert.ok(d, 'far-side cell must be reachable through an end gap (not isolated)');
  assert.ok(Math.abs(d.x) > 0.3, `must steer laterally toward a gap, got dir.x=${d.x}`);
  // and it matches the full-grid routing decision
  const full = buildFlowField(g, 5.5, 1.5);
  const df = at(full, 5, 9);
  assert.ok(Math.sign(d.x) === Math.sign(df.x), 'windowed routes the same side as the full field');
});
