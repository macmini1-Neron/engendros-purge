// _math.js — pure spatial helpers for the buildgen harness (no THREE; node-testable).
//
// Coordinate contract (hard — see the design spec):
//   X = east(+)/west(−), Y = up, Z = north(+)/south(−), 1 unit ≈ 1 m.
//   Local building space: origin = centre of the footprint at ground level (y=0 floor).
//   `face` is resolved in LOCAL space, before the world yaw of placeBuilding.
//
// NOTE: eulerXYZ/mulV are deliberately DUPLICATED from src/props/bounds.js, not imported —
// buildgen must not couple to modelgen internals (parallel modelgen-v2 work on other branches
// must not break buildings). Imports from src/props are limited to registry-core + voxel-interp.

const D2R = Math.PI / 180;

// 3×3 rotation matrix matching THREE's Euler 'XYZ' order (R = RX·RY·RZ, v' = R·v).
export function eulerXYZ(rxd, ryd, rzd) {
  const rx = rxd * D2R, ry = ryd * D2R, rz = rzd * D2R;
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    cy * cz, -cy * sz, sy,
    cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
    sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy,
  ];
}
export const mulV = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

// ---------------------------------------------------------------------------
// Face frames — where each exterior wall lives.
// Corner policy (deterministic, no overlap/gap/coplanar corner faces):
//   N/S walls run the FULL footprint width `w`; E/W walls run `d − 2·wallT` between them.
// Face coordinate u runs along the wall: west→east for N/S, north→south for E/W.
// v is height above the wall base (y=0).
// ---------------------------------------------------------------------------
export function faceFrame(face, footprint, wallT) {
  const { w, d } = footprint;
  const t = wallT;
  switch (face) {
    // axis: which world axis u runs along (u west→east on N/S walls, south→north on E/W);
    // fixed: the wall centreline's other coordinate; start: world coordinate of u=0;
    // out: outward normal sign on the fixed axis. Contract: +Z = north, +X = east.
    case 'N': return { face, axis: 'x', L: w,         t, fixed:  d / 2 - t / 2, start: -w / 2,           out:  1 };
    case 'S': return { face, axis: 'x', L: w,         t, fixed: -d / 2 + t / 2, start: -w / 2,           out: -1 };
    case 'W': return { face, axis: 'z', L: d - 2 * t, t, fixed: -w / 2 + t / 2, start: -(d - 2 * t) / 2, out: -1 };
    case 'E': return { face, axis: 'z', L: d - 2 * t, t, fixed:  w / 2 - t / 2, start: -(d - 2 * t) / 2, out:  1 };
    default: throw new Error(`faceFrame: unknown face '${face}' (use N/S/E/W)`);
  }
}

// Face coords (u along the wall, v above its base) → local building space [x,y,z].
export function faceToWorld(frame, u, v) {
  return frame.axis === 'x'
    ? [frame.start + u, v, frame.fixed]
    : [frame.fixed, v, frame.start + u];
}

// ---------------------------------------------------------------------------
// Exact 90°-step yaw for collider AABBs (law 12). No trig — integer case switch,
// so 4×90° is bit-identical to 0° and colliders can never drift from the visual.
// k = yaw/90 (mod 4), matching THREE rotation.y = k·90°: x' = x·cos + z·sin, z' = −x·sin + z·cos.
// ---------------------------------------------------------------------------
export function assertYaw(yaw) {
  if (((yaw % 90) + 90) % 90 !== 0) {
    throw new Error(`buildgen: yaw=${yaw}° — placeBuilding yaw must be a multiple of 90° (world.boxes are axis-aligned AABBs; any other angle ships wrong colliders)`);
  }
  return ((Math.round(yaw / 90) % 4) + 4) % 4;
}

// Top of the last storey = where the roof seats. storeys: [{y, h}, …]; default one 3 m storey.
export function specTopY(spec) {
  const st = spec.storeys;
  if (!Array.isArray(st) || !st.length) return 3.0;
  const last = st[st.length - 1];
  return (last.y ?? 0) + (last.h ?? 3.0);
}

// March deltas for the four cardinal directions (x, z). Contract: north = +Z, east = +X.
export const DIRV = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };

export function rotYSteps(k, min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  switch (((k % 4) + 4) % 4) {
    case 0: return { min: [x0, y0, z0], max: [x1, y1, z1] };
    case 1: return { min: [z0, y0, -x1], max: [z1, y1, -x0] };   // 90°:  (x,z) → (z, −x)
    case 2: return { min: [-x1, y0, -z1], max: [-x0, y1, -z0] }; // 180°: (x,z) → (−x,−z)
    case 3: return { min: [-z1, y0, x0], max: [-z0, y1, x1] };   // 270°: (x,z) → (−z, x)
  }
}
