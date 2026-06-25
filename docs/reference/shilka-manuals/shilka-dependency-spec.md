# ЗСУ-23-4М «Шилка» — KOMPLETNÍ specifikace závislostí, sekvencí a komunikace (pro AI audit)

> **Účel:** Tento dokument je **kontrolní/auditní specifikace** celého závislostního a sekvenčního modelu Šilky pro náš simulátor. Je psaný tak, aby ho **jiná AI mohla ověřit 1:1 proti originálním manuálům**. Každé tvrzení má buď **zdroj** (`finding NN` = `docs/reference/shilka-manuals/findings/NN-*.md`, nebo `subsystem-states §X`, nebo `extrakce`), nebo je explicitně označeno **[ODVOZENO]** / **[GAP]**.
>
> **Co se má ověřit:** (1) sedí směr a podmínky každé závislosti? (2) sedí pořadí kroků v sekvencích? (3) sedí kdo co ovládá a kdo komu hlásí? (4) sedí čísla/prahy? (5) chybí nějaká funkce/vazba?

## 0. Notace
- `A → B` = „B závisí na A" / „A napájí/krmí B" (šipka = směr toku energie/dat/příčiny).
- `B ⇐ podmínka` = „B je pravda/živé, právě když platí podmínka".
- `∧` AND · `∨` OR · `¬` NOT · `≥/≤` prahy.
- Okruhy: **DC** = ±27,5 V stejnosměrný · **AC** = 220 V/400 Hz střídavý · **115** = 115 V/400 Hz (z Б-6В) · **mech** = mechanický pohon · **pneu** = pneumatika.
- Posádka: **Ř** řidič-mechanik · **V** velitel · **N** naváděč (operátor vyhledávání) · **D** dálkař (operátor dálnosti).

---

## 1. Architektura: dvě páteře + dvě „brány"
Celá Šilka stojí na dvou navzájem provázaných řetězcích závislostí:
1. **Energetická páteř** (§3) — kdo vyrábí proud a komu ho dává. **Master-brána = AC 220/400.**
2. **Palebně-datová páteř** (§4) — jak se z radarového echa stane mířicí úhel. **Druhá brána = palebné blokace (§5).**

> **Jediná nejdůležitější vazba celého stroje:** *bez AC 220/400 ⇒ mrtvý radar, počítač СРП, stabilizace i silové míření ⇒ zbývá ručně mířený kanón na bateriích.* (finding 06/08)

---

## 2. ENERGETICKÁ PÁTEŘ — graf závislostí (§3 rozepsaný)

### 2.1 Zdroje (vstup do generátoru)
- **Turbína ДГ4М-1 (APU)** → roztáčí reduktor СЭП → generátor. Na stojícím vozidle. Palivo na 1,5–2 h. (finding 08/10)
- **Diesel В-6М-1** → pohání pásy **A** přes reduktor СЭП s odběrem výkonu může točit generátor, ale jen při **≥1550 ot/min** (jinak generátor odpadne). (finding 05/08, D-019)
- **Externí ВИН** → vstříkne 220/400 + 27,5 přímo do sběrnice, **obejde generátor i měnič**. (finding 06 str.42)
- **Baterie 4×12СТ-70М** → drží DC, když generátor neběží (27,5 V @ ~700 A na ~30 min). Nestartují AC. (subsystem-states §1)

### 2.2 Generování + DC sběrnice
- `Turbína ∨ Diesel(≥1550)` → **Reduktor СЭП** → **Generátor ГИСВ2-14/3000** → **±27,5 V DC** (2 kanály, usměrňovače 5-В1/5-В2; reguluje РН-23 / БР-211 automaticky — **nikdo neladí napětí ručně**). (finding 06 str.38; pozn. РН-23 ve findingu 06 vs БР-211 ve findingu 10 — různé edice)
- **Formální pravidlo:** `dc27 ⇐ batteryMaster ∨ generatorOnline ∨ externalPower`
- **`generatorOnline ⇐ (GTD volnoběh 98,5–103,5 %) ∨ (dieselRpm ≥ 1550)`**

### 2.3 Konverze → AC → 115
- **±27,5 V DC** → **měnič ПС-14А (БПС)** → **220 V/400 Hz** (DC motor točí AC generátor). **Zapíná VELITEL** (ПУСК БПС), ne řidič. (finding 06/07)
- **220 V** → **transformátor Б-6В** → **110 V + 115 V/400 Hz** → 115 V pohání **silové pohony 2Э2** a **СРП**. (finding 08)
- **Formální pravidla:** `ac220 ⇐ externalPower ∨ (converterOn ∧ dc27)` · `v115 ⇐ ac220`

### 2.4 Distribuce do věže
- **ВКУ slip-ring** (kroužkový sběrač korba↔věž) přenáší **27,5 V + 220/400** do otáčející se věže. (finding 06)
- Příjemci ve věži: radar (РПК), pohony 2Э2, anténa, velitelský/operátorské pulty. (finding 06)

### 2.5 Kaskáda selhání (co umře když…)
| Selže | Důsledek |
|---|---|
| Turbína i diesel (žádný pohon) | generátor mrtvý → padá vše níže |
| Generátor (∨ externí) | bez DC z generátoru → jen baterie 27,5 V (~30 min) |
| Měnič ПС-14А (velitel ho nezapne) | **bez AC 220/400** → **radar + СРП + stabilizace + silové míření MRTVÉ**; zbývá DC: spouště, rádio, lampy, noční optika, ruční kola |
| Б-6В / 115 V | silové pohony 2Э2 + СРП mrtvé → ruční kola |
| Přepětí >57 V | řidič **havarijně odpojí generátor** (ОТКЛЮЧ.ГЕНЕРАТ. pod krytem 22) |

---

## 3. PALEBNĚ-DATOVÁ PÁTEŘ — tok dat

### 3.1 Řetěz (krok za krokem)
```
(1) Radar hledací anténa → echo/blip (ОП)                         [N čte indikátor Т-28М]
(2) Dálkař zastrobuje dálku (ручka 228) → "застробирована"        [D; dálková brána ZÁROVEŇ hradlí úhlový kanál]
(3) Naváděč «146 АВТ.» → kuželový sken zámek (dovorot 3,7°)       [N; po strobu D]
        → úhly β (azimut), ε (elevace), D (dálka) + rychlosti
(4) ГАГ → náklon vozidla ψ (sklon), θк (náklon), K (kurz)         [auto, přes ВПК]
(5) СРП Б-1: z β/ε/D + ψ/θк/K → palebné předsažení βу/φ/Tу        [auto]
(6) ОПК: lead → plné mířicí úhly Q (azimut), Ф (elevace)          [auto]
(7) Pohony 2Э2 → natočí věž+zbraně na předsažený bod (stabilizovaně)
(8) Palebné blokace (§5) → povolení
(9) Spouště ЭЛСП I–IV → palba
```
(finding 01/04/08; subsystem-states §3–7)

### 3.2 Klíčová spolupráce N↔D
- **Dálková brána dálkaře (D) zároveň otevírá úhlový kanál naváděče (N).** Bez strobu D není úhlový zámek → nelze do АВТОМАТ. **N a D musí spolupracovat** — jeden bez druhého cíl nezamkne. (extrakce; subsystem-states „Cross-Subsystem")

### 3.3 СРП — vstupy/výstupy (verifikovatelně)
- **Vstupy:** radar β/ε/D + rychlosti (6 kanálů); náklon ψ/θк/K přes ВПК (8); balistika ΔV₀%, typ munice. (subsystem-states §4)
- **Výstupy:** lead X/Y/Z, Vx/Vy/Vz, **βу/φ/Tу** → ОПК → Q/Ф pohonům · lampa **«ЕСТЬ ДАННЫЕ»** (cíl v zóně, brána palby v režimech 1–2). (subsystem-states §4)

### 3.4 Stabilizace (ГАГ Б-4 + ВПК Б-2М + ОПК Б-5)
- **ГАГ** měří ψ/θк/K → **ВПК** dělá korekce Δq/Δε (drží osu radaru na cíli) → **ОПК** dělá Q/Ф (stabilizace palebné linie). **обкатка Б-3** drží azimut antény v prostoru při otáčení věže. (finding 01 str.8–9)
- **Roztočení ≤3 min** (ЗАСТОПОРЕНО → ОТСТОПОРЕНО). Bez ГАГ ⇒ jen palba z místa. (finding 10, extrakce)

---

## 4. PALEBNÉ BLOKACE — `canFire` AND-řetěz (druhá brána)
**Palba je možná, právě když platí VŠE** (kterýkoli pád ⇒ bez 27,5 V na spouště):
```
canFire ⇐  poklop řidiče zavřen (ЛЮК ОТКРЫТ off)        [Ř, kontakt ПС-3]   finding 08 D-025
        ∧ věž odstoporovaná (стопор sňat)                                   finding 03/08
        ∧ kolébka AZP odstoporovaná                                         finding 03/08
        ∧ dvířka sběrače článků zavřená                                     finding 03
        ∧ chlazení hlavní běží (čerpadlo DC v sérii se spouštěmi)           finding 03
        ∧ elevace ≥ «ОГРАНИЧЕНИЕ УГЛОВ» (V nastaví 5–40°, ±2°)              finding 07/10
        ∧ režim-specific:  1–2 → «ЕСТЬ ДАННЫЕ» svítí
                           3   → platná paměť ЗУ (8–10 s)
                           4   → z místa, náklon ≤3–5°
                           5   → ruční
        ∧ «ЦЕПЬ СТРЕЛЬБЫ» zapnut (V)                                        finding 07
        ∧ stanice volena К/ОП (КОМАНДИР-ОПЕРАТОР)                            extrakce
```
**Override «АВАРИЙНАЯ СТРЕЛЬБА»** (pod plombou, V) obejde elevaci + blokace, **NE chlazení + poklop**. (extrakce)
**Tvrdá fakta:** ruční spoušť NEobejde ЦЕПЬ СТРЕЛЬБЫ ani chlazení (HW safety). Spouště = 4× ЭЛСП (27,5 V). (subsystem-states §7)

---

## 5. SEKVENCE — power-up po stanicích (PŘESNÉ POŘADÍ)
> Štafeta přes všechny 4 členy. Z extrakce findings 06/09/10 + 01 §8. Kroky věže (B–D) se prolínají (gyro se roztáčí, zatímco radar žhaví).

### 5.A Řidič — SEP + GTD (vyrobit proud)
1. **7 ПИТАНИЕ ВКЛ** → palubní síť 27,5 V.
2. **40 СИГНАЛ** (houkačka — varování posádky; turbína = okamžitý jekot).
3. **14 ХОЛОДНАЯ ПРОКРУТКА** (1–2 s) → otevře výfukové klapky → **čekej lampu 20 ОТКР.ЗАСЛ.** ⚠️ tvrdý zámek.
4. **14** znovu drž (≤10 s) → studené protočení; sleduj voltmetr **62 ≥18 V**, tlak oleje 0,15–0,2.
5. **10 ПУСК ГТД** → start; startér odpadá ve **44 %** → zelená **18 ГЕНЕРАТОР**.
6. Volnoběh **98,5–103,5 %** (tachometr 57) → **Ř hlásí veliteli „GTD started"**.
*(Diesel — paralelně, když je potřeba jet: **27 НАСОС ТОПЛИВА** → drž **46 НАСОС МАСЛА** do tlaku → **47 СТАРТЕР**.)*

### 5.B Velitel — bojové napájení + stabilizace
7. Zkontroluje voltmetry (30/32) ve spec.
8. **ПУСК БПС** (36) → měnič ON → **220 V** do věže (lampa ПРЕОБРАЗ.). ⭐ **Bez tohohle žádná AC.**
9. **35 ГАГ ON** → lampa ЗАСТОПОРЕНО → po **≤3 min** ОТСТОПОРЕНО → stiskne **КОНТРОЛЬ** (НЕИСПРАВНО nesmí svítit). ⭐ **Gyro zapíná velitel, NE řidič.**
10. **ПИТАНИЕ ~115В (83)** ON → silové pohony připravené.

### 5.C Dálkař — žhavení radaru
11. **186 НАКАЛ** → žhavení filamentů + auto-start ventilace RLS. *(čekej ~30 s / 3 min)*
12. **185 АНОДНОЕ** → anodové zdroje.
13. **224 ВЫСОКОЕ НАПРЯЖЕНИЕ ВКЛ** → vysílač; magnetron ~5 mA.
14. **213 РЕГУЛИР.ТОКА ГЕНЕР.** → nastav proud magnetronu na 25–33 mA (kontrola měřákem 218; rectifier 100–170 mA).
15. **220 ПОДСТРОЙКА ЧАСТОТЫ** → max signál → **219 → АВТОМ.** (frekvenční servo zamkne).

### 5.D Naváděč — vyhledávání + zámek
16. **171/170 КРУГОВОЙ / 152 СЕКТОР** (šířka) → spustí hledání.
17. **145 НАВЕДЕНИЕ** + ručky 142/147 → namíří anténu; **БАЛАНС МОСТА** vynuluje drift.
18. Najde echo → **D zastrobuje dálku (228)** → **N «146 АВТ.»** → zámek (dovorot 3,7°) → β/ε/D tečou do СРП.

### 5.E Palba ready
19. **V: «ОГРАНИЧЕНИЕ УГЛОВ»** nastaví (30° vzduch / 0° zem) + potvrdí.
20. **V: «ЦЕПЬ СТРЕЛЬБЫ» ON** (lampa 25).
21. **СРП → «ЕСТЬ ДАННЫЕ»** se rozsvítí (cíl v zóně + platná data).
22. **V: «КОНТРОЛЬ БЛОКИРОВОК»** → všechny blokace OK.
23. **V: spoušť 121 ОГОНЬ** (nebo N přes 143+144 dle КОМАНДИР-ОПЕРАТОР).

### 5.F Power-down (reverzně)
D: ВЫСОКОЕ ВЫКЛ → АНОДНОЕ → НАКАЛ off · N: pohony off · V: 115В off → ГАГ off → СТОП БПС · Ř: 3 min volnoběh → СТОП ГТД → 2–3 studená protočení (chlazení) → ЗАКР.ЗАСЛ → ПИТАНИЕ ОТКЛ. (finding 01 §power-off, finding 10)

---

## 6. TVRDÉ START-ZÁMKY (musí platit, jinak poškození)
1. **GTD: klapky před startem** — `gtdStart povolen ⇐ flapsOpen` (lampa 20). Bez klapek se turbína udusí vlastními plyny → poškození/požár. (extrakce, majitelova korekce)
2. **Diesel: tlak oleje před startérem** — `dieselStart povolen ⇐ oilPressure ≥ 0,5`. Bez tlaku oleje zadření V-6 (předmazací pumpa МЗН 46). (extrakce)
3. **Baterie ≥18 V** — `canStartGtd ⇐ batteryVolts ≥ 18`. Pod 18 V při startéru zákaz/poškození. (finding 10 D-009)
4. **Houkačka 40** před jakýmkoli startem (bezpečnost posádky). (extrakce)

---

## 7. PER-SUBSYSTÉM — needs / produces / dies-when / fallback (15)
> Plný detail (stavy/režimy/čísla/poruchy) je v `subsystem-states.md`. Tady kompaktní závislostní matice pro audit.

| Subsystém | Potřebuje (napájení + data) | Produkuje | Umře když | Fallback |
|---|---|---|---|---|
| СЭП elektrika | mech pohon (diesel/APU) | DC 27,5 · AC 220/400 · 115 | žádný pohon ∧ ¬externí | baterie 27,5 (~30 min) |
| 2Э2 pohony | 115 + DC + ОПК úhly Q/Ф | natočení věž+zbraň | ДСО-20 off / bez AC | ruční kola (10× pomaleji) |
| Radar 1РЛ33 | AC + žhavení + ГАГ + ventilace | β/ε/D + echo na indikátory | bez AC / žhavení / ventilace | optika (degradační žebřík) |
| СРП Б-1 | 115 + radar(β/ε/D) + ГАГ(ψ/θк/K) | lead Q/Ф + ЕСТЬ ДАННЫЕ | bez 115 / drift gyra | režim 4 prstenec / 5 mřížka |
| Stabilizace ГАГ | DC(gyro) + 115 + radar | korekce náklonu, stab. linie | gyro drift / НЕИСПРАВНО | palba z místa |
| АЗП kanón | DC(spouště) + 2Э2(náměr) + chlazení + pneu | palba | chlazení off / přehřátí | 3 automaty / ruční přebití |
| Blokace (canFire) | DC + stavy 9 podmínek (§4) | 27,5 V na spouště | kterákoli podmínka false | АВАРИЙНАЯ (kromě chlazení+poklop) |
| Pneumatika | DC(kompresor) | tlak 56–65 → přebití | <35 kg/cm² / kompresor mrtvý | ruční přebití (15–20 s) |
| Motor/palivo/chlazení | mech + DC(start/čerpadla) | mech výkon | přehřátí >110 °C | druhý motor / baterie |
| ПАЗ | DC(dmychadlo) + mech klapky | přetlak, ochrana | klapka zaseklá | — (věž volná = nebezpečné) |
| УА ППО | DC(solenoidy) | hašení 2 zóny | prázdná lahev | ruční přední/zadní |
| Optika/zaměřovače | pasivní (noční DC) | optické míření | — | záloha vždy |
| Komunikace Р-123/124 | DC | spojení/intercom | bez DC | — |
| Navigace 1Т34/ТНА | DC | kurz | bez DC | — |
| Chlazení hlavní (S1) | DC(čerpadlo) + ОЖ | chlazení 4 hlavní | čerpadlo/hladina | **bez něj NELZE pálit** |

---

## 8. KOMUNIKACE / AUTORITA POSÁDKY (kdo co ovládá + komu hlásí)
| Systém | Velitel (V) | Naváděč (N) | Dálkař (D) | Řidič (Ř) |
|---|---|---|---|---|
| Energie | БПС měnič on/off, bojové voltmetry, auto-start GTD, kill diesel | vlastní elektronika | radarový VN řetěz (НАКАЛ→ВЫСОКОЕ) | **ZDROJ: GTD/V-6R, otáčky, voltmetr, 57 V cutoff** |
| Radar režimy | volí režim 1–5, sektor | **hledání/sledování, АВТ. zámek** | RLS + anti-rušení | — |
| Dálka/data | dostává ЕСТЬ ДАННЫЕ | úhlové sledování | **vlastní dálkovou bránu (228)** | — |
| Zbraň & palební právo | **povoluje, ЦЕПЬ СТРЕЛЬБЫ, pálí** | nabíjí + pálí (143/144) | — | poklop = tvrdý interlock |
| Pohony/míření | pohony on/off, КПН | **jemný naváděč** | — | poklop hradlí DSO-20 |
| Pohyb | povel + kill diesel | — | — | **řídí ГМ-575 na povel** |
| ПАЗ | velí ПАЗ, kontroluje lampu poklopu | ВКЛ.ПАЗ | zavře poklop | ПАЗ panel + klapky |
| Požár ППО | РОСА, odpojí napájení věže | — | — | ruční УА ППО |
| Omezovač úhlů | **NASTAVÍ + potvrdí** | — | — | — |
| Gyro ГАГ | **ZAPÍNÁ (35), 3 min, КОНТРОЛЬ** | — | — | — |

**Hlášení (komunikace):** Ř → V: „GTD started / generátor v síti / otáčky nízké / požár vzadu". D → V: „застробирована / dálka po 500 m / data nespolehlivá". N → V: „cíl zamknut / ztrácím cíl, sjíždím žebřík". V → posádka: „zavřít poklop / palebné právo / nastav omezovač / nouzová palba". (extrakce, shilka-jak-to-funguje §6)

---

## 9. KVANTITY & PRAHY (k číselnému ověření)
| Veličina | Hodnota | Zdroj |
|---|---|---|
| DC sběrnice | ±27,5 V (span 55 V) | finding 06/08 |
| AC sběrnice | 220 V ±2 % / 400 Hz (+2/−4 %) | finding 08 |
| Odvozený rail | 115 V/400 Hz (přes Б-6В) | finding 08 |
| Baterie | 4×12СТ-70М, 27,5 V @ ~700 A / ~30 min | subsystem-states §1 |
| Diesel→generátor | ≥1550 ot/min | finding 08 D-019 |
| GTD volnoběh | 98,5–103,5 % | finding 10 |
| GTD startér cutoff | 44 % | finding 10 D-013 |
| GTD plyny/olej | ≤650 °C / ≤110 °C | finding 10 D-016 |
| Tlak oleje (protočení/běh) | 0,15–0,2 / 0,5–2,5 kg/cm² | finding 10 D-010 |
| Baterie start min | ≥18 V | finding 10 D-009 |
| Přepětí cutoff | 57 V | finding 10 D-023 |
| Náměr | −4,5° až +85,5° | finding 07 |
| Odměr | 360° neomezeně | finding 07 |
| Rychlost odměr/náměr | 65–75 / 55–65 °/s | finding 03 §40 |
| Omezovač úhlů | 8 poloh 5–40°, ±2° | finding 07/10 |
| Munice | dolní 480×2 + horní 520×2 (~2000) | finding 07/08 |
| Kadence | ≥3400 ran/min celkem | finding 07 |
| Chlazení hlavní | 85 l | finding 03 |
| Životnost hlavně | 4500 ran | finding 03 |
| Detekce / track / mrtvá zóna | 12000 / 10000 / 200 m | finding 04 |
| Magnetron | 15 GHz, 90–120 kW, proud 25–33 mA | finding 01 |
| Pneumatika | 56–65 kg/cm² (2×3 l); anténa ≥20 | finding 03/10 |
| Palba za jízdy | ≤40 terén / ≤20–25 pás km/h, náklon ≤10° | finding 10 |
| GTD palivo | 1,5–2 h na místě | finding 08 |

---

## 10. IMPLEMENTOVANÝ MODEL (`src/shilka-power.js`) vs realita
> Co už je v kódu (a node-testováno) — auditor ať porovná pravidla s §2/§6.
- `dc27 = batteryMaster ∨ generatorOnline ∨ externalPower` ✅ §2.2
- `ac220 = externalPower ∨ (converterOn ∧ dc27)`, `v115 = ac220` ✅ §2.3
- `flapsOpen ⇐ coldCrank` (latch) ✅ §6.1
- GTD: `gtdStart ∧ flapsOpen → starting → (rpm≥98,5) idle`; `gtdStart ∧ ¬flapsOpen → fault` ✅ §6.1
- `oilPressure ⇐ oilPumpHeld` ; `diesel běží ⇐ dieselStart ∧ fuelPump ∧ oilPressure≥0,5` ✅ §6.2
- `generatorOnline ⇐ (gtd idle) ∨ (dieselRpm≥1550)` ✅ §2.2
- `canStartGtd ⇐ batteryVolts≥18 ∧ flapsOpen` ; battery sag pod startérem ✅ §7-zámky
- **NEimplementováno zatím:** AC consumers jako reálné stavové automaty (radar/СРП/2Э2/АЗП = jen svítí dle buses), palebné blokace (§4), stabilizace, pneumatika, ПАЗ/ППО → moduly `shilka-{interlock,stab,radar,srp,drives,gun,pneu,aux}.js` v M2–M5.

---

## 11. OTEVŘENÉ OTÁZKY / GAP (k doověření z manuálu)
- Regulátor napětí: **РН-23** (finding 06, album 2012) vs **БР-211** (finding 10, ИЭ 1970) — různé edice? **[ověřit]**
- Přesný čas náběhu napětí po startu GTD **[GAP]**.
- Model rozptylu palby (teplota hlavně/opotřebení/stabilizace) **[GAP]**.
- СДЦ/MTI vs frekvenční odstup (odolnost rušení) **[GAP]**.
- Práh driftu ГАГ vs čas mise (kdy НЕИСПРАВНО) **[GAP]**.
- Velitelský pult pol. 1/10/12/27, БАЛАНС МОСТА poloha, ВОБУЛЯЦИЯ seal, КПН hand-off — z extrakce nezachyceno přesně **[ověřit ze scanu str.35]**.

---

## 12. Zdrojová mapa (kde auditovat)
`findings/01..10` (čtení manuálů) · `subsystem-states.md` (15 podsystémů) · `crew-authority-map.md` · `shilka-driver-panel-anatomy.md` (řidič ~60) · `shilka-jak-to-funguje.md` (prozaický řetěz) · `system-block-decomposition.md` (bloky + páteře) · `gpt-deep-rnd/` (deep-dives). Kód: `src/shilka-power.js` + `tests/shilka/*.test.mjs`. Demo: `demoshilka.html` + `demo/shilka-modules.js`.
