# TRACKER — T-62 díl po dílu

Stav každého dílu. Workflow viz `CLAUDE.md §3`. Pořadí viz `CLAUDE.md §4`.

**Stav:** ⬜ todo · 🔨 building · 👀 review (čeká na Tomáše) · ✅ approved · ⏸ blocked

Reálné složky `parts/NN_nazev/` se tvoří on-demand, když na díl dojde řada
(z `parts/_TEMPLATE/`). Tady je jen plán + stav.

---

## Skupina 1 — Running gear (pojezd)

| # | Díl | Stav | Zdroj rozměrů | Pozn. |
|---|---|---|---|---|
| 01 | Hnací kolo (sprocket, záď) | ⬜ | katalog/manuál | L+R zrcadlo |
| 02 | Napínací kolo (idler, čelo) | 👀 | blueprint+MiniArt | **v1 REVIEW.** Litý dvojitý „pinwheel" spider: 12 swept paprsků, kulový náboj+šrouby, kovový obruč (bez gumy), Ø~0.54. Čeká OK (počet paprsků? castellated okraj?). L+R zrcadlo |
| 03 | Pojezdové kolo #1 | ✅ | Ø 0.81 m | **APPROVED (Tomáš 2026-06-07).** Reálný T-62 dvojité kolo: 5 klíčových dírek + 5 dírek v žebrech (klokované), kulatá kupole pod lemem, lem:guma 1:2.5, spojený barel, 128px atlas. Pipeline dokázána. |
| 04 | Pojezdové kolo #2 | ⬜ | Ø 0.81 m | |
| 05 | Pojezdové kolo #3 | ⬜ | Ø 0.81 m | |
| 06 | Pojezdové kolo #4 | ⬜ | Ø 0.81 m | velká mezera před ním |
| 07 | Pojezdové kolo #5 | ⬜ | Ø 0.81 m | nejblíž zádi |
| 08 | Článek pásu (1 ks, k instancování) | ⬜ | rozteč 0.137 m | 97 článků/pás |
| 09 | Pás L (sestava) | ⬜ | šířka 0.58 m | obtočení kol |
| 10 | Pás R (sestava) | ⬜ | | zrcadlo |

> **BEZ podpěrných kladek** (return rollers) — T-62 je nemá. Rozestupy kol: #1-2-3 blízko,
> velká mezera ke #4 a #5. LEVÝ bank posunut +105 mm vzad.

## Skupina 2 — Hull (korba)

| # | Díl | Stav | Zdroj | Pozn. |
|---|---|---|---|---|
| 20 | Vana korby (dno + boky) | ⬜ | délka 6.63 m | |
| 21 | Glacis (horní čelo) | ⬜ | 100 mm @ 30° | |
| 22 | Spodní čelní deska | ⬜ | 55° od svislé | |
| 23 | Záďová deska | ⬜ | sklon 2° | |
| 24 | Motorová paluba | ⬜ | sklon 3.25° | mřížky/žaluzie |
| 25 | Blatníky L+R | ⬜ | | |
| 26 | Externí nádrže (pravý blatník) | ⬜ | walkaround | |
| 27 | Zadní sudy (palivo) | ⬜ | | |
| 28 | Nezapadací kláda | ⬜ | | záď |
| 29 | Světlomety + řidičův průzor | ⬜ | | čelo |

## Skupina 3 — Turret (věž) — NEJTĚŽŠÍ
> 🏠 **Střecha:** fotky chybí → reference vezmeme z WT modelu v Blenderu (izolovat jen střechu věže,
> odsouhlasit rozmístění poklopů/ventilátoru/periskopů). DShK detail: `ref/walkaround/dshk_mount_detail_on-t55.jpg`.

| # | Díl | Stav | Zdroj | Pozn. |
|---|---|---|---|---|
| 30 | Litá kupole věže | ⬜ | R450/R750 čelo, R625/R700 bok | 🔒 ŠIROKÁ/PLOCHÁ "pánev" |
| 31 | Mantlet (štít děla) | ⬜ | | **plynule z lící, žádný schod** |
| 32 | Velitelská kopule (vlevo) + TKN-3 | ⬜ | | |
| 33 | Poklop nabíječe (vpravo) | ⬜ | | kruhový |
| 34 | DShK prsten (ball-race) | ⬜ | na poklopu nabíječe | yaw uzel |
| 35 | DShK lože / U-yoke | ⬜ | | gun přidán později |
| 36 | L-2 Luna IR světlomet | ⬜ | vpravo od děla | eleluje s dělem |
| 37 | Mířidla střelce (vlevo) | ⬜ | | |
| 38 | Ventilátor (kupole) | ⬜ | zadní-levá | |
| 39 | Vyhazovací port nábojnic | ⬜ | nízko zadní stěna věže | |

## Skupina 4 — Gun (115mm U-5TS)

| # | Díl | Stav | Zdroj | Pozn. |
|---|---|---|---|---|
| 40 | Hlaveň 115mm (bare, hladký vývrt) | ⬜ | tube 6050 mm L52.6 | BEZ thermal sleeve |
| 41 | Bore evacuator | ⬜ | OD 0.224, ~2/3 vpřed | |
| 42 | Ústí (muzzle empty) | ⬜ | centr Z 1.675 | rig pivot |

---

## Log
- 2026-06-07: Workspace vytvořen. Reference (WT glb, blueprinty, fotky) ztraceny vysypáním koše
  → dostáhnout on-demand. Manuály (katalog + opravárenský 1971) v `ref/manuals/`. Čeká se na
  zprovoznění Blender-MCP (restart session + Blender open) → pak start dílem **01 sprocket**.
- 2026-06-07 (pozd.): Reference doplněny. **MÁME:** WT model `ref/wt/t-62_war_thunder.glb` (22MB,
  měření only), 6 manuálů v `ref/manuals/` (katalog dílů **524 str** = TOP, opravárenský 1971,
  operátorský US-MI EN 145str, Skorobogatov 2017 RU text, TRADOC EN, článek EN). **NEMÁME:**
  walkaround fotky + blueprinty (dostáhnout u dílu). Bonus: Flan WW2 pack tanky jako STYLE ref
  v `ref/style-minecraft/` (decompile→GLB pipeline; IS-2 hotový).
- 2026-06-07 (večer): REFERENCE KOMPLETNÍ. 72 fotek + 6 blueprintů (+2 profily) + 9 manuálů + WT + style-target
  (peak + prompt). Přidáno 6 nových (Fotoref 2048, DShK detail, 2 boční profily, multiview line drawing, rostov).
  **Styl LOCKED na peak obrázek** (low-poly mesh + pixel-textura; CLAUDE.md §1). Napsáno PIPELINE.md + READINESS.md.
  **DOHODA:** střecha z WT modelu (v Blenderu), **start s KOLY** (road wheel = vertical-slice spike:
  geometrie+textura+rig+export+three.js → de-risk celé pipeline na 1 dílu). Čeká na: restart session +
  Blender open → smoke-test MCP → kolo.
- 2026-06-07 (noc, oprava reference): ⚠️ **`ref/walkaround/t-62_058/059/060.jpg` = kolo z T-55**,
  ne T-62! Muzejní T-62 (náš reálný základ) dostal při opravě jedno T-55 kolo. Správné T-62 kolo
  (Tomášovy fotky) = **dished disk, 6 velkých ledvinových otvorů, 6 širokých vystouplých paprsků,
  velký vystouplý kulový náboj** → uloženo do `ref/walkaround/CORRECT_roadwheel/`. První postavené
  kolo (T-55 typ) odsunuto do `easter-egg/t55_roadwheel/` jako easter-egg model (Tomáš). Kolo se
  staví ZNOVU správně, s důrazem na **3D hloubku** (dished + paprsky + náboj = reálná geometrie).
- 2026-06-07 (noc): **SMOKE-TEST + VERTICAL-SLICE SPIKE HOTOVÉ.** Blender-MCP z Claude Code funguje
  (Blender 5.1.2, běží jako macmini1 → žádný cross-account problém; screenshot tooly mají JSON bug →
  fallback `render_viewport_to_path`+Read). Postaveno pojezdové kolo #1 (`parts/03_pojezdove_kolo_1/`):
  `atlas.py` (pixel atlas) + `lib/facetlib.py` + `build.py` → WheelL1 121v/102f, origin=osa náboje,
  GLB export, načteno v three.js (`model/t62/viewer.html`), nearest pixel look + spin kolem lok. X
  ověřen. **CELÁ PIPELINE (geom+tex+rig+export) DOKÁZÁNA na 1 dílu.** Čeká approval gate od Tomáše.
- 2026-06-07 (noc, WT + v3 kolo): otevřen WT model v Blenderu, uložen jako `ref/wt/t62_wt_reference.blend`
  (interaktivní, gitignored) + vyseknut vzorek 1 kola `WT_KOLO_SAMPLE`. **WT stance opraven** (Tomáš):
  WT = dobrá inspirace TVARU, NE zdroj kót (CLAUDE.md §2/§6 upraveno). Kolo přestavěno v2→**v3 reálný
  T-62 DVOJITÉ kolo** (2 dished disky + středová mezera pro pás) + **viditelný olivový ocelový lem**
  zepředu (guma černá+užší; parade-paint detail, MINIARM ref) + dome náboj. 792v/638f, three.js spin OK.
- 2026-06-07 (noc): ✅ **PRVNÍ DÍL HOTOVÝ — pojezdové kolo #1 APPROVED Tomášem.** Po ~20 iteracích
  v živém loopu (build→render→Tomášova přesná zpětka→přegeneruj). Tomáš: „jsem nadšený, i překvapený
  po všech těch dnech kdy modely úplně suckly." Klíč = iterativní Blender-MCP loop, ne one-shot.
  Naučené reálné detaily kola zafixovány v parts/03/STATUS.md + notes.md. **Pipeline (facetlib +
  boolean keyhole + klokování + per-uzel materiály + atlas + GLB + three.js viewer) PROKÁZÁNA.**
  Další: sprocket / idler / kola #2-5 (reuse stejného postupu).
