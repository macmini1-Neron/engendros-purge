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

**In scope (v1):** two output classes (§4a) — **(a) propaganda posters** (full-bleed portrait)
and **(b) transparent-background cutouts** (a single character / prop / sticker isolated on
alpha) — in one locked house style, with a pre-authored Cyrillic headline where text applies,
destined for **direct** in-game use as raster assets.

**Usage / IP:** **non-commercial, personal** (Tomáš + brother + friends). The `engendros®`
characters are used on that basis. **If the project ever goes commercial, the rights to those
characters must be re-checked first** — it could change the bible.

**Out of scope (deferred, noted so we don't pretend coverage):**
- Tileable world **textures** (need seamless edges — different constraints).
- **Programmatic** generation (API/MCP automation) — see §13.
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

## 4a. Output classes (resolution · transparency · format)

GPT-image supports `1024×1024`, `1024×1536` (portrait), `1536×1024` (landscape) and `auto`, a
**transparent-background** option, and a `quality` setting (use **high** whenever text is in
frame). Two classes:

| Class | Size | Background | Key prompt clauses |
|---|---|---|---|
| **Poster** (wall decal / menu / loading) | `1024×1536` portrait, PNG | opaque, **full-bleed** | "art extends to all four edges, **no white border / margin**" |
| **Cutout** (character / prop / sticker) | `1024×1024` (or `auto`), PNG + alpha | **transparent** | "**transparent background**, isolated subject, **no white halo / outline**, clean alpha edges" |

- **Format is always PNG** (alpha for cutouts; crisp text for posters). Loaded in-game like
  `assets/poster-t90m-weakpoints.png` (texture) or as an alpha decal / sprite for cutouts.
- **Halo gotcha:** transparent cutouts often keep a faint white fringe at the alpha edge —
  cherry-pick clean candidates and/or add a tiny post step (threshold near-white → transparent);
  note it in the brief when a cutout needs that cleanup.
- **Paste-ready:** approved files drop straight into the asset folder — no manual cropping of
  white margins.

## 5. The laws (verify-gate enforced — there is no code linter here; the gate is disciplined visual review against the brief + bible)

1. **One house style, locked verbatim.** Canonical technique = **detailed pixel / litho** (the
   style of references 1 & 6): layered shading, halftone grain, aged litho print, rich but
   limited palette, thick slab Cyrillic headline, portrait, framed. The exact style block is
   reused **word-for-word** in every prompt. *Forbidden mediums (from the drift evidence):*
   cross-stitch/diamond-painting, smooth 3D render, photoreal background, flat vector. The
   persuasion + composition grammar to apply per poster is **Appendix A**.
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
   Tactics, recommended Cyrillic fonts, a slogan-grammar guide, and a verified vocabulary
   bank are in **Appendix B**.
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

### 6.1 INTAKE (mandatory questionnaire — runs before EVERY image, no exceptions)
**Never skip straight to generation.** Before each individual image the agent holds a short
design conversation with the user: what the image is *for*; output class (§4a); which
character(s) + faction; the message; the **mood/feeling**; the **environment**; composition;
and where it lands in the game. The agent comes to this conversation already fluent in the
propaganda-design grammar of **Appendix A** — so the discussion is informed, not generic.

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
class:         poster            # poster | cutout  (§4a)
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

[AVOID]  (assembled from the negative-prompt library §8a: ALWAYS groups A,B,D,E,F +
          this character's NOT-owned accessories from group C)
e.g. cross-stitch/3D-render/photo/flat-vector, fingers/hands, glossy cartoon eyes, wrong
eye-count, <unowned accessories>, misspelled/garbled Cyrillic, English text, watermark,
extra limbs.

[ATTACH] style reference image + character reference image.
```

## 8a. Negative-prompt library

GPT-image has **no negative-prompt field**, so negatives live inside the prompt's `[AVOID]`
block as prose. Every prompt always includes groups **A, B, D, E, F**; from **C** it includes
only the accessories the target character does **NOT** own (per its bible entry).

```
A · STYLE DRIFT      cross-stitch / embroidery / diamond-painting, 3D render / CGI, photograph,
                     flat minimal vector, watercolour, anime, airbrush, glossy plastic
B · OFF-MODEL (all)  fingers / hands with digits, realistic anatomy, glossy cartoon "Pixar"
                     eyes, two matching bead eyes (must be button + bead), wrong eye-count,
                     missing the big button-X eye, mirrored eye side, fur, teeth / tongue,
                     extra limbs, melted / asymmetric body
C · ACCESSORIES      wings, horns, tail, halo, top hat, cape, flower petals, dollar sign,
   (forbid unless    third eye — forbid each UNLESS this character's bible entry lists it
    the char owns)   (keep wings for Upy, petals for Flopo, $/cape for Luka, horns/tail for Tuli)
D · TEXT             misspelled / garbled Cyrillic, gibberish or decorative floating letters,
                     Latin / English text, blurry / melted typography, duplicated words, any
                     text not in the brief
E · ANACHRONISM      modern logos / brands, smartphones, contemporary clothing, non-Soviet
                     iconography, 4- or 6-point stars (Soviet star = 5-point), malformed
                     hammer-and-sickle
F · ARTEFACTS        watermark, signature, artist mark, frame cropping the headline, low-res
                     mush, jpeg artefacts, duplicate or conjoined character
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
- `posters/_refs/` — the **reference-image library** (USER-SUPPLIED, version-controlled): 1–2
  approved "golden" posters as the style anchor + the character model-sheet (`engendros®`
  group sheet / per-boss cards). Attached to **every** prompt — the strongest consistency lever.
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

---

## Appendix A — Soviet propaganda design & psychology (research, sourced)

A sourced, prompt-engineering reference for generating Soviet-style propaganda posters
(1917–1991). Rules over prose. Cite-checked against art-history and archive sources (see
Sources).

#### A.1 What is ALWAYS present — the recurring grammar (and why it persuades)

| Device | Concrete rule | Why it works |
|---|---|---|
| **Strong diagonals / dynamic asymmetry** | Compose on a 30–60° diagonal axis; let figures, banners, rifles, shadows, and type all rake the same way. Avoid centered, static, horizontal/vertical balance. | Constructivists *rejected* static layout for diagonals to signal motion, forward progress. |
| **Monumental low / heroic camera angle** | Place the horizon low; shoot the hero from slightly below so they tower against open sky. | Low angle = monumentalization; the hero reads as larger-than-life, statue-like. |
| **Foreground hero + massed background** | One giant near figure (worker/soldier/mother) backed by a small, repeating *crowd* of marchers, bayonets, smokestacks, or grain. | Collectivism over the individual — the single body stands *for* the mass. |
| **Gaze toward the future** | Hero looks up-and-out toward the upper-right / off-frame, never down; or stares *straight at the viewer* (direct address). | Up-right = the "radiant future"; direct gaze + pointing finger personally indicts the viewer. |
| **Radiant light source / sunburst rays** | A rising sun or radial rays behind/above the hero, often gold/yellow; light comes *from the future*. | The sun = the dawning communist future; halos the hero as quasi-sacred. |
| **Limited high-contrast palette, RED-dominant** | Red = hero color; cream/ivory ground; black for line/type/enemy; gold/yellow for sun, wheat, emblems. 2–4 flat colors max. | Red = revolution/blood/Party; bold flat color gave instant legibility to a largely illiterate audience. |
| **Flat graphic vs. modeled rendering (era-dependent)** | *Constructivist (1917–c.1932):* flat geometric shapes, hard edges, photomontage, no gradients. *Socialist-Realist (1932+):* solid, modeled, idealized muscular bodies. Don't blend the two clumsily. | Two official aesthetics; Socialist Realism = "realistic in form, socialist in content, optimistic in spirit". |

#### A.2 Core iconography & correct form
- **Hammer & sickle** — workers (hammer) + peasantry (sickle). Correct form: sickle's crescent on the *outside*, hammer crossing over it; gold/yellow on red.
- **Red star** — ALWAYS **5 points, point-up**. Party star sits *above* the hammer-and-sickle.
- **Wheat sheaves / grain** — plenty, the harvest, the peasantry; framing wreaths.
- **Gears, smokestacks, factories, turbines** — industrialization, the Five-Year Plan, the radiant future delivered.
- **Red banners / ribbons / flags** — Party & revolutionary blood; often the hero's red clothing *reads as* the banner.
- **Raised fist / pointing finger** — militant solidarity, the call, the indictment.
- **Marching crowds / forests of bayonets** — mass mobilization, the unstoppable collective.
- **Radiant sun / rays** — the communist future dawning. **Doves/olive (post-WWII)** — peace.
- **Archetypes** — muscular male **worker** (rolled sleeves, hammer), **peasant woman** (kerchief, sickle/sheaf), **Red Army soldier** (budenovka/steel helmet, red star), **Mother/Motherland** (Родина-мать). Always idealized, healthy, resolute. **Lenin/Stalin** — legitimizing portrait/silhouette, haloed by rays or crowd.

#### A.3 Typography
- **Authentic forms:** heavy **geometric/grotesque sans-serifs** and **bold slab/blocky** letters; condensed, oversized, "letterform word-monuments." Mix sizes/weights for dynamism.
- **Cyrillic, not Latin** — Latin text is an instant anachronism/tell.
- **Set type on the diagonal**, varied in scale and color, to amplify motion.
- **Placement:** short slogan as a **top banner** or **bottom ribbon/red bar**; key word blown up huge; secondary line smaller.
- **Slogans = short imperatives / accusatory questions** («Ты записался добровольцем?», «Родина-мать зовёт!», «Бей белых красным клином»).

#### A.4 Persuasion psychology → the device that delivers it
- **Heroic idealization** → low angle + muscular modeled body + upward gaze; workers always healthy & smiling.
- **Collectivism over the individual** → giant foreground figure standing for a small massed crowd.
- **The radiant future** → sunburst/rays + gleaming new factories behind smiling workers.
- **In-group glorification** → red, light, scale, upward energy reserved for "us."
- **Enemy as small / dark / grotesque / caricatured** → the foe is literally smaller, lower, black/grey, hunched, exaggerated; or an inert geometric mass being pierced/crushed (the red wedge vs. the white circle).
- **Simplicity + repetition** → 2–4 flat colors, one idea, one focal figure.
- **Emotional appeal / direct address** → eyes locked on viewer + pointing finger + accusatory question = personal guilt & duty.
- **Call-to-action imperative** → the slogan is a verb-command in the banner/ribbon.
- **Monumentalization** → statue-like framing, low horizon, figure breaking the top edge.

#### A.5 Style anchors — what to borrow
- **Rodchenko** — flat geometric photomontage, red/black/white, hard diagonals, type-as-architecture.
- **Mayakovsky & ROSTA Windows** — crude bold multi-panel clarity, flat poster-paint shapes, ultra-simple message.
- **Dmitri Moor — *Have You Volunteered?* (1920)** — stern single hero, red/black/cream, finger + eyes on viewer.
- **Viktor Deni — *Capital* (1919)** — savage class caricature; the enemy bloated & toppling.
- **Gustav Klutsis** — father of Soviet photomontage; multiplied hands/figures, muscular workers, gleaming machinery.
- **El Lissitzky — *Beat the Whites with the Red Wedge* (1919)** — geometric abstraction as politics; aggressive red wedge into inert white circle, diagonal type.
- **Iraklii Toidze — *The Motherland Calls!* (1941)** — Socialist-Realist maternal patriotism; forward-gazing woman, red dress = banner, raised hand, restrained red/black/white.
- **Socialist Realism (1934+)** — solid idealized bodies, optimistic, legible, polished heroic finish.

#### A.6 ACTIONABLE checklist (apply per poster)
**ALWAYS:** (1) make **RED** dominant + only cream/ivory, black, gold; (2) **2–4 flat colors**, high contrast, no muddy gradients (unless Socialist-Realist modeling); (3) build on a **bold diagonal**; (4) **low/heroic angle**, low horizon, hero breaks top edge; (5) **single idealized hero** + small massed crowd; (6) gaze **up-and-out** or **straight at viewer**, consider pointing hand/raised fist; (7) **radiant sun/rays**; (8) **Cyrillic** heavy bold/slab caps, oversized key word; (9) slogan as **top banner / bottom red ribbon**, short imperative/question; (10) **enemy smaller/lower/darker/grotesque** or pierced geometric mass; (11) correct emblems (5-point star point-up, hammer-over-sickle gold on red); (12) pick **one era and commit**; (13) keep it **simple & monumental**.

**NEVER:** Latin text / modern fonts / lowercase script / post-1991 or Western imagery; star with ≠5 points or point-down; garbled/mirrored hammer-sickle; pastel/desaturated/mushy palette or soft airbrush glamour; centered static symmetry; photoreal/3D/anime/comic finish, drop shadows, bevels, glossy gradients; weak/tiny/buried slogan; swastika or non-Soviet flag on the hero side.

**Common FAILURE modes:** anachronism (modern clothing/tech, Latin lettering); wrong emblem (6-point/point-down star, reversed hammer-sickle, other-communist variants); mushy palette; weak slogan placement; static composition; style collision (flat Constructivist + photoreal in one image).

**Sources (Appendix A):** Comrade Gallery (Definitive History; Decoding Symbols; Fonts & Typography) · Royal Academy "Five things designers owe to Russia" · Mew Design Constructivism guide · Peachpit Constructivist typography · creativepro Russian Constructivism · DailyArt "Red Wedge" · Heritage Images (Moor) · Wikipedia (Hammer & sickle; Red star; Klutsis) · ICP (Klutsis) · ROSPHOTO (Photomontage) · Agenda.ge (Motherland Calls).

---

## Appendix B — Cyrillic / azbuka handling (research, sourced)

> **Hard rule for this harness:** treat GPT-image / DALL·E-class models as *unreliable* Cyrillic
> typesetters. Use them to bake **only short, locked, high-frequency headlines** — and even then
> **verify every glyph**. For anything that must be correct on ship, generate with **blank banner
> zones** and **composite the Cyrillic yourself** (§B.2). The model's failure mode for Russian is
> *homoglyph substitution* (drawing Cyrillic shapes with Latin glyphs) plus dropped diacritics
> (§B.4).

#### B.1 Tactics to maximise correct baked-in Cyrillic (priority order)
1. **Keep the string SHORT — headline ≤ 3–4 words, ideally 1–2.** One headline per poster. No paragraphs, no body copy, no fine print.
2. **Quote the exact text, demand it verbatim, in ALL CAPS** ("render this text exactly, no extra or altered characters"). All-caps also matches Soviet convention and avoids worse-rendered lowercase Cyrillic.
3. **Spell tricky words letter-by-letter in the prompt**, naming the *Cyrillic* letters: `"НАУКА" (Н, А, У, К, А)` — discourages Latin fallback.
4. **Prefer COMMON, high-frequency words** (СЛАВА, МИР, ТРУД, РОДИНА, ЗА) over rare/long compounds (СОЕДИНЯЙТЕСЬ, КОММУНИЗМА) — rare words garble.
5. **Make the headline LARGE & dominant.** Small/secondary text is where mangling concentrates → omit it and composite (§B.2).
6. **State placement + type style as constraints** ("bold condensed sans-serif headline in white, centred on the red banner").
7. **Repeat the exact quoted string 1–2×** (headline instruction + letter-by-letter); don't over-repeat.
8. **Attach a reference image carrying the same text** ("match the lettering shown in the reference") — copying beats inventing.
9. **Use `quality: high`** whenever text is in frame.

**Realistic expectation:** even so, a single generation of one short Russian word is frequently wrong. **Generate a batch (n ≈ 4–8), verify char-by-char (§B.4), cherry-pick.** Budget ~25–50% clean-hit on 1–2 common words, lower for longer. If zero pass → fallback §B.2. **Never ship a baked Cyrillic headline unverified.**

#### B.2 Reliable fallback — blank-banner + composite (default for guaranteed-correct text)
Generate the poster with **empty text zones** ("a large **blank red banner** with **no text**", "an **empty white ribbon scroll**", "completely blank, no writing, no symbols" — cherry-pick if the model scribbles fake letters), then typeset real Cyrillic yourself (Canvas 2D `fillText`, SVG `<text>` + `@font-face`, or `node-canvas`/`resvg`/`sharp`): uppercase, generous tracking (~0.05–0.12em), skew/perspective to the banner plane, subtle ink-bleed/paper-grain to sit in the print. This is the **only path that guarantees** correct glyphs, kerning, and ё, and unlocks period faces the model can't draw.

**Recommended fonts** (Cyrillic coverage + license + vibe):

| Font | License | Vibe / use |
|---|---|---|
| **Oswald** | OFL | **Workhorse condensed grotesque** — default Soviet-poster headline (Cyrillic added 2023+) |
| **PT Sans / PT Sans Narrow / PT Serif** | OFL | Authentic Russian text; *Narrow* for condensed heads, *Caption* for small print |
| **Russo One** | OFL | **Heavy geometric display** — big bold blocky titles |
| **Stalinist One** | OFL | Decorative Soviet-themed display — accent only, sparingly |
| **Cuprum** | OFL | Condensed semi-narrow — secondary slogans / sub-heads |
| **Fira Sans / Condensed** | OFL | Clean condensed headline alt to Oswald |
| **Evolventa** | GPL v2 + LPPL (copyleft) | **Futura-like Constructivist geometric** caps |
| **Rubik / Rubik Mono One** | OFL | Heavy rounded-slab blocky headers |
| **ParaType Rodchenko** | **Paid** (MyFonts/Adobe) | **THE canonical avant-garde Constructivist face** — buy a license to ship |
| **Ruslan Display** | OFL | Old-Slavonic ustav — church/old-Russia, **NOT** Soviet; avoid for propaganda |

**Licensing rule:** ship **OFL** faces by default; **Evolventa** is fine but **copyleft**; **Rodchenko / ParaType / Adobe** faces are **paid** — don't redistribute as static webfonts without a license.

#### B.3 Vocabulary bank — locked, verified headline strings (spelling + ё checked)
| Cyrillic | Translit | English |
|---|---|---|
| СЛАВА ТРУДУ! | Sláva trudú! | Glory to labour! |
| МИР · ТРУД · МАЙ | Mir · Trud · Maj | Peace · Labour · May |
| ПЯТИЛЕТКУ — В ЧЕТЫРЕ ГОДА! | …v chetýre góda | Five-Year Plan in four years! |
| КТО НЕ РАБОТАЕТ, ТОТ НЕ ЕСТ | … | He who does not work shall not eat |
| ПЛАН — ЗАКОН! | Plan — zakón! | The plan is law! |
| ТРУД — ДЕЛО ЧЕСТИ | … | Labour is a matter of honour |
| ПРОЛЕТАРИИ ВСЕХ СТРАН, СОЕДИНЯЙТЕСЬ! | … | Workers of all countries, unite! |
| СЛАВА КПСС! | Sláva KPSS! | Glory to the CPSU! |
| НАРОД И ПАРТИЯ ЕДИНЫ | … | The people and the Party are united |
| ВПЕРЁД К ПОБЕДЕ КОММУНИЗМА! | … | Forward to the victory of communism! |
| СЛАВА ВЕЛИКОМУ ОКТЯБРЮ! | … | Glory to Great October! |
| МИРУ — МИР! | Míru — mir! | Peace to the world! |
| НЕТ ВОЙНЕ! | Net voyné! | No to war! |
| РОДИНА-МАТЬ ЗОВЁТ! | Ródina-mat' zovyót! | The Motherland calls! |
| ЗА РОДИНУ! | Za Ródinu! | For the Motherland! |
| НИ ШАГУ НАЗАД! | Ni shágu nazád! | Not a step back! |
| ВСЁ ДЛЯ ФРОНТА, ВСЁ ДЛЯ ПОБЕДЫ! | … | Everything for the front, for victory! |
| НЕ БОЛТАЙ! | Ne boltáy! | Don't chatter! (loose lips) |
| БУДЬ НА СТРАЖЕ! | Bud' na strázhe! | Be on guard! |
| СЛАВА СОВЕТСКОЙ АРМИИ! | … | Glory to the Soviet Army! |
| СМЕРТЬ ФАШИЗМУ! | Smert' fashízmu! | Death to fascism! |
| НАУКА, ЗНАНИЕ, ПРОГРЕСС | … | Science, knowledge, progress |
| СЛАВА СОВЕТСКОЙ НАУКЕ! | … | Glory to Soviet science! |
| НАУКА — НАРОДУ! | Naúka — naródu! | Science to the people! |
| ЗНАНИЕ — СИЛА | Znánie — síla | Knowledge is power |
| СЛАВА ПОКОРИТЕЛЯМ КОСМОСА! | … | Glory to the conquerors of space! |
| УЧИТЬСЯ, УЧИТЬСЯ, УЧИТЬСЯ! | … | To learn, learn, learn! (Lenin) |
| СЛАВА КОЛХОЗНОМУ ТРУДУ! | … | Glory to collective-farm labour! |
| ХЛЕБ — РОДИНЕ! | Khleb — Ródine! | Bread to the Motherland! |
| ДЕТИ — НАШЕ БУДУЩЕЕ | … | Children are our future |
| БУДЬ ГОТОВ! ВСЕГДА ГОТОВ! | … | Be ready! Always ready! (Pioneer) |

#### B.3b Slogan grammar mini-guide (author NEW slogans safely)
- **«СЛАВА + dative» (the dominant pattern).** Praised noun → dative; adjective agrees:
  masc `-у/-ю` (труд→**ТРУДУ**, Октябрь→**ОКТЯБРЮ**), fem `-е/-и` (наука→**НАУКЕ**, Родина→**РОДИНЕ**, армия→**АРМИИ**), plural `-ам/-ям` (народы→**НАРОДАМ**, покорители→**ПОКОРИТЕЛЯМ**). Adjective: **СОВЕТСКОЙ** науке, **КОЛХОЗНОМУ** труду, **ВЕЛИКОМУ** Октябрю. → `СЛАВА + [adj-dative] + [noun-dative]!`
- **«ЗА + accusative» (for / in defence of):** **ЗА РОДИНУ!**, **ЗА МИР!**
- **«НЕТ + dative» (no to X):** война→**НЕТ ВОЙНЕ!**
- **«X — Y» dative-of-destination (give X to Y):** ХЛЕБ — **РОДИНЕ!**, НАУКА — **НАРОДУ!**
- **Imperative (2nd-pl):** stem + `-йте/-ите` (+ refl `-сь`): **СОЕДИНЯЙТЕСЬ!**, **БУДЬ ГОТОВ!**
- **"Let us…" (1st-pl perfective):** **ВЫПОЛНИМ** план!, **ДАДИМ** стране хлеба!
- **Nominal equation, em-dash = "is":** ЗНАНИЕ — СИЛА; ПЛАН — ЗАКОН.
- **Style:** ALL-CAPS, heavy `!`, separate triads with a middle dot/hyphen (МИР · ТРУД · МАЙ).
- **ё note:** ё is officially optional and period posters often printed Е for Ё — *pick one rule and enforce it in the composite* (recommend: keep ё canonical in the bank; if you want the vintage look, deliberately flatten ё→Е, never leave it to the model's accident).

#### B.4 Letterforms AI commonly mangles + the verify pass
**#1 failure: Latin-homoglyph substitution** — Cyrillic shapes built from Latin glyphs. Audit look-alikes (Cyrillic→wrong Latin): **Н→H, Р→P, С→C, В→B, М→M, Т→T, А→A, О→O, Е→E, К→K, Х→X, У→Y, З→3**. Count strokes/serifs, not just silhouette.

**High-risk glyphs:** **Й vs И** (breve dropped; И flips to Latin N), **Я** (→ Latin R), **Ж** (most-mangled, loses symmetry), **Д** (→ Latin A / dropped feet), **Б/В/Ь/Ъ** confusion, **Г** (→ r/F), **Ф** (bowls merge), **Щ vs Ш / Ц** (bottom-right tail dropped or spurious), **Ч** (→ digit 4), **Ы** (gap lost), **ё dots** (dropped), **З vs Э**.

**Verify pass (every baked headline):** (1) zoom text region to ≥100%; (2) char-by-char vs locked string (count, no dropped/extra); (3) homoglyph check (each letter is the Cyrillic form); (4) high-risk audit of {Й Я Ж Д Б/В Г Ф Щ/Ш Ц Ч ё З/Э Ы}; (5) ё policy; (6) **fail → reject** (regen or composite §B.2). No partial passes.

**Sources (Appendix B):** OpenAI GPT-image prompting cookbook · godofprompt DALL·E-3 text guide · promptingguide 4o image-gen · ParaType/PT Fonts (OFL) · Cyreal Oswald · Evolventa (GPL+LPPL) · Russo One / Ruslan Display / Fira Sans (Google Fonts) · ParaType Rodchenko (Adobe, paid) · Comrade Gallery (Soviet typography) · RISD Russian-posters collection.
