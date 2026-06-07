# CLAUDE.md — T-62 model workspace

Tento soubor se načítá automaticky při práci v `model/t62/`. Je to **jediná autorita**
pro to, JAK se T-62 staví. Když začnu nový díl, NEPOTŘEBUJU kontext z konverzace — vše je tady.

> **Jazyk:** Tomáš mluví česky. Odpovídám česky.

---

## 0) Co stavíme

Sovětský **T-62 obr. 1972** jako **named-node, riggovaný GLB** pro hru ENGENDROS PURGE.
Stavíme **inkrementálně — díl po dílu** (kolo po kolu, článek po článku, mantlet, kopule,
kulomet, optika zvlášť). Každý díl projde cyklem **build → verify → approval gate → další**.

**Kdo staví:** Claude Code přes **Blender-MCP** (`execute_blender_code` + `get_viewport_screenshot`).
Vidím viewport po každém kroku → iteruju živě. (To je ten rozdíl proti headless skriptům,
kde jsem viděl jen silhouetu a turret vyšel kulatý/malý.)

### ⛔ SUBJECT LOCK — stavíme JEN T-62, nikdy ne IS-2/KV/Sherman (NEGATIVE)
**Předmět modelu = výhradně T-62 obr. 1972.** Tvar / proporce / silueta / počet kol / dělo / věž
beru **POUZE** z T-62 zdrojů: `ref/walkaround/` (reálné fotky T-62), `ref/blueprints/`, `ref/manuals/`.

**IS-2, KV-1, Sherman, T-34, Tiger a ostatní Flan/Minecraft tanky** (`ref/style-target/inspiration/`,
`ref/style-minecraft/`) = **JEN stylový VZHLED** (low-poly + pixel-textura look). ❌ **NIKDY** od nich
neber geometrii, proporce, tvar věže, dělo, počet/rozteč kol, korbu. Jsou to JINÉ tanky.

**Kontrolní znaky T-62 (když něco z toho nesedí → stavím ŠPATNÝ tank, STOP):**
- ✅ **5** pojezdových kol / stranu · ❌ NE 6 (to je IS-2)
- ✅ **BEZ podpěrných kladek** (return rollers) · ✅ nerovnoměrné rozteče (#1-2-3 blízko, mezera ke 4,5)
- ✅ **115mm hladký vývrt** s bore evacuatorem ~2/3 vpřed · ❌ NE úsťová brzda (to je IS-2 122mm)
- ✅ litá „pánev" věž (široká/plochá) · ✅ DShK na kopuli nabíječe · ✅ L-2 Luna IR vpravo od děla
- ❌ peak `t62_PEAK_style_target.png` ber jako STYL+T-62 tvar, ale jeho **dělo je krátké** → naše delší (§6)

> Zkratka: **„Vypadá jako T-62 (znaky výše), kreslené ve stylu peak obrázku."** Když má 6 kol nebo
> úsťovou brzdu nebo kladky → je to omyl, vrať se k T-62 fotkám/blueprintu.

---

## 1) STYL — LOCKED (neměnit bez Tomášova svolení)

🎯 **CÍL = `ref/style-target/t62_PEAK_style_target.png`** (Tomáš: „peak 10/10"). Plná závazná
definice slovy = `ref/style-target/STYLE_PROMPT.md` (jeho přesný prompt). Shrnutí obojího:

**A) MODEL (geometrie) — voxel-inspired stylized LOW-POLY hard-surface:**
- primitive-based geometry, **boxy armor volumes**, faceted polygon planes, **flat shading**
- chunky proporce, **Minecraft-like proportions**, blocky stylizace, angular turret
- zjednodušené mechanické díly, **low-detail tracks**, čistá čitelná silueta
- ❌ NE realistický high-poly · ❌ NE smooth subdivision · ❌ NE plné voxel-kostky
  (= „normal low-poly mesh", ne kostičky, ale ani hladké)

**B) TEXTURA (diffuse atlas) — Minecraft-inspired / voxel-ish PIXEL ART:**
- **low-res ručně malovaný diffuse/albedo atlas**, nearest-neighbor (pixelované) filtrování
- pixel-art decals (hvězda, číslo „512"), **hard color blocks**, ploché malované stíny
- omezená vojenská zelená paleta (4BO) + **pixelovaný maskáč**
- ❌ NE PBR · ❌ NE procedural noise · ❌ NE smooth gradienty · ❌ NE foto-realistické materiály
- veškeré opotřebení / panel lines / značení / bláto / highlighty **namalované přímo do diffuse**
- ⚠️ pozn.: v peak renderu je **dělo trochu krátké** → naše = správná délka dle kót (§6)

> **Pozor — toto NAHRAZUJE dřívější „flat faceted BEZ textur".** Teď: low-poly mesh NESE TVAR,
> pixel-textura nese detail/značení/opotřebení. Obojí dohromady = ten peak look.

**C) KOMPLEXNÍ, NE primitivní** (Tomáš: „aby to nebyl primitivní model — komplexní chceme"):
- **Low-poly = STYL jednotlivého dílu** (faceted, zjednodušený, ne high-poly nýtky/kabeláž),
  **NE důvod vynechávat díly.** „simplified mechanical parts / low-detail tracks" z promptu se týká
  GEOMETRIE JEDNOHO dílu, ne počtu dílů.
- **Celek = KOMPLETNÍ a bohatý:** modeluj VŠECHNY fittingy co T-62 reálně má — celý DShK (lože, yoke,
  mířidlo) · L-2 Luna IR · TKN-3 kopule · mířidla střelce · ventilátor · vyhazovací port · externí
  nádrže · zadní sudy · nezapadací kláda · blatníky + bedny · vlečné háky · madla · světlomety ·
  **jednotlivé články pásu** · náboje/disky kol. **Nic nevynechávat.**
- **Reference úplnosti:** katalog dílů (každý fitting) + `ref/walkaround/` (co tam fyzicky je) +
  úroveň detailu `t62_PEAK_style_target.png`. Pro srovnání: Flan T-34/85 = 740 dílů, IS-2 = 509 —
  a pořád low-poly. **Tam míříme: stovky low-poly dílů = komplexní + stylizované.**

**D) CUSTOM MESH + ASYMETRIE** (Tomáš: „používat i custom mesh, tanky reálně nejsou symetrické"):
- **Nejsme omezení na parametrická primitiva.** Boxy/válce jsou základ, ale kde tvar není boxovitý
  (litá „pánev" věž, mantlet plynoucí z lící, šikminy glacisu, organické odlitky) → **ručně modelovaný
  custom low-poly mesh** (posun vertexů, vlastní polygony, bevely). Pořád low-poly/faceted styl, jen
  ne „krabice za každou cenu".
- **ASYMETRIE — nezrcadlit naslepo.** Levá ≠ pravá strana. Reálné T-62 odlišnosti k respektovat:
  externí **palivové nádrže na PRAVÉM** blatníku · **DShK na PRAVÉ** kopuli nabíječe · velitelská
  kopule + TKN-3 **VLEVO** · mířidla střelce vlevo · **levý bank kol posunut +105 mm vzad** · nářadí
  /madla/sudy/kláda rozmístěné asymetricky · odlitek věže nepravidelný. Mirror smí být jen LEŠENÍ,
  pak přidej reálné per-strana rozdíly z fotek/katalogu. Litý povrch věže = lehce nepravidelný, ne
  zrcadlově dokonalý.

### 🔒 silhouette_lock (klíčové — tady to minule padlo)
**Stylizace (facety/boxiness) je POUZE povrch, NIKDY silueta.** Obrys dílu musí sedět na realitu
na cm (blueprint + fotka). Minule turret padl, protože stylizace prosákla do obrysu.

### ♻️ Replikovatelnost (Tomášova bolest: generativně vyšlo 2× jinak)
Negenerujeme — **stavíme deterministicky v Blenderu**: pevné číselné parametry per díl (z manuálů)
+ **jeden autorský pixel-atlas** sdílený všemi díly. Stejný skript → stejný výsledek. Žádný náhodný
„AI vibe". Atlas + materiál nastav JEDNOU (nearest filtering, no PBR) a reusuj na všech dílech.

### 100% čerstvá geometrie
Žádné recyklované meshe. WT GLB se NIKDY neimportuje ani neshipuje (jen měření).

---

## 2) REFERENCE — hierarchie autority

1. **Manuály (`ref/manuals/`)** = #1 autorita pro ROZMĚRY + TVARY DÍLŮ. Reálné dokumenty (✅ MÁME):
   - `katalog-uzlov-detaley-T62.pdf` (**524 str**) — katalog uzlů a dílů. Tabulky (obozn./počet/hmotnost)
     **+ stovky rozkreslených plate-výkresů „Рис. N"** s číslovanými výnosy (např. Рис.113 = люлька/lůžko
     děla, str. 250). **Tabulky mají sloupec „№ рисунка" → křížový odkaz tabulka↔výkres.**
     👉 **Per-díl workflow: najdi díl v tabulce → „№ рисунка" → ten plate = tvar dílu s výnosy.**
   - `rukovodstvo-voyskovoy-remont-chast2-1971.pdf` — opravárenský manuál (řezy, rozměry)
   - `t62-operators-manual-US-MI-EN.pdf` (145 str, EN — popsané pohledy bok/čelo/záď, Fig 1-4/1-5…) ·
     `t62-skorobogatov-2017-RU.txt` · `t62-TRADOC-recognition-EN.pdf`
2. **Walkaround fotky (`ref/walkaround/`)** = ✅ MÁME **70+ full-res** (toadmanstankpictures + Fotoref
   2048 + ParkPatriot + rostov + DShK-mount detail `dshk_mount_detail_on-t55.jpg`) ze VŠECH úhlů.
   = jak to vypadá v 3D na reálu; verify SILUETY proti TĚMTO + blueprintům.
   ⚠️ **STŘECHA chybí na fotkách** (fotograf se tam nedostal) → **roof reference vezmeme z WT modelu
   v Blenderu**: načíst `ref/wt/t-62_war_thunder.glb`, izolovat JEN střechu věže, zobrazit, odsouhlasit
   (WT jen tvarová nápověda na rozmístění poklopů/ventilátorů/periskopů — proporce pořád z blueprintu).
3. **STYLOVÝ CÍL (`ref/style-target/`)** = ✅ jak má VÝSLEDEK vypadat (viz §1):
   - `t62_PEAK_style_target.png` = **peak 10/10** (přímo T-62) + `STYLE_PROMPT.md` (závazná def. slovy)
   - `inspiration/` (KV «За Родину», Sherman) + `style-minecraft/is2-style-target/` (25 IS-2 in-game) +
     ostatní Flan tanky (decompile→GLB) = doplňková stylová inspirace stejné rodiny.
4. **Blueprinty (`ref/blueprints/`)** = ✅ MÁME ortho výkresy (verify SILUETY/sklonů proti TĚMTO):
   - `t62_4view_malginov_4000.png` (4000×2587, Malginov M1/35 — bok/čelo/půdorys/záď + 3/4 detaily)
   - `t62_side-top_clean_1265.jpg` (čistý bok + půdorys, ostré linie — nej pro overlay boku/shora)
   - `t62_line_drawing_multiview_001.png` + `profiles/` = 2 barevné boční profily (obr.1972 s DShK +
     raný 1960s BEZ DShK = jen variantní, naše = obr.1972). Profily = silueta + nátěr.
5. **WT GLB (`ref/wt/`)** = ✅ MÁME. **TVARY/proporce dílů jsou DOBRÁ INSPIRACE** (Tomáš 2026-06-07:
   „wt proporce nejsou nepřesné co se týče tvarů těch modelů, možná velikosti, ale modely jsou dobrá
   inspirace — ne zdroj pravdy, ale inspirace"). Tj.: ber WT jako **vizuální nápovědu tvaru dílu**
   (jak co vypadá v 3D, rozmístění), ale **PŘESNÉ KÓTY ber z manuálů/blueprintů** (ne z WT — velikosti
   můžou být off) a **WT nikdy neimportuj do výsledku** (stavíme 100% čerstvou geometrii).
   - `.blend` k prohlížení: `ref/wt/t62_wt_reference.blend` (celý model, díly = `Object_0..23`,
     pojezdová kola = `Object_16`; vyseknutý vzorek 1 kola = `WT_KOLO_SAMPLE`, oranžový).

> ✅ KOMPLETNÍ: reálné fotky + manuály (+ per-díl Рис. výkresy) + ortho blueprinty + WT + IS-2 styl.
> Nic dalšího stahovat netřeba — start díl 01.

### Pravidlo proti halucinaci
**Nevymýšlej rozměry.** Každý díl má v `notes.md` uvést SVŮJ zdroj rozměru (manuál str. X /
blueprint / fotka). Nejisté hodnoty označit `?` a zeptat se / dohledat. Žádný "tak nějak".

---

## 3) WORKFLOW na KAŽDÝ díl

Když začínám díl `NN_nazev`:

1. **Vytvoř složku** `parts/NN_nazev/` z `parts/_TEMPLATE/` (ref/ build.py notes.md STATUS.md).
2. **Reference:** dohledej/výřez z manuálu pro tento díl → `parts/NN_nazev/ref/`.
   Do `notes.md` zapiš rozměry + ZDROJ každého.
3. **Build v Blenderu** přes MCP. Postav JEN tento díl (origin v jeho rig-pivotu, viz §5).
4. **Verify — povinné, z očí (eye-level), ne z 3/4 nadhledu:**
   - `get_viewport_screenshot` z boku + zepředu + shora
   - overlay proti blueprintu/fotce (`lib/overlay.py`)
   - zkontroluj **siluetu** (nejdřív), pak proporce, pak faceting
5. **Ukaž Tomášovi** screenshot + krátký popis (rozměry, zdroj, čím se liším od ref).
6. **Approval gate:** Tomáš řekne `OK` / co opravit. Bez `OK` se NEPOKRAČUJE na další díl.
7. Po `OK`: zapiš `STATUS.md → approved`, export `parts/NN_nazev/out.glb`, update `TRACKER.md`.

**Ekonomie:** děláme díl po dílu schválně — chyba se chytí hned na dílu č.1, ne po celém tanku.

---

## 4) POŘADÍ stavby (viz `TRACKER.md` pro detail + stav)

1. **Running gear** (opakující se, definuje spodní siluetu): sprocket → idler →
   road wheels 1–5 (každé zvlášť) → track link → track run.
2. **Hull** (vana, glacis, spodní čelo, záď, motorová paluba, blatníky, nádrže, kláda, světla).
3. **Turret** (litá kupole = NEJTĚŽŠÍ → mantlet → velitelská kopule + TKN-3 → poklop nabíječe →
   DShK prsten + lože → L-2 Luna → mířidla → ventilátor → vyhazovací port).
4. **Gun** (115mm U-5TS hlaveň → bore evacuator → ústí).

---

## 5) RIG kontrakt (aby boss/drivable/wreck fungovaly ve hře)

Souřadnice **world/tank space**: forward = **+Z**, up = +Y, right = +X (1 unit ≈ 1 m).
Pozor: v glTF se Blender +Z mapuje jinak — řešit při exportu, ne v geometrii.

### Animace je PRVOTŘÍDNÍ — hierarchie se staví od začátku, nedá se „přidat potom"
Každá **animovatelná jednotka = vlastní pojmenovaný objekt s originem PŘESNĚ v pivotu** (empty jako
pivot + mesh pod ním je OK). **NIKDY nemerguj** animované díly do jednoho meshe kvůli „optimalizaci"
— kolo co je přimergované se nedá roztočit. Kategorie (Tomášovy: dělo / hull / pás L / kolo1 / kolo2…)
= uzly téhle hierarchie. V Blenderu navíc **Collections** per skupina (RunningGear_L/R, Hull, Turret,
Gun) kvůli přehledu.

```
T62  (root empty)
└─ Hull  (mesh + detail-fittings: blatníky, nádrže[PRAVÁ], sudy, kláda, světla, madla…)
   ├─ RunningGear_L:  SprocketL · IdlerL · WheelL1 WheelL2 WheelL3 WheelL4 WheelL5   (spin lok. X)
   ├─ RunningGear_R:  SprocketR · IdlerR · WheelR1..WheelR5                          (spin lok. X)
   ├─ TrackL · TrackR        (animace = UV-scroll diffuse, NE 97 fyzických článků — viz níže)
   └─ Turret                 (yaw kolem +Z → v glTF +Y) ; origin = STŘED prstence
      ├─ Gun                 (elevace kolem +X) ; origin = osa čepů (trunnion) → Muzzle (empty na ústí)
      ├─ CommanderCupola(L) · LoaderHatch(R)
      ├─ DShK_ring (yaw) → DShK_cradle (elev) → DShK
      └─ L2_Luna (elevuje s dělem — buď child Gun, nebo paralelně řízený)
```
- **Origin/pivot přesně:** kolo = osa náboje; věž = střed prstence (ne těžiště meshe); dělo = čepy;
  Muzzle empty = špička hlavně (pro tracery/efekty ve hře).
- **Levá/pravá = SAMOSTATNÉ objekty** (kvůli asymetrii, §1 D) — ne instance/mirror jednoho.
- **Pás (animace):** modeluj jako pásový mesh; pohyb = **posouvání UV diffuse** (scroll), rychlost
  svázaná s otáčením kol. (Fyzických 97 článků obtočených po křivce = jen pokud Tomáš výslovně chce —
  drahé na výrobu i runtime. Jednotlivé články se MODELUJÍ jako detail, ale animují scrollem.)
- **glTF export:** názvy + osy musí přežít (Blender Z-up → glTF Y-up řeší export). Po exportu
  **ověřit artikulaci v three.js** (turret yaw / gun elev / kola spin) — to je akceptační test rigu.

---

## 6) MASTER rozměry (1:1 cíle — ověřené z manuálu, conf vysoká)

| Rozměr | Hodnota |
|---|---|
| Korba délka | 6.63 m |
| Délka s dělem vpřed | 9.34 m |
| Šířka přes blatníky / přes pásy | 3.30 / ~3.22 m |
| Výška ke střeše věže / k kopuli | 2.248 / 2.40 m |
| Světlá výška | 0.43 m |
| Hmotnost | ~37 t |
| Prstenec věže | Ø 2.245 m |
| Pás: šířka / rozteč / článků | 0.58 m / 0.137 m / 97 |
| Rozchod pásů (CL ±) | 2.64 m (±1.32) |
| Kola | 5/strana, Ø 0.81 m, **BEZ podpěrných kladek** |
| Rozestupy kol | #1-2-3 blízko, velká mezera ke #4 a #5; LEVÝ bank +105 mm vzad |
| Glacis | 100 mm @ 30° od vodorovné |
| Spodní čelo | 55° od svislé |
| Dělo bore evac | ~2/3 vpřed; centr Z 1.675; evac OD 0.224 |
| Věž litá (plan radii) | čelo R450 vně / R750 vnitř; bok R625 / R700 |
| Dělo trunnion→ústí / tube | 4827 mm / 6050 mm (L52.6) |
| Sklon paluby / zádi / střechy věže | 3.25° / 2° / 0.5° vpřed |
| Věž+kopule nad palubou | 914 mm |
| Šířka korby u věže | 2760 mm |

### Lekce z minula (NEOPAKOVAT)
- **Věž = ŠIROKÁ/PLOCHÁ/DLOUHÁ "pánev na smažení"** (~75 % šířky korby, nízká střecha ~0.6 m).
  Mantlet **plynule navazuje z lící** — ŽÁDNÝ hranatý schod.
- **Verify z úrovně očí** proti blueprintu+fotce, NE z vysokého 3/4 nadhledu.
- WT = dobrá inspirace TVARU, ale **verify SILUETU/KÓTY proti blueprintu+fotce, NE proti WT overlay**
  (velikosti WT se můžou lišit → "95 % fialové na WT" tě svede; pravda na kóty = manuál/blueprint).
- Faceting moc hladký → **nízké segment-county**.

---

## 7) Soubory v této složce

- `CLAUDE.md` — tento soubor (styl + workflow + pravidla).
- `PIPELINE.md` — MECHANIKA: 3 invarianty, per-díl smyčka, fáze A/B/C, overlay lock, komplexnost.
- `READINESS.md` — ultra-kritický stav: co je neověřené, rizika, de-risk priority (číst před startem!).
- `TRACKER.md` — master tabulka všech dílů + stav.
- `ref/` — manuály / blueprinty / fotky / WT (jen měření).
- `lib/` — sdílené Blender helpery (facetlib, overlay, export).
- `parts/_TEMPLATE/` — šablona složky dílu; reálné `parts/NN_nazev/` se tvoří on-demand.
- `assembly/` — sestavené skupiny (running_gear / hull / turret / full).
- `out/` — finální GLB výstupy.
