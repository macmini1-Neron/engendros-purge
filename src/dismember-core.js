// dismember-core.js — THREE-free dismemberment bit math, shared by engendro.js.
//
// Pure (no THREE / DOM) so it is node-testable AND worker-safe. The co-op limb-replication
// bitmask lives here: the host sends limbFlags(rig) in esnap/espawn (`lf`) so clients and
// late-joiners hide the EXACT same severed parts — the highest-risk dismemberment netcode,
// so it gets unit tests (engendro.js itself imports THREE and can't run under node).

// Severable parts and their bit in the limb-flag int sent over the wire as `lf`.
export const SEVER_BIT = { head: 1, armL: 2, armR: 4, legL: 8, legR: 16 };
export const SEVERABLE_ORDER = ['head', 'armL', 'armR', 'legL', 'legR'];

// Encode the set of SEVERED (severable && !alive) parts to an int. `parts` is any array of
// { name, severable, alive } — works on a live THREE rig or a plain test stub. Non-severable
// parts (the torso) are never flagged even when "dead".
export function limbFlagsFromParts(parts) {
  let f = 0;
  for (const p of parts) if (p.severable && !p.alive) f |= (SEVER_BIT[p.name] || 0);
  return f;
}

// Is part `name` flagged severed in limb-flag int `f`?
export function isSevered(f, name) { return !!(f & (SEVER_BIT[name] || 0)); }
