# Co-op Voice Chat + Deterministic Field Radios — Design Spec

- **Date:** 2026-07-01
- **Status:** Design approved in brainstorming; pending spec review → implementation plan.
- **Branch:** `docs/coop-voice-radios`
- **Scope owner:** Tomáš (+ brother, co-op).

---

## 1. Vision

Add **live player voice** to co-op, in two layers modelled on the *Lethal Company / Tarkov* pattern but pushed to a **fully deterministic, physically-grounded analog radio simulation**:

1. **Proximity voice** — you hear teammates positionally in 3D: near = clear, far = quiet, behind a wall = muffled. Open-mic immersion, the horror/atmosphere backbone.
2. **Field radio (R-105D)** — a real tunable simplex FM manpack. Squadmates must **tune the same frequency** to talk over distance. Different groups can chat on different frequencies, isolated — but a third party can **hunt across the dial and eavesdrop**. Finding an unknown frequency is deliberately hard.

The radio is a **deterministic simulation**: who hears whom, and how clearly, is a **pure function of synced state** (each emitter's `freq`, `ptt`, `pos`, `power`, `battery`). No RNG. Every client computes identical audio, so audio routing needs **no host authority** — the host owns only physical state (battery). This is the core architectural principle.

A **unified emitter model + data-driven `RADIO_STATIONS` registry** means live players and future preset broadcasts (enemy chatter, airdrop beacons, numbers stations) share one code path — adding content later is adding data rows, not engine work.

---

## 2. Locked Design Decisions

| # | Decision | Locked value |
|---|---|---|
| 1 | **Audibility = 2 axes** | frequency detune (Δf) **and** signal strength (SNR) |
| 2 | **Near an unknown frequency** | analog bleed (faint, distorted) **+ heterodyne squeal** breadcrumb |
| 3 | **Dial numbers** | **exact** (tune 40.150 = exactly there); hunt-by-ear only for *unknown* frequencies |
| 4 | **Architecture** | unified **emitter** model + **`RADIO_STATIONS`** registry (freq→sound); preset stations deterministic via `worldclock`, **zero network bandwidth** (local assets, tuning-gated) |
| 5 | **Half-duplex** | transmitting = **deaf on the radio** (proximity voice still heard) |
| 6 | **Two transmitters at once** | **FM capture** (stronger by ≥ ~6 dB wins cleanly) **+ garble zone** within 6 dB (doubling) |
| 7 | **Range degradation** | driven by **terrain / obstruction** (underground / hills / buildings), **not** raw distance — because a real R-105D out-ranges every map |
| 8 | **Physical form** | **held handset** — weapon holstered while talking *and* tuning; manpack stays worn on the back |
| 9 | **Squelch** | **manual knob** (open = hunt through hiss; tight = only strong/clear signals) |
| 10 | **Battery (Phase 3)** | **swappable batteries as loot**; drains faster on TX; empty = radio silence |

### Proximity-voice sub-decisions (locked earlier)

- Activation: **open mic + VAD** by default, **push-to-talk** as a settings toggle.
- Spatial: **3D directional** (Web Audio `PannerNode`) **+ wall occlusion** (muffle through walls).
- **Opt-in**: enabled in the lobby (triggers the mic-permission prompt); off until the player opts in.
- HUD: "who's speaking" indicator, global mute key, per-player volume, master voice volume.

---

## 3. The Deterministic Audibility Model (core)

All rules are a **pure function of synced state** — no RNG, no host arbitration of audio.

### 3.1 Two independent axes

- **Axis 1 — Frequency detune `Δf`**: how far the listener's dial is from the emitter's frequency. Physical basis: the FM receiver's **IF passband**. On-frequency (within the clean-window half-width `TOL` ≈ **±8 kHz**) = clean; off-centre but inside the passband = weaker + distorted + a heterodyne beat; past the passband edge = **rejected → silence**.

  > **`TOL` vs decision 3 (exact numbers) — orthogonal, no contradiction.** Decision 3 makes the *readout truthful* (dial 40.150 → you are exactly on 40.150; we dropped the real R-105D's ±8 kHz readout *error*). `TOL` is a separate thing: the *physics* clean-window half-width. It is what makes "everyone dial 40.150" reliably clean — as long as two emitters are within `TOL` of each other, `Δf < TOL` → full clarity. Readout resolution (≈1 kHz) is finer than `TOL` (≈8 kHz), so a shared number always lands inside the clean window. `TOL` also sets *how precisely you must tune to cleanly eavesdrop an unknown frequency*.
- **Axis 2 — Signal strength / SNR**: `f(TX power, battery) − terrain obstruction`. Physical basis: FM's **threshold ("cliff") effect** — above ~20 dB clean, ~12–20 dB rising crackle, below the squelch level it cuts to silence. Crackle is a function of SNR.

The two combine: **effective SNR = raw SNR − detune penalty**. Both must clear the listener's squelch to be heard clearly.

> **Note on the two contexts.** *Proximity voice* is short-range **acoustic** — its "strength" axis is literal distance + wall occlusion via `PannerNode`/raycast (§5). *Radio* is long-range **RF** — its "strength" axis is TX-power minus **terrain** obstruction (§6, decision 7). Raw-distance path-loss is retained in the formula for completeness but is negligible at map scale for the radio; **terrain/underground is the dominant range gate.**

### 3.2 Derived quantities (per ordered pair emitter A → listener B)

```
txPowerW(A)  = A.radioPowerW * A.battery                 // battery scales power (Phase 3; =1 before then)
TxdBm(A)     = 30 + 10*log10(max(txPowerW(A), ε))        // 1 W ⇒ 30 dBm
pathLoss(d)  = L0 + 10*n*log10(max(d, d0)/d0)            // n≈3; negligible at map scale for radio
obstruct(A,B)= enclosure penalty in dB                   // 0 open-air; grows with mass around/above the RECEIVER (underground/bunker/cave). NOT a strict LOS cut — low-VHF diffracts over hills. Optional light hill term later.
RXdBm(A→B)   = TxdBm(A) − pathLoss(d) − obstruct(A,B)
SNR(A→B)     = RXdBm(A→B) − NOISE_FLOOR_dBm
Δf(A,B)      = |A.freq − B.freq|
```

```
detunePenalty(Δf):
   if Δf <= TOL:            return 0                              // dead-on (±8 kHz) → full clarity
   if Δf >= PASSBAND_EDGE:  return +Infinity                      // outside passband → rejected (gated by Rule A)
   else: return DETUNE_K * (Δf − TOL) / (PASSBAND_EDGE − TOL)     // linear ramp; also spawns a heterodyne beat tone ∝ Δf
```

### 3.3 Rule A — does B hear A at all? (gating)

A is an **audible candidate** at B iff **all** hold:

1. `A.ptt === true` — A is actually transmitting.
2. `B.ptt === false` — **B is deaf while keyed up** (half-duplex, decision 5).
3. `Δf(A,B) < PASSBAND_EDGE` — within the IF passband; otherwise filter-rejected → nothing.
4. `SNR(A→B) − detunePenalty(Δf) ≥ B.squelchLevel` — in range and the squelch is open. **`squelchLevel` is B's local, manually-set threshold (decision 9).**

### 3.4 Rule B — multiple transmitters at once (capture + garble, decision 6)

Let `S = { candidates passing Rule A at B }`, each with metric `M_i = SNR(A_i→B) − detunePenalty(Δf(A_i,B))`.

- `|S| === 0` → **silence**.
- `|S| === 1` → hear that one; quality from `M` (Rule C).
- `|S| ≥ 2` → sort by `M` desc; take `top`, `second`:
  - **Clean capture:** `M_top − M_second ≥ CAPTURE_DB` → hear **only `top`** (quality from `M_top`); weaker ones suppressed. Optional faint "someone doubling" texture.
  - **Contested (doubling):** `M_top − M_second < CAPTURE_DB` → **no intelligible audio** → garble/flutter output; `garble = 1 − (M_top − M_second)/CAPTURE_DB` (0 ≈ almost captured, 1 = dead heat). Heterodyne beat pitch ∝ Δf between the two loudest.
  - **Deterministic tie-break:** order by `(M desc, then lowest playerId)` so every client agrees. (In the garble zone the output is mush regardless; the tie-break only stabilises the computation across clients.)

### 3.5 Rule C — quality / crackle (deterministic)

```
clarity(snr, squelch) = clamp((snr − squelch) / (CLEAR_DB − squelch), 0, 1)
crackle               = 1 − clarity                         // hiss/clicks amount driven into the filter chain
```

- **Distance/terrain** feed crackle through `SNR` (via `obstruct`/`pathLoss`) → walking underground = rising crackle then a hard squelch cutoff (the FM "cliff").
- **Detune** feeds crackle through `detunePenalty` **and** adds a heterodyne beat whose pitch ∝ Δf; fades to silence at the passband edge.
- **Low battery** ⇒ lower `TxdBm` ⇒ effectively shorter range, same formula.

### 3.6 Tunable constants (start values; tuned in-game)

| Constant | Start | Meaning |
|---|---|---|
| `BAND_MIN / BAND_MAX` | 36.0 / 46.1 MHz | R-105D band |
| `TOL` | 8 kHz | clean-window half-width (≈ R-105D ±8 kHz readout precision); not a readout error — see §3.1 note |
| `PASSBAND_EDGE` | ~25 kHz | detune beyond which signal is rejected |
| `CAPTURE_DB` | 6 dB | capture margin (FM ~6 dB clean-capture; receiver capture ratios run 1–4 dB) |
| `CLEAR_DB` | 20 dB | SNR for full clarity |
| `SQUELCH` default | ~9 dB | default manual squelch threshold (player-adjustable) |
| `NOISE_FLOOR` | tuned | RF noise floor |
| `radioPowerW` | 1 W | R-105D TX power |
| `n` (path-loss exp) | 3 | negligible for radio at map scale |

---

## 4. Unified Emitter Model + `RADIO_STATIONS` registry

Everything on the air is an **emitter** with one interface:

```js
// conceptual shape
{
  freq,          // MHz
  transmitting,  // bool (players: PTT; stations: schedule)
  pos,           // world position, or null = omnipresent/global
  power,         // watts
  source,        // how to get the audio (see below)
}
```

Two source kinds, both fed through the **same** audibility model (§3):

1. **Live (player):** audio = a **WebRTC MediaStreamTrack**; `pos` = player position; `transmitting` = holding PTT.
2. **Preset station (future):** audio = a **local sound asset**; `pos` = fixed or global; `transmitting` = always/scheduled. **Playback offset = a function of the synced world clock** (`worldclock.js`) → deterministic, every client hears the same thing, **zero network bandwidth** (the asset is local; tuning just gates it).

**`RADIO_STATIONS` registry** — a data table in the style of `WEAPONS` / `ITEM_DEFS`. Adding content later is adding a row:

```js
{ freq: 44.200, sound: 'buzzer', pos: null, power: 5, schedule: 'always' }
```

The engine supports stations **from day one**; the registry ships **empty** (players-only). Enemy chatter / airdrop beacons / Shilka / the Buzzer become data rows later (§13, §14) with **no engine change**.

---

## 5. Phase 1 — Proximity Voice (foundation)

The core everything else reuses. One mic per player, meshed over WebRTC; each remote's stream is rendered positionally.

- **Capture:** `getUserMedia` with `echoCancellation`, `noiseSuppression`, `autoGainControl`. Opt-in; permission prompted in the lobby. Fail = voice simply off, game unaffected.
- **Activation:** open mic with **VAD** (RMS gate on `track.enabled` → saves bandwidth + DTX). Settings toggle → **push-to-talk** with a bindable key.
- **Per-remote graph:** `MediaStreamSource → PannerNode (pos = RemotePlayer world pos, listener = camera) → BiquadFilter (lowpass for occlusion) → GainNode → destination`. Attaches to the **existing `AudioContext` in `audio.js`** (no second context).
- **Occlusion:** each frame, raycast camera→remote against world `boxes` via `rayAABB` (util.js); blocked → lower lowpass cutoff + gain, smoothed with `damp` (no popping).
- **HUD/UX:** speaking indicator by nameplate + a small voice roster; global mute key; per-player volume; master voice volume; lobby **mic-test** (see your own level).

Deliverable: proximity voice working, verifiable on **2 physical PCs**.

---

## 6. Phase 2 — Field Radio (core)

Reuses Phase 1's transport entirely: the **same mic stream** feeds a second, non-positional **radio chain** on the receiving end. The only new networking is a tiny synced `{freq, ptt}` per player. So Phase 2 is **mostly game logic + audio graph, almost no new networking.**

- **Item:** held **R-105D handset** viewmodel; equipping holsters the weapon (decision 8). Manpack stays visually worn on the back.
- **Tuning:** exact numeric frequency readout. Coarse tune = mouse wheel; fine tune = hold a modifier + wheel. (Controls are proposals, tuned during implementation.)
- **Squelch:** manual knob control (decision 9).
- **Audibility:** the full §3 model — detune bleed + heterodyne squeal, capture + garble, half-duplex deaf-on-TX, squelch gating.
- **Radio filter chain:** bandpass ("radio" timbre) + SNR-driven crackle/hiss + heterodyne beat generator for detune/doubling.
- **Emitters:** each player is a live emitter; **eavesdropping** falls out of the model (tune to another group's frequency → hear them, faintly if slightly off).
- **Dual-hear:** if a teammate is both near **and** transmitting on your frequency, you hear them **twice** — live via proximity + the radio version. Intended, atmospheric.
- **Registry scaffolding:** `RADIO_STATIONS` present but empty.
- **Range:** minimal here — "underground = penalty" only; full terrain model is Phase 3.

Deliverable: squad radio + eavesdropping, verifiable on **2 physical PCs**.

---

## 7. Phase 3 — Sim Depth

- **Battery (decision 10):** swappable batteries as loot (an `ITEM_DEFS` entry, like ammo); drains, faster on TX; empty → radio silence. **Host-owned** physical state (the only host-authoritative part of the whole feature), synced like `pstate`.
- **Full enclosure range model:** compute `obstruct(A,B)` as an enclosure/depth metric — mass around/above the receiver (underground depth, building thickness) — beyond the Phase-2 binary underground flag; optional light hill-attenuation term. **Not** a strict line-of-sight cut (low-VHF diffracts over hills). Gives the radio a spatial/tactical dimension (go underground = lose comms = horror tension) and ties into the terrain/caves/bunker systems.
- **Polish:** tuning feel, squelch feel, station scheduling helpers.

---

## 8. Transport & Networking

- **Voice audio:** **full-mesh WebRTC media** — each pair of players holds one `RTCPeerConnection` carrying one audio track. The browser gives Opus, echo-cancel, noise-suppress, and jitter buffering for free. For ≤6 players the N² mesh is trivial. The host is **not** an audio hop.
- **Signalling over the active transport:** SDP/ICE ride the existing envelope `{t, d}` — via the PeerJS data channel in WebRTC mode, via the `LanNet` WebSocket relay in LAN/Hamachi mode. So voice works on **both** transports; on LAN the media flows P2P over the virtual LAN and only a few signalling messages touch the relay. **No audio bytes ever traverse the relay** (rejected: hand-rolling Opus + doubling host bandwidth).
- **Transports stay dumb pipes:** `net.js` gains new message *types* only; the voice logic lives in `voice.js`.

---

## 9. Co-op Determinism & Sync

- **Synced per player:** `radioFreq` and `ptt` (on change, tiny messages) + position (already broadcast via `xf`). Battery (Phase 3) is **host-owned**, synced like `pstate`.
- **Local-only (never synced):** the player's **squelch level** and their own tuning — they only affect *what that player hears*, so there is nothing to synchronise.
- **Audibility computed locally & identically** from synced state on every client → deterministic, no host arbitration for "who hears whom." This is why decisions 1–9 all reduce to pure functions.
- **Authority footgun guard:** the only host-authoritative addition is battery drain — it sits behind `hostSim = !mp.active || mp.isHost`. Everything else is deterministic-local by design.

---

## 10. Module Layout & Integration

- **New `src/voice.js` (`VoiceChat`):** mic capture; per-peer WebRTC media (PeerJS calls in WebRTC mode, hand-rolled `RTCPeerConnection` + relay-signalling in LAN mode); the Web Audio graph per remote (proximity chain **and** radio chain off the same stream); VAD; PTT; occlusion updates; the §3 audibility computation; the `RADIO_STATIONS` mixer.
- **`src/net.js`:** new message types for voice signalling (`vsdp`, `vice`) and radio state (`rfreq`, `rptt`). Pipes only.
- **`src/mp.js`:** `RemotePlayer` gains `radioFreq` / `ptt` fields; `VoiceChat` reads positions from `RemotePlayer` + local player.
- **`src/game.js`:** owns the `VoiceChat` instance; wires input (PTT, tune, squelch, holster toggle); calls `voice.update(dt)` in the loop.
- **`src/audio.js`:** reuse the existing `AudioContext`; add radio filter builders (bandpass, crackle noise, heterodyne beat).
- **New `src/radio.js` (or in `tuning.js`):** the `RADIO_STATIONS` registry + radio constants (§3.6).
- **Item/viewmodel:** the R-105D handset as a held item (build via the existing voxel/prop path) + holster interaction.
- **HUD (`ui.js` / `index.html`):** voice roster, speaking indicators, radio panel (freq readout, squelch, battery), mute.

---

## 11. UX / Controls (proposals — refined during implementation)

- **Proximity:** talk automatically (VAD) or hold PTT (setting). Mute key. Per-player volume in the roster.
- **Radio:** a key to raise/holster the handset (weapon down). While raised: wheel = coarse tune, modifier+wheel = fine tune, a key/knob for squelch, PTT to transmit. Numeric frequency readout on the handset.
- **Lobby:** enable-voice toggle (permission prompt), input-mode toggle (open/PTT), PTT key bind, mic device select, mic-test meter, master voice volume.

---

## 12. Testing — the 2-PC gate (sharp)

This feature **cannot be verified solo or headless** — it needs **two physical machines with microphones** to exercise mic capture, echo, NAT/TURN, latency, positional panning, occlusion, tuning, capture/garble, and squelch. This is the standard co-op "2-PC WebRTC test gate", intensified.

- Loopback / single-machine tests validate *plumbing* only (graph construction, formula outputs, message flow), **not** a real handshake.
- The lobby **mic-test** + voice roster double as live diagnostics.
- Each phase ships only after a real 2-PC session.

---

## 13. Future Migration — unify existing radio/music mechanics

**Not now — later, once the new system runs.** The unified emitter model + `RADIO_STATIONS` is deliberately the abstraction that today's ad-hoc radio-ish systems should migrate onto, so the game ends with **one coherent frequency world** (the same dial that finds your squad finds the music stations and the Buzzer) instead of parallel systems. Candidates to rework onto `RADIO_STATIONS`:

- The diegetic **Radio building** (real stations + SovietWave easter egg, co-op sync).
- **ФОНОТЕКА + gramophone** (Soviet "Spotify" + 3D gramophone) and the **procedural music** system.
- The **Soviet radio broadcast** synth in `audio.js`.
- The **IL-76 airdrop** radio supply signal.
- The **walkie / R-105D** currently visual-only on the courier Engendro.

Each migration is its own small follow-up; this spec only commits to **not blocking** it (uniform emitter interface, data-driven registry, world-clock-deterministic playback).

---

## 14. Out of Scope / Future Content (registry rows, not engine work)

From the "who's on the air" exploration, deferred to later data-only additions once the core runs:

- **Enemy / faction chatter** on hidden frequencies (intel, horde warnings, creepy numbers-station voice) — the courier Engendro already carries an R-105D.
- **Objective frequencies** — airdrop beacon you must find to locate/claim the drop; Shilka / command orders on a channel. (This is where the "airdrop = find-the-frequency minigame" and the "radio in the Shilka" ideas land.)
- **Ambient lore stations** — UVB-76 "Buzzer", numbers stations, for atmosphere.

Each is a `RADIO_STATIONS` row + an asset; the deterministic model already covers jamming, eavesdropping, and capture between players and stations uniformly.

---

## 15. Open Tunables (resolved in-game, not blocking)

Exact dB thresholds, `PASSBAND_EDGE`, `DETUNE_K`, `NOISE_FLOOR`, proximity falloff distance, VAD sensitivity, battery drain rates, terrain-obstruction penalty curve, tuning wheel sensitivity, radio filter voicing.

---

## 16. Open Design Decisions & Late Resolutions (2026-07-01 audit)

A "what isn't clearly predefined?" review pass surfaced the following. Resolutions are folded into the sections above; this is the audit trail.

### Resolved

- **Terrain/range model = enclosure backbone** (not LOS raycast, not full Fresnel). `obstruct` grows with mass around/above the *receiver* (underground/bunker/cave). Phase 2 = binary "underground → heavy penalty" (analog ramp at entrances); Phase 3 = enclosure depth + optional light hill term. Rationale: at 36–46 MHz low-VHF, signals diffract over hills, so enclosure/underground is the dominant honest effect; a strict line-of-sight cut would be unrealistically harsh outdoors.
- **Two-layer model confirmed.** Proximity = your natural voice, heard by nearby players **without any radio** (short-range, positional, wall-occluded — the horror layer, Phase 1). Radio = R-105D for distance (Phase 2+). Voice is NOT radio-only.
- **Voice × co-op life-states.** Living **and** downed players talk (proximity + radio; downed = dying words / "revive me"). **Permanently dead / spectating players are silent** to everyone (no relaying enemy positions from a spectator camera). Note: a future vision item turns a dead co-op player into a playable Engendro, which removes any need for a "dead chat" — that feature is **out of scope, not in the codebase; do not implement or search for it here.**
- **Enemies do not react to voice (v1).** Otherwise open-mic would punish stealth. Reserved as a future horror hook only.
- **Two distinct "transmit" concepts.** Proximity = open-mic / VAD (continuous, auto). Radio = **held PTT** (half-duplex). Holding radio-PTT also emits your natural proximity voice to nearby players (the dual-hear).

- **Frequency band = R-105D 36.0–46.1 MHz** (authentic; e.g. 40.150, 44.200). "105.100"-style numbers were illustrative only.
- **Radio ownership = lootable item.** The R-105D is scavenged (an `ITEM_DEFS` / loot entry), **not** standard-issue — early game is proximity-only until you find one, so long-range comms is an earned advantage and the squad has a "radioman". Thematic loot source: the **courier Engendro carries an R-105D on its back → drops a working set on death.** It is a normal inventory item (droppable / tradeable — hand it to the radioman).
- **Lobby voice = none.** Voice is **in-world only** (no Discord-style lobby chat; coordination is diegetic). Voice *setup* (enable + mic permission + self mic-test) lives in **Settings** and/or a lobby panel that plays back only your own level — no peer audio in the lobby.
- **Stated defaults (unvetoed):** squelch gates **radio reception only** (not proximity); nearby proximity voices simply **mix** (no capture — capture is an RF-only effect); **one radio monitors one frequency at a time** (simplex); a found radio starts on a default frequency and the squad agrees a channel **in-world**; light transmit **sidetone**; a **downed** player can talk via proximity but **cannot operate the radio** (incapacitated).

### Transmission model — "is it like Discord rooms?" (clarification)

Conceptually **yes**: a frequency behaves like a shared channel/room — tune to it and you are "in the room"; anyone tuned there hears anyone transmitting; you can accidentally tune onto someone's frequency and eavesdrop. **But the mechanism is broadcast + local gate, NOT server-addressed rooms:**

- A player's mic stream flows to all peers over the WebRTC mesh continuously; "transmitting on 105.100" = broadcasting the tiny `{freq, ptt}` state alongside it. **Each receiver decides locally** whether it hears you (Rule A, §3.3) from its own tuning — the frequency is a *receiver-side filter*, not a routing address. This is exactly why eavesdropping and determinism both fall out for free.
- **Player audio is live-only:** a frequency "has audio on it" only while some player is actually keyed (PTT) there. There is no server-side room persisting audio for an empty channel.
- **Preset `RADIO_STATIONS` (future) ARE the always-on rooms:** a numbers station on 44.200 broadcasts continuously (deterministic from `worldclock`), so tuning in always catches it "even when no player is there" — the closest thing to a persistent Discord room, achieved with **zero bandwidth** (local asset, tuning-gated).

### Still open (decide at their phase)

- **Mesh roster distribution** (Phase 1, implementation): the host broadcasts the peer roster so clients can form the client↔client audio mesh (today clients connect only to the host). A to-do, not a design fork.
- **Minor tunables:** dual-hear echo voicing (the radio copy is bandpass + slight delay so it reads as a radio echo, not a flam), the found-radio default frequency, proximity falloff distance, PTT + handset control ergonomics, radio spawn frequency in `LootManager`.

## Appendix — Research sources (real-radio behaviour behind the model)

- FM capture effect — https://en.wikipedia.org/wiki/Capture_effect
- Simplex / half / full-duplex + PTT deafness — https://cavcominc.com/faqs/60/what-is-full-duplex , https://www.swatcom.com/simplex-half-duplex-full-duplex-explained/ , https://en.wikipedia.org/wiki/Duplex_(telecommunications)
- Heterodyne / doubling / "stepping on" — https://en.wikipedia.org/wiki/Heterodyne , https://forums.radioreference.com/threads/heterodyne-signal.448359/
- Squelch — https://en.wikipedia.org/wiki/Squelch , https://www.onesdr.com/squelch-in-radio-what-is-it-and-how-does-it-work/
- Procedure words / etiquette — https://en.wikipedia.org/wiki/Procedure_word
- FM threshold effect / SNR / quieting — https://www.psicompany.com/wp/2025/06/10/what-is-snr-signal-to-noise-ratio-and-how-does-it-affect-a-radio-call/ , https://twowayradiocommunity.com/fm-reception-squelch-quieting-capture-ratio/
- **R-105D** specs (36.0–46.1 MHz, FM, simplex, ~1 W, 6–10 km, **continuous dial, 50 kHz scale, ±8 kHz readout** — note: 25 kHz / 405 channels is the later R-105**M**) — https://en.wikipedia.org/wiki/R-105D , https://feldfunker-la7sna.com/radio_r105d.htm , https://www.greenradio.de/e_r105d.htm
