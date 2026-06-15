// Loopback test of the co-op (host-authoritative) poker netcode WITHOUT a browser/WebRTC.
// PokerTable's net-facing logic is renderer-guarded, so with a stub `game` (fake mp/net, no DOM)
// we can verify: personalised snapshots keep hole cards private, the host rejects out-of-turn /
// wrong-player actions, the C1 ante-ack handshake builds the pool from confirmed payers only, and
// disconnect → elimination → walkover pays the survivor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legalActions } from '../../src/poker/holdem.js';
import { PokerTable } from '../../src/poker-table.js';
import { canAnte, POKER_BUYIN_TIERS } from '../../src/poker/coop.js';
import { setCardBackSkin, getCardBackSkin } from '../../src/poker/cardbacks.js';

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

// Drive the C1 ante-ack: every invited client confirms it paid → on the last one the host finalizes + deals.
function anteAll(pk) { for (const id of [...pk._invited]) pk.onAnte(id); }

test('startCoop gathers antes, then deducts the host buy-in and deals the pool', () => {
  const { game, sent, meta } = hostStub(5000);
  const pk = new PokerTable(game);
  pk.startCoop(500);
  assert.equal(meta.bank, 5000, 'gathering: nobody is charged yet');
  assert.equal(pk.tour, null, 'no table is built until the invited clients ante');
  const start = sent.find((m) => m.t === 'pkstart');
  assert.ok(start && start.d.buyIn === 500, 'pkstart invite carries the buy-in');
  anteAll(pk);                                                    // clients confirm they paid → host deals
  assert.equal(meta.bank, 4500, 'host paid its buy-in once the table was real');
  assert.equal(pk.tour.prizePool, 1500);                          // 500 × 3 entrants
});

test('personalised snapshots never leak another player\'s hole cards', () => {
  const { game, sent } = hostStub();
  const pk = new PokerTable(game);
  pk.startCoop(500); anteAll(pk);
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
  pk.startCoop(500); anteAll(pk);
  const actor = legalActions(pk.hand).seat;
  const wrong = ['host', 'c1', 'c2'].find((id) => id !== actor);
  const potBefore = pk.hand.seats.reduce((a, s) => a + s.committed, 0);
  pk.hostClientAct(wrong, { type: 'fold' });                       // not their turn → ignored
  assert.equal(pk.hand.seats.find((s) => s.id === wrong).folded, false);
  assert.equal(pk.hand.seats.reduce((a, s) => a + s.committed, 0), potBefore);
  pk.hostClientAct(actor, { type: 'fold' });                       // the actor's fold lands
  assert.equal(pk.hand.seats.find((s) => s.id === actor).folded, true);
});

test('canAnte: free ($0) always ok; otherwise the bank must cover the buy-in', () => {
  assert.equal(canAnte(0, 0), true);            // free practice
  assert.equal(canAnte(0, 500), false);         // broke, real buy-in
  assert.equal(canAnte(500, 500), true);        // exactly enough
  assert.equal(canAnte(499, 500), false);
  assert.equal(canAnte(10000, 0), true);
  assert.deepEqual(POKER_BUYIN_TIERS, [0, 500, 2000, 10000]); // free tier present
});

test('startCoop seats ONLY the anted subset and invites exactly them (no broadcast)', () => {
  const { game, sent, meta } = hostStub(5000);
  const pk = new PokerTable(game);
  pk.startCoop(500, ['host', 'c1']); anteAll(pk);   // c2 connected but never anted → must be excluded
  assert.deepEqual(pk.tour.players.map((p) => p.id).sort(), ['c1', 'host']);
  assert.equal(pk.tour.prizePool, 1000);         // 500 × 2 anted players
  assert.equal(meta.bank, 4500);                 // host paid its own buy-in once
  const invites = sent.filter((m) => m.t === 'pkstart');
  assert.deepEqual(invites.map((m) => m.to).sort(), ['c1']); // targeted to c1 only
  assert.ok(!invites.some((m) => m.to === 'c2'), 'un-anted c2 must NEVER be invited (the original race)');
  assert.ok(!invites.some((m) => m.to === 'ALL' || m.to === 'BCAST'), 'pkstart must not broadcast');
});

test('$0 FREE practice tier seats everyone with no bank movement', () => {
  const { game, meta } = hostStub(0);            // broke host
  const pk = new PokerTable(game);
  pk.startCoop(0, ['host', 'c1', 'c2']); anteAll(pk);
  assert.equal(meta.bank, 0);                    // free table → no debit
  assert.equal(pk.tour.prizePool, 0);
  assert.equal(pk.tour.players.length, 3);       // seated regardless of bank
});

test('ante-ack: the table deals the moment the last invited client antes (no deadline wait)', () => {
  const { game } = hostStub(5000);
  const pk = new PokerTable(game);
  pk.startCoop(500, ['host', 'c1', 'c2']);
  pk.onAnte('c1');
  assert.equal(pk.tour, null, 'still gathering — c2 has not anted');
  pk.onAnte('c2');                               // last one in → deal NOW, without waiting for the deadline
  assert.ok(pk.tour && pk.hand, 'dealt as soon as everyone confirmed');
  assert.equal(pk.phase, 'playing');
});

test('ante-ack: a client that never antes is excluded from the pool at the deadline (no minting)', () => {
  const { game, sent, meta } = hostStub(5000);
  const pk = new PokerTable(game);
  pk.startCoop(500, ['host', 'c1', 'c2']);
  pk.onAnte('c1');                               // only c1 confirms in time
  assert.equal(pk.tour, null, 'still gathering — waiting on c2');
  pk.update(100);                                // blow past the ante deadline with c2 outstanding
  assert.deepEqual(pk.tour.players.map((p) => p.id).sort(), ['c1', 'host']);
  assert.equal(pk.tour.prizePool, 1000, '500 × 2 — c2\'s uncollected buy-in is NEVER minted into the pool');
  assert.equal(meta.bank, 4500, 'host paid exactly once');
  assert.ok(sent.some((m) => m.t === 'pkabort' && m.to === 'c2'), 'c2 is told to bail so it refunds itself');
});

test('ante-ack: nobody antes → the game cancels and the host is never charged', () => {
  const { game, sent, meta } = hostStub(5000);
  const pk = new PokerTable(game);
  pk.startCoop(500, ['host', 'c1', 'c2']);
  pk.update(100);                                // deadline hits with only the host confirmed
  assert.equal(pk.tour, null, 'no table is built');
  assert.equal(pk.active, false, 'the game is cancelled');
  assert.equal(meta.bank, 5000, 'host is NOT charged when the table never forms');
  assert.ok(sent.filter((m) => m.t === 'pkabort').length >= 1, 'invited clients are told to bail');
});

test('disconnect folds the seat; everyone leaving hands the survivor the whole pool', () => {
  const { game, meta } = hostStub(5000);
  const pk = new PokerTable(game);
  pk.startCoop(500, ['host', 'c1', 'c2']); anteAll(pk);   // host bank 4500, pool 1500
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

test('co-op snapshots carry each human\'s real chip skin (missing → dice)', () => {
  const { game, sent } = hostStub(5000);
  game.mp.roster.get('host').chipSkin = 'casino'; // host picked the clay skin
  game.mp.roster.get('c1').chipSkin = 'star';     // a client picked the star skin
  // c2 deliberately has NO chipSkin field (old peer / never picked) → must default to 'dice'
  const pk = new PokerTable(game);
  pk.startCoop(500, ['host', 'c1', 'c2']); anteAll(pk);
  // the per-seat skins map rides along in the pkstart invite…
  const start = sent.find((m) => m.t === 'pkstart' && m.to === 'c1');
  assert.ok(start && start.d.skins, 'pkstart carries a skins map');
  // …and in every personalised snapshot. Build the OTHER seat's payload (c1) and check it sees everyone's skin.
  const payload = pk._payloadFor('c1');
  assert.ok(payload.skins, 'snapshot carries a skins map');
  assert.equal(payload.skins.host, 'casino', "host's real skin propagates");
  assert.equal(payload.skins.c1, 'star', "client's real skin propagates");
  assert.equal(payload.skins.c2, 'dice', 'a seat with no chipSkin defaults to dice');
});

test('a client role sends actions instead of mutating state, and never runs the engine', () => {
  const sent = [];
  const net = { sent, send(t, d) { sent.push({ t, d }); }, sendTo() {}, broadcast() {} };
  const game = { mp: { isHost: false, myId: 'c1', roster: new Map(), net }, meta: { bank: 3000 }, _saveMeta() {}, closePoker() {} };
  const pk = new PokerTable(game);
  pk.enterCoopClient({ buyIn: 500, names: { host: 'H', c1: 'Me' } });
  assert.equal(game.meta.bank, 2500);            // client paid its own buy-in
  assert.equal(pk.role, 'client');
  assert.equal(pk.active, true);                 // seated (no silent decline — affordability was pre-checked at accept)
  assert.ok(sent.some((m) => m.t === 'pkante'), 'client ACKs the ante to the host so its buy-in is counted');
  assert.ok(!sent.some((m) => m.t === 'pkleave'), 'an affordable accepted client must NOT bounce itself');
  assert.equal(pk.hand, null);                   // client holds no engine state
  // a client snapshot is what it renders from; an action just goes to the host
  pk.onSnap({ phase: 'playing', view: { seats: [] }, over: false });
  pk.humanAct({ type: 'call' });
  const act = sent.find((m) => m.t === 'pkact');
  assert.ok(act && act.d.action.type === 'call', 'client forwarded its action to the host');
});

// ---- card deck = the HOST's choice, table-wide (unlike per-player chip skins) ----

test('co-op card deck is the HOST\'s: the pkstart invite AND every snapshot carry it', () => {
  const { game, sent, meta } = hostStub();
  const pk = new PokerTable(game);
  meta.cardBack = 'azure'; setCardBackSkin('azure');               // host picked AZURE — the picker sets BOTH meta + the live global (so it survives _dealChips' re-apply)
  pk.startCoop(500); anteAll(pk);
  const start = sent.find((m) => m.t === 'pkstart' && m.to === 'c1');
  assert.equal(start.d.cardBack, 'azure', 'pkstart invite carries the host deck');
  const payload = pk._payloadFor('c1');
  assert.equal(payload.cardBack, 'azure', 'every personalised snapshot re-states the host deck (late-join safe)');
  setCardBackSkin('default');                                      // reset shared module state for other tests
});

test('a client renders the HOST\'s deck (overriding its own saved one); a junk deck falls back to default', () => {
  const clientStub = (savedDeck) => {
    const net = { send() {}, sendTo() {}, broadcast() {} };
    const game = { mp: { isHost: false, myId: 'c1', roster: new Map(), net }, meta: { bank: 3000, cardBack: savedDeck }, _saveMeta() {}, closePoker() {} };
    return new PokerTable(game);
  };
  setCardBackSkin('default');
  const pk = clientStub('emblem');                                 // client's own saved deck differs from the host's
  pk.enterCoopClient({ buyIn: 500, names: { host: 'H', c1: 'Me' }, cardBack: 'azure' });
  assert.equal(getCardBackSkin(), 'azure', 'client renders the host deck, overriding its own saved cardBack');
  assert.equal(pk.game.meta.cardBack, 'emblem', "the client's own saved preference is NOT overwritten");
  setCardBackSkin('azure');                                        // an unknown host deck must NOT leave this stale…
  const pk2 = clientStub('emblem');
  pk2.enterCoopClient({ buyIn: 500, names: {}, cardBack: 'totally-not-a-deck' });
  assert.equal(getCardBackSkin(), 'default', '…it falls back to the default deck deterministically');
  setCardBackSkin('default');
});
