// engendro.js — part-rigged plush Engendros + dismemberment.
//
// Regular enemies are the Tolo plush language (sphere head/body, capsule limbs, button/bead eyes,
// stitch smile, hair tufts, top loop) MINUS the belly bullseye, built as SEPARATE parts in a
// THREE.Group so limbs can be shot off. Appearance is randomized per spawn from a SEED (sent to
// co-op clients in `espawn`) so every client dresses the same plush: lore colour, ±size, eye combo
// (twin / cyclops / big+small / triple), 1–3 hair tufts.
//
// The boss (Tolo) is NOT rigged here — it keeps buildTolo() + its phase system (bosses are separate).
//
// Hitboxes: each part carries a PIVOT-LOCAL capsule; raycastRig transforms it by pivot.matrixWorld,
// so the hitbox follows the live pose (crawl tilt, head-raise, wobble) 1:1 — reuses raycollide's
// rayCapsule math (the same narrowphase #124 brought to world geometry).
//
// Reuses: makeTumble/stepBody (destruct.js) for falling gibs; effects.stuffing for fluff; the bleed
// status (effects-status.js). Pure-ish: imports THREE + util builders + destruct physics only.

import * as THREE from 'three';
import { MeshBuilder, voxelMaterial, makeRNG, randRange, randInt, choice, chance, clamp, shade } from './util.js';
import { rayCapsule } from './raycollide.js';
import { stepBody } from './destruct.js';
import { SEVER_BIT, SEVERABLE_ORDER, limbFlagsFromParts } from './dismember-core.js';

// ---------------------------------------------------------------------------
// Tuning — central so M6 extras + balance live in one place (owner can flip features).
// ---------------------------------------------------------------------------
export const DISMEMBER = {
  enabled: true,
  gore: 'full',            // 'full' (gibs + fluff) | 'light' (fluff only, no gib meshes — perf escape) | 'off' (no dismemberment)
  // gore-HP per severable part, as a fraction of the enemy's maxHp (KF2 dual-pool). Legs sturdiest.
  goreFrac: { head: 0.45, arm: 0.28, leg: 0.40 },
  // a hit only severs if its source can (knife can't decapitate; rifle/rocket/explosion can).
  severSources: { gun: true, rocket: true, explosion: true, fire: false, melee: false, contact: false, wire: false, crush: true, console: true },
  bigOverkillMult: 2.0,    // a single hit >= 2x body maxHp gibs everything (Doom rule)
  bleedChance: 0.25,       // % chance a sever starts a bleed (reuses EFFECTS.bleed)
  scatterOnDeath: true,    // death pops the remaining limbs as gibs (brutal plush explosion)
  headSeverKills: true,    // head off = death (M6 can flip to headless-wander)
  // movement / contact multipliers applied via effects-status entries
  speed: { crippled: 0.55, legless: 0.30 },
  // gib pool
  gibCap: 48, gibLinger: 5.0, gibFade: 0.8,
  // M6 extras (default OFF — added & ready, owner removes/keeps). Toggle live via GAME.dismember.extras.X = true
  extras: {
    headlessWander: false,   // head off → enemy keeps shambling BLIND + bleeds out (instead of instant death)
    blindWander: false,      // a blinded enemy wanders (random heading drift) instead of tracking precisely
    enragedCrawler: false,   // a freshly de-legged crawler has a chance to ENRAGE → fast, no crawl-slow (KF model)
    enrageChance: 0.3,
    bleedoutSecs: 6,
  },
};
// dismemberment active right now? (respects the Off gore setting + the master enable)
export function dismemberOn() { return DISMEMBER.enabled && DISMEMBER.gore !== 'off'; }

// ---------------------------------------------------------------------------
// Tolo plush geometry (faithfully reused from buildTolo, src/enemies.js) — sphere head BIGGER than the
// sphere body, tiny stubby capsule hands/feet, button/bead eyes ON the curved face, stitch smile.
// Built in Tolo NATIVE coords (face -Z), then the SAME bake as buildTolo (rotateY π, scale to ~2.25
// tall, feet→0). Replicated here (not shared) so the boss buildTolo stays untouched. NO bullseye.
// ---------------------------------------------------------------------------
const HEAD_R = 0.32, HEAD_Y = 0.34, BODY_R = 0.23, BODY_Y = -0.12, EY = 0.40;
// part meta + native sockets (the joint each part rotates around). L/R x-sign flips after rotateY(π).
const PART_META = [
  { name: 'torso', kind: 'torso', side: 0, severable: false, socket: [0, BODY_Y, 0] },
  { name: 'head', kind: 'head', side: 0, severable: true, socket: [0, 0.06, 0] },   // neck
  { name: 'armL', kind: 'arm', side: -1, severable: true, socket: [-0.20, -0.02, 0] }, // shoulders
  { name: 'armR', kind: 'arm', side: 1, severable: true, socket: [0.20, -0.02, 0] },
  { name: 'legL', kind: 'leg', side: -1, severable: true, socket: [-0.115, -0.22, 0] }, // hips
  { name: 'legR', kind: 'leg', side: 1, severable: true, socket: [0.115, -0.22, 0] },
];
export { SEVERABLE_ORDER };   // bit math now lives in dismember-core.js (node-testable); re-exported for existing importers

const DARK = 0x121212, CREAM = 0xfff4e2, RIM = 0x2c2c2c, BEAD = 0x070707;
const BTN = 0x0c0c0c, STITCH = 0xf3f3f3;   // Tolo eye: dark button disc + white X-stitch (cBtn / cHead)

// --- head-surface math (copied from buildTolo so eyes/smile sit on the curved face) ---
function headFront(x, y) { let u = HEAD_R * HEAD_R - x * x - (y - HEAD_Y) * (y - HEAD_Y); if (u < 0.0009) u = 0.0009; return -Math.sqrt(u); }
function headSurf(x, y) { return new THREE.Vector3(x, y, headFront(x, y)); }
function headNorm(x, y) { const p = headSurf(x, y); return new THREE.Vector3(p.x, p.y - HEAD_Y, p.z).normalize(); }
function arcTube(b, cx, cy, r, a0, a1, tube, color) {
  const pts = [], steps = 12;
  for (let i = 0; i <= steps; i++) { const a = a0 + (a1 - a0) * (i / steps); const p = headSurf(cx + r * Math.cos(a), cy + r * Math.sin(a)), n = headNorm(cx + r * Math.cos(a), cy + r * Math.sin(a)); pts.push(new THREE.Vector3(p.x - n.x * 0.008, p.y - n.y * 0.008, p.z - n.z * 0.008)); }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, tube, 6, false); b.geo(g, 0, 0, 0, color); g.dispose();
}
function stitch1(b, x, y, len, ang, color) { const p = headSurf(x, y), n = headNorm(x, y); b.box(len, 0.012, 0.012, p.x - n.x * 0.003, p.y - n.y * 0.003, p.z - n.z * 0.003, color, { ry: ang, align: n }); }
function xStitch(b, x, y, len, color, rot = 0) { stitch1(b, x, y, len, 0.78 + rot, color); stitch1(b, x, y, len, -0.78 + rot, color); }
// a Tolo button eye on the head surface at (x,y); r = button radius
function buttonEye(b, x, y, r, disc) {
  const n = headNorm(x, y), p = headSurf(x, y), at = (o) => [p.x + n.x * o, p.y + n.y * o, p.z + n.z * o]; let q;
  const rim = new THREE.TorusGeometry(r, r * 0.25, 8, 18); q = at(0.002); b.geo(rim, q[0], q[1], q[2], RIM, { rx: Math.PI / 2, align: n }); rim.dispose();
  const face = new THREE.CylinderGeometry(r * 0.857, r * 0.857, 0.022, 18); q = at(0.010); b.geo(face, q[0], q[1], q[2], disc || BTN, { align: n }); face.dispose();  // dark button disc (red on exploder)
  q = at(0.024); b.box(r * 1.036, 0.010, 0.010, q[0], q[1], q[2], STITCH, { ry: 0.78, align: n }); b.box(r * 1.036, 0.010, 0.010, q[0], q[1], q[2], STITCH, { ry: -0.78, align: n });  // white X-stitch
}
// a Tolo bead eye (small dark sphere + thread arc) on the head surface
function beadEye(b, x, y, r) {
  const n = headNorm(x, y), p = headSurf(x, y); const g = new THREE.SphereGeometry(r, 12, 10); b.geo(g, p.x + n.x * 0.010, p.y + n.y * 0.010, p.z + n.z * 0.010, BEAD); g.dispose();
  arcTube(b, x, y, r * 1.5, Math.PI * 0.55, Math.PI * 1.45, 0.010, DARK);
}
// Luka-boss hair: a thin curvy tube strand with a ball-cap tip, ALWAYS rooted at the crown CENTRE
// (0, 0.620, 0.020); `ang` fans the strand's horizontal drift so multiple strands splay from one point.
function addHair(b, ang, color) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const pts = [
    new THREE.Vector3(0, 0.620, 0.020),
    new THREE.Vector3(c * 0.016, 0.668, 0.014 + s * 0.016),
    new THREE.Vector3(c * 0.038, 0.712, 0.002 + s * 0.038),
    new THREE.Vector3(c * 0.030, 0.744, -0.010 + s * 0.030),
  ];
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.017, 6, false); b.geo(g, 0, 0, 0, color); g.dispose();
  const tip = pts[3]; const cap = new THREE.SphereGeometry(0.017, 8, 8); b.geo(cap, tip.x, tip.y, tip.z, color); cap.dispose();
}
// torn plush stuffing — a clump of cream lumps poking out of a cut; baked into severed-limb GIBS (native coords)
function addStuffWad(b, x, y, z, s = 1) {
  const lumps = [[0, 0, 0, 0.055], [0.03, 0.022, 0.012, 0.038], [-0.026, 0.016, -0.02, 0.034], [0.012, -0.022, 0.024, 0.032], [-0.01, 0.03, 0.0, 0.03]];
  for (const [ox, oy, oz, r] of lumps) { const g = new THREE.SphereGeometry(r * s, 7, 6); b.geo(g, x + ox * s, y + oy * s, z + oz * s, CREAM, { tint: 0.06 }); g.dispose(); }
}

// add one part's native geometry (face -Z) to builder b
function addPartNative(b, name, color, variant) {
  if (name === 'torso') {
    const g = new THREE.SphereGeometry(BODY_R, 18, 14); b.geo(g, 0, BODY_Y, 0, color, { tint: 0.02 }); g.dispose();   // body (NO bullseye)
    if (variant === 'exploder') { for (const yy of [BODY_Y + 0.08, BODY_Y - 0.08]) b.box(0.30, 0.035, 0.06, 0, yy, -BODY_R, DARK); } // danger stripes (front = -Z)
    if (variant === 'charger') {                                                                                       // strapped explosive vest
      b.box(0.40, 0.34, 0.30, 0, BODY_Y + 0.02, 0, 0x363636, { tint: 0.03 });
      const stick = new THREE.CylinderGeometry(0.04, 0.04, 0.26, 6);
      for (const dx of [-0.12, -0.04, 0.04, 0.12]) b.geo(stick, dx, BODY_Y + 0.02, -0.17, 0xc0392b, { tint: 0.03 }); stick.dispose();
      b.box(0.06, 0.06, 0.06, 0, BODY_Y + 0.16, -0.18, 0xff2a2a);
    }
  } else if (name === 'head') {
    const g = new THREE.SphereGeometry(HEAD_R, 18, 14); b.geo(g, 0, HEAD_Y, 0, color, { tint: 0.02 }); g.dispose();
  } else if (name === 'armL' || name === 'armR') {
    const sign = name === 'armL' ? -1 : 1; const g = new THREE.CapsuleGeometry(0.072, 0.075, 4, 10);
    b.geo(g, sign * 0.255, -0.02, 0.0, color, { rz: -sign * 0.78, tint: 0.02 }); g.dispose();
  } else { // legs (feet)
    const sign = name === 'legL' ? -1 : 1; const g = new THREE.CapsuleGeometry(0.082, 0.05, 4, 10);
    b.geo(g, sign * 0.115, -0.34, 0.015, color, { tint: 0.02 }); g.dispose();
  }
}

// ---------------------------------------------------------------------------
// Bake — compute the shared scale/translate once, then bake each part geo + socket into the enemy
// envelope (rotateY π → face +Z, scale ~2.25 tall, feet→0), and translate each part relative to its
// socket so the pivot rotates the limb naturally. Capsules are auto-fit from each baked part's bbox.
// ---------------------------------------------------------------------------
let LAYOUT = null;
function socketBaked(n, S, T) { return new THREE.Vector3(-n[0] * S, n[1] * S + T, -n[2] * S); }
function bakeRel(geo, sock, S, T) { geo.rotateY(Math.PI); geo.scale(S, S, S); geo.translate(0, T, 0); geo.translate(-sock.x, -sock.y, -sock.z); geo.computeBoundingBox(); return geo; }
function capFromGeo(geo) {
  const bb = geo.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
  const hx = (bb.max.x - bb.min.x) / 2, hy = (bb.max.y - bb.min.y) / 2, hz = (bb.max.z - bb.min.z) / 2;
  const hmax = Math.max(hx, hy, hz); let ux = 0, uy = 0, uz = 0, r;
  if (hmax === hy) { uy = 1; r = Math.max(hx, hz); } else if (hmax === hx) { ux = 1; r = Math.max(hy, hz); } else { uz = 1; r = Math.max(hx, hy); }
  const half = Math.max(0, hmax - r); r *= 1.08;   // 8% forgiveness for reliable hits
  return { ax: cx - ux * half, ay: cy - uy * half, az: cz - uz * half, bx: cx + ux * half, by: cy + uy * half, bz: cz + uz * half, r };
}
function ensureLayout() {
  if (LAYOUT) return LAYOUT;
  // measure S,T from the canonical silhouette (head sphere + body + feet + a hair tuft on top)
  const mb = new MeshBuilder();
  for (const m of PART_META) addPartNative(mb, m.name, 0xffffff, 'normal');
  mb.box(0.02, 0.13, 0.02, 0, HEAD_Y + HEAD_R + 0.02, 0, 0x111111);   // tallest hair → height includes the crown
  const mg = mb.build(); mg.rotateY(Math.PI); mg.computeBoundingBox();
  const S = 2.25 / (mg.boundingBox.max.y - mg.boundingBox.min.y);
  const T = -mg.boundingBox.min.y * S; mg.dispose();
  LAYOUT = { S, T, sockets: {}, caps: {} };
  for (const m of PART_META) {
    const sock = socketBaked(m.socket, S, T); LAYOUT.sockets[m.name] = sock;
    const pb = new MeshBuilder(); addPartNative(pb, m.name, 0xffffff, 'normal');
    const g = bakeRel(pb.build(), sock, S, T); LAYOUT.caps[m.name] = capFromGeo(g); g.dispose();
  }
  return LAYOUT;
}

// ---------------------------------------------------------------------------
// Geometry caches — coloured part geos per (colour,variant); face geos per signature; shared stump.
// ---------------------------------------------------------------------------
const _partCache = new Map();   // 'color:variant' -> { torso, head, armL, armR, legL, legR, headGib }
const _faceCache = new Map();   // sig -> geo
let _stumpGeo = null;

function partGeos(colorHex, variant = 'normal') {
  const key = colorHex + ':' + variant;
  let c = _partCache.get(key); if (c) return c;
  const L = ensureLayout();
  const headCol = colorHex, bodyCol = shade(colorHex, -0.05), limbCol = shade(colorHex, 0.04);   // Tolo 3-tone, recoloured
  c = {};
  for (const m of PART_META) {
    const col = m.kind === 'head' ? headCol : m.kind === 'torso' ? bodyCol : limbCol;
    const b = new MeshBuilder(); addPartNative(b, m.name, col, variant);
    c[m.name] = bakeRel(b.build(), L.sockets[m.name], L.S, L.T);
  }
  // severed-limb GIBS = the limb geo + a wad of torn plush stuffing poking out at the cut (the socket)
  for (const m of PART_META) {
    if (!m.severable || m.kind === 'head') continue;
    const b = new MeshBuilder(); addPartNative(b, m.name, limbCol, variant); addStuffWad(b, m.socket[0], m.socket[1], m.socket[2]);
    c[m.name + 'Gib'] = bakeRel(b.build(), L.sockets[m.name], L.S, L.T);
  }
  // head gib = baked head sphere + a generic button-face + a stuffing wad at the neck, centred on itself
  { const b = new MeshBuilder(); const g = new THREE.SphereGeometry(HEAD_R, 16, 12); b.geo(g, 0, HEAD_Y, 0, headCol, { tint: 0.02 }); g.dispose();
    buttonEye(b, 0.12, EY, 0.06); beadEye(b, -0.13, EY - 0.02, 0.034); addHair(b, -Math.PI / 2, DARK); addStuffWad(b, 0, HEAD_Y - HEAD_R + 0.02, 0, 1.4);
    const geo = b.build(); geo.rotateY(Math.PI); geo.scale(L.S, L.S, L.S); geo.computeBoundingBox();
    const cy = (geo.boundingBox.min.y + geo.boundingBox.max.y) / 2; geo.translate(0, -cy, 0); geo.computeBoundingBox(); c.headGib = geo; }
  _partCache.set(key, c);
  return c;
}

// EXACTLY three Engendro eye layouts (owner-locked, nothing else): one big · one medium + one stunted
// bead · three medium. Sizes proportioned to the body — NOT the huge Tolo-boss eye; medium when paired.
const EYE_COMBOS = ['cyclops', 'medSmall', 'triple'];
const EYE_MED = 0.06, EYE_BIG = 0.097, EYE_BEAD = 0.034;
// face = eyes (random combo, Tolo button/bead asset on the head surface) + stitch smile + 1-3 hairs.
// Built native then baked + made relative to the NECK socket (so it aligns with the head part geo).
function faceGeo(sig) {
  let g = _faceCache.get(sig); if (g) return g;
  const L = ensureLayout();
  const [combo, hairN, accentS] = sig.split(':'); const hairCount = +hairN; const accent = accentS ? parseInt(accentS, 16) : BTN;
  const b = new MeshBuilder();
  if (combo === 'cyclops') { buttonEye(b, 0, EY, EYE_BIG, accent); }                                          // 1 big eye
  else if (combo === 'medSmall') { buttonEye(b, 0.12, EY, EYE_MED, accent); beadEye(b, -0.13, EY - 0.02, EYE_BEAD); } // 1 medium + 1 stunted bead
  else { for (const ex of [-0.165, 0, 0.165]) buttonEye(b, ex, EY, EYE_MED, accent); } // 3 medium in a row (Mitri)
  // stitch smile (Tolo): tube + 3 X-stitches + corner arcs
  const smileXY = (t) => [-0.16 + 0.32 * t, 0.205 + 0.058 * Math.pow(2 * t - 1, 2)];
  { const pts = [], N = 22; for (let i = 0; i <= N; i++) { const [mx, my] = smileXY(i / N); const p = headSurf(mx, my), n = headNorm(mx, my); pts.push(new THREE.Vector3(p.x - n.x * 0.008, p.y - n.y * 0.008, p.z - n.z * 0.008)); }
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.012, 6, false); b.geo(tg, 0, 0, 0, DARK); tg.dispose(); }
  for (const t of [0.2, 0.5, 0.8]) { const [mx, my] = smileXY(t); xStitch(b, mx, my, 0.06, DARK, t === 0.5 ? 0 : 0.42); }
  { const [lx, ly] = smileXY(0.0); arcTube(b, lx + 0.032, ly - 0.011, 0.044, Math.PI * 0.58, Math.PI * 1.42, 0.012, DARK); }
  { const [rx, ry] = smileXY(1.0); arcTube(b, rx - 0.032, ry - 0.011, 0.044, -Math.PI * 0.42, Math.PI * 0.42, 0.012, DARK); }
  // 1-3 Luka-style curvy hair strands, ALL sprouting from the crown CENTRE, fanning out
  const HAIR_ANG = { 1: [-Math.PI / 2], 2: [Math.PI * 0.85, Math.PI * 0.15], 3: [Math.PI, -Math.PI / 2, 0] };
  for (const ang of (HAIR_ANG[hairCount] || HAIR_ANG[1])) addHair(b, ang, DARK);
  g = bakeRel(b.build(), L.sockets.head, L.S, L.T);
  _faceCache.set(sig, g);
  return g;
}

function stumpGeo() {
  if (_stumpGeo) return _stumpGeo;
  const b = new MeshBuilder();
  b.geo(new THREE.SphereGeometry(1.0, 8, 6), 0, 0, 0, CREAM, { sy: 0.7 });   // unit stuffing wad (scaled per part)
  const ring = new THREE.TorusGeometry(0.88, 0.18, 6, 12); b.geo(ring, 0, 0, 0, RIM, { rx: Math.PI / 2 }); ring.dispose();
  _stumpGeo = b.build();
  return _stumpGeo;
}

// ---------------------------------------------------------------------------
// Rig build / dress / animate
// ---------------------------------------------------------------------------
// Build the per-enemy rig (Group + pivots + meshes + stumps). Geometry is assigned in dressRig.
// `mat` is the enemy's shared material (one per enemy, for burn/courier emissive).
export function buildRig(mat) {
  const L = ensureLayout();
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';   // yaw→pitch→roll so the crawl forward-lean follows the heading, not world X
  const parts = [];
  let headPivot = null, faceMesh = null;
  for (const m of PART_META) {
    const sock = L.sockets[m.name], cap = L.caps[m.name];
    const pivot = new THREE.Group();
    pivot.position.copy(sock);
    const mesh = new THREE.Mesh(undefined, mat);
    mesh.castShadow = (m.kind === 'torso' || m.kind === 'head');   // limit shadow casters (~2 per enemy) like before
    pivot.add(mesh);
    root.add(pivot);
    const part = { name: m.name, kind: m.kind, side: m.side, severable: m.severable,
      pivot, mesh, cap, socket: sock,
      alive: true, goreHp: 0, goreMax: 0, restRot: { x: 0, y: 0, z: 0 }, wobPhase: 0, wobFreq: 1, wobAmp: 0 };
    parts.push(part);
    if (m.name === 'head') { headPivot = pivot;
      faceMesh = new THREE.Mesh(undefined, mat); faceMesh.castShadow = false; pivot.add(faceMesh); part.faceMesh = faceMesh; }
    // stump (hidden) — child of ROOT at the socket so it stays on the body when the part hides
    const stump = new THREE.Mesh(stumpGeo(), mat);
    stump.position.copy(sock); stump.scale.setScalar(cap.r * 0.9); stump.visible = false;
    if (m.kind === 'arm') stump.rotation.z = Math.PI / 2;   // arm cut is ~horizontal → turn the torn felt ring to face outward (±X), not up
    root.add(stump); part.stump = stump;
  }
  return { root, parts, headPivot, faceMesh, byName: Object.fromEntries(parts.map((p) => [p.name, p])), wt: 0, seed: 0 };
}

// Dress a rig for a spawn: assign cached geos for the colour, build the face from the seed, reset all
// parts alive (gore-HP set by caller from maxHp), hide stumps. Pool-safe.
export function dressRig(rig, colorHex, seed, variant = 'normal') {
  rig.seed = seed >>> 0;
  rig.colorHex = colorHex; rig.variant = variant;
  const r = makeRNG(rig.seed || 1);
  const geos = partGeos(colorHex, variant);
  const combo = choice(EYE_COMBOS, r);
  const hairCount = randInt(1, 3, r);
  const accent = variant === 'exploder' ? 0xff3a2a : BTN;
  const faceSig = combo + ':' + hairCount + ':' + accent.toString(16);
  for (const p of rig.parts) {
    p.mesh.geometry = geos[p.name];
    p.alive = true; p.mesh.visible = true; p.pivot.visible = true; p.stump.visible = false;
    p.pivot.position.copy(p.socket);
    p.pivot.rotation.set(0, 0, 0); p.pivot.scale.setScalar(1);
    // per-part loose-plush wobble (seeded phase/freq/amp) — limbs jiggle more than head/body
    p.wobPhase = randRange(0, Math.PI * 2, r);
    p.wobFreq = randRange(1.1, 2.6, r);
    p.wobAmp = p.kind === 'torso' ? 0 : (p.kind === 'head' ? 0.05 : randRange(0.12, 0.26, r));
    p.restRot.x = 0; p.restRot.z = 0;
  }
  if (rig.faceMesh) rig.faceMesh.geometry = faceGeo(faceSig);
  // small per-spawn lopsided size jitter on limbs (cheap silhouette variety)
  for (const p of rig.parts) if (p.kind === 'arm' || p.kind === 'leg') p.pivot.scale.setScalar(randRange(0.9, 1.12, r));
  rig.wt = 0;
  rig.eyeCombo = combo;
  return rig;
}

// Per-frame transform: root pose (upright OR crawl) + loose plush wobble. Reads the enemy.
export function animateRig(e, dt) {
  const rig = e.rig; if (!rig) return;
  rig.wt += dt;
  const t = rig.wt;
  const root = rig.root;
  const heading = Math.atan2(e._hx || 0, e._hz || 1);
  const sq = e.squash > 0 ? 1 - e.squash * 1.6 : 1;
  // root pose. rotation.order = 'YXZ' (set in buildRig) so the forward crawl-lean (X) is applied in the
  // already-yawed frame → it leans toward the heading (the player), not sideways.
  if (e.crawling) {
    // PRONE but UPRIGHT-ISH: sink to the ground + gentle forward drag-lean + lopsided roll. The body stays
    // facing the player (yaw=heading); the head lifts (below) so the face looks UP at the player — NOT on its back.
    const lean = 0.6;
    root.position.set(e.pos.x, e.pos.y - 0.08 * e.scale, e.pos.z);
    root.rotation.set(lean, heading, (e._crawlRoll || 0) + Math.sin(t * 3) * 0.05);
  } else {
    root.position.set(e.pos.x, e.pos.y + Math.abs(Math.sin(e.bob)) * 0.08, e.pos.z);
    root.rotation.set(0, heading, Math.sin(e.bob) * 0.07);
  }
  root.scale.set(e.scale, e.scale * sq, e.scale);
  // per-part loose-plush wobble + crawl drag animation
  for (const p of rig.parts) {
    if (!p.alive) continue;
    if (p.kind === 'torso') continue;
    const w = Math.sin(t * p.wobFreq + p.wobPhase) * p.wobAmp;
    if (p.kind === 'head') {
      // crawl: lift the head so net world-pitch is slightly UP → face looks at the player (counters the body lean)
      if (e.crawling) p.pivot.rotation.set(-0.95 + w * 0.3, Math.sin(t * 1.2 + p.wobPhase) * 0.08, 0);
      else p.pivot.rotation.set(w * 0.6, Math.sin(t * 0.9 + p.wobPhase) * 0.05, 0);
    } else if (p.kind === 'arm') {
      if (e.crawling) { const reach = -0.7 + Math.sin(t * 5 + (p.side > 0 ? Math.PI : 0)) * 0.5; p.pivot.rotation.set(reach + w, 0, w * 0.5); } // reach + pull drag
      else { const swing = Math.sin(e.bob + (p.side > 0 ? Math.PI : 0)) * 0.18; p.pivot.rotation.set(swing + w, 0, w * 0.5); }
    } else { // leg
      if (e.crawling) p.pivot.rotation.set(0.6 + w * 0.4, 0, 0);                                            // remaining leg trails behind
      else { const swing = Math.sin(e.bob + (p.side > 0 ? 0 : Math.PI)) * 0.22; p.pivot.rotation.set(swing + w * 0.6, 0, 0); }
    }
  }
}

// ---------------------------------------------------------------------------
// Per-part raycast (precise hitbox). Caller must updateMatrixWorld(true) on rig.root first.
// Returns { part, t, point } of the nearest alive part hit within maxT, or null.
// ---------------------------------------------------------------------------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _col0 = new THREE.Vector3();
export function raycastRig(rig, ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT, bestPart = null;
  for (const p of rig.parts) {
    if (!p.alive) continue;
    const m = p.pivot.matrixWorld;
    _a.set(p.cap.ax, p.cap.ay, p.cap.az).applyMatrix4(m);
    _b.set(p.cap.bx, p.cap.by, p.cap.bz).applyMatrix4(m);
    const scale = _col0.setFromMatrixColumn(m, 0).length() || 1;   // uniform world scale
    const r = p.cap.r * scale;
    const t = rayCapsule(ox, oy, oz, dx, dy, dz, _a.x, _a.y, _a.z, _b.x, _b.y, _b.z, r, null);
    if (t !== null && t >= 0 && t < best) { best = t; bestPart = p; }
  }
  if (!bestPart) return null;
  return { part: bestPart, t: best, point: new THREE.Vector3(ox + dx * best, oy + dy * best, oz + dz * best) };
}

// Compute the broadphase AABB half-extents for an enemy given its pose (encloses prone crawl).
export function rigAABB(e, out = null) {
  // upright: radius wide, height tall; crawl: long+low. Generous so it never clips a precise hit. `out` lets the
  // hot raycast path reuse a scratch object instead of allocating one per enemy per ray.
  out = out || { r: 0, h: 0 };
  if (e.crawling) { out.r = 1.3 * e.scale; out.h = 0.9 * e.scale; }
  else { out.r = 0.62 * e.scale; out.h = 2.3 * e.scale; }
  return out;
}

// ---------------------------------------------------------------------------
// Gib pool — severed parts tumble to the ground (makeTumble + stepBody), pooled + capped.
// ---------------------------------------------------------------------------
class GibPool {
  constructor(scene) { this.scene = scene; this.mat = voxelMaterial(); this.items = []; }
  spawn(geo, worldPos, worldScale, dir, seed, floorY) {
    let it = this.items.find((g) => !g.live);
    if (!it) {
      if (this.items.length >= DISMEMBER.gibCap) { it = this.items.shift(); this.items.push(it); }   // FIFO recycle oldest
      else { it = { mesh: new THREE.Mesh(undefined, this.mat), live: false, body: { kind: 'tumble', pos: [0, 0, 0], vel: [0, 0, 0], rotAxis: [0, 1, 0], rotAngle: 0, rotSpeed: 0, bounces: 0, settled: false, acc: 0, g: 11, radius: 0.2, floorY: 0 } }; this.scene.add(it.mesh); this.items.push(it); }
    }
    it.mesh.geometry = geo;
    it.mesh.visible = true; it.mesh.scale.setScalar(worldScale); it._s0 = worldScale;   // _s0 = base scale for the linear fade-out
    // ONE seeded RNG stream + reused pooled body → no per-gib array/closure garbage (was makeTumble + 2 makeRNG closures
    // + an UNSEEDED lateral that diverged across co-op peers). The cap-48 pool warms once, then bursts are alloc-free.
    const rng = makeRNG(seed >>> 0);
    const sp = 3.0 + rng() * 2.0, up = 2.0 + rng() * 2.0;
    const b = it.body;
    b.pos[0] = worldPos.x; b.pos[1] = worldPos.y; b.pos[2] = worldPos.z;
    b.vel[0] = dir.x * sp + (rng() * 2 - 1); b.vel[1] = up; b.vel[2] = dir.z * sp + (rng() * 2 - 1);
    const axx = rng() * 2 - 1, axy = rng() * 2 - 1, axz = rng() * 2 - 1, an = Math.hypot(axx, axy, axz) || 1;
    b.rotAxis[0] = axx / an; b.rotAxis[1] = axy / an; b.rotAxis[2] = axz / an;
    b.rotAngle = 0; b.rotSpeed = (2 + rng() * 6) * 1.4; b.bounces = 0; b.settled = false; b.acc = 0;
    b.g = 11; b.radius = 0.22 * worldScale; b.floorY = (floorY ?? 0) + 0.05;
    it.linger = 0; it.live = true;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.live) continue;
      stepBody(it.body, dt);
      const p = it.body.pos;
      it.mesh.position.set(p[0], p[1], p[2]);
      it.mesh.quaternion.setFromAxisAngle(_a.set(it.body.rotAxis[0], it.body.rotAxis[1], it.body.rotAxis[2]), it.body.rotAngle);
      if (it.body.settled) {
        it.linger += dt;
        if (it.linger > DISMEMBER.gibLinger) {
          const k = clamp(1 - (it.linger - DISMEMBER.gibLinger) / DISMEMBER.gibFade, 0, 1);
          it.mesh.scale.setScalar(k * (it._s0 || it.mesh.scale.x || 1));
          if (k <= 0) { it.live = false; it.mesh.visible = false; }
        }
      }
    }
  }
  clear() { for (const it of this.items) { it.live = false; it.mesh.visible = false; } }
}
let _gibs = null;
export function gibPool(scene) { return _gibs || (_gibs = new GibPool(scene)); }
export function updateGibs(dt) { if (_gibs) _gibs.update(dt); }   // tick falling/settling gibs (host AND clients)
export function clearGibs() { if (_gibs) _gibs.clear(); }

// ---------------------------------------------------------------------------
// Dismemberment core — host-authoritative. Returns the severed part name, or null.
// `dir` is the impulse direction (hit/shot dir). `game` provides effects/audio/scene.
// Cosmetic-only replay path (clients) goes through severCosmetic().
// ---------------------------------------------------------------------------
export function partByName(rig, name) { return rig.byName[name]; }
export function limbFlags(rig) { return limbFlagsFromParts(rig.parts); }   // co-op `lf` bitmask (esnap/espawn); pure math in dismember-core.js
export function applyLimbFlags(game, e, f) { // client/late-join: hide parts matching the flag int
  if (!e.rig || !f) return;
  for (const p of e.rig.parts) if (p.severable && (f & SEVER_BIT[p.name]) && p.alive) severCosmetic(game, e, p, null, true);
}

// world-space socket position of a part (where the cut is)
const _wp = new THREE.Vector3();
function partSocketWorld(p) { p.pivot.updateWorldMatrix(true, false); return _wp.set(0, 0, 0).setFromMatrixPosition(p.pivot.matrixWorld); }

// Cosmetic detach: hide the part, reveal the stump, fling a gib. Runs on host AND clients.
export function severCosmetic(game, e, p, dir, silent = false) {
  if (!p.alive) return;
  p.alive = false; p.pivot.visible = false; if (p.stump) p.stump.visible = true;
  if (silent) return;   // late-join / esnap reconcile of an ALREADY-old wound: set the visual state only — no spray/gib/audio
  const rig = e.rig;
  const m = e.rig.root.matrixWorld;
  const wScale = _col0.setFromMatrixColumn(m, 0).length() || e.scale || 1;
  const sock = partSocketWorld(p);   // scratch _wp; read synchronously by gush/stuffing/spawn below, never retained → no clone needed
  const d = dir ? _b.set(dir.x, dir.y, dir.z) : _b.set(randRange(-1, 1), 0.2, randRange(-1, 1));
  if (d.lengthSq() < 1e-4) d.set(0, 0.3, 1);
  d.normalize();
  // "blood"/stuffing SPRAY out of the wound (directional jet along the cut) + a soft fluff cloud
  if (game.effects) {
    const col = e.col ? e.col.body : 0xeeeeee;
    game.effects.gush(sock, d, col, 20, 7);
    game.effects.stuffing(sock, col, 8, 3);
  }
  // gib (skip in Light gore mode for perf — fluff burst + hide only, L4D2-style)
  if (DISMEMBER.gore === 'full' && DISMEMBER.gibCap > 0 && game.engine) {
    const geos = partGeos(rig.colorHex ?? (e.col ? e.col.body : 0xede7df), rig.variant || 'normal');
    const geo = p.kind === 'head' ? geos.headGib : (geos[p.name + 'Gib'] || geos[p.name]);
    const seed = ((e.id || 1) * 2654435761 ^ (SEVER_BIT[p.name] * 40503)) >>> 0;
    const floorY = game.world ? game.world.groundY(sock.x, sock.z) : 0;
    gibPool(game.engine.scene).spawn(geo, sock, wScale, d, seed, floorY);
  }
  if (game.audio && game.audio.tone) { game.audio.tone(220 + Math.random() * 120, 0.06, 'triangle', 0.25); if (game.audio.noise) game.audio.noise(0.08, 0.2, 'lowpass', 900, 0.5); }
}
