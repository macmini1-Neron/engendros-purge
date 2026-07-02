// zona.js — «ЗОНА 704» scene builder (THREE-bound). Consumes the zona-plan.js registry + the final
// terrain heightfield and builds the network/cadastre meshes: draped road+rail ribbons, water planes,
// gate blockades, ЛЭП pole lines, parcel signposts. world.js calls buildZona(world) from _buildZona().
// Skeleton scope: NO buildings, NO water mechanics, NO gate-opening logic (later specs).
//
// Ribbons drape over the RENDERED LOD0 surface, not the raw analytic field: heights are sampled on
// the LOD0 lattice (chunkSize/res = 125/48 m) and interpolated triangle-exact, matching
// terrain-mesh-arrays' (a,c,b)/(b,c,d) split — otherwise mesh triangles that cut across a road-cut
// shoulder bury a merely-analytic ribbon. Far LODs still drift under/over ribbons at distance,
// which haze hides (skeleton tolerance, noted in the plan).
import * as THREE from 'three';
import { MeshBuilder, makeRNG, voxelMaterial } from './util.js';
import { ROADS, lintPlan } from './zona-plan.js';
import { polylineProject } from './zona-terrain.js';

// ── per-surface ribbon styling: cross-section half-offsets (fractions of width) + tone per lane ────
const SURFACES = {
  asphalt: { lanes: [-0.5, -0.28, 0, 0.28, 0.5], tones: [0x3e3e42, 0x46464b, 0x515157, 0x46464b, 0x3e3e42], jitter: 0.025 },
  panels:  { lanes: [-0.5, -0.28, 0, 0.28, 0.5], tones: [0x6f6a5e, 0x8a8578, 0x969180, 0x8a8578, 0x6f6a5e], jitter: 0.03, seamEvery: 6 },
  dirt:    { lanes: [-0.5, -0.28, 0, 0.28, 0.5], tones: [0x75654c, 0x54452f, 0x6b5a41, 0x54452f, 0x75654c], jitter: 0.05 },
  gravel:  { lanes: [-0.5, -0.28, 0, 0.28, 0.5], tones: [0x827c72, 0x686257, 0x7a746a, 0x686257, 0x827c72], jitter: 0.05 },
  path:    { lanes: [-0.5, 0, 0.5], tones: [0x66573f, 0x71624a, 0x66573f], jitter: 0.06 },
  rail:    { lanes: [-0.5, 0, 0.5], tones: [0x565049, 0x5f5852, 0x565049], jitter: 0.04 }, // ballast bed
};
const LIFT = 0.09;        // ribbon height above the rendered ground (z-fight guard)
const CHUNK_ARC = 250;    // split ribbons every ~250 m of arc so draw-distance culling bites
// ribbons sit a few cm over co-planar terrain triangles — bias the depth test in their favour
const RIBBON_MAT_OPTS = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 };

// mesh-conformal ground height (see header note). CS must match world.js _buildZona chunk params.
function makeMeshHeight(world) {
  const T = (x, z) => world.terrain.terrainHeightAt(x, z);
  const CS = 125 / 48, ORG = -1250;
  return (x, z) => {
    const gx = Math.floor((x - ORG) / CS), gz = Math.floor((z - ORG) / CS);
    const x0 = ORG + gx * CS, z0 = ORG + gz * CS;
    const tx = (x - x0) / CS, tz = (z - z0) / CS;
    const ha = T(x0, z0), hb = T(x0 + CS, z0), hc = T(x0, z0 + CS);
    if (tx + tz <= 1) return ha + (hb - ha) * tx + (hc - ha) * tz;
    const hd = T(x0 + CS, z0 + CS);
    return hd + (hc - hd) * (1 - tx) + (hb - hd) * (1 - tz);
  };
}

// walk a polyline by arc length (local mirror of zona-terrain's internals — trivial, keeps imports lean)
function cumArc(pts) {
  const A = [0];
  for (let i = 1; i < pts.length; i++) A.push(A[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return A;
}
function pointAtArc(pts, cum, s) {
  const total = cum[cum.length - 1];
  s = Math.max(0, Math.min(total, s));
  let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
  const t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
}

// bridge gap windows for a road (arc-space) — ribbons skip them; the Task-7 deck spans the hole
function gapWindows(road) {
  return (road.bridges || []).map(b => {
    const s = polylineProject(road.pts, b.at[0], b.at[1]).s;
    return [s - b.halfLen, s + b.halfLen];
  });
}
const inGap = (gaps, s) => gaps.some(([a, b]) => s > a && s < b);

// one draped ribbon (lanes × samples quad strip, vertex-colored) → array of chunked THREE.Mesh
function buildRibbon(world, road, opts = {}) {
  const T = makeMeshHeight(world);
  const sur = SURFACES[road.surface];
  const width = opts.width != null ? opts.width : road.width;
  const lateral = opts.lateral || 0;   // constant sideways offset (rails ride ±0.75 on the ballast)
  const lift = opts.lift != null ? opts.lift : LIFT;
  const lanes = opts.lanes || sur.lanes, tones = opts.tones || sur.tones, jitter = opts.jitter != null ? opts.jitter : sur.jitter;
  const rng = makeRNG(0x704 + road.id.length * 131 + road.pts.length);
  const step = road.surface === 'rail' ? 2 : 3;
  const cum = cumArc(road.pts), total = cum[cum.length - 1];
  const gaps = gapWindows(road);
  const meshes = [];
  const col = new THREE.Color();

  let pos = [], colr = [], idx = [], row = -1, lastS = null;
  const flush = () => {
    if (row < 1) { pos = []; colr = []; idx = []; row = -1; return; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, voxelMaterial(RIBBON_MAT_OPTS));
    m.receiveShadow = true;
    world.scene.add(m); if (world.addCullable) world.addCullable(m);
    meshes.push(m);
    pos = []; colr = []; idx = []; row = -1;
  };

  for (let s = 0; s <= total + 0.001; s += step) {
    const sc = Math.min(s, total);
    if (inGap(gaps, sc)) { flush(); lastS = null; continue; }      // bridge hole — restart strip after it
    if (lastS != null && sc - lastS > CHUNK_ARC) flush();          // chunk the strip for culling
    const [cx, cz] = pointAtArc(road.pts, cum, sc);
    const [nx, nz] = pointAtArc(road.pts, cum, Math.min(sc + 1, total));
    let dx = nx - cx, dz = nz - cz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const px = -dz, pz = dx; // left-hand perpendicular
    row++;
    const seam = sur.seamEvery && (Math.floor(sc / sur.seamEvery) !== Math.floor((sc + step) / sur.seamEvery));
    for (let li = 0; li < lanes.length; li++) {
      const off = lanes[li] * width + lateral;
      const vx = cx + px * off, vz = cz + pz * off;
      pos.push(vx, T(vx, vz) + lift, vz);
      col.setHex(tones[li]);
      const j = (rng() * 2 - 1) * jitter - (seam ? 0.06 : 0);
      col.offsetHSL(0, 0, j);
      colr.push(col.r, col.g, col.b);
    }
    if (row > 0) {
      const a = (row - 1) * lanes.length, b = row * lanes.length;
      // CCW seen from ABOVE (lanes run left→right across the left-perp, rows along +s)
      for (let li = 0; li < lanes.length - 1; li++) idx.push(a + li, a + li + 1, b + li, a + li + 1, b + li + 1, b + li);
    }
    if (row === 0) lastS = sc;
  }
  flush();
  return meshes;
}

// railway: ballast ribbon + two steel rails + sleepers (merged MeshBuilder boxes per ~250 m)
function buildRail(world, road) {
  buildRibbon(world, road); // ballast bed
  for (const side of [-0.75, 0.75]) {
    buildRibbon(world, road, { width: 0.09, lateral: side, lift: LIFT + 0.18, lanes: [-0.5, 0.5], tones: [0x8f9299, 0x8f9299], jitter: 0.02 });
  }
  const T = makeMeshHeight(world);
  const cum = cumArc(road.pts), total = cum[cum.length - 1];
  let b = new MeshBuilder(), emitted = 0;
  const flush = () => {
    if (!emitted) return;
    const m = new THREE.Mesh(b.build(), voxelMaterial());
    m.receiveShadow = true; world.scene.add(m); if (world.addCullable) world.addCullable(m);
    b = new MeshBuilder(); emitted = 0;
  };
  for (let s = 0; s <= total; s += 2.4) {
    const [cx, cz] = pointAtArc(road.pts, cum, s);
    const [nx, nz] = pointAtArc(road.pts, cum, Math.min(s + 1, total));
    const ry = Math.atan2(nx - cx, nz - cz);
    b.box(2.0, 0.12, 0.24, cx, T(cx, cz) + LIFT + 0.08, cz, 0x4a3c2c, { ry });
    if (++emitted >= 100) flush();
  }
  flush();
}

export function buildZona(world) {
  // fail-loud plan validation at boot (spec §7): errors mean the registry drifted from the master plan.
  const { errors, warnings } = lintPlan();
  for (const e of errors) console.error('[zona-plan]', e);
  for (const w of warnings) console.warn('[zona-plan]', w);

  // ── the network: draped ribbons for every road, rails+sleepers for the railway ──
  for (const road of ROADS) {
    if (road.surface === 'rail') buildRail(world, road);
    else buildRibbon(world, road);
  }
}
