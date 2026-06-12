import test from 'node:test';
import assert from 'node:assert/strict';
import { DestructRuntime, makePart, CALIBERS } from '../../src/destruct.js';

const mkRT = () => {
  const events = [];
  const rt = new DestructRuntime({ emit: e => events.push(e) });
  return { rt, events };
};

test('applyHit: rifle shatters a glass pane it strikes and emits destroy', () => {
  const { rt, events } = mkRT();
  rt.addPart(makePart('g1', 'glass', [-1, 1, 0], [1, 2, 0.05]));
  const r = rt.applyHit([0, 1.5, 0.02], [0, 0, -1], [0, 0, 1], CALIBERS.rifle);
  assert.equal(r.effect, 'damage');
  assert.equal(r.killed, true);
  assert.ok(events.some(e => e.type === 'destroy' && e.dpart === 'g1'));
});

test('applyHit: pistol on brick is a cosmetic chip, wall survives', () => {
  const { rt, events } = mkRT();
  const wall = rt.addPart(makePart('w1', 'brick', [-1, 0, 0], [1, 2.5, 0.3]));
  const r = rt.applyHit([0, 1, 0.15], [0, 0, -1], [0, 0, 1], CALIBERS.pistol);
  assert.equal(r.effect, 'cosmetic');
  assert.equal(wall.dead, false);
  assert.ok(events.some(e => e.type === 'chip'));
});

test('applyBlast: HE rocket removes a brick segment and shatters nearby glass', () => {
  const { rt, events } = mkRT();
  const wall  = rt.addPart(makePart('w1', 'brick', [0.5, 0, 0], [2, 2.5, 0.3]));
  const pane  = rt.addPart(makePart('g1', 'glass', [4, 1, 0], [5, 2, 0.05]));
  const res = rt.applyBlast([0, 1.2, 0], 6, CALIBERS.heRocket);
  assert.ok(res.killed.includes('w1'));
  assert.ok(res.glass.includes('g1'));
  assert.equal(wall.dead, true);
  assert.equal(pane.dead, true);
  assert.ok(events.some(e => e.type === 'blast'));
});

test('applyPenetration: APFSDS obliterates a fence on the ray and spalls an offset board', () => {
  const { rt } = mkRT();
  const wall  = rt.addPart(makePart('w1', 'brick', [-1, 0, 0], [1, 2.5, 0.3]));
  const off   = rt.addPart(makePart('p2', 'wood',  [0.4, 0.5, 2], [0.9, 1.5, 2.1]));
  const res = rt.applyPenetration([0, 1, -5], [0, 0, 1], CALIBERS.apfsds);
  assert.equal(wall.dead, false, 'structural wall stays (through-hole)');
  assert.equal(off.dead, true, 'spall cone destroyed the offset board');
  assert.ok(res.cones.length >= 1);
});

test('applyCrush is an inert stub for now (returns [])', () => {
  const { rt } = mkRT();
  assert.deepEqual(rt.applyCrush({ min: [0, 0, 0], max: [1, 1, 1] }, { crushPower: 2 }, 0.016), []);
});
