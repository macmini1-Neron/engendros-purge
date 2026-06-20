// fallphys.js — bespoke mini-physics for falling pieces (spec §2.4). PURE, deterministic.
// Internally substepped at a fixed 120 Hz regardless of caller dt (game loop stays variable-dt).
// Note: Math.sin/cos are not bit-specified by ECMAScript; MP replay determinism assumes
// the same JS engine family on all peers (V8 in practice). Settle thresholds are coarse
// enough that ULP-level trig differences are very unlikely to change outcomes.
import { pointInAABB } from './geom.js';

const SUBSTEP = 1 / 120;
const G = 9.81;            // 1 unit = 1 m — physical gravity reads true for big falling bodies
const DAMP = 0.35;         // angular drag (air + green-wood fibres at the hinge)
const SETTLE_AV = 1.2;     // contact below this angular speed ⇒ settle
const BOUNCE = -0.25;      // angular restitution on hard contact
const MAX_BOUNCES = 3;

function mulberry32(seed) {                 // tiny seeded RNG copy (src/util.js makeRNG, kept
  let a = seed >>> 0;                       // dependency-free so node tests need no THREE)
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hinged trunk above a break point. pivot=[x,y,z]; dirXZ=[x,z] horizontal fall direction
// (normalized); length/radius in metres; obstacles = [{min,max}, ...] static AABBs.
export function makeHinge({ pivot, dirXZ, length, radius, seed = 1, obstacles = [] }) {
  const rng = mulberry32(seed);
  return {
    kind: 'hinge', pivot, dirXZ, length, radius, obstacles,
    angle: 0.03 + rng() * 0.04,   // seeded initial lean — the only randomness
    angVel: 0, bounces: 0, settled: false, acc: 0, rng,
  };
}

// Ballistic tumbling chunk (HE hero debris). pos/vel = [x,y,z]. `g` overrides gravity (default
// 9.81) — pass a smaller value for a slower, weightier collapse (heavy masonry settling).
export function makeTumble({ pos, vel, seed = 1, radius = 0.15, g = G, spin = 1 }) {
  const rng = mulberry32(seed);
  const ax = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1];
  const n = Math.hypot(...ax) || 1;
  return {
    kind: 'tumble', pos: [...pos], vel: [...vel], g,
    rotAxis: ax.map(v => v / n), rotAngle: 0, rotSpeed: (2 + rng() * 6) * spin,
    bounces: 0, settled: false, acc: 0, radius,
  };
}

// World point at fraction f (0=pivot/butt, 1=tip) along the hinged rod at its current angle.
export function hingePoint(b, f) {
  const s = b.length * f, sin = Math.sin(b.angle), cos = Math.cos(b.angle);
  return [b.pivot[0] + sin * s * b.dirXZ[0], b.pivot[1] + cos * s, b.pivot[2] + sin * s * b.dirXZ[1]];
}

// Advance by caller dt (any size; clamps at 50 ms like the game loop). Fixed-substep inside.
export function stepBody(b, dt) {
  if (b.settled) return;
  b.acc += Math.min(dt, 0.05);
  while (b.acc >= SUBSTEP && !b.settled) {
    b.acc -= SUBSTEP;
    if (b.kind === 'hinge') subHinge(b); else subTumble(b);
  }
}

// 5-point sampling along the rod (no f=0 — the pivot region can't reach the ground).
// Obstacles thinner than ~0.35 m can slip between tip samples at peak speed; fine for
// walls/buildings, revisit if thin posts ever need to stop a falling trunk.
function hingeContact(b) {
  for (const f of [0.35, 0.55, 0.75, 0.92, 1.0]) {
    const p = hingePoint(b, f);
    if (p[1] - b.radius <= 0) return true;                       // ground
    for (const o of b.obstacles) if (pointInAABB(p, o.min, o.max, b.radius)) return true;
  }
  return false;
}

function subHinge(b) {
  b.angVel += ((1.5 * G / b.length) * Math.sin(b.angle) - DAMP * b.angVel) * SUBSTEP;
  const prev = b.angle;
  b.angle += b.angVel * SUBSTEP;
  if (b.angVel > 0 && hingeContact(b)) {
    b.angle = prev;                                              // back out of penetration
    if (Math.abs(b.angVel) < SETTLE_AV || b.bounces >= MAX_BOUNCES) { b.settled = true; return; }
    b.angVel *= BOUNCE; b.bounces++;
  }
}

function subTumble(b) {
  b.vel[1] -= G * SUBSTEP;
  for (let i = 0; i < 3; i++) b.pos[i] += b.vel[i] * SUBSTEP;
  b.rotAngle += b.rotSpeed * SUBSTEP;
  if (b.pos[1] <= b.radius) {
    b.pos[1] = b.radius;
    if (Math.abs(b.vel[1]) < 1.0 || b.bounces >= MAX_BOUNCES) {
      b.settled = true; b.vel = [0, 0, 0]; b.rotSpeed = 0; return;
    }
    b.vel[1] *= -0.3; b.vel[0] *= 0.6; b.vel[2] *= 0.6; b.rotSpeed *= 0.5; b.bounces++;
  }
}
