// grid.js — uniform spatial-hash index over world.boxes (AABB colliders) for O(1) broad-phase
// collision queries + ray casts. The grid does NOT own the boxes — world.boxes stays authoritative;
// this is an index that must be kept in sync (build once, addBox on every runtime collider push).
import { rayAABB } from './util.js';

const CELL = 16; // metres per cell — ~ a large structure footprint

export class SpatialGrid {
  constructor(cell = CELL) { this.cell = cell; this.cells = new Map(); this._qid = 0; }
  _k(cx, cz) { return cx * 100003 + cz; }              // pack two smallish ints into one map key
  clear() { this.cells.clear(); }
  build(boxes) { this.clear(); for (const b of boxes) this.addBox(b); return this; }
  addBox(box) {
    const c = this.cell;
    const x0 = Math.floor(box.min.x / c), x1 = Math.floor(box.max.x / c);
    const z0 = Math.floor(box.min.z / c), z1 = Math.floor(box.max.z / c);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = this._k(cx, cz); let a = this.cells.get(k); if (!a) this.cells.set(k, a = []); a.push(box);
    }
    return box;
  }
  // Boxes whose cells overlap the XZ rectangle. De-duped via a per-query stamp (no allocation).
  queryAABB(minx, minz, maxx, maxz, out = []) {
    out.length = 0; const c = this.cell, qid = ++this._qid;
    const x0 = Math.floor(minx / c), x1 = Math.floor(maxx / c), z0 = Math.floor(minz / c), z1 = Math.floor(maxz / c);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const a = this.cells.get(this._k(cx, cz)); if (!a) continue;
      for (let i = 0; i < a.length; i++) { const b = a[i]; if (b._qid !== qid) { b._qid = qid; out.push(b); } }
    }
    return out;
  }
  // Nearest box hit by the ray within maxDist. XZ-DDA cell walk + rayAABB per box, early-out.
  // Returns { box, t } or null. `filter(box)` may reject boxes (e.g. non-blocking ones).
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filter) {
    const c = this.cell, qid = ++this._qid;
    let cx = Math.floor(ox / c), cz = Math.floor(oz / c);
    const stepX = dx >= 0 ? 1 : -1, stepZ = dz >= 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(c / dx) : Infinity, tDeltaZ = dz !== 0 ? Math.abs(c / dz) : Infinity;
    let tMaxX = dx !== 0 ? ((dx > 0 ? (cx + 1) * c : cx * c) - ox) / dx : Infinity;
    let tMaxZ = dz !== 0 ? ((dz > 0 ? (cz + 1) * c : cz * c) - oz) / dz : Infinity;
    let best = null, bestT = maxDist;
    for (let guard = 0; guard < 8192; guard++) {
      const a = this.cells.get(this._k(cx, cz));
      if (a) for (let i = 0; i < a.length; i++) { const b = a[i];
        if (b._qid === qid) continue; b._qid = qid; if (filter && !filter(b)) continue;
        const t = rayAABB(ox, oy, oz, dx, dy, dz, b.min, b.max);
        if (t != null && t >= 0 && t < bestT) { bestT = t; best = b; } }
      const exit = Math.min(tMaxX, tMaxZ);
      if (best && bestT <= exit) break;          // nearest hit is within an already-tested cell
      if (exit > maxDist) break;
      if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDeltaX; } else { cz += stepZ; tMaxZ += tDeltaZ; }
    }
    return best ? { box: best, t: bestT } : null;
  }
}
