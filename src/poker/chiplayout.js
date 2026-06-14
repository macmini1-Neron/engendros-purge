// Pure layout math for a real ChipSet → exact per-chip placements. No THREE.
// Lifted out of poker-chips.js so it is node-testable. Mirrors the old grid:
// one column per denomination, COL_CAP chips/column, overflow wraps to more
// columns, rows wrap back in depth. Optional SEEDED jitter (research C4: messy
// stacks read more physical than a perfect grid) — seeded so a rebuild at the
// same state is stable (no shimmer).
import { DENOMS } from './chipbank.js';

export const CHIP_R = 0.020, CHIP_T = 0.0033, CHIP_GAP = 0.0006;
export const COL_CAP = 18;
const COL_GAP = 2 * CHIP_R + 0.0012, ROW_GAP = 2 * CHIP_R + 0.0016, COLS_PER_ROW = 6;

function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function layoutChips(chipSet, opts = {}) {
  const { jitter = 0, seed = 1 } = opts;
  const rnd = mulberry32(seed);
  const cols = [];
  for (const denom of DENOMS) {
    let rem = (chipSet && chipSet[denom]) || 0;
    while (rem > 0) { const n = Math.min(rem, COL_CAP); cols.push({ denom, n }); rem -= n; }
  }
  const rows = Math.ceil(cols.length / COLS_PER_ROW) || 1;
  const out = [];
  cols.forEach((c, idx) => {
    const row = Math.floor(idx / COLS_PER_ROW);
    const inRow = Math.min(COLS_PER_ROW, cols.length - row * COLS_PER_ROW);
    const baseX = (idx % COLS_PER_ROW - (inRow - 1) / 2) * COL_GAP;
    const baseZ = (row - (rows - 1) / 2) * ROW_GAP;
    for (let i = 0; i < c.n; i++) {
      const jx = jitter ? (rnd() - 0.5) * 2 * jitter : 0;
      const jz = jitter ? (rnd() - 0.5) * 2 * jitter : 0;
      const jr = jitter ? (rnd() - 0.5) * 0.14 : 0; // ±~4° lean
      out.push({ denom: c.denom, x: baseX + jx, y: i * (CHIP_T + CHIP_GAP), z: baseZ + jz, rot: jr });
    }
  });
  return out;
}

// SPLASH PILE: chips tossed into a loose heap (NOT tidy columns) — scattered next to each other in a
// cluster whose radius grows with the chip count, each lying flat with a small random facing + tilt and
// a touch of overlap height. Seeded → deterministic (no per-frame shimmer) but reads as "thrown in".
// Returns { denom, x, y, z, rot (Y), tiltX, tiltZ } per chip. Used for the bet-preview / a splashed pot.
export function pileLayout(chipSet, opts = {}) {
  const { seed = 1 } = opts;
  const rnd = mulberry32(seed);
  const items = [];
  for (const denom of DENOMS) { let n = (chipSet && chipSet[denom]) || 0; while (n-- > 0) items.push(denom); }
  const N = items.length;
  const R = CHIP_R * (1.1 + 0.12 * N);                 // cluster radius grows with the bet → bigger pile = more chips
  const out = [];
  for (let i = 0; i < N; i++) {
    const ang = rnd() * Math.PI * 2, rad = R * Math.sqrt(rnd()); // uniform scatter within the disc
    out.push({
      denom: items[i], x: Math.cos(ang) * rad, z: Math.sin(ang) * rad,
      y: rnd() * CHIP_T * 2,                            // low overlapping heap, not a single layer
      rot: rnd() * Math.PI * 2,                         // random facing
      tiltX: (rnd() - 0.5) * 0.16, tiltZ: (rnd() - 0.5) * 0.16, // a few degrees of tilt → tossed look
    });
  }
  return out;
}
