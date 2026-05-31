# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**ENGENDROS PURGE** — a browser-based voxel FPS wave shooter (Zumbi-Blocks-style) built with **vanilla JavaScript + Three.js**. No build step, no framework, no bundler, no package.json. The browser parses native ES modules directly. Survive waves of "Engendros" plush-zombies on a de_dust2-flavored arena; hand-modeled voxel weapons, a bank economy + lobby shop loot loop, bosses (a plush "Tolo" and a capturable T-90M tank), and peer-to-peer co-op.

## Running, testing, deploying

There is **no build, no test suite, and no linter.** It is a static site that must be served over **HTTP** (ES modules + `fetch()` are blocked on `file://`).

```bash
# Run locally — any static server works; open http://localhost:8000
python3 -m http.server 8000
#   …or
npx serve .
```

- **Verification is manual / in-browser.** There are no automated tests. Validate gameplay by playing, and via the browser console against the `window.GAME` singleton (e.g. `GAME.waves.startWave(7)`, `GAME.meta`, `localStorage.getItem('engendros_meta')`). For multi-agent eval, the co-op logic was verified this way, not with a test harness.
- **Module caching is aggressive.** After editing `src/*.js`, a plain refresh often serves stale modules. Bump the `?v=` (see below) or hit the page with a throwaway `?cb=<n>` query param to force Chrome to re-fetch.
- **Deploy:** static site on **Vercel**, auto-deploys on every push to `main` (live at `engendros-purge.vercel.app`). No config needed. `.vercelignore` strips `.git`, `docs/`, dev HTML viewers (`glb-*.html`, `tank-viewer.html`, …), and the heavy `*.orig.glb` source models to keep the bundle small.

### ⚠️ Cache-bust ritual — required on every deploy

The single most important non-obvious workflow. On each deploy:

1. Bump the `?v=N` query string on `index.html`'s entry script: `<script type="module" src="./src/game.js?v=149">`.
2. Bump `GAME_BUILD` (a `'YYYY-MM-DD HH:MM'` string near the top of `src/game.js`) to the current local minute.

`GAME_VERSION` is auto-extracted at runtime from the module's own `import.meta.url` `?v=` param, so it can't drift from the code the browser actually loaded. Both `GAME_VERSION` and `GAME_BUILD` are shown in the co-op lobby footer — keep them in sync so the lobby always reports the real loaded build. Note `audio.js` carries its own independent `?v=` (and `engine.js`/`util.js` use `?e=`/`?u=`) on their import URLs — bump those if you change those modules and need clients to refetch.

## Architecture

### Entry point & boot

`index.html` → an **import map** (`{ "imports": { "three": "./vendor/three.module.min.js" } }`, so all code does `import * as THREE from 'three'`) → `<script type="module" src="./src/game.js?v=…">` → `window.GAME = new Game()` on `DOMContentLoaded`. Vendored Three.js **r160** plus `GLTFLoader.js` and `BufferGeometryUtils.js` live in `vendor/`.

### The monolith: `src/game.js`

~8,000 lines containing **22 top-level classes**. `Game` is the orchestrator (declared last); the rest are subsystems it owns. When navigating, grep for `class <Name>`:

| Class | Role |
|---|---|
| `Game` | Orchestrator — owns all subsystems, the `_frame` loop, the state machine, and player/world state as properties. |
| `World` | Built-in arena mesh + `boxes` (AABB colliders used for all collision/pathing — there is no navmesh). |
| `Enemy` / `EnemyManager` | Pooled enemies, spawn, steering AI, contact damage, boss behaviors, death. |
| `WaveManager` | Continuous wave spawning, wave archetypes, boss/miniboss scheduling. |
| `WeaponSystem` | Firing/hitscan, reload, recoil/bloom, melee swings, throwables; renders the viewmodel. |
| `Inventory` | Flat 15-slot backpack, held-item dispatch, loadout deployment. |
| `LootManager` | Ground pickups, enemy-drop rolls, supply drops. |
| `Player` | FPS controller — movement, collision/step-up, survival timers (HP/armor/hunger/burn/fall). |
| `Shop` | The **lobby Armory** (the name is legacy; the in-run shop was removed). |
| `HUD` / `UI` / `Settings` | DOM-driven HUD, overlay switching, persisted settings. |
| `BuildManager` / `MountedGun` / `CapturedTank` / `DayNight` | Fortifications, the .50-cal, the drivable captured tank, day/night cycle. |
| `WeaponPreview` / `AssetViewer` / `Admin` | Shop/admin 3D model previews. |
| `Net` / `MP` / `RemotePlayer` | (`Net` lives in `net.js`) co-op transport, host-authoritative state machine, remote-player ghosts. |

> **⚠️ Planned split (designed, not yet executed):** `game.js` will be broken into ~16 domain modules (`tuning`/`economy`/`bosstank`/`props`/`weapons`/`enemies`/`vehicles`/`world`/`loot`/`player`/`waves`/`inventory`/`ui`/`admin`/`mp`), leaving `game.js` a thin orchestrator. It is a **purely mechanical move — no logic changes** — done leaf-first on a clean tree (after the co-op work merges). The design + the load-fatal traps to avoid (an `enemies`↔`vehicles` import cycle, the lazily-reassigned tank decal pool, and the gameplay RNG helpers `rr`/`ri`/`pick`/`weightedPick`/`rayAABB` that must move out of `game.js` into a leaf) live in `docs/superpowers/specs/2026-05-31-gamejs-module-split-design.md`. Until it lands, keep large `game.js` edits minimal so they don't conflict with the split.

### Game loop & state machine

`requestAnimationFrame` → `Game._frame(t)` computes `dt` (**clamped to 50 ms** to survive frame stutters), calls `_updatePlaying(dt)` only when `state === 'playing'`, then `engine.update/render`, then `input.endFrame()`. **Variable timestep, no fixed tick** — every subsystem `.update(dt)` runs once per frame.

`Game.state` is a single string (`menu` / `playing` / `paused` / `dead`/`gameover` / `shop` / `admin` / `lobby` / `settings`) that gates input, physics, and which overlay is visible. Two run modes via `startGame(mode)`: `purge` and `longnight` (endless). `reset()` wipes per-run state.

### Supporting modules (`src/`)

- **`engine.js`** — `Engine` + `WEAPON_LAYER` (=1). **Two-pass render:** pass 1 draws the world (layer 0); pass 2 clears *only the depth buffer* and draws the viewmodel (layer 1) so the weapon never occludes/gets occluded by the world. Lights are enabled on both layers. The crisp pixel look comes from rendering to a low-res target and CSS-upscaling. Also sky dome, fog, clouds, camera shake.
- **`input.js`** — `Input`. Frame-stepped pointer-lock keyboard/mouse: `down` (held), `pressed`/`released` (this-frame edges). **You must call `input.endFrame()` each loop** or edges persist. Mouse/buttons only accumulate while pointer-locked.
- **`audio.js`** — `AudioManager`. Almost entirely **procedural Web Audio synthesis** (gunshots, the layered M2HB .50-cal, explosions, the Soviet radio broadcast). The few real samples (`assets/crew-lines.mp3`, `assets/jet.mp3`) fail *gracefully* to synth. `init()` must be triggered from a user gesture; guard every sound with `if (!this.ctx)`.
- **`effects.js`** — `Effects`. An 800-particle `InstancedMesh` pool (one draw call) plus tracers, muzzle flashes, explosion rings, fire pools, decals.
- **`util.js`** — `MeshBuilder`, `voxelMaterial`, math (`clamp`/`lerp`/`damp`/`TAU`/`deg`), color (`shade`/`hex`), and the **seeded** RNG (`makeRNG`/`rng` mulberry32, used only for map generation — gameplay RNG is the unseeded `rr`/`ri`/`pick`/`weightedPick` helpers at the top of `game.js`).

### Co-op networking (host-authoritative)

PeerJS WebRTC, star topology. `net.js` (`Net` + 5-char `makeRoomCode`) is the transport; `MP` (in `game.js`) is the game-side state machine; `RemotePlayer` draws each peer's interpolated ghost.

- **Authority split:** the host runs `EnemyManager`/`WaveManager`/`LootManager` and owns all damage and `pstate` (per-player hp/armor/down/dead). Clients simulate **only their local player**, broadcast their transform (`xf`, ~every 66 ms), and replay host broadcasts (`esnap` enemy snapshots ~every 80 ms, `pstate`, spawns, loot). A client's raycast hits a *ghost* enemy; it must claim the hit to the host, which applies damage. Check `hostSim = !mp.active || mp.isHost` before running authoritative logic.
- **Message envelope:** `{ t: type, d: data, _r?: true }`. `_r` means the host relays it to the other clients.
- **Downed/revive:** 3-down rule — two survivable knockdowns with a 20 s host-ticked bleed-out bar; a teammate holds **E** (~3.5 s) to revive. Late joiners get a full world sync from the host.
- Solo play runs the same code with multiplayer dormant — most logic is gated on `mp.active`.

### Voxel modeling

All voxel assets (weapons, enemies, props) are **procedurally built**, not loaded files. The pattern: one `MeshBuilder` per asset accumulates `.box(w,h,d,x,y,z,color,opts)` / `.geo(threeGeometry,…)` calls, then `.build()` returns a single merged `BufferGeometry` paired with `voxelMaterial()` (vertex-colored `MeshLambertMaterial`).

- **Weapons:** the `WEAPONS` registry (top of `game.js`) defines every gun/melee by stats + a `.shape` key. `buildViewmodel(def)` dispatches on `def.shape` — **a shape with no matching case renders invisible.** Enemies use `buildEngendro()` / `buildTolo()`.
- **Layered-shading aesthetic:** each surface uses a 5-tone palette (Hi/Mid/Lo/Slot/Bright) — thin lit top strip + dark bottom shadow + proud recess boxes. A model built with only 2–3 tones reads as a featureless blob. **`/.claude/skills/voxel-weapon-modeling/SKILL.md` is the canonical guide** — read it before building or upgrading any voxel model (also surfaced as the `voxel-weapon-modeling` skill).
- **Coordinate conventions:** world/tank space forward = **+Z**, up = +Y, right = +X (~1 unit ≈ 1 m). First-person viewmodel space: muzzle = **−Z**, stock/grip = +Z. `THREE.CylinderGeometry` defaults to a +Y axis.
- **Standalone model files:** `t34model.js` (scratch T-34), `tankmodel.js` (scratch voxel T-90M «MITRI» + `buildMitri`/`buildTankWreck`), `su34model.js` (Su-34 jet for the flyby/asset viewer), and `tankglb.js` — which loads the realistic `assets/modely/tank_t-90_custom_design.glb` and **auto-rigs it at load time** (classifying its ~326 unnamed meshes by bounding-box height to build the turret/barrel hierarchy; `preloadTank()` must be awaited before `buildTank()`). Tank rigs expose a `userData` contract (`turret`, `gunMantlet`, `recoilNode`, `muzzle`, `hatch`, `mitri`, road wheels, headlamps, …).

### Combat & economy data

- **Registries** (consts at the top of `game.js`): `WEAPONS`, `ITEM_DEFS` (consumables/throwables/materials/callables), `ENEMY_TYPES`, `WAVE_TYPES`, `BOSS_ROSTER = ['boss','tank']`, `ARMORY_SLOTS` (typed loadout: primary/secondary/melee/gadget1/gadget2), `GADGETS`.
- **Bosses** spawn on boss waves. **Tolo** is HP-phase-gated and immune *except* its belly bullseye while charging. The **T-90M «MITRI»** has dual health pools — explosives wreck the armor; killing the exposed commander captures it as a drivable tank (with a thermal gunner sight).
- **Ammo asymmetry:** ground ammo boxes refill **only the gun currently in hand**, never backpack reserves — picking what you hold matters.
- **Persistence:** `game.meta` is stored in `localStorage['engendros_meta']` = `{ bank, unlocked[], loadout{…}, playerId, bestWave, bestNight, kills, runs }`. In-run `money` is banked into `meta.bank` once at run-end; you spend the bank only in the lobby Armory. Cold start is **knife-only**. Each player's meta is local — there is no server sync.
- **Vestigial systems:** the rarity tiers (CSS `--c-common/rare/epic/legendary`) and the old key→lootbox mechanic are leftovers from before the 2026-05-29 continuous-waves/loadout redesign (`docs/superpowers/specs/2026-05-29-continuous-waves-pregame-loadout-design.md`). Some key-cash drop code still runs; don't build on rarity/keys.

## Conventions & gotchas

- **HUD is DOM, driven imperatively.** All the HUD/overlay markup + CSS design system lives in `index.html`; the `HUD`/`UI` classes hold cached element refs and update via setters (`setHealth`, `setMoney`, …) and `classList` toggles. There is no batching — every change writes the DOM immediately.
- **`Player.update(dt)` runs every frame even when mounted** (.50-cal / tank) — it's the fallback camera source; the mount's own control overrides input/camera afterward.
- **No async in the game loop.** Updates are synchronous; only asset/network loading is async (fire-and-forget with fallbacks).
- **Enemies are pooled** — `e.alive = false` queues reuse, it doesn't free the object.
- **Docs** live in `docs/superpowers/` (specs + plans, e.g. the tank-MITRI boss design/plan) and `docs/su34-jetworks-rebuild.md`. The root is also littered with gitignored QA screenshots (`shot-*`, `tank-*`, etc.) and standalone dev viewers — these are not part of the game.
