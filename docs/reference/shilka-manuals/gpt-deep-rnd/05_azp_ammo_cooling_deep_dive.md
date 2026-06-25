# AZP, munice a chlazení deep dive

## Designový cíl

AZP-23M má být ve hře čtveřice živých automatů, ne jedna zbraň se čtyřmi hlavněmi.

Každý automat má vlastní:

- nábojový pás,
- stav nabití,
- elektrosput,
- kadenci,
- zahřátí,
- závadu,
- opotřebení,
- počitadlo patronů,
- readiness lampu.

Horní a dolní automaty mají odlišné zásoby. To je důležité pro asymetrické vyprazdňování a závady.

## Základní struktura

```text
GunClusterAZP23M
  GunUpperLeft
  GunUpperRight
  GunLowerLeft
  GunLowerRight
  UpperCradle
  LowerCradle
  AmmoFeedUpperLeft
  AmmoFeedUpperRight
  AmmoFeedLowerLeft
  AmmoFeedLowerRight
  CoolingSystem
  PneumaticReloadSystem
  ManualChargeMechanisms
  LinkCollector
  ElectroTriggerCircuit
```

## Stavy jednoho automatu

```ts
type GunState = {
  id: GunId
  loaded: boolean
  charged: boolean
  safety: boolean
  electroTriggerPowered: boolean
  ammoRemaining: number
  beltTension: number
  feedState: FeedState
  barrelTemp: number
  barrelWear: number
  fouling: number
  jam: JamState | null
  readyLamp: boolean
  lastShotTime: number
}
```

## Munice

### Oddělené zásoby

Horní automaty mají jinou kapacitu než dolní. Z toho plyne:

- horní pár může dojít dříve,
- dolní pár může pokračovat,
- balistika salvy se změní,
- počitadla patronů musí běžet samostatně,
- velitel může rozhodnout šetřit konkrétní pár.

### Pásy

Pás není jen počet.

Stavy:

- správně založen,
- špatně založen,
- znečištěný,
- napnutý,
- trhaný,
- prázdný,
- zaseklý.

Příčiny závad:

- moc vysoké belt tension,
- špatná poloha krytu,
- neprovedené přebití,
- přehřátí,
- opotřebení,
- špatná munice.

### Sběrač článků

Dvířka sběrače článků vstupují do blokace. Herně je to krásné, protože munice a bezpečnost jsou propojené.

Stavy:

- zavřeno,
- otevřeno,
- kontakt vadný,
- přeplněno,
- zaseklý článek.

Efekt:

- blokace hydropohonu/palby podle režimu,
- riziko závady,
- servisní úkol po střelbě.

## Nabíjení

### Procedura jako gameplay

Nabíjení má být týmová akce.

Kroky:

1. Nastavit vhodnou elevaci.
2. Otočit věž do bezpečné polohy.
3. Otevřít příslušné kryty.
4. Založit pás.
5. Napnout/připravit pás.
6. Použít ruční nebo pneumatické přebití.
7. Ověřit lampu `заряжено`.
8. Zavřít kryty.
9. Ověřit počitadla.

### Kratší herní reprezentace

V boji není nutné ručně klikat deset dílů, pokud to zabije tempo.

Možnosti:

- plná procedura v hardcore/servis režimu,
- zkrácená posádková akce v boji,
- AI posádka provádí kroky, hráč kontroluje panel,
- instruktor může vynutit plnou proceduru.

## Přebití

### Pneumatické přebití

Má mít tlakové lahve.

Stavy:

- tlak v lahvích,
- kompresor běží,
- kompresor cooldown,
- únik,
- ventil,
- počet dostupných přebití.

Gameplay:

Když dojde tlak, přebití trvá déle nebo vyžaduje ruční zásah.

Kompresor není okamžitý. Tlak se doplňuje v čase.

### Ruční přebití

Má být fallback.

Vlastnosti:

- pomalejší,
- vyžaduje člena posádky u zbraně,
- rizikové při horkých hlavních nebo pohybu věže,
- může odstranit některé závady.

## Chlazení hlavní

### Vrstvy chlazení

```text
CoolantTank
  level
  fluidType
  contamination

CoolingPump
  powered
  pressure
  flow
  fault

CoolingLines
  leak
  blockage

GunBarrels
  temp[4]
  heatInputFromFire
  coolingFlow
```

### Kapalina podle počasí

Dokumenty rozlišují letní vodu/přísadu a zimní nízkomrznoucí kapalinu.

Gameplay:

- v zimě voda může zamrznout,
- špatná kapalina snižuje flow,
- špatná kapalina zvyšuje riziko úniku/poškození,
- servis před misí má význam.

### Kontrolka hladiny vs kontrolka chlazení

Tohle rozlišit:

- `coolingActive` - čerpadlo/systém pracuje,
- `coolantLevelOk` - v nádrži je dost kapaliny.

Možné situace:

- pumpa běží, hladina nízká,
- hladina OK, pumpa neběží,
- pumpa běží, tlak nízký kvůli úniku,
- lampa vadná, systém OK.

## Teplo hlavní

### Tepelný model

```text
barrelTemp += shotsFired * heatPerShot
barrelTemp -= coolingFlow * coolingEfficiency * dt
barrelTemp -= ambientCooling * dt
```

### Prahy

- `normal`
- `warm`
- `hot`
- `overheated`
- `damage`
- `cookoffRisk` podle obtížnosti

### Efekty

- vyšší rozptyl,
- vyšší šance záseku,
- rychlejší opotřebení,
- blokace dlouhých dávek,
- poškození hlavně.

## Dávky a doktrína

Dokumenty uvádějí krátké dávky proti pomalým vzdušným cílům.

Hra má mít `BurstDoctrineAdvisor`.

Vstupy:

- typ cíle,
- vzdálenost,
- relativní rychlost,
- zásoba munice,
- teplota hlavní,
- režim RPK,
- kvalita dat.

Výstup:

- doporučená délka dávky,
- varování před přehřátím,
- odhad pravděpodobnosti zásahu.

Velitel může doporučení ignorovat.

Cena ignorování:

- munice,
- zahřátí,
- opotřebení,
- možnost závady.

## Elektrosputě a střelecký okruh

Pult má ovládání střeleckého okruhu, ochrany sítě a nouzovou střelbu.

Simulovat:

- `fireCircuitPowered`,
- `electroTriggerVoltage`,
- ochranné automaty,
- pojistku,
- shunt/obejití podle režimu,
- lampu `цепь стрельбы`.

Typické závady:

- spálená pojistka,
- vadný elektrosput jednoho automatu,
- nízké napětí,
- špatná zem,
- nouzová cesta funguje, normální ne.

## Rozptyl a balistika

Balistika nemá být jen `spread`.

Vstupy:

- rychlost střely 950-1000 m/s,
- individuální stav hlavně,
- teplota hlavně,
- stabilizace,
- pohyb vozidla,
- kvalita palebných dat,
- režim palby,
- délka dávky,
- vibrace věže.

Výstup:

- počáteční vektor každé střely,
- mikro-rozdíly mezi hlavněmi,
- rostoucí rozptyl v dávce,
- asymetrie při výpadku jednoho automatu.

## Čtyři automaty jako gameplay

### Výpadek jednoho automatu

Efekt:

- nižší hustota palby,
- asymetrické vibrace,
- jiné počitadlo,
- lampa `заряжено` pro daný automat nesvítí,
- posádka může rozhodnout pokračovat na tři automaty.

### Výpadek horního páru

Efekt:

- balistická skupina se změní,
- vizuálně je vidět, které hlavně střílí,
- munice dolního páru stále dostupná.

### Výpadek dolního páru

Efekt:

- jiná zásoba a jiné osazení,
- jiný přístup pro servis/nabíjení.

## Opotřebení

### Krátkodobé

- teplota,
- fouling,
- šance záseku,
- tlak chlazení.

### Dlouhodobé

- barrel wear,
- opotřebení podávacího mechanismu,
- citlivost na špinavou munici,
- častější neúplné nabití,
- kalibrační chyba.

## Servisní úkoly pro AZP

### Denní / po boji

- vyčistit hlavně,
- zkontrolovat pásy,
- zkontrolovat sběrač článků,
- doplnit chladicí kapalinu,
- zkontrolovat těsnost hadic,
- vyčistit mechanismus přebití,
- zkontrolovat elektrosputě.

### Periodické

- kontrola omezovače úhlů,
- kontrola spodního omezovače,
- kontrola přesnosti odpojení střeleckého okruhu,
- mazání mechanismů,
- kontrola kalibrace míření.

## Minimální implementační slice

První funkční verze AZP hloubky:

1. Čtyři automaty jako samostatné zdroje střel.
2. Samostatná munice a počitadla.
3. Samostatné `ready` lampy.
4. Chlazení jako podmínka palby.
5. Hladina chladicí kapaliny.
6. Teplota hlavní.
7. Délka dávky a přehřátí.
8. Otevřený sběrač článků blokuje.
9. Stopor kolébky blokuje.
10. Úhlový limit blokuje.

Teprve pak přidat:

- ruční přebíjení,
- pneumatiku,
- závady pásů,
- servisní detail.

