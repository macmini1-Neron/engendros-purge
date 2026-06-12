// spec.js — the buildgen validator: the 14 laws, machine-enforced (pure; no THREE, no fs).
// Mirrors src/props/spec.js but with diagnostic LEVELS:
//   ERROR — cannot be approved.   WARN — allowed only with a BUILD.md justification.
//   INFO  — advisory.
// validate(spec, opts) → { errors, warns, infos }; validateSpec throws on errors
// (modelgen-compatible — interp uses it as the hard gate).
//
// opts.dossier — parsed ref/dossier.json (law 9); `_`-prefixed fixture ids skip it.
// opts.props   — injected resolver { hasModel(id), getSpec(id) } for law 12
//                (fs-based in lint, fetch/registry-based in the viewer; this module stays pure).
import { MANIFEST } from './operators/manifest.js';
import { boundsErrors } from './bounds.js';
import { planBuild, zFightPairs } from './plan.js';
import { resolveMaterial } from './palette.js';
import { specTopY, faceFrame, faceToWorld } from './operators/_math.js';
import { openingsOf } from './operators/facade.js';

const SRC = /^dossier#[\w.\-/]+$/;
const MAX_DIM_DEFAULT = 60;          // buildings, not props (modelgen uses 12)
const MAX_DIM_ABSOLUTE = 150;
const MM_SUSPECT = 200;              // a 200+ "metre" building dimension reads as millimetres

// Resolve "dossier#key" / "dossier#a.b.c": exact dotted path, else deep search for the final
// segment. (Deliberately duplicated from src/props/spec.js — no modelgen coupling.)
export function resolveDossierKey(dossier, src) {
  const path = src.slice('dossier#'.length).split('.');
  let node = dossier;
  for (const seg of path) { node = node?.[seg]; if (node === undefined) break; }
  if (node !== undefined) return true;
  const last = path[path.length - 1];
  const seen = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object' || seen.has(n)) return false;
    seen.add(n);
    if (!Array.isArray(n) && Object.prototype.hasOwnProperty.call(n, last)) return true;
    return Object.values(n).some(walk);
  };
  return walk(dossier);
}

const ROOF_COVER_OPS = new Set(['flatRoof', 'gableRoof', 'hipRoof', 'sawtoothRoof']);
const ENTRANCE_OPS = new Set(['doorway', 'gateOpening']);

function numbersIn(v, out = []) {
  if (typeof v === 'number') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => numbersIn(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => numbersIn(x, out));
  return out;
}

export function validate(spec, opts = {}) {
  const errors = [], warns = [], infos = [];
  const E = (m) => errors.push(m), W = (m) => warns.push(m), I = (m) => infos.push(m);
  const fixture = typeof spec?.id === 'string' && spec.id.startsWith('_');

  // ---- structure + law 1 (metres / footprint / maxDim) ----
  if (!spec || typeof spec !== 'object') return { errors: ['spec must be an object'], warns, infos };
  if (!spec.id) E('spec.id is required');
  if (!Array.isArray(spec.parts) || !spec.parts.length) E('spec.parts must be a non-empty array');
  const maxDim = Math.min(spec.maxDim ?? MAX_DIM_DEFAULT, MAX_DIM_ABSOLUTE);
  const f = spec.footprint;
  if (!f || !['w', 'h', 'd'].every((k) => typeof f[k] === 'number' && f[k] > 0)) {
    E('spec.footprint {w,h,d} (metres) is required — it is the collider/placement box AND the scale sanity check');
  } else {
    for (const k of ['w', 'h', 'd']) {
      if (f[k] > MM_SUSPECT) E(`footprint.${k}=${f[k]} looks like MILLIMETRES — building dimensions are METRES (${f[k]} mm would be ${(f[k] / 1000).toFixed(2)})`);
      else if (f[k] > maxDim) E(`footprint.${k}=${f[k]} m exceeds the ${maxDim} m building limit (raise spec.maxDim only for genuine landmarks)`);
    }
  }
  if (Array.isArray(spec.storeys)) {
    let prevTop = 0;
    spec.storeys.forEach((s, i) => {
      if (typeof s?.y !== 'number' || typeof s?.h !== 'number' || s.h <= 0) E(`storeys[${i}] must be {y, h} in metres`);
      else { if (Math.abs(s.y - prevTop) > 0.01) E(`storeys[${i}].y=${s.y} does not stack on the storey below (expected ${prevTop.toFixed(2)})`); prevTop = s.y + s.h; }
    });
  }
  if (errors.length) return { errors, warns, infos };       // structure is broken — laws below would cascade

  const parts = spec.parts;
  const shell = parts.find((p) => p.op === 'shellBox');
  const wallT = shell?.args?.wall ?? 0.3;
  const topY = specTopY(spec);
  const intent = spec.intent ?? {};

  // ---- per-part: op known, args present, metres, law 2, law 5 (axis-aligned), law 9 (src) ----
  let needDossier = false;
  parts.forEach((p, i) => {
    const at = `parts[${i}] (${p.id ?? p.op ?? '?'})`;
    const m = MANIFEST[p.op];
    if (!p.op || !m) { E(`${at}: unknown operator '${p.op}'`); return; }
    for (const a of m.args) {
      if (p.op === 'repeat') break;                          // macro args checked by the compiler
      if (p.args?.[a] == null) E(`${at}: operator '${p.op}' missing arg '${a}'`);
    }
    for (const n of numbersIn(p.args)) {
      if (Math.abs(n) > MM_SUSPECT) E(`${at}: ${n} looks like MILLIMETRES — spec dimensions are METRES`);
      else if (Math.abs(n) > maxDim) E(`${at}: ${n} m exceeds the ${maxDim} m building limit`);
    }
    if (m.family === 'shell') {
      if (p.detail) E(`${at}: 'detail:true' on a structural shell part is a bypass of the wall-thickness law — remove it`);
      if (p.rot && (p.rot[0] || p.rot[1] || p.rot[2]) && p.op === 'shellBox') E(`${at}: the shell is axis-aligned — shellBox cannot rotate (place the whole building with yaw instead)`);
    }
    if (p.op === 'shellBox' && p.args?.wall < 0.2) E(`${at}: wall thickness ${p.args.wall} m < 0.2 m — single-pixel walls are what this harness exists to kill`);
    if (p.op === 'interiorWall' && p.args?.t < 0.2) E(`${at}: interior wall t=${p.args.t} m < 0.2 m`);
    if (p.op === 'stairs' && p.args?.rise > 0.62) E(`${at}: stair rise ${p.args.rise} m > 0.62 m step-up — the player cannot climb it`);
    const needsSrc = (m.dims.length > 0 || p.op === 'windowBays') && !fixture;
    if (needsSrc) {
      needDossier = true;
      if (!p.src || !SRC.test(p.src)) E(`${at}: real-world dimensions need 'src: dossier#<key>' provenance (prose is not provenance)`);
      else if (opts.dossier && !resolveDossierKey(opts.dossier, p.src)) E(`${at}: src '${p.src}' does not resolve in the dossier`);
    }
  });
  if (needDossier && !opts.dossier) E(`spec has sourced dimensions but no dossier was provided — research first (ref/dossier.json)`);

  // ---- law 8: materials resolve; seeded determinism for tiled textures ----
  const matNames = new Set(Object.values(spec.materials ?? {}));
  parts.forEach((p) => { if (p.mat) matNames.add(p.mat); });
  let usesTiled = false;
  for (const name of matNames) {
    try { if (resolveMaterial(name).kind === 'tiled') usesTiled = true; }
    catch (e) { E(e.message); }
  }
  if (usesTiled && !Number.isInteger(spec.seed)) {
    E('tiled materials need an integer spec.seed — procedural textures must be DETERMINISTIC (law 8: same spec, pixel-identical render)');
  }

  // ---- compile (laws 3/4/6/7/10/13/14 read the compiled output) ----
  const plan = planBuild(spec);
  plan.errors.forEach((e) => E(`compile: ${e}`));

  // law 5 — footprint discipline over declared extents
  boundsErrors(spec).forEach(E);

  if (shell) {
    // law 3 — every storey has a floor
    const storeys = spec.storeys ?? [{ y: 0, h: 3.0 }];
    const innerArea = (f.w - 2 * wallT) * (f.d - 2 * wallT);
    storeys.forEach((s, k) => {
      if (k === 0) return;                                   // storey 0 = the shellBox base slab
      const slab = parts.find((p) => p.op === 'floorSlab' && p.args?.storey === k);
      if (!slab) { E(`storey ${k} has no covering floorSlab`); return; }
      const hole = slab.args.hole ? slab.args.hole.w * slab.args.hole.d : 0;
      if ((innerArea - hole) < 0.8 * innerArea) E(`storey ${k} floor covers under 80% of the interior (stairwell hole too large)`);
    });

    // law 4 — the roof closes the top (XZ bbox-union cover, v1)
    const covers = parts.filter((p) => ROOF_COVER_OPS.has(p.op));
    if (!covers.length) E('roof does not close the top — add flatRoof/gableRoof/hipRoof/sawtoothRoof (open boxes are the old failure mode)');

    // law 6 — openings
    const entrances = parts.filter((p) => ENTRANCE_OPS.has(p.op));
    if (!entrances.length) E('no walkable entrance — a building needs ≥ 1 doorway/gateOpening (a REAL gap, not a painted door)');
    for (const p of parts.filter((x) => x.op === 'doorway')) {
      const { width, height } = p.args ?? {};
      if (height < 1.8 || width < 0.8) E(`doorway ${p.id ?? ''} ${width}×${height} m is too small for the player`);
      else if (height < 2.1 || height > 2.4 || width < 1.6) W(`doorway ${p.id ?? ''} ${width}×${height} m is outside the FPS-friendly anchors (2.1–2.4 h × ≥1.6 w)`);
    }
    if (parts.some((p) => p.op === 'interiorWall') && entrances.length < 2) {
      E('an interior-walled building needs ≥ 2 exits (no dead-end deathtraps — survival rule)');
    }

    // law 13 — minimal pathing gate (WARN): every entrance reaches another entrance
    if (entrances.length >= 2 && !plan.errors.length) {
      const un = pathingGate(spec, plan, entrances, wallT);
      un.forEach(W);
    }
  } else if (intent.enterable) {
    E("intent.enterable but the spec has no shellBox — there is nothing to enter");
  }

  // law 7 — z-fighting over the compiled boxes
  const zf = zFightPairs(plan.prims.filter((c) => c.kind === 'box'));
  zf.slice(0, 6).forEach((p) => E(`z-fight: '${p.i}' and '${p.j}' share a same-normal coplanar overlapping face on ${p.axis}`));
  if (zf.length > 6) E(`…and ${zf.length - 6} more z-fight pairs`);

  // law 11 — intent coherence
  if (intent.furnitureReady) {
    (spec.storeys ?? [{ y: 0, h: 3 }]).forEach((s, k) => {
      if (s.h < 2.6) E(`intent.furnitureReady but storey ${k} ceiling is ${s.h} m < 2.6 m`);
    });
    if (!Array.isArray(spec.anchorZones) || !spec.anchorZones.length) {
      E('intent.furnitureReady needs spec.anchorZones [{x,z,w,d,storey?}] — where the props will stand');
    }
  }
  if (intent.roofAccess) {
    if (!parts.some((p) => p.op === 'flatRoof' || p.op === 'parapet')) E('intent.roofAccess needs a walkable flatRoof (and ideally a parapet)');
    const reaches = parts.some((p) => p.op === 'stairs' && (p.at?.[1] ?? 0) + p.args.steps * p.args.rise >= topY - 0.62);
    if (!reaches) W('intent.roofAccess: no single stairs flight reaches the roof — verify the multi-flight chain in the viewer (v1 cannot prove chains)');
  }
  if (intent.glassWindows && !parts.some((p) => p.op === 'windowBays' && p.args?.glass)) {
    E('intent.glassWindows but no windowBays has glass:true');
  }

  // law 12 — propRef contract
  const propParts = parts.filter((p) => p.op === 'propRef');
  if (propParts.length) {
    if (!opts.props) I('propRef parts present but no registry resolver injected — props unchecked here (lint/viewer check them)');
    else {
      const zones = spec.anchorZones ?? [];
      for (const p of propParts) {
        const id = p.args.model;
        if (!opts.props.hasModel(id)) { E(`propRef '${id}' is not a registered modelgen model`); continue; }
        if (p.args.scale != null && p.args.scale !== 1) E(`propRef '${id}' scale=${p.args.scale} — a scale fudge is a units bug (law: scale stays 1.0)`);
        const pf = opts.props.getSpec(id)?.footprint;
        if (pf && zones.length) {
          const [px, , pz] = p.at ?? [0, 0, 0];
          const fits = zones.some((z) => Math.abs(px - z.x) <= z.w / 2 && Math.abs(pz - z.z) <= z.d / 2 && pf.w <= z.w && pf.d <= z.d);
          if (!fits) E(`propRef '${id}' at [${px},${pz}] does not fit any anchorZone`);
        } else if (pf && !zones.length) W(`propRef '${id}' placed without anchorZones — declare them so placement is checkable`);
        // doorway clearance: the prop must not block an entrance (opening extruded 1 m inward)
        if (pf && f) {
          for (const door of parts.filter((x) => ENTRANCE_OPS.has(x.op))) {
            const fr = faceFrame(door.args.face, f, wallT);
            const rect = openingsOf(door, fr, spec)[0];
            const uc = (rect.u0 + rect.u1) / 2;
            const [dx, , dz] = faceToWorld(fr, uc, 0);
            const inX = fr.axis === 'x' ? (rect.u1 - rect.u0) / 2 : 1.0;
            const inZ = fr.axis === 'x' ? 1.0 : (rect.u1 - rect.u0) / 2;
            const zx = fr.axis === 'z' ? dx - fr.out * (wallT / 2 + 0.5) : dx;   // clear-zone centred 0.5 m inside
            const zz = fr.axis === 'x' ? dz - fr.out * (wallT / 2 + 0.5) : dz;
            const [px, , pz] = p.at ?? [0, 0, 0];
            if (Math.abs(px - zx) < inX + pf.w / 2 && Math.abs(pz - zz) < inZ + pf.d / 2) {
              E(`propRef '${id}' blocks the '${door.id ?? door.op}' entrance clear-zone`);
            }
          }
        }
      }
    }
  }

  // law 10 + 14 — budgets
  const landmark = intent.role === 'landmark' || (f && f.w * f.d > 400);
  const colCap = landmark ? 64 : 32;
  if (plan.stats.colliderCount > colCap) W(`${plan.stats.colliderCount} colliders > ${colCap} budget — simplify (or justify in BUILD.md)`);
  for (const c of plan.colliders) {
    if (f && (c.min[0] < -f.w / 2 - 0.06 || c.max[0] > f.w / 2 + 0.06 || c.min[2] < -f.d / 2 - 0.06 || c.max[2] > f.d / 2 + 0.06)) {
      W(`collider from '${c.part}' pokes outside the footprint`);
    }
  }
  const matCap = landmark ? 12 : 8;
  if (plan.stats.materials.length > matCap) W(`${plan.stats.materials.length} materials > ${matCap} budget`);
  if (plan.stats.tris > 20000) E(`~${plan.stats.tris} triangles > 20k hard cap`);
  else if (plan.stats.tris > 8000) W(`~${plan.stats.tris} triangles > 8k budget (provisional — recalibrate with a real frame capture)`);

  if (spec.needs?.length) I(`needs[] (${spec.needs.length}): ${spec.needs.join(' · ')}`);
  return { errors, warns, infos };
}

// law 13 — 0.25 m occupancy grid over the interior at torso height; BFS entrance↔entrance.
// Catches "walkable on paper, impassable in practice". WARN-level by design.
function pathingGate(spec, plan, entrances, wallT) {
  const f = spec.footprint;
  const CELL = 0.25;
  const x0 = -f.w / 2 + wallT, z0 = -f.d / 2 + wallT;
  const nx = Math.max(1, Math.floor((f.w - 2 * wallT) / CELL)), nz = Math.max(1, Math.floor((f.d - 2 * wallT) / CELL));
  const blocked = new Uint8Array(nx * nz);
  for (const c of plan.colliders) {
    if (c.min[1] >= 1.6 || c.max[1] <= 0.3) continue;        // outside the torso slab
    const i0 = Math.max(0, Math.floor((c.min[0] - x0) / CELL)), i1 = Math.min(nx - 1, Math.floor((c.max[0] - x0) / CELL));
    const j0 = Math.max(0, Math.floor((c.min[2] - z0) / CELL)), j1 = Math.min(nz - 1, Math.floor((c.max[2] - z0) / CELL));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) blocked[j * nx + i] = 1;
  }
  const cellOf = (x, z) => {
    const i = Math.floor((x - x0) / CELL), j = Math.floor((z - z0) / CELL);
    return (i >= 0 && i < nx && j >= 0 && j < nz) ? j * nx + i : -1;
  };
  const seeds = entrances.map((p) => {
    const fr = faceFrame(p.args.face, f, wallT);
    const rect = openingsOf(p, fr, spec)[0];
    const [dx, , dz] = faceToWorld(fr, (rect.u0 + rect.u1) / 2, 0);
    const x = fr.axis === 'z' ? dx - fr.out * (wallT / 2 + 0.3) : dx;
    const z = fr.axis === 'x' ? dz - fr.out * (wallT / 2 + 0.3) : dz;
    return { id: p.id ?? p.op, cell: cellOf(x, z) };
  });
  const warns = [];
  const first = seeds[0];
  if (first.cell < 0 || blocked[first.cell]) return [`entrance '${first.id}' opens into a blocked cell`];
  const seen = new Uint8Array(nx * nz);
  const q = [first.cell]; seen[first.cell] = 1;
  while (q.length) {
    const c = q.pop();
    const ci = c % nx, cj = (c / nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || i >= nx || j < 0 || j >= nz) continue;
      const n = j * nx + i;
      if (!seen[n] && !blocked[n]) { seen[n] = 1; q.push(n); }
    }
  }
  for (const s of seeds.slice(1)) {
    if (s.cell < 0 || !seen[s.cell]) warns.push(`entrance '${s.id}' is unreachable from '${first.id}' — props/interior walls choke the path`);
  }
  return warns;
}

// Modelgen-compatible throwing wrapper (interp's hard gate).
export function validateSpec(spec, opts = {}) {
  const { errors } = validate(spec, opts);
  if (errors.length) throw new Error(`buildgen spec '${spec?.id}' invalid:\n  - ${errors.join('\n  - ')}`);
  return true;
}
