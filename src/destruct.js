// destruct.js — DESTRUCTION CORE (pure logic). Graduated from tools/destructlab/.
//
// PURE & node-testable: NO `import 'three'`, NO DOM. Every export here can run under
// `node --test`. The browser-only InstancedMesh debris pool lives in a SEPARATE file,
// src/destruct-debris.js (it needs THREE) — keeping this module THREE-free is what lets
// the node tests import it directly.
//
// Sources consolidated here (all reviewed, 26/26 lab tests):
//   tools/destructlab/geom.js     → AABB/ray helpers
//   tools/destructlab/matrix.js   → MATERIALS, makePart, resolveHit/Blast/Penetration
//   tools/destructlab/fallphys.js → FallingBody mini-physics (hinge/tumble)
// PLUS the refined APFSDS model (obliterate fragile / through-hole structural + spall),
// the `fuel` + `sound` fields on MATERIALS, the part-metadata contract, and the runtime
// apply* pipeline (designed to be wired into gameplay in a later phase — NOT wired yet).

// ───────────────────────────────────────────────────────────────────────────
// 1. Geometry helpers (pure AABB/ray on plain [x,y,z] arrays). From geom.js.
// ───────────────────────────────────────────────────────────────────────────

// Slab method. o=origin[3], d=dir[3] (normalized), min/max=[3]. Returns entry t ≥ 0 or null.
export function rayAABB(o, d, min, max) {
  const span = rayAABBSpan(o, d, min, max);
  return span ? span.tIn : null;
}

// Returns { tIn, tOut } or null. tIn clamped to ≥ 0 (origin inside box ⇒ tIn = 0).
export function rayAABBSpan(o, d, min, max) {
  let tIn = -Infinity, tOut = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
      continue;
    }
    let t1 = (min[i] - o[i]) / d[i], t2 = (max[i] - o[i]) / d[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tIn) tIn = t1;
    if (t2 < tOut) tOut = t2;
    if (tIn > tOut) return null;
  }
  if (tOut < 0) return null;
  return { tIn: Math.max(tIn, 0), tOut };
}

// Distance from point to closest surface point of the AABB (0 if inside).
export function distToAABB(p, min, max) {
  let s = 0;
  for (let i = 0; i < 3; i++) {
    const d = Math.max(min[i] - p[i], 0, p[i] - max[i]);
    s += d * d;
  }
  return Math.sqrt(s);
}

export function pointInAABB(p, min, max, inflate = 0) {
  return p[0] >= min[0] - inflate && p[0] <= max[0] + inflate &&
         p[1] >= min[1] - inflate && p[1] <= max[1] + inflate &&
         p[2] >= min[2] - inflate && p[2] <= max[2] + inflate;
}

export function aabbCenter(min, max) {
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Material registry & damage matrix. From matrix.js + spec §2.2.
// ───────────────────────────────────────────────────────────────────────────

// Single source of truth. Each entry: { tier, hp, debris, sound, fuel }.
//  - tier   : hardness 0–5; a weapon `pen < tier` ⇒ cosmetic only (no HP loss).
//  - hp      : base part hit-points (scaled per part via hpScale).
//  - debris  : recipe key consumed by the DebrisPool (src/destruct-debris.js).
//  - sound   : audio bucket key for a later audio phase (glass/wood/metal/masonry/grass).
//  - fuel    : burn-time budget the FIRE system reads. fuel === 0 ⇒ NEVER ignites
//              (glass/sheetmetal/brick/concrete/steel). fuel > 0 ⇒ burns + ignites neighbours.
export const MATERIALS = {
  glass:      { tier: 0, hp: 1,    debris: 'shards',  sound: 'glass',   fuel: 0  },
  wood:       { tier: 1, hp: 60,   debris: 'splints', sound: 'wood',    fuel: 6  },
  sheetmetal: { tier: 2, hp: 120,  debris: 'panels',  sound: 'metal',   fuel: 0  },
  trunk:      { tier: 2, hp: 250,  debris: 'splints', sound: 'wood',    fuel: 10 },
  brick:      { tier: 3, hp: 400,  debris: 'rubble',  sound: 'masonry', fuel: 0  },
  concrete:   { tier: 4, hp: 900,  debris: 'rubble',  sound: 'masonry', fuel: 0  },
  steel:      { tier: 5, hp: 2000, debris: 'sparks',  sound: 'metal',   fuel: 0  },
  grass:      { tier: 0, hp: 1,    debris: 'splints', sound: 'grass',   fuel: 2  },
};

// Reference caliber/pen table (spec §5). Gameplay weaponDefs map onto this shape
// ({ pen, dmg } + optional blast / through / spall). Kept as a graduated copy of the
// lab's LAB_WEAPONS so the ported tests and the apply* pipeline share one source.
export const CALIBERS = {
  pistol:   { key: 'pistol',   pen: 0, dmg: 8 },
  shotgun:  { key: 'shotgun',  pen: 1, dmg: 12 },   // pellet pen 1 — breaks fences
  rifle:    { key: 'rifle',    pen: 1, dmg: 15 },
  hmg127:   { key: 'hmg127',   pen: 2, dmg: 40 },
  heRocket: { key: 'heRocket', pen: 4, dmg: 500, blast: { r1: 2.5, r2: 6, tier: 3 } },
  apfsds:   { key: 'apfsds',   pen: 5, dmg: 900, through: { maxWalls: 4, falloff: 0.6 },
              spall: { range: 6, halfAngle: 0.5 } },
};

// ── Part-metadata contract ───────────────────────────────────────────────────
// A destructible part generalizes world.js's `struct: true, _ref` fortification box:
//   { min, max,          AABB corners as [x,y,z] arrays (as today's collision boxes)
//     dmat,              material key into MATERIALS — its PRESENCE marks a box destructible
//     dhp,               current hit-points
//     dpart,             stable part id (MP sync + late-join)
//     downer,            back-ref to the owning destructible (building/tree) — solves the
//                        "world.boxes has no mesh back-reference" gotcha
//     dead }             true once destroyed (pooled, not freed)
// makePart fills this shape; `downer` is wired by the owner at registration time.
export function makePart(id, mat, min, max, hpScale = 1) {
  if (!MATERIALS[mat]) throw new Error(`unknown material: ${mat}`);
  return { dpart: id, dmat: mat, dhp: MATERIALS[mat].hp * hpScale, min, max, downer: null, dead: false };
}

// Hitscan rule: pen < tier ⇒ cosmetic (decal/chip, no hp). Else damage; killed at hp ≤ 0.
// Mutates part.dhp / part.dead when pen ≥ tier.
export function resolveHit(part, weapon) {
  if (part.dead) return { effect: 'cosmetic' };
  const m = MATERIALS[part.dmat];
  if (weapon.pen < m.tier) return { effect: 'cosmetic' };
  part.dhp -= weapon.dmg;
  if (part.dhp <= 0) part.dead = true;
  return { effect: 'damage', dmg: weapon.dmg, killed: part.dead };
}

// HE blast (spec §5): kills parts with tier ≤ blast.tier within r1 of the closest AABB point;
// additionally shatters ALL glass within the wider r2. Mutates parts. Returns id lists.
export function resolveBlast(parts, pos, blast) {
  const killed = [], glass = [];
  for (const part of parts) {
    if (part.dead) continue;
    const d = distToAABB(pos, part.min, part.max);
    const m = MATERIALS[part.dmat];
    if (d <= blast.r1 && m.tier <= blast.tier) {
      part.dhp = 0; part.dead = true; killed.push(part.dpart);
    } else if (d <= blast.r2 && part.dmat === 'glass') {
      part.dhp = 0; part.dead = true; glass.push(part.dpart);
    }
  }
  return { killed, glass };
}

// REFINED APFSDS long-rod (spec §5 + owner refinement). NO explosion. Along the ray:
//   • FRAGILE parts (material tier ≤ 2 — glass/wood/sheetmetal/trunk/grass/props) are
//     OBLITERATED (dead:true) and returned for debris. They do NOT consume a wall slot
//     and do NOT stop the rod.
//   • STRUCTURAL parts (tier ≥ 3 — brick/concrete/steel) get a THROUGH-HOLE only: the part
//     STAYS (dead:false), damage decays by `falloff` per wall, and a SPALL CONE opens behind
//     each penetrated wall. Each cone carries `targets` = fragile parts whose centre lies in
//     the cone, so the caller can apply real spall damage (kill props / hurt enemies+players).
//   The rod stops after `through.maxWalls` STRUCTURAL penetrations.
// Returns { hits:[{id,tIn,entry,exit,dmg,killed,kind}], cones:[{apex,dir,range,halfAngle,targets}] }.
export function resolvePenetration(parts, origin, dir, weapon) {
  const candidates = [];
  for (const part of parts) {
    if (part.dead) continue;
    const span = rayAABBSpan(origin, dir, part.min, part.max);
    if (span) candidates.push({ part, tIn: span.tIn, tOut: span.tOut });
  }
  candidates.sort((a, b) => a.tIn - b.tIn);

  const maxWalls = (weapon.through && weapon.through.maxWalls) ?? 4;
  const falloff  = (weapon.through && weapon.through.falloff)  ?? 0.6;
  const spallRange = (weapon.spall && weapon.spall.range) ?? 6;
  const spallHalf  = (weapon.spall && weapon.spall.halfAngle) ?? 0.5;

  const hits = [], cones = [];
  let dmg = weapon.dmg, walls = 0;
  for (const { part, tIn, tOut } of candidates) {
    const entry = [origin[0] + dir[0] * tIn, origin[1] + dir[1] * tIn, origin[2] + dir[2] * tIn];
    const exit  = [origin[0] + dir[0] * tOut, origin[1] + dir[1] * tOut, origin[2] + dir[2] * tOut];
    const tier = MATERIALS[part.dmat].tier;
    if (tier <= 2) {                                   // FRAGILE — obliterated, free pass
      part.dhp = 0; part.dead = true;
      hits.push({ id: part.dpart, tIn, entry, exit, dmg, killed: true, kind: 'obliterate' });
      continue;
    }
    if (walls >= maxWalls) break;                      // rod spent on structural walls
    part.dhp = Math.max(0, part.dhp - dmg);            // takes damage but STAYS (hole, not breach)
    hits.push({ id: part.dpart, tIn, entry, exit, dmg, killed: false, kind: 'hole' });
    const cone = { apex: exit, dir: [...dir], range: spallRange, halfAngle: spallHalf, targets: [] };
    // Spall targets: fragile, still-alive parts whose centre falls in the cone (beyond this
    // wall) — scanned over ALL parts, not just ray-candidates, since spall fans off-axis.
    for (const c of parts) {
      if (c === part || c.dead || MATERIALS[c.dmat].tier > 2) continue;
      if (coneContains(cone, aabbCenter(c.min, c.max))) cone.targets.push(c.dpart);
    }
    cones.push(cone);
    dmg *= falloff; walls++;
  }
  return { hits, cones };
}

// Is point p inside the spall cone?
export function coneContains(cone, p) {
  const v = [p[0] - cone.apex[0], p[1] - cone.apex[1], p[2] - cone.apex[2]];
  const along = v[0] * cone.dir[0] + v[1] * cone.dir[1] + v[2] * cone.dir[2];
  if (along <= 0 || along > cone.range) return false;
  const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  return Math.acos(Math.min(1, along / len)) <= cone.halfAngle;
}

// ───────────────────────────────────────────────────────────────────────────
// 3. FallingBody mini-physics (deterministic, fixed 120 Hz substep). From fallphys.js.
//    Math.sin/cos are not bit-specified by ECMAScript; MP replay determinism assumes the
//    same JS engine family (V8) on all peers. Settle thresholds are coarse enough that
//    ULP-level trig differences are very unlikely to change outcomes.
// ───────────────────────────────────────────────────────────────────────────

const SUBSTEP = 1 / 120;
const G = 9.81;            // 1 unit = 1 m
const DAMP = 0.35;         // angular drag (air + green-wood fibres at the hinge)
const SETTLE_AV = 1.2;     // contact below this angular speed ⇒ settle
const BOUNCE = -0.25;      // angular restitution on hard contact
const MAX_BOUNCES = 3;

// Tiny seeded RNG (mulberry32 copy of util.js makeRNG — kept dependency-free for node tests).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hinged trunk above a break point. pivot=[x,y,z]; dirXZ=[x,z] horizontal fall dir (normalized);
// length/radius in metres; obstacles = [{min,max}, ...] static AABBs to rest against.
export function makeHinge({ pivot, dirXZ, length, radius, seed = 1, obstacles = [] }) {
  const rng = mulberry32(seed);
  return {
    kind: 'hinge', pivot, dirXZ, length, radius, obstacles,
    angle: 0.03 + rng() * 0.04,   // seeded initial lean — the only randomness
    angVel: 0, bounces: 0, settled: false, acc: 0, rng,
  };
}

// Ballistic tumbling chunk (HE hero debris). pos/vel = [x,y,z].
export function makeTumble({ pos, vel, seed = 1, radius = 0.15 }) {
  const rng = mulberry32(seed);
  const ax = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1];
  const n = Math.hypot(...ax) || 1;
  return {
    kind: 'tumble', pos: [...pos], vel: [...vel],
    rotAxis: ax.map(v => v / n), rotAngle: 0, rotSpeed: 2 + rng() * 6,
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

// ───────────────────────────────────────────────────────────────────────────
// 4. Runtime apply* pipeline (NOT yet wired into gameplay).
//    DestructRuntime holds a parts collection + an `emit` event sink + an optional debris
//    pool, and exposes the four pipeline entry points with the exact signatures the gameplay
//    integration phase will call. Each queries the parts collection and calls the resolve*
//    rules above. Effects/MP-sync are surfaced as events via `emit({type, ...})` so the
//    wiring phase decides how to render + broadcast (host-auth, event+seed) them.
// ───────────────────────────────────────────────────────────────────────────

// Normalize a gameplay weaponDef onto the { pen, dmg, blast, through, spall } shape the
// resolve* rules expect. Accepts either a CALIBERS-style def or a raw game weapon def.
function normWeapon(def) {
  if (!def) return { pen: 0, dmg: 0 };
  return {
    pen: def.pen ?? 0,
    dmg: def.structDmg ?? def.dmg ?? 0,
    blast: def.blast,
    through: def.through,
    spall: def.spall,
  };
}

export class DestructRuntime {
  // parts: iterable of part-metadata objects; emit: (event)=>void; debris: optional DebrisPool.
  constructor({ parts = [], emit = () => {}, debris = null } = {}) {
    this.parts = Array.from(parts);
    this.emit = emit;
    this.debris = debris;
  }
  addPart(part) { this.parts.push(part); return part; }
  removePart(part) { const i = this.parts.indexOf(part); if (i >= 0) this.parts.splice(i, 1); }
  _byId(id) { return this.parts.find(p => p.dpart === id); }

  // Hitscan bullet/pellet at a surface point. Resolves the part containing `point`.
  applyHit(point, normal, dir, weaponDef) {
    const w = normWeapon(weaponDef);
    // Pick the nearest still-alive destructible whose AABB contains the impact point.
    let part = null;
    for (const p of this.parts) {
      if (p.dead) continue;
      if (pointInAABB(point, p.min, p.max, 0.05)) { part = p; break; }
    }
    if (!part) return { effect: 'miss' };
    const r = resolveHit(part, w);
    if (r.effect === 'damage') {
      this.emit({ type: 'hit', dpart: part.dpart, dmat: part.dmat, point, killed: r.killed });
      if (r.killed) this._kill(part, point);
    } else {
      this.emit({ type: 'chip', dmat: part?.dmat, point, normal });   // cosmetic decal
    }
    return r;
  }

  // HE blast (bazooka / shell). `ammoDef.blast` preferred; else derived from `radius`.
  applyBlast(pos, radius, ammoDef) {
    const blast = (ammoDef && ammoDef.blast) ||
      { r1: radius * 0.45, r2: radius, tier: (ammoDef && ammoDef.blastTier) ?? 3 };
    const res = resolveBlast(this.parts, pos, blast);
    for (const id of res.killed) this._kill(this._byId(id), pos);
    for (const id of res.glass)  this._kill(this._byId(id), pos);
    this.emit({ type: 'blast', pos, ...res });
    return res;
  }

  // APFSDS long rod. Obliterates fragile parts on the ray, holes structural walls, spalls.
  applyPenetration(origin, dir, weaponDef) {
    const w = normWeapon(weaponDef);
    const res = resolvePenetration(this.parts, origin, dir, w);
    for (const h of res.hits) if (h.killed) this._kill(this._byId(h.id), h.entry);
    // Apply spall: fragile parts caught in a cone are destroyed (caller also hurts enemies).
    for (const cone of res.cones) {
      for (const id of cone.targets) {
        const p = this._byId(id);
        if (p && !p.dead) { p.dhp = 0; p.dead = true; this._kill(p, cone.apex); }
      }
    }
    this.emit({ type: 'penetration', origin, dir, ...res });
    return res;
  }

  // Vehicle crush (T-62 driving over crush-class vegetation). STUB — wired when the tank lands.
  // Intended: query parts overlapping `aabb`, fell/snap crush-class ≤ vehicleDef.crushPower
  // over `dt` of contact, emit a 'crush' event + spawn a FallingBody for class-2/3 trunks.
  applyCrush(aabb, vehicleDef, dt) {
    return [];   // intentionally inert until tank mobility phase
  }

  _kill(part, at) {
    if (!part) return;
    const recipe = MATERIALS[part.dmat]?.debris;
    if (this.debris && recipe && at) this.debris.burst(recipe, at, (this._seed = (this._seed | 0) + 1));
    this.emit({ type: 'destroy', dpart: part.dpart, dmat: part.dmat, debris: recipe, at });
  }
}
