// bosstank.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';
import { MeshBuilder, randRange, voxelMaterial } from './util.js';


// ---------------------------------------------------------------------------
// Tank boss mesh — detailed voxel T-90M «Proryv» (Task 22).
// Desert 3-tone palette, layered shading (hi/mid/lo faces), ERA blocks,
// 6 road wheels per side, track bands, angular turret, long 125 mm gun.
// Returns a THREE.Group with ALL rig nodes on root.userData:
//   turret, gunMantlet, recoilNode, muzzle, mgMuzzle, hatch,
//   roadWheels[], trackL, trackR, headlamps[]
//
// Architecture: buildTank() composes small single-responsibility helpers
// defined immediately above it (all prefixed _tank* or buildTank*).
// ---------------------------------------------------------------------------

// ── Shared colour palette ────────────────────────────────────────────────────
function _tankPalette() {
  // TEMP working palette — single muted military GREEN family (matches the
  // reference render so the SHAPE reads cleanly without colour distraction).
  // Final desert 3-tone camo is a later one-function swap (Milestone 6).
  // All keys the part-builders use are kept: sand*/olv* = body greens,
  // brn* = a slightly darker green so ERA tiles read as separate modules,
  // steel/wheel/track/rubber = mechanical greys.
  return {
    sandHi:   0x808d5e, sandMid:  0x6b774b, sandLo:   0x545e39, // hull / deck body
    brnHi:    0x6c7748, brnMid:   0x59633a, brnLo:    0x454d2c, // ERA tiles / storage
    olvHi:    0x778354, olvMid:   0x626e44, olvLo:    0x4b5535, // turret body
    steelHi:  0x666b72, steelMid: 0x44474d, steelLo:  0x2e3035,
    slotCol:  0x202227,   // near-black recesses
    rubbCol:  0x282a2c,   // rubber road-wheel rim
    wheelHi:  0x565a60, wheelMid: 0x3e4147, wheelLo:  0x282b2f,
    trackCol: 0x333538, trackSlot:0x1a1c1e,
    mangalCol:0x44474d,   // slat cage (= steelMid)
    lensCol:  0x1a2a3a,   // sight lens
  };
}

// ── Layered-slab helper factory ──────────────────────────────────────────────
// Returns slab(b, w,h,d, x,y,z, mid,hi,lo, opts={})
// mid body + thin hi top strip + thin lo bottom strip.
function _tankSlabFn() {
  return (b, w, h, d, x, y, z, mid, hi, lo, opts = {}) => {
    b.box(w, h,         d, x, y,            z, mid, { tint: 0.025, ...opts });
    b.box(w, h * 0.14,  d, x, y + h * 0.44, z, hi,  { ...opts });
    b.box(w, h * 0.10,  d, x, y - h * 0.46, z, lo,  { ...opts });
  };
}

// ── ERA-brick helper factory ─────────────────────────────────────────────────
// Returns era(b, w,h,d, x,y,z, opts={}) — one protruding tile with shading.
function _tankEraFn(P) {
  return (b, w, h, d, x, y, z, opts = {}) => {
    b.box(w,        h,         d,        x, y,            z,         P.brnMid, { tint: 0.03,  ...opts });
    b.box(w * 0.7,  h * 0.12,  d * 0.95, x, y + h * 0.42, z + 0.005, P.brnHi,  { ...opts });
    b.box(w * 0.7,  h * 0.10,  d * 0.95, x, y - h * 0.44, z + 0.005, P.brnLo,  { ...opts });
  };
}

// ── Hull: lower tub + wide flat fender deck + clean sloped glacis + rear deck ──
// Clean low/wide T-90M chassis. NO ERA here (added cleanly in the ERA pass).
function _tankHull(b, P) {
  const slab = _tankSlabFn();

  // Lower hull tub — sits between the tracks (narrower than the deck), boxy.
  slab(b, 3.2, 1.20, 6.5, 0, 0.82, -0.10, P.sandMid, P.sandHi, P.sandLo);

  // Wide flat fender deck — the clean top surface that overhangs the tracks.
  slab(b, 3.95, 0.32, 6.2, 0, 1.46, -0.15, P.sandMid, P.sandHi, P.sandLo);

  // Sloped upper glacis — one clean wedge plate (tilted ~34°).
  b.box(3.35, 1.05, 1.55, 0, 1.30, 2.92, P.sandMid, { tint: 0.025, rx: -0.6 });
  b.box(3.35, 0.16, 1.55, 0, 1.78, 2.80, P.sandHi,  { rx: -0.6 }); // top lit strip
  // Short near-vertical lower front plate.
  b.box(3.10, 0.62, 0.20, 0, 0.62, 3.28, P.sandLo, { tint: 0.02 });

  // Driver hatch + periscope cluster (centre of the deck, just behind glacis).
  b.box(0.52, 0.07, 0.50, 0, 1.65, 1.95, P.sandLo, { tint: 0.02 });
  b.box(0.42, 0.05, 0.07, 0, 1.70, 2.16, P.slotCol); // periscope slit

  // Rear engine deck — slightly raised, lengthwise grille panels.
  slab(b, 3.75, 0.30, 1.55, 0, 1.55, -2.65, P.olvMid, P.olvHi, P.olvLo);
  for (let i = 0; i < 5; i++) {
    b.box(0.46, 0.05, 0.95, -1.20 + i * 0.60, 1.71, -2.65, P.slotCol); // grille slots
  }
  // Rear vertical plate.
  b.box(3.45, 0.95, 0.20, 0, 0.95, -3.28, P.sandLo, { tint: 0.02 });

  // Front mudguards (over the front of the tracks).
  b.box(0.72, 0.12, 1.5, -1.96, 1.58, 2.05, P.olvLo);
  b.box(0.72, 0.12, 1.5,  1.96, 1.58, 2.05, P.olvLo);

  // Tow hooks (front corners).
  for (const hx of [-1.25, 1.25]) {
    b.box(0.18, 0.22, 0.22, hx, 0.52, 3.34, P.steelMid);
  }
}

// ── Glacis ERA: split-V herringbone (4 rows x 5 cols per side, denser) ───────
// Each side's bricks angle sharply toward the centreline — clear V from front view.
function _tankGlacisEra(b, P) {
  const era = _tankEraFn(P);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const exL = -0.22 - col * 0.44;
      const ey  =  1.22 + row * 0.26;
      const ez  =  3.52 - row * 0.14;
      era(b, 0.40, 0.19, 0.14, exL,  ey, ez, { rx: -0.55, ry:  0.52 }); // left leg of V
      era(b, 0.40, 0.19, 0.14, -exL, ey, ez, { rx: -0.55, ry: -0.52 }); // right leg of V
    }
  }
}

// ── One side skirt (clean segmented panel) ───────────────────────────────────
// sx = -1 (left) or +1 (right). NO ERA here — side ERA is added in the ERA pass.
function _tankSideSkirt(root, P, sx) {
  const slab = _tankSlabFn();
  const skb  = new MeshBuilder();
  const skx  = sx * 2.0;

  // Upper rigid skirt panel (covers the track top, flush under the fender).
  slab(skb, 0.14, 0.60, 6.3, skx, 1.14, -0.15, P.olvMid, P.olvHi, P.olvLo);
  // Lower flexible skirt flap — hangs lower, slightly darker (rubberised look).
  slab(skb, 0.10, 0.40, 5.9, skx + sx * 0.02, 0.66, -0.10, P.steelLo, P.steelMid, P.trackSlot);
  // Vertical segment seams (7 panels).
  for (let c = 0; c < 7; c++) {
    skb.box(0.16, 0.58, 0.04, skx, 1.14, 2.55 - c * 0.88, P.olvLo);
  }
  root.add(new THREE.Mesh(skb.build(), voxelMaterial()));
}

// ── One road wheel: rubber rim + steel hub + hub highlight ──────────────────
function _tankRoadWheel(P, wx, wz) {
  const b      = new MeshBuilder();
  const rimGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.26, 12);
  b.geo(rimGeo, wx, 0.46, wz, P.rubbCol, { rx: Math.PI / 2 }); rimGeo.dispose();
  const hubGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.32, 8);
  b.geo(hubGeo, wx, 0.46, wz, P.wheelMid, { rx: Math.PI / 2 }); hubGeo.dispose();
  b.box(0.08, 0.08, 0.34, wx, 0.46, wz, P.wheelHi); // hub catch-light
  return new THREE.Mesh(b.build(), voxelMaterial());
}

// ── Front idler wheel ────────────────────────────────────────────────────────
function _tankIdler(P, wx) {
  const b = new MeshBuilder();
  const g = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  b.geo(g, wx, 0.44, 3.3, P.wheelMid, { rx: Math.PI / 2 }); g.dispose();
  return new THREE.Mesh(b.build(), voxelMaterial());
}

// ── Rear drive sprocket (toothed approximation) ──────────────────────────────
function _tankSprocket(P, wx) {
  const b = new MeshBuilder();
  const g = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  b.geo(g, wx, 0.46, -3.3, P.steelMid, { rx: Math.PI / 2 }); g.dispose();
  for (let t = 0; t < 8; t++) {
    const a = (t / 8) * Math.PI * 2;
    b.box(0.10, 0.10, 0.30, wx + Math.cos(a) * 0.38, 0.46 + Math.sin(a) * 0.38, -3.3, P.steelHi);
  }
  return new THREE.Mesh(b.build(), voxelMaterial());
}

// ── One return roller ────────────────────────────────────────────────────────
function _tankReturnRoller(P, wx, wz) {
  const b = new MeshBuilder();
  const g = new THREE.CylinderGeometry(0.18, 0.18, 0.22, 8);
  b.geo(g, wx, 1.05, wz, P.wheelMid, { rx: Math.PI / 2 }); g.dispose();
  return new THREE.Mesh(b.build(), voxelMaterial());
}

// ── One track band: lower run + upper run + link slots ───────────────────────
function _tankTrackBand(P, sx) {
  const slab = _tankSlabFn();
  const b    = new MeshBuilder();
  const tx   = sx * 1.85;
  slab(b, 0.38, 0.26, 7.2, tx, 0.14,  -0.10, P.trackCol, P.steelMid, P.trackSlot); // lower run
  slab(b, 0.38, 0.14, 6.8, tx, 0.92,  -0.05, P.trackCol, P.steelMid, P.trackSlot); // upper run
  for (let i = 0; i < 14; i++) {
    b.box(0.34, 0.06, 0.06, tx, 0.14, 3.3 - i * 0.52, P.trackSlot); // link slots
  }
  return new THREE.Mesh(b.build(), voxelMaterial());
}

// ── One headlamp: housing + lens glass + bright centre ───────────────────────
function _tankHeadlamp(P, hx) {
  const b = new MeshBuilder();
  b.box(0.32, 0.22, 0.14, hx, 1.28, 3.62, P.steelMid);   // housing
  b.box(0.22, 0.15, 0.06, hx, 1.28, 3.72, 0xd0d8e0);     // lens glass
  b.box(0.20, 0.12, 0.06, hx, 1.28, 3.73, 0xeef2ff);     // bright centre
  return new THREE.Mesh(b.build(), voxelMaterial());
}

// ── Main turret body: ARROWHEAD / DIAMOND welded shell (hexagonal top view) ──
// The T-90M turret reads as a diamond from above: a narrow front (mantlet face)
// with two BIG angled cheek plates converging back to the wide shoulders, then a
// rectangular body and a flat rear bustle. NOT a square box. Local frame: turret
// pivot at hull (0,1.65,-0.4); forward = +z.
function _tankTurretShell(b, P) {
  const slab = _tankSlabFn();
  const H  = 0.92;   // turret body height
  const cy = 0.46;   // vertical centre (spans ~0..0.92)

  // Rear body rectangle (shoulders -> rear).
  slab(b, 2.70, H, 1.85, 0, cy, -0.55, P.olvMid, P.olvHi, P.olvLo);     // z: -1.475 .. 0.375

  // Narrow front NOSE block — the front (mantlet) face the gun exits through.
  slab(b, 1.10, H, 1.05, 0, cy, 0.78, P.olvMid, P.olvHi, P.olvLo);      // z: 0.255 .. 1.305

  // Big angled FRONT-BEVEL cheeks — converge from wide shoulders to the nose.
  //   left : shoulder(-1.45,0.22) -> nose corner(-0.52,1.33)   ry = +0.69
  //   right: mirror                                            ry = -0.69
  for (const sx of [-1, 1]) {
    b.box(0.72, H,    1.45, sx * 0.985, cy,        0.775, P.olvMid, { tint: 0.02, ry: sx * 0.69 });
    b.box(0.72, 0.12, 1.45, sx * 0.985, cy + 0.40, 0.775, P.olvHi,  { ry: sx * 0.69 }); // lit top strip
  }

  // Rear bustle storage box (wide, flat, lower — extends behind the turret).
  slab(b, 2.30, 0.60, 0.85, 0, 0.32, -1.92, P.sandMid, P.sandHi, P.sandLo);

  // Clean welded roof plate tying body + nose together.
  b.box(2.55, 0.10, 3.0, 0, 0.99, -0.30, P.olvHi, { tint: 0.02 });
}

// ── Turret-cheek ERA: forward chevron/arrow for one side ─────────────────────
// sx = -1 (left) or +1 (right). 3 stacked chevron rows per cheek.
function _tankCheekEra(b, P, sx) {
  const era = _tankEraFn(P);
  for (let row = 0; row < 3; row++) {
    const cy = 0.10 + row * 0.30;
    era(b, 0.52, 0.22, 0.20, sx * 1.38, cy + 0.12, 0.68, { ry: sx * -0.75, rx:  0.28 }); // upper wing
    era(b, 0.52, 0.22, 0.20, sx * 1.38, cy - 0.12, 0.65, { ry: sx * -0.75, rx: -0.28 }); // lower wing
    era(b, 0.30, 0.18, 0.18, sx * 1.28, cy,         0.96, { ry: sx * -0.30 });             // apex cap
    era(b, 0.48, 0.20, 0.18, sx * 1.40, cy + 0.06,  0.44, { ry: sx * -0.70, rx:  0.18 }); // layer 2 hi
    era(b, 0.48, 0.20, 0.18, sx * 1.40, cy - 0.06,  0.42, { ry: sx * -0.70, rx: -0.18 }); // layer 2 lo
  }
}

// ── Rear slat/mangal cage + bustle seam lines ────────────────────────────────
function _tankMantletCage(b, P) {
  for (let bz = 0; bz < 3; bz++) {
    b.box(2.1, 0.06, 0.06, 0, 0.55, -1.70 - bz * 0.18, P.mangalCol); // horizontal bars
  }
  for (let bx = -2; bx <= 2; bx++) {
    b.box(0.06, 0.55, 0.52, bx * 0.52, 0.55, -1.84, P.mangalCol);    // vertical bars
  }
  b.box(0.06, 0.68, 0.94, -0.97, 0.36, -1.35, P.steelLo); // seam left
  b.box(0.06, 0.68, 0.94,  0.97, 0.36, -1.35, P.steelLo); // seam right
}

// ── Smoke-grenade launcher cluster for one side ──────────────────────────────
// sx = -1 (left) or +1 (right). 5 angled cylinders + mounting plate.
function _tankSmokeTubes(b, P, sx) {
  for (let t = 0; t < 5; t++) {
    const ty = 0.25 + t * 0.18;
    const tz = 0.40 + t * 0.08;
    const g  = new THREE.CylinderGeometry(0.07, 0.07, 0.55, 6);
    b.geo(g, sx * 1.42, ty, tz, P.steelMid, { rz: sx * 1.18, tint: 0.02 }); g.dispose();
  }
  b.box(0.14, 0.92, 0.58, sx * 1.36, 0.5, 0.55, P.steelLo);
}

// ── Commander cupola housing + vision-block slits ────────────────────────────
function _tankCupola(b, P) {
  b.box(0.72, 0.38, 0.72, 0.7, 1.08, 0.18, P.brnMid, { tint: 0.03 });
  b.box(0.72, 0.08, 0.72, 0.7, 1.28, 0.18, P.brnHi);
  for (let s = 0; s < 4; s++) {
    const a = (s / 4) * Math.PI * 2;
    b.box(0.24, 0.06, 0.04, 0.7 + Math.cos(a) * 0.38, 1.1, 0.18 + Math.sin(a) * 0.38, P.slotCol, { ry: a });
  }
}

// ── Panoramic sight drum + gunner sight housing ──────────────────────────────
function _tankSights(b, P) {
  const psGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.38, 8);
  b.geo(psGeo, -0.55, 1.12, 0.30, P.steelMid, { tint: 0.02 }); psGeo.dispose();
  b.box(0.12, 0.16, 0.12, -0.55, 1.35, 0.28, P.lensCol);
  b.box(0.32, 0.28, 0.48, -0.72, 1.06, 0.75, P.steelMid, { tint: 0.02 });
  b.box(0.22, 0.12, 0.10, -0.72, 1.06, 1.02, P.lensCol);
}

// ── RWS / MG mount stub ──────────────────────────────────────────────────────
function _tankRws(b, P) {
  b.box(0.28, 0.30, 0.38, 0.7, 1.22, -0.50, P.steelMid, { tint: 0.02 });
  b.box(0.10, 0.10, 0.55, 0.7, 1.26, -0.28, P.steelHi);
}

// ── Radio antenna ─────────────────────────────────────────────────────────────
function _tankAntenna(b, P) {
  b.box(0.05, 1.10, 0.05, 0.75, 1.55, -0.9, P.steelMid);
  b.box(0.05, 0.06, 0.05, 0.75, 2.12, -0.9, P.steelHi);
}

// ── 125 mm gun group: barrel + thermal sleeve + evacuator + coax + mantlet ───
// Returns a MeshBuilder ready to be built and added to recoilNode.
function buildTankGun(P) {
  const gb   = new MeshBuilder();
  const slab = _tankSlabFn();

  // Three tapered barrel sections (muzzle z = 6.45 in recoilNode space)
  slab(gb, 0.30, 0.30, 2.20, 0, 0, 1.20, P.steelMid, P.steelHi, P.steelLo); // base
  slab(gb, 0.26, 0.26, 2.00, 0, 0, 3.40, P.steelMid, P.steelHi, P.steelLo); // mid
  slab(gb, 0.22, 0.22, 2.40, 0, 0, 5.25, P.steelMid, P.steelHi, P.steelLo); // tip (extended)

  // Thermal sleeve — 9 band rings + bulk body
  for (let s = 0; s < 9; s++) {
    gb.box(0.34, 0.34, 0.08, 0, 0,    0.50 + s * 0.36, P.brnMid, { tint: 0.02 });
    gb.box(0.34, 0.04, 0.08, 0, 0.18, 0.50 + s * 0.36, P.brnHi);
  }
  gb.box(0.32, 0.30, 2.80, 0, 0, 1.65, P.brnLo, { tint: 0.02 });

  // Bore evacuator bulge
  gb.box(0.42, 0.42, 0.55, 0,  0,    3.82, P.steelMid, { tint: 0.02 });
  gb.box(0.42, 0.06, 0.55, 0,  0.22, 3.82, P.steelHi);
  gb.box(0.42, 0.05, 0.55, 0, -0.22, 3.82, P.steelLo);
  gb.box(0.44, 0.08, 0.06, 0,  0,    3.54, P.steelLo); // collar forward
  gb.box(0.44, 0.08, 0.06, 0,  0,    4.10, P.steelLo); // collar rear

  // Coaxial MG barrel
  gb.box(0.10, 0.10, 1.80, 0.28, -0.06, 1.00, P.steelLo, { tint: 0.02 });
  gb.box(0.12, 0.05, 0.08, 0.28, -0.06, 1.92, P.slotCol);

  // Mantlet cover plate
  gb.box(0.72, 0.62, 0.22, 0,  0,    0.12, P.olvMid, { tint: 0.03 });
  gb.box(0.72, 0.08, 0.22, 0,  0.32, 0.12, P.olvHi);

  return gb;
}

// ── Mitri commander bust — yellow Engendros plush, sits in the cupola hatch ──
// Returns a THREE.Group. Head centre is at y≈0.48 so it shows above the hatch rim
// (hatch itself is at turret-local y=1.0; Mitri group goes on hatch at y=0).
function _tankMitri() {
  const g     = new THREE.Group();
  const b     = new MeshBuilder();
  const dark  = 0x1a1208;   // dark cross-stitch / hair
  const gold  = 0xe8b430;   // button-eye brass
  const yHi   = 0xf5d050;   // bright yellow top-lit
  const yMid  = 0xedc028;   // yellow mid
  const yLo   = 0xc89810;   // yellow shadow

  // ── Torso (boxy, below the hatch rim) ──────────────────────────────────────
  b.box(0.60, 0.32, 0.44, 0,  0.12, 0,   yMid,  { tint: 0.03 });
  b.box(0.60, 0.05, 0.44, 0,  0.27, 0,   yHi);   // top lit strip
  b.box(0.60, 0.05, 0.44, 0, -0.03, 0,   yLo);   // bottom shadow strip

  // ── Neck stub ──────────────────────────────────────────────────────────────
  b.box(0.22, 0.14, 0.22, 0, 0.34, 0,  yMid);

  // ── Round-ish head (stacked slabs = voxel "sphere") ────────────────────────
  // Core
  b.box(0.62, 0.50, 0.60, 0,  0.69, 0,   yMid,  { tint: 0.02 });
  b.box(0.62, 0.07, 0.60, 0,  0.95, 0,   yHi);   // crown lit
  b.box(0.62, 0.07, 0.60, 0,  0.45, 0,   yLo);   // chin shadow
  // Side bulge (plush softness)
  b.box(0.12, 0.40, 0.50, -0.37, 0.70, 0, yLo);
  b.box(0.12, 0.40, 0.50,  0.37, 0.70, 0, yLo);
  // Face forward slab (slightly lighter — front face in light)
  b.box(0.58, 0.44, 0.06,  0,  0.70, 0.31, yHi, { tint: 0.01 });

  // ── Three brass button eyes in a row (CylinderGeometry discs, face +Z) ─────
  for (let i = -1; i <= 1; i++) {
    const ex = i * 0.17;
    const ey = 0.76;
    const ez = 0.34;
    // Brass disc
    const discGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.04, 10);
    // rotate 90° so the flat face points forward (+Z)
    discGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    b.geo(discGeo, ex, ey, ez, gold, { tint: 0.04 }); discGeo.dispose();
    // Dark X cross-stitch through each eye (two thin crossed boxes)
    b.box(0.11, 0.025, 0.025, ex, ey,  ez + 0.025, dark);  // horizontal bar
    b.box(0.025, 0.11, 0.025, ex, ey,  ez + 0.025, dark);  // vertical bar
  }

  // ── X-stitch smile — 4 small "x" marks in a gentle arc below the eyes ──────
  const smileXs = [
    [-0.22, 0.595], [-0.08, 0.565], [0.08, 0.565], [0.22, 0.595],
  ];
  for (const [sx, sy] of smileXs) {
    const sz = 0.34;
    b.box(0.07, 0.025, 0.025, sx, sy, sz + 0.025, dark);   // \ half (horiz)
    b.box(0.025, 0.07, 0.025, sx, sy, sz + 0.025, dark);   // | half (vert)
  }

  // ── 2 short black hair tufts on top ────────────────────────────────────────
  // Left tuft — slight leftward lean
  b.box(0.06, 0.20, 0.06, -0.14, 1.07, 0.04, dark, { rx:  0.28, rz:  0.22 });
  b.box(0.05, 0.13, 0.05, -0.14, 1.21, 0.04, dark, { rx:  0.18, rz:  0.32 }); // tip
  // Right tuft — slight rightward lean
  b.box(0.06, 0.20, 0.06,  0.14, 1.07, 0.04, dark, { rx:  0.28, rz: -0.22 });
  b.box(0.05, 0.13, 0.05,  0.14, 1.21, 0.04, dark, { rx:  0.18, rz: -0.32 }); // tip

  g.add(new THREE.Mesh(b.build(), voxelMaterial()));
  // Shift so head shows nicely above the hatch rim
  g.position.set(0, 0.10, 0);
  return g;
}

// ── Main assembly ─────────────────────────────────────────────────────────────
export function buildTank(camo = 'desert') {
  const P    = _tankPalette();
  const root = new THREE.Group(); root.name = 'tank';

  // Hull
  const hb = new MeshBuilder();
  _tankHull(hb, P);
  // Clean glacis (no ERA) for the blockout — glacis ERA grid added in the ERA pass (M2).
  root.add(new THREE.Mesh(hb.build(), voxelMaterial()));

  // Side skirts (left + right)
  _tankSideSkirt(root, P, -1);
  _tankSideSkirt(root, P,  1);

  // Running gear
  root.userData.roadWheels = [];
  for (const sx of [-1, 1]) {
    const wx = sx * 1.85;
    for (let i = 0; i < 6; i++) {
      const wm = _tankRoadWheel(P, wx, 2.6 - i * 0.97);
      wm.name = `roadWheel_${sx > 0 ? 'R' : 'L'}_${i}`;
      root.add(wm);
      root.userData.roadWheels.push(wm);
    }
    root.add(_tankIdler(P, wx));
    const spr = _tankSprocket(P, wx);
    root.add(spr);
    if (sx < 0) root.userData.sprocketL = spr; else root.userData.sprocketR = spr;
    root.add(_tankReturnRoller(P, wx,  1.60));
    root.add(_tankReturnRoller(P, wx, -0.60));
  }

  // Track bands
  const trackL = _tankTrackBand(P, -1); trackL.name = 'trackL';
  const trackR = _tankTrackBand(P,  1); trackR.name = 'trackR';
  root.add(trackL); root.userData.trackL = trackL;
  root.add(trackR); root.userData.trackR = trackR;

  // Headlamps — lens/housing meshes + real SpotLights (intensity 0; auto-on at night)
  root.userData.headlamps = [];
  root.userData.headlampLights = [];
  for (const hx of [-1.1, 1.1]) {
    const lm = _tankHeadlamp(P, hx);
    lm.name = `headlamp_${hx < 0 ? 'L' : 'R'}`;
    root.add(lm);
    root.userData.headlamps.push(lm);

    // SpotLight parented to the hull at lamp position, pointing forward (+Z local)
    const sl = new THREE.SpotLight(0xfff0c0, 0, 34, 0.5, 0.4, 1.5);
    sl.castShadow = false;
    sl.position.set(hx, 1.28, 3.72);          // same as lens-glass centre in _tankHeadlamp
    // Target placed well forward so the beam points +Z in hull space
    const slTarget = new THREE.Object3D();
    slTarget.position.set(hx, 1.28, 30.0);
    root.add(sl);
    root.add(slTarget);
    sl.target = slTarget;
    root.userData.headlampLights.push(sl);
  }

  // Turret group (yaws independently)
  const turret = new THREE.Group();
  turret.position.set(0, 1.65, -0.4);
  root.add(turret);
  root.userData.turret = turret;

  const turB = new MeshBuilder();
  _tankTurretShell(turB, P);
  // Faceted cheeks come from the shell now; clean cheek/front ERA tiles added in the ERA pass (M2).
  _tankMantletCage(turB, P);
  _tankSmokeTubes(turB, P, -1);
  _tankSmokeTubes(turB, P,  1);
  _tankCupola(turB, P);
  _tankSights(turB, P);
  _tankRws(turB, P);
  _tankAntenna(turB, P);
  turret.add(new THREE.Mesh(turB.build(), voxelMaterial()));

  // Gun mantlet (pitches, child of turret)
  const gunMantlet = new THREE.Group();
  gunMantlet.position.set(0, 0.5, 1.3);
  turret.add(gunMantlet);
  turret.userData.gunMantlet = gunMantlet;
  root.userData.gunMantlet   = gunMantlet;

  const recoilNode = new THREE.Group();
  gunMantlet.add(recoilNode);
  gunMantlet.userData.recoilNode = recoilNode;
  root.userData.recoilNode       = recoilNode;

  // 125 mm gun mesh on recoilNode
  const gb = buildTankGun(P);
  recoilNode.add(new THREE.Mesh(gb.build(), voxelMaterial()));

  // Muzzle marker (z=6.45 in recoilNode space; world r~5.15 from turret pivot)
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 6.45);
  recoilNode.add(muzzle);
  root.userData.muzzle = muzzle;

  // Coaxial MG muzzle anchor (on turret)
  const mgMuzzle = new THREE.Object3D();
  mgMuzzle.position.set(0.7, 1.3, -0.1);
  turret.add(mgMuzzle);
  root.userData.mgMuzzle = mgMuzzle;

  // Commander hatch (lifts to expose Mitri — Task 23)
  const hatch = new THREE.Group();
  hatch.position.set(0.7, 1.0, 0.18);
  turret.add(hatch);
  root.userData.hatch = hatch;

  const hatchB = new MeshBuilder();
  hatchB.box(0.62, 0.07, 0.62, 0, 0.04, 0, P.steelMid, { tint: 0.02 });
  hatchB.box(0.62, 0.02, 0.62, 0, 0.08, 0, P.steelHi);
  hatch.add(new THREE.Mesh(hatchB.build(), voxelMaterial()));

  // Mitri commander bust (Task 23) — visible by default (boss rides exposed)
  const mitri = _tankMitri();
  mitri.visible = true;
  hatch.add(mitri);
  root.userData.mitri = mitri;

  return root;
}

// ---------------------------------------------------------------------------
// Destroyed-tank wreck — scorched T-90M shell (Task 26).
// Module-level array tracks active wrecks for lingering smoke ticks.
// ---------------------------------------------------------------------------
export const _tankWrecks = []; // { mesh, pos:{x,y,z}, t, _smokeAccum }

// Scorched palette — everything charred, no camo.
function _wreckPalette() {
  return {
    sandHi:   0x2a2a2a, sandMid:  0x1e1e1e, sandLo:   0x141414,
    brnHi:    0x33281e, brnMid:   0x261c12, brnLo:    0x1a1008,
    olvHi:    0x222218, olvMid:   0x1a1a10, olvLo:    0x111108,
    steelHi:  0x303030, steelMid: 0x222222, steelLo:  0x141414,
    slotCol:  0x0a0a0a,
    rubbCol:  0x111111,
    wheelHi:  0x282828, wheelMid: 0x1c1c1c, wheelLo:  0x101010,
    trackCol: 0x181818, trackSlot:0x0c0c0c,
    mangalCol:0x1e1e1e,
    lensCol:  0x080808,
  };
}

// Build a static burnt-out wreck group.  No rig userData needed.
export function buildTankWreck() {
  const P    = _wreckPalette();
  const root = new THREE.Group(); root.name = 'tankWreck';
  const slab = _tankSlabFn();

  // ── Scorched hull ───────────────────────────────────────────────────────────
  const hb = new MeshBuilder();
  // Main hull box (same proportions as live tank)
  slab(hb, 3.6, 1.8, 7.2, 0, 0.9, 0, P.sandMid, P.sandHi, P.sandLo);
  // Glacis plate (charred, slightly tilted same as original)
  hb.box(3.5, 1.1, 1.8, 0, 1.65, 3.10, P.sandMid, { rx: -0.55 });
  // Rear engine deck — gutted
  slab(hb, 3.6, 0.5, 1.4, 0, 1.95, -2.8, P.brnMid, P.brnHi, P.brnLo);
  // A few engine grille slits (darker than usual)
  for (let i = 0; i < 5; i++) {
    hb.box(0.55, 0.06, 0.08, -1.1 + i * 0.55, 2.22, -3.1, P.slotCol);
  }
  // Front mudguard stubs
  hb.box(0.55, 0.12, 1.5, -1.93, 1.84, 2.2, P.sandMid);
  hb.box(0.55, 0.12, 1.5,  1.93, 1.84, 2.2, P.sandMid);
  // Tow hooks (chars, still present)
  for (const hx of [-1.3, 1.3]) {
    hb.box(0.18, 0.24, 0.22, hx, 0.7, 3.65, P.steelMid);
  }
  root.add(new THREE.Mesh(hb.build(), voxelMaterial()));

  // ── Bare scorched skirt panels (no ERA) ────────────────────────────────────
  for (const sx of [-1, 1]) {
    const skb = new MeshBuilder();
    slab(skb, 0.12, 0.65, 7.0, sx * 1.9, 1.18, -0.1, P.steelMid, P.steelHi, P.steelLo);
    root.add(new THREE.Mesh(skb.build(), voxelMaterial()));
  }

  // ── Running gear — darkened wheels + tracks ─────────────────────────────────
  for (const sx of [-1, 1]) {
    const wx = sx * 1.85;
    for (let i = 0; i < 6; i++) {
      root.add(_tankRoadWheel(P, wx, 2.6 - i * 0.97));
    }
    // Idler + sprocket (simplified)
    const idb = new MeshBuilder();
    const idg = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
    idb.geo(idg, wx, 0.44, 3.3, P.wheelMid, { rx: Math.PI / 2 }); idg.dispose();
    root.add(new THREE.Mesh(idb.build(), voxelMaterial()));

    const spb = new MeshBuilder();
    const spg = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
    spb.geo(spg, wx, 0.46, -3.3, P.steelMid, { rx: Math.PI / 2 }); spg.dispose();
    root.add(new THREE.Mesh(spb.build(), voxelMaterial()));
  }

  // Track bands (both sides — darkened)
  const trackL = _tankTrackBand(P, -1); trackL.name = 'wreckTrackL';
  const trackR = _tankTrackBand(P,  1); trackR.name = 'wreckTrackR';
  root.add(trackL); root.add(trackR);

  // ── Askew / "popped" turret ─────────────────────────────────────────────────
  const turret = new THREE.Group();
  // Sit it slightly off-centre and rotated ~30° off the hull axis; tilt it a
  // touch so it reads as "blown off" rather than just pivoted.
  turret.position.set(0.3, 1.65, -0.4);
  turret.rotation.set(0.08, 0.52, -0.06);   // askew: tilt + yaw ~30°
  root.add(turret);

  const turB = new MeshBuilder();
  _tankTurretShell(turB, P);
  // Minimal charred cage remnant (skip cheek ERA, no smoke tubes)
  for (let bz = 0; bz < 2; bz++) {
    turB.box(2.1, 0.06, 0.06, 0, 0.55, -1.70 - bz * 0.18, P.mangalCol);
  }
  // Cupola stub (no vision blocks)
  turB.box(0.72, 0.38, 0.72, 0.7, 1.08, 0.18, P.brnMid);
  turB.box(0.72, 0.08, 0.72, 0.7, 1.28, 0.18, P.brnHi);
  turret.add(new THREE.Mesh(turB.build(), voxelMaterial()));

  // ── Drooping barrel (child of turret) ──────────────────────────────────────
  const gunGroup = new THREE.Group();
  gunGroup.position.set(0, 0.5, 1.3);
  gunGroup.rotation.x = 0.30;   // pitched down ~17° — droops from heat warp
  turret.add(gunGroup);

  const gb = new MeshBuilder();
  const gslab = _tankSlabFn();
  gslab(gb, 0.30, 0.30, 2.20, 0, 0, 1.20, P.steelMid, P.steelHi, P.steelLo);
  gslab(gb, 0.26, 0.26, 2.00, 0, 0, 3.40, P.steelMid, P.steelHi, P.steelLo);
  gslab(gb, 0.22, 0.22, 1.60, 0, 0, 5.05, P.steelMid, P.steelHi, P.steelLo); // shorter — tip blown
  gb.box(0.42, 0.42, 0.55, 0, 0, 3.82, P.steelMid);  // evacuator
  // Mantlet stub
  gb.box(0.72, 0.62, 0.22, 0, 0, 0.12, P.olvMid);
  gunGroup.add(new THREE.Mesh(gb.build(), voxelMaterial()));

  return root;
}

// ── Tank rig animator — call every frame for boss and captured tank ───────────
// Spins road wheels + sprockets proportional to speed, adds subtle suspension
// bob (rotation.x / rotation.z only — never touches rotation.y which is hull yaw),
// and applies barrel recoil display.
// Wheel spin axis: CylinderGeometry default axis = Y; after rx:PI/2 in MeshBuilder
// the cylinder lies flat, so its rolling axis in local space becomes Z.
export function animateTank(group, dt, speed, recoil) {
  const ud = group && group.userData; if (!ud) return;
  // wheel radius ~0.44 → angularVel = speed / radius
  const spin = (speed || 0) * dt / 0.44;
  if (ud.roadWheels) for (const w of ud.roadWheels) w.rotation.z += spin;
  if (ud.sprocketL) ud.sprocketL.rotation.z += spin;
  if (ud.sprocketR) ud.sprocketR.rotation.z += spin;
  // subtle suspension bob + idle hull sway (additive on rotation.x/z only)
  ud._bob = (ud._bob || 0) + dt * (2 + Math.abs(speed || 0) * 3);
  const moving = Math.abs(speed || 0) > 0.05;
  group.rotation.x = Math.sin(ud._bob) * (moving ? 0.012 : 0.004);   // gentle pitch bob
  group.rotation.z = Math.cos(ud._bob * 0.7) * (moving ? 0.010 : 0.003); // gentle roll
  // barrel recoil (display only — recoil decay is done by caller)
  if (ud.recoilNode) ud.recoilNode.position.z = -(recoil || 0);
}

// ── Tank ground FX — track marks (pooled decals) + dust + engine smoke ────────
// Call every frame for boss and captured tank right after animateTank().
// `enraged` enables thicker smoke + occasional orange flame flecks (boss phase-2).
const _DECAL_POOL_SIZE = 40;
const _decalColor = new THREE.Color(0x2a2118);
let   _tankDecalPool = null; // array of { mesh, spawnT } — created lazily, persists

function _ensureDecalPool(scene) {
  if (_tankDecalPool) return;
  _tankDecalPool = [];
  const geo = new THREE.PlaneGeometry(2.8, 0.55);
  const mat = new THREE.MeshBasicMaterial({
    color: _decalColor, transparent: true, opacity: 0.55,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  });
  for (let i = 0; i < _DECAL_POOL_SIZE; i++) {
    const m = new THREE.Mesh(geo, mat.clone());
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    m.visible = false;
    scene.add(m);
    _tankDecalPool.push({ mesh: m, spawnT: -999 });
  }
  _tankDecalPool._cursor = 0;
}

export function tankGroundFX(group, game, dt, speed, enraged) {
  if (!group || !game || !game.effects) return;
  const efx = game.effects;
  const scene = efx.scene;

  // ── 1. Track-mark decals ────────────────────────────────────────────────
  _ensureDecalPool(scene);
  const pool = _tankDecalPool;
  const now = (game.engine && game.engine.clock) ? game.engine.clock.getElapsedTime() : (pool._t = (pool._t || 0) + dt);
  pool._t = pool._t !== undefined ? pool._t + dt : 0;
  const curT = pool._t;

  // fade existing decals
  for (const d of pool) {
    if (!d.mesh.visible) continue;
    const age = curT - d.spawnT;
    if (age > 6) { d.mesh.visible = false; continue; }
    d.mesh.material.opacity = 0.55 * Math.max(0, 1 - age / 6);
  }

  // place new decals while moving
  pool._dist = (pool._dist || 0) + Math.abs(speed) * dt;
  if (Math.abs(speed) > 0.1 && pool._dist > 0.35) {
    pool._dist = 0;
    // hull right vector
    const hullYaw = group.rotation.y;
    const rx = Math.cos(hullYaw), rz = -Math.sin(hullYaw);
    // rear contact point (hull rear offset ~2.6 m back)
    const bx = group.position.x - Math.sin(hullYaw) * 2.6;
    const bz = group.position.z - Math.cos(hullYaw) * 2.6;

    for (const side of [-1, 1]) {
      const d = pool[pool._cursor % _DECAL_POOL_SIZE];
      pool._cursor = (pool._cursor + 1) % _DECAL_POOL_SIZE;
      d.mesh.position.set(bx + rx * side * 1.5, 0.03, bz + rz * side * 1.5);
      d.mesh.rotation.set(-Math.PI / 2, 0, hullYaw);
      d.mesh.material.opacity = 0.55;
      d.mesh.visible = true;
      d.spawnT = curT;
    }
  }

  // ── 2. Dust while moving ─────────────────────────────────────────────────
  pool._dustT = (pool._dustT || 0) - dt;
  if (Math.abs(speed) > 0.1 && pool._dustT <= 0) {
    pool._dustT = 0.08;
    const hullYaw = group.rotation.y;
    const bx = group.position.x - Math.sin(hullYaw) * 2.4;
    const bz = group.position.z - Math.cos(hullYaw) * 2.4;
    const dustPos = new THREE.Vector3(bx, 0.15, bz);
    const dustC = new THREE.Color(Math.random() < 0.5 ? 0xc8b89a : 0xa89880);
    for (let i = 0; i < 3; i++) {
      efx._spawn({
        pos: dustPos.clone().add(new THREE.Vector3(randRange(-0.8, 0.8), 0, randRange(-0.8, 0.8))),
        vel: new THREE.Vector3(randRange(-0.4, 0.4), randRange(0.3, 0.9), randRange(-0.4, 0.4)),
        life: randRange(0.6, 1.0), size: randRange(0.12, 0.22),
        grav: -0.5, drag: 1.8, color: dustC,
        bounce: 0, floorY: -999, shrink: true,
      });
    }
  }

  // ── 3. Engine exhaust smoke ───────────────────────────────────────────────
  pool._smokeT = (pool._smokeT || 0) - dt;
  const smokeRate = enraged ? 0.07 : 0.12;
  if (pool._smokeT <= 0) {
    pool._smokeT = smokeRate;
    const hullYaw = group.rotation.y;
    // exhaust on rear engine deck
    const ex = group.position.x - Math.sin(hullYaw) * 3.0;
    const ez = group.position.z - Math.cos(hullYaw) * 3.0;
    const exhaustPos = new THREE.Vector3(ex + randRange(-0.3, 0.3), 1.5, ez + randRange(-0.3, 0.3));
    const smokeC = enraged
      ? new THREE.Color(Math.random() < 0.7 ? 0x3a3530 : 0x504540)
      : new THREE.Color(Math.random() < 0.6 ? 0x8a8480 : 0x6a6460);
    efx._spawn({
      pos: exhaustPos,
      vel: new THREE.Vector3(randRange(-0.15, 0.15), randRange(0.6, 1.2), randRange(-0.15, 0.15)),
      life: randRange(1.2, 2.2), size: enraged ? randRange(0.25, 0.45) : randRange(0.14, 0.26),
      grav: 0.3, drag: 0.6, color: smokeC,
      bounce: 0, floorY: -999, bloom: true,
    });
    // phase-2 occasional orange flame fleck
    if (enraged && Math.random() < 0.35) {
      efx._spawn({
        pos: exhaustPos.clone().add(new THREE.Vector3(0, 0.2, 0)),
        vel: new THREE.Vector3(randRange(-0.2, 0.2), randRange(1.0, 2.0), randRange(-0.2, 0.2)),
        life: randRange(0.2, 0.45), size: randRange(0.07, 0.14),
        grav: 1.5, drag: 1.2, color: new THREE.Color(Math.random() < 0.5 ? 0xff7020 : 0xffb040),
        bounce: 0, floorY: -999, shrink: true,
      });
    }
  }
}

// ── Tank headlight updater — call every frame for boss and captured tank ──────
// Reads scene brightness via engine.hemi.intensity (0.05 night … 0.95 noon).
// Full beam in the dark, off in full daylight.  No shadow maps — perf-safe.
export function updateTankLights(group, game) {
  const lights = group && group.userData && group.userData.headlampLights;
  if (!lights) return;
  const hemi = (game.engine && game.engine.hemi) ? game.engine.hemi.intensity : 1;
  // hemi ~0.95 at noon → dark=0; hemi ~0.05 at midnight → dark≈1
  const dark = Math.max(0, Math.min(1, (0.7 - hemi) / 0.65));
  const inten = dark * 2.2;
  for (const L of lights) L.intensity = inten;
  // glow the lens meshes proportionally
  const lens = group.userData.headlamps;
  if (lens) {
    for (const m of lens) {
      if (m.material && m.material.emissive) {
        m.material.emissive.setHex(0xfff0c0);
        m.material.emissiveIntensity = dark;
      }
    }
  }
}
