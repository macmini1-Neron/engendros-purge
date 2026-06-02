# Radio Building (Diegetic Real-Radio Prop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a placeable, hero-quality Soviet field-radio building that streams real internet radio stations (diegetic, distance-based volume, animated controls, full co-op sync), and rename the old handheld "Radio" supply-drop item to "Vysílačka".

**Architecture:** The radio is a `BuildManager` structure (`STRUCT_DEFS.radio`, `hard:false` prop so enemies ignore it) held/placed like a sandbag. Its world model is a `THREE.Group` from a new `buildFieldRadio()` (voxel body + a canvas-texture faceplate for legible Cyrillic + separate animated knob/needle meshes). Stream audio plays through a plain `HTMLAudioElement` per radio (NOT routed through Web Audio — cross-origin streams need no CORS that way), with per-frame distance volume; the procedural music ducks when the player stands near an active radio. State (on/station) is host-authoritative, synced via a new `radioset` message reusing the existing structure-placement path.

**Tech Stack:** vanilla JS ES modules, Three.js r160 (vendored), Web Audio + `HTMLAudioElement`, no build step, no test harness (verify in-browser via `window.GAME` + the admin asset viewer).

> **Project testing reality (read first):** This repo has **no automated tests, no build, no lint** (CLAUDE.md). Every "verify" step below is a concrete in-browser / DevTools-console action against the `window.GAME` singleton, served over HTTP. To run the game from this worktree:
> ```bash
> cd "/Users/macmini1/game 4.8/.claude/worktrees/sound-design" && python3 -m http.server 8000
> # open http://localhost:8000/?cb=1  (the ?cb= busts Chrome's module cache after each edit)
> ```
> Bump `?cb=<n>` (or hard-reload) after every edit — `src/*.js` is cached aggressively.

> **Co-op authority rule (applies throughout):** any state-owning logic must sit behind `const hostSim = !mp.active || mp.isHost`. `pstate` is life-state truth; never trust client `xf`. The radio's on/station is host-authoritative.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/loot.js` | Modify | Rename `ITEM_DEFS.radio` (callable) → `airbeacon`; add new `ITEM_DEFS.radio` (material); rename the Falcon-III mesh branch + pickup spawn. |
| `src/inventory.js` | Modify | Held-item dispatch rename (`'radio'`→`'airbeacon'`); held-viewmodel maker map (`airbeacon` Falcon-III + new `radio` field-radio). |
| `src/admin.js` | Modify | Rename admin viewer entry; add `Field Radio` model to the AssetViewer for render-verify. |
| `src/props.js` | Modify | New `buildFieldRadio()` (Group + canvas faceplate + named movable parts) and `animateFieldRadio(group, state, dt)`; a `_radioFaceTexture()` canvas helper. |
| `src/economy.js` | Modify | New `STRUCT_DEFS.radio` (`hard:false, prop:true, audio:true, max:4`). |
| `src/tuning.js` | Modify | `STRUCT_FX_COLOR.radio` (debris tint). |
| `src/radio.js` | **Create** | `RADIO_STATIONS` data + `radioAttenuation(dist)` + `stationLabel(i)` leaf helpers. |
| `src/audio.js` | Modify | `setMusicDuck(d)` + internal `_applyMusicGain()` (so the radio can duck the score). |
| `src/world.js` | Modify | `BuildManager`: build a `prop` kind as a Group, ghost geometry for radio, per-frame radio audio/volume/duck update, raycast look-target (`radioTarget`), `toggleRadio`/`cycleRadioStation`/`applyRadioSet`, reset() audio cleanup. |
| `src/game.js` | Modify | Frame-loop hook `build.updateRadioTarget()` **before** `player.update` (arrow-tuning + key consume); E-toggle in the keydown chain; radio interact prompt. |
| `src/mp.js` | Modify | `radioset`/`radioreq` handlers; late-join on-state replay. |

---

## Task 1: Rename the handheld supply-drop "Radio" → "Vysílačka" (`airbeacon`)

Frees the `radio` namespace for the new building. Pure rename — the Su-24 drop behavior and `audio.radioCall()` are unchanged.

**Files:**
- Modify: `src/loot.js:21`, `src/loot.js:97`, `src/loot.js:352`
- Modify: `src/inventory.js:242`, `src/inventory.js:344`
- Modify: `src/admin.js:125`

- [ ] **Step 1: Rename the ITEM_DEFS entry** — `src/loot.js:21`

Replace:
```js
  radio:   { name: 'Radio',        class: 'callable',   icon: '📻', mesh: 'radio' },
```
with:
```js
  airbeacon: { name: 'Vysílačka',  class: 'callable',   icon: '📡', mesh: 'airbeacon' },
```

- [ ] **Step 2: Rename the mesh branch** — `src/loot.js:97`

Change the `_pickupMesh` Falcon-III branch condition:
```js
    if (kind === 'airbeacon') { // Falcon III-style military handheld radio (olive, antenna, green LCD, keypad, battery)
```

- [ ] **Step 3: Rename the courier drop spawn** — `src/loot.js:352`

```js
    this.spawnNetPickup('airbeacon', pos.x, pos.z, 1);
```
Also update the nearby toast text at `src/loot.js:359` if it says "Radio dropped" → "Vysílačka dropped! (press T)".

- [ ] **Step 4: Rename the inventory dispatch + held-model maker** — `src/inventory.js:242` and `:344`

Line 242:
```js
    else if (def.class === 'callable') { if (edge === 'press') { if (c.kind === 'airbeacon') this._useRadio(c.slot); else this._throwFlare(c.slot); } }
```
Line 344 (in the `makers` map): change `radio: () => loot._pickupMesh('radio'),` to:
```js
      airbeacon: () => loot._pickupMesh('airbeacon'),
```

- [ ] **Step 5: Rename the admin viewer entry** — `src/admin.js:125`

```js
      { name: 'Vysílačka (Falcon III)', sub: 'pickup', make: () => g.loot._pickupMesh('airbeacon') },
```

- [ ] **Step 6: Verify in-browser**

Serve, open `http://localhost:8000/?cb=1`, then in DevTools console:
```js
GAME.startGame('purge');                 // enter a run
GAME.inventory.addItem('airbeacon', 1);  // grant the renamed item
GAME.inventory.refreshHotbar();
```
Expected: a "📡 Vysílačka" slot appears; selecting it and LMB triggers the Su-24 supply drop (toast "Supply drop inbound!"). Confirm **no console error** mentioning `radio`. Open the Admin viewer (menu → admin) and confirm "Vysílačka (Falcon III)" renders the handheld.

- [ ] **Step 7: Commit**

```bash
git add src/loot.js src/inventory.js src/admin.js
git commit -m "refactor(radio): rename handheld supply-drop Radio -> Vysílačka (airbeacon)"
```

---

## Task 2: Build the field-radio model (`buildFieldRadio` + `animateFieldRadio`)

The hero asset. **Invoke the `voxel-weapon-modeling` skill first** and use its render-verify loop. The reference is the user-supplied Soviet field-radio photos (olive box, central meter, knurled tuning dials, ДИАПАЗ. band toggle, red side knob, Cyrillic panel labels). Hybrid construction: voxel/box body + a **canvas-texture faceplate** for legible Cyrillic + separate 3D movable parts.

**Files:**
- Modify: `src/props.js` (add functions near the other prop builders, e.g. after `buildSupplyCrate`)
- Modify: `src/admin.js` (AssetViewer list — add a "Field Radio" entry)

- [ ] **Step 1: Add the canvas faceplate helper** — `src/props.js`

Add (canvas 2D → `THREE.CanvasTexture`, nearest-filtered for the crisp pixel look). Sizes are in texels; the plane it maps onto is sized in Step 2.
```js
// Faceplate decals for the field radio — Cyrillic labels + gauge faces. A canvas
// texture is a deliberate, scoped exception to the engine's vertex-color-only
// convention (fine Cyrillic can't be voxelized legibly); nearest filtering keeps
// the low-res pixel aesthetic. Returns a THREE.CanvasTexture or null (headless).
function _radioFaceTexture() {
  if (typeof document === 'undefined') return null;
  const W = 256, H = 192, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d'); if (!x) return null;
  x.fillStyle = '#3f5230'; x.fillRect(0, 0, W, H);                 // olive panel base
  x.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 1400; i++) x.fillRect(Math.random()*W|0, Math.random()*H|0, 1, 1); // worn speckle
  // gauge face (top-center)
  x.fillStyle = '#e8e2c0'; x.beginPath(); x.arc(150, 56, 30, 0, Math.PI*2); x.fill();
  x.strokeStyle = '#222'; x.lineWidth = 2; x.beginPath(); x.arc(150, 56, 30, Math.PI*0.85, Math.PI*0.15); x.stroke();
  // labels (cyrillic)
  x.fillStyle = '#d8d2b0'; x.font = 'bold 13px monospace'; x.textAlign = 'center';
  const label = (t, px, py) => x.fillText(t, px, py);
  label('НАСТР. ПРИЕМ', 48, 30); label('ОБР. СВЯЗЬ', 110, 30); label('НАСТР. АНТЕН', 224, 30);
  label('НАКАЛ', 110, 110); label('ДИАПАЗ.', 40, 150);
  label('ПРИЕМ ←→ ПЕРЕД', 130, 130); label('ТЕЛ.', 110, 182); label('КП', 175, 182);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.anisotropy = 1;
  return tex;
}
```

- [ ] **Step 2: Add `buildFieldRadio()`** — `src/props.js`

Starting skeleton — a `THREE.Group` with a voxel body (MeshBuilder, 5-tone olive palette), a textured faceplate plane, and **named movable parts in `userData`**. Refine geometry/shading iteratively with the voxel skill against the reference until the dials/red-knob read clearly.
```js
// Soviet field radio (boss-prop quality). World/coop placeable + held viewmodel.
// userData contract drives animateFieldRadio(): { needle, tuneL, tuneR, band, redKnob, lamp }.
export function buildFieldRadio() {
  const hi = 0x5c7040, mid = 0x435230, lo = 0x2f3d22, slot = 0x232e19, edge = 0x6f8650; // olive 5-tone
  const grp = new THREE.Group();
  const b = new MeshBuilder();
  b.box(2.0, 1.4, 1.1, 0, 0.7, 0, mid);                        // main case
  b.box(2.06, 0.12, 1.16, 0, 1.36, 0, edge);                   // lit top strip
  b.box(2.0, 0.16, 1.1, 0, 0.08, 0, lo);                       // shadow base
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.42, 0.42]) b.box(0.18, 0.16, 0.18, sx, -0.04, sz, lo); // feet
  b.box(0.9, 0.2, 0.2, 0.62, 1.0, 0.42, slot);                 // recessed dial wells (proud recess look)
  const body = new THREE.Mesh(b.build(), voxelMaterial());
  body.castShadow = true; body.receiveShadow = true; grp.add(body);

  // faceplate (front = +Z), canvas-textured for the Cyrillic/gauge legibility
  const face = _radioFaceTexture();
  if (face) {
    const fm = new THREE.MeshLambertMaterial({ map: face });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.94, 1.34), fm);
    plane.position.set(0, 0.7, 0.561); grp.add(plane);
  }

  // movable parts (3D), positioned over their painted spots
  const knobMat = () => new THREE.MeshLambertMaterial({ color: 0x20251a });
  const cyl = (r, h) => new THREE.CylinderGeometry(r, r, h, 12);
  const tuneL = new THREE.Mesh(cyl(0.16, 0.12), knobMat()); tuneL.rotation.x = Math.PI/2; tuneL.position.set(-0.62, 0.46, 0.6);
  const tuneR = new THREE.Mesh(cyl(0.2, 0.14), knobMat());  tuneR.rotation.x = Math.PI/2; tuneR.position.set(0.55, 0.5, 0.6);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.26, 0.02), new THREE.MeshBasicMaterial({ color: 0x111 }));
  needle.position.set(0.18, 0.95, 0.58); needle.geometry.translate(0, 0.13, 0); // pivot at base
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), knobMat()); band.position.set(-0.62, 0.78, 0.6);
  const redKnob = new THREE.Mesh(cyl(0.16, 0.34), new THREE.MeshLambertMaterial({ color: 0xb02418 }));
  redKnob.rotation.z = Math.PI/2; redKnob.position.set(1.06, 0.72, 0);   // red side knob (right face)
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0x113311 }));
  lamp.position.set(0.95, 1.12, 0.56);
  for (const m of [tuneL, tuneR, needle, band, redKnob, lamp]) grp.add(m);
  grp.userData = { needle, tuneL, tuneR, band, redKnob, lamp, _t: 0 };
  return grp;
}

// Drives the radio's live animation from its {on, station} state. Call each frame.
export function animateFieldRadio(grp, state, dt) {
  const u = grp && grp.userData; if (!u) return;
  u._t += dt;
  const on = !!(state && state.on);
  if (u.lamp) u.lamp.material.color.setHex(on ? 0x39ff6a : 0x113311);
  if (u.needle) { const base = on ? 0.5 : 0.0, jit = on ? Math.sin(u._t*7)*0.12 : 0; u.needle.rotation.z = -(base + jit) * 0.9; }
  if (u.band) u.band.rotation.x = on ? -0.5 : 0.4;
  // tuning knobs/red knob ease toward a per-station angle (state.station drives it)
  const target = (state && state.station != null ? state.station : 0) * 0.9;
  for (const k of [u.tuneR, u.redKnob]) if (k) k.rotation.y = (k.rotation.y || 0) + ((target) - (k.rotation.y || 0)) * Math.min(1, dt*8);
}
```
> `MeshBuilder` and `voxelMaterial` are already imported at the top of `props.js` (used by `buildSandbags`). `THREE` is too.

- [ ] **Step 3: Add it to the Admin AssetViewer** — `src/admin.js`

Find the model list (near the `'Vysílačka (Falcon III)'` entry from Task 1) and add, importing `buildFieldRadio` from `./props.js` at the top if not already importing props:
```js
      { name: 'Field Radio', sub: 'prop', make: () => buildFieldRadio() },
```

- [ ] **Step 4: Render-verify loop (voxel skill)**

Serve, open admin viewer (`http://localhost:8000/?cb=1` → menu → Admin), select "Field Radio". Screenshot. Check against the reference: olive layered body reads (lit top strip + shadow base, not a flat blob), faceplate Cyrillic legible, red side knob present, needle/dials sit over their painted spots. **Iterate `buildFieldRadio` until it looks great** — this is the centerpiece; spend the iterations. Use the voxel skill's part checklist.

- [ ] **Step 5: Commit**

```bash
git add src/props.js src/admin.js
git commit -m "feat(radio): field-radio voxel model + canvas faceplate + animation rig"
```

---

## Task 3: Make the radio placeable (STRUCT_DEFS + material item + BuildManager prop branch)

**Files:**
- Modify: `src/economy.js` (STRUCT_DEFS), `src/tuning.js` (STRUCT_FX_COLOR)
- Modify: `src/loot.js` (ITEM_DEFS material), `src/inventory.js` (held-model maker)
- Modify: `src/world.js` (BuildManager: ghost geo, prop build branch)

- [ ] **Step 1: Add the structure def** — `src/economy.js`, inside `STRUCT_DEFS`

```js
  radio:   { hp: 200, w: 1.2, h: 0.9, d: 0.7, hard: false, prop: true, audio: true,
             rotStep: Math.PI / 12, label: 'Radio', max: 4 }, // diegetic music prop; enemies ignore it (hard:false)
```

- [ ] **Step 2: Add the debris tint** — `src/tuning.js:40`

```js
export const STRUCT_FX_COLOR = { sandbag: 0xcdb887, wire: 0x8a8f98, wood: 0x7a5530, radio: 0x435230 };
```

- [ ] **Step 3: Add the material item** — `src/loot.js`, inside `ITEM_DEFS` (next to `sandbag`/`wire`/`wood`)

```js
  radio:   { name: 'Radio',        class: 'material',   icon: '📻', build: 'radio' },
```

- [ ] **Step 4: Add the held viewmodel maker** — `src/inventory.js:_buildItemModels` `makers` map

Import `buildFieldRadio` at the top of `inventory.js` (it already imports `buildFlare`, `buildViewmodel`). Add to `makers`:
```js
      radio: () => buildFieldRadio(),
```

- [ ] **Step 5: Build a ghost geometry + a prop build branch** — `src/world.js` `BuildManager`

In the constructor (after `this._geos = {...}`), add a simple single-geometry ghost for the radio (the full animated Group is only for placed instances):
```js
    const rg = buildFieldRadio(); const rgeo = (rg.children.find((c) => c.isMesh) || rg.children[0]).geometry.clone();
    this._geos.radio = rgeo; // ghost preview uses just the body geometry
```
Import `buildFieldRadio, animateFieldRadio` from `./props.js` at the top of `world.js`.

In `placeStructure(kind, pos, yaw, id)`, branch the mesh creation so a `prop` kind uses the full Group:
```js
  placeStructure(kind, pos, yaw, id) {
    const sd = STRUCT_DEFS[kind];
    const mesh = sd.prop ? buildFieldRadio() : new THREE.Mesh(this._geos[kind], voxelMaterial());
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(pos.x, pos.y || 0, pos.z); mesh.rotation.y = yaw;
    this.scene.add(mesh);
    const s = { id, kind, pos: new THREE.Vector3(pos.x, pos.y || 0, pos.z), yaw, mesh, hp: sd.hp, maxHp: sd.hp, box: null, hazard: null,
                on: false, station: 0, audio: null }; // radio runtime state (unused by non-prop kinds)
    const fp = this._footprint(kind, yaw);
    const aabb = (extraTag) => Object.assign({ min: new THREE.Vector3(pos.x - fp.hx, 0, pos.z - fp.hz), max: new THREE.Vector3(pos.x + fp.hx, (pos.y || 0) + sd.h, pos.z + fp.hz) }, extraTag);
    if (sd.hard) { s.box = aabb({ struct: true, _ref: s }); this.game.world.boxes.push(s.box); }
    else if (!sd.prop) { s.hazard = aabb({ ref: s }); } // props have no hazard zone; enemies ignore them entirely
    this.structures.push(s);
    return s;
  }
```
> `castShadow/receiveShadow` on a Group is a no-op on the Group itself; the body mesh inside `buildFieldRadio` already sets them. Leaving the assignment is harmless.

- [ ] **Step 6: Enforce the per-kind cap** — `src/world.js` `BuildManager.place()` (top of method)

After `const kind = this._curKind(); if (!kind) return;` add:
```js
    const cap = STRUCT_DEFS[kind].max;
    if (cap && this.structures.filter((s) => s.kind === kind).length >= cap) { this.game.hud.toast(`Max ${cap} ${STRUCT_DEFS[kind].label}`, 0xd23a2a); return; }
```

- [ ] **Step 7: Verify placement in-browser**

Serve, `?cb=`, console:
```js
GAME.startGame('purge');
GAME.inventory.addItem('radio', 3); GAME.inventory.refreshHotbar();
GAME.inventory.selectKind('radio');     // hold it; a green ghost should appear where you look
```
Look at the ground (within ~5 m), **LMB** to place (material class → `build.place()`). Expected: the field-radio Group appears on the ground, silent, with a green→placed transition; `GAME.build.structures.filter(s=>s.kind==='radio')` has 1 entry with `{on:false, station:0}`. Place 3, then confirm the 4th is blocked with the "Max 4 Radio" toast (cap is 4; you added 3 — add a 4th via `addItem('radio',2)` to test the cap). Walk an enemy into it (`GAME.waves.startWave(1)`) and confirm enemies path **through/around** it and never attack it.

- [ ] **Step 8: Commit**

```bash
git add src/economy.js src/tuning.js src/loot.js src/inventory.js src/world.js
git commit -m "feat(radio): placeable field-radio structure (hard:false prop, max 4)"
```

---

## Task 4: Stream playback + distance volume + music ducking

**Files:**
- Create: `src/radio.js`
- Modify: `src/audio.js` (music duck), `src/world.js` (per-frame radio audio update)

- [ ] **Step 1: Create the radio leaf** — `src/radio.js`

```js
// radio.js — station list + audio helpers for the diegetic field-radio prop.
// Streams play through a plain HTMLAudioElement (NOT Web Audio): cross-origin
// streams need no CORS that way. Distance volume is applied per-frame by BuildManager.
// URLs are data — swap freely. VERIFY each plays before relying on it (streams rot).
export const RADIO_STATIONS = [
  { name: 'Evropa 2',      genre: 'CZ pop',    url: 'https://ice.actve.net/fm-evropa2-128' },
  { name: 'Power 181',     genre: 'US Top 40', url: 'https://listen.181fm.com/181-power_128k.mp3' },
  { name: 'Highway 181',   genre: 'US country',url: 'https://listen.181fm.com/181-highway_128k.mp3' },
  { name: 'The Mix 181',   genre: 'mainstream',url: 'https://listen.181fm.com/181-mix_128k.mp3' },
];

export const RADIO_INNER = 3.5;   // full volume within this radius (m)
export const RADIO_OUTER = 22;    // silent beyond this radius (m)

export function radioAttenuation(dist) {
  if (dist <= RADIO_INNER) return 1;
  if (dist >= RADIO_OUTER) return 0;
  const f = 1 - (dist - RADIO_INNER) / (RADIO_OUTER - RADIO_INNER);
  return f * f; // ease-out falloff
}

export function stationLabel(i) {
  const s = RADIO_STATIONS[((i % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length];
  return s ? `${s.name} · ${s.genre}` : '—';
}
```

- [ ] **Step 2: Add music ducking to AudioManager** — `src/audio.js`

Replace `setMusicVolume` and add a duck multiplier + helper:
```js
  setVolume(v) { this.volume = v; if (this.sfxGain) this.sfxGain.gain.value = v; }
  setMusicVolume(v) { this.musicVolume = v; this._applyMusicGain(); }
  setMusicDuck(d) { this._musicDuck = Math.max(0, Math.min(1, d)); this._applyMusicGain(); } // 1 = full, 0 = silent (radio nearby)
  _applyMusicGain() { if (this.musicGain) this.musicGain.gain.value = this.musicVolume * (this._musicDuck == null ? 1 : this._musicDuck); }
```
In the constructor add `this._musicDuck = 1;` (near `this.musicVolume = 0.5;`).

- [ ] **Step 3: Per-frame radio audio update** — `src/world.js` `BuildManager`

Add a method and call it from `update(dt)` (at the very end of `update`, after the ghost block):
```js
  _updateRadios(dt) {
    const a = this.game.audio, pp = this.game.player.pos;
    let nearest = 0; // max attenuation across ON radios → drives music duck
    for (const s of this.structures) {
      if (s.kind !== 'radio') continue;
      if (s.mesh && s.mesh.userData) animateFieldRadio(s.mesh, s, dt);
      if (!s.on || !s.audio) continue;
      const dist = Math.hypot(pp.x - s.pos.x, pp.z - s.pos.z);
      const att = radioAttenuation(dist);
      s.audio.volume = Math.max(0, Math.min(1, att * (a.musicVolume == null ? 0.5 : a.musicVolume) * (a.muted ? 0 : 1)));
      if (att > nearest) nearest = att;
    }
    if (a.setMusicDuck) a.setMusicDuck(1 - nearest * 0.85); // duck the procedural score near a playing radio
  }
```
Call it: at the end of `update(dt)`, before the method returns, add `this._updateRadios(dt);`. **Important:** the existing early `return`s in `update()` (when no build ghost) skip the tail. Move the `_updateRadios` call to the very top of `update(dt)` instead, so it runs every frame regardless of the ghost early-returns:
```js
  update(dt) {
    this._updateRadios(dt);
    const onFoot = this.game.state === 'playing' && ...
```

- [ ] **Step 4: Audio element lifecycle helpers** — `src/world.js` `BuildManager`

```js
  _radioStart(s) { // create/resume the <audio> for a radio at its current station
    if (typeof Audio === 'undefined') return;
    if (!s.audio) {
      const el = new Audio(); el.preload = 'none'; el.crossOrigin = null;
      el.addEventListener('error', () => { this.game.hud.toast('📻 Station offline', 0xd23a2a); });
      s.audio = el;
    }
    const st = RADIO_STATIONS[((s.station % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length];
    if (st && s.audio.src !== st.url) s.audio.src = st.url;
    const p = s.audio.play(); if (p && p.catch) p.catch(() => {}); // play() is from a user gesture (E/place), so allowed
  }
  _radioStop(s) { if (s.audio) { try { s.audio.pause(); } catch (e) {} } }
```
Import `RADIO_STATIONS, radioAttenuation, stationLabel` from `./radio.js` at the top of `world.js`.

- [ ] **Step 5: Verify audio + ducking in-browser**

Console (after placing a radio from Task 3):
```js
GAME.audio.init();                                   // ensure context (a click already did this)
const r = GAME.build.structures.find(s=>s.kind==='radio');
r.on = true; GAME.build._radioStart(r);              // manual turn-on for this test
```
Expected: a real station plays. Walk toward the radio → it gets **louder**; walk away → quieter, silent past ~22 m. While close, the procedural drone (`GAME.audio.startMusic()` runs in-game) audibly **ducks**. `GAME.audio._musicDuck` < 0.3 when standing on the radio. Stop: `GAME.build._radioStop(r); r.on=false;` → silence, music returns. If a URL is dead, you get the "Station offline" toast — swap that URL in `src/radio.js`.

- [ ] **Step 6: Commit**

```bash
git add src/radio.js src/audio.js src/world.js
git commit -m "feat(radio): real-stream playback, distance volume, music ducking"
```

---

## Task 5: Interaction — E toggle, ← / → station tuning, animation, HUD prompt

Control scheme (per design): **place → silent; E → on; ←/→ → switch station; E → off.** Arrow keys also strafe (`input.strafe`), so when looking at a radio we **consume** them so tuning doesn't move the player.

**Files:**
- Modify: `src/world.js` (`updateRadioTarget`, `toggleRadio`, `cycleRadioStation`)
- Modify: `src/game.js` (call `updateRadioTarget` before `player.update`; E-toggle in keydown chain; interact prompt)

- [ ] **Step 1: Look-target + arrow tuning** — `src/world.js` `BuildManager`

```js
  // Raycast the crosshair against radios within reach → this.radioTarget (or null).
  // While an ON radio is targeted, consume ←/→ for tuning so they don't strafe.
  updateRadioTarget() {
    this.radioTarget = null;
    if (this.game.state !== 'playing' || (this.game.mp && this.game.mp.frozen)) return;
    if (this.game.player.inTank || this.game.player.mountedGun) return;
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const o = this._tmpO.setFromMatrixPosition(cam.matrixWorld);
    const f = this._tmpF.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    let best = null, bestD = 4.0;
    for (const s of this.structures) {
      if (s.kind !== 'radio') continue;
      const dx = s.pos.x - o.x, dz = s.pos.z - o.z, along = dx * f.x + dz * f.z;
      if (along <= 0 || along > bestD) continue;                 // behind or too far
      const px = o.x + f.x * along, pz = o.z + f.z * along;       // closest point on the ray (XZ)
      if (Math.hypot(s.pos.x - px, s.pos.z - pz) < 1.1) { best = s; bestD = along; }
    }
    this.radioTarget = best;
    if (best && best.on) {
      const inp = this.game.input;
      if (inp.wasPressed('ArrowRight')) this.cycleRadioStation(best, 1);
      else if (inp.wasPressed('ArrowLeft')) this.cycleRadioStation(best, -1);
      inp.down.delete('ArrowLeft'); inp.down.delete('ArrowRight'); // suppress strafe this frame while tuning
    }
  }
```

- [ ] **Step 2: Toggle + tune (host-authoritative)** — `src/world.js` `BuildManager`

```js
  toggleRadio(s) {
    if (!s) return;
    const mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) { mp.net.send('radioreq', { id: s.id, on: !s.on, station: s.station }); return; }
    this.applyRadioSet({ id: s.id, on: !s.on, station: s.station });               // host/SP
    if (mp && mp.active && mp.isHost) mp.net.broadcast('radioset', { id: s.id, on: s.on, station: s.station });
  }
  cycleRadioStation(s, dir) {
    if (!s) return;
    const n = RADIO_STATIONS.length, st = ((s.station + dir) % n + n) % n, mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) { mp.net.send('radioreq', { id: s.id, on: true, station: st }); return; }
    this.applyRadioSet({ id: s.id, on: true, station: st });
    if (mp && mp.active && mp.isHost) mp.net.broadcast('radioset', { id: s.id, on: true, station: st });
    this.game.hud.toast('📻 ' + stationLabel(st), 0x6fd0e8);
  }
  // apply authoritative state to a radio (local audio follows). Used by host/SP + remote clients.
  applyRadioSet(d) {
    const s = this.structures.find((x) => x.id === d.id && x.kind === 'radio'); if (!s) return;
    const changedStation = s.station !== d.station;
    s.on = !!d.on; s.station = d.station | 0;
    if (s.on) this._radioStart(s); else this._radioStop(s);
    if (s.on && changedStation) this._radioStart(s); // retune (sets src + plays)
    if (this.game.audio && this.game.audio.uiClick) this.game.audio.uiClick();
  }
```

- [ ] **Step 3: Hook the frame loop** — `src/game.js`

In `_updatePlaying(dt)`, **before** `this.player.update(dt);` (currently `src/game.js:551`), add:
```js
      this.build.updateRadioTarget(); // sets build.radioTarget + consumes ←/→ for tuning BEFORE movement reads strafe
```

- [ ] **Step 4: E toggles the targeted radio** — `src/game.js` keydown chain (`src/game.js` ~122, inside `if (code === 'KeyE')`)

Insert a branch **before** `else if (this.loot.tryPickupNearby())` so looking at a radio takes priority over ambient pickups:
```js
        else if (this.build.radioTarget) { this.build.toggleRadio(this.build.radioTarget); }
```

- [ ] **Step 5: Interact prompt** — `src/game.js` prompt chain (~`src/game.js:584`, before the `loot.nearPickup` branch)

```js
    } else if (this.build.radioTarget) {
      const t = this.build.radioTarget;
      this.hud.setInteract(t.on ? '←/→ stanice · <b>E</b> vypnout rádio' : 'Press <b>E</b> to turn on radio');
```

- [ ] **Step 6: Verify interaction in-browser**

Place a radio (Task 3 console). Walk up and look at it: prompt "Press E to turn on radio" shows. Press **E** → it turns on (lamp greens, needle swings, station plays, prompt switches to "←/→ stanice · E vypnout rádio"). Tap **→ / ←**: station cycles (toast shows name; you do **not** strafe). Press **E** → off (silent, lamp dims). Confirm looking away hides the prompt and arrows strafe normally again.

- [ ] **Step 7: Commit**

```bash
git add src/world.js src/game.js
git commit -m "feat(radio): E toggle + arrow tuning + animation + HUD prompt"
```

---

## Task 6: Co-op sync (full, host-authoritative)

Placement already rides the existing `struct` path (kind `radio` flows through `applyRemoteStruct` → `placeStructure`, which builds the Group). Add on/off/station sync + late-join.

**Files:**
- Modify: `src/mp.js` (message handlers + late-join)

- [ ] **Step 1: Register the radio messages** — `src/mp.js` (next to the `struct*` handlers, ~`src/mp.js:289`)

```js
    n.on('radioset', (d) => g.build.applyRadioSet(d));                          // authoritative on/off/station (host → clients)
    n.on('radioreq', (d, from) => { if (this.isHost) { g.build.applyRadioSet(d); n.broadcast('radioset', d); } }); // client asks host to toggle/tune
```

- [ ] **Step 2: Late-join replay of ON radios** — `src/mp.js` (in the late-join sender, after the `struct` loop at ~`src/mp.js:604`)

```js
    for (const s of this.game.build.structures) if (s.kind === 'radio' && s.on) this.net.sendTo(pid, 'radioset', { id: s.id, on: true, station: s.station }); // late-join: tune newcomers into playing radios
```

- [ ] **Step 3: Verify in co-op (2 machines / 2 browsers)**

Host one game, join from a second browser/PC (WebRTC room code). On the host: place a radio, press E → on, tune to station 2. Expected on the **client**: the radio appears (placement sync), turns on and plays station 2 (each peer streams locally; live → roughly in sync), needle/lamp animate. Client toggles/tunes → host applies and rebroadcasts; both converge. A late joiner who connects after the radio is on should tune in automatically. Toggle off on either side → both go silent.

- [ ] **Step 4: Commit**

```bash
git add src/mp.js
git commit -m "feat(radio): co-op sync — radioset/radioreq + late-join on-state"
```

---

## Task 7: Acquisition-for-testing, cleanup, graceful failure, ship

Shop (misc) wiring is **deferred** to post-`fix/shop`. Until then provide a non-shop way to obtain the radio, and tidy lifecycle.

**Files:**
- Modify: `src/admin.js` (a dev "grant Radio" button), `src/world.js` (`reset()` audio cleanup)

- [ ] **Step 1: Dev grant button** — `src/admin.js`

In the admin action list (near the audio demo buttons at `src/admin.js:145-153`), add:
```js
      ['📻 Grant Radio x2', () => { GAME.inventory.addItem('radio', 2); GAME.inventory.refreshHotbar(); GAME.hud.toast('Granted 2 Radios', 0x6fd0e8); }],
```
> This is the temporary acquisition path. The real one (Armory → misc category) lands after `fix/shop` merges (mirrors the deferred Signal-Flare item).

- [ ] **Step 2: Stop audio on structure destroy + reset** — `src/world.js`

In `destroyStructure(s, cause)` add at the top (after the `indexOf` guard): `this._radioStop(s); if (s.audio) s.audio.src = '';`.
In `reset()`, inside the `for (const s of this.structures)` loop add: `if (s.audio) { try { s.audio.pause(); s.audio.src = ''; } catch (e) {} }`. Also reset the duck: after the loop, `if (this.game.audio && this.game.audio.setMusicDuck) this.game.audio.setMusicDuck(1);`.

- [ ] **Step 3: Verify lifecycle**

Place + turn on 2 radios, tune them, then `GAME.reset()` (or die/restart). Expected: all streams stop (no audio leaking after restart), `GAME.audio._musicDuck === 1`. Destroy a radio while playing (`GAME.build.destroyStructure(GAME.build.structures.find(s=>s.kind==='radio'))`) → its audio stops immediately.

- [ ] **Step 4: Cache-bust ritual (required before PR)** — `index.html` + `src/game.js`

Bump the entry script `?v=N` in `index.html` to the next number, and set `GAME_BUILD` near the top of `src/game.js` to the current local minute (`'YYYY-MM-DD HH:MM'`). (No per-module query params — that scheme is retired.)

- [ ] **Step 5: Full manual regression**

`GAME.startGame('purge')`, grant radios via the admin button, place several, toggle/tune, run a wave (`GAME.waves.startWave(3)`) and confirm: enemies ignore radios; framerate steady with 4 radios playing; the renamed "Vysílačka" still calls supply drops; no console errors. Screenshot the placed radio in-world for the PR.

- [ ] **Step 6: Commit**

```bash
git add src/admin.js src/world.js index.html src/game.js
git commit -m "feat(radio): dev grant, audio lifecycle cleanup, cache-bust"
```

---

## Follow-up (separate plan)

Part 2 of the spec — **procedural music & ambience** (`MusicDirector` intensity layers, boss theme, wind + day/night ambient bed) — gets its own plan (`docs/superpowers/plans/2026-06-02-sound-design-music.md`) after this radio plan lands. The `setMusicDuck` hook added in Task 4 already makes the radio forward-compatible with it (the director sits on `musicGain`, which ducking scales).

Shop (misc) wiring for the radio is deferred to post-`fix/shop`.

---

## Self-Review

- **Spec coverage (Part 1 Radio + Part 3 rename):** model (T2), placement/`hard:false` prop/enemies-ignore (T3), `<audio>` + distance volume + ducking (T4), E/←/→ interaction + animation + prompt (T5), full co-op sync + late-join (T6), stations list (T4), rename (T1), deferred shop noted (T7/Follow-up). Part 2 (music/ambience) intentionally split to its own plan per "radio first". ✔
- **Placeholder scan:** no TBD/TODO; every code step has concrete code; station URLs are real (flagged verify-at-impl, which is data not a code placeholder). ✔
- **Type/name consistency:** `radioTarget`, `toggleRadio`, `cycleRadioStation`, `applyRadioSet`, `_radioStart`/`_radioStop`, `_updateRadios`, `updateRadioTarget`, `setMusicDuck`/`_applyMusicGain`, `RADIO_STATIONS`/`radioAttenuation`/`stationLabel`, structure fields `{on, station, audio}` — used identically across T3–T7. Messages `radioset` (host→clients) + `radioreq` (client→host) consistent in T5/T6. ✔
