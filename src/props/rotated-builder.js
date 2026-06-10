// rotated-builder.js — pure rigid-rotation proxy for MeshBuilder-likes.
// An operator emits axis-aligned boxes around a part origin; wrapping the
// builder in rotatedBuilder() turns that into the SAME assembly rigidly rotated
// about the origin: each box centre orbits the origin, and each box carries the
// part rotation itself (a set of cuboids rotated by R about rotated centres ==
// the rigid rotation of the whole). Pure math — node-testable, no THREE.
const D2R = Math.PI / 180;

function eulerXYZ(rx, ry, rz) {       // matches THREE Euler 'XYZ': R = RX·RY·RZ
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    cy * cz, -cy * sz, sy,
    cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
    sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy,
  ];
}

export function rotatedBuilder(target, origin, rotDeg) {
  const rx = (rotDeg[0] || 0) * D2R, ry = (rotDeg[1] || 0) * D2R, rz = (rotDeg[2] || 0) * D2R;
  const R = eulerXYZ(rx, ry, rz);
  return {
    box(w, h, d, x, y, z, color, opts = {}) {
      const lx = x - origin.x, ly = y - origin.y, lz = z - origin.z;
      const px = R[0] * lx + R[1] * ly + R[2] * lz;
      const py = R[3] * lx + R[4] * ly + R[5] * lz;
      const pz = R[6] * lx + R[7] * ly + R[8] * lz;
      // operators emit un-rotated boxes; the part rotation becomes the box rotation
      target.box(w, h, d, origin.x + px, origin.y + py, origin.z + pz, color, { ...opts, rx, ry, rz });
      return this;
    },
  };
}
