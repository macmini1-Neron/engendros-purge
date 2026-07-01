# ENGENDROS — MVP Vertical Slice + «ПОЛИГОН» (mechanics sandbox)

**Status:** v0.2 DRAFT — první sub-projekt white paperu, k review. Feel-first. **«ПОЛИГОН» = creative mód s Minecraft-style konzolí (Fáze 0).**
**Datum:** 2026-06-11 · **Větev:** `feat/playable-demo`
**Nadřazené:** [white paper](2026-06-11-engendros-white-paper.md) §12 (MVP) · [design-research](2026-06-11-engendros-design-research.md) (zákony + red-flagy) · `RESULTS-demo.md` (co engine demo už umí)

> **Vůdčí princip:** game design je empirický — *zábavu/feel nenavrhneš na papíře.* Postavíme nejmenší hratelnou věc a ZAHRAJEME si ji. Engine základ už běží (`?map=demo`), takže nestavíme od nuly — **rozšiřujeme a vylaďujeme feel.**

---

## 0. Co MVP dokazuje (sázka)

**Jedna otázka:** *Sedne jádrová 30s smyčka jako napjatý survival-horor* — pár chytrých, uncanny plyšových Engendros + survival váha (krvácení) + syrový tón — **a baví to?** Když ano, celá vize má nohy. Když ne, učíme se to levně, dřív než postavíme obsah a meta.

To je přímý překlad zákonů z research dosálku: **L-08** (30s smyčka musí bavit izolovaně), **L-14** (juice/feel = největší ROI), **L-02** (cute vzhled musí být čitelně hrozba → kompenzovat chováním+zvukem), a duše hry **„depth via code"**.

---

## 1. Dvě vrstvy MVP

**A) «ПОЛИГОН» — creative mód / zkušební střelnice** *(dev/admin nástroj)*
Ultra-mini lokalita = **plný creative mód na VŠE**: obsahuje (postupně, jak přidáváme) **všechny mechaniky i všechny assety**, vše **zapínatelné** (hlad/radiace/krvácení/létání/teleport/god…), různé terény. Páteří je **in-game konzole s Minecraft syntaxí** (viz §3). Sem se každá mechanika/asset dostane *první*, osahá se feel, a teprve **ověřená** se promuje do hratelného slice. (Pattern = váš `destructlab` + viewer, ale in-game a univerzální.)

**B) Hratelný vertical slice** *(reálný kus hry)*
Z ověřených mechanik složená nejmenší **hratelná smyčka**: 1 biom (lesní step) + 1 boss-komplex + jádrová smyčka (deploy → roam+sběr → boj → boss → náhrobek/reset). Staví se v pořadí **feel → loot → boss → meta**.

> Tok: *postav mechaniku v «ПОЛИГОН» → feel-test → promuj do slice.* Greybox-first, jak se dělají hry.

---

## 2. Reuse-mapa (co engine demo UŽ dává — nestavíme znovu)

Z `RESULTS-demo.md` (vše ověřené, `?map=demo`):
- Deterministický **terén** + walkable slopes + chunked mesh (`terrain.js`, `terrain-mesh.js`).
- **Les** (destruktivní/hořlavé stromy, groundcover) (`forest.js`).
- **Destrukční core** — per-ráže, materiálové tiery, HE breach, APFSDS, debris (`destruct.js`).
- **Šíření ohně** (ember-chain, umírá na kameni) (`fire.js`).
- **Destruktivní budova** (breach segmenty, skleněné tabule) (`demobuilding.js`).
- **Nepřátelé/spawny/loot na terénu** (`enemies.js`, `loot.js`).
- **Fixed-step simclock** (`simclock.js`).
- **Co-op-safe destrukce + oheň** (host-auth event+seed).

→ **MVP staví NAD tím:** smart-AI vrstva, survival/medicína, cute-horor (model+chování+zvuk), kontaminace, loot-tabulky, lobby-meta (rank/náhrobek), boss-instance, reinfestace, tón/světlo pass.

---

## 3. «ПОЛИГОН» + konzole (Fáze 0 — páteř)

**In-game konzole = univerzální test-rozhraní.** Místo bespoke tlačítek pro každou mechaniku: **jeden command systém**, do něhož se každá mechanika i asset **sám zaregistruje**. Plná **Minecraft věrnost vč. @-selektorů** (`@p`/`@e`/`@a`/`@s`) — ať sedí svaly z hraní.

Souřadnice **už existují** (3D hra, open-world rovina x,z + SpatialGrid) → `/tp` funguje hned; přidá se **F3 debug overlay** (coords / biom / směr / seed).

```
/tp [cíl] <x y z>                    /summon <engendros|prop> [x y z] [count]
/give <item> [count]                 /effect <cíl> <bleeding|radiation|…> [dur] [amp]
/gamerule <hunger|radiation|bleeding|fly|noclip|god|infiniteAmmo> <on|off>
/time set <day|night|dusk|HHMM>      /weather <clear|rain|fog|snow|storm>
/gamemode <creative|survival>        /threat <0–5>   (test eskalace tieru)
/kill [cíl]   /clear   /spawnpoint   /seed   — cíle přes @p @e @a @s jako v MC
```

**Architektura:** `src/console.js` = parser + **registr příkazů** (`registerCommand(name, schema, fn)`) + `@`-selektor resolver. Každý systém i každý **harness-asset** (modelgen / buildgen / voxel-weapon registry) se zaregistruje → `/summon` umí cokoliv, co umíme vyrobit. Konzole je primárně **dev/admin** (v reálné hře skrytá/uzamčená).

Cíl: za 10 s nasimulovat libovolnou situaci (`/summon`, `/effect`, `/gamerule`, `/tp`) a posoudit feel — **nástroj, kterým pak stavíme a testujeme Fáze 1–4.**

**Test props v «ПОЛИГОН»:** budova, stromy, oheň, loot kontejnery, vozidlo, různé terény — vše přes `/summon` nebo přepínače.

---

## 4. Fáze 1 — FEEL PROTOTYP (jádro)

**Postavit v «ПОЛИГОН», pak zahrát.** Tři kusy:

**(a) Pár chytrých uncanny Engendros** — 1–3 nepřátelé, ne horda:
- **Smysly, ne vševědoucnost** (H7): loví **sluchem + zrakem**; hluk (střelba, běh) a světlo tě prozradí; dá se férově oklamat (kryt, ticho, tma). „Skoro jsem unikl" > „vždy mě najde".
- **Uncanny chování** (cute-horor aktivace, H8): plyš *vypadá* roztomile, ale *jedná špatně* — špatné načasování pohybu, otočení hlavy moc daleko, kontextově nevhodné/tlumené zvuky, **zvuky vycpávky/stehů** při pohybu. Hráno **vážně**.
- Základní pathing/obchvat na terénu (máme `pathing.js`).

**(b) Survival váha — krvácení + ošetření** (první z pilíře, další se přidají v «ПОЛИГОН»):
- Zásah → **krvácíš v čase** → musíš se **aktivně ošetřit** (tourniquet/obvaz; ošetřování tě zpomalí/zranitelní). Vytváří rozhodnutí pod tlakem.
- Hook do `player.js` (survival timery už tam jsou) + HUD.

**(c) Tón / světlo pass** — syrový, beznadějný; cute = jen Engendros. Světlo, mlha, zvuk dělají tíseň. Ultra-těžké i ve dne; noc = snížená viditelnost.

### Success rubrika Fáze 1 (jak poznáme, že to sedne — PLAYTEST)
- [ ] Engendros **čteš jako hrozbu**, ne komedii (uncanny chování+zvuk funguje).
- [ ] **Děs z nejistoty** — nevíš přesně, kde nepřítel je; smysly AI vytvářejí napětí (kradeš se, zhasínáš).
- [ ] **Krvácení vytváří rozhodnutí** („ošetřit teď a být zranitelný, nebo doběhnout do krytu?").
- [ ] **30s smyčka baví izolovaně** (L-08) — i v prázdném «ПОЛИГОН» je střet sám o sobě napjatý.
- [ ] **Juice** (L-14) — střelba/zásah/smrt mají hmatatelný feedback.

→ Gate: dokud rubrika nesedne, **NEstavíme loot/boss/meta.** Ladíme feel.

---

## 5. Build sekvence (feel-first, s gate kritérii)

| Fáze | Co | Gate (pak dál) |
|---|---|---|
| **0. KONZOLE** | `console.js` (parser + registr + @-selektory, plná MC syntax) + F3 coords/debug + gamerule toggly. «ПОЛИГОН» creative shell. | `/tp /summon /effect /gamerule` fungují — spawn/efekt/teleport na povel |
| **1. FEEL** | pár chytrých uncanny Engendros + krvácení + tón (stavěno+testováno **přes konzoli**) | Success rubrika §4 sedne |
| **2. LOOT** | Scavenge tabulky (tag lokace×kategorie), prázdno=feature, váhový limit + batoh, anti-frust podlaha léků; náhrobek stats-screen + rank XP animace (H3) | Sběr je napjatý a smysluplný; náhrobek čte „záznam ne trest" |
| **3. BOSS** | 1 bezešvý instancovaný boss-komplex (GTA-SA dveře→aréna), 1 boss-golem | Boss fight funguje, vstup bezešvý, vozidlo se nedostane |
| **4. META** | Lobby = rank-gated obchod + loadout; reinfestace+threat-tier (eskalace chováním, ne HP — H5); kontaminace «пух»; lehké škálování intenzity dle počtu (H2) | Celá smyčka deploy→…→reset běží; lore-kodex+rekordy přežijí (H6) |

Každá fáze: postav v «ПОЛИГОН» → feel-test → promuj do hratelného slice → commit.

---

## 6. Architektura — kam nové systémy v modulech patří (lehký pass)

| Systém | Kam (existující modul / nový) |
|---|---|
| Smart-AI (smysly/chování/stavy) | rozšířit `enemies.js` (Enemy/EnemyManager) + `pathing.js`; zvážit `ai.js` pro senses/behavior FSM |
| Cute-horor model + chování + zvuk | `enemies.js` (`buildEngendro` redesign) + `audio.js` (per-typ tells, vycpávka/stehy) |
| Survival/medicína (krvácení→končetiny) | `player.js` (timery) + nový `survival.js` (rány/ošetření) + HUD v `ui.js`/`index.html` |
| Kontaminace «пух» | nový `contamination.js` (zónové pole, à la `fire.js`) + survival hook |
| Loot scavenge tabulky | `loot.js` (`ITEM_DEFS`, `LootManager`) + tag-based spawn (lokace×kategorie) |
| Lobby-meta / rank / obchod / náhrobek | `inventory.js` (Armory) + `economy.js` + `ui.js` (náhrobek screen) + `localStorage` meta |
| Reinfestace / threat-tier | `waves.js` nebo nový `worldstate.js` |
| Boss-instance (GTA-SA) | nová větev ve `world.js`/`game.js` (load/unload instancované scény) + level-design |
| **Konzole + příkazy** | **nový `src/console.js`** (parser + registr příkazů + @-selektor resolver); systémy/assety se samy registrují |
| Coords / F3 debug overlay | `ui.js`/`index.html`; pozice z existujícího world-space (x,z + SpatialGrid) |
| «ПОЛИГОН» sandbox / creative | větev `?map=demo`/`poligon` ve `world.js`/`game.js` + admin ovládání v `admin.js`; gamerule toggly |

> **Žádný rewrite enginu** (YAGNI) — držíme voxel + stávající modulovou architekturu + host-auth co-op (vše nové za `hostSim`).

---

## 7. Mimo MVP scope (až po ověření feelu)

Celá velká mapa (2500×2500) — MVP žije v 1 biom-regionu · víc biomů/POI · plný roster Engendros (MVP = 1–2 typy) · víc bossů · vozidla (palivo/oprava) · zranění končetin a kontaminace jako *plné* systémy (v MVP základ/«ПОЛИГОН») · PvP · počasí jako plný systém · ekonomika balanc (jen funkční, ne vyladěná).

---

## 8. Definition of Done (celé MVP)

Hratelný `?map=demo`-slice, kde: nasadíš se → roam+sběr → **napjatý boj s chytrými uncanny Engendros** (krvácení tě nutí rozhodovat) → najdeš boss-komplex → bezešvě vejdeš → porazíš boss-golema → reinfestace eskaluje chováním → smrt = **náhrobek** + rank progrese; co-op-safe; **a po zahrání to BAVÍ a děsí.** «ПОЛИГОН» zůstává jako admin test-bed pro další iterace.

---

## Otevřené body (k MVP)
- Přesný **vzhled redesignovaného základního Engendros** (cute plyš, ale jaký) — vlastní mini-brainstorm/modelgen.
- Konkrétní **zvuky tells** (vycpávka/stehy) — audio návrh.
- Které POI v biom-regionu hostí **boss-komplex** a jak vypadá jeho instance.
- Tuning čísel (krvácení rychlost, dosah smyslů, agrese) — empiricky v «ПОЛИГОН».
