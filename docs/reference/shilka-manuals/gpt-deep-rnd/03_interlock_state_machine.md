# Interlock state machine

## Designový cíl

Blokace jsou srdce Shilky jako simulátoru.

U většiny her je „nejde střílet“ chyba nebo cooldown. U Shilky to má být čitelný fyzický stav stroje.

Správný pocit:

Hráč stiskne palbu. Nic se nestane. Na pultu svítí kontrola blokací. Velitel vidí otevřený poklop. Řidič ho zavře. Kontrolka zhasne. DSO-20 naběhne. Věž ožije. Teprve pak zbraň střílí.

Tohle je herní drama, ale celé je technicky věrné.

## Akce a oprávnění

### `StartHydraulicDrive`

Požadavky:

- napájení pultu a pohonů,
- DSO-20 dostupný,
- věž není na stoporu,
- kývavá část není na stoporu,
- poklop řidiče zavřený,
- dvířka sběrače článků zavřená,
- režim ruční/silové navedení není v zakázané mezipoloze.

Blokátory:

- `NO_POWER`
- `DRIVER_HATCH_OPEN`
- `TURRET_STOP_ENGAGED`
- `CRADLE_STOP_ENGAGED`
- `LINK_COLLECTOR_OPEN`
- `DRIVE_MODE_SELECTOR_UNSAFE`
- `DSO20_FAULT`

### `PowerTraverse`

Požadavky:

- hydropohon běží,
- tlak horizontálního okruhu v normě,
- věž odstoporovaná,
- věnec věže není mechanicky blokovaný,
- limit azimutu neomezuje, protože horizontální navedení je konstrukčně neomezené, ale lokální kolize/překážky mohou být scénářové.

Blokátory:

- `HYDRAULIC_PRESSURE_LOW`
- `TURRET_STOP_ENGAGED`
- `TURRET_RING_JAM`
- `POWER_DRIVE_NOT_RUNNING`

### `PowerElevate`

Požadavky:

- hydropohon běží,
- tlak vertikálního okruhu v normě,
- kolébka odstoporovaná,
- elevace v mechanickém rozsahu,
- úhlový omezovač neblokuje daný směr.

Blokátory:

- `CRADLE_STOP_ENGAGED`
- `ANGLE_LIMIT_REACHED`
- `LOWER_LIMIT_REACHED`
- `UPPER_LIMIT_REACHED`
- `ELEVATION_HYDRAULIC_FAULT`

### `FireNormal`

Požadavky:

- střelecký okruh napájen,
- alespoň jeden automat nabitý,
- zvolený automat/pár není blokovaný,
- chlazení běží a tlak je OK,
- hladina chladicí kapaliny je OK,
- poklop řidiče zavřený,
- dvířka sběrače článků zavřená,
- věž a kolébka nejsou na stoporu,
- úhel elevace odpovídá nastavení omezovače,
- v režimech 1-3 existují palebná data a cíl je v zóně zásahu,
- oprávnění palby je na správné pozici posádky.

Blokátory:

- `FIRE_CIRCUIT_OFF`
- `NO_GUN_READY`
- `COOLING_NOT_RUNNING`
- `COOLANT_LEVEL_LOW`
- `DRIVER_HATCH_OPEN`
- `LINK_COLLECTOR_OPEN`
- `TURRET_STOP_ENGAGED`
- `CRADLE_STOP_ENGAGED`
- `ANGLE_LIMIT_FIRE_CUTOFF`
- `NO_FIRE_CONTROL_DATA`
- `TARGET_OUTSIDE_ENGAGEMENT_ZONE`
- `FIRE_AUTHORITY_NOT_GRANTED`

### `FireEmergency`

Nouzová střelba není cheat. Má být samostatná cesta s omezeními.

Možné vlastnosti:

- může obejít část RPK/SRP dat,
- nemá obejít zásadní fyzické bezpečnostní blokace jako poklop a stopory, pokud manuály nenaznačují jinak,
- může mít horší přesnost,
- může deaktivovat část automatických ochran,
- zvyšuje riziko poškození nebo přehřátí.

Blokátory:

- `HARD_SAFETY_BLOCK`
- `NO_FIRE_CIRCUIT_POWER`
- `NO_GUN_READY`
- `MECHANICAL_STOP_ENGAGED`

Varování:

- `NO_COMPUTED_LEAD`
- `COOLING_DEGRADED`
- `HIGH_BARREL_TEMP`
- `OUTSIDE_RECOMMENDED_ENVELOPE`

## Přepínač omezení úhlů

Přepínač na pultu velitele má být jeden z nejdůležitějších hmatatelných prvků.

### Stavy

- `off`
- `combat`
- `test40`
- `fault`
- `miscalibrated`

### Vstupy

- poloha přepínače,
- kalibrace limitu,
- elevace kolébky,
- snímač/doraz,
- stav kontrolky blokací,
- režim palby.

### Výstupy

- povolení elevace dolů,
- povolení palby,
- kontrolka blokací,
- diagnostický stav.

### Gameplay

Testovací procedura:

1. Velitel nastaví omezení úhlů na 40°.
2. Zapne chlazení a palebný okruh podle testu.
3. Kolébka se pomalu spouští.
4. V určitém úhlu zhasne/změní stav kontrolka blokací.
5. Pokud moment nesedí, systém je rozladěný.

Tohle je výborná údržbová mini-mechanika. Je technická, ale pochopitelná.

## Kontrolky a symptomy

### Pult velitele

Kontrolky z pultu velitele mají být zrcadlem stavu:

- `отстопорено`
- `застопорено`
- `люк открыт`
- `контроль блокировок`
- `неисправно`
- `охлаждение`
- `уровень ОЖ`
- `цепь стрельбы`
- `есть данные`
- `заряжено 1-4`

### Zásada

Kontrolka nemá vždy říct celou pravdu. Kontrolka říká, co ví okruh.

Možné situace:

- fyzický poklop otevřený, kontakt otevřený - správný stav.
- fyzický poklop zavřený, kontakt otevřený - porucha kontaktu.
- fyzický poklop otevřený, kontakt zaseklý zavřený - nebezpečná porucha.

Tohle je důvod, proč fyzický model a kontakty musí být oddělené.

## Blokace jako graf

Navržené uzly:

```text
DriverHatch -> DriverHatchContact -> InterlockGraph -> CommanderPanel.lampHatchOpen
TurretStop -> TurretStopContact -> InterlockGraph -> PowerTraversePermission
CradleStop -> CradleStopContact -> InterlockGraph -> PowerElevatePermission
LinkCollectorDoor -> LinkCollectorContact -> InterlockGraph -> FirePermission
CoolingPump -> CoolingPressure -> InterlockGraph -> FirePermission
CoolantTank -> CoolantLevel -> CommanderPanel.lampCoolantLevel
AngleLimiterSwitch -> AngleLimiter -> ElevationAngle -> FirePermission
RadarMode -> FireControlData -> CommanderPanel.lampData -> FirePermission
```

## Tvrdé a měkké blokace

### Tvrdé blokace

Nemají jít obejít bez explicitní servisní/nouzové procedury.

- stopor věže,
- stopor kolébky,
- otevřený poklop řidiče pro normální palbu,
- otevřený sběrač článků,
- bez napájení střeleckého okruhu,
- žádný nabitý automat.

### Měkké blokace

Jdou přepsat, ale mají cenu.

- chybějící palebná data,
- cíl mimo doporučenou zónu,
- degradované chlazení,
- horší radarový signál,
- rozladěná stabilizace,
- nízká, ale ještě použitelná baterie.

### Varování

Nezakazují akci, ale zvyšují riziko.

- dlouhá dávka při horkých hlavních,
- přepnutí režimu při běžícím pohonu,
- zapnutí gyro/stabilizace při pohybu,
- radar bez dostatečné ventilace před kritickým časem,
- práce s vysokým napětím.

## Diagnostická vrstva

Každý blokátor má mít čtyři úrovně sdělení.

### Úroveň 0 - žádná nápověda

Pouze panel, zvuk a chování.

### Úroveň 1 - crew hlášení

„Veliteli, svítí blokace.“

„Řidiči, zavři poklop.“

„Hydropohon nenaběhl, stopor.“

### Úroveň 2 - instruktorská diagnostika

„Palba blokována: driver hatch contact open.“

### Úroveň 3 - vývojářský debug

Plný graf uzlů, hodnoty kontaktů, historie přechodů.

## Typické scénáře

### Scénář 1 - rychlý přesun, otevřený poklop

Řidič jede s otevřeným poklopem.

Kontakt poklopu je otevřený.

Velitel dá povel k boji.

Hydropohon nejde zapnout.

Pult ukazuje poklop/blokaci.

Řidič zavře poklop.

Hydropohon lze spustit.

### Scénář 2 - servis nechal věž na stoporu

Věž je fyzicky na stoporu.

Pult může ukázat `застопорено`.

DSO-20 se po stisku nespustí.

Velitel musí odstoporovat věž.

Teprve pak lze navádět.

### Scénář 3 - chlazení běží, ale hladina je nízká

Pumpa běží.

Kontrolka chlazení může být aktivní.

Kontrolka hladiny OЖ hlásí problém.

Normální palba je blokovaná nebo varovaná podle zvolené obtížnosti.

Nouzová střelba je možná s rizikem.

### Scénář 4 - radar má režim, ale nemá data

RPK běží.

Search funguje.

Cíl není stabilně doprovázen nebo dálka není potvrzená.

`есть данные` nesvítí.

Palba v automatických režimech není dovolena.

Velitel může přejít do záložního režimu.

### Scénář 5 - kontakt je vadný

Poklop je zavřený.

Kontakt stále hlásí otevřeno.

Hráč fyzicky vidí zavřený poklop, ale interlock drží blokaci.

Servisní režim odhalí vadný koncový spínač.

Tohle je přesně ten typ hloubky, který dělá simulátor nezapomenutelný.

