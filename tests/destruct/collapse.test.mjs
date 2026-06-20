import test from 'node:test';
import assert from 'node:assert/strict';
import { orphanedCells } from '../../src/destruct.js';

// Build a w×h cell grid (one isolated wall segment): bottom row grounded, 4-neighbour adjacency.
function grid(w, h) {
  const cells = [];
  const id = (i, j) => `c${i}_${j}`;
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++)
    cells.push({ dpart: id(i, j), dead: false, grounded: j === 0, adj: [] });
  const byId = new Map(cells.map((c) => [c.dpart, c]));
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
    const c = byId.get(id(i, j));
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = byId.get(id(i + di, j + dj)); if (n) c.adj.push(n.dpart);
    }
  }
  return { cells, byId, id };
}
const kill = (g, ...ids) => ids.forEach((k) => (g.byId.get(k).dead = true));

test('orphanedCells: an intact wall has no orphans', () => {
  assert.deepEqual(orphanedCells(grid(3, 4).cells), []);
});

test('orphanedCells: knocking out ONE base cell does not collapse — lateral arching', () => {
  const g = grid(3, 4);
  kill(g, g.id(1, 0));                                  // middle base cell only
  assert.deepEqual(orphanedCells(g.cells), []);         // cols 0/2 still ground the rows above laterally
});

test('orphanedCells: removing the ENTIRE base row orphans everything above it', () => {
  const g = grid(3, 4);
  kill(g, g.id(0, 0), g.id(1, 0), g.id(2, 0));
  assert.equal(orphanedCells(g.cells).length, 9);       // the 9 live cells in rows 1..3 all cave
});

test('orphanedCells: a whole middle column removed — the two outer columns stay (independently grounded)', () => {
  const g = grid(3, 4);
  kill(g, g.id(1, 0), g.id(1, 1), g.id(1, 2), g.id(1, 3));
  assert.deepEqual(orphanedCells(g.cells), []);
});

test('orphanedCells: grounded cells are never orphans; dead cells are excluded', () => {
  const g = grid(2, 2);
  kill(g, g.id(0, 1));                                   // kill one upper cell
  const orphans = orphanedCells(g.cells);
  assert.ok(!orphans.includes(g.id(0, 0)) && !orphans.includes(g.id(1, 0)), 'base row never orphans');
  assert.ok(!orphans.includes(g.id(0, 1)), 'a dead cell is not reported');
});

test('orphanedCells: a floating overhang cut off from the ground drops', () => {
  // 3 wide × 3 tall; remove the whole base row → the 6 cells above have no ground path
  const g = grid(3, 3);
  kill(g, g.id(0, 0), g.id(1, 0), g.id(2, 0));
  assert.equal(orphanedCells(g.cells).length, 6);
});
