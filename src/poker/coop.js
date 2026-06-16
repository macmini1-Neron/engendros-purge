// Pure co-op poker lobby helpers (no THREE/DOM) — node-testable. Centralizes the buy-in tiers and
// the affordability rule used by the lobby ANTE/ACCEPT gate (mp.js), the host deal (poker-table.js),
// and the client entry guard, so all three agree.
//
// $0 is a FREE practice table — no bank movement (poker-table._spend(0) is a no-op), so testing and
// broke players are never blocked; the rest are real-bank winner-takes-all buy-ins.
export const POKER_BUYIN_TIERS = [0, 500, 2000, 10000];

// Can this player ante the buy-in? Free ($0) is always allowed; otherwise their bank must cover it.
export const canAnte = (bank, buyIn) => !(buyIn | 0) || (bank | 0) >= (buyIn | 0);
