# Soviet-song jukebox — expansion shortlist (+20)

**Date:** 2026-06-05
**Purpose:** Research dossier to grow the diegetic Soviet jukebox (`src/music.js` → `SONGS[]`, real `assets/*.mp3` recordings) by **20 more tracks**, 1916–1991. Famous classics we lack + special versions (instrumentals / soldier-chorus) + hidden gems. Every fact below was web-verified (sources at bottom).

---

## What we already have (22, do NOT duplicate)

`slavyanka` 1912 · `aviamarsh` 1923 · `rodina` 1936 · `katyusha` 1938 · `katyusha_frontline` 1938 · `svyashchennaya_voyna` 1941 · `vzemlyanke` 1942 · `platochek` 1942 · `gimn_sssr` 1944 · `smuglyanka` 1944 · `dorogi` 1945 · `podmoskovnye` 1956 · `khotyat` 1962 · `solnce` 1962 · `vysote` 1963 · `nezhnost` 1965 · `srodina` 1968 · `zhuravli` 1969 · `den_pobedy` 1975 · `million_roz` 1982 · `komarovo` 1985 · `peremen` 1987 · (+ menu chiptune `Коробейники`/Tetris, synth).

**Gaps in the collection:** zero Civil-War/1920s–30s era, zero bard (Vysotsky/Okudzhava), only one rock track. The shortlist below deliberately fills those.

---

## The shortlist — 20 picks (balanced, paste-ready slugs)

Era spread: 4 Civil-War · 6 WW2 · 7 post-war/estrada · 1 bard · 2 rock (1920 → 1988).
Flavor tags: 🎻 famous instrumental/orchestral version exists · 🪖 soldier-/Red-Army-chorus recording · 💎 hidden gem · 🎖 thematic fit for a Soviet war/tank game.

| # | slug | Кириллица | Translit / EN | Year | Notes |
|---|------|-----------|---------------|------|-------|
| 1 | `podolinam` | По долинам и по взгорьям | Po dolinam i po vzgoryam / *Partisan's Song* | 1929 | 🪖🎖 Civil-War march, Red Army Choir staple. Lyrics 1920, Aleksandrov arr. 1929. |
| 2 | `krasnaya_armiya` | Красная Армия всех сильней | *The Red Army Is the Strongest* («Белая армия, чёрный барон») | 1920 | 🪖🎖 Militant Civil-War anthem; final title fixed 1937. |
| 3 | `polyushko` | Полюшко-поле | Polyushko-pole / *Meadowland* | 1933 | 🎻💎🎖 Cavalry song. **Huge instrumental life**: Knipper's 4th Symphony (1934), Glenn Miller's jazz arr. (1944). Pick a choral OR orchestral cut. |
| 4 | `tachanka` | Тачанка | Tachanka | 1937 | 🎻🪖🎖 The cavalry machine-gun cart. Driving brass; often performed instrumental. |
| 5 | `tri_tankista` | Три танкиста | *Three Tankmen* | 1939 | 🪖🎖 **Unofficial anthem of the tank & border troops** — perfect for the T-90M «MITRI». From «Трактористы», bros. Pokrass. |
| 6 | `vecher_na_reyde` | Вечер на рейде | *Evening on the Roadstead* («Прощай, любимый город») | 1941 | 💎 Naval lyric classic, Soloviev-Sedoy. |
| 7 | `temnaya_noch` | Тёмная ночь | *Dark Night* | 1943 | 🎖 One of the most beloved WW2 songs (Bernes, «Два бойца»). Glaring omission. |
| 8 | `ogonyok` | Огонёк | Ogonyok / *The Little Flame* | 1943 | 🪖 Front favourite, folk-like, sung in the trenches. |
| 9 | `sluchayny_vals` | Случайный вальс | *Random Waltz* («Ночь коротка») | 1943 | 💎 Tender front waltz, Frenkel/Dolmatovsky. |
| 10 | `solovyi` | Соловьи | Solovyi / *Nightingales* | 1944 | 🪖🎖 "Don't disturb the soldiers." Soloviev-Sedoy — a soldier's song proper. |
| 11 | `vput` | В путь | V put / *Onward!* | 1954 | 🪖🎖 **THE** Soviet-Army marching song (sung by soldiers on the march); from «Максим Перепелица», Lenin Prize 1959. |
| 12 | `buchenwald` | Бухенвальдский набат | *The Buchenwald Alarm* | 1958 | 💎🎖 Thunderous antifascist hymn, Muradeli/Sobolev. |
| 13 | `odna_pobeda` | Нам нужна одна победа | *We Need One Victory* («Десятый наш десантный батальон») | 1970 | 🪖🎖 Okudzhava, «Белорусский вокзал» — became the paratroopers' anthem. |
| 14 | `ot_geroev` | От героев былых времён | *From the Heroes of Bygone Times* («Вечный огонь») | 1971 | 🎖 Memorial classic from «Офицеры». |
| 15 | `nadezhda` | Надежда | Nadezhda / *Hope* | 1971 | Beloved Pakhmutova estrada standard (Kobzon). |
| 16 | `mgnoveniya` | Мгновения | *Moments* («Не думай о секундах свысока») | 1973 | 💎 Legendary theme of «Семнадцать мгновений весны». Tariverdiev. |
| 17 | `vnov_boy` | И вновь продолжается бой | *And the Battle Goes On Again* | 1974 | 🪖🎖 Pakhmutova Komsomol banger ("Lenin so young"). |
| 18 | `ne_vernulsya` | Он не вернулся из боя | *He Didn't Return from Battle* | 1969 | 💎🎖 Vysotsky — fills the bard gap; war theme fits the game. |
| 19 | `gruppa_krovi` | Группа крови | *Blood Type* | 1988 | 🎖 Kino/Tsoi — anthemic, militaristic; pairs with the `peremen` we already have. |
| 20 | `gorod_zolotoy` | Город золотой | *The City of Gold* | 1986 | 💎 Aquarium/Grebenshchikov — haunting, transcendent (popularized by «Асса» 1987). |

### Paste-ready `SONGS[]` extension (append in `src/music.js`)

```js
// --- +20 expansion (2026-06-05). Source the assets/*.mp3 first; the jukebox skips
//     any file that 404s (onerror→_advancePlaylist), so order is cosmetic. ---
['podolinam',       'По долинам и по взгорьям', 1929],
['krasnaya_armiya', 'Красная Армия всех сильней', 1920],
['polyushko',       'Полюшко-поле', 1933],
['tachanka',        'Тачанка', 1937],
['tri_tankista',    'Три танкиста', 1939],
['vecher_na_reyde', 'Вечер на рейде', 1941],
['temnaya_noch',    'Тёмная ночь', 1943],
['ogonyok',         'Огонёк', 1943],
['sluchayny_vals',  'Случайный вальс', 1943],
['solovyi',         'Соловьи', 1944],
['vput',            'В путь', 1954],
['buchenwald',      'Бухенвальдский набат', 1958],
['odna_pobeda',     'Нам нужна одна победа', 1970],
['ot_geroev',       'От героев былых времён', 1971],
['nadezhda',        'Надежда', 1971],
['mgnoveniya',      'Мгновения', 1973],
['vnov_boy',        'И вновь продолжается бой', 1974],
['ne_vernulsya',    'Он не вернулся из боя', 1969],
['gruppa_krovi',    'Группа крови', 1988],
['gorod_zolotoy',   'Город золотой', 1986],
```

> Keep `SONGS` roughly year-sorted if you want the jukebox's shuffle-off order to read chronologically — it's purely cosmetic (shuffle is ON by default). The menu hero's monument-swap is driven by the `jukebox-track` event, so new tracks "just work" with the existing rotation.

---

## Bonus bench (swap-ins / a future +2nd batch)

All verified, all famous, kept off the main 20 only for balance:

| slug | Кириллица | EN | Year | Why bench |
|------|-----------|----|------|-----------|
| `pesnya_o_druge` | Песня о друге | *Song About a Friend* (Vysotsky, «Вертикаль») | 1966 | Most famous Vysotsky; alt to `ne_vernulsya`. |
| `zvezda` | Звезда по имени Солнце | *A Star Called Sun* (Kino) | 1989 | War imagery; alt to `gruppa_krovi`. |
| `trava` | Трава у дома | *Grass by the Home* (Земляне) | 1983 | Official anthem of Russian cosmonautics. |
| `nesokrushimaya` | Несокрушимая и легендарная | *Invincible and Legendary* (Red Army anthem) | 1943 | 🪖 Pure Aleksandrov march. |
| `orlyonok` | Орлёнок | *The Eaglet* | 1936 | Komsomol/Civil-War classic. |
| `proschayte_gory` | Прощайте, скалистые горы | *Farewell, Rocky Mountains* | 1942 | 💎 Northern Fleet anthem. |
| `arlekino` | Арлекино | *Harlequin* (Pugacheva) | 1975 | Estrada landmark. |
| `ya_sprosil` | Я спросил у ясеня | *I Asked the Ash Tree* («Ирония судьбы») | 1975 | Cinema standard. |
| `zaytsy` | Песня про зайцев | *Song of the Hares* («Бриллиантовая рука») | 1969 | Comedy classic ("А нам всё равно"). |
| `nichego_luchshe` | Ничего на свете лучше нету | *Bremen Musicians* | 1969 | Beloved cartoon record. |

---

## Sourcing the MP3s (same pipeline as the existing 22)

The existing tracks came from **Internet Archive** + the owner's own Katyusha. Verified live collections that cover most of the shortlist:

- **Red Army Choir – The Definitive Collection (2CD)** — archive.org/details/RedArmyChoir-TheDefinitiveCollection2CD
- **One Hour Of Soviet Red Army Music** — archive.org/details/one-hour-of-soviet-red-army-music
- **The Red Army Marches in Hi-Fi** (Alexandrov Ensemble) — archive.org/details/theredarmymarchesinhi-fi
- **sovmusic.ru** — the largest free Soviet-song MP3 archive (per-track downloads, incl. Civil-War + estrada + bard).
- Bard/rock tracks (Vysotsky, Kino, Aquarium, Земляне) are widely available as period recordings.

**Pipeline:** download → transcode to MP3 (~128 kbps mono is plenty; existing files are 1.8–5.8 MB) → name `assets/<slug>.mp3` exactly matching the slug above → append the `SONGS[]` rows → bump `?v=` + `GAME_BUILD` (cache-bust ritual) → verify in the asset-viewer "Music" tab (`GAME.audio.music.jukeboxTracks()`).

**Note:** `_startSample()` streams via `<audio>` (not decoded to RAM), so adding 20 more tracks costs ~no extra memory — only disk/bundle size (~3 MB each ≈ +60 MB; consider 96–128 kbps or `.vercelignore` trimming if bundle size matters).

---

## Sources

- Тёмная ночь — https://ru.wikipedia.org/wiki/Тёмная_ночь
- Полюшко-поле — https://ru.wikipedia.org/wiki/Полюшко-поле_(песня)
- Три танкиста — https://ru.wikipedia.org/wiki/Три_танкиста
- Кино / Группа крови / Звезда по имени Солнце — https://ru.wikipedia.org/wiki/Звезда_по_имени_Солнце_(альбом)
- Песня о друге (Высоцкий) — https://ru.ruwiki.ru/wiki/Песня_о_друге_(В._С._Высоцкий)
- Нам нужна одна победа — https://ru.wikipedia.org/wiki/Нам_нужна_одна_победа
- И вновь продолжается бой — https://ru.wikipedia.org/wiki/И_вновь_продолжается_бой
- Трава у дома — https://ru.wikipedia.org/wiki/Трава_у_дома
- В путь — https://ru.wikipedia.org/wiki/В_путь
- По долинам / Красная Армия всех сильней — https://ru.wikipedia.org/wiki/Красная_Армия_всех_сильней
- Internet Archive Soviet collections — https://archive.org/details/RedArmyChoir-TheDefinitiveCollection2CD , https://archive.org/details/one-hour-of-soviet-red-army-music , https://archive.org/details/theredarmymarchesinhi-fi
