# Tree System — Bug Triage & Root-Cause Spec (test-tree session)

**Date:** 2026-06-24
**Branch:** `feat/tree-system-redesign` (worktree `.claude/worktrees/tree-splinter`, based on PR #117 `feat/forest-tree-physics-2`).
**How verified:** Owner played `?map=forest` with the dev `/testtree` tool — a single isolated test tree, each part rendered a distinct **flat unlit debug color** (`MeshBasicMaterial`, no wood texture) so individual pieces are unambiguous. Reset is manual on **R** (`spawnTestTree` re-spawn). This spec captures the owner's hands-on bug report (12 screenshots) plus root causes.

> This is a **bug-triage spec**, not yet a redesign plan. Goal: pin every defect to a root cause so the subsequent felling-system redesign fixes them at the source instead of patching symptoms. Owner's words: *"poradne se nad tím zamysli, najdi root cause a napiš na to spec."*

---

## 1. Confirmed-GOOD behaviors (do NOT regress these)

These were explicitly confirmed working by the owner — the redesign must preserve them:

- **G1** — Standing tree stands and sways in the wind, no glitch. *(img #10)*
- **G2** — Tree breaks **where it is shot** (break height follows the impact). *(img #11)*
- **G3** — Shooting the **base / lower trunk while still part of the tree** correctly fells **only the part above** that point; the stump stays. *(reported OK)*
- **G4** — A felled tree lying on the ground is **nicely cut into chunks**. *(img #12, #13)*
- **G5** — In at least one case the crown **tore off and fell independently of the trunk** — exactly the desired clean break. *(img #14)*
- **G-REF (the target)** — img #10/#14: a top falls cleanly off the stump with **NO middle piece** between them. This is the canonical "correct break" reference for everything below.

### Accepted minor (no action)
- **M1** — Branch hitboxes are computed as the whole crown rather than per-branch. Owner: *"to asi nevadí úplně."* Leave as-is for now.

---

## 2. BUGS (grouped by theme)

Severity: 🔴 critical (breaks the illusion / owner flagged as worst) · 🟠 important · 🟡 polish.

> ### ⛔ INVESTIGATOR THEORY WAS WRONG — corrected by reading the code + live repro (2026-06-24)
> The three read-only investigators converged on an "empty geometry bins → zero-volume phantom segment" theory. **It is false.** `binFallenGeometry` only ever creates a bin via `ensure(i)` when a triangle lands in it, and `if (bb)` already filters nulls — it never returns empty bins. And the owner can SHOOT the floating chunks, which disproves "zero-volume, can't be hit." Lesson: verify the hypothesis against the code before fixing (systematic-debugging Phase 1–3). The real causes, confirmed by live Playwright repro:
>
> ### ⭐ REAL ROOT CAUSE (Themes A + B + D) — the PROPPED resting state
> A felled top is a single rigid hinged rod. `_resolveFlatFall` (`forestdemo.js`) kept it **propped** (butt/chunks elevated, not laid flat) whenever `_flatWouldBury` was true — which fires for **wide-bough species (oak/pine = the owner's test trees)** because laying a ~4 m crown ball flat would drive boughs underground. Live repro: a class-3 oak settled with 6 of 7 chunks floating **up to 18 m in the air** (that's the "floating chunks" #A and the "hangs on the trunk" #D). The endlessly-"spinning mezidíl" #B was a chunk of such a propped log that, on being shot, left airborne neighbours.
>
> ### ⭐ THE FIX (shipped) — "drape" each chunk on the terrain (the no-compromise §3 answer)
> 1. **Always lay flat on open ground** — removed the `_flatWouldBury` veto and the seeded prop-roll (`_flatFalls`); only a top genuinely hung up on a building/neighbour (`_groundSettled` false) stays propped.
> 2. **`_groundChunks(log)`** — after the log settles, reparent EACH wood chunk to the scene (like `_killSeg`) and shift it so its lowest collision box rests on the terrain under it (up if buried, down if floating). The pass-through leaf crown drops with the pivot. Grid is XZ-only → no re-bucket. Deterministic (terrain + seeded fall) → co-op-safe.
> 3. Result (verified): all 7 oak chunks rest at terrain ±0.1 m, `allGrounded=true` — nothing floats, nothing buried. Breaking a middle chunk now kills only that chunk (no orphan-float, because every chunk is grounded).

### Theme A — Floating chunks have no gravity 🔴
- **A1** *(img #16, #18, #21)* — Fallen log **chunks hover in mid-air and never fall**. Gravity simply does not apply to them — *"jsou prostě nějak odstřižené."* They **can still be shot down one by one** (weapon hitbox works on them), but they never settle to the ground on their own.
- **A2** *(img #18)* — A tree part that is **not attached to anything and not resting on any surface** still floats. Owner: *"tohle nemůže být možné, musí tam fungovat gravitace když ta část není k ničemu dána nebo se o nic neopírá."*

**Root cause — CONFIRMED (convergent, Investigators 1 & 2):** the ⭐ SHARED ROOT CAUSE above. The floating segment is a zero-volume phantom (`part = [0,0,0]`): no collider, no physics integration, so it hangs in the scene hierarchy. `regroundLog` then drives that zero part underground (`forestdemo.js:426-433`), worsening the disconnect between visible mesh and (nonexistent) collision.

**Fix direction:** the shared fix — filter empty bins (`destruct.js:526`) + mesh-AABB fallback for `part.min/max` (`forestdemo.js:401-404`). Then add the safety net: any segment that loses support must always be on a gravity+settle path.

---

### Theme B — Endlessly-spinning leftover "middle" chunk 🔴 (owner: biggest problem)
- **B1** *(img #17)* — After shooting into the tree, a leftover chunk appears that **starts rotating/tumbling as if it inherited the physics of a large piece, but never stops on the ground or any object — it spins forever.**
- **B2** *(img #17, #20)* — Owner does **not want this "mezidíl" (middle piece) to exist at all.** The break must be clean: **stump + falling top only**, like the reference img #10 (blue top off green stump, no middle).

**Root cause — CONFIRMED (Investigators 1 & 2): same ⭐ SHARED bug.** The spinning "mezidíl" IS a zero-volume phantom segment. Because its part is `[0,0,0]` it can never be hit → `_killSeg()` never fires → it is never reparented/sunk → it stays a child of the falling pivot group and tumbles with the pivot's quaternion (`forestdemo.js:855`).
- ⚠️ The "spins **forever**" part assumes the hinge pivot never fully settles — that is almost certainly **Theme D** (hinge leans on the stump and oscillates), so D's fix likely stops the perpetual spin too.
- ⚠️ Secondary candidate for a leftover middle (lower confidence): orphaned stump meshes from prior re-snaps not removed from the `stumps` list (`forestdemo.js:261/273`) + straddle-triangle artifacts in `splitGeomAtY` (`destruct.js:449`). Verify visually before acting.

**Fix direction:** the shared empty-bin fix removes the phantom entirely. Additionally: guarantee every segment has a settle/sink path even if never shot, and clean orphaned stump meshes on re-snap.

---

### Theme C — Some chunks are inert (no hitbox / no damage reaction) 🔴
- **C1** *(img #15)* — Some sections of a felled tree **never react to anything: molotov, grenade, explosion, APFSDS — nothing** — while other sections of the **same** tree (the top) react fine. Owner: *"je potřeba aby to mělo hitbox nebo prostě aby reagoval každý díl stejně."* **Every chunk must react identically** to bullets AND explosions.

**Root cause — CONFIRMED (Investigator 2): same ⭐ SHARED bug.** Inert chunks ARE the phantom segments. With no `box.seg` collider, **bullets** can't hit them (`weapons.js:1676`); and **explosions** compute blast distance from `seg.part.min/max` = `[0,0,0]`, i.e. against the world origin instead of the chunk's real position (`forestdemo.js:600`), so AoE never reaches them. The chunks that DO react are the ones that happened to get non-empty geometry.

**Fix direction:** identical to the shared fix — once no zero-volume segment can exist, every chunk has a real `box.seg` collider AND real bounds, so bullets and explosions both route correctly. This delivers the §3 goal of **one unified collision/damage contract per chunk**.

---

### Theme D — Falling top hangs / sways on the trunk 🟠
- **D1** *(reported)* — When shooting the **upper** part, the top **sways strangely and stays hanging on the trunk** instead of cleanly detaching and falling. We only want the crown above the cut to fall (per G-REF).

**Root cause — STRONG HYPOTHESIS (Investigator 3), confirm visually.** The hinge pivot sits at the cut point `[rec.x, y0+breakY, rec.z]` (`forestdemo.js:280`), right where the new stump geometry begins. `_fallObstacles` tries to exclude stump boxes via `if (b.downer === rec) continue;` (`forestdemo.js:306`), but the rotating hinge rod still contacts stump boxes (`hingeContact`, `destruct.js:353-361`) and settles **leaning against the stump** instead of rotating down to the ground, then oscillates around that contact (settle threshold `SETTLE_AV`, `destruct.js:289`) → "hangs and sways." (Likely also the reason the Theme-B phantom never stops spinning.)

**Fix direction:** exclude the stump's immediate pivot column from the falling top's obstacle set, and/or prioritize ground contact over obstacle contact when choosing the hinge's settle angle, so the top always lays flat.

---

### Theme E — Whole tree rotates when repeatedly shot 🟠
- **E1** *(img #19)* — Spraying bullets into a standing tree makes **the whole tree rotate** weirdly, instead of just breaking at the hit point. Owner: *"celý strom se protáčí takhle debilně."*

**Root cause — NOT CONFIRMED (Investigator 3 could only hypothesize) — needs a deliberate repro before any fix.** Candidate: on re-snap a stale FALLING/pivot entry for the same `rec`, and/or unbalanced split geometry, makes the new hinge apply rotation to a body that still references the whole tree (`forestdemo.js:235-250, 286`). ⚠️ Low confidence. Per systematic-debugging, **do NOT fix on this hypothesis.** First repro: spray a standing tree, log which transform/quaternion actually rotates each frame.

**Fix direction (provisional, pending repro):** ensure any prior FALLING/pivot entry for a `rec` is fully settled & detached before a re-snap begins; confirm `splitGeomAtY` produces balanced pieces.

---

### Theme F — Grenades must not ignite trees 🟡
- **F1** — Grenades should **only explode, never set trees on fire.** (Molotov may ignite; a generic grenade/AoE explosion must not.)

**Root cause — CONFIRMED (Investigator 3).** At detonation only molotov branches to a fire-pool; everything else calls `game.explode()` (`weapons.js:2052`) with `isRocket: !!g.rocket`. In `game.js:986` **both** rockets and grenades then call `fire.igniteAt()` (only the radius differs) — there is no guard excluding grenades, so **grenades currently ignite trees.** A plain grenade is identifiable as `!g.molotov && !g.rocket`.

**Fix direction:** gate the `fire.igniteAt()` call on `isRocket` (or pass an explicit `noIgnite` option that grenades set), so a plain grenade only explodes.

---

## 3. The core tension to resolve (architecture)
*(img #20)* The owner sees a conflict between two systems:
- **Felling model:** only the part above the cut falls as ONE piece (stump + clean top, no middle) — the G-REF behavior.
- **Sectional destruction:** the fallen log breaks into **small chunks** when shot.

These currently fight each other (producing floating/spinning leftovers and the unwanted middle piece). Owner wants a **smart reconciliation, not a compromise**: *"narazíme na vlastní logiku toho kácení + toho že to má být na malé kousky — nějak vymsli řešení chytře, abychom nemuseli dělat kompromisy."*

**Design intent (to validate in the redesign):** one unified body model where (a) felling produces a single falling top that always lands and settles, (b) any chunk that loses support always gets gravity + a ground-settle path, (c) every chunk shares one collision/damage contract (bullets + explosions), and (d) no segment is ever created without both a settle path and a hitbox.

---

## 4. Next steps
1. ✅ Root causes filled (§2), from three read-only investigators (file:line). Confidence labelled per finding.
2. **Repro Theme E** (whole-tree rotate) before designing its fix — it's the only unconfirmed root cause; log which transform rotates when spraying a standing tree.
3. Brainstorm the unified felling+chunk model that resolves §3 without compromise. The ⭐ shared empty-bin fix is the spine: no segment may exist without a real volume → collider → settle path → AoE position. Layer on D (hinge-vs-stump), E (after repro), F (grenade no-ignite).
4. Write the redesign plan (subagent-driven), implement on this branch, verify each fix **visually** via Playwright on `?map=forest` with the `/testtree` debug colors (owner co-tests + sends photos).
5. Cache-bust + PR.

## 5. RESOLUTION (2026-06-24) — all shipped + live-verified via Playwright
> Per-theme root-cause text in §2 reflects the original investigator pass and is **superseded** by the corrected callout at the top of §2. Final status:

| Theme | Real root cause | Fix (in `feat/tree-system-redesign`) | Verified |
|---|---|---|---|
| A floating | propped state elevated chunks up to 18 m | always lay flat + `_groundChunks` per-chunk drape | ✅ all chunks at terrain ±0.1 m |
| B spinning leftover | airborne chunk of a propped log | every chunk grounded → no orphan-float on break | ✅ mid-chunk break kills only that chunk |
| C inert chunks | (could not reproduce as described — likely the elevated/propped chunks reading as unreactive; revisit if it recurs after A fix) | — | ⏳ owner to re-check |
| D hangs/sways | propped lean on the stump | same as A (no propped on open ground) | ✅ lies flat |
| E whole-tree rotate | spray spawned a NEW falling top per hit (6+ at once) | one active fall per tree until its top lands (`fellTree` guard) | ✅ spray → 1 top, resumes after landing |
| F grenade ignites | `game.js:986` ignited for every blast | gate `fire.igniteAt` on `isRocket` | ✅ grenade = blast only (rocket still ignites) |

**Open follow-ups:** C (re-check after A); a felled wide crown leaves one side-bough angled up from its grounded base (natural, owner to confirm acceptable); rocket/HE still ignites trees (owner's call whether to also disable).

## Dev tool reference (`/testtree`)
- `/testtree [species] [scale]` — clears any prior test tree, spawns ONE at (8, 20), each part a distinct flat unlit debug color.
- **R** — manual reset (re-spawn) while test mode is active (`game.forest._testActive`), else normal reload.
- Implemented in `src/forestdemo.js` (`spawnTestTree`, `_dbgMat`), `src/console.js` (`/testtree`), `src/game.js` (R binding).
