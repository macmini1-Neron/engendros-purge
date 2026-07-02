import test from 'node:test';
import assert from 'node:assert/strict';
import { makeZonaHeightFn, padHeights } from '../../src/zona-terrain.js';
import { PARCELS } from '../../src/zona-plan.js';

test('every pad is flat: max deviation < 0.15 m over a 5×5 interior sample', () => {
  const h = makeZonaHeightFn(704);
  const ph = padHeights(704);
  for (const p of PARCELS.filter(p => !p.noPad)) {
    const hw = (p.kind === 'disc' ? p.r : p.w / 2) * 0.7, hd = (p.kind === 'disc' ? p.r : p.d / 2) * 0.7;
    const target = ph.get(p.id);
    assert.ok(Number.isFinite(target), `${p.id} target`);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const y = h(p.x + (i / 2) * hw, p.z + (j / 2) * hd);
      assert.ok(Math.abs(y - target) < 0.15, `${p.id} dev ${Math.abs(y - target).toFixed(2)} at ${i},${j}`);
    }
  }
});

test('pinned pad heights match the plan', () => {
  const ph = padHeights(704);
  assert.equal(ph.get('P3'), 60);
  assert.equal(ph.get('P8'), 200);
  assert.equal(ph.get('P1'), 5);
  assert.equal(ph.get('P7'), -4); // dam crest — the pad must WIN over the R2E corridor crossing it
});

test('unpinned pads sample the local field (sane values, not zero-default)', () => {
  const ph = padHeights(704);
  const s19 = ph.get('S19'); // sawmill by the river bend, plain NW steppe
  assert.ok(Number.isFinite(s19) && Math.abs(s19) < 30, `S19 ${s19}`);
  const e03 = ph.get('E03'); // meteostation up in the N mountains — must inherit real altitude
  assert.ok(e03 > 10, `E03 ${e03}`);
});
