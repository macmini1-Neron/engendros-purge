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

// Nearest free cell to window-local (c,r) via an expanding ring — used when the goal (player)
// sits inside an inflated obstacle so its own cell reads blocked. `blockedW` is window-local
// (out-of-window reads as a wall). Mirrors pathing.js nearestFree.
function nearestFree(blockedW, cols, rows, c, r) {
  if (!blockedW(c, r)) return { c, r };
  for (let rad = 1; rad < Math.max(cols, rows); rad++) {
    for (let dc = -rad; dc <= rad; dc++) for (let dr = -rad; dr <= rad; dr++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue; // ring only
      const nc = c + dc, nr = r + dr;
      if (!blockedW(nc, nr)) return { c: nc, r: nr };
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
//
// `bounds` (optional, world-space { minX, minZ, maxX, maxZ }) restricts the rebuild to a SUB-WINDOW
// of the grid: the returned field describes only that window (its own cols/rows/origin), and the
// Dijkstra + allocations are O(window cells), NOT O(map cells). The horde always clusters on the
// player, so the goal+horde window is tiny vs a large open map — this makes the rebuild cost
// independent of map size (the steppe-stutter fix). Out-of-window cells read as walls (the walk
// stops at the window edge); flowDirAt returns null outside the window → the caller beelines.
// Omit `bounds` for the legacy whole-grid field (unchanged behaviour, e.g. the small arena).
export function buildFlowField(g, goalX, goalZ, bounds) {
  const cell = g.cell;
  // Window cell range in FULL-grid coords (default = whole grid → byte-identical to the old path).
  let wc0 = 0, wr0 = 0, cols = g.cols, rows = g.rows;
  if (bounds) {
    const cl = (v) => Math.max(0, Math.min(g.cols - 1, Math.floor((v - g.originX) / cell)));
    const rl = (v) => Math.max(0, Math.min(g.rows - 1, Math.floor((v - g.originZ) / cell)));
    const c0 = cl(bounds.minX), c1 = cl(bounds.maxX), r0 = rl(bounds.minZ), r1 = rl(bounds.maxZ);
    wc0 = c0; wr0 = r0; cols = c1 - c0 + 1; rows = r1 - r0 + 1;
  }
  const originX = g.originX + wc0 * cell, originZ = g.originZ + wr0 * cell; // window origin
  const N = cols * rows;
  const dist = new Float32Array(N).fill(Infinity);
  const dirX = new Float32Array(N);
  const dirZ = new Float32Array(N);
  const field = { cols, rows, cell, originX, originZ, dist, dirX, dirZ, goalX, goalZ };

  // Window-local occupancy → maps to the full grid; out-of-window = wall (bounds the Dijkstra walk).
  const blockedW = (c, r) => c < 0 || r < 0 || c >= cols || r >= rows || g.blocked[(wr0 + r) * g.cols + (wc0 + c)] === 1;

  const gc = Math.max(0, Math.min(cols - 1, Math.floor((goalX - originX) / cell)));
  const gr = Math.max(0, Math.min(rows - 1, Math.floor((goalZ - originZ) / cell)));
  const goal = nearestFree(blockedW, cols, rows, gc, gr);
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
      if (blockedW(nc, nr)) continue;
      if (dc && dr && (blockedW(cc + dc, cr) || blockedW(cc, cr + dr))) continue; // no corner-cut
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

// Look up the cell for world (x,z); returns { x:dirX, z:dirZ } (unit) toward the goal, or null if
// the cell is OUTSIDE the (possibly windowed) field, unreached/blocked, or IS the goal — in every
// null case the caller falls back to a straight beeline.
export function flowDirAt(field, x, z) {
  const c = Math.floor((x - field.originX) / field.cell);
  const r = Math.floor((z - field.originZ) / field.cell);
  if (c < 0 || r < 0 || c >= field.cols || r >= field.rows) return null; // outside the window → beeline
  const i = r * field.cols + c;
  if (!isFinite(field.dist[i])) return null;      // unreached / blocked
  const dx = field.dirX[i], dz = field.dirZ[i];
  if (dx === 0 && dz === 0) return null;          // goal cell — beeline the last step
  return { x: dx, z: dz };
}
