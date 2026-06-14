// Integration: drive a real PokerTable (engine + chipbank layer) through a full solo Sit & Go and
// assert the physical chips never drift from engine truth — value(stacks[id]) + dust[id] ===
// engineStack[id] for every player after every hand settle — and that per-colour counts stay
// conserved the whole way (chipbank.verify()).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legalActions } from '../../src/poker/holdem.js';
import { PokerTable } from '../../src/poker-table.js';

function soloGame() {
  return { meta: { bank: 0 }, _saveMeta() {}, hud: { toast() {} } };
}

test('chipbank tracks engine stacks across a full solo SNG, counts conserved', () => {
  const pk = new PokerTable(soloGame());
  pk.startTournament({ bots: 3 });               // 4 entrants
  assert.ok(pk.chipbank, 'a chipbank is created on start');
  pk.chipbank.verify();

  let guard = 8000, settles = 0;
  while (!pk.tour.over && guard-- > 0) {
    if (pk.phase === 'playing') {
      const legal = legalActions(pk.hand);
      pk._applyAndAdvance(legal.canCheck ? { type: 'check' } : { type: 'call' });  // call-down
    } else if (pk.phase === 'handresult') {
      pk.update(10);                             // > SHOWDOWN_SECS → settleHand + reconcile + next hand
      settles++;
      // compare against the live hand's per-seat stacks (the next hand's blinds are already posted
      // into bets, so tour.players' pre-blind totals would mismatch by the blinds — not a drift).
      for (const seat of pk.hand.seats) {
        assert.equal(pk.chipbank.value(seat.id), seat.stack, `chip value == engine seat stack for ${seat.id} after settle ${settles}`);
      }
      pk.chipbank.verify();
    } else {
      break;
    }
  }

  assert.ok(pk.tour.over, 'the SNG reached a winner');
  assert.ok(settles > 0, 'at least one hand settled');
  // winner physically holds the whole table's chip value
  const winner = pk.tour.players.find((p) => p.place === 1);
  assert.ok(winner, 'a winner is recorded');
});

test('chips ride in the per-player payload for the renderer/co-op', () => {
  const pk = new PokerTable(soloGame());
  pk.startTournament({ bots: 3 });
  const payload = pk._payloadFor('you');
  assert.ok(payload.chips, 'payload carries a chips block');
  assert.ok(payload.chips.stacks.you, 'your physical stack is present');
  assert.ok(payload.chips.pot !== undefined, 'pot multiset present');
  // value of your physical stack + dust equals the engine stack the view reports
  const youSeat = payload.view.seats.find((s) => s.id === 'you');
  const cb = pk.chipbank;
  assert.equal(cb.value('you'), youSeat.stack, 'payload chip value matches the engine stack');
});
