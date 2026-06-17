// Regression: the live bet-preview drain math (poker-scene._updateBetPreview, multi-skin branch).
// The render layer pulls `take` out of a COPY of the stack's skin ledger and merges it into the bet
// heap. This guards the PURE invariant that wiring relies on: chips are conserved, your OWN (dominant)
// skin is spent before chips you've WON of another skin, and the stack ledger the renderer receives
// equals (stack - take). The earlier bug rendered the stack via the wrong path so it never drained;
// these assertions pin the math the corrected path feeds setMultiSkinTray.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawSkinned, mergeSkinned, value, skinValueByDenom, exactSubset, largestFormableLE } from '../../src/poker/chipbank.js';

// mirror of poker-scene._dominantSkin
const dominantSkin = (m) => { let best = null, bv = -1; for (const sk in m) { const v = value(m[sk]); if (v > bv) { bv = v; best = sk; } } return best; };

// mirror of the _updateBetPreview multi-skin branch (pure portion)
function drainPreview(stackSkins, betSkins, stackSet, addAmt) {
  const take = addAmt > 0 ? ((exactSubset(stackSet, addAmt) || largestFormableLE(stackSet, addAmt)) || {}) : {};
  const prefer = dominantSkin(stackSkins);
  const stackLedger = mergeSkinned({}, stackSkins);          // deep copy (drawSkinned mutates)
  const drawn = drawSkinned(stackLedger, take, prefer, prefer);
  const heapSkins = mergeSkinned(betSkins || {}, drawn);
  return { take, stackLedger, drawn, heapSkins, prefer };
}

test('drain conserves chips: drained stack + heap == original stack + original bet', () => {
  const stackSkins = { marx: { 100: 5, 50: 4, 20: 3 } };    // value 5*100+4*50+3*20 = 760
  const stackSet = skinValueByDenom(stackSkins);
  const betSkins = { marx: { 10: 1 } };                      // already-committed blind
  const { stackLedger, heapSkins } = drainPreview(stackSkins, betSkins, stackSet, 200);
  // stack ledger the renderer gets == original stack minus what moved to the heap
  const before = skinValueByDenom(stackSkins);
  const afterStack = skinValueByDenom(stackLedger);
  const afterHeap = skinValueByDenom(heapSkins);
  // per-denom conservation across stack(+bet) before == stack(after) + heap(after)
  for (const d of [500, 100, 50, 20, 10, 5]) {
    const beforeTot = (before[d] || 0) + (skinValueByDenom(betSkins)[d] || 0);
    const afterTot = (afterStack[d] || 0) + (afterHeap[d] || 0);
    assert.equal(afterTot, beforeTot, `denom ${d} conserved`);
  }
  // the stack actually shrank in value by exactly the previewed extra (200)
  assert.equal(value(before) - value(afterStack), 200);
  // the heap value == committed bet (10) + previewed extra (200)
  assert.equal(value(afterHeap), 210);
});

test('your OWN (dominant) skin is spent before chips you WON of another skin', () => {
  // you hold mostly marx, plus 1 lenin 100 you won earlier; dominant = marx
  const stackSkins = { marx: { 100: 5 }, lenin: { 100: 1 } };
  const stackSet = skinValueByDenom(stackSkins);             // {100: 6}
  const { drawn, stackLedger, prefer } = drainPreview(stackSkins, {}, stackSet, 300); // pull 3x100
  assert.equal(prefer, 'marx');
  assert.equal((drawn.marx && drawn.marx[100]) || 0, 3, 'all 3 pulled from marx');
  assert.equal(drawn.lenin, undefined, 'the won lenin chip stays in your stack');
  assert.equal((stackLedger.lenin && stackLedger.lenin[100]) || 0, 1, 'lenin survives in the stack');
});

test('heap KEEPS provenance when you must dip into won chips (mix in the heap)', () => {
  const stackSkins = { marx: { 100: 1 }, lenin: { 100: 1 } }; // only 2 chips total
  const stackSet = skinValueByDenom(stackSkins);              // {100: 2}
  const { heapSkins } = drainPreview(stackSkins, {}, stackSet, 200); // pull both
  assert.equal((heapSkins.marx && heapSkins.marx[100]) || 0, 1);
  assert.equal((heapSkins.lenin && heapSkins.lenin[100]) || 0, 1);
  assert.equal(value(skinValueByDenom(heapSkins)), 200);
});

test('zero preview (no extra) leaves the stack ledger untouched', () => {
  const stackSkins = { marx: { 100: 3 } };
  const stackSet = skinValueByDenom(stackSkins);
  const { take, stackLedger, heapSkins } = drainPreview(stackSkins, { marx: { 50: 1 } }, stackSet, 0);
  assert.deepEqual(take, {});
  assert.equal(value(skinValueByDenom(stackLedger)), 300, 'stack full');
  assert.equal(value(skinValueByDenom(heapSkins)), 50, 'heap = just the committed bet');
});
