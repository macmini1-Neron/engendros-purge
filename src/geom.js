// geom.js — PURE (no THREE/DOM/RNG → node-testable, worker-importable) small 2D-geometry helpers.

// Squared distance from point (px,pz) to the segment (ax,az)→(bx,bz), clamped to the segment ends
// (NOT the infinite line). Squared to avoid a sqrt at call sites that only compare against a radius².
export function segDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx, cz = az + t * dz;
  const ex = px - cx, ez = pz - cz;
  return ex * ex + ez * ez;
}
