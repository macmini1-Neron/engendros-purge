import test from 'node:test';
import assert from 'node:assert/strict';
import { RoundRobinPool } from '../../src/pool.js';

test('factory runs once per slot at construction, never again', () => {
  let built = 0;
  const p = new RoundRobinPool(3, () => ({ id: built++ }));
  assert.equal(built, 3);
  for (let i = 0; i < 10; i++) p.acquire();
  assert.equal(built, 3); // no new allocation on acquire
});

test('round-robin reuses oldest slot', () => {
  const p = new RoundRobinPool(2, (i) => ({ i }));
  const a = p.acquire(); const b = p.acquire(); const c = p.acquire();
  assert.equal(a.obj, c.obj); // 3rd acquire wraps to slot 0
  assert.notEqual(a.obj, b.obj);
});

test('stale release does not free a re-acquired slot', () => {
  const p = new RoundRobinPool(1, () => ({}));
  const first = p.acquire();
  const second = p.acquire();      // same slot, new token → invalidates `first`
  assert.equal(p.isStale(first), true);
  assert.equal(p.isStale(second), false);
});

test('forEach visits every slot once', () => {
  const p = new RoundRobinPool(4, (i) => ({ i }));
  const seen = [];
  p.forEach((o) => seen.push(o.i));
  assert.deepEqual(seen.sort(), [0, 1, 2, 3]);
  assert.equal(p.size, 4);
});

test('release returns true only for the live handle', () => {
  const p = new RoundRobinPool(1, () => ({}));
  const h1 = p.acquire();
  const h2 = p.acquire();
  assert.equal(p.release(h1), false); // stale
  assert.equal(p.release(h2), true);  // live
});
