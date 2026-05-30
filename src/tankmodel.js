// tankmodel.js — T-90M «MITRI» voxel model (rebuilt from scratch, ref-matched).
// Isolated module: developed/viewed via tank-viewer.html, imported by game.js.
// Styled toward the blockbench/Minecraft T-90M look (12 reference renders):
// diamond turret, 2-row big side-ERA panels, checkerboard soft-ERA band,
// V-chevron glacis ERA + red headlight rings, rear slat cage, black trapezoidal
// track + visible road wheels, busy roof, long gun w/ thermal sleeve + evacuator.
//
// 1 unit = 1 metre. Forward = +Z, up = +Y, right = +X.
//
// ⚠️ RIG CONTRACT — buildTank() returns a root Group whose userData the game reads:
//   turret(Group,yaw) gunMantlet(Group,pitch) recoilNode(Group) muzzle(Object3D)
//   mgMuzzle(Object3D) hatch(Group, y 1.0→1.6) mitri(Group) roadWheels[12]
//   sprocketL sprocketR trackL trackR headlamps[2] headlampLights[2]
import * as THREE from 'three';
import { MeshBuilder, voxelMaterial } from './util.js';

// ── TEMP working palette — muted military GREEN (final desert camo = later swap).
function palette() {
  return {
    bodyHi: 0x808d5e, bodyMid: 0x6b774b, bodyLo: 0x545e39,   // hull / deck
    turHi:  0x778354, turMid:  0x626e44, turLo:  0x4b5535,   // turret body
    eraHi:  0x6c7748, eraMid:  0x59633a, eraLo:  0x454d2c,   // ERA tiles
    steelHi:0x666b72, steelMid:0x44474d, steelLo:0x2e3035,
    softDark:0x14161b, softBlue:0x2b3340,                    // checkerboard soft-ERA
    red:    0xc1271f,
    slot:   0x1c1e22, rubber: 0x232527,
    wheelHi:0x565a60, wheelMid:0x3e4147, wheelLo:0x282b2f,
    trackHi:0x303236, trackLo:0x121316,                      // black track
    cage:   0x3a3d42, lens: 0x1a2a3a,
  };
}

// ── Layered-slab: mid body + lit top strip + shadow bottom strip ──
function slab(b, w, h, d, x, y, z, mid, hi, lo, opts = {}) {
  b.box(w, h,        d, x, y,            z, mid, { tint: 0.025, ...opts });
  b.box(w, h * 0.14, d, x, y + h * 0.44, z, hi,  { ...opts });
  b.box(w, h * 0.10, d, x, y - h * 0.46, z, lo,  { ...opts });
}
// ── Big flat ERA panel (tile + dark seam frame behind + lit top) ──
function eraPanel(b, P, w, h, d, x, y, z, opts = {}) {
  b.box(w * 1.06, h, d * 1.04, x, y, z - 0.01, P.eraLo, opts);          // seam frame (recessed dark)
  b.box(w, h * 0.92, d * 0.9, x, y, z + 0.02, P.eraMid, { tint: 0.025, ...opts }); // tile face
  b.box(w, h * 0.12, d * 0.9, x, y + h * 0.40, z + 0.025, P.eraHi, opts); // lit top
}
// ── Small protruding ERA brick (turret/glacis) ──
function era(b, P, w, h, d, x, y, z, opts = {}) {
  b.box(w,        h,        d,        x, y,            z,         P.eraMid, { tint: 0.03, ...opts });
  b.box(w * 0.72, h * 0.12, d * 0.95, x, y + h * 0.42, z + 0.006, P.eraHi,  { ...opts });
  b.box(w * 0.72, h * 0.10, d * 0.95, x, y - h * 0.44, z + 0.006, P.eraLo,  { ...opts });
}
// ── Checkerboard soft-ERA band on a +Z-facing front face ──
function checkerFront(b, P, x0, y0, z, dx, cell, cols, rows, opts = {}) {
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const col = ((r + c) % 2 === 0) ? P.softDark : P.softBlue;
    b.box(dx * 0.9, cell * 0.9, 0.07, x0 + c * dx, y0 + r * cell, z, col, opts);
  }
}
// ── Slat / "mangal" cage screen: thin grid standing off a face (X-facing or Z-facing) ──
function slatCageZ(b, P, x0, y0, z, w, h, nx, ny) { // facing +Z
  for (let i = 0; i <= ny; i++) b.box(w, 0.05, 0.05, x0 + w / 2 - 0.0, y0 + i * (h / ny), z, P.cage);
  for (let j = 0; j <= nx; j++) b.box(0.05, h, 0.05, x0 + j * (w / nx), y0 + h / 2, z, P.cage);
}

// =============================================================================
// HULL
// =============================================================================
function buildHull(b, P) {
  slab(b, 3.20, 1.20, 6.5, 0, 0.82, -0.10, P.bodyMid, P.bodyHi, P.bodyLo);   // lower tub
  slab(b, 3.95, 0.32, 6.2, 0, 1.46, -0.15, P.bodyMid, P.bodyHi, P.bodyLo);   // fender deck
  // sloped upper glacis
  b.box(3.35, 1.05, 1.55, 0, 1.30, 2.92, P.bodyMid, { tint: 0.025, rx: -0.6 });
  b.box(3.35, 0.16, 1.55, 0, 1.78, 2.80, P.bodyHi,  { rx: -0.6 });
  b.box(3.10, 0.62, 0.20, 0, 0.62, 3.28, P.bodyLo, { tint: 0.02 });           // lower front plate
  // driver hatch + periscope
  b.box(0.52, 0.07, 0.50, 0, 1.65, 1.95, P.bodyLo, { tint: 0.02 });
  b.box(0.42, 0.05, 0.07, 0, 1.70, 2.16, P.slot);
  // rear engine deck + lengthwise grilles
  slab(b, 3.75, 0.30, 1.55, 0, 1.55, -2.65, P.turMid, P.turHi, P.turLo);
  for (let i = 0; i < 5; i++) b.box(0.46, 0.05, 0.95, -1.20 + i * 0.60, 1.71, -2.65, P.slot);
  b.box(3.45, 0.95, 0.20, 0, 0.95, -3.28, P.bodyLo, { tint: 0.02 });          // rear plate
  // mudguards + tow hooks
  b.box(0.72, 0.12, 1.5, -1.96, 1.58, 2.05, P.turLo);
  b.box(0.72, 0.12, 1.5,  1.96, 1.58, 2.05, P.turLo);
  for (const hx of [-1.25, 1.25]) b.box(0.18, 0.22, 0.22, hx, 0.52, 3.34, P.steelMid);
}

// ── V-chevron ERA on the glacis (inverted-V pointing up-centre, per refs) ──
function glacisArmor(b, P) {
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const ex = 0.32 + col * 0.58;
      const ey = 1.02 + row * 0.30;
      const ez = 3.18 - row * 0.20;
      era(b, P, 0.5, 0.26, 0.16, -ex, ey, ez, { rx: -0.6, ry:  0.5 }); // left leg
      era(b, P, 0.5, 0.26, 0.16,  ex, ey, ez, { rx: -0.6, ry: -0.5 }); // right leg
    }
  }
  // central keel block
  for (let row = 0; row < 3; row++) era(b, P, 0.34, 0.24, 0.16, 0, 1.02 + row * 0.30, 3.20 - row * 0.20, { rx: -0.6 });
}

// ── One side: 2 rows of big ERA panels (the dominant side look) ──
function sideArmor(root, P, sx) {
  const b = new MeshBuilder();
  const skx = sx * 1.99;
  b.box(0.08, 1.00, 6.0, skx - sx * 0.05, 1.28, -0.15, P.turLo, { tint: 0.02 }); // backing
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 7; col++) {
      const ez = 2.45 - col * 0.82;
      const ey = 1.08 + row * 0.44;
      eraPanel(b, P, 0.12, 0.42, 0.76, skx, ey, ez);
    }
  }
  root.add(new THREE.Mesh(b.build(), voxelMaterial()));
}

// =============================================================================
// RUNNING GEAR + BLACK TRAPEZOIDAL TRACK
// =============================================================================
function roadWheel(P, wx, wz) {
  const b = new MeshBuilder();
  const rim = new THREE.CylinderGeometry(0.46, 0.46, 0.24, 14);
  b.geo(rim, wx, 0.46, wz, P.rubber, { rx: Math.PI / 2 }); rim.dispose();
  const hub = new THREE.CylinderGeometry(0.27, 0.27, 0.30, 10);
  b.geo(hub, wx, 0.46, wz, P.wheelMid, { rx: Math.PI / 2 }); hub.dispose();
  b.box(0.09, 0.09, 0.32, wx, 0.46, wz, P.wheelHi);              // hub bolt highlight
  return new THREE.Mesh(b.build(), voxelMaterial());
}
function idler(P, wx, wz) {
  const b = new MeshBuilder();
  const g = new THREE.CylinderGeometry(0.36, 0.36, 0.22, 12);
  b.geo(g, wx, 0.50, wz, P.wheelMid, { rx: Math.PI / 2 }); g.dispose();
  return new THREE.Mesh(b.build(), voxelMaterial());
}
function sprocket(P, wx, wz) {
  const b = new MeshBuilder();
  const g = new THREE.CylinderGeometry(0.38, 0.38, 0.26, 12);
  b.geo(g, wx, 0.52, wz, P.steelMid, { rx: Math.PI / 2 }); g.dispose();
  for (let t = 0; t < 9; t++) { const a = (t / 9) * Math.PI * 2;
    b.box(0.10, 0.10, 0.28, wx + Math.cos(a) * 0.40, 0.52 + Math.sin(a) * 0.40, wz, P.steelHi); }
  return new THREE.Mesh(b.build(), voxelMaterial());
}
function returnRoller(P, wx, wz) {
  const b = new MeshBuilder();
  const g = new THREE.CylinderGeometry(0.16, 0.16, 0.20, 8);
  b.geo(g, wx, 1.02, wz, P.wheelMid, { rx: Math.PI / 2 }); g.dispose();
  return new THREE.Mesh(b.build(), voxelMaterial());
}
// Black trapezoid silhouette: flat bottom + front/rear ramps + top run + tread links.
function trackBand(P, sx) {
  const b = new MeshBuilder();
  const tx = sx * 1.88;
  slab(b, 0.46, 0.34, 5.2, tx, 0.16, -0.05, P.trackLo, P.trackHi, P.trackLo);     // bottom run
  b.box(0.46, 0.34, 1.7, tx, 0.55, 2.78, P.trackLo, { rx: -0.72, tint: 0.01 });   // front ramp → idler
  b.box(0.46, 0.34, 1.7, tx, 0.55, -2.88, P.trackLo, { rx: 0.72, tint: 0.01 });   // rear ramp → sprocket
  b.box(0.46, 0.26, 5.0, tx, 0.95, -0.05, P.trackLo, { tint: 0.01 });             // top run (under fender)
  for (let i = 0; i < 17; i++) b.box(0.52, 0.06, 0.10, tx, 0.00, 2.45 - i * 0.30, P.trackHi); // tread cleats
  return new THREE.Mesh(b.build(), voxelMaterial());
}
function headlamp(P, hx, hy, hz) {
  const b = new MeshBuilder();
  b.box(0.34, 0.34, 0.14, hx, hy, hz, P.steelLo);
  b.box(0.34, 0.07, 0.07, hx, hy + 0.135, hz + 0.10, P.red);
  b.box(0.34, 0.07, 0.07, hx, hy - 0.135, hz + 0.10, P.red);
  b.box(0.07, 0.27, 0.07, hx - 0.135, hy, hz + 0.10, P.red);
  b.box(0.07, 0.27, 0.07, hx + 0.135, hy, hz + 0.10, P.red);
  b.box(0.18, 0.18, 0.05, hx, hy, hz + 0.09, 0x0d0d0d);
  return new THREE.Mesh(b.build(), voxelMaterial());
}

// =============================================================================
// TURRET — ARROWHEAD / DIAMOND welded shell (hexagonal top view).
// =============================================================================
function buildTurretShell(b, P) {
  const H = 0.92, cy = 0.46;
  slab(b, 2.70, H, 1.85, 0, cy, -0.55, P.turMid, P.turHi, P.turLo);             // rear body
  slab(b, 1.10, H, 1.05, 0, cy, 0.78, P.turMid, P.turHi, P.turLo);             // front nose
  for (const sx of [-1, 1]) {                                                  // angled cheeks
    b.box(0.72, H,    1.45, sx * 0.985, cy,        0.775, P.turMid, { tint: 0.02, ry: sx * 0.69 });
    b.box(0.72, 0.12, 1.45, sx * 0.985, cy + 0.40, 0.775, P.turHi,  { ry: sx * 0.69 });
  }
  slab(b, 2.30, 0.60, 0.85, 0, 0.32, -1.92, P.bodyMid, P.bodyHi, P.bodyLo);    // rear bustle
  b.box(2.55, 0.10, 3.0, 0, 0.99, -0.30, P.turHi, { tint: 0.02 });            // roof plate
}
// Cheek ERA blocks + checkerboard soft-ERA band across the front.
function turretArmor(b, P) {
  // cheek ERA (on the angled bevels)
  for (const sx of [-1, 1]) {
    for (let r = 0; r < 2; r++) {
      era(b, P, 0.42, 0.22, 0.18, sx * 1.02, 0.42 + r * 0.30, 0.95, { ry: sx * 0.69 });
      era(b, P, 0.42, 0.22, 0.18, sx * 0.78, 0.42 + r * 0.30, 1.18, { ry: sx * 0.69 });
    }
  }
  // checkerboard soft-ERA band across the nose front (+Z face)
  checkerFront(b, P, -0.48, 0.18, 1.33, 0.24, 0.26, 5, 2);
  // short checker on each cheek (angled)
  for (const sx of [-1, 1]) checkerFront(b, P, sx * 0.7, 0.18, 1.0, sx * 0.26, 0.26, 3, 2, { ry: sx * 0.69 });
}
// Roof furniture: cupola, sights, RWS, antennas, hatches, sensor, smoke, rear cage.
function turretRoof(b, P) {
  // commander cupola ring (right) — hatch sits inside
  b.box(0.76, 0.42, 0.76, 0.7, 1.10, 0.18, P.turMid, { tint: 0.03 });
  b.box(0.76, 0.08, 0.76, 0.7, 1.32, 0.18, P.turHi);
  for (let s = 0; s < 6; s++) { const a = (s / 6) * Math.PI * 2;
    b.box(0.20, 0.10, 0.05, 0.7 + Math.cos(a) * 0.40, 1.12, 0.18 + Math.sin(a) * 0.40, P.slot, { ry: a }); }
  // panoramic sight (left)
  const pg = new THREE.CylinderGeometry(0.24, 0.24, 0.40, 10);
  b.geo(pg, -0.55, 1.16, 0.30, P.steelMid, { tint: 0.02 }); pg.dispose();
  b.box(0.20, 0.16, 0.14, -0.55, 1.40, 0.36, P.lens);
  // gunner sight housing (left-front)
  b.box(0.36, 0.32, 0.52, -0.78, 1.08, 0.85, P.steelMid, { tint: 0.02 });
  b.box(0.26, 0.14, 0.10, -0.78, 1.10, 1.13, P.lens);
  // RWS + 12.7 MG (right, near cupola)
  b.box(0.34, 0.30, 0.42, 0.7, 1.26, -0.55, P.steelMid, { tint: 0.02 });
  b.box(0.10, 0.10, 0.62, 0.7, 1.30, -0.28, P.steelHi);
  b.box(0.20, 0.16, 0.20, 0.7, 1.30, -0.72, P.slot);          // sight block
  // sensor box (light) on roof centre-left
  b.box(0.26, 0.22, 0.26, -0.15, 1.14, -0.30, P.steelHi, { tint: 0.02 });
  // 2 antennas (rear)
  b.box(0.05, 1.40, 0.05, 0.85, 1.72, -1.15, P.steelMid);
  b.box(0.05, 1.40, 0.05, -0.85, 1.66, -1.30, P.steelMid);
  // smoke-grenade launchers (angled tube clusters, front sides)
  for (const sx of [-1, 1]) {
    for (let t = 0; t < 4; t++) { const g = new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6);
      b.geo(g, sx * 1.05, 0.55 + t * 0.16, 0.55, P.steelMid, { rz: sx * 1.0, tint: 0.02 }); g.dispose(); }
    b.box(0.12, 0.78, 0.5, sx * 1.0, 0.78, 0.55, P.steelLo);
  }
  // rear slat cage on the bustle (facing -Z)
  slatCageZ(b, P, -1.05, 0.10, -2.42, 2.1, 0.75, 7, 3);
}

// ── 125 mm gun: barrel + thermal sleeve + bore evacuator + coax MG ──
function buildGun(P) {
  const b = new MeshBuilder();
  slab(b, 0.30, 0.30, 2.20, 0, 0, 1.20, P.steelMid, P.steelHi, P.steelLo);
  slab(b, 0.26, 0.26, 2.00, 0, 0, 3.40, P.steelMid, P.steelHi, P.steelLo);
  slab(b, 0.22, 0.22, 2.30, 0, 0, 5.15, P.steelMid, P.steelHi, P.steelLo);
  for (let s = 0; s < 9; s++) {
    b.box(0.34, 0.34, 0.08, 0, 0,    0.50 + s * 0.36, P.eraMid, { tint: 0.02 });
    b.box(0.34, 0.04, 0.08, 0, 0.18, 0.50 + s * 0.36, P.eraHi);
  }
  b.box(0.32, 0.30, 2.80, 0, 0, 1.65, P.eraLo, { tint: 0.02 });
  b.box(0.42, 0.42, 0.55, 0,  0,    3.82, P.steelMid, { tint: 0.02 });   // bore evacuator
  b.box(0.42, 0.06, 0.55, 0,  0.22, 3.82, P.steelHi);
  b.box(0.42, 0.05, 0.55, 0, -0.22, 3.82, P.steelLo);
  b.box(0.44, 0.08, 0.06, 0,  0,    3.54, P.steelLo);
  b.box(0.44, 0.08, 0.06, 0,  0,    4.10, P.steelLo);
  b.box(0.10, 0.10, 1.80, 0.28, -0.06, 1.00, P.steelLo, { tint: 0.02 });  // coax MG
  b.box(0.12, 0.05, 0.08, 0.28, -0.06, 1.92, P.slot);
  b.box(0.74, 0.64, 0.22, 0, 0, 0.12, P.turMid, { tint: 0.03 });          // mantlet cover
  b.box(0.74, 0.08, 0.22, 0, 0.32, 0.12, P.turHi);
  return b;
}

// ── Mitri commander bust — yellow 3-eyed Engendros plush ──
export function buildMitri() {
  const g = new THREE.Group();
  const b = new MeshBuilder();
  const dark = 0x1a1208, gold = 0xe8b430, yHi = 0xf5d050, yMid = 0xedc028, yLo = 0xc89810;
  b.box(0.60, 0.32, 0.44, 0,  0.12, 0, yMid, { tint: 0.03 });
  b.box(0.60, 0.05, 0.44, 0,  0.27, 0, yHi);
  b.box(0.60, 0.05, 0.44, 0, -0.03, 0, yLo);
  b.box(0.22, 0.14, 0.22, 0,  0.34, 0, yMid);
  b.box(0.62, 0.50, 0.60, 0, 0.69, 0, yMid, { tint: 0.02 });
  b.box(0.62, 0.07, 0.60, 0, 0.95, 0, yHi);
  b.box(0.62, 0.07, 0.60, 0, 0.45, 0, yLo);
  b.box(0.12, 0.40, 0.50, -0.37, 0.70, 0, yLo);
  b.box(0.12, 0.40, 0.50,  0.37, 0.70, 0, yLo);
  b.box(0.58, 0.44, 0.06, 0, 0.70, 0.31, yHi, { tint: 0.01 });
  for (let i = -1; i <= 1; i++) {
    const ex = i * 0.17, ey = 0.76, ez = 0.34;
    const disc = new THREE.CylinderGeometry(0.075, 0.075, 0.04, 10);
    disc.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    b.geo(disc, ex, ey, ez, gold, { tint: 0.04 }); disc.dispose();
    b.box(0.11, 0.025, 0.025, ex, ey, ez + 0.025, dark);
    b.box(0.025, 0.11, 0.025, ex, ey, ez + 0.025, dark);
  }
  for (const [sx, sy] of [[-0.22, 0.595], [-0.08, 0.565], [0.08, 0.565], [0.22, 0.595]]) {
    b.box(0.07, 0.025, 0.025, sx, sy, 0.365, dark);
    b.box(0.025, 0.07, 0.025, sx, sy, 0.365, dark);
  }
  b.box(0.06, 0.20, 0.06, -0.14, 1.07, 0.04, dark, { rx: 0.28, rz:  0.22 });
  b.box(0.05, 0.13, 0.05, -0.14, 1.21, 0.04, dark, { rx: 0.18, rz:  0.32 });
  b.box(0.06, 0.20, 0.06,  0.14, 1.07, 0.04, dark, { rx: 0.28, rz: -0.22 });
  b.box(0.05, 0.13, 0.05,  0.14, 1.21, 0.04, dark, { rx: 0.18, rz: -0.32 });
  g.add(new THREE.Mesh(b.build(), voxelMaterial()));
  g.position.set(0, 0.10, 0);
  return g;
}

// =============================================================================
// ASSEMBLY
// =============================================================================
export function buildTank(camo = 'desert') {
  const P = palette();
  const root = new THREE.Group(); root.name = 'tank';

  const hb = new MeshBuilder();
  buildHull(hb, P);
  glacisArmor(hb, P);
  root.add(new THREE.Mesh(hb.build(), voxelMaterial()));

  sideArmor(root, P, -1);
  sideArmor(root, P, 1);

  // running gear
  root.userData.roadWheels = [];
  for (const sx of [-1, 1]) {
    const wx = sx * 1.88;
    for (let i = 0; i < 6; i++) {
      const wm = roadWheel(P, wx, 2.45 - i * 0.96);
      wm.name = `roadWheel_${sx > 0 ? 'R' : 'L'}_${i}`;
      root.add(wm); root.userData.roadWheels.push(wm);
    }
    root.add(idler(P, wx, 3.25));
    const spr = sprocket(P, wx, -3.25);
    root.add(spr);
    if (sx < 0) root.userData.sprocketL = spr; else root.userData.sprocketR = spr;
    root.add(returnRoller(P, wx, 1.6));
    root.add(returnRoller(P, wx, -0.6));
  }

  const trackL = trackBand(P, -1); trackL.name = 'trackL';
  const trackR = trackBand(P,  1); trackR.name = 'trackR';
  root.add(trackL); root.userData.trackL = trackL;
  root.add(trackR); root.userData.trackR = trackR;

  // headlamps (red rings) flanking the glacis chevron + SpotLights
  root.userData.headlamps = [];
  root.userData.headlampLights = [];
  for (const hx of [-0.92, 0.92]) {
    const lm = headlamp(P, hx, 1.48, 3.05);
    lm.name = `headlamp_${hx < 0 ? 'L' : 'R'}`;
    root.add(lm); root.userData.headlamps.push(lm);
    const sl = new THREE.SpotLight(0xfff0c0, 0, 34, 0.5, 0.4, 1.5);
    sl.castShadow = false; sl.position.set(hx, 1.48, 3.2);
    const tgt = new THREE.Object3D(); tgt.position.set(hx, 1.3, 30.0);
    root.add(sl); root.add(tgt); sl.target = tgt;
    root.userData.headlampLights.push(sl);
  }

  // turret (yaw)
  const turret = new THREE.Group();
  turret.position.set(0, 1.65, -0.4);
  root.add(turret); root.userData.turret = turret;
  const turB = new MeshBuilder();
  buildTurretShell(turB, P);
  turretArmor(turB, P);
  turretRoof(turB, P);
  turret.add(new THREE.Mesh(turB.build(), voxelMaterial()));

  // gun mantlet (pitch) → recoil → barrel
  const gunMantlet = new THREE.Group();
  gunMantlet.position.set(0, 0.5, 1.3);
  turret.add(gunMantlet);
  turret.userData.gunMantlet = gunMantlet; root.userData.gunMantlet = gunMantlet;
  const recoilNode = new THREE.Group();
  gunMantlet.add(recoilNode);
  gunMantlet.userData.recoilNode = recoilNode; root.userData.recoilNode = recoilNode;
  recoilNode.add(new THREE.Mesh(buildGun(P).build(), voxelMaterial()));
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, 6.3);
  recoilNode.add(muzzle); root.userData.muzzle = muzzle;

  const mgMuzzle = new THREE.Object3D(); mgMuzzle.position.set(0.7, 1.3, -0.1);
  turret.add(mgMuzzle); root.userData.mgMuzzle = mgMuzzle;

  // commander hatch (y 1.0 stowed → 1.6 peek) + Mitri
  const hatch = new THREE.Group();
  hatch.position.set(0.7, 1.0, 0.18);
  turret.add(hatch); root.userData.hatch = hatch;
  const hb2 = new MeshBuilder();
  hb2.box(0.64, 0.07, 0.64, 0, 0.04, 0, P.steelMid, { tint: 0.02 });
  hb2.box(0.64, 0.02, 0.64, 0, 0.08, 0, P.steelHi);
  hatch.add(new THREE.Mesh(hb2.build(), voxelMaterial()));
  const mitri = buildMitri(); mitri.visible = true;
  hatch.add(mitri); root.userData.mitri = mitri;

  return root;
}

// ── Scorched wreck ──
function wreckPalette() {
  return {
    bodyHi: 0x2a2a2a, bodyMid: 0x1e1e1e, bodyLo: 0x141414,
    turHi:  0x222218, turMid:  0x1a1a10, turLo:  0x111108,
    eraHi:  0x33281e, eraMid:  0x261c12, eraLo:  0x1a1008,
    steelHi:0x303030, steelMid:0x222222, steelLo:0x141414,
    softDark:0x0a0a0a, softBlue:0x14161a, red:0x3a0a08,
    slot: 0x0a0a0a, rubber: 0x111111,
    wheelHi:0x282828, wheelMid:0x1c1c1c, wheelLo:0x101010,
    trackHi:0x1a1a1a, trackLo:0x0a0a0a, cage:0x1e1e1e, lens:0x080808,
  };
}
export function buildTankWreck() {
  const P = wreckPalette();
  const root = new THREE.Group(); root.name = 'tankWreck';
  const hb = new MeshBuilder();
  buildHull(hb, P);
  root.add(new THREE.Mesh(hb.build(), voxelMaterial()));
  sideArmor(root, P, -1); sideArmor(root, P, 1);
  for (const sx of [-1, 1]) {
    const wx = sx * 1.88;
    for (let i = 0; i < 6; i++) root.add(roadWheel(P, wx, 2.45 - i * 0.96));
    root.add(idler(P, wx, 3.25)); root.add(sprocket(P, wx, -3.25));
  }
  root.add(trackBand(P, -1)); root.add(trackBand(P, 1));
  const turret = new THREE.Group();
  turret.position.set(0.3, 1.65, -0.4);
  turret.rotation.set(0.08, 0.52, -0.06);
  root.add(turret);
  const turB = new MeshBuilder();
  buildTurretShell(turB, P);
  turret.add(new THREE.Mesh(turB.build(), voxelMaterial()));
  const gunGroup = new THREE.Group();
  gunGroup.position.set(0, 0.5, 1.3); gunGroup.rotation.x = 0.30;
  turret.add(gunGroup);
  const gb = new MeshBuilder();
  slab(gb, 0.30, 0.30, 2.20, 0, 0, 1.20, P.steelMid, P.steelHi, P.steelLo);
  slab(gb, 0.26, 0.26, 2.00, 0, 0, 3.40, P.steelMid, P.steelHi, P.steelLo);
  slab(gb, 0.22, 0.22, 1.60, 0, 0, 5.05, P.steelMid, P.steelHi, P.steelLo);
  gb.box(0.42, 0.42, 0.55, 0, 0, 3.82, P.steelMid);
  gb.box(0.74, 0.64, 0.22, 0, 0, 0.12, P.turMid);
  gunGroup.add(new THREE.Mesh(gb.build(), voxelMaterial()));
  return root;
}
