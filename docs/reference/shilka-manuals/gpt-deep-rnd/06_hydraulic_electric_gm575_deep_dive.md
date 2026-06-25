# Hydraulika, elektrika a GM-575 deep dive

## Hlavní myšlenka

GM-575 a podpůrné systémy nesmí být jen „vozidlo pod věží“.

Podvozek, pohon, SЭП, hydraulika, PАЗ, PПО, ventilace, baterie a panely jsou to, co určuje, jestli Shilka přežije a jestli vůbec může bojovat.

## Hydraulická síť

### Zdroje z dokumentů

Relevantní stopy:

- schéma práce hydropohonu v `GMalbum2012` str. 54,
- hydromotor č. 5 a reduktor horizontálního navedení v `TroubleAlbum` str. 35,
- čerpadla pohonů a DSO-20 v `TroubleAlbum` str. 34,
- kontrola úniku oleje z hydromotorů a čerpadel v `IE2A6M1980` str. 45 a 82,
- bezpečnostní pravidla s DSO-20 v `IE1970` str. 18.

### Simulační uzly

```text
HydraulicNetwork
  DSO20Motor
  PumpHorizontalNo5
  PumpVerticalNo1_5
  HydromotorHorizontalNo5
  HydromotorVerticalNo2_5
  Distributor
  CylinderBlock
  OilReservoir
  PressureSensors
  ManualDriveCouplers
```

### Stav

```ts
type HydraulicState = {
  motorRunning: boolean
  oilTemperature: number
  oilLevel: number
  pressureHorizontal: number
  pressureVertical: number
  leakRateHorizontal: number
  leakRateVertical: number
  airInSystem: number
  pumpWear: number
  responseLag: number
}
```

### Chování

Hydropohon má náběh.

Po zapnutí DSO-20:

- motor se rozběhne,
- tlak roste,
- lampy se změní,
- věž ještě chvíli nereaguje plnou rychlostí,
- při studeném oleji je odezva líná,
- při úniku tlak kolísá.

### Poruchy

#### Nízký tlak

Symptomy:

- věž se hýbe pomalu,
- elevace cuká,
- automatické navedení přestřeluje,
- ruční režim je přesnější než silový.

Příčiny:

- únik,
- nízká hladina oleje,
- vzduch v systému,
- opotřebené čerpadlo,
- DSO-20 nedosahuje výkon.

#### Vadný hydromotor

Symptomy:

- jeden směr reaguje hůř,
- horizontální a vertikální chování se liší,
- po zahřátí se zhorší,
- po vypnutí tlak padá moc rychle.

#### Mezipoloha ruční/silové

Symptomy:

- pohon nezabere,
- ozve se mechanické škubnutí,
- interlock může varovat,
- v hardcore režimu může dojít k poškození.

## Ruční vs silové navedení

Ruční navedení je důležitý fallback.

### Silové navedení

Vlastnosti:

- rychlé,
- závislé na DSO-20,
- závislé na hydraulice,
- závislé na interlocku,
- vhodné pro RPK a automatiku.

### Ruční navedení

Vlastnosti:

- pomalé,
- fyzicky namáhavé,
- funguje při výpadku hydropohonu,
- nefunguje dobře proti rychlým cílům,
- může být přesnější při jemném statickém doladění.

### Gameplay

Při výpadku hydropohonu se z hráče nestane mrtvý objekt. Přechází do nouzového režimu, kde posádka musí ručně vést zbraň a velitel změnit taktiku.

## Elektrická síť

### Proč nestačí `powered=true`

Dokumenty rozlišují:

- baterie,
- SЭП,
- generátor,
- převodníky,
- 27,5 V,
- 55 V,
- 115 V / 400 Hz,
- externí napájení,
- pojistky a ochranné automaty,
- voltmetry na pultu.

### Navržený model

```text
ElectricalNetwork
  BatteryBank
  ExternalPowerSocket
  SepGenerator
  ConverterPO500
  Bus27_5V
  Bus55V
  Bus115V400Hz
  ProtectionBreakers
  Consumers
```

### Spotřebiče

- RPK/RLS,
- SRP,
- DSO-20,
- chlazení hlavní,
- ventilace,
- PАЗ,
- PПО,
- osvětlení,
- indikátory,
- startér,
- čerpadla.

### Zátěž a pokles napětí

Při startu nebo rozběhu velkého spotřebiče má napětí padat.

To vytvoří reálné symptomy:

- radar nenaběhne,
- DSO-20 se neroztočí,
- kontrolky pohasnou,
- relé odpadne,
- indikátory jsou nestabilní.

### Externí napájení

Externí zásuvka je výborná pro servisní gameplay.

Použití:

- test RPK bez motoru,
- údržba v parku,
- dobíjení,
- příprava před misí.

Riziko:

- zapomenutý kabel,
- špatné odpojení,
- nekompatibilní zdroj podle scénáře.

## SЭП

SЭП je primární energetické srdce bojových systémů.

### Stavy

- vypnuto,
- připraveno,
- startuje,
- stabilizuje otáčky,
- připojeno k síti,
- přetíženo,
- porucha,
- vypnutí.

### Vazba na motor

Při připojení generátoru ke zátěži může být potřeba zvýšit otáčky motoru.

Gameplay:

Řidič a velitel koordinují:

- motor běží,
- otáčky jsou dostatečné,
- generátor je připojen,
- napětí je v normě,
- RPK může startovat.

## Baterie

Baterie nejsou jen kapacita.

Model:

- state of charge,
- internal resistance,
- teplota,
- start voltage sag,
- stav článků,
- ventilace bateriového prostoru.

Symptomy:

- startér točí slabě,
- napětí při zátěži padá,
- RPK relé odpadávají,
- kontrolky pohasínají,
- SЭП start trvá déle.

## GM-575 jako prostorový stroj

### Oddělení

```text
DriverCompartment
FightingCompartment
PowerCompartment
TurretCompartment
AZPCompartment
RPKCabinetZone
```

### Proč prostor záleží

Poškození v motorovém prostoru nemá vypínat radar magicky.

Poškození v RPK skříni nemá způsobit únik oleje z hydropohonu.

Každý subsystem má své fyzické místo, přístup a servisní cestu.

### Přístupové body

Model musí mít:

- kryty paliva,
- kryty oleje,
- kryty chlazení,
- bateriový přístup,
- externí napájecí kryt,
- kryty RPK skříní,
- kryty hydropohonů,
- poklopy posádky,
- servisní víka PАЗ/PПО.

## Řidič jako systémový operátor

Řidič má být zodpovědný za:

- motor,
- otáčky,
- převodovku,
- teplotu vody,
- tlak oleje,
- palivo,
- baterie,
- startér,
- SЭП zátěž,
- poklop,
- jízdu bez zničení stabilizace.

Gameplay:

Špatný řidič zhorší bojovou schopnost:

- jede moc rychle,
- prudce brzdí,
- drží otevřený poklop,
- špatně nastaví motor pro SЭП,
- ignoruje teplotu.

Dobrý řidič:

- zastaví ve vhodné poloze,
- natočí vozidlo kvůli sektoru,
- drží stabilní platformu,
- hlídá motor a elektřinu.

## PАЗ

### Funkce

PАЗ chrání posádku proti radioaktivnímu prachu a účinkům zamoření, vytváří přetlak, zavírá klapky a řídí ventilaci.

### Simulační uzly

```text
PazSystem
  PazPanel
  Radiometer
  OverpressureBlower
  IntakeFlaps
  ExhaustFlaps
  DriverFlap
  TurretRingSeal
  PyroCartridgeClosers
  SignalLamps
```

### Stav

- režim vypnuto,
- režim ventilace,
- režim PАЗ,
- ruční režim,
- automatický režim,
- přetlak,
- filtr zanesený,
- klapka zaseklá,
- pyropatron použitý,
- lampy v plném nebo polovičním svitu.

### Gameplay

PАЗ může být:

- nutný v zamořeném prostředí,
- problém pro ventilaci přístrojů,
- údržbově náročný,
- zdroj falešných lamp a koncových spínačů,
- důvod, proč některé akce nejdou.

## PПО / UА PПО

### Funkce

Protipožární systém má automatickou a ruční vrstvu.

Stavy:

- přední okruh připraven,
- zadní okruh připraven,
- tlak/obsah lahví,
- automatika,
- ruční režim,
- použitá láhev,
- vadný detektor,
- vadná pyropatrona.

### Gameplay

Po zásahu:

- řidič nebo velitel vidí požár,
- systém může zareagovat automaticky,
- při selhání někdo musí spustit ručně,
- po použití zůstane okruh prázdný,
- údržba musí doplnit náplně.

## Údržba GM-575

### Denní práce

- palivo,
- olej,
- voda/chladicí kapalina,
- filtry,
- kontrola úniků,
- baterie,
- pásy a pojezd,
- nářadí a ZIP.

### Po boji

- kontrola úniků,
- kontrola poškození krytů,
- kontrola přehřátí,
- kontrola požáru,
- kontrola věže a pohonů,
- doplnění munice a kapalin.

### Periodická

- mazání,
- čištění filtrů,
- kontrola hydromotorů,
- kontrola SЭП,
- kontrola PАЗ,
- kontrola PПО,
- kalibrace přístrojů.

## Závady, které stojí za implementaci

### Elektrika

- slabá baterie,
- vadný kontakt externí zásuvky,
- přetížený generátor,
- vadný převodník,
- spálená pojistka střelby,
- kolísání 115 V/400 Hz pro radar.

### Hydraulika

- nízký tlak,
- únik hydromotoru,
- zavzdušnění,
- studený olej,
- opotřebené čerpadlo,
- zaseklý rozvaděč.

### GM-575

- přehřátí motoru,
- nízký tlak oleje,
- zanesený palivový filtr,
- zanesený vzduchový filtr,
- slabý startér,
- poškozená baterie,
- poškozený pojezd.

### PАЗ/PПО

- klapka se nezavře,
- pyropatron vyhořel,
- vadná kontrolka,
- filtr zanesený,
- PПО lahev prázdná,
- ruční tlačítko zapečetěné/poškozené.

## Minimal implementation slice

První verze:

1. `ElectricalNetwork` se třemi hlavními sběrnicemi a baterií.
2. `HydraulicNetwork` s tlakem a DSO-20.
3. Řidičův poklop jako interlock.
4. SЭП jako zdroj pro RPK/pohony.
5. Chladicí kapaliny a teploty motoru jako provozní stav.
6. PАЗ/PПО jako zjednodušené panely a stav.
7. Údržbový systém s nejdůležitějšími úkoly.

Později:

- detailní proudění hydrauliky,
- full PАЗ klapky,
- baterie s články,
- kompletní servisní přístupové body,
- prostorové poškození všech agregátů.

