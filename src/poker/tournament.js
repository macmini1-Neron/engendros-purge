// Sit & Go tournament layer over holdem.js. Pure. No THREE, no DOM.
// Equal starting stacks, blinds escalate by hands dealt, bust = elimination, button moves to the
// next surviving seat, winner-takes-all. Buy-in/bank are handled by the integration layer; this
// module only tracks chips and computes the prize-pool payout instruction.
import { startHand } from './holdem.js';

export const DEFAULT_START_STACK = 1500;
export const HANDS_PER_LEVEL = 8;
export const DEFAULT_SCHEDULE = [
  [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200],
  [150, 300], [200, 400], [300, 600], [400, 800], [600, 1200], [1000, 2000],
].map(([sb, bb]) => ({ sb, bb }));

export class Tournament {
  // cfg: { players:[{id}], buyIn, rng, startStack?, schedule?, handsPerLevel? }
  constructor(cfg) {
    this.buyIn = cfg.buyIn || 0;
    this.startStack = cfg.startStack || DEFAULT_START_STACK;
    this.schedule = cfg.schedule || DEFAULT_SCHEDULE;
    this.handsPerLevel = cfg.handsPerLevel || HANDS_PER_LEVEL;
    this.rng = cfg.rng;
    this.entrants = cfg.players.length;
    this.prizePool = this.buyIn * this.entrants;
    // fixed clockwise seat ring; place stays null until busted (1 = winner)
    this.players = cfg.players.map((p) => ({ id: p.id, stack: this.startStack, place: null }));
    this.button = 0;
    this.handNumber = 0;
    this.level = 0;
    this.hand = null;
    this.over = false;
    this.result = null; // { winner, payouts:{id:amt}, standings:[ids best→worst] }
  }

  isAlive(p) { return p.stack > 0; } // has chips = still in (busted players sit at 0)
  alivePlayers() { return this.players.filter((p) => this.isAlive(p)); }

  advanceButton() {
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const idx = (this.button + k) % n;
      if (this.isAlive(this.players[idx])) { this.button = idx; return; }
    }
  }

  blindsForHand() {
    const lvl = Math.min(Math.floor(this.handNumber / this.handsPerLevel), this.schedule.length - 1);
    return { lvl, ...this.schedule[lvl] };
  }

  // Begin the next hand and return the holdem state (caller drives the betting with applyAction).
  startNextHand() {
    if (this.over) throw new Error('tournament is over');
    if (this.handNumber > 0) this.advanceButton();
    const { lvl, sb, bb } = this.blindsForHand();
    this.level = lvl;
    const ring = this.alivePlayers(); // ring order preserved → blind/action order stays correct
    const btnIdx = ring.findIndex((p) => p.id === this.players[this.button].id);
    this.hand = startHand({
      players: ring.map((p) => ({ id: p.id, stack: p.stack })),
      button: btnIdx, sb, bb, rng: this.rng,
    });
    this.handNumber++;
    return this.hand;
  }

  // After the caller has run the hand to completion, fold stacks back, eliminate busts, and
  // detect the tournament winner. Returns { eliminated:[ids], over }.
  settleHand() {
    if (!this.hand || this.hand.street !== 'complete') throw new Error('current hand is not complete');
    const committed = {};
    for (const s of this.hand.seats) {
      committed[s.id] = s.committed;
      const p = this.players.find((x) => x.id === s.id);
      if (p) p.stack = s.stack;
    }

    // players who hit zero this hand bust now; if several bust together, the one who had more
    // chips in front of them finishes higher (better place).
    const busted = this.players
      .filter((p) => p.place === null && p.stack === 0)
      .sort((a, b) => (committed[b.id] || 0) - (committed[a.id] || 0));
    const aliveAfter = this.players.filter((p) => p.place === null && p.stack > 0).length;
    busted.forEach((p, i) => { p.place = aliveAfter + busted.length - i; });

    const eliminated = busted.map((p) => p.id);

    if (aliveAfter === 1) {
      const winner = this.players.find((p) => this.isAlive(p));
      winner.place = 1;
      this.over = true;
      this.result = {
        winner: winner.id,
        payouts: { [winner.id]: this.prizePool }, // winner-takes-all
        standings: [...this.players].sort((a, b) => a.place - b.place).map((p) => p.id),
      };
    }
    return { eliminated, over: this.over };
  }

  // Snapshot for the UI / netcode (no hole cards — those come from the holdem view).
  tournamentView() {
    const { sb, bb } = this.blindsForHand();
    return {
      level: this.level, sb, bb, handNumber: this.handNumber, button: this.button,
      prizePool: this.prizePool, over: this.over,
      winner: this.result ? this.result.winner : null,
      players: this.players.map((p) => ({ id: p.id, stack: p.stack, place: p.place })),
    };
  }
}
