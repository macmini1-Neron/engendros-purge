# Graphics-Quality Settings (Phase 1B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Settings "Graphics" block — Low/Med/High presets + adaptive-resolution toggle + an on-screen
FPS readout — driving the four FPS levers that preserve texture detail: **render scale (DPR)**,
**shadow quality**, **draw distance**, and **antialiasing** — so players can trade sharpness/effects for
frame-rate without ever dropping textures.

**Architecture:** A new pure `src/graphics.js` owns the preset table + the adaptive-resolution controller
(no THREE → node-testable). `engine.js` gains setters that apply each lever (`setRenderScale`,
`setShadowQuality`, boot-time AA, `updateAdaptive`). `game.js` `_frame` feeds the smoothed frame-time to
the adaptive controller and updates an FPS element. A centralized `Game._cullByDistance` toggles
visibility of enemies/loot/terrain-chunks beyond the draw distance and syncs fog. `ui.js` `Settings` +
`index.html` add the Graphics controls following the existing `.srow` pattern.

**Tech Stack:** vanilla ES modules, Three.js r160, Node `node:test` for pure logic, in-browser verify
against `window.GAME`. **No build step.**

**Spec:** `docs/superpowers/specs/2026-06-15-terrain-engine-rebuild-design.md` §3.5. **Depends on
Phase 1A** (merged via PR #74) — branch this off updated `main`.

**Out of scope (later):** per-prop `THREE.LOD`, re-instancing existing district props, texture
streaming, an FXAA/post pipeline (AA here is the construction-time MSAA flag, applied on reload).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/graphics.js` | **new** | **Pure, no THREE.** `GFX_PRESETS`, `presetConfig(name)`, `adaptiveStep(scale, frameMs, opts)`. Node-testable. |
| `src/engine.js` | modify | `_applyPixelRatio()` (base DPR × renderScale), `setRenderScale`, `updateAdaptive(frameMs)`, `setShadowQuality(px)`; constructor reads AA pref from localStorage. |
| `src/game.js` | modify | `_frame`: feed `_frameMs` to `engine.updateAdaptive` when adaptive on; update `#fps` element; call `_cullByDistance`. New `_cullByDistance(d)`. |
| `src/terrain-chunks.js` | modify | `update(camera)` also hides chunks beyond `this.drawDistance` (frustum AND distance). |
| `src/ui.js` | modify | `Settings`: new keys + `apply()` wiring + `_wire()` handlers for the Graphics controls. |
| `index.html` | modify | A "Graphics" group of `.srow` rows in `#settings`; a `#fps` HUD element. |
| `tests/graphics/graphics.test.mjs` | **new** | Node tests for `presetConfig` + `adaptiveStep`. |

**Settings keys (added to `SETTINGS_DEFAULTS`):** `gfxPreset:'High'`, `adaptiveRes:1`, `renderScale:1`,
`shadowQ:2048`, `drawDist:0` (0 = unlimited), `aa:0`, `showFps:0`.

---

## Task 1: Pure graphics config + adaptive controller (`graphics.js`)

**Files:** Create `src/graphics.js`, Test `tests/graphics/graphics.test.mjs`

- [ ] **Step 1: Write the failing test** — `tests/graphics/graphics.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { GFX_PRESETS, presetConfig, adaptiveStep } from '../../src/graphics.js';

test('presets define all four levers, ordered cheapest→richest', () => {
  for (const name of ['Low', 'Medium', 'High']) {
    const c = presetConfig(name);
    assert.equal(typeof c.renderScale, 'number');
    assert.ok(c.renderScale > 0 && c.renderScale <= 1);
    assert.ok([0, 1024, 2048, 4096].includes(c.shadowQ));
    assert.ok(c.drawDist >= 0);
    assert.ok(c.aa === 0 || c.aa === 1);
  }
  // richer presets cost more: High renderScale >= Low, High shadow >= Low shadow
  assert.ok(presetConfig('High').renderScale >= presetConfig('Low').renderScale);
  assert.ok(presetConfig('High').shadowQ >= presetConfig('Low').shadowQ);
});

test('presetConfig falls back to High for an unknown name', () => {
  assert.deepEqual(presetConfig('nonsense'), GFX_PRESETS.High);
});

test('adaptiveStep lowers scale when frames are too slow', () => {
  // target 60fps (16.7ms); a 40ms frame is way over → scale down
  const next = adaptiveStep(1.0, 40, { targetMs: 16.7 });
  assert.ok(next < 1.0);
  assert.ok(next >= 0.5); // never below the floor
});

test('adaptiveStep raises scale when there is headroom', () => {
  // 8ms frame at scale 0.7 → comfortably under target → scale up
  const next = adaptiveStep(0.7, 8, { targetMs: 16.7 });
  assert.ok(next > 0.7);
  assert.ok(next <= 1.0); // never above the ceiling
});

test('adaptiveStep holds steady inside the dead-band (no thrash)', () => {
  // a frame near target stays put
  const next = adaptiveStep(0.85, 17, { targetMs: 16.7 });
  assert.equal(next, 0.85);
});

test('adaptiveStep clamps to [min,max]', () => {
  assert.equal(adaptiveStep(0.5, 100, { targetMs: 16.7 }), 0.5); // already at floor, can't go lower
  assert.equal(adaptiveStep(1.0, 1, { targetMs: 16.7 }), 1.0);   // already at ceiling, can't go higher
});
```

- [ ] **Step 2: Run test to verify it fails** — `node "tests/graphics/graphics.test.mjs"` → FAIL (module not found).

- [ ] **Step 3: Write `src/graphics.js`:**

```javascript
// Pure graphics-quality config + adaptive-resolution controller. NO THREE → node-testable.
// renderScale multiplies the device pixel ratio (0.5 = quarter the pixels, sharpness↓ not textures↓);
// shadowQ is the directional shadow-map size (0 = shadows off); drawDist in metres (0 = unlimited);
// aa = MSAA on/off (applied at renderer construction, i.e. on reload).
export const GFX_PRESETS = {
  Low:    { renderScale: 0.6, shadowQ: 0,    drawDist: 220, aa: 0 },
  Medium: { renderScale: 0.85, shadowQ: 1024, drawDist: 0,   aa: 0 },
  High:   { renderScale: 1.0, shadowQ: 2048, drawDist: 0,   aa: 1 },
};

export function presetConfig(name) {
  return GFX_PRESETS[name] || GFX_PRESETS.High;
}

// One adaptive step: nudge renderScale toward the frame-time target. Dead-band around the target
// prevents oscillation; STEP bounds how fast it moves; clamped to [MIN, MAX].
export function adaptiveStep(scale, frameMs, opts = {}) {
  const targetMs = opts.targetMs != null ? opts.targetMs : 16.7; // 60 fps
  const MIN = opts.min != null ? opts.min : 0.5;
  const MAX = opts.max != null ? opts.max : 1.0;
  const STEP = opts.step != null ? opts.step : 0.05;
  const band = opts.band != null ? opts.band : 0.15; // ±15% dead-band
  const hi = targetMs * (1 + band), lo = targetMs * (1 - band);
  let next = scale;
  if (frameMs > hi) next = scale - STEP;        // too slow → fewer pixels
  else if (frameMs < lo) next = scale + STEP;   // headroom → more pixels
  return Math.max(MIN, Math.min(MAX, next));
}
```

- [ ] **Step 4: Run test to verify it passes** — `node "tests/graphics/graphics.test.mjs"` → 6 pass.

- [ ] **Step 5: Commit**

```bash
git add "src/graphics.js" "tests/graphics/graphics.test.mjs"
git commit -m "feat(graphics): pure preset table + adaptive-resolution controller + node tests"
```

---

## Task 2: Engine levers — render scale, shadow quality, adaptive, boot-time AA

**Files:** Modify `src/engine.js`

- [ ] **Step 1: Constructor — read AA pref + init scale state.** In the `Engine` constructor, the
renderer is built with `antialias: false` (engine.js:16). Replace that hardcoded flag and add scale
state right after the renderer is created. Change `antialias: false,` to read the saved pref:

```javascript
    antialias: (() => { try { return JSON.parse(localStorage.getItem('engendros_settings') || '{}').aa === 1; } catch (e) { return false; } })(),
```

Then immediately after `this.renderer = new THREE.WebGLRenderer({...});` add:

```javascript
    this._renderScale = 1;                                   // graphics-quality render scale (×DPR)
    this._baseDpr = Math.min(window.devicePixelRatio || 1, 2);
    this._adaptive = false;                                  // adaptive resolution on/off
```

- [ ] **Step 2: Centralize pixel-ratio application.** Replace the two lines in `resize()` (engine.js:124-125)

```javascript
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
```

with:

```javascript
    this._baseDpr = Math.min(window.devicePixelRatio || 1, 2);
    this._applyPixelRatio();
    this.renderer.setSize(w, h, false);
```

and add these methods to the `Engine` class (next to `setFov`):

```javascript
  _applyPixelRatio() {
    this.renderer.setPixelRatio(this._baseDpr * this._renderScale);
  }
  setRenderScale(scale) {
    this._renderScale = Math.max(0.5, Math.min(1, scale));
    this._applyPixelRatio();
  }
  setAdaptive(on) { this._adaptive = !!on; if (!on) { this._renderScale = 1; this._applyPixelRatio(); } }
  // Called each frame with the smoothed frame time; nudges render scale to hold ~60fps.
  updateAdaptive(frameMs) {
    if (!this._adaptive || !(frameMs > 0)) return;
    const next = adaptiveStep(this._renderScale, frameMs, { targetMs: 16.7 });
    if (next !== this._renderScale) { this._renderScale = next; this._applyPixelRatio(); }
  }
  setShadowQuality(px) {
    if (!px) { this.renderer.shadowMap.enabled = false; this.sun.castShadow = false; return; }
    this.renderer.shadowMap.enabled = true; this.sun.castShadow = true;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } // force rebuild at new size
    this.sun.shadow.mapSize.set(px, px);
  }
```

- [ ] **Step 3: Import the pure controller.** At the top of `engine.js`, add:

```javascript
import { adaptiveStep } from './graphics.js';
```

- [ ] **Step 4: Syntax check** — `node --check "src/engine.js"` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add "src/engine.js"
git commit -m "feat(graphics): engine render-scale + adaptive resolution + shadow-quality + boot AA"
```

---

## Task 3: Frame-loop adaptive hook, FPS readout, distance cull

**Files:** Modify `src/game.js`, `index.html` (add `#fps` element)

- [ ] **Step 1: Add the FPS HUD element.** In `index.html`, inside the in-game HUD container, add a
small element (hidden by default; styled minimally inline to avoid a CSS dependency):

```html
<div id="fps" style="position:fixed;top:6px;left:8px;z-index:50;font:600 13px/1.2 monospace;color:#9effa0;text-shadow:0 1px 2px #000;display:none;pointer-events:none;"></div>
```

- [ ] **Step 2: Drive adaptive + FPS + distance cull in `_frame`.** In `src/game.js` `_frame`, the line
`if (this.world && this.world.chunks) this.world.chunks.update(this.engine.camera);` is followed by
`this.engine.update(dt); this.engine.render();`. Insert BEFORE `this.engine.update(dt)`:

```javascript
    this.engine.updateAdaptive(this._frameMs);
    if (this._drawDist > 0) this._cullByDistance(this._drawDist);
    if (this._showFps) { const el = this._fpsEl || (this._fpsEl = document.getElementById('fps')); if (el) { el.style.display = 'block'; el.textContent = Math.round(this._fps || 0) + ' FPS'; } }
```

(`this._drawDist` and `this._showFps` are set by Settings.apply — Task 5. Default 0/false.)

- [ ] **Step 3: Add `_cullByDistance`.** Add a method to the `Game` class:

```javascript
  // Hide dynamic entities + terrain chunks beyond `d` metres of the camera; sync fog so the cull edge
  // isn't visible. Cheap per-frame visibility toggles (no allocation). Static map props are not touched.
  _cullByDistance(d) {
    const cam = this.engine.camera.position, d2 = d * d;
    const far = (e) => { const dx = e.pos.x - cam.x, dz = e.pos.z - cam.z; return dx * dx + dz * dz > d2; };
    if (this.enemies) for (const e of this.enemies.active) { if (e.mesh) e.mesh.visible = !far(e); }
    if (this.loot && this.loot.items) for (const it of this.loot.items) { if (it.mesh) it.mesh.visible = (it.pos ? !far(it) : true); }
    if (this.world && this.world.chunks) this.world.chunks.drawDistance = d;
    if (this.scene && this.scene.fog) this.scene.fog.far = Math.min(this.scene.fog.far, d);
  }
```

(If `this.loot.items` / `it.pos` differ in the real `LootManager`, adapt to the actual field names —
read `src/loot.js` first; the intent is "toggle each ground item's mesh visibility by distance".)

- [ ] **Step 4: Init the new fields.** Near `this._fps = 0` (game.js:101) add: `this._drawDist = 0; this._showFps = false; this._fpsEl = null;`

- [ ] **Step 5: Syntax check + commit** — `node --check "src/game.js"`; then:

```bash
git add "src/game.js" "index.html"
git commit -m "feat(graphics): frame-loop adaptive hook, on-screen FPS readout, distance cull"
```

---

## Task 4: Terrain-chunk draw distance

**Files:** Modify `src/terrain-chunks.js`

- [ ] **Step 1: Honor `drawDistance` in `update()`.** In `TerrainChunks`, add `this.drawDistance = 0;`
in the constructor (0 = unlimited), and in `update(camera)` change the visibility decision so a chunk is
shown only if it is BOTH in-frustum AND within draw distance:

```javascript
    const dd = this.drawDistance, dd2 = dd > 0 ? dd * dd : 0;
    const cx = camera.position;
    for (const mesh of this.meshes) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      this._sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
      let inView = this._frustum.intersectsSphere(this._sphere);
      if (inView && dd2 > 0) {
        const dx = this._sphere.center.x - cx.x, dz = this._sphere.center.z - cx.z;
        if (dx * dx + dz * dz > dd2) inView = false;   // beyond draw distance
      }
      mesh.visible = inView;
      if (inView) vis++;
    }
```

- [ ] **Step 2: Syntax check + commit** — `node --check "src/terrain-chunks.js"`; then:

```bash
git add "src/terrain-chunks.js"
git commit -m "feat(graphics): terrain-chunk draw-distance culling"
```

---

## Task 5: Settings UI — Graphics block

**Files:** Modify `src/ui.js`, `index.html`

- [ ] **Step 1: Defaults + apply + wiring (`ui.js`).** Extend `SETTINGS_DEFAULTS` (ui.js:293):

```javascript
const SETTINGS_DEFAULTS = { sens: 0.0022, sfx: 0.8, music: 0.5, fov: 80, nick: 'Player', pokerOdds: 1, gfxPreset: 'High', adaptiveRes: 1, shadowQ: 2048, drawDist: 0, aa: 0, showFps: 0 };
```

In `apply()` (after the existing `engine.setFov` line) push the graphics levers to the engine + game:

```javascript
    const e = this.game.engine;
    if (e.setShadowQuality) e.setShadowQuality(this.data.shadowQ);
    if (e.setAdaptive) e.setAdaptive(!!this.data.adaptiveRes);
    if (e.setRenderScale && !this.data.adaptiveRes) e.setRenderScale(1); // manual mode = full unless adaptive
    this.game._drawDist = this.data.drawDist | 0;
    this.game._showFps = !!this.data.showFps;
    if (!this.data.showFps) { const f = document.getElementById('fps'); if (f) f.style.display = 'none'; }
```

In `_wire()` add handlers (cycle-button pattern like `s-pokerodds`). A preset click applies the whole
preset config to the individual keys:

```javascript
    const presets = ['Low', 'Medium', 'High'];
    const gp = document.getElementById('s-gfx'); if (gp) gp.addEventListener('click', () => {
      const i = (presets.indexOf(this.data.gfxPreset) + 1) % presets.length; this.data.gfxPreset = presets[i];
      const c = presetConfig(this.data.gfxPreset); Object.assign(this.data, { shadowQ: c.shadowQ, drawDist: c.drawDist, adaptiveRes: this.data.adaptiveRes }); // aa needs reload; leave user's aa
      this.apply(); this.save(); this._refresh();
    });
    const ar = document.getElementById('s-adapt'); if (ar) ar.addEventListener('click', () => { this.data.adaptiveRes = this.data.adaptiveRes ? 0 : 1; this.apply(); this.save(); this._refresh(); });
    const sf = document.getElementById('s-showfps'); if (sf) sf.addEventListener('click', () => { this.data.showFps = this.data.showFps ? 0 : 1; this.apply(); this.save(); this._refresh(); });
    const aa = document.getElementById('s-aa'); if (aa) aa.addEventListener('click', () => { this.data.aa = this.data.aa ? 0 : 1; this.save(); this._refresh(); }); // applied on reload
```

And in `_refresh()` add display updates:

```javascript
    const setTog = (id, on, onTxt, offTxt) => { const el = document.getElementById(id); if (el) { el.textContent = on ? (onTxt || 'ON') : (offTxt || 'OFF'); el.style.color = on ? 'var(--neon,#45e0cf)' : '#888'; } };
    const gp2 = document.getElementById('s-gfx'); if (gp2) gp2.textContent = this.data.gfxPreset.toUpperCase();
    setTog('s-adapt', this.data.adaptiveRes); setTog('s-showfps', this.data.showFps); setTog('s-aa', this.data.aa, 'ON (reload)', 'OFF');
```

Add the import at the top of `ui.js`: `import { presetConfig } from './graphics.js';`

- [ ] **Step 2: DOM rows (`index.html`).** In the `#settings` `.settingsgrid` (after the poker-odds row,
index.html:~1401), add:

```html
      <div class="srow"><span>Graphics preset</span><b id="s-gfx" style="cursor:pointer">HIGH</b></div>
      <div class="srow"><span>Adaptive resolution</span><b id="s-adapt" style="cursor:pointer">ON</b></div>
      <div class="srow"><span>Antialiasing</span><b id="s-aa" style="cursor:pointer">OFF</b></div>
      <div class="srow"><span>Show FPS</span><b id="s-showfps" style="cursor:pointer">OFF</b></div>
```

- [ ] **Step 3: Syntax check + commit** — `node --check "src/ui.js"`; then:

```bash
git add "src/ui.js" "index.html"
git commit -m "feat(graphics): Settings Graphics block (presets, adaptive, AA, FPS toggle)"
```

---

## Task 6: In-browser verification + final smoke

**Files:** none (verification). Use the isolated-headless-Chrome recipe (see the headless-verify memory).

- [ ] **Step 1: Node tests** — `node tests/graphics/graphics.test.mjs && node tests/terrain/layout.test.mjs && node tests/terrain/height.test.mjs` → all green.

- [ ] **Step 2: In-browser — presets move FPS knobs, persist, stay local.** Load `?map=demo`, start a run,
then via `evaluate`:

```javascript
() => {
  const g = GAME, s = g.settings;
  const r0 = g.engine.renderer.getPixelRatio();
  s.data.gfxPreset = 'Low'; s.data.adaptiveRes = 0; s.data.shadowQ = 0; s.apply();
  const lowShadow = g.engine.renderer.shadowMap.enabled;
  s.data.gfxPreset = 'High'; s.data.shadowQ = 2048; s.apply();
  const highShadow = g.engine.renderer.shadowMap.enabled;
  // adaptive: force a slow frame-time and confirm render scale drops
  g.engine.setAdaptive(true); g.engine._renderScale = 1; g.engine.updateAdaptive(40);
  return { lowShadowOff: lowShadow === false, highShadowOn: highShadow === true, adaptiveDropped: g.engine._renderScale < 1, persisted: !!localStorage.getItem('engendros_settings') };
}
```
Expected: `lowShadowOff:true`, `highShadowOn:true`, `adaptiveDropped:true`, `persisted:true`.

- [ ] **Step 3: FPS readout + draw distance.** Toggle `showFps` and `drawDist` via settings, confirm the
`#fps` element shows text and far chunks/enemies hide. Screenshot. Confirm **arena & steppe still load
with 0 console errors** (graphics block is map-agnostic).

- [ ] **Step 4: Commit** any verification tweaks; then this branch is ready for cache-bust + PR.

---

## Definition of Done (spec §3.5 / success criterion 7)

- Render scale (+ adaptive) visibly trades sharpness for FPS **without dropping textures**; shadow + draw
  distance move FPS; AA toggles on reload; presets drive them together; FPS readout works.
- Settings persist (`engendros_settings`); graphics is **local-only** (never synced in co-op).
- 0 console errors on all three maps; node tests green; no build step introduced.
