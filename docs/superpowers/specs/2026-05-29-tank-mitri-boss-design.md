# Boss design: T-90M «MITRI» (armored tank boss)

**Date:** 2026-05-29
**Game:** ENGENDROS PURGE — browser voxel FPS wave-survival (`index.html` + `src/game.js`, Three.js r160, no build step)
**Status:** ✅ LOCKED 2026-05-29 (design approved). Implementation plan: `docs/superpowers/plans/2026-05-29-tank-mitri-boss.md`.

---

## 1. Concept & identity

A second boss that is the **mechanical opposite** of the existing BOSS TOLO (a slow static artillery plush that lasers + summons mini-Tolos). Where Tolo is a soft plush, **MITRI is a real armored vehicle** — a **T-90M «Proryv»** main battle tank — with the yellow 3-eyed Engendros **Mitri (ENEATYP 9)** riding in the commander's cupola.

Fantasy: *"against infantry you don't stand a chance."* The tank shrugs off normal bullets; the player must use **explosives** (bazooka rockets, kamikaze-mob blasts) or wait for **Mitri to pop out of the hatch** and shoot the squishy commander.

**Two defeat outcomes — the player chooses (see §3 + §12):**
- **Blow it up (explosives)** → the armor HP hits 0 → the tank is **destroyed** → it becomes a permanent **wrecked-T-90M obstacle** with collision (cover for the rest of the run). Fast, easy.
- **Kill the commander (shoot Mitri during his window, no explosives)** → Mitri's own HP hits 0 → the tank is left **intact and abandoned** → the player can **board and operate it** as a drivable war machine. Hard (only ~4 s windows, bullets only), high reward.

- **Reference:** T-90M from all angles + a destroyed wreck (user-supplied images); driver periscope-slit view + functional thermal gunner sight (user-supplied images). Mitri official art "MITRI (ENEATYP 9)".
- **Camo:** desert 3-tone (sand / brown / olive blotch) to match the de_dust2 sandstone arena.

---

## 2. Wave integration — random boss selection

Today boss waves are hardcoded to Tolo: `WaveManager` sets `isBossWave = (n % 5 === 0)` and `EnemyManager.spawn('boss', ...)` at the boss-spawn branch.

**Change:** introduce a small **boss registry** and pick randomly on each boss wave.

```js
const BOSS_ROSTER = ['boss', 'tank'];   // 'boss' = Tolo, 'tank' = Mitri
// in the boss-spawn branch:
const pick = BOSS_ROSTER[(Math.random() * BOSS_ROSTER.length) | 0];
```

- Each boss wave (5, 10, 15, …) rolls Tolo **or** Tank with equal odds.
- HP scaling reuses the existing `hpScale = 1 + (floor(n/5) - 1) * 0.6`.
- The wave banner sub-text picks the right line: `'BOSS TOLO APPROACHES'` vs `'T-90M «MITRI» ROLLS IN'`.
- `Math.random()` is already used elsewhere in the file (`rr`, loot rolls) so this fits existing patterns.

---

## 3. Damage model — two health pools, two outcomes (the core mechanic)

The tank has **two independent health pools**, and **which one you empty decides the outcome**:

| Pool | What damages it | Reaching 0 → |
|---|---|---|
| **`armorHP`** (the big boss-bar) | **explosives only**, **but only on a non-ERA zone** — a bazooka/blast on an intact **ERA panel is defeated (0 dmg)**; you must hit a **weak zone** (rear, roof, tracks, engine deck) or an already-spent ERA spot. **Normal bullets do 0** (ricochet). | **DESTROYED** → explosion + permanent **wreck obstacle** (§6, §12) |
| **`mitriHP`** (commander, smaller) | **normal bullets only, and only while Mitri is exposed** (`source==='gun'` && `vulnerable`); hit on Mitri = ×2. **Explosives don't count toward this pool.** | **COMMANDER KILLED** → tank intact, **capturable/drivable** (§12) |

All enemy damage funnels through one chokepoint — `EnemyManager.damage(e, amount, source='gun')` (bullets `'gun'`, rockets/explosions `'explosion'`, charger contact `'contact'`). New `e.def.armored` branch at the **top** routes damage to the correct pool:

```js
damage(e, amount, source='gun') {
  if (!e.alive) return false;
  if (e.def.armored) {
    if (source === 'gun') {
      if (!e.vulnerable) { this._armorPing(e); return false; }   // bullets bounce off armor
      e.mitriHP -= amount;                                        // exposed: chip the COMMANDER
      if (e.mitriHP <= 0) return this._tankCaptured(e);          // → capture path (§12)
      this._mitriHurt(e); return false;
    }
    if (source === 'explosion') {
      const zone = this._tankHitZone(e, hitPoint);              // classify blast vs tank facing
      if (zone.era && !zone.spent) { this._eraReact(e, zone); return false; } // ERA defeats it → 0 dmg
      e.armorHP -= amount * (e.def.explosiveMult || 2.0);        // weak zone / spent ERA → chip ARMOR
      if (e.armorHP <= 0) return this._tankDestroyed(e);         // → wreck path (§6/§12)
      this._armorHurt(e); return false;
    }
    return false; // 'contact' n/a for the tank
  }
  e.hp -= amount;  // ...normal enemies unchanged
}
```

- **Reactive armor (ERA) — explosives are defeated on the front/sides.** Realistic: ERA exists to kill shaped-charge warheads. The tank's **front glacis, turret cheeks, and forward side skirts are ERA zones**; the **rear, roof/engine deck, and tracks/running gear are bare (weak)**. A bazooka/blast on an **intact ERA panel does 0 damage** (ERA reaction FX, that brick is consumed/blown off → that spot is now bare). To actually chunk `armorHP` you must **flank and hit a weak zone** (rear/top/tracks) or re-hit a now-bare ERA spot. This pairs with the smart AI keeping its frontal armor toward you (§5) → explosives players must maneuver around.
  - **`_tankHitZone(e, hitPoint)`** classifies the blast position in the tank's local frame (front/side arc + height) → `{ era, spent }`; the blast `center` must be **threaded through** to `damage()` (add an optional `hitPoint` param; the rocket-detonation and `damageInRadius` already know the blast center). ERA panels track a `spent` flag per zone.
- **Bazooka** (`class:'launcher'`) detonates → `damageInRadius(..., 'explosion', center)`; with `explosiveMult ≈ 2.0` a **weak-zone** hit chunks `armorHP`. → the **destroy/wreck** outcome (skill = flanking).
- **Kamikaze / exploder mobs**: their blast calls `damageInRadius` over `this.active` (already damages other enemies). They detonate **low, at the tracks/hull base** (a bare weak zone) as they reach the tank, so luring them in **still works** — no front-ERA problem. Counts toward destroying it.
- **Normal guns**: 0 vs the armor; only during the window do they chip `mitriHP` → the **capture** outcome. The ricochet teaches "bullets don't dent the hull — go for the commander or bring explosives."
- **`_armorPing(e)`**: spark + metallic "tink" on a bounced bullet, throttled; occasional "ARMORED — HIT THE COMMANDER" hint early on.
- Boss bar shows **`armorHP`** (destroy progress); while the window is open it also shows a small **MITRI** health pip draining as you shoot him (capture progress) and tints gold.

### Mitri pop-out window (the capture path)
- Cycle: **~12 s buttoned-up → hatch opens, Mitri rises (~0.4 s anim) → ~4 s EXPOSED (`e.vulnerable = true`) → ducks, hatch closes**.
- While exposed, **normal bullets** chip `mitriHP`; hitting the Mitri region = **×2** via the existing `rayHit` head flag (tune `tank.headY` so the cupola = head zone). It takes focused fire across a few windows to drop him — committing to the *no-explosives* capture route.
- If you'd rather just kill it: ignore the windows and pour explosives into the armor.
- Telegraph: hatch "clank" + Mitri taunt SFX; boss bar tint shifts (armored grey → gold) and a small marker floats over Mitri while exposed.
- This is the **fairness guarantee** the user chose: no bazooka required, the window alone can finish the tank (just slower).

---

## 4. Offense (turret traverses *very* slowly → flankable)

Dispatched from a new `_bossTank(e, dt)` (parallel to Tolo's laser code inside the `if (e.def.boss)` branch of `update()`).

1. **Main cannon (AoE)** — primary threat.
   - Turret yaws toward the player at a **slow traverse rate** (~28°/s) **and the gun elevates on its own pitch axis** toward the firing solution (separate from turret yaw). Both moves play a **mechanical servo whir** (turret traverse) / **gear clunk** (gun raise). Fires only when roughly on-target.
   - **Line-of-sight gate (no shooting through walls):** before charging, raycast from the **muzzle tip → player chest** via `world.rayHit`. Fire only if the ray is **clear** AND the turret is on-target. If blocked, **hold fire and reposition** (see §5) instead of wasting a shell into a wall.
   - **Muzzle-clearance gate (no "barrel in a building"):** also cast a short ray straight out of the muzzle (~barrel length); if the tube tip is jammed against geometry, suppress fire. Navigation standoff (§5) keeps the long gun out of walls in the first place.
   - Fire cycle: aim → brief barrel-glow charge (~0.8 s telegraph) → **shell** launches on a fast arc. The shell is a world-colliding projectile (like the rocket) — it detonates on the **first** world/ground/proximity hit, so it can never pass through a wall mid-flight either.
   - On impact: `effects.explosion`, **AoE** (~radius 6) with falloff, **crater/scorch decal**, strong **camera shake**.
   - A **ground target marker** appears ~0.9 s before impact so a moving player can dodge. **Reload/cooldown = 7 s** between shots (phase 2: ~5 s) — long enough to feel the heavy reload rhythm.
   - Damage: ~48 at center, falloff to edge (tunable).
2. **Coaxial / RWS machine gun** — punishes close, head-on, stationary play.
   - **Belt of 250 rounds.** While the player is within ~22 m, inside the frontal arc, **and LOS is clear** (same `world.rayHit` check — never fires through walls), it pours fast continuous fire (~6 dmg/round, moderate spread, hitscan toward player with jitter). **Every round is a visible tracer** (bright streak + muzzle flash from the RWS on the turret roof).
   - When the 250-round belt is empty it **reloads** (~3.5 s pause, belt-clatter / charging-handle SFX) before it can fire again — a window to push or reposition.
3. **Track ram (run-over)** — punishes hugging the hull.
   - When player within ~4 m in the frontal arc, the tank lunges forward (brief speed burst). Contact deals ~40 dmg + knockback. Short cooldown so it can't perma-ram.

*(No under-HP salvo and no add-summoning — those stay Tolo's identity. Phase 2 escalates the existing attacks instead.)*

### Phase 2 — enrage (≤ 40 % HP)
- Cannon cooldown drops, turret traverse speeds up (~40°/s), ram triggers more readily.
- Visual: hull vents black smoke, occasional small flames.
- Mitri window **slightly more frequent** (~9 s cycle) so the fight can be closed out.
- `bigMessage('MITRI ENRAGED', 'the T-90M floors it!')`.

---

## 5. Navigation & AI — smart pursuit, obstacle-aware, never stuck

The tank must read as a **smart hunter** that chases the player, drives *around* buildings, keeps its gun clear of walls, and **never wedges in terrain**. It is **ground-only** (a tank doesn't climb — step-up is disabled for it; it slides along walls instead of mounting them) and is treated as a **large circle** (radius ~2.6 m) for collision via the existing world-collision/wall-slide path.

**Steering with obstacle avoidance (drive around buildings):**
- Each tick, compute a **desired heading toward the player**, then cast **"whisker" rays** from the hull front against `world.rayHit`: center, and ~±35° (and optionally ±70°), each ~`(hull length + standoff)` long.
- If a whisker is blocked, **steer away** toward the clearer side (turn toward whichever flank ray is longest/clear). This yields smooth "go around the corner" pathing through the dust2 lanes/chokepoints instead of grinding into a wall.
- **Hull turns slowly** toward the steered heading at a max turn rate (tank-like); it only drives **forward along its facing** (no instant strafe). When the heading error is large it can **neutral-steer** (rotate in place) before advancing — realistic tracked turning.
- **Wall standoff:** the avoidance distance includes the **barrel reach** in the facing direction, so the long gun is kept out of geometry (reinforces the §4 muzzle-clearance gate — no "cannon inside a building").

**Reposition for a shot:** the AI's goal isn't just "touch the player" — when it **lacks cannon LOS** (§4), it actively drives to **regain line of sight** (flank toward the player / clear the obstacle), then halts to aim and fire. This makes it feel deliberate, like a tank maneuvering for a firing solution, rather than a zombie shoving a wall.

**Presents its frontal armor:** because it faces the player to aim, its **ERA-covered front** (§3) is naturally pointed at you — so a bazooka user is forced to **circle to the weak rear/sides**. The hull keeps its strong front toward the threat (a slight bias to re-face the player even between shots), making the destroy-route a real flanking dance against the slow traverse.

**Stuck detection & recovery (never trapped):**
- Track position delta over a short window (~1.2 s). If displacement stays below a threshold **while the tank wants to move**, enter a **recovery state**: **reverse** for ~0.8 s and rotate toward the side with the most whisker clearance, then resume normal steering. Guarantees it always frees itself.
- Backstop: reuse the existing anti-stuck beeline as a last resort, plus a hard "if still stuck after N recoveries, nudge toward the nearest open lane."

**Speed:** slow tracked advance (~1.2 m/s; phase 2 ~1.5 m/s, faster during a ram lunge). Turret yaw is **independent** of hull. Spawns in the **open plaza** and biases toward open lanes so it starts with room to maneuver. Small crates may be shoved/crushed; buildings are hard obstacles it routes around.

---

## 6. Voxel model (`buildTank(camo)`)

Built with the same MeshBuilder + **layered-shading** technique as weapons/Engendros (see `voxel-weapon-modeling` skill). Not an Engendro — `spawn()` branches on `typeKey === 'tank'` to call `buildTank()` instead of `buildEngendro()`. Returns a `THREE.Group` with **named children** for animation:

- **Hull**: sloped glacis (with the split-V ERA blocks), boxy body, **desert 3-tone camo** via per-face palette (sand `0xc9b48a`-ish / brown `0x8a6a45` / olive `0x6e6f4a`, layered hi/mid/lo for the voxel look), driver's hatch center-front, and a pair of **front headlamps** on the glacis/fenders (lens + housing meshes).
- **Side skirts** with ERA panels; **running gear** = **6 road wheels per side** (`roadWheels[]`, each on its own spin axis + vertical suspension offset), **rear drive sprocket** (`sprocketL/R`, toothed — the wheel that "drives" the track), front idler, return rollers; **tracks** as a scrolling tread band (`trackL`, `trackR`) that conforms to the wheels.
- **Turret** (`turret` pivot, yaws independently): welded angular shape, **Relikt ERA brick pattern** on the cheeks, **slat/"mangal" cage armor** at the rear and over the engine deck, rear antenna, **commander panoramic sight drum** + gunner sight.
- **Main gun**: a **mantlet/elevation pivot** (`gunMantlet`, child of `turret`, rotates on its **pitch axis**) carrying the `barrel` — long 125 mm tube with **thermal sleeve** + **bore-evacuator bulge** ~⅓ from the muzzle; plus a **recoil sub-node** so the tube kicks straight back on fire and returns. So aiming is two real axes: turret **yaw** + gun **elevation**.
- **RWS** on the turret roof with the MG (coax fire origin + muzzle flash).
- **Cupola hatch** (`hatch`, opens/closes) and **Mitri commander** (`mitri` group) that rises out during the window.

### Mitri commander (rides in the cupola)
Yellow voxel bust matching the plush: round yellow head+torso, **3 brass button eyes in a row** (each with an X-thread cross), **X-stitch smile**, **2 black hair tufts**. Buttoned-up: only the top of his head shows in the hatch. Exposed: full upper body rises above the cupola (the shootable weak point).

### Mechanical rig — real pivots & approximated physics
A proper transform hierarchy so every part moves on its **real axis** (the "opravdové osy" ask):

```
hull (root: drives forward on its facing; suspension bob/pitch)
 └─ turret           — YAW pivot (independent slow traverse)
     └─ gunMantlet   — PITCH pivot (gun elevation)
         └─ barrel
             └─ recoilNode → muzzle (fire origin)
     └─ RWS → mgMuzzle (coax fire origin)
     └─ hatch (open/close) → mitri (rise/duck)
 └─ roadWheels[L/R][0..5] — each spins on its axle + vertical suspension offset
 └─ sprocketL/R (drive), idlers, return rollers — spin with track motion
 └─ trackL / trackR — scrolling tread band
```

- **Wheels & tracks are driven by motion, not the clock:** track scroll speed and wheel/sprocket spin are proportional to the hull's actual forward velocity (reverse spins them backward). The drive **sprocket** leads; track band scrolls to match.
- **Approximated suspension physics (not a rigid-body sim — performant & deterministic):** each road wheel has a light **spring-damper vertical offset** that reacts to ground/bumps and to accel/brake; the **hull pitches** (nose-up on accel, nose-down on brake/stop) and **rolls** slightly in turns. Tracks "with gravity" = the tread band sags between wheels and conforms — faked with the wheel offsets, no per-link physics. This gives the heavy, weighty look without a physics engine. *(Honest scope note: it's a visual spring approximation, deterministic per-frame — no real collision physics on individual track links.)*
- **Gun elevation** is a genuine pitch axis: the cannon raises/lowers to the firing solution with a gear clunk; recoil is a separate straight-back translation on `recoilNode`.

### Animations & FX (the "ultra realistic" ask)
- **Tracks scroll + road wheels & drive sprocket spin** proportional to movement velocity; **suspension bob + hull pitch/roll** over movement and terrain.
- **Track marks on the ground:** the tank lays **two fading tread-mark decals** behind its tracks wherever it drives (a trail that lingers then fades), plus **dust/dirt particles** kicked up from the tracks while moving.
- **Barrel recoil** (kick-back + return lerp) + **muzzle smoke + flash** on cannon fire; **turret traverse** + **gun elevation** servo motion toward aim, clamped by rate.
- **MG tracers**: bright tracer streak per round from the RWS muzzle while the coax fires.
- **Engine smoke:** a continuous light **exhaust smoke plume** from the rear engine deck while alive (thicker in phase 2, where the hull also vents black smoke + occasional flames).
- **Real headlights (auto-on in the dark):** the two front headlamps emit **actual light** — a forward-pointing `THREE.SpotLight` cone per lamp (warm, no shadow maps for perf) that illuminates the ground and enemies ahead, plus glowing emissive lens meshes + a soft glow sprite. They **auto-enable when the scene is dark** (night, or a dim interior/tunnel/bunker): intensity ramps from the current scene-brightness signal (ambient/hemisphere light level or a global day/night value) — fully on in darkness, off in bright desert daylight. The cones aim with the **hull facing**, so they sweep as the tank turns toward you (a moving searchlight in the dark).
- **Hatch open/close + Mitri rise/duck** for the vulnerability window.

### Death state — destroyed wreck (explosives outcome → `_tankDestroyed`)
When **`armorHP` hits 0** (blown up by explosives): **destruction sequence** — a chain of explosions across the hull over ~1.2 s, the **turret pops up and tilts askew**, heavy camera shake, then the mesh swaps to a **`buildTankWreck()`** variant: blackened/scorched materials, displaced tilted turret, mangled cage armor, lingering **smoke column** (smoke thins out but the hull stays).
- **Permanent solid obstacle:** the wreck **stays for the rest of the run as real cover with collision hitboxes** (registered as a static world obstacle so the player and enemies path around it / hide behind it). It is **not** cleared on the next wave. (Performance: cap/merge wreck geometry; multiple wrecks across a long run → profile.)
- *(The other outcome — killing Mitri — leaves the tank **intact and drivable**, not a wreck. See §12.)*

---

## 7. HUD / boss bar / audio / rewards

- **Boss bar**: reuse `#bossbar` via `hud.setBoss(frac, name)` with name `T-90M «MITRI»`. Tint shifts grey→gold during the exposed window. Hidden on death via the existing `hideBoss()` path (already called in `damage()` death branch for `e.def.boss`).
- **Proximity rumble (screen shake when it's near):** while the tank is within ~rumble radius, apply a **continuous low-amplitude camera shake** that scales up as it gets closer (the ground-shaking weight of a tank rolling at you), layered on top of the discrete shakes from cannon impacts and the death sequence.
- **Audio (procedural, matches existing `audio.*` style)**:
  - **Movement:** diesel engine rumble loop + track squeak/clatter while alive (pitch/volume tied to speed); rear-deck idle rumble.
  - **Mechanical servos:** **turret traverse whir** while the turret yaws, **gun-elevation gear clunk/whir** while the gun raises — the "mechanické zvuky pohybu věže / zvedání děla" ask.
  - **Weapons:** deep cannon **BOOM** (low noise burst + sub tone) on fire; **MG rattle** while the coax fires + belt-clatter on its reload.
  - **Other:** hatch **CLANK** (open/close), metallic **"tink"** ricochet on armor bounce, layered explosions on the death sequence.
- **Rewards**: large bounty (~1500), score, and **3 guaranteed keys** (it's a marquee kill). Wave clears when the tank dies.

---

## 8. Architecture & integration points (exact hooks in `src/game.js`)

- **`ENEMY_TYPES.tank`** (next to `boss` ~L207): `{ armorHP: ~3600, mitriHP: ~750, speed: 1.2, dmg: 40, reward: 1500, scale: 1, boss: true, tank: true, armored: true, explosiveMult: 2.0 }` (both pools ×wave scale). `boss:true` reuses the boss-bar + death-cleanup plumbing; `tank:true` selects the new behavior; `armored:true` gates the two-pool damage filter. On spawn set `e.armorHP`/`e.mitriHP` from the def; the boss bar reads `armorHP / armorHPmax`.
- **`EnemyManager.damage()` (L637)**: add the `e.def.armored` two-pool branch from §3, plus the two outcome handlers: **`_tankDestroyed(e)`** (explosives emptied `armorHP` → death sequence + spawn the permanent wreck obstacle) and **`_tankCaptured(e)`** (bullets emptied `mitriHP` → kill Mitri, leave the intact tank as a boardable `CapturedTank`, see §12). Both hide the boss bar and call `onEnemyKilled`/wave-clear + rewards.
- **Wreck as world obstacle**: `_tankDestroyed` registers the wreck's footprint with `World` (the same collision/`rayHit` system the tank used) so it's permanent solid cover; it is **not** added back to `clearAll`'s per-wave cleanup.
- **Spawn (`EnemyManager.spawn` / state init ~L471, mesh build ~L496, scale ~L474)**: branch `typeKey === 'tank'` → `buildTank(camo)`; cache refs to the rig nodes (`turret`, `gunMantlet`, `recoilNode`, `roadWheels`, `sprocket*`, `track*`, `hatch`, `mitri`, `mgMuzzle`, `muzzle`). Init state: `vulnerable=false`, window timers, **hull yaw / turret yaw / gun pitch** angles + rates, **cannon cooldown (7 s)**, **`mgAmmo = 250`** + MG reload timer, recoil offset, **suspension/wheel-spin + track-scroll accumulators**, track-mark emit timer. Attach the two **headlamp `SpotLight`s** (shadowless) to the hull front and keep refs for the darkness toggle. Set collision `radius`/`height`/`headY` for the large hull + cupola head zone; mark **ground-only** (no step-up).
- **Headlight toggle**: each frame ramp the spotlight intensity from the scene-brightness signal (the existing ambient/hemisphere light or day/night value) — on in the dark, off in daylight. Lens emissive + glow follow the same value.
- **Boss branch in `update()` (L575)**: dispatch `e.def.tank ? this._bossTank(e,dt) : this._bossTolo(e,dt)` (extract Tolo's current inline laser code into `_bossTolo` for symmetry). `_bossTank` handles **navigation/steering, LOS gating, reposition-for-shot, stuck recovery**, traverse, cannon/MG/ram, window cycle, phase 2, and all animation lerps.
- **Navigation & LOS** use the existing **`world.rayHit(origin, dir, dist)`** (already used by the rocket's world-hit test): whisker rays for avoidance, muzzle→player LOS for cannon/MG gating, and short muzzle-clearance rays. Tank movement reuses the world wall-collision / wall-slide path but with **step-up disabled** (ground-only) and a large collision radius (~2.6 m).
- **Cannon shell**: reuse the `projectiles` array (like the rocket) with a `tankShell:true` flag (arc + AoE on impact, damages the **player** not enemies; detonates on first world/ground/proximity hit so it never passes through walls). The bazooka rocket path is unchanged.
- **`clearAll()` (L672)**: dispose tank-specific objects (shell/decal/smoke, **headlamp SpotLights**, the wreck mesh) and hide the boss bar (already done).
- **No change needed** for kamikaze-vs-tank: `damageInRadius` already loops `this.active` and the `'explosion'` source already routes through `damage()`.

---

## 9. Build sequence

1. **Boss mechanics first (placeholder box-tank):** boss registry + random pick; `ENEMY_TYPES.tank` (two pools); two-pool damage filter + `_armorPing`; `_bossTank` (**whisker steering / obstacle avoidance, LOS-gated cannon + MG, muzzle clearance, reposition-for-shot, stuck-detection + reverse recovery**, slow turret traverse, cannon AoE + marker + shake, track ram); Mitri vulnerability-window cycle; phase 2; both outcomes (`_tankDestroyed` → wreck obstacle, `_tankCaptured` → inert tank stub); boss bar (armor + Mitri pip) + audio + rewards. Verify the **whole loop** live in Playwright with a crude blocky tank — including a long-run navigation/no-stuck check and both kill outcomes.
2. **Capture & drive (§12):** the `CapturedTank` crew system — board (E), **seat-switch** (driver ↔ gunner), driver periscope view, gunner **thermal sight**, drive + turret + cannon/MG with **limited ammo**, run-over, captured-tank HP + destruction→wreck, exit/re-board. **2-player-ready** seat abstraction. Verify driving, both views, firing, and destruction live.
3. **Visual pass:** build the detailed `buildTank()` T-90M (desert camo, ERA, cage, gun w/ bore evacuator, RWS, road wheels/tracks, cupola, headlamps) + Mitri commander + `buildTankWreck()`, wire all animations + FX. Render-verify from 3 angles + first-person using the voxel-weapon-modeling render loop.

This staging lets gameplay be correct and balanced before art, and the art swaps in without touching logic.

---

## 10. Balance knobs (all tunable live)

Tank `armorHP` ~3600 + `mitriHP` ~750 (both ×wave scale) · `explosiveMult` ~2.0 · window 4 s exposed / 12 s cycle (9 s in phase 2) · **cannon reload 7 s → 5 s (phase 2)**, AoE r6, ~48 dmg, 0.9 s dodge telegraph · **MG belt 250 rounds**, ~6 dmg/round, range 22 m, **reload ~3.5 s** · ram ~40 dmg, range 4 m · move 1.2→1.5 m/s · turret traverse 28°→40°/s · **gun elevation rate ~30°/s** · reward 1500 + 3 keys.
**Captured tank (§12):** own HP ~2200 (enemy explosions damage it) · cannon shells ~16 (player reload ~3.5 s) · MG belt 250 (reload ~3 s) · drive speed a bit nimbler than boss-AI (~1.6 m/s) but still heavy · run-over instakills weak Engendros · controls: board/exit **E**, seat-switch **Q** (F is taken by fullscreen), gunner thermal ON/OFF **T**, peek out of cupola **C** (no cannon while peeked, player exposed). All tank keys are context-gated (only active while crewing).
**Extras (§13/§14):** ERA zones (front glacis / turret cheeks / forward skirts = ERA; rear/roof/tracks = weak), per-panel `spent` · smoke-screen cooldown (phase 2 only) · entrance lane + roll-in speed · `mitriHP` scaling **cap** for late-game capture viability · asymmetric rewards (destroy = more cash/keys; capture = the tank).
**Navigation:** collision radius ~2.6 m (ground-only, step-up off) · whisker rays at 0°/±35°/±70°, length ~(hull + standoff) · hull turn rate ~45°/s · stuck threshold (~<0.4 m moved per 1.2 s) → reverse-recovery ~0.8 s · barrel-reach standoff so the gun never enters geometry.
**FX/feel:** proximity rumble radius ~18 m (shake scales with closeness) · track-mark decals lifetime ~6 s (pooled/capped) · track dust + engine-exhaust particle rates · suspension spring stiffness/damping for hull bob · **headlights**: 2 shadowless SpotLights, cone ~28°, range ~30 m, warm color, intensity ramped by darkness threshold.

---

## 11. Risks / open items

- **Pathing/stuck**: addressed by design (§5: whisker steering around buildings, ground-only large-circle collision with wall-slide, stuck-detection + reverse-recovery, open-lane bias). Still the highest-risk area — **verify live** that the tank navigates the dust2 chokepoints, regains LOS, and never wedges over a long run.
- **LOS edge cases**: confirm the cannon never fires through thin walls/corners and the muzzle-clearance gate prevents point-blank-into-geometry shots; verify the tank repositions (not freezes) when LOS is blocked for a long time.
- **Balance — two outcomes**: explosives→wreck must be the *fast/easy* path; killing Mitri (bullets, windows only)→capture must be *harder but rewarding*. Tune `armorHP`/`mitriHP` so neither path is dominant; confirm a player can't accidentally capture by stray bullets nor accidentally wreck when going for capture (explosives vs bullets keep the pools cleanly separate). Captured tank must not trivialize later waves — it's destructible (own HP) and ammo-limited as the counterweight.
- **ERA must not make destroy impossible**: weak zones (rear/roof/tracks) must be **reachable** — the slow turret + flanking should let a bazooka user get a rear/side shot, and kamikaze mobs must reliably hit the low/track weak zone. Verify zone classification (`_tankHitZone`) is forgiving enough that players aren't confused why a clearly-rear hit "did nothing." Surface ERA defeats clearly (the pop FX + a brief "ERA — HIT THE REAR/TRACKS" hint).
- **Capture-viability cap**: ensure the `mitriHP` scaling cap (§14.3) actually keeps late-game capture possible; **log/telemetry** the typical windows-to-capture during live testing.
- **Captured-tank perf & feel**: thermal sight = a fullscreen post-process (render-target + thermal LUT) only while in the gunner seat — profile it; periscope letterbox is a cheap overlay. Seat system must be **2-player-ready** (each seat an independent control station) without breaking solo seat-switching.
- **Wreck obstacle perf**: permanent wrecks accumulate over a long run — cap geometry, merge, and confirm pathing treats them as obstacles (enemies route around, don't clip).
- **Performance**: detailed tank = many voxels + extra FX (track-mark decals, dust + exhaust particles, MG tracers, suspension updates per wheel, **2 dynamic headlight SpotLights**). Cache geometry like other meshes; **pool & cap** decals/particles with finite lifetimes; keep headlights **shadowless** (no shadow-map cost) and cull them when off; one tank on screen at a time, so acceptable — but profile the FX during phase 2.
- **Darkness signal — confirmed, already exists**: the game has a full **`DayNight`** system (`game.dayNight`) driving `engine.hemi.intensity = 0.05 + L*0.9` and `engine.ambient.intensity`, where **`L` = daylight level (1 = noon, 0 = night)**. Headlights ramp on `(1 − L)` (or read `engine.hemi.intensity`). In standard **PURGE** mode `dayNight.active` is false (holds bright noon) → headlights stay **off** (lenses just glow). In **THE LONG NIGHT** mode they shine through the dark, and during a **BLOOD MOON** night they're at full dramatic effect — exactly the "když bude tma, ať svítí" intent. (Also dovetails with the existing flashlight/flares night gear.)
- **Immunity clarity**: the ricochet feedback must read instantly so players don't think the game is broken when bullets do nothing.

---

## 12. Capturing & driving the tank — crew system (2-player-ready)

When you defeat the boss by **killing Mitri** (bullets, during his windows — *not* explosives), `_tankCaptured(e)` fires: Mitri slumps/falls from the cupola, the tank goes **inert/abandoned** (engine idles, turret droops, it stops attacking, leaves the enemy list), the wave clears, and the now-**friendly T-90M** becomes a boardable vehicle.

> **Co-op note:** another Claude instance is building real co-op. So this is architected **2-player-ready** — the crew/seat layer is decoupled from "the local player." For now a single player **switches seats**; when networking lands, a second occupant simply fills the other seat and both stations run simultaneously with no logic change.

### 12.1 `CapturedTank` (vehicle) + seat abstraction
A new class (modeled on the existing `MountedGun` mount/dismount/`controlUpdate`/camera pattern, but with two stations and movement):

```
CapturedTank
  seats = {
    driver:  { occupant: null, view: 'periscope', controls: drive }
    gunner:  { occupant: null, view: 'thermal',   controls: turret + cannon + MG }
  }
  hp, cannonAmmo, mgAmmo, mgReload, cannonReload, ...
```

- **Occupant model:** each seat holds an `occupant` (currently the local player; later a remote player). Helpers `enter(seat, who)`, `leave(who)`, `switchSeat(who)`. Solo play = one occupant that moves between seats; the *other* seat's per-frame logic simply idles when empty. **No code path assumes a single global player** — that's the 2-player-ready contract.
- **Boarding:** walk up → `Press E to commandeer the T-90M`. `E` enters the **driver** seat by default (last-used seat on later boards). **`Q`** = switch seat (driver ↔ gunner) — *not F, which is the fullscreen toggle*. **`E`** again = dismount (back on foot). All tank keys are **context-gated** (only handled while crewing, so they don't clash with flares `C` / fire-mode `B` in normal play). Reuses the input/HUD-interact plumbing already used for the .50 cal.
- **Solo seat behavior (2-player-ready):** in the driver seat the turret holds its angle (gunner idle); in the gunner seat the hull holds position (parking brake, driver idle). With two occupants both run at once — same code, just both seats filled.

### 12.2 Driver station — periscope view (ref image 18)
- First-person from the driver's hatch: a **vision-slit / periscope letterbox** overlay (narrow horizontal slot, black mask around it) that **limits FOV** — the realistic "drive blind through a slot" feel.
- Controls: **W/S** throttle (forward/reverse), **A/D** steer (tracked turn; can neutral-steer in place), tank accelerates/brakes with weight (uses the same suspension/track/engine anim + sounds as the boss tank). No weapons from the driver seat.
- Headlights (§6) are great here at night — driver flips them on in the dark.

### 12.3 Commander / gunner station — two stances + the sight (ref image 19)
The commander seat has **two stances** the player toggles between (mirrors how Mitri popped out):

**A) Buttoned-up at the sight** (can fire the main cannon)
- First-person down the gun sight. The optic has a **thermal ON/OFF toggle** (key **T**) — *both modes can fire the cannon*:
  - **Thermal ON:** scene drawn through a **thermal post-process** — desaturated **“white-hot”** ramp where **Engendros read as bright hot blobs** against a cooler world (muzzle/explosions flare). Implementation: render the scene to a render target + luminance→thermal LUT shader while at the sight; enemies nudged hot via an emissive/marker pass.
  - **Thermal OFF:** a normal **day optic** — clear daylight view through the sight (reticle + slight zoom), no thermal coloring.
- **Authentic Cyrillic sight HUD (азбука):** reticle/crosshair + Russian-style markings like the reference — e.g. mode label **«ТЕПЛО»** (thermal) / **«ДЕНЬ»** (day), **«ДАЛЬНОСТЬ»** + range number, **«ОГОНЬ» / «ЗАРЯД»** (fire / reloading), shell-count, the `ОЧ`-style tag from image 19, thin bezel + reticle ticks. Real Cyrillic, not transliterated.
- Controls: **mouse** traverses the turret (slow, weighty) + elevates the gun (the real yaw/pitch axes §6); **LMB** = **125 mm cannon** (AoE shell, recoil, ~3.5 s reload, **limited shells**); **RMB / key** = **coax MG** (tracers, 250-belt, reload); optional zoom step; **T** toggles thermal.

**B) Peek out of the cupola** (head out, like Mitri — situational awareness, **no cannon**)
- Press the **peek key** (e.g. **C**) to **pop the hatch and raise up** out of the cupola: a **wide free-look** view over the turret (great for spotting flankers/where to drive), with no optic letterbox.
- **The main cannon is disabled while peeking** — to fire it you must drop back down to the sight (stance A). *(The remote RWS MG may still be usable peeked, since it's remote-operated — default: MG yes, cannon no. Tunable.)*
- **Exposed = vulnerable:** just like Mitri was the weak point, a peeking player can be **hit/killed by enemies** (damage goes to the player, not the tank). Risk/reward: better awareness, but pop back down before you get shredded.
- Visually reuses the same `hatch` open + commander-rise rig — now it's *you* in the cupola.

### 12.4 Driving it in combat (the reward)
- The captured tank turns the tide for a while: the **cannon** clears clusters of Engendros (AoE), the **MG** mows runners, and **driving over** weak enemies crushes them (instakill small types, damage to bigger). Tracks lay marks + dust as you go (§6 FX).
- **Limited ammo** is the counterweight: ~16 cannon shells + an MG belt that reloads. When the cannon is dry you fight on with the MG, and when both run out you **dismount and continue on foot** (or just keep using it as a mobile ram/shield).

### 12.5 Lifespan, vulnerability & destruction
- **Persistent:** the captured tank is **yours across waves** until destroyed — a recurring war machine.
- **Destructible:** it has its **own HP** pool. Enemy **explosions** (chargers/exploders) and heavy contact damage it; a HP bar shows while you crew it. (Boss attacks like Tolo's laser also hurt it.)
- **Destroyed while crewed:** big explosion → the player is **ejected and takes a hit** → the tank becomes the same **permanent wreck obstacle** (`buildTankWreck`, §6) with collision.
- **Exit & re-board:** when you dismount it stays **parked and friendly** (yours to re-board); enemies don't re-crew it but can still damage/destroy it. (Future co-op: a teammate can be aboard while you're on foot.)

### 12.6 Integration hooks (additions to §8)
- New **`CapturedTank` class** near `MountedGun` (~L1964); instantiated by `_tankCaptured(e)` from the dead boss's transform + its already-built `buildTank` mesh (reuse the mesh — just detach Mitri, flip it from enemy AI to vehicle control). Holds seat state, ammo, HP.
- **Game loop**: when a seat is occupied, route input + camera through the active seat's `controlUpdate(dt)` (mirrors `player.mountedGun` handling at ~L2494); `E`/`F` handled next to the existing `E` mount branch (~L2320). HUD interact prompts mirror the .50-cal lines (~L2510).
- **Thermal post-process** lives in the render path (engine), enabled only while the gunner seat is active **at the sight with thermal ON** (toggle **T**); off → plain day-optic render. **Sight/periscope overlays + the Cyrillic HUD** are DOM/canvas layers like the existing HUD. The commander **peek stance** (**C**) is a camera/state swap (wide free-look, cannon disabled, player hittable) reusing the `hatch`+rise rig — gate cannon-fire on `stance==='sight'`.
- **Captured-tank cannon/MG** damage enemies via the existing `damageInRadius` / `rayHit` + `damage()` paths (now firing *at* Engendros). Run-over uses a proximity check in the vehicle update.
- **Cleanup**: a destroyed captured tank converts to the permanent wreck obstacle (not cleared per wave); on full game reset, dispose vehicle + thermal target.

### 12.7 Build note
This is **build phase 2** (§9). Phase 1 stubs `_tankCaptured` as "spawn an inert tank you can't yet drive" so the boss fight is fully testable first; phase 2 fleshes out `CapturedTank` (seats, views, driving, firing, destruction). Verify live: capture trigger, board/seat-switch, periscope drive, thermal aim+fire, ammo limits, taking damage → destruction → wreck.

---

## 13. Extras (selected)

### 13.1 ERA reactive armor — defeats explosives on the front (mechanic in §3)
Covered as a core damage rule in §3 (front/turret/forward-side ERA zones defeat shaped-charge explosives; rear/roof/tracks are weak). The **visual reaction**: when a blast hits an intact ERA panel, the brick **flashes + pops/blows off** with a sharp crack and a small puff (no `armorHP` lost), and that spot is now bare metal (re-hittable). Spent bricks visibly missing from the model. Juicy feedback that reads as "the armor ate it — go around."

### 13.2 Dramatic entrance
The tank does **not** pop in at a spawn point. On a tank boss wave it **rolls in from a map edge / gate**: engine roar + a low horn, a dust trail, ground rumble (proximity shake §7), and the banner `T-90M «MITRI» ROLLS IN`. It drives to the arena under the entrance, then begins normal `_bossTank` behavior. (Pick an open edge lane so the entrance path is clear; falls back to a normal spawn if no clear lane.)

### 13.3 Smoke screen (phase 2)
Using the turret's **smoke-grenade launchers** (the tube banks visible on the real T-90M), in phase 2 the tank periodically **fires a smoke screen**: a bank of grenades arcs out and bursts into a **rolling smoke cloud** in front of it that **briefly obscures the player's view/aim** (and breaks the player's LOS to Mitri/weak spots), forcing a reposition. On a cooldown so it punctuates the enrage rather than spamming. (Cheap billboarded smoke puffs; cap particles.)

---

## 14. Onboarding, feedback, rewards & lifecycle (recommended)

### 14.1 Teach the two paths (discoverability)
The capture route is invisible unless taught. On the **first** tank encounter, show a one-time banner/objective: **"Blow the armor with explosives — or snipe the COMMANDER to STEAL the tank!"** Reinforce contextually: the `_armorPing` ricochet occasionally floats **"ARMORED — flank the rear or hit the commander"**, and when Mitri first pops out, a hint **"Shoot the commander!"**. Keep hints rare after the first kill.

### 14.2 Distinct outcome feedback + asymmetric rewards
- Clear, different end states: **`T-90M DESTROYED`** (big kill banner) vs **`TANK COMMANDEERED!`** (capture banner + "Press E to board").
- **Asymmetric rewards so neither path dominates:** destroying pays **more cash + keys** (you walked away with loot, no vehicle); capturing pays **less cash** but the **tank itself is the reward**. Tune so the choice is genuine (power now vs economy now).

### 14.3 Capture stays viable late-game
`mitriHP` scales with wave, but **cap its growth** (and/or slightly widen the exposed window at high waves) so stealing the tank remains achievable on wave 25/30+, not just early. Without a cap, late Mitri would be unkillable within the short windows and the capture route would silently die.

### 14.4 Tank-vs-tank & fighting bosses from your tank
If you keep a captured tank into a later boss wave, it should "just work": your **explosive cannon shells damage an enemy tank's `armorHP`** (respecting its ERA zones — so you aim for *its* weak spots too) → an intentional **tank duel**; against Tolo, your shells/MG hit it normally. Confirm friendly-tank projectiles route through the enemy `damage()` paths and that an enemy boss can damage/destroy your captured tank.

### 14.5 Lifecycle / state integration
- **Pause/resume**: vehicle + thermal post-process freeze and restore cleanly.
- **Game over / restart**: the existing reset path (like `mountedGun.forceReset()`) must eject the player, dispose the `CapturedTank` + thermal render target, and clear permanent wrecks; new run starts fresh.
- **One active captured tank** at a time: capturing implies you don't already hold one being driven (a second parked friendly tank is allowed but won't be crewed by AI). Define what happens if destroyed while you're on foot (stays a wreck).
- Appears in **both PURGE and THE LONG NIGHT** modes (headlights shine in the latter).
