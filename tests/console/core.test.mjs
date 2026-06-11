// tests/console/core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, parseNum, asInt, parseCoord, createRegistry, parseSelector, resolveSelector, suggest, highlight } from '../../src/console-core.js';

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
test('asInt: integers only', () => {
  assert.equal(asInt('7'), 7);
  assert.throws(() => asInt('7.5'), /Expected integer/);
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
test('dispatch: enum rejects bad value and accepts valid value', () => {
  const r = reg();
  const res = r.dispatch('/mode flying');
  assert.equal(res.ok, false);
  assert.match(res.error, /creative\|survival/);
  assert.equal(r.dispatch('/mode creative').ok, true);
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
test('resolveSelector: name selector uses byName', () => {
  const provider = { self: null, players: () => [], entities: () => [], byName: (n) => [{ id: n }] };
  assert.deepEqual(resolveSelector({ kind: 'name', value: 'Boris' }, provider), [{ id: 'Boris' }]);
});

test('dispatch: empty string ⇒ ok:false Empty command', () => {
  const r = reg();
  assert.deepEqual(r.dispatch(''), { ok: false, error: 'Empty command' });
});

test('registry.has and registry.names reflect registered commands', () => {
  const r = reg();
  assert.equal(r.has('tp'), true);
  assert.equal(r.has('nope'), false);
  const n = r.names();
  assert.ok(n.includes('tp'));
  assert.ok(n.includes('say'));
  assert.ok(n.includes('mode'));
});

test('dispatch: handler that throws ⇒ ok:false with threw prefix', () => {
  const r = createRegistry();
  r.register('boom', { args: [], run: () => { throw new Error('kaboom'); } });
  const res = r.dispatch('/boom');
  assert.equal(res.ok, false);
  assert.match(res.error, /\/boom threw: kaboom/);
});

// ---- autocomplete helpers ----
function sugReg() {
  const r = createRegistry();
  r.register('tp', { args: [{ name: 'dest', type: 'pos' }], run: (a) => `tp -> ${a.dest.join(',')}` });
  r.register('summon', {
    args: [
      { name: 'type', type: 'enum', choices: ['grunt', 'heavy', 'boss'] },
      { name: 'at', type: 'pos', optional: true, default: null },
    ],
    run: (a) => `summon ${a.type}@${a.at ? a.at.join(',') : 'self'}`,
  });
  r.register('say', { args: [{ name: 'msg', type: 'rest' }], run: (a) => `say:${a.msg}` });
  r.register('mode', { args: [{ name: 'm', type: 'enum', choices: ['creative', 'survival'] }], run: (a) => `mode:${a.m}` });
  return r;
}

// ---- registry.get ----
test('registry.get: returns spec for known name, undefined for unknown', () => {
  const r = sugReg();
  assert.ok(r.get('tp') !== undefined);
  assert.equal(typeof r.get('tp').run, 'function');
  assert.equal(r.get('nope'), undefined);
});

// ---- suggest: command-name completion ----
test('suggest: empty line returns all command names sorted', () => {
  const r = sugReg();
  const result = suggest('', r);
  assert.ok(result.includes('mode'));
  assert.ok(result.includes('summon'));
  assert.ok(result.includes('tp'));
  assert.deepEqual(result, [...result].sort());
});
test('suggest: /m prefix returns [\'mode\']', () => {
  const r = sugReg();
  assert.deepEqual(suggest('/m', r), ['mode']);
});
test('suggest: /su prefix returns [\'summon\']', () => {
  const r = sugReg();
  assert.deepEqual(suggest('/su', r), ['summon']);
});
test('suggest: /summon<space> returns full enum choices list', () => {
  const r = sugReg();
  assert.deepEqual(suggest('/summon ', r), ['grunt', 'heavy', 'boss']);
});
test('suggest: /summon gr returns choices starting with gr', () => {
  const r = sugReg();
  assert.deepEqual(suggest('/summon gr', r), ['grunt']);
});
test('suggest: /mode<space> returns [\'creative\',\'survival\']', () => {
  const r = sugReg();
  assert.deepEqual(suggest('/mode ', r), ['creative', 'survival']);
});
test('suggest: /mode c returns [\'creative\']', () => {
  const r = sugReg();
  assert.deepEqual(suggest('/mode c', r), ['creative']);
});
test('suggest: /tp<space> returns [] (pos arg has no value suggestions)', () => {
  const r = sugReg();
  assert.deepEqual(suggest('/tp ', r), []);
});
test('suggest: /nope<space> returns [] (unknown command)', () => {
  const r = sugReg();
  assert.deepEqual(suggest('/nope ', r), []);
});

// ---- highlight: Minecraft-style live syntax coloring ----
function hlReg() {
  const r = createRegistry();
  r.register('tp', { args: [{ name: 'dest', type: 'pos' }], run: () => '' });
  r.register('give', { args: [{ name: 'what', type: 'enum', choices: ['money', 'health', 'armor'] }, { name: 'amount', type: 'int', optional: true }], run: () => '' });
  r.register('mode', { args: [{ name: 'm', type: 'enum', choices: ['creative', 'survival'] }], run: () => '' });
  r.register('say', { args: [{ name: 'msg', type: 'rest' }], run: () => '' });
  return r;
}
const joined = (segs) => segs.map((s) => s.text).join('');

test('highlight: empty line ⇒ []', () => {
  assert.deepEqual(highlight('', hlReg()), []);
});
test('highlight: segments ALWAYS concatenate back to the exact input (overlay alignment)', () => {
  const r = hlReg();
  for (const s of ['/give money 500', 'tp ~ ~5 50', '  /say  hi  there ', '/mode creative', '/nope x', '/']) {
    assert.equal(joined(highlight(s, r)), s);
  }
});
test('highlight: known command ⇒ slash gray + literal gray', () => {
  assert.deepEqual(highlight('/give', hlReg()), [{ text: '/', cls: 'mc-slash' }, { text: 'give', cls: 'mc-lit' }]);
});
test('highlight: unknown command ⇒ red', () => {
  assert.deepEqual(highlight('/nope', hlReg()), [{ text: '/', cls: 'mc-slash' }, { text: 'nope', cls: 'mc-err' }]);
});
test('highlight: arguments cycle aqua→yellow; valid enum + int', () => {
  const segs = highlight('/give money 500', hlReg()).filter((s) => s.text.trim());
  assert.deepEqual(segs, [
    { text: '/', cls: 'mc-slash' },
    { text: 'give', cls: 'mc-lit' },
    { text: 'money', cls: 'mc-aqua' },
    { text: '500', cls: 'mc-yellow' },
  ]);
});
test('highlight: bad enum value ⇒ red', () => {
  const segs = highlight('/mode flying', hlReg()).filter((s) => s.text.trim());
  assert.equal(segs[segs.length - 1].cls, 'mc-err');
});
test('highlight: pos triple shares one colour; non-numeric coord ⇒ red', () => {
  const segs = highlight('/tp ~ 5 abc', hlReg()).filter((s) => s.text.trim());
  assert.equal(segs.find((s) => s.text === '~').cls, 'mc-aqua');
  assert.equal(segs.find((s) => s.text === '5').cls, 'mc-aqua');   // same logical arg ⇒ same colour
  assert.equal(segs.find((s) => s.text === 'abc').cls, 'mc-err');  // invalid coordinate
});
test('highlight: extra tokens beyond the spec ⇒ red', () => {
  const segs = highlight('/mode creative extra', hlReg()).filter((s) => s.text.trim());
  assert.equal(segs.find((s) => s.text === 'creative').cls, 'mc-aqua');
  assert.equal(segs.find((s) => s.text === 'extra').cls, 'mc-err');
});
