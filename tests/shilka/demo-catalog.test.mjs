// Integrity tests for the demoshilka data-driven catalog (demo/shilka-modules.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPowerState } from '../../src/shilka-power.js';
import { createFireState } from '../../src/shilka-interlock.js';
import { createStabState } from '../../src/shilka-stab.js';
import { MODULES, CIRCUITS, DRIVER_CONTROLS, COMMANDER_CONTROLS, COMMANDER_PANEL } from '../../demo/shilka-modules.js';

const STATE_KEYS = new Set([...Object.keys(createPowerState()), 'cooling', 'hatchClosed']);

// demo-only fields the commander overlay sets/reads (mirrors EXTRA() in demoshilka.html)
const CMD_DEMO = ['cooling','hatchClosed','lowCoolant','shuntSrp','hydraulicOn','dcRange','phaseSel',
  'radarMode','elevationDeg','station','dataPresent','onMove','gagPhase','_fireOk',
  'zarVL','zarVP','zarNL','zarNP','ammoVL','ammoVP','ammoNL','ammoNP'];
const CMD_KEYS = new Set([
  ...Object.keys(createPowerState()), ...Object.keys(createFireState()), ...Object.keys(createStabState()), ...CMD_DEMO,
]);
const cmdStub = () => Object.assign(
  createPowerState(), createFireState(), createStabState(),
  { gagPhase:'off', ammoVL:480, ammoVP:480, ammoNL:520, ammoNP:520 });

test('every cutaway module is well-formed (glow fn + both projections + circuit)', () => {
  assert.ok(MODULES.length >= 10);
  for (const m of MODULES) {
    assert.equal(typeof m.glow, 'function', `${m.id} glow`);
    assert.ok(m.side && Number.isFinite(m.side.x) && Number.isFinite(m.side.y), `${m.id} side`);
    assert.ok(m.top && Number.isFinite(m.top.x) && Number.isFinite(m.top.y), `${m.id} top`);
    assert.ok(m.id && m.ru && m.source, `${m.id} fields`);
  }
});

test('every circuit has both projection point-strings + live fn + layer', () => {
  for (const c of CIRCUITS) {
    assert.equal(typeof c.live, 'function', `${c.id} live`);
    assert.ok(typeof c.side === 'string' && typeof c.top === 'string', `${c.id} points`);
    assert.ok(c.layer, `${c.id} layer`);
  }
});

test('driver controls well-formed; every set/clear targets a real state key', () => {
  const acts = new Set(['tgl', 'hold', 'btn', 'lamp', 'gauge']);
  assert.ok(DRIVER_CONTROLS.length >= 40, `count=${DRIVER_CONTROLS.length}`);
  const nums = new Set();
  for (const c of DRIVER_CONTROLS) {
    assert.ok(Number.isFinite(c.n), `num ${c.ru}`);
    assert.ok(!nums.has(c.n), `duplicate control number ${c.n}`); nums.add(c.n);
    assert.ok(c.ru && c.cz && c.g, `${c.n} fields`);
    assert.ok(acts.has(c.act), `${c.n} act=${c.act}`);
    if (c.set) assert.ok(STATE_KEYS.has(c.set), `${c.n} set=${c.set} not a state key`);
    if (c.clear) assert.ok(STATE_KEYS.has(c.clear), `${c.n} clear=${c.clear} not a state key`);
    if (c.act === 'lamp' || c.act === 'gauge') assert.equal(typeof c.read, 'function', `${c.n} read`);
  }
});

test('driver lamp/gauge read functions run without throwing on a fresh + powered state', () => {
  const buses = { dc27: true, ac220: true, v115: true };
  for (const c of DRIVER_CONTROLS) {
    if (c.act === 'lamp' || c.act === 'gauge') {
      assert.doesNotThrow(() => c.read(createPowerState(), buses), `${c.n} read throws`);
    }
  }
});

test('commander panel meta points at the image asset', () => {
  assert.ok(COMMANDER_PANEL && COMMANDER_PANEL.img.includes('commander-panel'));
  assert.ok(COMMANDER_PANEL.w > 0 && COMMANDER_PANEL.h > 0);
});

test('commander controls well-formed: kind + %-coords + valid set/clear keys', () => {
  const kinds = new Set(['lamp', 'toggle', 'button', 'selector', 'counter', 'gauge']);
  assert.ok(COMMANDER_CONTROLS.length >= 30, `count=${COMMANDER_CONTROLS.length}`);
  for (const c of COMMANDER_CONTROLS) {
    assert.ok(c.ru, `${c.ru} ru`);
    assert.ok(kinds.has(c.kind), `${c.ru} kind=${c.kind}`);
    assert.ok(c.px && c.px.x >= 0 && c.px.x <= 100 && c.px.y >= 0 && c.px.y <= 100, `${c.ru} px out of range`);
    if (c.set) assert.ok(CMD_KEYS.has(c.set), `${c.ru} set=${c.set} not a state key`);
    if (c.clear) assert.ok(CMD_KEYS.has(c.clear), `${c.ru} clear=${c.clear} not a state key`);
    if (c.kind === 'selector') assert.ok(Array.isArray(c.opts) && c.opts.length, `${c.ru} selector needs opts`);
  }
});

test('commander lamp/counter/gauge read functions do not throw on a powered stub', () => {
  const buses = { dc27: true, ac220: true, v115: true };
  for (const c of COMMANDER_CONTROLS) {
    if (c.read) assert.doesNotThrow(() => c.read(cmdStub(), buses), `${c.ru} read throws`);
  }
});
