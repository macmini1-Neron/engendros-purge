// geom.js — pure AABB/ray helpers on plain arrays. NO imports (node-testable).
// Phase-2 graduation target: merge with rayAABB in src/util.js.

// Slab method. o=origin[3], d=dir[3] (normalized), min/max=[3]. Returns entry t ≥ 0 or null.
export function rayAABB(o, d, min, max) {
  const span = rayAABBSpan(o, d, min, max);
  return span ? span.tIn : null;
}

// Returns { tIn, tOut } or null. tIn clamped to ≥ 0 (origin inside box ⇒ tIn = 0).
export function rayAABBSpan(o, d, min, max) {
  let tIn = -Infinity, tOut = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
      continue;
    }
    let t1 = (min[i] - o[i]) / d[i], t2 = (max[i] - o[i]) / d[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tIn) tIn = t1;
    if (t2 < tOut) tOut = t2;
    if (tIn > tOut) return null;
  }
  if (tOut < 0) return null;
  return { tIn: Math.max(tIn, 0), tOut };
}

// Distance from point to closest surface point of the AABB (0 if inside).
export function distToAABB(p, min, max) {
  let s = 0;
  for (let i = 0; i < 3; i++) {
    const d = Math.max(min[i] - p[i], 0, p[i] - max[i]);
    s += d * d;
  }
  return Math.sqrt(s);
}

export function pointInAABB(p, min, max, inflate = 0) {
  return p[0] >= min[0] - inflate && p[0] <= max[0] + inflate &&
         p[1] >= min[1] - inflate && p[1] <= max[1] + inflate &&
         p[2] >= min[2] - inflate && p[2] <= max[2] + inflate;
}
