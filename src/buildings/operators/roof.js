// roof.js — roof operators (pure; emit box/wedge/prism records). Law 4: a building's top
// must be closed by roof-family parts spanning the footprint. Visual roofs may be angled;
// only flatRoof/parapet emit colliders (AABB can't do slopes — design-spec non-goal).
import { specTopY } from './_math.js';

// Walkable flat slab seated on the wall tops (the roofAccess seat). Bottom face rests ON
// topY — opposite-normal contact with the wall tops, which is z-fight-safe.
export function flatRoof(b, a, ctx) {
  const { w, d } = ctx.footprint;
  const ov = a.overhang ?? 0;
  const y = ctx.topY;
  b.box(w + 2 * ov, a.t, d + 2 * ov, 0, y + a.t / 2, 0, { mat: ctx.mat ?? ctx.materials?.roof, collide: ctx.collide });
}

// Gable (sedlová): one triangular prism. Ridge runs along args.ridgeAxis or the longer footprint axis.
export function gableRoof(b, a, ctx) {
  const { w, d } = ctx.footprint;
  const ov = a.overhang ?? 0;
  const axis = a.ridgeAxis ?? (w >= d ? 'x' : 'z');
  b.prism(w + 2 * ov, a.rise, d + 2 * ov, 0, ctx.topY + a.rise / 2, 0, { mat: ctx.mat ?? ctx.materials?.roof, axis, collide: ctx.collide });
}

// Hip (valbová): central gable prism + two sloped end wedges. v1 approximation: the end
// wedges slope only on the end face (sides stay vertical) — a near-pyramid on square
// footprints; flagged for the round-1 visual check in the viewer.
export function hipRoof(b, a, ctx) {
  const { w, d } = ctx.footprint;
  const ov = a.overhang ?? 0;
  const mat = ctx.mat ?? ctx.materials?.roof;
  const y = ctx.topY;
  const W = w + 2 * ov, D = d + 2 * ov;
  const axis = W >= D ? 'x' : 'z';
  const longLen = Math.max(W, D), shortLen = Math.min(W, D);
  const hipRun = Math.min(shortLen / 2, longLen / 2 - 0.05);   // equal pitch all round; clamp for near-square
  const midLen = longLen - 2 * hipRun;
  if (axis === 'x') {
    b.prism(midLen, a.rise, D, 0, y + a.rise / 2, 0, { mat, axis: 'x', collide: ctx.collide });
    b.wedge(hipRun, a.rise, D, -(midLen / 2 + hipRun / 2), y + a.rise / 2, 0, { mat, axis: 'z', hi: 'E', collide: ctx.collide });
    b.wedge(hipRun, a.rise, D, +(midLen / 2 + hipRun / 2), y + a.rise / 2, 0, { mat, axis: 'z', hi: 'W', collide: ctx.collide });
  } else {
    b.prism(W, a.rise, midLen, 0, y + a.rise / 2, 0, { mat, axis: 'z', collide: ctx.collide });
    b.wedge(W, a.rise, hipRun, 0, y + a.rise / 2, -(midLen / 2 + hipRun / 2), { mat, axis: 'x', hi: 'N', collide: ctx.collide });
    b.wedge(W, a.rise, hipRun, 0, y + a.rise / 2, +(midLen / 2 + hipRun / 2), { mat, axis: 'x', hi: 'S', collide: ctx.collide });
  }
}

// Sawtooth (pilová, цех north-light): teeth march south→north along Z, each a wedge rising
// to its NORTH edge where the (optionally glazed) vertical face catches the even north light.
export function sawtoothRoof(b, a, ctx) {
  const { w, d } = ctx.footprint;
  const mat = ctx.mat ?? ctx.materials?.roof;
  const y = ctx.topY;
  const depth = d / a.teeth;
  for (let i = 0; i < a.teeth; i++) {
    const zc = -d / 2 + depth * (i + 0.5);
    b.wedge(w, a.rise, depth, 0, y + a.rise / 2, zc, { mat, axis: 'x', hi: 'N', collide: ctx.collide });
    if (a.glazed) {
      b.pane(w - 0.2, a.rise - 0.1, 0, y + a.rise / 2, zc + depth / 2 - 0.01, { mat: ctx.materials?.glass, ry: 0, pid: `glz:${i}` });
    }
  }
}

// Parapet ring on a flat roof (collidable — keeps players from walking off; corner policy
// mirrors shellBox: N/S full width, E/W between them). It sits ON the roof slab
// (args.lift ≈ the flatRoof thickness, default 0.2) and is inset 1 cm from the slab edges,
// so no parapet face ever shares a plane with the slab (z-fight law).
export function parapet(b, a, ctx) {
  const { w, d } = ctx.footprint;
  const E = 0.01;
  const mat = ctx.mat ?? ctx.materials?.trim;
  const y = ctx.topY + (a.lift ?? 0.2);
  const W = w - 2 * E, D = d - 2 * E;
  b.box(W, a.h, a.t, 0, y + a.h / 2, D / 2 - a.t / 2, { mat, collide: ctx.collide });
  b.box(W, a.h, a.t, 0, y + a.h / 2, -(D / 2 - a.t / 2), { mat, collide: ctx.collide });
  b.box(a.t, a.h, D - 2 * a.t, W / 2 - a.t / 2, y + a.h / 2, 0, { mat, collide: ctx.collide });
  b.box(a.t, a.h, D - 2 * a.t, -(W / 2 - a.t / 2), y + a.h / 2, 0, { mat, collide: ctx.collide });
}
