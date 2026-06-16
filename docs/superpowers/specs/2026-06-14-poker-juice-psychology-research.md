# Poker Den — Juice, Animation & Gambling-Psychology Research

**Date:** 2026-06-14
**Author:** Claude (deep-research harness, 97 agents) for Tomáš
**Purpose:** Actionable design report to guide animation, game-feel, and UX work on the existing NL Hold'em SNG **poker den** (`src/poker-engine.js` / `src/poker-table.js` / `src/poker-ui.js`, see `2026-06-13-poker-texas-holdem-design.md`).
**Status:** Research synthesis. No game source files were read for this — it is pure literature/industry research. Codebase hooks reference features already shipped (showdown readout PR #64, `meta.bank` economy, `bestWave`/`bestScore` persistence).

> ⚠️ **Source-quality split — read this first.** The **psychology** findings rest on PRIMARY, peer-reviewed, top-tier sources (Princeton UP monograph; *Journal of Neuroscience*; *Addiction*; *Psychophysiology*; *The Neuroscientist*) with unanimous 3-0 adversarial votes → high-confidence, canonical. The **animation/juice** findings rest largely on BLOG / TRADE-PRESS / VENDOR-MARKETING sources, some with split 2-1 votes → strong design heuristics, **not proven laws**.
>
> ⚖️ **Ethical framing.** This report is partly a map of ADDICTION mechanics. Because the den spends real persistent `meta.bank` currency, several validated levers (near-miss dramatization, LDW-style celebration, anchored buy-in defaults, cash-out sludge) are **dark patterns**. The literature is presented so the team can deploy OR refuse them **knowingly** — not as an endorsement to maximize compulsion.

---

## Thesis (one paragraph)

Addictive engagement is **engineered, not accidental**, and rests on three transferable pillars: (1) a continuous **"one-more-hand" loop** where the act of play — not the payout — is the reward; (2) multi-channel **"juice"** during reveal/celebration moments that stacks animation + escalating numbers + screen effects + pitched audio; and (3) **reward-pacing** that softens variable-ratio volatility with guaranteed forward progress. For card/chip animation the best-supported levers are: handing reveal control to the player (the **squeeze** peel-the-edge), slow **staggered sequential scoring** (~300 ms/card) that builds anticipation and teaches, and **subtle physical realism** (card lift + thickness) — the deciding factor between "good" and "satisfying." The single most validated celebration recipe is **Balatro's**: sync rising audio pitch to escalating jumping numbers, layer screen shake + flip + particles + crisp chip SFX.

---

## A. Gambling psychology — WHY people replay (PRIMARY sources, high confidence)

### A1. The "machine zone" is the core compulsion loop — continuation, not payout
**Confidence: HIGH (3-0, ×3 claims).** Schüll, *Addiction by Design: Machine Gambling in Las Vegas* (Princeton UP, 2012, 15-yr ethnography). Verbatim: *"once in the zone, gambling addicts play not to win but simply to keep playing, for as long as possible"*; engagement is *"designed to meet the market's desire for maximum time on device"* (TOD). Corroborated by later "dark flow" work (Dixon et al. 2019; Murch & Clark 2021).
- **Domain caveat:** the "zone" is scoped to SOLITARY, CONTINUOUS machine play (slots/video poker). The den is MULTIPLAYER hold'em with social presence + skill → partial transfer.
- **Translation:** minimize dead time between hands; keep the next hand "one click away"; avoid forced full-screen interruptions; fast re-buy / fast deal.

### A2. Near-misses recruit win circuitry and scale with severity
**Confidence: HIGH (3-0, ×4 claims).** Clark et al. 2009 (*Neuron*, "Gambling Near-Misses... Recruit Win-Related Brain Circuitry"); Chase & Clark 2010 (*J. Neurosci.*, PMC2929454); Murch & Clark 2016 review (*The Neuroscientist*). Near-misses (objective losses just short of a win) trigger the **same ventral-striatum reward response as monetary wins**, increase motivation to keep playing, and the **midbrain dopamine response scales with gambling severity** (SOGS) — problem gamblers are neurologically MORE reactive.
- **Caveat:** near-misses are rated subjectively *less pleasant* than full misses — the validated part is the neural reward+motivation effect, not "feels nice."
- **Translation/ethics:** poker produces near-misses organically (flush misses on the river, bad beat). This is a potent lever — decide deliberately how much to dramatize (e.g., a tense river reveal) given real currency.

### A3. Losses-Disguised-as-Wins (LDW) — celebration, not money, is the addictive ingredient
**Confidence: HIGH (3-0, ×3 claims).** Myles, Carter, Yücel & Bode 2024 (*Psychophysiology* 61(6):e14541, PMID 38385660). An LDW = a payout LESS than the wager (a net loss) paired with celebratory audio-visual feedback. LDWs evoke a **stronger reward-positivity ERP than clear losses** — a neural reward signal for a net financial loss. Converges with Dixon et al. (players physiologically miscategorize LDWs as wins).
- **Caveat:** single experiment, n=32, measures a neural CORRELATE (RewP), not behavioral persistence → phrase as "a neural correlate consistent with reinforcement."
- **Translation/ethics:** the clearest dark-pattern juice mechanic. **Do NOT accidentally build one** — never celebrate a split pot or partial chip return with full win fanfare. Reserve the big celebration package strictly for genuine NET wins.

### A4. Variable-ratio + dopamine is the engine — but poker already has it
**Confidence: HIGH (3-0, ×2 claims).** Murch & Clark 2016; Linnet et al. 2011 (*Addiction*, PET): ventral-striatal dopamine release during gambling correlates with subjective excitement in pathological gamblers (r≈0.52), not in controls. EGMs deliberately combine VR schedules, near-misses, LDWs, illusion of control.
- **Translation:** poker's variable, skill-modulated payout schedule provides this loop **naturally**. **Do not add artificial slot-style VR mechanics.** The lever is reward PACING and the excitement cues (audio, shake, counter) attached to wins.

### A5. Soften volatility with guaranteed progress (retention is architected)
**Confidence: MEDIUM (3-0, ×2 claims).** Social-casino retention pairs chance-driven outcomes with **predictable, guaranteed benefits** (daily logins, streaks, tiered loyalty, XP/collection, gacha "pity" floors) so every session produces forward movement. (Blog source, but non-extraordinary; backed by Schüll 2012; Parke & Griffiths 2006/2007.)
- **Translation:** pair the volatile poker outcome (you can bust fast) with predictable progression — guaranteed end-of-session payout into `meta.bank`, runs/hands counters, best-finish records (`bestWave`/`bestScore` exist). Losing a tournament should feel like forward movement, not pure loss.

---

## B. Card & chip animation — WHAT to build (design heuristics, medium confidence)

### B1. The "squeeze" — hand reveal control to the player
**Confidence: MEDIUM (3-0).** Tactile peel/drag of a card edge so the player uncovers each card at their own pace. Mainstream 2-vendor pattern: Evolution "Baccarat Controlled Squeeze" + Iconic21 "Squeeze Baccarat" (*"peeling back an edge lets the player uncover each card at their own pace"*).
- 🔻 **Two stronger sub-claims were REFUTED 0-3:** that player-controlled pacing "recreates the signature tension," and that the slow pre-win reveal is "the specific source" of suspense. No empirical engagement/retention data; sources are vendor/trade-press.
- **Ship it** as an OPTIONAL player-controlled reveal on the player's own hole cards (and the river) — a feasible, well-precedented satisfying interaction, **not** the "tension engine."

### B2. Slow staggered sequential scoring (~300 ms/card) builds anticipation AND teaches
**Confidence: MEDIUM (2-1).** Balatro analysis: *"By showing each Joker trigger individually, players learn which combinations matter. This replaces a 10-page tutorial with 300ms of sequential animation."* Player threads: "watch it go… adds drama and suspense."
- **Caveat:** blog source; "replaces a tutorial" is hyperbole (Balatro still uses tooltips).
- **Translation:** at showdown, reveal community cards + each winning combination as a short left-to-right staggered sequence with a running pot/hand-rank readout — not an instant flash. Pairs with the **newbie showdown readout (PR #64)**.

### B3. Subtle physical realism is the "good" vs "satisfying" deciding factor
**Confidence: HIGH (3-0 for the realism sub-claim).** Auroratide: *"Subtlety is the difference between something feeling good and something feeling satisfying"* — tied specifically to **card lift + card thickness**. A card must be LIFTED to flip and has THICKNESS.
- **Translation (Three.js):** each flip = z-translate up → rotate → settle bounce; render perceptible card thickness/edge. Small detail, large payoff.

---

## C. The juice / celebration recipe (most validated single pattern)

### C1. Balatro's settlement-phase stack
**Confidence: MEDIUM (3-0 for the recipe).** *"Screen shake, card flip animations, exponentially jumping numbers, rising fire effects, and crisp chip sound effects combine to form an extremely efficient sensory stimulation package."*

### C2. Audio-visual dual-channel synergy — sync number-tick to audio pitch ⭐ (the "surprise" lever)
**Confidence: MEDIUM (3-0).** *"The frequency of the jumping numbers synchronizes with the pitch of the background audio. This audiovisual dual-channel synergy massively amplifies the satisfaction."* Concrete impl found independently: each card plays a rising note (C, D, E, F, G) with numbers ticking up. Backed by cross-modal perception research (congruent audiovisual stimuli improve presence/engagement).
- **Caveat:** blog sources; "measurably" slightly overstates (no controlled Balatro measurement).
- **This is the highest-ROI lever and the thing the user nearly missed:** the SOUND timed to the animation frame matters more than the animation alone. Cheap to build with the existing procedural Web Audio in `audio.js`.

### C3. Juice is the experience, not decoration
**Confidence: HIGH (2-1 stacking / 3-0 realism).** Multiple independent sensory channels (card anim, rolling counter, screen FX, particles, audio) stack; remove them all and you have "a spreadsheet / bare calculator." (Crosley; SSRN Rakić & Stoll "Hooking the Player on Juice: How Balatro Triggers Addictive Behaviour through Game Feel"; arXiv "Designing Game Feel.")
- **Caveat:** "multiplicatively" is a rhetorical analogy, not a measured law; over-juicing critiques exist (juice must complement, not replace, core mechanics).

### C4. Chip-placement randomization (the user's specific question)
No direct academic source measures messy-vs-neat stacks, **but** it falls under B3 (subtle physical realism) + C3 (multichannel juice). **Recommendation: randomize.** Perfectly aligned stacks read "digital/spreadsheet." Apply per-chip jitter (rotation ±2–4°, XZ position ±few mm), uneven stack heights, an occasional "splashed" pot (loose heap toward table center rather than neat columns), and pitch-randomized chip-clink SFX (anti-repetition).

---

## D. UX/UI principles

- **Reward pacing > raw volatility** (see A5). Guarantee some forward progress per session.
- **Open question:** how to add guaranteed/predictable progression to a **winner-takes-all SNG** with a *physically conserved* chip economy without diluting the gambling stakes (participation reward vs. pure zero-sum pot transfer). Design call, unresolved by research.

---

## E. Ethical guardrails — dark-pattern taxonomy (deploy or refuse KNOWINGLY)

**Confidence: HIGH (3-0, ×3 claims).** Newall et al. 2025 (*Addiction*, doi:10.1111/add.70085, open-access PMC12426356). Three-tier taxonomy: **sludge** ⊂ **dark patterns** ⊂ **dark nudges**.
- **Sludge:** frictions blocking beneficial actions — e.g. instant deposits but withdrawals delayed several days + a prominent "reverse your withdrawal" button (now banned in GB). → **Do not put friction around cashing winnings back to `meta.bank`.**
- **Anchoring (empirically potent, RCT n=1,731, BIT/bet365):** unrealistically high pre-filled/suggested deposit-limit values led to higher limits than a plain text box (text box → ~46% lower limits vs. high-preset dropdown). → **Default buy-in suggestions WILL anchor wager-sizing. Don't anchor high.**
- **LDW / near-miss dramatization:** see A2/A3 — levers exist, choose intensity deliberately; big celebration only for net wins.

---

## F. Actionable implementation backlog (Three.js poker den), ranked by impact/cost

1. **Audio-frame sync** *(highest ROI)* — chip-clink exactly on chip-settle frame; pot-counter roll-up with a rising pitch sweep; rising notes (C-D-E-F-G) on staggered showdown. Reuse `audio.js`. (C2)
2. **Staggered showdown reveal** ~300 ms/card, left→right, with running rank readout — extends PR #64. (B2)
3. **Card lift + thickness flip** — z-up → rotate → settle bounce; perceptible card edge. (B3)
4. **Pot-win juice package** — rolling counter + pitch sweep + screen-shake pulse + chip burst. **NET wins only.** (C1, A3)
5. **Chip randomization** — per-chip rotation/position jitter, splashed pot, pitch-randomized clink. (C4)
6. **Optional squeeze peel** on hole cards + river (drag the corner). (B1)
7. **"One more hand" loop** — no forced interruptions, next hand one click away, fast re-buy. (A1)
8. **Guaranteed progress** — end-of-session payout, hands/runs counters, best-finish records. (A5)

---

## G. Open questions (design calls, NOT resolved by research)

1. Does the squeeze reveal preserve its tension/satisfaction in a digital/multiplayer context, or only in live-dealer video? Needs an in-game A/B test (manual squeeze vs auto-flip) measuring hands-played + self-reported satisfaction.
2. Optimal reveal/scoring pacing **for multiplayer** — Balatro's ~300 ms and TOD-maximization come from solitary play; in a 6-max SNG, too-slow staggered reveals could frustrate other waiting players. Per-player anticipation vs. table tempo is unresolved.
3. Which guaranteed/predictable progression layers fit a winner-takes-all SNG with a conserved chip economy without diluting the stakes?
4. Where exactly to draw the ethical line on validated dark patterns (anchored buy-in defaults, near-miss dramatization, celebration intensity) — a values/scope call for the owners.

---

## H. Refuted claims (deliberately NOT built into recommendations)

| Claim | Vote | Source |
|---|---|---|
| Player-controlled squeeze pacing "recreates the signature tension" of live baccarat | 0-3 | next.io / Iconic21 |
| The slow pre-win reveal is "the specific source" of suspense lost in RNG | 0-3 | next.io / Iconic21 |
| Social casinos use a variable-reward daily-login bonus (amount varies) to drive habit | 0-3 | yogonet |
| "Win → colorful celebratory graphics + audio" generic social-casino prescription | 1-2 | yogonet |

---

## I. Sources

**Primary (peer-reviewed / academic):**
- Schüll, *Addiction by Design* — https://press.princeton.edu/books/paperback/9780691160887/addiction-by-design
- Newall et al. 2025, *Addiction* (dark-pattern taxonomy) — https://onlinelibrary.wiley.com/doi/full/10.1111/add.70085
- Murch & Clark 2016, *The Neuroscientist* — https://journals.sagepub.com/doi/10.1177/1073858415591474
- Chase & Clark 2010, *J. Neurosci.* — https://pmc.ncbi.nlm.nih.gov/articles/PMC2929454/
- Myles et al. 2024, *Psychophysiology* (LDW ERP) — https://onlinelibrary.wiley.com/doi/10.1111/psyp.14541

**Secondary / blog / trade-press (design heuristics):**
- Balatro design analysis (Crosley) — https://blakecrosley.com/guides/design/balatro
- Balatro visual packaging (Medium) — https://medium.com/@yyh19971004/balatro-design-analysis-visual-packaging-and-interactive-feedback-cc6fa6a65370
- Balatro shaders in Unity (80.lv) — https://80.lv/articles/balatro-s-card-movements-shaders-recreated-in-unity
- Realistic flip animation (auroratide) — https://auroratide.com/posts/realistic-flip-animation/
- 12 principles for game animation — https://totter87.medium.com/12-principles-for-game-animation-a9137ef44345
- Card-game juice — https://medium.com/@Rushyo/card-game-juice-vibe-coding-1st-hour-574bf0b8ff0b
- Squeezing juice out of game design (GameAnalytics) — https://www.gameanalytics.com/blog/squeezing-more-juice-out-of-your-game-design
- Iconic21 Squeeze Baccarat — https://next.io/news/b2b-news/iconic21-launches-squeeze-baccarat/
- Baccarat squeeze ritual (livedealer) — https://livedealer.org/blog/2012/04/the-baccarat-card-sqsueeze-ritua
- Social-casino UX lessons (yogonet) — https://www.yogonet.com/international/news/2025/09/24/115461-ux-lessons-from-social-casino-interfaces-what-game-designers-can-learn
- Player psychology & retention in social casinos (raceintospace) — https://www.raceintospace.org/player-psychology-and-retention-systems-in-social-casino-design/
- Poker game UI/UX design (itch.io devlog) — https://dharmik-goyani4017.itch.io/poker-game-ui-poker-ui-design-project/devlog/1029238/designing-the-poker-game-uiux-

**Run stats:** 3 angles · 17 sources fetched · 73 claims extracted · 25 verified · 21 confirmed · 4 killed · 97 agent calls.
