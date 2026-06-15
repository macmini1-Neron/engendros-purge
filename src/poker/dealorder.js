// Pure dealing-order math (no THREE/DOM) for the hole-card deal-in animation.
// Mirrors a real dealer's pitch: TWO passes, clockwise from the seat left of the
// button (the small blind in 3+-handed play; the big blind heads-up), with the
// button receiving the last card of each pass.
// Seats that were not dealt in (folded/empty/busted → no cards) are skipped.
// Deterministic from (button, n, hasCards) → every co-op client derives the same
// sequence from its host snapshot, so no extra network traffic is needed.
//
//   dealOrder(button, n, hasCards) -> [{ seat, pass }, ...]   in pitch order
//
// `pass` is 0 for the first card, 1 for the second. The array index is the stagger
// index (per-card delay + the synced deal click).
export function dealOrder(button, n, hasCards) {
  if (!Number.isFinite(n) || n <= 0) return [];
  const btn = ((button % n) + n) % n;                 // normalise into [0, n)
  const active = [];
  for (let k = 1; k <= n; k++) {                       // start LEFT of the button, button last
    const seat = (btn + k) % n;
    if (!hasCards || hasCards[seat]) active.push(seat);
  }
  const order = [];
  for (let pass = 0; pass < 2; pass++) for (const seat of active) order.push({ seat, pass });
  return order;
}
