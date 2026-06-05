# LUKA — boss spec (ENGENDROS PURGE)

> Třetí fázový boss pro hru ENGENDROS PURGE (Three.js r160 FPS), vedle Tola
> a Tuliho. **LUKA** = Engendros ENEATYP 3, zelená voodoo panenka s penězi.
> Tohle je **spec** — cíl, proti kterému se kóduje do `src/game.js` (jako Tolo
> na větvi `feat/tolo-boss-rework`).
>
> **Model HOTOVÝ** (`bosses/luka/luka.js`, `nahled.html`) + rekvizity útoků
> (`money-bag.js`, `coin.js`, `money-gun/`, `top-hat.js`). Vzhled odsouhlasen.
>
> **Stav implementace:** ⬜ zatím NIC v `game.js` (Luka tam není). Tohle je
> první zápis spec po odsouhlasení modelu a designu (rozhodnutí 2026-06-04).

---

## 1. Koncept

Roztomilá zelená panenka, kruté jednání — **kapitalista, co tě umlátí penězi**.
Heslo money gunu: *„PENÍZE JSOU MOC, MY JENOM STŘÍLÍME."* Vše se točí kolem
**peněz**: mince, pytel s penězi, money gun. Boss je **mobilní** (na rozdíl od
tlustého pomalého Tola) a každá fáze přidává jiný „peněžní" útok.

**LUKA má 4 FÁZE.** Vizuální eskalace — znak `$` na bříšku mění barvu po fázích (jen
kosmetika, NENÍ to slabé místo): **f1 černá → f2 měď → f3 stříbro → f4 zlato**
(kovová eskalace). **Při přechodu** se `$` nejdřív ukáže v barvě **PŘEDCHOZÍ** fáze a
pak se pop-animací (`fxDollar`) **přebarví na aktuální** (f2 začne černým a evolvne do
měďi, f3 z měďi do stříbra, f4 ze stříbra do zlata). Náhled: `faze-nahled.html`
(`prevHex` + `_evolveIn` ve `fxTransition`/`updateFX`).

---

## 2. Statistiky (DEFS)

| pole | hodnota | pozn. |
|------|---------|-------|
| hp | **3200** | tuhý jako Tolo; pozor: dmg redukce dělá efektivní HP ~5× (bazuka ~2×) |
| speed | **~2.4** | mobilní (Tolo 1.0, grunt 2.0, runner 3.4); doladit v playtestu |
| dmg (kontakt) | 18 | dotykové; hlavní dmg jdou z útoků |
| scale | ~2.6 | (Tolo 2.85) |
| reward | 1400 | |
| fázové gaty | **75 % / 50 % / 25 %** (4 fáze) | f1 >75 · f2 50–75 · f3 25–50 · f4 <25 (návrh) |
| speed scaling | ×1.0 / 1.05 / 1.10 / 1.15 | hbitý, drobně zrychluje |

Přechod fáze (jako Tolo): **3 s nesmrtelnost**, boss stojí + animace, HUD `bigMessage`.
Hlášky (návrh): f1 „LUKA SE OTŘÁSÁ" · f2 „LUKA SÁHL DO KAPSY" · f3 „LUKA TASÍ PYTEL" ·
f4 „LUKA VYTÁHL MONEY GUN". **Přechod f3→f4 = kouzelnická dýmovnice** (rekvizita patří do f3, viz §3).

---

## 3. Fáze

### FÁZE 1 — „Oslíčku, otřes se!" (otřesová sprcha mincí)  · $ ČERNÝ
- Luka se **KLEPE celým tělem** a sype z něj **MĚĎÁKY jako fontána** (vyletí ven+nahoru,
  spadnou na zem, dolehnou naplocho a leží). Krátký déšť po dobu otřesu, pak pauza.
- **DMG okno:** mince dává dmg **dokud letí ven** od Luky → každá vlastní **HITBOX**; ležící
  = jen vizuál (bez dmg). Mince **blokují zdi**.
- ŽÁDNÉ nabíjení/telegraf energie (vyhozeno) — hvězda je samotné klepání.

### FÁZE 2 — „hrst drobáků" (hází)  · $ MĚĎ
- Luka drží v **PRAVÉ ruce hrst drobáků** (malé mince, **hlavně MĚĎÁKY + pár stříbrňáků**)
  a **HÁZÍ je** máchnutím dopředu — rozlétnou se v rozptylu, dopadnou a zůstanou ležet.
  (Přepracováno z dřívější „valící" mechaniky.)
- **DMG okno:** mince dává dmg **dokud letí** (po hodu); ležící = jen vizuál. Blokují zdi.
- Po hodu hrst „dobere" (zase se objeví v ruce). Počáteční efekt/telegraf — doladit.

### FÁZE 3 — „pytel" (lob + anti-camp)  · $ STŘÍBRO
- **Rekvizita:** **hnědý pytlík** v LEVÉ ruce (`buildMoneyBag`).
- **Útok A (hod):** hází pytel **obloukem (lob, gravitace)** na predikovanou
  pozici hráče. Dolet **delší než f1** (~ až 40 u). CD ~3.0 s.
  - přímý/dopadový dmg **30**, splash r~3 u → 18.
  - v **MP** cílí na hráče **round-robin** (postupně různé).
- **Útok B (anti-camp):** když hráč **stojí na místě > 2.5 s**, Luka mu pošle
  pytel **přímo na hlavu** — telegraf marker pod hráčem ~1.0 s, pak dopad,
  dmg **40**.
- **Po dopadu pytle:** rozsyp **STŘÍBRNÝCH** mincí (kosmetika/juice, bez dmg).
- **PŘECHOD f3→f4 = KOUZELNICKÁ DÝMOVNICE (patří sem, do f3):** na konci fáze 3
  (při poklesu pod 25 % HP → 3 s i-frames) Luka **vytáhne v PRAVÉ ruce kulatou
  dýmovnici** (krček + knot, `buildSmokeBomb`), **knot dohořívá** (žhavý ohýnek +
  jiskry) a **než to bouchne, hodí ji obloukem na zem** → dopad = **BUM**, oblak
  šedého kouře. Z kouře se Luka **vynoří už s cylindrem + money gunem** (= vstup do f4).
  $ přitom blýskne do ZLATA. *(Náhled: `faze-nahled.html` — `buildSmokeBomb`,
  `stepSmokeBomb`/`fxSmokeBomb` ve sloupci f3; do hry na okno `e.invuln`.)*
- **Rekvizita modelu:** `bosses/luka/smoke-bomb.js` (`buildSmokeBomb`, `smokeBombFuse`).
- **Zranitelnost:** **melee + granáty/bazuka + KULKY** (od f3 už střelba projde; oheň/molotov
  pořád ne). **Násobiče dmg zůstávají stejné** — kulky jdou za **×0.2** (jako melee/granát), bazuka ×0.5.

### FÁZE 4 — „crazy" (cylindr + money gun + pytel naráz)  · $ ZLATO
> Do f4 se vstupuje **dýmovnicí z FÁZE 3** (viz výše) — Luka se z oblaku kouře vynoří
> už s cylindrem a money gunem (tím se „vysvětlí", odkud se rekvizity vzaly).
- **Rekvizity:** na hlavu **černý cylindr** (`buildTopHat`), do PRAVÉ ruky
  **money gun** (`buildMoneyGun`). Pytel **zůstává v levé** a používá se dál.
- **Útok A (money gun):** dávka **MĚDĚNÝCH** mincí — 4 mince, rovně na cíl,
  rychlost ~22 u/s, dmg **10**/mince, CD ~1.8 s. Blokují zdi.
- **Útok B (pytel):** jako f2, CD ~3.5 s; po dopadu rozsyp **ZLATÝCH** mincí.
- **Rozdělení cílů:** **MP** → gun na jednoho hráče, pytel na druhého
  (zároveň). **SP** → obojí na téhož (střídavě/současně).
- **Zranitelnost:** **vše projde** (melee + granáty + kulky + bazuka).
- **Po smrti:** money gun **dropne jako použitelná zbraň** pro hráče (munice =
  měděné mince). *(Viewmodel `buildMoneyGun` hotový; potřebuje weapon def — viz §6.)*

---

## 4. Pravidla zranitelnosti + redukce dmg

**Krok 1 — projde útok vůbec? (podle fáze a zdroje)**

| zdroj (`source`) | f1 | f2 | f3 | f4 |
|------------------|:--:|:--:|:--:|:--:|
| melee | ✓ | ✓ | ✓ | ✓ |
| granát (`explosion`/grenade) | ✓ | ✓ | ✓ | ✓ |
| bazuka/RPG (`explosion`/rpg) | ✓ | ✓ | ✓ | ✓ |
| kulky (`gun`) | ✗ | ✗ | **✓** | ✓ |
| oheň/molotov/jiné | ✗ | ✗ | ✗ | ✓ |

Při **3 s i-frames** přechodu fáze → nic neprojde (deflect, jako Tolo).

**Krok 2 — globální redukce na to, co prošlo:**
- **bazuka/RPG → ×0.5** (hráč dá 50 %)
- **vše ostatní → ×0.2** (hráč dá 20 %)

> Pozn.: melee/granáty fungují i ve f1/f2, ale taky jen za 20 % → souboj je
> zpočátku spíš o přežití; bazuka je napříč fázemi nejúčinnější (preferovaná).

---

## 5. Společná pravidla

- **Žádný Lukův útok neprojde zdmi** — mince (f1), pytel (f2/f3) i mince z gunu
  (f3) blokují stěny/překážky (rayHit / kolize). (Na rozdíl od Tolovy f3.)
- **Melee Luku NEODHAZUJE** — boss je imunní vůči melee knockbacku (`knock`),
  nenechá se odstrkovat (na rozdíl od běžných mobů). Melee dmg projde (viz §4),
  jen bez odhozu/staggeru.
- **Rychlost = mobilní**, beeline na nejbližšího hráče (jako Tolo po doladění:
  ignoruje separaci od malých mobů). Při útoku se **rootuje** (telegraf okno).
- **HUD:** `setBoss` bar + `bigMessage` při spawnu („BOSS LUKA…") a přechodech.

---

## 6. Implementační poznámky (`src/game.js`)

- **Model:** přenést `buildLuka()` do game.js (jako `buildTolo`); nová DEFS
  položka `lukaBoss` (nebo `boss2`) s `boss:true`. Geometrie z `bosses/luka/luka.js`.
- **Kotvy rekvizit:** `buildLuka` musí vystavit anchory `e._handL`, `e._handR`,
  `e._head` (přidat prázdné Object3D do meshe) pro pytel / money gun / cylindr.
- **AI:** `_bossLuka(e, dt)` zrcadlí `_bossTolo`: fázové gaty (66/33), `e.invuln`
  přechody, rooting při útoku, dispatch útoku podle fáze.
- **Projektily — 3 nová pole + update/kolize:**
  - `lukaCoins[]` (f1 valící se mince po zemi),
  - `lukaBags[]` (lobnutý pytel, gravitace, splash + rozsyp),
  - `lukaGunCoins[]` (f3 přímé mince z gunu).
  Render přes lehké meshe (využít `buildCoin`/`buildMoneyBag` zmenšené, nebo
  prosté instance). Vše respektuje `world.rayHit`.
- **Zranitelnost/redukce:** v `damage(e, amount, source, …)` přidat větev pro
  Luku (filtr tabulky §4 + redukce). **Nutné odlišit bazuku od granátu** — oba
  teď chodí jako `'explosion'`; protáhnout do výbuchu **tag** (`explode(...,'rpg')`
  pro launcher, `'grenade'` pro frag), aby šlo aplikovat ×0.5 vs ×0.2.
- **`$` na bříšku:** uložit ref na materiál dolaru v modelu (`e._dollarMat`),
  přebarvit při přechodu fáze (zelená→stříbro→zlato).
- **Smrt → drop money gunu:** přidat weapon def `moneygun` (class launcher-like
  nebo vlastní), viewmodel = `case 'moneygun'` = `buildMoneyGun`. *(Lze odložit
  na druhou iteraci — boss může nejdřív fungovat bez dropu.)*

---

## 7. Otevřené / k doladění v playtestu

- Konkrétní čísla (speed, dmg, CD, počty/dolet mincí) = startovní návrh výše,
  ladí se naživo (Playwright + `window.GAME`).
- Money gun jako hratelná zbraň (weapon def + munice + balanc) — možná až 2. krok.
- f3 přesné rozdělení cílů gun vs pytel v MP (round-robin vs nejbližší).
- Zvuky (otřes, hod pytle, výstřel gunu, dopady mincí).
