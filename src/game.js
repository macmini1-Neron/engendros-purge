// game.js — ENGENDROS PURGE. Orchestrator + gameplay.
// A Zumbi-Blocks-style voxel FPS wave shooter: hold a dusty de_dust2-flavored
// arena against waves of "Engendros" voodoo-plush zombies. Big weapon roster
// (guns + melee), a key→lootbox loot loop with weapon rarity, perks & pickups.
import * as THREE from 'three';
import { Engine } from './engine.js';
import { Input } from './input.js';
import { AudioManager } from './audio.js';
import { Effects } from './effects.js';
import { MeshBuilder, voxelMaterial, clamp, damp, makeRNG, randRange, TAU, shade } from './util.js';
import { Net, makeRoomCode } from './net.js';

// --- gameplay RNG (non-deterministic; map gen uses a seeded rng) ---
const rr = (lo, hi) => lo + (hi - lo) * Math.random();
const ri = (lo, hi) => Math.floor(lo + (hi - lo + 1) * Math.random());
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chc = (p) => Math.random() < p;
function weightedPick(entries) {
  let total = 0; for (const e of entries) total += e.w;
  let r = Math.random() * total;
  for (const e of entries) { r -= e.w; if (r <= 0) return e.v; }
  return entries[entries.length - 1].v;
}

// ---------------------------------------------------------------------------
// Ray vs AABB (slab). Returns forward entry distance >=0, or null.
// ---------------------------------------------------------------------------
function rayAABB(ox, oy, oz, dx, dy, dz, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < min.x || ox > max.x) return null; }
  else { let a = (min.x - ox) / dx, b = (max.x - ox) / dx; if (a > b) { const s = a; a = b; b = s; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); if (tmin > tmax) return null; }
  if (Math.abs(dy) < 1e-9) { if (oy < min.y || oy > max.y) return null; }
  else { let a = (min.y - oy) / dy, b = (max.y - oy) / dy; if (a > b) { const s = a; a = b; b = s; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); if (tmin > tmax) return null; }
  if (Math.abs(dz) < 1e-9) { if (oz < min.z || oz > max.z) return null; }
  else { let a = (min.z - oz) / dz, b = (max.z - oz) / dz; if (a > b) { const s = a; a = b; b = s; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); if (tmin > tmax) return null; }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : 0;
}

// ---------------------------------------------------------------------------
// Rarity tiers — rolled when a weapon drops from a lootbox.
// ---------------------------------------------------------------------------
const RARITY = {
  common:    { name: 'Common',    color: 0xcfd3d8, mult: 1.0,  w: 50 },
  rare:      { name: 'Rare',      color: 0x5fa8ff, mult: 1.3,  w: 27 },
  epic:      { name: 'Epic',      color: 0xb070ff, mult: 1.7,  w: 16 },
  legendary: { name: 'Legendary', color: 0xffc23a, mult: 2.2,  w: 7 },
};
const rollRarity = () => weightedPick(Object.keys(RARITY).map((k) => ({ v: k, w: RARITY[k].w })));

// ---------------------------------------------------------------------------
// Weapons — guns + melee. dmg is BASE (rarity & perks multiply at use).
// ---------------------------------------------------------------------------
const WEAPONS = {
  // --- melee ---
  knife:    { name: 'Bayonet Knife', class: 'melee', shape: 'knife',   melee: true, dmg: 38,  rate: 0.32, range: 2.3, arcCos: 0.4, knock: 2,  price: 0,    color: 0x9aa0a6, accent: 0x6b4a2a },
  machete:  { name: 'Machete',       class: 'melee', shape: 'machete', melee: true, dmg: 62,  rate: 0.42, range: 2.5, arcCos: 0.45, knock: 3, price: 500,  loot: 8, color: 0xb6bcc2, accent: 0x3a2a1a },
  cleaver:  { name: 'Meat Cleaver',  class: 'melee', shape: 'cleaver', melee: true, dmg: 88,  rate: 0.52, range: 2.3, arcCos: 0.45, knock: 4, price: 800,  loot: 6, color: 0xd8dde2, accent: 0x6b3a1a },
  shovel:   { name: 'Trench Shovel', class: 'melee', shape: 'shovel',  melee: true, dmg: 120, rate: 0.66, range: 2.7, arcCos: 0.5, knock: 9,  price: 1000, loot: 5, color: 0x8a8f95, accent: 0x5a3a1c },
  // --- pistols ---
  luger:    { name: 'Luger P08',  class: 'pistol', shape: 'pistol',  dmg: 30, rpm: 360, auto: false, mag: 8,  reserveMax: Infinity, reload: 1.0, spread: 0.012, bloom: 0.012, pellets: 1, recoil: 0.9, range: 200, adsFov: 60, price: 0,    color: 0x33373d, accent: 0xd8c089 },
  revolver: { name: 'Peacemaker', class: 'pistol', shape: 'revolver',dmg: 72, rpm: 150, auto: false, mag: 6,  reserveMax: 60,       reload: 1.6, spread: 0.01,  bloom: 0.01,  pellets: 1, recoil: 1.6, range: 220, adsFov: 58, price: 900,  loot: 9, color: 0x4a3320, accent: 0xc9a04a },
  // --- SMGs ---
  thompson: { name: 'Thompson',   class: 'smg', shape: 'smg',  dmg: 18, rpm: 700, auto: true,  mag: 30, reserveMax: 270, reload: 1.7, spread: 0.022, bloom: 0.02, pellets: 1, recoil: 0.5,  range: 150, adsFov: 62, price: 1200, loot: 12, color: 0x3a2a1c, accent: 0x9c6a32 },
  ppsh:     { name: 'PPSh-41',    class: 'smg', shape: 'drum', dmg: 16, rpm: 900, auto: true,  mag: 71, reserveMax: 213, reload: 2.4, spread: 0.03,  bloom: 0.02, pellets: 1, recoil: 0.45, range: 140, adsFov: 64, price: 1600, loot: 8,  color: 0x2f2218, accent: 0xb88a3a },
  // --- rifles ---
  carbine:  { name: 'M1 Carbine', class: 'rifle', shape: 'rifle', dmg: 34, rpm: 400, auto: false, mag: 15, reserveMax: 120, reload: 1.5, spread: 0.01,  bloom: 0.012, pellets: 1, recoil: 0.8, range: 260, adsFov: 55, price: 1100, loot: 10, color: 0x4a3422, accent: 0x2a2a30 },
  garand:   { name: 'M1 Garand',  class: 'rifle', shape: 'rifle', dmg: 78, rpm: 250, auto: false, mag: 8,  reserveMax: 64,  reload: 1.4, spread: 0.008, bloom: 0.01,  pellets: 1, recoil: 1.4, range: 320, adsFov: 50, price: 2000, loot: 7,  color: 0x52371f, accent: 0x222226 },
  stg44:    { name: 'StG 44',     class: 'rifle', shape: 'stg',   dmg: 33, rpm: 550, auto: true,  mag: 30, reserveMax: 240, reload: 2.0, spread: 0.015, bloom: 0.016, pellets: 1, recoil: 0.82, range: 240, adsFov: 54, price: 2400, loot: 6,  color: 0x33373d, accent: 0x6e4a28 },
  // --- shotguns ---
  shotgun:  { name: 'Trench Gun', class: 'shotgun', shape: 'shotgun', dmg: 12, rpm: 80,  auto: false, mag: 6, reserveMax: 48, reload: 2.0, spread: 0.085, bloom: 0, pellets: 9,  recoil: 1.8, range: 60, adsFov: 66, price: 1700, loot: 9, color: 0x3a2418, accent: 0x9c6a32 },
  sawed_off:{ name: 'Sawed-Off',  class: 'shotgun', shape: 'sawed',   dmg: 16, rpm: 170, auto: false, mag: 2, reserveMax: 24, reload: 1.4, spread: 0.13,  bloom: 0, pellets: 12, recoil: 2.6, range: 38, adsFov: 70, price: 1500, loot: 8, color: 0x4a2e1c, accent: 0xc25b3a },
  // --- sniper ---
  kar98:    { name: 'Kar98 Scoped', class: 'sniper', shape: 'sniper', dmg: 155, rpm: 50, auto: false, mag: 5, reserveMax: 30, reload: 2.1, spread: 0.002, bloom: 0, pellets: 1, recoil: 2.8, range: 500, adsFov: 22, scope: true, price: 2600, loot: 5, color: 0x20242a, accent: 0x6fa8e8 },
  // --- extra arsenal (loot + shop) ---
  magnum:   { name: '.44 Magnum',  class: 'pistol', shape: 'magnum', dmg: 98, rpm: 120, auto: false, mag: 6, reserveMax: 48, reload: 1.8, spread: 0.01, bloom: 0.01, pellets: 1, recoil: 2.0, range: 220, adsFov: 58, price: 1400, loot: 8, color: 0x4a4a52, accent: 0x6b4a2a },
  mp40:     { name: 'MP 40',       class: 'smg', shape: 'mp40',  dmg: 19, rpm: 520, auto: true, mag: 32, reserveMax: 256, reload: 1.8, spread: 0.02, bloom: 0.018, pellets: 1, recoil: 0.5, range: 150, adsFov: 62, price: 1300, loot: 11, color: 0x2e3036, accent: 0x3a3a3a },
  grease:   { name: 'M3 Grease Gun', class: 'smg', shape: 'grease', dmg: 23, rpm: 430, auto: true, mag: 30, reserveMax: 240, reload: 1.9, spread: 0.024, bloom: 0.02, pellets: 1, recoil: 0.55, range: 140, adsFov: 62, price: 1250, loot: 9, color: 0x3a3d42, accent: 0x262626 },
  bar:      { name: 'BAR M1918',   class: 'rifle', shape: 'bar', dmg: 42, rpm: 500, auto: true, mag: 20, reserveMax: 160, reload: 2.4, spread: 0.016, bloom: 0.02, pellets: 1, recoil: 1.1, range: 260, adsFov: 55, price: 2600, loot: 6, color: 0x3a3128, accent: 0x26262a },
  dp28:     { name: 'DP-28',       class: 'rifle', shape: 'dp28', dmg: 31, rpm: 540, auto: true, mag: 47, reserveMax: 188, reload: 2.8, spread: 0.018, bloom: 0.018, pellets: 1, recoil: 0.7, range: 240, adsFov: 56, price: 2700, loot: 5, color: 0x3a352c, accent: 0x4a4a50, spinMag: { shape: 'pan', x: 0, y: 0.2, z: -0.3, r: 0.28, axis: 'y', step: TAU / 47 } },
  mosin:    { name: 'Mosin-Nagant', class: 'sniper', shape: 'mosin', dmg: 165, rpm: 42, auto: false, mag: 5, reserveMax: 30, reload: 2.6, spread: 0.0022, bloom: 0, pellets: 1, recoil: 2.7, range: 480, adsFov: 26, scope: true, price: 2400, loot: 5, color: 0x6e4a28, accent: 0x4a4e54 },
  bazooka:  { name: 'Bazooka',     class: 'launcher', shape: 'bazooka', dmg: 0, rpm: 30, auto: false, mag: 1, reserveMax: 8, reload: 2.8, spread: 0.004, bloom: 0, pellets: 1, recoil: 2.6, range: 300, adsFov: 62, explodeDmg: 240, explodeRadius: 7.5, price: 3200, loot: 3, color: 0x4a5238, accent: 0x2e2e2e },
  axe:      { name: 'Trench Axe',  class: 'melee', shape: 'axe', melee: true, dmg: 95, rate: 0.5, range: 2.4, arcCos: 0.45, knock: 5, price: 700, loot: 7, color: 0x9aa0a6, accent: 0x6b4a2a },
};
const WEAPON_ORDER = ['knife', 'axe', 'machete', 'cleaver', 'shovel', 'luger', 'magnum', 'revolver', 'mp40', 'grease', 'thompson', 'ppsh', 'carbine', 'bar', 'dp28', 'garand', 'stg44', 'shotgun', 'sawed_off', 'bazooka', 'mosin', 'kar98'];
const LOOT_WEAPONS = WEAPON_ORDER.filter((k) => WEAPONS[k].loot);
const lootWeapon = () => weightedPick(LOOT_WEAPONS.map((k) => ({ v: k, w: WEAPONS[k].loot })));

const SOUND_BY_CLASS = {
  pistol:  { body: 240, crack: 0.06, vol: 0.42, hp: 2100, bp: 1000 },
  smg:     { body: 200, crack: 0.05, vol: 0.40, hp: 2300, bp: 1100 },
  rifle:   { body: 180, crack: 0.08, vol: 0.52, hp: 1900, bp: 950 },
  shotgun: { body: 120, crack: 0.13, vol: 0.62, hp: 1400, bp: 700 },
  sniper:  { body: 160, crack: 0.10, vol: 0.72, hp: 1700, bp: 800 },
  launcher:{ body: 90,  crack: 0.20, vol: 0.70, hp: 800,  bp: 450 },
};

// ---------------------------------------------------------------------------
// Engendros — voodoo-plush enemies. Round ball head, big button eye, stitched
// "X" smile, thread-tuft hair, stubby limbs. Built once per color, shared.
// ---------------------------------------------------------------------------
const ENGENDRO_COLORS = [
  { body: 0xe8622e, name: 'Luka' },  // orange
  { body: 0xe24f86, name: 'Flopi' }, // pink
  { body: 0x3f8ad6, name: 'Odo' },   // blue
  { body: 0xd83b3b, name: 'Dudo' },  // red
  { body: 0x4fb05a, name: 'Upy' },   // green
  { body: 0xf2c33a, name: 'Mitri' }, // yellow
  { body: 0x9b5fd0, name: 'Tolo' },  // purple
  { body: 0xede7df, name: 'Tuli' },  // white
];

function addButtonEye(b, x, y, z, r, accent) {
  const dark = 0x161210;
  const outer = new THREE.CylinderGeometry(r, r, 0.06, 12); b.geo(outer, x, y, z, dark, { rx: Math.PI / 2 }); outer.dispose();
  const inner = new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.08, 12); b.geo(inner, x, y, z + 0.015, accent, { rx: Math.PI / 2 }); inner.dispose();
  b.box(0.03, 0.03, 0.06, x - 0.05, y, z + 0.05, dark);
  b.box(0.03, 0.03, 0.06, x + 0.05, y, z + 0.05, dark);
}

function addStitchSmile(b, cx, cy, cz, width) {
  const dark = 0x161210;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;          // -0.5..0.5
    const x = cx + t * width;
    const y = cy + (t * t) * 0.22;        // gentle upward smile
    b.box(0.06, 0.014, 0.05, x, y, cz, dark, { rz: 0.7 });
    b.box(0.06, 0.014, 0.05, x, y, cz, dark, { rz: -0.7 });
  }
}

// type: visual variant ('normal' | 'exploder' | 'boss'); col: palette entry
function buildEngendro(col, variant = 'normal') {
  const b = new MeshBuilder();
  const body = col.body;
  const belly = shade(body, 0.2);
  const eyeAccent = 0xffffff;

  // body (rounded blob)
  const bodyGeo = new THREE.IcosahedronGeometry(0.46, 1);
  b.geo(bodyGeo, 0, 0.8, 0, body, { sx: 0.98, sy: 1.18, sz: 0.86, tint: 0.03 }); bodyGeo.dispose();
  // belly pocket
  b.box(0.32, 0.3, 0.05, 0, 0.74, 0.42, variant === 'exploder' ? 0xd83b2b : belly);

  // big round head
  const headGeo = new THREE.IcosahedronGeometry(0.6, 1);
  b.geo(headGeo, 0, 1.62, 0, body, { tint: 0.03 }); headGeo.dispose();

  // hair tufts
  for (const dx of [-0.13, 0, 0.13]) b.box(0.04, 0.24, 0.04, dx, 2.2, -0.02, 0x161210, { rz: dx * 1.6 });

  // eye(s) + stitched smile
  if (variant === 'boss') {
    addButtonEye(b, -0.18, 1.74, 0.57, 0.21, 0x2a2018);              // Tolo's big button eye (left)
    b.box(0.13, 0.02, 0.05, 0.2, 1.74, 0.58, 0x161210, { rz: 0.7 }); // small stitched "X" eye (right)
    b.box(0.13, 0.02, 0.05, 0.2, 1.74, 0.58, 0x161210, { rz: -0.7 });
  } else if (chc(0.5) || variant === 'exploder') {
    addButtonEye(b, 0, 1.7, 0.58, 0.2, variant === 'exploder' ? 0xff3a2a : eyeAccent);
  } else {
    addButtonEye(b, -0.2, 1.72, 0.56, 0.15, eyeAccent);
    addButtonEye(b, 0.2, 1.72, 0.56, 0.15, eyeAccent);
  }
  addStitchSmile(b, 0, 1.48, 0.59, 0.36);

  // stubby arms
  const armGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.52, 6);
  b.geo(armGeo, -0.52, 0.95, 0, body, { rz: Math.PI / 2.3, tint: 0.03 });
  b.geo(armGeo, 0.52, 0.95, 0, body, { rz: -Math.PI / 2.3, tint: 0.03 });
  armGeo.dispose();
  // stubby legs
  const legGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.42, 6);
  b.geo(legGeo, -0.18, 0.21, 0, body, { tint: 0.03 });
  b.geo(legGeo, 0.18, 0.21, 0, body, { tint: 0.03 });
  legGeo.dispose();

  if (variant === 'boss') { // BOSS TOLO: red bullseye target on the belly (its laser emitter)
    const disc = (r, col, dz) => { const c = new THREE.CylinderGeometry(r, r, 0.05, 16); b.geo(c, 0, 0.86, 0.46 + dz, col, { rx: Math.PI / 2 }); c.dispose(); };
    disc(0.34, 0xd83b2b, 0); disc(0.24, 0xfff6e8, 0.02); disc(0.14, 0xd83b2b, 0.04); disc(0.05, 0xfff6e8, 0.06);
  }
  if (variant === 'exploder') { // danger stripes on belly
    b.box(0.36, 0.05, 0.06, 0, 0.86, 0.43, 0x161210);
    b.box(0.36, 0.05, 0.06, 0, 0.66, 0.43, 0x161210);
  }
  if (variant === 'charger') { // strapped-on explosive vest
    b.box(0.66, 0.54, 0.46, 0, 0.85, 0, 0x363636, { tint: 0.03 });
    const stick = new THREE.CylinderGeometry(0.07, 0.07, 0.42, 6);
    for (const dx of [-0.2, -0.07, 0.07, 0.2]) b.geo(stick, dx, 0.85, 0.27, 0xc0392b, { tint: 0.03 });
    stick.dispose();
    b.box(0.5, 0.05, 0.05, 0, 0.6, 0.3, 0x161210);   // wiring
    b.box(0.1, 0.1, 0.1, 0, 1.06, 0.33, 0xff2a2a);    // blinking detonator
  }

  const geo = b.build();
  geo.computeBoundingBox();
  return geo;
}

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
  return {
    sandHi:   0xd8c49a, sandMid:  0xc9b48a, sandLo:   0xb09468,
    brnHi:    0x9a7a55, brnMid:   0x8a6a45, brnLo:    0x70512e,
    olvHi:    0x7e7f5a, olvMid:   0x6e6f4a, olvLo:    0x575835,
    steelHi:  0x666b72, steelMid: 0x44474d, steelLo:  0x2e3035,
    slotCol:  0x222428,   // near-black recesses
    rubbCol:  0x2a2c2e,   // rubber road-wheel rim
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

// ── Hull: main box + sloped glacis + rear deck/grilles + mudguards + tow hooks ──
function _tankHull(b, P) {
  const slab = _tankSlabFn();
  // Main hull box — low/squat T-90 profile (3.6 wide x 7.2 long, centre y=0.9)
  slab(b, 3.6, 1.8, 7.2, 0, 0.9, 0, P.sandMid, P.sandHi, P.sandLo);

  // Sloped glacis plate (front upper hull, tilted ~31 deg)
  b.box(3.5, 1.1,  1.8, 0, 1.65, 3.10, P.sandMid, { tint: 0.03, rx: -0.55 });
  b.box(3.5, 0.14, 1.8, 0, 2.15, 3.05, P.sandHi,  { rx: -0.55 }); // top lit strip

  // Rear hull — boxy engine deck
  slab(b, 3.6, 0.5, 1.4, 0, 1.95, -2.8, P.brnMid, P.brnHi, P.brnLo);
  // Engine deck grilles (dark slots x 5)
  for (let i = 0; i < 5; i++) {
    b.box(0.55, 0.06, 0.08, -1.1 + i * 0.55, 2.22, -3.1, P.slotCol);
  }
  b.box(3.5, 0.05, 0.1, 0, 2.22, -2.5, P.slotCol); // rear vent strip 1
  b.box(3.5, 0.05, 0.1, 0, 2.22, -3.5, P.slotCol); // rear vent strip 2

  // Rear tool box / storage
  b.box(1.4, 0.38, 0.5,  -1.0, 2.12, -3.65, P.olvMid, { tint: 0.03 });
  b.box(1.4, 0.05, 0.5,  -1.0, 2.32, -3.65, P.olvHi);
  b.box(0.8, 0.32, 0.48,  0.9, 2.12, -3.65, P.brnMid, { tint: 0.03 });

  // Front mudguard plates (left + right)
  b.box(0.55, 0.12, 1.5, -1.93, 1.84, 2.2, P.sandMid);
  b.box(0.55, 0.12, 1.5,  1.93, 1.84, 2.2, P.sandMid);

  // Tow hooks (front corners)
  for (const hx of [-1.3, 1.3]) {
    b.box(0.18, 0.24, 0.22, hx, 0.7, 3.65, P.steelMid);
    b.box(0.06, 0.22, 0.30, hx, 0.7, 3.82, P.slotCol);
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

// ── One side skirt + ERA tile grid ──────────────────────────────────────────
// sx = -1 (left) or +1 (right).
function _tankSideSkirt(root, P, sx) {
  const slab = _tankSlabFn();
  const era  = _tankEraFn(P);
  const skb  = new MeshBuilder();
  const skx  = sx * 1.9;

  // Skirt panel backing strip
  slab(skb, 0.12, 0.65, 7.0, skx, 1.18, -0.1, P.steelMid, P.steelHi, P.steelLo);

  // ERA bricks — denser: 3 rows x 14 cols (was 12, smaller tiles)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 14; col++) {
      const ez = 2.90 - col * 0.46;
      const ey = 0.94 + row * 0.22;
      era(skb, 0.13, 0.18, 0.38, skx + sx * 0.08, ey, ez);
    }
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

// ── Main turret body: angular welded shell (front/centre/bustle/top + front ERA) ─
function _tankTurretShell(b, P) {
  const slab = _tankSlabFn();
  slab(b, 2.8, 1.05, 1.4, 0, 0.52,  0.9,  P.olvMid, P.olvHi, P.olvLo); // front
  slab(b, 2.6, 0.95, 1.6, 0, 0.47, -0.4,  P.olvMid, P.olvHi, P.olvLo); // centre
  slab(b, 2.0, 0.72, 1.0, 0, 0.36, -1.35, P.brnMid, P.brnHi, P.brnLo); // bustle
  b.box(2.6, 0.10, 2.8, 0, 1.02, 0.1, P.sandMid, { tint: 0.02 });       // top plate

  // Turret front plate ERA (3 rows x 4 cols of Relikt bricks)
  const era = _tankEraFn(P);
  for (let row = 0; row < 3; row++) {
    for (let col = -2; col <= 1; col++) {
      era(b, 0.52, 0.24, 0.20, (col + 0.5) * 0.62, 0.18 + row * 0.30, 1.62);
    }
  }
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
function buildTank(camo = 'desert') {
  const P    = _tankPalette();
  const root = new THREE.Group(); root.name = 'tank';

  // Hull
  const hb = new MeshBuilder();
  _tankHull(hb, P);
  _tankGlacisEra(hb, P);
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
  _tankCheekEra(turB, P, -1);
  _tankCheekEra(turB, P,  1);
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
const _tankWrecks = []; // { mesh, pos:{x,y,z}, t, _smokeAccum }

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
function buildTankWreck() {
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

// ---------------------------------------------------------------------------
// Player avatar — an "Engendro" plush in a WW2 Soviet-officer uniform:
// cyan plush ball head + big pink fur side-puffs & collar, button eye w/ pink X,
// stitched smile, olive tunic w/ shoulder boards + medals + sash + belt + holster,
// peaked cap w/ red band + gold star, black boots. Faces +Z, feet at y=0, ~2.8 tall.
// Returns a merged BufferGeometry (use with voxelMaterial()). opts recolors
// head / fur / uniform per player for multiplayer.
// ---------------------------------------------------------------------------
function buildPlayerAvatar(opts = {}) {
  const b = new MeshBuilder();
  const dark = 0x161210;
  const head = opts.headColor || 0x2ec6d8,  headHi = shade(head, 0.16), headLo = shade(head, -0.13);
  const fur  = opts.furColor  || 0xee3f97,  furHi  = shade(fur, 0.15),  furLo  = shade(fur, -0.14);
  const uni  = opts.uniformColor || 0x6c6e31, uniHi = shade(uni, 0.16), uniLo = shade(uni, -0.15);
  const leat = 0x7a4a22, leatHi = shade(leat, 0.16), leatLo = shade(leat, -0.15);
  const gold = 0xe7b53a, goldHi = 0xf8d76b;
  const red  = 0xc8392e, redHi = 0xe05646;
  const boot = 0x1b1b1e, bootHi = 0x3a3b42;
  const fz = 0.52; // face plane (front of head)

  // box with a lit top strip + shadowed bottom strip (the layered "pretty" look)
  const slab = (w, h, d, x, y, z, mid, hi, lo, o = {}) => {
    b.box(w, h, d, x, y, z, mid, o);
    b.box(w, h * 0.2, d, x, y + h * 0.4, z, hi, o);
    b.box(w, h * 0.16, d, x, y - h * 0.42, z, lo, o);
  };
  const cyl = (rt, rb, h, x, y, z, col, o = {}) => { const g = new THREE.CylinderGeometry(rt, rb, h, o.seg || 14); b.geo(g, x, y, z, col, o); g.dispose(); };
  const ball = (r, x, y, z, col, o = {}) => { const g = new THREE.IcosahedronGeometry(r, o.detail ?? 1); b.geo(g, x, y, z, col, o); g.dispose(); };
  // smooth stitched arc: rise>0 = concave-up (smile), rise<0 = concave-down (arch). xMarks adds cross-stitches.
  const stitchArc = (cx, cy, cz, halfW, rise, segs, len, thick, col, xMarks = false) => {
    const k = rise / (halfW * halfW);
    for (let i = 0; i <= segs; i++) {
      const x = -halfW + (i / segs) * 2 * halfW;
      const y = cy + k * x * x, ang = Math.atan(2 * k * x);
      b.box(len, thick, 0.04, cx + x, y, cz, col, { rz: ang });
      if (xMarks && i > 0 && i < segs && i % 2 === 0) {
        b.box(0.055, thick, 0.05, cx + x, y - 0.02, cz + 0.006, col, { rz: 0.7 });
        b.box(0.055, thick, 0.05, cx + x, y - 0.02, cz + 0.006, col, { rz: -0.7 });
      }
    }
  };
  // filled 5-point gold star (pentagon core + 5 radiating points)
  const star5 = (cx, cy, cz, R, col, colHi) => {
    cyl(R * 0.62, R * 0.62, 0.05, cx, cy, cz, col, { rx: Math.PI / 2, seg: 5, rz: Math.PI });
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + i * (TAU / 5);
      b.box(R * 0.42, R, 0.045, cx + Math.cos(a) * R * 0.52, cy + Math.sin(a) * R * 0.52, cz, col, { rz: a - Math.PI / 2 });
    }
    cyl(R * 0.26, R * 0.26, 0.06, cx, cy, cz + 0.01, colHi, { rx: Math.PI / 2, seg: 5, rz: Math.PI });
  };

  // ---- boots (black, slight splayed stance, toe forward) ----
  for (const s of [-1, 1]) {
    slab(0.35, 0.22, 0.52, s * 0.3, 0.11, 0.07, boot, bootHi, boot);
    b.box(0.35, 0.14, 0.22, s * 0.3, 0.16, 0.3, boot);              // toe cap
    slab(0.32, 0.34, 0.34, s * 0.3, 0.42, -0.02, boot, bootHi, boot); // shaft
    b.box(0.34, 0.05, 0.36, s * 0.3, 0.56, -0.02, bootHi);          // boot-top rim (lit)
  }
  // ---- breeches (olive, flared galife thighs tucked into boots) ----
  for (const s of [-1, 1]) {
    slab(0.37, 0.5, 0.42, s * 0.26, 0.76, -0.01, uni, uniHi, uniLo);
    b.box(0.18, 0.4, 0.4, s * 0.46, 0.9, -0.01, uni, { tint: 0.02 }); // outer galife flare
  }
  // ---- tunic (gimnasterka) ----
  slab(0.78, 0.76, 0.54, 0, 1.22, 0, uni, uniHi, uniLo);
  b.box(0.82, 0.18, 0.56, 0, 1.53, -0.01, uniHi);   // shoulder yoke (lit)
  b.box(0.82, 0.16, 0.56, 0, 0.9, 0, uniLo);         // skirt hem (shadowed)
  // very subtle knit ribbing (low contrast, sits just behind the pockets)
  const rib = shade(uni, -0.05);
  for (let i = 0; i < 7; i++) b.box(0.01, 0.62, 0.012, -0.3 + i * 0.1, 1.2, 0.262, rib, { tint: 0.015 });
  // center button placket
  b.box(0.06, 0.7, 0.03, 0, 1.2, 0.272, uniHi);
  for (let i = 0; i < 5; i++) b.box(0.05, 0.05, 0.04, 0, 1.0 + i * 0.12, 0.29, gold);
  // two breast pockets w/ button flaps
  for (const s of [-1, 1]) {
    const px = s * 0.21, py = 1.28;
    b.box(0.24, 0.27, 0.04, px, py, 0.272, uni);
    b.box(0.26, 0.06, 0.05, px, py + 0.16, 0.276, uniHi);              // flap
    b.box(0.026, 0.27, 0.05, px - 0.12, py, 0.276, uniLo); b.box(0.026, 0.27, 0.05, px + 0.12, py, 0.276, uniLo);
    b.box(0.026, 0.27, 0.05, px, py, 0.278, uniLo, { tint: 0.01 });     // center pleat
    b.box(0.045, 0.045, 0.05, px, py + 0.13, 0.292, gold);             // flap button
  }
  // stand collar + red tabs
  cyl(0.27, 0.29, 0.17, 0, 1.57, 0.02, uni, { seg: 14 });
  b.box(0.15, 0.11, 0.06, -0.17, 1.57, 0.25, red); b.box(0.15, 0.11, 0.06, 0.17, 1.57, 0.25, red);
  // belt + brass buckle
  slab(0.84, 0.14, 0.58, 0, 0.91, 0, leat, leatHi, leatLo);
  b.box(0.18, 0.18, 0.05, 0, 0.91, 0.3, gold); b.box(0.11, 0.11, 0.03, 0, 0.91, 0.32, goldHi);
  // diagonal sash (portupeya): right shoulder -> left hip
  b.box(0.12, 1.05, 0.05, 0.0, 1.22, 0.29, leat, { rz: 0.52 });
  b.box(0.045, 1.05, 0.05, 0.045, 1.22, 0.31, leatHi, { rz: 0.52 });
  // holster on the left hip (viewer's right, +x), hanging off the belt
  slab(0.21, 0.36, 0.2, 0.46, 0.72, 0.16, leat, leatHi, leatLo);
  b.box(0.24, 0.09, 0.22, 0.46, 0.91, 0.16, leatHi);                  // flap
  b.box(0.08, 0.12, 0.08, 0.46, 0.97, 0.16, dark);                    // pistol grip peeking out
  // medal cluster on the right chest (viewer's left, -x)
  for (let i = 0; i < 3; i++) b.box(0.08, 0.055, 0.04, -0.28 + i * 0.085, 1.45, 0.292, i === 1 ? gold : (i === 0 ? red : redHi)); // ribbon bars
  cyl(0.05, 0.05, 0.03, -0.24, 1.36, 0.3, gold, { rx: Math.PI / 2, seg: 12 });
  cyl(0.05, 0.05, 0.03, -0.13, 1.35, 0.3, 0xcfd3d8, { rx: Math.PI / 2, seg: 12 }); // silver medal
  b.box(0.1, 0.1, 0.03, 0.22, 1.36, 0.3, red, { rz: 0.785 }); b.box(0.058, 0.058, 0.04, 0.22, 1.36, 0.305, gold, { rz: 0.785 }); // order badge
  // shoulder boards (epaulettes)
  for (const s of [-1, 1]) {
    slab(0.2, 0.07, 0.36, s * 0.31, 1.56, 0.02, red, redHi, red);
    for (let i = 0; i < 3; i++) b.box(0.15, 0.02, 0.04, s * 0.31, 1.59, -0.08 + i * 0.08, gold);
  }
  // ---- arms (olive sleeves) + cyan plush hands ----
  for (const s of [-1, 1]) {
    const arm = new THREE.CylinderGeometry(0.16, 0.14, 0.62, 9); b.geo(arm, s * 0.49, 1.18, 0.0, uni, { rz: s * 0.12, tint: 0.02 }); arm.dispose();
    b.box(0.22, 0.13, 0.24, s * 0.54, 0.86, 0.01, head, { tint: 0.02 }); // cyan cuff
    ball(0.18, s * 0.56, 0.71, 0.03, head, { tint: 0.02 });               // plush hand
  }
  // ---- head (cyan plush ball, slightly wide) ----
  ball(0.58, 0, 2.06, 0, head, { sx: 1.08, sy: 0.98, sz: 0.96, tint: 0.02 });
  // big fluffy pink ear-puffs on the sides (no neck ruff)
  for (const s of [-1, 1]) {
    for (const [dx, dy, dz, r] of [[0.55, 2.02, 0.0, 0.35], [0.5, 1.73, 0.05, 0.27], [0.52, 2.3, -0.05, 0.25], [0.46, 2.0, 0.3, 0.21], [0.48, 2.0, -0.32, 0.21]]) {
      ball(r, s * dx, dy, dz, fur, { tint: 0.07 });
      ball(r * 0.55, s * dx, dy + r * 0.46, dz * 0.85, furHi, { tint: 0.05, detail: 0 });
    }
  }
  // ---- face: button eye w/ pink X (left), happy closed eye + brow (right), wide stitched smile ----
  (function buttonEye(x, y, r) {
    const o = new THREE.CylinderGeometry(r, r, 0.06, 16); b.geo(o, x, y, fz, dark, { rx: Math.PI / 2 }); o.dispose();
    const ri = new THREE.CylinderGeometry(r * 0.78, r * 0.78, 0.08, 16); b.geo(ri, x, y, fz + 0.012, 0x2a221d, { rx: Math.PI / 2 }); ri.dispose();
    b.box(r * 1.05, 0.035, 0.05, x, y, fz + 0.07, 0xff66b2, { rz: 0.785 });
    b.box(r * 1.05, 0.035, 0.05, x, y, fz + 0.07, 0xff66b2, { rz: -0.785 });
    for (const [hx, hy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) b.box(0.022, 0.022, 0.06, x + hx * r * 0.4, y + hy * r * 0.4, fz + 0.05, 0x0c0a08); // thread holes
  })(-0.21, 2.12, 0.18);
  stitchArc(0.24, 2.12, fz + 0.01, 0.12, -0.07, 5, 0.072, 0.03, dark);   // happy closed eye (arch)
  stitchArc(0.24, 2.27, fz, 0.1, -0.045, 4, 0.06, 0.022, dark);          // eyebrow
  stitchArc(0, 1.73, fz + 0.02, 0.34, 0.17, 9, 0.105, 0.032, dark, true); // wide smile w/ cross-stitches
  // ---- peaked cap (olive crown + red band + small front visor + gold star) ----
  cyl(0.57, 0.57, 0.22, 0, 2.48, -0.01, red, { seg: 22, tint: 0.02 });    // red band
  cyl(0.62, 0.54, 0.24, 0, 2.66, -0.03, uni, { seg: 24, tint: 0.02 });    // olive crown
  cyl(0.64, 0.62, 0.07, 0, 2.79, -0.03, uniHi, { seg: 24 });              // domed lit crown top
  b.box(0.6, 0.035, 0.13, 0, 2.39, 0.63, 0x24251b, { rx: -0.22 });        // front visor (thin brim, projects forward)
  b.box(0.6, 0.02, 0.13, 0, 2.404, 0.63, 0x34362a, { rx: -0.22 });
  star5(0, 2.49, 0.61, 0.16, gold, goldHi);                               // gold star cockade

  const geo = b.build();
  geo.computeBoundingBox();
  return geo;
}

// ---------------------------------------------------------------------------
// FLOPO — the flower-plush hero (engendros.cl "Flopo"). A chubby cyan plush
// with pink flower petals around the head + a pink petal collar, a big button
// eye w/ pink X (left) and a SMALLER bead eye (right, not winking), and a
// stitched smile. Built from SMOOTH rounded shapes (so it reads soft & cute),
// and as a RIGGED hierarchy (separate head / body / arm / leg pivot Groups)
// so it's ready for movement animation. Returns a THREE.Group; the animatable
// parts are exposed on group.userData.parts. opts.skin/opts.petal recolor it.
// ---------------------------------------------------------------------------
function buildFlopo(opts = {}) {
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

const ENEMY_TYPES = {
  swarmer:  { hp: 28,  speed: 4.1,  dmg: 4,  reward: 30,  scale: 0.55, variant: 'normal' },
  runner:   { hp: 55,  speed: 3.4,  dmg: 6,  reward: 55,  scale: 0.85, variant: 'normal' },
  grunt:    { hp: 95,  speed: 2.0,  dmg: 9,  reward: 50,  scale: 1.0,  variant: 'normal' },
  charger:  { hp: 120, speed: 4.4,  dmg: 0,  reward: 130, scale: 1.0,  variant: 'charger', explode: true, charger: true, explodeDmg: 55, explodeRadius: 5.2 },
  exploder: { hp: 80,  speed: 2.4,  dmg: 8,  reward: 95,  scale: 1.0,  variant: 'exploder', explode: true, explodeDmg: 38, explodeRadius: 5.5 },
  brute:    { hp: 300, speed: 1.35, dmg: 20, reward: 130, scale: 1.6,  variant: 'normal' },
  titan:    { hp: 640, speed: 1.1,  dmg: 30, reward: 260, scale: 2.05, variant: 'normal' },
  minitolo: { hp: 45,  speed: 3.9,  dmg: 14, reward: 25,  scale: 0.6,  variant: 'normal' },
  boss:     { hp: 3200, speed: 1.0, dmg: 32, reward: 1200, scale: 2.85, variant: 'boss', boss: true, laser: true },
  tank:     { hp: 3600, armorHP: 3600, mitriHP: 750, speed: 1.2, dmg: 40, reward: 1500, scale: 1, // scale 1 = placeholder; real model later
              variant: 'tank', boss: true, tank: true, armored: true, explosiveMult: 2.0 },
};

// ---------------------------------------------------------------------------
// World — voxel de_dust2-flavored arena. Sandstone structures, crates,
// chokepoints. Collision = AABBs. Also holds lootbox anchor spots & spawns.
// ---------------------------------------------------------------------------
class World {
  constructor(game) {
    this.game = game;
    this.scene = game.engine.scene;
    this.HALF = 70;
    this.boxes = [];
    this.spawns = [];
    this.lootSpots = [];
    this.scene.fog.near = 95; this.scene.fog.far = 640; // wider haze for the larger compound
    this._build();
  }

  _solid(builder, w, h, d, x, y, z, color, opts = {}) {
    builder.box(w, h, d, x, y, z, color, opts);
    this.boxes.push({ min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2), max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2) });
  }

  // Staircase of solid blocks rising stepH each from baseY, marching along (dx,dz). Walkable via step-up.
  _stairs(builder, sx, sz, dx, dz, steps, color, baseY = 0, stepH = 0.5, stepD = 0.85, width = 3.4) {
    for (let i = 0; i < steps; i++) {
      const cx = sx + dx * i * stepD, cz = sz + dz * i * stepD, hY = (i + 1) * stepH;
      this._solid(builder, dx !== 0 ? stepD : width, hY, dz !== 0 ? stepD : width, cx, baseY + hY / 2, cz, color, { tint: 0.05 });
    }
  }

  // Wall along axis 'x' or 'z' centered at (cx,cz), with an optional doorway/window gap { width, height, offset }.
  _wall(b, cx, cz, length, height, baseY, axis, color, door) {
    const t = 0.6;
    if (!door) {
      if (axis === 'x') this._solid(b, length, height, t, cx, baseY + height / 2, cz, color, { tint: 0.04 });
      else this._solid(b, t, height, length, cx, baseY + height / 2, cz, color, { tint: 0.04 });
      return;
    }
    const dw = door.width, dh = Math.min(height, door.height || 2.6), off = door.offset || 0, half = length / 2;
    const leftLen = half + off - dw / 2, rightLen = half - off - dw / 2, lintel = height - dh;
    if (axis === 'x') {
      if (leftLen > 0.05) this._solid(b, leftLen, height, t, cx - half + leftLen / 2, baseY + height / 2, cz, color, { tint: 0.04 });
      if (rightLen > 0.05) this._solid(b, rightLen, height, t, cx + half - rightLen / 2, baseY + height / 2, cz, color, { tint: 0.04 });
      if (lintel > 0.05) this._solid(b, dw, lintel, t, cx + off, baseY + dh + lintel / 2, cz, color, { tint: 0.04 });
    } else {
      if (leftLen > 0.05) this._solid(b, t, height, leftLen, cx, baseY + height / 2, cz - half + leftLen / 2, color, { tint: 0.04 });
      if (rightLen > 0.05) this._solid(b, t, height, rightLen, cx, baseY + height / 2, cz + half - rightLen / 2, color, { tint: 0.04 });
      if (lintel > 0.05) this._solid(b, t, lintel, dw, cx, baseY + dh + lintel / 2, cz + off, color, { tint: 0.04 });
    }
  }

  // Floor slab (walkable top at y) with an optional rectangular hole {x,z,w,d} (stairwell).
  _floor(b, cx, cz, w, d, y, color, hole) {
    const t = 0.4;
    if (!hole) { this._solid(b, w, t, d, cx, y - t / 2, cz, color, { tint: 0.03 }); return; }
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const hx0 = hole.x - hole.w / 2, hx1 = hole.x + hole.w / 2, hz0 = hole.z - hole.d / 2, hz1 = hole.z + hole.d / 2;
    const nS = hz0 - z0; if (nS > 0.05) this._solid(b, w, t, nS, cx, y - t / 2, z0 + nS / 2, color, { tint: 0.03 });
    const sS = z1 - hz1; if (sS > 0.05) this._solid(b, w, t, sS, cx, y - t / 2, z1 - sS / 2, color, { tint: 0.03 });
    const midZ = (hz0 + hz1) / 2, midD = Math.max(0, hz1 - hz0);
    const wW = hx0 - x0; if (wW > 0.05) this._solid(b, wW, t, midD, x0 + wW / 2, y - t / 2, midZ, color, { tint: 0.03 });
    const eW = x1 - hx1; if (eW > 0.05) this._solid(b, eW, t, midD, x1 - eW / 2, y - t / 2, midZ, color, { tint: 0.03 });
  }

  // Multi-story building: perimeter walls (door on ground / balcony opening above on doorSide),
  // per-floor slabs with a stairwell hole, and an interior staircase running up to the roof.
  _building(b, cx, cz, w, d, floors, color, doorSide = 'S', roofColor) {
    const FH = 3.4, run = 0.85, swW = 3.0, steps = 7, RUN = steps * run;
    const ifloor = 0xb39c74;
    for (let L = 0; L < floors; L++) {
      const baseY = L * FH;
      const spec = (side) => (side === doorSide ? (L === 0 ? { width: 2.8, height: 2.7 } : { width: Math.min(w, d) * 0.5, height: 2.2 }) : null);
      this._wall(b, cx, cz - d / 2, w, FH, baseY, 'x', color, spec('N'));
      this._wall(b, cx, cz + d / 2, w, FH, baseY, 'x', color, spec('S'));
      this._wall(b, cx - w / 2, cz, d, FH, baseY, 'z', color, spec('W'));
      this._wall(b, cx + w / 2, cz, d, FH, baseY, 'z', color, spec('E'));
      // switchback stairwell: alternate the corner each floor so flights never stack over each other (no head-bonk).
      const even = (L % 2 === 0);
      const sCx = even ? (cx + w / 2 - swW / 2 - 1.0) : (cx - w / 2 + swW / 2 + 1.0);
      const dz = even ? 1 : -1;
      const sStartZ = even ? (cz - d / 2 + 1.0) : (cz + d / 2 - 1.0);
      const hole = { x: sCx, z: sStartZ + dz * (RUN - run) / 2, w: swW + 0.8, d: RUN };
      this._floor(b, cx, cz, w, d, (L + 1) * FH, (L + 1 === floors) ? (roofColor || color) : ifloor, hole);
      this._stairs(b, sCx, sStartZ, 0, dz, steps, 0xb98a4e, baseY, 0.5, run, swW);
    }
  }

  _build() {
    const H = this.HALF;
    const rng = makeRNG(0xD057);
    const sand = 0xd8c79b, sand2 = 0xcdb887, sand3 = 0xc9b07e, crate = 0xb98a4e, roofC = 0xc2a878;

    // ground
    const g = new THREE.PlaneGeometry(H * 2 + 90, H * 2 + 90); g.rotateX(-Math.PI / 2);
    const gm = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xcdb487 }));
    gm.receiveShadow = true; this.scene.add(gm);

    // ground detail tiles
    const tb = new MeshBuilder();
    for (let i = 0; i < 170; i++) {
      const x = randRange(-H, H, rng), z = randRange(-H, H, rng), s = randRange(2, 6, rng);
      tb.box(s, 0.05, s, x, 0.03, z, shade(0xc2a878, randRange(-0.08, 0.05, rng)), { ry: randRange(0, TAU, rng) });
    }
    const tiles = new THREE.Mesh(tb.build(), voxelMaterial()); tiles.receiveShadow = true; this.scene.add(tiles);

    const wb = new MeshBuilder();   // sandstone structures
    const cb = new MeshBuilder();   // crates

    // perimeter walls
    const WH = 9;
    this._solid(wb, H * 2 + 4, WH, 2, 0, WH / 2, -H - 1, sand, { tint: 0.04 });
    this._solid(wb, H * 2 + 4, WH, 2, 0, WH / 2, H + 1, sand, { tint: 0.04 });
    this._solid(wb, 2, WH, H * 2 + 4, -H - 1, WH / 2, 0, sand, { tint: 0.04 });
    this._solid(wb, 2, WH, H * 2 + 4, H + 1, WH / 2, 0, sand, { tint: 0.04 });

    // === multi-story buildings (walkable interiors + stairs to the roof) ===
    this._building(wb, -34, -36, 16, 14, 2, sand2, 'S', roofC);  // HQ         (NW, 2 floors)
    this._building(wb,  36, -38, 12, 12, 3, sand,  'W', roofC);  // Watchtower (NE, 3 floors)
    this._building(wb,  42,  30, 18, 16, 2, sand2, 'W', roofC);  // Warehouse  (SE, 2 floors)
    this._building(wb, -40,  32, 14, 12, 2, sand,  'N', roofC);  // Barracks   (SW, 2 floors)
    this._building(wb,   0,  46, 18,  8, 1, sand3, 'N', roofC);  // Bunker     (S, roof)

    // === central plaza monument (cover) ===
    this._solid(wb, 7, 1.2, 7, 0, 0.6, 0, sand3, { tint: 0.04 });
    this._solid(wb, 2.4, 3.0, 2.4, 0, 1.5, 0, sand2, { tint: 0.04 });

    // === connecting low walls -> alleys & chokepoints ===
    this._wall(wb, -16, -12, 22, 3.2, 0, 'x', sand,  { width: 3.2 });
    this._wall(wb,  16,  14, 22, 3.2, 0, 'x', sand,  { width: 3.2 });
    this._wall(wb, -12,  -2, 18, 3.2, 0, 'z', sand2, { width: 3.2 });
    this._wall(wb,  14,   0, 18, 3.2, 0, 'z', sand2, { width: 3.2 });

    // === crate cover clusters ===
    const crateSpots = [
      [-14, -18, 3], [16, -14, 3], [-18, 16, 3], [18, 20, 3], [0, -24, 2], [0, 26, 2],
      [-26, 4, 2], [28, 2, 2], [-54, -8, 2], [54, -4, 2], [-10, 40, 2], [12, -46, 2],
      [-50, -52, 3], [50, 50, 3], [-54, 52, 2], [54, -54, 2], [-2, 58, 2], [58, 6, 2],
    ];
    for (const [cx, cz, n] of crateSpots) {
      for (let i = 0; i < n; i++) {
        const s = randRange(1.7, 2.5, rng);
        const x = cx + randRange(-3, 3, rng), z = cz + randRange(-3, 3, rng);
        this._solid(cb, s, s, s, x, s / 2, z, crate, { tint: 0.08, ry: randRange(-0.3, 0.3, rng) });
        if (chc(0.3)) this._solid(cb, s * 0.8, s * 0.8, s * 0.8, x, s + s * 0.4, z, shade(crate, 0.05), { tint: 0.08, ry: randRange(-0.4, 0.4, rng) });
      }
    }

    this.scene.add(this._mesh(wb)); this.scene.add(this._mesh(cb));

    // === intel poster on the Barracks east wall (T-90M weak-points), facing the plaza ===
    const posterTex = new THREE.TextureLoader().load('assets/poster-t90m-weakpoints.png');
    posterTex.colorSpace = THREE.SRGBColorSpace; posterTex.anisotropy = 4;
    const posterH = 1.44, posterW = posterH * (687 / 1024);   // image is 687×1024 (portrait); 40% of original (−60%)
    // Lambert (not Basic) so the poster is lit by the scene — bright in sun, dim/shaded
    // at dusk & night — and can receive shadows. alphaTest keeps it in the OPAQUE pass so
    // the depthTest:false viewmodel weapon (renderOrder 1000) still draws on top, and clips
    // the PNG's transparent edges. A faint emissive keeps it just-readable in deep dark.
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(posterW, posterH),
      new THREE.MeshLambertMaterial({ map: posterTex, alphaTest: 0.5, emissive: 0x0a0a0c, emissiveIntensity: 1 }));
    poster.position.set(-32.65, 2.4, 32);   // just off the barracks east face (x=-33, ±0.3 thick)
    poster.rotation.y = Math.PI / 2;          // normal → +x (toward map centre)
    poster.receiveShadow = true;
    this.scene.add(poster);

    // outer spawn ring
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU;
      this.spawns.push(new THREE.Vector3(Math.cos(a) * (H - 5), 0, Math.sin(a) * (H - 5)));
    }
    // lootbox anchors (open ground near landmarks)
    this.lootSpots = [
      new THREE.Vector3(0, 0, 16), new THREE.Vector3(-34, 0, -22), new THREE.Vector3(26, 0, -38),
      new THREE.Vector3(30, 0, 30), new THREE.Vector3(-40, 0, 24), new THREE.Vector3(0, 0, -34),
    ];
  }

  _mesh(builder) {
    if (builder.vertexCount === 0) return new THREE.Group();
    const m = new THREE.Mesh(builder.build(), voxelMaterial());
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  collide(pos, vel, r, h, dt) {
    let onGround = false;
    // vertical
    pos.y += vel.y * dt;
    if (pos.y <= 0) { pos.y = 0; if (vel.y < 0) vel.y = 0; onGround = true; }
    for (const b of this.boxes) {
      if (pos.x + r <= b.min.x || pos.x - r >= b.max.x) continue;
      if (pos.z + r <= b.min.z || pos.z - r >= b.max.z) continue;
      const feet = pos.y, head = pos.y + h;
      if (head <= b.min.y || feet >= b.max.y) continue;
      const penTop = b.max.y - feet, penBot = head - b.min.y;
      if (penTop < penBot && vel.y <= 0.01) { pos.y = b.max.y; vel.y = 0; onGround = true; }
      else if (vel.y > 0) { pos.y = b.min.y - h; vel.y = 0; }
    }
    // horizontal (with step-up: stairs / ledges up to ~0.6m are climbable)
    this._moveAxis(pos, vel, r, h, 'x', vel.x * dt);
    this._moveAxis(pos, vel, r, h, 'z', vel.z * dt);
    const lim = this.HALF - r;
    pos.x = clamp(pos.x, -lim, lim); pos.z = clamp(pos.z, -lim, lim);
    return onGround;
  }

  // Is the player's body column free of boxes if its feet were at feetY here?
  _headClear(pos, r, h, feetY, ignore) {
    for (const b of this.boxes) {
      if (b === ignore) continue;
      if (pos.x + r <= b.min.x || pos.x - r >= b.max.x) continue;
      if (pos.z + r <= b.min.z || pos.z - r >= b.max.z) continue;
      if (feetY + h <= b.min.y || feetY >= b.max.y) continue;
      return false;
    }
    return true;
  }

  _moveAxis(pos, vel, r, h, ax, delta) {
    pos[ax] += delta;
    for (const b of this.boxes) {
      const feet = pos.y, head = pos.y + h;
      if (head <= b.min.y + 0.02 || feet >= b.max.y - 0.02) continue;
      if (pos.x + r <= b.min.x || pos.x - r >= b.max.x) continue;
      if (pos.z + r <= b.min.z || pos.z - r >= b.max.z) continue;
      // step-up: climb low ledges/stairs instead of blocking
      const step = b.max.y - pos.y;
      if (step > 0.02 && step <= 0.62 && this._headClear(pos, r, h, b.max.y + 0.002, b)) { pos.y = b.max.y + 0.002; continue; }
      if (ax === 'x') { if (vel.x > 0) pos.x = b.min.x - r; else if (vel.x < 0) pos.x = b.max.x + r; else pos.x = pos.x < (b.min.x + b.max.x) / 2 ? b.min.x - r : b.max.x + r; vel.x = 0; }
      else { if (vel.z > 0) pos.z = b.min.z - r; else if (vel.z < 0) pos.z = b.max.z + r; else pos.z = pos.z < (b.min.z + b.max.z) / 2 ? b.min.z - r : b.max.z + r; vel.z = 0; }
    }
  }

  rayHit(origin, dir, maxDist) {
    let best = maxDist, hitBox = null;
    for (const b of this.boxes) {
      const t = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, b.min, b.max);
      if (t !== null && t < best) { best = t; hitBox = b; }
    }
    if (dir.y < -1e-6) { const tg = -origin.y / dir.y; if (tg > 0 && tg < best) { best = tg; hitBox = 'ground'; } }
    if (best >= maxDist) return null;
    const point = new THREE.Vector3(origin.x + dir.x * best, origin.y + dir.y * best, origin.z + dir.z * best);
    const normal = new THREE.Vector3(0, 1, 0);
    if (hitBox && hitBox !== 'ground') {
      const ex = Math.min(Math.abs(point.x - hitBox.min.x), Math.abs(point.x - hitBox.max.x));
      const ey = Math.min(Math.abs(point.y - hitBox.min.y), Math.abs(point.y - hitBox.max.y));
      const ez = Math.min(Math.abs(point.z - hitBox.min.z), Math.abs(point.z - hitBox.max.z));
      if (ex <= ey && ex <= ez) normal.set(point.x < (hitBox.min.x + hitBox.max.x) / 2 ? -1 : 1, 0, 0);
      else if (ey <= ez) normal.set(0, point.y < (hitBox.min.y + hitBox.max.y) / 2 ? -1 : 1, 0);
      else normal.set(0, 0, point.z < (hitBox.min.z + hitBox.max.z) / 2 ? -1 : 1);
    }
    return { dist: best, point, normal };
  }

  addWreckObstacle(pos, yaw) {
    const hw = 2.0, hl = 3.6, h = 1.6;
    this.boxes.push({ min: new THREE.Vector3(pos.x - hw, 0, pos.z - hl), max: new THREE.Vector3(pos.x + hw, h, pos.z + hl), wreck: true });
  }
  clearWrecks() { this.boxes = this.boxes.filter(b => !b.wreck); }
}

// ---------------------------------------------------------------------------
// Enemy + EnemyManager
// ---------------------------------------------------------------------------
class Enemy {
  constructor(geo, geoKey) {
    this.mesh = new THREE.Mesh(geo, voxelMaterial());
    this.mesh.castShadow = true;
    this.geoKey = geoKey;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.alive = false;
    this.bob = rr(0, TAU);
  }
  spawn(typeKey, def, col, name, pos, hp, speed) {
    this.type = typeKey; this.def = def; this.col = col; this.name = name;
    this.pos.copy(pos); this.vel.set(0, 0, 0);
    this.hp = this.maxHp = hp; this.speed = speed;
    this.scale = def.scale; this.radius = 0.55 * def.scale; this.height = 2.2 * def.scale;
    this.headY = 1.18 * def.scale;
    this.alive = true; this.attackCD = rr(0.3, 0.9); this.growlCD = rr(2, 6); this.squash = 0;
    this.stuck = 0; this._px = pos.x; this._pz = pos.z;
    this.isElite = false; // cleared on every (re)spawn so pooled enemies don't keep a stale mini-boss flag
    this.isTank = !!def.tank; // authoritative reset: true for tank type, false for all others
    this.courier = false; if (this._pack) this._pack.visible = false; // backpack courier flag/mesh reset
    // boss state
    this.phase = 1; this.laserCD = 3.2; this.charging = 0; this.addCD = 0; this.beamLife = 0;
    this.aim = new THREE.Vector3();
    if (this.mesh.material && this.mesh.material.emissive) { this.mesh.material.emissive.setHex(0x000000); this.mesh.material.emissiveIntensity = 1; }
    this.mesh.visible = true; this.mesh.scale.setScalar(def.scale); this.mesh.position.copy(pos);
    if (def.tank) {
      this.radius = 2.6; this.height = 3.0; this.headY = 2.4;       // big hull; cupola = head zone
      this.armorHP = this.armorHPmax = hp;                          // hp arg = armorHP; _spawnBoss rescales after
      this.mitriHP = this.mitriHPmax = def.mitriHP;
      this.vulnerable = false; this.windowT = 6; this.exposeT = 0;  // Mitri pop-out window cycle (Task 11)
      this.hullYaw = 0; this.turYaw = 0; this.gunPitch = 0;          // rig angles (Tasks 7/8)
      this.cannonCD = 4; this.charge = 0; this.mgAmmo = 250; this.mgReload = 0; this.recoil = 0;
      this.ramCD = 0; this.stuckRecover = 0; this.stuck = 0; this.eraSpent = {}; // ERA per-zone consumed flags (Task 13)
      this.captured = false; this.entering = false;
    }
  }
}

// ── Tank rig animator — call every frame for boss and captured tank ───────────
// Spins road wheels + sprockets proportional to speed, adds subtle suspension
// bob (rotation.x / rotation.z only — never touches rotation.y which is hull yaw),
// and applies barrel recoil display.
// Wheel spin axis: CylinderGeometry default axis = Y; after rx:PI/2 in MeshBuilder
// the cylinder lies flat, so its rolling axis in local space becomes Z.
function animateTank(group, dt, speed, recoil) {
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

function tankGroundFX(group, game, dt, speed, enraged) {
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
function updateTankLights(group, game) {
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

class EnemyManager {
  constructor(game) {
    this.game = game; this.world = game.world;
    this.geos = {}; // geoKey -> geometry
    this.pool = {};  // geoKey -> Enemy[]
    this.active = []; this._idc = 0;
    this._min = new THREE.Vector3(); this._max = new THREE.Vector3();
  }
  _geo(key, col, variant) { return this.geos[key] || (this.geos[key] = buildEngendro(col, variant)); }
  _get(geoKey, col, variant) {
    const list = (this.pool[geoKey] ||= []);
    let e = list.find((x) => !x.alive);
    if (!e) { e = new Enemy(this._geo(geoKey, col, variant), geoKey); this.game.engine.scene.add(e.mesh); list.push(e); }
    return e;
  }
  spawn(typeKey, pos, hp, speed) {
    const def = ENEMY_TYPES[typeKey];
    let col, variant = def.variant, geoKey, name;
    if (typeKey === 'boss') { col = { body: 0xede7df, name: 'Tolo' }; geoKey = 'boss'; name = 'BOSS TOLO'; }
    else if (typeKey === 'minitolo') { col = { body: 0xede7df, name: 'mini Tolo' }; geoKey = 'tolomini'; name = 'mini Tolo'; }
    else if (typeKey === 'exploder') { col = ENGENDRO_COLORS[5]; geoKey = 'exploder'; name = 'Mitri'; }
    else if (typeKey === 'charger') { col = { body: 0x8a2b2b, name: 'Boomer' }; geoKey = 'charger'; name = 'Boomer'; }
    else if (typeKey === 'tank') { col = { body: 0xc9b48a, name: 'Mitri' }; geoKey = 'tank'; name = 'T-90M «MITRI»'; }
    else { col = pick(ENGENDRO_COLORS); geoKey = 'c' + col.body; name = col.name; }
    const e = this._get(geoKey, col, variant);
    if (typeKey === 'tank') {
      if (!e.tankGroup) {
        if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh); // drop the unused engendro mesh from the scene
        e.tankGroup = buildTank('desert'); this.game.engine.scene.add(e.tankGroup);
      }
      e.mesh = e.tankGroup; e.isTank = true;
    }
    e.spawn(typeKey, def, col, name, pos, hp, speed);
    e.id = ++this._idc;
    this.active.push(e);
    this.game.audio.enemyGrowl();
    if (this.game.mp) this.game.mp.onEnemySpawn(e);
    return e;
  }
  // CLIENT-side: build a non-AI replica enemy from a host snapshot (id from the host).
  spawnGhost(id, typeKey, geoKey, colBody, variant, name, scale) {
    const def = ENEMY_TYPES[typeKey] || ENEMY_TYPES.grunt;
    const col = { body: colBody, name: name };
    const e = this._get(geoKey, col, variant);
    e.spawn(typeKey, def, col, name, new THREE.Vector3(0, 0, 0), def.hp, def.speed);
    e.id = id; e._ghost = true;
    this.active.push(e);
    return e;
  }
  // Mark an enemy as a rare "backpack courier" — glows + wears a pack; drops a radio on death.
  makeCourier(e) {
    e.courier = true;
    if (!e._pack) {
      const pb = new MeshBuilder();
      pb.box(0.5, 0.6, 0.34, 0, 0, 0, 0x3a4a2c, { tint: 0.05 });   // canvas pack body
      pb.box(0.54, 0.16, 0.42, 0, 0.18, 0, 0x8a6a2a);              // top flap
      pb.box(0.08, 0.52, 0.06, -0.16, 0, -0.2, 0x1c1a14);          // strap L
      pb.box(0.08, 0.52, 0.06, 0.16, 0, -0.2, 0x1c1a14);           // strap R
      pb.box(0.12, 0.16, 0.1, 0.0, 0.12, 0.2, 0xffcf5c);           // glinting buckle
      e._pack = new THREE.Mesh(pb.build(), voxelMaterial({ emissive: 0x1a3a10, emissiveIntensity: 0.7 }));
      e._pack.position.set(0, 1.05, 0.34); // on the back
      e.mesh.add(e._pack);
    }
    e._pack.visible = true;
    if (e.mesh.material.emissive) { e.mesh.material.emissive.setHex(0x123a14); e.mesh.material.emissiveIntensity = 0.55; } // teal glow so you spot it
  }
  get aliveCount() { return this.active.length; }

  update(dt) {
    const pp = this.game.player.pos;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (!e.alive) { this.active.splice(i, 1); continue; }
      if (e.isTank) { this._bossTank(e, dt); continue; }
      let tgt = pp, tgtId = 'host'; const _mp = this.game.mp; if (_mp && _mp.active && _mp.isHost) { const _np = _mp.nearestPlayer(e.pos.x, e.pos.z); if (_np) { tgt = _np.pos; tgtId = _np.id; } } e._tgtId = tgtId;
      let dx = tgt.x - e.pos.x, dz = tgt.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 1; dx /= dist; dz /= dist;

      // separation
      let sx = 0, sz = 0;
      for (const o of this.active) {
        if (o === e || !o.alive) continue;
        const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, d2 = ox * ox + oz * oz;
        if (d2 < 2.6 && d2 > 1e-4) { const inv = 1 / Math.sqrt(d2); sx += ox * inv; sz += oz * inv; }
      }
      // crate avoidance
      let ax = 0, az = 0;
      for (const b of this.world.boxes) {
        if (b.max.y < 0.6) continue;
        const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
        const rx = e.pos.x - cx, rz = e.pos.z - cz;
        const hx = (b.max.x - b.min.x) / 2 + 1.3, hz = (b.max.z - b.min.z) / 2 + 1.3;
        if (Math.abs(rx) < hx && Math.abs(rz) < hz) { const inv = 1 / (Math.hypot(rx, rz) || 1); ax += rx * inv * 1.5; az += rz * inv * 1.5; }
      }
      // stuck-buster: if barely moving while not adjacent, beeline straight at the player (frees building corners)
      const moved = Math.hypot(e.pos.x - e._px, e.pos.z - e._pz); e._px = e.pos.x; e._pz = e.pos.z;
      if (dist > e.radius + this.game.player.radius + 0.8 && moved < e.speed * dt * 0.35) e.stuck += dt;
      else e.stuck = Math.max(0, e.stuck - dt * 0.6);
      const beeline = e.stuck > 1.6;
      const wx = beeline ? dx : dx + sx * 0.6 + ax, wz = beeline ? dz : dz + sz * 0.6 + az, wl = Math.hypot(wx, wz) || 1;
      const spd = e.speed * (e.squash > 0 ? 0.3 : 1);
      e.vel.x = (wx / wl) * spd; e.vel.z = (wz / wl) * spd;
      e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt; e.pos.y = 0;
      const lim = this.world.HALF - e.radius;
      e.pos.x = clamp(e.pos.x, -lim, lim); e.pos.z = clamp(e.pos.z, -lim, lim);
      for (const b of this.world.boxes) {
        if (b.max.y < 0.6) continue;
        if (e.pos.x + e.radius <= b.min.x || e.pos.x - e.radius >= b.max.x) continue;
        if (e.pos.z + e.radius <= b.min.z || e.pos.z - e.radius >= b.max.z) continue;
        const px = Math.min(b.max.x + e.radius - e.pos.x, e.pos.x - (b.min.x - e.radius));
        const pz = Math.min(b.max.z + e.radius - e.pos.z, e.pos.z - (b.min.z - e.radius));
        if (px < pz) e.pos.x += (e.pos.x < (b.min.x + b.max.x) / 2 ? -px : px);
        else e.pos.z += (e.pos.z < (b.min.z + b.max.z) / 2 ? -pz : pz);
      }

      // attack
      e.attackCD -= dt;
      if (dist < e.radius + this.game.player.radius + 0.6 && e.attackCD <= 0) {
        if (e.def.charger) { this.damage(e, e.hp + 1, 'contact'); continue; } // kamikaze: detonate on contact
        e.attackCD = 1.0; e.squash = 0.18; this.game._hurtTarget(e._tgtId || 'host', e.def.dmg);
      }
      e.growlCD -= dt;
      if (e.growlCD <= 0) { e.growlCD = rr(3, 8); if (dist < 32) this.game.audio.enemyGrowl(); }

      // anim
      e.bob += dt * (6 + spd);
      if (e.squash > 0) e.squash -= dt;
      const sq = e.squash > 0 ? 1 - e.squash * 1.6 : 1;
      e.mesh.position.set(e.pos.x, Math.abs(Math.sin(e.bob)) * 0.08, e.pos.z);
      e.mesh.rotation.y = Math.atan2(dx, dz);
      e.mesh.rotation.z = Math.sin(e.bob) * 0.08;
      e.mesh.scale.set(e.scale, e.scale * sq, e.scale);

      // mini-boss elites borrow the boss bar (no laser / no phase-2)
      if (e.isElite) this.game.hud.setBoss(e.hp / e.maxHp, e.name);
      if (e.def.boss) this._bossTolo(e, dt);
    }
    if (this._aimRing && this._aimRingT > 0) { this._aimRingT -= dt; this._aimRing.material.opacity = Math.max(0, this._aimRingT) * 1.05; }
    if (this.shells) for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i]; s.fuse -= dt; s.vel.y -= s.grav * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const p = s.mesh.position; let boom = p.y < 0.2 || s.fuse <= 0;
      if (!boom) { const dp = Math.hypot(p.x - this.game.player.pos.x, p.z - this.game.player.pos.z); if (dp < 1.5) boom = true; }
      if (!boom) { const wh = this.world.rayHit(p, this._downV || (this._downV = new THREE.Vector3(0, -1, 0)), 0.4); if (wh) boom = true; }
      if (boom) {
        this.game.effects.explosion(p.clone(), s.radius);
        const pl = this.game.player, dp = Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z);
        if (dp < s.radius) pl.hurt(s.dmg * (1 - dp / s.radius));
        const ct = this.game.capturedTank;
        if (ct && ct.hp > 0) { const cd = Math.hypot(p.x - ct.pos.x, p.z - ct.pos.z); if (cd < s.radius) ct.hurt(s.dmg * (1 - cd / s.radius)); }
        if (this.game.engine.shake) this.game.engine.shake(0.4);
        this.game.engine.scene.remove(s.mesh); this.shells.splice(i, 1);
      } else if (p.y < -5) { this.game.engine.scene.remove(s.mesh); this.shells.splice(i, 1); }
    }
    // ── Lingering wreck smoke (Task 26) ────────────────────────────────────────
    const _eff = this.game.effects;
    for (let wi = _tankWrecks.length - 1; wi >= 0; wi--) {
      const wr = _tankWrecks[wi];
      wr.t += dt;
      if (wr.t >= 18) continue; // stop emitting; wreck mesh stays as permanent scenery
      // Thinning: full rate for first 6 s, then linear taper to 0 at 18 s
      const intensity = wr.t < 6 ? 1.0 : Math.max(0, 1 - (wr.t - 6) / 12);
      const interval  = 0.4 + (1 - intensity) * 0.8; // 0.4 s dense → 1.2 s sparse
      wr._smokeAccum += dt;
      if (wr._smokeAccum >= interval) {
        wr._smokeAccum -= interval;
        // Emit one grey smoke puff using effects._spawn (same API as engine smoke)
        _eff._spawn({
          pos: new THREE.Vector3(
            wr.pos.x + (Math.random() - 0.5) * 1.2,
            1.8 + Math.random() * 0.6,
            wr.pos.z + (Math.random() - 0.5) * 1.2,
          ),
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 0.4,
            0.9 + Math.random() * 0.6,
            (Math.random() - 0.5) * 0.4,
          ),
          life:  (1.4 + Math.random() * 1.0) * (0.5 + 0.5 * intensity),
          size:  (0.35 + Math.random() * 0.25) * (0.4 + 0.6 * intensity),
          grav:  0.2,
          drag:  0.6,
          color: new THREE.Color(0x444038),
          bounce: 0,
          floorY: -999,
          bloom: true,
        });
      }
    }
  }

  // Boss laser: a thick red beam from the belly target along the locked aim; hits the player if near the line.
  _bossLaser(e) {
    const belly = new THREE.Vector3(e.pos.x, e.pos.y + 1.2 * e.scale, e.pos.z + 0.4 * e.scale);
    const dir = e.aim, len = 70;
    const end = belly.clone().addScaledVector(dir, len);
    if (!e._beam) {
      e._beam = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff2436, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      e._beam.renderOrder = 998; this.game.engine.scene.add(e._beam);
    }
    e._beam.visible = true; e._beam.material.opacity = 1; e.beamLife = 0.18;
    e._beam.position.copy(belly).add(end).multiplyScalar(0.5);
    e._beam.scale.set(0.4, 0.4, len); e._beam.lookAt(end);
    this.game.effects.muzzleFlash(belly, dir, 2.6);
    this.game.audio.tone(1300, 0.08, 'square', 0.35); this.game.audio.noise(0.16, 0.35, 'highpass', 1400, 0.8);
    const p = this.game.player.pos;
    const t = clamp((p.x - belly.x) * dir.x + (p.y + 1.0 - belly.y) * dir.y + (p.z - belly.z) * dir.z, 0, len);
    const dl = Math.hypot(p.x - (belly.x + dir.x * t), p.y + 1.0 - (belly.y + dir.y * t), p.z - (belly.z + dir.z * t));
    if (dl < 1.7) this.game.player.hurt(e.phase === 2 ? 26 : 18);
    // Route laser damage to captured tank
    const ct = this.game.capturedTank;
    if (ct && ct.hp > 0) {
      const t2 = clamp((ct.pos.x - belly.x) * dir.x + (1.0) * dir.y + (ct.pos.z - belly.z) * dir.z, 0, len);
      const dl2 = Math.hypot(ct.pos.x - (belly.x + dir.x * t2), (belly.y + dir.y * t2) - 1.5, ct.pos.z - (belly.z + dir.z * t2));
      if (dl2 < 2.2) ct.hurt(e.phase === 2 ? 40 : 28);
    }
  }

  _bossTolo(e, dt) {
    const pp = this.game.player.pos;
    this.game.hud.setBoss(e.hp / e.maxHp, e.name);
    if (e.phase === 1 && e.hp <= e.maxHp * 0.5) { e.phase = 2; e.addCD = 0.6; this.game.hud.bigMessage('TOLO ENRAGED', 'he summons mini-Tolos!'); }
    // laser cannon charging up out of the belly target, then firing
    if (e.charging > 0) {
      e.charging -= dt;
      if (e.mesh.material.emissive) { e.mesh.material.emissive.setHex(0xff2010); e.mesh.material.emissiveIntensity = 1.3 * (1 - e.charging / 0.85); }
      if (e.charging <= 0) this._bossLaser(e);
    } else {
      if (e.mesh.material.emissiveIntensity > 0.02) e.mesh.material.emissiveIntensity *= 0.85;
      e.laserCD -= dt;
      if (e.laserCD <= 0) {
        e.laserCD = e.phase === 2 ? 2.6 : 3.8; e.charging = 0.85;
        e.aim.set(pp.x - e.pos.x, (pp.y + 1.0) - (e.pos.y + 1.2 * e.scale), pp.z - e.pos.z).normalize();
      }
    }
    if (e.beamLife > 0 && e._beam) { e.beamLife -= dt; e._beam.material.opacity = Math.max(0, e.beamLife / 0.18); if (e.beamLife <= 0) e._beam.visible = false; }
    // phase 2: keep summoning small fast mini-Tolos around himself
    if (e.phase === 2) {
      e.addCD -= dt;
      if (e.addCD <= 0 && this.active.length < 18) {
        e.addCD = 6;
        for (let k = 0; k < 3; k++) { const a = rr(0, TAU); this.spawn('minitolo', { x: e.pos.x + Math.cos(a) * 3.5, y: 0, z: e.pos.z + Math.sin(a) * 3.5 }, ENEMY_TYPES.minitolo.hp, ENEMY_TYPES.minitolo.speed); }
      }
    }
  }

  _bossTank(e, dt) {
    const pp = this.game.player.pos;

    // Task 14: entrance steering — redirect steering goal to arena center until close enough
    if (e.entering) {
      const gd = Math.hypot(e.entryTarget.x - e.pos.x, e.entryTarget.z - e.pos.z);
      if (gd < 8) e.entering = false;
    }
    const goal = e.entering ? e.entryTarget : pp;

    const toPlayer = new THREE.Vector3(pp.x - e.pos.x, 0, pp.z - e.pos.z);
    const dist = toPlayer.length() || 1;                     // always dist-to-player (for combat range checks)
    const toGoal = new THREE.Vector3(goal.x - e.pos.x, 0, goal.z - e.pos.z).normalize();
    let desired = Math.atan2(toGoal.x, toGoal.z);            // heading toward goal

    // whisker rays for obstacle avoidance (around buildings)
    const probe = (ang) => {
      const d = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
      const o = new THREE.Vector3(e.pos.x, 0.8, e.pos.z);
      const h = this.world.rayHit(o, d, e.radius + 4.5);    // hull + standoff (incl. barrel reach)
      return h ? h.dist : 999;
    };
    const cF = probe(e.hullYaw), cL = probe(e.hullYaw - 0.6), cR = probe(e.hullYaw + 0.6);
    if (cF < e.radius + 3) desired = e.hullYaw + (cL >= cR ? -0.9 : 0.9); // steer to clearer flank

    // stuck detection + reverse recovery
    const moved = Math.hypot(e.pos.x - e._px, e.pos.z - e._pz); e._px = e.pos.x; e._pz = e.pos.z;
    if (e.stuckRecover > 0) { e.stuckRecover -= dt; desired = e.hullYaw + Math.PI; } // back out
    else {
      if (moved < 0.4 * 1.2 * dt && dist > e.radius + 2) e.stuck += dt; else e.stuck = Math.max(0, e.stuck - dt);
      if (e.stuck > 1.2) { e.stuckRecover = 0.8; e.stuck = 0; }
    }

    // slow hull turn toward desired (tank-like)
    let dY = ((desired - e.hullYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const turn = Math.min(Math.abs(dY), (45 * Math.PI / 180) * dt) * Math.sign(dY);
    e.hullYaw += turn;

    // forward drive (slower while turning hard; reverse during recovery)
    const enraged = e.armorHP <= e.armorHPmax * 0.4;
    const baseSpd = enraged ? 1.5 : 1.2;
    const spd = (Math.abs(dY) > 1.0 ? 0 : baseSpd) * (e.stuckRecover > 0 ? -1 : 1);
    const fwd = new THREE.Vector3(Math.sin(e.hullYaw), 0, Math.cos(e.hullYaw));
    e.pos.x += fwd.x * spd * dt; e.pos.z += fwd.z * spd * dt; e.pos.y = 0;
    const lim = this.world.HALF - e.radius; e.pos.x = clamp(e.pos.x, -lim, lim); e.pos.z = clamp(e.pos.z, -lim, lim);

    // hard collide vs building boxes (large circle, ground-only — no step-up)
    for (const b of this.world.boxes) {
      if (b.max.y < 0.6) continue;
      if (e.pos.x + e.radius <= b.min.x || e.pos.x - e.radius >= b.max.x) continue;
      if (e.pos.z + e.radius <= b.min.z || e.pos.z - e.radius >= b.max.z) continue;
      const px = Math.min(b.max.x + e.radius - e.pos.x, e.pos.x - (b.min.x - e.radius));
      const pz = Math.min(b.max.z + e.radius - e.pos.z, e.pos.z - (b.min.z - e.radius));
      if (px < pz) e.pos.x += (e.pos.x < (b.min.x + b.max.x) / 2 ? -px : px);
      else e.pos.z += (e.pos.z < (b.min.z + b.max.z) / 2 ? -pz : pz);
    }

    // Task 14: engine rumble — low cadence idle/drive rumble
    e._engT = (e._engT || 0) - dt;
    if (e._engT <= 0) { e._engT = 0.28; this.game.audio.tone(42, 0.26, 'sawtooth', 0.05 + (Math.abs(spd) > 0.1 ? 0.04 : 0)); }

    // apply transform + boss bar
    e.mesh.position.set(e.pos.x, 0, e.pos.z);
    e.mesh.rotation.y = e.hullYaw;
    e._lastSpd = spd;
    this.game.hud.setBoss(e.armorHP / e.armorHPmax, e.name);
    this._tankCombat(e, dt, pp, dist); // attacks added in later tasks
    animateTank(e.mesh, dt, e._lastSpd, e.recoil || 0);
    const _bossEnraged = e.armorHP <= e.armorHPmax * 0.4;
    tankGroundFX(e.mesh, this.game, dt, e._lastSpd, _bossEnraged);
  }
  _tankCombat(e, dt, pp, dist) {
    const enraged = e.armorHP <= e.armorHPmax * 0.4;
    // turret slowly tracks the player (independent of hull)
    const want = Math.atan2(pp.x - e.pos.x, pp.z - e.pos.z);
    let dT = ((want - e.turYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    e.turYaw += Math.min(Math.abs(dT), (enraged ? 40 : 28) * Math.PI / 180 * dt) * Math.sign(dT);
    if (e.mesh.userData.turret) e.mesh.userData.turret.rotation.y = e.turYaw - e.hullYaw; // turret is child of hull-rotated root
    // Task 14: servo whir when turret is slewing
    e._servoT = (e._servoT || 0) - dt;
    if (Math.abs(dT) > 0.05 && e._servoT <= 0) { e._servoT = 0.18; this.game.audio.tone(220, 0.12, 'square', 0.03); }
    // gun elevation toward player height
    const muzzleY = e.pos.y + 2.4, wantPitch = Math.atan2((pp.y + 1) - muzzleY, dist);
    e.gunPitch += clamp(wantPitch - e.gunPitch, -30 * Math.PI / 180 * dt, 30 * Math.PI / 180 * dt);
    if (e.mesh.userData.gunMantlet) e.mesh.userData.gunMantlet.rotation.x = -e.gunPitch;
    // recoil recover (node position set by animateTank each frame)
    if (e.recoil > 0) e.recoil = Math.max(0, e.recoil - dt * 2);

    // cannon: only with LOS + roughly on target
    e.cannonCD -= dt;
    const muzzle = this._tankMuzzle(e);
    const aimErr = Math.abs(dT);
    const losClear = !this._blocked(muzzle, pp, dist);
    if (e.charge > 0) {
      e.charge -= dt;
      if (e.charge <= 0) this._tankFireCannon(e, muzzle, pp);
    } else if (e.cannonCD <= 0 && aimErr < 0.12 && losClear && dist < 90 && !e.entering) {
      e.cannonCD = enraged ? 5 : 7;          // reload
      e.charge = 0.8;                          // telegraph
      this._tankAimMarker(e, pp.clone());      // ground marker ~0.8s before impact
      this.game.audio.tone(60, 0.2, 'sawtooth', 0.2);
    }
    this._tankMG(e, dt, pp, dist, losClear);   // Task 9
    this._tankRam(e, dt, pp, dist);            // Task 10
    this._tankWindow(e, dt);                   // Task 11
    if (enraged) this._tankSmokeScreen(e, dt); // Task 25: phase-2 smoke screen
    // proximity rumble
    if (dist < 18 && this.game.engine.shake) this.game.engine.shake((18 - dist) / 18 * 0.12);
  }
  _tankSmokeScreen(e, dt) {
    e.smokeCD = (e.smokeCD == null ? 0 : e.smokeCD) - dt;
    if (e.smokeCD > 0) return;
    e.smokeCD = 12; // fire smoke launchers every 12 s in phase 2

    // subtle hiss tone
    this.game.audio.tone(900, 0.12, 'sine', 0.08);

    const hullYaw = e.hullYaw || 0;
    const fwd = new THREE.Vector3(Math.sin(hullYaw), 0, Math.cos(hullYaw));
    const right = new THREE.Vector3(Math.cos(hullYaw), 0, -Math.sin(hullYaw));
    const efx = this.game.effects;
    const smokeC1 = new THREE.Color(0x8a8a82);
    const smokeC2 = new THREE.Color(0x6a6a62);

    // arc of ~25 dense smoke puffs in a fan forward of the tank
    const puffCount = 25;
    for (let i = 0; i < puffCount; i++) {
      const t = (i / (puffCount - 1)) - 0.5; // -0.5 .. 0.5
      // spread the puffs across a ~70° arc and 4-10 m forward
      const angle = t * (Math.PI / 2.6); // ±35°
      const dist2 = randRange(3, 10);
      const dx = (fwd.x * Math.cos(angle) + right.x * Math.sin(angle)) * dist2;
      const dz = (fwd.z * Math.cos(angle) + right.z * Math.sin(angle)) * dist2;
      const puffPos = new THREE.Vector3(
        e.pos.x + dx + randRange(-0.4, 0.4),
        randRange(0.3, 1.4),
        e.pos.z + dz + randRange(-0.4, 0.4)
      );
      efx._spawn({
        pos: puffPos,
        vel: new THREE.Vector3(randRange(-0.3, 0.3), randRange(0.2, 0.6), randRange(-0.3, 0.3)),
        life: randRange(5, 9), size: randRange(1.2, 2.2),
        grav: 0.15, drag: 0.35,
        color: (Math.random() < 0.5 ? smokeC1 : smokeC2).clone(),
        bounce: 0, floorY: -999, bloom: true,
      });
    }
  }
  _tankMuzzle(e) {
    const m = e.mesh.userData.muzzle;
    if (m) { e.mesh.updateMatrixWorld(); return m.getWorldPosition(new THREE.Vector3()); }
    return new THREE.Vector3(e.pos.x, 2.4, e.pos.z);
  }
  _blocked(a, b, dist) {
    const d = new THREE.Vector3(b.x - a.x, (b.y + 1) - a.y, b.z - a.z).normalize();
    const h = this.world.rayHit(a, d, dist);
    return !!h;
  }
  _tankFireCannon(e, muzzle, pp) {
    const fdir = new THREE.Vector3(Math.sin(e.turYaw), 0, Math.cos(e.turYaw));
    if (this.world.rayHit(muzzle, fdir, 3)) { e.cannonCD = 1.0; return; }   // muzzle jammed → retry soon
    const dir = new THREE.Vector3(pp.x - muzzle.x, (pp.y + 0.6) - muzzle.y, pp.z - muzzle.z).normalize();
    this.shells = this.shells || [];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.7), new THREE.MeshBasicMaterial({ color: 0xffd070 }));
    mesh.position.copy(muzzle); this.game.engine.scene.add(mesh);
    this.shells.push({ mesh, vel: dir.multiplyScalar(48), grav: 9, fuse: 4, dmg: 48, radius: 6 });
    e.recoil = 0.5;
    this.game.effects.muzzleFlash(muzzle, dir, 2.4);
    this.game.audio.gunshot({ body: 55, crack: 0.3, vol: 1.0, hp: 400, bp: 120 });
  }
  _tankAimMarker(e, target) {
    if (!this._aimRing) {
      const g = new THREE.RingGeometry(1.2, 1.7, 20);
      this._aimRing = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.0, depthWrite: false, fog: false }));
      this._aimRing.rotation.x = -Math.PI / 2; this._aimRing.renderOrder = 990; this.game.engine.scene.add(this._aimRing);
    }
    this._aimRing.position.set(target.x, 0.06, target.z); this._aimRing.material.opacity = 0.85; this._aimRingT = 0.8;
  }
  // empty stubs (filled by later tasks) so _tankCombat doesn't throw:
  _tankMG(e, dt, pp, dist, losClear) {
    if (e.mgReload > 0) { e.mgReload -= dt; return; }
    e._mgCD = (e._mgCD || 0) - dt;
    const arc = Math.abs(((Math.atan2(pp.x - e.pos.x, pp.z - e.pos.z) - e.turYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (dist < 22 && losClear && arc < 0.4) {
      if (e._mgCD <= 0) {
        e._mgCD = 0.09; e.mgAmmo--;
        const o = e.mesh.userData.mgMuzzle ? e.mesh.userData.mgMuzzle.getWorldPosition(new THREE.Vector3()) : this._tankMuzzle(e);
        const jit = 0.04;
        const dir = new THREE.Vector3(pp.x - o.x + rr(-jit, jit), (pp.y + 1) - o.y, pp.z - o.z + rr(-jit, jit)).normalize();
        const wHit = this.world.rayHit(o, dir, 30);
        const end = o.clone().addScaledVector(dir, wHit ? wHit.dist : 30);
        this.game.effects.tracer(o, end, 0xfff1a0);
        const pl = this.game.player;
        const t = clamp((pl.pos.x - o.x) * dir.x + (pl.pos.y + 1 - o.y) * dir.y + (pl.pos.z - o.z) * dir.z, 0, 30);
        const dl = Math.hypot(pl.pos.x - (o.x + dir.x * t), pl.pos.y + 1 - (o.y + dir.y * t), pl.pos.z - (o.z + dir.z * t));
        if (dl < 1.0 && (!wHit || t < wHit.dist)) pl.hurt(6);
        this.game.audio.tone(180, 0.03, 'square', 0.12);
        if (e.mgAmmo <= 0) { e.mgReload = 3.5; e.mgAmmo = 250; this.game.audio.tone(80, 0.2, 'square', 0.2); }
      }
    }
  }
  _tankRam(e, dt, pp, dist) {
    e.ramCD -= dt;
    const fwd = new THREE.Vector3(Math.sin(e.hullYaw), 0, Math.cos(e.hullYaw));
    const toP = new THREE.Vector3(pp.x - e.pos.x, 0, pp.z - e.pos.z); const L = toP.length() || 1; toP.multiplyScalar(1 / L);
    if (dist < 4 && fwd.dot(toP) > 0.6 && e.ramCD <= 0) {
      e.ramCD = 2.5;
      this.game.player.hurt(40);
      if (this.game.player.vel) { this.game.player.vel.x += toP.x * 6; this.game.player.vel.z += toP.z * 6; } // knockback
      if (this.game.engine.shake) this.game.engine.shake(0.35);
      this.game.audio.tone(70, 0.15, 'sawtooth', 0.3);
    }
  }
  _tankWindow(e, dt) {
    const enraged = e.armorHP <= e.armorHPmax * 0.4;
    const cycle = enraged ? 9 : 12, expose = 4;
    e.windowT -= dt;
    if (!e.vulnerable && e.windowT <= 0) {
      e.vulnerable = true; e.exposeT = expose;
      this.game.audio.tone(300, 0.08, 'square', 0.25);
      this.game.hud.bigMessage('COMMANDER EXPOSED', 'shoot Mitri!');
    }
    if (e.vulnerable) {
      e.exposeT -= dt;
      const rise = Math.min(1, (expose - Math.max(0, e.exposeT)) * 3) * 0.5;
      if (e.mesh.userData.hatch) e.mesh.userData.hatch.position.y = 1.0 + rise; // cupola lifts (placeholder)
      if (e.exposeT <= 0) { e.vulnerable = false; e.windowT = cycle; if (e.mesh.userData.hatch) e.mesh.userData.hatch.position.y = 1.0; }
    }
    if (!e._enraged && enraged) { e._enraged = true; this.game.hud.bigMessage('MITRI ENRAGED', 'the T-90M floors it!'); }
    this.game.hud.setBossPip(e.vulnerable ? e.mitriHP / e.mitriHPmax : -1);
    updateTankLights(e.mesh, this.game);
  }

  rayHit(origin, dir, maxDist) {
    let best = maxDist, hitE = null, hp = null;
    for (const e of this.active) {
      if (!e.alive) continue;
      this._min.set(e.pos.x - e.radius, e.pos.y, e.pos.z - e.radius);
      this._max.set(e.pos.x + e.radius, e.pos.y + e.height, e.pos.z + e.radius);
      const t = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, this._min, this._max);
      if (t !== null && t < best) { best = t; hitE = e; hp = new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t); }
    }
    if (!hitE) return null;
    return { enemy: hitE, dist: best, point: hp, head: hp.y >= hitE.pos.y + hitE.headY };
  }

  damage(e, amount, source = 'gun', hitPoint = null, attacker = 'host') {
    if (!e.alive) return false;
    const _mp = this.game.mp;
    if (_mp && _mp.active && !_mp.isHost) { _mp.claimHit(e, amount, source); return false; }
    if (e.def.armored && !e.captured) {
      if (source === 'gun') {
        if (!e.vulnerable) { this._armorPing(e, hitPoint); return false; }   // bullets bounce off armor
        e.mitriHP -= amount; this._mitriHurt(e);                              // exposed: chip the COMMANDER
        if (e.mitriHP <= 0) return this._tankCaptured(e, attacker);            // → capture path
        return false;
      }
      if (source === 'explosion') {
        const zone = this._tankHitZone(e, hitPoint);                         // stub now; real later
        if (zone.era && !e.eraSpent[zone.id]) { this._eraReact(e, zone); return false; }
        e.armorHP -= amount * (e.def.explosiveMult || 2.0); this._armorHurt(e);
        if (e.armorHP <= 0) return this._tankDestroyed(e, attacker);           // → wreck path
        return false;
      }
      return false; // 'contact' n/a for the tank
    }
    e.hp -= amount; e.squash = Math.max(e.squash, 0.16);
    if (e.hp <= 0) {
      e.alive = false; e.mesh.visible = false;
      const top = new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z);
      this.game.effects.stuffing(top, e.col.body, e.def.boss ? 44 : (e.isElite ? 30 : 16), e.def.boss ? 9 : (e.isElite ? 8 : 6));
      this.game.audio.enemyDie();
      if (e.def.explode) {
        this.game.effects.explosion(top, e.def.explodeRadius);
        this.damageInRadius(e.pos, e.def.explodeRadius, e.def.explodeDmg * 1.2, e);
        // Only the triggering kill harms the player; chained (explosion-killed) exploders don't double-dip.
        if (source !== 'explosion') this.game._explodeHurt(e.pos, e.def.explodeRadius, e.def.explodeDmg);
        // Route explosion damage to captured tank (explosives are extra-effective vs armor)
        const ct = this.game.capturedTank;
        if (ct && ct.hp > 0) {
          const cd = Math.hypot(ct.pos.x - e.pos.x, ct.pos.z - e.pos.z);
          if (cd < e.def.explodeRadius) ct.hurt(e.def.explodeDmg * (1 - cd / e.def.explodeRadius) * 2.0);
        }
      }
      if (e.def.boss || e.isElite) this.game.hud.hideBoss();
      if (e.def.boss && e._beam) e._beam.visible = false;
      this.game.onEnemyKilled(e, attacker);
      if (_mp && _mp.active && _mp.isHost) _mp.onEnemyDie(e, attacker);
      return true;
    }
    const hpv = new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z);
    this.game.effects.stuffing(hpv, e.col.body, 4, 3);
    if (source !== 'explosion') this.game.audio.enemyHurt();
    return false;
  }

  damageInRadius(center, radius, dmg, except = null) {
    for (const e of [...this.active]) {
      if (!e.alive || e === except) continue;
      const d = Math.hypot(e.pos.x - center.x, e.pos.z - center.z);
      if (d < radius) this.damage(e, dmg * (1 - (d / radius) * 0.6), 'explosion', center.clone ? center.clone() : center);
    }
  }
  // --- Tank damage helpers (Task 4) ---
  _armorPing(e, hp) {
    this.game.audio.tone(220, 0.04, 'square', 0.18);
    if (hp && this.game.effects.impact) this.game.effects.impact(hp, new THREE.Vector3(0, 1, 0), 'spark');
    // Throttled ricochet hint — at most once every 4 s so full-auto fire doesn't spam
    const now = this.game.clock ? this.game.clock.elapsedTime : performance.now() / 1000;
    if (!this._armorHintT || now - this._armorHintT > 4) {
      this._armorHintT = now;
      this.game.hud.bigMessage('ARMOR — BOUNCED', 'flank the rear / hit tracks, or wait for COMMANDER');
    }
  }
  _mitriHurt(e) { this.game.effects.stuffing(new THREE.Vector3(e.pos.x, e.pos.y + 2.5, e.pos.z), 0xf2c200, 5, 4); this.game.audio.enemyHurt(); }
  _armorHurt(e) { this.game.audio.tone(90, 0.06, 'sawtooth', 0.25); }
  _tankHitZone(e, hp) {
    if (!hp) return { era: false, id: 'weak' };
    const dx = hp.x - e.pos.x, dz = hp.z - e.pos.z;              // world offset from hull center
    const c = Math.cos(-e.hullYaw), s = Math.sin(-e.hullYaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;            // local frame (forward = +z)
    const top = hp.y > e.pos.y + 2.2;                            // roof / engine deck = weak
    const low = hp.y < e.pos.y + 0.9;                            // tracks / running gear = weak
    if (top || low) return { era: false, id: 'weak' };
    const front = lz > 0.6, side = Math.abs(lx) > Math.abs(lz);
    // ERA covers the upper front glacis + forward side cheeks; rear is bare
    if (front || (side && lz > -1.5)) return { era: true, id: front ? 'glacisF' : (lx < 0 ? 'sideL' : 'sideR') };
    return { era: false, id: 'weak' };                           // rear / between = weak
  }
  _eraReact(e, zone) {
    e.eraSpent[zone.id] = true;
    // Compute ERA pop position based on which zone was hit
    const hullYaw = e.hullYaw || 0;
    const fwd = new THREE.Vector3(Math.sin(hullYaw), 0, Math.cos(hullYaw));
    const right = new THREE.Vector3(Math.cos(hullYaw), 0, -Math.sin(hullYaw));
    // zone offsets: glacisF = front-center, sideL/sideR = side cheeks
    let ox = 0, oy = 1.6, oz = 0;
    if (zone.id === 'glacisF') { ox = fwd.x * 2.2; oz = fwd.z * 2.2; oy = 1.4; }
    else if (zone.id === 'sideL') { ox = right.x * -2.0 + fwd.x * 0.8; oz = right.z * -2.0 + fwd.z * 0.8; oy = 1.5; }
    else if (zone.id === 'sideR') { ox = right.x *  2.0 + fwd.x * 0.8; oz = right.z *  2.0 + fwd.z * 0.8; oy = 1.5; }
    const popPos = new THREE.Vector3(e.pos.x + ox, e.pos.y + oy, e.pos.z + oz);

    // ERA pop flash + small explosion
    this.game.effects.explosion(popPos, 1.6);
    this.game.audio.tone(420, 0.05, 'square', 0.3);

    // Spark/debris burst from the ERA plate
    const sparkC  = new THREE.Color(0xffcc30);
    const debrisC = new THREE.Color(0x888070);
    const efx = this.game.effects;
    for (let i = 0; i < 12; i++) {
      // outward spark
      const sv = new THREE.Vector3(randRange(-1, 1), randRange(0.2, 1.2), randRange(-1, 1)).normalize().multiplyScalar(randRange(4, 9));
      efx._spawn({
        pos: popPos.clone(), vel: sv,
        life: randRange(0.18, 0.38), size: randRange(0.04, 0.09),
        grav: -14, drag: 1.0, color: sparkC, bounce: 0, floorY: -999, shrink: true,
      });
    }
    for (let i = 0; i < 8; i++) {
      // ERA plate debris chunks
      const dv = new THREE.Vector3(randRange(-1, 1), randRange(0.5, 1.5), randRange(-1, 1)).normalize().multiplyScalar(randRange(2, 6));
      efx._spawn({
        pos: popPos.clone(), vel: dv,
        life: randRange(0.4, 0.8), size: randRange(0.06, 0.14),
        grav: -12, drag: 1.5, color: debrisC, bounce: 0.2, floorY: e.pos.y, shrink: false,
      });
    }

    this.game.hud.bigMessage('ERA — NO EFFECT', 'hit the REAR, ROOF or TRACKS');
    // Phase 3 (art task): hide the matching ERA brick mesh on the model.
  }
  _tankDestroyed(e, attacker = 'host') {
    e.alive = false;
    const c = new THREE.Vector3(e.pos.x, e.pos.y + 1.4, e.pos.z);
    for (let k = 0; k < 4; k++) this.game.effects.explosion(c.clone().add(new THREE.Vector3(rr(-1.5, 1.5), rr(0, 1.5), rr(-1.5, 1.5))), 4);
    this.game.effects.stuffing(c, 0x222222, 50, 9);
    this.game.audio.enemyDie();
    if (e.tankGroup) e.tankGroup.visible = false;
    if (this.game.world.addWreckObstacle) this.game.world.addWreckObstacle(e.pos.clone(), e.hullYaw || 0);
    { // Place visible wreck mesh + register for lingering smoke
      const wreckMesh = buildTankWreck();
      wreckMesh.position.set(e.pos.x, 0, e.pos.z);
      wreckMesh.rotation.y = e.hullYaw || 0;
      this.game.engine.scene.add(wreckMesh);
      if (_tankWrecks.length >= 6) {
        const oldest = _tankWrecks.shift();
        if (oldest.mesh.parent) oldest.mesh.parent.remove(oldest.mesh);
      }
      _tankWrecks.push({ mesh: wreckMesh, pos: { x: e.pos.x, y: 0, z: e.pos.z }, t: 0, _smokeAccum: 0 });
    }
    this.game.hud.hideBoss();
    this.game.hud.bigMessage('T-90M DESTROYED', '+bounty +keys');
    this.game.onEnemyKilled(e, attacker);
    return true;
  }
  _tankCaptured(e, attacker = 'host') {
    e.alive = false; e.captured = true;
    if (e.tankGroup && e.tankGroup.userData && e.tankGroup.userData.mitri) e.tankGroup.userData.mitri.visible = false; // commander dead
    this.game.hud.hideBoss();
    this.game.hud.bigMessage('TANK COMMANDEERED!', 'press E to board');
    this.game.onEnemyKilled(e, attacker);
    if (this.game.capturedTank && this.game.capturedTank.forceReset) this.game.capturedTank.forceReset();
    this.game.capturedTank = new CapturedTank(this.game, e.tankGroup, e.pos.clone(), e.hullYaw || 0);
    e.tankGroup = null; // ownership transferred — clearAll/pool won't touch it; next tank spawn builds fresh
    return true;
  }
  clearAll() { for (const e of this.active) { e.alive = false; e.mesh.visible = false; if (e._beam) e._beam.visible = false; if (e.tankGroup) e.tankGroup.visible = false; } this.active.length = 0; if (this.game.hud) this.game.hud.hideBoss(); if (this.shells) { for (const s of this.shells) if (s.mesh && s.mesh.parent) s.mesh.parent.remove(s.mesh); this.shells.length = 0; } if (this._aimRing) this._aimRing.material.opacity = 0; }
  // Despawn lingering non-boss enemies (LONG NIGHT anti-hunt failsafe). Bosses stay.
  despawnStragglers() { let n = 0; for (const e of this.active) { if (e.alive && !e.def.boss) { e.alive = false; e.mesh.visible = false; n++; } } return n; }
}

// ---------------------------------------------------------------------------
// Viewmodels
// ---------------------------------------------------------------------------
function buildViewmodel(def) {
  const b = new MeshBuilder();
  const c = def.color, a = def.accent, dark = shade(c, -0.1);
  switch (def.shape) {
    case 'knife':   b.box(0.05, 0.06, 0.5, 0, 0, -0.45, a); b.box(0.04, 0.12, 0.5, 0, 0.02, -0.9, c, { tint: 0.03 }); b.box(0.14, 0.04, 0.06, 0, 0, -0.6, dark); break;
    case 'machete': b.box(0.06, 0.07, 0.28, 0, 0, -0.3, a); b.box(0.04, 0.16, 0.8, 0.02, 0.04, -0.85, c, { tint: 0.03 }); break;
    case 'cleaver': b.box(0.05, 0.08, 0.24, 0, 0, -0.26, a); b.box(0.05, 0.34, 0.42, 0, 0.08, -0.62, c, { tint: 0.03 }); break;
    case 'shovel':  b.box(0.05, 0.05, 0.9, 0, 0, -0.6, a); b.box(0.26, 0.04, 0.34, 0, 0, -1.15, c, { tint: 0.03 }); break;
    case 'pistol':  b.box(0.12, 0.16, 0.6, 0, 0, -0.3, c, { tint: 0.04 }); b.box(0.1, 0.26, 0.14, 0, -0.2, 0.04, dark); b.box(0.05, 0.05, 0.1, 0, 0.07, -0.34, a); break;
    case 'revolver':b.box(0.12, 0.16, 0.62, 0, 0, -0.32, c, { tint: 0.04 }); b.box(0.13, 0.18, 0.16, 0, -0.01, -0.06, a); b.box(0.1, 0.26, 0.14, 0, -0.2, 0.06, dark); break;
    case 'smg':     b.box(0.14, 0.18, 0.95, 0, 0, -0.45, c, { tint: 0.04 }); b.box(0.1, 0.34, 0.12, 0, -0.26, -0.16, a); b.box(0.1, 0.24, 0.12, 0, -0.2, 0.06, dark); b.box(0.1, 0.1, 0.34, 0, 0.1, -0.5, dark); break;
    case 'drum': { // PPSh-41 — clean voxel build: layered gun-blue steel + grained wood, hooded sights, iconic 71-rnd drum
      // Layered palette gives the crisp "voxel render" look: top faces catch light (Hi),
      // sides are mid, undersides + recesses go dark, perforations are near-black.
      const wHi = 0x9d6d38, wMid = 0x82562a, wLo = 0x643f1e;                    // grained walnut
      const stHi = 0x888f99, stMid = 0x636a74, stLo = 0x474d56, stSlot = 0x2b2f35, stBright = 0xa0a7af; // gun-blue steel
      const dmBody = 0x515861, dmDark = 0x33373d, dmFace = 0x5d646d;            // drum
      // ---- wooden stock (stacked, grained) ----
      b.box(0.135, 0.30, 0.10, 0, -0.05, 0.80, wLo, { tint: 0.03 });           // butt plate (dark end)
      b.box(0.115, 0.21, 0.42, 0, -0.07, 0.57, wMid, { tint: 0.045 });         // stock body
      b.box(0.10, 0.075, 0.40, 0, 0.055, 0.55, wHi, { tint: 0.05 });           // comb (top, lit)
      b.box(0.122, 0.045, 0.40, 0, -0.04, 0.57, wLo, { tint: 0.04 });          // grain band
      b.box(0.10, 0.16, 0.26, 0, -0.02, 0.25, wMid, { tint: 0.035 });          // wrist into receiver
      // ---- receiver ----
      b.box(0.12, 0.155, 0.48, 0, 0.02, -0.02, stMid, { tint: 0.02 });         // body
      b.box(0.112, 0.055, 0.48, 0, 0.105, -0.02, stHi, { tint: 0.02 });        // rounded top tube (lit)
      b.box(0.124, 0.035, 0.46, 0, -0.055, -0.02, stLo);                       // lower edge (shadow)
      b.box(0.006, 0.05, 0.13, 0.062, 0.05, 0.02, stSlot);                     // ejection port (right)
      b.box(0.05, 0.05, 0.06, 0.085, 0.07, 0.12, stHi);                        // bolt handle
      b.box(0.032, 0.032, 0.03, 0.115, 0.07, 0.12, stBright);                  // bolt knob
      // ---- rear sight (notch leaf) ----
      b.box(0.075, 0.045, 0.06, 0, 0.145, -0.17, stLo);                        // base
      b.box(0.02, 0.06, 0.02, -0.026, 0.185, -0.17, stHi);                     // left wing
      b.box(0.02, 0.06, 0.02, 0.026, 0.185, -0.17, stHi);                      // right wing
      // ---- barrel shroud (perforated cooling jacket) ----
      b.box(0.115, 0.135, 0.80, 0, 0.045, -0.66, stMid, { tint: 0.02 });       // jacket body
      b.box(0.10, 0.032, 0.80, 0, 0.112, -0.66, stHi, { tint: 0.02 });         // top highlight strip
      b.box(0.122, 0.03, 0.78, 0, -0.012, -0.66, stLo);                        // bottom shadow strip
      for (let i = 0; i < 5; i++) {                                            // signature slot perforations
        const z = -0.40 - i * 0.135;
        b.box(0.05, 0.03, 0.085, 0, 0.118, z, stSlot);                         // top slot
        b.box(0.012, 0.05, 0.085, 0.058, 0.045, z, stSlot);                    // right slot
        b.box(0.012, 0.05, 0.085, -0.058, 0.045, z, stSlot);                   // left slot
      }
      // ---- barrel tip + slanted compensator ----
      b.box(0.05, 0.05, 0.18, 0, 0.045, -1.12, stLo);                          // barrel poking out
      b.box(0.125, 0.15, 0.10, 0, 0.045, -1.04, stMid);                        // muzzle collar
      b.box(0.13, 0.16, 0.05, 0, 0.06, -1.10, stHi, { rx: -0.4 });             // slanted comp face (lit)
      b.box(0.04, 0.04, 0.05, 0, 0.045, -1.20, stSlot);                        // dark bore
      // ---- hooded front sight ----
      b.box(0.05, 0.05, 0.05, 0, 0.125, -1.0, stLo);                           // base
      b.box(0.015, 0.085, 0.05, -0.03, 0.165, -1.0, stHi);                     // hood L
      b.box(0.015, 0.085, 0.05, 0.03, 0.165, -1.0, stHi);                      // hood R
      b.box(0.08, 0.016, 0.05, 0, 0.205, -1.0, stHi);                          // hood top
      b.box(0.012, 0.06, 0.012, 0, 0.155, -1.0, stBright);                     // front post
      // ---- grip / trigger ----
      b.box(0.07, 0.025, 0.16, 0, -0.10, 0.10, stLo);                          // guard bottom bar
      b.box(0.02, 0.07, 0.02, 0, -0.075, 0.035, stMid);                        // guard front post
      b.box(0.02, 0.07, 0.02, 0, -0.075, 0.165, stMid);                        // guard rear post
      b.box(0.02, 0.06, 0.02, 0, -0.085, 0.10, stBright);                      // trigger
      b.box(0.09, 0.12, 0.15, 0, -0.105, -0.02, stLo, { tint: 0.02 });         // magazine housing neck
      // ---- static 71-rnd drum: round face toward the gunner (axis along Z), hangs straight down ----
      const dRim = new THREE.CylinderGeometry(0.265, 0.265, 0.05, 26); b.geo(dRim, 0, -0.27, -0.085, dmDark, { rx: Math.PI / 2 }); dRim.dispose();   // back rim
      const dBody = new THREE.CylinderGeometry(0.255, 0.255, 0.15, 26); b.geo(dBody, 0, -0.27, -0.01, dmBody, { rx: Math.PI / 2, tint: 0.02 }); dBody.dispose(); // body
      const dFace = new THREE.CylinderGeometry(0.235, 0.235, 0.03, 26); b.geo(dFace, 0, -0.27, 0.07, dmFace, { rx: Math.PI / 2 }); dFace.dispose();  // lit face plate
      const dRing = new THREE.CylinderGeometry(0.15, 0.15, 0.035, 22); b.geo(dRing, 0, -0.27, 0.078, dmDark, { rx: Math.PI / 2 }); dRing.dispose();  // concentric groove
      const dHub = new THREE.CylinderGeometry(0.055, 0.055, 0.21, 16); b.geo(dHub, 0, -0.27, -0.01, stBright, { rx: Math.PI / 2 }); dHub.dispose();  // centre winding hub
      b.box(0.11, 0.022, 0.022, 0, -0.27, 0.095, stLo);                        // winding-key bar across the hub
      break;
    }
    case 'rifle':   b.box(0.12, 0.16, 1.3, 0, 0, -0.6, c, { tint: 0.03 }); b.box(0.1, 0.3, 0.14, 0, -0.18, 0.04, dark); b.box(0.1, 0.26, 0.34, 0, -0.18, 0.3, a, { tint: 0.03 }); b.box(0.08, 0.08, 0.3, 0, 0.1, -0.7, dark); break;
    case 'stg': {   // StG 44 — layered-shade rebuild: stamped receiver, vented handguard, curved 30-rnd banana, warm wood
      const stHi = 0x888f99, stMid = 0x636a74, stLo = 0x474d56, stSlot = 0x2b2f35, stBright = 0xa0a7af; // gun-blue steel
      const wHi = 0x9d6d38, wMid = 0x82562a, wLo = 0x643f1e;                   // reddish-warm wood
      // ---- stamped receiver ----
      b.box(0.145, 0.19, 0.95, 0, 0, -0.35, stMid, { tint: 0.02 });           // body
      b.box(0.15, 0.06, 0.56, 0, 0.105, -0.24, stHi, { tint: 0.02 });         // top cover / sight rail (lit)
      b.box(0.152, 0.035, 0.92, 0, -0.085, -0.35, stLo);                      // lower shadow strip
      b.box(0.006, 0.06, 0.15, 0.075, 0.04, -0.18, stSlot);                   // ejection port (right)
      // ---- rear sight ----
      b.box(0.06, 0.05, 0.07, 0, 0.155, -0.05, stMid);                        // sight drum
      b.box(0.05, 0.018, 0.04, 0, 0.185, -0.05, stBright);                    // notch top
      // ---- vented handguard + barrel ----
      b.box(0.115, 0.125, 0.5, 0, -0.015, -0.92, stMid, { tint: 0.02 });      // handguard
      b.box(0.1, 0.03, 0.5, 0, 0.05, -0.92, stHi);                            // top highlight
      for (let i = 0; i < 4; i++) b.box(0.119, 0.06, 0.035, 0, -0.01, -0.78 - i * 0.12, stSlot); // cooling vents
      b.box(0.06, 0.06, 0.62, 0, 0.02, -1.28, stLo);                          // barrel
      b.box(0.075, 0.075, 0.08, 0, 0.02, -1.62, stMid);                       // muzzle nut
      b.box(0.03, 0.03, 0.05, 0, 0.02, -1.66, stSlot);                        // bore
      // ---- hooded front sight ----
      b.box(0.05, 0.05, 0.06, 0, 0.06, -1.5, stLo);                           // base
      b.box(0.015, 0.09, 0.05, -0.03, 0.105, -1.5, stHi);                     // hood L
      b.box(0.015, 0.09, 0.05, 0.03, 0.105, -1.5, stHi);                      // hood R
      b.box(0.08, 0.016, 0.05, 0, 0.145, -1.5, stHi);                         // hood top
      b.box(0.012, 0.06, 0.012, 0, 0.1, -1.5, stBright);                      // post
      // ---- curved banana magazine (the StG signature) ----
      b.box(0.085, 0.2, 0.12, 0, -0.22, -0.16, stLo, { rx: 0.12 });
      b.box(0.082, 0.2, 0.12, 0, -0.4, -0.225, stMid, { rx: 0.3, tint: 0.02 });
      b.box(0.078, 0.18, 0.115, 0, -0.56, -0.31, stLo, { rx: 0.46 });
      b.box(0.072, 0.15, 0.11, 0, -0.7, -0.42, stMid, { rx: 0.62, tint: 0.02 });
      // ---- pistol grip + trigger ----
      b.box(0.095, 0.3, 0.13, 0, -0.22, 0.05, wMid, { rx: -0.28, tint: 0.03 });
      b.box(0.09, 0.025, 0.18, 0, -0.13, -0.03, stLo);                        // trigger guard
      b.box(0.025, 0.06, 0.02, 0, -0.105, -0.03, stBright);                   // trigger
      // ---- wooden stock (grained) ----
      b.box(0.1, 0.17, 0.5, 0, -0.05, 0.42, wMid, { tint: 0.04 });            // body
      b.box(0.09, 0.05, 0.46, 0, 0.045, 0.42, wHi, { tint: 0.04 });           // comb (lit)
      b.box(0.106, 0.04, 0.48, 0, -0.045, 0.42, wLo, { tint: 0.03 });         // grain band
      b.box(0.11, 0.27, 0.09, 0, -0.12, 0.68, wLo, { tint: 0.03 });           // butt plate
      // ---- charging handle (left) ----
      b.box(0.07, 0.05, 0.13, -0.1, 0.06, -0.12, stHi);
      b.box(0.04, 0.04, 0.04, -0.135, 0.06, -0.12, stBright);                 // knob
      break;
    }
    case 'shotgun': b.box(0.15, 0.16, 1.2, 0, 0, -0.55, c, { tint: 0.03 }); b.box(0.13, 0.13, 1.2, 0, -0.16, -0.55, dark, { tint: 0.03 }); b.box(0.16, 0.34, 0.3, 0, -0.16, 0.22, a, { tint: 0.03 }); break;
    case 'sawed':   b.box(0.16, 0.14, 0.6, 0.07, 0, -0.32, c, { tint: 0.03 }); b.box(0.16, 0.14, 0.6, -0.07, 0, -0.32, dark, { tint: 0.03 }); b.box(0.16, 0.3, 0.26, 0, -0.16, 0.12, a); break;
    case 'sniper':  b.box(0.12, 0.14, 1.7, 0, 0, -0.75, c, { tint: 0.03 }); b.box(0.16, 0.1, 0.5, 0, 0.13, -0.35, dark); b.box(0.1, 0.1, 0.16, 0, 0.13, -0.62, a); b.box(0.16, 0.34, 0.32, 0, -0.16, 0.3, c, { tint: 0.03 }); break;
    case 'magnum':  b.box(0.13, 0.18, 0.52, 0, 0, -0.28, c, { tint: 0.03 }); b.box(0.16, 0.2, 0.2, 0, -0.01, -0.05, c, { tint: 0.03 }); b.box(0.11, 0.28, 0.15, 0, -0.22, 0.07, a, { tint: 0.03 }); b.box(0.05, 0.05, 0.1, 0, 0.07, -0.34, dark); break;
    case 'mp40':    b.box(0.11, 0.15, 0.55, 0, 0.02, -0.45, c, { tint: 0.02 }); b.box(0.07, 0.07, 0.5, 0, 0.02, -0.85, dark); b.box(0.09, 0.34, 0.1, 0, -0.26, -0.08, a); b.box(0.1, 0.22, 0.12, 0, -0.18, 0.1, dark); b.box(0.05, 0.05, 0.45, 0, -0.04, 0.42, dark); break;
    case 'grease':  b.box(0.14, 0.15, 0.7, 0, 0, -0.4, c, { tint: 0.02 }); b.box(0.09, 0.3, 0.11, 0, -0.24, -0.05, dark); b.box(0.1, 0.2, 0.12, 0, -0.16, 0.1, dark); b.box(0.05, 0.05, 0.35, 0, 0, 0.42, dark); break;
    case 'bar':     b.box(0.14, 0.18, 1.3, 0, 0, -0.6, c, { tint: 0.02 }); b.box(0.1, 0.3, 0.14, 0, -0.18, 0.06, dark); b.box(0.11, 0.32, 0.16, 0, -0.22, -0.18, a, { tint: 0.02 }); b.box(0.06, 0.3, 0.05, -0.06, -0.32, -0.95, dark, { rz: 0.35 }); b.box(0.06, 0.3, 0.05, 0.06, -0.32, -0.95, dark, { rz: -0.35 }); b.box(0.08, 0.08, 0.3, 0, 0.1, -0.95, dark); break;
    case 'dp28': {  // DP-28 LMG: wood stock, slotted shroud, long barrel + conical flash hider, bipod (pan = separate spinning mesh)
      const wood = 0x9a6a36, metal = 0x2c2f34, gd = 0x17191c;
      b.box(0.1, 0.18, 0.5, 0, -0.05, 0.5, wood, { tint: 0.03 });            // stock
      b.box(0.11, 0.24, 0.12, 0, -0.1, 0.74, wood, { tint: 0.03 });          // butt
      b.box(0.09, 0.22, 0.12, 0, -0.17, 0.16, gd, { rx: -0.2 });             // grip
      b.box(0.12, 0.16, 0.45, 0, 0.0, 0.0, metal, { tint: 0.02 });           // receiver
      b.box(0.22, 0.04, 0.22, 0, 0.1, -0.3, metal);                          // pan seat
      b.box(0.1, 0.12, 0.66, 0, 0.04, -0.62, metal, { tint: 0.02 });         // barrel shroud
      for (let i = 0; i < 4; i++) b.box(0.11, 0.05, 0.09, 0, 0.08, -0.45 - i * 0.14, gd); // cooling slots
      b.box(0.06, 0.06, 0.62, 0, 0.04, -1.15, metal);                        // long barrel
      const cone = new THREE.CylinderGeometry(0.1, 0.05, 0.18, 12); b.geo(cone, 0, 0.04, -1.5, metal, { rx: Math.PI / 2 }); cone.dispose(); // conical flash hider
      b.box(0.05, 0.1, 0.05, 0, 0.13, -1.04, gd);                            // front sight
      b.box(0.06, 0.07, 0.06, 0, 0.14, 0.1, gd);                             // rear sight
      b.box(0.1, 0.06, 0.06, 0, -0.05, -1.0, gd);                            // bipod pivot
      b.box(0.04, 0.52, 0.04, -0.11, -0.3, -1.0, gd, { rz: 0.26 });          // bipod leg
      b.box(0.04, 0.52, 0.04, 0.11, -0.3, -1.0, gd, { rz: -0.26 });          // bipod leg
      break;
    }
    case 'mosin':   b.box(0.1, 0.15, 1.45, 0, -0.02, -0.65, c, { tint: 0.03 }); b.box(0.07, 0.07, 0.7, 0, 0.03, -1.4, a); b.box(0.11, 0.28, 0.34, 0, -0.16, 0.4, c, { tint: 0.03 }); b.box(0.13, 0.05, 0.07, 0.1, 0.03, -0.1, a); b.box(0.06, 0.1, 0.05, 0, 0.12, -0.7, a); break;
    case 'bazooka': b.box(0.22, 0.22, 1.55, 0, 0, -0.7, c, { tint: 0.02 }); b.box(0.28, 0.28, 0.16, 0, 0, 0.12, dark); b.box(0.1, 0.26, 0.12, 0, -0.22, -0.12, dark); b.box(0.08, 0.12, 0.1, 0, 0.16, -0.5, dark); break;
    case 'axe':     b.box(0.05, 0.05, 0.72, 0, 0, -0.5, a, { tint: 0.03 }); b.box(0.06, 0.3, 0.06, 0.02, 0.12, -0.86, c, { tint: 0.02 }); b.box(0.18, 0.26, 0.05, 0.12, 0.12, -0.86, c, { tint: 0.02 }); break;
    default:        b.box(0.12, 0.16, 0.6, 0, 0, -0.3, c, { tint: 0.04 }); b.box(0.1, 0.26, 0.14, 0, -0.2, 0.04, dark);
  }
  const m = new THREE.Mesh(b.build(), voxelMaterial({ depthTest: false }));
  m.renderOrder = 1000; m.frustumCulled = false;
  return m;
}

// Separate, spinnable magazine mesh (built centred at origin so it rotates cleanly).
function buildMag(cfg) {
  const b = new MeshBuilder();
  const dark = 0x202225, edge = 0x33373d, hubC = 0x4a4e54;
  if (cfg.shape === 'pan') { // flat DP-28 pan on top, spins about Y
    const disc = new THREE.CylinderGeometry(cfg.r, cfg.r, 0.07, 24); b.geo(disc, 0, 0, 0, dark); disc.dispose();
    const rim = new THREE.CylinderGeometry(cfg.r, cfg.r, 0.02, 24); b.geo(rim, 0, 0.045, 0, edge); rim.dispose();
    const hub = new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12); b.geo(hub, 0, 0.02, 0, hubC); hub.dispose();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; b.box(0.05, 0.025, 0.11, Math.cos(a) * (cfg.r - 0.06), 0.05, Math.sin(a) * (cfg.r - 0.06), edge, { ry: -a }); }
  } else { // round PPSh drum, spins about X (round face to the side)
    const disc = new THREE.CylinderGeometry(cfg.r, cfg.r, 0.17, 24); b.geo(disc, 0, 0, 0, dark, { rz: Math.PI / 2 }); disc.dispose();
    const hub = new THREE.CylinderGeometry(0.08, 0.08, 0.2, 12); b.geo(hub, 0, 0, 0, hubC, { rz: Math.PI / 2 }); hub.dispose();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; b.box(0.1, 0.055, 0.04, 0.09, Math.cos(a) * (cfg.r - 0.06), Math.sin(a) * (cfg.r - 0.06), edge); }
  }
  const m = new THREE.Mesh(b.build(), voxelMaterial({ depthTest: false }));
  m.renderOrder = 1001; m.frustumCulled = false;
  return m;
}

// ---------------------------------------------------------------------------
// WeaponSystem — ownership, rarity, ammo, firing (guns + melee), ADS, grenades.
// ---------------------------------------------------------------------------
class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.owned = {}; this.rarity = {}; this.mag = {}; this.reserve = {}; this.magMax = {}; this.semi = {};
    this.cur = 'luger';
    this.cooldown = 0; this.reloading = 0; this.bloom = 0; this.recoilKick = 0; this.recoilPitch = 0;
    this.grenades = 2; this.grenadeCD = 0; this.ads = false; this.fov = 80;
    this._bobT = 0; this._swing = 0;
    this.projectiles = [];
    this._tmp = new THREE.Vector3(); this._tmp2 = new THREE.Vector3();

    this.group = new THREE.Group();
    this.models = {};
    for (const k of WEAPON_ORDER) { const m = buildViewmodel(WEAPONS[k]); m.visible = false; this.group.add(m); this.models[k] = m; }
    this.magMeshes = {}; // separate spinning magazines (DP-28 pan, PPSh drum)
    for (const k of WEAPON_ORDER) { const sm = WEAPONS[k].spinMag; if (!sm) continue; const mm = buildMag(sm); mm.position.set(sm.x, sm.y, sm.z); mm.visible = false; mm._targetRot = 0; this.group.add(mm); this.magMeshes[k] = mm; }
    this.basePos = new THREE.Vector3(0.3, -0.27, -0.72);
    this.group.position.copy(this.basePos);
    game.engine.camera.add(this.group);
    // Children of the camera only render if the camera is part of the scene graph.
    game.engine.scene.add(game.engine.camera);

    this.resetLoadout();
  }

  resetLoadout() {
    // clear any in-flight grenades and all transient state (survives restarts otherwise)
    for (const g of this.projectiles) { this.game.engine.scene.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose(); }
    this.projectiles.length = 0;
    this.reloading = 0; this.cooldown = 0; this.grenadeCD = 0; this._swing = 0; this._bobT = 0;
    this.bloom = 0; this.recoilKick = 0; this.recoilPitch = 0; this.ads = false;
    this.fov = (this.game.settings && this.game.settings.data.fov) || 80;
    this.game.engine.setFov(this.fov);
    for (const k of WEAPON_ORDER) { this.owned[k] = false; this.rarity[k] = null; this.mag[k] = 0; this.reserve[k] = 0; this.semi[k] = false; }
    this.grant('luger', 'common'); this.grant('knife', 'common');
    this.cur = 'luger'; this.grenades = 2; this.flares = 0; this.flashlightOwned = false;
    for (const k in this.models) this.models[k].visible = (k === this.cur);
    for (const k in this.magMeshes) this.magMeshes[k].visible = (k === this.cur);
  }

  ownedOrder() { return WEAPON_ORDER.filter((k) => this.owned[k]); }
  def() { return WEAPONS[this.cur]; }
  effMult(key) { return RARITY[this.rarity[key] || 'common'].mult * this.game.player.damageMult; }

  grant(key, rarityKey) {
    const d = WEAPONS[key];
    const prev = this.rarity[key];
    if (this.owned[key] && prev && RARITY[rarityKey].mult <= RARITY[prev].mult) {
      // keep better rarity, just top up ammo
    } else { this.rarity[key] = rarityKey; }
    this.owned[key] = true;
    if (!d.melee) {
      const mult = RARITY[this.rarity[key]].mult;
      this.magMax[key] = Math.max(1, Math.round(d.mag * (1 + (mult - 1) * 0.4)));
      this.mag[key] = this.magMax[key];
      this.reserve[key] = d.reserveMax === Infinity ? Infinity : d.reserveMax;
    }
    if (this.game.hud) this.game.hud.setWeapon(this);
  }

  select(key) {
    if (!this.owned[key] || key === this.cur) return;
    this.reloading = 0; // switching weapons (incl. auto-equip of loot/shop buys) cancels an in-progress reload
    this.models[this.cur].visible = false; if (this.magMeshes[this.cur]) this.magMeshes[this.cur].visible = false;
    this.cur = key;
    this.models[key].visible = true; if (this.magMeshes[key]) this.magMeshes[key].visible = true;
    this.cooldown = 0.1; this.bloom = 0;
    this.game.hud.setWeapon(this); this.game.audio.reloadClick();
  }
  selectSlot(n) { const o = this.ownedOrder(); if (o[n - 1]) this.select(o[n - 1]); }
  quickMelee() { const m = this.ownedOrder().find((k) => WEAPONS[k].melee); if (m) this.select(m); }
  cycle(dir) { const o = this.ownedOrder(); let i = o.indexOf(this.cur); i = (i + dir + o.length) % o.length; this.select(o[i]); }
  toggleFireMode() {
    const d = this.def();
    if (d.melee || !d.auto) { this.game.audio.dryFire(); return; } // only select-fire weapons toggle
    this.semi[this.cur] = !this.semi[this.cur];
    this.game.audio.reloadClick(); this.game.hud.setWeapon(this);
  }

  startReload() {
    const d = this.def();
    if (d.melee || this.reloading > 0 || this.mag[this.cur] >= this.magMax[this.cur] || this.reserve[this.cur] <= 0) return;
    this.reloading = d.reload * this.game.player.reloadMult; this.game.audio.reloadIn();
  }
  _finishReload() {
    const key = this.cur, need = this.magMax[key] - this.mag[key];
    if (this.reserve[key] === Infinity) this.mag[key] = this.magMax[key];
    else { const take = Math.min(need, this.reserve[key]); this.mag[key] += take; this.reserve[key] -= take; }
    this.game.audio.reloadClick(); this.game.hud.setWeapon(this);
  }

  tryFire(edge) {
    const d = this.def();
    if (this.reloading > 0 || this.cooldown > 0) return;
    if (d.melee) { if (edge === 'press' || d.rate) this._melee(d); return; }
    const auto = d.auto && !this.semi[this.cur];
    if (!auto && edge !== 'press') return;
    if (this.mag[this.cur] <= 0) { if (edge === 'press') { this.game.audio.dryFire(); this.startReload(); } return; }
    this._fire(d);
  }

  _melee(d) {
    this.cooldown = d.rate; this._swing = 0.18;
    this.game.audio.noise(0.12, 0.3, 'bandpass', 520, 1);
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const fwd = this._tmp.set(0, 0, -1).applyQuaternion(cam.quaternion); fwd.y = 0; fwd.normalize();
    const origin = this.game.player.pos;
    const mult = this.effMult(this.cur);
    let hitAny = false, killed = false;
    for (const e of [...this.game.enemies.active]) {
      if (!e.alive) continue;
      const dx = e.pos.x - origin.x, dz = e.pos.z - origin.z, dist = Math.hypot(dx, dz);
      if (dist > d.range + e.radius) continue;
      const dot = (dx / (dist || 1)) * fwd.x + (dz / (dist || 1)) * fwd.z;
      if (dot < d.arcCos) continue;
      hitAny = true;
      e.pos.x += (dx / (dist || 1)) * d.knock; e.pos.z += (dz / (dist || 1)) * d.knock;
      if (this.game.enemies.damage(e, d.dmg * mult, 'melee')) killed = true;
    }
    if (hitAny) this.game.hud.hitmarker(killed);
  }

  _fire(d) {
    this.mag[this.cur]--; this.cooldown = 60 / d.rpm; this.bloom = Math.min(this.bloom + d.bloom, 0.06);
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const origin = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = this._tmp.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const right = this._tmp2.set(1, 0, 0).applyQuaternion(cam.quaternion).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).normalize();
    const muzzle = origin.clone().addScaledVector(fwd, 1.0).addScaledVector(right, 0.16).addScaledVector(up, -0.1);
    this.game.effects.muzzleFlash(muzzle, fwd, d.class === 'shotgun' || d.class === 'launcher' ? 1.6 : 1);
    if (d.class !== 'launcher') this.game.effects.shell(muzzle.clone().addScaledVector(right, -0.08), right);
    this.game.audio.gunshot(SOUND_BY_CLASS[d.class] || SOUND_BY_CLASS.pistol);

    if (d.class === 'launcher') { // fire a rocket projectile that explodes on impact
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.55), new THREE.MeshLambertMaterial({ color: 0x394b2e }));
      mesh.position.copy(muzzle); mesh.quaternion.copy(cam.quaternion);
      this.game.engine.scene.add(mesh);
      this.projectiles.push({ mesh, vel: fwd.clone().multiplyScalar(58), fuse: 4, rocket: true, radius: d.explodeRadius || 7, dmg: d.explodeDmg || 230 });
      this.recoilKick = Math.min(this.recoilKick + 0.28, 0.4); this.recoilPitch += 0.06;
      this.game.hud.setWeapon(this);
      return;
    }

    const spread = (d.spread + this.bloom) * (this.ads ? 0.4 : 1);
    const mult = this.effMult(this.cur);
    for (let p = 0; p < d.pellets; p++) {
      const dir = fwd.clone();
      dir.x += rr(-spread, spread); dir.y += rr(-spread, spread); dir.z += rr(-spread, spread);
      dir.normalize();
      const eHit = this.game.enemies.rayHit(muzzle, dir, d.range);
      const wHit = this.game.world.rayHit(muzzle, dir, d.range);
      const pHit = this.game.mp.active ? this.game.mp.rayHitPlayers(muzzle, dir, d.range) : null;
      if (pHit && (!eHit || pHit.dist <= eHit.dist) && (!wHit || pHit.dist <= wHit.dist)) {
        this.game.mp.claimPlayerHit(pHit.id, d.dmg * mult * (pHit.head ? 2.0 : 1.0));
        this.game.effects.tracer(muzzle, pHit.point, d.accent); this.game.hud.hitmarker(false);
      } else if (eHit && (!wHit || eHit.dist <= wHit.dist)) {
        const dmg = d.dmg * mult * (eHit.head ? 2.0 : 1.0);
        const killed = this.game.enemies.damage(eHit.enemy, dmg, 'gun', eHit.point);
        this.game.effects.tracer(muzzle, eHit.point, d.accent);
        if (eHit.head) { this.game.audio.headshot(); this.game.hud.hitmarker(true); }
        else { this.game.audio.hitMarker(); this.game.hud.hitmarker(killed); }
      } else if (wHit) {
        this.game.effects.tracer(muzzle, wHit.point, d.accent); this.game.effects.impact(wHit.point, wHit.normal, 'spark');
      } else {
        this.game.effects.tracer(muzzle, muzzle.clone().addScaledVector(dir, d.range), d.accent);
      }
    }
    // advance the feed magazine one round per shot (DP-28 pan indexes; full-auto = rapid steps)
    const sm = d.spinMag; if (sm && sm.step && this.magMeshes[this.cur]) this.magMeshes[this.cur]._targetRot += sm.step;
    this.recoilKick = Math.min(this.recoilKick + d.recoil * 0.05, 0.3);
    this.recoilPitch += d.recoil * (0.6 + Math.random() * 0.5) * 0.01;
    this.game.hud.setWeapon(this);
  }

  throwGrenade() {
    if (this.grenades <= 0 || this.grenadeCD > 0) return;
    this.grenades--; this.grenadeCD = 0.6; this.game.hud.setWeapon(this);
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const origin = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshLambertMaterial({ color: 0x3c5a32 }));
    mesh.castShadow = true; mesh.position.copy(origin).addScaledVector(fwd, 0.8);
    this.game.engine.scene.add(mesh);
    this.projectiles.push({ mesh, vel: fwd.clone().multiplyScalar(20).add(new THREE.Vector3(0, 3, 0)), fuse: 1.6, radius: 7, dmg: 220 });
    this.game.audio.uiClick();
  }

  refillAll() {
    for (const k of WEAPON_ORDER) {
      if (!this.owned[k] || WEAPONS[k].melee) continue;
      this.reserve[k] = WEAPONS[k].reserveMax === Infinity ? Infinity : WEAPONS[k].reserveMax;
      this.mag[k] = this.magMax[k];
    }
    if (this.game.hud) this.game.hud.setWeapon(this);
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.grenadeCD > 0) this.grenadeCD -= dt;
    if (this._swing > 0) this._swing -= dt;
    if (this.reloading > 0) { this.reloading -= dt; if (this.reloading <= 0) { this.reloading = 0; this._finishReload(); } }
    this.bloom = damp(this.bloom, 0, 6, dt);
    this.recoilKick = damp(this.recoilKick, 0, 12, dt);
    this.recoilPitch = damp(this.recoilPitch, 0, 10, dt);

    // ADS / scope
    const d = this.def();
    this.ads = this.game.input.buttons[2] && !d.melee;
    const baseFov = (this.game.settings && this.game.settings.data.fov) || 80;
    const targetFov = this.ads ? (d.adsFov || 60) : baseFov;
    this.fov = damp(this.fov, targetFov, 16, dt);
    this.game.engine.setFov(this.fov);
    this.game.hud.setScope(this.ads && d.scope);

    // viewmodel bob/sway/recoil/swing
    const pl = this.game.player;
    const moving = pl.onGround && (Math.abs(pl.vel.x) + Math.abs(pl.vel.z)) > 1.5;
    this._bobT += dt * (moving ? 9 : 3);
    const bobX = Math.cos(this._bobT) * (moving ? 0.012 : 0.004);
    const bobY = Math.abs(Math.sin(this._bobT)) * (moving ? 0.016 : 0.004);
    const reloadDip = this.reloading > 0 ? -0.12 * Math.sin((1 - this.reloading / (d.reload * pl.reloadMult)) * Math.PI) : 0;
    const adsX = this.ads ? -this.basePos.x : 0, adsY = this.ads ? 0.06 : 0, adsZ = this.ads ? 0.12 : 0;
    this.group.position.set(
      this.basePos.x + adsX + bobX - this.game.input.mouseDX * 0.00003,
      this.basePos.y + adsY + bobY + reloadDip + this.game.input.mouseDY * 0.00003,
      this.basePos.z + adsZ + this.recoilKick,
    );
    const swingRot = this._swing > 0 ? Math.sin((1 - this._swing / 0.18) * Math.PI) * 1.1 : 0;
    this.group.rotation.x = this.recoilKick * 1.2 + reloadDip * 1.5 - swingRot;
    this.group.rotation.z = swingRot * 0.5;
    // spinning magazine (idle slow + fast while firing, tied to recoil)
    const mm = this.magMeshes[this.cur];
    if (mm) { const sm = WEAPONS[this.cur].spinMag; mm.rotation[sm.axis] = damp(mm.rotation[sm.axis], mm._targetRot, 16, dt); } // eases to the per-shot target -> steps in semi, smooth in auto

    // grenades
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const g = this.projectiles[i];
      g.fuse -= dt;
      let boom = g.fuse <= 0;
      if (g.rocket) { // straight, fast, detonates on contact
        const dir = this._tmp.copy(g.vel).normalize(), stepLen = g.vel.length() * dt;
        g.mesh.position.addScaledVector(g.vel, dt);
        const rp = g.mesh.position;
        if (rp.y < 0.2) boom = true;
        if (!boom) for (const e of this.game.enemies.active) { if (!e.alive) continue; if (Math.hypot(e.pos.x - rp.x, e.pos.z - rp.z) < e.radius + 0.7 && rp.y < e.pos.y + e.height + 0.5) { boom = true; break; } }
        if (!boom) { const wh = this.game.world.rayHit(rp, dir, stepLen + 0.5); if (wh) boom = true; }
        this.game.effects.impact(rp, dir, 'spark'); // smoke trail
      } else { // tossed grenade: gravity + bounce
        g.vel.y -= 22 * dt; g.mesh.position.addScaledVector(g.vel, dt);
        g.mesh.rotation.x += dt * 6; g.mesh.rotation.y += dt * 4;
        if (g.mesh.position.y < 0.11) { g.mesh.position.y = 0.11; g.vel.y *= -0.4; g.vel.x *= 0.6; g.vel.z *= 0.6; }
      }
      if (boom) {
        this.game.effects.explosion(g.mesh.position.clone(), g.radius);
        this.game.enemies.damageInRadius(g.mesh.position, g.radius, g.dmg);
        this.game.engine.scene.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }
}

// Voxel Su-24M "Fencer" — the supply-drop plane. Built nose toward -Z, ~16u long.
// Reads from the ground by silhouette: pointed nose, wide side-by-side cockpit,
// rectangular side intakes, high swing wings, single swept fin + tailplanes, twin exhausts.
function buildSu24() {
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
function _strut(b, a, c, w, color, opts = {}) {
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
function buildSupplyCrate() {
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
function buildChuteRig() {
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
function buildFlare() {
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

// ---------------------------------------------------------------------------
// LootManager — pickups, the radio→Su-24 supply-drop, and OP loot crates.
// ---------------------------------------------------------------------------
class LootManager {
  constructor(game) {
    this.game = game; this.scene = game.engine.scene;
    this.pickups = []; this.boxes = [];
    this.drops = []; this.nearDrop = null; // parachuting supply drops (radio-called)
    this.nearBox = null; this.prompt = null;
    this._buildLootboxes();
  }

  _buildLootboxes() {
    // Map lootboxes removed (2026-05-29) — to be replaced by a radio + supply-drop
    // mechanic. Keys still drop (they'll power that). With this.boxes left empty,
    // openNearby()/update()/reset() naturally no-op. (world.lootSpots kept for reuse
    // as supply-drop landing points.)
  }

  _keyMesh() {
    // Soviet nuclear-launch key: steel tubular key (hollow round bow, long shaft,
    // cross-drilled hole near the pointed tip) on a ball-chain necklace with a
    // stamped «ВС СССР Д-790815» dog tag.
    const b = new MeshBuilder();
    const stHi = 0xc8ccd2, stMid = 0x9aa0a8, stLo = 0x70757d, stSlot = 0x35393f; // steel
    const tagHi = 0xd6d9dd, tagMid = 0xb7babf, tagLo = 0x8c8f95, stamp = 0x4a4d52; // dog tag
    const BX = -0.20; // bow centre x

    // ---- bow (hollow round head) ----
    const bow = new THREE.TorusGeometry(0.13, 0.038, 8, 22); b.geo(bow, BX, 0, 0, stMid, { tint: 0.02 }); bow.dispose();
    const bowHi = new THREE.TorusGeometry(0.13, 0.02, 6, 22); b.geo(bowHi, BX, 0.004, 0.024, stHi); bowHi.dispose();   // lit front arc
    // ---- neck → shaft → cross-hole → pointed tip ----
    b.box(0.09, 0.082, 0.082, BX + 0.115, 0, 0, stMid, { tint: 0.02 });                                   // neck
    const shaft = new THREE.CylinderGeometry(0.046, 0.046, 0.32, 14); b.geo(shaft, 0.11, 0, 0, stMid, { rz: Math.PI / 2, tint: 0.02 }); shaft.dispose();
    b.box(0.30, 0.012, 0.05, 0.11, 0.045, 0, stHi);                                                        // lit crown strip
    b.box(0.30, 0.012, 0.05, 0.11, -0.045, 0, stLo);                                                       // shadow underside
    const collar = new THREE.CylinderGeometry(0.052, 0.052, 0.03, 14); b.geo(collar, 0.18, 0, 0, stHi, { rz: Math.PI / 2 }); collar.dispose(); // raised collar around the hole
    const hole = new THREE.CylinderGeometry(0.02, 0.02, 0.12, 10); b.geo(hole, 0.18, 0, 0, stSlot, { rx: Math.PI / 2 }); hole.dispose();        // cross-drilled hole
    const tip = new THREE.CylinderGeometry(0.0, 0.046, 0.1, 12); b.geo(tip, 0.32, 0, 0, stMid, { rz: -Math.PI / 2, tint: 0.02 }); tip.dispose(); // pointed tip

    // ---- ball-chain necklace loop threaded through the bow (YZ-plane oval) ----
    const NB = 16, RY = 0.19, RZ = 0.062;
    for (let i = 0; i < NB; i++) {
      const t = (i / NB) * TAU, sp = new THREE.SphereGeometry(0.017, 6, 6);
      b.geo(sp, BX, RY * Math.cos(t), RZ * Math.sin(t), i % 2 ? stMid : stHi); sp.dispose();
    }
    // ---- short link chain (loop bottom → dog tag) ----
    for (let i = 0; i < 3; i++) { const sp = new THREE.SphereGeometry(0.016, 6, 6); b.geo(sp, BX, -0.19 - i * 0.036, 0, stHi); sp.dispose(); }
    // ---- stamped dog tag ----
    const TY = -0.36;
    b.box(0.22, 0.12, 0.022, BX, TY, 0, tagMid, { tint: 0.02 });
    b.box(0.18, 0.12, 0.024, BX, TY, 0, tagMid);                          // (rounded look: narrower overlay)
    b.box(0.22, 0.022, 0.026, BX, TY + 0.049, 0, tagHi);                  // lit top edge
    b.box(0.22, 0.022, 0.026, BX, TY - 0.049, 0, tagLo);                  // shadow bottom edge
    const th = new THREE.CylinderGeometry(0.013, 0.013, 0.03, 8); b.geo(th, BX - 0.088, TY + 0.038, 0, stSlot, { rx: Math.PI / 2 }); th.dispose(); // string hole
    for (let i = 0; i < 6; i++) b.box(0.013, 0.02, 0.006, BX - 0.06 + i * 0.026, TY + 0.022, 0.013, stamp);  // row 1 «ВС СССР»
    for (let i = 0; i < 7; i++) b.box(0.013, 0.018, 0.006, BX - 0.07 + i * 0.024, TY - 0.024, 0.013, stamp); // row 2 «Д-790815»

    return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x222a32, emissiveIntensity: 0.45 }));
  }

  _pickupMesh(kind) {
    const b = new MeshBuilder();
    if (kind === 'key') return this._keyMesh();
    if (kind === 'radio') { // Falcon III-style military handheld radio (olive, antenna, green LCD, keypad, battery)
      const olive = 0x3f4a2c, oHi = 0x515c39, oLo = 0x2c331d, blk = 0x16160f, metal = 0x8a8f86, scr = 0x9be86a, btn = 0x202018;
      b.box(0.34, 0.66, 0.16, 0, 0.05, 0, olive, { tint: 0.03 });            // body
      b.box(0.32, 0.07, 0.14, 0, 0.37, 0, oHi);                              // top bevel (lit)
      b.box(0.3, 0.62, 0.03, 0, 0.05, 0.085, oHi, { tint: 0.02 });           // front face panel
      b.box(0.36, 0.2, 0.18, 0, -0.42, 0, oLo, { tint: 0.03 });              // battery pack (bottom)
      b.box(0.37, 0.02, 0.19, 0, -0.31, 0, blk);                             // battery seam
      // top: main whip antenna + collar, left bent connector, middle round connector
      b.box(0.045, 0.5, 0.045, 0.1, 0.62, 0, blk); b.box(0.07, 0.05, 0.07, 0.1, 0.36, 0, metal);
      b.box(0.06, 0.05, 0.06, -0.1, 0.34, 0, metal); b.box(0.06, 0.15, 0.06, -0.1, 0.44, 0, blk); b.box(0.13, 0.05, 0.05, -0.05, 0.52, 0, blk);
      b.box(0.075, 0.17, 0.075, 0.0, 0.42, 0, blk);
      // speaker grille (front upper, dot grid)
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b.box(0.022, 0.022, 0.02, -0.05 + c * 0.05, 0.27 - r * 0.04, 0.1, blk);
      // green LCD screen + dark bezel
      b.box(0.28, 0.13, 0.015, 0, 0.07, 0.1, blk); b.box(0.25, 0.095, 0.02, 0, 0.07, 0.105, scr);
      // keypad: grid of black buttons
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) b.box(0.045, 0.032, 0.02, -0.105 + c * 0.07, -0.09 - r * 0.05, 0.1, btn);
      // left-edge channel knob + switch
      const kn = new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10); b.geo(kn, -0.18, 0.16, 0, blk, { rz: Math.PI / 2 }); kn.dispose();
      b.box(0.04, 0.07, 0.05, -0.18, 0.3, 0, blk);
      return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x243016, emissiveIntensity: 0.45 }));
    }
    if (kind === 'ammo') { // Soviet WW2 ammo box: ribbed olive steel, canvas carry handle, embossed star, side toggle-latch, draped brass belt
      const ol = 0x4e5a2c, olHi = 0x6a773d, olLo = 0x363f1d, olSlot = 0x1f250e, olEdge = 0x808d4c; // olive steel
      const cv = 0xb6985a, cvHi = 0xd0b478, cvLo = 0x8a7040;                                        // canvas webbing
      const mt = 0x6f7563, mtHi = 0x8b9080, mtDk = 0x383b2f;                                        // bare steel fittings
      const brass = 0xc8a23c, copper = 0xb5763a, link = 0x2b2b24;                                   // cartridge belt
      const starGeo = (R) => { const sh = new THREE.Shape(); const ri = R * 0.42; for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, r = (i % 2 === 0) ? R : ri; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y); } sh.closePath(); return new THREE.ShapeGeometry(sh); };
      // shell
      b.box(0.44, 0.34, 0.22, 0, 0, 0, ol, { tint: 0.025 });            // main body
      b.box(0.45, 0.045, 0.232, 0, 0.168, 0, olHi);                     // lit top cap
      b.box(0.452, 0.035, 0.234, 0, -0.165, 0, olLo);                   // shadow base
      b.box(0.454, 0.016, 0.236, 0, 0.085, 0, olSlot);                  // lid seam (recess)
      b.box(0.45, 0.02, 0.234, 0, 0.118, 0, olHi);                      // lid lip (lit)
      b.box(0.018, 0.30, 0.022, -0.215, 0, 0.105, olHi);                // front-left edge highlight
      b.box(0.018, 0.30, 0.022, 0.215, 0, 0.105, olHi);                 // front-right edge highlight
      // ribbed front face + embossed star
      b.box(0.40, 0.022, 0.014, 0, 0.05, 0.116, olHi);                  // top rib
      b.box(0.12, 0.022, 0.014, -0.135, -0.06, 0.116, olHi);            // mid rib (left of star)
      b.box(0.12, 0.022, 0.014, 0.135, -0.06, 0.116, olHi);             // mid rib (right of star)
      b.box(0.40, 0.022, 0.014, 0, -0.135, 0.116, olHi);                // bottom rib
      const sSh = starGeo(0.058); b.geo(sSh, 0, -0.06, 0.114, olSlot, {}); sSh.dispose();  // star shadow
      const sSt = starGeo(0.05); b.geo(sSt, 0, -0.06, 0.119, olEdge, {}); sSt.dispose();   // embossed star
      // canvas carry handle (arch front-to-back) + metal keepers
      b.box(0.085, 0.02, 0.05, 0, 0.178, 0.075, mt);                    // front keeper plate
      b.box(0.085, 0.02, 0.05, 0, 0.178, -0.075, mt);                   // back keeper plate
      b.box(0.07, 0.06, 0.045, 0, 0.205, 0.075, cv, { tint: 0.02 });    // front canvas tab
      b.box(0.07, 0.06, 0.045, 0, 0.205, -0.075, cv, { tint: 0.02 });   // back canvas tab
      b.box(0.058, 0.12, 0.03, 0, 0.27, 0.058, cvHi, { rx: 0.55 });     // front leg
      b.box(0.058, 0.12, 0.03, 0, 0.27, -0.058, cvHi, { rx: -0.55 });   // back leg
      b.box(0.058, 0.028, 0.13, 0, 0.318, 0, cv);                       // top span
      b.box(0.05, 0.012, 0.12, 0, 0.302, 0, cvLo);                      // top span underside
      // side toggle-latch (right face)
      b.box(0.022, 0.17, 0.10, 0.226, -0.01, 0, mt);                    // latch backplate
      b.box(0.03, 0.05, 0.07, 0.236, 0.06, 0, mtHi);                    // upper catch
      b.box(0.028, 0.11, 0.045, 0.24, -0.06, 0, mtDk, { rz: 0.12 });    // toggle lever
      b.box(0.022, 0.03, 0.05, 0.236, -0.13, 0, mtHi);                  // hook tip
      // back hinge bar + knuckles
      const hg = new THREE.CylinderGeometry(0.013, 0.013, 0.42, 8); b.geo(hg, 0, 0.10, -0.112, mt, { rz: Math.PI / 2 }); hg.dispose();
      for (const hx of [-0.13, 0, 0.13]) b.box(0.04, 0.04, 0.03, hx, 0.10, -0.108, mtDk);
      // draped brass cartridge belt (emerges from lid seam, hangs down front-right)
      for (let i = 0; i < 5; i++) {
        const yy = 0.10 - i * 0.05, zz = 0.118 + Math.sin(i * 0.9) * 0.004, bx = 0.12;
        b.box(0.05, 0.034, 0.03, bx - 0.03, yy, zz - 0.004, link);                                              // belt link
        const cs = new THREE.CylinderGeometry(0.017, 0.018, 0.085, 8); b.geo(cs, bx + 0.03, yy, zz, brass, { rz: Math.PI / 2, tint: 0.03 }); cs.dispose();  // brass case
        const tp = new THREE.CylinderGeometry(0.006, 0.016, 0.03, 8); b.geo(tp, bx + 0.088, yy, zz, copper, { rz: -Math.PI / 2 }); tp.dispose();            // bullet tip
      }
      return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x1b2410, emissiveIntensity: 0.5 }));
    }
    if (kind === 'medkit') { // WW2 olive-canvas medic shoulder bag: weathered canvas, leather buckle straps, shoulder strap, red-cross patch
      const cv = 0x615f3a, cvHi = 0x7c7a4e, cvLo = 0x474628, cvSlot = 0x32311a;   // weathered olive canvas
      const le = 0x9a6b35, leHi = 0xb98a4e, leLo = 0x6f4c22;                       // tan leather strap
      const web = 0xa98a52, webHi = 0xc2a368;                                      // shoulder-strap webbing
      const mt = 0x8a8a7c, mtHi = 0xb4b4a4;                                        // steel buckles
      const wht = 0xe9e5d8, whtLo = 0xc6c2b4, red = 0xc23528, redHi = 0xdd4636;    // red-cross patch
      // ---- canvas body + soft rounded ends + weathering ----
      b.box(0.46, 0.30, 0.20, 0, 0, 0, cv, { tint: 0.03 });
      b.box(0.47, 0.05, 0.21, 0, 0.155, 0, cvHi, { tint: 0.02 });        // lit top
      b.box(0.47, 0.035, 0.21, 0, -0.15, 0, cvLo);                       // shadow base
      b.box(0.03, 0.30, 0.20, -0.235, -0.01, 0, cvLo, { tint: 0.02 });   // side gusset L
      b.box(0.03, 0.30, 0.20, 0.235, -0.01, 0, cvLo, { tint: 0.02 });    // side gusset R
      b.box(0.14, 0.10, 0.012, -0.12, 0.06, 0.103, cvHi, { tint: 0.05 }); // worn patch
      b.box(0.10, 0.07, 0.012, 0.14, -0.05, 0.103, cvHi, { tint: 0.05 }); // worn patch
      b.box(0.012, 0.24, 0.012, 0.055, -0.02, 0.103, cvSlot);            // crease
      // ---- front flap (covers top ⅔ + fold over the top) ----
      b.box(0.47, 0.05, 0.22, 0, 0.16, 0, cvHi, { tint: 0.02 });         // fold over the top
      b.box(0.47, 0.20, 0.025, 0, 0.055, 0.11, cv, { tint: 0.03 });      // flap face
      b.box(0.47, 0.04, 0.03, 0, 0.16, 0.112, cvHi);                     // flap top edge (lit)
      b.box(0.47, 0.03, 0.035, 0, -0.045, 0.115, cvLo);                  // flap bottom hem (shadow)
      b.box(0.46, 0.008, 0.005, 0, -0.035, 0.13, cvSlot);               // stitch line
      // ---- two leather buckle straps ----
      for (const sx of [-0.135, 0.135]) {
        b.box(0.055, 0.40, 0.02, sx, 0.0, 0.118, le, { tint: 0.02 });    // strap over the flap
        b.box(0.055, 0.012, 0.022, sx, 0.18, 0.119, leHi);               // lit top
        b.box(0.055, 0.04, 0.022, sx, -0.2, 0.119, leLo);                // tail tip below the bag
        b.box(0.075, 0.06, 0.03, sx, -0.07, 0.128, mt);                  // buckle frame
        b.box(0.078, 0.016, 0.032, sx, -0.045, 0.131, mtHi);             // lit top bar
        b.box(0.05, 0.03, 0.034, sx, -0.07, 0.134, cvSlot);              // buckle gap (dark)
        b.box(0.012, 0.06, 0.02, sx, -0.07, 0.14, mtHi);                 // prong
        b.box(0.06, 0.018, 0.026, sx, -0.13, 0.126, leLo);               // keeper loop
      }
      // ---- shoulder strap: side D-rings + webbing arch over the top ----
      for (const sx of [-1, 1]) {
        b.box(0.03, 0.05, 0.05, sx * 0.235, 0.12, 0, mt);
        const ring = new THREE.TorusGeometry(0.035, 0.012, 6, 12); b.geo(ring, sx * 0.255, 0.14, 0, mtHi, { ry: Math.PI / 2 }); ring.dispose();
      }
      const apex = [0, 0.5, 0], Lm = [-0.17, 0.42, 0], Rm = [0.17, 0.42, 0];
      _strut(b, [-0.255, 0.15, 0], Lm, 0.045, web, { tint: 0.02 });
      _strut(b, Lm, apex, 0.045, web, { tint: 0.02 });
      _strut(b, apex, Rm, 0.045, web, { tint: 0.02 });
      _strut(b, Rm, [0.255, 0.15, 0], 0.045, web, { tint: 0.02 });
      _strut(b, Lm, apex, 0.02, webHi); _strut(b, apex, Rm, 0.02, webHi);          // lit top edge
      // ---- white red-cross patch on the flap ----
      const disc = new THREE.CylinderGeometry(0.085, 0.085, 0.02, 18); b.geo(disc, 0, 0.05, 0.128, wht, { rx: Math.PI / 2 }); disc.dispose();
      const rim = new THREE.CylinderGeometry(0.088, 0.088, 0.012, 18); b.geo(rim, 0, 0.05, 0.123, whtLo, { rx: Math.PI / 2 }); rim.dispose();
      b.box(0.092, 0.032, 0.01, 0, 0.05, 0.139, red); b.box(0.032, 0.092, 0.01, 0, 0.05, 0.139, red);
      b.box(0.092, 0.03, 0.006, 0, 0.052, 0.142, redHi); b.box(0.03, 0.092, 0.006, 0, 0.052, 0.142, redHi);
      return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x241c10, emissiveIntensity: 0.42 }));
    }
    // armor plate
    b.box(0.3, 0.34, 0.16, 0, 0, 0, 0x4f8fe0); b.box(0.16, 0.16, 0.06, 0, 0.02, 0.1, 0x9fd0ff);
    return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x002040, emissiveIntensity: 0.5 }));
  }

  drop(pos, def) {
    const p = this.game.player;
    // keys
    if (def.boss) { for (let i = 0; i < 3; i++) this._spawnPickup('key', pos, 1); }
    else {
      let keyChance = 0.16 * p.keyDropMult;
      if (def.explode || def.scale > 1.4) keyChance *= 1.5;
      if (chc(keyChance)) this._spawnPickup('key', pos, 1);
    }
    // health/ammo/armor
    const roll = Math.random();
    if (roll < 0.05) this._spawnPickup('medkit', pos, 35);
    else if (roll < 0.12) this._spawnPickup('ammo', pos, 1);
    else if (roll < 0.16) this._spawnPickup('armor', pos, 50);
  }

  _spawnPickup(kind, pos, value) {
    const mesh = this._pickupMesh(kind);
    mesh.position.set(pos.x + rr(-0.6, 0.6), 0.6, pos.z + rr(-0.6, 0.6));
    this.scene.add(mesh);
    this.pickups.push({ mesh, kind, value, t: rr(0, TAU), life: 30 });
  }

  // Backpack courier death → a radio + one configurable bonus.
  dropCourier(pos) {
    this._spawnPickup('radio', pos, 1);
    const r = Math.random();
    if (r < 0.4) this._spawnPickup('medkit', pos, 60);
    else if (r < 0.7) this._spawnPickup('ammo', pos, 1);
    else if (r < 0.9) this._spawnPickup('armor', pos, 60);
    else this._spawnPickup('key', pos, 1);
    this.game.hud.toast('📻 Radio dropped! (press T)', 0x6fd0e8);
  }

  // Radio call-in: a Su-24 streaks across the map and releases a parachute crate over a random spot.
  callSupplyDrop() {
    const spots = this.game.world.lootSpots.length ? this.game.world.lootSpots : this.game.world.spawns;
    const target = pick(spots).clone(); target.y = 0;
    const ALT = 38, R = 200, ang = rr(0, TAU), dx = Math.sin(ang), dz = Math.cos(ang);
    const mesh = buildSu24(); mesh.scale.setScalar(1.5); // bigger so the detail reads on the pass
    mesh.position.set(target.x - dx * R, ALT, target.z - dz * R);
    mesh.rotation.y = Math.atan2(dx, dz); // model nose is -Z → face travel direction
    this.scene.add(mesh);
    this.plane = { mesh, dir: new THREE.Vector3(dx, 0, dz), speed: 40, target, alt: ALT, travelled: 0, total: R * 2, released: false, trailT: 0 };
    this.game.hud.toast('📡 Radio: Su-24 inbound!', 0x6fd0e8);
    this.game.hud.bigMessage('ЗАПРОС ПОДТВЕРЖДЁН', 'a Fencer is making a pass — watch the smoke');
    this.game.audio.radioCall(); // Soviet-radio confirmation + epic WW2 sting
    this.plane.jet = this.game.audio.startJetClip() || this.game.audio.startJet(); // real SU-57 clip (fade in/out), else procedural
  }

  _updatePlane(dt) {
    const pl = this.plane; if (!pl) return;
    const step = pl.speed * dt; pl.travelled += step;
    pl.mesh.position.addScaledVector(pl.dir, step);
    pl.mesh.position.y = pl.alt + Math.sin(pl.travelled * 0.04) * 0.6; // gentle bob
    // twin engine contrails — blooming vapour puffs from both exhaust nozzles
    pl.trailT -= dt;
    if (pl.trailT <= 0) {
      pl.trailT = 0.05;
      pl.mesh.updateMatrixWorld();
      for (const cx of [-0.48, 0.48]) this.game.effects.contrailPuff(pl.mesh.localToWorld(new THREE.Vector3(cx, -0.05, 6.3)), { size: 2.1, life: 3.4 });
    }
    if (pl.jet && pl.jet.set) { const pp = this.game.player.pos, mp = pl.mesh.position; const dist = Math.hypot(mp.x - pp.x, mp.y - pp.y, mp.z - pp.z); const near = clamp(1 - (dist - 30) / 170, 0, 1); pl.jet.set(0.25 + near * 0.75, near); }
    // release the crate at closest approach to the target
    if (!pl.released) {
      const ahead = (pl.target.x - pl.mesh.position.x) * pl.dir.x + (pl.target.z - pl.mesh.position.z) * pl.dir.z;
      if (ahead <= 0) { pl.released = true; this._spawnDropCrate(pl.target, pl.mesh.position.y - 2); this.game.audio.uiClick(); }
    }
    if (pl.travelled >= pl.total) { if (pl.jet) pl.jet.stop(); this.scene.remove(pl.mesh); pl.mesh.geometry.dispose(); pl.mesh.material.dispose(); this.plane = null; }
  }

  _spawnDropCrate(pos, fromY) {
    const grp = new THREE.Group(); grp.position.set(pos.x, fromY, pos.z);
    const crate = buildSupplyCrate();
    crate.material.emissive.setHex(0x3a2a00); crate.material.emissiveIntensity = 0.7; // glows once landed
    crate.castShadow = true; grp.add(crate);
    const { canopy: chute, rig: lines } = buildChuteRig();   // segmented canopy + crossed risers + carabiners
    grp.add(chute); grp.add(lines);
    this.scene.add(grp);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 130, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.26, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    beam.position.set(pos.x, 65, pos.z); this.scene.add(beam);
    this.drops.push({ grp, crate, chute, lines, beam, pos: pos.clone(), y: fromY, state: 'falling', sway: rr(0, TAU), opened: false });
    this.game.hud.toast('📦 Supply drop released!', 0xff8a3a);
  }

  _openDrop(d) {
    d.opened = true;
    const key = lootWeapon(), rarity = weightedPick([{ v: 'rare', w: 1 }, { v: 'epic', w: 3 }, { v: 'legendary', w: 2 }]);
    const p = this.game.player;
    this.game.weapons.grant(key, rarity); this.game.weapons.select(key);
    p.hp = p.maxHp; this.game.hud.setHealth(p.hp, p.maxHp);
    p.armor = p.armorMax; this.game.hud.setArmor(p.armor, p.armorMax);
    this.game.weapons.refillAll();
    this.game.hud.toast(`📦 ${RARITY[rarity].name} ${WEAPONS[key].name} + full heal/ammo/armor!`, RARITY[rarity].color, RARITY[rarity].name);
    this.game.hud.bigMessage('SUPPLY CLAIMED', `${WEAPONS[key].name} · health, armor & ammo topped`);
    this.game.audio.buy();
    this.game.effects.stuffing(d.pos.clone().setY(1.4), RARITY[rarity].color, 32, 7);
    this._disposeDrop(d); const i = this.drops.indexOf(d); if (i >= 0) this.drops.splice(i, 1);
  }
  _disposeDrop(d) {
    this.scene.remove(d.grp); this.scene.remove(d.beam);
    d.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    if (d.beam.geometry) d.beam.geometry.dispose(); if (d.beam.material) d.beam.material.dispose();
  }

  openNearby() {
    if (this.nearDrop) { this._openDrop(this.nearDrop); this.nearDrop = null; return; } // claim a landed supply drop (no key needed)
    const lb = this.nearBox;
    if (!lb || lb.open) return;
    if (this.game.player.keys <= 0) { this.game.audio.noMoney(); return; }
    this.game.player.keys--; this.game.hud.setKeys(this.game.player.keys);
    lb.open = true; lb.cd = 8; lb.key.visible = false;
    lb.crate.material.emissiveIntensity = 0.0;
    const key = lootWeapon(), rarity = rollRarity();
    this.game.weapons.grant(key, rarity);
    this.game.weapons.select(key);
    this.game.hud.toast(`GOT: ${WEAPONS[key].name}`, RARITY[rarity].color, RARITY[rarity].name);
    this.game.audio.buy();
    this.game.effects.stuffing(lb.pos.clone().setY(1.2), RARITY[rarity].color, 24, 6);
  }

  update(dt) {
    const p = this.game.player, pp = p.pos;
    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pu = this.pickups[i];
      pu.t += dt * 2; pu.life -= dt;
      pu.mesh.position.y = 0.55 + Math.sin(pu.t) * 0.12; pu.mesh.rotation.y += dt * 2;
      const d = Math.hypot(pu.mesh.position.x - pp.x, pu.mesh.position.z - pp.z);
      if (d < 1.5 && Math.abs(pu.mesh.position.y - (pp.y + 1)) < 2.2) {
        this._collect(pu); this.scene.remove(pu.mesh); pu.mesh.geometry.dispose(); pu.mesh.material.dispose(); this.pickups.splice(i, 1); continue;
      }
      if (pu.life <= 0) { this.scene.remove(pu.mesh); pu.mesh.geometry.dispose(); pu.mesh.material.dispose(); this.pickups.splice(i, 1); }
    }
    this.nearBox = null; // map lootboxes removed; this.boxes is empty
    // supply plane fly-by + parachuting drops
    this._updatePlane(dt);
    this.nearDrop = null; let ndd = 3.6;
    for (const d of this.drops) {
      d.t = (d.t || 0) + dt;
      if (d.state === 'falling') {
        d.y -= dt * 7; d.sway += dt;
        if (d.y <= 0.1) { d.y = 0.1; d.state = 'landed'; d.grp.position.set(d.pos.x, 0.1, d.pos.z); d.chute.visible = false; d.lines.visible = false; this.game.hud.toast('📦 Drop landed — go grab it!', 0xff8a3a); this.game.audio.buy(); }
        else d.grp.position.set(d.pos.x + Math.sin(d.sway) * 1.0, d.y, d.pos.z + Math.cos(d.sway * 0.8) * 1.0);
      } else {
        d.crate.material.emissiveIntensity = 0.6 + Math.sin(d.t * 4) * 0.25;
        d.beam.scale.y = 0.45; d.beam.position.y = 29; d.beam.material.opacity = 0.18;
        const dd = Math.hypot(d.pos.x - pp.x, d.pos.z - pp.z);
        if (!d.opened && dd < ndd) { ndd = dd; this.nearDrop = d; }
      }
    }
    this.prompt = this.nearDrop ? 'Press <b>E</b> to grab the <b>SUPPLY DROP</b> — OP loot!' : null;
  }

  _collect(pu) {
    const p = this.game.player;
    if (pu.kind === 'key') { p.keys += pu.value; this.game.hud.setKeys(p.keys); this.game.audio.uiClick(); this.game.hud.toast('+1 🔑 Key', 0xffd24a); }
    else if (pu.kind === 'radio') { p.radios = (p.radios || 0) + pu.value; this.game.hud.setRadios(p.radios); this.game.audio.buy(); this.game.hud.toast('📻 +1 Radio — press T to call a drop', 0x6fd0e8); }
    else if (pu.kind === 'medkit') { p.hp = Math.min(p.maxHp, p.hp + pu.value); this.game.hud.setHealth(p.hp, p.maxHp); this.game.audio.reloadIn(); this.game.hud.toast('+' + pu.value + ' HP', 0x7fd06a); }
    else if (pu.kind === 'ammo') { this.game.weapons.refillAll(); this.game.audio.reloadClick(); this.game.hud.toast('Ammo refilled', 0xb88a3a); }
    else { p.armor = Math.min(p.armorMax, p.armor + pu.value); this.game.hud.setArmor(p.armor, p.armorMax); this.game.audio.buy(); this.game.hud.toast('+' + pu.value + ' Armor', 0x6fa8e8); }
  }

  reset() {
    for (const pu of this.pickups) { this.scene.remove(pu.mesh); pu.mesh.geometry.dispose(); pu.mesh.material.dispose(); }
    this.pickups.length = 0;
    for (const d of this.drops) this._disposeDrop(d);
    this.drops.length = 0; this.nearDrop = null;
    if (this.plane) { if (this.plane.jet) this.plane.jet.stop(); this.scene.remove(this.plane.mesh); this.plane.mesh.geometry.dispose(); this.plane.mesh.material.dispose(); this.plane = null; }
  }
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3(0, 0, 30); this.vel = new THREE.Vector3();
    this.yaw = Math.PI; this.pitch = 0;
    this.radius = 0.35; this.height = 1.7; this.eye = 1.62;
    this.onGround = true; this.sens = 0.0022;
    this._footT = 0; this._fallVel = 0; this._regenT = 0; this._camY = this.eye;
    this.resetStats();
  }
  resetStats() {
    this.maxHp = 100; this.hp = 100; this.armor = 0; this.armorMax = 100;
    this.money = 0; this.keys = 0; this.radios = 0; this.alive = true;
    this.moveSpeedMult = 1; this.damageMult = 1; this.reloadMult = 1; this.keyDropMult = 1; this.moneyMult = 1;
    this.armorOnWave = 0;
    this.mountedGun = null;
    this.inTank = null;
  }
  reset() {
    this.pos.set(0, 0, 30); this.vel.set(0, 0, 0); this.yaw = Math.PI; this.pitch = 0;
    this.onGround = true; this._regenT = 0; this.resetStats();
  }

  hurt(dmg) {
    if (!this.alive) return;
    if (this.inTank && this.inTank.shielded && this.inTank.shielded()) return; // protected by tank armor (enemy fire hits the tank instead — see captured-tank HP)
    if (this.armor > 0) { const take = Math.min(this.armor, dmg); this.armor -= take; dmg -= take; this.game.hud.setArmor(this.armor, this.armorMax); }
    this.hp -= dmg; this._regenT = 0;
    this.game.audio.playerHurt(); this.game.hud.damageFlash();
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.game.onPlayerDead(); }
    else this.game.hud.setHealth(this.hp, this.maxHp);
  }
  addMoney(n) { this.money += Math.round(n * this.moneyMult); this.game.hud.setMoney(this.money); }
  spend(n) { if (this.money >= n) { this.money -= n; this.game.hud.setMoney(this.money); return true; } return false; }

  update(dt) {
    const input = this.game.input;
    this.yaw -= input.mouseDX * this.sens;
    this.pitch -= input.mouseDY * this.sens; this.pitch = clamp(this.pitch, -1.45, 1.45);

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = (sprint ? 7.6 : 5.2) * this.moveSpeedMult;
    const wish = new THREE.Vector3().addScaledVector(fwd, input.forward).addScaledVector(right, input.strafe);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(speed);
    const accel = this.onGround ? 6 : 1.2;
    this.vel.x = damp(this.vel.x, wish.x, accel, dt);
    this.vel.z = damp(this.vel.z, wish.z, accel, dt);

    if (this.onGround && input.wasPressed('Space')) { this.vel.y = 7.2; this.onGround = false; this.game.audio.jump(); }
    this.vel.y -= 22 * dt; this._fallVel = this.vel.y;
    const wasAir = !this.onGround;
    this.onGround = this.game.world.collide(this.pos, this.vel, this.radius, this.height, dt);
    if (this.onGround && wasAir && this._fallVel < -6) this.game.audio.land(this._fallVel < -12);

    const horiz = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && horiz > 1.5) { this._footT -= dt; if (this._footT <= 0) { this._footT = sprint ? 0.3 : 0.42; this.game.audio.footstep(); } }
    else this._footT = 0;

    if (this.hp < this.maxHp) { this._regenT += dt; if (this._regenT > 4) { this.hp = Math.min(this.maxHp, this.hp + 12 * dt); this.game.hud.setHealth(this.hp, this.maxHp); } }

    this._camY = damp(this._camY, this.pos.y + this.eye, 18, dt);
    const cam = this.game.engine.camera;
    cam.rotation.order = 'YXZ';
    cam.position.set(this.pos.x, this._camY, this.pos.z);
    cam.rotation.y = this.yaw; cam.rotation.x = this.pitch + this.game.weapons.recoilPitch; cam.rotation.z = 0;
  }
}

// ---------------------------------------------------------------------------
// Wave director
// ---------------------------------------------------------------------------
// Wave archetypes — each tilts the spawn mix + count + alive-cap and gets its own banner.
const WAVE_TYPES = {
  normal:   { label: 'WAVE',     sub: 'they come for the stuffing',      countMul: 1.0,  cap: 24, base: { grunt: 30, runner: 22, swarmer: 16, brute: 9, exploder: 8, charger: 6 } },
  horde:    { label: 'HORDE',    sub: 'a tidal wave of plush',           countMul: 1.7,  cap: 34, speedMul: 1.05, base: { swarmer: 52, runner: 34, grunt: 14 } },
  stampede: { label: 'STAMPEDE', sub: 'runners & boomers — keep moving', countMul: 1.15, cap: 28, speedMul: 1.1,  base: { runner: 48, charger: 30, swarmer: 22 } },
  volatile: { label: 'VOLATILE', sub: 'careful — everything pops',        countMul: 1.0,  cap: 22, base: { exploder: 54, charger: 30, grunt: 16 } },
  elite:    { label: 'ELITE',    sub: 'fewer of them, but they are tanks', countMul: 0.62, cap: 18, hpMul: 1.15, base: { brute: 46, titan: 24, grunt: 30 } },
};
// Wave modifiers — optional mutators rolled on top (never on boss waves).
const WAVE_MODS = {
  frenzy: { label: 'FRENZY',     tag: '⚡ Frenzy',     speedMul: 1.25 },
  tough:  { label: 'TOUGH HIDE', tag: '🛡 Tough Hide', hpMul: 1.35 },
  payday: { label: 'PAYDAY',     tag: '💰 Payday',     bountyMul: 1.6 },
  swarm:  { label: 'SWARM',      tag: '🐜 Swarm',      countMul: 1.4 },
  glass:  { label: 'GLASS',      tag: '💢 Glass',      hpMul: 0.55, speedMul: 1.18 },
};
const MINIBOSS_NAMES = ['Stitchjaw', 'Mauler', 'Hugo', 'Ragnar', 'Bramble', 'Gloomgut'];

const BOSS_ROSTER = ['boss', 'tank']; // 'boss' = Tolo, 'tank' = T-90M «MITRI»

class WaveManager {
  constructor(game) { this.game = game; this.wave = 0; this.active = false; this.bountyMul = 1; }
  reset() { this.wave = 0; this.active = false; this.toSpawn = 0; this.bountyMul = 1; this.minibossPending = false; if (this.game.hud) this.game.hud.clearWaveTag(); }
  startWave(n) {
    this.bossPick = null;
    if (this.game.mode === 'longnight') return this._startLongNight(n);
    if (this.game.mp.active && this.game.mp.isHost) { this.game.mp.respawnAll(); this.game.mp.net.send('wave', { n, label: 'WAVE ' + n, sub: 'co-op — hold the line' }); }
    this.wave = n; this.active = true; this.spawned = 0;
    this.isBossWave = (n % 5 === 0);
    if (this.isBossWave) this.bossPick = BOSS_ROSTER[(Math.random() * BOSS_ROSTER.length) | 0];
    if (this._forceBoss) { this.isBossWave = true; this.bossPick = this._forceBoss; this._forceBoss = null; }
    // pick a wave archetype (specials only from wave 3) + an optional modifier (from wave 4)
    let typeKey = 'normal';
    if (!this.isBossWave && n >= 3 && chc(0.5)) typeKey = pick(['horde', 'stampede', 'volatile', 'elite']);
    this.typeKey = typeKey; const t = WAVE_TYPES[typeKey];
    this.mod = (!this.isBossWave && n >= 4 && chc(0.4)) ? WAVE_MODS[pick(Object.keys(WAVE_MODS))] : null;
    const m = this.mod || {};
    this.minibossPending = (!this.isBossWave && n >= 3 && n % 5 === 3); // waves 3, 8, 13, …
    // combined multipliers
    this.speedMul = (t.speedMul || 1) * (m.speedMul || 1);
    this.hpMul = (t.hpMul || 1) * (m.hpMul || 1);
    this.bountyMul = (m.bountyMul || 1);
    this.cap = t.cap || 24;
    this.total = this.isBossWave ? Math.round(6 + n * 1.4) : Math.round((5 + n * 2.3) * (t.countMul || 1) * (m.countMul || 1));
    this.toSpawn = this.total; this.spawnTimer = 0.5;
    this.weights = this._effectiveWeights(typeKey, n);
    if (this.game.player.armorOnWave > 0) { this.game.player.armor = Math.max(this.game.player.armor, Math.min(this.game.player.armorMax, this.game.player.armorOnWave)); this.game.hud.setArmor(this.game.player.armor, this.game.player.armorMax); }
    this.game.hud.setWave(n);
    // banner + persistent tag
    const title = this.isBossWave ? `WAVE ${n}` : `${t.label} ${n}`;
    let sub = this.isBossWave ? (this.bossPick === 'tank' ? 'T-90M «MITRI» ROLLS IN' : 'BOSS TOLO APPROACHES') : t.sub;
    if (this.mod) sub = `${this.mod.label} — ${sub}`;
    this.game.hud.bigMessage(title, sub);
    const tags = [];
    if (this.isBossWave) tags.push({ t: '☠ BOSS' });
    else if (typeKey !== 'normal') tags.push({ t: t.label });
    if (this.minibossPending) tags.push({ t: '☠ Mini-boss' });
    if (this.mod) tags.push({ t: this.mod.tag, mod: true });
    this.game.hud.setWaveTag(tags);
    this.game.audio.waveStart();
  }
  // THE LONG NIGHT: endless escalation, boss every 5th wave, blood-moon swell.
  _startLongNight(n) {
    this.bossPick = null;
    this.wave = n; this.active = true; this.spawned = 0;
    this.isBossWave = (n % 5 === 0); this.minibossPending = false; this.mod = null; this.typeKey = 'normal';
    if (this.isBossWave) this.bossPick = BOSS_ROSTER[(Math.random() * BOSS_ROSTER.length) | 0];
    if (this._forceBoss) { this.isBossWave = true; this.bossPick = this._forceBoss; this._forceBoss = null; }
    const blood = this.game.dayNight && this.game.dayNight.bloodMoon;
    this.speedMul = 1 + Math.min(n * 0.012, 0.45);
    this.hpMul = (1 + (n - 1) * 0.06) * (blood ? 1.2 : 1);
    this.bountyMul = 1;
    this.cap = Math.min(60, 26 + Math.floor(n * 1.6));
    this.total = this.isBossWave ? Math.round(8 + n * 1.6) : Math.round((8 + n * 3.0) * (blood ? 1.3 : 1));
    this.toSpawn = this.total; this.spawnTimer = 0.5; this.clearGrace = 16;
    this.weights = this._longNightWeights(n);
    if (this.game.player.armorOnWave > 0) { this.game.player.armor = Math.max(this.game.player.armor, Math.min(this.game.player.armorMax, this.game.player.armorOnWave)); this.game.hud.setArmor(this.game.player.armor, this.game.player.armorMax); }
    this.game.hud.setWave(n);
    this.game.hud.bigMessage(`WAVE ${n}`, this.isBossWave ? (this.bossPick === 'tank' ? 'T-90M «MITRI» ROLLS IN' : 'BOSS TOLO APPROACHES') : 'more keep coming…');
    const tags = []; if (this.isBossWave) tags.push({ t: '☠ BOSS' }); if (blood) tags.push({ t: '🔴 Blood Moon', mod: true });
    this.game.hud.setWaveTag(tags);
    this.game.audio.waveStart();
  }
  _longNightWeights(n) {
    const w = { swarmer: Math.max(8, 30 - n), runner: 22, grunt: 20 + n * 0.5, charger: 4 + n * 0.3, exploder: 4 + n * 0.3, brute: Math.max(0, (n - 1) * 0.9), titan: Math.max(0, (n - 5) * 0.8) };
    return Object.keys(w).filter((k) => w[k] > 0).map((v) => ({ v, w: w[v] }));
  }
  _updateLongNight(dt) {
    if (!this.active) return;
    if (this.toSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.game.enemies.aliveCount < this.cap) {
        this.spawnTimer = Math.max(0.16, 1.2 - this.wave * 0.04);
        this._spawnOne(); this.toSpawn--;
      }
    } else if (this.game.enemies.aliveCount === 0) {
      this.active = false; this.game.hud.clearWaveTag(); this.game.onWaveCleared(this.wave);
    } else {
      // failsafe: once everything's spawned, don't make the player hunt a lost straggler —
      // after a grace period, non-boss leftovers despawn (bosses must still be killed).
      const bossAlive = this.game.enemies.active.some((e) => e.alive && e.def.boss);
      if (!bossAlive) { this.clearGrace -= dt; if (this.clearGrace <= 0) this.game.enemies.despawnStragglers(); }
    }
  }
  // Spawn weights as a weightedPick array; normal waves creep toward heavier enemies as n climbs.
  _effectiveWeights(typeKey, n) {
    const base = { ...WAVE_TYPES[typeKey].base };
    if (typeKey === 'normal') {
      base.brute = (base.brute || 0) + n * 0.8;
      if (n >= 5) base.titan = (base.titan || 0) + (n - 4) * 1.4;
      base.swarmer = Math.max(4, (base.swarmer || 0) - n * 0.4);
    }
    return Object.keys(base).map((v) => ({ v, w: base[v] }));
  }
  update(dt) {
    if (this.game.mode === 'longnight') return this._updateLongNight(dt);
    if (!this.active) return;
    if (this.toSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.game.enemies.aliveCount < this.cap) {
        this.spawnTimer = Math.max(0.2, 1.4 - this.wave * 0.05);
        this._spawnOne(); this.toSpawn--;
      }
    } else if (this.game.enemies.aliveCount === 0) { this.active = false; this.game.hud.clearWaveTag(); this.game.onWaveCleared(this.wave); }
  }
  _spawnPos() {
    const pp = this.game.player.pos; let best = null, bestD = -1;
    for (let i = 0; i < 5; i++) { const s = pick(this.game.world.spawns); const d = Math.hypot(s.x - pp.x, s.z - pp.z); if (d > bestD) { bestD = d; best = s; } }
    const pos = best.clone(); pos.x += rr(-2, 2); pos.z += rr(-2, 2); return pos;
  }
  _spawnOne() {
    const n = this.wave, pos = this._spawnPos();
    if (this.isBossWave && this.spawned === 0) {
      const hpScale = 1 + (Math.floor(n / 5) - 1) * 0.6;
      const which = this.bossPick || (this.bossPick = BOSS_ROSTER[(Math.random() * BOSS_ROSTER.length) | 0]);
      this._spawnBoss(which, pos, hpScale);
      this.spawned++; return;
    }
    if (this.minibossPending && this.spawned === 0) { this.minibossPending = false; this._spawnMiniboss(pos, n); this.spawned++; return; }
    const type = weightedPick(this.weights);
    const def = ENEMY_TYPES[type];
    const hpScale = (1 + (n - 1) * 0.16) * this.hpMul;
    const spd = def.speed * Math.min(1 + (n - 1) * 0.025, 1.55) * this.speedMul;
    const e = this.game.enemies.spawn(type, pos, Math.round(def.hp * hpScale), spd);
    if (chc(0.01)) this.game.enemies.makeCourier(e); // ~1% rare backpack courier → drops a radio
    this.spawned++;
  }
  _spawnBoss(which, pos, hpScale) {
    if (which === 'tank') {
      const e = this.game.enemies.spawn('tank', pos, Math.round(ENEMY_TYPES.tank.armorHP * hpScale), ENEMY_TYPES.tank.speed);
      e.armorHP = e.armorHPmax = Math.round(ENEMY_TYPES.tank.armorHP * hpScale);
      e.mitriHP = e.mitriHPmax = Math.round(ENEMY_TYPES.tank.mitriHP * Math.min(hpScale, 2.0)); // cap so capture stays viable late-game
      // Task 14: dramatic entrance — tank rolls in from spawn edge toward arena center
      e.entering = true;
      e.entryTarget = { x: 0, z: 0 }; // plaza/arena center
      this.game.hud.bigMessage('T-90M «MITRI» ROLLS IN', 'armored boss inbound');
      this.game.audio.tone(40, 0.6, 'sawtooth', 0.35); // low engine roar entrance sting
      if (!this.game._tankIntroShown) {
        this.game._tankIntroShown = true;
        // Delay the teach banner slightly so it doesn't clash with the entrance bigMessage
        setTimeout(() => {
          if (this.game && this.game.hud) this.game.hud.bigMessage('⚠ T-90M «MITRI»', 'Bullets won\'t dent armor — use EXPLOSIVES on the rear/tracks, or shoot the COMMANDER when he pops out to STEAL the tank!');
        }, 2400);
      }
    } else {
      this.game.enemies.spawn('boss', pos, Math.round(ENEMY_TYPES.boss.hp * hpScale), ENEMY_TYPES.boss.speed);
    }
  }
  _forceTankWave() { this._forceBoss = 'tank'; this.startWave(this.wave + 1); } // DEBUG: forces next wave to be a tank boss
  // A named elite that hijacks the boss bar (no laser/phase-2) and pays out big.
  _spawnMiniboss(pos, n) {
    const baseType = chc(0.5) ? 'titan' : 'brute', def = ENEMY_TYPES[baseType];
    const hpScale = (1 + (n - 1) * 0.16) * this.hpMul * 2.4;
    const e = this.game.enemies.spawn(baseType, pos, Math.round(def.hp * hpScale), def.speed * 0.95 * this.speedMul);
    e.isElite = true; e.name = '☠ ' + pick(MINIBOSS_NAMES);
    e.scale *= 1.18; e.radius = 0.55 * e.scale; e.height = 2.2 * e.scale; e.headY = 1.18 * e.scale;
    e.mesh.scale.setScalar(e.scale);
    this.game.hud.bigMessage('MINI-BOSS', e.name + ' joins the horde!');
  }
}

// ---------------------------------------------------------------------------
// Shop (DOM) — weapons / items tabs. Perks removed by design: hardcore survival,
// no stat-creep upgrades — you live on weapons, ammo, heals and your aim.
// ---------------------------------------------------------------------------
const SHOP_ITEMS = [
  { id: 'ammo', name: 'Ammo Resupply', desc: 'Refill all magazines & reserves.', cost: 300, apply: (g) => g.weapons.refillAll() },
  { id: 'heal', name: 'Patch Kit', desc: 'Restore full health.', cost: 350, apply: (g) => { g.player.hp = g.player.maxHp; g.hud.setHealth(g.player.hp, g.player.maxHp); } },
  { id: 'armor', name: 'Armor Plate (+50)', desc: 'Add 50 armor.', cost: 400, apply: (g) => { g.player.armor = Math.min(g.player.armorMax, g.player.armor + 50); g.hud.setArmor(g.player.armor, g.player.armorMax); } },
  { id: 'nade', name: 'Grenades x2', desc: 'Two more boom-bears.', cost: 400, apply: (g) => { g.weapons.grenades += 2; g.hud.setWeapon(g.weapons); } },
  { id: 'key', name: 'Lootbox Key', desc: 'A key to crack a lootbox.', cost: 500, apply: (g) => { g.player.keys++; g.hud.setKeys(g.player.keys); } },
  // THE LONG NIGHT only:
  { id: 'flashlight', name: 'Flashlight', desc: 'Cuts the dark. Toggle with L. Kept for the whole run.', cost: 600, longnight: true, owned: (g) => g.weapons.flashlightOwned, apply: (g) => { g.weapons.flashlightOwned = true; g.dayNight.setFlashlight(true); g.hud.setNightGear(g); } },
  { id: 'flares', name: 'Flares x3', desc: 'Throw a glowing flare (C) to light up an area.', cost: 250, longnight: true, apply: (g) => { g.weapons.flares += 3; g.hud.setNightGear(g); } },
];

class Shop {
  constructor(game) {
    this.game = game;
    this.grid = document.getElementById('shopGrid');
    this.tabsEl = document.getElementById('shopTabs');
    this.moneyEl = document.getElementById('shopMoney');
    this.keysEl = document.getElementById('shopKeys');
    this.nextWaveEl = document.getElementById('shopNextWave');
    this.tab = 'items';
    this._buildTabs();
  }
  _buildTabs() {
    this.tabsEl.innerHTML = '';
    for (const [id, label] of [['items', 'Items'], ['weapons', 'Weapons']]) {
      const t = document.createElement('div'); t.className = 'tab' + (id === this.tab ? ' on' : ''); t.textContent = label;
      t.addEventListener('click', () => { this.tab = id; this._render(); });
      t.addEventListener('mouseenter', () => this.game.audio.uiHover());
      this.tabsEl.appendChild(t);
    }
  }
  open(nextWave) { this.nextWaveEl.textContent = nextWave; this.tab = 'weapons'; this._render(); this.game.ui.show('shop'); if (this.game.preview) this.game.preview.setSize(); }

  _render() {
    const g = this.game;
    this.moneyEl.textContent = '$' + g.player.money;
    this.keysEl.textContent = '🔑 ' + g.player.keys;
    for (const t of this.tabsEl.children) t.classList.toggle('on', t.textContent.toLowerCase() === this.tab);
    this.grid.innerHTML = '';
    const pw = document.getElementById('previewWrap'); if (pw) pw.style.display = this.tab === 'weapons' ? 'block' : 'none';
    if (this.tab === 'items') for (const it of SHOP_ITEMS) {
      if (it.longnight && g.mode !== 'longnight') continue; // flashlight/flares only in THE LONG NIGHT
      const owned = it.owned ? it.owned(g) : false;
      this._card(it.name, it.desc, it.cost, owned, () => { if (owned) return; if (g.player.spend(it.cost)) { g.audio.buy(); it.apply(g); this._render(); } else g.audio.noMoney(); }, owned ? 'OWNED' : 'BUY');
    }
    else {
      if (g.preview) g.preview.setSize();
      let first = null, firstEl = null;
      const cards = [];
      const nameEl = document.getElementById('previewName');
      const preview = (k, el) => { if (g.preview) { g.preview.show(k); if (nameEl) nameEl.textContent = WEAPONS[k].name; } for (const c of cards) c.classList.toggle('previewing', c === el); };
      for (const k of WEAPON_ORDER) {
        const d = WEAPONS[k]; if (!d.price) continue;
        const owned = g.weapons.owned[k];
        const el = this._card(d.name, `${d.class} · ${d.melee ? 'melee' : 'firearm'}`, d.price, owned, () => { if (owned) return; if (g.player.spend(d.price)) { g.audio.buy(); g.weapons.grant(k, 'common'); g.weapons.select(k); this._render(); } else g.audio.noMoney(); }, owned ? 'OWNED' : 'BUY');
        cards.push(el);
        // hover or click (touch / no-hover) previews the weapon; the pinned preview stays in view while the grid scrolls
        el.addEventListener('mouseenter', () => preview(k, el));
        el.addEventListener('click', () => preview(k, el));
        if (!first) { first = k; firstEl = el; }
      }
      if (first) preview(first, firstEl);
    }
  }

  _card(name, desc, cost, owned, onBuy, label = 'BUY') {
    const g = this.game;
    const el = document.createElement('div'); el.className = 'item' + (owned ? ' owned' : '');
    const afford = g.player.money >= cost && !owned;
    el.innerHTML = `<div class="nm">${name}</div><div class="ds">${owned ? 'Already owned.' : desc}</div>
      <div class="row"><span class="cost">${owned ? '✓' : '$' + cost}</span>
      <button class="buy" ${afford ? '' : 'disabled'}>${label}</button></div>`;
    const btn = el.querySelector('.buy');
    btn.addEventListener('mouseenter', () => g.audio.uiHover());
    btn.addEventListener('click', (e) => { e.stopPropagation(); onBuy(); }); // don't also trigger the card's preview-on-click
    this.grid.appendChild(el);
    return el;
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
class HUD {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'), hpfill: $('hpfill'), armorfill: $('armorfill'), hpnum: $('hpnum'),
      ammonum: $('ammonum'), wepname: $('wepname'), wepclass: $('wepclass'),
      wave: $('wave'), money: $('money'), keys: $('keys'), radios: $('radios'), score: $('score'),
      msg: $('msg'), vignette: $('vignette'), hitmarker: $('hitmarker'), killfeed: $('killfeed'),
      cross: $('cross'), toast: $('toast'), interact: $('interact'), scope: $('scope'),
      bossbar: $('bossbar'), bossfill: $('bossfill'), bossname: $('bossname'), bosspip: $('bosspip'), left: $('left'),
      heatbar: $('heatbar'), heatfill: $('heatfill'), heatlabel: $('heatlabel'), wavetag: $('wavetag'),
      clock: $('clock'), nightgear: $('nightgear'),
      tankhp: $('tankhp'), tankhpfill: $('tankhpfill'),
    };
    this._hitT = 0; this._msgT = 0;
  }
  show(on) { this.el.hud.classList.toggle('show', on); }
  setHealth(hp, max) { const f = clamp(hp / max, 0, 1); this.el.hpfill.style.width = (f * 100) + '%'; this.el.hpnum.textContent = Math.ceil(hp); this.el.vignette.style.boxShadow = `inset 0 0 200px 40px rgba(200,30,20,${(1 - f) * 0.5})`; }
  setArmor(a, max) { this.el.armorfill.style.width = clamp(a / max, 0, 1) * 100 + '%'; }
  setWeapon(w) {
    const key = w.cur, d = WEAPONS[key], rarity = w.rarity[key] || 'common';
    this.el.wepname.textContent = d.name.toUpperCase();
    this.el.wepname.style.color = `var(--c-${rarity})`;
    const slot = w.ownedOrder().indexOf(key) + 1;
    const mode = d.melee ? '' : (d.auto ? (w.semi[key] ? ' · SEMI' : ' · AUTO') : ' · SEMI');
    this.el.wepclass.textContent = `${d.class} · ${RARITY[rarity].name}${slot ? ' · slot ' + slot : ''}${mode}`;
    if (d.melee) this.el.ammonum.innerHTML = `<span style="font-size:22px">MELEE</span>`;
    else { const res = w.reserve[key] === Infinity ? '∞' : w.reserve[key]; this.el.ammonum.innerHTML = `${w.mag[key]}<span class="res"> / ${res}</span>${w.reloading > 0 ? ' ⟳' : ''}`; }
  }
  setMoney(m) { this.el.money.textContent = '$' + m; }
  setKeys(k) { this.el.keys.textContent = '🔑 ' + k; }
  setRadios(n) { if (this.el.radios) this.el.radios.textContent = n > 0 ? '📻 ' + n : ''; }
  setWaveTag(tags) {
    const el = this.el.wavetag; if (!el) return;
    if (!tags || !tags.length) { el.classList.remove('show'); el.innerHTML = ''; return; }
    el.innerHTML = tags.map((t) => `<span class="wt${t.mod ? ' mod' : ''}">${t.t}</span>`).join('');
    el.classList.add('show');
  }
  clearWaveTag() { const el = this.el.wavetag; if (el) { el.classList.remove('show'); el.innerHTML = ''; } }
  setNightMode(on) {
    if (this.el.clock) this.el.clock.classList.toggle('show', on);
    if (this.el.nightgear) this.el.nightgear.classList.toggle('show', on);
    if (on) this.setNightGear(this.game);
  }
  setClock(info, survive) {
    if (!this.el.clock) return;
    const s = Math.floor(survive), mm = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
    const icon = info.blood ? '🔴' : (info.night ? '🌙' : '☀');
    const label = info.blood ? 'BLOOD MOON' : (info.night ? 'Night ' + info.n : 'Day');
    this.el.clock.innerHTML = `${icon} ${label} <b>·</b> ${mm}:${ss}`;
  }
  setNightGear(g) {
    if (!this.el.nightgear) return;
    const w = g.weapons;
    this.el.nightgear.innerHTML = `<span class="ng${w.flashlightOwned ? ' on' : ' off'}">🔦 ${w.flashlightOwned ? (g.dayNight.flashOn ? 'ON' : 'off') : '—'}</span><span class="ng">🟠 ×${w.flares}</span>`;
  }
  setScore(s) { this.el.score.textContent = s; }
  setWave(n) { this.el.wave.textContent = 'WAVE ' + n; }
  setEnemiesLeft(n) { this.el.left.textContent = n > 0 ? '· ' + n + ' left' : ''; }
  setScope(on) { this.el.scope.classList.toggle('show', !!on); }
  setBoss(frac, name) { this.el.bossbar.classList.add('show'); this.el.bossfill.style.width = clamp(frac, 0, 1) * 100 + '%'; if (name) this.el.bossname.textContent = name; }
  setBossPip(frac) {
    const el = this.el.bosspip; if (!el) return;
    if (frac < 0) { el.classList.remove('show'); if (this.el.bossbar) this.el.bossbar.classList.remove('exposed'); }
    else { el.classList.add('show'); if (this.el.bossbar) this.el.bossbar.classList.add('exposed'); el.style.width = (clamp(frac, 0, 1) * 100) + '%'; }
  }
  hideBoss() { this.el.bossbar.classList.remove('show'); }
  setHeat(frac, over) { this.el.heatbar.classList.add('show'); this.el.heatfill.style.width = clamp(frac, 0, 1) * 100 + '%'; this.el.heatbar.classList.toggle('over', !!over); this.el.heatlabel.textContent = over ? 'OVERHEATED — COOLING' : 'BARREL HEAT'; }
  hideHeat() { this.el.heatbar.classList.remove('show'); }
  setTankHp(frac) {
    const el = this.el.tankhp; if (!el) return;
    if (frac < 0) { el.classList.remove('show'); return; }
    el.classList.add('show');
    const f = clamp(frac, 0, 1); this.el.tankhpfill.style.width = f * 100 + '%';
    this.el.tankhpfill.style.background = f > 0.5 ? 'linear-gradient(90deg,#4caf50,#cddc39)' : (f > 0.25 ? 'linear-gradient(90deg,#ffb300,#ffd54f)' : 'linear-gradient(90deg,#e53935,#ff7043)');
  }
  hitmarker(kill) { const h = this.el.hitmarker; h.classList.toggle('kill', !!kill); h.style.transition = 'none'; h.style.opacity = '1'; this._hitT = 0.12; }
  damageFlash() { this.el.vignette.style.transition = 'box-shadow .05s'; this.el.vignette.style.boxShadow = 'inset 0 0 220px 60px rgba(220,30,20,0.55)'; setTimeout(() => { this.el.vignette.style.transition = 'box-shadow .4s'; this.setHealth(this.game.player.hp, this.game.player.maxHp); }, 60); }
  bigMessage(text, sub = '') { this.el.msg.innerHTML = text + (sub ? `<small>${sub}</small>` : ''); this.el.msg.classList.add('show'); this._msgT = 2.2; }
  kill(name) { const d = document.createElement('div'); d.textContent = '☠ ' + name; this.el.killfeed.appendChild(d); setTimeout(() => d.remove(), 2400); }
  toast(text, color = 0xffffff, tag = '') {
    const d = document.createElement('div');
    const hex = '#' + color.toString(16).padStart(6, '0');
    d.innerHTML = tag ? `${text} <span class="tag" style="background:${hex};color:#1a1206">${tag}</span>` : text;
    d.style.borderColor = hex;
    this.el.toast.appendChild(d); setTimeout(() => d.remove(), 3000);
  }
  setInteract(text) { if (text) { this.el.interact.innerHTML = text; this.el.interact.classList.add('show'); } else this.el.interact.classList.remove('show'); }
  update(dt) {
    if (this._hitT > 0) { this._hitT -= dt; if (this._hitT <= 0) { this.el.hitmarker.style.transition = 'opacity .25s'; this.el.hitmarker.style.opacity = '0'; } }
    if (this._msgT > 0) { this._msgT -= dt; if (this._msgT <= 0) this.el.msg.classList.remove('show'); }
  }
}

class UI {
  constructor() {
    this.overlays = {
      menu: document.getElementById('menu'), pause: document.getElementById('pause'),
      shop: document.getElementById('shop'), gameover: document.getElementById('gameover'),
      settings: document.getElementById('settings'), lobby: document.getElementById('lobby'),
      admin: document.getElementById('admin'),
    };
    this.hint = document.getElementById('hint');
  }
  hideAll() { for (const k in this.overlays) this.overlays[k] && this.overlays[k].classList.remove('show'); }
  show(name) { this.hideAll(); if (this.overlays[name]) this.overlays[name].classList.add('show'); }
}

// ---------------------------------------------------------------------------
// Settings — persisted (localStorage) options, applied live.
// ---------------------------------------------------------------------------
const SETTINGS_DEFAULTS = { sens: 0.0022, sfx: 0.8, music: 0.5, pixel: 2, fov: 80 };

class Settings {
  constructor(game) {
    this.game = game;
    this.data = { ...SETTINGS_DEFAULTS };
    this.returnTo = 'menu';
    this.load(); this._wire(); this.apply();
  }
  load() { try { const s = JSON.parse(localStorage.getItem('engendros_settings') || '{}'); for (const k in this.data) if (typeof s[k] === 'number') this.data[k] = s[k]; } catch (e) {} }
  save() { try { localStorage.setItem('engendros_settings', JSON.stringify(this.data)); } catch (e) {} }
  apply() {
    if (this.game.player) this.game.player.sens = this.data.sens;
    this.game.audio.setVolume(this.data.sfx);
    this.game.audio.setMusicVolume(this.data.music);
    this.game.engine.setPixelScale(this.data.pixel);
    this.game.engine.setFov(this.data.fov);
    this._refresh();
  }
  _refresh() {
    const txt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const val = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    txt('s-sens-v', Math.round(this.data.sens / SETTINGS_DEFAULTS.sens * 100) + '%');
    txt('s-sfx-v', Math.round(this.data.sfx * 100) + '%');
    txt('s-music-v', Math.round(this.data.music * 100) + '%');
    txt('s-pixel-v', this.data.pixel <= 1 ? 'Crisp' : this.data.pixel + '×');
    txt('s-fov-v', this.data.fov + '°');
    val('s-sens', this.data.sens); val('s-sfx', this.data.sfx); val('s-music', this.data.music);
    val('s-pixel', this.data.pixel); val('s-fov', this.data.fov);
  }
  _wire() {
    const bind = (id, key) => { const e = document.getElementById(id); if (!e) return; e.addEventListener('input', () => { this.data[key] = parseFloat(e.value); this.apply(); this.save(); }); };
    bind('s-sens', 'sens'); bind('s-sfx', 'sfx'); bind('s-music', 'music'); bind('s-pixel', 'pixel'); bind('s-fov', 'fov');
    const fs = document.getElementById('s-fullscreen'); if (fs) fs.addEventListener('click', () => this.game.toggleFullscreen());
    const back = document.getElementById('s-back'); if (back) back.addEventListener('click', () => this.close());
  }
  open(from) { this.returnTo = from || 'menu'; this._refresh(); this.game.ui.show('settings'); }
  close() { this.game.ui.show(this.returnTo); }
}

// ---------------------------------------------------------------------------
// WeaponPreview — a small second renderer showing a rotating 3D model of the
// weapon the player is hovering in the shop.
// ---------------------------------------------------------------------------
class WeaponPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x55606e, 1.15));
    const d1 = new THREE.DirectionalLight(0xfff1d0, 1.7); d1.position.set(3, 5, 4); this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x90b0ff, 0.5); d2.position.set(-4, -1, -3); this.scene.add(d2);
    this.cam = new THREE.PerspectiveCamera(32, 1.7, 0.01, 100);
    this.holder = new THREE.Group(); this.scene.add(this.holder);
    this.spin = 0.6; this.cur = null; this.dist = 2;
    this.setSize();
  }
  setSize() {
    const w = this.canvas.clientWidth || 360, h = this.canvas.clientHeight || 200;
    this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }
  show(key) {
    if (this.cur === key) return; this.cur = key;
    while (this.holder.children.length) { const c = this.holder.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }
    const m = buildViewmodel(WEAPONS[key]); m.material.depthTest = true; m.renderOrder = 0; this.holder.add(m);
    const sm = WEAPONS[key].spinMag; if (sm) { const mag = buildMag(sm); mag.material.depthTest = true; mag.renderOrder = 0; mag.position.set(sm.x, sm.y, sm.z); this.holder.add(mag); }
    const box = new THREE.Box3().setFromObject(this.holder);
    const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    for (const c of this.holder.children) c.position.sub(ctr);
    this.dist = Math.max(size.x, size.y, size.z) * 1.7 + 0.35;
    this.spin = 0.6;
  }
  render(dt) {
    this.spin += dt * 0.7; this.holder.rotation.y = this.spin;
    const d = this.dist;
    this.cam.position.set(d * 0.55, d * 0.42, d * 0.8); this.cam.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.cam);
  }
}

// ---------------------------------------------------------------------------
// Admin asset viewer — orbit any 3D asset (weapons model+POV, enemy skins, props)
// and audition every sound. Opened from the menu; its own WebGL canvas.
// ---------------------------------------------------------------------------
class AssetViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x55606e, 1.2));
    const d1 = new THREE.DirectionalLight(0xfff1d0, 1.8); d1.position.set(4, 6, 5); this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x90b0ff, 0.6); d2.position.set(-5, -2, -4); this.scene.add(d2);
    this.cam = new THREE.PerspectiveCamera(35, 1.6, 0.01, 4000);
    this.holder = new THREE.Group(); this.scene.add(this.holder);
    this.spin = 0.6; this.dist = 3; this.pov = false; this.dragX = 0; this.dragY = 0;
    this._drag = false; this._lx = 0; this._ly = 0;
    canvas.addEventListener('pointerdown', (e) => { this._drag = true; this._lx = e.clientX; this._ly = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (x) {} });
    const up = () => { this._drag = false; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointerleave', up);
    canvas.addEventListener('pointermove', (e) => { if (!this._drag) return; this.dragY += (e.clientX - this._lx) * 0.01; this.dragX = clamp(this.dragX + (e.clientY - this._ly) * 0.01, -1.3, 1.3); this._lx = e.clientX; this._ly = e.clientY; });
    this.setSize();
  }
  setSize() {
    const w = this.canvas.clientWidth || 600, h = this.canvas.clientHeight || 380;
    this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }
  clear() {
    while (this.holder.children.length) {
      const c = this.holder.children.pop();
      c.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
    }
  }
  show(obj, pov = false) {
    this.clear(); this.pov = pov; this.dragX = 0; this.dragY = 0; this.spin = 0.6;
    obj.traverse((o) => { if (o.material) { o.material.depthTest = true; o.renderOrder = 0; } });
    this.holder.add(obj);
    if (pov) { obj.position.set(0.3, -0.27, -0.72); }
    else {
      const box = new THREE.Box3().setFromObject(obj);
      const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      obj.position.sub(ctr);
      this.dist = Math.max(size.x, size.y, size.z, 0.5) * 1.6 + 0.4;
    }
  }
  render(dt) {
    if (this.pov) {
      this.cam.fov = 75; this.cam.position.set(0, 0, 0.0001); this.cam.up.set(0, 1, 0); this.cam.lookAt(0, -0.05, -1);
      this.holder.rotation.set(0, 0, 0);
    } else {
      this.spin += dt * 0.5; this.holder.rotation.y = this.spin + this.dragY; this.holder.rotation.x = this.dragX;
      const d = this.dist; this.cam.fov = 35; this.cam.position.set(d * 0.5, d * 0.42, d * 0.85); this.cam.up.set(0, 1, 0); this.cam.lookAt(0, 0, 0);
    }
    this.cam.updateProjectionMatrix();
    this.renderer.render(this.scene, this.cam);
  }
}

class Admin {
  constructor(game) {
    this.game = game; this.tab = 'weapons'; this.pov = false; this.curIdx = 0;
    this.viewer = new AssetViewer(document.getElementById('adminCanvas'));
    this.tabsEl = document.getElementById('adminTabs');
    this.listEl = document.getElementById('adminList');
    this.nameEl = document.getElementById('adminName');
    this.povBtn = document.getElementById('adminPovBtn');
    this._buildTabs();
    this.povBtn.addEventListener('click', () => { this.pov = !this.pov; this.povBtn.classList.toggle('on', this.pov); this._select(this.curIdx); });
  }
  _buildTabs() {
    this.tabsEl.innerHTML = '';
    for (const [id, label] of [['weapons', 'Weapons'], ['enemies', 'Enemies / Skins'], ['props', 'Props'], ['sounds', 'Sounds']]) {
      const t = document.createElement('div'); t.className = 'tab' + (id === this.tab ? ' on' : ''); t.textContent = label;
      t.addEventListener('click', () => { this.tab = id; for (const c of this.tabsEl.children) c.classList.toggle('on', c.textContent === label); this._render(); });
      this.tabsEl.appendChild(t);
    }
  }
  open() { this.game.audio.init(); this.game.ui.show('admin'); this.viewer.setSize(); this._render(); }
  _crate() { return buildSupplyCrate(); }
  _chuteRig() {   // crate + full parachute rigging (canopy, crossed risers, carabiners)
    const grp = new THREE.Group();
    const crate = buildSupplyCrate(); grp.add(crate);
    const { canopy, rig } = buildChuteRig(); grp.add(canopy); grp.add(rig);
    return grp;
  }
  _items() {
    const g = this.game;
    if (this.tab === 'weapons') return WEAPON_ORDER.map((k) => ({ name: WEAPONS[k].name, sub: WEAPONS[k].class, make: () => { const grp = new THREE.Group(); grp.add(buildViewmodel(WEAPONS[k])); const sm = WEAPONS[k].spinMag; if (sm) { const mg = buildMag(sm); mg.position.set(sm.x, sm.y, sm.z); grp.add(mg); } return grp; } }));
    if (this.tab === 'enemies') {
      const list = ENGENDRO_COLORS.map((col) => ({ name: col.name, sub: 'engendro skin', make: () => new THREE.Mesh(buildEngendro(col, 'normal'), voxelMaterial()) }));
      list.push({ name: 'BOSS TOLO', sub: 'boss', make: () => new THREE.Mesh(buildEngendro({ body: 0xede7df, name: 'Tolo' }, 'boss'), voxelMaterial()) });
      list.push({ name: 'mini Tolo', sub: 'phase-2 add', make: () => new THREE.Mesh(buildEngendro({ body: 0xede7df, name: 'mini' }, 'normal'), voxelMaterial()) });
      list.push({ name: 'Mitri (exploder)', sub: 'exploder', make: () => new THREE.Mesh(buildEngendro(ENGENDRO_COLORS[5 % ENGENDRO_COLORS.length], 'exploder'), voxelMaterial()) });
      list.push({ name: 'Boomer (charger)', sub: 'kamikaze', make: () => new THREE.Mesh(buildEngendro({ body: 0x8a2b2b, name: 'Boomer' }, 'charger'), voxelMaterial()) });
      return list;
    }
    if (this.tab === 'props') return [
      { name: 'Su-24M Fencer', sub: 'supply plane', make: () => buildSu24() },
      { name: 'Radio (Falcon III)', sub: 'pickup', make: () => g.loot._pickupMesh('radio') },
      { name: 'Supply crate', sub: 'air drop', make: () => this._crate() },
      { name: 'Parachute rig', sub: 'air drop', make: () => this._chuteRig() },
      { name: 'Lootbox Key', sub: 'pickup', make: () => g.loot._keyMesh() },
      { name: 'Medkit', sub: 'pickup', make: () => g.loot._pickupMesh('medkit') },
      { name: 'Ammo box', sub: 'pickup', make: () => g.loot._pickupMesh('ammo') },
      { name: 'Armor plate', sub: 'pickup', make: () => g.loot._pickupMesh('armor') },
      { name: 'Flare', sub: 'thrown light', make: () => buildFlare() },
    ];
    return [];
  }
  _sounds() {
    const a = this.game.audio;
    return [
      ['📻 Radio call (Su-24)', () => a.radioCall()],
      ['✈ Jet pass (demo)', () => { const j = a.startJetClip() || a.startJet(); if (!j) return; if (j.set) { let t = 0; const id = setInterval(() => { t += 0.1; const near = Math.max(0, 1 - Math.abs(t - 1.6) / 1.6); j.set(0.3 + near * 0.7, near); if (t >= 3.3) { clearInterval(id); j.stop(); } }, 100); } else { setTimeout(() => j.stop(1.4), 3800); } }],
      ['Gunshot', () => a.gunshot({})], ['Explosion', () => a.explosion()],
      ['Reload click', () => a.reloadClick()], ['Reload in', () => a.reloadIn()], ['Dry fire', () => a.dryFire()],
      ['Hit marker', () => a.hitMarker()], ['Headshot', () => a.headshot()], ['Enemy hurt', () => a.enemyHurt()],
      ['Enemy die', () => a.enemyDie()], ['Enemy growl', () => a.enemyGrowl()], ['Player hurt', () => a.playerHurt()],
      ['Footstep', () => a.footstep()], ['Jump', () => a.jump()], ['Land (hard)', () => a.land(true)],
      ['UI click', () => a.uiClick()], ['UI hover', () => a.uiHover()], ['Buy', () => a.buy()], ['No money', () => a.noMoney()],
      ['Wave start', () => a.waveStart()], ['Wave clear', () => a.waveClear()], ['Game over', () => a.gameOver()],
    ];
  }
  _render() {
    this.listEl.innerHTML = '';
    const isSound = this.tab === 'sounds';
    this.povBtn.style.display = this.tab === 'weapons' ? '' : 'none';
    this.viewer.canvas.style.display = isSound ? 'none' : '';
    if (isSound) {
      this.nameEl.textContent = '🔊 Click a sound to play it';
      for (const [label, fn] of this._sounds()) { const el = document.createElement('div'); el.className = 'arow snd'; el.innerHTML = `<span>${label}</span>`; el.addEventListener('click', fn); this.listEl.appendChild(el); }
      return;
    }
    this._cache = this._items(); this._rows = [];
    this._cache.forEach((it, i) => {
      const el = document.createElement('div'); el.className = 'arow'; el.innerHTML = `<span>${it.name}</span><small>${it.sub || ''}</small>`;
      el.addEventListener('click', () => this._select(i)); this.listEl.appendChild(el); this._rows.push(el);
    });
    if (this._cache.length) this._select(0);
  }
  _select(i) {
    if (!this._cache || !this._cache[i]) return;
    this.curIdx = i; this._rows.forEach((r, j) => r.classList.toggle('on', j === i));
    const it = this._cache[i], usePov = this.pov && this.tab === 'weapons';
    this.viewer.show(it.make(), usePov);
    this.nameEl.textContent = it.name + (usePov ? '  ·  POV' : '');
  }
}

// ---------------------------------------------------------------------------
// MountedGun — a fixed M2 .50 cal on a rooftop. Infinite ammo but overheats
// (balanced). Animated feed belt (live rounds in) + ejecting casings (other
// side) + a barrel that glows, shifts colour and smokes as it heats up.
// ---------------------------------------------------------------------------
class MountedGun {
  constructor(game, pos, yaw) {
    this.game = game;
    this.base = pos.clone();
    this.baseYaw = yaw; this.yaw = yaw; this.pitch = 0;
    this.heat = 0; this.overheated = false; this.cd = 0;
    this.dmg = 65; this.rpm = 600; this.range = 380; this.spread = 0.012;
    this.pivot = pos.clone(); this.pivot.y += 1.05;
    this.beltRounds = []; this._smokeT = 0;
    this._build();
  }

  _build() {
    const scene = this.game.engine.scene;
    const metal = 0x42474e, dark = 0x202327, olive = 0x4a5333, brass = 0xc9a44a;

    const tb = new MeshBuilder();
    tb.box(0.12, 1.05, 0.12, 0, 0.52, 0, metal, { tint: 0.02 });
    tb.box(0.06, 1.3, 0.06, 0, 0.5, -0.55, dark, { rx: 0.42 });
    tb.box(0.06, 1.3, 0.06, -0.5, 0.5, 0.42, dark, { rx: -0.32, rz: 0.34 });
    tb.box(0.06, 1.3, 0.06, 0.5, 0.5, 0.42, dark, { rx: -0.32, rz: -0.34 });
    this.tripod = new THREE.Mesh(tb.build(), voxelMaterial());
    this.tripod.castShadow = true; this.tripod.position.copy(this.base); scene.add(this.tripod);

    this.gun = new THREE.Group(); this.gun.rotation.order = 'YXZ';
    this.gun.position.copy(this.pivot); scene.add(this.gun);

    const gb = new MeshBuilder();
    gb.box(0.26, 0.28, 1.0, 0, 0, 0.05, metal, { tint: 0.02 });               // receiver
    gb.box(0.27, 0.1, 1.0, 0, 0.16, 0.05, dark);                              // top cover
    gb.box(0.17, 0.17, 0.7, 0, 0.02, -0.78, metal, { tint: 0.02 });           // perforated jacket
    for (let i = 0; i < 5; i++) { const cyl = new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10); gb.geo(cyl, 0, 0.02, -0.6 - i * 0.12, dark, { rz: Math.PI / 2 }); cyl.dispose(); }
    gb.box(0.5, 0.06, 0.06, 0, 0.0, 0.62, dark);                              // spade grip crossbar
    gb.box(0.06, 0.34, 0.06, -0.22, -0.16, 0.62, dark);                       // left spade
    gb.box(0.06, 0.34, 0.06, 0.22, -0.16, 0.62, dark);                        // right spade
    gb.box(0.12, 0.06, 0.06, 0, -0.04, 0.66, 0x6a6a6a);                       // butterfly trigger
    gb.box(0.06, 0.14, 0.05, 0, 0.22, 0.4, dark);                             // rear sight
    gb.box(0.04, 0.12, 0.04, 0, 0.13, -1.5, dark);                            // front sight
    gb.box(0.24, 0.24, 0.32, 0.3, -0.06, 0.2, olive, { tint: 0.03 });         // ammo can
    gb.box(0.26, 0.04, 0.34, 0.3, 0.08, 0.2, dark);                           // can lid
    this.body = new THREE.Mesh(gb.build(), voxelMaterial()); this.body.castShadow = true; this.gun.add(this.body);

    this.barrelMat = voxelMaterial();
    const bb = new MeshBuilder();
    bb.box(0.09, 0.09, 1.0, 0, 0.02, -1.65, 0xffffff);
    bb.box(0.12, 0.12, 0.12, 0, 0.02, -2.15, 0xffffff);
    this.barrel = new THREE.Mesh(bb.build(), this.barrelMat); this.gun.add(this.barrel);

    this.belt = new THREE.Group(); this.gun.add(this.belt);
    const rgeo = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8);
    for (let i = 0; i < 12; i++) {
      const r = new THREE.Mesh(rgeo, new THREE.MeshLambertMaterial({ color: brass }));
      this.belt.add(r); this.beltRounds.push({ mesh: r, t: i / 12 });
    }
    // rear ring "AA" sight — gunner looks THROUGH it; the target frames in the middle (ring + cross + centre ring)
    const sb = new MeshBuilder();
    const RR = 0.13, sx = 0, sy = 0.52, sz = 0.35, col = 0x0e1013;
    const ring = new THREE.TorusGeometry(RR, 0.011, 6, 22); sb.geo(ring, sx, sy, sz, col); ring.dispose();
    const cring = new THREE.TorusGeometry(0.028, 0.008, 6, 14); sb.geo(cring, sx, sy, sz, col); cring.dispose();
    sb.box(RR * 2, 0.012, 0.012, sx, sy, sz, col);                 // horizontal cross bar
    sb.box(0.012, RR * 2, 0.012, sx, sy, sz, col);                 // vertical cross bar
    sb.box(0.022, 0.42, 0.04, sx, sy - RR - 0.21, sz + 0.02, col); // post down to the receiver
    this.sight = new THREE.Mesh(sb.build(), voxelMaterial({ depthTest: false }));
    this.sight.renderOrder = 1002; this.sight.frustumCulled = false; this.gun.add(this.sight);
    // Eye sits on the gun's firing axis, directly behind the ring centre, so the
    // ring centre, the crosshair and the bullet path are always collinear.
    this._sightCenter = new THREE.Vector3(sx, sy, sz);
    this._camLocal = new THREE.Vector3(sx, sy, sz + 0.80);
    this._layoutBelt();
  }

  _beltPos(t, out) { return out.set(0.12 + t * 0.34, 0.12 - t * t * 0.18, 0.2); }
  _layoutBelt() { const v = new THREE.Vector3(); for (const r of this.beltRounds) { this._beltPos(r.t, v); r.mesh.position.copy(v); r.mesh.rotation.set(0, 0.2, Math.PI / 2); } }

  near(p) { return Math.hypot(p.x - this.base.x, p.z - this.base.z) < 2.4 && Math.abs(p.y - this.base.y) < 2.8; }

  mount() {
    this.game.player.mountedGun = this;
    this.game.weapons.group.visible = false;
    this.game.player.pos.copy(this.base);
    this.yaw = this.baseYaw; this.pitch = 0;
    if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = ''; // keep the crosshair visible — the ring centre frames it
    this.game.audio.reloadIn();
  }
  dismount() {
    if (this.game.player.mountedGun !== this) return;
    this.game.player.mountedGun = null;
    this.game.weapons.group.visible = true;
    const bx = Math.sin(this.baseYaw), bz = Math.cos(this.baseYaw);
    this.game.player.pos.set(this.base.x + bx * 1.4, this.base.y, this.base.z + bz * 1.4);
    this.game.player.vel.set(0, 0, 0); this.game.player._camY = this.base.y + this.game.player.eye;
    if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = '';
    this.game.hud.hideHeat();
  }
  forceReset() {
    if (this.game.player && this.game.player.mountedGun === this) { this.game.player.mountedGun = null; this.game.weapons.group.visible = true; }
    this.heat = 0; this.overheated = false; this.yaw = this.baseYaw; this.pitch = 0; this.gun.rotation.set(0, this.baseYaw, 0);
    if (this.game.hud) { this.game.hud.hideHeat(); if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = ''; }
  }

  controlUpdate(dt) {
    const input = this.game.input, pl = this.game.player;
    this.yaw -= input.mouseDX * pl.sens;
    this.pitch -= input.mouseDY * pl.sens;
    this.yaw = clamp(this.yaw, this.baseYaw - 1.1, this.baseYaw + 1.1);
    this.pitch = clamp(this.pitch, -0.45, 0.45);
    this.gun.rotation.set(this.pitch, this.yaw, 0);
    const cam = this.game.engine.camera; cam.rotation.order = 'YXZ';
    // Place the eye rigidly on the gun's firing axis, behind the ring sight, and
    // rotate it WITH the gun (about the pivot). Eye + ring centre + muzzle now
    // share one line, so the ring centre stays locked on the screen-centre
    // crosshair (= where the rounds actually go) at every pitch/yaw — no drift.
    this.gun.updateMatrixWorld();
    cam.position.copy(this.gun.localToWorld(this._camLocal.clone()));
    cam.rotation.set(this.pitch, this.yaw, 0);
    this.game.engine.setFov((this.game.settings && this.game.settings.data.fov) || 80);
    if (this.cd > 0) this.cd -= dt;
    const firing = input.buttons[0] && !this.overheated;
    if (firing && this.cd <= 0) this._fire();
    this.update(dt, firing);
    this.game.hud.setHeat(this.heat, this.overheated);
  }

  _fire() {
    this.cd = 60 / this.rpm;
    this.heat = Math.min(1, this.heat + 0.02);
    if (this.heat >= 1) this.overheated = true;
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const origin = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).normalize();
    const muzzle = origin.clone().addScaledVector(fwd, 2.1); muzzle.y += 0.04;
    this.game.effects.muzzleFlash(muzzle, fwd, 1.8);
    this.game.audio.gunshot({ body: 110, crack: 0.12, vol: 0.7, hp: 1500, bp: 650 });
    this.game.effects.shell(origin.clone().addScaledVector(fwd, 0.3).addScaledVector(right, -0.28), right.clone().multiplyScalar(-1));
    const dir = fwd.clone(); dir.x += rr(-this.spread, this.spread); dir.y += rr(-this.spread, this.spread); dir.z += rr(-this.spread, this.spread); dir.normalize();
    const eHit = this.game.enemies.rayHit(muzzle, dir, this.range);
    const wHit = this.game.world.rayHit(muzzle, dir, this.range);
    if (eHit && (!wHit || eHit.dist <= wHit.dist)) {
      const dmg = this.dmg * (eHit.head ? 1.6 : 1) * this.game.player.damageMult;
      const killed = this.game.enemies.damage(eHit.enemy, dmg, 'gun', eHit.point);
      this.game.effects.tracer(muzzle, eHit.point, 0xffe08a);
      if (eHit.head) { this.game.audio.headshot(); this.game.hud.hitmarker(true); } else { this.game.audio.hitMarker(); this.game.hud.hitmarker(killed); }
    } else if (wHit) { this.game.effects.tracer(muzzle, wHit.point, 0xffe08a); this.game.effects.impact(wHit.point, wHit.normal, 'spark'); }
    else this.game.effects.tracer(muzzle, muzzle.clone().addScaledVector(dir, this.range), 0xffe08a);
  }

  update(dt, firing) {
    if (!firing) this.heat = Math.max(0, this.heat - 0.3 * dt);
    if (this.overheated && this.heat < 0.3) this.overheated = false;
    const h = this.heat;
    this.barrelMat.emissive.setRGB(Math.min(1, h * 1.4), h * h * 0.55, 0);
    this.barrelMat.emissiveIntensity = h * 1.7;
    this.barrelMat.color.setRGB(0.16 + h * 0.55, 0.17 + h * 0.12, 0.19);
    if (h > 0.45) {
      this._smokeT -= dt;
      if (this._smokeT <= 0) {
        this._smokeT = 0.05; this.gun.updateMatrixWorld();
        const tip = this.gun.localToWorld(new THREE.Vector3(0, 0.07, -1.45));
        this.game.effects._spawn({ pos: tip, vel: new THREE.Vector3(rr(-0.2, 0.2), rr(0.8, 1.8), rr(-0.2, 0.2)), life: rr(0.7, 1.5), size: rr(0.12, 0.28), grav: 1.4, drag: 1.0, color: new THREE.Color(h > 0.85 ? 0x888888 : 0x666666), bounce: 0, floorY: -999, shrink: true });
      }
    }
    if (firing) { const v = new THREE.Vector3(); for (const r of this.beltRounds) { r.t -= dt * 1.1; if (r.t < 0) r.t += 1; this._beltPos(r.t, v); r.mesh.position.copy(v); } }
  }
}

// ---------------------------------------------------------------------------
// CapturedTank — boardable T-90M after Mitri is killed.
// Mirrors the MountedGun mount/dismount/controlUpdate pattern.
// Architected 2-player-ready: each seat is an independent station;
// co-op can later fill the other seat remotely.
// Driver/gunner views + firing are implemented in later tasks.
// ---------------------------------------------------------------------------
class CapturedTank {
  constructor(game, group, pos, yaw) {
    this.game = game;
    this.group = group;
    this.pos = pos.clone();
    this.hullYaw = yaw || 0;
    this.turYaw = yaw || 0;
    this.gunPitch = 0;
    this.hp = this.hpMax = 2200;
    this.cannonAmmo = 16; this.cannonCD = 0;
    this.mgAmmo = 250; this.mgReload = 0;
    this.seats = { driver: { occupant: null }, gunner: { occupant: null } };
    this.active = null;             // 'driver' | 'gunner' | null (local seat)
    this.thermal = true;
    this.stance = 'sight';          // gunner: 'sight' | 'peek'
    this.group.visible = true;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.hullYaw;
  }

  near(p) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 4.5; }

  shielded() { return this.active != null && this.stance !== 'peek'; } // buttoned-up in any seat = armor protects the player

  enter(seat) {
    this.seats[seat].occupant = 'local';
    this.active = seat;
    this.game.player.inTank = this;
    this.game.weapons.group.visible = false;
    if (this.game.audio.reloadIn) this.game.audio.reloadIn();
  }

  switchSeat() {
    this.active = this.active === 'driver' ? 'gunner' : 'driver';
    this.stance = 'sight'; this.peekYaw = null; this.peekPitch = null;
    if (this.game.audio.uiClick) this.game.audio.uiClick();
  }

  leave() {
    this._showOverlay('none');
    if (this.active) this.seats[this.active].occupant = null;
    this.active = null;
    this.game.player.inTank = null;
    this.game.weapons.group.visible = true;
    const bx = Math.sin(this.hullYaw + 1.6), bz = Math.cos(this.hullYaw + 1.6);
    this.game.player.pos.set(this.pos.x + bx * 3, 0, this.pos.z + bz * 3);
    if (this.game.player.vel) this.game.player.vel.set(0, 0, 0);
    if (this.game.hud.setTankHp) this.game.hud.setTankHp(-1);
  }

  hurt(d) {
    if (!this.group || this.hp <= 0) return;
    this.hp -= d;
    if (this.game.engine.shake) this.game.engine.shake(0.15);
    if (this.hp <= 0) this.destroy();
  }

  destroy() {
    if (this._dead) return; this._dead = true;
    const c = new THREE.Vector3(this.pos.x, 1.4, this.pos.z);
    for (let k = 0; k < 4; k++) this.game.effects.explosion(c.clone().add(new THREE.Vector3(rr(-1.5, 1.5), rr(0, 1.5), rr(-1.5, 1.5))), 4);
    if (this.game.audio.enemyDie) this.game.audio.enemyDie();
    if (this.game.engine.shake) this.game.engine.shake(0.5);
    const wasAboard = this.active != null;
    this.leave();                                   // clears player.inTank (so the next hurt isn't shielded) + restores weapons + ejects beside tank
    if (wasAboard) this.game.player.hurt(35);        // ejection damage (now unshielded since leave() cleared inTank)
    if (this.group) this.group.visible = false;
    if (this.game.world.addWreckObstacle) this.game.world.addWreckObstacle(this.pos.clone(), this.hullYaw);
    { // Place visible wreck mesh + register for lingering smoke
      const wreckMesh = buildTankWreck();
      wreckMesh.position.set(this.pos.x, 0, this.pos.z);
      wreckMesh.rotation.y = this.hullYaw;
      this.game.engine.scene.add(wreckMesh);
      if (_tankWrecks.length >= 6) {
        const oldest = _tankWrecks.shift();
        if (oldest.mesh.parent) oldest.mesh.parent.remove(oldest.mesh);
      }
      _tankWrecks.push({ mesh: wreckMesh, pos: { x: this.pos.x, y: 0, z: this.pos.z }, t: 0, _smokeAccum: 0 });
    }
    if (this.game.hud.setTankHp) this.game.hud.setTankHp(-1);  // hide HP bar
    this.game.capturedTank = null;
  }

  controlUpdate(dt) {
    this.game.player.pos.set(this.pos.x, 0, this.pos.z); // player rides inside the tank
    if (this.active === 'driver') this._driver(dt);
    else if (this.active === 'gunner') (this._gunner ? this._gunner(dt) : this._followCam());
    else this._followCam();
    this._tickShells(dt);   // shells fly regardless of seat
    if (this.game.hud.setTankHp) this.game.hud.setTankHp(this.hp / this.hpMax); // show + update HP bar while crewing
    updateTankLights(this.group, this.game);
    this.recoil = Math.max(0, (this.recoil || 0) - dt * 2); // decay recoil (all seats)
    animateTank(this.group, dt, this._lastSpd || 0, this.recoil);
    tankGroundFX(this.group, this.game, dt, this._lastSpd || 0, false); // captured tank: base smoke only
  }

  _followCam() {
    this._showOverlay('none');
    const cam = this.game.engine.camera;
    cam.rotation.order = 'YXZ';
    const back = 8, up = 4;
    cam.position.set(
      this.pos.x - Math.sin(this.hullYaw) * back,
      up,
      this.pos.z - Math.cos(this.hullYaw) * back
    );
    cam.lookAt(this.pos.x, 1.5, this.pos.z);
  }

  _driver(dt) {
    const input = this.game.input;
    const turnRate = 1.1;                                  // rad/s, heavy
    if (input.isDown('KeyA')) this.hullYaw += turnRate * dt;
    if (input.isDown('KeyD')) this.hullYaw -= turnRate * dt;
    let spd = 0; const max = 1.6;
    if (input.isDown('KeyW')) spd = max;
    else if (input.isDown('KeyS')) spd = -max * 0.6;
    this._lastSpd = spd;
    const fwd = new THREE.Vector3(Math.sin(this.hullYaw), 0, Math.cos(this.hullYaw));
    this.pos.x += fwd.x * spd * dt; this.pos.z += fwd.z * spd * dt;
    if (spd !== 0) this._runOver();
    this._collide();
    const lim = this.game.world.HALF - 2.6;
    this.pos.x = clamp(this.pos.x, -lim, lim); this.pos.z = clamp(this.pos.z, -lim, lim);
    this.group.position.set(this.pos.x, 0, this.pos.z); this.group.rotation.y = this.hullYaw;
    // periscope camera: first-person at the driver hatch, looking forward along the hull
    const cam = this.game.engine.camera; cam.rotation.order = 'YXZ';
    cam.position.set(this.pos.x + fwd.x * 1.9, 1.5, this.pos.z + fwd.z * 1.9);
    cam.rotation.set(0, this.hullYaw, 0);
    if (this.game.engine.setFov) this.game.engine.setFov(72);
    this._showOverlay('periscope');
    // crude engine rumble while driving (optional, low vol)
    this._engT = (this._engT || 0) - dt;
    if (this._engT <= 0 && this.game.audio.tone) { this._engT = 0.28; this.game.audio.tone(42, 0.26, 'sawtooth', 0.05 + (spd !== 0 ? 0.04 : 0)); }
  }

  // ---- Task 17: gunner station ------------------------------------------------

  _gunner(dt) {
    // ---- Task 19: commander peek stance (wide free-look, exposed, no firing) ----
    if (this.stance === 'peek') {
      const input = this.game.input, sens = this.game.player.sens || 0.0022;
      this.peekYaw   = (this.peekYaw   == null ? this.turYaw : this.peekYaw) - input.mouseDX * sens;
      this.peekPitch = clamp((this.peekPitch == null ? 0 : this.peekPitch) - input.mouseDY * sens, -0.8, 0.5);
      if (this.group.userData.hatch) this.group.userData.hatch.position.y = 1.6; // hatch up, commander exposed
      const cam = this.game.engine.camera; cam.rotation.order = 'YXZ';
      cam.position.set(this.pos.x, 3.4, this.pos.z);                              // head out of the cupola
      cam.rotation.set(this.peekPitch, this.peekYaw, 0);
      if (this.game.engine.setFov) this.game.engine.setFov((this.game.settings && this.game.settings.data && this.game.settings.data.fov) || 80);
      this._showOverlay('none');
      return; // no firing while peeking
    }

    // ---- sight stance ----
    if (this.group.userData.hatch) this.group.userData.hatch.position.y = 1.0; // hatch down, buttoned-up

    const input = this.game.input;
    const cam   = this.game.engine.camera;
    const sens  = this.game.player.sens || 0.0025;

    // 1. Mouse aim (weighty)
    this.turYaw  -= input.mouseDX * sens;
    this.gunPitch = clamp(this.gunPitch - input.mouseDY * sens, -0.15, 0.4);

    // 2. Apply to rig
    const ud = this.group.userData;
    if (ud.turret)     ud.turret.rotation.y     = this.turYaw - this.hullYaw;
    if (ud.gunMantlet) ud.gunMantlet.rotation.x = -this.gunPitch;

    // 3. Camera down the sight
    cam.rotation.order = 'YXZ';
    const aimFwd = new THREE.Vector3(Math.sin(this.turYaw), 0, Math.cos(this.turYaw));
    cam.position.set(
      this.pos.x - aimFwd.x * 0.4,
      2.7,
      this.pos.z - aimFwd.z * 0.4
    );
    cam.rotation.set(this.gunPitch, this.turYaw, 0);
    if (this.game.engine.setFov) this.game.engine.setFov(this.thermal ? 40 : 45);
    this._showOverlay('sight');
    this._updateSight();

    // 4. Fire timers
    this.cannonCD -= dt;
    if (this.mgReload > 0) this.mgReload -= dt;

    // LMB → cannon
    if (input.buttons[0] && this.cannonCD <= 0 && this.cannonAmmo > 0) {
      this._gunFireCannon();
    }
    // RMB → MG
    if (input.buttons[2]) {
      this._gunFireMG(dt);
    }

  }

  _gunFireCannon() {
    this.cannonCD  = 3.5;
    this.cannonAmmo--;

    const cam = this.game.engine.camera;
    cam.updateMatrixWorld();
    const muz = this.group.userData.muzzle
      ? this.group.userData.muzzle.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(this.pos.x, 2.4, this.pos.z);

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();

    // shell mesh
    this.shells = this.shells || [];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.65),
      new THREE.MeshBasicMaterial({ color: 0xffe060 })
    );
    mesh.position.copy(muz);
    this.game.engine.scene.add(mesh);
    this.shells.push({ mesh, vel: dir.clone().multiplyScalar(70), fuse: 3, radius: 6.5, dmg: 200 });

    this.recoil = 0.5;
    if (this.game.effects.muzzleFlash) this.game.effects.muzzleFlash(muz, dir, 2.6);
    if (this.game.audio.gunshot) this.game.audio.gunshot({ body: 55, crack: 0.3, vol: 1.0, hp: 400, bp: 120 });
    if (this.game.engine.shake) this.game.engine.shake(0.25);

    if (this.cannonAmmo <= 0 && this.game.hud.bigMessage) {
      this.game.hud.bigMessage('OUT OF SHELLS', 'MG only');
    }
  }

  _tickShells(dt) {
    if (!this.shells || this.shells.length === 0) return;
    const enemies = this.game.enemies;
    const scene   = this.game.engine.scene;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.fuse -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const p = s.mesh.position;

      let boom = p.y < 0.2 || s.fuse <= 0;

      // ray along velocity for world collision
      if (!boom && this.game.world.rayHit) {
        const velDir = s.vel.clone().normalize();
        const step   = s.vel.length() * dt + 0.5;
        if (this.game.world.rayHit(p, velDir, step)) boom = true;
      }

      // proximity to any alive enemy
      if (!boom) {
        for (const e of enemies.active) {
          if (!e.alive) continue;
          if (Math.hypot(p.x - e.pos.x, p.z - e.pos.z) < (e.radius || 1) + 0.8) { boom = true; break; }
        }
      }

      if (boom) {
        if (this.game.effects.explosion) this.game.effects.explosion(p.clone(), s.radius);
        enemies.damageInRadius(p.clone(), s.radius, s.dmg);
        if (this.game.engine.shake) this.game.engine.shake(0.2);
        scene.remove(s.mesh);
        this.shells.splice(i, 1);
      } else if (p.y < -5) {
        scene.remove(s.mesh);
        this.shells.splice(i, 1);
      }
    }
  }

  _gunFireMG(dt) {
    if (this.mgReload > 0) return;
    this._mgCD = (this._mgCD || 0) - dt;
    if (this._mgCD > 0) return;
    this._mgCD = 0.08;

    if (this.mgAmmo <= 0) { this.mgReload = 3; this.mgAmmo = 250; return; }
    this.mgAmmo--;

    const cam = this.game.engine.camera;
    cam.updateMatrixWorld();
    const o = this.group.userData.mgMuzzle
      ? this.group.userData.mgMuzzle.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(this.pos.x, 2.4, this.pos.z);

    // camera-forward + small jitter
    const jit = 0.03;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    dir.x += rr(-jit, jit); dir.y += rr(-jit, jit); dir.z += rr(-jit, jit); dir.normalize();

    const range  = 60;
    const enemies = this.game.enemies;
    const eHit = enemies.rayHit(o, dir, range);
    const wHit = this.game.world.rayHit(o, dir, range);

    const eDist = eHit ? eHit.dist : Infinity;
    const wDist = wHit ? wHit.dist : Infinity;
    const endPt = o.clone().addScaledVector(dir, Math.min(eDist, wDist, range));

    if (this.game.effects.tracer) this.game.effects.tracer(o, endPt, 0xfff1a0);

    if (eHit && eDist < wDist) {
      enemies.damage(eHit.enemy, 9, 'gun', eHit.point);
    }

    if (this.game.audio.tone) this.game.audio.tone(180, 0.03, 'square', 0.10);

    if (this.mgAmmo <= 0) {
      this.mgReload = 3;
      this.mgAmmo   = 250;
      if (this.game.audio.tone) this.game.audio.tone(80, 0.2, 'square', 0.2);
    }
  }

  _runOver() {
    const enemies = this.game.enemies;
    for (const e of enemies.active) {
      if (!e.alive || (e.def && e.def.boss) || e.isElite || e.isTank) continue;
      if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < 3.0) {
        enemies.damage(e, (e.hp || 0) + 1, 'contact');
      }
    }
  }

  _collide() {
    const r = 2.6;
    for (const b of this.game.world.boxes) {
      if (b.max.y < 0.6) continue;
      if (this.pos.x + r <= b.min.x || this.pos.x - r >= b.max.x) continue;
      if (this.pos.z + r <= b.min.z || this.pos.z - r >= b.max.z) continue;
      const px = Math.min(b.max.x + r - this.pos.x, this.pos.x - (b.min.x - r));
      const pz = Math.min(b.max.z + r - this.pos.z, this.pos.z - (b.min.z - r));
      if (px < pz) this.pos.x += (this.pos.x < (b.min.x + b.max.x) / 2 ? -px : px);
      else this.pos.z += (this.pos.z < (b.min.z + b.max.z) / 2 ? -pz : pz);
    }
  }

  _updateSight() {
    const c = this.game.canvas || document.getElementById('game');
    if (c) c.classList.toggle('thermal-cam', !!this.thermal);
    const id = (x) => document.getElementById(x);
    const mode = id('ts-mode'); if (mode) mode.textContent = this.thermal ? 'ТЕПЛО' : 'ДЕНЬ';
    const ammo = id('ts-ammo'); if (ammo) ammo.textContent = String(this.cannonAmmo);
    const st = id('ts-state'); if (st) st.textContent = this.cannonAmmo <= 0 ? 'ПУСТО' : (this.cannonCD > 0 ? 'ЗАРЯД' : 'ГОТОВ');
    // range readout: cast forward ray vs enemies + world, show nearer distance
    const cam = this.game.engine.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const o = cam.position.clone();
    const eH = this.game.enemies.rayHit(o, fwd, 400);
    const wH = this.game.world.rayHit(o, fwd, 400);
    let d = eH && (!wH || eH.dist <= wH.dist) ? eH.dist : (wH ? wH.dist : null);
    const rng = id('ts-range'); if (rng) rng.textContent = d != null ? String(Math.round(d * 4)) : '----';
  }

  _showOverlay(which) {
    const ps = document.getElementById('periscope'), ts = document.getElementById('tanksight');
    if (ps) ps.classList.toggle('show', which === 'periscope');
    if (ts) ts.classList.toggle('show', which === 'sight');
    // clear thermal canvas filter whenever we leave the sight stance
    if (which !== 'sight') {
      const c = this.game.canvas || document.getElementById('game');
      if (c) c.classList.remove('thermal-cam');
    }
  }

  forceReset() {
    if (this.game.player && this.game.player.inTank === this) {
      this.game.player.inTank = null;
      this.game.weapons.group.visible = true;
    }
    this.active = null;
    this.seats.driver.occupant = null;
    this.seats.gunner.occupant = null;
    this._showOverlay('none');
    if (this.game.hud) this.game.hud.setTankHp(-1);
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
  }
}

// ---------------------------------------------------------------------------
// Day/Night cycle + celestial sky for THE LONG NIGHT. Drives every light, the
// fog, the sky-shader colours, an arcing sun & moon, a real-constellation
// starfield, a blood-moon variant and the player flashlight. In PURGE mode it
// is idle (held at bright noon).
// ---------------------------------------------------------------------------
const NIGHT_CYCLE = 200;  // seconds for a full day→night→dawn
const DAY_FRAC = 0.45;    // share of the cycle that is daytime
const SKYC = {
  dTop: new THREE.Color(0x3f8fd0), dMid: new THREE.Color(0xbfe3f2), dBot: new THREE.Color(0xe9dcc0),
  nTop: new THREE.Color(0x04060f), nMid: new THREE.Color(0x070a18), nBot: new THREE.Color(0x0c0e1c),
  dusk: new THREE.Color(0xd9662a), blood: new THREE.Color(0x7a1410),
  dFog: new THREE.Color(0xdfd6bd), nFog: new THREE.Color(0x05060e),
  dHemiSky: new THREE.Color(0xdfeaff), dHemiG: new THREE.Color(0xb89b6a), nHemi: new THREE.Color(0x0a1330), nHemiG: new THREE.Color(0x0a0c18),
  white: new THREE.Color(0xffffff), nAmb: new THREE.Color(0x1a2244), bloodAmb: new THREE.Color(0x3a0e0e),
  sunCol: new THREE.Color(0xfff1d0), moonLight: new THREE.Color(0x8fa0d8), bloodMoonLight: new THREE.Color(0xc85038), moonCol: new THREE.Color(0xdfe3ee),
};
// Rough real constellations placed on the night dome (easter egg).
const CONSTELLATIONS = [
  { az: 0.2,  el: 0.32, scale: 90, stars: [[-0.55,0.9],[0.5,0.85],[-0.2,0.05],[0,0],[0.2,-0.05],[-0.45,-0.9],[0.5,-0.85],[0.02,-0.45]], links: [[0,2],[1,4],[2,3],[3,4],[2,5],[4,6],[3,7]] }, // Orion
  { az: -1.7, el: 0.6,  scale: 120, stars: [[-1,0.15],[-0.5,0.22],[0,0.18],[0.45,0.05],[0.5,-0.35],[0,-0.45],[-0.45,-0.3]], links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]] }, // Big Dipper
  { az: 2.0,  el: 0.5,  scale: 95, stars: [[-1,0],[-0.5,0.4],[0,-0.05],[0.5,0.4],[1,0]], links: [[0,1],[1,2],[2,3],[3,4]] }, // Cassiopeia
  { az: 2.9,  el: 0.22, scale: 95, stars: [[0,1],[0,0.25],[0,-0.5],[0,-1],[-0.75,0.05],[0.75,0.05]], links: [[0,1],[1,2],[2,3],[4,1],[1,5]] }, // Cygnus
];

class DayNight {
  constructor(game) {
    this.game = game; const e = game.engine;
    this.cam = e.camera; this.scene = e.scene;
    this.t = 0; this.active = false; this.nightCount = 0; this.bloodMoon = false; this._wasNight = false;
    this._tmp = new THREE.Vector3();

    this.cel = new THREE.Group(); this.cel.visible = false; this.scene.add(this.cel);
    // sun & moon discs (unlit, fog-free so they read against the dome)
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false }));
    this.sunMesh.frustumCulled = false; this.cel.add(this.sunMesh);
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(13, 16, 12), new THREE.MeshBasicMaterial({ color: 0xdfe3ee, fog: false }));
    this.moonMesh.frustumCulled = false; this.cel.add(this.moonMesh);
    // starfield
    const sp = []; for (let i = 0; i < 520; i++) { const u = Math.random() * TAU, v = Math.random() * 0.9 + 0.05; const r = 500; sp.push(Math.cos(u) * Math.sin(v * Math.PI) * r, Math.abs(Math.cos(v * Math.PI)) * r, Math.sin(u) * Math.sin(v * Math.PI) * r); }
    const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false; this.cel.add(this.stars);
    // constellations (brighter points + faint links)
    const cp = [], cl = [];
    for (const k of CONSTELLATIONS) {
      const c = this._dir(k.az, k.el);
      let right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), c); if (right.lengthSq() < 1e-4) right.set(1, 0, 0); right.normalize();
      const top = new THREE.Vector3().crossVectors(c, right).normalize();
      const pts = k.stars.map(([x, y]) => c.clone().addScaledVector(right, x * k.scale / 500).addScaledVector(top, y * k.scale / 500).normalize().multiplyScalar(498));
      for (const p of pts) cp.push(p.x, p.y, p.z);
      for (const [a, b] of k.links) cl.push(pts[a].x, pts[a].y, pts[a].z, pts[b].x, pts[b].y, pts[b].z);
    }
    const cpg = new THREE.BufferGeometry(); cpg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    this.cstars = new THREE.Points(cpg, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 3.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.cstars.frustumCulled = false; this.cel.add(this.cstars);
    const clg = new THREE.BufferGeometry(); clg.setAttribute('position', new THREE.Float32BufferAttribute(cl, 3));
    this.clines = new THREE.LineSegments(clg, new THREE.LineBasicMaterial({ color: 0x4a6a9a, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.clines.frustumCulled = false; this.cel.add(this.clines);

    // flashlight — a spotlight bolted to the camera (off until bought)
    this.flash = new THREE.SpotLight(0xfff0d0, 0, 60, 0.62, 0.4, 0.0);
    this.flash.position.set(0.2, -0.15, 0.2);
    this.flash.target.position.set(0, -0.05, -10);
    this.cam.add(this.flash); this.cam.add(this.flash.target);
    this.flashOn = false;
  }
  _dir(az, el) { return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)); }
  _lc(out, a, b, t) { return out.copy(a).lerp(b, t); }

  reset(active) {
    this.active = active; this.t = 0; this.nightCount = 0; this.bloodMoon = false; this._wasNight = false;
    this.cel.visible = active;
    this.setFlashlight(false);
    // hold bright noon for PURGE; start LONG NIGHT at dawn
    this._apply(active ? 0.0 : 1.0, Math.PI / 2, true);
  }
  setFlashlight(on) { this.flashOn = on; this.flash.intensity = on ? 7 : 0; }
  toggleFlashlight() { if (this.game.weapons.flashlightOwned) { this.setFlashlight(!this.flashOn); this.game.audio.uiClick(); this.game.hud.setNightGear(this.game); } else this.game.hud.bigMessage('NO FLASHLIGHT', 'buy one in the armory (key L)'); }

  info() { const c = (this.t % NIGHT_CYCLE) / NIGHT_CYCLE; const night = c >= DAY_FRAC; return { night, n: this.nightCount, blood: this.bloodMoon && night }; }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const c = (this.t % NIGHT_CYCLE) / NIGHT_CYCLE;
    const day = c < DAY_FRAC;
    const dayT = c / DAY_FRAC;
    const L = day ? clamp(Math.sin(dayT * Math.PI), 0, 1) : 0;
    const ang = (day ? dayT : (c - DAY_FRAC) / (1 - DAY_FRAC)) * Math.PI;
    const isNight = !day;
    if (isNight && !this._wasNight) { this.nightCount++; this.bloodMoon = this.nightCount > 1 && chc(0.25); this.game.onNightStart(this.nightCount, this.bloodMoon); }
    else if (!isNight && this._wasNight) { this.game.onDayStart(); }
    this._wasNight = isNight;
    this._apply(L, ang, day);
  }

  _apply(L, ang, day) {
    const e = this.game.engine, u = e.sky.material.uniforms, blood = this.bloodMoon && !day;
    this._lc(u.top.value, SKYC.nTop, SKYC.dTop, L);
    this._lc(u.mid.value, SKYC.nMid, SKYC.dMid, L);
    this._lc(u.bot.value, SKYC.nBot, SKYC.dBot, L);
    if (day && L < 0.4) { const tw = (0.4 - L) / 0.4; u.bot.value.lerp(SKYC.dusk, tw * 0.85); u.mid.value.lerp(SKYC.dusk, tw * 0.3); }
    if (blood) { u.top.value.lerp(SKYC.blood, 0.5); u.mid.value.lerp(SKYC.blood, 0.35); u.bot.value.lerp(SKYC.blood, 0.25); }
    e.scene.background.copy(u.mid.value);
    this._lc(e.scene.fog.color, SKYC.nFog, SKYC.dFog, L); if (blood) e.scene.fog.color.lerp(SKYC.blood, 0.4);
    e.scene.fog.near = 10 + L * 85; e.scene.fog.far = 72 + L * 568;
    e.hemi.intensity = 0.05 + L * 0.9; this._lc(e.hemi.color, SKYC.nHemi, SKYC.dHemiSky, L); this._lc(e.hemi.groundColor, SKYC.nHemiG, SKYC.dHemiG, L);
    e.ambient.intensity = 0.03 + L * 0.15 + (blood ? 0.05 : 0); this._lc(e.ambient.color, blood ? SKYC.bloodAmb : SKYC.nAmb, SKYC.white, L);
    const dir = this._tmp.set(Math.cos(ang), Math.max(0.06, Math.sin(ang)), 0.35).normalize();
    e.sun.position.copy(this.cam.position).addScaledVector(dir, 200); e.sun.target.position.copy(this.cam.position); e.sun.target.updateMatrixWorld();
    if (day) { e.sun.intensity = L * 2.1; e.sun.color.copy(SKYC.sunCol); }
    else { e.sun.intensity = blood ? 0.18 : 0.12; e.sun.color.copy(blood ? SKYC.bloodMoonLight : SKYC.moonLight); }
    const cm = e.clouds.children[0] && e.clouds.children[0].material; if (cm) cm.opacity = 0.55 * L;
    this.cel.position.copy(this.cam.position);
    this.sunMesh.visible = day && L > 0.01; this.moonMesh.visible = !day;
    (day ? this.sunMesh : this.moonMesh).position.copy(dir).multiplyScalar(480);
    if (!day) this.moonMesh.material.color.copy(blood ? SKYC.blood : SKYC.moonCol);
    const sa = clamp((0.32 - L) / 0.32, 0, 1);
    this.stars.material.opacity = sa * 0.9; this.cstars.material.opacity = sa; this.clines.material.opacity = sa * 0.5;
  }
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Multiplayer (WebRTC P2P via PeerJS) — host-authoritative co-op.
// RemotePlayer renders another player's Flopo avatar (interpolated) with a
// floating name + HP bar and a simple walk animation. MP wires the lobby and
// syncs transforms/enemies/waves/combat + runs the knockdown/revive rules.
// ---------------------------------------------------------------------------
const MP_SKINS = [
  { skin: 0x49c6df, petal: 0xe85ba0 }, { skin: 0xe8a23a, petal: 0x6fcf4f },
  { skin: 0x9b6fe0, petal: 0xffd24a }, { skin: 0x5fd0a0, petal: 0xe8533a },
];
const _v3a = new THREE.Vector3();
const _mpMin = new THREE.Vector3(), _mpMax = new THREE.Vector3();
const _flareWP = new THREE.Vector3();   // scratch: flare flame world-position
function mpEscape(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

class RemotePlayer {
  constructor(game, id, name, skinIdx) {
    this.game = game; this.id = id; this.name = name || 'Flopo';
    this.obj = buildFlopo(MP_SKINS[skinIdx % MP_SKINS.length]);
    game.engine.scene.add(this.obj);
    this.parts = this.obj.userData.parts;
    this.gunAnchor = new THREE.Group(); this.gunAnchor.position.set(0.42, 0.95, 0.34); this.obj.add(this.gunAnchor); this._wep = null;
    this.pos = new THREE.Vector3(0, 0, 30); this.tpos = this.pos.clone();
    this.yaw = 0; this.tyaw = 0; this.pitch = 0;
    this.hp = 100; this.maxHp = 100; this.down = false; this.dead = false;
    this._animT = 0; this._spd = 0; this._lastx = 0; this._lastz = 30;
    const wrap = document.getElementById('mp-labels');
    this.label = document.createElement('div'); this.label.className = 'mp-label';
    this.label.innerHTML = '<span class="mp-name"></span><span class="mp-hpwrap"><i class="mp-hp"></i></span>';
    this.label.querySelector('.mp-name').textContent = this.name;
    this._hpEl = this.label.querySelector('.mp-hp');
    if (wrap) wrap.appendChild(this.label);
  }
  setTransform(s) { this.tpos.set(s.x, s.y || 0, s.z); this.tyaw = s.yaw; this.pitch = s.pitch || 0; this.down = !!s.down; this.dead = !!s.dead; if (s.wep && s.wep !== this._wep) { this._wep = s.wep; this.setWeapon(s.wep); } }
  setHP(hp, maxHp) { this.hp = hp; if (maxHp) this.maxHp = maxHp; }
  update(dt, cam) {
    const k = 1 - Math.exp(-15 * dt);
    this.pos.lerp(this.tpos, k);
    let dy = this.tyaw - this.yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU; this.yaw += dy * k;
    const mv = Math.hypot(this.pos.x - this._lastx, this.pos.z - this._lastz) / Math.max(dt, 1e-3);
    this._spd = damp(this._spd, mv, 8, dt); this._lastx = this.pos.x; this._lastz = this.pos.z;
    const o = this.obj, p = this.parts;
    o.position.set(this.pos.x, this.pos.y, this.pos.z);
    if (this.dead || this.down) {
      o.rotation.set(-Math.PI * 0.46, this.yaw, 0); o.position.y = this.pos.y + 0.35;
      p.legL.rotation.x = p.legR.rotation.x = p.armL.rotation.x = p.armR.rotation.x = 0;
      if (this.gunAnchor) this.gunAnchor.visible = false;
    } else {
      o.rotation.set(0, this.yaw, 0);
      const moving = this._spd > 0.7;
      this._animT += dt * (moving ? 9 : 2.6);
      const sw = Math.sin(this._animT) * (moving ? 0.6 : 0.07);
      p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
      p.armL.rotation.x = -sw * 0.7; p.armR.rotation.x = sw * 0.7;
      p.head.rotation.x = clamp(this.pitch, -0.5, 0.5) * 0.5;
      o.position.y = this.pos.y + (moving ? Math.abs(Math.sin(this._animT)) * 0.06 : 0);
      if (this.gunAnchor) this.gunAnchor.visible = true;
    }
    const hp = _v3a.set(this.pos.x, this.pos.y + 2.5, this.pos.z).project(cam);
    if (hp.z > 1 || hp.z < -1) { this.label.style.display = 'none'; return; }
    this.label.style.display = 'block';
    this.label.style.left = ((hp.x * 0.5 + 0.5) * window.innerWidth) + 'px';
    this.label.style.top = ((-hp.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    this._hpEl.style.width = clamp((this.hp / this.maxHp) * 100, 0, 100) + '%';
    this.label.classList.toggle('down', this.down || this.dead);
  }
  setWeapon(key) {
    while (this.gunAnchor.children.length) { const c = this.gunAnchor.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }
    const def = WEAPONS[key]; if (!def) return;
    const m = buildViewmodel(def); if (m.material) { m.material.depthTest = true; m.renderOrder = 0; }
    m.scale.setScalar(0.5); m.rotation.set(0, Math.PI, 0); m.position.set(0, 0, 0);
    this.gunAnchor.add(m);
  }
  dispose() {
    this.game.engine.scene.remove(this.obj);
    this.obj.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    if (this.label) this.label.remove();
  }
}

class MP {
  constructor(game) {
    this.game = game; this.net = new Net();
    this.active = false; this.isHost = false; this.myId = null; this.name = '';
    this.remotes = new Map(); this.roster = new Map(); this.pstate = new Map(); this.ghosts = new Map();
    this.chosenSkin = 0; this._hadBoss = false;
    this._xfT = 0; this._snapT = 0; this._reviveT = 0;
    this.frozen = false; this._localDown = false; this._localDead = false; this._localWaiting = false;
    this.myPing = 0; this._pingT = 0; this._pstatT = 0; this._sbOpen = false;
    this._wireNet(); this._wireScoreboard();
    this._hb = setInterval(() => { if (this.active && !this.isHost && (performance.now() - (this.net.lastRecv || 0)) > 7000) this._hostGone(); }, 2000);
  }
  // ---- lobby ----
  startHost(name) {
    this.name = name || 'Host'; this.isHost = true; this.myId = 'host';
    this.roster.set('host', { name: this.name, skin: this.chosenSkin || 0 });
    const code = makeRoomCode();
    this.net.onPeerOpen = (c) => this._lobbyMsg(`Room code: <b>${c}</b> — share it. Waiting for players…`, c);
    this.net.onError = (t) => this._lobbyMsg(t === 'unavailable-id' ? 'Code taken — retry.' : 'Network error: ' + t);
    this.net.host(code); this._renderRoster();
  }
  startJoin(code, name) {
    if (!code) { this._lobbyMsg('Enter a room code.'); return; }
    this.name = name || 'Player'; this.isHost = false; this.myId = null;
    this.net.onPeerOpen = () => this._lobbyMsg('Connecting to ' + code + '…');
    this.net.onConnect = () => { this.myId = this.net.selfId; this.net.lastRecv = performance.now(); this.net.send('hello', { name: this.name, skin: this.chosenSkin || 0 }); this._lobbyMsg('Connected! Waiting for host to start…'); };
    this.net.onError = (t) => this._lobbyMsg(t === 'peer-unavailable' ? 'No room with that code.' : 'Network error: ' + t);
    this.net.join(code.trim().toUpperCase());
  }
  leave() {
    try { this.net.close(); } catch (e) {}
    for (const [, rp] of this.remotes) rp.dispose();
    this.remotes.clear(); this.roster.clear(); this.pstate.clear(); this.ghosts.clear();
    this.active = false; this.isHost = false; this.frozen = false;
    this.net = new Net(); this._wireNet();
  }
  _lobbyMsg(html, code) { const el = document.getElementById('mp-status'); if (el) el.innerHTML = html; if (code) { const ci = document.getElementById('mp-mycode'); if (ci) ci.textContent = code; } }
  _renderRoster() {
    const el = document.getElementById('mp-roster'); if (el) { const names = [...this.roster.values()].map(p => p.name); el.innerHTML = (names.map(n => `<div class="mp-rosteritem">🌸 ${n}</div>`).join('') || '<div class="mp-rosteritem">…</div>'); }
    const sb = document.getElementById('mpStartBtn'); if (sb) sb.style.display = (this.isHost && this.net.connected) ? 'block' : 'none';
  }
  hostStart() { if (!this.isHost) return; this.active = true; this._initHostStates(); this.net.send('start', { mode: this.game.mode || 'purge' }); this.game._enterMP('purge'); }
  _initHostStates() { this.pstate.clear(); for (const [id, info] of this.roster) this.pstate.set(id, this._freshState(info)); }
  _freshState(info) { return { hp: 100, maxHp: 100, armor: 0, armorMax: 100, down: false, downT: 0, waiting: false, dead: false, downs: 0, name: info.name, skin: info.skin }; }
  // ---- net wiring ----
  _wireNet() {
    const n = this.net, g = this.game;
    n.onDisconnect = (pid) => {
      if (this.remotes.has(pid)) { this.remotes.get(pid).dispose(); this.remotes.delete(pid); }
      this.roster.delete(pid); this.pstate.delete(pid);
      if (this.isHost) { this.net.send('roster', this._rosterArr()); this._renderRoster(); this._checkGameOver(); }
      else if (this.active) { this._hostGone(); }
    };
    n.on('hello', (d, from) => {
      if (!this.isHost) return;
      const skin = (d.skin != null) ? d.skin : this.roster.size;
      this.roster.set(from, { name: (d.name || 'Player').slice(0, 14), skin });
      this.net.send('roster', this._rosterArr()); this._renderRoster();
      if (this.active) { this.pstate.set(from, this._freshState(this.roster.get(from))); this._sendWorldTo(from); this._broadcastPState(from); }
    });
    n.on('roster', (arr) => { this.roster.clear(); for (const p of arr) this.roster.set(p.id, { name: p.name, skin: p.skin }); this._renderRoster(); this._syncRemoteObjs(); });
    n.on('start', (d) => { this.active = true; this.net.lastRecv = performance.now(); this.game._enterMP(d.mode || 'purge'); this._syncRemoteObjs(); });
    n.on('xf', (d) => { const rp = this._remote(d.id); if (rp) rp.setTransform(d); });
    n.on('espawn', (d) => this._clientSpawnEnemy(d));
    n.on('esnap', (arr) => this._clientSnap(arr));
    n.on('edie', (d) => this._clientEnemyDie(d));
    n.on('boss', (d) => { if (d.hide) g.hud.hideBoss(); else g.hud.setBoss(d.frac, d.name); });
    n.on('wave', (d) => { if (g.state === 'shop') { g.ui.hideAll(); g.state = 'playing'; g.input.requestLock(); } g.waves.wave = d.n; g.hud.setWave(d.n); g.hud.bigMessage(d.label, d.sub); });
    n.on('waveclear', (d) => { if (g.state === 'playing') { g.hud.bigMessage('WAVE CLEAR', 'visit the armory'); g._mpOpenShop(d.n); } });
    n.on('hit', (d, from) => { if (!this.isHost) return; const e = this._enemyById(d.eid); if (e && e.alive) g.enemies.damage(e, d.dmg, d.src || 'gun', null, from); });
    n.on('phit', (d, from) => { if (this.isHost) this.hostHurt(d.tid, d.dmg, from); });
    n.on('kill', (d) => this._clientKill(d));
    n.on('pstate', (d) => this._applyPState(d));
    n.on('revive', (d, from) => { if (this.isHost) this.hostRevive(d.tid, from); });
    n.on('ping', (d, from) => { if (this.isHost) this.net.sendTo(from, 'pong', d); });
    n.on('pong', (d) => { this.myPing = Math.round(performance.now() - d.t); });
    n.on('pstat', (d) => { const r = this.roster.get(d.id); if (r) { r.ping = d.ping; r.money = d.money; } if (this._sbOpen) this.renderScoreboard(); });
    n.on('feed', (d) => this.game.hud.kill(d.who + ' \u27a4 ' + d.what));
    n.on('gameover', () => this.game._mpGameOver());
  }
  _rosterArr() { return [...this.roster].map(([id, p]) => ({ id, name: p.name, skin: p.skin })); }
  _remote(id) {
    if (id === this.myId) return null;
    if (!this.remotes.has(id)) { const info = this.roster.get(id) || { name: 'Flopo', skin: 1 }; this.remotes.set(id, new RemotePlayer(this.game, id, info.name, info.skin)); }
    return this.remotes.get(id);
  }
  _syncRemoteObjs() { for (const [id, info] of this.roster) if (id !== this.myId && !this.remotes.has(id)) this.remotes.set(id, new RemotePlayer(this.game, id, info.name, info.skin)); }
  // ---- per-frame ----
  update(dt) {
    if (!this.active) return;
    const g = this.game, cam = g.engine.camera;
    this._xfT -= dt;
    if (this._xfT <= 0) {
      this._xfT = 0.066; const p = g.player;
      this.net.broadcast('xf', { id: this.myId, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, down: this._localDown, dead: this._localDead, wep: g.weapons.cur });
    }
    for (const [, rp] of this.remotes) rp.update(dt, cam);
    if (this.isHost) {
      this._snapT -= dt;
      if (this._snapT <= 0) {
        this._snapT = 0.08; const arr = [];
        for (const e of g.enemies.active) if (e.alive) arr.push({ id: e.id, x: +e.pos.x.toFixed(2), z: +e.pos.z.toFixed(2), ry: +e.mesh.rotation.y.toFixed(2), hp: Math.round((e.hp / e.maxHp) * 100) });
        this.net.send('esnap', arr); this._tickDowns();
        let boss = null; for (const e of g.enemies.active) if (e.alive && (e.def.boss || e.isElite)) { boss = e; break; }
        if (boss) { this.net.send('boss', { frac: boss.hp / boss.maxHp, name: boss.name }); this._hadBoss = true; }
        else if (this._hadBoss) { this.net.send('boss', { hide: true }); this._hadBoss = false; }
      }
    } else {
      for (const [, e] of this.ghosts) {
        if (!e.alive) continue;
        e.pos.x = damp(e.pos.x, e._tx, 14, dt); e.pos.z = damp(e.pos.z, e._tz, 14, dt); e.bob += dt * 7;
        e.mesh.position.set(e.pos.x, Math.abs(Math.sin(e.bob)) * 0.08, e.pos.z);
        e.mesh.rotation.y = damp(e.mesh.rotation.y, e._try, 12, dt);
      }
    }
    this._pingT -= dt; if (this._pingT <= 0) { this._pingT = 2; if (!this.isHost) this.net.send('ping', { t: performance.now() }); }
    this._pstatT -= dt; if (this._pstatT <= 0) { this._pstatT = 1; const myPing = this.isHost ? 0 : this.myPing, myMoney = g.player.money; const me = this.roster.get(this.myId); if (me) { me.ping = myPing; me.money = myMoney; } this.net.broadcast('pstat', { id: this.myId, ping: myPing, money: myMoney }); if (this._sbOpen) this.renderScoreboard(); }
    this._updateRevive(dt);
  }
  // ---- enemy sync (host → clients) ----
  onEnemySpawn(e) { if (this.active && this.isHost) this.net.send('espawn', { id: e.id, type: e.type, gk: e.geoKey, cb: e.col.body, vr: e.def.variant, nm: e.name, sc: e.scale }); }
  onEnemyDie(e, killer) { if (this.active && this.isHost) this.net.send('edie', { id: e.id, k: killer }); }
  onBoss(frac, name) { if (this.active && this.isHost) this.net.send('boss', { frac, name }); }
  onBossHide() { if (this.active && this.isHost) this.net.send('boss', { hide: true }); }
  _enemyById(id) { for (const e of this.game.enemies.active) if (e.id === id) return e; return null; }
  _clientSpawnEnemy(d) {
    if (this.ghosts.has(d.id)) return;
    const e = this.game.enemies.spawnGhost(d.id, d.type, d.gk, d.cb, d.vr, d.nm, d.sc);
    e._tx = e.pos.x; e._tz = e.pos.z; e._try = 0; this.ghosts.set(d.id, e);
  }
  _clientSnap(arr) { for (const s of arr) { const e = this.ghosts.get(s.id); if (!e) continue; e._tx = s.x; e._tz = s.z; e._try = s.ry; e.hp = (s.hp / 100) * e.maxHp; } }
  _clientEnemyDie(d) {
    const e = this.ghosts.get(d.id); if (!e) return;
    const top = new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z);
    this.game.effects.stuffing(top, e.col.body, 16, 6); this.game.audio.enemyDie();
    e.alive = false; e.mesh.visible = false;
    const i = this.game.enemies.active.indexOf(e); if (i >= 0) this.game.enemies.active.splice(i, 1);
    this.ghosts.delete(d.id);
  }
  // ---- combat ----
  claimHit(e, dmg, src) { this.net.send('hit', { eid: e.id, dmg, src }); }
  creditKill(killerId, e) {
    const reward = Math.round(e.def.reward * ((this.game.waves.bountyMul || 1) * (e.isElite ? 2.4 : 1)));
    this.net.sendTo(killerId, 'kill', { reward, name: e.name, type: e.type, x: e.pos.x, z: e.pos.z, elite: !!e.isElite, score: e.def.reward + (e.def.boss ? 1500 : 0) + (e.isElite ? 600 : 0) });
    this.feed(((this.roster.get(killerId) || {}).name) || 'Player', e.name);
  }
  _clientKill(d) {
    const g = this.game; g.kills++; g.player.addMoney(d.reward); g.score += d.score; g.hud.setScore(g.score); g.hud.kill(d.name);
    const def = ENEMY_TYPES[d.type]; if (def) g.loot.drop({ x: d.x, y: 0, z: d.z }, def);
    if (d.elite) for (let i = 0; i < 2; i++) g.loot._spawnPickup('key', { x: d.x, y: 0, z: d.z }, 1);
  }
  rayHitPlayers(origin, dir, maxDist) {
    let best = maxDist, hit = null, hp = null;
    for (const [id, rp] of this.remotes) {
      if (rp.dead || rp.down) continue;
      const mn = _mpMin.set(rp.pos.x - 0.42, rp.pos.y, rp.pos.z - 0.42), mx = _mpMax.set(rp.pos.x + 0.42, rp.pos.y + 2.5, rp.pos.z + 0.42);
      const t = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, mn, mx);
      if (t !== null && t < best) { best = t; hit = id; hp = new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t); }
    }
    if (!hit) return null;
    return { id: hit, dist: best, point: hp, head: hp.y >= this.remotes.get(hit).pos.y + 1.5 };
  }
  claimPlayerHit(id, dmg) { if (this.isHost) this.hostHurt(id, dmg, this.myId); else this.net.send('phit', { tid: id, dmg }); }
  // ---- player HP / knockdown / revive (host-authoritative) ----
  hostHurt(id, dmg, attacker) {
    if (!this.isHost) return;
    const s = this.pstate.get(id); if (!s || s.dead || s.waiting || s.down) return;
    if (s.armor > 0) { const t = Math.min(s.armor, dmg); s.armor -= t; dmg -= t; }
    s.hp -= dmg;
    if (s.hp <= 0) { s.hp = 0; s.downs++; if (s.downs >= 4) s.dead = true; else { s.down = true; s.downT = 20; } }
    this._broadcastPState(id);
    if (s.dead) this._checkGameOver();
  }
  hostRevive(tid) { if (!this.isHost) return; const s = this.pstate.get(tid); if (!s || !s.down) return; s.down = false; s.downT = 0; s.hp = Math.round(s.maxHp * 0.5); this._broadcastPState(tid); }
  _tickDowns() { if (!this.isHost) return; for (const [id, s] of this.pstate) { if (s.down) { s.downT -= 0.08; if (s.downT <= 0) { s.down = false; s.waiting = true; this._broadcastPState(id); } } } }
  respawnAll() { if (!this.isHost) return; for (const [id, s] of this.pstate) { if (s.waiting && !s.dead) { s.waiting = false; s.hp = s.maxHp; s.armor = 0; this._broadcastPState(id); } } }
  _broadcastPState(id) { const s = this.pstate.get(id); if (!s) return; const d = { id, hp: s.hp, maxHp: s.maxHp, armor: s.armor, down: s.down, downT: s.downT, waiting: s.waiting, dead: s.dead }; this._applyPState(d); if (id !== this.myId) this.net.send('pstate', d); }
  _applyPState(d) {
    const g = this.game;
    if (d.id === this.myId) {
      g.player.hp = d.hp; g.player.armor = d.armor;
      g.hud.setHealth(d.hp, d.maxHp); g.hud.setArmor(d.armor, g.player.armorMax);
      this._localDown = d.down; this._localDead = d.dead; this._localWaiting = d.waiting;
      this.frozen = d.down || d.dead || d.waiting;
      if (d.dead) g.hud.bigMessage('YOU ARE OUT', 'no lives left');
      else if (d.down) g.hud.bigMessage('DOWNED', 'a teammate can revive you');
      else if (d.waiting) g.hud.bigMessage('WAITING', 'respawn at the next wave');
    } else { const rp = this._remote(d.id); if (rp) { rp.setHP(d.hp, d.maxHp); rp.down = d.down || d.waiting; rp.dead = d.dead; } }
  }
  nearestPlayer(x, z) {
    let best = Infinity, id = null, pos = null;
    const consider = (pid, px, pz, py) => { const s = this.pstate.get(pid); if (!s || s.down || s.dead || s.waiting) return; const dd = (px - x) ** 2 + (pz - z) ** 2; if (dd < best) { best = dd; id = pid; pos = { x: px, y: py, z: pz }; } };
    consider(this.myId, this.game.player.pos.x, this.game.player.pos.z, this.game.player.pos.y);
    for (const [rid, rp] of this.remotes) consider(rid, rp.pos.x, rp.pos.z, rp.pos.y);
    return id ? { id, pos, dist: Math.sqrt(best) } : null;
  }
  // ---- revive interaction ----
  _downedRemoteNear() { const p = this.game.player.pos; for (const [, rp] of this.remotes) if (rp.down && !rp.dead && Math.hypot(rp.pos.x - p.x, rp.pos.z - p.z) < 2.4) return rp; return null; }
  // ---- Tab scoreboard ----
  _wireScoreboard() {
    const toggle = (down) => (e) => {
      if (e.code !== 'Tab' || !this.active) return; e.preventDefault();
      this._sbOpen = down; const el = document.getElementById('mp-scoreboard'); if (el) el.classList.toggle('show', down); if (down) this.renderScoreboard();
    };
    window.addEventListener('keydown', toggle(true)); window.addEventListener('keyup', toggle(false));
  }
  renderScoreboard() {
    const rows = document.getElementById('sb-rows'); if (!rows) return;
    const list = [...this.roster.entries()].map(([id, r]) => ({ id, name: r.name, skin: r.skin || 0, ping: r.ping, money: r.money }));
    list.sort((a, b) => (b.money || 0) - (a.money || 0));
    rows.innerHTML = list.map(e => {
      const sk = MP_SKINS[e.skin % MP_SKINS.length];
      const skinCss = '#' + sk.skin.toString(16).padStart(6, '0'), petalCss = '#' + sk.petal.toString(16).padStart(6, '0');
      const isHostRow = (e.id === 'host');
      const ping = isHostRow ? 'host' : (e.ping == null ? '\u2014' : e.ping + 'ms');
      const pc = isHostRow ? '#9fd0ff' : (e.ping == null ? '#888' : e.ping < 80 ? '#7fd06a' : e.ping < 180 ? '#ffcf5c' : '#e8533a');
      const money = e.money == null ? '' : '$' + e.money;
      const you = e.id === this.myId ? ' <span style="opacity:.55;font-weight:400">(you)</span>' : '';
      return '<div class="sb-row"><span class="sb-skin" style="background:' + skinCss + ';border-color:' + petalCss + '"></span><span class="sb-name">' + mpEscape(e.name) + you + '</span><span class="sb-money">' + money + '</span><span class="sb-ping" style="color:' + pc + '">' + ping + '</span></div>';
    }).join('');
  }
  _sendWorldTo(pid) {
    this.net.sendTo(pid, 'start', { mode: this.game.mode || 'purge' });
    for (const e of this.game.enemies.active) if (e.alive) this.net.sendTo(pid, 'espawn', { id: e.id, type: e.type, gk: e.geoKey, cb: e.col.body, vr: e.def.variant, nm: e.name, sc: e.scale });
    this.net.sendTo(pid, 'wave', { n: this.game.waves.wave, label: 'WAVE ' + this.game.waves.wave, sub: 'co-op — hold the line' });
  }
  _hostGone() { if (!this.active) return; this.active = false; try { this.game.hud.bigMessage('HOST LEFT', 'returning to menu…'); } catch (e) {} this.leave(); this.game.toMenu(); }
  _checkGameOver() {
    if (!this.isHost || !this.active) return;
    let any = false, allDead = true;
    for (const [, s] of this.pstate) { any = true; if (!s.dead) allDead = false; }
    if (any && allDead) { this.net.send('gameover', {}); this.game._mpGameOver(); }
  }
  feed(who, what) { this.game.hud.kill(who + ' \u27a4 ' + what); this.net.broadcast('feed', { who, what }); }
  _updateRevive(dt) {
    if (!this.active || this.frozen) { this._reviveT = 0; return; }
    const rp = this._downedRemoteNear();
    if (rp && this.game.input.isDown('KeyE')) {
      this._reviveT += dt;
      this.game.hud.setInteract(`Reviving <b>${rp.name}</b>… ${Math.max(0, 3.5 - this._reviveT).toFixed(1)}s`);
      if (this._reviveT >= 3.5) { this._reviveT = 0; if (this.isHost) this.hostRevive(rp.id); else this.net.send('revive', { tid: rp.id }); }
    } else { this._reviveT = 0; if (rp) this.game.hud.setInteract(`Hold <b>E</b> to revive <b>${rp.name}</b>`); }
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.engine = new Engine(this.canvas);
    this.engine.setPixelScale(2); // sharper than the default chunky 3x
    this.input = new Input(this.canvas);
    this.audio = new AudioManager();
    this.effects = new Effects(this);
    this.world = new World(this);
    this.player = new Player(this);
    this.enemies = new EnemyManager(this);
    this.weapons = new WeaponSystem(this);
    this.loot = new LootManager(this);
    this.mountedGun = new MountedGun(this, new THREE.Vector3(0, 3.4, 46), 0); // .50 cal on the bunker roof
    this.capturedTank = null; // set by _tankCaptured; cleared on reset
    this.waves = new WaveManager(this);
    this.hud = new HUD(this);
    this.shop = new Shop(this);
    const _pc = document.getElementById('previewCanvas'); this.preview = _pc ? new WeaponPreview(_pc) : null;
    this.ui = new UI();
    const _ac = document.getElementById('adminCanvas'); this.admin = _ac ? new Admin(this) : null;
    this.settings = new Settings(this); // loads localStorage + applies sens/volume/sharpness/fov
    this.meta = this._loadMeta(); // persistent best-wave / lifetime stats
    this.dayNight = new DayNight(this); // day/night + sky + flashlight (drives THE LONG NIGHT)
    this.mp = new MP(this); // multiplayer co-op (dormant until host/join)
    this.mode = 'purge'; this.flares = []; this._surviveTime = 0;

    this.state = 'menu'; this.score = 0; this.kills = 0;
    this._intentionalUnlock = false; this._waveBreak = 0; this._startCountdown = 0;
    this._last = 0; this._bound = this._frame.bind(this);

    this._wireUI(); this._wireInput(); this._showMenuBest();
    this.player.update(0.0001); this.engine.render();
    requestAnimationFrame((t) => { this._last = t; requestAnimationFrame(this._bound); });

    const DEBUG = true; // TODO remove in final task
    if (DEBUG) { window.__dbg = () => this; window.__dbgTank = () => this.waves._forceTankWave(); }
  }

  _wireUI() {
    const click = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener('click', fn); };
    click('playBtn', () => this.startGame('purge'));
    click('longNightBtn', () => this.startGame('longnight'));
    click('resumeBtn', () => this.resume());
    click('quitBtn', () => this.toMenu());
    click('menuBtn', () => this.toMenu());
    click('restartBtn', () => this.startGame(this.mode)); // try again in the same mode
    click('nextWaveBtn', () => this.beginNextWave());
    click('settingsBtn', () => this.settings.open('menu'));
    click('adminBtn', () => this.openAdmin());
    click('adminBack', () => this.toMenu());
    click('multiplayerBtn', () => this.toLobby());
    click('mpHostBtn', () => this.mp.startHost((document.getElementById('mp-name') || {}).value || 'Host'));
    click('mpJoinBtn', () => this.mp.startJoin((document.getElementById('mp-code') || {}).value || '', (document.getElementById('mp-name') || {}).value || 'Player'));
    click('mpStartBtn', () => this.mp.hostStart());
    click('mpBackBtn', () => { this.mp.leave(); this.toMenu(); });
    document.querySelectorAll('.mp-skinpick').forEach(b => b.addEventListener('click', () => {
      this.mp.chosenSkin = +b.dataset.skin;
      document.querySelectorAll('.mp-skinpick').forEach(x => x.classList.toggle('sel', x === b));
    }));
    click('pauseSettingsBtn', () => this.settings.open('pause'));
    this.canvas.addEventListener('click', () => {
      if (this.state === 'menu' || this.state === 'dead' || this.state === 'shop' || this.state === 'admin') return;
      if (this.state === 'paused') this.resume(); else this.input.requestLock();
    });
    this.input.on('lock', () => { if (this.state === 'paused') { this.state = 'playing'; this.ui.hideAll(); } });
    this.input.on('unlock', () => { if (this._intentionalUnlock) { this._intentionalUnlock = false; return; } if (this.state === 'playing') this.pause(); });
    document.addEventListener('fullscreenchange', () => this.engine.resize());
  }

  _wireInput() {
    this.input.on('key', (code) => {
      if (this.state !== 'playing') return;
      if (code === 'KeyR') this.weapons.startReload();
      else if (code === 'KeyG') this.weapons.throwGrenade();
      else if (code === 'KeyV') this.weapons.quickMelee();
      else if (code === 'KeyE') {
        // ---- CapturedTank: exit when aboard ----
        const _ct = this.capturedTank;
        if (_ct && this.player.inTank === _ct) { _ct.leave(); return; }
        // ---- .50 cal + loot ----
        if (this.player.mountedGun) this.player.mountedGun.dismount();
        else if (this.mountedGun.near(this.player.pos)) this.mountedGun.mount();
        // ---- CapturedTank: board (gate by proximity, not currently on .50 cal) ----
        else if (_ct && _ct.near(this.player.pos) && !this.player.mountedGun) { _ct.enter('driver'); }
        else this.loot.openNearby();
      }
      else if (code === 'KeyQ') {
        // CapturedTank: switch driver ↔ gunner seat
        const _ct = this.capturedTank;
        if (_ct && this.player.inTank === _ct) { _ct.switchSeat(); return; }
      }
      else if (code === 'KeyF') this.toggleFullscreen();
      else if (code === 'KeyL') this.dayNight.toggleFlashlight();
      else if (code === 'KeyC') {
        // CapturedTank: gunner peek stance (when in tank); else flare
        const _ct = this.capturedTank;
        if (_ct && this.player.inTank === _ct && _ct.active === 'gunner') { _ct.stance = _ct.stance === 'sight' ? 'peek' : 'sight'; if (_ct.stance === 'sight') { _ct.peekYaw = null; _ct.peekPitch = null; } return; }
        this.throwFlare();
      }
      else if (code === 'KeyT') {
        // CapturedTank: thermal toggle (gunner only); else radio
        const _ct = this.capturedTank;
        if (_ct && this.player.inTank === _ct && _ct.active === 'gunner') { _ct.thermal = !_ct.thermal; return; }
        this.useRadio();
      }
      else if (code === 'KeyB') this.weapons.toggleFireMode();
      else if (code === 'KeyM') { this.audio.setMuted(!this.audio.muted); this.hud.bigMessage(this.audio.muted ? 'MUTED' : 'SOUND ON'); }
      else if (code.startsWith('Digit')) { const n = parseInt(code.slice(5), 10); if (n >= 1 && n <= 9) this.weapons.selectSlot(n); }
    });
  }

  startGame(mode = 'purge') {
    this.mode = mode === 'longnight' ? 'longnight' : 'purge';
    this.audio.init(); this.audio.startMusic();
    this._intentionalUnlock = false;
    this.reset();
    this.ui.hideAll(); this.hud.show(true); this.ui.hint.style.display = 'none';
    this.state = 'playing'; this._startCountdown = 0.6;
    // Go real-fullscreen on this user gesture, then resize & grab the pointer.
    const root = document.documentElement;
    const after = () => { this.engine.resize(); this.input.requestLock(); };
    if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().then(after, after);
    else after();
  }

  toggleFullscreen() {
    if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); }
    else { const r = document.documentElement; if (r.requestFullscreen) r.requestFullscreen().then(() => this.engine.resize(), () => {}); }
  }

  reset() {
    this.player.reset();
    this.enemies.clearAll(); this.loot.reset();
    this.mountedGun.forceReset();
    if (this.capturedTank) { this.capturedTank.forceReset(); this.capturedTank = null; }
    this.world.clearWrecks && this.world.clearWrecks();
    this.weapons.resetLoadout();
    this.waves.reset();
    this._clearFlares();
    this.dayNight.reset(this.mode === 'longnight'); // bright noon for PURGE, dawn-into-night for LONG NIGHT
    this._surviveTime = 0;
    this.score = 0; this.kills = 0;
    this.hud.setHealth(this.player.hp, this.player.maxHp);
    this.hud.setArmor(this.player.armor, this.player.armorMax);
    this.hud.setMoney(this.player.money); this.hud.setKeys(this.player.keys); this.hud.setRadios(this.player.radios);
    this.hud.setScore(0); this.hud.setWeapon(this.weapons);
    this.hud.setNightMode(this.mode === 'longnight'); // shows/hides the clock + gear readout
    this._startCountdown = 0.6; this._waveBreak = 0;
    this._tankIntroShown = false; // reset per-run so the first tank teach banner shows once per run
  }
  _disposeFlare(f) {
    this.engine.scene.remove(f.mesh); this.engine.scene.remove(f.light);
    f.mesh.geometry.dispose(); f.mesh.material.dispose();
    if (f.flame) { f.flame.geometry.dispose(); f.flame.material.dispose(); }
  }
  _clearFlares() {
    for (const f of this.flares) this._disposeFlare(f);
    this.flares.length = 0;
  }
  throwFlare() {
    if (this.mode !== 'longnight' || this.weapons.flares <= 0) return;
    this.weapons.flares--; this.hud.setNightGear(this);
    const cam = this.engine.camera; cam.updateMatrixWorld();
    const origin = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const mesh = buildFlare();
    mesh.position.copy(origin).addScaledVector(fwd, 0.8);
    mesh.rotation.set(randRange(0, TAU), randRange(0, TAU), randRange(0, TAU));
    // burning flame nub at the cap end (local +Y), additive glow
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd14a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    flame.position.set(0, 0.34, 0); flame.renderOrder = 998; mesh.add(flame);
    const light = new THREE.PointLight(0xff5a26, 18, 28, 1.2); // starts hot → eases down (ignite flash)
    light.position.copy(mesh.position);
    this.engine.scene.add(mesh); this.engine.scene.add(light);
    this.effects.muzzleFlash(mesh.position.clone(), fwd, 0.6); // small ignite flash
    this.flares.push({ mesh, light, flame, flameMat: flame.material,
      vel: fwd.clone().multiplyScalar(15).add(new THREE.Vector3(0, 4.5, 0)),
      spin: new THREE.Vector3(randRange(-7, 7), randRange(-4, 4), randRange(-7, 7)),
      life: 22, grounded: false, out: false, smokeT: 0 });
    // keep spent sticks on the ground, but cap how many linger
    const spent = this.flares.filter((x) => x.out);
    while (spent.length > 6) { const old = spent.shift(); this._disposeFlare(old); this.flares.splice(this.flares.indexOf(old), 1); }
    this.audio.uiClick();
  }
  _updateFlares(dt) {
    const t = this._surviveTime;
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      if (!f.grounded) {
        f.vel.y -= 20 * dt; f.mesh.position.addScaledVector(f.vel, dt);
        f.mesh.rotation.x += f.spin.x * dt; f.mesh.rotation.y += f.spin.y * dt; f.mesh.rotation.z += f.spin.z * dt;
        if (f.mesh.position.y <= 0.06) { f.mesh.position.y = 0.06; f.grounded = true; f.vel.set(0, 0, 0); f.mesh.rotation.set(Math.PI / 2, f.mesh.rotation.y, 0); } // settle lying down
      }
      if (f.out) continue;                               // spent: just a dark stick on the ground
      f.life -= dt;
      f.flame.getWorldPosition(_flareWP); f.light.position.copy(_flareWP);
      const fade = f.life < 3.5 ? Math.max(0, f.life / 3.5) : 1;          // gradual burn-out over the last 3.5s
      const flick = 0.82 + Math.sin(t * 22 + i) * 0.12 + Math.sin(t * 57 + i) * 0.05;
      f.light.intensity += (9 * fade * flick - f.light.intensity) * Math.min(1, dt * 6); // eases the ignite spike down, then fades out
      f.light.color.setHSL(0.035, 1, 0.5 + 0.05 * Math.sin(t * 30 + i));
      f.flame.scale.setScalar((0.8 + Math.sin(t * 26 + i) * 0.2) * (0.35 + 0.65 * fade));
      f.flameMat.opacity = 0.95 * fade;
      f.smokeT -= dt;
      if (f.smokeT <= 0) { f.smokeT = 0.07; this.effects.flareSmoke(_flareWP.clone().setY(_flareWP.y + 0.05), fade); }
      if (f.life <= 0) { f.out = true; f.light.intensity = 0; this.engine.scene.remove(f.light); f.flame.visible = false; }
    }
  }
  onNightStart(n, blood) {
    if (this.mode !== 'longnight') return;
    if (blood) this.hud.bigMessage('🔴 BLOOD MOON', 'the horde swells — survive it');
    else this.hud.bigMessage(`NIGHT ${n}`, 'darkness falls — watch your back');
    this.audio.waveStart();
  }
  onDayStart() { if (this.mode === 'longnight') this.hud.bigMessage('DAWN', 'you made it through the night'); }
  useRadio() {
    if (this.state !== 'playing') return;
    if ((this.player.radios || 0) <= 0) { this.hud.bigMessage('NO RADIO', 'kill a backpack courier to get one'); this.audio.noMoney(); return; }
    this.player.radios--; this.hud.setRadios(this.player.radios);
    this.loot.callSupplyDrop();
  }

  pause() { if (this.state !== 'playing') return; this.state = 'paused'; this.ui.show('pause'); }
  resume() {
    if (this.state !== 'paused') return;
    // Re-enter fullscreen (Esc may have dropped it) then re-grab the pointer; 'lock' handler hides the overlay once granted.
    const root = document.documentElement;
    const after = () => this.input.requestLock();
    if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().then(after, after);
    else after();
  }
  toMenu() {
    if (this.mp && this.mp.active) this.mp.leave();
    const _lab = document.getElementById('mp-labels'); if (_lab) _lab.style.display = 'none';
    this.state = 'menu'; this._intentionalUnlock = this.input.locked; this.input.exitLock();
    this.mountedGun.forceReset();
    if (this.capturedTank) { this.capturedTank.forceReset(); this.capturedTank = null; }
    this.enemies.clearAll(); this.audio.stopMusic(); this.hud.show(false);
    this.ui.show('menu'); this.ui.hint.style.display = '';
  }
  // Dev/preview: drop a Flopo avatar into the scene (returns the rigged Group).
  showAvatar(opts) {
    if (this._avatarMesh) { this.engine.scene.remove(this._avatarMesh); this._avatarMesh.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    const o = buildFlopo(opts || {});
    this._avatarMesh = o; this.engine.scene.add(o);
    return o;
  }

  openAdmin() { this.state = 'admin'; if (this.admin) this.admin.open(); }
  beginNextWave() {
    if (this.state !== 'shop') return;
    if (this.mp.active && !this.mp.isHost) { this.ui.hideAll(); this.hud.bigMessage('READY', 'waiting for the host…'); return; }
    this.ui.hideAll(); this.state = 'playing'; this.input.requestLock();
    this.waves.startWave(this.waves.wave + 1);
  }

  onEnemyKilled(e, attacker = 'host') {
    if (this.mp.active && this.mp.isHost && attacker !== 'host') { this.mp.creditKill(attacker, e); return; }
    this.kills++;
    // --- Task 12: asymmetric tank rewards (replaces generic boss payout for the tank) ---
    if (e.def.tank) {
      const bounty = this.waves.bountyMul || 1;
      if (e.captured) {
        // Captured — tank itself is the prize: smaller cash, 1 key, base score only
        this.player.addMoney(Math.round(e.def.reward * 0.4) * bounty);
        this.score += e.def.reward; this.hud.setScore(this.score);
        this.loot._spawnPickup('key', e.pos, 1);
      } else {
        // Destroyed — walked away with loot: full cash, 3 keys, +800 score bonus
        this.player.addMoney(e.def.reward * bounty);
        this.score += e.def.reward + 800; this.hud.setScore(this.score);
        for (let i = 0; i < 3; i++) this.loot._spawnPickup('key', e.pos, 1);
      }
      if (this.mp.active && this.mp.isHost) this.mp.feed(((this.mp.roster.get('host') || {}).name) || 'Host', e.name); else this.hud.kill(e.name);
      // loot.drop with boss flag cleared so it doesn't auto-spawn boss keys again
      this.loot.drop(e.pos, Object.assign({}, e.def, { boss: false }));
      return; // skip generic boss payout below — no double-pay
    }
    // --- generic path (non-tank enemies) ---
    const bounty = (this.waves.bountyMul || 1) * (e.isElite ? 2.4 : 1); // payday modifier + elite bonus
    this.player.addMoney(e.def.reward * bounty);
    this.score += e.def.reward + (e.def.boss ? 1500 : 0) + (e.isElite ? 600 : 0); this.hud.setScore(this.score);
    if (this.mp.active && this.mp.isHost) this.mp.feed(((this.mp.roster.get('host') || {}).name) || 'Host', e.name); else this.hud.kill(e.name);
    this.loot.drop(e.pos, e.def);
    if (e.isElite) for (let i = 0; i < 2; i++) this.loot._spawnPickup('key', e.pos, 1); // elites guarantee a couple of keys
    if (e.courier) this.loot.dropCourier(e.pos); // backpack courier → a radio + a bonus
  }
  toLobby() { this.state = 'menu'; this.ui.show('lobby'); }
  _enterMP(mode) {
    this.mode = (mode === 'longnight') ? 'longnight' : 'purge';
    this.audio.init(); this.audio.startMusic(); this._intentionalUnlock = false;
    this.reset(); this.ui.hideAll(); this.hud.show(true); this.ui.hint.style.display = 'none';
    const labels = document.getElementById('mp-labels'); if (labels) labels.style.display = 'block';
    this.state = 'playing'; this._startCountdown = this.mp.isHost ? 0.6 : 0;
    const root = document.documentElement; const after = () => { this.engine.resize(); this.input.requestLock(); };
    if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().then(after, after); else after();
  }
  _mpGameOver() {
    if (this.state === 'dead') return;
    this.state = 'dead'; this._intentionalUnlock = this.input.locked; this.input.exitLock();
    this.mountedGun.forceReset();
    if (this.capturedTank) { this.capturedTank.forceReset(); this.capturedTank = null; }
    this.audio.gameOver(); this.audio.stopMusic(); this.hud.show(false);
    const lab = document.getElementById('mp-labels'); if (lab) lab.style.display = 'none';
    const rec = document.getElementById('goRecord'); if (rec) rec.innerHTML = 'the whole squad got unstuffed';
    const gw = document.getElementById('goWave'); if (gw) gw.textContent = 'wave ' + this.waves.wave;
    const gs = document.getElementById('goScore'); if (gs) gs.textContent = this.score;
    const gk = document.getElementById('goKills'); if (gk) gk.textContent = this.kills;
    this.ui.show('gameover');
  }
  _mpOpenShop(n) { this._intentionalUnlock = true; this.input.exitLock(); this.state = 'shop'; this.hud.setInteract(null); this.shop.open((n || this.waves.wave) + 1); }
  _hurtTarget(id, dmg) { if (this.mp.active && this.mp.isHost) this.mp.hostHurt(id, dmg); else this.player.hurt(dmg); }
  _explodeHurt(pos, radius, dmg) {
    const hurt = (px, pz, id) => { const d = Math.hypot(px - pos.x, pz - pos.z); if (d < radius) { const dd = dmg * (1 - d / radius); if (this.mp.active && this.mp.isHost) this.mp.hostHurt(id, dd); else this.player.hurt(dd); } };
    if (this.mp.active && this.mp.isHost) { hurt(this.player.pos.x, this.player.pos.z, 'host'); for (const [id, rp] of this.mp.remotes) hurt(rp.pos.x, rp.pos.z, id); }
    else hurt(this.player.pos.x, this.player.pos.z, 'host');
  }
  onWaveCleared(n) {
    this.audio.waveClear(); this.player.addMoney((150 + n * 25) * (this.waves.bountyMul || 1));
    if (this.mp.active && this.mp.isHost) this.mp.net.send('waveclear', { n: this.waves.wave });
    this.hud.bigMessage('WAVE CLEAR', 'visit the armory'); this._waveBreak = 1.4;
  }
  onPlayerDead() {
    this.state = 'dead'; this._intentionalUnlock = this.input.locked; this.input.exitLock();
    this.mountedGun.forceReset();
    if (this.capturedTank) { this.capturedTank.forceReset(); this.capturedTank = null; }
    this.audio.gameOver(); this.audio.stopMusic(); this.hud.show(false);
    // persistent meta (per mode) + lifetime tallies
    const m = this.meta; m.kills = (m.kills || 0) + this.kills; m.runs = (m.runs || 0) + 1;
    const rec = document.getElementById('goRecord');
    if (this.mode === 'longnight') {
      const prev = m.bestNight || 0, record = this._surviveTime > prev;
      m.bestNight = Math.max(prev, this._surviveTime);
      document.getElementById('goWave').textContent = 'night wave ' + this.waves.wave;
      if (rec) rec.innerHTML = `survived <b style="color:var(--gold)">${this._fmtTime(this._surviveTime)}</b> ` + (record ? `🏆 <b style="color:var(--gold)">NEW BEST!</b>` : `· best ${this._fmtTime(m.bestNight)}`);
    } else {
      const prevBest = m.bestWave || 0, record = this.waves.wave > prevBest;
      m.bestWave = Math.max(prevBest, this.waves.wave); m.bestScore = Math.max(m.bestScore || 0, this.score);
      document.getElementById('goWave').textContent = 'wave ' + this.waves.wave;
      if (rec) rec.innerHTML = (record ? `🏆 <b style="color:var(--gold)">NEW BEST — wave ${m.bestWave}!</b>` : `Best: wave ${m.bestWave}`) + ` &nbsp;·&nbsp; lifetime ${m.kills} popped over ${m.runs} runs`;
    }
    this._saveMeta(); this._showMenuBest();
    document.getElementById('goScore').textContent = this.score;
    document.getElementById('goKills').textContent = this.kills;
    this.ui.show('gameover');
  }
  _fmtTime(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  _loadMeta() { try { return JSON.parse(localStorage.getItem('engendros_meta') || '{}'); } catch (e) { return {}; } }
  _saveMeta() { try { localStorage.setItem('engendros_meta', JSON.stringify(this.meta)); } catch (e) {} }
  _showMenuBest() {
    const el = document.getElementById('menuBest'); if (!el) return;
    const m = this.meta || {}; const parts = [];
    if (m.bestWave) parts.push(`Purge: wave ${m.bestWave}`);
    if (m.bestNight) parts.push(`Long Night: ${this._fmtTime(m.bestNight)}`);
    el.textContent = parts.length ? 'Best — ' + parts.join(' · ') : '';
  }

  _frame(t) {
    requestAnimationFrame(this._bound);
    let dt = (t - this._last) / 1000; this._last = t;
    if (!(dt > 0)) dt = 0.0001; dt = Math.min(dt, 0.05);
    if (this.state === 'playing') this._updatePlaying(dt);
    this.engine.update(dt); this.engine.render();
    if (this.state === 'shop' && this.preview && this.shop.tab === 'weapons') this.preview.render(dt);
    if (this.state === 'admin' && this.admin) this.admin.viewer.render(dt);
    this.input.endFrame();
  }

  _updatePlaying(dt) {
    const hostSim = !this.mp.active || this.mp.isHost; // clients don't simulate enemies/waves
    if (hostSim && this._startCountdown > 0) { this._startCountdown -= dt; if (this._startCountdown <= 0) this.waves.startWave(this.waves.wave + 1); }
    if (hostSim && this._waveBreak > 0) { this._waveBreak -= dt; if (this._waveBreak <= 0) { this._intentionalUnlock = true; this.input.exitLock(); this.state = 'shop'; this.hud.setInteract(null); this.shop.open(this.waves.wave + 1); return; } }

    if (this.player.mountedGun) {
      this.player.mountedGun.controlUpdate(dt); // aim + fire + heat + camera handled here
    } else if (this.player.inTank) {
      this.player.inTank.controlUpdate(dt); // tank camera + controls handled here
    } else {
      if (!this.mp.frozen) {
        if (this.input.buttonsPressed[0]) this.weapons.tryFire('press');
        else if (this.input.buttons[0]) this.weapons.tryFire('hold');
      }
      if (this.input.wheel !== 0) this.weapons.cycle(this.input.wheel > 0 ? 1 : -1);
      this.player.update(dt);
      this.weapons.update(dt);
    }
    if (hostSim) this.enemies.update(dt);
    this.loot.update(dt);
    if (hostSim) this.waves.update(dt);
    this.mp.update(dt);
    if (this.mode === 'longnight') { this._surviveTime += dt; this.dayNight.update(dt); this._updateFlares(dt); this.hud.setClock(this.dayNight.info(), this._surviveTime); }
    this.hud.setEnemiesLeft(this.waves.active ? this.waves.toSpawn + this.enemies.aliveCount : this.enemies.aliveCount);
    this.effects.update(dt);
    this.hud.update(dt);
    // ---- Interact prompt priority: tank crew > .50 cal > loot ----
    const _ct = this.capturedTank;
    if (this.player.mountedGun) {
      this.hud.setInteract('Press <b>E</b> to leave the .50 cal');
    } else if (_ct && this.player.inTank === _ct) {
      const seatHint = _ct.active === 'gunner' ? ' · T thermal · C peek' : '';
      this.hud.setInteract('E exit · Q seat' + seatHint);
    } else if (_ct && _ct.near(this.player.pos) && !this.player.mountedGun) {
      this.hud.setInteract('Press <b>E</b> to commandeer the T-90M');
    } else if (this.mountedGun.near(this.player.pos)) {
      this.hud.setInteract('Press <b>E</b> to man the .50 cal — ∞ ammo, overheats');
    } else {
      this.hud.setInteract(this.loot.prompt);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => { if (!window.GAME) window.GAME = new Game(); });
if (document.readyState !== 'loading' && !window.GAME) window.GAME = new Game();
