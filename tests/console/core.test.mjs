// tests/console/core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../src/console-core.js';
import { parseNum, parseInt_, parseCoord } from '../../src/console-core.js';
import { createRegistry } from '../../src/console-core.js';
import { parseSelector, resolveSelector } from '../../src/console-core.js';

test('tokenize: strips one leading slash and splits on whitespace', () => {
  assert.deepEqual(tokenize('/summon grunt 1 2 3'), ['summon', 'grunt', '1', '2', '3']);
});
test('tokenize: works without a leading slash', () => {
  assert.deepEqual(tokenize('tp ~ ~ ~'), ['tp', '~', '~', '~']);
});
test('tokenize: collapses runs of spaces and trims', () => {
  assert.deepEqual(tokenize('   give   money   500  '), ['give', 'money', '500']);
});
test('tokenize: empty / slash-only line ⇒ []', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('/'), []);
});

test('parseNum: parses floats, throws on garbage', () => {
  assert.equal(parseNum('3.5'), 3.5);
  assert.equal(parseNum('-12'), -12);
  assert.throws(() => parseNum('abc'), /Expected number/);
});
test('parseInt_: integers only', () => {
  assert.equal(parseInt_('7'), 7);
  assert.throws(() => parseInt_('7.5'), /Expected integer/);
});
test('parseCoord: Minecraft tilde is relative to base; bare number is absolute', () => {
  assert.equal(parseCoord('~', 100), 100);     // ~ = base
  assert.equal(parseCoord('~5', 100), 105);    // ~5 = base+5
  assert.equal(parseCoord('~-3', 100), 97);    // ~-3 = base-3
  assert.equal(parseCoord('42', 100), 42);     // absolute
});

function reg() {
  const r = createRegistry();
  r.register('tp', { args: [{ name: 'dest', type: 'pos' }], run: (a) => `tp -> ${a.dest.join(',')}` });
  r.register('summon', {
    args: [{ name: 'type', type: 'word' }, { name: 'at', type: 'pos', optional: true, default: null }],
    run: (a) => `summon ${a.type}@${a.at ? a.at.join(',') : 'self'}`,
  });
  r.register('say', { args: [{ name: 'msg', type: 'rest' }], run: (a) => `say:${a.msg}` });
  r.register('mode', { args: [{ name: 'm', type: 'enum', choices: ['creative', 'survival'] }], run: (a) => `mode:${a.m}` });
  return r;
}

test('dispatch: unknown command ⇒ ok:false', () => {
  const r = reg();
  assert.deepEqual(r.dispatch('/nope'), { ok: false, error: 'Unknown command: /nope' });
});
test('dispatch: pos args resolve tilde against ctx.origin', () => {
  const r = reg();
  assert.deepEqual(r.dispatch('/tp ~ ~10 50', { origin: [3, 4, 5] }), { ok: true, message: 'tp -> 3,14,50' });
});
test('dispatch: optional pos omitted ⇒ default', () => {
  const r = reg();
  assert.deepEqual(r.dispatch('/summon grunt'), { ok: true, message: 'summon grunt@self' });
});
test('dispatch: missing required arg ⇒ ok:false with message', () => {
  const r = reg();
  const res = r.dispatch('/tp 1 2');
  assert.equal(res.ok, false);
  assert.match(res.error, /missing coordinates/);
});
test('dispatch: rest grabs all remaining tokens', () => {
  const r = reg();
  assert.deepEqual(r.dispatch('/say hello brave new world'), { ok: true, message: 'say:hello brave new world' });
});
test('dispatch: enum rejects bad value', () => {
  const r = reg();
  const res = r.dispatch('/mode flying');
  assert.equal(res.ok, false);
  assert.match(res.error, /creative\|survival/);
});

test('parseSelector: @p/@a/@e/@s recognised; bare word ⇒ name target', () => {
  assert.deepEqual(parseSelector('@e'), { kind: 'e' });
  assert.deepEqual(parseSelector('@s'), { kind: 's' });
  assert.deepEqual(parseSelector('Boris'), { kind: 'name', value: 'Boris' });
});
test('resolveSelector: routes to the injected provider', () => {
  const self = { id: 'me' };
  const others = [{ id: 'a' }, { id: 'b' }];
  const provider = { self, players: () => [self, ...others], entities: () => [{ id: 'z1' }] };
  assert.deepEqual(resolveSelector({ kind: 's' }, provider), [self]);
  assert.deepEqual(resolveSelector({ kind: 'a' }, provider), [self, ...others]);
  assert.deepEqual(resolveSelector({ kind: 'p' }, provider), [self]);              // nearest = first for now
  assert.deepEqual(resolveSelector({ kind: 'e' }, provider), [{ id: 'z1' }]);
});
