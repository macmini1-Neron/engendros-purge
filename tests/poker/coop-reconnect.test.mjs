// Loopback tests for the co-op poker RECONNECT path (PR-B / B1): a dropped seat keeps its stack for a
// grace window instead of busting instantly, and a reconnecting player re-keys onto its seat WITHOUT
// paying again. Renderer-guarded, so a stub `game` (no DOM/WebRTC) drives it. The live WebRTC re-attach
// is the 2-PC manual gate; here we pin the data-structure correctness (no value minted/lost, no charge).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from '../../src/poker-table.js';
import { ChipBank, value } from '../../src/poker/chipbank.js';

function hostStub(bank = 5000) {
  const sent = [];
  const roster = new Map([['host', { name: 'H', chipSkin: 'star' }], ['c1', { name: 'C1', chipSkin: 'lenin' }], ['c2', { name: 'C2', chipSkin: 'marx' }]]);
  const net = { sent, send(t, d) { sent.push({ to: 'ALL', t, d }); }, sendTo(id, t, d) { sent.push({ to: id, t, d }); }, broadcast(t, d) { sent.push({ to: 'BCAST', t, d }); } };
  const meta = { bank };
  const game = { mp: { isHost: true, myId: 'host', roster, net }, meta, _saveMeta() {}, closePoker() {}, hud: { toast() {} } };
  return { game, sent, meta };
}
const anteAll = (pk) => { for (const id of [...pk._invited]) pk.onAnte(id); };

// ---- chipbank.rekey (pure leaf) -------------------------------------------

test('chipbank.rekey renames a seat across stack/bet/dust/skins with no value change', () => {
  const bank = new ChipBank();
  bank.dealStart(['a', 'b'], { 100: 2, 25: 0, 50: 2 }, { 50: 4, 20: 5, 10: 5, 5: 10 }, { a: 'star', b: 'lenin' });
  const before = bank.stackValue('a');
  const total = value(bank.stacks.a) + value(bank.stacks.b) + value(bank.pot) + value(bank.float);
  assert.ok(bank.rekey('a', 'x'), 'rekey applied');
  assert.equal('a' in bank.stacks, false, 'old id gone from stacks');
  assert.equal(bank.stackValue('x'), before, 'new id holds the exact same value');
  assert.equal(bank.skins.x, 'star', 'skin moved with the seat');
  assert.ok(bank.skinsAt.stacks.x && !bank.skinsAt.stacks.a, 'provenance ledger moved');
  assert.equal(value(bank.stacks.x) + value(bank.stacks.b) + value(bank.pot) + value(bank.float), total, 'no value minted or lost');
  assert.ok(bank.verifySkins(), 'cosmetic ledger still reconciles after rekey');
});

test('chipbank.rekey is a no-op on a missing id or a collision', () => {
  const bank = new ChipBank();
  bank.dealStart(['a', 'b'], { 50: 1 }, {});
  assert.equal(bank.rekey('zzz', 'x'), false, 'absent old id → no-op');
  assert.equal(bank.rekey('a', 'b'), false, 'colliding new id → no-op');
  assert.equal(bank.rekey('a', 'a'), false, 'same id → no-op');
  assert.ok('a' in bank.stacks && 'b' in bank.stacks, 'untouched');
});

// ---- grace on drop --------------------------------------------------------

test('a dropped seat keeps its stack (grace) and does not bust the game while 2+ stay connected', () => {
  const { game } = hostStub(5000);
  const pk = new PokerTable(game);
  pk.startCoop(500, ['host', 'c1', 'c2']); anteAll(pk);
  const c1StackBefore = pk.tour.players.find((p) => p.id === 'c1').stack;
  pk.onPeerDisconnect('c1');                                   // c1 drops (reload/blip)
  assert.ok(pk._dropped.has('c1'), 'flagged dropped');
  assert.ok(pk._dropGrace.has('c1'), 'grace timer armed');
  assert.equal(pk.tour.players.find((p) => p.id === 'c1').stack, c1StackBefore, 'stack preserved — NOT busted on drop');
  assert.notEqual(pk.phase, 'over', 'host + c2 still connected → the table keeps going');
});

// ---- reattach (re-key at the safe boundary, no re-charge) ------------------

test('_rekeySeat re-keys a dropped seat old→new across tour/names/skins/chipbank and clears its drop', () => {
  const { game } = hostStub(5000);
  const pk = new PokerTable(game);
  pk.startCoop(500, ['host', 'c1', 'c2']); anteAll(pk);
  pk.onPeerDisconnect('c1');
  const stack = pk.tour.players.find((p) => p.id === 'c1').stack;
  const chipVal = pk.chipbank.stackValue('c1');
  pk._rekeySeat('c1', 'c1b');
  assert.equal(pk.tour.players.some((p) => p.id === 'c1'), false, 'old seat id gone from the tournament');
  assert.equal(pk.tour.players.find((p) => p.id === 'c1b').stack, stack, 'new seat keeps the stack');
  assert.equal(pk.chipbank.stackValue('c1b'), chipVal, 'chip value carried to the new id');
  assert.equal(pk.names.c1b, 'C1', 'name carried');
  assert.equal(pk._dropped.has('c1'), false, 'no longer flagged dropped — the player is back');
  assert.equal(pk._dropGrace.has('c1'), false, 'grace cleared');
});

test('hostReattach schedules the re-key + sends pkresync, and NEVER charges the returning player', () => {
  const { game, sent, meta } = hostStub(5000);
  const pk = new PokerTable(game);
  pk.startCoop(500, ['host', 'c1', 'c2']); anteAll(pk);
  const bankAfterDeal = meta.bank;                            // host already paid its own buy-in at the deal
  pk.onPeerDisconnect('c1');
  sent.length = 0;
  assert.ok(pk.hostReattach('c1', 'c1b'), 'reattach accepted for a seated player');
  assert.deepEqual(pk._reattach[0], ['c1', 'c1b'], 're-key queued for the next hand boundary');
  const resync = sent.find((m) => m.t === 'pkresync' && m.to === 'c1b');
  assert.ok(resync, 'pkresync sent to the new peer id');
  assert.equal(resync.d.buyIn, 500, 'pkresync carries the table buy-in');
  assert.equal(meta.bank, bankAfterDeal, 'host bank unchanged — reattach is not a charge');
  assert.equal(pk.hostReattach('nobody', 'x'), false, 'reattach rejects a non-seated id');
});

// ---- resync (client side, no double-charge) -------------------------------

test('enterCoopResync rebuilds the client table WITHOUT spending the buy-in again', () => {
  const meta = { bank: 4500, chipSkin: 'lenin', cardBack: 'default' };
  const net = { send() {}, sendTo() {} };
  const game = { mp: { isHost: false, myId: 'c1b', roster: new Map(), net }, meta, _saveMeta() {}, closePoker() {}, hud: { toast() {} } };
  const pk = new PokerTable(game);
  pk.enterCoopResync({ buyIn: 500, names: { host: 'H', c1b: 'C1' }, skins: { c1b: 'lenin' }, cardBack: 'default' });
  assert.equal(meta.bank, 4500, 'bank UNCHANGED — already paid before the reload, must not pay twice');
  assert.equal(pk.role, 'client');
  assert.equal(pk.coop, true);
  assert.equal(pk.active, true);
  assert.equal(pk._paid, 500, 'records the prior payment so a later host-abort refunds correctly');
});
