# Weapon Realism Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retune the entire weapon roster to a realistic WW2 feel (strict ammo) and add recoil-buildup patterns, a bolt-cycle lockout, Garand en-bloc reload, per-shell shotgun reload, and melee friendly fire in co-op.

**Architecture:** All gameplay numbers live in the `WEAPONS` registry in `src/weapons.js`; firing/reload/recoil run in the `WeaponSystem` class in the same file. New per-weapon behaviors are data flags (`recoilClimb`, `recoilYaw`, `boltCycle`, `enBloc`, `shellReload`) read by small additions to `_fire` / `tryFire` / `_finishReload` / `update`. Recoil's new horizontal kick is applied to the camera in `src/player.js`. Co-op melee friendly fire adds one method to `src/mp.js` and one loop to `_melee`. Three procedural sounds are added to `src/audio.js`.

**Tech Stack:** Vanilla ES modules + Three.js r160, no build/test/bundler. **Verification is manual / in-browser** against the `window.GAME` singleton — there is no test harness. Data-value checks use a live `await import('/src/weapons.js?cb='+Date.now())` in the browser console; behavior checks are played and observed.

---

## Verification preamble (read once)

There are **no automated tests** in this project (see `CLAUDE.md`). For every task, "verify" means:

1. Serve the repo: `python3 -m http.server 8000` (run from the repo root).
2. Open `http://localhost:8000/?cb=<pick-any-number>` (the `?cb=` busts Chrome's module cache; bump it each reload).
3. Open the DevTools console and run the listed checks. For data checks, load the live module:
   ```js
   const { WEAPONS } = await import('/src/weapons.js?cb=' + Date.now());
   ```
4. For behavior checks, start a run (menu → Play), then drive `window.GAME` (e.g. `GAME.weapons.cur`, `GAME.weapons.mag`, `GAME.weapons._boltLock`) and play.

To hold every weapon for testing, give yourself the full arsenal from the console after starting a run:
```js
GAME.meta.loadout = ['knife','luger','revolver','magnum','thompson','ppsh','mp40','grease','carbine','garand','stg44','bar','dp28','shotgun','sawed_off','kar98','mosin','bazooka'];
localStorage.setItem('engendros_meta', JSON.stringify(GAME.meta)); // then restart the run
```
Cycle weapons with the mouse wheel / number keys; the HUD shows mag/reserve.

---

## Task 1: Retune the WEAPONS stat registry (data only)

Pure value changes to the registry: realistic dmg/rpm/mag/reserve/reload/recoil/range/spread/bloom per the spec, strict reserves everywhere (Luger becomes finite `32`, no more `Infinity`), and the bazooka recoilless fix (`recoil: 0.6`). Melee weapons are intentionally **unchanged**. New behavior-flag fields are added in later tasks.

**Files:**
- Modify: `src/weapons.js:19-44` (the firearm rows of `WEAPONS`; melee rows 14-17 and 41 stay as-is)

- [ ] **Step 1: Replace each firearm row with its retuned values**

Replace the Luger row (`weapons.js:19`):
```js
  luger:    { name: 'Luger P08',  class: 'pistol', shape: 'pistol',  dmg: 28, rpm: 300, auto: false, mag: 8,  reserveMax: 32,       reload: 1.8, spread: 0.010, bloom: 0.012, pellets: 1, recoil: 0.7, range: 120, adsFov: 60, price: 400,  color: 0x33373d, accent: 0xd8c089 },
```
Replace the Peacemaker row (`:20`):
```js
  revolver: { name: 'Peacemaker', class: 'pistol', shape: 'revolver',dmg: 70, rpm: 110, auto: false, mag: 6,  reserveMax: 30,       reload: 2.6, spread: 0.008, bloom: 0.010, pellets: 1, recoil: 1.5, range: 130, adsFov: 58, price: 900,  loot: 9, color: 0x4a3320, accent: 0xc9a04a },
```
Replace the Thompson row (`:22`):
```js
  thompson: { name: 'Thompson',   class: 'smg', shape: 'smg',  dmg: 20, rpm: 700, auto: true,  mag: 30, reserveMax: 150, reload: 2.4, spread: 0.024, bloom: 0.03, pellets: 1, recoil: 0.7,  range: 130, adsFov: 62, price: 1200, loot: 12, color: 0x3a2a1c, accent: 0x9c6a32 },
```
Replace the PPSh row (`:23`):
```js
  ppsh:     { name: 'PPSh-41',    class: 'smg', shape: 'drum', dmg: 16, rpm: 1000, auto: true,  mag: 71, reserveMax: 142, reload: 3.2, spread: 0.028,  bloom: 0.022, pellets: 1, recoil: 0.45, range: 150, adsFov: 64, price: 1600, loot: 8,  color: 0x2f2218, accent: 0xb88a3a },
```
Replace the M1 Carbine row (`:25`):
```js
  carbine:  { name: 'M1 Carbine', class: 'rifle', shape: 'carbine', dmg: 32, rpm: 400, auto: false, mag: 15, reserveMax: 90, reload: 1.7, spread: 0.01,  bloom: 0.012, pellets: 1, recoil: 0.55, range: 240, adsFov: 55, price: 1100, loot: 10, color: 0x4a3422, accent: 0x2a2a30 },
```
Replace the M1 Garand row (`:26`):
```js
  garand:   { name: 'M1 Garand',  class: 'rifle', shape: 'garand', dmg: 80, rpm: 270, auto: false, mag: 8,  reserveMax: 64,  reload: 2.6, spread: 0.008, bloom: 0.01,  pellets: 1, recoil: 1.6, range: 340, adsFov: 48, price: 2000, loot: 7,  color: 0x52371f, accent: 0x222226 },
```
Replace the StG 44 row (`:27`):
```js
  stg44:    { name: 'StG 44',     class: 'rifle', shape: 'stg',   dmg: 38, rpm: 560, auto: true,  mag: 30, reserveMax: 150, reload: 2.4, spread: 0.015, bloom: 0.016, pellets: 1, recoil: 0.85, range: 260, adsFov: 54, price: 2400, loot: 6,  color: 0x33373d, accent: 0x6e4a28 },
```
Replace the Trench Gun row (`:29`):
```js
  shotgun:  { name: 'Trench Gun', class: 'shotgun', shape: 'shotgun', dmg: 13, rpm: 80,  auto: false, mag: 6, reserveMax: 36, reload: 2.6, spread: 0.085, bloom: 0, pellets: 9,  recoil: 1.7, range: 55, adsFov: 66, price: 1700, loot: 9, color: 0x3a2418, accent: 0x9c6a32 },
```
Replace the Sawed-Off row (`:30`):
```js
  sawed_off:{ name: 'Sawed-Off',  class: 'shotgun', shape: 'sawed',   dmg: 16, rpm: 200, auto: false, mag: 2, reserveMax: 18, reload: 1.6, spread: 0.14,  bloom: 0, pellets: 12, recoil: 2.9, range: 30, adsFov: 70, price: 1500, loot: 8, color: 0x4a2e1c, accent: 0xc25b3a },
```
Replace the Kar98 row (`:32`):
```js
  kar98:    { name: 'Kar98 Scoped', class: 'sniper', shape: 'sniper', dmg: 165, rpm: 50, auto: false, mag: 5, reserveMax: 35, reload: 2.4, spread: 0.0015, bloom: 0, pellets: 1, recoil: 2.7, range: 500, adsFov: 22, scope: true, price: 2600, loot: 5, color: 0x20242a, accent: 0x6fa8e8 },
```
Replace the .44 Magnum row (`:34`):
```js
  magnum:   { name: '.44 Magnum',  class: 'pistol', shape: 'magnum', dmg: 98, rpm: 95, auto: false, mag: 6, reserveMax: 24, reload: 2.4, spread: 0.009, bloom: 0.014, pellets: 1, recoil: 2.2, range: 140, adsFov: 58, price: 1400, loot: 8, color: 0x4a4a52, accent: 0x6b4a2a },
```
Replace the MP 40 row (`:35`):
```js
  mp40:     { name: 'MP 40',       class: 'smg', shape: 'mp40',  dmg: 18, rpm: 500, auto: true, mag: 32, reserveMax: 160, reload: 2.0, spread: 0.018, bloom: 0.014, pellets: 1, recoil: 0.4, range: 150, adsFov: 62, price: 1300, loot: 11, color: 0x2e3036, accent: 0x3a3a3a },
```
Replace the M3 Grease Gun row (`:36`):
```js
  grease:   { name: 'M3 Grease Gun', class: 'smg', shape: 'grease', dmg: 22, rpm: 450, auto: true, mag: 30, reserveMax: 150, reload: 2.2, spread: 0.026, bloom: 0.02, pellets: 1, recoil: 0.5, range: 120, adsFov: 62, price: 1250, loot: 9, color: 0x3a3d42, accent: 0x262626 },
```
Replace the BAR row (`:37`):
```js
  bar:      { name: 'BAR M1918',   class: 'rifle', shape: 'bar', dmg: 52, rpm: 500, auto: true, mag: 20, reserveMax: 120, reload: 3.0, spread: 0.016, bloom: 0.02, pellets: 1, recoil: 1.6, range: 300, adsFov: 55, price: 2600, loot: 6, color: 0x3a3128, accent: 0x26262a },
```
Replace the DP-28 row (`:38`) — keep the `spinMag`:
```js
  dp28:     { name: 'DP-28',       class: 'rifle', shape: 'dp28', dmg: 33, rpm: 550, auto: true, mag: 47, reserveMax: 141, reload: 3.6, spread: 0.018, bloom: 0.020, pellets: 1, recoil: 0.9, range: 280, adsFov: 56, price: 2700, loot: 5, color: 0x3a352c, accent: 0x4a4a50, spinMag: { shape: 'pan', x: 0, y: 0.2, z: -0.3, r: 0.28, axis: 'y', step: TAU / 47 } },
```
Replace the Mosin row (`:39`):
```js
  mosin:    { name: 'Mosin-Nagant', class: 'sniper', shape: 'mosin', dmg: 175, rpm: 42, auto: false, mag: 5, reserveMax: 30, reload: 2.8, spread: 0.0020, bloom: 0, pellets: 1, recoil: 2.8, range: 500, adsFov: 24, scope: true, price: 2400, loot: 5, color: 0x6e4a28, accent: 0x4a4e54 },
```
Replace the Bazooka row (`:40`) — recoilless fix:
```js
  bazooka:  { name: 'Bazooka',     class: 'launcher', shape: 'bazooka', dmg: 0, rpm: 24, auto: false, mag: 1, reserveMax: 5, reload: 4.0, spread: 0.004, bloom: 0, pellets: 1, recoil: 0.6, range: 250, adsFov: 62, explodeDmg: 240, explodeRadius: 7.5, price: 3200, loot: 3, color: 0x4a5238, accent: 0x2e2e2e },
```

- [ ] **Step 2: Verify the data loaded correctly (console)**

Reload `http://localhost:8000/?cb=<n>`, open console, run:
```js
const { WEAPONS } = await import('/src/weapons.js?cb=' + Date.now());
console.assert(WEAPONS.luger.reserveMax === 32, 'Luger reserve must be finite 32');
console.assert(WEAPONS.stg44.dmg > WEAPONS.carbine.dmg, 'StG must out-damage M1 Carbine');   // fixes the inverted ladder
console.assert(WEAPONS.bazooka.recoil === 0.6, 'Bazooka must be recoilless');
console.assert(WEAPONS.mosin.dmg === 175 && WEAPONS.kar98.dmg === 165, 'Mosin > Kar98 damage');
console.log('dmg ladder', WEAPONS.ppsh.dmg, WEAPONS.carbine.dmg, WEAPONS.bar.dmg, WEAPONS.garand.dmg, WEAPONS.kar98.dmg);
```
Expected: no assertion warnings; ladder logs `16 32 52 80 165`.

- [ ] **Step 3: Spot-check feel in a run**

Start a run, grant the full arsenal (see preamble), and confirm the HUD shows the new mags/reserves (e.g. Luger `8 / 32`, Thompson `30 / 150`, Bazooka `1 / 5`). Fire a few weapons — pistols should feel shorter-ranged and the bazooka should barely kick.

- [ ] **Step 4: Commit**
```bash
git add src/weapons.js
git commit -m "feat(weapons): retune full roster to realistic WW2 stats + strict ammo"
```

---

## Task 2: Recoil-buildup patterns

Sustained auto fire should progressively climb; each gun climbs differently (vertical vs lateral). Add `recoilClimb`/`recoilYaw` data fields, a `_recoilStreak` accumulator, and a horizontal `recoilYawKick` applied to the camera.

**Files:**
- Modify: `src/weapons.js` — registry rows (add 2 fields to the 7 auto guns), constructor `:806`, `resetLoadout` `:849`, `_fire` `:972` & `:1023-1024`, `update` `:1141`
- Modify: `src/player.js:146` (apply horizontal recoil to camera yaw)

- [ ] **Step 1: Add `recoilClimb` / `recoilYaw` to the 7 automatic weapons**

Append the two keys to each auto gun's row (insert right before the trailing `color:` key). Resulting rows:
```js
  thompson: { name: 'Thompson',   class: 'smg', shape: 'smg',  dmg: 20, rpm: 700, auto: true,  mag: 30, reserveMax: 150, reload: 2.4, spread: 0.024, bloom: 0.03, pellets: 1, recoil: 0.7,  range: 130, adsFov: 62, price: 1200, loot: 12, recoilClimb: 0.08, recoilYaw: 0.10, color: 0x3a2a1c, accent: 0x9c6a32 },
  ppsh:     { name: 'PPSh-41',    class: 'smg', shape: 'drum', dmg: 16, rpm: 1000, auto: true,  mag: 71, reserveMax: 142, reload: 3.2, spread: 0.028,  bloom: 0.022, pellets: 1, recoil: 0.45, range: 150, adsFov: 64, price: 1600, loot: 8,  recoilClimb: 0.04, recoilYaw: 0.55, color: 0x2f2218, accent: 0xb88a3a },
  mp40:     { name: 'MP 40',       class: 'smg', shape: 'mp40',  dmg: 18, rpm: 500, auto: true, mag: 32, reserveMax: 160, reload: 2.0, spread: 0.018, bloom: 0.014, pellets: 1, recoil: 0.4, range: 150, adsFov: 62, price: 1300, loot: 11, recoilClimb: 0.015, recoilYaw: 0.05, color: 0x2e3036, accent: 0x3a3a3a },
  grease:   { name: 'M3 Grease Gun', class: 'smg', shape: 'grease', dmg: 22, rpm: 450, auto: true, mag: 30, reserveMax: 150, reload: 2.2, spread: 0.026, bloom: 0.02, pellets: 1, recoil: 0.5, range: 120, adsFov: 62, price: 1250, loot: 9, recoilClimb: 0.02, recoilYaw: 0.10, color: 0x3a3d42, accent: 0x262626 },
  stg44:    { name: 'StG 44',     class: 'rifle', shape: 'stg',   dmg: 38, rpm: 560, auto: true,  mag: 30, reserveMax: 150, reload: 2.4, spread: 0.015, bloom: 0.016, pellets: 1, recoil: 0.85, range: 260, adsFov: 54, price: 2400, loot: 6,  recoilClimb: 0.03, recoilYaw: 0.10, color: 0x33373d, accent: 0x6e4a28 },
  bar:      { name: 'BAR M1918',   class: 'rifle', shape: 'bar', dmg: 52, rpm: 500, auto: true, mag: 20, reserveMax: 120, reload: 3.0, spread: 0.016, bloom: 0.02, pellets: 1, recoil: 1.6, range: 300, adsFov: 55, price: 2600, loot: 6, recoilClimb: 0.10, recoilYaw: 0.15, color: 0x3a3128, accent: 0x26262a },
  dp28:     { name: 'DP-28',       class: 'rifle', shape: 'dp28', dmg: 33, rpm: 550, auto: true, mag: 47, reserveMax: 141, reload: 3.6, spread: 0.018, bloom: 0.020, pellets: 1, recoil: 0.9, range: 280, adsFov: 56, price: 2700, loot: 5, recoilClimb: 0.05, recoilYaw: 0.20, spinMag: { shape: 'pan', x: 0, y: 0.2, z: -0.3, r: 0.28, axis: 'y', step: TAU / 47 }, color: 0x3a352c, accent: 0x4a4a50 },
```
(Note the DP-28 row keeps `spinMag`; the order of trailing keys doesn't matter.)

- [ ] **Step 2: Add the two new state fields to the constructor**

In `weapons.js:806`, change:
```js
    this.cooldown = 0; this.reloading = 0; this.bloom = 0; this.recoilKick = 0; this.recoilPitch = 0;
```
to:
```js
    this.cooldown = 0; this.reloading = 0; this.bloom = 0; this.recoilKick = 0; this.recoilPitch = 0; this.recoilYawKick = 0; this._recoilStreak = 0;
```

- [ ] **Step 3: Reset them on loadout reset**

In `resetLoadout` (`weapons.js:849`), change:
```js
    this.bloom = 0; this.recoilKick = 0; this.recoilPitch = 0; this.ads = false;
```
to:
```js
    this.bloom = 0; this.recoilKick = 0; this.recoilPitch = 0; this.recoilYawKick = 0; this._recoilStreak = 0; this.ads = false;
```

- [ ] **Step 4: Compute climb at the top of `_fire` and apply it to bloom**

In `_fire` (`weapons.js:972`), change:
```js
    this.mag[this.cur]--; this.cooldown = 60 / d.rpm; this.bloom = Math.min(this.bloom + d.bloom, 0.06);
```
to:
```js
    this.mag[this.cur]--; this.cooldown = 60 / d.rpm;
    const _climb = 1 + this._recoilStreak * (d.recoilClimb || 0);
    this.bloom = Math.min(this.bloom + d.bloom * _climb, 0.09);
```

- [ ] **Step 5: Scale per-shot recoil by climb + add the lateral kick**

In `_fire` (`weapons.js:1023-1024`), change:
```js
    this.recoilKick = Math.min(this.recoilKick + d.recoil * 0.05, 0.3);
    this.recoilPitch += d.recoil * (0.6 + Math.random() * 0.5) * 0.01;
```
to:
```js
    this.recoilKick = Math.min(this.recoilKick + d.recoil * 0.05 * _climb, 0.35);
    this.recoilPitch += d.recoil * (0.6 + Math.random() * 0.5) * 0.01 * _climb;
    if (d.recoilYaw) this.recoilYawKick += (Math.random() < 0.5 ? -1 : 1) * d.recoil * d.recoilYaw * 0.004 * _climb;
    this._recoilStreak = Math.min(this._recoilStreak + 1, 30);
```

- [ ] **Step 6: Decay the streak + the lateral kick in `update`**

In `update` (`weapons.js:1141`), change:
```js
    this.recoilPitch = damp(this.recoilPitch, 0, 10, dt);
```
to:
```js
    this.recoilPitch = damp(this.recoilPitch, 0, 10, dt);
    this.recoilYawKick = damp(this.recoilYawKick, 0, 10, dt);
    this._recoilStreak = Math.max(0, this._recoilStreak - dt * 8);
```

- [ ] **Step 7: Apply the lateral recoil to the camera yaw**

In `player.js:146`, change:
```js
    cam.rotation.y = this.yaw; cam.rotation.x = this.pitch + this.game.weapons.recoilPitch; cam.rotation.z = 0;
```
to:
```js
    cam.rotation.y = this.yaw + this.game.weapons.recoilYawKick; cam.rotation.x = this.pitch + this.game.weapons.recoilPitch; cam.rotation.z = 0;
```

- [ ] **Step 8: Verify (console + feel)**

Reload, start a run, grant the arsenal, switch to Thompson, hold left-mouse and watch the console:
```js
// run while holding fire:
const t = setInterval(() => console.log('streak', GAME.weapons._recoilStreak.toFixed(1), 'yaw', GAME.weapons.recoilYawKick.toFixed(3)), 100);
// stop with: clearInterval(t)
```
Expected: `streak` climbs above ~3 during a sustained Thompson burst and decays to 0 when you release. Then play-test feel: **Thompson** climbs sharply upward, **MP40** stays nearly flat on a full mag, **PPSh** sprays sideways (yaw value swings noticeably), **BAR** climbs hardest. Semi-autos (Garand, pistols) have no buildup (`recoilClimb` undefined → `_climb` stays 1).

- [ ] **Step 9: Commit**
```bash
git add src/weapons.js src/player.js
git commit -m "feat(weapons): add per-gun recoil-buildup patterns (vertical + lateral)"
```

---

## Task 3: Bolt-cycle lockout + scope break

Kar98k and Mosin get a forced post-shot lockout (you "work the bolt") that also drops you out of the scope so you must re-acquire.

**Files:**
- Modify: `src/weapons.js` — Kar98/Mosin rows, constructor `:806`, `resetLoadout` `:848`, `tryFire` `:936`, `_fire` (near `:1025`), `update` `:1134` & `:1145`
- Modify: `src/audio.js` (add `boltCycle()`)

- [ ] **Step 1: Add `boltCycle` to the two bolt rifles**

Resulting rows (append `boltCycle` before `color:`):
```js
  kar98:    { name: 'Kar98 Scoped', class: 'sniper', shape: 'sniper', dmg: 165, rpm: 50, auto: false, mag: 5, reserveMax: 35, reload: 2.4, spread: 0.0015, bloom: 0, pellets: 1, recoil: 2.7, range: 500, adsFov: 22, scope: true, price: 2600, loot: 5, boltCycle: 1.2, color: 0x20242a, accent: 0x6fa8e8 },
  mosin:    { name: 'Mosin-Nagant', class: 'sniper', shape: 'mosin', dmg: 175, rpm: 42, auto: false, mag: 5, reserveMax: 30, reload: 2.8, spread: 0.0020, bloom: 0, pellets: 1, recoil: 2.8, range: 500, adsFov: 24, scope: true, price: 2400, loot: 5, boltCycle: 1.4, color: 0x6e4a28, accent: 0x4a4e54 },
```

- [ ] **Step 2: Add the `_boltLock` state field (constructor + reset)**

In `weapons.js:806` (the same line edited in Task 2), append `this._boltLock = 0;` so it reads:
```js
    this.cooldown = 0; this.reloading = 0; this.bloom = 0; this.recoilKick = 0; this.recoilPitch = 0; this.recoilYawKick = 0; this._recoilStreak = 0; this._boltLock = 0;
```
In `resetLoadout` (`weapons.js:848`), change:
```js
    this.reloading = 0; this.cooldown = 0; this.grenadeCD = 0; this._swing = 0; this._bobT = 0;
```
to:
```js
    this.reloading = 0; this.cooldown = 0; this._boltLock = 0; this.grenadeCD = 0; this._swing = 0; this._bobT = 0;
```

- [ ] **Step 3: Gate firing on the bolt lock**

In `tryFire` (`weapons.js:936`), change:
```js
    if (this.reloading > 0 || this.cooldown > 0) return;
```
to:
```js
    if (this.reloading > 0 || this.cooldown > 0 || this._boltLock > 0) return;
```

- [ ] **Step 4: Start the lock after a bolt-action shot**

In `_fire`, immediately before the final `this.game.hud.setWeapon(this);` (the one at the very end of the method, `weapons.js:1025`), insert:
```js
    if (d.boltCycle) { this._boltLock = d.boltCycle; this.game.audio.boltCycle(); }
```

- [ ] **Step 5: Tick down the lock + break the scope while cycling**

In `update` (`weapons.js:1134`), change:
```js
    if (this.cooldown > 0) this.cooldown -= dt;
```
to:
```js
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this._boltLock > 0) this._boltLock -= dt;
```
Then in `update` (`weapons.js:1145`), change:
```js
    this.ads = this.game.input.buttons[2] && !d.melee && d.class !== 'builder' && (d.class !== 'tool' || d.zoom); // binoculars (zoom tool) can ADS; flashlight can't
```
to:
```js
    this.ads = this.game.input.buttons[2] && !d.melee && d.class !== 'builder' && (d.class !== 'tool' || d.zoom); // binoculars (zoom tool) can ADS; flashlight can't
    if (this._boltLock > 0 && d.scope) this.ads = false; // working the bolt kicks you out of the scope until the cycle finishes
```

- [ ] **Step 6: Add the bolt-cycle sound**

In `src/audio.js`, just after the `reloadIn()` method (`audio.js:238`), add:
```js
  boltCycle() { this.noise(0.05, 0.28, 'bandpass', 1700, 4); setTimeout(() => { this.noise(0.06, 0.32, 'bandpass', 2200, 5); this.tone(150, 0.05, 'square', 0.14); }, 130); } // bolt lift-pull then push-lock
```

- [ ] **Step 7: Verify (console + feel)**

Reload, start a run, grant the arsenal, switch to Kar98 (`GAME.weapons.cur` should read `kar98`), right-click to scope, fire once:
```js
GAME.weapons._boltLock          // immediately after firing → ~1.2 (and ~1.4 for mosin)
GAME.weapons.ads                // → false during the lock even while holding right-mouse
```
Expected: after the shot you hear the bolt clack, the scope drops, and you cannot fire again until ~1.2 s passes (Mosin ~1.4 s). Re-scoping only takes effect after the bolt finishes.

- [ ] **Step 8: Commit**
```bash
git add src/weapons.js src/audio.js
git commit -m "feat(weapons): bolt-cycle lockout + scope break for Kar98/Mosin"
```

---

## Task 4: Garand en-bloc forced reload + "ping"

The M1 Garand can't top off — a reload always loads a fresh full 8-round clip (discarding any partial), and the last shot ejects the clip with the iconic ping.

**Files:**
- Modify: `src/weapons.js` — Garand row, `_fire` (`:972` area), `_finishReload` `:925-930`
- Modify: `src/audio.js` (add `garandPing()`)

- [ ] **Step 1: Flag the Garand as en-bloc**

Resulting Garand row (append `enBloc: true` before `color:`):
```js
  garand:   { name: 'M1 Garand',  class: 'rifle', shape: 'garand', dmg: 80, rpm: 270, auto: false, mag: 8,  reserveMax: 64,  reload: 2.6, spread: 0.008, bloom: 0.01,  pellets: 1, recoil: 1.6, range: 340, adsFov: 48, price: 2000, loot: 7,  enBloc: true, color: 0x52371f, accent: 0x222226 },
```

- [ ] **Step 2: Ping on the last round**

In `_fire`, the line that decrements the mag (after Task 2 it reads `this.mag[this.cur]--; this.cooldown = 60 / d.rpm;` at `weapons.js:972`) — change it to:
```js
    this.mag[this.cur]--; this.cooldown = 60 / d.rpm;
    if (d.enBloc && this.mag[this.cur] <= 0) this.game.audio.garandPing(); // empty clip ejects with the iconic ping
```
(Keep the `const _climb = ...` line from Task 2 directly below this.)

- [ ] **Step 3: Forced full-clip reload in `_finishReload`**

Replace the whole `_finishReload` method (`weapons.js:925-930`) with:
```js
  _finishReload() {
    const key = this.cur, d = WEAPONS[key];
    if (d.enBloc) { // en-bloc clip: load a fresh full clip and discard any partial mag (can't top off)
      const take = Math.min(this.magMax[key], this.reserve[key]); this.reserve[key] -= take; this.mag[key] = take;
      this.game.audio.reloadClick(); this.game.hud.setWeapon(this); return;
    }
    const need = this.magMax[key] - this.mag[key];
    if (this.reserve[key] === Infinity) this.mag[key] = this.magMax[key];
    else { const take = Math.min(need, this.reserve[key]); this.mag[key] += take; this.reserve[key] -= take; }
    this.game.audio.reloadClick(); this.game.hud.setWeapon(this);
  }
```

- [ ] **Step 4: Add the ping sound**

In `src/audio.js`, just after the `boltCycle()` method added in Task 3, add:
```js
  garandPing() { this.tone(2300, 0.55, 'triangle', 0.30); this.tone(3100, 0.45, 'sine', 0.16); this.tone(1750, 0.5, 'triangle', 0.10); } // en-bloc clip "ping"
```

- [ ] **Step 5: Verify (console + sound)**

Reload, start a run, switch to Garand, fire 8 rounds — the 8th plays the high metallic ping. Then test the no-top-off rule:
```js
GAME.weapons.cur = 'garand';     // ensure held
GAME.weapons.mag.garand = 5;     // simulate a partial mag (5 of 8)
GAME.weapons.reserve.garand = 64;
GAME.weapons.startReload();      // wait ~2.6s
// after reload:
GAME.weapons.mag.garand          // → 8 (fresh full clip; the 5 partial rounds were discarded, not topped off)
GAME.weapons.reserve.garand      // → 56 (a full clip of 8 consumed)
```
Expected: mag becomes 8, reserve drops by 8 (not by 3) — the partial was discarded.

- [ ] **Step 6: Commit**
```bash
git add src/weapons.js src/audio.js
git commit -m "feat(weapons): Garand en-bloc forced reload + ping"
```

---

## Task 5: Per-shell Trench Gun reload (interruptible)

The Trench Gun reloads one shell at a time; the player can fire as soon as ≥1 shell is loaded, cancelling the rest.

**Files:**
- Modify: `src/weapons.js` — Trench Gun row, `tryFire` `:936`, `_finishReload` (from Task 4)
- Modify: `src/audio.js` (add `shellInsert()`)

- [ ] **Step 1: Flag the Trench Gun + make `reload` the per-shell time**

Resulting Trench Gun row (`reload` becomes per-shell `0.45`, add `shellReload: true`):
```js
  shotgun:  { name: 'Trench Gun', class: 'shotgun', shape: 'shotgun', dmg: 13, rpm: 80,  auto: false, mag: 6, reserveMax: 36, reload: 0.45, shellReload: true, spread: 0.085, bloom: 0, pellets: 9,  recoil: 1.7, range: 55, adsFov: 66, price: 1700, loot: 9, color: 0x3a2418, accent: 0x9c6a32 },
```

- [ ] **Step 2: Make the reload interruptible by firing**

In `tryFire`, replace the gate line (after Task 3 it reads `if (this.reloading > 0 || this.cooldown > 0 || this._boltLock > 0) return;` at `weapons.js:936`) with:
```js
    if (this.reloading > 0) { // per-shell shotgun reload is interruptible: a press with ≥1 shell chambered cancels it and fires
      if (d.shellReload && edge === 'press' && this.mag[this.cur] > 0) this.reloading = 0;
      else return;
    }
    if (this.cooldown > 0 || this._boltLock > 0) return;
```

- [ ] **Step 3: Load one shell per tick + re-arm in `_finishReload`**

In `_finishReload` (edited in Task 4), insert the shell-reload branch at the very top, right after `const key = this.cur, d = WEAPONS[key];`:
```js
    if (d.shellReload) { // pump shotgun: seat one shell, then re-arm for the next unless full / empty / interrupted
      if (this.mag[key] < this.magMax[key] && this.reserve[key] > 0) {
        this.mag[key]++; this.reserve[key]--; this.game.audio.shellInsert();
        if (this.mag[key] < this.magMax[key] && this.reserve[key] > 0) this.reloading = WEAPONS[key].reload * this.game.player.reloadMult;
      }
      this.game.hud.setWeapon(this); return;
    }
```

- [ ] **Step 4: Add the shell-insert sound**

In `src/audio.js`, just after the `garandPing()` method added in Task 4, add:
```js
  shellInsert() { this.noise(0.05, 0.3, 'lowpass', 600, 1); this.tone(210, 0.05, 'square', 0.16); } // a single shell pressed into the tube
```

- [ ] **Step 5: Verify (console + feel)**

Reload, start a run, switch to Trench Gun, fire it dry, then reload and watch it fill one-at-a-time:
```js
GAME.weapons.cur = 'shotgun';
GAME.weapons.mag.shotgun = 0; GAME.weapons.reserve.shotgun = 36;
GAME.weapons.startReload();
const t = setInterval(() => console.log('mag', GAME.weapons.mag.shotgun, 'reloading', GAME.weapons.reloading.toFixed(2)), 150);
// watch mag tick 0→1→2→3...; stop with clearInterval(t)
```
Expected: mag increments one shell roughly every 0.45 s with a shell-insert click each time. Then test interruption: start a reload from empty and left-click after 1–2 shells load — the reload stops and the gun fires.

- [ ] **Step 6: Commit**
```bash
git add src/weapons.js src/audio.js
git commit -m "feat(weapons): per-shell interruptible Trench Gun reload"
```

---

## Task 6: Melee friendly fire (co-op)

In co-op, a melee swing that connects with an upright teammate damages them (host-authoritative, like explosives). Guns already do this via `rayHitPlayers`/`claimPlayerHit`; melee currently only hits enemies + structures.

**Files:**
- Modify: `src/mp.js` (add `meleeHitPlayers`, near `:532`)
- Modify: `src/weapons.js` — `_melee` (`:944-969`)

- [ ] **Step 1: Add an arc-based teammate hit-test to `MP`**

In `src/mp.js`, immediately after the `claimPlayerHit` method (`mp.js:533`), add:
```js
  meleeHitPlayers(origin, fwd, range, arcCos) { // co-op melee FF: ids of upright teammates inside the swing arc (always-on, like explosive Full-FF)
    const out = [];
    for (const [id, rp] of this.remotes) {
      if (rp.dead || rp.down || rp.waiting) continue;               // never melee a downed/dead/waiting ally (you revive them, not hit them)
      const dx = rp.pos.x - origin.x, dz = rp.pos.z - origin.z, dist = Math.hypot(dx, dz);
      if (dist > range + 0.5) continue;
      if ((dx / (dist || 1)) * fwd.x + (dz / (dist || 1)) * fwd.z < arcCos) continue;
      out.push(id);
    }
    return out;
  }
```

- [ ] **Step 2: Strike teammates in `_melee`**

In `_melee` (`weapons.js`), after the enemy loop closes (the `}` ending the `for (const e of ...)` loop at `weapons.js:961`) and before the `for (const s of this.game.build.structures)` loop, insert:
```js
    if (this.game.mp.active) { // co-op: an active swing also strikes upright teammates (host-authoritative friendly fire)
      for (const id of this.game.mp.meleeHitPlayers(origin, fwd, d.range, d.arcCos)) {
        this.game.mp.claimPlayerHit(id, d.dmg * mult); hitAny = true;
      }
    }
```

- [ ] **Step 3: Verify (2-client co-op)**

Solo sanity first: in a solo run, swing a melee weapon near nothing — no errors (`GAME.mp.active` is false, the new block is skipped).

Co-op test (two browser windows on the same machine work for WebRTC):
1. Window A: Play → co-op → Host; note the 5-char room code.
2. Window B: open the same `http://localhost:8000/?cb=<n>`, Join with the code, both ready up.
3. Stand the two players adjacent. In window A, hold a melee weapon (e.g. Bayonet) and swing **into** the other player.
4. Expected: window B's health drops (host applies the damage to its `pstate`); a hitmarker shows in A. Swinging at a **downed** teammate does nothing (they're excluded). Gun behavior is unchanged.

- [ ] **Step 4: Commit**
```bash
git add src/mp.js src/weapons.js
git commit -m "feat(coop): melee friendly fire vs upright teammates"
```

---

## Task 7: Cache-bust ritual (ship)

Required before deploy (see `CLAUDE.md`): bump the entry `?v=N` and `GAME_BUILD` so clients refetch the changed modules.

**Files:**
- Modify: `index.html` (entry `<script>` `?v=`)
- Modify: `src/game.js` (`GAME_BUILD`)

- [ ] **Step 1: Find the current values**
```bash
grep -n 'src/game.js?v=' index.html
grep -n "GAME_BUILD" src/game.js | head -1
```

- [ ] **Step 2: Bump `?v=N`**

In `index.html`, increment the entry script's `?v=` by one (e.g. `?v=190` → `?v=191`):
```html
<script type="module" src="./src/game.js?v=191"></script>
```

- [ ] **Step 3: Bump `GAME_BUILD`**

In `src/game.js`, set `GAME_BUILD` to the current local minute, e.g.:
```js
const GAME_BUILD = '2026-06-02 14:30';
```

- [ ] **Step 4: Verify the loaded build**

Reload `http://localhost:8000/` (no `?cb=` this time). The menu / co-op lobby footer should show the new version and build string. Confirm the game boots with **0 console errors**.

- [ ] **Step 5: Commit**
```bash
git add index.html src/game.js
git commit -m "chore: bump build for weapon realism revision"
```

---

## Self-review notes (for the implementer)

- **Order matters:** Tasks 2–5 edit overlapping lines (`weapons.js:806`, `tryFire:936`, `_fire:972`, `_finishReload`). Do them in order; each task's "change X to Y" assumes the previous tasks already applied.
- **No melee value changes:** the spec keeps the melee damage/speed ladder as-is; the only melee change is co-op friendly fire (Task 6).
- **Melee FF is always-on in co-op** (not gated on `mp.friendlyFire`), mirroring the explosive Full-FF model per the spec. Gun FF remains gated on `mp.friendlyFire` (unchanged).
- **Recoil/yaw/streak tuning values** (`recoilClimb`, `recoilYaw`, the `-dt*8` streak decay, the `0.004` yaw scale) are starting points — adjust by feel during Task 2 verification; they don't affect correctness elsewhere.
- **Bolt-cycle vs rpm:** for Kar98/Mosin the `boltCycle` lock (1.2/1.4 s) is longer than the rpm interval (1.2/1.43 s), so the lock is the binding constraint — that's intended.
