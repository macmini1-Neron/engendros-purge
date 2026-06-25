# Driver role and systems

Mechanik-řidič v Shilce není jen člověk, který drží směr. Dokumenty mu dávají odpovědnost za GM-575, GТD, SЭP, protipožární vybavení, noční vidění, navigaci, závady a servis. Ve hře z něj proto má být operátor životních funkcí vozidla.

## Základní designová teze

Řidič je správce mobility, energie a bezpečnosti.

Jeho rozhodnutí se mají projevit v pěti oblastech:

- jestli se vozidlo vůbec může bezpečně pohnout,
- jestli bojový komplex dostává stabilní energii,
- jestli otevřený/zavřený poklop dovolí palbu,
- jestli jízda neničí citlivou elektroniku,
- jestli posádka přežije požár, kontaminaci nebo poruchu.

## Domény řidiče

### 1. Mobilita GM-575

Řidič ovládá:

- levou a pravou řídicí páku,
- hlavní frikcion,
- převodovku,
- horskou brzdu,
- palivový pedál/ruční přívod paliva,
- start a stop tažného motoru,
- sledování teploty vody,
- tlak a teplotu oleje,
- palivo,
- rychlost,
- stav převodových a pojezdových mechanismů.

Herní důsledek:

- jízda není jen `throttle` a `steer`,
- řazení, otáčky a povrch mají dopad,
- špatné zacházení zvyšuje opotřebení,
- prudká jízda může poškodit RPK nebo rozladit citlivé systémy.

### 2. Primární elektropohotovost

Řidič je na hraně mezi mechanickým vozidlem a bojovým komplexem.

Systémy:

- baterie,
- GТD DГ4M-1,
- generátor,
- SЭP,
- převodník,
- V-6R jako zdroj generátoru při jízdě nebo nouzi,
- řidičův voltmetr,
- lampy `ГЕНЕРАТОР`, `ПРЕОБРАЗОВАТЕЛЬ ГТД`, `ПРЕОБРАЗОВАТЕЛЬ ДИЗ`.

Herní důsledek:

- radar a pohony nejsou jen zapnuté/vypnuté,
- mají zdroj, otáčky, napětí a stabilitu,
- řidič hlásí readiness veliteli,
- velitel může vyvolat automatický start, ale bez řidičova dohledu je to rizikové.

### 3. Poklop, výhled a blokace

Poklop řidiče je perfektní flagship mikro-systém.

Má:

- fyzický poklop,
- spínač PS-3,
- váleček spínače,
- tyčku,
- seřízení,
- lampu na řidičově panelu,
- lampu/indikaci na velitelském pultu,
- přímý dopad na DSO-20 a střelbu.

Gameplay:

- otevřený poklop zlepší výhled a orientaci při jízdě,
- zavřený poklop umožní plnou bojovou práci,
- špatně seřízený kontakt může dávat falešný stav,
- po zásahu nebo deformaci může být poklop fyzicky zavřený, ale kontakt nemusí spolehlivě sepnout.

Tohle je přesně typ mechaniky, která ukáže „ultra komplexní simulátor“ bez toho, aby potřebovala stovky abstraktních tlačítek.

### 4. PАЗ, ventilace a uzavření vozidla

Řidičův panel má lampy pro:

- `ЛЮК ВОДИТ.`,
- `ПРИТОЧ. ВЕНТИЛ.`,
- `ВЫТЯЖН. ВЕНТИЛ.`,
- `СИГНАЛ ПАЗ`.

Při kontaminaci se musí zavírat klapky a poklopy. Velitel kontroluje řidičův poklop přes indikaci na svém pultu, zatímco řidič vidí stav ventilace a PАЗ na vlastním štítku.

Gameplay:

- PАЗ není jen „zapnout filtr“,
- řidič kontroluje, jestli je jeho prostor skutečně uzavřený,
- otevřený poklop kvůli výhledu může ohrozit NBC ochranu,
- ventilační stav ovlivní přetlak, kouř a komfort posádky.

### 5. UА PПO a požár

Dokumenty dávají řidiči přímou roli při požáru:

- pokud automatika selže nebo si požáru všimne dřív,
- rozlomí plombu/dvířka,
- přepne UА PПO do ručního režimu,
- stiskne přední nebo zadní okruh podle místa požáru.

Navíc při požáru v oddělení řízení nebo pod věží:

- zastaví ZSU,
- vypne SЭP,
- otevře zadní poklop za řidičem,
- použije ruční CO2 hasicí přístroj.

Gameplay:

- požár má být procedurální krize,
- řidič není pasivní oběť,
- špatná volba přední/zadní zóny spotřebuje láhev a nemusí pomoct,
- po použití PПO vzniká servisní dluh.

### 6. Noční vidění, výhled, stěrače a ostřik

Řidič má:

- periskopický přístroj,
- boční pozorovací přístroj,
- ochranná skla,
- stěrače,
- ostřikovací trubky,
- zámky,
- fixace,
- sklopné/servisní prvky.

Gameplay:

- viditelnost může být skutečný systém,
- bahno, déšť, sníh a prach mají význam,
- stěrače a ostřik jsou funkční ovladače,
- otevřený poklop je lákavý, ale bojově nebezpečný.

## Řidič jako posádkový uzel

Řidič komunikuje s:

- velitelem kvůli rozjezdu, zastavení, startu GТD, energetické pohotovosti a nouzím,
- operátory kvůli tomu, zda lze jet tak, aby RPK drželo cíl nebo nebylo poškozeno,
- celou posádkou při PАЗ, požáru, havárii a opuštění vozidla.

### Typické hlášky

Hlášky musí vycházet ze skutečného stavu:

- „Poklop zavřen, blokace zhasla.“
- „GТD běží, generátor v síti.“
- „Otáčky V-6R nízké, převodník půjde na baterie.“
- „Tlak oleje GТD není, dělám studené protočení.“
- „Požár vzadu, dávám zadní okruh.“
- „Jedu pomaleji, šetřím RPK.“
- „Výhled přes periskop špinavý, zapínám stěrač.“

## Systémový model řidiče

### DriverStation

```ts
type DriverStation = {
  hatch: DriverHatchState;
  panel: DriverPanelState;
  vision: DriverVisionState;
  controls: DriverControlState;
  seat: DriverSeatState;
  intercom: CrewCommsState;
};
```

### DriverHatchState

```ts
type DriverHatchState = {
  physicalPosition: "open" | "closed" | "jammed" | "partially_closed";
  ps3ContactClosed: boolean;
  adjustmentError: number;
  sealIntegrity: number;
  lockedOpen: boolean;
  lockedClosed: boolean;
};
```

Výklad:

- `physicalPosition` říká, co vidíme,
- `ps3ContactClosed` říká, co čte elektrický systém,
- `adjustmentError` dovoluje modelovat špatné seřízení,
- `sealIntegrity` vstupuje do PАЗ,
- `lockedOpen` je pochodová/jízdní ergonomie,
- `lockedClosed` je bojová/NBC bezpečnost.

### DriverPowerAuthority

```ts
type DriverPowerAuthority = {
  canStartGTD: boolean;
  canStopGTD: boolean;
  canDisableGtdAutoStart: boolean;
  canEmergencyDisconnectGenerator: boolean;
  canRunV6RForSEP: boolean;
  lastReadinessReport: "none" | "gtd_ready" | "sep_ready" | "fault";
};
```

### DriverMovementState

```ts
type DriverMovementState = {
  orderedByCommander: boolean;
  gear: "neutral" | "reverse" | "i" | "ii" | "iii" | "iv" | "v";
  clutchTravel: number;
  leftLever: number;
  rightLever: number;
  mountainBrake: number;
  throttlePedal: number;
  manualFuelFeed: number;
  engineRpm: number;
  roadShock: number;
};
```

## Hlavní designové dilema řidiče

### Výhled versus bojová připravenost

Otevřený poklop:

- lepší orientace,
- lepší jízda v parku, koloně, špatném terénu,
- rychlejší reakce na překážky,
- horší ochrana,
- blokace palby/pohonů podle konkrétního okruhu,
- nemožnost plného PАЗ uzavření.

Zavřený poklop:

- plná bojová připravenost,
- lepší NBC ochrana,
- horší přímý výhled,
- závislost na periskopu, bočních přístrojích, stěračích a ostřiku.

Tahle volba je výborná pro multiplayer i single-player s AI posádkou.

### Otáčky versus energie

Řidič musí držet otáčky tak, aby generátor/SЭP zůstal v síti.

Pokud jede moc pomalu nebo nechá motor spadnout:

- generátor může odpadnout,
- převodník se napájí z baterií,
- baterie se rychle vybíjí,
- RPK/převodník může ztratit stabilitu,
- velitel začne řešit energetickou krizi místo cíle.

### Rychlost versus ochrana RPK

Dokument říká přímo: neopatrná jízda může poškodit radioelektronické vybavení.

Simulační model:

- povrch generuje `roadShock`,
- rychlost a manévry násobí rázy,
- aktivní RPK je citlivější,
- špatně uchycené/neudržované bloky mají vyšší riziko,
- posádka po misi řeší kontrolu konektorů, bloků a kalibrace.

## Co z řidiče dělá zábavnou pozici

Řidič má být zábavný, když:

- má co sledovat,
- jeho rozhodnutí pomáhají nebo škodí celé posádce,
- jeho chyby jsou srozumitelné,
- jeho úspěchy jsou vidět.

Příklady dobré zábavy:

- udržet vozidlo v pohybu, ale nevybít baterie,
- včas zavřít poklop a odblokovat palbu,
- rozpoznat GТD pompaž podle přístrojů a zvuku,
- v dešti jet přes periskop a stěrače,
- při požáru vybrat správný okruh PПO,
- v terénu zpomalit, aby RPK nepřišlo o přesnost.

Příklady špatné zábavy:

- deset minut jen držet plyn,
- náhodné poruchy bez diagnostiky,
- moderní HUD, který obejde panel,
- automatická AI, která řidičovy systémy vyřeší bez hráče.

## Pro single-player

Hráč může být velitel a řidič může být AI, ale řidičovy systémy nesmí zmizet.

AI řidič musí umět:

- držet rozkazy velitele,
- hlásit energetický stav,
- zavřít poklop na povel,
- spustit GТD podle checklistu,
- udržovat otáčky pro SЭP,
- řešit jednoduchý požár,
- odmítnout riskantní akci, pokud je v realistickém režimu.

Hráč může převzít řidiče:

- při ručním startu,
- při poruše,
- při složité jízdě,
- při nouzi,
- při výcviku.

## Pro multiplayer

Řidič je plnohodnotná role, pokud dostane:

- fyzický panel,
- skutečné startovací postupy,
- jízdu, která má dopad na zbytek posádky,
- nouzové hasicí a PАЗ úkoly,
- navigaci a komunikaci,
- viditelnostní boj s poklopem/periskopy/stěrači.

Nejlepší multiplayer moment:

1. Velitel hlásí cíl a chce plnou bojovou připravenost.
2. Řidič jede s otevřeným poklopem kvůli překážkám.
3. Při přípravě palby svítí blokace.
4. Velitel řekne: „Zavřít poklop.“
5. Řidič zavře poklop, ale kontakt nesepne kvůli poškození/seřízení.
6. Řidič musí poklop dotlačit nebo přepnout na servisní kontrolu.
7. Lampa zhasne, palba povolena.

To je přesně ten typ propojení fyzického modelu, simulace, posádky a boje, který chceme.
