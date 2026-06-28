# ЗСУ-23-4 «Шилка» — systémy, rozsah a architektura (fáze: POROZUMĚNÍ + SCOPE)

**Datum:** 2026-06-22 · **Status:** plánovací dokument — **nic se z tohohle ještě nestaví.**
Cíl téhle fáze: poznat *celý stroj* po funkčních blocích, vědět *jak se navzájem ovlivňují*, mít *kompletní řidičův panel*, a definovat *rozsah funkcí, které vlastně chceme*. Teprve potom vybereme první buildable kus.

**Vědomě ODLOŽENO (ale navrhujeme tak, ať to jde přidat):** opravy, ničení a degradace modulů, plná údržbová vrstva. Promýšlíme *funkce*, ne poškození.

## Jak číst tyhle dokumenty (3 vrstvy)
1. **Tento dokument** = vrchní mapa: bloky, páteře, autorita, rozsah. *Začínáš tady.*
2. **Detailní reference** (v repu, ověřené z manuálů):
   - `docs/reference/shilka-manuals/system-block-decomposition.md` — všech 13 + 6 bloků, per-blok detail + obě páteře.
   - `docs/reference/shilka-manuals/driver-station-inventory.md` — **~85 položek** řidičovy kapoty, po skupinách.
   - `docs/reference/shilka-manuals/crew-authority-map.md` — kdo-co-ovládá 1:1 + odpověď na „napětí".
   - `docs/reference/shilka-manuals/findings/01..10` — surové čtení manuálů (ověřená čísla).
   - `docs/reference/shilka-manuals/gpt-deep-rnd/` — GPT deep-dives + `driver/` (6 souborů).
3. **Návrhové specs:** [`2026-06-22-shilka-real-sim-master-design.md`](2026-06-22-shilka-real-sim-master-design.md) (vrchní syntéza + flagship blokace) + [`2026-06-22-shilka-mechanics-design-detail.md`](2026-06-22-shilka-mechanics-design-detail.md) (25 mechanik). Dřívější: `2026-06-21-shilka-engine-realism-design.md` (APU — spec'd), `2026-06-18-shilka-state-interlocks.md`, `2026-06-17-shilka-fire-control-mechanics-design.md`.

---

## 0. Mentální model: Shilka = elektromechanický organismus

Není to „tank se 4 hlavněmi". Je to stroj, kde **bojová síla vzniká z energie + dat + posádkové koordinace**, a kde každý podsystém má fyzickou příčinu, panel a logiku. Celé to drží **dvě páteře**:

- **⚡ Energetická páteř** — kdo a čím vyrábí proud, dva okruhy (DC + AC), kdo z nich odebírá.
- **🎯 Palebně-datová páteř** — jak se z radarového echa stane zásah (detekce → dálka → analogový počítač → míření → blokace → palba).

**Jediná nejdůležitější závislost celého stroje:** sběrnice **220 V / 400 Hz** ze СЭП. Visí na ní *všechno*, co dělá Shilku „radarem řízeným dělem" (radar, СРП, stabilizace, silové míření). Když padne, zbyde **ručně mířený kanón na bateriích**. Tahle hranice = master-brána celé simulace.

---

## 1. Funkční bloky (13 hlavních + 6 podpůrných)

> Detail per blok (funkce, crew, datové I/O, vliv) je v `system-block-decomposition.md`. Tady přehledová mapa.

| # | Blok (RU / EN) | Funkce | Crew | Napájecí obvod | Padne bez AC? |
|---|---|---|---|---|---|
| 1 | **ГМ-575** podvozek/mobilita (В-6М-1 diesel) | jízda, řízení, odpružení, pohon generátoru za jízdy | řidič | mechanický + 27,5 V (start/přístroje) | ne (jezdí dál) |
| 2 | **ДГ4М-1** plynová turbína (APU) | zdroj bojové energie na místě (1,5–2 h paliva) | řidič | 27,5 V (start) | ne (je to ZDROJ) |
| 3 | **СЭП** primární elektrika | ГИСВ generátor → ±27,5 V DC → ПС-14А → 220 V/400 Hz → Б-6В → 110/115 V; ВКУ slip-ring do věže | řidič (zdroj) / velitel (distribuce) | je to zdroj | — |
| 4 | **2Э2** silové pohony míření | hydraulika: odměr věže + náměr zbraně | naváděč (jemné) / velitel (zap.) | 220 V + 115 V + 27,5 V | **ANO → ruční kola** |
| 5 | **АЗП-23М** 4× 23mm kanón | palba, podávání pásů, el. spouště, chlazení | naváděč/velitel (palba) | 27,5 V (spouště) | spouště ne; míření ano |
| 6 | **1РЛ33М** radar (РПК «Тобол») | hledání + sledování + dálka; СУА řízení antény; IFF | naváděč + dálkař | 220 V/400 Hz + 27,5 V | **ANO → slepý** |
| 7 | **СРП Б-1** analogový počítač | z β/ε/D + náklonu počítá palebné předsažení (lead) | (auto) velitel/naváděč | 220 V/400 Hz + 27,5 V | **ANO** |
| 8 | **Stabilizace + ГАГ gyro + ОПК/ВПК** | stabilní mířicí linie; převod souřadnic; náklon vozidla do СРП | (auto) | 220 V/400 Hz + 27,5 V | **ANO** |
| 9 | **Optika/zaměřovače** (визир Б-7, прицел-дублёр, КПН, kupole, noční) | optické míření + záloha; velitelské předání cíle | velitel/naváděč/řidič | optika pasivní; noční 27,5 V | ne (záloha) |
| 10 | **ПАЗ** protiatomová ochrana | nagnetatel, 13 klapek, přetlak, filtr | velitel/řidič | 27,5 V + mechanika | ne |
| 11 | **УА ППО «Роса»** hašení | 3× 2L láhve, auto + ruční (přední/zadní zóna) | řidič (ruční) | 27,5 V | ne |
| 12 | **Komunikace** (Р-123М rádio, Р-124 vnitřní) | spojení + intercom posádky | všichni | 27,5 V (battery) | ne |
| 13 | **Navigace/kurz** (1Т34 / ТНА-2) | kurz/orientace | řidič/velitel | 27,5 V | ne |
| S1 | chlazení hlavní (85 l) | kapalinové chlazení AZP — podmínka palby | — | čerpadlo el. | částečně |
| S2 | pneumo-přebití (lahve) | nabití kanónu vzduchem | naváděč | pneumatika | ne |
| S3 | palivová soustava | diesel + GTD palivo (2 nádrže) | řidič | mechanika + el. čerpadla | ne |
| S4 | chlazení/předehřev/vzduch-start motoru | provoz В-6М | řidič | mechanika + 27,5 V | ne |
| S5 | ventilace (3 smyčky: řízení / věž / RPK-elektronika) | chlazení posádky + elektroniky | řidič/velitel | 27,5 V | ne |
| S6 | vytápění posádky | −27,5 V topné podložky | — | 27,5 V | ne |

---

## 2. Energetická páteř ⚡ (dva okruhy — ověřeno z manuálu)

```
ZDROJ (jeden z):  ДГ4М-1 turbína (na místě)  │  В-6М diesel přes reduktor СЭП (za jízdy)  │  ВИН externí zásuvka
                                   │
                          ГИСВ2-14/3000 generátor   (reguluje automaticky РН-23 / БР-211*)
                                   │
            ┌──────────────── ± 27,5 V DC ────────────────┐   ← okruh ①  (buffer: 4× baterie 12СТ-70М)
            │     (rozpětí mezi raily = 55 V; voltmetr «27В–55В»)
            │
            ▼  ПС-14А rotační měnič (DC motor → AC generátor)
        220 V / 400 Hz 3-fáze                              ← okruh ②
            │
            ▼  Б-6В transformátor
        110 V  +  115 V/400 Hz   → silové pohony 2Э2
            │
            ▼  ВКУ slip-ring (korba → věž)
   rozvádí 27,5 V DC + 220 V/400 Hz do věže (radar, pohony, lampy, pulty)
```

**Co přežije, když padne generátor (jen baterie 27,5 V):** rádio/intercom, lampy, el. spouště kanónu, noční optika, ruční kola míření, optický zaměřovač. **Co umře:** radar, СРП počítač, stabilizace, silové míření, anténa. → degradace na „ručně mířený kanón".

\* Drobnost k ověření: finding 06 (album 2012) zve regulátor **РН-23**, finding 10 (ИЭ 1970) **БР-211** — pravděpodobně různé edice/varianty stroje. Princip (auto-regulace) je stejný.

---

## 3. Palebně-datová páteř 🎯

```
hledací anténa → echo/blip (ОП)
      │
dálkař: zastrobuje cíl  ──┐  (dálková brána ZÁROVEŇ hradlí úhlový kanál → oba operátoři MUSÍ spolupracovat)
      │                   │
naváděč: «146 АВТ.» → kuželový sken zámek (úhel) + auto-dálka
      │
   β (azimut) · ε (elevace) · D (dálka)
      │
СРП Б-1 analogový počítač  ←  náklon vozidla ψ/θк/K  (z ГАГ gyro přes ОПК/ВПК)
      │
   palebné předsažení (lead)  βу · φ · Tу
      │
ОПК převede na plné mířicí úhly  Q · Ф
      │
2Э2 silové pohony → věž + zbraň míří na předsažený bod (stabilizovaně)
      │
PALEBNÉ BLOKACE (AND):  poklop zavřen · věž/kolébka odstoporovaná · sběrač článků zavřen
                         · chlazení běží · elevace ≥ «ОГРАНИЧЕНИЕ УГЛОВ» · «ЕСТЬ ДАННЫЕ»
      │
   el. spouště ЭЛСП I–IV → palba
```

---

## 4. Řidičova kapota — kompletní inventář (~85 položek)

> Plný výčet (ruský popisek · význam · typ · co dělá · obvod · autorita · zdroj) je v `driver-station-inventory.md`. Klíč: **panel je DVOJITÝ cluster — plná diesel sada A plná GTD sada.**

| Skupina | Položek | Co tam je |
|---|---|---|
| A. Napájení + voltmetr | 9 | ПИТАНИЕ ВКЛ/ОТКЛ, ЦЕПЬ ±27В, voltmetr, externí zásuvka |
| B. GTD / turbína | 18 | ПУСК/СТОП ГТД (pod krytem), ХОЛОДНАЯ ПРОКРУТКА, АВТОМАТ.ЗАП.ГТД, lampy СТАРТЕР/ГТД/ГЕНЕРАТОР/ОТКРЫТ.ЗАСЛ./ПРЕОБРАЗ., otáčky %, tlak/teplota oleje, teplota plynů, motohodiny |
| C. V-6 diesel | 16 | СТАРТЕР, МАСЛО/НАСОС ТОПЛИВА, ЖАЛЮЗИ, voda, olej, tacho, spidometr, palivo, motohodiny |
| D. Předehřev / zima | 10 | КЛАПАН ПОДОГРЕВА, СВЕЧА-ФОРСУНКА, ВЕНТ.ПОМПА, vytápění oddělení |
| E. Poklop / ventilace / ПАЗ | 13 | **ЛЮК ВОДИТ. + kontakt ПС-3**, ПРИТОЧ./ВЫТЯЖН.ВЕНТИЛ., СИГНАЛ ПАЗ |
| F. Světla / stěrače / výhled | 17 | ФАРЫ, ФАРЫ ТВН/ТВН-СМУ, СТЕКЛООЧ., ОБОГРЕВ СТЕКЛА, podsvit; periskop + boční přístroj |
| G. Ovládání podvozku | 14 | L/P řídicí páky, frikcion, horská brzda, řadicí páka + kulisa, ruční přívod paliva, palivový kohout, vzduchový start |
| H. Hašení (řidič) | 10 | УА ППО РУЧН., ПЕРЕДН./ЗАДН., ruční CO₂ |

**P0 (8 nejdůležitějších):** ВКЛЮЧЕНИЕ ПИТАНИЯ · voltmetr + ЦЕПЬ +27В (brána <18 V) · ХОЛОДНАЯ ПРОКРУТКА · ПУСК/СТОП ГТД · lampy СТАРТЕР/ГТД/ГЕНЕРАТОР · scan GTD otáčky%/tlak oleje/teplota plynů · ЛЮК ВОДИТ. + ПС-3 interlock · АВТОМАТ.ЗАП.ГТД pod krytem.

**Autorita (1:1, ověřeno):** řidič NEovládá napětí — to drží automatika. Řidič = **zdroj** (start GTD, otáčky ≥1550, svůj voltmetr, **havarijní odpojení generátoru při 57 V**). **Převodník (БПС) zapíná VELITEL** — řidič má jen zdrojové lampy ПРЕОБРАЗ. ГТД/ДИЗ.

---

## 5. Autorita posádky — kdo co ovládá (kompaktně)

> Plná tabulka + odpověď na „řidič vs velitel napětí" je v `crew-authority-map.md`.

| Systém | Velitel | Naváděč | Dálkař | Řidič |
|---|---|---|---|---|
| **Energie** | БПС převodník zap/vyp, bojové voltmetry, auto-start GTD, kill diesel | vlastní elektronika | radarový VN řetěz | **zdroj: GTD/V-6R, otáčky, voltmetr, 57 V cutoff** |
| **Radar režimy** | volí režim 1–5, sektor | **hledání/sledování, АВТ. zámek** | **RLS + anti-rušení** | — |
| **Dálka/data** | dostává ЕСТЬ ДАННЫЕ, hlásí az/el | úhlové sledování | **vlastní dálkovou bránu** | — |
| **Zbraň & palební právo** | **povoluje palbu, ЦЕПЬ СТРЕЛЬБЫ, pálí** | **nabíjí + pálí** | — | poklop = tvrdý interlock |
| **Pohony/míření** | pohony zap/vyp, КПН | **jemný naváděč** | — | poklop hradlí DSO-20 |
| **Pohyb** | dává povel + kill diesel | — | — | **řídí ГМ-575 na povel** |
| **ПАЗ (NBC)** | velí ПАЗ, kontroluje lampu poklopu | ВКЛ.ПАЗ | zavře poklop | **ПАЗ panel + klapky** |
| **Požár (ППО)** | РОСА, odpojí napájení věže | — | — | **ruční УА ППО** |
| **Omezovač úhlů** | **NASTAVÍ 30°/0°, potvrdí před palbou** | — | — | — |

---

## 6. Co už MÁME v kódu vs. co chybí

| Oblast | Stav | Kde |
|---|---|---|
| Jízda (motor, 7 převodů, spojka, řízení pákami, odpružení) | ✅ **HOTOVO** | `shilka-drive.js` |
| Co-op: obsazení sedaček + driver-authoritative pohyb | ✅ HOTOVO | `shilka-crew.js`, `mp.js` |
| Fire-control prototyp (7-switch napájení, radar warmup 8 s, burst/heat, solution-ready) | 🟡 prototyp | `shilka-mechanics.js` |
| Napětí jako veličina / baterie / ±27,5 V / 220-400 Hz | 🔴 **chybí** (jen 7 booleanů) | — |
| APU (ДГ4М) + dvoumotorový start | 🟡 spec'd, nepostavené | `2026-06-21-shilka-engine-realism-design.md` |
| Poklop-interlock, GTD start sekvence, řidičův panel | 🔴 **chybí úplně** | — |
| Stabilizace / СРП jako reálný počítač / omezovač úhlů | 🔴 chybí (jsou jen thresholdy) | — |
| ⚠️ Náměr clampnutý na **+62°** (realita **+85,5°**) | 🐛 k opravě | `shilka.js aimToTurret()` |

**Závěr:** kostra (jízda, co-op, rig) je hotová a věrná. Chybí **energetická + datová + bezpečnostní vrstva** — a to je přesně to, co tahle scope-fáze mapuje.

---

## 7. Rozsah funkcí, které chceme (per blok, tiery)

> „Chceme" = cílový rozsah. Pořadí stavby řešíme zvlášť (až tohle schválíš). **Opravy/ničení/údržba = samostatná pozdější vrstva, teď mimo rozsah.**

- **Energetika (СЭП):** ⭐ `ElectricalBus` se 2 okruhy (DC 27,5 V battery-buffered → AC 220/400 Hz přes měnič → 115 V pohony); generátor online/offline dle otáček; battery sag <18 V; 57 V cutoff; **sdílená páteř** — ostatní bloky z napětí ODEBÍRAJÍ (napětí klesne → radar šumí, pohony zpomalí, lampy pohasnou).
- **Mobilita:** ✅ hotovo; doplnit vazbu otáčky→generátor a `roadShock` (jízda → namáhání RPK, zatím bez damage).
- **APU (GTD):** start sekvence jako řidičova minihra (studené protočení → ПУСК → 44 % cutoff → generátor online); provozní pásma; pompaž → fallback na V-6R.
- **Poklop:** fyzická poloha × kontakt ПС-3 × seřízení × těsnost → tvrdý palebný interlock + výhled/NBC kompromis.
- **Palebné blokace + omezovač úhlů:** AND-řetěz `canFire` + «ОГРАНИЧЕНИЕ УГЛОВ» elektrické odříznutí (flagship z master docu).
- **Radar:** režimový stavový stroj (hledání/sektor/sledování) + obraz se šumem + dálková brána + 5-stupňový degradační žebřík + 1 rušení/přeladění.
- **СРП analogový počítač:** z β/ε/D + náklonu → lead; «ЕСТЬ ДАННЫЕ» jako reálný stav, ne dekorace.
- **Silové pohony 2Э2:** rate-limited míření (odměr 65–75°/s, náměr 55–65°/s) + ruční kola jako fallback; vázané na 115 V.
- **4 automaty AZP:** oddělená munice (480×2 + 520×2), horní/dolní páry, chlazení jako podmínka, dávková doktrína.
- **ПАЗ / ППО:** klapky/přetlak/lampy; ruční hašení přední/zadní zóna (bez damage modelu zatím).
- **Stabilizace · optika · komunikace · navigace:** namapované, rozsah upřesníme po prioritizaci.

---

## 8. Otevřené otázky (rozhodneme po strávení tohohle dokumentu)
1. **Granularita veličin:** spojité křivky (napětí/tlak/teplota jako reálná čísla s load-křivkami) vs. pásma (zdravé/sag/kritické)? — ovlivní co-op netcode.
2. **První buildable kus:** flagship slice „řidič odblokuje boj" (síť→GTD→generátor→poklop→palba odblokována) vs. nejdřív robustní `ElectricalBus` izolovaně?
3. **AI posádka pro sólo:** kolik z řidičovy/operátorských smyček dělá AI, aby sólo drželo tempo wave-shooteru, ale systémy nezmizely?
4. **Náměr +62° → +85,5°:** opravit hned (samostatný malý fix), nebo až s pohonovou vrstvou?
5. **Scany do repa:** kvůli TCC je teď nedostaneme — pro modelování je hodíš do chatu / na `/Users/Shared`. OK?
