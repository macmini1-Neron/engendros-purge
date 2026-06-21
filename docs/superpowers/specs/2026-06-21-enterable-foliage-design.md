# Enterable vegetation — "soft-cover foliage" (?map=forest)

**Status:** owner-approved design (brainstormed 2026-06-21). Branch `feat/enterable-foliage`, stacked
on `feat/digging-on-forest` (PR #106 — the precise tree hitboxes + the `shootOnly` canopy box this
feature extends). **No implementation until this spec is reviewed.**

**Goal / vibe:** vegetation you can *enter*. Wood (trunk + branches) is solid — you see it, snag on it,
shoot it, fell it. **Leaves are soft cover** — you push *through* them (slowed), they hide you from the
horde, and when your camera is buried in a crown the nearby leaves dissolve so you're not blinded but
still feel wrapped in the voxel tree. Same system on tree canopies, **fallen crowns**, saplings, and
**bushes** (which we also start scattering on the forest map). Extends the destructible-forest direction:
the woods become terrain you fight *inside*, not a sprinkle of obstacles.

This is the design doc. Implementation is phased (M1–M4) but ships as one feature/PR (or a short stack).

---

## 1. The model — two layers per plant

Every plant splits into **wood** and **foliage**, separated in BOTH collision and render:

- **Wood** (trunk + branches + root collar): **solid** AABB boxes — block movement, snag, stop/penetrate
  per caliber, fell. Always opaque. *(Already built on PR #106: the 3 taper-aware trunk bands + collar
  box that hug the leaning bole.)*
- **Foliage** (leaves): tagged with a single box flag **`foliage`** — the richer successor to the
  `shootOnly` flag PR #106 added. `foliage` means: **raycast hits it** (bullets + AI line-of-sight),
  **movement passes through** it, and **movement is slowed while inside**.

### The `foliage` flag (collision contract)

Rename/extend `shootOnly` → `foliage` on the canopy boxes. A `foliage` box:

1. **Is raycast-hittable** — `world.rayHit` already hits every box; unchanged. Bullets soft-penetrate it
   (wood/leaf tier ≤ `FRAGILE_MAX_TIER`) → punch through + fell. AI LOS rays are blocked by it.
2. **Never blocks movement** — the movement guards PR #106 added (`world.js` `_collideTerrain` vertical
   loop, `_headClear`, `_moveAxis`, `BuildManager.validateAt`; `enemies.js` crate-avoidance, the main
   collision loop, `_headClearE`) switch from `b.shootOnly` to `b.foliage`. This also keeps the
   phantom-wall fix (the horde collision loop only checks `b.max.y`, so a floating leaf box must be
   skipped).
3. **Slows movement while a body is inside it** — new (§2).

> Why one flag, not "shootOnly + a slow flag": every foliage box wants all three behaviors. `shootOnly`
> was the minimum viable version shipped on PR #106; `foliage` is the same boxes with the slow added.

---

## 2. The four foliage behaviors (and where each lives)

| behavior | implementation | cost |
|---|---|---|
| **Walk through + slow** | per-frame: is the mover's body inside a `foliage` box? → multiply horizontal speed by `FOLIAGE_SLOW ≈ 0.55`. **Player AND enemies.** | small |
| **Conceal from AI** | enemy line-of-sight runs through `world.rayHit`; a `foliage` box stops the ray → the horde loses its direct bead and must path/search instead of beeline. **~free** (the box is already raycast-hittable). | ~0 |
| **Bullets pass through** | leaves are soft cover (soft-penetration, already in `weapons.js`): the round punches through and can fell the plant. Concealment ≠ bulletproof — realistic. | 0 (already) |
| **Camera near-fade** | the leaf mesh's material fades fragments within `~FADE_NEAR..FADE_FAR` of the camera → leaves at your face dissolve, the rest of the crown + all wood stay solid. | medium (§3) |

### 2a. Walk-through slow — detail

A pure helper makes it testable:

```js
// true horizontal-speed multiplier at a body position; 1 when not in foliage.
foliageSlowAt(grid, x, y, h, r) → number   // scans grid.queryAABB(x±r, z±r), point-in-AABB incl. Y
```

- The **Y test matters**: a standing tree's canopy box floats 7–27 m up, so a ground player/enemy is NOT
  inside it → no slow. Only foliage you're actually standing in slows you — bushes, fallen crowns,
  saplings, willow skirts. (This is why the high canopy needs no special-casing — geometry gates it.)
- **Player:** in `player.js` movement, fold `foliageSlowAt(...)` into the speed term (same place as the
  barbed-wire / burn slow already applied).
- **Enemies:** in `enemies.js`, fold it into the existing `spd` product (alongside `ENEMY_BURN_SLOW`,
  `wire.slow`). Host-authoritative for enemies (host sims them); player slow is local.
- Optional **rustle** SFX/visual when you enter a foliage volume (juice) — nice-to-have, not required.

### 2b. Conceal — detail

No new system: `world.rayHit` already hits `foliage` boxes, and the horde's beeline test
(`enemies.js`, `if (!world.rayHit(o, d, dist)) beeline`) + the boss LOS already consult it. A bush /
fallen crown / sapling at body height blocks the ray → concealment. A high canopy doesn't block a
horizontal LOS ray → you hide behind the trunk or in low foliage, not "under" a 25 m crown. Correct by
construction. Verify, don't rebuild.

---

## 3. Render: wood/leaf split + camera fade

### 3a. Generator split

`tree.js makeTree()` currently merges trunk + branches + foliage into **one** geometry. Split into:

- **wood geometry** (buildTrunk + buildBranches + collar/damage) → opaque `voxelMaterial()`.
- **leaf geometry** (buildFoliage) → the new **foliage material** (§3b).

Return both: `{ woodGeometry, leafGeometry, woodMaterial, leafMaterial, spine, crownAABB, ... }`.
`forestdemo._addTree` builds **two meshes** per tree (wood + leaf), both at the tree transform; the
canopy `foliage` box is unchanged (it already hugs the measured leaf envelope).

- **Consumers to audit:** anything using `res.geometry`/`res.material` (single mesh) — at least the
  admin/asset viewer. Keep a convenience merged `geometry` getter, or update the few callers. List them
  in the plan.
- **Bushes (`groundcover.js` `makeBush`/`makeShrub`)** are ~all leaf with a tiny woody stub → no split:
  the whole bush uses the leaf/foliage material + one `foliage` box. Simpler than trees.

### 3b. Foliage material + near-camera fade

A factory `foliageMaterial({ fade })` = `voxelMaterial()` + `onBeforeCompile`:

- **vertex:** add a varying `vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz`.
- **fragment:** `float d = distance(vWorldPos, cameraPosition); float a = smoothstep(FADE_NEAR, FADE_FAR, d);`
  then `gl_FragColor.a *= a;` (`cameraPosition` is a built-in Three uniform). `FADE_NEAR ≈ 0.4`,
  `FADE_FAR ≈ 2.2` m → fully transparent at the lens, fully opaque ~2 m out.

### 3c. Fade gating (the perf fork — owner chose near-camera only)

Transparent rendering is expensive at ~200 pieces, so the fade is **only active on the 0–2 pieces the
camera is inside/near**:

- All leaf meshes default to a **shared opaque** foliage material (`transparent:false`) → cheap opaque
  queue, fade math ignored.
- A small per-frame manager (in `ForestDemo.update`, or a `VegetationFade` helper) finds foliage pieces
  whose box is within `~FADE_GATE ≈ 3 m` of the camera and swaps THOSE leaf meshes to the **shared
  transparent** fade material (`transparent:true`); reverts pieces that leave the radius. The camera
  uniform updates once/frame. Two material instances total (opaque + transparent variants of the same
  injected shader) → no per-piece material explosion, no global transparency cost.

---

## 4. Targets + phasing

Ships as one feature; internal milestones each self-verify (browser, `?map=forest`).

- **M1 — `foliage` flag + slow + conceal (gameplay core).** Rename `shootOnly`→`foliage`; add
  `foliageSlowAt` + wire player & enemy slow; confirm AI concealment. Lowest risk, immediate feel. No
  render change. *Gate:* walk into a sapling/low foliage → slowed; stand in it → the horde loses LOS and
  re-paths; shooting still fells.
- **M2 — wood/leaf mesh split + near-camera fade (the visual payoff).** Generator split, foliage
  material, fade-gating manager. *Gate:* push the camera into a crown → nearby leaves dissolve, branches
  + trunk + far leaves stay solid; 0 console errors; draw-call count sane.
- **M3 — bushes on the forest map.** Scatter `makeBush`/`makeShrub` (currently NONE on the forest map —
  only trees + saplings) into the understory, avoiding reserves/trees; each = a leaf mesh + `foliage`
  box + light HP (shoot/burn to clear, reusing the sapling fell/part pattern). Bushes are ~1 m → you're
  in them constantly = the system's showcase. *Gate:* run through a bush → slowed, leaves fade, you can
  break LOS; shoot it → it clears.
- **M4 — fallen crowns.** Today a settled fallen top is ONE solid `log.box`. Split
  `forestdemo._registerFallenLog` into a **solid wood-core** box (along the woody axis, ~0–65 % of the
  log length) + a **`foliage`** box over the leafy end (~35 %, wider). Then you can wade into a downed
  tree's canopy (slowed, concealed) but bump the trunk. *Stretch within M4:* also split the fallen-top
  MESH (the `breakAt` `SplitBuilder` path in `tree.js`) into wood/leaf so the fallen leaves get the same
  camera-fade; if it bloats scope, fade-on-fallen-crowns defers to a follow-up and M4 ships
  collision-only. *Gate:* fell a tree, walk into the lying crown → enter the leaves, snag the trunk.

---

## 5. Co-op + performance

- **Authority:** player slow = local sim; enemy slow + LOS = host (host sims the horde). Fits the
  existing model — no new messages. ⚠️ The forest is scattered with **unseeded `Math.random`**, so each
  peer grows a *different* forest — a pre-existing co-op desync (forest co-op is already a manual gate).
  This feature does **not** fix or worsen it: foliage boxes are derived locally from each peer's own
  trees; the host's enemy slow/LOS uses the host's forest. Out of scope; noted.
- **Perf:** +1 draw call per plant (the leaf mesh); the fade runs transparent on only 0–2 near pieces.
  At ~200 trees + saplings + bushes this is fine; watch total draw calls (merged single-draw meshes
  today → ~2× + stumps/logs/bushes). The gating manager's per-frame near-camera query is a small
  `grid.queryAABB` around the camera. Revisit instancing/LOD only if it bites (not this pass).

---

## 6. Constants (first cut — feel-tune live)

| name | value | meaning |
|---|---|---|
| `FOLIAGE_SLOW` | 0.55 | horizontal-speed multiplier while inside foliage (player + enemy) |
| `FADE_NEAR` | 0.4 m | fully transparent at/below this camera distance |
| `FADE_FAR` | 2.2 m | fully opaque at/above this camera distance |
| `FADE_GATE` | 3.0 m | a leaf mesh switches to the transparent fade material within this of the camera |
| bush count | ~40–60 | understory bushes scattered on the forest map (M3) |

---

## 7. Out of scope (this feature)

- Per-branch hard snagging (individual twigs as solid boxes) — the trunk bands already snag; YAGNI.
- Fixing the forest co-op desync (unseeded scatter) — separate, pre-existing.
- Instancing / LOD for vegetation — only if draw calls bite.
- Grass/groundcover tufts as foliage volumes (too small to matter for cover) — leave as deco.

## 8. Verification

- **`node --test`:** `foliageSlowAt` point-in-AABB incl. the Y gate (in-foliage vs under-a-high-canopy →
  no slow); the fade `smoothstep(near, far, d)` ramp as a pure fn.
- **Headless Chrome (`?map=forest`, no-store server, always Chrome):** M1 slow + LOS break; M2 push the
  camera into a crown and confirm near-leaf alpha < 1 while wood stays opaque (sample material/uniform or
  read pixels); M3 bushes present + enterable; M4 walk into a fallen crown. Measure draw calls via
  `renderer.info`. (Same isolated-headless recipe used to verify the PR #106 hitboxes — each load grows a
  different forest, so freeze `forest.windy` + reset mesh rotations when measuring geometry.)
