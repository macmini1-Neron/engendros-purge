# 🌲 Forest Atmosphere — REFERENCE (the look to match)

**Date:** 2026-06-10 · **Branch:** `feat/nature-props` · **Status:** approved reference — match this vibe.

This is the gold-standard reference for the ENGENDROS PURGE forest/nature look: a dense,
atmospheric Ukrainian/Russian forest you can't see far across, built entirely from our
procedural voxel generators + modelgen props. **When building the in-game forest, match these.**

## Run it
```
python3 -m http.server 8199 --directory "/Users/macmini1/game 4.8"   # if not already up
# then open in a browser:
http://localhost:8199/tools/modelgen/forest-demo.html
```
- **drag** = look · **WASD** = walk · **Q/E** = up/down · **Shift** = run
- **N** = cycle day / dusk / night · **🔊** button = procedural ambience (wind + birds)
- URL params: `?dense=2` (or 3) = denser forest · `?time=night` / `?time=dusk` = start mood

Source: `tools/modelgen/forest-demo.html` (standalone dev demo, not the live game).

## The vibe (curated stills)
- Day POV — dappled trunk shadows on the green floor, light shafts, birch in front:
  `docs/reference/forest/day-pov.jpeg`
- Dense day (`?dense=2`): `docs/reference/forest/dense-day.jpeg`
- **Night + fireflies** (moody horror/ambush): `docs/reference/forest/night-fireflies.jpeg`
- Tree species line-up (round trunks, birch lenticels): `docs/reference/forest/tree-species.jpeg`
- All-models showcase: `docs/reference/forest/showcase.jpeg`

## The recipe (what makes it read as a forest, not bare models)
1. **Tight biome fog** — `THREE.Fog`, near ~14 / far ~50–78, greenish; you can't see the far
   end. This is THE technique: it bounds the visible set so density stays cheap AND creates depth.
2. **Shadow-mapped dappled light** — low warm sun (`DirectionalLight` castShadow, 2048 map) →
   trunk shadows streak across the floor. Low ambient so they read. The signature look.
3. **Textured forest floor** — procedural `CanvasTexture` (mottled moss/needle/grass), tiled,
   `receiveShadow`.
4. **Layers** — canopy (trees) + understory (grass ×340, shrubs, flowers, bush) + deadfall
   (logs/stumps/rocks via modelgen specs). Bare trees on grass = wrong; layers = rich.
5. **Particles** — pollen motes (additive Points) + falling leaves.
6. **Light shafts** — subtle additive planes oriented to the sun.
7. **Wind** — gentle per-instance sway (trees lean a little, grass a lot) driven by a global gust.
8. **Time of day** — day/dusk/night recolour fog+sun+ambient; night adds moonlight + fireflies.
9. **Sound** — procedural wind bed + random bird chirps (Web Audio, click to start).

## Performance (measured, this Mac, ~960 px, forest alone)
| | FPS | draw calls | triangles |
|---|---|---|---|
| normal density | 145 | 117 | 122 k |
| **2× density** | **144** | 243 | 256 k |
| night (2×) | =day | 252 | 288 k |

Tight fog + per-mesh frustum culling → only ~120–250 objects ever drawn regardless of view or
total scene size. Doubling density doubled cost but FPS didn't budge → big headroom. (Headless
Playwright throttles rAF to 1 fps — ignore FPS read from there; the foreground browser is smooth.)

**Forest-ready trees (after the hollow-crown perf pass):** birch 3.1k · poplar 3.3k · pine 3.4k ·
willow 4.9k · **oak 5.2k** (was 24.9k) · dead/burnt 0.7–1.1k tris. `makeTree({lod:0|1|2})`.

For the REAL game at huge scale, add **instancing** (same-species → 1 draw call) +
**draw-distance/chunking** — the trees are built ready (lod param exists). Not needed for the demo.

## Open ideas (not yet built) — to push it further
Wind gusts → leaf bursts · day-night tied to game DayNight · **forest as ambush/horror space**
(enemies from the fog, light=safety) · clearings + trail + stream/pond + war crater · vines /
bracket fungi / moss on trunks · fallen-tree arches · ground decals (leaf piles, mushrooms,
roots, puddles) · layered shifting ambience + footsteps on leaves · billboard forest-wall at the
fog edge (feels infinite) · subtle bloom on shafts/pollen.

See [[engendros-nature-biomes-world]] (memory) + `docs/superpowers/specs/2026-06-10-world-biome-placement-plan.md`.
