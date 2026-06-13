// Pure chip-denomination math for the 3D poker table. No THREE, no DOM.
// A bet/stack/pot is an integer chip amount; breakdown() turns it into a deterministic, EXACT
// stack of physical chips (largest denominations first). The unit (1) chip guarantees any
// non-negative integer is representable, so "I added N" is always physically true on the felt.
export const DENOMS = [1000, 500, 100, 25, 5, 1];

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
