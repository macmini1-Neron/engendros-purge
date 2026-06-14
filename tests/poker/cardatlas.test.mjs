import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck, cardStr } from '../../src/poker/cards.js';
import { ATLAS_COLS, ATLAS_ROWS, cardAtlasIndex, atlasCell, atlasUVRect } from '../../src/poker/cardatlas.js';

test('atlas is 13 columns (ranks) x 4 rows (suits) = 52 cells', () => {
  assert.equal(ATLAS_COLS, 13);
  assert.equal(ATLAS_ROWS, 4);
});

test('cardAtlasIndex maps every card to a unique index in 0..51', () => {
  const idx = makeDeck().map(cardAtlasIndex);
  assert.equal(idx.length, 52);
  assert.equal(new Set(idx).size, 52, 'all indices unique');
  assert.ok(idx.every((i) => Number.isInteger(i) && i >= 0 && i < 52), 'all in range');
});

test('cardAtlasIndex known anchors', () => {
  assert.equal(cardAtlasIndex({ r: 2, s: 'c' }), 0);   // first rank, first suit
  assert.equal(cardAtlasIndex({ r: 14, s: 'c' }), 12); // ace of clubs, end of row 0
  assert.equal(cardAtlasIndex({ r: 2, s: 'd' }), 13);  // first card of suit row 1
  assert.equal(cardAtlasIndex({ r: 14, s: 's' }), 51); // ace of spades, last cell
});

test('atlasCell is the inverse of cardAtlasIndex (col = rank-2, row = suit order c,d,h,s)', () => {
  for (const c of makeDeck()) {
    const cell = atlasCell(cardAtlasIndex(c));
    assert.equal(cell.col, c.r - 2, `${cardStr(c)} column`);
    assert.equal(cell.row, ['c', 'd', 'h', 's'].indexOf(c.s), `${cardStr(c)} row`);
  }
});

test('atlasUVRect tiles the unit square in equal cells', () => {
  const w = 1 / ATLAS_COLS, h = 1 / ATLAS_ROWS;
  for (const c of makeDeck()) {
    const r = atlasUVRect(cardAtlasIndex(c));
    assert.ok(r.u0 >= -1e-9 && r.v0 >= -1e-9 && r.u1 <= 1 + 1e-9 && r.v1 <= 1 + 1e-9, 'within [0,1]');
    assert.ok(Math.abs((r.u1 - r.u0) - w) < 1e-9, 'cell width = 1/cols');
    assert.ok(Math.abs((r.v1 - r.v0) - h) < 1e-9, 'cell height = 1/rows');
  }
});
