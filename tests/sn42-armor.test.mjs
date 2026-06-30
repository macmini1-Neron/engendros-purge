// Unit tests for the THREE-free СН-42 cuirass decision logic (sn42-armor.js) — the rule that decides
// whether a hit rings off the steel plate, punches through it, or ignores it. enemies.js does the 1:1
// capsule geometry test (was the ray actually on the plate?) and feeds the result in as `plateHit`; here
// we exercise the pure block/penetrate/break decision in isolation (mirrors dismember.test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SN42, isArmorPiercing, resolveArmorHit } from '../src/sn42-armor.js';

// a pistol/SMG/buckshot round that struck the plate, N hits left, dealing `amount` body damage
const ringOff = (plateHits, amount = 20) => resolveArmorHit({ plateHit: true, plateHits, amount, ap: false });

test('isArmorPiercing: rifle-grade / blast sources defeat the plate, light arms do not', () => {
  for (const s of ['ap', 'explosion', 'rocket', 'crush']) assert.equal(isArmorPiercing(s), true, s);
  for (const s of ['gun', 'melee', 'fire', 'burn', 'contact', undefined]) assert.equal(isArmorPiercing(s), false, String(s));
});

test('light round that hits the plate → blocked, zero body damage, plate chipped', () => {
  const r = ringOff(SN42.PLATE_HITS, 35);
  assert.equal(r.blocked, true);
  assert.equal(r.penetrate, false);
  assert.equal(r.damage, 0);
  assert.equal(r.plateHitsLeft, SN42.PLATE_HITS - 1);
  assert.equal(r.plateBreak, false);
});

test('no body damage bleeds through a blocked hit, however big the (light) round', () => {
  const r = ringOff(SN42.PLATE_HITS, 70);    // a .45 revolver still just rings off
  assert.equal(r.damage, 0);
  assert.equal(r.blocked, true);
});

test('the last plate-hit shatters the cuirass off', () => {
  const r = ringOff(1, 20);
  assert.equal(r.blocked, true);
  assert.equal(r.plateBreak, true);
  assert.equal(r.plateHitsLeft, 0);
  assert.equal(r.damage, 0);                 // the breaking shot itself still does no body damage
});

test('armor-piercing caliber on the plate punches through: full damage + plate destroyed', () => {
  const r = resolveArmorHit({ plateHit: true, plateHits: SN42.PLATE_HITS, amount: 175, ap: true });
  assert.equal(r.penetrate, true);
  assert.equal(r.blocked, false);
  assert.equal(r.damage, 175);
  assert.equal(r.plateBreak, true);
});

test('a shot that MISSED the plate → full damage, no block (head/flank/back/legs)', () => {
  for (const ap of [false, true]) {
    const r = resolveArmorHit({ plateHit: false, plateHits: SN42.PLATE_HITS, amount: 50, ap });
    assert.equal(r.blocked, false, `ap=${ap}`);
    assert.equal(r.penetrate, false, `ap=${ap}`);
    assert.equal(r.damage, 50, `ap=${ap}`);
    assert.equal(r.plateBreak, false, `ap=${ap}`);
  }
});
