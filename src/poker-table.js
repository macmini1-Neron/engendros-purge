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
import { canAnte, POKER_BUYIN_TIERS } from './poker/coop.js';
import { ItemPot } from './poker/itempot.js';                 // item-wager escrow (asymmetric baskets → winner takes the union)
import { canStake, normalizeBasket, basketEmpty } from './poker/wager.js';
import { bagClone, bagUnits } from './itembank.js';
import { setChipSkin, getChipSkin, chipSkinAvailable, CHIP_SKINS_FREE } from './poker/chipskins.js'; // pure (no THREE) — sets the shared skin state the 3D chips read
import { setCardBackSkin, getCardBackSkin, cardBackAvailable, CARD_BACKS, CARD_BACKS_FREE } from './poker/cardbacks.js'; // pure — card-back skin state
import { PokerDomRenderer } from './poker-ui.js';
// NOTE: the THREE-based PokerSceneRenderer is injected as `this.RendererClass` by the browser
// orchestrator (game.js). poker-table.js stays THREE/DOM-free so the engine + co-op logic remain
// node-unit-testable (tests/poker/coop.test.mjs imports this file directly).

const ACT_SECS = 60;        // per-turn shot clock (host-ticked) — hidden; only the last 15s show a number
const ACT_SECS_COOP = 22;   // co-op: shorter clock — poker sends no xf so the 10s heartbeat can't catch a frozen-but-connected seat; this is the only backstop that keeps the table moving
const BOT_THINK = 1.1;      // bot pause before acting (s) — a readable beat so you SEE each bet land before the next player acts
const SHOWDOWN_SECS = 6.5;  // dwell on a real showdown — long enough to read who won with what (newbie-friendly)
const FOLD_SECS = 2.5;      // shorter dwell when everyone folded (no combination to read)
const NET_SNAP = 0.4;       // co-op: re-broadcast cadence so the timer bar animates clientside
const OVER_REBROADCAST_SECS = 6; // co-op: keep re-sending the terminal 'over' snapshot this long so a client's payout credit survives a dropped packet (idempotent via _credited)
const ANTE_GATHER_SECS = 8; // co-op: ante-ack window — host waits this long for every invited client to confirm it paid before building the pool
const DROP_GRACE_SECS = 30; // co-op: a dropped seat keeps its STACK this long (reload/blip grace) WHEN 2+ OTHERS stay connected — it sits out (auto-checks/folds) and busts only if it doesn't reconnect in time. HEADS-UP EXCEPTION: if a drop leaves <2 connected the game ends immediately (no one left to play on), so the grace can't save a heads-up buy-in — by design, since the alternative is freezing the lone survivor for 30s.
// Believable dealing: hold ALL action until every hole card has been pitched in (real poker — nobody
// acts mid-deal). Sized to the renderer's deal-in cadence (poker-scene.js DEAL_STAGGER) × cards + flight.
const DEAL_ANIM_STAGGER = 0.15; // per-card gap (mirrors poker-scene.js DEAL_STAGGER)
const DEAL_ANIM_BASE = 0.45;    // last card's flight + a small settle buffer
// Presentation pacing for street transitions + folds (mirror the poker-scene.js choreography so the host
// holds action until the renderer has shown: bets→pot collect, THEN the board reveal card-by-card).
const STREET_HOLD_BASE = 1.3;   // bets→pot collection slide + a gap before the board reveal begins
const STREET_HOLD_PER_CARD = 0.42; // each freshly-dealt community card's staggered flip
const FOLD_HOLD = 0.7;          // let the muck (fold) animation play before the next player acts
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
    this._hold = 0;       // s left to FREEZE all action while the renderer choreographs (deal-in / street collect+reveal / fold muck); set in _beginHand + _applyAndAdvance
    this.names = {};
    this.skins = {};          // seatId → chip-skin id (co-op: per-player cosmetic; solo: empty → renderer defaults)
    this.clientSnap = null;   // client role: the latest host snapshot to render
    this.coopBuyIn = 0;
    this._paid = 0;           // money actually debited from this player's bank (refund only this)
    this._gathering = false; this._invited = new Set(); this._confirmed = new Set(); this._anteDeadline = 0; // co-op ante-ack gathering (C1)
    this._credited = false;
    this._refunded = false;
    this._aborted = false;
    // item-wager (asymmetric baskets): each seat antes its OWN basket {items,money}; winner takes the union.
    this.itemPot = null;      // host-only escrow ledger (ItemPot); clients credit from the snapshot's itemPayout
    this.baskets = {};        // { seatId: {items,money} } — the table stakes (host builds from the roster; clients get it via pkstart)
    this._lockedItems = {};   // items THIS player escrowed out of its own ItemBank at lock-in (refund only these)
    this._itemCredited = false; // won-items credited (idempotent, mirrors _credited)
    this._itemRefunded = false; // escrowed items returned on abort (idempotent, mirrors _refunded)
    this._dropped = new Set(); this._dropGrace = new Map(); this._reattach = []; // co-op: dropped seats, their reconnect-grace timers, and pending reconnect re-keys
    this._lastAct = null; this._actSeq = 0; // last action type + a counter → renderer plays check/fold SFX on a new one
    this._snapSeq = 0; this._lastSnapSeq = 0; // co-op snapshot ordering: host bumps _snapSeq per broadcast (NEVER reset → monotonic across games), client drops any pksnap older than _lastSnapSeq
  }

  _toast(msg, color) { if (this.game.hud && this.game.hud.toast) this.game.hud.toast(msg, color); }

  // chip-skin cosmetics: free skins + the player's crate-unlocked ones (meta.chipSkinsUnlocked).
  _chipSkinAvail() { return [...CHIP_SKINS_FREE, ...((this.game.meta && this.game.meta.chipSkinsUnlocked) || [])]; }
  _cardBackAvail() { return [...CARD_BACKS_FREE, ...((this.game.meta && this.game.meta.cardBacksUnlocked) || [])]; }
  // apply the saved cosmetics before anything is built, falling back to the default if not owned/available.
  _applyChipSkin() {
    const want = this.game.meta && this.game.meta.chipSkin;
    setChipSkin(chipSkinAvailable(want, this.game.meta && this.game.meta.chipSkinsUnlocked) ? want : 'dice');
  }
  _applyCardBack() {
    const want = this.game.meta && this.game.meta.cardBack;
    setCardBackSkin(cardBackAvailable(want, this.game.meta && this.game.meta.cardBacksUnlocked) ? want : 'default');
  }

  // Cosmetic prefs, callable WITHOUT a mounted renderer — the co-op ROOM lobby (mp.js) has a live
  // PokerTable (game.poker) but no PokerDomRenderer yet, so its pickers route through these directly.
  setChipSkinPref(id) { // per-player chips: apply + persist + (co-op) refresh the host roster so opponents see it
    setChipSkin(id);
    if (this.game.meta) this.game.meta.chipSkin = id;
    if (this.game._saveMeta) this.game._saveMeta();
    if (this.game.mp && this.game.mp.notifyChipSkinChanged) this.game.mp.notifyChipSkinChanged();
  }
  setCardBackPref(id) { // host's table-wide deck: read at deal time via getCardBackSkin() → pkstart/pksnap; no net here
    setCardBackSkin(id);
    if (this.game.meta) this.game.meta.cardBack = id;
    if (this.game._saveMeta) this.game._saveMeta();
  }

  _ensureRenderer() {
    if (this.renderer || typeof document === 'undefined') return; // node/headless: stay renderer-less (all calls are guarded)
    const root = document.getElementById('poker');
    // 3D table (RendererClass injected by game.js) by default; pure-2D DOM renderer is the fallback.
    const Renderer = this.RendererClass || PokerDomRenderer;
    this.renderer = new Renderer(root, {
      onStart: (cfg) => { if (cfg && cfg.coop) this.startCoop(cfg.buyIn | 0); else this.startTournament(cfg); },
      onAct: (a) => this.humanAct(a),
      onLeave: () => this.game.closePoker(),
      onChipSkin: (id) => this.setChipSkinPref(id), // single source of truth — shared with the room-lobby picker
      onCardBack: (id) => this.setCardBackPref(id),
      getShowOdds: () => !!(this.game.settings && this.game.settings.data && this.game.settings.data.pokerOdds), // local player's own preference
    });
    this.renderer.mount();
  }

  // ---------- SOLO (practice vs bots) ----------

  open() { // Game.openPoker — solo practice lobby
    this._ensureRenderer();
    this._reset();
    this.role = 'solo'; this.coop = false;
    if (this.renderer) this.renderer.showLobby({ bank: this.game.meta.bank | 0, chipSkin: this.game.meta.chipSkin || 'dice', skinAvail: this._chipSkinAvail(), cardBack: this.game.meta.cardBack || 'default', backAvail: this._cardBackAvail() });
  }

  startTournament({ bots = 5, mode = 'practice' } = {}) {
    const players = [{ id: 'you' }];
    this.names = { you: 'YOU' };
    this.skins = {}; // bots default to 'dice' in the renderer; the local 'you' seat uses the global skin
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

  openCoop(skipLobby) { // host opens the co-op poker lobby from the room; skipLobby = deal straight
                        // from the room mode-select (the buy-in was already chosen in the lobby)
    this._ensureRenderer();
    this._reset();
    this.role = 'host'; this.coop = true;
    this._applyCardBack(); // make the host's saved deck the live global NOW — it's the table-wide deck pkstart/snapshots broadcast, even if the host never opens the picker
    if (skipLobby) return;
    const players = [...this.game.mp.roster.values()].map((r) => r.name || 'Flopo');
    if (this.renderer) this.renderer.showCoopLobby({ players, bank: this.game.meta.bank | 0, tiers: POKER_BUYIN_TIERS, chipSkin: this.game.meta.chipSkin || 'dice', skinAvail: this._chipSkinAvail(), cardBack: this.game.meta.cardBack || 'default', backAvail: this._cardBackAvail() });
  }

  // Seat EXACTLY the players in `seatIds` (the lobby's anted/accepted set). Falls back to the whole
  // roster when called without a list (back-compat for the old buy-in-lobby DEAL path + tests).
  startCoop(buyIn, seatIds) {
    const mp = this.game.mp;
    const ids = (seatIds && seatIds.length) ? seatIds.slice() : [...mp.roster.keys()];
    if (ids.length < 2) { this._toast('Need at least 2 players', 0xd23a2a); return; }
    this.coopBuyIn = buyIn | 0;
    this.names = {}; this.skins = {}; this.baskets = {};
    for (const id of ids) { const r = mp.roster.get(id); this.names[id] = (r && r.name) || id; this.skins[id] = (r && r.chipSkin) || 'dice'; this.baskets[id] = this._basketFor(id); }
    // the host must be able to back its OWN basket (money + every item it staked) before inviting anyone
    if (!canStake(this.game.items, this.game.meta.bank, this.baskets[mp.myId])) { this._toast('You can’t back your own stake', 0xd23a2a); return; }
    this.role = 'host'; this.coop = true; this.mode = 'money'; this.youId = mp.myId;
    this._credited = false; this._refunded = false; this._aborted = false; this._itemCredited = false; this._itemRefunded = false; this._lockedItems = {}; this.itemPot = null; this._dropped = new Set(); this._dropGrace = new Map(); this._reattach = [];
    // INVITE the seated clients FIRST and seat ONLY the ones the invite actually reaches. The prize pool is
    // buyIn × entrants, so a seat that never receives pkstart (a half-open P2P channel → sendTo throws) must
    // NOT count — otherwise the winner would be paid a buy-in nobody collected. A throw drops that seat
    // (logged, not silently swallowed) instead of inflating the pool. Targeted sends also keep an un-anted
    // client out. (Residual: a client that gets pkstart but then declines/drops before paying still over-
    // states the pool by 1 — closed by the deferred ante-ack handshake; rare + the engine stays money-truth.)
    const seated = [mp.myId];
    for (const id of ids) {
      if (id === mp.myId) continue;
      try { mp.net.sendTo(id, 'pkstart', { buyIn: this.coopBuyIn, names: this.names, skins: this.skins, cardBack: getCardBackSkin(), baskets: this.baskets }); seated.push(id); } // cardBack is table-wide = the host's deck (unlike the per-player chip skins); baskets = the full table stakes
      catch (e) { console.warn('[poker] pkstart send failed for ' + id + ' — dropping it from the table (not counted in the pool)', e); }
    }
    if (seated.length < 2) { this._toast('Could not reach enough players', 0xd23a2a); return; } // nobody charged yet → safe bail
    // ANTE-ACK GATHERING (C1): do NOT build the pool or charge anyone yet. The host is auto-confirmed;
    // each invited client replies 'pkante' from enterCoopClient AFTER it debits its own bank. _finalizeDeal
    // (on all-confirmed, or at the deadline) seats ONLY the confirmed set, so the prize pool == buy-ins
    // actually collected — a client that gets pkstart but declines/drops before paying is never counted.
    this._gathering = true;
    this._invited = new Set(seated.filter((id) => id !== mp.myId));
    this._confirmed = new Set([mp.myId]);                          // host counts itself (it pays in _finalizeDeal)
    this._anteDeadline = ANTE_GATHER_SECS;
    this.active = true;                                            // so update() ticks the deadline
    this.phase = 'lobby';                                          // render() skips 'lobby' → no table drawn until we deal (tour is still null)
    this._toast('Waiting for players to ante up…', 0xd8b066);
  }

  // Host: a client confirmed (via 'pkante') that it actually paid its buy-in → count it toward the pool.
  // TRUST BOUNDARY: 'pkante' is the client's SELF-REPORT — there is no server, banks are client-local
  // localStorage, so the host cannot verify the debit actually happened. Co-op poker money therefore
  // assumes HONEST PEERS and is not cheat-proof (see README → Multiplayer Authority Model).
  onAnte(from) {
    if (!this.coop || this.role !== 'host' || !this._gathering) return;
    if (!this._invited.has(from)) return;                         // only seats we actually invited count
    this._confirmed.add(from);
    if ([...this._invited].every((id) => this._confirmed.has(id))) this._finalizeDeal(); // everyone in → deal now
  }

  // Host: the ante window closed (all confirmed, or the deadline hit). Seat ONLY the confirmed players,
  // tell any invited-but-unconfirmed client to bail (it refunds itself), then build the pool + deal.
  _finalizeDeal() {
    if (this.role !== 'host' || !this._gathering) return;
    this._gathering = false;
    const mp = this.game.mp;
    for (const id of this._invited) {                             // unconfirmed → may have paid → abort it so it refunds
      if (!this._confirmed.has(id)) { try { mp.net.sendTo(id, 'pkabort', {}); } catch (e) {} }
    }
    const seated = [...this._confirmed];                          // includes the host (mp.myId)
    if (seated.length < 2) {                                      // nobody else anted in time → cancel; nobody (incl. host) was charged
      this.active = false;
      this._toast('Not enough players anted — game cancelled', 0xd23a2a);
      this.coop = false; this.role = 'solo';
      if (this.game.state === 'poker') this.game.closePoker();
      return;
    }
    // ITEM-WAGER ESCROW: lock every seated seat's declared basket, seal the union ONCE (conservation
    // backstop), and set the money prize pool = Σ(basket.money). Money-only baskets reproduce buyIn×entrants.
    this.itemPot = new ItemPot();
    for (const id of seated) this.itemPot.lock(id, this.baskets[id] || { items: {}, money: this.coopBuyIn });
    this.itemPot.seal();
    try { this.itemPot.verify(); } catch (e) { console.warn('[poker] item pot verify failed at seal', e); }
    this.rng = mulberry32(((Date.now() >>> 0) ^ (seated.length * 2654435761)) >>> 0);
    this.tour = new Tournament({ players: seated.map((id) => ({ id })), buyIn: this.coopBuyIn, prizePool: this.itemPot.totalMoney(), rng: this.rng });
    this._dealChips();
    // host escrows its OWN basket NOW (only once the table is real): debit its items from its ItemBank +
    // spend its money. Mirrors the client's lock-in in enterCoopClient; refunded together on abort.
    const mine = this.baskets[this.youId] || { items: {}, money: this.coopBuyIn };
    this._lockedItems = bagClone(mine.items || {});
    if (this.game.items && this._lockedItemsAny()) { try { this.game.items.applyBasket(this._lockedItems, -1); } catch (e) { console.warn('[poker] host item lock failed', e); this._lockedItems = {}; } }
    this._paid = this._spend(mine.money | 0);                     // host pays its own money NOW
    if (this._lockedItemsAny()) this.game._saveMeta();
    if (this.renderer) this.renderer.showTable();
    this._beginHand();
    this._broadcastPoker();
  }

  enterCoopClient(d) { // client side, on 'pkstart' — by now the client already ACCEPTED (anted) in the lobby
    if (this.coop && this.role === 'client' && this.active && this.phase !== 'over' && ((d && d.buyIn) | 0) === (this.coopBuyIn | 0)) return; // ignore a duplicate pkstart for the LIVE table we're already seated at → never _spend twice. (phase!=='over': a NEW same-buy-in rematch after a game ended must still seat us, even though active/coopBuyIn carry over until we leave.)
    this._ensureRenderer();
    this._reset();
    this._applyChipSkin();                          // chips stay PER-PLAYER: the client's own seat renders its own chip skin
    // the card deck is TABLE-WIDE = the host's choice (synced via pkstart). Render the host's deck, not the client's
    // own saved one, and don't overwrite the client's saved meta.cardBack. Validate against the registry so a junk/
    // missing value falls back to 'default' deterministically (never leave a stale global from a previous game).
    const hostBack = d && d.cardBack;
    setCardBackSkin(CARD_BACKS[hostBack] ? hostBack : 'default');
    const buyIn = (d && d.buyIn) | 0;
    const myId = this.game.mp.myId;
    this.coopBuyIn = buyIn;                                        // set first so _basketFor's money-only default reads the right tier
    const mine = (d && d.baskets && d.baskets[myId]) ? normalizeBasket(d.baskets[myId]) : { items: {}, money: buyIn };
    // Affordability was enforced at accept time (the lobby stake gate); this guard only catches the
    // unreachable race where the bank/inventory changed between accepting and the deal — bail safely.
    if (!canStake(this.game.items, this.game.meta.bank, mine)) {
      try { this.game.mp.net.send('pkleave', {}); } catch (e) {}
      this._toast('Can’t back your stake any more', 0xd23a2a);
      this.game.closePoker();
      return;
    }
    this.role = 'client'; this.coop = true; this.mode = 'money';
    this.youId = myId;
    this.names = d && d.names ? d.names : {};
    this.skins = (d && d.skins) || {};
    this.baskets = (d && d.baskets) || {};
    this._credited = false; this._refunded = false; this._aborted = false; this._itemCredited = false; this._itemRefunded = false;
    this.active = true; this.phase = 'playing'; this.clientSnap = null;
    // ESCROW the client's own basket: debit its items from its ItemBank + spend its money. Mirrors the host
    // in _finalizeDeal; refunded together on pkabort. Items are self-reported (honest-peer, like the money).
    this._lockedItems = bagClone(mine.items || {});
    if (this.game.items && this._lockedItemsAny()) { try { this.game.items.applyBasket(this._lockedItems, -1); } catch (e) { console.warn('[poker] client item lock failed', e); this._lockedItems = {}; } }
    this._paid = this._spend(mine.money | 0);                      // client pays own money (affordability checked above)
    if (this._lockedItemsAny()) this.game._saveMeta();
    this._anteWait = ANTE_GATHER_SECS * 2 + 2;                     // backstop: if no deal/pkabort arrives in time (lost on teardown), self-refund + bail
    try { this.game.mp.net.send('pkante', {}); } catch (e) {}      // ACK to the host: I escrowed → count me in the pool (host deals once everyone confirms)
    if (this.renderer) this.renderer.showTable();
  }

  // client side, on 'pkresync' — a returning player (reload / blip) re-attaches to its seat. Like
  // enterCoopClient but DOES NOT _spend or 'pkante': the buy-in was already debited+persisted before the
  // reload, so charging again would double-bill. The host re-keys the seat at its next hand boundary and
  // resumes pksnap; until then the renderer shows the table awaiting the next deal.
  enterCoopResync(d) {
    this._ensureRenderer();
    this._reset();
    this._applyChipSkin();
    const hostBack = d && d.cardBack; setCardBackSkin(CARD_BACKS[hostBack] ? hostBack : 'default');
    this.role = 'client'; this.coop = true; this.mode = 'money';
    this.youId = this.game.mp.myId;
    this.names = (d && d.names) || {};
    this.skins = (d && d.skins) || {};
    this.baskets = (d && d.baskets) || {};
    this.coopBuyIn = (d && d.buyIn) | 0;
    const mine = (d && d.baskets && d.baskets[this.youId]) ? normalizeBasket(d.baskets[this.youId]) : { items: {}, money: this.coopBuyIn };
    this._credited = false; this._refunded = false; this._aborted = false; this._itemCredited = false; this._itemRefunded = false;
    // already escrowed pre-reload (bank debited + items removed + saved) → RECORD the stake so a later host
    // abort refunds it correctly, but do NOT spend money or debit items again (that would double-bill).
    this._paid = mine.money | 0;
    this._lockedItems = bagClone(mine.items || {});
    this.active = true; this.phase = 'playing'; this.clientSnap = null; this._anteWait = 0;
    if (this.renderer) this.renderer.showTable();
  }

  onSnap(payload) { // client side, on 'pksnap'
    if (this.role !== 'client') return;
    if (payload && payload.seq != null) { if (payload.seq < (this._lastSnapSeq | 0)) return; this._lastSnapSeq = payload.seq; } // drop a stale/out-of-order snapshot (rare on the reliable channel, but never regress phase/board)
    this.clientSnap = payload;
    if (payload.cardBack && CARD_BACKS[payload.cardBack] && payload.cardBack !== getCardBackSkin()) setCardBackSkin(payload.cardBack); // keep the table deck synced to the host (late-join / re-sync)
    this.phase = payload.phase;
    const pay = Math.max(0, payload.moneyPayout | 0); // coerce/clamp an off-the-wire field — never let a malformed packet write NaN/negative to the persisted bank
    if (payload.over && pay && !this._credited) {
      this.game.meta.bank = (this.game.meta.bank | 0) + pay;
      this.game._saveMeta(); this._credited = true;
    }
    // item winnings: the winner takes the whole staked union (nonzero only in the winner's snapshot).
    // Idempotent via _itemCredited so a re-broadcast 'over' never double-credits. Honest-peer: we trust the
    // host's award the same way we trust moneyPayout. WIN here and REFUND (onAbort) are mutually exclusive.
    const won = payload.over ? payload.itemPayout : null;
    if (won && !this._itemCredited && this.game.items) {
      let any = false;
      for (const k in won) { const n = won[k] | 0; if (n > 0) { this.game.items.acquire(k, n, 'poker-win'); any = true; } }
      if (any) { this.game._saveMeta(); this._itemCredited = true; }
    }
  }

  hostClientAct(from, action) { // host side, on 'pkact'
    if (!this.coop || this.role !== 'host' || this.phase !== 'playing' || !this.hand || this._hold > 0) return; // reject during the presentation hold (the client's controls are hidden then anyway)
    const legal = legalActions(this.hand);
    if (!legal || legal.seat !== from) return; // authority: only the actor, only on their turn
    this._applyAndAdvance(action);
  }

  onPeerDisconnect(id) { // host side, on peer drop or 'pkleave' — immediate elimination
    if (this._gathering && this.role === 'host') { // dropped mid-ante → uncount it; deal if everyone left is confirmed
      this._invited.delete(id); this._confirmed.delete(id);
      if ([...this._invited].every((x) => this._confirmed.has(x))) this._finalizeDeal();
      return;
    }
    if (!this.coop || this.role !== 'host' || !this.tour) return;
    this._dropped.add(id);
    if (this.tour.players.some((p) => p.id === id && p.stack > 0)) this._dropGrace.set(id, DROP_GRACE_SECS); // keep the stack alive for a reconnect (reload/blip) instead of busting now
    if (this.hand && this.phase === 'playing') {
      forceFold(this.hand, id);
      this._syncChips();
      if (isComplete(this.hand)) this._endHand();
    }
    this._broadcastPoker();
  }

  // Host: a previously-seated player reconnected under a NEW peer id (reload / network blip). Schedule a
  // seat re-key at the next safe boundary (between hands — no live hand references the ids) and tell the
  // rejoining client to rebuild its table WITHOUT charging it again. Returns false if it wasn't seated.
  hostReattach(oldId, newId) {
    if (!this.coop || this.role !== 'host' || !this.tour || oldId === newId) return false;
    if (!this.tour.players.some((p) => p.id === oldId && p.stack > 0)) return false; // a LIVE seat only (stack>0) — never re-arm a BUSTED reloader (it would mint a refund for a buy-in it already lost in play)
    if (this.phase === 'over') {
      this._rekeySeat(oldId, newId);   // TERMINAL: no _beginHand will ever run again, so a queued re-key would never apply → re-key NOW so a winner who reloads at 'over' still maps to its payout + gets credited
    } else {
      if (!this._reattach.some(([o]) => o === oldId)) this._reattach.push([oldId, newId]); // playing/handresult: defer to the safe boundary (_beginHand, AFTER settleHand maps hand.seats→players by id)
    }
    try { this.game.mp.net.sendTo(newId, 'pkresync', { buyIn: this.coopBuyIn, names: this.names, skins: this.skins, cardBack: getCardBackSkin(), baskets: this.baskets }); } catch (e) {}
    if (this.phase === 'over') this._broadcastPoker(); // stream the terminal snapshot straight to the re-keyed peer (after the ordered pkresync it sees its credit)
    return true;
  }

  // Pure rename of one seat across every id-keyed structure (applied at a hand boundary). No value moves.
  _rekeySeat(oldId, newId) {
    const seat = this.tour.players.find((p) => p.id === oldId); if (!seat || oldId === newId) return;
    if (this.tour.players.some((p) => p.id === newId)) return;              // collision guard
    seat.id = newId;
    for (const m of [this.names, this.skins, this.baskets]) { if (oldId in m) { m[newId] = m[oldId]; delete m[oldId]; } }
    if (this.itemPot && this.itemPot.baskets && oldId in this.itemPot.baskets) { this.itemPot.baskets[newId] = this.itemPot.baskets[oldId]; delete this.itemPot.baskets[oldId]; } // sealed union is unchanged (sum-invariant); re-key so verify()/itemStake stay coherent
    if (this.chipbank && this.chipbank.rekey) this.chipbank.rekey(oldId, newId);
    this._dropped.delete(oldId); this._dropGrace.delete(oldId);            // the player is back — clear its drop/grace
    if (this._confirmed && this._confirmed.has(oldId)) { this._confirmed.delete(oldId); this._confirmed.add(newId); }
    const r = this.tour.result;                                           // re-key a FINISHED tournament's result too → a winner reconnecting at 'over' still maps to its payout (else moneyPayout=payouts[newId]=0)
    if (r) {
      if (r.payouts && oldId in r.payouts) { r.payouts[newId] = r.payouts[oldId]; delete r.payouts[oldId]; }
      if (r.winner === oldId) r.winner = newId;
      if (Array.isArray(r.standings)) r.standings = r.standings.map((x) => (x === oldId ? newId : x));
    }
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
      if (this._reattach.length) { for (const [oldId, newId] of this._reattach.splice(0)) this._rekeySeat(oldId, newId); } // reconnects re-key here (safe: no live hand yet)
      for (const id of this._dropped) { if (this._dropGrace.has(id)) continue; const p = this.tour.players.find((x) => x.id === id); if (p) p.stack = 0; } // bust only seats past the reconnect grace
      if (this.tour.alivePlayers().filter((p) => !this._dropped.has(p.id)).length < 2) { this._walkover(); return; } // <2 CONNECTED seats → end now. A single graced drop keeps a 3+-handed game going; heads-up ends on a drop (the lone survivor can't play on — grace can't protect a 2-player table, see DROP_GRACE_SECS).
      // refresh per-seat chip skins from the roster so a lobby/between-hand pick reaches THIS hand's stacks,
      // then re-stamp provenance (no value re-deal). dealStart mints once per tournament; this reskin is the
      // between-hand seam. Pot/bets are empty at the boundary, so chips already played stay frozen (mid-hand).
      if (this.game.mp && this.game.mp.roster && this.chipbank) {
        for (const id in this.skins) { const r = this.game.mp.roster.get(id); if (r && typeof r.chipSkin === 'string') this.skins[id] = r.chipSkin; }
        this.chipbank.reskin(this.skins);
      }
    }
    this.hand = this.tour.startNextHand();
    this._lastCommitted = {};
    this._syncChips();                          // post the blinds the engine just committed in startHand
    this.phase = 'playing';
    this.actTimer = this.coop ? ACT_SECS_COOP : ACT_SECS; this.botDelay = 0;
    // hold action while the renderer pitches the cards in (∝ how many seats were dealt → matches the visual)
    this._hold = DEAL_ANIM_BASE + (this.hand && this.hand.seats ? this.hand.seats.length : 0) * 2 * DEAL_ANIM_STAGGER;
    if (isComplete(this.hand)) this._endHand();
  }

  _walkover() { // everyone else gone — last CONNECTED player standing takes the pool
    const alive = this.tour.alivePlayers();
    // prefer a CONNECTED survivor; if none is connected (host busted + everyone else dropped) fall back to the
    // host (always present) so the buy-ins aren't DESTROYED by crediting a disconnected ghost no one can collect
    // (_payout credits only youId, and the ghost's 'over' snapshot goes to a dead channel → pool stranded).
    const survivor = alive.find((p) => !this._dropped.has(p.id))
      || this.tour.players.find((p) => p.id === this.youId)
      || alive[0];
    this.tour.over = true;
    if (survivor) { survivor.place = 1; this.tour.result = { winner: survivor.id, payouts: { [survivor.id]: this.tour.prizePool }, standings: [survivor.id] }; }
    this.phase = 'over'; this._overT = 0; this._payout(); this._broadcastPoker();
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
    const boardBefore = this.hand ? this.hand.board.length : 0;
    try { applyAction(this.hand, action); } catch (e) { console.warn('[poker] action rejected:', JSON.stringify(action), '-', e.message); return; }
    this._syncChips();
    this.actTimer = this.coop ? ACT_SECS_COOP : ACT_SECS;
    this._lastAct = { type: action && action.type, n: (this._actSeq = (this._actSeq | 0) + 1) }; // tell the renderer the action TYPE → check/fold SFX (works for bots + co-op)
    // presentation pacing — hold action so the renderer can choreograph what just happened, in order:
    const newCards = (this.hand ? this.hand.board.length : 0) - boardBefore;
    if (newCards > 0) this._hold = Math.max(this._hold, STREET_HOLD_BASE + newCards * STREET_HOLD_PER_CARD); // round closed: bets→pot collect, THEN reveal each new card
    else if (action && action.type === 'fold') this._hold = Math.max(this._hold, FOLD_HOLD);                 // let the muck animation play
    if (isComplete(this.hand)) this._endHand();
    this._broadcastPoker();
  }

  // ---------- physical chip layer (host/solo only; clients render the host's snapshot) ----------

  // DEV/QA only (called from the console): force per-seat skins so the multi-skin pot is visible in SOLO
  // (where there's just your skin + dice bots). Re-mints only the cosmetic ledger (NO value re-deal → safe
  // mid-hand, no chip/engine desync). No money/authority effect.
  setDebugSkins(map) { this.skins = { ...this.skins, ...(map || {}) }; if (this.chipbank) this.chipbank.reskin(this.skins); }

  _dealChips() {
    this._applyChipSkin(); this._applyCardBack(); // honour the saved cosmetics (fall back if locked) before anything is built
    this.chipbank = new ChipBank();
    const ids = this.tour.players.map((p) => p.id);
    if (chipValue(STARTING_CHIPS) !== this.tour.startStack) {            // STARTING_CHIPS must total the engine start stack
      console.warn(`[poker] STARTING_CHIPS value ${chipValue(STARTING_CHIPS)} != startStack ${this.tour.startStack} — chip/engine values will drift until reconcile`);
    }
    // provenance: each seat's starting stack is minted in ITS skin. Co-op seats come from the roster
    // (this.skins); the local 'you' seat FALLS BACK to the applied global skin when it isn't already in the
    // roster (so YOUR stack reads as your pick in solo; in co-op the roster supplies it). Unlisted bots →
    // 'house' (the dice look). The pot then mixes these as chips flow.
    const dealSkins = { ...this.skins }; if (!dealSkins[this.youId]) dealSkins[this.youId] = getChipSkin();
    this.chipbank.dealStart(ids, STARTING_CHIPS, floatFor(ids.length), dealSkins);
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
    if (this.role === 'client') { // client just renders snaps — but tick the ante-wait backstop so a lost deal/pkabort never eats the buy-in
      if (this._anteWait > 0 && !this.clientSnap) {        // no host snapshot ever arrived = the host never dealt
        this._anteWait -= dt;
        if (this._anteWait <= 0 && !this._credited && !this._refunded && !this._aborted) {
          this._refund(); this._toast('No deal — buy-in refunded', 0xd8b066);
          this.coop = false; this.role = 'solo';
          if (this.game.state === 'poker') this.game.closePoker();
        }
      }
      return;
    }
    if (!this.active) return; // host/solo drive
    if (this.coop && this.role === 'host' && this._dropGrace.size) { // tick reconnect grace; on expiry the seat busts at the next _beginHand
      for (const [id, t] of this._dropGrace) { const r = t - dt; if (r <= 0) this._dropGrace.delete(id); else this._dropGrace.set(id, r); }
    }
    if (this._gathering) { // host: ante-ack window — deal once everyone confirms, or seat-the-confirmed / cancel at the deadline
      this._anteDeadline -= dt;
      if (this._anteDeadline <= 0) this._finalizeDeal();
      return;
    }
    if (this.phase === 'playing' && this.hand) {
      if (this._hold > 0) { // presentation hold (deal-in / street collect+reveal / fold muck) — freeze all action until the renderer catches up
        this._hold -= dt;
        if (this.coop) { this._netT -= dt; if (this._netT <= 0) { this._netT = NET_SNAP; this._broadcastPoker(); } }
        return;
      }
      const legal = legalActions(this.hand);
      if (!legal) return;
      if (this.coop && this.role === 'host' && this._dropped.has(legal.seat)) { // disconnected seat (within grace) — don't stall: take the free check, else fold
        this._applyAndAdvance(legal.canCheck ? { type: 'check' } : { type: 'fold' });
        return;
      }
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
        if (this.tour.over) { this.phase = 'over'; this._overT = 0; this._payout(); } else this._beginHand();
        this._broadcastPoker();
      } else if (this.coop) { this._netT -= dt; if (this._netT <= 0) { this._netT = NET_SNAP; this._broadcastPoker(); } } // keep a lagging / re-syncing client current through the showdown linger
    } else if (this.phase === 'over' && this.coop && this.role === 'host') {
      // re-broadcast the terminal snapshot for a few seconds so a client's payout credit (idempotent via
      // _credited) survives a dropped 'over' packet; a later reconnect is covered by the resync handshake.
      this._overT = (this._overT || 0) + dt;
      if (this._overT < OVER_REBROADCAST_SECS) { this._netT -= dt; if (this._netT <= 0) { this._netT = NET_SNAP; this._broadcastPoker(); } }
    }
  }

  // ---------- snapshots / rendering ----------

  _payloadFor(id) {
    const v = this.hand ? privateView(this.hand, id) : null;
    const legal = (this.phase === 'playing' && this.hand && !(this._hold > 0)) ? legalActions(this.hand) : null; // no controls during a presentation hold (deal/street/fold)
    const yourTurn = !!(legal && legal.seat === id);
    const res = (this.phase === 'over' && this.tour.result) ? this.tour.result : null;
    const moneyPayout = res ? (res.payouts[id] || 0) : 0;
    // item winnings: the whole sealed union goes to the winner (read _minted directly so EVERY re-broadcast
    // carries it — the client dedups via _itemCredited; awardTo's latch is only for the host's own credit).
    const itemPayout = (res && res.winner === id && this.itemPot && this.itemPot._minted) ? bagClone(this.itemPot._minted.items) : {};
    return {
      view: v,
      tour: this.tour.tournamentView(),
      legal: yourTurn ? legal : null,
      yourTurn,
      timeLeft: this.phase === 'playing' ? Math.max(0, Math.ceil(this.actTimer)) : null, // seconds; UI shows it only in the last 15s
      phase: this.phase,
      result: (this.phase === 'handresult' || this.phase === 'over') && this.hand ? this.hand.result : null,
      over: this.phase === 'over',
      youId: id, names: this.names, skins: this.skins, cardBack: getCardBackSkin(), moneyPayout, itemPayout, itemStake: this.baskets, lastAct: this._lastAct, seq: this._snapSeq | 0,
      // live refs to the bank's chip sets — READ-ONLY contract (clients get a JSON copy via pksnap; the
      // host renderer must only read these, never mutate them, or it would break conservation).
      chips: this.chipbank ? { stacks: this.chipbank.stacks, bets: this.chipbank.bets, pot: this.chipbank.pot,
        skins: { stacks: this.chipbank.skinsAt.stacks, bets: this.chipbank.skinsAt.bets, pot: this.chipbank.skinsAt.pot } } : null, // cosmetic provenance ledger (float is host-only, never rendered)
    };
  }

  _broadcastPoker() {
    if (!this.coop || this.role !== 'host' || !this.tour) return;
    this._snapSeq = (this._snapSeq | 0) + 1;   // one monotonic stamp per broadcast → clients drop anything older
    const net = this.game.mp.net;
    for (const p of this.tour.players) {
      if (p.id === this.youId) continue;       // host renders its own view locally
      try { net.sendTo(p.id, 'pksnap', this._payloadFor(p.id)); } catch (e) {}
    }
  }

  render(dt) {
    if (!this.renderer || this.phase === 'lobby') return;
    if (this.role === 'client') { if (this.clientSnap) this.renderer.renderTable(this.clientSnap, dt); return; }
    this.renderer.renderTable(this._payloadFor(this.youId), dt);
  }

  // ---------- bank ----------

  _spend(n) { // returns the amount actually debited (0 if practice / unaffordable)
    if (this.mode === 'practice' || !n) return 0;
    if ((this.game.meta.bank | 0) >= n) { this.game.meta.bank -= n; this.game._saveMeta(); return n; }
    return 0;
  }
  _payout() { // host crediting itself when it is the winner — money + the staked item union (each idempotent)
    if (this.mode === 'practice') return;
    const res = this.tour && this.tour.result; if (!res) return;
    if (!this._credited) { const pay = res.payouts[this.youId]; if (pay) { this.game.meta.bank = (this.game.meta.bank | 0) + pay; this.game._saveMeta(); this._credited = true; } }
    if (res.winner === this.youId && this.itemPot && !this._itemCredited && this.game.items) {
      const won = this.itemPot.awardTo(this.youId).items;        // idempotent inside ItemPot too
      let any = false;
      for (const k in won) { const n = won[k] | 0; if (n > 0) { this.game.items.acquire(k, n, 'poker-win'); any = true; } }
      if (any) this.game._saveMeta();
      this._itemCredited = true;
    }
  }
  _refund() { // abort/teardown: return exactly what THIS player escrowed (money + items). Mutually exclusive with a win.
    if (this.mode === 'practice' || this._refunded || this._credited || this._itemCredited || (!this._paid && !this._lockedItemsAny())) return;
    if (this._paid) this.game.meta.bank = (this.game.meta.bank | 0) + this._paid; // refund exactly what was paid
    if (this.game.items && this._lockedItemsAny()) { try { this.game.items.applyBasket(this._lockedItems, +1); } catch (e) { console.warn('[poker] item refund failed', e); } }
    this.game._saveMeta(); this._refunded = true; this._itemRefunded = true;
  }

  // ---------- teardown ----------

  _reset() {
    this.active = false; this.phase = 'lobby'; this.tour = null; this.hand = null;
    this.chipbank = null; this._lastCommitted = {};
    this.clientSnap = null; this._netT = 0; this._overT = 0; this._anteWait = 0; this._dropped = new Set(); this._dropGrace = new Map(); this._reattach = []; this._hold = 0; this._lastAct = null; this._actSeq = 0; this._lastSnapSeq = 0; // NB: _snapSeq is NOT reset (host counter stays monotonic across games so a client never false-drops a new game's snaps)
    this._credited = false; this._refunded = false; this._aborted = false; this.coopBuyIn = 0; this._paid = 0;
    this._gathering = false; this._invited = new Set(); this._confirmed = new Set(); this._anteDeadline = 0; // co-op ante-ack window (C1)
    this.itemPot = null; this.baskets = {}; this._lockedItems = {}; this._itemCredited = false; this._itemRefunded = false; // item-wager escrow
  }

  // The basket THIS table will stake for `id`: its lobby-composed roster basket, else a money-only basket at
  // the headline buy-in (so a table with no item baskets reproduces today's uniform money game exactly).
  _basketFor(id) {
    const r = this.game.mp && this.game.mp.roster && this.game.mp.roster.get(id);
    const b = r && r.basket;
    if (b && (b.items || typeof b.money === 'number')) return { items: bagClone(b.items || {}), money: Math.max(0, (b.money != null ? b.money : this.coopBuyIn) | 0) };
    return { items: {}, money: this.coopBuyIn | 0 };
  }
  _lockedItemsAny() { return bagUnits(this._lockedItems) > 0; }

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
