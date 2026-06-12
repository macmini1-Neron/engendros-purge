# Forest Prop Destruction — Design

- **Date:** 2026-06-12
- **Status:** design / spec (pre-plan) — approved in brainstorm session
- **Branch:** `feat/prop-destruction`
- **Owner intent:** the forest deadwood + rocks shipped static (PR #50). Make them react like the
  trees already do — wood burns and shoots apart, rock shrugs off bullets and only yields to HE/AP —
  **material-driven, no per-object special-casing**, consistent with the destruction-overhaul program.

## 0. Where this sits in the destruction program

This is a **focused extension of Pillar 1 (Vegetation)** of the Environmental Destruction Overhaul
(`docs/superpowers/specs/2026-06-10-destruction-overhaul-design.md`, currently on
`feat/destructlab` / `docs/destruction-overhaul-design`, not yet merged). That program classified
standing **trees** (crush classes, hinge-fall) but never classified ground **deadwood** or **rocks**.
This spec fills exactly that gap for the 10 props shipped by PR #50.

It is **not** a new system. The destruction **core already ships on `main`** (`src/destruct.js`:
`MATERIALS`, `resolveHit/Blast/Penetration`, `DebrisPool`, the `DestructRuntime` pipeline) and the
trees already have a live wired damage path in `src/forest.js`. This spec reuses both.

Key decisions are taken from the overhaul's **§2.6 (mixed-fidelity destruction)**, which the owner
confirmed is the agreed direction:

- **Fidelity tiers** F0 cosmetic / **F1 chunk-breach (default workhorse)** / F2 bespoke-hero (short whitelist).
- **Behavior is driven by `dmat`** — wood splinters, glass shatters, masonry crumbles — *no per-object
  special-casing*.
- **Cosmetic-vs-authoritative split** — gameplay truth (a part is gone / an opening is passable) is
  host-synced; the flourish (splinters, dust, char) free-runs client-side and is never sent.

## 1. Scope

**In:** material-driven destruction of the **10 forest props** from PR #50
(`rock_boulder_lg`, `rock_boulder_mossy`, `rock_cluster_sm`, `rock_outcrop`, `log_fallen`, `log_pile`,
`log_split`, `stump_cut`, `stump_shattered`, `debris_treetangle`), reacting to **all four damage
paths** the trees already use: **fire**, **small-arms**, **HE blast**, **APFSDS penetration** — at
**fidelity F1** (no bespoke F2), **co-op-safe**, on `?map=demo`.

**Out (explicit):**
- **Tank crush** (`applyCrush`) — waits for the drivable T-62 (overhaul Pillar 4).
- **F2 bespoke hero break-states** per prop — deadwood/rock is background dressing, not a hero object.
- **Terrain craters** under HE — belongs to the future terrain engine (overhaul §10).
- **Cross-run persistence** — destruction resets per run, same as trees / fortifications.
- **Re-touching the tree path** — trees keep their existing `forest.js` methods unchanged.

## 2. Owner-approved decisions

These four were flagged in the brainstorm as choices the overhaul spec did not cover for props;
the owner approved them (and asked to feel-tune balance later):

1. **Fidelity = F1 for every prop, no F2.** Spend the fidelity budget where the player's eyes and
   hands go (windows, doors, the radio); deadwood and rocks inherit the cheap generic tier. This
   holds the quality floor without per-prop hand-authoring.
2. **Lying/low props do not topple — they "shatter/consume in place."** The `hinge` `FallingBody` is
   for *standing* trunks. A log on the ground, a stump, a rock just **obliterate**: collider removed,
   a generic-material debris burst, and (for wood) optionally a few short-lived `tumble` chunks under
   HE. **No new `FallingBody` per prop** — the 8-body budget stays reserved for trees.
3. **New material `stone`** (the registry has no rock): `{ tier: 4, hp: 600, debris: 'rubble',
   sound: 'masonry', fuel: 0 }`. Rock realistically ignores bullets (`pen < 4` ⇒ cosmetic chip) and
   only yields to HE / APFSDS. (Owner may retune tier 4↔3 during feel-tuning.)
4. **Co-op:** host-authoritative; the **only** synced gameplay truth is "this prop's part is dead /
   its collider is removed" (mirrors the trees' `forestfx`). Splinters, char glow, dust, debris
   tumble are **client-local cosmetic**, never sent. All authoritative logic behind
   `hostSim = !mp.active || mp.isHost`.

## 3. Per-prop behavior (all derived from `dmat`, no special-casing)

| Prop(s) | `dmat` | tier | fuel | Fire | Small-arms (`pen≥tier`) | HE blast | APFSDS |
|---|---|---|---|---|---|---|---|
| `log_fallen`, `log_split`, `stump_cut`, `stump_shattered` | `trunk` | 2 | 10 | ignites → chars → consumed | 12.7 mm+ splinters it apart | removed in `r1` | obliterated (fragile) |
| `log_pile` | `wood` | 1 | 6 | ignites fast | any rifle/shotgun breaks it | removed | obliterated |
| `debris_treetangle` | `grass`* | 0 | 2 | ignites fastest, spreads | any hit clears it | removed | obliterated |
| `rock_boulder_lg`, `rock_boulder_mossy`, `rock_cluster_sm`, `rock_outcrop` | **`stone`** | 4 | 0 | never ignites | cosmetic chip decal only | survives the default bazooka (`blast.tier 3 < 4`); **crumbles → rubble only under a tier‑≥4 blast** — see §4.3/§9 | through‑hole + spall (stays; not removed) |

\* `debris_treetangle` is a tangle of dead twigs — gameplay-light, very flammable; `grass` (tier 0,
fuel 2) models "clears trivially + burns first" better than `wood`. (Tunable.)

Rationale: this is the **material mix** §2.6 asks for — wood and rock behave per their real nature
off one data field, so the common path is data-driven with zero per-object branching.

## 4. Architecture

### 4.1 Props become the first consumer of `DestructRuntime`

The core's `DestructRuntime` (apply pipeline over a parts collection, `src/destruct.js` §4) is
**pure, tested, and shipped but not yet wired** into gameplay. Props wire it for the first time:

```
Forest._ensureProps()  →  for each placed prop, register a destructible part + collision box
Forest._propRuntime = new DestructRuntime({ parts: <prop parts>, emit, debris: this.debris })
```

This is deliberate: props are a small, safe first consumer that **validates the core pipeline** the
overhaul wants for the later building/vegetation migration — without touching the trees' bespoke path.

### 4.2 Part + collider registration (mirrors `_registerTree`)

In `Forest._ensureProps()`, each placed prop additionally registers:

- a **destructible part** via `makePart(id, dmat, min, max, hpScale)` → pushed to `this._propParts`
  (and into the `DestructRuntime`);
- a **world collision box** `{ min, max, dpart, dmat, downer: <propRecord>, prop: true }` pushed to
  `world.boxes` + `grid.addBox` — so a bullet ray resolves to it and (for tall props) the player
  bumps it. **Every** prop now gets a box (not just the two "solid" ones), so all props are shootable.
  Low logs/stumps should read as ground clutter, not walls — confirm against the player's step-up
  height in the plan; if a knee-high box still blocks, register low props with a **hit-only** box
  (raycast yes, player-collision no) rather than a full collider.

The AABB comes from the prop's `userData.footprint` (already produced by `buildSpec`), scaled by the
per-instance jitter — same source the current collision box uses.

### 4.3 Damage paths — extend the existing hooks to also feed the prop runtime

Each path the trees already use gains a one-line prop branch alongside the tree branch:

| Path | Today (trees) | Add (props) |
|---|---|---|
| **Small-arms** (`weapons.js` per-shot) | ray hits a `box.tree` → damage → `forest.fellTree` | ray hits a `box.prop` → `forest.hitProp(box, weaponDef)` → `_propRuntime.applyHit` |
| **HE blast** (`weapons.js`) | `forest.blast(pos, r)` over `this.trees` | same call also runs `_propRuntime.applyBlast(pos, r, ammoDef)` |
| **APFSDS** (`weapons.js`) | `forest.penetrate(o, dir, range, w)` over `this.trees` | same call also runs `_propRuntime.applyPenetration(o, dir, w)` |
| **Fire** (`fire.js`) | `forest.flammableParts()` → ignite → `charTree`/`fellTree` | `flammableParts()` now also returns wood prop parts; burnout consumes the prop (remove collider + debris), **never `fellTree`** |

The `resolve*` rules in `destruct.js` already encode the material matrix (pen<tier ⇒ cosmetic; HE
kills tier≤blastTier; APFSDS obliterates fragile tier≤2 and holes structural tier≥3). `stone` at
tier 4 falls out correctly: bullets cosmetic, HE `heRocket.blast.tier:3` does **not** remove it
(needs a stronger blast), APFSDS holes/craters it. (If the owner wants the bazooka to crack rock,
bump `heRocket.blast.tier` or drop `stone` to tier 3 during feel-tuning — a one-number change.)

### 4.4 Destruction effect — "consume in place"

`DestructRuntime._kill(part, at)` already bursts material debris (`splints`/`rubble`) via the shared
`DebrisPool` and emits a `destroy` event. The prop's `emit` handler:

1. removes the prop's collision box (`world.boxes` splice + `grid.removeBox` — the standard gotcha);
2. hides the prop mesh (the cloned `Object3D` → `visible = false`, or a small charred/rubble swap mesh
   for wood/stone respectively);
3. **cosmetic only, client-local:** the debris burst, a dust puff, and — for HE on a boulder —
   optionally 1–3 `makeTumble` rock chunks (sharing the trees' `_falling` budget, capped).

No hinge, no per-prop physics body in the common case.

### 4.5 Fire integration

`Forest.flammableParts()` already returns `this.parts.filter(p => !p.dead && MATERIALS[p.dmat].fuel>0)`.
Adding wood prop parts to that collection makes `fire.js` ignite and spread to them **for free**
(tree → deadwood → tree fire spread, which is the big atmospheric payoff). The only new code: the
**burnout path** must branch on owner type — a prop owner is consumed (collider removed + char/ash
mesh), it is **not** passed to `fellTree` (that assumes a standing-tree record). A `forest.consumeProp(rec)`
mirrors the existing `consumeGrass(rec)`.

## 5. Co-op & persistence

- **Host-authoritative**, mirroring the trees' `forestfx` channel. The host runs the prop runtime;
  clients never resolve prop damage locally. On a prop kill the host broadcasts one
  `propfx { id, kind: 'destroy', seed }` (or folds into the existing `forestfx` envelope); clients
  replay: hide mesh, remove collider, play the local cosmetic burst.
- **Cosmetic is never sent** (§2.6): splinters, dust, char glow, tumble chunks free-run per client.
  The seed is only for any gameplay-relevant variation (there is essentially none here — a removed
  log either is or isn't cover; pick a deterministic remove).
- **Late join:** the host's prop snapshot is the list of dead prop ids (a few bytes each), bounded by
  the prop count cap; the joiner hides those + removes their colliders. (Extends `netSnapshot()`.)
- **Persistence:** resets per run, exactly like trees and fortifications. No cross-run scarring.
- All authoritative prop logic sits behind `hostSim = !mp.active || mp.isHost`.

## 6. Performance

- No new per-frame cost when nothing is destroyed (the runtime only runs on a damage event).
- Debris reuses the existing shared `DebrisPool` (one instanced draw call) — no new pool.
- Prop colliders: ~60 boxes added to `world.boxes`/grid at build time (the grid is O(1) per query);
  this is the same order as a building's furniture and well within budget.
- `tumble` rock chunks under HE share the trees' `_falling` array and the overhaul's ≤8-body cap.
- Acceptance: shooting/burning/blasting a dense prop cluster holds the demo's frame budget
  (verify with `DEMO.perf` / in-game, the PR #50 method); 0 console errors; whole node suite green.

## 7. Testing

- **Pure/node-testable additions** go in `tests/destruct/` (the core is already node-tested): the
  `stone` material entry + any new pure helper (e.g. a prop-material classifier) get unit tests; the
  existing `resolve*` tests already cover tier-4 cosmetic/HE/AP behavior, so `stone` is largely
  validated by adding it to the matrix fixtures.
- **In-browser verify** (props + `forest.js` are THREE-bound, not node-tested): on `?map=demo`, drive
  the console to (a) ignite a wood prop and confirm it chars→consumes + spreads, (b) shoot a log apart,
  (c) HE a rock cluster → rubble, (d) confirm bullets only chip a boulder. Same Playwright + `GAME`
  introspection method PR #50 used. Confirm collider removal (player no longer bumps a destroyed boulder).

## 8. Build order (single implementation plan)

1. Add `stone` to `MATERIALS` (+ matrix test).
2. `Forest._ensureProps`: register each prop's destructible part + world collision box (all props),
   build the `_propRuntime` (`DestructRuntime` over the prop parts, shared `DebrisPool`, an `emit`
   handler that removes collider + hides mesh + plays cosmetic burst).
3. Map each prop id → `dmat` (the §3 table).
4. Wire the four damage paths to the prop runtime (`weapons.js` per-shot prop branch + blast +
   penetrate; `fire.js` flammable prop parts + `consumeProp` burnout).
5. Co-op: host-auth gate + `propfx`/`forestfx` broadcast + client replay + `netSnapshot` extension.
6. In-browser verify (all four paths) + cache-bust + PR.

## 9. Open feel-tuning knobs (deferred, per owner: "doděláme podle pocitu")

`stone` tier (4↔3) · whether the bazooka cracks rock · wood `hpScale` per prop (how many rifle rounds
to split a log) · debris burst sizes · whether `debris_treetangle` is `grass` vs `wood` · rock-chunk
`tumble` count under HE. All are one-number changes; none affect the architecture.
