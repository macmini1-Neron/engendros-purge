// structural.js — box-only structural operators (no THREE; unit-testable).
// Layered shading: body=mid, lit top strip=bright, shadow underside=lo.

export function bevelBox(b, a, t, o) {
  const { w, h, d } = a;
  b.box(w, h, d, o.x, o.y, o.z, t.mid);
  b.box(w * 0.98, 0.04, d * 0.98, o.x, o.y + h / 2 - 0.02, o.z, t.bright); // lit top lip
  b.box(w, 0.035, d, o.x, o.y - h / 2 + 0.0175, o.z, t.lo);               // shadow underside
}

export function panel(b, a, t, o) {
  const { w, h } = a, th = a.th ?? 0.025;
  b.box(w, h, th, o.x, o.y, o.z, t.mid);
  b.box(w, 0.03, th * 1.2, o.x, o.y + h / 2 - 0.015, o.z, t.bright);      // lit top edge
}

export function plate(b, a, t, o) {
  const { w, d } = a, th = a.th ?? 0.04;
  b.box(w, th, d, o.x, o.y, o.z, t.lo);                                   // thin recessed slab (kick/footer)
}
