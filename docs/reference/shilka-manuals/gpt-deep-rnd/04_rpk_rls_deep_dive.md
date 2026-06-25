# RPK/RLS deep dive

## Proč je RPK největší designová příležitost

RPK/RLS není „radar senzor“. Je to posádkový, elektrický, analogový a režimový systém.

Má startovací sekvenci.

Má nebezpečné napětí.

Má ventilaci.

Má search a peleng cesty.

Má samostatného operátora vyhledávání a operátora dálky.

Má indikátory, které vyžadují čtení signálu.

Má reléové režimy, které se navzájem odpojují.

Má rušení a možnost přeladění.

To všechno je gameplay.

## Role v RPK

### Velitel

Velitel zajišťuje napájení a rozhodnutí.

Akce:

- zapnout SЭП,
- zkontrolovat napětí,
- povolit GAG/stabilizaci,
- sledovat `есть данные`,
- vybrat režim boje,
- rozhodnout přechod na nouzovou/vizuální palbu.

Velitel není primární radarový technik. Je systémový koordinátor.

### Operátor vyhledávání-navádění

Hlavní práce:

- volí kruhové nebo sektorové vyhledávání,
- nastavuje šířku sektoru,
- čte indikátor search,
- přechází do doprovodu,
- ručně/poloautomaticky dolaďuje navedení,
- komunikuje s velitelem.

Jeho skill není jen aim. Jeho skill je čtení prostoru a režimů.

### Operátor dálky

Hlavní práce:

- zapíná `НАКАЛ`,
- po rozběhu zapíná `АНОДНОЕ`,
- sleduje indikátor dálky,
- potvrzuje/udržuje dálku,
- pozná špatný echo signál,
- drží dálku při rušení nebo degradaci automatického doprovodu.

V kooperaci je to role, která může být extrémně zajímavá, pokud indikátor dálky nebude jen číslo.

## Napájecí sekvence

Z dokumentů vychází, že RPK vyžaduje SЭП, kontrolu napětí, nakal, anodové/vysoké napětí a ventilaci.

### Navržené stavy

```text
OFF
SEP_AVAILABLE
LOW_VOLTAGE_CHECK
FILAMENT_HEATING
VENTILATION_RUNNING
ANODE_READY
HIGH_VOLTAGE_READY
SEARCH_READY
TRACK_READY
FAULT
```

### Typické přechody

`OFF -> SEP_AVAILABLE`

Velitel nebo řidič zajistí zdroj. Baterie/síť/generátor musí dodat potřebné napětí.

`SEP_AVAILABLE -> FILAMENT_HEATING`

Operátor dálky zapíná nakal. Indikátory a lampy se rozsvítí, ventilace RLS začne pracovat.

`FILAMENT_HEATING -> ANODE_READY`

Po doběhu žhavení operátor zapíná anodové napětí.

`ANODE_READY -> HIGH_VOLTAGE_READY`

Vysoké napětí je připraveno. Tady začíná riziková servisní vrstva.

`HIGH_VOLTAGE_READY -> SEARCH_READY`

Operátor vyhledávání zapíná vyhledávací režim.

### Gameplay

Pokud hráč přeskočí sekvenci:

- radar nenaběhne,
- lampy se nechovají očekávaně,
- indikátor je prázdný,
- může dojít k faultu podle obtížnosti.

V assisted režimu může posádka hlásit:

„Nakal běží, čekáme.“

„Anodové připraveno.“

„Ventilace RLS neběží, RPK nezapínat.“

## Radarové režimy

### Kruhové vyhledávání

Účel:

Celoprostorové hledání cíle v azimutu.

Herně:

- pomalejší přehled,
- hráč vidí periodické echo,
- při rušení je obraz náročnější,
- přechod do jiného režimu má reléovou prodlevu.

### Zrychlené kruhové vyhledávání

Účel:

Rychlejší sweep za cenu jiné čitelnosti/rozlišení.

Herně:

- rychlejší obnova,
- hůř se čte slabý cíl,
- vhodné pro rychlou orientaci,
- může zatěžovat operátora a indikátor.

### Sektorové vyhledávání

Účel:

Soustředit search do sektoru.

Herně:

- hráč nastaví střed a šířku sektoru,
- zvyšuje šanci držet cíl v očekávaném směru,
- mimo sektor je slepý,
- skvělé pro kooperaci: velitel určí směr, operátor nastaví sektor.

### Peleng / doprovod

Účel:

Přechod z hledání na sledování cíle.

Herně:

- režim má být křehčí než obecné search,
- ztráta cíle má mít konkrétní důvod: rušení, manévr, chyba dálky, chyba operátora, nízký signál.

### Automat

Účel:

Automatizované sledování/výpočet v prvních režimech.

Herně:

- nejúčinnější režim,
- ale závisí na RPK, SRP, stabilizaci, datech a zóně zásahu,
- při výpadku se musí přejít na degraded mode.

### Navedení / poloautomat

Účel:

Operátor vede systém s částečnou podporou.

Herně:

- vyšší skill,
- nižší spolehlivost,
- fallback při horším tracku.

### Ruční / pátý režim

Účel:

Pokračovat bez plného RPK.

Herně:

- nejpomalejší,
- nejméně přesný,
- ale cenný při poruše radaru.

## Exkluzivita režimů

Dokumentace 1RL33M jasně ukazuje, že zapnutí jednoho režimu odpojuje jiné režimy.

Implementační pravidlo:

`RadarModeStateMachine` smí mít právě jeden primární režim.

Přechod může mít mezistav:

```text
CIRCULAR_SEARCH
-> RELAY_DROPOUT
-> CONTACT_SETTLE
-> SECTOR_SEARCH
```

Chyby:

- relé se nepustí,
- kontakt zůstane,
- elektromagnetická spojka nepřibrzdí,
- indikátor ukazuje starý režim,
- anténa mechanicky pokračuje v předchozí geometrii.

## Radarový obraz

### Vizuální princip

Radar nemá být mapa s ikonami.

Má být signál:

- echo,
- šum,
- falešný odraz,
- rušení,
- zvonění,
- rozsah,
- jas,
- fokus,
- posun rozvinutí.

### Indikátor search

Zobrazuje sweep a návraty.

Možné vlastnosti:

- jas a fokus ovlivní čitelnost,
- rychlost sweepu ovlivní, jak často cíl vidíš,
- sektorový search mění rytmus,
- zrychlený search mění hustotu obrazu,
- rušení zvýší noise floor.

### Indikátor dálky

Nemá být čistý digitální údaj.

Možné vlastnosti:

- cíl jako pulz na rozsahu,
- operátor posouvá značku/bránu,
- špatný signál vede k chybnému měření,
- automatika může držet, ale občas ujíždět.

## Rušení a přeladění

Manuálová stopa k ručnímu přestavení frekvence magnetronu je designově skvělá.

### Stav rušení

```ts
type JammingState = {
  active: boolean
  bandCenter: number
  bandWidth: number
  strength: number
  type: "noise" | "spot" | "sweep" | "deceptive"
}
```

### Stav radaru

```ts
type RadarFrequencyState = {
  currentChannel: number
  retuneInProgress: boolean
  retuneTimeRemaining: number
  tuningQuality: number
}
```

### Gameplay

Operátor vidí, že obraz je zahlcený.

Velitel povolí přeladění.

Operátor spustí ruční přeladění.

Po dobu přeladění je radar omezený.

Pokud trefí dobrý kanál, echo se zlepší.

Pokud přeladí špatně, signál se zhorší.

## Ventilace RLS

RPK se nemá zapínat při vadné ventilaci.

To znamená:

- ventilace RLS je precondition,
- má vlastní napájení,
- může mít filtr,
- může mít poruchu motoru,
- může být ovlivněna PАЗ/klapkami,
- při vypnutí se bloky zahřívají.

### Tepelný model

```text
radarHeat += transmitterLoad + ambientHeat
radarHeat -= ventilationFlow

if radarHeat > warning:
  receiverNoise += x
if radarHeat > critical:
  faultProbability += y
```

## Vysoké napětí a servis

RPK má bloky s vysokým napětím.

Herně:

- v boji se to projeví hlavně jako zákaz servisních akcí,
- v údržbě to může být reálné riziko,
- instruktor může vyžadovat vypnutí sekvence,
- servis pod napětím může vyžadovat dva členy posádky/techniky.

## Stabilizace a GAG

GAG/stabilizační aparatura má být samostatný systém.

Vstupy:

- napájení,
- čas rozběhu,
- pohyb vozidla,
- chyba gyro,
- teplota,
- kontrolní test.

Výstupy:

- stabilizovaná linie vizíru,
- stabilizovaná linie výstřelu,
- kompenzace náklonu,
- drift,
- fault stav.

Gameplay:

Zapnout stabilizaci na místě je bezpečnější.

Zapnout/řešit ji při jízdě může zvýšit drift nebo fault šanci.

## RPK jako zdroj palebných dat

`есть данные` na pultu je klíčový stav.

Data vznikají jen pokud:

- radar běží,
- režim poskytuje doprovod nebo validní měření,
- dálka je známá,
- SRP/počítač má vstupy,
- stabilizace dodává správné souřadnice,
- cíl je v zóně.

Data degradují pokud:

- cíl manévruje,
- operátor ztratí echo,
- rušení zvedne noise,
- range gate ujede,
- gyro driftuje,
- napájení kolísá.

## Návrh tříd

```ts
class RadarPowerSystem {
  sepAvailable: boolean
  filamentOn: boolean
  anodeOn: boolean
  highVoltageOn: boolean
  ventilationOk: boolean
  warmupTimer: number
}
```

```ts
class RadarModeStateMachine {
  mode: RadarMode
  transition: RadarTransition | null
  relayFaults: RelayFault[]
  requestMode(mode: RadarMode): TransitionResult
}
```

```ts
class RadarSignalModel {
  targetEchoes: Echo[]
  noiseFloor: number
  jamming: JammingState[]
  receiverSensitivity: number
  frequencyState: RadarFrequencyState
}
```

```ts
class FireControlDataState {
  hasAngularTrack: boolean
  hasRange: boolean
  hasStableCoordinates: boolean
  targetInEnvelope: boolean
  dataLampOn: boolean
  quality: number
}
```

## RPK mise/trénink

### Trénink 1 - správný start

Cíl:

Naučit SЭП, napětí, nakal, anodové, vysoké, ventilace.

Hodnocení:

- správné pořadí,
- čekání na zahřátí,
- žádné zapnutí při vadné ventilaci.

### Trénink 2 - kruhový search

Cíl:

Najít pomalý cíl v čistém prostředí.

Hodnocení:

- správná interpretace echa,
- přechod do doprovodu,
- komunikace s dálkařem.

### Trénink 3 - sektorový search

Cíl:

Zachytit cíl v hlášeném směru.

Hodnocení:

- nastavení sektoru,
- udržení cíle v sektoru,
- neplýtvat časem mimo sektor.

### Trénink 4 - rušení

Cíl:

Poznat rušení a přeladit.

Hodnocení:

- rozpoznání typu rušení,
- správná volba přeladění,
- obnova tracku.

### Trénink 5 - degraded mode

Cíl:

Přejít z automatického režimu do poloautomatického/ručního při výpadku.

Hodnocení:

- rychlost rozhodnutí,
- zachování palby,
- nepoužít zbytečně nouzovou střelbu.

