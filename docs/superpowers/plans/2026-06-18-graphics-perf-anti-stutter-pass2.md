# Anti-Stutter Pass #2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the remaining in-game frame hitches (runtime allocation, runtime mesh/material creation, first-fire shader compiles) under extreme load, reproduced and proven by a stress harness.

**Architecture:** Build a dev-only stress harness + objective hitch logger first (so we can measure), capture a before-baseline via a multi-agent headless sweep, then fix each offender at the root (pool / scratch-vector / pre-warm / clone-once-cache), and re-measure to prove the win. Performance only — behavior must be byte-identical.

**Tech Stack:** vanilla ES modules, Three.js r160, `node:test` for pure-logic units, isolated headless Chrome for integration measurement.

## Global Constraints

- **No build step / no bundler.** Bare unversioned imports between `src/*.js`. Browser parses native ES modules.
- **No gameplay/balance/visual change.** Every fix must be behavior-identical: same movement, same hit results, same timings, same visuals.
- **No co-op authority change.** Nothing touches `hostSim` / `pstate` / netcode. Pooling and pre-warm are local-render only.
- **Gameplay RNG stays on the unseeded helpers** (`rr`/`ri`/`pick` from `util.js`), never `Math.random()`/seeded `rng`.
- **Scratch-vector rule:** a module-level scratch vector may only be used within a single synchronous scope that does not call back into code using the same scratch, and must never be returned to or retained by a caller. Audit every replacement for aliasing.
- **Tests:** pure logic → `node --test tests/perf/<file>.test.mjs`. Integration fixes → stress-harness before/after + visual confirm (no unit test).
- **Cache-bust ritual on ship:** bump `index.html` entry `?v=N` (currently `300` → `301`) and `GAME_BUILD` in `src/game.js`. Done once at the end (Task 11), not per task.

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `src/hitch.js` | Create | Pure frame-hitch stats (`hitchStats`) + stateful `HitchLogger`. No THREE import. |
| `src/pool.js` | Create | Generic `RoundRobinPool` (acquire/release + token guard). No THREE import. |
| `src/stress.js` | Create | Dev-only stress scenarios + `GAME.stress()` wiring. Browser-only. |
| `tests/perf/hitch.test.mjs` | Create | Node tests for `hitchStats`. |
| `tests/perf/pool.test.mjs` | Create | Node tests for `RoundRobinPool`. |
| `src/game.js` | Modify | Wire `GAME.stress`/HitchLogger into `_frame`; call `enemyManager.prewarm()` at world build; gate harness behind `?stress`/console. |
| `src/player.js` | Modify | Scratch vectors in `update` + `_freecamUpdate` (`:135-138`, `:190-198`). |
| `src/aircraft.js` | Modify | Clone-once cache of the runtime IL-76 instance (`buildIl76AirdropModel`/`cloneForRuntime`). |
| `src/enemies.js` | Modify | Boss pre-warm + `renderer.compile`; pool `_beam`/bolt/sweep meshes; courier pre-build; hot-loop + raycast-hit scratch. |
| `src/mortar.js` | Modify | Pool shell/trace/ring meshes (`:282-327`). |
| `src/waves.js` | Modify | Spawn-position scratch (`:128,134`). |
| `src/weapons.js` | Modify | Projectile hot-loop scratch (`:1785-1809`). |
| `src/loot.js` | Modify | Cache supply crate/chute geometry+material; pool flame mesh; batch projectile dispose. |
| `src/engine.js` | Modify | Add `prewarmCompile(objs)` helper that adds hidden + `renderer.compile`. |
| `index.html` | Modify | Cache-bust `?v=301` (Task 11). |

**Milestones (orchestrator-run, not implementer tasks):**
- **Milestone A** — after Task 3: run the multi-agent **before-baseline** sweep, store per-scenario hitch reports.
- **Milestone B** — after Task 10: run the **after** sweep, diff vs A, adversarial regression check, then Task 11 ships.

---

### Task 1: Pure hitch stats + HitchLogger (`src/hitch.js`)

**Files:**
- Create: `src/hitch.js`
- Test: `tests/perf/hitch.test.mjs`

**Interfaces:**
- Produces: `hitchStats(samplesMs: number[]) -> { count, worstMs, p99Ms, hitches50, hitches100 }`; `class HitchLogger { reset(); sample(ms, cause?); report() -> {…stats, causes: Record<string,number>} }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/perf/hitch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { hitchStats, HitchLogger } from '../../src/hitch.js';

test('hitchStats counts hitches and worst/p99', () => {
  const s = hitchStats([10, 12, 11, 60, 9, 120, 13]);
  assert.equal(s.count, 7);
  assert.equal(s.worstMs, 120);
  assert.equal(s.hitches50, 2);   // 60 and 120
  assert.equal(s.hitches100, 1);  // 120
  assert.ok(s.p99Ms >= 60 && s.p99Ms <= 120);
});

test('hitchStats handles empty input', () => {
  const s = hitchStats([]);
  assert.equal(s.count, 0);
  assert.equal(s.worstMs, 0);
  assert.equal(s.hitches50, 0);
});

test('HitchLogger tags causes and aggregates', () => {
  const log = new HitchLogger();
  log.sample(10); log.sample(70, 'boss-fire'); log.sample(200, 'drop-build');
  const r = log.report();
  assert.equal(r.worstMs, 200);
  assert.equal(r.hitches50, 2);
  assert.equal(r.causes['drop-build'], 1);
  assert.equal(r.causes['boss-fire'], 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/perf/hitch.test.mjs`
Expected: FAIL — `Cannot find module '../../src/hitch.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/hitch.js — pure frame-hitch metrics. No THREE, node-testable.
export function hitchStats(samplesMs) {
  const n = samplesMs.length;
  if (!n) return { count: 0, worstMs: 0, p99Ms: 0, hitches50: 0, hitches100: 0 };
  let worst = 0, h50 = 0, h100 = 0;
  for (const ms of samplesMs) {
    if (ms > worst) worst = ms;
    if (ms > 50) h50++;
    if (ms > 100) h100++;
  }
  const sorted = samplesMs.slice().sort((a, b) => a - b);
  const p99 = sorted[Math.min(n - 1, Math.floor(n * 0.99))];
  return { count: n, worstMs: worst, p99Ms: p99, hitches50: h50, hitches100: h100 };
}

export class HitchLogger {
  constructor() { this.reset(); }
  reset() { this._samples = []; this._causes = {}; this._tag = null; }
  // tag the next sampled frame(s) with a cause label (cleared by clearTag)
  setCause(tag) { this._tag = tag; }
  clearCause() { this._tag = null; }
  sample(ms, cause = this._tag) {
    this._samples.push(ms);
    if (cause && ms > 50) this._causes[cause] = (this._causes[cause] || 0) + 1;
  }
  report() { return { ...hitchStats(this._samples), causes: { ...this._causes } }; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/perf/hitch.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hitch.js tests/perf/hitch.test.mjs
git commit -m "feat(perf): pure frame-hitch stats + HitchLogger"
```

---

### Task 2: Generic round-robin pool (`src/pool.js`)

**Files:**
- Create: `src/pool.js`
- Test: `tests/perf/pool.test.mjs`

**Interfaces:**
- Produces: `class RoundRobinPool { constructor(size, factory); acquire() -> { obj, tok }; release(handle); isStale(handle) -> bool }`. `factory(i)` builds element `i` once at construction. `acquire()` reuses the oldest slot round-robin; `release()` only frees if the token still matches (guards a late release from freeing a newer owner's slot — same idiom as the FX light pool in `engine.js`).

- [ ] **Step 1: Write the failing test**

```js
// tests/perf/pool.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RoundRobinPool } from '../../src/pool.js';

test('factory runs once per slot at construction, never again', () => {
  let built = 0;
  const p = new RoundRobinPool(3, () => ({ id: built++ }));
  assert.equal(built, 3);
  for (let i = 0; i < 10; i++) p.acquire();
  assert.equal(built, 3); // no new allocation on acquire
});

test('round-robin reuses oldest slot', () => {
  const p = new RoundRobinPool(2, (i) => ({ i }));
  const a = p.acquire(); const b = p.acquire(); const c = p.acquire();
  assert.equal(a.obj, c.obj); // 3rd acquire wraps to slot 0
  assert.notEqual(a.obj, b.obj);
});

test('stale release does not free a re-acquired slot', () => {
  const p = new RoundRobinPool(1, () => ({}));
  const first = p.acquire();
  const second = p.acquire();      // same slot, new token → invalidates `first`
  assert.equal(p.isStale(first), true);
  assert.equal(p.isStale(second), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/perf/pool.test.mjs`
Expected: FAIL — `Cannot find module '../../src/pool.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/pool.js — generic round-robin object pool with token guard. No THREE, node-testable.
export class RoundRobinPool {
  constructor(size, factory) {
    this._objs = [];
    this._tok = new Array(size).fill(0);
    this._next = 0;
    for (let i = 0; i < size; i++) this._objs.push(factory(i));
  }
  acquire() {
    const i = this._next;
    this._next = (this._next + 1) % this._objs.length;
    this._tok[i]++;
    return { obj: this._objs[i], tok: this._tok[i], _i: i };
  }
  isStale(handle) { return !handle || this._tok[handle._i] !== handle.tok; }
  release(handle) { /* token-guarded no-op marker; callers hide the obj themselves */ return !this.isStale(handle); }
  get size() { return this._objs.length; }
  forEach(fn) { this._objs.forEach(fn); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/perf/pool.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pool.js tests/perf/pool.test.mjs
git commit -m "feat(perf): generic round-robin pool with token guard"
```

---

### Task 3: Stress harness + HitchLogger wired into the frame loop

**Files:**
- Create: `src/stress.js`
- Modify: `src/game.js` (import HitchLogger + stress; sample frame ms in `_frame`; expose `GAME.stress`, `GAME._hitchReport`; gate behind `?stress` or always-define console method)

**Interfaces:**
- Consumes: `HitchLogger` (Task 1).
- Produces: `installStress(game)` → defines `game.stress(name, opts)` and `game.hitch` (a `HitchLogger`). Scenario names: `'tolo5' | 'airdrop' | 'airfield_airdrop' | 'waveburst' | 'mortar' | 'molotov' | 'worstcase'`. `game.stress(name)` sets up world state then runs ~N seconds of frames, then `console.table(game.hitch.report())` and stores `game._hitchReport`.

- [ ] **Step 1: Implement `src/stress.js`**

Scenarios drive existing systems (no new gameplay). Each returns after setup; the running `_frame` loop + HitchLogger do the measuring. Pseudocode-accurate skeleton — fill the spawn calls against the real APIs (`waves.startWave`, `enemies.spawnBoss`/`forceBoss`, `loot.callSupplyDrop`, weapon fire) discovered while implementing:

```js
// src/stress.js — DEV-ONLY stress scenarios. Imported by game.js; gated, never auto-runs.
export function installStress(game) {
  const tp = (x, z) => { game.player.pos.set(x, game.world.groundY(x, z) + 1.7, z); };
  const SC = {
    tolo5() { for (let i = 0; i < 5; i++) game.enemies.spawnBossAt(-20 + i * 10, 40, 'boss'); },
    airdrop() { game.loot.callSupplyDrop?.(); },
    airfield_airdrop() { tp(120, -140); game.loot.callSupplyDrop?.(); },
    waveburst() { game.waves.startWave?.(12); game.waves._spawnBudget = 999; },
    mortar() { game._stressFire = { kind: 'mortar', n: 40 }; },
    molotov() { game._stressFire = { kind: 'molotov', n: 30 }; },
    worstcase() { tp(120, -140); SC.tolo5(); game.loot.callSupplyDrop?.(); game._stressFire = { kind: 'molotov', n: 20 }; },
  };
  game.stress = (name, { seconds = 12 } = {}) => {
    if (!SC[name]) { console.warn('[stress] unknown scenario', name, Object.keys(SC)); return; }
    game.hitch.reset();
    game._stressUntil = (game._tNow || 0) + seconds;
    game._stressName = name;
    SC[name]();
    console.log(`[stress] running "${name}" for ${seconds}s…`);
  };
}
```

- [ ] **Step 2: Wire into `game.js`**

At top: `import { HitchLogger } from './hitch.js'; import { installStress } from './stress.js';`
In the `Game` constructor (after subsystems exist): `this.hitch = new HitchLogger(); installStress(this);`
In `_frame(t)`, after computing the smoothed `_frameMs` for the frame, sample it and finalize when the window ends:

```js
// inside _frame, once per frame, after _frameMs is updated:
if (this._stressName) {
  this.hitch.setCause(this._stressCause || this._stressName);
  this.hitch.sample(this._frameMs);
  this._stressCause = null;
  if (this._tNow >= this._stressUntil) {
    this._hitchReport = this.hitch.report();
    console.table([this._hitchReport]);
    this._stressName = null;
  }
}
```

(Set `this._stressCause = 'boss-fire' | 'drop-build' | 'spawn'` at the relevant call sites in later tasks so hitches get attributed; optional but cheap — a single string assignment.)

- [ ] **Step 3: Verify in headless Chrome**

Serve via a no-store server on a fresh port, load `http://localhost:<port>/?stress`, then in console:
```js
GAME.startGame('purge'); GAME.stress('airdrop', { seconds: 8 });
// wait 8s
GAME._hitchReport   // → { worstMs, p99Ms, hitches50, hitches100, causes }
```
Expected: a populated report object, 0 console errors. (This run is also the first half of the BEFORE baseline.)

- [ ] **Step 4: Commit**

```bash
git add src/stress.js src/game.js
git commit -m "feat(perf): dev stress harness + hitch logging in frame loop"
```

> **Milestone A (orchestrator):** run the multi-agent before-baseline sweep now (all 7 scenarios, isolated headless Chrome each), store reports as the pre-fix baseline. See "Verification Workflow" at the end.

---

### Task 4: Player movement scratch vectors (`src/player.js`)

**Files:**
- Modify: `src/player.js:135-138` (`_freecamUpdate`) and `src/player.js:190-198` (`update`)

**Interfaces:**
- Produces: no API change. Internal: module-level `_pFwd`, `_pRight`, `_pMove` scratch `THREE.Vector3` reused each frame. Safe because `player.update`/`_freecamUpdate` run once per frame on the local player only and never re-enter.

- [ ] **Step 1: Add module-level scratch near the top of `player.js`** (after imports)

```js
const _pFwd = new THREE.Vector3();
const _pRight = new THREE.Vector3();
const _pMove = new THREE.Vector3();
```

- [ ] **Step 2: Replace the freecam allocations (`:135-138`)**

Before:
```js
const fwd = new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
const boost = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
const move = new THREE.Vector3().addScaledVector(fwd, input.forward).addScaledVector(right, input.strafe);
```
After:
```js
const fwd = _pFwd.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
const right = _pRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
const boost = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
const move = _pMove.set(0, 0, 0).addScaledVector(fwd, input.forward).addScaledVector(right, input.strafe);
```

- [ ] **Step 3: Replace the walk allocations (`:190-198`)**

Before:
```js
const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
...
const wish = controlsPaused ? new THREE.Vector3() : new THREE.Vector3().addScaledVector(fwd, input.forward).addScaledVector(right, input.strafe);
```
After:
```js
const fwd = _pFwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
const right = _pRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
...
const wish = _pMove.set(0, 0, 0);
if (!controlsPaused) wish.addScaledVector(fwd, input.forward).addScaledVector(right, input.strafe);
```

- [ ] **Step 4: Verify — movement identical**

Headless: `GAME.startGame('purge')`, walk WASD + sprint + freecam (`N`), confirm camera/position respond exactly as before, no console errors. (No unit test — movement is integration; aliasing check: `_pFwd`/`_pRight`/`_pMove` are not retained anywhere.)

- [ ] **Step 5: Commit**

```bash
git add src/player.js
git commit -m "perf(player): reuse scratch vectors in movement (kill per-frame Vector3 alloc)"
```

---

### Task 5: IL-76 clone-once cache (`src/aircraft.js`)

**Files:**
- Modify: `src/aircraft.js:75-81` (`buildIl76AirdropModel`)

**Interfaces:**
- Produces: `buildIl76AirdropModel()` returns a **cached** runtime instance after the first build; subsequent calls reset its transform/visibility and return the same object. An in-use guard falls back to a fresh clone if the cached instance is still parented (concurrent drops are not currently possible, but the guard keeps correctness).

- [ ] **Step 1: Add a module-level cache field** (near `_il76Source` at `:12`)

```js
let _il76Runtime = null;
```

- [ ] **Step 2: Cache-once in `buildIl76AirdropModel`**

Before:
```js
export function buildIl76AirdropModel() {
  if (!_il76Source) return null;
  const root = cloneForRuntime(_il76Source);
  root.name = 'IL-76 airdrop aircraft';
  ...
```
After:
```js
export function buildIl76AirdropModel() {
  if (!_il76Source) return null;
  // Reuse the one runtime instance — airdrops are never concurrent. clone(true) of the
  // multi-mesh GLB (+ per-mesh geo/material clone) was a multi-ms stall on every drop.
  if (_il76Runtime && !_il76Runtime.parent) {
    _il76Runtime.position.set(0, 0, 0); _il76Runtime.rotation.set(0, 0, 0);
    _il76Runtime.scale.setScalar(1); _il76Runtime.visible = true;
    fitIl76(_il76Runtime);
    return _il76Runtime;
  }
  if (_il76Runtime) { /* still parented → rare concurrent drop, fall through to a fresh clone */ }
  const root = cloneForRuntime(_il76Source);
  root.name = 'IL-76 airdrop aircraft';
  ...
  // (existing body builds contrailPorts etc.)
```
At the end of the function, before `return root;`, cache the first build:
```js
  if (!_il76Runtime) _il76Runtime = root;
  return root;
```

- [ ] **Step 3: Verify — airdrop twice, no error, no 2nd-drop stutter**

Headless: `GAME.stress('airdrop', {seconds: 10})`, then call the airdrop again. Confirm the IL-76 appears both times, contrails fire from the nacelles (not random parts), and the second drop's hitch report shows no `drop-build` hitch. 0 console errors.

- [ ] **Step 4: Commit**

```bash
git add src/aircraft.js
git commit -m "perf(aircraft): cache the runtime IL-76 instance (kill per-drop clone stall)"
```

---

### Task 6: Boss pre-warm + beam/bolt/sweep pooling + courier pre-build (`src/enemies.js`, `src/engine.js`)

**Files:**
- Modify: `src/engine.js` — add `prewarmCompile(objs)`.
- Modify: `src/enemies.js` — `prewarm()` builds boss attack meshes + courier template hidden & pre-compiles; `_beam`/bolt/sweep use the pre-built meshes instead of lazy `new Mesh` + `scene.add` mid-fight.
- Modify: `src/game.js` — call `this.enemies.prewarm()` once after world build / first run start.

**Interfaces:**
- Consumes: `RoundRobinPool` (Task 2) for bolts.
- Produces: `Engine.prewarmCompile(objs: Object3D[])` adds each hidden to the scene and calls `renderer.compile(scene, camera)` so their shader programs exist before first render. `EnemyManager.prewarm()` — idempotent, builds `_beam`, sweep mesh, a bolt pool, and the courier-pack template, then calls `prewarmCompile`.

- [ ] **Step 1: Add `prewarmCompile` to `engine.js`**

```js
// Engine method — force shader-program compilation now so first use mid-game doesn't hitch.
prewarmCompile(objs) {
  for (const o of objs) { o.visible = false; this.scene.add(o); }
  this.renderer.compile(this.scene, this.camera);
}
```

- [ ] **Step 2: Add `EnemyManager.prewarm()`** (build the meshes that were lazily created at `enemies.js:452-454` etc.)

```js
prewarm() {
  if (this._prewarmed) return;
  this._prewarmed = true;
  // Boss beam (was lazily built on first laser → first-fire compile mid-fight)
  this._warmBeam = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xff2436, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  this._warmBeam.renderOrder = 998;
  // Bolt pool (was new Mesh per shot)
  const boltGeo = this._boltGeo || (this._boltGeo = new THREE.SphereGeometry(0.18, 8, 6));
  const boltMat = this._boltMat || (this._boltMat = new THREE.MeshBasicMaterial({ color: 0xff3b2e, fog: false }));
  this._boltPool = new RoundRobinPool(20, () => { const m = new THREE.Mesh(boltGeo, boltMat); m.visible = false; this.game.engine.scene.add(m); return m; });
  // Courier pack template (was MeshBuilder on first courier spawn)
  this._courierTemplate = buildCourierPack(); // extract the existing inline build into a helper
  this.game.engine.prewarmCompile([this._warmBeam, this._courierTemplate]);
}
```

- [ ] **Step 3: Repoint the lazy sites to the pre-built meshes**

At `enemies.js:452`, replace the lazy `if (!e._beam) { e._beam = new THREE.Mesh(...); scene.add }` with assigning the shared `this._warmBeam` (single boss beam is fine; if multiple bosses need simultaneous beams, give `_warmBeam` its own small pool — `tolo5` will exercise this, so use a 5-slot beam pool). Bolts: replace `new THREE.Mesh(...)` per shot with `this._boltPool.acquire()` + reset position/visible. Courier: clone `this._courierTemplate` instead of building a fresh `MeshBuilder`.

- [ ] **Step 4: Call `prewarm()` from game.js** after the world + enemy manager exist (e.g. end of world build or first `startGame`).

- [ ] **Step 5: Verify — boss attacks, no first-fire hitch**

Headless: `GAME.stress('tolo5', {seconds: 12})`. Confirm 5 Tolos spawn, all fire beams/bolts, visuals identical, and the report shows **no** `boss-fire` hitch on the first salvo. 0 console errors.

- [ ] **Step 6: Commit**

```bash
git add src/engine.js src/enemies.js src/game.js
git commit -m "perf(boss): pre-warm + pool beam/bolt/courier meshes (kill first-fire compile hitch)"
```

---

### Task 7: Hot-loop + raycast scratch vectors (`src/enemies.js`, `src/weapons.js`)

**Files:**
- Modify: `src/enemies.js` (sweep dmg `.clone()`, ghost sweep per-frame `new Vector3`, `rayHit` hit-point `new Vector3` ~`:808`)
- Modify: `src/weapons.js:1785-1809` (projectile position `.clone()` calls)

**Interfaces:**
- Produces: no API change. Module-level scratch `THREE.Vector3` in each file (`_eV0`, `_eV1` in enemies.js; `_wV0`, `_wV1` in weapons.js). **Aliasing audit required:** `rayHit` currently returns a fresh `Vector3` to its caller — if callers retain it, return a plain `{x,y,z}` or a caller-owned out-param instead of a shared scratch. Check each call site before switching.

- [ ] **Step 1: Add module-level scratch vectors** at the top of each file.

- [ ] **Step 2: Replace `.clone()`/`new Vector3` in the per-frame/per-hit loops** with `_scratch.copy(src)` or `_scratch.set(x,y,z)`, EXCEPT where the value escapes the scope.

- [ ] **Step 3: For `rayHit`'s returned point** — verify callers don't retain it. If any do, return `{ x, y, z }` (plain object) and update those callers; otherwise use a per-call scratch.

- [ ] **Step 4: Verify — combat identical**

Headless: `GAME.stress('waveburst')` + fire weapons + a Tolo sweep. Confirm hits register at the same positions (spot-check damage numbers/decals), sweep damages the same enemies, 0 console errors.

- [ ] **Step 5: Commit**

```bash
git add src/enemies.js src/weapons.js
git commit -m "perf(combat): scratch vectors in sweep/raycast/projectile hot loops"
```

---

### Task 8: Mortar shell/trace/ring pooling (`src/mortar.js`)

**Files:**
- Modify: `src/mortar.js:282-327`

**Interfaces:**
- Consumes: `RoundRobinPool` (Task 2).
- Produces: shared cached `CylinderGeometry`/`RingGeometry` + `LineBasicMaterial`, and a small shell pool; firing acquires a pooled shell instead of `new …Geometry`/`new Mesh` per shot.

- [ ] **Step 1: Hoist the per-shot geometry/material to module scope** (build once):

```js
const _shellGeo = new THREE.CylinderGeometry(SHELL_R * 0.6, SHELL_R, 0.16, 8);
const _ringGeo = new THREE.RingGeometry(0.5, BAL.HE_RADIUS, 28);
const _shellMat = /* read the real shell color/material from mortar.js:282 and reuse it verbatim */ null;
```

- [ ] **Step 2: Replace per-shell `new Mesh(new Geometry…)`** with pooled shell meshes (reuse the cached geo/mat). Trace `Line` and impact `Ring` likewise reuse a small pool, reset points/opacity on acquire.

- [ ] **Step 3: Verify** — `GAME.stress('mortar')`: 40 shells fire, arcs + impact rings render identically, no console error, report shows no per-shell hitch.

- [ ] **Step 4: Commit**

```bash
git add src/mortar.js
git commit -m "perf(mortar): pool shell/trace/ring meshes (kill per-shot geometry alloc)"
```

---

### Task 9: Wave spawn-position scratch (`src/waves.js`)

**Files:**
- Modify: `src/waves.js:128,134` (`_spawnPos`)

**Interfaces:**
- Produces: `_spawnPos` reuses a module-level scratch `THREE.Vector3`. **Aliasing audit:** the spawn code copies the position into the enemy (`enemy.pos.copy(...)`/`set`), so a shared scratch is safe — confirm the returned vector is consumed immediately and not stored.

- [ ] **Step 1:** Add `const _spawnV = new THREE.Vector3();` at module scope.
- [ ] **Step 2:** Replace `new THREE.Vector3(x, sy, z)` with `_spawnV.set(x, sy, z)` after verifying the caller copies it.
- [ ] **Step 3: Verify** — `GAME.stress('waveburst')`: enemies spawn at the same positions, no console error.
- [ ] **Step 4: Commit**

```bash
git add src/waves.js
git commit -m "perf(waves): reuse scratch spawn vector"
```

---

### Task 10: Supply crate/chute/flame cache + pool + dispose batching (`src/loot.js`)

**Files:**
- Modify: `src/loot.js` (supply crate/chute/flame build ~`:506-521`; projectile/effect `.dispose()` bursts)

**Interfaces:**
- Produces: cached crate/chute geometry+material built once; a small flame-mesh pool; disposals of many objects in one frame deferred/batched across frames.

- [ ] **Step 1:** Cache the crate + chute geometry/material at module scope (build once, reuse per drop).
- [ ] **Step 2:** Pool the flame sphere mesh (reuse 4-6) instead of `new Mesh(new SphereGeometry…)` per drop.
- [ ] **Step 3:** If many objects dispose in one frame, push them to a `_disposeQueue` drained a few per frame.
- [ ] **Step 4: Verify** — `GAME.stress('airfield_airdrop')`: crate + chute + flame render identically across repeated drops, no console error.
- [ ] **Step 5: Commit**

```bash
git add src/loot.js
git commit -m "perf(loot): cache supply crate/chute, pool flame, batch dispose"
```

> **Milestone B (orchestrator):** run the multi-agent AFTER sweep (same 7 scenarios), diff vs Milestone A, run adversarial regression check. Proceed to Task 11 only if success criteria met.

---

### Task 11: Verify success criteria, cache-bust, open PR

**Files:**
- Modify: `index.html` (`?v=300` → `?v=301`), `src/game.js` (`GAME_BUILD` → current minute)

- [ ] **Step 1: Confirm success criteria from Milestone B** — `worstcase`: no frame > 100 ms during boss salvos + airdrop; ≥ 60% fewer > 50 ms hitches vs baseline; every scenario ≤ baseline; 0 console errors; visuals unchanged.
- [ ] **Step 2: Run all node tests** — `node --test tests/perf/` → all pass.
- [ ] **Step 3: Cache-bust** — bump `index.html` entry `?v=301` and `GAME_BUILD`.
- [ ] **Step 4: Commit + push + PR**

```bash
git add index.html src/game.js
git commit -m "chore(perf): cache-bust v301 — anti-stutter pass #2"
git push -u origin perf/anti-stutter-pass-2
gh pr create --title "perf: anti-stutter pass #2 — pooling, scratch vectors, boss pre-warm" --body "<before/after hitch table from Milestones A/B>"
```

---

## Deferred during execution (low value × untestable / dispose-coupled)

- **Task 8 (mortar shell/trace/ring pooling) — DEFERRED.** The mortar is a niche crewed co-op weapon
  (`?map=steppe`); the stress harness can't fire it headlessly, so a pooling change can't be verified
  here. Crucially, shells **dispose** their geo/material on detonation (`mortar.js:335-336`, `:140`,
  `:172`), so caching shared geo/material would require a pooling + dispose-skip guard across all three
  sites — non-trivial work in an unverifiable, rarely-hit path. Low value (only while actively firing
  the mortar). Revisit if mortar spam is ever reported as a hitch.
- **Task 10 (loot crate/chute/flame cache + dispose batch) — DEFERRED.** Drops **dispose** all their
  geo/material on collection/expiry (`_disposeDrop`, `loot.js:575`), so sharing cached geo/material
  needs the same dispose-skip coordination as the IL-76. The crate/chute/flame are small `MeshBuilder`
  builds, and the **real** airdrop hitch — the multi-mesh IL-76 `clone(true)` — is already fixed
  (Task 5). Low residual value for real dispose-coordination risk. Revisit only if repeated drops show
  a measurable residual spike after Task 5.

Net: the shipped fixes are the high-value, headless-verifiable ones (harness, player scratch, IL-76
cache, boss/nav pre-warm, wave-spawn scratch, non-boss hitPoint clones). The two deferred tasks are
dispose-coupled and untestable in this harness.

## Verification Workflow (orchestrator — Milestones A & B)

A `Workflow` run, one agent per scenario, each in an **isolated** headless Chrome (own port + profile + swiftshader — shared procs steal ports, per the headless-verify recipe). Each agent:
1. starts a no-store server on a unique port serving the worktree,
2. launches isolated Chrome, loads `/?stress`, `GAME.startGame('purge')`,
3. runs its scenario `GAME.stress(name, {seconds: 12})`, waits, reads `GAME._hitchReport`,
4. returns the report as structured JSON `{ scenario, worstMs, p99Ms, hitches50, hitches100, causes, consoleErrors }`.

Run once on the pre-fix commit (Milestone A) and once on the post-fix commit (Milestone B); a final verify-agent diffs them per scenario and flags any non-improvement, any new console error, or any visual/behavior regression (adversarial). Manual gate: owner plays `worstcase` in-browser.

## Self-Review

- **Spec coverage:** harness + hitch logger (Task 1-3) ✓; IL-76 (Task 5) ✓; player vectors (Task 4) ✓; mortar (Task 8) ✓; boss pre-warm/bolts/courier (Task 6) ✓; hot-loop/raycast scratch (Task 7) ✓; wave spawn (Task 9) ✓; loot crate/chute/flame/dispose (Task 10) ✓; multi-agent before/after verify (Milestones A/B + Workflow section) ✓; success criteria + cache-bust + PR (Task 11) ✓.
- **Placeholders:** the Task 3 scenario skeleton and Task 6/7/8/10 repoint steps reference real APIs that must be confirmed against the live files during implementation (the exact spawn/fire method names) — flagged inline, not hidden. `_shellMat` in Task 8 Step 1 is an explicit `null` placeholder — read the real shell material/color from `mortar.js:282` and reuse it verbatim when implementing.
- **Type consistency:** `HitchLogger`, `RoundRobinPool`, `prewarmCompile`, `prewarm` names used consistently across tasks.
