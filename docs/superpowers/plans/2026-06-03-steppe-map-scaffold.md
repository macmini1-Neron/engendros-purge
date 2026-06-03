# Steppe Map Scaffold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, selectable voxel map — a bare 500×500 m "steppe" with an impassable mountain border — without touching the existing dust2 arena, as the foundation for the open-world map (spec `docs/superpowers/specs/2026-06-03-open-world-map-design.md`, Phase 1).

**Architecture:** `World` currently hardcodes one arena built in its constructor. Parameterise it: `Game` reads a `?map=steppe` URL param into `game.mapId` **before** constructing `World`; `World` dispatches its build to the existing arena builder (`_build`) or a new `_buildSteppe()`. `_buildSteppe()` sets `HALF=250`, lays a flat ground, a tall (impassable, > step-up) voxel mountain border as AABB colliders, a few boulders, and scaled `spawns`/`lootSpots`. All existing consumers (`world.boxes`, `world.spawns`, `world.lootSpots`, `collide`, `rayHit`) keep their shapes, so weapons/enemies/waves/loot work unchanged.

**Tech Stack:** vanilla ES modules + Three.js r160, `MeshBuilder`/`voxelMaterial` voxel pattern, no build/test tooling. **Verification is manual in-browser** against `window.GAME` (this codebase has no test suite — CLAUDE.md). Serve with `python3 -m http.server 8000`.

---

## Scope note

This is **Plan 1 of several** decomposed from spec Phase 1. It ships a walkable, bounded, fps-OK big map (dev-selectable via `?map=steppe`). Deliberately **out of scope** (later plans):
- In-menu map picker + live `World` rebuild (needs `index.html` menu markup) — **Plan 2**.
- Spatial partition grid for `collide`/`rayHit` (only needed once box count reaches the thousands; the bare map has <100 boxes) — **Plan 3**.
- Zone-based spawn — **Plan 4**. Industrial kombinat geometry — **Plan 5**. Field-strongpoint base — **Plan 6**.

## File Structure

- **Modify** `src/game.js` — constructor: read `?map=` into `this.mapId` *before* `new World(this)`.
- **Modify** `src/world.js` — constructor: dispatch build on `this.mapId`; add `_buildSteppe()` method.

No new files. No new dependencies.

---

### Task 1: Game reads the map id from the URL

**Files:**
- Modify: `src/game.js:41-42` (inside `Game` constructor, immediately before `this.world = new World(this);`)

- [ ] **Step 1: Add the map-id read before World is constructed**

In `src/game.js`, find (constructor, ~line 36-42):

```javascript
    this.audio = new AudioManager();
    this.effects = new Effects(this);
    this.world = new World(this);
```

Replace with:

```javascript
    this.audio = new AudioManager();
    this.effects = new Effects(this);
    // Map selection (dev: ?map=steppe). World reads game.mapId in its constructor, so this MUST precede `new World`.
    this.mapId = (() => { try { return new URLSearchParams(location.search).get('map') === 'steppe' ? 'steppe' : 'arena'; } catch (e) { return 'arena'; } })();
    this.world = new World(this);
```

- [ ] **Step 2: Verify in-browser (default = arena, param = steppe)**

Run: `python3 -m http.server 8000` (from repo root), then in the browser:
1. Open `http://localhost:8000/` and hard-reload (Cmd/Ctrl+Shift+R). Console: `GAME.mapId`
   Expected: `'arena'`
2. Open `http://localhost:8000/?map=steppe` and hard-reload. Console: `GAME.mapId`
   Expected: `'steppe'`

(World will still build the arena until Task 2 — that's fine; this task only proves the id is read.)

- [ ] **Step 3: Commit**

```bash
git add src/game.js
git commit -m "feat(map): read ?map= into game.mapId before World build"
```

---

### Task 2: World builds the steppe map when selected

**Files:**
- Modify: `src/world.js:15-24` (the `World` constructor)
- Modify: `src/world.js` (add `_buildSteppe()` immediately after the existing `_build()` method, which ends at the line `  }` before `_mesh(builder) {` ~line 184)

- [ ] **Step 1: Dispatch the build on `mapId` in the constructor**

In `src/world.js`, find the constructor (lines 15-24):

```javascript
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
```

Replace with:

```javascript
  constructor(game) {
    this.game = game;
    this.scene = game.engine.scene;
    this.HALF = 70;
    this.boxes = [];
    this.spawns = [];
    this.lootSpots = [];
    this.mapId = (game.mapId === 'steppe') ? 'steppe' : 'arena';
    if (this.mapId === 'steppe') {
      this._buildSteppe();
    } else {
      this.scene.fog.near = 95; this.scene.fog.far = 640; // wider haze for the larger compound
      this._build();
    }
  }
```

- [ ] **Step 2: Add the `_buildSteppe()` method**

In `src/world.js`, immediately AFTER the closing `}` of `_build()` and BEFORE `_mesh(builder) {`, insert:

```javascript
  // Bare open-world scaffold (Phase 1): flat 500×500 steppe with an impassable
  // voxel mountain border. Districts/terrain/POIs land in later plans.
  _buildSteppe() {
    this.HALF = 250;
    const H = this.HALF;
    const rng = makeRNG(0x57E9);
    this.scene.fog.near = 120; this.scene.fog.far = 900; // open horizon

    // ground
    const g = new THREE.PlaneGeometry(H * 2 + 120, H * 2 + 120); g.rotateX(-Math.PI / 2);
    const gm = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x8a9152 })); // dry steppe
    gm.receiveShadow = true; this.scene.add(gm);

    // sparse ground detail
    const tb = new MeshBuilder();
    for (let i = 0; i < 220; i++) {
      const x = randRange(-H, H, rng), z = randRange(-H, H, rng), s = randRange(4, 12, rng);
      tb.box(s, 0.05, s, x, 0.03, z, shade(0x7c8a4e, randRange(-0.1, 0.06, rng)), { ry: randRange(0, TAU, rng) });
    }
    const tiles = new THREE.Mesh(tb.build(), voxelMaterial()); tiles.receiveShadow = true; this.scene.add(tiles);

    // mountain border (impassable: MH=26 >> step-up 0.62) + boulders, one merged mesh
    const mb = new MeshBuilder();
    const rock = 0x6a6258, rock2 = 0x534c43, MH = 26, t = 8, span = H * 2 + t * 2;
    this._solid(mb, span, MH, t, 0, MH / 2, -H - t / 2, rock, { tint: 0.06 });
    this._solid(mb, span, MH, t, 0, MH / 2,  H + t / 2, rock, { tint: 0.06 });
    this._solid(mb, t, MH, span, -H - t / 2, MH / 2, 0, rock, { tint: 0.06 });
    this._solid(mb, t, MH, span,  H + t / 2, MH / 2, 0, rock, { tint: 0.06 });
    for (let i = 0; i < 64; i++) { // jagged peaks (visual only — sit atop the impassable base)
      const edge = i % 4, f = randRange(-H, H, rng), peakH = randRange(8, 24, rng), pw = randRange(10, 28, rng);
      const x = edge < 2 ? f : (edge === 2 ? -H - t / 2 : H + t / 2);
      const z = edge < 2 ? (edge === 0 ? -H - t / 2 : H + t / 2) : f;
      mb.box(pw, peakH, pw, x, MH + peakH / 2 - 5, z, shade(rock2, randRange(-0.05, 0.05, rng)), { ry: randRange(0, TAU, rng), tint: 0.08 });
    }
    for (let i = 0; i < 24; i++) { // boulders on open ground (cover + collision sanity)
      const x = randRange(-H + 30, H - 30, rng), z = randRange(-H + 30, H - 30, rng);
      if (Math.hypot(x, z) < 25) continue; // keep the centre start clear
      const s = randRange(2.5, 5.5, rng);
      this._solid(mb, s, s, s, x, s / 2, z, shade(0x6f6a5e, randRange(-0.08, 0.06, rng)), { ry: randRange(0, TAU, rng), tint: 0.07 });
    }
    const rocks = new THREE.Mesh(mb.build(), voxelMaterial()); rocks.castShadow = true; rocks.receiveShadow = true; this.scene.add(rocks);

    // scaled spawn ring + open loot spots
    for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU; this.spawns.push(new THREE.Vector3(Math.cos(a) * (H - 12), 0, Math.sin(a) * (H - 12))); }
    this.lootSpots = [ new THREE.Vector3(0, 0, 30), new THREE.Vector3(40, 0, -40), new THREE.Vector3(-50, 0, 20), new THREE.Vector3(30, 0, 60), new THREE.Vector3(-40, 0, -50) ];
  }
```

- [ ] **Step 3: Verify the steppe builds and is bounded (in-browser)**

Open `http://localhost:8000/?map=steppe`, hard-reload, then in console:
```js
GAME.world.mapId          // 'steppe'
GAME.world.HALF           // 250
GAME.world.spawns.length  // 32
GAME.world.boxes.length   // 4 mountain walls + up to 24 boulders (≈ 20–28)
```
Then click **PLAY** (purge). Expected:
- You spawn on a large open green-tan plain with a jagged rocky mountain wall around the perimeter.
- Walk to any edge → you are stopped by the mountains (cannot climb/pass).
- Walk into a boulder → blocked (collision works).
- Enemies spawn from the perimeter and reach you (waves use `world.spawns`).
- Frame rate is smooth (bare map, few boxes).

- [ ] **Step 4: Verify the arena is unchanged (regression)**

Open `http://localhost:8000/` (no param), hard-reload, console:
```js
GAME.world.mapId  // 'arena'
GAME.world.HALF   // 70
```
Click PLAY → the original dust2 arena (buildings, crates) loads and plays exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/world.js
git commit -m "feat(map): add bare steppe scaffold (500x500, mountain border)"
```

---

## Self-Review

**Spec coverage (this plan = Phase 1 foundation slice):**
- ✅ 500×500 size / `HALF=250` — Task 2 `_buildSteppe`.
- ✅ Impassable mountain border (voxel, > step-up) — Task 2.
- ✅ Second selectable map, arena untouched — Tasks 1+2 (dispatch; default arena).
- ✅ Scaled spawns/lootSpots so waves+loot work — Task 2.
- ⏭ Districts, terrain (river/lake/forest), POIs, base, spatial grid, zone spawn, in-menu picker — explicitly deferred to later plans (Scope note).

**Placeholder scan:** none — every step has exact code/commands/expected output.

**Type/identifier consistency:** `this.mapId` set in `Game` (Task 1) and read in `World` constructor (Task 2). `_buildSteppe` uses only symbols already imported in `world.js:3` (`MeshBuilder`, `TAU`, `makeRNG`, `randRange`, `shade`, `voxelMaterial`) and the existing `this._solid(builder,w,h,d,x,y,z,color,opts)` helper (`world.js:26`). `spawns`/`lootSpots`/`boxes`/`HALF` shapes match existing consumers (`waves.js:115`, `loot.js:424`, `player.js` collide).

## Notes for the executor

- **Git:** start by branching off fresh `main` per CLAUDE.md (`git checkout main && git pull && git checkout -b feat/steppe-map-scaffold`). Do NOT work on `fix/tolo-boss-balance`.
- **Local cache:** hard-reload (Cmd/Ctrl+Shift+R) after each edit — a plain refresh can serve a stale `src/*.js` (CLAUDE.md).
- **Cache-bust at merge:** this map is opt-in (`?map=steppe`); default players are unaffected, but still do the cache-bust ritual (bump `index.html` `?v=N` + `GAME_BUILD`) when the branch merges to `main`, per CLAUDE.md.
- **Do not** re-add per-module `?v=` import params.
