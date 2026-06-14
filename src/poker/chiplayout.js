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

// BET PILE: a real TOSSED HEAP — chips thrown into a small mound, landing ON each other (not laid flat in a
// tidy row where their faces z-fight). Each chip drops at a random spot in a tight, capped disc; if it lands
// on chips already there it RESTS on the highest of them (genuine stacking → height, no texture overlap).
// Denominations are shuffled through the pile (seeded) so the colours mix and it reads hand-tossed, not
// machine-sorted; a bigger bet mounds TALLER inside the same small footprint (juice, never sprawls into the
// pot/neighbours). Seeded → deterministic (no per-frame shimmer). Returns { denom, x, y, z, rot, tiltX, tiltZ }.
export function pileLayout(chipSet, opts = {}) {
  const { seed = 1 } = opts;
  const rnd = mulberry32(seed);
  const items = [];
  for (const denom of DENOMS) { let n = (chipSet && chipSet[denom]) || 0; while (n-- > 0) items.push(denom); }
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = items[i]; items[i] = items[j]; items[j] = t; } // seeded shuffle → tossed, mixed colours
  const N = items.length;
  const R = Math.min(CHIP_R * 2.2, CHIP_R * (0.7 + 0.5 * Math.sqrt(Math.max(0, N - 1)))); // small, capped footprint
  const ON = (CHIP_R * 1.55) ** 2;                     // a chip this close to another lands ON it
  const RISE = CHIP_T + CHIP_GAP;
  const placed = [], out = [];
  for (let i = 0; i < N; i++) {
    const rad = R * Math.pow(rnd(), 0.65);             // centre-biased → it mounds toward the middle
    const ang = rnd() * Math.PI * 2;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    let y = 0;                                          // rest on the HIGHEST chip we overlap → stacked, not interpenetrating
    for (const p of placed) { if ((p.x - x) ** 2 + (p.z - z) ** 2 < ON && p.y + RISE > y) y = p.y + RISE; }
    placed.push({ x, z, y });
    out.push({
      denom: items[i], x, z, y,
      rot: rnd() * Math.PI * 2,
      tiltX: (rnd() - 0.5) * 0.16, tiltZ: (rnd() - 0.5) * 0.16, // more lean → tossed, not a neat stack
    });
  }
  return out;
}
