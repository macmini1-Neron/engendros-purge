// swarmgrid.js — PURE (no THREE/DOM/RNG → node-testable) uniform spatial hash for the horde's
// neighbour queries (separation). Replaces the O(n²) all-pairs separation scan with an O(n) bucket
// build + a 3×3-block lookup per agent. The `cell` MUST be ≥ the query radius so a 3×3 block can never
// miss an in-range neighbour — a neighbour within R < cell is at most one cell away on each axis.
//
// Items are held by identity and read through `.pos.x/.pos.z` (the Enemy contract) — no per-item
// allocation. Integer bucket keys (offset-packed) avoid string-key hashing.

const OFF = 1 << 15, SPAN = 1 << 16; // cells in [-32768, 32767] → any sane map at any sane cell size

export function buildSwarmGrid(items, cell) {
  const inv = 1 / cell;
  const buckets = new Map();
  for (const it of items) {
    if (it.alive === false) continue; // skip pooled / just-killed entries (no-op when the field is absent)
    const cx = Math.floor(it.pos.x * inv) + OFF, cz = Math.floor(it.pos.z * inv) + OFF;
    const key = cx * SPAN + cz;
    let b = buckets.get(key); if (!b) buckets.set(key, b = []);
    b.push(it);
  }
  return { cell, inv, buckets };
}

// Call fn(item) for every item in the 3×3 cell block around world (x,z). Over-includes the wider block;
// the caller filters by the true radius (and skips self). Completeness within R holds when cell ≥ R.
export function eachNeighbor(grid, x, z, fn) {
  const { inv, buckets } = grid;
  const cx = Math.floor(x * inv) + OFF, cz = Math.floor(z * inv) + OFF;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const b = buckets.get((cx + dx) * SPAN + (cz + dz));
    if (b) for (let i = 0; i < b.length; i++) fn(b[i]);
  }
}
