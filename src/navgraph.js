// navgraph.js — PURE (no THREE/DOM/RNG → node-testable, worker-importable) LAYERED surface
// navigation. Generalises pathing.js's single-layer occupancy grid to MULTIPLE walkable
// surfaces per XZ cell (terrain + box tops that have head clearance), connected by WALK edges
// (height gap ≤ stepUp, with a clear opening) and explicit vertical LINKS (stairs registered
// by world._stairs into world._navLinks; ladders in world._ladders). A surface flow-field then
// routes the horde to the player's ACTUAL level — up stairs / ladders to a roof or upper floor.
//
// A node is one (cell, surface-height). Open ground = 1 node/cell, so away from structures this
// degrades to the old flat grid. Heavy state is typed arrays (worker-transfer friendly). stepUp
// is passed in (NOT imported from tuning.js, which pulls THREE) — keep it === tuning.STEP_UP.

const DEF = { cell: 1.5, stepUp: 0.62, head: 1.6, mergeH: 0.35 };

// 8-dir neighbours, no diagonal corner-cut — same rule as pathing.js / flowfield.js.
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Minimal binary min-heap keyed by dist (small graph; plenty fast). Mirrors flowfield.js.
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node, f) { const a = this.a; a.push({ node, f }); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break;[a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (; ;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < a.length && a[l].f < a[s].f) s = l; if (r < a.length && a[r].f < a[s].f) s = r; if (s === i) break;[a[s], a[i]] = [a[i], a[s]]; i = s; } } return top.node; }
}

// Build the layered surface graph from the world (boxes + terrain + ladder/stair links).
export function buildNavGraph(world, opts = {}) {
  const o = { ...DEF, ...opts };
  const { cell, stepUp, head, mergeH } = o;
  const half = world.HALF;
  const cols = Math.ceil((half * 2) / cell), rows = cols;
  const originX = -half, originZ = -half;
  const N = cols * rows;
  const terr = world.terrain || null;
  const cc = (v) => (v < 0 ? 0 : v >= cols ? cols - 1 : v);
  const rc = (v) => (v < 0 ? 0 : v >= rows ? rows - 1 : v);
  const cellOf = (x, z) => rc(Math.floor((z - originZ) / cell)) * cols + cc(Math.floor((x - originX) / cell));

  // 1) bucket non-struct, non-trivial boxes into the cells their footprint covers
  const boxesAt = new Array(N);
  for (const b of world.boxes) {
    if (b.struct) continue;
    const c0 = cc(Math.floor((b.min.x - originX) / cell)), c1 = cc(Math.floor((b.max.x - originX) / cell));
    const r0 = rc(Math.floor((b.min.z - originZ) / cell)), r1 = rc(Math.floor((b.max.z - originZ) / cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const i = r * cols + c; (boxesAt[i] || (boxesAt[i] = [])).push(b); }
  }

  // Is the body column (H, H+head) in this cell free of box bodies? (a box whose top===H is the floor,
  // and a box rising from at/below H is a wall/riser — neither counts as a low ceiling.)
  const clearAt = (bx, H) => {
    if (!bx) return true;
    for (const b of bx) { if (b.min.y < H + head - 1e-3 && b.max.y > H + 0.05) return false; }
    return true;
  };

  // 2) surfaces per cell: terrain (if clear) + each box top (if clear), merged within mergeH
  const surfH = [], surfCell = [], cellStart = new Int32Array(N + 1);
  for (let i = 0; i < N; i++) {
    cellStart[i] = surfH.length;
    const c = i % cols, r = (i / cols) | 0;
    const x = originX + (c + 0.5) * cell, z = originZ + (r + 0.5) * cell;
    const bx = boxesAt[i];
    const cand = [];
    const ty = terr ? terr.terrainHeightAt(x, z) : 0;
    if (clearAt(bx, ty)) cand.push(ty);
    if (bx) for (const b of bx) { const t = b.max.y; if (t > ty + 0.05 && clearAt(bx, t)) cand.push(t); }
    cand.sort((a, b) => a - b);
    let last = -1e9;
    for (const h of cand) if (h - last > mergeH) { surfH.push(h); surfCell.push(i); last = h; }
  }
  cellStart[N] = surfH.length;
  const M = surfH.length;
  const nodeY = Float32Array.from(surfH), nodeCell = Int32Array.from(surfCell);

  const nodeAt = (i, h) => { let best = -1, bd = 1e9; for (let n = cellStart[i]; n < cellStart[i + 1]; n++) { const d = Math.abs(nodeY[n] - h); if (d < bd) { bd = d; best = n; } } return best; };

  // 3) walk edges: adjacent-cell surfaces within stepUp + a clear opening at the higher lip
  const adj = Array.from({ length: M }, () => []);
  for (let n = 0; n < M; n++) {
    const i = nodeCell[n], c = i % cols, r = (i / cols) | 0, h = nodeY[n];
    for (const [dc, dr] of NB) {
      const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const j = nr * cols + nc;
      for (let m = cellStart[j]; m < cellStart[j + 1]; m++) {
        const h2 = nodeY[m]; if (Math.abs(h2 - h) > stepUp) continue;
        const hi = h > h2 ? h : h2;
        if (!clearAt(boxesAt[i], hi) || !clearAt(boxesAt[j], hi)) continue;
        if (dc && dr) { const oi = r * cols + (c + dc), oj = (r + dr) * cols + c; if (!clearAt(boxesAt[oi], hi) || !clearAt(boxesAt[oj], hi)) continue; } // no corner-cut
        adj[n].push({ to: m, link: 0 });
      }
    }
  }

  // 4) explicit vertical links — ladders + registered stairs (robust to cell granularity)
  const addLink = (ax, az, ay, bx, bz, by) => {
    const na = nodeAt(cellOf(ax, az), ay), nb = nodeAt(cellOf(bx, bz), by);
    if (na >= 0 && nb >= 0 && na !== nb) { adj[na].push({ to: nb, link: 1 }); adj[nb].push({ to: na, link: 1 }); }
  };
  for (const z of (world._ladders || [])) { const mx = (z.minX + z.maxX) / 2, mz = (z.minZ + z.maxZ) / 2; addLink(mx, mz, z.bottom + 0.3, mx, mz, z.top - 0.4); }
  for (const l of (world._navLinks || [])) addLink(l.x0, l.z0, l.y0, l.x1, l.z1, l.y1);

  // pack adjacency → CSR
  let E = 0; for (const a of adj) E += a.length;
  const adjStart = new Int32Array(M + 1), adjTo = new Int32Array(E), adjLink = new Uint8Array(E);
  let e = 0; for (let n = 0; n < M; n++) { adjStart[n] = e; for (const a of adj[n]) { adjTo[e] = a.to; adjLink[e] = a.link; e++; } } adjStart[M] = E;

  return { cols, rows, cell, originX, originZ, M, nodeY, nodeCell, cellStart, adjStart, adjTo, adjLink };
}

// Dijkstra from the player's surface node outward → per-node unit XZ direction toward the goal,
// a `climb` flag (the step toward goal is a vertical link), and the parent surface height.
export function buildSurfaceFlow(g, goalX, goalY, goalZ) {
  const { M, cols, rows, cell, originX, originZ, nodeCell, nodeY, cellStart, adjStart, adjTo, adjLink } = g;
  const dist = new Float32Array(M).fill(Infinity);
  const dirX = new Float32Array(M), dirZ = new Float32Array(M), climb = new Uint8Array(M);
  const parentX = new Float32Array(M), parentZ = new Float32Array(M), parentY = new Float32Array(M);
  const flow = { cols, rows, cell, originX, originZ, M, nodeCell, nodeY, cellStart, dist, dirX, dirZ, climb, parentX, parentZ, parentY, goalX, goalY, goalZ };

  const cc = (v) => (v < 0 ? 0 : v >= cols ? cols - 1 : v), rc = (v) => (v < 0 ? 0 : v >= rows ? rows - 1 : v);
  const gi = rc(Math.floor((goalZ - originZ) / cell)) * cols + cc(Math.floor((goalX - originX) / cell));
  let goal = -1, bd = 1e9;
  for (let n = cellStart[gi]; n < cellStart[gi + 1]; n++) { const d = Math.abs(nodeY[n] - goalY); if (d < bd) { bd = d; goal = n; } }
  if (goal < 0) return flow; // player not on any surface (shouldn't happen) → all Infinity

  const from = new Int32Array(M).fill(-1), fromLink = new Uint8Array(M), closed = new Uint8Array(M);
  const heap = new Heap();
  dist[goal] = 0; heap.push(goal, 0);
  while (heap.size) {
    const cur = heap.pop(); if (closed[cur]) continue; closed[cur] = 1;
    for (let e = adjStart[cur]; e < adjStart[cur + 1]; e++) {
      const nb = adjTo[e]; if (closed[nb]) continue;
      const nd = dist[cur] + (adjLink[e] ? 1.4 : 1); // links cost a touch more → prefer walking when possible
      if (nd < dist[nb]) { dist[nb] = nd; from[nb] = cur; fromLink[nb] = adjLink[e]; heap.push(nb, nd); }
    }
  }
  for (let n = 0; n < M; n++) {
    const p = from[n]; if (p < 0) continue;
    climb[n] = fromLink[n]; parentY[n] = nodeY[p];
    const ci = nodeCell[n] % cols, ri = (nodeCell[n] / cols) | 0, cp = nodeCell[p] % cols, rp = (nodeCell[p] / cols) | 0;
    parentX[n] = originX + (cp + 0.5) * cell; parentZ[n] = originZ + (rp + 0.5) * cell; // the next node's world XZ (link-traverse target)
    const vx = cp - ci, vz = rp - ri, len = Math.hypot(vx, vz) || 1;
    dirX[n] = vx / len; dirZ[n] = vz / len;
  }
  return flow;
}

// For an agent at world (x,y,z): the surface node in its cell nearest its feet, then the steering
// toward the goal: { x, z } unit dir, `climb` (next step is a ladder/stair up-link), `targetY` (the
// parent surface height — the height to ascend toward). null if unreached, or the goal cell on a flat
// approach (caller beelines the last step).
export function surfaceDirAt(flow, x, y, z) {
  const { cols, rows, cell, originX, originZ, cellStart, nodeY, dist, dirX, dirZ, climb, parentX, parentZ, parentY } = flow;
  const c = Math.max(0, Math.min(cols - 1, Math.floor((x - originX) / cell)));
  const r = Math.max(0, Math.min(rows - 1, Math.floor((z - originZ) / cell)));
  const i = r * cols + c;
  let n = -1, bd = 1e9;
  for (let k = cellStart[i]; k < cellStart[i + 1]; k++) { const d = Math.abs(nodeY[k] - y); if (d < bd) { bd = d; n = k; } }
  if (n < 0 || !isFinite(dist[n])) return null;
  const dx = dirX[n], dz = dirZ[n];
  if (dx === 0 && dz === 0 && !climb[n]) return null; // goal cell on flat ground — beeline
  return { x: dx, z: dz, climb: climb[n], targetX: parentX[n], targetZ: parentZ[n], targetY: parentY[n] };
}
