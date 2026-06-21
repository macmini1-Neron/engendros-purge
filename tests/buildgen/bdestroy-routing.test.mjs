// bdestroy-routing.test.mjs — co-op bdestroy is routed to the right building by bid (pure).
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeBdestroy } from '../../src/buildings/destructible-geom.js';

const list = [{ bid: 'demo' }, { bid: 'zavod@10,-4,0' }, { bid: 'zavod@30,-4,1' }];

test('routes by exact bid', () => {
  assert.equal(routeBdestroy(list, { bid: 'zavod@30,-4,1', parts: ['x'] }), list[2]);
  assert.equal(routeBdestroy(list, { bid: 'demo' }), list[0]);
});

test('unknown bid → null (no misrouting)', () => {
  assert.equal(routeBdestroy(list, { bid: 'ghost@0,0,0' }), null);
});

test('bid-less message (old host): sole building, else the demo by name', () => {
  const sole = [{ bid: 'only' }];
  assert.equal(routeBdestroy(sole, { parts: [] }), sole[0], 'one building → that one');
  assert.equal(routeBdestroy(list, { parts: [] }), list[0], 'many → fall back to the demo');
  assert.equal(routeBdestroy([{ bid: 'a' }, { bid: 'b' }], { parts: [] }), null, 'many, no demo → null');
});

test('empty / null inputs are safe', () => {
  assert.equal(routeBdestroy([], { bid: 'x' }), null);
  assert.equal(routeBdestroy(null, { bid: 'x' }), null);
  assert.equal(routeBdestroy(list, null), null);
});
