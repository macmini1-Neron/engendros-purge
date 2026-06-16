// Pure layout math for a real ChipSet → exact per-chip placements. No THREE.
// Lifted out of poker-chips.js so it is node-testable. Mirrors the old grid:
// one column per denomination, COL_CAP chips/column, overflow wraps to more
// columns, rows wrap back in depth. Optional SEEDED jitter (research C4: messy
// stacks read more physical than a perfect grid) — seeded so a rebuild at the
// same state is stable (no shimmer).
import { DENOMS, HOUSE_SKIN } from './chipbank.js';

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

// `layoutRef` (optional) fixes the COLUMN SET + positions from a reference ChipSet (e.g. your FULL stack)
// while `chipSet` only decides how many chips are actually placed per column (≤ ref). So as a denomination
// drains during a raise preview, its column SHORTENS in place instead of vanishing and re-centering the
// survivors — kills the per-slider-tick lateral jitter. Omit layoutRef and ref===chipSet → identical output.
export function layoutChips(chipSet, opts = {}) {
  const { jitter = 0, seed = 1, layoutRef = null } = opts;
  const rnd = mulberry32(seed);
  const ref = layoutRef || chipSet;
  const cols = [];
  for (const denom of DENOMS) {
    let rem = (ref && ref[denom]) || 0;
    while (rem > 0) { const n = Math.min(rem, COL_CAP); cols.push({ denom, n }); rem -= n; }
  }
  const toPlace = {};                                            // how many chips of each denom to actually render (capped by chipSet)
  for (const d of DENOMS) toPlace[d] = (chipSet && chipSet[d]) || 0;
  const rows = Math.ceil(cols.length / COLS_PER_ROW) || 1;
  const out = [];
  cols.forEach((c, idx) => {
    const row = Math.floor(idx / COLS_PER_ROW);
    const inRow = Math.min(COLS_PER_ROW, cols.length - row * COLS_PER_ROW);
    const baseX = (idx % COLS_PER_ROW - (inRow - 1) / 2) * COL_GAP;
    const baseZ = (row - (rows - 1) / 2) * ROW_GAP;
    const have = Math.max(0, Math.min(c.n, toPlace[c.denom]));   // this column renders up to c.n, but no more than remain
    toPlace[c.denom] -= have;
    for (let i = 0; i < have; i++) {
      const jx = jitter ? (rnd() - 0.5) * 2 * jitter : 0;
      const jz = jitter ? (rnd() - 0.5) * 2 * jitter : 0;
      const jr = jitter ? (rnd() - 0.5) * 0.14 : 0; // ±~4° lean
      out.push({ denom: c.denom, x: baseX + jx, y: i * (CHIP_T + CHIP_GAP), z: baseZ + jz, rot: jr });
    }
  });
  return out;
}

// Tag each placement (from layoutChips/pileLayout) with a render skin, consuming a per-denom FIFO queue
// built from `skinMap` ({skin:{denom:count}}). Deterministic skin order (ids sorted, 'house' last) → chips
// of different skins INTERLEAVE within the same denom column/heap (one coherent mixed pile). Pure, testable.
// The placement count per denom must equal skinMap's per-denom total (the layout is built from that aggregate).
export function assignSkins(placements, skinMap) {
  const skins = Object.keys(skinMap || {}).sort((a, b) => ((a === HOUSE_SKIN) - (b === HOUSE_SKIN)) || (a < b ? -1 : a > b ? 1 : 0));
  const queue = {}, cur = {};
  for (const d of DENOMS) {
    queue[d] = []; cur[d] = 0;
    for (const sk of skins) { const n = (skinMap[sk] && skinMap[sk][d]) || 0; for (let i = 0; i < n; i++) queue[d].push(sk); }
  }
  return placements.map((p) => ({ ...p, skin: (queue[p.denom] && queue[p.denom][cur[p.denom]++]) || HOUSE_SKIN }));
}

// BET PILE: a real tossed SPLASH, physically plausible. Settled poker chips lie nearly FLAT — they're spun to
// random facings (so the pile looks hand-thrown, not machine-stacked) but they do NOT stand on edge or float at
// steep angles. Each chip drops at a ~uniform-random spot in a disc and RESTS a clean whole-thickness on top of
// any chip it overlaps (real stacking, no interpenetration). The disc SPREADS with the count — a big bet splashes
// across more felt and only piles a few chips high, like real chips do — capped so it never blankets the table or
// reaches the pot/neighbours. Denominations seed-shuffled so colours mix. Seeded → deterministic.
// Returns { denom, x, y, z, rot, tiltX, tiltZ } per chip.
export function pileLayout(chipSet, opts = {}) {
  const { seed = 1 } = opts;
  const rnd = mulberry32(seed);
  const items = [];
  for (const denom of DENOMS) { let n = (chipSet && chipSet[denom]) || 0; while (n-- > 0) items.push(denom); }
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = items[i]; items[i] = items[j]; items[j] = t; } // seeded shuffle → tossed, mixed colours
  // cap the splash: the placement pass below is O(N²), and a pathological all-in (thousands of $5 chips) would be
  // millions of overlap checks per rebuild. A pile is visually saturated long before this, and the renderer caps
  // each denom at 256 regardless — so truncate the (already-shuffled, unbiased) chip list to a sane ceiling.
  const PILE_CAP = 240;
  if (items.length > PILE_CAP) { console.warn('[poker] pileLayout: ' + items.length + ' chips → capped to ' + PILE_CAP + ' for the splash'); items.length = PILE_CAP; }
  const N = items.length;
  const R = Math.min(CHIP_R * 4.5, CHIP_R * (0.9 + 0.42 * Math.sqrt(Math.max(0, N - 1)))); // spreads with the count, capped
  const ON = (CHIP_R * 1.5) ** 2;                      // a chip landing this close to another rests ON it
  const RISE = CHIP_T + CHIP_GAP;
  const placed = [], out = [];
  for (let i = 0; i < N; i++) {
    const rad = R * Math.sqrt(rnd());                  // ~uniform over the disc → spreads + settles flat (not a tight tower)
    const ang = rnd() * Math.PI * 2;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    let y = 0;                                          // rest on the HIGHEST chip we overlap → stacked, never interpenetrating
    for (const p of placed) { if ((p.x - x) ** 2 + (p.z - z) ** 2 < ON && p.y + RISE > y) y = p.y + RISE; }
    placed.push({ x, z, y });
    out.push({
      denom: items[i], x, z, y,
      rot: rnd() * Math.PI * 2,                         // spun to a random facing — chips ARE turned differently
      tiltX: (rnd() - 0.5) * 0.05, tiltZ: (rnd() - 0.5) * 0.05, // settled NEARLY FLAT (~1.5°) — never on edge / floating
    });
  }
  return out;
}
