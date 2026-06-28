// Unit tests for the THREE-free dismemberment bit math (dismember-core.js) — the co-op limb
// replication bitmask the host sends in esnap/espawn (`lf`) so clients/late-joiners hide the
// exact same severed parts. engendro.js itself imports THREE and can't run under node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEVER_BIT, SEVERABLE_ORDER, limbFlagsFromParts, isSevered } from '../src/dismember-core.js';

// build a parts array like a rig's: every severable limb + a non-severable torso. `severed` = names to mark dead.
const mkParts = (severed = []) =>
  SEVERABLE_ORDER.map((name) => ({ name, severable: true, alive: !severed.includes(name) }))
    .concat([{ name: 'torso', severable: false, alive: !severed.includes('torso') }]);

test('SEVER_BIT: each severable part has a unique power-of-two bit', () => {
  const bits = SEVERABLE_ORDER.map((n) => SEVER_BIT[n]);
  for (const b of bits) assert.ok(b > 0 && (b & (b - 1)) === 0, `${b} is a power of two`);
  assert.equal(new Set(bits).size, bits.length, 'all bits distinct');
});

test('limbFlagsFromParts: intact enemy → 0', () => {
  assert.equal(limbFlagsFromParts(mkParts()), 0);
});

test('limbFlagsFromParts: torso is never flagged even when not alive (not severable)', () => {
  const all = mkParts(SEVERABLE_ORDER.concat('torso'));   // mark EVERYTHING dead
  assert.equal(limbFlagsFromParts(all), SEVER_BIT.head | SEVER_BIT.armL | SEVER_BIT.armR | SEVER_BIT.legL | SEVER_BIT.legR);
});

test('limbFlagsFromParts: a single severed leg encodes exactly that bit', () => {
  const f = limbFlagsFromParts(mkParts(['legL']));
  assert.equal(f, SEVER_BIT.legL);
  assert.ok(isSevered(f, 'legL'));
  assert.ok(!isSevered(f, 'legR') && !isSevered(f, 'head'));
});

test('limbFlagsFromParts ↔ isSevered roundtrip over many combos', () => {
  const combos = [[], ['head'], ['legL', 'legR'], ['armR'], ['head', 'armL', 'legR'], SEVERABLE_ORDER];
  for (const combo of combos) {
    const f = limbFlagsFromParts(mkParts(combo));
    for (const name of SEVERABLE_ORDER) {
      assert.equal(isSevered(f, name), combo.includes(name), `${name} severed? in [${combo}]`);
    }
  }
});

test('isSevered: unknown part name is never severed', () => {
  assert.equal(isSevered(0xff, 'wing'), false);
});
