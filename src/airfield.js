// airfield.js — the Soviet Cold-War military airfield (военный аэродром) district for the steppe map (NW).
// Built object-by-object via the voxel-building-modeling skill (research-first; real dims in metres;
// layered shading; correct AABB colliders; no z-fight). Research dossiers + plan:
//   docs/superpowers/plans/2026-06-03-airfield-district-build.md
// Entry: buildAirfield(world, ox, oz) — ox/oz shift the whole field (called at 0,0 → world metres).
// This module is grown incrementally: ① surface (runway/taxiway/apron/markings) + perimeter + КПП [here];
// later ② arch shelters ③ КДП tower ④ hangar ⑤ aircraft ⑥ ПВО+radar ⑦ support.
import * as THREE from 'three';
import { MeshBuilder, TAU, makeRNG, randRange, shade, voxelMaterial } from './util.js';

// ---- layered-shading palettes (Hi/Mid/Lo/Slot) ----
const CONC = { hi: 0xc8c4ba, mid: 0xa8a49a, lo: 0x86837a, slot: 0x5c594f }; // PAG airfield concrete
const MASTIC = 0x2a2520;                                                    // black bituminous joints
const WMARK = 0xe8e6dd, YMARK = 0xc9b048;                                   // white / yellow paint
const EARTH = { hi: 0x6b5440, mid: 0x54422f, lo: 0x3e3122 };
const SOD   = { hi: 0x7c8a4e, mid: 0x63713c, lo: 0x49542b };
const FENCE = { hi: 0x9a958b, mid: 0x82806f, lo: 0x5c594f };                // PO-2 concrete panel
const IRON = 0x2a2a2e, PLANK = 0x6a5230, RED = 0xc1272d, OCH = { hi: 0xe6d2a0, mid: 0xd2bd82, lo: 0xb89e60 };

// ---- helpers ----
function cyl(b, r, h, x, y, z, color, opts = {}) {
  const g = new THREE.CylinderGeometry(r, r, h, opts.seg || 12);
  b.geo(g, x, y, z, color, opts); g.dispose();
}
function collider(world, x, z, halfW, y0, y1, halfD) {
  world.boxes.push({ min: new THREE.Vector3(x - halfW, y0, z - (halfD ?? halfW)), max: new THREE.Vector3(x + halfW, y1, z + (halfD ?? halfW)) });
}
// flat ground marking (white/yellow paint), proud of the slab so it never z-fights
function mark(b, w, d, x, z, color, y = 0.15) { b.box(w, 0.04, d, x, y, z, color); }

// ---- Cyrillic / paint textures (CanvasTexture planes) ----
function signTex(text, opts = {}) {
  const W = opts.cw || 512, H = opts.ch || 128, cv = document.createElement('canvas');
  cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  if (opts.panel) { ctx.fillStyle = opts.panel; ctx.fillRect(0, 0, W, H); if (opts.border) { ctx.strokeStyle = opts.border; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8); } }
  ctx.fillStyle = opts.color || '#e8e0cc';
  ctx.font = `bold ${opts.size || 76}px "Russo One", Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2 + 4);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function signPlane(world, text, x, y, z, w, h, ry, opts = {}) {
  const tex = signTex(text, { cw: Math.max(256, Math.round(w * 52)), ch: Math.max(96, Math.round(h * 66)), ...opts });
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: !opts.panel, alphaTest: opts.panel ? 0 : 0.5, emissive: 0x0c0c0c, emissiveIntensity: 1, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 4; world.scene.add(m);
}
// big runway number/marking painted FLAT on the ground
function groundText(world, text, x, z, w, h, rot, opts = {}) {
  const tex = signTex(text, { cw: 512, ch: 512, color: '#e8e6dd', size: 300, ...opts });
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.45, emissive: 0x0a0a0a, emissiveIntensity: 1, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, 0.16, z); m.rotation.set(-Math.PI / 2, 0, rot); m.renderOrder = 5; world.scene.add(m);
}

// =====================================================================
// RUNWAY (ВПП) — ~180×40 m precast-concrete strip (PAG-14 slab grid + black mastic joints), white markings:
// centreline dashes, threshold piano-keys, runway numbers «09»/«27», aiming bars, edge lines, weathering.
// E–W axis → magnetic heading 090/270. Flat (y≈0.06) → walkable, no collider.
// =====================================================================
function buildRunway(world, b, cx, cz, L, W, rng) {
  const x0 = cx - L / 2, x1 = cx + L / 2, z0 = cz - W / 2, z1 = cz + W / 2;
  b.box(L, 0.12, W, cx, 0.06, cz, CONC.mid, { tint: 0.02 });                              // base slab
  b.box(L, 0.13, 0.6, cx, 0.065, z0 + 0.6, CONC.lo); b.box(L, 0.13, 0.6, cx, 0.065, z1 - 0.6, CONC.lo); // shoulders
  // PAG joint grid (sparse: transverse every 12 m, 3 longitudinal) — mastic
  for (let x = x0 + 12; x < x1; x += 12) b.box(0.14, 0.13, W, x, 0.125, cz, MASTIC);
  for (const dz of [-W / 3, 0, W / 3]) b.box(L, 0.13, 0.14, cx, 0.125, cz + dz, MASTIC);
  // weathering: oil/rubber patches at the two touchdown zones + centre
  for (const px of [x0 + 35, cx, x1 - 35]) for (let i = 0; i < 5; i++)
    b.box(randRange(4, 9, rng), 0.135, randRange(2, 5, rng), px + randRange(-12, 12, rng), 0.128, cz + randRange(-8, 8, rng), shade(CONC.slot, randRange(-0.03, 0.04, rng)));
  // centreline dashes (along X)
  for (let x = x0 + 10; x < x1 - 8; x += 12) mark(b, 6, 0.7, x, cz, WMARK);
  // aiming-point bars (pair, mid-field)
  for (const dz of [-5, 5]) { mark(b, 14, 2.2, cx - 30, cz + dz, WMARK); mark(b, 14, 2.2, cx + 30, cz + dz, WMARK); }
  // threshold piano-keys + runway numbers at both ends
  for (const [tx, dir, num] of [[x0, 1, '09'], [x1, -1, '27']]) {
    for (let i = -3; i <= 3; i++) if (i !== 0) mark(b, 7, 1.4, tx + dir * 7, cz + i * 4.2, WMARK);   // bars
    mark(b, 1.0, W - 2, tx + dir * 2.5, cz, WMARK);                                                  // threshold line
    groundText(world, num, tx + dir * 22, cz, 9, 12, dir > 0 ? -Math.PI / 2 : Math.PI / 2);          // big number
  }
  // edge lines
  b.box(L, 0.135, 0.3, cx, 0.128, z0 + 1.2, WMARK); b.box(L, 0.135, 0.3, cx, 0.128, z1 - 1.2, WMARK);
  // runway edge lights (low posts: white)
  for (let x = x0 + 6; x <= x1 - 6; x += 18) for (const z of [z0 - 0.6, z1 + 0.6]) { b.box(0.16, 0.6, 0.16, x, 0.3, z, IRON); b.box(0.22, 0.16, 0.22, x, 0.62, z, 0xfff0c0); }
}

// =====================================================================
// TAXIWAY (РД) + connectors + apron (стоянка). Concrete, yellow centreline + blue edge lights.
// =====================================================================
function buildTaxiways(world, b, cx, cz, runZ) {
  // parallel taxiway
  const tz = cz - 32, tx0 = cx - 70, tx1 = cx + 70, TW = 16;
  b.box(tx1 - tx0, 0.1, TW, cx, 0.055, tz, CONC.lo, { tint: 0.02 });
  for (let x = tx0 + 8; x < tx1; x += 12) b.box(0.12, 0.11, TW, x, 0.1, tz, MASTIC);
  for (let x = tx0 + 6; x < tx1 - 4; x += 10) mark(b, 5, 0.5, x, tz, YMARK, 0.12);                  // yellow centreline
  for (const z of [tz - TW / 2 - 0.4, tz + TW / 2 + 0.4]) for (let x = tx0; x <= tx1; x += 22) { b.box(0.14, 0.5, 0.14, x, 0.25, z, IRON); b.box(0.2, 0.14, 0.2, x, 0.5, z, 0x4060d0); } // blue edge
  // 2 connectors runway↔taxiway
  for (const xx of [tx0 + 6, tx1 - 6]) { b.box(TW, 0.1, runZ - 0.5 - tz, xx, 0.055, (runZ - 0.5 + tz) / 2, CONC.lo, { tint: 0.02 }); for (let z = tz; z < runZ; z += 10) mark(b, 0.5, 5, xx, z, YMARK, 0.12); }
  // apron / hardstand pad (стоянка)
  const az = cz - 56, aw = 22; b.box(120, 0.1, aw, cx, 0.05, az, CONC.lo, { tint: 0.03 });
  for (let x = cx - 58; x < cx + 58; x += 12) b.box(0.12, 0.11, aw, x, 0.1, az, MASTIC);
  for (let i = 0; i < 8; i++) b.box(randRange(5, 10), 0.11, randRange(3, 5), cx + randRange(-55, 55), 0.105, az + randRange(-8, 8), shade(CONC.slot, 0.02)); // oil
  // apron parking spot markings (yellow T)
  for (let x = cx - 50; x <= cx + 50; x += 25) { mark(b, 0.4, 8, x, az, YMARK, 0.12); mark(b, 6, 0.4, x, az - 4, YMARK, 0.12); }
}

// =====================================================================
// PERIMETER — PO-2 diamond-relief concrete panel fence (2 m) around the field, with a КПП gate gap on the S side.
// Long collidable spans (perf) + visual posts/panels. gate = {x, w} gap on the south run.
// =====================================================================
function buildPerimeter(world, b, x0, z0, x1, z1, gate) {
  const H = 2.0, T = 0.2;
  const post = (x, z) => { b.box(0.24, H + 0.35, 0.24, x, (H + 0.35) / 2, z, FENCE.lo); };
  const run = (ax, fixed, a0, a1, gap) => {
    const segs = []; if (gap) { segs.push([a0, gap.at - gap.w / 2]); segs.push([gap.at + gap.w / 2, a1]); } else segs.push([a0, a1]);
    for (const [s0, s1] of segs) {
      if (s1 - s0 < 0.5) continue;
      const mid = (s0 + s1) / 2, len = s1 - s0;
      if (ax === 'x') { world._solid(b, len, H, T, mid, H / 2, fixed, FENCE.mid, { tint: 0.04 }); b.box(len, 0.3, T + 0.06, mid, H - 0.2, fixed, FENCE.hi); b.box(len, 0.3, T + 0.06, mid, 0.25, fixed, FENCE.lo); }
      else { world._solid(b, T, H, len, fixed, H / 2, mid, FENCE.mid, { tint: 0.04 }); b.box(T + 0.06, 0.3, len, fixed, H - 0.2, mid, FENCE.hi); b.box(T + 0.06, 0.3, len, fixed, 0.25, mid, FENCE.lo); }
      for (let p = s0; p <= s1 + 0.1; p += 2.5) (ax === 'x') ? post(p, fixed) : post(fixed, p);
      // diamond-relief hint: a row of small proud lozenges
      for (let p = s0 + 1.25; p < s1; p += 2.5) (ax === 'x') ? b.box(0.7, 0.7, T + 0.05, p, H / 2, fixed, FENCE.hi, { ry: Math.PI / 4 }) : b.box(T + 0.05, 0.7, 0.7, fixed, H / 2, p, FENCE.hi, { ry: Math.PI / 4 });
    }
  };
  run('x', z0, x0, x1, gate);   // S (gate)
  run('x', z1, x0, x1);         // N
  run('z', x0, z0, z1);         // W
  run('z', x1, z0, z1);         // E
}

// =====================================================================
// КПП (контрольно-пропускной пункт) — guard house + red/white шлагбаум barrier + red star + signage.
// =====================================================================
function buildKPP(world, b, gx, gz) {
  // guard house (rendered brick, red base band, low roof) — 6×3 m
  world._solid(b, 6, 3, 3, gx - 4, 1.5, gz, OCH.mid, { tint: 0.04 });
  b.box(6.2, 0.5, 3.2, gx - 4, 0.25, gz, RED);                          // red base band
  b.box(6.6, 0.4, 3.6, gx - 4, 3.15, gz, 0x6a4a32);                     // roof
  for (const dx of [-1.6, 1.6]) { b.box(1.1, 1.2, 0.1, gx - 4 + dx, 1.7, gz - 1.5 - 0.02, 0x6a7f86); } // windows (S)
  b.box(0.1, 2.2, 1.2, gx - 1.0, 1.1, gz, 0x2d4a2a);                    // green door (E, toward the lane)
  b.box(0.6, 0.6, 0.06, gx - 4, 2.5, gz - 1.55, RED);                   // red star plate
  signPlane(world, '★', gx - 4, 2.5, gz - 1.58, 0.5, 0.5, 0, { color: '#f4ecd8', size: 110 });
  // gate pillars + шлагбаум barrier (counterweighted red/white pole) across the lane
  for (const dx of [-0.2, 5.5]) { world._solid(b, 0.5, 2.2, 0.5, gx + dx, 1.1, gz, FENCE.lo); b.box(0.62, 0.3, 0.62, gx + dx, 2.2, gz, FENCE.hi); }
  const bar = new THREE.CylinderGeometry(0.1, 0.1, 5.2, 8); b.geo(bar, gx + 2.7, 1.4, gz, WMARK, { rz: Math.PI / 2 }); bar.dispose();
  for (let i = 0; i < 5; i++) b.box(0.55, 0.13, 0.13, gx + 0.5 + i * 1.1, 1.4, gz, i % 2 ? RED : WMARK); // red/white bands
  b.box(0.5, 0.5, 0.5, gx + 0.1, 1.0, gz, IRON);                        // counterweight
  signPlane(world, 'СТОЙ! ПРЕДЪЯВИ ПРОПУСК', gx + 2.5, 2.4, gz + 0.4, 5.5, 0.7, 0, { panel: '#9a2b22', border: '#e8e0cc', color: '#f2e9d6', size: 44 });
  signPlane(world, 'В/Ч 32156', gx - 8, 2.2, gz, 3.0, 0.7, -Math.PI / 2, { panel: '#2d4a2a', border: '#c8a24a', color: '#e8e0cc', size: 56 });
}

// =====================================================================
// ЗС / АУ-13 — hardened aircraft shelter. Semicircular concrete arch (span 12.8, crown ~6.4 m) under an
// earth+grass berm (hill-like); 2-leaf olive blast doors (parted → walkable), rear 3×3 gas duct + deflector
// + soot, white shelter №. Front (doors) faces −Z (the apron). Research: АУ-13 = 12.9×28, 0.6 m concrete.
// =====================================================================
function buildArchShelter(world, b, cx, cz, num) {
  const R = 6.6, len = 26, hz0 = cz - len / 2, hz1 = cz + len / 2, N = 16, segH = (Math.PI * (R + 2) / N) * 1.1;
  // earth + grass HILL (the dominant exterior — covers the concrete arch, like a real ЗС)
  for (let i = 0; i < N; i++) {
    const a = Math.PI * (i + 0.5) / N, c = Math.cos(a), s = Math.sin(a), pal = s > 0.5 ? SOD : EARTH;   // earth flanks → grass crown
    b.box(3.4, segH, len + 0.4, cx + c * (R + 1.3), s * (R + 1.3), cz, i % 2 ? pal.mid : pal.lo, { rz: a, tint: 0.03 }); // overlapping → continuous hill
  }
  b.box(3.6, 0.5, len + 0.5, cx, R + 2.6, cz, SOD.hi, { tint: 0.06 });                                    // grass crown ridge
  b.box(R * 2 - 2, R * 1.5, len - 1.5, cx, R * 0.72, cz - 0.2, 0x16140f);                                 // dark interior cavity (seen through the mouth)
  // concrete arch-ring FACE at the front mouth (hz0) + lintel
  for (let i = 0; i < N; i++) {
    const a = Math.PI * (i + 0.5) / N, c = Math.cos(a), s = Math.sin(a);
    b.box(1.5, segH, 0.9, cx + c * R, s * R, hz0 + 0.1, i % 2 ? CONC.mid : CONC.hi, { rz: a, tint: 0.02 });
  }
  // collidable side walls + rear wall (3 m gas-duct gap on +X)
  for (const sx of [-1, 1]) collider(world, cx + sx * (R - 0.2), cz, 0.6, 0, 3.8, len / 2);
  world._solid(b, R * 2 - 4, 3.8, 0.7, cx - 1, 1.9, hz1, CONC.lo, { tint: 0.03 });
  b.box(3, 3, 1.0, cx + R - 2.2, 1.5, hz1 + 0.7, IRON); b.box(2.2, 1.1, 1.1, cx + R - 2.2, 3.9, hz1 + 0.6, shade(IRON, -0.02)); // duct + soot
  b.box(0.6, 3.8, 3.4, cx + R - 0.3, 1.9, hz1 + 1.9, CONC.lo);                                            // blast deflector
  // 2 olive blast doors (parted ~1.8 m → walk in) + colliders ; white shelter №
  for (const sx of [-1, 1]) { const dx = cx + sx * (R / 2 + 0.5);
    b.box(R - 1.1, 5.6, 0.45, dx, 2.8, hz0 - 0.35, 0x3a4a2a, { tint: 0.03 }); b.box(R - 1.3, 0.4, 0.5, dx, 5.5, hz0 - 0.35, 0x46582f);
    collider(world, dx, hz0 - 0.35, (R - 1.1) / 2, 0, 5.6, 0.3); }
  signPlane(world, num, cx - (R / 2 + 0.5), 3.3, hz0 - 0.62, 1.6, 1.6, Math.PI, { color: '#e8e6dd', size: 130 });
  b.box(R * 2 + 1, 0.07, 9, cx, 0.05, hz0 - 5.5, CONC.lo, { tint: 0.02 });                                // apron/taxi spur in front
}

// open earth+concrete revetment (капонир / обвалование) — U open toward −Z (apron)
function buildCaponier(world, b, cx, cz) {
  const W = 16, D = 24, H = 3.4;
  b.box(W, 0.08, D, cx, 0.05, cz, CONC.mid, { tint: 0.02 });                                             // concrete pad
  world._solid(b, W, H, 1.0, cx, H / 2, cz + D / 2, CONC.lo, { tint: 0.03 });                            // back wall
  b.box(W + 3, H, 3, cx, H / 2, cz + D / 2 + 1.6, EARTH.mid); b.box(W + 3, 0.4, 3, cx, H + 0.1, cz + D / 2 + 1.6, SOD.mid);
  for (const sx of [-1, 1]) {                                                                             // side walls + earth berm + grass
    world._solid(b, 1.0, H, D, cx + sx * W / 2, H / 2, cz, CONC.lo, { tint: 0.03 });
    b.box(3, H, D + 3, cx + sx * (W / 2 + 1.6), H / 2, cz, EARTH.mid); b.box(3, 0.4, D + 3, cx + sx * (W / 2 + 1.6), H + 0.1, cz, SOD.mid);
  }
}

// =====================================================================
// КДП (командно-диспетчерский пункт) — the airfield control tower + LANDMARK. ~20 m banded concrete shaft
// (red/white 3 m bands) + glazed control cab with the defining 15°-outward-tilted glazing, balcony, rotating
// beacon + whip antennas, «КДП» + red star. Research: tower-type, cab glazing 15° to vertical (anti-glare).
// =====================================================================
function buildTower(world, b, cx, cz) {
  const W = 9, baseH = 15;
  for (let i = 0; i < baseH / 3; i++) world._solid(b, W, 3, W, cx, i * 3 + 1.5, cz, i % 2 ? WMARK : RED, { tint: 0.03 }); // banded shaft (collidable)
  b.box(W + 0.7, 0.6, W + 0.7, cx, baseH + 0.1, cz, CONC.hi);                                    // cornice
  b.box(2.2, 4.4, 0.2, cx, 2.4, cz - W / 2 - 0.05, IRON);                                        // entrance door (S)
  // glazed control cab (фонарь) — 15° outward-tilted glazing
  const cy = baseH + 2.3, cw = 8, gh = 3.4, tilt = 0.26;
  b.box(cw + 0.9, 0.5, cw + 0.9, cx, baseH + 0.55, cz, CONC.lo);                                 // cab floor / balcony slab
  for (const [dz, rr] of [[cw / 2, -tilt], [-cw / 2, tilt]]) b.box(cw - 0.4, gh, 0.16, cx, cy, cz + dz, 0x9fb6bc, { rx: rr });
  for (const [dx, rr] of [[cw / 2, tilt], [-cw / 2, -tilt]]) b.box(0.16, gh, cw - 0.4, cx + dx, cy, cz, 0x9fb6bc, { rz: rr });
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.32, gh + 0.6, 0.32, cx + dx * cw / 2, cy, cz + dz * cw / 2, 0x2b2b30); // corner mullions
  b.box(cw + 1.3, 0.5, cw + 1.3, cx, cy + gh / 2 + 0.3, cz, CONC.hi);                            // cab roof
  for (const [sx, sz, ww, dd] of [[cw / 2 + 0.35, 0, 0.1, cw], [-cw / 2 - 0.35, 0, 0.1, cw], [0, cw / 2 + 0.35, cw, 0.1], [0, -cw / 2 - 0.35, cw, 0.1]]) b.box(ww, 0.7, dd, cx + sx, baseH + 1.2, cz + sz, 0x3a3a3e); // balcony rail
  cyl(b, 0.4, 0.5, cx, cy + gh / 2 + 0.85, cz, 0xd23a2a, { seg: 8 });                            // rotating beacon
  for (const [dx, dz, hh] of [[-2, -2, 3], [2, 2, 2.4], [0, 2, 3.6]]) b.box(0.1, hh, 0.1, cx + dx, cy + gh / 2 + hh / 2 + 0.4, cz + dz, 0x8a8680); // whip antennas
  collider(world, cx, cz, cw / 2 + 0.6, baseH, cy + gh / 2 + 0.6, cw / 2 + 0.6);
  signPlane(world, 'КДП', cx, baseH - 4.5, cz - W / 2 - 0.06, 4, 1.6, Math.PI, { color: '#1a1a1a', size: 110 });
  b.box(1.0, 1.0, 0.06, cx, baseH - 1.6, cz - W / 2 - 0.05, RED); signPlane(world, '★', cx, baseH - 1.6, cz - W / 2 - 0.09, 0.9, 0.9, Math.PI, { color: '#f4ecd8', size: 110 });
}

// =====================================================================
// ТЭЧ ангар — aircraft maintenance hangar. Large-span shed: concrete-panel lower + sage corrugated-steel
// upper (rusted), low gable roof, 2-leaf sliding steel doors (~20 m, parted → walkable), ribbon windows,
// overhead crane + inspection pit, «СЛАВА КПСС» facade + «АНГАР №1». Research: ~30×60, eave 9 / ridge 11.
// =====================================================================
function buildHangar(world, b, cx, cz) {
  const W = 28, D = 36, eave = 8.5, ridge = 10.5, T = 0.6;
  const ST = { hi: 0x8a9082, mid: 0x6c7266, lo: 0x4c5148 };                                // sage corrugated steel
  const sz = cz - D / 2, nz = cz + D / 2, wx = cx - W / 2, ex = cx + W / 2;
  for (const fx of [wx, ex]) {                                                              // long walls: concrete lower + steel upper + ribbon window + ribs
    const out = fx < cx ? -1 : 1;
    world._solid(b, T, 3, D, fx, 1.5, cz, CONC.mid, { tint: 0.04 });
    world._solid(b, T, eave - 3, D, fx, 3 + (eave - 3) / 2, cz, ST.mid, { tint: 0.04 });
    b.box(0.12, 1.3, D - 3, fx + out * (T / 2 + 0.05), 5.6, cz, 0x55636a);                  // ribbon window
    for (let z = -D / 2 + 3; z < D / 2; z += 3.5) b.box(0.1, eave - 3.2, 0.12, fx + out * (T / 2 + 0.06), 3 + (eave - 3) / 2, cz + z, shade(ST.lo, -0.02));
  }
  world._wall(b, cx, nz, W, 3, 0, 'x', CONC.mid, { width: 2.2, height: 2.8 });              // rear wall + personnel door
  world._solid(b, W, eave - 3, T, cx, 3 + (eave - 3) / 2, nz, ST.mid, { tint: 0.04 });
  world._wall(b, cx, sz, W, eave, 0, 'x', CONC.mid, { width: 20, height: 7.6 });            // front jambs + lintel (big opening)
  for (const sx of [-1, 1]) { const dx = cx + sx * 9;                                        // 2 sliding door leaves (parted ~4 m) + colliders
    b.box(8, 7.4, 0.4, dx, 3.7, sz - 0.4, ST.lo, { tint: 0.03 });
    for (let k = 0; k < 8; k++) b.box(8.1, 0.1, 0.45, dx, 0.6 + k * 0.95, sz - 0.4, ST.hi);
    collider(world, dx, sz - 0.4, 4, 0, 7.4, 0.3); }
  const ang = Math.atan2(ridge - eave, W / 2), sl = Math.hypot(W / 2, ridge - eave);        // low gable roof
  b.box(sl, 0.3, D + 1.2, cx - W / 4, (ridge + eave) / 2, cz, 0x8a8680, { rz: -ang, tint: 0.03 });
  b.box(sl, 0.3, D + 1.2, cx + W / 4, (ridge + eave) / 2, cz, 0x8a8680, { rz: ang, tint: 0.03 });
  b.box(0.6, 0.35, D + 1.2, cx, ridge + 0.12, cz, 0x6c6760);
  b.box(W - 2, 0.6, 1.0, cx, 7.0, cz - 4, 0xf3a505, { tint: 0.03 }); b.box(2.6, 0.9, 1.5, cx, 6.4, cz - 4, 0xf0a000); b.box(0.16, 2.2, 0.16, cx, 5.2, cz - 4, IRON); // overhead crane
  b.box(1.4, 0.1, 18, cx, 0.06, cz, 0x16140f);                                              // inspection pit
  signPlane(world, 'СЛАВА КПСС', cx, eave + 0.7, sz - 0.45, 16, 1.4, Math.PI, { panel: '#9a2b22', border: '#e8dca0', color: '#f2e9d6', size: 78, cw: 1200 });
  signPlane(world, 'АНГАР №1', cx, eave + 1.0, nz + 0.36, 6, 1.0, 0, { color: '#e8e0cc', size: 64 });
}

// =====================================================================
// ⑤ AIRCRAFT — custom voxel Soviet jets parked on the apron / in shelters. Nose faces −Z.
// MiG-21bis «Fishbed»: cropped-delta, nose shock-cone intake, tall fin + ventral fin, green/blue camo, red ★ + bort.
// Research: L 14.1, span 7.15, height 4.1, fuselage Ø1.24.
// =====================================================================
function buildMiG21(world, b, cx, cz, bort) {
  const GRN = { hi: 0x4a5c30, mid: 0x3c4d26, lo: 0x2e3a1c }, BLU = 0x8aabb8, GRY = 0x45454b, IRX = 0x2a2a2e, gy = 1.45;
  cyl(b, 0.58, 9.4, cx, gy, cz + 0.7, GRN.mid, { rx: Math.PI / 2, seg: 12, tint: 0.03 });               // fuselage tube
  cyl(b, 0.5, 3.2, cx, gy, cz + 5.6, GRN.lo, { rx: Math.PI / 2, seg: 12 });                             // rear taper
  cyl(b, 0.46, 0.5, cx, gy, cz + 7.25, IRX, { rx: Math.PI / 2, seg: 12 });                              // exhaust nozzle
  { const g = new THREE.CylinderGeometry(0.46, 0.52, 1.2, 12); b.geo(g, cx, gy, cz - 4.8, GRY, { rx: Math.PI / 2 }); g.dispose(); }      // intake lip
  { const g = new THREE.CylinderGeometry(0.03, 0.32, 1.9, 12); b.geo(g, cx, gy, cz - 5.7, GRY, { rx: -Math.PI / 2 }); g.dispose(); }     // nose shock-cone (point −Z)
  b.box(0.72, 0.5, 1.9, cx, gy + 0.55, cz - 2.6, 0x222e34); b.box(0.6, 0.42, 1.6, cx, gy + 0.62, cz - 2.6, 0x3a5560); // canopy
  b.box(0.4, 0.45, 6, cx, gy + 0.5, cz + 1.6, GRN.mid, { tint: 0.02 });                                 // dorsal spine
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {                                                // cropped-delta wing (stepped)
    const chord = 4.2 - i * 0.85, span = 0.85, wx = cx + sx * (0.55 + i * 0.85 + span / 2), wz = cz + 1.5 + i * 0.55;
    b.box(span, 0.16, chord, wx, gy - 0.34, wz, i % 2 ? GRN.mid : GRN.hi, { tint: 0.02 });
    b.box(span, 0.08, chord * 0.95, wx, gy - 0.44, wz, BLU);
  }
  for (const sx of [-1, 1]) b.box(1.7, 0.13, 1.5, cx + sx * 1.25, gy - 0.05, cz + 6.0, GRN.mid);         // stabilators
  b.box(0.2, 2.5, 2.9, cx, gy + 1.45, cz + 5.5, GRN.mid, { tint: 0.02 }); b.box(0.22, 0.5, 1.5, cx, gy + 2.6, cz + 6.1, GRN.hi); // fin + tip
  b.box(0.14, 1.0, 1.4, cx, gy - 0.95, cz + 6.3, GRN.lo);                                                // ventral fin
  for (const [lx, lz] of [[0, -3], [1.25, 1.6], [-1.25, 1.6]]) { b.box(0.12, gy, 0.12, cx + lx, gy / 2, cz + lz, IRX); cyl(b, 0.28, 0.2, cx + lx, 0.28, cz + lz, IRX, { rx: Math.PI / 2, seg: 8 }); }
  for (const sx of [-1, 1]) signPlane(world, '★', cx + sx * 0.6, gy + 0.05, cz + 3.4, 0.7, 0.7, sx > 0 ? Math.PI / 2 : -Math.PI / 2, { color: '#d22', size: 100 }); // fuselage stars
  signPlane(world, '★', cx + 0.12, gy + 1.7, cz + 5.5, 0.6, 0.6, Math.PI / 2, { color: '#d22', size: 100 });                              // fin star
  for (const sx of [-1, 1]) signPlane(world, bort, cx + sx * 0.61, gy + 0.15, cz - 1.0, 1.0, 0.7, sx > 0 ? Math.PI / 2 : -Math.PI / 2, { color: '#e03020', size: 90 }); // bort №
  collider(world, cx, cz + 1, 3.4, 0, 2.4, 7);
}

// =====================================================================
// Entry — assemble the airfield surface + perimeter (structures added in later passes).
// =====================================================================
export function buildAirfield(world, ox, oz) {
  const rng = makeRNG(0xA17F);
  const b = new MeshBuilder();
  const RUNX = ox - 130, RUNZ = oz + 160, RUNL = 180, RUNW = 40;          // runway centre + size

  buildRunway(world, b, RUNX, RUNZ, RUNL, RUNW, rng);
  buildTaxiways(world, b, RUNX, RUNZ, RUNZ - RUNW / 2);
  buildPerimeter(world, b, ox - 235, oz + 85, ox - 35, oz + 195, { at: ox - 135, w: 9 }); // КПП gap on S
  buildKPP(world, b, ox - 139, oz + 85);

  // ② arch shelters (ЗС/АУ-13) dispersed in a row N of the apron, doors facing −Z; + a caponier
  [-185, -143, -101, -59].forEach((sx, i) => buildArchShelter(world, b, ox + sx, oz + 114, '2' + (i + 1)));
  buildCaponier(world, b, ox - 52, oz + 114);

  // ③ КДП control tower (landmark) — apron side, midfield ; ④ ТЭЧ hangar — W side
  buildTower(world, b, ox - 112, oz + 91);
  buildHangar(world, b, ox - 210, oz + 104);

  // ⑤ aircraft — MiG-21bis parked on the apron + one in a shelter
  buildMiG21(world, b, ox - 152, oz + 102, '12');
  buildMiG21(world, b, ox - 88, oz + 102, '07');
  buildMiG21(world, b, ox - 59, oz + 112, '15');

  const m = new THREE.Mesh(b.build(), voxelMaterial()); m.castShadow = true; m.receiveShadow = true; world.scene.add(m);
}
