// furniture.js — box-only furniture operators (no THREE; unit-testable).
// Extents fns (local AABB before `at`/`rot`) live in furnitureExtents — keep in
// lockstep with the emitted boxes; the bounds validator depends on it.
// NOTE the anchors: drawerStack and legs are FLOOR-anchored (o.y = bottom);
// the structural ops are CENTER-anchored. See MANIFEST[op].anchor.

export const DRAWER_FRONT_PROUD = 0.02;   // drawer front straddles the carcass face by half of this
export const HANDLE_D = 0.045;            // drawer handle depth — proud of the front
export const HANDLE_OFF = 0.025;          // handle centre offset past the carcass face
export const LEG_INSET = 0.01;            // legs sit this far inside the w×d footprint

export function drawerStack(b, a, t, o) {
  const { w, h, d, count } = a;
  b.box(w, h, d, o.x, o.y + h / 2, o.z, t.mid);                           // carcass
  const dh = h / count;
  for (let i = 0; i < count; i++) {
    const cy = o.y + dh * (i + 0.5);
    b.box(w * 0.9, dh * 0.82, DRAWER_FRONT_PROUD, o.x, cy, o.z + d / 2, t.slot);  // recessed drawer front
    b.box(w * 0.32, 0.03, HANDLE_D, o.x, cy, o.z + d / 2 + HANDLE_OFF, t.bright); // handle
  }
}

export function legs(b, a, t, o) {
  const { w, d, h } = a, lw = a.lw ?? 0.07;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = o.x + sx * (w / 2 - lw / 2 - LEG_INSET);
    const z = o.z + sz * (d / 2 - lw / 2 - LEG_INSET);
    b.box(lw, h - 0.05, lw, x, o.y + (h - 0.05) / 2, z, t.mid);          // post
    b.box(lw, 0.05, lw, x, o.y + h - 0.025, z, t.bright);                 // lit cap (stacked on post top — no coplanar z-fight)
  }
}

export const furnitureExtents = {
  drawerStack: (a) => ({
    min: [-a.w / 2, 0, -a.d / 2],
    max: [a.w / 2, a.h, a.d / 2 + HANDLE_OFF + HANDLE_D / 2],
  }),
  legs: (a) => ({
    min: [-(a.w / 2 - LEG_INSET), 0, -(a.d / 2 - LEG_INSET)],
    max: [a.w / 2 - LEG_INSET, a.h, a.d / 2 - LEG_INSET],
  }),
};
