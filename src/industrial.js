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

// ---- perimeter fence: concrete posts + panels. Gates split each side into solid SPANS,
// so panels stop exactly at the gate edges and no post ever stands inside an opening. ----
function buildFence(world, b, cx, cz, W, D, gates) {
  const H = 3, postC = 0x6c6760, panC = 0x8a857a, panLo = 0x6a655c, step = 6;
  const post = (axis, fixed, p) => { if (axis === 'x') b.box(0.4, H + 0.5, 0.4, p, (H + 0.5) / 2, fixed, postC); else b.box(0.4, H + 0.5, 0.4, fixed, (H + 0.5) / 2, p, postC); };
  const panel = (axis, fixed, mid, len) => {
    if (axis === 'x') { world._solid(b, len - 0.42, H, 0.25, mid, H / 2, fixed, panC, { tint: 0.03 }); b.box(len - 0.42, 0.3, 0.3, mid, H - 0.15, fixed, panLo); }
    else { world._solid(b, 0.25, H, len - 0.42, fixed, H / 2, mid, panC, { tint: 0.03 }); b.box(0.3, 0.3, len - 0.42, fixed, H - 0.15, mid, panLo); }
  };
  const side = (axis, fixed, lo, hi, name) => {
    const gaps = gates.filter((g) => g.side === name).map((g) => [g.at - g.w / 2, g.at + g.w / 2]).sort((a, c) => a[0] - c[0]);
    const spans = []; let cur = lo;
    for (const [ga, gb] of gaps) { if (ga > cur) spans.push([cur, Math.min(ga, hi)]); cur = Math.max(cur, gb); }
    if (cur < hi) spans.push([cur, hi]);
    for (const [s0, s1] of spans) {
      const n = Math.max(1, Math.round((s1 - s0) / step)), sl = (s1 - s0) / n;
      for (let i = 0; i <= n; i++) post(axis, fixed, s0 + sl * i);            // posts incl. exact span ends
      for (let i = 0; i < n; i++) panel(axis, fixed, s0 + sl * (i + 0.5), sl); // panels clipped to the span
    }
  };
  const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
  side('x', z0, x0, x1, 'S'); side('x', z1, x0, x1, 'N');
  side('z', x0, z0, z1, 'W'); side('z', x1, z0, z1, 'E');
}

// ---- one sliding gate leaf as its OWN animated mesh (local origin = leaf centre):
// maroon panelled steel with stiles/rails, raised panels both faces, and 2 ground wheels. ----
function buildGateLeaf(W, H) {
  const lb = new MeshBuilder();
  const MAROON = 0x6a2526, MA_HI = 0x803232, MA_LO = 0x481818, FR = 0x57201f;
  lb.box(W, H, 0.16, 0, 0, 0, MAROON, { tint: 0.03 });                            // slab
  lb.box(W, 0.3, 0.22, 0, H / 2 - 0.15, 0, MA_HI);                                // top rail (lit)
  lb.box(W, 0.3, 0.22, 0, -H / 2 + 0.15, 0, MA_LO);                               // bottom rail
  for (const sx of [-1, 1]) lb.box(0.22, H, 0.22, sx * (W / 2 - 0.11), 0, 0, FR); // stiles
  lb.box(0.18, H, 0.2, 0, 0, 0, FR);                                              // centre mullion
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {                           // raised panels (both faces)
    const px = sx * W * 0.24, py = sy * H * 0.22;
    lb.box(W * 0.32, H * 0.3, 0.06, px, py, 0.11, MA_LO);
    lb.box(W * 0.32, H * 0.3, 0.06, px, py, -0.11, MA_LO);
  }
  for (const wx of [-W * 0.32, W * 0.32]) {                                        // 2 ground wheels (roll along X)
    let g = new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12); lb.geo(g, wx, -H / 2 - 0.05, 0, 0x222222, { rz: Math.PI / 2 }); g.dispose();
    g = new THREE.CylinderGeometry(0.09, 0.09, 0.2, 8); lb.geo(g, wx, -H / 2 - 0.05, 0, 0x8a8680, { rz: Math.PI / 2 }); g.dispose(); // hub
  }
  const m = new THREE.Mesh(lb.build(), voxelMaterial());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---- main works gate (реальная предлога): 2 weathered concrete pillars, a yellow rail/beam
// bolted on with black brackets, the name board (added in buildSignage), a ground track, and
// TWO bi-parting SLIDING leaves on wheels that auto-open when a player nears. Walkable. ----
function buildGate(world, b, gx, gz, opening) {
  const C = CONCRETE, half = opening / 2, PW = 1.6, PH = 5.0, PD = 1.4, px = half + 0.9, railY = 3.6;
  for (const sx of [-1, 1]) {
    const x = gx + sx * px;
    world._solid(b, PW, PH, PD, x, PH / 2, gz, C.mid, { tint: 0.05 });             // concrete pillar (collider)
    b.box(PW + 0.14, 0.45, PD + 0.14, x, PH - 0.15, gz, C.hi);                     // lit cap
    b.box(PW + 0.06, PH - 1.2, 0.18, x, PH * 0.5, gz - PD / 2 - 0.03, C.lo);       // weather streak (proud)
    b.box(0.75, 1.5, 0.95, x, railY, gz, 0x1e1e1e);                                // black bracket: beam ↔ pillar joint
  }
  const beamW = opening + PW * 2 + 1.0;
  b.box(beamW, 0.5, 0.5, gx, railY, gz, 0xe0b020, { tint: 0.04 });                 // yellow rail/beam
  b.box(beamW, 0.14, 0.56, gx, railY + 0.23, gz, 0xf4d24a);                        // lit top flange
  for (const sx of [-2.6, 0, 2.6]) b.box(0.12, 1.4, 0.12, gx + sx, railY + 0.95, gz, 0x262626); // name-board mount struts
  b.box(opening + 1.2, 0.13, 0.13, gx, railY + 1.6, gz, 0x262626);                 // top rail
  // ground track the leaves roll on (flat → walkable, no collider)
  const trackW = opening + 2 * (half + 1);
  b.box(trackW, 0.12, 0.34, gx, 0.06, gz - 0.85, 0x39362f);
  b.box(trackW, 0.07, 0.12, gx, 0.13, gz - 0.85, 0x7c776d);                        // rail head
  // --- two bi-parting sliding leaves (own meshes; no collider → the auto-open keeps it passable) ---
  const W = half, H = 3.3, cy = 1.9, dz = gz - 0.85, travel = half + 0.4;          // leaves run in front of the pillars
  const leftClosed = gx - half / 2, rightClosed = gx + half / 2;
  const left = buildGateLeaf(W, H), right = buildGateLeaf(W, H);
  left.position.set(leftClosed, cy, dz); right.position.set(rightClosed, cy, dz);
  world.scene.add(left); world.scene.add(right);
  world._slideGate = { left, right, gx, gz, leftClosed, rightClosed, travel, amt: 0 };
  // proximity auto-open (cosmetic, local player) — ticked from the game loop via world.updateGate
  world.updateGate = function (dt, ppos) {
    const G = this._slideGate; if (!G || !ppos) return;
    const near = Math.hypot(ppos.x - G.gx, ppos.z - G.gz) < 12;
    G.amt += ((near ? 1 : 0) - G.amt) * Math.min(1, dt * 2.6);                     // smooth open/close
    const t = G.travel * G.amt;
    G.left.position.x = G.leftClosed - t;
    G.right.position.x = G.rightClosed + t;
  };
}

// ---- misc dressing: light poles, pallet+crate stacks, pipe heaps ----
function buildMisc(world, b, rng) {
  for (const [x, z] of [[-44, -12], [18, -6], [58, -26], [-30, -66], [34, -58], [-2, -84]]) { // lamp posts
    b.box(0.3, 7, 0.3, x, 3.5, z, 0x4c5158); b.box(1.4, 0.3, 0.5, x, 6.85, z + 0.5, 0x4c5158);
    b.box(0.7, 0.25, 0.4, x, 6.7, z + 0.85, 0xffe39a); collider(world, x, z, 0.3, 0, 6.4);
  }
  for (const [x, z] of [[-44, -26], [22, -54], [-30, -72], [8, -68]]) { // pallets + crates
    for (let i = 0; i < 3; i++) {
      const px = x + randRange(-2.2, 2.2, rng), pz = z + randRange(-2.2, 2.2, rng);
      b.box(1.6, 0.18, 1.2, px, 0.1, pz, 0x6a5230, { ry: randRange(0, TAU, rng) });
      if (randRange(0, 1, rng) < 0.6) { const s = randRange(0.8, 1.3, rng); b.box(s, s, s, px, 0.2 + s / 2, pz, 0x7a5a34, { tint: 0.05, ry: randRange(-0.3, 0.3, rng) }); collider(world, px, pz, s / 2, 0, 0.2 + s); }
    }
  }
  for (const [x, z] of [[-48, -24], [44, -58]]) { // pipe heaps (lying)
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
  // ЦЕХ №1 — east gable of the main hall (x=8 gable, faces +X toward the yard)
  signPlane(world, 'ЦЕХ №1', 8.45, 9.4, -18, 4.6, 1.3, Math.PI / 2, { color: '#e8e0cc' });
  // СЛАВА ТРУДУ! — red banner along the main hall's south long wall (z=-32, faces −Z)
  signPlane(world, 'СЛАВА ТРУДУ!', -16, 11.6, -32.55, 24, 1.9, Math.PI, { panel: '#9a2b22', color: '#f2e9d6', size: 92, border: '#d8cfb8' });
  // ОГНЕОПАСНО — hazard sign at the fuel zone (yellow/black, faces +Z into the yard)
  signPlane(world, 'ОГНЕОПАСНО', 40, 9, -64.5, 6, 1.4, 0, { panel: '#c9a23a', color: '#1a1a1a', size: 70, border: '#1a1a1a' });
  // ПРОХОДНАЯ — over the guard booth's west door (booth at x=8, z=-94; faces the entrance lane, −X)
  signPlane(world, 'ПРОХОДНАЯ', 6.22, 3.0, -94, 3.4, 0.8, -Math.PI / 2, { panel: '#2d4a2a', color: '#e8e0cc', size: 56 });
  // ОКТЯБРЬ — name board over the main gate (faded white/grey enamel plaque, faces −Z)
  signPlane(world, 'ОКТЯБРЬ', 0, 4.55, -98.18, 8.6, 1.5, Math.PI, { panel: '#c7c3b5', border: '#9a9486', color: '#7a2a26', size: 122, cw: 1100, ch: 220 });
  // (заводоуправление name board + ★ star are built into buildAdmin now — on the HQ itself)
}

// =====================================================================
// ЗАВОДОУПРАВЛЕНИЕ — factory administration HQ (remodel via the voxel-building skill + a
// research dossier). Stalinist 2-storey block on a granite plinth, pale-ochre render, 7-bay
// tall 6-pane white windows (ground floor taller), a central portico, a 3-D red star + name
// board on the parapet, and a WALKABLE interior (lobby + reception desk + 2 columns + honor
// board, a stair up to a floor-2 meeting room). Faces SOUTH, toward the gate. cx,cz = centre.
// =====================================================================
function buildAdmin(world, cx, cz, deg = 0) {
  // Build at LOCAL origin into a proxy world (colliders collected locally), then rotate+place the whole
  // HQ as a unit — lets it face any cardinal direction with correct axis-aligned AABB colliders.
  const ax = cx, az = cz; cx = 0; cz = 0;
  const PW = Object.create(world); PW.boxes = [];
  const b = new MeshBuilder();
  const W = 18, D = 11, GF = 4.0, UF = 3.6, EH = GF + UF, T = 0.6;
  const OCH = { hi: 0xe6d2a0, mid: 0xdcc488, lo: 0xc6ac6e };
  const GRAN = 0x6e6a63, WHITE = 0xece8dd, GLASS = 0x8fb0b6, CORN = 0xd6cdb6, ROOF = 0x46423a;
  const RED = 0xc1272d, IFLOOR = 0x9a958b, FLOOR2 = 0xb39c74, WOOD = 0x6a4a2a;
  const sz = cz - D / 2, nz = cz + D / 2, wx = cx - W / 2, ex = cx + W / 2;

  // --- perimeter walls (solid colliders); S & N get a ground doorway (2 walkable exits) ---
  PW._wall(b, cx, sz, W, GF, 0, 'x', OCH.mid, { width: 3.2, height: 3.2 });
  PW._solid(b, W, UF, T, cx, GF + UF / 2, sz, OCH.mid, { tint: 0.03 });
  PW._wall(b, cx, nz, W, GF, 0, 'x', OCH.mid, { width: 2.4, height: 2.8 });
  PW._solid(b, W, UF, T, cx, GF + UF / 2, nz, OCH.mid, { tint: 0.03 });
  PW._solid(b, T, EH, D, wx, EH / 2, cz, OCH.mid, { tint: 0.03 });
  PW._solid(b, T, EH, D, ex, EH / 2, cz, OCH.mid, { tint: 0.03 });

  // --- interior floor, 2nd-floor slab (hole over the stair), roof slab, stair to floor 2 ---
  PW._floor(b, cx, cz, W - T, D - T, 0.12, IFLOOR);
  const stx = wx + 2.0, stz0 = sz + 1.4, steps = 12, run = 0.5, rise = GF / steps, runLen = steps * run;
  const hole = { x: stx, z: stz0 + (runLen - run) / 2, w: 2.9, d: runLen + 0.5 };
  PW._floor(b, cx, cz, W, D, GF, FLOOR2, hole);
  PW._floor(b, cx, cz, W, D, EH, ROOF);
  PW._stairs(b, stx, stz0, 0, 1, steps, 0xb98a4e, 0.12, rise, run, 2.3);

  // --- granite plinth (split at the doors), projecting cornice, parapet ---
  for (const zz of [sz, nz]) { b.box(7.3, 1.0, T + 0.3, cx - 5.35, 0.5, zz, GRAN); b.box(7.3, 1.0, T + 0.3, cx + 5.35, 0.5, zz, GRAN); }
  for (const xx of [wx, ex]) b.box(T + 0.3, 1.0, D + 0.4, xx, 0.5, cz, GRAN);
  b.box(W + 0.9, 0.5, T + 0.5, cx, EH - 0.1, sz, CORN); b.box(W + 0.9, 0.5, T + 0.5, cx, EH - 0.1, nz, CORN);
  b.box(T + 0.5, 0.5, D + 0.9, wx, EH - 0.1, cz, CORN); b.box(T + 0.5, 0.5, D + 0.9, ex, EH - 0.1, cz, CORN);
  b.box(W + 0.5, 0.9, 0.45, cx, EH + 0.45, sz, OCH.hi); b.box(W + 0.5, 0.9, 0.45, cx, EH + 0.45, nz, OCH.hi);
  b.box(0.45, 0.9, D + 0.5, wx, EH + 0.45, cz, OCH.hi); b.box(0.45, 0.9, D + 0.5, ex, EH + 0.45, cz, OCH.hi);

  // --- windows: tall, vertical, white-framed, 6-pane (ground floor taller) ---
  const winZ = (x, y, zz, out, w, h) => { const zo = zz + out * (T / 2);
    b.box(w + 0.26, h + 0.26, 0.1, x, y, zo + out * 0.03, WHITE); b.box(w, h, 0.08, x, y, zo + out * 0.06, GLASS);
    b.box(0.09, h, 0.1, x, y, zo + out * 0.08, WHITE); b.box(w, 0.09, 0.1, x, y + h * 0.17, zo + out * 0.08, WHITE); b.box(w, 0.09, 0.1, x, y - h * 0.17, zo + out * 0.08, WHITE); };
  const winX = (z, y, xx, out, w, h) => { const xo = xx + out * (T / 2);
    b.box(0.1, h + 0.26, w + 0.26, xo + out * 0.03, y, z, WHITE); b.box(0.08, h, w, xo + out * 0.06, y, z, GLASS);
    b.box(0.1, h, 0.09, xo + out * 0.08, y, z, WHITE); b.box(0.1, 0.09, w, xo + out * 0.08, y + h * 0.17, z, WHITE); b.box(0.1, 0.09, w, xo + out * 0.08, y - h * 0.17, z, WHITE); };
  const bays = 7, bp = W / bays;
  for (let i = 0; i < bays; i++) { const x = wx + (i + 0.5) * bp;
    if (i < 2 || i > 4) winZ(x, 2.2, sz, -1, 1.35, 2.6);   // S ground: skip central 3 bays (portico)
    if (i !== 3) winZ(x, 2.2, nz, 1, 1.35, 2.6);            // N ground: skip the door bay
    winZ(x, 5.8, sz, -1, 1.35, 2.2); winZ(x, 5.8, nz, 1, 1.35, 2.2); } // upper floor: every bay
  const bpD = D / 4;
  for (let j = 0; j < 4; j++) { const z = sz + (j + 0.5) * bpD;
    winX(z, 2.2, wx, -1, 1.2, 2.5); winX(z, 2.2, ex, 1, 1.2, 2.5); winX(z, 5.8, wx, -1, 1.2, 2.1); winX(z, 5.8, ex, 1, 1.2, 2.1); }

  // --- central portico over the south entrance + entrance apron ---
  b.box(6.4, 0.45, 3.2, cx, 3.5, sz - 1.4, CORN); b.box(6.6, 0.18, 3.4, cx, 3.78, sz - 1.4, OCH.hi); // canopy + lit lip
  for (const dx of [-2.8, 2.8]) b.box(0.45, 3.5, 0.45, cx + dx, 1.75, sz - 2.85, GRAN);              // 2 posts
  b.box(7.0, 0.2, 1.6, cx, 0.1, sz - 1.5, GRAN);                                                     // entrance apron

  // --- interior: 2 columns, reception counter, floor-2 meeting table + a stairwell rail ---
  for (const dx of [-3.6, 3.6]) { PW._solid(b, 0.7, GF, 0.7, cx + dx, GF / 2, cz - 1.0, IFLOOR, { tint: 0.03 });
    b.box(0.95, 0.3, 0.95, cx + dx, GF - 0.16, cz - 1.0, CORN); b.box(0.95, 0.3, 0.95, cx + dx, 0.27, cz - 1.0, GRAN); }
  PW._solid(b, 4.0, 1.1, 1.0, cx + 4.5, 0.66, sz + 2.6, WOOD, { tint: 0.03 }); b.box(4.3, 0.16, 1.2, cx + 4.5, 1.24, sz + 2.6, 0x8a6a3a);          // reception counter
  PW._solid(b, 5.0, 0.85, 1.5, cx, GF + 0.55, sz + 2.6, 0x7a2a26, { tint: 0.03 }); b.box(5.2, 0.14, 1.7, cx, GF + 1.0, sz + 2.6, 0x9a3a32);       // floor-2 meeting table
  b.box(0.1, 1.0, hole.d, hole.x + hole.w / 2 + 0.12, GF + 0.5, hole.z, 0x4a4a4a);                    // stairwell rail (open east side)

  // --- 3-D red star on a short pylon at the south parapet centre ---
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? 0.42 : 1.05, px = Math.cos(a) * rad, py = Math.sin(a) * rad; if (i === 0) star.moveTo(px, py); else star.lineTo(px, py); }
  star.closePath();
  const sg = new THREE.ExtrudeGeometry(star, { depth: 0.35, bevelEnabled: false }); b.geo(sg, cx, EH + 2.1, sz + 0.35, RED); sg.dispose();
  for (const dx of [-0.7, 0.7]) b.box(0.12, 2.3, 0.12, cx + dx, EH + 1.05, sz + 0.45, 0x2a2a2a);

  const m = new THREE.Mesh(b.build(), voxelMaterial()); m.castShadow = true; m.receiveShadow = true;
  const rad = deg * Math.PI / 180; m.rotation.y = rad; m.position.set(ax, 0, az); world.scene.add(m);
  // rotate+translate the local colliders into the real world (90° multiples keep AABBs axis-aligned)
  const cs = Math.cos(rad), sn = Math.sin(rad), odd = Math.abs(Math.round(deg / 90)) % 2 === 1;
  for (const bx of PW.boxes) {
    const lx = (bx.min.x + bx.max.x) / 2, lz = (bx.min.z + bx.max.z) / 2, hx = (bx.max.x - bx.min.x) / 2, hz = (bx.max.z - bx.min.z) / 2;
    const rx = lx * cs + lz * sn, rz = -lx * sn + lz * cs, nhx = odd ? hz : hx, nhz = odd ? hx : hz;
    world.boxes.push({ min: new THREE.Vector3(ax + rx - nhx, bx.min.y, az + rz - nhz), max: new THREE.Vector3(ax + rx + nhx, bx.max.y, az + rz + nhz) });
  }
  // --- signage (own textured planes; transformed with the building) ---
  const sp = (text, lx, ly, lz, w, h, lry, o) => { const rx = lx * cs + lz * sn, rz = -lx * sn + lz * cs; signPlane(world, text, ax + rx, ly, az + rz, w, h, lry + rad, o); };
  sp('ЗАВОДОУПРАВЛЕНИЕ', cx, EH + 0.5, sz - 0.45, 13, 0.95, Math.PI, { panel: '#2a2622', border: '#c8a24a', color: '#e8dca0', size: 60, cw: 1400, ch: 150 });
  sp('ДОСКА ПОЧЁТА', cx - 5, 2.4, nz - 0.42, 3.6, 1.9, Math.PI, { panel: '#9a2b22', border: '#c8a24a', color: '#f2e9d6', size: 52, cw: 512, ch: 280 });
}

// =====================================================================
// Entry — assembles the kombinát. Objects are added incrementally per the
// build plan (barrels → tanks → buildings → infra → fence → signs → misc).
// =====================================================================
export function buildIndustrial(world, ox, oz) {
  const rng = makeRNG(0x1AD05);
  const metal = new MeshBuilder(); // merged mesh bucket for metal props (one draw call)

  // Re-laid-out 2026-06-03: called with ox=oz=0, so every coord below is WORLD metres
  // (+X = east, +Z = north). Structures are spread with clear walking lanes and the
  // fence re-centred on the built mass (≈ x[-79,79], z[-98,6]); all the earlier overlaps
  // are gone — blast furnaces clear of the мартен wall, tanks clear of the pond, the rail
  // clear of the cooling tower, drums out of the hall — and the terrikon sits OUTSIDE the
  // fence (NE) as a realistic waste heap.

  // --- OBJECT 1: fuel drums at the fuelling points ---
  buildFuelDrums(world, metal, ox + 52, oz - 82, 9, rng); // tank farm (SE)
  buildFuelDrums(world, metal, ox + 24, oz - 56, 6, rng); // rail loading platform
  buildFuelDrums(world, metal, ox - 46, oz - 30, 5, rng); // by the furnace hall

  // --- OBJECT 2: storage tanks (резервуары) + gasholders (газгольдеры) — fuel zone (SE) ---
  buildTank(world, metal, ox + 64, oz - 72, 5,   8, GREY, rng);
  buildTank(world, metal, ox + 70, oz - 86, 4,   7, RUST, rng);
  buildTank(world, metal, ox + 58, oz - 90, 4.5, 8, GREY, rng);
  buildGasholder(world, metal, ox + 32, oz - 74, 7,   16, rng);
  buildGasholder(world, metal, ox + 50, oz - 72, 6,   14, rng);
  buildGasholder(world, metal, ox + 40, oz - 88, 6.5, 15, rng);

  const m = new THREE.Mesh(metal.build(), voxelMaterial());
  m.castShadow = true; m.receiveShadow = true;
  world.scene.add(m);

  // --- OBJECT 3: main production hall (главный цех) — north-centre landmark ---
  buildMainHall(world, ox - 16, oz - 18); // world centre (-16, -18)

  // --- OBJECT 4: powerhouse (ТЭЦ + chimneys + cooling tower) + furnace hall + blast furnaces ---
  const struct = new MeshBuilder();
  buildBuilding(world, struct, ox + 40, oz - 20, 26, 16, 12, { windows: true, doors: [{ side: 'S', w: 4, h: 4 }, { side: 'W', w: 4, h: 4 }] }); // ТЭЦ boiler house
  buildChimney(world, struct, ox + 34, oz - 20, 1.6, 30);
  buildChimney(world, struct, ox + 40, oz - 20, 1.6, 33);
  buildChimney(world, struct, ox + 46, oz - 20, 1.5, 28);
  buildCoolingTower(world, struct, ox + 62, oz - 46, 12, 28);
  buildBuilding(world, struct, ox - 52, oz - 46, 36, 20, 12, { windows: true, doors: [{ side: 'E', w: 5, h: 5 }, { side: 'S', w: 6, h: 6 }] }); // furnace hall (мартен)
  buildBlastFurnace(world, struct, ox - 24, oz - 42, 4.5, 18);
  buildBlastFurnace(world, struct, ox - 24, oz - 54, 4, 16);
  const sm = new THREE.Mesh(struct.build(), voxelMaterial());
  sm.castShadow = true; sm.receiveShadow = true; world.scene.add(sm);

  // --- OBJECT 5: support buildings (admin, gatehouse, warehouses, canteen, water tower, silos) ---
  const sup = new MeshBuilder();
  buildAdmin(world, ox - 24, oz - 72, -90); // заводоуправление — 2-floor HQ rotated to face the gate/entrance lane (grand facade now faces +X) (own mesh + signage)
  buildBuilding(world, sup, ox + 8, oz - 94, 3.6, 4, 4, { pal: BRICK, doors: [{ side: 'W', w: 1.8, h: 2.6 }, { side: 'N', w: 1.8, h: 2.6 }] });   // проходная (guard booth — in the clear gap east of the gate, between the gate pillar (x≈5) and the столовая (x≥11.5); door to the lane)
  buildBuilding(world, sup, ox - 60, oz - 72, 18, 10, 6, { pal: CORRUG, doors: [{ side: 'E', w: 6, h: 5 }] }); // warehouse 1
  buildBuilding(world, sup, ox - 60, oz - 86, 18, 10, 6, { pal: CORRUG, doors: [{ side: 'E', w: 6, h: 5 }] }); // warehouse 2
  buildBuilding(world, sup, ox + 16, oz - 92, 9, 6, 4, { pal: RENDER, windows: true, bayW: 3, doors: [{ side: 'N', w: 2.2, h: 3 }] });      // столовая
  buildWaterTower(world, sup, ox - 66, oz - 16, 22); // NW landmark
  buildSilo(world, sup, ox - 40, oz - 80, 3, 12); buildSilo(world, sup, ox - 46, oz - 84, 3, 12); buildSilo(world, sup, ox - 36, oz - 86, 3, 12);
  const supm = new THREE.Mesh(sup.build(), voxelMaterial());
  supm.castShadow = true; supm.receiveShadow = true; world.scene.add(supm);

  // --- OBJECT 6 + 7: infrastructure + perimeter fence + misc dressing ---
  const infra = new MeshBuilder();
  buildRailSpur(world, infra, ox + 79, ox + 12, oz - 62);       // rail from the E gate (z=-62)
  buildPipeRackX(world, infra, ox + 9, ox + 26, oz - 18, 4.5);  // pipe rack: main hall ↔ ТЭЦ
  buildPipeRackX(world, infra, ox + 24, ox + 46, oz - 42, 4.5); // pipe rack: ТЭЦ ↔ cooling/fuel
  buildSubstation(world, infra, ox + 16, oz - 46);             // (16, -46)
  buildTerrikon(world, infra, ox + 96, oz + 18, 16, 14);       // slag heap OUTSIDE the fence (NE)
  buildCoolingPond(infra, ox + 6, oz - 78, 24, 16);           // settling pond (S-centre)
  buildFence(world, infra, ox + 0, oz - 46, 158, 104, [{ side: 'S', at: 0, w: 12 }, { side: 'E', at: -62, w: 8 }, { side: 'W', at: -30, w: 6 }]); // S gap widened to clear the gate pillars
  buildGate(world, infra, ox + 0, oz - 98, 8);                  // grand works gate at the main S gate
  buildMisc(world, infra, rng);
  const im = new THREE.Mesh(infra.build(), voxelMaterial());
  im.castShadow = true; im.receiveShadow = true; world.scene.add(im);

  // --- OBJECT 8: Cyrillic signage (азбука) — own textured planes ---
  buildSignage(world);
}
