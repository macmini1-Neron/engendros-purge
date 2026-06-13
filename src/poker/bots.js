// Practice-mode AI policy. Pure: (private view, legal actions, rng) -> a legal action.
// Heuristic only — hand strength (preflop chart-ish / postflop Monte-Carlo equity) weighed
// against pot odds and position, with a little bounded bluffing. Bots have no special engine
// path: their action goes through holdem.applyAction exactly like a human's.
import { equity } from './odds.js';

const ITERS = 60; // Monte-Carlo samples per decision — cheap; bots don't need precision

// Rough preflop strength in [0,1].
function preflopStrength(hole) {
  const [a, b] = hole.map((c) => c.r);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  const suited = hole[0].s === hole[1].s;
  if (a === b) return Math.min(1, 0.52 + (a - 2) / 24);           // pairs: 22≈0.52 … AA≈1.0
  let s = (hi + lo) / 40;                                          // high-card weight
  if (suited) s += 0.07;
  if (hi - lo <= 2) s += 0.05;                                     // connected-ish
  if (hi === 14) s += 0.04;                                        // ace kicker
  return Math.min(0.95, s);
}

function strengthOf(view, hole, rng) {
  if (view.board.length === 0) return preflopStrength(hole);
  const nOpp = Math.max(1, view.seats.filter((s) => !s.folded && s.hasCards && s.hole === null).length);
  const e = equity(hole, view.board, nOpp, ITERS, rng);
  return e.win + e.tie * 0.5;
}

function raiseTo(legal, pot, frac, rng) {
  const want = legal.minRaiseTo + Math.round(frac * (pot + legal.minRaiseTo));
  const to = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, want));
  return { type: 'raise', to };
}

// view = privateView(state, botId); legal = legalActions(state) for that seat.
export function botAction(view, legal, rng) {
  if (!legal) return { type: 'check' };
  const me = view.seats.find((s) => s.id === legal.seat);
  const hole = me && me.hole ? me.hole : [];
  const strength = hole.length === 2 ? strengthOf(view, hole, rng) : 0.2;
  const pot = view.pot || 0;
  const r = rng();

  if (!legal.canCall) {
    // no bet to call: check, value-bet when strong, occasionally bluff
    if (legal.canRaise && strength > 0.66 && r < 0.7) return raiseTo(legal, pot, 0.6, rng);
    if (legal.canRaise && strength < 0.2 && r < 0.08) return raiseTo(legal, pot, 0.4, rng);
    return { type: 'check' };
  }

  // facing a bet: compare strength to pot odds
  const potOdds = legal.callAmount / (pot + legal.callAmount);
  if (legal.canRaise && strength > 0.82 && r < 0.6) return raiseTo(legal, pot, 0.8, rng);
  if (legal.canRaise && strength < 0.14 && r < 0.05) return raiseTo(legal, pot, 0.5, rng); // bluff
  if (strength > potOdds + 0.04) return { type: 'call' };
  return { type: 'fold' };
}
