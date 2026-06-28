# ЗСУ-23-4 «Шилка» — detailní návrh mechanik (komplexní simulátor)

> **Provenance:** GPT deep-RnD (proud B), zpracováno z 10 sovětských manuálů (1461 stran). Vrchní syntéza + diff proti našemu kódu + roadmap je v [`2026-06-22-shilka-real-sim-master-design.md`](2026-06-22-shilka-real-sim-master-design.md) — **začni tam**, tohle je jeho hluboká příloha.
> **Ověřená čísla (proud A)** k těmto mechanikám: [`docs/reference/shilka-manuals/findings/`](../../reference/shilka-manuals/findings/).
> **Podpůrné GPT deep-dives:** [`docs/reference/shilka-manuals/gpt-deep-rnd/`](../../reference/shilka-manuals/gpt-deep-rnd/) (RLS, AZP, hydraulika, interlock state-machine, crew, model backlog + driver).
> **Související dřívější specs v repu:** `2026-06-17-shilka-fire-control-mechanics-design.md`, `2026-06-18-shilka-state-interlocks.md`, `2026-06-18-shilka-mechanics-catalog.md`, `2026-06-21-shilka-engine-realism-design.md` — tento dokument je rozšiřuje, nenahrazuje.

Tento dokument je návrhová syntéza z 10 manuálů (OCR + vizuální čtení).

Nejde o rychlé shrnutí. Nejprve vznikl referenční balík OCR po stránkách pro 1461 stran a tematický index napříč dokumenty. Detaily a citovatelné stopy jsou v `refs/`.

Poznámka k porovnání s aktuální hrou: v tomto workspace jsem nenašel herní projekt, model, `.blend`, Unity, Unreal, Godot ani webový build. Proto níže neříkám „tohle už máte/ nemáte“. Píšu cílový návrh a u každé zásadní věci dávám, co se má ověřit v aktuální implementaci.

## Referenční balík

- `refs/00_inventar_dokumentu.md` - seznam dokumentů a počty stran.
- `refs/pdf_inventory.json` - strojově čitelný inventář.
- `refs/page_index.tsv` - index všech OCR stran, 1461 záznamů.
- `refs/ocr_pages/` - samostatný OCR text pro každou stranu.
- `refs/ocr_combined/` - kombinovaný markdown pro každý manuál.
- `refs/01_tematic_index.md` - tematický index podle systémů.
- `refs/02_klicove_pasaze.md` - klíčové výřezy podle témat.

Jedna položka v dodaných souborech je prázdná: `ЗСУ-23-4М_Гусеничная_машина_ГМ-575_Техническое_описание_1980_Текст.pdf` má 0 B. Nešlo ji číst.

## Hlavní designový závěr

Shilka nemá být ve hře „tank s radarem a čtyřmi kanóny“. Má být systém vzájemně blokovaných podsystémů: RPK/RLS, počítací aparatura, stabilizace, silové pohony, ruční pohony, AZP-23M, chlazení, munice, pneumatika, napájení, GAG/stabilizační aparatura, PАЗ/PPO, GM-575 a posádka.

Největší síla simulátoru bude ve stavovém propojení:

Pokud je poklop řidiče otevřený, pokud je část zbraně na stoporu, pokud není chlazení, pokud je aktivní limit úhlů, pokud cíl není v zóně, pokud není RPK v režimu s daty, pokud chybí správné napětí, pak se nemá jen rozsvítit hláška. Má se fyzicky změnit chování modelu, pohonů, panelů, zvuku, indikace a možnosti střelby.

To je flagship vrstva.

## Ověřené uzly z dokumentů

### AZP-23M a úhly

V albu AZP-23M je na straně 5 vizuálně potvrzeno:

- 4 automaty ráže 23 mm.
- Tempo jednoho automatu nejméně 850 ran/min.
- Počáteční rychlost střely 950-1000 m/s.
- Munice: horní automaty 480 x 2 patronů, dolní automaty 520 x 2 patronů.
- Vertikální navedení od přibližně -4°30' do +85°30'.
- Horizontální navedení neomezené.
- Doporučené krátké dávky proti pomalým cílům 3-5 nebo 5-10 ran na automat.
- Rychlosti navedení: automatický/poloautomatický režim a pomalejší ruční navedení.

Herní důsledek: zbraně musí mít reálný elevace limit, reálnou saturaci rychlosti pohonu, rozdíl mezi silovým a ručním režimem a oddělené zásoby horních/dolních automatů.

### Přepínač omezení úhlů existuje

Na pultu velitele v albu AZP-23M, str. 35, je položka 17: přepínač „ограничение углов“ (POU). Na téže straně jsou kontrolky „контроль блокировок“, „люк открыт“, „отстопорено“, „застопорено“, „охлаждение“, „уровень ОЖ“, „цепь стрельбы“, „заряжено“ pro každý automat, počitadla patronů a nouzová střelba.

V provozní instrukci 2A6M je na straně 63 kontrola blokací: otevřený poklop řidiče má zabránit zapnutí DSO-20 a střelbě, stopor kolébky a stopor věže mají bránit zapnutí hydropohonu, otevřená dvířka sběrače článků mají blokovat pohon, a přepínač omezení úhlů se nastavuje na 40° při kontrole.

Herní důsledek: „omezení úhlů“ má být fyzický režim s modelovým dopadem. Ne jen UI checkbox.

### Blokace palby a pohonů

Technický popis ZSU-23-4, str. 18, potvrzuje blokace:

- Silové pohony navedení jsou možné pouze při odstoporované věži a odstoporované kývavé části AZP.
- Je vyžadován zavřený poklop řidiče.
- Je vyžadována zavřená krytka/dvířka sběrače článků.
- Otevření palby je možné jen při zavřeném poklopu řidiče.
- Má pracovat chlazení hlavní.
- Úhel elevace musí být v povoleném rozsahu daném omezením.
- V prvních třech režimech má cíl být v zóně zásahu a musí existovat palebná data.

Herní důsledek: udělat centrální `InterlockGraph`, který rozhoduje zvlášť:

- `canPowerTraverse`
- `canPowerElevate`
- `canFire`
- `canEmergencyFire`
- `canRadarTrack`
- `canUseAutoLead`

Každý false stav musí mít fyzickou příčinu viditelnou v modelu nebo panelu.

### Hydropohon

Alba GM-575 a troubleshooting ukazují hydromotor, čerpadla, rozvaděč, blok válců, hřídel hydromotoru, přijímací přístroje a silový reduktor. Schéma práce hydropohonu na str. 54 albu GM-575 ukazuje mechanickou logiku proudění, pístu a úhlu 0-30°.

Herní důsledek: hydropohon má mít stav tlaku, prodlevu náběhu, zahřívání, netěsnost, vzduch v systému, degradaci odezvy a rozdíl mezi horizontálním a vertikálním okruhem.

### RPK/RLS

RLS/RPK manuály popisují kruhový, zrychlený kruhový a sektorový search. Strana 144 technického popisu 1RL33M potvrzuje, že zapnutí kruhového vyhledávání odpojuje jiné režimy jako automat, navedení a sektorové vyhledávání; sektorové vyhledávání má vlastní relé, elektromagnetickou spojku a šířku sektoru.

Herní důsledek: režimy RPK nemají být volně kombinovatelné. Musí to být exkluzivní stavy s přechody, prodlevami, reléovou logikou a chybami při přepínání.

### Napájení a spuštění

Dokumenty opakovaně vážou RPK a pohony na SЭП, napětí 27,5 V, 55 V, 115 V/400 Hz, převodníky, generátor, baterie a externí napájení. Pult velitele má voltmetry AC/DC, přepínač 27V-55V a ovladače hydropohonu.

Herní důsledek: simulátor má mít elektrickou sběrnici, ne jen `powered=true`.

## Flagship mechanika: fyzická síť blokací

Navrhuji udělat blokace jako viditelnou síť stavů, ne jako skryté boolean podmínky.

Každý blokovací uzel má:

- fyzický objekt v modelu,
- elektrický nebo mechanický kontakt,
- stav na panelu,
- efekt na dostupné režimy,
- zvuk nebo mechanickou odezvu,
- údržbovou kontrolu.

Příklady uzlů:

- poklop řidiče,
- víko/dvířka sběrače článků,
- stopor věže,
- stopor kývavé části AZP,
- přepnutí ruční/silové navedení,
- stav DSO-20,
- stav T-39M / pohonného bloku,
- tlak hydropohonu,
- stav chlazení hlavní,
- hladina chladicí kapaliny,
- přepínač omezení úhlů,
- poloha elevace,
- cíl v zóně zásahu,
- „есть данные“ na pultu,
- stav každého automatu „заряжено“,
- stav střeleckého okruhu.

Herní moment: hráč stiskne „hydropohon vkl“. Pokud je věž na stoporu, DSO-20 se nespustí, kontrolka blokací dává smysl a fyzický stopor je viditelný. Pokud stopor sundá, hydropohon naběhne se zvukem motoru a teprve pak se věž pohne.

## Crew design

### Velitel

Velitel nemá být jen hráč, který klikne na cíl. Má být systémový manažer.

Mechaniky:

- Kontrola napětí podle voltmetrů.
- Zapnutí/vypnutí napájení bojových systémů.
- Přepínač `komandir-operator`, kdo má právo na palbu/ovládání.
- Přepínač omezení úhlů.
- Kontrola blokací.
- Nouzová střelba.
- Rozhodování, kdy použít RPK a kdy vizuální nebo záložní režim.
- Kontrola stavů „nabito“ pro každý automat.
- Sledování počitadel patronů pro každý automat.
- Kontrola hladiny chladicí kapaliny a stavu chlazení.
- Rozhodnutí, jestli povolit střelbu přes shunt/obejití pro test nebo nouzi.

Gameplay:

- Velitel slyší hlášení od operátorů a podle panelu rozhoduje, proč zbraň nestřílí.
- Chybný velitel vede ke zpoždění, špatným režimům a zbytečné spotřebě munice.
- Dobrý velitel zvládne rychle převést systém z jízdy do boje, z radaru do optiky, z normální palby do nouze.

### Operátor vyhledávání/navádění

Tato pozice musí být nejsilnější radarově-kinematická role.

Mechaniky:

- Kruhové vyhledávání.
- Zrychlené kruhové vyhledávání.
- Sektorové vyhledávání s nastavením šířky sektoru.
- Přepnutí search/peleng podle režimu.
- Přechod z vyhledávání do doprovodu.
- Ruční doladění antény a zbraní.
- Práce s indikátorem vyhledávání, jasem, fokusací a rozsahem.
- Reakce na rušení: změna frekvence magnetronu jako gameplay abstrakce.
- Ztráta cíle při špatném režimu nebo špatném sektoru.
- Přenos dat do počítací aparatury.

Gameplay:

- Cíl se na obrazovce radaru neukazuje jako čistá ikona, ale jako signál mezi šumem.
- Hráč musí vědět, jestli je v kruhovém, zrychleném nebo sektorovém search.
- Přepnutí režimu má reléovou prodlevu a odpojí předchozí režim.
- U sektorového search se hráč učí „číst“ pravděpodobný směr cíle.

### Operátor dálky

Operátor dálky je ideální pro velmi zajímavou, často opomíjenou roli.

Mechaniky:

- Zapnutí nakalu/anodového napájení a práce s ventilací RLS.
- Kontrola indikátoru dálky.
- Měření a potvrzení dálky pro výpočet palebného řešení.
- Hlídání kvality echo signálu.
- Rozlišování cíl vs rušení/zemní odraz.
- Kontrola nulování dálky.
- Práce při ztrátě automatického doprovodu: ruční opravy dálky.
- Hlášení veliteli, kdy „data“ nejsou spolehlivá.

Gameplay:

- Bez dobrého dálkaře existují úhlová data, ale palba je mimo.
- Při rušení může dálkař držet systém použitelný ručním měřením.
- Dálkař může být „tichý hrdina“ posádky: špatný hráč jen čeká, dobrý hráč zachrání zásah.

### Mechanik-řidič

Mechanik není jen řidič. Je zdroj stavu celé platformy.

Mechaniky:

- Start a monitoring motoru V-6R/V-6M podle konkrétní verze.
- Teplota vody, tlak oleje, palivo, baterie, startér.
- Stav poklopu, který blokuje pohony a střelbu.
- Kontrola SЭП a přepojení na externí napájení.
- Údržba filtrů, vzduchu, paliva, mazání, chlazení.
- Jízda ovlivňuje stabilizaci, radarové sledování a přesnost.
- Při chybné jízdě vzniká „galopování“ a „potápění“, které stabilizace kompenzuje jen v limitech.
- Rozhodnutí, kdy stát kvůli přesnému zapnutí GAG/RPK.

Gameplay:

- Řidič umí výrazně zlepšit šanci zásahu tím, že správně postaví vozidlo.
- Otevřený poklop kvůli výhledu je taktický benefit, ale bojový hazard.
- Hrubá jízda zatěžuje stabilizaci a může rozbíjet track v RPK.

### Technik/servisní režim

Tahle role může být offline/kooperativní nebo součást kampaně.

Mechaniky:

- Kontrola statické přesnosti převodníků koordinát.
- Kontrola nulování dálky.
- Kontrola přesnosti odpojení střeleckého okruhu.
- Kontrola nastavení spodního omezovače a omezovače úhlů.
- Údržba hydropohonů, čerpadel, filtrů, akumulátorů.
- Práce se ZIP: náhradní pojistky, kabely, nářadí, prodlužovací kabely.
- Diagnostika „НЕИСПРАВНО“ přes konkrétní okruhy.

Gameplay:

- Stav vozidla před misí ovlivní misi.
- Špatně seřízené omezení úhlů nebo nulování dálky vede k podivným symptomům, které hráč musí diagnostikovat.
- V kampani má význam údržba, ne jen munice.

## Návrhy mechanik podle systémů

### 1. Palebný stavový automat

Vytvořit `FirePermissionState`, který skládá:

- napětí střeleckých okruhů,
- nabití jednotlivých automatů,
- stav elektrosputí,
- chlazení,
- poklopy,
- stopory,
- úhlový limit,
- režim RPK,
- palebná data,
- zónu zásahu.

Výstup není jen `fire/no fire`, ale:

- `blockedByDriverHatch`,
- `blockedByCradleStop`,
- `blockedByTurretStop`,
- `blockedByCooling`,
- `blockedByAngleLimiter`,
- `blockedByNoData`,
- `blockedByTargetOutsideEnvelope`,
- `emergencyOnly`.

### 2. Reálné počitadlo patronů

Pult má počitadla patronů SP1-SP4. Každý automat má vlastní stav:

- počet patronů v pásu,
- stav pásu,
- stav natažení,
- stav elektrosputě,
- přehřátí hlavně,
- závada podání,
- prázdná nábojová schránka,
- vadná kontrolka „заряжено“.

### 3. Horní a dolní automaty nejsou stejné

Doložené zásoby jsou jiné pro horní a dolní automaty. Hra má rozlišovat:

- horní levý,
- horní pravý,
- dolní levý,
- dolní pravý.

Každý může být samostatně prázdný, zaseknutý, přehřátý nebo nenatažený.

### 4. Chlazení hlavní jako aktivní systém

Chlazení nemá být pasivní buff. Má mít:

- hladinu,
- typ kapaliny podle počasí,
- čerpadlo,
- tlak,
- kontrolku chlazení,
- poruchu hadice/čerpadla,
- dopad na délku dávky,
- dopad na blokaci palby.

Výborná mechanika: při nízké hladině se dá vystřelit nouzově, ale poškozuje to hlavně a snižuje přesnost/životnost.

### 5. Dávky podle cíle

Pro pomalé cíle manuál uvádí krátké dávky 3-5 nebo 5-10 ran na automat, pro pozemní cíle delší dávky. Hra má mít:

- doctrinal burst advisor,
- možnost ručně přestřelit doporučení,
- přehřívání a spotřebu jako cenu,
- velitele, který může nařídit krátké/ dlouhé dávky.

### 6. Úhlový limiter jako fyzický režim

Přepínač omezení úhlů má být propojený na:

- panel velitele,
- kontrolku blokací,
- elevaci zbraní,
- modelový doraz,
- zvuk mechanického/elektrického omezení,
- testovací režim na 40° podle provozní kontroly.

Implementačně:

- přidat `AngleLimiterMode`: `off`, `combat`, `test40`, případně `customByScenario`;
- při dosažení limitu omezit elevaci a střelbu;
- zobrazit doraz na mechanice kolébky nebo v diagnostice.

### 7. Stopory jako modelové objekty

Stopor věže a stopor kývavé části musí být samostatné animované prvky.

Stavy:

- zajištěno,
- odjištěno,
- mezipoloha,
- vadný kontakt,
- mechanicky zaseklé.

Efekt:

- při zajištění nejde zapnout hydropohon,
- při zajištění nejde vést palbu,
- při mezipoloze vzniká porucha nebo falešná indikace.

### 8. Ruční vs silové navedení

Dokumenty popisují přepínání ruční/silové a ruční rychlosti kolem 15°/s. Hra má mít:

- ruční kliky/maháky,
- velkou fyzickou námahu nebo pomalost,
- možnost pokračovat po ztrátě hydropohonu,
- nižší přesnost při pohybu,
- riziko přepínání při běžícím DSO-20.

### 9. Hydraulický tlak a odezva

Hydropohon má mít:

- tlak v okruhu,
- náběh po zapnutí,
- zvuk DSO-20,
- rozdílnou odezvu horizontální/vertikální,
- teplotu oleje,
- netěsnost,
- vzduch v systému,
- pomalé vracení po vypnutí.

### 10. Stabilizace jako vrstva nad podvozkem

Stabilizace nemá být jen „sniž spread“. Má číst:

- náklon vozidla,
- rybání,
- rychlost,
- režim pohonů,
- stav GAG,
- poruchu gyro aparatury,
- mechanické limity.

Výstup:

- stabilizovaná linie míření,
- zpoždění,
- saturace,
- drift,
- chyba při špatném zapnutí na pohybu.

### 11. RLS režimy jako reléový stavový stroj

Režimy:

- vypnuto,
- žhavení/nakal,
- vysoké napětí,
- kruhové vyhledávání,
- zrychlené kruhové vyhledávání,
- sektorové vyhledávání,
- peleng/doprovod,
- automat,
- navedení,
- trénink.

Přechody mají:

- prodlevu,
- zvuk relé,
- vzájemné vyloučení,
- možné selhání kontaktu,
- indikaci na obrazovkách.

### 12. Radarový obraz bez herní magie

Radar má ukazovat:

- šum,
- echo,
- zvonění/odrazy,
- rušení,
- ztrátu signálu,
- jas/fokus/posun,
- rozdíl search a range indikátoru.

Hráč se učí číst obraz. Ikona cíle může být jen tréninková pomoc.

### 13. Rušení a přeladění magnetronu

Manuál RLS zmiňuje ruční přestavování pracovní frekvence magnetronu při aktivním šumovém rušení mířeném na frekvenci.

Herně:

- nepřítel ruší část spektra,
- operátor pozná zahlcený indikátor,
- přeladí,
- přeladění stojí čas a může rozladit citlivost,
- špatné přeladění snižuje dosah.

### 14. SЭП a elektrická síť

Zavést elektrické sběrnice:

- baterie,
- 27,5 V,
- 55 V,
- 115 V/400 Hz,
- externí napájení,
- generátor,
- převodníky,
- pojistky a automaty ochrany.

Každý systém deklaruje, co potřebuje.

### 15. DГАМ/GTD a startovací logika

Start pomocného zdroje má být procedurální, ale ne přehnaně nudný:

- otevření klapky/výfuku,
- kontrola baterií,
- startér,
- limit napětí při startu,
- automatický stop při špatné klapce,
- zvuk rozběhu,
- teplota a selhání za mrazu.

### 16. Řidičův poklop jako taktický kompromis

Otevřený poklop:

- lepší výhled při přesunu,
- horší ochrana,
- blokuje hydropohon/střelbu,
- rozsvítí „люк открыт“,
- dává veliteli jasný důvod, proč zbraň nejde.

To je krásná mikrodramatická mechanika.

### 17. PАЗ/PPO a ventilace

PАЗ není jen NBC filtr. Dokument popisuje ventilátory, klapky, pyropatrony, uzávěry, přetlak a signalizaci.

Mechaniky:

- otevřené/zavřené klapky,
- automatické zavření pyropatronou,
- ruční otevření/zavření,
- filtrace prachu/radiace,
- přetlak,
- vliv na provoz RPK ventilace,
- kontrolky na panelu.

### 18. Údržbový režim jako hra

Tabulky údržby dávají výborný rámec:

- denní kontrola,
- po přesunu,
- po střelbě,
- měsíční/periodická kontrola,
- kalibrace nul,
- mazání,
- čištění filtrů,
- kontrola pásů a pojezdových kol,
- kontrola blokací.

Herně to může být režim mezi misemi s prioritami, ne nutně ruční klikání každého šroubu.

### 19. Závady s kořenem v reálném systému

Závady nemají být generické. Příklady:

- `NoFire_CoolingNotRunning`
- `NoTraverse_TurretStopEngaged`
- `NoElevate_CradleStopEngaged`
- `NoHydraulic_DSO20NoPower`
- `NoTrack_RadarVentilationFault`
- `BadRange_KlystronUnstable`
- `WeakEcho_ReceiverSensitivityLow`
- `SearchModeConflict_RelayStuck`
- `AmmoFeed_LeftLowerBeltDrag`
- `CoolingPumpLeak`
- `AngleLimiterMisadjusted`
- `DriverHatchContactFault`

Každá závada má symptom, diagnostiku a opravu.

### 20. „Je to rozbité, ale proč?“ panel

Neudělat arkádový text „Cannot fire“. Udělat diagnostiku:

- velitel vidí kontrolku,
- operátor slyší relé nebo ne,
- řidič vidí svůj poklop/štít,
- servisní panel ukáže okruh,
- zkušený hráč pozná příčinu rychleji.

### 21. Zóna zásahu a palebná data

V prvních třech režimech má být palba podmíněná tím, že cíl je v zóně zásahu a existují data. Herně:

- „есть данные“ není dekorace,
- když cíl opustí zónu, palba se zablokuje nebo je neúčinná,
- SRP data mohou být neúplná,
- velitel může nouzově střílet mimo ideální data, ale se špatným výsledkem.

### 22. Obmetaná zóna hlavní

Manuál varuje před „zónou obmetání“ hlavní při zapnutém DSO-20 a otáčení věže. Herně:

- servisní/externí kamera ukazuje nebezpečnou oblast,
- posádka nesmí měnit místa nebo otvírat některé poklopy,
- v kooperaci může špatné rozhodnutí zranit člena posádky nebo zrušit akci.

### 23. Nabíjení jako týmová procedura

Munice se zavádí přes schránky a pásy, dolní automaty mají jiné schránky než horní. Herně:

- otevřít kryty,
- nastavit elevaci pro přístup,
- vložit pás,
- natáhnout mechanismus,
- ověřit „заряжено“,
- zavřít kryty,
- aktualizovat počitadla.

Zjednodušená verze může být časovaná týmová akce s animovanými body.

### 24. Pneumatické přebití

Manuály zmiňují pneumatické přebití a tlakové lahve. Herně:

- tlak v lahvích,
- kompresor,
- čas plnění,
- automatické vypnutí,
- studený vzduch/únik,
- omezený počet přebití při poruše kompresoru.

### 25. Vnitřní topologie vozidla

Z dokumentů je jasná topologie:

- oddělení řízení vpředu,
- bojové oddělení uprostřed,
- silové oddělení vzadu,
- AZP oddíl,
- věžové skříně RPK,
- anténní kolona,
- přístupové poklopy,
- zásobníky a ZIP.

Herně:

- údržba a poškození se váže na umístění,
- požár v motorovém prostoru není totéž co výpadek RPK ve věži,
- posádka se pohybuje mezi skutečnými body.

## Co přidat nebo ověřit v Blenderu/modelu

Priorita 1:

- Pult velitele s ovladači z AZP str. 35.
- Přepínač „omezení úhlů“.
- Kontrolky „kontrola blokací“, „odstoporováno“, „zastoporováno“, „poklop otevřen“, „chlazení“, „úroveň OŽ“, „řetěz střelby“, „nabito 1-4“.
- Počitadla patronů SP1-SP4.
- Stopor věže.
- Stopor kývavé části AZP.
- Řidičův poklop s kontaktem.
- Dvířka/kryt sběrače článků s kontaktem.
- Chladicí nádrž, čerpadlo, hadice a plnicí hrdlo.
- Munice: horní/dolní pásy, schránky, články, sběrač článků.
- DSO-20 a silový reduktor.
- Hydromotor č. 5, hydromotor/násos vertikálního navedení, rozvaděč, blok válců.

Priorita 2:

- Panely operátora vyhledávání a operátora dálky.
- Indikátor vyhledávání a indikátor dálky.
- Anténní kolona a search/peleng vlnovodný přepínač jako viditelný blok.
- GAG/gyro blok jako servisní komponenta.
- SЭП agregáty, baterie, převodník, externí napájecí zásuvka.
- Klapky PАЗ, ventilátory, filtr a pyropatronové kryty.
- Přístupové kryty GM-575: palivo, olej, chlazení, vzduch, baterie.

Priorita 3:

- ZIP úložiště a servisní nástroje.
- Kryty pro údržbu RPK bloků.
- Vnitřní kabeláž pro „živý“ servisní režim.
- Stavy znečištění, námrazy a opotřebení.

## Implementační návrh

### Datové uzly

Každý subsystém má mít vlastní stav:

- `ElectricalBus`
- `HydraulicSystem`
- `CoolingSystem`
- `GunSystem[4]`
- `AmmoFeed[4]`
- `TurretDrive`
- `ElevationDrive`
- `RadarSearchSystem`
- `RadarRangeSystem`
- `FireControlComputer`
- `StabilizationSystem`
- `InterlockGraph`
- `CrewStation`
- `MaintenanceState`

### Stavová pravidla

Pravidla mají být deklarativní. Příklad:

`canFire = fireCircuitPowered && coolingRunning && driverHatchClosed && linkCollectorClosed && !turretStopped && !cradleStopped && withinAngleLimit && gunsCharged && (emergencyFire || validFireData)`

Ale hráči se nikdy neukáže jen tento vzorec. Hráči se ukáže panel, zvuk, mechanika a symptom.

### Zdroj pravdy

Jedna pravda:

- fyzický objekt v modelu má stav,
- panel čte tentýž stav,
- logika blokace čte tentýž stav,
- AI posádka čte tentýž stav,
- replay/debug čte tentýž stav.

Tím se zabrání tomu, že model ukazuje zavřený poklop, ale logika ho považuje za otevřený.

## Outside-of-the-box nápady

### Simulace „posádka se učí“

Každý člen posádky má mentální model stroje. Nováček hlásí „nejde střílet“. Veterán hlásí „kontrola blokací, pravděpodobně poklop nebo stopor“. Hráč může trénovat posádku.

### Diagnostika podle zvuku

Relé, DSO-20, hydropohon, ventilace RLS, čerpadlo chlazení a startér mají rozlišitelné zvuky. Expert pozná závadu bez UI.

### Falešné kontrolky

Vadný kontakt může rozsvítit špatný stav. Hráč musí ověřit fyzicky: poklop je zavřený, ale kontakt nehlásí zavřeno.

### Režim „technická přejímka“

Před misí proběhne kontrolní checklist. Ne jako nudná tabulka, ale jako krátké scénáře:

- ověř blokaci poklopu,
- nastav limit úhlů,
- zkontroluj nulování dálky,
- zkontroluj chlazení,
- zkontroluj přepnutí search/peleng.

### Kampaň opotřebení

Špatné zacházení nezmizí po misi. Dlouhé dávky bez chlazení zhoršují hlavně. Jízda bez údržby ničí podvozek. Ignorovaná RLS ventilace vede k horšímu radaru.

### Kooperativní režim „čtyři lidé v jedné Shilce“

Velitel, operátor vyhledávání, operátor dálky a řidič. Žádný z nich nemá celou pravdu. Komunikace je gameplay.

### Režim instruktora

Instruktor může spouštět poruchy podle reálných blokací:

- otevřený poklop,
- stopor,
- prázdná horní schránka,
- slabé napětí,
- vadné chlazení,
- rušení radaru,
- špatný sektor search.

### Modelový „x-ray“ pro servis

Normálně realistický pohled. V servisním režimu lze zobrazit barevné vrstvy:

- elektrika,
- hydraulika,
- chlazení,
- munice,
- RPK/RLS,
- PАЗ.

To pomůže hráči pochopit stroj bez arkádových nápověd v boji.

## Prioritní backlog

### P0 - základ pravdivosti

1. Přidat `InterlockGraph`.
2. Rozdělit zbraně na čtyři automaty se samostatnou municí a stavem.
3. Přidat reálné elevace limity a rychlosti navedení.
4. Přidat přepínač omezení úhlů a jeho efekt.
5. Přidat stopory věže a kývavé části.
6. Přidat poklop řidiče jako blokovací objekt.
7. Přidat chlazení hlavní jako podmínku střelby.
8. Přidat panel velitele minimálně v logice a poté v modelu.

### P1 - RPK jako simulátor

1. Režimy kruhový search, zrychlený search, sektorový search.
2. Exkluzivní přechody mezi režimy.
3. Indikátor search/range se šumem.
4. „Есть данные“ jako skutečný stav.
5. Zóna zásahu jako podmínka režimů.
6. Rušení a přeladění frekvence.

### P2 - posádka a údržba

1. Role velitel/operátor search/operátor dálky/řidič.
2. Checklist přípravy k boji.
3. Údržbový stav mezi misemi.
4. Závady s diagnostikou.
5. Stav baterií, SЭП a externí napájení.

### P3 - hloubka modelu

1. Hydraulická fyzika s tlakem a odezvou.
2. PАЗ/PPO ventilace, klapky a přetlak.
3. Plné servisní panely.
4. ZIP a nástroje.
5. Detailní poškození vnitřních bloků.

## Největší rizika

Největší riziko není komplexita. Největší riziko je udělat komplexitu bez čitelnosti.

Řešení:

- Každý systém má mít fyzický, panelový a zvukový feedback.
- Hráč má rozumět příčině postupně, ne dostat suchou chybovou hlášku.
- Simulace má mít vrstvy obtížnosti: plná posádka, asistovaná posádka, instruktor, trénink.

Druhé riziko je model mismatch.

Řešení:

- Každý modelový díl, který ovlivňuje logiku, musí mít ID.
- Logika nesmí odkazovat na imaginární díl bez modelové reprezentace.
- Když díl v modelu chybí, backlog ho označí jako „model required“.

## Závěr

Nejsilnější směr je udělat Shilku jako živý elektromechanický organismus. Ne jako seznam funkcí.

První flagship feature bych postavil kolem přepínače omezení úhlů, blokací a pultu velitele. Je to doložené v dokumentech, je to herně pochopitelné, dá se to vizuálně ukázat na modelu a okamžitě to odliší simulátor od zjednodušených her.

Druhá flagship feature je RPK/RLS jako skutečný režimový systém: vyhledávání, sektor, doprovod, dálka, rušení, ztráta dat a „есть данные“.

Třetí flagship feature je posádková kooperace. Každá pozice má vlastní práci, vlastní chyby a vlastní pocit mistrovství.

