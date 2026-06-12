# postergen — 2D image / propaganda-poster harness (design spec)

- **Date:** 2026-06-12
- **Status:** design (brainstormed with Tomáš; awaiting spec review → writing-plans)
- **Authors:** Tomáš + brother (canon/lore decisions), Claude (harness design)
- **Supersedes / relates to:** sibling of `modelgen` / `buildgen` / `voxel-weapon-modeling`.

## 1. What & why

A **paste-ready harness for generating 2D raster art** — primarily **Soviet propaganda
posters** featuring the game's plush "Engendros" — as real PNG assets that ship in the game
(wall decals, menu / loading key-art). The generator is an external **GPT image model driven
by hand** (ChatGPT / GPT-image), so this harness is a **cookbook + character bible + verify
checklist**, NOT a code pipeline.

The motivation is concrete: Tomáš produced ~7 gorgeous reference posters that are *also* a
**dangerous template** — placed side by side they share **no single locked rule**. The errors
they exhibit are exactly what this harness must prevent. The headline failure modes (each maps
to a law below):

1. **Render-medium drift** — the 7 references span painterly-pixel, 2-colour risograph, flat
   constructivist vector, distressed litho, **cross-stitch / diamond-painting**, detailed
   pixel, and rendered steampunk illustration. No two share a technique. *(→ Law 1: house-style
   lock.)*
2. **Off-model characters** — wrong eye types, invented anatomy, wrong colours. Critically,
   half of what *looked* like errors were actually **canonical characters the author of the
   prompt didn't know** (yellow-3-eyes = Mitri, blue-winged = Upy, red-devil = Tuli). Without a
   sourced bible, even a careful operator cannot tell a trait from a defect. *(→ Law 2:
   character bible.)*
3. **Text hallucination** — Cyrillic is the #1 fragility ("ТУЛЫ", garbled decorative letters).
   *(→ Law 3: text is pre-authored, never invented.)*
4. **Faction / semiotic confusion** — the `$` mark read as both hero and enemy. Resolved by
   lore (§3). *(→ Law 4: faction coherence.)*

## 2. Scope

**In scope (v1):** single-character and small-group **propaganda posters** in one locked house
style, portrait, with a pre-authored Cyrillic headline (+ optional subtitle), destined for
in-game use as flat raster assets.

**Out of scope (deferred, noted so we don't pretend coverage):**
- Tileable world **textures** (need seamless edges — different constraints).
- Transparent-background **item / UI icons** (need centred subject + alpha).
- **Programmatic** generation (API/MCP automation) — see §11.
- Broad **lore-doc reconciliation** across the white paper — tracked separately; this harness
  only *cites* one agreed lore source, it does not rewrite the others.

## 3. Lore foundation (the frame that makes the posters coherent)

Agreed by Tomáš + brother, 2026-06-12:

> Soviet scientists **created the Engendros** — plush automatons — as a labour force and as
> weapons (facility lore: КОЛЫБЕЛЬ "the Cradle" / ПЛЮШТАЛЬ). They later **rebelled**. The game
> is set *after* the rebellion, so in gameplay the Engendros are the hostile horde.

Consequences this harness depends on:

- **Posters are PRE-REBELLION propaganda artifacts.** They celebrate the Engendros as heroic
  state-made worker-comrades and weapons. That is why "СЛАВА КОЛХОЗНОМУ ТРУДУ" with an
  Engendros harvesting wheat, or "ТОЛО ХРАНИТ КОЛХОЗНЫЙ НАРОД" with Tolo as a guardian weapon,
  is *correct*, not accidental. In the post-rebellion world these posters survive as eerie,
  ironic **relics** — propaganda for the very things now killing you. (Fits the
  survival-horror tone directly.)
- **The `$`-capitalist is the period-appropriate external enemy** (the West). No contradiction
  with gameplay, because gameplay is *after* the rebellion and the posters are *before* it.
- **The 9 OG Engendros are unique BOSSES**, each completely distinct. The regular horde
  enemies are **modified / derivative variants** of them. (More characters may come later.)

The poster harness's "in-universe voice" is therefore fixed: **state propaganda of the
pre-rebellion Soviet-creator era.**

## 4. Family placement & the generator constraint

Modeling family, top to bottom: `voxel-weapon-modeling` (first-person guns) → `modelgen` (room
props/machines) → `buildgen` (buildings/POIs) → **`postergen` (2D raster art).**

**Generator = manual GPT-image (ChatGPT), chosen 2026-06-12.** This fixes the harness shape:

- **No separate negative-prompt field, no seed, no img2img knob.** Guardrails are written
  **into the prose of the prompt** ("avoid …"). Reproducibility comes from disciplined,
  *verbatim-reused* fixed blocks, not from a seed.
- **Consistency levers available:** (a) **reference-image upload** of the locked style + the
  target character every time; (b) **batch + cherry-pick**; (c) the verbatim style-lock and
  bible-quoted character description.
- **Text is never the model's to invent** (see Law 3).
- The deliverable is a **paste-ready** SKILL the operator (or a future agent) follows.

## 5. The laws (verify-gate enforced — there is no code linter here; the gate is disciplined visual review against the brief + bible)

1. **One house style, locked verbatim.** Canonical technique = **detailed pixel / litho** (the
   style of references 1 & 6): layered shading, halftone grain, aged litho print, rich but
   limited palette, thick slab Cyrillic headline, portrait, framed. The exact style block is
   reused **word-for-word** in every prompt. *Forbidden mediums (from the drift evidence):*
   cross-stitch/diamond-painting, smooth 3D render, photoreal background, flat vector.
2. **Characters are on-model from the bible (§9), sourced not invented.** Every visible
   creature trait — colour (exact hex), eye count & type, anatomy (no fingers), hair, special
   marks — comes from the bible. A trait not in the bible is not drawn. If a poster needs a new
   creature/feature, it is **decided deliberately and added to the bible first** (then it
   becomes canon, with a `src`). This mirrors modelgen/buildgen's `src = dossier#…` provenance
   law.
3. **Text is pre-authored and verified, never invented by the model.** Slogans are written by
   human+agent in the intake (§6.2) as **exact locked Cyrillic strings**. The model only
   renders a known string; the verify gate reads the render **character-by-character** against
   the locked string and rejects on any mismatch. Keep headlines short (≤ ~4 words) — that is
   what GPT-image renders reliably; minimise/avoid small decorative text. **Fallback for
   stubborn text:** prompt a *blank* banner and composite the real Cyrillic in a second pass
   via Canvas/SVG with a real font (the repo already does Canvas text — `clockface.js`).
4. **Faction coherence (§3).** Each character's poster role (hero / enemy / neutral) is
   consistent with the lore. Engendros = heroic pre-rebellion state-made comrades/weapons;
   `$`-capitalist = external enemy. No silently mixed metaphors.
5. **Creative within rails.** The scene, pose, composition, mood, environment, and props are
   **creative and varied**; the **character and style are locked**. "Creative per the
   reference, firm guardrails" (Tomáš).
6. **One locked aspect & framing per asset class.** Posters = portrait, period poster framing
   (border drift was a real failure). Frame/border is a deliberate field in the brief, not a
   per-generation accident.
7. **Provenance.** Every brief records *why* each non-obvious choice was made (`src`: bible
   key, lore doc, or "decided with Tomáš/brother <date>"). Prose is not provenance.

Diagnostics: a poster that fails **Law 1–4** is rejected and regenerated. Laws 5–7 are quality
/ bookkeeping.

## 6. Pipeline (DNA of buildgen — intake → sourced brief → produce → self-verify; verify is by eye, not by `node --test`)

### 6.1 INTAKE (mandatory questionnaire)
Agent interviews the user before anything: what the poster is *for*; which character(s) +
faction; the message; the **mood/feeling**; the **environment**; composition; and where it
lands in the game (wall decal / menu / loading).

### 6.2 SLOGAN co-write
Agent + user write the **exact Cyrillic** headline (≤ ~4 words) and optional subtitle together,
and **lock the strings**. Deliberate propaganda copy — never improvised by the model. (This is
what makes "ТУЛЫ" impossible: no one approved that word.)

### 6.3 BRIEF
Agent writes a short `posters/<id>/brief.md` (schema §7). This is the **single source of truth
the verify gate checks against**, and it is reusable / iterable.

### 6.4 PROMPT ASSEMBLY
Agent assembles the final prompt from **fixed blocks** (template §8):
`[STYLE-LOCK verbatim]` + `[CHARACTER quoted from bible — "no fingers / N eyes / exact hex"]` +
`[SCENE: mood + environment + context]` + `[TEXT: render exactly «…»]` + `[COMPOSITION /
frame]` + `[AVOID block]` — **and attaches the reference image(s)** (style + character).

### 6.5 GENERATE → VERIFY GATE → regen loop
Generate a small batch; run the visual checklist (§10); cherry-pick or regenerate. Approved
PNG lands at `assets/posters/<id>.png`.

## 7. Brief schema (`posters/<id>/brief.md`)

```yaml
id:            slava-trudu-kuco
purpose:       in-game wall decal (kolkhoz interior)
characters:    [Kuco]            # bible keys; faction auto from bible
faction_frame: hero              # hero | enemy | neutral  (must agree with §3)
era_voice:     pre-rebellion soviet state propaganda
headline_ru:   "СЛАВА ТРУДУ"     # LOCKED exact string (Law 3)
subtitle_ru:   ""                # optional, LOCKED; keep minimal
mood:          triumphant, sunlit, heroic
environment:   collective farm, wheat field, red banners
composition:   centred hero, low heroic angle, banner ribbon at base
frame:         simple red keyline + gold corner motif
reference_imgs:[style: ref-1.png, character: bible/kuco.png]
src:           [bible#Kuco, lore#pre-rebellion, "slogan decided w/ Tomáš 2026-06-12"]
status:        draft | generating | approved
output:        assets/posters/slava-trudu-kuco.png
```

## 8. Prompt template (the assembled blocks)

```
[STYLE-LOCK — verbatim, every time]
Vintage Soviet propaganda poster, detailed pixel/litho print: layered shading (lit top strip +
dark bottom shadow), heavy halftone grain, aged lithograph paper texture, rich but LIMITED
palette, bold thick slab Cyrillic headline, portrait orientation, period poster frame.

[CHARACTER — quoted from the bible, exact]
<bible block for the character, including exact hex, eye count/type, "fingerless stub arms",
hair, special marks, and the FORBID line>

[SCENE]
Mood: <mood>. Environment: <environment>. Context: <one line of narrative>.

[TEXT]
Render this text EXACTLY, large, as the headline: «<headline_ru>». <optional: subtitle «…».>
No other text, no decorative letters.

[COMPOSITION]
<composition>; frame: <frame>.

[AVOID]
cross-stitch / diamond-painting texture, smooth 3D render, photorealistic background, flat
vector, fingers/hands, glossy cartoon eyes, wings/horns/hat/extra eyes unless the character
owns them, English text, gibberish or misspelled Cyrillic, watermark, signature, extra limbs.

[ATTACH] style reference image + character reference image.
```

## 9. Character bible — the 9 OG bosses (LOCKED, 1:1)

Source of truth: official **engendros® IP reference art** (`27.png` group vector) + Tomáš's
per-character confirmations, 2026-06-12. Hex values **sampled from the vector**. This block is
extracted verbatim into `.claude/skills/postergen/character-bible.md` during implementation.

**Note:** the running game's `enemies.js` roster is **stale** vs this canon (e.g. it had Luka
orange; canon Luka is green). The bible — not the code — is authoritative for poster art.

### BASE (shared by all unless a delta overrides)
- **Style:** voodoo-doll plush, soft fabric, visible hand-stitching, cute-creepy.
- **Head:** large round ball, bigger than the torso.
- **Torso:** small rounded blob + 2 stubby legs.
- **Arms:** 2 stubby, **FINGERLESS** rounded nubs.
- **Eyes:** **big BUTTON eye** (dark 4-hole button with an X of thread over it) on the
  **viewer's LEFT** in front view — **never mirrored** — **plus** a small black **BEAD eye**
  on the viewer's right.
- **Mouth:** stitched **X-smile** (curved seam with small x stitches).
- **Hair:** **2** short black thread tufts on the crown.
- **FORBID:** no fingers; no glossy cartoon eyes; no wings / horns / hat / cape / extra eyes
  unless this specific boss owns them; never exceed its own eye-count.

### The nine (delta = override of BASE)
| Boss | ENEATYP | Body hex | Eyes (delta) | Hair (delta) | Special |
|---|---|---|---|---|---|
| **Tuli** | 2 | `#CC3124` red | base | 2 | **devil**: 2 black horns, black tail, single black belly band |
| **Tolo** | 6 | `#F4F2EC` white | base | **single grey-black SPIRAL curl** | red **Target bullseye** on belly (red ring / white / red centre) = laser emitter & weak spot · *current game boss* |
| **Odo** | 5 | `#E2802E` orange | **CYCLOPS — one big button eye, CENTRED, no bead** | **3** | magnifying glass = prop, NOT part of body |
| **Mitri** | 9 | `#E7BC3E` yellow | **THREE identical big X-buttons in a row, no bead** | 2 | — |
| **Dupo** | 7 | `#DD497E` pink | **CYCLOPS — one big button eye, CENTRED, no bead** | 2 | **FOUR arms** (2 stacked pairs per side) · turquoise `#50AFC8` belly pocket |
| **Upy** | 1 | `#3581BE` blue | base | 2 | **white feathered WINGS instead of arms** |
| **Kuco** | 8 | split **viewer-left `#E2802E` orange \| viewer-right `#CC3124` red** | base | 2 | vertical bicolour split, centre seam stitch · **the LEADER** ("nobody gives me orders") |
| **Luka** | 3 | `#73B24A` green | base | 2 | **`$` on a small belly pouch** · short **green cape tied with a green bow** at the neck · *capitalist-mocker* |
| **Flopo** | 4 | `#50AFC8` turquoise | base | **NONE (collar only)** | collar of **5 PINK `#DD497E` petals** as a neck ruff |

**Palette interlock (sanity check):** Dupo body `#DD497E` = Flopo petals; Dupo pocket `#50AFC8`
= Flopo body. Tuli red `#CC3124` = Kuco's red half. Odo orange `#E2802E` = Kuco's orange half.

## 10. Verify checklist (visual gate, run on every candidate)

- [ ] **Style:** matches the house-style lock; none of the forbidden mediums.
- [ ] **Character on-model:** exact body hex; correct eye count & type (button-left + bead, or
      the delta); fingerless stub arms; correct hair; correct special marks; no invented
      accessories.
- [ ] **Text:** headline (and subtitle) match the **locked string character-by-character**; no
      extra/decorative/garbled Cyrillic; no English.
- [ ] **Faction:** poster role agrees with the lore frame.
- [ ] **Composition/frame:** portrait; framing as briefed.
- [ ] **No AI artifacts:** extra limbs, melted symbols, wrong star points, mangled
      hammer-sickle.

Any unchecked **style/character/text/faction** box → reject + regenerate.

## 11. Components & file layout
- `.claude/skills/postergen/SKILL.md` — the playbook: laws, pipeline, prompt template, verify
  checklist (English).
- `.claude/skills/postergen/character-bible.md` — the locked §9 bible (English).
- `posters/<id>/brief.md` — per-poster brief (§7).
- `assets/posters/<id>.png` — approved output, loaded in-game like
  `assets/poster-t90m-weakpoints.png` / `assets/hero/*.webp`.
- `posters/_smoke/` — the **first proving poster** (à la buildgen's `_smoke` fixture): run the
  whole pipeline once end-to-end before authoring real posters.

## 12. Build order (for writing-plans)
1. Write `SKILL.md` (playbook) + `character-bible.md` (the locked §9).
2. Prove the pipeline on **one `_smoke` poster** end-to-end (intake → brief → prompt → generate
   → verify) — confirm a real on-model, correctly-spelled poster comes out.
3. Only then author the first real in-game poster and wire it as a decal.
4. (Future) optional composite-text fallback; texture/icon variants; programmatic backend.

## 13. Open questions / future
- **Backend automation** (gpt-image-1 API or local SD/MCP) — deferred; would add seed +
  negative field + img2img for stronger consistency.
- **Localization / editable slogans** — the blank-banner + Canvas composite path (Law 3
  fallback) would let slogans change without regenerating art.
- **Minion variants** — how the horde's "modified" Engendros derive from the 9 bosses
  (looser bible) — out of v1.
