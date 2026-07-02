# ЗОНА 704 Skeleton (`?map=zona`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the walkable skeleton of the 2500×2500 m master map «ЗОНА 704» as `?map=zona` — plan-data registry → shaped terrain (stamps + road corridors + parcel pads) → draped network meshes + placeholder water/gates/ЛЭП/signs — per `docs/superpowers/specs/2026-07-02-zona704-skeleton-design.md`.

**Architecture:** Three new modules: `src/zona-plan.js` (pure data + lint), `src/zona-terrain.js` (pure height profile), `src/zona.js` (THREE scene builder). One engine hook: `makeTerrain` gains profile `'zona'` via static import of `zona-terrain.js` (named profile, NOT a callback — the sim-worker rebuilds terrain bit-identically from serialized `{profile, seed, …}` opts and a closure would not survive postMessage).

**Tech Stack:** Vanilla ES modules + vendored Three.js r160, no build step. Pure logic is node-tested (`node --test tests/zona/*.test.mjs`); THREE-bound wiring is verified in-browser against `window.GAME` (the PR #50 method: fresh-port no-store static server + Playwright/console).

## Global Constraints

- **No build step / no package.json** — browser-native ES modules; `zona-plan.js` and `zona-terrain.js` must import NOTHING (except each other) so they stay node-testable and worker-safe.
- **Purity:** `terrainHeightAt(x,z)` must stay a pure, total function of (plan data, seed) — no THREE, no `Date.now`, no unseeded RNG. Map-gen randomness uses the **seeded** `makeRNG` family (util.js), never `rr`/`ri`/`pick`.
- **Existing maps byte-identical:** arena/steppe/demo/forest must not change behavior. Every zona hook is gated on `mapId === 'zona'` / `profile === 'zona'`.
- **Coordinates:** x,z ∈ [−1250,+1250], +X=east, +Z=north, heights in metres above steppe plane ±0 (master plan v1.2 frame).
- **Roads/pads carry NO colliders; gates/poles/signs/bridge decks DO** (via `seatBox` idiom).
- **Cache-bust ritual before each PR** (bump `index.html` `?v=N` + `GAME_BUILD` in `src/game.js`).
- **Two PRs:** PR-A = Tasks 1–4 (terrain core, branch `feat/zona704-skeleton`), PR-B = Tasks 5–10 (network + cadastre + placeholders, stacked branch `feat/zona704-network`).
- Source of truth for every coordinate: master plan v1.2 (`docs/superpowers/specs/2026-07-02-world-map-master-plan.html`, branch `feat/world-map-master-design`). Authored values not in the plan (river course, ridge polyline, water levels) are marked `AUTHORED:` in code comments and flagged back to the plan's next version bump.

---

### Task 1: `src/zona-plan.js` — data registry + `lintPlan()`

**Files:**
- Create: `src/zona-plan.js`
- Test: `tests/zona/plan.test.mjs`

**Interfaces:**
- Produces: `export const EXTENT = 1250`; `export const PARCELS` (array of `{id, name, kind:'rect'|'disc', x, z, w?, d?, r?, h?, tier, gate?}`); `export const ROADS` (array of `{id, name, surface:'asphalt'|'panels'|'dirt'|'gravel'|'rail'|'path', width, maxSlope, pts:[[x,z],…]}`); `export const TERRAIN_FEATURES` (array of stamp descriptors, see Task 2); `export const GATES` (array of `{id, x, z, kind, name, roadId}`); `export const WATER` (`{river:{pts,width,depth}, swamp:{x,z,w,d,level}, reservoir:{x,z,w,d,level}}`); `export function lintPlan()` → `{errors:[], warnings:[]}`.
- Consumed by: `zona-terrain.js` (Task 2/4/5), `zona.js` (Tasks 6–8), tests.

- [ ] **Step 1: Write the failing test**

```js
// tests/zona/plan.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTENT, PARCELS, ROADS, GATES, WATER, lintPlan } from '../../src/zona-plan.js';

test('registry counts match master plan v1.2', () => {
  assert.equal(EXTENT, 1250);
  assert.equal(PARCELS.filter(p => p.id.startsWith('P')).length, 9);   // P1–P9
  assert.equal(PARCELS.filter(p => p.id.startsWith('S')).length, 20);  // S01–S20
  assert.equal(PARCELS.filter(p => p.id.startsWith('E')).length, 8);   // E01–E08
  assert.equal(GATES.length, 5);
  assert.ok(ROADS.length >= 8); // R1, R2, forest loop, quarry link, rail, serpentine, perimeter, spurs
});

test('every parcel and road vertex is inside map bounds', () => {
  for (const p of PARCELS) {
    assert.ok(Math.abs(p.x) <= EXTENT && Math.abs(p.z) <= EXTENT, p.id);
  }
  for (const r of ROADS) for (const [x, z] of r.pts) {
    assert.ok(Math.abs(x) <= EXTENT && Math.abs(z) <= EXTENT, `${r.id} (${x},${z})`);
  }
});

test('gates sit on their declared road (within 30 m of some vertex)', () => {
  for (const g of GATES) {
    const road = ROADS.find(r => r.id === g.roadId);
    assert.ok(road, `${g.id} road ${g.roadId}`);
    const near = road.pts.some(([x, z]) => Math.hypot(x - g.x, z - g.z) <= 30);
    assert.ok(near, `${g.id} not on ${g.roadId}`);
  }
});

test('lintPlan passes on the shipped registry', () => {
  const { errors } = lintPlan();
  assert.deepEqual(errors, []);
});

test('lintPlan catches an out-of-bounds parcel', () => {
  PARCELS.push({ id: 'XX', name: 'bogus', kind: 'disc', x: 9999, z: 0, r: 10, tier: 1 });
  try { assert.ok(lintPlan().errors.length > 0); }
  finally { PARCELS.pop(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/zona/plan.test.mjs`
Expected: FAIL — `Cannot find module '../../src/zona-plan.js'`.

- [ ] **Step 3: Write `src/zona-plan.js`**

Transcribe 1:1 from master plan v1.2 sections B/C/D. Full data (this IS the deliverable — copy verbatim):

```js
// zona-plan.js — «ЗОНА 704» master-plan registry. PURE DATA + lint. Imports NOTHING (node-testable,
// sim-worker-safe). SOURCE OF TRUTH: docs/superpowers/specs/2026-07-02-world-map-master-plan.html v1.2 —
// every coordinate transcribes 1:1; values the plan under-specifies are marked AUTHORED: and feed back
// into the plan's next version bump. Frame: x,z ∈ [−1250,+1250], +X=east +Z=north, heights above ±0.
export const EXTENT = 1250;

// ── parcels (section B) — kind rect uses w(×X)×d(×Z); disc uses r. h = plan height (null ⇒ sample stamped terrain at anchor)
export const PARCELS = [
  { id: 'P1', name: 'КПП «ПРОХОДНАЯ»',   kind: 'rect', x: -1080, z: -1060, w: 40,  d: 30,  h: 5,    tier: 1 },
  { id: 'P2', name: 'ОПОРНЫЙ ПУНКТ',      kind: 'disc', x: -950,  z: -920,  r: 56,  h: 8,    tier: 1 },
  { id: 'P3', name: 'ЛЕТИЩЕ «ЗАСЛОН»',    kind: 'rect', x: 50,    z: 630,   w: 380, d: 140, h: 60,   tier: 3, gate: 'G1' },
  { id: 'P4', name: 'КОЛХОЗ «ЗАРЯ»',      kind: 'rect', x: 50,    z: -840,  w: 260, d: 160, h: 4,    tier: 3, gate: 'G3' },
  { id: 'P5', name: 'КОМБИНАТ «ПЛЮШТАЛЬ»',kind: 'rect', x: 680,   z: 60,    w: 280, d: 240, h: 30,   tier: 4, gate: 'G5' },
  { id: 'P6', name: 'ШАХТА №8',           kind: 'rect', x: 640,   z: 760,   w: 60,  d: 50,  h: 140,  tier: 4, gate: 'G2' },
  { id: 'P7', name: 'ПЛОТИНА',            kind: 'rect', x: 780,   z: -680,  w: 90,  d: 12,  h: -4,   tier: 4, gate: 'G4' },
  { id: 'P8', name: 'ОБЪЕКТ 1180 + LZ',   kind: 'rect', x: 960,   z: 1020,  w: 70,  d: 60,  h: 200,  tier: 5 },
  { id: 'P9', name: 'ОБЪЕКТ 704 (ПОРТАЛ)',kind: 'disc', x: 180,   z: 80,    r: 30,  h: 40,   tier: 6 },
  { id: 'S01', name: 'РТ-1',              kind: 'disc', x: -820,  z: -700,  r: 12, h: null, tier: 2 },
  { id: 'S02', name: 'РТ-2',              kind: 'disc', x: -120,  z: 480,   r: 12, h: null, tier: 3 },
  { id: 'S03', name: 'РТ-3',              kind: 'disc', x: 920,   z: 560,   r: 12, h: null, tier: 4 },
  { id: 'S04', name: 'МОСТ (ТИХАЯ)',      kind: 'disc', x: -470,  z: -620,  r: 14, h: null, tier: 2 },
  { id: 'S05', name: 'АЗС',               kind: 'rect', x: -240,  z: -640,  w: 30, d: 20, h: null, tier: 2 },
  { id: 'S06', name: 'КУРГАНЫ',           kind: 'disc', x: -450,  z: -250,  r: 60, h: null, tier: 2, noPad: true },
  { id: 'S07', name: 'КАРЬЕР',            kind: 'disc', x: -140,  z: -260,  r: 90, h: -25,  tier: 3, noPad: true },
  { id: 'S08', name: 'КРАТЕРНОЕ ПОЛЕ',    kind: 'disc', x: -500,  z: 300,   r: 70, h: null, tier: 3, noPad: true },
  { id: 'S09', name: 'ХАЙОВНА',           kind: 'rect', x: -700,  z: 320,   w: 24, d: 18, h: null, tier: 2 },
  { id: 'S10', name: 'ВЫШКА (ТЕСНАЯ БРАНА)',kind:'disc', x: -690,  z: 720,   r: 14, h: null, tier: 3 },
  { id: 'S11', name: 'БАТАРЕЯ С-75',      kind: 'disc', x: 320,   z: 700,   r: 30, h: null, tier: 3 },
  { id: 'S12', name: 'ЭЛЕВАТОР',          kind: 'rect', x: 140,   z: -800,  w: 16, d: 16, h: null, tier: 3 },
  { id: 'S13', name: 'ЗАТОПЛЕННАЯ ЦЕРКОВЬ',kind:'disc', x: 380,   z: -980,  r: 24, h: null, tier: 4 },
  { id: 'S14', name: 'ЛАГЕРЬ БРАКОНЬЕРОВ',kind: 'disc', x: 180,   z: -520,  r: 18, h: null, tier: 3 },
  { id: 'S15', name: 'ВОДОКАЧКА',         kind: 'rect', x: 920,   z: -40,   w: 16, d: 14, h: null, tier: 3 },
  { id: 'S16', name: 'КОЛОДЕЦ',           kind: 'disc', x: 40,    z: -700,  r: 8,  h: null, tier: 2 },
  { id: 'S17', name: 'ОСТАНОВКА',         kind: 'disc', x: -300,  z: -480,  r: 8,  h: null, tier: 2 },
  { id: 'S18', name: 'ОБЛОМКИ «АИСТ»',    kind: 'disc', x: 260,   z: 190,   r: 26, h: null, tier: 5 },
  { id: 'S19', name: 'ЛЕСОПИЛКА',         kind: 'rect', x: -790,  z: 460,   w: 36, d: 20, h: null, tier: 3 },
  { id: 'S20', name: 'ПуСО',              kind: 'rect', x: -370,  z: -1040, w: 40, d: 56, h: null, tier: 2 },
  { id: 'E01', name: 'ЛАГЕРЬ «ОРЛЁНОК»',  kind: 'disc', x: -1180, z: 390,   r: 40, h: null, tier: 3 },
  { id: 'E02', name: 'ТРИАНГУЛЯЦИОННАЯ ВЫШКА', kind: 'disc', x: -1130, z: -350, r: 12, h: null, tier: 2 },
  { id: 'E03', name: 'МЕТЕОСТАНЦИЯ «ГОРА-9»',  kind: 'disc', x: -320,  z: 990,  r: 18, h: null, tier: 4 },
  { id: 'E04', name: 'ОБЛОМКИ АН-2',      kind: 'disc', x: -700,  z: 950,   r: 20, h: null, tier: 3 },
  { id: 'E05', name: 'ТОННЕЛЬ + ДРЕЗИНА', kind: 'rect', x: 1180,  z: -20,   w: 40, d: 20, h: null, tier: 4 },
  { id: 'E06', name: '«ИЗОЛЯТОР»',        kind: 'rect', x: 980,   z: -260,  w: 50, d: 36, h: null, tier: 4 },
  { id: 'E07', name: '«ЗАСТАВА ЮГ»',      kind: 'rect', x: 600,   z: -1180, w: 50, d: 30, h: null, tier: 3 },
  { id: 'E08', name: '«ПРОРЫВ»',          kind: 'disc', x: -550,  z: -1190, r: 30, h: null, tier: 2 },
];

// ── roads (section D, polylines verbatim; maxSlope = longitudinal clamp, fraction)
export const ROADS = [
  { id: 'R1', name: 'ТРАССА', surface: 'asphalt', width: 7.5, maxSlope: 0.08, pts: [
    [-1080,-1060],[-950,-920],[-760,-760],[-600,-660],[-470,-620],[-340,-540],[-330,-380],[-300,-200],
    [-340,-20],[-440,140],[-560,240],[-660,320],[-700,480],[-720,560],[-690,720],[-520,690],[-300,670],[-140,630],
  ]},
  { id: 'R1N', name: 'ТРАССА (за G1)', surface: 'asphalt', width: 7.5, maxSlope: 0.08, pts: [
    [240,640],[380,660],[520,700],[640,760],
  ]},
  { id: 'R1E', name: 'ТРАССА (за G2)', surface: 'asphalt', width: 7.5, maxSlope: 0.08, pts: [
    [780,780],[900,700],[950,540],[880,380],[800,200],
  ]},
  { id: 'R2', name: 'БЕТОНКА', surface: 'panels', width: 6, maxSlope: 0.09, pts: [
    [-340,-540],[-260,-600],[-240,-640],[-160,-700],[-80,-780],
  ]},
  { id: 'R2E', name: 'БЕТОНКА (за G3)', surface: 'panels', width: 6, maxSlope: 0.09, pts: [
    [180,-820],[280,-840],[420,-800],[520,-820],[620,-780],[720,-720],[780,-680],
  ]},
  { id: 'R2N', name: 'БЕТОНКА (за G4)', surface: 'panels', width: 6, maxSlope: 0.09, pts: [
    [820,-560],[850,-400],[840,-240],[800,-100],[740,-60],
  ]},
  { id: 'LOOP', name: 'ЛЕСНОЙ КРУГ', surface: 'dirt', width: 4, maxSlope: 0.12, pts: [
    [-470,-620],[-580,-400],[-640,-200],[-700,-80],[-480,80],[-600,180],[-700,320],[-660,320],
  ]},
  { id: 'QUARRY', name: 'КАРЬЕРНАЯ СПОЙКА', surface: 'dirt', width: 4, maxSlope: 0.12, pts: [
    [-300,-200],[-200,-240],[-140,-260],[-120,-440],[-100,-600],[-80,-780],
  ]},
  { id: 'RAIL', name: 'ЖЕЛЕЗНАЯ ДОРОГА', surface: 'rail', width: 3, maxSlope: 0.03, pts: [
    [1250,-20],[1180,-20],[1050,-30],[920,-40],[820,-40],
  ]},
  { id: 'SERP', name: 'СЕРПАНТИН', surface: 'gravel', width: 4, maxSlope: 0.14, pts: [
    [800,200],[940,370],[1000,560],[980,760],[1040,880],[1000,990],[960,1020],[1060,1120],
  ]},
  { id: 'PERIM', name: 'ПЕРИМЕТРАЛЬНАЯ', surface: 'dirt', width: 4, maxSlope: 0.12, pts: [
    [-1080,-1060],[-800,-1120],[-550,-1180],[-400,-1100],[-370,-1040],[-240,-940],[-160,-860],[-80,-780],
  ]},
  { id: 'SP_METEO', name: 'СТЕЖКА: МЕТЕО', surface: 'path', width: 1.6, maxSlope: 0.25, pts: [
    [-400,780],[-320,990],
  ]},
  { id: 'SP_SRAZ', name: 'СТЕЖКА: СРАЗ', surface: 'path', width: 1.6, maxSlope: 0.25, pts: [
    [-950,-920],[-1090,-700],[-1180,390],[-1130,-350],
  ]}, // NOTE: plan lists P2→(−1090,−700)→E01→E02; E01 z+390 vs E02 z−350 — lint must NOT reject long legs
  { id: 'SP_PERIM_V', name: 'СТЕЖКА: ПЕРИМЕТР-ВОСТОК', surface: 'path', width: 1.6, maxSlope: 0.25, pts: [
    [50,-840],[200,-1000],[500,-1120],[600,-1180],
  ]},
  { id: 'SP_PILA', name: 'СТЕЖКА: ПИЛА', surface: 'path', width: 1.6, maxSlope: 0.25, pts: [
    [-700,320],[-760,420],[-790,460],
  ]},
  // AUTHORED: the two T5 ridge scrambles (plan: «pěší scramble PŘES hřbet, 2 stezky») — exact courses authored
  { id: 'T5A', name: 'СТЕЖКА: ХРЕБЕТ-СЗ', surface: 'path', width: 1.4, maxSlope: 0.30, pts: [
    [-440,140],[-260,120],[-60,60],[50,20],[180,80],[260,190],
  ]},
  { id: 'T5B', name: 'СТЕЖКА: ХРЕБЕТ-ЮВ', surface: 'path', width: 1.4, maxSlope: 0.30, pts: [
    [-300,-200],[-100,-160],[100,-120],[300,-140],[450,-330],[540,-60],
  ]},
];

// ── gates (section C) — physical blockades; skeleton = colliding placeholder + sign, no opening logic
export const GATES = [
  { id: 'G1', x: 240, z: 640,  kind: 'steelGate',  name: 'ВОРОТА ПЕРИМЕТРА', roadId: 'R1N' },
  { id: 'G2', x: 700, z: 770,  kind: 'rockfall',   name: 'ЗАВАЛ «ЩЕЛЬ»',     roadId: 'R1N' },
  { id: 'G3', x: 180, z: -820, kind: 'nest',       name: 'ГНЕЗДО ТОЛО',      roadId: 'R2E' },
  { id: 'G4', x: 780, z: -680, kind: 'floodedGat', name: 'ГАТЬ (ЗАТОПЛЕНА)', roadId: 'R2E' },
  { id: 'G5', x: 940, z: 370,  kind: 'derailed',   name: 'ВЫКОЛЕЙКА',        roadId: 'SERP' },
];

// ── water — AUTHORED: course/levels from the plan's «Biomy+voda» layer, flagged back on next plan bump
export const WATER = {
  river: { // Тихая: N (sawmill bend) → S04 bridge → S edge; carves its own channel (Task 2 feature)
    pts: [[-760,620],[-790,460],[-720,330],[-640,200],[-560,40],[-520,-150],[-500,-350],[-470,-620],[-430,-800],[-380,-950],[-330,-1100],[-310,-1250]],
    width: 14, depth: 2.5, surfaceOffset: 1.2, // water plane rides channel-bed profile + 1.2 m
  },
  swamp:     { x: 470, z: -850, w: 560, d: 340, level: -11 },   // bowl floor −12, plane at −11
  reservoir: { x: 780, z: -590, w: 170, d: 160, level: -6 },    // held behind the dam (P7 crest −4)
};
```

`TERRAIN_FEATURES` is added in Task 2 (it needs the stamp vocabulary). `lintPlan()`:

```js
export function lintPlan() {
  const errors = [], warnings = [];
  const seen = new Set();
  for (const p of PARCELS) {
    if (seen.has(p.id)) errors.push(`duplicate parcel id ${p.id}`);
    seen.add(p.id);
    if (Math.abs(p.x) > EXTENT || Math.abs(p.z) > EXTENT) errors.push(`${p.id} out of bounds`);
    if (p.kind === 'rect' && !(p.w > 0 && p.d > 0)) errors.push(`${p.id} rect missing w/d`);
    if (p.kind === 'disc' && !(p.r > 0)) errors.push(`${p.id} disc missing r`);
  }
  for (const r of ROADS) {
    if (r.pts.length < 2) errors.push(`${r.id} degenerate polyline`);
    for (let i = 0; i < r.pts.length; i++) {
      const [x, z] = r.pts[i];
      if (Math.abs(x) > EXTENT || Math.abs(z) > EXTENT) errors.push(`${r.id}[${i}] out of bounds`);
      if (i > 0 && Math.hypot(x - r.pts[i-1][0], z - r.pts[i-1][1]) < 1) errors.push(`${r.id}[${i}] zero-length segment`);
    }
    if (!(r.width > 0) || !(r.maxSlope > 0)) errors.push(`${r.id} missing width/maxSlope`);
  }
  for (const g of GATES) {
    const road = ROADS.find(r => r.id === g.roadId);
    if (!road) { errors.push(`${g.id} unknown road ${g.roadId}`); continue; }
    if (!road.pts.some(([x, z]) => Math.hypot(x - g.x, z - g.z) <= 30)) errors.push(`${g.id} not on ${g.roadId}`);
  }
  // parcel overlap (rect/disc as circles by max half-extent; declared exceptions: P8 bunkr+LZ pair, P9 inside massif)
  const OK_OVERLAP = new Set(['P9|S18']);
  const list = PARCELS.filter(p => !p.noPad);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const ra = a.kind === 'disc' ? a.r : Math.max(a.w, a.d) / 2;
    const rb = b.kind === 'disc' ? b.r : Math.max(b.w, b.d) / 2;
    if (Math.hypot(a.x - b.x, a.z - b.z) < (ra + rb) * 0.8 &&
        !OK_OVERLAP.has(`${a.id}|${b.id}`) && !OK_OVERLAP.has(`${b.id}|${a.id}`)) {
      warnings.push(`${a.id}/${b.id} pads close/overlapping`);
    }
  }
  return { errors, warnings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/zona/plan.test.mjs`
Expected: PASS (5 tests). If the overlap check errors on legit plan pairs, downgrade that pair to `warnings` (only true duplicates are errors).

- [ ] **Step 5: Commit**

```bash
git add src/zona-plan.js tests/zona/plan.test.mjs
git commit -m "feat(zona): master-plan data registry + lint (parcels/roads/gates/water)"
```

---

### Task 2: `src/zona-terrain.js` — stamp primitives + base field

**Files:**
- Create: `src/zona-terrain.js`
- Modify: `src/zona-plan.js` (add `TERRAIN_FEATURES`)
- Test: `tests/zona/terrain.test.mjs`

**Interfaces:**
- Consumes: `zona-plan.js` registries.
- Produces: `export function makeZonaHeightFn(seed)` → `(x,z) => h` (pure, cached per seed); internal-but-exported-for-test helpers `distToSeg(px,pz,ax,az,bx,bz)` → `{d, t}` and `polylineProject(pts, x, z)` → `{d, s, segIdx}` (s = arc-length position); `export const ZONA_TUNING` (base fbm params).
- `makeTerrain({profile:'zona', seed})` wiring happens in Task 3 — this task keeps zona-terrain standalone.

- [ ] **Step 1: Add `TERRAIN_FEATURES` to `zona-plan.js`**

Stamp vocabulary: `ridge` (polyline + per-vertex `h` + `halfW` falloff), `plateau` (disc/rect + `h` + `skirt`), `bowl` (disc, negative `h`, `skirt`), `channel` (polyline carve, negative, used by the river). All heights are DELTAS added to the base field except `plateau` with `abs:true` (pins absolute height).

```js
// AUTHORED: massif «РАНА» crest line + edge ranges from plan anchors (P9 portal +40 face, запретка crest
// (+50,+20) ≈ +150, P6 mountains +140, P8 saddle +200); exact polylines authored, flagged for plan bump.
export const TERRAIN_FEATURES = [
  // central massif NW→SE («ХРЕБЕТ РАНА», dead forest → rock, crest ~+150 near запретка)
  { kind: 'ridge', id: 'RANA', halfW: 220, pts: [
    [-620,560,60],[-430,380,100],[-220,220,130],[-50,60,150],[120,-40,140],[300,-140,120],[450,-330,90],[560,-430,50],
  ]}, // pts = [x, z, crestH]
  // NE edge range (mine bench + bunker saddle live in it)
  { kind: 'ridge', id: 'NE_RANGE', halfW: 260, pts: [
    [300,900,90],[560,860,140],[800,900,170],[980,1080,210],[1160,1200,180],
  ]},
  // honest edges: W scarp + E range (plan pillar «poctivé hranice»)
  { kind: 'ridge', id: 'W_SCARP', halfW: 140, pts: [[-1250,-500,60],[-1220,-100,80],[-1230,400,90],[-1250,800,70]] },
  { kind: 'ridge', id: 'E_RANGE', halfW: 160, pts: [[1250,-600,70],[1200,-200,90],[1230,300,110],[1250,700,90]] },
  // airfield shelf, industrial terrace, mine bench, bunker saddle (abs plateaus under the pads)
  { kind: 'plateau', id: 'SHELF_P3',  x: 50,  z: 630,  w: 460, d: 220, h: 60,  skirt: 90,  abs: true },
  { kind: 'plateau', id: 'TERR_P5',   x: 680, z: 60,   w: 360, d: 320, h: 30,  skirt: 70,  abs: true },
  { kind: 'plateau', id: 'BENCH_P6',  x: 640, z: 760,  w: 120, d: 100, h: 140, skirt: 60,  abs: true },
  { kind: 'plateau', id: 'SEDLO_P8',  x: 1000, z: 1060, w: 260, d: 220, h: 200, skirt: 80, abs: true },
  // depressions
  { kind: 'bowl', id: 'SWAMP',  x: 470,  z: -850, r: 330, h: -12, skirt: 120, abs: true },
  { kind: 'bowl', id: 'QUARRY', x: -140, z: -260, r: 90,  h: -25, skirt: 40,  abs: true },
  { kind: 'bowl', id: 'STARICA',x: -600, z: 180,  r: 46,  h: -3,  skirt: 24 },
  // micro-feature fields (deltas)
  { kind: 'bowl', id: 'CRATER1', x: -520, z: 280, r: 16, h: -3.5, skirt: 8 },
  { kind: 'bowl', id: 'CRATER2', x: -480, z: 330, r: 13, h: -3,   skirt: 7 },
  { kind: 'bowl', id: 'CRATER3', x: -540, z: 350, r: 11, h: -2.5, skirt: 6 },
  { kind: 'ridge', id: 'KURGAN1', halfW: 18, pts: [[-470,-230,5],[-455,-225,5]] },
  { kind: 'ridge', id: 'KURGAN2', halfW: 15, pts: [[-430,-270,4],[-418,-262,4]] },
  { kind: 'ridge', id: 'KURGAN3', halfW: 16, pts: [[-490,-285,4.5],[-478,-278,4.5]] },
  { kind: 'ridge', id: 'BALKA1', halfW: 30, pts: [[-900,-300,-6],[-780,-180,-7],[-660,-100,-5]] },
  { kind: 'ridge', id: 'BALKA2', halfW: 26, pts: [[-980,100,-5],[-860,180,-6],[-760,240,-4]] },
  { kind: 'ridge', id: 'UVOZ',   halfW: 14, pts: [[-740,-120,-4],[-700,-80,-4.5],[-640,-30,-4]] },
  // river channel (bed = terrain − depth along course; water plane rides bed + surfaceOffset, Task 7)
  { kind: 'channel', id: 'TIHAYA', ref: 'river' }, // resolved against WATER.river in zona-terrain
];
```

- [ ] **Step 2: Write the failing test**

```js
// tests/zona/terrain.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeZonaHeightFn, polylineProject, distToSeg } from '../../src/zona-terrain.js';

test('distToSeg: perpendicular + endpoint cases', () => {
  assert.equal(Math.round(distToSeg(0, 5, -10, 0, 10, 0).d), 5);
  assert.equal(Math.round(distToSeg(20, 0, -10, 0, 10, 0).d), 10); // beyond B → dist to B
});

test('polylineProject returns arc-length position', () => {
  const pts = [[0,0],[10,0],[10,10]];
  const r = polylineProject(pts, 10.5, 5);
  assert.ok(Math.abs(r.s - 15) < 0.75, `s=${r.s}`); // 10 along seg0 + 5 along seg1
  assert.ok(r.d < 1);
});

test('pinned plan heights (stamps only — corridors/pads come later)', () => {
  const h = makeZonaHeightFn(704);
  assert.ok(Math.abs(h(50, 630) - 60) < 3,  `P3 shelf ${h(50, 630)}`);       // abs plateau
  assert.ok(Math.abs(h(1000, 1060) - 200) < 5, `P8 saddle ${h(1000, 1060)}`);
  assert.ok(Math.abs(h(470, -850) - (-12)) < 1, `swamp ${h(470, -850)}`);
  assert.ok(Math.abs(h(-140, -260) - (-25)) < 3, `quarry ${h(-140, -260)}`);
  assert.ok(h(-50, 60) > 100, `massif crest ${h(-50, 60)}`); // ridge ~+150 minus fbm wobble
});

test('determinism + totality on a coarse full-map sweep', () => {
  const a = makeZonaHeightFn(704), b = makeZonaHeightFn(704);
  for (let x = -1250; x <= 1250; x += 125) for (let z = -1250; z <= 1250; z += 125) {
    const ha = a(x, z);
    assert.ok(Number.isFinite(ha), `NaN at ${x},${z}`);
    assert.equal(ha, b(x, z), `mismatch at ${x},${z}`);
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/zona/terrain.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/zona-terrain.js` (stamps + base field + bucket grid)**

Core shape (full algorithms — geometry helpers, smoothstep falloffs, bucket grid):

```js
// zona-terrain.js — pure «ЗОНА 704» height profile. NO imports beyond zona-plan.js. Bit-identical
// between main thread and sim-worker for the same seed (worker rebuilds from serialized opts).
import { EXTENT, TERRAIN_FEATURES, WATER } from './zona-plan.js';

// self-contained value-noise fbm (mirror of terrain.js's, kept local so this module imports only plan data)
function hash2(ix, iz, seed) { let h = (ix * 374761393 + iz * 668265263 + seed * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}
function fbm(x, z, seed, { octaves = 4, freq = 1 / 220, lacunarity = 2, gain = 0.5 } = {}) {
  let amp = 1, f = freq, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) { sum += amp * (valueNoise(x * f, z * f, seed + o * 101) * 2 - 1); norm += amp; amp *= gain; f *= lacunarity; }
  return sum / norm;
}
export const ZONA_TUNING = { fbmAmplitude: 4.0, fbm: { octaves: 5, freq: 1 / 220, lacunarity: 2.05, gain: 0.5 } };

const smoothstep = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0;
  const cx = ax + t * dx, cz = az + t * dz;
  return { d: Math.hypot(px - cx, pz - cz), t };
}

export function polylineProject(pts, x, z) {
  let best = { d: Infinity, s: 0, segIdx: 0 }, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const segLen = Math.hypot(bx - ax, bz - az);
    const { d, t } = distToSeg(x, z, ax, az, bx, bz);
    if (d < best.d) best = { d, s: acc + t * segLen, segIdx: i };
    acc += segLen;
  }
  return best;
}

// per-vertex crest height lerped along the ridge polyline at arc position s (cumArc precomputed once per feature)
function ridgeCrestAt(feat, s) {
  const A = feat._cumArc; // [0, len01, len01+len12, …] built at grid-index time
  let i = 1; while (i < A.length - 1 && A[i] < s) i++;
  const t = (s - A[i-1]) / Math.max(1e-6, A[i] - A[i-1]);
  return feat.pts[i-1][2] + (feat.pts[i][2] - feat.pts[i-1][2]) * Math.max(0, Math.min(1, t));
}

// ridge evaluation at (x,z): project onto the polyline (2D pts only), rounded-back falloff
//   const { d, s } = polylineProject(feat.pts2, x, z);           // pts2 = [[x,z]…] stripped of h
//   if (d < feat.halfW) h += ridgeCrestAt(feat, s) * Math.pow(1 - smoothstep(d / feat.halfW), 1.6);
// plateau/bowl (abs): wAbs = 1 − smoothstep((distToShape − 0) / skirt); h = h*(1−wAbs) + feat.h*wAbs
// plateau/bowl (delta): h += feat.h * (1 − smoothstep(distToShape / skirt))
// distToShape: disc → max(0, hypot(dx,dz) − r); rect → max(0, |dx| − w/2, |dz| − d/2) (Chebyshev-style)
```

Composition rule in `makeZonaHeightFn(seed)`:
1. `h = ZONA_TUNING.fbmAmplitude * fbm(x, z, seed, ZONA_TUNING.fbm)`
2. additive stamps (delta ridges/bowls/channels): `h += feat.h * falloff(dist)` where `falloff = 1 − smoothstep((d − core)/skirt)`; ridge crest uses `crestH * (1 − smoothstep(d/halfW))` shaped `^1.6` for a rounded back.
3. absolute stamps (`abs:true` plateaus/bowls): `h = mix(h, feat.h, wAbs)` with `wAbs = 1 − smoothstep((d − core)/skirt)` — full weight inside the core.
4. channel: `h −= depth * (1 − smoothstep(ld / (width/2 + 6)))` along `WATER.river.pts`.
5. Bucket grid: build once per `makeZonaHeightFn` — 50 m cells over [−EXTENT, EXTENT]², each cell lists features whose influence AABB (polyline AABB + halfW + skirt) touches it; the eval loop only tests listed features. Corridors (Task 4) and pads (Task 5) reuse the same grid.

Cache: `const _cache = new Map(); export function makeZonaHeightFn(seed) { if (_cache.has(seed)) return _cache.get(seed); … }`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/zona/terrain.test.mjs tests/zona/plan.test.mjs`
Expected: PASS. Tune stamp `skirt`/`halfW` values if a pinned-height assert misses (fbm wobble is ±4 m; abs plateaus must swallow it inside their core).

- [ ] **Step 6: Commit**

```bash
git add src/zona-plan.js src/zona-terrain.js tests/zona/terrain.test.mjs
git commit -m "feat(zona): pure height profile — fbm base + plan-driven stamps (ridge/plateau/bowl/channel)"
```

---

### Task 3: engine wiring — `profile:'zona'`, mapId plumbing, bare-terrain boot

**Files:**
- Modify: `src/terrain.js:151-169` (profile dispatch), `src/game.js:111-116` (mapId whitelist), `src/world.js:80-100` (mapId + profile/seed + `_buildZona()` dispatch), `src/world.js` (add `_buildZona()`)
- Test: `tests/zona/profile.test.mjs` + in-browser smoke

**Interfaces:**
- Consumes: `makeZonaHeightFn(seed)` (Task 2).
- Produces: `makeTerrain({profile:'zona', seed})` works everywhere (main thread + sim-worker, which passes `{profile, seed, slopeLimit, tuning, reserved}` through `terrainInit` unchanged); `world.mapId === 'zona'`; `GAME.world.chunks` spans extent 1250.

- [ ] **Step 1: Write the failing test**

```js
// tests/zona/profile.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTerrain } from '../../src/terrain.js';

test("makeTerrain profile 'zona' matches zona-terrain and stays deterministic", async () => {
  const { makeZonaHeightFn } = await import('../../src/zona-terrain.js');
  const t = makeTerrain({ profile: 'zona', seed: 704 });
  const h = makeZonaHeightFn(704);
  assert.equal(t.profile, 'zona');
  for (const [x, z] of [[0,0],[50,630],[1000,1060],[-470,-620]]) {
    assert.equal(t.terrainHeightAt(x, z), h(x, z));
  }
});
```

- [ ] **Step 2: Run test to verify it fails** — `node --test tests/zona/profile.test.mjs` → FAIL (profile falls back to flat/demo tuning).

- [ ] **Step 3: Implement**

`src/terrain.js` — add at top: `import { makeZonaHeightFn } from './zona-terrain.js';` (pure, no cycle: zona-terrain imports only zona-plan). In `makeTerrain`:

```js
const zonaFn = profile === 'zona' ? makeZonaHeightFn(seed) : null;
// … in terrainHeightAt:
const base = isFlat ? 0
  : profile === 'zona' ? zonaFn(x, z)
  : (profile === 'forest' ? forestHeight(x, z, seed, tune) : demoHeight(x, z, seed, tune));
```

(`isFlat` stays `profile === 'flat'`; `'zona'` is hilly → `hasTerrain` true for free.)

`src/game.js:113-115` — add `'zona'` to both whitelists (URL param + localStorage).

`src/world.js:80` — extend the mapId chain with `'zona'`; `:85-88` profile/seed:

```js
profile: this.mapId === 'demo' ? 'demo' : this.mapId === 'forest' ? 'forest' : this.mapId === 'zona' ? 'zona' : 'flat',
seed: this.mapId === 'forest' ? 2025 : this.mapId === 'zona' ? 704 : 1337,
```

Dispatch `else if (this.mapId === 'zona') { this._buildZona(); }`. Minimal `_buildZona()` (mirrors `_buildForest`, zona params):

```js
_buildZona() {
  this.HALF = 1250;
  this.scene.fog.near = 140; this.scene.fog.far = 1000; // big-world haze
  this.chunks = new TerrainChunks(this.terrain, {
    extent: 1250, chunkSize: 125, resolutions: [48, 24, 12, 6],
    lodBands: [180, 400, 900], lodMargin: 30,
    scene: this.scene, simWorker: this.game.simWorker,
  });
  // spawn ring at КПП «ПРОХОДНАЯ» (P1) — the Act-1 start anchor
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, x = -1080 + Math.cos(a) * 14, z = -1030 + Math.sin(a) * 10;
    this.spawns.push(new THREE.Vector3(x, this.terrain.terrainHeightAt(x, z), z));
  }
  this.lootSpots.push(new THREE.Vector3(-1080, this.terrain.terrainHeightAt(-1080, -1060), -1060));
  buildZona(this); // Tasks 6–8 flesh this out; starts as network-less stub importing zona.js
}
```

Create stub `src/zona.js`: `export function buildZona(world) { const { errors, warnings } = lintPlan(); for (const e of errors) console.error('[zona-plan]', e); for (const w of warnings) console.warn('[zona-plan]', w); }` (fail-loud lint at boot per spec §7).

- [ ] **Step 4: Run node tests** — `node --test tests/zona/*.test.mjs` → PASS.

- [ ] **Step 5: In-browser smoke (fresh port, no-store server — stale-module gotcha)**

```bash
python3 -c "
import http.server, functools
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory='.')
class H(h.func if hasattr(h,'func') else http.server.SimpleHTTPRequestHandler):
    def end_headers(self): self.send_header('Cache-Control','no-store'); super().end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1', 8971), H).serve_forever()" &
```

Open `http://127.0.0.1:8971/?map=zona&fly=1` in Chrome (Playwright MCP), start a run, then in console:
`GAME.world.mapId` → `'zona'`; `GAME.world.terrain.terrainHeightAt(50,630)` → ≈60; `GAME.world.chunks.chunks.length` → 400; fly toward the massif — hills visible, no NaN holes, boot streams chunks without a hard hitch.
Expected: bare shaped 2500×2500 terrain, playable.

- [ ] **Step 6: Commit**

```bash
git add src/terrain.js src/game.js src/world.js src/zona.js tests/zona/profile.test.mjs
git commit -m "feat(zona): ?map=zona boots on plan-shaped 2500x2500 terrain (profile wiring + chunks/LOD)"
```

---

### Task 4: corridor conditioning (roads shape the terrain)

**Files:**
- Modify: `src/zona-terrain.js`
- Test: `tests/zona/corridor.test.mjs`

**Interfaces:**
- Consumes: `ROADS` (Task 1), stamped field (Task 2).
- Produces: final `makeZonaHeightFn(seed)` now applies corridors AFTER stamps; `export function roadProfiles(seed)` → `Map<roadId, {arc:[…], h:[…], pos:[[x,z]…], pts, vertArc:[…]}>` — `arc`/`h`/`pos` are the ~10 m resampled profile, `pts` the original polyline, `vertArc[i]` the arc position of original vertex i (Task 6 ribbons + tests reuse it).

- [ ] **Step 1: Write the failing test**

```js
// tests/zona/corridor.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeZonaHeightFn, roadProfiles } from '../../src/zona-terrain.js';
import { ROADS } from '../../src/zona-plan.js';

function walk(road, prof, step, fn) { // sample centreline by arc length
  for (let s = 0; s + step <= prof.arc[prof.arc.length - 1]; s += step) fn(s);
}

test('longitudinal slope along every road ≤ maxSlope + eps', () => {
  const profs = roadProfiles(704);
  for (const road of ROADS) {
    const p = profs.get(road.id);
    for (let i = 1; i < p.arc.length; i++) {
      const slope = Math.abs(p.h[i] - p.h[i-1]) / (p.arc[i] - p.arc[i-1]);
      assert.ok(slope <= road.maxSlope + 0.005, `${road.id}@${p.arc[i]|0}m slope=${slope.toFixed(3)}`);
    }
  }
});

test('terrain equals the profile on the centreline, blends off outside the shoulder', () => {
  const h = makeZonaHeightFn(704);
  const profs = roadProfiles(704);
  const r1 = profs.get('R1');
  // mid-vertex of R1 (a point safely on the centreline): index 5 = [-340,-540] (the rozcestí)
  const [x, z] = [-340, -540];
  const centerH = h(x, z);
  // profile height at that vertex's arc position
  const idx = r1.pts.findIndex(([px, pz]) => px === x && pz === z);
  assert.ok(idx >= 0);
  // centreline matches the clamped profile (±0.3 m: bucket-grid falloff edge cases)
  const sAtVertex = r1.vertArc[idx];
  const k = r1.arc.findIndex(s => s >= sAtVertex);
  assert.ok(Math.abs(centerH - r1.h[k]) < 0.3, `center ${centerH} vs profile ${r1.h[k]}`);
  // 40 m off a plain stretch the corridor no longer wins (equals stamps-only field ±0.01)
});

test('corridors stay deterministic', () => {
  const a = makeZonaHeightFn(704), b = makeZonaHeightFn(704);
  for (const [x, z] of [[-340,-540],[-470,-620],[940,370],[820,-560]]) assert.equal(a(x, z), b(x, z));
});
```

- [ ] **Step 2: Run to verify it fails** — `roadProfiles` undefined.

- [ ] **Step 3: Implement corridor precompute + runtime pull**

Precompute per road (inside `makeZonaHeightFn`, cached with it):
1. Resample the polyline every ~10 m of arc length → `arc[]`, `pos[]`; record `vertArc[]` (arc position of each original vertex).
2. `h[i] = stampedField(pos[i])` (base + stamps ONLY — corridors must not read themselves).
3. Smooth: two passes of centered moving average, window 5.
4. Slope-clamp by iterative relaxation (deterministic, 64 iterations):

```js
for (let it = 0; it < 64; it++) {
  let moved = 0;
  for (let i = 1; i < h.length; i++) {
    const ds = arc[i] - arc[i-1], lim = road.maxSlope * ds;
    const diff = h[i] - h[i-1];
    if (diff >  lim) { const ex = (diff - lim) / 2; h[i] -= ex; h[i-1] += ex; moved = 1; }
    if (diff < -lim) { const ex = (-diff - lim) / 2; h[i] += ex; h[i-1] -= ex; moved = 1; }
  }
  if (!moved) break;
}
```

Runtime pull in the composed height fn (after stamps, before pads): via the bucket grid find the road with the smallest lateral distance `ld`; `halfW = road.width/2 + 1`, `shoulder = road.width * 1.5`:

```js
if (ld < halfW + shoulder) {
  const hp = profileHeightAt(road, s);           // lerp h[] at arc position s
  const w = 1 - smoothstep((ld - halfW) / shoulder); // 1 inside halfW → 0 past the shoulder
  h = hp * w + h * (1 - w);                      // cut AND fill
}
```

Nearest-road-wins at crossings (both profiles derive from the same stamped field, so they agree to within smoothing error; acceptable for the skeleton).

- [ ] **Step 4: Run tests** — `node --test tests/zona/*.test.mjs` → PASS (loosen the centreline tolerance to 0.5 m only if resampling quantization demands it; document why in the test).

- [ ] **Step 5: In-browser check** — reload `?map=zona&fly=1`, fly R1 from КПП to the letiště shelf: a continuous drivable-looking cut/fill band must be visible in the terrain (no cliffs across the road). Screenshot `zona-m3-corridor.jpeg`.

- [ ] **Step 6: Commit**

```bash
git add src/zona-terrain.js tests/zona/corridor.test.mjs
git commit -m "feat(zona): road-corridor terrain conditioning (slope-clamped longitudinal profiles, cut+fill)"
```

---

### Task 5: parcel pads (cadastre flattening)

**Files:**
- Modify: `src/zona-terrain.js`
- Test: `tests/zona/pads.test.mjs`

**Interfaces:**
- Consumes: `PARCELS` (skip `noPad:true`), corridor field (Task 4).
- Produces: pads win over corridors; `export function padHeights(seed)` → `Map<parcelId, h>` (Tasks 7–8 seat signs/gates; buildgen later seats buildings).

- [ ] **Step 1: Write the failing test**

```js
// tests/zona/pads.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeZonaHeightFn, padHeights } from '../../src/zona-terrain.js';
import { PARCELS } from '../../src/zona-plan.js';

test('every pad is flat: max deviation < 0.15 m over a 5×5 interior sample', () => {
  const h = makeZonaHeightFn(704);
  const ph = padHeights(704);
  for (const p of PARCELS.filter(p => !p.noPad)) {
    const hw = (p.kind === 'disc' ? p.r : p.w / 2) * 0.7, hd = (p.kind === 'disc' ? p.r : p.d / 2) * 0.7;
    const target = ph.get(p.id);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const y = h(p.x + (i / 2) * hw, p.z + (j / 2) * hd);
      assert.ok(Math.abs(y - target) < 0.15, `${p.id} dev ${Math.abs(y - target).toFixed(2)} at ${i},${j}`);
    }
  }
});

test('pinned pad heights match the plan', () => {
  const ph = padHeights(704);
  assert.equal(ph.get('P3'), 60); assert.equal(ph.get('P8'), 200);
  assert.equal(ph.get('P1'), 5);  assert.equal(ph.get('P7'), -4);
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — `padHeights(seed)`: `p.h` when non-null, else corridor-field height sampled at the anchor. Runtime (LAST layer): inside the rect/disc (with ~2 m inset margin) `h = padH`; skirt = `max(8, min(20, footprint/6))` metres of smoothstep blend outside. Pads use the same bucket grid.

- [ ] **Step 4: Run all zona tests** — PASS (if a pad sits on a corridor, the pad wins — assert P7 dam crest −4 even though R2E crosses it).

- [ ] **Step 5: Commit**

```bash
git add src/zona-terrain.js tests/zona/pads.test.mjs
git commit -m "feat(zona): parcel pads — cadastre flattening with smoothstep skirts (pads win over roads)"
```

**→ PR-A gate:** cache-bust ritual (bump `?v=` + `GAME_BUILD`), push `feat/zona704-skeleton`, `gh pr create` (title `feat(zona): ЗОНА 704 terrain core — plan registry + shaped 2500×2500 ?map=zona`). Branch `feat/zona704-network` off it for Tasks 6–10.

---

### Task 6: `zona.js` — draped road + rail ribbons

**Files:**
- Modify: `src/zona.js`
- Test: in-browser (THREE-bound; node tests don't apply)

**Interfaces:**
- Consumes: `ROADS`, `roadProfiles(seed)`, `world.terrain.terrainHeightAt`.
- Produces: `buildZona(world)` builds all network meshes into one merged BufferGeometry group; `world.zonaGroup` for dispose.

- [ ] **Step 1: Implement ribbon builder**

For each road: sample the centreline every 3 m (roads) / 2 m (rail); at each sample take direction `dir`, normal `(−dir.z, dir.x)`; emit left/right vertices at `±width/2`, each at `terrainHeightAt(vx, vz) + 0.05`; two triangles per segment; vertex colors from a per-surface 3-tone palette (asphalt `0x4a4a4e/0x3f3f43/0x55555a`, panels `0x8a8578/0x7c7768/0x969180`, dirt `0x6b5a41/0x5d4d36/0x79684e`, gravel `0x7a746a/0x6c665c/0x88827a`, path `0x71624a` single tone, narrower); dirt/gravel get darker wheel-rut vertex-color rows at `±width*0.28` (steppe `roadStrip` idiom, but draped). Seeded speckle: `makeRNG(704 + roadIndex)` (util.js seeded family — map gen). Rail: dirt ballast ribbon 3 m + sleeper boxes every 2.4 m (MeshBuilder) + two rail strips `0.08×0.12` draped 0.16 m above ballast. All meshes: `voxelMaterial()`, `castShadow = false`, `receiveShadow = true`, added to `world.zonaGroup`, `world.addCullable(mesh)` per chunk-sized batches — split ribbon geometry per 250 m so draw-distance culling works.

- [ ] **Step 2: In-browser verify** — `?map=zona&fly=1`: fly the full R1 from КПП to letiště — ribbon hugs the terrain (no floating/buried stretches > 0.3 m), surfaces read distinct (asphalt vs panels vs dirt), rail has sleepers. Console: `GAME.world.zonaGroup.children.length` > 0. Screenshots `zona-m6-r1.jpeg`, `zona-m6-rail.jpeg`.

- [ ] **Step 3: Commit** — `feat(zona): draped road+rail ribbons over the conditioned corridors`

---

### Task 7: water planes + S04 bridge + gates G1–G5

**Files:**
- Modify: `src/zona.js`
- Test: in-browser

**Interfaces:**
- Consumes: `WATER`, `GATES`, `roadProfiles`, `padHeights`, `seatBox` (terrain-place.js).
- Produces: translucent water meshes (river ribbon along channel bed + `surfaceOffset`, swamp + reservoir rect planes at `level`); S04 bridge deck (slab + collider); 5 gate placeholder builds, each with collider + sign.

- [ ] **Step 1: Implement water** — river: ribbon like Task 6 but at `bedProfile + 1.2` (bed = channel-carved terrain along `WATER.river.pts`), width 14, `MeshLambertMaterial({ color: 0x2b5a66, transparent: true, opacity: 0.72 })` (industrial pond idiom), `depthWrite: false`. Swamp/reservoir: single `PlaneGeometry` rects at `level`, same material, murkier `0x374f42` for swamp. NO colliders (walk-through per spec).

- [ ] **Step 2: Implement S04 bridge + gates** — bridge: concrete slab `18×0.6×9` at river crossing, top flush with R1 profile height; `seatBox` collider; low parapets. Gates (rough MeshBuilder blocks + `seatBox`, each ~road-width wide so it BLOCKS the road): `steelGate` = 2 pillars + gate slab (h 5); `rockfall` = 3–5 overlapping rock boxes (h 6, `0x6f6a60`); `nest` = plush-pink/brown mound boxes (h 4, Tolo palette `0xa8615c`); `floodedGat` = causeway deck UNDER the reservoir waterline + sluice hut on the dam pad (the road visibly drowns — the blocker is water, collider = a low invisible wall so players can't wade in the skeleton); `derailed` = 2 wagon boxes across the cut (h 4.2, rust `0x7a4a38`). Each gate gets a small sign (Task 8 helper) with `gate.name`.

- [ ] **Step 3: In-browser verify** — fly both routes: N (R1→G1→G2) and S (R2→G3→G4), then G5. Each gate visibly blocks its road; river reads as a course from the sawmill bend to the S edge; swamp + reservoir planes sit in their bowls (no z-fighting with terrain — offset ≥ 0.3 m above bowl floor). Screenshots `zona-m7-g1..g5.jpeg`, `zona-m7-river.jpeg`.

- [ ] **Step 4: Commit** — `feat(zona): placeholder water (river/swamp/reservoir), S04 bridge, blocking gates G1–G5`

---

### Task 8: ЛЭП lines + parcel signs

**Files:**
- Modify: `src/zona.js`
- Test: in-browser

**Interfaces:**
- Consumes: `PARCELS`, `padHeights`, road polylines; steppe pole design (openworld.js `telegraphPole` — reimplement terrain-aware locally, the original assumes y=0 ground).
- Produces: pole lines along R1/R2 (+45 m spacing, 5.2 m lateral offset, pole base at `terrainHeightAt`, collider seated via `seatBox`); one signpost per parcel at the pad edge facing the nearest road: concrete post h 2.6 + 1.6×0.9 panel, `CanvasTexture` label (airfield.js canvas idiom: dark steel panel, white stencil Cyrillic) — line 1 `p.id`, line 2 `p.name`, line 3 `TIER p.tier`; gates reuse the same helper with red accent.

- [ ] **Step 1: Implement + verify in-browser** — poles follow terrain along R1 (check the climb to Тесная брана — poles stay planted, no floaters); every parcel shows a legible sign from ~30 m. Console spot-check: `GAME.world.boxes.length` grew by ≈ (#poles + #signs + gates + bridge). Screenshots `zona-m8-signs.jpeg`, `zona-m8-lep.jpeg`.

- [ ] **Step 2: Commit** — `feat(zona): ЛЭП pole lines + cadastre signposts (CanvasTexture labels)`

---

### Task 9: verification pass — asserts + contact sheet + perf

**Files:**
- Create: `tests/zona/e2e-asserts.md` (the console assert list, for repeatability)
- Test: in-browser + node full suite

- [ ] **Step 1: Full node suite** — `node --test tests/zona/*.test.mjs` AND the whole `node --test tests/**/*.test.mjs` (no regressions in terrain/nav/dig suites).

- [ ] **Step 2: In-engine asserts** (Playwright console against `?map=zona`):

```js
const T = GAME.world.terrain;
[[50,630,60,3],[1000,1060,200,5],[470,-850,-12,1],[-140,-260,-25,3],[640,760,140,5],[-1080,-1060,5,1]]
  .map(([x,z,h,tol]) => Math.abs(T.terrainHeightAt(x,z) - h) <= tol || `FAIL ${x},${z}`);
```

Plus: walk both T5 ridge paths in fly-then-walk mode — `slopeBlocks` must not wall them (spot-check `T.terrainSlopeAt` along T5A/T5B < 35° on the path line); `GAME.world.chunks.visible` sane while flying.

- [ ] **Step 3: Perf gate** — stat overlay on M1: boot to playable < 8 s (worker streaming), steady-state p99 frame within forest-map budget while flying the R1 at speed; chunk count 400, resident meshes 1600. If LOD0=48 blows the budget, drop `resolutions` to `[40,20,10,6]` (one knob — do not restructure).

- [ ] **Step 4: Freecam contact sheet** — 12 shots: КПП start, rozcestí, S04 bridge, Тесная brána, G1–G5, ridge crossing (T5A summit view), P5 convergence, serpentine, P8+LZ. Save as `zona-sk-01..12.jpeg`, composite `zona-sk-sheet.jpeg` → owner review.

- [ ] **Step 5: Commit** — `test(zona): e2e assert list + verification pass (pinned heights, slopes, perf)`

---

### Task 10: ship PR-B

- [ ] **Step 1:** Cache-bust ritual — bump `index.html` `?v=N` and `GAME_BUILD` in `src/game.js`.
- [ ] **Step 2:** `git push -u origin feat/zona704-network`; `gh pr create` (base: `feat/zona704-skeleton` if PR-A unmerged, else `main`) — title `feat(zona): ЗОНА 704 network + cadastre — roads/rail/water/gates/ЛЭП/signs`, body links the spec + contact sheet.
- [ ] **Step 3:** Update memory (`engendros-world-map-master.md`): skeleton status, PR numbers, NEXT = owner walk-through + 2-PC co-op gate note (terrain determinism is co-op-critical: same seed ⇒ same ground on host and client).

## Self-Review Notes

- Spec §3 layer order (fbm → stamps → corridors → pads) = Tasks 2→4→5; §4 meshes = Tasks 6–8; §6 verification = Task 9; §8 two PRs = gates after Task 5 and Task 10. Spec §7 fail-loud lint = Task 3 stub.
- Type consistency: `makeZonaHeightFn(seed)`, `roadProfiles(seed)`, `padHeights(seed)` are the only cross-task exports; all keyed by seed 704 set in world.js.
- The `floodedGat` collider is an explicit skeleton hack (invisible low wall) — documented in code; removed when real water mechanics land.
