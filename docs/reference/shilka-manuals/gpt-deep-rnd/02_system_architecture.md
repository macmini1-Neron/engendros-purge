# System architecture

## Základní princip

Simulátor Shilky má mít jeden sdílený fyzický stav. Ne oddělený vizuální model, oddělenou herní logiku a oddělené UI.

Pokud je zavřený poklop, musí to být jeden stav:

- animace poklopu je zavřená,
- kontakt poklopu hlásí zavřeno,
- panel nesvítí „люк открыт“,
- interlock dovolí hydropohon,
- AI posádka nehlásí problém,
- replay/debug ukazuje stejný stav.

Tohle je důležitější než počet tlačítek. Bez jednotného zdroje pravdy se komplexní simulátor rozpadne na protichůdné výjimky.

## Vrstvy simulace

### 1. Fyzická vrstva

Objekty, které existují v modelu.

Příklady:

- poklop řidiče,
- stopor věže,
- stopor kolébky,
- pult velitele,
- spínač omezení úhlů,
- hydromotor,
- DSO-20,
- chladicí nádrž,
- pásy munice,
- anténní kolona,
- pult operátora dálky,
- klapky PАЗ,
- baterie,
- externí napájecí zásuvka.

Každý objekt má:

- `id`,
- `pose`,
- `state`,
- `damageState`,
- `isInteractable`,
- `linkedSystem`.

### 2. Kontaktní a signální vrstva

Mechanické a elektrické stavy, které čtou fyzickou vrstvu.

Příklady:

- `driverHatchClosedContact`,
- `turretStopReleasedContact`,
- `cradleStopReleasedContact`,
- `linkCollectorDoorClosedContact`,
- `coolingPressureOk`,
- `angleLimiterContact`,
- `gunReadyContact[4]`,
- `radarVentilationOk`,
- `pazFlapClosedContact[13]`.

Kontakty mohou selhat nezávisle na fyzice.

To je pro simulátor krásně důležité. Poklop může být fyzicky zavřený, ale kontakt zoxidovaný. Hráč vidí zavřený poklop, ale stroj pořád blokuje palbu. To vytváří servisní diagnostiku.

### 3. Subsystem vrstva

Každý subsystem agreguje fyzické objekty, kontakty, napájení, poruchy a posádkové akce.

Minimální subsystemy:

- `ElectricalNetwork`
- `HydraulicNetwork`
- `TurretDrive`
- `ElevationDrive`
- `StabilizationSystem`
- `GunClusterAZP23M`
- `AmmoSystem`
- `BarrelCoolingSystem`
- `PneumaticReloadSystem`
- `RadarPowerSystem`
- `RadarSearchSystem`
- `RadarRangeSystem`
- `FireControlComputer`
- `CommanderPanel`
- `OperatorSearchPanel`
- `RangeOperatorPanel`
- `DriverStation`
- `PazVentilationSystem`
- `FireSuppressionSystem`
- `VehiclePowertrain`
- `MaintenanceSystem`

### 4. Interlock vrstva

Interlock neřídí fyziku. Interlock čte subsystemy a vydává oprávnění.

Výstupy:

- `canStartHydraulicDrive`
- `canTraversePower`
- `canElevatePower`
- `canFireNormal`
- `canFireEmergency`
- `canRunRadar`
- `canTrackTarget`
- `canUseComputedLead`
- `canOpenDriverHatchSafely`
- `canSwitchManualPowerMode`

Každé oprávnění má seznam příčin:

- `allowed: true/false`
- `blockingCauses[]`
- `warningCauses[]`
- `overridePossible`
- `overrideCost`

### 5. Crew vrstva

Crew vrstva nehackuje systém. Crew dělá akce na fyzických objektech.

Velitel nepovolí palbu nastavením booleanu. Velitel:

- přepne tумблер,
- stiskne tlačítko,
- čte lampu,
- vydá rozkaz,
- případně použije nouzovou cestu.

Operátor vyhledávání nepřepne „radar mode“ přímo. Operátor:

- zapne správný režim na pultu,
- nastaví šířku sektoru,
- přečte indikátor,
- potvrdí doprovod.

### 6. UI/debug vrstva

UI má být vrstva nad realitou, ne náhrada reality.

Bojové UI může být minimalistické.

Tréninkové UI může zobrazit:

- proč systém blokuje palbu,
- který kontakt nesedí,
- jaký subsystem čeká na napájení,
- který člen posádky má další krok.

Servisní UI může zobrazit:

- x-ray elektriky,
- x-ray hydrauliky,
- x-ray munice,
- x-ray PАЗ,
- stav údržby.

## Datový model

### Entity

```ts
type PhysicalPart = {
  id: string
  label: string
  station?: CrewStationId
  poseState: string
  damageState: DamageState
  contacts: ContactId[]
  animations: AnimationId[]
  modelPath?: string
}
```

```ts
type Contact = {
  id: string
  physicalPartId: string
  expectedState: string
  actualClosed: boolean
  fault: ContactFault | null
}
```

```ts
type Subsystem = {
  id: string
  powerInputs: PowerRequirement[]
  physicalParts: PhysicalPartId[]
  contacts: ContactId[]
  state: Record<string, unknown>
  faults: FaultId[]
}
```

```ts
type InterlockResult = {
  action: ActionId
  allowed: boolean
  blockers: Blocker[]
  warnings: Warning[]
  override?: OverrideOption
}
```

### Blokátor

Blokátor musí být přeložitelný do tří forem:

1. Interní příčina pro kód.
2. Simulační příčina pro debug.
3. Posádkový symptom pro hráče.

Příklad:

```ts
{
  code: "DRIVER_HATCH_OPEN",
  system: "InterlockGraph",
  physicalPart: "driver_hatch",
  panelLamp: "commander_panel.lamp_hatch_open",
  playerSymptom: "Svítí poklop, hydropohon nereaguje.",
  fixAction: "Zavřít poklop řidiče nebo opravit kontakt poklopu."
}
```

## Stavová granularita

Nepřehánět každý šroubek do realtime fyziky. Ale každý šroubek, který je v dokumentech funkčním uzlem, musí existovat jako stav.

### Má být stav

- poklop,
- stopor,
- kontakt,
- spínač,
- kontrolka,
- čerpadlo,
- tlak,
- hladina,
- napětí,
- režim radaru,
- stav každého automatu,
- zásoba každého pásu,
- kalibrace omezovače,
- stav ventilace,
- stav klapek.

### Nemusí být stav v první verzi

- každý jednotlivý šroub krytu,
- každý konkrétní odpor v reléové logice,
- každá trubka jako samostatné proudění,
- každý díl katalogu GM-575.

Ale model má být navržen tak, aby později unesl větší granularitu.

## Fyzická a logická hierarchie

### Vozidlo

- `GM575Hull`
- `DriverCompartment`
- `FightingCompartment`
- `PowerCompartment`
- `Turret`
- `AZPCompartment`
- `RPKCabinets`
- `AntennaColumn`

### Věž

- `TurretRing`
- `TurretStop`
- `CommanderStation`
- `SearchOperatorStation`
- `RangeOperatorStation`
- `GunCluster`
- `AmmoBoxes`
- `LinkCollector`
- `CoolingTank`
- `DSO20Drive`
- `HydraulicPumps`

### Zbraň

- `UpperCradle`
- `LowerCradle`
- `GunUpperLeft`
- `GunUpperRight`
- `GunLowerLeft`
- `GunLowerRight`
- `CradleStop`
- `AngleLimiter`
- `ManualChargeMechanisms`
- `ElectroTriggerCircuits`

### Radar/RPK

- `RadarTransmitter`
- `RadarReceiver`
- `WaveguideSwitch`
- `SearchFeed`
- `PelengFeed`
- `AntennaColumn`
- `SearchIndicator`
- `RangeIndicator`
- `RangeDrive`
- `FireControlComputer`
- `GyroSystem`

## Simulační frekvence

Není nutné simulovat všechno stejně často.

### High frequency

- pohyb věže a elevace,
- stabilizace,
- radarový sweep,
- střelba,
- projektily,
- zásah/poškození.

### Medium frequency

- hydraulický tlak,
- chladicí tlak,
- radarové echo,
- elektrické zatížení,
- teplota hlavní,
- jízda a náklony.

### Low frequency

- údržba,
- opotřebení,
- filtry,
- kalibrace,
- baterie mimo start,
- posádkové procedury.

## Způsob obtížnosti

Komplexitu schovat do vrstev.

### Arcade assist

Hráč vidí krátké hlášení: „palba blokována poklopem“.

### Simulator assist

Hráč vidí panel a může otevřít diagnostiku okruhů.

### Full crew

Žádná magická hláška. Velitel vidí lampy, posádka hlásí, hráč musí rozumět systému.

### Instructor

Instruktor může vkládat závady a ukazovat příčiny po skončení scénáře.

## Perzistence

Stav vozidla se má nést mezi misemi.

Ukládat:

- opotřebení hlavní,
- stav munice,
- kvalita chladicí kapaliny,
- drobné úniky,
- stav baterií,
- seřízení omezovače,
- kalibrace dálky,
- stav filtrů,
- počet motohodin,
- poruchová historie.

Kampaň pak není jen série střelnic. Je to péče o konkrétní kus stroje.

