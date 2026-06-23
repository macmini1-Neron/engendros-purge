// Host turn-engine + money paths that the loopback coop suite didn't cover: the shot-clock auto-act,
// and the client credit/refund idempotency guards (_credited / _refunded). No DOM/WebRTC — stub game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legalActions } from '../../src/poker/holdem.js';
import { PokerTable } from '../../src/poker-table.js';

function hostStub(bank = 5000) {
  const sent = [];
  const roster = new Map([['host', { name: 'H' }], ['c1', { name: 'C1' }], ['c2', { name: 'C2' }]]);
  const net = { sent, send() {}, sendTo() {}, broadcast() {} };
  const meta = { bank };
  return { game: { mp: { isHost: true, myId: 'host', roster, net }, meta, _saveMeta() {}, closePoker() {}, hud: { toast() {} } }, meta };
}
function clientStub(bank) {
  const meta = { bank };
  return { game: { mp: { isHost: false, myId: 'c1', roster: new Map(), net: { send() {}, sendTo() {} } }, meta, _saveMeta() {}, closePoker() {}, hud: { toast() {} } }, meta };
}
const anteAll = (pk) => { for (const id of [...pk._invited]) pk.onAnte(id); };

test('the host shot clock auto-acts for a seat that runs out of time (preflop = fold facing the BB)', () => {
  const { game } = hostStub();
  const pk = new PokerTable(game);
  pk.startCoop(500, ['host', 'c1', 'c2']); anteAll(pk);
  pk._hold = 0;                                   // skip the deal-in presentation hold
  const actor = legalActions(pk.hand).seat;       // preflop first-to-act faces the big blind (can't check)
  assert.equal(legalActions(pk.hand).canCheck, false, 'UTG faces the BB');
  pk.update(999);                                 // far past ACT_SECS_COOP → the clock fires once
  assert.equal(pk.hand.seats.find((s) => s.id === actor).folded, true, 'the timed-out seat auto-folded');
});

test('a client credits its payout EXACTLY once (idempotent via _credited)', () => {
  const { game, meta } = clientStub(4500);        // already paid the 500 buy-in (bank 5000 → 4500)
  const pk = new PokerTable(game);
  pk.role = 'client'; pk.coop = true; pk.mode = 'money'; pk.active = true; pk._paid = 500;
  pk._credited = false; pk._lastSnapSeq = 0;
  const overSnap = { seq: 1, over: true, phase: 'over', moneyPayout: 1500, cardBack: 'default' };
  pk.onSnap({ ...overSnap });
  assert.equal(meta.bank, 6000, 'credited the 1500 prize once (4500 + 1500)');
  pk.onSnap({ ...overSnap, seq: 2 });             // a re-broadcast of the terminal snapshot
  assert.equal(meta.bank, 6000, 'NOT credited twice');
});

test('a client refund returns exactly the buy-in once, and never after a credit', () => {
  const { game, meta } = clientStub(4500);
  const pk = new PokerTable(game);
  pk.role = 'client'; pk.coop = true; pk.mode = 'money'; pk._paid = 500;
  pk._credited = false; pk._refunded = false;
  pk._refund();
  assert.equal(meta.bank, 5000, 'refunded exactly the buy-in (4500 + 500)');
  pk._refund();
  assert.equal(meta.bank, 5000, 'second refund is a no-op (guarded by _refunded)');

  // a player that already got CREDITED must not also be refunded
  const c2 = clientStub(6000); const pk2 = new PokerTable(c2.game);
  pk2.role = 'client'; pk2.coop = true; pk2.mode = 'money'; pk2._paid = 500; pk2._credited = true; pk2._refunded = false;
  pk2._refund();
  assert.equal(c2.meta.bank, 6000, 'no refund after a credit (mutually exclusive)');
});
