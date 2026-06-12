// wallcut.js — pure wall segmentation around openings (no THREE; node-testable).
//
// THE module that makes "openings are real GAPS" true: a shell wall is never one
// monolithic box — it is cut into jamb/sill/lintel segments around every doorway,
// window bay and gate on that face. Colliders derive from the segments, so a door
// is walkable and a window is see-through BY CONSTRUCTION, not by overlay.
//
// Algorithm: horizontal-band decomposition with vertical merge.
//   1. v-boundaries = {0, every opening v0/v1, H} → horizontal bands.
//   2. per band: subtract the u-ranges of openings covering that band from [0,L].
//   3. merge vertically adjacent bands whose remaining u-intervals are identical —
//      a door yields 3 segments (2 jambs + lintel, the world.js _wall semantics),
//      one window 4 (sill band, 2 jambs, lintel band), k uniform windows k+3
//      (NOT 3k+1 — this is what keeps the law-14 collider budget honest).
//   4. drop slivers thinner than MIN_SEG (mirrors world._wall's 0.05 guards);
//      dropped area is returned so tests can assert exact area conservation.
//
// wall     = { L, H }                          (length along u, height along v; metres)
// openings = [{ u0, u1, v0, v1, id? }]         (face coords: u from the wall's u=0 end, v from its base)
// returns  { segments: [{u0,u1,v0,v1}], dropped: m², errors: [string] }

const MIN_SEG = 0.05;
const EPS = 1e-9;

export function cutWall(wall, openings = []) {
  const { L, H } = wall;
  const errors = [];
  const os = [];
  for (const o of openings) {
    const id = o.id ?? `opening@u${(o.u0 ?? 0).toFixed(2)}`;
    if (!(o.u1 - o.u0 > EPS) || !(o.v1 - o.v0 > EPS)) { errors.push(`${id}: degenerate (zero/negative area)`); continue; }
    if (o.u0 < -EPS || o.u1 > L + EPS || o.v0 < -EPS || o.v1 > H + EPS) {
      errors.push(`${id}: outside the wall (u ${o.u0.toFixed(2)}–${o.u1.toFixed(2)} of L=${L}, v ${o.v0.toFixed(2)}–${o.v1.toFixed(2)} of H=${H})`);
      continue;
    }
    os.push({ ...o, id });
  }
  for (let i = 0; i < os.length; i++) for (let j = i + 1; j < os.length; j++) {
    const a = os[i], b = os[j];
    if (a.u0 < b.u1 - EPS && b.u0 < a.u1 - EPS && a.v0 < b.v1 - EPS && b.v0 < a.v1 - EPS) {
      errors.push(`${a.id} overlaps ${b.id} — merge them or move one (overlapping cuts compile z-fighting jambs)`);
    }
  }
  if (errors.length) return { segments: [], dropped: 0, errors };

  // 1. horizontal bands from the sorted unique v-boundaries
  const vs = [...new Set([0, H, ...os.flatMap(o => [o.v0, o.v1])].map(v => Math.min(H, Math.max(0, v))))].sort((a, b) => a - b);

  // 2. remaining u-intervals per band (an opening either fully covers a band or misses it)
  const bands = [];
  for (let bi = 0; bi < vs.length - 1; bi++) {
    const v0 = vs[bi], v1 = vs[bi + 1];
    if (v1 - v0 <= EPS) continue;
    const cover = os.filter(o => o.v0 <= v0 + EPS && o.v1 >= v1 - EPS)
      .map(o => [Math.max(0, o.u0), Math.min(L, o.u1)])
      .sort((a, b) => a[0] - b[0]);
    const ivs = [];
    let u = 0;
    for (const [cu0, cu1] of cover) {
      if (cu0 - u > EPS) ivs.push([u, cu0]);
      u = Math.max(u, cu1);
    }
    if (L - u > EPS) ivs.push([u, L]);
    bands.push({ v0, v1, ivs });
  }

  // 3. vertical merge of bands with identical u-interval sets
  const sameIvs = (a, b) => a.length === b.length && a.every((iv, i) => Math.abs(iv[0] - b[i][0]) < 1e-6 && Math.abs(iv[1] - b[i][1]) < 1e-6);
  const groups = [];
  for (const band of bands) {
    const g = groups[groups.length - 1];
    if (g && sameIvs(g.ivs, band.ivs) && Math.abs(g.v1 - band.v0) < 1e-6) g.v1 = band.v1;
    else groups.push({ v0: band.v0, v1: band.v1, ivs: band.ivs });
  }

  // 4. emit segments, dropping slivers (and accounting their area)
  const segments = [];
  let dropped = 0;
  for (const g of groups) for (const [u0, u1] of g.ivs) {
    if (u1 - u0 < MIN_SEG || g.v1 - g.v0 < MIN_SEG) dropped += (u1 - u0) * (g.v1 - g.v0);
    else segments.push({ u0, u1, v0: g.v0, v1: g.v1 });
  }
  return { segments, dropped, errors };
}
