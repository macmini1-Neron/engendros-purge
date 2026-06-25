# Model and implementation backlog

Tenhle backlog převádí RnD do práce pro modeláře, programátory, UI a gameplay design. Není psaný jako seznam „cool nápadů“, ale jako výrobní mapa: každý blok má důkaz, modelový požadavek, simulační stav, posádkovou akci, test a minimální dodání.

## Prioritní pravidlo

Největší hodnota Shilky není v tom, že má hodně tlačítek. Hodnota je v propojení:

- fyzický díl existuje v modelu,
- jeho poloha nebo stav vstupuje do simulace,
- simulace rozsvítí správnou lampu nebo změní chování,
- posádka musí problém poznat a opravit,
- hráč vidí důsledek v boji.

Když funkce nesplní většinu těchto bodů, je to zatím jen dekorace.

## P0 - flagship jádro

### P0-001 Síť blokací palby a pohonů

Důkaz:

- E-002, E-003, E-004, E-005, E-006, E-007, E-008, E-039.

Model:

- poklop řidiče s jasnou animovanou polohou,
- stopor věže,
- stopor kývavé části,
- dvířka sběrače článků,
- pult velitele s lampami blokací,
- přepínač omezení úhlů,
- hlavně/kolébka s reálným úhlem elevace.

Simulace:

- `InterlockGraph`,
- `PhysicalContact`,
- `ActionPermission`,
- `FireCircuit`,
- `DrivePermission`,
- `AngleLimiter`.

Posádka:

- velitel diagnostikuje na pultu,
- řidič musí zavřít poklop,
- střelec nebo velitel odstoporuje věž/kolébku,
- nabíječ/posádka kontroluje sběrač článků.

UI:

- žádný univerzální text „blocked“ jako primární feedback,
- fyzická lampa na pultu,
- volitelný instruktorský overlay až v tréninkovém režimu.

Testy:

- s otevřeným poklopem řidiče nelze pálit,
- s věží ve stoporu nelze zapnout hydropohon,
- s otevřenými dvířky sběrače článků nelze zapnout hydropohon,
- přepnutí omezení úhlů změní přípustnou elevaci,
- lampy odpovídají příčinám blokace.

Minimální dodání:

- 5 fyzických kontaktů,
- 2 akce blokované stejným grafem,
- 1 panelová diagnostika,
- 1 scripted failure scenario.

Proč P0:

Tohle je největší odlišnost od běžného „vehicle shooter“ pojetí. Udělá ze Shilky stroj, který má vlastní bezpečnostní logiku.

### P0-002 Čtyři automaty AZP-23M

Důkaz:

- E-001, E-010, E-011, E-012, E-013, E-014, E-015, E-040.

Model:

- čtyři automaty jako samostatné podsestavy,
- horní a dolní zásobování,
- pásy a schránky,
- počitadla SP1-SP4,
- lampy „nabito“ 1-4,
- ručky/lanka přebití,
- chladicí nádrž, čerpadlo a hadice.

Simulace:

- `GunSystem[4]`,
- `AmmoFeed[4]`,
- `GunReady[4]`,
- `GunHeat[4]`,
- `GunJam[4]`,
- `PneumaticReloadSystem`,
- `CoolingLoop`.

Posádka:

- kontrola nabití po automatech,
- řešení zádržky konkrétního automatu,
- doplnění munice po schránkách,
- kontrola chlazení před dlouhou dávkou.

UI:

- počitadla a lampy na pultu velitele,
- zvukový rozdíl při výpadku jednoho automatu,
- vizuální asymetrie stopovek při výpadku jedné hlavně.

Testy:

- automat 2 může selhat a zbylé tři dál střílí,
- horní a dolní automaty mohou mít rozdílný stav munice,
- bez kapaliny roste teplota rychleji,
- ruční přebití obnoví jen správně obsloužený automat,
- počitadlo SP daného automatu klesá odděleně.

Minimální dodání:

- oddělené počitadlo munice pro 4 zbraně,
- oddělený heat/jam stav,
- jeden ruční clear jam workflow,
- vizuální indikace na pultu.

Proč P0:

Čtyřhlavňová Shilka nesmí ve hře působit jako jeden kanón s kosmetickými čtyřmi hlavněmi.

### P0-003 RPK/RLS start, režimy a radarový obraz

Důkaz:

- E-016 až E-025, E-041, E-042.

Model:

- anténní systém,
- pulty operátora vyhledávání a dálky,
- indikátor kruhového vyhledávání,
- indikátor dálky,
- vlnovodný přepínač,
- ventilace RLS,
- přepínače nakal/anodové napětí/režim.

Simulace:

- `RadarPowerSequence`,
- `RadarModeStateMachine`,
- `WaveguideSwitch`,
- `RadarVentilation`,
- `RadarReceiver`,
- `RadarIndicatorRenderer`,
- `JammingAndRetune`.

Posádka:

- velitel povoluje a sleduje připravenost,
- operátor dálky zapíná nakal a anodové napětí,
- operátor vyhledávání volí search režim,
- posádka řeší rušení přeladěním.

UI:

- radarový obraz jako pracovní přístroj,
- ne jako moderní minimapa,
- režimové přepínače exkluzivní,
- časové zahřívání a diagnostické test signály.

Testy:

- bez SЭP nejde RPK spustit,
- bez ventilace roste riziko poruchy nebo se start zakáže,
- kruhový search odpojí jiné režimy,
- sektorový search mění šířku sektoru,
- rušení zvedá šum nebo ztrácí echo,
- přeladění může obnovit použitelný obraz.

Minimální dodání:

- power-up sekvence se 3 stavy,
- 3 search režimy,
- jednoduchý PPI radar s šumem a echo body,
- jeden jamming scenario.

Proč P0:

Bez RPK je Shilka jen čtyřkanónové vozidlo. S RPK se z ní stává posádkový stroj s postupy, čekáním, chybami a spoluprací.

### P0-004 Hydropohon a ruční fallback

Důkaz:

- E-003, E-005, E-006, E-008, E-036, E-044.

Model:

- hydraulické čerpadlo,
- hadice nebo alespoň reprezentativní svazky,
- ovládací prvky zapnutí pohonů,
- stopory,
- ruční ovládací prvky pro nouzový režim.

Simulace:

- `HydraulicPressure`,
- `PumpState`,
- `TraverseDrive`,
- `ElevationDrive`,
- `ManualDrive`,
- `DriveMode`.

Posádka:

- zapnutí pohonu až po odstoporování,
- při závadě přechod na ruční pohony,
- pomalejší práce a vyšší pracovní zátěž.

UI:

- tlak/připravenost nepůsobí jako magie,
- pohyb věže má zvuk a rychlost podle stavu pohonu,
- ruční fallback má jiné tempo i ergonomii.

Testy:

- nízký tlak zpomaluje nebo znemožní pohyb,
- stopor blokuje hydropohon,
- ruční režim funguje i při části elektrických/hydraulických problémů,
- nebezpečné přepnutí pod zátěží vyvolá varování nebo riziko.

Minimální dodání:

- tlak jako resource,
- rychlost pohybu podle tlaku,
- ruční mód s nižší rychlostí,
- alespoň 2 blokace před zapnutím.

Proč P0:

Tohle propojí fyzické stavy věže, interlocky a bojovou schopnost.

## P1 - hluboké systémy po P0

### P1-001 SЭP a elektrická síť

Důkaz:

- E-030, E-031, E-032.

Model:

- agregát SЭP,
- baterie,
- generátor,
- externí zásuvka,
- řidičův panel s voltmetrem,
- pojistkové a rozvodné prvky podle dostupného modelového detailu.

Simulace:

- `BatteryBank`,
- `Generator`,
- `ExternalPower`,
- `Bus27V`,
- `Bus55V`,
- `AC115_400Hz`,
- `LoadShedding`.

Posádka:

- řidič sleduje napětí,
- velitel žádá zapnutí RPK nebo pohonů,
- špatné pořadí vede k propadu napětí.

Mechaniky:

- start SЭP z baterií,
- připojení generátoru do sítě,
- zatížení RPK a pohonů,
- slabé baterie po dlouhém stání,
- externí napájení v parku.

Testy:

- pod limitem napětí selže start,
- po připojení zátěže poklesne napětí,
- při běhu generátoru se síť stabilizuje,
- RPK start odmítne při nedostupné sběrnici.

Minimální dodání:

- 2 zdroje,
- 3 spotřebiče,
- voltmetr,
- start failure na slabé baterii.

### P1-002 PАЗ jako síť klapek, přetlaku a lamp

Důkaz:

- E-026, E-027, E-028, E-045.

Model:

- pult PАЗ z vizuální reference `refs/visual_checks/deep/paz_panel-24.png`,
- 11 klapek a 2 kryty alespoň jako logické/animované body,
- nagнетatel/ventilátor,
- těsnění věnce,
- ventilační přívody.

Simulace:

- `PazFlap[13]`,
- `Overpressure`,
- `AirflowGraph`,
- `ContaminationLevel`,
- `RadiationDetector`,
- `CrewExposure`.

Posádka:

- zapnutí PАЗ při kontaminaci,
- kontrola lamp klapek,
- řešení klapky, která nedosedla,
- kompromis mezi větráním, přetlakem a tepelným komfortem.

Mechaniky:

- automatické uzavření při signálu,
- ruční kontrola,
- poloviční/úplný svit lamp jako diagnostika,
- netěsnost snižuje ochranu,
- dlouhá jízda v uzavřeném režimu zvyšuje zátěž posádky.

Testy:

- otevřená klapka sníží přetlak,
- zapnutý ventilátor bez těsnosti nedá plnou ochranu,
- indikace klapek odpovídá fyzickému stavu,
- kontaminované prostředí poškozuje posádku bez PАЗ.

Minimální dodání:

- pult s lampami,
- 4 reprezentativní klapky fyzicky v modelu,
- zbytek jako logické body,
- přetlakový scalar a jeden NBC scénář.

### P1-003 UА PПO a požár vozidla

Důkaz:

- E-029, E-045.

Model:

- panel UА PПO podle `refs/visual_checks/deep/ppo_panel-48.png`,
- ruční tlačítka pro přední a zadní okruh,
- láhve/rozvody podle alb,
- motorový a přední prostor jako hasicí zóny,
- servisní poklopy z referencí `ppo_hatches-107.png` až `ppo_hatches-109.png`.

Simulace:

- `FireZoneFront`,
- `FireZoneRear`,
- `SuppressionBottle`,
- `AutoFireDetector`,
- `ManualDischarge`,
- `CrewSmokeExposure`.

Posádka:

- řidič nebo velitel pozná požár,
- posádka volí automat/ruční režim,
- při selhání automatiky se používá ruční tlačítko,
- po použití je nutné systém servisně obnovit.

Mechaniky:

- požár v motorovém prostoru po zásahu,
- kouř a ztráta výkonu,
- ruční hasení stojí láhev,
- falešný poplach nebo přerušený okruh jako závada.

Testy:

- automatický režim hasí správnou zónu,
- ruční přední tlačítko nehasí zadní zónu,
- po vyprázdnění láhve další požár není potlačen,
- indikace na panelu odpovídá stavu.

Minimální dodání:

- 2 zóny,
- 1 láhev pro každou zónu,
- auto/manual přepínač,
- panelové tlačítko a stav.

### P1-004 Řidič jako provozní operátor

Důkaz:

- E-031, E-032, E-033, E-034, E-035.

Model:

- řidičův panel podle `refs/visual_checks/deep/driver_panel-096.png`,
- voltmetr s polohami kontroly,
- ukazatele teploty, tlaku, paliva,
- přepínače GТD/SЭP/podhřev/palivové čerpadlo,
- poklop řidiče jako funkční objekt.

Simulace:

- `DriverPanelState`,
- `EngineCooling`,
- `OilPressure`,
- `FuelSystem`,
- `Preheater`,
- `Starter`,
- `DriverHatchInterlock`.

Posádka:

- řidič startuje a stabilizuje síť,
- sleduje motor při zatížení,
- rozhoduje mezi otevřeným poklopem a bojovou připraveností,
- hlásí poruchy veliteli.

Mechaniky:

- studený start,
- nízký tlak oleje,
- přehřívání motoru,
- palivové čerpadlo,
- otevřený poklop blokující bojové akce.

Testy:

- otevřený poklop propíše blokaci do palebného systému,
- nízký tlak oleje generuje poruchu,
- podhřev pomáhá ve studeném startu,
- voltmetr ukazuje správnou sběrnici nebo baterii.

Minimální dodání:

- panel s několika aktivními ovladači,
- hatch interlock,
- motor temperature/oil pressure loop,
- start checklist.

### P1-005 Údržba, opotřebení a kalibrace

Důkaz:

- E-036, E-037, E-038, E-039, E-040.

Model:

- servisní přístupové body,
- čisticí/mazací body jen tam, kde jsou hráčsky důležité,
- nářadí a kryty jako interakční body,
- boresight/kalibrační cíle podle mise nebo parku.

Simulace:

- `MaintenanceTask`,
- `ToolRequirement`,
- `CrewAssignment`,
- `WearState`,
- `CalibrationState`,
- `PostMissionService`.

Posádka:

- práce rozdělená mezi členy,
- časové náklady,
- rozhodnutí, co opravit před další misí,
- riziko zkrácené údržby.

Mechaniky:

- zanedbané čištění zvyšuje zádržky,
- rozhozená kalibrace zhoršuje přesnost,
- špatně nastavené odpojení střeleckého okruhu ohrožuje bezpečnost,
- po dlouhé dávce roste servisní dluh.

Testy:

- bez údržby roste pravděpodobnost poruch,
- kalibrace ovlivňuje přesnost,
- úkol vyžaduje správného člena posádky nebo technika,
- čas v kampani se skutečně spotřebuje.

Minimální dodání:

- 5 servisních úkolů,
- 3 zdroje opotřebení,
- jedna kalibrace RPK/AZP,
- denní obsluha po misi.

## P2 - high value polish

### P2-001 Fyzické zvuky stavů

Každý velký subsystem potřebuje vlastní zvukový jazyk:

- hydropohon: náběh čerpadla, zatížení při rychlém pohybu, kavitace/nízký tlak,
- AZP: rozdíl 4/3/2 automatů, ruční přebití, pásy, sběrač článků,
- RPK: ventilace, vysoké napětí jako jemné pozadí, motor antény,
- SЭP: start, stabilní běh, zátěžový pokles,
- PАЗ: klapky, ventilátor, přetlak,
- PПO: odpálení láhve, náhlé ztišení/dušení požáru.

Smysl:

- hráč pozná stav stroje i bez moderního HUDu,
- posádka může hlásit problémy podle zvuku,
- selhání je často slyšet dřív, než je vidět.

### P2-002 Instruktorský debug režim

Nesmí být primární hra, ale je zásadní pro vývoj i výuku.

Vrstva:

- interlock graph se zvýrazněnými příčinami,
- elektrické sběrnice a spotřebiče,
- hydraulický tlak,
- radarové režimy a RF cesta,
- posádkové úkoly a fronta akcí.

Použití:

- QA testuje scénáře,
- design ladí obtížnost,
- hráč v tréninku pochopí souvislosti.

### P2-003 Hlasová posádka jako diagnostika

Hlášky nemají nahrazovat systém. Mají pomáhat s přenosem informací.

Příklady:

- řidič: „Poklop otevřen, palba blokovaná.“
- velitel: „Odstoporovat věž.“
- operátor dálky: „Anodové zapnuto, čekám obraz.“
- operátor vyhledávání: „Rušení v pásmu, přelaďuji.“
- nabíječ/mechanik: „Druhý automat zádržka.“

Pravidlo:

- každá hláška musí odpovídat skutečnému stavu,
- žádné falešné filmové žvatlání bez vazby na simulaci.

### P2-004 Viditelné servisní následky

Stroj by měl po těžké misi vypadat a působit jinak:

- očouzené hlavně,
- znečištěné sběrače článků,
- drobné úniky oleje,
- stopy po otevřených krytech,
- spotřebované hasicí láhve,
- zahřátý motorový prostor,
- nižší spolehlivost po zanedbané údržbě.

Smysl:

- kampaň získá paměť,
- hráč si buduje vztah ke konkrétní mašině,
- servis není menu, ale péče o objekt.

## Modelářský checklist

### Interiér věže

Povinné:

- pult velitele z `azp_commander_panel-35.png`,
- lampy blokací a nabití 1-4,
- počitadla SP1-SP4,
- přepínač omezení úhlů,
- nouzová střelba,
- ručky/polohy stoporů,
- reprezentace čtyř automatů,
- pásové cesty a schránky,
- sběrač článků a dvířka,
- chladicí nádrž a hadice.

Doporučené:

- popisky čitelné alespoň v detailním pohledu,
- oddělené animované kryty pro loading/servis,
- barevné odlišení lamp podle skutečných panelů tam, kde to půjde ověřit vizuálně.

### RPK/RLS pracoviště

Povinné:

- pult operátora vyhledávání,
- pult operátora dálky,
- indikátor search,
- indikátor dálky,
- přepínače power-up sekvence,
- přepínače search režimů,
- ovladač sektoru,
- ventilace nebo její ovládací bod.

Doporučené:

- animovaná anténa,
- viditelný stav přepnutí search/peleng,
- servisní kryty vysokonapěťových částí jako nebezpečné body.

### Podvozek GM-575

Povinné:

- řidičův panel,
- funkční poklop řidiče,
- baterie nebo jejich přístup,
- SЭP/generátor jako modelový celek,
- motorový prostor jako poškozovací zóna,
- PПO panel,
- alespoň reprezentativní hasicí lahve,
- PАЗ panel a klapky.

Doporučené:

- přístupové poklopy pro servis,
- hadice/rozvody jen tam, kde budou čitelné a používané,
- odlišení přední a zadní hasicí zóny.

## Programátorský checklist

### Data

Zavést jednotný princip:

```ts
type PhysicalContactId =
  | "driver_hatch_closed"
  | "turret_unlocked"
  | "cradle_unlocked"
  | "link_collector_door_closed"
  | "cooling_ready"
  | "angle_allowed";
```

Každá akce se ptá na permission:

```ts
type PermissionResult = {
  allowed: boolean;
  causes: InterlockCause[];
  visibleLamps: PanelLampId[];
  affectedSubsystems: SubsystemId[];
};
```

Neukládat zvlášť `canFire = true` bez příčin. Simulátor musí vědět, proč se akce směla nebo nesměla stát.

### Tick vrstvy

Rychlé:

- balistika,
- pohyb věže,
- stav spouště,
- okamžité interlocky.

Střední:

- hydraulický tlak,
- elektrické zatížení,
- radar sweep,
- chladnutí hlavní.

Pomalé:

- opotřebení,
- baterie,
- kontaminace,
- údržba,
- kalibrace.

### Události

Důležité události:

- `ContactChanged`,
- `InterlockCauseChanged`,
- `SubsystemPowerChanged`,
- `RadarModeChanged`,
- `GunJamOccurred`,
- `CoolingFault`,
- `FireSuppressionDischarged`,
- `MaintenanceDebtAdded`.

Každá událost má:

- čas,
- původní subsystem,
- fyzickou příčinu,
- dopad na akce,
- volitelnou hlášku posádky.

## QA scénáře

### QA-001 Otevřený poklop řidiče

Postup:

1. Otevřít poklop řidiče.
2. Zkusit zapnout bojový režim.
3. Zkusit palbu.
4. Zavřít poklop.
5. Opakovat.

Očekávání:

- palba a/nebo příslušný okruh jsou blokované,
- pult ukáže příčinu,
- po zavření se blokace odstraní bez reloadu mise.

### QA-002 Stoporovaná věž

Postup:

1. Nechat stopor věže zapnutý.
2. Zapnout hydropohon.
3. Zkusit traverse.
4. Odstoporovat.
5. Zkusit znovu.

Očekávání:

- hydropohon nebo pohyb je blokovaný,
- lampa odpovídá stavu,
- po odstoporování se věž pohne.

### QA-003 Zádržka jednoho automatu

Postup:

1. Simulovat zádržku automatu 2.
2. Vystřelit krátkou dávku.
3. Zkontrolovat zvuk, kadenci, počitadla.
4. Provést ruční přebití/odstranění.
5. Vystřelit znovu.

Očekávání:

- střílí pouze 3 automaty,
- počitadlo automatu 2 neklesá při blokaci,
- po opravě se automat vrátí.

### QA-004 Přehřátí bez chlazení

Postup:

1. Vypnout nebo poškodit chlazení.
2. Vystřelit delší dávku.
3. Sledovat lampy a stav hlavní.
4. Zapnout chlazení nebo doplnit kapalinu.

Očekávání:

- teplota roste rychleji,
- systém varuje fyzickou lampou,
- riziko závady se zvýší,
- po obnově chlazení klesá.

### QA-005 Radar bez ventilace

Postup:

1. Vypnout ventilaci RPK.
2. Zkusit power-up RPK.
3. Nechat systém běžet pod zátěží.

Očekávání:

- systém odmítne start nebo rychle generuje fault,
- posádka dostane diagnostickou hlášku,
- po zapnutí ventilace lze pokračovat.

### QA-006 Rušení a přeladění

Postup:

1. Zapnout radarový search.
2. Aktivovat rušení v pásmu.
3. Sledovat obraz.
4. Přeladit pracovní frekvenci.

Očekávání:

- obraz degraduje,
- cíl se hůř drží nebo ztrácí,
- přeladění částečně nebo úplně pomůže podle scénáře.

### QA-007 PАЗ kontaminace

Postup:

1. Spustit kontaminované prostředí.
2. Nechat PАЗ vypnutý.
3. Zapnout PАЗ s jednou vadnou klapkou.
4. Opravit/zavřít klapku.

Očekávání:

- posádka bez ochrany dostává expozici,
- vadná klapka sníží přetlak,
- lampy ukážou problém,
- plně zavřený systém ochranu obnoví.

### QA-008 PПO přední/zadní zóna

Postup:

1. Zapálit zadní motorový prostor.
2. Stisknout přední ruční PПO.
3. Potom stisknout zadní.

Očekávání:

- přední okruh problém nevyřeší,
- zadní okruh požár potlačí,
- láhev se spotřebuje.

## Návrh implementačních milníků

### Milník A - stroj odmítá nesmysly

Obsah:

- interlock graph,
- poklop řidiče,
- stopory,
- dvířka sběrače článků,
- pult velitele s lampami,
- palba a hydropohon používají stejný permission systém.

Výsledek:

- první opravdu „Shilka“ moment: hráč ví, že stroj má vlastní logiku.

### Milník B - zbraň je čtyřdílný organismus

Obsah:

- 4 automaty,
- oddělená munice,
- oddělené zádržky,
- chlazení,
- ruční clear workflow,
- zvuková asymetrie.

Výsledek:

- palba přestane být arkádový efekt a stane se procedurální odpovědností.

### Milník C - RPK jako pracovní stanice

Obsah:

- power-up,
- 3 search režimy,
- radarový obraz,
- ventilace,
- rušení a přeladění,
- vypínací sekvence.

Výsledek:

- hráč/posádka řeší detekci jako proces, ne jako hotový waypoint.

### Milník D - vozidlo žije mezi misemi

Obsah:

- SЭP/baterie,
- řidičův panel,
- PАЗ,
- PПO,
- údržba,
- opotřebení,
- kampanový čas.

Výsledek:

- Shilka není jen zbraň v misi, ale stroj s historií.

## Rizika

### Riziko 1: příliš mnoho ovladačů bez významu

Protiopatření:

- každý ovladač v P0/P1 musí ovlivnit stav,
- dekorativní ovladače označit interně jako `nonfunctional_model_detail`,
- hráči neslibovat funkci, která v simulaci není.

### Riziko 2: moderní HUD zabije charakter

Protiopatření:

- primární feedback přes pulty, lampy, zvuk a posádku,
- moderní overlay jen pro trénink, debug nebo accessibility,
- nepřepisovat staré přístroje digitálními symboly.

### Riziko 3: simulace bude neprůhledná

Protiopatření:

- každá blokace má příčinu,
- příčina má fyzický díl,
- díl má vizuální stav,
- stav má lampu/hlášku/test.

### Riziko 4: model nebude podporovat logiku

Protiopatření:

- modelářský checklist řešit před high-poly detailem,
- pivoty a animované části definovat v backlogu,
- chybějící díly doplnit dřív než kosmetické opotřebení.

### Riziko 5: crew gameplay se zredukuje na single-player mikromanagement

Protiopatření:

- AI posádka může provádět známé checklisty,
- hráč přebírá kritické role podle situace,
- multiplayer role mají rozdílnou práci,
- velitel má systémový přehled, ne ruce ve všem.

## Outside-of-the-box nápady, které pořád drží realitu

### Mechanika „živý kabelový svazek“

Ne simulovat každý vodič, ale zavést několik pojmenovaných svazků:

- věžový svazek,
- pult velitele,
- RPK napájení,
- PАЗ/PПO signály,
- podvozkový startovací okruh.

Poškození nebo špatný kontakt neudělá abstraktní error. Rozbije konkrétní skupinu funkcí.

### Mechanika „servisní sluch“

Zkušená posádka pozná závadu podle zvuku:

- hydropohon jde těžce,
- SЭP padá pod zátěží,
- jeden automat nevystřelil,
- ventilace RPK neběží,
- čerpadlo chlazení zní nasucho.

Ve hře to může být perk/skill posádky, který zvýrazní relevantní zvuk nebo přidá hlášku.

### Mechanika „neúplně opravený stroj“

Po misi nejde všechno opravit. Hráč vybírá:

- rychle zprovoznit palbu,
- věnovat čas RPK,
- řešit podvozek,
- doplnit PПO,
- udělat kalibraci.

Další mise začne s reálnými kompromisy, ne jen procentem durability.

### Mechanika „procedurální viník“

Když akce selže, hra může vést vyšetřování:

- symptom: palba nejde,
- viditelná lampa: blokace,
- možné příčiny: poklop, stopor, dvířka, úhel, chlazení,
- hráč fyzicky obejde nebo přepne stanoviště,
- najde konkrétní stav.

Tohle udělá z poruchy hratelnou detektivku, ne frustrující zákaz.

### Mechanika „starý analogový radar“

Radar nemá dávat dokonalou pravdu. Má dávat obraz, který je třeba číst:

- šum,
- falešná echa,
- ztráta cíle v zemi/rušení,
- zahřívací drift,
- rozdíl mezi search a doprovodem,
- operátorská zkušenost.

Hodnota cíle není jen „locked/unlocked“, ale míra důvěry.

## Co ověřit proti aktuální hře

V dodaném workspace nejsou zdrojáky hry ani 3D modely, takže nejde udělat přímý diff. Jakmile budou dostupné, porovnat:

- existuje fyzický poklop řidiče a má animovaný/čtený stav,
- existují stopory nebo jen obecný „combat ready“ bool,
- palba je jedna zbraň nebo 4 automaty,
- munice je společná nebo po automatech,
- RPK je jen UI detekce nebo startovatelný subsystem,
- radarové režimy jsou exkluzivní a mají fyzickou logiku,
- chlazení hlavní existuje jako stav,
- PАЗ a PПO existují jako model i systém,
- SЭP/baterie existují jako zdroje,
- řidičův panel má provozní význam,
- údržba má čas, role a nářadí,
- panelové lampy jsou navázané na příčiny, ne jen dekorace.

## Krátký závěr pro produkci

Nejlepší první vertical slice:

1. Velitelův pult.
2. Poklop řidiče.
3. Stopor věže.
4. Čtyři automaty s počitadly.
5. Chlazení.
6. Základní RPK power-up.
7. Jeden radarový search režim.
8. Jeden scripted scénář, kde stroj odmítne palbu, hráč najde příčinu, opraví ji a sestřelí cíl.

Tohle je malý řez, ale obsahuje DNA celé koncepce: fyzický díl, stav, interlock, posádka, panel, bojový důsledek.
