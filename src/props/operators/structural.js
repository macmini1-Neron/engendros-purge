// structural.js — box-only structural operators (no THREE; unit-testable).
// Layered shading via STACKED full-footprint layers (lit top / mid body / shadow
// foot). Stacking (rather than overlapping a smaller cap on top of a full body)
// means there are no coplanar EXPOSED faces, so flat tops do not z-fight. The
// three layers share the full w×d footprint, so a side reads as bright/mid/lo
// horizontal bands and the top is a single clean lit face.

export function bevelBox(b, a, t, o) {
  const { w, h, d } = a;
  const lip = Math.min(0.02, h * 0.3);
  b.box(w, lip, d, o.x, o.y + h / 2 - lip / 2, o.z, t.bright);     // lit top layer
  b.box(w, h - 2 * lip, d, o.x, o.y, o.z, t.mid);                  // body
  b.box(w, lip, d, o.x, o.y - h / 2 + lip / 2, o.z, t.lo);        // shadow foot
}

export function panel(b, a, t, o) {
  const { w, h } = a, th = a.th ?? 0.025;
  const lip = Math.min(0.03, h * 0.25);
  b.box(w, lip, th, o.x, o.y + h / 2 - lip / 2, o.z, t.bright);    // lit top edge
  b.box(w, h - lip, th, o.x, o.y - lip / 2, o.z, t.mid);          // body below it
}

export function plate(b, a, t, o) {
  const { w, d } = a, th = a.th ?? 0.04;
  b.box(w, th, d, o.x, o.y, o.z, t.lo);                           // single thin recessed slab (kick/footer)
}

// finSet — `count` cruciform fins around the +Z axis (a missile's long axis), each fin a
// stack of `steps` thin plates whose chord tapers root→tip (a stepped delta, voxel-style).
// Box-only (rotated boxes), so it stays pure + unit-testable. Args: count, root (root chord),
// span (radial reach); opts: tip (tip chord), thick, r0 (body radius the fins start at),
// sweep (shift the chord centre along +Z per step), phase (angular offset), steps.
export function finSet(b, a, t, o) {
  const count = a.count ?? 4, steps = a.steps ?? 3;
  const root = a.root, tip = a.tip ?? root * 0.25, span = a.span;
  const thick = a.thick ?? 0.04, r0 = a.r0 ?? 0, sweep = a.sweep ?? 0, phase = a.phase ?? 0;
  for (let k = 0; k < count; k++) {
    const ang = phase + (k / count) * Math.PI * 2;
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let i = 0; i < steps; i++) {
      const f = steps === 1 ? 0 : i / (steps - 1);
      const len = root + (tip - root) * f;                 // chord tapers root→tip
      const rad = r0 + span * (i + 0.5) / steps;            // radial centre of this plate
      // after rz=ang: local-X (radial extent) points radially, local-Y (thick) is tangential
      b.box(span / steps + 0.012, thick, len, o.x + c * rad, o.y + s * rad, o.z + sweep * f,
            i >= steps - 1 ? t.bright : t.mid, { rz: ang });
    }
  }
}
