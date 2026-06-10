# ФОНОТЕКА + H.K.M. Gramophone — build plan & spec (2026-06-10)

Branch `feat/fonoteka-gramophone` (worktree `/Users/macmini1/engendros-fonoteka`, off origin/main v246).

Two deliverables:
- **A. ФОНОТЕКА** — a new full-screen "Soviet Spotify" music screen (`state:'music'`) from menu + lobby, with a live 3D gramophone (spinning record, label swaps per song), genre filters, search, transport, animations.
- **B. Gramophone world-prop** — the same model scattered on maps; each prop tied to one genre; E to toggle, ◀/▶ to change song; host-auth + distance volume (clones the radio prop).
- **C. +20 songs** filling Folk/Bard/Rock gaps (downloading in background).

---

## 1. Gramophone model spec (procedural THREE, `src/fonoteka.js` `buildGramophone()`)

Real machine: late-40s/50s Soviet suitcase патефон, Ленинградский граммофонный завод (Н.К.М. Главширпотреб), 78 rpm spring-motor. Origin = case-center, y=0 at base, front (latches) = +Z, up +Y, right +X. Closed envelope ≈ **0.31(X) × 0.16(Y) × 0.29(Z) m**. Motorboard deck at y≈0.105.

**78 rpm = 1.3 rev/s = 8.168 rad/s** (clockwise → `turntable.rotation.y -= 8.168*dt`). Ease in/out ~0.6 s.

Parts (rig key → primitive, dims m):
- `caseBody` Box 0.31×0.105×0.29 — dark-brown speckled granitol/leatherette (triangular-flake canvas texture).
- `motorboard` Box 0.30×0.012×0.28 deck.
- chrome trim: `hinge` (rear piano hinge), `cornerCaps`×8, `clasps`×2 (front), `handleFront`/`handleSide` (recessed chrome + black tray).
- `lid` Box 0.31×0.055×0.29, **pivot at rear hinge line (0,0.105,−0.145)**, opens `rotation.x: 0→−115°`. `lidLogo` PlaneGeometry decal (cream diamond, treble clef, red CCCP flag, caption Н.К.М. ГЛАВШИРПОТРЕБ / ЛЕНИНГРАДСКИЙ ГРАММОФОННЫЙ ЗАВОД). `lidStay` black prop-rod.
- `turntable` Cylinder r0.125 h0.018 chrome rim @ (−0.045,0.116,0.01) — **this group spins**. children: `platterFelt` (dark teal felt), `spindle`, `record` (shellac Cylinder r0.125 h0.0015, near-black, faint groove rings), `recordLabel` (Cylinder/Circle r0.045, **swappable CanvasTexture per song**).
- `tonearmBase` chrome post @ (0.10,0.118,−0.03) → `tonearm` S-bend (TubeGeometry along CatmullRomCurve3, tube r0.011, ~0.16 run — HERO part) → `reproducer` flower-grille soundbox (Cylinder r0.032, 12-petal grille) + `needle`. `armRest` park hook. tonearm yaw +18°(rest)→−6°(play, outer)→+4°(inner); reproducer pitch down ~7° to drop needle.
- `crankSocket` (+X face) → `crank` L-rod (spins about X) + `crankKnob` bakelite (free-spin). Folded vs deployed pose.
- `leverSpeed` ("FH 78 Bremze" nickel plate + pointer, ±15° arc) , `leverAuto` ("АВТОСТОП ВКЛ/ВЫКЛ" plate + toggle lever ±20°), `governorLever`.
- optional `needleTin` accessory corner.

`root.userData = { kind:'patefon', turntable, record, recordLabel, spindle, tonearmBase, tonearm, reproducer, reproGrille, needle, armRest, lid, lidLogo, lidStay, crankSocket, crank, crankKnob, leverAuto, leverSpeed, governorLever, clasps:[], hinge, handleFront }`.

Single `update(dt, state)` with `state={ playing, lidOpen, armPlay, crankSpin, autoStop, speed, trackProgress }` drives both UI showpiece (lid open, arm tracking, label=current song) and world prop (idle lid open, arm parked).

**Textures (CanvasTexture, 256–512px, cached):**
- `makeLabelTexture({title,artist,side,color})` — black or cream disc, gold ring text (АПРЕЛЕВСКИЙ ЗАВОД / ГОСТ 5289-50), gold star+wheat or blue CCCP mark, Cyrillic title block. Re-render + `map.needsUpdate=true` per song.
- `makeGranitolTexture()` — dark-brown base + ~1500 small random triangles (lighter brown low-alpha), RepeatWrapping (4,4); reuse greyscaled as bumpMap.
- `makeLidLogoTexture()` — alpha plane: cream diamond + treble clef + red flag + disc + gold caption.

**5-tone palette** (Hi/Mid/Lo/Slot/Bright): leatherette `#5a4636/#3f2e22/#281b13/#170f0a/#6e573f`; chrome `#e9edf2/#b9c1c9/#7b848d/#4a5158/#fff`; shellac `#262626/#121212/#070707/#000/#4a4a4a`; gold `#e7c463/#c8a13a/#9a7822/#5e4914/#f6e09a`; red `#e0463a/#c0241f/#8c1714/#5a0d0b/#f08070`; felt `#2e5048/#1f3a34/#142621/#0b1714/#3f6a5e`; bakelite `#3a2c22/#241a13/#140d09/#080503/#52402f`; cream `#e6dcc2/#cabf9a/#9d9270/#6c6147/#f4ecd6`.

Build order: caseBody+motorboard → chrome trim → lid+logo → turntable group (test spin) → tonearm S-curve+reproducer → crank → lever plates → optional needle tin → wire userData+update().

Verify each step in a standalone viewer (`tools/gramophone-viewer.html?` + Playwright screenshots), like the modelgen loop.

---

## 2. Genre taxonomy (8 buckets) + per-song table

Keys: `marshi` (War Marches), `gimny` (Anthems & Propaganda), `narod` (Folk), `frontline` (WWII Ballads), `estrada` (Soviet Pop), `disco` (VIA & Disco), `bard` (Bard Song), `rock` (Rock).
Icons (mono glyphs): marshi=star+sabre, gimny=star+hammer&sickle, narod=wheat ear, frontline=flying crane, estrada=microphone, disco=vinyl disc, bard=acoustic guitar, rock=lightning bolt.

Per-song `[slug, RU, EN, year, genre, secondary?]`:
- slavyanka, Прощание славянки, Farewell of Slavianka, 1912, marshi
- aviamarsh, Марш авиаторов, The Aviators' March, 1923, marshi, gimny
- rodina, Широка страна моя родная, Song of the Motherland, 1936, gimny
- katyusha, Катюша, Katyusha, 1938, frontline, narod
- katyusha_frontline, Фронтовая Катюша, Frontline Katyusha, 1938, frontline
- svyashchennaya_voyna, Священная война, The Sacred War, 1941, marshi, gimny
- vzemlyanke, В землянке, In the Dugout, 1942, frontline
- platochek, Синий платочек, The Blue Kerchief, 1942, frontline, estrada
- gimn_sssr, Государственный гимн СССР, State Anthem of the USSR, 1944, gimny
- smuglyanka, Смуглянка, Smuglyanka, 1944, narod, frontline
- dorogi, Эх дороги, Oh the Roads, 1945, frontline
- podmoskovnye, Подмосковные вечера, Moscow Nights, 1956, estrada
- khotyat, Хотят ли русские войны, Do the Russians Want War?, 1962, gimny, estrada
- solnce, Пусть всегда будет солнце, May There Always Be Sunshine, 1962, estrada, gimny
- vysote, На безымянной высоте, On the Nameless Height, 1963, frontline
- nezhnost, Нежность, Tenderness, 1965, estrada
- srodina, С чего начинается Родина, Where Does the Motherland Begin?, 1968, gimny, estrada
- zhuravli, Журавли, Cranes, 1969, frontline
- den_pobedy, День Победы, Victory Day, 1975, frontline, estrada
- million_roz, Миллион алых роз, A Million Scarlet Roses, 1982, estrada
- komarovo, Комарово, Komarovo, 1985, disco, estrada
- peremen, Хочу перемен, I Want Change, 1987, rock
- krasnaya_armiya, Красная Армия всех сильней, The Red Army Is the Strongest, 1920, marshi, gimny
- podolinam, По долинам и по взгорьям, Through the Valleys and Over the Hills, 1929, marshi, narod
- polyushko, Полюшко-поле, Polyushko-Pole (Meadowland), 1933, narod, marshi
- tachanka, Тачанка, Tachanka, 1937, marshi, narod
- tri_tankista, Три танкиста, Three Tankmen, 1939, narod, marshi
- vecher_na_reyde, Вечер на рейде, Evening on the Roadstead, 1941, frontline
- temnaya_noch, Тёмная ночь, Dark Night, 1943, frontline
- ogonyok, Огонёк, The Little Light, 1943, frontline, narod
- sluchayny_vals, Случайный вальс, Chance Waltz, 1943, frontline
- solovyi, Соловьи, Nightingales, 1944, frontline
- vput, В путь, On the Road, 1954, marshi
- buchenwald, Бухенвальдский набат, The Buchenwald Tocsin, 1958, gimny, frontline
- ne_vernulsya, Он не вернулся из боя, He Did Not Return from Battle, 1969, bard, frontline
- odna_pobeda, Нам нужна одна победа, We Need But One Victory, 1970, bard, frontline
- ot_geroev, От героев былых времён, From the Heroes of Bygone Times, 1971, frontline, estrada
- nadezhda, Надежда, Hope, 1971, estrada
- mgnoveniya, Мгновения, Moments, 1973, estrada
- vnov_boy, И вновь продолжается бой, And the Battle Goes On Again, 1974, gimny
- gorod_zolotoy, Город золотой, The Golden City, 1986, rock, bard
- gruppa_krovi, Группа крови, Blood Type, 1988, rock
- svadba, Свадьба, The Wedding, 1970, estrada, disco
- siniy_iney, Синий иней, Blue Hoarfrost, 1971, disco
- moy_adres, Мой адрес — Советский Союз, My Address Is the Soviet Union, 1972, disco, gimny
- lyudi_vstrechayutsya, Люди встречаются, People Meet, 1972, disco
- zvezdochka, Звёздочка моя ясная, My Bright Little Star, 1974, disco, estrada
- arlekino, Арлекино, Harlequin, 1975, estrada
- zodiak, Зодиак, Zodiac, 1980, disco
- tanec_na_barabane, Танец на барабане, Dance on the Drum, 1980, disco
- uchkuduk, Учкудук три колодца, Uchkuduk Three Wells, 1981, disco
- trava_u_doma, Трава у дома, Grass by the Home (Earthlings), 1982, disco, rock
- cherny_kot, Чёрный кот, Black Cat, 1983, disco, estrada
- deltaplan, Дельтаплан, Hang Glider, 1983, disco, estrada
- zelyony_svet, Зелёный свет, Green Light, 1984, disco, estrada
- luna_luna, Луна-луна, Moon-Moon, 1986, disco, estrada
- lavanda, Лаванда, Lavender, 1986, disco, estrada
- belaya_noch, Белая ночь, White Night, 1986, disco
- muzyka_svyazala, Музыка нас связала, Music Bound Us Together, 1987, disco
- belye_rozy, Белые розы, White Roses, 1988, disco
- fantazyor, Фантазёр, Dreamer, 1988, disco, estrada
- rozovye_rozy, Розовые розы, Pink Roses, 1989, disco

+20 (downloading): narod×8 (kalinka, oy_to_ne_vecher, step_da_step, vo_pole_bereza, stenka_razin, kalina_krasnaya, vdol_po_piterskoy, tonkaya_ryabina), bard×6 (song_o_druge, koni_priveredlivye, arbat, beri_shinel, milaya_moya, atlanty), rock×6 (zvezda_po_imeni_solnce, pachka_sigaret, skovannye, ya_hochu_byt_s_toboy, povorot, my_vmeste). Wire EN/year/genre once files land.

---

## 3. Integration (file edits)

**music.js**: add `SONG_GENRES` map + EN titles (extend SONGS tuples to `[slug,ru,en,year,genre]` or parallel maps); add per-genre entries to `PLAYLISTS`; add `jukeboxGenreOf(slug)`; expose EN title in `jukeboxTracks()`/`jukeboxStatus()`. `jukebox-track` CustomEvent already dispatched in `_advancePlaylist` (music.js:464).
**ui.js**: add `music: getElementById('music')` to `UI.overlays`.
**game.js**: import `{Fonoteka, GramophoneManager, buildGramophone, buildGramophoneProps}`; construct `this.fonoteka`, `this.gramophone`; `openFonoteka(from)`/`closeFonoteka()`; wire `fonoteka-menu-btn`/`fonoteka-lobby-btn`; pointer-lock guard `|| state==='music'`; `_frame`: render fonoteka canvas when `state==='music'`; `_updatePlaying`: gramophone.update + interact prompt + E toggle + ◀/▶; bump GAME_BUILD.
**index.html**: ФОНОТЕКА buttons in `.menu-mini` (~881) + `.mp-actions` (~1042); new `<div id="music" class="overlay">` after #admin (~1081); `.fonoteka-*` CSS (POLYMER tokens, no emoji, SVG genre icons); bump `?v=` (246→247).
**mp.js**: `gramoset`/`gramoreq` handlers (mirror radio 566-567) + late-join sync (~1007).
**admin.js**: add Gramophone to props viewer list; the buried Music tab can link to ФОНОТЕКА.
**radio.js**: reuse `radioAttenuation` (RADIO_INNER 3.5 / OUTER 22) for prop distance volume.
Prop placement: `buildGramophoneProps(manager, scene, mapId)` post-build from game.js, hardcoded positions/genres per map.

POLYMER CSS tokens: --brass #d8b066, --brass-hi #f3d999, --brass-lo #9a7636, --neon #45e0cf, --red #e2483a, --go #5cae8c, --paper #f0e6cf, --ink-dim #ad9f7e, --surface-1, --glass; fonts Russo One (title) / Oswald (display) / Saira Stencil One.

## 4. Phase plan
1. music.js data (genres + EN). 2. Gramophone model + viewer (incremental, verify). 3. ФОНОТЕКА screen (UI/UX + live canvas + label swap). 4. World prop (manager, placement, interaction, MP sync). 5. Wire +20 songs. 6. Browser-verify, cache-bust, commit, PR.
