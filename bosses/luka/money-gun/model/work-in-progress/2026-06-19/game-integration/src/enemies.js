// enemies.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';
import { MeshBuilder, TAU, chc, clamp, pick, randRange, rayAABB, rr, shade, voxelMaterial } from './util.js';
import { ENEMY_BURN_SLOW } from './tuning.js';
import { STRUCT_DEFS } from './economy.js';
import { _tankWrecks, animateTank, buildTank, buildTankWreck, tankGroundFX, updateTankLights } from './bosstank.js';
import { buildLuka, buildLukaCoin, buildMoneyBag, buildTopHat, buildMoneyGun, buildSmokeBomb, lukaAnchor, lukaAnchorA, LUKA_DOLLAR, LUKA_DUST, LUKA_PROP, COIN_PAL } from './lukaboss.js';
import { preloadLukaGun, lukaGunReady, buildLukaGun } from './lukagun.js';
import { LukaGunFX } from './lukagunfx.js';

// Luka's real 3D money gun (GLB) — transform in Luka's hand. Template is unit-length;
// scale is × bake.S like the other props. Tuned against an in-game render.
const LUKA_GUN_GLB = {
  scale: 0.431,                     // unit-length template → gun size in Luka's hand
  rot:   [0, -Math.PI / 2, 0],      // glb muzzle (+X) → mesh +Z (Luka's aim), matching the voxel gun
  barrelStep: Math.PI / 2,          // fallback: one quarter-turn per shot if no baked clips
  fireTimeScale: 1,                 // dílní rychlost (1×): deliberate ~1.25s fire cycle, FX synced to the animation
};
import { CapturedTank } from './vehicles.js';
import { buildNavGrid, findPath } from './pathing.js';


// ---------------------------------------------------------------------------
// Engendros — voodoo-plush enemies. Round ball head, big button eye, stitched
// "X" smile, thread-tuft hair, stubby limbs. Built once per color, shared.
// ---------------------------------------------------------------------------
export const ENGENDRO_COLORS = [
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
export function buildEngendro(col, variant = 'normal') {
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
export function buildTolo() {
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

export const ENEMY_TYPES = {
  swarmer:  { hp: 28,  speed: 4.1,  dmg: 4,  reward: 30,  scale: 0.55, variant: 'normal' },
  runner:   { hp: 55,  speed: 3.4,  dmg: 6,  reward: 55,  scale: 0.85, variant: 'normal' },
  grunt:    { hp: 95,  speed: 2.0,  dmg: 9,  reward: 50,  scale: 1.0,  variant: 'normal' },
  charger:  { hp: 120, speed: 4.4,  dmg: 0,  reward: 130, scale: 1.0,  variant: 'charger', explode: true, charger: true, explodeDmg: 55, explodeRadius: 5.2 },
  exploder: { hp: 80,  speed: 2.4,  dmg: 8,  reward: 95,  scale: 1.0,  variant: 'exploder', explode: true, explodeDmg: 38, explodeRadius: 5.5 },
  brute:    { hp: 300, speed: 1.35, dmg: 20, reward: 130, scale: 1.6,  variant: 'normal' },
  titan:    { hp: 640, speed: 1.1,  dmg: 30, reward: 260, scale: 2.05, variant: 'normal' },
  minitolo: { hp: 45,  speed: 3.9,  dmg: 14, reward: 25,  scale: 0.6,  variant: 'normal' },
  boss:     { hp: 3200, speed: 1.0, dmg: 32, reward: 1200, scale: 2.5, variant: 'boss', boss: true, laser: true },
  luka:     { hp: 3200, speed: 2.4, dmg: 18, reward: 1400, scale: 2.5, variant: 'luka', boss: true, money: true }, // mobile money boss — 4 phases, no laser
  tank:     { hp: 3600, armorHP: 3600, mitriHP: 750, speed: 1.2, dmg: 40, reward: 1500, scale: 1, // scale 1 = placeholder; real model later
              variant: 'tank', boss: true, tank: true, armored: true, explosiveMult: 2.0 },
};

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
    // boss state (Tolo)
    this.phase = 1; this.laserCD = 3.2; this.charging = 0; this.addCD = 0; this.beamLife = 0;
    this.aim = new THREE.Vector3();
    this.invuln = 0;          // i-frames during a phase transition (boss stands still & shudders)
    this.baseSpeed = speed;   // phase speed scaling multiplies this (p1 ×1.0, p2 ×1.12, p3 ×1.20)
    this.shotsLeft = 0; this.shotCD = 0; this._chargeDur = 0.85; // phase-1 blaster burst
    this.sweepT = 0; this.sweepActive = false; this.sweepBase = 0; this.sweepPass = 0; // phase-2/3 sweep (later step)
    this._path = null; this._pathIdx = 0; this._pathT = 0; // boss grid-A* nav state (Tolo/Luka)
    // boss state (Luka) — mobile 4-phase money boss
    this.lukaCD = 1.6; this.lukaWind = 0; this.lukaShake = 0; this.lukaCampT = 0; this._lukaRoot = false;
    this.lukaF2 = null; this._lukaF2state = 0; this._lukaGunCd = 0; this._dollarEvolveIn = 0; this._dollarFlash = 0; this._bombState = null; this._bombT = 0; this._smokeT = 0; this._itemT = -1; this._lukaRingT = -1;
    if (this._lukaDollar) { this._lukaDollar.visible = false; this._lukaDollar.material.color.setHex(LUKA_DOLLAR[1]); this._lukaDollar.scale.setScalar(1); } // reset belly $ to phase-1 + hidden until setup
    if (this._lukaBag) this._lukaBag.visible = false;
    if (this._lukaHat) this._lukaHat.visible = false;
    if (this._lukaGun) this._lukaGun.visible = false;
    if (this._lukaClump) this._lukaClump.visible = false;
    if (this._lukaRing) this._lukaRing.material.opacity = 0;
    if (this._lukaBomb) this._lukaBomb.visible = false;
    if (this._lukaEmber) this._lukaEmber.visible = false;
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

export class EnemyManager {
  constructor(game) {
    this.game = game; this.world = game.world;
    this.geos = {}; // geoKey -> geometry
    this.pool = {};  // geoKey -> Enemy[]
    this.active = []; this._idc = 0;
    this._min = new THREE.Vector3(); this._max = new THREE.Vector3();
    this.bossBolts = []; // BOSS TOLO phase-1 blaster bolts (traveling projectiles)
    this.bossFires = []; // BOSS TOLO phase-3 lingering fire zones (area denial)
    this.lukaCoins = []; // BOSS LUKA flying coins (f1 fountain / f2 throw / f4 gun) — dmg while airborne
    this.lukaBags = [];  // BOSS LUKA lobbed money bags (f3/f4) — splash + cosmetic coin scatter on impact
    this._lukaCoinGeo = {}; // shared coin geometry per variant
    this._lukaCoinMat = {}; // shared coin material per variant
    this._ghostBolts = []; // CLIENT visual-only boss bolts (relayed from host via 'bossfx')
    this._ghostBeam = null; // CLIENT visual-only sweep beam
    this._ghostFires = []; // CLIENT visual-only fire-zone flicker markers
    this._ghostAimRing = null; // CLIENT visual-only tank cannon aim ring
    this._navGrid = null; // boss A* occupancy grid (built once, lazily, on first boss spawn)
    this.lukaFX = null;   // BOSS LUKA money-gun black-powder FX (sparks + muzzle blast), lazy — see _fx()
    preloadLukaGun().catch(() => {}); // async-load Luka's 3D money gun; voxel fallback until ready
  }
  // Luka gun FX system (lazy: scene must exist) — ported 1:1 from money-gun-dilna.html
  _fx() { return this.lukaFX || (this.lukaFX = new LukaGunFX(this.game.engine.scene)); }
  _geo(key, col, variant) {
    if (this.geos[key]) return this.geos[key];
    if (variant === 'luka') { const r = buildLuka(); this.geos.lukaDollar = r.dollar; this._lukaBake = r.bake; return (this.geos[key] = r.geo); }
    return (this.geos[key] = (variant === 'boss' ? buildTolo() : buildEngendro(col, variant)));
  }
  // shared coin geometry/material per variant (silver|gold|copper), built lazily for Luka's projectiles
  _coinGeo(variant) { return this._lukaCoinGeo[variant] || (this._lukaCoinGeo[variant] = buildLukaCoin(variant)); }
  _coinMat(variant) { return this._lukaCoinMat[variant] || (this._lukaCoinMat[variant] = voxelMaterial()); }
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
    else if (typeKey === 'luka') { col = { body: 0x3DA63A, name: 'Luka' }; geoKey = 'luka'; name = 'BOSS LUKA'; }
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
    if (typeKey === 'luka') this._lukaSetup(e);
    if ((typeKey === 'boss' || typeKey === 'luka') && !this._navGrid) this._navGrid = buildNavGrid(this.world); // build the A* grid once a walking boss arrives
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
    if (this.lukaFX) this.lukaFX.update(dt); // advance Luka gun blast particles (runs even after Luka dies → smoke lingers)
    const pp = this.game.player.pos;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (!e.alive) { this.active.splice(i, 1); continue; }
      if (e.isTank) { this._bossTank(e, dt); continue; }
      let tgt = pp, tgtId = 'host'; const _mp = this.game.mp; if (_mp && _mp.active && _mp.isHost) { const _np = _mp.nearestPlayer(e.pos.x, e.pos.z); if (_np) { tgt = _np.pos; tgtId = _np.id; } } e._tgtId = tgtId;
      let dx = tgt.x - e.pos.x, dz = tgt.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 1; dx /= dist; dz /= dist;

      // BOSS TOLO: grid-A* navigation — steer toward the next waypoint so the
      // giant routes AROUND buildings instead of wedging in a corner. Falls back
      // to the direct heading (below) when close or in clear line of sight.
      if (e.def.boss) { const wp = this._bossWaypoint(e, tgt, dist, dt); if (wp) { const wxp = wp.x - e.pos.x, wzp = wp.z - e.pos.z, wlp = Math.hypot(wxp, wzp) || 1; dx = wxp / wlp; dz = wzp / wlp; } }

      // separation
      let sx = 0, sz = 0;
      for (const o of this.active) {
        if (o === e || !o.alive) continue;
        const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, d2 = ox * ox + oz * oz;
        if (d2 < 2.6 && d2 > 1e-4) { const inv = 1 / Math.sqrt(d2); sx += ox * inv; sz += oz * inv; }
      }
      // crate avoidance
      let ax = 0, az = 0;
      for (const b of this.world.grid.queryAABB(e.pos.x - 1.8, e.pos.z - 1.8, e.pos.x + 1.8, e.pos.z + 1.8)) {
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
      const _sepW = e.def.boss ? 0 : 0.6; // Tolo is a giant — small mobs can't shove him off; he beelines for the nearest player
      const wx = beeline ? dx : dx + sx * _sepW + ax, wz = beeline ? dz : dz + sz * _sepW + az, wl = Math.hypot(wx, wz) || 1;
      const _wz = this.game.build.hazardAt(e.pos.x, e.pos.z); // barbed-wire hazard: slow + DoT + trample
      const _bossRooted = e.def.boss && (e.charging > 0 || e.sweepActive || e.invuln > 0 || e.shotsLeft > 0 || e._lukaRoot); // boss stands still while attacking / transitioning
      const spd = (_bossRooted ? 0 : e.speed) * (e.squash > 0 ? 0.3 : (e.burnT > 0 ? ENEMY_BURN_SLOW : 1)) * (_wz ? STRUCT_DEFS.wire.slow : 1);
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
      const _cr = e.radius + 1.5; // query window (radius + slack); whole-cell results over-cover the small push-out
      for (const b of this.world.grid.queryAABB(e.pos.x - _cr, e.pos.z - _cr, e.pos.x + _cr, e.pos.z + _cr)) {
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

      // body-block vs the player: a regular mob can't interpenetrate the player capsule — shove the
      // enemy back out to the contact ring so it stops at arm's length instead of clipping into the
      // camera. (Boss Tolo is exempt — it's a scripted, immovable giant; tanks never reach this loop.)
      if (!e.def.boss) {
        const minD = e.radius + this.game.player.radius;
        let bx = e.pos.x - tgt.x, bz = e.pos.z - tgt.z; const bd = Math.hypot(bx, bz);
        if (bd < minD) {
          if (bd > 1e-4) { bx /= bd; bz /= bd; }                  // normal: out along player→enemy
          else if (Math.hypot(dx, dz) > 1e-4) { bx = -dx; bz = -dz; } // dead-center: shove back along approach
          else { bx = 1; bz = 0; }                                // fully degenerate: any direction
          e.pos.x = tgt.x + bx * minD; e.pos.z = tgt.z + bz * minD;
        }
      }

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
      if (e.def.boss) { if (e.type === 'luka') this._bossLuka(e, dt); else this._bossTolo(e, dt); }
    }
    this._updateBossBolts(dt);
    this._updateBossFires(dt);
    this._updateLukaProj(dt);
    if (this._aimRing && this._aimRingT > 0) { this._aimRingT -= dt; this._aimRing.material.opacity = Math.max(0, this._aimRingT) * 1.05; }
    if (this.shells) for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i]; s.fuse -= dt; s.vel.y -= s.grav * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const p = s.mesh.position; let boom = p.y < 0.2 || s.fuse <= 0;
      if (!boom && this._playerHitByPoint(p, 1.5)) boom = true; // proximity detonation near ANY living player
      if (!boom) { const wh = this.world.rayHit(p, this._downV || (this._downV = new THREE.Vector3(0, -1, 0)), 0.4); if (wh) boom = true; }
      if (boom) {
        this.game.effects.explosion(p.clone(), s.radius);
        this.game._bossFx('shell', { p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], s: s.radius }); // clients see/hear the tank cannon blast
        this.game._explodeHurt(p.clone ? p.clone() : p, s.radius, s.dmg); // splash fans out to ALL players w/ falloff
        this.game.loot.clearPickupsInRadius(p.x, p.z, s.radius); // tank shell blast destroys ground items (this loop is host/solo-only — clients don't tick enemies.update)
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
    { const _mp = this.game.mp; if (_mp && _mp.active && _mp.isHost) _mp.net.broadcast('fx', { e: 'laser', p: [+belly.x.toFixed(2), +belly.y.toFixed(2), +belly.z.toFixed(2)], d: [+dir.x.toFixed(3), +dir.y.toFixed(3), +dir.z.toFixed(3)] }); } // clients see/hear the boss beam
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

  // Co-op: resolve the boss/tank's current target — nearest living player on the host, else the local player.
  _tgt(e) {
    const mp = this.game.mp;
    if (mp && mp.active && mp.isHost) { const np = mp.nearestPlayer(e.pos.x, e.pos.z); if (np) { e._tgtId = np.id; return np.pos; } }
    e._tgtId = 'host';
    return this.game.player.pos;
  }
  // Co-op: which living player (id) is within r of a world point — host + remotes; nearest wins. Solo → 'host' if the local player is in range.
  _playerHitByPoint(p, r) {
    const mp = this.game.mp; let best = r, hit = null;
    const consider = (id, px, py, pz) => { const d = Math.hypot(px - p.x, (py + 1.0) - p.y, pz - p.z); if (d < best) { best = d; hit = id; } };
    if (mp && mp.active && mp.isHost) {
      const s = mp.pstate.get('host'); if (!(s && (s.down || s.dead || s.waiting))) consider('host', this.game.player.pos.x, this.game.player.pos.y, this.game.player.pos.z);
      for (const [id, rp] of mp.remotes) { if (rp.down || rp.dead || rp.waiting) continue; consider(id, rp.pos.x, rp.pos.y, rp.pos.z); }
    } else { consider('host', this.game.player.pos.x, this.game.player.pos.y, this.game.player.pos.z); }
    return hit;
  }

  // Belly bullseye = the laser emitter AND the only weak spot. Phases gate by HP:
  //   1 (>66%) blaster burst · 2 (33–66%) sweep · 3 (<33%) double sweep + fire (sweep/fire land in later steps).
  _bossTolo(e, dt) {
    const pp = this._tgt(e);
    this.game.hud.setBoss(e.hp / e.maxHp, e.name);

    // belly-bullseye glow telegraphs the charge (lazy child of the boss mesh, the laser emitter)
    if (!e._tolGlow) {
      e._tolGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 22),
        new THREE.MeshBasicMaterial({ color: 0xff2436, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      e._tolGlow.rotation.x = Math.PI / 2; e._tolGlow.position.set(0, 0.6, 0.42); e._tolGlow.renderOrder = 999;
      e.mesh.add(e._tolGlow);
    }
    // fade the single-beam placeholder used by phases 2/3 until the real sweep lands
    if (e.beamLife > 0 && e._beam) { e.beamLife -= dt; e._beam.material.opacity = Math.max(0, e.beamLife / 0.18); if (e.beamLife <= 0) e._beam.visible = false; }

    // ── phase gates by HP — 1: >66% · 2: 33–66% · 3: <33% ──
    const want = e.hp > e.maxHp * 0.66 ? 1 : (e.hp > e.maxHp * 0.33 ? 2 : 3);
    if (want > e.phase) {
      e.phase = want; e.invuln = 3.0;                  // 3s i-frames so the player notices the shift
      e.charging = 0; e.shotsLeft = 0; e.sweepActive = false; e.sweepT = 0; e.laserCD = 1.2;
      e.speed = e.baseSpeed * (want === 3 ? 1.20 : 1.12); // each phase a bit faster (fat → still not free)
      if (e._beam) e._beam.visible = false;
      this.game.hud.bigMessage('TOLO ZUŘÍ', want === 2 ? 'nastává fáze 2 — laserový sweep!' : 'nastává fáze 3 — žhavá zkáza!');
      this.game.audio.tone(200, 0.5, 'sawtooth', 0.4);
      this.game._bossFx('banner', { title: 'TOLO ZUŘÍ', sub: want === 2 ? 'nastává fáze 2 — laserový sweep!' : 'nastává fáze 3 — žhavá zkáza!' });
    }

    // ── phase-change i-frames: stand still, shudder, leak stuffing, no attacks ──
    if (e.invuln > 0) {
      e.invuln -= dt;
      e._tolGlow.material.opacity = 0.30 + 0.22 * Math.sin(e.bob * 6);
      e.mesh.rotation.z = Math.sin(e.bob * 8) * 0.13;
      if (Math.random() < 0.3) this.game.effects.stuffing(new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z), e.col.body, 3, 4);
      return;
    }

    // ── an attack is mid-flight ──
    if (e.shotsLeft > 0) { this._bossBurst(e, dt); return; }
    if (e.sweepActive)   { this._bossSweep(e, dt); return; }

    // ── charge telegraph: terčík se nabíjí = the ONLY window to damage Tolo ──
    if (e.charging > 0) {
      e.charging -= dt;
      const f = 1 - e.charging / e._chargeDur;
      e._tolGlow.material.opacity = 0.95 * f; e._tolGlow.scale.setScalar(0.7 + f * 0.7);
      if (e.charging <= 0) {
        e.aim.set(pp.x - e.pos.x, (pp.y + 1.0) - (e.pos.y + 0.6 * e.scale), pp.z - e.pos.z).normalize();
        if (e.phase === 1) { e.shotsLeft = 5; e.shotCD = 0; }  // 5 blaster bolts
        else this._beginSweep(e);                              // phase 2/3: sweeping beam
      }
      return;
    }

    // ── idle: tick down to the next attack, then start charging ──
    if (e._tolGlow.material.opacity > 0.02) e._tolGlow.material.opacity *= 0.82;
    e.laserCD -= dt;
    if (e.laserCD <= 0) {
      e.laserCD = e.phase === 3 ? 4.0 : (e.phase === 2 ? 5.0 : 3.8);
      e._chargeDur = e.phase === 1 ? 0.85 : 0.7;
      e.charging = e._chargeDur;
      this.game._bossFx('glow', { id: e.id, f: 1 }); // telegraph the charge to clients (the only damage window)
    }
  }

  // Phase 1: a short burst of 5 thin red blaster bolts at the locked aim. Anti-camp: tight cone
  // when the player stands still (~60% hit feel), wide cone when they strafe (~35%).
  _bossBurst(e, dt) {
    e.shotCD -= dt;
    if (e.shotCD > 0) return;
    e.shotCD = 0.22; e.shotsLeft--;
    const moving = (e._tgtId === 'host') ? (Math.hypot(this.game.player.vel.x, this.game.player.vel.z) > 1.5) : true;
    const spread = moving ? 0.14 : 0.05;
    const a = e.aim.clone();
    a.x += rr(-spread, spread); a.y += rr(-spread * 0.4, spread * 0.4); a.z += rr(-spread, spread);
    a.normalize();
    this._spawnBolt(e, a);
    this.game.audio.tone(1300, 0.07, 'square', 0.3);
    if (e.shotsLeft <= 0) e._tolGlow.material.opacity = 0;
  }

  _spawnBolt(e, dir) {
    const belly = new THREE.Vector3(e.pos.x, e.pos.y + 0.6 * e.scale, e.pos.z + 0.4 * e.scale);
    if (!this._boltGeo) this._boltGeo = new THREE.BoxGeometry(0.18, 0.18, 1.6);
    const m = new THREE.Mesh(this._boltGeo, new THREE.MeshBasicMaterial({ color: 0xff2436, fog: false, depthWrite: false }));
    m.renderOrder = 998; m.position.copy(belly); m.lookAt(belly.clone().add(dir));
    this.game.engine.scene.add(m);
    this.bossBolts.push({ mesh: m, dir: dir.clone(), spd: 55, life: 70 / 55, dmg: e.def.dmg }); // range = 50% of the 140-wide arena
    this.game.effects.muzzleFlash(belly, dir, 2.0);
    this.game._bossFx('bolt', { p: [+belly.x.toFixed(2), +belly.y.toFixed(2), +belly.z.toFixed(2)], d: [+dir.x.toFixed(3), +dir.y.toFixed(3), +dir.z.toFixed(3)] });
  }

  _updateBossBolts(dt) {
    if (!this.bossBolts.length) return;
    for (let i = this.bossBolts.length - 1; i >= 0; i--) {
      const b = this.bossBolts[i];
      const step = b.spd * dt, m = b.mesh.position;
      let dead = false;
      // can't shoot through walls / objects: stop at the first solid hit this step
      const wh = this.game.world.rayHit(m, b.dir, step);
      if (wh) { this.game.effects.muzzleFlash(wh.point, b.dir, 1.4); dead = true; }
      m.addScaledVector(b.dir, step); b.life -= dt;
      // shred any other mob caught in the bolt (lots of damage), but never Tolo himself
      if (!dead) {
        for (const en of this.active) {
          if (!en.alive || en.def.boss) continue;
          if (Math.hypot(m.x - en.pos.x, m.z - en.pos.z) < en.radius + 0.4) { this.damage(en, 9999, 'gun', m.clone()); dead = true; break; }
        }
      }
      if (!dead && b.life <= 0) dead = true;
      if (!dead) { const hid = this._playerHitByPoint(m, 1.1); if (hid) { this.game._hurtTarget(hid, b.dmg); dead = true; } }
      if (dead) { if (b.mesh.parent) b.mesh.parent.remove(b.mesh); b.mesh.material.dispose(); this.bossBolts.splice(i, 1); }
    }
  }

  // Feedback when shots hit Tolo anywhere but the charging bullseye — a small puff + faint tink.
  _bossDeflect(e, hitPoint) {
    if (hitPoint) this.game.effects.stuffing(hitPoint, e.col.body, 2, 2);
    if (Math.random() < 0.25) this.game.audio.tone(420, 0.04, 'square', 0.16);
  }
  // Tolo no longer has hard immunity: a bullseye-in-window hit OR a bazooka does FULL/near-full
  // damage ("effective"), everything else only chips (0.2×). Give the player a clear cue — a
  // satisfying thunk + a yellow crosshair flash — routed to whoever actually landed the hit.
  _bossHit(e, hitPoint, effective, attacker) {
    if (!effective) { this._bossDeflect(e, hitPoint); return; }           // weak chip — reuse the tink/puff
    if (hitPoint) this.game.effects.stuffing(hitPoint, e.col.body, 6, 4);  // bigger stuffing burst (host-side visual)
    if (attacker === 'host') { this.game.audio.bossHit(); this.game.hud.bossHitCue(); } // solo / host's own hit
    else { const mp = this.game.mp; if (mp && mp.active && mp.isHost && mp.net) mp.net.sendTo(attacker, 'bosshit', {}); } // co-op: cue the shooter's client
  }
  // BOSS TOLO grid-A* steering target. Returns the next waypoint to walk toward, or null to
  // fall back to the direct beeline (when close, in clear line of sight, or no path exists).
  _bossWaypoint(e, tgt, dist, dt) {
    if (dist < 6) { e._path = null; return null; }                        // close — let direct steering + collision finish
    const o = this._navEye || (this._navEye = new THREE.Vector3());
    const d = this._navDir || (this._navDir = new THREE.Vector3());
    o.set(e.pos.x, 1.6, e.pos.z); d.set(tgt.x - e.pos.x, 0, tgt.z - e.pos.z).normalize();
    if (!this.world.rayHit(o, d, dist - 0.5)) { e._path = null; return null; } // clear shot to the player → beeline
    e._pathT -= dt;
    if (e._pathT <= 0 || !e._path || e._pathIdx >= e._path.length) {       // recompute periodically / when consumed
      e._pathT = 0.5;
      if (!this._navGrid) this._navGrid = buildNavGrid(this.world);
      e._path = findPath(this._navGrid, e.pos.x, e.pos.z, tgt.x, tgt.z); e._pathIdx = 0;
    }
    if (!e._path || !e._path.length) return null;
    const reach = this._navGrid.cell * 0.9;
    while (e._pathIdx < e._path.length) { const w = e._path[e._pathIdx]; if (Math.hypot(w.x - e.pos.x, w.z - e.pos.z) < reach) e._pathIdx++; else break; }
    return e._pathIdx < e._path.length ? e._path[e._pathIdx] : null;
  }

  // Phase 2/3: lock the player's position, then sweep a continuous beam through a 45° wedge.
  // The player must run out of the wedge. Range = 80% (p2) / 100% (p3) of the arena width.
  // Phase 3 does a double sweep (there and back) and scorches lingering fire onto the floor.
  _beginSweep(e) {
    const pp = this._tgt(e);
    e.sweepActive = true; e.sweepHitCD = 0; e._sweepHitCD = {}; // per-player graze cooldowns (co-op)
    e.sweepCenter = Math.atan2(pp.x - e.pos.x, pp.z - e.pos.z); // XZ angle toward the player at fire time
    e.sweepArc = Math.PI / 4;                 // 45° wedge
    e.sweepLen = 70;                           // 50% of the 140-wide arena (all phases)
    e.sweepPasses = e.phase === 3 ? 2 : 1;    // phase 3 = double sweep
    e.sweepPass = 0;
    if (!e._beam) {
      e._beam = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff2436, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      e._beam.renderOrder = 998; this.game.engine.scene.add(e._beam);
    }
    e._beam.material.color.setHex(e.phase === 3 ? 0xff3a10 : 0xff2436);
    e._beam.visible = true; e._beam.material.opacity = 1;
    this._sweepStartPass(e);
    this.game.audio.tone(900, 0.2, 'sawtooth', 0.3);
    this.game._bossFx('sweepStart', { ph: e.phase });
  }

  _sweepStartPass(e) {
    e.sweepT = 0;
    e.sweepDur = e.phase === 3 ? 1.5 : 3.0;   // p3: two quick passes (~3s total); p2: one 3s pass
    const half = e.sweepArc / 2;
    if (e.sweepPass % 2 === 0) { e.sweepFrom = e.sweepCenter - half; e.sweepTo = e.sweepCenter + half; }
    else                       { e.sweepFrom = e.sweepCenter + half; e.sweepTo = e.sweepCenter - half; }
  }

  _bossSweep(e, dt) {
    e.sweepT += dt; e.sweepHitCD -= dt;
    const frac = clamp(e.sweepT / e.sweepDur, 0, 1);
    const ang = e.sweepFrom + (e.sweepTo - e.sweepFrom) * frac;
    const belly = new THREE.Vector3(e.pos.x, e.pos.y + 0.6 * e.scale, e.pos.z + 0.4 * e.scale);
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    let len = e.sweepLen;
    { const wh = this.game.world.rayHit(belly, dir, len); if (wh) len = Math.max(2, belly.distanceTo(wh.point) - 0.2); } // all phases stop at walls — cover always works
    const end = belly.clone().addScaledVector(dir, len);
    const thick = e.phase === 3 ? 0.9 : 0.55;
    e._beam.position.copy(belly).add(end).multiplyScalar(0.5);
    e._beam.scale.set(thick, thick, len); e._beam.lookAt(end);
    e._beam.material.opacity = 0.85 + 0.15 * Math.sin(e.sweepT * 40);
    e._sweepFxT = (e._sweepFxT || 0) - dt;
    if (e._sweepFxT <= 0) { e._sweepFxT = 0.07; this.game._bossFx('sweep', { p: [+belly.x.toFixed(2), +belly.y.toFixed(2), +belly.z.toFixed(2)], a: +ang.toFixed(3), len: +len.toFixed(2), th: thick, ph: e.phase }); }
    if (e._tolGlow) e._tolGlow.material.opacity = 0.9;                  // emitter stays lit while firing
    if (Math.random() < 0.4) this.game.audio.noise(0.05, 0.2, 'highpass', 1600, 0.5);
    // phase 3: the beam scorches the floor — drop lingering fire zones along it (area denial)
    if (e.phase === 3) {
      e._fireDropT = (e._fireDropT || 0) - dt;
      if (e._fireDropT <= 0) { e._fireDropT = 0.10; const fd = rr(5, len * 0.7); this._dropBossFire(belly.x + dir.x * fd, belly.z + dir.z * fd); }
    }
    // contact damage: horizontal distance to the beam line, throttled per-player so a graze = one "hit"
    const reach = e.phase === 3 ? 2.0 : 1.6;
    const cds = e._sweepHitCD = e._sweepHitCD || {};
    for (const k in cds) if ((cds[k] -= dt) <= 0) delete cds[k];
    const beamHit = (pid, px, pz) => {
      const t = clamp((px - belly.x) * dir.x + (pz - belly.z) * dir.z, 0, len);
      const dl = Math.hypot(px - (belly.x + dir.x * t), pz - (belly.z + dir.z * t));
      if (dl < reach && !(cds[pid] > 0)) { cds[pid] = 0.7; this.game._hurtTarget(pid, e.phase === 3 ? 85 : 55); }
    };
    const mp = this.game.mp;
    if (mp && mp.active && mp.isHost) {
      const s = mp.pstate.get('host'); if (!(s && (s.down || s.dead || s.waiting))) beamHit('host', this.game.player.pos.x, this.game.player.pos.z);
      for (const [id, rp] of mp.remotes) { if (rp.down || rp.dead || rp.waiting) continue; beamHit(id, rp.pos.x, rp.pos.z); }
    } else { beamHit('host', this.game.player.pos.x, this.game.player.pos.z); }
    // the sweep also shreds any other mob it passes over (lots of damage), but never Tolo himself
    for (const en of this.active) {
      if (!en.alive || en.def.boss) continue;
      const te = clamp((en.pos.x - belly.x) * dir.x + (en.pos.z - belly.z) * dir.z, 0, len);
      const de = Math.hypot(en.pos.x - (belly.x + dir.x * te), en.pos.z - (belly.z + dir.z * te));
      if (de < reach + en.radius) this.damage(en, 9999, 'gun', en.pos.clone());
    }
    if (e.sweepT >= e.sweepDur) {
      e.sweepPass++;
      if (e.sweepPass < e.sweepPasses) this._sweepStartPass(e);
      else { e.sweepActive = false; e._beam.visible = false; this.game._bossFx('sweepEnd', {}); }
    }
  }

  _dropBossFire(x, z) {
    if (this.bossFires.length > 48) return;   // perf cap
    this.game.effects.firePool({ x, y: 0.08, z }, 1.4, 0.8);
    this.bossFires.push({ x, z, r: 1.9, life: 3.0 });
    this.game._bossFx('fire', { x: +x.toFixed(2), z: +z.toFixed(2) });
  }

  _updateBossFires(dt) {
    if (!this.bossFires.length) return;
    for (let i = this.bossFires.length - 1; i >= 0; i--) {
      const f = this.bossFires[i]; f.life -= dt;
      if (f.life <= 0) { this.bossFires.splice(i, 1); continue; }
      if (Math.random() < 0.18) this.game.effects.firePool({ x: f.x, y: 0.08, z: f.z }, 1.1, 0.5); // keep it visibly burning
    }
    // per-player fire-zone DoT, throttled per player (co-op)
    const cells = this.bossFires;
    const inAnyFire = (px, pz) => { for (const f of cells) if (Math.hypot(px - f.x, pz - f.z) < f.r) return true; return false; };
    const tt = this._fireTickT = (typeof this._fireTickT === 'object' && this._fireTickT) ? this._fireTickT : {};
    const tickPlayer = (pid, px, pz) => {
      if (!inAnyFire(px, pz)) { delete tt[pid]; return; }
      tt[pid] = (tt[pid] || 0) - dt;
      if (tt[pid] <= 0) { tt[pid] = 0.4; this.game._hurtTarget(pid, 12); }
    };
    const mp = this.game.mp;
    if (mp && mp.active && mp.isHost) {
      const s = mp.pstate.get('host'); if (!(s && (s.down || s.dead || s.waiting))) tickPlayer('host', this.game.player.pos.x, this.game.player.pos.z);
      for (const [id, rp] of mp.remotes) { if (rp.down || rp.dead || rp.waiting) continue; tickPlayer(id, rp.pos.x, rp.pos.z); }
    } else { tickPlayer('host', this.game.player.pos.x, this.game.player.pos.z); }
  }

  // ===========================================================================
  // BOSS LUKA — mobile 4-phase money boss (host-authoritative, like Tolo).
  //   f1 (>75%)  "Oslíčku, otřes se!" — shudders, showers COPPER coins ($ black)
  //   f2 (50-75) "hrst drobáků" — flings a handful of coins forward ($ copper)
  //   f3 (25-50) "pytel" — lobs a money bag (+ anti-camp drop) ($ silver); bullets now bite
  //   f4 (<25)   "crazy" — top hat + money gun: copper-coin bursts alternating with bag ($ gold)
  // Vulnerability/▼dmg table lives in damage(); projectiles in lukaCoins/lukaBags.
  // ===========================================================================
  _propGeo(key, fn) { return this.geos[key] || (this.geos[key] = fn()); }
  _lukaSetup(e) {
    const bake = this._lukaBake;
    if (!e._lukaDollar) { e._lukaDollar = new THREE.Mesh(this.geos.lukaDollar, voxelMaterial()); e.mesh.add(e._lukaDollar); }
    e._lukaDollar.visible = true; e._lukaDollar.material.color.setHex(LUKA_DOLLAR[1]);
    // prop anchors + scales 1:1 z LUKA_PROP (kanonický náhled): scale = s × bake.S, kotvy v model-space
    const attach = (key, geo, anchorArr, s) => {
      if (!e[key]) { const m = new THREE.Mesh(geo, voxelMaterial()); m.rotation.y = Math.PI; e.mesh.add(m); e[key] = m; }
      e[key].scale.setScalar(s * bake.S); e[key].position.copy(lukaAnchorA(anchorArr, bake)); e[key].visible = false;
    };
    attach('_lukaBag', this._propGeo('luka_bag', buildMoneyBag), LUKA_PROP.anchor.handL, LUKA_PROP.bagS[3]);
    attach('_lukaHat', this._propGeo('luka_hat', buildTopHat), LUKA_PROP.anchor.headT, LUKA_PROP.hatS);
    this._attachLukaGun(e, bake);
  }

  // GUN: prefer the real 3D Blender pistol (GLB, with baked animations); fall back
  // to the voxel buildMoneyGun() until the GLB has loaded. `e._lukaGun` is the active
  // gun object either way, so the existing visibility + muzzle logic keeps working.
  _attachLukaGun(e, bake) {
    if (e._lukaGun) { e.mesh.remove(e._lukaGun); e._lukaGun = null; }
    e._lukaGunMixer = null; e._lukaGunActions = null; e._lukaGunMuzzle = null;
    e._lukaBarrelPivot = null; e._lukaBarrelTarget = 0; e._lukaBarrelCur = 0;
    e._gunShotActive = false; e._gunStrike = false; e._gunMuzzle = false; // synced-shot FX state
    const g = lukaGunReady() ? buildLukaGun() : null;
    if (g && g.root) {
      const root = g.root;
      root.scale.setScalar(LUKA_GUN_GLB.scale * bake.S);
      root.position.copy(lukaAnchorA(LUKA_PROP.anchor.gun, bake));
      root.rotation.set(LUKA_GUN_GLB.rot[0], LUKA_GUN_GLB.rot[1], LUKA_GUN_GLB.rot[2]);
      root.visible = false;
      e.mesh.add(root);
      e._lukaGun = root;
      e._lukaGunMuzzle = root.getObjectByName('muzzle') || null;
      e._lukaBarrelPivot = root.getObjectByName('BARREL_PIVOT') || null;
      // The GLB ships one clip per pivot (BARREL_PIVOT / COCK_PIVOT / TRIGGER_PIVOT),
      // all 0..1.25s of the same fire cycle. Play them all together each shot, sped up
      // to fit the rapid f4 fire rate. If clips exist the barrel is animated, so the
      // manual barrel-step fallback is disabled.
      if (g.clips && g.clips.length) {
        e._lukaGunMixer = new THREE.AnimationMixer(root);
        e._lukaGunActions = g.clips.map(c => {
          const a = e._lukaGunMixer.clipAction(c);
          a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = LUKA_GUN_GLB.fireTimeScale;
          return a;
        });
        e._lukaBarrelPivot = null; // barrel driven by the clip, not manual stepping
      }
    } else {
      const m = new THREE.Mesh(this._propGeo('luka_gun', buildMoneyGun), voxelMaterial());
      m.rotation.y = Math.PI;
      m.scale.setScalar(LUKA_PROP.gunS * bake.S);
      m.position.copy(lukaAnchorA(LUKA_PROP.anchor.gun, bake));
      m.visible = false;
      e.mesh.add(m);
      e._lukaGun = m;
      // The preload is asynchronous. If this Luka spawned before it completed,
      // replace only this still-active fallback once the GLB becomes available.
      // Preserve phase visibility and avoid replacing the weapon mid-shot.
      preloadLukaGun().then(() => {
        const upgrade = () => {
          if (!e.alive || e._lukaGun !== m) return;
          if (e._gunShotActive) { setTimeout(upgrade, 50); return; }
          const wasVisible = m.visible;
          this._attachLukaGun(e, bake);
          if (e._lukaGun) e._lukaGun.visible = wasVisible;
        };
        upgrade();
      }).catch(() => {});
    }
  }
  _lukaG(e) { return this._lukaBake.S * e.scale; } // model→world faktor (bake × def.scale), pro velikosti projektilů

  _bossLuka(e, dt) {
    const pp = this._tgt(e);
    this.game.hud.setBoss(e.hp / e.maxHp, e.name);
    this._dollarTick(e, dt); this._lukaRingTick(e, dt);          // $ evoluce-pop + rozpínavý prstenec přechodu
    this._lukaGunAnimTick(e, dt);                                 // 3D money gun: tik animace + plynulé dotočení hlavní
    // f2: drží HRST v pravé ruce (mimo okno hodu); v ostatních fázích skrytá
    if (e._lukaClump) { if (e.phase === 2 && e.lukaF2 == null && e.invuln <= 0) { e._lukaClump.visible = true; e._lukaClump.position.copy(this._lukaClumpHand(e)); e._lukaClump.rotation.set(0, 0, 0); } else if (e.phase !== 2) e._lukaClump.visible = false; }

    // ── phase gates 75/50/25 → 4 phases ──
    const want = e.hp > e.maxHp * 0.75 ? 1 : (e.hp > e.maxHp * 0.50 ? 2 : (e.hp > e.maxHp * 0.25 ? 3 : 4));
    if (want > e.phase) this._lukaPhase(e, want);

    // ── phase-change i-frames: stand still, shudder; f3→f4 = DÝMOVNICE (vytáhne → knot dohoří → hodí → BUM) ──
    if (e.invuln > 0) {
      e.invuln -= dt; e._lukaRoot = true; e.mesh.rotation.z = Math.sin(e.bob * 9) * 0.10;
      if (e.phase === 4 && e._bombState != null) this._lukaBombSeq(e, dt);
      else if (Math.random() < 0.22) this.game.effects.stuffing(new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z), 0x3DA63A, 3, 4);
      if (e.invuln <= 0) { e._lukaRoot = false; if (e.phase === 4) e._bombState = null; } // klobouk/gun se odhalí už při BUM (ve kouři), tady jen úklid
      return;
    }

    // ── anti-camp tracking (f3/f4): how long has the solo target stood still? ──
    if ((e.phase === 3 || e.phase === 4) && e._tgtId === 'host') {
      e.lukaCampT = (Math.hypot(this.game.player.vel.x, this.game.player.vel.z) > 1.2) ? 0 : e.lukaCampT + dt;
    } else e.lukaCampT = 0;

    // ── an attack is mid-flight ──
    if (e.lukaShake > 0) { this._lukaShakeTick(e, dt); return; }
    if (e.lukaF2 != null) { this._lukaF2Tick(e, dt, pp); return; }   // f2: hrst → hod pod sebe → rozkutálení
    if (e.lukaWind > 0)  { this._lukaWindup(e, dt, pp); return; }

    // ── f4: money gun pálí copper munici PLYNULE (~0.32 s), nezávisle na lobu pytle ──
    if (e.phase === 4) { e._lukaGunCd -= dt; if (e._lukaGunCd <= 0 && !e._gunShotActive) this._lukaGunStart(e, pp); } // deliberate aimed shot, FX synced to the 1× animation (see _lukaGunAnimTick)

    // ── anti-camp punish: a bag straight onto the camper ──
    if (e.lukaCampT > 2.5) { e.lukaCampT = 0; e._lukaRoot = true; this._lukaBagLob(e, pp, 40); e.lukaCD = 2.6; e._lukaRoot = false; return; }

    // ── idle: tick down, then open an attack ──
    e._lukaRoot = false;
    e.lukaCD -= dt;
    if (e.lukaCD <= 0) {
      e._lukaRoot = true;
      if (e.phase === 1) { e.lukaShake = 1.15; e._lukaShakeEmit = 0; }
      else if (e.phase === 2) { e.lukaF2 = 0; e._lukaF2state = 0; this._lukaShowClump(e, true); } // hrst v pravé ruce
      else { e.lukaWind = 0.5; e._lukaWindDur = 0.5; } // f3/f4: nápřah pytle
    }
  }

  _lukaPhase(e, want) {
    e.phase = want; e.invuln = 3.0; e._lukaRoot = true;
    e.lukaCD = 1.4; e.lukaWind = 0; e.lukaShake = 0; e.lukaCampT = 0; e._lukaGunCd = 0; e.lukaF2 = null;
    e.speed = e.baseSpeed * (want === 4 ? 1.15 : want === 3 ? 1.10 : 1.05);
    // $ EVOLUCE 1:1 (náhled fxTransition): nejdřív PŘEDCHOZÍ barva $ → po 0.35 s pop na aktuální
    if (e._lukaDollar) { e._lukaDollar.material.color.setHex(LUKA_DOLLAR[want - 1] || LUKA_DOLLAR[want]); e._dollarEvolveIn = 0.35; e._dollarTo = LUKA_DOLLAR[want]; e._dollarFlash = 0; }
    this._lukaTransition(e);
    if (want === 2) this._lukaShowClump(e);                                   // f2: připrav hrst do ruky
    if (want >= 3 && e._lukaBag) e._lukaBag.visible = true;                    // bag appears from f3
    if (want === 4) { if (e._lukaBag) e._lukaBag.scale.setScalar(LUKA_PROP.bagS[4] * this._lukaBake.S); e._bombState = 0; e._bombT = 0; } // dýmovnice běží během invuln → pak odhalí klobouk+gun
    const msg = want === 2 ? ['LUKA SÁHL DO KAPSY', 'fáze 2 — hází hrst'] : want === 3 ? ['LUKA TASÍ PYTEL', 'fáze 3 — kulky teď zabírají!'] : ['LUKA HODIL DÝMOVNICI', 'fáze 4 — cylindr + money gun'];
    this.game.hud.bigMessage(msg[0], msg[1]);
    this.game.audio.tone(180, 0.5, 'sawtooth', 0.4);
    this.game._bossFx('banner', { title: msg[0], sub: msg[1] });
  }

  // $ evoluce-pop (prev → záblesk → cílová barva + scale pop) — 1:1 náhled fxDollar/_evolveIn
  _dollarTick(e, dt) {
    const d = e._lukaDollar; if (!d) return;
    if (e._dollarEvolveIn > 0) { e._dollarEvolveIn -= dt; if (e._dollarEvolveIn <= 0) { e._dollarFlash = 0.4; d.material.color.setRGB(1, 0.96, 0.78); } }
    if (e._dollarFlash > 0) { e._dollarFlash -= dt; const k = Math.max(0, e._dollarFlash / 0.4);
      (e._dollarToCol || (e._dollarToCol = new THREE.Color())).setHex(e._dollarTo);
      d.material.color.lerp(e._dollarToCol, 0.3); d.scale.setScalar(1 + 0.22 * k);
    } else d.scale.setScalar(1);
  }
  // přechod fáze: rozpínavý zlatý prstenec na bříšku + záblesk + prstenec prachu od nohou
  _lukaTransition(e) {
    if (!e._lukaRing) { e._lukaRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 30), new THREE.MeshBasicMaterial({ color: 0xffe7a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); e._lukaRing.renderOrder = 999; e.mesh.add(e._lukaRing); }
    e._lukaRing.position.copy(lukaAnchor(0, -0.08, -0.235, this._lukaBake)); e._lukaRingT = 0;
    this.game.effects.stuffing(new THREE.Vector3(e.pos.x, 1.0 * e.scale, e.pos.z), 0xffe7a0, 6, 3);
    for (let i = 0; i < 13; i++) { const a = i / 13 * TAU; this.game.effects.stuffing(new THREE.Vector3(e.pos.x + Math.cos(a) * 0.6, 0.12, e.pos.z + Math.sin(a) * 0.6), 0xb7b0a0, 1, 2); }
  }
  _lukaRingTick(e, dt) {
    if (!e._lukaRing || e._lukaRingT == null || e._lukaRingT < 0) return;
    e._lukaRingT += dt; const u = e._lukaRingT / 0.6;
    e._lukaRing.scale.setScalar(0.4 + u * 2.4); e._lukaRing.material.opacity = Math.max(0, 0.85 * (1 - u));
    if (u >= 1) { e._lukaRingT = -1; e._lukaRing.material.opacity = 0; }
  }
  // DÝMOVNICE (f3→f4, běží během 3 s invuln): vytáhne bombu v pravé ruce → knot dohoří → hodí na zem → BUM (oranžový výbuch + hustý šedý oblak co Luku zakryje + prstenec prachu)
  _lukaBombSeq(e, dt) {
    const G = this._lukaG(e); e._bombT += dt; const t = e._bombT, HOLD = 1.3, BOOM = 2.0; // knot o 20 % delší
    if (!e._lukaBomb) { e._lukaBomb = new THREE.Mesh(this._propGeo('luka_bomb', buildSmokeBomb), voxelMaterial()); e._lukaBomb.scale.setScalar(LUKA_PROP.bombS * G); this.game.engine.scene.add(e._lukaBomb);
      e._lukaEmber = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffae3a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); this.game.engine.scene.add(e._lukaEmber); }
    const hand = e.mesh.localToWorld(lukaAnchorA(LUKA_PROP.anchor.bomb, this._lukaBake).clone());
    const gnd = new THREE.Vector3(e.pos.x + (this._lukaFwd(e).x) * 1.6, 0.2, e.pos.z + (this._lukaFwd(e).z) * 1.6);
    const bombR = LUKA_PROP.bombS * G * 0.13; // world poloměr bomby
    if (t < BOOM) {
      e._lukaBomb.visible = true; e._lukaEmber.visible = true;
      let p;
      if (t < HOLD) { p = hand.clone(); p.y += Math.sin(performance.now() * 0.004) * bombR * 0.15; e._lukaBomb.rotation.set(0, 0, Math.sin(performance.now() * 0.005) * 0.12); } // DRŽÍ klidně (NEtočí se)
      else { const u = (t - HOLD) / (BOOM - HOLD); p = hand.clone().lerp(gnd, u); p.y += Math.sin(u * Math.PI) * 1.3 * G * 0.3; e._lukaBomb.rotation.x += dt * 9; e._lukaBomb.rotation.z += dt * 5; } // HOD = tumble
      e._lukaBomb.position.copy(p);
      e._lukaEmber.position.copy(p).add(new THREE.Vector3(bombR * 0.9, bombR * 2.2, 0)); e._lukaEmber.scale.setScalar(bombR * 0.9 * (0.8 + Math.random() * 0.5)); // na špičce knotu
      if (Math.random() < 0.5) this.game.effects.stuffing(e._lukaEmber.position, 0xffd24a, 1, 1);
    } else if (e._bombState === 0) { // BUM → v kouři se (se zpožděním) spawnou klobouk+gun (Luka skrytá)
      e._bombState = 1; e._lukaBomb.visible = false; e._lukaEmber.visible = false; e._itemT = 0.5;
      this.game.effects.explosion(gnd, 2.9); this.game.audio.tone(60, 0.3, 'square', 0.4); // větší výbuch
      e._smokeT = 1.2; // hustý oblak ještě chvíli sype kolem těla
    }
    if (e._itemT > 0) { e._itemT -= dt; if (e._itemT <= 0) { if (e._lukaHat) e._lukaHat.visible = true; if (e._lukaGun) e._lukaGun.visible = true; } } // klobouk/gun 0,5 s po BUM (skryté v kouři)
    if (e._smokeT > 0) { e._smokeT -= dt; for (let i = 0; i < 6; i++) this.game.effects.stuffing(new THREE.Vector3(e.pos.x + rr(-1.7, 1.7), 0.25 + Math.random() * 2.6 * e.scale, e.pos.z + rr(-1.7, 1.7)), Math.random() < 0.5 ? 0x9aa0a8 : 0x6b6f76, 4, 5); } // větší oblak (Luku celou zahalí)
  }
  // f2: HRST 6 mincí (1 stříbro + 5 měď) — world-space, Luka ji DRŽÍ v pravé ruce (a pak celá letí)
  _lukaShowClump(e) {
    if (!e._lukaClump) { const g = new THREE.Group(), s = LUKA_PROP.coinS * this._lukaG(e), rad = 0.17 * s; // STEJNÁ velikost jako házené; HRST = prstenec+střed se svislým posunem (NEzfightuje)
      for (let i = 0; i < 7; i++) { const v = i % 3 === 0 ? 'silver' : 'copper'; const m = new THREE.Mesh(this._coinGeo(v), this._coinMat(v)); m.scale.setScalar(s); const a = i / 7 * TAU, r = i === 0 ? 0 : rad * 1.05; m.position.set(Math.cos(a) * r, (i - 3) * rad * 0.24, Math.sin(a) * r); m.rotation.set(rr(0, 3), rr(0, 3), rr(0, 3)); g.add(m); }
      this.game.engine.scene.add(g); e._lukaClump = g; }
    e._lukaClump.visible = true;
  }
  _lukaClumpHand(e) { return e.mesh.localToWorld(lukaAnchorA(LUKA_PROP.anchor.clump, this._lukaBake).clone()); } // world pos pravé ruky (hrst)
  // f2 tick: drží+napřáhne hrst → HODÍ ji jako CELEK obloukem skoro pod sebe → na dopadu rozKUTÁLENÍ 12 mincí
  _lukaF2Tick(e, dt, pp) {
    e.lukaF2 += dt; const t = e.lukaF2, G = this._lukaG(e); const hand = this._lukaClumpHand(e);
    if (t < 0.35) { // drží + napřáhne (TELEGRAF) — hrst v ruce
      if (e._lukaClump) { e._lukaClump.visible = true; e._lukaClump.position.copy(hand); e._lukaClump.rotation.set(0, 0, Math.sin(t * 22) * 0.25); }
      e.mesh.rotation.x = Math.sin(t / 0.35 * Math.PI) * 0.12;
    } else if (t < 0.62) { // LET hrsti obloukem skoro pod sebe
      if (e._lukaF2state === 0) { e._lukaF2state = 1; const fwd = this._lukaFwd(e); e._f2tx = e.pos.x + fwd.x * rr(1.6, 3.0); e._f2tz = e.pos.z + fwd.z * rr(1.6, 3.0); e._f2from = hand.clone(); }
      const u = (t - 0.35) / 0.27, tgt = new THREE.Vector3(e._f2tx, 0.18, e._f2tz);
      if (e._lukaClump) { e._lukaClump.visible = true; e._lukaClump.position.copy(e._f2from).lerp(tgt, u); e._lukaClump.position.y += Math.sin(u * Math.PI) * 1.2 * G * 0.2; e._lukaClump.rotation.x += dt * 10; }
      e.mesh.rotation.x = 0;
    } else { // DOPAD → rozkutálení
      if (e._lukaF2state === 1) { e._lukaF2state = 2; if (e._lukaClump) e._lukaClump.visible = false;
        this._lukaEmitRoll(e, e._f2tx, e._f2tz);
        this.game.effects.stuffing(new THREE.Vector3(e._f2tx, 0.12, e._f2tz), 0xffe0a0, 5, 2.5);
        this.game.audio.tone(520, 0.12, 'triangle', 0.28);
      }
    }
    if (t >= 0.82) { e.lukaF2 = null; e._lukaF2state = 0; e._lukaRoot = false; e.lukaCD = 2.2; }
  }
  // 12 valících mincí z místa dopadu (kutálí rovně → pak náhodně zatočí/zbrzdí → dolehnou naplocho)
  _lukaEmitRoll(e, ox, oz) {
    const G = this._lukaG(e), GR = 0.10;
    for (let k = 0; k < 12; k++) {
      const variant = k % 4 === 0 ? 'silver' : 'copper';
      const holder = new THREE.Group(); const coin = new THREE.Mesh(this._coinGeo(variant), this._coinMat(variant)); coin.scale.setScalar(LUKA_PROP.coinS * G); holder.add(coin);
      const a = k / 12 * TAU + rr(-0.26, 0.26), sp = (1.6 + rr(0, 1.3)) * G;
      holder.position.set(ox, GR + 0.05, oz); holder.rotation.y = a - Math.PI / 2;
      this.game.engine.scene.add(holder);
      this.lukaCoins.push({ mesh: holder, coin, mode: 'roll', vel: new THREE.Vector3(Math.sin(a) * sp, 0, Math.cos(a) * sp), dmg: Math.round(e.def.dmg * 0.6), life: 3.4 + rr(0, 1.0), dmgActive: true, dust: LUKA_DUST[variant], gt: 0, roll: 0, curve: (rr(-1, 1)) * Math.abs(rr(-1, 1)) * 4.2, straightFor: 0.55 + rr(0, 0.4), decel: 0.965 + rr(0, 0.022), grav: 0, spin: 0, landed: false, rest: 0 });
    }
  }
  // 3D money gun animace: advance the AnimationMixer + smoothly settle the rotating
  // barrel cluster toward its target angle (one quarter-turn was queued per shot).
  _lukaGunAnimTick(e, dt) {
    if (e._lukaGunMixer) e._lukaGunMixer.update(dt);
    if (e._lukaBarrelPivot) {                               // manual stepping (no baked clips → fallback)
      e._lukaBarrelCur += (e._lukaBarrelTarget - e._lukaBarrelCur) * Math.min(1, dt * 16);
      e._lukaBarrelPivot.rotation.x = e._lukaBarrelCur;
    }
    // FX driven by the gun animation timeline (dílna-faithful): sparks+pan at strike 0.57, blast+coin at muzzle 0.73
    if (e._gunShotActive) {
      const act = e._lukaGunActions && e._lukaGunActions[0];
      const cd = act ? (act.getClip().duration || 1.25) : 1.25, ct = act ? act.time : 99;
      if (!e._gunStrike && ct >= cd * 0.57) { e._gunStrike = true; this._lukaLockFX(e); }
      if (!e._gunMuzzle && ct >= cd * 0.73) { e._gunMuzzle = true; this._lukaGunFire(e); }
      if (!act || act.time >= cd - 1e-3) { e._gunShotActive = false; e._lukaGunCd = 0.25; } // animation done → short gap before next aimed shot
    }
  }
  // play the gun's firing animation: the baked cock+trigger+barrel clips together, else step the barrel
  _lukaGunFireAnim(e) {
    if (e._lukaGunActions && e._lukaGunActions.length) {
      for (const a of e._lukaGunActions) { a.reset(); a.play(); }
    } else if (e._lukaBarrelPivot) {
      e._lukaBarrelTarget += LUKA_GUN_GLB.barrelStep;
    }
  }
  // f4: BEGIN one aimed money-gun shot — plays the 1× fire animation; the FX + coin are emitted
  // later, synced to the clip timeline in _lukaGunAnimTick (sparks at strike, blast+coin at muzzle).
  _lukaGunStart(e, pp) {
    this._lukaGunFireAnim(e);
    e._gunShotActive = true; e._gunStrike = false; e._gunMuzzle = false;
  }
  _lukaGunMuzzlePos(e) {
    return (e._lukaGunMuzzle && e._lukaGun && e._lukaGun.visible) ? e._lukaGunMuzzle.getWorldPosition(new THREE.Vector3())
      : (e._lukaGun && e._lukaGun.visible) ? e._lukaGun.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(e.pos.x, 1.1 * e.scale, e.pos.z);
  }
  // strike beat: sparks + pan ignition at the lock (frizzen → priming pan)
  _lukaLockFX(e) {
    const gun = e._lukaGun; if (!gun || !gun.visible) return;
    const friz = gun.getObjectByName('Frizzen'), powder = gun.getObjectByName('PanPowder') || gun.getObjectByName('Pan');
    if (friz && powder) this._fx().lockBurst(friz.getWorldPosition(new THREE.Vector3()), powder.getWorldPosition(new THREE.Vector3()));
  }
  // muzzle beat: the copper coin leaves the top barrel toward the CURRENT target + muzzle blast
  _lukaGunFire(e) {
    const pp = this._tgt(e);
    const muzzle = this._lukaGunMuzzlePos(e);
    const to = new THREE.Vector3(pp.x - muzzle.x, (pp.y + 1.0) - muzzle.y, pp.z - muzzle.z).normalize();
    to.x += rr(-0.04, 0.04); to.y += rr(-0.03, 0.03); to.z += rr(-0.04, 0.04); to.normalize();
    const aim = to.clone();
    this._spawnLukaCoin(e, muzzle, to.multiplyScalar(22), 'copper', 10, true, { grav: 0, mode: 'gun', sFactor: LUKA_PROP.ammoS, life: 1.6 });
    this._fx().muzzleBlast(muzzle, aim);
    this.game.audio.tone(1200, 0.06, 'square', 0.25);
  }

  // f1 „otřes se": klepe se a sype FONTÁNU MĚĎÁKŮ — emit každých 0.05 s po dobu otřesu (1:1 náhled spawnF)
  _lukaShakeTick(e, dt) {
    e.lukaShake -= dt;
    e.mesh.rotation.z = Math.sin(e.bob * 20) * 0.14; e.mesh.rotation.x = Math.sin(e.bob * 14) * 0.06;
    e.mesh.position.y += Math.abs(Math.sin(e.bob * 18)) * 0.06;
    e._lukaShakeEmit -= dt;
    if (e._lukaShakeEmit <= 0) { e._lukaShakeEmit = 0.05; this._lukaFountainCoin(e); if (Math.random() < 0.5) this.game.audio.tone(900 + Math.random() * 300, 0.04, 'square', 0.10); }
    if (e.lukaShake <= 0) { e._lukaRoot = false; e.lukaCD = 2.4; }
  }

  // f3/f4: nápřah → lob pytle (f2 má vlastní _lukaF2Tick, f4 gun běží plynule v _bossLuka)
  _lukaWindup(e, dt, pp) {
    e.lukaWind -= dt;
    e.mesh.rotation.x = -0.18 * (1 - e.lukaWind / e._lukaWindDur);
    if (e.lukaWind <= 0) {
      e.mesh.rotation.x = 0; this._lukaBagLob(e, pp, 30);
      e._lukaRoot = false; e.lukaCD = e.phase === 3 ? 3.0 : 3.5;
    }
  }

  // world-space forward unit vector (boss faces +Z baked → rotation.y = atan2(dx,dz))
  _lukaFwd(e) { const ry = e.mesh.rotation.y; return new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)); }

  // fontána měďáků z těla: ven + nahoru (radiálně), gravitace, dolehnou naplocho (velikosti/rychlosti ×G)
  _lukaFountainCoin(e) {
    const G = this._lukaG(e); const o = new THREE.Vector3(e.pos.x + rr(-0.1, 0.1) * G, 0.95 * e.scale, e.pos.z);
    const a = rr(0, TAU), out = (0.55 + rr(0, 1.0)) * G;
    this._spawnLukaCoin(e, o, new THREE.Vector3(Math.cos(a) * out, (1.9 + rr(0, 1.3)) * G, Math.sin(a) * out), 'copper', e.def.dmg, true, { grav: 6.2 * G });
  }

  // lob pytle obloukem na cíl; po dopadu rozsyp mincí (barvy/počty dle fáze v _lukaBagImpact)
  _lukaBagLob(e, pp, dmg) {
    const o = (e._lukaBag && e._lukaBag.visible) ? e._lukaBag.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(e.pos.x, 1.0 * e.scale, e.pos.z);
    const g = 16, T = 1.05;
    const vel = new THREE.Vector3((pp.x - o.x) / T, (0.25 - o.y) / T + 0.5 * g * T, (pp.z - o.z) / T);
    const G = this._lukaG(e), bagS = LUKA_PROP.bagS[e.phase] || LUKA_PROP.bagS[3];
    const geo = this._propGeo('luka_bag', buildMoneyBag), m = new THREE.Mesh(geo, voxelMaterial());
    m.scale.setScalar(bagS * G); m.position.copy(o); this.game.engine.scene.add(m);
    if (e._lukaBag) e._lukaBag.visible = false; // DRŽENÝ pytel z ruky odletí
    this.lukaBags.push({ mesh: m, vel, grav: g, life: 4, dmg, splashR: 3.2, phase: e.phase, scatterScale: LUKA_PROP.coinS * G, owner: e });
    this.game.audio.tone(160, 0.18, 'sine', 0.3);
  }

  // mince do světa. opts: { grav, mode('ball'|'gun'), sFactor, life }
  _spawnLukaCoin(e, origin, vel, variant, dmg, dmgActive, opts = {}) {
    const m = new THREE.Mesh(this._coinGeo(variant), this._coinMat(variant));
    m.scale.setScalar((opts.sFactor || LUKA_PROP.coinS) * this._lukaG(e)); m.position.copy(origin);
    m.rotation.set(rr(0, TAU), rr(0, TAU), rr(0, TAU));
    this.game.engine.scene.add(m);
    this.lukaCoins.push({ mesh: m, vel: vel.clone(), dmg, life: opts.life || 5, grav: opts.grav != null ? opts.grav : 9, dmgActive: !!dmgActive, spin: rr(-9, 9), mode: opts.mode || 'ball', dust: LUKA_DUST[variant] || 0xC9A22B, landed: false, rest: 0 });
  }

  // valící mince: kutálí rovně → po straightFor zatočí (curve) + brzdí → při zpomalení dolehne naplocho (1:1 stepRoll)
  _stepRoll(c, dt) {
    const spd = Math.hypot(c.vel.x, c.vel.z), GR = 0.10;
    if (spd < 1.0 || c.life < 0.7) {
      c.coin.rotation.x += (Math.PI / 2 - c.coin.rotation.x) * Math.min(1, dt * 6);
      c.mesh.position.y += (0.06 - c.mesh.position.y) * Math.min(1, dt * 6);
      c.vel.x *= 0.80; c.vel.z *= 0.80; c.dmgActive = false;
    } else {
      c.gt += dt;
      if (c.gt < c.straightFor) { c.vel.x *= 0.985; c.vel.z *= 0.985; }
      else { const ang = c.curve * dt, co = Math.cos(ang), si = Math.sin(ang); const nx = c.vel.x * co - c.vel.z * si, nz = c.vel.x * si + c.vel.z * co; c.vel.x = nx * c.decel; c.vel.z = nz * c.decel; }
      c.mesh.position.x += c.vel.x * dt; c.mesh.position.z += c.vel.z * dt;
      c.mesh.rotation.y = Math.atan2(c.vel.x, c.vel.z) - Math.PI / 2;
      c.roll += spd * dt * 5; c.coin.rotation.z = c.roll;
    }
  }

  _updateLukaProj(dt) {
    const GROUND = 0.10;
    // ── coins (mode: 'ball' = balistická + dolehne naplocho · 'gun' = rovně · 'roll' = valí se) ──
    for (let i = this.lukaCoins.length - 1; i >= 0; i--) {
      const c = this.lukaCoins[i]; c.life -= dt; let dead = false;
      if (c.mode === 'roll') { this._stepRoll(c, dt); }
      else {
        c.vel.y -= c.grav * dt;
        const step = c.vel.clone().multiplyScalar(dt), len = step.length();
        if (c.dmgActive && len > 1e-4) { const dir = step.clone().normalize(); const wh = this.world.rayHit(c.mesh.position, dir, len); if (wh) { this.game.effects.stuffing(wh.point, c.dust, 3, 2); c.dmgActive = false; c.vel.set(0, 0, 0); c.life = Math.min(c.life, 0.5); } }
        c.mesh.position.add(step);
        if (!c.landed) { c.mesh.rotation.z += c.spin * dt; c.mesh.rotation.x += c.spin * 0.5 * dt; }
        if (c.mode !== 'gun' && !c.landed && c.mesh.position.y <= GROUND && c.vel.y < 0) { c.mesh.position.y = GROUND; c.landed = true; c.vel.y = 0; c.dmgActive = false; this.game.effects.stuffing(c.mesh.position, c.dust, 2, 1.5); c.rest = 2.2 + Math.random() * 1.6; } // leží déle
        if (c.landed) { c.vel.x *= 0.86; c.vel.z *= 0.86; c.mesh.position.x += c.vel.x * dt; c.mesh.position.z += c.vel.z * dt; c.mesh.rotation.x += (Math.PI / 2 - c.mesh.rotation.x) * Math.min(1, dt * 8); c.mesh.position.y += (0.06 - c.mesh.position.y) * Math.min(1, dt * 6); c.rest -= dt; if (c.rest <= 0) c.life = 0; } // dolehne PŘESNĚ na zem
      }
      if (c.dmgActive) { const hid = this._playerHitByPoint(c.mesh.position, 0.85); if (hid) { this.game._hurtTarget(hid, c.dmg); this.game.effects.stuffing(c.mesh.position, c.dust, 3, 2); c.dmgActive = false; c.life = Math.min(c.life, 0.15); } }
      if (c.life <= 0) dead = true;
      if (dead) { if (c.mesh.parent) c.mesh.parent.remove(c.mesh); this.lukaCoins.splice(i, 1); }
    }
    // ── bags ──
    for (let i = this.lukaBags.length - 1; i >= 0; i--) {
      const b = this.lukaBags[i]; b.life -= dt; b.vel.y -= b.grav * dt;
      const step = b.vel.clone().multiplyScalar(dt), len = step.length(); let hit = false, hp = null;
      if (len > 1e-4) { const dir = step.clone().normalize(); const wh = this.world.rayHit(b.mesh.position, dir, len); if (wh) { hit = true; hp = wh.point.clone(); } }
      b.mesh.position.add(step); b.mesh.rotation.x += 4 * dt;
      if (b.mesh.position.y <= 0.12) { b.mesh.position.y = 0.12; hit = true; hp = b.mesh.position.clone(); }
      if (hit || b.life <= 0) { this._lukaBagImpact(b, hp || b.mesh.position.clone()); if (b.mesh.parent) b.mesh.parent.remove(b.mesh); this.lukaBags.splice(i, 1); }
    }
  }

  _lukaBagImpact(b, point) {
    if (b.owner && b.owner._lukaBag && b.owner.alive && b.owner.phase >= 3) b.owner._lukaBag.visible = true; // Luka popadne další pytel
    this.game.effects.explosion(point, 2.2);
    this.game._explodeHurt(point, b.splashR, b.dmg); // direct/splash with radial falloff (host/solo)
    this.game.audio.tone(70, 0.2, 'square', 0.35); this.game.audio.tone(880, 0.12, 'triangle', 0.18); // thud + „cha-ching"
    // rozsyp mincí (kosmetika): f3 = 5 STŘÍBRO + 5 MĚĎ · f4 = 6 ZLATO + 6 STŘÍBRO + 6 MĚĎ (1:1 náhled spillPool)
    const sets = b.phase === 4 ? [['gold', 6], ['silver', 6], ['copper', 6]] : [['silver', 5], ['copper', 5]];
    for (const [variant, n] of sets) for (let k = 0; k < n; k++) { const a = rr(0, TAU), out = 2.0 + rr(0, 3.0);
      const m = new THREE.Mesh(this._coinGeo(variant), this._coinMat(variant)); m.scale.setScalar(b.scatterScale || 1.0);
      m.position.set(point.x, point.y + 0.2, point.z); m.rotation.set(rr(0, TAU), rr(0, TAU), rr(0, TAU)); this.game.engine.scene.add(m);
      this.lukaCoins.push({ mesh: m, vel: new THREE.Vector3(Math.cos(a) * out, 3.0 + rr(0, 2.5), Math.sin(a) * out), dmg: 0, life: 1.8, grav: 11, dmgActive: false, spin: rr(-9, 9), mode: 'ball', dust: LUKA_DUST[variant], landed: false, rest: 0 });
    }
  }

  // ── CLIENT-SIDE boss/tank attack VISUALS (clients never run the host simulation above) ──
  // These are spawned by the 'bossfx' net handler and advanced each frame by updateGhostFx(). Visual-only — NEVER deal damage.
  spawnGhostBolt(belly, dir, col) {
    if (!this._boltGeo) this._boltGeo = new THREE.BoxGeometry(0.18, 0.18, 1.6);
    const m = new THREE.Mesh(this._boltGeo, new THREE.MeshBasicMaterial({ color: (col != null ? col : 0xff2436), fog: false, depthWrite: false }));
    m.renderOrder = 998; m.position.copy(belly); m.lookAt(belly.clone().add(dir));
    this.game.engine.scene.add(m);
    this._ghostBolts.push({ mesh: m, dir: dir.clone().normalize(), spd: 55, life: 70 / 55 });
    this.game.effects.muzzleFlash(belly, dir, 2.0);
  }
  ghostSweepStart(phase) {
    if (!this._ghostBeam) {
      this._ghostBeam = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff2436, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      this._ghostBeam.renderOrder = 998; this.game.engine.scene.add(this._ghostBeam);
    }
    this._ghostBeam.material.color.setHex(phase === 3 ? 0xff3a10 : 0xff2436);
    this._ghostBeam.visible = true; this._ghostBeam.material.opacity = 1; this._ghostBeamT = 0;
    this.game.audio.tone(900, 0.2, 'sawtooth', 0.3);
  }
  ghostSweepUpdate(belly, ang, len, thick, phase) {
    if (!this._ghostBeam) this.ghostSweepStart(phase);
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    const end = belly.clone().addScaledVector(dir, len);
    this._ghostBeam.visible = true;
    this._ghostBeam.position.copy(belly).add(end).multiplyScalar(0.5);
    this._ghostBeam.scale.set(thick, thick, len); this._ghostBeam.lookAt(end);
    this._ghostBeamT = (this._ghostBeamT || 0) + 0.05;
    this._ghostBeam.material.opacity = 0.85 + 0.15 * Math.sin(this._ghostBeamT * 40);
    if (Math.random() < 0.4) this.game.audio.noise(0.05, 0.2, 'highpass', 1600, 0.5);
  }
  ghostSweepEnd() { if (this._ghostBeam) this._ghostBeam.visible = false; }
  addGhostFire(x, z) { if (this._ghostFires.length > 48) return; this._ghostFires.push({ x, z, life: 3.0 }); }
  ghostAimMarker(x, z) {
    if (!this._ghostAimRing) {
      this._ghostAimRing = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.7, 20), new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      this._ghostAimRing.rotation.x = -Math.PI / 2; this._ghostAimRing.renderOrder = 990; this.game.engine.scene.add(this._ghostAimRing);
    }
    this._ghostAimRing.position.set(x, 0.06, z); this._ghostAimRing.material.opacity = 0.85; this._ghostAimRingT = 0.8;
  }
  // Advance all client visual effects — called for NON-host from _updatePlaying (must NOT run on the host).
  updateGhostFx(dt) {
    // traveling bolts
    for (let i = this._ghostBolts.length - 1; i >= 0; i--) {
      const b = this._ghostBolts[i];
      b.mesh.position.addScaledVector(b.dir, b.spd * dt); b.life -= dt;
      if (b.life <= 0) { if (b.mesh.parent) b.mesh.parent.remove(b.mesh); b.mesh.material.dispose(); this._ghostBolts.splice(i, 1); }
    }
    // fire-zone flicker
    for (let i = this._ghostFires.length - 1; i >= 0; i--) {
      const f = this._ghostFires[i]; f.life -= dt;
      if (f.life <= 0) { this._ghostFires.splice(i, 1); continue; }
      if (Math.random() < 0.18) this.game.effects.firePool({ x: f.x, y: 0.08, z: f.z }, 1.1, 0.5);
    }
    // aim ring fade-out
    if (this._ghostAimRing && this._ghostAimRing.material.opacity > 0) {
      this._ghostAimRingT = (this._ghostAimRingT || 0) - dt;
      if (this._ghostAimRingT <= 0) this._ghostAimRing.material.opacity = 0;
    }
  }

  _bossTank(e, dt) {
    const pp = this._tgt(e);

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
    const _tr = e.radius + 1.5; // big tank circle + slack; whole-cell results cover the push-out
    for (const b of this.world.grid.queryAABB(e.pos.x - _tr, e.pos.z - _tr, e.pos.x + _tr, e.pos.z + _tr)) {
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
    this.game._bossFx('aimring', { x: +target.x.toFixed(2), z: +target.z.toFixed(2) });
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
        e._mgFxT = (e._mgFxT || 0) - 0.09;
        if (e._mgFxT <= 0) { e._mgFxT = 0.18; this.game._bossFx('mg', { o: [+o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2)], e: [+end.x.toFixed(2), +end.y.toFixed(2), +end.z.toFixed(2)] }); }
        const t = clamp((pp.x - o.x) * dir.x + (pp.y + 1 - o.y) * dir.y + (pp.z - o.z) * dir.z, 0, 30);
        const dl = Math.hypot(pp.x - (o.x + dir.x * t), pp.y + 1 - (o.y + dir.y * t), pp.z - (o.z + dir.z * t));
        if (dl < 1.0 && (!wHit || t < wHit.dist)) this.game._hurtTarget(e._tgtId, 6);
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
      this.game._hurtTarget(e._tgtId, 40);
      if (e._tgtId === 'host') { // can't shove a remote: only knock/shake the local player
        if (this.game.player.vel) { this.game.player.vel.x += toP.x * 6; this.game.player.vel.z += toP.z * 6; } // knockback
        if (this.game.engine.shake) this.game.engine.shake(0.35);
      }
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
      this.game._bossFx('banner', { title: 'COMMANDER EXPOSED', sub: 'shoot Mitri!' });
    }
    if (e.vulnerable) {
      e.exposeT -= dt;
      const rise = Math.min(1, (expose - Math.max(0, e.exposeT)) * 3) * 0.5;
      if (e.mesh.userData.hatch) e.mesh.userData.hatch.position.y = 1.0 + rise; // cupola lifts (placeholder)
      if (e.exposeT <= 0) { e.vulnerable = false; e.windowT = cycle; if (e.mesh.userData.hatch) e.mesh.userData.hatch.position.y = 1.0; }
    }
    if (!e._enraged && enraged) { e._enraged = true; this.game.hud.bigMessage('MITRI ENRAGED', 'the T-90M floors it!'); this.game._bossFx('banner', { title: 'MITRI ENRAGED', sub: 'the T-90M floors it!' }); }
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
    // BOSS TOLO: no hard immunity (except brief phase-change i-frames). A bullseye hit while it
    // charges = full damage; the bazooka ('rocket') = near-full (0.9×, the one anti-Tolo weapon);
    // everything else only chips (0.2×). Headshot ×2 is suppressed on the boss in weapons.js.
    if (e.def.boss) {
      if (e.invuln > 0) { this._bossDeflect(e, hitPoint); return false; }      // phase-change i-frames: still immune
      if (e.type === 'luka') {
        // BOSS LUKA gates damage by phase + source (no weak spot — the belly $ is cosmetic):
        //   melee/grenade(explosion)/bazooka(rocket) ALWAYS bite · bullets(gun) only from f3 · fire/other only at f4.
        //   Survivors are reduced: bazooka ×0.5, everything else ×0.2. (Headshot ×2 suppressed on bosses in weapons.js.)
        const pass = (source === 'melee' || source === 'explosion' || source === 'rocket') ? true
                   : source === 'gun' ? e.phase >= 3 : e.phase >= 4;
        if (!pass) { this._bossDeflect(e, hitPoint); return false; }
        amount *= source === 'rocket' ? 0.5 : 0.2;
        this._bossHit(e, hitPoint, true, attacker);                            // a passing hit lands → thunk + crosshair cue
      } else {
        let onTarget = false;
        if (e.charging > 0 && hitPoint && e._tolGlow) {
          const tp = e._tolGlow.getWorldPosition(this._tv || (this._tv = new THREE.Vector3()));
          onTarget = hitPoint.distanceTo(tp) < 1.4 * e.scale;
        }
        const effective = onTarget || source === 'rocket';
        amount *= onTarget ? 1 : (source === 'rocket' ? 0.9 : 0.2);           // bullseye=1 · bazooka=0.9 · else=0.2
        this._bossHit(e, hitPoint, effective, attacker);                      // thunk + yellow crosshair, or weak tink
      }
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
        this.game.loot.clearPickupsInRadius(e.pos.x, e.pos.z, e.def.explodeRadius); // blast destroys ground items (runs before this kill's onEnemyKilled loot drop below)
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

  damageInRadius(center, radius, dmg, except = null, source = 'explosion') {
    for (const e of [...this.active]) {
      if (!e.alive || e === except) continue;
      const d = Math.hypot(e.pos.x - center.x, e.pos.z - center.z);
      if (d < radius) this.damage(e, dmg * (1 - (d / radius) * 0.6), source, center.clone ? center.clone() : center);
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
      this.game._bossFx('banner', { title: 'ARMOR — BOUNCED', sub: 'flank the rear / hit tracks, or wait for COMMANDER' });
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
  clearAll() { for (const e of this.active) { e.alive = false; e.mesh.visible = false; if (e._beam) e._beam.visible = false; if (e.tankGroup) e.tankGroup.visible = false; } this.active.length = 0; if (this.game.hud) this.game.hud.hideBoss(); if (this.shells) { for (const s of this.shells) if (s.mesh && s.mesh.parent) s.mesh.parent.remove(s.mesh); this.shells.length = 0; } if (this.bossBolts) { for (const b of this.bossBolts) if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh); this.bossBolts.length = 0; } if (this.bossFires) this.bossFires.length = 0; if (this._aimRing) this._aimRing.material.opacity = 0; if (this._ghostBolts) { for (const b of this._ghostBolts) if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh); this._ghostBolts.length = 0; } if (this._ghostBeam) this._ghostBeam.visible = false; if (this._ghostFires) this._ghostFires.length = 0; if (this._ghostAimRing) this._ghostAimRing.material.opacity = 0; }
  // Despawn lingering non-boss enemies (LONG NIGHT anti-hunt failsafe). Bosses stay.
  despawnStragglers() { let n = 0; for (const e of this.active) { if (e.alive && !e.def.boss) { e.alive = false; e.mesh.visible = false; n++; } } return n; }
}
