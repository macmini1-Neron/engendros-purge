// shell.js — shell/massing operators (pure, no THREE; node-testable).
//
// Operator signature (buildgen-specific — shell/face ops need spec context, unlike
// modelgen's (b, args, tones, origin)):
//   op(b, args, ctx)
//   b   = recorder: .box(w,h,d,x,y,z,opts) .wedge .prism .cyl .pane .propRef .error(msg)
//         (opts carries {mat, collide, detail}; positions are LOCAL building space)
//   ctx = { origin:{x,y,z}, mat,            // resolved part-level material override (or null)
//           footprint:{w,h,d}, storeys, materials, topY, wallT,
//           openings: (face) => [{u0,u1,v0,v1,id}],   // gathered by the plan compiler
//           collide }                       // resolved collide default for this part
import { faceFrame, faceToWorld, DIRV } from './_math.js';
import { cutWall } from '../wallcut.js';

export const BASE_SLAB_T = 0.10;   // storey-0 floor: y ∈ [0, BASE_SLAB_T] — floor-anchored specs touch y=0
export const SLAB_T = 0.15;        // upper floor slabs: top surface AT the storey's base elevation
export const SEG_TARGET = 1.7;     // target breach-segment width (m) — one removable wall slice ≈ a walkable hole

// Split a wall-segment u-span into ~SEG_TARGET breach pieces (deterministic; no RNG → co-op-safe).
function breachPieces(u0, u1, segW) {
  const n = Math.max(1, Math.round((u1 - u0) / segW));
  const sw = (u1 - u0) / n;
  const out = [];
  for (let k = 0; k < n; k++) out.push([u0 + k * sw, u0 + (k + 1) * sw]);
  return out;
}

// Closed exterior shell: 4 walls cut around the gathered openings + the storey-0 base slab.
// Corner policy (_math.faceFrame): N/S walls run full w; E/W run d − 2·wall between them.
//
// DESTRUCTION: each wall is cut by wallcut, then every solid segment is sub-divided into
// ~SEG_TARGET breach pieces (args.segW overrides) so HE removes a wall SLICE → a walkable hole,
// mirroring demobuilding's breach segments. Each piece is an independently-destructible part with
// a stable deterministic id `${pid}:${face}:seg${k}`. The base slab is pinned STRUCTURAL (always
// holds the storey-0 floor). With `corners:'structural'` (default), every breach piece that
// touches a wall END (u≈0 or u≈L) is pinned structural too — the corner stacks (jamb+lintel)
// stay standing to hold the roof even after the whole wall field is stripped (the
// out-of-the-box roof-support guarantee; set `corners:'cladding'` + add `column` parts to opt out).
export function shellBox(b, a, ctx) {
  const { w, d } = ctx.footprint;
  const t = a.wall;
  const matWall = ctx.mat ?? ctx.materials?.wall;
  // breach subdivision only earns its colliders on a destructible building; otherwise one box per
  // wall segment (segW = ∞ ⇒ a single piece), keeping non-destructible shells lean.
  const segW = ctx.destructible === false ? Infinity : (a.segW ?? SEG_TARGET);
  const cornerStructural = (a.corners ?? 'structural') === 'structural';
  const EPS = 1e-6;
  for (const face of ['N', 'S', 'W', 'E']) {
    const f = faceFrame(face, ctx.footprint, t);
    const { segments, errors } = cutWall({ L: f.L, H: ctx.topY }, ctx.openings?.(face) ?? []);
    for (const e of errors) b.error?.(`shellBox ${face}: ${e}`);
    let k = 0;
    for (const s of segments) {
      const lv = s.v1 - s.v0;
      for (const [pu0, pu1] of breachPieces(s.u0, s.u1, segW)) {
        const [x, y, z] = faceToWorld(f, (pu0 + pu1) / 2, (s.v0 + s.v1) / 2);
        const lu = pu1 - pu0;
        const atEnd = pu0 <= EPS || pu1 >= f.L - EPS;
        const role = cornerStructural && atEnd ? 'structural' : undefined;   // undefined → inherit ctx.role
        const o = { mat: matWall, collide: ctx.collide, role, pid: `${face}:seg${k}` };
        if (f.axis === 'x') b.box(lu, lv, t, x, y, z, o);
        else b.box(t, lv, lu, x, y, z, o);
        k++;
      }
    }
  }
  // base slab = the storey-0 floor (law 3). INNER footprint so its bottom face never shares
  // the walls' bottom plane (same-normal coplanar = z-fight); edge↔wall contact is
  // opposite-normal, which is safe. Pinned STRUCTURAL — the floor is never destructible.
  b.box(w - 2 * t, BASE_SLAB_T, d - 2 * t, 0, BASE_SLAB_T / 2, 0,
    { mat: ctx.materials?.floor ?? matWall, collide: ctx.collide, role: 'structural', pid: 'base' });
}

// Upper-storey floor slab (storey ≥ 1; storey 0 is the shellBox base). Top surface sits AT
// storeys[k].y. Optional args.hole {x,z,w,d} (stairwell) → 4-piece split, world._floor pattern.
export function floorSlab(b, a, ctx) {
  const { w, d } = ctx.footprint;
  const t = ctx.wallT ?? 0.3;
  const st = ctx.storeys?.[a.storey];
  if (!st) { b.error?.(`floorSlab: storey ${a.storey} not declared in spec.storeys`); return; }
  if (a.storey === 0) { b.error?.('floorSlab: storey 0 is the shellBox base slab — remove this part'); return; }
  const mat = ctx.mat ?? ctx.materials?.floor ?? ctx.materials?.trim;
  const iw = w - 2 * t, idp = d - 2 * t;
  const yC = st.y - SLAB_T / 2;
  const collide = ctx.collide;
  const hole = a.hole;
  if (!hole) { b.box(iw, SLAB_T, idp, 0, yC, 0, { mat, collide }); return; }
  const x0 = -iw / 2, x1 = iw / 2, z0 = -idp / 2, z1 = idp / 2;
  const hx0 = hole.x - hole.w / 2, hx1 = hole.x + hole.w / 2;
  const hz0 = hole.z - hole.d / 2, hz1 = hole.z + hole.d / 2;
  const sS = hz0 - z0; if (sS > 0.05) b.box(iw, SLAB_T, sS, 0, yC, z0 + sS / 2, { mat, collide });          // south strip
  const nS = z1 - hz1; if (nS > 0.05) b.box(iw, SLAB_T, nS, 0, yC, z1 - nS / 2, { mat, collide });          // north strip
  const midD = Math.min(hz1, z1) - Math.max(hz0, z0), midZ = (Math.max(hz0, z0) + Math.min(hz1, z1)) / 2;
  const wW = hx0 - x0; if (wW > 0.05) b.box(wW, SLAB_T, midD, x0 + wW / 2, yC, midZ, { mat, collide });     // west of hole
  const eW = x1 - hx1; if (eW > 0.05) b.box(eW, SLAB_T, midD, x1 - eW / 2, yC, midZ, { mat, collide });     // east of hole
}

// Interior partition wall (solid in v1 — exits are counted on the shell). Floor-anchored at
// origin, with a 2 mm seat lift so its bottom never shares the base slab's bottom plane
// (authors naturally write at:[x,0,z]; without the lift that is a guaranteed z-fight).
const SEAT = 0.002;
export function interiorWall(b, a, ctx) {
  const o = ctx.origin;
  const mat = ctx.mat ?? ctx.materials?.wall;
  if (a.axis === 'x') b.box(a.len, a.h, a.t, o.x, o.y + SEAT + a.h / 2, o.z, { mat, collide: ctx.collide });
  else b.box(a.t, a.h, a.len, o.x, o.y + SEAT + a.h / 2, o.z, { mat, collide: ctx.collide });
}

// Structural column, floor-anchored at origin (same 2 mm seat lift).
export function column(b, a, ctx) {
  const o = ctx.origin;
  b.box(a.w, a.h, a.d, o.x, o.y + SEAT + a.h / 2, o.z, { mat: ctx.mat ?? ctx.materials?.trim, collide: ctx.collide });
}

// Straight stair flight — N stacked boxes, each FULL height from the base ((i+1)·rise), so the
// player's ≤0.62 m step-up collision climbs them with no special-casing (world._stairs pattern).
// origin = foot of the flight (floor-anchored, centre of the first step's leading edge); marches
// `dir`. The same 2 mm seat lift keeps the step bottoms off the floor/ground plane.
export function stairs(b, a, ctx) {
  const o = ctx.origin;
  const [dx, dz] = DIRV[a.dir] ?? DIRV.N;
  const mat = ctx.mat ?? ctx.materials?.trim;
  for (let i = 0; i < a.steps; i++) {
    const hY = (i + 1) * a.rise;
    const cx = o.x + dx * a.run * (i + 0.5);
    const cz = o.z + dz * a.run * (i + 0.5);
    b.box(dx !== 0 ? a.run : a.width, hY, dz !== 0 ? a.run : a.width, cx, o.y + SEAT + hY / 2, cz, { mat, collide: ctx.collide });
  }
}
