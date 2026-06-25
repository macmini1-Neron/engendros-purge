# ЗСУ-23-4М «Шилка» — podsystémy: stavy · režimy · veličiny (1:1)

Funkční stavy, režimy, klíčové veličiny, vstupy/výstupy, poruchové módy a závislosti každého podsystému — předloha pro logické moduly `src/shilka-*.js`. Z `findings/01,03,04,06,08,10` + `gpt-deep-rnd/`. *2026-06-23.*

> Legenda závislosti na napájení: **DC** = ±27,5 V · **AC** = 220 V/400 Hz · **115** = 115 V/400 Hz (přes Б-6В) · **mech/pneu** = mechanika/pneumatika.

## 1. СЭП — primární elektrika  → `shilka-power.js`
- **Stavy:** off (jen baterie) · gen spin-up (turbína ДГ4М *nebo* diesel ≥1550 ot) · AC online (ПС-14А) · regulováno (РН-23/БР-211).
- **Veličiny:** ±27,5 V DC (+55 V span) · 220 V/400 Hz ≤10,5 kVA · 115 V přes Б-6В · 4×12СТ-70М drží **27,5 V @ ~700 A na ~30 min** · ВКУ slip-ring korba→věž · externí ВИН (220/400 + 27,5).
- **Pád:** APU/diesel off ⇒ bez AC ⇒ radar/СРП/pohony mrtvé (jen 27,5 V baterie + ruční) · měnič off ⇒ bez 115/220 · přepětí (generátor bez regulace) ⇒ relé Р10-1 blokuje anodový palebný okruh · **57 V → havarijní odpojení generátoru (řidič)**.
- **Dep:** mechanický pohon (diesel/APU) + regulace.

## 2. 2Э2 — silové pohony míření  → `shilka-drives.js`
- **Režimy:** **АВТОМАТ** (auto-track z ОПК) · **ПОЛУАВТ.** (ruční ручky Т-55М1) · **РУЧН.** kola (spojky rozpojeny, ~2–5°/s) · OFF.
- **Rychlosti:** odměr **65–75°/s** (360° za 4,8–5,5 s; pozemní 20±5) · náměr **55–65°/s** (celý −4..+85° za 1,5±0,3 s; pozemní 15±5) · dojezd po puštění ≤1,5°/s.
- **HW:** 2 variabilní čerpadla (swashplate 0–30°) + 2 pevné hydromotory · Т-39М zesilovač · АДП-1121 (odměr) · elektromagnet (náměr) · motor **ДСО-20** (220/115 V) · olej МГЕ-10А 40 l · tachogen. zpětná vazba.
- **Pád:** ДСО-20 off ⇒ jen ruční kola (10× pomaleji) · únik ⇒ pokles tlaku, overshoot · studený olej ⇒ 3–5 min náběh · swashplate zaseklý ⇒ jedna osa mrtvá · tachogen. ⇒ hunting. Limit běhu **≤2 h → ≥1 h chlazení**.
- **Dep:** СЭП (115+220), ОПК (úhly Q/Ф), stabilizace, interlock.

## 3. Radar 1РЛ33М  → `shilka-radar.js`
- **Stavy:** off · žhavení **НАКАЛ** (3 min + ventilace) · **АНОДНОЕ** ready · **ВЫСОКОЕ** (HV, keep-out ≥80 m) · search-ready · track-ready.
- **Search:** kruhový 20°/s · zrychlený 45–60°/s · sektor 30–100° (rastr 15° elevace @ 23 Hz). **Track:** kuželový sken 63 Hz, dovorot **3,7°** na «146 АВТ.».
- **Veličiny:** detekce ≥**12 000 m** / auto-track ≥**10 000 m** · mrtvá zóna **200 m** · přesnost dálky 10 m · anténa elevace −9..+87°, azimut neomezený (обкатка) · magnetron 15 GHz, 90–120 kW · PRF 4750±250 Hz (nebo ВОБУЛЯЦИЯ 3650–4750).
- **Výstup:** β/ε/D + rychlosti → СРП · echo na Т-28М (search) + Т-23М2 (range).
- **Pád:** bez AC ⇒ mrtvý · přeskočené žhavení ⇒ slabé echo/falešný zámek · −150 V rail ⇒ relé Р10-1 blokuje ВЫСОКОЕ · ventilace ⇒ přehřátí, šum↑ · pasivní rušení ⇒ СДЦ/MTI + ВОБУЛЯЦИЯ · aktivní šum ⇒ přeladění f1/f2.
- **Degradační žebřík:** RLS-auto → optika+RLS-dálka → paměť ЗУ (8–10 s) → prstenec → dálk. mřížka → ruční/baterie.
- **Dep:** СЭП, ГАГ, ventilace, interlock.

## 4. СРП Б-1 — analogový palebný počítač  → `shilka-srp.js`
- **Stavy:** off (bez 115 V) · ready · compute (УПР) · output (φ,βу,Tу).
- **Vstupy:** radar β/ε/D + rychlosti; náklon ψ/θк/K (ГАГ→ВПК); balistika ΔV₀%, typ munice.
- **Výstupy:** lead X/Y/Z, Vx/Vy/Vz, **βу/φ/Tу**, mířicí úhel α → Q/Ф do ОПК · lampa **«ЕСТЬ ДАННЫЕ»** (cíl v zóně, palebná brána v režimech 1–2).
- **Pád:** bez 115 V ⇒ mrtvý → režim 4 (prstenec, jen z místa) / 5 (mřížka) · drift ГАГ ⇒ lead chyba roste · ztráta tracku ⇒ režim 3 ЗУ (8–10 s extrapolace) · mimo zónu ⇒ ЕСТЬ ДАННЫЕ zhasne. ШУНТ-СРП = bypass.
- **Dep:** radar, stabilizace, ОПК, 115 V.

## 5. Stabilizace ГАГ Б-4 + ВПК + ОПК  → `shilka-stab.js`
- **Stavy:** off · spin-up **≤3 min** (ЗАСТОПОРЕНО→ОТСТОПОРЕНО) · ready (КОНТРОЛЬ ok, НЕИСПРАВНО off) · fire-on-move (≤40 km/h terén / ≤20 pás, ≤10° náklon).
- **ГАГ:** měří ψ (sklon ±25°), θк (náklon ±30°), K (kurz 360°). **ВПК:** Δq, Δε (drží osu radaru na cíli). **ОПК:** plné úhly Q/Ф (stabilizace palebné linie). **обкатка Б-3:** drží azimut antény v prostoru při otáčení věže.
- **Pád:** ГАГ off ⇒ jen z místa (režim 4–5) nebo <3° / <20 km/h · drift ⇒ lead chyba · НЕИСПРАВНО ⇒ vyp auto-track · ВПК/ОПК porucha ⇒ bez lead. **Lampa ОТСТОПОРЕНО na řidičově panelu = povolení palby za jízdy.**
- **Dep:** DC (gyro) + 115 V (převodníky), radar, СРП, 2Э2.

## 6. АЗП-23М — 4 automaty 23 mm  → `shilka-gun.js`
- **Stavy/automat:** unloaded · charged (ЗАРЯЖЕНО) · firing · jammed · overheated · worn (>4500 ran).
- **Veličiny:** 4 automaty (horní pár + dolní pár, volitelné) **≥3400 ran/min** celkem · munice **horní 480×2 + dolní 520×2 = 2000** (findings/07:53+10:90; ⚠️ findings/08 to uvádí opačně — menšina 1:2) · elevace **−4°30′…+85°30′** (⚠️ hra clampuje +62°, špatně) · odměr 360° neomezeně · životnost hlavně **4500** (regulátor Ø3,4→3,2 @ 2000) · chlazení **85 l** (čerpadlo DC, podmínka palby) · přebití: pyro (pneu ~2–3 s) nebo ručně (10–15 s/automat).
- **Dávky (režim 1–2):** rychlé cíle 3–5 / 5–10 ran/automat (pauza 2–3 s); pozemní 3–5 / 5–10 (po 120–150 ranách → 10–15 s pauza); dlouhé (≤50) jen se souhlasem velitele + chlazení.
- **Pád:** přehřátí ⇒ zásek/rozptyl↑ · 1 automat zaseklý ⇒ asymetrická dávka (3 možné) · chlazení off ⇒ **nelze pálit** (tvrdý interlock přes relé chlazení) · munice asymetrie ⇒ jeden pár dojde dřív.
- **Dep:** 2Э2 (náměr), chlazení S1, pneu S2, DC (spouště), interlock.

## 7. Palebné blokace — `canFire` AND-řetěz  → `shilka-interlock.js`
- **Řetěz (vše musí platit):** poklop řidiče zavřen (ЛЮК ОТКРЫТ off) · věž odstoporovaná · kolébka AZP odstoporovaná · dvířka sběrače článků zavřená · **chlazení běží** (čerpadlo DC v sérii se spouštěmi) · **elevace ≥ ОГРАНИЧЕНИЕ УГЛОВ** (volitelně 5–40°, ±2°) · režim: 1–2 «ЕСТЬ ДАННЫЕ», 3 platná paměť, 4 z místa ≤3–5° náklon, 5 ruční · **«ЦЕПЬ СТРЕЛЬБЫ» on** · stanice К/ОП volena (КОМАНДИР–ОПЕРАТОР).
- **Override:** **«АВАРИЙНАЯ СТРЕЛЬБА»** (pod plombou) obejde elevaci + blokace, NE chlazení + poklop.
- **Spouště:** 4× ЭЛСП (27,5 V), spoušť К (rukojeť 121) / ОП (143+144) / nožní pedál.
- **Pád:** kterýkoli blok ⇒ bez 27,5 V na spouště · zoxidovaný kontakt ⇒ lampa lže vs realita. **Ruční spoušť NEobejde ЦЕПЬ СТРЕЛЬБЫ ani chlazení (HW safety).**

## 8. Pneumatika — přebití  → `shilka-pneu.js`
- **Stavy:** low (<35 kg/cm² → přebití zamčené) · ready (56–65) · high (>65 → pauza) · kompresor run (КПВ-1Б, ~30 min z ~30 na 56–65 @ 27,5 V).
- **Veličiny:** prac. **2×3 l lahve**, kompresor **КПВ-1Б** plní stupňovitě **30–35 → plných 56–65 kg/cm²** (~30 min @ 27,5 V, pak auto-stop) · **záložní lahev (od 1967): zima 110–120 / léto 140–150 kg/cm²** · únik ≤0,5 kg/cm²/h · anténa nahoru ≥20 kg/cm² · (vzduch-start motoru В-6Р **150/100** je SAMOSTATNÝ okruh — §9).
- **Pád:** <35 ⇒ jen ruční přebití · kompresor mrtvý ⇒ pokles za 2 h na 0 · anténní ventil zaseklý ⇒ nelze zvednout radar.
- **Dep:** DC (kompresor).

## 9. Motor · palivo · chlazení · předehřev · ПАЗ · ППО  → `shilka-aux.js`
- **Motor В-6М:** 6-válec diesel 280 hp @ 2000 ot · palivo přední 411 l + zadní 110 l · olej МТ-16п (suchá vana + odstředivka) · chladivo 72 l (termostat malý↔velký okruh).
- **Předehřev/vzduch-start:** předehřívač (voda+olej+vzduch) · vzduchová lahev **150 kg/cm² plná / 100 min** (záloha startéru).
- **ПАЗ:** nagnetatel + **11 klapek + 2 kryty** + ДП-3Б + filtr-ventilace · **utažení погон těsnění = věž ZAMČENA** (interlock se stoporem 16) · v ПАЗ se **vypíná GTD + měnič** (jen 27,5 V baterie), řidič hermeticky připojen k bojovému oddílu pod přetlakem · dmychadlo ≤4 h.
- **УА ППО «Роса»:** 2 zóny (přední motor / zadní palivo-munice) · 3× 2 l lahve · termodatčiky · auto/ruční (přední/zadní) · počitadlo lahví · 27,5 V solenoidy.
- **Limity:** GTD volnoběh 98,5–101,5 % · olej ≤110 °C · plyny ≤650 °C · ventilace: řízení ruční, bojový ≤4 h, RPK ≤8 h · spotřeba 0,8 l/km silnice / 1,3 terén · GTD 1,5–2 h na ~380 l.
- **Pád:** přehřátí (>110 °C) ⇒ riziko stop, hydraulika houstne · klapka ПАЗ zaseklá ⇒ těsnění neutáhne → věž volná v NBC (nebezpečné) · prázdná lahev ППО ⇒ zóna nechráněná.

## Křížové vazby (shrnutí)
- **Energetická páteř:** radar + СРП + pohony + stabilizace visí na **220/400 AC** → ta existuje jen když СЭП točí pohon (diesel/APU). Pád AC ⇒ celé auto-řízení palby spadne na ruční + optiku.
- **Palebná brána:** poklop zavřen ∧ chlazení on ∧ elevace ≥ omezovač ∧ (radar) ЕСТЬ ДАННЫЕ ∧ ЦЕПЬ СТРЕЛЬБЫ. Kterýkoli pád = bez 27,5 V na spouště. АВАРИЙНАЯ obejde elevaci+blokace, ne chlazení+poklop.
- **Radar↔dálkař:** track potřebuje strob dálkaře; bez strobu není úhlový zámek, nelze do АВТОМАТ. Dovorot 3,7° při zámku.
- **Stabilizace pro palbu za jízdy:** ГАГ spin-up ≤3 min + ОТСТОПОРЕНО = palba mobilně (1–2). Bez lampy jen z místa (4–5). ≤40/20 km/h, ≤10° náklon.
- **Chlazení:** СЭП/radar/stabilizace na něm nezávisí; **palba AZP ano** — čerpadlo DC v sérii se spouštěmi.

## ⚠️ GAP (k doověření z manuálu)
Přesný model rozptylu (teplota hlavně/opotřebení/stabilizace) · СДЦ vs frekvenční odstup (odolnost rušení) · práh driftu ГАГ vs čas mise (kdy НЕИСПРАВНО) · chování relé/kontaktů (jemné poruchové módy).
