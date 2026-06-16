// Pure card → texture-atlas mapping for the 3D poker table. No THREE, no DOM.
// The 52 card faces are drawn once into a 13-column (ranks 2..A) x 4-row (suits c,d,h,s) atlas;
// each card mesh samples its own cell. Keeping the index/UV math pure makes the off-by-one that
// would silently show the wrong face unit-testable in node.
const SUIT_ORDER = ['c', 'd', 'h', 's'];
export const ATLAS_COLS = 13; // ranks 2..14 (A)
export const ATLAS_ROWS = 4;  // suits c, d, h, s

export function cardAtlasIndex(card) {
  const col = card.r - 2;                  // 2 → 0 ... 14(A) → 12
  const row = SUIT_ORDER.indexOf(card.s);  // c → 0 ... s → 3
  return row * ATLAS_COLS + col;
}

export function atlasCell(index) {
  return { col: index % ATLAS_COLS, row: Math.floor(index / ATLAS_COLS) };
}

// Normalised UV rectangle for a cell: { u0, v0, u1, v1 }, each cell 1/cols x 1/rows.
export function atlasUVRect(index) {
  const { col, row } = atlasCell(index);
  return {
    u0: col / ATLAS_COLS, u1: (col + 1) / ATLAS_COLS,
    v0: row / ATLAS_ROWS, v1: (row + 1) / ATLAS_ROWS,
  };
}
