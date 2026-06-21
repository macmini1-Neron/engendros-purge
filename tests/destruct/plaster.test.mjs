// plaster.test.mjs — the buildgen-added 'plaster' physical material (soft render skin).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, makePart, resolveHit } from '../../src/destruct.js';

test('MATERIALS.plaster is a soft tier-1, non-flammable masonry skin', () => {
  const m = MATERIALS.plaster;
  assert.ok(m, 'plaster must exist in MATERIALS');
  assert.equal(m.tier, 1);
  assert.equal(m.hp, 40);
  assert.equal(m.fuel, 0, 'plaster never ignites');
  assert.equal(m.debris, 'rubble', 'reuses an existing DebrisPool recipe');
  assert.equal(m.sound, 'masonry');
});

test('makePart accepts plaster and seeds its hp', () => {
  const p = makePart('pl1', 'plaster', [0, 0, 0], [1.5, 2.5, 0.05]);
  assert.equal(p.dmat, 'plaster');
  assert.equal(p.dhp, 40);
  assert.equal(p.dead, false);
});

test('plaster hit ladder: pen 0 is cosmetic, pen 1 damages, enough rounds kill it', () => {
  const p = makePart('pl2', 'plaster', [0, 0, 0], [1, 2, 0.05]);
  // pistol (pen 0) < plaster tier 1 ⇒ cosmetic, no hp loss
  const r0 = resolveHit(p, { pen: 0, dmg: 8 });
  assert.equal(r0.effect, 'cosmetic');
  assert.equal(p.dhp, 40);
  // rifle (pen 1) ≥ tier 1 ⇒ damage
  const r1 = resolveHit(p, { pen: 1, dmg: 15 });
  assert.equal(r1.effect, 'damage');
  assert.equal(p.dhp, 25);
  // a couple more finish it
  resolveHit(p, { pen: 1, dmg: 15 });
  const rk = resolveHit(p, { pen: 1, dmg: 15 });
  assert.equal(p.dead, true);
  assert.equal(rk.killed, true);
});
