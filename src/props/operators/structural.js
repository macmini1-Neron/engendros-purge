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
