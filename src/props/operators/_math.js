// _math.js — tiny pure helpers shared by operators (no THREE; the game's
// util.js pulls in three, so operators keep their own copies to stay node-testable).
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
