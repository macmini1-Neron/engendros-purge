// Pure bet-sizing math for the poker betting UI. No THREE, no DOM — node-unit-tested like the rest of
// src/poker/*. Turns the research-backed preset buttons (½/¾/Pot · BB-multiples) and the slider/numeric
// input into a legal raise-TO amount: snapped to the chip atom (5) and clamped into the engine's legal
// [minRaiseTo, maxRaiseTo] range. The UI (poker-ui.js) feeds the result to onAct({type:'raise', to}).
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// round to the nearest multiple of `step` (the smallest chip is 5, so bets move in 5s)
export function snapTo(amount, step = 5) {
  return Math.round(amount / step) * step;
}

// snap to 5, then clamp into the legal raise range (min/max may not be multiples of 5 — they win)
export function clampRaise(amount, { minRaiseTo, maxRaiseTo }, step = 5) {
  return clamp(snapTo(amount, step), minRaiseTo, maxRaiseTo);
}

// postflop pot-fraction raise: raise TO currentBet + fraction*(pot + callAmount), snapped + clamped
export function presetRaiseTo(fraction, ctx) {
  return clampRaise((ctx.currentBet || 0) + fraction * ((ctx.pot || 0) + (ctx.callAmount || 0)), ctx);
}

// preflop open: raise TO a big-blind multiple, snapped + clamped
export function presetRaiseToBB(mult, ctx) {
  return clampRaise(mult * (ctx.bb || 0), ctx);
}

// What a raise-TO actually COSTS from the stack and what STAYS behind — anchored to the player's HUD
// "YOU $" number so the readout reconciles with it. `committed` = chips already pushed this street
// (roundBet: the blind / a call / a prior raise); `behind` = chips still in the stack (the header value).
// cost = raiseTo - committed (the chips that leave the stack now); leaves = behind - cost. This is
// algebraically the same as maxRaiseTo - raiseTo (maxRaiseTo = committed + behind), but expressed
// against the header instead of the committed-inclusive max, which is the whole point: the old readout
// used the max baseline and so never matched the header the player was reading. Clamped to [0, behind].
export function raiseBreakdown(raiseTo, committed = 0, behind = 0) {
  const cost = Math.max(0, Math.min(behind | 0, (raiseTo | 0) - (committed | 0)));
  return { cost, leaves: (behind | 0) - cost };
}
