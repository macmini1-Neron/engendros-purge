// openworld.js — the connective tissue of the 1000×1000 steppe: dirt/gravel roads linking the
// districts, telegraph (ЛЭП) pole lines beside them, and a handful of roadside POIs (added in C2).
// Flat road strips carry NO collider (you walk/drive over them); poles + POI structures DO. Every
// collider is pushed into world.boxes during the build, before world.grid.build() runs, so it's
// indexed with the rest of the map. Routes thread the OPEN GAPS between districts (never through a
// district interior) and arrive at the approaches.
import * as THREE from 'three';
import { MeshBuilder, TAU, makeRNG, randRange, shade, voxelMaterial } from './util.js';

// dirt-road palette (graded gravel over packed earth) — layered so it never reads as a flat blob
const DIRT = { hi: 0x8a7a55, mid: 0x6e5f40, lo: 0x574a31, rut: 0x453d29 };
const WOOD = { hi: 0x6a5436, mid: 0x52412a, lo: 0x3a2e1e };  // creosoted timber pole
const PORC = 0x707b6f;                                        // grey-green porcelain insulator
const WIRE = 0x262420;

function cyl(b, r, h, x, y, z, color, opts = {}) {
  const g = new THREE.CylinderGeometry(r, r, h, opts.seg || 8); b.geo(g, x, y, z, color, opts); g.dispose();
}

// One axis-aligned dirt road segment: packed-earth base + tonal top + 2 wheel ruts + gravel speckle.
// (cx,cz) centre; runs `len` along `axis` ('x' or 'z'); `w` cross-width. No collider — it's ground.
function roadStrip(b, cx, cz, axis, len, w, rng) {
  const horiz = axis === 'x';
  const W = horiz ? len : w, D = horiz ? w : len;
  b.box(W, 0.08, D, cx, 0.05, cz, DIRT.mid);                                   // packed-earth base
  b.box(W - 0.6, 0.085, D - 0.6, cx, 0.056, cz, DIRT.lo, { tint: 0.05 });      // worn-in top (proud sliver)
  const ro = w * 0.22;
  for (const s of [-1, 1]) {                                                   // two wheel ruts along the road
    if (horiz) b.box(len, 0.09, w * 0.16, cx, 0.06, cz + s * ro, DIRT.rut);
    else       b.box(w * 0.16, 0.09, len, cx + s * ro, 0.06, cz, DIRT.rut);
  }
  const n = Math.floor(len / 6);                                              // gravel / dried-mud speckle
  for (let i = 0; i < n; i++) {
    const t = randRange(-len / 2 + 2, len / 2 - 2, rng), o = randRange(-w / 2 + 0.6, w / 2 - 0.6, rng), s = randRange(0.5, 1.5, rng);
    const x = horiz ? cx + t : cx + o, z = horiz ? cz + o : cz + t;
    b.box(s, 0.095, s, x, 0.062, z, shade(DIRT.hi, randRange(-0.06, 0.06, rng)), { ry: randRange(0, TAU, rng) });
  }
}

// Telegraph / power pole (столб ЛЭП): creosoted timber pole + crossarm + 4 insulators. Thin collider.
// `wireAlongX` orients the crossarm PERPENDICULAR to the wire run.
function telegraphPole(b, world, x, z, h, wireAlongX) {
  cyl(b, 0.16, h, x, h / 2, z, WOOD.mid, { seg: 6, tint: 0.05 });
  cyl(b, 0.18, 0.5, x, h - 0.3, z, WOOD.lo, { seg: 6 });                       // weathered cap band
  if (wireAlongX) b.box(0.16, 0.16, 1.8, x, h - 0.55, z, WOOD.hi);             // crossarm ⟂ wire
  else            b.box(1.8, 0.16, 0.16, x, h - 0.55, z, WOOD.hi);
  for (const s of [-1, 1]) {                                                   // insulators spaced along the crossarm
    const ix = wireAlongX ? 0 : s, iz = wireAlongX ? s : 0;
    b.box(0.14, 0.34, 0.14, x + ix * 0.72, h - 0.28, z + iz * 0.72, PORC);
    b.box(0.14, 0.34, 0.14, x + ix * 0.36, h - 0.28, z + iz * 0.36, PORC);
  }
  world.boxes.push({ min: new THREE.Vector3(x - 0.3, 0, z - 0.3), max: new THREE.Vector3(x + 0.3, h, z + 0.3) });
}

// A taut wire box strung between two poles at insulator height (visual only).
function wireSpan(b, x0, z0, x1, z1, h) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
  b.box(0.05, 0.05, len, cx, h, cz, WIRE, { ry: ang });
}

export function buildRoads(world) {
  const rng = makeRNG(0x0AD5);
  const b = new MeshBuilder();

  // --- road network (axis-aligned, flat, no collider) — threads the gaps, meets at crossroads ---
  roadStrip(b, 150, -112.5, 'z', 655, 7.5, rng);  // N–S spine, east of the kombinát   (z −440..+215)
  roadStrip(b, -15, -300,   'x', 545, 7.5, rng);  // E–W south road: strongpoint↔spine↔kolkhoz (x −287..+258)
  roadStrip(b, 85,  210,    'x', 150, 6,   rng);  // airfield approach spur            (x 10..160 @ z+210)
  roadStrip(b, 242, 150,    'x', 200, 6,   rng);  // bunker approach spur              (x 142..342 @ z+150)
  roadStrip(b, 120, -40,    'x', 72,  6,   rng);  // kombinát access spur              (x 84..156 @ z−40)

  // --- ЛЭП pole line beside the spine (offset +5.2 m east) + along the south road (offset −5.2 m) ---
  const WH = 6.2;
  let prev = null;
  for (let z = -430; z <= 206; z += 36) { const x = 155.2; telegraphPole(b, world, x, z, 6.5, false); if (prev) wireSpan(b, prev[0], prev[1], x, z, WH); prev = [x, z]; }
  prev = null;
  for (let x = -270; x <= 250; x += 38) { const z = -305.2; telegraphPole(b, world, x, z, 6.5, true); if (prev) wireSpan(b, prev[0], prev[1], x, z, WH); prev = [x, z]; }

  const m = new THREE.Mesh(b.build(), voxelMaterial()); m.receiveShadow = true; m.castShadow = true; world.scene.add(m);
}

export function buildOpenWorld(world) {
  buildRoads(world);
  // roadside POIs added in Task C2
}
