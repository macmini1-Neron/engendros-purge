// Diff two poker view/chip snapshots → an ordered list of discrete presentation
// events. PURE (no THREE/DOM): the same host-authoritative snapshots produce the
// same events on every client, so animation/audio choreography needs no extra
// network traffic. The renderer consumes these; it never invents game state.
//
// Event shapes:
//   { t:'boardCard', index }                         a community card turned up
//   { t:'holeReveal', id, index }                    a hole card shown at showdown
//   { t:'chipMove', from, to, moves:{denom:count} }  physical chips relocated
//   { t:'potAward', id, amount, net:boolean }        pot pushed to a winner;
//                                                     net=true ONLY if amount > that
//                                                     player's contribution (research §E:
//                                                     never celebrate a refund/sub-stake split)
import { DENOMS } from './chipbank.js';

const cardKey = (c) => c.r + c.s;

function denomDelta(before = {}, after = {}) {
  const moves = {};
  for (const d of DENOMS) { const g = (after[d] || 0) - (before[d] || 0); if (g > 0) moves[d] = g; }
  return Object.keys(moves).length ? moves : null;
}

export function derivePokerEvents(prevView, nextView, prevChips, nextChips, result) {
  const ev = [];
  const pv = prevView || { board: [], seats: [] }, nv = nextView || { board: [], seats: [] };

  // community cards added since last snapshot
  for (let i = (pv.board || []).length; i < (nv.board || []).length; i++) ev.push({ t: 'boardCard', index: i });

  // hole cards newly visible (showdown)
  const ph = new Map((pv.seats || []).map((s) => [s.id, s.hole ? s.hole.map(cardKey).join('') : '']));
  for (const s of nv.seats || []) {
    const before = ph.get(s.id) || '';
    if (s.hole && s.hole.map(cardKey).join('') !== before) s.hole.forEach((_, i) => ev.push({ t: 'holeReveal', id: s.id, index: i }));
  }

  // seats that just folded → muck animation (their cards flick away). Require the seat to have EXISTED
  // and been live in the previous snapshot, so a late-joiner / full resync doesn't muck seats that
  // folded before this client connected (a seat absent from prevView would otherwise spuriously emit).
  const pfold = new Map((pv.seats || []).map((s) => [s.id, !!s.folded]));
  for (const s of nv.seats || []) if (s.folded && pfold.has(s.id) && !pfold.get(s.id)) ev.push({ t: 'fold', id: s.id });

  // physical chip relocations: any seat whose bet grew (stack shrank) → chips to its bet/pot
  if (prevChips && nextChips) {
    for (const id in nextChips.bets || {}) {
      const moves = denomDelta(prevChips.bets?.[id], nextChips.bets?.[id]);
      if (moves) ev.push({ t: 'chipMove', from: id, to: 'pot', moves });
    }
    const potMoves = denomDelta(prevChips.pot, nextChips.pot);
    if (potMoves && !ev.some((e) => e.t === 'chipMove')) ev.push({ t: 'chipMove', from: 'bets', to: 'pot', moves: potMoves });
  }

  // pot award + NET gate (the ethical guardrail, research §E)
  if (result && result.winnings) {
    const contributed = result.contributed || {};
    for (const id in result.winnings) {
      const amount = result.winnings[id] || 0;
      if (amount > 0) ev.push({ t: 'potAward', id, amount, net: amount > (contributed[id] || 0) });
    }
  }
  return ev;
}
