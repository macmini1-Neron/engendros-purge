// DEMOSHILKA catalog — data-driven module + circuit list for the transparent 2D Shilka.
// Each module carries BOTH projections (side cutaway + top-down) + a glow rule driven by real state.
// glow(state, buses) -> 'live' | 'warn' | 'dead' | null.  This file is extended per-crew in M1..M5.
// Positions: side viewBox 0..1000 × 0..330 ; top viewBox 0..1000 × 0..250.

export const MODULES = [
  // --- front: control compartment ---
  { id:'driver', ru:'Řidič + panel', cz:'panel str.130', crew:'řidič', circuit:'dc',
    side:{x:120,y:250}, top:{x:120,y:150},
    glow:(s,b)=> b.dc27 ? 'live' : null,
    does:'Řidičův přístrojový štít (str.130). Ožije s palubní sítí 27,5 V (ПИТАНИЕ ВКЛ).', source:'shilka-driver-panel-anatomy.md' },
  { id:'fuelF', ru:'Nádrž přední', cz:'palivo 411 l', crew:'—', circuit:'fuel',
    side:{x:235,y:272}, top:{x:235,y:118},
    glow:()=>null, does:'Přední palivová nádrž (diesel + GTD).', source:'subsystem-states §9' },

  // --- middle: fighting compartment + turret base ---
  { id:'srp', ru:'СРП počítač', cz:'analog. palebný', crew:'(auto)', circuit:'ac',
    side:{x:360,y:268}, top:{x:395,y:182},
    glow:(s,b)=> b.ac220 ? 'live' : null,
    does:'Analogový palebný počítač — počítá předsažení. Žije z AC 220/400.', source:'subsystem-states §4' },
  { id:'gag', ru:'ГАГ gyro', cz:'stabilizace', crew:'velitel', circuit:'ac',
    side:{x:455,y:268}, top:{x:470,y:182},
    glow:(s,b)=> b.ac220 ? 'live' : null,
    does:'Gyro-stabilizace. Zapíná velitel (3 min roztočení). Žije z AC.', source:'subsystem-states §5' },
  { id:'vku', ru:'ВКУ sběrač', cz:'korba→věž', crew:'—', circuit:'dc',
    side:{x:430,y:205}, top:{x:435,y:150},
    glow:(s,b)=> (b.dc27||b.ac220) ? 'live' : null,
    does:'Kroužkový sběrač — vede 27,5 V + 220/400 do otáčející se věže.', source:'subsystem-states §1' },

  // --- rear: power compartment (СЭП) ---
  { id:'battery', ru:'Baterie 4×', cz:'12СТ-70М', crew:'řidič', circuit:'dc',
    side:{x:575,y:243}, top:{x:585,y:118},
    glow:(s)=> s.batteryMaster ? 'live' : null,
    does:'4×12СТ-70М (24 V, síť 27,5). Buffer DC, start motorů.', source:'subsystem-states §1' },
  { id:'diesel', ru:'Diesel В-6М', cz:'pohyb', crew:'řidič', circuit:'fuel',
    side:{x:575,y:273}, top:{x:585,y:182},
    glow:(s)=> s.dieselRpm>200 ? 'live' : (s.dieselStart?'warn':null),
    does:'Trakční diesel. Bez tlaku oleje NESTARTOVAT (zadření).', source:'subsystem-states §9' },
  { id:'reduktor', ru:'Reduktor СЭП', cz:'odběr výkonu', crew:'—', circuit:'mech',
    side:{x:645,y:273}, top:{x:655,y:182},
    glow:(s)=> s.generatorOnline ? 'live' : null,
    does:'Páka za sedadlem řidiče — spojí motor s generátorem.', source:'driver-station-inventory' },
  { id:'generator', ru:'Generátor ГИСВ', cz:'±27,5 V', crew:'—', circuit:'dc',
    side:{x:645,y:243}, top:{x:655,y:118},
    glow:(s)=> s.generatorOnline ? 'live' : null,
    does:'Vyrábí ±27,5 V DC. Točí ho turbína (na místě) nebo diesel (za jízdy).', source:'subsystem-states §1' },
  { id:'turbine', ru:'Turbína ДГ4М', cz:'APU', crew:'řidič', circuit:'mech',
    side:{x:715,y:243}, top:{x:725,y:118},
    glow:(s)=> s.gtdState==='idle' ? 'live' : (s.gtdStart?'warn':null),
    does:'Plynová turbína (APU). Start: klapky (14) → ПУСК (10) → 98,5–103,5 %.', source:'subsystem-states §9' },
  { id:'converter', ru:'Měnič ПС-14А', cz:'→ 220 V', crew:'velitel', circuit:'ac',
    side:{x:715,y:273}, top:{x:725,y:182},
    glow:(s,b)=> b.ac220 ? 'live' : (s.converterOn?'warn':null),
    does:'Z 27,5 V DC dělá 220 V/400 Hz. Zapíná velitel. Brána k radaru/pohonům.', source:'subsystem-states §1' },

  // --- turret (top of side view / inside turret circle in top view) ---
  { id:'drives', ru:'Pohony 2Э2', cz:'míření', crew:'naváděč', circuit:'v115',
    side:{x:365,y:165}, top:{x:390,y:128},
    glow:(s,b)=> b.v115 ? 'live' : null,
    does:'Silové míření věže+zbraní (115 V + DC). Bez AC → ruční kola.', source:'subsystem-states §2' },
  { id:'gun', ru:'Кanón АЗП ×4', cz:'4 automaty', crew:'naváděč', circuit:'dc',
    side:{x:445,y:165}, top:{x:435,y:108},
    glow:(s)=> s.batteryMaster ? 'live' : null,
    does:'4 automaty 23 mm. El. spouště běží i na baterie; palba dle blokací.', source:'subsystem-states §6' },
  { id:'cooling', ru:'Chlazení', cz:'85 l', crew:'naváděč', circuit:'dc',
    side:{x:520,y:165}, top:{x:480,y:128},
    glow:(s)=> s.cooling ? 'live' : null,
    does:'Kapalinové chlazení hlavní — podmínka palby.', source:'subsystem-states §6' },
  { id:'radar', ru:'Radar 1РЛ33', cz:'РПК', crew:'dálkař/naváděč', circuit:'ac',
    side:{x:480,y:60}, top:{x:545,y:150},
    glow:(s,b)=> b.ac220 ? 'live' : null,
    does:'Radar — hledá/sleduje, měří dálku. Visí na AC + žhavení.', source:'subsystem-states §3' },
];

// Circuits: per projection polyline points + a live() rule + a layer id (for X-ray toggles).
export const CIRCUITS = [
  { id:'dc', layer:'dc', cls:'dc', live:b=>b.dc27,
    side:'715,250 645,250 575,250 430,250 230,255 120,258',
    top:'725,125 655,125 585,125 435,150 235,128 120,150' },
  { id:'dcup', layer:'dc', cls:'dc', live:b=>b.dc27,
    side:'430,250 430,212', top:'435,150 435,150' },
  { id:'ac', layer:'ac', cls:'ac', live:b=>b.ac220,
    side:'715,266 430,266 430,212 430,200', top:'725,175 435,150' },
  { id:'acturret', layer:'ac', cls:'ac', live:b=>b.ac220,
    side:'430,200 480,170 480,68', top:'435,150 545,150' },
  { id:'acdrv', layer:'ac', cls:'ac', live:b=>b.ac220,
    side:'430,200 380,172', top:'435,150 390,130' },
  { id:'v115', layer:'v115', cls:'v115', live:b=>b.v115,
    side:'430,205 365,172', top:'435,150 390,128' },
  // palebná brána — svítí jen když canFire.ok (renderer nastaví s._fireOk). live(b,s).
  { id:'fire', layer:'fire', cls:'fire', live:(b,s)=>!!(s&&s._fireOk),
    side:'445,165 445,120 470,112', top:'435,128 435,104' },
];

// ── Driver panel str.130 (РИС.4-18). act: tgl|hold|btn|lamp|gauge.
// set/clear = real shilka-power field; read(s,b) for lamp/gauge; no set = present-but-aux (demo flag by n).
export const DRIVER_CONTROLS = [
  // АЗС jističe (str.41-42) — normálně zapnuté (def:1); musí být zatlačené, jinak okruh nefunguje
  { n:1,  ru:'ПИТАНИЕ СТАРТЕРА', cz:'jistič startéru', g:'azs', act:'tgl', def:1 },
  { n:2,  ru:'АВАР. ОСВЕЩЕНИЕ', cz:'nouz. osvětlení', g:'azs', act:'tgl', def:1 },
  { n:3,  ru:'ПИТАНИЕ ПОТРЕБИТ.', cz:'palubní spotřeb.', g:'azs', act:'tgl', def:1 },
  { n:6,  ru:'ГТД-2', cz:'okruh turbíny 2', g:'azs', act:'tgl', def:1 },
  { n:12, ru:'ГТД-1', cz:'okruh turbíny 1', g:'azs', act:'tgl', def:1 },
  { n:61, ru:'ЦЕПЬ ТНА-2', cz:'navigace', g:'azs', act:'tgl', def:1 },
  { n:63, ru:'ПИТАНИЕ ПОДОГР.', cz:'předehřívač', g:'azs', act:'tgl', def:1 },
  { n:64, ru:'ОБЩЕЕ ПИТАНИЕ', cz:'celkové napájení', g:'azs', act:'tgl', def:1 },
  { n:71, ru:'ПОДГОТ. ЗАПУСКА', cz:'příprava startu', g:'azs', act:'tgl', def:1 },
  { n:73, ru:'ПИТАНИЕ СПИДОМ.', cz:'rychloměr', g:'azs', act:'tgl', def:1 },
  { n:78, ru:'ПИТАНИЕ СТЕКЛООЧ.', cz:'stěrače', g:'azs', act:'tgl', def:1 },
  { n:22, ru:'ОТКЛ.ГЕН/АВТ.ЗАП.ГТД', cz:'havarijní (pod krytem)', g:'gtd', act:'tgl' },
  // power
  { n:7,  ru:'ПИТАНИЕ ВКЛ.', cz:'síť 27,5 V', g:'pwr', act:'tgl', set:'batteryMaster' },
  { n:8,  ru:'ПИТАНИЕ ОТКЛ.', cz:'vyp síť', g:'pwr', act:'btn', clear:'batteryMaster' },
  { n:4,  ru:'ЦЕПЬ −27В', cz:'měření −27', g:'pwr', act:'btn' },
  { n:5,  ru:'ЦЕПЬ +27В', cz:'měření +27', g:'pwr', act:'btn' },
  { n:35, ru:'ПИТАНИЕ ПРИБОРОВ', cz:'napájení přístrojů', g:'pwr', act:'tgl' },
  { n:62, ru:'ВОЛЬТМЕТР', cz:'napětí sítě', g:'pwr', act:'gauge', read:s=>s.batteryVolts.toFixed(1)+' V' },
  // GTD
  { n:40, ru:'СИГНАЛ', cz:'houkačka', g:'gtd', act:'tgl', set:'horn' },
  { n:14, ru:'ХОЛОДНАЯ ПРОКР.', cz:'protočení → klapky', g:'gtd', act:'hold', set:'coldCrank' },
  { n:10, ru:'ПУСК ГТД', cz:'start turbíny', g:'gtd', act:'tgl', set:'gtdStart' },
  { n:11, ru:'СТОП ГТД', cz:'stop turbíny', g:'gtd', act:'btn', clear:'gtdStart' },
  { n:16, ru:'ЗАКР. ЗАСЛ.', cz:'zavři klapky', g:'gtd', act:'btn', clear:'flapsOpen' },
  { n:20, ru:'ОТКР. ЗАСЛ.', cz:'klapky otevřeny', g:'gtd', act:'lamp', read:s=>s.flapsOpen },
  { n:15, ru:'СТАРТЕР ГТД', cz:'startér turbíny', g:'gtd', act:'lamp', read:s=>s.gtdState==='starting' },
  { n:17, ru:'ГТД', cz:'turbína běží', g:'gtd', act:'lamp', read:s=>s.gtdState==='idle' },
  { n:18, ru:'ГЕНЕРАТОР', cz:'generátor dává proud', g:'gtd', act:'lamp', read:s=>s.generatorOnline },
  { n:21, ru:'ПРЕОБРАЗ. ГТД', cz:'měnič z turbíny', g:'gtd', act:'lamp', read:(s,b)=>b.ac220&&s.gtdState==='idle' },
  { n:19, ru:'ПРЕОБРАЗ. ДИЗ.', cz:'měnič z dieselu', g:'gtd', act:'lamp', read:(s,b)=>b.ac220&&s.dieselRpm>=1550 },
  { n:57, ru:'тахометр ГТД', cz:'otáčky GTD', g:'gtd', act:'gauge', read:s=>s.gtdRpmPct.toFixed(0)+' %' },
  { n:56, ru:'ГАЗЫ', cz:'teplota plynů', g:'gtd', act:'gauge', read:()=>'—' },
  { n:55, ru:'МАСЛО ГТД', cz:'teplota oleje GTD', g:'gtd', act:'gauge', read:()=>'—' },
  { n:58, ru:'моточасы ГТД', cz:'motohodiny GTD', g:'gtd', act:'gauge', read:()=>'—' },
  // diesel
  { n:27, ru:'НАСОС ТОПЛИВА', cz:'palivové čerpadlo', g:'dsl', act:'tgl', set:'fuelPump' },
  { n:46, ru:'НАСОС МАСЛА', cz:'drž → tlak oleje', g:'dsl', act:'hold', set:'oilPumpHeld' },
  { n:47, ru:'СТАРТЕР', cz:'start dieselu', g:'dsl', act:'tgl', set:'dieselStart' },
  { n:43, ru:'СТАРТЕР (диз)', cz:'startér točí', g:'dsl', act:'lamp', read:s=>s.dieselStart&&!s.generatorOnline },
  { n:24, ru:'ЖАЛЮЗИ ДИЗЕЛЯ', cz:'žaluzie chlazení', g:'dsl', act:'tgl' },
  { n:38, ru:'МАСЛО (давл.)', cz:'tlak oleje diesel', g:'dsl', act:'gauge', read:s=>s.oilPressure.toFixed(2) },
  { n:48, ru:'тахометр диз.', cz:'otáčky diesel', g:'dsl', act:'gauge', read:s=>s.dieselRpm.toFixed(0)+' ot' },
  { n:39, ru:'спидометр', cz:'rychlost', g:'dsl', act:'gauge', read:()=>'0 km/h' },
  { n:37, ru:'ВОДА', cz:'teplota vody', g:'dsl', act:'gauge', read:()=>'—' },
  { n:49, ru:'МАСЛО (темп.)', cz:'teplota oleje diesel', g:'dsl', act:'gauge', read:()=>'—' },
  { n:36, ru:'ТОПЛИВО (зад.)', cz:'palivo zadní nádrž', g:'dsl', act:'gauge', read:()=>'—' },
  { n:54, ru:'ТОПЛИВО (давл.)', cz:'tlak paliva', g:'dsl', act:'gauge', read:()=>'—' },
  { n:50, ru:'моточасы диз.', cz:'motohodiny diesel', g:'dsl', act:'gauge', read:()=>'—' },
  { n:60, ru:'КЛАПАН ПРОКАЧКИ', cz:'odvzdušnění', g:'dsl', act:'btn' },
  { n:9,  ru:'КОТЕЛ', cz:'teplota kotle', g:'dsl', act:'gauge', read:()=>'—' },
  // preheat / winter
  { n:28, ru:'КЛАПАН ПОДОГРЕВА', cz:'ventil ohřívače', g:'pre', act:'tgl' },
  { n:29, ru:'СВЕЧА−ФОРСУНКА', cz:'svíčka/tryska', g:'pre', act:'tgl' },
  { n:31, ru:'ВЕНТ. ПОМПА', cz:'ventilátor/čerpadlo', g:'pre', act:'tgl' },
  { n:32, ru:'ПОДОГРЕВ ЧАСОВ', cz:'ohřev hodin', g:'pre', act:'tgl' },
  { n:33, ru:'ПОДОГРЕВ ПРИБОРОВ', cz:'ohřev přístrojů', g:'pre', act:'tgl' },
  { n:34, ru:'РЕЖИМ ОБОГР.', cz:'výkon topení', g:'pre', act:'tgl' },
  // ПАЗ / ventilace / poklop
  { n:65, ru:'ЛЮК ОТКРЫТ', cz:'poklop otevřen! (ČERVENÁ)', g:'paz', act:'lamp', danger:1, read:s=>!s.hatchClosed },
  { n:66, ru:'ПРИТОЧ. ВЕНТИЛ.', cz:'přítlačný ventil.', g:'paz', act:'lamp', read:()=>false },
  { n:68, ru:'ВЫТЯЖ. ВЕНТИЛ.', cz:'odsávací ventil.', g:'paz', act:'lamp', read:()=>false },
  { n:67, ru:'ЗАСЛ. ОПОРЫ', cz:'klapky podpory zavř.', g:'paz', act:'lamp', read:()=>false },
  { n:70, ru:'СИГНАЛ ПАЗ', cz:'ПАЗ poplach', g:'paz', act:'lamp', read:()=>false },
  // lights / wipers / vision
  { n:42, ru:'ФАРЫ', cz:'světlomety', g:'lt', act:'tgl' },
  { n:72, ru:'ФАРЫ ТВН-СМУ', cz:'IR/maskovací', g:'lt', act:'tgl' },
  { n:41, ru:'ФАРЫ ТВНО', cz:'IR svítí', g:'lt', act:'lamp', read:()=>false },
  { n:77, ru:'СТЕКЛООЧ. ЛЮКА', cz:'stěrač poklopu', g:'lt', act:'tgl' },
  { n:80, ru:'СТЕКЛООЧ. КОЛПАКА', cz:'stěrač periskopu', g:'lt', act:'tgl' },
  { n:44, ru:'ПОДСВЕТКА', cz:'podsvit panelu', g:'lt', act:'tgl' },
  { n:45, ru:'РОЗЕТКА', cz:'zásuvka 24 V', g:'lt', act:'btn' },
  { n:51, ru:'ЧАСЫ', cz:'hodiny', g:'lt', act:'gauge', read:()=>'—' },
];

// Piktogramy 1:1 z shilka-driver-panel-anatomy.md. ic = typ akce; start/crit = 🚀/💀 odznak.
// 🔘 mačká · 🕹️ přepíná · 👁️ jen kouká (lampa/budík) · 🎛️ reguluje · 🔌 konektor · 🛡️ ochrana
export const DRIVER_ICONS = {
  7:{ic:'🔘',start:1}, 8:{ic:'🔘'}, 4:{ic:'🔘'}, 5:{ic:'🔘'}, 35:{ic:'🕹️'}, 62:{ic:'👁️'},
  40:{ic:'🔘',start:1}, 14:{ic:'🔘',start:1}, 10:{ic:'🔘',start:1}, 11:{ic:'🔘'}, 16:{ic:'🔘'},
  20:{ic:'👁️',start:1,crit:1}, 15:{ic:'👁️'}, 17:{ic:'👁️',start:1}, 18:{ic:'👁️',start:1},
  21:{ic:'👁️'}, 19:{ic:'👁️'}, 57:{ic:'👁️'}, 56:{ic:'👁️',crit:1}, 55:{ic:'👁️'}, 58:{ic:'👁️'},
  27:{ic:'🔘',start:1}, 46:{ic:'🔘',start:1,crit:1}, 47:{ic:'🔘',start:1}, 43:{ic:'👁️'},
  24:{ic:'🕹️',crit:1}, 38:{ic:'👁️',start:1}, 48:{ic:'👁️'}, 39:{ic:'👁️'}, 37:{ic:'👁️',crit:1},
  49:{ic:'👁️',crit:1}, 36:{ic:'👁️'}, 54:{ic:'👁️'}, 50:{ic:'👁️'}, 60:{ic:'🔘'}, 9:{ic:'👁️'},
  28:{ic:'🕹️'}, 29:{ic:'🕹️'}, 31:{ic:'🕹️'}, 32:{ic:'🕹️'}, 33:{ic:'🕹️'}, 34:{ic:'🕹️'},
  65:{ic:'👁️',crit:1}, 66:{ic:'👁️'}, 68:{ic:'👁️'}, 67:{ic:'👁️',crit:1}, 70:{ic:'👁️'},
  42:{ic:'🕹️'}, 72:{ic:'🕹️'}, 41:{ic:'👁️'}, 77:{ic:'🕹️'}, 80:{ic:'🕹️'}, 44:{ic:'🎛️'}, 45:{ic:'🔌'}, 51:{ic:'👁️'},
  // АЗС jističe + havarijní 22
  1:{ic:'🔘',start:1}, 2:{ic:'🔘'}, 3:{ic:'🔘'}, 6:{ic:'🔘',start:1}, 12:{ic:'🔘',start:1}, 61:{ic:'🔘'},
  63:{ic:'🔘'}, 64:{ic:'🔘',start:1}, 71:{ic:'🔘',start:1}, 73:{ic:'🔘'}, 78:{ic:'🔘'}, 22:{ic:'🕹️',crit:1},
};

// ── Velitelský pult (Пульт командира) — IMAGE-BACKED overlay.
// Pozadí = demo/assets/commander-panel.png (941×1672). Každý prvek má px:{x,y} v %
// (rozlišení-nezávislé) a kind. Napojeno na shilka-power / shilka-interlock / shilka-stab.
// Číslování: n = Альбом 2011, n70 = ИЭ1970. Souřadnice doladitelné kalibrační mřížkou.
// kind: lamp | toggle | button | selector | counter | gauge.  col: red|amber|green|cool|grey.
// read(s,b) pro lamp/counter/gauge; set/clear = sim-key pro toggle/button; selector cyklí opts→set.
export const COMMANDER_PANEL = { img:'./demo/assets/commander-panel.png', w:941, h:1672 };

export const COMMANDER_CONTROLS = [
  // — napájení / БПС / diesel —
  { ru:'ВКЛЮЧЕНИЕ ПИТАНИЯ', cz:'zapni síť věže', n:34, n70:6,  kind:'button', px:{x:13,y:72}, set:'batteryMaster' },
  { ru:'ОТКЛЮЧЕНИЕ ПИТАНИЯ', cz:'vyp síť',        n:32, n70:4,  kind:'button', px:{x:13,y:80}, clear:'batteryMaster' },
  { ru:'ОТКЛЮЧЕНИЕ ДИЗЕЛЯ', cz:'stop diesel',     n:38, n70:2,  kind:'button', px:{x:13,y:88}, clear:'dieselStart' },
  { ru:'СТОП БПС', cz:'stop měnič',               n:36, n70:1,  kind:'button', px:{x:13,y:95}, clear:'converterOn', col:'red' },
  { ru:'ПУСК БПС', cz:'start měnič → AC',          n:37, n70:36, kind:'button', px:{x:30,y:95}, set:'converterOn' },
  { ru:'НАПРЯЖ. ФАЗ', cz:'volba fází',             n:10, n70:34, kind:'selector', px:{x:47,y:95}, set:'phaseSel', opts:['1','2-2','3-3','Т'] },
  { ru:'ВОЛЬТМЕТР DC', cz:'27/55 V',               n:9,  n70:9,  kind:'gauge', px:{x:80,y:79}, read:(s)=>s.batteryVolts.toFixed(0)+'V' },
  { ru:'ВОЛЬТМЕТР AC', cz:'220/400',               n:8,  n70:8,  kind:'gauge', px:{x:80,y:92}, read:(s,b)=>b.ac220?'220':'0' },
  // — okruh střelby —
  { ru:'ОГРАНИЧЕНИЕ УГЛОВ', cz:'min. náměr °',     n:17, n70:19, kind:'selector', px:{x:11,y:6}, set:'angleLimit', opts:[0,5,10,15,20,25,30,35,40] },
  { ru:'ВОЗБУЖДЕНИЕ', cz:'buzení gen.',            kind:'lamp', px:{x:33,y:6}, col:'amber', read:(s)=>s.generatorOnline },
  { ru:'ШУНТ-СРП', cz:'СРП ↔ ШУНТ',                n:11, n70:18, kind:'toggle', px:{x:32,y:16}, set:'shuntSrp' },
  { ru:'АВАРИЙНАЯ СТРЕЛЬБА', cz:'havarijní palba', n:31, n70:17, kind:'toggle', px:{x:13,y:24}, set:'avariynaya', col:'red' },
  { ru:'СТРЕЛЬБА ВЕРХ.', cz:'horní pár',           n:5,  n70:14, kind:'toggle', px:{x:49,y:26}, set:'bankUpper' },
  { ru:'СТРЕЛЬБА НИЖ.', cz:'dolní pár',            n:5,  n70:15, kind:'toggle', px:{x:49,y:40}, set:'bankLower' },
  { ru:'ЦЕПЬ СТРЕЛЬБЫ', cz:'palebný okruh',        n:26, n70:11, kind:'toggle', px:{x:13,y:53}, set:'tsepFire' },
  { ru:'ЛЮК ОТКРЫТ', cz:'poklop otevřen',          n:19, n70:19, kind:'lamp', px:{x:36,y:63}, col:'red', read:(s)=>!s.hatchClosed },
  // — zbraně / munice (4 automaty: ВЕРХ.ЛЕВ/ПРАВ vnitřní pár, НИЖН.ЛЕВ/ПРАВ vnější) —
  { ru:'ПЕРЕЗАРЯДКА ВЛ', cz:'pneu přebití', kind:'button', px:{x:32,y:24} },
  { ru:'ПЕРЕЗАРЯДКА ВП', cz:'pneu přebití', kind:'button', px:{x:67,y:24} },
  { ru:'ПЕРЕЗАРЯДКА НЛ', cz:'pneu přebití', kind:'button', px:{x:12,y:30} },
  { ru:'ПЕРЕЗАРЯДКА НП', cz:'pneu přebití', kind:'button', px:{x:86,y:27} },
  { ru:'ЗАРЯЖЕНО ВЛ', cz:'nabito', kind:'lamp', px:{x:32,y:31}, col:'red', read:(s)=>s.zarVL },
  { ru:'ЗАРЯЖЕНО ВП', cz:'nabito', kind:'lamp', px:{x:67,y:31}, col:'red', read:(s)=>s.zarVP },
  { ru:'ЗАРЯЖЕНО НЛ', cz:'nabito', kind:'lamp', px:{x:12,y:38}, col:'red', read:(s)=>s.zarNL },
  { ru:'ЗАРЯЖЕНО НП', cz:'nabito', kind:'lamp', px:{x:86,y:39}, col:'red', read:(s)=>s.zarNP },
  { ru:'ОСТАТОК ВЛ', cz:'zbytek', kind:'counter', px:{x:32,y:40}, read:(s)=>String(s.ammoVL).padStart(3,'0') },
  { ru:'ОСТАТОК ВП', cz:'zbytek', kind:'counter', px:{x:67,y:40}, read:(s)=>String(s.ammoVP).padStart(3,'0') },
  { ru:'ОСТАТОК НЛ', cz:'zbytek', kind:'counter', px:{x:12,y:45}, read:(s)=>String(s.ammoNL).padStart(3,'0') },
  { ru:'ОСТАТОК НП', cz:'zbytek', kind:'counter', px:{x:86,y:46}, read:(s)=>String(s.ammoNP).padStart(3,'0') },
  { ru:'РОСА', cz:'hašení ППО', kind:'button', px:{x:85,y:19}, col:'red' },
  // — chlazení / hydro —
  { ru:'УРОВЕНЬ ОЖ', cz:'hladina chladiva', kind:'lamp', px:{x:31,y:55}, col:'red', read:(s)=>s.lowCoolant },
  { ru:'ОХЛАЖДЕНИЕ', cz:'chlazení běží', n:24, n70:123, kind:'lamp', px:{x:47,y:55}, col:'cool', read:(s)=>s.cooling },
  { ru:'ГИДРОПРИВОД ВКЛ', cz:'pohon on', n:16, n70:25, kind:'button', px:{x:63,y:53}, set:'hydraulicOn' },
  { ru:'ГИДРОПРИВОД ВЫК', cz:'pohon off', n:14, n70:27, kind:'button', px:{x:85,y:53}, clear:'hydraulicOn', col:'red' },
  { ru:'54В / 27В', cz:'rozsah voltmetru', n:13, n70:7, kind:'toggle', px:{x:49,y:61}, set:'dcRange' },
  // — ГАГ gyro —
  { ru:'ГАГ', cz:'gyro master', n:27, n70:35, kind:'toggle', px:{x:39,y:89}, set:'gagOn' },
  { ru:'ОТСТОПОРЕНО', cz:'ready', kind:'lamp', px:{x:30,y:75}, col:'green', read:(s)=>s.gagReady },
  { ru:'КОНТРОЛЬ', cz:'self-test', n:33, n70:31, kind:'button', px:{x:45,y:75} },
  { ru:'ЗАСТОПОРЕНО', cz:'náběh ~3 min', kind:'lamp', px:{x:30,y:83}, col:'red', read:(s)=>s.gagPhase==='spinup' },
  { ru:'НЕЙТРАЛЬНО', cz:'neutrál', kind:'lamp', px:{x:45,y:83}, col:'red', read:(s)=>s.gagPhase==='fault' },
];


