// THREE-free voxel-cylinder trunk: bands up the height × a ring of `sectors` angular wedges × `rings`
// radial shells (r=0 OUTER bark, r=rings-1 core). Cell index i = (b*sectors + s)*rings + r.
// Pure + deterministic (no Math.random) → node-testable + co-op-safe.

export function makeTrunk({ height, radius, bands = 6, sectors = 8, rings = 2, hp = 10 }) {
  const n = bands * sectors * rings;
  return {
    height, radius, bands, sectors, rings, bandH: height / bands,
    alive: new Uint8Array(n).fill(1),
    hp: new Float32Array(n).fill(hp),
  };
}

export function cellIndex(t, b, s, r) { return (b * t.sectors + s) * t.rings + r; }

export function decodeCell(t, i) {
  const r = i % t.rings;
  const tmp = (i - r) / t.rings;
  const s = tmp % t.sectors;
  const b = (tmp - s) / t.sectors;
  return [b, s, r];
}

// Local-space (origin = base centre, +Y up) axis-aligned box approximating a wedge cell — used for the
// collision box and for mapping a world hit to a cell. Slightly isotropic in XZ (good enough; cells overlap
// a touch to form a solid trunk, and removing a cell leaves a real gap).
export function cellAABB(t, b, s, r) {
  const a = (s + 0.5) / t.sectors * Math.PI * 2;
  const rOuter = t.radius * (t.rings - r) / t.rings;
  const rInner = t.radius * (t.rings - r - 1) / t.rings;
  const rMid = (rOuter + rInner) / 2;
  const cx = Math.cos(a) * rMid, cz = Math.sin(a) * rMid, cy = (b + 0.5) * t.bandH;
  const hr = (rOuter - rInner) / 2;                 // radial half-thickness
  const ha = Math.PI / t.sectors * Math.max(rMid, 1e-3);   // approx arc half-width
  const ex = Math.max(hr, ha);
  return { min: [cx - ex, cy - t.bandH / 2, cz - ex], max: [cx + ex, cy + t.bandH / 2, cz + ex], c: [cx, cy, cz] };
}

// Apply a hit at LOCAL height `y` (metres up from base) and `ang` (radians around +X→+Z). `pen` = how many
// OUTER rings the caliber reaches (1..rings). `dmg` is subtracted from each cell's hp; cells at hp≤0 die.
// `spreadS`/`spreadB` = footprint radius in sectors/bands (0 = single column). Returns the ids that DIED.
export function carve(t, y, ang, { pen = 1, dmg = 1e9, spreadS = 0, spreadB = 0 } = {}) {
  const b0 = Math.max(0, Math.min(t.bands - 1, Math.floor(y / t.bandH)));
  const TAU = Math.PI * 2;
  const s0 = Math.floor((((ang % TAU) + TAU) % TAU) / TAU * t.sectors) % t.sectors;
  const dead = [];
  for (let db = -spreadB; db <= spreadB; db++) {
    const b = b0 + db; if (b < 0 || b >= t.bands) continue;
    for (let ds = -spreadS; ds <= spreadS; ds++) {
      const s = (((s0 + ds) % t.sectors) + t.sectors) % t.sectors;
      for (let r = 0; r < Math.min(pen, t.rings); r++) {
        const i = cellIndex(t, b, s, r);
        if (!t.alive[i]) continue;
        t.hp[i] -= dmg;
        if (t.hp[i] <= 0) { t.alive[i] = 0; dead.push(i); }
      }
    }
  }
  return dead;
}
