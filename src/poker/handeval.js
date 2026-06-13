// Pure poker hand evaluator. No THREE, no DOM.
export const CATS = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
];

// Total order over hand ranks: >0 means a beats b.
export function compare(a, b) {
  if (a.cat !== b.cat) return a.cat - b.cat;
  const n = Math.max(a.ranks.length, b.ranks.length);
  for (let i = 0; i < n; i++) {
    const d = (a.ranks[i] || 0) - (b.ranks[i] || 0);
    if (d) return d;
  }
  return 0;
}

// Score exactly five cards -> { cat, ranks }.
function score5(cards) {
  const rs = cards.map((c) => c.r).sort((x, y) => y - x);
  const suits = cards.map((c) => c.s);
  const isFlush = suits.every((s) => s === suits[0]);

  const cnt = new Map();
  for (const r of rs) cnt.set(r, (cnt.get(r) || 0) + 1);
  // groups sorted by count desc, then rank desc
  const groups = [...cnt.entries()].sort((g, h) => h[1] - g[1] || h[0] - g[0]);

  // straight detection (needs 5 distinct ranks); Ace can be low for the wheel
  const uniq = [...new Set(rs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2) straightHigh = 5;
  }

  if (isFlush && straightHigh) return { cat: 8, ranks: [straightHigh] };
  if (groups[0][1] === 4) return { cat: 7, ranks: [groups[0][0], groups[1][0]] };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { cat: 6, ranks: [groups[0][0], groups[1][0]] };
  if (isFlush) return { cat: 5, ranks: rs };
  if (straightHigh) return { cat: 4, ranks: [straightHigh] };
  if (groups[0][1] === 3) return { cat: 3, ranks: [groups[0][0], groups[1][0], groups[2][0]] };
  if (groups[0][1] === 2 && groups[1][1] === 2) return { cat: 2, ranks: [groups[0][0], groups[1][0], groups[2][0]] };
  if (groups[0][1] === 2) return { cat: 1, ranks: [groups[0][0], groups[1][0], groups[2][0], groups[3][0]] };
  return { cat: 0, ranks: rs };
}

// all k-combinations of an array (as arrays of elements)
function combos(arr, k) {
  const res = [];
  const idx = [];
  (function rec(start) {
    if (idx.length === k) { res.push(idx.map((i) => arr[i])); return; }
    for (let i = start; i < arr.length; i++) { idx.push(i); rec(i + 1); idx.pop(); }
  })(0);
  return res;
}

// Best 5-card hand from any 5..7 cards.
export function evaluate(cards) {
  let best = null;
  if (cards.length === 5) best = score5(cards);
  else for (const five of combos(cards, 5)) {
    const s = score5(five);
    if (!best || compare(s, best) > 0) best = s;
  }
  best.name = CATS[best.cat];
  return best;
}

export const evaluate7 = evaluate;
