# Tree System — Complete Rewrite, Design Spec

**Date:** 2026-06-25
**Branch:** `feat/tree-system-redesign` (worktree `.claude/worktrees/tree-splinter`, based on PR #117).
**Source:** distilled from the lifecycle interview (`2026-06-25-tree-lifecycle-rewrite-interview.md`, Phases 0–6) + the bug-triage spec (`2026-06-24-tree-system-bug-triage.md`). Supersedes the stopgap fixes (commit 22104e10).
**Verification:** every step verified in-browser via the `/testtree` colored harness on `?map=forest` (per-part flat debug colors, R-reset). No blind tuning.

---

## 1. Goal

One **unified, ground-up tree model** so that felling, sectional destruction, shoot-through holes, the precise hitbox, cover, and fire all fall out of the *same* representation — no separate, conflicting systems (the conflict that caused the float/stuck/spin bugs). A tree is destructible and behaves believably through its whole life: standing → carved → felled → fallen log → stump → burnt → uprooted.

## 2. Core model — the "voxel-cylinder" trunk

A trunk (and every stump/remaining piece — they're the same thing) is a stack of **height bands**; each band holds a **ring of angular sectors** × a few **radial rings** (outer → core). Each cell = wood with HP.

```
band[h]:   ring of sectors θ (≈6–8 around)  ×  radial rings r (≈2–3: bark→core)
cell(h,θ,r): { hp, alive }
```

- **Collision / line-of-sight / hitbox are DERIVED from the live cells.** Remove cells → a real hole: bullets, sight, and enemies pass through it. The carved shape *is* the hitbox (subsumes PR #124's capsule goal).
- The crown **leaves** are a separate pass-through foliage volume (existing enterable-foliage; bullets pass, you wade in).
- **Tuning (live):** band height, #sectors, #rings, sever threshold, per-caliber penetration depth, per-species/thickness HP. All start as named constants, tuned in-browser.

## 3. ★ INVARIANTS (the rules that must NEVER break — these are what got us stuck before)

- **INV-1 — Nothing stays stuck; support-based detachment.** A standing trunk is held up only by a *connected path of live cells down to the rooted base*. The moment any piece loses that support it **detaches and falls** — whether it's the whole top above a sever OR a single small chunk shot off the side of the standing remainder. It then **settles on the ground**. No piece ever remains embedded/caught in the trunk. *(Owner's explicit #1 requirement: "když ustřelím kousek ze stojící části, musí odpadnout a spadnout, ne zůstat zaseknutý v kmeni.")*
- **INV-2 — Nothing floats.** Every detached/settled piece rests ON the terrain (or on a real obstacle it leans against). No piece hovers. (Per-chunk drape from the stopgap.)
- **INV-3 — Physics scales to piece size.**
  - Large severed top → **directional hinge fall** (`makeHinge`) toward the notch, swept impact along its arc.
  - Small detached chunk → **tumble/drop** (`makeTumble`, already in `destruct.js`) straight down, short tumble, rests on ground. *Never* run the big-top hinge on a small piece (that's the current bug — a small re-snap tried to hinge, couldn't reach the ground, stayed stuck).
- **INV-4 — Carved damage is permanent & authoritative.** No regrow. Collision always matches the current live cells.
- **INV-5 — Co-op determinism.** Every state change is host-authoritative (`hostSim = !mp.active || mp.isHost`) or seeded-deterministic; clients mirror via event+seed. Late joiners reconstruct from a host sync with the same deterministic apply. `pstate` is life-state truth for tree-fall damage.

Support test = an **orphan flood** over live cells (like the existing `orphanedCells`): flood "supported" out from the rooted base through connected live cells; any live cell with no path back = orphaned → its connected group detaches as one piece and falls (hinge if large, tumble if small).

## 4. Lifecycle behavior (the design, by phase)

### Phase 0 — Standing tree
- Bullets remove cells at the hit (h,θ), from the **outer ring inward up to the caliber's penetration depth**. Splinters fly; the notch/hole persists.
- **Caliber × thickness:** small arms reach only outer rings → can carve a surface notch but can't sever a thick trunk's core; thick trunks need MG / sustained rifle / HE / APFSDS. Thin/young trees fall to pistols.
- A **band severs** when its remaining cells drop below the sever threshold → everything above it loses support (INV-1) and falls **toward the centroid of removed material** (directional notch felling) (INV-3 hinge).
- Standing tree sways in wind (existing); a deeply-notched tree may creak/lean as juice (optional).

### Phase 1 — Felling moment
- Severed top falls via hinge toward the notch. **Weight-scaled:** big = slow/majestic + camera shake + dust + heavy thud + flattens foliage beneath; small = fast/light.
- **Swept impact along the whole fall arc** (not just landing spot):
  - vs **person** (player or enemy): trunk of a big tree = instant death/huge dmg; branches/crown = big survivable dmg + knockdown; small tree = knockback+dmg. Enemies included → felling onto the horde is a tactic. (Player dmg routes via `pstate`.)
  - vs **building**: breaks weaker-than-wood parts along the fall direction (roof, wooden walls, windows), **stops/breaks against harder-than-wood** (concrete/brick); bigger tree penetrates more. Reuse existing building destruction.
  - vs **another tree**: stops or snaps against it, stays leaning or breaks; **no domino**.
- Then lands and **drapes** (Phase 2).

### Phase 2 — Fallen log on the ground
- **Drapes per-chunk on the terrain** (INV-2): each chunk rests on the ground under it; nothing floats, nothing buried. (Generalises the stopgap `_groundChunks`.)
- **Roles:** (a) **cover** — stops bullets until shot apart (makes felling tactical); (b) **traversal + horde obstacle** — player climbs over the bole / under a raised crown / wades into the crown; **blocks & slows the horde's flow-field pathing** → fell trees to wall off zombie routes; (c) fully destructible. **No** wood-harvest/resource economy.
- Shooting a chunk removes only that chunk (sink, no orphan-float because each chunk is grounded). Caliber chops by trunk thickness.
- **Persistence:** logs stay the whole run (battlefield fills with downed trees = atmosphere); when too many, oldest **coarsen (LOD)** or quietly disappear to protect FPS (extends `MAX_SEG_LOGS`).

### Phase 3 — The stump
- The stump is just the lower bands of the same voxel-cylinder: **permanent + shootable** — keep carving its cells until gone — **OR dig under it** → uproots (Phase 5). Acts as **low cover** while it stands. "Re-snap" is simply more carving in this model. *(INV-1 applies: any chunk shot off the stump detaches and drops.)*

### Phase 4 — Fire / charred
- **Ignition:** molotov ignites strongly; rocket/HE ignites weaker (smaller chance/range); **grenade never** (already shipped). Both standing & fallen trees can ignite.
- **Spread:** only to very close/touching trees + foliage, then dies out — a controlled burn, never a map-wide inferno (manageable perf).
- **Charred state:** a black husk that stays but is **fragile** — one hit / light impact shatters it (easy to finish off / fell), holds fewer bullets (weaker cover), **non-flammable** (won't re-ignite), eventually sinks (no regrow). Extends existing "burning fallen logs char & sink".
- A burning tree still fells normally.

### Phase 5 — Uproot (dig)
- Digging the ground out under a tree topples it toward the most-undermined side, **whole incl. the root ball** (not just the top) → lies down as a full log (Phase 2 behavior), **no stump**, leaves a **crater**. Ties to the terrain digging system.

### Phase 6 — Cross-cutting
- **Perf / LOD + lazy detail:** distant trees stay coarse/whole; the full voxel-cylinder is generated only when the tree is **near** OR **first shot**; untouched far trees stay cheap. Small visual "pop" on transition is acceptable.
- **Co-op / persistence:** INV-5. Bullet carve = client raycasts ghost → claims hit → host applies the cell removal → broadcasts (which cells, seeded) → peers mirror. Late-join full sync.
- **Reuse:** building destruction, terrain dig, flow-field nav, FireManager, enterable-foliage, the `/testtree` harness.

## 5. What this replaces / reuses in code
- **Replace** the fell/segment path in `src/forestdemo.js` (`fellTree`, `_registerFallenLog`, `breakLogSeg`/`_killSeg`, `_resolveFlatFall`/`_flatTarget`, `_groundChunks`, the FALLING loop) with the unified voxel-cylinder + support-flood + scaled-detach model.
- **Reuse** `src/destruct.js` (THREE-free, node-tested): `makeHinge`/`stepBody` (big top), `makeTumble` (small chunk), `orphanedCells` (support flood — generalise to 3D cells), `binFallen*`/`splitGeomAtY` where still useful.
- `src/props/generators/tree.js` `makeTree` — adapt to emit the voxel-cylinder cell grid (or wrap it).
- Fire: `game.js _demoBlast` igniteAt (molotov/rocket gated), `FireManager`.

## 6. Build order (incremental, test-tree first → forest-wide)
Each milestone is independently testable via `/testtree` + Playwright, and each respects the INVARIANTS:
1. **M0 — voxel-cylinder data + render + carve** on a single test tree (standing): shoot cells away, persistent holes, collision = live cells (shoot-through). Verify INV-4.
2. **M1 — support flood + scaled detach** (INV-1/2/3): sever → big top hinges & drapes; small shot-off chunk tumbles & rests; nothing stuck/floats. *(This is the milestone that fixes the owner's #1 pain — gate it hard.)*
3. **M2 — felling impact** (Phase 1): weight-scaled fall + swept impact vs person/building/tree.
4. **M3 — fallen-log roles** (Phase 2): cover, horde-obstacle nav, persistence/LOD.
5. **M4 — stump + uproot** (Phase 3/5).
6. **M5 — fire/charred** (Phase 4).
7. **M6 — perf LOD + lazy detail + co-op sync** (Phase 6), then forest-wide rollout + cache-bust + PR.

## 7. Open tuning (decide live in-browser, not now)
#sectors, #rings, band height, sever threshold, per-caliber penetration, per-species HP/thickness, tumble-vs-hinge size cutoff, fall speed curve, fire spread radius/chance, LOD distances, perf caps.
