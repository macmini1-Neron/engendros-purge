# Weapon Realism Revision — Design

**Date:** 2026-06-02
**Branch:** `feat/weapon-realism`
**Status:** Design approved (pending written-spec review) → next: implementation plan
**Owner module:** `src/weapons.js` (the `WEAPONS` registry + `WeaponSystem`), with a small co-op touch in `src/mp.js`.

## Goal

A full, realism-driven revision of the entire player weapon roster (20 firearms + 5 melee). Weapons should feel **harder and heavier**, grounded in their real WW2 references — authentic-ish rate of fire, cartridge power, recoil character, magazine capacities, and **strict** ammunition economy — while staying playable in a continuous wave shooter.

This is **not** a purely-mechanical change: it retunes data **and** adds two new firing mechanics plus several signature behaviors. It does not touch any voxel model / viewmodel geometry — behavior only.

## Decisions locked during brainstorming

- **Direction:** realistic WW2 feel (not arcade, not balance-only). Real references are the starting point; relative roles are then tidied so no gun is strictly dominant.
- **New mechanics in scope:** (A) recoil-buildup patterns, (B) bolt-cycle lockout.
- **Ammo policy:** **strict realism everywhere**, including a finite Luger reserve (no `Infinity`). Ammo management matters — pickups, weapon-swapping, and the melee fallback are the intended pressure-release valves.
- **All optional behaviors accepted:** bolt-cycle breaks scope, Garand en-bloc "ping" + forced full reload, per-shell incremental shotgun reload, light melee rebalance, **and melee friendly fire in co-op**.
- **Source research:** four parallel sub-agents gathered real specs (cartridge energy, cyclic RoF, capacities, reload styles, bolt-cycle times, effective ranges, combat ammo loads) for every firearm; their per-weapon recommendations are reconciled into the tables below. The ammo reserves below are pulled *down* to the strict end of real combat loads (tighter than the agents' "playable" suggestions, per the locked ammo policy).

## Scope

**In scope:** every entry in the `WEAPONS` registry (`weapons.js`):
- Melee: Bayonet Knife, Trench Axe, Machete, Meat Cleaver, Trench Shovel
- Pistols: Luger P08, Peacemaker (Colt SAA), .44 Magnum
- SMGs: Thompson, PPSh-41, MP 40, M3 Grease Gun
- Rifles: M1 Carbine, M1 Garand, StG 44, BAR M1918
- Snipers: Kar98k, Mosin-Nagant
- LMG: DP-28
- Shotguns: Trench Gun (M1897), Sawed-Off
- Launcher: Bazooka

**Out of scope (explicitly):**
- The mounted rooftop `.50-cal` (`MountedGun`) and the captured tank cannon — they carry their own balance and co-op ammo sync.
- Throwables / gadgets (grenades, molotov, flares) in `loot.js`.
- Tools (Flashlight, Binoculars) — no combat behavior.
- All voxel models / viewmodels — geometry is unchanged. (Bolt-cycle and en-bloc reload may add small *animation/audio* hooks, not new geometry.)

## Principles & ladders

Three clean ordering ladders the new numbers respect:

- **Per-hit damage:** SMG (16–22) < rifles (32–80) < magnum pistol (98) < bolt snipers (165–175). Shotguns are multi-pellet (close-range burst totals 117 / 192). Bazooka is splash-only.
- **Recoil scalar:** light autos (0.40–0.90) < M1 Carbine (0.55) < heavy pistols/rifles (1.5–2.2) < trench shotgun (1.7) < bolt snipers (2.7–2.8) < sawed-off (2.9). **Bazooka 0.6** (recoilless).
- **Effective range:** pistols 120–140 < SMGs 120–150 < rifles 240–340 < bolt snipers 500. Shotguns 30–55.

Damage intentionally does **not** track muzzle energy literally — SMG per-hit damage is suppressed and offset by RoF, so a 1000-rpm PPSh isn't broken. This inversion is deliberate game design.

## New mechanic A — Recoil-buildup patterns

**Why:** today recoil is a single scalar (`recoil`) applied per shot and damped back (`weapons.js:1016-1017`, damped in `update` `:1132-1134`). Sustained auto fire should progressively climb so long holds are punished and short bursts rewarded — and the *shape* of the climb should differ per gun.

**Approach (recommended — procedural, not authored spray patterns):**
- Add two optional per-weapon fields (defaults keep semis/melee unchanged):
  - `recoilClimb` — how fast the kick grows during a continuous burst (0 = no buildup).
  - `recoilYaw` — lateral bias of the climb (0 = pure vertical; higher = wide horizontal spray).
- Add a `_recoilStreak` accumulator on `WeaponSystem` that grows while the trigger is held and shots are landing, and decays when fire stops (reuse the existing `damp` plumbing).
- In `_fire`, scale the per-shot `recoilPitch` and `bloom` increment by `(1 + _recoilStreak * recoilClimb)`, and add a horizontal `recoilYaw * streak` component (a new `recoilYawKick`, damped like `recoilKick`).

**Per-gun intent:**
| gun | climb character |
|---|---|
| MP 40 | flattest — near-laser on sustained auto (pneumatic buffer) |
| Grease | gentle — slow RoF lets it settle between shots |
| StG 44 | mild — the controllable assault rifle, rewards bursts |
| PPSh-41 | moderate but **wide/lateral** (compensator → sprays out, not up) |
| Thompson | steep **vertical** climb — tap weapon |
| BAR | steepest — heavy open-bolt, demands short bursts |
| DP-28 | rising bloom on long bursts (suppressive walk) |

Semi-autos and bolt guns get `recoilClimb: 0` (no buildup; their per-shot kick stays as the scalar).

## New mechanic B — Bolt-cycle lockout (+ scope break)

**Why:** bolt-action snipers should *feel* like you work the bolt between shots, not just fire slowly.

**Approach:**
- Add a `boltCycle` field (seconds) to Kar98k and Mosin (generic: any weapon with `boltCycle > 0`).
- After firing, set `_boltLock = boltCycle`. The fire gate (`weapons.js:929`) blocks while `_boltLock > 0` (in addition to the normal `cooldown`). Decrement `_boltLock` in `update`.
- During the lockout: play a bolt-throw viewmodel motion + a bolt-cycle audio clack (procedural, via `audio.js`).
- **Scope break (accepted):** while `_boltLock > 0` on a scoped weapon, force out of ADS (`this.ads = false`) so the player must re-acquire the target for the next shot. ADS can be re-entered only after the bolt finishes.

**Values:** Kar98k `boltCycle: 1.2`, Mosin `boltCycle: 1.4` (the stiffer Mosin bolt is its trade-off for higher damage). These sit *under* the current rpm interval (50 rpm = 1.2 s, 42 rpm = 1.43 s) so the bolt lock is the binding constraint and rpm becomes redundant for these two.

## New behavior — Garand en-bloc "ping" + forced full reload

- The M1 Garand **cannot top off**: a reload always loads a full 8-round clip and discards any rounds left in the magazine (model the en-bloc clip). Reload is only meaningful when the mag isn't already full.
- On firing the **last** round, eject the clip with the iconic **"ping"** sound (procedural, `audio.js`) and lock the bolt open.
- Implementation: flag the weapon (`enBloc: true`); special-case `tryReload`/`_finishReload` so it sets the mag to a full clip rather than topping up from a partial, and consumes a whole clip's worth from reserve (no partial-round carry).

## New behavior — Per-shell incremental shotgun reload (Trench Gun)

- The Trench Gun (M1897) reloads **one shell at a time** into the tube; the reload is **interruptible** — the player can fire as soon as ≥1 shell is loaded, cancelling the rest.
- Implementation: flag (`shellReload: true`) + per-shell timing (e.g. ~0.45 s/shell). The `reload` field becomes per-shell time rather than a flat full-reload. A fire input during reload cancels it after the current shell seats.
- The **Sawed-Off** keeps a simple 2-shell break-action reload (not incremental) — only 2 shells, so per-shell adds nothing.

## New behavior — Melee friendly fire (co-op)

- In co-op, a melee swing whose arc connects with a **standing** teammate deals melee damage to them — mirroring the existing explosive **Full-FF** model (grenades/rockets already damage self + teammates, host-authoritative; see `_explodeHurt` / the `proj` path around `weapons.js:1216-1218`).
- Authority: the melee hit-test must also consider remote-player hitboxes; on a teammate hit, claim the damage to the host, which applies it to that player's `pstate` (never mutate remote hp locally). Solo play is unaffected.
- **Downed teammates are not melee-damageable** — aiming at a downed ally is the revive interaction (E + CPR clicks), not an attack. Melee FF only applies to upright teammates struck by an active swing.

## Per-weapon target values

Reserves are **strict** (low end of real combat loads), per the locked ammo policy. `—` = unchanged from current.

### Pistols
| weapon | dmg | rpm | mag | reserve | reload | recoil | range | spread/bloom | notes |
|---|---|---|---|---|---|---|---|---|---|
| Luger P08 | 28 | 300 | 8 | **32** (finite) | 1.8 | 0.7 | 120 | 0.010/0.012 | lightest, fast, flat |
| Peacemaker | 70 | 110 | 6 | 30 | 2.6 | 1.5 | 130 | 0.008/0.010 | slow single-action, deliberate |
| .44 Magnum | 98 | 95 | 6 | 24 | 2.4 | 2.2 | 140 | 0.009/0.014 | hand-cannon; high bloom → fast follow-ups scatter |

### SMGs
| weapon | dmg | rpm | mag | reserve | reload | recoil | range | climb |
|---|---|---|---|---|---|---|---|---|
| Thompson | 20 | 700 | 30 | 150 | 2.4 | 0.7 | 130 | steep vertical |
| PPSh-41 | 16 | 1000 | 71 | 142 | 3.2 | 0.45 | 150 | wide lateral |
| MP 40 | 18 | 500 | 32 | 160 | 2.0 | 0.40 | 150 | flattest |
| M3 Grease | 22 | 450 | 30 | 150 | 2.2 | 0.50 | 120 | gentle |

### Rifles
| weapon | dmg | rpm | mag | reserve | reload | recoil | range | notes |
|---|---|---|---|---|---|---|---|---|
| M1 Carbine | 32 | 400 | 15 | 90 | 1.7 | 0.55 | 240 | light, snappy, weak per-shot |
| M1 Garand | 80 | 270 | 8 | 64 | 2.6 | 1.6 | 340 | en-bloc forced reload + ping |
| StG 44 | 38 | 560 | 30 | 150 | 2.4 | 0.85 | 260 | most controllable auto (was wrongly below Carbine) |
| BAR M1918 | 52 | 500 | 20 | 120 | 3.0 | 1.6 | 300 | heavy open-bolt, steepest climb |

### Snipers / LMG / Shotguns / Launcher
| weapon | dmg | rpm | mag | reserve | reload | recoil | range | special |
|---|---|---|---|---|---|---|---|---|
| Kar98k | 165 | 50 | 5 | 35 | 2.4 | 2.7 | 500 | `boltCycle 1.2`, scope-break, spread 0.0015 |
| Mosin 91/30 | 175 | 42 | 5 | 30 | 2.8 | 2.8 | 500 | `boltCycle 1.4`, scope-break, adsFov 24, spread 0.0020 |
| DP-28 | 33 | 550 | 47 | 141 | 3.6 | 0.9 | 280 | suppressive, slow pan reload, bloom 0.020 |
| Trench Gun | 13 ×9 | 80 | 6 | 36 | per-shell ~0.45 | 1.7 | 55 | incremental interruptible reload |
| Sawed-Off | 16 ×12 | 200 | 2 | 18 | 1.6 | 2.9 | 30 | both-barrel nuke, brutal kick, spread 0.14 |
| Bazooka | splash 240 (r 7.5) | 24 | 1 | 5 | 4.0 | **0.6** | 250 | recoilless fix; already a traveling rocket |

### Melee (light rebalance)
The existing fast/weak → slow/heavy ladder is already sound — keep current values, verify in playtest, and add **co-op friendly fire** (above). Reference current values:
| weapon | dmg | rate (s) | range | knock |
|---|---|---|---|---|
| Bayonet Knife | 38 | 0.32 | 2.3 | 2 |
| Machete | 62 | 0.42 | 2.5 | 3 |
| Trench Axe | 95 | 0.50 | 2.4 | 5 |
| Meat Cleaver | 88 | 0.52 | 2.3 | 4 |
| Trench Shovel | 120 | 0.66 | 2.7 | 9 |

## Co-op considerations

- Stat changes are shared registry data — host and clients read identical `WEAPONS`, and damage stays host-authoritative via `claimPlayerHit` / enemy hit-claims. No double-apply risk.
- Recoil-buildup and bolt-cycle are **local-only** (local aim feel + local fire gate + local viewmodel/audio). No new authority.
- The only authoritative addition is **melee friendly fire**, which must route through the host (claim → apply to teammate `pstate`), gated on `hostSim = !mp.active || mp.isHost` like all damage.

## Non-goals / deliberate omissions

- No damage-falloff-over-range (player did not select it).
- No chambered-round (mag+1) mechanic.
- Scoped-rifle stripper-clip *blocking* (real PU/ZF scopes prevent clip loading) is ignored — full clip reloads kept for playability.
- StG44 "load to 25" spring quirk and oversized AA/drum magazine variants — skipped.
- BAR stays usable as fired (no semi/auto-only lockout debate — keep `auto: true`; recoil-buildup expresses the "burst it" discipline).

## Files likely touched

- `src/weapons.js` — `WEAPONS` registry values; `WeaponSystem` fire gate / `_fire` / `update` / reload for recoil-buildup, bolt-cycle, en-bloc, per-shell shotgun reload; bazooka recoil.
- `src/audio.js` — bolt-cycle clack, Garand en-bloc ping.
- `src/mp.js` — melee friendly-fire claim/apply path.
- `index.html` + `src/game.js` (`GAME_BUILD`) — cache-bust ritual at finish.

## Verification plan (manual / in-browser)

No automated tests exist. Validate via the `window.GAME` singleton and live play:
- Per-class spot-check: fire each weapon, confirm new dmg/rpm/recoil/reload/range feel and that the ladders hold (e.g. StG now out-damages Carbine; magnum follow-ups scatter).
- Recoil buildup: hold a long Thompson burst (climbs vertically) vs MP40 (stays flat) vs PPSh (sprays wide).
- Bolt-cycle: Kar98k/Mosin enforce the lockout and kick out of scope between shots; audio plays.
- Garand: last-round ping; reload can't top off a partial mag.
- Trench Gun: per-shell reload is interruptible by firing.
- Strict ammo: confirm finite Luger reserve and that reserves feel tight (run a few waves).
- Co-op (2 peers): melee a standing teammate → they take damage (host-authoritative); downed teammate is revived, not hit; stat changes identical on both ends.
