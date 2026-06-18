# ЗСУ-23-4 «Shilka» — parametrický list (konstanty · proměnné · fyzika)

**Datum:** 2026-06-18
**Účel:** Vypsat VŠECHNY konstanty a fyzikální veličiny + runtime proměnné, které systém potřebuje. Data-based, se zdrojem.
**Zdroje:** `[M s.N]` SAM manuál hry · `[РЛС]` ruský radar-manuál · `[kaznu]` ruský kurz · `[ODIN]` WEG · `[design]` naše herní volba (NENÍ z manuálu) · `[?]` zatím nepotvrzeno.

---

## 1) KONSTANTY — reálné (pevné hodnoty)

### 1A. Elektro / napájení
| Konstanta | Hodnota | Jednotka | Zdroj |
|---|---|---|---|
| AC sběrnice | 220 / 400 / 3f | V / Hz / fáze | [M s.18] |
| DC sběrnice nízká | 27,5 | V | [M s.18] |
| DC sběrnice vysoká | 54 (≈55 real) | V | [M s.18, kaznu] |
| Turbína ДГ-4 otáčky | 6000 | ot/min | [M s.14] |
| Turbína výkon | 60 (80) | kW (hp) | [M s.14] |
| Turbína spotřeba | 90 | l/h | [M s.14] |
| Turbína životnost | 600 | h | [M s.18] |
| Generátor výkon | 40,45 | kW | [M s.14] |
| Baterie | 4× 12СТ-70М, 280 | ks, Ah | [M s.14] |
| Radar příkon | 11,5 | kW | [M s.15] |
| Chladicí pumpa | 2,8 | kW | [M s.27] |
| Hydraulika 2Э2 | 6 | kW | [M s.25] |

### 1B. Mobilita (ГМ-575)
| Konstanta | Hodnota | Jednotka | Zdroj |
|---|---|---|---|
| Motor V-6R | 195 (260) | kW (hp) | [M s.14] |
| Otáčky motoru | 2000 | ot/min | [M s.14] |
| Rychlost silnice / terén | 50 / 30 | km/h | [M s.14] |
| **Limit palby za jízdy** | 25 | km/h | [M s.19] |
| Převodovka | 5 + 1 | vpřed + zpět | [M s.14] |
| Palivo přední / zadní | 411 / 110 | l | [M s.14] |
| Spotřeba silnice / terén | 80 / 130 | l/100 km | [M s.14] |
| Bojová hmotnost | ~19 000 | kg | [ODIN] |
| Hmotnost věže | 4964 | kg | [M s.15] |
| Rozměry D×Š×V | 6,535 × 3,125 × 2,576 | m | [ODIN] |
| Výška s radarem | 3,572 | m | [ODIN] |
| Pojezdová kola | 6 / strana | ks | [ODIN, rig] |
| Světlá výška / šíře pásu / zdvih torze | — | — | [?] |

### 1C. Náměr / hydraulika (2Э2)
| Konstanta | Hodnota | Jednotka | Zdroj |
|---|---|---|---|
| Rychlost otáčení věže (azimut) | 70 | °/s | [M s.25] |
| Rychlost náměru hlavní (elevace) | 60 | °/s | [M s.25] |
| Rozsah elevace hlavní | −4 … +85 (typ.) | ° | [?] |
| Rozsah azimutu | 360 (plynule) | ° | [M] |

### 1D. Radar (1РЛ33 «Gun Dish»)
| Konstanta | Hodnota | Jednotka | Zdroj |
|---|---|---|---|
| Šířka paprsku | 2 | ° | [M s.21] |
| Hledací sken (svislý sektor) | 15 | ° | [M s.21] |
| Vlnová délka | 2 | cm | [M s.13] |
| Max dohled | 20 | km | [M s.15] |
| Detekce malého stíhače (MiG-21) | ~13 | km | [M s.15] |
| Měřítka dálky | 10 / 15 / 20 | km | [M s.23] |
| Dálkový indikátor: horní / lupa | 15 / 1 | km | [M s.24] |
| Sledování | konický sken | — | [M s.22] |

### 1E. Palebný počítač (1А7 СРП) a obálka
| Konstanta | Hodnota | Jednotka | Zdroj |
|---|---|---|---|
| **Efektivní obálka — čas letu** | 0,2 … 5,5 | s (Ту) | [M s.42] |
| **Efektivní obálka — dálka** | 200 … 2500 | m | [M s.42] |
| Omezovač náměru (default) | 30 (nastavitelný) | ° | [M s.42] |
| Hmotnost SRP | 180 | kg | [M s.15] |
| Vstupy | ε, β, R, Δε, Δβ, ΔR, Q, K | — | [M s.17] |
| Výstupy | Ту, Φ, βу, H | — | [M s.17] |

### 1F. Kanón (2А7 АЗП-23)
| Konstanta | Hodnota | Jednotka | Zdroj |
|---|---|---|---|
| Počet hlavní | 4 (2 horní + 2 dolní) | ks | [M s.26] |
| Kadence celkem | 3400 | ran/min | [M s.26] |
| Kadence/hlaveň | ~850 (~14/s) | ran/min | odvozeno z [M s.26] |
| Kadence celkem | ~56,7 | ran/s | odvozeno |
| Munice horní hlaveň | 480 | ran/ks | [M s.26] |
| Munice dolní hlaveň | 520 | ran/ks | [M s.26] |
| Munice celkem | 2000 (1500 OFZT + 500 BZT) | ran | [M s.15] |
| Vyprázdnění | ~35 | s | [M s.42] |
| Vzduch nabíjení | 5 l @ 65 | l, atm | [M s.27] |
| Chlazení tlak | 120 (8) | psi (atm) | [M s.27] |
| Životnost hlavně | 3000 | ran | [M s.8] |
| Proti vzduchu / zemi | 4 / 2 | hlavně | [M s.26] |

### 1G. Munice / balistika (23×152B)
| Konstanta | Hodnota | Jednotka | Zdroj |
|---|---|---|---|
| Úsťová rychlost | 980 | m/s | [M s.38/39] |
| OFZT hmotnost (střela) | 450 (188,5) | g | [M s.38] |
| OFZT HE náplň | 18 | g | [M s.38] |
| OFZT sebezničení | 11 | s | [M s.38] |
| Stopovka (obě) | 5,5 | s | [M s.38/39] |
| BZT hmotnost (střela) | 450 (190) | g | [M s.39] |
| BZT průraz @500 / @1000 m | 25 / 19 | mm RHA | [M s.39] |
| Skladba pásu | 3 OFZT : 1 BZT | — | [M s.39] |

**Balistická tabulka [M s.42]** (lookup pro rychlost/pokles/rozptyl/průraz):
| Ту [s] | Dálka [m] | Rychlost [m/s] | Pokles [m] | Rozptyl [m] | Průraz [mm] |
|---|---|---|---|---|---|
| 0 | 0 | 980 | 0 | 0 | 38 |
| 0,2 | 200 | 860 | 0,2 | 0,4 | 32 |
| 0,6 | 500 | 700 | 2 | 1,2 | 25 |
| 1,4 | 1000 | 520 | 10 | 2,8 | 19 |
| 2,5 | 1500 | 400 | 30 | 5 | 16 |
| 4,17 | 2100 | 310 | 85 | 8 | 14 |
| 5,5 | 2500 | 280 | 150 | 11 | 14 |
| 11 | 3800 | 210 | 600 | 22 | 13 |

### 1H. Cílová obálka / velení
| Konstanta | Hodnota | Jednotka | Zdroj |
|---|---|---|---|
| Max rychlost cíle | 450 (Mach 1,5) | m/s | [M s.11] |
| Max dálka cíle | 2500 | m | [M s.11] |
| Max výška cíle | 1500 | m | [M s.11] |
| Min výška (nízký cíl) | ~10 | m | [ODIN] |
| Posádka | 4 | osoby | [M s.15] |
| Datalink PU-12 | 25–30 | km | [M s.16] |
| Plotovací kruhy | 50/100/150/200 | km | [M s.34] |

---

## 2) KONSTANTY — herní ladění (NEJSOU z manuálu, naše volba)
*(současné hodnoty v `src/shilka-mechanics.js` → `SHILKA_TUNING`; reálnou kotvu nemají, ladíme pocitem)*
| Konstanta | Současná | Jednotka | Pozn. |
|---|---|---|---|
| Nahřátí radaru | 8 | s | [design] — manuál čas neuvádí |
| Spinup gyra | TBD | s | [design] |
| Výpočet dálky (range solve) | 2,5 | s | [design] |
| Teplo/rána | 0,036 | — | [design] |
| Limit přehřátí palby | 92 / 100 | — | [design] |
| Max délka dávky | 1,4 | s | [design] |
| Chyba pro ztrátu zámku | 5 | ° | [design] |
| Chlazení/s | 9 | — | [design] |
| Zásahový poloměr (drone) | 5,5 | m | [design] |
| ⚠ Úsťovka v kódu | 970 → **980** | m/s | opravit dle [M s.38] |

---

## 3) PROMĚNNÉ — runtime stav (co se za běhu mění)

### 3A. Napájení / start (bool/0..1)
`turbineOn` · `dcBus54` · `dcBus27` · `acBus` · `gyroSpun(0..1)` · `hydraulicsOn` · `radarFilament` · `radarAnode` · `radarHV` · `radarOnAir` · `radarWarmup(0..1)` · `srpPowered` · `srpReady` · `gunPower`

### 3B. Vozidlo / pohyb
`pos{x,y,z}` · `heading[°]` · `speed[km/h]` · `throttle` · `gear` · `wheelHeight[6×L,6×R]` · `wheelContact[…]` · `trackTensionL/R` · `fuel[l]`

### 3C. Věž / hlavně / radar (geometrie)
`turretAz[°]` (commanded vs actual) · `gunElev[°]` (cmd vs actual) · `turretAzRate` · `gunElevRate` · `radarAz` · `radarEl` (jen když `hydraulicsOn`) · `antennaSway{…}` (vlastní rig)

### 3D. Radar / sledování
`searchMode{sector|circular|null}` · `scanPhase` · `rangeScale[km]` · `contact(bool)` · `signal(0..1)` · `trackMode{acq|angle|fullauto|memory}` · `conicalErr` · `lockQuality(0..1)` · `rangeGate[m]` · `rangeGateLocked(bool)` · `sdcOn(bool)`

### 3E. Palebné řešení (počítané SRP)
vstup: `eps(ε)` `beta(β)` `R` `dEps` `dBeta` `dR` → výstup: `Tu[s]` `Phi(elev)` `BetaU(az)` `H[m]` · `leadAz` `leadEl` · `inEnvelope(bool)` · `haveData/ЕСТЬ ДАННЫЕ(bool)` · `elevLimiter[°]` · `shooter{commander|operator}`

### 3F. Kanón (per hlaveň + celek)
per hlaveň ×4 (UL,UR,LL,LR): `loaded(bool)` · `charged(bool)` · `ammo[ran]` · `enabled(bool)`
celek: `upperPairOn` · `lowerPairOn` · `firing(bool)` · `roundsFired` · `heat(0..1)` · `coolingOn` · `burstLen[s]`

### 3G. Cíl (per cíl)
`pos` · `vel` · `type{air|ground}` · `rcs` · `alt[m]` · `range[m]` · `radialSpeed[m/s]` · `alive`

---

## 4) ODVOZENÉ FYZIKÁLNÍ VELIČINY (počítané každý snímek)
| Veličina | Symbol | Vzorec / zdroj | Jednotka |
|---|---|---|---|
| Šikmá dálka | R | √(gnd² + výška²) | m |
| Pozemní dálka | — | √(Δx²+Δz²) | m |
| Elevace cíle | ε | atan2(výška, gnd) | ° |
| Azimut cíle | β | atan2(Δx, Δz) | mil/° |
| Rychlost přibližování | ΔR | v·LOS | m/s |
| Příčná rychlost | — | √(v² − ΔR²) | m/s |
| Čas letu | Ту | R / v_avg (nebo lookup tabulka 1G) | s |
| Pokles střely | — | lookup [M s.42] dle Ту | m |
| Rozptyl | — | lookup [M s.42] dle Ту | m |
| Předsah náměr/odměr | Φ, βу | SRP výpočet (ε,β,R,Δ…) | mil/° |
| Pokles rychlosti střely | v(t) | lookup [M s.42] | m/s |

> Mil↔°: Sovětský mil 6000/360°; manuálová „ду" notace ×6 = stupně (2,5 → 15°) [M s.30].
