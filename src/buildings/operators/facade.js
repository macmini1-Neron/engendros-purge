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

// One master window module (frame strips lining the reveal + optional glass pane), ×count.
// The frame sits INSIDE the opening (lining the cut), so every frame↔wall contact is
// opposite-normal coplanar — the safe kind. Strips never share a plane with a wall cut face.
export function windowBays(b, a, ctx) {
  const f = faceFrame(a.face, ctx.footprint, ctx.wallT);
  const opens = openingsOf({ op: 'windowBays', args: a }, f, { storeys: ctx.storeys });
  const matFrame = ctx.mat ?? ctx.materials?.trim;
  const FD = Math.min(0.10, ctx.wallT * 0.4);                    // frame depth into the reveal
  let bay = 0;
  for (const o of opens) {
    const w = o.u1 - o.u0, h = o.v1 - o.v0;
    const uc = (o.u0 + o.u1) / 2, vc = (o.v0 + o.v1) / 2;
    // frame straddles the OUTER wall face: embedded FD−4 mm, proud 4 mm
    const zc = f.fixed + f.out * (f.t / 2 - FD / 2 + PROUD);
    const strip = (su, sv, sw, sh) => {                          // centred at face coords (su,sv)
      const [px, , pz] = faceToWorld(f, su, sv);
      if (f.axis === 'x') b.box(sw, sh, FD, px, sv, zc, { mat: matFrame, detail: true, collide: false });
      else b.box(FD, sh, sw, zc, sv, pz, { mat: matFrame, detail: true, collide: false });
    };
    strip(uc, o.v1 - FRAME_T / 2, w, FRAME_T);                   // head, inside the opening top
    strip(uc, o.v0 + FRAME_T / 2, w, FRAME_T);                   // sill board, inside the opening bottom
    strip(o.u0 + FRAME_T / 2, vc, FRAME_T, h - 2 * FRAME_T);     // jambs, between head and sill
    strip(o.u1 - FRAME_T / 2, vc, FRAME_T, h - 2 * FRAME_T);
    if (a.glass) {                                               // pane at the wall centreline, inside the frame
      const [px, , pz] = faceToWorld(f, uc, vc);
      b.pane(w - 2 * FRAME_T, h - 2 * FRAME_T, f.axis === 'x' ? px : f.fixed, vc, f.axis === 'x' ? f.fixed : pz,
        { mat: ctx.materials?.glass, ry: f.axis === 'x' ? 0 : 90, pid: `pane:${bay}` });   // each pane breaks alone
    }
    bay++;
  }
}

// Walkable entrance — the gap itself lives in the wallcut; emit just a threshold plate.
// Narrower than the gap and lifted 1 mm, so it never shares a plane with the jambs' cut
// faces or the wall/slab bottoms (z-fight law).
export function doorway(b, a, ctx) {
  const f = faceFrame(a.face, ctx.footprint, ctx.wallT);
  const uc = f.L / 2 + (a.offset ?? 0);
  const [x, , z] = faceToWorld(f, uc, 0);
  const th = 0.04, lift = 0.001, wTh = a.width - 0.01;
  if (f.axis === 'x') b.box(wTh, th, f.t + 0.06, x, lift + th / 2, z, { mat: ctx.mat ?? ctx.materials?.trim, detail: true, collide: false });
  else b.box(f.t + 0.06, th, wTh, x, lift + th / 2, z, { mat: ctx.mat ?? ctx.materials?.trim, detail: true, collide: false });
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

// Vertical pilaster strips, evenly spaced across a face, proud of the wall. They stop 0.3 m
// short of the top (under the cornice line) — running to topY would put their top faces in
// the cornice's plane (z-fight law caught exactly this).
export function pilaster(b, a, ctx) {
  const f = faceFrame(a.face, ctx.footprint, ctx.wallT);
  const mat = ctx.mat ?? ctx.materials?.trim;
  const H = a.h ?? (ctx.topY - 0.3);
  const gap = (f.L - a.count * a.w) / (a.count + 1);
  for (let i = 0; i < a.count; i++) {
    const uc = gap * (i + 1) + a.w * i + a.w / 2;
    const [x, , z] = faceToWorld(f, uc, H / 2);
    const off = f.out * (f.t / 2 + a.proud / 2);
    if (f.axis === 'x') b.box(a.w, H, a.proud, x, H / 2, z + off, { mat, detail: true, collide: false });
    else b.box(a.proud, H, a.w, x + off, H / 2, z, { mat, detail: true, collide: false });
  }
}
