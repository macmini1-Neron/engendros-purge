# ЗСУ-23-4 «Shilka» — stavová logika & interlocky (co gateuje co)

**Datum:** 2026-06-18
**Účel:** Ultra-důkladně zmapovat, CO SE STANE, když je něco zapnuté / vyplé / běží — závislosti mezi subsystémy, palebné podmínky, kaskády a chybové stavy. Tohle je „mozek" toho, proč je Shilka komplexní na ovládání.
**Pravidlo:** flagship — nešidit. Mapa určuje i pořadí stavby (zdola nahoru), takže se nedá uvíznout.
**Zdroje:** `[M s.N]` SAM manuál · `[mech]` `src/shilka-mechanics.js` · `[notes]` tvoje sezení.

---

## A. Řetěz závislostí (precondition → co umožní → co padá při ztrátě)
*„Vyžaduje" = AND-brána: musí být splněno VŠE, jinak subsystém nejede.*

| Subsystém | Vyžaduje | Umožní | Když to vypadne, kaskáda |
|---|---|---|---|
| **ДГ-4 turbína** | baterie / externí zásuvka | sběrnice 220 V AC · 27,5 V DC · 54 V DC | **vypne ÚPLNĚ VŠE** |
| **54 V DC sběrnice** | turbína běží | napájí gyro, hydrauliku, radar, SRP, kanón | vše níže padá `[M s.18]` |
| **ГАГ gyro** | 54 V | stabilizace SRP+radaru (i za jízdy ≤25 km/h) | track nestabilní; lock se trhá za pohybu `[M s.19]` |
| **2Э2 hydraulika** | 54 V | pohyb věže 70°/s + hlavní 60°/s + antény | **radar/věž/hlavně NEHÝBOU** → nelze hledat/sledovat/mířit `[M s.25]` |
| **Radar НАКАЛ** (vlákno) | 54 V | po nahřátí povolí АНОДНОЕ | radar mrtvý `[M s.20]` |
| **Radar АНОДНОЕ** | НАКАЛ hotové | povolí ВЫСОКОЕ | — |
| **Radar ВЫСОКОЕ** (VN) | АНОДНОЕ | radar připraven vyzařovat | — |
| **Radar ВКЛ** (na vzduch) | ВЫСОКОЕ | emituje → detekce/track | ВЫКЛ → ztráta kontaktu i tracku |
| **СРП ПИТАНИЕ** | 54 V + data radaru + Q,K z gyra | výpočet Ту/Φ/βу/H | bez něj žádné řešení → nelze přesně pálit `[M s.28]` |
| **2А7 power** | 54 V | umožní nabití + palbu | — |
| **Nabití hlavně ×4** | 2А7 power + vzduch 65 atm | hlaveň schopná pálit (ЗАРЯЖЕНО) | nenabitá hlaveň nestřílí `[M s.27]` |
| **Pár ВЕРХ / НИЖ** | 2А7 power | povolí palbu daného páru | nezapnutý pár nestřílí `[M s.27]` |
| **ФβуТу slave** | СРП ready + 2Э2 on | hlavně samy sledují řešení | bez něj hlavně nemíří automaticky `[M s.41]` |
| **ЗУ paměť** | probíhající track | po ztrátě cíle radar dopočítá dráhu | — `[M s.41]` |

> Pozn.: `[mech]` `setShilkaSwitch()` už tuhle kaskádu dělá: jakmile `isRadarPowered` (7-AND) zhasne, vynuluje warmup, search, contact, lock i solution.

## B. Palebná brána — KDY reálně vyletí rána (velký AND)
Rána vyletí JEN když platí ZÁROVEŇ:
1. **2А7 power** ON
2. daná **hlaveň charged** (ЗАРЯЖЕНО)
3. její **pár (ВЕРХ/НИЖ) enabled**
4. cíl **v obálce** 200–2500 m / Ту 0,2–5,5 s → **ЕСТЬ ДАННЫЕ** svítí `[M s.42]`
5. náměr **nad omezovačem** (default 30°; pro zem snížit) `[M s.42]`
6. **shooter authorized** (velitel / úhlový operátor) `[M s.43-44]`
7. *(pro přesnost)* **angle-lock + range-lock** = full-auto řešení; jinak střílíš „naslepo" bez předsahu

## C. „CO SE STANE, KDYŽ…" — interlock scénáře (přesně tvoje otázka)
| Akce | Stav okolí | Výsledek |
|---|---|---|
| Zapnu radar **ВКЛ** | **hydraulika VYPLÁ** | radar vyzařuje, ale **anténa se nehýbe** → nezacílíš (tvůj objev `ГИДРОПРИВОД`) `[notes]` |
| Sleduju cíl (full-auto) | **vypnu 2Э2** | věž/hlavně **zamrznou** → cíl uletí z paprsku → **track padá** |
| Sleduju cíl | **gyro vypnu za jízdy** | stabilizace pryč → **lock se trhá** |
| Mám lock | **СРП vyplé** | žádné řešení → ЕСТЬ ДАННЫЕ nesvítí → **spoušť mrtvá** |
| **Vypnu turbínu** | kdykoli | kaskáda: všechny sběrnice padnou → radar/gyro/hydraulika/SRP/kanón mrtvé → search/contact/lock/solution **vynulováno** `[mech]` |
| Pálím | cíl **150 m** (moc blízko) / **3000 m** (moc daleko) | mimo obálku → ЕСТЬ ДАННЫЕ zhasne → **palba blokována** |
| Pálím | náměr **pod 30°** (limiter) | **palba blokována** (kvůli sebezničení OFZT/collateral) |
| **Pozemní cíl** (engendros pěchota) | přepnu na **2 dolní hlavně** + sniž limiter pod 30° | **kosíš pěchotu** (ground mode) `[M s.26]` |
| Nízký vrtulník | zapnu **SDC (Doppler)** | odřízne zem, ALE **visící vrtulník zmizí** z indikátoru → můžeš ho ztratit (lethal) `[M s.37]` |
| Pálím | **hlaveň nenabitá** / **pár vyplý** | ta hlaveň **mlčí** |
| Začnu hledat | **radar nenahřátý** | hledání **nejde** (warmup gate) `[mech]` |

## D. Cíle & role — POTVRZENO (rozšiřuje mapu)
- **Létající boss** — vlajkový vzdušný cíl (vlastní HP/chování).
- **Random přelety letadel** se speciálními scénáři (jiné než rádio-easter-egg). *Prior-art v repu: Su-24/Su-34 flyby (`props.js`, `su34model.js`) — dá se navázat.*
- **Použití proti pěchotě = engendros** → ground mode (2 dolní hlavně, snížený limiter). „Nejvíc OP" — kosí i pozemní hordy.
- Mapuje se na reálné mechaniky: **4 vzduch / 2 zem** `[M s.26]`, **omezovač náměru** (zvedat/snižovat dle vzduch/zem), **SDC** (nízké/visící cíle).

## E. Pořadí stavby = pořadí závislostí (zdola nahoru, nikdy neuvízneš)
1. **Napájení & start-stav** (turbína → sběrnice → gyro) — čistý stav, žádný pohyb
2. **Hydraulika 2Э2** (pohyb věže/hlavní/antény) — gate pro vše pohyblivé
3. **Radar** (warmup chain → hledání → track)
4. **СРП** (řešení Ту/Φ/βу/H → obálka → ЕСТЬ ДАННЫЕ)
5. **Kanón** (4 procedurální hlavně → nabití → páry → palba + chlazení/teplo)
6. **Cíle** (létající enemy + boss + přelety; ground mode vs engendros)
7. **Model/rig** (4 hlavně zvlášť, radar SCAN, antény sway, per-kolo terén, pás)
8. **Jízda** (driving + per-kolo zavěšení — od nuly, ideálně fixed-step)
9. **Co-op** (4 sedačky / 2 obsaditelné / přesedání / autorita palby — host-auth)
10. **Audio** (radar tón, řev, serva, rádio) — prolíná všemi vrstvami

> Každá vrstva je samostatně testovatelná a má jasné vstupy/výstupy. Když naskočí překážka (např. model neunese rig, fyzika se trhá), fixne se v rámci té vrstvy, aniž padne celek.

## F. Otevřené k domapování (další interlock detaily)
- Přesné chování **angle-lock vs range-lock** (kdy je „full auto" vs „jen úhel + radar dálka").
- **Memory (ЗУ)** přechod: kdy se aktivuje, jak dlouho drží, jak se vrací na track.
- **Přehřátí**: reálně chlazení drží teplotu; náš heat-model gate (kdy palba stopne).
- **Co-op authority**: kdo vlastní jaký stav (host vs sedící hráč) — vlastní spec.
- **Přesedání**: stavová logika kdo-kde-sedí, kdo řídí vs kdo míří.
