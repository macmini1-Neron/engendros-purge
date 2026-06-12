// landmark.js — tall-silhouette operators (pure; cyl records → CylinderGeometry in interp).
// These are what survives the 300 m fog check. All floor-anchored at the part origin.

// Tapered industrial chimney (ТЭЦ/kombinát). Slight collar at the crown.
export function chimney(b, a, ctx) {
  const o = ctx.origin;
  const mat = ctx.mat ?? ctx.materials?.wall;
  b.cyl(a.rBase, a.rTop, a.h, o.x, o.y + a.h / 2, o.z, { mat, collide: ctx.collide, seg: 12 });
  b.cyl(a.rTop + 0.08, a.rTop + 0.08, Math.min(0.6, a.h * 0.05), o.x, o.y + a.h - 0.3, o.z,
    { mat: ctx.materials?.trim ?? mat, collide: false, seg: 12, detail: true });
}

// Elevated water tank: 4 legs + tank drum + a thin cap.
export function waterTank(b, a, ctx) {
  const o = ctx.origin;
  const matLeg = ctx.materials?.trim ?? ctx.mat;
  const matTank = ctx.mat ?? ctx.materials?.wall;
  const lr = a.r * 0.62;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    b.box(0.22, a.legH, 0.22, o.x + sx * lr, o.y + a.legH / 2, o.z + sz * lr, { mat: matLeg, collide: ctx.collide });
  }
  b.cyl(a.r, a.r, a.h, o.x, o.y + a.legH + a.h / 2, o.z, { mat: matTank, collide: ctx.collide, seg: 12 });
  b.cyl(a.r + 0.05, a.r + 0.05, 0.08, o.x, o.y + a.legH + a.h + 0.04, o.z, { mat: matLeg, collide: false, seg: 12, detail: true });
}

// Radio/utility mast.
export function mast(b, a, ctx) {
  const o = ctx.origin;
  b.cyl(a.r, Math.max(0.02, a.r * 0.5), a.h, o.x, o.y + a.h / 2, o.z,
    { mat: ctx.mat ?? ctx.materials?.trim, collide: ctx.collide, seg: 8 });
}
