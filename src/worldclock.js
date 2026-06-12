// src/worldclock.js — deterministic, always-running day/night world clock.
//
// PURE (no THREE, no DOM) — importable directly from node tests.
//
// The single source of truth for in-game time is an integer minute counter
// (`total`, monotonic from world start). The sky, the HUD clock, /time, and the
// co-op sync all derive from it. Ticks (in-game minutes) are invisible to the
// player — they only ever see HH:MM.
//
// Reuses the proven fixed-step accumulator from simclock.js so time advances at
// a fixed rate regardless of the variable-dt game loop — and a stalled frame
// (tab hidden) cannot fast-forward time, because dt is clamped per advance().

import { makeClock } from './simclock.js';

// ─── structural time constants (pure numbers — the tunable day/night window) ──
export const MINUTES_PER_DAY = 1440;            // 24 h × 60
export const DAY_START_MIN = 360;               // 06:00 — sunrise, day window begins
export const DAY_END_MIN = 1080;                // 18:00 — sunset, night begins
const DAY_SPAN = DAY_END_MIN - DAY_START_MIN;             // 720 — minutes of daylight
const NIGHT_SPAN = MINUTES_PER_DAY - DAY_SPAN;           // 720 — minutes of darkness

const wrapDay = (m) => ((m % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

// ─── HH:MM parse / format ────────────────────────────────────────────────────

/** "20:18" → 1218 minute-of-day, or null if not a valid HH:MM (HH 0-23, MM two digits 0-59). */
export function parseHHMM(str) {
  if (typeof str !== 'string') return null;
  const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** minute-of-day (any integer, wrapped into a day) → zero-padded "HH:MM". */
export function formatHHMM(min) {
  const m = wrapDay(Math.floor(min));
  const h = Math.floor(m / 60), mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ─── named phase shortcuts (for /time set <keyword>) ─────────────────────────
const KEYWORDS = { dawn: 360, day: 720, noon: 720, dusk: 1080, night: 0, midnight: 0 };
/** "noon" → 720, unknown → null. */
export function keywordMinute(name) {
  const v = KEYWORDS[String(name).toLowerCase()];
  return v == null ? null : v;
}

// ─── day/night classification + sky phase ────────────────────────────────────

/** True when the minute-of-day falls in the night window [18:00, 06:00). */
export function isNight(minuteOfDay) {
  const m = wrapDay(minuteOfDay);
  return m < DAY_START_MIN || m >= DAY_END_MIN;
}

/**
 * skyPhase(minuteFloat) → { day, L, ang }
 * Pure replacement for the old `c = t % NIGHT_CYCLE` phase math (world.js).
 *   day — is the sun up?
 *   L   — day-light intensity: sine bump 0→1→0 across daytime, flat 0 at night.
 *   ang — sun (daytime) / moon (night) arc angle, sweeping 0→π across each half.
 * Continuous (L→0) across both the 06:00 and 18:00 boundaries — no visual pop.
 */
export function skyPhase(minuteFloat) {
  const m = wrapDay(minuteFloat);
  const day = m >= DAY_START_MIN && m < DAY_END_MIN;
  if (day) {
    const dayT = (m - DAY_START_MIN) / DAY_SPAN;                 // 0..1 across the day
    return { day: true, L: Math.max(0, Math.min(1, Math.sin(dayT * Math.PI))), ang: dayT * Math.PI };
  }
  const fromDusk = (((m - DAY_END_MIN) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const nightT = fromDusk / NIGHT_SPAN;                          // 0..1 from dusk to dawn
  return { day: false, L: 0, ang: nightT * Math.PI };
}

// ─── makeWorldClock ──────────────────────────────────────────────────────────

/**
 * makeWorldClock({ stepSec, startMinute?, maxDt? }) → world clock.
 *   total         — monotonic integer in-game minutes since world start (the authority).
 *   alpha         — sub-minute fraction [0,1) for smooth sky interpolation (cosmetic, unsynced).
 *   minuteOfDay() — total mod 1440 (drives HH:MM + sky).
 *   day()         — floor(total / 1440) (day counter).
 *   advance(dt, onMinute?) — fixed-step advance; fires onMinute(newTotal) once per whole in-game
 *                            minute crossed. Returns the current total.
 *   setTotal(n)   — hard-set the clock (used by /time set and by co-op host reconcile);
 *                   resets the sub-minute accumulator so the snap is clean.
 */
export function makeWorldClock({ stepSec, startMinute = 0, maxDt = 0.05 } = {}) {
  if (!(stepSec > 0)) throw new RangeError(`makeWorldClock: stepSec must be > 0, got ${stepSec}`);
  const clock = makeClock({ step: stepSec, maxDt });
  let total = Math.max(0, Math.floor(startMinute));
  const wc = {
    alpha: 0,
    get total() { return total; },
    minuteOfDay() { return wrapDay(total); },
    day() { return Math.floor(total / MINUTES_PER_DAY); },
    advance(dt, onMinute) {
      clock.advance(dt, () => { total += 1; if (onMinute) onMinute(total); });
      wc.alpha = clock.alpha();
      return total;
    },
    setTotal(n) { total = Math.max(0, Math.floor(n)); clock.reset(); wc.alpha = 0; },
  };
  return wc;
}
