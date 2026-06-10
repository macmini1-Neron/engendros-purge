// container.js — box-only container/hardware operators (no THREE; unit-testable).
// The military-crate idioms: a lidded chest, a wrap-around strap, a carry handle.
// Z-fight discipline: hardware is EMBEDDED a few mm into its parent face and
// stands proud of it — never coplanar with another same-normal face. Extents fns
// (local AABB before `at`/`rot`) live in containerExtents — keep in lockstep.

import { clamp } from './_math.js';

export const HARDWARE_TH = 0.012;  // hinge/hasp plate thickness
export const EMBED = 0.004;        // how deep hardware sinks into its parent face

const lidOverhang = (w, d) => clamp(Math.min(w, d) * 0.04, 0.004, 0.012);

// lidBox — a floor-anchored lidded container (ammo box, crate, footlocker):
// banded body + overhanging lid + two hinge knuckles (back) + hasp & knob (front).
// w/h/d = OVERALL outer size incl. lid; lid = lid height. Local -Z = back/hinges.
export function lidBox(b, a, t, o) {
  const { w, h, d, lid } = a;
  const bh = h - lid;                                   // body height
  const ov = lidOverhang(w, d);
  const foot = clamp(bh * 0.12, 0.004, 0.02);
  const lip = clamp(lid * 0.3, 0.003, 0.015);

  b.box(w, foot, d, o.x, o.y + foot / 2, o.z, t.lo);                          // shadow foot
  b.box(w, bh - foot, d, o.x, o.y + foot + (bh - foot) / 2, o.z, t.mid);     // body
  b.box(w + 2 * ov, lid - lip, d + 2 * ov, o.x, o.y + bh + (lid - lip) / 2, o.z, t.hi);   // lid slab (overhangs)
  b.box(w + 2 * ov, lip, d + 2 * ov, o.x, o.y + h - lip / 2, o.z, t.bright);              // lit lid top

  const hh = clamp(lid * 0.9, 0.012, 0.035), hw = clamp(w * 0.07, 0.012, 0.035);
  for (const sx of [-1, 1])                                                   // hinge knuckles, back edge
    b.box(hw, hh, HARDWARE_TH, o.x + sx * w / 4, o.y + bh, o.z - (d / 2 + ov) + EMBED - HARDWARE_TH / 2, t.lo);

  const cw = clamp(w * 0.09, 0.015, 0.045), ch = clamp(bh * 0.5, 0.025, 0.07);
  const cy = o.y + bh + Math.min(lid * 0.4, 0.02) - ch / 2;                   // hasp hangs over the seam
  const cz = o.z + d / 2 + ov - EMBED + HARDWARE_TH / 2;
  b.box(cw, ch, HARDWARE_TH, o.x, cy, cz, t.lo);                              // hasp plate
  b.box(cw * 0.5, 0.012, 0.01, o.x, cy - ch * 0.1, cz + HARDWARE_TH / 2 + 0.003, t.bright); // latch knob
}

// strapBand — a band wrapped around a h×d cross-section (leather lashing strap,
// steel banding). Center-anchored on the wrapped section's centre; band width w
// runs along local X. th = band thickness standing proud.
export function strapBand(b, a, t, o) {
  const { w, h, d } = a, th = a.th ?? 0.008;
  b.box(w, th, d + 2 * th, o.x, o.y + h / 2 + th / 2, o.z, t.hi);            // over the top
  b.box(w, th, d + 2 * th, o.x, o.y - h / 2 - th / 2, o.z, t.lo);            // under the bottom
  b.box(w, h, th, o.x, o.y, o.z + d / 2 + th / 2, t.mid);                    // down the front
  b.box(w, h, th, o.x, o.y, o.z - d / 2 - th / 2, t.mid);                    // down the back
}

// handleU — a U-shaped carry handle lying FLAT (stowed): crossbar along X at
// local far +Z, two posts running back to z=0. Rotate the part to stand it up
// or hang it on a face. w = outer width, h = reach, th = bar thickness.
export function handleU(b, a, t, o) {
  const { w, h } = a, th = a.th ?? 0.015;
  b.box(w, th, th, o.x, o.y + th / 2, o.z + h - th / 2, t.bright);           // crossbar (grip)
  for (const sx of [-1, 1])
    b.box(th, th, h - th, o.x + sx * (w / 2 - th / 2), o.y + th / 2, o.z + (h - th) / 2, t.mid); // posts
}

export const containerExtents = {
  lidBox: (a) => {
    const ov = lidOverhang(a.w, a.d), proud = HARDWARE_TH - EMBED + 0.013;   // hasp knob reach
    return { min: [-(a.w / 2 + ov), 0, -(a.d / 2 + ov + HARDWARE_TH - EMBED)], max: [a.w / 2 + ov, a.h, a.d / 2 + ov + proud] };
  },
  strapBand: (a) => { const th = a.th ?? 0.008; return { min: [-a.w / 2, -(a.h / 2 + th), -(a.d / 2 + th)], max: [a.w / 2, a.h / 2 + th, a.d / 2 + th] }; },
  handleU: (a) => { const th = a.th ?? 0.015; return { min: [-a.w / 2, 0, 0], max: [a.w / 2, th, a.h] }; },
};
