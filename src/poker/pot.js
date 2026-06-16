// Side-pot construction + payout (ties, odd chips). No THREE, no DOM.
import { compare } from './handeval.js';

const CHIP_ATOM = 5;   // smallest chip — pots are split in whole chips, never sub-5 shares

// contribs: [{ seat, committed, folded }] -> [{ amount, eligible:[seat,...] }]
export function buildPots(contribs) {
  const pots = [];
  let players = contribs.filter((p) => p.committed > 0).map((p) => ({ ...p }));
  while (players.length) {
    const min = Math.min(...players.map((p) => p.committed));
    let amount = 0;
    const eligible = [];
    for (const p of players) {
      amount += min;
      p.committed -= min;
      if (!p.folded) eligible.push(p.seat);
    }
    pots.push({ amount, eligible });
    players = players.filter((p) => p.committed > 0);
  }
  return pots;
}

// pots from buildPots; rankOf[seat] = hand rank (non-folded contenders only);
// orderFromButton = seat ids clockwise starting left of the button (odd-chip order).
export function awardPots(pots, rankOf, orderFromButton) {
  const win = {};
  for (const pot of pots) {
    let best = null;
    let winners = [];
    for (const s of pot.eligible) {
      const r = rankOf[s];
      if (!r) continue;
      if (!best || compare(r, best) > 0) { best = r; winners = [s]; }
      else if (compare(r, best) === 0) winners.push(s);
    }
    if (!winners.length) continue;
    // Split in WHOLE CHIPS: each winner gets an equal multiple of the chip atom (5 — the smallest
    // chip), then the remainder is paid one chip at a time by button order. A real pot is always a
    // multiple of 5, so every share comes out a multiple of 5 (no sub-5 oddities like 84/83/83); a
    // sub-atom tail (only from a synthetic non-multiple-of-5 pot) goes whole to the first seat.
    const share = Math.floor(pot.amount / winners.length / CHIP_ATOM) * CHIP_ATOM;
    for (const s of winners) win[s] = (win[s] || 0) + share;
    let odd = pot.amount - share * winners.length;
    const ordered = orderFromButton.filter((s) => winners.includes(s));
    for (let i = 0; odd > 0; i++) {
      const give = Math.min(CHIP_ATOM, odd);
      const s = ordered[i % ordered.length];
      win[s] = (win[s] || 0) + give;
      odd -= give;
    }
  }
  return win;
}
