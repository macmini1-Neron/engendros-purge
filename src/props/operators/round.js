// round.js — round operators (cylinder / cone) for bodies, barrels, nozzles, nose
// cones, turntables. These build real THREE geometry (CylinderGeometry / ConeGeometry),
// so unlike the box-only operators they import `three` and are verified in the browser,
// not under `node --test`. The pure layers (manifest, validateSpec, planBuild) don't
// care — they dispatch by name; only the impl is THREE-bound. Keep that boundary: a
// model's pure-testable parts stay box-only; reach for these only for genuinely round forms.
import * as THREE from 'three';

// Orient a +Y-axis primitive (THREE's default) onto x / y / z.
const ORIENT = { x: { rz: Math.PI / 2 }, y: {}, z: { rx: Math.PI / 2 } };

// Cylinder of radius r (optionally tapering to r2 at the +axis end), length h, along `axis`.
export function cylinder(b, a, t, o) {
  const seg = a.seg ?? 16;
  const g = new THREE.CylinderGeometry(a.r2 ?? a.r, a.r, a.h, seg, 1, !!a.open);
  b.geo(g, o.x, o.y, o.z, a.tone ? t[a.tone] : t.mid, { ...ORIENT[a.axis ?? 'z'], tint: 0.02 });
  g.dispose();
}

// Cone of base radius r, length h, tip pointing along +axis (nose cones, tapers).
export function cone(b, a, t, o) {
  const seg = a.seg ?? 16;
  const g = new THREE.ConeGeometry(a.r, a.h, seg);
  b.geo(g, o.x, o.y, o.z, a.tone ? t[a.tone] : t.bright, { ...ORIENT[a.axis ?? 'z'], tint: 0.02 });
  g.dispose();
}

// deltaFins — `count` cruciform CROPPED-DELTA fins around the +Z axis. Each fin is a clean
// swept trapezoid (root chord `root`, shorter tip chord `tip`, leading edge swept back toward
// the tail by `sweep`), built as a thin prism of real geometry — not stepped boxes — so the
// silhouette reads as a true delta. THREE-bound (browser-verified). r0 = body radius the fins
// start at; phase = angular offset (use ~0.785 for an X / 45° cruciform).
export function deltaFins(b, a, t, o) {
  const count = a.count ?? 4, phase = a.phase ?? 0;
  const root = a.root, span = a.span, tip = a.tip ?? root * 0.3;
  const r0 = a.r0 ?? 0, sweep = a.sweep ?? root * 0.45, thick = a.thick ?? 0.04;
  const color = a.tone ? t[a.tone] : t.mid;
  // corners in (radial u, axial v); +v is toward the +Z nose (leading edge)
  const corners = [
    [r0, root / 2],                       // root leading
    [r0 + span, root / 2 - sweep],         // tip leading
    [r0 + span, root / 2 - sweep - tip],   // tip trailing
    [r0, -root / 2],                       // root trailing
  ];
  for (let k = 0; k < count; k++) {
    const ang = phase + (k / count) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
    const V = [];
    for (const w of [thick / 2, -thick / 2])
      for (const [u, v] of corners) V.push(ca * u - sa * w, sa * u + ca * w, v);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(V, 3));
    g.setIndex([0, 1, 2, 0, 2, 3,  4, 6, 5, 4, 7, 6,  0, 4, 5, 0, 5, 1,
                1, 5, 6, 1, 6, 2,  2, 6, 7, 2, 7, 3,  3, 7, 4, 3, 4, 0]);
    g.computeVertexNormals();
    b.geo(g, o.x, o.y, o.z, color, { tint: 0.015 });
    g.dispose();
  }
}
