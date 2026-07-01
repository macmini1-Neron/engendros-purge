# Terrain / Podloží — 72 návrhů (noční přehlídka) + produkční cesta

**Datum:** 2026-06-26 (autonomní noční běh) · **Stav:** showcase k owner-review → vybrat směr → produkce
**Živé:** server `python3 -m http.server 8024` z worktree `feat/buildgen-destructible` (`/Users/macmini1/eng-buildgen-destruct`):
- `terrain-showcase-index.html` — front-page přehlídky (TOP-10, páteř světa, katalog, archy)
- `terrain-showcase.html` — živý engine, proklikat všech 72 ve 3D
- `contact-sheet.jpeg` (72) · `hero-grid.jpeg` (12 z lepšího úhlu)

## 1. Co to je
72 koncepčně odlišných návrhů podloží pro ENGENDROS, od základu po katastrofu, **každý s reálnými herními assety** (makeTree stromy vč. mrtvých/spálených, buildgen barák `_smoke`, modelgen skály/klády/pařezy/debris, vojensko-průmyslové propy radar P-37 / S-75 SAM / minomet / bedny). Texturováno **triplanar materiálovými texturami** tak, aby sedělo ke kvalitě baráku. Vzhledem k bílé knize + nové vizi mapy + těžbě z existující stepní mapy.

## 2. Research (3 agenti)
- **Bílá kniha + vize mapy + těžba ze stepní mapy:** svět = alt-1980s sovětská karanténní zóna, plyšoví „Engendros" (cute = jen mobové) vs mrtvá bleak krajina (= motor hororu); Object 704 «КОЛЫБЕЛЬ», ПЛЮШТАЛЬ, radioaktivní пух. Survival-horror-jako-logistika + 6 sim pilířů pod voxel-cute kůží. **Terrain pillars:** drainage=level design (hory N vysoko → step rim → les svahy → toxická pánev střed → bažina S nízko); sealed jádro + 2 routy (N suchá/vysoká, S mokrá/smrtelnější) → reconverge u inner-ringu; wide×narrow holdout rytmus; destruktibilní/reshapeable; traversal pro sim; horor pacing (safe pockets + dread tells); legible nav (beacony). **Lokace** (live coords): strongpoint SW start (−330,−282), КОМБИНАТ (0,0), террикон (96,18 r22), letiště (0,250), kolchoz (300,−300), bunkr (360,150), mountain border MH=26, plán řeka→bažina.
- **Game-design terénu:** Level Design Book (massing/contrast/sightlines), Horizon ZD (procedurální báze + ručně modelované skály), de_dust2 choke, terrikon-jako-pevnost (Avdijivka) → **50 konceptů + 20 design-os** (makro-topologie, scale/openness, relief source, příroda↔průmysl↔katastrofa, biom, materiál, cover, sightline, choke, vertikalita, defensibility, friction, deformability, hazard, indirect-fire, vehicle, horror register, fog, nav, roguelite).
- **Inventář assetů:** přesné build recepty (makeTree / buildSpec / buildBuilding).

## 3. Zamčený technický směr (★ owner-validated, supersedes faceted spec)
Cesta k faseted low-poly + Mikkelsen bump (spec `2026-06-25-terrain-rewrite-design.md`) byla **owner-rejected** ("moc tmavé, fasety nejdou, hory fail, nesedí kvalitou k baráku"). **Nový směr = real-game:**
1. **Textura = procedurální materiálové textury (tráva/hlína/skála/písek/sníh/bahno/popel/beton/štěrk/sůl/led/jíl/rašelina/spáleniště/rez/spraš/čedič) přes metric TRIPLANAR** (stejná tech jako buildgen cihly: CanvasTexture + world-space tiling, MeshLambert) — žádné obrázkové soubory. Míchané dle sklonu+výšky (splatmap styl), hladké stínování, světlé (hemi 1.05 + key dir 1.5 + ambient).
2. **Forma = mírná pochozí heightfield BÁZE** (gentle, velké pozvolné plochy) + **dramatická STRUKTURA z MODELOVANÝCH skal** (rock_outcrop/boulder/cluster škálované do masivů/útesů) — tím se opravily „failnuté hory" (ne kornout ze šumu). Co-op: vše pure fn(x,z).
3. **Landformy = analytické feats** (hill/basin/massif/cone/pit/crater/ridge/channel/berm) skládané deklarativně per-mapa → designed topologie.

## 4. 72 návrhů (kategorie)
ZÁKLAD/START · LES · HORY/TAJGA · BAŽINA · ZÓNA · PRŮMYSL(+ террикон/lom/nádraží/koksovna/odkaliště/rašelina/popílek/přehrada/sklad/chladicí věž) · KOLCHOZ/VENKOV(bocage/meliorace/elevátor/sad/bahno/poldery) · ŘEKA · GEOLOGIE(strže/balvany/kras/čedič/moréna/esker/suť/dlažba) · CHLAD(permafrost/zamrzlá nádrž/závěje/sastrugi/ledová cesta) · VODA(estuár/vypuštěná nádrž/přepady) · ARID-wild(sůl/duny/prach/takyr — off-canon) · KATASTROFA(spáleniště/skleněný kráter/zasypané město/reaktorový propad) · OPEVNĚNÍ(zákopy/dračí zuby) · EKOTÓN(step→les/les→zóna dieback/řeka→delta→bažina/rim→jádro) · ANOMÁLIE(пух/anomální mýtiny/plyš-výkvět) · NÁLADY(noc jádro/soumrak step/mlžný les/sněžná bouře/uhlíky) · SET-PIECE(mesa pevnost/bažinný ostrov). Plný katalog + popisy = index stránka.

## 5. ★ TOP doporučení (moje preference) + páteř světa
Backbone = **0 Step start (SW) → [N: 4 Tajga→5 Hory/16 Slot-kaňon boss-gate] / [S: 12 Kolchoz→13 Řeka→6 Bažina boss-gate] → 7 Mrtvé toxické jádro «Рана» (Object 704 master landmark) → inner-ring (8 КОМБИНАТ · 9 Террикон · 10 Lom · 25 Chladicí věž) → 15 Kurgan+bunkr NE cíl**, s válečným overlayem (14 Krátery · 52 Spáleniště · 56 Zákopy) a ekotóny (59 Les→zóna dieback · 60 Řeka→delta · 61 Rim→jádro) jako přechody. TOP-10 jednotlivě s odůvodněním v indexu.

## 6. Produkční cesta (jak z přehlídky do hry)
Showcase engine je „pravdivý prototyp" reálné cesty:
- **Heightfield:** landform-feats systém → rozšířit `src/terrain.js` `terrainHeightAt` (pure fn(x,z), authored feats + flatten-pady pod districty). Mírná báze + steep massifs.
- **Materiál:** triplanar Lambert shader (`onBeforeCompile`) → do `terrain-mesh.js` materiálu; biom-blend přes moisture/temp pole (pure fn). Textury procedurální (sdílet tech s `buildings/textures.js`).
- **Struktura:** rock modely (modelgen) instancované jako masivy/útesy/scatter, deterministicky umístěné; chunked + frustum cull.
- **Co-op/perf:** vše pure fn(x,z)+fixed hash; chunked-LOD; ship incrementally (~256m slice první). 2.5D — cave-feel = slot kaňony (open-top) + authored interiéry (portal prop), ne carved jeskyně; cliffs>35°=zdi.
- **Integrace:** flatten-pady (`terrain.reserved`), dig.js zůstává finální vrstva, torzní grounding vozidel (separátní fix).

## 7. Otevřené / k rozhodnutí ráno
- Vybrat hrstku map do první verze (doporučuju backbone: start/hory/bažina/jádro/kombinat/bunkr + 1-2 boss-gate).
- Potvrdit: drop Vulkán/poušť z kánonu (map vision lock) — arid varianty nechány jen jako „wild".
- Naladit konkrétní landform parametry + scale (map size = tunable dial).
- Pak: writing-plans pro produkci (M0 shader pipeline na chunked terénu → M1 biome-blend → struktura → topologie/backbone).

## 8. Soubory / odkazy
Worktree `feat/buildgen-destructible`. Plán běhu: scratchpad `overnight-terrain-plan.md`. Předchozí spec (faceted, superseded part 3): `2026-06-25-terrain-rewrite-design.md`. Git je na ownerovi.
