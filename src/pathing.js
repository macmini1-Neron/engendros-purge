// pathing.js — coarse grid A* navigation, used by ONE entity: the boss Tolo.
// The game has no navmesh; the horde runs on local steering (separation +
// obstacle avoidance + a stuck-buster). That's fine for small mobs but a giant
// boss gets wedged in corners of the static arena. Since it's a single entity,
// we can afford a real pathfinder: rasterize the static arena AABBs into an
// occupancy grid once, then A* a route to the player and steer along it.
//
// Pure data + math (no THREE): a "box" only needs { min:{x,z}, max:{x,y,z} }.
// World coords map to grid cells via a fixed cell size; cells are world-XZ.

const CELL = 2.5;          // metres per cell (arena is 140 wide → ~56×56 grid)
const INFLATE = 1.7;       // obstacle padding ≈ boss radius (0.55×2.85 ≈ 1.57), so paths keep clearance

// Build the occupancy grid once from the STATIC arena geometry.
//  - skip ground-detail tiles (max.y < 0.6, same threshold as enemy avoidance)
//  - skip player-built structures (b.struct) — the boss crushes those, so they
//    must NOT block its path (it would refuse to path through a wall it'll smash)
//  - tank wrecks and arena walls/buildings DO block
export function buildNavGrid(world) {
  const half = world.HALF;
  const span = half * 2;
  const cols = Math.ceil(span / CELL), rows = Math.ceil(span / CELL);
  const originX = -half, originZ = -half;
  const blocked = new Uint8Array(cols * rows);
  const cClamp = (v) => Math.max(0, Math.min(cols - 1, v));
  const rClamp = (v) => Math.max(0, Math.min(rows - 1, v));
  for (const b of world.boxes) {
    if (b.max.y < 0.6 || b.struct) continue;                 // ground detail / crushable player wall
    const c0 = cClamp(Math.floor((b.min.x - INFLATE - originX) / CELL));
    const c1 = cClamp(Math.floor((b.max.x + INFLATE - originX) / CELL));
    const r0 = rClamp(Math.floor((b.min.z - INFLATE - originZ) / CELL));
    const r1 = rClamp(Math.floor((b.max.z + INFLATE - originZ) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) blocked[r * cols + c] = 1;
  }
  return { cell: CELL, cols, rows, originX, originZ, blocked };
}

const cellOf = (g, x, z) => ({
  c: Math.max(0, Math.min(g.cols - 1, Math.floor((x - g.originX) / g.cell))),
  r: Math.max(0, Math.min(g.rows - 1, Math.floor((z - g.originZ) / g.cell))),
});
const isBlocked = (g, c, r) => c < 0 || r < 0 || c >= g.cols || r >= g.rows || g.blocked[r * g.cols + c] === 1;
const centre = (g, c, r) => ({ x: g.originX + (c + 0.5) * g.cell, z: g.originZ + (r + 0.5) * g.cell });

// Nearest free cell to (c,r) via an expanding ring search — used when the boss
// or the player sits inside an inflated obstacle so its own cell reads blocked.
function nearestFree(g, c, r) {
  if (!isBlocked(g, c, r)) return { c, r };
  for (let rad = 1; rad < Math.max(g.cols, g.rows); rad++) {
    for (let dc = -rad; dc <= rad; dc++) for (let dr = -rad; dr <= rad; dr++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;   // ring only
      const nc = c + dc, nr = r + dr;
      if (!isBlocked(g, nc, nr)) return { c: nc, r: nr };
    }
  }
  return null;
}

// Minimal binary min-heap keyed by f-score (grid is small; this is plenty fast).
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node, f) { const a = this.a; a.push({ node, f }); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < a.length && a[l].f < a[s].f) s = l; if (r < a.length && a[r].f < a[s].f) s = r; if (s === i) break; [a[s], a[i]] = [a[i], a[s]]; i = s; } } return top.node; }
}

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

// A* from (sx,sz) to (tx,tz) in world space. Returns an array of { x, z }
// waypoints (cell centres, collinear runs merged) or null if unreachable.
export function findPath(g, sx, sz, tx, tz) {
  const startCR = cellOf(g, sx, sz), goalCR = cellOf(g, tx, tz);
  const start = nearestFree(g, startCR.c, startCR.r);
  const goal = nearestFree(g, goalCR.c, goalCR.r);
  if (!start || !goal) return null;
  if (start.c === goal.c && start.r === goal.r) return null;       // same cell → caller beelines

  const N = g.cols * g.rows;
  const gScore = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const idx = (c, r) => r * g.cols + c;
  const h = (c, r) => Math.hypot(c - goal.c, r - goal.r);

  const open = new Heap();
  const si = idx(start.c, start.r);
  gScore[si] = 0; open.push(si, h(start.c, start.r));
  const gi = idx(goal.c, goal.r);

  while (open.size) {
    const cur = open.pop();
    if (cur === gi) return reconstruct(g, came, cur);
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cc = cur % g.cols, cr = (cur / g.cols) | 0;
    for (const [dc, dr, cost] of DIRS) {
      const nc = cc + dc, nr = cr + dr;
      if (isBlocked(g, nc, nr)) continue;
      if (dc && dr && (isBlocked(g, cc + dc, cr) || isBlocked(g, cc, cr + dr))) continue; // no diagonal corner-cut
      const ni = idx(nc, nr);
      if (closed[ni]) continue;
      const ng = gScore[cur] + cost;
      if (ng < gScore[ni]) { gScore[ni] = ng; came[ni] = cur; open.push(ni, ng + h(nc, nr)); }
    }
  }
  return null;
}

function reconstruct(g, came, end) {
  const cells = [];
  for (let i = end; i !== -1; i = came[i]) cells.push(i);
  cells.reverse();
  // Drop the start cell, then merge collinear runs so steering gets corners only.
  const pts = cells.map((i) => centre(g, i % g.cols, (i / g.cols) | 0));
  if (pts.length <= 1) return null;
  const out = [];
  for (let k = 1; k < pts.length; k++) {
    const prev = out[out.length - 1] || pts[0], p = pts[k], nx = pts[k + 1];
    if (nx) {
      const d1x = p.x - prev.x, d1z = p.z - prev.z, d2x = nx.x - p.x, d2z = nx.z - p.z;
      if (Math.abs(d1x * d2z - d1z * d2x) < 1e-3) continue;        // collinear → skip the midpoint
    }
    out.push(p);
  }
  return out.length ? out : null;
}
