# Engendro Dismemberment + Plush Visual Overhaul — Design

**Date:** 2026-06-28 · **Branch:** `feat/engendro-dismemberment` (worktree `/Users/macmini1/eng-dismember`) · **Base:** PR #124 `feat/precise-hitboxes-bvh` (the precise round hitboxes the owner shipped for *world* geometry).

Owner brief (paraphrased): regular Engendros should be the **Tolo plush model minus the bullseye**, with **random lore colors / sizes / eye-combos / hair-tuft counts**. Shooting limbs off should be a real mechanic: **lose a leg → crawl slower with the face lifted**, lose an arm → minor, and on losing any limb a **small % chance to bleed** (reuse the existing `/effect` bleed). Animate them like floppy plush (loose small limb wobble). **Hitboxes must be MEGA precise & reliable.** Brutal, immersive gore (severed parts fall to the ground). Then *extra* optional ideas (e.g. shoot an eye → blind) on the side, **added first, removable later** via flags.

---

## 1. What the engine already gives us (reused, not reinvented)

| Need | Existing system | File |
|---|---|---|
| Ray↔capsule math (THREE-free) | `rayCapsule()` / `raySphere()` | `raycollide.js` (from #124) |
| Falling rigid piece + ground settle | `makeTumble()` + `stepBody()` | `destruct.js` |
| Pooled faller pattern (cap + linger + recycle) | `demobuilding._fallers` (cap 64) | `demobuilding.js` |
| Fluff burst | `effects.stuffing(pos,color,amount,power)` | `effects.js` |
| Ground height | `world.groundY(x,z)` | `world.js` |
| **Bleed status** (slow 0.6 + weaken 0.6 + пух drip) | `EFFECTS.bleed` + `movementSlow`/`contactWeaken` | `effects-status.js` |
| Status tick for enemies + `ctx.drip` | `_stepEffectsOnce` + `_fxCtx` | `game.js` |
| Co-op enemy sync | `espawn` / `esnap` / `edie` / `claimHit` | `mp.js` |

**Key seam:** enemy hit detection is `EnemyManager.rayHit` (a single coarse AABB per enemy) — **separate** from `world.rayHit`'s #124 capsule refine. So per-part precise enemy hitboxes are a *new* system inside `rayHit`, reusing `rayCapsule`. No risk to #124.

`enemies.rayHit` is consumed **only by weapons.js** (4 sites: hitscan 1600, APFSDS 1706, railgun 1923, mounted .50 2859) → safe to extend the return shape.

---

## 2. Architecture: part-rigged plush

`buildEngendro` returns ONE merged geometry shared per color. Dismemberment needs **separable parts**, so non-boss enemies switch to a **rig**: `e.mesh` becomes a `THREE.Group` (`root`) of pivots. **Boss Tolo is untouched** (keeps `buildTolo` single mesh + its phase system — owner said bosses are separate).

```
root (e.mesh)  — at feet, scale = e.scale × sizeJitter, faces heading
├ torsoPivot   — body blob + belly (NOT severable; severing = death)
├ headPivot    — head sphere + faceMesh (eyes/smile/hair)   [severable → death/headless]
├ armLPivot / armRPivot — capsule arm                        [severable]
├ legLPivot  / legRPivot — capsule leg                       [severable]
└ stump meshes (hidden) — torn-felt cap revealed at a socket on sever
```

New module **`engendro.js`** owns: part-geo cache (per color), face-geo cache (per face signature), rig build/dress/animate, per-part raycast, sever, and the global **gib pool**. `enemies.js` gets minimal hooks (spawn dress, rayHit, damage sever, animate call). Keeps the heavily-tuned `enemies.js` diff small.

### Materials
`voxelMaterial()` is vertex-colored → one material renders any baked color. Each enemy keeps **one** material `e.mat` (for burn/courier emissive) shared across all its parts. **Gibs** use a single shared vertex-colored material (geometry carries the color) → no per-gib material alloc. Fix: courier glow at `enemies.js:342` is the one unguarded `e.mesh.material` — route via `e.mat`.

### Randomization (per spawn, from a seed)
Deterministic `mulberry32(seed)` so co-op clients match (seed sent in `espawn`):
- **color**: pick from `ENGENDRO_COLORS` (8 lore hues). Part geos cached per color.
- **size**: root scale × `0.88..1.18` jitter (+ tiny per-part scale for lopsided plush).
- **eyes** (mirrors real Engendros, random combo): `twin` (two beads) · `cyclops` (one big button) · `bigSmall` (one med button + one small bead) · `triple` (three medium). 
- **hair**: 1–3 thread tufts, random lean.
- Face baked into a small `faceGeo(sig)` cached by signature (~12 combos) → no per-spawn geo alloc in steady state.

---

## 3. Hitboxes (the MEGA-precise requirement)

`rayHit(origin,dir,max)`:
1. Broadphase: per-enemy AABB cull (generous; encloses prone crawl pose).
2. Narrowphase: for each candidate, `updateWorldMatrix`, then test every **alive** part's capsule. Capsule endpoints are defined in **pivot-local** space and transformed by `pivot.matrixWorld` → the hitbox follows the *live* pose (crawl tilt, head-raise, wobble) 1:1. Radius scales by the pivot's world scale.
3. Return nearest-`t` part: `{enemy,dist,point,head,part}`. `head` = `part.kind==='head'` (keeps the existing ×2 headshot logic working). Boss falls back to the old single-AABB path.

Severed parts set `part.alive=false` → removed from the test (no phantom hits on a missing limb). This is also what makes dismemberment *identify which limb* was hit.

---

## 4. Dismemberment (KF2 dual-pool model)

Each severable part has **gore-HP** separate from body HP. A hit subtracts from **both** (KF2 rule). Part detaches when a hit ≥ remaining gore-HP. Caliber/`source` gates a min-damage-to-sever (knife can't decapitate; rifle/rocket can) — mirrors the tree caliber-fell gate.

**Gore-HP fractions of maxHp:** head ~0.45, arms ~0.28, legs ~0.40 (legs sturdiest, Fallout pattern). Tunable in the `DISMEMBER` config.

**Decapitation inequality (KF2):** head pops when `dmg > headGoreHP` **but** `dmg < bodyHP` (else it just dies first) — keeps it from feeling random. For plush: **head sever = death** (big fluff geyser + head gib) by default; *headless-wander* is an M6 extra.

**On sever** (`severPart`):
1. `part.alive=false`, `part.pivot.visible=false`; reveal the torn-felt **stump** at the socket (never a hollow hole).
2. Spawn a pooled **gib** = mesh with the severed part's cached geo + shared gib material, `makeTumble` impulse = (hit dir ×imp) + up + random spin (seeded), settles on `groundY`. Cap ~48, linger ~5 s, fade + recycle (drop oldest on overflow; perf escape under heavy AoE).
3. `effects.stuffing` fluff geyser at the socket + felt "thwip"/boing audio.
4. Gameplay consequence (§5) + bleed roll (§5).
5. Co-op: host broadcasts `elimbsever`.

**Death:** existing stuffing burst, **plus scatter all remaining limbs as gibs** (brutal plush explosion). Big overkill (≥2× body HP, e.g. rocket point-blank) → full gib instantly (Doom rule).

---

## 5. Gameplay consequences + bleed + wobble

Penalties ride the **existing** `movementSlow`/`contactWeaken` (already in the speed/contact formulas) via new `effects-status.js` entries (Infinity duration, cleared on pool respawn):

| Loss | Effect | Numbers (tunable) |
|---|---|---|
| one leg | `crippled` (limp) | speed ×0.55 |
| both legs | `legless` + `e.crawling` | speed ×0.3, **prone pose, face lifted**, still bites, low profile |
| one+ arm | `maimed` | contact dmg ×0.55 per arm; both arms → bite-only |
| any limb | **bleed** (proc ~25%) | reuse `EFFECTS.bleed`: slow 0.6 + weaken 0.6 + пух drip, 8 s, stacks→3 |

**Crawl** (research: RE2/Dead Space/Dying Light): on losing both legs, tip root forward (~prone), drop body to ground, **raise headPivot so the face looks forward** (the owner's "zvednutý obličej"), arms do a dragging reach cycle. Crawl-aware `e.height`/AABB so the cull box hugs the prone body and the precise capsules do the rest. Still damages on contact (needs the real attack reach, no magnet grab).

**Plush wobble** (always-on, ~free): each part pivot gets a small seeded sine offset (`amp ~4–8°`, `freq ~1–3 Hz`, random phase per enemy+part) → loose floppy "boneless" jiggle; legs/arms add a walk swing. On death/sever, a brief exaggerated flop.

---

## 6. Co-op (host-authoritative — the footgun)

All sever decisions + consequence + bleed roll gated behind `hostSim = !mp.active || mp.isHost`. Clients never sever locally off a ghost hit.
- **`espawn`** += `seed` → clients dress the rig identically (matching colors/eyes/hair/size).
- **`esnap`** += `lf` (limb-flags int) → late-joiners / re-sync see correct missing limbs.
- **`elimbsever`** one-shot `{id, part, dx,dy,dz, seed}` → immediate client gib replay (deterministic cosmetics from seed; no per-gib bandwidth).
- **`claimHit`** += part id so the host severs the limb the client actually shot.

---

## 7. Extra ideas (M6 — added behind flags, owner removes what they don't want)

Central `DISMEMBER` config object; each extra is one flag so a feature toggles cleanly (or a whole branch can be reverted).
1. **Eye-shot → blind** — destroy an eye sub-feature → enemy loses tracking, converges on last-known position with a shrinking search radius (Alien: Isolation model), lashes at nearby sound.
2. **Headless-wander** — instead of head-sever = death, a chance to keep shambling blind, flailing, bleeding out over ~6 s (KF2 headless).
3. **Jaw-shot → no bite** — face lower-hit disables the contact attack (mobile but harmless = creepy).
4. **Enraged crawler** — small chance a de-legged crawler enrages and becomes *fast* (KF crawler).
5. **Gore intensity setting** (Off / Light / Full) — also the **perf escape hatch**: Light skips gib meshes (fluff-burst + hide only); Off disables dismemberment. L4D2 pattern.
6. **Stuffing-cam** — brief hit-stop/zoom on a clean decapitation (hook the existing juice sprint), on a cooldown.

---

## 8. Risks / pitfalls designed out (from research)

- Spawn gib at the part's **live world transform**, not rest pose (else floating/teleporting limbs). Clamp above `groundY` (would-bury guard, same class as the tree-fall lesson).
- **One part per hit** (nearest-`t`); AoE applies once per part (track a per-blast hit set) → no double-count.
- **Reset all gore state on pool spawn** (parts visible, gore-HP refilled, flags/effects cleared, stumps hidden) → no "headless on spawn".
- Re-shooting a stump must not re-gib (guard on `part.alive`).
- Gib **cap + lifetime + FIFO recycle** → no draw-call creep.
- Co-op: order/ignore stale `elimbsever`; never sever on client; carry `lf` in full-world sync.
