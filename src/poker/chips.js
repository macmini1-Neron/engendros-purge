// Pure chip-denomination math for the 3D poker table. No THREE, no DOM.
// A bet/stack/pot is an integer chip amount; breakdown() turns it into a deterministic stack of
// physical chips (largest denominations first). The smallest chip is 5, so amounts are exact when
// they are multiples of 5 (the chip economy's atom); a sub-5 remainder is floored off (real casinos
// hold no sub-chip value). Colour map (in poker-chips.js): 5 white · 10 blue · 20 red · 50 green ·
// 100 black · 500 yellow. (For to-the-chip exactness on every amount, the engine should work in
// 5-unit increments / snap bets to 5 — see the raise UI.)
export const DENOMS = [500, 100, 50, 20, 10, 5];

// Greedy decomposition → [{ denom, count }, ...] descending, no zero-count rows. Exact.
// Non-positive / non-finite amounts yield an empty stack.
export function breakdown(amount) {
  let rem = Math.floor(amount);
  if (!(rem > 0)) return [];
  const rows = [];
  for (const denom of DENOMS) {
    const count = Math.floor(rem / denom);
    if (count > 0) { rows.push({ denom, count }); rem -= denom * count; }
  }
  return rows;
}

export function totalChips(amount) {
  return breakdown(amount).reduce((a, b) => a + b.count, 0);
}
