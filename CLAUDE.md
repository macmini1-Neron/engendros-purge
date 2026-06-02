# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**ENGENDROS PURGE** — a browser-based voxel FPS wave shooter (Zumbi-Blocks-style) built with **vanilla JavaScript + Three.js**. No build step, no framework, no bundler, no package.json. The browser parses native ES modules directly. Survive waves of "Engendros" plush-zombies on a de_dust2-flavored arena; hand-modeled voxel weapons, a bank economy + lobby shop loot loop, bosses (a plush "Tolo" and a capturable T-90M tank), and host-authoritative co-op (WebRTC or a LAN/Hamachi WebSocket relay).

## Running, testing, deploying

There is **no build, no test suite, and no linter.** It is a static site that must be served over **HTTP** (ES modules + `fetch()` are blocked on `file://`).

```bash
# Run locally — any static server works; open http://localhost:8000
python3 -m http.server 8000
#   …or
npx serve .
```

- **Verification is manual / in-browser.** There are no automated tests. Validate gameplay by playing, and via the browser console against the `window.GAME` singleton (e.g. `GAME.waves.startWave(7)`, `GAME.meta`, `localStorage.getItem('engendros_meta')`). For multi-agent eval, the co-op logic was verified this way, not with a test harness.
- **Co-op needs a peer.** WebRTC co-op works from any HTTP server (the host shares a 5-char room code). The optional **LAN/Hamachi** transport additionally needs the bundled relay running on the host machine — `node scripts/lan-server.js --host 0.0.0.0 --port 8787` — with the game served from that same host (full setup in `README.md`, the multiplayer manual).
- **Module caching.** In production, `vercel.json` sends `Cache-Control: no-store` for `/`, `/index.html`, and `/src/*`, so deploys serve fresh modules. **Locally**, a plain refresh can still serve a stale `src/*.js` from Chrome's cache — hit the page with a throwaway `?cb=<n>` query param (or bump the entry `?v=`, see below) to force a re-fetch.
- **Deploy:** static site on **Vercel**, auto-deploys on every push to `main` (live at `engendros-purge.vercel.app`). Config is `vercel.json` (the no-store cache headers above). `.vercelignore` strips `.git`, `docs/`, dev HTML viewers (`glb-*.html`, `tank-viewer.html`, …), and the heavy `*.orig.glb` source models to keep the bundle small.

### ⚠️ Cache-bust ritual — required on every deploy

The single most important non-obvious workflow. On each deploy:

1. Bump the `?v=N` query string on `index.html`'s entry script: `<script type="module" src="./src/game.js?v=190">` (currently `190`).
2. Bump `GAME_BUILD` (a `'YYYY-MM-DD HH:MM'` string near the top of `src/game.js`) to the current local minute.

`GAME_VERSION` is auto-extracted at runtime from the module's own `import.meta.url` `?v=` param, so it can't drift from the code the browser actually loaded. Both `GAME_VERSION` and `GAME_BUILD` are shown in the menu + co-op lobby footer — keep them in sync so the lobby always reports the real loaded build.

**This is now the only cache-bust knob.** The old per-module scheme (independent `?v=`/`?e=`/`?u=` on the `audio.js`/`engine.js`/`util.js` import URLs) was **removed** — every internal `import` in `src/*.js` is now a bare, unversioned path. Production freshness is handled instead by `vercel.json` (`Cache-Control: no-store` on `/`, `/index.html`, `/src/*`); the entry `?v=N` bump above still matters only because `index.html` and `GAME_VERSION` reference it. Don't re-add per-module query params.

## Git workflow

**Applies to both brothers, strictly, on every code task.** `main` is branch-protected (PR + 1 approval) and **auto-deploys to Vercel on every push** → **never commit or push directly to `main`.** All work flows: feature branch → PR → the other brother approves → merge.

### Start-of-task ritual — Claude runs this at the start of every code change

Before touching code, Claude runs and shows these, explaining each in one sentence:

1. `git status` + `git branch --show-current` — confirm where we are and that the tree is clean.
2. If there are **unrelated** uncommitted changes, stop and flag it — don't pile new work onto a mixed branch.
3. If we're on `main` (or a stale/unrelated branch), branch off fresh from up-to-date main:
   - `git checkout main && git pull` — get the latest first.
   - `git checkout -b <type>/<short-desc>` — e.g. `feat/muzzle-flash`, `fix/reload-stall`.

**Teaching mode:** Claude executes the git commands itself, but ALWAYS prints the exact command first and explains in one sentence what it does and why — so both brothers learn by watching. (Neither brother is a git expert yet; this is deliberate hand-holding, not noise.)

### Branch names

`type/kebab-description` — `feat/`, `fix/`, `docs/`, `refactor/`, `chore/`. (Matches existing `feat/coop-sync-overhaul`.)

### Commits

Conventional style `type(scope): summary` (matches history: `feat(coop): …`, `fix(ammo): …`). Small, logical steps — one concern per commit. Commit/push only when the user asks.

### Finishing a branch

1. If the change ships to players, do the **cache-bust ritual first** (bump `?v=N` + `GAME_BUILD` — see above).
2. `git push -u origin <branch>` — publish the branch.
3. `gh pr create` — open the PR.
4. The other brother reviews & approves (1 required), then merges → Vercel auto-deploys.
5. After merge: `git branch -d <branch>` locally; `/clean_gone` clears merged remote branches.

## Architecture

### Entry point & boot

`index.html` → an **import map** (`{ "imports": { "three": "./vendor/three.module.min.js" } }`, so all code does `import * as THREE from 'three'`) → `<script type="module" src="./src/game.js?v=…">` → `window.GAME = new Game()` on `DOMContentLoaded`. Vendored Three.js **r160** plus `GLTFLoader.js` and `BufferGeometryUtils.js` live in `vendor/`.

### Module layout — `game.js` is a thin orchestrator

The codebase was **split** (done & merged) from one ~8,000-line `src/game.js` monolith into **~26 ES modules** under `src/`. `game.js` is now a **~685-line orchestrator**: the `Game` class (the only class left in it) owns every subsystem, runs the `_frame` loop + state machine, and wires the DOM/input. Every other class lives in its own domain module. When navigating, grep for `class <Name>` or use the table:

| Class(es) | Module | Role |
|---|---|---|
| `Game` | `game.js` | Orchestrator — owns all subsystems, the `_frame` loop, the state machine, and player/world state as properties. |
| `World` / `BuildManager` / `DayNight` | `world.js` | Arena mesh + `boxes` (AABB colliders for all collision/pathing — no navmesh); player fortifications; day/night sky + flashlight. |
| `Enemy` / `EnemyManager` | `enemies.js` | Pooled enemies, spawn, steering AI, contact damage, boss behaviors, death; `ENEMY_TYPES`, `buildEngendro`/`buildTolo`. |
| `WaveManager` | `waves.js` | Continuous wave spawning, wave archetypes, boss/miniboss scheduling. |
| `WeaponSystem` / `MountedGun` | `weapons.js` | Firing/hitscan, reload, recoil/bloom, melee, throwables, viewmodel; the rooftop .50-cal; the `WEAPONS` registry + `buildViewmodel`. |
| `Inventory` / `Shop` | `inventory.js` | Flat 15-slot backpack + held-item dispatch; the lobby Armory (name is legacy; the in-run shop was removed); `GADGETS`/`ARMORY_SLOTS`. |
| `LootManager` | `loot.js` | Ground pickups, enemy-drop rolls, supply drops; the `ITEM_DEFS` registry. |
| `Player` | `player.js` | FPS controller — movement, collision/step-up, survival timers (HP/armor/hunger/burn/fall). |
| `HUD` / `UI` / `Settings` / `WeaponPreview` | `ui.js` | DOM-driven HUD, overlay switching, persisted settings, shop model preview. |
| `Admin` (+ `AssetViewer`) | `admin.js` | Admin/asset 3D model + procedural-sound viewer. |
| `CapturedTank` | `vehicles.js` | The drivable captured tank (driver + thermal gunner seats). |
| `Net` / `LanNet` | `net.js` | Co-op transports: PeerJS WebRTC, and a WebSocket LAN/Hamachi relay client. |
| `MP` / `RemotePlayer` | `mp.js` | Host-authoritative co-op state machine; interpolated remote-player ghosts. |

Pure-data / builder leaf modules carry no gameplay classes: `tuning.js` (constants + `WAVE_TYPES`/`BOSS_ROSTER`/sky data), `economy.js` (`KILL_CASH`/`KEY_CASH`/`SUPPLY_CASH`, `STRUCT_DEFS`/`STRUCT_CAP`), `props.js` (Flopo / fortification / Su-24 / flare builders), `bosstank.js` (the **live** voxel T-90M «MITRI» build + rig/anim/FX + `_tankWrecks`), and the infrastructure leaves `engine.js`/`effects.js`/`audio.js`/`input.js`/`util.js`.

> The split design + the load-fatal traps that were handled (the `enemies`↔`vehicles` import cycle, broken via `bosstank.js`; the lazily-reassigned tank decal pool; and moving the gameplay RNG helpers `rr`/`ri`/`pick`/`weightedPick`/`rayAABB` out of `game.js` into `util.js`) are documented in `docs/superpowers/specs/2026-05-31-gamejs-module-split-design.md`. It was a **purely mechanical move — no logic changes.**

### Game loop & state machine

`requestAnimationFrame` → `Game._frame(t)` computes `dt` (**clamped to 50 ms** to survive frame stutters), calls `_updatePlaying(dt)` only when `state === 'playing'`, then `engine.update/render`, then `input.endFrame()`. **Variable timestep, no fixed tick** — every subsystem `.update(dt)` runs once per frame.

`Game.state` is a single string (`menu` / `playing` / `paused` / `dead`/`gameover` / `shop` / `admin` / `lobby` / `settings`) that gates input, physics, and which overlay is visible. Two run modes via `startGame(mode)`: `purge` and `longnight` (endless). `reset()` wipes per-run state. **In co-op the game never enters `paused`** — the in-run menu is a non-blocking `mpMenuOpen` overlay so the host sim keeps running (see Co-op networking).

### Supporting modules (`src/`)

- **`engine.js`** — `Engine` + `WEAPON_LAYER` (=1). **Two-pass render:** pass 1 draws the world (layer 0); pass 2 clears *only the depth buffer* and draws the viewmodel (layer 1) so the weapon never occludes/gets occluded by the world. Lights are enabled on both layers. The crisp pixel look comes from rendering to a low-res target and CSS-upscaling. Also sky dome, fog, clouds, camera shake.
- **`input.js`** — `Input`. Frame-stepped pointer-lock keyboard/mouse: `down` (held), `pressed`/`released` (this-frame edges). **You must call `input.endFrame()` each loop** or edges persist. Mouse/buttons only accumulate while pointer-locked.
- **`audio.js`** — `AudioManager`. Almost entirely **procedural Web Audio synthesis** (gunshots, the layered M2HB .50-cal, explosions, the Soviet radio broadcast). The few real samples (`assets/crew-lines.mp3`, `assets/jet.mp3`) fail *gracefully* to synth. `init()` must be triggered from a user gesture; guard every sound with `if (!this.ctx)`.
- **`effects.js`** — `Effects`. An 800-particle `InstancedMesh` pool (one draw call) plus tracers, muzzle flashes, explosion rings, fire pools, decals.
- **`util.js`** — `MeshBuilder`, `voxelMaterial`, math (`clamp`/`lerp`/`damp`/`TAU`/`deg`), color (`shade`/`hex`), and **both RNG families**: the **seeded** `makeRNG`/`rng` (mulberry32, map generation only) and the **unseeded** gameplay helpers `rr`/`ri`/`pick`/`chc`/`weightedPick` (+ `rayAABB`) — the latter were moved here from `game.js` during the split, so keep gameplay code on the unseeded set.

### Co-op networking (host-authoritative)

Star topology with **two interchangeable transports** in `net.js`: **`Net`** (PeerJS WebRTC over the public broker, with STUN + a fallback TURN relay) and **`LanNet`** (WebSocket to the bundled `scripts/lan-server.js` relay, for Hamachi/same-LAN play). `makeRoomCode()` mints the 5-char room code (which is also the WebRTC broker id). **`MP` (in `mp.js`)** is the game-side state machine; `RemotePlayer` (also `mp.js`) draws each peer's interpolated ghost.

- **Authority split:** the host runs `EnemyManager`/`WaveManager`/`LootManager`/`DayNight` and owns all damage and `pstate` (per-player hp/armor/down/dead). Clients simulate **only their local player**, broadcast their transform (`xf`, ~every 66 ms), and replay host broadcasts (`esnap` enemy snapshots ~every 80 ms, `pstate`, spawns, loot, world-time). A client's raycast hits a *ghost* enemy; it must claim the hit to the host, which applies damage. Check `hostSim = !mp.active || mp.isHost` before running authoritative logic — and treat **`pstate`** (not the `xf` flags, which are visual-only) as the single source of life-state truth. In MP, `Player.hurt()` routes to `mp.claimPlayerHit` and does *not* change local hp directly.
- **Message envelope:** `{ t: type, d: data, _r?: true }`. `_r` means the host relays it to the other clients.
- **Downed/revive:** 3-down rule — two survivable knockdowns with a **30 s** host-ticked bleed-out bar; revive is **click-based CPR** — a teammate aims at the downed ally, presses **E**, then left-clicks ~**30** times (`DOWN_SECONDS`/`REVIVE_CLICKS` in `mp.js`). Late joiners get a full world sync from the host.
- **Wipe → lobby:** when the whole squad is down/dead, co-op shows **no death screen** — it returns everyone to the lobby (the room stays open, players un-readied). Permanently-dead players **spectate** live teammates (Q/E to cycle).
- **Other host-synced state:** day/night cycle (`sendWorldTime`), the finite-ammo rooftop .50-cal (250 rounds, synced belt/brass), and kill cash (`KILL_CASH`). The lobby has a live **connection-check** diagnostics panel (ICE/TURN/relay state) and **NET: WEBRTC↔LAN** / **RELAY: AUTO↔FORCE** toggles.
- Solo play runs the same code with multiplayer dormant — most logic is gated on `mp.active`.

### Voxel modeling

All voxel assets (weapons, enemies, props) are **procedurally built**, not loaded files. The pattern: one `MeshBuilder` per asset accumulates `.box(w,h,d,x,y,z,color,opts)` / `.geo(threeGeometry,…)` calls, then `.build()` returns a single merged `BufferGeometry` paired with `voxelMaterial()` (vertex-colored `MeshLambertMaterial`).

- **Weapons:** the `WEAPONS` registry (top of `weapons.js`) defines every gun/melee by stats + a `.shape` key. `buildViewmodel(def)` dispatches on `def.shape` — **a shape with no matching case renders invisible.** Enemies use `buildEngendro()` / `buildTolo()` (in `enemies.js`).
- **Layered-shading aesthetic:** each surface uses a 5-tone palette (Hi/Mid/Lo/Slot/Bright) — thin lit top strip + dark bottom shadow + proud recess boxes. A model built with only 2–3 tones reads as a featureless blob. **`/.claude/skills/voxel-weapon-modeling/SKILL.md` is the canonical guide** — read it before building or upgrading any voxel model (also surfaced as the `voxel-weapon-modeling` skill).
- **Coordinate conventions:** world/tank space forward = **+Z**, up = +Y, right = +X (~1 unit ≈ 1 m). First-person viewmodel space: muzzle = **−Z**, stock/grip = +Z. `THREE.CylinderGeometry` defaults to a +Y axis.
- **Tank model files:** the **live** in-game T-90M «MITRI» (boss + captured tank + admin viewer) is built by **`bosstank.js`** (`buildTank`/`buildTankWreck`/`animateTank`/`tankGroundFX` + the shared `_tankWrecks` registry) — *that's* the file to edit for gameplay. **Now orphaned / dev-only:** `tankmodel.js` (scratch voxel T-90M; still the source of `buildMitri`, imported only by `tankglb.js`) and `tankglb.js` (loads the realistic `assets/modely/tank_t-90_custom_design.glb` and **auto-rigs** its ~326 unnamed meshes by bounding box; `preloadTank()` must be awaited before its `buildTank()`) — neither is imported by the running game anymore, only by dev viewers (`tank-viewer.html`, `glb-*.html`). `t34model.js` (scratch T-34) and `su34model.js` (Su-34 flyby jet) are separate one-off models. All tank rigs share a `userData` contract (`turret`, `gunMantlet`, `recoilNode`, `muzzle`, `hatch`, `mitri`, road wheels, headlamps, …).

### Combat & economy data

- **Registries** (now in their domain modules, not `game.js`): `WEAPONS`/`WEAPON_ORDER` (`weapons.js`), `ITEM_DEFS` consumables/throwables/materials/callables (`loot.js`), `ENEMY_TYPES` (`enemies.js`), `WAVE_TYPES` + `BOSS_ROSTER = ['boss','tank']` + `MINIBOSS_NAMES` (`tuning.js`), `GADGETS` + `ARMORY_SLOTS` typed loadout primary/secondary/melee/gadget1/gadget2 (`inventory.js`).
- **Bosses** spawn on boss waves. **Tolo** is HP-phase-gated and immune *except* its belly bullseye while charging. The **T-90M «MITRI»** has dual health pools — explosives wreck the armor; killing the exposed commander captures it as a drivable tank (with a thermal gunner sight).
- **Ammo asymmetry:** ground ammo boxes refill **only the gun currently in hand**, never backpack reserves — picking what you hold matters.
- **Persistence:** `game.meta` is stored in `localStorage['engendros_meta']` = `{ bank, unlocked[], loadout{…}, playerId, bestWave, bestNight, bestScore, kills, runs }`. In-run `money` is banked into `meta.bank` once at run-end; you spend the bank only in the lobby Armory. Cold start is **knife-only**. Each player's meta is local — there is no server sync.
- **Cash:** kill payouts are now a flat **`KILL_CASH = 3`** (`economy.js`), attributed by the host to the actual killer in co-op; `KEY_CASH = 60` / `SUPPLY_CASH = 600` survive only for loot-roll / supply-drop cash (score still uses `e.def.reward`).
- **Vestigial systems:** the rarity tiers (CSS `--c-common/rare/epic/legendary`) and the old key→lootbox mechanic are leftovers from before the 2026-05-29 continuous-waves/loadout redesign (`docs/superpowers/specs/2026-05-29-continuous-waves-pregame-loadout-design.md`). Don't build on rarity/keys.

## Conventions & gotchas

- **HUD is DOM, driven imperatively.** All the HUD/overlay markup + CSS design system lives in `index.html`; the `HUD`/`UI` classes hold cached element refs and update via setters (`setHealth`, `setMoney`, …) and `classList` toggles. There is no batching — every change writes the DOM immediately.
- **`Player.update(dt)` runs every frame even when mounted** (.50-cal / tank) — it's the fallback camera source; the mount's own control overrides input/camera afterward.
- **No async in the game loop.** Updates are synchronous; only asset/network loading is async (fire-and-forget with fallbacks).
- **Enemies are pooled** — `e.alive = false` queues reuse, it doesn't free the object.
- **Co-op authority is a footgun.** Any new authoritative logic (enemies, waves, damage, loot rolls, day/night) must sit behind `hostSim = !mp.active || mp.isHost`, or it double-runs on every client. `pstate` is the only life-state authority; the per-frame `xf` transform flags (down/dead/waiting) are a visual fallback, not gameplay truth. Two distinct freeze concepts: `mp.frozen` (you're down/dead/waiting — full camera takeover) vs `mpMenuOpen` (`controlsPaused` — menu open while the sim runs).
- **Docs** live in `docs/superpowers/` (specs + plans, e.g. the tank-MITRI boss design/plan) and `docs/su34-jetworks-rebuild.md`; `README.md` is the co-op operator manual (WebRTC + Hamachi/LAN setup, authority model, the `scripts/lan-server.js` relay). The repo root is also littered with gitignored QA screenshots (`shot-*`, `tank-*`, etc.) and standalone dev viewers (`*.html`) — these are not part of the game.
