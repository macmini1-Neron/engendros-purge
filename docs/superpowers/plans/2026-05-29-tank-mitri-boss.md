# T-90M «MITRI» Tank Boss — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second boss — a real T-90M tank piloted by the Engendros «Mitri» — with two defeat outcomes (explosives → permanent wreck obstacle; kill the commander → a drivable, capturable tank), reactive-armor weak points, smart obstacle-aware AI, a full mechanical rig, and a 2-player-ready crew system (driver periscope + gunner thermal sight).

**Architecture:** All gameplay lives in the single orchestrator `src/game.js` (Three.js r160, ES modules, no build step). The tank is an `Enemy` of type `'tank'` (flags `boss:true, tank:true, armored:true`) that branches to a new `_bossTank()` behavior parallel to the extracted `_bossTolo()`. Damage routes through the single chokepoint `EnemyManager.damage(e, amount, source, hitPoint)` into two pools. Capture spawns a new `CapturedTank` vehicle class modeled on the existing `MountedGun`. HUD/CSS live in `index.html`.

**Tech Stack:** Three.js r160 (`vendor/three.module.min.js`), the project's `MeshBuilder`/`voxelMaterial` helpers, procedural `AudioManager`, `Effects` particle system, `World` AABB collision + `world.rayHit`, `DayNight` lighting. Served by a no-store Python HTTP server on `:8099`.

**Spec:** `docs/superpowers/specs/2026-05-29-tank-mitri-boss-design.md` (sections referenced as §N below).

---

## Conventions & verification harness (read first)

**This project has NO unit-test runner.** It is a browser game validated **live**. The TDD "test" in each task is **live verification**: load the page, exercise the behavior, and confirm via the browser console + Playwright. This replaces pytest steps (project reality overrides the skill's pytest default).

**Dev server (per project memory — the plain `http.server` does NOT no-cache):**
```bash
# from the project root; serves with Cache-Control: no-store on :8099
python3 - <<'PY' &
import http.server, socketserver
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store'); super().end_headers()
socketserver.TCPServer(('',8099),H).serve_forever()
PY
```
- `index.html` loads `./src/game.js?v=N` — **bump `N`** each change, and navigate with a unique `?cb=<n>` on the URL so Chrome reloads fresh.
- Verify with the Playwright MCP tools: `browser_navigate` to `http://localhost:8099/?cb=NN`, click **PLAY**, `browser_console_messages` (expect no errors beyond the known headless pointer-lock notice), `browser_take_screenshot`, and `browser_evaluate` to read debug state.

**Dev hook (added in Task 2, removed in the final task):** to test the boss without grinding to wave 5, expose
```js
window.__dbgTank = () => game.waves._forceTankWave();   // spawns a tank boss now
window.__dbg = () => game;                               // reach game state from Playwright
```
Gate it behind a `DEBUG` const so it's trivially removable.

**Git:** the project is **not yet a git repo**. Phase 0 initializes it so the frequent-commit steps work. If the user declines git, skip the `git` steps but keep every other step.

**File structure (decomposition):** This feature is large but cohesive; it stays in `src/game.js` to match the established single-file pattern. New top-level units added there, each with one responsibility:
- `ENEMY_TYPES.tank` + `BOSS_ROSTER` (data)
- `buildTank()` / `buildTankWreck()` (model builders, near `buildEngendro` ~L134)
- `EnemyManager._bossTank()`, `_bossTolo()`, `_tankHitZone()`, `_eraReact()`, `_tankDestroyed()`, `_tankCaptured()` (boss behavior + damage outcomes)
- `CapturedTank` class (vehicle + crew seats, near `MountedGun` ~L2111)
- Thermal post-process hook in the render path; HUD/CSS overlays in `index.html`

---

## Phase 0 — Setup

### Task 0: Initialize git for frequent commits

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Init repo & ignore junk**

```bash
cd "/Users/macmini1/game 4.8"
git init
printf '%s\n' 'node_modules/' '.DS_Store' '__pycache__/' '*.log' > .gitignore
git add -A
git commit -m "chore: baseline before tank boss feature"
```
(End commit messages with the required `Co-Authored-By` trailer.)

- [ ] **Step 2: Branch**

```bash
git checkout -b tank-mitri-boss
```

---

## Phase 1 — Boss mechanics (placeholder box-tank)

Goal of phase: a fully playable tank boss fight (both outcomes) with a crude blocky tank, balanced live. No detailed art yet.

### Task 1: Tank enemy type + random boss roster

**Files:**
- Modify: `src/game.js` — `ENEMY_TYPES` (L421-430 area); `WaveManager._spawnOne` (L1812-1818) and `_updateLongNight` boss spawn.

- [ ] **Step 1: Add the tank type next to `boss`**

In `ENEMY_TYPES` (after the `boss:` line ~L430):
```js
  tank:     { armorHP: 3600, mitriHP: 750, speed: 1.2, dmg: 40, reward: 1500, scale: 1,
              variant: 'tank', boss: true, tank: true, armored: true, explosiveMult: 2.0 },
```
Note: the tank uses `armorHP`/`mitriHP` instead of `hp`; the generic `Enemy.spawn` `hp` arg is still passed (set to `armorHP` for the boss bar) but the real pools are initialized in Task 3.

- [ ] **Step 2: Add a boss roster + random picker**

Just above `class WaveManager` (~L1709):
```js
const BOSS_ROSTER = ['boss', 'tank']; // 'boss' = Tolo, 'tank' = T-90M «MITRI»
```

- [ ] **Step 3: Pick a boss at spawn time (PURGE mode)**

Replace the boss-spawn block in `_spawnOne` (L1814-1818):
```js
    if (this.isBossWave && this.spawned === 0) {
      const hpScale = 1 + (Math.floor(n / 5) - 1) * 0.6;
      const which = this.bossPick || (this.bossPick = BOSS_ROSTER[(Math.random() * BOSS_ROSTER.length) | 0]);
      this._spawnBoss(which, pos, hpScale);
      this.spawned++; return;
    }
```
Add a helper method on `WaveManager`:
```js
  _spawnBoss(which, pos, hpScale) {
    if (which === 'tank') {
      const e = this.game.enemies.spawn('tank', pos, Math.round(ENEMY_TYPES.tank.armorHP * hpScale), ENEMY_TYPES.tank.speed);
      e.armorHP = e.armorHPmax = Math.round(ENEMY_TYPES.tank.armorHP * hpScale);
      e.mitriHP = e.mitriHPmax = Math.round(ENEMY_TYPES.tank.mitriHP * Math.min(hpScale, 2.0)); // §14.3 cap so capture stays viable
    } else {
      this.game.enemies.spawn('boss', pos, Math.round(ENEMY_TYPES.boss.hp * hpScale), ENEMY_TYPES.boss.speed);
    }
  }
  _forceTankWave() { this.startWave(this.wave + 1); this.isBossWave = true; this.bossPick = 'tank'; this.spawned = 0; this.total = 1; } // DEBUG
```
Reset `this.bossPick = null;` at the top of `startWave(n)` (~L1712) and `_startLongNight(n)` so each boss wave re-rolls.

- [ ] **Step 4: Do the same in LONG NIGHT** — in `_updateLongNight`'s boss spawn path, route through `_spawnBoss(this.bossPick || (this.bossPick = BOSS_ROSTER[(Math.random()*2)|0]), pos, hpScale)`.

- [ ] **Step 5: Banner text** — where the sub-text is chosen (L1735 & L1760), make it boss-aware:
```js
let sub = this.isBossWave ? (this.bossPick === 'tank' ? 'T-90M «MITRI» ROLLS IN' : 'BOSS TOLO APPROACHES') : t.sub;
```

- [ ] **Step 6: Verify (live)** — bump `?v=`, load, run `__dbgTank()` in console (added next task). Until then, just confirm no syntax error: page loads, console clean.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(tank): add tank enemy type + random boss roster"`

---

### Task 2: Placeholder tank mesh + spawn branch + debug hook

**Files:**
- Modify: `src/game.js` — near `buildEngendro` (~L134) add `buildTank`; `EnemyManager.spawn` (L717-726); add debug hook in `Game` ctor.

- [ ] **Step 1: Minimal placeholder `buildTank`**

Add near `buildEngendro` (~L134). A blocky stand-in with the named rig nodes the later logic/anim needs (so Phases 1-2 wire against the final node names):
```js
function buildTank(camo = 'desert') {
  const sand = 0xc9b48a, brown = 0x8a6a45, olive = 0x6e6f4a, dark = 0x3b3a30, steel = 0x55585a;
  const root = new THREE.Group(); root.name = 'tank';
  // hull
  const hb = new MeshBuilder();
  hb.box(3.6, 1.0, 7.2, 0, 0.9, 0, sand, { tint: 0.04 });        // body
  hb.box(3.6, 0.5, 2.0, 0, 1.45, 2.4, brown);                    // glacis stack (front = ERA-ish)
  const hull = new THREE.Mesh(hb.build(), voxelMaterial()); root.add(hull);
  // turret (yaw pivot) at hull top
  const turret = new THREE.Group(); turret.position.set(0, 1.9, -0.4); root.add(turret); root.userData.turret = turret;
  const tb = new MeshBuilder(); tb.box(2.6, 0.9, 2.8, 0, 0.45, 0, olive, { tint: 0.03 });
  turret.add(new THREE.Mesh(tb.build(), voxelMaterial()));
  // gun mantlet (pitch pivot) + barrel + recoil node + muzzle marker
  const gunMantlet = new THREE.Group(); gunMantlet.position.set(0, 0.5, 1.3); turret.add(gunMantlet); turret.userData.gunMantlet = gunMantlet;
  const recoilNode = new THREE.Group(); gunMantlet.add(recoilNode); gunMantlet.userData.recoilNode = recoilNode;
  const bb = new MeshBuilder(); bb.box(0.34, 0.34, 5.0, 0, 0, 2.6, steel); // 125mm tube forward (+Z)
  recoilNode.add(new THREE.Mesh(bb.build(), voxelMaterial()));
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, 5.1); recoilNode.add(muzzle); root.userData.muzzle = muzzle;
  // RWS + MG muzzle (on the turret roof)
  const mgMuzzle = new THREE.Object3D(); mgMuzzle.position.set(0.7, 1.1, 0.6); turret.add(mgMuzzle); root.userData.mgMuzzle = mgMuzzle;
  // cupola hatch + commander (Mitri) — reused for player peek later
  const hatch = new THREE.Group(); hatch.position.set(0.7, 1.0, 0.2); turret.add(hatch); root.userData.hatch = hatch;
  const mb = new MeshBuilder(); mb.box(0.7, 0.8, 0.7, 0, 0.4, 0, 0xf2c200); // yellow Mitri stub
  const mitri = new THREE.Mesh(mb.build(), voxelMaterial()); hatch.add(mitri); root.userData.mitri = mitri;
  // tracks + wheels stubs (named for anim wiring)
  root.userData.roadWheels = []; root.userData.trackL = null; root.userData.trackR = null;
  root.userData.headlamps = []; // filled in Phase 3
  return root;
}
```
*(This is a deliberate stand-in; Phase 3 replaces the geometry but keeps these `userData` node names.)*

- [ ] **Step 2: Spawn branch — use `buildTank` for the tank type**

`EnemyManager` uses cached `buildEngendro` geometry via `_geo`. The tank needs its own group per spawn (it has child pivots, not a single geometry). Add a tank branch in `spawn` (after the `else if (typeKey === 'charger')` at L723, before the generic `else`):
```js
    else if (typeKey === 'tank') {
      col = { body: 0xc9b48a, name: 'Mitri' }; geoKey = 'tank'; name = 'T-90M «MITRI»';
    }
```
Then special-case mesh creation. Simplest: give the pooled `Enemy` a `tankGroup`. In `_get`/`Enemy` we can't reuse a single geometry; instead, in `spawn`, after `this._get(...)`, if `typeKey==='tank'` swap the enemy's mesh for a fresh `buildTank()` group:
```js
    const e = this._get(geoKey, col, variant);
    if (typeKey === 'tank') {
      if (e.mesh) e.mesh.visible = false;
      if (!e.tankGroup) { e.tankGroup = buildTank('desert'); this.game.engine.scene.add(e.tankGroup); }
      e.mesh = e.tankGroup;            // behaviors/anim drive e.mesh
      e.isTank = true;
    }
    e.spawn(typeKey, def, col, name, pos, hp, speed);
```
*(Keep it pragmatic: one tank alive at a time, so a single cached `tankGroup` per pooled enemy is fine. Confirm `Enemy.spawn` setting `e.mesh.scale/position/visible` works on a Group — it does.)*

- [ ] **Step 3: Tank collision/size on spawn** — handled in Task 3 (radius/height/headY override). For now it renders.

- [ ] **Step 4: Debug hook** — in the `Game` constructor (~after L2416) add:
```js
    const DEBUG = true; // TODO remove at end (Task 28)
    if (DEBUG) { window.__dbg = () => this; window.__dbgTank = () => this.waves._forceTankWave(); }
```

- [ ] **Step 5: Verify (live)** — bump `?v=`, PLAY, in console run `__dbgTank()`. A blocky sandy box-tank with a yellow cube on top spawns and lurches toward you (using the default enemy movement for now). Console clean. Screenshot.

- [ ] **Step 6: Commit** — `git commit -am "feat(tank): placeholder tank model + spawn branch + debug hook"`

---

### Task 3: Two-pool state init + tank collision sizing

**Files:**
- Modify: `src/game.js` — `Enemy.spawn` (L684-699).

- [ ] **Step 1: Init tank state in `Enemy.spawn`**

At the end of `Enemy.spawn` (before `}` L699) add:
```js
    if (def.tank) {
      this.radius = 2.6; this.height = 3.0; this.headY = 2.4;   // big hull; cupola = head zone
      this.armorHP = this.armorHPmax = hp; this.mitriHP = this.mitriHPmax = def.mitriHP; // overwritten by _spawnBoss with scaled values
      this.vulnerable = false; this.windowT = 6; this.exposeT = 0; // window cycle (Task 11)
      this.hullYaw = 0; this.turYaw = 0; this.gunPitch = 0;       // rig angles (Task 7/8)
      this.cannonCD = 4; this.charge = 0; this.mgAmmo = 250; this.mgReload = 0; this.recoil = 0;
      this.ramCD = 0; this.stuckRecover = 0; this.eraSpent = {};   // ERA per-zone consumed flags (Task 13)
      this.captured = false;
    }
```

- [ ] **Step 2: Verify (live)** — `__dbgTank()`, then in console `__dbg().enemies.active.find(e=>e.isTank)` shows `armorHP`, `mitriHP`, `radius:2.6`. Console clean.

- [ ] **Step 3: Commit** — `git commit -am "feat(tank): two-pool state + collision sizing"`

---

### Task 4: Two-pool damage routing (the core mechanic)

**Files:**
- Modify: `src/game.js` — `EnemyManager.damage` (L878), add `hitPoint` param; weapon-fire call site (L1251 area) and rocket (L1342) pass `hitPoint`.

- [ ] **Step 1: Add the `armored` branch at the top of `damage()`**

Change the signature and add the branch (L878):
```js
  damage(e, amount, source = 'gun', hitPoint = null) {
    if (!e.alive) return false;
    if (e.def.armored && !e.captured) {
      if (source === 'gun') {
        if (!e.vulnerable) { this._armorPing(e, hitPoint); return false; } // bullets bounce off armor
        e.mitriHP -= amount;                                               // exposed: chip the COMMANDER
        this._mitriHurt(e);
        if (e.mitriHP <= 0) return this._tankCaptured(e);                  // → capture path (§12)
        return false;
      }
      if (source === 'explosion') {
        const zone = this._tankHitZone(e, hitPoint);                       // §3/§13 (stub returns weak in Task 5; real in Task 13)
        if (zone.era && !e.eraSpent[zone.id]) { this._eraReact(e, zone); return false; } // ERA defeats it → 0 dmg
        e.armorHP -= amount * (e.def.explosiveMult || 2.0);
        this._armorHurt(e);
        if (e.armorHP <= 0) return this._tankDestroyed(e);                 // → wreck path (§6/§12)
        return false;
      }
      return false; // 'contact' n/a for the tank
    }
    e.hp -= amount; e.squash = Math.max(e.squash, 0.16);
    // ...existing body unchanged...
```

- [ ] **Step 2: Temporary feedback stubs** (real FX in later tasks). Add to `EnemyManager`:
```js
  _armorPing(e, hp) { this.game.audio.tone(220, 0.04, 'square', 0.18); if (hp) this.game.effects.impact(hp, new THREE.Vector3(0,1,0), 'spark'); }
  _mitriHurt(e) { this.game.effects.stuffing(new THREE.Vector3(e.pos.x, e.pos.y + 2.5, e.pos.z), 0xf2c200, 5, 4); this.game.audio.enemyHurt(); }
  _armorHurt(e) { this.game.audio.tone(90, 0.06, 'sawtooth', 0.25); }
  _tankHitZone(e, hp) { return { era: false, id: 'weak' }; } // STUB — real classification in Task 13
```

- [ ] **Step 3: Thread `hitPoint` from the bullet hit** — at the gun-fire damage call (the WeaponSystem fire, ~L1251 `this.game.enemies.damage(eHit.enemy, dmg, 'gun')`) pass the point:
```js
const killed = this.game.enemies.damage(eHit.enemy, dmg, 'gun', eHit.point);
```
Also the MountedGun fire (L2251): add `, eHit.point`.

- [ ] **Step 4: Thread `hitPoint` through explosions** — change `damageInRadius` (L906) to forward the blast center:
```js
  damageInRadius(center, radius, dmg, except = null) {
    for (const e of [...this.active]) {
      if (!e.alive || e === except) continue;
      const d = Math.hypot(e.pos.x - center.x, e.pos.z - center.z);
      if (d < radius) this.damage(e, dmg * (1 - (d / radius) * 0.6), 'explosion', center.clone ? center.clone() : center);
    }
  }
```
(The rocket detonation at L1342 already calls `damageInRadius(g.mesh.position, ...)`, so the center flows through.)

- [ ] **Step 5: Verify (live)** — `__dbgTank()`. (a) Shoot it with a rifle while buttoned-up → "tink", no HP loss. (b) `__dbg().enemies.active.find(e=>e.isTank).vulnerable=true` then shoot → `mitriHP` drops, captured triggers at 0 (Task 5 stub). (c) Fire a bazooka at it → `armorHP` drops (zone stub = weak), destroyed at 0. Console clean.

- [ ] **Step 6: Commit** — `git commit -am "feat(tank): two-pool damage routing (armor vs commander)"`

---

### Task 5: Outcome handlers — `_tankCaptured` (stub) + `_tankDestroyed` + wreck obstacle

**Files:**
- Modify: `src/game.js` — `EnemyManager` (add methods); `World` (add `addWreckObstacle`); `clearAll` (L913).

- [ ] **Step 1: `_tankDestroyed` — kill + wreck**

```js
  _tankDestroyed(e) {
    e.alive = false;
    const c = new THREE.Vector3(e.pos.x, e.pos.y + 1.4, e.pos.z);
    for (let k = 0; k < 4; k++) this.game.effects.explosion(c.clone().add(new THREE.Vector3(rr(-1.5,1.5),rr(0,1.5),rr(-1.5,1.5))), 4);
    this.game.effects.stuffing(c, 0x222222, 50, 9);
    this.game.audio.enemyDie();
    if (e.tankGroup) { e.tankGroup.visible = false; }            // Phase 3 swaps to buildTankWreck()
    this.world.addWreckObstacle(e.pos.clone(), e.hullYaw || 0);   // permanent solid cover
    this.game.hud.hideBoss();
    this.game.hud.bigMessage('T-90M DESTROYED', '+bounty +keys');
    this.game.onEnemyKilled(e);
    return true;
  }
```

- [ ] **Step 2: `_tankCaptured` — stub inert tank (Phase 2 makes it drivable)**

```js
  _tankCaptured(e) {
    e.alive = false; e.captured = true;
    if (e.tankGroup && e.tankGroup.userData.mitri) e.tankGroup.userData.mitri.visible = false; // commander dead
    this.game.hud.hideBoss();
    this.game.hud.bigMessage('TANK COMMANDEERED!', 'Phase 2: press E to board');
    this.game.onEnemyKilled(e);
    // Phase 2: this.game.captureTank(e.tankGroup, e.pos.clone(), e.hullYaw);
    return true;
  }
```

- [ ] **Step 3: `World.addWreckObstacle`** — register a static AABB so player+enemies collide/path around it. In `class World`, reusing the existing `this.boxes` list that `_moveAxis`/enemy avoidance already read:
```js
  addWreckObstacle(pos, yaw) {
    const hw = 2.0, hl = 3.6, h = 1.6;
    this.boxes.push({ min: new THREE.Vector3(pos.x - hw, 0, pos.z - hl), max: new THREE.Vector3(pos.x + hw, h, pos.z + hl), wreck: true });
    // Phase 3: also add the buildTankWreck() mesh at pos/yaw.
  }
```
*(Verify `this.boxes` entries use `{min,max}` — they do, per enemy avoidance L767 and `_moveAxis`. If `World` stores collision boxes under a different field, match it.)*

- [ ] **Step 4: Don't clear the wreck per wave** — wreck boxes carry `wreck:true`; ensure any per-wave obstacle reset (if present) skips them. (The tank `Enemy` itself is cleared normally via `clearAll`.) In `clearAll` (L913) hide the tank group too:
```js
  clearAll() { for (const e of this.active) { e.alive = false; e.mesh.visible = false; if (e._beam) e._beam.visible = false; if (e.tankGroup) e.tankGroup.visible = false; } this.active.length = 0; if (this.game.hud) this.game.hud.hideBoss(); }
```

- [ ] **Step 5: Verify (live)** — `__dbgTank()`, bazooka it → explosions, "T-90M DESTROYED", and you can no longer walk through where it stood (wreck box blocks you). Then again, set `vulnerable=true`, shoot Mitri to 0 → "TANK COMMANDEERED!" banner, yellow cube vanishes. Console clean.

- [ ] **Step 6: Commit** — `git commit -am "feat(tank): destroy→wreck obstacle + capture stub outcomes"`

---

### Task 6: Boss-branch dispatch (extract `_bossTolo`, add `_bossTank`)

**Files:**
- Modify: `src/game.js` — boss branch in `EnemyManager.update` (L815-841).

- [ ] **Step 1: Extract Tolo's inline code into `_bossTolo(e, dt)`** — move the body of the `if (e.def.boss) { ... }` block (L816-841, the setBoss/phase2/laser/summon code) into a new method `_bossTolo(e, dt)` verbatim (it already references `pp` via `this.game.player.pos`; recompute `const pp = this.game.player.pos` at the top of the method).

- [ ] **Step 2: Dispatch**

Replace the boss block (L815-841) with:
```js
      if (e.def.boss) {
        if (e.def.tank) this._bossTank(e, dt);
        else this._bossTolo(e, dt);
      }
```

- [ ] **Step 3: Add a minimal `_bossTank` so dispatch is testable**

```js
  _bossTank(e, dt) {
    this.game.hud.setBoss(e.armorHP / e.armorHPmax, e.name);
    // movement/attacks added in Tasks 7-11
  }
```

- [ ] **Step 4: Skip the generic enemy movement for the tank** — the default per-enemy movement (L755-811) is plush-walker logic. For the tank, bypass it. At the top of the per-enemy loop, after `if (!e.alive)...` (L754), add:
```js
      if (e.isTank) { this._bossTank(e, dt); continue; } // tank drives itself (Task 7); skip plush walker
```
and remove the `_bossTank` call from inside the `if (e.def.boss)` block for the tank (Tolo keeps using the shared loop). Keep `setBoss` inside `_bossTank`.

- [ ] **Step 5: Verify (live)** — Tolo wave still behaves exactly as before (laser, phase 2, adds). `__dbgTank()` → tank shows its boss bar; it sits still (movement next task). Console clean.

- [ ] **Step 6: Commit** — `git commit -am "refactor(boss): split _bossTolo/_bossTank dispatch"`

---

### Task 7: Tank navigation — drive, whisker steering, stuck recovery (§5)

**Files:**
- Modify: `src/game.js` — `_bossTank` movement; reuse `world.rayHit`.

- [ ] **Step 1: Implement drive + obstacle-aware steering**

Replace `_bossTank` movement portion:
```js
  _bossTank(e, dt) {
    const pp = this.game.player.pos;
    const toP = new THREE.Vector3(pp.x - e.pos.x, 0, pp.z - e.pos.z);
    const dist = toP.length() || 1; toP.multiplyScalar(1 / dist);
    let desired = Math.atan2(toP.x, toP.z);                 // heading toward player

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
    else { if (moved < 0.4 * 1.2 * dt && dist > e.radius + 2) e.stuck += dt; else e.stuck = Math.max(0, e.stuck - dt);
           if (e.stuck > 1.2) { e.stuckRecover = 0.8; e.stuck = 0; } }

    // slow hull turn toward desired (tank-like)
    let dY = ((desired - e.hullYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const turn = Math.min(Math.abs(dY), (45 * Math.PI / 180) * dt) * Math.sign(dY);
    e.hullYaw += turn;

    // forward drive (slower while turning hard or close)
    const enraged = e.armorHP <= e.armorHPmax * 0.4;
    const baseSpd = enraged ? 1.5 : 1.2;
    const spd = (Math.abs(dY) > 1.0 ? 0 : baseSpd) * (e.stuckRecover > 0 ? -1 : 1);
    const fwd = new THREE.Vector3(Math.sin(e.hullYaw), 0, Math.cos(e.hullYaw));
    e.pos.x += fwd.x * spd * dt; e.pos.z += fwd.z * spd * dt; e.pos.y = 0;
    const lim = this.world.HALF - e.radius; e.pos.x = clamp(e.pos.x, -lim, lim); e.pos.z = clamp(e.pos.z, -lim, lim);
    // hard collide vs building boxes (large circle, ground-only — no step-up)
    for (const b of this.world.boxes) {
      if (b.max.y < 0.6) continue;
      if (e.pos.x + e.radius <= b.min.x || e.pos.x - e.radius >= b.max.x) continue;
      if (e.pos.z + e.radius <= b.min.z || e.pos.z - e.radius >= b.max.z) continue;
      const px = Math.min(b.max.x + e.radius - e.pos.x, e.pos.x - (b.min.x - e.radius));
      const pz = Math.min(b.max.z + e.radius - e.pos.z, e.pos.z - (b.min.z - e.radius));
      if (px < pz) e.pos.x += (e.pos.x < (b.min.x + b.max.x) / 2 ? -px : px);
      else e.pos.z += (e.pos.z < (b.min.z + b.max.z) / 2 ? -pz : pz);
    }
    // apply transform
    e.mesh.position.set(e.pos.x, 0, e.pos.z);
    e.mesh.rotation.y = e.hullYaw;
    this.game.hud.setBoss(e.armorHP / e.armorHPmax, e.name);
    this._tankCombat(e, dt, pp, dist); // Tasks 8-11
  }
  _tankCombat(e, dt, pp, dist) { /* filled in Tasks 8-11 */ }
```

- [ ] **Step 2: Verify (live, long run)** — `__dbgTank()`, run around buildings for ~2 min. The tank pursues, steers around walls, reverses out if cornered, never permanently wedges. Watch `__dbg().enemies.active[0].stuckRecover` toggling when it backs out. Console clean. Screenshot near a building.

- [ ] **Step 3: Commit** — `git commit -am "feat(tank): obstacle-aware driving + stuck recovery"`

---

### Task 8: Main cannon — LOS gate, muzzle clearance, arc shell, AoE, camera shake (§4)

**Files:**
- Modify: `src/game.js` — `_tankCombat`; projectiles array (the rocket lives in WeaponSystem ~L1320-1345); add a `tankShell` branch there or a dedicated projectile list on `EnemyManager`.

- [ ] **Step 1: Cannon aim + LOS-gated fire in `_tankCombat`**

```js
  _tankCombat(e, dt, pp, dist) {
    const enraged = e.armorHP <= e.armorHPmax * 0.4;
    // turret slowly tracks the player (independent of hull)
    const want = Math.atan2(pp.x - e.pos.x, pp.z - e.pos.z);
    let dT = ((want - e.turYaw + Math.PI*3) % (Math.PI*2)) - Math.PI;
    e.turYaw += Math.min(Math.abs(dT), (enraged?40:28)*Math.PI/180*dt) * Math.sign(dT);
    if (e.mesh.userData.turret) e.mesh.userData.turret.rotation.y = e.turYaw - e.hullYaw;
    // gun elevation toward player height
    const muzzleY = e.pos.y + 2.4, wantPitch = Math.atan2((pp.y + 1) - muzzleY, dist);
    e.gunPitch += clamp(wantPitch - e.gunPitch, -30*Math.PI/180*dt, 30*Math.PI/180*dt);
    if (e.mesh.userData.gunMantlet) e.mesh.userData.gunMantlet.rotation.x = -e.gunPitch;

    // cannon fire — only with LOS and roughly on target
    e.cannonCD -= dt;
    const muzzle = this._tankMuzzle(e);
    const aimErr = Math.abs(dT);
    const losClear = !this._blocked(muzzle, pp, dist);
    if (e.charge > 0) {
      e.charge -= dt;
      if (e.charge <= 0) this._tankFireCannon(e, muzzle, pp);
    } else if (e.cannonCD <= 0 && aimErr < 0.12 && losClear && dist < 90) {
      e.cannonCD = enraged ? 5 : 7;        // §10 reload
      e.charge = 0.8;                       // telegraph
      this._tankAimMarker(e, pp.clone());   // ground marker ~0.9s before impact
      this.game.audio.tone(60, 0.2, 'sawtooth', 0.2); // servo whir / charge
    }
    this._tankMG(e, dt, pp, dist, losClear);   // Task 9
    this._tankRam(e, dt, pp, dist);            // Task 10
    this._tankWindow(e, dt);                   // Task 11
    // proximity rumble (§7)
    if (dist < 18) this.game.engine.shake && this.game.engine.shake((18 - dist) / 18 * 0.12);
  }
  _tankMuzzle(e) { const m = e.mesh.userData.muzzle; if (m) { e.mesh.updateMatrixWorld(); return m.getWorldPosition(new THREE.Vector3()); } return new THREE.Vector3(e.pos.x, 2.4, e.pos.z); }
  _blocked(a, b, dist) { const d = new THREE.Vector3(b.x - a.x, (b.y+1) - a.y, b.z - a.z).normalize(); const h = this.world.rayHit(a, d, dist); return !!h; }
```

- [ ] **Step 2: Muzzle-clearance gate + fire the arc shell**

```js
  _tankFireCannon(e, muzzle, pp) {
    // muzzle clearance: don't fire if the tube tip is jammed in geometry
    const fdir = new THREE.Vector3(Math.sin(e.turYaw), 0, Math.cos(e.turYaw));
    if (this.world.rayHit(muzzle, fdir, 3)) { e.cannonCD = 1.0; return; } // re-try soon, reposition
    const dir = new THREE.Vector3(pp.x - muzzle.x, (pp.y+0.6) - muzzle.y, pp.z - muzzle.z).normalize();
    this.shells = this.shells || [];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.25,0.7), new THREE.MeshBasicMaterial({ color: 0xffd070 }));
    mesh.position.copy(muzzle); this.game.engine.scene.add(mesh);
    this.shells.push({ mesh, vel: dir.multiplyScalar(48), grav: 9, fuse: 4, dmg: 48, radius: 6 });
    e.recoil = 0.5; // recoil kick (anim Task 24)
    this.game.effects.muzzleFlash(muzzle, dir, 2.4); this.game.audio.gunshot({ body: 55, crack: 0.3, vol: 1.0, hp: 400, bp: 120 });
  }
```

- [ ] **Step 3: Tick shells (arc + world/ground/proximity detonation, damages the PLAYER)** — add to `EnemyManager.update` end (after the loop, L842):
```js
    if (this.shells) for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i]; s.fuse -= dt; s.vel.y -= s.grav * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const p = s.mesh.position; let boom = p.y < 0.2 || s.fuse <= 0;
      if (!boom && this.world.rayHit(p, this._tmpD ||= new THREE.Vector3(0,-1,0), 0.4)) boom = true;
      if (!boom) { const dp = Math.hypot(p.x - this.game.player.pos.x, p.z - this.game.player.pos.z); if (dp < 1.5) boom = true; }
      if (boom) {
        this.game.effects.explosion(p.clone(), s.radius);
        const pl = this.game.player, dp = Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z);
        if (dp < s.radius) pl.hurt(s.dmg * (1 - dp / s.radius));
        this.game.engine.shake && this.game.engine.shake(0.4);
        this.game.engine.scene.remove(s.mesh); this.shells.splice(i, 1);
      } else if (p.y < -5) { this.game.engine.scene.remove(s.mesh); this.shells.splice(i, 1); }
    }
```

- [ ] **Step 4: Aim marker + camera shake** — add `_tankAimMarker(e, target)` that drops a flat red ring decal at `target` for ~0.9 s (reuse `effects` or a pooled ring mesh). If `engine.shake` doesn't exist, add a tiny camera-shake accumulator to `Engine` (offset applied in render) — implement once here:
```js
// in class Engine: add  shake(a){ this._shake = Math.min(0.6, (this._shake||0)+a); }
// and in the render/update, offset camera by random*_shake, decay _shake each frame.
```

- [ ] **Step 5: Verify (live)** — `__dbgTank()`. The turret slowly tracks you; behind a wall it does NOT fire (LOS); in the open it charges (~0.8 s), a red marker appears, a shell arcs and explodes with screen shake and damage you can dodge by moving. It won't fire with the muzzle against a wall. Console clean.

- [ ] **Step 6: Commit** — `git commit -am "feat(tank): cannon with LOS/clearance gates, arc shell, AoE, shake"`

---

### Task 9: Coaxial MG — 250-round belt, tracers, LOS, reload (§4)

**Files:**
- Modify: `src/game.js` — `_tankMG`.

- [ ] **Step 1: Implement `_tankMG`**

```js
  _tankMG(e, dt, pp, dist, losClear) {
    if (e.mgReload > 0) { e.mgReload -= dt; return; }
    e._mgCD = (e._mgCD || 0) - dt;
    if (dist < 22 && losClear && Math.abs(((Math.atan2(pp.x-e.pos.x,pp.z-e.pos.z)-e.turYaw+Math.PI*3)%(Math.PI*2))-Math.PI) < 0.4) {
      if (e._mgCD <= 0) {
        e._mgCD = 0.09; e.mgAmmo--;
        const o = e.mesh.userData.mgMuzzle ? e.mesh.userData.mgMuzzle.getWorldPosition(new THREE.Vector3()) : this._tankMuzzle(e);
        const jit = 0.04, dir = new THREE.Vector3(pp.x-o.x + rr(-jit,jit), (pp.y+1)-o.y, pp.z-o.z + rr(-jit,jit)).normalize();
        const wHit = this.world.rayHit(o, dir, 30);
        const end = o.clone().addScaledVector(dir, wHit ? wHit.dist : 30);
        this.game.effects.tracer(o, end, 0xfff1a0);            // bright tracer
        const pl = this.game.player, t = clamp((pl.pos.x-o.x)*dir.x + (pl.pos.y+1-o.y)*dir.y + (pl.pos.z-o.z)*dir.z, 0, 30);
        const dl = Math.hypot(pl.pos.x-(o.x+dir.x*t), pl.pos.y+1-(o.y+dir.y*t), pl.pos.z-(o.z+dir.z*t));
        if (dl < 1.0 && (!wHit || t < wHit.dist)) pl.hurt(6);
        this.game.audio.tone(180, 0.03, 'square', 0.12);
        if (e.mgAmmo <= 0) { e.mgReload = 3.5; e.mgAmmo = 250; this.game.audio.tone(80,0.2,'square',0.2); }
      }
    }
  }
```

- [ ] **Step 2: Verify (live)** — stand within 22 m in front with LOS → tracer bursts hit you (~6/round). Behind a wall → none. After ~250 rounds it pauses ~3.5 s. Console clean.

- [ ] **Step 3: Commit** — `git commit -am "feat(tank): coaxial MG with belt, tracers, LOS gate"`

---

### Task 10: Track ram (§4)

**Files:**
- Modify: `src/game.js` — `_tankRam`.

- [ ] **Step 1: Implement `_tankRam`**

```js
  _tankRam(e, dt, pp, dist) {
    e.ramCD -= dt;
    const fwd = new THREE.Vector3(Math.sin(e.hullYaw), 0, Math.cos(e.hullYaw));
    const toP = new THREE.Vector3(pp.x - e.pos.x, 0, pp.z - e.pos.z).normalize();
    if (dist < 4 && fwd.dot(toP) > 0.6 && e.ramCD <= 0) {
      e.ramCD = 2.5;
      this.game.player.hurt(40);
      const kx = toP.x * 6, kz = toP.z * 6; this.game.player.vel.x += kx; this.game.player.vel.z += kz; // knockback
      this.game.engine.shake && this.game.engine.shake(0.35);
      this.game.audio.tone(70, 0.15, 'sawtooth', 0.3);
    }
  }
```

- [ ] **Step 2: Verify (live)** — hug the front of the tank → it lunges, ~40 dmg + knockback, ~2.5 s cooldown. Console clean.

- [ ] **Step 3: Commit** — `git commit -am "feat(tank): track ram attack"`

---

### Task 11: Mitri pop-out window + phase 2 + boss bar (§3/§4)

**Files:**
- Modify: `src/game.js` — `_tankWindow`; HUD (a Mitri pip). `index.html` for the pip element + CSS.

- [ ] **Step 1: Window cycle in `_tankWindow`**

```js
  _tankWindow(e, dt) {
    const enraged = e.armorHP <= e.armorHPmax * 0.4;
    const cycle = enraged ? 9 : 12, expose = 4;
    e.windowT -= dt;
    if (!e.vulnerable && e.windowT <= 0) { e.vulnerable = true; e.exposeT = expose; this.game.audio.tone(300,0.08,'square',0.25); this.game.hud.bigMessage('COMMANDER EXPOSED', 'shoot Mitri!'); }
    if (e.vulnerable) {
      e.exposeT -= dt;
      if (e.mesh.userData.hatch) e.mesh.userData.hatch.position.y = 1.0 + Math.min(1, (expose - Math.max(0,e.exposeT))*3) * 0.5; // rise
      if (e.exposeT <= 0) { e.vulnerable = false; e.windowT = cycle; if (e.mesh.userData.hatch) e.mesh.userData.hatch.position.y = 1.0; }
    }
    // phase 2 trigger (once)
    if (!e._enraged && enraged) { e._enraged = true; this.game.hud.bigMessage('MITRI ENRAGED', 'the T-90M floors it!'); }
    // boss bar: armor + Mitri pip
    this.game.hud.setBoss(e.armorHP / e.armorHPmax, e.name);
    this.game.hud.setBossPip(e.vulnerable ? e.mitriHP / e.mitriHPmax : -1);
  }
```

- [ ] **Step 2: HUD `setBossPip`** — add to `class HUD` (near `setBoss` L1987):
```js
  setBossPip(frac) {
    const el = this.el.bosspip; if (!el) return;
    if (frac < 0) { el.classList.remove('show'); this.el.bossbar.classList.remove('exposed'); }
    else { el.classList.add('show'); this.el.bossbar.classList.add('exposed'); el.style.width = clamp(frac,0,1)*100 + '%'; }
  }
```

- [ ] **Step 3: HUD markup + CSS** — in `index.html`, inside the `#bossbar` element add `<div id="bosspip"></div>`, register `bosspip: $('bosspip')` in the HUD el map (~L1700s), and add CSS: a thin gold sub-bar shown only when `.show`, and `#bossbar.exposed` tints gold.

- [ ] **Step 4: Verify (live)** — `__dbgTank()`. Every ~12 s "COMMANDER EXPOSED", the cupola stub rises, the gold pip appears, and now rifle fire drops `mitriHP` (capture at 0). Drop `armorHP` below 40 % (bazooka a few times) → "MITRI ENRAGED", faster cannon, window every ~9 s. Console clean.

- [ ] **Step 5: Commit** — `git commit -am "feat(tank): Mitri window cycle + phase 2 + boss pip"`

---

### Task 12: Rewards (asymmetric) + wave clear

**Files:**
- Modify: `src/game.js` — `onEnemyKilled` (find it; it already pays bounty/keys for bosses).

- [ ] **Step 1: Asymmetric payout** — in `onEnemyKilled`, add a tank branch: destroy pays more, capture less (§14.2):
```js
    if (e.def.tank) {
      const base = e.def.reward;
      if (e.captured) { this.player.cash += Math.round(base * 0.4); this.giveKeys?.(1); }
      else { this.player.cash += base; this.giveKeys?.(3); this.player.score += 800; }
      // (match the existing boss reward calls/fields — cash/score/keys API as used for 'boss')
    }
```
*(Mirror the exact reward API the existing boss uses — replace `giveKeys`/`cash`/`score` with the real field names found at the boss branch in `onEnemyKilled`.)*

- [ ] **Step 2: Wave clear** — both outcomes set `e.alive=false`, so the existing `aliveCount===0 → onWaveCleared` (L1805) fires. Confirm a captured (alive=false) tank still counts as cleared.

- [ ] **Step 3: Verify (live)** — destroy → +3 keys + full cash + score banner; capture → +1 key + 40 % cash; wave clears either way. Console clean.

- [ ] **Step 4: Commit** — `git commit -am "feat(tank): asymmetric destroy/capture rewards"`

---

### Task 13: ERA reactive-armor zones (real `_tankHitZone` + `_eraReact`) (§3/§13.1)

**Files:**
- Modify: `src/game.js` — `_tankHitZone`, `_eraReact`.

- [ ] **Step 1: Classify blast position in the tank's local frame**

```js
  _tankHitZone(e, hp) {
    if (!hp) return { era: false, id: 'weak' };
    const dx = hp.x - e.pos.x, dz = hp.z - e.pos.z;            // world offset
    const c = Math.cos(-e.hullYaw), s = Math.sin(-e.hullYaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;          // local (forward = +z)
    const top = hp.y > e.pos.y + 2.2;                          // roof/engine-deck = weak
    const low = hp.y < e.pos.y + 0.9;                          // tracks/running gear = weak
    const front = lz > 0.6, side = Math.abs(lx) > Math.abs(lz);
    // ERA covers the upper front glacis + forward sides; rear/roof/low are bare
    if (!top && !low && (front || (side && lz > -1.5))) return { era: true, id: front ? 'glacisF' : (lx < 0 ? 'sideL' : 'sideR') };
    return { era: false, id: 'weak' };
  }
```

- [ ] **Step 2: `_eraReact` — defeat the blast, consume the brick**

```js
  _eraReact(e, zone) {
    e.eraSpent[zone.id] = true;
    const c = new THREE.Vector3(e.pos.x, e.pos.y + 1.6, e.pos.z);
    this.game.effects.explosion(c, 1.6); this.game.audio.tone(420, 0.05, 'square', 0.3);
    this.game.hud.bigMessage('ERA — NO EFFECT', 'hit the REAR, ROOF or TRACKS');
    // Phase 3: hide the matching ERA brick mesh (blown off).
  }
```

- [ ] **Step 3: Verify (live)** — `__dbgTank()`. Bazooka the **front** → ERA pop, 0 damage, "ERA — NO EFFECT" hint. Bazooka the **rear/tracks** → `armorHP` drops. Lure a charger to the tracks → it damages armor (low = weak). Second front hit on the same spot (now `spent`) → damages. Console clean.

- [ ] **Step 4: Commit** — `git commit -am "feat(tank): ERA zones defeat frontal explosives; flank for weak spots"`

---

### Task 14: Dramatic entrance + audio polish (§13.2/§7)

**Files:**
- Modify: `src/game.js` — `_spawnBoss` tank path; `_bossTank` (engine/servo loops).

- [ ] **Step 1: Entrance** — spawn the tank at the nearest open **map-edge** spawn (not a random inner point), give it an `entering` flag and a target arena point; while `entering`, drive in with engine roar + dust + the `T-90M «MITRI» ROLLS IN` banner, then clear the flag and begin normal combat. Add to `_bossTank`:
```js
    if (e.entering) {
      const d = Math.hypot(e.entryTarget.x - e.pos.x, e.entryTarget.z - e.pos.z);
      if (d < 6) e.entering = false;
      // (drive toward entryTarget using the same steering; suppress cannon while entering)
    }
```

- [ ] **Step 2: Engine + servo audio** — in `_bossTank`, a looping low diesel rumble tied to speed, a track-squeak tick, and servo whir while `|dT|`/elevation are changing. Use the existing `audio.tone/noise` at low volume on short cadences.

- [ ] **Step 3: Verify (live)** — `__dbgTank()` → tank rolls in from an edge with roar/dust + banner, then fights. Engine/servo audio present, not spammy. Console clean.

- [ ] **Step 4: Commit** — `git commit -am "feat(tank): dramatic entrance + engine/servo audio"`

### Phase 1 verification gate
- [ ] Full play to a tank boss wave (not just debug): both outcomes reachable; Tolo waves unchanged; long-run no-stuck; console clean. Screenshot each outcome.

---

## Phase 2 — Capture & drive (CapturedTank crew system, §12)

### Task 15: `CapturedTank` class + seats + board/exit/seat-switch (2-player-ready)

**Files:**
- Modify: `src/game.js` — new `class CapturedTank` near `MountedGun` (~L2111); `Game` ctor (hold `this.capturedTank`); `_tankCaptured` instantiates it; KeyE/KeyQ handling (L2462); update loop (L2645).

- [ ] **Step 1: Class skeleton with seat abstraction**

```js
class CapturedTank {
  constructor(game, group, pos, yaw) {
    this.game = game; this.group = group; this.pos = pos.clone(); this.hullYaw = yaw || 0;
    this.turYaw = yaw || 0; this.gunPitch = 0; this.hp = this.hpMax = 2200;
    this.cannonAmmo = 16; this.cannonCD = 0; this.mgAmmo = 250; this.mgReload = 0;
    this.seats = { driver: { occupant: null }, gunner: { occupant: null } };
    this.active = null;      // 'driver' | 'gunner' | null (nobody local aboard)
    this.thermal = true; this.stance = 'sight'; // gunner: 'sight' | 'peek'
    this.group.visible = true; this.group.position.copy(this.pos); this.group.rotation.y = this.hullYaw;
  }
  near(p) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 4.5; }
  enter(seat) { this.seats[seat].occupant = 'local'; this.active = seat; this.game.player.inTank = this; this.game.weapons.group.visible = false; this.game.audio.reloadIn(); }
  switchSeat() { this.active = this.active === 'driver' ? 'gunner' : 'driver'; this.stance = 'sight'; this.game.audio.uiClick(); }
  leave() { if (this.active) this.seats[this.active].occupant = null; this.active = null; this.game.player.inTank = null; this.game.weapons.group.visible = true;
    const bx = Math.sin(this.hullYaw + 1.6), bz = Math.cos(this.hullYaw + 1.6);
    this.game.player.pos.set(this.pos.x + bx * 3, 0, this.pos.z + bz * 3); }
}
```

- [ ] **Step 2: Capture instantiates it** — replace the Phase-2 TODO in `_tankCaptured`:
```js
    this.game.capturedTank = new CapturedTank(this.game, e.tankGroup, e.pos.clone(), e.hullYaw);
    e.tankGroup = null; // ownership transferred to the vehicle (don't let clearAll hide it)
```

- [ ] **Step 3: Context-gated input** — in the keydown handler (L2462), before the existing mount branch:
```js
      const ct = this.capturedTank;
      if (ct && this.player.inTank === ct) {
        if (code === 'KeyE') { ct.leave(); return; }
        if (code === 'KeyQ') { ct.switchSeat(); return; }
        if (code === 'KeyT' && ct.active === 'gunner') { ct.thermal = !ct.thermal; return; }
        if (code === 'KeyC' && ct.active === 'gunner') { ct.stance = ct.stance === 'sight' ? 'peek' : 'sight'; return; }
      } else if (code === 'KeyE' && ct && ct.near(this.player.pos)) { ct.enter('driver'); return; }
```

- [ ] **Step 4: Drive control hook in the update loop** — alongside the mountedGun block (L2645):
```js
    if (this.player.inTank) { this.player.inTank.controlUpdate(dt); }
```
Add a `controlUpdate(dt)` to `CapturedTank` that dispatches to `_driver(dt)` / `_gunner(dt)` (filled in next tasks); for now stub camera to follow the tank.

- [ ] **Step 5: Interact prompt** — near the mountedGun prompt (L2661), add: if `capturedTank` near and not aboard → `setInteract('Press <b>E</b> to commandeer the T-90M')`; if aboard → `Press E exit · Q seat · (gunner) T thermal · C peek`.

- [ ] **Step 6: Verify (live)** — capture the tank (debug: `vulnerable=true`, shoot Mitri). Walk up → prompt; E boards (driver); Q switches to gunner; E exits and you pop out beside it. Console clean.

- [ ] **Step 7: Commit** — `git commit -am "feat(captank): vehicle class + seats + board/switch/exit"`

---

### Task 16: Driver station — periscope view + driving

**Files:**
- Modify: `src/game.js` — `CapturedTank._driver`; `index.html` — periscope overlay div + CSS.
- [ ] **Step 1: Drive + periscope camera** — `_driver(dt)`: read WASD from `input`, turn `hullYaw` (A/D), throttle forward/reverse (W/S) with the same large-circle building collision as the boss tank (factor it into a shared `_driveCollide(pos,yaw)` helper reused by both). Move `this.pos`, set `group.position/rotation`. Place the camera at the driver hatch looking forward along `hullYaw`; show a letterbox **periscope overlay** (`#periscope` div: narrow slit, black mask) and hide it for other views.
- [ ] **Step 2: Periscope overlay** in `index.html` (`#periscope`, full-screen black with a horizontal transparent slot; `.show` toggled).
- [ ] **Step 3: Verify (live)** — board driver: WASD drives the heavy tank around (collides with buildings, ground-only), letterbox slit view. No weapons here. Console clean.
- [ ] **Step 4: Commit** — `git commit -am "feat(captank): driver periscope view + driving"`

---

### Task 17: Gunner station — aim + fire cannon/MG with limited ammo

**Files:**
- Modify: `src/game.js` — `CapturedTank._gunner` (sight stance, firing).
- [ ] **Step 1: Aim + fire** — `_gunner(dt)` when `stance==='sight'`: mouse drives `turYaw` (slow) + `gunPitch`; camera sits down the gun sight along `turYaw/gunPitch`; **LMB** fires a cannon shell (reuse the shell list/`_tankFireCannon`-style spawn but it damages **enemies** via `damageInRadius(p, radius, dmg, null, hitPoint)` and ERA-respecting on enemy tanks; decrement `cannonAmmo`, ~3.5 s reload); **RMB** fires the MG (reuse the MG tracer logic, decrement `mgAmmo`, reload). When `cannonAmmo<=0` show "OUT OF SHELLS — MG only". Run-over: any weak enemy within the hull footprint while moving is killed.
- [ ] **Step 2: Apply turret/gun transforms** to `group.userData.turret/gunMantlet` so the model aims where you look.
- [ ] **Step 3: Verify (live)** — gunner seat: mouse traverses turret slowly + elevates gun; LMB lobs an AoE shell that shreds Engendros (16 shells then reload); RMB MG mows them; driving over swarmers kills them. Console clean.
- [ ] **Step 4: Commit** — `git commit -am "feat(captank): gunner aim + cannon/MG with limited ammo + run-over"`

---

### Task 18: Thermal sight (T toggle) + day optic + Cyrillic HUD

**Files:**
- Modify: `src/game.js` — render path (engine) thermal post-process; `CapturedTank` thermal flag. `index.html` — sight overlay + Cyrillic labels + CSS.
- [ ] **Step 1: Thermal post-process** — add an `EffectComposer`-free cheap approach: a fullscreen overlay shader pass OR (simpler, no extra deps) render normally but, while `gunner && thermal`, apply a CSS/canvas overlay that desaturates + a thermal gradient is faked by tinting, AND force enemies bright by swapping their material emissive (toggle a `thermalOn` that sets enemy meshes' `material.emissive` to white-hot while active, restore on exit). Prefer a real RT+LUT shader if time allows; document the chosen method inline.
- [ ] **Step 2: Day optic** — `thermal===false`: normal render + reticle + slight zoom (narrow FOV) only.
- [ ] **Step 3: Cyrillic sight HUD** (`index.html` `#tanksight`): reticle + `«ТЕПЛО»`/`«ДЕНЬ»` mode label (toggles with T), `«ДАЛЬНОСТЬ» <m>` range (distance under reticle, computed via a center ray), `«ЗАРЯД»`/`«ОГОНЬ»` reload/fire state, shell count, `ОЧ` tag, thin bezel. Real Cyrillic strings.
- [ ] **Step 4: Verify (live)** — gunner: **T** toggles white-hot thermal (enemies glow) ↔ day optic; Cyrillic labels + live range readout render; both can fire. Console clean. Screenshot both modes.
- [ ] **Step 5: Commit** — `git commit -am "feat(captank): thermal/day sight toggle + Cyrillic HUD"`

---

### Task 19: Commander peek stance (C) — wide view, no cannon, exposed

**Files:**
- Modify: `src/game.js` — `CapturedTank._gunner` peek branch; player damage exposure.
- [ ] **Step 1: Peek** — `stance==='peek'`: raise the camera above the cupola (free mouse-look, wide FOV, no sight overlay), animate `group.userData.hatch` open + rise; **disable cannon/MG fire** (gate fire on `stance==='sight'`); mark the player **exposed** so enemy attacks that normally hit the player still land (the tank doesn't shield you while head-out) — e.g., set a flag the enemy melee/laser/MG checks honor by using the tank position as the player's effective position while peeking.
- [ ] **Step 2: Verify (live)** — gunner: **C** pops you out for a wide look-around; cannon won't fire; an enemy can hurt you while peeked; **C** again drops back to the sight where the cannon works. Console clean.
- [ ] **Step 3: Commit** — `git commit -am "feat(captank): commander peek stance (no cannon, exposed)"`

---

### Task 20: Captured-tank HP, taking damage, destruction → wreck + eject

**Files:**
- Modify: `src/game.js` — enemy explosions/contact damage the captured tank; `CapturedTank.hurt`/destruction.
- [ ] **Step 1: Make the captured tank damageable** — in `EnemyManager.damageInRadius` and charger contact, also test the `game.capturedTank` (if present): explosions within radius call `capturedTank.hurt(dmg)`; the boss-Tolo laser check can also hit it. Add `CapturedTank.hurt(d)` → `this.hp -= d`; HUD shows a vehicle HP bar while aboard; at `hp<=0` → `destroy()`.
- [ ] **Step 2: `destroy()`** — big explosion, eject the player (`leave()` + `player.hurt(35)`), convert to the **permanent wreck obstacle** (`world.addWreckObstacle(this.pos, this.hullYaw)` + hide/replace group), clear `game.capturedTank`.
- [ ] **Step 3: Verify (live)** — drive into a pack of exploders → vehicle HP drops; at 0 it blows, ejects you (you take a hit), leaves a wreck you can't drive through. Console clean.
- [ ] **Step 4: Commit** — `git commit -am "feat(captank): own HP, destruction, eject, wreck"`

---

### Task 21: Lifecycle + tank-vs-tank (§14.4/§14.5)

**Files:**
- Modify: `src/game.js` — pause/resume, `forceReset`-style cleanup on game over/restart, one-active-tank, enemy-tank-vs-your-shells.
- [ ] **Step 1: Lifecycle** — on game over/restart (the methods that call `mountedGun.forceReset()` at L2499/2565/2599), also: eject player from `capturedTank`, dispose its group + thermal target, clear permanent wrecks for a fresh run, null `capturedTank`. Pause: freeze vehicle update + thermal while `state!=='playing'`.
- [ ] **Step 2: One active tank** — capturing while you already drive one: leave the old one parked (friendly, uncrewed) — just don't auto-transfer occupancy.
- [ ] **Step 3: Tank-vs-tank** — your gunner cannon shells call the enemy `damage(e, dmg, 'explosion', hitPoint)` path, so they respect an enemy tank's ERA zones (aim for its rear). Confirm an enemy boss-tank can also `hurt` your captured tank. 
- [ ] **Step 4: Verify (live)** — keep a captured tank into the next boss wave; if it's another tank, duel it (your shells must hit ITS weak zones); game-over cleans everything; restart is fresh. Console clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(captank): lifecycle cleanup + tank-vs-tank"`

### Phase 2 verification gate
- [ ] Capture → board → drive (periscope) → gun (thermal/day/Cyrillic) → peek → take damage → destroyed→wreck; all live, console clean.

---

## Phase 3 — Visual pass (detailed model, rig, FX)

> These are **render-verify-loop** tasks (REQUIRED SUB-SKILL: `voxel-weapon-modeling`). Geometry coordinates are tuned live against the reference images, not pre-written — the checklist + palette + technique below define "done." Keep the `userData` node names from Task 2 so Phase 1/2 logic stays wired.

### Task 22: Detailed `buildTank()` T-90M (desert camo)

**Files:** Modify `src/game.js` — replace placeholder `buildTank` body.
- [ ] **Step 0: Read the accuracy reference** `docs/superpowers/specs/t90m-reference.md` (silhouette priorities + copy-paste model prompt + dimensions). The model MUST read as a T-90M: **low/wide/squat** (width > height, not tall), **exactly 6 large road wheels per side**, **welded ANGULAR turret**, 125 mm smoothbore with thermal sleeve + bore-evacuator bulge and **no muzzle brake**, modular Relikt ERA tiles, side-skirt panel rows, rear bustle + slat cage, smoke-grenade tube clusters on turret sides, busy roof, rear engine-deck grilles. Proportions ≈ gun-forward 9.5 / hull 6.86 / width 3.5 / height 2.3.
- [ ] **Step 1: Build** with `MeshBuilder` + `voxelMaterial`, layered-shading palette (desert 3-tone: sand/brown/olive hi-mid-lo). Part checklist (§6): sloped glacis with split-V ERA blocks; boxy **low/wide** hull; side skirts w/ ERA panel rows; **6 road wheels/side** + rear **drive sprocket** + front idler + return rollers; **trackL/trackR** tread bands; **welded ANGULAR turret** w/ Relikt ERA cheeks + **mangal cage** rear/engine-deck + antenna + commander cupola + panoramic sight + **smoke-grenade tube clusters** on the turret sides; **125 mm smoothbore** (segmented thermal sleeve + bore-evacuator bulge, NO muzzle brake) on `gunMantlet`→`recoilNode`→`muzzle`; **RWS + MG** (`mgMuzzle`); **cupola hatch** (`hatch`) + headlamps (Task 23). Preserve all `userData` names.
- [ ] **Step 2: Render-verify** from 3/4, side, first-person via the skill's loop; iterate until crisp. Screenshot.
- [ ] **Step 3: Commit** — `git commit -am "feat(tank): detailed voxel T-90M model"`

### Task 23: Mitri commander + functional headlights
- [ ] **Step 1: Mitri** voxel bust (yellow, **3 brass button eyes**, X-stitch smile, 2 hair tufts) in `hatch`/`mitri` — matches the plush, used both as the boss commander and the player-peek occupant.
- [ ] **Step 2: Headlamps** — 2 lens+housing meshes + **2 shadowless `THREE.SpotLight`s** parented to the hull front (`userData.headlamps`); each frame ramp intensity on `(1 - dayNightL)` (read `game.dayNight`/`engine.hemi.intensity`), aim with hull facing. Dispose in `clearAll`/destroy.
- [ ] **Step 3: Verify** in PURGE (off, lenses glow) and force a LONG NIGHT (shine, sweep with turning). Commit.

### Task 24: Rig animations
- [ ] Track scroll + wheel/sprocket spin ∝ velocity (reverse → backward); **suspension bob + hull pitch/roll**; **barrel recoil** lerp on `recoilNode` (driven by `e.recoil`); turret yaw + gun elevation already wired; **hatch open + Mitri rise** for the window/peek. Verify smoothness live. Commit.

### Task 25: FX — track marks, dust, engine smoke, tracers, ERA pop, smoke screen
- [ ] **Track-mark decals** (2 fading ground strips behind the tracks, pooled, ~6 s lifetime, capped) + **dust** particles while moving; **engine exhaust smoke** plume (rear deck, thicker in phase 2 + flames); wire `_eraReact` to **hide the matching ERA brick mesh** + a spark/pop; **phase-2 smoke screen** (turret smoke launchers → rolling cloud that briefly obscures the player's view/LOS, on cooldown). Verify + profile FPS in phase 2. Commit.

### Task 26: `buildTankWreck()` + destruction sequence polish
- [ ] Blackened/scorched variant (tilted/popped turret, mangled cage, missing ERA), spawned at `_tankDestroyed`/`CapturedTank.destroy()` at the wreck position; lingering thinning smoke. Verify both outcomes leave a proper wreck. Commit.

### Phase 3 verification gate
- [ ] Model reads as a T-90M from 3 angles + first-person; animations + FX correct; headlights work at night; both wrecks look right; FPS acceptable. Screenshots.

---

## Phase 4 — Onboarding & poster (§14.1)

### Task 27: Teach the two paths + distinct banners
- [ ] First-encounter one-time banner: **"Blow the armor with explosives — or snipe the COMMANDER to STEAL the tank!"**; rare contextual hints from `_armorPing` ("flank the rear or hit the commander") and on first Mitri expose ("Shoot the commander!"); confirm distinct `T-90M DESTROYED` vs `TANK COMMANDEERED!` banners. Verify a new player can discover both paths. Commit.

### Task 28: Poster wall texture + remove debug hook
- [ ] Poster PNG is ready: **`assets/poster-t90m-weakpoints.png`** (the «СЛАБЫЕ МЕСТА Т-90М» weak-points teaching plakat the user generated). Load it as a `THREE.TextureLoader` map on a `THREE.PlaneGeometry` (or a textured wall-box face) mounted flat on a chosen dust2 building wall (pick a flat exterior wall coord near the plaza/spawn so players see it early), at readable height, slightly weathered/`toneMapped` to fit the scene. It teaches the two paths diegetically (commander reticle = capture; rear/roof/tracks = explosive; ERA front = no-pen), reinforcing the Task 27 banners. **Remove the `DEBUG`/`__dbgTank` hook** (Task 2). Verify the poster reads on the wall and debug hooks are gone. Commit.

---

## Self-Review (against the spec)

**Spec coverage:** §1 two outcomes → Tasks 4/5/14/27. §2 random roster → Task 1. §3 two pools + ERA → Tasks 4/13. §4 cannon/MG/ram + LOS/clearance → Tasks 8/9/10. §5 navigation/stuck → Task 7. §6 model/wreck → Tasks 22/26 + 5. §7 HUD/audio/rumble → Tasks 8/11/14. §8 integration hooks → throughout. §9 build staging → phases. §10 knobs → tuned in verify steps. §11 risks → verification gates. §12 capture/drive/seats/views → Tasks 15-21. §13 ERA/entrance/smoke → Tasks 13/14/25. §14 onboarding/rewards/viability/tank-vs-tank/lifecycle → Tasks 12/21/27 + the `mitriHP` cap in Task 1.

**Placeholder scan:** Phase 3 geometry is intentionally a render-verify loop (not a placeholder — exact voxel coords are tuned live per the skill; the part checklist + palette are the spec). Reward-API field names in Task 12 and the thermal-method choice in Task 18 are flagged to match the real code at implementation time. All logic tasks contain runnable code.

**Type consistency:** `armorHP/armorHPmax/mitriHP/mitriHPmax`, `vulnerable`, `hullYaw/turYaw/gunPitch`, `eraSpent{}`, `_tankHitZone(e,hitPoint)→{era,id}`, `damage(e,amount,source,hitPoint)`, `userData.{turret,gunMantlet,recoilNode,muzzle,mgMuzzle,hatch,mitri,headlamps}`, `CapturedTank.{seats,active,stance,thermal}` are used consistently across tasks.

**Keys:** board/exit **E**, seat-switch **Q** (F is fullscreen), thermal **T**, peek **C** — all context-gated.
