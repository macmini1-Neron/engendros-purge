# ЗСУ-23-4 «Shilka» — kompletní katalog mechanik (data-based)

**Datum:** 2026-06-18
**Účel:** Vypsat ÚPLNĚ KAŽDOU mechaniku, kterou Shilka má/chceme, jednoduše a s důkazem. Tohle NENÍ design — je to mapa reálných dat, ze které budeme teprve navrhovat.
**Pravidlo:** žádná dojmologie. Každý řádek má důkaz.

## Zdroje (a zkratky pro sloupec „Důkaz")
- **[M s.N]** = SAM Simulator manuál *ZSU-23-4V1 Shilka Documentation* (EN, 44 s.) — `shilka-trainer/docs/ZSU-23-4V1_…_EN.pdf`. To je chování **té hry**, cos hrál.
- **[РЛС]** = ruský technický manuál *Устройство и эксплуатация ЗСУ-23-4М РПК-2М, Ч.1 РЛС* (149 s.) — na disku.
- **[kaznu]** = technický kurz kaznu.kz (ЗСУ-23-4, po sekcích).
- **[ODIN]** = US Army Worldwide Equipment Guide (TRADOC mirror).
- **[notes]** = tvoje vlastní odoperované poznámky ze SAM Simu.
- **[web]** = cílená webová sonda (cituji konkrétně).

> Pozn. k napětí: manuál hry uvádí **54 V DC** [M s.18]; reálná sběrnice je **55 V DC** [kaznu]. Bereme 54/55 V jako totéž.

---

## A. Napájení & start
| # | Mechanika | Jednoduše | Reálná data | Důkaz | Pro hru |
|---|---|---|---|---|---|
| A1 | Plynová turbína ДГ-4 (APU) | Nejdřív nastartuješ malou turbínu, ta dělá proud pro všechno | 6000 ot/min, 60 kW; dává **220 V/400 Hz AC, 27,5 V DC, 54 V DC**; spotřeba 90 l/h; životnost 600 h | [M s.18, s.14] | první krok startu; bez ní nic nejede |
| A2 | Baterie | Záloha/start | 4× 12СТ-70М, 280 Ah, 260 kg | [M s.14] | rezerva proudu |
| A3 | Gyro ГАГ | Roztočí se setrvačník, ten drží míření rovně i za jízdy | 3D stabilizace SRP+radaru, do **25 km/h** i zastaveno; ЗАСТОПОРЕНО→ОТСТОПОРЕНО | [M s.19] | bez něj se nedá stabilně mířit/střílet za pohybu |
| A4 | Vypnutí | Červené STOP | СТОП БПС | [M s.12] | shutdown |

## B. Pohyb / podvozek ГМ-575
| # | Mechanika | Jednoduše | Reálná data | Důkaz | Pro hru |
|---|---|---|---|---|---|
| B1 | Motor V-6R + jízda | Naftový motor, jezdí | 260 hp; **50 km/h silnice / 30 terén**; převodovka 5+1 | [M s.14, ODIN] | řízení vozidla |
| B2 | Palba za jízdy | Můžeš střílet i když jedeš (gyro to srovná) | „capable of firing on the move"; stabilizace do 25 km/h | [M s.5, s.19] | shoot-on-move ≤25 km/h |
| B3 | Pojezd po kolech / torzní zavěšení | Každé kolo kopíruje terén zvlášť | 6 pojezdových kol/stranu, torzní tyče | [ODIN, kaznu, rig] | terén po jednotlivých kolech (tvůj požadavek) |
| B4 | Napínání pásu | Pás se napíná/prověšuje | hnací+napínací kolo, pás | [rig, kaznu] | vizuál napínání pásu (tvůj požadavek) |
| B5 | NBC přetlak | Uvnitř přetlak, utěsněno | filtrovaná přetlaková ochrana | [M s.5] | atmosféra/immerze |

## C. Hydraulika & náměr 2Э2
| # | Mechanika | Jednoduše | Reálná data | Důkaz | Pro hru |
|---|---|---|---|---|---|
| C1 | Hydropohon 2Э2 | Hydraulika otáčí věží a zvedá hlavně — **radar/zbraň se hýbe jen když je zapnutá** | věž **70°/s** az, hlavně **60°/s** elev, 6 kW; ВКЛ/ВЫКЛ | [M s.25, s.15] | „radar se točí jen když napájený" (tvůj požadavek) |
| C2 | Slave na řešení (ФβуТу) | Přepneš a hlavně se SAMY natočí na vypočtený bod | „aim guns in az+elev towards calculated impact point" | [M s.41] | „náměr zbraně podle palebného úhlu z locku" (tvůj požadavek) |

## D. Radar 1РЛ33 РПК-2 «Gun Dish»
| # | Mechanika | Jednoduše | Reálná data | Důkaz | Pro hru |
|---|---|---|---|---|---|
| D1 | Nahřátí radaru | Lampičky po pořádku, než radar ožije | НАКАЛ (vlákno)→АНОДНОЕ→ВЫСОКОЕ→ВКЛ (na vzduch)→НАПРЯЖЕНИЕ; ВЫКЛ vypne | [M s.20, notes] | warmup řetěz |
| D2 | Hledání (sektor) | Úzký paprsek skenuje svisle pruh oblohy | paprsek **2°**, sken **15° sektor svisle**; dosah ~13 km (malý cíl) / 20 km max | [M s.21] | sektorové hledání |
| D3 | Sledování (konický sken) | Paprsek krouží kolem cíle a drží ho ve středu | conical scan, vyrovnává signál → centruje cíl | [M s.22] | lock/track; po zničení padá zpět na hledání |
| D4 | Měřítko dálky | Přepínáš dohled 10/15/20 km | МАСШТАБ 10-15-20 km | [M s.23] | range scale |
| D5 | Úhlový indikátor (panel X) | Obrazovka pro azimut/elevaci, myší hýbeš anténou | ε/β/R; az = LMB doleva-doprava, elev = nahoru-dolů | [M s.23] | stanoviště úhlového operátora |
| D6 | Dálkový indikátor (panel C) | Druhá obrazovka jen na dálku (range gate) | 2 stopy: horní 15 km, dolní 1 km lupa; range gate myší | [M s.24] | stanoviště dálkového operátora |
| D7 | SDC / pohyblivý cíl (Doppler) | Filtr odřízne zem, ale i pomalé/visící cíle | СЦ on / ШТ off; visící vrtulník může **zmizet** | [M s.37] | clutter filtr s rizikem (vrtulníky) |

## E. Palebný počítač 1А7 СРП
| # | Mechanika | Jednoduše | Reálná data | Důkaz | Pro hru |
|---|---|---|---|---|---|
| E1 | SRP počítač | Mechanický „mozek" — z dráhy cíle spočítá, kam mířit | 60 motorů/110 os; vstup ε,β,R,Δε,Δβ,ΔR + Q,K z gyra | [M s.17, s.28] | výpočet předsahu |
| E2 | Výstupy H/Φ/βу/Ту | altituda dopadu / náměr / odměr / čas letu | Ту čas, Φ elevace (+drop), βу azimut, H výška | [M s.29-32, s.17] | hodnoty řešení |
| E3 | Palebná obálka | Spoušť pustí JEN když je cíl v dosahu | **Ту 0,2–5,5 s = 200–2500 m**; „fire within effective range only" | [M s.42] | inhibice palby mimo obálku |
| E4 | ЕСТЬ ДАННЫЕ („máme data") | Zelená = teď smíš střílet | lampa svítí když cíl v obálce | [M s.42-44] | povolení palby |
| E5 | Omezovač náměru | Nepustí palbu moc nízko (aby granát neudělal škodu na zemi) | blokuje pod **30°** (default), nastavitelný; kvůli sebezničení OFZT | [M s.42] | low-angle inhibice |

## F. Kanón 2А7 АЗП-23 (4 hlavně)
| # | Mechanika | Jednoduše | Reálná data | Důkaz | Pro hru |
|---|---|---|---|---|---|
| F1 | 4 hlavně = 2 horní + 2 dolní | Proti letadlům všechny 4, proti zemi 2 | „all four vs aerial, two vs ground" | [M s.26] | **4 samostatné hlavně** v rigu |
| F2 | Výběr párů | Spínačem zapneš horní a/nebo dolní pár | СТРЕЛЬБА ВЕРХНИХ / НИЖНИХ | [M s.27] | „zapnout jen 2 hlavně" (tvůj požadavek) |
| F3 | Nabíjení per hlaveň | Každou hlaveň natlakuješ a nabiješ zvlášť | ПЕРЕЗАРЯДКА (LL/UL/UR/LR) → ЗАРЯЖЕНО; vzduch 5 l @65 atm | [M s.27] | per-barrel load/charge |
| F4 | Munice per hlaveň | Každá hlaveň má svůj počet ran | horní **480**/ks, dolní **520**/ks = 2000 | [M s.26, s.15] | per-barrel počítadla |
| F5 | Kadence | Hrozně rychle pálí | **3400 ran/min**; 2000 ran za ~35 s | [M s.26, s.42] | rychlé vyprázdnění |
| F6 | Chlazení | Voda chladí hlavně, jinak se uvaří | 2,8 kW pumpa, 120 psi (8 atm); ОХЛАЖДЕНИЕ | [M s.27, s.15] | heat/cooling model |
| F7 | Pevné hlavně (gas-operated) | Hlavně se při palbě nehýbou dozadu | plynová automatika → ствол neподвижen | [web: 2A7 gas-operated] | žádná recoil-animace stvolů |
| F8 | Životnost hlavní | Hlaveň se po čase opotřebí | 3000 ran (V1) | [M s.8] | volitelný wear |
| F9 | Disciplína dávek | Krátké dávky, pauzy | 5–10 ran/hlaveň, dávky 3–5 ran, 2–3 s pauza; nebo 50/hlaveň na rozkaz | [M s.42] | burst feedback |

## G. Munice
| # | Mechanika | Jednoduše | Reálná data | Důkaz | Pro hru |
|---|---|---|---|---|---|
| G1 | OFZT (HEI-T) | Tříštivý zápalný, na letadla; sám se zničí po 11 s | 980 m/s; pojistka MG-25 **self-destruct 11 s**; stopovka 5,5 s; HE 18 g | [M s.38] | HE + sebezničení (váže na omezovač náměru) |
| G2 | BZT (API-T) | Protipancéřový, na zem | 980 m/s; průraz 25 mm @500 m, 19 mm @1000 m | [M s.39] | AP náboj |
| G3 | Skladba pásu | Po 3 OFZT 1 BZT | 1500 OFZT + 500 BZT (3:1) | [M s.39, s.15] | belt mix |
| G4 | Balistická tabulka | Čím dál, tím pomalejší, větší pokles a rozptyl | viz tabulka níže (980→210 m/s, rozptyl 0→22 m) | [M s.42] | fyzika střely (lead/drop/rozptyl) |
| G5 | TZM dobíječ | Náklaďák veze náboje na doplnění | 2Т210 (ZIL-157), 4000 ran (2 doplnění) | [M s.40] | resupply |

**Balistická tabulka [M s.42]:**
| Ту | Dálka | Rychlost | Pokles | Rozptyl | Průraz |
|---|---|---|---|---|---|
| 0 s | 0 m | 980 m/s | 0 | 0 | 38 mm |
| 0,2 s | 200 m | 860 | 0,2 m | 0,4 m | 32 mm |
| 0,6 s | 500 m | 700 | 2 m | 1,2 m | 25 mm |
| 1,4 s | 1000 m | 520 | 10 m | 2,8 m | 19 mm |
| 2,5 s | 1500 m | 400 | 30 m | 5 m | 16 mm |
| 4,17 s | 2100 m | 310 | 85 m | 8 m | 14 mm |
| 5,5 s | 2500 m | 280 | 150 m | 11 m | 14 mm |
| 11 s | 3800 m | 210 | 600 m | 22 m | 13 mm |

## H. Cílení / posádka / velení
| # | Mechanika | Jednoduše | Reálná data | Důkaz | Pro hru |
|---|---|---|---|---|---|
| H1 | Posádka 4 | Velitel, úhlový operátor, dálkový operátor, řidič | 4 stanoviště (Z/Y, X, C, řidič) | [M s.15, notes, ODIN] | 4 sedačky / role |
| H2 | Autorita palby | Spoušť mačká velitel NEBO úhlový operátor | ЦЕЛЬ СТРЕЛЬБЫ: КОМАНДИР / ОПЕРАТОР | [M s.43-44] | co-op: kdo střílí |
| H3 | Cílové určení PU-12 | Venku tě navedou rádiem, kde je cíl | 9С482 БТР-60 ПУ-12, datalink→hlas; dosah 25-30 km | [M s.16, s.33] | externí naváděč |
| H4 | Plotovací deska (panel S) | Tabule s cíli: číslo, výška, typ, směr | typ 0-9 (0 rušič … 8 nepřítel), kruhy 50-200 km, směr v mil | [M s.34] | cueing display |
| H5 | 1 cíl naráz + cílová obálka | Sleduje jeden cíl; rychlý/vysoký nedá | max cíl **450 m/s, 2500 m, 1500 m** | [M s.11] | limit cílů |
| H6 | 6 režimů (2 hratelné) | Hlavní: plný radar-track + paměť | 1 auto, 2 optika+radar-dálka, 3 ZU paměť, 4 optika, 5 zem, 6 nouz | [M s.41] | výběr režimu |
| H7 | ZU (paměť) | Ztratíš cíl → radar dopočítá, kam letí | „radar follows predicted path" | [M s.41, s.44] | memory-track |

---

## Plný startovací řetězec (z celého manuálu)
1. ДГ-4 turbína (ПУСК БПС) → zkontroluj napětí (27/54 V, 220 V)
2. ГАГ gyro (ЗАСТОПОРЕНО→ОТСТОПОРЕНО)
3. 2Э2 hydraulika (ВКЛ)
4. Radar: НАКАЛ→АНОДНОЕ→ВЫСОКОЕ→ВКЛ (na vzduch)
5. СРП napájení (ПИТАНИЕ → ПРИБОР ГОТОВ)
6. 2А7 kanón: power → nabít 4 hlavně (ПЕРЕЗАРЯДКА) → zapnout páry (ВЕРХ/НИЖ)
7. Příprava palby: ФβуТу (slave na řešení) + ЗУ (paměť)
8. Acquire (sektor) → angle-track (X) → range-track (C) → Full Auto
9. ЕСТЬ ДАННЫЕ svítí → SPACE krátké dávky

## Otevřené nitky (k rozhodnutí PŘI designu, ne teď)
- Kolik z toho je „ovladatelné" vs. „naskriptované" (komplexnost vs. hratelnost).
- 4 sedačky / 2 obsaditelné: které 2 (řidič + fire-control? nebo úhel + dálka?) a jak přesedání.
- Rig: nahradit slitý blok hlavní 4 samostatnými; antény = vlastní sway rig.
- Co je v1 a co později.
