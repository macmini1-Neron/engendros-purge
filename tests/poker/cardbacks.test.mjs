import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_BACKS, CARD_BACK_LIST, CARD_BACKS_FREE, CARD_BACKS_LOCKED,
  cardBackAvailable, setCardBackSkin, getCardBackSkin, cardBackRev,
  drawCardBack, CARD_BACK_DROP,
} from '../../src/poker/cardbacks.js';

// recording 2D-context stub — proves the painters are pure (no THREE / real canvas) and node-runnable.
function stubCtx() {
  const calls = [];
  const rec = (name) => (...a) => calls.push([name, ...a]);
  return {
    calls,
    set fillStyle(v) { calls.push(['fillStyle', v]); },
    set strokeStyle(v) { calls.push(['strokeStyle', v]); },
    set lineWidth(v) { calls.push(['lineWidth', v]); },
    fillRect: rec('fillRect'), strokeRect: rec('strokeRect'), beginPath: rec('beginPath'),
    arc: rec('arc'), arcTo: rec('arcTo'), stroke: rec('stroke'), fill: rec('fill'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), closePath: rec('closePath'),
  };
}

test('CARD_BACKS registry has classic + placeholders, each {id,label,paint}', () => {
  for (const id of ['default', 'azure', 'redstar', 'emblem']) {
    const b = CARD_BACKS[id];
    assert.ok(b, `back ${id} present`);
    assert.equal(b.id, id, 'id matches key');
    assert.equal(typeof b.label, 'string');
    assert.equal(typeof b.paint, 'function');
  }
  assert.deepEqual(CARD_BACK_LIST, ['default', 'azure', 'redstar', 'emblem']);
  assert.ok(CARD_BACK_LIST.every((id) => CARD_BACKS[id]), 'every listed id resolves');
});

test('free vs locked card-back sets partition the registry', () => {
  assert.deepEqual(CARD_BACKS_FREE, ['default', 'azure']);
  assert.deepEqual(CARD_BACKS_LOCKED, ['redstar', 'emblem']);
  for (const id of CARD_BACK_LIST) {
    assert.ok(CARD_BACKS_FREE.includes(id) !== CARD_BACKS_LOCKED.includes(id), `${id} is exactly one of free/locked`);
  }
});

test('cardBackAvailable: free always, locked only when owned', () => {
  assert.ok(cardBackAvailable('default', []));
  assert.ok(cardBackAvailable('azure', null));
  assert.ok(!cardBackAvailable('redstar', []));
  assert.ok(cardBackAvailable('redstar', ['redstar']));
  assert.ok(!cardBackAvailable('emblem', ['redstar']));
});

test('setCardBackSkin validates + bumps rev on change only', () => {
  setCardBackSkin('default');
  const r0 = cardBackRev();
  setCardBackSkin('bogus');
  assert.equal(getCardBackSkin(), 'default', 'invalid id ignored');
  assert.equal(cardBackRev(), r0, 'no rev bump on invalid');
  setCardBackSkin('redstar');
  assert.equal(getCardBackSkin(), 'redstar');
  assert.ok(cardBackRev() > r0, 'rev bumped on change');
  const r1 = cardBackRev();
  setCardBackSkin('redstar');
  assert.equal(cardBackRev(), r1, 'no bump when unchanged');
  setCardBackSkin('default'); // reset shared state
});

test('drawCardBack runs THREE-free for every back against a stub ctx', () => {
  for (const id of CARD_BACK_LIST) {
    const ctx = stubCtx();
    assert.doesNotThrow(() => drawCardBack(ctx, 132, 184, id), `${id} paints`);
    assert.ok(ctx.calls.some((c) => c[0] === 'fillRect'), 'fills the cell');
  }
  const ctx = stubCtx();
  assert.doesNotThrow(() => drawCardBack(ctx, 132, 184, 'no-such-back'), 'unknown id falls back to default');
});

test('CARD_BACK_DROP pool covers exactly the locked backs with tier+value+weight+name', () => {
  assert.deepEqual(CARD_BACK_DROP.map((e) => e.back).sort(), ['emblem', 'redstar']);
  for (const e of CARD_BACK_DROP) {
    assert.ok(['epic', 'legendary'].includes(e.tier), `${e.back} ceremony tier`);
    assert.ok(e.value > 0 && e.w > 0 && typeof e.name === 'string', `${e.back} has value/weight/name`);
    assert.ok(CARD_BACKS_LOCKED.includes(e.back), `${e.back} is a locked back`);
  }
});
