# PIPELINE — jak konkrétně stavíme T-62

Doplněk k `CLAUDE.md`. Tohle je MECHANIKA: co přesně se děje u každého dílu, čím se řídí pořadí,
a jak je zaručeno že (a) to vyjde jako T-62, (b) ve správném stylu, (c) **replikovatelně**.

## 3 invarianty (proč to vyjde správně a pokaždé stejně)
1. **Deterministické skripty.** Každý díl = `parts/NN/build.py` (Blender Python) s ČÍSELNÝMI
   parametry z manuálů. **Skript je zdroj pravdy, ne .blend.** Re-run → identický výsledek.
   Celý tank = spuštění všech `build.py` v pořadí. → řeší „2× jiný výsledek".
2. **Sdílený styl.** Jedna lib faceting-helperů (`lib/facet.py`) + **jeden pixel-atlas** + **jeden
   materiál** (nearest filtering, no PBR) — nastaveno JEDNOU, reuse na všech dílech. Styl se
   nereinventuje per díl → konzistence.
3. **Subject + silhouette lock** (CLAUDE.md §0 ⛔ / §1 🔒). Tvar JEN z T-62 fotek/blueprintů;
   stylizace nikdy nezasáhne siluetu (overlay check níže).

## Per-díl smyčka (jádro) — pro díl NN, např. `01 hnací kolo`
1. **Složka:** `parts/NN_name/` z `parts/_TEMPLATE/`.
2. **Reference:** v `katalog-uzlov-detaley-T62.pdf` najdi díl v tabulce → sloupec **„№ рисунка"** →
   vyrenderuj ten plate (`pdftoppm -f STR -l STR`) → + relevantní fotky z `ref/walkaround/` +
   kóty z CLAUDE.md §6 / textu manuálu. **Zapiš do `notes.md` SE ZDROJEM** (žádná halucinace).
3. **Build:** napiš `parts/NN/build.py` — low-poly mesh přes `lib/facet.py`, **origin = rig pivot**,
   název uzlu dle rig kontraktu (§5: `SprocketR`, `WheelL1`…). Spusť přes Blender-MCP
   (`execute_blender_code` → typicky `exec(open('.../build.py').read())`).
4. **Verify (z očí + ortho):** `get_viewport_screenshot` bok/čelo/shora → **PIL overlay proti
   blueprintu/fotce** (50 % blend) → kontroluj v pořadí **SILUETA → proporce → faceting**.
   Iteruj ÚPRAVOU `build.py` + re-run (ne ručním klikáním — zachová replikovatelnost).
5. **Approval gate:** ukážu screenshoty Tomášovi → **bez OK se nepokračuje**.
6. **Po OK:** export `parts/NN/out.glb`, `STATUS=approved`, update `TRACKER.md`, díl se připojí do
   master scény na svou pozici.
7. Další díl.

## Fáze (pořadí dílů = CLAUDE.md §4)
- **FÁZE A — GEOMETRIE** (díl po dílu): materiál = flat **4BO olive** placeholder. Tady se verifikuje
  **silueta vs blueprint** (tady minule padla disproporce). Running gear → hull → turret → gun.
- **FÁZE B — TEXTURA** (dávkově po skupině/celku kvůli koherenci maskáče): UV unwrap → **jeden
  pixel-art diffuse atlas** (camo, panel lines, decals „512" + hvězda, wear, bláto) → nearest filter,
  no PBR. (Per-díl náhodný camo by byl nekonzistentní → proto batch, ne per díl.)
- **FÁZE C — RIG + EXPORT:** díly už mají správné názvy + pivoty → parent hierarchie (§5), osy,
  master GLB. Ověření artikulace v three.js (turret yaw / gun elev / kola spin).

## 🔒 Overlay lock (tvrdá brzda na „zase neproporční")
Render z Blenderu v **ortho boku** přesně v rámci blueprintu → PIL slož s
`ref/blueprints/t62_side-top_clean_1265.jpg` (50 %) → silueta MUSÍ sednout na cm. Stejně čelo/půdorys.
Verify **z úrovně očí**, NE z 3/4 nadhledu (minulá lekce). WT glb jen na měření, ne na tvar.

## Komplexnost (NE primitivní model)
Cíl = **stovky low-poly dílů**, ne pár boxů. Low-poly je styl JEDNOTLIVÉHO dílu; tank jako celek je
kompletní se VŠEMI fittingy (CLAUDE.md §1 C). Proto je granularita per-díl tak jemná (kolo po kolu,
**článek po článku**, každé mířidlo / madlo / hák zvlášť). Když je skupina „hotová", projeď
**completeness check proti katalogu + walkaround fotkám**: chybí nějaký fitting který tam reálně je?
Když ano → přidej. Raději víc malých dílů než jeden zjednodušený blok.

## Otevřená rozhodnutí (potvrdit s Tomášem)
1. **Textura per-díl vs batch po skupině** — navrhuju **batch** (koherentní maskáč přes celý tank).
2. **Kam finální rigged GLB?** Tanky byly z hry ODEBRÁNY (branch chore/remove-tanks merged) — je
   tohle **re-add do hry** (pak platí rig kontrakt §5 pro boss/drivable/wreck), nebo **standalone
   asset**? Rig děláme tak jako tak; jen ať vím cíl.
