# .50-cal Ammo Resupply — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rooftop .50-cal (`MountedGun`) reloadable mid-run via a new `.50 Cal Ammo Can` loot item that drops from supply drops and refills the gun when held and used at the gun (E, or LMB).

**Architecture:** New `fiftyammo` entry in `ITEM_DEFS` with a voxel M2A1-can model; a host-authoritative `MountedGun.reloadFromCan()` helper; an E-key branch (and an LMB `_useConsumable` case) that calls it when holding the can near the gun; a `chc(0.40)` roll in the supply-drop loot table; and a new `fiftyrefill` co-op message so a client can have the host refill the host-owned gun.

**Tech Stack:** Vanilla JS ES modules + Three.js r160. **No build, no test suite, no linter** — verification is manual, in-browser, over an HTTP server, against the `window.GAME` singleton. Serve with `python3 -m http.server 8000` from the worktree root and open `http://localhost:8000/?cb=1` (the `?cb` query forces fresh modules past Chrome's cache).

**Branch / workspace:** isolated git worktree at `/Users/macmini1/game 4.8/.claude/worktrees/feat+fifty-ammo-resupply` (branch `worktree-feat+fifty-ammo-resupply`), off latest `origin/main` (`f65a889`). The spec is `docs/superpowers/specs/2026-06-02-fifty-cal-ammo-resupply-design.md`.

**Convention notes (verified in code):**
- `MeshBuilder`: `b.box(w, h, d, x, y, z, color, opts?)` (opts: `{ tint, rx, ry, rz }`), `b.geo(threeGeometry, x, y, z, color, opts?)`. Finish with `new THREE.Mesh(b.build(), voxelMaterial({ emissive, emissiveIntensity }))`. World viewmodel space: muzzle = −Z, so front-of-can faces +Z here (it is auto-recentered + re-posed by `_poseHeld`).
- The .50-cal instance is `game.mountedGun`; `game.player.mountedGun` is the one you're currently manning (or null).
- `gun.near(playerPos)` is the proximity test used by `canMount`. `gun.setAmmo(n)` clamps to `[0, maxAmmo]`, updates belt/box visuals + HUD. `gun.maxAmmo === 250`.
- `gun._primeCharge()` = `readyToFire=false` + `animateCharge()` (handle pull-back anim) + `_playFiftyCharge()` (the `audio.fiftyCharge()` M2HB rack foley) + `_broadcastFiftySound('charge')` (co-op, no-op solo).
- `inventory.curItem()` → `{ slot, kind } | null`; `inventory._consumeSlot(slotIdx)` removes one item and keeps the same kind in hand if more remain.
- Co-op host check used throughout: `const mp = game.mp; const hostSim = !mp || !mp.active || mp.isHost;`. `mp.net.send(type, data)` = host→all-clients; `mp.net.broadcast(type, data)` = send to peers; `mp.net.sendTo(id, type, data)` = one peer.

---

### Task 1: New `fiftyammo` item — registry, ground model, held viewmodel

**Files:**
- Modify: `src/loot.js` — `ITEM_DEFS` (after the `ammo` line, ~19) and `_pickupMesh(kind)` (add a new `if (kind === 'fiftyammo')` block, before the final `// armor plate` fallthrough at ~242).
- Modify: `src/inventory.js` — `_buildItemModels()` `makers` map (~453-461).

- [ ] **Step 1: Register the item in `ITEM_DEFS`**

In `src/loot.js`, add this line to `ITEM_DEFS` immediately after the `ammo:` entry:

```js
  fiftyammo: { name: '.50 Cal Ammo Can', class: 'consumable', icon: '🟩', mesh: 'fiftyammo' }, // resupplies the rooftop .50-cal (M2HB) — used at the gun, not on hand weapons
```

- [ ] **Step 2: Build the M2A1 ammo-can voxel model**

In `src/loot.js`, inside `_pickupMesh(kind)`, add this block just before the `// armor plate` fallthrough (the bare `b.box(0.3, 0.34, ...)` lines near the end of the method):

```js
    if (kind === 'fiftyammo') { // US M2A1 .50-cal ammo can: olive-drab steel, hinged lid + front toggle latch, folding wire bail, yellow stencil rows
      const od = 0x4a5a2e, odHi = 0x6a7c42, odLo = 0x32401d, odSlot = 0x1f280f, odEdge = 0x808e4c; // olive-drab steel
      const mt = 0x6f7563, mtHi = 0x909686, mtDk = 0x383b2f;                                       // bare-steel fittings (latch/hinge)
      const wire = 0x2b2e22;                                                                       // dark-steel wire bail handle
      const stencil = 0xd8c038, stencilHi = 0xeede5a;                                              // yellow stencil paint
      // ---- body ----
      b.box(0.52, 0.32, 0.20, 0, -0.02, 0, od, { tint: 0.025 });        // main body
      b.box(0.50, 0.05, 0.20, 0, 0.155, 0, odHi);                       // lit lid top
      b.box(0.532, 0.035, 0.212, 0, -0.195, 0, odLo);                   // shadow base
      b.box(0.522, 0.016, 0.205, 0, 0.10, 0, odSlot);                   // lid seam (recess)
      b.box(0.51, 0.02, 0.205, 0, 0.125, 0, odHi);                      // lid lip (lit)
      b.box(0.016, 0.30, 0.022, -0.255, -0.02, 0.095, odEdge);          // front-left edge highlight
      b.box(0.016, 0.30, 0.022, 0.255, -0.02, 0.095, odEdge);          // front-right edge highlight
      b.box(0.44, 0.24, 0.012, 0, -0.05, 0.103, odLo, { tint: 0.02 }); // recessed front stencil panel (darker inset)
      // ---- yellow stencil rows (segmented blocks read as M2A1 markings) ----
      const rows = [
        { y: 0.045, segs: [[-0.13, 0.09], [-0.005, 0.05], [0.10, 0.10]] }, // 100 CRTG .50 CAL
        { y: 0.005, segs: [[-0.04, 0.14]] },                               // LINK M9
        { y: -0.035, segs: [[-0.08, 0.06], [0.04, 0.10]] },                // 4-BALL M33
        { y: -0.075, segs: [[-0.10, 0.07], [0.03, 0.12]] },                // 1-TRACER M17
        { y: -0.115, segs: [[-0.06, 0.20]] },                              // LC- lot number
      ];
      for (const row of rows) for (const [sx, sw] of row.segs) b.box(sw, 0.018, 0.006, sx, row.y, 0.112, stencil);
      b.box(0.09, 0.018, 0.006, -0.13, 0.045, 0.1125, stencilHi);       // brightest highlight on the top "100" group
      // ---- lid hinge (back, along X) + knuckles ----
      const hg = new THREE.CylinderGeometry(0.012, 0.012, 0.46, 8); b.geo(hg, 0, 0.12, -0.105, mt, { rz: Math.PI / 2 }); hg.dispose();
      for (const hx of [-0.18, 0, 0.18]) b.box(0.04, 0.04, 0.03, hx, 0.12, -0.10, mtDk);
      // ---- front toggle latch (center of the lid lip) ----
      b.box(0.11, 0.06, 0.04, 0, 0.10, 0.108, mt);                      // latch backplate
      b.box(0.08, 0.05, 0.05, 0, 0.118, 0.118, mtHi);                   // upper catch (lit)
      b.box(0.07, 0.10, 0.03, 0, 0.05, 0.13, mtDk, { rz: 0.06 });       // toggle lever hanging down
      b.box(0.06, 0.025, 0.045, 0, -0.005, 0.126, mtHi);                // hook tip
      // ---- folding wire bail handle (pivots at back-top corners, arches forward over the lid) ----
      b.box(0.035, 0.05, 0.035, -0.215, 0.165, -0.05, mt);             // left pivot post
      b.box(0.035, 0.05, 0.035, 0.215, 0.165, -0.05, mt);             // right pivot post
      b.box(0.022, 0.12, 0.022, -0.205, 0.225, 0.0, wire, { rx: -0.45 }); // left bail leg
      b.box(0.022, 0.12, 0.022, 0.205, 0.225, 0.0, wire, { rx: -0.45 });  // right bail leg
      b.box(0.45, 0.022, 0.022, 0, 0.275, 0.045, wire);               // bail cross-bar (grip)
      return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x1a2410, emissiveIntensity: 0.5 }));
    }
```

- [ ] **Step 3: Register the held viewmodel**

In `src/inventory.js`, inside `_buildItemModels()`, add `fiftyammo` to the `makers` object (put it next to `ammo`):

```js
      ammo: () => loot._pickupMesh('ammo'), fiftyammo: () => loot._pickupMesh('fiftyammo'), splint: () => loot._pickupMesh('splint'), airbeacon: () => loot._pickupMesh('airbeacon'),
```

- [ ] **Step 4: Verify the model renders (ground + in hand)**

Serve the worktree (`python3 -m http.server 8000`) and open `http://localhost:8000/?cb=1`. Start a run, then in the console:

```js
GAME.inventory.addItem('fiftyammo', 1);   // put a can in the backpack
// scroll to it (mouse wheel) → the held viewmodel should show the olive can with yellow stencil rows + wire bail
GAME.loot._spawnPickup('fiftyammo', new THREE.Vector3(GAME.player.pos.x + 2, 0.55, GAME.player.pos.z), 1);  // a ground pickup nearby
```

Expected: the held model is a green M2A1 can with a wire handle and yellow markings (clearly different from the existing 📦 Soviet ammo box); the ground pickup floats/rotates and reads the same. No console errors. If proportions/stencil look off, refine the box values per the **voxel-weapon-modeling** skill's render-verify loop before committing.

- [ ] **Step 5: Commit**

```bash
git add src/loot.js src/inventory.js
git commit -m "$(printf 'feat(fifty-ammo): add .50-cal ammo can item + voxel model\n\nNew fiftyammo ITEM_DEFS entry, an M2A1 ammo-can _pickupMesh model\n(olive steel, wire bail, front latch, yellow stencil rows), and its\nheld viewmodel. No behaviour wired yet.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 2: `MountedGun.reloadFromCan()` reload helper

**Files:**
- Modify: `src/weapons.js` — add a method to `MountedGun`, next to `_primeCharge()` (~1564-1569).

- [ ] **Step 1: Add the helper**

In `src/weapons.js`, inside `class MountedGun`, add this method immediately after `_primeCharge()`:

```js
  // Reload the belt to full from a carried .50-cal ammo can. Host/solo apply it directly and
  // (in co-op) sync the new belt to clients; a client asks the host (the gun is host-owned).
  // Returns true when the can should be CONSUMED (a reload happened / was requested), false on reject.
  reloadFromCan() {
    if (this.ammo >= this.maxAmmo) return false;        // already full — keep the can
    const mp = this.game.mp;
    const hostSim = !mp || !mp.active || mp.isHost;
    if (hostSim) {
      this.setAmmo(this.maxAmmo);
      this._primeCharge();                              // rack anim + foley (+ co-op: broadcasts 'fiftysound' charge)
      if (mp && mp.active && mp.isHost) mp.net.send('fiftystate', { occ: this.occupant, ammo: this.ammo }); // push the refilled belt to clients
    } else {
      mp.net.send('fiftyrefill', {});                   // client → host: refill the host-owned gun (host echoes 'fiftystate' + 'fiftysound')
      this.animateCharge(); this._playFiftyCharge();    // local responsiveness; ammo arrives via the host's 'fiftystate'
    }
    if (this.game.hud && this.game.hud.toast) this.game.hud.toast('.50 CAL · ' + this.maxAmmo + ' / ' + this.maxAmmo, 0xe8c84a);
    return true;
  }
```

- [ ] **Step 2: Verify the helper (solo) via console**

Reload the page (`?cb=2`). Start a run. In the console:

```js
const g = GAME.mountedGun;
g.setAmmo(40);                 // simulate a low belt
g.ammo;                        // 40
g.reloadFromCan();             // expect: true, a charge sound, HUD/console below shows 250
g.ammo;                        // 250
g.reloadFromCan();             // expect: false (already full), no sound, can would be kept
```

Expected: first call returns `true` and sets `ammo` to 250 with the M2HB rack sound; second returns `false`. No console errors.

- [ ] **Step 3: Commit**

```bash
git add src/weapons.js
git commit -m "$(printf 'feat(fifty-ammo): MountedGun.reloadFromCan() host-authoritative refill\n\nFull belt refill from a carried can; host/solo apply + sync, client\nrequests via a fiftyrefill message (wired host-side in a later task).\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 3: Reload on E (hold the can, stand at the gun)

**Files:**
- Modify: `src/inventory.js` — add `tryReloadFiftyCan()` (place it next to `_useConsumable`, ~368).
- Modify: `src/game.js` — `KeyE` chain (~174-176), insert a branch before the mount branch.

- [ ] **Step 1: Add the inventory helper**

In `src/inventory.js`, add this method (e.g. right after `_useConsumable(...)` closes at ~368):

```js
  // E at the rooftop .50-cal while holding a .50-cal ammo can: reload the gun, consume the can.
  // Returns true if it handled the press (so the E chain stops before trying to mount).
  tryReloadFiftyCan() {
    const c = this.curItem();
    if (!c || c.kind !== 'fiftyammo') return false;
    const gun = this.game.mountedGun;
    if (!gun || typeof gun.reloadFromCan !== 'function' || !gun.near(this.game.player.pos) || gun.ammo >= gun.maxAmmo) return false;
    if (gun.reloadFromCan()) { this._consumeSlot(c.slot); return true; }
    return false;
  }
```

- [ ] **Step 2: Wire it into the E chain**

In `src/game.js`, in the `KeyE` block, insert the reload branch **between** the dismount branch and the `canMount` branch. The block becomes:

```js
        // ---- .50 cal + loot ----
        if (this.player.mountedGun) this.player.mountedGun.dismount();
        else if (this.inventory.tryReloadFiftyCan()) { /* reloaded the .50-cal from a carried ammo can */ }
        else if (this.mountedGun.canMount(this.player.pos)) this.mountedGun.mount();
        // ---- CapturedTank: board (gate by proximity, not currently on .50 cal) ----
        else if (_ct && _ct.near(this.player.pos) && !this.player.mountedGun) { _ct.enter('driver'); }
```

(Only the one `else if (this.inventory.tryReloadFiftyCan()) { ... }` line is new; the surrounding lines are unchanged context.)

- [ ] **Step 3: Verify in-browser (solo)**

Reload (`?cb=3`). Start a run, walk to the rooftop .50-cal. Then:

```js
GAME.inventory.addItem('fiftyammo', 1);   // give yourself a can
GAME.mountedGun.setAmmo(0);               // empty the gun
// scroll to the can so it is in hand, stand next to the gun, press E
```

Expected: pressing **E** while holding the can next to the gun plays the rack sound, toasts `.50 CAL · 250 / 250`, removes the can from the backpack, and does **not** mount you. Pressing E again (no can now) mounts the gun normally. With the gun already full, E mounts instead of reloading.

- [ ] **Step 4: Commit**

```bash
git add src/inventory.js src/game.js
git commit -m "$(printf 'feat(fifty-ammo): reload the .50-cal with E while holding a can\n\nE chain tries the reload before mount; consumes the can only on a\nsuccessful refill, otherwise falls through to normal mount/loot.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 4: LMB also reloads (forgiving, never wastes the can)

**Files:**
- Modify: `src/inventory.js` — `_useConsumable(kind, slotIdx)` (~356-368), add a `fiftyammo` case.

- [ ] **Step 1: Add the `fiftyammo` consumable case**

In `src/inventory.js`, inside `_useConsumable`, add this branch after the `ammo` case and before the `splint` case:

```js
    else if (kind === 'fiftyammo') {
      const gun = this.game.mountedGun;
      if (!gun || typeof gun.reloadFromCan !== 'function' || !gun.near(p.pos)) { this.game.hud.toast('Stand at the .50 cal to reload it', 0xd23a2a); used = false; }
      else if (gun.ammo >= gun.maxAmmo) { this.game.hud.toast('.50 cal ammo full', 0xb88a3a); used = false; }
      else { used = gun.reloadFromCan(); }   // success toasts + racks inside reloadFromCan
    }
```

- [ ] **Step 2: Verify in-browser (solo)**

Reload (`?cb=4`). Start a run.

```js
GAME.inventory.addItem('fiftyammo', 1);
GAME.mountedGun.setAmmo(120);
// hold the can; LEFT-CLICK while NOT near the gun → toast "Stand at the .50 cal to reload it", can kept
// walk to the gun, hold the can, LEFT-CLICK → reloads to 250, can consumed
// hold another can, gun full, LEFT-CLICK → toast ".50 cal ammo full", can kept
```

Expected: LMB mirrors E at the gun, and never consumes the can when it can't reload (away from the gun, or already full). No console errors.

- [ ] **Step 3: Commit**

```bash
git add src/inventory.js
git commit -m "$(printf 'feat(fifty-ammo): LMB reloads the .50-cal too (never wastes a can)\n\n_useConsumable fiftyammo case mirrors the E reload; rejects (away from\nthe gun / already full) keep the can.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 5: Drop the can from supply drops (~40%)

**Files:**
- Modify: `src/loot.js` — `_spillDropLoot(pos, give, opener)` (~459).

- [ ] **Step 1: Add the 40% roll**

In `src/loot.js`, in `_spillDropLoot`, add this line immediately after the existing radio-drop line (`if (this._radiosInPlay() === 0 && chc(0.30)) items.push(['radio', 1]);`):

```js
    if (chc(0.40)) items.push(['fiftyammo', 1]); // 🟩 40% chance: a .50-cal ammo can to resupply the rooftop M2HB
```

- [ ] **Step 2: Verify in-browser (solo)**

Reload (`?cb=5`). Start a run. Trigger several supply drops straight to the loot spill and watch for the can:

```js
for (let i = 0; i < 12; i++) GAME.loot._spillDropLoot(GAME.player.pos.clone(), GAME.loot._rollGive());
// look at the scattered pile — roughly ~40% of these bursts should include a green M2A1 can
GAME.loot._spawnPickup && null;
```

Expected: the can appears in the scattered loot at roughly the chosen rate; walking onto it + E adds it to the backpack with the toast `Picked up 🟩 .50 Cal Ammo Can`. No console errors.

- [ ] **Step 3: Commit**

```bash
git add src/loot.js
git commit -m "$(printf 'feat(fifty-ammo): supply drops yield a .50-cal ammo can (~40%%)\n\nIndependent chc(0.40) roll in _spillDropLoot, riding the existing\nhost-authoritative supply-drop + pickup sync.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 6: Co-op — `fiftyrefill` host handler

**Files:**
- Modify: `src/mp.js` — register the handler near the other fifty handlers (~583-597) and add `_hostFiftyRefill()` next to `_hostFiftyClaim()` (~642-647).

- [ ] **Step 1: Register the message handler**

In `src/mp.js`, add this line right after the `fiftyaim` registration (`n.on('fiftyaim', ...)` at ~597):

```js
    n.on('fiftyrefill', (d, from) => { if (this.isHost) this._hostFiftyRefill(from); }); // client → host: reload the host-owned .50cal from a carried can
```

- [ ] **Step 2: Add the host handler**

In `src/mp.js`, add this method immediately after `_hostFiftyClaim(...)` closes (after the line `this._applyFiftyState(...); this.net.send('fiftystate', ...)` block at ~647):

```js
  _hostFiftyRefill(from) {
    if (!this.isHost) return; const gun = this.game.mountedGun; if (!gun) return;
    if (gun.ammo >= gun.maxAmmo) return;                                  // already full — the client wasted nothing it can detect; ignore
    gun.setAmmo(gun.maxAmmo);
    if (typeof gun.animateCharge === 'function') gun.animateCharge();     // host-local rack anim
    this.net.send('fiftystate', { occ: gun.occupant, ammo: gun.ammo });  // sync the new belt to all clients
    this.net.broadcast('fiftysound', { pid: this.myId, k: 'charge' });   // everyone hears/sees the rack
  }
```

- [ ] **Step 3: Verify (logic review + 2-peer if available)**

Static review against the spec: a client holding a can at the gun → `reloadFromCan()` client branch sends `fiftyrefill` and plays a local rack → host validates `ammo < max`, sets 250, broadcasts `fiftystate` (every peer's `setAmmo(250)`) + `fiftysound charge`. The `fiftysound` handler ignores `d.pid === this.myId`, so no double sound. Confirm the registration sits with the other `fifty*` handlers and `_hostFiftyRefill` mirrors `_hostFiftyClaim`'s send pattern (`this.net.send('fiftystate', ...)`).

If two machines/tabs are available: host one room, client joins; client picks up a can (from a supply drop), empties the gun, reloads at the gun — confirm the host's belt shows 250 and the rack FX play on both, and the can is consumed only on the client.

- [ ] **Step 4: Commit**

```bash
git add src/mp.js
git commit -m "$(printf 'feat(fifty-ammo): co-op fiftyrefill — host refills the .50cal for a client\n\nNew client->host fiftyrefill message; host sets the belt to max and\nbroadcasts fiftystate + the charge foley so every peer syncs.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 7: Cache-bust ritual + final end-to-end verification

**Files:**
- Modify: `index.html` (~783) and `src/game.js` (`GAME_BUILD`, ~30).

- [ ] **Step 1: Bump the entry version**

In `index.html`, change the entry script query from `?v=197` to `?v=198`:

```html
  <script type="module" src="./src/game.js?v=198"></script>
```

- [ ] **Step 2: Bump `GAME_BUILD`**

In `src/game.js`, set `GAME_BUILD` to the current local minute, e.g.:

```js
const GAME_BUILD = '2026-06-02 22:30';
```

(Use the actual current `YYYY-MM-DD HH:MM` at implementation time.)

- [ ] **Step 3: Final manual end-to-end verification**

Reload at `http://localhost:8000/?v=198` (or `?cb=final`). Confirm the full loop solo:
1. Man the .50-cal, fire the belt down to a low/empty count.
2. Trigger a supply drop (`GAME.loot.callSupplyDrop()` or use a Vysílačka), open it with E, and pick up a dropped can.
3. Stand at the gun holding the can, press **E** → belt back to `250 / 250`, rack sound, can consumed. Repeat with LMB.
4. Confirm the menu/lobby footer shows `v198` and the new `GAME_BUILD`.

Expected: the gun is reloadable for the rest of the run; no console errors; HUD reads `250 / 250` after each reload.

- [ ] **Step 4: Commit**

```bash
git add index.html src/game.js
git commit -m "$(printf 'chore(fifty-ammo): cache-bust v198 + GAME_BUILD for the .50cal resupply\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| New `fiftyammo` item + M2A1 model, distinct from generic ammo box, picks up to backpack | Task 1 (+ confirmed `_applyGrant`/`tryPickupNearby` route generic kinds to `addItem`) |
| Full refill to `maxAmmo`, allowed any time `ammo < maxAmmo` | Task 2 (`reloadFromCan`: `setAmmo(maxAmmo)`, gated `ammo >= maxAmmo → reject`) |
| Reload via E at the gun, before mount; consume only on success | Task 3 |
| LMB also reloads, never wastes the can | Task 4 |
| ~40% supply-drop chance, host-authoritative via existing sync | Task 5 |
| Co-op `fiftyrefill` (client→host), host sets ammo + broadcasts state & charge | Task 6 |
| Charge anim + foley on reload | Tasks 2/6 (`_primeCharge` / `animateCharge` + `_playFiftyCharge` / `fiftysound`) |
| Feedback toasts (success / full / not-at-gun) | Tasks 2 (success), 4 (full / not-at-gun) |
| Cache-bust at the end | Task 7 |

No gaps.

**2. Placeholder scan:** No TBD/TODO; every code step shows the actual code; the only variable left to the implementer is the literal `GAME_BUILD` timestamp (Task 7 Step 2), which must be the real wall-clock minute at build time.

**3. Type/name consistency:** `reloadFromCan()` (Tasks 2, 3, 4), `tryReloadFiftyCan()` (Tasks 1-context, 3), `_hostFiftyRefill()` + message `fiftyrefill` (Tasks 2-client-branch, 6), item kind `fiftyammo` and mesh key `fiftyammo` (Tasks 1, 3, 4, 5) all match across tasks. `setAmmo`/`maxAmmo`/`near`/`_primeCharge`/`animateCharge`/`_playFiftyCharge`/`curItem`/`_consumeSlot` are all verified against the current source.

**Note on ordering:** Solo play works fully after Tasks 1-5. Task 6 only adds the co-op client→host path; the client branch in `reloadFromCan` (Task 2) sends a message that does nothing until Task 6 registers its handler — harmless in solo, so the order is safe.
