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
// POI palettes
const CONC = { hi: 0xc4c0b6, mid: 0xa29e94, lo: 0x807d74, slot: 0x57544c };
const STEEL = { hi: 0x9aa0a4, mid: 0x787d82, lo: 0x55595d };
const OCH = { hi: 0xd9c47e, mid: 0xc0a85e, lo: 0x9c8746 };   // ochre stucco (booths)
const RED = 0xb5302a, WHITE = 0xe7e3d8;
const RUST = { hi: 0x7a5a3a, mid: 0x5e4630, lo: 0x42301f }, CHAR = 0x1b1916;

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

// ---------------- roadside POIs (Task C2) ----------------

// box + matching axis-aligned collider (POIs use modest collider counts; the grid handles them)
function solid(world, b, w, h, d, x, y, z, color, opts) {
  b.box(w, h, d, x, y, z, color, opts);
  world.boxes.push({ min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2), max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2) });
}

// Cyrillic sign — CanvasTexture plane (opaque-pass alpha so the depth-off viewmodel still draws over it)
function signPlane(world, text, w, h, x, y, z, ry, bg, fg) {
  const c = document.createElement('canvas'); c.width = 256; c.height = Math.max(48, Math.round(256 * h / w));
  const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = fg; ctx.font = `bold ${Math.round(c.height * 0.52)}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: true }));
  m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 3; world.scene.add(m);
}

// АЗС fuel station: concrete forecourt, 4-column canopy, 2 pumps, kassa booth, fascia sign.
function buildFuelStation(world, cx, cz) {
  const b = new MeshBuilder();
  b.box(20, 0.12, 14, cx, 0.07, cz, CONC.lo, { tint: 0.03 });
  b.box(19, 0.13, 13, cx, 0.078, cz, CONC.mid);                                 // forecourt slab
  const cy = 2.4;
  for (const [sx, sz] of [[-6, -3.5], [6, -3.5], [-6, 3.5], [6, 3.5]]) solid(world, b, 0.5, cy * 2, 0.5, cx + sx, cy, cz + sz, STEEL.mid);
  b.box(16, 0.4, 11, cx, cy * 2 + 0.2, cz, STEEL.hi);                            // canopy roof (above reach)
  b.box(16.4, 0.5, 11.4, cx, cy * 2 + 0.55, cz, RED);                           // red fascia band
  signPlane(world, 'АЗС', 4, 1.1, cx, cy * 2 + 0.55, cz - 5.72, 0, '#b5302a', '#f2efe6');
  for (const px of [-3.2, 3.2]) {                                               // pumps
    solid(world, b, 1.0, 1.8, 1.4, cx + px, 0.97, cz, OCH.mid);
    b.box(0.92, 0.5, 0.22, cx + px, 1.62, cz - 0.78, 0x20242a);                 // display head
    b.box(0.12, 0.7, 0.12, cx + px + 0.56, 1.05, cz + 0.62, RUST.mid);          // hose post
  }
  const bx = cx - 7.6;                                                          // kassa booth (one collider mass)
  solid(world, b, 3, 2.6, 3, bx, 1.37, cz, OCH.hi);
  b.box(1.4, 1.0, 0.12, bx + 1.55, 1.7, cz, 0x35434d);                          // window
  b.box(3.3, 0.3, 3.3, bx, 2.78, cz, RED);                                      // booth roof trim
  const m = new THREE.Mesh(b.build(), voxelMaterial()); m.castShadow = true; m.receiveShadow = true; world.scene.add(m); world.addCullable(m); // compact roadside POI — draw-distance cullable
}

// автобусная остановка: concrete pad, back-wall shelter on posts, bench, side sign.
function buildBusStop(world, cx, cz) {
  const b = new MeshBuilder();
  b.box(5, 0.1, 2.6, cx, 0.06, cz, CONC.mid);
  solid(world, b, 5, 2.2, 0.25, cx, 1.2, cz + 1.05, OCH.mid);                   // back wall
  for (const sx of [-2.3, 2.3]) b.box(0.18, 2.2, 0.18, cx + sx, 1.2, cz - 0.9, STEEL.lo);
  b.box(5.4, 0.22, 2.9, cx, 2.35, cz, RED);                                     // roof
  b.box(5.0, 0.12, 2.6, cx, 2.46, cz, OCH.lo);                                  // roof top tone
  b.box(3.6, 0.5, 0.5, cx, 0.55, cz + 0.6, RUST.mid);                           // bench
  signPlane(world, 'АВТОБУС', 2.2, 0.55, cx - 2.31, 1.95, cz, Math.PI / 2, '#1f5fa0', '#f2efe6');
  const m = new THREE.Mesh(b.build(), voxelMaterial()); m.castShadow = true; m.receiveShadow = true; world.scene.add(m); world.addCullable(m); // compact roadside POI — draw-distance cullable
}

// КПП checkpoint: pad, booth beside the lane, КПП sign, and a red/white boom in the RAISED (vertical)
// position so it reads as a checkpoint without blocking the road.
function buildCheckpoint(world, cx, cz) {
  const b = new MeshBuilder();
  b.box(7, 0.12, 5, cx, 0.07, cz, CONC.lo);
  const bx = cx + 4;
  solid(world, b, 2.6, 2.8, 2.6, bx, 1.4, cz, CONC.hi);                         // booth
  b.box(1.2, 1.0, 0.12, bx - 1.35, 1.75, cz, 0x35434d);                         // window facing lane
  b.box(2.9, 0.3, 2.9, bx, 2.92, cz, RED);                                      // roof trim
  signPlane(world, 'КПП', 1.7, 0.66, bx - 1.32, 2.25, cz, -Math.PI / 2, '#b5302a', '#f2efe6');
  const px = cx + 2.4;                                                          // boom pivot, raised vertical
  solid(world, b, 0.45, 1.0, 0.45, px, 0.55, cz, STEEL.lo);
  for (let i = 0; i < 6; i++) b.box(0.3, 0.72, 0.3, px, 1.15 + i * 0.68, cz, i % 2 ? RED : WHITE);
  const m = new THREE.Mesh(b.build(), voxelMaterial()); m.castShadow = true; m.receiveShadow = true; world.scene.add(m); world.addCullable(m); // compact roadside POI — draw-distance cullable
}

// burnt-out supply convoy: scorched ground + 3 charred truck hulks (cover), aligned along the road (x).
function buildConvoyWreck(world, cx, cz) {
  const b = new MeshBuilder();
  b.box(24, 0.05, 9, cx, 0.04, cz, CHAR, { tint: 0.02 });                       // scorch
  for (const [ox, oz] of [[-7.5, 0.5], [0, -0.7], [7.5, 0.4]]) {
    const tx = cx + ox, tz = cz + oz;
    solid(world, b, 6, 1.3, 3, tx, 0.72, tz, RUST.mid);                         // bed/chassis
    b.box(2.2, 1.4, 2.8, tx - 2.4, 1.5, tz, RUST.lo);                           // collapsed cab (−x end)
    b.box(6.1, 0.2, 3.1, tx, 1.4, tz, CHAR);                                    // charred top
    for (const wx of [-2, -0.2, 1.6]) for (const wz of [-1.35, 1.35]) cyl(b, 0.55, 0.5, tx + wx, 0.45, tz + wz, 0x161412, { rx: Math.PI / 2 });
    b.box(0.5, 1.1, 0.5, tx + 1.4, 1.4, tz + (oz > 0 ? 1.7 : -1.7), CHAR);      // twisted debris
  }
  const m = new THREE.Mesh(b.build(), voxelMaterial()); m.castShadow = true; m.receiveShadow = true; world.scene.add(m); world.addCullable(m); // compact roadside POI — draw-distance cullable
}

// колодец well + lattice windpump: stone ring + gabled roof on posts, steel windpump tower with a fan.
function buildWell(world, cx, cz) {
  const b = new MeshBuilder();
  cyl(b, 1.4, 1.0, cx, 0.5, cz, CONC.mid, { seg: 10 });
  cyl(b, 1.1, 1.05, cx, 0.56, cz, 0x2a2622, { seg: 10 });                       // dark shaft
  world.boxes.push({ min: new THREE.Vector3(cx - 1.4, 0, cz - 1.4), max: new THREE.Vector3(cx + 1.4, 1.0, cz + 1.4) });
  for (const sx of [-1.5, 1.5]) b.box(0.16, 2.4, 0.16, cx + sx, 1.2, cz, WOOD.mid);
  b.box(3.7, 0.22, 2.1, cx, 2.5, cz, RED); b.box(3.3, 0.12, 1.8, cx, 2.61, cz, WOOD.lo); // gable roof
  const wx = cx + 5.5;                                                          // windpump tower
  for (const sx of [-0.8, 0.8]) for (const sz of [-0.8, 0.8]) b.box(0.14, 5, 0.14, wx + sx * 1, 2.5, cz + sz * 1, STEEL.lo);
  for (const y of [1.2, 3.2]) { b.box(2.0, 0.1, 0.12, wx, y, cz - 0.85, STEEL.lo); b.box(0.12, 0.1, 2.0, wx + 0.85, y, cz, STEEL.lo); } // cross-braces
  world.boxes.push({ min: new THREE.Vector3(wx - 1.1, 0, cz - 1.1), max: new THREE.Vector3(wx + 1.1, 5, cz + 1.1) });
  for (let i = 0; i < 6; i++) b.box(0.1, 1.7, 0.34, wx, 5.4, cz, STEEL.hi, { rx: i / 6 * TAU }); // fan blades (sweep in YZ)
  cyl(b, 0.3, 0.7, wx, 5.4, cz, STEEL.mid, { rx: Math.PI / 2 });                // hub
  const m = new THREE.Mesh(b.build(), voxelMaterial()); m.castShadow = true; m.receiveShadow = true; world.scene.add(m); world.addCullable(m); // compact roadside POI — draw-distance cullable
}

export function buildOpenWorld(world) {
  buildRoads(world);
  // roadside POIs — along the roads / in the open gaps, clear of every district
  buildFuelStation(world, 170, 96);    // АЗС east of the N–S spine, by the bunker-spur reach
  buildBusStop(world, 159, -188);      // bus stop on the spine's east verge
  buildCheckpoint(world, 150, -388);   // КПП on the spine near the S border (raised boom)
  buildConvoyWreck(world, -95, -296);  // ambushed convoy on the E–W south road
  buildWell(world, 206, -212);         // well + windpump in the SE open gap
}

