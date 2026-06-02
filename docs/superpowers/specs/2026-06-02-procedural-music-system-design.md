# Procedural Adaptive Music System — Design

- **Date:** 2026-06-02
- **Status:** Design (approved in brainstorming; pending spec review)
- **Branch:** `feat/procedural-music`
- **Spec owner:** Claude + macmini1

## 1. Goal

ENGENDROS PURGE currently has exactly **one** piece of background music: `AudioManager.startMusic()` — a primitive single-oscillator sine drone walking a low A-minor scale every 900 ms. There is no boss music, no shop music, no mood differentiation, no adaptivity.

Build a **procedural, adaptive, multi-scene music system** so the score *breathes* with the game: calm between waves, frantic at a wave's peak, epic on bosses, absurd lounge muzak in the shop, solemn on death. All synthesized in Web Audio — **no committed audio files** — matching the project's procedural-everything philosophy.

### Locked decisions (from brainstorming)

1. **Procedural** Web Audio synthesis (not real audio files; the diegetic Radio already covers "real streamed audio").
2. **Adaptive** — full scene set **plus** dynamic intensity (vertical remixing) that scales with threat.
3. **Mix of genres per context** — dread ambient during waves, Soviet/WW2 epic on bosses, lounge muzak in the shop, synthwave in menus.
4. **Engine architecture: Hybrid (C)** — sustained layered stems (pads/drones) + a shared look-ahead note scheduler (bass/arp/brass/percussion). Intensity drives both layer gains and which patterns fire.

## 2. Hard constraint — DO NOT BREAK THE RADIO

The diegetic field-radio prop (`src/radio.js` + `BuildManager` radio code in `src/world.js`) must keep working untouched. Verified facts:

- The radio streams external stations through a **plain `HTMLAudioElement`** (`s.audio`), **outside** the Web Audio graph. Its volume is set per-frame by distance (`s.audio.volume = att * musicVolume * (muted?0:1)`). It is a completely separate audio path from the Web Audio nodes.
- The radio **ducks the procedural score** when the player is near a playing radio: `BuildManager._updateRadios()` calls `audio.setMusicDuck(1 - nearest * 0.85)`. `setMusicDuck(d)` stores `_musicDuck` and calls `_applyMusicGain()`, which sets `musicGain.gain = musicVolume * _musicDuck`.

**Therefore — the single rule that protects the radio:**

> `MusicDirector` mixes its scenes/intensity/crossfades through **its own internal gain nodes, placed downstream of `audio.musicGain`**. It **must never write to `musicGain.gain`** — that node stays exclusively owned by `_applyMusicGain()` (volume × duck).

Because the new music flows *into* `musicGain`, the existing duck attenuates it automatically — exactly the intended behavior (near a playing radio, the score ducks so the station is audible). No radio code changes. `radio.js`, the radio sync messages (`radioreq`/`radioset`), `radioAttenuation`, station list, and ghost-frequency easter egg are all out of scope and untouched.

Secondary safety note: `setMusicVolume(v)` currently sets `musicGain.gain.value = v` directly, bypassing the duck for one frame. We will route it through `_applyMusicGain()` instead so volume changes preserve any active duck. This is a tiny correctness fix, fully compatible with the radio.

## 3. Architecture

### 3.1 New module — `src/music.js` → `MusicDirector`

A single self-contained class in its own module (keeps `audio.js` for SFX). It is **owned by `AudioManager`** so it shares the `AudioContext`, the `musicGain` bus, the music-volume slider, and the mute master.

Signal flow:

```
voices (osc/noise, created per note)
  → per-layer gain (intensity remix, owned by MusicDirector)
  → MusicDirector master gain (scene crossfade, owned by MusicDirector)
  → audio.musicGain   ← gain = musicVolume × duck  (owned by _applyMusicGain; radio duck lives here)
  → audio.master      ← gain = muted ? 0 : 1
  → ctx.destination
```

Public API:

- `constructor(audio)` — keeps a ref to `AudioManager`; reads `audio.ctx`; creates its own master gain and connects it to `audio.musicGain`.
- `setScene(name, { fade = 1.2, variant } = {})` — crossfade from the current scene to a target scene. No-op if already on it (a changed `variant`, e.g. `'mitri'`/`'tolo'` on the `boss` scene, swaps flavor without re-fading).
- `setIntensity(x)` — target 0..1 threat level for the active scene (smoothed internally).
- `setStress(x)` — 0..1 low-HP overlay amount (heartbeat + anxious shimmer, ducks the scene slightly).
- `sting(name, size)` — fire a one-shot cue (e.g. `'victory'`, size `'small'|'big'`) over the current scene.
- `update(dt)` — called once per frame from the game loop; advances smoothing only. (Note scheduling runs on its own clock — see 3.2.)
- `stop({ fade } = {})` — fade out and halt the scheduler (e.g. entering admin/asset viewer).

`AudioManager` exposes thin pass-throughs so existing call sites and the console keep working: `audio.music` is the instance; `audio.startMusic()` becomes a shim for `audio.music.setScene('gameplay')` and `audio.stopMusic()` for `audio.music.stop()`.

### 3.2 Scheduler — dt-independent look-ahead

The melodic/rhythmic parts use the canonical Web Audio "two clocks" pattern, **not** the frame `dt`:

- A `setTimeout`-driven loop (~25 ms) looks ahead ~100 ms and schedules any note events whose start time falls inside the window, using absolute `ctx.currentTime`.
- This decouples musical timing from the variable-timestep render loop, so tempo never drifts during frame stutter (the game loop clamps `dt` to 50 ms, which would otherwise wreck timing).
- `MusicDirector.update(dt)` only advances gain smoothing (intensity/stress ramps), not note timing.

### 3.3 Voice palette (procedural synth helpers)

Small reusable generators inside `music.js` (each guards `if (!ctx)`), tuned per scene via params:

- **pad / drone** — 2–3 detuned saws → lowpass, long attack/release; sustained, gain-crossfaded (the "stem" layer).
- **sub** — sine on the root, short-ish, for weight.
- **pluck / arp** — triangle or filtered saw with fast decay.
- **brass stab** — detuned saws → lowpass with a mid attack (reuse the timbre already in `radioCall`'s `note()`).
- **bell / vibraphone** — sine/triangle partials with bell-like decay (for shop + menu accents + bell tolls).
- **percussion** — from filtered noise + pitched sine: kick (sine pitch-drop), snare (noise band + tone), hat (highpass noise), tom (sine drop), timpani (the `radioCall` `drum()` shape), cymbal swell (noise crescendo).
- **heartbeat** — soft sine double-thump for the stress overlay.

### 3.4 Scene registry (data model)

Each scene is a plain data object the engine interprets — easy to tweak/add:

```
{
  name, key, scale, bpm,
  chords: [...],                 // progression (degrees or freqs)
  layers: [                      // each: { id, voice, pattern, gain, fadeIn, minIntensity, maxIntensity }
    ...                          // a layer's gain = its base × ramp(intensity within [min,max])
  ],
  swing, palette                 // timbre tweaks
}
```

Intensity does **vertical remixing**: each layer fades in across its `[minIntensity, maxIntensity]` window, so raising intensity adds parts (perc, lead, brass) smoothly rather than cutting between tracks.

## 4. The tracks (scenes)

Eight contexts. Boss ships as one generic theme with **optional** per-boss flavor (a `variant` arg) — the generic theme is the must-have; variants are nice-to-have within the same scene and can land later.

| # | Context (game state / event) | Scene id | Genre / mood | Sketch | Adaptive behavior |
|---|---|---|---|---|---|
| 1 | Menu | `menu` | Synthwave, somber-heroic | A minor, ~70 BPM; warm saw pad Am–F–C–G, sub on root, sparse octave arp, distant brass swell every 8 bars | fixed low intensity (~0.3) |
| 2 | Lobby (co-op) | `lobby` | Warm synth-ambient, anticipation | C minor, ~84 BPM; pad + softly pulsing eighth bass, gentle bell motif, light hat tick | gently pulsing (~0.4) |
| 3 | Gameplay / waves | `gameplay` | Dread/survival → industrial | D-drone, ~120 BPM. **Core adaptive scene.** | **0–0.25** calm: low D drone + sub rumble + sparse heartbeat kick + occasional dissonant ping. **0.25–0.6** building: + quarter-note tom pulse + minor-2nd pad swell + slow root–♭2 bass ostinato. **0.6–1.0** peak: + driving 16th industrial hat/noise + syncopated bass + tense tritone lead stab + snare backbeat |
| 4 | Boss wave (boss alive) | `boss` | Soviet/WW2 epic | E minor, ~100 BPM march; timpani 4-on-floor + fills, brass Em–C–D–B dotted march, low choir-ish drone, snare roll | base intensity high; ramps with `1 − bossHpFrac` (lower boss HP → faster timpani + piccolo-ish lead). **Variants:** `mitri` (tank: mechanical clank perc, heavier/slower brass) · `tolo` (3/4 grotesque waltz + music-box bell melody) |
| 5 | Shop / Armory | `shop` | Lounge / "elevator" muzak | F major swing, ~110 BPM; vibraphone melody over ii–V–I (Gm7–C7–Fmaj7), soft walking upright bass, brushed-hat shuffle, occasional elevator "ding". Deliberately cheery/absurd | fixed low intensity |
| 6 | Wave clear / boss down | `victory` (sting) | Soviet/WW2 fanfare | one-shot ~2–3 s: rising brass G–C–D→G + double timpani + cymbal swell; extends the existing `radioCall` sting | `small` (wave clear) vs `big` (boss down / run survived); overlays, then returns to prior scene |
| 7 | Death / game-over (solo) | `gameover` | Dread → solemn | A minor, ~60 BPM; descending brass Am–E–Dm–Am, low drone, lone bell toll, slow timpani; replaces the 4-note `gameOver()` | static |
| 8 | Low HP (any state) | *overlay* (`setStress`) | Heartbeat + anxious shimmer | not a scene: heartbeat (speeds as HP drops) + high shimmer drone; ducks the active scene ~30% | engages when HP below threshold, releases on heal |

## 5. Intensity & stress model

Computed in `game.js` and pushed to the director; **all client-local, no networking** (music is cosmetic like SFX).

- **Gameplay intensity** (target, then smoothed via `damp` toward it to avoid jitter):
  `intensity = clamp(base + a·nearFrac + b·aliveFrac + waveActiveBonus)`
  where `nearFrac` = enemies within ~radius / cap, `aliveFrac` = alive enemies / soft cap, `waveActiveBonus` applies while a wave is spawning vs. in cooldown. Constants tuned by ear; smoothing time ~1.5 s up, ~3 s down (tension builds fast, releases slow).
- **Boss intensity:** when a boss is alive, `setScene('boss', variant)`; intensity = `1 − bossHpFrac` (clamped to a high floor so it never sounds calm).
- **Stress:** `setStress(clamp((hpThreshold − hp) / hpThreshold))` for low-HP; heartbeat rate scales with it.

## 6. Integration points (`game.js`)

State machine → scene mapping (replaces the current `startMusic`/`stopMusic` calls at the existing call sites):

- `menu` → `setScene('menu')`
- `lobby` → `setScene('lobby')`
- `playing` → `setScene('gameplay')`; each frame in `_updatePlaying`: compute threat → `setIntensity(...)` + `setStress(...)` + `update(dt)`. When a boss is alive → `setScene('boss', variant)`; on its death → `sting('victory','big')` then back to `gameplay`.
- `shop` → `setScene('shop')`
- `dead`/`gameover` → solo: `setScene('gameover')`. Co-op wipe has **no death screen** (returns to lobby) → `setScene('lobby')`.
- `admin` → `stop()`.
- Wave cleared → `sting('victory','small')`.

`MusicDirector` is created lazily in `AudioManager.init()` (after the user-gesture that creates `ctx`). Scene calls before init are safely ignored or queued (guarded by `if (!ctx)`), then `setScene` is (re)issued by the state machine.

## 7. Settings, mute, performance

- **Volume:** music flows through `musicGain` → already driven by the existing settings music slider (`ui.js` → `setMusicVolume`) and the radio duck. No new slider.
- **Mute:** handled by `master` gain (existing). No change.
- **Performance:** one scheduler loop; notes are short-lived oscillators created per event (matching the rest of `audio.js`, which Web Audio GCs after `stop()`); drones are a few long-lived oscillators with gain envelopes; keep simultaneous voices under ~12. No per-frame allocation in the render loop beyond the cheap smoothing math.

## 8. File-by-file changes

- **NEW `src/music.js`** — `MusicDirector` class, voice palette, scheduler, scene registry.
- **`src/audio.js`** — instantiate `this.music = new MusicDirector(this)` in `init()`; turn `startMusic`/`stopMusic` into shims delegating to `music`; route `setMusicVolume` through `_applyMusicGain()`. **Do not touch** `setMusicDuck`/`_applyMusicGain` logic beyond that. Keep `radioCall` etc. as-is.
- **`src/game.js`** — replace `startMusic`/`stopMusic` call sites with `setScene(...)`; add per-frame intensity/stress push in `_updatePlaying`; scene switch on boss alive/dead, wave clear, shop, menu, lobby, dead, admin; fire victory stings.
- **`index.html`** — no change (no per-module versioning; entry `?v=` + `GAME_BUILD` bumped only at ship time per the cache-bust ritual).
- **`src/radio.js`, radio code in `src/world.js`** — **untouched** (hard constraint).

## 9. Testing / verification (manual, in-browser)

No automated tests in this project — verify by playing and via `window.GAME`:

1. `GAME.audio.music.setScene('boss')` / `'shop'` / `'gameplay'` / `'menu'` — each scene audibly distinct.
2. `GAME.audio.music.setIntensity(0)` → `1` — gameplay scene layers fade in (calm → frantic) smoothly, no hard cuts.
3. `GAME.audio.music.setStress(1)` — heartbeat + shimmer engage and duck the scene.
4. **Radio regression:** place/turn on a radio, walk toward it — the procedural score **ducks** as the station gets louder, and **returns** when you walk away. Tune stations (←/→), ghost frequency still reachable. Confirms `setMusicDuck` path intact.
5. Play a real run: ambient breathes across a wave; boss wave swaps to the epic theme; killing the boss fires the victory sting; shop muzak on entering Armory; death theme solo / lobby music on co-op wipe.
6. Music volume slider + mute affect both the score and the radio stream consistently.

## 10. Out of scope / future

- Real/composed audio files; networked music sync (intentionally local-only); per-weapon stingers.
- Per-boss flavor variants beyond the generic boss theme are optional and may land in a follow-up.
- The Radio prop and its streaming are explicitly untouched.
