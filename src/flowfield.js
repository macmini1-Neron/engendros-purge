// flowfield.js — host-computed Dijkstra flow-field over a pathing.js occupancy grid.
// Gives the HORDE (not just the boss Tolo) real navigation: every reachable cell stores a
// unit direction one step "downhill" toward the goal, so enemies route AROUND blocked
// regions and FUNNEL through doorway gaps (the only walkable cells through a wall) instead
// of beelining into it. The horde steering injects this only when the straight line to the
// target is blocked (see enemies.js), so open-ground behavior stays a smooth beeline.
//
// Pure data + math: NO `import 'three'`, NO DOM, NO RNG → node-testable. The grid `g` is
// whatever buildNavGrid(...) returns: { cell, cols, rows, originX, originZ, blocked:Uint8Array }.
// Cost is O(cells) per rebuild (Dijkstra from the goal); lookups are O(1).

// 8-dir with sqrt2 diagonals and NO diagonal corner-cut — the SAME DIRS rule as pathing.js A*.
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

const cellOf = (g, x, z) => ({
  c: Math.max(0, Math.min(g.cols - 1, Math.floor((x - g.originX) / g.cell))),
  r: Math.max(0, Math.min(g.rows - 1, Math.floor((z - g.originZ) / g.cell))),
});
const isBlocked = (g, c, r) => c < 0 || r < 0 || c >= g.cols || r >= g.rows || g.blocked[r * g.cols + c] === 1;

// Nearest free cell to (c,r) via an expanding ring — used when the goal (player) sits inside
// an inflated obstacle so its own cell reads blocked. Mirrors pathing.js nearestFree.
function nearestFree(g, c, r) {
  if (!isBlocked(g, c, r)) return { c, r };
  for (let rad = 1; rad < Math.max(g.cols, g.rows); rad++) {
    for (let dc = -rad; dc <= rad; dc++) for (let dr = -rad; dr <= rad; dr++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue; // ring only
      const nc = c + dc, nr = r + dr;
      if (!isBlocked(g, nc, nr)) return { c: nc, r: nr };
    }
  }
  return null;
}

// Minimal binary min-heap keyed by dist (grid is small; this is plenty fast).
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node, f) { const a = this.a; a.push({ node, f }); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < a.length && a[l].f < a[s].f) s = l; if (r < a.length && a[r].f < a[s].f) s = r; if (s === i) break; [a[s], a[i]] = [a[i], a[s]]; i = s; } } return top.node; }
}

// Dijkstra from the goal cell outward over !blocked cells. Returns
//   { cols, rows, cell, originX, originZ, dist, dirX, dirZ, goalX, goalZ }
// where dist[i] = cost to goal (Infinity if unreached/blocked) and (dirX,dirZ)[i] = the UNIT
// vector toward the neighbour one step closer to the goal (0,0 at the goal / unreached cells).
export function buildFlowField(g, goalX, goalZ) {
  const { cols, rows, cell, originX, originZ } = g;
  const N = cols * rows;
  const dist = new Float32Array(N).fill(Infinity);
  const dirX = new Float32Array(N);
  const dirZ = new Float32Array(N);
  const field = { cols, rows, cell, originX, originZ, dist, dirX, dirZ, goalX, goalZ };

  const gc = cellOf(g, goalX, goalZ);
  const goal = nearestFree(g, gc.c, gc.r);
  if (!goal) return field;                       // goal fully walled off → all Infinity → flowDirAt null

  const idx = (c, r) => r * cols + c;
  const from = new Int32Array(N).fill(-1);       // parent cell toward goal (shortest-path tree)
  const closed = new Uint8Array(N);
  const open = new Heap();
  const gi = idx(goal.c, goal.r);
  dist[gi] = 0; open.push(gi, 0);

  while (open.size) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cc = cur % cols, cr = (cur / cols) | 0;
    for (const [dc, dr, cost] of DIRS) {
      const nc = cc + dc, nr = cr + dr;
      if (isBlocked(g, nc, nr)) continue;
      if (dc && dr && (isBlocked(g, cc + dc, cr) || isBlocked(g, cc, cr + dr))) continue; // no corner-cut
      const ni = idx(nc, nr);
      if (closed[ni]) continue;
      const nd = dist[cur] + cost;
      if (nd < dist[ni]) { dist[ni] = nd; from[ni] = cur; open.push(ni, nd); }
    }
  }

  // Per-cell direction = unit vector toward the parent (one step closer to the goal).
  for (let i = 0; i < N; i++) {
    const p = from[i];
    if (p < 0) continue;                          // goal cell / unreached → dir stays (0,0)
    const ci = i % cols, ri = (i / cols) | 0;
    const cp = p % cols, rp = (p / cols) | 0;
    const vx = cp - ci, vz = rp - ri, len = Math.hypot(vx, vz) || 1;
    dirX[i] = vx / len; dirZ[i] = vz / len;
  }
  return field;
}

// Look up the cell for world (x,z); returns { x:dirX, z:dirZ } (unit) toward the goal,
// or null if the cell is unreached/blocked or IS the goal (caller falls back to beeline).
export function flowDirAt(field, x, z) {
  const c = Math.max(0, Math.min(field.cols - 1, Math.floor((x - field.originX) / field.cell)));
  const r = Math.max(0, Math.min(field.rows - 1, Math.floor((z - field.originZ) / field.cell)));
  const i = r * field.cols + c;
  if (!isFinite(field.dist[i])) return null;      // unreached / blocked
  const dx = field.dirX[i], dz = field.dirZ[i];
  if (dx === 0 && dz === 0) return null;          // goal cell — beeline the last step
  return { x: dx, z: dz };
}
