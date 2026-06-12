// bounds.js — pure spatial sanity for building specs (no THREE; node-testable).
// Mirrors src/props/bounds.js with the buildgen deltas: extents receive the spec
// (shell/roof extents derive from footprint/storeys), and buildings are always
// floor-anchored. Same thresholds as modelgen — they catch unit mix-ups and
// floaters, not 5 mm overhangs.
import { EXTENTS } from './operators/extents.js';
import { eulerXYZ, mulV } from './operators/_math.js';

// AABB of one part in building space (local extents → rot about part origin → +at).
export function partBounds(p, spec) {
  const ext = EXTENTS[p.op];
  if (!ext) return null;
  const e = ext(p.args || {}, spec);
  if (!e) return null;                                 // plan-time macros (repeat) have no extent
  const { min, max } = e;
  const at = [p.at?.[0] ?? 0, p.at?.[1] ?? 0, p.at?.[2] ?? 0];
  const rot = p.rot || [0, 0, 0];
  if (!rot[0] && !rot[1] && !rot[2]) {
    return { min: min.map((v, i) => v + at[i]), max: max.map((v, i) => v + at[i]) };
  }
  const R = eulerXYZ(rot[0], rot[1], rot[2]);
  const out = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let c = 0; c < 8; c++) {                        // rotate all 8 corners, re-box
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
    if (p.op === 'propRef') continue;                  // prop bounds live in the prop's own spec (law 12)
    const b = partBounds(p, spec);
    if (!b) continue;
    if (!u) u = { min: [...b.min], max: [...b.max] };
    else for (let i = 0; i < 3; i++) { u.min[i] = Math.min(u.min[i], b.min[i]); u.max[i] = Math.max(u.max[i], b.max[i]); }
  }
  if (!u) return null;
  u.size = { w: u.max[0] - u.min[0], h: u.max[1] - u.min[1], d: u.max[2] - u.min[2] };
  return u;
}

// Footprint discipline (law 5). Buildings are always floor-anchored.
export function boundsErrors(spec) {
  const errs = [];
  const f = spec.footprint;
  const u = boundsOf(spec);
  if (!u || !f) return errs;                           // structural validation reports those
  const F = [f.w, f.h, f.d], U = [u.size.w, u.size.h, u.size.d], axis = ['w', 'h', 'd'];

  for (let i = 0; i < 3; i++) {
    if (U[i] > F[i] * 1.10 + 0.06) {
      errs.push(`built ${axis[i]}=${U[i].toFixed(3)} m overflows footprint.${axis[i]}=${F[i]} m — a part is misplaced/oversized (or the footprint is wrong)`);
    } else if (U[i] < F[i] * 0.55) {
      errs.push(`built ${axis[i]}=${U[i].toFixed(3)} m fills under 55% of footprint.${axis[i]}=${F[i]} m — footprint overstates the building (or parts are missing)`);
    }
  }
  const cx = (u.min[0] + u.max[0]) / 2, cz = (u.min[2] + u.max[2]) / 2;
  if (Math.abs(cx) > Math.max(0.03, 0.15 * f.w)) errs.push(`building centre x=${cx.toFixed(3)} m is off-origin — author parts around x=0`);
  if (Math.abs(cz) > Math.max(0.03, 0.15 * f.d)) errs.push(`building centre z=${cz.toFixed(3)} m is off-origin — author parts around z=0`);
  if (u.min[1] < -0.02) errs.push(`building sinks ${(-u.min[1]).toFixed(3)} m below the floor (y=0)`);
  if (u.min[1] > 0.08) errs.push(`building floats ${u.min[1].toFixed(3)} m above the floor (y=0) — buildings must touch down`);
  return errs;
}
