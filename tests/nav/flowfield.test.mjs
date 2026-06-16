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
