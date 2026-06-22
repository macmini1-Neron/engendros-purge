// weapons.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { MeshBuilder, TAU, clamp, damp, rayAABB, rr, shade, voxelMaterial, weightedPick } from './util.js';
import { MOLO_GRAV, MOLO_HAND_FUSE, MOLO_IGNITE_T, MOLO_MAX_FLIGHT, MOLO_PROJ_R, MOLO_THROW_CD, MOLO_THROW_LIFT, MOLO_THROW_SPEED, OCCLUSION_INSET, PLAYER_BURN_DUR, SOUND_BY_CLASS } from './tuning.js';
import { _strut } from './props.js';
import { WEAPON_LAYER } from './engine.js';
import { CALIBERS, FRAGILE_MAX_TIER, MATERIALS, resolveHit } from './destruct.js';
import { isNight } from './worldclock.js';
import { makeTextPlateTexture } from './props/operators/round.js';
import { yawToMils } from './bearing.js';

// ── ?map=demo destruction wiring (Phase 9) ─────────────────────────────────────
// Map a gameplay weapon class → destruction PENETRATION class (spec §5 hardness tiers).
// A bullet only does HP damage to a part when pen ≥ material.tier; below that it's a
// cosmetic chip. glass=0/wood=1/sheetmetal=trunk=2/brick=3/concrete=4/steel=5. So pistols
// pop glass; rifles/SMGs also break the wood door & fences; nothing under HE breaches brick.
const PEN_BY_CLASS = { pistol: 0, smg: 1, rifle: 1, sniper: 2, shotgun: 1, hmg: 2, launcher: 4, cannon: 5 };
// Forced demo loadout so a tester needs no shop: an auto rifle (glass+door+enemies), the
// BAZOOKA (HE breach + fire), two MOLOTOVs (ignite trees), the debug APFSDS cannon, + a knife.
export const DEMO_LOADOUT = ['stg44', 'bazooka', 'molotov', 'molotov', 'apfsds', 'knife'];

const MOSIN_ASSET_URL = './assets/weapons/low_poly_mosin_carbine.glb';
const MOSIN_ASSET_TARGET_LENGTH = 2.78;
// Anchor the GLB by its bounding-box centre. X is kept small so the bore/sight line sits on the
// group centreline — hip-fire offset comes from WeaponSystem.basePos, and ADS (which pulls the
// group to x≈0) then lands the iron sights on the crosshair instead of off to the right.
const MOSIN_ASSET_TARGET_CENTER = new THREE.Vector3(0.032, -0.042, -0.30);
let _gltfLoader = null;

function loadGltf(url) {
  _gltfLoader = _gltfLoader || new GLTFLoader();
  return new Promise((resolve, reject) => _gltfLoader.load(url, resolve, undefined, reject));
}

function disposeObject3D(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) if (mat && typeof mat.dispose === 'function') mat.dispose();
  });
}

function prepWeaponMeshTree(root, renderOrder = 1000) {
  root.traverse((o) => {
    o.frustumCulled = false;
    o.layers.set(WEAPON_LAYER);
    if (!o.isMesh) return;
    o.renderOrder = renderOrder;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.side = THREE.DoubleSide;
      mat.needsUpdate = true;
    }
  });
}

// 7.62×54R round, built VERTICAL with the copper bullet UP (+Y) and the rim at the base (−Y), the
// same orientation as the procedural Mosin's clip rounds (the established in-game look). Uses the
// .50-cal's brass palette so the clip/cases read as real rounded brass, not voxel cubes.
function _mosinCartridge(mb, x, y, z, scale) {
  const brass = 0xcaa64a, brassHi = 0xe2c56b, brassLo = 0x8c6b2e, copper = 0xb3683a, copperHi = 0xcf9152;
  let g = new THREE.CylinderGeometry(0.0098 * scale, 0.0125 * scale, 0.082 * scale, 12); mb.geo(g, x, y, z, brass, { tint: 0.03 }); g.dispose();        // bottlenecked brass case
  g = new THREE.CylinderGeometry(0.014 * scale, 0.014 * scale, 0.011 * scale, 12); mb.geo(g, x, y - 0.046 * scale, z, brassHi, { tint: 0.02 }); g.dispose(); // rim
  g = new THREE.CylinderGeometry(0.0108 * scale, 0.0108 * scale, 0.009 * scale, 12); mb.geo(g, x, y - 0.036 * scale, z, brassLo); g.dispose();              // extractor groove
  g = new THREE.CylinderGeometry(0.0072 * scale, 0.0072 * scale, 0.046 * scale, 12); mb.geo(g, x, y + 0.064 * scale, z, copper, { tint: 0.02 }); g.dispose(); // copper bullet
  g = new THREE.CylinderGeometry(0.0009 * scale, 0.0072 * scale, 0.020 * scale, 12); mb.geo(g, x, y + 0.097 * scale, z, copperHi); g.dispose();              // pointed tip
}
function _buildMosinReloadProps() {
  const mk = (b) => { const m = new THREE.Mesh(b.build(), voxelMaterial({ side: THREE.DoubleSide })); m.frustumCulled = false; m.visible = false; return m; };
  const bclip = new MeshBuilder();
  bclip.box(0.150, 0.013, 0.026, 0, 0.016, 0, 0x9aa1aa);                  // stripper-clip spine gripping the case bodies (matches the procedural layout)
  for (let i = 0; i < 5; i++) _mosinCartridge(bclip, -0.054 + i * 0.027, -0.028, 0, 0.82);
  const bround = new MeshBuilder();
  _mosinCartridge(bround, 0, 0, 0, 0.92);
  return { clip: mk(bclip), round: mk(bround) };
}

function buildMosinAssetViewmodel(assetRoot, fallback) {
  const wrapper = new THREE.Group();
  wrapper.name = 'Mosin GLB viewmodel';
  wrapper.renderOrder = 1000;
  wrapper.frustumCulled = false;

  const box = new THREE.Box3().setFromObject(assetRoot);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const scale = MOSIN_ASSET_TARGET_LENGTH / Math.max(0.001, size.z);
  assetRoot.scale.setScalar(scale);
  assetRoot.position.copy(MOSIN_ASSET_TARGET_CENTER).addScaledVector(center, -scale);
  wrapper.add(assetRoot);

  const boltNode = assetRoot.getObjectByName('Bolt_back') || assetRoot.getObjectByName('Bolt');
  let bolt = null;
  if (boltNode) {
    // The GLB's bolt node pivots at the model origin, so rotating it swings the bolt out of the gun.
    // Pivot on the BORE AXIS instead — the symmetric rear bolt body (Bolt_back mesh) sits dead on the
    // centreline — so the lift is pure rotation about the bore: the handle sweeps up, nothing slides
    // out. No back-travel (the bolt only turns, it doesn't leave the receiver).
    wrapper.updateMatrixWorld(true);
    const boltBody = assetRoot.getObjectByName('Bolt_back_Mosin_Parts_mat_0') || boltNode;
    const pivotWorld = new THREE.Box3().setFromObject(boltBody).getCenter(new THREE.Vector3());
    bolt = new THREE.Group();
    bolt.name = 'Mosin bolt pivot';
    wrapper.add(bolt);
    bolt.position.copy(wrapper.worldToLocal(pivotWorld.clone()));
    bolt.updateMatrixWorld(true);
    bolt.attach(boltNode);             // reparent keeping world pose → boltNode now turns about the bore
    bolt.userData.basePos = bolt.position.clone();
    bolt.userData.baseRot = bolt.rotation.clone();
    bolt.userData.liftTravel = 0;      // pure rotation, no vertical slide
    bolt.userData.backTravel = 0;      // the bolt only turns about its axis — it never slides out
    bolt.userData.boltRotTravel = 1.5; // ~86° handle lift about the bore (verified in-engine)
  }
  // Reload props: a 5-round stripper clip + a single cartridge, hung off a "charger" anchor on the
  // receiver top. The shared Mosin reload choreography (_updateMosinAnim) drives them into the
  // chamber; positions are charger-local so they don't depend on the procedural model's layout.
  const { clip, round } = _buildMosinReloadProps();
  const charger = new THREE.Group();
  charger.name = 'Mosin charger';
  // Anchor above the open chamber on the bore line — derived from the bolt pivot so it tracks the
  // placement automatically (the pivot already sits on the bore, dead centre over the receiver).
  const chamberRef = bolt ? bolt.position.clone() : new THREE.Vector3(0.021, 0.139, 0.132);
  charger.position.copy(chamberRef).add(new THREE.Vector3(0, 0.031, -0.19));
  charger.add(clip, round);
  wrapper.add(charger);

  prepWeaponMeshTree(wrapper);
  wrapper.userData.mosin = { bolt, clip, round, charger };
  return wrapper;
}


// ---------------------------------------------------------------------------
// Weapons — guns + melee. dmg is BASE (rarity & perks multiply at use).
// ---------------------------------------------------------------------------
export const WEAPONS = {
  // --- melee ---
  knife:    { name: 'Bayonet Knife', class: 'melee', shape: 'knife',   melee: true, dmg: 38,  rate: 0.32, range: 2.3, arcCos: 0.4, knock: 2,  price: 0,    color: 0x9aa0a6, accent: 0x6b4a2a },
  machete:  { name: 'Machete',       class: 'melee', shape: 'machete', melee: true, dmg: 62,  rate: 0.42, range: 2.5, arcCos: 0.45, knock: 3, price: 500,  loot: 8, color: 0xb6bcc2, accent: 0x3a2a1a },
  cleaver:  { name: 'Meat Cleaver',  class: 'melee', shape: 'cleaver', melee: true, dmg: 88,  rate: 0.52, range: 2.3, arcCos: 0.45, knock: 4, price: 800,  loot: 6, color: 0xd8dde2, accent: 0x6b3a1a },
  shovel:   { name: 'Trench Shovel', class: 'melee', shape: 'shovel',  melee: true, dmg: 120, rate: 0.66, range: 2.7, arcCos: 0.5, knock: 9,  price: 1000, loot: 5, color: 0x8a8f95, accent: 0x5a3a1c,
              // hold LMB while aiming at the ground → dig a foxhole/trench (terrain excavation). depthPerSec
              // accrues and is emitted ~10×/s as overlapping pits that SUM into a deepening hole (dig.js).
              dig: { r: 1.8, perScoop: 0.2, scoopTime: 0.42, reach: 4.2, lip: 0 } },
  // --- pistols ---
  luger:    { name: 'Luger P08',  class: 'pistol', shape: 'pistol',  dmg: 28, rpm: 300, auto: false, mag: 8,  reserveMax: 32,       reload: 1.8, spread: 0.010, bloom: 0.012, pellets: 1, recoil: 0.7, range: 120, adsFov: 60, price: 400,  color: 0x33373d, accent: 0xd8c089 },
  revolver: { name: 'Peacemaker', class: 'pistol', shape: 'revolver',dmg: 70, rpm: 110, auto: false, mag: 6,  reserveMax: 30,       reload: 2.6, spread: 0.008, bloom: 0.010, pellets: 1, recoil: 1.5, range: 130, adsFov: 58, price: 900,  loot: 9, color: 0x4a3320, accent: 0xc9a04a },
  // --- SMGs ---
  thompson: { name: 'Thompson',   class: 'smg', shape: 'smg',  dmg: 20, rpm: 700, auto: true,  mag: 30, reserveMax: 150, reload: 2.4, spread: 0.024, bloom: 0.03, pellets: 1, recoil: 0.7,  range: 130, adsFov: 62, price: 1200, loot: 12, recoilClimb: 0.08, recoilYaw: 0.10, color: 0x3a2a1c, accent: 0x9c6a32 },
  ppsh:     { name: 'PPSh-41',    class: 'smg', shape: 'drum', dmg: 16, rpm: 1000, auto: true,  mag: 71, reserveMax: 142, reload: 3.2, spread: 0.028,  bloom: 0.022, pellets: 1, recoil: 0.45, range: 150, adsFov: 64, price: 1600, loot: 8,  recoilClimb: 0.04, recoilYaw: 0.55, color: 0x2f2218, accent: 0xb88a3a },
  // --- rifles ---
  carbine:  { name: 'M1 Carbine', class: 'rifle', shape: 'carbine', dmg: 32, rpm: 400, auto: false, mag: 15, reserveMax: 90, reload: 1.7, spread: 0.01,  bloom: 0.012, pellets: 1, recoil: 0.55, range: 240, adsFov: 55, price: 1100, loot: 10, color: 0x4a3422, accent: 0x2a2a30 },
  garand:   { name: 'M1 Garand',  class: 'rifle', shape: 'garand', dmg: 80, rpm: 270, auto: false, mag: 8,  reserveMax: 64,  reload: 2.6, spread: 0.008, bloom: 0.01,  pellets: 1, recoil: 1.6, range: 340, adsFov: 48, price: 2000, loot: 7,  enBloc: true, color: 0x52371f, accent: 0x222226 },
  stg44:    { name: 'StG 44',     class: 'rifle', shape: 'stg',   dmg: 38, rpm: 560, auto: true,  mag: 30, reserveMax: 150, reload: 2.4, spread: 0.015, bloom: 0.016, pellets: 1, recoil: 0.85, range: 260, adsFov: 54, price: 2400, loot: 6,  recoilClimb: 0.03, recoilYaw: 0.10, color: 0x33373d, accent: 0x6e4a28 },
  // --- shotguns ---
  shotgun:  { name: 'Trench Gun', class: 'shotgun', shape: 'shotgun', dmg: 13, rpm: 80,  auto: false, mag: 6, reserveMax: 36, reload: 0.45, shellReload: true, spread: 0.085, bloom: 0, pellets: 9,  recoil: 1.7, range: 55, adsFov: 66, price: 1700, loot: 9, color: 0x3a2418, accent: 0x9c6a32 },
  sawed_off:{ name: 'Sawed-Off',  class: 'shotgun', shape: 'sawed',   dmg: 16, rpm: 200, auto: false, mag: 2, reserveMax: 18, reload: 1.6, spread: 0.14,  bloom: 0, pellets: 12, recoil: 2.9, range: 30, adsFov: 70, price: 1500, loot: 8, color: 0x4a2e1c, accent: 0xc25b3a },
  // --- sniper ---
  kar98:    { name: 'Kar98 Scoped', class: 'sniper', shape: 'sniper', dmg: 165, rpm: 50, auto: false, mag: 5, reserveMax: 35, reload: 2.4, spread: 0.0015, bloom: 0, pellets: 1, recoil: 2.7, range: 500, adsFov: 22, scope: true, price: 2600, loot: 5, boltCycle: 1.2, color: 0x20242a, accent: 0x6fa8e8 },
  // --- extra arsenal (loot + shop) ---
  magnum:   { name: '.44 Magnum',  class: 'pistol', shape: 'magnum', dmg: 98, rpm: 95, auto: false, mag: 6, reserveMax: 24, reload: 2.4, spread: 0.009, bloom: 0.014, pellets: 1, recoil: 2.2, range: 140, adsFov: 58, price: 1400, loot: 8, color: 0x4a4a52, accent: 0x6b4a2a },
  mp40:     { name: 'MP 40',       class: 'smg', shape: 'mp40',  dmg: 18, rpm: 500, auto: true, mag: 32, reserveMax: 160, reload: 2.0, spread: 0.018, bloom: 0.014, pellets: 1, recoil: 0.4, range: 150, adsFov: 62, price: 1300, loot: 11, recoilClimb: 0.015, recoilYaw: 0.05, color: 0x2e3036, accent: 0x3a3a3a },
  grease:   { name: 'M3 Grease Gun', class: 'smg', shape: 'grease', dmg: 22, rpm: 450, auto: true, mag: 30, reserveMax: 150, reload: 2.2, spread: 0.026, bloom: 0.02, pellets: 1, recoil: 0.5, range: 120, adsFov: 62, price: 1250, loot: 9, recoilClimb: 0.02, recoilYaw: 0.10, color: 0x3a3d42, accent: 0x262626 },
  bar:      { name: 'BAR M1918',   class: 'rifle', shape: 'bar', dmg: 52, rpm: 500, auto: true, mag: 20, reserveMax: 120, reload: 3.0, spread: 0.016, bloom: 0.02, pellets: 1, recoil: 1.6, range: 300, adsFov: 55, price: 2600, loot: 6, recoilClimb: 0.10, recoilYaw: 0.15, color: 0x3a3128, accent: 0x26262a },
  dp28:     { name: 'DP-28',       class: 'rifle', shape: 'dp28', dmg: 33, rpm: 550, auto: true, mag: 47, reserveMax: 141, reload: 3.6, spread: 0.018, bloom: 0.020, pellets: 1, recoil: 0.9, range: 280, adsFov: 56, price: 2700, loot: 5, recoilClimb: 0.05, recoilYaw: 0.20, color: 0x3a352c, accent: 0x4a4a50, spinMag: { shape: 'pan', x: 0, y: 0.2, z: -0.3, r: 0.28, axis: 'y', step: TAU / 47 } },
  mosin:    { name: 'Mosin 91/30', class: 'sniper', shape: 'mosin', dmg: 175, rpm: 42, auto: false, mag: 5, reserveMax: 30, reload: 2.6, spread: 0.0020, bloom: 0, pellets: 1, recoil: 2.8, range: 500, adsFov: 38, scope: false, price: 2400, loot: 5, color: 0x6e4a28, accent: 0x4a4e54, boltAction: true, reloadStyle: 'mosin', clipReload: 1.95, roundReload: 0.54 },
  bazooka:  { name: 'Bazooka',     class: 'launcher', shape: 'bazooka', dmg: 0, rpm: 24, auto: false, mag: 1, reserveMax: 5, reload: 4.0, spread: 0.004, bloom: 0, pellets: 1, recoil: 0.6, range: 250, adsFov: 62, explodeDmg: 240, explodeRadius: 7.5, price: 3200, loot: 3, color: 0x4a5238, accent: 0x2e2e2e },
  axe:      { name: 'Trench Axe',  class: 'melee', shape: 'axe', melee: true, dmg: 95, rate: 0.5, range: 2.4, arcCos: 0.45, knock: 5, price: 700, loot: 7, color: 0x9aa0a6, accent: 0x6b4a2a },
  // DEMO-ONLY debug "tank cannon" firing an APFSDS long-rod (CALIBERS.apfsds): NO explosion —
  // obliterates fragile parts (glass/wood/trunk) along the ray, leaves a through-hole in
  // structural brick (wall stays), and spalls fragile parts behind. Only on the ?map=demo
  // loadout so Phase 11 can demonstrate penetration in normal play. Reuses the bazooka tube viewmodel.
  apfsds:   { name: 'APFSDS Cannon', class: 'cannon', shape: 'bazooka', apfsds: true, dmg: 220, rpm: 50, auto: false, mag: 5, reserveMax: 25, reload: 1.4, spread: 0.0015, bloom: 0, pellets: 1, recoil: 1.4, range: 320, adsFov: 60, price: 0, color: 0x394b2e, accent: 0x6fa8e8 },
  // --- held tool: flashlight (no shooting while held; beam syncs in MP) ---
  flashlight: { name: 'Flashlight', class: 'tool', shape: 'flashlight', color: 0x9aa0a6, accent: 0xc23a2a },
  binoculars: { name: 'Binoculars', class: 'tool', shape: 'binoculars', zoom: true, scope: true, adsFov: 12, color: 0x26282b, accent: 0xb08a3a }, // Soviet Б8×30 field glasses — RMB zooms to a realistic 8× (FOV≈12°)
  lpr1: { name: 'ЛПР-1 Rangefinder', class: 'tool', shape: 'lpr1', zoom: true, scope: true, adsFov: 6.7, rangefinder: true, color: 0xb3782a, accent: 0x26282b }, // ЛПР-1 «Каралон-М» (1Д13) laser rangefinder — RMB raises (7×, real 6.7° FOV), T fires a ranging pulse (TTX per models/lpr1/ref/dossier.json)
  bussole: { name: 'Буссоль ПАБ-2А', class: 'tool', shape: 'bussole', color: 0x3a4a3a, accent: 0xb0a050 }, // Soviet artillery aiming circle — RMB raises the угломер compass overlay (no FOV zoom; keyed off shape==='bussole'). Datum = bearing.js
  // --- fortification builders (held like weapons; LMB places, wheel rotates; material from supply drops only) ---
  // (builder weapons removed — fortifications are carried as inventory items; see ITEM_DEFS sandbag/wire/wood)
};
export const WEAPON_ORDER = ['knife', 'axe', 'machete', 'cleaver', 'shovel', 'luger', 'magnum', 'revolver', 'mp40', 'grease', 'thompson', 'ppsh', 'carbine', 'bar', 'dp28', 'garand', 'stg44', 'shotgun', 'sawed_off', 'bazooka', 'apfsds', 'mosin', 'kar98', 'flashlight', 'binoculars', 'lpr1', 'bussole'];
const LOOT_WEAPONS = WEAPON_ORDER.filter((k) => WEAPONS[k].loot);
export const FIREARM_KEYS = WEAPON_ORDER.filter((k) => ['pistol', 'smg', 'rifle', 'shotgun', 'sniper', 'launcher'].includes(WEAPONS[k].class)); // guns only (no melee/tools) — air drops guarantee one
const lootWeapon = () => weightedPick(LOOT_WEAPONS.map((k) => ({ v: k, w: WEAPONS[k].loot })));

// ---------------------------------------------------------------------------
// Viewmodels
// ---------------------------------------------------------------------------
export function buildViewmodel(def) {
  const b = new MeshBuilder();
  const c = def.color, a = def.accent, dark = shade(c, -0.1);
  let _post = null; // optional callback(mesh) run after the merged mesh exists — for articulated child parts (e.g. the flashlight's press-button)
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
    case 'mosin': { // Mosin 91/30 infantry rifle: long amber stock, straight bolt, hooded front sight, rod, bands, stripper-clip reload.
      const wHi = 0xd49a52, wMid = 0xa66a31, wLo = 0x6f421f, wDark = 0x3a2313, wBright = 0xe0ad68;
      const sHi = 0x7d858e, sMid = 0x535b64, sLo = 0x343941, sSlot = 0x1e2227, sBright = 0xa0a8b1;
      const brass = 0xc9a64a, brassHi = 0xe0c770, copper = 0xb36a35;
      const cyl = (r0, r1, h, x, y, z, col, o = {}) => { const g = new THREE.CylinderGeometry(r0, r1, h, o.seg || 14); b.geo(g, x, y, z, col, o); g.dispose(); };
      const roundGeom = (mb, x, y, z, scale = 1, vertical = true) => {
        const orient = vertical ? {} : { rx: Math.PI / 2 };
        let g = new THREE.CylinderGeometry(0.011 * scale, 0.012 * scale, 0.09 * scale, 10); mb.geo(g, x, y, z, brass, { ...orient, tint: 0.02 }); g.dispose();
        g = new THREE.CylinderGeometry(0.007 * scale, 0.011 * scale, 0.045 * scale, 10); mb.geo(g, x, y + (vertical ? 0.065 * scale : 0), z + (vertical ? 0 : -0.065 * scale), copper, orient); g.dispose();
        g = new THREE.CylinderGeometry(0.013 * scale, 0.013 * scale, 0.011 * scale, 10); mb.geo(g, x, y - (vertical ? 0.052 * scale : 0), z + (vertical ? 0 : 0.052 * scale), brassHi, orient); g.dispose();
      };

      // Full-length birch stock silhouette. The M91/30 reads from its long slim wood, not a bulky black receiver.
      b.box(0.128, 0.23, 0.11, 0, -0.075, 0.79, wLo, { tint: 0.035 });              // flat steel-capped butt end shadow
      b.box(0.108, 0.18, 0.50, 0, -0.07, 0.53, wMid, { tint: 0.055 });              // buttstock body
      b.box(0.088, 0.058, 0.43, 0, 0.035, 0.54, wHi, { tint: 0.04 });               // raised comb highlight
      b.box(0.112, 0.035, 0.42, 0, -0.17, 0.54, wLo);                               // toe shadow
      b.box(0.076, 0.13, 0.34, 0, -0.055, 0.22, wMid, { tint: 0.045 });             // wrist
      b.box(0.058, 0.045, 0.26, 0, 0.038, 0.17, wHi, { tint: 0.03 });               // wrist comb into receiver
      b.box(0.084, 0.105, 1.26, 0, -0.025, -0.61, wMid, { tint: 0.05 });            // long forend
      b.box(0.066, 0.036, 1.17, 0, 0.044, -0.65, wHi, { tint: 0.04 });              // upper handguard strip
      b.box(0.090, 0.028, 1.20, 0, -0.094, -0.61, wLo);                             // lower shadow strip
      b.box(0.030, 0.018, 0.92, 0.038, -0.005, -0.70, wBright, { tint: 0.05 });      // right-side glossy grain streak
      b.box(0.024, 0.014, 0.74, -0.039, -0.025, -0.48, wDark, { tint: 0.02 });       // dark left grain groove
      b.box(0.020, 0.014, 0.24, 0.050, -0.020, 0.39, wDark);                        // butt sling slot
      b.box(0.020, 0.014, 0.20, 0.052, -0.018, -0.60, wDark);                       // forend sling slot

      // Metal receiver, magazine and trigger group.
      b.box(0.086, 0.112, 0.25, 0, 0.020, -0.035, sMid, { tint: 0.02 });            // round receiver block
      cyl(0.047, 0.047, 0.29, 0, 0.073, -0.035, sMid, { rx: Math.PI / 2, seg: 16, tint: 0.02 }); // receiver top tube
      b.box(0.074, 0.023, 0.25, 0, 0.122, -0.035, sHi);                             // receiver top glint
      b.box(0.050, 0.035, 0.105, 0.041, 0.062, -0.010, sSlot);                      // open ejection/charger bridge shadow
      b.box(0.044, 0.025, 0.050, 0, 0.138, 0.072, sLo);                             // cocking piece cap
      b.box(0.067, 0.092, 0.145, 0, -0.105, 0.025, sLo, { tint: 0.015 });           // magazine box
      b.box(0.073, 0.018, 0.152, 0, -0.158, 0.025, sBright);                        // floorplate lip
      b.box(0.060, 0.020, 0.135, 0, -0.082, 0.045, sLo);                            // trigger guard bow
      b.box(0.018, 0.052, 0.017, 0, -0.060, 0.017, sBright);                        // trigger

      // Rear sight ladder and graduation ticks.
      b.box(0.070, 0.036, 0.155, 0, 0.103, -0.305, sLo);                            // tangent sight base
      b.box(0.050, 0.014, 0.145, 0, 0.134, -0.305, sHi);                            // ladder top
      b.box(0.012, 0.038, 0.045, -0.030, 0.142, -0.245, sBright);
      b.box(0.012, 0.038, 0.045, 0.030, 0.142, -0.245, sBright);
      for (let i = 0; i < 5; i++) b.box(0.042, 0.004, 0.008, 0, 0.151, -0.365 + i * 0.026, sBright);

      // Barrel, nose cap, bayonet lug and cleaning rod under the wood.
      cyl(0.026, 0.026, 0.74, 0, 0.073, -1.23, sMid, { rx: Math.PI / 2, seg: 16, tint: 0.02 });
      b.box(0.034, 0.011, 0.68, 0, 0.101, -1.22, sHi);                              // barrel top highlight
      b.box(0.018, 0.018, 0.94, 0, -0.105, -1.02, sLo);                              // cleaning rod
      b.box(0.026, 0.026, 0.040, 0, -0.105, -1.50, sBright);                         // cleaning rod button
      b.box(0.096, 0.103, 0.042, 0, -0.004, -0.455, sLo);                            // rear barrel band
      b.box(0.098, 0.103, 0.042, 0, -0.004, -0.930, sLo);                            // front barrel band
      b.box(0.106, 0.025, 0.042, 0, 0.056, -0.455, sHi);
      b.box(0.108, 0.025, 0.042, 0, 0.056, -0.930, sHi);
      b.box(0.077, 0.070, 0.075, 0, 0.047, -1.575, sLo);                             // front nose cap
      b.box(0.044, 0.032, 0.054, 0, -0.035, -1.550, sLo);                            // bayonet lug / rod stop
      b.box(0.024, 0.024, 0.040, 0, 0.073, -1.690, sSlot);                           // muzzle bore
      b.box(0.014, 0.070, 0.026, 0, 0.136, -1.600, sBright);                         // blade post
      b.box(0.016, 0.080, 0.030, -0.036, 0.125, -1.600, sLo);                        // hood ear L
      b.box(0.016, 0.080, 0.030, 0.036, 0.125, -1.600, sLo);                         // hood ear R
      b.box(0.080, 0.014, 0.030, 0, 0.165, -1.600, sLo);                             // hood bridge

      // Decorative screws, sling hardware and little brass escutcheons.
      cyl(0.012, 0.012, 0.010, 0.052, 0.002, 0.050, sBright, { rz: Math.PI / 2, seg: 10 });
      cyl(0.012, 0.012, 0.010, 0.052, -0.010, -0.255, sBright, { rz: Math.PI / 2, seg: 10 });
      cyl(0.015, 0.015, 0.010, 0.055, -0.020, 0.420, brass, { rz: Math.PI / 2, seg: 12 });
      cyl(0.015, 0.015, 0.010, 0.055, -0.018, -0.620, brass, { rz: Math.PI / 2, seg: 12 });

      _post = (mesh) => {
        const makeMesh = (mb) => {
          const child = new THREE.Mesh(mb.build(), voxelMaterial({ side: THREE.DoubleSide }));
          child.renderOrder = mesh.renderOrder + 1; child.frustumCulled = false;
          return child;
        };
        const bbolt = new MeshBuilder();
        let g = new THREE.CylinderGeometry(0.026, 0.026, 0.205, 14); bbolt.geo(g, 0, 0, 0, sBright, { rx: Math.PI / 2, tint: 0.02 }); g.dispose();
        bbolt.box(0.020, 0.020, 0.105, 0.058, -0.002, 0.032, sBright);          // straight bolt arm
        g = new THREE.CylinderGeometry(0.028, 0.028, 0.032, 14); bbolt.geo(g, 0.090, -0.002, 0.082, sBright, { rz: Math.PI / 2 }); g.dispose(); // ball knob
        bbolt.box(0.034, 0.020, 0.055, -0.020, 0.014, 0.106, sHi);             // cocking piece fin
        const bolt = makeMesh(bbolt);
        bolt.position.set(0.020, 0.078, 0.055);
        bolt.userData.basePos = bolt.position.clone();
        mesh.add(bolt);

        const bclip = new MeshBuilder();
        bclip.box(0.155, 0.012, 0.026, 0, 0.018, 0, sBright);
        for (let i = 0; i < 5; i++) roundGeom(bclip, -0.056 + i * 0.028, -0.030, 0, 0.78, true);
        const clip = makeMesh(bclip);
        clip.visible = false; clip.position.set(0, 0.225, -0.020);
        mesh.add(clip);

        const bround = new MeshBuilder();
        roundGeom(bround, 0, 0, 0, 0.90, true);
        const round = makeMesh(bround);
        round.visible = false; round.position.set(0.045, 0.200, -0.005);
        mesh.add(round);

        mesh.userData.mosin = { bolt, clip, round };
      };
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
    case 'binoculars': {   // Soviet 8×30 porro field binocular (per blueprint) — COMPACT (depth<width), NEAR-PARALLEL barrels with a porro vertical JOG (eyepiece high/back, objective low/front), chunky rounded bodies tapering to the objective, glass lenses, central bridge focus wheel. Black leatherette. No markings.
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
    case 'lpr1': {   // ЛПР-1 «Каралон-М» laser rangefinder — CUSTOM-MESH build (owner pass 2): rounded cast capsule
      // (extruded stadium profile, dossier 226×116×221 mm ×2.2), lathe eyecups/knobs/battery, subtle top ribs.
      // Authored Z-FLIPPED vs models/lpr1/spec.json (rear panel at +Z toward the player) → asymmetric X negated.
      const oHi = 0xd99c3e, oMid = 0xb3782a, oLo = 0x8c5c20, oBr = 0xedb654,
            blk = 0x141414, blkLo = 0x0c0c0c, bak = 0x2c2723, stl = 0x8a9099, gun = 0x3a3f45, brs = 0xa8842f,
            olv = 0x52603a, lth = 0x3a2c18, glHi = 0x4a5fa8, glMid = 0x2e3c75, lasHi = 0xcdd98a, lasMid = 0xa8b85e,
            crm = 0xe6dcc2, grn = 0x3f2e22, glint = 0xcfdcff, blue = 0x3a5fc0;
      const PI2 = Math.PI / 2;
      const zcyl = (r, h, x, y, z, col, o = {}) => { const g = new THREE.CylinderGeometry(o.r2 ?? r, r, h, o.seg || 24); b.geo(g, x, y, z, col, { rx: PI2, ...o }); g.dispose(); };
      const lat = (prof, x, y, z, col, o = {}) => { const g = new THREE.LatheGeometry(prof.map((q) => new THREE.Vector2(q[0], q[1])), o.seg || 24); b.geo(g, x, y, z, col, { rx: PI2, ...o }); g.dispose(); };
      // rounded stadium loaf: side profile (depth D × height H, corner radius rad) extruded across width W with a beveled rim
      const loafM = (W, H, D, rad, bev, x, y, z, col, tint = 0.03) => {
        const bs = bev * 0.9, pw = D - 2 * bs, ph = H - 2 * bs;
        const r = Math.max(0.001, Math.min(rad, ph / 2 - 0.0005, pw / 2 - 0.0005));
        const sh = new THREE.Shape(); const x0 = -pw / 2, y0 = -ph / 2;
        sh.moveTo(x0 + r, y0);
        sh.lineTo(x0 + pw - r, y0); sh.quadraticCurveTo(x0 + pw, y0, x0 + pw, y0 + r);
        sh.lineTo(x0 + pw, y0 + ph - r); sh.quadraticCurveTo(x0 + pw, y0 + ph, x0 + pw - r, y0 + ph);
        sh.lineTo(x0 + r, y0 + ph); sh.quadraticCurveTo(x0, y0 + ph, x0, y0 + ph - r);
        sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0);
        const g = new THREE.ExtrudeGeometry(sh, { depth: W - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bs, bevelSegments: 4, curveSegments: 12 });
        g.translate(0, 0, -(W - 2 * bev) / 2); g.rotateY(PI2);
        b.geo(g, x, y, z, col, { tint }); g.dispose();
      };
      const halfFin = (x, y, z) => {       // half-moon button guard: extruded semicircle, flat faces ±X, round edge up
        const r = 0.027, th = 0.013;
        const sh = new THREE.Shape(); sh.moveTo(-r, 0); sh.absarc(0, 0, r, Math.PI, 0, true); sh.lineTo(r, 0); sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 12 });
        g.translate(0, 0, -th / 2); g.rotateY(PI2);
        b.geo(g, x, y, z, oHi); g.dispose();
      };
      // ---- the cast capsule body + sculpted rear control-panel casting ----
      loafM(0.497, 0.238, 0.385, 0.062, 0.035, 0, 0, 0.02, oMid);
      loafM(0.458, 0.215, 0.062, 0.05, 0.014, 0, 0, 0.236, oMid, 0.045);
      // subtle longitudinal stiffening ribs (owner: less detail here, the silhouette carries it)
      for (const rx of [-0.185, -0.092, 0, 0.092, 0.185]) b.box(0.011, 0.007, 0.21, rx, 0.1175, 0.0, oHi);
      // cast strap lugs on the rear shoulders
      b.box(0.034, 0.024, 0.05, -0.225, 0.098, 0.19, oMid); b.box(0.034, 0.024, 0.05, 0.225, 0.098, 0.19, oMid);
      // ---- FRONT (−Z, away from player): осушка · big blue objective · yellow-green laser window ----
      zcyl(0.070, 0.05, -0.011, -0.004, -0.176, oHi);                        // objective bezel boss
      zcyl(0.072, 0.012, -0.011, -0.004, -0.198, oBr);                       // bright lip
      zcyl(0.060, 0.02, -0.011, -0.004, -0.202, blkLo);                      // inner barrel
      zcyl(0.052, 0.012, -0.011, -0.004, -0.207, glMid);                     // deep blue coated glass
      zcyl(0.040, 0.010, -0.011, -0.004, -0.212, glHi);                      // inner sheen
      zcyl(0.012, 0.007, 0.004, 0.013, -0.216, glint, { seg: 12 });          // catch-light
      zcyl(0.043, 0.04, 0.15, -0.004, -0.173, oHi);                          // laser window bezel
      zcyl(0.045, 0.01, 0.15, -0.004, -0.189, oBr);
      zcyl(0.032, 0.011, 0.15, -0.004, -0.193, lasMid);                      // 1.06 µm optics — yellow-green coating
      zcyl(0.022, 0.009, 0.15, -0.004, -0.198, lasHi);
      zcyl(0.008, 0.006, 0.142, 0.006, -0.202, glint, { seg: 10 });
      zcyl(0.048, 0.008, -0.187, -0.004, -0.170, oMid);                      // осушка retaining ring
      zcyl(0.046, 0.022, -0.187, -0.004, -0.178, grn);                       // desiccant felt disc
      zcyl(0.009, 0.006, -0.187, -0.004, -0.190, blue, { seg: 10 });         // blue silica-gel window
      // ---- REAR (+Z, the player's view — slide-18 layout seen from behind) ----
      // indicator eyepiece (screen-left, bigger/softer) + visor eyepiece (violet glass)
      for (const [ex, isVis] of [[-0.057, false], [0.101, true]]) {
        lat([[0.030, 0], [0.041, 0.006], [0.044, 0.014], [0.040, 0.020], [0.044, 0.028], [0.040, 0.034], [0.043, 0.042]], ex, 0, 0.262, gun);
        lat([[0.040, 0], [0.051, 0.012], [0.054, 0.030], [0.046, 0.044]], ex, 0, 0.298, blk);
        zcyl(0.033, 0.010, ex, 0, 0.344, 0x101418);
        if (isVis) { zcyl(0.020, 0.008, ex, 0, 0.348, glHi, { seg: 14 }); zcyl(0.007, 0.005, ex - 0.008, 0.008, 0.352, glint, { seg: 8 }); }
      }
      // battery cover (far screen-left): ochre base ring + black rounded cap + steel fold lever
      zcyl(0.057, 0.014, -0.172, -0.013, 0.264, oMid);
      lat([[0, 0], [0.030, 0], [0.038, 0.006], [0.040, 0.018], [0.033, 0.027], [0, 0.030]], -0.172, -0.013, 0.272, blk);
      b.box(0.011, 0.052, 0.009, -0.172, -0.013, 0.300, stl, { rz: 0.35 });
      // ВКЛ/ВЫКЛ power knob + engraved white labels
      zcyl(0.017, 0.012, -0.119, 0.070, 0.262, oLo);
      lat([[0.006, 0], [0.013, 0.004], [0.013, 0.018], [0.009, 0.026], [0, 0.028]], -0.119, 0.070, 0.268, bak);
      b.box(0.008, 0.034, 0.009, -0.119, 0.070, 0.288, blk, { rz: 0.6 });
      // СТРОБИРОВАНИЕ drum: knurled black drum + cream scale ring + slotted screw face
      { const kn = [[0.022, 0]]; for (let i = 0; i <= 9; i++) kn.push([i % 2 ? 0.037 : 0.032, 0.004 + i * 0.0042]); kn.push([0.022, 0.047]);
        lat(kn, 0.018, 0.070, 0.262, blk, { seg: 26 }); }
      zcyl(0.030, 0.0045, 0.018, 0.070, 0.310, crm);
      zcyl(0.024, 0.005, 0.018, 0.070, 0.313, blkLo);
      b.box(0.018, 0.004, 0.004, 0.018, 0.070, 0.317, stl);
      // ПОДСВ illumination knob + label
      zcyl(0.014, 0.010, 0.154, -0.062, 0.262, oLo);
      lat([[0.005, 0], [0.011, 0.004], [0.011, 0.015], [0.007, 0.022], [0, 0.024]], 0.154, -0.062, 0.266, bak);
      b.box(0.007, 0.026, 0.008, 0.154, -0.062, 0.283, blk, { rz: -0.6 });
      // remote-buttons разъём: knurled brass cap (bottom centre)
      { const kb = [[0.014, 0]]; for (let i = 0; i <= 5; i++) kb.push([i % 2 ? 0.024 : 0.020, 0.004 + i * 0.0045]); kb.push([0.012, 0.030]);
        lat(kb, -0.004, -0.086, 0.262, brs, { seg: 20 }); }
      // label plate BACKINGS (relief); the READABLE text goes on as CanvasTexture planes in _post —
      // real legible азбука is the project bar (gatehouse console, gramophone labels, «ЧАСОЗБОР»),
      // cream paint-bars are banned for up-close text.
      b.box(0.057, 0.040, 0.010, 0.022, -0.048, 0.266, blk);
      b.box(0.079, 0.048, 0.010, 0.189, 0.009, 0.266, blk);
      _post = (m) => {
        const addText = (lines, w, h, x, y, z, opts = {}) => {
          const tex = makeTextPlateTexture(lines, { plate: opts.plate !== false, aspect: w / h });
          const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: opts.plate === false, depthWrite: opts.plate !== false });
          const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
          pl.position.set(x, y, z);
          if (opts.rx) pl.rotation.x = opts.rx;
          pl.renderOrder = 1001; pl.frustumCulled = false;
          m.add(pl);
        };
        addText(['ЛПР-1', 'ДАЛЬНОМЕР', 'N 790346'], 0.052, 0.036, 0.022, -0.048, 0.2725);
        addText(['ПОСЛЕ ОКОНЧАНИЯ', 'РАБОТЫ ВЫКЛЮЧИ', 'ПИТАНИЕ И ПОДСВЕТКУ'], 0.074, 0.044, 0.189, 0.009, 0.2725);
        addText(['ВЫКЛ      ВКЛ'], 0.082, 0.014, -0.119, 0.097, 0.2690, { plate: false });
        addText(['ПОДСВ.'], 0.040, 0.012, 0.118, -0.085, 0.2690, { plate: false });
        addText(['ИЗМЕРЕНИЕ'], 0.092, 0.015, 0.119, 0.1205, -0.045, { plate: false, rx: -PI2 });
      };
      // slotted panel screws (4 corners + top/bottom centre)
      for (const [sx, sy] of [[-0.214, 0.092], [0.214, 0.092], [-0.214, -0.085], [0.214, -0.085], [0, 0.100], [0.07, -0.092]]) {
        zcyl(0.009, 0.012, sx, sy, 0.262, stl, { seg: 12 });
        b.box(0.013, 0.003, 0.003, sx, sy, 0.270, gun);
      }
      // ---- TOP: ИЗМЕРЕНИЕ 1/2 rubber dome buttons between three half-moon guard fins ----
      halfFin(0.172, 0.118, -0.075); halfFin(0.119, 0.118, -0.075); halfFin(0.066, 0.118, -0.075);
      lat([[0.019, 0], [0.019, 0.008], [0.014, 0.012], [0.012, 0.020], [0.006, 0.026], [0, 0.028]], 0.145, 0.118, -0.075, blk, { rx: -PI2 });
      lat([[0.019, 0], [0.019, 0.008], [0.014, 0.012], [0.012, 0.020], [0.006, 0.026], [0, 0.028]], 0.092, 0.118, -0.075, blk, { rx: -PI2 });
      // ---- strap over the spine + slim leather handle ----
      b.box(0.40, 0.008, 0.042, 0, 0.1225, 0.105, olv);
      b.box(0.008, 0.17, 0.042, -0.246, 0.03, 0.105, olv); b.box(0.008, 0.17, 0.042, 0.246, 0.03, 0.105, olv);
      b.box(0.022, 0.044, 0.022, -0.075, 0.141, -0.02, lth); b.box(0.022, 0.044, 0.022, 0.075, 0.141, -0.02, lth);
      b.box(0.172, 0.020, 0.024, 0, 0.171, -0.02, lth, { tint: 0.04 });
      // ---- bottom: steel УИУ-mount bracket strip + T-slot block ----
      b.box(0.10, 0.014, 0.26, 0, -0.124, 0.04, stl);
      b.box(0.05, 0.016, 0.07, 0, -0.130, 0.10, stl);
      b.box(0.028, 0.018, 0.05, 0, -0.133, 0.02, gun);
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
      // red push-button = a SEPARATE child mesh so it can pop UP (beam off) / sink DOWN (beam on); driven in WeaponSystem.update
      _post = (mesh) => {
        const bb = new MeshBuilder();
        bb.box(0.04, 0.04, 0.04, 0, 0.13, -0.08, red); bb.box(0.03, 0.022, 0.03, 0, 0.15, -0.08, redHi); // built at the raised (off) position
        const btn = new THREE.Mesh(bb.build(), voxelMaterial({ side: THREE.DoubleSide }));
        btn.renderOrder = mesh.renderOrder; btn.frustumCulled = false;
        btn.userData.upY = 0; btn.userData.downY = -0.05; // pressed sinks the stud into the housing
        btn.position.y = btn.userData.upY;
        mesh.add(btn); mesh.userData.flashBtn = btn;
      };
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
    case 'bussole': {   // PLACEHOLDER ПАБ-2А артиллерийская буссоль (aiming circle): graduated brass
                        // угломер ring on a short pillar + periscope head (objective faces −Z forward)
                        // + eyepiece you sight through (+Z, toward the player). TODO modelgen: swap this
                        // whole case for the sourced voxel build (one-case edit) — a shape with no case
                        // renders INVISIBLE, so this stand-in is mandatory until the real model lands.
      const olive = c, oliveHi = shade(c, 0.12), oliveLo = shade(c, -0.14),
            brass = a, brassHi = shade(a, 0.18), steel = 0x5a6068, glass = 0x9fc6d6;
      const PI2 = Math.PI / 2;
      const cyl = (r0, r1, h, x, y, z, col, o = {}) => { const g = new THREE.CylinderGeometry(r1, r0, h, o.seg || 20); b.geo(g, x, y, z, col, o); g.dispose(); };
      // graduated azimuth ring (brass круг) lying flat — the угломер dial
      cyl(0.17, 0.17, 0.03, 0, -0.14, -0.34, brass, { seg: 28, tint: 0.02 });
      cyl(0.175, 0.175, 0.012, 0, -0.123, -0.34, brassHi, { seg: 28 });
      for (let i = 0; i < 24; i++) { const ang = i / 24 * TAU; b.box(0.006, 0.006, 0.02, Math.cos(ang) * 0.155, -0.118, -0.34 + Math.sin(ang) * 0.155, steel); } // graduation ticks
      cyl(0.05, 0.05, 0.16, 0, -0.05, -0.34, oliveLo, { seg: 16 });   // short pillar/axle
      // main body column (vertical olive box, layered shading)
      b.box(0.14, 0.2, 0.12, 0, 0.06, -0.34, olive, { tint: 0.03 });
      b.box(0.1, 0.05, 0.12, 0, 0.155, -0.34, oliveHi);              // lit top strip
      b.box(0.14, 0.04, 0.12, 0, -0.04, -0.34, oliveLo);             // bottom shadow
      // periscope head at top, looking forward (−Z) — objective window
      b.box(0.13, 0.1, 0.16, 0, 0.18, -0.4, olive, { tint: 0.03 });
      b.box(0.09, 0.07, 0.012, 0, 0.18, -0.485, glass);              // objective glass (front face, −Z)
      // eyepiece tube facing the player (+Z) — what you sight through
      cyl(0.045, 0.05, 0.12, 0, 0.06, -0.2, steel, { rx: PI2, seg: 18 });
      cyl(0.05, 0.05, 0.02, 0, 0.06, -0.135, brassHi, { rx: PI2, seg: 18 });   // eyecup bezel
      cyl(0.034, 0.034, 0.012, 0, 0.06, -0.125, 0x1f2932, { rx: PI2, seg: 16 }); // dark eyepiece glass
      cyl(0.03, 0.03, 0.05, 0.1, 0.02, -0.34, brass, { rz: PI2, seg: 14 });     // side azimuth knob
      break;
    }
    default:        b.box(0.12, 0.16, 0.6, 0, 0, -0.3, c, { tint: 0.04 }); b.box(0.1, 0.26, 0.14, 0, -0.2, 0.04, dark);
  }
  const geom = b.build();
  if (def.shape === 'binoculars') geom.rotateY(Math.PI);   // eyepieces face the player in POV (you look INTO them, not the objectives)
  // lpr1 is NOT flipped — its rear control panel (eyecups/СТРОБ drum/plates) is authored at +Z, which is the side the player sees
  // Binoculars have open revolved tubes (eyecups, focus rings) — render double-sided so the inner
  // walls draw and you never see THROUGH them into the void (depthTest is off, so a culled back face = a hole).
  const m = new THREE.Mesh(geom, voxelMaterial({ side: THREE.DoubleSide })); // depthTest on (2-pass) + DoubleSide => correct self-occlusion, no see-through through open tubes
  m.renderOrder = 1000; m.frustumCulled = false;
  if (_post) _post(m); // attach articulated children (flashlight press-button) now that the parent mesh + renderOrder exist
  return m;
}

// Separate, spinnable magazine mesh (built centred at origin so it rotates cleanly).
export function buildMag(cfg) {
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

function addFiftyLiveRound(b, x, y, z, { axis = 'y', scale = 1, link = true } = {}) {
  const brass = 0xcaa64a, brassHi = 0xe2c56b, brassLo = 0x8c6b2e, linkC = 0x26282d, copper = 0xb5763a;
  const orient = axis === 'z' ? { rx: Math.PI / 2 } : axis === 'z-' ? { rx: -Math.PI / 2 } : {};
  const place = (off) => (axis === 'z' || axis === 'z-') ? [x, y, z + off * scale] : [x, y + off * scale, z];
  const cyl = (rt, rb, len, off, col, extra = {}) => {
    const g = new THREE.CylinderGeometry(rt * scale, rb * scale, len * scale, extra.seg || 10);
    const p = place(off);
    b.geo(g, p[0], p[1], p[2], col, { ...orient, tint: extra.tint || 0 });
    g.dispose();
  };
  cyl(0.026, 0.030, 0.155, -0.006, brass, { tint: 0.03 });
  cyl(0.034, 0.034, 0.016, -0.089, brassHi, { tint: 0.02 });
  cyl(0.027, 0.027, 0.012, -0.070, brassLo);
  if (link) cyl(0.037, 0.037, 0.030, -0.030, linkC, { seg: 8 });
  cyl(0.006, 0.024, 0.092, 0.108, copper, { tint: 0.02 });
}

// ---------------------------------------------------------------------------
// WeaponSystem — ownership, rarity, ammo, firing (guns + melee), ADS, grenades.
// ---------------------------------------------------------------------------
export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.mag = {}; this.reserve = {}; this.magMax = {}; this.semi = {};
    this.meleeKind = 'knife'; // the melee kind quick-melee (Q) jumps to — derived from the loadout each run
    this.cur = 'luger';
    this.cooldown = 0; this.reloading = 0; this.bloom = 0; this.recoilKick = 0; this.recoilPitch = 0; this.recoilYawKick = 0; this._recoilStreak = 0; this._boltLock = 0;
    this.grenadeCD = 0; this.ads = false; this.fov = 80;
    this.lprCD = 0; this.lprValue = null; // ЛПР-1: 5 s measurement cycle (0.2 Hz, ТТХ) + last reading in metres (null = display dark, 0 = no echo → 00000)
    this.molotovCD = 0;
    this.molotovState = null; this.molotovLightT = 0; this.molotovFuseT = 0; // null|'lighting'|'lit'
    this._boltT = 0; this._boltDur = 0.72; this._boltEjected = false; this._boltClickOpen = false; this._boltClickClose = false;
    this._reloadPlan = null; this._reloadMax = 0;
    this._bobT = 0; this._swing = 0;
    // shovel digging: dig-intent set by tryFire (LMB held on ground), consumed in update() as discrete
    // SCOOPs (one fixed-depth shovel-load every scoopTime while held).
    this._digWanted = false; this._digAim = { x: 0, z: 0 }; this._digSwingCD = 0;
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
    this._loadMosinAssetViewmodel();
  }

  async _loadMosinAssetViewmodel() {
    const fallback = this.models && this.models.mosin;
    if (!fallback) return;
    try {
      const gltf = await loadGltf(MOSIN_ASSET_URL);
      if (!this.models || this.models.mosin !== fallback) return;
      const replacement = buildMosinAssetViewmodel(gltf.scene, fallback);
      replacement.visible = fallback.visible;
      this.group.add(replacement);
      this.models.mosin = replacement;
      this.group.remove(fallback);
      disposeObject3D(fallback);
      this._clearMosinTransient();
    } catch (e) {
      console.warn('[weapons] Failed to load Mosin GLB viewmodel; using procedural fallback.', e);
    }
  }

  resetLoadout() {
    // clear any in-flight grenades and all transient state (survives restarts otherwise)
    for (const g of this.projectiles) { this.game.engine.scene.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose(); if (g.flame) { g.flame.geometry.dispose(); g.flame.material.dispose(); } }
    this.projectiles.length = 0;
    this.reloading = 0; this.cooldown = 0; this._boltLock = 0; this.grenadeCD = 0; this._swing = 0; this._bobT = 0;
    this._clearMosinTransient();
    this.bloom = 0; this.recoilKick = 0; this.recoilPitch = 0; this.recoilYawKick = 0; this._recoilStreak = 0; this.ads = false;
    this.fov = (this.game.settings && this.game.settings.data.fov) || 80;
    this.game.engine.setFov(this.fov);
    for (const k of WEAPON_ORDER) { this.mag[k] = 0; this.reserve[k] = 0; this.semi[k] = false; }
    // deploy the player's saved loadout — now a flat array of EQUAL slots (any gear in any slot, duplicates OK).
    // ?map=demo FORCES a fixed loadout (gun + bazooka + molotovs + APFSDS cannon) so every
    // destruction/fire feature is reachable with no shop trip; the player's saved meta.loadout is untouched.
    const lo = (this.game.mapId === 'demo' || this.game.mapId === 'forest')
      ? DEMO_LOADOUT.slice()   // demo + forest: force the testing loadout (gun + bazooka + molotovs + APFSDS)
      : ((this.game.meta && Array.isArray(this.game.meta.loadout)) ? this.game.meta.loadout : ['knife']);
    this.flares = 0;
    // choose what to hold first: first firearm, else first melee, else the bare knife
    this.cur = null;
    for (const k of lo) { if (k && WEAPONS[k] && !WEAPONS[k].melee && WEAPONS[k].class !== 'tool') { this.cur = k; break; } }
    if (!this.cur) for (const k of lo) { if (k && WEAPONS[k] && WEAPONS[k].melee) { this.cur = k; break; } }
    if (!this.cur) this.cur = 'knife';
    this.meleeKind = lo.find((k) => k && WEAPONS[k] && WEAPONS[k].melee) || 'knife'; // for quick-melee (Q)
    this.molotovCD = 0; this.molotovState = null; this.molotovLightT = 0; this.molotovFuseT = 0;
    // ownership + deploy now happen entirely in inventory.deployLoadout() (grant = ammo init; a slot confers ownership)
    if (this.molotovModel) { this.molotovModel.visible = false; this.molotovRagFlame.scale.setScalar(0); }
    this._grenadeArmed = false; this._throwSlot = null;
    for (const k in this.models) this.models[k].visible = false;
    for (const k in this.magMeshes) this.magMeshes[k].visible = false;
    // Populate the ONE flat inventory with the deployed gear (weapons/tools) + throwable start-stock, and hold the first slot.
    if (this.game.inventory) this.game.inventory.deployLoadout();
  }

  owns(key) { const inv = this.game.inventory; return !!inv && inv.slots.some((s) => s && s.kind === key); } // ownership is derived — an inventory slot holds it
  ownedOrder() { return WEAPON_ORDER.filter((k) => this.owns(k)); }
  def() { return WEAPONS[this.cur]; }
  effMult(key) { return this.game.player.damageMult; } // flat stats — rarity removed

  grant(key) { // ammo-init only; ownership is conferred by adding an inventory slot (Inventory.deployLoadout / addItem)
    const d = WEAPONS[key];
    if (!d.melee && d.class !== 'tool') {
      this.magMax[key] = d.mag;                                   // flat — no rarity scaling
      this.mag[key] = d.mag;
      this.reserve[key] = d.reserveMax === Infinity ? Infinity : d.reserveMax;
    }
    if (this.game.hud) this.game.hud.setWeapon(this);
  }

  isThrowLocked() { return this.molotovState === 'lit' || this.molotovState === 'lighting' || !!this._grenadeArmed; }
  select(key) {
    if (this.isThrowLocked()) return;
    if (!this.owns(key) || key === this.cur) return;
    this.reloading = 0; // switching weapons (incl. auto-equip of loot/shop buys) cancels an in-progress reload
    this._clearMosinTransient();
    this.models[this.cur].visible = false; if (this.magMeshes[this.cur]) this.magMeshes[this.cur].visible = false;
    this.cur = key;
    this.models[key].visible = true; if (this.magMeshes[key]) this.magMeshes[key].visible = true;
    this.cooldown = 0.1; this.bloom = 0; this._boltLock = 0; this._recoilStreak = 0; // a fresh weapon doesn't inherit the last gun's bolt-cycle lock or recoil climb
    this.game.hud.setWeapon(this); this.game.audio.reloadClick();
  }
  quickMelee() {
    const inv = this.game.inventory; let k = this.meleeKind || 'knife';
    if (inv && !inv.slots.some((s) => s && s.kind === k)) { const m = inv.slots.find((s) => s && WEAPONS[s.kind] && WEAPONS[s.kind].melee); if (m) k = m.kind; } // fall back to whatever melee is actually carried
    if (inv) inv.selectKind(k); else if (this.owns(k)) this.select(k);
  }
  cycle(dir) { this.game.inventory.cycleWheel(dir); } // the wheel scrolls the unified inventory (loadout weapons + backpack)
  // Fortification material — granted by supply drops as inventory items (1 item = 1 placement).
  grantBuildMats(amt) {
    // Fortification material is now carried as inventory items (1 item = 1 placement), not a counter.
    const inv = this.game.inventory;
    for (const k in amt) { for (let n = 0; n < (amt[k] || 0); n++) { if (inv) inv.addToBackpack(k, 1); } }
    if (this.game.hud) this.game.hud.setWeapon(this);
  }
  toggleFireMode() {
    if (this.isThrowLocked()) return;
    const d = this.def();
    if (d.melee || !d.auto) { this.game.audio.dryFire(); return; } // only select-fire weapons toggle
    this.semi[this.cur] = !this.semi[this.cur];
    this.game.audio.reloadClick(); this.game.hud.setWeapon(this);
  }

  _clearMosinTransient() {
    this._boltT = 0; this._boltDur = 0.72; this._boltEjected = false; this._boltClickOpen = false; this._boltClickClose = false;
    this._reloadPlan = null; this._reloadMax = 0;
    const mos = this.models && this.models.mosin && this.models.mosin.userData.mosin;
    if (!mos) return;
    if (mos.bolt && mos.bolt.userData.basePos) {
      mos.bolt.position.copy(mos.bolt.userData.basePos);
      if (mos.bolt.userData.baseRot) mos.bolt.rotation.copy(mos.bolt.userData.baseRot);
      else mos.bolt.rotation.set(0, 0, 0);
    }
    if (mos.clip) mos.clip.visible = false;
    if (mos.round) mos.round.visible = false;
  }

  _beginBoltCycle(d) {
    if (!d || !d.boltAction) return;
    this._boltDur = 0.72;
    this._boltT = this._boltDur;
    this._boltEjected = false;
    this._boltClickOpen = false;
    this._boltClickClose = false;
  }

  _broadcastMosinFoley(k) {
    const mp = this.game && this.game.mp;
    if (!k || !mp || !mp.active || !mp.net) return;
    mp.net.broadcast('weaponfoley', { pid: mp.myId, w: 'mosin', k });
  }

  _playMosinCue(method, eventKey, fallback, ...args) {
    const audio = this.game && this.game.audio;
    if (audio && typeof audio[method] === 'function') audio[method](...args);
    else if (audio && fallback && typeof audio[fallback] === 'function') audio[fallback]();
    this._broadcastMosinFoley(eventKey);
  }

  _ejectMosinCase() {
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const origin = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).normalize();
    const pos = origin.clone().addScaledVector(fwd, 0.56).addScaledVector(right, 0.20).addScaledVector(up, -0.12);
    this.game.effects.shell(pos, right, {
      mesh: 'fiftyCase', size: 0.45, color: 0xc9a64a, life: 2.2, // real brass case mesh (the .50-cal's), scaled down for 7.62×54R — not particle cubes
      sideMin: 2.4, sideMax: 3.7, upMin: 1.0, upMax: 1.9,
    });
    this._playMosinCue('mosinCaseEject', 'caseEject', 'reloadClick');
  }

  startReload() {
    if (this.isThrowLocked()) return;
    const d = this.def();
    if (d.melee || this.reloading > 0 || this.mag[this.cur] >= this.magMax[this.cur] || this.reserve[this.cur] <= 0) return;
    if (d.reloadStyle === 'mosin') { this._startMosinReload(d); return; }
    this.reloading = d.reload * this.game.player.reloadMult; this.game.audio.reloadIn();
  }
  _startMosinReload(d) {
    const key = this.cur;
    const max = this.magMax[key] || d.mag || 1;
    const need = Math.max(0, max - (this.mag[key] || 0));
    const reserve = this.reserve[key];
    const total = reserve === Infinity ? need : Math.min(need, Math.max(0, reserve || 0));
    if (total <= 0) return;
    if (this._boltT > 0 && !this._boltEjected) { this._ejectMosinCase(); this._boltEjected = true; }
    this._boltT = 0;
    const useClip = this.mag[key] === 0 && total >= Math.min(5, max);
    const mult = this.game.player.reloadMult || 1;
    const duration = useClip
      ? (d.clipReload || d.reload || 2.0)
      : (0.42 + total * (d.roundReload || 0.54) + 0.45);
    this._boltClickOpen = false;
    this._boltClickClose = false;
    this._reloadPlan = { key, kind: useClip ? 'clip' : 'single', total, loaded: 0, inserted: false };
    this._reloadMax = Math.max(0.5, duration * mult);
    this.reloading = this._reloadMax;
    this._playMosinCue('mosinReloadStart', 'reloadStart', 'reloadIn', useClip ? 'clip' : 'single');
  }
  _addMosinReloadRounds(plan, amount, click = true) {
    if (!plan || plan.key !== this.cur || amount <= 0) return 0;
    const key = plan.key, max = this.magMax[key] || (WEAPONS[key] && WEAPONS[key].mag) || 1;
    const room = Math.max(0, max - (this.mag[key] || 0));
    const reserve = this.reserve[key];
    const available = reserve === Infinity ? room : Math.max(0, reserve || 0);
    const take = Math.min(amount, room, available);
    if (take <= 0) return 0;
    this.mag[key] = (this.mag[key] || 0) + take;
    if (reserve !== Infinity) this.reserve[key] = Math.max(0, (this.reserve[key] || 0) - take);
    plan.loaded += take;
    if (click) {
      if (plan.kind === 'clip') this._playMosinCue('mosinClipLoad', 'clipLoad', 'reloadClick');
      else this._playMosinCue('mosinRoundInsert', 'roundInsert', 'reloadClick');
    }
    this.game.hud.setWeapon(this);
    return take;
  }
  _tickMosinReload(plan) {
    if (!plan || plan.key !== this.cur) return;
    const total = this._reloadMax || 1;
    const p = clamp(1 - this.reloading / total, 0, 1);
    if (plan.kind === 'clip') {
      if (!plan.inserted && p >= 0.56) {
        this._addMosinReloadRounds(plan, plan.total);
        plan.inserted = true;
      }
      return;
    }
    const start = 0.24, end = 0.80;
    const step = (end - start) / Math.max(1, plan.total);
    while (plan.loaded < plan.total && p >= start + (plan.loaded + 1) * step) {
      if (!this._addMosinReloadRounds(plan, 1)) break;
    }
  }
  _finishMosinReload() {
    if (this._reloadPlan && this._reloadPlan.loaded < this._reloadPlan.total) this._addMosinReloadRounds(this._reloadPlan, this._reloadPlan.total - this._reloadPlan.loaded, false);
    this._reloadPlan = null; this._reloadMax = 0;
    this._playMosinCue('mosinReloadFinish', 'reloadFinish', 'reloadClick'); this.game.hud.setWeapon(this);
  }
  _finishReload() {
    const key = this.cur, d = WEAPONS[key];
    if (d.shellReload) { // pump shotgun: seat one shell, then re-arm for the next unless full / empty / interrupted
      if (this.mag[key] < this.magMax[key] && this.reserve[key] > 0) {
        this.mag[key]++; this.reserve[key]--; this.game.audio.shellInsert();
        if (this.mag[key] < this.magMax[key] && this.reserve[key] > 0) this.reloading = WEAPONS[key].reload * this.game.player.reloadMult;
      }
      this.game.hud.setWeapon(this); return;
    }
    if (d.enBloc) { // en-bloc clip: load a fresh full clip and discard any partial mag (can't top off)
      const take = Math.min(this.magMax[key], this.reserve[key]); this.reserve[key] -= take; this.mag[key] = take;
      this.game.audio.reloadClick(); this.game.hud.setWeapon(this); return;
    }
    const need = this.magMax[key] - this.mag[key];
    if (this.reserve[key] === Infinity) this.mag[key] = this.magMax[key];
    else { const take = Math.min(need, this.reserve[key]); this.mag[key] += take; this.reserve[key] -= take; }
    this.game.audio.reloadClick(); this.game.hud.setWeapon(this);
  }

  tryFire(edge) {
    if (this.isThrowLocked()) return;
    const d = this.def();
    if (d.class === 'tool' || d.class === 'builder') return; // held tools don't fire (flashlight; builders place via build.place)
    if (this.reloading > 0) { // per-shell shotgun reload is interruptible: a press with ≥1 shell chambered cancels it and fires
      if (d.shellReload && edge === 'press' && this.mag[this.cur] > 0) this.reloading = 0;
      else return;
    }
    if (this.cooldown > 0 || this._boltLock > 0) return;
    if (d.melee) {
      // shovel: aiming at the ground → DIG (set intent; carved in update with dt). Aiming elsewhere → swing.
      if (d.dig) { const aim = this._digTarget(d.dig.reach); if (aim) { this._digWanted = true; this._digAim.x = aim.x; this._digAim.z = aim.z; return; } }
      if (edge === 'press' || d.rate) this._melee(d);
      return;
    }
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
    if (this.game.mp.active) { // co-op: an active swing also strikes upright teammates (host-authoritative friendly fire)
      for (const id of this.game.mp.meleeHitPlayers(origin, fwd, d.range, d.arcCos)) {
        this.game.mp.claimPlayerHit(id, d.dmg * mult); hitAny = true;
      }
    }
    for (const s of this.game.build.structures) {                                  // melee also smashes fortifications
      const sx = s.pos.x - origin.x, sz = s.pos.z - origin.z, sd = Math.hypot(sx, sz);
      if (sd > d.range + 1.2) continue;                                            // slack: structures are wide
      if ((sx / (sd || 1)) * fwd.x + (sz / (sd || 1)) * fwd.z < d.arcCos) continue;
      hitAny = true; this.game.build.playerDamage(s, d.dmg * mult);
    }
    if (hitAny) this.game.hud.hitmarker(killed);
  }

  // Shovel dig target: forward ray to the world; a PURE-TERRAIN hit (box null) within reach = the spot
  // to dig. A wall/structure hit (or no ground in front) returns null so the swing melees instead.
  _digTarget(reach) {
    if (!this.game.digManager) return null;
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const dir = this._tmp.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const hit = this.game.world.rayHit(cam.position, dir, reach);
    if (hit && hit.point && !hit.box) return { x: hit.point.x, z: hit.point.z };
    return null;
  }

  // One discrete SCOOP per swing (~scoopTime apart): a fixed shovel-load of dirt (perScoop deep). Hold to
  // repeat. The dig field caps total depth (MAX_DIG) + widens every pit (MIN_DIG_R), so a foxhole stays
  // shallow and walkable — you can ALWAYS climb back out. Host carves + broadcasts; a client requests it.
  _performDig(dt) {
    const d = this.def();
    if (!d.dig || !this.game.digManager) return;
    if (this._digSwingCD > 0) return;                          // still mid-scoop — wait for the next swing
    this._digSwingCD = d.dig.scoopTime || 0.42;
    this._swing = 0.18;                                        // scoop anim
    if (this.game.audio && this.game.audio.noise) this.game.audio.noise(0.1, 0.22, 'lowpass', 360, 0.8);
    const depth = d.dig.perScoop || 0.2, aim = this._digAim;
    const mp = this.game.mp;
    const hostSim = !mp || !mp.active || mp.isHost;
    if (hostSim) this.game.digManager.dig({ x: aim.x, z: aim.z }, { r: d.dig.r, depth, lip: d.dig.lip || 0 });
    else mp.net.send('digreq', { x: +aim.x.toFixed(2), z: +aim.z.toFixed(2), r: d.dig.r, dp: depth });
  }

  _fire(d) {
    if (!(this.game.rules && this.game.rules.infiniteAmmo)) this.mag[this.cur]--; // /gamerule infiniteAmmo true → mag never depletes (no reload, unlimited)
    this.cooldown = 60 / d.rpm;
    if (d.enBloc && this.mag[this.cur] <= 0) this.game.audio.garandPing(); // empty clip ejects with the iconic ping
    const _climb = 1 + this._recoilStreak * (d.recoilClimb || 0);
    this.bloom = Math.min(this.bloom + d.bloom * _climb, 0.09);
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const origin = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = this._tmp.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const right = this._tmp2.set(1, 0, 0).applyQuaternion(cam.quaternion).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).normalize();
    const muzzle = origin.clone().addScaledVector(fwd, 1.0).addScaledVector(right, 0.16).addScaledVector(up, -0.1);
    this.game.effects.muzzleFlash(muzzle, fwd, d.class === 'shotgun' || d.class === 'launcher' ? 1.6 : 1);
    if (d.class !== 'launcher' && !d.boltAction) this.game.effects.shell(muzzle.clone().addScaledVector(right, -0.08), right);
    if (this.cur === 'mosin' && this.game.audio && typeof this.game.audio.mosinShot === 'function') this.game.audio.mosinShot();
    else this.game.audio.gunshot(SOUND_BY_CLASS[d.class] || SOUND_BY_CLASS.pistol);
    if (d.class !== 'launcher') { const _mp = this.game.mp; if (_mp && _mp.active) _mp.net.broadcast('shot', { pid: _mp.myId, p: [muzzle.x, muzzle.y, muzzle.z], d: [fwd.x, fwd.y, fwd.z], cls: d.class, w: this.cur, col: d.accent }); } // teammates see/hear your gunfire (launchers show via the slow 'proj' rocket ghost instead of an instant tracer)

    if (d.class === 'launcher') { // fire a rocket projectile that explodes on impact
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.55), new THREE.MeshLambertMaterial({ color: 0x394b2e }));
      mesh.position.copy(muzzle); mesh.quaternion.copy(cam.quaternion);
      this.game.engine.scene.add(mesh);
      const rvel = fwd.clone().multiplyScalar(58), rrad = d.explodeRadius || 7;
      this.projectiles.push({ mesh, vel: rvel, fuse: 4, rocket: true, radius: rrad, dmg: d.explodeDmg || 230 });
      { const mp = this.game.mp; if (mp && mp.active) mp.net.broadcast('proj', { pid: mp.myId, kind: 'rocket', p: [+muzzle.x.toFixed(2), +muzzle.y.toFixed(2), +muzzle.z.toFixed(2)], v: [+rvel.x.toFixed(2), +rvel.y.toFixed(2), +rvel.z.toFixed(2)], r: rrad }); } // teammates render a ghost so they see it fly
      this.recoilKick = Math.min(this.recoilKick + 0.28, 0.4); this.recoilPitch += 0.06;
      this.game.hud.setWeapon(this);
      return;
    }

    if (d.apfsds) { // DEMO APFSDS cannon — long-rod penetration (no explosion); routes to destruct
      this._fireAPFSDS(muzzle, fwd, d);
      this.recoilKick = Math.min(this.recoilKick + 0.20, 0.4); this.recoilPitch += 0.05;
      this.game.hud.setWeapon(this);
      return;
    }

    const spread = (d.spread + this.bloom) * (this.ads ? 0.4 : 1);
    const mult = this.effMult(this.cur);
    for (let p = 0; p < d.pellets; p++) {
      const dir = fwd.clone();
      dir.x += rr(-spread, spread); dir.y += rr(-spread, spread); dir.z += rr(-spread, spread);
      dir.normalize();
      this._marchPellet(muzzle, dir, d, mult);
    }
    // advance the feed magazine one round per shot (DP-28 pan indexes; full-auto = rapid steps)
    const sm = d.spinMag; if (sm && sm.step && this.magMeshes[this.cur]) this.magMeshes[this.cur]._targetRot += sm.step;
    if (d.boltAction) this._beginBoltCycle(d); // Mosin 91/30 — codex bolt-cycle (anim + mosin foley)
    this.recoilKick = Math.min(this.recoilKick + d.recoil * 0.05 * _climb, 0.35);
    this.recoilPitch += d.recoil * (0.6 + Math.random() * 0.5) * 0.01 * _climb;
    if (d.recoilYaw) this.recoilYawKick += (Math.random() < 0.5 ? -1 : 1) * d.recoil * d.recoilYaw * 0.004 * _climb;
    this._recoilStreak = Math.min(this._recoilStreak + 1, 30);
    if (d.boltCycle) { this._boltLock = d.boltCycle; this.game.audio.boltCycle(); }
    this.game.hud.setWeapon(this);
  }

  // ── #1 pierce-march: one pellet punches THROUGH soft cover into the target behind ──
  // A round marches along its ray: PENETRABLE soft cover (glass / wood / sheet-metal / foliage —
  // fragile, tier ≤ FRAGILE_MAX_TIER, and THIS weapon out-pens it) is carved and the ray CONTINUES
  // past it losing energy per layer; HARD cover (brick+, fortifications, FAB, terrain) and any BODY
  // (enemy / teammate) STOP it. Replaces the old single-first-hit resolve. Closest-first priority
  // (player → enemy → world) is preserved exactly; only the soft-cover "continue" is new.
  _marchPellet(muzzle, dir, d, mult) {
    const SOFT_BUDGET = 3, SOFT_FALLOFF = 0.82;           // ≤3 energy-sapping soft layers; bullets keep most energy
    let dmg = d.dmg * mult, soft = 0;
    const ignored = [];                                   // soft cover already carved this pellet — never re-hit it
    // Ray ORIGIN stays at the muzzle; carved soft boxes are excluded from each pass via world.rayHit's
    // `ignore` arg. That way a THICK soft object (a tree trunk) is hit exactly once — no crawling the
    // ray forward 6 cm at a time (which used to re-damage a fat trunk every pass) and no per-pass alloc.
    for (let guard = 0; guard < 12; guard++) {            // backstop: ignored[] grows each pass, so this always ends
      const eHit = this.game.enemies.rayHit(muzzle, dir, d.range);
      const wHit = this.game.world.rayHit(muzzle, dir, d.range, ignored.length ? ignored : null);
      const pHit = this.game.mp.active ? this.game.mp.rayHitPlayers(muzzle, dir, d.range) : null;
      if (pHit && (!eHit || pHit.dist <= eHit.dist) && (!wHit || pHit.dist <= wHit.dist)) {
        this.game.mp.claimPlayerHit(pHit.id, dmg * (pHit.head ? 2.0 : 1.0));
        this.game.effects.tracer(muzzle, pHit.point, d.accent); this.game.hud.hitmarker(false);
        return;
      }
      if (eHit && (!wHit || eHit.dist <= wHit.dist)) {     // a body always stops the round
        const hs = eHit.head && !eHit.enemy.def.boss;      // no headshot cheese on the boss — head = body
        const killed = this.game.enemies.damage(eHit.enemy, dmg * (hs ? 2.0 : 1.0), 'gun', eHit.point);
        this.game.effects.tracer(muzzle, eHit.point, d.accent);
        if (hs) { this.game.audio.headshot(); this.game.hud.hitmarker(true); }
        else { this.game.audio.hitMarker(); this.game.hud.hitmarker(killed); }
        return;
      }
      if (wHit) {
        const box = wHit.box;
        if (box && box.downer && soft < SOFT_BUDGET && this._softPenetrable(box, d)) {
          this._destructHit(wHit, dir, d, dmg / (d.dmg || 1));   // carve soft cover with the marched (decayed) energy
          ignored.push(box);                                     // exclude it from the next pass (hit each cover once)
          if (box.dmat !== 'glass') { dmg *= SOFT_FALLOFF; soft++; }   // glass is a free pass (like APFSDS); wood/metal sap energy
          if (dmg < 2) { this.game.effects.tracer(muzzle, wHit.point, d.accent); return; }   // round spent inside the cover
          continue;
        }
        // hard world hit — original handling, then STOP
        this.game.effects.tracer(muzzle, wHit.point, d.accent); this.game.effects.impact(wHit.point, wHit.normal, 'spark');
        if (box && box.struct && box._ref) { this.game.build.playerDamage(box._ref, dmg); this.game.hud.hitmarker(false); }       // fortifications
        else if (box && box.explodable && this.game.world.hitFAB) { this.game.world.hitFAB(box.explodable, dmg, wHit.point); this.game.hud.hitmarker(false); } // FAB-500
        else if (box && box.downer) { this._destructHit(wHit, dir, d, dmg / (d.dmg || 1)); }   // hard destructible (brick cell / wall)
        return;
      }
      break;                                              // nothing left on the ray
    }
    this.game.effects.tracer(muzzle, muzzle.clone().addScaledVector(dir, d.range), d.accent);   // spent / edge round → range end
  }

  // A world box is soft cover a round punches THROUGH (vs stops at): a destructible whose material is
  // fragile (tier ≤ FRAGILE_MAX_TIER — glass/wood/sheet-metal/foliage) AND which THIS weapon out-pens.
  // Brick+ cells, fortifications, FABs and terrain are never soft, so they stop the round.
  _softPenetrable(box, d) {
    if (!box.downer || box.struct || box.explodable) return false;
    // Trees decide by SHAPE, not material: you shoot THROUGH leaves (canopy/bush/fallen crown = soft cover)
    // but a trunk STOPS the round — standing OR a fallen log's bole — for every weapon class (snipers
    // included). Otherwise a canopy + trunk share one dmat ('trunk' t2): rifles stalled on leaves while
    // snipers drilled clean through solid trunks.
    if (box.foliage) return true;
    if (box.tree) return false;
    const m = MATERIALS[box.dmat]; if (!m) return false;
    const pen = PEN_BY_CLASS[d.class] ?? 0;
    return m.tier <= FRAGILE_MAX_TIER && pen >= m.tier;
  }

  // ── ?map=demo destruction routing (Phase 9 keystone) ───────────────────────────
  // A bullet/pellet whose world hit `box` carries destructible metadata (box.downer):
  //   • box.building → the destructible building (glass pane / wood door / brick segment) →
  //     building.applyHit() resolves the part (pen<tier ⇒ cosmetic; else HP damage → death).
  //   • box.tree / box.dmat==='trunk' → a forest tree → resolveHit on its trunk part; if the
  //     trunk dies, forest.fellTree() topples it AWAY from the shot (debris on a non-fatal chip).
  // Host-authoritative (the resolve mutates the shared, seeded part model → Phase 10 syncs the event).
  _destructHit(wHit, dir, d, mult) {
    const box = wHit.box; if (!box || !box.downer) return;
    const hostSim = !this.game.mp.active || this.game.mp.isHost;
    if (!hostSim) return;                                   // destruction is host-authoritative
    const w = { pen: PEN_BY_CLASS[d.class] ?? 0, dmg: (d.dmg || 0) * mult };
    if (box.building && typeof box.downer.applyHit === 'function') {
      box.downer.applyHit(wHit.point, wHit.normal, dir, w);
      this.game.hud.hitmarker(false);
    } else if ((box.tree || box.dmat === 'trunk') && box.downer.part) {
      const tree = box.downer, part = tree.part;
      if (!part || part.dead) return;
      const r = resolveHit(part, w);
      if (r.killed && this.game.forest && (tree.standing || tree.fallen)) {
        // standing → topple away from the shot; a fallen LOG → fellTree routes rec.fallen to _breakLog
        // (splinter + remove), so you can finally shoot a downed log apart, not just stop the round on it.
        this.game.forest.fellTree(tree, [dir.x, dir.z], (tree.id * 2654435761) >>> 0);
      } else if (r.effect === 'damage' && this.game.forest && this.game.forest.debris) {
        this.game.forest.debris.burst('splints', [wHit.point.x, wHit.point.y, wHit.point.z], (tree.id ^ 0x55) >>> 0);
      }
      this.game.hud.hitmarker(false);
    } else if (box.prop && box.downer) {
      this.game.forest && this.game.forest.hitProp(box.downer, w, [wHit.point.x, wHit.point.y, wHit.point.z]);
      this.game.hud.hitmarker(false);
    }
  }

  // APFSDS long-rod: a tracer along the aim ray, then OBLITERATE every standing tree the rod
  // passes through (fragile trunk, tier 2), and through the building leave through-holes in
  // brick (wall stays) + a spall cone that shatters glass behind. Damages the first enemy hit.
  _fireAPFSDS(origin, dir, d) {
    this.game.effects.tracer(origin, origin.clone().addScaledVector(dir, d.range), d.accent);
    const eHit = this.game.enemies.rayHit(origin, dir, d.range);
    if (eHit) { const k = this.game.enemies.damage(eHit.enemy, d.dmg, 'gun', eHit.point); this.game.hud.hitmarker(k); }
    const hostSim = !this.game.mp.active || this.game.mp.isHost;
    if (!hostSim) return;                                   // host-authoritative destruction
    const w = CALIBERS.apfsds;
    const b = this.game.world.demoBuilding;
    if (b && typeof b.applyPenetration === 'function') b.applyPenetration(origin, dir, w);
    if (this.game.forest && typeof this.game.forest.penetrate === 'function') this.game.forest.penetrate(origin, dir, d.range, w);
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
    const vel = fwd.clone().multiplyScalar(20).add(new THREE.Vector3(0, 3, 0));
    const radius = 7;
    this.projectiles.push({ mesh, vel, fuse: 1.6, radius, dmg: 220 });
    { const mp = this.game.mp; if (mp && mp.active) mp.net.broadcast('proj', { pid: mp.myId, kind: 'grenade', p: [+mesh.position.x.toFixed(2), +mesh.position.y.toFixed(2), +mesh.position.z.toFixed(2)], v: [+vel.x.toFixed(2), +vel.y.toFixed(2), +vel.z.toFixed(2)], r: radius }); } // teammates render a ghost so they see it fly
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
      this.game._spawnMolotovPool(hit); this.game.audio.uiClick();
      { const mp = this.game.mp; if (mp && mp.active) mp.net.broadcast('fx', { e: 'expl', p: [+hit.x.toFixed(2), +hit.y.toFixed(2), +hit.z.toFixed(2)], s: 1.2 }); } // wall-shatter has no 'proj' ghost — show the flash to teammates
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
    const mvel = fwd.clone().multiplyScalar(MOLO_THROW_SPEED).add(new THREE.Vector3(0, MOLO_THROW_LIFT, 0));
    this.projectiles.push({ mesh, flame, molotov: true, fuse: MOLO_MAX_FLIGHT, trailT: 0,
      vel: mvel,
      spin: new THREE.Vector3(rr(8, 14), rr(-3, 3), rr(4, 8)) });
    { const mp = this.game.mp; if (mp && mp.active) mp.net.broadcast('proj', { pid: mp.myId, kind: 'molotov', p: [+mesh.position.x.toFixed(2), +mesh.position.y.toFixed(2), +mesh.position.z.toFixed(2)], v: [+mvel.x.toFixed(2), +mvel.y.toFixed(2), +mvel.z.toFixed(2)], r: 1.2 }); } // teammates render a ghost so they see it arc
    this.game.audio.uiClick();
  }
  _shatterInHand() {
    this.molotovState = null; this.molotovCD = 0.6; this.molotovModel.visible = false; this.molotovRagFlame.scale.setScalar(0);
    if (this.game.inventory && this._throwSlot != null) { const s = this._throwSlot; this._throwSlot = null; this.game.inventory._consumeSlot(s); }
    this.game.hud.setWeapon(this);
    { const mp = this.game.mp; // initial 20 damage routes authoritatively via _takeSurvivalDamage; this adds the lingering burn DoT
      if (mp && mp.active) { if (mp.isHost) { const s = mp.pstate.get('host'); if (s) s.burnT = PLAYER_BURN_DUR; } else mp.net.send('ignite', {}); }
      else this.game.player.burnT = PLAYER_BURN_DUR; } // solo: local burnT (survivalTick DoT, unchanged)
    this.game.player._takeSurvivalDamage(20, 1);
    const ip = this.game.player.pos.clone().setY(0.5);
    this.game.effects.explosion(ip, 1.0);
    this.game.hud.toast('🔥 The bottle shattered in your hand!', 0xff5a26);
    { const mp = this.game.mp; if (mp && mp.active) mp.net.broadcast('fx', { e: 'expl', p: [+ip.x.toFixed(2), +ip.y.toFixed(2), +ip.z.toFixed(2)], s: 1.2 }); } // in-hand shatter has no 'proj' ghost — show the flash to teammates
  }

  refillAll() {
    for (const k of WEAPON_ORDER) {
      if (!this.owns(k) || WEAPONS[k].melee) continue;
      const rm = WEAPONS[k].reserveMax;
      // top up to at least the base reserve, but NEVER strip ammo already hoarded past it
      // (reserve is uncapped now — see refillHeld) so a refill consumable can't be a downgrade.
      this.reserve[k] = rm === Infinity ? Infinity : Math.max(this.reserve[k] || 0, rm);
      this.mag[k] = this.magMax[k];
    }
    if (this.game.hud) this.game.hud.setWeapon(this);
  }

  // A ground-found ammo box tops up ONLY the weapon currently in hand — you choose which gun gets it
  // by holding it when you grab the box. Adds 25% of that gun's base reserve, rounded UP to a whole
  // number of magazines. Reserve is UNCAPPED — boxes keep stacking ammo with no ceiling, so the only
  // rejects are melee/tool/builder/infinite-ammo (those can't use a box); a firearm is never "full".
  // Returns { ok:true, key } on a refill, or { ok:false, reason } so the caller can leave the box.
  // non-mutating: can the gun currently in hand take more reserve ammo? (used as a co-op pre-grab guard so we
  // don't claim a shared ammo box we can't actually use). Mirrors refillHeld's reject conditions.
  heldRefillable() {
    const held = this.game.inventory ? this.game.inventory.curItem() : null;
    const key = held && held.kind, d = key && WEAPONS[key];
    if (!d || d.melee || d.class === 'tool' || d.class === 'builder') return false;
    if (this.reserve[key] === Infinity || d.reserveMax === Infinity) return false;
    return true; // reserve is uncapped — a firearm can always accept more ammo
  }
  refillHeld() {
    const held = this.game.inventory ? this.game.inventory.curItem() : null;
    const key = held && held.kind, d = key && WEAPONS[key];
    if (!d || d.melee || d.class === 'tool' || d.class === 'builder') return { ok: false, reason: 'noweapon' };
    if (this.reserve[key] === Infinity || d.reserveMax === Infinity) return { ok: false, reason: 'infinite' };
    const mag = this.magMax[key] || d.mag || 1;
    const give = Math.ceil((d.reserveMax * 0.25) / mag) * mag;   // 25% of base reserve, rounded up to whole mags
    this.reserve[key] = (this.reserve[key] || 0) + give;         // uncapped — keep stacking ammo
    if (this.game.hud) this.game.hud.setWeapon(this);
    return { ok: true, key };
  }

  _smooth01(x) {
    x = clamp(x, 0, 1);
    return x * x * (3 - 2 * x);
  }
  _mosinBoltCurve(p) {
    const e = (x) => this._smooth01(x);
    if (p < 0.17) return { lift: e(p / 0.17), back: 0 };
    if (p < 0.42) return { lift: 1, back: e((p - 0.17) / 0.25) };
    if (p < 0.62) return { lift: 1, back: 1 };
    if (p < 0.84) return { lift: 1, back: 1 - e((p - 0.62) / 0.22) };
    return { lift: 1 - e((p - 0.84) / 0.16), back: 0 };
  }
  _mosinReloadBoltCurve(p) {
    const e = (x) => this._smooth01(x);
    if (p < 0.16) return { lift: e(p / 0.16), back: 0 };
    if (p < 0.28) return { lift: 1, back: e((p - 0.16) / 0.12) };
    if (p < 0.78) return { lift: 1, back: 1 };
    if (p < 0.90) return { lift: 1, back: 1 - e((p - 0.78) / 0.12) };
    return { lift: 1 - e((p - 0.90) / 0.10), back: 0 };
  }
  _applyMosinBolt(mos, pose) {
    if (!mos || !mos.bolt || !mos.bolt.userData.basePos) return;
    const base = mos.bolt.userData.basePos;
    const liftTravel = mos.bolt.userData.liftTravel || 0.018;
    const backTravel = mos.bolt.userData.backTravel || 0.18;
    const baseRot = mos.bolt.userData.baseRot;
    const boltRotTravel = mos.bolt.userData.boltRotTravel || 0.96;
    mos.bolt.position.set(base.x, base.y + pose.lift * liftTravel, base.z + pose.back * backTravel);
    if (baseRot) mos.bolt.rotation.set(baseRot.x, baseRot.y, baseRot.z + pose.lift * boltRotTravel);
    else mos.bolt.rotation.z = pose.lift * boltRotTravel;
  }
  _updateMosinAnim(dt) {
    const model = this.models && this.models.mosin;
    const mos = model && model.userData.mosin;
    if (!mos) return;
    const isMosin = this.cur === 'mosin';
    const clip = mos.clip, round = mos.round;
    if (clip) clip.visible = false;
    if (round) round.visible = false;

    let pose = { lift: 0, back: 0 };
    if (isMosin && this._reloadPlan) {
      const p = clamp(1 - this.reloading / (this._reloadMax || 1), 0, 1);
      pose = this._mosinReloadBoltCurve(p);
      const plan = this._reloadPlan;
      if (!this._boltClickOpen && p >= 0.12) { this._boltClickOpen = true; this._playMosinCue('mosinBoltOpen', 'boltOpen', 'reloadClick'); }
      if (!this._boltClickClose && p >= 0.86) { this._boltClickClose = true; this._playMosinCue('mosinBoltClose', 'boltClose', 'reloadClick'); }
      if (plan.kind === 'clip' && clip && p >= 0.15 && p <= 0.70) {
        const down = this._smooth01((p - 0.22) / 0.34);
        const out = this._smooth01((p - 0.58) / 0.12);
        clip.visible = true;
        if (mos.charger) { // GLB: charger-local — the vertical clip drops straight down into the charger guide, then withdraws (procedural-style)
          clip.position.set(0.003 * Math.sin(p * Math.PI * 6), 0.120 - down * 0.120 + out * 0.095, 0.004 + down * 0.010);
          clip.rotation.set(-0.26 + down * 0.14, 0, 0.05 * Math.sin(p * Math.PI * 2));
        } else {
          clip.position.set(0.004 * Math.sin(p * Math.PI * 6), 0.250 - down * 0.150 + out * 0.085, -0.030 + down * 0.038);
          clip.rotation.set(-0.30 + down * 0.18, 0, 0.08 * Math.sin(p * Math.PI * 2));
        }
      } else if (plan.kind === 'single' && round && plan.loaded < plan.total) {
        const start = 0.20, end = 0.80;
        const step = (end - start) / Math.max(1, plan.total);
        const idx = Math.min(plan.loaded, plan.total - 1);
        const u = clamp((p - (start + idx * step)) / step, 0, 1);
        if (p >= start - 0.05 && p <= end + 0.08) {
          const s = this._smooth01(u);
          round.visible = true;
          if (mos.charger) { // GLB: charger-local — a single vertical cartridge thumbed down into the chamber
            round.position.set(0.045 - s * 0.045, 0.105 - s * 0.105, 0.004);
            round.rotation.set(-0.22 + s * 0.12, 0, 0.30 - s * 0.55);
          } else {
            round.position.set(0.072 - s * 0.060, 0.238 - s * 0.145, -0.040 + s * 0.050);
            round.rotation.set(-0.28 + s * 0.18, 0, 0.32 - s * 0.62);
          }
        }
      }
    } else if (isMosin && this._boltT > 0) {
      this._boltT = Math.max(0, this._boltT - dt);
      const p = clamp(1 - this._boltT / (this._boltDur || 0.72), 0, 1);
      pose = this._mosinBoltCurve(p);
      if (!this._boltClickOpen && p >= 0.18) { this._boltClickOpen = true; this._playMosinCue('mosinBoltOpen', 'boltOpen', 'reloadClick'); }
      if (!this._boltEjected && p >= 0.36) { this._boltEjected = true; this._ejectMosinCase(); }
      if (!this._boltClickClose && p >= 0.78) { this._boltClickClose = true; this._playMosinCue('mosinBoltClose', 'boltClose', 'reloadClick'); }
    }
    this._applyMosinBolt(mos, pose);
  }

  // --- ЛПР-1 «Каралон-М» laser rangefinder (realistic-lite per ТТХ, models/lpr1/ref/dossier.json) ---
  get lprRaised() { const d = this.def(); return !!(d && d.rangefinder && this.ads); } // T only fires while glassing through it (same gate idea as the ННП-23 branch toggle)
  lprMeasure() {
    if (!this.lprRaised) return;
    if (this.lprCD > 0) return;                       // green готовность lamp still dark — 0.2 Hz cycle (ТТХ row 16)
    this.lprCD = 5;
    const cam = this.game.engine.camera;
    const origin = cam.getWorldPosition(this._tmp);
    const dir = cam.getWorldDirection(this._tmp2);
    // The beam catches whatever a bullet would, PLUS terrain: world.rayHit marches the heightfield
    // (_rayTerrain) on terrain maps and falls to the ground plane on flat ones — so hills/slopes range
    // correctly. Also enemies + co-op teammates (force=true: ranging an ally isn't shooting them).
    const wHit = this.game.world.rayHit(origin, dir, 20000);
    const eHit = this.game.enemies.rayHit(origin, dir, 20000);
    const pHit = this.game.mp.active ? this.game.mp.rayHitPlayers(origin, dir, 20000, true) : null;
    const dist = Math.min(wHit ? wHit.dist : Infinity, eHit ? eHit.dist : Infinity, pHit ? pHit.dist : Infinity);
    // Min 1 m (our maps are sub-km — the real 145 m strobe floor would read 00000 everywhere); 20 km
    // counter cap kept. Outside that → zeros (no echo), like the real indicator.
    this.lprValue = (isFinite(dist) && dist >= 1 && dist <= 20000) ? Math.round(dist) : 0;
    this.game.audio.lprPulse();                       // ИЗМЕРЕНИЕ click + capacitor whine
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this._boltLock > 0) this._boltLock -= dt;
    if (this.grenadeCD > 0) this.grenadeCD -= dt;
    if (this.lprCD > 0) { this.lprCD -= dt; if (this.lprCD <= 0 && this.cur === 'lpr1') this.game.audio.lprReady(); } // готовность beep on the relight edge
    if (this.molotovCD > 0) this.molotovCD -= dt;
    if (this._swing > 0) this._swing -= dt;
    if (this._digSwingCD > 0) this._digSwingCD -= dt;          // scoop cadence
    if (this._digWanted) { this._performDig(dt); this._digWanted = false; } // tryFire set it this frame; scoop when the cadence allows
    if (this.reloading > 0) {
      this.reloading = Math.max(0, this.reloading - dt);
      if (this._reloadPlan) this._tickMosinReload(this._reloadPlan);
      if (this.reloading <= 0) {
        if (this._reloadPlan) this._finishMosinReload();
        else this._finishReload();
      }
    }
    this.bloom = damp(this.bloom, 0, 6, dt);
    this.recoilKick = damp(this.recoilKick, 0, 12, dt);
    this.recoilPitch = damp(this.recoilPitch, 0, 10, dt);
    this.recoilYawKick = damp(this.recoilYawKick, 0, 10, dt);
    this._recoilStreak = Math.max(0, this._recoilStreak - dt * 8);

    // ADS / scope
    const d = this.def();
    this.ads = this.game.input.buttons[2] && !d.melee && d.class !== 'builder' && (d.class !== 'tool' || d.zoom); // binoculars (zoom tool) can ADS; flashlight can't
    if (this._boltLock > 0 && d.scope) this.ads = false; // working the bolt kicks you out of the scope until the cycle finishes
    const baseFov = (this.game.settings && this.game.settings.data.fov) || 80;
    const targetFov = this.ads ? (d.adsFov || 60) : baseFov;
    this.fov = damp(this.fov, targetFov, 16, dt);
    this.game.engine.setFov(this.fov);
    this.game.hud.setScope(this.ads && d.scope, d.shape);
    if (this.game.hud.setLpr) {
      const night = this.game._worldClock ? isNight(this.game._worldClock.minuteOfDay()) : false; // ПОДСВ: reticle lamp comes on after dark
      this.game.hud.setLpr(this.ads && d.rangefinder ? { ready: this.lprCD <= 0, value: this.lprValue, night } : null);
    }

    // буссоль ПАБ-2А: RMB raises the угломер compass overlay (no FOV zoom). Pure LOCAL read of
    // player.yaw + pos through the shared datum (bearing.js) → identical on every co-op client.
    if (d.shape === 'bussole') {
      const plr = this.game.player;
      this._compassUp = !!this.game.input.buttons[2];
      this.game.hud.setCompass(this._compassUp ? { mils: yawToMils(plr.yaw), x: plr.pos.x, z: plr.pos.z } : null);
    } else if (this._compassUp) { this.game.hud.setCompass(null); this._compassUp = false; }

    // viewmodel bob/sway/recoil/swing
    const pl = this.game.player;
    const moving = pl.onGround && (Math.abs(pl.vel.x) + Math.abs(pl.vel.z)) > 1.5;
    this._bobT += dt * (moving ? 9 : 3);
    const bobX = Math.cos(this._bobT) * (moving ? 0.012 : 0.004);
    const bobY = Math.abs(Math.sin(this._bobT)) * (moving ? 0.016 : 0.004);
    const reloadTotal = this._reloadMax || (d.reload * pl.reloadMult) || 1;
    const reloadDip = this.reloading > 0 ? -0.12 * Math.sin((1 - this.reloading / reloadTotal) * Math.PI) : 0;
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

    // flashlight press-button: pops UP when the beam is off, sinks DOWN (pressed) when it's on
    const flBtn = this.models.flashlight && this.models.flashlight.userData.flashBtn;
    if (flBtn) { const t = (this.game.dayNight && this.game.dayNight.flashOn) ? flBtn.userData.downY : flBtn.userData.upY; flBtn.position.y = damp(flBtn.position.y, t, 22, dt); }
    this._updateMosinAnim(dt);

    // grenades
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const g = this.projectiles[i];
      g.fuse -= dt;
      let boom = g.fuse <= 0;
      let shatterAt = null, rocketAt = null;
      if (g.molotov) { // arcs with gravity + spins; raycasts EVERY frame so it can't tunnel walls
        g.vel.y -= MOLO_GRAV * dt;
        const dir = this._tmp.copy(g.vel).normalize(), stepLen = g.vel.length() * dt;
        const wh = this.game.world.rayHit(g.mesh.position, dir, stepLen + MOLO_PROJ_R);
        if (wh) { shatterAt = wh.point.clone().addScaledVector(wh.normal, OCCLUSION_INSET); boom = true; }
        if (!boom) for (const e of this.game.enemies.active) { if (!e.alive) continue; const rp = g.mesh.position; if (Math.hypot(e.pos.x - rp.x, e.pos.z - rp.z) < e.radius + MOLO_PROJ_R && rp.y < e.pos.y + e.height + 0.4) { shatterAt = rp.clone(); boom = true; break; } }
        if (!boom) { g.mesh.position.addScaledVector(g.vel, dt); g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt; g.mesh.rotation.z += g.spin.z * dt; g.trailT -= dt; if (g.trailT <= 0) { g.trailT = 0.04; this.game.effects.firePool(g.mesh.position, 0.3, 0.6); } }
        else if (!shatterAt) shatterAt = g.mesh.position.clone();
      } else if (g.rocket) { // straight, fast, detonates on contact — raycast BEFORE moving (like the molotov) so a fast rocket can't tunnel a thin (~0.45 m) wall and overshoot
        const dir = this._tmp.copy(g.vel).normalize(), stepLen = g.vel.length() * dt;
        const wh = this.game.world.rayHit(g.mesh.position, dir, stepLen + 0.5, (b) => !b.foliage);   // fly THROUGH soft foliage (leaves/bushes/canopy) — detonate on the solid trunk/wall/ground behind, not on a leaf mid-air
        if (wh) { rocketAt = wh.point.clone().addScaledVector(wh.normal, OCCLUSION_INSET); boom = true; }   // detonate EXACTLY on the surface it strikes (wall/tree/prop), not a frame past it — so the blast is centred on what you aimed at
        if (!boom) for (const e of this.game.enemies.active) { if (!e.alive) continue; const rp = g.mesh.position; if (Math.hypot(e.pos.x - rp.x, e.pos.z - rp.z) < e.radius + 0.7 && rp.y < e.pos.y + e.height + 0.5) { rocketAt = rp.clone(); boom = true; break; } }
        if (!boom) { g.mesh.position.addScaledVector(g.vel, dt); const rp = g.mesh.position; if (rp.y < this.game.world.groundY(rp.x, rp.z) + 0.2) { rocketAt = rp.clone(); boom = true; } }   // nothing in the step → advance, then detonate on the terrain surface (groundY≡0 on flat maps)
        this.game.effects.impact(g.mesh.position, dir, 'spark'); // smoke trail
      } else { // tossed grenade: gravity + bounce
        g.vel.y -= 22 * dt; g.mesh.position.addScaledVector(g.vel, dt);
        g.mesh.rotation.x += dt * 6; g.mesh.rotation.y += dt * 4;
        const gy = this.game.world.groundY(g.mesh.position.x, g.mesh.position.z);   // bounce on the terrain surface (groundY≡0 on flat maps)
        if (g.mesh.position.y < gy + 0.11) { g.mesh.position.y = gy + 0.11; g.vel.y *= -0.4; g.vel.x *= 0.6; g.vel.z *= 0.6; }
      }
      if (boom) {
        if (g.molotov) {
          const mpos = shatterAt || g.mesh.position.clone();
          this.game.effects.explosion(mpos.clone(), 1.2); this.game.effects.firePool(mpos, 1.6, 1.4);
          this.game._spawnMolotovPool(mpos);
        } else {
          // bazooka = near-full dmg to Tolo (rocket 0.9×), grenades chip like bullets (0.2×). explode()
          // owns visual+enemy AoE+player splash (FF)+item clearing+demo destruction and the host/client split.
          // rocketAt = the contact point from the pre-move raycast (centres the breach on the wall); grenades fall back to their mesh position (fuse detonation).
          const bpos = rocketAt || g.mesh.position.clone();
          this.game.explode(bpos, { radius: g.radius, dmg: g.dmg, source: g.rocket ? 'rocket' : 'explosion', isRocket: !!g.rocket });
        }
        this.game.engine.scene.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose();
        if (g.flame) { g.flame.geometry.dispose(); g.flame.material.dispose(); }
        this.projectiles.splice(i, 1);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// MountedGun — a fixed heavy machine gun on a rooftop. Animated feed belt
// (live rounds in) + ejecting casings (other side) + a barrel that glows,
// shifts colour and smokes as it heats up.
// ---------------------------------------------------------------------------
const MOUNTED_GUN_SPECS = {
  m2hb: {
    variant: 'm2hb',
    displayName: '.50 cal',
    hudName: '.50 CAL M2HB',
    shortName: '.50 CAL',
    maxAmmo: 250,
    dmg: 65,
    rpm: 600,
    range: 380,
    spread: 0.012,
    heatPerShot: 0.02,
    coolRate: 0.3,
    recoilKick: 0.035,
    recoilMax: 0.07,
    shakeKick: 0.0045,
    shakeMax: 0.013,
    muzzleFlash: 2.2
  },
  dshk: {
    variant: 'dshk',
    displayName: 'DShK',
    hudName: 'DShK 1938',
    shortName: 'DShK',
    maxAmmo: 200,
    dmg: 78,
    rpm: 540,
    range: 430,
    spread: 0.010,
    heatPerShot: 0.024,
    coolRate: 0.27,
    recoilKick: 0.042,
    recoilMax: 0.085,
    shakeKick: 0.0055,
    shakeMax: 0.016,
    muzzleFlash: 2.45
  }
};

export class MountedGun {
  constructor(game, pos, yaw, opts = {}) {
    this.game = game;
    const baseSpec = MOUNTED_GUN_SPECS[opts.variant] || MOUNTED_GUN_SPECS.m2hb;
    this.spec = { ...baseSpec, ...opts };
    this.id = this.spec.id || this.spec.variant || 'mountedGun';
    this.variant = this.spec.variant;
    this.displayName = this.spec.displayName;
    this.hudName = this.spec.hudName;
    this.shortName = this.spec.shortName;
    this.base = pos.clone();
    this.baseYaw = yaw; this.yaw = yaw; this.pitch = 0;
    this.heat = 0; this.overheated = false; this.cd = 0; this.readyToFire = true;
    this.maxAmmo = this.spec.maxAmmo; this.ammo = this.maxAmmo;
    this.dmg = this.spec.dmg; this.rpm = this.spec.rpm; this.range = this.spec.range; this.spread = this.spec.spread;
    this.heatPerShot = this.spec.heatPerShot; this.coolRate = this.spec.coolRate;
    this.recoilKick = this.spec.recoilKick; this.recoilMax = this.spec.recoilMax;
    this.shakeKick = this.spec.shakeKick; this.shakeMax = this.spec.shakeMax;
    this.muzzleFlashScale = this.spec.muzzleFlash;
    this.pivot = pos.clone(); this.pivot.y += 1.05;
    this.beltRounds = []; this._smokeT = 0;
    this.occupant = null; // co-op: id currently manning the gun (null / 'host' / a peer id); host-authoritative
    this._aimT = 0;       // throttle timer for the aim broadcast
    this._nearWas = false;
    this._roundSeq = 0;   // every third .50 BMG round gets a warmer tracer color
    this._build();
  }

  _build() {
    if (this.variant === 'dshk') { this._buildDshk(); return; }
    const scene = this.game.engine.scene;
    // palette: worn blued steel + olive .50cal ammo can + brass belt
    const bHi = 0x565d68, bMid = 0x414853, bLo = 0x2c313a, bSlot = 0x1a1e24, bBright = 0x6f7886; // worn blued steel
    const oHi = 0x5a6238, oMid = 0x474e2b, oLo = 0x32381e, oSlot = 0x23271a;                     // olive ammo can
    const cv = 0xa89f63, cvHi = 0xc6bd80;                                                         // canvas carry handle
    const stencil = 0xd8d2b0, brass = 0xe0bb5c;                                                   // markings + belt brass

    // ---- mount: just the central pintle post (legs/T&E removed per request) ----
    const tb = new MeshBuilder();
    tb.box(0.16, 1.05, 0.16, 0, 0.52, 0, bMid, { tint: 0.02 });                 // pintle post (column)
    tb.box(0.055, 1.0, 0.06, 0, 0.52, 0.082, bHi);                              // post front highlight
    tb.box(0.06, 1.0, 0.055, 0.082, 0.52, 0, bLo);                              // post side shadow
    tb.box(0.19, 0.10, 0.19, 0, 1.0, 0, bBright);                               // pintle collar (gun seats here)
    tb.box(0.30, 0.05, 0.30, 0, 0.02, 0, bLo);                                  // base plate on the roof
    this.tripod = new THREE.Mesh(tb.build(), voxelMaterial());
    this.tripod.castShadow = true; this.tripod.position.copy(this.base); scene.add(this.tripod);

    this.gun = new THREE.Group(); this.gun.rotation.order = 'YXZ';
    this.gun.position.copy(this.pivot); scene.add(this.gun);

    // ---- body: receiver, top cover, perforated jacket, grips, sights, ammo can ----
    const gb = new MeshBuilder();
    // receiver
    gb.box(0.28, 0.30, 1.02, 0, 0.02, 0.05, bMid, { tint: 0.02 });             // main block
    gb.box(0.285, 0.035, 1.02, 0, 0.165, 0.05, bHi);                           // lit top edge
    gb.box(0.285, 0.04, 1.02, 0, -0.135, 0.05, bLo);                           // shadow underside
    gb.box(0.30, 0.34, 0.055, 0, 0.0, 0.585, bMid, { tint: 0.02 });            // rear backplate face
    gb.box(0.30, 0.03, 0.06, 0, 0.165, 0.585, bHi);                            // backplate lit cap
    for (let i = 0; i < 4; i++) { gb.box(0.012, 0.012, 0.012, -0.142, 0.05, -0.26 + i * 0.22, bBright); gb.box(0.012, 0.012, 0.012, 0.142, 0.05, -0.26 + i * 0.22, bBright); } // side rivets
    // top cover (raised, rounded) — kept low so it never crosses the eye→ring sightline
    gb.box(0.24, 0.10, 0.84, 0, 0.22, 0.0, bMid, { tint: 0.02 });              // cover bulk
    gb.box(0.20, 0.04, 0.84, 0, 0.255, 0.0, bHi);                              // lit crown
    gb.box(0.245, 0.05, 0.84, 0, 0.185, 0.0, bLo);                             // cover lower-edge shadow
    gb.box(0.20, 0.06, 0.10, 0, 0.215, -0.44, bLo, { rx: 0.5 });               // sloped front lip
    gb.box(0.06, 0.05, 0.05, 0, 0.225, 0.42, bBright);                         // rear cover latch
    // perforated barrel jacket (the M2 signature) — sleeve + lit/shadow strips + drilled holes
    gb.box(0.20, 0.20, 0.78, 0, 0.02, -0.80, bMid, { tint: 0.02 });            // sleeve core
    gb.box(0.155, 0.03, 0.78, 0, 0.115, -0.80, bHi);                           // lit top strip
    gb.box(0.155, 0.03, 0.78, 0, -0.075, -0.80, bLo);                          // shadow bottom strip
    gb.box(0.215, 0.215, 0.06, 0, 0.02, -0.42, bLo);                           // jacket-to-receiver collar
    for (let i = 0; i < 6; i++) {
      const z0 = -0.52 - i * 0.115;
      const u = new THREE.CylinderGeometry(0.05, 0.05, 0.206, 10); gb.geo(u, 0, 0.055, z0, bSlot, { rz: Math.PI / 2 }); u.dispose();          // upper-row cooling hole
      const l = new THREE.CylinderGeometry(0.05, 0.05, 0.206, 10); gb.geo(l, 0, -0.045, z0 - 0.057, bSlot, { rz: Math.PI / 2 }); l.dispose(); // lower-row (staggered)
    }
    gb.box(0.21, 0.21, 0.05, 0, 0.02, -1.20, bLo);                             // front jacket cap
    gb.box(0.10, 0.10, 0.04, 0, 0.02, -1.215, bSlot);                          // jacket bore mouth
    gb.box(0.045, 0.045, 0.04, 0, 0.02, -2.31, bSlot);                         // dark muzzle bore (on body, never glows)
    // cosmetic iron sights (the ring "AA" sight below stays the aiming device)
    gb.box(0.045, 0.07, 0.03, 0, 0.275, 0.30, bLo); gb.box(0.05, 0.018, 0.02, 0, 0.31, 0.30, bBright);   // folded leaf rear
    gb.box(0.03, 0.09, 0.03, 0, 0.15, -1.16, bLo); gb.box(0.012, 0.03, 0.012, 0, 0.20, -1.16, bBright);  // front blade
    // right-side retracting slide slot: the handle itself is a separate animated mesh below
    gb.box(0.018, 0.065, 0.76, 0.153, 0.06, 0.18, bSlot);
    gb.box(0.016, 0.012, 0.76, 0.162, 0.10, 0.18, bBright);
    gb.box(0.016, 0.012, 0.76, 0.162, 0.02, 0.18, bLo);
    // feed throat (belt enters the LEFT-top of the receiver; can sits on the left, belt feeds rightward in)
    gb.box(0.12, 0.13, 0.18, -0.11, 0.07, -0.02, bLo); gb.box(0.10, 0.02, 0.12, -0.11, 0.135, -0.02, bSlot);
    // spade grips + butterfly trigger (rear)
    gb.box(0.50, 0.07, 0.07, 0, 0.0, 0.62, bLo);                               // crossbar
    for (const hx of [-0.21, 0.21]) {
      gb.box(0.058, 0.34, 0.06, hx, -0.16, 0.62, bMid, { tint: 0.03 });        // handle body
      gb.box(0.02, 0.34, 0.062, hx, -0.16, 0.589, bHi);                        // front highlight
      gb.box(0.02, 0.34, 0.062, hx, -0.16, 0.651, bLo);                        // back shadow
      for (let i = 0; i < 3; i++) gb.box(0.062, 0.012, 0.062, hx, -0.05 - i * 0.09, 0.62, bSlot); // grip ribs
      gb.box(0.07, 0.04, 0.07, hx, 0.025, 0.62, bBright);                      // grip cap
    }
    gb.box(0.13, 0.045, 0.05, 0, -0.05, 0.66, bBright);                        // butterfly trigger
    gb.box(0.05, 0.03, 0.03, -0.05, -0.06, 0.69, bBright); gb.box(0.05, 0.03, 0.03, 0.05, -0.06, 0.69, bBright); // thumb paddles
    // ammo can on the LEFT — OPEN-topped, hollow, NO lid; linked .50 rounds packed inside; belt feeds rightward into the throat
    gb.box(0.11, 0.05, 0.30, -0.27, -0.04, 0.16, bLo);                         // cradle arm from receiver
    gb.box(0.30, 0.03, 0.42, -0.42, -0.215, 0.16, oMid, { tint: 0.02 });       // box floor
    gb.box(0.30, 0.30, 0.03, -0.42, -0.07, 0.37, oMid, { tint: 0.02 });        // front wall (+z, toward gunner)
    gb.box(0.30, 0.30, 0.03, -0.42, -0.07, -0.05, oMid, { tint: 0.02 });       // back wall (−z)
    gb.box(0.03, 0.30, 0.42, -0.565, -0.07, 0.16, oMid, { tint: 0.02 });       // outer wall (−x)
    gb.box(0.03, 0.22, 0.42, -0.275, -0.11, 0.16, oLo);                        // inner wall (+x, lower so the belt rises out toward the gun)
    gb.box(0.31, 0.022, 0.03, -0.42, 0.075, 0.37, oHi); gb.box(0.31, 0.022, 0.03, -0.42, 0.075, -0.05, oHi); // lit front/back rims
    gb.box(0.03, 0.022, 0.43, -0.565, 0.075, 0.16, oHi);                       // lit outer rim
    gb.box(0.30, 0.05, 0.04, -0.42, -0.05, 0.385, oLo);                        // front-face shadow band
    for (let i = 0; i < 7; i++) gb.box(0.022, 0.026, 0.006, -0.55 + i * 0.038, -0.05, 0.388, stencil); // "CAL .50" stencil
    gb.box(0.02, 0.10, 0.02, -0.605, 0.0, 0.10, bBright, { rz: 0.3 }); gb.box(0.02, 0.10, 0.02, -0.605, 0.0, 0.22, bBright, { rz: 0.3 }); gb.box(0.075, 0.02, 0.02, -0.64, 0.05, 0.16, bBright); // folding wire bail handle
    this.body = new THREE.Mesh(gb.build(), voxelMaterial()); this.body.castShadow = true; this.gun.add(this.body);

    this.ammoBoxRounds = new THREE.Group(); this.gun.add(this.ammoBoxRounds);
    { // linked live .50 BMG rounds packed inside: separate so the can visibly empties at 0 ammo
      const boxRoundBuilder = new MeshBuilder();
      addFiftyLiveRound(boxRoundBuilder, 0, 0, 0, { axis: 'z-', scale: 0.82, link: true });
      this._boxRoundGeo = boxRoundBuilder.build(); this._boxRoundMat = voxelMaterial();
      for (let i = 0; i < 5; i++) {
        const r = new THREE.Mesh(this._boxRoundGeo, this._boxRoundMat);
        r.position.set(-0.51 + i * 0.046, -0.05, 0.19);
        this.ammoBoxRounds.add(r);
      }
    }

    // ---- barrel: separate mesh on barrelMat — it glows / colour-shifts with heat (see update()) ----
    this.barrelMat = voxelMaterial();
    const bb = new MeshBuilder();
    { const bar = new THREE.CylinderGeometry(0.055, 0.055, 1.12, 12); bb.geo(bar, 0, 0.02, -1.74, 0xffffff, { rx: Math.PI / 2 }); bar.dispose(); }    // heavy barrel
    { const boost = new THREE.CylinderGeometry(0.075, 0.088, 0.16, 12); bb.geo(boost, 0, 0.02, -2.22, 0xffffff, { rx: Math.PI / 2 }); boost.dispose(); } // muzzle booster
    this.barrel = new THREE.Mesh(bb.build(), this.barrelMat); this.gun.add(this.barrel);
    this.barrelMat.color.setRGB(0.25, 0.27, 0.31); this.barrelMat.emissive.setRGB(0, 0, 0); this.barrelMat.emissiveIntensity = 0; // cold = normal blued steel (not white) until heat ramps it

    // right-side charging handle / retracting slide group: pulled rearward (+Z) when someone mans the gun
    const hb = new MeshBuilder();
    hb.box(0.06, 0.07, 0.17, 0.185, 0.06, 0.16, bLo, { tint: 0.02 });          // sliding shoe riding in the right-side slot
    hb.box(0.018, 0.075, 0.18, 0.222, 0.06, 0.16, bHi);                       // exposed outer face
    { const grip = new THREE.CylinderGeometry(0.034, 0.034, 0.25, 12); hb.geo(grip, 0.325, 0.065, 0.22, bBright, { rz: Math.PI / 2, tint: 0.02 }); grip.dispose(); }
    { const cap = new THREE.CylinderGeometry(0.039, 0.039, 0.024, 12); hb.geo(cap, 0.455, 0.065, 0.22, bLo, { rz: Math.PI / 2 }); cap.dispose(); }
    hb.box(0.035, 0.02, 0.12, 0.255, 0.064, 0.11, bSlot);                     // shadow under the handle stem
    this.chargeHandle = new THREE.Mesh(hb.build(), voxelMaterial());
    this.chargeHandle.castShadow = true;
    this.gun.add(this.chargeHandle);
    this._chargeAnimT = -1;
    this._updateChargeHandle(0);

    this.belt = new THREE.Group(); this.gun.add(this.belt);
    // one linked live .50 BMG round: same brass/rim/groove + copper projectile style used in the ammo can
    { const rbld = new MeshBuilder();
      addFiftyLiveRound(rbld, 0, 0, 0, { axis: 'y', scale: 1, link: true });
      this._beltGeo = rbld.build(); this._beltMat = voxelMaterial(); }
    for (let i = 0; i < 9; i++) {
      const r = new THREE.Mesh(this._beltGeo, this._beltMat);
      this.belt.add(r); this.beltRounds.push({ mesh: r, t: i / 9 });
    }
    // rear ring "AA" sight — gunner looks THROUGH it; the target frames in the middle (ring + cross + centre ring)
    const sb = new MeshBuilder();
    const RR = 0.13, sx = 0, sy = 0.52, sz = 0.35, col = 0x0e1013;
    const ring = new THREE.TorusGeometry(RR, 0.011, 6, 22); sb.geo(ring, sx, sy, sz, col); ring.dispose();
    const cring = new THREE.TorusGeometry(0.028, 0.008, 6, 14); sb.geo(cring, sx, sy, sz, col); cring.dispose();
    sb.box(RR * 2, 0.012, 0.012, sx, sy, sz, col);                 // horizontal cross bar
    sb.box(0.012, RR * 2, 0.012, sx, sy, sz, col);                 // vertical cross bar
    sb.box(0.022, 0.42, 0.04, sx, sy - RR - 0.21, sz + 0.02, col); // post down to the receiver
    this.sight = new THREE.Mesh(sb.build(), voxelMaterial());            // solid 3D sight: occluded normally, no longer painted over the whole world
    this.sight.frustumCulled = false; this.gun.add(this.sight);
    // Eye sits on the gun's firing axis, directly behind the ring centre, so the
    // ring centre, the crosshair and the bullet path are always collinear.
    this._sightCenter = new THREE.Vector3(sx, sy, sz);
    this._camLocal = new THREE.Vector3(sx, sy, sz + 0.98); // eye sits behind the gun (stand behind it, not in it)
	    this._layoutBelt();
	    this._updateAmmoVisuals();
	    this._solidBoxes = this._makeCollisionBoxes();
    this.game.world.boxes.push(...this._solidBoxes);
    this.updateCollisionBoxes();
  }

  _buildDshk() {
    const scene = this.game.engine.scene;
    // DShK palette: worn Soviet gun-blue steel, black heat-darkened barrel, olive 12.7mm box, brass belt, wooden spade grips.
    const sHi = 0x707883, sMid = 0x505862, sLo = 0x343b44, sSlot = 0x1c2026, sBright = 0x929aa4;
    const bHi = 0x5e6671, bMid = 0x3f4650, bLo = 0x252a31, bSlot = 0x12161b;
    const odHi = 0x70784a, odMid = 0x555f35, odLo = 0x363f23, odSlot = 0x252c1a;
    const woodHi = 0xa8733e, woodMid = 0x80532a, woodLo = 0x51321a;
    const brass = 0xd5ad50, brassHi = 0xe6c36a, leather = 0xb9855a;
    const rod = (builder, a, c, r, col, seg = 10, tint = 0.015) => {
      const from = new THREE.Vector3(a[0], a[1], a[2]);
      const to = new THREE.Vector3(c[0], c[1], c[2]);
      const dir = to.clone().sub(from);
      const len = dir.length();
      if (len <= 0.0001) return;
      const g = new THREE.CylinderGeometry(r, r, len, seg);
      const mid = from.add(to).multiplyScalar(0.5);
      builder.geo(g, mid.x, mid.y, mid.z, col, { align: dir, tint });
      g.dispose();
    };

    // ---- heavy tripod / Kolesnikov-style AA mount silhouette ----
    const tb = new MeshBuilder();
    { const post = new THREE.CylinderGeometry(0.085, 0.095, 1.00, 14); tb.geo(post, 0, 0.52, 0, sMid, { tint: 0.02 }); post.dispose(); }
    { const sleeve = new THREE.CylinderGeometry(0.125, 0.125, 0.20, 16); tb.geo(sleeve, 0, 0.83, 0, sLo, { tint: 0.02 }); sleeve.dispose(); }
    { const collar = new THREE.CylinderGeometry(0.22, 0.19, 0.09, 18); tb.geo(collar, 0, 1.04, 0, sBright, { tint: 0.01 }); collar.dispose(); }
    { const ring = new THREE.TorusGeometry(0.22, 0.018, 8, 24); tb.geo(ring, 0, 1.105, 0, sLo, { rx: Math.PI / 2 }); ring.dispose(); }
    tb.box(0.46, 0.045, 0.20, 0, 1.13, 0.02, sLo);                            // cradle crosshead
    tb.box(0.065, 0.28, 0.10, -0.20, 1.22, 0.00, sMid);                       // left trunnion cheek
    tb.box(0.065, 0.28, 0.10,  0.20, 1.22, 0.00, sMid);                       // right trunnion cheek
    tb.box(0.045, 0.23, 0.06, -0.205, 1.24, 0.02, sHi);
    tb.box(0.045, 0.23, 0.06,  0.205, 1.24, 0.02, sLo);
    tb.box(0.34, 0.12, 0.30, 0, 1.16, 0.01, sLo, { tint: 0.015 });            // heavy yoke saddle under the receiver
    tb.box(0.28, 0.07, 0.24, 0, 1.25, 0.01, sBright, { tint: 0.01 });         // lit top of the yoke saddle
    rod(tb, [-0.17, 1.08, 0.10], [-0.25, 1.35, -0.10], 0.026, sLo, 8, 0.01);  // left yoke brace into trunnion
    rod(tb, [ 0.17, 1.08, 0.10], [ 0.25, 1.35, -0.10], 0.026, sLo, 8, 0.01);  // right yoke brace into trunnion
    tb.box(0.34, 0.055, 0.34, 0, 0.025, 0, sLo);                              // centre foot plate
    tb.box(0.28, 0.018, 0.28, 0, 0.065, 0, sHi);                              // lit plate lip
    const legStarts = [[-0.13, 0.82, -0.02], [0.13, 0.82, -0.02], [0.00, 0.76, 0.15]];
    const legEnds = [[-0.86, 0.08, -0.78], [0.86, 0.08, -0.78], [-0.48, 0.08, 0.98]];
    for (let i = 0; i < 3; i++) {
      rod(tb, legStarts[i], legEnds[i], 0.038, sMid, 12, 0.02);
      const sx = legStarts[i][0] * 0.55 + legEnds[i][0] * 0.45;
      const sy = legStarts[i][1] * 0.55 + legEnds[i][1] * 0.45;
      const sz = legStarts[i][2] * 0.55 + legEnds[i][2] * 0.45;
      tb.box(0.13, 0.07, 0.09, sx, sy, sz, sLo, { ry: i === 2 ? -0.45 : (i === 0 ? 0.55 : -0.55), tint: 0.015 }); // sliding clamp on each leg
      rod(tb, [0, 0.54, 0.02], [legEnds[i][0] * 0.70, 0.20, legEnds[i][2] * 0.70], 0.018, sLo, 8, 0.01);          // thin cross brace
      tb.box(0.20, 0.035, 0.13, legEnds[i][0], 0.025, legEnds[i][2], sLo, { ry: i === 2 ? -0.35 : (i === 0 ? 0.7 : -0.7) });
      rod(tb, [legEnds[i][0], 0.04, legEnds[i][2]], [legEnds[i][0] + (i === 1 ? 0.05 : -0.05), -0.06, legEnds[i][2] - 0.04], 0.022, sBright, 8, 0); // ground spike
    }
    tb.box(0.11, 0.24, 0.045, 0.24, 0.86, 0.17, sLo, { rz: -0.45 });          // elevation handle bracket
    tb.box(0.28, 0.038, 0.045, 0.34, 0.74, 0.19, sBright, { rz: -0.18 });     // small traverse handle
    this.tripod = new THREE.Mesh(tb.build(), voxelMaterial());
    this.tripod.castShadow = true; this.tripod.position.copy(this.base); scene.add(this.tripod);

    this.gun = new THREE.Group(); this.gun.rotation.order = 'YXZ';
    this.gun.position.copy(this.pivot); scene.add(this.gun);

    // ---- receiver, box, furniture, sights, gas tube, non-heated furniture ----
    const gb = new MeshBuilder();
    gb.box(0.31, 0.27, 0.82, 0, 0.03, 0.16, sMid, { tint: 0.025 });           // angular receiver block
    gb.box(0.315, 0.035, 0.82, 0, 0.165, 0.16, sHi);
    gb.box(0.318, 0.042, 0.78, 0, -0.115, 0.17, sLo);
    gb.box(0.21, 0.09, 0.78, 0, 0.235, 0.12, sMid, { tint: 0.02 });           // raised top cover
    gb.box(0.19, 0.045, 0.70, 0, 0.285, 0.12, sHi);
    gb.box(0.22, 0.052, 0.13, 0, 0.225, -0.34, sLo, { rx: 0.44 });            // sloped feed-cover front lip
    { const cover = new THREE.CylinderGeometry(0.095, 0.095, 0.48, 14); gb.geo(cover, 0, 0.275, 0.04, sMid, { rx: Math.PI / 2, tint: 0.018 }); cover.dispose(); } // rounded feed-cover crown
    gb.box(0.16, 0.020, 0.46, 0, 0.365, 0.04, sHi, { tint: 0.01 });            // top glint on the cover
    gb.box(0.034, 0.052, 0.28, -0.184, 0.235, 0.06, sLo);                     // left cover hinge rail
    gb.box(0.034, 0.052, 0.28,  0.184, 0.235, 0.06, sLo);                     // right cover hinge rail
    for (let i = 0; i < 3; i++) {
      const hz = -0.18 + i * 0.18;
      gb.box(0.020, 0.020, 0.060, -0.205, 0.235, hz, sBright);
      gb.box(0.020, 0.020, 0.060,  0.205, 0.235, hz, sBright);
    }
    gb.box(0.13, 0.07, 0.16, 0, 0.235, 0.52, sLo);                            // rear latch hump
    gb.box(0.055, 0.042, 0.06, 0, 0.285, 0.54, sBright);                      // rear cover latch
    gb.box(0.34, 0.30, 0.065, 0, 0.015, 0.61, sMid, { tint: 0.02 });           // square rear backplate
    gb.box(0.36, 0.048, 0.075, 0, 0.165, 0.62, sHi);
    // Cradle block and trunnions: from 360 view this must visibly sit ON the tripod head, not float above it.
    gb.box(0.31, 0.090, 0.58, 0, -0.190, 0.07, sLo, { tint: 0.02 });           // underside cradle rail welded to receiver
    gb.box(0.22, 0.10, 0.18, 0, -0.250, -0.05, sMid, { tint: 0.02 });          // centre saddle dropping into pintle yoke
    gb.box(0.058, 0.34, 0.18, -0.235, -0.060, 0.02, sLo, { tint: 0.015 });     // left cradle cheek
    gb.box(0.058, 0.34, 0.18,  0.235, -0.060, 0.02, sLo, { tint: 0.015 });     // right cradle cheek
    { const td = new THREE.CylinderGeometry(0.080, 0.080, 0.050, 14); gb.geo(td, -0.268, -0.02, 0.00, sBright, { rz: Math.PI / 2 }); td.dispose(); }
    { const td = new THREE.CylinderGeometry(0.080, 0.080, 0.050, 14); gb.geo(td,  0.268, -0.02, 0.00, sBright, { rz: Math.PI / 2 }); td.dispose(); }
    rod(gb, [-0.125, -0.215, 0.14], [-0.100, -0.080, -0.62], 0.018, sLo, 8, 0.01); // left forward cradle brace under barrel group
    rod(gb, [ 0.125, -0.215, 0.14], [ 0.100, -0.080, -0.62], 0.018, sLo, 8, 0.01); // right forward cradle brace under barrel group
    gb.box(0.12, 0.07, 0.16, -0.17, 0.04, -0.08, sLo);                        // feed throat
    gb.box(0.115, 0.022, 0.16, -0.17, 0.115, -0.08, sSlot);                   // dark belt slot
    gb.box(0.055, 0.045, 0.60, 0.175, 0.055, 0.14, sSlot);                    // right-side charging slot
    gb.box(0.012, 0.014, 0.60, 0.215, 0.108, 0.14, sBright);
    for (let i = 0; i < 5; i++) {
      const z = -0.22 + i * 0.17;
      gb.box(0.014, 0.014, 0.014, -0.158, 0.075, z, sBright);
      gb.box(0.014, 0.014, 0.014,  0.158, 0.075, z, sBright);
    }
    // barrel jacket collars and underbarrel gas tube support
    gb.box(0.24, 0.24, 0.08, 0, 0.015, -0.44, sLo);
    gb.box(0.16, 0.16, 0.06, 0, 0.015, -1.70, sLo);
    gb.box(0.18, 0.13, 0.28, 0, 0.005, -0.35, sMid, { tint: 0.02 });           // solid barrel shank screwed into receiver
    gb.box(0.21, 0.070, 0.12, 0, -0.075, -0.58, sLo);                         // front saddle clamp under cooling fins
    gb.box(0.050, 0.145, 0.075, -0.105, -0.020, -0.58, sLo);
    gb.box(0.050, 0.145, 0.075,  0.105, -0.020, -0.58, sHi);
    { const gas = new THREE.CylinderGeometry(0.028, 0.028, 1.42, 10); gb.geo(gas, 0, -0.12, -1.18, bLo, { rx: Math.PI / 2, tint: 0.015 }); gas.dispose(); }
    for (let i = 0; i < 4; i++) {
      const z = -0.62 - i * 0.34;
      gb.box(0.16, 0.048, 0.055, 0, -0.075, z, sLo);
      gb.box(0.045, 0.040, 0.060, 0.085, -0.100, z, sHi);
    }
    // Front sight rides on a barrel clamp near the muzzle, not on the receiver.
    { const fsClamp = new THREE.CylinderGeometry(0.076, 0.076, 0.090, 14); gb.geo(fsClamp, 0, 0.020, -2.22, sLo, { rx: Math.PI / 2, tint: 0.01 }); fsClamp.dispose(); }
    gb.box(0.115, 0.025, 0.058, 0, 0.102, -2.22, sHi, { tint: 0.01 });         // lit shoe on top of the clamp
    gb.box(0.052, 0.118, 0.050, 0, 0.142, -2.22, sMid);                       // lower, lighter sight pedestal locked to barrel clamp
    gb.box(0.014, 0.095, 0.052, -0.035, 0.215, -2.22, sLo);
    gb.box(0.014, 0.095, 0.052,  0.035, 0.215, -2.22, sLo);
    gb.box(0.012, 0.052, 0.014, 0, 0.232, -2.22, sBright);                    // blade between the protective ears
    gb.box(0.082, 0.014, 0.030, 0, 0.265, -2.22, sHi);                        // small U-cap, no giant chimney silhouette
    // Rear tangent ladder on the receiver cover. The big AA spider ring is built separately farther forward.
    gb.box(0.105, 0.055, 0.070, 0, 0.255, 0.47, sLo);                         // rear sight base on the back of the cover
    gb.box(0.020, 0.34, 0.024, -0.045, 0.405, 0.47, sLo);
    gb.box(0.020, 0.34, 0.024,  0.045, 0.405, 0.47, sLo);
    gb.box(0.110, 0.018, 0.026, 0, 0.565, 0.47, sBright);
    gb.box(0.092, 0.014, 0.022, 0, 0.425, 0.47, sBright);
    gb.box(0.012, 0.060, 0.014, 0, 0.430, 0.47, sBright);
    // wooden dual spade grips and butterfly trigger
    gb.box(0.54, 0.062, 0.07, 0, 0.02, 0.70, sLo);
    for (const hx of [-0.23, 0.23]) {
      gb.box(0.060, 0.31, 0.070, hx, -0.145, 0.73, woodMid, { tint: 0.045 });
      gb.box(0.020, 0.29, 0.072, hx + (hx < 0 ? -0.018 : 0.018), -0.145, 0.70, woodHi, { tint: 0.035 });
      gb.box(0.020, 0.29, 0.072, hx + (hx < 0 ? 0.018 : -0.018), -0.145, 0.76, woodLo, { tint: 0.03 });
      for (let i = 0; i < 4; i++) gb.box(0.064, 0.010, 0.074, hx, -0.055 - i * 0.060, 0.73, woodLo);
      gb.box(0.071, 0.035, 0.078, hx, 0.025, 0.73, sBright);
    }
    gb.box(0.17, 0.044, 0.052, 0, -0.045, 0.75, sBright);
    gb.box(0.052, 0.026, 0.032, -0.055, -0.058, 0.795, sBright);
    gb.box(0.052, 0.026, 0.032,  0.055, -0.058, 0.795, sBright);
    // Closed Soviet 12.7mm ammo can on the left: clean lid, stamped face, latch and a short feed chute.
    gb.box(0.12, 0.052, 0.34, -0.295, 0.015, 0.14, sLo, { tint: 0.012 });      // stout receiver bracket
    gb.box(0.23, 0.044, 0.145, -0.365, 0.135, -0.005, sLo, { tint: 0.015 });   // enclosed feed-tray bridge
    gb.box(0.21, 0.018, 0.126, -0.365, 0.170, -0.005, sHi);
    gb.box(0.175, 0.030, 0.080, -0.230, 0.155, -0.055, sSlot);                // dark mouth where belt enters the gun
    gb.box(0.41, 0.35, 0.49, -0.565, 0.010, 0.175, odMid, { tint: 0.025 });    // can body
    gb.box(0.42, 0.044, 0.50, -0.565, 0.210, 0.175, odHi, { tint: 0.018 });    // raised closed lid
    gb.box(0.37, 0.020, 0.41, -0.565, 0.239, 0.175, odSlot);                  // recessed lid seam
    gb.box(0.31, 0.016, 0.31, -0.565, 0.261, 0.175, odHi, { tint: 0.01 });     // central lid panel
    gb.box(0.42, 0.052, 0.50, -0.565, -0.190, 0.175, odLo);                   // heavy bottom seam
    gb.box(0.036, 0.35, 0.50, -0.790, 0.010, 0.175, odLo);                    // outside face rim
    gb.box(0.032, 0.30, 0.49, -0.342, -0.010, 0.175, odHi);                   // inside face highlight
    gb.box(0.024, 0.28, 0.43, -0.805, 0.010, 0.175, odMid, { tint: 0.015 });   // visible outer plate
    for (const yy of [0.090, -0.020, -0.130]) {
      gb.box(0.014, 0.020, 0.330, -0.823, yy, 0.175, yy > 0 ? odHi : odLo);    // horizontal stamped ribs on outer face
    }
    gb.box(0.015, 0.108, 0.014, -0.833, -0.035, 0.175, odHi);                 // simple stamped star/cross, flush to box face
    gb.box(0.015, 0.108, 0.014, -0.833, -0.035, 0.175, odHi, { rz: Math.PI / 2 });
    gb.box(0.015, 0.082, 0.014, -0.833, -0.035, 0.175, odHi, { rz: 0.78 });
    gb.box(0.015, 0.082, 0.014, -0.833, -0.035, 0.175, odHi, { rz: -0.78 });
    gb.box(0.050, 0.026, 0.040, -0.828, 0.090, 0.385, brassHi);               // side latch plates
    gb.box(0.074, 0.020, 0.026, -0.834, 0.045, 0.385, sBright);
    gb.box(0.042, 0.020, 0.038, -0.735, 0.222, -0.045, sLo);                  // rear hinge blocks
    gb.box(0.042, 0.020, 0.038, -0.600, 0.222, -0.045, sLo);
    gb.box(0.042, 0.020, 0.038, -0.465, 0.222, -0.045, sLo);
    gb.box(0.030, 0.018, 0.030, -0.682, 0.262, 0.050, brassHi);
    gb.box(0.030, 0.018, 0.030, -0.448, 0.262, 0.300, brassHi);
    rod(gb, [-0.682, 0.275, 0.050], [-0.565, 0.330, 0.175], 0.012, leather, 8, 0.02);
    rod(gb, [-0.565, 0.330, 0.175], [-0.448, 0.275, 0.300], 0.012, leather, 8, 0.02);
    gb.box(0.17, 0.016, 0.022, -0.435, 0.160, 0.020, sLo);                   // narrow feed lip leaving the can
    gb.box(0.11, 0.018, 0.020, -0.317, 0.160, -0.028, sBright);
    this.body = new THREE.Mesh(gb.build(), voxelMaterial()); this.body.castShadow = true; this.gun.add(this.body);

    this.ammoBoxRounds = new THREE.Group(); this.gun.add(this.ammoBoxRounds);

    // ---- heat-reactive DShK ribbed barrel and large muzzle booster ----
    this.barrelMat = voxelMaterial();
    const bb = new MeshBuilder();
    { const core = new THREE.CylinderGeometry(0.052, 0.052, 1.22, 12); bb.geo(core, 0, 0.02, -1.02, 0xffffff, { rx: Math.PI / 2 }); core.dispose(); }
    for (let i = 0; i < 28; i++) {
      const z = -0.47 - i * 0.043;
      const fin = new THREE.CylinderGeometry(0.084, 0.084, 0.017, 12);
      bb.geo(fin, 0, 0.02, z, 0xffffff, { rx: Math.PI / 2 });
      fin.dispose();
    }
    { const step1 = new THREE.CylinderGeometry(0.064, 0.058, 0.34, 12); bb.geo(step1, 0, 0.02, -1.82, 0xffffff, { rx: Math.PI / 2 }); step1.dispose(); }
    { const long = new THREE.CylinderGeometry(0.046, 0.050, 0.68, 12); bb.geo(long, 0, 0.02, -2.20, 0xffffff, { rx: Math.PI / 2 }); long.dispose(); }
    { const neck = new THREE.CylinderGeometry(0.070, 0.050, 0.18, 14); bb.geo(neck, 0, 0.02, -2.47, 0xffffff, { rx: Math.PI / 2 }); neck.dispose(); }
    { const bulb = new THREE.CylinderGeometry(0.124, 0.112, 0.24, 16); bb.geo(bulb, 0, 0.02, -2.59, 0xffffff, { rx: Math.PI / 2 }); bulb.dispose(); }
    { const cap = new THREE.CylinderGeometry(0.110, 0.082, 0.11, 16); bb.geo(cap, 0, 0.02, -2.73, 0xffffff, { rx: Math.PI / 2 }); cap.dispose(); }
    { const rim = new THREE.TorusGeometry(0.095, 0.014, 8, 22); bb.geo(rim, 0, 0.02, -2.79, 0xffffff); rim.dispose(); }
    bb.box(0.022, 0.105, 0.120, -0.113, 0.02, -2.59, 0x030405);               // dark side port in the booster
    bb.box(0.022, 0.105, 0.120,  0.113, 0.02, -2.59, 0x030405);
    { const bore = new THREE.CylinderGeometry(0.040, 0.040, 0.018, 16); bb.geo(bore, 0, 0.02, -2.805, 0x030405, { rx: Math.PI / 2 }); bore.dispose(); }
    { const inner = new THREE.CylinderGeometry(0.024, 0.024, 0.022, 12); bb.geo(inner, 0, 0.02, -2.815, 0x000000, { rx: Math.PI / 2 }); inner.dispose(); }
    this.barrel = new THREE.Mesh(bb.build(), this.barrelMat); this.gun.add(this.barrel);
    this.barrelMat.color.setRGB(0.22, 0.24, 0.28); this.barrelMat.emissive.setRGB(0, 0, 0); this.barrelMat.emissiveIntensity = 0;

    // right-side DShK charging slide: pulls rearward on mount/refill.
    const hb = new MeshBuilder();
    hb.box(0.068, 0.074, 0.18, 0.238, 0.055, 0.17, sLo, { tint: 0.02 });
    hb.box(0.018, 0.078, 0.20, 0.285, 0.055, 0.17, sHi);
    { const handle = new THREE.CylinderGeometry(0.034, 0.034, 0.24, 12); hb.geo(handle, 0.405, 0.058, 0.20, sBright, { rz: Math.PI / 2, tint: 0.02 }); handle.dispose(); }
    { const knob = new THREE.CylinderGeometry(0.043, 0.043, 0.045, 12); hb.geo(knob, 0.545, 0.058, 0.20, sLo, { rz: Math.PI / 2 }); knob.dispose(); }
    hb.box(0.044, 0.018, 0.13, 0.315, 0.040, 0.10, sSlot);
    this.chargeHandle = new THREE.Mesh(hb.build(), voxelMaterial());
    this.chargeHandle.castShadow = true; this.gun.add(this.chargeHandle);
    this._chargeAnimT = -1; this._updateChargeHandle(0);

    this.belt = new THREE.Group(); this.gun.add(this.belt);
    {
      const rbld = new MeshBuilder();
      addFiftyLiveRound(rbld, 0, 0, 0, { axis: 'y', scale: 1.03, link: true });
      this._beltGeo = rbld.build(); this._beltMat = voxelMaterial();
    }
    for (let i = 0; i < 13; i++) {
      const r = new THREE.Mesh(this._beltGeo, this._beltMat);
      this.belt.add(r); this.beltRounds.push({ mesh: r, t: i / 13 });
    }

    // Tall circular AA ring sight on the forward feed-cover/barrel-shank bracket.
    const sb = new MeshBuilder();
    const RR = 0.145, sx = 0, sy = 0.60, sz = -0.43, col = 0x0e1013;
    const ring = new THREE.TorusGeometry(RR, 0.010, 6, 26); sb.geo(ring, sx, sy, sz, col); ring.dispose();
    const ring2 = new THREE.TorusGeometry(RR * 0.62, 0.007, 6, 22); sb.geo(ring2, sx, sy, sz, col); ring2.dispose();
    const cring = new THREE.TorusGeometry(0.030, 0.007, 6, 14); sb.geo(cring, sx, sy, sz, col); cring.dispose();
    sb.box(RR * 2.05, 0.010, 0.010, sx, sy, sz, col);
    sb.box(0.010, RR * 2.05, 0.010, sx, sy, sz, col);
    sb.box(0.018, 0.38, 0.034, sx - 0.105, sy - RR - 0.160, sz + 0.018, col);
    sb.box(0.018, 0.38, 0.034, sx + 0.105, sy - RR - 0.160, sz + 0.018, col);
    sb.box(0.235, 0.026, 0.040, sx, sy - RR - 0.345, sz + 0.018, col);
    sb.box(0.165, 0.030, 0.070, sx, sy - RR - 0.385, sz + 0.018, col);
    sb.box(0.145, 0.034, 0.115, sx, sy - RR - 0.420, sz + 0.020, col);         // shoe clamped onto the barrel shank/front cover
    sb.box(0.018, 0.145, 0.028, sx - 0.058, sy - RR - 0.300, sz + 0.012, col, { rz: 0.18 });
    sb.box(0.018, 0.145, 0.028, sx + 0.058, sy - RR - 0.300, sz + 0.012, col, { rz: -0.18 });
    this.sight = new THREE.Mesh(sb.build(), voxelMaterial());
    this.sight.frustumCulled = false; this.gun.add(this.sight);
    this._sightCenter = new THREE.Vector3(sx, sy, sz);
    this._camLocal = new THREE.Vector3(sx, sy, sz + 1.13);
    this._muzzleLocal = new THREE.Vector3(0, 0.02, -2.72);
    this._ejectLocal = new THREE.Vector3(0.235, 0.005, 0.12);
    this._smokeLocal = new THREE.Vector3(0, 0.08, -1.22);

    this._layoutBelt();
    this._updateAmmoVisuals();
    this._solidBoxes = this._makeCollisionBoxes();
    this.game.world.boxes.push(...this._solidBoxes);
    this.updateCollisionBoxes();
  }

  _partBox(space, c, h, id) {
    return {
      min: new THREE.Vector3(), max: new THREE.Vector3(),
      mountedGun: true, _ref: this, _space: space, _id: id,
      _c: new THREE.Vector3(c[0], c[1], c[2]),
      _h: new THREE.Vector3(h[0], h[1], h[2])
    };
  }

  _partSegments(space, id, x, y, z, hx, hy, hz, count) {
    const boxes = [];
    const step = (hz * 2) / count;
    const segH = step * 0.54;
    const start = z - hz + step * 0.5;
    for (let i = 0; i < count; i++) boxes.push(this._partBox(space, [x, y, start + i * step], [hx, hy, segH], `${id}${i}`));
    return boxes;
  }

  _makeCollisionBoxes() {
    if (this.variant === 'dshk') {
      return [
        ...this._partSegments('gun', 'dshkReceiver', 0, 0.04, 0.16, 0.17, 0.19, 0.46, 3),
        ...this._partSegments('gun', 'dshkTopCover', 0, 0.23, 0.12, 0.13, 0.09, 0.40, 3),
        ...this._partSegments('gun', 'dshkRibbedBarrel', 0, 0.02, -1.05, 0.10, 0.10, 0.72, 6),
        ...this._partSegments('gun', 'dshkBarrel', 0, 0.02, -2.18, 0.07, 0.07, 0.60, 7),
        this._partBox('gun', [0, 0.04, -2.62], [0.14, 0.14, 0.20], 'dshkMuzzleBooster'),
        this._partBox('gun', [0, 0.18, -2.22], [0.09, 0.19, 0.08], 'dshkFrontSight'),
        this._partBox('gun', [0, -0.17, 0.05], [0.18, 0.14, 0.34], 'dshkReceiverCradle'),
        this._partBox('gun', [0, -0.06, -0.58], [0.13, 0.13, 0.12], 'dshkBarrelSaddle'),
        this._partBox('gun', [-0.565, 0.01, 0.175], [0.25, 0.26, 0.28], 'dshkAmmoCan'),
        this._partBox('gun', [-0.23, -0.13, 0.73], [0.08, 0.23, 0.08], 'dshkLeftGrip'),
        this._partBox('gun', [0.23, -0.13, 0.73], [0.08, 0.23, 0.08], 'dshkRightGrip'),
        this._partBox('gun', [0, 0.0, 0.70], [0.29, 0.05, 0.06], 'dshkGripCrossbar'),
        this._partBox('tripod', [0, 0.55, 0], [0.12, 0.58, 0.12], 'dshkPintlePost'),
        this._partBox('tripod', [0, 1.08, 0], [0.27, 0.11, 0.24], 'dshkTraverseHead'),
        this._partBox('tripod', [-0.43, 0.30, -0.38], [0.48, 0.18, 0.32], 'dshkLeftTripodLeg'),
        this._partBox('tripod', [0.43, 0.30, -0.38], [0.48, 0.18, 0.32], 'dshkRightTripodLeg'),
        this._partBox('tripod', [-0.24, 0.28, 0.52], [0.36, 0.17, 0.46], 'dshkRearTripodLeg')
      ];
    }
    return [
      ...this._partSegments('gun', 'receiver', 0, 0.04, 0.05, 0.155, 0.205, 0.55, 3),
      ...this._partSegments('gun', 'topCover', 0, 0.22, 0.00, 0.13, 0.075, 0.44, 3),
      ...this._partSegments('gun', 'barrelJacket', 0, 0.02, -0.82, 0.115, 0.115, 0.43, 4),
      ...this._partSegments('gun', 'barrel', 0, 0.02, -1.74, 0.075, 0.075, 0.64, 8),
      this._partBox('gun', [-0.42, -0.07, 0.16], [0.18, 0.19, 0.235], 'ammoCan'),
      this._partBox('gun', [-0.21, -0.13, 0.62], [0.07, 0.25, 0.075], 'leftSpadeGrip'),
      this._partBox('gun', [0.21, -0.13, 0.62], [0.07, 0.25, 0.075], 'rightSpadeGrip'),
      this._partBox('gun', [0, 0.0, 0.62], [0.255, 0.045, 0.055], 'gripCrossbar'),
      this._partBox('tripod', [0, 0.52, 0], [0.09, 0.53, 0.09], 'pintlePost'),
      this._partBox('tripod', [0, 1.0, 0], [0.11, 0.065, 0.11], 'pintleCollar'),
      this._partBox('tripod', [0, 0.025, 0], [0.16, 0.03, 0.16], 'basePlate')
    ];
  }

  _setBoxFromLocal(box, matrixWorld) {
    const mn = box.min.set(Infinity, Infinity, Infinity);
    const mx = box.max.set(-Infinity, -Infinity, -Infinity);
    const c = box._c, h = box._h, p = MountedGun._boxTmp || (MountedGun._boxTmp = new THREE.Vector3());
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      p.set(c.x + h.x * sx, c.y + h.y * sy, c.z + h.z * sz).applyMatrix4(matrixWorld);
      mn.min(p); mx.max(p);
    }
    mn.addScalar(-0.004); mx.addScalar(0.004);
  }

  updateCollisionBoxes() {
    if (!this._solidBoxes || !this.gun || !this.tripod) return;
    this.gun.updateMatrixWorld(true);
    this.tripod.updateMatrixWorld(true);
    for (const box of this._solidBoxes) this._setBoxFromLocal(box, box._space === 'tripod' ? this.tripod.matrixWorld : this.gun.matrixWorld);
  }

  _beltPos(t, out) {
    if (this.variant === 'dshk') {
      return out.set(-0.48 + t * 0.34, 0.165 + Math.sin(t * Math.PI) * 0.025, 0.020 - t * 0.090);
    }
    const climb = Math.min(1, t / 0.4);
    return out.set(-0.40 + t * 0.29, -0.02 + 0.16 * climb + Math.sin(t * Math.PI) * 0.02, 0.14 - t * 0.16);
  } // belt sits on a short feed chute from the closed can into the receiver throat
  _layoutBelt() {
    const v = new THREE.Vector3();
    for (const r of this.beltRounds) {
      this._beltPos(r.t, v);
      r.mesh.position.copy(v);
      r.mesh.rotation.set(-Math.PI / 2, 0, this.variant === 'dshk' ? 0.08 * Math.sin(r.t * Math.PI * 2) : 0);
    }
  } // cartridges lined up across the belt, bullets pointing forward
  _advanceBelt(amount) {
    if (!this.beltRounds || !this.beltRounds.length || this.ammo <= 0) return;
    const v = new THREE.Vector3();
    for (const r of this.beltRounds) {
      r.t += amount;
      if (r.t > 1) r.t -= 1;
      this._beltPos(r.t, v);
      r.mesh.position.copy(v);
      r.mesh.rotation.set(-Math.PI / 2, 0, this.variant === 'dshk' ? 0.08 * Math.sin(r.t * Math.PI * 2) : 0);
    }
  }
  feedBeltShot() { this._advanceBelt(1 / Math.max(1, this.beltRounds.length)); }

  near(p) { return Math.hypot(p.x - this.base.x, p.z - this.base.z) < 2.4 && Math.abs(p.y - this.base.y) < 2.8; }
  lookingAt(maxDist = 3.6) {
    if (!this._solidBoxes || !this._solidBoxes.length) return false;
    this.updateCollisionBoxes();
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const origin = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    let direct = Infinity;
    for (const box of this._solidBoxes) {
      const t = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, box.min, box.max);
      if (t !== null && t < direct) direct = t;
    }
    if (!Number.isFinite(direct) || direct > maxDist) return false;
    const first = this.game.world.rayHit(origin, dir, maxDist);
    return !first || this._solidBoxes.includes(first.box) || first.dist + 0.03 >= direct;
  }
	  canMount(p) { return this.ammo > 0 && !this.overheated && this.near(p) && this.lookingAt(); }

  idleCool(dt) { if (this.heat > 0 || this._chargeAnimT >= 0) this.update(dt, false); } // the .50 keeps cooling/animating even when nobody local is manning it

  _playFiftyCharge() {
    const audio = this.game.audio;
    if (!audio || !audio.ctx) return false;
    if (typeof audio.fiftyCharge === 'function') { audio.fiftyCharge(); return true; }
    if (typeof audio.reloadIn === 'function') { audio.reloadIn(); return true; }
    return false;
  }
  animateCharge() {
    this._chargeAnimT = 0;
    this._updateChargeHandle(0);
  }
  _chargeCurve(t) {
    const cycleStart = t < 0.58 ? 0 : 0.58;
    const u = t - cycleStart;
    if (u < 0 || u > 0.52) return 0;
    const smooth = (x) => x * x * (3 - 2 * x);
    if (u < 0.34) return smooth(u / 0.34);
    return 1 - smooth((u - 0.34) / 0.18);
  }
  _updateChargeHandle(dt) {
    if (!this.chargeHandle) return;
    if (this._chargeAnimT >= 0) {
      this._chargeAnimT += dt;
      if (this._chargeAnimT > 1.16) { this._chargeAnimT = -1; this.readyToFire = true; }
    }
    const pull = this._chargeAnimT >= 0 ? this._chargeCurve(this._chargeAnimT) : 0;
    this.chargeHandle.position.set(0.006 * Math.sin(pull * Math.PI), 0, pull * 0.34);
    this.chargeHandle.rotation.set(0, 0, -0.08 * pull);
  }
  _playFiftyShot() {
    const audio = this.game.audio;
    if (this.variant === 'dshk' && audio && typeof audio.dshkShot === 'function') audio.dshkShot();
    else if (audio && typeof audio.fiftyShot === 'function') audio.fiftyShot();
    else if (audio && typeof audio.gunshot === 'function') audio.gunshot(SOUND_BY_CLASS.fiftycal);
  }
  _stopDshkSustain(tail = true) {
    const audio = this.game.audio;
    if (this.variant === 'dshk' && audio && typeof audio.dshkStopSustain === 'function') audio.dshkStopSustain(tail);
  }
  _playFiftyOverheat() {
    const audio = this.game.audio;
    if (audio && typeof audio.fiftyOverheat === 'function') audio.fiftyOverheat();
    else if (audio) {
      if (typeof audio.noise === 'function') audio.noise(0.25, 0.35, 'highpass', 2400, 0.8);
      if (typeof audio.tone === 'function') audio.tone(100, 0.25, 'sawtooth', 0.25);
    }
  }
  _broadcastFiftySound(kind) {
    const mp = this.game.mp;
    if (mp && mp.active && mp.net) mp.net.broadcast('fiftysound', { pid: mp.myId, g: this.id, k: kind });
  }
  _primeCharge() {
    this.readyToFire = false;
    this.animateCharge();
    this._playFiftyCharge();
    this._broadcastFiftySound('charge');
  }
  // Reload the belt to full from a carried .50-cal ammo can. Host/solo apply it directly and
  // (in co-op) sync the new belt to clients; a client asks the host (the gun is host-owned).
  // Returns true when the can should be CONSUMED (a reload happened / was requested), false on reject.
  reloadFromCan() {
    if (this.ammo >= this.maxAmmo) return false;        // already full — keep the can
    const mp = this.game.mp;
    const hostSim = !mp || !mp.active || mp.isHost;
    if (hostSim) {
      this.setAmmo(this.maxAmmo);
      this._primeCharge();                              // rack anim + foley (+ co-op: broadcasts 'fiftysound' charge)
      if (mp && mp.active && mp.isHost) mp.net.send('fiftystate', { g: this.id, occ: this.occupant, ammo: this.ammo }); // push the refilled belt to clients
    } else {
      mp.net.send('fiftyrefill', { g: this.id });       // client → host: refill the host-owned gun (host echoes 'fiftystate' + 'fiftysound')
      this.animateCharge(); this._playFiftyCharge();    // local responsiveness; ammo arrives via the host's 'fiftystate'
    }
    if (this.game.hud && this.game.hud.toast) this.game.hud.toast(this.shortName + ' · ' + this.maxAmmo + ' / ' + this.maxAmmo, 0xe8c84a);
    return true;
  }
  updateNearby(p) {
    const canUse = this.canMount(p);
    this._nearWas = canUse;
    return canUse;
  }
	  _netVec(v, digits = 2) { return [+v.x.toFixed(digits), +v.y.toFixed(digits), +v.z.toFixed(digits)]; }
	  setAmmo(n) {
	    this.ammo = clamp(Math.round(Number.isFinite(n) ? n : 0), 0, this.maxAmmo);
	    this._updateAmmoVisuals();
	    if (this.game.player && this.game.player.mountedGun === this && this.game.hud) this.game.hud.setMountedGun(this.ammo, this.maxAmmo, this.hudName);
	  }
	  _updateAmmoVisuals() {
	    const hasAmmo = this.ammo > 0;
	    if (this.belt) this.belt.visible = hasAmmo;
	    if (this.ammoBoxRounds) this.ammoBoxRounds.visible = hasAmmo;
	  }
  _muzzleWorld() { this.gun.updateMatrixWorld(); return this.gun.localToWorld((this._muzzleLocal || new THREE.Vector3(0, 0.02, -2.38)).clone()); }
  _ejectPortWorld() { this.gun.updateMatrixWorld(); return this.gun.localToWorld((this._ejectLocal || new THREE.Vector3(0.22, 0.0, 0.12)).clone()); }
  _forwardWorld() { this.gun.updateMatrixWorld(); return new THREE.Vector3(0, 0, -1).applyQuaternion(this.gun.getWorldQuaternion(new THREE.Quaternion())).normalize(); }
  _rightWorld() { this.gun.updateMatrixWorld(); return new THREE.Vector3(1, 0, 0).applyQuaternion(this.gun.getWorldQuaternion(new THREE.Quaternion())).normalize(); }

  // real seating (no claim check) — pin player to the gun, hide held weapon
	  _doMount() {
	    if (this.ammo <= 0) { if (this.game.hud && this.game.hud.toast) this.game.hud.toast(this.shortName + ' EMPTY', 0xd23a2a); return; }
	    this.game.player.mountedGun = this;
    this.game.weapons.group.visible = false;
    this.game.player.pos.set(this.base.x + Math.sin(this.baseYaw) * 0.9, this.base.y, this.base.z + Math.cos(this.baseYaw) * 0.9); // stand BEHIND the gun
    this.yaw = this.baseYaw; this.pitch = 0;
    if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = '0'; // hide the white crosshair on the .50 — the ring sight is the reticle
    if (this.game.hud.setCompass) this.game.hud.setCompass(null); // mounting stops weapons.update() → tear the буссоль overlay down here
    this._primeCharge();
	    this.game.hud.setMountedGun(this.ammo, this.maxAmmo, this.hudName);
	  }
  // claim-gated entry: solo seats immediately; co-op asks the host (host grants on first-come)
  mount() {
	    if (this.ammo <= 0) { if (this.game.hud && this.game.hud.toast) this.game.hud.toast(this.shortName + ' EMPTY', 0xd23a2a); return; }
	    if (this.overheated) { if (this.game.hud && this.game.hud.toast) this.game.hud.toast('BARREL OVERHEATED', 0xd23a2a); return; }
    const mp = this.game.mp;
    if (!mp || !mp.active) { this._doMount(); return; }          // solo: seat immediately (unchanged)
    if (mp.isHost) mp._hostFiftyClaim('mount', 'host', this.id);  // host: claim locally
    else mp.net.send('fiftyclaim', { want: 'mount', g: this.id }); // client: ask host; seat only when 'fiftystate' grants it
  }
  // real unseat (no net) — clear player.mountedGun, restore camera/weapon
  _doDismount() {
    if (this.game.player.mountedGun !== this) { this._stopDshkSustain(false); return; }
    this._stopDshkSustain(true);
    this.game.player.mountedGun = null;
    this.game.weapons.group.visible = true;
    const bx = Math.sin(this.baseYaw), bz = Math.cos(this.baseYaw);
    this.game.player.pos.set(this.base.x + bx * 1.4, this.base.y, this.base.z + bz * 1.4);
    this.game.player.vel.set(0, 0, 0); this.game.player._camY = this.base.y + this.game.player.eye;
    if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = '';
    this.game.hud.hideHeat();
    this.game.hud.setWeapon(this.game.weapons);
  }
  dismount() {
    const wasMe = (this.game.player.mountedGun === this);
    this._doDismount();                                          // unseat locally right away (responsive)
    const mp = this.game.mp;
    if (mp && mp.active && wasMe) { if (mp.isHost) mp._hostFiftyClaim('dismount', 'host', this.id); else mp.net.send('fiftyclaim', { want: 'dismount', g: this.id }); }
  }
  forceReset() {
    const mp = this.game.mp;
    const wasMe = (this.game.player && this.game.player.mountedGun === this);
    this._doDismount();
    if (mp && mp.active && wasMe) { if (mp.isHost) mp._hostFiftyClaim('dismount', 'host', this.id); else mp.net.send('fiftyclaim', { want: 'dismount', g: this.id }); }
    this.occupant = null; // session/round reset clears the seat everywhere
	    this._nearWas = false;
	    this._roundSeq = 0;
	    this.setAmmo(this.maxAmmo);
	    this.heat = 0; this.overheated = false; this.readyToFire = true; this.yaw = this.baseYaw; this.pitch = 0; this.gun.rotation.set(0, this.baseYaw, 0);
    this._chargeAnimT = -1; this._updateChargeHandle(0);
    this.updateCollisionBoxes();
    if (this.game.hud) { this.game.hud.hideHeat(); if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = ''; }
  }

  controlUpdate(dt) {
    const input = this.game.input, pl = this.game.player;
    this.yaw -= input.mouseDX * pl.sens;
    this.pitch -= input.mouseDY * pl.sens;
    this.yaw = clamp(this.yaw, this.baseYaw - 1.1, this.baseYaw + 1.1);
    this.pitch = clamp(this.pitch, -0.45, 0.45);
    this.gun.rotation.set(this.pitch, this.yaw, 0);
    this.updateCollisionBoxes();
	    { const mp = this.game.mp; if (mp && mp.active) { this._aimT = (this._aimT || 0) - dt; if (this._aimT <= 0) { this._aimT = 0.1; mp.net.broadcast('fiftyaim', { pid: mp.myId, g: this.id, yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3), heat: +this.heat.toFixed(2), ammo: this.ammo }); } } } // co-op: slew the barrel + share heat/ammo (glow/smoke) on every screen (~10Hz)
    const cam = this.game.engine.camera; cam.rotation.order = 'YXZ';
    // Place the eye rigidly on the gun's firing axis, behind the ring sight, and
    // rotate it WITH the gun (about the pivot). Eye + ring centre + muzzle now
    // share one line, so the ring centre stays locked on the screen-centre
    // crosshair (= where the rounds actually go) at every pitch/yaw — no drift.
    this.gun.updateMatrixWorld();
    const _rc = (this._recoil || 0); this._recoil = Math.max(0, _rc - dt * 0.6); // heavy recoil shove, decays
    cam.position.copy(this.gun.localToWorld(this._camLocal.clone().add(new THREE.Vector3(0, _rc * 0.10, _rc * 0.8)))); // the .50 shoves the eye back + slightly up = massive
    const _sh = (this._shake || 0); this._shake = Math.max(0, _sh - dt * 0.10); // mild firing jitter, decays out
    cam.rotation.set(this.pitch + (Math.random() - 0.5) * _sh, this.yaw + (Math.random() - 0.5) * _sh, (Math.random() - 0.5) * _sh * 0.6);
    this.game.engine.setFov((this.game.settings && this.game.settings.data.fov) || 80);
    if (this.cd > 0) this.cd -= dt;
	    const firing = input.buttons[0] && this.readyToFire && !this.overheated && this.ammo > 0;
    if (firing && this.cd <= 0) this._fire();
    this.update(dt, firing);
	    this.game.hud.setHeat(this.heat, this.overheated);
	    this.game.hud.setMountedGun(this.ammo, this.maxAmmo, this.hudName);
    if (this.overheated) this._overheatEject(); // barrel maxed -> boot the gunner off, POV left looking at the gun
  }

  _overheatEject() {
    const pl = this.game.player, by = this.baseYaw;
    if (pl.mountedGun !== this) return;
    this.dismount();                  // boot the gunner off the overheated gun (co-op-safe)
    pl.yaw = by; pl.pitch = -0.35;    // stand behind the gun, POV left looking down at the smoking .50
    this._playFiftyOverheat();
    this._broadcastFiftySound('overheat');
    if (this.game.hud.toast) this.game.hud.toast('BARREL OVERHEATED — get off it!', 0xd23a2a);
  }

	  _fire() {
	    if (this.ammo <= 0) { this._updateAmmoVisuals(); return; }
	    this.setAmmo(this.ammo - 1);
	    this.cd = 60 / this.rpm;
    this.heat = Math.min(1, this.heat + (this.heatPerShot || 0.02));
    this._roundSeq = (this._roundSeq || 0) + 1;
    const tracerColor = (this._roundSeq % 3 === 0) ? 0xff2418 : 0xffe08a;
    const caseSeed = (Math.random() * 0xffffffff) >>> 0;
    if (this.heat >= 1) this.overheated = true;
    this._shake = Math.min(this.shakeMax || 0.013, (this._shake || 0) + (this.shakeKick || 0.0045)); // very slight camera knock per shot
    this._recoil = Math.min(this.recoilMax || 0.07, (this._recoil || 0) + (this.recoilKick || 0.035));  // heavy recoil shove — makes the mounted gun feel massive
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const origin = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const muzzle = origin.clone().addScaledVector(fwd, 2.1); muzzle.y += 0.04;
    const barrelMuzzle = this._muzzleWorld(), barrelFwd = this._forwardWorld(), ejectPort = this._ejectPortWorld(), ejectRight = this._rightWorld();
    const muzzleFx = barrelMuzzle.clone().addScaledVector(barrelFwd, 0.22);
    this.game.effects.muzzleFlash(muzzleFx, barrelFwd, this.muzzleFlashScale || 2.2);
    this._playFiftyShot();
    this.game.effects.shell(ejectPort, ejectRight.clone(), { mesh: 'fiftyCase', size: 1, color: 0xcaa64a, sound: 'fiftyBrass', life: 5, bounce: 0.48, maxBounceSounds: 3, bounceSoundMinVel: 1.4, sideMin: 2.8, sideMax: 4.4, upMin: 1.2, upMax: 2.1, seed: caseSeed }); // big brass .50 case flung out the gun's RIGHT ejection port
    const dir = fwd.clone(); dir.x += rr(-this.spread, this.spread); dir.y += rr(-this.spread, this.spread); dir.z += rr(-this.spread, this.spread); dir.normalize();
    const eHit = this.game.enemies.rayHit(muzzle, dir, this.range);
    const wHit = this.game.world.rayHit(muzzle, dir, this.range, this._solidBoxes);
    const mp = this.game.mp;
    const pHit = (mp && mp.active) ? mp.rayHitPlayers(muzzle, dir, this.range) : null;
    let end;
    if (pHit && (!eHit || pHit.dist <= eHit.dist) && (!wHit || pHit.dist <= wHit.dist)) {
      const dmg = this.dmg * (pHit.head ? 1.6 : 1) * this.game.player.damageMult;
      mp.claimPlayerHit(pHit.id, dmg);
      end = pHit.point;
      this.game.effects.tracer(muzzleFx, end, tracerColor);
      this.game.hud.hitmarker(false);
    } else if (eHit && (!wHit || eHit.dist <= wHit.dist)) {
      const hs = eHit.head && !eHit.enemy.def.boss; // no headshot cheese on the boss
      const dmg = this.dmg * (hs ? 1.6 : 1) * this.game.player.damageMult;
      const killed = this.game.enemies.damage(eHit.enemy, dmg, 'gun', eHit.point);
      end = eHit.point;
      this.game.effects.tracer(muzzleFx, end, tracerColor);
      if (hs) { this.game.audio.headshot(); this.game.hud.hitmarker(true); } else { this.game.audio.hitMarker(); this.game.hud.hitmarker(killed); }
    } else if (wHit) { end = wHit.point; this.game.effects.tracer(muzzleFx, end, tracerColor); this.game.effects.impact(wHit.point, wHit.normal, 'spark'); if (wHit.box && wHit.box.explodable && this.game.world.hitFAB) this.game.world.hitFAB(wHit.box.explodable, this.dmg, wHit.point); }
    else { end = muzzle.clone().addScaledVector(dir, this.range); this.game.effects.tracer(muzzleFx, end, tracerColor); }
    if (mp && mp.active) mp.net.broadcast('fiftyfire', { pid: mp.myId, g: this.id, o: this._netVec(muzzleFx), d: this._netVec(barrelFwd, 3), e: this._netVec(end), s: this._netVec(ejectPort), r: this._netVec(ejectRight, 3), c: tracerColor, rs: caseSeed, ammo: this.ammo }); // teammates see/hear the fixed MG from the physical barrel/ejection port; damage stays host-authoritative
  }

  update(dt, firing) {
    this._updateChargeHandle(dt);
    if (this.variant === 'dshk' && this.game.audio && typeof this.game.audio.dshkSustain === 'function') {
      this.game.audio.dshkSustain(!!(firing && !this.overheated && this.ammo > 0));
    }
    if (!firing) this.heat = Math.max(0, this.heat - (this.coolRate || 0.3) * dt);
    if (this.overheated && this.heat < 0.3) this.overheated = false;
    const h = this.heat;
    this.barrelMat.emissive.setRGB(Math.min(1, h * 1.4), h * h * 0.55, 0);
    this.barrelMat.emissiveIntensity = h * 1.7;
    this.barrelMat.color.setRGB(0.25 + h * 0.47, 0.27 + h * 0.09, 0.31 - h * 0.12);
    if (h > 0.45) {
      this._smokeT -= dt;
      if (this._smokeT <= 0) {
        this._smokeT = 0.05; this.gun.updateMatrixWorld();
        const tip = this.gun.localToWorld((this._smokeLocal || new THREE.Vector3(0, 0.07, -1.45)).clone());
        this.game.effects._spawn({ pos: tip, vel: new THREE.Vector3(rr(-0.2, 0.2), rr(0.8, 1.8), rr(-0.2, 0.2)), life: rr(0.7, 1.5), size: rr(0.12, 0.28), grav: 1.4, drag: 1.0, color: new THREE.Color(h > 0.85 ? 0x888888 : 0x666666), bounce: 0, floorY: -999, shrink: true });
      }
    }
    if (firing) this._advanceBelt(dt * 1.1);
  }
}
