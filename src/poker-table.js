// PokerTable — the host-authoritative orchestrator that turns the pure engine into a playable
// table. Owns a Tournament + the current holdem hand, ticks the action timer, drives bots, and
// feeds per-seat view-models to the renderer. Solo/practice runs entirely here (this IS the host
// path); co-op netcode (pk* messages, disconnect→elimination) is layered on in a later step.
import { Tournament } from './poker/tournament.js';
import { legalActions, applyAction, isComplete, privateView } from './poker/holdem.js';
import { botAction } from './poker/bots.js';
import { mulberry32 } from './poker/cards.js';
import { PokerDomRenderer } from './poker-ui.js';

const YOU = 'you';
const ACT_SECS = 30;        // per-turn shot clock (host-ticked)
const BOT_THINK = 0.9;      // bot pause before acting (s) — feels human
const RESULT_SECS = 3.2;    // showdown reveal dwell before the next hand
const BOT_NAMES = ['СЕРЁГА', 'ДОКТОР', 'КАБАН', 'ТЁТЯ ЗИНА', 'ПРАПОР'];

export class PokerTable {
  constructor(game) {
    this.game = game;
    this.renderer = null;
    this.tour = null; this.hand = null; this.rng = null;
    this.mode = 'practice';
    this.active = false;
    this.phase = 'lobby';     // 'lobby' | 'playing' | 'handresult' | 'over'
    this.actTimer = ACT_SECS;
    this.botDelay = 0;
    this.resultTimer = 0;
    this.names = {};
  }

  _ensureRenderer() {
    if (this.renderer) return;
    const root = document.getElementById('poker');
    this.renderer = new PokerDomRenderer(root, {
      onStart: (cfg) => this.startTournament(cfg),
      onAct: (a) => this.humanAct(a),
      onLeave: () => this.game.closePoker(),
    });
    this.renderer.mount();
  }

  // Called by Game.openPoker — show the pre-game lobby.
  open() {
    this._ensureRenderer();
    this.active = false;
    this.phase = 'lobby';
    this.renderer.showLobby({ bank: this.game.meta.bank | 0 });
  }

  // Tear down when leaving the screen.
  leave() {
    this.active = false; this.phase = 'lobby';
    this.tour = null; this.hand = null;
  }

  startTournament({ bots = 5, mode = 'practice' } = {}) {
    const players = [{ id: YOU }];
    this.names = { [YOU]: 'TY' };
    for (let i = 0; i < bots; i++) { const id = 'bot' + i; players.push({ id }); this.names[id] = BOT_NAMES[i] || ('BOT ' + (i + 1)); }
    this.mode = mode;
    // browser-side seed (Date.now is fine here — this is not a pure/sandboxed module)
    this.rng = mulberry32(((Date.now() >>> 0) ^ (bots * 2654435761)) >>> 0);
    this.tour = new Tournament({ players, buyIn: 0, rng: this.rng });
    this.active = true;
    this.renderer.showTable();
    this._beginHand();
  }

  _beginHand() {
    this.hand = this.tour.startNextHand();
    this.phase = 'playing';
    this.actTimer = ACT_SECS; this.botDelay = 0;
    if (isComplete(this.hand)) this._endHand(); // e.g. all-in blinds dealt straight to showdown
  }

  _endHand() {
    this.phase = 'handresult';
    this.resultTimer = RESULT_SECS;
  }

  humanAct(action) {
    if (this.phase !== 'playing' || !this.hand) return;
    const legal = legalActions(this.hand);
    if (!legal || legal.seat !== YOU) return; // not your turn
    try { applyAction(this.hand, action); } catch (e) { return; } // ignore illegal clicks
    this.actTimer = ACT_SECS;
    if (isComplete(this.hand)) this._endHand();
  }

  update(dt) {
    if (!this.active) return;
    if (this.phase === 'playing' && this.hand) {
      const legal = legalActions(this.hand);
      if (!legal) return;
      if (legal.seat === YOU) {
        this.actTimer -= dt;
        if (this.actTimer <= 0) this.humanAct(legal.canCheck ? { type: 'check' } : { type: 'fold' });
      } else {
        this.botDelay += dt;
        if (this.botDelay >= BOT_THINK) {
          this.botDelay = 0;
          const view = privateView(this.hand, legal.seat);
          let a;
          try { a = botAction(view, legal, this.rng); } catch (e) { a = legal.canCheck ? { type: 'check' } : { type: 'fold' }; }
          try { applyAction(this.hand, a); } catch (e) { try { applyAction(this.hand, legal.canCheck ? { type: 'check' } : { type: 'fold' }); } catch (_) {} }
          if (isComplete(this.hand)) this._endHand();
        }
      }
    } else if (this.phase === 'handresult') {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) {
        this.tour.settleHand();
        if (this.tour.over) { this.phase = 'over'; this._payout(); }
        else this._beginHand();
      }
    }
  }

  _payout() {
    // practice mode never touches the bank. (Money/PvP payout via meta.bank lands with co-op.)
    if (this.mode !== 'practice' && this.tour.result && this.tour.result.payouts[YOU]) {
      this.game.meta.bank = (this.game.meta.bank | 0) + this.tour.result.payouts[YOU];
      this.game._saveMeta();
    }
  }

  render() {
    if (!this.renderer || this.phase === 'lobby') return;
    const youView = this.hand ? privateView(this.hand, YOU) : null;
    const legal = (this.phase === 'playing' && this.hand) ? legalActions(this.hand) : null;
    const yourTurn = !!(legal && legal.seat === YOU);
    this.renderer.renderTable({
      view: youView,
      tour: this.tour.tournamentView(),
      legal, yourTurn,
      timerFrac: yourTurn ? Math.max(0, this.actTimer / ACT_SECS) : 0,
      phase: this.phase,
      result: (this.phase === 'handresult' || this.phase === 'over') && this.hand ? this.hand.result : null,
      over: this.phase === 'over',
      youId: YOU,
      names: this.names,
    });
  }
}
