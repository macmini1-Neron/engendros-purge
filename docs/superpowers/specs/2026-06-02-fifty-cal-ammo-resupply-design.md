# .50-cal Ammo Resupply — Design

**Date:** 2026-06-02
**Branch:** `feat/fifty-ammo-resupply` (built in an isolated git worktree off latest `origin/main`)
**Status:** Design approved — pending implementation plan

## Problem

The rooftop .50-cal (`MountedGun`, `src/weapons.js`) starts a run with `maxAmmo = 250` and the HUD shows `X / 250`. The **only** path that refills it is `MountedGun.forceReset()`, which is called exclusively at run boundaries — `Game.reset()`, `Game.toMenu()`, `Game._mpReturnToLobby()`, `Game.onPlayerDead()` — **never between waves**.

So within a single run you get exactly one belt of 250 rounds. Once you burn it:

- `_fire()` is gated on `this.ammo > 0` → can't fire.
- `canMount()` / `mount()` are gated on `this.ammo > 0` → can't even re-man it.
- The gun is permanently dead for the rest of the run while the HUD still reads `0 / 250`.

This reads as a bug ("only the first 250 work"). Rather than auto-refill the gun, we make the finite ammo **intentional** and add a resupply loop: when the .50-cal runs low, you fetch a **.50-cal ammo can** from a supply drop and reload the gun with it.

## Goals

1. Add a new loot item — a **.50-cal ammo can** (US M2A1 box, per the supplied reference images) — distinct from the existing generic "Ammo Box".
2. The can drops from **supply drops** (host-authoritative).
3. Holding the can, the player **reloads the rooftop .50-cal** by standing at it and pressing **E** (the existing "interact with the gun" key).
4. Works correctly in host-authoritative co-op.

## Non-goals

- No auto-refill between waves (the finite belt is now intentional).
- No change to hand-weapon ammo (the recently-merged `feat(ammo): remove reserve ammo cap`, f65a889, is unrelated — it governs `WeaponSystem.reserve` for held firearms, not the `MountedGun`).
- The can only resupplies the rooftop .50-cal; it does nothing for hand weapons.

## Resolved decisions

| Decision | Choice |
|---|---|
| Refill amount per can | **Full refill to `maxAmmo` (250).** One can = a fresh belt. |
| When refill is allowed | **Any time `ammo < maxAmmo`** — top up a partially-spent belt, not just an empty one. |
| Supply-drop frequency | **~40% chance** per supply drop (independent roll, like the radio but ungated). |
| Refill input | **E** is the intended interaction (at the gun). **LMB** while holding the can does the same thing via a shared helper, so it is never surprising. Neither ever wastes the can. |
| Model | Follow the reference 1:1 — **US M2A1 olive-steel can** with wire bail handle, side toggle latch, and the yellow stencil (`100 CRTG .50 CAL / LINK M9 / 4-BALL M33 / 1-TRACER M17`), voxel layered-shading. Visually distinct from the existing Soviet-styled generic ammo box. |

## Design

### New item: `fiftyammo`

Add to `ITEM_DEFS` (`src/loot.js`):

```js
fiftyammo: { name: '.50 Cal Ammo Can', class: 'consumable', icon: '🟩', mesh: 'fiftyammo' },
```

- `class: 'consumable'` so it slots into the existing held-item / hotbar machinery, but it has **no heal/food/armor value** — its only effect is the .50-cal reload (handled by the shared helper below).
- Ground pickup goes **into the backpack** like a medkit (it is *not* a generic `ammo` pickup, so it does not auto-refill a held gun on the ground — you carry it to the .50-cal).
- A new voxel model in `_pickupMesh('fiftyammo')` (ground) and the matching held viewmodel (same path the other `ITEM_DEFS` consumables use for `itemModels`).

### Reload mechanic

One authoritative helper owns the reload — proposed `MountedGun.reloadFromCan()` (`src/weapons.js`). Contract:

- **Reject** (return a falsy/`{ok:false}` result, **do not** consume the can) when `ammo >= maxAmmo`.
- **Host or solo** (`!mp.active || mp.isHost`): `setAmmo(maxAmmo)`, play the charge animation + foley (`animateCharge()` + the existing .50-cal charge sound — it reads as racking the gun), and in co-op broadcast the new state (`fiftystate {occ, ammo}`) plus `fiftysound {k:'charge'}`.
- **Client** (`mp.active && !mp.isHost`): send the new `fiftyrefill` message to the host, play the local charge anim/sound for responsiveness, and return success. The host is the authority that actually sets the ammo and re-broadcasts.

Callers consume the can **only** when the helper reports success.

### Input wiring

**E (primary)** — in the `KeyE` chain (`src/game.js`), add a branch **before** the existing mount/dismount branch:

> If the held item is `fiftyammo` **and** `mountedGun.near(player.pos)` **and** `mountedGun.ammo < mountedGun.maxAmmo` → call `reloadFromCan()`, consume the can on success, and return (do not fall through to mount).

When the gun is already full, this branch is skipped and E behaves normally (mounts the gun even while holding the can).

**LMB (secondary, forgiving)** — in `Inventory._useConsumable` (`src/inventory.js`), add a `fiftyammo` case that calls the same helper. If it can't reload (not near the gun, or already full) set `used = false` so the can is **not** consumed, and show a hint toast.

### Supply-drop integration

In `LootManager._spillDropLoot()` (`src/loot.js`, the host-authoritative crate-open path), add an independent `chc(0.40)` roll that spawns a `fiftyammo` pickup via the existing `spawnNetPickup()`. This rides the existing host-authoritative supply-drop + pickup sync — no new drop logic, just a new item kind flowing through `pickup` / `pickupclaim` / `pickupgrant`.

### Co-op (host-authoritative)

The gun's ammo is host-owned state. New message:

- **`fiftyrefill`** (client → host, in `src/mp.js`): host validates `gun && gun.ammo < gun.maxAmmo`, does `setAmmo(maxAmmo)`, then broadcasts `fiftystate {occ, ammo}` and `fiftysound {k:'charge'}` so every peer sees the new belt and hears/sees the rack.

The can itself lives in the refilling player's **local** backpack and is consumed locally. Worst case (two players reload in the same instant) one can is wasted on an already-full gun — acceptable for a co-op wave shooter; the client-side `ammo < maxAmmo` pre-check (against synced ammo) makes it rare.

## Feedback

- Reload success: toast `.50 CAL · 250 / 250` (gold) + charge anim + foley.
- Rejected (full): toast `Munice plná` (LMB path only; E silently falls through to mount).
- Rejected (not at gun, LMB path): toast `Stůj u .50 cal` hint.

## Edge cases

- **Holding the can, gun full, press E:** refill branch skipped → mounts normally.
- **Holding the can, not near gun, press E:** refill branch skipped → falls through to the normal E chain (pickup / open crate / flashlight).
- **Overheated gun:** reload is independent of heat — you can top up a hot, low-ammo gun; mounting it is still heat-gated as today.
- **No `mountedGun` in the level / mode without one:** `near()` is false → branch skipped, LMB shows the hint, can is kept.

## Files touched (anticipated)

| File | Change |
|---|---|
| `src/loot.js` | `ITEM_DEFS.fiftyammo`; `_pickupMesh('fiftyammo')` voxel model; `_spillDropLoot()` 40% roll. |
| `src/weapons.js` | `MountedGun.reloadFromCan()` helper. |
| `src/game.js` | `KeyE` chain: reload-before-mount branch. |
| `src/inventory.js` | `_useConsumable` `fiftyammo` case (LMB) + held viewmodel build for the new item. |
| `src/mp.js` | `fiftyrefill` message + `_hostFiftyRefill()`. |
| `index.html` / `src/game.js` | Cache-bust ritual at the end: bump `?v=197 → 198` and `GAME_BUILD`. |

## Verification (manual, in-browser — no test suite)

Serve the worktree over HTTP and validate:

1. Solo: man the .50-cal, fire to a low/empty belt, dismount, confirm a `fiftyammo` can in the backpack reloads to `250/250` on E at the gun (and via LMB), with the charge anim/sound; confirm a full gun keeps the can.
2. Force a supply drop (`GAME.loot.callSupplyDrop()` / radio) repeatedly and confirm the can drops at roughly the chosen rate and picks up into the backpack.
3. Co-op (2 peers): a client reloads the host's gun; confirm the host's ammo and the charge FX sync to all peers and the can is consumed only on the client that used it.
