# Evidence matrix

Tahle matice je most mezi manuály a hrou. Nejde jen o „co je zajímavé“, ale o to, jak z konkrétní stopy udělat systém, modelový díl, stav a gameplay.

Zkratky dokumentů:

- `IE1970` - `23-мм_счетверенная_зенитная_самоходная_установка_ЗСУ-23_ИЭ_Часть_1_1970.pdf`
- `GMcat1974` - `Гусеничная_машина_ГМ-575_Каталог_узлов_и_деталей_1974.pdf`
- `TO2A6M` - `ЗСУ-23-4_Техническое_описание_Текст.pdf`
- `AZPalbum2011` - `ЗСУ-23-4М_Альбом_рисунков_и_схем_Часть_1_АЗП-23М_2011.pdf`
- `GMalbum2012` - `ЗСУ-23-4М_Альбом_рисунков_и_схем_Часть_2_ГМ-575_2012.pdf`
- `GMdrawings` - `ЗСУ-23-4М_Гусеничная_машина_ГМ-575_Альбом рисунков.pdf`
- `RLS1RL33M` - `ЗСУ-23-4М_Изделие_1РЛ33М_Техническое_описание_1980.pdf`
- `IE2A6M1980` - `ЗСУ-23-4М_Инструкция_по_эксплуатации_2А6М_Часть_2_1980.pdf`
- `TroubleAlbum` - `ЗСУ-23-4М_Устранение_неполадок_и_техническое_обслуживание_Альбом_рисунков.pdf`
- `RLSops` - `ЗСУ-23-4М_Устройство_и_Эксплуатация_Часть_1_Устройство РЛС_Текст.pdf`

## Top evidence rows

| ID | Důkaz / stopa | Zdroj | Herní význam | Model / kód |
|---|---|---|---|---|
| E-001 | AZP-23M má 4 automaty, ráži 23 mm, min. 850 ran/min na automat, rozdílné zásoby horních a dolních automatů, elevaci cca -4°30' až +85°30' a neomezený azimut. | `AZPalbum2011` str. 5, vizuálně ověřeno v `refs/visual_checks/azp_specs-05.png` | Zbraň nesmí být jeden abstraktní kanón. Musí být 4 automaty s vlastní municí, závadou, přehřátím a stavem nabití. | `GunSystem[4]`, `AmmoFeed[4]`, `TurretDrive`, `ElevationDrive`, model horních/dolních pásů. |
| E-002 | Pult velitele obsahuje přepínač omezení úhlů, kontrolu blokací, lampy odstoporováno/zastoporováno, poklop otevřen, chlazení, hladina OŽ, nabito 1-4, počitadla patronů a nouzovou střelbu. | `AZPalbum2011` str. 35, vizuálně ověřeno v `refs/visual_checks/azp_commander_panel-35.png` | Pult velitele je primární gameplay surface pro diagnostiku. Nesmí být nahrazen jen HUDem. | Model pultu, `CommanderPanelState`, `LampState`, `SwitchState`, `AmmoCounters`. |
| E-003 | Blokace palby a pohonů jsou vázané na stopory, poklop řidiče, dvířka sběrače článků, chlazení, úhel, zónu zásahu a data. | `TO2A6M` str. 18, vizuálně ověřeno v `refs/visual_checks/tech_blockages-18.png` | Základ flagship simulace: stroj odmítá akci z reálných fyzických důvodů. | `InterlockGraph`, `canPowerTraverse`, `canFire`, `blockedBy...` diagnóza. |
| E-004 | Otevřený poklop řidiče blokuje DSO-20 a střelbu; provozní test výslovně zkouší, že motor/palba nenastanou. | `IE2A6M1980` str. 63 | Poklop je taktický kompromis: výhled vs bojová připravenost. | `DriverHatch.closedContact`, animace poklopu, lampa `люк открыт`. |
| E-005 | Stopor kývavé části a stopor věže blokují zapnutí hydropohonu. | `IE2A6M1980` str. 63; `TO2A6M` str. 12 | Stopory musí být fyzické modelové objekty, ne jen spawn state. | `TurretStop`, `CradleStop`, interlock kontakty, animované ručky. |
| E-006 | Otevřená dvířka/kryt sběrače článků blokuje hydropohon. | `IE2A6M1980` str. 63; `TO2A6M` str. 18 | Munice a sběr článků vstupují do bezpečnostní logiky. | `LinkCollectorDoor`, kontakt, animace, kontrola v checklistu. |
| E-007 | Přepínač omezení úhlů se při kontrole nastavuje na 40° a zkouší se moment změny kontrolky blokací při spouštění kolébky. | `IE2A6M1980` str. 63; `AZPalbum2011` str. 35 | Omezení úhlů má být testovatelný fyzický systém se stavem a kalibrací. | `AngleLimiterMode.test40`, `AngleLimiter.calibration`, model dorazu/snímače. |
| E-008 | Silové pohony a DSO-20 mají bezpečnostní pravidla: při běžícím pohonu se nemá otvírat poklop, přepínat režimy, stoporovat ani měnit místa posádky. | `IE1970` str. 18 | Přepínání pod zátěží má být zakázané nebo rizikové. | `DriveMotorState.running`, action locks, crew safety warnings. |
| E-009 | Existuje „zóna obmetání“ hlavní při pohybu věže a elevaci 0°. | `IE1970` str. 18 | Pohyb věže je fyzicky nebezpečný pro posádku/servis. | Debug/servisní overlay nebezpečné zóny, kolize hlavní. |
| E-010 | Chlazení hlavní má vlastní nádrž, čerpadlo, hadice, kapalinu podle sezóny a kontrolu těsnosti po 1-3 minutách běhu. | `IE1970` str. 25-26; `AZPalbum2011` str. 28-29 | Chlazení není dekorace. Je podmínka palby a zdroj závad. | `BarrelCoolingSystem`, hladina, tlak, kapalina, úniky, pumpa. |
| E-011 | Pult velitele obsahuje lampu „úroveň OЖ“ a „chlazení“. | `AZPalbum2011` str. 35 | Hráč musí poznat rozdíl mezi hladinou kapaliny a aktivním chlazením. | `coolantLevelLamp`, `coolingActiveLamp`. |
| E-012 | Kompresor/pneumatika plní lahve pro přebití, existují tlakové limity a čas plnění. | `IE1970` str. 26-27 | Přebíjení není nekonečné. Tlak v lahvích je gameplay resource. | `PneumaticReloadSystem`, tlak, kompresor, cooldown. |
| E-013 | Nabíjení munice začíná dolními automaty, vyžaduje polohu zbraně a otevření krytů. | `IE1970` str. 22 | Nabíjení je týmová procedura, ne instant reload. | Animované kryty, munice, crew timed task. |
| E-014 | Pult velitele má samostatné lampy „заряжено“ pro 1-4 automaty a počitadla SP1-SP4. | `AZPalbum2011` str. 35 | Každý automat má vlastní status a počitadlo. | `GunReadyLamp[4]`, `AmmoCounter[4]`, `AmmoFeed[4]`. |
| E-015 | Existuje ruční nabíjení a přebíjení s lanky/tlačítky/ručky; výkres je v albu AZP. | `AZPalbum2011` str. 30 | Jam clearing může být ruční procedura v interiéru. | Model ruček, lanka, `manualChargeAction`. |
| E-016 | RPK/RLS vyžaduje SЭП; velitel kontroluje napětí, operátor dálky zapíná nakal a pak anodové napětí. | `RLSops` str. 145 | Radar má startovací sekvenci a role. | `RadarPowerSequence`, `RangeOperatorPanel`, timers. |
| E-017 | Zapnutí GAG/stabilizační aparatury má kontrolní proceduru; při chybě stabilizace nepracuje. | `RLSops` str. 145 | Stabilizace má failure state, ne jen permanentní bonus. | `GyroSystem`, spin-up, fault lamp, drift. |
| E-018 | RLS má kruhový search, zrychlený kruhový search a sektorový search; zapnutí kruhového search odpojuje jiné režimy. | `RLS1RL33M` str. 144, vizuálně ověřeno v `refs/visual_checks/rls_search_modes-144.png` | Režimy musí být exkluzivní stavový stroj s reléovou logikou. | `RadarModeStateMachine`, `modeTransitionLockout`. |
| E-019 | Sektorový search má ovladač šířky sektoru a elektromagnetickou/reléovou logiku. | `RLS1RL33M` str. 144 | Sektor není jen animace radaru. Má nastavitelnou šířku a časování. | `SectorSearch.width`, `sectorCenter`, `relayState`. |
| E-020 | Vlnovodný přepínač směruje energii na search nebo peleng oblučovač. | `RLS1RL33M` str. 27; `RLSops` str. 24-26 | Search/doprovod je fyzická RF cesta, ne jen UI mode. | `WaveguideSwitch.searchPelengPosition`, failure/jam. |
| E-021 | Search oblučovač mění polohu paprsku podle elevace při hledání cíle. | `RLS1RL33M` str. 27 | Radarový paprsek má skenovací geometrii. | Radar cone/sweep simulation, indicator echo. |
| E-022 | Při rušení se přechází na jinou pracovní frekvenci magnetronu ruční přestavbou. | `RLSops` str. 22 | Rušení může mít opravdový counterplay: přeladění. | `RadarFrequency`, `JammingBand`, `retuneAction`. |
| E-023 | Přijímací systém řeší citlivost, směšovač, klystronový heterodyn a napájecí napětí. | `RLSops` str. 32-33 | Kvalita radaru může degradovat analogově, ne binárně. | `ReceiverSensitivity`, `noiseFloor`, `localOscillatorStability`. |
| E-024 | Vysoká napětí v RPK jsou životu nebezpečná a servis pod napětím má provádět dva lidé. | `IE1970` str. 18 | Servisní gameplay má bezpečnost a riziko. | `HighVoltageHazard`, two-person maintenance rule. |
| E-025 | RPK se nemá zapínat při nefunkční ventilaci. | `IE1970` str. 18 | Ventilace RLS je podmínka radaru. | `RadarVentilation.ok`, thermal fault. |
| E-026 | PАЗ systém tvoří dozimetr/radiometr, ventilátor/nagнетatel, klapky, kryty, těsnění věnce a elektrovybavení. | `TO2A6M` str. 31 | PАЗ není jen filtr. Je to síť klapek, přetlaku a signálních lamp. | `NBCSystem`, `PazFlaps[13]`, `overpressure`. |
| E-027 | PАЗ má 11 klapek a 2 kryty, kontrolované signálními lampami. | `TO2A6M` str. 31-32 | Každá klapka může být modelový a diagnostický prvek. | `PazFlapState`, `lampHalfGlow/fullGlow`, pyrotechnic close. |
| E-028 | PАЗ ovládá ventilaci a může blokovat/ovlivnit větrání podle polohy klapek. | `TO2A6M` str. 30-34 | NBC režim mění prostředí posádky a chlazení přístrojů. | `VentilationSystem`, `PazMode`, airflow graph. |
| E-029 | UА PПO má automatický/ruční režim a ruční tlačítka pro přední/zadní okruh. | `TroubleAlbum` str. 107; `GMalbum2012` str. 48 | Hasicí systém má být skutečný subsystem a nouzová crew akce. | `FireSuppressionSystem`, bottles, squibs, manual buttons. |
| E-030 | SЭП má vlastní agregáty, generátor, převodníky, baterie a externí napájecí zásuvku. | `TroubleAlbum` str. 88-91; `GMalbum2012` str. 39 | Elektrická síť musí mít zdroje a sběrnice. | `ElectricalBus27`, `Bus55`, `AC115_400`, `ExternalPower`. |
| E-031 | Při startu/roztáčení SЭП a GТD se kontroluje napětí baterií; pod zátěží nemá padat pod limit. | `IE1970` str. 49 | Slabé baterie mají herní dopad na start a bojovou připravenost. | Battery internal resistance, start voltage sag. |
| E-032 | Při připojení generátoru SЭП k síti je třeba zvýšit otáčky motoru. | `IE1970` str. 48 | Řidič/velitel koordinují motor a elektrickou zátěž. | Engine RPM load coupling, generator load. |
| E-033 | GM-575 má přední oddělení řízení, bojové oddělení, zadní silové oddělení a rozmístěné nádrže/agregáty. | `TO2A6M` str. 9; `TroubleAlbum` str. 88-89 | Poškození a servis mají být prostorově přesné. | Compartment graph, damage volumes, access hatches. |
| E-034 | Řidičův panel obsahuje teplotu vody, tlak oleje, palivo, startér, světla, podhřev, SЭП a další okruhy. | `TroubleAlbum` str. 96 | Řidič je provozní role, ne jen steering input. | `DriverPanel`, gauges, warning lamps. |
| E-035 | Mazání, filtry, palivový systém, chlazení motoru a vzduchový systém mají detailní výkresy. | `GMdrawings` str. 30, 36; `TroubleAlbum` str. 61, 78, 85 | GM-575 lze simulovat jako „živý podvozek“. | Maintenance tasks, filter clogging, cooling state. |
| E-036 | Údržba hydromotoru a čerpadel zahrnuje kontrolu čistoty, netěsnosti a oleje. | `IE2A6M1980` str. 45, 82; `TroubleAlbum` str. 34-35 | Hydraulické závady mají reálné symptomy. | Oil leak decal, pressure loss, slow traverse. |
| E-037 | Údržbové tabulky přiřazují práce členům posádky a technikům včetně času a nářadí. | `IE2A6M1980` str. 13, 18, 24, 30-31, 41 | Kampaň a servis mohou používat čas/nářadí jako resource. | `MaintenanceTask`, roles, duration, requiredTools. |
| E-038 | Kontrola statické přesnosti převodníků koordinát a nulování dálky je pravidelná/servisní činnost. | `IE2A6M1980` str. 18, 24 | Přesnost není konstantní; dá se rozladit a seřídit. | Calibration drift, boresight/range zero. |
| E-039 | Kontrola přesnosti odpojení střeleckého okruhu existuje jako údržbová položka. | `IE2A6M1980` str. 24 | Interlocky mají mít kalibraci a test, ne jen hardcoded truth. | `FireCircuitCutoffCalibration`. |
| E-040 | Po střelbě se zbraně rozebíjí/čistí/kontrolují; po návratu do parku probíhá denní obsluha. | `IE2A6M1980` str. 13, 119-125; `IE1970` str. 61 | Munice a střelba mají dlouhodobou cenu v kampani. | Barrel wear, fouling, post-mission maintenance. |
| E-041 | Vypnutí RPK má pořadí, včetně vypnutí vysokého napětí, motorů, anodového napětí a nakalu. | `RLSops` str. 147 | Špatné vypínání může zvyšovat riziko poruch. | `RadarShutdownSequence`, procedural scoring. |
| E-042 | RPK start má kontrolu signálů/„zvonění“ na indikátorech dálky a search. | `RLSops` str. 30, 145-146 | Radarový obraz má diagnostický, nejen bojový účel. | Diagnostic mode, indicator test signals. |
| E-043 | Velitel může otevírat palbu z ručky ogně, operátor z bloku 1-55M1 nebo spoušťovou pedálí podle režimu. | `TO2A6M` str. 18 | Ovládání palby je role- a režim-dependentní. | `FireAuthority`, `CommanderFire`, `OperatorFire`, `PedalFire`. |
| E-044 | První tři režimy práce jsou navázané na RPK a palebná data; pátý režim používá ruční pohony. | `TO2A6M` str. 15, 18 | Obtížnost se mění podle režimu; fallback je reálný. | `CombatMode[1..5]`, degraded operation. |
| E-045 | Pult PАЗ a PПО jsou fyzicky dohledatelné na výkresech/panelech. | `AZPalbum2011` str. 24; `GMalbum2012` str. 48; `TroubleAlbum` str. 107 | Ochranné systémy patří do interiéru a posádkové práce. | Model panels, switch IDs, lamp IDs. |

## Evidence to flagship features

### Flagship A - fyzická síť blokací

Podpůrné řádky: E-002, E-003, E-004, E-005, E-006, E-007, E-008, E-039.

Implementační jádro:

- `InterlockGraph`
- `PhysicalContact`
- `PanelLamp`
- `ActionPermission`
- `DiagnosticCause`

Modelové jádro:

- pult velitele,
- poklop řidiče,
- stopor věže,
- stopor kolébky,
- dvířka sběrače článků,
- chladicí okruh,
- úhlový omezovač.

### Flagship B - RPK/RLS jako reálný režimový systém

Podpůrné řádky: E-016 až E-025, E-041, E-042.

Implementační jádro:

- `RadarPowerSequence`
- `RadarModeStateMachine`
- `RadarIndicator`
- `RadarSignalModel`
- `RadarFaultModel`

Modelové jádro:

- pult operátora vyhledávání,
- pult operátora dálky,
- indikátor search,
- indikátor dálky,
- anténní kolona,
- vlnovodný přepínač,
- ventilace RLS.

### Flagship C - AZP jako čtyři samostatné automaty

Podpůrné řádky: E-001, E-010 až E-015, E-040.

Implementační jádro:

- `GunSystem[4]`
- `AmmoFeed[4]`
- `GunCooling`
- `ManualCharge`
- `BurstDoctrine`
- `WearAndFouling`

Modelové jádro:

- horní a dolní kolébky,
- čtyři automaty,
- pásy,
- schránky,
- ručky přebití,
- sběrač článků,
- chladicí nádrž a hadice.

### Flagship D - vozidlo jako živý elektromechanický organismus

Podpůrné řádky: E-026 až E-038.

Implementační jádro:

- `ElectricalNetwork`
- `HydraulicNetwork`
- `VehicleCompartmentGraph`
- `MaintenanceTaskSystem`
- `DriverOperationalState`

Modelové jádro:

- SЭП agregát,
- baterie,
- externí zásuvka,
- řidičův panel,
- PАЗ klapky,
- UА PПO,
- motorový prostor,
- palivové/olejové/chladicí body.

