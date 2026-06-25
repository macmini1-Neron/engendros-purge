# Driver panel controls

Řidičův přístrojový štítek je jedna z nejsilnějších nalezených herních ploch. Vizuální referenční stránka:

- `refs/visual_checks/driver/gm_album_driver_panel-130.png`
- doplňkově `refs/visual_checks/deep/driver_panel-096.png`

Panel není jen skupina budíků. Je to mapa elektrické sítě, GТD, V-6R, předehřevu, světel, ventilace, PАЗ, stěračů a bezpečnostních stavů.

## Návrh úrovní interaktivity

### Level 0 - model detail

Prvky jsou viditelné, ale zatím nefunkční.

Použít jen pro:

- prvky, které nejsou ve vertical slice potřeba,
- popisky,
- šrouby,
- fiktivní nebo zatím nepropojené části.

### Level 1 - čtený stav

Prvek zobrazuje skutečný stav, ale hráč ho neovládá přímo.

Příklady:

- lampa `ГЕНЕРАТОР`,
- lampa `ГТД`,
- lampa `ПРЕОБРАЗОВАТЕЛЬ`,
- teplota vody,
- tlak oleje,
- otáčky,
- palivo,
- lampa `ЛЮК ВОДИТ.`.

### Level 2 - hráčský ovladač

Prvek má akci.

Příklady:

- `ПИТАНИЕ ВКЛ`,
- `ПИТАНИЕ ОТКЛ`,
- `ПУСК ГТД`,
- `СТОП ГТД`,
- `ХОЛОДНАЯ ПРОКРУТКА`,
- `НАСОС МАСЛА`,
- `НАСОС ТОПЛИВА`,
- `СТАРТЕР`,
- stěrače,
- světla,
- přepínač `АВТОМАТ. ЗАП. ГТД`.

### Level 3 - procedurální ovladač

Prvek je součástí sekvence, která může selhat.

Příklady:

- start GТD,
- studené protočení,
- přechod zdroje z V-6R na GТD,
- nouzové odpojení generátoru,
- PАЗ uzavření,
- požár a PПO.

## Skupiny panelu

### A. Napájení a voltmetr

Prvky:

- `ЦЕПЬ -27В`,
- `ЦЕПЬ +27В`,
- voltmetr DC,
- `ПИТАНИЕ ВКЛ`,
- `ПИТАНИЕ ОТКЛ`,
- nouzové napájení / zásuvka.

Simulace:

- baterie má napětí naprázdno a pod zátěží,
- startér způsobí pokles,
- řidič musí při startu GТD zmáčknout správnou kontrolu,
- pod 18 V při startéru vzniká zákaz nebo riziko poškození startéru.

Gameplay:

- před startem hráč zkontroluje baterie,
- při slabých bateriích požádá o externí napájení nebo start z jiného režimu,
- při provozu RPK sleduje, jestli systém nepadá na baterie.

### B. GТD

Prvky:

- `ПУСК ГТД`,
- `СТОП ГТД`,
- `ХОЛОДНАЯ ПРОКРУТКА`,
- lampa `СТАРТЕР ГТД`,
- lampa `ГТД`,
- lampa `ОТКРЫТ. ЗАСЛ.`,
- lampa `ГЕНЕРАТОР`,
- lampa `ПРЕОБРАЗОВАТЕЛЬ ГТД`,
- teplota plynů,
- teplota oleje GТD,
- tlak oleje GТD,
- otáčkoměr GТD,
- motohodiny GТD,
- kryt tlačítka startu,
- spínač `АВТОМАТ. ЗАП. ГТД`.

Simulace:

```ts
type GTDState =
  | "off"
  | "flaps_opening"
  | "cold_cranking"
  | "ready_for_hot_start"
  | "starting"
  | "starter_cutoff"
  | "idle_stable"
  | "loaded"
  | "surge"
  | "shutdown"
  | "fault";
```

Důležité thresholdy z dokumentu:

- studené protočení do 15-20 % otáček, max. 10 s,
- startér se má odpojit při 44 %,
- běžné otáčky volnoběhu/připravenosti 98,5-103,5 %,
- pod stálou zátěží ideálně 98,5-101,5 %,
- teplota výfukových plynů max. 650 C,
- teplota oleje max. 110 C,
- tlak oleje 0,5-2,5 kg/cm2,
- při studeném protočení hledat cca 0,15-0,2 kg/cm2.

Poruchové stavy:

- zaslonka GТD se neotevře,
- startér se neodpojí,
- není tlak oleje,
- není palivo,
- teplota plynů neroste, palivo se nevznítilo,
- pompaž,
- GТD běží, ale generátor se nepřipojí.

### C. V-6R / tažný motor

Prvky:

- `СТАРТЕР`,
- `НАСОС МАСЛА`,
- `НАСОС ТОПЛИВА`,
- `ЖАЛЮЗИ ДИЗЕЛЯ`,
- voda,
- olej,
- tachometr/otáčkoměr,
- motohodiny diesel,
- spidometr,
- palivo.

Simulace:

- start hlavního motoru,
- tlak oleje před a po startu,
- teplota vody,
- ohřev,
- žaluzie/přívod vzduchu,
- palivové čerpadlo,
- generátor/SЭP z V-6R při jízdě nebo nouzi.

Gameplay:

- řidič drží otáčky nad hranicí pro generátor,
- při převodníku nesmí nechat motor padnout,
- v těžkém terénu řeší konflikt výkon pro jízdu versus výkon pro komplex.

### D. Předehřev a zima

Prvky:

- teplota kotle,
- `КЛАПАН ПОДОГРЕВА`,
- `СВЕЧА-ФОРСУНКА`,
- `ВЕНТ. ПОМПА`,
- `ПОДОГРЕВ ЧАСОВ / ПРИБОРЫ`,
- přepínač obohřevu oddělení řízení.

Simulace:

- okolní teplota,
- stav předehřevu,
- teplota kapaliny,
- riziko startu bez ohřevu,
- zimní GТD rizika s vodou v palivu,
- pomalé náběhy.

Gameplay:

- ve studené misi nejde jen zmáčknout start,
- řidič připravuje motor,
- zkrácení procedury šetří čas, ale zvyšuje riziko.

### E. Ventilace, PАЗ a poklop

Prvky:

- `ЛЮК ВОДИТ.`,
- `ПРИТОЧ. ВЕНТИЛ.`,
- `ВЫТЯЖН. ВЕНТИЛ.`,
- `СИГНАЛ ПАЗ`,
- související klapky a lampy.

Simulace:

- poklop fyzicky zavřen/otevřen,
- spínač blokace sepnut/nesepnut,
- větrací klapky zavřené/otevřené,
- PАЗ signál,
- přetlak,
- kontaminace,
- kouř po požáru.

Gameplay:

- řidič má vlastní indikaci PАЗ,
- velitel vidí poklop jako palební/NBC problém,
- hráč řeší, zda je problém mechanický, elektrický nebo posádkový.

### F. Světla, stěrače a viditelnost

Prvky:

- `ФАРЫ`,
- `ФАРЫ ТВН`,
- `ФАРЫ ТВН-СМУ`,
- `СТЕКЛООЧ. ЛЮКА`,
- `СТЕКЛООЧИСТИТЕЛИ КОЛПАКА`,
- boční stěrače,
- `ОБОГРЕВ СТЕКЛА`,
- podsvit panelu.

Simulace:

- režim světel,
- maskovací režim,
- noční vidění,
- déšť/sníh/bahno,
- zamlžení/sklo,
- stav stěračů,
- stav ostřiku.

Gameplay:

- v noci má řidič jiný workflow,
- světla mohou prozradit vozidlo,
- stěrače nejsou kosmetika,
- zavřený poklop je snesitelný jen při fungujících pozorovacích přístrojích.

## Doporučené P0 aktivní prvky panelu

P0 nemusí aktivovat celý panel. Musí ale vytvořit přesvědčivý řidičský slice.

Povinné P0:

- `ПИТАНИЕ ВКЛ`,
- `ПИТАНИЕ ОТКЛ`,
- `ЦЕПЬ +27В`,
- voltmetr,
- `ХОЛОДНАЯ ПРОКРУТКА`,
- `ПУСК ГТД`,
- `СТОП ГТД`,
- lampa `СТАРТЕР ГТД`,
- lampa `ГТД`,
- lampa `ГЕНЕРАТОР`,
- otáčkoměr GТD,
- tlak oleje GТD,
- teplota plynů GТD,
- spínač/kryt `АВТОМАТ. ЗАП. ГТД`,
- `ЛЮК ВОДИТ.`,
- stěrač periskopu nebo poklopu.

P0 akce:

- zapnout palubní síť,
- zkontrolovat baterie,
- provést studené protočení,
- spustit GТD,
- sledovat startér/generátor,
- zastavit GТD,
- zavřít poklop a odblokovat palbu,
- zapnout stěrač při dešti.

## Doporučené P1 prvky

- `НАСОС МАСЛА`,
- `НАСОС ТОПЛИВА`,
- `ЖАЛЮЗИ ДИЗЕЛЯ`,
- předehřev,
- V-6R start,
- převodník z V-6R,
- PАЗ lampy,
- větrací lampy,
- světla a maskovací režim,
- UА PПO ruční ovládání.

## Doporučené P2 prvky

- motohodiny,
- podsvit panelu,
- všechny stěrače a ostřiky,
- poruchy jednotlivých přístrojů,
- špatné seřízení spínače poklopu,
- degradace ukazatelů,
- přepálené lampy.

## Panelové stavy pro kód

```ts
type DriverPanelState = {
  power: {
    onboardPower: boolean;
    voltmeterMode: "-27" | "+27" | "off";
    voltmeterValue: number;
  };
  gtd: {
    startButtonGuardOpen: boolean;
    coldCrankPressed: boolean;
    startPressed: boolean;
    stopPressed: boolean;
    starterLamp: boolean;
    gtdLamp: boolean;
    generatorLamp: boolean;
    converterGtdLamp: boolean;
    flapsOpenLamp: boolean;
    autoStartEnabled: boolean;
    rpmPercent: number;
    oilPressure: number;
    oilTemp: number;
    exhaustTemp: number;
  };
  v6r: {
    starterPressed: boolean;
    oilPumpPressed: boolean;
    fuelPumpPressed: boolean;
    waterTemp: number;
    oilPressure: number;
    oilTemp: number;
    rpm: number;
    speed: number;
    fuelLevelRear: number;
  };
  safety: {
    driverHatchLamp: boolean;
    pazSignalLamp: boolean;
    intakeVentLamp: boolean;
    exhaustVentLamp: boolean;
  };
  visibility: {
    lightsMode: "off" | "normal" | "tvn" | "blackout";
    wiperHatch: boolean;
    wiperPeriscope: boolean;
    sideWipers: boolean;
    glassHeater: boolean;
    panelBacklight: number;
  };
};
```

## UX pravidla

### Žádné generické náhražky

Když nejde palba kvůli poklopu, primární feedback má být:

- lampa,
- fyzický stav poklopu,
- posádková hláška,
- až pak debug text.

### Panel musí být čitelný

Není nutné číst každý ruský popisek na dálku. Ale důležité prvky musí mít:

- dobrý zoom,
- tooltip v tréninkovém režimu,
- správné aktivní plochy,
- stavovou animaci tlačítka/přepínače.

### Ovládání nesmí být náhodné klikání

Každý P0/P1 prvek musí mít:

- jasnou fyzickou polohu,
- zvuk,
- odezvu lampy/budíku,
- dopad na subsystem.

## Nejlepší první panelový scénář

Scénář: „GТD readiness“

1. Řidič zapne palubní síť.
2. Přepne voltmetr na +27 V.
3. Zkontroluje baterie.
4. Zmáčkne studené protočení.
5. Sleduje startér, otáčky a tlak oleje.
6. Po dosažení podmínky stiskne start GТD.
7. Sleduje odpojení startéru při náběhu.
8. Po rozsvícení `ГЕНЕРАТОР` hlásí veliteli readiness.
9. Velitel spouští převodník/RPK.

Tohle je silný tutorial i reálná mechanika.
