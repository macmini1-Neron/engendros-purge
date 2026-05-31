# Design: Rozdělení `src/game.js` na doménové moduly

**Datum:** 2026-05-31
**Stav:** schváleno k zápisu spec → čeká na review uživatele → poté writing-plans
**Větev (cílová):** vlastní větev odvozená z čistého stromu (viz Sekvencování)

---

## 1. Kontext a motivace

`src/game.js` má **8027 řádků / 536 KB** a drží v jednom souboru **23 tříd** + ~50 funkcí.
Kód **už je** modulární (ES moduly přes importmap, bez bundleru) a **už je** objektově
orientovaný — problém tedy NENÍ "single-file slop bez OOP", jak se na první pohled zdá.
Jediný reálný problém je **velikost jednoho souboru**: ničí přehlednost pro člověka i pro AI
(čím víc řádků musí asistent držet v kontextu, tím nespolehlivější jsou jeho úpravy).

**Motivace (slovy uživatele):** „bojím se přehlednosti, i pro tebe těch 8k game.js je bizár."

## 2. Cíl a non-goals

**Cíl:** rozsekat `game.js` na ~16 doménových modulů tak, aby se v nich orientoval člověk i AI;
`game.js` zůstane tenký orchestrátor (třída `Game` + bootstrap).

**Non-goals (výslovně MIMO rozsah):**
- Žádné přepisování do "lepšího OOP" — OOP už existuje.
- Žádný bundler / build step — zůstává nativní ESM + importmap v prohlížeči.
- Žádné refaktory chování, přejmenování API, optimalizace ani opravy bugů "při tom".
- Nesahá se na existující sourozenecké moduly (`engine.js`, `input.js`, `audio.js`,
  `effects.js`, `util.js`, `net.js`, `t34model.js`, `su34model.js`, `tankmodel.js`, `tankglb.js`).

## 3. Tvrdé pravidlo

**Split je čistě mechanický přesun: vyjmout kód + přidat `import`/`export`, NULA změn logiky.**
Refaktor chování a přesun se nikdy nemíchají — kdyby se cokoli rozbilo, musí být jednoznačné,
že za to může přesun, ne úprava. Jediné povolené "úpravy" jsou: doplnění `export` u symbolů,
přesun definice beze změny těla, a smazání jednoho potvrzeně mrtvého kódu (viz §8).

## 4. Sekvencování (KDY)

Split se dělá **až na čistém pracovním stromu** — tj. po dokončení, odzkoušení a
commitnutí/zmergování probíhající co-op sync práce. Důvod: split se dotkne prakticky každého
řádku `game.js`; kdyby běžel přes rozdělanou co-op práci, vznikne nezmergovatelný diff
(jak s vlastní rozdělanou prací, tak s bráchou na branch-protected `main`).

Split se nasadí jako série **malých commitů** (jeden modul = jeden commit), aby šel rebasovat.

## 5. Cílová struktura (16 modulů + tenký `game.js`)

| Modul | Obsah (entity) | ~řádků | Importuje |
|---|---|---|---|
| `tuning.js` | všechny herní/vizuální konstanty: fall/hunger/molotov/fire, SOUND_BY_CLASS, STRUCT_FX_COLOR, NIGHT_CYCLE/DAY_FRAC/SKYC/CONSTELLATIONS, MP_SKINS, WAVE_*/WAVE_TYPES/MINIBOSS_NAMES/BOSS_ROSTER | ~90 | util |
| `economy.js` | KEY_CASH, SUPPLY_CASH, FOOD_RESTORE, STRUCT_CAP, STRUCT_DEFS | ~10 | – |
| `bosstank.js` | tank cluster: `_tank*` díly, buildTankGun, `_tankMitri`, buildTank, `_wreckPalette`, buildTankWreck, **`_tankWrecks`** (export), decal pool (privátní `let`), `_ensureDecalPool`, tankGroundFX, updateTankLights, animateTank | ~1100 | util, tuning |
| `props.js` | buildFlopo, buildSu24, `_strut`, `_carabiner`, buildSupplyCrate, buildChuteRig, buildFlare, buildSandbags, buildBarbedWire, buildBarricade | ~600 | util, tuning |
| `weapons.js` | WEAPONS, WEAPON_ORDER, LOOT_WEAPONS, FIREARM_KEYS, lootWeapon, buildViewmodel, buildMag, WeaponSystem, MountedGun; re-export WEAPON_LAYER z engine.js | ~1180 | util, tuning, engine |
| `enemies.js` | ENGENDRO_COLORS, addButtonEye, addStitchSmile, buildEngendro, buildTolo, ENEMY_TYPES, Enemy, EnemyManager | ~1620 | util, tuning, bosstank, props, economy, vehicles |
| `vehicles.js` | CapturedTank | ~380 | util, bosstank |
| `world.js` | World, BuildManager, DayNight | ~640 | util, tuning, economy, props |
| `loot.js` | ITEM_DEFS, LootManager | ~560 | util, tuning, economy, weapons, props |
| `player.js` | Player | ~140 | util, tuning |
| `waves.js` | WaveManager | ~160 | util, tuning, enemies, weapons |
| `inventory.js` | ARMORY_SLOTS, GADGETS, Shop, SLOT_CAP, Inventory | ~360 | util, weapons, loot |
| `ui.js` | HUD, UI, SETTINGS_DEFAULTS, Settings, WeaponPreview | ~300 | util, tuning, weapons, loot |
| `admin.js` | AssetViewer, Admin | ~170 | weapons, enemies, bosstank, props, t34model, su34model |
| `mp.js` | mpEscape, scratch vektory (privátní), RemotePlayer, MP | ~590 | util, tuning, net, weapons, inventory, props, economy |
| `game.js` | GAME_VERSION/GAME_BUILD, třída **Game**, bootstrap (`window.GAME`) | ~500 | vše výše + engine, input, audio, effects |

Výsledek: z jednoho 8027řádkového souboru → **17 souborů, největší ~1620** (`enemies.js`,
zdominovaný `EnemyManager`em — `Enemy`+`EnemyManager` jsou těsně spjaté, drží se pohromadě).

**Rozhodnutí (zamčená):**
- Tank buildery se dělí na `bosstank.js` + `props.js` (ne jeden 2050řádkový `models.js`).
- `buildPlayerAvatar` (~135 ř., mrtvý kód) se **smaže** (po finálním grep-ověření).

## 6. Závislostní vrstvy (acyklický graf)

```
Vrstva 0 (leafy):   util(+RNG)   tuning   economy   net   engine   t34model   su34model
Vrstva 1 (buildery): bosstank   props   weapons   player
Vrstva 2:            vehicles(→bosstank)   world(→props)   loot(→weapons,props)
Vrstva 3:            enemies(→bosstank,props,vehicles)   inventory(→weapons,loot)   ui(→weapons,loot)
Vrstva 4:            waves(→enemies,weapons)   mp(→weapons,inventory,props,net)   admin(→…)
Vrstva 5:            game.js (→ vše)
```

Všechny hrany směřují dolů. Žádný modul neimportuje `game.js` ani `mp.js` (oba dostávají
instance přes konstruktor / injektovaný `game` objekt, ne importem).

## 7. Pasti, které mechanický split MUSÍ ošetřit (zjištěno analýzou + ověřeno proti zdroji)

1. **`enemies` ↔ `vehicles` kruhový import (FATÁLNÍ při loadu).**
   `EnemyManager` instancuje `CapturedTank`; zároveň `CapturedTank` i `EnemyManager` volají
   `animateTank/tankGroundFX/updateTankLights/buildTankWreck` a sdílí `_tankWrecks`. Naivní
   umístění těchto helperů do `enemies` → cyklus → undefined bindings → TypeError.
   **Řešení:** VŠECHNY tankové buildery+FX jdou do leafu `bosstank.js`. `enemies` i `vehicles`
   importují *dolů*; přežije jen hrana `enemies→vehicles` (konstrukce uvnitř metody → acyklické).
   Ověřeno: volání jsou v metodách (enemies 2299/2301/2467, vehicles 6434/6436/6437), ne na top-levelu.

2. **Decal pool nesmí být exportovaný `const`.**
   `_tankDecalPool` (`game.js:1541`) je líně přiřazený `let` (init v `_ensureDecalPool`).
   Exportovaný binding je v ESM read-only → přiřazení by hodilo chybu; importéři by navíc
   zachytili `null` před-init hodnotu. **Řešení:** `_tankDecalPool` + `_DECAL_POOL_SIZE` +
   `_decalColor` zůstávají **privátní v `bosstank.js`**; ven jdou jen funkce, co je uzavírají.
   `tuning.js` decal pool NEOBSAHUJE.

3. **RNG helpery + `rayAABB` se musí přesunout z `game.js` do leafu.**
   `rr/ri/pick/chc` (`game.js:32-35`), `weightedPick` (36-41), `rayAABB` (71-81) jsou dnes
   v `game.js`, ale volá je prakticky každý leaf (pick 52×, chc 46×, rr 32×, ri 9× napříč;
   rayAABB v enemies/world/mp). Kdyby zůstaly v orchestrátoru, leafy by importovaly *nahoru* →
   cyklus. **Řešení:** přesunout do `util.js` (math leaf) a exportovat; `game.js` je pak importuje
   jako všichni. (`randRange` už v util.js je.)

4. **Chybějící hrany v naivní mapě.** `WaveManager` volá `lootWeapon()` → `waves` MUSÍ importovat
   `weapons` (a `weapons` musí `lootWeapon` exportovat). `KEY_CASH` používá `MP` i `Game` →
   `mp` i `game` musí importovat `economy`.

5. **Mrtvý kód.** `buildPlayerAvatar` (`game.js:971-1105`, ~135 ř.) nemá žádného volajícího
   (spoluhráči používají `buildFlopo`). Smazat, ne stěhovat.

6. **WEAPON_LAYER má jediný zdroj.** Dnes importován z `engine.js` (`game.js:6`). Vybraná
   varianta: `weapons.js` ho importuje z `engine.js` a re-exportuje (`export { WEAPON_LAYER }`),
   takže weapon-related konzumenti mají jeden import point. `game.js` ho přestane importovat
   z engine přímo. NIKDY nevytvářet druhý `WEAPON_LAYER` const (jinak by viewmodely skončily
   na jiné render vrstvě a zmizely).

7. **Celé bloky konstant přesouvat verbatim.** Pozor na aliasy a "neuvedené" konstanty:
   `LEG_BREAK_VY = FALL_HURT` (FALL_HURT musí být přítomen), všechny `MOLO_*`, `ENEMY_BURN_SLOW`,
   `FALL_DMG_PER_VY` apod. jsou konzumovány napříč moduly → exportovat každý symbol, co někdo volá.
   Přesunout řádky 43-66 i 86 vcelku, ne po vyjmenovaných položkách.

8. **`_strut`/`_carabiner` jen jednou.** Definovat v `props.js`, exportovat `_strut`, importovat
   do `loot.js`. Hlídat, ať nezůstane druhá lokální definice (shadowing).

9. **Žádné top-level side-effecty kromě bootstrapu.** Jediný povolený top-level efekt je
   `new Game()` + `window.GAME` na konci `game.js`. Ověřit, že žádný extrahovaný modul nedělá
   DOM/THREE práci při importu (HUD/Shop/DayNight/Admin stavějí v konstruktorech — OK).

## 8. Sdílený mutable stav (ověřeno proti zdroji)

| Stav | Kdo používá | Domov | Vzor přístupu |
|---|---|---|---|
| `_tankWrecks` (pole, `game.js:850`) | bosstank (buildTankWreck), enemies (2634-2638), vehicles (6417-6421) | `bosstank.js` | `export const _tankWrecks = []`; importéři mutují *in-place* (push/shift, cap 6), NIKDY nepřeřazují. Jediná definice = jedna sdílená instance. |
| decal pool (`_tankDecalPool` let + `_decalColor` + `_DECAL_POOL_SIZE`) | jen bosstank FX funkce | `bosstank.js` | privátní, NEexportovat; ven jen funkce (viz past #2). |
| MP scratch vektory (`_v3a`, `_mpMin/_mpMax`, `_flareWP`) | jen mp | `mp.js` | privátní `const` Vector3, mutace in-place, neexportovat. |
| `BuildManager.structures`/`_idc`, `LootManager.pickups`/`drops`/`_pkSeq`/`plane` | world/loot (vlastník) + mp (host-sync) | instanční pole | MP k nim sahá přes injektovaný `game.build` / `game.loot`, NE importem třídy. Žádný modulový export. |
| `window.GAME` | bootstrap + debug eval | `game.js` | nastavit jednou v bootstrapu; ostatní moduly dostávají `game` injekcí, nečtou `window.GAME`. |

## 9. Pořadí extrakce (leaf-first) a verifikace

**Pořadí** (každý krok = vyjmout do nového souboru, doplnit `import`/`export`):
1. `util.js` — přidat RNG helpery + rayAABB (past #3)
2. `tuning.js`  3. `economy.js`  4. `bosstank.js`  5. `props.js`  6. `weapons.js`
7. `player.js`  8. `vehicles.js`  9. `enemies.js`  10. `world.js`  11. `loot.js`
12. `inventory.js`  13. `waves.js`  14. `ui.js`  15. `mp.js`  16. `admin.js`
17. `game.js` — zbytek se "vykuchá", doplní se kompletní import blok.

**Po KAŽDÉM kroku:**
- Posunout `?v=` cache-buster v `index.html` (a u importů, kde je verzování).
- Načíst hru v prohlížeči (Playwright), ověřit: **0 chyb v konzoli**, hra naběhne do lobby,
  start hry, základní hratelnost (pohyb/střelba/spawn nepřítele).
- Při chybě je viník jednoznačně poslední přesunutý modul → snadný rollback.

## 10. Pre-flight kontroly (před prvním řezem)

- Čistý pracovní strom (co-op práce commitnutá/zmergovaná).
- `net.js` je leaf (importuje max `three`/`util`) — jednořádkový grep.
- Potvrdit jediné definiční místo pro každý přesouvaný `FIRE_*`/`MOLO_*`/`BURN_*`/`FALL_*`
  (žádné per-class re-deklarace).
- Finální grep `buildPlayerAvatar` napříč `src/` + `index.html` před smazáním.
- Ověřit, že žádný "model builder" nesahá zpět na enemy/world symbol (drží leafy čisté).

## 11. Kritéria úspěchu

- `game.js` ≤ ~500 řádků, obsahuje jen `Game` + bootstrap + verze.
- Žádný modul > ~1650 řádků.
- Hra se v prohlížeči chová **identicky** jako před splitem (0 nových chyb v konzoli,
  žádná regrese v lobby/hře/co-opu).
- Závislostní graf acyklický (stránka se načte; žádné "Cannot access before initialization"
  ani undefined-binding chyby).
- Diff je čistě přesunový (žádná změna těl funkcí kromě doplněných `export`).
