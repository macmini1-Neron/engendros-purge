// rotated-builder.js — pure rigid-rotation proxy for MeshBuilder-likes.
// An operator emits axis-aligned boxes (and oriented geo) around a part origin;
// wrapping the builder in rotatedBuilder() turns that into the SAME assembly
// rigidly rotated about the origin: each emission's centre orbits the origin,
// and the part rotation COMPOSES with whatever orientation the operator gave
// the emission itself (matrix multiply + decompose — euler angles do NOT add).
// Pure math — node-testable, no THREE.
const D2R = Math.PI / 180;

function eulerXYZ(rx, ry, rz) {       // matches THREE Euler 'XYZ': R = RX·RY·RZ
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    cy * cz, -cy * sz, sy,
    cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
    sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy,
  ];
}

const mulM = (a, b) => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];

// Decompose R back to 'XYZ' euler (THREE Euler.setFromRotationMatrix order XYZ).
function eulerFromMat(m) {
  const y = Math.asin(Math.max(-1, Math.min(1, m[2])));
  if (Math.abs(m[2]) < 0.9999999) {
    return [Math.atan2(-m[5], m[8]), y, Math.atan2(-m[1], m[0])];
  }
  return [Math.atan2(m[7], m[4]), y, 0];
}

export function rotatedBuilder(target, origin, rotDeg) {
  const rx = (rotDeg[0] || 0) * D2R, ry = (rotDeg[1] || 0) * D2R, rz = (rotDeg[2] || 0) * D2R;
  const R = eulerXYZ(rx, ry, rz);
  const orbit = (x, y, z) => {
    const lx = x - origin.x, ly = y - origin.y, lz = z - origin.z;
    return [
      origin.x + R[0] * lx + R[1] * ly + R[2] * lz,
      origin.y + R[3] * lx + R[4] * ly + R[5] * lz,
      origin.z + R[6] * lx + R[7] * ly + R[8] * lz,
    ];
  };
  const compose = (opts = {}) => {
    if (opts.align) console.warn('[rotated-builder] opts.align under a part rot is unsupported — orientation may be wrong');
    if (!opts.rx && !opts.ry && !opts.rz) return { ...opts, rx, ry, rz };
    const [crx, cry, crz] = eulerFromMat(mulM(R, eulerXYZ(opts.rx || 0, opts.ry || 0, opts.rz || 0)));
    return { ...opts, rx: crx, ry: cry, rz: crz };
  };
  return {
    box(w, h, d, x, y, z, color, opts = {}) {
      const [px, py, pz] = orbit(x, y, z);
      target.box(w, h, d, px, py, pz, color, compose(opts));
      return this;
    },
    geo(geometry, x, y, z, color, opts = {}) {
      const [px, py, pz] = orbit(x, y, z);
      target.geo(geometry, px, py, pz, color, compose(opts));
      return this;
    },
  };
}
