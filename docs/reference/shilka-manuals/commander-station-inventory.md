# ЗСУ-23-4 «Шилка» — ПУЛЬТ КОМАНДИРА — 1:1 inventář (38 prvků)

**Co to je:** ověřený 1:1 katalog velitelského pultu (фire-control nervové centrum věže) — předloha pro `COMMANDER_CONTROLS` v `demo/shilka-modules.js` a logické moduly `shilka-interlock.js` / `shilka-stab.js` (milník **M2** demoshilky).

**Zdroje (dvě číslovací schémata):**
- **Альбом 2011** = `findings/07-azp23m-schematics.md` p.34 (foto pultu, 38 calloutů) + p.35 (legenda). **Sekvenční 1–38, jen velitelský pult → kanonické číslo `n`.**
- **ИЭ 1970** = `findings/10-operation-1970.md` (procedurální číslování, kříží více stanic) → sekundární `n70`.
- `findings/08-zsu234-tech-description.md` p.89 (palebné podmínky + ЕСТЬ ДАННЫЕ) · `srp-fire-computer-inventory.md` (ШУНТ-СРП / ЕСТЬ ДАННЫЕ / ЗУ).

> ⚠️ Obě schémata **nemají 1:1 číselné mapování** (ИЭ1970 používá nesekvenční čísla míchající velitele/naváděče/dálkaře). **Vázat vždy na NÁZEV funkce, ne na číslo.** Renderer ukazuje obě (`n` Альбом / `n70` ИЭ1970).

*Vznik 2026-06-25 (reconciliation 3 zdrojů). Confidence: ✅ obě schémata · ⚠️ jen jeden zdroj · ❓ konflikt/nejasné.*

---

## ⚠️ KOREKCE (časté omyly — ověřeno verbatim)

- **A. ОДИНОЧНЫЙ СПУСК АВТОМАТОВ = uvolnění pohyblivých částí (vybíjení), NE palba.** `findings/10 §2:66` doslova: *„Never fire with the ОДИНОЧНЫЙ СПУСК buttons — they bypass the electric-trigger blocking; firing then occurs regardless of the ЦЕПЬ СТРЕЛЬБЫ toggle. Those buttons are for idle release of moving parts only."* → tlačítka jen plynule uvolní závěr při vybíjení/kontrole prázdné komory. **NIKDY palebný prvek.**
- **B. ПАН.НАЗЕМН = zpomalení pohonů** pro pozemní cíle (az 20±5, el 15±5°/s vs 65-75/55-65; dojezd 0,35°/s), `findings/08 p.76`. **NE bypass omezovače úhlů.** Omezovač sklání ОГРАНИЧЕНИЕ УГЛОВ, obchází АВАРИЙНАЯ.
- **C. ОГРАНИЧЕНИЕ УГЛОВ = volitelný selektor** (rotační), `findings/10 §4:145`. Pozice **OFF / 5 / 10 / 15 / 20 / 25 / 30 / 35 / 40°** (default 30°; pozemní = 0). NE fixní „pod 30°".
- **D. КОНТРОЛЬ БЛОКИРОВОК = kontrolní tlačítko interlocků** (Альбом 33), `findings/07 p.35`. Stiskem self-test palebného řetězce; lampa НЕИСПРАВНО nesmí svítit. Odlišné od gyro-lamp.
- **E. ГАГ skupina:** **ОТСТОПОРЕНО = roztočeno/ready** (gyro volně běží, stabilizace aktivní); ЗАСТОПОРЕНО = točí se nahoru (~3 min). `findings/10 §12:263`, `findings/01 p.347`.
- **F. ЕСТЬ ДАННЫЕ** svítí na pultu velitele **i** na pultu naváděče **i** na СРП (`findings/08 p.89`); v Альбом legendě nemá vlastní sekvenční číslo (může být na СРП/наводчик). Pro demo OK na pultu velitele.

**Mimo pult (ne sem):** КОМПРЕССОР je na samostatném pneumo-panelu (`findings/10 §4:166`), ne na pultu velitele. Žádný ovladač závěru na pultu velitele.

---

## Inventář (38 prvků, po skupinách)

### `pwr` — Napájení / БПС (měnič)
| Funkce (RU) | EN/CZ | n (Альбом) | n70 (ИЭ1970) | typ | co dělá | sim-key | conf |
|---|---|---|---|---|---|---|---|
| ВКЛЮЧЕНИЕ ПИТАНИЯ | turret-net ON | 34 | 6 | btn | probudí pult (po startu generátoru řidičem vpustí 27,5 V do věže) | `turretNet=true` | ✅ |
| ОТКЛЮЧЕНИЕ ПИТАНИЯ | turret-net OFF | 32 | 4 | btn (red) | odřízne 27,5 V od věže (havarijní) | `turretNet=false` | ✅ |
| ПУСК БПС | converter START | 37 | 36 | btn | nahodí měnič → 220 V/400 Hz (+115 V) pro radar/СРП/pohony | `converterOn=true` | ✅ |
| СТОП БПС | converter STOP | 36 | 1 | btn | zastaví měnič → odřízne AC od elektroniky | `converterOn=false` | ✅ |
| ОТКЛЮЧЕНИЕ ДИЗЕЛЯ | diesel cutoff | 38 | 2 | btn | na dálku zastaví В-6Р (fail-safe když řidič vyřazen) | `dieselStart=false` | ⚠️ |
| ВОЛЬТМЕТР (AC) | AC voltmeter 220 | 8 | 8 | gauge | napětí AC větve (220 V ±2 %) | read `b.ac220` | ⚠️ |
| ВОЛЬТМЕТР (DC) | DC voltmeter 27/55 | 9 | 9 | gauge | napětí DC větve (27,5 / 55 V dle selektoru) | read `batteryVolts` | ⚠️ |
| 27В-55В | DC-range selektor | 13 | 7 | sel | přepíná měřený DC rozsah voltmetru | `dcRange` | ⚠️ |
| НАПРЯЖ. ФАЗ | phase-voltage selektor | 10 | 34 | sel | cyklí měření fází AC na voltmetru | `phaseSel` | ❓ |

### `fire` — Okruh střelby (palebná brána + bypassy)
| Funkce (RU) | EN/CZ | n (Альбом) | n70 | typ | co dělá | sim-key | conf |
|---|---|---|---|---|---|---|---|
| ЦЕПЬ СТРЕЛЬБЫ (тумблер) | firing-circuit master | 26 | 11 | tgl | hlavní povolení palebného řetězce | `tsepFire` | ✅ |
| ЦЕПЬ СТРЕЛЬБЫ (лампа) | firing-circuit lamp | 25 | 10 | lamp | svítí když je palebný okruh pod proudem | read `tsepFire` | ✅ |
| КОМАНДИР-ОПЕРАТОР | station select | 20 | 9 | tgl | komu patří spoušť (velitel ↔ naváděč) | `station` | ✅ |
| АВАРИЙНАЯ СТРЕЛЬБА | emergency fire (plomba) | 31 | 17 | tgl | obejde omezovač úhlů + ЕСТЬ ДАННЫЕ; **NE poklop, NE chlazení** | `avariynaya` | ✅ |
| ШУНТ-СРП | SRP shunt | 11 | 18 | tgl | СРП (přes počítač) ↔ ШУНТ (přímo z radaru/optiky) | `shuntSrp` | ✅ |
| ОГРАНИЧЕНИЕ УГЛОВ | angle-limit selektor | 17 | 19 | sel (0–40°) | min. náměr pro palbu (chrání vlastní jednotky/konstrukci) | `angleLimit` | ✅ |
| ПАН.НАЗЕМН | ground-mode | 18 | 29 | tgl | **zpomalí pohony** pro pozemní cíle (NE bypass omezovače) | `panNazemn` | ✅ |
| ЛЮК ОТКРЫТ | hatch-open lamp | 19 | 19 | lamp (danger) | svítí když řidič otevřel poklop → tvrdá blokace palby+pohonů | read `!hatchClosed` | ✅ |
| ЕСТЬ ДАННЫЕ | data-present lamp | 12 | 20 | lamp | СРП vyřešil balistiku (jen režim 1–3); palba povolena | read `dataPresent` | ⚠️F |
| КОНТРОЛЬ БЛОКИРОВОК | interlock self-test | 33 | 31 | btn | stiskem ověří palebné blokace (НЕИСПРАВНО nesmí svítit) | — (demo) | ✅ |
| ОГОНЬ | fire trigger | — | 121 | btn | velitelova spoušť (na rukojeti); s ОХЛАЖДЕНИЕ on | — (demo) | ✅ |

### `guns` — Zbraně / munice / pyro
| Funkce (RU) | EN/CZ | n (Альбом) | n70 | typ | co dělá | sim-key | conf |
|---|---|---|---|---|---|---|---|
| СТРЕЛЬБА ВЕРХНИХ АВТ. | upper-pair enable | 5 | 14 | tgl | zapojí spouště horního páru automatů | `bankUpper` | ✅ |
| СТРЕЛЬБА НИЖНИХ АВТ. | lower-pair enable | 5 | 15 | tgl | zapojí spouště dolního páru (vyp jeden pár → 1700 ran/min) | `bankLower` | ✅ |
| ПИРОЗАРЯЖАНИЕ ×3 | pyro-charge | 3/4/22 | 3/4/22 | btn | pyropatronami natáhne vybraný automat (cock bez energie výstřelu) | — (demo) | ⚠️ |
| КОНТРОЛЬ ПИРОПАТРОНОВ | pyro-cartridge check | 21 | — | btn/lamp | signalizuje připravené pyropatrony | — (demo) | ⚠️ |
| ЗАРЯЖЕНО ×4 | loaded lamps ЛСГ1-4 | 6 | 23 | lamp ×4 | per automat: svítí když dovřen ostrý náboj a uzamčen | `aux` (demo) | ✅ |
| ОДИНОЧНЫЙ СПУСК ×4 | idle-release (UNLOAD) | — | 21 | btn ×4 | **plynule uvolní pohyblivé části — VYBÍJENÍ, ne palba** | — (demo) | ✅A |
| ОСТАТОК ПАТРОНОВ ×4 | round counters СП1-4 | 7 | 24 | counter ×4 | mech. počitadla zbytku munice (2000) per automat | `aux` (demo) | ✅ |
| РОСА | fire-suppression (plomba) | 2 | 22 | btn | havarijní odpálení lahví ППО «Роса» (motorový oddíl) | — (demo) | ⚠️ |

### `cool` — Chlazení hlavní + hydropohon
| Funkce (RU) | EN/CZ | n (Альбом) | n70 | typ | co dělá | sim-key | conf |
|---|---|---|---|---|---|---|---|
| УРОВЕНЬ ОЖ | coolant-level gauge+lamp | 23 | 12 | gauge+lamp | hladina chladiva; lampa při kriticky nízké (prostřelená trubka) | `aux` (demo) | ✅ |
| ОХЛАЖДЕНИЕ | barrel-cooling pump | 24 | 123 | tgl | čerpadlo Д-4500 (~8 atm); **musí běžet aby palba** | `cooling` | ⚠️ |
| ГИДРОПРИВОД ВКЛ | powered-laying ON | 16 | 25 | btn | nahodí hydropohon (ДСО-20 → rychlé natáčení věže/zbraní) | `hydraulicOn=true` | ✅ |
| ГИДРОПРИВОД ВЫКЛ | powered-laying OFF | 14 | 27 | btn | vypne hydropohon → ruční kola | `hydraulicOn=false` | ✅ |
| ГИДРОПРИВОД ЛАМПА | powered-laying lamp | 15 | — | lamp | svítí když hydropohon běží | read `hydraulicOn` | ⚠️ |
| ГП АВАР | emergency laying | — | 28 | tgl | baterii poháněné pohony při pádu СЭП | `gpAvar` (demo) | ⚠️ |

### `gag` — Gyro-stabilizace ГАГ + přístroje
| Funkce (RU) | EN/CZ | n (Альбом) | n70 | typ | co dělá | sim-key | conf |
|---|---|---|---|---|---|---|---|
| ГАГ (тумблер) | gyro master | 27 | 35 | tgl | roztočí gyro pro stabilizaci (spin-up ≤3 min) | `gagOn` | ✅ |
| ЗАСТОПОРЕНО | spinning-up lamp | 30 | 3 | lamp | svítí během náběhu gyra (~3 min) | read `gagPhase==='spinup'` | ✅ |
| ОТСТОПОРЕНО | ready lamp | 28 | 5 | lamp | svítí po náběhu → stabilizace ready, palba za jízdy OK | read `gagReady` | ✅E |
| КОНТРОЛЬ (ГАГ) | gyro self-test | 33 | 31 | btn | stiskem testuje gyro | `gagControl` (demo) | ⚠️ |
| НЕИСПРАВНО | gyro-fault lamp | 35 | 33 | lamp | svítí když КОНТРОЛЬ odhalí poruchu → ГАГ vyp (bez stabilizace) | read `controlFault` | ⚠️ |

---

## Sim-key kontrakt (které pole čte/píše palebná/stabilizační logika)
- **`shilka-power.js`** (existuje): `converterOn` (ПУСК/СТОП БПС), `dieselStart`, `batteryVolts`; bus `{dc27,ac220,v115}`.
- **`shilka-stab.js`** (M2 nový): `gagOn` → `phase` (`spinup`/`ready`) → `gagReady`. Lampy ЗАСТОПОРЕНО/ОТСТОПОРЕНО/НЕИСПРАВНО.
- **`shilka-interlock.js`** (M2 nový) `canFire(s)`: `hatchClosed`, `cooling`, `elevationDeg` vs `angleLimit`, `dataPresent`+`radarMode`, `tsepFire`, `bankUpper`/`bankLower`, `station`, `avariynaya`, `gagReady`, `onMove`.
- **demo-only (`aux`/zatím bez logiky):** ЗАРЯЖЕНО, ОСТАТОК ПАТРОНОВ, ПИРОЗАРЯЖАНИЕ, ОДИНОЧНЫЙ СПУСК, РОСА, КОНТРОЛЬ БЛОКИРОВОК, ОГОНЬ, ГП АВАР, voltmetr-selektory, `turretNet`, `hydraulicOn`. `dataPresent`/`radarMode` → reálně z M3/M4 (radar/СРП).

**⚠️ one-source (k doověření):** ГП АВАР · НАПРЯЖ.ФАЗ · КОНТРОЛЬ ПИРОПАТРОНОВ · ОТКЛЮЧЕНИЕ ДИЗЕЛЯ číslo.
