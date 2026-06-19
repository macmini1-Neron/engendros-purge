// enemies.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';
import { MeshBuilder, TAU, chc, clamp, pick, randRange, rayAABB, rr, shade, voxelMaterial } from './util.js';
import { ENEMY_BURN_SLOW, STEP_UP } from './tuning.js';
import { STRUCT_DEFS } from './economy.js';
import { buildNavGrid, findPath, lineBlocked } from './pathing.js';
import { buildFlowField, flowDirAt } from './flowfield.js';
import { buildNavGraph, buildSurfaceFlow, surfaceDirAt } from './navgraph.js';
import { buildSwarmGrid, eachNeighbor } from './swarmgrid.js';
import { movementSlow, contactWeaken } from './effects-status.js';
import { slopeBlocks } from './terrain.js';

const ENEMY_GRAVITY = 22;  // m/s² — pulls a mob off a ledge/roof once it walks past the edge (matches the player)
const ENEMY_CLIMB = 3.0;   // m/s up a ladder zone toward a target above (player uses 3.7)


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
  boss:     { hp: 3200, speed: 1.0, dmg: 32, reward: 1200, scale: 2.85, variant: 'boss', boss: true, laser: true },
};

// ---------------------------------------------------------------------------
// Enemy + EnemyManager
// ---------------------------------------------------------------------------
class Enemy {
  constructor(geo, geoKey) {
    this.mesh = new THREE.Mesh(geo, voxelMaterial());
    // Tolo's ~8,400-tri mesh is by far the heaviest shadow-caster — it's re-rendered into the
    // shadow map EVERY frame. Skip casting for the boss (it's dramatic enough without a ground
    // shadow); keep the small mobs' shadows. Big, safe win against the boss-fight stutter.
    this.mesh.castShadow = (geoKey !== 'boss');
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
    this.alive = true; this.attackCD = rr(0.3, 0.9); this.growlCD = rr(2, 6); this.squash = 0; this.burnT = 0; if (this.effects) this.effects.clear(); else this.effects = new Map(); // effects map: clear on pool reuse / init on first spawn
    this.stuck = 0; this._px = pos.x; this._pz = pos.z;
    this._climb = null; this._climbT = 0; // latched stair/ladder link traversal (layered nav) — {x,z,y} target + timeout
    this.isElite = false; // cleared on every (re)spawn so pooled enemies don't keep a stale mini-boss flag
    this.noAI = false;    // console /summon {NoAI:1} dummy flag — reset here so a recycled pooled enemy never inherits it
    this.courier = false; if (this._pack) this._pack.visible = false; // backpack courier flag/mesh reset
    // boss state (Tolo)
    this.phase = 1; this.laserCD = 3.2; this.charging = 0; this.addCD = 0; this.beamLife = 0;
    this.aim = new THREE.Vector3();
    this.invuln = 0;          // i-frames during a phase transition (boss stands still & shudders)
    this.baseSpeed = speed;   // phase speed scaling multiplies this (p1 ×1.0, p2 ×1.12, p3 ×1.20)
    this.shotsLeft = 0; this.shotCD = 0; this._chargeDur = 0.85; // phase-1 blaster burst
    this.sweepT = 0; this.sweepActive = false; this.sweepBase = 0; this.sweepPass = 0; // phase-2/3 sweep (later step)
    this._path = null; this._pathIdx = 0; this._pathT = 0; // boss grid-A* nav state (Tolo)
    if (this.mesh.material && this.mesh.material.emissive) { this.mesh.material.emissive.setHex(0x000000); this.mesh.material.emissiveIntensity = 1; }
    this.mesh.visible = true; this.mesh.scale.setScalar(def.scale); this.mesh.position.copy(pos);
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
    this._ghostBolts = []; // CLIENT visual-only boss bolts (relayed from host via 'bossfx')
    this._ghostBeam = null; // CLIENT visual-only sweep beam
    this._ghostFires = []; // CLIENT visual-only fire-zone flicker markers
    this._ghostAimRing = null; // CLIENT visual-only tank cannon aim ring
    this._navGrid = null; // boss A* occupancy grid (built once, lazily, on first boss spawn)
    this._hordeGrid = null; // HORDE flow-field occupancy grid (finer cell, slope-aware; built once, lazily)
    this._hordeFlow = null; // Dijkstra flow-field toward the host player (refreshed on _flowT timer)
    this._flowT = 0;        // seconds until the next flow-field refresh
    this._navGraph = null;  // LAYERED surface nav graph (navgraph.js) — built lazily the first time the player is elevated
    this._navCtr = null;    // world XZ the surface graph was built around (rebuild when the player leaves it) — reset with the graph
    this._surfFlow = null;  // surface flow-field toward the player's actual (x,y,z) level
    this._surfT = 0;        // seconds until the next surface-flow refresh
    this._playerUp = false; // is the host player elevated on a structure this frame (gates the layered nav)
  }
  // Pre-pay the boss-fight's one-time costs at run-start so they don't land as a frame hitch mid-fight:
  // (1) the heavy buildTolo() geometry (MeshBuilder + BufferGeometryUtils merge — a multi-hundred-ms
  // spike on the first boss spawn), and (2) the boss-FX shader programs (MeshBasicMaterial fog:false,
  // additive, and the mapped blob), compiled now via renderer.compile. The warm materials are kept
  // referenced (this._warmMats) so their compiled GL programs stay in the renderer's cache.
  // Idempotent. The boss Lambert material program is already warm from regular enemies; the courier
  // pack (5-box MeshBuilder) is left lazy — it's tiny and ~1% of spawns, not a hitch source.
  prewarm() {
    if (this._prewarmed) return;
    const engine = this.game.engine; if (!engine || !engine.scene) return;
    this._prewarmed = true;
    this._geo('boss', { body: 0xede7df, name: 'Tolo' }, 'boss'); // build + cache the heavy Tolo geometry
    // Pre-build the A* / flow-field nav grids (built lazily on the first boss spawn / first horde nav).
    // On terrain maps (steppe/airfield) the slope-aware horde grid scans ~every cell via terrainSlopeAt
    // — a big first-boss spike exactly where the owner saw it (airfield + airdrop). Cheap on the arena.
    if (!this._navGrid) this._navGrid = buildNavGrid(this.world);
    if (!this._hordeGrid) this._hordeGrid = buildNavGrid(this.world, { cell: 1.5, inflate: 0.7, slopeAware: true });
    this._ensureBossBlob();                                       // build the blob (canvas texture + mapped program)
    const warm = [
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff2436, transparent: true, opacity: 0, depthWrite: false, fog: false })),                                                     // laser beam
      new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 22), new THREE.MeshBasicMaterial({ color: 0xff2436, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })), // belly glow
      new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.6), new THREE.MeshBasicMaterial({ color: 0xff2436, fog: false, depthWrite: false })),                                                                              // blaster bolt
    ];
    for (const m of warm) { m.visible = false; m.position.set(0, -999, 0); engine.scene.add(m); }
    if (engine.renderer && engine.renderer.compile) engine.renderer.compile(engine.scene, engine.camera);
    for (const m of warm) { engine.scene.remove(m); m.geometry.dispose(); } // free the temp warm geometries (never rendered); programs live on the materials
    this._warmMats = warm.map((m) => m.material); // hold refs so the compiled programs aren't released
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
    if (hp == null) hp = def.hp;       // direct spawn / console /summon (no wave-scaled stats) → fall back to the type's base hp/speed
    if (speed == null) speed = def.speed;
    let col, variant = def.variant, geoKey, name;
    if (typeKey === 'boss') { col = { body: 0xede7df, name: 'Tolo' }; geoKey = 'boss'; name = 'BOSS TOLO'; }
    else if (typeKey === 'minitolo') { col = { body: 0xede7df, name: 'mini Tolo' }; geoKey = 'tolomini'; name = 'mini Tolo'; }
    else if (typeKey === 'exploder') { col = ENGENDRO_COLORS[5]; geoKey = 'exploder'; name = 'Mitri'; }
    else if (typeKey === 'charger') { col = { body: 0x8a2b2b, name: 'Boomer' }; geoKey = 'charger'; name = 'Boomer'; }
    else { col = pick(ENGENDRO_COLORS); geoKey = 'c' + col.body; name = col.name; }
    const e = this._get(geoKey, col, variant);
    e.spawn(typeKey, def, col, name, pos, hp, speed);
    if (typeKey === 'boss' && !this._navGrid) this._navGrid = buildNavGrid(this.world); // build the A* grid once Tolo arrives
    e.id = ++this._idc;
    e.tagId = this.game._nextTagId++; e.tag = `${typeKey}#${e.tagId}`; // per-run debug tag — F3 labels + @e[type]/byName targeting
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
    e.tagId = this.game._nextTagId++; e.tag = `${typeKey}#${e.tagId}`; // local debug tag (host tag sync = Phase 2)
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

  // Would an enemy standing at height `top` hit its head? Only a genuine OVERHANG blocks — a box whose
  // UNDERSIDE (min.y) sits within the body column (top..top+height). A box rising from at/below `top`
  // (a stair riser, wall, or the surface itself) is NOT a ceiling, so solid staircases stay climbable.
  _headClearE(cands, e, top) {
    for (const o of cands) {
      if (o.struct) continue;
      if (o.min.y <= top + 0.05 || o.min.y >= top + e.height) continue; // rises from below, or clears the head
      if (e.pos.x + e.radius <= o.min.x || e.pos.x - e.radius >= o.max.x) continue;
      if (e.pos.z + e.radius <= o.min.z || e.pos.z - e.radius >= o.max.z) continue;
      return false;
    }
    return true;
  }

  // World-space window for a nav rebuild: the AABB of the player + every active mob, padded for routing
  // room and hard-capped to ±`cap` from the player. Keeps the per-rebuild cost (Dijkstra + allocations)
  // O(window cells) instead of O(map cells) — the horde always clusters on the player, so cells far
  // across a large open map are never walked. THE steppe-stutter fix: on the 1000 m steppe the full grid
  // is ~445 k cells (the ground flow froze ~166 ms / the elevated surface flow ~80 ms, every 0.3 s); the
  // window is a few k. On the small arena the cap exceeds the map, so the window IS the whole grid →
  // behaviour unchanged. A stray mob past `cap` falls outside → it beelines (flowDirAt/surfaceDirAt null).
  _bounds(pp, cap) {
    let minX = pp.x, maxX = pp.x, minZ = pp.z, maxZ = pp.z;
    for (const e of this.active) {
      if (!e.alive) continue;
      if (e.pos.x < minX) minX = e.pos.x; else if (e.pos.x > maxX) maxX = e.pos.x;
      if (e.pos.z < minZ) minZ = e.pos.z; else if (e.pos.z > maxZ) maxZ = e.pos.z;
    }
    // PAD = routing margin around the cluster; MIN = a floor on the half-extent AROUND THE PLAYER. The
    // floor matters: when the player and the horde are collinear the raw bbox can be a thin sliver (e.g.
    // both near x=0 → near-zero width in x), and a sliver window clips any detour around nearby structures
    // — isolating the goal so the flood never reaches the mobs (they'd fall back to a wall-wedging beeline).
    // MIN guarantees room around the player to route around a building either side. All capped at ±cap.
    const PAD = 16, MIN = 64;
    return {
      minX: Math.max(pp.x - cap, Math.min(pp.x - MIN, minX - PAD)), maxX: Math.min(pp.x + cap, Math.max(pp.x + MIN, maxX + PAD)),
      minZ: Math.max(pp.z - cap, Math.min(pp.z - MIN, minZ - PAD)), maxZ: Math.min(pp.z + cap, Math.max(pp.z + MIN, maxZ + PAD)),
    };
  }

  update(dt) {
    const pp = this.game.player.pos;
    // HORDE NAV: build a finer, slope-aware occupancy grid once per map, then refresh a
    // Dijkstra flow-field toward the host player on a ~0.3 s timer. Host-only (enemies.update
    // only runs under `sim` — game.js). Allocation-light: ONE field rebuild per tick (not per
    // enemy/frame); enemies just look up a unit direction. Small inflate (≈ enemy radius) +
    // fine cell keep doorways passable so the horde routes THROUGH them.
    if (this.active.length) {
      if (!this._hordeGrid) this._hordeGrid = buildNavGrid(this.world, { cell: 1.5, inflate: 0.7, slopeAware: true });
      this._flowT -= dt;
      if (!this._hordeFlow || this._flowT <= 0) { this._flowT = 0.3; this._hordeFlow = buildFlowField(this._hordeGrid, pp.x, pp.z, this._bounds(pp, 110)); }
    }
    // LAYERED NAV: only when the player is ELEVATED on a structure (roof / upper floor / bunker level) do
    // we build the multi-surface graph + a surface flow toward the player's ACTUAL level, so the horde
    // routes UP stairs/ladders. On the ground (the common case) this is skipped entirely → zero overhead,
    // and the 2D flow above is unchanged. Graph built once per map (lazily); flow refreshed on a timer.
    this._playerUp = this.active.length > 0 && Math.abs(pp.y - this.world.groundY(pp.x, pp.z)) > 1.2;
    if (this._playerUp) {
      // Windowed surface graph (±80 m around the player+horde): rebuild on first elevation or when the
      // player leaves the built window's core (moved > 32 m, still well inside the ±80 m + pad window).
      // Stationary on a roof → built once; only the surface flow refreshes on the 0.3 s timer.
      if (!this._navGraph || !this._navCtr || Math.hypot(pp.x - this._navCtr.x, pp.z - this._navCtr.z) > 32) {
        this._navGraph = buildNavGraph(this.world, { stepUp: STEP_UP, bounds: this._bounds(pp, 80) });
        this._navCtr = { x: pp.x, z: pp.z }; this._surfFlow = null; // graph moved → drop the stale flow
      }
      this._surfT -= dt;
      if (!this._surfFlow || this._surfT <= 0) { this._surfT = 0.3; this._surfFlow = buildSurfaceFlow(this._navGraph, pp.x, pp.y, pp.z); }
    }
    // Big hordes: bucket mobs into a uniform spatial hash so each agent's separation scans only its 3×3
    // block — O(n) instead of the all-pairs O(n²) scan. Tiny hordes keep the trivial scan (no Map churn).
    // Built once per frame from start-of-frame positions, but the distance check reads LIVE o.pos as mobs
    // move during the loop. Cell = 2.0 (vs the √2.6≈1.61 m separation radius) leaves ≥0.39 m of slack so a
    // neighbour that drifted up to a 50 ms-clamp frame's worth (~0.22 m at top mob speed) is still inside
    // the queried block — i.e. the snapshot/live mismatch can't silently drop an in-range neighbour.
    const _swarm = this.active.length > 64 ? buildSwarmGrid(this.active, 2.0) : null;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (!e.alive) { this.active.splice(i, 1); continue; }
      if (e.noAI) { // {NoAI:1} dummy: stands still, no steering / contact damage / attacks — but still grounded, drawn, and killable (damage() is independent)
        e.vel.x = 0; e.vel.z = 0;
        e.pos.y = this.world.groundY(e.pos.x, e.pos.z);
        e.mesh.position.set(e.pos.x, e.pos.y, e.pos.z);
        e.mesh.scale.set(e.scale, e.scale, e.scale);   // pooled mesh may carry a stale scale/squash
        e.mesh.rotation.set(0, e.mesh.rotation.y, 0);
        continue;
      }
      let tgt = pp, tgtId = 'host'; const _mp = this.game.mp; if (_mp && _mp.active && _mp.isHost) { const _np = _mp.nearestPlayer(e.pos.x, e.pos.z); if (_np) { tgt = _np.pos; tgtId = _np.id; } } e._tgtId = tgtId;
      let dx = tgt.x - e.pos.x, dz = tgt.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 1; dx /= dist; dz /= dist;

      // LATCHED onto a stair/ladder link: COMMIT to physically reaching its top (head straight at the
      // link's top XZ + let Phase-1 step-up/ladder-climb ascend), ignoring the flow's pull back to the
      // link foot — that off-mesh-connection traversal is what gets the mob up the stairs.
      if (e._climb && e._climbT > 0) {
        e._climbT -= dt;
        const cxp = e._climb.x - e.pos.x, czp = e._climb.z - e.pos.z, cl = Math.hypot(cxp, czp) || 1;
        dx = cxp / cl; dz = czp / cl;
        if (e.pos.y >= e._climb.y - 0.4) { e._climb = null; e._climbT = 0; } // reached the top → release
      }
      // BOSS TOLO: grid-A* navigation — steer toward the next waypoint so the
      // giant routes AROUND buildings instead of wedging in a corner. Falls back
      // to the direct heading (below) when close or in clear line of sight.
      else if (e.def.boss) { const wp = this._bossWaypoint(e, tgt, dist, dt); if (wp) { const wxp = wp.x - e.pos.x, wzp = wp.z - e.pos.z, wlp = Math.hypot(wxp, wzp) || 1; dx = wxp / wlp; dz = wzp / wlp; } }
      // HORDE — player UP a structure: steer along the LAYERED surface flow (routes around AND up toward
      // the player's level). A `climb` step LATCHES the link above so the mob commits to traversing it.
      else if (this._playerUp && this._surfFlow) {
        const sd = surfaceDirAt(this._surfFlow, e.pos.x, e.pos.y, e.pos.z);
        if (sd) { dx = sd.x; dz = sd.z; if (sd.climb) { e._climb = { x: sd.targetX, z: sd.targetZ, y: sd.targetY }; e._climbT = 4; } }
      }
      // HORDE — player on the ground: when the straight line is blocked, steer along the 2D flow-field
      // (route around cliffs/walls, funnel through doorways). Open LoS → the beeline above stands.
      else if (this._hordeFlow && this._hordeGrid && lineBlocked(this._hordeGrid, e.pos.x, e.pos.z, tgt.x, tgt.z)) {
        const fd = flowDirAt(this._hordeFlow, e.pos.x, e.pos.z);
        if (fd) { dx = fd.x; dz = fd.z; }
      }

      // separation — neighbours within √2.6 m push the mob apart (keeps the horde from stacking)
      let sx = 0, sz = 0;
      if (_swarm) {
        eachNeighbor(_swarm, e.pos.x, e.pos.z, (o) => {
          if (o === e || !o.alive) return;
          const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, d2 = ox * ox + oz * oz;
          if (d2 < 2.6 && d2 > 1e-4) { const inv = 1 / Math.sqrt(d2); sx += ox * inv; sz += oz * inv; }
        });
      } else {
        for (const o of this.active) {
          if (o === e || !o.alive) continue;
          const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, d2 = ox * ox + oz * oz;
          if (d2 < 2.6 && d2 > 1e-4) { const inv = 1 / Math.sqrt(d2); sx += ox * inv; sz += oz * inv; }
        }
      }
      // On a raised surface (stairs/ledge/roof — feet above the terrain) the crate-avoidance turns into a
      // lateral shove off a wide step face (it pushes radially from the box centre), sliding the mob off
      // the side. So once climbing, drop avoidance and just beeline up toward the target. (Phase-2 routing
      // will steer multi-level properly; here it only keeps the locomotion from self-sabotaging.)
      const _onStruct = (e._climb && e._climbT > 0) || e.pos.y > this.world.groundY(e.pos.x, e.pos.z) + 0.4; // latched-to-a-link OR elevated → no avoidance
      // crate avoidance — skip surfaces we can step onto (top ≤ feet+STEP_UP) so we don't back off our own stairs.
      let ax = 0, az = 0;
      for (const b of (_onStruct ? [] : this.world.grid.queryAABB(e.pos.x - 1.8, e.pos.z - 1.8, e.pos.x + 1.8, e.pos.z + 1.8))) {
        if (b.max.y < 0.6 || b.max.y <= e.pos.y + STEP_UP) continue;
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
      const _bossRooted = e.def.boss && (e.charging > 0 || e.sweepActive || e.invuln > 0 || e.shotsLeft > 0); // Tolo stands still while attacking / transitioning
      // TODO P3: when burn migrates to effects-status, drop the `e.burnT ? ENEMY_BURN_SLOW : 1` term — else a burning enemy double-slows (ENEMY_BURN_SLOW × BURN_SLOW = 0.45 × 0.45 = 0.20).
      const spd = (_bossRooted ? 0 : e.speed) * (e.squash > 0 ? 0.3 : (e.burnT > 0 ? ENEMY_BURN_SLOW : 1) * movementSlow(e)) * (_wz ? STRUCT_DEFS.wire.slow : 1);
      if (_wz) {
        _wz.hp -= STRUCT_DEFS.wire.trample * dt; if (_wz.hp <= 0) this.game.build.destroyStructure(_wz, 'trample'); // crowd tramples it down
        e._wireT = (e._wireT || 0) + dt;
        if (e._wireT >= 0.4) { e._wireT = 0; if (this.damage(e, STRUCT_DEFS.wire.dot * 0.4, 'wire')) continue; }
      }
      e.vel.x = (wx / wl) * spd; e.vel.z = (wz / wl) * spd;
      e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
      // Horde slope-limit: don't let mobs scale cliffs (terrain steeper than slopeLimit). Revert the whole
      // step — they bunch at the cliff base and re-steer. Gated on hasTerrain so flat maps are untouched.
      if (this.world.hasTerrain && !e.def.boss) {   // bosses have their own nav; don't wedge them at cliffs
        const bx = e.pos.x - e.vel.x * dt, bz = e.pos.z - e.vel.z * dt, terr = this.world.terrain;
        if (slopeBlocks(terr.terrainHeightAt(bx, bz), terr.terrainHeightAt(e.pos.x, e.pos.z), terr.terrainSlopeAt(e.pos.x, e.pos.z), terr.slopeLimit)) {
          e.pos.x = bx; e.pos.z = bz; e.vel.x = 0; e.vel.z = 0;
        }
      }
      const lim = this.world.HALF - e.radius;
      e.pos.x = clamp(e.pos.x, -lim, lim); e.pos.z = clamp(e.pos.z, -lim, lim);
      e._blockStruct = null;
      // VERTICAL + box resolution in ONE footprint pass (was: e.pos.y = groundY then horizontal push-out).
      // A box TOP within step-up (with headroom) is a SURFACE to stand on — stairs/ledges/roofs; anything
      // taller is a WALL to push out of. Enemies now match the player's STEP_UP; gravity drops them off edges.
      const reach = e.pos.y + STEP_UP;
      let supp = this.world.groundY(e.pos.x, e.pos.z); // terrain baseline under the feet
      const _cr = e.radius + 1.5; // query window (radius + slack); whole-cell results over-cover the small push-out
      const _cands = this.world.grid.queryAABB(e.pos.x - _cr, e.pos.z - _cr, e.pos.x + _cr, e.pos.z + _cr);
      for (const b of _cands) {
        if (e.pos.x + e.radius <= b.min.x || e.pos.x - e.radius >= b.max.x) continue;
        if (e.pos.z + e.radius <= b.min.z || e.pos.z - e.radius >= b.max.z) continue;
        const top = b.max.y;
        // SURFACE: a box top within step-up (with head clearance) is something to STAND ON — low steps,
        // stairs, ledges, roofs. Considered even below 0.6 m so 0.45–0.6 m stairs are climbable.
        const steppable = !b.struct && top <= reach && this._headClearE(_cands, e, top);
        if (steppable && top > supp) supp = top;
        // WALL: too tall to step onto and our feet are below its top → push out (ground clutter <0.6 ignored).
        if (top < 0.6 || steppable || e.pos.y >= top - 0.05) continue;
        const px = Math.min(b.max.x + e.radius - e.pos.x, e.pos.x - (b.min.x - e.radius));
        const pz = Math.min(b.max.z + e.radius - e.pos.z, e.pos.z - (b.min.z - e.radius));
        if (px < pz) e.pos.x += (e.pos.x < (b.min.x + b.max.x) / 2 ? -px : px);
        else e.pos.z += (e.pos.z < (b.min.z + b.max.z) / 2 ? -pz : pz);
        if (b.struct) e._blockStruct = b._ref; // pushing against a player-built wall
      }
      // ladder climb (capability — routing onto ladders is Phase 2): inside a zone with the target above → ascend.
      const _lad = (!e.def.boss && tgt.y > e.pos.y + 0.6) ? this.world.ladderZoneAt(e.pos.x, e.pos.z, e.pos.y, e.height) : null;
      if (_lad) { e.pos.y = Math.min(e.pos.y + ENEMY_CLIMB * dt, _lad.top); e.vel.y = 0; }
      else if (e.pos.y <= supp + 0.02) { e.pos.y = supp; e.vel.y = 0; }                              // grounded / step up onto a surface
      else { e.vel.y -= ENEMY_GRAVITY * dt; e.pos.y += e.vel.y * dt; if (e.pos.y < supp) { e.pos.y = supp; e.vel.y = 0; } } // fall to support
      // heavy enemies crush a blocking structure instantly (no caging the boss) — after the boxes loop so the splice is safe
      if (e._blockStruct && (e.def.boss || (e.def.scale || 1) >= 1.6)) { this.game.build.attackStructure(e._blockStruct, e._blockStruct.maxHp, e); e._blockStruct = null; }

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
        e.attackCD = 1.0; e.squash = 0.18; this.game._hurtTarget(e._tgtId || 'host', e.def.dmg * contactWeaken(e));
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
      e.mesh.position.set(e.pos.x, e.pos.y + Math.abs(Math.sin(e.bob)) * 0.08, e.pos.z);
      e.mesh.rotation.y = Math.atan2(dx, dz);
      e.mesh.rotation.z = Math.sin(e.bob) * 0.08;
      e.mesh.scale.set(e.scale, e.scale * sq, e.scale);

      // mini-boss elites borrow the boss bar (no laser / no phase-2)
      if (e.isElite) this.game.hud.setBoss(e.hp / e.maxHp, e.name);
      if (e.def.boss) this._bossTolo(e, dt);
    }
    this._updateBossBolts(dt);
    this._updateBossFires(dt);
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
  _ensureBossBlob() {
    if (this._bossBlob) return this._bossBlob;
    // soft radial dark→transparent disc, generated once (cheap "blob" shadow)
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g2 = cv.getContext('2d');
    const grd = g2.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.34)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grd; g2.fillRect(0, 0, 64, 64);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.renderOrder = 1; blob.visible = false;
    this.game.engine.scene.add(blob);
    return (this._bossBlob = blob);
  }

  _bossTolo(e, dt) {
    const pp = this._tgt(e);
    this.game.hud.setBoss(e.hp / e.maxHp, e.name);

    // primitive "blob" ground shadow — a soft dark disc that tracks Tolo on the ground. Costs ~one
    // textured quad (no shadow-map render), so it grounds the boss while keeping the perf win of
    // NOT casting his ~8.4k-tri mesh into the real shadow map every frame.
    const blob = this._ensureBossBlob();
    const gy = this.game.world.groundY ? this.game.world.groundY(e.pos.x, e.pos.z) : 0;
    blob.visible = true; blob.position.set(e.pos.x, gy + 0.04, e.pos.z);
    const bs = (e.radius || e.scale || 2.85) * 3.0; blob.scale.set(bs, bs, 1);

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
    if (!this._boltMat) this._boltMat = new THREE.MeshBasicMaterial({ color: 0xff2436, fog: false, depthWrite: false }); // shared across all bolts — no per-bolt material alloc/dispose (GC churn)
    const m = new THREE.Mesh(this._boltGeo, this._boltMat);
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
          if (Math.hypot(m.x - en.pos.x, m.z - en.pos.z) < en.radius + 0.4) { this.damage(en, 9999, 'gun', m); dead = true; break; }
        }
      }
      if (!dead && b.life <= 0) dead = true;
      if (!dead) { const hid = this._playerHitByPoint(m, 1.1); if (hid) { this.game._hurtTarget(hid, b.dmg); dead = true; } }
      if (dead) { if (b.mesh.parent) b.mesh.parent.remove(b.mesh); this.bossBolts.splice(i, 1); } // material is shared (this._boltMat) → never dispose per-bolt
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
    // reuse scratch vectors — this runs every frame for the whole ~3s sweep; fresh Vector3s here were GC churn
    const belly = (this._swBelly || (this._swBelly = new THREE.Vector3())).set(e.pos.x, e.pos.y + 0.6 * e.scale, e.pos.z + 0.4 * e.scale);
    const dir = (this._swDir || (this._swDir = new THREE.Vector3())).set(Math.sin(ang), 0, Math.cos(ang));
    let len = e.sweepLen;
    { const wh = this.game.world.rayHit(belly, dir, len); if (wh) len = Math.max(2, belly.distanceTo(wh.point) - 0.2); } // all phases stop at walls — cover always works
    const end = (this._swEnd || (this._swEnd = new THREE.Vector3())).copy(belly).addScaledVector(dir, len);
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
      if (de < reach + en.radius) this.damage(en, 9999, 'gun', en.pos);
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

  // Heal an enemy (used by the radiation effect — radiation HEALS Engendros). Clamps to maxHp.
  heal(e, amount) {
    if (!e.alive || amount <= 0) return;
    e.hp = Math.min(e.maxHp, e.hp + amount);
    if (e.isElite) this.game.hud.setBoss(e.hp / e.maxHp, e.name);   // refresh the boss/elite bar
  }

  damage(e, amount, source = 'gun', hitPoint = null, attacker = 'host') {
    if (!e.alive) return false;
    const _mp = this.game.mp;
    if (_mp && _mp.active && !_mp.isHost) { _mp.claimHit(e, amount, source); return false; }
    // BOSS TOLO: no hard immunity (except brief phase-change i-frames). A bullseye hit while it
    // charges = full damage; the bazooka ('rocket') = near-full (0.9×, the one anti-Tolo weapon);
    // everything else only chips (0.2×). Headshot ×2 is suppressed on the boss in weapons.js.
    if (e.def.boss) {
      if (e.invuln > 0) { this._bossDeflect(e, hitPoint); return false; }      // phase-change i-frames: still immune
      let onTarget = false;
      if (e.charging > 0 && hitPoint && e._tolGlow) {
        const tp = e._tolGlow.getWorldPosition(this._tv || (this._tv = new THREE.Vector3()));
        onTarget = hitPoint.distanceTo(tp) < 1.4 * e.scale;
      }
      const effective = onTarget || source === 'rocket';
      amount *= onTarget ? 1 : (source === 'rocket' ? 0.9 : 0.2);             // bullseye=1 · bazooka=0.9 · else=0.2
      this._bossHit(e, hitPoint, effective, attacker);                        // thunk + yellow crosshair, or weak tink
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
      }
      if (e.def.boss || e.isElite) this.game.hud.hideBoss();
      if (e.def.boss && e._beam) e._beam.visible = false;
      if (e.def.boss && this._bossBlob) this._bossBlob.visible = false; // hide the blob shadow on boss death
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
  clearAll() { for (const e of this.active) { e.alive = false; e.mesh.visible = false; if (e._beam) e._beam.visible = false; } this.active.length = 0; if (this.game.hud) this.game.hud.hideBoss(); if (this.bossBolts) { for (const b of this.bossBolts) if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh); this.bossBolts.length = 0; } if (this.bossFires) this.bossFires.length = 0; if (this._ghostBolts) { for (const b of this._ghostBolts) if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh); this._ghostBolts.length = 0; } if (this._ghostBeam) this._ghostBeam.visible = false; if (this._ghostFires) this._ghostFires.length = 0; if (this._ghostAimRing) this._ghostAimRing.material.opacity = 0; if (this._bossBlob) this._bossBlob.visible = false; }
  // Despawn lingering non-boss enemies (LONG NIGHT anti-hunt failsafe). Bosses stay.
  despawnStragglers() { let n = 0; for (const e of this.active) { if (e.alive && !e.def.boss) { e.alive = false; e.mesh.visible = false; n++; } } return n; }
}
