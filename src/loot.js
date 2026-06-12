// loot.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';
import { MeshBuilder, TAU, chc, clamp, pick, ri, rr, voxelMaterial } from './util.js';
import { FOOD_RESTORE } from './tuning.js';
import { KEY_CASH } from './economy.js';
import { _strut, buildChuteRig, buildFieldRadio, buildFlare, buildSu24, buildSupplyCrate } from './props.js';
import { FIREARM_KEYS, WEAPONS, buildViewmodel } from './weapons.js';
import { getSpec } from './props/registry-core.js';
import { buildSpec } from './props/voxel-interp.js';

const _flareWP = new THREE.Vector3();   // scratch: flare flame world-position (module-private; duplicated to avoid a cross-module import)


// Survival inventory items — held things that are NOT weapons (consumables/throwables/materials/callables).
// Kept PARALLEL to WEAPONS so the weapon pipe (WEAPON_ORDER / ownedOrder / refillAll) stays clean.
// `mesh` reuses LootManager._pickupMesh(kind); the molotov/flare reuse their own builders.
export const ITEM_DEFS = {
  medkit:  { name: 'Medkit',       class: 'consumable', icon: '🩺', mesh: 'medkit', heal: 35 },
  food:    { name: 'Field Ration', class: 'consumable', icon: '🥫', mesh: 'food',   food: 40 },
  armor:   { name: 'Armor Plate',  class: 'consumable', icon: '🛡', mesh: 'armor',  armor: 50 },
  ammo:    { name: 'Ammo Box',     class: 'consumable', icon: '📦', mesh: 'ammo' },
  dshkammo: { name: 'DShK Ammo Box', class: 'consumable', icon: '🟦', mesh: 'dshkammo' },
  fiftyammo: { name: '12.7mm Ammo Can', class: 'consumable', icon: '🟩', mesh: 'fiftyammo' }, // resupplies the rooftop heavy MG — used at the gun, not on hand weapons
  splint:  { name: 'Field Splint', class: 'consumable', icon: '🩹', mesh: 'splint' },
  airbeacon: { name: 'Vysílačka',  class: 'callable',   icon: '📡', mesh: 'airbeacon' },
  flare:   { name: 'Signal Flare', class: 'callable',   icon: '🔆', mesh: 'flare' },
  grenade: { name: 'Frag Grenade', class: 'throwable',  icon: '💣', mesh: 'grenade', fuse: 1.6 },
  molotov: { name: 'Molotov',      class: 'throwable',  icon: '🔥', mesh: 'molotov', ignite: 0.7 },
  sandbag: { name: 'Sandbag',      class: 'material',   icon: '🧱', build: 'sandbag' },
  wire:    { name: 'Barbed Wire',  class: 'material',   icon: '🔩', build: 'wire' },
  wood:    { name: 'Barricade',    class: 'material',   icon: '🪵', build: 'wood' },
  radio:   { name: 'Radio',        class: 'material',   icon: '📻', build: 'radio' },
};

// ---------------------------------------------------------------------------
// LootManager — pickups, the radio→Su-24 supply-drop, and OP loot crates.
// ---------------------------------------------------------------------------
export class LootManager {
  constructor(game) {
    this.game = game; this.scene = game.engine.scene;
    this.pickups = []; this.boxes = [];
    this.drops = []; this.nearDrop = null; // parachuting supply drops (radio-called)
    this.nearBox = null; this.prompt = null; this.nearPickup = null;
    this._pkSeq = 0; // host-only: monotonic id source for networked (shared) pickups
    this._buildLootboxes();
  }
  _nextPickupId() { return 'pk' + (++this._pkSeq); } // only the HOST ever mints pickup ids

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
    if (kind === 'dshkammo') { // Soviet DShK 12.7mm ammunition box (modelgen prop, real 0.29 m scale)
      const spec = getSpec('dshk-ammo-box');
      if (spec) {
        // spec groups are floor-anchored; recentre so the pickup bobs around its middle.
        // NOTE: scale stays 1 — the spec is authored in real metres. Needing a scale
        // fudge here means the spec units are wrong; fix the spec, not the call site.
        const g = new THREE.Group();
        const m = buildSpec(spec);
        m.position.y = -(spec.footprint?.h ?? 0.155) / 2;
        g.add(m);
        return g;
      }
      // Fallback if the spec fetch hasn't resolved (matches real 280×140×140 mm)
      const od = 0x4a5a2e, odHi = 0x6a7c42; // olive-drab
      b.box(0.28, 0.11, 0.14, 0, -0.015, 0, od); b.box(0.29, 0.03, 0.15, 0, 0.055, 0, odHi);
      return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x1a2410, emissiveIntensity: 0.5 }));
    }
    if (kind === 'radio') { const m = buildFieldRadio(); m.scale.multiplyScalar(0.5); return m; } // field-radio material as a ground pickup (from supply drops)
    if (kind === 'airbeacon') { // Falcon III-style military handheld radio (olive, antenna, green LCD, keypad, battery)
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
    if (kind === 'fiftyammo') { // US M2A1 .50-cal ammo can: olive-drab steel, hinged lid + front toggle latch, folding wire bail, yellow stencil rows
      const od = 0x4a5a2e, odHi = 0x6a7c42, odLo = 0x32401d, odSlot = 0x1f280f, odEdge = 0x808e4c; // olive-drab steel
      const mt = 0x6f7563, mtHi = 0x909686, mtDk = 0x383b2f;                                       // bare-steel fittings (latch/hinge)
      const wire = 0x2b2e22;                                                                       // dark-steel wire bail handle
      const stencil = 0xd8c038, stencilHi = 0xeede5a;                                              // yellow stencil paint
      // ---- body ----
      b.box(0.52, 0.32, 0.20, 0, -0.02, 0, od, { tint: 0.025 });        // main body
      b.box(0.50, 0.05, 0.20, 0, 0.155, 0, odHi);                       // lit lid top
      b.box(0.532, 0.035, 0.212, 0, -0.195, 0, odLo);                   // shadow base
      b.box(0.522, 0.016, 0.205, 0, 0.10, 0, odSlot);                   // lid seam (recess)
      b.box(0.51, 0.02, 0.205, 0, 0.125, 0, odHi);                      // lid lip (lit)
      b.box(0.016, 0.30, 0.022, -0.255, -0.02, 0.095, odEdge);          // front-left edge highlight
      b.box(0.016, 0.30, 0.022, 0.255, -0.02, 0.095, odEdge);          // front-right edge highlight
      b.box(0.44, 0.24, 0.012, 0, -0.05, 0.103, odLo, { tint: 0.02 }); // recessed front stencil panel (darker inset)
      // ---- yellow stencil rows (segmented blocks read as M2A1 markings) ----
      const rows = [
        { y: 0.045, segs: [[-0.13, 0.09], [-0.005, 0.05], [0.10, 0.10]] }, // 100 CRTG .50 CAL
        { y: 0.005, segs: [[-0.04, 0.14]] },                               // LINK M9
        { y: -0.035, segs: [[-0.08, 0.06], [0.04, 0.10]] },                // 4-BALL M33
        { y: -0.075, segs: [[-0.10, 0.07], [0.03, 0.12]] },                // 1-TRACER M17
        { y: -0.115, segs: [[-0.06, 0.20]] },                              // LC- lot number
      ];
      for (const row of rows) for (const [sx, sw] of row.segs) b.box(sw, 0.018, 0.006, sx, row.y, 0.112, stencil);
      b.box(0.09, 0.018, 0.006, -0.13, 0.045, 0.1125, stencilHi);       // brightest highlight on the top "100" group
      // ---- lid hinge (back, along X) + knuckles ----
      const hg = new THREE.CylinderGeometry(0.012, 0.012, 0.46, 8); b.geo(hg, 0, 0.12, -0.105, mt, { rz: Math.PI / 2 }); hg.dispose();
      for (const hx of [-0.18, 0, 0.18]) b.box(0.04, 0.04, 0.03, hx, 0.12, -0.10, mtDk);
      // ---- toggle latch on the RIGHT end (like the real M2A1) — clear of the front stencil ----
      b.box(0.05, 0.22, 0.10, 0.246, -0.01, 0, mt);                     // latch backplate on the right end face
      b.box(0.055, 0.05, 0.07, 0.256, 0.075, 0, mtHi);                  // upper catch (lit)
      b.box(0.045, 0.12, 0.05, 0.262, -0.04, 0, mtDk, { rz: 0.1 });     // toggle lever
      b.box(0.04, 0.03, 0.06, 0.256, -0.12, 0, mtHi);                   // hook tip
      // ---- folding wire bail handle (pivots at back-top corners, arches forward over the lid) ----
      b.box(0.035, 0.05, 0.035, -0.215, 0.165, -0.05, mt);             // left pivot post
      b.box(0.035, 0.05, 0.035, 0.215, 0.165, -0.05, mt);             // right pivot post
      b.box(0.022, 0.12, 0.022, -0.205, 0.225, 0.0, wire, { rx: -0.45 }); // left bail leg
      b.box(0.022, 0.12, 0.022, 0.205, 0.225, 0.0, wire, { rx: -0.45 });  // right bail leg
      b.box(0.45, 0.022, 0.022, 0, 0.275, 0.045, wire);               // bail cross-bar (grip)
      return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x1a2410, emissiveIntensity: 0.5 }));
    }
    // armor plate
    b.box(0.3, 0.34, 0.16, 0, 0, 0, 0x4f8fe0); b.box(0.16, 0.16, 0.06, 0, 0.02, 0.1, 0x9fd0ff);
    return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x002040, emissiveIntensity: 0.5 }));
  }

  // Roll a kill's GROUND items (host-authoritative in co-op via spawnNetPickup; local in solo). Returns the
  // rolled key-cash amount so the CALLER can attribute it to the actual KILLER (not whoever ran the roll —
  // which is now always the host in co-op). NOTE: key-cash is no longer granted here.
  drop(pos, def) {
    // key-cash (rolled here, granted by the caller to the killer)
    let keyCash = 0;
    if (def.boss) keyCash = KEY_CASH * 3;
    else { let keyChance = 0.16; if (def.explode || def.scale > 1.4) keyChance *= 1.5; if (chc(keyChance)) keyCash = KEY_CASH; }
    // health/ammo/armor — shared in co-op (host rolls + broadcasts), local in solo
    const roll = Math.random();
    if (roll < 0.05) this.spawnNetPickup('medkit', pos.x, pos.z, 35);
    else if (roll < 0.12) this.spawnNetPickup('ammo', pos.x, pos.z, 1);
    else if (roll < 0.16) this.spawnNetPickup('armor', pos.x, pos.z, 50);
    else if (roll < 0.185) this.spawnNetPickup('splint', pos.x, pos.z, 1);
    else if (roll < 0.215) this.spawnNetPickup('food', pos.x, pos.z, FOOD_RESTORE);
    else if (roll < 0.235) this.spawnNetPickup('molotov', pos.x, pos.z, 1);
    return keyCash;
  }

  _spawnPickup(kind, pos, value, life = 30, id = null) {
    const mesh = this._pickupMesh(kind);
    // networked pickups (id != null) carry authoritative coords → spawn EXACTLY there so all peers match;
    // solo/local pickups (id == null) jitter so a kill's items don't stack on one spot.
    if (id == null) mesh.position.set(pos.x + rr(-0.6, 0.6), 0.6, pos.z + rr(-0.6, 0.6));
    else mesh.position.set(pos.x, 0.6, pos.z);
    this.scene.add(mesh);
    this.pickups.push({ mesh, kind, value, t: rr(0, TAU), life, id });
  }

  // HOST-authoritative shared spawn: the host mints an id, jitters ONCE, spawns locally, and broadcasts the
  // exact coords so every client spawns the identical pickup. Solo spawns locally (jittered, id null). A
  // non-host client never spawns ground loot directly — it only receives 'pickup' messages.
  spawnNetPickup(kind, x, z, value, life = 30) {
    const mp = this.game.mp;
    if (mp && mp.active && mp.isHost) {
      const id = this._nextPickupId();
      const jx = x + rr(-0.6, 0.6), jz = z + rr(-0.6, 0.6);     // jitter ONCE on the host
      this._spawnPickup(kind, new THREE.Vector3(jx, 0.55, jz), value, life, id);
      mp.net.send('pickup', { id, kind, x: +jx.toFixed(2), z: +jz.toFixed(2), value, life });
    } else if (!mp || !mp.active) {
      this._spawnPickup(kind, new THREE.Vector3(x, 0.55, z), value, life);  // solo: local, jittered (id null)
    }
  }

  removePickupById(id) {
    const i = this.pickups.findIndex((p) => p.id === id); if (i < 0) return;
    const pu = this.pickups[i];
    this.scene.remove(pu.mesh); pu.mesh.geometry.dispose(); pu.mesh.material.dispose();
    this.pickups.splice(i, 1);
    if (this.nearPickup === pu) this.nearPickup = null;
  }

  // Destroy every ground pickup whose mesh is within radius r of (x,z). Host-authoritative: a non-host client
  // owns NO pile (the host clears it and broadcasts 'pickupgone' so client copies vanish), so it bails early.
  // Solo (mp inactive) removes locally with no net. Used by ALL explosions + the molotov fire pool (T9).
  clearPickupsInRadius(x, z, r) {
    const mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) return;        // only the host (or solo) owns the pile
    const r2 = r * r;
    for (let i = this.pickups.length - 1; i >= 0; i--) {       // iterate backwards — removal splices
      const pu = this.pickups[i];
      const px = pu.mesh.position.x - x, pz = pu.mesh.position.z - z;
      if (px * px + pz * pz > r2) continue;
      const id = pu.id;
      if (id != null) { this.removePickupById(id); if (mp && mp.active) mp.net.send('pickupgone', { id }); } // shared pickup → clear everywhere
      else this._removePickup(pu);                            // legacy/local (solo) pickup → remove locally, no broadcast
    }
  }

  // HOST only: a player claimed the pickup → dedupe (first claim wins), clear it everywhere, and authorize
  // the grant on the CLAIMER's machine (so held-gun-specific refills resolve on the right player).
  claimPickup(id, byId) {
    const pu = this.pickups.find((p) => p.id === id); if (!pu) return;   // already claimed → ignore (dedupe)
    const kind = pu.kind, value = pu.value;
    this.removePickupById(id);
    this.game.mp.net.send('pickupgone', { id });                          // clear it on every client
    if (byId === 'host' || byId === this.game.mp.myId) this._applyGrant(kind, value);  // host grabbed it
    else this.game.mp.net.sendTo(byId, 'pickupgrant', { kind, value });   // the claiming client applies the effect
  }

  // Apply a pickup's effect on the CLAIMER's machine. Mirrors the solo grab path (ammo → refill the held gun;
  // everything else → into the backpack). Returns false when the grab can't proceed (e.g. ammo with no gun
  // in hand, or a full backpack) so the caller can leave the pickup on the ground.
  _applyGrant(kind, value) {
    const inv = this.game.inventory;
    if (kind === 'ammo') { // ground ammo never enters the backpack — it tops up ONLY the gun in hand
      const r = this.game.weapons.refillHeld();
      if (!r.ok) {
        if (r.reason === 'full') this.game.hud.toast('Ammo reserve full', 0xb88a3a);
        else this.game.hud.toast('Hold a firearm to grab ammo', 0xd23a2a);
        return false;
      }
      this.game.audio.reloadClick(); this.game.hud.toast('Ammo · ' + WEAPONS[r.key].name, 0xb88a3a);
      return true;
    }
    if (inv.isFull()) { this.game.hud.toast('Inventory full — drop something (I)', 0xd23a2a); return false; }
    if (WEAPONS[kind]) this.game.weapons.grant(kind); // a dropped weapon → re-own it
    inv.addItem(kind, value);
    const label = WEAPONS[kind] ? WEAPONS[kind].name : (ITEM_DEFS[kind] ? ITEM_DEFS[kind].icon + ' ' + ITEM_DEFS[kind].name : kind);
    this.game.audio.buy(); this.game.hud.toast('Picked up ' + label, 0x7fd06a);
    return true;
  }

  // Backpack courier death → a radio + one configurable bonus. Items are shared in co-op (host-authoritative
  // via spawnNetPickup, so the radio reaches everyone); the cash-bonus branch is RETURNED so the caller can
  // grant it to the KILLER (not the host). Returns the rolled bonus cash (0 unless the cash branch hit).
  dropCourier(pos) {
    this.spawnNetPickup('airbeacon', pos.x, pos.z, 1);
    const r = Math.random();
    let bonusCash = 0;
    if (r < 0.4) this.spawnNetPickup('medkit', pos.x, pos.z, 60);
    else if (r < 0.7) this.spawnNetPickup('ammo', pos.x, pos.z, 1);
    else if (r < 0.9) this.spawnNetPickup('armor', pos.x, pos.z, 60);
    else bonusCash = KEY_CASH;
    this.game.hud.toast('📡 Vysílačka dropped! (press T)', 0x6fd0e8);
    return bonusCash;
  }

  // Radio call-in: a Su-24 streaks across the map and releases a parachute crate over a random spot.
  // Radio entry point: host/SP spawn the drop; a client asks the host (which rolls + broadcasts the replication spec).
  requestSupplyDrop() {
    const mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) { mp.net.send('dropreq', {}); this.game.hud.toast('📡 Radio: requesting drop…', 0x6fd0e8); return; }
    this.callSupplyDrop();
  }
  callSupplyDrop(spec) {
    const mp = this.game.mp;
    if (this.plane) { // a previous flyby is still airborne — tear it down first so its LOOPING jet clip doesn't orphan (the "double flyby sound") and its mesh doesn't leak
      if (this.plane.jet) this.plane.jet.stop();
      if (!this.plane.released) this._spawnDropCrate(this.plane.target, this.plane.mesh.position.y - 2, this.plane.dropId, this.plane.net); // still deliver its pending crate (don't waste the radio)
      this.scene.remove(this.plane.mesh); this.plane.mesh.geometry.dispose(); this.plane.mesh.material.dispose();
      this.plane = null;
    }
    let target, ang, id;
    if (spec) { target = new THREE.Vector3(spec.tx, 0, spec.tz); ang = spec.ang; id = spec.id; }      // client: mirror the host's flyby+crate (visual)
    else {
      const spots = this.game.world.lootSpots.length ? this.game.world.lootSpots : this.game.world.spawns;
      target = pick(spots).clone(); target.y = 0; ang = rr(0, TAU); id = (this._dropId = (this._dropId || 0) + 1);
      if (mp && mp.active && mp.isHost) mp.net.broadcast('supplydrop', { id, tx: target.x, tz: target.z, ang }); // everyone sees the same drop
    }
    const ALT = 38, R = 200, dx = Math.sin(ang), dz = Math.cos(ang);
    const mesh = buildSu24(); mesh.scale.setScalar(1.5); // bigger so the detail reads on the pass
    mesh.position.set(target.x - dx * R, ALT, target.z - dz * R);
    mesh.rotation.y = Math.atan2(dx, dz) + Math.PI; // model nose is -Z → add PI so the NOSE (not the tail) leads the travel direction
    this.scene.add(mesh);
    this.plane = { mesh, dir: new THREE.Vector3(dx, 0, dz), speed: 40, target, alt: ALT, travelled: 0, total: R * 3, released: false, trailT: 0, dropId: id, net: !!spec };
    this.game.hud.toast('📡 Radio: Su-24 inbound!', 0x6fd0e8);
    this.game.hud.bigMessage('ЗАПРОС ПОДТВЕРЖДЁН', 'a Fencer is making a pass — watch the smoke');
    this.game.audio.radioCall(); // Soviet-radio confirmation + epic WW2 sting
    this.plane.jet = this.game.audio.startJetClip() || (this.game.audio._jetFailed ? null : this.game.audio.startJet()); // real jet clip (fade in/out), else procedural (skipped if the clip already failed)
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
      if (ahead <= 0) { pl.released = true; this._spawnDropCrate(pl.target, pl.mesh.position.y - 2, pl.dropId, pl.net); this.game.audio.uiClick(); }
    }
    if (pl.travelled >= pl.total) { if (pl.jet) pl.jet.stop(); this.scene.remove(pl.mesh); pl.mesh.geometry.dispose(); pl.mesh.material.dispose(); this.plane = null; }
  }

  _spawnDropCrate(pos, fromY, id, isNet) {
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
    this.drops.push({ id, _net: !!isNet, grp, crate, chute, lines, flareMesh, flame, flameMat: flame.material, flareLight, flareLife: 20, flareSmokeT: 0, pos: pos.clone(), y: fromY, state: 'falling', sway: rr(0, TAU), opened: false });
    this.game.hud.toast('📦 Supply drop released!', 0xff8a3a);
  }

  _rollGive() { const give = { sandbag: 0, wire: 0, wood: 0 }, ks = ['sandbag', 'wire', 'wood']; for (let i = 0; i < 2; i++) give[ks[Math.floor(Math.random() * 3)]]++; return give; } // RARE: ~2 random fort. mats
  // Count radios currently in play — placed buildings + ground pickups + the (host/solo) backpack — so the
  // supply-drop roll never floods the field, yet a fresh one CAN drop again once the old one is gone/destroyed.
  // This is a LIVE count (not a one-shot "already dropped" flag), so destroying your radio re-enables drops.
  _radiosInPlay() {
    let n = 0;
    const b = this.game.build; if (b && b.structures) n += b.structures.filter((s) => s.kind === 'radio').length;
    if (this.pickups) n += this.pickups.filter((p) => p.kind === 'radio').length;
    const inv = this.game.inventory; if (inv && inv.slots) n += inv.slots.filter((s) => s && s.kind === 'radio').length;
    return n;
  }
  // Burst a landed crate open: scatter its contents as PHYSICAL ground pickups in a ring around the crate.
  // HOST-authoritative in co-op — the host rolls the GUN and spawns each item via spawnNetPickup so all
  // players see ONE shared pile (with ids). Loot only — supply drops give NO cash. (`opener` is unused now.)
  _spillDropLoot(pos, give, opener = null) {
    const cx = pos.x, cz = pos.z;
    const gun = FIREARM_KEYS[Math.floor(Math.random() * FIREARM_KEYS.length)]; // 100%: one guaranteed random firearm, any kind (rolled on the host)
    const items = [[gun, 1], ['medkit', 60], ['medkit', 60], ['armor', 60], ['armor', 60], ['ammo', 1], ['ammo', 1], ['food', FOOD_RESTORE]];
    const g = give || {};
    for (const k of ['sandbag', 'wire', 'wood']) for (let n = 0; n < (g[k] || 0); n++) items.push([k, 1]); // ~2 random fort. mats
    if (this._radiosInPlay() === 0 && chc(0.30)) items.push(['radio', 1]); // 📻 30% chance to drop a Radio — only when none is currently in play
    if (chc(0.40)) items.push(['fiftyammo', 1]); // 🟩 40% chance: a 12.7mm ammo can to resupply the rooftop heavy MG
    items.forEach(([kind, value], i) => {
      const a = (i / items.length) * TAU + rr(-0.25, 0.25), r = rr(1.0, 1.7); // scatter in a ring around the crate
      this.spawnNetPickup(kind, cx + Math.cos(a) * r, cz + Math.sin(a) * r, value, 75); // 75s life — shared (host) / local (solo)
    });
    this.game.effects.stuffing(new THREE.Vector3(cx, 1.4, cz), 0xffc23a, 36, 8);
    this.game.hud.toast('📦 Supply drop burst open — grab the loot!', 0xff8a3a);
    this.game.hud.bigMessage('SUPPLY DROP', 'loot scattered on the ground — grab it with E');
    this.game.audio.buy();
  }
  _removeDrop(d) { this._disposeDrop(d); const i = this.drops.indexOf(d); if (i >= 0) this.drops.splice(i, 1); }
  removeDropById(id) { const d = this.drops.find((x) => x.id === id && !x.opened); if (d) { d.opened = true; this._removeDrop(d); } } // a teammate claimed it → clear the visual
  _openDrop(d) {
    if (d.opened) return;
    const mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) {                 // client: this is a visual crate → ask the host (it grants + dedupes)
      if (d.id != null) mp.net.send('dropopen', { id: d.id });
      d.opened = true; this.game.effects.stuffing(d.pos.clone().setY(1.4), 0xffc23a, 32, 7); this._removeDrop(d); return;
    }
    d.opened = true;                                     // host / single-player: authoritative spill
    this._spillDropLoot(d.pos, this._rollGive());
    if (mp && mp.active && mp.isHost && d.id != null) mp.net.broadcast('dropopened', { id: d.id });
    this._removeDrop(d);
  }
  _disposeDrop(d) {
    this.scene.remove(d.grp);
    d.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }

  openNearby() {
    if (this.nearDrop) { this._openDrop(this.nearDrop); this.nearDrop = null; return true; } // claim a landed supply drop (no key needed; map lootboxes are gone)
    return false;
  }
  // E-pickup: put the nearest ground item into the backpack (no auto-walkover). Returns true if it consumed the E press.
  tryPickupNearby() {
    const pu = this.nearPickup; if (!pu) return false;
    const inv = this.game.inventory, mp = this.game.mp;
    // CO-OP shared pickup (has an id): don't grab locally — ask the host to authorize the claim. The grant
    // (effect) + removal come back authoritatively, so two players can't both get it. We still pre-check the
    // local guards (full backpack / ammo-needs-a-gun) so we never claim something we can't actually take.
    if (mp && mp.active && pu.id != null) {
      if (pu.kind === 'ammo') {
        if (!this.game.weapons.heldRefillable()) { this.game.hud.toast('Hold a firearm with room for ammo', 0xd23a2a); return true; } // leave it on the ground
      } else if (inv.isFull()) { this.game.hud.toast('Inventory full — drop something (I)', 0xd23a2a); return true; }
      if (mp.isHost) this.claimPickup(pu.id, 'host');
      else mp.net.send('pickupclaim', { id: pu.id });
      this.nearPickup = null;
      return true;
    }
    // SOLO, or a legacy/local pickup with no id: grab + apply locally (unchanged behaviour).
    if (pu.kind === 'ammo') { // ground ammo never enters the backpack — it tops up ONLY the gun in hand (you pick which by holding it)
      const r = this.game.weapons.refillHeld();
      if (!r.ok) {
        if (r.reason === 'full') this.game.hud.toast('Ammo reserve full', 0xb88a3a);
        else this.game.hud.toast('Hold a firearm to grab ammo', 0xd23a2a);
        return true; // leave the box on the ground — switch to a gun and grab it again
      }
      this.game.audio.reloadClick(); this.game.hud.toast('Ammo · ' + WEAPONS[r.key].name, 0xb88a3a);
      this._removePickup(pu); this.nearPickup = null;
      return true;
    }
    if (inv.isFull()) { this.game.hud.toast('Inventory full — drop something (I)', 0xd23a2a); return true; }
    if (WEAPONS[pu.kind]) this.game.weapons.grant(pu.kind); // a dropped weapon → re-own it
    inv.addItem(pu.kind, pu.value);
    const label = WEAPONS[pu.kind] ? WEAPONS[pu.kind].name : (ITEM_DEFS[pu.kind] ? ITEM_DEFS[pu.kind].icon + ' ' + ITEM_DEFS[pu.kind].name : pu.kind);
    this.game.audio.buy(); this.game.hud.toast('Picked up ' + label, 0x7fd06a);
    this._removePickup(pu);
    this.nearPickup = null;
    return true;
  }
  _removePickup(pu) { this.scene.remove(pu.mesh); pu.mesh.geometry.dispose(); pu.mesh.material.dispose(); const idx = this.pickups.indexOf(pu); if (idx >= 0) this.pickups.splice(idx, 1); }
  promptPickup() { if (!this.nearPickup) return null; const k = this.nearPickup.kind; if (k === 'ammo') return 'Press <b>E</b> to load ammo into the gun in hand'; const label = WEAPONS[k] ? WEAPONS[k].name : (ITEM_DEFS[k] ? ITEM_DEFS[k].icon + ' ' + ITEM_DEFS[k].name : k); return 'Press <b>E</b> to pick up ' + label; }

  update(dt) {
    const p = this.game.player, pp = p.pos;
    // pickups — NO auto-walkover: float + despawn on life, track the NEAREST in range for E-pickup into the backpack
    this.nearPickup = null; let npd = 1.7;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pu = this.pickups[i];
      pu.t += dt * 2; pu.life -= dt;
      // on terrain maps settle pickups to ground height; flat maps keep y=0.55 (unchanged)
      const _gy = this.game.world.hasTerrain ? this.game.world.terrain.terrainHeightAt(pu.mesh.position.x, pu.mesh.position.z) : 0;
      pu.mesh.position.y = _gy + 0.55 + Math.sin(pu.t) * 0.12; pu.mesh.rotation.y += dt * 2;
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
        // settle on terrain height (flat maps: 0)
        const _landY = (this.game.world.hasTerrain ? this.game.world.terrain.terrainHeightAt(d.pos.x, d.pos.z) : 0) + 0.1;
        if (d.y <= _landY) { d.y = _landY; d.state = 'landed'; d.grp.position.set(d.pos.x, _landY, d.pos.z); d.chute.visible = false; d.lines.visible = false; this.game.hud.toast('📦 Drop landed — go grab it!', 0xff8a3a); this.game.audio.buy(); }
        else d.grp.position.set(d.pos.x + Math.sin(d.sway) * 1.0, d.y, d.pos.z + Math.cos(d.sway * 0.8) * 1.0);
      } else {
        d.crate.material.emissiveIntensity = 0.6 + Math.sin(d.t * 4) * 0.25;
        const dd = Math.hypot(d.pos.x - pp.x, d.pos.z - pp.z);
        if (!d.opened && dd < ndd) { ndd = dd; this.nearDrop = d; }
      }
    }
    this.prompt = this.nearDrop ? 'Press <b>E</b> to grab the <b>SUPPLY DROP</b> — OP loot!' : null;
  }


  reset() {
    for (const pu of this.pickups) { this.scene.remove(pu.mesh); pu.mesh.geometry.dispose(); pu.mesh.material.dispose(); }
    this.pickups.length = 0; this._pkSeq = 0;
    for (const d of this.drops) this._disposeDrop(d);
    this.drops.length = 0; this.nearDrop = null; this.nearPickup = null;
    if (this.plane) { if (this.plane.jet) this.plane.jet.stop(); this.scene.remove(this.plane.mesh); this.plane.mesh.geometry.dispose(); this.plane.mesh.material.dispose(); this.plane = null; }
  }
}
