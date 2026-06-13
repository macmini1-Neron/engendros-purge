# Destructlab (Destruction Experiment Scene) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `tools/destructlab/` — the standalone experiment scene that proves the destruction-overhaul mini-physics, material×caliber matrix, per-pane glass, HE breach and APFSDS penetration, with measurable §7 performance gates — before anything touches `src/`.

**Architecture:** Three pure dependency-free logic modules (`geom.js`, `matrix.js`, `fallphys.js` — unit-tested in Node, designed to graduate into `src/destruct.js` in phase 2) + three browser-only modules (`scene.js`, `debris.js`, `main.js`) that glue them to Three.js. The lab page exposes a deterministic `DEMO.*` API (mirroring forest-demo's `DEMO.perf` pattern) so behaviors are verifiable programmatically, not just by clicking.

**Tech Stack:** Vanilla JS ES modules, vendored Three.js r160 via import map (`../../vendor/three.module.min.js`), `MeshBuilder`/`voxelMaterial` from `src/util.js` (browser only), `node --test` (Node ≥ 22, zero deps) for the pure modules. No build step; serve over HTTP.

**Spec:** `docs/superpowers/specs/2026-06-10-destruction-overhaul-design.md` (§2.2 matrix, §2.4 mini-physics, §2.5 debris, §7 budgets, §8 lab scope).

**Context for the worker (read first):**
- Work happens in the worktree `.claude/worktrees/destruction-design` on branch `feat/destructlab` (Task 0 creates it). NEVER commit to `main`.
- The nature tree generator (`src/props/generators/tree.js`) is NOT on main — it lives on `feat/nature-props`. The lab builds its own simple stand-in trees; only the *physics* is under test here. Real trees integrate in pillar 1.
- `tools/` is already in `.vercelignore` — the lab never ships to players. No cache-bust ritual needed for this branch.
- `src/util.js` imports `three`, so pure modules must NOT import it. Tiny helpers (mulberry32, rayAABB) are deliberately re-copied into the lab's pure modules — acceptable duplication for the lab; phase 2 reconciles.
- Serve from the worktree root on a FRESH port (this Mac has zombie servers — known footgun): `python3 -m http.server 8311 --directory "/Users/macmini1/game 4.8/.claude/worktrees/destruction-design"` → `http://localhost:8311/tools/destructlab/`.
- Run pure tests with: `node --test 'tests/destructlab/*.test.mjs'` (note the quoted glob), from the worktree root.

**File structure (all new):**

| File | Responsibility |
|---|---|
| `tools/destructlab/geom.js` | PURE: rayAABB, distToAABB, pointInAABB on plain arrays |
| `tools/destructlab/matrix.js` | PURE: MATERIALS, LAB_WEAPONS, makePart, resolveHit, resolveBlast, resolvePenetration, coneContains |
| `tools/destructlab/fallphys.js` | PURE: seeded FallingBody (hinge + tumble), fixed 120 Hz substep, obstacle contact + settle |
| `tools/destructlab/debris.js` | THREE: 256-instance debris pool (1 draw call), recipes per material |
| `tools/destructlab/scene.js` | THREE: lab world — brick wall w/ glass panes (lazy-split merged mesh + timed rebuild), wood fence, 3 stand-in trees, spall targets |
| `tools/destructlab/main.js` | THREE: renderer, orbit cam, crosshair shooting, weapon panel, DEMO API, perf overlay |
| `tools/destructlab/index.html` | page shell: import map, canvas, HUD |
| `tests/destructlab/geom.test.mjs` | unit tests |
| `tests/destructlab/matrix.test.mjs` | unit tests |
| `tests/destructlab/fallphys.test.mjs` | unit tests |

---

### Task 0: Branch + scaffold

**Files:** none (git + mkdir only)

- [ ] **Step 1: Create the feature branch from the docs branch (spec+plan ride along into the eventual PR)**

```bash
cd "/Users/macmini1/game 4.8/.claude/worktrees/destruction-design"
git checkout -b feat/destructlab
mkdir -p tools/destructlab tests/destructlab
git branch --show-current   # expect: feat/destructlab
```

---

### Task 1: Pure geometry helpers (`geom.js`)

**Files:**
- Create: `tools/destructlab/geom.js`
- Test: `tests/destructlab/geom.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/destructlab/geom.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { rayAABB, distToAABB, pointInAABB } from '../../tools/destructlab/geom.js';

test('rayAABB hits a box in front and returns entry distance', () => {
  const t = rayAABB([0, 1, -5], [0, 0, 1], [-1, 0, -1], [1, 2, 1]);
  assert.ok(Math.abs(t - 4) < 1e-9);
});

test('rayAABB misses a box off to the side', () => {
  assert.equal(rayAABB([5, 1, -5], [0, 0, 1], [-1, 0, -1], [1, 2, 1]), null);
});

test('rayAABB ignores boxes behind the origin', () => {
  assert.equal(rayAABB([0, 1, 5], [0, 0, 1], [-1, 0, -1], [1, 2, 1]), null);
});

test('rayAABB exit point: rayAABBExit returns far intersection', () => {
  const { tIn, tOut } = rayAABBSpan([0, 1, -5], [0, 0, 1], [-1, 0, -1], [1, 2, 1]);
  assert.ok(Math.abs(tIn - 4) < 1e-9 && Math.abs(tOut - 6) < 1e-9);
});

test('distToAABB is 0 inside, face distance outside', () => {
  assert.equal(distToAABB([0, 1, 0], [-1, 0, -1], [1, 2, 1]), 0);
  assert.ok(Math.abs(distToAABB([3, 1, 0], [-1, 0, -1], [1, 2, 1]) - 2) < 1e-9);
});

test('pointInAABB respects inflate', () => {
  assert.equal(pointInAABB([1.1, 1, 0], [-1, 0, -1], [1, 2, 1]), false);
  assert.equal(pointInAABB([1.1, 1, 0], [-1, 0, -1], [1, 2, 1], 0.2), true);
});

import { rayAABBSpan } from '../../tools/destructlab/geom.js';
```

(Move that last import to the top with the others when writing the file — shown here for diff clarity.)

- [ ] **Step 2: Run to verify failure**

Run: `node --test 'tests/destructlab/geom.test.mjs'`
Expected: FAIL — `Cannot find module .../tools/destructlab/geom.js`

- [ ] **Step 3: Implement `geom.js`**

```js
// geom.js — pure AABB/ray helpers on plain arrays. NO imports (node-testable).
// Phase-2 graduation target: merge with rayAABB in src/util.js.

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
```

- [ ] **Step 4: Run tests — expect all PASS**

Run: `node --test 'tests/destructlab/geom.test.mjs'` → 6 pass.

- [ ] **Step 5: Commit**

```bash
git add tools/destructlab/geom.js tests/destructlab/geom.test.mjs
git commit -m "feat(destructlab): pure AABB/ray geometry helpers"
```

---

### Task 2: Material matrix — hitscan rule (`matrix.js`)

**Files:**
- Create: `tools/destructlab/matrix.js`
- Test: `tests/destructlab/matrix.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/destructlab/matrix.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, LAB_WEAPONS, makePart, resolveHit } from '../../tools/destructlab/matrix.js';

test('pistol vs brick is cosmetic only (pen 0 < tier 3), hp untouched', () => {
  const p = makePart('w1', 'brick', [0, 0, 0], [1.5, 2.5, 0.3]);
  const r = resolveHit(p, LAB_WEAPONS.pistol);
  assert.equal(r.effect, 'cosmetic');
  assert.equal(p.hp, MATERIALS.brick.hp);
});

test('pistol kills a glass pane in one hit (tier 0, hp 1)', () => {
  const p = makePart('g1', 'glass', [0, 1, 0], [1, 2, 0.05]);
  const r = resolveHit(p, LAB_WEAPONS.pistol);
  assert.equal(r.effect, 'damage');
  assert.equal(r.killed, true);
});

test('rifle chews through a wood fence segment in 4 hits (60 hp / 15 dmg)', () => {
  const p = makePart('f1', 'wood', [0, 0, 0], [1.5, 1.2, 0.1]);
  let killed = false;
  for (let i = 0; i < 4; i++) killed = resolveHit(p, LAB_WEAPONS.rifle).killed;
  assert.equal(killed, true);
});

test('12.7 damages a trunk (pen 2 ≥ tier 2); rifle does not', () => {
  const p = makePart('t1', 'trunk', [0, 0, 0], [0.4, 7, 0.4]);
  assert.equal(resolveHit(p, LAB_WEAPONS.rifle).effect, 'cosmetic');
  assert.equal(resolveHit(p, LAB_WEAPONS.hmg127).effect, 'damage');
});

test('hpScale multiplies part hp (class-3 oak trunk = 3× trunk hp)', () => {
  const p = makePart('t3', 'trunk', [0, 0, 0], [1, 9, 1], 3);
  assert.equal(p.hp, MATERIALS.trunk.hp * 3);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test 'tests/destructlab/matrix.test.mjs'` → FAIL (module not found).

- [ ] **Step 3: Implement the registry + hitscan rule**

```js
// matrix.js — material × weapon damage rules v0 (spec §2.2, §5).
// PURE: no THREE, no DOM. Graduates into src/destruct.js in phase 2.
import { rayAABBSpan, distToAABB } from './geom.js';

export const MATERIALS = {
  glass:      { tier: 0, hp: 1,    debris: 'shards'  },
  wood:       { tier: 1, hp: 60,   debris: 'splints' },
  sheetmetal: { tier: 2, hp: 120,  debris: 'panels'  },
  trunk:      { tier: 2, hp: 250,  debris: 'splints' },
  brick:      { tier: 3, hp: 400,  debris: 'rubble'  },
  concrete:   { tier: 4, hp: 900,  debris: 'rubble'  },
  steel:      { tier: 5, hp: 2000, debris: 'sparks'  },
};

// Pen classes per spec §5 (shotgun pellet pen 1 — breaks fences; no shotgun in the lab panel v0).
export const LAB_WEAPONS = {
  pistol:   { key: 'pistol',   pen: 0, dmg: 8 },
  rifle:    { key: 'rifle',    pen: 1, dmg: 15 },
  hmg127:   { key: 'hmg127',   pen: 2, dmg: 40 },
  heRocket: { key: 'heRocket', pen: 4, dmg: 500, blast: { r1: 2.5, r2: 6, tier: 3 } },
  apfsds:   { key: 'apfsds',   pen: 5, dmg: 900, through: { maxWalls: 4, falloff: 0.6 },
              spall: { range: 6, halfAngle: 0.5 } },
};

// A destructible part. min/max = AABB corners as [x,y,z] arrays.
export function makePart(id, mat, min, max, hpScale = 1) {
  if (!MATERIALS[mat]) throw new Error(`unknown material: ${mat}`);
  return { id, mat, hp: MATERIALS[mat].hp * hpScale, min, max, dead: false };
}

// Hitscan rule: pen < tier ⇒ cosmetic (decal/chip, no hp). Otherwise damage; killed at hp ≤ 0.
export function resolveHit(part, weapon) {
  const m = MATERIALS[part.mat];
  if (weapon.pen < m.tier) return { effect: 'cosmetic' };
  part.hp -= weapon.dmg;
  if (part.hp <= 0) part.dead = true;
  return { effect: 'damage', dmg: weapon.dmg, killed: part.dead };
}
```

- [ ] **Step 4: Run tests — expect all PASS** (`node --test 'tests/destructlab/matrix.test.mjs'`)

- [ ] **Step 5: Commit**

```bash
git add tools/destructlab/matrix.js tests/destructlab/matrix.test.mjs
git commit -m "feat(destructlab): material registry + hitscan damage rule"
```

---

### Task 3: Material matrix — HE blast (`resolveBlast`)

**Files:**
- Modify: `tools/destructlab/matrix.js` (append)
- Test: `tests/destructlab/matrix.test.mjs` (append)

- [ ] **Step 1: Append failing tests**

```js
import { resolveBlast } from '../../tools/destructlab/matrix.js';

test('HE blast kills brick inside r1 but not concrete; far brick survives', () => {
  const near  = makePart('b1', 'brick',    [1, 0, 0],  [2.5, 2.5, 0.3]);   // ~1 m away
  const conc  = makePart('c1', 'concrete', [-2, 0, 0], [-0.5, 2.5, 0.3]);  // tier 4 > blast tier 3
  const far   = makePart('b2', 'brick',    [8, 0, 0],  [9.5, 2.5, 0.3]);   // ~8 m away
  const res = resolveBlast([near, conc, far], [0, 1.2, 0], LAB_WEAPONS.heRocket.blast);
  assert.deepEqual(res.killed, ['b1']);
  assert.equal(conc.dead, false);
  assert.equal(far.dead, false);
});

test('HE shatters glass in the wide r2 ring but not beyond', () => {
  const gNear = makePart('g1', 'glass', [4, 1, 0], [5, 2, 0.05]);   // ~4 m: outside r1, inside r2
  const gFar  = makePart('g2', 'glass', [9, 1, 0], [10, 2, 0.05]);  // ~9 m: outside r2
  const res = resolveBlast([gNear, gFar], [0, 1.2, 0], LAB_WEAPONS.heRocket.blast);
  assert.deepEqual(res.glass, ['g1']);
  assert.equal(gNear.dead, true);
  assert.equal(gFar.dead, false);
});

test('blast ignores already-dead parts', () => {
  const p = makePart('b9', 'brick', [1, 0, 0], [2, 2, 0.3]);
  p.dead = true;
  const res = resolveBlast([p], [0, 1, 0], LAB_WEAPONS.heRocket.blast);
  assert.deepEqual(res.killed, []);
});
```

- [ ] **Step 2: Run — new tests FAIL** (`resolveBlast` not exported).

- [ ] **Step 3: Implement (append to `matrix.js`)**

```js
// HE blast (spec §5): kills parts with tier ≤ blast.tier within r1 of the closest AABB point;
// additionally shatters ALL glass within r2 (> r1). Mutates parts. Returns id lists.
export function resolveBlast(parts, pos, blast) {
  const killed = [], glass = [];
  for (const part of parts) {
    if (part.dead) continue;
    const d = distToAABB(pos, part.min, part.max);
    const m = MATERIALS[part.mat];
    if (d <= blast.r1 && m.tier <= blast.tier) {
      part.hp = 0; part.dead = true; killed.push(part.id);
    } else if (d <= blast.r2 && part.mat === 'glass') {
      part.hp = 0; part.dead = true; glass.push(part.id);
    }
  }
  return { killed, glass };
}
```

- [ ] **Step 4: Run tests — expect all PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat(destructlab): HE blast rule (segment removal + wide glass ring)"` (after `git add` of both files).

---

### Task 4: Material matrix — APFSDS penetration + spall cone

**Files:**
- Modify: `tools/destructlab/matrix.js` (append)
- Test: `tests/destructlab/matrix.test.mjs` (append)

- [ ] **Step 1: Append failing tests**

```js
import { resolvePenetration, coneContains } from '../../tools/destructlab/matrix.js';

test('APFSDS passes through two walls, damage decays, spall cone behind each', () => {
  // Two parallel brick walls along +Z, 4 m apart, shot from z=-5 along +Z.
  const w1 = makePart('w1', 'brick', [-1, 0, 0], [1, 2.5, 0.3]);
  const w2 = makePart('w2', 'brick', [-1, 0, 4], [1, 2.5, 4.3]);
  const res = resolvePenetration([w1, w2], [0, 1.2, -5], [0, 0, 1], LAB_WEAPONS.apfsds);
  assert.equal(res.hits.length, 2);
  assert.equal(res.hits[0].id, 'w1');                       // sorted near→far
  assert.ok(Math.abs(res.hits[0].dmg - 900) < 1e-9);
  assert.ok(Math.abs(res.hits[1].dmg - 900 * 0.6) < 1e-9);  // falloff per wall
  assert.equal(res.cones.length, 2);
  assert.ok(res.cones[0].apex[2] > 0.3 - 1e-9);             // apex at exit point
  // brick hp 400 < 900 ⇒ both walls take a killed (hole) — but APFSDS marks holes, not removal:
  assert.equal(res.hits[0].pierced, true);
  assert.equal(w1.dead, false);                              // wall segment STAYS (small hole, no removal)
});

test('APFSDS stops after maxWalls penetrations', () => {
  const walls = [0, 2, 4, 6, 8].map((z, i) =>
    makePart('w' + i, 'concrete', [-1, 0, z], [1, 2.5, z + 0.3]));
  const res = resolvePenetration(walls, [0, 1, -5], [0, 0, 1], LAB_WEAPONS.apfsds);
  assert.equal(res.hits.length, LAB_WEAPONS.apfsds.through.maxWalls);
});

test('glass does not consume a wall slot and dies outright', () => {
  const g = makePart('g1', 'glass', [-1, 0, 0], [1, 2, 0.05]);
  const w = makePart('w1', 'brick', [-1, 0, 2], [1, 2.5, 2.3]);
  const res = resolvePenetration([g, w], [0, 1, -5], [0, 0, 1], LAB_WEAPONS.apfsds);
  assert.equal(g.dead, true);
  const wallHit = res.hits.find(h => h.id === 'w1');
  assert.ok(Math.abs(wallHit.dmg - 900) < 1e-9);   // full energy — glass cost nothing
});

test('coneContains: inside, behind-apex, and off-axis points', () => {
  const cone = { apex: [0, 1, 0], dir: [0, 0, 1], range: 6, halfAngle: 0.5 };
  assert.equal(coneContains(cone, [0.5, 1, 3]), true);
  assert.equal(coneContains(cone, [0, 1, -1]), false);   // behind apex
  assert.equal(coneContains(cone, [5, 1, 3]), false);    // way off axis
  assert.equal(coneContains(cone, [0, 1, 7]), false);    // beyond range
});
```

- [ ] **Step 2: Run — new tests FAIL.**

- [ ] **Step 3: Implement (append to `matrix.js`)**

```js
// APFSDS long-rod (spec §5): no explosion. Ray continues through up to through.maxWalls
// solid parts with dmg *= falloff per wall; entry+exit points recorded (small hole decals);
// a spall cone opens behind every penetrated wall. Glass shatters for free (no wall slot).
// Walls are NOT removed — APFSDS makes holes, not breaches (HE does breaches).
export function resolvePenetration(parts, origin, dir, weapon) {
  const candidates = [];
  for (const part of parts) {
    if (part.dead) continue;
    const span = rayAABBSpan(origin, dir, part.min, part.max);
    if (span) candidates.push({ part, tIn: span.tIn, tOut: span.tOut });
  }
  candidates.sort((a, b) => a.tIn - b.tIn);

  const hits = [], cones = [];
  let dmg = weapon.dmg, walls = 0;
  for (const { part, tIn, tOut } of candidates) {
    if (walls >= weapon.through.maxWalls) break;
    const entry = [origin[0] + dir[0] * tIn, origin[1] + dir[1] * tIn, origin[2] + dir[2] * tIn];
    const exit  = [origin[0] + dir[0] * tOut, origin[1] + dir[1] * tOut, origin[2] + dir[2] * tOut];
    if (part.mat === 'glass') {                      // free pass
      part.hp = 0; part.dead = true;
      hits.push({ id: part.id, tIn, entry, exit, dmg: 0, pierced: true, killed: true });
      continue;
    }
    part.hp -= dmg;                                  // structural damage bookkeeping…
    const pierced = dmg >= MATERIALS[part.mat].hp * 0.5;   // …but rod pierces if it carries enough energy
    hits.push({ id: part.id, tIn, entry, exit, dmg, pierced, killed: false });
    if (!pierced) break;                             // rod absorbed — stops here
    cones.push({ apex: exit, dir: [...dir], range: weapon.spall.range, halfAngle: weapon.spall.halfAngle });
    dmg *= weapon.through.falloff;
    walls++;
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
```

- [ ] **Step 4: Run ALL matrix tests — expect PASS** (`node --test 'tests/destructlab/matrix.test.mjs'`).

- [ ] **Step 5: Commit** — `git commit -m "feat(destructlab): APFSDS through-penetration + spall cones"`.

---

### Task 5: Mini-physics — hinge fall (`fallphys.js`)

**Files:**
- Create: `tools/destructlab/fallphys.js`
- Test: `tests/destructlab/fallphys.test.mjs`

Physics model (spec §2.4): broken trunk = uniform rod hinged at the break point (it stays on the stump — matches real storm-snapped trees). Compound pendulum: `θ̈ = (3g / 2L)·sin θ − c·θ̇`, θ from vertical, internally substepped at a fixed 120 Hz so results are deterministic and dt-independent. Contact = sampled points along the rod against ground (y=0) and obstacle AABBs; low angular speed at contact ⇒ settle, else damped bounce (max 3, then forced settle).

- [ ] **Step 1: Write the failing tests**

```js
// tests/destructlab/fallphys.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHinge, makeTumble, stepBody, hingePoint } from '../../tools/destructlab/fallphys.js';

const groundHinge = (seed = 7, obstacles = []) =>
  makeHinge({ pivot: [0, 2, 0], dirXZ: [0, 1], length: 5, radius: 0.2, seed, obstacles });

test('hinge: same seed ⇒ bit-identical trajectory (determinism for MP replay)', () => {
  const a = groundHinge(42), b = groundHinge(42);
  for (let i = 0; i < 200; i++) { stepBody(a, 1 / 60); stepBody(b, 1 / 60); }
  assert.equal(a.angle, b.angle);
  assert.equal(a.settled, b.settled);
});

test('hinge: variable-dt slicing converges with uniform dt (substep accumulator)', () => {
  const a = groundHinge(1), b = groundHinge(1);
  for (let i = 0; i < 150; i++) stepBody(a, 0.016);            // 2.4 s in 16 ms frames
  for (let i = 0; i < 48; i++)  stepBody(b, 0.05);             // 2.4 s in clamped 50 ms frames
  assert.ok(Math.abs(a.angle - b.angle) < 1e-6);
});

test('hinge: falls past horizontal and settles with tip on the ground within 8 s', () => {
  const h = groundHinge(3);
  for (let i = 0; i < 480 && !h.settled; i++) stepBody(h, 1 / 60);
  assert.equal(h.settled, true);
  assert.ok(h.angle > Math.PI / 2, 'rests past horizontal (tip down to ground)');
  const tip = hingePoint(h, 1.0);
  assert.ok(tip[1] <= 0.25, `tip near ground, got y=${tip[1]}`);
});

test('hinge: rests against an obstacle instead of clipping through', () => {
  // Wall 2 m from the pivot in the fall direction, 3 m tall — trunk must lean on it.
  const wall = { min: [-2, 0, 1.9], max: [2, 3, 2.2] };
  const h = groundHinge(5, [wall]);
  for (let i = 0; i < 600 && !h.settled; i++) stepBody(h, 1 / 60);
  assert.equal(h.settled, true);
  assert.ok(h.angle < Math.PI / 2, `leans on wall well before horizontal, got ${h.angle}`);
  assert.ok(h.angle > 0.2, 'actually fell some way first');
});

test('hingePoint maps rod fraction to world space', () => {
  const h = groundHinge(1);
  const base = hingePoint(h, 0);
  assert.deepEqual(base, [0, 2, 0]);   // fraction 0 = pivot
});

test('tumble: ballistic chunk lands and settles on the ground', () => {
  const t = makeTumble({ pos: [0, 3, 0], vel: [2, 1, 0], seed: 9 });
  for (let i = 0; i < 600 && !t.settled; i++) stepBody(t, 1 / 60);
  assert.equal(t.settled, true);
  assert.ok(t.pos[1] <= 0.3);
});
```

- [ ] **Step 2: Run to verify failure** — module not found.

- [ ] **Step 3: Implement `fallphys.js`**

```js
// fallphys.js — bespoke mini-physics for falling pieces (spec §2.4). PURE, deterministic.
// Internally substepped at a fixed 120 Hz regardless of caller dt (game loop stays variable-dt).
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

// Ballistic tumbling chunk (HE hero debris). pos/vel = [x,y,z].
export function makeTumble({ pos, vel, seed = 1 }) {
  const rng = mulberry32(seed);
  const ax = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1];
  const n = Math.hypot(...ax) || 1;
  return {
    kind: 'tumble', pos: [...pos], vel: [...vel],
    rotAxis: ax.map(v => v / n), rotAngle: 0, rotSpeed: 2 + rng() * 6,
    bounces: 0, settled: false, acc: 0,
  };
}

// World point at fraction f (0=pivot/butt, 1=tip) along the hinged rod at its current angle.
export function hingePoint(b, f) {
  const s = b.length * f, sin = Math.sin(b.angle), cos = Math.cos(b.angle);
  return [b.pivot[0] + sin * s * b.dirXZ[0], b.pivot[1] + cos * s, b.pivot[2] + sin * s * b.dirXZ[1]];
}

// Advance by caller dt (any size; clamps at 50 ms like the game loop). Fixed-substep inside.
export function stepBody(b, dt) {
  b.acc += Math.min(dt, 0.05);
  while (b.acc >= SUBSTEP && !b.settled) {
    b.acc -= SUBSTEP;
    if (b.kind === 'hinge') subHinge(b); else subTumble(b);
  }
}

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
  if (b.pos[1] <= 0.15) {
    b.pos[1] = 0.15;
    if (Math.abs(b.vel[1]) < 1.0 || b.bounces >= MAX_BOUNCES) {
      b.settled = true; b.vel = [0, 0, 0]; b.rotSpeed = 0; return;
    }
    b.vel[1] *= -0.3; b.vel[0] *= 0.6; b.vel[2] *= 0.6; b.rotSpeed *= 0.5; b.bounces++;
  }
}
```

- [ ] **Step 4: Run tests** (`node --test 'tests/destructlab/fallphys.test.mjs'`) — expect 6 pass. If the obstacle-rest test fails because the trunk stops too early/late, tune ONLY the test's wall position — not the physics constants — unless settling never happens at all.

- [ ] **Step 5: Commit** — `git commit -m "feat(destructlab): FallingBody mini-physics (hinge+tumble, 120 Hz substep, seeded)"`.

---

### Task 6: Lab page skeleton (`index.html` + `main.js` rendering core)

**Files:**
- Create: `tools/destructlab/index.html`
- Create: `tools/destructlab/main.js`

- [ ] **Step 1: Write `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>DESTRUCTLAB — destruction experiment scene</title>
  <script type="importmap">
    { "imports": { "three": "../../vendor/three.module.min.js" } }
  </script>
  <style>
    html, body { margin: 0; height: 100%; background: #1a1d16; overflow: hidden;
                 font: 12px/1.4 ui-monospace, Menlo, monospace; color: #cfd2c4; }
    #canvas { width: 100%; height: 100%; display: block; cursor: crosshair; }
    #cross { position: fixed; left: 50%; top: 50%; width: 10px; height: 10px;
             margin: -5px 0 0 -5px; pointer-events: none;
             border: 1px solid #e8e6d8; border-radius: 50%; opacity: .8; }
    #hud { position: fixed; left: 10px; top: 10px; user-select: none; }
    #hud button { display: block; margin: 2px 0; padding: 4px 10px; min-width: 150px;
                  background: #2a2e24; color: #cfd2c4; border: 1px solid #4a4f3d;
                  font: inherit; text-align: left; cursor: pointer; }
    #hud button.sel { background: #5a2e22; border-color: #a0522d; color: #fff; }
    #perf { position: fixed; right: 10px; top: 10px; text-align: right; white-space: pre; }
    #log  { position: fixed; left: 10px; bottom: 10px; white-space: pre; opacity: .85; }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <div id="cross"></div>
  <div id="hud"></div>
  <div id="perf"></div>
  <div id="log"></div>
  <script type="module" src="./main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `main.js` — renderer, lights, ground, orbit camera, weapon panel, empty world hooks**

```js
// main.js — DESTRUCTLAB harness: renderer + camera + shooting + DEMO API.
// Browser-only glue around the pure modules (matrix/fallphys) — spec §8.
import * as THREE from 'three';
import { LAB_WEAPONS } from './matrix.js';

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb4c4);
scene.fog = new THREE.Fog(0x9fb4c4, 40, 120);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 300);

scene.add(new THREE.HemisphereLight(0xcfd8e8, 0x4a4538, 0.9));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
sun.position.set(20, 30, 10);
scene.add(sun);

// ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshLambertMaterial({ color: 0x6b714f }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
scene.add(new THREE.GridHelper(80, 40, 0x555a44, 0x555a44));

// --- orbit camera (mirrors tools/modelgen/viewer.js pointer pattern) ---
const cam = { yaw: 0.6, pitch: 0.35, dist: 22, target: new THREE.Vector3(0, 1.5, 0) };
function applyCam() {
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  camera.position.set(
    cam.target.x + Math.sin(cam.yaw) * cp * cam.dist,
    cam.target.y + sp * cam.dist,
    cam.target.z + Math.cos(cam.yaw) * cp * cam.dist);
  camera.lookAt(cam.target);
}
let drag = null;
canvas.addEventListener('pointerdown', (e) => { if (e.button === 2) drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.yaw -= (e.clientX - drag.x) * 0.005;
  cam.pitch = Math.max(0.05, Math.min(1.4, cam.pitch + (e.clientY - drag.y) * 0.005));
  drag = { x: e.clientX, y: e.clientY };
  applyCam();
});
canvas.addEventListener('wheel', (e) => {
  cam.dist = Math.max(4, Math.min(60, cam.dist + e.deltaY * 0.02));
  applyCam(); e.preventDefault();
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// --- weapon panel ---
const hud = document.getElementById('hud');
let weapon = LAB_WEAPONS.rifle;
const buttons = {};
Object.values(LAB_WEAPONS).forEach((w, i) => {
  const b = document.createElement('button');
  b.textContent = `[${i + 1}] ${w.key}  pen ${w.pen} · dmg ${w.dmg}`;
  b.onclick = () => selectWeapon(w.key);
  hud.appendChild(b);
  buttons[w.key] = b;
});
function selectWeapon(key) {
  weapon = LAB_WEAPONS[key];
  Object.values(buttons).forEach(b => b.classList.remove('sel'));
  buttons[key].classList.add('sel');
}
selectWeapon('rifle');
addEventListener('keydown', (e) => {
  const keys = Object.keys(LAB_WEAPONS);
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= keys.length) selectWeapon(keys[n - 1]);
});

const logEl = document.getElementById('log');
const logLines = [];
export function log(msg) {
  logLines.push(msg);
  if (logLines.length > 8) logLines.shift();
  logEl.textContent = logLines.join('\n');
  console.log('[lab]', msg);
}

// --- fire on left click: ray from camera through screen centre (crosshair) ---
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  fire(weapon, camera.position.toArray(), dir.toArray());
});

// fire() lands in Task 7 (scene wiring) — stub for now:
let fire = (w, origin, dir) => log(`fire ${w.key} (no world yet)`);
export function setFire(fn) { fire = fn; }

// --- frame loop + perf ring ---
const perfEl = document.getElementById('perf');
const frameTimes = [];
let last = performance.now(), perfTimer = 0;
export const perfStats = { lastRebuildMs: 0, falling: 0, debris: 0 };
const updaters = [];
export function onFrame(fn) { updaters.push(fn); }

function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  frameTimes.push(dt);
  if (frameTimes.length > 120) frameTimes.shift();
  for (const fn of updaters) fn(dt);
  renderer.render(scene, camera);
  perfTimer += dt;
  if (perfTimer > 0.5) { perfTimer = 0; perfEl.textContent = perfText(); }
}

function perfText() {
  const avg = frameTimes.reduce((a, b) => a + b, 0) / Math.max(frameTimes.length, 1);
  const worst = Math.max(...frameTimes);
  return `fps avg ${(1 / avg).toFixed(0)}  min ${(1 / worst).toFixed(0)}\n` +
         `draw calls ${renderer.info.render.calls}\n` +
         `falling ${perfStats.falling}  debris ${perfStats.debris}\n` +
         `last rebuild ${perfStats.lastRebuildMs.toFixed(2)} ms`;
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize(); applyCam(); requestAnimationFrame(frame);

// --- DEMO API (programmatic verification, like forest-demo) ---
window.DEMO = {
  perf() {
    const avg = frameTimes.reduce((a, b) => a + b, 0) / Math.max(frameTimes.length, 1);
    return { fpsAvg: +(1 / avg).toFixed(1), fpsMin: +(1 / Math.max(...frameTimes)).toFixed(1),
             calls: renderer.info.render.calls, falling: perfStats.falling,
             debris: perfStats.debris, lastRebuildMs: +perfStats.lastRebuildMs.toFixed(2) };
  },
  // shoot/blast/stress are attached in Tasks 7–10
};
export { scene, camera, renderer };
```

- [ ] **Step 3: Verify in the browser**

```bash
python3 -m http.server 8311 --directory "/Users/macmini1/game 4.8/.claude/worktrees/destruction-design" &
```

Open `http://localhost:8311/tools/destructlab/` (Playwright or manually). Expected: sky-grey scene, green ground with grid, weapon buttons left (rifle selected red), perf readout right showing ~60 fps and small draw-call count, crosshair centre. Right-drag orbits, wheel zooms, left click logs `fire rifle (no world yet)`. Zero console errors.

- [ ] **Step 4: Commit** — `git commit -m "feat(destructlab): lab page skeleton (renderer, orbit cam, weapon panel, perf ring, DEMO.perf)"`.

---

### Task 7: Lab world — wall with glass panes + fence, lazy-split rebuild, hit/blast wiring

**Files:**
- Create: `tools/destructlab/scene.js`
- Modify: `tools/destructlab/main.js` (wire `fire`, DEMO.shoot/DEMO.blast)

- [ ] **Step 1: Write `scene.js`**

```js
// scene.js — the lab world: brick wall (6×2 segments, 4 glass panes), wood fence,
// lazy-split merged rendering (spec §4: intact = 1 merged mesh; rebuild-minus-dead on damage).
import * as THREE from 'three';
import { MeshBuilder, voxelMaterial } from '../../src/util.js';
import { makePart, MATERIALS } from './matrix.js';

const BRICK = 0x8a4a32, BRICK_HI = 0xa05a3c, GLASS = 0xbcd8e0, WOOD = 0x8a703f;
const SEG_W = 1.5, SEG_H = 1.25, WALL_T = 0.3;

export function buildLab(scene) {
  const parts = new Map();          // id → part (matrix part + {kind, recipe})
  const add = (part, extra) => { parts.set(part.id, Object.assign(part, extra)); return part; };

  // --- brick wall: 6 cols × 2 rows at z = 0, centred on x. Upper row cols 1-4 hold glass panes.
  const wallGroup = new THREE.Group();
  scene.add(wallGroup);
  for (let col = 0; col < 6; col++) {
    for (let row = 0; row < 2; row++) {
      const x = (col - 2.5) * SEG_W, y = row * SEG_H;
      const id = `wall_${row ? 'up' : 'lo'}_${col}`;
      const hasPane = row === 1 && col >= 1 && col <= 4;
      add(makePart(id, 'brick',
        [x - SEG_W / 2, y, -WALL_T / 2], [x + SEG_W / 2, y + SEG_H, WALL_T / 2]),
        { kind: 'wall', hasPane, col, row });
      if (hasPane) {
        add(makePart(`glass_${col}`, 'glass',
          [x - 0.5, y + 0.2, -0.03], [x + 0.5, y + 1.0, 0.03]),
          { kind: 'pane', col });
      }
    }
  }

  // --- wood fence: 4 segments at z = 6
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * SEG_W;
    add(makePart(`fence_${i}`, 'wood',
      [x - SEG_W / 2, 0, 5.95], [x + SEG_W / 2, 1.2, 6.05]),
      { kind: 'fence' });
  }

  // --- spall targets: 3 thin ply boards 3 m behind the wall (z = -3)
  const targets = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.06),
      new THREE.MeshLambertMaterial({ color: 0xc8b88a }));
    mesh.position.set(x, 0.9, -3);
    scene.add(mesh);
    targets.push({ id: `ply_${i}`, mesh, centre: [x, 0.9, -3], hit: false });
  }

  // --- lazy-split merged rendering. ONE merged mesh for everything alive; rebuild on death.
  let merged = null;
  let lastRebuildMs = 0;
  function rebuild() {
    const t0 = performance.now();
    if (merged) { wallGroup.remove(merged); merged.geometry.dispose(); }
    const mb = new MeshBuilder();
    for (const p of parts.values()) {
      if (p.dead) continue;
      const w = p.max[0] - p.min[0], h = p.max[1] - p.min[1], d = p.max[2] - p.min[2];
      const cx = (p.min[0] + p.max[0]) / 2, cy = (p.min[1] + p.max[1]) / 2, cz = (p.min[2] + p.max[2]) / 2;
      const color = p.kind === 'pane' ? GLASS : p.kind === 'fence' ? WOOD :
                    (p.row === 1 ? BRICK_HI : BRICK);
      mb.box(w, h, d, cx, cy, cz, color);
      if (p.kind === 'wall') {                      // proud lintel strip = layered-shading accent
        mb.box(w, 0.08, d + 0.04, cx, p.max[1] - 0.04, cz, 0x6e3a26);
      }
    }
    // rubble stubs at the base of every dead wall segment (breach reads as a hole + debris)
    for (const p of parts.values()) {
      if (!p.dead || p.kind !== 'wall') continue;
      const cx = (p.min[0] + p.max[0]) / 2;
      mb.box(1.1, 0.25, 0.7, cx, 0.125, (p.min[2] + p.max[2]) / 2, 0x6e4334);
      mb.box(0.6, 0.18, 0.5, cx + 0.35, 0.34, (p.min[2] + p.max[2]) / 2 + 0.15, 0x5d3a2c);
    }
    merged = new THREE.Mesh(mb.build(), voxelMaterial());
    wallGroup.add(merged);
    lastRebuildMs = performance.now() - t0;
    return lastRebuildMs;
  }
  rebuild();

  return { parts, targets, rebuild, get lastRebuildMs() { return lastRebuildMs; } };
}
```

- [ ] **Step 2: Wire firing into `main.js`** — replace the `fire` stub block with real dispatch. Add imports at top: `import { resolveHit, resolveBlast, resolvePenetration, coneContains, MATERIALS } from './matrix.js';` and `import { buildLab } from './scene.js';` and `import { rayAABB } from './geom.js';`. Then after the camera setup add:

```js
const lab = buildLab(scene);

function alive() { return [...lab.parts.values()].filter(p => !p.dead); }

function nearestHit(origin, dir) {
  let best = null;
  for (const p of alive()) {
    const t = rayAABB(origin, dir, p.min, p.max);
    if (t !== null && (!best || t < best.t)) best = { part: p, t };
  }
  return best;
}

function impactPoint(origin, dir, t) {
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
}

function realFire(w, origin, dir) {
  if (w.blast) {                                            // HE rocket: detonate at first surface
    const hit = nearestHit(origin, dir);
    const at = hit ? impactPoint(origin, dir, hit.t) : impactPoint(origin, dir, 30);
    const res = resolveBlast([...lab.parts.values()], at, w.blast);
    const all = [...res.killed, ...res.glass];
    if (all.length) { perfStats.lastRebuildMs = lab.rebuild(); }
    log(`HE @ [${at.map(v => v.toFixed(1))}] killed: ${all.join(', ') || '—'}`);
    onKilledParts(all, at);                                  // debris hook (Task 8 fills this in)
    return;
  }
  if (w.through) {                                           // APFSDS
    const res = resolvePenetration([...lab.parts.values()], origin, dir, w);
    for (const t of lab.targets) {
      if (!t.hit && res.cones.some(c => coneContains(c, t.centre))) {
        t.hit = true; t.mesh.material.color.set(0xc04030);   // spalled ply turns red
      }
    }
    const glassKilled = res.hits.filter(h => h.killed).map(h => h.id);
    if (glassKilled.length) perfStats.lastRebuildMs = lab.rebuild();
    onPenetration(res);                                      // decal hook (Task 9)
    log(`APFSDS pierced ${res.hits.filter(h => h.pierced).length} part(s), ` +
        `${res.cones.length} spall cone(s)`);
    return;
  }
  const hit = nearestHit(origin, dir);                       // plain hitscan
  if (!hit) { log(`${w.key}: miss`); return; }
  const r = resolveHit(hit.part, w);
  const at = impactPoint(origin, dir, hit.t);
  if (r.effect === 'cosmetic') { onCosmetic(hit.part, at); log(`${w.key} → ${hit.part.id}: plink (cosmetic)`); }
  else if (r.killed) {
    perfStats.lastRebuildMs = lab.rebuild();
    onKilledParts([hit.part.id], at);
    log(`${w.key} → ${hit.part.id}: DESTROYED`);
  } else log(`${w.key} → ${hit.part.id}: ${hit.part.hp}/${MATERIALS[hit.part.mat].hp} hp`);
}
setFire(realFire);

// FX hooks — filled by debris/decal tasks; no-ops keep this task self-contained.
let onKilledParts = () => {}, onCosmetic = () => {}, onPenetration = () => {};
export function setFxHooks(h) { ({ onKilledParts = onKilledParts, onCosmetic = onCosmetic, onPenetration = onPenetration } = h); }
```

⚠️ That destructuring line is subtle — write it as three plain assignments instead:

```js
export function setFxHooks(h) {
  if (h.onKilledParts) onKilledParts = h.onKilledParts;
  if (h.onCosmetic) onCosmetic = h.onCosmetic;
  if (h.onPenetration) onPenetration = h.onPenetration;
}
```

And extend `window.DEMO` with programmatic, deterministic shots (replace the DEMO assignment's closing brace area):

```js
window.DEMO.shoot = (weaponKey, partId) => {
  const p = lab.parts.get(partId);
  if (!p) return `no part ${partId}`;
  const c = [(p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2];
  const o = camera.position.toArray();
  const d = [c[0] - o[0], c[1] - o[1], c[2] - o[2]];
  const n = Math.hypot(...d);
  realFire(LAB_WEAPONS[weaponKey], o, d.map(v => v / n));
  return { part: partId, hp: p.hp, dead: p.dead };
};
window.DEMO.parts = () => [...lab.parts.values()].map(p => ({ id: p.id, mat: p.mat, hp: p.hp, dead: p.dead }));
window.DEMO.rebuildMs = () => lab.lastRebuildMs;
```

- [ ] **Step 3: Verify in the browser (programmatic, via console or Playwright `browser_evaluate`)**

| Action | Expected |
|---|---|
| `DEMO.shoot('pistol','wall_lo_2')` | `{ …, hp: 400, dead: false }`, log "plink (cosmetic)" |
| `DEMO.shoot('pistol','glass_2')` | `dead: true`, pane vanishes from the wall |
| `DEMO.shoot('rifle','fence_1')` ×4 | 4th returns `dead: true`, fence segment gone |
| `DEMO.shoot('hmg127','wall_lo_2')` ×10 | hp counts down 400→0, segment gone + rubble stub appears |
| `DEMO.shoot('heRocket','wall_lo_3')` | neighbouring brick segments within 2.5 m die, ALL remaining glass panes within 6 m die, hole + rubble |
| `DEMO.shoot('apfsds','wall_lo_4')` | wall segment STAYS (`dead: false`), log shows pierced ≥ 1 + spall cones, a ply target turns red |
| `DEMO.rebuildMs()` | **≤ 4** (spec §7 gate) |
| `DEMO.perf()` | fpsAvg ≥ 59, draw calls < 15 |

Screenshot the breached wall for the record.

- [ ] **Step 4: Commit** — `git commit -m "feat(destructlab): lab world w/ lazy-split wall, fence, spall targets + full fire dispatch"`.

---

### Task 8: Debris pool (`debris.js`) + cosmetic decals

**Files:**
- Create: `tools/destructlab/debris.js`
- Modify: `tools/destructlab/main.js` (FX hooks)

- [ ] **Step 1: Write `debris.js`**

```js
// debris.js — 256-chunk InstancedMesh debris pool, ONE draw call (spec §2.5).
// Ring-recycled oldest-first. Visual only — settled chunks fade out; persistent rubble
// is the wall rebuild's job, not the pool's.
import * as THREE from 'three';

const POOL = 256;
const RECIPES = {
  shards:  { color: 0xd8eef4, size: [0.10, 0.10, 0.02], speed: 4, count: 10, life: 2.5 },
  splints: { color: 0xa8854a, size: [0.30, 0.06, 0.06], speed: 3, count: 8,  life: 3.5 },
  rubble:  { color: 0x7e4634, size: [0.18, 0.14, 0.14], speed: 3, count: 14, life: 5.0 },
  panels:  { color: 0x9aa0a8, size: [0.25, 0.25, 0.04], speed: 3, count: 6,  life: 3.0 },
  sparks:  { color: 0xffd24a, size: [0.06, 0.06, 0.06], speed: 7, count: 12, life: 0.8 },
};
const G = 14;   // matches effects.js particle gravity feel

export class DebrisPool {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial(), POOL);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.items = Array.from({ length: POOL }, () => ({ live: false }));
    this.head = 0;
    this.color = new THREE.Color();
    this.dummy = new THREE.Object3D();
    for (let i = 0; i < POOL; i++) this._stash(i);
  }
  _stash(i) {
    this.dummy.position.set(0, -99, 0); this.dummy.scale.setScalar(0.001);
    this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
  }
  burst(kind, at, seed = 1) {
    const r = RECIPES[kind]; if (!r) return;
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let n = 0; n < r.count; n++) {
      const i = this.head; this.head = (this.head + 1) % POOL;
      const it = this.items[i];
      it.live = true; it.life = r.life * (0.7 + rnd() * 0.6);
      it.pos = [at[0], at[1], at[2]];
      const a = rnd() * Math.PI * 2, up = 1 + rnd() * 2;
      it.vel = [Math.cos(a) * r.speed * rnd(), up + rnd() * r.speed * 0.5, Math.sin(a) * r.speed * rnd()];
      it.rot = [rnd() * 6, rnd() * 6, rnd() * 6]; it.spin = 3 + rnd() * 6;
      it.size = r.size; it.bounced = false;
      this.mesh.setColorAt(i, this.color.set(r.color));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    let live = 0;
    for (let i = 0; i < POOL; i++) {
      const it = this.items[i];
      if (!it.live) continue;
      it.life -= dt;
      if (it.life <= 0) { it.live = false; this._stash(i); continue; }
      live++;
      it.vel[1] -= G * dt;
      for (let k = 0; k < 3; k++) it.pos[k] += it.vel[k] * dt;
      if (it.pos[1] < it.size[1] / 2) {
        it.pos[1] = it.size[1] / 2;
        if (!it.bounced) { it.vel[1] *= -0.3; it.vel[0] *= 0.5; it.vel[2] *= 0.5; it.bounced = true; }
        else { it.vel = [0, 0, 0]; it.spin = 0; }
      }
      it.rot[1] += it.spin * dt;
      this.dummy.position.set(...it.pos);
      this.dummy.rotation.set(...it.rot);
      this.dummy.scale.set(...it.size);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return live;
  }
}
```

- [ ] **Step 2: Hook into `main.js`** — after `const lab = buildLab(scene);` add:

```js
import { DebrisPool } from './debris.js';   // (top of file with the other imports)
import { MATERIALS } from './matrix.js';    // already imported in Task 7 — keep one import line

const debris = new DebrisPool(scene);
let shotSeed = 1;

// decals: small dark quads at cosmetic/penetration impact points, capped at 64
const decals = [];
function addDecal(at, color = 0x2c2620, size = 0.12) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  m.position.set(at[0], at[1], at[2] - Math.sign(at[2] || 1) * 0.001 + 0.02);
  scene.add(m); decals.push(m);
  if (decals.length > 64) { const old = decals.shift(); scene.remove(old); old.geometry.dispose(); }
}

setFxHooks({
  onKilledParts(ids, at) {
    for (const id of ids) {
      const p = lab.parts.get(id);
      debris.burst(MATERIALS[p.mat].debris, at ?? p.min, shotSeed++);
    }
  },
  onCosmetic(part, at) { addDecal(at); debris.burst('sparks', at, shotSeed++); },
  onPenetration(res) {
    for (const h of res.hits) { addDecal(h.entry, 0x141210, 0.18); addDecal(h.exit, 0x141210, 0.26); }
    if (res.hits[0]) debris.burst('sparks', res.hits[0].entry, shotSeed++);
  },
});
onFrame((dt) => { perfStats.debris = debris.update(dt); });
```

- [ ] **Step 3: Verify in browser**

- `DEMO.shoot('heRocket','wall_up_2')` → rubble + shard burst, perf overlay `debris` count > 0 then decays, **draw calls increase by exactly 1** (the pool) vs Task 7.
- `DEMO.shoot('pistol','wall_lo_1')` → dark decal + small spark puff.
- `DEMO.perf()` → fpsAvg still ≥ 59 with debris flying.

- [ ] **Step 4: Commit** — `git commit -m "feat(destructlab): instanced debris pool + impact decals"`.

---

### Task 9: Trees — stand-ins, felling, hinge integration, settle colliders

**Files:**
- Modify: `tools/destructlab/scene.js` (add `buildTrees`, called from `buildLab`)
- Modify: `tools/destructlab/main.js` (FallingBody update loop + DEMO.fell)

- [ ] **Step 1: Add stand-in trees to `scene.js`** (inside `buildLab`, before `return`; and add `hingePoint` import note — trees expose data, physics stays in main.js). Crush classes per spec §3: class 1 sapling (rifle breaks), class 2 birch (12.7/HE), class 3 oak (HE only — enforced by hp scale, trunk tier 2 still gates rifles out).

```js
  // --- stand-in trees (real generators live on feat/nature-props; physics is what's under test)
  // Each: stump mesh (stays) + crown mesh (falls). Trunk part gates the felling.
  const trees = [];
  const treeDefs = [
    { id: 'tree1', cls: 1, x: -8, z: 4, trunkH: 2.6, trunkR: 0.09, hpScale: 0.2, crown: 0x6f8f3f }, // sapling
    { id: 'tree2', cls: 2, x: -8, z: -2, trunkH: 7, trunkR: 0.22, hpScale: 1, crown: 0x5f8f4f },    // birch
    { id: 'tree3', cls: 3, x: -8, z: -8, trunkH: 9, trunkR: 0.45, hpScale: 3, crown: 0x4f7f3f },    // oak
  ];
  for (const d of treeDefs) {
    const breakY = d.trunkH * 0.3;
    const mkTrunk = (y0, y1, color) => {
      const mb = new MeshBuilder();
      mb.box(d.trunkR * 2, y1 - y0, d.trunkR * 2, 0, (y0 + y1) / 2, 0, color);
      return mb;
    };
    const stumpMb = mkTrunk(0, breakY, 0x7a6248);
    const stump = new THREE.Mesh(stumpMb.build(), voxelMaterial());
    stump.position.set(d.x, 0, d.z);
    scene.add(stump);

    const upperMb = mkTrunk(0, d.trunkH - breakY, d.cls === 2 ? 0xd8d8cc : 0x7a6248); // birch = white
    const crownR = d.trunkR * 6 + d.cls;
    upperMb.box(crownR, crownR * 0.9, crownR, 0, d.trunkH - breakY, 0, d.crown);
    const upper = new THREE.Mesh(upperMb.build(), voxelMaterial());
    upper.position.set(d.x, breakY, d.z);   // local origin AT the hinge pivot
    scene.add(upper);

    const part = add(makePart(d.id, 'trunk',
      [d.x - d.trunkR, 0, d.z - d.trunkR], [d.x + d.trunkR, d.trunkH, d.z + d.trunkR], d.hpScale),
      { kind: 'tree', cls: d.cls });
    trees.push({ def: d, part, stump, upper, breakY, fallen: false, body: null, colliders: [] });
  }
```

Also: in `rebuild()`, skip tree parts (`if (p.kind === 'tree') continue;` next to the dead-check) — trees are their own meshes, not part of the merged wall. And return `trees` from `buildLab` (`return { parts, targets, trees, rebuild, … }`).

- [ ] **Step 2: Felling + per-frame physics in `main.js`**

```js
import { makeHinge, stepBody, hingePoint } from './fallphys.js';   // top of file

const fallingBodies = [];   // { tree, body }
const MAX_FALLING = 8;      // spec §7 hard cap
const fallQueue = [];

function fellTree(tree, dirXZ, seed) {
  if (tree.fallen) return;
  tree.fallen = true;
  const job = () => {
    const d = tree.def;
    const obstacles = [...lab.parts.values()]
      .filter(p => !p.dead && p.kind === 'wall')
      .map(p => ({ min: p.min, max: p.max }));
    const body = makeHinge({
      pivot: [d.x, tree.breakY, d.z], dirXZ, seed,
      length: d.trunkH - tree.breakY, radius: d.trunkR, obstacles,
    });
    tree.body = body;
    fallingBodies.push({ tree, body });
  };
  if (fallingBodies.length >= MAX_FALLING) fallQueue.push(job); else job();
}

onFrame((dt) => {
  for (let i = fallingBodies.length - 1; i >= 0; i--) {
    const { tree, body } = fallingBodies[i];
    stepBody(body, dt);
    // pose: rotate the upper mesh around the hinge pivot toward dirXZ
    const axis = new THREE.Vector3(body.dirXZ[1], 0, -body.dirXZ[0]); // perpendicular, horizontal
    tree.upper.setRotationFromAxisAngle(axis, body.angle);
    if (body.settled) {
      fallingBodies.splice(i, 1);
      // settled trunk → ≤ 4 static colliders along the rod (spec §7), visualized as wireframes
      for (const f of [0.2, 0.5, 0.8, 1.0]) {
        const p = hingePoint(body, f);
        const r = Math.max(body.radius, 0.18);
        const min = [p[0] - r * 2, Math.max(p[1] - r * 2, 0), p[2] - r * 2];
        const max = [p[0] + r * 2, p[1] + r * 2, p[2] + r * 2];
        tree.colliders.push({ min, max });
        const helper = new THREE.Box3Helper(
          new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)), 0xff8844);
        scene.add(helper);
      }
      log(`${tree.def.id} settled @ ${(body.angle * 180 / Math.PI).toFixed(0)}°`);
      if (fallQueue.length) fallQueue.shift()();
    }
  }
  perfStats.falling = fallingBodies.length;
});
```

Wire tree death into the existing kill path — in `realFire`'s killed branch and in the HE branch, after `onKilledParts`, add:

```js
function handleTreeKills(ids, from) {
  for (const id of ids) {
    const tree = lab.trees.find(t => t.part.id === id);
    if (!tree) continue;
    const dx = tree.def.x - from[0], dz = tree.def.z - from[2];
    const n = Math.hypot(dx, dz) || 1;
    fellTree(tree, [dx / n, dz / n], (shotSeed++ * 2654435761) >>> 0);   // falls AWAY from shooter
  }
}
```

…and call `handleTreeKills(all, at)` / `handleTreeKills([hit.part.id], origin)` in those two branches. (Tree parts are skipped by `rebuild()`, so a tree kill must NOT trigger a wall rebuild — guard with `if (hit.part.kind !== 'tree')` before the rebuild call.)

DEMO helpers:

```js
window.DEMO.fell = (treeId, dir = [0, -1]) => {
  const tree = lab.trees.find(t => t.def.id === treeId);
  if (!tree) return 'no such tree';
  fellTree(tree, dir, 1337);
  return 'falling';
};
window.DEMO.stress = () => {
  for (const t of lab.trees) fellTree(t, [0.7, 0.7], 99);
  DEMO.shoot('heRocket', 'wall_lo_2');
  DEMO.shoot('heRocket', 'wall_lo_4');
  setTimeout(() => console.log('STRESS RESULT', JSON.stringify(DEMO.perf())), 5000);
  return 'stress running — perf logged in 5 s';
};
```

Add a STRESS button to the HUD:

```js
const sb = document.createElement('button');
sb.textContent = '☢ STRESS (3 trees + 2 HE)';
sb.onclick = () => DEMO.stress();
hud.appendChild(sb);
```

- [ ] **Step 3: Verify in browser**

- `DEMO.shoot('rifle','tree1')` ×~4 → sapling (hp 50) falls; `DEMO.shoot('rifle','tree2')` → "plink" (tier gate — rifle can't hurt a grown trunk).
- `DEMO.shoot('hmg127','tree2')` ×7 → birch falls away from camera, sweeps past horizontal, tip settles on ground (~110°), 4 orange wireframe colliders appear along the trunk.
- `DEMO.fell('tree2', [0, 1])` on a fresh reload — aimed at the wall → trunk **rests against the wall** (settles well under 90°, log shows angle ≈ 40–70°). **This is the no-clipping acceptance check.**
- `DEMO.shoot('heRocket','tree3')` → oak falls (blast kills tier-2 trunk in r1).
- `DEMO.perf()` during a fall: `falling ≥ 1`, fps ≥ 59.

- [ ] **Step 4: Commit** — `git commit -m "feat(destructlab): stand-in trees, hinge felling, obstacle rest, settle colliders, STRESS"`.

---

### Task 10: Acceptance run — §7 gates, RESULTS.md

**Files:**
- Create: `tools/destructlab/RESULTS.md`

- [ ] **Step 1: Full test suite**

Run: `node --test 'tests/destructlab/*.test.mjs'` → ALL pass (≈ 20 tests).

- [ ] **Step 2: Acceptance scenario (Playwright or manual, fresh reload)**

1. `DEMO.stress()` — wait 5 s, copy the logged `STRESS RESULT`.
2. Gates (spec §7): `fpsAvg ≥ 60` (≥ 59 accepted — rAF jitter), `fpsMin ≥ 30` during the burst, `calls` < 20, `lastRebuildMs ≤ 4`, falling capped at 3 (only 3 trees), debris > 0.
3. Screenshot the end state (breached wall + 3 fallen trees + colliders) → save as `tools/destructlab/RESULTS-stress.png` (gitignored screenshots are fine at repo root, but commit this one deliberately as the record).

- [ ] **Step 3: Write `RESULTS.md`** — record the real numbers:

```markdown
# DESTRUCTLAB acceptance run — YYYY-MM-DD

Machine: <Mac mini model>; Chrome <version>; window <w×h>.

| Gate (spec §7) | Target | Measured |
|---|---|---|
| fps avg under STRESS | ≥ 60 | _ |
| fps min during burst | ≥ 30 | _ |
| draw calls | < 20 | _ |
| wall rebuild | ≤ 4 ms | _ |
| concurrent falling | ≤ 8 (cap) | _ |
| debris pool | 256, 1 call | _ |

Feel notes (owner review pending): tree fall reads true? HE breach legible? APFSDS distinct from HE?
```

- [ ] **Step 4: Commit** — `git add tools/destructlab/RESULTS.md tools/destructlab/RESULTS-stress.png && git commit -m "test(destructlab): acceptance run vs spec §7 gates"`.

- [ ] **Step 5: Owner review gate.** Stop here. Tomáš plays the lab (`http://localhost:8311/tools/destructlab/`) and judges feel: tree fall, breach legibility, APFSDS vs HE distinctness. Tuning requests (gravity feel, damp, debris counts) are constant tweaks at the top of `fallphys.js`/`debris.js` — apply, re-run tests, re-commit. Only after his sign-off does pillar-0 integration planning start.

---

## Self-review notes (done at plan-writing time)

- **Spec coverage:** §2.2 matrix → Tasks 2–4; §2.4 mini-physics → Task 5; §2.5 debris → Task 8; §4 lazy split + rebuild timing → Task 7; §5 ammo behaviors → Tasks 3, 4, 7; §3 crush classes → Task 9 (gunfire side only — vehicle crush is pillar 4, out of lab scope per spec §8); §7 gates + §8 lab → Tasks 6–10. MP sync (§6) is intentionally NOT in the lab — determinism (same-seed test, Task 5) is its lab-side proxy.
- **Known deviation from spec §8:** "1 tree of each crush class (from the nature generators)" — generators aren't on main; stand-ins used (noted in Context). Physics fidelity is unaffected.
- **Type consistency check:** parts everywhere are `{ id, mat, hp, min, max, dead }` from `makePart`; weapons from `LAB_WEAPONS`; bodies from `makeHinge`/`makeTumble` stepped via `stepBody`. `perfStats`, `onFrame`, `setFire`, `setFxHooks` are the only cross-module main.js exports.
- **Node ESM note:** `.js` files with `export` syntax load fine under `node --test` on Node ≥ 22 (module detection) — same pattern as the existing `tests/modelgen` suite.
