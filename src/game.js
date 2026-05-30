// game.js — ENGENDROS PURGE. Orchestrator + gameplay.
// A Zumbi-Blocks-style voxel FPS wave shooter: hold a dusty de_dust2-flavored
// arena against waves of "Engendros" voodoo-plush zombies. Big weapon roster
// (guns + melee), a key→lootbox loot loop with weapon rarity, perks & pickups.
import * as THREE from 'three';
import { Engine, WEAPON_LAYER } from './engine.js?e=2';
import { Input } from './input.js';
import { AudioManager } from './audio.js';
import { Effects } from './effects.js';
import { MeshBuilder, voxelMaterial, clamp, damp, makeRNG, randRange, TAU, shade } from './util.js?u=2';
import { Net, makeRoomCode } from './net.js';
import { buildT34Hull, buildT34Model, buildT34Tracks, buildT34Turret } from './t34model.js';
import {
  buildSu34DuctBellyModule,
  buildSu34FinishPhotoModule,
  buildSu34ForwardModule,
  buildSu34Model,
  buildSu34RearModule,
  buildSu34UpperTailExhaustModule,
  buildSu34WingModule,
} from './su34model.js';

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

// --- survival mechanics tuning (fall damage + broken leg + hunger), HARDCORE ---
const FALL_SAFE = -8.0;              // |vy| below this on landing = no damage (a flat 7.2 jump lands ~ -7.2..-7.6, leave margin)
const FALL_HURT = -9.5;              // at/below this the fall also BREAKS THE LEG (damage onset is FALL_SAFE) — ~a 2m drop
const FALL_LETHAL = -15.5;           // at/below this: effectively lethal (~a 5.5m drop)
const FALL_DMG_PER_VY = 9;           // HP per (m/s) of impact speed beyond FALL_SAFE
const FALL_DMG_BONUS_AT_LETHAL = 35; // extra flat damage past FALL_LETHAL to guarantee a kill through armor
const FALL_ARMOR_BYPASS = 0.6;       // blunt trauma: 60% of fall damage ignores armor
const LEG_BREAK_VY = FALL_HURT;      // any damaging fall also breaks the leg (frequent/hardcore)
const LIMP_SPEED_MULT = 0.55;        // walk speed while leg broken (no sprint at all)
const SPLINT_APPLY_TIME = 3.0;       // seconds immobile while binding a splint
const HUNGER_MAX = 100;
const HUNGER_DRAIN_PER_SEC = 0.45;   // 100 -> 0 in ~3.7 min
const HUNGER_LOW = 25;               // below this: walk slowed + HP regen disabled
const HUNGER_LOW_SPEED_MULT = 0.7;   // walk speed while starving
const STARVE_TICK_TIME = 2.0;        // seconds between starvation damage ticks at hunger<=0
const STARVE_TICK_DMG = 5;           // HP per starvation tick (bypasses armor) — never drops HP below 50% maxHp; starvation can't kill
const FOOD_RESTORE = 40;             // hunger restored per ration

// --- molotov tuning ---
const MOLO_THROW_SPEED = 18, MOLO_THROW_LIFT = 4, MOLO_GRAV = 22, MOLO_PROJ_R = 0.16, MOLO_MAX_FLIGHT = 6.0;
const MOLO_IGNITE_T = 0.7, MOLO_HAND_FUSE = 12.0, MOLO_THROW_CD = 0.4;
const FIRE_POOL_RADIUS = 3.2, FIRE_POOL_LIFE = 7.0, FIRE_POOL_MAX = 4, OCCLUSION_INSET = 0.4;
const FIRE_DOT_ENEMY = 22, FIRE_BURN_TICK = 0.25, ENEMY_BURN_DUR = 2.0, ENEMY_BURN_SLOW = 0.45;
const PLAYER_BURN_DUR = 3.0, PLAYER_BURN_DPS = 9, PLAYER_BURN_TICK = 0.4;

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
// Economy payouts — rarity removed (flat stats). Former key drops convert to a small cash bonus; supply drops grant cash.
// ---------------------------------------------------------------------------
const KEY_CASH = 60, SUPPLY_CASH = 600;

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
  luger:    { name: 'Luger P08',  class: 'pistol', shape: 'pistol',  dmg: 30, rpm: 360, auto: false, mag: 8,  reserveMax: Infinity, reload: 1.0, spread: 0.012, bloom: 0.012, pellets: 1, recoil: 0.9, range: 200, adsFov: 60, price: 400,  color: 0x33373d, accent: 0xd8c089 },
  revolver: { name: 'Peacemaker', class: 'pistol', shape: 'revolver',dmg: 72, rpm: 150, auto: false, mag: 6,  reserveMax: 60,       reload: 1.6, spread: 0.01,  bloom: 0.01,  pellets: 1, recoil: 1.6, range: 220, adsFov: 58, price: 900,  loot: 9, color: 0x4a3320, accent: 0xc9a04a },
  // --- SMGs ---
  thompson: { name: 'Thompson',   class: 'smg', shape: 'smg',  dmg: 18, rpm: 700, auto: true,  mag: 30, reserveMax: 270, reload: 1.7, spread: 0.022, bloom: 0.02, pellets: 1, recoil: 0.5,  range: 150, adsFov: 62, price: 1200, loot: 12, color: 0x3a2a1c, accent: 0x9c6a32 },
  ppsh:     { name: 'PPSh-41',    class: 'smg', shape: 'drum', dmg: 16, rpm: 1000, auto: true,  mag: 71, reserveMax: 213, reload: 2.4, spread: 0.03,  bloom: 0.02, pellets: 1, recoil: 0.45, range: 140, adsFov: 64, price: 1600, loot: 8,  color: 0x2f2218, accent: 0xb88a3a },
  // --- rifles ---
  carbine:  { name: 'M1 Carbine', class: 'rifle', shape: 'carbine', dmg: 34, rpm: 400, auto: false, mag: 15, reserveMax: 120, reload: 1.5, spread: 0.01,  bloom: 0.012, pellets: 1, recoil: 0.8, range: 260, adsFov: 55, price: 1100, loot: 10, color: 0x4a3422, accent: 0x2a2a30 },
  garand:   { name: 'M1 Garand',  class: 'rifle', shape: 'garand', dmg: 78, rpm: 250, auto: false, mag: 8,  reserveMax: 64,  reload: 1.4, spread: 0.008, bloom: 0.01,  pellets: 1, recoil: 1.4, range: 320, adsFov: 50, price: 2000, loot: 7,  color: 0x52371f, accent: 0x222226 },
  stg44:    { name: 'StG 44',     class: 'rifle', shape: 'stg',   dmg: 33, rpm: 550, auto: true,  mag: 30, reserveMax: 240, reload: 2.0, spread: 0.015, bloom: 0.016, pellets: 1, recoil: 0.82, range: 240, adsFov: 54, price: 2400, loot: 6,  color: 0x33373d, accent: 0x6e4a28 },
  // --- shotguns ---
  shotgun:  { name: 'Trench Gun', class: 'shotgun', shape: 'shotgun', dmg: 12, rpm: 80,  auto: false, mag: 6, reserveMax: 48, reload: 2.0, spread: 0.085, bloom: 0, pellets: 9,  recoil: 1.8, range: 60, adsFov: 66, price: 1700, loot: 9, color: 0x3a2418, accent: 0x9c6a32 },
  sawed_off:{ name: 'Sawed-Off',  class: 'shotgun', shape: 'sawed',   dmg: 16, rpm: 170, auto: false, mag: 2, reserveMax: 24, reload: 1.4, spread: 0.13,  bloom: 0, pellets: 12, recoil: 2.6, range: 38, adsFov: 70, price: 1500, loot: 8, color: 0x4a2e1c, accent: 0xc25b3a },
  // --- sniper ---
  kar98:    { name: 'Kar98 Scoped', class: 'sniper', shape: 'sniper', dmg: 155, rpm: 50, auto: false, mag: 5, reserveMax: 30, reload: 2.1, spread: 0.002, bloom: 0, pellets: 1, recoil: 2.8, range: 500, adsFov: 22, scope: true, price: 2600, loot: 5, color: 0x20242a, accent: 0x6fa8e8 },
  // --- extra arsenal (loot + shop) ---
  magnum:   { name: '.44 Magnum',  class: 'pistol', shape: 'magnum', dmg: 98, rpm: 120, auto: false, mag: 6, reserveMax: 48, reload: 1.8, spread: 0.01, bloom: 0.01, pellets: 1, recoil: 2.0, range: 220, adsFov: 58, price: 1400, loot: 8, color: 0x4a4a52, accent: 0x6b4a2a },
  mp40:     { name: 'MP 40',       class: 'smg', shape: 'mp40',  dmg: 19, rpm: 500, auto: true, mag: 32, reserveMax: 256, reload: 1.8, spread: 0.02, bloom: 0.018, pellets: 1, recoil: 0.5, range: 150, adsFov: 62, price: 1300, loot: 11, color: 0x2e3036, accent: 0x3a3a3a },
  grease:   { name: 'M3 Grease Gun', class: 'smg', shape: 'grease', dmg: 23, rpm: 450, auto: true, mag: 30, reserveMax: 240, reload: 1.9, spread: 0.024, bloom: 0.02, pellets: 1, recoil: 0.55, range: 140, adsFov: 62, price: 1250, loot: 9, color: 0x3a3d42, accent: 0x262626 },
  bar:      { name: 'BAR M1918',   class: 'rifle', shape: 'bar', dmg: 42, rpm: 550, auto: true, mag: 20, reserveMax: 160, reload: 2.4, spread: 0.016, bloom: 0.02, pellets: 1, recoil: 1.1, range: 260, adsFov: 55, price: 2600, loot: 6, color: 0x3a3128, accent: 0x26262a },
  dp28:     { name: 'DP-28',       class: 'rifle', shape: 'dp28', dmg: 31, rpm: 540, auto: true, mag: 47, reserveMax: 188, reload: 2.8, spread: 0.018, bloom: 0.018, pellets: 1, recoil: 0.7, range: 240, adsFov: 56, price: 2700, loot: 5, color: 0x3a352c, accent: 0x4a4a50, spinMag: { shape: 'pan', x: 0, y: 0.2, z: -0.3, r: 0.28, axis: 'y', step: TAU / 47 } },
  mosin:    { name: 'Mosin-Nagant', class: 'sniper', shape: 'mosin', dmg: 165, rpm: 42, auto: false, mag: 5, reserveMax: 30, reload: 2.6, spread: 0.0022, bloom: 0, pellets: 1, recoil: 2.7, range: 480, adsFov: 26, scope: true, price: 2400, loot: 5, color: 0x6e4a28, accent: 0x4a4e54 },
  bazooka:  { name: 'Bazooka',     class: 'launcher', shape: 'bazooka', dmg: 0, rpm: 30, auto: false, mag: 1, reserveMax: 8, reload: 2.8, spread: 0.004, bloom: 0, pellets: 1, recoil: 2.6, range: 300, adsFov: 62, explodeDmg: 240, explodeRadius: 7.5, price: 3200, loot: 3, color: 0x4a5238, accent: 0x2e2e2e },
  axe:      { name: 'Trench Axe',  class: 'melee', shape: 'axe', melee: true, dmg: 95, rate: 0.5, range: 2.4, arcCos: 0.45, knock: 5, price: 700, loot: 7, color: 0x9aa0a6, accent: 0x6b4a2a },
  // --- held tool: flashlight (no shooting while held; beam syncs in MP) ---
  flashlight: { name: 'Flashlight', class: 'tool', shape: 'flashlight', color: 0x9aa0a6, accent: 0xc23a2a },
  binoculars: { name: 'Binoculars', class: 'tool', shape: 'binoculars', zoom: true, scope: true, adsFov: 12, color: 0x26282b, accent: 0xb08a3a }, // Soviet Б8×30 field glasses — RMB zooms to a realistic 8× (FOV≈12°)
  // --- fortification builders (held like weapons; LMB places, wheel rotates; material from supply drops only) ---
  // (builder weapons removed — fortifications are carried as inventory items; see ITEM_DEFS sandbag/wire/wood)
};
const WEAPON_ORDER = ['knife', 'axe', 'machete', 'cleaver', 'shovel', 'luger', 'magnum', 'revolver', 'mp40', 'grease', 'thompson', 'ppsh', 'carbine', 'bar', 'dp28', 'garand', 'stg44', 'shotgun', 'sawed_off', 'bazooka', 'mosin', 'kar98', 'flashlight', 'binoculars'];
const LOOT_WEAPONS = WEAPON_ORDER.filter((k) => WEAPONS[k].loot);
const lootWeapon = () => weightedPick(LOOT_WEAPONS.map((k) => ({ v: k, w: WEAPONS[k].loot })));

// Survival inventory items — held things that are NOT weapons (consumables/throwables/materials/callables).
// Kept PARALLEL to WEAPONS so the weapon pipe (WEAPON_ORDER / ownedOrder / refillAll) stays clean.
// `mesh` reuses LootManager._pickupMesh(kind); the molotov/flare reuse their own builders.
const ITEM_DEFS = {
  medkit:  { name: 'Medkit',       class: 'consumable', icon: '🩺', mesh: 'medkit', heal: 35 },
  food:    { name: 'Field Ration', class: 'consumable', icon: '🥫', mesh: 'food',   food: 40 },
  armor:   { name: 'Armor Plate',  class: 'consumable', icon: '🛡', mesh: 'armor',  armor: 50 },
  ammo:    { name: 'Ammo Box',     class: 'consumable', icon: '📦', mesh: 'ammo' },
  splint:  { name: 'Field Splint', class: 'consumable', icon: '🩹', mesh: 'splint' },
  radio:   { name: 'Radio',        class: 'callable',   icon: '📻', mesh: 'radio' },
  flare:   { name: 'Signal Flare', class: 'callable',   icon: '🔆', mesh: 'flare' },
  grenade: { name: 'Frag Grenade', class: 'throwable',  icon: '💣', mesh: 'grenade', fuse: 1.6 },
  molotov: { name: 'Molotov',      class: 'throwable',  icon: '🔥', mesh: 'molotov', ignite: 0.7 },
  sandbag: { name: 'Sandbag',      class: 'material',   icon: '🧱', build: 'sandbag' },
  wire:    { name: 'Barbed Wire',  class: 'material',   icon: '🔩', build: 'wire' },
  wood:    { name: 'Barricade',    class: 'material',   icon: '🪵', build: 'wood' },
};

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

// BOSS TOLO remodel (user-supplied) — white plush: sphere head/body, baked belly bullseye,
// button eye (left) / bead eye (right), stitched smile, top loop, capsule limbs. Built in the
// buildViewmodel convention (face -Z) then BAKED to the enemy envelope (face +Z, feet at y=0,
// ~2.25 tall) so the existing boss spawn/scale/AI keeps working unchanged.
function buildTolo() {
  const b = new MeshBuilder();
  const cHead = 0xF3F3F3, cBody = 0xEAEAEA, cLimb = 0xEFEFEF, cBlack = 0x121212, cBtn = 0x0C0C0C, cRim = 0x2C2C2C, cRed = 0xD11515;
  const HEAD_R = 0.32, HEAD_Y = 0.34;
  const headFront = (x, y) => { let u = HEAD_R*HEAD_R - x*x - (y-HEAD_Y)*(y-HEAD_Y); if (u < 0.0009) u = 0.0009; return -Math.sqrt(u); };
  const headSurf = (x, y) => new THREE.Vector3(x, y, headFront(x, y));
  const headNorm = (x, y) => { const p = headSurf(x, y); return new THREE.Vector3(p.x, p.y - HEAD_Y, p.z).normalize(); };
  const stitch1 = (x, y, len, ang, color) => { const p = headSurf(x, y), n = headNorm(x, y); b.box(len, 0.012, 0.012, p.x - n.x*0.003, p.y - n.y*0.003, p.z - n.z*0.003, color, { ry: ang, align: n }); };
  const xStitch = (x, y, len, color, rot=0) => { stitch1(x, y, len,  0.78 + rot, color); stitch1(x, y, len, -0.78 + rot, color); };
  const arcTube = (cx, cy, r, a0, a1, tube, color) => {
    const pts = [], steps = 14;
    for (let i = 0; i <= steps; i++) { const a = a0 + (a1 - a0) * (i / steps); const p = headSurf(cx + r*Math.cos(a), cy + r*Math.sin(a)); const n = headNorm(cx + r*Math.cos(a), cy + r*Math.sin(a)); pts.push(new THREE.Vector3(p.x - n.x*0.008, p.y - n.y*0.008, p.z - n.z*0.008)); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, tube, 6, false); b.geo(g, 0, 0, 0, color); g.dispose();
  };
  // smyčka na temeni (spirála)
  { const cx = 0, cy = 0.752; const pts = [ new THREE.Vector3(0, 0.610, 0), new THREE.Vector3(0, 0.648, 0) ]; const M = 26, turns = 1.18, a0 = -Math.PI/2;
    for (let k = 0; k <= M; k++) { const f = k / M; const a = a0 + turns * Math.PI * 2 * f; const r = 0.072 - 0.038 * f; pts.push(new THREE.Vector3(cx + r*Math.cos(a), cy + r*Math.sin(a), 0)); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 70, 0.015, 8, false); b.geo(g, 0, 0, 0, cBlack); g.dispose(); }
  // hlava
  { const g = new THREE.SphereGeometry(HEAD_R, 18, 14); b.geo(g, 0, HEAD_Y, 0, cHead); g.dispose(); }
  // tělo
  const BODY_R = 0.23, BODY_Y = -0.12;
  { const g = new THREE.SphereGeometry(BODY_R, 20, 16); b.geo(g, 0, BODY_Y, 0, cBody); g.dispose(); }
  // terčík (zapečený do bříška)
  { const tr = BODY_R + 0.002;
    const ring = new THREE.SphereGeometry(tr, 28, 48, 0, Math.PI*2, 0.362, 0.210); b.geo(ring, 0, BODY_Y, 0, cRed, { rx: -Math.PI/2 }); ring.dispose();
    const dot = new THREE.SphereGeometry(tr, 28, 24, 0, Math.PI*2, 0, 0.1885); b.geo(dot, 0, BODY_Y, 0, cRed, { rx: -Math.PI/2 }); dot.dispose(); }
  // ručičky
  { const g = new THREE.CapsuleGeometry(0.072, 0.075, 4, 10); b.geo(g, -0.255, -0.02, 0.0, cLimb, { rz:  0.78 }); g.dispose(); }
  { const g = new THREE.CapsuleGeometry(0.072, 0.075, 4, 10); b.geo(g,  0.255, -0.02, 0.0, cLimb, { rz: -0.78 }); g.dispose(); }
  // nožičky
  { const g = new THREE.CapsuleGeometry(0.082, 0.05, 4, 10); b.geo(g, -0.115, -0.34, 0.015, cLimb); g.dispose(); }
  { const g = new THREE.CapsuleGeometry(0.082, 0.05, 4, 10); b.geo(g,  0.115, -0.34, 0.015, cLimb); g.dispose(); }
  // oči: knoflík (+X) / korálek (-X)
  const EY = 0.40;
  { const ex = 0.135, n = headNorm(ex, EY), p = headSurf(ex, EY); const at = (o) => [p.x + n.x*o, p.y + n.y*o, p.z + n.z*o]; let q;
    const rim = new THREE.TorusGeometry(0.056, 0.014, 8, 18); q = at(0.002); b.geo(rim, q[0], q[1], q[2], cRim, { rx: Math.PI/2, align: n }); rim.dispose();
    const face = new THREE.CylinderGeometry(0.048, 0.048, 0.022, 18); q = at(0.010); b.geo(face, q[0], q[1], q[2], cBtn, { align: n }); face.dispose();
    q = at(0.024); b.box(0.058, 0.010, 0.010, q[0], q[1], q[2], cHead, { ry:  0.78, align: n }); b.box(0.058, 0.010, 0.010, q[0], q[1], q[2], cHead, { ry: -0.78, align: n }); }
  { const ex = -0.135, n = headNorm(ex, EY), p = headSurf(ex, EY); const g = new THREE.SphereGeometry(0.038, 12, 10); b.geo(g, p.x + n.x*0.010, p.y + n.y*0.010, p.z + n.z*0.010, 0x070707); g.dispose();
    arcTube(ex, EY, 0.056, Math.PI*0.55, Math.PI*1.45, 0.010, cBlack); }
  // pusa
  const smileXY = (t) => [ -0.16 + 0.32 * t, 0.205 + 0.058 * Math.pow(2*t - 1, 2) ];
  { const pts = [], N = 26; for (let i = 0; i <= N; i++) { const [mx, my] = smileXY(i / N); const p = headSurf(mx, my), n = headNorm(mx, my); pts.push(new THREE.Vector3(p.x - n.x*0.008, p.y - n.y*0.008, p.z - n.z*0.008)); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 50, 0.012, 7, false); b.geo(g, 0, 0, 0, cBlack); g.dispose(); }
  for (const t of [0.2, 0.5, 0.8]) { const [mx, my] = smileXY(t); xStitch(mx, my, 0.068, cBlack, t === 0.5 ? 0 : 0.42); }
  { const [lx, ly] = smileXY(0.0); arcTube(lx + 0.032, ly - 0.011, 0.044,  Math.PI*0.58, Math.PI*1.42, 0.012, cBlack); }
  { const [rx2, ry2] = smileXY(1.0); arcTube(rx2 - 0.032, ry2 - 0.011, 0.044, -Math.PI*0.42, Math.PI*0.42, 0.012, cBlack); }
  // bake: face -Z -> +Z, feet at y=0, ~2.25 tall
  const geo = b.build();
  geo.rotateY(Math.PI);
  geo.computeBoundingBox();
  const S = 2.25 / (geo.boundingBox.max.y - geo.boundingBox.min.y);
  geo.scale(S, S, S);
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox.min.y, 0);
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
function buildTank(camo = 'desert') {
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

// Fortification pieces the player places (held like weapons; material comes from supply drops).
// sandbag/wood are HARD walls (an AABB in World.boxes); wire is a non-blocking HAZARD zone (slow+DoT, breaks under trample).
const STRUCT_CAP = 44; // perf cap — World.boxes + per-enemy collision loops are O(n) each frame
const STRUCT_DEFS = {
  sandbag: { hp: 900, w: 2.2, h: 1.0, d: 0.7, hard: true,  rotStep: Math.PI / 12, label: 'Sandbags' },     // tanky low cover; shoot over the top
  wood:    { hp: 420, w: 2.4, h: 1.5, d: 0.4, hard: true,  rotStep: Math.PI / 12, label: 'Barricade' },    // full wall, blocks LoS, breaks faster
  wire:    { hp: 260, w: 2.4, h: 0.8, d: 1.2, hard: false, rotStep: Math.PI / 12, label: 'Barbed Wire',    // hazard zone: slow + damage, trampled down under pressure
             slow: 0.35, dot: 14, trample: 35 },
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
    return { dist: best, point, normal, box: (hitBox && hitBox !== 'ground') ? hitBox : null };
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
    this.alive = true; this.attackCD = rr(0.3, 0.9); this.growlCD = rr(2, 6); this.squash = 0; this.burnT = 0;
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
  _geo(key, col, variant) { return this.geos[key] || (this.geos[key] = (variant === 'boss' ? buildTolo() : buildEngendro(col, variant))); }
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
      const _wz = this.game.build.hazardAt(e.pos.x, e.pos.z); // barbed-wire hazard: slow + DoT + trample
      const spd = e.speed * (e.squash > 0 ? 0.3 : (e.burnT > 0 ? ENEMY_BURN_SLOW : 1)) * (_wz ? STRUCT_DEFS.wire.slow : 1);
      if (_wz) {
        _wz.hp -= STRUCT_DEFS.wire.trample * dt; if (_wz.hp <= 0) this.game.build.destroyStructure(_wz, 'trample'); // crowd tramples it down
        e._wireT = (e._wireT || 0) + dt;
        if (e._wireT >= 0.4) { e._wireT = 0; if (this.damage(e, STRUCT_DEFS.wire.dot * 0.4, 'wire')) continue; }
      }
      e.vel.x = (wx / wl) * spd; e.vel.z = (wz / wl) * spd;
      e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt; e.pos.y = 0;
      const lim = this.world.HALF - e.radius;
      e.pos.x = clamp(e.pos.x, -lim, lim); e.pos.z = clamp(e.pos.z, -lim, lim);
      e._blockStruct = null;
      for (const b of this.world.boxes) {
        if (b.max.y < 0.6) continue;
        if (e.pos.x + e.radius <= b.min.x || e.pos.x - e.radius >= b.max.x) continue;
        if (e.pos.z + e.radius <= b.min.z || e.pos.z - e.radius >= b.max.z) continue;
        const px = Math.min(b.max.x + e.radius - e.pos.x, e.pos.x - (b.min.x - e.radius));
        const pz = Math.min(b.max.z + e.radius - e.pos.z, e.pos.z - (b.min.z - e.radius));
        if (px < pz) e.pos.x += (e.pos.x < (b.min.x + b.max.x) / 2 ? -px : px);
        else e.pos.z += (e.pos.z < (b.min.z + b.max.z) / 2 ? -pz : pz);
        if (b.struct) e._blockStruct = b._ref; // pushing against a player-built wall
      }
      // heavy enemies crush a blocking structure instantly (no caging the boss) — after the boxes loop so the splice is safe
      if (e._blockStruct && (e.def.boss || e.def.tank || (e.def.scale || 1) >= 1.6)) { this.game.build.attackStructure(e._blockStruct, e._blockStruct.maxHp, e); e._blockStruct = null; }

      // attack
      e.attackCD -= dt;
      if (dist < e.radius + this.game.player.radius + 0.6 && e.attackCD <= 0) {
        if (e.def.charger) { this.damage(e, e.hp + 1, 'contact'); continue; } // kamikaze: detonate on contact
        e.attackCD = 1.0; e.squash = 0.18; this.game._hurtTarget(e._tgtId || 'host', e.def.dmg);
      } else if (e._blockStruct && e.attackCD <= 0) { // can't reach a player: smash the wall in the way
        e.attackCD = 0.8; e.squash = 0.18; this.game.build.attackStructure(e._blockStruct, e.def.dmg, e);
      }
      e.growlCD -= dt;
      if (e.growlCD <= 0) { e.growlCD = rr(3, 8); if (dist < 32) this.game.audio.enemyGrowl(); }

      // anim
      e.bob += dt * (6 + spd);
      if (e.squash > 0) e.squash -= dt;
      if (e.burnT > 0) { e.burnT -= dt; if (Math.random() < 0.16) this.game.effects.firePool(e.pos, 0.45, 0.4); }
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
    const belly = new THREE.Vector3(e.pos.x, e.pos.y + 0.6 * e.scale, e.pos.z + 0.4 * e.scale);
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
    // belly-bullseye glow telegraphs the charge WITHOUT reddening the eyes/face (lazy child of the boss mesh, the laser emitter)
    if (!e._tolGlow) {
      e._tolGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 22),
        new THREE.MeshBasicMaterial({ color: 0xff2436, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      e._tolGlow.rotation.x = Math.PI / 2; e._tolGlow.position.set(0, 0.6, 0.42); e._tolGlow.renderOrder = 999;
      e.mesh.add(e._tolGlow);
    }
    if (e.charging > 0) {
      e.charging -= dt;
      const f = 1 - e.charging / 0.85;
      e._tolGlow.material.opacity = 0.95 * f; e._tolGlow.scale.setScalar(0.7 + f * 0.7);
      if (e.charging <= 0) this._bossLaser(e);
    } else {
      if (e._tolGlow.material.opacity > 0.02) e._tolGlow.material.opacity *= 0.82;
      e.laserCD -= dt;
      if (e.laserCD <= 0) {
        e.laserCD = e.phase === 2 ? 2.6 : 3.8; e.charging = 0.85;
        e.aim.set(pp.x - e.pos.x, (pp.y + 1.0) - (e.pos.y + 0.6 * e.scale), pp.z - e.pos.z).normalize();
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
// Fortification structure meshes (layered-shade voxel, one merged mesh each).
// Built once; geometry shared by the ghost preview + all placed copies.
// ---------------------------------------------------------------------------
function buildSandbags() {
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

function buildBarbedWire() {
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

function buildBarricade() {
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

const STRUCT_FX_COLOR = { sandbag: 0xcdb887, wire: 0x8a8f98, wood: 0x7a5530 };

// ---------------------------------------------------------------------------
// BuildManager — fortification placement: ghost preview, validity, collision,
// destruction, the barbed-wire hazard zone, and host-authoritative MP sync.
// ---------------------------------------------------------------------------
class BuildManager {
  constructor(game) {
    this.game = game;
    this.scene = game.engine.scene;
    this.structures = [];
    this._idc = 1;
    this.ghostYaw = 0;
    this._valid = false;
    this._ghostPos = null;
    this._ghostKind = 'sandbag';
    this._tmpO = new THREE.Vector3();
    this._tmpF = new THREE.Vector3();
    const sg = buildSandbags(), wg = buildBarbedWire(), dg = buildBarricade();
    this._geos = { sandbag: sg.geometry, wire: wg.geometry, wood: dg.geometry };
    sg.material.dispose(); wg.material.dispose(); dg.material.dispose();
    this.ghostMat = new THREE.MeshLambertMaterial({ color: 0x35d05a, emissive: 0x0a3a14, transparent: true, opacity: 0.5, depthWrite: false });
    this.ghost = new THREE.Mesh(this._geos.sandbag, this.ghostMat);
    this.ghost.visible = false; this.ghost.renderOrder = 5; this.ghost.frustumCulled = false;
    this.scene.add(this.ghost);
  }

  _curKind() { return this.game.inventory.heldMaterial(); } // material held in the backpack → its build kind (else null)
  rotateGhost(dir) { const k = this._curKind(); if (k) this.ghostYaw += dir * (STRUCT_DEFS[k].rotStep || Math.PI / 12); }

  // AABB half-extents of the footprint after yaw rotation
  _footprint(kind, yaw) {
    const sd = STRUCT_DEFS[kind], c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    return { hx: (sd.w / 2) * c + (sd.d / 2) * s, hz: (sd.w / 2) * s + (sd.d / 2) * c, h: sd.h };
  }

  validateAt(pos, yaw, kind) {
    if (this.game.inventory.heldMaterial() !== kind) return false; // must be holding that material item
    if (this.structures.length >= STRUCT_CAP) return false;
    if (!pos) return false;
    const sd = STRUCT_DEFS[kind], fp = this._footprint(kind, yaw), top = pos.y + sd.h;
    for (const bx of this.game.world.boxes) {                            // map + placed hard structures
      if (pos.x + fp.hx <= bx.min.x || pos.x - fp.hx >= bx.max.x) continue;
      if (pos.z + fp.hz <= bx.min.z || pos.z - fp.hz >= bx.max.z) continue;
      if (bx.max.y <= pos.y + 0.05 || bx.min.y >= top - 0.05) continue;  // no vertical overlap (e.g. placing ON a surface)
      return false;
    }
    for (const s of this.structures) {                                  // other structures (incl. wire, not in world.boxes)
      const d2 = this._footprint(s.kind, s.yaw);
      if (Math.abs(pos.x - s.pos.x) < fp.hx + d2.hx && Math.abs(pos.z - s.pos.z) < fp.hz + d2.hz) return false;
    }
    for (const e of this.game.enemies.active) {                         // don't trap/telefrag a zombie
      if (e.alive && Math.abs(pos.x - e.pos.x) < fp.hx + e.radius && Math.abs(pos.z - e.pos.z) < fp.hz + e.radius) return false;
    }
    const pp = this.game.player.pos, pr = this.game.player.radius;
    if (Math.abs(pos.x - pp.x) < fp.hx + pr && Math.abs(pos.z - pp.z) < fp.hz + pr) return false;
    return true;
  }

  update(dt) {
    const onFoot = this.game.state === 'playing' && !this.game.player.inTank && !this.game.player.mountedGun && !(this.game.mp && this.game.mp.frozen);
    const kind = onFoot ? this._curKind() : null;
    if (!kind) { this.ghost.visible = false; return; }
    if (kind !== this._ghostKind) { this.ghost.geometry = this._geos[kind]; this._ghostKind = kind; }
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const origin = this._tmpO.setFromMatrixPosition(cam.matrixWorld);
    const fwd = this._tmpF.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const hit = this.game.world.rayHit(origin, fwd, 5.5);
    const pos = (hit && hit.point && hit.dist <= 5.0 && hit.normal.y > 0.6) ? hit.point : null;
    this._ghostPos = pos;
    this._valid = pos ? this.validateAt(pos, this.ghostYaw, kind) : false;
    if (!pos) { this.ghost.visible = false; return; }
    this.ghost.visible = true;
    this.ghost.position.set(pos.x, pos.y, pos.z);
    this.ghost.rotation.y = this.ghostYaw;
    this.ghostMat.color.setHex(this._valid ? 0x35d05a : 0xd03a2a);
    this.ghostMat.emissive.setHex(this._valid ? 0x0a3a14 : 0x3a0a08);
  }

  place() {
    const kind = this._curKind(); if (!kind) return;
    if (!this._valid || !this._ghostPos) { this.game.audio.noMoney && this.game.audio.noMoney(); return; }
    const pos = this._ghostPos.clone(), yaw = this.ghostYaw, mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) {
      mp.net.send('structreq', { kind, x: pos.x, z: pos.z, yaw });    // client → host (host validates + echoes)
    } else {
      const id = this._idc++;
      this.placeStructure(kind, pos, yaw, id);
      if (mp && mp.active && mp.isHost) mp.net.broadcast('struct', { id, kind, x: pos.x, z: pos.z, yaw });
    }
    this.game.inventory.consumeHeldMaterial();
    this.game.audio.buy && this.game.audio.buy();
  }

  placeStructure(kind, pos, yaw, id) {
    const sd = STRUCT_DEFS[kind];
    const mesh = new THREE.Mesh(this._geos[kind], voxelMaterial());
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(pos.x, pos.y || 0, pos.z); mesh.rotation.y = yaw;
    this.scene.add(mesh);
    const s = { id, kind, pos: new THREE.Vector3(pos.x, pos.y || 0, pos.z), yaw, mesh, hp: sd.hp, maxHp: sd.hp, box: null, hazard: null };
    const fp = this._footprint(kind, yaw);
    const aabb = (extraTag) => Object.assign({ min: new THREE.Vector3(pos.x - fp.hx, 0, pos.z - fp.hz), max: new THREE.Vector3(pos.x + fp.hx, (pos.y || 0) + sd.h, pos.z + fp.hz) }, extraTag);
    if (sd.hard) { s.box = aabb({ struct: true, _ref: s }); this.game.world.boxes.push(s.box); }
    else { s.hazard = aabb({ ref: s }); }
    this.structures.push(s);
    return s;
  }

  hazardAt(x, z) {
    for (const s of this.structures) {
      const h = s.hazard; if (h && x >= h.min.x && x <= h.max.x && z >= h.min.z && z <= h.max.z) return s;
    }
    return null;
  }

  attackStructure(s, dmg, enemy) {
    if (!s || s.hp <= 0) return;
    if (enemy && enemy.def && (enemy.def.boss || enemy.def.tank || (enemy.def.scale || 1) >= 1.6)) dmg = s.maxHp; // heavies crush
    s.hp -= dmg;
    if (s.mesh && s.mesh.material.emissive) { const f = Math.max(0, s.hp / s.maxHp); s.mesh.material.emissive.setRGB((1 - f) * 0.22, 0, 0); }
    if (s.hp <= 0) this.destroyStructure(s, 'smash');
  }

  // player-caused damage (shooting / melee); host-authoritative in MP (clients ask the host)
  playerDamage(s, dmg) {
    if (!s) return;
    const mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) mp.net.send('structhit', { id: s.id, dmg });
    else this.attackStructure(s, dmg, null);
  }

  destroyStructure(s, cause) {
    const i = this.structures.indexOf(s); if (i < 0) return;
    this.structures.splice(i, 1);
    if (s.box) { const j = this.game.world.boxes.indexOf(s.box); if (j >= 0) this.game.world.boxes.splice(j, 1); }
    if (s.mesh) { this.scene.remove(s.mesh); if (s.mesh.material) s.mesh.material.dispose(); }
    const fx = this.game.effects;
    if (fx) { fx.stuffing && fx.stuffing(s.pos, STRUCT_FX_COLOR[s.kind] || 0xcdb887, 12, 4); fx.impact && fx.impact(s.pos, new THREE.Vector3(0, 1, 0), 'dust'); }
    if (this.game.audio && this.game.audio.noise) this.game.audio.noise(0.2, 0.5, 'lowpass', 280, 1);
    const mp = this.game.mp;
    if (mp && mp.active && mp.isHost) mp.net.broadcast('structdie', { id: s.id });
  }

  // ---- multiplayer (host-authoritative) ----
  hostPlaceFromClient(d) {
    const pos = new THREE.Vector3(d.x, 0, d.z);
    if (!this.validateAt(pos, d.yaw, d.kind)) return;          // reject invalid placements
    const id = this._idc++;
    this.placeStructure(d.kind, pos, d.yaw, id);
    this.game.mp.net.broadcast('struct', { id, kind: d.kind, x: d.x, z: d.z, yaw: d.yaw });
  }
  applyRemoteStruct(d) {
    if (this.structures.some((s) => s.id === d.id)) return;
    this.placeStructure(d.kind, new THREE.Vector3(d.x, 0, d.z), d.yaw, d.id);
    if (d.id >= this._idc) this._idc = d.id + 1;
  }
  applyRemoteDestroy(id) { const s = this.structures.find((x) => x.id === id); if (s) this.destroyStructure(s, 'remote'); }

  reset() {
    for (const s of this.structures) {
      if (s.box) { const j = this.game.world.boxes.indexOf(s.box); if (j >= 0) this.game.world.boxes.splice(j, 1); }
      if (s.mesh) { this.scene.remove(s.mesh); if (s.mesh.material) s.mesh.material.dispose(); }
    }
    this.structures.length = 0;
    this._idc = 1; this.ghostYaw = 0; this._valid = false; this._ghostPos = null;
    this.ghost.visible = false;
  }
}

// ---------------------------------------------------------------------------
// Viewmodels
// ---------------------------------------------------------------------------
function buildViewmodel(def) {
  const b = new MeshBuilder();
  const c = def.color, a = def.accent, dark = shade(c, -0.1);
  switch (def.shape) {
    case 'knife': { // Seitengewehr 84/98 III — K98k knife bayonet: fullered spear-point blade, bakelite grip, beak pommel (NO muzzle ring)
      const sHi = 0x6f747b, sMid = 0x52565c, sLo = 0x2c2f33, sSlot = 0x1c1e21, sBright = 0x8a8f96; // blued steel
      const kHi = 0x7a4d33, kMid = 0x5a3826, kLo = 0x3a2417;                                          // reddish bakelite grip
      // blade (single-edged, fullered; muzzle -Z)
      b.box(0.024, 0.058, 0.56, 0, 0.0, -0.62, sMid, { tint: 0.02 });
      b.box(0.026, 0.014, 0.56, 0, 0.03, -0.62, sLo);                          // flat spine (top, matte)
      b.box(0.014, 0.012, 0.54, 0, -0.027, -0.62, sBright);                    // honed edge bevel (bottom)
      b.box(0.008, 0.022, 0.44, 0.012, 0.003, -0.60, sSlot); b.box(0.008, 0.022, 0.44, -0.012, 0.003, -0.60, sSlot); // fuller groove both faces
      b.box(0.022, 0.04, 0.10, 0, 0.006, -0.93, sHi);                          // double-edged spear point tip
      // crossguard (short bar, no ring)
      b.box(0.06, 0.05, 0.045, 0, -0.006, -0.33, sMid); b.box(0.012, 0.012, 0.012, 0.024, -0.006, -0.33, sBright); // bar + rivet
      // bakelite grip (grooved scales)
      b.box(0.052, 0.072, 0.34, 0, 0.0, -0.13, kMid, { tint: 0.03 });          // grip core
      b.box(0.014, 0.062, 0.32, 0.026, 0.0, -0.13, kHi); b.box(0.014, 0.062, 0.32, -0.026, 0.0, -0.13, kLo); // lit/shadow faces
      for (let i = 0; i < 5; i++) b.box(0.056, 0.012, 0.013, 0, -0.022, -0.25 + i * 0.052, kLo); // grooves
      b.box(0.03, 0.012, 0.34, 0, 0.043, -0.13, sBright);                      // flash-guard steel strip (spine of grip)
      b.box(0.012, 0.012, 0.012, 0.028, 0.0, -0.18, sBright); b.box(0.012, 0.012, 0.012, 0.028, 0.0, -0.05, sBright); // rivet domes
      // beak pommel + T-slot + press-stud
      b.box(0.05, 0.085, 0.10, 0, -0.006, 0.07, sMid, { tint: 0.02 });
      b.box(0.046, 0.05, 0.045, 0, -0.045, 0.10, sLo);                         // downward beak
      b.box(0.02, 0.045, 0.035, 0, 0.0, 0.118, sSlot);                         // T-mortise slot (rearward)
      b.box(0.018, 0.02, 0.02, 0.03, 0.0, 0.055, sBright);                     // press-stud (right side)
      break;
    }
    case 'machete': { // U.S. M1942 machete — long bellied single-edge blade, riveted full-tang slab grip
      const bHi = 0xc2c8ce, bMid = 0x8a9097, bLo = 0x5a6065, bEdge = 0xe8ecef, bSlot = 0x24272a; // worn satin steel
      const wHi = 0x8a6238, wMid = 0x6b4a2e, wLo = 0x3e2a18, brass = 0xb9962e;                    // oiled hardwood + brass rivets
      // blade — straight level spine, convex belly toward the tip (muzzle -Z)
      b.box(0.02, 0.052, 0.92, 0, 0.02, -0.76, bMid, { tint: 0.02 });          // main blade (straight spine on top)
      b.box(0.02, 0.05, 0.46, 0, -0.022, -0.96, bMid, { tint: 0.02 });         // belly widening DOWNWARD only (front half; top stays at spine)
      b.box(0.024, 0.013, 0.92, 0, 0.046, -0.76, bLo);                         // unsharpened spine (top, matte, dead straight)
      b.box(0.013, 0.012, 0.62, 0, -0.052, -0.98, bEdge);                      // honed edge bevel (lower, follows the belly)
      b.box(0.022, 0.05, 0.14, 0, -0.012, -1.22, bHi, { rx: 0.34 });           // clipped drop-point tip
      b.box(0.024, 0.06, 0.16, 0, 0.012, -0.40, bLo);                          // flat ricasso (no bevel)
      // full-tang slab grip (no guard)
      b.box(0.05, 0.078, 0.36, 0, 0.0, -0.06, wMid, { tint: 0.03 });           // grip core
      b.box(0.013, 0.066, 0.34, 0.026, 0.0, -0.06, wHi); b.box(0.013, 0.066, 0.34, -0.026, 0.0, -0.06, wLo); // scale faces
      b.box(0.054, 0.012, 0.36, 0, 0.041, -0.06, bLo); b.box(0.054, 0.012, 0.36, 0, -0.041, -0.06, bLo);     // exposed tang spine+edge
      for (let i = 0; i < 3; i++) { const z = -0.18 + i * 0.13; const r = new THREE.CylinderGeometry(0.013, 0.013, 0.056, 10); b.geo(r, 0, 0.0, z, brass, { rz: Math.PI / 2 }); r.dispose(); } // 3 round rivets
      b.box(0.05, 0.092, 0.07, 0, -0.006, 0.13, wMid);                         // flared pommel (finger hook)
      b.box(0.056, 0.024, 0.022, 0, -0.004, 0.145, bSlot);                     // lanyard hole
      break;
    }
    case 'cleaver': { // heavy butcher cleaver — tall rectangular blade with hanging hole, riveted wood handle
      const bHi = 0x9aa0a6, bMid = 0x6f7378, bLo = 0x3a3d42, bEdge = 0xcdd1d6, bSlot = 0x2a2c2e; // aged tool steel
      const wHi = 0xcd9a5e, wMid = 0xb07a42, wLo = 0x7c5328;                                       // beech handle
      // tall rectangular blade (front ~65%, muzzle -Z)
      b.box(0.04, 0.34, 0.52, 0, 0.06, -0.50, bMid, { tint: 0.02 });           // blade slab
      b.box(0.05, 0.045, 0.52, 0, 0.225, -0.50, bHi);                          // thick straight spine (top, lit)
      b.box(0.013, 0.31, 0.50, 0.022, 0.06, -0.50, bHi); b.box(0.013, 0.31, 0.50, -0.022, 0.06, -0.50, bLo); // lit/shadow faces
      b.box(0.04, 0.09, 0.20, 0, -0.135, -0.66, bMid, { tint: 0.02 });         // forward belly drop (toe lowest)
      b.box(0.018, 0.018, 0.48, 0, -0.105, -0.50, bEdge); b.box(0.018, 0.02, 0.14, 0, -0.175, -0.66, bEdge); // honed edge + toe
      { const h = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 12); b.geo(h, 0, 0.205, -0.72, bSlot, { rz: Math.PI / 2 }); h.dispose(); } // hanging hole (top-front)
      b.box(0.06, 0.13, 0.10, 0, 0.0, -0.17, bMid);                            // bolster / heel neck-down
      // riveted full-tang handle (lower than blade centerline)
      b.box(0.056, 0.092, 0.40, 0, -0.04, 0.09, wMid, { tint: 0.03 });         // handle core
      b.box(0.014, 0.08, 0.38, 0.028, -0.04, 0.09, wHi); b.box(0.014, 0.08, 0.38, -0.028, -0.04, 0.09, wLo); // scales
      for (let i = 0; i < 3; i++) { const z = -0.02 + i * 0.14; const r = new THREE.CylinderGeometry(0.014, 0.014, 0.06, 10); b.geo(r, 0, -0.04, z, bEdge, { rz: Math.PI / 2 }); r.dispose(); b.box(0.012, 0.012, 0.012, 0, -0.04, z, bSlot); } // rivets w/ dark center
      b.box(0.062, 0.11, 0.06, 0, -0.04, 0.28, wMid);                          // flared rounded butt
      break;
    }
    case 'shovel': { // Soviet MPL-50 entrenching tool — pentagonal steel blade, riveted socket, singed-wood shaft
      const mHi = 0x5a6065, mMid = 0x3b3f42, mLo = 0x24272a, mEdge = 0x8a9097, mBright = 0x9aa0a6; // blued-grey steel
      const wHi = 0x7a5d38, wMid = 0x5a4327, wLo = 0x3a2a18;                                         // scorched wood
      // grip end + shaft (toward player +Z), pointed blade at -Z
      { const g = new THREE.CylinderGeometry(0.05, 0.045, 0.10, 12); b.geo(g, 0, 0, 0.40, wHi, { rx: Math.PI / 2 }); g.dispose(); } // rounded grip cap
      { const sh = new THREE.CylinderGeometry(0.034, 0.034, 0.58, 12); b.geo(sh, 0, 0, 0.10, wMid, { rx: Math.PI / 2, tint: 0.03 }); sh.dispose(); } // shaft
      b.box(0.012, 0.07, 0.56, 0.03, 0, 0.10, wHi); b.box(0.012, 0.07, 0.56, -0.03, 0, 0.10, wLo);   // shaft grain hi/lo
      // tapered sheet-metal socket + rivets
      { const so = new THREE.CylinderGeometry(0.058, 0.04, 0.13, 12); b.geo(so, 0, 0, -0.21, mMid, { rx: Math.PI / 2, tint: 0.02 }); so.dispose(); }
      for (let i = 0; i < 5; i++) { const a2 = (i - 2) * 0.5; b.box(0.014, 0.014, 0.014, Math.sin(a2) * 0.05, 0.05 * Math.cos(a2) * 0 + 0.045, -0.20, mBright); } // rivet row (top arc)
      // pentagonal blade (flat, horizontal, pointed tip at -Z)
      b.box(0.24, 0.026, 0.30, 0, 0, -0.45, mMid, { tint: 0.02 });             // main blade slab
      b.box(0.155, 0.028, 0.13, 0, 0, -0.62, mMid);                            // converging neck
      b.box(0.07, 0.03, 0.09, 0, 0, -0.71, mHi);                               // pointed digging tip
      b.box(0.23, 0.009, 0.30, 0, 0.015, -0.45, mHi);                          // top-lit face
      b.box(0.23, 0.009, 0.30, 0, -0.015, -0.45, mLo);                         // underside shadow
      b.box(0.014, 0.024, 0.34, 0.12, 0, -0.47, mEdge);                        // honed lateral edge (one side)
      { const st = new THREE.CylinderGeometry(0.03, 0.03, 0.006, 12); b.geo(st, 0, 0.016, -0.42, mLo); st.dispose(); } // faint factory stamp disc
      break;
    }
    case 'pistol': { // Luger P08 — toggle-lock breech, raked checkered grip, tapered barrel (9x19, 8-rnd box)
      const sHi = 0x5d646e, sMid = 0x474c54, sLo = 0x32363c, sSlot = 0x1d1f23, sBright = 0x707782; // blued steel
      const wHi = 0x8a5a2e, wMid = 0x6c4422, wLo = 0x4a2f18, straw = 0xb59a4a;                       // walnut + straw small parts
      // barrel (thin, tapered; muzzle -Z)
      b.box(0.058, 0.058, 0.40, 0, 0.045, -0.50, sMid, { tint: 0.02 });
      b.box(0.05, 0.018, 0.40, 0, 0.078, -0.50, sHi);                          // top highlight
      b.box(0.05, 0.05, 0.06, 0, 0.045, -0.71, sLo);                           // muzzle crown
      b.box(0.022, 0.022, 0.05, 0, 0.045, -0.74, sSlot);                       // bore
      b.box(0.012, 0.045, 0.025, 0, 0.085, -0.66, sBright);                    // front sight blade
      b.box(0.092, 0.10, 0.14, 0, 0.03, -0.30, sMid, { tint: 0.02 });          // barrel-to-frame step
      // frame / receiver
      b.box(0.10, 0.12, 0.42, 0, 0.0, -0.12, sMid, { tint: 0.02 });            // frame body
      b.box(0.105, 0.03, 0.42, 0, -0.062, -0.12, sLo);                         // lower shadow strip
      // toggle-lock breech (the Luger signature, raised top-rear)
      b.box(0.088, 0.085, 0.24, 0, 0.095, -0.04, sHi, { tint: 0.02 });         // breech block (lit)
      b.box(0.075, 0.05, 0.15, 0, 0.15, 0.01, sMid);                           // rear toggle link
      { const tk = new THREE.CylinderGeometry(0.038, 0.038, 0.14, 14); b.geo(tk, 0, 0.155, 0.08, sBright, { rz: Math.PI / 2 }); tk.dispose(); } // two round toggle knobs
      b.box(0.045, 0.04, 0.04, 0, 0.135, -0.08, sSlot);                        // rear sight notch (dark)
      b.box(0.012, 0.04, 0.02, -0.022, 0.155, -0.08, sHi); b.box(0.012, 0.04, 0.02, 0.022, 0.155, -0.08, sHi); // notch ears
      // raked grip (checkered walnut)
      b.box(0.088, 0.27, 0.115, 0, -0.16, 0.10, wMid, { rx: -0.5, tint: 0.05 });    // grip body
      b.box(0.07, 0.25, 0.02, 0.05, -0.16, 0.10, wHi, { rx: -0.5 });                // right checker face (lit)
      b.box(0.07, 0.25, 0.02, -0.05, -0.16, 0.10, wLo, { rx: -0.5 });               // left face (shadow)
      b.box(0.10, 0.035, 0.12, 0, -0.30, 0.225, straw, { rx: -0.5 });               // magazine base plate
      // trigger guard + trigger
      b.box(0.075, 0.022, 0.085, 0, -0.085, -0.085, sLo);                      // guard bottom
      b.box(0.02, 0.06, 0.02, 0, -0.06, -0.12, sLo);                           // guard front post
      b.box(0.018, 0.05, 0.018, 0, -0.055, -0.085, straw);                     // trigger (straw)
      break;
    }
    case 'revolver': { // Colt Single Action Army "Peacemaker" — long barrel, ejector rod, fluted 6-cylinder, plow grip (.45 Colt)
      const sHi = 0x9aa1ab, sMid = 0x6f7680, sLo = 0x4c525a, sSlot = 0x2a2e34, sBright = 0xb4bbc4; // bright blued/case steel
      const wHi = 0x6a4a2c, wMid = 0x4e3420, wLo = 0x352213, ch = 0x8a7f6a;                          // walnut grip + color-case frame
      // long round barrel (muzzle -Z)
      { const bar = new THREE.CylinderGeometry(0.045, 0.048, 0.62, 16); b.geo(bar, 0, 0.03, -0.5, sMid, { rx: Math.PI / 2, tint: 0.02 }); bar.dispose(); }
      b.box(0.03, 0.018, 0.6, 0, 0.073, -0.5, sHi);                            // top barrel highlight
      b.box(0.012, 0.03, 0.02, 0, 0.076, -0.78, sBright);                      // front sight blade
      b.box(0.03, 0.03, 0.05, 0, 0.03, -0.82, sSlot);                          // muzzle/bore
      // ejector-rod tube under the barrel
      { const ej = new THREE.CylinderGeometry(0.022, 0.022, 0.42, 12); b.geo(ej, 0.0, -0.018, -0.56, sLo, { rx: Math.PI / 2 }); ej.dispose(); }
      b.box(0.03, 0.03, 0.04, 0.0, -0.018, -0.78, sMid);                       // ejector head
      // frame + topstrap
      b.box(0.085, 0.13, 0.20, 0, 0.0, -0.10, ch, { tint: 0.03 });             // frame (color-case)
      b.box(0.07, 0.025, 0.16, 0, 0.07, -0.12, sHi);                           // topstrap
      b.box(0.04, 0.035, 0.04, 0, 0.075, -0.04, sSlot);                        // rear sight notch
      // fluted cylinder (6-shot)
      { const cyl = new THREE.CylinderGeometry(0.072, 0.072, 0.17, 18); b.geo(cyl, 0, 0.0, -0.06, sMid, { rx: Math.PI / 2, tint: 0.02 }); cyl.dispose(); }
      for (let i = 0; i < 6; i++) { const a2 = i / 6 * Math.PI * 2; b.box(0.016, 0.016, 0.15, Math.cos(a2) * 0.066, Math.sin(a2) * 0.066, -0.06, sSlot); } // flutes
      b.box(0.012, 0.05, 0.07, 0.07, 0.0, 0.01, sLo);                          // loading gate (right rear)
      // hammer (big spur, up at rear)
      b.box(0.03, 0.07, 0.05, 0, 0.10, 0.07, sLo);                             // hammer body
      b.box(0.045, 0.03, 0.04, 0, 0.135, 0.085, sBright);                      // hammer spur
      // plow-handle grip (curved, swept down-back)
      b.box(0.072, 0.22, 0.11, 0, -0.13, 0.135, wMid, { rx: -0.55, tint: 0.04 });   // grip body
      b.box(0.055, 0.2, 0.02, 0.045, -0.13, 0.135, wHi, { rx: -0.55 });             // right face (lit)
      b.box(0.055, 0.2, 0.02, -0.045, -0.13, 0.135, wLo, { rx: -0.55 });            // left face
      b.box(0.078, 0.05, 0.10, 0, -0.235, 0.24, sLo, { rx: -0.55 });                // grip butt cap
      // trigger guard + trigger
      b.box(0.06, 0.02, 0.075, 0, -0.085, -0.02, sMid);                        // guard bottom
      b.box(0.018, 0.05, 0.018, 0, -0.06, -0.04, sBright);                     // trigger
      break;
    }
    case 'smg': { // Thompson M1928A1 "Tommy Gun" — Cutts compensator, finned barrel, top charging knob, Lyman sight, walnut furniture (.45 ACP, 700 rpm)
      const sHi = 0x5a606a, sMid = 0x40454d, sLo = 0x2b2f35, sSlot = 0x1a1c20, sBright = 0x6f757e; // blued steel
      const wHi = 0x9a6a38, wMid = 0x7c5026, wLo = 0x553418;                                          // walnut
      // Cutts compensator (slotted) + bore
      { const cc = new THREE.CylinderGeometry(0.062, 0.062, 0.11, 14); b.geo(cc, 0, 0.03, -1.04, sMid, { rx: Math.PI / 2 }); cc.dispose(); }
      for (let i = 0; i < 3; i++) b.box(0.04, 0.016, 0.02, 0, 0.085, -1.07 + i * 0.03, sSlot);   // comp slots (top)
      b.box(0.03, 0.03, 0.05, 0, 0.03, -1.11, sSlot);                                            // bore
      // finned cooling barrel
      b.box(0.045, 0.045, 0.40, 0, 0.03, -0.78, sMid);                                           // barrel core
      for (let i = 0; i < 7; i++) { const f = new THREE.CylinderGeometry(0.06, 0.06, 0.022, 14); b.geo(f, 0, 0.03, -0.62 - i * 0.055, sHi, { rx: Math.PI / 2 }); f.dispose(); } // fins
      b.box(0.04, 0.05, 0.05, 0, 0.075, -0.95, sLo); b.box(0.012, 0.04, 0.02, 0, 0.10, -0.95, sBright); // protected front sight
      // boxy receiver
      b.box(0.10, 0.135, 0.50, 0, 0.0, -0.26, sMid, { tint: 0.02 });                             // body
      b.box(0.092, 0.035, 0.50, 0, 0.085, -0.26, sHi);                                           // top (lit)
      b.box(0.104, 0.03, 0.50, 0, -0.07, -0.26, sLo);                                            // lower shadow
      b.box(0.05, 0.045, 0.05, 0, 0.105, -0.14, sBright);                                        // top charging knob
      b.box(0.055, 0.05, 0.04, 0, 0.10, -0.02, sLo); b.box(0.03, 0.025, 0.02, 0, 0.13, -0.02, sBright); // Lyman ladder rear sight
      // vertical wood foregrip
      b.box(0.062, 0.17, 0.10, 0, -0.15, -0.60, wMid, { tint: 0.03 });
      b.box(0.05, 0.155, 0.022, 0.034, -0.15, -0.60, wHi); b.box(0.05, 0.155, 0.022, -0.034, -0.15, -0.60, wLo);
      // box stick magazine (down, ahead of trigger)
      b.box(0.05, 0.24, 0.092, 0, -0.21, -0.10, sMid, { tint: 0.02 });
      b.box(0.054, 0.03, 0.096, 0, -0.33, -0.10, sLo);                                           // mag floor
      // angled walnut pistol grip + trigger
      b.box(0.06, 0.20, 0.105, 0, -0.15, 0.10, wMid, { rx: -0.28, tint: 0.03 });
      b.box(0.048, 0.18, 0.022, 0.033, -0.15, 0.10, wHi, { rx: -0.28 }); b.box(0.048, 0.18, 0.022, -0.033, -0.15, 0.10, wLo, { rx: -0.28 });
      b.box(0.07, 0.022, 0.13, 0, -0.075, 0.04, sLo); b.box(0.02, 0.05, 0.02, 0, -0.05, 0.02, sBright); // guard + trigger
      // walnut buttstock
      b.box(0.092, 0.15, 0.44, 0, -0.04, 0.44, wMid, { tint: 0.03 });
      b.box(0.082, 0.045, 0.42, 0, 0.04, 0.44, wHi); b.box(0.10, 0.20, 0.07, 0, -0.06, 0.67, wLo); // comb + butt plate
      break;
    }
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
    case 'carbine': { // U.S. M1 Carbine — slim one-piece walnut stock, exposed thin barrel + band, winged sight, 15-rnd box (.30 Carbine, semi)
      const sHi = 0x565a52, sMid = 0x3c3f3a, sLo = 0x262824, sSlot = 0x171815, sBright = 0x6a6e66; // parkerized steel
      const wHi = 0xa9703f, wMid = 0x8a5a34, wLo = 0x5c3a20;
      b.box(0.078, 0.10, 0.40, 0, 0.0, 0.02, sMid, { tint: 0.02 });           // receiver
      b.box(0.07, 0.03, 0.40, 0, 0.055, 0.02, sHi);                           // top (lit)
      b.box(0.04, 0.038, 0.05, 0.05, 0.02, 0.08, sBright);                    // charging handle (right)
      b.box(0.045, 0.04, 0.04, 0, 0.075, 0.16, sLo); b.box(0.02, 0.022, 0.02, 0, 0.10, 0.16, sSlot); // rear aperture
      b.box(0.04, 0.04, 0.5, 0, 0.03, -1.05, sMid);                           // exposed barrel
      b.box(0.05, 0.05, 0.05, 0, 0.075, -1.18, sLo); b.box(0.012, 0.05, 0.02, -0.024, 0.10, -1.18, sLo); b.box(0.012, 0.05, 0.02, 0.024, 0.10, -1.18, sLo); b.box(0.012, 0.045, 0.02, 0, 0.108, -1.18, sBright); // winged front sight
      b.box(0.09, 0.085, 0.06, 0, 0.0, -0.82, sLo);                           // barrel band
      b.box(0.082, 0.10, 0.72, 0, -0.02, -0.50, wMid, { tint: 0.03 });        // forearm/handguard
      b.box(0.07, 0.03, 0.72, 0, 0.035, -0.50, wHi);                          // top highlight
      b.box(0.075, 0.12, 0.24, 0, -0.06, 0.22, wMid, { tint: 0.03 });         // wrist
      b.box(0.088, 0.17, 0.42, 0, -0.04, 0.46, wMid, { tint: 0.03 });         // buttstock
      b.box(0.078, 0.05, 0.40, 0, 0.05, 0.46, wHi);                           // comb (lit)
      b.box(0.092, 0.20, 0.06, 0, -0.06, 0.68, wLo);                          // buttplate
      b.box(0.046, 0.17, 0.085, 0, -0.14, -0.05, sMid, { tint: 0.02 });       // box magazine
      b.box(0.05, 0.022, 0.13, 0, -0.06, 0.04, sLo); b.box(0.018, 0.04, 0.018, 0, -0.04, 0.02, sBright); // guard + trigger
      break;
    }
    case 'garand': { // U.S. M1 Garand — full walnut stock + upper handguard, gas cylinder + winged sight, op-rod, en-bloc receiver (.30-06, 8-rnd)
      const sHi = 0x5a6068, sMid = 0x3a3d42, sLo = 0x24272b, sSlot = 0x16181b, sBright = 0x6a7079; // blued steel
      const wHi = 0x8a5630, wMid = 0x6b3e22, wLo = 0x472815;
      b.box(0.095, 0.13, 0.42, 0, 0.0, 0.0, sMid, { tint: 0.02 });            // receiver
      b.box(0.088, 0.035, 0.42, 0, 0.08, 0.0, sHi);                           // top
      b.box(0.05, 0.04, 0.05, 0, 0.11, 0.14, sLo); b.box(0.022, 0.022, 0.02, 0, 0.13, 0.14, sSlot); // rear peep
      b.box(0.06, 0.04, 0.16, 0, 0.085, -0.02, sSlot);                        // open en-bloc top
      b.box(0.045, 0.045, 0.9, 0, 0.04, -0.78, sMid);                         // barrel
      b.box(0.07, 0.06, 0.5, 0, 0.085, -0.55, wMid, { tint: 0.03 });          // upper handguard
      b.box(0.062, 0.025, 0.5, 0, 0.115, -0.55, wHi);                         // handguard highlight
      b.box(0.062, 0.062, 0.20, 0, 0.04, -1.28, sLo, { tint: 0.02 });         // gas cylinder
      b.box(0.05, 0.05, 0.05, 0, 0.085, -1.34, sLo); b.box(0.012, 0.055, 0.02, -0.024, 0.105, -1.34, sLo); b.box(0.012, 0.055, 0.02, 0.024, 0.105, -1.34, sLo); b.box(0.012, 0.05, 0.02, 0, 0.115, -1.34, sBright); // winged front sight
      b.box(0.03, 0.03, 0.08, 0, 0.04, -1.42, sSlot);                         // muzzle/bore
      b.box(0.022, 0.03, 0.7, 0.042, -0.005, -0.7, sBright);                  // operating rod (under-right)
      b.box(0.085, 0.09, 0.7, 0, -0.045, -0.52, wMid, { tint: 0.03 });        // lower forearm
      b.box(0.075, 0.028, 0.7, 0, 0.0, -0.52, wHi);
      b.box(0.078, 0.13, 0.24, 0, -0.07, 0.22, wMid, { tint: 0.03 });         // wrist
      b.box(0.092, 0.18, 0.44, 0, -0.05, 0.46, wMid, { tint: 0.03 });         // buttstock
      b.box(0.082, 0.05, 0.42, 0, 0.04, 0.46, wHi);                           // comb
      b.box(0.096, 0.22, 0.06, 0, -0.06, 0.68, wLo);                          // buttplate
      b.box(0.05, 0.024, 0.14, 0, -0.085, 0.02, sLo); b.box(0.018, 0.045, 0.018, 0, -0.06, 0.0, sBright); // trigger
      break;
    }
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
    case 'shotgun': { // Winchester M1897 Trench Gun — perforated heat shield, bayonet ring, ribbed pump forend, external hammer (12ga, 5+1 tube, pump)
      const sHi = 0x4a5058, sMid = 0x33373d, sLo = 0x222529, sSlot = 0x141619, sBright = 0x646a72; // blued steel
      const wHi = 0x8a5a32, wMid = 0x6b4426, wLo = 0x472c18;
      // barrel + perforated heat shield (the cheese-grater)
      b.box(0.05, 0.05, 0.72, 0, 0.04, -0.86, sMid);                          // barrel core
      b.box(0.085, 0.092, 0.60, 0, 0.04, -0.84, sMid, { tint: 0.02 });        // heat shield sleeve
      b.box(0.07, 0.026, 0.60, 0, 0.094, -0.84, sHi);                         // shield top (lit)
      for (let i = 0; i < 6; i++) { const z = -0.62 - i * 0.095; b.box(0.04, 0.022, 0.05, 0, 0.092, z, sSlot); b.box(0.018, 0.04, 0.05, 0.046, 0.04, z, sSlot); b.box(0.018, 0.04, 0.05, -0.046, 0.04, z, sSlot); } // perforations
      b.box(0.10, 0.10, 0.06, 0, 0.04, -1.18, sLo);                           // bayonet adapter ring
      b.box(0.012, 0.04, 0.02, 0, 0.10, -1.16, sBright);                      // front sight
      // tube magazine + band
      b.box(0.044, 0.044, 0.58, 0, -0.03, -0.84, sLo);                        // mag tube
      b.box(0.05, 0.092, 0.05, 0, 0.005, -1.0, sLo);                          // barrel band
      // slab receiver + external hammer spur
      b.box(0.09, 0.135, 0.34, 0, 0.0, -0.10, sMid, { tint: 0.02 });
      b.box(0.082, 0.035, 0.34, 0, 0.085, -0.10, sHi);
      b.box(0.03, 0.05, 0.045, 0, 0.105, 0.05, sBright);                      // external hammer spur (top-rear)
      b.box(0.006, 0.05, 0.13, 0.07, 0.04, -0.06, sSlot);                     // ejection port (right)
      // ribbed wooden pump forend
      b.box(0.078, 0.085, 0.30, 0, -0.05, -0.46, wMid, { tint: 0.03 });
      for (let i = 0; i < 4; i++) b.box(0.082, 0.06, 0.012, 0, -0.05, -0.36 - i * 0.06, wLo); // ribs
      // straight-wrist buttstock
      b.box(0.072, 0.12, 0.22, 0, -0.05, 0.16, wMid, { tint: 0.03 });         // wrist
      b.box(0.085, 0.16, 0.42, 0, -0.04, 0.42, wMid, { tint: 0.03 });         // butt
      b.box(0.075, 0.05, 0.40, 0, 0.05, 0.42, wHi);                           // comb
      b.box(0.092, 0.20, 0.06, 0, -0.06, 0.64, wLo);                          // buttplate
      b.box(0.05, 0.022, 0.13, 0, -0.075, 0.0, sLo); b.box(0.018, 0.04, 0.018, 0, -0.05, -0.02, sBright); // guard + trigger
      break;
    }
    case 'sawed': { // Sawed-off side-by-side 12ga — twin stubby barrels, boxlock, external hammers, cut-down checkered stock (break, 2 shells)
      const sHi = 0x4a5058, sMid = 0x2b2e33, sLo = 0x1c1e22, sSlot = 0x121417, sBright = 0x5e646c; // blue-black steel
      const wHi = 0x7a4f34, wMid = 0x5a3826, wLo = 0x3a2418;
      // twin side-by-side barrels (figure-8 bores at muzzle)
      { const bl = new THREE.CylinderGeometry(0.042, 0.042, 0.58, 14); b.geo(bl, -0.046, 0.03, -0.55, sMid, { rx: Math.PI / 2, tint: 0.02 }); bl.dispose(); }
      { const br = new THREE.CylinderGeometry(0.042, 0.042, 0.58, 14); b.geo(br, 0.046, 0.03, -0.55, sMid, { rx: Math.PI / 2, tint: 0.02 }); br.dispose(); }
      b.box(0.03, 0.026, 0.58, 0, 0.072, -0.55, sHi);                         // top rib between barrels
      b.box(0.026, 0.026, 0.04, -0.046, 0.03, -0.85, sSlot); b.box(0.026, 0.026, 0.04, 0.046, 0.03, -0.85, sSlot); // bores
      b.box(0.07, 0.05, 0.12, 0, 0.0, -0.30, sLo);                            // short forend underlug
      // break-action hinge + chunky boxlock receiver
      b.box(0.115, 0.075, 0.06, 0, -0.01, -0.24, sLo);                        // hinge knuckle
      b.box(0.125, 0.135, 0.30, 0, -0.01, -0.04, sMid, { tint: 0.02 });       // boxlock body
      b.box(0.118, 0.035, 0.30, 0, 0.07, -0.04, sHi);                         // top (lit)
      b.box(0.025, 0.04, 0.10, 0, 0.085, 0.04, sLo);                          // top break lever
      b.box(0.022, 0.05, 0.03, -0.03, 0.08, 0.10, sBright); b.box(0.022, 0.05, 0.03, 0.03, 0.08, 0.10, sBright); // two external hammers
      // cut-down pistol-wrist stock (checkered)
      b.box(0.078, 0.19, 0.30, 0, -0.12, 0.18, wMid, { rx: -0.42, tint: 0.04 });
      b.box(0.062, 0.17, 0.022, 0.04, -0.12, 0.18, wHi, { rx: -0.42 }); b.box(0.062, 0.17, 0.022, -0.04, -0.12, 0.18, wLo, { rx: -0.42 });
      b.box(0.09, 0.10, 0.06, 0, -0.23, 0.33, wLo, { rx: -0.42 });            // butt
      // double triggers in open guard
      b.box(0.05, 0.022, 0.12, 0, -0.085, 0.06, sLo); b.box(0.016, 0.04, 0.016, 0, -0.06, 0.02, sBright); b.box(0.016, 0.04, 0.016, 0, -0.06, 0.08, sBright);
      break;
    }
    case 'sniper': { // Kar98k (scoped) — near-full-length wood stock, turned-down bolt, 2 barrel bands, ZF39 scope, hooded front sight (8mm Mauser, 5-rnd, bolt)
      const sHi = 0x4a5058, sMid = 0x2f3237, sLo = 0x1e2125, sSlot = 0x121417, sBright = 0x5e646c; // blued steel
      const wHi = 0xc79a5a, wMid = 0xa9793a, wLo = 0x855a28, lens = 0x0e1218;                          // honey wood + glass
      // long wood stock + forend (covers most of the barrel)
      b.box(0.088, 0.10, 1.05, 0, -0.02, -0.55, wMid, { tint: 0.03 });        // forend
      b.box(0.075, 0.028, 1.0, 0, 0.034, -0.55, wHi);                         // top handguard highlight
      b.box(0.078, 0.13, 0.24, 0, -0.06, 0.22, wMid, { tint: 0.03 });         // wrist
      b.box(0.092, 0.18, 0.44, 0, -0.05, 0.48, wMid, { tint: 0.03 });         // buttstock
      b.box(0.082, 0.05, 0.42, 0, 0.045, 0.48, wHi);                          // comb (lit)
      b.box(0.096, 0.22, 0.06, 0, -0.06, 0.70, wLo);                          // buttplate
      { const disc = new THREE.CylinderGeometry(0.05, 0.05, 0.012, 12); b.geo(disc, -0.047, -0.02, 0.50, sLo, { rz: Math.PI / 2 }); disc.dispose(); } // stock takedown disc (left)
      // barrel bands + short exposed barrel + hooded front sight
      b.box(0.095, 0.10, 0.05, 0, 0.0, -0.78, sLo); b.box(0.095, 0.10, 0.05, 0, 0.0, -1.05, sLo); // two barrel bands
      b.box(0.044, 0.044, 0.30, 0, 0.02, -1.42, sMid);                        // exposed barrel tip
      b.box(0.05, 0.05, 0.05, 0, 0.06, -1.55, sLo); b.box(0.012, 0.05, 0.02, 0, 0.10, -1.55, sBright); b.box(0.012,0.055,0.02,-0.024,0.09,-1.55,sLo); b.box(0.012,0.055,0.02,0.024,0.09,-1.55,sLo); // hooded front sight
      // receiver + tangent rear sight + turned-down bolt
      b.box(0.08, 0.10, 0.30, 0, 0.0, -0.02, sMid, { tint: 0.02 });
      b.box(0.06, 0.04, 0.07, 0, 0.075, -0.18, sLo);                          // tangent rear sight
      b.box(0.024, 0.024, 0.12, 0.075, 0.0, 0.06, sBright);                   // bolt arm (out right)
      b.box(0.024, 0.07, 0.024, 0.105, -0.04, 0.06, sBright);                 // turned-down section
      { const kn = new THREE.CylinderGeometry(0.028, 0.028, 0.03, 12); b.geo(kn, 0.105, -0.08, 0.06, sBright, { ry: Math.PI / 2 }); kn.dispose(); } // ball knob
      // ZF39 scope high on two rings
      { const sc = new THREE.CylinderGeometry(0.036, 0.036, 0.42, 14); b.geo(sc, 0, 0.18, -0.08, sLo, { rx: Math.PI / 2, tint: 0.02 }); sc.dispose(); }
      { const bell = new THREE.CylinderGeometry(0.046, 0.036, 0.10, 14); b.geo(bell, 0, 0.18, -0.30, sLo, { rx: Math.PI / 2 }); bell.dispose(); }
      { const gl = new THREE.CylinderGeometry(0.04, 0.04, 0.012, 14); b.geo(gl, 0, 0.18, -0.355, lens, { rx: Math.PI / 2 }); gl.dispose(); }
      b.box(0.03, 0.07, 0.03, 0, 0.115, 0.04, sLo); b.box(0.03, 0.07, 0.03, 0, 0.115, -0.18, sLo); // scope rings
      // trigger
      b.box(0.05, 0.024, 0.14, 0, -0.085, 0.02, sLo); b.box(0.018, 0.045, 0.018, 0, -0.06, 0.0, sBright);
      break;
    }
    case 'magnum': { // S&W Model 29 .44 Magnum — vent-rib barrel + ejector shroud, adj. sights, walnut target grips
      const sHi = 0x5a6470, sMid = 0x3f474f, sLo = 0x2b3138, sSlot = 0x191c20, sBright = 0x6e7884; // deep royal-blue steel
      const wHi = 0x7a5230, wMid = 0x5e3d22, wLo = 0x3f2814, red = 0xb53026;                         // walnut grips + red ramp
      // barrel: thick, top sighting rib + full underlug shroud
      b.box(0.075, 0.085, 0.56, 0, 0.04, -0.46, sMid, { tint: 0.02 });         // barrel body
      b.box(0.055, 0.03, 0.56, 0, 0.092, -0.46, sHi);                          // top vent rib (lit)
      for (let i = 0; i < 5; i++) b.box(0.04, 0.018, 0.02, 0, 0.078, -0.30 - i * 0.08, sSlot); // rib vents
      b.box(0.075, 0.05, 0.52, 0, -0.02, -0.46, sLo, { tint: 0.02 });          // ejector-rod underlug
      b.box(0.02, 0.04, 0.02, 0, 0.075, -0.72, red);                           // red ramp front sight
      b.box(0.04, 0.04, 0.05, 0, 0.04, -0.75, sSlot);                          // muzzle/bore
      // frame + adjustable rear sight + thumb latch
      b.box(0.09, 0.135, 0.22, 0, 0.0, -0.10, sMid, { tint: 0.02 });           // frame
      b.box(0.075, 0.03, 0.07, 0, 0.082, -0.02, sLo);                          // adj rear sight body
      b.box(0.05, 0.02, 0.02, 0, 0.10, 0.0, sBright); b.box(0.02, 0.028, 0.02, 0, 0.10, 0.0, sSlot); // sight + notch
      b.box(0.012, 0.06, 0.09, -0.052, 0.0, -0.04, sLo);                       // cylinder thumb latch (left)
      // fluted swing-out cylinder (6)
      { const cyl = new THREE.CylinderGeometry(0.082, 0.082, 0.18, 18); b.geo(cyl, 0, -0.005, -0.05, sMid, { rx: Math.PI / 2, tint: 0.02 }); cyl.dispose(); }
      for (let i = 0; i < 6; i++) { const a2 = i / 6 * Math.PI * 2; b.box(0.018, 0.018, 0.16, Math.cos(a2) * 0.076, -0.005 + Math.sin(a2) * 0.076, -0.05, sSlot); }
      // hammer spur
      b.box(0.03, 0.06, 0.05, 0, 0.105, 0.075, sLo); b.box(0.04, 0.025, 0.04, 0, 0.132, 0.09, sBright);
      // rounded target grip (checkered walnut, chunky)
      b.box(0.092, 0.24, 0.14, 0, -0.15, 0.11, wMid, { rx: -0.32, tint: 0.05 });    // grip body
      b.box(0.07, 0.22, 0.025, 0.055, -0.15, 0.11, wHi, { rx: -0.32 });             // right face (lit)
      b.box(0.07, 0.22, 0.025, -0.055, -0.15, 0.11, wLo, { rx: -0.32 });            // left face
      // trigger guard + grooved trigger
      b.box(0.07, 0.022, 0.12, 0, -0.085, -0.02, sMid);                        // guard (rounded)
      b.box(0.02, 0.055, 0.022, 0, -0.058, -0.03, sBright);                    // trigger
      break;
    }
    case 'mp40': { // MP 40 — all-steel-and-bakelite: tubular receiver, hooked magwell raked forward, ribbed handguard, underfolding stock (9x19, 500 rpm)
      const sHi = 0x565c64, sMid = 0x3e434a, sLo = 0x2a2e33, sSlot = 0x191c20, sBright = 0x6f757e; // dark gun-blue steel
      const kHi = 0x4a4239, kMid = 0x36302a, kLo = 0x241f1b;                                         // dark bakelite (NO wood)
      // short barrel + stepped muzzle nut
      b.box(0.044, 0.044, 0.34, 0, 0.04, -0.78, sMid, { tint: 0.02 });
      b.box(0.06, 0.06, 0.07, 0, 0.04, -0.97, sLo);                            // stepped muzzle nut
      b.box(0.022, 0.022, 0.04, 0, 0.04, -1.0, sSlot);                         // bore
      b.box(0.034, 0.05, 0.06, 0, -0.005, -0.72, sLo);                         // under-barrel resting bar/hook
      // tubular receiver
      { const rc = new THREE.CylinderGeometry(0.058, 0.058, 0.58, 16); b.geo(rc, 0, 0.04, -0.3, sMid, { rx: Math.PI / 2, tint: 0.02 }); rc.dispose(); }
      b.box(0.05, 0.018, 0.56, 0, 0.092, -0.3, sHi);                           // top highlight
      b.box(0.008, 0.03, 0.18, -0.058, 0.05, -0.2, sSlot);                     // left bolt slot
      b.box(0.032, 0.032, 0.04, -0.072, 0.055, -0.16, sBright);                // charging knob (left)
      b.box(0.03, 0.04, 0.05, 0, 0.10, 0.0, sLo); b.box(0.022, 0.016, 0.016, 0, 0.125, 0.0, sBright); // rear sight
      // hooked magazine housing + magazine (raked slightly forward)
      b.box(0.052, 0.15, 0.11, 0, -0.12, -0.20, sMid, { rx: 0.12, tint: 0.02 });   // magwell housing
      b.box(0.046, 0.26, 0.088, 0, -0.34, -0.255, sMid, { rx: 0.12, tint: 0.02 });  // long box magazine
      b.box(0.05, 0.03, 0.092, 0, -0.47, -0.27, sLo, { rx: 0.12 });                  // mag floor
      // ribbed bakelite handguard (underside ahead of magwell)
      b.box(0.066, 0.06, 0.22, 0, -0.05, -0.46, kMid, { tint: 0.03 });
      for (let i = 0; i < 4; i++) b.box(0.07, 0.05, 0.012, 0, -0.05, -0.40 - i * 0.05, kLo);   // ribs
      // bakelite pistol grip + trigger guard
      b.box(0.058, 0.20, 0.10, 0, -0.15, 0.08, kMid, { rx: -0.22, tint: 0.03 });
      b.box(0.046, 0.18, 0.02, 0.032, -0.15, 0.08, kHi, { rx: -0.22 }); b.box(0.046, 0.18, 0.02, -0.032, -0.15, 0.08, kLo, { rx: -0.22 });
      b.box(0.055, 0.022, 0.10, 0, -0.072, 0.0, sLo); b.box(0.018, 0.045, 0.018, 0, -0.05, -0.02, sBright); // guard + trigger
      // underfolding skeleton stock (extended)
      b.box(0.022, 0.022, 0.34, 0.025, -0.05, 0.34, sMid); b.box(0.022, 0.022, 0.34, -0.025, -0.05, 0.34, sMid); // struts
      b.box(0.11, 0.03, 0.03, 0, -0.05, 0.52, sMid);                           // shoulder bar
      break;
    }
    case 'grease': { // M3 "Grease Gun" — fat tubular receiver, top dust cover, vertical grip, straight box mag, wire stock (.45 ACP, 450 rpm)
      const sHi = 0x646859, sMid = 0x474a42, sLo = 0x303129, sSlot = 0x1e201c, sBright = 0x767a6c; // dull parkerized greenish-charcoal
      // fat "soup can" receiver
      { const rc = new THREE.CylinderGeometry(0.076, 0.076, 0.62, 18); b.geo(rc, 0, 0.0, 0.04, sMid, { rx: Math.PI / 2, tint: 0.02 }); rc.dispose(); }
      b.box(0.06, 0.02, 0.60, 0, 0.078, 0.04, sHi);                            // top highlight strip
      b.box(0.07, 0.02, 0.60, 0, -0.078, 0.04, sLo);                           // bottom shadow strip
      // stubby barrel + knurled muzzle nut + sights
      b.box(0.042, 0.042, 0.26, 0, 0.0, -0.40, sMid);
      b.box(0.058, 0.058, 0.06, 0, 0.0, -0.54, sLo); b.box(0.022, 0.022, 0.04, 0, 0.0, -0.57, sSlot); // muzzle nut + bore
      b.box(0.014, 0.032, 0.02, 0, 0.092, -0.40, sBright);                     // front blade sight
      b.box(0.04, 0.032, 0.014, 0, 0.092, 0.30, sLo); b.box(0.016, 0.016, 0.016, 0, 0.10, 0.30, sSlot); // rear peep
      // top ejection-port dust cover
      b.box(0.05, 0.028, 0.13, 0.02, 0.078, -0.06, sLo);
      // vertical pistol grip + big round trigger guard (rear third)
      b.box(0.06, 0.19, 0.092, 0, -0.16, 0.20, sMid, { tint: 0.02 });
      b.box(0.048, 0.17, 0.02, 0.033, -0.16, 0.20, sHi); b.box(0.048, 0.17, 0.02, -0.033, -0.16, 0.20, sLo);
      b.box(0.058, 0.022, 0.14, 0, -0.075, 0.13, sLo); b.box(0.022, 0.018, 0.10, 0, -0.06, 0.08, sLo); // big rounded guard
      b.box(0.018, 0.04, 0.018, 0, -0.05, 0.11, sBright);                      // trigger
      // straight box magazine (front, slight forward rake)
      b.box(0.05, 0.26, 0.088, 0, -0.20, -0.05, sMid, { rx: 0.06, tint: 0.02 });
      b.box(0.054, 0.03, 0.092, 0, -0.33, -0.06, sLo, { rx: 0.06 });
      // retractable wire stock (two side rails + shoulder)
      b.box(0.014, 0.014, 0.40, 0.05, -0.02, 0.44, sMid); b.box(0.014, 0.014, 0.40, -0.05, -0.02, 0.44, sMid);
      b.box(0.13, 0.014, 0.014, 0, -0.02, 0.63, sMid);                         // shoulder bar
      break;
    }
    case 'bar': { // BAR M1918A2 — long barrel-over-gas-tube, tall 20-rnd box, wood stock+forearm, bipod, flash hider (.30-06, auto)
      const sHi = 0x3a3f47, sMid = 0x2c2f35, sLo = 0x1c1e22, sSlot = 0x131519, sBright = 0x565b63; // worn blued steel
      const wHi = 0x8a6038, wMid = 0x6e4a2f, wLo = 0x4a301e;
      b.box(0.11, 0.15, 0.5, 0, 0.0, -0.08, sMid, { tint: 0.02 });            // receiver
      b.box(0.10, 0.035, 0.5, 0, 0.09, -0.08, sHi);                           // top (lit)
      b.box(0.05, 0.04, 0.05, 0, 0.12, 0.04, sLo); b.box(0.022, 0.018, 0.02, 0, 0.14, 0.04, sBright); // rear leaf
      b.box(0.052, 0.052, 0.9, 0, 0.05, -0.95, sMid);                         // barrel (top)
      b.box(0.034, 0.034, 0.74, 0, -0.04, -0.90, sLo);                        // gas tube (below, air gap = the BAR look)
      { const fh = new THREE.CylinderGeometry(0.052, 0.072, 0.12, 12); b.geo(fh, 0, 0.05, -1.46, sLo, { rx: Math.PI / 2 }); fh.dispose(); } // flash hider
      b.box(0.05, 0.05, 0.05, 0, 0.10, -1.30, sLo); b.box(0.012, 0.05, 0.02, 0, 0.13, -1.30, sBright); // front sight
      b.box(0.09, 0.10, 0.34, 0, -0.01, -0.50, wMid, { tint: 0.03 });         // wood forearm
      b.box(0.078, 0.03, 0.34, 0, 0.045, -0.50, wHi);
      b.box(0.058, 0.28, 0.10, 0, -0.22, -0.02, sMid, { tint: 0.02 });        // tall 20-rnd box mag
      b.box(0.062, 0.03, 0.104, 0, -0.37, -0.02, sLo);                        // mag floor
      b.box(0.082, 0.13, 0.26, 0, -0.06, 0.22, wMid, { tint: 0.03 });         // wrist
      b.box(0.095, 0.18, 0.46, 0, -0.04, 0.50, wMid, { tint: 0.03 });         // butt
      b.box(0.085, 0.05, 0.44, 0, 0.05, 0.50, wHi);                           // comb
      b.box(0.10, 0.22, 0.06, 0, -0.05, 0.73, wLo);                           // buttplate
      b.box(0.05, 0.024, 0.14, 0, -0.085, 0.02, sLo); b.box(0.018, 0.045, 0.018, 0, -0.06, 0.0, sBright); // trigger
      b.box(0.05, 0.05, 0.06, 0, -0.04, -1.18, sLo);                          // bipod mount
      b.box(0.022, 0.36, 0.022, -0.10, -0.26, -1.18, sLo, { rz: 0.4 });       // bipod leg L
      b.box(0.022, 0.36, 0.022, 0.10, -0.26, -1.18, sLo, { rz: -0.4 });       // bipod leg R
      b.box(0.06, 0.018, 0.03, -0.165, -0.42, -1.18, sBright); b.box(0.06, 0.018, 0.03, 0.165, -0.42, -1.18, sBright); // skid feet
      break;
    }
    case 'dp28': {  // DP-28 LMG — warm blued gunmetal (NOT black), honey-walnut stock, slotted shroud, conical flash hider, bipod (pan = separate spinning mesh)
      const stHi = 0x666d76, stMid = 0x4a4f57, stLo = 0x33373d, stSlot = 0x23262b, stBright = 0x747b84; // warm blued gunmetal
      const wHi = 0xb07e44, wMid = 0x8f6230, wLo = 0x5e3f1e;                                              // honey walnut
      b.box(0.1, 0.18, 0.5, 0, -0.05, 0.5, wMid, { tint: 0.03 });            // stock
      b.box(0.088, 0.05, 0.48, 0, 0.03, 0.5, wHi);                           // comb (lit)
      b.box(0.11, 0.24, 0.12, 0, -0.1, 0.74, wLo, { tint: 0.03 });           // butt
      b.box(0.09, 0.22, 0.12, 0, -0.17, 0.16, stLo, { rx: -0.2 });           // grip
      b.box(0.12, 0.16, 0.45, 0, 0.0, 0.0, stMid, { tint: 0.02 });           // receiver
      b.box(0.112, 0.04, 0.45, 0, 0.085, 0.0, stHi);                         // receiver top (lit)
      b.box(0.22, 0.04, 0.22, 0, 0.1, -0.3, stMid);                          // pan seat
      b.box(0.1, 0.12, 0.66, 0, 0.04, -0.62, stMid, { tint: 0.02 });         // barrel shroud
      b.box(0.088, 0.03, 0.66, 0, 0.10, -0.62, stHi);                        // shroud top highlight
      for (let i = 0; i < 4; i++) b.box(0.11, 0.05, 0.09, 0, 0.08, -0.45 - i * 0.14, stSlot); // cooling slots
      b.box(0.06, 0.06, 0.62, 0, 0.04, -1.15, stMid);                        // long barrel
      const cone = new THREE.CylinderGeometry(0.1, 0.05, 0.18, 12); b.geo(cone, 0, 0.04, -1.5, stLo, { rx: Math.PI / 2 }); cone.dispose(); // conical flash hider
      b.box(0.05, 0.1, 0.05, 0, 0.13, -1.04, stLo); b.box(0.012, 0.05, 0.02, 0, 0.17, -1.04, stBright); // front sight + post
      b.box(0.06, 0.07, 0.06, 0, 0.14, 0.1, stLo);                           // rear sight
      b.box(0.1, 0.06, 0.06, 0, -0.05, -1.0, stLo);                          // bipod pivot
      b.box(0.04, 0.52, 0.04, -0.11, -0.3, -1.0, stLo, { rz: 0.26 });        // bipod leg
      b.box(0.04, 0.52, 0.04, 0.11, -0.3, -1.0, stLo, { rz: -0.26 });        // bipod leg
      break;
    }
    case 'mosin': { // Mosin-Nagant M91/30 (sniper) — very long, hooded front sight, 2 bands, bent-down bolt, PU scope offset-left (7.62x54R, 5-rnd, bolt)
      const sHi = 0x4a4e54, sMid = 0x2f3237, sLo = 0x1e2125, sSlot = 0x121417, sBright = 0x5e646c; // blued steel
      const wHi = 0xc28a48, wMid = 0x9a6a32, wLo = 0x6a4520, lens = 0x0e1218;                          // amber birch + glass
      // long thin barrel projecting far forward
      b.box(0.044, 0.044, 0.55, 0, 0.03, -1.45, sMid);                        // exposed barrel
      b.box(0.05, 0.05, 0.05, 0, 0.07, -1.62, sLo); b.box(0.012, 0.05, 0.02, 0, 0.105, -1.62, sBright); b.box(0.014,0.06,0.022,-0.026,0.095,-1.62,sLo); b.box(0.014,0.06,0.022,0.026,0.095,-1.62,sLo); // hooded front sight (ears)
      // wood stock + forend (forward half) + two bands
      b.box(0.085, 0.10, 1.05, 0, -0.02, -0.62, wMid, { tint: 0.03 });        // forend
      b.box(0.072, 0.028, 1.0, 0, 0.034, -0.62, wHi);                         // handguard highlight
      b.box(0.092, 0.095, 0.05, 0, 0.0, -0.78, sLo); b.box(0.092, 0.095, 0.05, 0, 0.0, -1.12, sLo); // two barrel bands
      b.box(0.074, 0.12, 0.24, 0, -0.06, 0.26, wMid, { tint: 0.03 });         // wrist (straight broomstick)
      b.box(0.088, 0.17, 0.44, 0, -0.05, 0.52, wMid, { tint: 0.03 });         // slim butt
      b.box(0.078, 0.05, 0.42, 0, 0.045, 0.52, wHi);                          // comb
      b.box(0.092, 0.20, 0.06, 0, -0.06, 0.74, wLo);                          // buttplate
      // hex receiver + tangent ladder rear sight + mag box
      b.box(0.078, 0.105, 0.30, 0, 0.0, -0.04, sMid, { tint: 0.02 });
      b.box(0.06, 0.045, 0.08, 0, 0.08, -0.30, sLo);                          // tangent rear sight
      b.box(0.07, 0.09, 0.12, 0, -0.10, 0.04, sLo);                           // magazine box + floorplate
      // bent-down sniper bolt handle (right)
      b.box(0.024, 0.024, 0.10, 0.07, -0.01, 0.08, sBright); b.box(0.024, 0.10, 0.024, 0.10, -0.07, 0.08, sBright);
      { const kn = new THREE.CylinderGeometry(0.026, 0.026, 0.03, 12); b.geo(kn, 0.10, -0.13, 0.08, sBright, { ry: Math.PI / 2 }); kn.dispose(); }
      // PU scope on offset bracket (above + left of bore)
      { const sc = new THREE.CylinderGeometry(0.032, 0.032, 0.30, 14); b.geo(sc, -0.03, 0.165, -0.06, sLo, { rx: Math.PI / 2, tint: 0.02 }); sc.dispose(); }
      { const gl = new THREE.CylinderGeometry(0.03, 0.03, 0.012, 14); b.geo(gl, -0.03, 0.165, -0.21, lens, { rx: Math.PI / 2 }); gl.dispose(); }
      b.box(0.05, 0.08, 0.03, -0.03, 0.105, 0.0, sLo);                        // offset mount bracket
      // trigger
      b.box(0.05, 0.024, 0.13, 0, -0.085, 0.04, sLo); b.box(0.018, 0.045, 0.018, 0, -0.06, 0.02, sBright);
      break;
    }
    case 'bazooka': { // M1A1 2.36-inch Rocket Launcher — long open olive tube, twin wood grips, shoulder rest, battery box, rear blast ring (60mm rocket, single)
      const oHi = 0x646a48, oMid = 0x4d5038, oLo = 0x363a28, oSlot = 0x222616, oBright = 0x787e5c; // olive-drab steel
      const wHi = 0x8a6238, wMid = 0x6e4a2a, wLo = 0x4a3018, warhead = 0x9a7a32;
      // long open smoothbore tube
      { const t = new THREE.CylinderGeometry(0.10, 0.10, 1.5, 20); b.geo(t, 0, 0.0, -0.10, oMid, { rx: Math.PI / 2, tint: 0.02 }); t.dispose(); }
      b.box(0.07, 0.022, 1.46, 0, 0.10, -0.10, oHi);                          // top highlight strip
      b.box(0.075, 0.024, 1.46, 0, -0.10, -0.10, oLo);                        // bottom shadow strip
      { const fb = new THREE.CylinderGeometry(0.075, 0.075, 0.04, 18); b.geo(fb, 0, 0, -0.85, oSlot, { rx: Math.PI / 2 }); fb.dispose(); } // front bore (open)
      // front sight (ladder) on top near muzzle
      b.box(0.02, 0.07, 0.04, 0, 0.13, -0.70, oLo); b.box(0.04, 0.012, 0.012, 0, 0.165, -0.70, oBright);
      // front wood fore-grip (hangs down)
      b.box(0.05, 0.16, 0.085, 0, -0.20, -0.34, wMid, { tint: 0.03 });
      b.box(0.04, 0.145, 0.02, 0.03, -0.20, -0.34, wHi); b.box(0.04, 0.145, 0.02, -0.03, -0.20, -0.34, wLo);
      // rear wood trigger grip + guard
      b.box(0.05, 0.18, 0.09, 0, -0.19, 0.16, wMid, { rx: -0.18, tint: 0.03 });
      b.box(0.04, 0.16, 0.02, 0.03, -0.19, 0.16, wHi); b.box(0.04, 0.16, 0.02, -0.03, -0.19, 0.16, wLo);
      b.box(0.05, 0.022, 0.10, 0, -0.10, 0.12, oLo); b.box(0.016, 0.04, 0.016, 0, -0.075, 0.10, oBright); // guard + trigger
      // wood shoulder-rest board (underside, rear)
      b.box(0.07, 0.05, 0.30, 0, -0.135, 0.38, wMid, { tint: 0.03 });
      // battery / contact box on top near rear grip
      b.box(0.075, 0.06, 0.13, 0, 0.125, 0.14, oLo, { tint: 0.02 }); b.box(0.05, 0.018, 0.10, 0, 0.16, 0.14, oBright);
      // rear blast ring + loaded finned rocket protruding
      { const ring = new THREE.CylinderGeometry(0.125, 0.125, 0.03, 18); b.geo(ring, 0, 0, 0.66, oLo, { rx: Math.PI / 2 }); ring.dispose(); }
      { const rk = new THREE.CylinderGeometry(0.05, 0.05, 0.22, 14); b.geo(rk, 0, 0, 0.74, warhead, { rx: Math.PI / 2, tint: 0.02 }); rk.dispose(); }
      { const nose = new THREE.CylinderGeometry(0.05, 0.028, 0.10, 14); b.geo(nose, 0, 0, 0.62, oLo, { rx: -Math.PI / 2 }); nose.dispose(); } // warhead nose into tube
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; b.box(0.01, 0.05, 0.10, Math.cos(a) * 0.055, Math.sin(a) * 0.055, 0.86, oSlot, { rz: -a }); } // tail fins
      break;
    }
    case 'axe': { // German trench hatchet (Beilpicke) — fan bit + tapering spike poll, langets, hardwood haft
      const sHi = 0x9aa0a4, sMid = 0x6e7378, sLo = 0x44484c, sEdge = 0xc4cace, sSlot = 0x2a2d30; // forged steel
      const wHi = 0xd8ae76, wMid = 0xb98a4e, wLo = 0x7e5a30;                                       // hickory haft
      // haft (head forward -Z, grip toward +Z)
      b.box(0.046, 0.052, 0.80, 0, 0.0, -0.42, wMid, { tint: 0.04 });
      b.box(0.046, 0.013, 0.80, 0, 0.03, -0.42, wHi); b.box(0.046, 0.013, 0.80, 0, -0.03, -0.42, wLo); // grain hi/lo
      { const k = new THREE.CylinderGeometry(0.05, 0.044, 0.10, 12); b.geo(k, 0, 0, 0.04, wHi, { rx: Math.PI / 2 }); k.dispose(); } // grip swell knob (butt)
      // head collar (eye) + langets down the haft
      b.box(0.07, 0.082, 0.12, 0, 0.01, -0.80, sMid, { tint: 0.02 });          // eye/collar
      b.box(0.014, 0.05, 0.16, 0.03, 0.0, -0.70, sLo); b.box(0.014, 0.05, 0.16, -0.03, 0.0, -0.70, sLo); // langets
      b.box(0.016, 0.016, 0.016, 0.034, 0.0, -0.66, sHi); b.box(0.016, 0.016, 0.016, -0.034, 0.0, -0.66, sHi); // langet rivets
      // fan-shaped bit (flares down & forward)
      b.box(0.05, 0.20, 0.14, 0, -0.06, -0.90, sMid, { tint: 0.02 });          // bit body
      b.box(0.052, 0.035, 0.14, 0, 0.045, -0.90, sHi);                         // bit top (lit)
      b.box(0.02, 0.24, 0.05, 0, -0.09, -0.965, sEdge);                        // broad curved cutting edge (bright)
      // pick / spike poll (projects back toward player)
      b.box(0.04, 0.05, 0.10, 0, 0.02, -0.73, sMid);                           // spike base
      b.box(0.026, 0.034, 0.12, 0, 0.02, -0.63, sMid, { tint: 0.02 });         // tapering spike
      b.box(0.014, 0.018, 0.06, 0, 0.02, -0.55, sEdge);                        // spike point (bright)
      break;
    }
    case 'binoculars': {   // Soviet 6x30 porro field binocular (per blueprint) — COMPACT (depth<width), NEAR-PARALLEL barrels with a porro vertical JOG (eyepiece high/back, objective low/front), chunky rounded bodies tapering to the objective, glass lenses, central bridge focus wheel. Black leatherette. No markings.
      const body = 0x2c2f33, bodyLo = 0x191b1e, steel = 0x646b73, steelLo = 0x3a3f45,
            brass = 0x9c7a3c, brassHi = 0xc6a05a, glassMid = 0xa6c8d8, glassHi = 0xd9eef6, glint = 0xffffff, lensDk = 0x3a525e;
      const PI2 = Math.PI / 2;
      const cyl = (r0, r1, h, x, y, z, col, o = {}) => { const g = new THREE.CylinderGeometry(r1, r0, h, o.seg || 24); b.geo(g, x, y, z, col, o); g.dispose(); };
      const lat = (prof, x, y, z, col, o = {}) => { const g = new THREE.LatheGeometry(prof.map(q => new THREE.Vector2(q[0], q[1])), o.seg || 22); b.geo(g, x, y, z, col, o); g.dispose(); };
      const tube = (A, B, rB, rT, col, seg = 26) => { const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, mz = (A[2] + B[2]) / 2, dx = B[0] - A[0], dz = B[2] - A[2], len = Math.hypot(dx, B[1] - A[1], dz), rz = Math.atan2(-dx, dz); cyl(rB, rT, len, mx, my, mz, col, { rx: PI2, rz, seg }); return rz; };
      const slab = (w, h, depth, rad, x, y, z, col) => { const sh = new THREE.Shape(), x0 = -w / 2, y0 = -h / 2; sh.moveTo(x0 + rad, y0); sh.lineTo(x0 + w - rad, y0); sh.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rad); sh.lineTo(x0 + w, y0 + h - rad); sh.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rad, y0 + h); sh.lineTo(x0 + rad, y0 + h); sh.quadraticCurveTo(x0, y0 + h, x0, y0 + h - rad); sh.lineTo(x0, y0 + rad); sh.quadraticCurveTo(x0, y0, x0 + rad, y0); const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.024, bevelSize: 0.024, bevelSegments: 3, curveSegments: 6 }); g.translate(0, 0, -depth / 2); b.geo(g, x, y, z, col); g.dispose(); };
      const eyeSep = 0.135, objSep = 0.143, eyeY = 0.038, objY = -0.038;   // near-parallel + porro vertical jog
      for (const s of [-1, 1]) {
        const hx = eyeSep * s;
        slab(0.152, 0.205, 0.15, 0.06, hx, 0, 0, body);                            // chunky rounded prism body (spans the jog)
        // short tapered objective barrel — low/front (porro jog), fat at the body, thinner at the lens
        const A = [hx, objY, -0.05], B = [objSep * s, objY, -0.225];
        const rz = tube(A, B, 0.084, 0.072, body, 28);
        cyl(0.078, 0.078, 0.05, B[0], B[1], B[2] - 0.002, brass, { rx: PI2, rz, seg: 28 });   // brass objective bezel
        cyl(0.08, 0.078, 0.012, B[0], B[1], B[2] - 0.026, brassHi, { rx: PI2, rz, seg: 28 });  // bright lip
        cyl(0.066, 0.066, 0.012, B[0], B[1], B[2] - 0.03, glassMid, { rx: PI2, rz, seg: 28 }); // glass lens
        cyl(0.044, 0.044, 0.012, B[0], B[1], B[2] - 0.033, glassHi, { rx: PI2, rz, seg: 24 });  // glass pane
        cyl(0.022, 0.022, 0.007, B[0] - 0.028 * s, B[1] + 0.028, B[2] - 0.038, glint, { rx: PI2, rz, seg: 12 }); // reflection
        // eyepiece — high/back (porro jog): knurled steel focus ring + rubber eyecup + glass
        const ep = [[0.05, 0], [0.058, 0.01]]; for (let i = 0; i <= 7; i++) ep.push([i % 2 ? 0.061 : 0.054, 0.018 + i * 0.008]); ep.push([0.055, 0.082], [0.045, 0.092]);
        lat(ep, hx, eyeY, 0.06, steel, { rx: PI2, seg: 22 });
        lat([[0.045, 0], [0.055, 0.016], [0.057, 0.03], [0.05, 0.04]], hx, eyeY, 0.102, bodyLo, { rx: PI2, seg: 20 }); // rubber eyecup
        cyl(0.05, 0.05, 0.012, hx, eyeY, 0.108, 0x1f2932, { rx: PI2, seg: 24 });    // eyepiece glass — DARK (you look INTO the lens, so it's not see-through-looking)
        cyl(0.036, 0.036, 0.011, hx, eyeY, 0.112, 0x36474f, { rx: PI2, seg: 20 });   // faint inner sheen
        cyl(0.016, 0.016, 0.008, hx - 0.016 * s, eyeY + 0.016, 0.117, glint, { rx: PI2, seg: 12 }); // bright catch-light (reads as glass)
        cyl(0.012, 0.012, 0.014, hx + 0.088 * s, 0.01, -0.02, brass, { rx: 0, rz: PI2, seg: 12 }); // flat-head plate screw (outer face)
      }
      // central bridge focus wheel + diopter scale + screw slot + hinge axle
      { const kn = [[0.034, 0]]; for (let i = 0; i <= 9; i++) kn.push([i % 2 ? 0.052 : 0.045, 0.01 + i * 0.0105]); kn.push([0.034, 0.115]); lat(kn, 0, -0.058, 0, brass, { seg: 26 }); }
      cyl(0.052, 0.052, 0.01, 0, 0.055, 0, brassHi, { seg: 26 });                 // diopter scale bevel
      for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; b.box(0.0035, 0.005, 0.0035, Math.cos(a) * 0.048, 0.061, Math.sin(a) * 0.048, steelLo); } // graduation ticks
      cyl(0.026, 0.026, 0.016, 0, 0.062, 0, brassHi, { seg: 18 });               // centre boss
      b.box(0.032, 0.006, 0.006, 0, 0.072, 0, steelLo);                          // diopter screw slot
      cyl(0.02, 0.02, 0.16, 0, 0, 0, bodyLo, { seg: 14 });                       // central hinge axle (vertical)
      break;
    }
    case 'flashlight': {     // Soviet steel torch: ribbed body, flared reflector head, red push-button (ref Michael Dronov)
      const stHi = 0xc0c5cc, stMid = 0x8a9099, stLo = 0x5e636b, stSlot = 0x3a3e44, red = 0xc23a2a, redHi = 0xe0584a, lens = 0xe8eef5;
      let gg = new THREE.CylinderGeometry(0.085, 0.085, 0.62, 16); b.geo(gg, 0, 0, -0.2, stMid, { rx: Math.PI / 2, tint: 0.02 }); gg.dispose(); // body
      b.box(0.07, 0.022, 0.6, 0, 0.078, -0.2, stHi);                  // top highlight strip
      b.box(0.08, 0.02, 0.6, 0, -0.082, -0.2, stLo);                  // bottom shadow strip
      for (let i = 0; i < 6; i++) { gg = new THREE.CylinderGeometry(0.092, 0.092, 0.016, 16); b.geo(gg, 0, 0, -0.02 - i * 0.085, stSlot, { rx: Math.PI / 2 }); gg.dispose(); } // ribs
      gg = new THREE.CylinderGeometry(0.155, 0.092, 0.2, 18); b.geo(gg, 0, 0, -0.62, stMid, { rx: -Math.PI / 2, tint: 0.02 }); gg.dispose(); // flared reflector head
      gg = new THREE.CylinderGeometry(0.16, 0.16, 0.04, 18); b.geo(gg, 0, 0, -0.72, stHi, { rx: Math.PI / 2 }); gg.dispose();              // bezel ring (faces forward, not a flat horizontal disc)
      gg = new THREE.CylinderGeometry(0.135, 0.135, 0.02, 18); b.geo(gg, 0, 0, -0.73, lens, { rx: Math.PI / 2 }); gg.dispose();            // lens
      gg = new THREE.CylinderGeometry(0.078, 0.07, 0.09, 16); b.geo(gg, 0, 0, 0.13, stLo, { rx: Math.PI / 2 }); gg.dispose();             // knurled tail cap
      b.box(0.07, 0.04, 0.12, 0, 0.1, -0.05, stLo);                   // switch housing on top
      b.box(0.04, 0.04, 0.04, 0, 0.13, -0.08, red); b.box(0.03, 0.022, 0.03, 0, 0.15, -0.08, redHi); // red push-button
      break;
    }
    case 'build_sandbag': {  // a single sandbag held in hand (the real preview is the world ghost)
      const m1 = 0xcdb887, h1 = 0xd8c79b, l1 = 0xb89a5e;
      b.box(0.36, 0.17, 0.24, 0, -0.03, -0.5, m1, { tint: 0.05 }); b.box(0.31, 0.08, 0.21, 0, 0.06, -0.5, h1); b.box(0.36, 0.05, 0.24, 0, -0.1, -0.5, l1);
      b.box(0.06, 0.06, 0.06, -0.18, -0.03, -0.46, 0x96804f); break;
    }
    case 'build_wire': {     // a small coil + stakes
      const w = 0x9aa0a6, wd = 0x533d22;
      _strut(b, [-0.16, -0.12, -0.5], [-0.16, 0.12, -0.5], 0.04, wd); _strut(b, [0.16, -0.12, -0.5], [0.16, 0.12, -0.5], 0.04, wd);
      for (let i = 0; i < 6; i++) { const x = -0.16 + i * 0.066; _strut(b, [x, 0.0, -0.53], [x + 0.04, -0.04, -0.46], 0.014, w); } break;
    }
    case 'build_wood': {     // a couple of planks held
      const m = 0x7a5530, h = 0x9a7038;
      b.box(0.42, 0.1, 0.05, 0, 0.07, -0.5, m, { tint: 0.05 }); b.box(0.42, 0.1, 0.05, 0, -0.05, -0.5, h, { tint: 0.05 });
      b.box(0.05, 0.05, 0.05, -0.19, 0.01, -0.46, 0x2a2c30); break;
    }
    default:        b.box(0.12, 0.16, 0.6, 0, 0, -0.3, c, { tint: 0.04 }); b.box(0.1, 0.26, 0.14, 0, -0.2, 0.04, dark);
  }
  const geom = b.build();
  if (def.shape === 'binoculars') geom.rotateY(Math.PI);   // eyepieces face the player in POV (you look INTO them, not the objectives)
  // Binoculars have open revolved tubes (eyecups, focus rings) — render double-sided so the inner
  // walls draw and you never see THROUGH them into the void (depthTest is off, so a culled back face = a hole).
  const m = new THREE.Mesh(geom, voxelMaterial({ side: THREE.DoubleSide })); // depthTest on (2-pass) + DoubleSide => correct self-occlusion, no see-through through open tubes
  m.renderOrder = 1000; m.frustumCulled = false;
  return m;
}

// Separate, spinnable magazine mesh (built centred at origin so it rotates cleanly).
function buildMag(cfg) {
  const b = new MeshBuilder();
  const dark = 0x444a52, edge = 0x5a616b, hubC = 0x6d747d;
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
  const m = new THREE.Mesh(b.build(), voxelMaterial({}));
  m.renderOrder = 1001; m.frustumCulled = false;
  return m;
}

// ---------------------------------------------------------------------------
// WeaponSystem — ownership, rarity, ammo, firing (guns + melee), ADS, grenades.
// ---------------------------------------------------------------------------
class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.owned = {}; this.mag = {}; this.reserve = {}; this.magMax = {}; this.semi = {};
    this.loadout = { primary: null, secondary: null, melee: 'knife', gadget1: null, gadget2: null }; this.slotOrder = ['primary', 'secondary', 'melee', 'gadget1', 'gadget2'];
    this.cur = 'luger';
    this.cooldown = 0; this.reloading = 0; this.bloom = 0; this.recoilKick = 0; this.recoilPitch = 0;
    this.grenades = 2; this.grenadeCD = 0; this.ads = false; this.fov = 80;
    this.molotovs = 0; this.molotovCD = 0;
    this.molotovState = null; this.molotovLightT = 0; this.molotovFuseT = 0; // null|'lighting'|'lit'
    this._bobT = 0; this._swing = 0;
    this.projectiles = [];
    this._tmp = new THREE.Vector3(); this._tmp2 = new THREE.Vector3();

    this.group = new THREE.Group();
    this.models = {};
    for (const k of WEAPON_ORDER) { const m = buildViewmodel(WEAPONS[k]); m.visible = false; this.group.add(m); this.models[k] = m; }
    // --- molotov held viewmodel (NOT in this.models / WEAPON_ORDER, so select()/cycle() never touch it) ---
    { const mb = new MeshBuilder();
      let mg = new THREE.CylinderGeometry(0.06, 0.07, 0.26, 14); mb.geo(mg, 0, 0, 0, 0x2f6b3a, { tint: 0.03 }); mg.dispose();   // green glass body
      mg = new THREE.CylinderGeometry(0.062, 0.062, 0.03, 14); mb.geo(mg, 0, 0.12, 0, 0x57a06a); mg.dispose();                 // lit shoulder
      mg = new THREE.CylinderGeometry(0.03, 0.045, 0.09, 12); mb.geo(mg, 0, 0.18, 0, 0x2a5f34); mg.dispose();                  // neck
      mb.box(0.035, 0.08, 0.035, 0, 0.25, 0, 0xcdb98a);                                                                        // cloth rag
      this.molotovModel = new THREE.Mesh(mb.build(), voxelMaterial({}));
      this.molotovModel.renderOrder = 1000; this.molotovModel.frustumCulled = false; this.molotovModel.visible = false;
      this.molotovModel.position.set(0.1, -0.16, -0.5); this.molotovModel.rotation.set(0.2, 0.3, -0.15);
      this.molotovRagFlame = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffb24a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false }));
      this.molotovRagFlame.position.set(0, 0.3, 0); this.molotovRagFlame.scale.setScalar(0); this.molotovRagFlame.renderOrder = 1001;
      this.molotovModel.add(this.molotovRagFlame);
      this.group.add(this.molotovModel); }
    this.magMeshes = {}; // separate spinning magazines (DP-28 pan, PPSh drum)
    for (const k of WEAPON_ORDER) { const sm = WEAPONS[k].spinMag; if (!sm) continue; const mm = buildMag(sm); mm.position.set(sm.x, sm.y, sm.z); mm.visible = false; mm._targetRot = 0; this.group.add(mm); this.magMeshes[k] = mm; }
    // Render the whole held viewmodel in the engine's 2nd (weapon) pass — tag every mesh onto WEAPON_LAYER.
    this.group.traverse(o => { if (o.isMesh) o.layers.set(WEAPON_LAYER); });
    this.basePos = new THREE.Vector3(0.3, -0.27, -0.72);
    this.group.position.copy(this.basePos);
    game.engine.camera.add(this.group);
    // Children of the camera only render if the camera is part of the scene graph.
    game.engine.scene.add(game.engine.camera);

    this.resetLoadout();
  }

  resetLoadout() {
    // clear any in-flight grenades and all transient state (survives restarts otherwise)
    for (const g of this.projectiles) { this.game.engine.scene.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose(); if (g.flame) { g.flame.geometry.dispose(); g.flame.material.dispose(); } }
    this.projectiles.length = 0;
    this.reloading = 0; this.cooldown = 0; this.grenadeCD = 0; this._swing = 0; this._bobT = 0;
    this.bloom = 0; this.recoilKick = 0; this.recoilPitch = 0; this.ads = false;
    this.fov = (this.game.settings && this.game.settings.data.fov) || 80;
    this.game.engine.setFov(this.fov);
    for (const k of WEAPON_ORDER) { this.owned[k] = false; this.mag[k] = 0; this.reserve[k] = 0; this.semi[k] = false; }
    this.buildMats = { sandbag: 0, wire: 0, wood: 0 }; // fortification material (per-player; from supply drops)
    // deploy the player's saved loadout (knife-only by default; gadgets deploy EMPTY — charge/material scavenged in-run)
    const lo = (this.game.meta && this.game.meta.loadout) || { primary: null, secondary: null, melee: 'knife', gadget1: null, gadget2: null };
    this.loadout = { primary: lo.primary || null, secondary: lo.secondary || null, melee: lo.melee || 'knife', gadget1: lo.gadget1 || null, gadget2: lo.gadget2 || null };
    this.grenades = 0; this.flares = 0; this.flashlightOwned = false;
    for (const slot of ['primary', 'secondary', 'melee']) { const k = this.loadout[slot]; if (k && WEAPONS[k]) this.grant(k); }
    this._deployGadget(this.loadout.gadget1);
    this._deployGadget(this.loadout.gadget2);
    if (!this.owned[this.loadout.melee]) { this.loadout.melee = 'knife'; this.grant('knife'); } // a run always has a melee
    this.cur = this.loadout.primary || this.loadout.secondary || this.loadout.melee || 'knife';
    if (!this.owned[this.cur]) this.cur = 'knife';
    this.molotovs = 0; this.molotovCD = 0; this.molotovState = null; this.molotovLightT = 0; this.molotovFuseT = 0;
    if (this.molotovModel) { this.molotovModel.visible = false; this.molotovRagFlame.scale.setScalar(0); }
    this._grenadeArmed = false; this._throwSlot = null;
    for (const k in this.models) this.models[k].visible = false;
    for (const k in this.magMeshes) this.magMeshes[k].visible = false;
    // Populate the ONE flat inventory with the deployed gear (weapons/tools) + throwable start-stock, and hold the first slot.
    if (this.game.inventory) this.game.inventory.deployLoadout();
  }

  ownedOrder() { return WEAPON_ORDER.filter((k) => this.owned[k]); }
  def() { return WEAPONS[this.cur]; }
  effMult(key) { return this.game.player.damageMult; } // flat stats — rarity removed

  grant(key) {
    const d = WEAPONS[key];
    this.owned[key] = true;
    if (!d.melee && d.class !== 'builder' && d.class !== 'tool') {
      this.magMax[key] = d.mag;                                   // flat — no rarity scaling
      this.mag[key] = d.mag;
      this.reserve[key] = d.reserveMax === Infinity ? Infinity : d.reserveMax;
    }
    if (this.game.hud) this.game.hud.setWeapon(this);
  }
  // Equip a gadget into the gadget slot. Tools (flashlight/binoculars) become usable; molotov/grenade/builders
  // deploy EMPTY (their counts/material stay 0 — the player scavenges charge in-run).
  _deployGadget(g) {
    if (!g) return;
    const d = WEAPONS[g];
    if (d && d.class === 'tool') { this.owned[g] = true; if (g === 'flashlight') this.flashlightOwned = true; }
  }

  isThrowLocked() { return this.molotovState === 'lit' || this.molotovState === 'lighting' || !!this._grenadeArmed; }
  select(key) {
    if (this.isThrowLocked()) return;
    if (!this.owned[key] || key === this.cur) return;
    this.reloading = 0; // switching weapons (incl. auto-equip of loot/shop buys) cancels an in-progress reload
    this.models[this.cur].visible = false; if (this.magMeshes[this.cur]) this.magMeshes[this.cur].visible = false;
    this.cur = key;
    this.models[key].visible = true; if (this.magMeshes[key]) this.magMeshes[key].visible = true;
    this.cooldown = 0.1; this.bloom = 0;
    this.game.hud.setWeapon(this); this.game.audio.reloadClick();
  }
  // weapon switching maps to the typed loadout slots (1=Primary 2=Secondary 3=Melee 4=Gadget)
  selectSlot(n) { const k = this.loadout[this.slotOrder[n - 1]]; if (k && this.owned[k]) this.select(k); }
  quickMelee() { const k = this.loadout.melee; if (k && this.game.inventory) this.game.inventory.selectKind(k); else if (k && this.owned[k]) this.select(k); }
  cycle(dir) { this.game.inventory.cycleWheel(dir); } // the wheel scrolls the unified inventory (loadout weapons + backpack)
  // Fortification material — granted by supply drops; a builder becomes selectable only while it has material.
  grantBuildMats(amt) {
    // Fortification material is now carried as inventory items (1 item = 1 placement), not a counter.
    const inv = this.game.inventory;
    for (const k in amt) { for (let n = 0; n < (amt[k] || 0); n++) { if (inv) inv.addToBackpack(k, 1); } }
    if (this.game.hud) this.game.hud.setWeapon(this);
  }
  consumeBuildMat(kind) {
    if (this.buildMats[kind] == null) return;
    this.buildMats[kind] = Math.max(0, this.buildMats[kind] - 1);
    if (this.buildMats[kind] <= 0) {
      this.owned['build_' + kind] = false;
      if (this.cur === 'build_' + kind) { const o = this.ownedOrder(); const g = o.find((k) => WEAPONS[k].class !== 'builder') || o[0]; if (g) this.select(g); } // ran out → back to a gun
    }
    if (this.game.hud) { this.game.hud.setBuildMats(this); this.game.hud.setWeapon(this); }
  }
  toggleFireMode() {
    if (this.isThrowLocked()) return;
    const d = this.def();
    if (d.melee || !d.auto) { this.game.audio.dryFire(); return; } // only select-fire weapons toggle
    this.semi[this.cur] = !this.semi[this.cur];
    this.game.audio.reloadClick(); this.game.hud.setWeapon(this);
  }

  startReload() {
    if (this.isThrowLocked()) return;
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
    if (this.isThrowLocked()) return;
    const d = this.def();
    if (d.class === 'tool' || d.class === 'builder') return; // held tools don't fire (flashlight; builders place via build.place)
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
    for (const s of this.game.build.structures) {                                  // melee also smashes fortifications
      const sx = s.pos.x - origin.x, sz = s.pos.z - origin.z, sd = Math.hypot(sx, sz);
      if (sd > d.range + 1.2) continue;                                            // slack: structures are wide
      if ((sx / (sd || 1)) * fwd.x + (sz / (sd || 1)) * fwd.z < d.arcCos) continue;
      hitAny = true; this.game.build.playerDamage(s, d.dmg * mult);
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
        if (wHit.box && wHit.box.struct && wHit.box._ref) { this.game.build.playerDamage(wHit.box._ref, d.dmg * mult); this.game.hud.hitmarker(false); } // shoot down fortifications
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
    // the throw count is the backpack slot the Inventory consumes — this just spawns the projectile
    if (this.grenadeCD > 0) return;
    this.grenadeCD = 0.6;
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const origin = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshLambertMaterial({ color: 0x3c5a32 }));
    mesh.castShadow = true; mesh.position.copy(origin).addScaledVector(fwd, 0.8);
    this.game.engine.scene.add(mesh);
    this.projectiles.push({ mesh, vel: fwd.clone().multiplyScalar(20).add(new THREE.Vector3(0, 3, 0)), fuse: 1.6, radius: 7, dmg: 220 });
    this.game.audio.uiClick();
  }

  // (armMolotov + _unarmVisual removed — molotov is a held backpack item; Inventory._armThrowable drives the ignite)
  cancelMolotov() {
    if (!this.molotovState) return; // safely un-commit when leaving 'playing' (shop/pause): keep the molotov, no self-damage
    this.molotovState = null; this.molotovLightT = 0; this.molotovFuseT = 0;
    this.molotovModel.visible = false; this.molotovRagFlame.scale.setScalar(0);
    if (this.game.inventory) this.game.inventory._reshowAfterThrow();
    this.game.hud.setWeapon(this);
  }
  throwMolotov() {
    if (this.molotovState !== 'lit') return;
    this.molotovCD = MOLO_THROW_CD; this.molotovState = null; this.molotovModel.visible = false; this.molotovRagFlame.scale.setScalar(0); this.game.hud.setWeapon(this);
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const origin = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const clear = this.game.world.rayHit(origin, fwd, 0.8 + MOLO_PROJ_R); // wall within the spawn offset → shatter on it, don't spawn past it
    if (clear) {
      const hit = clear.point.clone().addScaledVector(clear.normal, OCCLUSION_INSET);
      this.game.effects.explosion(hit.clone(), 1.2); this.game.effects.firePool(hit, 1.6, 1.4);
      this.game.audio.explosion(); this.game._spawnMolotovPool(hit); this.game.audio.uiClick();
      return;
    }
    const mb = new MeshBuilder();
    let mg = new THREE.CylinderGeometry(0.06, 0.07, 0.26, 12); mb.geo(mg, 0, 0, 0, 0x2f6b3a, { tint: 0.03 }); mg.dispose();
    mb.box(0.035, 0.08, 0.035, 0, 0.17, 0, 0xcdb98a);
    const mesh = new THREE.Mesh(mb.build(), voxelMaterial());
    mesh.castShadow = true; mesh.position.copy(origin).addScaledVector(fwd, 0.8);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffb24a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    flame.position.set(0, 0.2, 0); mesh.add(flame);
    this.game.engine.scene.add(mesh);
    this.projectiles.push({ mesh, flame, molotov: true, fuse: MOLO_MAX_FLIGHT, trailT: 0,
      vel: fwd.clone().multiplyScalar(MOLO_THROW_SPEED).add(new THREE.Vector3(0, MOLO_THROW_LIFT, 0)),
      spin: new THREE.Vector3(rr(8, 14), rr(-3, 3), rr(4, 8)) });
    this.game.audio.uiClick();
  }
  _shatterInHand() {
    this.molotovState = null; this.molotovCD = 0.6; this.molotovModel.visible = false; this.molotovRagFlame.scale.setScalar(0);
    if (this.game.inventory && this._throwSlot != null) { const s = this._throwSlot; this._throwSlot = null; this.game.inventory._consumeSlot(s); }
    this.game.hud.setWeapon(this);
    this.game.player.burnT = PLAYER_BURN_DUR; this.game.player._takeSurvivalDamage(20, 1);
    this.game.effects.explosion(this.game.player.pos.clone().setY(0.5), 1.0);
    this.game.audio.explosion(); this.game.hud.toast('🔥 The bottle shattered in your hand!', 0xff5a26);
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
    if (this.molotovCD > 0) this.molotovCD -= dt;
    if (this._swing > 0) this._swing -= dt;
    if (this.reloading > 0) { this.reloading -= dt; if (this.reloading <= 0) { this.reloading = 0; this._finishReload(); } }
    this.bloom = damp(this.bloom, 0, 6, dt);
    this.recoilKick = damp(this.recoilKick, 0, 12, dt);
    this.recoilPitch = damp(this.recoilPitch, 0, 10, dt);

    // ADS / scope
    const d = this.def();
    this.ads = this.game.input.buttons[2] && !d.melee && d.class !== 'builder' && (d.class !== 'tool' || d.zoom); // binoculars (zoom tool) can ADS; flashlight can't
    const baseFov = (this.game.settings && this.game.settings.data.fov) || 80;
    const targetFov = this.ads ? (d.adsFov || 60) : baseFov;
    this.fov = damp(this.fov, targetFov, 16, dt);
    this.game.engine.setFov(this.fov);
    this.game.hud.setScope(this.ads && d.scope, d.shape === 'binoculars');

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

    // molotov ignition / committed-throw fuse
    if (this.molotovState === 'lighting') {
      this.molotovLightT += dt;
      const f = clamp(this.molotovLightT / MOLO_IGNITE_T, 0, 1);
      this.molotovRagFlame.scale.setScalar(0.2 + f * 0.9);
      if (this.molotovLightT >= MOLO_IGNITE_T) { this.molotovState = 'lit'; this.molotovFuseT = 0; }
    } else if (this.molotovState === 'lit') {
      this.molotovFuseT += dt;
      this.molotovRagFlame.scale.setScalar(1 + Math.sin(this._bobT * 4) * 0.18);
      if (this.molotovFuseT >= MOLO_HAND_FUSE) this._shatterInHand();
    }

    // grenades
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const g = this.projectiles[i];
      g.fuse -= dt;
      let boom = g.fuse <= 0;
      let shatterAt = null;
      if (g.molotov) { // arcs with gravity + spins; raycasts EVERY frame so it can't tunnel walls
        g.vel.y -= MOLO_GRAV * dt;
        const dir = this._tmp.copy(g.vel).normalize(), stepLen = g.vel.length() * dt;
        const wh = this.game.world.rayHit(g.mesh.position, dir, stepLen + MOLO_PROJ_R);
        if (wh) { shatterAt = wh.point.clone().addScaledVector(wh.normal, OCCLUSION_INSET); boom = true; }
        if (!boom) for (const e of this.game.enemies.active) { if (!e.alive) continue; const rp = g.mesh.position; if (Math.hypot(e.pos.x - rp.x, e.pos.z - rp.z) < e.radius + MOLO_PROJ_R && rp.y < e.pos.y + e.height + 0.4) { shatterAt = rp.clone(); boom = true; break; } }
        if (!boom) { g.mesh.position.addScaledVector(g.vel, dt); g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt; g.mesh.rotation.z += g.spin.z * dt; g.trailT -= dt; if (g.trailT <= 0) { g.trailT = 0.04; this.game.effects.firePool(g.mesh.position, 0.3, 0.6); } }
        else if (!shatterAt) shatterAt = g.mesh.position.clone();
      } else if (g.rocket) { // straight, fast, detonates on contact
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
        if (g.molotov) {
          const mpos = shatterAt || g.mesh.position.clone();
          this.game.effects.explosion(mpos.clone(), 1.2); this.game.effects.firePool(mpos, 1.6, 1.4);
          this.game.audio.explosion(); this.game._spawnMolotovPool(mpos);
        } else {
          this.game.effects.explosion(g.mesh.position.clone(), g.radius);
          this.game.enemies.damageInRadius(g.mesh.position, g.radius, g.dmg);
        }
        this.game.engine.scene.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose();
        if (g.flame) { g.flame.geometry.dispose(); g.flame.material.dispose(); }
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
    this.nearBox = null; this.prompt = null; this.nearPickup = null;
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
    if (WEAPONS[kind]) { const m = buildViewmodel(WEAPONS[kind]); m.position.set(0, 0, 0); m.rotation.set(0.3, 0.6, 0); m.scale.setScalar(0.5); return m; } // a dropped weapon, as a ground pickup
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
    if (kind === 'molotov') {
      // green glass bottle + tan rag wick
      const gl = 0x2f6b3a, glHi = 0x57a06a, rag = 0xcdb98a;
      let bg = new THREE.CylinderGeometry(0.09, 0.1, 0.34, 12); b.geo(bg, 0, 0, 0, gl, { tint: 0.03 }); bg.dispose();
      bg = new THREE.CylinderGeometry(0.092, 0.092, 0.04, 12); b.geo(bg, 0, 0.16, 0, glHi); bg.dispose();
      bg = new THREE.CylinderGeometry(0.04, 0.06, 0.12, 10); b.geo(bg, 0, 0.24, 0, gl); bg.dispose();
      b.box(0.05, 0.1, 0.05, 0, 0.33, 0, rag);
      return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x0a1f10, emissiveIntensity: 0.4 }));
    }
    if (kind === 'splint') {
      // wooden splint board + white bandage wraps
      const wood = 0x9a6b3a, woodHi = 0xb8854c, wrap = 0xf0ece0, wrapLo = 0xcfc9ba;
      b.box(0.07, 0.42, 0.07, 0, 0, 0, wood); b.box(0.05, 0.42, 0.02, 0, 0, 0.045, woodHi);
      b.box(0.10, 0.07, 0.10, 0, 0.10, 0, wrap); b.box(0.10, 0.07, 0.10, 0, -0.08, 0, wrap);
      b.box(0.105, 0.02, 0.105, 0, 0.10, 0, wrapLo); b.box(0.105, 0.02, 0.105, 0, -0.08, 0, wrapLo);
      return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x140d06, emissiveIntensity: 0.4 }));
    }
    if (kind === 'food') {
      // ration tin: olive can + steel lid + red label stripe
      const tin = 0x3f5a32, tinHi = 0x536f43, lid = 0x9aa0a2, label = 0xc23a2a;
      b.box(0.22, 0.26, 0.22, 0, 0, 0, tin); b.box(0.22, 0.03, 0.22, 0, 0.145, 0, lid);
      b.box(0.225, 0.07, 0.225, 0, 0, 0, label); b.box(0.20, 0.02, 0.205, 0.012, 0.06, 0, tinHi);
      return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x101808, emissiveIntensity: 0.45 }));
    }
    // armor plate
    b.box(0.3, 0.34, 0.16, 0, 0, 0, 0x4f8fe0); b.box(0.16, 0.16, 0.06, 0, 0.02, 0.1, 0x9fd0ff);
    return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x002040, emissiveIntensity: 0.5 }));
  }

  drop(pos, def) {
    const p = this.game.player;
    // keys
    if (def.boss) { p.addMoney(KEY_CASH * 3); }
    else {
      let keyChance = 0.16;
      if (def.explode || def.scale > 1.4) keyChance *= 1.5;
      if (chc(keyChance)) p.addMoney(KEY_CASH);
    }
    // health/ammo/armor
    const roll = Math.random();
    if (roll < 0.05) this._spawnPickup('medkit', pos, 35);
    else if (roll < 0.12) this._spawnPickup('ammo', pos, 1);
    else if (roll < 0.16) this._spawnPickup('armor', pos, 50);
    else if (roll < 0.185) this._spawnPickup('splint', pos, 1);
    else if (roll < 0.215) this._spawnPickup('food', pos, FOOD_RESTORE);
    else if (roll < 0.235) this._spawnPickup('molotov', pos, 1);
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
    else this.game.player.addMoney(KEY_CASH);
    this.game.hud.toast('📻 Radio dropped! (press T)', 0x6fd0e8);
  }

  // Radio call-in: a Su-24 streaks across the map and releases a parachute crate over a random spot.
  callSupplyDrop() {
    const spots = this.game.world.lootSpots.length ? this.game.world.lootSpots : this.game.world.spawns;
    const target = pick(spots).clone(); target.y = 0;
    const ALT = 38, R = 200, ang = rr(0, TAU), dx = Math.sin(ang), dz = Math.cos(ang);
    const mesh = buildSu24(); mesh.scale.setScalar(1.5); // bigger so the detail reads on the pass
    mesh.position.set(target.x - dx * R, ALT, target.z - dz * R);
    mesh.rotation.y = Math.atan2(dx, dz) + Math.PI; // model nose is -Z → add PI so the NOSE (not the tail) leads the travel direction
    this.scene.add(mesh);
    this.plane = { mesh, dir: new THREE.Vector3(dx, 0, dz), speed: 40, target, alt: ALT, travelled: 0, total: R * 3, released: false, trailT: 0 };
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
    // a REAL lit signal flare strapped to the load (replaces the old glowing orb): burning flame nub + flickering light + smoke
    const flareMesh = buildFlare();
    flareMesh.position.set(0.5, 1.28, 0.42); flareMesh.rotation.set(0.45, 0.7, 0.5); // jammed onto the crate at an angle, cap up
    grp.add(flareMesh);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd14a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    flame.position.set(0, 0.34, 0); flame.renderOrder = 998; flareMesh.add(flame);                                          // burning nub at the cap (flare local +Y)
    const flareLight = new THREE.PointLight(0xff5a26, 16, 28, 1.3); flareLight.position.set(0, 0.42, 0); flareMesh.add(flareLight); // starts hot (ignite), eased down in update
    this.drops.push({ grp, crate, chute, lines, flareMesh, flame, flameMat: flame.material, flareLight, flareLife: 20, flareSmokeT: 0, pos: pos.clone(), y: fromY, state: 'falling', sway: rr(0, TAU), opened: false });
    this.game.hud.toast('📦 Supply drop released!', 0xff8a3a);
  }

  _openDrop(d) {
    d.opened = true;
    const p = this.game.player;
    p.hp = p.maxHp; this.game.hud.setHealth(p.hp, p.maxHp);
    p.armor = p.armorMax; this.game.hud.setArmor(p.armor, p.armorMax);
    this.game.weapons.refillAll();
    // fortification material is RARE (OP item) — only ~2 pieces per drop, random across the 3 kinds
    const give = { sandbag: 0, wire: 0, wood: 0 }, ks = ['sandbag', 'wire', 'wood'];
    for (let i = 0; i < 2; i++) give[ks[Math.floor(Math.random() * 3)]]++;
    this.game.weapons.grantBuildMats(give);
    p.hunger = HUNGER_MAX; this.game.hud.setHunger(p.hunger); p._starveT = 0; // rations in the crate — top off hunger
    p.addMoney(SUPPLY_CASH); // cash bonus → banks at run end
    this.game.hud.toast(`📦 Resupply + $${SUPPLY_CASH} — full heal / armor / ammo`, 0xff8a3a);
    { const parts = []; if (give.sandbag) parts.push('🧱×' + give.sandbag); if (give.wire) parts.push('🔩×' + give.wire); if (give.wood) parts.push('🪵×' + give.wood); this.game.hud.toast(parts.join('  ') + '  🥫 food topped', 0xcdb887); }
    this.game.hud.bigMessage('SUPPLY CLAIMED', 'health, armor, ammo, food & cash topped up');
    this.game.audio.buy();
    this.game.effects.stuffing(d.pos.clone().setY(1.4), 0xffc23a, 32, 7);
    this._disposeDrop(d); const i = this.drops.indexOf(d); if (i >= 0) this.drops.splice(i, 1);
  }
  _disposeDrop(d) {
    this.scene.remove(d.grp);
    d.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }

  openNearby() {
    if (this.nearDrop) { this._openDrop(this.nearDrop); this.nearDrop = null; } // claim a landed supply drop (no key needed; map lootboxes are gone)
  }
  // E-pickup: put the nearest ground item into the backpack (no auto-walkover). Returns true if it consumed the E press.
  tryPickupNearby() {
    const pu = this.nearPickup; if (!pu) return false;
    const inv = this.game.inventory;
    if (inv.isFull()) { this.game.hud.toast('Inventory full — drop something (I)', 0xd23a2a); return true; }
    if (WEAPONS[pu.kind]) this.game.weapons.grant(pu.kind); // a dropped weapon → re-own it
    inv.addItem(pu.kind, pu.value);
    const label = WEAPONS[pu.kind] ? WEAPONS[pu.kind].name : (ITEM_DEFS[pu.kind] ? ITEM_DEFS[pu.kind].icon + ' ' + ITEM_DEFS[pu.kind].name : pu.kind);
    this.game.audio.buy(); this.game.hud.toast('Picked up ' + label, 0x7fd06a);
    this.scene.remove(pu.mesh); pu.mesh.geometry.dispose(); pu.mesh.material.dispose();
    const idx = this.pickups.indexOf(pu); if (idx >= 0) this.pickups.splice(idx, 1);
    this.nearPickup = null;
    return true;
  }
  promptPickup() { if (!this.nearPickup) return null; const k = this.nearPickup.kind; const label = WEAPONS[k] ? WEAPONS[k].name : (ITEM_DEFS[k] ? ITEM_DEFS[k].icon + ' ' + ITEM_DEFS[k].name : k); return 'Press <b>E</b> to pick up ' + label; }

  update(dt) {
    const p = this.game.player, pp = p.pos;
    // pickups — NO auto-walkover: float + despawn on life, track the NEAREST in range for E-pickup into the backpack
    this.nearPickup = null; let npd = 1.7;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pu = this.pickups[i];
      pu.t += dt * 2; pu.life -= dt;
      pu.mesh.position.y = 0.55 + Math.sin(pu.t) * 0.12; pu.mesh.rotation.y += dt * 2;
      if (pu.life <= 0) { this.scene.remove(pu.mesh); pu.mesh.geometry.dispose(); pu.mesh.material.dispose(); this.pickups.splice(i, 1); continue; }
      const d = Math.hypot(pu.mesh.position.x - pp.x, pu.mesh.position.z - pp.z);
      if (d < npd && Math.abs(pu.mesh.position.y - (pp.y + 1)) < 2.2) { npd = d; this.nearPickup = pu; }
    }
    this.nearBox = null; // map lootboxes removed; this.boxes is empty
    // supply plane fly-by + parachuting drops
    this._updatePlane(dt);
    this.nearDrop = null; let ndd = 3.6;
    for (const d of this.drops) {
      d.t = (d.t || 0) + dt;
      // burning signal flare on the load: lit + flickering + smoking while falling; burns out ~20s after it lands (then a dark stick)
      if (d.flareMesh && d.flareLife > 0) {
        if (d.state === 'landed') d.flareLife -= dt;                                    // full-bright during the descent; 20s countdown starts on the ground
        const fade = d.flareLife < 3.5 ? Math.max(0, d.flareLife / 3.5) : 1;            // gradual burn-out over the last 3.5s
        const flick = 0.82 + Math.sin(d.t * 22) * 0.12 + Math.sin(d.t * 57) * 0.05;
        d.flareLight.intensity += (9 * fade * flick - d.flareLight.intensity) * Math.min(1, dt * 6); // ease the ignite spike down, then fade
        d.flareLight.color.setHSL(0.035, 1, 0.5 + 0.05 * Math.sin(d.t * 30));
        d.flame.scale.setScalar((0.8 + Math.sin(d.t * 26) * 0.2) * (0.4 + 0.6 * fade));
        d.flameMat.opacity = 0.95 * fade;
        d.flareSmokeT -= dt;
        if (d.flareSmokeT <= 0) { d.flareSmokeT = 0.08; d.flame.getWorldPosition(_flareWP); this.game.effects.flareSmoke(_flareWP.clone().setY(_flareWP.y + 0.05), fade); }
        if (d.flareLife <= 0) { d.flareLight.intensity = 0; d.flame.visible = false; }  // burned out
      }
      if (d.state === 'falling') {
        d.y -= dt * 3.4; d.sway += dt;
        if (d.y <= 0.1) { d.y = 0.1; d.state = 'landed'; d.grp.position.set(d.pos.x, 0.1, d.pos.z); d.chute.visible = false; d.lines.visible = false; this.game.hud.toast('📦 Drop landed — go grab it!', 0xff8a3a); this.game.audio.buy(); }
        else d.grp.position.set(d.pos.x + Math.sin(d.sway) * 1.0, d.y, d.pos.z + Math.cos(d.sway * 0.8) * 1.0);
      } else {
        d.crate.material.emissiveIntensity = 0.6 + Math.sin(d.t * 4) * 0.25;
        const dd = Math.hypot(d.pos.x - pp.x, d.pos.z - pp.z);
        if (!d.opened && dd < ndd) { ndd = dd; this.nearDrop = d; }
      }
    }
    this.prompt = this.nearDrop ? 'Press <b>E</b> to grab the <b>SUPPLY DROP</b> — OP loot!' : null;
  }

  _collect(pu) {
    const p = this.game.player;
    if (pu.kind === 'radio') { p.radios = (p.radios || 0) + pu.value; this.game.hud.setRadios(p.radios); this.game.audio.buy(); this.game.hud.toast('📻 +1 Radio — press T to call a drop', 0x6fd0e8); }
    else if (pu.kind === 'medkit') { p.hp = Math.min(p.maxHp, p.hp + pu.value); this.game.hud.setHealth(p.hp, p.maxHp); this.game.audio.reloadIn(); this.game.hud.toast('+' + pu.value + ' HP', 0x7fd06a); }
    else if (pu.kind === 'ammo') { this.game.weapons.refillAll(); this.game.audio.reloadClick(); this.game.hud.toast('Ammo refilled', 0xb88a3a); }
    else if (pu.kind === 'splint') { p.splints += pu.value; this.game.hud.setSurvival(p); this.game.audio.reloadIn(); this.game.hud.toast('🩹 +' + pu.value + ' Splint (press X to apply)', 0xc9a8ff); }
    else if (pu.kind === 'food') { if (p.eatFood(pu.value)) this.game.hud.toast('🥫 +' + pu.value + ' Food', 0xdfa050); }
    else if (pu.kind === 'molotov') { this.game.weapons.molotovs += pu.value; this.game.hud.setWeapon(this.game.weapons); this.game.audio.buy(); this.game.hud.toast('🔥 +' + pu.value + ' Molotov (press N)', 0xff8a3a); }
    else { p.armor = Math.min(p.armorMax, p.armor + pu.value); this.game.hud.setArmor(p.armor, p.armorMax); this.game.audio.buy(); this.game.hud.toast('+' + pu.value + ' Armor', 0x6fa8e8); }
  }

  reset() {
    for (const pu of this.pickups) { this.scene.remove(pu.mesh); pu.mesh.geometry.dispose(); pu.mesh.material.dispose(); }
    this.pickups.length = 0;
    for (const d of this.drops) this._disposeDrop(d);
    this.drops.length = 0; this.nearDrop = null; this.nearPickup = null;
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
    this.money = 0; this.radios = 0; this.alive = true;
    this.moveSpeedMult = 1; this.damageMult = 1; this.reloadMult = 1;
    this.armorOnWave = 0;
    this.mountedGun = null;
    this.inTank = null;
    // --- survival mechanics ---
    this.legBroken = false; this._splintT = 0; this.splints = 0;
    this.hunger = HUNGER_MAX; this._starveT = 0; this._wasFrozen = false;
    this.burnT = 0; this._burnTickT = 0;
  }
  reset() {
    this.pos.set(0, 0, 30); this.vel.set(0, 0, 0); this.yaw = Math.PI; this.pitch = 0;
    this.onGround = true; this._regenT = 0; this.resetStats();
  }

  hurt(dmg, bypassArmor = 0) {
    if (!this.alive) return;
    if (this.inTank && this.inTank.shielded && this.inTank.shielded()) return; // protected by tank armor (enemy fire hits the tank instead — see captured-tank HP)
    // bypassArmor 0..1 = fraction of dmg armor cannot soak (blunt trauma). 0 = bullets, 1 = ignores armor.
    if (this.armor > 0 && bypassArmor < 1) { const take = Math.min(this.armor, dmg * (1 - bypassArmor)); this.armor -= take; dmg -= take; this.game.hud.setArmor(this.armor, this.armorMax); }
    this.hp -= dmg; this._regenT = 0;
    this.game.audio.playerHurt(); this.game.hud.damageFlash();
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.game.onPlayerDead(); }
    else this.game.hud.setHealth(this.hp, this.maxHp);
  }
  breakLeg() {
    if (this.legBroken) return;
    this.legBroken = true;
    this.game.audio.playerHurt(); this.game.hud.damageFlash();
    this.game.hud.toast('🦵 LEG BROKEN — find a splint (X)!', 0xd23a2a);
    this.game.hud.setSurvival(this);
  }
  applySplint() {
    if (this._splintT > 0) return;
    if (!this.legBroken) { this.game.hud.toast('Leg is fine.', 0x7fd06a); return; }
    if (this.splints <= 0) { this.game.hud.toast('No splint.', 0xd23a2a); this.game.audio.noMoney(); return; }
    if (this.inTank || this.mountedGun) { this.game.hud.toast('Dismount first.', 0xd23a2a); return; }
    if (!this.onGround) { this.game.hud.toast("Can't splint mid-air.", 0xd23a2a); return; }
    this.splints--; this._splintT = SPLINT_APPLY_TIME;
    this.game.audio.reloadIn(); this.game.hud.setSurvival(this);
  }
  eatFood(amount) {
    const before = this.hunger;
    this.hunger = Math.min(HUNGER_MAX, this.hunger + amount);
    if (this.hunger <= before) { this.game.hud.toast('Already full.', 0x7fd06a); return false; }
    this.game.hud.setHunger(this.hunger); this.game.audio.reloadIn(); return true;
  }
  // Survival timers — called every frame from _updatePlaying so they keep ticking on foot, on the .50 cal, or in the tank.
  survivalTick(dt) {
    const mp = this.game.mp;
    const frozen = mp.active && mp.frozen;
    if (this._wasFrozen && !frozen) { this.game.hud.setHunger(this.hunger); this.game.hud.setSurvival(this); } // refresh HUD after an MP revive/respawn
    this._wasFrozen = frozen;
    if (frozen) return;
    if (this._splintT > 0) {
      this._splintT -= dt;
      if (this._splintT <= 0) { this._splintT = 0; this.legBroken = false; this.game.hud.toast('🦵 Leg splinted — mobility restored', 0x7fd06a); this.game.hud.setSurvival(this); }
    }
    if (this.alive) {
      const h0 = this.hunger;
      this.hunger = Math.max(0, this.hunger - HUNGER_DRAIN_PER_SEC * dt);
      if (Math.floor(h0) !== Math.floor(this.hunger)) this.game.hud.setHunger(this.hunger);
      if (this.hunger <= 0) { this._starveT += dt; if (this._starveT >= STARVE_TICK_TIME) { this._starveT = 0; const starveFloor = this.maxHp * 0.5; if (this.hp > starveFloor) this._takeSurvivalDamage(Math.min(STARVE_TICK_DMG, this.hp - starveFloor), 1); } }
      else this._starveT = 0;
    }
    if (this.hp < this.maxHp && this.hunger > HUNGER_LOW) { this._regenT += dt; if (this._regenT > 4) { this.hp = Math.min(this.maxHp, this.hp + 12 * dt); this.game.hud.setHealth(this.hp, this.maxHp); } }
    // --- on fire (burnT set by molotov pools / in-hand shatter) ---
    if (this.burnT > 0) {
      this.burnT -= dt; this._burnTickT += dt;
      if (!mp.active && this._burnTickT >= PLAYER_BURN_TICK) { this._burnTickT = 0; this.hurt(PLAYER_BURN_DPS * PLAYER_BURN_TICK, 1); }
    } else this._burnTickT = 0;
    this.game.hud.setBurn(this.burnT);
  }
  // Fall/starvation damage — host-authoritative in MP (the armor-bypass nuance only applies in single-player).
  _takeSurvivalDamage(dmg, bypassArmor = 0) {
    const mp = this.game.mp;
    if (mp.active) this.game.mp.claimPlayerHit(mp.myId, dmg);
    else this.hurt(dmg, bypassArmor);
  }
  addMoney(n) { this.money += Math.round(n); this.game.hud.setMoney(this.money); }
  spend(n) { if (this.money >= n) { this.money -= n; this.game.hud.setMoney(this.money); return true; } return false; }

  update(dt) {
    const input = this.game.input;
    this.yaw -= input.mouseDX * this.sens;
    this.pitch -= input.mouseDY * this.sens; this.pitch = clamp(this.pitch, -1.45, 1.45);

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const sprint = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && !this.legBroken && this._splintT <= 0;
    let survMult = 1;
    if (this.legBroken) survMult *= LIMP_SPEED_MULT;
    if (this.hunger < HUNGER_LOW) survMult *= HUNGER_LOW_SPEED_MULT;
    if (this._splintT > 0) survMult = 0; // immobile while binding the splint
    const speed = (sprint ? 7.6 : 5.2) * this.moveSpeedMult * survMult;
    const wish = new THREE.Vector3().addScaledVector(fwd, input.forward).addScaledVector(right, input.strafe);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(speed);
    const accel = this.onGround ? 6 : 1.2;
    this.vel.x = damp(this.vel.x, wish.x, accel, dt);
    this.vel.z = damp(this.vel.z, wish.z, accel, dt);

    if (this.onGround && input.wasPressed('Space') && !this.legBroken && this._splintT <= 0) { this.vel.y = 7.2; this.onGround = false; this.game.audio.jump(); }
    this.vel.y -= 22 * dt; this._fallVel = this.vel.y;
    const wasAir = !this.onGround;
    this.onGround = this.game.world.collide(this.pos, this.vel, this.radius, this.height, dt);
    if (this.onGround && wasAir && this._fallVel < -6) this.game.audio.land(this._fallVel < -12);
    if (this.onGround && wasAir && this._fallVel < FALL_SAFE) {
      let dmg = ((-this._fallVel) - (-FALL_SAFE)) * FALL_DMG_PER_VY; // HP per m/s beyond the safe threshold
      if (this._fallVel <= FALL_LETHAL) dmg += FALL_DMG_BONUS_AT_LETHAL;
      if (this._fallVel <= LEG_BREAK_VY && !this.legBroken) this.breakLeg();
      this._takeSurvivalDamage(dmg, FALL_ARMOR_BYPASS); // blunt trauma; host-authoritative in MP
    }

    const horiz = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && horiz > 1.5) { this._footT -= dt; if (this._footT <= 0) { this._footT = sprint ? 0.3 : 0.42; this.game.audio.footstep(); } }
    else this._footT = 0;

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
const WAVE_ADVANCE_SECS = 25, WAVE_BREATHER = 4; // continuous waves: timed-advance countdown (survivors carry over) + post-clear breather
const WAVE_TYPES = {
  normal:   { label: 'WAVE',     sub: 'they come for the stuffing',      countMul: 1.0,  cap: 24, base: { grunt: 30, runner: 22, swarmer: 16, brute: 9, exploder: 8, charger: 6 } },
  horde:    { label: 'HORDE',    sub: 'a tidal wave of plush',           countMul: 1.7,  cap: 34, speedMul: 1.05, base: { swarmer: 52, runner: 34, grunt: 14 } },
  stampede: { label: 'STAMPEDE', sub: 'runners & boomers — keep moving', countMul: 1.15, cap: 28, speedMul: 1.1,  base: { runner: 48, charger: 30, swarmer: 22 } },
  volatile: { label: 'VOLATILE', sub: 'careful — everything pops',        countMul: 1.0,  cap: 22, base: { exploder: 54, charger: 30, grunt: 16 } },
  elite:    { label: 'ELITE',    sub: 'fewer of them, but they are tanks', countMul: 0.62, cap: 18, hpMul: 1.15, base: { brute: 46, titan: 24, grunt: 30 } },
};
// (Wave modifiers removed — no frenzy / tough-hide / swarm / glass / payday mutators.)
const MINIBOSS_NAMES = ['Stitchjaw', 'Mauler', 'Hugo', 'Ragnar', 'Bramble', 'Gloomgut'];

const BOSS_ROSTER = ['boss', 'tank']; // 'boss' = Tolo, 'tank' = T-90M «MITRI»

class WaveManager {
  constructor(game) { this.game = game; this.wave = 0; this.active = false; }
  reset() { this.wave = 0; this.active = false; this.toSpawn = 0; this.minibossPending = false; if (this.game.hud) this.game.hud.clearWaveTag(); }
  startWave(n) {
    this.bossPick = null;
    if (this.game.mode === 'longnight') return this._startLongNight(n);
    if (this.game.mp.active && this.game.mp.isHost) { this.game.mp.respawnAll(); this.game.mp.net.send('wave', { n, label: 'WAVE ' + n, sub: 'co-op — hold the line' }); }
    this.wave = n; this.active = true; this.spawned = 0;
    this.isBossWave = (n % 5 === 0);
    if (this.isBossWave) this.bossPick = BOSS_ROSTER[(Math.random() * BOSS_ROSTER.length) | 0];
    if (this._forceBoss) { this.isBossWave = true; this.bossPick = this._forceBoss; this._forceBoss = null; }
    // pick a wave archetype (specials only from wave 3)
    let typeKey = 'normal';
    if (!this.isBossWave && n >= 3 && chc(0.5)) typeKey = pick(['horde', 'stampede', 'volatile', 'elite']);
    this.typeKey = typeKey; const t = WAVE_TYPES[typeKey];
    this.minibossPending = (!this.isBossWave && n >= 3 && n % 5 === 3); // waves 3, 8, 13, …
    this.speedMul = (t.speedMul || 1);
    this.hpMul = (t.hpMul || 1);
    this.cap = (t.cap || 24) + this.game.enemies.aliveCount; // +carried-over survivors so new spawns aren't starved
    this.total = this.isBossWave ? Math.round(6 + n * 1.4) : Math.round((5 + n * 2.3) * (t.countMul || 1));
    this.toSpawn = this.total; this.spawnTimer = 0.5; this.advanceTimer = null;
    this.weights = this._effectiveWeights(typeKey, n);
    if (this.game.player.armorOnWave > 0) { this.game.player.armor = Math.max(this.game.player.armor, Math.min(this.game.player.armorMax, this.game.player.armorOnWave)); this.game.hud.setArmor(this.game.player.armor, this.game.player.armorMax); }
    this.game.hud.setWave(n);
    // banner + persistent tag
    const title = this.isBossWave ? `WAVE ${n}` : `${t.label} ${n}`;
    let sub = this.isBossWave ? (this.bossPick === 'tank' ? 'T-90M «MITRI» ROLLS IN' : 'BOSS TOLO APPROACHES') : t.sub;
    this.game.hud.bigMessage(title, sub);
    const tags = [];
    if (this.isBossWave) tags.push({ t: '☠ BOSS' });
    else if (typeKey !== 'normal') tags.push({ t: t.label });
    if (this.minibossPending) tags.push({ t: '☠ Mini-boss' });
    this.game.hud.setWaveTag(tags);
    this.game.audio.waveStart();
  }
  // THE LONG NIGHT: endless escalation, boss every 5th wave, blood-moon swell.
  _startLongNight(n) {
    this.bossPick = null;
    this.wave = n; this.active = true; this.spawned = 0;
    this.isBossWave = (n % 5 === 0); this.minibossPending = false; this.typeKey = 'normal';
    if (this.isBossWave) this.bossPick = BOSS_ROSTER[(Math.random() * BOSS_ROSTER.length) | 0];
    if (this._forceBoss) { this.isBossWave = true; this.bossPick = this._forceBoss; this._forceBoss = null; }
    const blood = this.game.dayNight && this.game.dayNight.bloodMoon;
    this.speedMul = 1 + Math.min(n * 0.012, 0.45);
    this.hpMul = (1 + (n - 1) * 0.06) * (blood ? 1.2 : 1);
    this.cap = Math.min(60, 26 + Math.floor(n * 1.6)) + this.game.enemies.aliveCount; // +carried-over survivors
    this.total = this.isBossWave ? Math.round(8 + n * 1.6) : Math.round((8 + n * 3.0) * (blood ? 1.3 : 1));
    this.toSpawn = this.total; this.spawnTimer = 0.5; this.advanceTimer = null;
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
    } else this._advanceCheck(dt);
  }
  // Wave fully spawned: clear when all dead; otherwise after ~25s start the next wave with survivors
  // CARRIED OVER (never despawned). A live boss pauses the countdown — bosses must be killed.
  _advanceCheck(dt) {
    if (this.game.enemies.aliveCount === 0) { this.active = false; this.game.hud.clearWaveTag(); this.game.onWaveCleared(this.wave); return; }
    const bossAlive = this.game.enemies.active.some((e) => e.alive && e.def.boss);
    if (bossAlive) { this.advanceTimer = null; return; }
    if (this.advanceTimer == null) this.advanceTimer = WAVE_ADVANCE_SECS;
    this.advanceTimer -= dt;
    if (this.advanceTimer <= 0) { this.active = false; this.game.onTimedAdvance(this.wave); }
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
    } else this._advanceCheck(dt);
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
// (SHOP_ITEMS removed — the lobby Shop/Armory replaces the between-wave shop; consumables are scavenged in-run.)

// Typed loadout slots + the gadget catalogue (molotov/grenade are virtual; tools/builders live in WEAPONS).
const ARMORY_SLOTS = [
  { id: 'primary',   label: 'Primary',   classes: ['rifle', 'smg', 'shotgun', 'sniper', 'launcher'] },
  { id: 'secondary', label: 'Secondary', classes: ['pistol'] },
  { id: 'melee',     label: 'Melee',     classes: ['melee'] },
  { id: 'gadget1',   label: 'Gadget 1',  classes: null },
  { id: 'gadget2',   label: 'Gadget 2',  classes: null },
];
const GADGETS = [
  { key: 'grenade',    name: 'Frag Grenades', price: 400, desc: 'Hold in hand · hold LMB to cook, release to throw. Deploy with 2; scavenge more.' },
  { key: 'molotov',    name: 'Molotov',       price: 350, desc: 'Hold in hand · hold LMB to light, then throw a fire pool. Deploy with 1; scavenge more.' },
  { key: 'flashlight', name: 'Flashlight',    price: 600, desc: 'Hold it out — the beam lights the dark while held.' },
  { key: 'binoculars', name: 'Binoculars 8×', price: 450, desc: 'Hold RMB to glass the horizon at 8×.' },
];

// The lobby/menu ARMORY: spend the persistent bank to permanently unlock gear, then build the 4-slot loadout.
// (Class kept named "Shop" so existing `this.shop` references stay valid.)
class Shop {
  constructor(game) {
    this.game = game;
    this.grid = document.getElementById('shopGrid');
    this.tabsEl = document.getElementById('shopTabs');
    this.bankEl = document.getElementById('bankAmt');
    this.stripEl = document.getElementById('loadoutStrip');
    this.tab = 'primary';
    this.returnTo = 'menu';
    this._buildTabs();
  }
  _buildTabs() {
    this.tabsEl.innerHTML = '';
    for (const s of ARMORY_SLOTS) {
      const t = document.createElement('div'); t.className = 'tab' + (s.id === this.tab ? ' on' : ''); t.dataset.tab = s.id; t.textContent = s.label;
      t.addEventListener('click', () => { this.tab = s.id; this._render(); });
      t.addEventListener('mouseenter', () => this.game.audio.uiHover());
      this.tabsEl.appendChild(t);
    }
  }
  open(returnTo) {
    this.returnTo = returnTo || 'menu';
    this.game.state = 'shop';
    this._render(); this.game.ui.show('shop');
    if (this.game.preview) this.game.preview.setSize();
  }
  _meta() { return this.game.meta; }
  _slotList(slot) {
    if (slot === 'gadget1' || slot === 'gadget2') return GADGETS.map((gd) => ({ key: gd.key, name: gd.name, price: gd.price, desc: gd.desc, pk: WEAPONS[gd.key] ? gd.key : null }));
    const classes = ARMORY_SLOTS.find((s) => s.id === slot).classes;
    return WEAPON_ORDER.filter((k) => WEAPONS[k] && classes.includes(WEAPONS[k].class))
      .map((k) => ({ key: k, name: WEAPONS[k].name, price: WEAPONS[k].price || 0, desc: WEAPONS[k].class, pk: k }));
  }
  _render() {
    const g = this.game, m = this._meta();
    if (this.bankEl) this.bankEl.textContent = '$' + m.bank;
    for (const t of this.tabsEl.children) t.classList.toggle('on', t.dataset.tab === this.tab);
    this.grid.innerHTML = '';
    const slot = this.tab, list = this._slotList(slot);
    const nameEl = document.getElementById('previewName');
    const cards = [];
    const preview = (pk, el) => { if (pk && g.preview) { g.preview.show(pk); if (nameEl) nameEl.textContent = WEAPONS[pk].name; } for (const c of cards) c.classList.toggle('previewing', c === el); };
    let firstPk = null, firstEl = null;
    for (const it of list) {
      const el = this._card(it, this._meta().unlocked.includes(it.key), m.loadout[slot] === it.key, slot);
      cards.push(el);
      if (it.pk) { el.addEventListener('mouseenter', () => preview(it.pk, el)); el.addEventListener('click', () => preview(it.pk, el)); if (!firstPk) { firstPk = it.pk; firstEl = el; } }
    }
    const pw = document.getElementById('previewWrap'); if (pw) pw.style.display = firstPk ? 'block' : 'none';
    if (firstPk) preview(firstPk, firstEl);
    this._renderStrip();
  }
  _card(it, unlocked, equipped, slot) {
    const g = this.game, m = this._meta();
    const el = document.createElement('div'); el.className = 'item' + (equipped ? ' equipped' : (unlocked ? ' owned' : ''));
    const canSell = unlocked && !(slot === 'melee' && it.key === 'knife'); // the knife is free + un-sellable (always a melee)
    let costHtml, btns = '';
    if (!unlocked) {
      const afford = m.bank >= it.price;
      costHtml = '$' + it.price;
      btns = `<button class="buy" data-act="unlock" ${afford ? '' : 'disabled'}>UNLOCK</button>`;
    } else if (equipped) {
      costHtml = '✓ equipped';
      if (canSell) btns = `<button class="buy sell" data-act="sell">SELL</button>`;
    } else {
      costHtml = 'owned';
      btns = `<button class="buy" data-act="equip">EQUIP</button>` + (canSell ? ` <button class="buy sell" data-act="sell">SELL</button>` : '');
    }
    el.innerHTML = `<div class="nm">${it.name}</div><div class="ds">${it.desc || ''}</div>
      <div class="row"><span class="cost">${costHtml}</span><span class="acts">${btns}</span></div>`;
    el.querySelectorAll('.buy').forEach((btn) => {
      btn.addEventListener('mouseenter', () => g.audio.uiHover());
      btn.addEventListener('click', (e) => { e.stopPropagation(); this._action(btn.dataset.act, it, slot); });
    });
    this.grid.appendChild(el);
    return el;
  }
  _action(act, it, slot) {
    const g = this.game, m = this._meta();
    if (act === 'unlock') {
      if (m.bank < it.price) { g.audio.noMoney(); return; }
      m.bank -= it.price; if (!m.unlocked.includes(it.key)) m.unlocked.push(it.key);
      m.loadout[slot] = it.key; // auto-equip on unlock for convenience
      g.audio.buy();
    } else if (act === 'equip') {
      m.loadout[slot] = it.key; g.audio.uiClick();
    } else if (act === 'sell') {
      if (slot === 'melee' && it.key === 'knife') return;
      m.bank += Math.round((it.price || 0) * 0.6); // 60% refund
      m.unlocked = m.unlocked.filter((k) => k !== it.key);
      if (m.loadout[slot] === it.key) m.loadout[slot] = (slot === 'melee' ? 'knife' : null); // unequip (melee falls back to knife)
      g.audio.buy();
    }
    // a gadget can occupy only one of the two gadget slots — clear it from the other
    if ((slot === 'gadget1' || slot === 'gadget2') && (act === 'unlock' || act === 'equip')) {
      const other = slot === 'gadget1' ? 'gadget2' : 'gadget1';
      if (m.loadout[other] === it.key) m.loadout[other] = null;
    }
    g._saveMeta();
    this._render();
  }
  _renderStrip() {
    if (!this.stripEl) return;
    const m = this._meta();
    const nm = (k) => !k ? '— empty —' : (WEAPONS[k] ? WEAPONS[k].name : ((GADGETS.find((x) => x.key === k) || {}).name || k));
    this.stripEl.innerHTML = ARMORY_SLOTS.map((s) => `<div class="lo-slot${m.loadout[s.id] ? ' on' : ''}"><span class="lo-lbl">${s.label}</span><span class="lo-nm">${nm(m.loadout[s.id])}</span></div>`).join('');
  }
}

// ---------------------------------------------------------------------------
// Inventory — survival backpack + the unified "everything is a held item" model.
// Owns the 10-slot loot backpack and (from Phase 6) the molotov/grenade throw state.
// scrollOrder() = owned loadout weapons/tools, then non-null backpack slots — the wheel
// traverses this single list; LMB uses whatever is held.
// ---------------------------------------------------------------------------
const SLOT_CAP = 15; // ONE flat, uniform inventory — deployed gear + scavenged loot share these equal slots
class Inventory {
  constructor(game) {
    this.game = game;
    this.slots = new Array(SLOT_CAP).fill(null); // null | { kind, value } — kind is a WEAPONS key OR an ITEM_DEFS kind
    this._activeSlot = -1;     // index of the slot currently held in hand
    this._wheelIdx = 0;        // index into scrollOrder()
    this.itemModels = {};      // held viewmodels for ITEM_DEFS kinds (weapons reuse weapons.models)
    this._hotbarDirty = true; this._lastHotbarIdx = -1;
    this._buildItemModels();
  }
  reset() { this.slots.fill(null); this._activeSlot = -1; this._wheelIdx = 0; this._hideAllItemModels(); this._hotbarDirty = true; this._lastHotbarIdx = -1; }
  firstFreeSlot() { return this.slots.findIndex((s) => s === null); }
  isFull() { return this.firstFreeSlot() < 0; }
  count(kind) { return this.slots.reduce((n, s) => n + (s && s.kind === kind ? 1 : 0), 0); }
  addItem(kind, value) { const i = this.firstFreeSlot(); if (i < 0) return false; this.slots[i] = { kind, value: (value == null ? 1 : value) }; this.refreshHotbar(); return true; }
  // back-compat alias (older call sites): scavenged/granted things go into the flat inventory
  addToBackpack(kind, value) { return this.addItem(kind, value); }
  scrollOrder() { const out = []; for (let i = 0; i < this.slots.length; i++) if (this.slots[i]) out.push({ slot: i, kind: this.slots[i].kind }); return out; }
  curItem() { const o = this.scrollOrder(); return o.length ? o[Math.max(0, Math.min(this._wheelIdx, o.length - 1))] : null; }
  _curIndexInOrder() { return this.scrollOrder().findIndex((o) => o.slot === this._activeSlot); }
  heldMaterial() { const c = this.curItem(); return (c && ITEM_DEFS[c.kind] && ITEM_DEFS[c.kind].class === 'material') ? ITEM_DEFS[c.kind].build : null; }
  isHoldingFlashlight() { const c = this.curItem(); return !!(c && c.kind === 'flashlight'); }
  isThrowLocked() { return this.game.weapons.isThrowLocked(); }
  refreshHotbar() { this._hotbarDirty = true; } // flag a rebuild; update() picks it up next frame

  // deploy the meta loadout into the flat inventory at run start (called from WeaponSystem.resetLoadout after the weapons are granted)
  deployLoadout() {
    this.slots.fill(null);
    const w = this.game.weapons, lo = w.loadout;
    for (const s of ['primary', 'secondary', 'melee', 'gadget1', 'gadget2']) {
      const k = lo[s]; if (!k) continue;
      if (WEAPONS[k]) { if (w.owned[k]) this.addItem(k); }                              // weapon or tool
      else if (k === 'grenade') { this.addItem('grenade'); this.addItem('grenade'); }   // throwable start-stock
      else if (k === 'molotov') { this.addItem('molotov'); }
    }
    this._activeSlot = -1; this._wheelIdx = 0;
    const o = this.scrollOrder(); if (o.length) this._select(o[0], 0); else this._holdNothing();
    this.refreshHotbar();
  }

  update(dt) {
    const w = this.game.weapons, down = this.game.input.buttons[0];
    // throwables: molotov lit + LMB released -> throw; grenade pin pulled + released -> throw (ignite/fuse tick in WeaponSystem.update)
    if (w.molotovState === 'lit' && !down) this._throwMolotovFromSlot();
    else if (w._grenadeArmed && !down) this._throwGrenadeFromSlot();
    const hud = this.game.hud; if (!hud || !hud.refreshHotbar) return;
    const idx = this._curIndexInOrder();
    if (this._hotbarDirty || idx !== this._lastHotbarIdx) { this._hotbarDirty = false; this._lastHotbarIdx = idx; hud.refreshHotbar(this); }
  }

  // ---- selection: wheel scrolls the flat list; digit jumps to the Nth filled slot; every slot is equal ----
  _select(entry, idx) { this._wheelIdx = idx; this._activateSlot(entry.slot); }
  _activateSlot(slotIdx) {
    const entry = this.slots[slotIdx]; if (!entry) return;
    const w = this.game.weapons, kind = entry.kind;
    this._activeSlot = slotIdx;
    if (WEAPONS[kind]) {
      this._hideAllItemModels(); if (w.molotovModel) w.molotovModel.visible = false;
      if (w.owned[kind]) {
        if (kind !== w.cur) w.select(kind);
        w.cur = kind;
        for (const k in w.models) w.models[k].visible = (k === kind);
        for (const k in w.magMeshes) w.magMeshes[k].visible = (k === kind);
        if (this.game.hud) this.game.hud.setWeapon(w);
      }
    } else {
      for (const k in w.models) w.models[k].visible = false;
      for (const k in w.magMeshes) w.magMeshes[k].visible = false;
      if (w.molotovModel) w.molotovModel.visible = false;
      this._hideAllItemModels();
      const m = this.itemModels[kind]; if (m) m.visible = true;
      if (this.game.hud && this.game.hud.setHeldItem) this.game.hud.setHeldItem(ITEM_DEFS[kind], entry);
    }
  }
  _holdNothing() { const w = this.game.weapons; this._hideAllItemModels(); if (w.molotovModel) w.molotovModel.visible = false; for (const k in w.models) w.models[k].visible = false; for (const k in w.magMeshes) w.magMeshes[k].visible = false; }
  cycleWheel(dir) {
    if (this.isThrowLocked()) return;
    const order = this.scrollOrder(); if (!order.length) return;
    let i = this._curIndexInOrder(); if (i < 0) i = 0;
    i = (i + dir + order.length) % order.length;
    this._select(order[i], i);
  }
  selectSlotN(n) { const o = this.scrollOrder(); if (o[n - 1]) this._select(o[n - 1], n - 1); } // 1-5 -> jump to the Nth filled slot
  selectKind(kind) { const o = this.scrollOrder(), i = o.findIndex((e) => e.kind === kind); if (i >= 0) this._select(o[i], i); } // jump to the slot holding a given kind (quick-melee)

  // ---- LMB use, dispatched by the held thing ----
  handleLMB(edge) {
    const c = this.curItem(); if (!c) return;
    if (WEAPONS[c.kind]) { this.game.weapons.tryFire(edge); return; }   // gun/melee/tool (tools no-op in tryFire)
    const def = ITEM_DEFS[c.kind]; if (!def) return;
    if (def.class === 'consumable') { if (edge === 'press') this._useConsumable(c.kind, c.slot); }
    else if (def.class === 'material') { if (edge === 'press') this.game.build.place(); }
    else if (def.class === 'callable') { if (edge === 'press') { if (c.kind === 'radio') this._useRadio(c.slot); else this._throwFlare(c.slot); } }
    else if (def.class === 'throwable') { this._armThrowable(c.kind, c.slot, edge); }
  }
  _useConsumable(kind, slotIdx) {
    const p = this.game.player; if (!this.slots[slotIdx]) return;
    const val = this.slots[slotIdx].value; let used = true;
    if (kind === 'medkit') { if (p.hp >= p.maxHp) { this.game.hud.toast('Already at full HP', 0x7fd06a); used = false; } else { p.hp = Math.min(p.maxHp, p.hp + val); this.game.hud.setHealth(p.hp, p.maxHp); this.game.audio.reloadIn(); this.game.hud.toast('+' + val + ' HP', 0x7fd06a); } }
    else if (kind === 'food') { used = p.eatFood(val); }
    else if (kind === 'armor') { if (p.armor >= p.armorMax) { this.game.hud.toast('Armor full', 0x6fa8e8); used = false; } else { p.armor = Math.min(p.armorMax, p.armor + val); this.game.hud.setArmor(p.armor, p.armorMax); this.game.audio.buy(); this.game.hud.toast('+' + val + ' Armor', 0x6fa8e8); } }
    else if (kind === 'ammo') { this.game.weapons.refillAll(); this.game.audio.reloadClick(); this.game.hud.toast('Ammo refilled', 0xb88a3a); }
    else if (kind === 'splint') {
      if (!p.legBroken) { this.game.hud.toast('Leg is fine -- saved', 0x7fd06a); used = false; }
      else { p.splints = (p.splints || 0) + 1; const t0 = p._splintT; p.applySplint(); used = p._splintT > t0; if (!used) p.splints -= 1; }
    }
    if (used) this._consumeSlot(slotIdx);
  }
  _useRadio(slotIdx) { this.game.loot.callSupplyDrop(); this.game.audio.buy(); this.game.hud.toast('Supply drop inbound!', 0x6fd0e8); this._consumeSlot(slotIdx); }
  _throwFlare(slotIdx) { this.game.weapons.flares = (this.game.weapons.flares || 0) + 1; this.game.throwFlare(true); this._consumeSlot(slotIdx); }
  // throwables: hold LMB to arm (committed -> can't scroll away), release to throw
  _armThrowable(kind, slotIdx, edge) {
    const w = this.game.weapons;
    if (edge !== 'press' && edge !== 'hold') return;
    if (this.game.player.inTank || this.game.player.mountedGun || this.game._waveBreak > 0) return;
    if (kind === 'molotov') {
      if (w.molotovState || w.molotovCD > 0 || w.reloading > 0) return;
      w.molotovState = 'lighting'; w.molotovLightT = 0; w.molotovFuseT = 0; w._throwSlot = slotIdx;
      if (this.itemModels.molotov) this.itemModels.molotov.visible = false;
      w.molotovModel.visible = true; w.molotovRagFlame.scale.setScalar(0);
      this.game.audio.reloadIn();
    } else if (kind === 'grenade') {
      if (w._grenadeArmed || w.grenadeCD > 0) return;
      w._grenadeArmed = true; w._throwSlot = slotIdx; this.game.audio.reloadIn();
    }
  }
  _throwMolotovFromSlot() {
    const w = this.game.weapons, slot = w._throwSlot; w._throwSlot = null;
    w.throwMolotov(); // spawns the bottle/pool, clears state, hides the model
    if (slot != null) this._consumeSlot(slot);
  }
  _throwGrenadeFromSlot() {
    const w = this.game.weapons, slot = w._throwSlot; w._grenadeArmed = false; w._throwSlot = null;
    w.throwGrenade(); // spawns the grenade projectile
    if (slot != null) this._consumeSlot(slot);
  }
  _reshowAfterThrow() { if (this._activeSlot >= 0 && this.slots[this._activeSlot]) { const m = this.itemModels[this.slots[this._activeSlot].kind]; if (m) m.visible = true; } }

  // ---- consume / drop / reorder / spill ----
  consumeHeldMaterial() { if (this._activeSlot >= 0) this._consumeSlot(this._activeSlot); }
  _consumeSlot(slotIdx) {
    const wasKind = this.slots[slotIdx] ? this.slots[slotIdx].kind : null;
    this.slots[slotIdx] = null;
    if (this._activeSlot === slotIdx) {
      this._activeSlot = -1;
      const order = this.scrollOrder();
      let idx = order.findIndex((o) => o.kind === wasKind); // keep the same kind in hand if more remain
      if (idx < 0) idx = 0;
      if (order.length) this._select(order[idx], idx); else this._holdNothing();
    }
    this.refreshHotbar();
  }
  // drop ANY slot by dragging it out of the inventory UI (freedom of choice — incl. your starting gear)
  dropSlot(slotIdx) {
    const entry = this.slots[slotIdx]; if (!entry) return;
    const kind = entry.kind, pos = this.game.player.pos.clone(); pos.y = 0.55;
    if (WEAPONS[kind]) { if (kind === 'knife') { this.game.hud.toast('Can not drop your bare knife', 0xd23a2a); return; } this.game.weapons.owned[kind] = false; }
    this.game.loot._spawnPickup(kind, pos, entry.value); // re-grabbable with E (teammates too)
    if (this.game.audio.uiClick) this.game.audio.uiClick();
    this._consumeSlot(slotIdx);
  }
  moveSlot(from, to) {
    if (from === to) return;
    const a = this.slots[from]; this.slots[from] = this.slots[to]; this.slots[to] = a;
    if (this._activeSlot === from) this._activeSlot = to; else if (this._activeSlot === to) this._activeSlot = from;
    this.refreshHotbar();
  }
  // co-op: on real death spill the whole inventory onto the ground (local + broadcast so teammates can grab it with E)
  spillAll() {
    const pos = this.game.player.pos, mp = this.game.mp;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]; if (!s) continue;
      if (s.kind === 'knife') { this.slots[i] = null; continue; }
      const p = pos.clone(); p.y = 0.55; p.x += rr(-1.2, 1.2); p.z += rr(-1.2, 1.2);
      if (WEAPONS[s.kind]) this.game.weapons.owned[s.kind] = false;
      this.game.loot._spawnPickup(s.kind, p, s.value);
      if (mp && mp.active) mp.net.broadcast('droppickup', { kind: s.kind, value: s.value, x: p.x, z: p.z });
      this.slots[i] = null;
    }
    this.refreshHotbar();
  }

  // ---- held viewmodels (added to weapons.group; rendered in the WEAPON_LAYER pass like guns) ----
  _buildItemModels() {
    const loot = this.game.loot, grp = this.game.weapons.group;
    const makers = {
      medkit: () => loot._pickupMesh('medkit'), food: () => loot._pickupMesh('food'), armor: () => loot._pickupMesh('armor'),
      ammo: () => loot._pickupMesh('ammo'), splint: () => loot._pickupMesh('splint'), radio: () => loot._pickupMesh('radio'),
      molotov: () => loot._pickupMesh('molotov'), flare: () => buildFlare(), grenade: () => this._buildGrenadeModel(),
      sandbag: () => buildViewmodel({ shape: 'build_sandbag', color: 0xcdb887, accent: 0xb89a5e }),
      wire: () => buildViewmodel({ shape: 'build_wire', color: 0x8a8f98, accent: 0x5a4a32 }),
      wood: () => buildViewmodel({ shape: 'build_wood', color: 0x8a6a40, accent: 0x5a4026 }),
    };
    for (const kind in makers) {
      let obj; try { obj = makers[kind](); } catch (e) { obj = null; }
      if (!obj) continue;
      const held = this._poseHeld(obj); held.visible = false;
      held.traverse((o) => { if (o.isMesh) { o.layers.set(WEAPON_LAYER); o.frustumCulled = false; o.renderOrder = 1000; } });
      grp.add(held); this.itemModels[kind] = held;
    }
  }
  _poseHeld(obj) {
    const grp = new THREE.Group();
    const bb = new THREE.Box3().setFromObject(obj), c = new THREE.Vector3(), sz = new THREE.Vector3();
    bb.getCenter(c); bb.getSize(sz);
    obj.position.set(obj.position.x - c.x, obj.position.y - c.y, obj.position.z - c.z); // recenter around origin
    const maxd = Math.max(sz.x, sz.y, sz.z) || 1;
    grp.add(obj); grp.scale.setScalar(0.42 / maxd);
    grp.position.set(0.05, -0.12, -0.42); grp.rotation.set(0.18, 0.5, 0.05);
    return grp;
  }
  _buildGrenadeModel() {
    const b = new MeshBuilder();
    let g = new THREE.SphereGeometry(0.13, 12, 10); g.scale(1, 1.25, 1); b.geo(g, 0, 0, 0, 0x46532f, { tint: 0.05 }); g.dispose();
    g = new THREE.CylinderGeometry(0.05, 0.06, 0.06, 10); b.geo(g, 0, 0.17, 0, 0x6a7240); g.dispose();
    g = new THREE.CylinderGeometry(0.075, 0.075, 0.03, 10); b.geo(g, 0, 0.21, 0, 0x3a3a32); g.dispose();
    b.box(0.02, 0.17, 0.05, 0.07, 0.12, 0, 0x9aa07e);
    return new THREE.Mesh(b.build(), voxelMaterial({}));
  }
  _hideAllItemModels() { for (const k in this.itemModels) this.itemModels[k].visible = false; }
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
      wave: $('wave'), money: $('money'), radios: $('radios'), score: $('score'),
      msg: $('msg'), vignette: $('vignette'), hitmarker: $('hitmarker'), killfeed: $('killfeed'),
      cross: $('cross'), toast: $('toast'), interact: $('interact'), scope: $('scope'), binoview: $('binoview'),
      bossbar: $('bossbar'), bossfill: $('bossfill'), bossname: $('bossname'), bosspip: $('bosspip'), left: $('left'),
      heatbar: $('heatbar'), heatfill: $('heatfill'), heatlabel: $('heatlabel'), wavetag: $('wavetag'),
      clock: $('clock'), nightgear: $('nightgear'),
      tankhp: $('tankhp'), tankhpfill: $('tankhpfill'),
      hungerfill: $('hungerfill'), survival: $('survival'),
      firevig: $('firevig'), firepov: $('firepov'), molotov: $('molotovhud'),
      buildmats: $('buildmats'), hotbar: $('hotbar'),
    };
    this._hitT = 0; this._msgT = 0;
  }
  show(on) { this.el.hud.classList.toggle('show', on); }
  setHealth(hp, max) { const f = clamp(hp / max, 0, 1); this.el.hpfill.style.width = (f * 100) + '%'; this.el.hpnum.textContent = Math.ceil(hp); this.el.vignette.style.boxShadow = `inset 0 0 200px 40px rgba(200,30,20,${(1 - f) * 0.5})`; }
  setArmor(a, max) { this.el.armorfill.style.width = clamp(a / max, 0, 1) * 100 + '%'; }
  setHunger(h) { if (!this.el.hungerfill) return; this.el.hungerfill.style.width = clamp(h / HUNGER_MAX, 0, 1) * 100 + '%'; this.el.hungerfill.style.filter = h < HUNGER_LOW ? 'saturate(1.7) brightness(1.2)' : 'none'; }
  setSurvival(p) { if (!this.el.survival) return; let s = ''; if (p.legBroken) s += '<span class="leg">🦵 LEG BROKEN — X to splint</span> '; if (p.splints > 0) s += `<span class="spl">🩹 ×${p.splints}</span>`; this.el.survival.innerHTML = s; }
  setWeapon(w) {
    const key = w.cur, d = WEAPONS[key];
    this.el.wepname.textContent = d.name.toUpperCase();
    this.el.wepname.style.color = 'var(--gold)';
    if (d.class === 'tool') { // flashlight / binoculars: no ammo
      if (d.zoom) { this.el.wepclass.textContent = 'optics · RMB to zoom'; this.el.ammonum.innerHTML = `<span style="font-size:20px">🔭 6×</span>`; }
      else { const on = this.game.dayNight && this.game.dayNight.flashOn; this.el.wepclass.textContent = 'tool · L: toggle beam'; this.el.ammonum.innerHTML = `<span style="font-size:20px">🔦 ${on ? 'ON' : 'off'}</span>`; }
      if (this.el.molotov) this.el.molotov.innerHTML = '';
      return;
    }
    // (builder HUD branch removed — fortification material is carried as inventory items)
    const slot = w.ownedOrder().indexOf(key) + 1;
    const mode = d.melee ? '' : (d.auto ? (w.semi[key] ? ' · SEMI' : ' · AUTO') : ' · SEMI');
    this.el.wepclass.textContent = `${d.class}${slot ? ' · slot ' + slot : ''}${mode}`;
    if (d.melee) this.el.ammonum.innerHTML = `<span style="font-size:22px">MELEE</span>`;
    else { const res = w.reserve[key] === Infinity ? '∞' : w.reserve[key]; this.el.ammonum.innerHTML = `${w.mag[key]}<span class="res"> / ${res}</span>${w.reloading > 0 ? ' ⟳' : ''}`; }
    if (this.el.molotov) this.el.molotov.innerHTML = w.molotovs > 0 ? `🔥 ×${w.molotovs}` : '';
  }
  setHeldItem(def, slot) {
    if (!def) return;
    this.el.wepname.textContent = (def.name || '').toUpperCase(); this.el.wepname.style.color = 'var(--gold)';
    const hint = def.class === 'throwable' ? 'hold LMB to throw' : def.class === 'material' ? 'LMB to build' : 'LMB to use';
    this.el.wepclass.textContent = def.class + ' · ' + hint;
    this.el.ammonum.innerHTML = `<span style="font-size:22px">${def.icon}</span>`;
    if (this.el.molotov) this.el.molotov.innerHTML = '';
  }
  refreshHotbar(inv) {
    const el = this.el.hotbar; if (!el) return;
    const order = inv.scrollOrder(), sel = inv._curIndexInOrder();
    let html = '';
    for (let i = 0; i < order.length; i++) {
      const o = order[i]; let icon = '?', badge = '', cls = 'hb-slot';
      if (WEAPONS[o.kind]) {
        const d = WEAPONS[o.kind];
        icon = d.melee ? '🔪' : (d.class === 'tool' ? (d.zoom ? '🔭' : '🔦') : (d.class === 'launcher' ? '🚀' : '🔫'));
        if (!d.melee && d.class !== 'tool' && inv.game.weapons.mag[o.kind] != null) badge = String(inv.game.weapons.mag[o.kind]);
      } else { const def = ITEM_DEFS[o.kind]; icon = def ? def.icon : '?'; }
      if (i === sel) cls += ' hb-sel';
      html += `<div class="${cls}"><span class="hb-ico">${icon}</span>${badge ? `<span class="hb-badge">${badge}</span>` : ''}</div>`;
    }
    el.innerHTML = html;
  }
  openInventory(inv) { this._renderInventory(inv); const el = document.getElementById('inventory'); if (el) el.classList.add('show'); }
  closeInventory() { const el = document.getElementById('inventory'); if (el) el.classList.remove('show'); }
  _itemIcon(kind) {
    if (WEAPONS[kind]) { const d = WEAPONS[kind]; return d.melee ? '🔪' : (d.class === 'tool' ? (d.zoom ? '🔭' : '🔦') : (d.class === 'launcher' ? '🚀' : '🔫')); }
    return (ITEM_DEFS[kind] || {}).icon || '?';
  }
  _renderInventory(inv) {
    const grid = document.getElementById('inv-grid'); if (!grid) return;
    let html = '';
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      if (s) {
        const name = WEAPONS[s.kind] ? WEAPONS[s.kind].name : ((ITEM_DEFS[s.kind] || {}).name || s.kind);
        html += `<div class="inv-slot filled" draggable="true" data-slot="${i}"><div class="inv-ico">${this._itemIcon(s.kind)}</div><div class="inv-snm">${mpEscape(name)}</div></div>`;
      } else html += `<div class="inv-slot empty" data-slot="${i}"></div>`;
    }
    grid.innerHTML = html;
    const cnt = document.getElementById('inv-count'); if (cnt) cnt.textContent = inv.slots.filter(Boolean).length + '/' + inv.slots.length;
    // drag to reorder (drop onto a slot); drag OUT of the grid (drop anywhere else) to discard the item
    let dragFrom = null, handled = false;
    grid.querySelectorAll('.inv-slot').forEach((el) => {
      const idx = parseInt(el.dataset.slot, 10);
      el.addEventListener('dragover', (e) => e.preventDefault());
      el.addEventListener('drop', (e) => { e.preventDefault(); if (dragFrom != null && !isNaN(idx)) { inv.moveSlot(dragFrom, idx); handled = true; this._renderInventory(inv); } });
      if (el.classList.contains('filled')) {
        el.addEventListener('dragstart', () => { dragFrom = idx; handled = false; });
        el.addEventListener('dragend', () => { if (!handled && dragFrom != null) { inv.dropSlot(dragFrom); this._renderInventory(inv); } dragFrom = null; });
      }
    });
  }
  setMoney(m) { this.el.money.textContent = '$' + m; }
  setRadios(n) { if (this.el.radios) this.el.radios.textContent = n > 0 ? '📻 ' + n : ''; }
  setBuildMats(w) { if (!this.el.buildmats) return; const m = w.buildMats || {}; const p = []; if (m.sandbag) p.push('🧱' + m.sandbag); if (m.wire) p.push('🔩' + m.wire); if (m.wood) p.push('🪵' + m.wood); this.el.buildmats.textContent = p.join('  '); }
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
  setScope(on, binocular = false) {
    const glass = !!on && binocular;            // binoculars: twin-circle mask, no reticle
    this.el.scope.classList.toggle('show', !!on && !binocular); // rifle scope: single circle + crosshair
    if (this.el.binoview) this.el.binoview.classList.toggle('show', glass);
    if (this.el.cross) this.el.cross.style.opacity = glass ? '0' : ''; // hide the crosshair while glassing
  }
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
  setBurn(burnT) {
    if (!this.el.firevig) return;
    if (burnT <= 0) { this.el.firevig.style.boxShadow = 'inset 0 0 220px 80px rgba(255,90,20,0)'; if (this.el.firepov) this.el.firepov.classList.remove('on'); return; }
    const it = clamp(burnT / PLAYER_BURN_DUR, 0, 1), flick = 0.6 + Math.sin(performance.now() * 0.02) * 0.2;
    this.el.firevig.style.boxShadow = `inset 0 0 220px 80px rgba(255,90,20,${(0.45 * it * flick).toFixed(3)})`;
    if (this.el.firepov) this.el.firepov.classList.add('on');
  }
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
      this.dist = Math.max(size.x, size.y, size.z, 0.5) * 1.6 * (obj.userData.viewerDistMult || 1) + 0.4;
      if (typeof obj.userData.viewerSpin === 'number') this.spin = obj.userData.viewerSpin;
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
      list.push({ name: 'BOSS TOLO', sub: 'boss', make: () => new THREE.Mesh(buildTolo(), voxelMaterial()) });
      list.push({ name: 'mini Tolo', sub: 'phase-2 add', make: () => new THREE.Mesh(buildEngendro({ body: 0xede7df, name: 'mini' }, 'normal'), voxelMaterial()) });
      list.push({ name: 'Mitri (exploder)', sub: 'exploder', make: () => new THREE.Mesh(buildEngendro(ENGENDRO_COLORS[5 % ENGENDRO_COLORS.length], 'exploder'), voxelMaterial()) });
      list.push({ name: 'Boomer (charger)', sub: 'kamikaze', make: () => new THREE.Mesh(buildEngendro({ body: 0x8a2b2b, name: 'Boomer' }, 'charger'), voxelMaterial()) });
      list.push({ name: 'T-90M «MITRI»', sub: 'tank boss', make: () => buildTank('desert') });
      list.push({ name: 'T-90M (wreck)', sub: 'destroyed', make: () => buildTankWreck() });
      list.push({ name: 'T-34/76 1942', sub: 'asset-only model', make: () => buildT34Model() });
      list.push({ name: 'T-34/76 tracks', sub: 'rig part', make: () => buildT34Tracks() });
      list.push({ name: 'T-34/76 hull', sub: 'rig part', make: () => buildT34Hull() });
      list.push({ name: 'T-34/76 turret', sub: 'rig part', make: () => buildT34Turret() });
      return list;
    }
    if (this.tab === 'props') return [
      { name: 'Su-24M Fencer', sub: 'supply plane', make: () => buildSu24() },
      { name: 'Su-34 Fullback', sub: 'from-zero guide p5-42', make: () => buildSu34Model() },
      { name: 'Su-34 p5-14 forward fuselage', sub: 'Jetworks guide part', make: () => buildSu34ForwardModule() },
      { name: 'Su-34 p15-16 wing/canards', sub: 'Jetworks guide part', make: () => buildSu34WingModule() },
      { name: 'Su-34 p17-24 rear/nacelles', sub: 'Jetworks guide part', make: () => buildSu34RearModule() },
      { name: 'Su-34 p25-33 ducts/belly', sub: 'Jetworks guide part', make: () => buildSu34DuctBellyModule() },
      { name: 'Su-34 p34-40 upper/tails', sub: 'Jetworks guide part', make: () => buildSu34UpperTailExhaustModule() },
      { name: 'Su-34 p41-42 finish/photo', sub: 'guide finish pass', make: () => buildSu34FinishPhotoModule() },
      { name: 'Radio (Falcon III)', sub: 'pickup', make: () => g.loot._pickupMesh('radio') },
      { name: 'Supply crate', sub: 'air drop', make: () => this._crate() },
      { name: 'Parachute rig', sub: 'air drop', make: () => this._chuteRig() },
      { name: 'Lootbox Key', sub: 'pickup', make: () => g.loot._keyMesh() },
      { name: 'Medkit', sub: 'pickup', make: () => g.loot._pickupMesh('medkit') },
      { name: 'Ammo box', sub: 'pickup', make: () => g.loot._pickupMesh('ammo') },
      { name: 'Armor plate', sub: 'pickup', make: () => g.loot._pickupMesh('armor') },
      { name: 'Field splint', sub: 'pickup', make: () => g.loot._pickupMesh('splint') },
      { name: 'Ration tin', sub: 'pickup', make: () => g.loot._pickupMesh('food') },
      { name: 'Molotov bottle', sub: 'pickup', make: () => g.loot._pickupMesh('molotov') },
      { name: 'Flare', sub: 'thrown light', make: () => buildFlare() },
      { name: 'Sandbags', sub: 'fortification', make: () => buildSandbags() },
      { name: 'Barbed wire', sub: 'fortification', make: () => buildBarbedWire() },
      { name: 'Barricade', sub: 'fortification', make: () => buildBarricade() },
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
    this.flashOn = true; this.flash.intensity = 0; // beam preference on; only emits while the flashlight item is held
    // hold bright noon for PURGE; start LONG NIGHT at dawn
    this._apply(active ? 0.0 : 1.0, Math.PI / 2, true);
  }
  setFlashlight(on) { this.flashOn = on; this.flash.intensity = on ? 7 : 0; }
  toggleFlashlight() { if (this.game.weapons.flashlightOwned) { this.flashOn = !this.flashOn; this.game.audio.uiClick(); this.game.hud.setNightGear(this.game); this.game.hud.setWeapon(this.game.weapons); } else this.game.hud.bigMessage('NO FLASHLIGHT', 'buy one in the armory (key L)'); }

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
    // flashlight beam — a spotlight in world space, on when this player holds the flashlight (so everyone sees their cone)
    this.flashLight = new THREE.SpotLight(0xfff0d0, 0, 60, 0.62, 0.4, 0.0); this.flashTarget = new THREE.Object3D();
    this.flashLight.target = this.flashTarget; game.engine.scene.add(this.flashLight); game.engine.scene.add(this.flashTarget);
    this._hasFlash = false; this._fwd = new THREE.Vector3(); this._fe = new THREE.Euler();
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
    if (this._hasFlash && !this.down && !this.dead) { // beam from this player's flashlight, aimed where they look
      const f = this._fwd.set(0, 0, -1).applyEuler(this._fe.set(this.pitch, this.yaw, 0, 'XYZ'));
      const hx = this.pos.x, hy = this.pos.y + 1.6, hz = this.pos.z;
      this.flashLight.position.set(hx, hy, hz);
      this.flashTarget.position.set(hx + f.x * 10, hy + f.y * 10, hz + f.z * 10);
      this.flashLight.intensity = 7;
    } else this.flashLight.intensity = 0;
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
    this._hasFlash = (key === 'flashlight');
    const def = WEAPONS[key]; if (!def) return;
    const m = buildViewmodel(def); if (m.material) { m.material.depthTest = true; m.renderOrder = 0; }
    m.scale.setScalar(0.5); m.rotation.set(0, Math.PI, 0); m.position.set(0, 0, 0);
    this.gunAnchor.add(m);
  }
  dispose() {
    this.game.engine.scene.remove(this.obj);
    this.obj.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.game.engine.scene.remove(this.flashLight); this.game.engine.scene.remove(this.flashTarget);
    if (this.label) this.label.remove();
  }
}

class MP {
  constructor(game) {
    this.game = game; this.net = new Net();
    this.active = false; this.isHost = false; this.myId = null; this.name = '';
    this.remotes = new Map(); this.roster = new Map(); this.pstate = new Map(); this.ghosts = new Map();
    this.chosenSkin = 0; this._hadBoss = false; this.ready = false;
    this._xfT = 0; this._snapT = 0; this._reviveT = 0;
    this.frozen = false; this._localDown = false; this._localDead = false; this._localWaiting = false; this._spilledLoot = false;
    this.myPing = 0; this._pingT = 0; this._pstatT = 0; this._sbOpen = false;
    this._wireNet(); this._wireScoreboard();
    this._hb = setInterval(() => { if (this.active && !this.isHost && (performance.now() - (this.net.lastRecv || 0)) > 7000) this._hostGone(); }, 2000);
  }
  // ---- lobby ----
  startHost(name) {
    this.name = name || 'Host'; this.isHost = true; this.myId = 'host';
    this.roster.set('host', { name: this.name, skin: this.chosenSkin || 0, ready: true, loadout: this._myLoadoutKeys() });
    const code = makeRoomCode();
    this.net.onPeerOpen = (c) => this._lobbyMsg(`Room code: <b>${c}</b> — share it. Waiting for players…`, c);
    this.net.onError = (t) => this._lobbyMsg(t === 'unavailable-id' ? 'Code taken — retry.' : 'Network error: ' + t);
    this.net.host(code); this._renderRoster();
  }
  startJoin(code, name) {
    if (!code) { this._lobbyMsg('Enter a room code.'); return; }
    this.name = name || 'Player'; this.isHost = false; this.myId = null;
    this.net.onPeerOpen = () => this._lobbyMsg('Connecting to ' + code + '…');
    this.net.onConnect = () => { this.myId = this.net.selfId; this.net.lastRecv = performance.now(); this.net.send('hello', { name: this.name, skin: this.chosenSkin || 0, loadout: this._myLoadoutKeys() }); this._lobbyMsg('Connected! Waiting for host to start…'); };
    this.net.onError = (t) => this._lobbyMsg(t === 'peer-unavailable' ? 'No room with that code.' : 'Network error: ' + t);
    this.net.join(code.trim().toUpperCase());
  }
  leave() {
    this.ready = false;
    try { this.net.close(); } catch (e) {}
    for (const [, rp] of this.remotes) rp.dispose();
    this.remotes.clear(); this.roster.clear(); this.pstate.clear(); this.ghosts.clear();
    this.active = false; this.isHost = false; this.frozen = false;
    this.net = new Net(); this._wireNet();
  }
  _lobbyMsg(html, code) { const el = document.getElementById('mp-status'); if (el) el.innerHTML = html; if (code) { const ci = document.getElementById('mp-mycode'); if (ci) ci.textContent = code; } }
  _myLoadoutKeys() { const lo = (this.game.meta && this.game.meta.loadout) || {}; return ['primary', 'secondary', 'melee', 'gadget1', 'gadget2'].map((s) => lo[s] || null); }
  _loadoutLabel(k) { if (!k) return ''; if (WEAPONS[k]) return WEAPONS[k].name; const gd = GADGETS.find((x) => x.key === k); return gd ? gd.name : k; }
  toggleReady() { if (this.isHost) return; this.ready = !this.ready; this.net.send('ready', { val: this.ready }); this._renderRoster(); }
  _renderRoster() {
    const el = document.getElementById('mp-roster');
    if (el) {
      const rows = [...this.roster.values()].map((p) => {
        const ready = p.ready ? '<span style="color:#6fcf4f">✓ READY</span>' : '<span style="color:#e8a23a">…</span>';
        const lo = (p.loadout || []).map((k) => this._loadoutLabel(k)).filter(Boolean).join(' · ') || 'Bayonet Knife';
        return `<div class="mp-rosteritem">🌸 ${mpEscape(p.name)} ${ready}<br><small style="opacity:.65;font-weight:600">${mpEscape(lo)}</small></div>`;
      });
      el.innerHTML = rows.join('') || '<div class="mp-rosteritem">…</div>';
    }
    const allReady = [...this.roster].every(([id, p]) => id === 'host' || p.ready);
    const sb = document.getElementById('mpStartBtn');
    if (sb) { sb.style.display = (this.isHost && this.net.connected) ? 'block' : 'none'; sb.disabled = !allReady; sb.textContent = allReady ? '▶ START CO-OP' : '▶ WAITING FOR READY…'; }
    const rb = document.getElementById('mpReadyBtn');
    if (rb) { rb.style.display = (!this.isHost && this.net.connected) ? 'block' : 'none'; rb.textContent = this.ready ? '✓ READY — click to unready' : '☐ CLICK WHEN READY'; }
  }
  hostStart() {
    if (!this.isHost) return;
    const allReady = [...this.roster].every(([id, p]) => id === 'host' || p.ready);
    if (!allReady) { this._lobbyMsg('Waiting for all players to be READY…'); return; }
    this.active = true; this._initHostStates(); this.net.send('start', { mode: this.game.mode || 'purge' }); this.game._enterMP('purge');
  }
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
      this.roster.set(from, { name: (d.name || 'Player').slice(0, 14), skin, ready: false, loadout: Array.isArray(d.loadout) ? d.loadout : [] });
      this.net.send('roster', this._rosterArr()); this._renderRoster();
      if (this.active) { this.pstate.set(from, this._freshState(this.roster.get(from))); this._sendWorldTo(from); this._broadcastPState(from); }
    });
    n.on('roster', (arr) => { this.roster.clear(); for (const p of arr) this.roster.set(p.id, { name: p.name, skin: p.skin, ready: !!p.ready, loadout: p.loadout || [] }); this._renderRoster(); this._syncRemoteObjs(); });
    n.on('ready', (d, from) => { if (!this.isHost) return; const r = this.roster.get(from); if (r) r.ready = !!d.val; this.net.send('roster', this._rosterArr()); this._renderRoster(); });
    n.on('start', (d) => { this.active = true; this.net.lastRecv = performance.now(); this.game._enterMP(d.mode || 'purge'); this._syncRemoteObjs(); });
    n.on('xf', (d) => { const rp = this._remote(d.id); if (rp) rp.setTransform(d); });
    n.on('espawn', (d) => this._clientSpawnEnemy(d));
    n.on('esnap', (arr) => this._clientSnap(arr));
    n.on('struct', (d) => g.build.applyRemoteStruct(d));                       // a structure was placed (host-authoritative)
    n.on('structreq', (d) => { if (this.isHost) g.build.hostPlaceFromClient(d); }); // client asks host to place
    n.on('structdie', (d) => g.build.applyRemoteDestroy(d.id));                // a structure was destroyed
    n.on('structhit', (d) => { if (this.isHost) { const s = g.build.structures.find((x) => x.id === d.id); if (s) g.build.attackStructure(s, d.dmg, null); } }); // client shot/meleed a structure
    n.on('edie', (d) => this._clientEnemyDie(d));
    n.on('boss', (d) => { if (d.hide) g.hud.hideBoss(); else g.hud.setBoss(d.frac, d.name); });
    n.on('wave', (d) => { g.waves.wave = d.n; g.hud.setWave(d.n); g.hud.bigMessage(d.label, d.sub); }); // continuous: clients just track the wave (no shop)
    n.on('waveclear', (d) => { if (g.state === 'playing') g.hud.bigMessage('WAVE CLEAR', 'breathe — next wave incoming'); });
    n.on('hit', (d, from) => { if (!this.isHost) return; const e = this._enemyById(d.eid); if (e && e.alive) g.enemies.damage(e, d.dmg, d.src || 'gun', null, from); });
    n.on('phit', (d, from) => { if (this.isHost) this.hostHurt(d.tid, d.dmg, from); });
    n.on('molotov', (d) => { if (this.isHost) this.game._spawnMolotovPool(new THREE.Vector3(d.x, d.y, d.z), true); });
    n.on('firepool', (d) => { if (!this.isHost) this.game._spawnMolotovPool(new THREE.Vector3(d.x, d.y, d.z), true); });
    n.on('kill', (d) => this._clientKill(d));
    n.on('burn', () => { this.game.player.burnT = PLAYER_BURN_DUR; });
    n.on('pstate', (d) => this._applyPState(d));
    n.on('revive', (d, from) => { if (this.isHost) this.hostRevive(d.tid, from); });
    n.on('ping', (d, from) => { if (this.isHost) this.net.sendTo(from, 'pong', d); });
    n.on('pong', (d) => { this.myPing = Math.round(performance.now() - d.t); });
    n.on('pstat', (d) => { const r = this.roster.get(d.id); if (r) { r.ping = d.ping; r.money = d.money; } if (this._sbOpen) this.renderScoreboard(); });
    n.on('feed', (d) => this.game.hud.kill(d.who + ' \u27a4 ' + d.what));
    n.on('gameover', () => this.game._mpGameOver());
    n.on('droppickup', (d) => { const p = this.game.player.pos.clone(); p.set(d.x, 0.55, d.z); this.game.loot._spawnPickup(d.kind, p, d.value); }); // a teammate's spilled loot → grab it with E
  }
  _rosterArr() { return [...this.roster].map(([id, p]) => ({ id, name: p.name, skin: p.skin, ready: !!p.ready, loadout: p.loadout || [] })); }
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
    const reward = Math.round(e.def.reward);
    this.net.sendTo(killerId, 'kill', { reward, name: e.name, type: e.type, x: e.pos.x, z: e.pos.z, elite: !!e.isElite, score: e.def.reward + (e.def.boss ? 1500 : 0) });
    this.feed(((this.roster.get(killerId) || {}).name) || 'Player', e.name);
  }
  _clientKill(d) {
    const g = this.game; g.kills++; g.player.addMoney(d.reward); g.score += d.score; g.hud.setScore(g.score); g.hud.kill(d.name);
    const def = ENEMY_TYPES[d.type]; if (def) g.loot.drop({ x: d.x, y: 0, z: d.z }, def);
    if (d.elite) g.player.addMoney(KEY_CASH * 2);
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
      if (d.dead) { g.hud.bigMessage('YOU ARE OUT', 'no lives left'); if (!this._spilledLoot) { this._spilledLoot = true; g.inventory.spillAll(); } } // real death → spill your backpack for teammates
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
    for (const s of this.game.build.structures) this.net.sendTo(pid, 'struct', { id: s.id, kind: s.kind, x: s.pos.x, z: s.pos.z, yaw: s.yaw }); // late-join: existing fortifications
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
    this.build = new BuildManager(this); // fortification placement (held builders, ghost preview, structures)
    this.mountedGun = new MountedGun(this, new THREE.Vector3(0, 3.4, 46), 0); // .50 cal on the bunker roof
    this.capturedTank = null; // set by _tankCaptured; cleared on reset
    this.waves = new WaveManager(this);
    this.hud = new HUD(this);
    this.inventory = new Inventory(this); // survival backpack + unified held-item model
    this.shop = new Shop(this);
    const _pc = document.getElementById('previewCanvas'); this.preview = _pc ? new WeaponPreview(_pc) : null;
    this.ui = new UI();
    const _ac = document.getElementById('adminCanvas'); this.admin = _ac ? new Admin(this) : null;
    this.settings = new Settings(this); // loads localStorage + applies sens/volume/sharpness/fov
    this.meta = this._loadMeta(); // persistent best-wave / lifetime stats
    this.dayNight = new DayNight(this); // day/night + sky + flashlight (drives THE LONG NIGHT)
    this.mp = new MP(this); // multiplayer co-op (dormant until host/join)
    this.mode = 'purge'; this.flares = []; this.molotovPools = []; this._surviveTime = 0;
    this._molTmp = new THREE.Vector3(); this._molTmp2 = new THREE.Vector3(); this._molTmp3 = new THREE.Vector3();

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
    click('armoryBtn', () => this.shop.open('menu'));
    click('lobbyArmoryBtn', () => this.shop.open('lobby'));
    click('armoryBackBtn', () => { if (this.shop.returnTo === 'lobby') this.toLobby(); else this.toMenu(); });
    click('mpHostBtn', () => this.mp.startHost((document.getElementById('mp-name') || {}).value || 'Host'));
    click('mpJoinBtn', () => this.mp.startJoin((document.getElementById('mp-code') || {}).value || '', (document.getElementById('mp-name') || {}).value || 'Player'));
    click('mpStartBtn', () => this.mp.hostStart());
    click('mpReadyBtn', () => this.mp.toggleReady());
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
      if (this.weapons.isThrowLocked() && code !== 'KeyM') return; // committed molotov: only the LMB throw (and mute) work
      if (code === 'KeyR') this.weapons.startReload();
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
        else if (this.loot.tryPickupNearby()) { /* grabbed a ground item into the backpack */ }
        else this.loot.openNearby();
      }
      else if (code === 'KeyQ') {
        // CapturedTank: switch driver ↔ gunner seat
        const _ct = this.capturedTank;
        if (_ct && this.player.inTank === _ct) { _ct.switchSeat(); return; }
      }
      else if (code === 'KeyF') this.toggleFullscreen();
      else if (code === 'KeyC') {
        // CapturedTank: gunner peek stance (flares are a held inventory item now, used with LMB)
        const _ct = this.capturedTank;
        if (_ct && this.player.inTank === _ct && _ct.active === 'gunner') { _ct.stance = _ct.stance === 'sight' ? 'peek' : 'sight'; if (_ct.stance === 'sight') { _ct.peekYaw = null; _ct.peekPitch = null; } }
      }
      else if (code === 'KeyT') {
        // CapturedTank: thermal toggle (gunner only); radio is a held inventory item now, used with LMB
        const _ct = this.capturedTank;
        if (_ct && this.player.inTank === _ct && _ct.active === 'gunner') { _ct.thermal = !_ct.thermal; }
      }
      else if (code === 'KeyB') this.weapons.toggleFireMode();
      else if (code === 'KeyI') this.toggleInventory();
      else if (code === 'KeyM') { this.audio.setMuted(!this.audio.muted); this.hud.bigMessage(this.audio.muted ? 'MUTED' : 'SOUND ON'); }
      else if (code.startsWith('Digit')) { const n = parseInt(code.slice(5), 10); if (n >= 1 && n <= 9) this.inventory.selectSlotN(n); }
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
    if (this._invOpen) { this._invOpen = false; if (this.hud) this.hud.closeInventory(); }
    this.player.reset();
    this.enemies.clearAll(); this.loot.reset();
    this.mountedGun.forceReset();
    if (this.capturedTank) { this.capturedTank.forceReset(); this.capturedTank = null; }
    this.world.clearWrecks && this.world.clearWrecks();
    this.build.reset();
    this.inventory.reset(); // clear backpack BEFORE resetLoadout (which deploys throwable start-stock into it)
    this.weapons.resetLoadout();
    this.waves.reset();
    this._clearFlares();
    if (this._clearMolotovPools) this._clearMolotovPools();
    this.dayNight.reset(this.mode === 'longnight'); // bright noon for PURGE, dawn-into-night for LONG NIGHT
    this._surviveTime = 0;
    this.score = 0; this.kills = 0;
    this.hud.setHealth(this.player.hp, this.player.maxHp);
    this.hud.setArmor(this.player.armor, this.player.armorMax);
    this.hud.setMoney(this.player.money); this.hud.setRadios(this.player.radios);
    this.hud.setBuildMats(this.weapons);
    this.hud.setHunger(this.player.hunger); this.hud.setSurvival(this.player);
    this.hud.setScore(0); this.hud.setWeapon(this.weapons);
    this.hud.setNightMode(this.mode === 'longnight'); // shows/hides the clock + gear readout
    this._startCountdown = 0.6; this._waveBreak = 0; this._banked = false; // _banked: per-run guard for bank deposit
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
  throwFlare(force) {
    if ((!force && this.mode !== 'longnight') || this.weapons.flares <= 0) return;
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
  // Line-of-sight test so molotov fire cannot reach through a wall into the next room.
  raySegBlocked(from, to) {
    const dir = this._molTmp3.copy(to).sub(from); const dist = dir.length();
    if (dist < 0.9) return false; dir.multiplyScalar(1 / dist);
    const start = from.clone().addScaledVector(dir, OCCLUSION_INSET);
    return this.world.rayHit(start, dir, dist - OCCLUSION_INSET * 2) !== null;
  }
  _spawnMolotovPool(pos, fromNet = false) {
    if (this.mp.active && !this.mp.isHost && !fromNet) { this.mp.net.send('molotov', { x: pos.x, y: pos.y, z: pos.z }); return; }
    if (!this.molotovPools) this.molotovPools = [];
    if (this.molotovPools.length >= FIRE_POOL_MAX) this._disposeMolotovPool(this.molotovPools.shift());
    this._downV = this._downV || new THREE.Vector3(0, -1, 0); // drop the burning liquid onto the floor under the impact so the fire never floats
    const gh = this.world.rayHit(new THREE.Vector3(pos.x, pos.y + 0.5, pos.z), this._downV, 200);
    const py = gh ? gh.point.y + 0.02 : 0.05;
    const light = new THREE.PointLight(0xff5a26, 7, 14, 1.4); light.position.set(pos.x, py + 0.45, pos.z); this.engine.scene.add(light);
    this.molotovPools.push({ pos: new THREE.Vector3(pos.x, py, pos.z), light, life: FIRE_POOL_LIFE, maxLife: FIRE_POOL_LIFE, radius: FIRE_POOL_RADIUS, emitT: 0, tickT: 0 });
    if (this.mp.active && this.mp.isHost) this.mp.net.send('firepool', { x: pos.x, y: pos.y, z: pos.z });
  }
  _disposeMolotovPool(p) { if (p && p.light) this.engine.scene.remove(p.light); }
  _clearMolotovPools() { if (this.molotovPools) { for (const p of this.molotovPools) this._disposeMolotovPool(p); this.molotovPools.length = 0; } }
  _updateMolotovPools(dt) {
    if (!this.molotovPools || !this.molotovPools.length) return;
    const hostSim = !this.mp.active || this.mp.isHost;
    const t = performance.now() * 0.001;
    for (let i = this.molotovPools.length - 1; i >= 0; i--) {
      const p = this.molotovPools[i];
      p.life -= dt;
      const fade = p.life < 2.0 ? Math.max(0, p.life / 2.0) : 1;
      p.emitT -= dt; if (p.emitT <= 0) { p.emitT = 0.05; this.effects.firePool(p.pos, p.radius, fade); }
      if (p.light) { const flick = 0.8 + Math.sin(t * 24 + i) * 0.15; p.light.intensity += (7 * fade * flick - p.light.intensity) * Math.min(1, dt * 6); }
      p.tickT -= dt;
      if (hostSim && p.tickT <= 0 && p.life > 0) {
        p.tickT = FIRE_BURN_TICK;
        const center = this._molTmp.set(p.pos.x, p.pos.y + 0.5, p.pos.z);
        for (const e of this.enemies.active) {
          if (!e.alive || e.isTank) continue;
          if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) > p.radius) continue;
          if (this.raySegBlocked(center, this._molTmp2.set(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z))) continue;
          e.burnT = ENEMY_BURN_DUR; this.enemies.damage(e, FIRE_DOT_ENEMY * FIRE_BURN_TICK, 'fire', e.pos.clone());
        }
        const tryBurn = (px, py, pz, id, isLocal) => {
          if (Math.hypot(px - p.pos.x, pz - p.pos.z) > p.radius) return;
          if (this.raySegBlocked(center, this._molTmp2.set(px, py + 0.9, pz))) return;
          if (this.mp.active) { this.mp.hostHurt(id, PLAYER_BURN_DPS * FIRE_BURN_TICK); if (isLocal) this.player.burnT = PLAYER_BURN_DUR; else this.mp.net.sendTo(id, 'burn', {}); }
          else this.player.burnT = PLAYER_BURN_DUR;
        };
        if (this.mp.active && this.mp.isHost) { tryBurn(this.player.pos.x, this.player.pos.y, this.player.pos.z, 'host', true); for (const [id, rp] of this.mp.remotes) tryBurn(rp.pos.x, rp.pos.y, rp.pos.z, id, false); }
        else if (!this.mp.active) tryBurn(this.player.pos.x, this.player.pos.y, this.player.pos.z, null, true);
      }
      if (p.life <= 0) { this._disposeMolotovPool(p); this.molotovPools.splice(i, 1); }
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

  // Survival inventory overlay (key I) — non-pausing: free the cursor but keep the run live (you stay vulnerable while managing).
  toggleInventory() {
    if (this._invOpen) { this._closeInventory(); return; }
    this._invOpen = true; this.hud.openInventory(this.inventory);
    this._intentionalUnlock = true; this.input.exitLock(); // free the cursor; the 'unlock' handler skips the pause
  }
  _closeInventory() { this._invOpen = false; this.hud.closeInventory(); if (this.state === 'playing') this.input.requestLock(); }
  pause() { if (this.state !== 'playing') return; if (this._invOpen) this._closeInventory(); this.weapons.cancelMolotov(); this.state = 'paused'; this.ui.show('pause'); }
  resume() {
    if (this.state !== 'paused') return;
    // Re-enter fullscreen (Esc may have dropped it) then re-grab the pointer; 'lock' handler hides the overlay once granted.
    const root = document.documentElement;
    const after = () => this.input.requestLock();
    if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().then(after, after);
    else after();
  }
  toMenu() {
    if (this.state === 'playing' || this.state === 'paused') { this._bankRunMoney(); this._saveMeta(); } // leaving a live run banks its money
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
      if (e.captured) {
        // Captured — tank itself is the prize: smaller cash, base score only
        this.player.addMoney(Math.round(e.def.reward * 0.4));
        this.score += e.def.reward; this.hud.setScore(this.score);
        this.player.addMoney(KEY_CASH);
      } else {
        // Destroyed — walked away with loot: full cash, +800 score bonus
        this.player.addMoney(e.def.reward);
        this.score += e.def.reward + 800; this.hud.setScore(this.score);
        this.player.addMoney(KEY_CASH * 3);
      }
      if (this.mp.active && this.mp.isHost) this.mp.feed(((this.mp.roster.get('host') || {}).name) || 'Host', e.name); else this.hud.kill(e.name);
      // loot.drop with boss flag cleared so it doesn't auto-spawn boss keys again
      this.loot.drop(e.pos, Object.assign({}, e.def, { boss: false }));
      return; // skip generic boss payout below — no double-pay
    }
    // --- generic path (non-tank enemies) ---
    this.player.addMoney(e.def.reward);
    this.score += e.def.reward + (e.def.boss ? 1500 : 0); this.hud.setScore(this.score);
    if (this.mp.active && this.mp.isHost) this.mp.feed(((this.mp.roster.get('host') || {}).name) || 'Host', e.name); else this.hud.kill(e.name);
    this.loot.drop(e.pos, e.def);
    if (e.isElite) this.player.addMoney(KEY_CASH * 2); // elites pay a small cash bonus
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
    if (this._invOpen) { this._invOpen = false; this.hud.closeInventory(); }
    this.state = 'dead'; this._intentionalUnlock = this.input.locked; this.input.exitLock();
    this._bankRunMoney(); this._saveMeta(); // each player banks their own run money locally
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
  // _mpOpenShop removed — co-op has continuous waves with no between-wave shop.
  _hurtTarget(id, dmg) { if (this.mp.active && this.mp.isHost) this.mp.hostHurt(id, dmg); else this.player.hurt(dmg); }
  _explodeHurt(pos, radius, dmg) {
    const hurt = (px, pz, id) => { const d = Math.hypot(px - pos.x, pz - pos.z); if (d < radius) { const dd = dmg * (1 - d / radius); if (this.mp.active && this.mp.isHost) this.mp.hostHurt(id, dd); else this.player.hurt(dd); } };
    if (this.mp.active && this.mp.isHost) { hurt(this.player.pos.x, this.player.pos.z, 'host'); for (const [id, rp] of this.mp.remotes) hurt(rp.pos.x, rp.pos.z, id); }
    else hurt(this.player.pos.x, this.player.pos.z, 'host');
  }
  onWaveCleared(n) {
    this.audio.waveClear(); this.player.addMoney(150 + n * 25);
    if (this.mp.active && this.mp.isHost) this.mp.net.send('waveclear', { n: this.waves.wave });
    this.hud.bigMessage('WAVE CLEAR', 'breathe — next wave incoming'); this._waveBreak = WAVE_BREATHER; // pure breather, auto-advances (no shop)
  }
  // Wave timed out with survivors still alive — start the next wave on top of them (no clear, no breather; they carry over).
  onTimedAdvance(n) {
    this.waves.startWave(n + 1); // startWave handles the MP 'wave' broadcast + survivors persist (it never clears enemies)
    this.hud.bigMessage('WAVE ' + (n + 1), 'survivors remain — hold!');
  }
  onPlayerDead() {
    if (this._invOpen) { this._invOpen = false; this.hud.closeInventory(); }
    this.state = 'dead'; this._intentionalUnlock = this.input.locked; this.input.exitLock();
    this._bankRunMoney(); // run money → persistent bank (the _saveMeta below persists it)
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
  _loadMeta() {
    let m; try { m = JSON.parse(localStorage.getItem('engendros_meta') || '{}'); } catch (e) { m = {}; }
    // roguelite economy (backward-compatible: missing keys default for existing players)
    if (typeof m.bank !== 'number') m.bank = 0;                                   // persistent money "account"
    if (!Array.isArray(m.unlocked)) m.unlocked = ['knife'];                       // permanently owned gear keys
    if (!m.unlocked.includes('knife')) m.unlocked.push('knife');                  // knife is always owned (cold start)
    if (!m.loadout || typeof m.loadout !== 'object') m.loadout = { primary: null, secondary: null, melee: 'knife', gadget1: null, gadget2: null };
    // migrate the old single gadget slot → two gadget slots (backward-compatible)
    if ('gadget' in m.loadout) { if (m.loadout.gadget1 == null) m.loadout.gadget1 = m.loadout.gadget; delete m.loadout.gadget; }
    if (!('gadget1' in m.loadout)) m.loadout.gadget1 = null;
    if (!('gadget2' in m.loadout)) m.loadout.gadget2 = null;
    if (!m.loadout.melee) m.loadout.melee = 'knife';                              // a run always has a melee
    // drop removed builder keys from any loadout slot
    for (const s of ['primary', 'secondary', 'melee', 'gadget1', 'gadget2']) { const k = m.loadout[s]; if (k && /^build_/.test(k)) m.loadout[s] = (s === 'melee' ? 'knife' : null); }
    return m;
  }
  _saveMeta() { try { localStorage.setItem('engendros_meta', JSON.stringify(this.meta)); } catch (e) {} }
  // Deposit this run's money into the persistent bank — once per run (guarded by _banked, reset in reset()).
  _bankRunMoney() {
    if (this._banked) return; this._banked = true;
    this.meta.bank = (this.meta.bank || 0) + Math.max(0, Math.round(this.player.money || 0));
  }
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
    if (this.state === 'shop' && this.preview) this.preview.render(dt);
    if (this.state === 'admin' && this.admin) this.admin.viewer.render(dt);
    this.input.endFrame();
  }

  _updatePlaying(dt) {
    const hostSim = !this.mp.active || this.mp.isHost; // clients don't simulate enemies/waves
    if (hostSim && this._startCountdown > 0) { this._startCountdown -= dt; if (this._startCountdown <= 0) this.waves.startWave(this.waves.wave + 1); }
    if (hostSim && this._waveBreak > 0) { this._waveBreak -= dt; if (this._waveBreak <= 0) { this._waveBreak = 0; this.waves.startWave(this.waves.wave + 1); } } // continuous: breather → next wave (no shop, stay 'playing')

    if (this.player.mountedGun) {
      this.player.mountedGun.controlUpdate(dt); // aim + fire + heat + camera handled here
    } else if (this.player.inTank) {
      this.player.inTank.controlUpdate(dt); // tank camera + controls handled here
    } else {
      if (!this.mp.frozen) {
        const edge = this.input.buttonsPressed[0] ? 'press' : (this.input.buttons[0] ? 'hold' : null);
        if (edge) this.inventory.handleLMB(edge); // LMB use, dispatched by held item class (gun/melee/consumable/material/callable/throwable)
      }
      if (this.input.wheel !== 0) { const _shift = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'); if (this.inventory.heldMaterial() && _shift) this.build.rotateGhost(this.input.wheel > 0 ? 1 : -1); else this.weapons.cycle(this.input.wheel > 0 ? 1 : -1); } // Shift+wheel rotates a held material's ghost; plain wheel scrolls the inventory
      this.player.update(dt);
      this.weapons.update(dt);
      this.inventory.update(dt); // throwable (molotov/grenade) state-machine tick
    }
    this.player.survivalTick(dt); // survival timers tick in every seat (on foot, .50 cal, tank)
    this.build.update(dt); // build ghost preview (shows only while a builder is held, on foot)
    this.dayNight.flash.intensity = (!this.player.inTank && !this.player.mountedGun && this.inventory.isHoldingFlashlight() && this.dayNight.flashOn) ? 7 : 0; // flashlight beam = the flashlight is the held item
    if (hostSim) this.enemies.update(dt);
    this.loot.update(dt);
    if (hostSim) this.waves.update(dt);
    this.mp.update(dt);
    if (this.mode === 'longnight') { this._surviveTime += dt; this.dayNight.update(dt); this._updateFlares(dt); this.hud.setClock(this.dayNight.info(), this._surviveTime); }
    this._updateMolotovPools(dt);
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
    } else if (this.player._splintT > 0) {
      this.hud.setInteract(`Applying splint… ${this.player._splintT.toFixed(1)}s`);
    } else if (this.loot.nearPickup) {
      this.hud.setInteract(this.loot.promptPickup());
    } else {
      this.hud.setInteract(this.loot.prompt);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => { if (!window.GAME) window.GAME = new Game(); });
if (document.readyState !== 'loading' && !window.GAME) window.GAME = new Game();
