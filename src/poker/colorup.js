// Value-neutral consolidation: trade a player's surplus of small chips for fewer
// large chips against the dealer float, so the REAL physical count stays bounded
// over a long session (a real casino "color up"). Reuses chipbank's exact-change
// machinery; the inverse of makeChange's break-down. Conserves total value.
import { DENOMS, value, exactSubset, addSet, subSet, cloneSet } from './chipbank.js';

const ASC = [...DENOMS].sort((a, b) => a - b);

export function colorUp(set0, float0) {
  let set = cloneSet(set0), float = cloneSet(float0);
  // Walk small→large; whenever the player holds enough small chips to form one
  // larger denom AND the float can supply that larger chip, swap them.
  for (let i = 0; i < ASC.length - 1; i++) {
    const big = ASC[i + 1];
    let guard = 1000;
    while (guard-- > 0) {
      const need = exactSubset(set, big);          // `big` worth of the player's chips
      if (!need || !(float[big] > 0)) break;
      if (need[big]) break;                        // never consume the very chip we're making
      set = subSet(set, need);
      set = addSet(set, { [big]: 1 });
      float = addSet(float, need);
      float = subSet(float, { [big]: 1 });
    }
  }
  return { set, float };
}

export { value }; // re-export for convenience in callers that already import colorUp
