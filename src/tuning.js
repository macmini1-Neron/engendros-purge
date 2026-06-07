// tuning.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';


// --- survival mechanics tuning (fall damage + broken leg + hunger), HARDCORE ---
export const FALL_SAFE = -8.0;              // |vy| below this on landing = no damage (a flat 7.2 jump lands ~ -7.2..-7.6, leave margin)
const FALL_HURT = -9.5;              // at/below this the fall also BREAKS THE LEG (damage onset is FALL_SAFE) — ~a 2m drop
export const FALL_LETHAL = -15.5;           // at/below this: effectively lethal (~a 5.5m drop)
export const FALL_DMG_PER_VY = 9;           // HP per (m/s) of impact speed beyond FALL_SAFE
export const FALL_DMG_BONUS_AT_LETHAL = 35; // extra flat damage past FALL_LETHAL to guarantee a kill through armor
export const FALL_ARMOR_BYPASS = 0.6;       // blunt trauma: 60% of fall damage ignores armor
export const LEG_BREAK_VY = FALL_HURT;      // any damaging fall also breaks the leg (frequent/hardcore)
export const LIMP_SPEED_MULT = 0.55;        // walk speed while leg broken (no sprint at all)
export const SPLINT_APPLY_TIME = 3.0;       // seconds immobile while binding a splint
export const HUNGER_MAX = 100;
export const HUNGER_DRAIN_PER_SEC = 0.15;   // 100 -> 0 in ~11 min (3x slower — food lasts ~300% longer)
export const HUNGER_LOW = 25;               // below this: walk slowed + HP regen disabled
export const HUNGER_LOW_SPEED_MULT = 0.7;   // walk speed while starving
export const STARVE_TICK_TIME = 2.0;        // seconds between starvation damage ticks at hunger<=0
export const STARVE_TICK_DMG = 5;           // HP per starvation tick (bypasses armor) — never drops HP below 50% maxHp; starvation can't kill
export const FOOD_RESTORE = 40;             // hunger restored per ration

// --- molotov tuning ---
export const MOLO_THROW_SPEED = 18, MOLO_THROW_LIFT = 4, MOLO_GRAV = 22, MOLO_PROJ_R = 0.16, MOLO_MAX_FLIGHT = 6.0;
export const MOLO_IGNITE_T = 0.7, MOLO_HAND_FUSE = 12.0, MOLO_THROW_CD = 0.4;
export const FIRE_POOL_RADIUS = 3.2, FIRE_POOL_LIFE = 7.0, FIRE_POOL_MAX = 4, OCCLUSION_INSET = 0.4;
export const FIRE_DOT_ENEMY = 22, FIRE_BURN_TICK = 0.25, ENEMY_BURN_DUR = 2.0, ENEMY_BURN_SLOW = 0.45;
export const PLAYER_BURN_DUR = 3.0, PLAYER_BURN_DPS = 9, PLAYER_BURN_TICK = 0.4;

export const SOUND_BY_CLASS = {
  pistol:  { body: 240, crack: 0.06, vol: 0.42, hp: 2100, bp: 1000 },
  smg:     { body: 200, crack: 0.05, vol: 0.40, hp: 2300, bp: 1100 },
  rifle:   { body: 180, crack: 0.08, vol: 0.52, hp: 1900, bp: 950 },
  shotgun: { body: 120, crack: 0.13, vol: 0.62, hp: 1400, bp: 700 },
  sniper:  { body: 160, crack: 0.10, vol: 0.72, hp: 1700, bp: 800 },
  launcher:{ body: 90,  crack: 0.20, vol: 0.70, hp: 800,  bp: 450 },
  fiftycal:{ body: 110, crack: 0.12, vol: 0.70, hp: 1500, bp: 650 }, // rooftop .50cal — mirrors MountedGun._fire() inline gunshot params
};

export const STRUCT_FX_COLOR = { sandbag: 0xcdb887, wire: 0x8a8f98, wood: 0x7a5530, radio: 0x4e6134 };

// ---------------------------------------------------------------------------
// Wave director
// ---------------------------------------------------------------------------
// Wave archetypes — each tilts the spawn mix + count + alive-cap and gets its own banner.
export const WAVE_ADVANCE_SECS = 25, WAVE_BREATHER = 4; // continuous waves: timed-advance countdown (survivors carry over) + post-clear breather
export const WAVE_TYPES = {
  normal:   { label: 'WAVE',     sub: 'they come for the stuffing',      countMul: 1.0,  cap: 24, base: { grunt: 30, runner: 22, swarmer: 16, brute: 9, exploder: 8, charger: 6 } },
  horde:    { label: 'HORDE',    sub: 'a tidal wave of plush',           countMul: 1.7,  cap: 34, speedMul: 1.05, base: { swarmer: 52, runner: 34, grunt: 14 } },
  stampede: { label: 'STAMPEDE', sub: 'runners & boomers — keep moving', countMul: 1.15, cap: 28, speedMul: 1.1,  base: { runner: 48, charger: 30, swarmer: 22 } },
  volatile: { label: 'VOLATILE', sub: 'careful — everything pops',        countMul: 1.0,  cap: 22, base: { exploder: 54, charger: 30, grunt: 16 } },
  elite:    { label: 'ELITE',    sub: 'fewer of them, but they are tanks', countMul: 0.62, cap: 18, hpMul: 1.15, base: { brute: 46, titan: 24, grunt: 30 } },
};
// (Wave modifiers removed — no frenzy / tough-hide / swarm / glass / payday mutators.)
export const MINIBOSS_NAMES = ['Stitchjaw', 'Mauler', 'Hugo', 'Ragnar', 'Bramble', 'Gloomgut'];

export const BOSS_ROSTER = ['boss']; // 'boss' = Tolo (tank boss removed)

// ---------------------------------------------------------------------------
// Day/Night cycle + celestial sky for THE LONG NIGHT. Drives every light, the
// fog, the sky-shader colours, an arcing sun & moon, a real-constellation
// starfield, a blood-moon variant and the player flashlight. In PURGE mode it
// is idle (held at bright noon).
// ---------------------------------------------------------------------------
export const NIGHT_CYCLE = 200;  // seconds for a full day→night→dawn
export const DAY_FRAC = 0.45;    // share of the cycle that is daytime
export const SKYC = {
  dTop: new THREE.Color(0x3f8fd0), dMid: new THREE.Color(0xbfe3f2), dBot: new THREE.Color(0xe9dcc0),
  nTop: new THREE.Color(0x04060f), nMid: new THREE.Color(0x070a18), nBot: new THREE.Color(0x0c0e1c),
  dusk: new THREE.Color(0xd9662a), blood: new THREE.Color(0x7a1410),
  dFog: new THREE.Color(0xdfd6bd), nFog: new THREE.Color(0x05060e),
  dHemiSky: new THREE.Color(0xdfeaff), dHemiG: new THREE.Color(0xb89b6a), nHemi: new THREE.Color(0x0a1330), nHemiG: new THREE.Color(0x0a0c18),
  white: new THREE.Color(0xffffff), nAmb: new THREE.Color(0x1a2244), bloodAmb: new THREE.Color(0x3a0e0e),
  sunCol: new THREE.Color(0xfff1d0), moonLight: new THREE.Color(0x8fa0d8), bloodMoonLight: new THREE.Color(0xc85038), moonCol: new THREE.Color(0xdfe3ee),
};
// Rough real constellations placed on the night dome (easter egg).
export const CONSTELLATIONS = [
  { az: 0.2,  el: 0.32, scale: 90, stars: [[-0.55,0.9],[0.5,0.85],[-0.2,0.05],[0,0],[0.2,-0.05],[-0.45,-0.9],[0.5,-0.85],[0.02,-0.45]], links: [[0,2],[1,4],[2,3],[3,4],[2,5],[4,6],[3,7]] }, // Orion
  { az: -1.7, el: 0.6,  scale: 120, stars: [[-1,0.15],[-0.5,0.22],[0,0.18],[0.45,0.05],[0.5,-0.35],[0,-0.45],[-0.45,-0.3]], links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]] }, // Big Dipper
  { az: 2.0,  el: 0.5,  scale: 95, stars: [[-1,0],[-0.5,0.4],[0,-0.05],[0.5,0.4],[1,0]], links: [[0,1],[1,2],[2,3],[3,4]] }, // Cassiopeia
  { az: 2.9,  el: 0.22, scale: 95, stars: [[0,1],[0,0.25],[0,-0.5],[0,-1],[-0.75,0.05],[0.75,0.05]], links: [[0,1],[1,2],[2,3],[4,1],[1,5]] }, // Cygnus
];
