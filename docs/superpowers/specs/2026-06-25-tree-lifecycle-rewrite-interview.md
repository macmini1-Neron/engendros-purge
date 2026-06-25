# Tree System — COMPLETE REWRITE, lifecycle interview agenda

**Status:** PLANNED — not started. Owner wants to begin **after midnight 2026-06-24→25** (a few hours after this was written; low on tokens today).
**Method (owner's words):** *"vezmeme krok po kroku, budeš se mě ptát na chování každé části v každé fázi životního cyklu toho stromu (kompletní rewrite)."* A **collaborative interview**: I ask ONE question at a time (brainstorming skill), owner describes the DESIRED behavior of each PART in each PHASE; I write the spec from the answers, then plan → subagent-driven implement → Playwright-verify each step with the `/testtree` colored harness.

> This is a **ground-up rewrite of the tree system**, not more patching of the current `forestdemo.js` fell logic. The 5 fixes already shipped on `feat/tree-system-redesign` (commit 22104e10: drape/no-float/no-spin/one-fall/grenade-no-ignite) are a stopgap; the rewrite supersedes them. Decide at kickoff whether to build on this branch or branch fresh off #117.

## How we'll run it (kickoff checklist)
1. Re-read this agenda + the bug-triage spec `2026-06-24-tree-system-bug-triage.md` (real root causes, what the current code does).
2. Confirm scope/base branch with owner.
3. Walk the lifecycle phases below **one part × one phase × one question at a time**. Owner answers, I record verbatim intent into a fresh design spec.
4. Verify each phase live with `/testtree` (per-part debug colors, R-reset) — NEVER tune blind.

## The interview map — every PART × every PHASE (fill in owner's answers)

### Phase 0 — Standing tree (alive)
- Appearance, species variety, scale ranges.
- Sway/wind: how much, when.
- **Destructibility while standing:** which calibers do what? Partial damage (chip/scar) vs break? HP per trunk thickness / species?
- **Where does it break?** exactly where shot, or snapped to bands? Crown vs bole behaviour.
- Hitbox/collision precision (ties into PR #124 capsule hitboxes).
- What blocks bullets / what passes (leaves = pass-through?).

### Phase 1 — Taking damage / the moment of felling
- What separates: only the part ABOVE the hit falls? Always a stump left?
- Direction of fall (toward shooter? away? hit vector? gravity/lean?).
- Weight by size — does a bigger tree fall slower/heavier?
- Fall physics: hinge vs free? speed.
- **Collision DURING the fall:** hits buildings (breaks roof not whole house, by weight/size, along motion vector; doesn't destroy concrete/harder-than-wood), other trees, the player (damage by size).
- Multi-hit / spray behaviour (current stopgap = one active fall per tree — confirm desired).

### Phase 2 — Fallen log on the ground
- Shape: stays whole, or chunks? How small can it be shot apart?
- **Gravity/rest:** drape on terrain (current stopgap) — confirm. Nothing floats; unsupported pieces fall.
- Cover/traversal: walk over the bole, under a raised crown, wade into the crown (enterable foliage)?
- Re-destruction: calibers to chop it; what each chunk does when destroyed (sink? debris?).

### Phase 3 — The stump
- Permanent? Shootable? HP?
- Removable how: shoot it down to nothing? dig under it = UPROOT the whole thing?
- Re-snappable (shoot the stump again → shorter)?

### Phase 4 — Fire / charred
- **Ignition sources:** molotov YES; grenade NO (already done); rocket/HE — owner's call. Standing vs fallen ignite differently?
- Burn behaviour: spread? duration? to neighbours?
- **Charred state:** what does a burnt tree/log look like and what can you DO with it — shoot it (does it shatter easier?), burn out fully (sink/ash), no regrow?
- Burning fallen log: char + sink, no poof (existing behaviour — confirm).

### Phase 5 — Uproot (dig)
- Dig under a tree → whole tree topples (root and all, no stump). Confirm + tie to terrain digging system.

### Phase 6 — Cross-cutting
- **Co-op determinism:** every behaviour must be host-auth or seeded-deterministic (no new netcode where avoidable). `hostSim` gate, `pstate` truth.
- Performance: per-chunk cost caps (current `MAX_SEG_LOGS`), LOD.
- Persistence within a run; late-join sync.

## Anchors (where the current code lives — for the rewrite to replace/reuse)
- `src/forestdemo.js` — `ForestDemo`: `fellTree`, `_registerFallenLog`, `regroundLog`, `_groundChunks` (new), `_resolveFlatFall`/`_flatTarget`/`_groundSettled`, `breakLogSeg`/`_killSeg`, `charLog`, the FALLING update loop.
- `src/destruct.js` (THREE-free, node-tested) — `splitGeomAtY`, `binFallenGeometry`, `binFallenAABBs`, `makeHinge`/`stepBody`, `orphanedCells`, `snapPlan`.
- `src/props/generators/tree.js` — `makeTree` (geometry + breakAt split).
- Hitboxes: PR #124 capsule narrowphase (`raycollide.js`, `grid.raycast` refine, `box.cap`).
- Verification harness: `/testtree [species] [scale]` + **R** reset + per-part flat debug colors (`_dbgMat`).
- Fire: `game.js:_demoBlast` igniteAt (gated on isRocket), `FireManager`.

## Decisions to make at kickoff (don't pre-answer)
- Build on `feat/tree-system-redesign` (keep the 5 stopgap fixes) or fresh branch off #117?
- Keep the rigid-rod-hinge fall model or move to a different model (the rigid rod is why wide crowns needed the per-chunk drape)?
- One unified chunk model from the start (so felling + sectional destruction + grounding + fire all share it) — this was the §3 tension in the triage spec.

---

## RECORDED ANSWERS (live interview — 2026-06-25)
Branch: continuing on `feat/tree-system-redesign` (owner-defaulted).

### Phase 0 — Standing tree
- **Q1 destructibility model → "Vystřílet kusy/zářezy z kmene"** (progressive material removal). Bullets carve real wood out of the trunk (holes/notches), splinters fly; remove enough cross-section → it falls. Caliber = depth of each "bite".
- **Q2 granularity → "Sektory v řezu"** (NOT full voxel, NOT vertical-bands-only). Trunk = stack of height-bands × a RING of angular sectors (≈4–8 around). Shoot a side → remove that side's sectors at that height = a notch. ~10× cheaper than voxels → affordable forest-wide; still gives the "carve a hole/notch in the side" feel.
- **Q3 fall trigger + direction → "Směr podle zářezu"** (directional felling). When a cross-section (a height-band) loses more than ~half its ring of sectors, everything ABOVE that height snaps off and falls TOWARD the side with the most material removed (the notch). Real felling — the player controls fall direction by where they carve.
  - ⇒ Emerging model: trunk = bands[h] each holding a ring of sectors[θ]; hit removes sectors near (h,θ); a band severs when remaining ring < threshold; top above falls toward the centroid of removed material. (open: exact threshold, sectors count — tune live.)
- **Q4 caliber × thickness → "Povrchový zářez, na sever třeba víc"** (caliber = RADIAL bite depth). Small arms (pistol/SMG) carve only the OUTER sectors — a surface notch, splinters — but can't reach the CORE of a thick trunk → can't fell it. Thin/young trees fell to pistols; thick trunks need MG / lots of rifle / HE / APFSDS. ⇒ the cross-section needs RADIAL rings too (outer vs core), and caliber = how many rings a hit penetrates. (Ties to existing felTier `caliber × trunk size`.)
- **Q5 partial carve persists → "Zůstane + dírou projde střelba/pohled"**. Carved damage is PERMANENT (no regen); the standing tree keeps standing with a visible notch/hole. **Collision = the REMAINING material** → shoot a hole through the trunk and bullets / line-of-sight / (and enemies?) pass through it. The carved shape IS the precise hitbox (subsumes PR #124's goal). Max destructible, no compromise.
  - ⇒ **Phase-0 trunk model LOCKED (concept):** a "voxel-cylinder" — `trunk = bands[h] × (sectors[θ] × rings[r])`, each cell = wood with HP. A hit at (h,θ) removes cells from outer ring inward up to the caliber's penetration depth. Collision/LOS/hitbox derived from live remaining cells (carve-through = real hole). A band severs when its remaining cells < threshold → everything above falls toward the removed-material centroid. Open/tune-live: band height, #sectors (≈6–8), #rings (≈2–3), sever threshold, per-caliber penetration, per-species/thickness HP. Perf: fine cells only on near trees (LOD); distant trees coarse/whole.

### Phase 1 — Felling moment
- **Q1 falling tree vs BUILDING → "Prorazí jen co unese jeho váha"**. Breaks weaker-than-wood parts along the fall direction (roof, wooden walls, windows); STOPS / breaks against harder-than-wood (concrete/brick). Bigger/heavier tree penetrates more. Reuses existing building destruction.
- **Q2 falling tree vs PERSON (player or enemy) → "Zranění dle velikosti, velký = smrt"**. Trunk of a big tree = instant death / huge dmg; branches/crown = big survivable dmg + knockdown; small tree = knockback+dmg. Applies to enemies too → felling onto the horde is a tactic.
- **Q3 falling tree vs ANOTHER tree → "Opře se / zlomí o něj"**. Stops or snaps against the neighbour, stays leaning or breaks; NO domino/chain. Same "stops on harder/bigger" principle as the building rule. Cheap, co-op-safe.
- **Q4 weight feel → "Velký = pomalý, těžký, dramatický"**. Big tree falls slower/majestic with camera shake + dust + heavy thud + flattens foliage under it; small falls fast/light. Weight is felt. **Impact applies along the WHOLE fall arc** (swept — must dodge in time), not just the landing spot. (Hinge model already physical; this layers juice + size-scaled speed.)
  - ⇒ Phase-1: the severed top falls (hinge), sweeping impact along its arc vs buildings/people/enemies (material+weight gated), resting/breaking against harder obstacles, then lands and drapes (Phase 2).

### Phase 2 — Fallen log on the ground
Base (from stopgap, owner testing): drapes per-chunk on terrain, nothing floats, shoot chunks apart, sink on destroy.
- **Q1 roles → COVER + TRAVERSAL/HORDE-OBSTACLE + DESTRUCTIBLE; NOT a harvest resource.** The log: (a) stops bullets = mobile cover until you shoot it apart (makes felling tactical); (b) player climbs over the bole / under a raised crown / wades into the crown (existing enterable-foliage), and it BLOCKS/SLOWS the horde's pathing → fell trees to wall off zombie routes (needs flow-field nav integration); (c) fully destructible. Owner explicitly did NOT want wood-harvesting/resource economy.
- **Q2 persistence → "Celá hra + perf-strop"**. Logs persist the whole run (battlefield fills with downed trees = atmosphere); when too many, oldest COARSEN (LOD) or quietly disappear to protect FPS. (Builds on existing MAX_SEG_LOGS.)

### Phase 3 — The stump (answers)
- **Q1 removal + role → "Rozstřílíš na nulu NEBO vykopeš"**. The stump is the lower part of the same voxel-cylinder: permanent + shootable, keep carving its sectors until it's gone; OR dig under it (shovel/crater) → it UPROOTS with roots. Acts as LOW cover while it stands. (Matches the owner's earlier permanent-destructible-stump + dig-uproot requirement.) Re-snap = just more carving in the new model.

### Phase 4 — Fire / charred (answers)
- **Q1 fire spread → "Omezeně na dotykové sousedy"**. Fire jumps only to very close/touching trees + foliage, then dies out — a controlled burn, never a map-wide inferno. Atmospheric + tactical, manageable perf. (No jump across gaps.)
- **Q2 charred state → "Zůstane jako křehký uhlík"**. A burnt tree/log stays as a black husk but is FRAGILE: one hit / light impact shatters it (easy to finish off / fell), holds fewer bullets (weaker cover), is non-flammable (won't re-ignite), and eventually sinks (no regrow). Atmospheric burnt trace you can still destroy. (Extends existing "burning fallen logs char & sink".)
- **Q3 ignition sources → "Molotov + raketa/HE"**. Molotov ignites strongly; rocket/HE ignites weaker (smaller chance/range); GRENADE never ignites (already shipped). Keeps the current rocket-ignites fix, molotov primary.
  - (Implied: both standing & fallen trees can ignite; a burning tree still fells normally.)

### Phase 5 — Uproot (dig) (answers)
- **Q1 uproot → "Celý i s kořeny, kráter, žádný pařez"**. Digging the ground out under a tree topples it toward the most-undermined side, WHOLE incl. the root ball (not just the top) → it lies down as a full log, NO stump, and leaves a crater. The lying whole trunk then behaves as a Phase-2 fallen log. (Ties to the terrain digging system.)

### Phase 6 — Cross-cutting (answers)
- **Q1 perf → "LOD + líná detailizace při zásahu"**. Distant trees stay coarse/whole; the full voxel-cylinder is generated only when (a) the tree is near the player OR (b) it's first shot. Untouched far trees stay cheap. Accept a small visual "pop" on the detail transition. Best perf/visual ratio.
- **Constraints (stated, not chosen — hard requirements):**
  - **Co-op determinism / host-auth.** Everything authoritative goes through `hostSim = !mp.active || mp.isHost`. Bullet carve: client raycasts a ghost, claims the hit, host applies the sector removal and broadcasts the carve (which cells, seeded) so all peers mirror identically. Felling direction/seed, drape, fire spread, uproot — all host-auth or seeded-deterministic; avoid new netcode where the existing event+seed pattern suffices. `pstate` is life-state truth (tree-fall damage to players routes through it).
  - **Persistence / late-join.** A joining client must reconstruct current tree state (carved cells, fallen logs, char) from a host sync — same deterministic apply as live.
  - **Reuse, don't reinvent:** building destruction (fall-on-building), terrain dig (uproot), flow-field nav (horde-blocking logs), FireManager (ignite/char/sink), enterable-foliage (wade into crowns), the `/testtree` colored harness for verification.

## ✅ INTERVIEW COMPLETE — next: write the formal rewrite design spec, then writing-plans → subagent build (test-tree first, then forest-wide), Playwright-verify each step.

