# Driver evidence matrix

Zkratky dokumentů:

- `IE1970` - `23-мм_счетверенная_зенитная_самоходная_установка_ЗСУ-23_ИЭ_Часть_1_1970.pdf`
- `GMcat1974` - `Гусеничная_машина_ГМ-575_Каталог_узлов_и_деталей_1974.pdf`
- `GMdrawings` - `ЗСУ-23-4М_Гусеничная_машина_ГМ-575_Альбом рисунков.pdf`
- `TroubleAlbum` - `ЗСУ-23-4М_Устранение_неполадок_и_техническое_обслуживание_Альбом_рисунков.pdf`
- `IE2A6M1980` - `ЗСУ-23-4М_Инструкция_по_эксплуатации_2А6М_Часть_2_1980.pdf`
- `AZPalbum2011` - `ЗСУ-23-4М_Альбом_рисунков_и_схем_Часть_1_АЗП-23М_2011.pdf`

## Evidence rows

| ID | Důkaz / stopa | Zdroj | Herní význam | Model / kód |
|---|---|---|---|---|
| D-001 | Mechanik-řidič má znát GM-575, GТD, SЭP, PПO, noční vidění a navigační aparaturu. | `IE1970` str. 75 | Řidič je systémový operátor, ne jen input pro WASD. | `DriverRoleKnowledge`, skill gates pro start, SЭP, požár, jízdu. |
| D-002 | Řidič má umět ovládat GM-575 a systém elektropohonu/elektrického napájení ve všech režimech. | `IE1970` str. 75 | Řidič je součást energetické readiness bojového komplexu. | `DriverElectricalActions`, `PrimaryPowerState`. |
| D-003 | Řidič odstraňuje závady a provádí údržbu GM-575, GТD a agregátů SЭP. | `IE1970` str. 75 | Opravy nejsou jen technik v menu; řidič má vlastní servisní gameplay. | `DriverMaintenanceTask`, `FaultDiagnosis`. |
| D-004 | Řidič začíná a ukončuje pohyb po povelu velitele. | `IE1970` str. 75; str. 118 | Posádková koordinace: řidič nemá autonomně rozjíždět stroj v bojové práci. | `CommanderMoveOrder`, `DriverAcknowledge`. |
| D-005 | Dokument explicitně varuje, že neopatrná jízda může poškodit složité radioelektronické vybavení. | `IE1970` str. 75 | Jízda má ovlivnit stav RPK/RLS a citlivé elektroniky. | `RideShock`, `ElectronicsShockDamage`, `DriverSmoothnessScore`. |
| D-006 | Při pohybu v úzkých místech s plně zapnutým komplexem je nutné počítat s cca 6 m kruhem opisovaným hlavněmi při rotaci věže. | `IE1970` str. 75 | Řidič řeší clearance věž+hlavně, ne jen korbu. | `SweptGunEnvelope`, collision hazard, AI commander warnings. |
| D-007 | Před startem/bojovou prací se nastavuje řada prvků u řidiče: reduktor SЭP, ruční přívod paliva, řazení neutrál, palivový kohout na přední nádrž, ventil vzduchového balónu, pedál horské brzdy. | `IE1970` str. 45 | Řidičova příprava je checklist s fyzickými polohami. | `DriverPreStartChecklist`, `FuelTankSelector`, `GearNeutralContact`, `AirStartValve`. |
| D-008 | Řidič obsluhuje start GТD: zapnutí palubní sítě, otevření zaslonek GТD, zvukový signál, studené protočení, horký start. | `IE1970` str. 48-49 | Start GТD je procedura s časem, rizikem a indikátory. | `GTDStartSequence`, `ColdCrankState`, `GTDFlapState`. |
| D-009 | Při studeném protočení GТD se sleduje napětí baterií; při práci startéru nesmí klesnout pod 18 V. | `IE1970` str. 49 | Slabé baterie mají konkrétní gameplay dopad. | `BatteryVoltageSag`, `StarterDamageRisk`. |
| D-010 | Při studeném protočení se sleduje tlak oleje 0,15-0,2 kg/cm2; bez tlaku max. tři protočení. | `IE1970` str. 49 | Mazání GТD je kritický pre-start stav. | `GTDOilPressure`, `ColdCrankAttempts`, `BearingDamageRisk`. |
| D-011 | Bez studeného protočení před horkým startem hrozí práce ložisek bez mazání a porucha. | `IE1970` str. 49 | Nesprávný postup způsobí latentní poškození, ne jen fail message. | `ProcedureViolation`, `GTDBearingWear`. |
| D-012 | GТD se nesmí protáčet/startovat bez paliva v nádrži. | `IE1970` str. 49 | Palivo pro GТD je reálný interlock/riziko. | `GTDFuelAvailable`, `StartForbiddenOrDamage`. |
| D-013 | Při dosažení 44 % otáček GТD se startér automaticky odpojí; pokud lampa startéru nezhasne, motor zastavit. | `IE1970` str. 49 | Start má automatiku a failure branch. | `StarterAutoCutoff`, `StarterStuckFault`. |
| D-014 | Po startu se generátor automaticky připojí, když napětí překročí napětí baterií; rozsvítí se lampa `ГЕНЕРАТОР`. | `IE1970` str. 50 | Lampa generátoru je důležitý readiness signál. | `GeneratorOnline`, `LampGenerator`. |
| D-015 | Řidič hlásí veliteli dokončení startu GТD při lampě generátoru a volnoběžných otáčkách 98,5-103,5 %. | `IE1970` str. 50 | Posádkový workflow: velitel čeká na řidičovo hlášení před další akcí. | `CrewReportGTDReady`. |
| D-016 | Při stálé zátěži GТD má řidič sledovat otáčky 98,5-101,5 %, teplotu plynů max. 650 C, teplotu oleje max. 110 C, tlak oleje 0,5-2,5 kg/cm2. | `IE1970` str. 50 | Řidič má kontinuální instrument scan. | `GTDInstrumentBand`, `DriverScanTask`. |
| D-017 | Při odchylce přístrojů nebo pompaži má řidič spustit V-6R, nastavit 1550-1700 ot/min, zastavit GТD a hlásit veliteli. | `IE1970` str. 50 | Nouzový přechod zdroje energie je reálný gameplay. | `GTDSurgeFault`, `FallbackToV6RGenerator`. |
| D-018 | Velitel může spustit BPS/převodník, ale automatický start GТD z velitelského pultu je doporučen jen v boji, protože velitel nemá řidičovy kontrolní přístroje. | `IE1970` str. 50 | Rozdělení kompetencí: velitel umí vynutit energii, ale řidič ji bezpečně kontroluje. | `CommanderAutoStartGTD`, `UnsafeAutoStartMode`. |
| D-019 | Při práci generátoru SЭP od V-6R je třeba držet min. 1550 ot/min; při nižších otáčkách může generátor odpadnout a převodník vybije baterie. | `IE1970` str. 51 | Řidičova práce s otáčkami přímo drží RPK/převodník při životě. | `EngineRPMPowerCoupling`, `BatteryDrainOnLowRPM`. |
| D-020 | Při práci od V-6R svítí na řidičově panelu `ПРЕОБРАЗ. ДИЗ.` a `ПРЕОБРАЗ.`. | `IE1970` str. 51 | Panel rozlišuje zdroj převodníku. | `LampConverterDiesel`, `LampConverter`. |
| D-021 | Pro zabránění nečekaného startu GТD při kontrolách má řidič vypnout pravý spínač `АВТОМАТ. ЗАП. ГТД` pod krytem. | `IE1970` str. 51; `GMdrawings` str. 130 | Pod krytem je bezpečnostní přepínač s bojovým a tréninkovým významem. | `AutoStartGTDGuardedSwitch`. |
| D-022 | Kontrola SЭP se dělí mezi velitele a řidiče; řidič sleduje voltmetr na svém štítku. | `IE1970` str. 51 | Energetická diagnostika je vícerolová. | `SharedPowerDiagnostics`. |
| D-023 | Při překročení DC napětí 57 V provádí havarijní odpojení generátoru PGS2-14A mechanik-řidič. | `IE1970` str. 51 | Řidič má nouzovou autoritu v elektrické síti. | `EmergencyGeneratorDisconnect`. |
| D-024 | Musí se ověřit ventilátor akumulátorového oddílu výstupem vzduchu u poklopu nad přední palivovou nádrží. | `IE1970` str. 51 | Baterie a ventilace nejsou abstraktní; mají fyzický test. | `BatteryCompartmentVentilation`. |
| D-025 | Otevřený poklop řidiče blokuje DSO-20 a obvod střelby; test je výslovně uveden v provozní instrukci. | `IE2A6M1980` str. 63 | Poklop je hlavní bezpečnostní interlock. | `DriverHatchClosedContact`, `FireBlockedByHatch`. |
| D-026 | Výkres ukazuje instalaci spínače blokace poklopu: PS-3, držák, horní čelní plech, víko poklopu, váleček, tyčka, šroub, kryt a regulační podložka. | `GMdrawings` str. 159, vizuálně `refs/visual_checks/driver/gm_album_hatch_block-159.png` | Blokace poklopu má být fyzický modelový mechanismus. | Model contact roller, adjustable switch, debug contact. |
| D-027 | Řidičův panel obsahuje tlačítka `ЦЕПЬ -27В`, `ЦЕПЬ +27В`, `ПИТАНИЕ ВКЛ/ОТКЛ`, `ПУСК ГТД`, `СТОП ГТД`, `ХОЛОДНАЯ ПРОКРУТКА`, `ЗАКРЫТИЕ ЗАСЛОНОК`, `ГЕНЕРАТ`, `АВТОМАТ. ЗАП. ГТД`, pumpy, světla, stěrače, přístroje motoru/GТD. | `GMdrawings` str. 130, `TroubleAlbum` str. 96, vizuálně `gm_album_driver_panel-130.png` a `driver_panel-096.png` | Panel musí být centrální hratelné rozhraní řidiče. | `DriverPanelState`, active buttons/switches/gauges. |
| D-028 | Panel má samostatné lampy `ЛЮК ВОДИТ.`, `ПРИТОЧ. ВЕНТИЛ.`, `ВЫТЯЖН. ВЕНТИЛ.`, `СИГНАЛ ПАЗ`. | `GMdrawings` str. 130 | Řidič vidí stav poklopu, ventilace a PАЗ. | `DriverLampHatch`, `VentilationLamp`, `PazSignalLamp`. |
| D-029 | Při PАЗ řidičův panel signalizuje PАЗ a zavřené klapky; velitel kontroluje zavření řidičova poklopu podle zhasnutí červené lampy `ЛЮК ОТКРЫТ` na velitelském pultu. | `IE1970` str. 113 | Řidič je součást NBC uzavření vozidla. | `NBCSealWorkflow`, hatch closure cross-panel. |
| D-030 | Při požáru a selhání automatiky UА PПO má mechanik-řidič ručně přepnout na `РУЧН.` a stisknout `ПЕРЕДН.` nebo `ЗАДН.` podle zóny. | `IE1970` str. 115 | Řidič má přímou hasicí roli. | `DriverFireSuppressionManual`. |
| D-031 | Při požáru v oddělení řízení nebo pod věží: zastavit ZSU, vypnout SЭP, otevřít zadní poklop za řidičem, použít CO2 hasicí přístroj. | `IE1970` str. 117 | Řidičovo okolí má samostatný emergency workflow. | `InteriorFireProcedure`, `ManualExtinguisherAction`. |
| D-032 | Za deště mají být poklopy oddílu posádky, velitelské věžičky a oddělení řízení zavřené. | `IE1970` str. 102 | Počasí vstupuje do viditelnosti, bezpečnosti a interlocků. | `WeatherHatchPolicy`, `DriverVisibilityMode`. |
| D-033 | V zimě při GТD sledovat, aby se do něj nedostala voda s palivem; při startu zvlášť sledovat tlak oleje a případně provést 2-3 studená protočení. | `IE1970` str. 102 | Klimatické podmínky mění startovací proceduru. | `ColdWeatherStartModifier`. |
| D-034 | Řidičův periskopický a boční pozorovací přístroj má vlastní skla, stěrač, ostřik, zámky a fixaci. | `GMdrawings` str. 163-164, vizuálně `gm_album_driver_vision-163.png`, `gm_album_driver_vision-164.png` | Výhled řidiče může být fyzicky omezený, špinavý a servisovatelný. | `DriverVisionBlock`, `WiperWasherState`, `VisionDamage`. |
| D-035 | Katalog GM-575 uvádí levou/pravou řídicí páku, táhla, sektory, mezilehlé hřídele a pedál horské brzdy. | `GMcat1974` str. 115, vizuálně `gm_catalog_levers-115.png` | Ovládání podvozku má být mechanická soustava, ne instant steering. | `SteeringLeverLeftRight`, `PMPBrakeLinkage`. |
| D-036 | Katalog uvádí pedál hlavního frikcionu, pedály hlavního frikcionu a horské brzdy, táhla a servopružiny. | `GMcat1974` str. 122-123 | Pedály mají chod, odpor a stav opotřebení. | `ClutchPedal`, `MountainBrakePedal`, `PedalTravel`. |
| D-037 | Katalog a výkresy uvádí páku řazení převodovky a tabulku poloh. | `GMcat1974` str. 125, 137; vizuálně `gm_catalog_gear_lever-137.png` | Řazení může mít polohy, chyby a nutnost neutrálu před startem. | `GearLever`, `GearGate`, `NeutralInterlock`. |
| D-038 | Výkresy ukazují pedál/ruční ovládání palivového čerpadla a ruční přívod paliva. | `GMdrawings` str. 23-24, vizuálně `gm_album_fuel_control-023.png`, `gm_album_fuel_control-024.png` | Řidičovo ovládání výkonu může mít analogovou mechaniku. | `FuelPumpControl`, `ManualFuelFeed`. |
| D-039 | Výkres systému mazání ukazuje olejovou nádrž, radiátor, manometr, termometr, čerpadla, filtr, odstředivý čistič. | `GMdrawings` str. 30, vizuálně `gm_album_oil_system-030.png` | Olej není jen číslo, ale síť s teplotou, tlakem, filtrem a úniky. | `EngineOilSystemGraph`. |
| D-040 | Výkres systému chlazení ukazuje termostaty, expanzní nádobku, radiátor, vodní čerpadla, odvod par, krány a předehřev. | `GMdrawings` str. 36, vizuálně `gm_album_cooling_system-036.png` | Řidič sleduje vodu/teplotu a řeší přehřívání. | `EngineCoolingSystemGraph`. |
| D-041 | Údržbová instrukce uvádí kontrolu pojezdové části, torzních hřídelí, hladiny oleje v reduktoru SЭP, hladiny chladicí kapaliny, chodů řídicích pák, vůle PМP/brzd, úniků kapalin, tlaku vzduchového startu, baterií, UА PПO, stěračů a přístrojů řidiče. | `IE2A6M1980` str. 41-42 | Řidič má velmi širokou servisní doménu. | `DriverInspectionChecklist`. |
| D-042 | Při výcviku jízdy může velitel zastavit motor tlačítkem `ОТКЛЮЧЕНИЕ ДИЗЕЛЯ` na velitelském pultu. | `IE1970` str. 102; `AZPalbum2011` str. 35 | Velitel má bezpečnostní override při špatné jízdě/neschopnosti řidiče. | `CommanderDieselKillSwitch`. |
| D-043 | Pokud je mechanik-řidič vyřazen za jízdy, velitel musí zastavit V-6R a ukončit pohyb tlačítkem `ОТКЛЮЧЕНИЕ ДИЗЕЛЯ`. | `refs/02_klicove_pasaze.md`, `IE1970` textová stopa | Crew casualty má specifický protokol. | `DriverIncapacitatedProcedure`. |
| D-044 | Při marsh/marsu volit rychlost podle podmínek tak, aby se nepoškodila RPK; posádka má být na místech se šlemofony. | `IE1970` str. 118 | Řízení je propojené s ochranou elektroniky a komunikací. | `RoadRoughnessToRPKWear`, `CrewIntercomRequired`. |

## Nejsilnější mechanické vazby

### Vazba A - řidičův poklop je skutečný interlock

Důkazy: D-025, D-026, D-028, D-029.

Herní jádro:

- řidič může chtít otevřený poklop kvůli výhledu,
- otevřený poklop blokuje DSO-20 a střelbu,
- stav poklopu je fyzicky čtený spínačem PS-3,
- stav se zobrazuje na panelech.

### Vazba B - řidič drží energetickou páteř vozidla

Důkazy: D-007 až D-024.

Herní jádro:

- GТD, V-6R, SЭP, baterie a převodník jsou propojené,
- řidič sleduje napětí, otáčky, tlak a teploty,
- špatné otáčky nebo slabé baterie mohou rozbít readiness RPK,
- velitel může spustit automatiku, ale řidič má přístroje pro bezpečný dohled.

### Vazba C - řidičovo řízení chrání nebo ničí citlivý systém

Důkazy: D-004, D-005, D-006, D-035 až D-037, D-044.

Herní jádro:

- rychlost, povrch a manévry generují vibrace/rázy,
- RPK a elektronika mohou degradovat,
- řidič musí jet podle povelu, terénu a bojové potřeby,
- v úzkém prostoru řeší nejen korbu, ale i rotující věž a hlavně.

### Vazba D - řidič je první nouzový technik

Důkazy: D-030, D-031, D-033, D-041, D-042, D-043.

Herní jádro:

- ruční PПO,
- zastavení vozidla,
- vypnutí SЭP,
- CO2 hasicí přístroj,
- studené starty,
- nouzové vypnutí dieselu velitelem.
