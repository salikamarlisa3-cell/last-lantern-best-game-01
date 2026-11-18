// Last Lantern: every tuning number, colour and piece of text data in one place.
// The playfield is a fixed 1280x720 logical meadow; the renderer scales it to the window,
// so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Where the lantern stands: the middle of the meadow, the point everything defends. */
export const LANTERN_POS = { x: 640, y: 368 };

export const LANTERN = {
  radius: 24,
  maxFlame: 100,
  /** Flame a Gloam Moth burns away when it reaches the lantern and is consumed. */
  mothBite: 3,
  /** Flame a latched Cinderback drains per second until it is shot off. */
  beetleDrainPerSecond: 5,
  /** Flame one of a Sputter Imp's gloom bolts eats when it lands on the glass. */
  boltBite: 2,
};

export const KEEPER = {
  radius: 15,
  speed: 305,
  hearts: 3,
  maxHeartsCap: 5,
  /** Seconds of mercy blinking after a hit lands. */
  invulnerable: 1.25,
  knockback: 260,
  fireInterval: 0.17,
  boltSpeed: 800,
  boltLife: 0.9,
  dashTime: 0.16,
  dashSpeedScale: 3.1,
  dashCooldown: 1.5,
};

export const MOTH = {
  radius: 13,
  hp: 1,
  speedMin: 58,
  speedMax: 88,
  wobble: 2.6,
  score: 10,
};

export const BEETLE = {
  radius: 21,
  hp: 7,
  speed: 40,
  score: 40,
};

export const SPITTER = {
  radius: 16,
  hp: 3,
  speed: 74,
  /** It hovers in this band around the keeper, spitting gloom from a safe distance. */
  bandMin: 235,
  bandMax: 330,
  windup: 0.45,
  spitIntervalMin: 2.1,
  spitIntervalMax: 3.1,
  boltSpeed: 245,
  boltLife: 3.2,
  score: 25,
};

/** Ten nights stand between dusk and dawn; clear the tenth and the sun rises. */
export const NIGHTS = 10;

export const WAVE = {
  /** Spawn gap on night 1, and how much each later night shaves off it. */
  intervalStart: 1.05,
  intervalPerNight: 0.07,
  intervalMin: 0.34,
  /** Enemy hit points and pace creep up a little every night. */
  hpPerNight: 0.1,
  speedPerNight: 0.02,
  clearBonusPerNight: 50,
};

/** How many of each pool the world allocates once, at boot. */
export const POOLS = { enemies: 240, bolts: 320, gloomBolts: 160, pickups: 40, particles: 700, floaters: 48 };

export const PICKUP = {
  radius: 12,
  life: 12,
  magnetRadius: 96,
  magnetSpeed: 340,
  collectRadius: 26,
  kindlingFlame: 14,
  /** Drop chances on a kill; they are rolled in this order and sum to under a fifth. */
  heartChance: 0.045,
  kindlingChance: 0.085,
  frostChance: 0.04,
  frostSeconds: 4,
  frostSlowScale: 0.45,
  score: 5,
};

/** The boons offered between nights. max is how many times one may be taken in a run. */
export const UPGRADES = [
  { id: 'tempo', name: 'Ember Tempo', blurb: 'Shoot 15% faster.', max: 4 },
  { id: 'twin', name: 'Twin Flames', blurb: '+1 bolt in every shot.', max: 2 },
  { id: 'bright', name: 'Bright Bolts', blurb: 'Bolts deal +1 damage.', max: 3 },
  { id: 'pierce', name: 'Piercing Light', blurb: 'Bolts pass through +1 foe.', max: 2 },
  { id: 'swift', name: 'Swift Steps', blurb: 'Move 12% faster.', max: 3 },
  { id: 'ward', name: "Keeper's Ward", blurb: '+1 max heart, and mend 1.', max: 2 },
  { id: 'charm', name: 'Hearth Charm', blurb: 'The lantern slowly rekindles, +20 flame now.', max: 2 },
  { id: 'wind', name: 'Second Wind', blurb: 'Dash recharges 30% faster.', max: 2 },
  { id: 'cache', name: 'Kindled Cache', blurb: '+250 embers and +20 flame, at once.', max: 99 },
];

export const PALETTE = {
  backdrop: '#04060d',
  skyTop: '#0d1430',
  skyBottom: '#060a18',
  hillFar: '#0e1836',
  hillNear: '#0a1226',
  meadow: '#0d2620',
  meadowDark: '#081a15',
  lanternFlame: '#ffb347',
  lanternCore: '#fff3c4',
  lanternMetal: '#3a3f52',
  lanternStone: '#232838',
  keeperCloak: '#14524a',
  keeperRim: '#7fe7d2',
  keeperFace: '#0b0f1a',
  mothWing: '#b9a7d9',
  mothBody: '#6f5b93',
  beetleShell: '#5a2e22',
  beetleCrack: '#ff7a3c',
  spitterBody: '#7a4a8c',
  spitterBelly: '#a678b8',
  gloomBolt: '#c77dff',
  bolt: '#ffe9a8',
  heart: '#ff6b81',
  frost: '#a8e6ff',
  kindling: '#ff9f43',
  panel: 'rgba(11, 16, 32, 0.93)',
  panelEdge: '#ffb347',
  text: '#f5efe0',
  muted: '#9aa7bd',
  ember: '#ffc95e',
};

export const FONT_BODY = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_TITLE = 'Georgia, "Times New Roman", serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'last-lantern.best';
