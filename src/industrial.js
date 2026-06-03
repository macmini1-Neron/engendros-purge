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
// OBJECT 3 — Main production hall (главный цех). Real: 48×28×14 m section,
// steel/RC portal frame, RED BRICK walls on a concrete plinth, 6 m bays with
// pilaster ribs + tall industrial windows, projecting cornice, a SAW-TOOTH
// (north-light, шедовая) roof of 4 glazed monitors, a rail gate on each gable
// (→ walkable interior, 2 exits), and an overhead YELLOW bridge crane (мостовой
// кран) on wall corbels at ~10.8 m. (Research dossier 2026-06-03.)
// One vertex-coloured mesh (brick/concrete/glass/steel) = one draw call.
// =====================================================================
export function buildMainHall(world, cx, cz) {
  const b = new MeshBuilder();
  const L2 = 24, W2 = 14, EH = 14, PH = 0.8, T = 0.6, bays = 8, bw = (L2 * 2) / bays;
  const BR = { hi: 0xa04a36, mid: 0x8b3a2a, lo: 0x6a2a1e, slot: 0x3a1810 };
  const CC = { hi: 0x9a958b, mid: 0x7c776d };
  const GLASS = 0x8fa6ad, FRAME = 0x45474a, ROOF = 0x2f2c28, CRANE = 0xf3a505, STEEL = 0x6c6c66;

  // ---- long brick walls (run along X at z = cz ± W2) ----
  for (const sz of [cz - W2, cz + W2]) {
    const out = sz < cz ? -1 : 1;                                       // exterior normal in Z
    world._solid(b, L2 * 2, EH, T, cx, EH / 2, sz, BR.mid, { tint: 0.05 }); // brick body (collider)
    b.box(L2 * 2, 0.5, T + 0.06, cx, EH - 0.3, sz, BR.hi);             // lit top strip
    b.box(L2 * 2, PH, T + 0.08, cx, PH / 2, sz, CC.mid);              // concrete plinth
    b.box(L2 * 2 + 0.5, 0.55, T + 0.3, cx, EH - 0.05, sz, CC.hi);     // cornice
    for (let i = 0; i < bays; i++) {
      const x = cx - L2 + bw * i;
      b.box(0.9, EH - PH - 0.2, T + 0.34, x, (EH + PH) / 2, sz, BR.hi, { tint: 0.04 }); // pilaster rib (proud)
      const wx = x + bw / 2, wy = 5.6, wh = 5, ww = bw * 0.5;
      b.box(ww, wh, 0.1, wx, wy, sz + out * (T / 2 + 0.03), GLASS);   // window glass (proud, exterior)
      b.box(ww + 0.14, wh + 0.14, 0.06, wx, wy, sz + out * (T / 2 + 0.01), FRAME); // window frame behind glass
      b.box(0.12, wh, 0.12, wx, wy, sz + out * (T / 2 + 0.05), FRAME);// centre mullion
    }
    b.box(0.9, EH - PH - 0.2, T + 0.34, cx + L2, (EH + PH) / 2, sz, BR.hi, { tint: 0.04 }); // last pilaster
  }

  // ---- gable walls (along Z at x = cx ± L2) with a 6×7 m rail gate gap ----
  const gw = 6, gh = 7, segW = (W2 * 2 - gw) / 2;
  for (const sx of [cx - L2, cx + L2]) {
    for (const side of [-1, 1]) {
      const segCz = cz + side * (gw / 2 + segW / 2);
      world._solid(b, T, EH, segW, sx, EH / 2, segCz, BR.mid, { tint: 0.05 });
      b.box(T + 0.08, PH, segW, sx, PH / 2, segCz, CC.mid);          // plinth
    }
    world._solid(b, T, EH - gh, gw, sx, gh + (EH - gh) / 2, cz, BR.mid, { tint: 0.05 }); // lintel over gate
    b.box(T + 0.3, 0.55, W2 * 2 + 0.5, sx, EH - 0.05, cz, CC.hi);    // gable cornice
    b.box(T + 0.14, gh, 0.3, sx, gh / 2, cz - gw / 2, 0x2d4a2a);     // gate jamb L (green)
    b.box(T + 0.14, gh, 0.3, sx, gh / 2, cz + gw / 2, 0x2d4a2a);     // gate jamb R
    b.box(T + 0.22, 1.5, 5.0, sx, gh + 2.4, cz, 0x2a2622);          // signage plate (ЦЕХ №1 — text in signage pass)
  }

  // ---- saw-tooth north-light roof: base slab + 4 glazed monitors ----
  const teeth = 4, tw = (W2 * 2) / teeth;
  b.box(L2 * 2 + 0.6, 0.4, W2 * 2 + 0.6, cx, EH + 0.2, cz, ROOF);    // opaque roof deck
  for (let t = 0; t < teeth; t++) {
    const z0 = cz - W2 + tw * t;
    b.box(L2 * 2, 3.0, 0.5, cx, EH + 1.9, z0 + 0.35, GLASS);         // glazed vertical face
    b.box(L2 * 2, 3.0, 0.12, cx, EH + 1.9, z0 + 0.62, FRAME);        // mullion frame
    b.box(L2 * 2, 0.35, tw - 0.7, cx, EH + 3.3, z0 + tw / 2 + 0.35, ROOF); // tooth top cap
  }

  // ---- overhead bridge crane (мостовой кран), yellow, on wall corbels ----
  const cy = 10.8, bx = cx + 5;
  for (const sz of [cz - W2 + 1.2, cz + W2 - 1.2]) b.box(L2 * 2, 0.35, 0.5, cx, cy, sz, STEEL); // runway rails
  b.box(1.0, 0.9, W2 * 2 - 2.2, bx, cy + 0.8, cz, CRANE, { tint: 0.03 });        // girder 1
  b.box(1.0, 0.9, W2 * 2 - 2.2, bx - 1.8, cy + 0.8, cz, CRANE, { tint: 0.03 });  // girder 2
  for (const ez of [cz - W2 + 1.2, cz + W2 - 1.2]) b.box(2.6, 1.1, 1.6, bx - 0.9, cy + 0.7, ez, 0x1a1a1a); // end trucks
  b.box(1.8, 0.8, 2.2, bx - 0.9, cy + 1.5, cz + 3, CRANE);          // trolley
  b.box(0.16, 2.6, 0.16, bx - 0.9, cy - 0.6, cz + 3, 0x2a2a2a);     // hoist cable
  b.box(0.7, 0.55, 0.7, bx - 0.9, cy - 2.0, cz + 3, STEEL);         // hook block

  const m = new THREE.Mesh(b.build(), voxelMaterial());
  m.castShadow = true; m.receiveShadow = true; world.scene.add(m);
}

// ---- reusable rectangular building: plinth + clad walls (collidable) +
// windows + cornice + flat roof, with optional door GAPS (walkable). Reused
// for ТЭЦ, furnace hall, warehouses, admin, gatehouse, canteen. ----
const BRICK = { hi: 0x8c4a36, mid: 0x743a2a, lo: 0x542a1e, slot: 0x331a12 };
const CONCRETE = { hi: 0x9a958b, mid: 0x7c776d, lo: 0x5c584f };
function buildBuilding(world, b, cx, cz, W, D, H, opts = {}) {
  const pal = opts.pal || BRICK, CC = CONCRETE, T = 0.6, PH = 0.7, GLASS = 0x8fa6ad, FRAME = 0x45474a;
  const doors = opts.doors || [];
  const doorOn = (s) => doors.find((d) => d.side === s);
  const wall = (axis, fixed, len, sideName) => {
    const door = doorOn(sideName), half = len / 2;
    if (!door) {
      if (axis === 'x') world._solid(b, len, H, T, cx, H / 2, fixed, pal.mid, { tint: 0.05 });
      else world._solid(b, T, H, len, fixed, H / 2, cz, pal.mid, { tint: 0.05 });
    } else {
      const dw = door.w, dh = door.h, off = door.off || 0, lintH = H - dh;
      const lSeg = half + off - dw / 2, rSeg = half - off - dw / 2;
      if (axis === 'x') {
        if (lSeg > 0.1) world._solid(b, lSeg, H, T, cx - half + lSeg / 2, H / 2, fixed, pal.mid, { tint: 0.05 });
        if (rSeg > 0.1) world._solid(b, rSeg, H, T, cx + half - rSeg / 2, H / 2, fixed, pal.mid, { tint: 0.05 });
        if (lintH > 0.1) world._solid(b, dw, lintH, T, cx + off, dh + lintH / 2, fixed, pal.mid, { tint: 0.05 });
      } else {
        if (lSeg > 0.1) world._solid(b, T, H, lSeg, fixed, H / 2, cz - half + lSeg / 2, pal.mid, { tint: 0.05 });
        if (rSeg > 0.1) world._solid(b, T, H, rSeg, fixed, H / 2, cz + half - rSeg / 2, pal.mid, { tint: 0.05 });
        if (lintH > 0.1) world._solid(b, T, lintH, dw, fixed, dh + lintH / 2, cz + off, pal.mid, { tint: 0.05 });
      }
    }
    // plinth + lit top strip + cornice (visual, proud) — layered shading
    if (axis === 'x') {
      b.box(len, PH, T + 0.08, cx, PH / 2, fixed, CC.mid);
      b.box(len, 0.4, T + 0.05, cx, H - 0.5, fixed, pal.hi);
      b.box(len + 0.4, 0.5, T + 0.28, cx, H - 0.1, fixed, CC.hi);
    } else {
      b.box(T + 0.08, PH, len, fixed, PH / 2, cz, CC.mid);
      b.box(T + 0.05, 0.4, len, fixed, H - 0.5, cz, pal.hi);
      b.box(T + 0.28, 0.5, len + 0.4, fixed, H - 0.1, cz, CC.hi);
    }
  };
  wall('x', cz - D / 2, W, 'S'); wall('x', cz + D / 2, W, 'N');
  wall('z', cx - W / 2, D, 'W'); wall('z', cx + W / 2, D, 'E');
  if (opts.windows) {
    const bayW = opts.bayW || 6, bays = Math.max(1, Math.round(W / bayW));
    for (const sz of [cz - D / 2, cz + D / 2]) {
      const out = sz < cz ? -1 : 1;
      for (let i = 0; i < bays; i++) {
        const wx = cx - W / 2 + (i + 0.5) * (W / bays), wy = H * 0.52, wh = Math.min(4, H * 0.5), ww = (W / bays) * 0.5;
        b.box(ww, wh, 0.1, wx, wy, sz + out * (T / 2 + 0.03), GLASS);
        b.box(ww + 0.12, wh + 0.12, 0.05, wx, wy, sz + out * (T / 2 + 0.01), FRAME);
      }
    }
  }
  b.box(W + 0.5, 0.4, D + 0.5, cx, H + 0.2, cz, opts.roof || 0x3a3631); // flat roof deck (above reach)
  for (const d of doors) { // green door jambs
    if (d.side === 'S' || d.side === 'N') { const fz = d.side === 'S' ? cz - D / 2 : cz + D / 2, dx = cx + (d.off || 0); b.box(0.3, d.h, 0.25, dx - d.w / 2, d.h / 2, fz, 0x2d4a2a); b.box(0.3, d.h, 0.25, dx + d.w / 2, d.h / 2, fz, 0x2d4a2a); }
    else { const fx = d.side === 'W' ? cx - W / 2 : cx + W / 2, dz = cz + (d.off || 0); b.box(0.25, d.h, 0.3, fx, d.h / 2, dz - d.w / 2, 0x2d4a2a); b.box(0.25, d.h, 0.3, fx, d.h / 2, dz + d.w / 2, 0x2d4a2a); }
  }
}

// ---- tapered brick chimney with white/red top bands (landmark) ----
function buildChimney(world, b, x, z, R, H) {
  const segs = 6, sh = H / segs;
  for (let i = 0; i < segs; i++) { const r = R * (1 - 0.36 * (i / segs)); cyl(b, r, sh + 0.06, x, sh * (i + 0.5), z, i % 2 ? BRICK.mid : BRICK.hi, { seg: 12, tint: 0.03 }); }
  const rt = R * 0.64;
  cyl(b, rt + 0.07, 0.8, x, H - 1.1, z, 0xd8d0c0, { seg: 12 });   // white band
  cyl(b, rt + 0.07, 0.8, x, H - 2.6, z, BRICK.lo, { seg: 12 });   // dark band
  cyl(b, rt * 1.06, 0.35, x, H, z, 0x2a2622, { seg: 12 });        // sooty cap
  collider(world, x, z, R * 0.9, 0, H);
}

// ---- hyperbolic concrete cooling tower (градирня) — the big landmark ----
function buildCoolingTower(world, b, x, z, R, H) {
  const C = CONCRETE, segs = 12, waist = 0.6;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const prof = t <= waist ? 0.58 + 0.42 * Math.pow((waist - t) / waist, 2) : 0.58 + 0.22 * Math.pow((t - waist) / (1 - waist), 2);
    cyl(b, R * prof, H / segs + 0.12, x, (H / segs) * (i + 0.5), z, i % 2 ? C.mid : C.hi, { seg: 20, tint: 0.02 });
  }
  cyl(b, R * 0.80, 0.5, x, H - 0.2, z, C.lo, { seg: 20 });   // top rim
  cyl(b, R * 0.66, 0.4, x, H + 0.1, z, 0x2a2826, { seg: 20 }); // dark throat
  // base A-frame supports (ring of short angled posts)
  const legs = 14; for (let i = 0; i < legs; i++) { const a = (i / legs) * TAU; b.box(0.4, 3.0, 0.4, x + Math.cos(a) * R * 0.92, 1.4, z + Math.sin(a) * R * 0.92, C.lo, { ry: -a, rz: 0.18 }); }
  collider(world, x, z, R * 0.95, 0, H);
}

// ---- blast furnace (домна): rusted stack with a wider bosh + downcomer ----
function buildBlastFurnace(world, b, x, z, R, H) {
  const M = { hi: 0x8a5a34, mid: 0x6e4526, lo: 0x4e301a };
  cyl(b, R * 1.05, 0.5, x, 0.25, z, M.lo, { seg: 12 });               // base
  cyl(b, R, H * 0.62, x, H * 0.34, z, M.mid, { seg: 12, tint: 0.03 });// stack
  cyl(b, R * 1.28, H * 0.18, x, H * 0.66, z, M.hi, { seg: 12 });      // bosh (bulge)
  cyl(b, R * 0.78, H * 0.2, x, H * 0.86, z, M.lo, { seg: 12 });       // throat
  b.box(0.5, H * 0.85, 0.5, x + R + 0.4, H * 0.42, z, 0x5c584f);      // downcomer pipe
  b.box(0.5, 0.5, R + 1.0, x + R * 0.6, H * 0.5, z + R * 0.6, 0x5c584f); // cross pipe
  collider(world, x, z, R * 1.28, 0, H);
}

const RENDER = { hi: 0xc2bbab, mid: 0xa49d8c, lo: 0x847d6c, slot: 0x55503f }; // plastered/rendered
const CORRUG = { hi: 0x8a9098, mid: 0x6c727a, lo: 0x4c5158, slot: 0x2e3136 }; // corrugated steel

// ---- elevated water tower (водонапорная башня): 4 legs + tank + cone cap ----
function buildWaterTower(world, b, x, z, H) {
  const S = 0x6c727a, Sl = 0x4c5158, tankR = 3.5, tankH = 4.5, leg = 3.0, legTop = H - tankH;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const lx = x + sx * leg, lz = z + sz * leg;
    b.box(0.4, legTop, 0.4, lx, legTop / 2, lz, S, { tint: 0.03 });
    collider(world, lx, lz, 0.3, 0, legTop);
  }
  for (const ry of [legTop * 0.4, legTop * 0.78]) { // bracing rings
    b.box(leg * 2 + 0.4, 0.22, 0.22, x, ry, z - leg, Sl); b.box(leg * 2 + 0.4, 0.22, 0.22, x, ry, z + leg, Sl);
    b.box(0.22, 0.22, leg * 2 + 0.4, x - leg, ry, z, Sl); b.box(0.22, 0.22, leg * 2 + 0.4, x + leg, ry, z, Sl);
  }
  const ty = legTop + tankH / 2;
  cyl(b, tankR, tankH, x, ty, z, S, { seg: 14, tint: 0.03 });
  cyl(b, tankR * 1.02, 0.4, x, legTop + 0.2, z, Sl, { seg: 14 });       // bottom rim
  cyl(b, tankR * 1.02, 0.4, x, ty + tankH / 2 - 0.2, z, 0x8a9098, { seg: 14 }); // lit top rim
  { const g = new THREE.CylinderGeometry(0.3, tankR, 2.0, 14); b.geo(g, x, ty + tankH / 2 + 1.0, z, Sl); g.dispose(); } // cone cap
  ladder(b, x, z + tankR + 0.02, 0, ty + tankH / 2, Sl);
  collider(world, x, z, tankR, legTop, H + 2);
}

// ---- concrete silo: cylinder + cone roof ----
function buildSilo(world, b, x, z, R, H) {
  const C = CONCRETE;
  cyl(b, R, H, x, H / 2, z, C.mid, { seg: 14, tint: 0.02 });
  cyl(b, R * 1.02, 0.4, x, H - 0.2, z, C.hi, { seg: 14 });
  { const g = new THREE.CylinderGeometry(R * 0.15, R, R * 0.6, 14); b.geo(g, x, H + R * 0.3, z, C.lo); g.dispose(); } // cone roof
  collider(world, x, z, R, 0, H);
}

// ---- armored railway wagon (military green, ribbed) ----
function wagon(world, b, x, z) {
  const C = { hi: 0x5a6450, mid: 0x46503e, lo: 0x33392b };
  b.box(7, 0.5, 2.6, x, 0.55, z, 0x3a3a3a);                 // underframe
  b.box(7, 2.4, 2.6, x, 2.0, z, C.mid, { tint: 0.03 });     // body
  b.box(7.1, 0.4, 2.7, x, 3.2, z, C.hi);                    // roof lip (lit)
  for (let i = -2; i <= 2; i++) b.box(0.2, 2.3, 2.72, x + i * 1.4, 2.0, z, C.lo); // ribs (proud)
  for (const wx of [x - 2.4, x + 2.4]) for (const dz of [-1.1, 1.1]) { const g = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10); b.geo(g, wx, 0.5, z + dz, 0x2a2a2a, { rx: Math.PI / 2 }); g.dispose(); }
  collider(world, x, z, 3.5, 0, 3.4, 1.4);
}
// ---- rail spur: ballast + 2 rails + ties + loading platform + 2 wagons ----
function buildRailSpur(world, b, x0, x1, z) {
  const len = Math.abs(x1 - x0), cx = (x0 + x1) / 2, lo = Math.min(x0, x1);
  b.box(len, 0.15, 3.0, cx, 0.08, z, 0x5a564e);             // ballast bed
  for (const dz of [-0.7, 0.7]) b.box(len, 0.12, 0.12, cx, 0.22, z + dz, 0x8a8680); // rails
  for (let xx = lo + 1; xx < lo + len; xx += 1.2) b.box(0.3, 0.1, 2.4, xx, 0.12, z, 0x4a3a28); // ties
  b.box(8, 0.6, 4, lo + 6, 0.3, z + 3.6, 0x8a857a); collider(world, lo + 6, z + 3.6, 4, 0, 0.6, 2); // loading platform
  wagon(world, b, cx - 4, z); wagon(world, b, cx + 10, z);
}
// ---- elevated X-aligned pipe rack (эстакада): bents + pipes (walk under) ----
function buildPipeRackX(world, b, x0, x1, z, h) {
  h = h || 4.5; const len = Math.abs(x1 - x0), cx = (x0 + x1) / 2, lo = Math.min(x0, x1), n = Math.max(2, Math.round(len / 6));
  for (let i = 0; i <= n; i++) { const px = lo + (len * i) / n; b.box(0.3, h, 0.3, px, h / 2, z - 0.6, 0x6c727a); b.box(0.3, h, 0.3, px, h / 2, z + 0.6, 0x6c727a); b.box(1.8, 0.25, 0.25, px, h - 0.2, z, 0x5c584f); collider(world, px, z, 0.3, 0, h - 1.2, 0.9); }
  for (const dz of [-0.45, 0, 0.45]) { const g = new THREE.CylinderGeometry(0.28, 0.28, len, 8); b.geo(g, cx, h + 0.1, z + dz, dz === 0 ? 0x9a948a : 0x8a857a, { rz: Math.PI / 2 }); g.dispose(); }
}
// ---- substation (подстанция): transformers + lattice pylon + insulators ----
function buildSubstation(world, b, x, z) {
  for (const dx of [-3.2, 3.2]) {
    b.box(2.4, 2.6, 2.0, x + dx, 1.3, z, 0x7c776d, { tint: 0.03 });            // transformer body
    for (let i = -2; i <= 2; i++) b.box(2.6, 0.12, 0.12, x + dx, 1.3 + i * 0.45, z + 1.05, 0x5c584f); // cooling fins
    b.box(0.3, 1.2, 0.3, x + dx, 3.2, z, 0x4a4a4a);                            // bushing
    collider(world, x + dx, z, 1.4, 0, 2.6, 1.1);
  }
  for (const c of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.18, 7, 0.18, x + c[0] * 1.2, 3.5, z + c[1] * 1.2, 0x6c727a); // pylon legs
  for (const ry of [2.2, 4.4, 6.4]) { b.box(2.6, 0.14, 0.14, x, ry, z - 1.2, 0x6c727a); b.box(2.6, 0.14, 0.14, x, ry, z + 1.2, 0x6c727a); }
  b.box(5, 0.2, 0.2, x, 7, z, 0x6c727a);                                       // crossarm
  for (const dx of [-2, 0, 2]) b.box(0.18, 0.7, 0.18, x + dx, 6.6, z, 0xb8c0c8); // insulators
}
// ---- slag heap (террикон): stepped dark cone, a landmark hill ----
function buildTerrikon(world, b, x, z, R, H) {
  const segs = 8;
  for (let i = 0; i < segs; i++) { const t = i / segs, r = R * (1 - t * 0.9); cyl(b, r, H / segs + 0.25, x, (H / segs) * (i + 0.5), z, i % 2 ? 0x3a342b : 0x463f33, { seg: 10, tint: 0.05 }); }
  collider(world, x, z, R * 0.66, 0, H);
}
// ---- cooling/settling pond (concrete rim + water) ----
function buildCoolingPond(b, x, z, W, D) {
  b.box(W + 1.4, 0.5, D + 1.4, x, 0.25, z, 0x7c776d);  // concrete rim
  b.box(W, 0.3, D, x, 0.34, z, 0x2b5a66);              // water
}

// ---- perimeter fence: concrete posts + panels, with gate GAPS ----
function buildFence(world, b, cx, cz, W, D, gates) {
  const H = 3, postC = 0x6c6760, panC = 0x8a857a, panLo = 0x6a655c, step = 6;
  const inGate = (side, p) => gates.some((g) => g.side === side && Math.abs(p - g.at) < g.w / 2);
  const run = (axis, fixed, from, to, side) => {
    for (let p = from; p < to - 0.1; p += step) {
      const segEnd = Math.min(p + step, to), mid = (p + segEnd) / 2, segLen = segEnd - p;
      if (axis === 'x') b.box(0.4, H + 0.5, 0.4, p, (H + 0.5) / 2, fixed, postC); else b.box(0.4, H + 0.5, 0.4, fixed, (H + 0.5) / 2, p, postC); // post
      if (inGate(side, mid)) continue;
      if (axis === 'x') { world._solid(b, segLen - 0.42, H, 0.25, mid, H / 2, fixed, panC, { tint: 0.03 }); b.box(segLen - 0.42, 0.3, 0.3, mid, H - 0.15, fixed, panLo); }
      else { world._solid(b, 0.25, H, segLen - 0.42, fixed, H / 2, mid, panC, { tint: 0.03 }); b.box(0.3, 0.3, segLen - 0.42, fixed, H - 0.15, mid, panLo); }
    }
    if (axis === 'x') b.box(0.4, H + 0.5, 0.4, to, (H + 0.5) / 2, fixed, postC); else b.box(0.4, H + 0.5, 0.4, fixed, (H + 0.5) / 2, to, postC); // end post
  };
  const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
  run('x', z0, x0, x1, 'S'); run('x', z1, x0, x1, 'N');
  run('z', x0, z0, z1, 'W'); run('z', x1, z0, z1, 'E');
}

// ---- misc dressing: light poles, pallet+crate stacks, pipe heaps ----
function buildMisc(world, b, rng) {
  for (const [x, z] of [[-40, -28], [22, -50], [56, -18], [-12, -76], [38, -82], [-52, -48]]) { // lamp posts
    b.box(0.3, 7, 0.3, x, 3.5, z, 0x4c5158); b.box(1.4, 0.3, 0.5, x, 6.85, z + 0.5, 0x4c5158);
    b.box(0.7, 0.25, 0.4, x, 6.7, z + 0.85, 0xffe39a); collider(world, x, z, 0.3, 0, 6.4);
  }
  for (const [x, z] of [[-44, -22], [14, -44], [50, -30], [-18, -80], [30, -60]]) { // pallets + crates
    for (let i = 0; i < 3; i++) {
      const px = x + randRange(-2.2, 2.2, rng), pz = z + randRange(-2.2, 2.2, rng);
      b.box(1.6, 0.18, 1.2, px, 0.1, pz, 0x6a5230, { ry: randRange(0, TAU, rng) });
      if (randRange(0, 1, rng) < 0.6) { const s = randRange(0.8, 1.3, rng); b.box(s, s, s, px, 0.2 + s / 2, pz, 0x7a5a34, { tint: 0.05, ry: randRange(-0.3, 0.3, rng) }); collider(world, px, pz, s / 2, 0, 0.2 + s); }
    }
  }
  for (const [x, z] of [[-46, -12], [44, -46]]) { // pipe heaps (lying)
    for (let i = 0; i < 4; i++) { const g = new THREE.CylinderGeometry(0.3, 0.3, 4, 8); b.geo(g, x + randRange(-1, 1, rng), 0.35 + (i % 2) * 0.62, z + i * 0.7 - 1, 0x6c727a, { rx: Math.PI / 2, tint: 0.04 }); g.dispose(); }
  }
}

// ---- OBJECT 8: Cyrillic signage (азбука) via CanvasTexture planes ----
// Lambert + alphaTest in the OPAQUE pass (so the depthTest-off viewmodel still
// draws over it), offset proud of the wall to avoid z-fighting. Mirrors the
// T-90M weak-point poster pattern in world.js.
function signTex(text, opts = {}) {
  const W = opts.cw || 512, H = opts.ch || 128, cv = document.createElement('canvas');
  cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  if (opts.panel) { ctx.fillStyle = opts.panel; ctx.fillRect(0, 0, W, H); if (opts.border) { ctx.strokeStyle = opts.border; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8); } }
  ctx.fillStyle = opts.color || '#e8e0cc';
  ctx.font = `bold ${opts.size || 78}px "Russo One", Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2 + 4);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function signPlane(world, text, x, y, z, w, h, ry, opts = {}) {
  const tex = signTex(text, { cw: Math.max(256, Math.round(w * 48)), ch: Math.max(96, Math.round(h * 64)), ...opts });
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: !opts.panel, alphaTest: opts.panel ? 0 : 0.5, emissive: 0x0c0c0c, emissiveIntensity: 1, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 4; m.frustumCulled = true;
  world.scene.add(m);
}
function buildSignage(world) {
  // ЦЕХ №1 — east gable of the main hall (faces +X, toward the yard)
  signPlane(world, 'ЦЕХ №1', -3.55, 9.4, -32, 4.6, 1.3, Math.PI / 2, { color: '#e8e0cc' });
  // СЛАВА ТРУДУ! — red banner along the main hall's south long wall (faces −Z)
  signPlane(world, 'СЛАВА ТРУДУ!', -28, 11.6, -46.55, 24, 1.9, Math.PI, { panel: '#9a2b22', color: '#f2e9d6', size: 92, border: '#d8cfb8' });
  // ОГНЕОПАСНО — hazard sign by the gasholders (yellow/black)
  signPlane(world, 'ОГНЕОПАСНО', 36, 9, -48.6, 6, 1.4, Math.PI, { panel: '#c9a23a', color: '#1a1a1a', size: 70, border: '#1a1a1a' });
  // ПРОХОДНАЯ — over the gatehouse south door
  signPlane(world, 'ПРОХОДНАЯ', 0, 4.4, -94.6, 5, 1.1, Math.PI, { panel: '#2d4a2a', color: '#e8e0cc', size: 64 });
  // ЗАВОДОУПРАВЛЕНИЕ + ★ — admin south face
  signPlane(world, 'ЗАВОДОУПРАВЛЕНИЕ', -22, 5.7, -88.62, 12, 1.2, Math.PI, { color: '#f2e9d6', size: 56 });
  signPlane(world, '★', -22, 7.0, -88.62, 1.4, 1.4, Math.PI, { color: '#cc2b22', size: 110 });
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

  // --- OBJECT 3: main production hall (главный цех) — its own merged mesh ---
  buildMainHall(world, ox - 28, oz + 8); // world centre (-28, -32)

  // --- OBJECT 4: powerhouse (ТЭЦ + chimneys + cooling tower) + furnace hall + blast furnaces ---
  const struct = new MeshBuilder();
  buildBuilding(world, struct, ox + 20, oz + 12, 26, 16, 12, { windows: true, doors: [{ side: 'S', w: 4, h: 4 }, { side: 'N', w: 4, h: 4 }] }); // ТЭЦ boiler house
  buildChimney(world, struct, ox + 26, oz + 14, 1.6, 30);
  buildChimney(world, struct, ox + 30, oz + 12, 1.6, 33);
  buildChimney(world, struct, ox + 34, oz + 10, 1.5, 28);
  buildCoolingTower(world, struct, ox + 52, oz + 6, 12, 28);
  buildBuilding(world, struct, ox - 30, oz - 22, 36, 20, 12, { windows: true, doors: [{ side: 'W', w: 5, h: 5 }, { side: 'E', w: 6, h: 6 }] }); // furnace hall (мартен)
  buildBlastFurnace(world, struct, ox - 12, oz - 22, 4.5, 18);
  buildBlastFurnace(world, struct, ox - 12, oz - 14, 4, 16);
  const sm = new THREE.Mesh(struct.build(), voxelMaterial());
  sm.castShadow = true; sm.receiveShadow = true; world.scene.add(sm);

  // --- OBJECT 5: support buildings (admin, gatehouse, warehouses, canteen, water tower, silos) ---
  const sup = new MeshBuilder();
  buildBuilding(world, sup, ox - 22, oz - 44, 16, 9, 7, { pal: RENDER, windows: true, bayW: 4, doors: [{ side: 'S', w: 2.6, h: 3.2 }] }); // заводоуправление
  buildBuilding(world, sup, ox + 0, oz - 52, 8, 5, 4, { pal: BRICK, doors: [{ side: 'S', w: 2.4, h: 3 }, { side: 'N', w: 2.4, h: 3 }] });   // проходная (pass-through)
  buildBuilding(world, sup, ox - 58, oz - 30, 18, 10, 6, { pal: CORRUG, doors: [{ side: 'E', w: 6, h: 5 }] }); // warehouse 1
  buildBuilding(world, sup, ox - 58, oz - 16, 18, 10, 6, { pal: CORRUG, doors: [{ side: 'E', w: 6, h: 5 }] }); // warehouse 2
  buildBuilding(world, sup, ox + 10, oz - 46, 9, 6, 4, { pal: RENDER, windows: true, bayW: 3, doors: [{ side: 'N', w: 2.2, h: 3 }] });      // столовая
  buildWaterTower(world, sup, ox - 60, oz + 38, 22);
  buildSilo(world, sup, ox - 48, oz - 40, 3, 12); buildSilo(world, sup, ox - 43, oz - 44, 3, 12); buildSilo(world, sup, ox - 53, oz - 44, 3, 12);
  const supm = new THREE.Mesh(sup.build(), voxelMaterial());
  supm.castShadow = true; supm.receiveShadow = true; world.scene.add(supm);

  // --- OBJECT 6 + 7: infrastructure + perimeter fence + misc dressing ---
  const infra = new MeshBuilder();
  buildRailSpur(world, infra, ox + 75, ox + 5, oz - 2);     // rail from E gate, z=-42
  buildPipeRackX(world, infra, ox + 0, ox + 28, oz - 6, 4.5);   // pipe rack (0..28, -46)
  buildPipeRackX(world, infra, ox + 38, ox + 62, oz - 26, 4.5); // pipe rack (38..62, -66)
  buildSubstation(world, infra, ox + 16, oz - 34);          // (16, -74)
  buildTerrikon(world, infra, ox + 58, oz + 42, 16, 14);    // slag heap (58, 2) NE
  buildCoolingPond(infra, ox + 48, oz - 46, 24, 16);        // (48, -86)
  buildFence(world, infra, ox + 0, oz - 40, 150, 110, [{ side: 'S', at: 0, w: 8 }, { side: 'E', at: -42, w: 8 }, { side: 'W', at: 10, w: 6 }]);
  buildMisc(world, infra, rng);
  const im = new THREE.Mesh(infra.build(), voxelMaterial());
  im.castShadow = true; im.receiveShadow = true; world.scene.add(im);

  // --- OBJECT 8: Cyrillic signage (азбука) — own textured planes ---
  buildSignage(world);
}
