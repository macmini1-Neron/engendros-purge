import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DICE, denomColor, CHIP_SKINS, CHIP_SKIN_LIST,
  setChipSkin, getChipSkin, chipSkinRev, drawChip,
  CHIP_SKINS_FREE, CHIP_SKINS_LOCKED, chipSkinAvailable,
  COSMETIC_DROP,
} from '../../src/poker/chipskins.js';

// A recording 2D-context stub — proves the painters are pure (no THREE / no real canvas) and
// node-runnable. Captures method calls + the last set fill/stroke styles.
function stubCtx() {
  const calls = [];
  const rec = (name) => (...a) => calls.push([name, ...a]);
  return {
    calls,
    set fillStyle(v) { calls.push(['fillStyle', v]); },
    set strokeStyle(v) { calls.push(['strokeStyle', v]); },
    set lineWidth(v) { calls.push(['lineWidth', v]); },
    fillRect: rec('fillRect'), beginPath: rec('beginPath'), arc: rec('arc'),
    stroke: rec('stroke'), fill: rec('fill'), moveTo: rec('moveTo'),
    lineTo: rec('lineTo'), closePath: rec('closePath'),
  };
}

test('DICE maps all six denominations to body+spot colours', () => {
  for (const d of [5, 10, 20, 50, 100, 500]) {
    assert.ok(DICE[d], `denom ${d} present`);
    assert.match(DICE[d].body, /^#/, 'body is a CSS hex');
    assert.match(DICE[d].spot, /^#/, 'spot is a CSS hex');
  }
  assert.deepEqual(denomColor(99999), DICE[100], 'unknown denom falls back to the $100 colour');
});

test('CHIP_SKINS registry has dice/casino/star/marx/lenin, each {id,label,paint}', () => {
  for (const id of ['dice', 'casino', 'star', 'marx', 'lenin']) {
    const s = CHIP_SKINS[id];
    assert.ok(s, `skin ${id} present`);
    assert.equal(s.id, id, 'id matches its key');
    assert.equal(typeof s.label, 'string');
    assert.equal(typeof s.paint, 'function');
  }
  assert.deepEqual(CHIP_SKIN_LIST, ['dice', 'casino', 'star', 'marx', 'lenin'], 'ordered list for the UI');
  assert.ok(CHIP_SKIN_LIST.every((id) => CHIP_SKINS[id]), 'every listed id resolves');
});

test('setChipSkin validates against the registry (mirrors setCardBackSkin)', () => {
  setChipSkin('dice');
  assert.equal(getChipSkin(), 'dice', 'default / valid set sticks');
  setChipSkin('bogus');
  assert.equal(getChipSkin(), 'dice', 'invalid id is ignored — stays on a valid skin');
});

test('setChipSkin to a NEW id bumps the revision (so trays know to rebuild)', () => {
  setChipSkin('dice');
  const r0 = chipSkinRev();
  setChipSkin('star');
  assert.equal(getChipSkin(), 'star');
  assert.ok(chipSkinRev() > r0, 'rev advanced on change');
  const r1 = chipSkinRev();
  setChipSkin('star');                       // no-op: same skin
  assert.equal(chipSkinRev(), r1, 'rev does not advance when the skin is unchanged');
  setChipSkin('dice');                        // reset shared state for other tests
});

test('drawChip runs THREE-free for every skin × denom against a stub ctx', () => {
  for (const id of CHIP_SKIN_LIST) {
    for (const d of [5, 10, 20, 50, 100, 500]) {
      const ctx = stubCtx();
      assert.doesNotThrow(() => drawChip(ctx, 128, d, id), `${id}/${d} paints`);
      assert.ok(ctx.calls.some((c) => c[0] === 'fillRect'), 'body fill issued');
      assert.ok(ctx.calls.some((c) => c[0] === 'fillStyle' && c[1] === DICE[d].body),
        'fixed denomination body colour is used (skins change pattern, not colour)');
    }
  }
});

test('drawChip falls back to the dice skin for an unknown skin id', () => {
  const ctx = stubCtx();
  assert.doesNotThrow(() => drawChip(ctx, 64, 100, 'no-such-skin'));
  assert.ok(ctx.calls.length > 0, 'still painted something');
});

test('free vs locked skin sets partition the registry', () => {
  assert.deepEqual(CHIP_SKINS_FREE, ['dice', 'casino', 'star']);
  assert.deepEqual(CHIP_SKINS_LOCKED, ['marx', 'lenin']);
  for (const id of CHIP_SKIN_LIST) {
    assert.ok(CHIP_SKINS_FREE.includes(id) !== CHIP_SKINS_LOCKED.includes(id), `${id} is exactly one of free/locked`);
  }
});

test('chipSkinAvailable: free always, locked only when owned', () => {
  assert.ok(chipSkinAvailable('dice', []), 'free dice always available');
  assert.ok(chipSkinAvailable('star', null), 'free tolerates null owned');
  assert.ok(!chipSkinAvailable('marx', []), 'locked marx needs unlock');
  assert.ok(!chipSkinAvailable('lenin', undefined), 'locked tolerates undefined owned');
  assert.ok(chipSkinAvailable('marx', ['marx']), 'owned marx available');
  assert.ok(!chipSkinAvailable('marx', ['lenin']), 'owning lenin does not unlock marx');
});

test('COSMETIC_DROP pool covers exactly the locked skins with tier+value+weight+name', () => {
  assert.deepEqual(COSMETIC_DROP.map((e) => e.skin).sort(), ['lenin', 'marx']);
  for (const e of COSMETIC_DROP) {
    assert.ok(['epic', 'legendary'].includes(e.tier), `${e.skin} ceremony tier`);
    assert.ok(e.value > 0 && e.w > 0 && typeof e.name === 'string', `${e.skin} has value/weight/name`);
    assert.ok(CHIP_SKINS_LOCKED.includes(e.skin), `${e.skin} is a locked skin`);
  }
});
