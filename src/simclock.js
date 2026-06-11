// simclock.js — reusable fixed-step accumulator + render-interpolation helper.
//
// PURE (no THREE, no DOM) — importable directly from node tests.
//
// Motivation: fire, FallingBody physics, and any other sub-system that must be
// deterministic and dt-independent need to tick at a fixed rate regardless of the
// variable-dt game loop (rAF can deliver anything from 4 ms to 50 ms).  The game
// loop stays variable-dt; only sub-systems sub-step via a clock created here.
//
// Pattern proven in tools/destructlab/fallphys.js (stepBody) and promoted here so
// all fixed-rate sub-systems share one well-tested implementation.
//
// Usage:
//   import { makeClock, lerpState } from './simclock.js';
//   const phys = makeClock({ step: 1/120, maxDt: 0.05 });
//   const fire = makeClock({ step: 1/10,  maxDt: 0.05 });
//
//   // in the game frame callback:
//   phys.advance(dt, () => { stepBody(body, phys.step); });
//   fire.advance(dt, () => { tickFire(fire.step); });
//
//   // render-side interpolation (smooth motion between physics ticks):
//   const a   = phys.alpha();
//   const pos = lerpState(prevPos, curPos, a);   // {x,y,z}

// ─── makeClock ────────────────────────────────────────────────────────────────

/**
 * makeClock({ step?, maxDt? }) → clock
 *
 * @param {number} [step=1/120]   Fixed sub-step size in seconds.
 * @param {number} [maxDt=0.05]  Per-call dt clamp.  Individual frames that stall
 *                                (tab hidden, debugger, OS jank) are clamped here
 *                                so the accumulator never grows without bound.
 *                                The max ticks per advance() call is therefore
 *                                bounded: carry_in < step, so max_ticks =
 *                                1 + floor(maxDt / step).
 *
 * clock.advance(dt, tickFn) → number
 *   Adds min(dt, maxDt) to the internal accumulator, then fires tickFn() once per
 *   fixed step while the accumulator remains ≥ step.  Returns the number of ticks
 *   fired this call.  The tickFn receives no arguments — the caller closes over
 *   whatever state it needs.
 *
 * clock.alpha() → [0, 1)
 *   The fractional leftover in the accumulator expressed as a fraction of one step.
 *   Use this to render-interpolate between the previous and current physics state:
 *     renderedPos = lerp(prevPos, curPos, clock.alpha())
 *   This eliminates the "judder" visible when the render rate is not an integer
 *   multiple of the physics rate.
 *
 * clock.reset()
 *   Zero the accumulator (call on game-state transitions to avoid a burst of catch-up
 *   ticks when resuming from pause).
 *
 * clock.step / clock.maxDt — read-only params for downstream code that needs them.
 */
export function makeClock({ step = 1 / 120, maxDt = 0.05 } = {}) {
  if (step <= 0) throw new RangeError(`makeClock: step must be > 0, got ${step}`);
  if (maxDt <= 0) throw new RangeError(`makeClock: maxDt must be > 0, got ${maxDt}`);

  let acc = 0;
  // Hard cap: carry_in < step, so absolute max ticks is 1 + floor(maxDt/step).
  // We enforce this explicitly so a FP edge-case can never run an unbounded loop.
  const maxSubsteps = 1 + Math.floor(maxDt / step);

  return {
    /** The fixed step size this clock was created with (seconds). */
    step,
    /** The per-call dt clamp this clock was created with (seconds). */
    maxDt,

    /**
     * Advance the clock by `dt` seconds, firing `tickFn()` once per fixed step.
     * @param {number} dt       Frame delta-time in seconds (variable, from rAF).
     * @param {function} tickFn Callback fired once per sub-step; receives no args.
     * @returns {number}        Count of ticks fired this call.
     */
    advance(dt, tickFn) {
      acc += Math.min(dt, maxDt);
      let ticks = 0;
      while (acc >= step && ticks < maxSubsteps) {
        acc -= step;
        tickFn();
        ticks++;
      }
      // Guard against floating-point drift pushing acc to a hair below zero.
      if (acc < 0) acc = 0;
      return ticks;
    },

    /**
     * Returns the render-interpolation fraction ∈ [0, 1).
     * Equal to the leftover accumulator divided by the step size.
     */
    alpha() {
      // acc is always in [0, step) after advance(); dividing gives [0, 1).
      // The clamp to [0, 1) is a safety net against ULP-level floating-point slop.
      return Math.max(0, Math.min(acc / step, 1 - Number.EPSILON));
    },

    /** Zero the accumulator.  Call on state transitions (e.g. unpause). */
    reset() {
      acc = 0;
    },
  };
}

// ─── lerpState ────────────────────────────────────────────────────────────────

/**
 * lerpState(prev, cur, alpha) — render-interpolation helper.
 *
 * Interpolates between two snapshots of physics state using the alpha fraction
 * returned by clock.alpha().  Pure — does NOT mutate prev or cur.
 *
 * Supports:
 *   - Scalars:            lerpState(0, 10, 0.5)           → 5
 *   - Numeric-field objects: lerpState({x:0,y:0}, {x:10,y:10}, 0.5) → {x:5,y:5}
 *     (non-numeric fields are copied from `cur` unchanged)
 *
 * @param {number|Object} prev  State at the last completed tick.
 * @param {number|Object} cur   State at the current completed tick.
 * @param {number}        alpha Interpolation fraction from clock.alpha(), ∈ [0, 1).
 * @returns {number|Object}     Interpolated state (new object for object inputs).
 */
export function lerpState(prev, cur, alpha) {
  if (typeof prev === 'number') {
    return prev + (cur - prev) * alpha;
  }
  const out = {};
  for (const k of Object.keys(cur)) {
    const p = prev[k], c = cur[k];
    out[k] = (typeof p === 'number' && typeof c === 'number')
      ? p + (c - p) * alpha
      : c;
  }
  return out;
}
