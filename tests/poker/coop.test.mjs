// Loopback test of the co-op (host-authoritative) poker netcode WITHOUT a browser/WebRTC.
// PokerTable's net-facing logic is renderer-guarded, so with a stub `game` (fake mp/net, no DOM)
// we can verify: personalised snapshots keep hole cards private, the host rejects out-of-turn /
// wrong-player actions, and disconnect → elimination → walkover pays the survivor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legalActions } from '../../src/poker/holdem.js';
import { PokerTable } from '../../src/poker-table.js';

function hostStub(bank = 5000) {
  const sent = [];
  const roster = new Map([['host', { name: 'H' }], ['c1', { name: 'Серёга' }], ['c2', { name: 'C2' }]]);
  const net = {
    sent,
    send(t, d) { sent.push({ to: 'ALL', t, d }); },
    sendTo(id, t, d) { sent.push({ to: id, t, d }); },
    broadcast(t, d) { sent.push({ to: 'BCAST', t, d }); },
  };
  const meta = { bank };
  const game = { mp: { isHost: true, myId: 'host', roster, net }, meta, _saveMeta() {}, closePoker() {}, hud: { toast() {} } };
  return { game, sent, meta };
}

test('startCoop deducts the host buy-in and pulls clients in', () => {
  const { game, sent, meta } = hostStub(5000);
  const pk = new PokerTable(game);
  pk.startCoop(500);
  assert.equal(meta.bank, 4500);                                   // host paid its buy-in
  const start = sent.find((m) => m.t === 'pkstart');
  assert.ok(start && start.d.buyIn === 500, 'pkstart broadcast with buy-in');
  assert.equal(pk.tour.prizePool, 1500);                          // 500 × 3 entrants
});

test('personalised snapshots never leak another player\'s hole cards', () => {
  const { game, sent } = hostStub();
  const pk = new PokerTable(game);
  pk.startCoop(500);
  const snapC1 = [...sent].reverse().find((m) => m.t === 'pksnap' && m.to === 'c1');
  assert.ok(snapC1, 'a snapshot was sent to c1');
  const seats = snapC1.d.view.seats;
  const c1 = seats.find((s) => s.id === 'c1');
  assert.equal(c1.hole.length, 2, 'c1 sees its own two cards');
  for (const other of seats.filter((s) => s.id !== 'c1')) {
    assert.equal(other.hole, null, `c1 must NOT see ${other.id}'s hole cards`);
  }
});

test('host rejects an action from the wrong player and accepts the actor', () => {
  const { game } = hostStub();
  const pk = new PokerTable(game);
  pk.startCoop(500);
  const actor = legalActions(pk.hand).seat;
  const wrong = ['host', 'c1', 'c2'].find((id) => id !== actor);
  const potBefore = pk.hand.seats.reduce((a, s) => a + s.committed, 0);
  pk.hostClientAct(wrong, { type: 'fold' });                       // not their turn → ignored
  assert.equal(pk.hand.seats.find((s) => s.id === wrong).folded, false);
  assert.equal(pk.hand.seats.reduce((a, s) => a + s.committed, 0), potBefore);
  pk.hostClientAct(actor, { type: 'fold' });                       // the actor's fold lands
  assert.equal(pk.hand.seats.find((s) => s.id === actor).folded, true);
});

test('disconnect folds the seat; everyone leaving hands the survivor the whole pool', () => {
  const { game, meta } = hostStub(5000);
  const pk = new PokerTable(game);
  pk.startCoop(500);                 // host bank 4500, pool 1500
  pk.onPeerDisconnect('c1');         // c1 folds + flagged dropped
  pk.onPeerDisconnect('c2');         // only host remains → current hand ends uncontested
  assert.ok(pk._dropped.has('c1') && pk._dropped.has('c2'));
  // chip layer: the uncontested fold-win awarded the pot physically without breaking conservation
  pk.chipbank.verify();
  for (const seat of pk.hand.seats) assert.equal(pk.chipbank.stackValue(seat.id), seat.stack, `chip value == engine stack for ${seat.id} on the fold-win`);
  pk.update(4);                       // past RESULT_SECS → settle → next hand sees <2 alive → walkover
  assert.equal(pk.phase, 'over');
  assert.equal(pk.tour.result.winner, 'host');
  assert.equal(meta.bank, 6000);     // 4500 + 1500 prize pool (winner-takes-all)
});

test('a client role sends actions instead of mutating state, and never runs the engine', () => {
  const sent = [];
  const net = { sent, send(t, d) { sent.push({ t, d }); }, sendTo() {}, broadcast() {} };
  const game = { mp: { isHost: false, myId: 'c1', roster: new Map(), net }, meta: { bank: 3000 }, _saveMeta() {}, closePoker() {} };
  const pk = new PokerTable(game);
  pk.enterCoopClient({ buyIn: 500, names: { host: 'H', c1: 'Me' } });
  assert.equal(game.meta.bank, 2500);            // client paid its own buy-in
  assert.equal(pk.role, 'client');
  assert.equal(pk.hand, null);                   // client holds no engine state
  // a client snapshot is what it renders from; an action just goes to the host
  pk.onSnap({ phase: 'playing', view: { seats: [] }, over: false });
  pk.humanAct({ type: 'call' });
  const act = sent.find((m) => m.t === 'pkact');
  assert.ok(act && act.d.action.type === 'call', 'client forwarded its action to the host');
});
