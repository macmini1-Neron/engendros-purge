# Design: Continuous Waves + Pre-Game Loadout Economy

**Date:** 2026-05-29
**Game:** ENGENDROS PURGE (`src/game.js`, single-file Three.js voxel wave shooter)
**Status:** Design — awaiting user review before implementation plan.

---

## 1. Goal

Replace the between-wave shop economy with a **roguelite meta-progression**:

- **Waves flow continuously** — no shop interruption between waves.
- **Purchasing moves to a pre-game armory** in the menu/lobby UI.
- **Purchases are permanent** (a persistent money "bank"); you keep unlocked gear forever.
- **A typed-slot loadout** limits what you bring into a run (you can own a lot, equip only four).
- **Cold start:** every new player begins with **only a knife** and must bank money to unlock everything else.

This is paired with a wave-flow fix: the current Long Night `despawnStragglers` failsafe (which deletes un-killed mobs on a 16 s timer) is the reported "mobs vanish + wave advances on a timer" bug and is removed.

---

## 2. Current state (what we change)

- `WaveManager` (`game.js` ~3863): PURGE clears only on `aliveCount===0` (no failsafe → soft-lock risk). Long Night uses `clearGrace=16 → despawnStragglers()` (deletes survivors — the bug). After clear → `onWaveCleared` → `_waveBreak=1.4` → opens **shop** → player clicks **next wave** (`beginNextWave`).
- `Shop` class (`game.js` ~4042) + `SHOP_ITEMS` (~4030): between-wave shop, tabs Items/Weapons, spends `player.money` (per-run, resets to 0 each run).
- `WeaponSystem.resetLoadout()` (~2709): grants `luger` + `knife` by default; `owned[k]`, dynamic slots via `ownedOrder()`.
- **Rarity system**: `RARITY` table, `weapons.rarity[k]`, `grant(key, rarityKey)`, rarity rolled on drops/supply, shown in HUD (colored weapon name). To be removed.
- **Keys**: `player.keys`, HUD `#keys`, dropped by enemies / elites, shop "Lootbox Key" item. Lootboxes already removed (no crates on map); supply drops use **radios** not keys. Keys are now vestigial. To be removed (converted to money).
- **Persistence**: `localStorage engendros_meta` = `{bestWave, bestScore, bestNight, kills, runs}`.
- **MP**: each player keeps own loot/economy; kills credited to shooter; clients gated by `hostSim`.

---

## 3. Wave flow (decided)

A wave advances under **two** conditions; on either, the next wave starts with **no shop**:

1. **Cleared** — all enemies dead (`toSpawn<=0 && aliveCount===0`): show "WAVE CLEAR", **~4 s breather** (grab loot, reposition), then auto-start next wave.
2. **Timed advance** — once the whole wave has spawned (`toSpawn<=0`) a **~25 s countdown** runs; if it expires with enemies still alive, the next wave starts anyway and **survivors are carried over** (NOT despawned — they persist and stack with the new wave's spawns). The timed advance shows an **incoming-wave banner** ("WAVE N — survivors remain" or similar) but **no "WAVE CLEAR" and no ~4 s breather** (you didn't clear it — the new spawns layer straight on).

Rules:
- **Bosses are never skipped or carried-over-past:** while a boss is alive the timed-advance countdown is paused (boss waves require the kill). Adds may carry over.
- **No `despawnStragglers` / no mob deletion on a timer, ever.** This removes the reported bug.
- Applies to **both** PURGE and THE LONG NIGHT (unified). Long Night keeps its day/night escalation; only the clear/advance mechanism changes.
- Survivors carrying over has no cap (they remain killable; difficulty self-corrects).

**State machine impact:** `onWaveCleared` no longer opens the shop. The post-clear `_waveBreak` becomes a pure ~4 s breather that auto-calls `startWave(wave+1)`. A new per-wave timer (`spawnedAt` / `clearGrace`-style, ~25 s, started when `toSpawn` hits 0) triggers the timed advance. The `Shop` state and `beginNextWave` button flow are removed from the in-run loop.

---

## 4. Economy: Bank + permanent unlocks (decided)

- **Currency = a persistent money Bank.** In-run `player.money` is earned from kills/waves as today. **At run end** (death / game over) the run's money is added to `meta.bank`. (Money is no longer spent mid-run — there is no in-run shop.)
- **Pre-game armory** (in the menu/lobby) spends `meta.bank` to **permanently unlock** weapons and gadgets (`meta.unlocked`).
- **Consumables are scavenge-only** (hardcore): you spawn with your equipped weapons at **full ammo + the gadget's base charge**; **all** extra ammo, health, and armor come only from in-run enemy drops + Su-24 supply drops. The bank buys **permanent gear only** — no stat upgrades, no starting kits (keeps the "no stat-creep" rule).
- **Rarity is removed entirely** — all weapons use flat base stats everywhere (drops, supply, owned). No colored tiers.
- **Keys are removed** — key drops convert to a small money payout; the "Lootbox Key" shop item is gone.

### Loadout: typed slots (decided)

Four slots, filled from `meta.unlocked`:

| Slot | Accepts |
|---|---|
| **Primary** | rifle / SMG / LMG / shotgun / sniper / launcher |
| **Secondary** | pistol |
| **Melee** | knife / machete / cleaver / shovel / axe |
| **Gadget** | molotov / grenade / builder (sandbag/wire/wood) / flashlight |

- You **own** many (permanent), you **equip** four (per run).
- Slots may be **empty** if you have not unlocked anything for them.
- The loadout is **per-player**, persisted in `meta.loadout`, and carried into **both** solo runs and any co-op game you host/join (each player brings their own).

### Cold start (decided)

- A brand-new player has **only the knife unlocked** and equipped in the Melee slot. **Primary / Secondary / Gadget start empty.**
- The very first run is therefore **knife-only**; you bank money and unlock your first gun in the armory.
- **Balance note (not a blocker):** wave 1 must be survivable with the knife and bank enough to afford a cheap first weapon. Tuning levers: first-weapon unlock prices (keep a cheap entry pistol/SMG low), per-kill money, and wave-1 size. To be tuned during implementation/playtest.

---

## 5. Persistence schema

Extend `engendros_meta` (backward-compatible; missing keys default):

```js
{
  // existing
  bestWave, bestScore, bestNight, kills, runs,
  // new
  bank: 0,                                   // persistent money
  unlocked: ['knife'],                       // permanently owned gear keys
  loadout: { primary: null, secondary: null, melee: 'knife', gadget: null }
}
```

- `_loadMeta` seeds `bank:0, unlocked:['knife'], loadout:{...melee:'knife'}` when absent.
- `_saveMeta` persists after each unlock, loadout change, and run end (bank deposit).

---

## 6. UI

### Menu/lobby hub (Armory panel — replaces `Shop`)
- Reuses the current shop's **3D weapon preview** (`WeaponPreview`) and card grid styling.
- **💰 Bank** balance shown at top.
- **Tabs by slot** (Primary / Secondary / Melee / Gadget). Each lists eligible gear: locked items show an **unlock price** ("UNLOCK $X"); unlocked items show **EQUIP / EQUIPPED**.
- Bottom: the **four current slots** + a **START (solo)** action and the existing **HOST / JOIN** co-op actions. Loadout you build here is what you deploy with.
- Lives in the lobby/menu so the flow is: build loadout → play solo or join a co-op game.

### In-run HUD
- Keep `money` (now shown as "this run → banks on death"). Remove the **keys** counter and all **rarity** coloring of the weapon name (flat color).
- Weapon switching cycles only the **equipped** loadout (Primary/Secondary/Melee/Gadget), not a dynamic owned-list.

---

## 7. Removals / cleanup

- **`Shop` class + `SHOP_ITEMS`** and the between-wave shop state, `beginNextWave` button flow, `_mpOpenShop` shop-on-clear.
- **Rarity:** `RARITY` table usage, `weapons.rarity`, the `rarityKey` param on `grant`, rarity rolls in `Loot.drop` / supply, HUD rarity color/name.
- **Keys:** `player.keys`, HUD `#keys`, key pickups/drops (convert to money), "Lootbox Key" item.
- **Long Night `despawnStragglers` + `clearGrace`** timed deletion (replaced by §3 timed-advance-carryover).
- Supply drop (Su-24): keep as resupply (full heal/ammo/armor + build mats) + a **bank cash bonus**; drop its rarity/epic-weapon roll.

---

## 8. MP considerations

- Bank, unlocks, and loadout are **per-player** (each player's own `localStorage`), consistent with the existing "own economy" model.
- On host/join, each client deploys with **its own** `meta.loadout`; the host does not dictate loadouts.
- Run-end bank deposit happens locally per player (on their own death / squad game-over).
- Continuous-wave timing remains **host-authoritative** (`hostSim`); clients still receive wave events. The shop-sync messages (`wave`/`waveclear` opening a shop) are simplified — clients just see the continuous wave banners; no shop screen mid-run.

---

## 9. Build sequence (phased)

1. **Persistence + Bank:** extend `meta` schema, `_loadMeta`/`_saveMeta`, deposit run money on game over, bank getter.
2. **Loadout model:** `meta.loadout` + `meta.unlocked`; rewrite `resetLoadout()` to deploy the loadout (knife-only default); switching cycles equipped slots.
3. **Wave flow:** continuous advance (clear→breather→next; spawned→25 s→next w/ carryover), remove despawn, boss-pause; remove in-run shop/`beginNextWave`.
4. **Armory UI:** new `Armory` (from `Shop`) in menu/lobby — bank, slot tabs, unlock/equip, preview reuse, START/HOST/JOIN.
5. **Removals:** rarity system, keys, `SHOP_ITEMS`, dead shop paths; supply-drop cash bonus.
6. **Balance + live verify:** first-weapon prices, per-kill money, wave-1 survivability; Playwright verify (continuous waves, carryover-not-despawn, bank deposit, loadout deploy, knife-only cold start).

---

## 10. Open questions / risks

- **Cold-start grind:** knife-only first run vs. continuous hardcore waves — must be tuned so progression isn't frustrating (see §4 balance note).
- **Lobby UI density:** fitting the armory (4 slot tabs + preview + bank) into the existing `#lobby` overlay; may need a layout pass.
- **Carryover stacking** across several timed advances could pile up enemies if the player is very slow — acceptable by design (killable), but watch alive-cap interaction so spawns don't starve.

---

## 11. Out of scope

- New weapons/enemies; weapon-model upgrades (paused per project decisions).
- Stat upgrades / perks (explicitly removed earlier — do not re-add).
- Host-migration, mounted-.50/supply-drop MP sync (pre-existing gaps).
