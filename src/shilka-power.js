// Pure Shilka electrical + start logic. No DOM, no Three.js — node-testable.
// Two circuits: ±27,5 V DC (battery-buffered) → ПС-14А converter → 220 V/400 Hz AC → Б-6В → 115 V.
// Plus GTD (turbine) start with exhaust-flap interlock, diesel start with oil-pressure interlock,
// generator-online rules, battery sag under starter. Verified numbers from the manuals (findings/).

export const SHILKA_POWER = Object.freeze({
  busVolts: 27.5,            // ±27,5 V DC rails (span 55 V)
  batteryNominal: 24,        // 4×12СТ-70М
  starterMinVolts: 18,       // below this, GTD start blocked / damages starter
  gtdIdleLoPct: 98.5,        // idle band
  gtdIdleHiPct: 103.5,
  gtdStarterCutoffPct: 44,   // starter auto-disconnects
  gtdOilCrankMin: 0.15,      // oil pressure during cold-crank (kg/cm²)
  gtdOilRunMin: 0.5,         // running oil-pressure floor
  oilPressTarget: 2.0,       // pre-lube pump builds toward this
  dieselGenRpm: 1550,        // min diesel rpm to keep generator on-net
});

export function createPowerState(overrides = {}) {
  return {
    // intents (player/crew controls)
    batteryMaster: false, horn: false, coldCrank: false, gtdStart: false,
    fuelPump: false, oilPumpHeld: false, dieselStart: false, converterOn: false, externalPower: false,
    // simulated / derived
    batteryVolts: SHILKA_POWER.busVolts,
    flapsOpen: false,       // ОТКР.ЗАСЛ — latched by cold-crank
    oilPressure: 0,         // diesel oil pressure (kg/cm²)
    gtdState: 'off',        // off | starting | idle | fault
    gtdRpmPct: 0,           // 0..103.5 %
    dieselRpm: 0,
    generatorOnline: false,
    ...overrides,
  };
}

// Three logical buses derived from sources. DC exists from battery/generator/external;
// AC needs the converter running off a live DC bus (or external injection); 115 V derives from AC.
export function powerBuses(p) {
  const dc27 = !!(p.externalPower || p.generatorOnline || p.batteryMaster);
  const ac220 = !!(p.externalPower || (p.converterOn && dc27));
  return { dc27, ac220, v115: ac220 };
}
export function acBusLive(p) { return powerBuses(p).ac220; }

export function canStartGtd(p) {
  if (p.batteryVolts < SHILKA_POWER.starterMinVolts) return { ok: false, reason: 'baterie <18 V' };
  if (!p.flapsOpen) return { ok: false, reason: 'výfukové klapky zavřené (proveď studené protočení 14)' };
  return { ok: true, reason: null };
}
export function canStartDiesel(p) {
  if (!p.fuelPump) return { ok: false, reason: 'palivové čerpadlo vyp (27)' };
  if (p.oilPressure < SHILKA_POWER.gtdOilRunMin) return { ok: false, reason: 'není tlak oleje — drž pumpu 46' };
  return { ok: true, reason: null };
}
export function gtdReady(p) {
  return p.generatorOnline && p.gtdRpmPct >= SHILKA_POWER.gtdIdleLoPct && p.gtdRpmPct <= SHILKA_POWER.gtdIdleHiPct;
}

// Advance the simulation one tick. Mutates and returns p (matches stepShilka style).
export function stepPower(p, dt) {
  const K = SHILKA_POWER;

  // cold-crank latches the exhaust flaps open (hard interlock for GTD start)
  if (p.coldCrank) p.flapsOpen = true;

  // GTD start state machine
  if (p.gtdStart) {
    if (p.gtdState === 'off') p.gtdState = p.flapsOpen ? 'starting' : 'fault';
    if (p.gtdState === 'starting') {
      p.gtdRpmPct = Math.min(K.gtdIdleHiPct, p.gtdRpmPct + 9 * dt);   // ~11 s to idle
      if (p.gtdRpmPct >= K.gtdIdleLoPct) p.gtdState = 'idle';
    }
  } else {
    p.gtdRpmPct = Math.max(0, p.gtdRpmPct - 14 * dt);
    if (p.gtdRpmPct < 1) p.gtdState = 'off';                          // releasing ПУСК clears a fault
  }

  // diesel pre-lube: oil pressure builds while pump held, bleeds off otherwise
  p.oilPressure = p.oilPumpHeld
    ? Math.min(K.oilPressTarget, p.oilPressure + 1.6 * dt)
    : Math.max(0, p.oilPressure - 0.9 * dt);

  // diesel runs only with fuel + oil pressure (hard interlock)
  const dieselOk = p.dieselStart && p.fuelPump && p.oilPressure >= K.gtdOilRunMin;
  p.dieselRpm = dieselOk ? Math.min(1800, p.dieselRpm + 700 * dt) : Math.max(0, p.dieselRpm - 650 * dt);

  // generator on-net if GTD at idle OR diesel above coupling rpm
  p.generatorOnline = (p.gtdState === 'idle') || (p.dieselRpm >= K.dieselGenRpm);

  // battery sags under starter load while the generator is not yet on-net
  const starterLoad = p.coldCrank
    || (p.gtdStart && !p.generatorOnline)
    || (p.dieselStart && !p.generatorOnline);
  p.batteryVolts = (starterLoad && !p.generatorOnline)
    ? Math.max(14, p.batteryVolts - 0.3 * dt)
    : Math.min(K.busVolts, p.batteryVolts + 1.2 * dt);

  return p;
}
