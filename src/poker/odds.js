// Monte-Carlo equity + textbook draw-outs. No THREE, no DOM.
import { makeDeck, cardStr, shuffle } from './cards.js';
import { evaluate, compare } from './handeval.js';

function stubExcluding(used) {
  const set = new Set(used.map(cardStr));
  return makeDeck().filter((c) => !set.has(cardStr(c)));
}

// Equity of `hole` vs `nOpp` random opponents, given `board` so far.
export function equity(hole, board, nOpp, iters, rng) {
  let win = 0, tie = 0;
  for (let it = 0; it < iters; it++) {
    const d = shuffle(stubExcluding([...hole, ...board]), rng);
    let k = 0;
    const opps = [];
    for (let o = 0; o < nOpp; o++) opps.push([d[k++], d[k++]]);
    const full = board.slice();
    while (full.length < 5) full.push(d[k++]);
    const me = evaluate([...hole, ...full]);
    let better = 0, equal = 0;
    for (const op of opps) {
      const c = compare(evaluate([...op, ...full]), me);
      if (c > 0) better++; else if (c === 0) equal++;
    }
    if (better === 0) { if (equal === 0) win++; else tie++; }
  }
  return { win: win / iters, tie: tie / iters };
}

// Equity of `hole` vs one EXACT opponent hand `opp`, given `board` so far.
export function equityVs(hole, opp, board, iters, rng) {
  let win = 0, tie = 0;
  for (let it = 0; it < iters; it++) {
    const d = shuffle(stubExcluding([...hole, ...opp, ...board]), rng);
    let k = 0;
    const full = board.slice();
    while (full.length < 5) full.push(d[k++]);
    const c = compare(evaluate([...hole, ...full]), evaluate([...opp, ...full]));
    if (c > 0) win++; else if (c === 0) tie++;
  }
  return { win: win / iters, tie: tie / iters };
}

// Count unseen cards that complete a straight-or-better draw (cat >= 4).
export function outs(hole, board) {
  if (hole.length + board.length < 5) return 0; // need 5 cards to evaluate (no draw-outs pre-flop)
  const base = evaluate([...hole, ...board]);
  if (base.cat >= 4) return 0;
  let n = 0;
  for (const c of stubExcluding([...hole, ...board])) {
    if (evaluate([...hole, ...board, c]).cat >= 4) n++;
  }
  return n;
}
