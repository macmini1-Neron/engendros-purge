# Procedural Adaptive Music System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a procedural, adaptive, multi-scene Web Audio music system (menu / lobby / gameplay / boss / shop / victory / game-over + low-HP overlay) that breathes with threat — without breaking the diegetic Radio.

**Architecture:** A new `src/music.js` `MusicDirector`, owned by `AudioManager`, mixes through **its own gain nodes downstream of `audio.musicGain`** (so the radio's `setMusicDuck` keeps working untouched). Sustained drone layers + a dt-independent look-ahead note scheduler; scenes are data; an `intensity` 0..1 does vertical remixing (layers fade in/out). `game.js` sets the scene at state transitions and pushes per-frame intensity/stress during play.

**Tech Stack:** Vanilla ES modules, Three.js (unrelated here), Web Audio API. No build, no test framework — **verification is manual / in-browser** via `window.GAME`.

---

## Spec

`docs/superpowers/specs/2026-06-02-procedural-music-system-design.md`

## Hard constraint (repeated — do not regress)

`MusicDirector` **never writes to `audio.musicGain.gain`**. That node is owned solely by `AudioManager._applyMusicGain()` (= `musicVolume × _musicDuck`). The radio (`src/radio.js`, radio code in `src/world.js`) is **out of scope and untouched**. Every radio regression test below must pass.

## File structure

- **Create `src/music.js`** — `MusicDirector` class: gain graph, voice palette, look-ahead scheduler, scene registry, intensity/stress/sting logic. Single responsibility: produce the procedural score.
- **Modify `src/audio.js`** — own a `MusicDirector` (`this.music`) created in `init()`; route `setMusicVolume` through `_applyMusicGain`; make `startMusic`/`stopMusic` thin shims. No other changes; `setMusicDuck`/`_applyMusicGain`/`radioCall` stay as-is.
- **Modify `src/game.js`** — first-gesture audio prime; scene switch at state transitions; per-frame intensity/stress + boss-diff/victory sting in `_updatePlaying`.
- **Modify `src/inventory.js`** — one line in `Shop.open()` to switch to the `shop` scene.
- **`index.html`** — at SHIP time only, bump entry `?v=` and `GAME_BUILD` (cache-bust ritual). Not per task.

## VERIFY recipe (used by every task)

1. Ensure a static server runs: `python3 -m http.server 8000` (from repo root).
2. Open `http://localhost:8000/?cb=<any-fresh-number>` (forces fresh modules locally).
3. Open DevTools Console — it must show **0 errors** after load.
4. **Unlock audio:** click once anywhere on the page (browsers require a gesture), then in the console run `GAME.audio.init()`.
5. Run the task's listed `GAME.*` commands and **listen**.

> Audio cannot start before a user gesture — that is expected, not a bug.

---

## Task 1: Scaffold `MusicDirector` + wire into `AudioManager` (silent, safety-first)

Goal: the object exists, connects below `musicGain`, no errors, radio duck untouched. No music yet.

**Files:**
- Create: `src/music.js`
- Modify: `src/audio.js` (constructor field, `init()`, `setMusicVolume`, `startMusic`/`stopMusic`)

- [ ] **Step 1: Create `src/music.js` with the skeleton**

```js
// music.js — procedural adaptive score. Owned by AudioManager; mixes through its
// OWN gain nodes placed downstream of audio.musicGain, so the radio's setMusicDuck
// (which owns musicGain.gain) keeps working untouched. NEVER write to musicGain.gain here.
export class MusicDirector {
  constructor(audio) {
    this.audio = audio;
    this.ctx = audio.ctx;
    // own master → musicGain (→ master → destination). musicGain.gain stays owned by AudioManager.
    this.out = this.ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(audio.musicGain);

    this.sceneName = null;     // current scene id
    this.sceneBus = null;      // crossfade gain node for the active scene
    this.drones = [];          // [{ def, handle }] sustained layers of the active scene
    this.scene = null;         // active scene def

    this.intensity = 0; this._intTarget = 0;
    this.stress = 0; this._stressTarget = 0;

    this._sched = null;        // setTimeout handle for the look-ahead scheduler
    this._nextNoteTime = 0;    // absolute ctx time of the next 16th step
    this._bar = 0; this._step = 0;
    this._pending = null;      // scene requested before ctx/gesture was ready
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  setScene(name /*, opts */) { this._pending = name; }   // real impl in Task 3
  setIntensity(x) { this._intTarget = Math.max(0, Math.min(1, x)); }
  setStress(x) { this._stressTarget = Math.max(0, Math.min(1, x)); }
  sting(/* name, size */) {}                              // real impl in Task 8
  update(/* dt */) {}                                    // real impl in Task 3
  stop(/* opts */) {}                                    // real impl in Task 3
}
```

- [ ] **Step 2: Add the `music` field to `AudioManager` constructor**

In `src/audio.js`, in `constructor()`, after the line `this._started = false;` (currently line 13) add:

```js
    this.music = null; // MusicDirector, created in init() once ctx exists
```

- [ ] **Step 3: Import + create the director in `init()`**

At the very top of `src/audio.js` (line 1, before the existing comment) add:

```js
import { MusicDirector } from './music.js';
```

In `init()`, the existing tail is:

```js
    this._initCrewLine();
    this._primeM2Samples();
  }
```

Change it to:

```js
    this._initCrewLine();
    this._primeM2Samples();
    if (!this.music) this.music = new MusicDirector(this);
    if (this._pendingScene) { this.music.setScene(this._pendingScene); this._pendingScene = null; }
  }
```

And add the pending-scene field in the constructor right after the `this.music = null;` line from Step 2:

```js
    this._pendingScene = null; // scene requested before init() (no ctx yet)
```

- [ ] **Step 4: Route `setMusicVolume` through `_applyMusicGain` (preserves duck)**

In `src/audio.js`, replace the current line:

```js
  setMusicVolume(v) { this.musicVolume = v; if (this.musicGain) this.musicGain.gain.value = v; }
```

with:

```js
  setMusicVolume(v) { this.musicVolume = v; this._applyMusicGain(); }
```

- [ ] **Step 5: Make `startMusic`/`stopMusic` thin shims**

In `src/audio.js`, replace the entire `startMusic() { ... }` method AND the `stopMusic() { ... }` method (the block from `// ---- ambient tension music...` through the end of `stopMusic`) with:

```js
  // Legacy shims — the procedural score now lives in MusicDirector (music.js).
  // Kept so old call sites + console keep working. Scene selection is done by game.js.
  startMusic() { if (this.music) this.music.setScene('gameplay'); else this._pendingScene = 'gameplay'; }
  stopMusic() { if (this.music) this.music.stop(); }
```

- [ ] **Step 6: VERIFY (recipe above)**

Run in console after `GAME.audio.init()`:

```js
GAME.audio.music                       // → MusicDirector instance (not null)
GAME.audio.music.out.numberOfOutputs   // → 1 (connected)
GAME.audio.setMusicVolume(0.3); GAME.audio.setMusicVolume(0.5)  // no error
```

Radio regression: in a run, place a radio, turn it on (E), walk toward/away — confirm the `_musicDuck` still updates: `GAME.world && GAME.world` … simplest check: `GAME.audio._musicDuck` changes between ~1 (far) and ~0.15 (close). Console must stay error-free.

Expected: object present, 0 errors, radio duck values still move. (No audible music yet — correct.)

- [ ] **Step 7: Commit**

```bash
git add src/music.js src/audio.js
git commit -m "feat(music): scaffold MusicDirector + wire into AudioManager (silent)"
```

---

## Task 2: Voice palette (procedural synth helpers)

Goal: reusable note/drone generators, each schedules into a destination bus at an absolute `when` time. Test each by ear.

**Files:**
- Modify: `src/music.js` (add methods to `MusicDirector`)

- [ ] **Step 1: Add a noise-buffer helper + percussive/melodic voices**

Add these methods inside the `MusicDirector` class (after `get t()`):

```js
  _noise(dur) {
    const n = Math.floor(this.ctx.sampleRate * Math.max(0.01, dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // one melodic note: detuned-ish single osc with attack/decay env, into `bus` at `when`
  note(bus, when, freq, dur, vol, type = 'triangle') {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, when);
    o.connect(g); g.connect(bus);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.start(when); o.stop(when + dur + 0.05);
  }

  // warm brass stab: two detuned saws → lowpass (same timbre family as radioCall.note)
  brass(bus, when, freq, dur, vol) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), g = this.ctx.createGain(), lp = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.setValueAtTime(freq, when); o2.frequency.setValueAtTime(freq * 1.007, when);
    lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.6;
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(bus);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + 0.05);
    g.gain.setValueAtTime(Math.max(0.0002, vol), when + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.start(when); o2.start(when); o.stop(when + dur + 0.06); o2.stop(when + dur + 0.06);
  }

  // bell / vibraphone: sine + soft octave partial, bell decay
  bell(bus, when, freq, dur, vol) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o2.type = 'sine'; o.frequency.setValueAtTime(freq, when); o2.frequency.setValueAtTime(freq * 2.01, when);
    const g2 = this.ctx.createGain(); g2.gain.value = 0.35; o2.connect(g2); g2.connect(g);
    o.connect(g); g.connect(bus);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.start(when); o2.start(when); o.stop(when + dur + 0.05); o2.stop(when + dur + 0.05);
  }

  kick(bus, when, vol = 0.6) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, when); o.frequency.exponentialRampToValueAtTime(45, when + 0.12);
    o.connect(g); g.connect(bus);
    g.gain.setValueAtTime(Math.max(0.0002, vol), when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    o.start(when); o.stop(when + 0.2);
  }

  snare(bus, when, vol = 0.4) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this._noise(0.2);
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
    const g = this.ctx.createGain(); s.connect(f); f.connect(g); g.connect(bus);
    g.gain.setValueAtTime(Math.max(0.0002, vol), when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    s.start(when); s.stop(when + 0.22);
    this.note(bus, when, 180, 0.06, vol * 0.4, 'triangle');
  }

  hat(bus, when, vol = 0.18, dur = 0.04) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this._noise(dur + 0.02);
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8000;
    const g = this.ctx.createGain(); s.connect(f); f.connect(g); g.connect(bus);
    g.gain.setValueAtTime(Math.max(0.0002, vol), when); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.start(when); s.stop(when + dur + 0.02);
  }

  tom(bus, when, freq = 120, vol = 0.4) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, when); o.frequency.exponentialRampToValueAtTime(freq * 0.5, when + 0.18);
    o.connect(g); g.connect(bus);
    g.gain.setValueAtTime(Math.max(0.0002, vol), when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    o.start(when); o.stop(when + 0.26);
  }

  timpani(bus, when, freq = 110, vol = 0.5) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, when); o.frequency.exponentialRampToValueAtTime(freq * 0.6, when + 0.3);
    o.connect(g); g.connect(bus);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.4);
    o.start(when); o.stop(when + 0.45);
    const s = this.ctx.createBufferSource(); s.buffer = this._noise(0.06);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 200; f.Q.value = 0.6;
    const ng = this.ctx.createGain(); s.connect(f); f.connect(ng); ng.connect(bus);
    ng.gain.setValueAtTime(vol * 0.4, when); ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    s.start(when); s.stop(when + 0.08);
  }

  cymbal(bus, when, vol = 0.3, dur = 0.7) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this._noise(dur + 0.05);
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    const g = this.ctx.createGain(); s.connect(f); f.connect(g); g.connect(bus);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.start(when); s.stop(when + dur + 0.05);
  }

  ping(bus, when, freq, vol = 0.18) { this.note(bus, when, freq, 0.5, vol, 'sine'); } // dissonant high accent

  // sustained drone layer: detuned saws → lowpass → own gain (starts silent). Returns a handle
  // whose .gain we ramp for intensity, and .stop() to release. Connected to `bus`.
  drone(bus, freqs, { cutoff = 500, type = 'sawtooth', detune = 0.4 } = {}) {
    if (!this.ctx) return { gain: null, stop() {} };
    const g = this.ctx.createGain(); g.gain.value = 0.0001;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.7;
    lp.connect(g); g.connect(bus);
    const oscs = [];
    for (const f of freqs) {
      const a = this.ctx.createOscillator(), b = this.ctx.createOscillator();
      a.type = type; b.type = type; a.frequency.value = f; b.frequency.value = f * (1 + detune / 100);
      a.connect(lp); b.connect(lp); a.start(); b.start(); oscs.push(a, b);
    }
    return { gain: g, stop: (when = this.t) => { try { for (const o of oscs) o.stop(when + 0.6); } catch (e) {} } };
  }
```

- [ ] **Step 2: VERIFY each voice by ear**

Recipe, then in console:

```js
const M = GAME.audio.music, b = M.out, t = () => M.t;
M.kick(b, t()+0.05); M.snare(b, t()+0.4); M.hat(b, t()+0.7);
M.brass(b, t()+0.05, 196, 0.6, 0.25);
M.bell(b, t()+0.05, 880, 0.8, 0.3);
M.timpani(b, t()+0.05, 110, 0.5);
M.cymbal(b, t()+0.05, 0.3);
const d = M.drone(b, [73.42, 110], {cutoff: 600}); d.gain.gain.value = 0.2; setTimeout(()=>d.stop(), 2000);
```

Expected: each is audibly distinct (thump, snare, tick, brass stab, bell, drum, cymbal swell, sustained pad that stops). 0 console errors.

- [ ] **Step 3: Commit**

```bash
git add src/music.js
git commit -m "feat(music): procedural voice palette (perc, brass, bell, drone)"
```

---

## Task 3: Look-ahead scheduler + scene engine (`setScene`/`setIntensity`/`update`/`stop`)

Goal: a dt-independent scheduler runs scene `step()` on a 16th grid and ramps drone gains from intensity; `setScene` crossfades. Test with a tiny inline scene.

**Files:**
- Modify: `src/music.js`

- [ ] **Step 1: Add the scene registry stub + engine methods**

Add near the top of `src/music.js`, **above** `export class MusicDirector`:

```js
// Scene registry. Each scene: { bpm, drones:[{id,min,max,gain,build(M,bus)}], step(M,bus,when,bar,step,I) }.
// `build` returns a drone handle (see MusicDirector.drone). `step` schedules notes at absolute `when`.
// Filled by later tasks. A placeholder 'test' scene is added here to exercise the engine.
export const SCENES = {
  test: {
    bpm: 120,
    drones: [ { id: 'pad', min: 0, max: 0.6, gain: 0.2, build: (M, bus) => M.drone(bus, [110, 164.81], { cutoff: 700 }) } ],
    step(M, bus, when, bar, step, I) {
      if (step % 4 === 0) M.kick(bus, when, 0.5);
      if (I > 0.5 && step % 2 === 0) M.hat(bus, when, 0.15);
      if (I > 0.8 && step % 8 === 4) M.snare(bus, when, 0.35);
    },
  },
};
```

- [ ] **Step 2: Replace the stub `setScene`/`update`/`stop` with real implementations**

In `MusicDirector`, replace the stub `setScene`, `update`, and `stop` from Task 1 with:

```js
  setScene(name, { fade = 1.2, variant = null } = {}) {
    if (!this.ctx) { this._pending = name; return; }
    this.variant = variant;
    if (name === this.sceneName) return;
    const def = SCENES[name];
    if (!def) return;
    const t = this.t;
    // fade out + tear down the old scene
    if (this.sceneBus) {
      const old = this.sceneBus, oldDrones = this.drones;
      old.gain.cancelScheduledValues(t); old.gain.setTargetAtTime(0.0001, t, fade / 3);
      for (const d of oldDrones) if (d.handle) d.handle.stop(t + fade);
      setTimeout(() => { try { old.disconnect(); } catch (e) {} }, (fade + 1) * 1000);
    }
    // build the new scene bus + drones
    const bus = this.ctx.createGain(); bus.gain.value = 0.0001; bus.connect(this.out);
    bus.gain.setTargetAtTime(1, t, fade / 3);
    this.sceneBus = bus; this.scene = def; this.sceneName = name;
    this.drones = (def.drones || []).map((dd) => ({ def: dd, handle: dd.build(this, bus) }));
    this._bar = 0; this._step = 0; this._nextNoteTime = t + 0.06;
    this._ensureScheduler();
  }

  _ramp01(x, a, b) { if (b <= a) return x >= b ? 1 : 0; return Math.max(0, Math.min(1, (x - a) / (b - a))); }

  update(dt) {
    // smooth intensity (fast up ~1.5s, slow down ~3s) and stress
    const up = 1 - Math.exp(-dt / (this._intTarget > this.intensity ? 0.6 : 1.2));
    this.intensity += (this._intTarget - this.intensity) * up;
    this.stress += (this._stressTarget - this.stress) * (1 - Math.exp(-dt / 0.5));
    // drive drone gains from intensity windows
    const t = this.t;
    for (const d of this.drones) {
      if (!d.handle || !d.handle.gain) continue;
      const lvl = this._ramp01(this.intensity, d.def.min, d.def.max) * (d.def.gain || 0.2);
      d.handle.gain.gain.setTargetAtTime(Math.max(0.0001, lvl), t, 0.25);
    }
    // scene duck under stress (overlay) — applied to sceneBus, NOT musicGain
    if (this.sceneBus) {
      const target = (this.sceneName ? 1 : 0.0001) * (1 - 0.3 * this.stress);
      // only apply when not mid-crossfade ramp (setTargetAtTime is cheap + idempotent enough)
      this.sceneBus.gain.setTargetAtTime(Math.max(0.0001, target), t, 0.3);
    }
  }

  stop({ fade = 1.0 } = {}) {
    const t = this.t;
    if (this.sceneBus) { this.sceneBus.gain.setTargetAtTime(0.0001, t, fade / 3); }
    for (const d of this.drones) if (d.handle) d.handle.stop(t + fade);
    const bus = this.sceneBus;
    setTimeout(() => { try { bus && bus.disconnect(); } catch (e) {} }, (fade + 1) * 1000);
    this.sceneBus = null; this.scene = null; this.sceneName = null; this.drones = [];
    if (this._sched) { clearTimeout(this._sched); this._sched = null; }
  }

  _ensureScheduler() {
    if (this._sched || !this.ctx) return;
    const LOOKAHEAD = 0.1, TICK = 25;
    const loop = () => {
      if (!this.ctx) { this._sched = null; return; }
      const stepDur = 60 / (this.scene ? this.scene.bpm : 120) / 4; // 16th notes
      while (this.scene && this._nextNoteTime < this.t + LOOKAHEAD) {
        try { this.scene.step(this, this.sceneBus, this._nextNoteTime, this._bar, this._step, this.intensity); } catch (e) {}
        if (this.stress > 0.02) this._heartbeat(this._nextNoteTime, this._step);
        this._step = (this._step + 1) % 16; if (this._step === 0) this._bar++;
        this._nextNoteTime += stepDur;
      }
      this._sched = setTimeout(loop, TICK);
    };
    loop();
  }

  _heartbeat(when, step) {
    // double-thump roughly twice/bar, faster as stress rises
    const period = Math.max(2, Math.round(8 - this.stress * 5)); // steps between beats
    if (step % period !== 0) return;
    const v = 0.18 + this.stress * 0.22;
    this.tom(this.sceneBus, when, 70, v);
    this.tom(this.sceneBus, when + 0.13, 64, v * 0.7);
  }
```

- [ ] **Step 3: VERIFY engine with the test scene**

Recipe, then:

```js
const M = GAME.audio.music;
M.setScene('test'); M.setIntensity(0);
// you should hear a quiet pad + a kick on each beat
M.setIntensity(1);   // hats + snare layer in, pad fuller — smooth, no clicks
M.setStress(1);      // heartbeat enters, scene ducks slightly
M.setStress(0); M.setIntensity(0);
M.stop();            // fades out, scheduler stops
```

Note: `update()` runs from the game loop; in the menu it may not tick. To test smoothing in console, run a quick driver:

```js
let _id = setInterval(() => GAME.audio.music.update(0.05), 50); // fake loop
// ...try setIntensity/setStress now...
clearInterval(_id);
```

Expected: smooth layer fades, beat stays in tempo, stop() silences cleanly, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/music.js
git commit -m "feat(music): look-ahead scheduler + scene engine (intensity/stress/crossfade)"
```

---

## Task 4: `gameplay` scene (adaptive core — dread → industrial)

**Files:**
- Modify: `src/music.js` (add to `SCENES`)

- [ ] **Step 1: Add the `gameplay` scene**

In `src/music.js`, inside the `SCENES` object, add (D minor; root D = 73.42 Hz):

```js
  gameplay: {
    bpm: 120,
    drones: [
      { id: 'sub',  min: 0.00, max: 0.30, gain: 0.22, build: (M, bus) => M.drone(bus, [36.71], { cutoff: 200, type: 'sine' }) },
      { id: 'pad',  min: 0.00, max: 0.45, gain: 0.16, build: (M, bus) => M.drone(bus, [73.42, 110.00], { cutoff: 520 }) },
      { id: 'tense', min: 0.45, max: 1.00, gain: 0.10, build: (M, bus) => M.drone(bus, [77.78, 110.00], { cutoff: 900 }) }, // D + Eb (minor 2nd) bite
    ],
    step(M, bus, when, bar, step, I) {
      // calm heartbeat kick (always a sparse pulse)
      if (step === 0 || step === 8) M.kick(bus, when, 0.35 + I * 0.25);
      // occasional dissonant high ping when calm
      if (I < 0.35 && step === 6 && bar % 2 === 0) M.ping(bus, when, 1108, 0.12);
      // building: quarter tom pulse + slow root–b2 bass ostinato
      if (I > 0.25) {
        if (step % 4 === 0) M.tom(bus, when, 110, 0.22 + I * 0.18);
        if (step === 0) M.note(bus, when, 73.42, 0.5, 0.18 * I, 'sawtooth');
        if (step === 10) M.note(bus, when, 77.78, 0.4, 0.15 * I, 'sawtooth');
      }
      // peak: driving 16th hats, syncopated bass, snare backbeat, tense tritone lead stab
      if (I > 0.6) {
        M.hat(bus, when, 0.10 + (step % 2 ? 0.0 : 0.06));
        if ([0, 3, 6, 8, 11, 14].includes(step)) M.note(bus, when, 73.42, 0.14, 0.16, 'square');
        if (step === 4 || step === 12) M.snare(bus, when, 0.3);
        if (step === 14 && bar % 2 === 1) M.note(bus, when, 103.83, 0.18, 0.14, 'sawtooth'); // G# tritone vs D
      }
    },
  },
```

- [ ] **Step 2: VERIFY adaptivity**

Recipe + the fake-loop driver from Task 3 Step 3, then:

```js
GAME.audio.music.setScene('gameplay');
GAME.audio.music.setIntensity(0.1);  // dark drone + sub + sparse kick + ping
GAME.audio.music.setIntensity(0.4);  // tom pulse + bass ostinato enter
GAME.audio.music.setIntensity(0.9);  // full industrial: 16th hats, snare, tritone
```

Expected: distinct calm → building → frantic stages, smooth transitions, in tempo. 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/music.js
git commit -m "feat(music): adaptive gameplay scene (dread to industrial)"
```

---

## Task 5: `menu` + `lobby` scenes (synthwave / ambient)

**Files:**
- Modify: `src/music.js` (add to `SCENES`)

- [ ] **Step 1: Add `menu` and `lobby` scenes**

In `SCENES` add (menu: A minor, ~70 BPM; lobby: C minor, ~84 BPM):

```js
  menu: {
    bpm: 70,
    drones: [
      { id: 'pad', min: 0, max: 1, gain: 0.18, build: (M, bus) => M.drone(bus, [110.00, 164.81, 220.00], { cutoff: 700 }) }, // A C E
      { id: 'sub', min: 0, max: 1, gain: 0.14, build: (M, bus) => M.drone(bus, [55.00], { cutoff: 220, type: 'sine' }) },
    ],
    step(M, bus, when, bar, step, I) {
      // slow octave arp A–C–E–A across the bar
      const arp = [220.00, 261.63, 329.63, 440.00];
      if (step % 4 === 0) M.note(bus, when, arp[(step / 4) % 4], 0.5, 0.10, 'triangle');
      // distant brass swell every 8 bars: Am→F→C→G one chord per 2 bars
      const prog = [110.00, 87.31, 130.81, 98.00]; // A F C G
      if (step === 0 && bar % 2 === 0) M.brass(bus, when, prog[(bar / 2) % 4], 1.6, 0.10);
    },
  },
  lobby: {
    bpm: 84,
    drones: [
      { id: 'pad', min: 0, max: 1, gain: 0.16, build: (M, bus) => M.drone(bus, [130.81, 196.00], { cutoff: 760 }) }, // C G
      { id: 'sub', min: 0, max: 1, gain: 0.12, build: (M, bus) => M.drone(bus, [65.41], { cutoff: 240, type: 'sine' }) },
    ],
    step(M, bus, when, bar, step, I) {
      // soft pulsing eighth bass on C
      if (step % 2 === 0) M.note(bus, when, 65.41, 0.18, 0.12, 'sawtooth');
      // gentle bell motif C–Eb–G
      const motif = [523.25, 622.25, 783.99];
      if (step === 4 || step === 12) M.bell(bus, when, motif[(bar + (step === 12 ? 1 : 0)) % 3], 0.6, 0.14);
      // light hat tick
      if (step % 4 === 2) M.hat(bus, when, 0.08);
    },
  },
```

- [ ] **Step 2: VERIFY**

Recipe + fake-loop driver:

```js
GAME.audio.music.setScene('menu');   // somber synthwave pad + slow arp + distant brass
GAME.audio.music.setScene('lobby');  // warmer, pulsing bass + bells (crossfades, no click)
```

Expected: two distinct moods, clean crossfade. 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/music.js
git commit -m "feat(music): menu (synthwave) + lobby (ambient) scenes"
```

---

## Task 6: `boss` scene + variants (Soviet/WW2 epic)

**Files:**
- Modify: `src/music.js` (add `boss` to `SCENES`; variant read from `this.variant`)

- [ ] **Step 1: Add the `boss` scene**

In `SCENES` add (E minor march, ~100 BPM; `M.variant` is `'mitri'` | `'tolo'` | null):

```js
  boss: {
    bpm: 100,
    drones: [
      { id: 'choir', min: 0, max: 1, gain: 0.12, build: (M, bus) => M.drone(bus, [82.41, 123.47], { cutoff: 600 }) }, // E B
      { id: 'sub',   min: 0, max: 1, gain: 0.16, build: (M, bus) => M.drone(bus, [41.20], { cutoff: 200, type: 'sine' }) },
    ],
    step(M, bus, when, bar, step, I) {
      const tolo = M.variant === 'tolo';
      // timpani: 4-on-the-floor, with a pickup fill as boss weakens (I high)
      if (step % 4 === 0) M.timpani(bus, when, 110, 0.42 + I * 0.18);
      if (I > 0.6 && (step === 14)) M.timpani(bus, when, 146.83, 0.3);
      // brass march: Em–C–D–B, one chord per bar, dotted hit on beats 1 & 3
      const prog = [82.41, 65.41, 73.42, 61.74]; // E C D B
      const root = prog[bar % 4];
      if (step === 0) M.brass(bus, when, root, 0.7, 0.22);
      if (step === 8) M.brass(bus, when, root * 1.5, 0.5, 0.16); // fifth
      // snare march roll
      if (step % 2 === 1) M.snare(bus, when, 0.12 + I * 0.08);
      // lead piccolo-ish line when boss is weak
      if (I > 0.55 && (step === 4 || step === 12)) M.note(bus, when, root * 4, 0.2, 0.12, 'square');
      // variant flavor
      if (M.variant === 'mitri' && step % 4 === 2) M.tom(bus, when, 90, 0.2);          // mechanical clank pulse
      if (tolo && step === 6) M.bell(bus, when, 880, 0.5, 0.12);                         // grotesque music-box accent
    },
  },
```

> Note: the spec's optional 3/4 waltz for Tolo is simplified here to a music-box accent over the common march, keeping one scheduler grid. A true 3/4 variant can be a follow-up; this is not a placeholder — it produces distinct audio now.

- [ ] **Step 2: VERIFY**

Recipe + fake-loop driver:

```js
GAME.audio.music.setScene('boss', { variant: 'mitri' });
GAME.audio.music.setIntensity(0.7);  // epic march; mechanical pulse
GAME.audio.music.setScene('boss', { variant: 'tolo' });  // bell accents appear (no re-fade)
GAME.audio.music.setIntensity(1.0);  // timpani fills + lead intensify
```

Expected: driving Soviet/WW2 march, audible variant difference. 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/music.js
git commit -m "feat(music): boss scene (Soviet/WW2 march) + MITRI/Tolo flavor"
```

---

## Task 7: `shop` scene (lounge / elevator muzak)

**Files:**
- Modify: `src/music.js` (add `shop` to `SCENES`)

- [ ] **Step 1: Add the `shop` scene**

In `SCENES` add (F major ii–V–I lounge, ~110 BPM, light swing via the off-step delay):

```js
  shop: {
    bpm: 110,
    drones: [
      { id: 'pad', min: 0, max: 1, gain: 0.10, build: (M, bus) => M.drone(bus, [174.61, 261.63], { cutoff: 900 }) }, // F C
    ],
    step(M, bus, when, bar, step, I) {
      const swing = 0.06 * (60 / 110) * (step % 2 ? 1 : 0); // delay off-beats for a shuffle feel
      const w = when + swing;
      // soft walking upright bass: F – A – C – D per bar (quarter notes)
      const walk = [87.31, 110.00, 130.81, 146.83];
      if (step % 4 === 0) M.note(bus, w, walk[(step / 4) % 4], 0.22, 0.14, 'sine');
      // brushed-hat shuffle
      if (step % 2 === 0) M.hat(bus, w, 0.06, 0.03);
      // vibraphone melody over ii–V–I: Gm7 (bar%4 0-1) → C7 (2) → Fmaj7 (3)
      const mel = [
        [392.00, 466.16, 587.33, 698.46], // G Bb D F
        [392.00, 466.16, 587.33, 698.46],
        [523.25, 659.25, 783.99, 587.33], // C E G D
        [349.23, 440.00, 523.25, 659.25], // F A C E
      ][bar % 4];
      if (step === 0 || step === 6 || step === 10) M.bell(bus, w, mel[(step) % 4], 0.5, 0.13);
      // occasional elevator "ding"
      if (bar % 4 === 3 && step === 14) M.bell(bus, w, 1046.50, 0.7, 0.16);
    },
  },
```

- [ ] **Step 2: VERIFY**

Recipe + fake-loop driver:

```js
GAME.audio.music.setScene('shop');  // cheery vibraphone lounge + walking bass + ding
```

Expected: deliberately absurd elevator muzak, swung feel, the periodic "ding". 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/music.js
git commit -m "feat(music): shop scene (lounge elevator muzak)"
```

---

## Task 8: `gameover` scene + `victory` sting + low-HP `setStress` overlay

Goal: solemn death theme, a one-shot victory fanfare over any scene, and verify the heartbeat overlay end-to-end.

**Files:**
- Modify: `src/music.js` (add `gameover` scene; implement `sting`)

- [ ] **Step 1: Add the `gameover` scene**

In `SCENES` add (A minor, ~60 BPM, solemn):

```js
  gameover: {
    bpm: 60,
    drones: [
      { id: 'pad', min: 0, max: 1, gain: 0.20, build: (M, bus) => M.drone(bus, [55.00, 82.41], { cutoff: 420 }) }, // A E
    ],
    step(M, bus, when, bar, step, I) {
      // descending brass Am–E–Dm–Am, one chord per bar
      const prog = [110.00, 82.41, 73.42, 110.00]; // A E D A
      if (step === 0) M.brass(bus, when, prog[bar % 4], 1.8, 0.18);
      // lone bell toll + slow timpani every 2 bars
      if (step === 0 && bar % 2 === 0) { M.bell(bus, when, 220, 1.4, 0.14); M.timpani(bus, when, 73, 0.35); }
    },
  },
```

- [ ] **Step 2: Implement `sting()` (one-shot over the current scene)**

Replace the stub `sting()` from Task 1 with:

```js
  sting(name, size = 'small') {
    if (!this.ctx || !this.sceneBus) return;
    const bus = this.sceneBus, t = this.t + 0.02, big = size === 'big';
    if (name === 'victory') {
      // rising brass G–C–D→G + double timpani + cymbal swell (extends the radioCall sting)
      const notes = [196.00, 261.63, 293.66, 392.00]; // G C D G
      notes.forEach((f, i) => this.brass(bus, t + i * 0.18, f, big ? 0.7 : 0.45, big ? 0.30 : 0.22));
      this.timpani(bus, t, 110, big ? 0.6 : 0.4); this.timpani(bus, t + 0.36, 146.83, big ? 0.55 : 0.36);
      this.cymbal(bus, t, big ? 0.34 : 0.22, big ? 0.9 : 0.6);
      if (big) this.brass(bus, t + 0.72, 392.00, 1.1, 0.30);
    }
  }
```

- [ ] **Step 3: VERIFY death theme, sting, and stress overlay**

Recipe + fake-loop driver:

```js
GAME.audio.music.setScene('gameover');         // solemn descending brass + bell toll
GAME.audio.music.setScene('gameplay'); GAME.audio.music.setIntensity(0.6);
GAME.audio.music.sting('victory', 'big');      // fanfare bursts over the scene, then scene continues
GAME.audio.music.setStress(1);                 // heartbeat overlay + scene ducks ~30%
GAME.audio.music.setStress(0);
```

Expected: solemn theme; victory fanfare overlays cleanly and the underlying scene resumes; heartbeat speeds with stress and ducks the scene. 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/music.js
git commit -m "feat(music): game-over scene + victory sting + low-HP heartbeat overlay"
```

---

## Task 9: Integrate into `game.js` + `inventory.js` (state machine, first-gesture prime, adaptivity)

Goal: scenes follow game state; gameplay intensity/stress are pushed each frame; boss enter/exit + victory stings happen automatically; audio primes on first gesture so menu/shop music can play.

**Files:**
- Modify: `src/game.js` (constructor/boot, `_updatePlaying`, `startGame`, `toMenu`, `toLobby`, `_enterMP`, `_mpReturnToLobby`, `onWaveCleared`, `onPlayerDead`, `openAdmin`)
- Modify: `src/inventory.js` (`Shop.open`)

- [ ] **Step 1: Prime audio + menu music on the first user gesture**

In `src/game.js`, find the end of the constructor (where input/DOM wiring is set up). Add a one-time gesture primer. Place this right after the existing `this.audio` is created and DOM is ready — concretely, add it inside the constructor after the input handlers are wired (search for the constructor; add before its closing `}`):

```js
    // Prime Web Audio on the first user gesture so menu/lobby/shop music can start
    // (browsers block audio until a gesture). One-shot; safe if already inited.
    const _prime = () => {
      window.removeEventListener('pointerdown', _prime); window.removeEventListener('keydown', _prime);
      this.audio.init();
      if (this.state === 'menu') this.audio.music.setScene(this._lobbyVisible() ? 'lobby' : 'menu');
    };
    window.addEventListener('pointerdown', _prime); window.addEventListener('keydown', _prime);
```

- [ ] **Step 2: Add a small `_lobbyVisible()` helper**

In `src/game.js`, add this method near the other UI helpers (e.g. just above `toMenu()`):

```js
  _lobbyVisible() { const el = document.getElementById('lobby'); return !!(el && el.classList.contains('show')); }
```

- [ ] **Step 3: Scene on enter-gameplay (solo + co-op)**

In `startGame()`, the line is currently:

```js
    this.audio.init(); this.audio.startMusic();
```

Change to:

```js
    this.audio.init(); this.audio.music.setScene('gameplay');
```

In `_enterMP()`, the line is currently:

```js
    this.audio.init(); this.audio.startMusic(); this._intentionalUnlock = false;
```

Change to:

```js
    this.audio.init(); this.audio.music.setScene('gameplay'); this._intentionalUnlock = false;
```

- [ ] **Step 4: Scene on menu / lobby**

In `toMenu()`, replace the call `this.audio.stopMusic();` with:

```js
    this.audio.music.setScene('menu');
```

In `toLobby()`, add as the last line before the closing `}`:

```js
    this.audio.music.setScene('lobby');
```

In `_mpReturnToLobby()`, replace `this.audio.stopMusic();` with:

```js
    this.audio.music.setScene('lobby');
```

- [ ] **Step 5: Scene on admin + shop**

In `openAdmin()`, change:

```js
  openAdmin() { this.state = 'admin'; if (this.admin) this.admin.open(); }
```

to:

```js
  openAdmin() { this.state = 'admin'; this.audio.music.stop(); if (this.admin) this.admin.open(); }
```

In `src/inventory.js`, in `Shop.open(...)`, the line is currently:

```js
    this._render(); this.game.ui.show('shop');
```

Change to:

```js
    this._render(); this.game.ui.show('shop'); if (this.game.audio.music) this.game.audio.music.setScene('shop');
```

- [ ] **Step 6: Game-over scene (solo)**

In `onPlayerDead()` (solo path; it early-returns for co-op), after `this.state = 'dead';` add:

```js
    this.audio.music.setScene('gameover');
```

- [ ] **Step 7: Victory sting on wave clear**

In `onWaveCleared(n)`, after `this.audio.waveClear();` add:

```js
    if (this.audio.music) this.audio.music.sting('victory', 'small');
```

- [ ] **Step 8: Per-frame adaptivity + boss enter/exit in `_updatePlaying`**

In `_updatePlaying(dt)`, add this block at the **end** of the method (just before its closing `}`). It computes threat, pushes intensity/stress, swaps to/from the boss scene, and fires the boss-down sting by diffing boss-alive state:

```js
    // ---- adaptive music (client-local; cosmetic) ----
    if (this.audio.music) {
      const m = this.audio.music, en = this.enemies;
      // find a live boss (Tolo or tank/MITRI)
      let boss = null;
      for (const e of en.active) { if (e.alive && (e.def.boss || e.def.tank)) { boss = e; break; } }
      if (boss) {
        if (m.sceneName !== 'boss') m.setScene('boss', { variant: boss.def.tank ? 'mitri' : 'tolo' });
        const frac = Math.max(0, Math.min(1, boss.hp / (boss.maxHp || 1)));
        m.setIntensity(0.65 + (1 - frac) * 0.35);
        this._bossMusic = true;
      } else {
        if (this._bossMusic) { // boss just died/left and we're still playing → victory + back to gameplay
          this._bossMusic = false;
          m.sting('victory', 'big');
          m.setScene('gameplay');
        }
        if (m.sceneName === 'gameplay') {
          const pp = this.player.pos; let near = 0;
          for (const e of en.active) { if (!e.alive) continue; if (Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z) < 14) near++; }
          const aliveFrac = Math.min(1, en.aliveCount / 18);
          const nearFrac = Math.min(1, near / 8);
          const waveBonus = (this._waveBreak > 0) ? 0 : 0.15;
          m.setIntensity(Math.min(1, 0.05 + nearFrac * 0.6 + aliveFrac * 0.3 + waveBonus));
        }
      }
      const hpFrac = this.player.maxHp ? this.player.hp / this.player.maxHp : 1;
      m.setStress(Math.max(0, Math.min(1, (0.35 - hpFrac) / 0.35)));
      m.update(dt);
    }
```

- [ ] **Step 9: VERIFY the full flow (recipe; this task IS audible in-game)**

1. Load, click Play → **gameplay** scene; as enemies cluster the music intensifies, thins out between waves.
2. Take damage to <35% HP → **heartbeat** overlay + scene ducks; heal → it releases.
3. Reach a boss wave → swaps to the **boss march**; as the boss loses HP the timpani/lead intensify; kill it → **victory fanfare**, then back to gameplay.
4. Wave clear (non-boss) → small **victory sting**.
5. Die (solo) → **game-over** theme.
6. From the menu, open the **Armory** → **elevator muzak**; Back → menu/lobby music.
7. Co-op: host a room → **lobby** music; start → gameplay; squad wipe → back to **lobby** music (no death screen).
8. **RADIO REGRESSION:** in a run, place + turn on a radio, walk toward it → the procedural score **ducks**; tune stations (←/→) incl. the ghost frequency; walk away → score returns. `GAME.audio._musicDuck` moves between ~1 and ~0.15.
9. Music volume slider + `M` mute affect both score and radio. Console: **0 errors** throughout.

- [ ] **Step 10: Commit**

```bash
git add src/game.js src/inventory.js
git commit -m "feat(music): wire adaptive scenes into game state machine + radio-safe duck"
```

---

## Task 10: Tuning pass + ship prep

Goal: balance levels by ear, then prepare the cache-bust (only at ship).

**Files:**
- Modify: `src/music.js` (constant tweaks only), `index.html` + `src/game.js` (cache-bust at ship)

- [ ] **Step 1: Balance by ear**

Play a full run + a boss + the shop. Adjust only the per-scene `gain` values and `vol` args in `src/music.js` if any layer is too loud/quiet relative to SFX. Keep total simultaneous voices modest. Re-run the Task 9 VERIFY checklist.

- [ ] **Step 2: Commit tuning (if any)**

```bash
git add src/music.js
git commit -m "chore(music): balance scene levels by ear"
```

- [ ] **Step 3: Cache-bust ritual (SHIP only — do right before opening the PR)**

Per CLAUDE.md: bump the entry `?v=` in `index.html` and `GAME_BUILD` in `src/game.js` to the current local minute.

- In `index.html`, change `<script type="module" src="./src/game.js?v=195">` → next number (e.g. `?v=196`).
- In `src/game.js`, set `const GAME_BUILD = 'YYYY-MM-DD HH:MM';` to now.

```bash
git add index.html src/game.js
git commit -m "chore: bump build for procedural music system"
```

- [ ] **Step 4: Open the PR**

```bash
git push -u origin feat/procedural-music
gh pr create --fill
```

Then the other brother reviews & approves (1 required) → merge → Vercel auto-deploys.

---

## Self-review notes (author)

- **Spec coverage:** procedural ✓ (Web Audio only); adaptive ✓ (Task 4 + Task 9 intensity); mix-of-genres ✓ (Tasks 4–8); hybrid engine ✓ (drones + scheduler, Task 3); 8 tracks ✓ (gameplay/menu/lobby/boss/shop/victory/gameover + stress overlay, Tasks 4–8); radio-safe ✓ (own bus, never touches `musicGain.gain`, regression test in Tasks 1 & 9); co-op local-only ✓ (Task 9 reads local state); settings/mute ✓ (flows through `musicGain`/`master`).
- **Type consistency:** voice signatures `(bus, when, …)` are used identically in every scene; `drone()` returns `{ gain, stop }` consumed in `update()`/`stop()`/`setScene()`; scene shape `{ bpm, drones[], step() }` is interpreted only by `_ensureScheduler`/`setScene`/`update`; `M.variant` set in `setScene` and read in the `boss` scene.
- **Open tuning constants** (intensity weights in Task 9 Step 8; per-scene gains) are intentionally adjustable in Task 10, not placeholders — they have working defaults.
