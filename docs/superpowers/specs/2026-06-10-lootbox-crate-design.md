# Lootbox «Посылка» — supply-crate ceremony — IMPLEMENTATION SPEC

**Date:** 2026-06-10 · **Status:** Approved design — ready to implement
**Implementer:** coder model (Codex), branch `feat/lootbox-crate` off `main`
**Models:** `models/supply-lootbox/` is delivered separately via the modelgen harness (rigged
spec). The feature must NOT hard-block on it (fallback mesh, §7).
**Owner decisions (locked):** 1 item per crate · pry = 3 latch clicks · price $800 ·
NO crate-exclusive item — the patefon idea was DROPPED (2026-06-10: the game is getting its own
patefon separately; do not add another). Legendary = bazooka + cash jackpot.

Private hobby game, in-game cash only. The goal is a maximally thrilling, psychology-engineered
opening ceremony — every beat below carries its justification. Keep the justifications as code
comments where non-obvious; future tuning must not accidentally delete the psychology.

---

## 1. Psychology the design encodes (research-backed)

1. **Dopamine peaks at ANTICIPATION, not receipt** (Schultz reward-prediction error; max at max
   uncertainty) → the pre-reveal phases are stretched and layered; the reveal itself is snappy.
2. **Overwatch dev lesson (Heiberg/Craig, Blizzard):** glow from the crack before opening = yes;
   rarity-COLOR too early *kills* anticipation (they tried it, removed it) → crack light is warm
   white through the pry stage; tier color appears only in the final ~0.5 s.
3. **Near-miss effect** (slot machines): the crack light flickers *through* tier colors with
   decelerating swaps — a light roulette with engineered "almost gold" passes.
4. **Agency/ritual (Hearthstone):** 3 latches = 3 manual clicks, self-paced micro-suspense,
   illusion of control. Pity timers (epic ≤10, legendary ≤20) keep hope mathematically alive.
5. **Halo 5 lesson (Bloom):** never frustrate bulk opening → skip + express chain (§5.2); the
   impact→reveal ritual is IDENTICAL every time (conditioning).
6. **Rare rewards → bigger arousal + urge to open more** (PMC 7882574) → legendary is genuinely
   longer, louder, brighter.
7. **Peak-end rule:** showcase trophy + name card is the memory; duplicates convert to cash with a
   rising counter + coin cascade ("loss disguised as win"); [ОТКРЫТЬ ЕЩЁ] is one click, zero friction.
8. **Sound carries ~half the thrill:** sub-bass thud (weight = value), per-latch creak with rising
   pitch, tension drone whose end-pitch is a subtle audio tier-tell, four escalating stingers,
   a unique legendary fanfare.

---

## 2. Architecture

### 2.1 New module `src/crate.js` (~700 lines) — the whole feature

Exports: `CRATE_DEF`, `TIER_WEIGHTS`, `PITY`, `DUP_RATE`, `TIER_COLORS`, `LOOT_TABLE`,
`rollCrateReward(game)`, `class CrateCeremony`.

**Import-cycle rule (load-fatal trap in this codebase):** `inventory.js` must NOT import
`crate.js`. The Shop reads crate data at runtime via `this.game.crate.def`. `crate.js` imports:
`{ GADGETS } from './inventory.js'`, `{ WEAPONS, buildViewmodel, buildMag } from './weapons.js'`,
`{ buildSu24, buildChuteRig } from './props.js'`, `{ getSpec } from './props/registry-core.js'`,
`{ buildSpec } from './props/voxel-interp.js'`, `{ weightedPick, rr, clamp } from './util.js'`,
`* as THREE from 'three'`. `game.js` imports `{ CrateCeremony, rollCrateReward } from './crate.js'`.

### 2.2 `CrateCeremony` — own renderer/scene/phase machine

Fusion of the `WeaponPreview` (ui.js) and `AssetViewer` (admin.js) patterns: own
`THREE.WebGLRenderer` on full-screen `#crateCanvas`, own Scene + PerspectiveCamera(50°),
`render(dt)` called from `Game._frame` gated on `state === 'crate'` (no internal rAF).

Scene set (built once): night-steppe ground disc r≈28 (0x202a18 lambert), ~220-star Points dome
(`fog: false`), moon DirectionalLight 0x9fb8d8 @0.5 from (−12,20,−8), Hemisphere
0x2a3a4a/0x0b0f0a @0.35, `THREE.Fog(0x070b0e, 30, 90)`. Actors built per-open: jet (`buildSu24()`),
crate `{root, lid}` (§7), chute (`buildChuteRig()`), 3 latch overlay meshes + pulse ring,
crackLight + burstLight PointLights, additive seam strip, light-shaft cone
(`ConeGeometry(0.45, 2.4, 12, 1, true)`, additive, depthWrite:false), item holder.

Camera: plain damp-lerps — each phase sets target pos/look; per frame
`camPos.lerp(target, 1 − Math.exp(−6·dt))` + additive shake `(rr(−1,1),rr(−1,1),0)·shake`,
`shake *= Math.exp(−7·dt)`.

FX: two hand-rolled `THREE.Points` pools (do NOT touch `effects.js` — it is hard-coupled to the
game scene): dust 60 pts (size .07, 0x8a7a5a, life .9 s, gravity −2) and sparks/straw/coins/stars
48 pts (additive; straw 0xc8a84b, coins 0xffd23f, stars 0xe2483a size .22).

### 2.3 `src/game.js` integration (anchor by quoted code, not line numbers)

1. Imports: `import { CrateCeremony, rollCrateReward } from './crate.js';` — `registerModel` import
   + `_registerModels` block ALREADY EXISTS on main (modelgen-v2 PR); just add
   a `reg('supply-lootbox')` line to that block.
2. Construction after the admin-canvas block:
   `const _cc = document.getElementById('crateCanvas'); this.crate = _cc ? new CrateCeremony(this) : null;`
3. Pointer-lock guard: extend the early-return state list (`'menu' || 'dead' || 'shop' || 'admin'`)
   with `|| this.state === 'crate'`.
4. `_frame` hook after the admin render line:
   ```js
   if (this.state === 'crate' && this.crate) this.crate.render(dt);
   else if (this.crate && this.crate.active) this.crate.abort(); // state hijacked (e.g. co-op host start) — reward already granted
   ```
5. New method `openCrate()` next to `openAdmin()`:
   ```js
   openCrate() {
     const m = this.meta;
     if (!this.crate || this.state === 'crate' || !((m.crates | 0) > 0)) { this.audio.noMoney(); return; }
     this.audio.init();                       // CTA click = user gesture
     const result = rollCrateReward(this);    // COMMIT roll + grant BEFORE any animation (Esc/crash-safe)
     this._saveMeta();
     this.state = 'crate'; this.ui.show('crate');
     this.crate.open(result);
   }
   ```
6. `_loadMeta()` migration (after the loadout block):
   `for (const k of ['crates','crateOpens','pityEpic','pityLegend']) if (typeof m[k] !== 'number' || !(m[k] >= 0)) m[k] = 0;`

### 2.4 `src/ui.js`

1. Register the overlay in `UI`'s constructor map: `crate: document.getElementById('crateOverlay'),`
   (then every existing `ui.hideAll()` path — incl. co-op `_enterMP` — hides the ceremony for free).
2. Add `WeaponPreview.showObject(obj)` — same framing math as `show(key)` but accepts any Object3D;
   dispose by TRAVERSE (modelgen Groups are nested; the shallow pop-dispose used for viewmodels leaks).

### 2.5 `index.html` — overlay DOM + CSS

DOM after the `#shop` overlay closes:

```html
<div id="crateOverlay" class="overlay crate-ov">
  <canvas id="crateCanvas"></canvas>
  <div id="crateVig"></div>
  <div id="crateCount"></div>
  <div id="crateHint" class="crate-hint"></div>
  <div id="crateCard" class="crate-card">
    <div id="crateTier" class="crate-tier"></div>
    <div id="crateName" class="crate-name"></div>
    <div id="crateSub" class="crate-sub"></div>
  </div>
  <div id="crateBtns" class="crate-btns">
    <button class="btn go" id="crateAgainBtn">ОТКРЫТЬ ЕЩЁ · ×<span id="crateLeft">0</span></button>
    <button class="btn sec" id="crateBackBtn">НАЗАД</button>
  </div>
</div>
```

CSS block appended after the shop CSS — reuse POLYMER tokens + the until-now-unused rarity vars
`--c-common/--c-rare/--c-epic/--c-legendary`; tier color driven by
`card.style.setProperty('--tier', …)`; full-screen flash via `#crateVig` box-shadow; canvas fade-in
via `.lit` class. (Style skeleton:)

```css
.crate-ov { padding: 0; background: #000; }
#crateCanvas { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; opacity: 0; transition: opacity .45s ease; }
#crateCanvas.lit { opacity: 1; }
#crateVig { position: absolute; inset: 0; z-index: 2; pointer-events: none; box-shadow: inset 0 0 240px 80px rgba(0,0,0,.78); transition: box-shadow .12s ease; }
#crateCount { position: absolute; top: 16px; right: 22px; z-index: 3; font-family: var(--font-stencil), var(--font-display); font-size: 15px; letter-spacing: 2px; color: var(--ink-dim); text-shadow: 0 2px 0 #000; }
.crate-hint { position: absolute; left: 50%; top: 12%; transform: translateX(-50%); z-index: 3; font-family: var(--font-display); font-size: 19px; letter-spacing: 3px; text-transform: uppercase; color: var(--brass); text-shadow: 0 2px 0 #000; opacity: 0; transition: opacity .2s; animation: cratePulse 1.6s ease-in-out infinite; }
.crate-hint.show { opacity: 1; }
@keyframes cratePulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
.crate-card { position: absolute; left: 50%; bottom: 17%; transform: translateX(-50%); z-index: 3; text-align: center; pointer-events: none; opacity: 0; --tier: var(--c-common); }
.crate-card.show { opacity: 1; animation: cratePop .38s cubic-bezier(.2,1.5,.3,1) both; }
@keyframes cratePop { from { transform: translateX(-50%) scale(.78); opacity: 0; } to { transform: translateX(-50%) scale(1); opacity: 1; } }
.crate-tier { font-family: var(--font-stencil), var(--font-display); font-size: 15px; letter-spacing: 6px; text-transform: uppercase; color: var(--tier); text-shadow: 0 0 14px var(--tier), 0 2px 0 #000; }
.crate-name { font-family: var(--font-title); font-size: 44px; letter-spacing: 2px; color: var(--paper); text-shadow: 0 3px 0 #000, 0 0 26px var(--tier); margin-top: 2px; }
.crate-sub { font-family: var(--font-body); font-size: 16px; color: var(--ink-dim); margin-top: 6px; text-shadow: 0 2px 0 #000; }
.crate-btns { position: absolute; left: 50%; bottom: 6%; transform: translateX(-50%); z-index: 3; display: flex; gap: 12px; opacity: 0; pointer-events: none; transition: opacity .25s; }
.crate-btns.show { opacity: 1; pointer-events: auto; }
```

---

## 3. Data & economy

```js
export const CRATE_DEF = { key: 'crate_supply', name: 'Посылка — Supply Crate', price: 800,
  desc: 'Запечатанный армейский ящик. Su-24 сбросит его лично для вас. Внутри: оружие, снаряжение или наличные. Дубликаты конвертируются в деньги.' };
export const TIER_WEIGHTS = { common: 600, rare: 280, epic: 95, legendary: 25 };   // per-mille
export const PITY = { epic: 10, legendary: 20 };
export const DUP_RATE = 0.4;       // < 0.6 sell refund → no buy↔sell arbitrage; Thompson dupe still reads +$480 = a "win"
export const TIER_COLORS = { common: 0xcfd3d8, rare: 0x84aab2, epic: 0xb070ff, legendary: 0xd8b066 };
```

Tier mapping derives from the existing per-weapon `loot:` weights (weapons.js):
`loot ≥ 10` common · `7–9` rare · `5–6` epic · `≤ 4` legendary; gadgets by price (≤450 common,
flashlight 600 rare); luger (no loot field, $400) → common. knife + mounted guns excluded.

```js
export const LOOT_TABLE = {
  common: [   // Σw 24
    { cash: 150, name: 'Пачка рублей', w: 8 },
    { key: 'flare', w: 2 }, { key: 'molotov', w: 2 }, { key: 'grenade', w: 2 }, { key: 'binoculars', w: 1 },
    { key: 'luger', w: 3 }, { key: 'carbine', w: 2 }, { key: 'thompson', w: 2 }, { key: 'mp40', w: 2 },
  ],
  rare: [     // Σw 25
    { cash: 400, name: 'Полевой оклад', w: 6 },
    { key: 'machete', w: 2 }, { key: 'flashlight', w: 2 }, { key: 'axe', w: 2 }, { key: 'revolver', w: 2 },
    { key: 'grease', w: 2 }, { key: 'magnum', w: 2 }, { key: 'sawed_off', w: 2 }, { key: 'ppsh', w: 2 },
    { key: 'shotgun', w: 2 }, { key: 'garand', w: 1 },
  ],
  epic: [     // Σw 18
    { cash: 1000, name: 'Сейф интенданта', w: 4 },
    { key: 'cleaver', w: 2 }, { key: 'shovel', w: 2 }, { key: 'stg44', w: 2 }, { key: 'mosin', w: 2 },
    { key: 'kar98', w: 2 }, { key: 'bar', w: 2 }, { key: 'dp28', w: 2 },
  ],
  legendary: [ // Σw 5
    { key: 'bazooka', w: 3 },
    { cash: 2500, name: 'ПРЕМИЯ ГЕНШТАБА', w: 2 },
  ],
};
```

EV math to keep in comments: liquidation EV ≈ 67% of price (no arbitrage), all-owned EV ≈ 49%
(endgame cash sink), fresh-account unlock EV ≫ price (the hook). Crate ≈ 2–3 cleared waves
(wave pays 150+25n, kills 3).

**Roll (committed in `openCrate()` BEFORE the animation):**

```js
export function rollCrateReward(game) {
  const m = game.meta;
  m.crates = (m.crates | 0) - 1;
  m.crateOpens = (m.crateOpens | 0) + 1;
  m.pityEpic = (m.pityEpic | 0) + 1; m.pityLegend = (m.pityLegend | 0) + 1;
  let tier = game.crate && game.crate._forceTier;                 // QA hook
  if (!tier) {
    let r = Math.random() * 1000;
    tier = r < TIER_WEIGHTS.legendary ? 'legendary'
      : (r -= TIER_WEIGHTS.legendary) < TIER_WEIGHTS.epic ? 'epic'
      : (r -= TIER_WEIGHTS.epic) < TIER_WEIGHTS.rare ? 'rare' : 'common';
  }
  if (m.pityLegend >= PITY.legendary) tier = 'legendary';          // hard ceilings, legendary first
  else if (m.pityEpic >= PITY.epic && tier !== 'legendary') tier = 'epic';
  if (tier === 'legendary') { m.pityLegend = 0; m.pityEpic = 0; }
  else if (tier === 'epic') m.pityEpic = 0;
  const e = weightedPick(LOOT_TABLE[tier].map((en) => ({ w: en.w, v: en })));
  if (e.cash) { m.bank += e.cash; return { tier, kind: 'cash', cash: e.cash, name: e.name }; }
  const price = _priceOf(e.key), name = _nameOf(e.key);            // GADGETS first, then WEAPONS (flashlight price lives in GADGETS)
  if (m.unlocked.includes(e.key)) {
    const cash = Math.round(price * DUP_RATE); m.bank += cash;
    return { tier, kind: 'dupe', key: e.key, name, cash, price };
  }
  m.unlocked.push(e.key);
  return { tier, kind: WEAPONS[e.key] ? 'weapon' : 'gadget', key: e.key, name, price };
}
```
All-owned case needs no special code — everything converts to cash via the dupe path.

---

## 4. Shop integration (`src/inventory.js`)

New rail category `{ id: 'crate', label: 'Посылки' }` in `SHOP_CATS` (discoverable, room to grow).
- `_catalogItems()`: `const cd = this.game.crate?.def; if (cd) out.push({ key: cd.key, name: cd.name, price: cd.price, cat: 'crate' });`
- `_nameOf/_descOf/_price`: crate branch first (runtime via `game.crate.def`).
- `_renderCatalog()`: crate tile badge = `meta.crates | 0` (stock count), `owned` stays false so the price shows. Icon: `icon('crate')` already exists (icons.js fallback).
- `_setPreview()`: `g.preview.showObject(this.game.crate.buildPreviewMesh())` + stats line «посылка · содержит 1 предмет».
- `_renderDetail()` CTA: **[КУПИТЬ · $800]** (confirm modal — house rule for spends) and
  **[ОТКРЫТЬ · ×n]** (NO confirm — zero friction; disabled at 0 with hint «Сначала купите посылку»).
  Pity transparency line when close: `PITY.legendary - meta.pityLegend <= 5` →
  «легендарная гарантирована через ≤K посылок».
- `_buyCrate()`: bank check → `noMoney()`; else `m.bank -= price; m.crates = (m.crates|0)+1; audio.buy(); _saveMeta(); _render();`
- Return flow (called by `CrateCeremony.close()`):
  `shop.open(shop.returnTo); shop.selected = 'crate_supply'; shop._renderCatalog(); shop._renderDetail();`
  (returnTo 'menu'|'lobby' preserved — the ceremony never touches it.)

---

## 5. Ceremony storyboard (phase machine; per-beat psychology in [brackets])

`phase ∈ fade|flyby|fall|impact|pry|hold|burst|rise|showcase|end`; `this.t` per-phase clock; crate
lands at origin, front face +z, camera on +z side.

| # | Phase | t (s) | Visuals + camera | Audio | Input |
|---|---|---|---|---|---|
| 0 | fade | 0–0.45 | black → night steppe (canvas `.lit`); cam (0,1.7,7.5) look (0,6,−25) | `crateWind()` loop; `setMusicDuck(0.3)` | click=skip→impact (only when `crateOpens > 1`) [5] |
| 1 | flyby | 0.45–2.55 | Su-24 scale .9 banks across (−70,24,−30)→(70,24,−30) ≈67 m/s; look tracks jet x clamped ±14; 2 additive nozzle glows | `startJetClip() \|\| startJet()`, per-frame `jet.set(level, near)` by distance, `stop()` at exit | skip [1,5] |
| 2 | fall | 2.10–4.35 | at jet x≈+4 spawn crate+chute at (0,16,0); 7.2 m/s descent, sway `sin(t·2.1)·0.35`, yaw .4; cam eases to (2.6,1.9,4.4) | `crateChute()` snap; wind | skip [1] |
| 3 | impact | 4.35–5.15 | y=0: squash scale.y 1→.93→1 (.25 s); dust ring 60 pts; canopy collapses, drifts −z, removed +0.5 s; shake .07; cam (1.6,1.1,3.0) look (0,.35,0) | **`crateThud()`**; duck 0.25 | — (0.8 s beat) [8: weight=value; conditioned cue] |
| 4 | pry | user-paced | close-up (1.05,.78,1.95); 3 latch meshes on front face, ACTIVE one pulses an additive ring (op `.25+.2sin(8t)`); per click: latch flies off (vel (±1.2,2.2,1.8), spin, gravity, despawn 1 s), **crack light steps 0→.5→1.2→2.2 WARM WHITE 0xffd9a0**, lid micro-jitter (rot.x −.015 pulse 80 ms); hint «СОРВАТЬ ЗАМОК — k/3» | `crateLatch(i)` pitch rises 1→3 | **3 clicks**, 0.18 s debounce [4; NO tier color — 2] |
| 5 | hold (light roulette) | 0.6/0.8/1.1/1.4 by tier | push-in (0.85,.62,1.5); crack+seam flicker through TIER_COLORS, swap interval `0.06·1.32^k` decelerating; **last 3 swaps engineered:** 2 higher-tier teases (gold passes when result isn't legendary; for legendary tease epic/rare so gold lands as the shock), final = REAL tier held ~0.45 s; lid strains rot.x −.02..0 | `crateDrone(tier, dur)` rising; `crateTick(k, n)` per swap | — [3 near-miss; 2 late tell; 6 tier-scaled length] |
| 6 | burst | 0–0.5 | lid swings on rig rot.x 0→−2.15 cubic-out .22 s, settle −1.95 (overshoot bounce); `#crateVig` flashes tier color; burstLight (tier, 6→2) + shaft cone opacity 0→.35; straw 40 pts; epic+ shake .05; legendary shake .09 + 12 red-star sprites radial burst | `crateBurst(tier)`; `crateStinger(tier)` at +50 ms (legendary → `crateFanfare()`) | — [1: reveal snappy; 6] |
| 7 | rise | 0.7/0.7/0.9/1.4 by tier | reward rises y .30→1.02 ease-out, spin 1.4 rad/s in the shaft; weapon=`buildViewmodel` (+`buildMag` if spinMag); gadget=`game.loot._pickupMesh(kind)`/`buildFlare()`; cash/dupe=coin-stack mesh (3 gold cylinders + banknote box); cam look up (0,.95,0) | soft shaft hum `tone(196,dur,'sine',.06)`; legendary fanfare tail | — [6] |
| 8 | showcase | card at rise-end +0.1; ≥0.8 s | item spins at apex; `.crate-card.show`: tier line ОБЫЧНАЯ/РЕДКАЯ/ЭПИЧЕСКАЯ/ЛЕГЕНДАРНАЯ ПОСЫЛКА + name + sub; **dupe/cash: counter `+$0→+$X` over .9 s + coin fountain; `#crateCount` bank ticks live** | `coinTick(k)` ×~16 dense→sparse; weapon: one `reloadClick()` "rack" | click → end [7 peak-end] |
| 9 | end | +0.4 | `.crate-btns.show`: [ОТКРЫТЬ ЕЩЁ ×n] (hidden at 0) + [НАЗАД]; `#crateCount` «ПОСЫЛКИ ×n · БАНК $…»; hint = collection «ОРУЖЕЙНАЯ: 14/23 СТВОЛОВ» | wind breathes | buttons; Esc=close [7,10] |

Core ≈ 8.2–9.7 s + user pry pace; legendary +~2 s.

### 5.2 Skip & express
- **Skip:** click in phases 0–2 → jump to impact (NEVER skip impact thud + dust — conditioning
  beats). Available only when `meta.crateOpens > 1` (note: the roll pre-increments, so the gate
  `> 1` means the first-ever open is always watched in full). Dim hint «КЛИК — ПРОПУСТИТЬ ▸».
- **Express ([ОТКРЫТЬ ЕЩЁ]):** `chain++`, no jet: fade 0.30 → crate already under canopy at y=8 →
  impact ≈1.45 s. Identical from impact onward. ~4.5–6 s per chained open.
- Pry clicks are never auto-skipped (agency is the product).

### 5.3 Roulette generator

```js
_buildRoulette(tier, dur) {
  const order = ['common', 'rare', 'epic', 'legendary'];
  const seq = []; let t = 0, iv = 0.06;
  while (t + iv < dur - 0.45) { seq.push(order[(Math.random() * 4) | 0]); t += iv; iv *= 1.32; }
  const tease = tier === 'legendary' ? ['epic', 'rare'] : ['legendary', order.filter(x => x !== tier && x !== 'legendary')[0]];
  seq.push(tease[0], tease[1], tier);          // last entry held ~0.45 s
  return seq;
}
```

---

## 6. Crate-exclusive item — DROPPED

There is deliberately NO crate-exclusive legendary item. The original design used a «Патефон»
decoy gadget, but the game is independently getting its own patefon (owner, 2026-06-10) — do not
add another or wire `models/patefon/` into anything. The legendary pool is bazooka + the cash
jackpot. If a chase item is wanted later, design it fresh against whatever the live patefon does.

---

## 7. Crate model contract + fallback (NEVER hard-block on models)

```js
function buildLootCrate() {            // → { root, lid }; root sits on y=0, front = +z
  const spec = getSpec('supply-lootbox');
  if (spec) {
    try {
      const root = buildSpec(spec);
      const lid = root.getObjectByName('lid');
      if (lid && lid.userData.rig && Array.isArray(lid.userData.rig.pivot)) return { root, lid };
      console.warn('[crate] supply-lootbox spec lacks a pivot-rigged lid — fallback crate');
    } catch (e) { console.warn('[crate] buildSpec failed — fallback crate', e); }
  }
  // fallback: MeshBuilder olive pine chest 0.8×0.40×0.5 (layered shading: lit top strips, dark
  // seams) + lid as an outer Group at pivot (0, 0.40, −0.25) containing the lid mesh offset
  // (0, 0.025, 0.25) — IDENTICAL animation contract: rotate outer.rotation.x negative to open.
  ...
  return { root, lid };
}
```
The 3 latch meshes + pulse markers are ALWAYS ceremony-owned overlay objects positioned from the
crate's `Box3` (front face `z = bb.max.z + 0.01`, x = ±0.33·w and 0, y = bb.min.y + 0.66·h) — same
pry visuals on both model paths. `buildPreviewMesh()` (shop spinner) = `buildLootCrate().root`.

---

## 8. Audio — new methods in `src/audio.js` (house style: `this.t`, `sfxGain`, `if (!this.ctx) return`)

Append a `// ---- crate ceremony («Посылка» lootbox) ----` section after the jet block.

| Method | Recipe |
|---|---|
| `crateThud()` | sine 60→24 Hz exp ramp .5 s, `_env(g,t0,.9,.004,.5)` + `noise(.45,.7,'lowpass',220,.7)` body + `_burst(t0+.02,.12,.3,'bandpass',90,1)` slap + 3× dirt `_burst(t0+.12+i·.07,.04,.12,'highpass',3000+rnd·2000,.7)` |
| `crateLatch(i)` | base `[300,380,470][i]`; sawtooth base→base·1.9 over .2 s `_env(.2,.01,.2)`; creak `noise(.16,.3,'bandpass',700+i·150,2.5)`; pop `_metalPing(t0+.18, 2400+i·500,.12,.08)` + `_clank(t0+.19,.18,150+i·30)` |
| `crateDrone(tier,dur)` | FINITE riser (abort-safe): 2 detuned saws 55/55.6 Hz → `[82,90,110,130]`[tier] Hz; lowpass 300→`[900,1100,1500,2200]`[tier]; gain .0001→`[.10,.13,.17,.22]`[tier] linear over dur, then exp→.0001 +.12 s; `o.stop(t0+dur+.2)` |
| `crateTick(k,n)` | `tone(900+600·(k/n), .025, 'square', .10)` — pitch climbs as the reel slows |
| `crateBurst(tier)` | `_clank(t0,.5,95)` pop + 3-layer rising whoosh `_burst` 600→1500→3200 Hz; epic+ adds sub sine 70→30 .35 s vol .5 |
| `crateStinger(tier)` | common: `tone(660,.12,'triangle',.25)`+`tone(880,.18,'sine',.2)`@+60 ms · rare: squares 523,784 @90 ms + shimmer `noise(.3,.08,'highpass',6000,.5)` · epic: triangles 587,880,1174 @95 ms + sparkle `tone(2350,.5,'sine',.12)` + timpani (sine 130→45,.4 s,.45) · legendary → `crateFanfare()` |
| `crateFanfare()` | lift radioCall's brass/drum builders: drum(t0,.55) drum(+.3,.5); chord 196+246.94 @t0; 392+293.66 @+.18; crown 523.25 @+.42 (1.2 s); cymbal `_burst(+.42,.7,.16,'highpass',6500,.4)` ≈1.7 s |
| `coinTick(k)` | `_metalPing(t0, 2200+rnd·1800+k·40, .07, .06)`; every ~3rd + tiny highpass burst. Schedule ~16 over .9 s, interval .03→.09 |
| `crateChute()` | fabric snap `noise(.18,.4,'bandpass',900,1.2)` + flutter `noise(.4,.18,'highpass',2400,.8)` |
| `crateWind()/crateWindStop()` | looping `_noiseBuffer(2)` → lowpass 320 Q.6 → gain .05, .4 s fade-in; handle `this._crateWind`; stop = .5 s exp fade + `src.stop()`. `close()`/`abort()` ALWAYS call stop |

Jet reuse: `startJetClip() || startJet()` + per-frame `set(level, near)` + `stop()` (contract in
loot.js supply drop). Music duck: 0.3 on open → 0.25 at impact → restore `setMusicDuck(1)` in
`close()`/`abort()`.

---

## 9. Edge cases (all REQUIRED)

1. **Esc anytime** → `finishImmediately()`: reward was committed+saved pre-animation — kill
   jet/wind, snap crate open, show card + end buttons. NEVER re-roll, NEVER refund.
2. **Audio init:** `openCrate()` runs from a click → `audio.init()` there; every method guards ctx.
3. **Co-op:** meta local; shop+ceremony per-player. Host starting a run mid-ceremony → `_enterMP`'s
   `ui.hideAll()` hides the overlay (registered) + the `_frame` safety calls `abort()`. Reward kept.
4. **Bulk:** express chain; per-open individual roll+save keeps pity exact.
5. **All owned:** automatic cash mode via dupe path.
6. **Migration:** `_loadMeta` numeric-coercion loop (§2.3.6).
7. **Renderer hygiene:** `setSize()` on every `open()` (fallback 1280×720), resize listener only
   while active, traverse-dispose item/crate meshes on rebuild.
8. **Double-click spam:** `openCrate` re-entry guard.
9. `prefers-reduced-motion` → `_shake = 0` (nicety, non-blocking).

---

## 10. Verification

Console (window.GAME):
```js
GAME.meta.bank = 99999; GAME.meta.crates = 10; GAME._saveMeta(); GAME.shop.open('menu');
GAME.openCrate();
GAME.crate._forceTier = 'legendary'; GAME.openCrate();     // each tier; null to reset
GAME.meta.pityLegend = 19; GAME.crate._forceTier = null; GAME.openCrate();  // MUST be legendary + reset
for (let i=0,n={};i<20000;i++){ GAME.meta.crates=1; const r=(await import('./src/crate.js?cb=1')).rollCrateReward(GAME); n[r.tier]=(n[r.tier]||0)+1; } n  // ≈600/280/95/25‰ + pity bumps
```
Manual: buy flow → first open un-skippable → skip on 2nd → pry debounce → roulette visibly passes
gold → Esc at every phase (reward kept) → express ×5 → return lands on crate tile → lobby returnTo →
co-op host-start abort → reload persistence → model-fallback test (rename spec.json → procedural
crate + warning, ceremony identical).

Ship: cache-bust ritual (`index.html ?v=N+1` + `GAME_BUILD` to the local minute), push,
`gh pr create`, brother review.
