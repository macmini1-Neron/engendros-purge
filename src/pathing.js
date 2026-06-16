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

// Build an occupancy grid from the STATIC arena geometry.
//  - skip ground-detail tiles (max.y < 0.6, same threshold as enemy avoidance)
//  - skip player-built structures (b.struct) — the boss crushes those, so they
//    must NOT block its path (it would refuse to path through a wall it'll smash)
//  - tank wrecks and arena walls/buildings DO block
//
// opts (all optional, BACKWARD-COMPATIBLE — the boss call `buildNavGrid(world)` keeps
// the old boss-tuned grid byte-for-byte):
//   cell       metres per cell                 (default CELL = 2.5)
//   inflate    obstacle padding ≈ agent radius (default INFLATE = 1.7 ≈ boss radius)
//   slopeAware ALSO block cells whose terrain is steeper than world.terrain.slopeLimit
//              (default false). The grid-level analogue of the per-step horde slope
//              backstop in enemies.js — keeps the horde off cliffs. Sampled at cell centre.
export function buildNavGrid(world, opts = {}) {
  const cell = opts.cell != null ? opts.cell : CELL;
  const inflate = opts.inflate != null ? opts.inflate : INFLATE;
  const slopeAware = !!opts.slopeAware;
  const half = world.HALF;
  const span = half * 2;
  const cols = Math.ceil(span / cell), rows = Math.ceil(span / cell);
  const originX = -half, originZ = -half;
  const blocked = new Uint8Array(cols * rows);
  const cClamp = (v) => Math.max(0, Math.min(cols - 1, v));
  const rClamp = (v) => Math.max(0, Math.min(rows - 1, v));
  for (const b of world.boxes) {
    if (b.max.y < 0.6 || b.struct) continue;                 // ground detail / crushable player wall
    const c0 = cClamp(Math.floor((b.min.x - inflate - originX) / cell));
    const c1 = cClamp(Math.floor((b.max.x + inflate - originX) / cell));
    const r0 = rClamp(Math.floor((b.min.z - inflate - originZ) / cell));
    const r1 = rClamp(Math.floor((b.max.z + inflate - originZ) / cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) blocked[r * cols + c] = 1;
  }
  if (slopeAware && world.hasTerrain && world.terrain) {       // block too-steep terrain cells
    const terr = world.terrain;
    const lim = terr.slopeLimit != null ? terr.slopeLimit : (Math.PI * 35) / 180;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (blocked[i]) continue;
      const x = originX + (c + 0.5) * cell, z = originZ + (r + 0.5) * cell;
      if (terr.terrainSlopeAt(x, z) > lim) blocked[i] = 1;
    }
  }
  return { cell, cols, rows, originX, originZ, blocked };
}

// Grid DDA (Amanatides–Woo voxel traversal) from world (x0,z0)→(x1,z1): true if any cell
// the segment crosses is blocked. Used by the horde to gate flow-field use — only override
// the beeline when the straight line to the target actually hits an obstacle. O(cells crossed).
export function lineBlocked(g, x0, z0, x1, z1) {
  const cell = g.cell;
  let c = Math.floor((x0 - g.originX) / cell);
  let r = Math.floor((z0 - g.originZ) / cell);
  const ec = Math.floor((x1 - g.originX) / cell);
  const er = Math.floor((z1 - g.originZ) / cell);
  if (isBlocked(g, c, r)) return true;
  const dx = x1 - x0, dz = z1 - z0;
  const stepC = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
  const stepR = dz > 0 ? 1 : (dz < 0 ? -1 : 0);
  const tDeltaC = dx !== 0 ? Math.abs(cell / dx) : Infinity;
  const tDeltaR = dz !== 0 ? Math.abs(cell / dz) : Infinity;
  let tMaxC = dx !== 0 ? (g.originX + (c + (stepC > 0 ? 1 : 0)) * cell - x0) / dx : Infinity;
  let tMaxR = dz !== 0 ? (g.originZ + (r + (stepR > 0 ? 1 : 0)) * cell - z0) / dz : Infinity;
  let guard = g.cols + g.rows + 4;                             // bound the walk (no infinite loop)
  while ((c !== ec || r !== er) && guard-- > 0) {
    if (tMaxC < tMaxR) { c += stepC; tMaxC += tDeltaC; }
    else { r += stepR; tMaxR += tDeltaR; }
    if (isBlocked(g, c, r)) return true;
  }
  return false;
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
