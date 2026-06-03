// industrial.js — the Soviet kombinát district for the steppe map.
// Built object-by-object via the voxel-building-modeling skill (research-first,
// custom mesh, layered shading, correct AABB colliders, no z-fight).
// Plan: docs/superpowers/plans/2026-06-03-industrial-district-build.md
// Entry: buildIndustrial(world, ox, oz) — ox/oz = yard centre in world coords.
import * as THREE from 'three';
import { MeshBuilder, TAU, makeRNG, randRange, shade, voxelMaterial } from './util.js';

// ---- layered-shading palettes (Hi/Mid/Lo/Slot; never near-black main) ----
const GREEN = { hi: 0x5a7a3a, mid: 0x46602e, lo: 0x33471f, slot: 0x202d12 }; // Soviet army green
const RUST  = { hi: 0x8a5a34, mid: 0x6e4526, lo: 0x4e301a, slot: 0x2e1c0f }; // rusted steel
const GREY  = { hi: 0x9a958b, mid: 0x7c776d, lo: 0x5c584f, slot: 0x39362f }; // grey primer
const DRUM_PALS = [GREEN, RUST, GREY, GREEN]; // green weighted (most common)

// ---- helpers ----
// vertical cylinder (CylinderGeometry axis is +Y); dispose after build.
function cyl(b, r, h, x, y, z, color, opts = {}) {
  const g = new THREE.CylinderGeometry(r, r, h, opts.seg || 12);
  b.geo(g, x, y, z, color, opts);
  g.dispose();
}
// push an AABB collider to world.boxes WITHOUT drawing a box (cylinders draw via b.geo).
function collider(world, x, z, halfW, y0, y1, halfD) {
  world.boxes.push({ min: new THREE.Vector3(x - halfW, y0, z - (halfD ?? halfW)), max: new THREE.Vector3(x + halfW, y1, z + (halfD ?? halfW)) });
}

// =====================================================================
// OBJECT 1 — Fuel drums (Soviet 200 L steel barrel)
// Real: ~Ø0.585 m × 0.88 m, two rolling hoops, raised top/bottom rims, a
// bung on the lid, stencilled markings (ОГНЕОПАСНО / fuel grade). Stacked &
// scattered around fuelling points. Layered shading: lit top, dark hoops.
// =====================================================================
function drum(b, x, z, y0, pal, rng, label) {
  const R = 0.29, H = 0.88, cy = y0 + H / 2;
  cyl(b, R, H, x, cy, z, pal.mid, { tint: randRange(-0.04, 0.04, rng) });   // body
  cyl(b, R * 1.03, 0.06, x, y0 + 0.04, z, pal.lo);                          // bottom rim (shadow)
  cyl(b, R * 1.03, 0.06, x, y0 + H - 0.04, z, pal.hi);                      // top rim (lit)
  cyl(b, R + 0.02, 0.05, x, y0 + 0.30, z, pal.slot);                        // rolling hoop 1 (proud, dark)
  cyl(b, R + 0.02, 0.05, x, y0 + 0.58, z, pal.slot);                        // rolling hoop 2
  cyl(b, R * 0.84, 0.03, x, y0 + H + 0.01, z, pal.hi);                      // top lid disc (catches light)
  b.box(0.07, 0.05, 0.07, x + R * 0.42, y0 + H + 0.03, z, pal.slot);        // filler bung
  // label patch — placeholder for a Cyrillic stencil (real text added in the signage pass),
  // sits proud of the body so it never z-fights.
  if (label) b.box(0.22, 0.18, 0.012, x, cy, z + R + 0.004, 0xcdbf9a, { tint: 0.02 });
}

// a lying drum (decorative scatter, no collider)
function drumLying(b, x, z, pal, rng) {
  const R = 0.29, H = 0.88, yaw = randRange(0, TAU, rng);
  cyl(b, R, H, x, R + 0.02, z, pal.mid, { rx: Math.PI / 2, ry: yaw, tint: randRange(-0.04, 0.04, rng) });
  // hoops
  const dx = Math.cos(yaw), dz = Math.sin(yaw);
  cyl(b, R + 0.02, 0.05, x + dx * 0.18, R + 0.02, z + dz * 0.18, pal.slot, { rx: Math.PI / 2, ry: yaw });
  cyl(b, R + 0.02, 0.05, x - dx * 0.18, R + 0.02, z - dz * 0.18, pal.slot, { rx: Math.PI / 2, ry: yaw });
}

export function buildFuelDrums(world, b, cx, cz, count, rng) {
  for (let i = 0; i < count; i++) {
    const a = randRange(0, TAU, rng), rad = randRange(0, 2.4, rng);
    const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
    const pal = DRUM_PALS[Math.floor(randRange(0, DRUM_PALS.length, rng))];
    if (randRange(0, 1, rng) < 0.14) { drumLying(b, x, z, pal, rng); continue; } // ~14% lying (decor, no collider)
    const stacked = randRange(0, 1, rng) < 0.18;
    drum(b, x, z, 0, pal, rng, i % 5 === 0);
    if (stacked) drum(b, x, z, 0.88, DRUM_PALS[Math.floor(randRange(0, DRUM_PALS.length, rng))], rng, false);
    collider(world, x, z, 0.30, 0, stacked ? 1.76 : 0.88); // standing drum(s) = cover
  }
}

// vertical access ladder on a cylinder's +Z face, y0→y1
function ladder(b, x, z, y0, y1, color) {
  const h = y1 - y0, cy = (y0 + y1) / 2;
  b.box(0.05, h, 0.05, x - 0.16, cy, z, color); b.box(0.05, h, 0.05, x + 0.16, cy, z, color);
  for (let yy = y0 + 0.3; yy < y1; yy += 0.45) b.box(0.34, 0.04, 0.04, x, yy, z, color);
}

// =====================================================================
// OBJECT 2a — Storage tank (fuel reservoir, резервуар): squat vertical steel
// cylinder, low domed top + manhole, side ladder, red+yellow hazard bands.
// =====================================================================
export function buildTank(world, b, x, z, R, H, pal, rng) {
  const M = pal || GREY;
  cyl(b, R, H, x, H / 2, z, M.mid, { seg: 16, tint: randRange(-0.03, 0.03, rng) }); // body
  cyl(b, R * 1.01, 0.40, x, 0.20, z, M.lo, { seg: 16 });                            // bottom skirt (shadow)
  cyl(b, R * 1.01, 0.30, x, H - 0.15, z, M.hi, { seg: 16 });                        // top rim (lit)
  cyl(b, R * 0.98, 0.25, x, H + 0.10, z, M.hi, { seg: 16 });                        // shallow dome
  cyl(b, 0.5, 0.22, x, H + 0.28, z, M.slot, { seg: 10 });                           // central manhole hub
  cyl(b, R + 0.03, 0.5, x, H * 0.40, z, 0x9a2b22, { seg: 16 });                     // red hazard band (proud)
  cyl(b, R + 0.03, 0.32, x, H * 0.72, z, 0xc9a23a, { seg: 16 });                    // yellow caution stripe (proud)
  ladder(b, x, z + R + 0.02, 0, H + 0.2, M.slot);
  collider(world, x, z, R, 0, H + 0.3);
}

// =====================================================================
// OBJECT 2b — Gasholder (газгольдер): tall painted-steel drum with a low
// domed crown, a red top band, and a telescopic guide frame (vertical posts).
// =====================================================================
export function buildGasholder(world, b, x, z, R, H, rng) {
  const M = GREY;
  cyl(b, R, H, x, H / 2, z, M.mid, { seg: 18, tint: randRange(-0.03, 0.03, rng) });
  cyl(b, R * 1.01, 0.5, x, 0.25, z, M.lo, { seg: 18 });                             // skirt
  cyl(b, R * 0.99, H * 0.12, x, H + H * 0.05, z, M.hi, { seg: 18 });                // domed crown
  cyl(b, R + 0.04, 0.7, x, H - 0.6, z, 0x9a2b22, { seg: 18 });                      // red top band (proud)
  cyl(b, R + 0.04, 0.5, x, H * 0.45, z, M.slot, { seg: 18 });                       // mid girder band (proud)
  const posts = 8;                                                                   // guide frame
  for (let i = 0; i < posts; i++) { const a = (i / posts) * TAU; const px = x + Math.cos(a) * (R + 0.5), pz = z + Math.sin(a) * (R + 0.5); b.box(0.18, H + 1.2, 0.18, px, (H + 1.2) / 2, pz, 0x6c727a, { tint: 0.03 }); }
  ladder(b, x, z + R + 0.55, 0, H + 1.0, M.slot);
  collider(world, x, z, R + 0.6, 0, H + 1.2);
}

// =====================================================================
// Entry — assembles the kombinát. Objects are added incrementally per the
// build plan (barrels → tanks → buildings → infra → fence → signs → misc).
// =====================================================================
export function buildIndustrial(world, ox, oz) {
  const rng = makeRNG(0x1AD05);
  const metal = new MeshBuilder(); // merged mesh bucket for metal props (one draw call)

  // --- OBJECT 1: fuel drums at the fuelling points (local coords + origin) ---
  buildFuelDrums(world, metal, ox + 56, oz - 30, 9, rng); // by the fuel tanks (E)
  buildFuelDrums(world, metal, ox + 6,  oz - 4,  6, rng); // by the rail loading platform
  buildFuelDrums(world, metal, ox - 26, oz + 6,  5, rng); // by the main hall

  // --- OBJECT 2: storage tanks (резервуары) + gasholders (газгольдеры) ---
  buildTank(world, metal, ox + 58, oz - 32, 5,   8, GREY, rng);
  buildTank(world, metal, ox + 67, oz - 27, 4,   7, RUST, rng);
  buildTank(world, metal, ox + 60, oz - 41, 4.5, 8, GREY, rng);
  buildGasholder(world, metal, ox + 36, oz - 16, 7,   16, rng);
  buildGasholder(world, metal, ox + 54, oz - 18, 6,   14, rng);
  buildGasholder(world, metal, ox + 45, oz - 28, 6.5, 15, rng);

  const m = new THREE.Mesh(metal.build(), voxelMaterial());
  m.castShadow = true; m.receiveShadow = true;
  world.scene.add(m);
}
