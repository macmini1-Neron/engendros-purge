# Driver model and implementation backlog

Backlog je seřazený tak, aby první vertical slice ukázal hloubku role řidiče bez nutnosti dělat úplně každý detail GM-575 najednou.

## P0 - flagship driver slice

### P0-D-001 Řidičův poklop jako fyzický interlock

Důkazy:

- D-025, D-026, D-028, D-029.

Model:

- víko poklopu řidiče,
- pivot a animace otevření/zavření,
- spínač PS-3,
- držák spínače,
- váleček,
- tyčka,
- regulační podložka/kryt jako modelový detail,
- lampa `ЛЮК ВОДИТ.` na panelu,
- velitelská indikace otevřeného poklopu.

Simulace:

- `driver_hatch_physical_closed`,
- `driver_hatch_contact_closed`,
- `driver_hatch_seal_integrity`,
- `driver_hatch_blocks_fire`,
- `driver_hatch_blocks_dso20`.

Gameplay:

- otevřený poklop zlepší výhled,
- zavřený poklop odblokuje palbu,
- špatný kontakt je řešitelná závada.

QA:

- otevřený poklop blokuje DSO-20/palbu,
- zavřený a sepnutý kontakt blokaci odstraní,
- zavřený, ale neseplý kontakt stále blokuje,
- stav lamp odpovídá kontaktu.

### P0-D-002 GТD startovací sekvence

Důkazy:

- D-008 až D-018, D-021.

Model:

- aktivní panelové prvky `ПИТАНИЕ`, `ХОЛОДНАЯ ПРОКРУТКА`, `ПУСК ГТД`, `СТОП ГТД`,
- kryt tlačítka startu,
- lampy `СТАРТЕР ГТД`, `ГТД`, `ОТКРЫТ. ЗАСЛ.`, `ГЕНЕРАТОР`,
- budíky: otáčky GТD, tlak oleje, teplota oleje, teplota plynů.

Simulace:

- `GTDStartSequence`,
- `BatteryVoltageSag`,
- `GTDOilPressure`,
- `StarterAutoCutoff`,
- `GTDGeneratorOnline`,
- `GTDProcedureViolation`.

Gameplay:

- hráč musí udělat studené protočení,
- sledovat tlak oleje,
- nerozbít startér slabými bateriemi,
- ohlásit readiness.

QA:

- bez baterií start selže,
- bez tlaku oleje start varuje/poškozuje,
- startér se odpojuje při podmínce,
- lampa generátoru svítí až po připojení generátoru.

### P0-D-003 Řidičův panel jako čitelná pracovní plocha

Důkazy:

- D-027, D-028.

Model:

- panel podle `gm_album_driver_panel-130.png`,
- funkční ručičky u P0 budíků,
- funkční tlačítka s fyzickou odezvou,
- lampy se správnou barvou tam, kde to dokument uvádí.

Simulace:

- `DriverPanelState`,
- binding lamp/budík na subsystem,
- zoom/interakční body.

Gameplay:

- hráč primárně čte panel, ne moderní HUD,
- tutorial může zvýrazňovat prvky,
- debug režim umí ukázat mapování.

QA:

- každé P0 tlačítko mění stav,
- každá P0 lampa odpovídá stavu,
- ručičky se nehýbou náhodně,
- panel je čitelný na cílovém FOV.

### P0-D-004 V-6R/SЭP otáčky a baterie

Důkazy:

- D-019, D-020, D-022, D-023.

Model:

- otáčkoměr V-6R,
- lampy převodníku z diesel/GТD,
- voltmetr,
- případně ručka odpojení/zdrojový stav.

Simulace:

- `EngineRpmToGeneratorOutput`,
- `ConverterLoad`,
- `BatteryDrain`,
- `EmergencyGeneratorDisconnect`.

Gameplay:

- při nízkých otáčkách generátor odpadá,
- baterie se vybíjí,
- řidič musí držet otáčky nebo spustit GТD.

QA:

- pod limitem vzniká battery drain,
- při správných otáčkách je síť stabilní,
- nouzové odpojení generátoru funguje.

## P1 - plná řidičská role

### P1-D-001 Ovládání GM-575

Důkazy:

- D-035, D-036, D-037, D-038.

Model:

- levá a pravá řídicí páka,
- pedál hlavního frikcionu,
- pedál horské brzdy,
- řadicí páka,
- tabulka poloh,
- palivový pedál/ruční přívod.

Simulace:

- `ClutchTravel`,
- `GearLeverPosition`,
- `LeftRightSteeringLevers`,
- `MountainBrake`,
- `ManualFuelFeed`,
- `TransmissionWear`.

Gameplay:

- rozjezd a řazení má fyzický rytmus,
- rough shifting opotřebuje převodovku,
- horská brzda je samostatný nástroj,
- neutrál je startovací podmínka.

### P1-D-002 Viditelnost řidiče

Důkazy:

- D-032, D-034.

Model:

- periskopický přístroj,
- boční přístroj,
- ochranná skla,
- stěrače,
- ostřik,
- vyhřívání skla.

Simulace:

- `VisionDirt`,
- `RainOnGlass`,
- `WiperState`,
- `WasherFluid`,
- `GlassDamage`,
- `HatchOpenViewBonus`.

Gameplay:

- zavřený poklop není trest, pokud fungují přístroje,
- počasí mění práci řidiče,
- poškozené sklo nutí zpomalit nebo otevřít poklop mimo boj.

### P1-D-003 PАЗ driver integration

Důkazy:

- D-028, D-029.

Model:

- řidičovy PАЗ/ventilační lampy,
- vazba na klapky,
- těsnění poklopu.

Simulace:

- `DriverHatchSeal`,
- `PazSignalToDriverPanel`,
- `VentilationFlapState`,
- `CrewCompartmentPressure`.

Gameplay:

- kontaminace není jen stav velitele,
- řidič kontroluje svůj prostor,
- poklop a ventilace jsou součástí ochrany.

### P1-D-004 UА PПO ručně z místa řidiče

Důkazy:

- D-030, D-031.

Model:

- přístup k automatu/ovladači UА PПO,
- přepínač ručně/auto,
- tlačítka přední/zadní,
- ruční CO2 hasicí přístroj v dosahu.

Simulace:

- `FireZoneFront`,
- `FireZoneRear`,
- `ManualSuppressionCommand`,
- `BottleRemaining`,
- `ToxicVaporAfterDischarge`.

Gameplay:

- řidič řeší požár bez čekání na magii,
- špatná zóna má cenu,
- po uhašení je potřeba odvětrat.

### P1-D-005 Údržba podvozku řidičem

Důkazy:

- D-003, D-039, D-040, D-041.

Model:

- servisní přístupové body,
- olejové/kapalinové body,
- baterie/ventilace,
- kontrola táhel/pák,
- přístup k reduktoru SЭP.

Simulace:

- `DriverInspectionChecklist`,
- `FluidLeak`,
- `BrakeGap`,
- `LeverTravel`,
- `AirStartPressure`,
- `BatteryCondition`.

Gameplay:

- řidič po misi rozhoduje, co je kritické,
- zanedbané GM-575 zhorší další misi,
- servisní dovednost posádky zkrátí čas.

## P2 - detail, který prodá realitu

### P2-D-001 Špatně seřízený spínač poklopu

Mechanika:

- fyzicky zavřený poklop,
- kontakt někdy sepne, někdy ne,
- vibrace mohou kontakt rozpojit,
- seřízení vyžaduje servis.

Herní efekt:

- občasná blokace palby,
- frustrace pouze tehdy, pokud není diagnostika,
- velmi silný sim moment, když hráč najde mechanickou příčinu.

### P2-D-002 Driver smoothness score

Ne jako arkádové skóre na obrazovce, ale interní model:

- plynulost rozjezdu,
- tvrdost řazení,
- rychlost přes překážky,
- zatížení RPK,
- vibrace,
- dlouhodobé opotřebení.

Použití:

- AI řidič skill,
- multiplayer feedback po misi,
- servisní náklady.

### P2-D-003 Zvuková diagnostika řidiče

Zvuky:

- GТD studené protočení,
- startér pod slabou baterií,
- odpojení startéru,
- pompaž,
- V-6R pod zatížením,
- převodovka při špatném řazení,
- stěrače na suchém skle,
- klapka/poklop nedosedl.

Smysl:

- zkušený hráč pozná stav sluchem,
- řidičova role dostane tělo.

### P2-D-004 Režim instruktora řidiče

Overlay pouze v tréninku/debugu:

- ukáže tok energie,
- ukáže startovací sekvenci,
- ukáže důvod blokace poklopu,
- ukáže roadShock,
- ukáže stav poklopového kontaktu,
- ukáže zatížení baterií.

## Modelářský checklist

### Driver station P0

- přístrojový štít podle str. 130,
- tlačítka GТD,
- kryt startu GТD,
- voltmetr,
- otáčkoměr GТD,
- tlak oleje GТD,
- teplota plynů,
- lampy GТD/generátor/startér,
- lampa poklopu,
- poklop řidiče,
- spínač PS-3 s válečkem,
- základní periskop/vidění.

### Driver station P1

- řídicí páky,
- řadicí páka,
- pedály,
- ruční přívod paliva,
- stěrače/ostřik,
- boční pozorovací přístroj,
- UА PПO ovládání,
- CO2 hasicí přístroj,
- PАЗ lampy.

### GM-575 systems P1/P2

- palivový kohout,
- olejová nádrž/čerpadlo/filtr reprezentativně,
- chladicí expanzní nádobka/radiátor reprezentativně,
- bateriový prostor/ventilace,
- přístup k reduktoru SЭP,
- servisní kryty.

## Programátorský checklist

### Core state IDs

```ts
type DriverInterlock =
  | "driver_hatch_open"
  | "driver_hatch_contact_fault"
  | "gear_not_neutral"
  | "battery_below_gtd_start_limit"
  | "gtd_oil_pressure_missing"
  | "gtd_starter_not_cutoff"
  | "v6r_rpm_below_sep_limit";
```

### Driver actions

```ts
type DriverAction =
  | "toggle_onboard_power"
  | "check_voltage_plus_27"
  | "cold_crank_gtd"
  | "start_gtd"
  | "stop_gtd"
  | "disable_gtd_autostart"
  | "close_driver_hatch"
  | "open_driver_hatch"
  | "select_gear"
  | "apply_clutch"
  | "move_left_steering_lever"
  | "move_right_steering_lever"
  | "manual_fire_suppression_front"
  | "manual_fire_suppression_rear";
```

### Events

```ts
type DriverEvent =
  | "DriverHatchContactChanged"
  | "GTDColdCrankStarted"
  | "GTDStartAttempted"
  | "GTDStarterCutoffFailed"
  | "GTDGeneratorOnline"
  | "V6RGeneratorDroppedOffline"
  | "RoadShockExceededRpkLimit"
  | "DriverManualSuppressionUsed";
```

## Doporučený vertical slice

### Slice: „Řidič odblokuje boj“

Obsah:

1. Vozidlo stojí s otevřeným poklopem.
2. Řidič zapne síť.
3. Řidič spustí GТD správnou sekvencí.
4. Generátor se připojí.
5. Velitel chce zapnout RPK/palbu.
6. Palba je blokovaná poklopem.
7. Řidič zavře poklop.
8. Kontakt sepne.
9. Lampa zhasne/změní stav.
10. Velitel může pokračovat.

Proč právě tohle:

- používá panel,
- používá poklop,
- používá GТD,
- používá interlock,
- používá komunikaci posádky,
- je to viditelné, testovatelné a zapamatovatelné.

## Porovnání s aktuální hrou

V tomto workspace nejsou zdrojáky hry ani modely, takže přímý audit nejde udělat. Jakmile budou dostupné, zkontrolovat:

- má řidič fyzický panel, nebo jen HUD,
- má poklop samostatný kontakt,
- blokuje poklop palbu/DSO-20,
- existuje GТD start sekvence,
- existuje slabá baterie a pokles napětí,
- existuje olejový tlak GТD,
- SЭP závisí na otáčkách V-6R/GТD,
- existuje přepínač automatického startu GТD,
- viditelnost řidiče používá periskop/stěrače,
- jízda ovlivňuje RPK,
- řidič může ručně spustit PПO.

## Nejvyšší priority pro Blender

1. Řidičův panel jako přesná pracovní plocha.
2. Poklop a PS-3 spínač.
3. Periskopický přístroj a stěrač.
4. Řadicí páka, řídicí páky, pedály.
5. GТD/power ovladače pod kryty.
6. UА PПO dostupné z řidičovy role.

## Nejvyšší priority pro simulaci

1. `DriverHatchContact`.
2. `GTDStartSequence`.
3. `BatteryVoltageSag`.
4. `GTDOilPressure`.
5. `V6RToSEPGeneratorCoupling`.
6. `DriverPanelBindings`.
7. `RoadShockToRPKWear`.
8. `ManualFireSuppression`.

## Krátký závěr

Řidič má být první role, kde hráč pochopí, že Shilka je stroj, ne skin na tanku. Pokud řidičův poklop, GТD a SЭP budou fyzicky a simulačně propojené s palbou a RPK, celá hra okamžitě působí o třídu hlubší.
