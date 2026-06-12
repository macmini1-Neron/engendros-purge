# Forest Prop Destruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 10 static forest props from PR #50 destructible — wood burns/shoots apart, rock resists bullets and only yields to HE/AP — material-driven, co-op-safe, on `?map=demo`.

**Architecture:** Reuse the shipped destruction core (`src/destruct.js`: `MATERIALS`, `resolveHit`, `rayAABB`, `DebrisPool`) and mirror the trees' existing wired damage path in `src/forest.js`. Each prop registers a destructible part (`makePart`) + a collision/hit box carrying `prop:true` + a back-ref. The four damage paths the trees already use (small-arms via `weapons._destructHit`, HE via `forest.blast`, APFSDS via `forest.penetrate`, fire via `fire.js` + `forest.flammableParts`) each gain a small prop branch. Destruction is "consume in place" (hide mesh + remove collider + debris burst) — no per-prop physics body. Host-authoritative; the only synced bit is "this prop is gone" (`forestfx` k:`propdie`).

**Tech Stack:** Vanilla ES modules + Three.js r160; no build step. Pure core logic is node-tested (`node --test 'tests/**/*.test.mjs'`); THREE-bound wiring is verified in-browser against `window.GAME` on `?map=demo` (Playwright + console, the PR #50 method).

**Spec:** `docs/superpowers/specs/2026-06-12-prop-destruction-design.md`

> **Refinement vs spec (decided at plan time from reading the code):** the spec's §3 mapped logs/stumps to `dmat:'trunk'` (tier 2). But `fire.js:131` classifies any `trunk` part as fire `kind:'tree'`, whose char/burnout path (`charTree`/`fellTree`) assumes a *standing-tree* record and would break on a prop record. So **all deadwood uses `dmat:'wood'` (tier 1)** → fire `kind:'wood'`, never `'tree'`. Dead/rotten wood being tier 1 (a rifle splits it) is also thematically right. Rocks use the new `stone` (tier 4); `debris_treetangle` uses `grass` (tier 0). The spec's §4.1 "props are the first consumer of `DestructRuntime`" is **not** used: the shipped trees do *not* use `DestructRuntime` (they call `resolveHit`/`rayAABB` directly), so props mirror that proven path instead — simpler and consistent. Note this in the spec if it matters later.

---

## File Structure

- **`src/destruct.js`** — add the `stone` material to `MATERIALS` (pure, node-tested).
- **`src/forest.js`** — the bulk: per-prop `dmat` on `PROP_KINDS`; register part+box in `_ensureProps`; new prop-damage methods (`hitProp`/`destroyProp`/`consumeProp`/`destroyPropById`); prop loops inside `penetrate`/`blast`; `netSnapshot` adds dead props.
- **`src/weapons.js`** — one prop branch in `_destructHit`; pass the blast tier into `forest.blast`.
- **`src/fire.js`** — `_burnout` routes a prop-owner fire to `forest.consumeProp`.
- **`src/mp.js`** — `forestfx` handler gains a `propdie` case.
- **`tests/destruct/stone.test.mjs`** — new node test for the `stone` material behavior.
- **`index.html` + `src/game.js`** — cache-bust on finish.

---

## Task 1: Add the `stone` material (pure core)

**Files:**
- Modify: `src/destruct.js:75-84` (the `MATERIALS` object)
- Test: `tests/destruct/stone.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/destruct/stone.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, makePart, resolveHit, resolveBlast } from '../../src/destruct.js';

test('stone material exists, tier 4, never ignites', () => {
  const s = MATERIALS.stone;
  assert.ok(s, 'stone material is defined');
  assert.equal(s.tier, 4);
  assert.equal(s.fuel, 0);          // rock never burns
  assert.equal(s.debris, 'rubble');
});

test('a rifle (pen 1) only chips stone — no HP loss', () => {
  const part = makePart('rock1', 'stone', [0, 0, 0], [1, 1, 1]);
  const r = resolveHit(part, { pen: 1, dmg: 15 });
  assert.equal(r.effect, 'cosmetic');
  assert.equal(part.dead, false);
});

test('the default bazooka blast (tier 3) does NOT remove stone', () => {
  const part = makePart('rock2', 'stone', [0, 0, 0], [1, 1, 1]);
  const res = resolveBlast([part], [0.5, 0.5, 0.5], { r1: 3, r2: 6, tier: 3 });
  assert.equal(part.dead, false);              // tier 4 > blast tier 3
  assert.equal(res.killed.length, 0);
});

test('a tier-4 blast DOES crumble stone', () => {
  const part = makePart('rock3', 'stone', [0, 0, 0], [1, 1, 1]);
  const res = resolveBlast([part], [0.5, 0.5, 0.5], { r1: 3, r2: 6, tier: 4 });
  assert.equal(part.dead, true);
  assert.deepEqual(res.killed, ['rock3']);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `node --test tests/destruct/stone.test.mjs`
Expected: FAIL — `stone material is defined` assertion fails (MATERIALS.stone is undefined).

- [ ] **Step 3: Add the material**

In `src/destruct.js`, inside `MATERIALS` (after the `grass` line, before the closing `};` at line 84):

```js
  grass:      { tier: 0, hp: 1,    debris: 'splints', sound: 'grass',   fuel: 2  },
  stone:      { tier: 4, hp: 600,  debris: 'rubble',  sound: 'masonry', fuel: 0  },
```

(Insert the `stone` line; keep `grass` as-is.)

- [ ] **Step 4: Run the test, verify it passes**

Run: `node --test tests/destruct/stone.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the whole suite (no regression)**

Run: `node --test 'tests/**/*.test.mjs'`
Expected: all pass (was 343; now 347).

- [ ] **Step 6: Commit**

```bash
git add src/destruct.js tests/destruct/stone.test.mjs
git commit -m "feat(destruct): add stone material (tier 4, never ignites)"
```

---

## Task 2: Give each prop a material + register a destructible part & box

**Files:**
- Modify: `src/forest.js:74-85` (`PROP_KINDS`), `:100-103` (constructor fields), `:287-309` (`_ensureProps`)

- [ ] **Step 1: Add `dmat` + `hpScale` to every `PROP_KIND`**

Replace `PROP_KINDS` (`src/forest.js:74-85`) — drop the now-meaningless `solid` field, add `dmat`/`hpScale`:

```js
// Deadwood + rock scatter — props built from the modelgen registry, now DESTRUCTIBLE
// (material-driven, see docs/.../2026-06-12-prop-destruction-design.md). dmat drives behavior:
// wood (tier1) burns + shoots apart; grass (tier0) is the flammable tangle; stone (tier4) shrugs
// off bullets, yields only to HE/AP. Deadwood is 'wood' NOT 'trunk' so fire treats it as kind
// 'wood' (a 'trunk' part would ignite as kind 'tree' → charTree/fellTree on a non-tree record).
const PROP_KINDS = [
  { id: 'rock_boulder_lg',    n: 6,  jit: [0.85, 1.25], sink: 0.10, dmat: 'stone', hpScale: 1.0 },
  { id: 'rock_outcrop',       n: 5,  jit: [0.85, 1.25], sink: 0.12, dmat: 'stone', hpScale: 1.0 },
  { id: 'rock_boulder_mossy', n: 8,  jit: [0.80, 1.35], sink: 0.06, dmat: 'stone', hpScale: 1.0 },
  { id: 'rock_cluster_sm',    n: 10, jit: [0.80, 1.40], sink: 0.04, dmat: 'stone', hpScale: 1.0 },
  { id: 'stump_shattered',    n: 6,  jit: [0.85, 1.20], sink: 0.05, dmat: 'wood',  hpScale: 2.0 },
  { id: 'stump_cut',          n: 7,  jit: [0.85, 1.25], sink: 0.05, dmat: 'wood',  hpScale: 2.0 },
  { id: 'log_fallen',         n: 6,  jit: [0.90, 1.20], sink: 0.04, dmat: 'wood',  hpScale: 1.5 },
  { id: 'log_split',          n: 5,  jit: [0.90, 1.20], sink: 0.03, dmat: 'wood',  hpScale: 1.0 },
  { id: 'log_pile',           n: 3,  jit: [0.90, 1.15], sink: 0.03, dmat: 'wood',  hpScale: 1.5 },
  { id: 'debris_treetangle',  n: 4,  jit: [0.90, 1.20], sink: 0.02, dmat: 'grass', hpScale: 1.0 },
];
```

- [ ] **Step 2: Add a `_props` record array to the constructor**

In `src/forest.js`, the constructor (after `this._propObjs = [];` at line 101):

```js
    this._propObjs = [];       // placed prop Object3Ds (for cleanup parity with _instMeshes)
    this._props = [];          // destructible prop records { id, dmat, obj, box, part, pos, dead }
```

- [ ] **Step 3: Carry `dmat`/`hpScale` into the plan record**

In `_planProps` (`src/forest.js:277`), replace the `_propPlan.push(...)` line so the kind's material rides along:

```js
        this._propPlan.push({ id: kind.id, x, y: terr.terrainHeightAt(x, z) - kind.sink, z, yaw: rng() * TAU, scale, dmat: kind.dmat, hpScale: kind.hpScale });
```

- [ ] **Step 4: Register a destructible part + box for EVERY prop in `_ensureProps`**

Replace the body of the `for (const p of this._propPlan)` loop in `_ensureProps` (`src/forest.js:292-308`) — the `if (p.solid)` block becomes "register for all":

```js
    for (const p of this._propPlan) {
      let tmpl = templates.get(p.id);
      if (tmpl === undefined) { try { tmpl = buildSpec(getSpec(p.id)); } catch (e) { tmpl = null; console.warn(`[forest] prop build failed: ${p.id}`, e); } templates.set(p.id, tmpl); }
      if (!tmpl) continue;
      const o = tmpl.clone();   // shares geometry + material with the template
      o.position.set(p.x, p.y, p.z); o.rotation.y = p.yaw; o.scale.setScalar(p.scale);
      this.scene.add(o); this._propObjs.push(o);

      // destructible part + hit/collision box (every prop is shootable; the player's step-up
      // walks over the low ones). Ids come off the shared seeded counter → identical on co-op peers.
      const id = this._nextId++;
      const fp = tmpl.userData.footprint || [0.8, 0.8, 0.8];
      const hx = fp[0] * 0.5 * p.scale, hz = fp[2] * 0.5 * p.scale, top = p.y + fp[1] * p.scale;
      const min = [p.x - hx, p.y, p.z - hz], max = [p.x + hx, top, p.z + hz];
      const part = makePart(id, p.dmat, min, max, p.hpScale);
      const box = {
        min: new THREE.Vector3(min[0], min[1], min[2]),
        max: new THREE.Vector3(max[0], max[1], max[2]),
        dpart: id, dmat: p.dmat, prop: true,   // downer set below
      };
      const rec = { id, dmat: p.dmat, obj: o, box, part, pos: { x: p.x, y: p.y, z: p.z }, prop: true, dead: false };
      part.downer = rec; box.downer = rec;
      this.parts.push(part);        // ⇒ flammableParts() now includes wood/grass props
      this._props.push(rec);
      this.world.boxes.push(box); this.world.grid.addBox(box);
    }
```

- [ ] **Step 5: Verify in-browser (registration + flammability)**

Start a server in the worktree and drive the demo (the PR #50 method):

```bash
python3 -m http.server 8744 --directory "$(pwd)" >/tmp/pd_http.log 2>&1 &
```

Navigate Playwright to `http://localhost:8744/?map=demo&fly=1`, `GAME.startGame('purge')`, wait ~3 s, then evaluate:

```js
() => {
  const f = window.GAME.forest;
  return {
    props: f._props.length,                                  // expect 60
    boxesForProps: window.GAME.world.boxes.filter(b => b.prop).length,       // 60
    stone: f._props.filter(r => r.dmat === 'stone').length,  // 29 (the 4 rock kinds: 6+5+8+10)
    flammableProps: f.flammableParts().filter(p => p.downer && p.downer.prop).length, // 31 (27 wood + 4 grass)
  };
}
```

Expected: `props: 60`, `boxesForProps: 60`, `stone: 29`, `flammableProps: 31` (27 wood + 4 debris-grass; the 29 stone props are never flammable). Console errors: 0.

**Step-over fallback:** in the same session, teleport the player next to a low `log_fallen` and walk into it (or check `world.collide`); if a knee-high log blocks the player annoyingly, add `passable: true` to low-prop boxes (props whose `top - p.y < 0.6`) and have the player collision skip `box.passable` while raycast still hits it. Only do this if blocking is actually observed.

- [ ] **Step 6: Commit**

```bash
git add src/forest.js
git commit -m "feat(forest): register destructible part + box for every forest prop"
```

---

## Task 3: Prop-damage methods on `Forest`

**Files:**
- Modify: `src/forest.js` — add four methods next to `consumeGrass`/`fellTreeById` (around line 437-446)

- [ ] **Step 1: Add the methods**

In `src/forest.js`, immediately after `consumeGrassById(...)` (line 437):

```js
  // ── PROP destruction (mirrors the tree path; "consume in place", no FallingBody) ──────
  // A bullet resolved onto a prop part: pen<tier ⇒ cosmetic (caller already drew a chip);
  // else damage, and on death the prop is removed. `point`=[x,y,z] impact for the debris burst.
  hitProp(rec, weapon, point) {
    if (!rec || rec.dead || !rec.part || rec.part.dead) return null;
    const r = resolveHit(rec.part, weapon);
    if (r.killed) this.destroyProp(rec, point);
    else if (r.effect === 'damage' && this.debris) this.debris.burst(MATERIALS[rec.dmat].debris, point, (rec.id ^ 0x55) >>> 0);
    return r;
  }

  // Remove a prop: hide its mesh, drop its collider, burst material debris, broadcast to peers.
  // `at`=[x,y,z] for the debris burst (defaults to the prop centre, e.g. the client mirror path).
  destroyProp(rec, at = null) {
    if (!rec || rec.dead) return;
    rec.dead = true; if (rec.part) rec.part.dead = true;
    if (rec.obj) rec.obj.visible = false;
    if (rec.box) { this._removeBox(rec.box); rec.box = null; }
    const where = at || [rec.pos.x, rec.pos.y + 0.3, rec.pos.z];
    if (this.debris) this.debris.burst(MATERIALS[rec.dmat].debris, where, (rec.id * 2654435761) >>> 0);
    this._emitForest('propdie', rec.id);   // host-auth: one bit — "this prop is gone"
  }

  // Fire burned a wood/grass prop out → same removal (the char/ash flourish is cosmetic).
  consumeProp(rec) { this.destroyProp(rec); }

  // Client mirror of a host 'propdie' (idempotent; destroyProp guards on rec.dead; the host guard
  // in _emitForest stops a client echo).
  destroyPropById(id) { const rec = this._props.find(r => r.id === id); if (rec) this.destroyProp(rec); }
```

(`resolveHit` and `MATERIALS` are already imported at `src/forest.js:39`; `_removeBox` and `_emitForest` already exist.)

- [ ] **Step 2: Verify in-browser (programmatic destroy)**

With the demo running (server from Task 2), evaluate:

```js
() => {
  const f = window.GAME.forest, W = window.GAME.world;
  const before = W.boxes.length;
  const log = f._props.find(r => r.dmat === 'wood' && !r.dead);
  f.destroyProp(log, [log.pos.x, log.pos.y, log.pos.z]);
  return { dead: log.dead, hidden: log.obj.visible === false, boxRemoved: W.boxes.length === before - 1 };
}
```

Expected: `{ dead: true, hidden: true, boxRemoved: true }`, 0 console errors, and a debris puff at the spot.

- [ ] **Step 3: Commit**

```bash
git add src/forest.js
git commit -m "feat(forest): prop destruction methods (hitProp/destroyProp/consumeProp + co-op mirror)"
```

---

## Task 4: Wire small-arms, HE blast, APFSDS to props

**Files:**
- Modify: `src/weapons.js:1292-1302` (the `_destructHit` branch), `:1329` (the `_demoBlast` blast call)
- Modify: `src/forest.js` — `penetrate` (line 483) + `blast` (line 501) gain a prop loop

- [ ] **Step 1: Add the prop branch to `weapons._destructHit`**

In `src/weapons.js`, after the tree branch (the `} else if ((box.tree || box.dmat === 'trunk') && box.downer.part) { ... }` block ending at line 1302), add an `else if`:

```js
    } else if (box.prop && box.downer) {
      this.game.forest && this.game.forest.hitProp(box.downer, w, [wHit.point.x, wHit.point.y, wHit.point.z]);
      this.game.hud.hitmarker(false);
    }
```

(`_destructHit` already returns early when `!hostSim`, so this stays host-authoritative. `w` = `{ pen: PEN_BY_CLASS[d.class], dmg }` is already computed above.)

- [ ] **Step 2: Pass the blast tier into `forest.blast`**

In `src/weapons.js:1329` (`_demoBlast`), change the forest call to forward the blast tier:

```js
    if (this.game.forest && typeof this.game.forest.blast === 'function') this.game.forest.blast(pos, blast.r1 + 0.6, blast.tier);
```

- [ ] **Step 3: Prop loop in `forest.blast`**

In `src/forest.js`, change the `blast` signature + add a prop loop. Replace `blast(pos, radius) {` (line 501) header and append the prop loop before `return felled;`:

```js
  blast(pos, radius, blastTier = 3) {
    const r2 = radius * radius, felled = [];
    for (const tree of this.trees) {
      if (!tree.standing) continue;
      const dx = tree.pos.x - pos.x, dz = tree.pos.z - pos.z;
      if (dx * dx + dz * dz <= r2) {
        const n = Math.hypot(dx, dz) || 1;
        this.fellTree(tree, [dx / n, dz / n], (tree.id * 2654435761) >>> 0);
        felled.push(tree);
      }
    }
    // props: remove any whose material tier ≤ the blast tier within radius (stone tier4 survives
    // the default bazooka tier3 — only a stronger blast or AP takes it).
    for (const rec of this._props) {
      if (rec.dead) continue;
      const dx = rec.pos.x - pos.x, dz = rec.pos.z - pos.z;
      if (dx * dx + dz * dz <= r2 && MATERIALS[rec.dmat].tier <= blastTier) this.destroyProp(rec, [rec.pos.x, rec.pos.y, rec.pos.z]);
    }
    return felled;
  }
```

- [ ] **Step 4: Prop loop in `forest.penetrate` (APFSDS obliterates fragile props)**

In `src/forest.js`, in `penetrate` (line 483), append a prop loop before `return hits.length;`:

```js
    // APFSDS obliterates fragile props (tier ≤ 2: wood/grass) it pierces; stone (tier 4) is a
    // structural through-hole — left in place (cosmetic), consistent with resolvePenetration.
    for (const rec of this._props) {
      if (rec.dead || !rec.part) continue;
      if (MATERIALS[rec.dmat].tier > 2) continue;
      const t = rayAABB(o, dd, rec.part.min, rec.part.max);
      if (t !== null && t <= range) this.destroyProp(rec, [rec.pos.x, rec.pos.y + 0.3, rec.pos.z]);
    }
    return hits.length;
```

(`o`, `dd`, and `range` are already in scope from the tree loop above.)

- [ ] **Step 5: Verify in-browser (all three paths)**

With the demo running, in the browser:
- **Small-arms:** equip a rifle, aim at a `log_*` prop, fire several rounds → it bursts and disappears; aim at a `rock_*` → only chip decals, it stays. (Drive via `GAME.weapons` fire or position + `GAME.forest.hitProp` with a rifle weapon `{pen:1,dmg:15}` repeatedly to confirm a wood prop dies after ~4 hits and a stone prop never does.)
- **HE:** `GAME.forest.blast({x,y,z}, 6, 3)` centered on a mixed cluster → wood/grass props gone, stone props remain. Then `GAME.forest.blast(pos, 6, 4)` → stone also gone.
- **APFSDS:** `GAME.forest.penetrate(new THREE.Vector3(...), dir, 200, GAME... )` along a row of logs → all wood obliterated, stone left.

Evaluate counts before/after to confirm. Expected: 0 console errors; destroyed props' colliders removed (`world.boxes.filter(b=>b.prop).length` drops by the number destroyed).

- [ ] **Step 6: Commit**

```bash
git add src/weapons.js src/forest.js
git commit -m "feat(forest): wire small-arms/HE/APFSDS to forest props (material-gated)"
```

---

## Task 5: Fire consumes wood/grass props

**Files:**
- Modify: `src/fire.js:276-294` (the `_burnout` try block)

- [ ] **Step 1: Route a prop-owner fire to `consumeProp`**

In `src/fire.js`, in `_burnout`, make the **first** branch inside the `try` (before `if (f.kind === 'tree')` at line 277) handle props:

```js
    try {
      if (f.owner && f.owner.prop) {                          // a forest prop (log/stump/debris)
        const fr = this.game.forest;
        if (fr && typeof fr.consumeProp === 'function') fr.consumeProp(f.owner);
        else if (f.part) f.part.dead = true;
      } else if (f.kind === 'tree') {
        const fr = this.game.forest;
        if (fr) {
          if (!f.charDone) fr.charTree(f.owner);
          if (FELL_ON_BURNOUT && f.owner && f.owner.standing) fr.fellTree(f.owner, null, f.seed);
        }
      } else if (f.kind === 'grass') {
```

(Leave the rest of the `else if` chain unchanged. Wood props ignite as `kind:'wood'` per `fire.js:131`, so the `kind:'tree'` char step at line 252 never touches them — no change needed there. The `f.owner.prop` flag was set on the prop record in Task 2.)

- [ ] **Step 2: Verify in-browser (ignite → spread → consume)**

With the demo running:

```js
() => {
  const f = window.GAME.forest, fire = window.GAME.fire;
  const log = f._props.find(r => r.dmat === 'wood' && !r.dead);
  fire.ignite(log.part, 12345);                       // light it directly
  return { lit: !!log.part._fire, kind: fire.fires.find(x => x.part === log.part)?.kind };
}
```

Expected: `lit: true`, `kind: 'wood'` (NOT `'tree'`). Then wait ~`wood.fuel * SEC_PER_FUEL` seconds of game time and confirm the prop is consumed (`log.dead === true`, mesh hidden, collider gone) with **no** `charTree`/`fellTree` console error. Also light a tree near a deadwood prop and confirm fire **spreads** tree↔prop (the big atmospheric win). Confirm a `stone` prop never ignites (`fire.ignite(rockPart)` returns null — `fuel 0`).

- [ ] **Step 3: Commit**

```bash
git add src/fire.js
git commit -m "feat(fire): burn forest wood/grass props out → consumeProp (no fellTree on props)"
```

---

## Task 6: Co-op sync (host → client mirror + late join)

**Files:**
- Modify: `src/mp.js:647-650` (the `forestfx` handler)
- Modify: `src/forest.js` — `netSnapshot` (line 451) appends dead props

- [ ] **Step 1: Handle `propdie` on the client**

In `src/mp.js`, in the `forestfx` handler (lines 648-650), add a case:

```js
      if (d.k === 'fell') fr.fellTreeById(d.id, d.dx, d.dz, d.seed);
      else if (d.k === 'char') fr.charTreeById(d.id);
      else if (d.k === 'grass') fr.consumeGrassById(d.id);
      else if (d.k === 'propdie') fr.destroyPropById(d.id); });
```

- [ ] **Step 2: Late-join snapshot includes dead props**

In `src/forest.js`, in `netSnapshot` (line 451), append after the cover loop (before `return out;`):

```js
    for (const c of this.cover) if (c.dead) out.push({ k: 'grass', id: c.id });
    for (const r of this._props) if (r.dead) out.push({ k: 'propdie', id: r.id });
    return out;
```

(Fire on props needs no new path: prop parts are in `forest.flammableParts()`, so `fire.igniteById(id, 't', seed)` — `mp.js`/`fire.js` already resolve forest-owned ignitions — finds them. The `fireignite` owner tag is `'t'` for any `forest`-owned part.)

- [ ] **Step 3: Verify (logic review + solo no-regression)**

No 2-PC harness is required for the plan; verify by inspection that (a) the host emits exactly one `propfx`/`propdie` per destroyed prop via `_emitForest` (host-guarded), (b) `destroyPropById` is idempotent, (c) `netSnapshot` lists dead props. Then re-run the in-browser solo checks from Tasks 4-5 to confirm no regression and 0 console errors.

- [ ] **Step 4: Commit**

```bash
git add src/mp.js src/forest.js
git commit -m "feat(coop): sync forest prop destruction (propdie mirror + late-join snapshot)"
```

---

## Task 7: Full in-game verify + cache-bust + PR

**Files:**
- Modify: `index.html` (the entry `?v=`), `src/game.js` (`GAME_BUILD`)

- [ ] **Step 1: Run the whole node suite**

Run: `node --test 'tests/**/*.test.mjs'`
Expected: all pass (347).

- [ ] **Step 2: Full in-browser pass on `?map=demo`**

Drive Playwright through every path on a fresh `?map=demo&fly=1` boot (`GAME.startGame('purge')`, stop the wave, fly mode):
1. Ignite a wood prop → it burns + spreads to a neighbouring tree, then is consumed.
2. Rifle a `log_*` apart; confirm a `rock_*` only chips.
3. `forest.blast(pos, 6, 3)` a mixed cluster → wood gone, stone stays; `blast(pos, 6, 4)` → stone crumbles.
4. `forest.penetrate(...)` a row → wood obliterated, stone left.
5. After each: `world.boxes.filter(b=>b.prop).length` dropped by the count destroyed; **0 console errors**.

Capture one screenshot of a burned/blasted cluster for the PR.

- [ ] **Step 3: Cache-bust ritual (ships to players)**

In `index.html`, bump the entry version (currently `?v=260` on `main`; confirm with `grep 'game.js?v=' index.html` and bump by 1):

```html
  <script type="module" src="./src/game.js?v=261"></script>
```

In `src/game.js`, set `GAME_BUILD` to the current local minute (get it with `date '+%Y-%m-%d %H:%M'`):

```js
const GAME_BUILD = '2026-06-12 HH:MM';
```

- [ ] **Step 4: Commit + push + PR**

```bash
git add index.html src/game.js
git commit -m "chore: cache-bust v=261 for forest prop destruction"
git push -u origin feat/prop-destruction
gh pr create --base main --title "feat(forest): destructible forest props (burn/shoot/HE/APFSDS)" --body "<summary + the spec link + the screenshot>"
```

---

## Self-Review

**Spec coverage:**
- §2 decisions 1-4 (F1 / consume-in-place / `stone` / co-op) → Tasks 1-6. ✓
- §3 per-prop behavior table → Task 2 (`dmat` map, with the documented `trunk`→`wood` refinement) + Tasks 4-5 (paths). ✓
- §4.2 part+box registration → Task 2. ✓ §4.3 four damage paths → Tasks 4 (gun/HE/AP) + 5 (fire). ✓ §4.4 consume-in-place → Task 3 `destroyProp`. ✓ §4.5 fire → Task 5. ✓
- §5 co-op → Task 6. §6 performance (no new pool, shared debris, ~60 boxes) → inherent in the design; verified in Task 7. §7 testing → node test (Task 1) + in-browser (every task). ✓
- §4.1 `DestructRuntime` → consciously **not** used; refinement documented in the header. ✓

**Placeholder scan:** the PR `--body` in Task 7 Step 4 is the only `<...>` — it is filled at PR time from the spec + screenshot, standard. No TBD/TODO in code steps.

**Type consistency:** `rec` shape `{ id, dmat, obj, box, part, pos, prop, dead }` defined in Task 2 is used identically in Tasks 3-6. `box` carries `{ min, max, dpart, dmat, prop, downer }` (Task 2) and is read by `weapons._destructHit` via `box.prop`/`box.downer` (Task 4) ✓. `destroyProp(rec, at)` / `hitProp(rec, weapon, point)` / `consumeProp(rec)` / `destroyPropById(id)` signatures defined in Task 3 match every call site (Tasks 4-6) ✓. `forest.blast(pos, radius, blastTier)` (Task 4 Step 3) matches the `weapons` call (Task 4 Step 2) ✓.
