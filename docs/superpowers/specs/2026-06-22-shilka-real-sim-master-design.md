# ЗСУ-23-4 «Шилка» — master design: z reálných manuálů do naší hry

**Datum:** 2026-06-22 · **Status:** R&D syntéza (návrh, nic z toho ještě není postavené)
**Zdroje:** 10 originálních sovětských manuálů (1461 stran) — viz `docs/reference/shilka-manuals/`.
Dva nezávislé výzkumné proudy, které se navzájem potvrzují:
- **Proud A (agenti, strana po straně):** `docs/reference/shilka-manuals/findings/01..10` — přesná ověřená čísla.
- **Proud B (GPT deep-RnD):** `docs/reference/shilka-manuals/gpt-deep-rnd/` (research deep-dives) + **plný 25-mechanikový návrh** v [`2026-06-22-shilka-mechanics-design-detail.md`](2026-06-22-shilka-mechanics-design-detail.md) — herní architektura, mechaniky, backlog.

Tento dokument je obě věci slepené dohromady + **to, co ani jeden proud neuměl: porovnání s naším skutečným kódem** (`src/shilka.js`, `src/shilka-drive.js`) a návrh, jak to posadit do ENGENDROS PURGE. **Je to vrchní vrstva — detailní rozpis každé mechaniky je v `…mechanics-design-detail.md` (viz §6).**

---

## 0. Hlavní teze (přečti, i kdybys nečetl zbytek)

Shilka není „vozidlo se 4 hlavněmi". Je to **posádkový stroj, jehož bojová síla vzniká z koordinace a z toho, že stroj má vlastní bezpečnostní logiku.** Reálná Shilka odmítá vystřelit z dvaceti důvodů a každý z nich má fyzickou příčinu, lampu na pultu a posádkovou opravu.

To je naše **flagship příležitost**: ze Shilky uděláme **kooperativní centrum hry s vysokým skill-ceilingem** — 4 hráči ji obsluhují s reálnou dělbou práce, při méně hráčích prázdné stanice dopní **AI posádka**. **Ve hře jede plný simulátor — žádné arkádové zjednodušení.** Hloubku škálujeme počtem hráčů a AI dopomocí, ne tím, že bychom systémy schovali za „magickou hlášku". (Arkádové/jedno-tlačítkové ovládání žije **jen v admin asset-vieweru** na prohlížení modelu — není to herní mód, viz §3.)

Jediná nejdůležitější mechanika k postavení: **síť blokací palby + omezovač úhlů** (níže §4). Je to levné, je to 100% věrné a okamžitě to změní pocit ze stroje.

---

## 1. Ověřená realita — tvrdá čísla (proud A, strana po straně)

### 1.1 Celek
- Bojová hmotnost **21 t**; délka ≤6495, šířka ≤3075, výška boj. ≤3765 / pochodová ≤2644 mm; světlá výška 400 mm.
- Posádka **4**: velitel · operátor-vyhledávač/naváděč · operátor dálnosti · řidič-mechanik.
- Cíl: výška ≤**1500 m**, šikmá dálnost **200–2500 m**, rychlost cíle ≤**450 m/s**; pozemní ≤2000 m.
- Doba pochod→bojová poloha **5 min**.

### 1.2 ⭐ Palebná geometrie a limity (flagship — to nejdůležitější)
- **Náměr −4,5° až +85,5°** (přesně −4°30′…+85°30′). Mechanická zarážka = gumové dorazy; silový limitní mikrospínač odpadá ~5° před dorazem.
- **Odměr plných 360°, BEZ mechanických zarážek** (věž je od korby odpojena „obkatkou" — kompenzační kolo).
- **Zakázaná zóna palby = NE azimutální sektor, ale ELEVAČNÍ ODŘÍZNUTÍ:** přepínač **«ОГРАНИЧЕНИЕ УГЛОВ»** na pultu velitele, **8 poloh po 5°: 5,10,15,20,25,30,35,40°** = minimální dovolený náměr. Pod nastavený úhel se **palebný okruh automaticky rozpojí** (zhasne kontrolka «КОНТРОЛЬ БЛОКИРОВОК»). Účel: nestřílet do země / vlastní korby / nadstavby / výšleh do antény radaru.
- Přesnost odříznutí ±2° (rozsah 10–40°), +2°/−1° na 5°. (Provozní pravidlo z manuálu 1970: «30° vzduch, 0° zem».)
- **Palba pod 9° náměru nad vlastními = nebezpečná** (samolikvidace střely).
- **«АВАРИЙНАЯ СТРЕЛЬБА»** — páčka pod zaplombovaným sklíčkem na pultu velitele; obejde elevační blok i ostatní blokace (kromě tvrdých fyzických).
- Geometrie: rádius opisu hlavní **2920 mm @ 0°**, výška linie palby **2020 mm** nad horizontem.

### 1.3 ⭐ Pohony (náměr/odměr) — definitivní rychlosti
- Elektrohydraulika «2Э2»: elektromotor **ДСО-20** → čerpadla → hydromotory → reduktory ВН/ГН. Záloha = **ruční kola**.
- **Max odměr 65–75 °/s** (360° za 4,8–5,5 s). **Max náměr 55–65 °/s** (celý rozsah ~90° za 1,5±0,3 s).
- Jemný „pozemní panoramatický" režim: odměr 20±5, náměr 15±5 °/s. Ruční: 15±5 °/s. Zbytkový dojezd po puštění ≤1,5 °/s.
- Režimy: **АВТОМАТ** (radar/SRP auto-track) ↔ **ПОЛУАВТОМАТ** (operátor ručně, rychlost ∝ výchylce rukojeti) ↔ **ruční kolo** (rozpojená hydraulika).

### 1.4 ⭐ Zbraň АЗП-23М (4 automaty 2А7)
- **4 identické automaty**, horní pár + dolní pár — **samostatné voliče «СТРЕЛЬБА ВЕРХНИХ / НИЖНИХ АВТ»** (lze pálit jen 2, nebo všechny 4). Sesouhlaseny ≤5′.
- Kadence ≥**3400 ran/min** (celkem), ~900–1000/hlaveň. Úsťová rychlost ~950–980 m/s. Náboj **23×152 mm** (БЗТ prům.-zápal.-stop. / ОФЗТ tříšt.-zápal.-stop., ~3:1).
- **Munice 2000 ran, ODDĚLENĚ: dolní 480×2 + horní 520×2.** Pásové podávání, volitelně levé/pravé.
- **Kapalinové chlazení** hlavní (nádrž 85 l, čerpadlo, toggle «ОХЛАЖД» + lampa). Bez běžícího chlazení se nesmí pálit.
- Rychlovýměnná hlaveň (klín); **životnost hlavně 4500 ran**; plynový regulátor Ø3,4→Ø3,2 @ 2000 ran.
- **Dávková doktrína:** rychlé cíle 3–5 ran/hlaveň, pomalé 5–10, pozemní ~50; **povinná pauza 10–15 s na 120–150 ran/hlaveň**; mezi dávkami 2–3 s.
- **Tvrdé blokace palby:** zavřený poklop řidiče, věž/kolébka odstoporovaná, zavřená dvířka sběrače článků, běžící chlazení + hladina ОЖ, nabitý automat, palebný okruh «ЦЕПЬ СТРЕЛЬБЫ», a v auto-režimech «ЕСТЬ ДАННЫЕ».

### 1.5 ⭐ Radar 1РЛ33М / РПК-2М «Тобол»
- Detekce (MiG-17) ≥**12 000 m**, auto-track ≥**10 000 m**, mrtvá zóna **200 m**. Přesnost dálky 10 m.
- Anténa: hledací paprsek **rastr 15° elevačního sektoru @ 23 Hz**; pelengový **kuželový sken 63 Hz**. Šířka svazku 1,5°.
- **Elevace antény −9°…+87°**, azimut neomezený. SDC (MTI) cíle 0–450 m/s.
- **Auto-palebné řešení SRP krmí zbraně jen do 0–8 km** v režimu АВТОМАТ.
- **Omezovač cílů velitele (КПН): náměr −5°…+30°, odměr ±20°.**
- Napájecí sekvence (riziková, posádková): **НАКАЛ → (3 min žhavení) → АНОДНОЕ → ВЫСОКОЕ**; vyžaduje běžící ventilaci RLS. Vyzařování: keep-out 80 m.
- **5 bojových režimů = degradační žebřík:** 1 RLS-auto → 2 vizír + RLS-dálka → 3 paměť «ЗУ» (8–10 s) → 4 prstencový vizír (jen z místa, náklon ≤3–5°) → 5 zem/ruční → nouze na bateriích.
- Anti-rušení: ruční **přeladění frekvence magnetronu** (f1/f2 hop), ВОБУЛЯЦИЯ, СДЦ — celé to je gameplay operátora dálnosti.

### 1.6 ⭐ Dvojí pohon a napájení (potvrzuje náš engine-realism spec)
- **В-6Р/В-6М-1 diesel 280 hp @ 2000 ot/min** → pojezd. **ДГ4М-1 plynová turbína (APU)** → generátor → bojové systémy. Diesel road 50, polní 30 km/h; palba za jízdy ≤20–25 km/h (kontrolka «5 ОТСТОПОРЕНО»), náklon ≤±10°.
- **Power graph:** diesel NEBO APU → generátor ГИСВ → 27,5/55 V DC + měnič ПС-14А → **220 V/400 Hz** → přes sběrač ВКУ do věže → radar, pohony 2Э2, anténa, pulty.
- **Klíč:** žádné APU/motor/externí napájení ⇒ žádných 220 V/400 Hz ⇒ **radar i silové míření MRTVÉ → zbývá jen 27,5 V z baterií + ruční kola.**
- **Start GTD (řidičova minihra):** studené protočení ≤10 s (olej 0,15–0,2, baterie ≥18 V) → ПУСК ГТД 1–2 s → startér odpadá ve **44 %** → zelená ГЕНЕРАТОР → volnoběh 98,5–103,5 %. Při pumpáži nahodit diesel a STOP GTD.
- Provozní stropy: RPK ≤8 h, pohony ≤2 h (pak ≥1 h chlazení), GTD ≤8 h. Anténa nahoru potřebuje vzduch ≥20 kg/cm²; pneumo-přebití mrtvé pod 35–40 atm.

### 1.7 Podvozek ГМ-575 (sedí s naším rigem)
- 6 pojezdových kol/strana (Ø670×160), **12 torzních tyčí**, 4 pákové tlumiče, **bez podpěrných kladek** (horní větev na kolech 3&4), zadní hnací kolo (~16–17 zubů), napínací předního napínáku, pás 93 článků/strana. Planetové řízení (ПМП), H-kulisa řazení.

---

## 2. Co UŽ MÁME vs realita (přímý diff proti našemu kódu)

> Tohle je ta část, kterou GPT explicitně nemohl udělat („nejsou zdrojáky hry"). Náš stav = větev `feat/shilka-named-rig` (PR #108).

| Oblast | Co máme (kód) | Realita | Verdikt |
|---|---|---|---|
| **Náměr** | clamp −4°…+85° v rigu | −4,5°…+85,5° | ✅ skoro přesně — jen doladit o 0,5° |
| **Odměr** | volných 360° | volných 360° | ✅ správně |
| **Rychlosti pohonu** | jízdní model jen pro pojezd; věž/zbraň míří „instantně" přes aim | odměr 65–75 °/s, náměr 55–65 °/s | 🟡 chybí rate-limit míření + akcelerace |
| **⭐ Limity palby** | **ŽÁDNÉ** — střílí z jakéhokoli úhlu | «ОГРАНИЧЕНИЕ УГЛОВ» 5–40° odříznutí + řetěz blokad | 🔴 **největší mezera = náš flagship** |
| **Radar** | `_radarSpin` — talíř se točí VŽDY | gating na APU + žhavení + 5 režimů + obraz | 🔴 dekorace, ne systém |
| **Zbraň** | fire-control stanice, 1 palebný efekt | 4 nezávislé automaty, horní/dolní páry, oddělená munice 480×2+520×2, chlazení | 🔴 „jeden kanón se 4 hlavněmi" |
| **Dvojí pohon (APU)** | jen diesel ON/OFF; APU-gating je SPEC'd, ne postavený | diesel=pojezd, APU=bojové systémy | 🟡 spec existuje (`2026-06-21-shilka-engine-realism-design.md`) |
| **Převodovka ГМ-575** | H-kulisa, synchro, lug-stall, ruční řazení | reálná ГМ-575 | ✅ velmi blízko (už postaveno) |
| **Pojezd/odpružení** | 12 torzí, bump-stop, bez kladek, no-pivot řízení | identické | ✅ sedí |
| **Chlazení / munice / jam / přehřátí** | nic | celý systém | 🔴 chybí |
| **PАЗ / PПO / údržba / elektrika** | nic | celé systémy | 🔴 chybí (ale to je „later") |
| **4 crew sedačky + co-op sync** | máme (velitel/naváděč/dálka/řidič) + host-auth | 4 role | ✅ kostra hotová — chybí náplň per stanice |

**Závěr diffu:** kostra (rig, jízda, převodovka, odpružení, 4 sedačky, co-op) je hotová a věrná. **Chybí „duše" — blokace, omezovač úhlů, 4 automaty, radar jako systém, APU-gating.** Dobrá zpráva: postavili jsme přesně ten těžký základ, na kterém tyhle systémy stojí.

---

## 3. Jak to posadit do NAŠÍ hry (game-design odstup)

ENGENDROS PURGE je sovětsko-horror **kooperativní wave-shooter**. Shilka v něm je **plnohodnotný simulátor** — žádné arkádové zjednodušení uvnitř hry. Hloubku škálujeme **počtem hráčů a AI dopomocí**, ne tím, že bychom systémy schovali za „magickou hlášku". Vrstvy (od GPT, řádek 783 jeho návrhu — arkáda mezi nimi NENÍ):

- **Plná posádka (4 hráči co-op):** žádná magická hláška — velitel čte lampy, posádka hlásí, každá stanice má svou nepřeskočitelnou práci. **Tohle je vrchol naší co-op hry.**
- **Asistovaná posádka (méně hráčů / sólo):** prázdné stanice dopní **AI posádka** (drží napájení, hlásí dálku, startuje GTD…), ale logika je pořád ta samá simulace — hráč pořád dělá klíčová rozhodnutí, jen ne všechna čtyři naráz. Tohle řeší tempo wave-shooteru, aniž bychom systémy ořezali.
- **Instruktor / trénink:** vkládání závad a nácvik procedur (pro nás = testovací/QA + případně „výcvik" mise).

> ⚠️ **Arkádový režim NENÍ v samotné hře.** Zjednodušené, „jedno-tlačítkové" ovládání modelu žije **jen v admin asset-vieweru** (`admin.js` / `AssetViewer`) — na prohlížení a test modelu/rigu, ne jako herní mód.

**Klíčový princip (od GPT, souhlasím 100%): jeden sdílený fyzický stav.** Zavřený poklop = JEDEN stav (animace + kontakt + lampa + interlock + AI hlášení). Bez jednotného zdroje pravdy se to rozpadne. To je důležitější než počet tlačítek.

**Náš horor-nádech:** noční vlny, radar jako jediné oko do tmy, žhavení trvá a ty čekáš, zatímco se blíží echo. Když APU chcípne, jsi slepý na bateriích s ručními koly. To je atmosféra, ne jen sim.

---

## 4. ⭐⭐ FLAGSHIP: síť blokací + omezovač úhlů (postavit první)

Tohle je nejlevnější high-impact věc a přímo navazuje na náš existující fire-control. Rozpracováno proti našemu kódu:

### 4.1 Omezovač úhlů «ОГРАНИЧЕНИЕ УГЛОВ»
- Stav na ShilkaStation: `angleLimitDeg ∈ {OFF,5,10,…,40}` (přepínač u velitele / v sólo na klávese).
- V `_tryFire`/`_fireOptical`: **pokud `gunElevationDeg < angleLimitDeg` → palba se NEPROVEDE** (a vizuálně: žádný výšleh, žádná střela, zhasne kontrolka blokací).
- Vizuální vazba na model: čteme reálný úhel `gun_elev` z rigu (už ho máme), takže „reálně reaguje na model" — přesně jak chceš.
- Provozní default 0° (zem) / 30° (vzduch); zaplombovaná **«АВАРИЙНАЯ»** páčka limit i ostatní blokace obejde.

### 4.2 Řetěz blokací (jeden permission systém pro palbu i pohon)
`canFire` = AND( poklop řidiče zavřen · věž odstoporovaná · kolébka odstoporovaná · sběrač článků zavřen · chlazení běží + hladina ОЖ · ≥1 automat nabit · palebný okruh ON · elevace ≥ limit · (v auto-režimu) ЕСТЬ ДАННЫЕ ). Každý blokátor nese **příčinu → fyzický díl → lampu → opravu**. Plný stavový automat: `gpt-deep-rnd/03_interlock_state_machine.md`; herní rozpis (`InterlockGraph`, datové uzly, 20 pojmenovaných závad) v **detail docu §1, §7, §19**.

### 4.3 Proč zrovna tohle první
Je to malé (pár stavů + úprava 2 funkcí ve `_tryFire`), je to **100% věrné** (máme přesná čísla), a okamžitě to dělá ze Shilky „stroj s vlastní logikou". Zároveň to je přímo to, cos zadal jako flagship („omezení úhlů palby + reálně to na modelu zakáže palbu i vizuálně").

### 4.4 Tvrdé vs měkké blokace (důležité pro pocit)
- **Tvrdé** (nejde obejít bez nouzové/servisní cesty): stopory, otevřený poklop, otevřený sběrač, bez napájení okruhu, žádný nabitý automat.
- **Měkké** (jde přepsat, ale za cenu): chybí data, cíl mimo zónu, degradované chlazení, slabý signál.
- **Varování** (nezakáže, ale riskuješ): dlouhá dávka na horkých hlavních, přepnutí režimu pod zátěží, stabilizace za jízdy.

---

## 5. Mechaniky per crew — každá stanice má svou hru

### 5.1 Velitel = systémový koordinátor (ne „vybírá cíl")
Zapíná SЭP, čte voltmetry, povoluje pohony, **drží palebné právo** (ЦЕПЬ СТРЕЛЬБЫ), volí režim z 5-stupňového žebříku, nastavuje omezovač úhlů, řeší pneumo-přebití, čte pult lamp jako diagnostiku. Když něco nejde, **on vede vyšetřování** podle lamp. Volič «КОМАНДИР↔ОПЕРАТОР» — kdo má teď ruku na spoušti.

### 5.2 Operátor-vyhledávač / naváděč = čtení prostoru
Volí kruhový/sektorový/zrychlený search, ladí šířku sektoru, **čte rotující rastrový indikátor** (Т-28М, točí se s azimutem), najde echo, stiskne «146 АВТ.» → 3,7° dovorot → kuželový zámek 63 Hz. Při ztrátě cíle sjíždí žebřík režimů. Jeho skill není aim, ale **interpretace signálu a režimů**.

### 5.3 Operátor dálnosti = napájecí řetěz + dálka + anti-rušení
Power-up minihra (НАКАЛ→3 min→АНОДНОЕ→ВЫСОКОЕ), nastaví proud magnetronu (5→25–33 mA), **drží dálkovou bránu** na dvoupaprskovém indikátoru (handwheel 2500 vs 400 m/otáčka), hlásí dálku po 500 m, **pozná rušení a přeladí** (f1/f2, ВОБУЛЯЦИЯ). Jeho práce vytváří «ЕСТЬ ДАННЫЕ» — bez něj velitel nepovolí auto-palbu.

### 5.4 Řidič = provozní operátor (víc než volant)
**Start GTD minihra** (studené protočení → ПУСК → 44 % → generátor), hlídá teplotu/tlak/palivo, koordinuje otáčky pro SЭP zátěž, **rozhoduje poklop otevřený (výhled) vs zavřený (palba povolena)**, stabilní platforma (prudká jízda = drift stabilizace + zákaz palby), NBC/požár zblízka. Špatný řidič reálně snižuje bojeschopnost.

**Co-op pointa:** stroj střílí jen když všechny 4 smyčky drží zároveň. To je čistá kooperace bez umělého lepidla.

---

## 6. Subsystémy jako herní systémy (přehled)

> **Tohle je jen rychlý přehled. Plný detailní návrh — 25 mechanik rozepsaných do hloubky (InterlockGraph, 4 automaty, chlazení, hydraulika, stabilizace, RLS reléový stavový stroj, radarový obraz se šumem, rušení/přeladění, SЭП, GTD start, PАЗ/PPO, údržba, 20 pojmenovaných závad, datové uzly `ElectricalBus`/`HydraulicSystem`/`GunSystem[4]`…, crew design pro 5 rolí, P0–P3 backlog) — je v [`2026-06-22-shilka-mechanics-design-detail.md`](2026-06-22-shilka-mechanics-design-detail.md). Řidičova stanice navíc v `gpt-deep-rnd/driver/`.**

- **Radar jako přístroj, ne minimapa:** echo + šum + falešné odrazy + rušení; jas/fokus; „hodnota cíle" = míra důvěry, ne locked/unlocked. Exkluzivní režimy (zapnutí jednoho odpojí druhý, s reléovou prodlevou). Tepelný model (bez ventilace roste šum→fault).
- **AZP = 4 živé automaty:** oddělená munice/počitadla/teplota/zádržka/opotřebení; výpadek 1 automatu = nižší hustota + asymetrické vibrace + jiná stopovková skupina; chlazení jako podmínka; přehřátí → rozptyl/zásek/poškození; `BurstDoctrineAdvisor` radí délku dávky.
- **Hydraulika + ruční fallback:** náběh tlaku, studený olej = líná odezva, únik = kolísání; výpadek hydrauliky ≠ mrtvý hráč, ale přechod na ruční kola (pomalé, ale funkční).
- **Elektrika/SЭP:** ne `powered=true`, ale baterie/generátor/měniče/sběrnice; pokles napětí při zátěži = reálné symptomy (radar nenaběhne, kontrolky pohasnou); externí zásuvka pro servis v parku.
- **PАЗ (NBC) + UA PПO (požár):** klapky/přetlak/lampy; požár přední/zadní zóna, auto + ruční hašení, spotřebovaná láhev = servis po misi.
- **Údržba/opotřebení/kalibrace:** přenášet stav mezi misemi — opotřebení hlavní, kvalita chladiva, seřízení omezovače, motohodiny, poruchová historie. **Kampaň = péče o konkrétní kus stroje, ne procento durability.**

---

## 7. Out-of-the-box nápady (drží realitu)

- **„Živý kabelový svazek":** ne každý vodič, ale 5 pojmenovaných svazků (věž / pult velitele / RPK napájení / PАЗ-PПO signály / startovací okruh). Zásah rozbije konkrétní skupinu funkcí, ne abstraktní error.
- **„Servisní sluch" (perk posádky):** zkušená posádka pozná závadu podle zvuku — hydropohon jde těžce, jeden automat nevystřelil, čerpadlo chlazení zní nasucho.
- **„Neúplně opravený stroj":** po misi nejde opravit vše — vybíráš (palba vs RPK vs podvozek vs PПO vs kalibrace). Další mise startuje s reálnými kompromisy.
- **„Procedurální viník":** porucha = hratelná detektivka. Symptom → lampa → možné příčiny → fyzicky obejdeš stanoviště → najdeš stav. Místo frustrujícího zákazu.
- **Vadný kontakt vs fyzika:** poklop fyzicky zavřený, ale kontakt zoxidovaný → lampa drží blokaci → servisní diagnostika odhalí koncový spínač. Tohle dělá simulátor nezapomenutelným.
- **Horor vrstva (naše):** noc, radar jako jediné oko, žhavení 3 min jako napětí, APU chcípne → slepota na bateriích.

---

## 8. Roadmap (priority pro NAŠI hru)

**Nejdřív sjednoť PR #108** (rig+jízda) → pak stavěj nahoru. Pořadí podle hodnota/cena a podle toho, co máme:

- **F0 — flagship blokace (1–2 dny):** omezovač úhlů + řetěz canFire napojený na reálné úhly modelu + lampy. ⭐ Přímo tvoje zadání. Postaví se nad existující fire-control.
- **F1 — APU-gating:** dotáhnout existující `engine-realism` spec — radar/pohony/palba na `apuOn`; 2-fázový start. (Spec hotový.)
- **F2 — 4 automaty:** oddělená munice (480×2+520×2), horní/dolní páry, chlazení jako podmínka, přehřátí, zádržka 1 automatu. Mění palbu z efektu na proceduru.
- **F3 — radar jako stanice:** power-up sekvence + 2–3 search režimy + čitelný obraz (šum/echo) + degradační žebřík + 1 rušení.
- **F4 — provozní vrstva:** SЭP/baterie, řidičův panel, PАЗ/PПO zjednodušeně, údržba mezi misemi.

**Milníky (od GPT, sedí nám):** A „stroj odmítá nesmysly" → B „zbraň je 4-dílný organismus" → C „RPK jako pracovní stanice" → D „vozidlo žije mezi misemi". První vertical slice = scénář, kde **stroj odmítne palbu, hráč najde příčinu, opraví ji a sestřelí cíl.**

**Modelování (Blender):** většina dílů v rigu už je. Domodelovat podle potřeby (checklist v GPT 08): pult velitele s lampami + počitadla, přepínač omezení úhlů, sběrač článků a dvířka, chladicí nádrž, indikátory radaru, řidičův panel. Reference výkresy: AZP album str. 5/10/11, podvozek str. 36/38/40/41/42.

---

## 9. Otevřené otázky pro tebe (rozhodnutí)

1. **Hloubka vs tempo:** chceme full-crew sim jako VOLITELNOU vrstvu (default arkáda), nebo má být Shilka „těžká vždy"? (Doporučuji volitelnou — jinak to v wave-shooteru odradí.)
2. **Rozsah F0:** stavíme hned celý řetěz blokací, nebo začneme JEN omezovačem úhlů (tvůj explicitní flagship) a blokace přidáme po jedné?
3. **Munice:** přejdeme na oddělenou munici 4 automatů hned (mění balanc), nebo to necháme na F2?
4. **Kam s tím:** nová větev `feat/shilka-real-sim` stacklá na #108 (sjednám podle toho, až #108 sjednotíme)?
5. **PDF manuály (187 MB):** commitnout do repa jako ref (jsou těžké, ale `docs/` se nedeployuje), nebo nechat lokálně + commitnout jen `findings/` + tento dokument?

---

## Atribuce
- **Proud A** (čtení strana-po-straně, ověřená čísla): `docs/reference/shilka-manuals/findings/01,03,04,05,06,07,08,09,10*.md` (9/10 manuálů; 02 pokryl GPT).
- **Proud B** (herní architektura + mechaniky): detailní návrh [`2026-06-22-shilka-mechanics-design-detail.md`](2026-06-22-shilka-mechanics-design-detail.md) + research deep-dives `docs/reference/shilka-manuals/gpt-deep-rnd/` (00–08 + `driver/`). Originál OCR/refs lokálně v `~/Documents/shilka dokumenty/refs/`.
- **Dřívější shilka specs v repu** (předchozí práce, tento návrh je rozšiřuje): `2026-06-17-shilka-fire-control-mechanics-design.md`, `2026-06-18-shilka-{state-interlocks,mechanics-catalog,parameters,rig-driving-design}.md`, `2026-06-19-shilka-coop-multicrew-design.md`, `2026-06-20-shilka-named-rig-design.md`, `2026-06-21-shilka-{drivetrain-behavior-research,engine-realism-design}.md`.
- **Diff proti kódu + game-fit + flagship-spec + roadmap:** tento dokument.
