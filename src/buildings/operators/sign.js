// sign.js — Cyrillic signage operators (pure; interp paints the CanvasTexture from opts.text).
// Both stand proud of the wall plane per the z-fight law (~4 mm + their own depth).
import { faceFrame, faceToWorld } from './_math.js';

const PROUD = 0.004;

function placeOnFace(b, a, ctx, depth, detail) {
  const f = faceFrame(a.face, ctx.footprint, ctx.wallT);
  const uc = f.L / 2 + (a.offset ?? 0);
  const vc = a.v ?? (ctx.topY * 0.78);                  // default: high on the wall, under the cornice line
  const [x, , z] = faceToWorld(f, uc, vc);
  const off = f.out * (f.t / 2 + PROUD + depth / 2);
  const opts = { mat: a.mat ?? 'signage', text: a.text, detail, collide: false };
  if (f.axis === 'x') b.box(a.w, a.h, depth, x, vc, z + off, opts);
  else b.box(depth, a.h, a.w, x + off, vc, z, opts);
}

// Board sign (ПРОХОДНАЯ / ЗАВОДОУПРАВЛЕНИЕ): a real board, 4 cm deep.
export function sign(b, a, ctx) { placeOnFace(b, a, ctx, 0.04, false); }

// Stencilled paint (ЦЕХ №3, ОПАСНО): an 8 mm appliqué.
export function stencil(b, a, ctx) { placeOnFace(b, a, ctx, 0.008, true); }
