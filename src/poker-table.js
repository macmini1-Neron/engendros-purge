// PokerTable — the host-authoritative orchestrator that turns the pure engine into a playable
// table. Owns a Tournament + the current holdem hand, ticks the action timer, drives bots (solo
// practice), and feeds per-seat view-models to the renderer.
//
// Roles:
//   'solo'   — single player vs AI bots, no networking, no bank impact (practice).
//   'host'   — co-op authority: runs the engine for the whole room, validates every client action,
//              broadcasts a PERSONALISED snapshot per player (each sees only their own hole cards).
//   'client' — thin terminal: renders the host's snapshot, sends actions; no local engine.
//
// The net-facing logic (startCoop / hostClientAct / _payloadFor / onPeerDisconnect) is DOM-free
// and renderer-guarded so it can be unit-tested without a browser (see tests/poker/coop.test.mjs).
import { Tournament } from './poker/tournament.js';
import { legalActions, applyAction, isComplete, privateView, forceFold } from './poker/holdem.js';
import { botAction } from './poker/bots.js';
import { mulberry32 } from './poker/cards.js';
import { ChipBank, value as chipValue } from './poker/chipbank.js';
import { PokerDomRenderer } from './poker-ui.js';
// NOTE: the THREE-based PokerSceneRenderer is injected as `this.RendererClass` by the browser
// orchestrator (game.js). poker-table.js stays THREE/DOM-free so the engine + co-op logic remain
// node-unit-testable (tests/poker/coop.test.mjs imports this file directly).

const ACT_SECS = 60;        // per-turn shot clock (host-ticked) — hidden; only the last 15s show a number
const BOT_THINK = 0.9;      // bot pause before acting (s) — feels human
const SHOWDOWN_SECS = 6.5;  // dwell on a real showdown — long enough to read who won with what (newbie-friendly)
const FOLD_SECS = 2.5;      // shorter dwell when everyone folded (no combination to read)
const NET_SNAP = 0.4;       // co-op: re-broadcast cadence so the timer bar animates clientside
const BOT_NAMES = ['SHARK', 'DOC', 'LUCKY', 'SLIM', 'ACE'];
// Physical starting chip set (value 1500 == DEFAULT_START_STACK) + the dealer rack/float that backs
// change-making. The float is heavy on small denominations and scales its 5s with the entrant count.
const STARTING_CHIPS = { 500: 1, 100: 6, 50: 4, 20: 5, 10: 5, 5: 10 };
const floatFor = (n) => ({ 100: 10, 50: 10, 20: 20, 10: 30, 5: 12 * n });

export class PokerTable {
  constructor(game) {
    this.game = game;
    this.renderer = null;
    this.tour = null; this.hand = null; this.rng = null;
    this.chipbank = null; this._lastCommitted = {};   // physical conserved chips (layer over the engine)
    this.role = 'solo'; this.coop = false; this.mode = 'practice';
    this.youId = 'you';
    this.active = false;
    this.phase = 'lobby';     // 'lobby' | 'playing' | 'handresult' | 'over'
    this.actTimer = ACT_SECS;
    this.botDelay = 0;
    this.resultTimer = 0;
    this._netT = 0;
    this.names = {};
    this.clientSnap = null;   // client role: the latest host snapshot to render
    this.coopBuyIn = 0;
    this._paid = 0;           // chips actually debited from this player's bank (refund only this)
    this._credited = false;
    this._refunded = false;
    this._aborted = false;
    this._dropped = new Set();
  }

  _toast(msg, color) { if (this.game.hud && this.game.hud.toast) this.game.hud.toast(msg, color); }

  _ensureRenderer() {
    if (this.renderer || typeof document === 'undefined') return; // node/headless: stay renderer-less (all calls are guarded)
    const root = document.getElementById('poker');
    // 3D table (RendererClass injected by game.js) by default; pure-2D DOM renderer is the fallback.
    const Renderer = this.RendererClass || PokerDomRenderer;
    this.renderer = new Renderer(root, {
      onStart: (cfg) => { if (cfg && cfg.coop) this.startCoop(cfg.buyIn | 0); else this.startTournament(cfg); },
      onAct: (a) => this.humanAct(a),
      onLeave: () => this.game.closePoker(),
      getShowOdds: () => !!(this.game.settings && this.game.settings.data && this.game.settings.data.pokerOdds), // local player's own preference
    });
    this.renderer.mount();
  }

  // ---------- SOLO (practice vs bots) ----------

  open() { // Game.openPoker — solo practice lobby
    this._ensureRenderer();
    this._reset();
    this.role = 'solo'; this.coop = false;
    if (this.renderer) this.renderer.showLobby({ bank: this.game.meta.bank | 0 });
  }

  startTournament({ bots = 5, mode = 'practice' } = {}) {
    const players = [{ id: 'you' }];
    this.names = { you: 'YOU' };
    for (let i = 0; i < bots; i++) { const id = 'bot' + i; players.push({ id }); this.names[id] = BOT_NAMES[i] || ('BOT ' + (i + 1)); }
    this.role = 'solo'; this.coop = false; this.mode = mode; this.youId = 'you';
    this.rng = mulberry32(((Date.now() >>> 0) ^ (bots * 2654435761)) >>> 0);
    this.tour = new Tournament({ players, buyIn: 0, rng: this.rng });
    this._dealChips();
    this.active = true;
    if (this.renderer) this.renderer.showTable();
    this._beginHand();
  }

  // ---------- CO-OP (PvP over the room) ----------

  openCoop() { // host opens the co-op poker lobby from the room
    this._ensureRenderer();
    this._reset();
    this.role = 'host'; this.coop = true;
    const players = [...this.game.mp.roster.values()].map((r) => r.name || 'Flopo');
    if (this.renderer) this.renderer.showCoopLobby({ players, bank: this.game.meta.bank | 0, tiers: [500, 2000, 10000] });
  }

  startCoop(buyIn) {
    const mp = this.game.mp;
    const ids = [...mp.roster.keys()];
    if (ids.length < 2) { this._toast('Need at least 2 players', 0xd23a2a); return; }
    if ((buyIn | 0) > 0 && (this.game.meta.bank | 0) < (buyIn | 0)) { this._toast('Not enough for the $' + buyIn + ' buy-in', 0xd23a2a); return; }
    this.names = {}; for (const [id, r] of mp.roster) this.names[id] = r.name || id;
    this.role = 'host'; this.coop = true; this.mode = 'money'; this.youId = mp.myId;
    this.coopBuyIn = buyIn | 0; this._credited = false; this._refunded = false; this._aborted = false; this._dropped = new Set();
    this.rng = mulberry32(((Date.now() >>> 0) ^ (ids.length * 2654435761)) >>> 0);
    this.tour = new Tournament({ players: ids.map((id) => ({ id })), buyIn: this.coopBuyIn, rng: this.rng });
    this._dealChips();
    this.active = true;
    this._paid = this._spend(this.coopBuyIn);                      // host pays own buy-in (affordability checked above)
    mp.net.send('pkstart', { buyIn: this.coopBuyIn, names: this.names }); // pull clients in
    if (this.renderer) this.renderer.showTable();
    this._beginHand();
    this._broadcastPoker();
  }

  enterCoopClient(d) { // client side, on 'pkstart'
    this._ensureRenderer();
    this._reset();
    const buyIn = (d && d.buyIn) | 0;
    if (buyIn > 0 && (this.game.meta.bank | 0) < buyIn) { // can't cover the buy-in → decline, do NOT seat (no free roll)
      try { this.game.mp.net.send('pkleave', {}); } catch (e) {}
      this._toast('Not enough for the $' + buyIn + ' buy-in', 0xd23a2a);
      this.game.closePoker();
      return;
    }
    this.role = 'client'; this.coop = true; this.mode = 'money';
    this.youId = this.game.mp.myId;
    this.names = d && d.names ? d.names : {};
    this.coopBuyIn = buyIn; this._credited = false; this._refunded = false; this._aborted = false;
    this.active = true; this.phase = 'playing'; this.clientSnap = null;
    this._paid = this._spend(buyIn);                               // client pays own buy-in (affordability checked above)
    if (this.renderer) this.renderer.showTable();
  }

  onSnap(payload) { // client side, on 'pksnap'
    if (this.role !== 'client') return;
    this.clientSnap = payload;
    this.phase = payload.phase;
    if (payload.over && payload.moneyPayout && !this._credited) {
      this.game.meta.bank = (this.game.meta.bank | 0) + payload.moneyPayout;
      this.game._saveMeta(); this._credited = true;
    }
  }

  hostClientAct(from, action) { // host side, on 'pkact'
    if (!this.coop || this.role !== 'host' || this.phase !== 'playing' || !this.hand) return;
    const legal = legalActions(this.hand);
    if (!legal || legal.seat !== from) return; // authority: only the actor, only on their turn
    this._applyAndAdvance(action);
  }

  onPeerDisconnect(id) { // host side, on peer drop or 'pkleave' — immediate elimination
    if (!this.coop || this.role !== 'host' || !this.tour) return;
    this._dropped.add(id);
    if (this.hand && this.phase === 'playing') {
      forceFold(this.hand, id);
      this._syncChips();
      if (isComplete(this.hand)) this._endHand();
    }
    this._broadcastPoker();
  }

  onAbort() { // client side, on 'pkabort' or host vanished — refund, tell the player, return to lobby
    if (!this.coop || this._aborted) return;
    this._aborted = true;
    this._refund();
    this.active = false;
    this._toast('Host ended the game — buy-in refunded', 0xd8b066);
    this.coop = false; this.role = 'solo';                         // so closePoker→leave() doesn't try to message the gone host
    if (this.game.state === 'poker') this.game.closePoker();
  }

  // ---------- shared flow ----------

  _beginHand() {
    if (this.coop && this.role === 'host') {
      for (const id of this._dropped) { const p = this.tour.players.find((x) => x.id === id); if (p) p.stack = 0; }
      if (this.tour.alivePlayers().length < 2) { this._walkover(); return; }
    }
    this.hand = this.tour.startNextHand();
    this._lastCommitted = {};
    this._syncChips();                          // post the blinds the engine just committed in startHand
    this.phase = 'playing';
    this.actTimer = ACT_SECS; this.botDelay = 0;
    if (isComplete(this.hand)) this._endHand();
  }

  _walkover() { // everyone else gone — last player standing takes the pool
    const alive = this.tour.alivePlayers();
    this.tour.over = true;
    if (alive[0]) { alive[0].place = 1; this.tour.result = { winner: alive[0].id, payouts: { [alive[0].id]: this.tour.prizePool }, standings: [alive[0].id] }; }
    this.phase = 'over'; this._payout(); this._broadcastPoker();
  }

  _endHand() {
    this.phase = 'handresult';
    const showdown = !!(this.hand && this.hand.result && this.hand.result.reveals && this.hand.result.reveals.length);
    this.resultTimer = showdown ? SHOWDOWN_SECS : FOLD_SECS; // linger on showdowns so the named hand is readable
  }

  humanAct(action) {
    if (this.role === 'client') { // thin terminal: never mutates state, just forwards to the host
      if (this.phase === 'playing') this.game.mp.net.send('pkact', { action });
      return;
    }
    if (this.phase !== 'playing' || !this.hand) return;
    const legal = legalActions(this.hand);
    if (!legal || legal.seat !== this.youId) return; // not your turn
    this._applyAndAdvance(action);
  }

  _applyAndAdvance(action) {
    try { applyAction(this.hand, action); } catch (e) { console.warn('[poker] action rejected:', JSON.stringify(action), '-', e.message); return; }
    this._syncChips();
    this.actTimer = ACT_SECS;
    if (isComplete(this.hand)) this._endHand();
    this._broadcastPoker();
  }

  // ---------- physical chip layer (host/solo only; clients render the host's snapshot) ----------

  _dealChips() {
    this.chipbank = new ChipBank();
    const ids = this.tour.players.map((p) => p.id);
    if (chipValue(STARTING_CHIPS) !== this.tour.startStack) {            // STARTING_CHIPS must total the engine start stack
      console.warn(`[poker] STARTING_CHIPS value ${chipValue(STARTING_CHIPS)} != startStack ${this.tour.startStack} — chip/engine values will drift until reconcile`);
    }
    this.chipbank.dealStart(ids, STARTING_CHIPS, floatFor(ids.length));
    this._lastCommitted = {};
  }

  // Reconstruct the physical chip flow from the engine's durable per-seat `committed` totals: post
  // each seat's new contribution into its bet zone, fold bets into the pot when a street/hand closes,
  // and physically pay the pot out on completion. Order-correct no matter how many streets resolve
  // inside one applyAction (it diffs committed, not the transient roundBet).
  _syncChips() {
    if (!this.chipbank || !this.hand) return;
    for (const s of this.hand.seats) {
      const d = s.committed - (this._lastCommitted[s.id] || 0);
      if (d > 0) this.chipbank.postBet(s.id, d);
      this._lastCommitted[s.id] = s.committed;
    }
    const complete = isComplete(this.hand);
    if (complete || this.hand.seats.every((s) => s.roundBet === 0)) this.chipbank.collectBetsToPot();
    if (complete && this.hand.result) this.chipbank.awardToWinners(this.hand.result.winnings, this._orderFromButton());
  }

  _orderFromButton() {
    const s = this.hand; if (!s) return [];
    const n = s.seats.length, order = [];
    for (let k = 0; k < n; k++) order.push(s.seats[(s.button + 1 + k) % n].id);  // mirror holdem doShowdown order
    return order;
  }

  update(dt) {
    if (!this.active || this.role === 'client') return; // host/solo drive; client just renders snaps
    if (this.phase === 'playing' && this.hand) {
      const legal = legalActions(this.hand);
      if (!legal) return;
      if (this.role === 'solo' && legal.seat !== this.youId) {
        this.botDelay += dt;
        if (this.botDelay >= BOT_THINK) {
          this.botDelay = 0;
          const view = privateView(this.hand, legal.seat);
          let a;
          try { a = botAction(view, legal, this.rng); } catch (e) { a = legal.canCheck ? { type: 'check' } : { type: 'fold' }; }
          if (!a) a = legal.canCheck ? { type: 'check' } : { type: 'fold' };
          this._applyAndAdvance(a);
        }
      } else {
        this.actTimer -= dt;
        if (this.actTimer <= 0) this._applyAndAdvance(legal.canCheck ? { type: 'check' } : { type: 'fold' });
      }
      if (this.coop) { this._netT -= dt; if (this._netT <= 0) { this._netT = NET_SNAP; this._broadcastPoker(); } }
    } else if (this.phase === 'handresult') {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) {
        this.tour.settleHand();
        if (this.chipbank) {
          this.chipbank.reconcile(this.tour.players);                    // backstop: chips == engine stacks
          try { this.chipbank.verify(); } catch (e) { console.warn('[poker] chip verify failed after reconcile:', e.message); }
        }
        if (this.tour.over) { this.phase = 'over'; this._payout(); } else this._beginHand();
        this._broadcastPoker();
      }
    }
  }

  // ---------- snapshots / rendering ----------

  _payloadFor(id) {
    const v = this.hand ? privateView(this.hand, id) : null;
    const legal = (this.phase === 'playing' && this.hand) ? legalActions(this.hand) : null;
    const yourTurn = !!(legal && legal.seat === id);
    const moneyPayout = (this.phase === 'over' && this.tour.result) ? (this.tour.result.payouts[id] || 0) : 0;
    return {
      view: v,
      tour: this.tour.tournamentView(),
      legal: yourTurn ? legal : null,
      yourTurn,
      timeLeft: this.phase === 'playing' ? Math.max(0, Math.ceil(this.actTimer)) : null, // seconds; UI shows it only in the last 15s
      phase: this.phase,
      result: (this.phase === 'handresult' || this.phase === 'over') && this.hand ? this.hand.result : null,
      over: this.phase === 'over',
      youId: id, names: this.names, moneyPayout,
      // live refs to the bank's chip sets — READ-ONLY contract (clients get a JSON copy via pksnap; the
      // host renderer must only read these, never mutate them, or it would break conservation).
      chips: this.chipbank ? { stacks: this.chipbank.stacks, bets: this.chipbank.bets, pot: this.chipbank.pot } : null,
    };
  }

  _broadcastPoker() {
    if (!this.coop || this.role !== 'host' || !this.tour) return;
    const net = this.game.mp.net;
    for (const p of this.tour.players) {
      if (p.id === this.youId) continue;       // host renders its own view locally
      try { net.sendTo(p.id, 'pksnap', this._payloadFor(p.id)); } catch (e) {}
    }
  }

  render() {
    if (!this.renderer || this.phase === 'lobby') return;
    if (this.role === 'client') { if (this.clientSnap) this.renderer.renderTable(this.clientSnap); return; }
    this.renderer.renderTable(this._payloadFor(this.youId));
  }

  // ---------- bank ----------

  _spend(n) { // returns the amount actually debited (0 if practice / unaffordable)
    if (this.mode === 'practice' || !n) return 0;
    if ((this.game.meta.bank | 0) >= n) { this.game.meta.bank -= n; this.game._saveMeta(); return n; }
    return 0;
  }
  _payout() {
    if (this.mode === 'practice' || this._credited) return;
    const pay = this.tour.result && this.tour.result.payouts[this.youId];
    if (pay) { this.game.meta.bank = (this.game.meta.bank | 0) + pay; this.game._saveMeta(); this._credited = true; }
  }
  _refund() {
    if (this.mode === 'practice' || this._refunded || this._credited || !this._paid) return;
    this.game.meta.bank = (this.game.meta.bank | 0) + this._paid; this.game._saveMeta(); this._refunded = true; // refund exactly what was paid
  }

  // ---------- teardown ----------

  _reset() {
    this.active = false; this.phase = 'lobby'; this.tour = null; this.hand = null;
    this.chipbank = null; this._lastCommitted = {};
    this.clientSnap = null; this._netT = 0; this._dropped = new Set();
    this._credited = false; this._refunded = false; this._aborted = false; this.coopBuyIn = 0; this._paid = 0;
  }

  leave() { // Game.closePoker — tell the room, refund/abort as needed
    if (this.coop) {
      const mp = this.game.mp;
      if (this.role === 'client') { try { mp.net.send('pkleave', {}); } catch (e) {} }
      else if (this.role === 'host' && this.active && !this.tour?.over) { try { mp.net.send('pkabort', {}); } catch (e) {} this._refund(); }
    }
    this._reset();
    this.coop = false; this.role = 'solo';
  }
}
