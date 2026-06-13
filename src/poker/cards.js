// Pure card/deck primitives for Texas Hold'em. No THREE, no DOM.
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // J=11 Q=12 K=13 A=14
export const SUITS = ['c', 'd', 'h', 's'];

const RANK_CH = { 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const CH_RANK = { T: 10, J: 11, Q: 12, K: 13, A: 14 };

export function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  return d;
}

export function cardStr(c) {
  return (RANK_CH[c.r] || String(c.r)) + c.s;
}

export function parseCard(str) {
  const rc = str.slice(0, -1);
  const s = str.slice(-1);
  const r = CH_RANK[rc] ?? Number(rc);
  return { r, s };
}

// Fisher–Yates using an injected rng() -> [0,1). Returns a new array; input untouched.
export function shuffle(deck, rng) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = d[i]; d[i] = d[j]; d[j] = t;
  }
  return d;
}

// Seeded RNG (mulberry32). Returns a function () -> [0,1). Same seed ⇒ same sequence.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
