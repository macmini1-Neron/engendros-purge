// One-hand No-Limit Texas Hold'em state machine. Pure. No THREE, no DOM.
// Drives a single hand: blinds, button, heads-up rule, betting (min-raise + no-reopen on
// incomplete all-in, big-blind option), street progression with burns, showdown via pot/handeval.
import { makeDeck, shuffle } from './cards.js';
import { evaluate } from './handeval.js';
import { buildPots, awardPots } from './pot.js';

// ---- seat predicates ----
function canAct(s) { return !s.folded && !s.allIn && s.stack > 0; }
function actableCount(state) { return state.seats.filter(canAct).length; }
function nonFolded(state) { return state.seats.filter((s) => !s.folded); }

// first seat that canAct, scanning clockwise from `start` (inclusive). null if <2 can act.
function firstActableFrom(state, start) {
  if (actableCount(state) < 2) return null;
  const n = state.seats.length;
  for (let k = 0; k < n; k++) {
    const idx = (start + k) % n;
    if (canAct(state.seats[idx])) return idx;
  }
  return null;
}

// next seat that still needs to act (canAct && !acted), scanning from `fromExclusive`. null if none.
function nextActable(state, fromExclusive) {
  const n = state.seats.length;
  for (let k = 1; k <= n; k++) {
    const idx = (fromExclusive + k) % n;
    const s = state.seats[idx];
    if (canAct(s) && !s.acted) return idx;
  }
  return null;
}

function post(state, idx, amount) {
  const s = state.seats[idx];
  const put = Math.min(amount, s.stack);
  s.stack -= put; s.roundBet = put; s.committed = put;
  if (s.stack === 0) s.allIn = true;
}

function commit(s, amt) {
  s.stack -= amt; s.roundBet += amt; s.committed += amt;
  if (s.stack === 0) s.allIn = true;
}

function burn(state) { if (state.deck.length) state.burn.push(state.deck.shift()); }
function dealCard(state) { return state.deck.shift(); }

// ---- public API ----

// cfg: { players:[{id, stack}], button, sb, bb, rng, deck? }
// deck (optional) overrides the shuffle for deterministic tests; dealt from the front.
export function startHand(cfg) {
  const { players, button, sb, bb, rng } = cfg;
  const seats = players.map((p) => ({
    id: p.id, stack: p.stack, hole: [],
    committed: 0, roundBet: 0, folded: false, allIn: false, acted: false, noRaise: false,
  }));
  const n = seats.length;
  const state = {
    seats, button, sb, bb,
    deck: cfg.deck ? cfg.deck.slice() : shuffle(makeDeck(), rng),
    burn: [], board: [],
    street: 'preflop', toAct: null,
    currentBet: 0, minRaise: bb,
    result: null, log: [],
  };

  const sbIdx = n === 2 ? button : (button + 1) % n;
  const bbIdx = n === 2 ? (button + 1) % n : (button + 2) % n;
  post(state, sbIdx, sb);
  post(state, bbIdx, bb);
  state.currentBet = bb;
  state.minRaise = bb;

  // deal two hole cards each, starting left of the button
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) {
      const idx = (button + 1 + k) % n;
      state.seats[idx].hole.push(dealCard(state));
    }
  }

  // first to act: heads-up = button (SB); else first canAct left of the big blind (UTG)
  state.toAct = firstActableFrom(state, n === 2 ? button : (bbIdx + 1) % n);
  if (state.toAct === null) advanceStreet(state); // nobody can act (e.g. all-in blinds) → deal out
  return state;
}

export function legalActions(state) {
  const i = state.toAct;
  if (i === null) return null;
  const s = state.seats[i];
  const callAmount = state.currentBet - s.roundBet;
  const maxRaiseTo = s.roundBet + s.stack;
  return {
    seat: s.id,
    toAct: i,
    canFold: true,
    canCheck: callAmount === 0,
    canCall: callAmount > 0 && s.stack > 0,
    callAmount: Math.min(Math.max(callAmount, 0), s.stack),
    canRaise: maxRaiseTo > state.currentBet && !s.noRaise && s.stack > 0,
    minRaiseTo: Math.min(state.currentBet + state.minRaise, maxRaiseTo),
    maxRaiseTo,
  };
}

// action: { type:'fold'|'check'|'call'|'raise'|'allin', to? }. Mutates and returns state.
export function applyAction(state, action) {
  const legal = legalActions(state);
  if (!legal) throw new Error('no one to act');
  const i = state.toAct;
  const s = state.seats[i];
  const type = action.type;

  if (type === 'fold') {
    s.folded = true; s.acted = true;
  } else if (type === 'check') {
    if (!legal.canCheck) throw new Error('illegal check');
    s.acted = true;
  } else if (type === 'call') {
    if (!legal.canCall) throw new Error('illegal call');
    commit(s, Math.min(legal.callAmount, s.stack));
    s.acted = true;
  } else if (type === 'raise' || type === 'allin') {
    if (type === 'allin' && legal.maxRaiseTo <= state.currentBet) {
      // can't actually raise (stack only covers a call) → treat as an all-in call
      commit(s, Math.min(legal.callAmount, s.stack));
      s.acted = true;
    } else {
      const to = type === 'allin' ? legal.maxRaiseTo : action.to;
      if (!legal.canRaise) throw new Error('illegal raise');
      if (to < legal.minRaiseTo || to > legal.maxRaiseTo) throw new Error('raise out of range');
      commit(s, to - s.roundBet);
      const raiseSize = to - state.currentBet;
      state.currentBet = to;
      if (raiseSize >= state.minRaise) {
        // full raise → reopen betting for everyone still able to act
        state.minRaise = raiseSize;
        for (const o of state.seats) if (canAct(o)) { o.acted = false; o.noRaise = false; }
      } else {
        // incomplete all-in → players who already acted may call/fold but not raise
        for (const o of state.seats) if (canAct(o) && o.acted) { o.acted = false; o.noRaise = true; }
      }
      s.acted = true;
    }
  } else {
    throw new Error('unknown action type: ' + type);
  }

  state.log.push({ seat: s.id, type, to: action.to });

  if (maybeEndUncontested(state)) return state;
  const next = nextActable(state, i);
  if (next !== null) state.toAct = next;
  else advanceStreet(state);
  return state;
}

// ---- internal progression ----

function maybeEndUncontested(state) {
  const live = nonFolded(state);
  if (live.length !== 1) return false;
  const w = live[0];
  const pot = state.seats.reduce((a, s) => a + s.committed, 0);
  w.stack += pot;
  state.street = 'complete';
  state.toAct = null;
  state.result = {
    winnings: { [w.id]: pot },
    board: state.board.slice(),
    reveals: [],
    pots: [{ amount: pot, eligible: [w.id] }],
    uncontested: true,
  };
  return true;
}

function advanceStreet(state) {
  const n = state.seats.length;
  while (true) {
    if (state.street === 'preflop') { state.street = 'flop'; burn(state); state.board.push(dealCard(state), dealCard(state), dealCard(state)); }
    else if (state.street === 'flop') { state.street = 'turn'; burn(state); state.board.push(dealCard(state)); }
    else if (state.street === 'turn') { state.street = 'river'; burn(state); state.board.push(dealCard(state)); }
    else if (state.street === 'river') { state.street = 'complete'; doShowdown(state); return; }

    for (const s of state.seats) { s.roundBet = 0; s.acted = false; s.noRaise = false; }
    state.currentBet = 0; state.minRaise = state.bb;

    const first = firstActableFrom(state, (state.button + 1) % n);
    if (first !== null) { state.toAct = first; return; }
    // else: fewer than two players can act → no betting this street, deal the next one
  }
}

function doShowdown(state) {
  const live = nonFolded(state);
  if (live.length === 1) { maybeEndUncontested(state); return; }
  const contribs = state.seats.map((s) => ({ seat: s.id, committed: s.committed, folded: s.folded }));
  const pots = buildPots(contribs);
  const rankOf = {};
  for (const s of live) rankOf[s.id] = evaluate([...s.hole, ...state.board]);
  const n = state.seats.length;
  const order = [];
  for (let k = 0; k < n; k++) order.push(state.seats[(state.button + 1 + k) % n].id);
  const winnings = awardPots(pots, rankOf, order);
  for (const s of state.seats) if (winnings[s.id]) s.stack += winnings[s.id];
  state.toAct = null;
  state.result = {
    winnings,
    board: state.board.slice(),
    reveals: live.map((s) => ({ id: s.id, hole: s.hole.slice(), rank: rankOf[s.id] })),
    pots,
  };
}

// ---- views (privacy boundary) ----

export function publicView(state) {
  const revealed = state.street === 'complete' && state.result && !state.result.uncontested;
  const revealIds = revealed ? new Set(state.result.reveals.map((r) => r.id)) : new Set();
  return {
    street: state.street,
    board: state.board.slice(),
    toAct: state.toAct,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    button: state.button,
    sb: state.sb,
    bb: state.bb,
    pot: state.seats.reduce((a, s) => a + s.committed, 0),
    seats: state.seats.map((s, idx) => ({
      id: s.id, idx, stack: s.stack, roundBet: s.roundBet, committed: s.committed,
      folded: s.folded, allIn: s.allIn, hasCards: s.hole.length > 0,
      hole: revealIds.has(s.id) ? s.hole.slice() : null,
    })),
    result: state.result
      ? { winnings: state.result.winnings, reveals: state.result.reveals || [], uncontested: !!state.result.uncontested }
      : null,
  };
}

export function privateView(state, seatId) {
  const v = publicView(state);
  for (const seat of v.seats) {
    if (seat.id === seatId) {
      const real = state.seats.find((s) => s.id === seatId);
      seat.hole = real ? real.hole.slice() : null;
    }
  }
  return v;
}

export function isComplete(state) { return state.street === 'complete'; }
