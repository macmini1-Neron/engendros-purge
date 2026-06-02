# Tolo boss — rebalance & AI (design spec)

- **Datum:** 2026-06-02
- **Větev:** `fix/tolo-boss-balance`
- **Sahá do:** `src/enemies.js`, `src/weapons.js`, `src/ui.js`, `index.html`, nový `src/pathing.js`
- **Status:** schválený design, čeká na implementační plán

---

## 1. Problém

Boss **Tolo** je v praxi **nezabitelný** a jeho fáze 3 je **automatická smrt**.

### Současné chování (s odkazy do kódu)

- **Tvrdá imunita.** `EnemyManager.damage()` (`enemies.js:1072–1081`) vrací pro `e.def.boss` vždy `false` (jen efekt „odrazu", `_bossDeflect` na `enemies.js:626`) — **kromě** zásahu do břišního terčíku **právě když se nabíjí** (`e.charging > 0` a zásah do `1.4 * e.scale` od `_tolGlow`, `enemies.js:1076–1078`).
- **Mrňavé okno.** Nabíjení trvá `_chargeDur` = **0,85 s (fáze 1)** / **0,7 s (fáze 2/3)** a přijde jen jednou za útočný cyklus (`laserCD` = P1 3,8 s · P2 5,0 s · P3 4,0 s, `enemies.js:568`). Tolo má **3200 HP** (`enemies.js:184`). → ~0,7 s okno cca každé 4–5 s na bullet-sponge se 3200 HP = nelze ho sundat.
- **Phase 3 = instant kill.** Sweep ve fázi 3 dává **200 dmg** (`enemies.js:690`). Hráč má **100 HP + max 100 armor** (`player.js:21`) → spolehlivý one-shot. Navíc fáze 3 záměrně **pálí skrz zdi** (`if (e.phase !== 3)` na `enemies.js:668`), takže kryt nefunguje.
- **Hloupá navigace.** Tolo jede na lokálním steeringu bez navmeshe (`enemies.js:309–406`): separace, vyhýbání bednám (`:327–334`), „stuck-buster" co po 1,6 s běží rovnou na hráče (`:335–340`), drcení staveb (`:366`). V rozích statické geometrie se přesto zasekává.
- **Headshot je mrtvý.** Zbraně počítají headshot **×2,0** (×1,6 u .50cal) podle `eHit.head` (`weapons.js:1221` a MountedGun ~`:2004`), ale u Tola se stejně všechno odrazí, takže to nemá efekt.

---

## 2. Cíle / Non-cíle

**Cíle**
- Tolo jde **vždy aspoň trochu poškodit** (žádná tvrdá imunita kromě i-frames), ale terčík během správného okna je velká odměna.
- **Bazuka** je (zatím jediná) **anti-Tolo zbraň** s extra dmg.
- Fáze 3 je **drsná, ale ne automatická smrt**; kryt funguje ve všech fázích.
- Tolo je **navigačně chytrý** — obejde budovy, nezasekává se, vždy míří k hráči.
- Čitelná **zpětná vazba**: hráč pozná silný zásah (zvuk + žlutý crosshair) od slabého (tink).

**Non-cíle**
- Neměníme jiné nepřátele ani jejich AI (A* je **jen pro bosse Tolo**).
- Neměníme tankového bosse «MITRI» (jiná code-path, `e.isTank`).
- Nezavádíme navmesh pro celou hordu — grid A* je boss-scoped.
- Neměníme HP (zůstává 3200) ani i-frames mezi fázemi (zůstávají).

---

## 3. Design

### 3.1 Model poškození (`enemies.js`, `damage()`)

Nahradit blok `if (e.def.boss) { ... return false }` (`enemies.js:1073–1081`) tímto chováním:

1. **i-frames mezi fázemi** (`e.invuln > 0`) → **plná imunita** zůstává beze změny (krátký, čitelný telegraf, jen 3 s). `_bossDeflect`, `return false`.
2. Jinak spočítat **faktor poškození** a **propustit zásah dál** (`e.hp -= amount * factor`):

| Zásah | Faktor |
|---|---|
| Terčík během nabíjecího okna (`onTarget`, stávající podmínka) | **1,0** |
| **Bazuka** (zdroj `'rocket'`), kdekoliv/kdykoliv | **0,9** |
| Cokoliv ostatní (kulky, granáty `'explosion'`, melee, …) | **0,2** |

- `onTarget` se počítá stejně jako dnes (`e.charging > 0` + vzdálenost k `_tolGlow` < `1.4 * e.scale`).
- **Pořadí priorit:** `onTarget` (1,0) má přednost i pro bazuku; mimo okno bazuka = 0,9, vše ostatní 0,2.
- Po aplikaci faktoru pokračuje normální cesta `e.hp -= amount` + kontrola smrti (žádná capture-path, Tolo není zajímatelný).

**Headshot off na bossovi** (`weapons.js`): u zásahu, kde `eHit.enemy.def.boss === true`, **nepoužít** head násobič (×2,0 / ×1,6) a **nepřehrát** headshot ding/hitmarker. Místa: hitscan zbraně (`weapons.js:1221`, `eHit.head ? 2.0 : 1.0`) a MountedGun .50cal (~`weapons.js:2004`, `eHit.head ? 1.6 : 1`). → hlava se chová jako tělo (0,2).

**Odlišení bazuky** (`weapons.js`): rocket projektil má `g.rocket: true` (`weapons.js:1201`). V boom-bloku (`weapons.js:1524`) volat `damageInRadius(..., 'rocket')` pro rakety vs. `'explosion'` pro granáty. Rozšířit `EnemyManager.damageInRadius()` (`enemies.js:1113`) o volitelný parametr `source = 'explosion'`, který předá do `damage()`.

### 3.2 Zpětná vazba na zásah (`enemies.js` + `ui.js` + `index.html`)

Boss-specifické feedbacky řídí `damage()` podle výsledného faktoru (tam, kde se rozhoduje full/weak/rocket):

- **Efektivní zásah** (faktor 1,0 plný terčík **nebo** 0,9 bazuka):
  - uspokojivý zvuk (silnější tón než dnešní deflect),
  - **žlutý záblesk crosshairu/hitmarkeru** pro střelce,
  - větší výron výplně (`effects.stuffing`).
- **Slabý zásah** (faktor 0,2):
  - tichý „tink" + malý obláček (recyklace `_bossDeflect`, ale teď je to reálný zásah).

**Žlutý crosshair (HUD):** rozšířit `HUD.hitmarker()` (`ui.js:175`) o žlutou variantu (nová CSS třída na `#hitmarker`, `index.html:623`; barva žlutá) a/nebo krátký žlutý tint zaměřovače `#cross` (`index.html:622`). Časování přes stávající `_hitT` mechaniku (`ui.js:195`).

**Co-op:**
- Solo / host: feedback se spustí přímo z `damage()` pro lokálního hráče.
- Klient: damage běží host-authoritatively, takže host pošle střelci drobné potvrzení (nová mini-zpráva typu `bosshit` s tierem, relayovaná jen claimujícímu klientovi), podle kterého klient přehraje zvuk + žlutý crosshair. Přesné napojení doladí implementační plán (lze využít stávající hit-claim cestu).

### 3.3 Phase 3 už není one-shot (`enemies.js:690`)

- Sweep dmg ve fázi 3: **200 → 85**. (`this.game._hurtTarget(pid, e.phase === 3 ? 85 : 55)`.)
- Dvojitý sweep + hořící zóny zůstávají → dva zásahy / sweep + oheň složí i tak, ale jeden zásah s plnou HP/armor přežiješ.

### 3.4 Phase 3 sweep respektuje zdi (`enemies.js:668`)

- Odstranit výjimku `if (e.phase !== 3)` → raycast do zdí (`world.rayHit`) platí ve **všech fázích**, délka paprsku se ořízne o překážku.
- Důsledek: hořící zóny se nesype za zeď (drop běží jen do `len`), což je konzistentní.

### 3.5 HP a i-frames

- Beze změny: HP **3200** (`enemies.js:184`), přechodové i-frames **3 s** (`enemies.js:529`).

### 3.6 Chytřejší AI — grid A* pathfinding (nový `src/pathing.js`, jen boss)

**Nový leaf modul `src/pathing.js`** (čistá data + helper, žádná gameplay třída navíc):

- **Occupancy grid** se postaví **jednou** z `world.boxes` (statická aréna; bere jen `b.max.y >= 0.6`, stejný práh jako vyhýbání). Buňka ~**2 m** (aréna 140 → ~70×70). Buňka = blokovaná, pokud ji protíná vysoký box; překážky **nafouknout o poloměr bosse (2,6)**, aby cesta držela odstup.
- Hráčské stavby **do gridu nepatří** (boss je drtí, viz `:366`) → grid je statický, staví se při buildu arény.
- **API:** `buildGrid(world)` → grid; `findPath(grid, fromXZ, toXZ)` → pole waypointů (world XZ), nebo `null` když cesta neexistuje.

**Napojení v `enemies.js` (boss větev, `enemies.js:405` / steering `:316`):**
- Tolo přepočítá cestu k cíli (`_tgt`) **~každých 0,5–0,8 s** (nebo když se cíl posune o > N buněk, nebo když dojdou waypointy). Throttle, ať A* neběží každý frame.
- Steering jde k **dalšímu waypointu** místo slepě rovnou na hráče (`dx,dz` se počítá k waypointu).
- **Fallback na beeline** (stávající chování) když: cesta `null`, hráč velmi blízko (< pár buněk), nebo boss v přímé viditelnosti hráče.
- Zachovat drcení staveb (`:366`) a AABB collision resolution (`:355–364`).
- Cena: A* na ~70×70 gridu pro **1 entitu** každých ~0,5 s = zanedbatelné.

---

## 4. Ovlivněné soubory (shrnutí)

| Soubor | Změna |
|---|---|
| `src/enemies.js` | nový damage-faktor model v `damage()`; `damageInRadius` + `source` param; P3 sweep 200→85; P3 sweep respektuje zdi; boss feedback (full/weak); napojení A* do boss steeringu |
| `src/weapons.js` | headshot off na bossovi (2 místa); rocket boom volá `damageInRadius(..., 'rocket')` |
| `src/ui.js` | žlutá varianta `hitmarker()` / žlutý tint crosshairu |
| `index.html` | CSS pro žlutý hitmarker / crosshair flash |
| `src/pathing.js` | **nový** — occupancy grid + A* (`buildGrid`, `findPath`) |
| `src/mp.js` (možná) | mini-zpráva `bosshit` pro feedback klienta v co-opu |

---

## 5. Verifikace (manuální / in-browser, žádné testy)

Hru servírovat přes HTTP (`python3 -m http.server 8000`) a hrát + konzole proti `window.GAME`:

- `GAME.waves.startWave(N)` na boss-wave → potvrdit:
  1. Tolo jde poškodit tělem (~0,2×), terčík v okně dává plný dmg → **je zabitelný**.
  2. Bazuka dělá výrazně víc (~0,9×) než kulky → potvrdit číslem (sledovat `GAME.enemies.active[i].hp`).
  3. Headshot na Tola **nedělá** ×2 (žádný headshot ding, dmg jako tělo).
  4. Fáze 3 sweep tě **nesundá na jeden zásah** z plné HP; za zdí jsi v bezpečí ve **všech** fázích.
  5. Žlutý crosshair + zvuk **jen** u efektivního zásahu; slabý zásah = tink.
  6. Tolo **se nezasekne** v rozích/u budov, vždy dojde k hráči (projít ho po mapě s kryty).
- Co-op (host + klient): feedback na klientovi, damage host-authoritative, žádný double-run (vše za `hostSim`).

---

## 6. Co-op / footguny

- Veškerá nová damage-logika sedí v host-authoritativním `damage()` → co-op funguje automaticky (klient claimuje, host aplikuje faktor).
- Žlutý-crosshair/zvuk feedback je **per-střelec** → v co-opu řešen host→klient zprávou (3.2).
- A* pathfinding běží jen na hostovi (host vlastní `EnemyManager`); klient vidí bosse přes `esnap` snapshoty → žádná změna na klientu.

## 7. Deploy

Mění gameplay → na konci větve **cache-bust ritual**: bump `?v=N` na entry scriptu v `index.html` + `GAME_BUILD` v `src/game.js`. Pak PR → review bratrem → merge → Vercel auto-deploy.

## 8. Otevřené body (doladit v plánu)

- Přesné napojení co-op `bosshit` feedbacku (nová zpráva vs. piggyback na hit-claim).
- Žlutý crosshair: tint `#cross` vs. žlutý `#hitmarker` vs. obojí (vizuální doladění při render-verify).
- A* throttle (0,5 vs. 0,8 s) a velikost buňky (2 m) — doladit podle pocitu a hustoty arény.
