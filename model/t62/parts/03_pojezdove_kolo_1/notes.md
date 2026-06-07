# notes — 03 pojezdové kolo #1 (WheelL1) — REÁLNÝ T-62 typ (v2, dished)

> Účel = de-risk celé pipeline na 1 levném dílu (READINESS §2): geometrie + UV + pixel
> atlas + nearest materiál + rig pivot + GLB export + prohlídka v three.js. Geometrie
> kola NENÍ finální approved tvar — to projde vlastním approval gate.

> ⚠️ **v1 byl ŠPATNĚ kolo (T-55 typ)** — fotky t-62_058/059/060 ukazují T-55 kolo, co muzejní
> T-62 dostal při opravě. v1 odsunut do `easter-egg/t55_roadwheel/`. **v2 = reálný T-62**
> (ref/walkaround/CORRECT_roadwheel/): dished web, 6 ledvinových otvorů, 6 vystouplých paprsků,
> velký vystouplý kulový náboj + šrouby. Klíč = **3D HLOUBKA modelovaná geometrií** (Tomáš).

## Rozměry (každý SE ZDROJEM — žádná halucinace)
| Rozměr | Hodnota | Zdroj | Conf |
|---|---|---|---|
| Průměr kola | 0.81 m (R 0.405) | CLAUDE.md §6 master tabulka | H |
| Počet kol/strana | 5, BEZ podpěrných kladek | CLAUDE.md §0/§6 | H |
| Šířka kola (depth podél X) | 0.16 m | **ODHAD** — ověřit v `katalog-uzlov-detaley-T62.pdf` | **L** |
| Náboj (dome) R / výška | 0.11 / 0.055 m | **ODHAD** z foto t-62_059/_060 (poměr k Ø) | **L** |
| Segmenty válce | 20 | stylová volba (low-poly faceted) | — |

⚠️ Šířka kola a rozměr náboje jsou ODHADY z fotek — před finálním approval dohledat
přesné kóty v katalogu dílů (sloupec „№ рисунка" → plate kola).

## Reference (přímo z workspace ref/)
- `ref/walkaround/t-62_059.jpg`, `t-62_060.jpg` — face kola: rubber tire, litý disk se 2 kruhy
  odlehčovacích otvorů, 12 radiálních žeber, centrální dome náboj + kruh šroubů.
- `ref/blueprints/t62_side-top_clean_1265.jpg` — silueta kola z boku (verify Ø/rozteč).
- `ref/style-target/t62_PEAK_style_target.png` — cílový styl (low-poly mesh + pixel textura).

## Tvar / poznámky (v2 — reálný T-62)
- Geometrie (407v/330f): rubber **tire** (tube prstenec, proud) + **dished web** (kužel, recessed
  dno = tmavé otvory) + **6 vystouplých paprsků** (box, radiálně) + **vystouplý kulový náboj**
  (cyl base + dome) + **6 šroubů**. JOIN do 1 rig-uzlu `WheelL1`.
- **Spoke/hole/náboj = REÁLNÁ 3D GEOMETRIE** (ne malované) — protože hloubka je u T-62 kola
  specifická (Tomáš). 6 otvorů = mezery mezi paprsky se tmavým dished dnem → čtou se hluboké.
- Atlas (`atlas.py`) je teď **radiálně koncentrický** (tire/web/náboj tint dle poloměru) → nese
  jen barvu/wear, úhlový detail nese geometrie. Žádný alignment problém.
- UV: planar projekce podél X. Origin = OSA NÁBOJE = (0,0,0), spin kolem lok. X (CLAUDE.md §5).

## Odchylky od reálu (a proč) / k doladění
- Hloubky (tire 0.14, dish 0.07, paprsek proud 0.05, dome bulge ~0.12) = ODHAD z fotky (conf L)
  → doladit kótu v katalogu u finálu.
- Otvory = mezery mezi 6 paprsky (ne přesně ledvinový tvar) — low-poly aproximace.
- ⚠️ **DŮLEŽITÉ (potvrzeno z WT modelu 2026-06-07): kolo je DVOJITÉ** — DVA dished disky zády
  k sobě s **MEZEROU uprostřed pro vodicí zuby pásu**. v2 modeluje jen JEDEN disk → **v3 musí mít
  oba disky + mezeru** (viz `ref/wt/wtw_top.png`/`wtw_q34.png` + `t62_wt_reference.blend` →
  `WT_KOLO_SAMPLE`). Vnější disk = velký vystouplý dome náboj; vnitřní disk = plošší montážní příruba.
- Náboj dome je možná lehce vyšší/špičatější než foto → příp. zploštit.
- WT vzor kola ≈ 6–8 paprsků/otvorů, dished, dome náboj — moje v2 (6/6) je ve správné rodině.
- ⚠️ **OCELOVÝ OKRAJ DISKU MUSÍ BÝT VIDĚT ZEPŘEDU** (Tomáš + MINIARM ref `t62_MINIARM_roadwheels_set.png`):
  z přední strany NENÍ jen černá guma — mezi gumou a paprsky je vidět **olivový (4BO) ocelový lem/okraj
  litého disku** (proud ocelový prstenec). Na něm se dělají přehlídkové nátěry → důležitý detail modelu.
  → v3: guma (černá, užší než celý okraj) + viditelný **ocelový rim ring olivový** + dished disk. Tj.
  guma NEsmí překrýt celý vnější okraj; ocel kouká.
- MINIARM set = „12 standard & 8 reinforced hub" → 2 typy náboje (standard menší dome / reinforced větší).
  Náš = standard. Vzor: vnější prstenec menších otvorů + 6 velkých ledvinových + dome náboj + kruh šroubů.

## PŘESNÝ VZOR z HQ 3D renderů (ref/walkaround/CORRECT_roadwheel/hq_3d_render/, 2026-06-07)
Nejlepší reference. Definitivní detail T-62 kola:
- **6 otvorů ve tvaru KAPKY/KLÍČOVÉ DÍRKY** — zaoblený bulb u vnějšího okraje, zúžení k náboji.
- **6 paprsků, každý s VYSTOUPLÝM středovým ŽEBREM** (litý hřbet po délce paprsku).
- **Náboj = NÍZKÁ zaoblená kupole + kruh ~8 šroubů** na přírubě (vnější strana). Vnitřní strana =
  montážní otvor + kruh děr (bez dome).
- **Guma ŠIROKÁ s TREAD bloky** (segmenty) po obvodu.
- **Dvojité kolo + středová mezera** (potvrzeno z `wheel_top_doubledisc.png`).

### v3 vs tento vzor (co opravit do v4)
- v3 otvory = klínové mezery → mají být **keyhole/kapka**.
- v3 paprsky = hladké boxy → přidat **středové žebro**.
- v3 náboj = vysoký špičatý dome → **nízká kupole + 8 šroubů**.
- v3 guma = hladká → přidat **tread bloky**.
- v3 dvojitý disk + mezera = ✅ OK.
⚠️ Pozn.: HQ ref je HIGH-POLY smooth; náš styl je LOW-POLY (peak) → zachytit ESENCI vzoru stylizovaně,
ne 1:1 hladkou repliku. Míru detailu potvrdit s Tomášem.

## v4 (2026-06-07) — SKUTEČNÉ otvory
Tomáš: otvory musí být OPRAVDU (vidět skrz), ne černá textura. Boolean díry do cone disku v Blenderu 5.1
KOLABOVALY (cone+EXACT solver → v_after=0, i po recalc normál; cube−cyl boolean ale funguje → problém
je cone). → PIVOT: disk postaven KONSTRUKČNĚ z reálných dílů (vnější ocelový prstenec + hub prstenec +
6 paprsků) → mezery mezi paprsky = 6 REÁLNÝCH průchozích otvorů. 1250v/1092f. three.js spin OK.
Hotovo: dvojité kolo+mezera · viditelný olivový ocelový lem · reálné otvory · paprsky s žebrem ·
nízká kupole+8 šroubů. K případnému doladění: tvar otvorů je teď obdélníkový → keyhole/kapka by chtěl
tvarované paprsky (užší u okraje); tread bloky na gumě zatím vynechány.
