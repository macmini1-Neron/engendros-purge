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
// real extruded 5-point Soviet star (the font ★ glyph reads cocked / wrong-proportioned) — points up,
// flat in XY extruding +Z; aim at a wall face with opts.ry (π → faces −Z). Same recipe as industrial.js HQ.
function star3D(b, x, y, z, size, color, opts = {}) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rad = (i % 2 ? 0.40 : 1) * size, px = Math.cos(a) * rad, py = Math.sin(a) * rad; i ? sh.lineTo(px, py) : sh.moveTo(px, py); }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: opts.depth || 0.16, bevelEnabled: false });
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
  star3D(b, gx - 4, 2.55, gz - 1.55, 0.4, RED, { ry: Math.PI, depth: 0.09 }); // proper 3-D red star on the gable
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

// MiG-23MLD «Flogger»: variable-geometry (parked 45°), fixed glove fairings, side intakes, single tall fin +
// ventral, pointed solid radome, light-grey interceptor, red ★ + blue bort. Research: L 16.7, span 13.97/7.78.
function buildMiG23(world, b, cx, cz, bort) {
  const GRY = { hi: 0xc6c4be, mid: 0xb0aea6, lo: 0x94928a }, DRK = 0x46464a, RAD = 0x42424a, IRX = 0x2a2a2e, gy = 1.6;
  cyl(b, 0.6, 11, cx, gy, cz + 1, GRY.mid, { rx: Math.PI / 2, seg: 12, tint: 0.03 });
  cyl(b, 0.52, 3.4, cx, gy, cz + 6.5, GRY.lo, { rx: Math.PI / 2, seg: 12 }); cyl(b, 0.5, 0.5, cx, gy, cz + 8.4, IRX, { rx: Math.PI / 2, seg: 12 });
  { const g = new THREE.CylinderGeometry(0.06, 0.55, 3.2, 12); b.geo(g, cx, gy, cz - 5.0, RAD, { rx: -Math.PI / 2 }); g.dispose(); } // radome
  b.box(0.78, 0.55, 2.0, cx, gy + 0.62, cz - 2.2, 0x222e34); b.box(0.66, 0.46, 1.7, cx, gy + 0.7, cz - 2.2, 0x3a5560); // canopy
  for (const sx of [-1, 1]) { b.box(0.72, 0.95, 3.0, cx + sx * 0.85, gy + 0.1, cz - 0.2, GRY.lo, { tint: 0.02 }); b.box(0.16, 0.9, 2.9, cx + sx * 1.22, gy + 0.1, cz - 0.2, DRK); } // side intakes
  for (const sx of [-1, 1]) {                                                                            // glove + 45°-swept wing
    b.box(1.2, 0.2, 2.6, cx + sx * 1.0, gy - 0.08, cz + 1.0, GRY.mid);
    b.box(4.4, 0.16, 1.6, cx + sx * 3.5, gy - 0.14, cz + 2.7, GRY.mid, { ry: sx * 0.78, tint: 0.02 });
    b.box(4.4, 0.08, 1.5, cx + sx * 3.5, gy - 0.23, cz + 2.7, GRY.hi, { ry: sx * 0.78 });
  }
  for (const sx of [-1, 1]) b.box(2.2, 0.14, 1.5, cx + sx * 1.6, gy + 0.05, cz + 6.8, GRY.mid, { ry: sx * 0.5 }); // stabilators
  b.box(0.22, 2.9, 3.0, cx, gy + 1.6, cz + 6.2, GRY.mid, { tint: 0.02 }); b.box(0.24, 0.5, 1.6, cx, gy + 3.0, cz + 7.0, GRY.hi); // fin
  b.box(0.14, 1.1, 1.5, cx, gy - 1.0, cz + 7.0, GRY.lo);                                                 // ventral fin
  for (const [lx, lz] of [[0, -3.2], [1.0, 2.0], [-1.0, 2.0]]) { b.box(0.12, gy, 0.12, cx + lx, gy / 2, cz + lz, IRX); cyl(b, 0.3, 0.2, cx + lx, 0.3, cz + lz, IRX, { rx: Math.PI / 2, seg: 8 }); }
  for (const sx of [-1, 1]) signPlane(world, '★', cx + sx * 0.62, gy + 0.1, cz + 4.0, 0.7, 0.7, sx > 0 ? Math.PI / 2 : -Math.PI / 2, { color: '#d22', size: 100 });
  signPlane(world, '★', cx + 0.13, gy + 1.9, cz + 6.2, 0.6, 0.6, Math.PI / 2, { color: '#d22', size: 100 });
  for (const sx of [-1, 1]) signPlane(world, bort, cx + sx * 0.63, gy + 0.2, cz - 1.0, 1.0, 0.7, sx > 0 ? Math.PI / 2 : -Math.PI / 2, { color: '#3050c0', size: 90 });
  collider(world, cx, cz + 1.5, 4.4, 0, 2.6, 8);
}

// Su-25 «Грач»: straight high-aspect wing, twin rear side nacelles, bubble canopy forward, green/brown camo.
// Research: L 15.5, span 14.36, height 4.8.
function buildSu25(world, b, cx, cz, bort) {
  const GRN = { hi: 0x4a5530, mid: 0x3a4424, lo: 0x2c3419 }, BRN = 0x5a4a2e, BLU = 0x8aabb8, RAD = 0xcfccbe, IRX = 0x2a2a2e, gy = 1.7;
  cyl(b, 0.72, 10, cx, gy, cz + 1, GRN.mid, { rx: Math.PI / 2, seg: 12, tint: 0.03 });
  { const g = new THREE.CylinderGeometry(0.2, 0.62, 3.0, 12); b.geo(g, cx, gy, cz - 4.8, RAD, { rx: -Math.PI / 2 }); g.dispose(); } // blunt nose
  b.box(0.88, 0.62, 1.7, cx, gy + 0.72, cz - 2.6, 0x222e34); b.box(0.74, 0.5, 1.4, cx, gy + 0.8, cz - 2.6, 0x3a5560); // bubble canopy
  for (const sx of [-1, 1]) {                                                                            // straight wing (slight sweep) + tip pod + pylons
    b.box(6.4, 0.18, 2.2, cx + sx * 3.9, gy + 0.32, cz + 1.5, sx > 0 ? GRN.mid : GRN.hi, { ry: sx * 0.2, tint: 0.02 });
    b.box(6.4, 0.08, 2.1, cx + sx * 3.9, gy + 0.23, cz + 1.5, BLU, { ry: sx * 0.2 });
    b.box(0.3, 0.5, 1.7, cx + sx * 7.0, gy + 0.32, cz + 2.0, IRX, { ry: sx * 0.2 });
    for (let p = 0; p < 2; p++) b.box(0.42, 0.5, 1.7, cx + sx * (2.6 + p * 1.7), gy - 0.05, cz + 1.5, IRX);
  }
  for (const sx of [-1, 1]) { cyl(b, 0.42, 4.0, cx + sx * 0.78, gy, cz + 4.6, GRN.lo, { rx: Math.PI / 2, seg: 10 }); cyl(b, 0.38, 0.5, cx + sx * 0.78, gy, cz + 6.7, IRX, { rx: Math.PI / 2, seg: 10 }); } // twin nacelles
  b.box(0.2, 2.4, 2.4, cx, gy + 1.5, cz + 5.8, GRN.mid, { tint: 0.02 }); b.box(0.22, 0.4, 1.3, cx, gy + 2.6, cz + 6.4, GRN.hi); // fin
  for (const sx of [-1, 1]) b.box(2.0, 0.14, 1.4, cx + sx * 1.4, gy + 0.5, cz + 6.0, GRN.mid);           // stabilizers
  for (const [lx, lz] of [[0, -3], [1.3, 2.2], [-1.3, 2.2]]) { b.box(0.14, gy, 0.14, cx + lx, gy / 2, cz + lz, IRX); cyl(b, 0.32, 0.22, cx + lx, 0.32, cz + lz, IRX, { rx: Math.PI / 2, seg: 8 }); }
  for (let i = 0; i < 4; i++) b.box(1.4, 0.05, 1.8, cx + (i - 1.5) * 1.1, gy + 0.74, cz + (i % 2 ? 2 : 5), BRN); // brown camo patches
  for (const sx of [-1, 1]) signPlane(world, '★', cx + sx * 0.74, gy + 0.1, cz + 3.4, 0.7, 0.7, sx > 0 ? Math.PI / 2 : -Math.PI / 2, { color: '#d22', size: 100 });
  signPlane(world, '★', cx + 0.13, gy + 1.7, cz + 5.8, 0.6, 0.6, Math.PI / 2, { color: '#d22', size: 100 });
  for (const sx of [-1, 1]) signPlane(world, bort, cx + sx * 0.6, gy + 0.2, cz - 3.2, 1.0, 0.7, sx > 0 ? Math.PI / 2 : -Math.PI / 2, { color: '#e03020', size: 90 });
  collider(world, cx, cz + 1.5, 7.4, 0, 2.6, 7);
}

// =====================================================================
// ⑥ ПВО (air defense) — С-75 «Двина» SAM site («цветок»: 6 launchers in a hexagon + central Fan-Song radar),
// ЗСУ-23-4 «Шилка» SPAAG, П-18 «Терек» radar (Yagi billboard), ЗУ-23-2 towed twin AA. All 4БО green.
// =====================================================================
const G4BO = { hi: 0x6a7a42, mid: 0x55632e, lo: 0x3e4a1f };               // защитный 4БО

function buildSAMLauncher(world, b, lx, lz, phi) {                        // СМ-90 open-rail launcher + V-750 «Двина» missile, ~28° elevation
  const M = G4BO, IRX = 0x2a2a2e, NOSE = 0xcdc8ba, by = 1.25;
  cyl(b, 1.5, 0.4, lx, 0.2, lz, IRX, { seg: 14 }); cyl(b, 0.85, 1.0, lx, 0.8, lz, M.lo, { seg: 10, tint: 0.03 }); // turntable ring + pivot
  const el = 0.49, ce = Math.cos(el), ax = Math.sin(phi) * ce, ay = Math.sin(el), az = Math.cos(phi) * ce;
  const A = (t, r) => [lx + ax * t + Math.cos(phi) * r, by + ay * t, lz + az * t - Math.sin(phi) * r]; // t = along missile axis, r = sideways
  for (const r of [-0.28, 0.28]) for (let t = 0.2; t < 8.6; t += 0.7) { const [px, py, pz] = A(t, r); b.box(0.13, 0.13, 0.6, px, py - 0.5, pz, IRX, { ry: phi }); } // twin I-beam rail
  for (let t = 1; t < 8; t += 1.6) { const [px, py, pz] = A(t, 0); b.box(0.75, 0.1, 0.18, px, py - 0.5, pz, IRX, { ry: phi }); }                            // cross-ties
  for (let t = 0.5; t < 2.5; t += 0.4) { const [px, py, pz] = A(t, 0); b.box(0.72, 0.5, 0.72, px, py, pz, M.lo, { ry: phi, tint: 0.02 }); }                  // booster (fat Ø)
  { const [px, py, pz] = A(2.6, 0); b.box(0.66, 0.5, 0.66, px, py, pz, M.mid, { ry: phi }); }                                                                // interstage frustum
  for (let t = 2.9; t < 9.4; t += 0.42) { const [px, py, pz] = A(t, 0); b.box(0.5, 0.45, 0.5, px, py, pz, t < 6 ? M.mid : M.hi, { ry: phi, tint: 0.02 }); }  // sustainer (slim Ø)
  { const [px, py, pz] = A(9.7, 0); b.box(0.34, 0.45, 0.34, px, py, pz, NOSE, { ry: phi }); const [qx, qy, qz] = A(10.05, 0); b.box(0.16, 0.4, 0.16, qx, qy, qz, NOSE, { ry: phi }); } // ogive nose
  for (let k = 0; k < 4; k++) { const fa = phi + k * Math.PI / 2; const [px, py, pz] = A(1.5, 0); b.box(1.1, 0.1, 1.0, px + Math.cos(fa) * 0.9, py, pz + Math.sin(fa) * 0.9, M.lo, { ry: fa, tint: 0.02 }); } // 4 BIG booster delta fins
  for (let k = 0; k < 4; k++) { const fa = phi + Math.PI / 4 + k * Math.PI / 2; const [px, py, pz] = A(3.1, 0); b.box(0.7, 0.08, 0.55, px + Math.cos(fa) * 0.5, py, pz + Math.sin(fa) * 0.5, M.mid, { ry: fa }); } // 4 smaller sustainer fins
  collider(world, lx, lz, 1.6, 0, 1.5);
}
function buildFanSong(world, b, cx, cz) {                                 // СНР-75 «Fan Song» — TWO perpendicular trough antennas forming a +
  const M = G4BO, A = 0x8d8a80, RIB = 0x66635c, IRX = 0x2a2a2e;
  world._solid(b, 3.4, 2.2, 5.5, cx, 1.1, cz, M.mid, { tint: 0.03 });     // operator van
  cyl(b, 0.9, 1.4, cx, 2.5, cz, IRX, { seg: 12 });                        // rotating pedestal
  b.box(6.8, 1.6, 0.45, cx, 4.3, cz - 0.3, A, { tint: 0.02 });            // horizontal trough (elevation scan) — wide bar
  for (let i = -3; i <= 3; i++) b.box(0.12, 1.6, 0.5, cx + i * 0.98, 4.3, cz - 0.33, RIB);
  b.box(1.6, 6.8, 0.45, cx, 4.5, cz - 0.3, A, { tint: 0.02 });            // vertical trough (azimuth scan) — tall bar, crossing the first
  for (let i = -3; i <= 3; i++) b.box(1.6, 0.12, 0.5, cx, 4.5 + i * 0.98, cz - 0.33, RIB);
  cyl(b, 0.55, 0.22, cx + 3.4, 4.3, cz - 0.3, A, { rx: -Math.PI / 2, seg: 12 });  // LORO dish (H bar tip)
  cyl(b, 0.55, 0.22, cx, 7.9, cz - 0.3, A, { rx: -Math.PI / 2, seg: 12 });        // LORO dish (V bar tip)
  collider(world, cx, cz, 1.8, 0, 2.2, 2.9);
}
function buildSAMSite(world, b, cx, cz) {
  buildFanSong(world, b, cx, cz);
  const R = 22;
  for (let k = 0; k < 6; k++) { const phi = k * Math.PI / 3, lx = cx + Math.sin(phi) * R, lz = cz + Math.cos(phi) * R;
    b.box(3.5, 0.06, R - 4, cx + Math.sin(phi) * R / 2, 0.05, cz + Math.cos(phi) * R / 2, CONC.lo, { ry: phi }); // petal road
    for (let a = 0; a < 8; a++) { const ra = a * Math.PI / 4; b.box(2.6, 1.5, 2.6, lx + Math.cos(ra) * 4.2, 0.75, lz + Math.sin(ra) * 4.2, a % 2 ? EARTH.mid : EARTH.lo, { ry: ra, tint: 0.03 }); b.box(2.4, 0.3, 2.4, lx + Math.cos(ra) * 4.2, 1.5, lz + Math.sin(ra) * 4.2, SOD.mid); } // revetment berm + grass
    buildSAMLauncher(world, b, lx, lz, phi);
  }
}
function buildShilka(world, b, cx, cz, ry = 0) {                          // ЗСУ-23-4 «Шилка» — squat box turret, 2×2 water-jacketed barrels, Gun-Dish at rear
  const c = Math.cos(ry), s = Math.sin(ry), P = (dx, dz) => [cx + dx * c - dz * s, cz + dx * s + dz * c];
  const IRX = 0x2a2a2e, TRK = 0x23231f, WHL = 0x18181a, GUN = 0x36363c, DISH = 0x9a958b;
  world._solid(b, 3.1, 1.25, 6.5, cx, 0.95, cz, G4BO.mid, { tint: 0.03, ry });                 // hull
  { const [x, z] = P(0, -2.9); b.box(3.0, 0.7, 1.4, x, 1.2, z, G4BO.lo, { ry, tint: 0.02 }); }  // sloped glacis (front −Z)
  for (const sx of [-1, 1]) {                                                                    // tracks (flat top, no return rollers) + 6 road wheels
    const [tx, tz] = P(sx * 1.5, 0); b.box(0.5, 0.8, 6.6, tx, 0.42, tz, TRK, { ry });
    for (let i = 0; i < 6; i++) { const [wx, wz] = P(sx * 1.5, -2.5 + i * 1.0); cyl(b, 0.4, 0.16, wx, 0.42, wz, WHL, { rx: Math.PI / 2, ry, seg: 10 }); }
  }
  { const [x, z] = P(0, -0.2); world._solid(b, 2.7, 0.9, 2.4, x, 1.92, z, G4BO.lo, { tint: 0.03, ry }); } // squat box turret
  { const [x, z] = P(0, -1.45); b.box(2.4, 0.72, 0.7, x, 1.95, z, G4BO.mid, { ry, tint: 0.03 }); }        // sloped front / mantlet
  for (const ox of [-0.3, 0.3]) for (const oy of [-0.26, 0.26]) {                               // 2×2 water-jacketed AZP-23 barrels
    const [x, z] = P(ox, -3.3); cyl(b, 0.13, 3.0, x, 2.0 + oy, z, GUN, { rx: Math.PI / 2, ry, seg: 8 });
    const [mx, mz] = P(ox, -4.95); cyl(b, 0.075, 1.0, mx, 2.0 + oy, mz, IRX, { rx: Math.PI / 2, ry, seg: 6 });
  }
  { const [a1x, a1z] = P(-0.4, 1.05), [a2x, a2z] = P(0.4, 1.05); b.box(0.16, 1.0, 0.16, a1x, 2.85, a1z, IRX, { ry }); b.box(0.16, 1.0, 0.16, a2x, 2.85, a2z, IRX, { ry }); } // dish arms
  { const [x, z] = P(0, 1.25); cyl(b, 0.8, 0.22, x, 3.45, z, DISH, { rx: -0.55, ry, seg: 14, tint: 0.03 }); b.box(0.5, 0.5, 0.22, x, 3.4, z, 0x6a6760, { ry }); } // RPK-2 «Gun Dish» (rear, deployed up)
  collider(world, cx, cz, 1.7, 0, 3.0, 3.3);
}
function buildRadarP18(world, b, cx, cz) {                                // П-18 «Spoon Rest» — flat 16-Yagi billboard (wider than tall, ~3:1), static cabin (no truck)
  const IRX = 0x2a2a2e, ROD = 0x9a958b, M = G4BO, HW = 6, FY = 7;
  world._solid(b, 3.2, 2.2, 4, cx, 1.1, cz, M.mid, { tint: 0.03 });                             // electronics cabin
  cyl(b, 0.7, 3.6, cx, 3.4, cz, IRX, { seg: 10 });                                              // rotating mast
  b.box(0.18, 4.2, 0.18, cx - HW, FY, cz, IRX); b.box(0.18, 4.2, 0.18, cx + HW, FY, cz, IRX);   // frame sides
  b.box(2 * HW + 0.2, 0.18, 0.18, cx, FY + 2, cz, IRX); b.box(2 * HW + 0.2, 0.18, 0.18, cx, FY - 2, cz, IRX); // frame top/bottom
  for (const row of [FY - 1, FY + 1]) for (let i = 0; i < 8; i++) { const x = cx - HW + 0.75 + i * 1.5;       // 16 Yagi = 2 rows × 8 (horizontal comb)
    b.box(0.09, 0.09, 1.7, x, row, cz + 0.95, ROD);
    for (const e of [0.2, 0.55, 0.9, 1.25]) b.box(1.0 - e * 0.45, 0.07, 0.07, x, row, cz + 0.3 + e, ROD); }
  collider(world, cx, cz, 1.7, 0, FY + 2, 2);
}
function buildZU23(world, b, cx, cz, ry = 0) {                            // ЗУ-23-2 — signature perpendicular side ammo boxes + muzzle suppressors, deployed on jacks
  const c = Math.cos(ry), s = Math.sin(ry), P = (dx, dz) => [cx + dx * c - dz * s, cz + dx * s + dz * c];
  const IRX = 0x2a2a2e, M = G4BO;
  b.box(2.4, 0.28, 2.4, cx, 0.32, cz, M.mid, { ry, tint: 0.03 });                               // low platform
  for (const [jx, jz] of [[0, -1.1], [-1.05, 1.0], [1.05, 1.0]]) { const [x, z] = P(jx, jz); b.box(0.28, 0.5, 0.28, x, 0.25, z, IRX, { ry }); } // 3 leveling jacks (deployed)
  for (const sx of [-1, 1]) { const [x, z] = P(sx * 1.25, 0.35); cyl(b, 0.45, 0.22, x, 0.95, z, IRX, { rx: Math.PI / 2, ry, seg: 10 }); }       // wheels raised (folded up)
  b.box(0.8, 0.7, 0.8, cx, 0.85, cz, M.lo, { ry });                                             // pivot/yoke
  for (const ox of [-0.28, 0.28]) { const [x, z] = P(ox, -1.5); cyl(b, 0.085, 2.4, x, 1.2, z, IRX, { rx: Math.PI / 2, ry, seg: 6 });           // twin barrels (wide)
    const [mx, mz] = P(ox, -2.85); cyl(b, 0.16, 0.55, mx, 1.2, mz, 0x3a3a40, { rx: Math.PI / 2, ry, seg: 8 }); }                               // muzzle suppressors
  for (const sx of [-1, 1]) { const [x, z] = P(sx * 1.15, 0.25); b.box(0.9, 0.55, 0.6, x, 1.25, z, M.mid, { ry, tint: 0.02 }); }                // SIGNATURE side ammo boxes (perpendicular)
  { const [x, z] = P(0, -0.55); b.box(1.5, 0.85, 0.1, x, 1.4, z, M.lo, { ry }); }                                                              // trapezoidal gun shield
  collider(world, cx, cz, 1.6, 0, 1.6);
}

// =====================================================================
// ⑦ SUPPORT INFRASTRUCTURE — fuel farm ГСМ (РВС tanks + bund + ТЗ-22 bowser), ammo bunkers (earth-covered,
// ОПАСНО), barracks/штаб (ochre, СЛАВА СОВЕТСКОЙ АРМИИ + flag), windsock, fire station (+АЦ-40), watchtowers,
// floodlight masts. Makes the base read as actually operable.
// =====================================================================
const SILV = { hi: 0xccd0d4, mid: 0xb8bcc0, lo: 0x8c9094 };               // bare steel tank/skin

function buildFuelFarm(world, b, cx, cz) {                                // ГСМ — vertical РВС tanks inside an earth bund
  for (let s = -1; s <= 1; s += 2) { b.box(20, 1.4, 2.2, cx, 0.7, cz + s * 9, EARTH.mid, { tint: 0.03 }); b.box(2.2, 1.4, 20, cx + s * 10, 0.7, cz, EARTH.mid, { tint: 0.03 }); }
  for (let s = -1; s <= 1; s += 2) { b.box(20, 0.22, 2.2, cx, 1.45, cz + s * 9, SOD.mid); b.box(2.2, 0.22, 20, cx + s * 10, 1.45, cz, SOD.mid); }
  for (const [dx, dz] of [[-6, -5], [-6, 5], [6, -5], [6, 5]]) {          // 4 РВС tanks Ø6.4 h6
    const x = cx + dx, z = cz + dz;
    cyl(b, 3.2, 6, x, 3, z, SILV.mid, { seg: 16, tint: 0.05 });
    cyl(b, 3.26, 0.6, x, 4.3, z, YMARK, { seg: 16 });                     // yellow hazard band
    cyl(b, 3.3, 0.35, x, 6.05, z, SILV.hi, { seg: 16 }); b.box(6.5, 0.28, 0.3, x, 6.15, z, SILV.lo);
    collider(world, x, z, 3.35, 0, 6.2);
  }
  world._solid(b, 4, 3, 4.5, cx, 1.5, cz - 14, CONC.mid, { tint: 0.03 }); // pump house
  b.box(4.3, 0.4, 4.8, cx, 3.2, cz - 14, CONC.lo);
  signPlane(world, 'ГСМ', cx - 10.1, 3, cz, 4.5, 2.2, -Math.PI / 2, { panel: '#3a4a2a', border: '#c9b048', color: '#e8e0cc' });
  signPlane(world, 'ОГНЕОПАСНО', cx, 2.3, cz - 9.2, 8, 1.5, 0, { panel: '#7a1a1a', color: '#f0e0d0', size: 50 });
}
function buildAmmoBunker(world, b, cx, cz, num) {                         // earth-covered concrete magazine (front faces +Z)
  const OLIVE = 0x3a4a2a;
  world._solid(b, 12, 4, 7, cx, 2, cz, CONC.lo, { tint: 0.03 });         // concrete core
  for (let i = 0; i < 5; i++) b.box(12 - i * 1.7, 0.85, 7 - i * 1.05, cx, 4.2 + i * 0.7, cz, i % 2 ? EARTH.mid : EARTH.lo, { tint: 0.03 }); // earth mound
  b.box(9.5, 0.28, 5, cx, 7.7, cz, SOD.mid);                             // grass cap
  b.box(12.4, 4, 0.6, cx, 2, cz + 3.5, CONC.mid, { tint: 0.03 });        // headwall
  for (const s of [-1, 1]) b.box(2.5, 3.1, 0.4, cx + s * 1.5, 1.65, cz + 3.85, OLIVE, { tint: 0.04 }); // 2-leaf blast door
  b.box(0.3, 3.1, 0.5, cx, 1.65, cz + 3.86, CONC.slot);
  for (const vx of [-3.5, 3.5]) cyl(b, 0.3, 1.3, cx + vx, 8.3, cz, IRON, { seg: 8 }); // vent stacks
  signPlane(world, 'ОПАСНО', cx, 3.5, cz + 3.95, 4.4, 1.2, 0, { panel: '#7a1a1a', color: '#f0e0d0', size: 54 });
  signPlane(world, '№' + num, cx, 1.5, cz + 3.95, 1.3, 1.0, 0, { color: '#e8e0cc', size: 64 });
  collider(world, cx, cz, 6.2, 0, 8, 3.9);
}
function buildBarracks(world, b, cx, cz) {                                // штаб / казарма — 2-storey ochre render, front +Z
  world._solid(b, 18, 7, 10, cx, 3.5, cz, OCH.mid, { tint: 0.03 });
  b.box(18.4, 1.1, 10.4, cx, 0.55, cz, CONC.lo, { tint: 0.03 });         // plinth
  b.box(18.5, 0.5, 10.5, cx, 7.05, cz, OCH.lo); b.box(18.7, 0.5, 10.7, cx, 7.5, cz, CONC.mid); // cornice + roof
  for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) { const wx = cx - 7 + c * 2.8, wy = 2.5 + r * 2.8;
    b.box(1.5, 1.9, 0.22, wx, wy, cz - 5.04, OCH.hi); b.box(1.15, 1.55, 0.14, wx, wy, cz - 5.12, 0x2a3340); } // windows face S (gate)
  world._solid(b, 4, 3, 2.2, cx, 1.5, cz - 6, OCH.lo, { tint: 0.03 });   // porch
  b.box(2.2, 2.5, 0.3, cx, 1.35, cz - 7.15, 0x3a2e1f);                   // door
  star3D(b, cx, 5.7, cz - 5.0, 0.95, RED, { ry: Math.PI, depth: 0.18 }); // proper 3-D red star
  signPlane(world, 'СЛАВА СОВЕТСКОЙ АРМИИ!', cx, 8.6, cz - 4.8, 16, 1.5, Math.PI, { panel: '#8a1f1f', border: '#e8d8a0', color: '#f0e8d0', size: 56 });
  cyl(b, 0.18, 11, cx - 10.5, 5.5, cz - 1, SILV.hi, { seg: 8 });         // flagpole
  b.box(0.12, 1.9, 3, cx - 10.0, 9.6, cz - 1, RED);                      // Soviet flag (red)
  b.box(0.13, 0.7, 0.7, cx - 9.7, 9.95, cz - 2.0, YMARK);               // hammer & sickle hint
  collider(world, cx, cz, 9.2, 0, 7.5, 5.2);
}
function buildWindsock(world, b, cx, cz) {                               // ветроуказатель — orange/white cone on a mast
  cyl(b, 0.22, 6, cx, 3, cz, SILV.lo, { seg: 8 });
  cyl(b, 0.45, 0.3, cx, 6, cz, IRON, { seg: 10 });
  for (let i = 0; i < 5; i++) cyl(b, 0.72 - i * 0.11, 0.95, cx + 0.8 + i * 0.95, 6, cz, i % 2 ? 0xd86a1e : 0xe8e0d0, { rz: Math.PI / 2, seg: 12 });
  collider(world, cx, cz, 0.5, 0, 6.3);
}
function buildFireStation(world, b, cx, cz) {                            // пожарное депо — red, apparatus bay door (front +Z)
  const FR = { hi: 0xc0402e, mid: 0xa3301f, lo: 0x7e2416 };
  world._solid(b, 12, 5, 8, cx, 2.5, cz, FR.mid, { tint: 0.03 });
  b.box(12.4, 0.6, 8.4, cx, 5.2, cz, FR.lo); b.box(12.6, 0.4, 8.6, cx, 5.5, cz, CONC.mid);
  b.box(5, 4, 0.3, cx - 2.5, 2, cz - 4.05, 0xd8d0c0); for (let y = 0.6; y < 4; y += 0.6) b.box(5, 0.1, 0.35, cx - 2.5, y, cz - 4.12, 0xaaa294); // roller door faces S
  b.box(1.5, 2.4, 0.3, cx + 4, 1.3, cz - 4.05, 0x3a2e1f);
  signPlane(world, 'ПОЖАРНОЕ ДЕПО', cx, 5.0, cz - 4.0, 8, 1.0, Math.PI, { color: '#f0e8d0', size: 48 });
  collider(world, cx, cz, 6.2, 0, 5.5, 4.2);
}
function buildWatchtower(world, b, cx, cz) {                             // вышка охраны — 4-leg timber tower + cabin
  const H = 6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.box(0.3, H, 0.3, cx + sx * 1.2, H / 2, cz + sz * 1.2, PLANK, { tint: 0.04 }); }
  for (const sz of [-1, 1]) b.box(2.7, 0.2, 0.2, cx, 3, cz + sz * 1.2, PLANK); for (const sx of [-1, 1]) b.box(0.2, 0.2, 2.7, cx + sx * 1.2, 3.6, cz, PLANK);
  b.box(3.5, 2.3, 3.5, cx, H + 1.15, cz, PLANK, { tint: 0.05 });
  b.box(3.9, 0.5, 3.9, cx, H + 2.5, cz, 0x4a3a24);                       // roof
  for (const [dx, dz] of [[0, 1.78], [1.78, 0], [0, -1.78], [-1.78, 0]]) b.box(dx ? 0.2 : 2.5, 0.9, dz ? 0.2 : 2.5, cx + dx, H + 1.4, cz + dz, 0x14140f);
  b.box(0.12, H, 0.7, cx, H / 2, cz - 1.35, IRON);                       // ladder
  collider(world, cx, cz, 1.7, 0, H + 2.6);
}
function buildFloodlight(world, b, cx, cz, ry = 0) {                     // прожекторная мачта
  const H = 11;
  cyl(b, 0.24, H, cx, H / 2, cz, FENCE.mid, { seg: 8 });
  b.box(4, 0.3, 0.3, cx, H, cz, IRON, { ry });
  for (let i = -1; i <= 1; i++) b.box(0.9, 0.7, 0.55, cx + i * 1.4 * Math.cos(ry), H + 0.4, cz + i * 1.4 * Math.sin(ry), 0xf4ecc0, { ry });
  collider(world, cx, cz, 0.4, 0, H);
}

// ⑧ runway/taxiway lighting — raised edge lights (warm), green threshold bars, a PAPI box-row per end.
// Bright voxels (read as fixtures by day; stay light under the night cycle) → the strip looks operable.
function buildRunwayLights(world, b, cx, cz, L, W) {
  const x0 = cx - L / 2, x1 = cx + L / 2, ez = W / 2, WARM = 0xf8f0c8, GRN = 0x46c264, RED = 0xe04632, BASE = 0x232327;
  for (let x = x0 + 7; x < x1; x += 11) for (const s of [-1, 1]) { const z = cz + s * (ez - 0.6); b.box(0.5, 0.28, 0.5, x, 0.14, z, BASE); b.box(0.34, 0.34, 0.34, x, 0.44, z, WARM); } // edge light = dark base + lens
  for (const [ex, dir] of [[x0, 1], [x1, -1]]) {
    for (let z = -ez + 2.5; z <= ez - 2.5; z += 2.4) { b.box(0.55, 0.26, 0.55, ex + dir * 1.4, 0.13, cz + z, BASE); b.box(0.4, 0.36, 0.4, ex + dir * 1.4, 0.45, cz + z, GRN); } // threshold bar
    for (let i = 0; i < 4; i++) { const px = ex + dir * (5 + i * 1.0); b.box(0.6, 0.26, 0.6, px, 0.13, cz - ez - 1.6, BASE); b.box(0.46, 0.4, 0.46, px, 0.46, cz - ez - 1.6, i < 2 ? RED : WARM); } // PAPI
    for (let i = 1; i <= 3; i++) b.box(2.6, 0.16, 0.45, ex - dir * i * 4.5, 0.2, cz, WARM); // approach centreline bars
  }
}

// =====================================================================
// Entry — assemble the airfield surface + perimeter (structures added in later passes).
// =====================================================================
export function buildAirfield(world, ox, oz) {
  const rng = makeRNG(0xA17F);
  const b = new MeshBuilder();
  const RUNX = ox - 130, RUNZ = oz + 160, RUNL = 180, RUNW = 40;          // runway centre + size

  buildRunway(world, b, RUNX, RUNZ, RUNL, RUNW, rng);
  buildRunwayLights(world, b, RUNX, RUNZ, RUNL, RUNW);
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
  buildMiG21(world, b, ox - 59, oz + 112, '15');
  buildMiG23(world, b, ox - 118, oz + 100, '31');
  buildSu25(world, b, ox - 82, oz + 99, '25');

  // ⑥ ПВО — С-75 SAM site (N, outside the perimeter) + Шилка ×2 (corners) + П-18 radar + ЗУ-23-2 ×2
  buildSAMSite(world, b, ox - 90, oz + 222);
  buildShilka(world, b, ox - 224, oz + 188, 0.3); buildShilka(world, b, ox - 46, oz + 188, -0.3);
  buildRadarP18(world, b, ox - 150, oz + 212);
  buildZU23(world, b, ox - 168, oz + 92); buildZU23(world, b, ox - 44, oz + 100);

  // ⑦ support — штаб + fire depo (S edge, W cluster), fuel farm + ammo magazines (dispersed), windsock,
  // watchtowers (corners), floodlight masts (apron/taxiway edges)
  buildBarracks(world, b, ox - 186, oz + 92);
  buildFireStation(world, b, ox - 158, oz + 92);
  buildFuelFarm(world, b, ox - 78, oz + 93);
  buildAmmoBunker(world, b, ox - 122, oz + 114, '1');  // dispersed among the shelters
  buildAmmoBunker(world, b, ox - 60, oz + 92, '2');
  buildAmmoBunker(world, b, ox - 44, oz + 134, '3');
  buildWindsock(world, b, ox - 37, oz + 172);
  [[-232, 90], [-38, 92], [-232, 170]].forEach(([sx, sz]) => buildWatchtower(world, b, ox + sx, oz + sz));
  [[-180, 98, 0], [-120, 98, 0], [-70, 98, 0], [-150, 135, 0], [-90, 135, 0]].forEach(([sx, sz, ry]) => buildFloodlight(world, b, ox + sx, oz + sz, ry));

  const m = new THREE.Mesh(b.build(), voxelMaterial()); m.castShadow = true; m.receiveShadow = true; world.scene.add(m);
}
