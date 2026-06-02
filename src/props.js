// props.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';
import { MeshBuilder, TAU, ri, rr, shade, voxelMaterial } from './util.js';


// ---------------------------------------------------------------------------
// FLOPO — the flower-plush hero (engendros.cl "Flopo"). A chubby cyan plush
// with pink flower petals around the head + a pink petal collar, a big button
// eye w/ pink X (left) and a SMALLER bead eye (right, not winking), and a
// stitched smile. Built from SMOOTH rounded shapes (so it reads soft & cute),
// and as a RIGGED hierarchy (separate head / body / arm / leg pivot Groups)
// so it's ready for movement animation. Returns a THREE.Group; the animatable
// parts are exposed on group.userData.parts. opts.skin/opts.petal recolor it.
// ---------------------------------------------------------------------------
export function buildFlopo(opts = {}) {
  const root = new THREE.Group();
  const cyan = opts.skin || 0x49c6df, cyLo = shade(cyan, -0.1);
  const pink = opts.petal || 0xe85ba0, pkHi = shade(pink, 0.1);
  const stitch = 0x14223e, dark = 0x161210;
  // smooth ellipsoid blob (high-detail icosahedron → soft & round). o: {det,rx,ry,rz,tint}
  const blob = (b, x, y, z, sx, sy, sz, col, o = {}) => { const g = new THREE.IcosahedronGeometry(1, o.det ?? 3); b.geo(g, x, y, z, col, { sx, sy, sz, rx: o.rx || 0, ry: o.ry || 0, rz: o.rz || 0, tint: o.tint ?? 0.02 }); g.dispose(); };
  const mesh = (b, name) => { const m = new THREE.Mesh(b.build(), voxelMaterial()); m.castShadow = true; m.name = name; return m; };

  // ---- BODY (plump rounded egg, a touch wider at the bottom) ----
  const bodyGroup = new THREE.Group(); root.add(bodyGroup);
  { const b = new MeshBuilder();
    blob(b, 0, 0.86, 0, 0.47, 0.5, 0.43, cyan);
    blob(b, 0, 0.56, 0.01, 0.44, 0.32, 0.41, cyan, { det: 2 }); // chubby lower belly
    b.box(0.018, 0.5, 0.02, 0, 0.8, 0.42, cyLo, { tint: 0.015 }); // subtle front seam
    bodyGroup.add(mesh(b, 'body'));
  }
  // ---- LEGS (little rounded feet; pivots at the hips) ----
  const legL = new THREE.Group(); legL.position.set(-0.2, 0.42, 0.02); root.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.2, 0.42, 0.02); root.add(legR);
  for (const g of [legL, legR]) { const b = new MeshBuilder(); blob(b, 0, -0.18, 0.05, 0.18, 0.22, 0.24, cyan, { det: 2 }); g.add(mesh(b, 'leg')); }
  // ---- ARMS (short rounded stubs; pivots at the shoulders) ----
  const armL = new THREE.Group(); armL.position.set(-0.45, 1.02, 0); root.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.45, 1.02, 0); root.add(armR);
  for (const [g, s] of [[armL, -1], [armR, 1]]) { const b = new MeshBuilder(); blob(b, s * 0.03, -0.17, 0, 0.18, 0.25, 0.18, cyan, { det: 2 }); g.add(mesh(b, 'arm')); }

  // ---- HEAD (big smooth ball + flower petals + collar ruff + face); pivot at the neck ----
  const headGroup = new THREE.Group(); headGroup.position.set(0, 1.22, 0); root.add(headGroup);
  const HY = 0.6; // head-centre local y
  { const b = new MeshBuilder();
    // collar ruff — smooth flat ovals, horizontal around the neck
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; blob(b, Math.cos(a) * 0.36, 0.02, Math.sin(a) * 0.36, 0.22, 0.08, 0.14, i % 2 ? pink : pkHi, { det: 1, ry: -a, tint: 0.03 }); }
    // flower petals — smooth flat ovals around the head (skip the very bottom)
    const PA = [0.07, 0.29, 0.5, 0.71, 0.93, 1.12, 1.88];
    PA.forEach((p, idx) => { const a = p * Math.PI; blob(b, Math.cos(a) * 0.58, HY + Math.sin(a) * 0.55, 0.05, 0.36, 0.25, 0.09, idx % 2 ? pink : pkHi, { det: 2, rz: a, tint: 0.03 }); });
    // head ball (smooth cyan plush)
    blob(b, 0, HY, 0, 0.64, 0.6, 0.6, cyan);
    headGroup.add(mesh(b, 'head'));

    // face features (smooth button + stitches) on a second mesh
    const f = new MeshBuilder();
    const fz = 0.55;
    // big button eye + pink X (viewer-left, -x)
    (function (x, y, r) {
      const o = new THREE.CylinderGeometry(r, r, 0.06, 18); f.geo(o, x, y, fz, dark, { rx: Math.PI / 2 }); o.dispose();
      const ri = new THREE.CylinderGeometry(r * 0.78, r * 0.78, 0.07, 18); f.geo(ri, x, y, fz + 0.012, 0x2a221d, { rx: Math.PI / 2 }); ri.dispose();
      f.box(r * 1.05, 0.035, 0.05, x, y, fz + 0.06, 0xff6ab0, { rz: 0.785 }); f.box(r * 1.05, 0.035, 0.05, x, y, fz + 0.06, 0xff6ab0, { rz: -0.785 });
      for (const [hx, hy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) f.box(0.022, 0.022, 0.06, x + hx * r * 0.4, y + hy * r * 0.4, fz + 0.045, 0x0c0a08);
    })(-0.23, HY + 0.07, 0.16);
    // SMALL bead eye (viewer-right, +x) — open, not winking
    { const x = 0.25, y = HY + 0.05, r = 0.078;
      const o = new THREE.CylinderGeometry(r, r, 0.05, 14); f.geo(o, x, y, fz, dark, { rx: Math.PI / 2 }); o.dispose();
      f.box(0.028, 0.028, 0.05, x - 0.02, y + 0.02, fz + 0.03, 0x53535c); } // glint
    f.box(0.16, 0.022, 0.04, 0.26, HY + 0.21, fz, stitch, { rz: -0.32 }); // small eyebrow over the right eye
    // wide stitched smile w/ cross-stitches
    { const cy = HY - 0.3, hW = 0.36, k = 0.16 / (0.36 * 0.36);
      for (let i = 0; i <= 10; i++) { const x = -hW + (i / 10) * 2 * hW, y = cy + k * x * x, ang = Math.atan(2 * k * x);
        f.box(0.095, 0.03, 0.04, x, y, fz, stitch, { rz: ang }); }
      for (const x of [-0.29, -0.08, 0.14, 0.31]) { const y = cy + k * x * x; // cross-stitches ON the smile line
        f.box(0.06, 0.028, 0.05, x, y, fz + 0.006, stitch, { rz: 0.7 }); f.box(0.06, 0.028, 0.05, x, y, fz + 0.006, stitch, { rz: -0.7 }); }
    }
    const fm = new THREE.Mesh(f.build(), voxelMaterial()); fm.name = 'face'; headGroup.add(fm);
  }

  root.userData.parts = { body: bodyGroup, head: headGroup, armL, armR, legL, legR };
  root.userData.isFlopo = true;
  return root;
}

// ---------------------------------------------------------------------------
// Fortification structure meshes (layered-shade voxel, one merged mesh each).
// Built once; geometry shared by the ghost preview + all placed copies.
// ---------------------------------------------------------------------------
export function buildSandbags() {
  const b = new MeshBuilder();
  const hi = 0xd8c79b, mid = 0xcdb887, lo = 0xb89a5e, seam = 0x96804f;
  const bagH = 0.25, bagD = 0.66, courses = 4;
  const bag = (x, y, z) => {
    b.box(0.56, bagH, bagD, x, y, z, mid, { tint: 0.06, ry: rr(-0.05, 0.05) });        // body
    b.box(0.50, bagH * 0.55, bagD * 0.9, x, y + bagH * 0.30, z, hi, { tint: 0.05 });    // lit rounded top
    b.box(0.55, bagH * 0.3, bagD * 0.96, x, y - bagH * 0.34, z, lo);                    // shadowed underside
    b.box(0.58, 0.02, bagD * 0.5, x, y - bagH * 0.5, z, seam);                          // seam line
    b.box(0.06, 0.06, 0.06, x - 0.27, y, z + rr(-0.15, 0.15), seam);                    // tied-end nub
  };
  for (let c = 0; c < courses; c++) {
    const y = bagH * 0.5 + c * bagH * 0.92;
    const odd = c % 2, startX = -0.84 + (odd ? 0.21 : 0), n = odd ? 4 : 5;
    for (let i = 0; i < n; i++) bag(startX + i * 0.42, y, 0);
  }
  return new THREE.Mesh(b.build(), voxelMaterial());
}

export function buildBarbedWire() {
  const b = new MeshBuilder();
  const wHi = 0x6e5230, wMid = 0x533d22, wLo = 0x3a2916, wire = 0x9aa0a6, barb = 0xc2c6cc;
  const halfW = 1.1, topY = 0.82, dep = 0.42;
  for (const sx of [-1, 1]) {                                   // wooden X-trestles at both ends
    const x = sx * halfW;
    _strut(b, [x, 0.02, -dep], [x, topY, dep], 0.09, wMid, { tint: 0.05 });
    _strut(b, [x, 0.02, dep], [x, topY, -dep], 0.09, wMid, { tint: 0.05 });
    b.box(0.07, 0.07, dep * 2.2, x, topY * 0.52, 0, wLo);                          // cross-brace
    b.box(0.13, 0.1, 0.13, x, 0.04, -dep, wLo); b.box(0.13, 0.1, 0.13, x, 0.04, dep, wLo); // feet
  }
  for (const ry of [topY * 0.55, topY * 0.95]) b.box(halfW * 2, 0.06, 0.06, 0, ry, 0, wHi, { tint: 0.05 }); // rails
  for (const ry of [topY * 0.5, topY * 0.72, topY * 0.95]) {   // zig-zag barbed strands
    let px = -halfW, pz = -0.12, py = ry; const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const nx = -halfW + (i / steps) * halfW * 2, nz = (i % 2 ? 0.12 : -0.12), ny = ry + (i % 2 ? 0.05 : -0.05);
      _strut(b, [px, py, pz], [nx, ny, nz], 0.018, wire);
      b.box(0.055, 0.02, 0.02, (px + nx) / 2, (py + ny) / 2, (pz + nz) / 2, barb, { rz: 0.6 });
      px = nx; pz = nz; py = ny;
    }
  }
  return new THREE.Mesh(b.build(), voxelMaterial());
}

export function buildBarricade() {
  const b = new MeshBuilder();
  const wHi = 0x9a7038, wMid = 0x7a5530, wLo = 0x5a3f22, nail = 0x2a2c30, metal = 0x6a6e74;
  const W = 2.3, H = 1.5, t = 0.12;
  for (let i = 0; i < 5; i++) {                                 // stacked horizontal planks
    const y = 0.18 + i * 0.31;
    b.box(W, 0.27, t, 0, y, 0, wMid, { tint: 0.07 });
    b.box(W, 0.05, t * 1.05, 0, y + 0.12, 0, wHi);             // lit top edge
    b.box(W, 0.04, t * 1.05, 0, y - 0.12, 0, wLo);             // shadow
    b.box(0.05, 0.05, 0.05, -W * 0.45, y, t * 0.6, nail); b.box(0.05, 0.05, 0.05, W * 0.45, y, t * 0.6, nail);
  }
  for (const sx of [-1, 1]) b.box(0.16, H, t * 1.2, sx * W * 0.42, H * 0.5, -0.01, wLo, { tint: 0.04 }); // posts
  _strut(b, [-W * 0.4, 0.1, 0.05], [W * 0.4, H - 0.1, 0.05], 0.13, wHi, { tint: 0.04 });                 // diagonal brace
  b.box(W * 0.5, 0.34, 0.02, -W * 0.15, H * 0.62, t * 0.7, metal, { tint: 0.05 });                       // rusty metal strip
  _strut(b, [W * 0.3, H * 0.7, 0], [W * 0.3, 0.02, -0.55], 0.12, wMid);                                  // prop leg
  return new THREE.Mesh(b.build(), voxelMaterial());
}

// Voxel Su-24M "Fencer" — the supply-drop plane. Built nose toward -Z, ~16u long.
// Reads from the ground by silhouette: pointed nose, wide side-by-side cockpit,
// rectangular side intakes, high swing wings, single swept fin + tailplanes, twin exhausts.
export function buildSu24() {
  const b = new MeshBuilder();
  const gHi = 0xb8c2cc, gMid = 0x97a2ad, gLo = 0x6e7882, gDark = 0x3a4048, gSeam = 0x5a636d, glass = 0x0e1118, accent = 0xc6332a, brass = 0x4a3a2e;
  // filled 5-point Soviet red star via ShapeGeometry (no gaps between rays)
  const starShape = (R) => { const sh = new THREE.Shape(); const n = 5, ri = R * 0.42; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU - Math.PI / 2, r = (i % 2 === 0) ? R : ri, x = Math.cos(a) * r, y = Math.sin(a) * r; if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y); } sh.closePath(); return sh; };
  const star = (x, y, z, R, opts = {}) => { const sg = new THREE.ShapeGeometry(starShape(R)); b.geo(sg, x, y, z, accent, opts); sg.dispose(); };
  // ---- fuselage (solid, overlapping boxes) ----
  b.box(1.55, 1.25, 9.5, 0, 0, -0.3, gMid, { tint: 0.02 });
  b.box(1.2, 0.5, 8.6, 0, 0.5, -0.4, gHi, { tint: 0.02 });
  b.box(1.46, 0.4, 8.8, 0, -0.55, -0.4, gLo);
  for (const z of [-3.2, -1.0, 1.0, 2.8]) b.box(1.5, 0.02, 0.05, 0, 0.62, z, gSeam);
  b.box(0.05, 0.02, 7.0, 0.55, 0.55, -0.4, gSeam); b.box(0.05, 0.02, 7.0, -0.55, 0.55, -0.4, gSeam);
  // ---- smooth tapered radome: frustum → cone (no block staircase), flattened to match the fuselage, slight droop ----
  const FL = 0.82; // vertical flatten — the radome is wider than tall, like the fuselage cross-section
  const nFrust = new THREE.CylinderGeometry(0.5, 0.72, 2.4, 14, 1); nFrust.scale(1, 1, FL);
  b.geo(nFrust, 0, 0.0, -6.1, gMid, { rx: -Math.PI / 2, tint: 0.02 }); nFrust.dispose();   // fuselage → radome blend
  const nCone = new THREE.ConeGeometry(0.5, 2.6, 14, 1); nCone.scale(1, 1, FL);
  b.geo(nCone, 0, -0.06, -8.6, gMid, { rx: -Math.PI / 2, tint: 0.02 }); nCone.dispose();    // pointed radome (smooth-shaded)
  // pitot air-data boom + tip at the very nose
  const boom = new THREE.CylinderGeometry(0.045, 0.06, 0.8, 8); b.geo(boom, 0, -0.1, -10.2, gDark, { rx: Math.PI / 2 }); boom.dispose();
  const bTip = new THREE.ConeGeometry(0.04, 0.22, 8); b.geo(bTip, 0, -0.1, -10.7, gDark, { rx: -Math.PI / 2 }); bTip.dispose();
  // side air-data probes + a small under-nose sensor window
  for (const s of [-1, 1]) b.box(0.34, 0.03, 0.03, s * 0.4, 0.04, -8.0, gDark);
  b.box(0.34, 0.16, 0.5, 0, -0.42, -7.5, glass);
  // ---- side-by-side 2-seat cockpit: raked windscreen, faceted reflective canopy, metal frames ----
  const refl = 0x4a7088, reflHi = 0x6f9bb2; // cool glass reflections (so the canopy reads as glass, not a black box)
  b.box(1.5, 0.5, 2.0, 0, 0.5, -4.2, gMid, { tint: 0.02 });          // cockpit tub
  b.box(1.3, 0.12, 0.36, 0, 0.66, -5.05, 0x14161a);                  // glareshield / coaming
  b.box(1.26, 0.5, 0.08, 0, 0.86, -5.0, glass, { rx: 0.55 });        // raked windscreen glass (leans up-and-back)
  b.box(1.3, 0.08, 0.1, 0, 1.04, -4.84, gMid, { rx: 0.55 });         // windscreen top frame bow
  b.box(0.6, 0.05, 0.03, 0, 1.0, -4.8, reflHi, { rx: 0.55 });        // glare reflection on the glass
  b.box(1.16, 0.34, 1.55, 0, 0.84, -4.0, glass, { tint: 0.02 });     // canopy (wide lower)
  b.box(0.86, 0.22, 1.5, 0, 1.08, -4.0, glass);                      // canopy crown (narrow → tumblehome)
  b.box(0.5, 0.05, 1.34, -0.05, 1.205, -4.0, refl, { tint: 0.04 });  // top reflection sheen (proud)
  b.box(0.06, 0.3, 1.34, 0.59, 0.84, -4.0, reflHi);                  // side glint (proud)
  b.box(0.12, 0.14, 1.7, 0.585, 0.72, -4.0, gMid); b.box(0.12, 0.14, 1.7, -0.585, 0.72, -4.0, gMid); // canopy sills
  b.box(0.07, 0.62, 1.55, 0, 0.86, -4.0, gMid);                      // fore-aft centre divider (between the 2 seats)
  b.box(1.2, 0.12, 0.16, 0, 1.04, -3.22, gMid, { rx: 0.45 });        // rear canopy bow
  b.box(1.1, 0.34, 0.6, 0, 0.66, -2.95, gMid, { tint: 0.02 });       // turtle-deck fairing into the spine
  // ---- rectangular side intakes (flush, splitter, lit lip) ----
  for (const s of [-1, 1]) {
    b.box(0.62, 1.02, 2.9, s * 1.0, -0.05, -2.1, gMid, { tint: 0.02 });
    b.box(0.44, 0.84, 0.26, s * 1.08, -0.05, -3.6, gDark);
    b.box(0.66, 0.12, 2.5, s * 1.0, 0.47, -2.1, gHi);
    b.box(0.1, 0.86, 2.5, s * 0.72, -0.02, -2.1, gLo);
    b.box(0.64, 0.02, 1.7, s * 1.0, -0.02, -2.1, gSeam);
  }
  // ---- high variable-sweep wings: fixed glove (~69°) + movable outer panel (45°) + pivot cover ----
  for (const s of [-1, 1]) {
    b.box(2.8, 0.34, 3.2, s * 1.35, 0.37, 0.1, gMid, { ry: -s * 1.0, tint: 0.02 });
    b.box(5.2, 0.18, 1.5, s * 4.4, 0.38, 0.95, gHi, { ry: -s * 0.7, tint: 0.02 });
    b.box(5.2, 0.04, 0.2, s * 4.4, 0.31, 1.6, gSeam, { ry: -s * 0.7 });
    const pc = new THREE.CylinderGeometry(0.42, 0.42, 0.55, 14); b.geo(pc, s * 2.5, 0.4, 0.25, gLo, { rz: Math.PI / 2 }); pc.dispose();
    b.box(0.05, 0.22, 1.0, s * 3.6, 0.5, 0.95, gLo, { ry: -s * 0.7 });
    star(s * 3.7, 0.49, 1.0, 0.5, { rx: -Math.PI / 2 });   // top: lie FLAT on the wing (no ry — Euler XYZ would tilt it ~40°)
    star(s * 3.7, 0.27, 1.0, 0.42, { rx: Math.PI / 2 });   // underside: faces straight down
    b.box(0.22, 0.28, 0.66, s * 3.0, 0.16, 0.6, gDark, { ry: -s * 0.7 });
    b.box(0.34, 0.34, 2.0, s * 3.0, -0.08, 0.6, gLo, { ry: -s * 0.7, tint: 0.03 });
  }
  // ---- single swept vertical tail ----
  b.box(0.22, 2.0, 1.7, 0, 1.45, 3.6, gMid, { tint: 0.02 });
  b.box(0.18, 0.95, 1.6, 0, 1.05, 4.05, gHi, { rx: -0.5 });
  b.box(0.28, 0.42, 0.7, 0, 2.32, 4.25, gLo);
  b.box(0.05, 1.5, 0.05, 0, 1.5, 4.4, gSeam);
  star(0.12, 1.55, 3.85, 0.34, { ry: Math.PI / 2 }); star(-0.12, 1.55, 3.85, 0.34, { ry: -Math.PI / 2 });
  // ---- twin all-moving horizontal stabilizers ----
  for (const s of [-1, 1]) b.box(3.6, 0.16, 1.4, s * 2.0, 0.1, 4.4, gMid, { ry: -s * 0.6, tint: 0.02 });
  // ---- twin round exhausts: solid rear block + nozzles + heat-stain + petals + dark core ----
  b.box(1.6, 1.05, 1.4, 0, -0.05, 4.7, gLo, { tint: 0.02 });
  for (const s of [-1, 1]) {
    const cx = s * 0.48;
    const noz = new THREE.CylinderGeometry(0.45, 0.52, 1.5, 16); b.geo(noz, cx, -0.05, 5.6, gDark, { rx: Math.PI / 2 }); noz.dispose();
    const stain = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 16); b.geo(stain, cx, -0.05, 5.0, brass, { rx: Math.PI / 2 }); stain.dispose();
    const core = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 14); b.geo(core, cx, -0.05, 6.25, 0x0c0e12, { rx: Math.PI / 2 }); core.dispose();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; b.box(0.08, 0.14, 0.32, cx + Math.cos(a) * 0.45, -0.05 + Math.sin(a) * 0.45, 6.25, 0x2a2e34, { rz: a }); }
  }
  // ---- belly: cannon fairing + centreline tank + gear-door seams + underside star ----
  b.box(0.7, 0.55, 3.4, 0, -0.86, -0.4, gLo, { tint: 0.03 });
  b.box(0.45, 0.32, 1.6, 0.26, -0.68, -3.2, gDark);
  b.box(1.0, 0.02, 0.05, 0, -0.74, -1.4, gSeam); b.box(0.05, 0.02, 2.4, 0.4, -0.74, -1.4, gSeam); b.box(0.05, 0.02, 2.4, -0.4, -0.74, -1.4, gSeam);
  star(0, -0.78, -1.7, 0.5, { rx: Math.PI / 2 });
  const m = new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x222831, emissiveIntensity: 0.5 }));
  m.castShadow = false; m.frustumCulled = false;
  return m;
}

// Bake a thin "strut" box spanning a→c into builder b (risers / shroud lines / sling legs).
export function _strut(b, a, c, w, color, opts = {}) {
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 0.001;
  const g = new THREE.BoxGeometry(w, len, w);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len)));
  g.translate((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
  b.geo(g, 0, 0, 0, color, opts); g.dispose();
  return b;
}

// A small steel carabiner / lifting link at (x,y,z): an oval ring + a gate bar.
// `face` (radians) yaws the ring so it faces outward along a chosen direction.
function _carabiner(b, x, y, z, r, face, mHi, mMid, mLo) {
  const ring = new THREE.TorusGeometry(r, r * 0.28, 7, 14);
  b.geo(ring, x, y, z, mMid, { ry: face, tint: 0.02 }); ring.dispose();
  const top = new THREE.TorusGeometry(r, r * 0.28, 7, 14);   // lit upper arc
  b.geo(top, x, y + r * 0.05, z, mHi, { ry: face, sx: 0.96, sy: 0.5, sz: 0.96 }); top.dispose();
  b.box(r * 1.7, r * 0.34, r * 0.34, x, y, z, mLo, { ry: face });   // spring gate bar across the link
}

// ---------------------------------------------------------------------------
// Supply drop — a palletised crate under a strapped olive tarp, slung beneath a
// segmented parachute by crossed risers + steel carabiners. Shared by the shop
// preview (_crate) and the air-dropped version (_spawnDropCrate).
// ---------------------------------------------------------------------------
export function buildSupplyCrate() {
  const b = new MeshBuilder();
  // layered-shading palette
  const tHi = 0x6f8c4c, tMid = 0x52702f, tLo = 0x3b5021, tSlot = 0x2a3a18;   // olive tarp canvas
  const wHi = 0x9c7240, wMid = 0x7b5530, wLo = 0x573a20, wSlot = 0x3a2613;   // weathered pallet wood
  const cMid = 0x37461f, cHi = 0x47592a;                                      // dark cargo container
  const sMid = 0x26281d, sHi = 0x363a2b, sLo = 0x16170f;                      // nylon cargo strap
  const mHi = 0x9aa0aa, mMid = 0x646a73, mLo = 0x43474e;                      // steel hardware
  const tan = 0xb7a76a;                                                        // stencil marking

  // ---- wooden pallet base: 3 stringer feet + slatted top deck with gaps ----
  for (const sx of [-0.56, 0, 0.56]) b.box(0.2, 0.18, 1.5, sx, 0.09, 0, wLo, { tint: 0.04 });
  b.box(1.54, 0.02, 1.54, 0, 0.14, 0, wSlot);                                  // shadow plane → reads as deck gaps
  for (let i = 0; i < 5; i++) {
    const z = -0.6 + i * 0.3;
    b.box(1.52, 0.07, 0.2, 0, 0.215, z, wMid, { tint: 0.05 });
    b.box(1.52, 0.014, 0.2, 0, 0.255, z, wHi);                                 // lit board top
  }

  // ---- cargo container on the pallet (mostly hidden under the tarp) ----
  b.box(1.34, 0.86, 1.34, 0, 0.7, 0, cMid, { tint: 0.03 });
  b.box(1.4, 0.18, 1.4, 0, 0.36, 0, wMid, { tint: 0.04 });                     // wooden base band peeking below the hem
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, 0.46, 0.08, sx * 0.67, 0.47, sz * 0.67, wHi); // corner posts
  b.box(1.22, 0.05, 1.22, 0, 1.12, 0, cHi);                                    // lid just under the tarp

  // ---- olive tarp: lit top panel + wrinkle ridges ----
  b.box(1.58, 0.12, 1.58, 0, 1.2, 0, tHi, { tint: 0.03 });
  b.box(0.16, 0.07, 1.42, -0.2, 1.27, 0.04, tMid);
  b.box(0.12, 0.06, 1.2, 0.28, 1.27, -0.12, tHi);
  b.box(1.3, 0.06, 0.13, 0.06, 1.27, 0.3, tMid);
  // ---- tarp drape down all four sides (ragged hem heights) ----
  const hemY = { '+z': 0.5, '-z': 0.44, '+x': 0.54, '-x': 0.47 };
  const drape = (face, sx, sz) => {
    const long = 1.6, hY = hemY[face], topY = 1.24, h = topY - hY, cy = (topY + hY) / 2;
    const fx = sx * 0.8, fz = sz * 0.8;
    const dims = sx ? [0.1, h, long] : [long, h, 0.1];
    b.box(dims[0], dims[1], dims[2], fx, cy, fz, tMid, { tint: 0.02 });            // main drape panel
    const lip = sx ? [0.12, 0.13, long] : [long, 0.13, 0.12];
    b.box(lip[0], lip[1], lip[2], fx + sx * 0.005, hY + 0.02, fz + sz * 0.005, tLo); // shadowed hem fold
    // two ragged hem tongues hanging a touch lower — kept flush ON the face so nothing floats
    for (const o of [-0.38, 0.32]) {
      const ox = sx ? 0 : o, oz = sx ? o : 0;
      b.box(sx ? 0.12 : 0.22, 0.16, sx ? 0.22 : 0.12, fx + ox, hY - 0.03, fz + oz, tLo);
    }
  };
  drape('+z', 0, 1); drape('-z', 0, -1); drape('+x', 1, 0); drape('-x', -1, 0);

  // ---- "SUPPLIES" stencil patch on the front (+z) drape ----
  b.box(0.66, 0.2, 0.02, -0.05, 0.74, 0.86, tan, { tint: 0.03 });
  for (let i = 0; i < 5; i++) b.box(0.03, 0.13, 0.02, -0.28 + i * 0.11, 0.74, 0.875, tSlot); // faux stencil bars

  // ---- dark nylon cargo straps wrapping over the top + down the sides ----
  const strapW = 0.12;
  for (const x of [-0.3, 0.3]) {                                                  // straps running front↔back (over top in z)
    b.box(strapW, 0.05, 1.66, x, 1.27, 0, sMid, { tint: 0.02 });
    b.box(strapW, 0.018, 1.66, x, 1.3, 0, sHi);
    for (const sz of [-1, 1]) b.box(strapW, 1.0, 0.06, x, 0.74, sz * 0.83, sMid, { tint: 0.02 });
  }
  for (const z of [-0.3, 0.3]) {                                                  // straps running left↔right (cross over the top)
    b.box(1.66, 0.05, strapW, 0, 1.31, z, sMid, { tint: 0.02 });
    b.box(1.66, 0.018, strapW, 0, 1.34, z, sHi);
    for (const sx of [-1, 1]) b.box(0.06, 1.0, strapW, sx * 0.83, 0.74, z, sMid, { tint: 0.02 });
  }
  // ---- cam buckles (steel) — one on each side's strap ----
  const buckle = (x, y, z, ry) => {
    b.box(0.18, 0.22, 0.07, x, y, z, mMid, { ry, tint: 0.02 });
    b.box(0.2, 0.06, 0.08, x, y + 0.08, z, mHi, { ry });
    b.box(0.13, 0.04, 0.09, x, y - 0.02, z, mLo, { ry });
  };
  buckle(0.3, 0.6, 0.85, 0); buckle(-0.3, 0.6, -0.85, 0);
  buckle(0.85, 0.6, -0.3, Math.PI / 2); buckle(-0.85, 0.6, 0.3, Math.PI / 2);

  // ---- four steel lifting carabiners at the top corners (stay on after landing) ----
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(0.1, 0.14, 0.1, sx * 0.58, 1.3, sz * 0.58, mLo);                       // welded D-ring base
    _carabiner(b, sx * 0.58, 1.42, sz * 0.58, 0.1, Math.atan2(sx, sz), mHi, mMid, mLo);
  }

  return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x000000, emissiveIntensity: 0 }));
}

// The airborne rigging: segmented olive canopy + crossed risers/shrouds + apex
// carabiner. Returns { canopy, rig } so the falling drop can hide both on landing.
export function buildChuteRig() {
  const tHi = 0x6f8c4c, tMid = 0x52702f;
  const sMid = 0x26281d, mHi = 0x9aa0aa, mMid = 0x646a73, mLo = 0x43474e;
  const R = 2.5, SEGS = 10, FLAT = 0.6, hubY = 2.98, apexY = 2.62;

  // ---- segmented parachute canopy (alternating panel shades) ----
  const cb = new MeshBuilder();
  for (let i = 0; i < SEGS; i++) {
    const wedge = new THREE.SphereGeometry(R, 5, 4, (i / SEGS) * TAU, TAU / SEGS, 0, Math.PI * 0.47);
    cb.geo(wedge, 0, 0, 0, i % 2 ? tMid : tHi, { sy: FLAT, tint: 0.015 }); wedge.dispose();
  }
  const canopy = new THREE.Mesh(cb.build(), voxelMaterial({ side: THREE.DoubleSide, emissive: 0x192510, emissiveIntensity: 0.22 }));
  canopy.position.y = hubY;

  // ---- shroud lines (canopy hem → apex) + risers (apex → corner carabiners) + apex hardware ----
  const rb = new MeshBuilder();
  const hemR = R * 0.86, hemY = hubY + R * Math.cos(Math.PI * 0.47) * FLAT - 0.05;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    _strut(rb, [Math.cos(a) * hemR, hemY, Math.sin(a) * hemR], [0, apexY, 0], 0.03, sMid);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1])                            // 4 crossing sling legs
    _strut(rb, [0, apexY, 0], [sx * 0.58, 1.46, sz * 0.58], 0.06, sMid, { tint: 0.02 });
  // apex confluence: main carabiner + swivel block linking up to the canopy
  _carabiner(rb, 0, apexY, 0, 0.17, Math.PI / 4, mHi, mMid, mLo);
  rb.box(0.16, 0.2, 0.16, 0, apexY + 0.24, 0, mMid, { tint: 0.02 });             // swivel body
  rb.box(0.22, 0.06, 0.22, 0, apexY + 0.36, 0, mHi);                             // swivel cap
  _strut(rb, [0, apexY + 0.34, 0], [0, hemY - 0.1, 0], 0.035, mLo);             // line up to the canopy

  return { canopy, rig: new THREE.Mesh(rb.build(), voxelMaterial()) };
}

// Marine red hand-flare: orange plastic body, white printed label, red striker
// cap (ignites at the top), and a fluted orange grip. Long axis is +Y.
export function buildFlare() {
  const b = new MeshBuilder();
  const oHi = 0xff8a3a, oMid = 0xf2671c, oLo = 0xc44f12;          // orange plastic
  const rHi = 0xf0492c, rMid = 0xd6321a;                          // red cap
  const wMid = 0xe8e4d8, ink = 0x33312c, blu = 0x2f6fd0;          // white label + print
  let g = new THREE.CylinderGeometry(0.05, 0.05, 0.25, 16); b.geo(g, 0, 0.055, 0, oMid, { tint: 0.02 }); g.dispose();   // body tube
  g = new THREE.CylinderGeometry(0.051, 0.051, 0.02, 16); b.geo(g, 0, 0.175, 0, oHi); g.dispose();                       // lit body rim
  // white label band + print
  g = new THREE.CylinderGeometry(0.053, 0.053, 0.12, 16); b.geo(g, 0, 0.12, 0, wMid, { tint: 0.01 }); g.dispose();
  for (const yy of [0.155, 0.12, 0.085]) b.box(0.085, 0.012, 0.006, 0, yy, 0.055, ink);
  b.box(0.018, 0.028, 0.006, -0.035, 0.105, 0.055, blu); b.box(0.018, 0.028, 0.006, 0.04, 0.135, 0.055, blu);
  // red cap + striker collar + top notches
  g = new THREE.CylinderGeometry(0.051, 0.051, 0.08, 16); b.geo(g, 0, 0.22, 0, rMid, { tint: 0.02 }); g.dispose();
  g = new THREE.CylinderGeometry(0.057, 0.052, 0.04, 16); b.geo(g, 0, 0.28, 0, rMid); g.dispose();
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; b.box(0.013, 0.024, 0.013, Math.cos(a) * 0.04, 0.3, Math.sin(a) * 0.04, rHi); }
  // fluted orange grip (3 bulges) + base cap
  for (let i = 0; i < 3; i++) {
    const yy = -0.085 - i * 0.062;
    g = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16); b.geo(g, 0, yy, 0, oMid, { tint: 0.025 }); g.dispose();
    g = new THREE.CylinderGeometry(0.048, 0.048, 0.014, 16); b.geo(g, 0, yy + 0.031, 0, oLo); g.dispose();   // groove
  }
  g = new THREE.CylinderGeometry(0.05, 0.042, 0.03, 16); b.geo(g, 0, -0.285, 0, oLo); g.dispose();           // base cap
  return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x160b04, emissiveIntensity: 0.12 }));
}
