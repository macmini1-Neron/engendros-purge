# Sound Design: Procedural Music & Ambience + Diegetic Radio Building — Design

**Branch:** `feat/sound-design` · **Date:** 2026-06-02 · **Status:** Design (approved, pre-plan)

## Overview

Two related-but-independent sound features on one branch, plus one rename, plus one
deferred follow-up:

1. **Radio building (📻)** — a placeable, hero-quality voxel model of a Soviet field
   radio that **streams real internet radio stations**. Diegetic (a world object), with
   distance-based volume and animated controls. *Built first* (most visually "wow").
2. **Procedural music & ambience** — replace today's static drone with an
   intensity-driven, layered procedural score (menu/lobby, calm, combat, boss) plus a
   procedural ambient bed (wind, day vs night, distant battle). Fully synthesized — no
   recorded assets, consistent with the rest of `audio.js`.
3. **Rename** — the current handheld "📻 Radio" item (which calls in the Su-24 supply
   drop) becomes **"Vysílačka / Airdrop Transmitter"**, freeing the `radio` namespace for
   the new building.
4. **Deferred:** selling the radio in the lobby Armory **misc** category — wired in *after*
   the `fix/shop` branch merges (mirrors the deferred Signal-Flare shop item).

### Goals

- A genuinely dynamic soundtrack that reacts to the run, all procedural.
- A standout diegetic prop: place a Soviet radio, it plays real stations, looks beautiful,
  reacts to tuning. Works in co-op (full sync from day one).

### Non-goals

- No recorded music tracks (option-1 procedural was chosen for the score).
- No shop wiring this branch (deferred to post-`fix/shop`).
- No new music-theory authoring tools — the score is parametric, hand-tuned in code.

---

## Part 1 — Radio building (build first)

### 1.1 Model (hero asset)

Reference: user-supplied photos of a Soviet field radio (olive box, central meter, knurled
tuning knobs, a band toggle, a red knob on the right side, Cyrillic panel labels: НАСТР.
ПРИЕМ, ОБР. СВЯЗЬ, НАКАЛ, ДИАПАЗ., ПРИЕМ↔ПЕРЕД, НАСТР. ПЕРЕД, ТЕЛ., КП).

Quality bar is explicitly high — this is a centerpiece. Use the **`voxel-weapon-modeling`
skill** for the layered-shading body, but go **hybrid** for legibility:

- **Body:** voxel/box geometry via `MeshBuilder` with full 5-tone layered shading (olive
  hi/mid/lo, dark recesses, screws, edge highlights, rounded corners, four rubber feet).
- **Faceplate detail:** a **canvas-generated texture** mapped onto the front panel for the
  Cyrillic labels, gauge dial faces, and tuning-scale numbers. The user explicitly accepts
  larger/"pixelier" textures as long as they're legible and clean. This is a deliberate,
  scoped exception to the pure-vertex-color convention (the codebase has no texture
  pipeline today) — justified because fine Cyrillic text cannot be voxelized legibly.
  Generate with an offscreen `<canvas>` → `THREE.CanvasTexture` (nearest filtering for the
  crisp pixel look that matches the engine's low-res aesthetic).
- **Moving parts (real 3D sub-meshes, named in `userData` so animation can find them):**
  - `meter` needle — a thin needle that swings/bounces (idle micro-jitter; larger swing on
    tune).
  - two `tuneKnob` dials (РИЗ / ПЕРЕД) — rotate when changing station.
  - `bandToggle` (ДИАПАЗ. lever) — flips on power on/off.
  - `redKnob` — the red side knob; rotates a notch per station change.
  - optional small green "on" indicator lamp (emissive-ish bright voxel) lit only when on.

The builder lives in a new function, e.g. `buildFieldRadio()` in **`props.js`** (where
Flopo / supply crate / flare builders already live), returning a `THREE.Group` with the
`userData` animation contract. A small `animateFieldRadio(group, state, dt)` helper drives
the needle jitter + knob rotations from the radio's `{ on, station }` state.

> When implementing the model, **invoke the `voxel-weapon-modeling` skill first** and do
> the live render-verify loop (admin asset viewer + screenshots) until it reads clearly.
> Add it to the admin AssetViewer list (`admin.js`) for iteration.

### 1.2 Placement (like a structure)

Reuse `BuildManager` (`world.js`) + a new entry in `STRUCT_DEFS` (`economy.js`):

```
radio: { hp: 200, w: 1.2, h: 0.8, d: 0.9, hard: false, prop: true, audio: true,
         rotStep: Math.PI / 12, label: 'Radio', max: 4 }
```

- **`hard: false`** → not added to `World.boxes`, so **enemies completely ignore it** (they
  only attack/crush structures that block them, and only `hard` ones live in `boxes`). It
  is not a fortification; it's a prop. No barbed-wire-style hazard.
- **`prop: true`** marks it as a non-fortification placeable so `BuildManager` skips the
  collision-wall / hazard logic and just instantiates the model + an audio source.
- **`max: 4`** soft per-kind cap (cheap to enforce in `place()`), independent of the global
  `STRUCT_CAP = 44`.
- Placement flow mirrors sandbags: hold the radio (a held "material" kind), ghost preview
  via `BuildManager.ghost`, rotate with the existing rotate key, click to place. The ghost
  uses the field-radio geometry.
- A placed radio is a `structures[]` entry with the existing `{ id, kind, pos, yaw }` plus
  radio fields `{ on: false, station: 0, audio: <HTMLAudioElement|null> }`.

**Destruction / removal:** Since enemies ignore it, it persists. Player can remove it (the
existing structure-removal affordance, if any) — confirm during impl; otherwise it simply
stays for the run. It has nominal `hp` only so the shared structure plumbing has a value;
nothing damages it by default.

### 1.3 Audio / streaming

**Playback path — plain `<audio>`, NOT routed through Web Audio:**

- Each *active* radio owns one `HTMLAudioElement` with `src` = the current station's direct
  stream URL (`crossOrigin` left unset). Cross-origin streams **play fine** through a media
  element. We deliberately do **not** call `createMediaElementSource` on it: routing a
  non-CORS cross-origin stream through Web Audio outputs silence (the spec taints it). So
  the radio bypasses the `AudioManager` graph entirely for the stream itself.
- **Distance volume:** each frame (or on a throttled timer), for every active radio compute
  `dist` from the player; set `el.volume = clamp(attenuation(dist)) * musicVol * (muted?0:1)`
  where `attenuation` is 1 inside an inner radius and falls to 0 by an outer radius
  (e.g. inner 3 m, outer 22 m). This gives "louder as you approach" without needing CORS or
  a PannerNode. No stereo pan / no low-pass-when-far (those need Web Audio routing) — accepted.
- **Volume coupling:** the radio is "music", so it scales with the **music volume slider**
  (`AudioManager.musicVolume`) and mutes with global mute. Expose a small read path
  (`audio.musicVolume`, `audio.muted`) for the radio updater.
- **Autoplay:** `el.play()` is always triggered by a user gesture (pressing **E** to turn
  on), so it is allowed.
- **Failure handling:** on `error`/stalled stream, fail gracefully — show a HUD toast
  ("Radio: station offline"), advance to next station or turn off; never throw in the loop.

**Music ducking:** while the local player is within the audible radius of *any* `on` radio,
**duck the procedural `MusicDirector`** (lerp its master gain down, e.g. to ~20%) so the
score and the real station don't fight. Restore when out of range / radio off.

### 1.4 Interaction (exact scheme)

- **Place** → radio is **OFF** (silent).
- Aim at a radio (raycast / proximity-and-look) and press **E** → **toggle on**.
- While on and targeted, **`←` / `→`** (ArrowLeft/ArrowRight) → previous/next station;
  needle + knobs + red knob animate; brief HUD toast with station name.
- Press **E** again → **OFF**.
- Targeting prompt: reuse the existing "look at interactable → prompt" HUD pattern
  (mirrors the supply-drop / mounted-gun prompts). Show e.g. "E: zapnout rádio" / when on:
  "←/→ stanice · E vypnout".

Input wiring: handle in the playing-state input dispatch (`game.js` / `inventory.js` held
context or a dedicated interactable check). Reuse `Input` edge detection (`pressed`).

### 1.5 Stations (configurable constant)

A `RADIO_STATIONS` array (in `audio.js` or a small `radio.js` leaf) of
`{ name, url, genre }`. Direct stream URLs (icecast mp3/aac). Initial set covers the
user's ask — Czech mainstream + US pop "bangers" + US country + mainstream mix:

- **Evropa 2** (CZ mainstream pop)
- **181.fm – Power 181** (US Top 40 / pop "bangers")
- **181.fm – Highway 181** (US country)
- **181.fm – The Mix / Mainstream** (US mainstream)
- (room for 1–2 more; user can swap any URL freely)

> Stream URLs drift over time — **verify each returns audio during implementation** (quick
> fetch / in-browser `<audio>` test) and keep a known-good fallback per station. Treat the
> list as data the user edits later.

### 1.6 Co-op (full sync from day one)

Host-authoritative, reusing the structure path:

- **Placement** rides the existing `struct` / `structreq` / `struct` (late-join) messages —
  `kind: 'radio'` flows through unchanged; clients build the model on receipt. A placed
  radio starts **off** everywhere (no extra placement fields).
- **State changes** (on/off, station) use a **new message `radioset`**
  `{ id, on, station }`. Client interactions are requests to the host (or host-relayed):
  the host applies + broadcasts `radioset`; every client (and host) starts/stops/retunes
  its **own local `<audio>`** for that radio id. Live streams keep all clients roughly in
  sync without sample-level coordination.
- **Late-join:** after the existing structure replay, the host also sends a `radioset` for
  each currently-on radio so newcomers tune in.
- Gate all authority behind `hostSim = !mp.active || mp.isHost`; `radioset` is host-emitted
  (or host-validated then relayed), never client-trusted.

---

## Part 2 — Procedural music & ambience

All in `audio.js` (or a `music.js` leaf imported by `AudioManager`). Replaces
`startMusic()` / `stopMusic()` (the single 900 ms sine arpeggio).

### 2.1 MusicDirector — intensity-driven layered engine

- A single **intensity** scalar `0..1` drives which layers are audible and how loud. The
  game updates it each frame (smoothed) from gameplay signals:
  `intensity ≈ f(currentWave, aliveEnemyCount, bossActive, playerDanger)`.
- **Layers** (each a small synth voice or loop, faded in/out by intensity thresholds):
  1. `pad/drone` — always on (the atmospheric floor).
  2. `bass pulse` — from low intensity up (steady heartbeat pulse).
  3. `arp/rhythm` — mid intensity (movement/tension).
  4. `percussion` — high intensity (dense combat).
  5. `boss brass` — only when `bossActive` (WW2-ish brass/timpani motif, reuses the
     `radioCall()` brass/`note()`/`drum()` primitives).
- Implemented as scheduled Web Audio voices on a musical clock (a tempo + step sequencer
  driven by `setTimeout`/look-ahead, like the existing `startMusic` tick but multi-voice).
  Key/scale stays in a dark minor palette consistent with the current drone.

### 2.2 States

- **menu / lobby:** calm — pad + sparse arp only, slow tempo, no percussion. Distinct,
  lower-energy tuning from combat. Started on entering `menu`/`lobby` state.
- **in-run, between waves:** low intensity (calm-but-tense).
- **combat (wave active):** intensity ramps with wave number + alive count.
- **boss wave:** `bossActive` → boss-brass layer + raised floor; resolves back on boss death.
- **wave clear / game over:** keep existing `waveClear()` / `gameOver()` stingers; ensure
  they sit over (or briefly duck) the director.

### 2.3 Ambient bed (under the music)

- **Wind:** looped filtered noise (low-pass, slowly modulated cutoff/gain) for the dust2
  arena openness.
- **Day vs night:** read the `DayNight` cycle (`world.js`) — daytime ambient is brighter/
  sparser; night is lower, with occasional distant booms/howls. Cross-fade on the cycle.
- **Distant battle:** sparse, randomized low-frequency rumbles / faint far gunfire, denser
  at higher intensity. Cheap (a few scheduled bursts), never busy.
- Ambient runs whenever in `playing` (and optionally a light bed in menu).

### 2.4 Integration points

- `game.js` — own a `MusicDirector`; feed intensity/state from the loop and on
  state transitions (replace the `startMusic()`/`stopMusic()` calls at the play/death/
  gameover sites). Hook menu/lobby states too.
- `waves.js` — expose current wave / boss-active to the intensity calc.
- `enemies.js` / `EnemyManager` — alive count (already tracked) for intensity.
- `world.js` `DayNight` — day/night phase for the ambient bed.
- `ui.js` Settings — music volume already routes to `musicGain`; ensure the director's
  voices sit on `musicGain` so the slider governs them (the diegetic radio is separate,
  see 1.3).

---

## Part 3 — Rename the handheld supply-drop item

Free the `radio` name for the building. Rename the **callable** item from `radio` →
**`airbeacon`** (display "Vysílačka" / "Airdrop Transmitter", icon 📡). The Su-24 supply
drop behavior and `audio.radioCall()` are unchanged — only identifiers/labels move.

Touch points (all current `'radio'` references):

| File:line | Today | After |
|---|---|---|
| `loot.js:21` | `radio: { name:'Radio', class:'callable', icon:'📻', mesh:'radio' }` | `airbeacon: { name:'Vysílačka', class:'callable', icon:'📡', mesh:'airbeacon' }` |
| `loot.js:97` | `if (kind === 'radio')` (Falcon-III mesh) | `if (kind === 'airbeacon')` |
| `loot.js:352` | `spawnNetPickup('radio', …)` | `spawnNetPickup('airbeacon', …)` |
| `inventory.js:251` | `if (c.kind === 'radio') this._useRadio(…)` | `if (c.kind === 'airbeacon') this._useRadio(…)` |
| `inventory.js:353` | `radio: () => loot._pickupMesh('radio')` | `airbeacon: () => loot._pickupMesh('airbeacon')` |
| `admin.js:125` | `'Radio (Falcon III)' … _pickupMesh('radio')` | `'Vysílačka (Falcon III)' … _pickupMesh('airbeacon')` |

The Falcon-III handheld voxel mesh keeps its look; only its key changes. **Co-op note:**
the `kind` string travels in `spawnNetPickup` / pickup sync — both peers must run the same
build for the rename to match (normal for any code change; flag in the PR).

The **new** building takes the fresh `radio` kind in `STRUCT_DEFS` + its own field-radio
mesh — no collision with the renamed handheld.

---

## Deferred — shop (misc) wiring

After `fix/shop` merges: add the Radio to the lobby Armory **misc** category as a
buyable that grants the placeable radio "material". Mirrors the deferred Signal-Flare
plan. Out of scope for this branch beyond leaving the placement path ready to be fed by a
purchase. (Until then, the radio is reachable for testing via the build/admin path.)

---

## Co-op authority summary

- Radio **placement**: host-authoritative via existing `struct` path (`hard:false` prop).
- Radio **on/off/station**: new `radioset` message, host-emitted/validated; each client
  drives its own `<audio>`. Late-join replays on-state.
- Music/ambient `MusicDirector`: **local/cosmetic** — runs per-client off shared signals
  (wave, day/night, boss), no authority needed, but intensity inputs (wave/boss) already
  arrive via existing sync, so peers stay roughly aligned.

## Risks & mitigations

- **Stream URL rot / CORS-for-Web-Audio**: solved by plain-`<audio>` playback (no CORS
  needed) + distance volume; verify URLs at impl, fallbacks per station, graceful failure.
- **Texture in a textureless engine**: scoped to the radio faceplate via `CanvasTexture`
  with nearest filtering; does not change the engine's material model elsewhere.
- **Perf**: ≤4 radios, one `<audio>` each + a cheap per-frame volume calc; director is a
  handful of voices. Negligible.
- **Co-op desync of station audio**: acceptable — live streams aren't sample-synced; only
  the *which station + on/off* is synced, which is the meaningful shared state.

## Implementation sequencing (radio first, per decision)

1. **Field-radio model** (`props.js` `buildFieldRadio` + `animateFieldRadio`, admin viewer
   entry) — iterate to "ultra pretty" with the voxel skill + render-verify.
2. **Placement** — `STRUCT_DEFS.radio` (`hard:false` prop) + `BuildManager` prop branch +
   ghost.
3. **Streaming + interaction** — `RADIO_STATIONS`, per-radio `<audio>`, distance volume,
   E/←/→ control, HUD prompts, music ducking.
4. **Co-op** — `radioset` message, host validation/relay, late-join on-state replay; 2-PC test.
5. **Rename** handheld → `airbeacon`.
6. **MusicDirector** (layers, states, intensity) replacing `startMusic`/`stopMusic`.
7. **Ambient bed** (wind, day/night, distant battle).
8. **Deferred:** shop misc entry (after `fix/shop`).

## Verification (manual / in-browser, per project)

- Model: admin asset viewer — Cyrillic legible, needle/knobs/red-knob animate, layered
  shading reads.
- Radio: place via build/admin; E toggles, ←/→ retunes, volume rises as you approach,
  ducks the score, fails gracefully on a dead URL.
- Co-op: 2 PCs — place on host, client sees + hears it; toggle/retune syncs; late-joiner
  tunes in.
- Music: drive `GAME.waves.startWave(n)` and a boss wave; confirm intensity ramps, boss
  layer enters, day/night ambient cross-fades.
- Rename: handheld now reads "Vysílačka", still calls the Su-24 drop; co-op pickup works.

## Cache-bust ritual (on ship)

Per CLAUDE.md: bump `?v=N` on `index.html`'s entry script **and** `GAME_BUILD` in
`game.js` before the PR. (No per-module query params.)
