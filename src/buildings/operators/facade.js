// facade.js — opening + facade-detail operators (pure).
//
// Openings do NOT emit walls — they publish their cut rectangles via openingsOf(), which the
// plan compiler gathers per face and feeds to shellBox's wallcut. What they DO emit is the
// dressing: window frames, sills, glass panes, thresholds. The "zub" law applies: one master
// window module, duplicated ×count — never N hand-placed near-copies.
import { faceFrame, faceToWorld } from './_math.js';

const FRAME_T = 0.06;    // window frame strip width
const PROUD = 0.004;     // how far detail stands off the wall plane (z-fight law)

// The cut rectangles (face coords) a part contributes to its wall. Pure — used by the
// compiler AND by tests; keep it in lockstep with what the emitters dress.
export function openingsOf(part, frame, spec) {
  const a = part.args ?? {};
  const id = part.id ?? part.op;
  if (part.op === 'doorway' || part.op === 'gateOpening') {
    const uc = frame.L / 2 + (a.offset ?? 0);
    return [{ u0: uc - a.width / 2, u1: uc + a.width / 2, v0: 0, v1: a.height, id }];
  }
  if (part.op === 'windowBays') {
    const m = a.module;
    const storeY = spec?.storeys?.[a.storey ?? 0]?.y ?? 0;
    const gap = (frame.L - a.count * m.w) / (a.count + 1);
    const out = [];
    for (let i = 0; i < a.count; i++) {
      const u0 = gap * (i + 1) + m.w * i + (a.offset ?? 0);
      out.push({ u0, u1: u0 + m.w, v0: storeY + m.sill, v1: storeY + m.sill + m.h, id: `${id}#${i}` });
    }
    return out;
  }
  return [];
}

// One master window module (frame strips + sill ledge + optional glass pane), duplicated ×count.
export function windowBays(b, a, ctx) {
  const f = faceFrame(a.face, ctx.footprint, ctx.wallT);
  const opens = openingsOf({ op: 'windowBays', args: a }, f, { storeys: ctx.storeys });
  const matFrame = ctx.mat ?? ctx.materials?.trim;
  for (const o of opens) {
    const w = o.u1 - o.u0, h = o.v1 - o.v0;
    const uc = (o.u0 + o.u1) / 2, vc = (o.v0 + o.v1) / 2;
    const [cx, , cz] = faceToWorld(f, uc, vc);
    const off = f.out * (f.t / 2 + PROUD);                       // frame face proud of the wall plane
    const fx = f.axis === 'x' ? cx : cx + off;
    const fz = f.axis === 'x' ? cz + off : cz;
    const strip = (sw, sh, su, sv) => {                          // frame strip centred at face coords (su,sv)
      const [px, , pz] = faceToWorld(f, su, sv);
      if (f.axis === 'x') b.box(sw, sh, FRAME_T, px, sv, fz, { mat: matFrame, detail: true, collide: false });
      else b.box(FRAME_T, sh, sw, fx, sv, pz, { mat: matFrame, detail: true, collide: false });
    };
    strip(w + 2 * FRAME_T, FRAME_T, uc, o.v1 + FRAME_T / 2);     // lintel strip
    strip(w + 2 * FRAME_T, FRAME_T, uc, o.v0 - FRAME_T / 2);     // sill strip
    strip(FRAME_T, h, o.u0 - FRAME_T / 2, vc);                   // west/south jamb strip
    strip(FRAME_T, h, o.u1 + FRAME_T / 2, vc);                   // east/north jamb strip
    if (a.glass) {                                               // pane at the wall centreline, inside the gap
      b.pane(w - 0.06, h - 0.06, f.axis === 'x' ? cx : f.fixed, vc, f.axis === 'x' ? f.fixed : cz,
        { mat: ctx.materials?.glass, ry: f.axis === 'x' ? 0 : 90 });
    }
  }
}

// Walkable entrance — the gap itself lives in the wallcut; emit just a threshold plate.
export function doorway(b, a, ctx) {
  const f = faceFrame(a.face, ctx.footprint, ctx.wallT);
  const uc = f.L / 2 + (a.offset ?? 0);
  const [x, , z] = faceToWorld(f, uc, 0);
  const th = 0.04;
  if (f.axis === 'x') b.box(a.width + 0.2, th, f.t + 0.06, x, th / 2, z, { mat: ctx.mat ?? ctx.materials?.trim, detail: true, collide: false });
  else b.box(f.t + 0.06, th, a.width + 0.2, x, th / 2, z, { mat: ctx.mat ?? ctx.materials?.trim, detail: true, collide: false });
}

// Vehicle gate — pure gap in v1 (doors/rails are interactive hooks, out of harness scope).
export function gateOpening() { /* the opening rect is the whole contribution */ }

// Crown moulding ring under the roof line, proud of the walls. Corner policy: N/S bands span
// the full width incl. proudness; E/W bands run between them (top faces touch, never overlap).
export function cornice(b, a, ctx) {
  const { w, d } = ctx.footprint;
  const mat = ctx.mat ?? ctx.materials?.trim;
  const y = ctx.topY - a.h / 2;
  const p = a.proud;
  b.box(w + 2 * p, a.h, p, 0, y, d / 2 + p / 2, { mat, detail: true, collide: false });
  b.box(w + 2 * p, a.h, p, 0, y, -(d / 2 + p / 2), { mat, detail: true, collide: false });
  b.box(p, a.h, d, w / 2 + p / 2, y, 0, { mat, detail: true, collide: false });
  b.box(p, a.h, d, -(w / 2 + p / 2), y, 0, { mat, detail: true, collide: false });
}

// Vertical pilaster strips, evenly spaced across a face, full height, proud of the wall.
export function pilaster(b, a, ctx) {
  const f = faceFrame(a.face, ctx.footprint, ctx.wallT);
  const mat = ctx.mat ?? ctx.materials?.trim;
  const gap = (f.L - a.count * a.w) / (a.count + 1);
  for (let i = 0; i < a.count; i++) {
    const uc = gap * (i + 1) + a.w * i + a.w / 2;
    const [x, , z] = faceToWorld(f, uc, ctx.topY / 2);
    const off = f.out * (f.t / 2 + a.proud / 2);
    if (f.axis === 'x') b.box(a.w, ctx.topY, a.proud, x, ctx.topY / 2, z + off, { mat, detail: true, collide: false });
    else b.box(a.proud, ctx.topY, a.w, x + off, ctx.topY / 2, z, { mat, detail: true, collide: false });
  }
}
