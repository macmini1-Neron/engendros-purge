// bounds.js — pure spatial sanity for specs (no THREE; node-testable).
// Computes the real AABB a spec will build (per-op extents → at/rot → union)
// and checks it against the declared footprint. This is what catches the
// classic catastrophes mechanically: a spec authored in millimetres (a 280 m
// ammo box), a marking floating two metres off its face, a prop hovering
// above the floor — all invisible in a head-on render, all fatal in game.
import { MANIFEST } from './operators/manifest.js';
import { EXTENTS } from './operators/extents.js';

const D2R = Math.PI / 180;

// 3×3 rotation matrix matching THREE's Euler 'XYZ' order (R = RX·RY·RZ, v' = R·v).
function eulerXYZ(rxd, ryd, rzd) {
  const rx = rxd * D2R, ry = ryd * D2R, rz = rzd * D2R;
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    cy * cz, -cy * sz, sy,
    cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
    sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy,
  ];
}
const mulV = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

// AABB of one part in model space (local extents → rot about part origin → +at).
export function partBounds(p) {
  const ext = EXTENTS[p.op];
  if (!ext) return null;
  const { min, max } = ext(p.args || {});
  const at = [p.at?.[0] ?? 0, p.at?.[1] ?? 0, p.at?.[2] ?? 0];
  const rot = p.rot || [0, 0, 0];
  if (!rot[0] && !rot[1] && !rot[2]) {
    return { min: min.map((v, i) => v + at[i]), max: max.map((v, i) => v + at[i]) };
  }
  const R = eulerXYZ(rot[0], rot[1], rot[2]);
  const out = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let c = 0; c < 8; c++) {                       // rotate all 8 corners, re-box
    const corner = mulV(R, [c & 1 ? max[0] : min[0], c & 2 ? max[1] : min[1], c & 4 ? max[2] : min[2]]);
    for (let i = 0; i < 3; i++) {
      out.min[i] = Math.min(out.min[i], corner[i] + at[i]);
      out.max[i] = Math.max(out.max[i], corner[i] + at[i]);
    }
  }
  return out;
}

// Union AABB of the whole spec. Returns null if no part has extents.
export function boundsOf(spec) {
  let u = null;
  for (const p of spec.parts || []) {
    const b = partBounds(p);
    if (!b) continue;
    if (!u) u = { min: [...b.min], max: [...b.max] };
    else for (let i = 0; i < 3; i++) { u.min[i] = Math.min(u.min[i], b.min[i]); u.max[i] = Math.max(u.max[i], b.max[i]); }
  }
  if (!u) return null;
  u.size = { w: u.max[0] - u.min[0], h: u.max[1] - u.min[1], d: u.max[2] - u.min[2] };
  return u;
}

// Footprint discipline. Tolerances are deliberately loose — they exist to catch
// unit mix-ups and floaters, not to nag about a 5 mm overhang.
export function boundsErrors(spec) {
  const errs = [];
  const f = spec.footprint;
  const u = boundsOf(spec);
  if (!u || !f) return errs;                          // structural validation reports those
  const F = [f.w, f.h, f.d], U = [u.size.w, u.size.h, u.size.d], axis = ['w', 'h', 'd'];

  for (let i = 0; i < 3; i++) {
    if (U[i] > F[i] * 1.10 + 0.06) {
      errs.push(`built ${axis[i]}=${U[i].toFixed(3)} m overflows footprint.${axis[i]}=${F[i]} m — a part is misplaced/oversized (or the footprint is wrong)`);
    } else if (U[i] < F[i] * 0.55) {
      errs.push(`built ${axis[i]}=${U[i].toFixed(3)} m fills under 55% of footprint.${axis[i]}=${F[i]} m — footprint overstates the model (or parts are missing)`);
    }
  }
  const anchor = spec.anchor ?? 'floor';
  if (anchor !== 'free') {                              // 'free' = a sub-assembly placed manually; origin rules don't apply
    const cx = (u.min[0] + u.max[0]) / 2, cz = (u.min[2] + u.max[2]) / 2;
    if (Math.abs(cx) > Math.max(0.03, 0.15 * f.w)) errs.push(`model centre x=${cx.toFixed(3)} m is off-origin — author parts around x=0`);
    if (Math.abs(cz) > Math.max(0.03, 0.15 * f.d)) errs.push(`model centre z=${cz.toFixed(3)} m is off-origin — author parts around z=0`);
  }
  if (anchor === 'floor') {
    if (u.min[1] < -0.02) errs.push(`model sinks ${(-u.min[1]).toFixed(3)} m below the floor (y=0)`);
    if (u.min[1] > 0.08) errs.push(`model floats ${u.min[1].toFixed(3)} m above the floor (y=0) — floor-anchored specs must touch down`);
  }
  return errs;
}
