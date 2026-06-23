// Loopback tests for the co-op ITEM-WAGER netcode (PR-5): each seat escrows its own asymmetric basket
// (items + money) out of its account ItemBank at lock-in, the host seals the union, and the winner takes
// the whole union — credited exactly once (idempotent against the 6s 'over' re-broadcast), refunded
// exactly once on abort. Renderer-guarded, so stub `game`s (with a real ItemBank, no DOM/WebRTC) drive it.
// WIN and REFUND are mutually exclusive per seat. The live WebRTC item move is the 2-PC manual gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from '../../src/poker-table.js';
import { ItemBank } from '../../src/itembank.js';

function hostStub(bank, owned, baskets) {
  const sent = [];
  const roster = new Map([
    ['host', { name: 'H', basket: baskets.host }],
    ['c1', { name: 'C1', basket: baskets.c1 }],
    ['c2', { name: 'C2', basket: baskets.c2 }],
  ]);
  const net = { sent, send(t, d) { sent.push({ to: 'ALL', t, d }); }, sendTo(id, t, d) { sent.push({ to: id, t, d }); }, broadcast(t, d) { sent.push({ to: 'BCAST', t, d }); } };
  const meta = { bank };
  const items = new ItemBank(owned);
  const game = { mp: { isHost: true, myId: 'host', roster, net }, meta, items, _saveMeta() {}, closePoker() {}, hud: { toast() {} } };
  return { game, sent, meta, items };
}
function clientStub(bank, owned, myId = 'c1') {
  const sent = [];
  const net = { sent, send(t, d) { sent.push({ t, d }); }, sendTo() {} };
  const meta = { bank, cardBack: 'default' };
  const items = new ItemBank(owned);
  const game = { mp: { isHost: false, myId, roster: new Map(), net }, meta, items, _saveMeta() {}, closePoker() {}, hud: { toast() {} } };
  return { game, meta, items };
}
const anteAll = (pk) => { for (const id of [...pk._invited]) pk.onAnte(id); };

// ---- host side: escrow own basket, seal the union, win it ------------------

test('host escrows its own basket, the pot seals the UNION of all baskets, and the winner takes it', () => {
  const { game, meta, items } = hostStub(5000, { medkit: 3, garand: 1 },
    { host: { items: { medkit: 1 }, money: 500 }, c1: { items: { medkit: 2 }, money: 500 }, c2: { items: {}, money: 500 } });
  const pk = new PokerTable(game);
  pk.startCoop(500, ['host', 'c1', 'c2']); anteAll(pk);
  assert.equal(items.count('medkit'), 2, 'host escrowed 1 medkit out of its ItemBank (3→2)');
  assert.equal(meta.bank, 4500, 'host escrowed its $500');
  assert.deepEqual(pk.itemPot._minted.items, { medkit: 3 }, 'sealed union = host 1 + c1 2 + c2 0');
  assert.equal(pk.tour.prizePool, 1500, 'prizePool = Σ money (500×3)');
  assert.ok(pk.itemPot.verify());
  // everyone else drops → host is the lone survivor → walkover
  pk.onPeerDisconnect('c1'); pk.onPeerDisconnect('c2'); pk.update(4);
  assert.equal(pk.phase, 'over');
  assert.equal(pk.tour.result.winner, 'host');
  assert.equal(items.count('medkit'), 5, 'winner takes the whole union: 2 (kept) + 3 (won) = 5');
  assert.equal(meta.bank, 6000, '4500 + the 1500 pool');
});

test('host item credit is idempotent — a second _payout (re-broadcast) does not double-award', () => {
  const { game, items } = hostStub(5000, { medkit: 2 },
    { host: { items: { medkit: 1 }, money: 500 }, c1: { items: { medkit: 1 }, money: 500 }, c2: { items: {}, money: 500 } });
  const pk = new PokerTable(game);
  pk.startCoop(500, ['host', 'c1', 'c2']); anteAll(pk);
  pk.onPeerDisconnect('c1'); pk.onPeerDisconnect('c2'); pk.update(4);
  const after = items.count('medkit');
  pk._payout(); pk._payout();                                   // simulate extra over-window ticks
  assert.equal(items.count('medkit'), after, 'no double item credit');
});

test('host abort refunds the escrowed items + money (exactly once), mutually exclusive with a win', () => {
  const { game, meta, items } = hostStub(5000, { medkit: 3 },
    { host: { items: { medkit: 2 }, money: 500 }, c1: { items: {}, money: 500 }, c2: { items: {}, money: 500 } });
  const pk = new PokerTable(game);
  pk.startCoop(500, ['host', 'c1', 'c2']); anteAll(pk);
  assert.equal(items.count('medkit'), 1, 'host escrowed 2 (3→1)');
  assert.equal(meta.bank, 4500);
  pk.leave();                                                   // host leaves before 'over' → abort + refund
  assert.equal(items.count('medkit'), 3, 'items refunded');
  assert.equal(meta.bank, 5000, 'money refunded');
  pk._refund();                                                 // a stray second refund must be a no-op
  assert.equal(items.count('medkit'), 3, 'refund is idempotent');
  assert.equal(meta.bank, 5000);
});

// ---- client side: lock-in, credit on win, refund on abort ------------------

test('client escrows its own basket on pkstart, then credits the won union via the over-snapshot (once)', () => {
  const { game, meta, items } = clientStub(4000, { medkit: 2 });
  const pk = new PokerTable(game);
  pk.enterCoopClient({ buyIn: 500, names: {}, skins: {}, baskets: { c1: { items: { medkit: 1 }, money: 500 } } });
  assert.equal(items.count('medkit'), 1, 'client escrowed 1 medkit (2→1)');
  assert.equal(meta.bank, 3500, 'client escrowed its $500');
  const overSnap = { over: true, phase: 'over', moneyPayout: 1500, itemPayout: { medkit: 3, garand: 1 }, seq: 1 };
  pk.onSnap(overSnap);
  assert.equal(items.count('medkit'), 4, 'won union credited: 1 + 3');
  assert.equal(items.count('garand'), 1, 'won a garand too');
  assert.equal(meta.bank, 5000, '3500 + 1500');
  pk.onSnap({ ...overSnap, seq: 2 });                           // re-broadcast
  assert.equal(items.count('medkit'), 4, 'idempotent — no double item credit');
  assert.equal(meta.bank, 5000, 'idempotent — no double money credit');
});

test('client abort refunds its escrowed basket (items + money), exactly once', () => {
  const { game, meta, items } = clientStub(4000, { medkit: 2 });
  const pk = new PokerTable(game);
  pk.enterCoopClient({ buyIn: 500, baskets: { c1: { items: { medkit: 1 }, money: 500 } } });
  assert.equal(items.count('medkit'), 1);
  assert.equal(meta.bank, 3500);
  pk.onAbort();
  assert.equal(items.count('medkit'), 2, 'items refunded on abort');
  assert.equal(meta.bank, 4000, 'money refunded on abort');
  pk.onAbort();                                                 // dup abort
  assert.equal(items.count('medkit'), 2, 'refund idempotent');
});

test('a non-winning client never credits items (loss = the escrowed basket is gone)', () => {
  const { game, meta, items } = clientStub(4000, { medkit: 2 });
  const pk = new PokerTable(game);
  pk.enterCoopClient({ buyIn: 500, baskets: { c1: { items: { medkit: 1 }, money: 500 } } });
  pk.onSnap({ over: true, phase: 'over', moneyPayout: 0, itemPayout: {}, seq: 1 }); // someone else won
  assert.equal(items.count('medkit'), 1, 'loser keeps only its un-staked copy — the staked medkit is gone');
  assert.equal(meta.bank, 3500, 'no money credited to a loser');
});

// ---- asymmetric stakes + N-seat -------------------------------------------

test('asymmetric baskets: prizePool = Σ money and the union spans every seat (3 seats)', () => {
  const { game } = hostStub(5000, { medkit: 5, bazooka: 1 },
    { host: { items: { bazooka: 1 }, money: 0 }, c1: { items: { medkit: 1 }, money: 1000 }, c2: { items: {}, money: 500 } });
  const pk = new PokerTable(game);
  pk.startCoop(0, ['host', 'c1', 'c2']); anteAll(pk);           // headline buy-in 0; the baskets carry the real money
  assert.equal(pk.tour.prizePool, 1500, 'Σ money = 0 + 1000 + 500');
  assert.deepEqual(pk.itemPot._minted.items, { bazooka: 1, medkit: 1 }, 'union across asymmetric baskets');
  assert.ok(pk.itemPot.verify());
});

test('money-only baskets reproduce the uniform game (no items, prizePool = buyIn × seats)', () => {
  const { game, meta, items } = hostStub(5000, {}, { host: undefined, c1: undefined, c2: undefined }); // no baskets → money-only default
  const pk = new PokerTable(game);
  pk.startCoop(500, ['host', 'c1', 'c2']); anteAll(pk);
  assert.equal(pk.tour.prizePool, 1500, 'buyIn × 3');
  assert.deepEqual(pk.itemPot._minted.items, {}, 'no items staked');
  assert.equal(items.count('medkit'), 0);
  assert.equal(meta.bank, 4500, 'just the money buy-in');
});
