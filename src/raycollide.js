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

// Capsule surface normal at a hit point (perpendicular to the segment, normalised).
function _capN(px, py, pz, ax, ay, az, bax, bay, baz, baba, out) {
  if (!out) return;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  let h = (pax * bax + pay * bay + paz * baz) / (baba || 1e-9);
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const nx = pax - h * bax, ny = pay - h * bay, nz = paz - h * baz;
  const inv = 1 / (Math.hypot(nx, ny, nz) || 1e-6);
  out.nx = nx * inv; out.ny = ny * inv; out.nz = nz * inv;
}

// Ray vs capsule (segment A→B, radius r). Port of iq's capIntersect with a parallel-ray
// guard. Returns nearest t >= 0 or null.
export function rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r, out) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const oax = ox - ax, oay = oy - ay, oaz = oz - az;
  const baba = bax * bax + bay * bay + baz * baz;
  const bard = bax * dx + bay * dy + baz * dz;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = dx * oax + dy * oay + dz * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const a = baba - bard * bard;
  if (a > 1e-12) {                                  // not parallel to the axis → cylinder body root
    let b = baba * rdoa - baoa * bard;
    let c = baba * oaoa - baoa * baoa - r * r * baba;
    let h = b * b - a * c;
    if (h >= 0) {
      const t = (-b - Math.sqrt(h)) / a;
      const y = baoa + t * bard;
      if (y > 0 && y < baba) {                      // hit on the cylindrical body
        if (t < 0) return null;
        _capN(ox + dx * t, oy + dy * t, oz + dz * t, ax, ay, az, bax, bay, baz, baba, out);
        return t;
      }
      // body root falls beyond an end → test the nearer hemisphere cap
      const cx = y <= 0 ? ax : bx, cy = y <= 0 ? ay : by, cz = y <= 0 ? az : bz;
      const ocx = ox - cx, ocy = oy - cy, ocz = oz - cz;
      b = dx * ocx + dy * ocy + dz * ocz;
      c = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
      h = b * b - c;
      if (h > 0) {
        const t2 = -b - Math.sqrt(h);
        if (t2 < 0) return null;
        _capN(ox + dx * t2, oy + dy * t2, oz + dz * t2, ax, ay, az, bax, bay, baz, baba, out);
        return t2;
      }
      return null;
    }
    return null;
  }
  // ray ~parallel to the capsule axis → nearest of the two end spheres
  const tA = raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, r, null);
  const tB = raySphere(ox, oy, oz, dx, dy, dz, bx, by, bz, r, null);
  let t = tA;
  if (tB !== null && (t === null || tB < t)) t = tB;
  if (t === null) return null;
  _capN(ox + dx * t, oy + dy * t, oz + dz * t, ax, ay, az, bax, bay, baz, baba, out);
  return t;
}

// Narrowphase dispatcher for a world collision box. If the box carries an exact shape
// (box.cap = capsule), test it and return its refined t (or null = the ray missed the real
// shape and should continue past this box). Boxes with no exact shape (buildings, foliage,
// terrain, fortifications) return the broadphase AABB t unchanged → today's behaviour.
export function refineBoxHit(box, ox, oy, oz, dx, dy, dz, aabbT, out) {
  const cap = box.cap;
  if (cap) return rayCapsule(ox, oy, oz, dx, dy, dz, cap.ax, cap.ay, cap.az, cap.bx, cap.by, cap.bz, cap.r, out);
  return aabbT;
}
