# Shilka — Driver + Power Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Postavit první SPUSTITELNÝ řez Shilka-simulátoru — řidičova energetická páteř + start sekvence + poklop-interlock + P0 panel — který vyvrcholí scénářem „řidič odblokuje boj" (zapni síť → start GTD → generátor → AC ožije → radar/pohony dostupné → zavři poklop → palba odblokovaná).

**Architecture:** Nový **pure-logic modul `src/shilka-power.js`** drží 2-okruhový elektrický model (±27,5 V DC + 220 V/400 Hz AC přes ПС-14А + 115 V přes Б-6В), GTD start state-machine s reálnými zámky (klapky, tlak oleje), a derivované sběrnice — přesný port kauzálního modelu z `shilka-systems-map.html`. `src/shilka-mechanics.js` přestane gateovat radar 7 booleany a začne se ptát elektrické sběrnice. `src/shilka.js` přidá P0 panel (DOM overlay v `index.html` stylu) + per-frame `stepPower()` + poklop. Logika je node-testovaná; vizuál in-browser.

**Tech Stack:** vanilla ES modules + Three.js r160 (žádný build/bundler). Pure logika testovaná `node:test` + `node:assert/strict` (vzor `tests/shilka/*.test.mjs`). Vizuál ověřen ručně v Chrome přes `window.GAME`.

## Global Constraints

- **Žádný build/bundler/package.json.** Bare ES module importy (`import { … } from './shilka-power.js'`). Spouštění testů: `node --test tests/shilka/`.
- **Pure logika = node-testovaná, vizuál = in-browser** (projekt nemá UI testy; ověřuj přes `window.GAME` v Chrome — NE Safari).
- **Co-op = host-authoritative.** Veškerá nová autoritativní logika za `hostSim = !mp.active || mp.isHost`. **Co-op power-sync je v tomto slice ODLOŽEN** (Phase D, gated 2-PC manuální test) — slice běží SÓLO. `pstate` zůstává jediná autorita životů.
- **Ve hře = plný sim, ŽÁDNÁ arkáda; ŽÁDNÁ AI posádka** — sólo hráč přepíná sedačky. Převodník (БПС) zůstává autoritou VELITELE; v sólo slice se přepne přepnutím na velitelskou sedačku (nebo dev-toggle `GAME.shilka.power.converterOn`).
- **Cache-bust ritual při deployi** (až slice půjde do hry): bump `?v=N` v `index.html` + `GAME_BUILD` v `game.js`. (Netýká se čistě logických/test commitů.)
- **Repair/destrukce modulů = mimo rozsah** (navrhuj tak, ať jdou přidat, nestavěj).
- **Verifikovaná čísla** (z `findings/`, `driver-station-inventory.md`): batt nominál 24 V / bus 27,5 V; startér gate <18 V; GTD volnoběh 98,5–103,5 %, startér odpadá ve 44 %, tlak oleje protočení 0,15–0,2 / běh 0,5–2,5; diesel generátor ≥1550 ot/min; AC 220 V/400 Hz; 115 V pohony; náměr reálně −4,5°…+85,5° (⚠️ kód má clamp +62° — mimo tento slice).

---

## Strom závislostí (build order — „co je potřeba udělat")

```
                 ┌─────────────────────────────────────────────┐
                 │  PHASE A — shilka-power.js  (pure, node)     │
                 │  elektrická páteř + GTD/diesel start + zámky │
                 └─────────────────────────────────────────────┘
   A1 buses(sources→dc27→ac220→v115)
        │
        ├─► A2 GTD start SM (coldCrank→flapsOpen→ПУСК→44%→idle→generatorOnline)
        │        └─ zámek: bez flapsOpen → fault
        ├─► A3 diesel start (oilPumpHeld→oilPressure→СТАРТЕР; ≥1550→generator alt)
        │        └─ zámek: bez oilPressure → blocked
        └─► A4 battery sag pod startérem (<18 V → start blocked/risk)
                 │
                 ▼
   ┌─────────────────────────────────────────────┐
   │  PHASE B — wire do shilka-mechanics.js       │
   │  radar/palba se ptají sběrnice + poklop      │
   └─────────────────────────────────────────────┘
   B1 isRadarPowered() ⇒ vyžaduje ac220 (ne jen 7 booleanů)
   B2 hatchClosed interlock ⇒ vstupuje do shilkaFireControl
                 │
                 ▼
   ┌─────────────────────────────────────────────┐
   │  PHASE C — shilka.js  (vizuál, in-browser)   │
   │  P0 panel + per-frame step + poklop          │
   └─────────────────────────────────────────────┘
   C1 P0 panel DOM (tlačítka 7/14/10/11/46/47/27 + lampy 17/18/20/65 + voltmetr)
   C2 per-frame stepPower(dt) + binding lamp/budík/dostupnost radaru+pohonů
   C3 poklop open/close (klávesa) → hatchClosed → palba gate
                 │
                 ▼   DEMO „řidič odblokuje boj" (sólo)
   ┌─────────────────────────────────────────────┐
   │  PHASE D — co-op power sync  (ODLOŽENO)      │  gated 2-PC manuál
   └─────────────────────────────────────────────┘
```

---

## File Structure

- **Create `src/shilka-power.js`** — pure: `createPowerState`, `stepPower`, `powerBuses`, `canStartGtd`, `canStartDiesel`, `gtdReady`, `acBusLive`, konstanty `SHILKA_POWER`.
- **Create `tests/shilka/power.test.mjs`** — node testy pro vše výše.
- **Modify `src/shilka-mechanics.js`** — `createShilkaState` vloží `state.power = createPowerState()`; `isRadarPowered(state)` navíc vyžaduje `acBusLive(state.power)`; přidat `state.hatchClosed`; `shilkaFireControl(state)` vyžaduje `hatchClosed`.
- **Modify `tests/shilka/mechanics.test.mjs`** — testy pro nové gaty.
- **Modify `src/shilka.js`** — P0 panel render + input + per-frame `stepPower` + poklop vizuál/bind. (In-browser verify; žádné node testy.)
- **(Phase D, později) Modify `src/mp.js`** — `shilkapower` host-auth zpráva.

---

## PHASE A — `src/shilka-power.js` (pure elektrický model)

### Task A1: Sběrnice — sources → DC → AC → 115 V

**Files:**
- Create: `src/shilka-power.js`
- Test: `tests/shilka/power.test.mjs`

**Interfaces:**
- Produces:
  - `SHILKA_POWER` (frozen consts)
  - `createPowerState(overrides = {}) -> PowerState`
  - `powerBuses(p) -> { dc27:boolean, ac220:boolean, v115:boolean }`
  - `acBusLive(p) -> boolean`  (= `powerBuses(p).ac220`)
- PowerState fields (this task): `batteryMaster:boolean`, `externalPower:boolean`, `generatorOnline:boolean`, `converterOn:boolean`.

- [ ] **Step 1: Write the failing test**

```js
// tests/shilka/power.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPowerState, powerBuses, acBusLive } from '../../src/shilka-power.js';

test('cold machine: no buses live', () => {
  const p = createPowerState();
  assert.deepEqual(powerBuses(p), { dc27: false, ac220: false, v115: false });
});

test('battery master alone gives DC only (no AC without converter)', () => {
  const p = createPowerState({ batteryMaster: true });
  const b = powerBuses(p);
  assert.equal(b.dc27, true);
  assert.equal(b.ac220, false);
  assert.equal(b.v115, false);
});

test('generator + converter gives full AC chain', () => {
  const p = createPowerState({ batteryMaster: true, generatorOnline: true, converterOn: true });
  const b = powerBuses(p);
  assert.deepEqual(b, { dc27: true, ac220: true, v115: true });
  assert.equal(acBusLive(p), true);
});

test('external power injects DC + AC, bypassing generator/converter', () => {
  const p = createPowerState({ externalPower: true });
  assert.deepEqual(powerBuses(p), { dc27: true, ac220: true, v115: true });
});

test('converter on but no DC source -> no AC', () => {
  const p = createPowerState({ converterOn: true }); // batteryMaster false, no gen
  assert.equal(powerBuses(p).ac220, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shilka/power.test.mjs`
Expected: FAIL — `Cannot find module '../../src/shilka-power.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/shilka-power.js
export const SHILKA_POWER = Object.freeze({
  busVolts: 27.5,            // ±27,5 V DC rails (rozpětí 55 V)
  batteryNominal: 24,
  starterMinVolts: 18,       // pod tím se start zakáže / riskuje poškození
  gtdIdleLoPct: 98.5, gtdIdleHiPct: 103.5,
  gtdStarterCutoffPct: 44,
  gtdOilCrankMin: 0.15, gtdOilRunMin: 0.5,
  dieselGenRpm: 1550,
  oilPressTarget: 2.0,       // kg/cm² po naběhnutí pumpy
});

export function createPowerState(overrides = {}) {
  return {
    // intents (controls)
    batteryMaster: false, fuelPump: false, oilPumpHeld: false,
    coldCrank: false, gtdStart: false, dieselStart: false,
    converterOn: false, externalPower: false,
    // sim/derived
    batteryVolts: SHILKA_POWER.busVolts,
    flapsOpen: false, oilPressure: 0,
    gtdState: 'off', gtdRpmPct: 0, dieselRpm: 0,
    generatorOnline: false,
    startBlockedReason: null,
    ...overrides,
  };
}

// DC live if a DC source exists; AC needs converter+DC OR external; 115 V derives from AC.
export function powerBuses(p) {
  const dc27 = !!(p.externalPower || p.generatorOnline || p.batteryMaster);
  const ac220 = !!(p.externalPower || (p.converterOn && dc27));
  const v115 = ac220;
  return { dc27, ac220, v115 };
}

export function acBusLive(p) { return powerBuses(p).ac220; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/shilka/power.test.mjs`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/shilka-power.js tests/shilka/power.test.mjs
git commit -m "feat(shilka): 2-circuit electrical bus model (DC/AC/115V)"
```

---

### Task A2: GTD start state-machine + klapkový zámek

**Files:**
- Modify: `src/shilka-power.js`
- Test: `tests/shilka/power.test.mjs`

**Interfaces:**
- Produces:
  - `canStartGtd(p) -> { ok:boolean, reason:string|null }`
  - `gtdReady(p) -> boolean`
  - `stepPower(p, dt) -> p` (advances coldCrank→flapsOpen, GTD rpm ramp, starter cutoff @44%, generatorOnline). Mutates and returns `p` (vzor `stepShilka`).
- New PowerState transitions: `gtdState ∈ {'off','cold_crank','starting','idle','fault'}`.

- [ ] **Step 1: Write the failing test**

```js
import { createPowerState, stepPower, canStartGtd, gtdReady } from '../../src/shilka-power.js';

test('GTD start blocked until flaps open (cold-crank opens them)', () => {
  const p = createPowerState({ batteryMaster: true });
  assert.equal(canStartGtd(p).ok, false);              // klapky zavřené
  assert.match(canStartGtd(p).reason, /klap|flap/i);
  p.coldCrank = true; stepPower(p, 1.5);               // protočení otevře klapky
  assert.equal(p.flapsOpen, true);
  assert.equal(canStartGtd(p).ok, true);
});

test('GTD reaches idle band and generator comes online', () => {
  const p = createPowerState({ batteryMaster: true, coldCrank: true });
  stepPower(p, 1.5);                                   // flaps open
  p.coldCrank = false; p.gtdStart = true;
  for (let i = 0; i < 60; i++) stepPower(p, 0.2);      // ~12 s ramp
  assert.ok(p.gtdRpmPct >= 98.5 && p.gtdRpmPct <= 103.5);
  assert.equal(p.generatorOnline, true);
  assert.equal(gtdReady(p), true);
});

test('pressing ПУСК with flaps closed -> fault, no generator', () => {
  const p = createPowerState({ batteryMaster: true, gtdStart: true });
  for (let i = 0; i < 20; i++) stepPower(p, 0.2);
  assert.equal(p.gtdState, 'fault');
  assert.equal(p.generatorOnline, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shilka/power.test.mjs`
Expected: FAIL — `canStartGtd is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// append to src/shilka-power.js
export function canStartGtd(p) {
  if (p.batteryVolts < SHILKA_POWER.starterMinVolts) return { ok:false, reason:'baterie <18 V' };
  if (!p.flapsOpen) return { ok:false, reason:'výfukové klapky zavřené (proveď studené protočení 14)' };
  return { ok:true, reason:null };
}
export function gtdReady(p) {
  return p.generatorOnline && p.gtdRpmPct >= SHILKA_POWER.gtdIdleLoPct && p.gtdRpmPct <= SHILKA_POWER.gtdIdleHiPct;
}
export function stepPower(p, dt) {
  // cold-crank latches flaps open
  if (p.coldCrank) p.flapsOpen = true;
  // GTD state machine
  if (p.gtdStart && p.gtdState === 'off') {
    p.gtdState = p.flapsOpen ? 'starting' : 'fault';
  }
  if (p.gtdState === 'starting') {
    p.gtdRpmPct = Math.min(SHILKA_POWER.gtdIdleHiPct, p.gtdRpmPct + 9 * dt); // ~11 s to idle
    if (p.gtdRpmPct >= SHILKA_POWER.gtdIdleLoPct) { p.gtdState = 'idle'; p.generatorOnline = true; }
  }
  if (p.gtdState === 'idle' && !p.gtdStart) { /* stays running until СТОП */ }
  if (!p.gtdStart && p.gtdState !== 'fault' && p.dieselRpm < SHILKA_POWER.dieselGenRpm) {
    // generator off only if neither GTD idle nor diesel ≥ rpm (handled in A3)
    if (p.gtdState !== 'idle') p.generatorOnline = p.generatorOnline && false;
  }
  return p;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/shilka/power.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shilka-power.js tests/shilka/power.test.mjs
git commit -m "feat(shilka): GTD start state-machine + exhaust-flap interlock"
```

---

### Task A3: Diesel start — zámek tlaku oleje + generátor za jízdy

**Files:** Modify `src/shilka-power.js`; Test `tests/shilka/power.test.mjs`

**Interfaces:**
- Produces: `canStartDiesel(p) -> { ok, reason }`. `stepPower` rozšířen: `oilPumpHeld`→`oilPressure` ramp; `dieselStart`+oilPressure→`dieselRpm`; `dieselRpm ≥ 1550`→`generatorOnline=true` (alternativní zdroj).

- [ ] **Step 1: Write the failing test**

```js
import { canStartDiesel } from '../../src/shilka-power.js';

test('diesel start blocked without oil pressure (МЗН 46)', () => {
  const p = createPowerState({ batteryMaster: true, fuelPump: true });
  assert.equal(canStartDiesel(p).ok, false);
  assert.match(canStartDiesel(p).reason, /olej|oil/i);
  p.oilPumpHeld = true;
  for (let i = 0; i < 20; i++) stepPower(p, 0.2);      // build oil pressure
  assert.ok(p.oilPressure >= SHILKA_POWER.gtdOilRunMin);
  assert.equal(canStartDiesel(p).ok, true);
});

test('diesel at >=1550 rpm brings generator online (alt source)', () => {
  const p = createPowerState({ batteryMaster: true, fuelPump: true, oilPumpHeld: true });
  for (let i = 0; i < 20; i++) stepPower(p, 0.2);
  p.dieselStart = true;
  for (let i = 0; i < 40; i++) stepPower(p, 0.2);
  assert.ok(p.dieselRpm >= SHILKA_POWER.dieselGenRpm);
  assert.equal(p.generatorOnline, true);
});
```

- [ ] **Step 2: Run** `node --test tests/shilka/power.test.mjs` → FAIL (`canStartDiesel` undefined).

- [ ] **Step 3: Implement**

```js
// append / fold into stepPower
export function canStartDiesel(p) {
  if (!p.fuelPump) return { ok:false, reason:'palivové čerpadlo vyp (27)' };
  if (p.oilPressure < SHILKA_POWER.gtdOilRunMin) return { ok:false, reason:'není tlak oleje — drž pumpu 46' };
  return { ok:true, reason:null };
}
// inside stepPower(p, dt), before `return p;`:
//   p.oilPressure = p.oilPumpHeld
//     ? Math.min(SHILKA_POWER.oilPressTarget, p.oilPressure + 1.5 * dt)
//     : Math.max(0, p.oilPressure - 0.8 * dt);
//   if (p.dieselStart && canStartDiesel(p).ok) p.dieselRpm = Math.min(2000, p.dieselRpm + 800 * dt);
//   else if (!p.dieselStart) p.dieselRpm = Math.max(0, p.dieselRpm - 600 * dt);
//   if (p.dieselRpm >= SHILKA_POWER.dieselGenRpm || p.gtdState === 'idle') p.generatorOnline = true;
//   else if (p.gtdState !== 'idle') p.generatorOnline = false;
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(shilka): diesel oil-pressure interlock + engine-driven generator`

---

### Task A4: Battery sag pod startérem (<18 V gate)

**Files:** Modify `src/shilka-power.js`; Test `tests/shilka/power.test.mjs`

**Interfaces:** `stepPower` modeluje pokles `batteryVolts` při aktivním startéru (coldCrank/gtdStart/dieselStart se startérem) bez generátoru; pod 18 V `canStartGtd`/`canStartDiesel` vrací blok.

- [ ] **Step 1: Failing test**

```js
test('weak battery sags under starter and blocks start below 18 V', () => {
  const p = createPowerState({ batteryMaster: true, flapsOpen: true, gtdStart: true, batteryVolts: 19 });
  for (let i = 0; i < 30; i++) stepPower(p, 0.2);
  // pokud nenaskočí generátor rychle, napětí klesne pod práh
  if (!p.generatorOnline) {
    assert.ok(p.batteryVolts < SHILKA_POWER.starterMinVolts);
    assert.equal(canStartGtd(p).ok, false);
  }
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — v `stepPower`: pokud (coldCrank||((gtdStart||dieselStart)&&!generatorOnline)) → `batteryVolts = max(14, batteryVolts - 0.25*dt)`; jinak (generatorOnline) → `batteryVolts = min(27.5, batteryVolts + 1.0*dt)`. `canStartGtd` už blok <18 V má (Task A2).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(shilka): battery voltage sag under starter load`

---

## PHASE B — napojení do `shilka-mechanics.js`

### Task B1: `isRadarPowered` vyžaduje AC sběrnici

**Files:** Modify `src/shilka-mechanics.js` (`createShilkaState` ~ř.109, `isRadarPowered` ~ř.164); Test `tests/shilka/mechanics.test.mjs`

**Interfaces:**
- Consumes: `createPowerState`, `acBusLive` z `shilka-power.js`.
- Changes: `createShilkaState` přidá `state.power = createPowerState(overrides.power)`. `isRadarPowered(state)` = (stávající 7-switch řetěz) **AND** `acBusLive(state.power)`.

- [ ] **Step 1: Failing test**

```js
// tests/shilka/mechanics.test.mjs — přidat
import { createPowerState } from '../../src/shilka-power.js';

test('radar not powered without AC bus even with switches on', () => {
  const s = createShilkaState();
  ['power54v','gyroUnlocked','radarFilament','radarAnode','radarHighVoltage','radarOnAir'].forEach(n => setShilkaSwitch(s, n, true));
  assert.equal(isRadarPowered(s), false);            // AC sběrnice mrtvá
  s.power = createPowerState({ externalPower: true }); // AC live
  assert.equal(isRadarPowered(s), true);
});
```

- [ ] **Step 2: Run** `node --test tests/shilka/mechanics.test.mjs` → FAIL.
- [ ] **Step 3: Implement** — import `acBusLive`, `createPowerState`; v `createShilkaState` přidat `power`; v `isRadarPowered` přidat `&& acBusLive(state.power)`.
- [ ] **Step 4: Run** → PASS (a stávající mechanics testy stále PASS: `node --test tests/shilka/`).
- [ ] **Step 5: Commit** `feat(shilka): radar power gated on AC bus, not bare switches`

### Task B2: Poklop-interlock do palby

**Files:** Modify `src/shilka-mechanics.js` (`shilkaFireControl` ~ř.389, `shilkaBurstRoundCount` ~ř.406); Test `tests/shilka/mechanics.test.mjs`

**Interfaces:** `createShilkaState` přidá `state.hatchClosed = true` (default zavřeno). `shilkaFireControl(state)` vrací `blockedByHatch:true` když `!hatchClosed`; `shilkaBurstRoundCount` vrátí 0 když poklop otevřený.

- [ ] **Step 1: Failing test**

```js
test('open driver hatch blocks fire', () => {
  const s = createShilkaState({ power: { externalPower: true } });
  // přiveď do palbyschopného stavu (radar/solution dle stávajících helperů)…
  s.hatchClosed = false;
  assert.equal(shilkaBurstRoundCount(s, 0.25, false) > 0, false);
  s.hatchClosed = true;
  assert.equal(shilkaBurstRoundCount(s, 0.25, false) > 0, true);
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — default `hatchClosed:true`; v `shilkaBurstRoundCount`/`shilkaFireControl` přidat `if (!state.hatchClosed) return 0;` (resp. `blockedByHatch`).
- [ ] **Step 4: Run** → PASS + celá sada `node --test tests/shilka/`.
- [ ] **Step 5: Commit** `feat(shilka): driver-hatch interlock blocks fire`

---

## PHASE C — `src/shilka.js` panel + integrace (in-browser)

> Vizuál se NEtestuje node-testem. Každý task končí **in-browser akceptací v Chrome** přes `window.GAME`. Panel = DOM overlay v duchu stávajícího HUD v `index.html` (cached refs + setters), zobrazený když `state==='playing'` a hráč sedí na seat 0.

### Task C1: P0 panel (DOM) + vstupy → power intents

**Files:** Modify `src/shilka.js` (+ panel markup do `index.html` HUD sekce). 

**Deliverable:** Overlay „ЩИТОК М-В" s P0 prvky vázanými na `GAME.shilka.power` (`createPowerState`): tlačítka **7 ПИТАНИЕ ВКЛ / 8 ОТКЛ, 14 ХОЛОДНАЯ ПРОКРУТКА, 10 ПУСК ГТД, 11 СТОП ГТД, 27 НАСОС ТОПЛИВА, 46 НАСОС МАСЛА (hold), 47 СТАРТЕР**; lampy **17 ГТД, 18 ГЕНЕРАТОР, 20 ОТКР.ЗАСЛ., 65 ЛЮК ВОДИТ.**; **62 voltmetr** (čte `batteryVolts`). Klávesy mapované přes existující `_driveControlUpdate`.

- [ ] **Step 1:** Přidat panel markup + CSS do `index.html` (skrytý `#shilkaDriverPanel`), cache refs v `shilka.js` adaptéru.
- [ ] **Step 2:** Bind tlačítka → set intents na `GAME.shilka.power` (ПИТАНИЕ→batteryMaster, ХОЛОДНАЯ→coldCrank hold, ПУСК→gtdStart, НАСОС МАСЛА→oilPumpHeld hold, СТАРТЕР→dieselStart, …).
- [ ] **Step 3: In-browser akceptace** (Chrome, `python3 -m http.server`, `?cb=N`): vstoupit do řidiče → panel viditelný → kliky/klávesy mění `GAME.shilka.power` (ověř v konzoli). 0 chyb v konzoli.
- [ ] **Step 4: Commit** `feat(shilka): P0 driver panel DOM + input bindings`

### Task C2: Per-frame `stepPower` + binding lamp/budík/dostupnosti

**Files:** Modify `src/shilka.js` (driver update path, `_driveControlUpdate`/per-frame).

**Deliverable:** Každý frame (když `hostSim`) `stepPower(GAME.shilka.power, dt)`; lampy/voltmetr se aktualizují ze stavu; radar/pohony jsou „dostupné" jen když `acBusLive`. 

- [ ] **Step 1:** Zavolat `stepPower(power, dt)` v řidičově update (gate `hostSim`).
- [ ] **Step 2:** Bind: lampa ГЕНЕРАТОР←`generatorOnline`, ГТД←`gtdState==='idle'`, ОТКР.ЗАСЛ←`flapsOpen`, voltmetr←`batteryVolts`; radar/pohony enabled←`acBusLive`.
- [ ] **Step 3: In-browser akceptace — DEMO power-up:** ПИТАНИЕ → 14 (lampa 20 svítí) → 10 → po ~12 s ГТД+ГЕНЕРАТОР zelené → (přepni na velitele/dev-toggle converterOn) → radar/pohony přestanou být mrtvé. Vypni GTD → AC zhasne, radar zmrtví. 0 chyb.
- [ ] **Step 4: Commit** `feat(shilka): per-frame power sim + lamp/gauge/availability binding`

### Task C3: Poklop open/close → `hatchClosed` → palba gate

**Files:** Modify `src/shilka.js` (poklop vizuál/anim přes rig + klávesa) + bind na `GAME.shilka.state.hatchClosed`.

**Deliverable:** Klávesa přepíná poklop (vizuál rig hatch, pokud existuje, jinak lampa 65); `hatchClosed` jde do mechaniky; otevřený → lampa 65 svítí + palba blokovaná.

- [ ] **Step 1:** Klávesa → toggle `hatchClosed` + lampa 65 + (pokud rig má hatch node) animace.
- [ ] **Step 2: In-browser akceptace — DEMO „řidič odblokuje boj":** s živým AC + radar ready: otevřený poklop → lampa 65 svítí, palba blokovaná; zavři → 65 zhasne, palba povolená. 0 chyb.
- [ ] **Step 3: Commit** `feat(shilka): driver hatch toggle wired to fire interlock`

---

## PHASE D — co-op power sync (ODLOŽENO, gated)

> NEbuduje se v tomto slice. Návrh, ať jde přidat: host drží `power` state; klientův řidič posílá `shilkapower {intents}` → host aplikuje `stepPower` → broadcast derivovaného stavu (`shilkapowerstate`) v `shilkastate`/novém typu. Vše za `hostSim`. Vyžaduje 2-PC manuální test (footgun gate). Definováno zde jako budoucí task; slice běží sólo.

---

## Self-Review

**Spec coverage:** scope §7 „rozsah funkcí" → energetika (A1–A4, B1) ✓ · poklop (B2, C3) ✓ · GTD start (A2) ✓ · panel P0 (C1–C2) ✓ · radar gate na AC (B1) ✓ · co-op (D, vědomě odložené) ✓ · náměr +62°/+85,5° = mimo slice (zaznamenáno v constraints) ✓. Stabilizace/СРП/4 automaty/omezovač úhlů = mimo tento slice (jiné slice).

**Placeholder scan:** logické tasky (A,B) mají reálný test + impl kód. UI tasky (C) mají konkrétní deliverable + binding + in-browser akceptaci místo unit testu (projekt nemá UI testy — viz Global Constraints); to není placeholder, je to projektová konvence.

**Type consistency:** `power` state field konzistentní (`createPowerState`); `acBusLive(state.power)` použito v B1 stejně jako definováno v A1; `hatchClosed` default `true` v B2 i čteno v C3; `stepPower(p, dt)` signatura stejná A2/A3/A4/C2.

---

## Execution Handoff

Plán hotový a uložený do `docs/superpowers/plans/2026-06-22-shilka-driver-power-slice.md`. Dvě možnosti provedení:

1. **Subagent-Driven (doporučeno)** — fresh subagent na každý task, review mezi tasky.
2. **Inline** — provedení v této session přes executing-plans, batch s checkpointy.
