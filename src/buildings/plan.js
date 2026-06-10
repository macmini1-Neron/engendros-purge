// plan.js — the buildgen compiler (pure; no THREE). Spec → neutral prim records +
// derived AABB colliders + budget stats. interp.js realizes the prims in the browser;
// the validator (spec.js) runs the laws over this output.
//
// Passes: 1 repeat-macro expansion → 2 opening gather per face → 3 emit (with part-rot
// handling) → 4 colliders from collide prims → 5 stats (tris, materials, counts).
import { OPS } from './operators/index.js';
import { MANIFEST } from './operators/manifest.js';
import { openingsOf } from './operators/facade.js';
import { faceFrame, specTopY } from './operators/_math.js';

const TRIS = { box: 12, wedge: 8, prism: 8, pane: 2 };
const OPENING_OPS = new Set(['doorway', 'windowBays', 'gateOpening']);

export function planBuild(spec) {
  const errors = [];
  const prims = [];

  // 1. expand `repeat` macros into N stepped copies of their part
  const parts = [];
  for (const p of spec.parts ?? []) {
    if (p.op !== 'repeat') { parts.push(p); continue; }
    const a = p.args ?? {};
    if (!a.part?.op || !Number.isInteger(a.count) || a.count < 1) {
      errors.push(`${p.id ?? 'repeat'}: needs args.count ≥ 1 and args.part {op,…}`);
      continue;
    }
    const step = a.step ?? [0, 0, 0];
    const base = a.part.at ?? [0, 0, 0];
    for (let i = 0; i < a.count; i++) {
      parts.push({
        ...a.part,
        at: [base[0] + step[0] * i, base[1] + step[1] * i, base[2] + step[2] * i],
        id: `${a.part.id ?? a.part.op}#${i}`,
      });
    }
  }

  // 2. gather every opening's cut rectangles per face (consumed by shellBox's wallcut)
  const shell = parts.find((p) => p.op === 'shellBox');
  const wallT = shell?.args?.wall ?? 0.3;
  const byFace = { N: [], S: [], E: [], W: [] };
  if (spec.footprint) {
    for (const p of parts) {
      if (!OPENING_OPS.has(p.op)) continue;
      const face = p.args?.face;
      if (!byFace[face]) { errors.push(`${p.id ?? p.op}: unknown face '${face}' (use N/S/E/W)`); continue; }
      byFace[face].push(...openingsOf(p, faceFrame(face, spec.footprint, wallT), spec));
    }
  }

  // 3. emit each part through the recorder
  const topY = specTopY(spec);
  for (const p of parts) {
    const op = OPS[p.op], m = MANIFEST[p.op];
    if (!op || !m) { errors.push(`unknown operator '${p.op}'`); continue; }
    const pid = p.id ?? p.op;
    const push = (rec) => prims.push(rec);
    const b = {
      box: (w, h, d, x, y, z, o = {}) => push({ kind: 'box', w, h, d, x, y, z, mat: o.mat, collide: o.collide ?? false, detail: o.detail ?? false, text: o.text, part: pid }),
      wedge: (w, h, d, x, y, z, o = {}) => push({ kind: 'wedge', w, h, d, x, y, z, mat: o.mat, axis: o.axis ?? 'x', hi: o.hi ?? 'N', collide: o.collide ?? false, part: pid }),
      prism: (w, h, d, x, y, z, o = {}) => push({ kind: 'prism', w, h, d, x, y, z, mat: o.mat, axis: o.axis ?? 'x', collide: o.collide ?? false, part: pid }),
      cyl: (rBot, rTop, h, x, y, z, o = {}) => push({ kind: 'cyl', rBot, rTop, h, x, y, z, mat: o.mat, collide: o.collide ?? false, seg: o.seg ?? 12, detail: o.detail ?? false, part: pid }),
      pane: (w, h, x, y, z, o = {}) => push({ kind: 'pane', w, h, x, y, z, mat: o.mat, ry: o.ry ?? 0, lean: o.lean ?? 0, collide: false, part: pid }),
      propRef: (model, x, y, z, yaw = 0) => push({ kind: 'propRef', model, x, y, z, yaw, part: pid }),
      error: (msg) => errors.push(`${pid}: ${msg}`),
    };
    const before = prims.length;
    const ctx = {
      origin: { x: p.at?.[0] ?? 0, y: p.at?.[1] ?? 0, z: p.at?.[2] ?? 0 },
      mat: p.mat ?? null,
      footprint: spec.footprint ?? { w: 1, h: 1, d: 1 },
      storeys: spec.storeys ?? [{ y: 0, h: 3.0 }],
      materials: spec.materials ?? {},
      topY, wallT,
      openings: (face) => byFace[face] ?? [],
      collide: p.collide ?? m.collide,
    };
    op(b, p.args ?? {}, ctx);

    // part-level rot: only [0, k·90°, 0] on box/cyl prims (exact swap — colliders stay honest)
    const rot = p.rot;
    if (rot && (rot[0] || rot[1] || rot[2])) {
      if (rot[0] || rot[2] || ((rot[1] % 90) + 90) % 90 !== 0) {
        errors.push(`${pid}: rot [${rot}] unsupported — buildgen v1 allows only [0, k·90, 0]; use face/axis/dir args for orientation`);
      } else {
        const k = ((Math.round(rot[1] / 90) % 4) + 4) % 4;
        const o = ctx.origin;
        for (let i = before; i < prims.length; i++) {
          const c = prims[i];
          if (c.kind !== 'box' && c.kind !== 'cyl') { errors.push(`${pid}: rot on a '${c.kind}' prim is unsupported in v1`); continue; }
          let dx = c.x - o.x, dz = c.z - o.z;
          for (let s = 0; s < k; s++) [dx, dz] = [dz, -dx];     // (x,z) → (z,−x) per 90° step
          c.x = o.x + dx; c.z = o.z + dz;
          if (c.kind === 'box' && k % 2 === 1) [c.w, c.d] = [c.d, c.w];
        }
      }
    }
  }

  // 4. colliders — AABBs from collide prims (boxes exact; cyls take their bounding square)
  const colliders = [];
  for (const c of prims) {
    if (!c.collide) continue;
    if (c.kind === 'box') {
      colliders.push({ min: [c.x - c.w / 2, c.y - c.h / 2, c.z - c.d / 2], max: [c.x + c.w / 2, c.y + c.h / 2, c.z + c.d / 2], part: c.part });
    } else if (c.kind === 'cyl') {
      const r = Math.max(c.rBot, c.rTop);
      colliders.push({ min: [c.x - r, c.y - c.h / 2, c.z - r], max: [c.x + r, c.y + c.h / 2, c.z + r], part: c.part });
    } else {
      errors.push(`${c.part}: collide on a '${c.kind}' prim is unsupported — AABB colliders only (angled roofs are visual)`);
    }
  }

  // 5. stats for the law-14 budget
  const tris = prims.reduce((t, c) => t + (c.kind === 'cyl' ? 4 * c.seg : TRIS[c.kind] ?? 0), 0);
  const materials = [...new Set(prims.filter((c) => c.kind !== 'propRef' && c.mat).map((c) => c.mat))];
  const propRefs = prims.filter((c) => c.kind === 'propRef');

  return {
    id: spec.id,
    prims,
    colliders,
    propRefs,
    stats: { tris, materials, colliderCount: colliders.length, primCount: prims.length },
    errors,
  };
}
