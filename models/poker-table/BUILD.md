# poker-table — BUILD log

Round antique English games/card (poker) table for the 3D poker scene. Owner brief: SHAPE simple
(plain legs OK), VISIBLE TOP ultra-precise (green baize inset + turned wood rim/lip). Material research
answered the owner's question: the green surface is **BAIZE** — woven wool (not pressed felt),
traditionally green "in mimicry of a lawn", napped, ~1 mm. New palette material `baize` added.

## Round 1 (2026-06-13)
- Dossier: `ref/dossier.json` — sourced overall dims (Ø700–950 mm / H710–762 mm range → rep. Ø920×H730),
  baize material (Wikipedia/TheFreeDictionary/Baize&Wool), cabriole+pad-foot (Britannica), drop pull
  (Paxton), crossbanding (Merriam-Webster). Top slab/rim/lip/reveal + frieze depth + leg sections are
  PHOTO-DERIVED (flagged in needs[]). Owner refs copied to `ref/ref-top-closeup.png` + `ref/ref-fulltable.png`.
- Spec: 9 parts — `top_slab` (Ø920 wood, axis y), `rim_lip` (bullnose torus, axis y default), `band_inlay`
  (darker cross-band torus), `baize` (green inset, 10 mm proud), `apron` (100 mm frieze), `drawer_front`,
  `pull_plate` + `pull_knob` (brass drop pull), `legs` (4 plain 50 mm posts).
- **Lint clean:** built 0.920×0.741×0.920 m, footprint fill 100/99/100 %, 9 parts. modelgen tests 75/75.
- **Bugs fixed this round (operator-convention traps):**
  1. `torus` default axis is **y** (lies flat); my initial `rot:[90,0,0]` STOOD IT UP → bounds saw Y±(r+tube)=1.19 m overflow. Removed the rot.
  2. `cylinder` default axis is **z** (lies on its side, r→Y). Flat table discs need `axis:"y"` → fixed top_slab/baize/apron; bounds then clean.
- Renders (`renders/`): q34, top, q34-ghost (1.75 m human box for scale — top sits at hip height ✓).
- Reads clearly as the reference round games table: centred round baize inset, wood border + lip + inlay
  rings (the stepped-moulding read from above), frieze drawer with brass pull, 4 legs.

## Round 2 (owner shape feedback applied)
Owner: "bigger playing surface · no lip, green right to the edge · hide the legs so they don't peek from the side."
- Removed `rim_lip` + `band_inlay` toruses (no raised lip / inner border).
- `baize` enlarged r 0.385 → 0.448 (Ø≈896) so the green fills the Ø920 top, leaving only a ~12 mm wood edge; ~13 mm proud.
- `legs` span pulled in 0.64 → 0.50 (corner reach ~0.35 ≪ 0.46 top radius) → tucked under the overhang; side view confirms they no longer peek past the top edge.
- Lint clean: 0.920×0.743×0.920 m, fill 100/100/100 %, 7 parts. Renders reshot (q34/side/top). Reads as a clean round poker table.

## Round 3 (felt texture — owner: "much more resolution/texture, more pixels & detail on the green cloth")
- The baize was a flat `cylinder` merged into the vertex-coloured base mesh → only 5-tone shading, no cloth texture.
- Switched `baize` to `texturedCylinder` with **`kind:"baize"`** (`src/props/operators/round.js` → new `makeBaizeTexture`):
  a 2048² CanvasTexture mapped onto the top cap — lamp-pooled radial base (brighter centre → vignetted rim),
  a fine woven warp/weft thread weave (~0.9 mm pitch, jittered so it reads as cloth not a grid), brushed-nap
  mottle, a worn centre pool, and two faint concentric table rings (dealer's line + inlay echo). Palette-locked
  to the baize tones; a tiny stable LCG keeps the weave identical across rebuilds. `seg:80` keeps the rim round.
- Verified via a standalone headless-Chrome render harness (SwiftShader WebGL; the shared Playwright MCP browser
  was busy). Renders `renders/felt-{q34,close,top,graze}.png`: weave reads as woven wool up close, nap + lamp pool
  + dealer ring read at the seated 3/4 angle, graze shows the green sitting proud over the wood with **no z-fight**.
- Lint clean (1.380×0.743×1.380 m, fill 100/100/100 %, 7 parts), modelgen tests 75/75.

## Possible later polish (deferred)
- Baize green is a touch saturated vs the muted billiard green of the reference — could deepen.
- Rim could carry a more pronounced stepped moulding (a second lower skirt step) for the close-up detail.
- Legs are straight posts (cabriole curve omitted per owner brief) — could add a slight taper/knee if wanted.
- Drawer pull plate sizing/aspect.
