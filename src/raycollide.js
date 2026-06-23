// raycollide.js — THREE-free ray↔shape narrowphase math for the shooting hitscan path.
// Pure numbers in/out (no THREE) so it is node-testable AND worker-safe. Directions are
// assumed UNIT length. Functions return the nearest t >= 0 along the ray, or null. When an
// `out` object is passed, the unit surface normal is written to out.nx/out.ny/out.nz.

// Ray vs sphere (centre c, radius r). Reduced quadratic (dir is unit).
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, out) {
  const mx = ox - cx, my = oy - cy, mz = oz - cz;
  const b = mx * dx + my * dy + mz * dz;
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c > 0 && b > 0) return null;            // outside and pointing away
  const disc = b * b - c;
  if (disc < 0) return null;                  // misses
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;                     // origin inside → far root
  if (t < 0) return null;
  if (out) {
    const inv = 1 / (r || 1e-6);
    out.nx = (mx + dx * t) * inv; out.ny = (my + dy * t) * inv; out.nz = (mz + dz * t) * inv;
  }
  return t;
}
