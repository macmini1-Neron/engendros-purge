// framepacing.js — delta-time smoothing via vsync snapping, to kill frame-pacing judder.
//
// PURE (no THREE, no DOM) → importable directly from node tests. Sibling of simclock.js.
//
// Problem: on some platforms — notably Chrome on Windows behind the DWM compositor —
// requestAnimationFrame delivers frame TIMESTAMPS that jitter by a few ms even when the
// GPU is nowhere near saturated. The presents are regular; the `t` passed to the rAF
// callback wobbles (main-thread scheduling). A variable-timestep game multiplies all
// movement by dt = t - lastT, so that wobble turns into visible micro-stutter (judder).
// It is worst at high refresh: one frame at 165 Hz is ~6 ms, so a ±2 ms wobble is a
// THIRD of the frame. macOS hands out a near-perfect cadence, so the identical code looks
// smooth there even on weaker hardware — which is exactly the "fast PC stutters, slow Mac
// is smooth" signature this module addresses.
//
// Fix (Glaiel-style "snap + carry"):
//   1. Estimate the true vsync interval from a window of recent dts (the median is robust
//      to jitter and the odd dropped frame) and snap it to the nearest STANDARD refresh
//      rate, then LOCK it with hysteresis so the base does not wobble frame-to-frame.
//   2. Snap each raw dt to the nearest whole multiple of that locked base.
//   3. Carry the rounding error so the smoothed deltas still sum to real wall-clock time
//      (no sim / day-night drift) — capped at one frame and never emitting a ≤0 dt.
//
// Safe-on-Mac by construction: when frames already arrive on a clean cadence, every dt is
// within a hair of 1×base, so the snap is a no-op. This can never make a smooth machine
// worse — it only removes wobble that was already there.
//
// Safe-on-VRR by construction too: a base only ever locks onto a recognised STANDARD refresh
// (see stableBase). An adaptive-sync panel (G-Sync / FreeSync) whose presents genuinely vary
// with render load never matches a standard rate, so it never locks and every frame passes
// through untouched — we refuse to flatten real-variable presents onto a frozen grid.
//
// Usage:
//   import { makeFramePacer } from './framepacing.js';
//   const pacer = makeFramePacer();
//   const smoothDt = pacer.smooth(rawDt);                 // in the frame loop
//   pacer.hz / pacer.jitterMs / pacer.outJitterMs          // live diagnostics

// Common display refresh rates, deliberately kept WELL-SEPARATED (each ≥14% from its
// neighbours) so the median estimate snaps unambiguously even under heavy jitter. Adjacent
// rates like 160 vs 165 are omitted on purpose — within frame jitter they're indistinguishable,
// and a near-miss (e.g. a real 75 Hz panel snapping to 72) costs only a sub-percent time error
// while still giving a perfectly stable, flat cadence.
const KNOWN_HZ = [30, 60, 72, 90, 120, 144, 165, 240, 360];
const KNOWN_S = KNOWN_HZ.map((h) => 1 / h);

const WARM_FRAMES = 12;   // samples before the first base lock
const LOCK_FRAMES = 20;   // a new candidate must persist this many frames before we switch base

function median(a) {
  const s = a.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) * 0.5;
}

function stddevMs(a) {
  const n = a.length;
  if (n < 2) return 0;
  let sum = 0;
  for (const v of a) sum += v;
  const mean = sum / n;
  let varc = 0;
  for (const v of a) varc += (v - mean) * (v - mean);
  return Math.sqrt(varc / n) * 1000;
}

// Snap an estimated interval to the nearest STANDARD refresh rate within `tol`. We only ever
// lock onto a recognised fixed rate: if nothing standard is close — an adaptive-sync display
// (VRR / G-Sync / FreeSync) whose real present intervals genuinely vary with render load, or an
// exotic non-standard refresh — return 0 so updateLock() refuses to lock and smooth() passes
// frames through untouched. Snapping a genuinely-variable VRR stream onto a frozen grid would
// REINTRODUCE the judder this module exists to remove, so "no clean cadence" must mean "no-op".
function stableBase(est, tol = 0.08) {
  let best = 0, bestErr = Infinity;
  for (const s of KNOWN_S) {
    const e = Math.abs(s - est);
    if (e < bestErr && e <= est * tol) { bestErr = e; best = s; }
  }
  return best;   // 0 ⇒ no standard rate matched ⇒ do not lock (VRR / non-standard panel)
}

// Equality test for two locked-base candidates. Both are now always exact KNOWN_S floats — VRR /
// non-standard medians no longer lock (stableBase returns 0 there) — so this is effectively `===`
// with a 0.1% guard against any floating-point dust in the division.
function nearBase(a, b) { return b > 0 && Math.abs(a - b) <= b * 1e-3; }

/**
 * makeFramePacer({ histLen?, minHz?, maxHz? }) → pacer
 *
 * @param {number} [histLen=60]  Samples kept for the vsync estimate + jitter readout.
 * @param {number} [minHz=30]    Slowest refresh the base lock tracks; a slower frame just won't
 *                                snap, it does NOT drop the lock.
 * @param {number} [maxHz=360]   Fastest refresh the base lock tracks.
 * @param {number} [pauseS=0.5]  Only a gap LONGER than this (a real tab-out / pause) resets the
 *                                lock. A mere hitch (one GC / dropped frame) keeps it.
 *
 * pacer.smooth(rawDt) → number
 *   Raw rAF dt (seconds) in, smoothed dt (seconds) out. Snaps to the nearest whole multiple
 *   of the locked vsync interval; leaves genuinely irregular frames (real stalls, tab-out)
 *   alone so the sim still sees them.
 *
 * pacer.vsync  — locked display interval in seconds (0 until warmed up; stays 0 on a VRR /
 *                non-standard panel, where pacing is a pass-through no-op).
 * pacer.hz     — locked refresh in Hz (0 until warmed up / on a VRR / non-standard panel).
 * pacer.jitterMs    — stddev of recent RAW dts in ms (the problem).
 * pacer.outJitterMs — stddev of recent SMOOTHED dts in ms (≪ jitterMs when it is working).
 * pacer.reset() — clear history + carry + lock (call on state transitions / pause).
 */
export function makeFramePacer({ histLen = 60, minHz = 30, maxHz = 360, pauseS = 0.5 } = {}) {
  const raw = [];          // recent raw dts (s) — base estimate + jitter readout
  const out = [];          // recent smoothed dts (s) — diagnostic only
  let lockedBase = 0;      // the vsync interval we are currently snapping to (s)
  let candBase = 0;        // a different candidate awaiting confirmation
  let candCount = 0;       // consecutive frames `candBase` has held
  let err = 0;             // running time debt = Σ(raw) − Σ(out); kept within ±base
  const minStep = 1 / maxHz, maxStep = 1 / minHz;

  function record(v) {
    out.push(v);
    if (out.length > histLen) out.shift();
    return v;
  }

  function reset() {
    raw.length = 0; out.length = 0;
    lockedBase = 0; candBase = 0; candCount = 0; err = 0;
  }

  function updateLock() {
    if (raw.length < WARM_FRAMES) return;
    const cand = stableBase(median(raw));
    if (!(cand >= minStep && cand <= maxStep)) return;
    if (lockedBase === 0) { lockedBase = cand; return; }          // first lock
    if (nearBase(cand, lockedBase)) { candBase = 0; candCount = 0; return; }
    // Hysteresis: only switch once a different candidate has persisted long enough.
    if (nearBase(cand, candBase)) {
      if (++candCount >= LOCK_FRAMES) { lockedBase = cand; candBase = 0; candCount = 0; }
    } else { candBase = cand; candCount = 1; }
  }

  return {
    smooth(rawDt) {
      // First frame / real pause / tab-out / garbage value → pass through and DROP the lock, so
      // we never snap a multi-second gap to a vsync multiple. A mere hitch (one slow frame up to
      // pauseS) is NOT a reset — it flows through the normal path below and keeps the lock, so a
      // stuttery machine (the whole point of this) doesn't re-warm its lock on every GC pause.
      if (!(rawDt > 0) || rawDt > pauseS) { reset(); return rawDt; }

      raw.push(rawDt);
      if (raw.length > histLen) raw.shift();
      updateLock();
      if (lockedBase === 0) return record(rawDt);   // not warmed up yet

      const base = lockedBase;
      const k = Math.max(1, Math.round(rawDt / base));
      const cand = k * base;
      // Only snap when rawDt is within half a step of a clean multiple; a frame further out
      // is a real irregular frame (long stall) and is left as-is so the sim sees the truth.
      const snapped = (Math.abs(cand - rawDt) <= base * 0.5) ? cand : rawDt;

      // Carry the rounding error. err telescopes to Σ(raw) − Σ(out); cap it at one frame so a
      // pathological stream can't drift unboundedly, and correct by lengthening/shortening
      // the output — but never emit a ≤0 dt (that would itself be a visible hitch).
      err += rawDt - snapped;
      let corr = 0;
      if (err > base) corr = err - base;          // behind → lengthen this frame to catch up
      else if (err < -base) corr = err + base;    // ahead  → shorten this frame
      let outDt = snapped + corr;
      if (outDt <= 0) outDt = base;
      err -= (outDt - snapped);                   // account for what we actually emitted

      return record(outDt);
    },

    get vsync() { return lockedBase; },
    get hz() { return lockedBase > 0 ? Math.round(1 / lockedBase) : 0; },
    get jitterMs() { return stddevMs(raw); },
    get outJitterMs() { return stddevMs(out); },

    reset,
  };
}
