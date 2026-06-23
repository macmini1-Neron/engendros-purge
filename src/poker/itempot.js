// itempot.js — the poker item-wager ESCROW ledger (the item analogue of the chip pot).
//
// Asymmetric stakes: each seat puts up its OWN basket — a bag of items plus optional money. At deal time
// the host LOCKs every confirmed seat's basket here, SEALs the pot (minting the conserved union once), and
// at showdown AWARDs the whole union to the single tournament winner. Pure (no THREE/DOM), node-tested,
// mirroring src/poker/chipbank.js: mint once at seal, never invent, verify the sum, award idempotently.
//
// A Basket is { items: { itemKey: count }, money: int }. Items leave each player's account ItemBank at
// lock-in (host-authoritative on the host; each client mirrors its OWN basket locally) and re-enter the
// winner's ItemBank at award. The honest-peer caveat that already applies to money applies to items too:
// the host cannot verify another machine's inventory, only that what it SEALED is exactly what it awards.
import { bagAdd, bagClone, bagSig } from '../itembank.js';

export class ItemPot {
  constructor() {
    this.baskets = {};      // { seatId: { items:{key:count}, money:int } } — what each seat put up
    this._minted = null;    // { items, money } — the union frozen at seal(); the conserved total
    this._awarded = false;  // idempotency latch (a re-broadcast 'over' must never award twice)
  }

  // record a seat's declared basket (host-side). Cloned so later edits can't mutate the escrow.
  lock(seatId, basket) {
    basket = basket || {};
    this.baskets[seatId] = { items: bagClone(basket.items || {}), money: Math.max(0, basket.money | 0) };
  }

  // drop a seat that declined / dropped BEFORE the pot is sealed (mirrors the ante-gather not seating it).
  unlock(seatId) { delete this.baskets[seatId]; }

  _sum() {
    let items = {}, money = 0;
    for (const id in this.baskets) { items = bagAdd(items, this.baskets[id].items); money += this.baskets[id].money | 0; }
    return { items, money };
  }

  // freeze the union of all locked baskets — the conserved mint, set ONCE.
  seal() { this._minted = this._sum(); return this._minted; }

  // conservation backstop: the live sum of baskets must still equal what was minted at seal.
  verify() {
    if (!this._minted) return true;                              // not sealed yet → nothing to check
    const cur = this._sum();
    if (bagSig(cur.items) !== bagSig(this._minted.items)) throw new Error(`ItemPot: item union drifted from mint (${bagSig(cur.items)} != ${bagSig(this._minted.items)})`);
    if ((cur.money | 0) !== (this._minted.money | 0)) throw new Error(`ItemPot: money drifted from mint (${cur.money} != ${this._minted.money})`);
    return true;
  }

  // hand the whole sealed union to the winner. Idempotent: a second call (re-broadcast) returns nothing.
  awardTo(winnerId) {
    if (this._awarded || !this._minted) return { items: {}, money: 0 };
    this._awarded = true;
    return { items: bagClone(this._minted.items), money: this._minted.money | 0 };
  }

  totalMoney() { return this._minted ? (this._minted.money | 0) : this._sum().money; } // prizePool helper
}
