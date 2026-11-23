/* ============================================================
   RIFT RUMBLE — data: fighters, moves, stages, items
   ============================================================ */
'use strict';

const WORLD = {
  W: 1600, H: 1000,
  blast: { left: -1550, right: 1550, top: -1150, bottom: 780 },
  respawnY: -420,
  gravityCap: 26,
};

const PALETTES = {};
function pal(name, skin, hair, primary, secondary, accent, cloth) {
  return { name, skin, hair, primary, secondary, accent, cloth: cloth || secondary };
}

/* ---------- shared move helpers ---------- */
function mv(o) { return Object.assign({ name: '', frames: 30, startup: 4, active: 3, damage: 5, bkb: 10, kbs: 30, angle: 45, reach: 0, hitboxes: null, sfx: 'swing', effect: 'slash', cancelable: 0, charge: 0, multi: 0, landingLag: 0 }, o); }
function hb(x, y, w, h, t0 = 0, t1 = 99) { return { x, y, w, h, t0, t1 }; }

/* ============================================================
   FIGHTERS
   ============================================================ */
const FIGHTERS = {

  /* ---------------- VALOR ---------------- */
  valor: {
    key: 'valor', artFacing: 1, name: 'VALOR', title: 'THE RIFT BLADE', archetype: 'All-Rounder',
    description: 'A blue-armored swordsman with a blazing orange scarf, cutting through the arena with swift cyan energy arcs.',
    color: '#4aa3ff', theme: '#4aa3ff',
    /* hurtbox, in px at scale 1.  Height tracks the drawn sprite (see the
       hurtbox test in tools/animtest.js): a box shorter than the art is how you get
       "I clearly hit their head and nothing happened". */
    body: { w: 46, h: 105 },
    stats: { weight: 100, walk: 2.4, run: 6.5, air: 4.8, fall: 10.8, fastfall: 17.2, gravity: 0.56, jumps: 2, jumpV: 12.5, djumpV: 11.8, airJumps: 1, size: 1.0, traction: 0.55, airAccel: 0.34, dashFrames: 10 },
    locomotion: 'humanoid', weapon: 'sword', weaponLen: 46,
    palettes: [
      pal('Azure', '#f2c9a3', '#243049', '#2c4f95', '#cfe0f5', '#5aa9ff', '#1c3663'),
      pal('Crimson', '#f0c49c', '#2a1a1a', '#8f2530', '#f0d3d8', '#ff6b6b', '#5e1620'),
      pal('Forest', '#e8bd93', '#22301c', '#2f6033', '#d6e8c8', '#78d98a', '#1d3d20'),
      pal('Violet', '#f4cfa8', '#2c1d3a', '#5b2a86', '#e6d4f2', '#bd7dff', '#3a1a58'),
      pal('Ivory', '#f6d7b4', '#e8e6ea', '#c9d3de', '#ffffff', '#9fd4ff', '#8b98a8'),
      pal('Umbra', '#c99a74', '#111318', '#1a2230', '#4a5568', '#7f8fa8', '#0c1018'),
    ],
    moves: {
      jab: mv({ name: 'Jab', frames: 22, startup: 2, active: 3, damage: 3, bkb: 8, kbs: 24, angle: 35, reach: 40, hitboxes: [hb(14, -58, 46, 30)] }),
      ftilt: mv({ name: 'Sword Arc', frames: 32, startup: 6, active: 4, damage: 9, bkb: 18, kbs: 52, angle: 32, reach: 54, hitboxes: [hb(18, -66, 56, 46)] }),
      utilt: mv({ name: 'Rising Arc', frames: 32, startup: 5, active: 5, damage: 8, bkb: 20, kbs: 56, angle: 96, hitboxes: [hb(-20, -110, 74, 58)] }),
      dtilt: mv({ name: 'Low Sweep', frames: 28, startup: 4, active: 3, damage: 7, bkb: 16, kbs: 42, angle: 18, hitboxes: [hb(14, -26, 52, 28)] }),
      dashattack: mv({ name: 'Crescent Lunge', frames: 38, startup: 5, active: 11, damage: 10, bkb: 26, kbs: 46, angle: 58, hitboxes: [hb(6, -86, 62, 78)] }),
      fsmash: mv({ name: 'Lunar Cleave', frames: 52, startup: 12, active: 4, damage: 16, bkb: 30, kbs: 92, angle: 33, reach: 62, charge: 1, hitboxes: [hb(16, -76, 70, 60)] }),
      usmash: mv({ name: 'Starfall', frames: 46, startup: 9, active: 5, damage: 15, bkb: 26, kbs: 88, angle: 88, charge: 1, hitboxes: [hb(-30, -122, 92, 66)] }),
      dsmash: mv({ name: 'Twin Sweep', frames: 46, startup: 8, active: 4, damage: 13, bkb: 24, kbs: 82, angle: 22, charge: 1, hitboxes: [hb(-56, -22, 66, 34), hb(16, -22, 66, 34)] }),
      nair: mv({ name: 'Nair', frames: 30, startup: 3, active: 8, damage: 8, bkb: 14, kbs: 52, angle: 45, hitboxes: [hb(-40, -78, 84, 64)] }),
      fair: mv({ name: 'Fair', frames: 34, startup: 6, active: 4, damage: 11, bkb: 18, kbs: 62, angle: 42, hitboxes: [hb(14, -84, 66, 56)] }),
      bair: mv({ name: 'Bair', frames: 32, startup: 5, active: 4, damage: 12, bkb: 20, kbs: 68, angle: 145, hitboxes: [hb(-72, -78, 62, 52)] }),
      uair: mv({ name: 'Uair', frames: 30, startup: 4, active: 5, damage: 9, bkb: 14, kbs: 58, angle: 88, hitboxes: [hb(-32, -116, 68, 54)] }),
      dair: mv({ name: 'Meteor Point', frames: 36, startup: 7, active: 4, damage: 12, bkb: 18, kbs: 58, angle: 268, hitboxes: [hb(-24, -18, 52, 58)], spike: 1 }),
    },
    specials: {
      neutral: { name: 'CRESCENT COMBO', desc: 'Two sweeping blade cuts with a rising finish', type: 'bladecombo', frames: 42, startup: 6, active: 13, damage: 4, bkb: 3, kbs: 4, angle: 70, multi: 1, rehit: 7, finish: { damage: 7, bkb: 20, kbs: 52, angle: 72 }, hitboxes: [hb(8, -88, 90, 70)] },
      /* A rush special is a body travelling through someone else, so it carries a hitbox
         like any melee move: `active` is how many ticks the authored `dist` takes at the
         rush speed, and the box is the fighter's own dash attack, widened a
         touch because the whole body commits to this one. */
      side: { name: 'SKYSLASH RUSH', desc: 'A quick sword rush that launches upward', type: 'dash', frames: 44, startup: 8, damage: 12, bkb: 24, kbs: 58, angle: 70, rushSpeed: 14, dist: 150, active: 13, hitboxes: [hb(8, -64, 64, 48)] },
      up: { name: 'SKYWARD ASCENT', desc: 'Rising recovery with follow-up strikes on hit', type: 'recover', frames: 40, startup: 3, damage: 12, bkb: 18, kbs: 46, angle: 80, rise: 9.2, drift: 4.2, ascentCombo: { opening: 3, follow: 3, finish: 6, interval: 5, reach: 150 } },
      down: { name: 'GUARDIAN STANCE', desc: 'Counter stance', type: 'counter', frames: 40, startup: 1, window: 20, mult: 1.35 },
    },
    finalSmash: { name: 'BLADE TEMPEST', type: 'spin', duration: 150, damage: 42 },
    grabRange: 46, throwDmg: { f: 8, b: 10, u: 7, d: 6 },
  },

  /* ---------------- GRIM ---------------- */
  grim: {
    key: 'grim', artFacing: 1, name: 'GRIM', title: 'THE COLOSSUS', archetype: 'Heavyweight',
    description: 'A towering stone golem draped in moss and marked by glowing green runes, shattering the ground with massive fists.',
    color: '#83d749', theme: '#83d749',
    /* hurtbox, in px at scale 1.  Height tracks the drawn sprite (see the
       hurtbox test in tools/animtest.js): a box shorter than the art is how you get
       "I clearly hit their head and nothing happened". */
    body: { w: 58, h: 124 },
    stats: { weight: 138, walk: 1.9, run: 4.9, air: 3.3, fall: 12.9, fastfall: 21.5, gravity: 0.77, jumps: 2, jumpV: 12.9, djumpV: 11.6, airJumps: 1, size: 1.22, traction: 0.5, airAccel: 0.26, dashFrames: 14 },
    locomotion: 'brute', weapon: 'fists', weaponLen: 0,
    palettes: [
      pal('Stone', '#9aa0a8', '#3a3f46', '#6b7280', '#b8bfc8', '#83d749', '#4b5158'),
      pal('Rust', '#a8867a', '#3d2a22', '#8a4a2f', '#c9a48e', '#ff7a2a', '#5a2f1e'),
      pal('Moss', '#93a08a', '#2f3a2a', '#55704a', '#a8bf9a', '#c8ff6a', '#33422c'),
      pal('Slate', '#8f9aad', '#2a3242', '#4a5b78', '#a8b8d0', '#5aa9ff', '#2c3849'),
      pal('Obsidian', '#6a6f78', '#12151a', '#2a2f38', '#8a929e', '#ffffff', '#181c22'),
      pal('Bronze', '#c8a878', '#4a3a22', '#a87f3a', '#e0c89a', '#ffd23a', '#6b5228'),
    ],
    moves: {
      jab: mv({ name: 'Hammer Fists', frames: 26, startup: 4, active: 3, damage: 5, bkb: 10, kbs: 28, angle: 40, hitboxes: [hb(12, -66, 52, 40)] }),
      ftilt: mv({ name: 'Overhand', frames: 40, startup: 10, active: 4, damage: 13, bkb: 24, kbs: 60, angle: 38, hitboxes: [hb(14, -84, 66, 66)] }),
      utilt: mv({ name: 'Rising Rock', frames: 38, startup: 8, active: 5, damage: 11, bkb: 24, kbs: 62, angle: 92, hitboxes: [hb(-26, -122, 84, 60)] }),
      dtilt: mv({ name: 'Ground Pound', frames: 34, startup: 7, active: 3, damage: 9, bkb: 20, kbs: 46, angle: 25, hitboxes: [hb(6, -22, 64, 32)] }),
      dashattack: mv({ name: 'Boulder Breaker', frames: 46, startup: 9, active: 13, damage: 14, bkb: 30, kbs: 50, angle: 70, hitboxes: [hb(-4, -92, 74, 84)] }),
      fsmash: mv({ name: 'Continental Punch', frames: 62, startup: 18, active: 5, damage: 23, bkb: 34, kbs: 100, angle: 30, charge: 1, hitboxes: [hb(14, -90, 82, 78)] }),
      usmash: mv({ name: 'Tectonic Rise', frames: 58, startup: 14, active: 5, damage: 20, bkb: 30, kbs: 94, angle: 90, charge: 1, hitboxes: [hb(-38, -130, 108, 78)] }),
      dsmash: mv({ name: 'Seismic Slam', frames: 56, startup: 13, active: 5, damage: 18, bkb: 26, kbs: 88, angle: 20, charge: 1, hitboxes: [hb(-74, -30, 88, 42), hb(20, -30, 88, 42)] }),
      nair: mv({ name: 'Nair', frames: 36, startup: 5, active: 9, damage: 11, bkb: 18, kbs: 56, angle: 45, hitboxes: [hb(-50, -92, 104, 78)] }),
      fair: mv({ name: 'Fair', frames: 42, startup: 9, active: 5, damage: 15, bkb: 22, kbs: 66, angle: 40, hitboxes: [hb(12, -98, 78, 70)] }),
      bair: mv({ name: 'Bair', frames: 40, startup: 8, active: 5, damage: 16, bkb: 24, kbs: 72, angle: 148, hitboxes: [hb(-88, -92, 74, 64)] }),
      uair: mv({ name: 'Uair', frames: 38, startup: 7, active: 5, damage: 13, bkb: 18, kbs: 64, angle: 88, hitboxes: [hb(-40, -136, 84, 64)] }),
      dair: mv({ name: 'Meteor Slam', frames: 44, startup: 11, active: 5, damage: 16, bkb: 20, kbs: 62, angle: 268, hitboxes: [hb(-30, -18, 62, 66)], spike: 1 }),
    },
    specials: {
      neutral: { name: 'FAULTLINE SMASH', desc: 'A wide ground-shaking rune strike', type: 'quake', frames: 48, startup: 10, active: 5, damage: 15, bkb: 26, kbs: 60, angle: 68, hitboxes: [hb(-60, -76, 220, 76)] },
      side: { name: 'BOULDER CRASH', desc: 'A heavy shoulder charge with brief invulnerability', type: 'dash', frames: 52, startup: 12, damage: 16, bkb: 30, kbs: 62, angle: 38, rushSpeed: 10, rushInvuln: 10, dist: 170, active: 14, hitboxes: [hb(-8, -78, 76, 62)] },
      up: { name: 'TITAN RISE', desc: 'Erupting uppercut', type: 'recover', frames: 48, startup: 4, damage: 13, bkb: 22, kbs: 50, angle: 85, rise: 9.8, drift: 3.2 },
      down: { name: 'GUARDIAN STANCE', desc: 'Stone guard + quake', type: 'counter', frames: 46, startup: 1, window: 22, mult: 1.5 },
    },
    finalSmash: { name: 'CONTINENTAL SLAM', type: 'slam', duration: 150, damage: 48 },
    grabRange: 54, throwDmg: { f: 12, b: 14, u: 10, d: 9 },
  },

  /* ---------------- ASTRA ---------------- */
  astra: {
    key: 'astra', artFacing: 1, name: 'ASTRA', title: 'THE STARWEAVER', archetype: 'Floaty Zoner',
    description: 'A hooded star mage with flowing blue hair and golden gauntlets, weaving radiant spells and sweeping comet trails.',
    color: '#c77dff', theme: '#c77dff',
    /* hurtbox, in px at scale 1.  Height tracks the drawn sprite (see the
       hurtbox test in tools/animtest.js): a box shorter than the art is how you get
       "I clearly hit their head and nothing happened". */
    body: { w: 42, h: 101 },
    stats: { weight: 76, walk: 2.1, run: 5.2, air: 3.9, fall: 7.0, fastfall: 11.6, gravity: 0.36, jumps: 3, jumpV: 12.0, djumpV: 10.8, airJumps: 2, size: 0.97, traction: 0.42, airAccel: 0.3, dashFrames: 9 },
    locomotion: 'mage', weapon: 'staff', weaponLen: 52,
    palettes: [
      pal('Violet', '#f6d2b8', '#e8e6ef', '#6b3aa8', '#2a1548', '#c77dff', '#3d2064'),
      pal('Midnight', '#ecc8ac', '#c8d8ef', '#28356e', '#121a3a', '#7aa2ff', '#1a2450'),
      pal('Rose', '#f8d8c4', '#f0d0d8', '#a83a6e', '#4a1030', '#ff7ab8', '#701d44'),
      pal('Aurora', '#f2d8c0', '#d8f0e8', '#2a7058', '#0f3a2c', '#6affc0', '#1a4a3a'),
      pal('Lumen', '#fce4cc', '#ffffff', '#d8c8a0', '#7a6a48', '#ffe08a', '#a89a70'),
      pal('Eclipse', '#c8a890', '#8a8a9a', '#1a1a28', '#08080f', '#ff8a5a', '#12121c'),
    ],
    moves: {
      jab: mv({ name: 'Staff Tap', frames: 24, startup: 3, active: 3, damage: 3, bkb: 8, kbs: 22, angle: 35, hitboxes: [hb(14, -62, 56, 30)] }),
      ftilt: mv({ name: 'Crescent Push', frames: 34, startup: 7, active: 5, damage: 8, bkb: 16, kbs: 46, angle: 35, hitboxes: [hb(16, -72, 66, 48)] }),
      utilt: mv({ name: 'Star Lift', frames: 34, startup: 6, active: 5, damage: 7, bkb: 18, kbs: 52, angle: 95, hitboxes: [hb(-26, -116, 76, 60)] }),
      dtilt: mv({ name: 'Comet Sweep', frames: 30, startup: 5, active: 4, damage: 6, bkb: 14, kbs: 38, angle: 20, hitboxes: [hb(10, -24, 58, 28)] }),
      dashattack: mv({ name: 'Comet Trail', signature: 'comet', frames: 40, startup: 6, active: 11, damage: 9, bkb: 22, kbs: 42, angle: 42, hitboxes: [hb(4, -84, 64, 68)] }),
      fsmash: mv({ name: 'Starfall Arc', frames: 54, startup: 13, active: 5, damage: 15, bkb: 26, kbs: 84, angle: 36, charge: 1, hitboxes: [hb(12, -86, 84, 70)] }),
      usmash: mv({ name: 'Constellation', frames: 50, startup: 10, active: 6, damage: 13, bkb: 24, kbs: 82, angle: 90, charge: 1, hitboxes: [hb(-36, -132, 104, 74)] }),
      dsmash: mv({ name: 'Gravity Well', frames: 50, startup: 10, active: 5, damage: 12, bkb: 22, kbs: 76, angle: 18, charge: 1, hitboxes: [hb(-76, -26, 92, 40), hb(18, -26, 92, 40)] }),
      nair: mv({ name: 'Nair', frames: 32, startup: 4, active: 9, damage: 7, bkb: 12, kbs: 46, angle: 45, hitboxes: [hb(-44, -82, 92, 68)] }),
      fair: mv({ name: 'Fair', frames: 36, startup: 7, active: 5, damage: 10, bkb: 16, kbs: 56, angle: 40, hitboxes: [hb(12, -88, 74, 60)] }),
      bair: mv({ name: 'Bair', frames: 34, startup: 6, active: 4, damage: 11, bkb: 18, kbs: 62, angle: 150, hitboxes: [hb(-80, -82, 68, 56)] }),
      uair: mv({ name: 'Uair', frames: 32, startup: 5, active: 6, damage: 8, bkb: 12, kbs: 52, angle: 88, hitboxes: [hb(-36, -124, 76, 58)] }),
      dair: mv({ name: 'Star Spike', frames: 38, startup: 8, active: 5, damage: 11, bkb: 16, kbs: 54, angle: 265, hitboxes: [hb(-26, -18, 56, 62)], spike: 1 }),
    },
    specials: {
      neutral: { name: 'STARFALL TRIO', desc: 'Call three falling stars ahead of you', type: 'starfall', frames: 50, startup: 8, damage: 4, bkb: 8, kbs: 25, angle: 60, cooldown: 32 },
      side: { name: 'COMET RUSH', desc: 'A floating dash with a star trail', type: 'dash', frames: 46, startup: 9, damage: 10, bkb: 22, kbs: 52, angle: 42, rushSpeed: 11, dist: 165, float: 1, active: 14, hitboxes: [hb(-2, -72, 62, 56)] },
      up: { name: 'STAR BLINK', desc: 'Teleport recovery', type: 'teleport', frames: 40, startup: 8, damage: 8, bkb: 16, kbs: 40, angle: 80, dist: 210 },
      down: { name: 'GRAVITY ORB', desc: 'Pulling void orb', type: 'orb', frames: 46, startup: 12, damage: 2, bkb: 4, kbs: 6, angle: 90, cooldown: 40 },
    },
    finalSmash: { name: 'CONSTELLATION NOVA', type: 'rain', duration: 160, damage: 40 },
    grabRange: 44, throwDmg: { f: 7, b: 9, u: 6, d: 5 },
  },

  /* ---------------- VESPER ---------------- */
  vesper: {
    key: 'vesper', artFacing: 1, name: 'VESPER', title: 'THE SHADE', archetype: 'Rushdown',
    description: 'A masked shadow fighter in dark armor and a bright blue scarf, striking with lightning-fast blue energy blades.',
    color: '#2fd6bb', theme: '#2fd6bb',
    /* hurtbox, in px at scale 1.  Height tracks the drawn sprite (see the
       hurtbox test in tools/animtest.js): a box shorter than the art is how you get
       "I clearly hit their head and nothing happened". */
    body: { w: 40, h: 100 },
    stats: { weight: 72, walk: 2.9, run: 8.0, air: 5.7, fall: 11.2, fastfall: 18.4, gravity: 0.61, jumps: 2, jumpV: 12.2, djumpV: 11.6, airJumps: 1, size: 0.94, traction: 0.6, airAccel: 0.4, dashFrames: 8 },
    locomotion: 'ninja', weapon: 'daggers', weaponLen: 26,
    palettes: [
      pal('Jade', '#e8c0a0', '#1a2a26', '#1f6b5c', '#0d2a24', '#2fd6bb', '#12443a'),
      pal('Crimson', '#e8bc98', '#2a1214', '#8a2030', '#3a0c12', '#ff5a6a', '#511018'),
      pal('Indigo', '#dcc0b0', '#1a1a2e', '#343a86', '#14163a', '#7a8aff', '#20245c'),
      pal('Dune', '#f0d0a8', '#3a2a18', '#a88a4a', '#4a3a1a', '#ffd06a', '#6a5426'),
      pal('Onyx', '#b89880', '#0c0c10', '#1c1c22', '#0a0a0e', '#9a9aaa', '#101014'),
      pal('Frost', '#f2dcc8', '#d8e8f0', '#7ab8a8', '#2a4a44', '#a8fff0', '#3a6a60'),
    ],
    moves: {
      jab: mv({ name: 'Dagger Flurry', frames: 18, startup: 2, active: 2, damage: 2, bkb: 6, kbs: 18, angle: 32, hitboxes: [hb(10, -56, 40, 26)], multi: 1 }),
      ftilt: mv({ name: 'Cross Slash', frames: 26, startup: 4, active: 3, damage: 7, bkb: 14, kbs: 44, angle: 34, hitboxes: [hb(12, -64, 50, 40)] }),
      utilt: mv({ name: 'Fan Kick', frames: 26, startup: 4, active: 4, damage: 6, bkb: 14, kbs: 48, angle: 92, hitboxes: [hb(-22, -108, 68, 52)] }),
      dtilt: mv({ name: 'Low Sting', frames: 24, startup: 3, active: 3, damage: 5, bkb: 12, kbs: 34, angle: 16, hitboxes: [hb(10, -22, 46, 26)] }),
      dashattack: mv({ name: 'Shredding Dash', frames: 34, startup: 4, active: 10, damage: 3, bkb: 2, kbs: 2, angle: 70, multi: 1, finish: { damage: 6, bkb: 18, kbs: 40, angle: 46 }, hitboxes: [hb(2, -80, 58, 62)] }),
      fsmash: mv({ name: 'Twin Fang', frames: 44, startup: 9, active: 4, damage: 13, bkb: 24, kbs: 84, angle: 32, charge: 1, hitboxes: [hb(10, -70, 62, 52)] }),
      usmash: mv({ name: 'Viper Rise', frames: 42, startup: 8, active: 5, damage: 12, bkb: 22, kbs: 80, angle: 88, charge: 1, hitboxes: [hb(-30, -118, 84, 62)] }),
      dsmash: mv({ name: 'Low Twin Slash', frames: 42, startup: 8, active: 4, damage: 11, bkb: 20, kbs: 76, angle: 20, charge: 1, hitboxes: [hb(-62, -24, 76, 36), hb(14, -24, 76, 36)] }),
      nair: mv({ name: 'Nair', frames: 26, startup: 3, active: 8, damage: 7, bkb: 12, kbs: 44, angle: 45, hitboxes: [hb(-40, -74, 80, 60)] }),
      fair: mv({ name: 'Fair', frames: 28, startup: 4, active: 4, damage: 9, bkb: 14, kbs: 52, angle: 40, hitboxes: [hb(10, -78, 58, 50)] }),
      bair: mv({ name: 'Bair', frames: 26, startup: 4, active: 4, damage: 10, bkb: 16, kbs: 58, angle: 148, hitboxes: [hb(-66, -74, 58, 48)] }),
      uair: mv({ name: 'Uair', frames: 26, startup: 3, active: 5, damage: 7, bkb: 10, kbs: 48, angle: 88, hitboxes: [hb(-30, -112, 64, 52)] }),
      dair: mv({ name: 'Kunai Spike', frames: 32, startup: 6, active: 4, damage: 10, bkb: 14, kbs: 50, angle: 265, hitboxes: [hb(-22, -16, 46, 56)], spike: 1 }),
    },
    specials: {
      // The last strike paints a long energy blade. Its box is live only with
      // that frame; earlier flurry hits keep a shorter, close-range reach.
      neutral: { name: 'VIPER FLURRY', desc: 'Three rapid blade strikes ending in a launcher', type: 'flurry', frames: 40, startup: 4, active: 13, damage: 2, bkb: 2, kbs: 2, angle: 70, multi: 2, rehit: 5, finishAt: 10, finish: { damage: 5, bkb: 16, kbs: 44, angle: 78 }, hitboxes: [hb(4, -78, 109, 64, 0, 9), hb(4, -94, 394, 87, 10, 12)] },
      side: { name: 'SHADOWSTEP DASH', desc: 'Blink through foes', type: 'teleport', frames: 40, startup: 6, damage: 9, bkb: 20, kbs: 48, angle: 40, dist: 190 },
      up: { name: 'VIPER ASCENDANT', desc: 'Rising kick', type: 'recover', frames: 38, startup: 3, damage: 8, bkb: 16, kbs: 44, angle: 82, rise: 9.4, drift: 4.6 },
      down: { name: 'SMOKE COUNTER', desc: 'Counter + smoke', type: 'counter', frames: 38, startup: 1, window: 18, mult: 1.25 },
    },
    finalSmash: { name: 'THOUSAND CUTS', type: 'clones', duration: 150, damage: 45 },
    grabRange: 42, throwDmg: { f: 6, b: 8, u: 5, d: 5 },
  },

  /* ---------------- ROOK ---------------- */
  rook: {
    key: 'rook', artFacing: 1, name: 'ROOK', title: 'THE RIFT BRAWLER', archetype: 'Projectile Zoner',
    description: 'A red-scarved martial artist with wrapped fists, unleashing rapid punches, sweeping kicks, and blue energy blasts.',
    color: '#f05c4d', theme: '#f05c4d',
    /* hurtbox, in px at scale 1.  Height tracks the drawn sprite (see the
       hurtbox test in tools/animtest.js): a box shorter than the art is how you get
       "I clearly hit their head and nothing happened". */
    body: { w: 48, h: 103 },
    stats: { weight: 94, walk: 2.3, run: 5.8, air: 4.1, fall: 11.0, fastfall: 17.6, gravity: 0.58, jumps: 2, jumpV: 12.4, djumpV: 11.6, airJumps: 1, size: 1.04, traction: 0.5, airAccel: 0.32, dashFrames: 10 },
    locomotion: 'gunner', weapon: 'rifle', weaponLen: 54,
    palettes: [
      pal('Scarlet', '#e0b898', '#2a2018', '#9a2834', '#2a1920', '#f05c4d', '#142e26'),
      pal('Rust', '#e8c0a0', '#3a2418', '#8a4a2a', '#4a2410', '#ffa04a', '#5c3018'),
      pal('Bone', '#f0d8c0', '#e8e2d8', '#c8bfa8', '#8a8270', '#fff0c0', '#a89e88'),
      pal('Royal', '#e8c4a4', '#1a1a30', '#2a3a8a', '#141c4a', '#6a9aff', '#1c2858'),
      pal('Blood', '#e4b898', '#2a1010', '#8a1a22', '#3a080c', '#ff5a4a', '#4e0e14'),
      pal('Onyx', '#c0a088', '#14141a', '#1e2228', '#0c0e12', '#ffd23a', '#101318'),
    ],
    moves: {
      jab: mv({ name: 'Rapid Fists', frames: 24, startup: 3, active: 3, damage: 2, bkb: 2, kbs: 2, angle: 70, multi: 2, finish: { damage: 4, bkb: 12, kbs: 32, angle: 48 }, hitboxes: [hb(12, -62, 54, 32)] }),
      ftilt: mv({ name: 'Sweeping Strike', frames: 32, startup: 6, active: 4, damage: 8, bkb: 16, kbs: 48, angle: 33, hitboxes: [hb(14, -70, 62, 44)] }),
      utilt: mv({ name: 'Rising Uppercut', frames: 32, startup: 5, active: 5, damage: 7, bkb: 18, kbs: 54, angle: 94, hitboxes: [hb(-24, -114, 74, 56)] }),
      dtilt: mv({ name: 'Low Shot', frames: 30, startup: 5, active: 4, damage: 6, bkb: 14, kbs: 38, angle: 18, hitboxes: [hb(12, -24, 56, 28)] }),
      dashattack: mv({ name: 'Rift Slide Kick', frames: 38, startup: 6, active: 11, damage: 9, bkb: 20, kbs: 44, angle: 76, hitboxes: [hb(4, -84, 66, 70)] }),
      fsmash: mv({ name: 'Charged Hex Blast', frames: 56, startup: 15, active: 5, damage: 16, bkb: 28, kbs: 86, angle: 34, charge: 1, hitboxes: [hb(10, -78, 92, 66)] }),
      usmash: mv({ name: 'Rune Pillar', frames: 50, startup: 11, active: 6, damage: 13, bkb: 24, kbs: 84, angle: 90, charge: 1, hitboxes: [hb(-30, -128, 96, 76)] }),
      dsmash: mv({ name: 'Trap Burst', frames: 50, startup: 11, active: 5, damage: 12, bkb: 22, kbs: 78, angle: 18, charge: 1, hitboxes: [hb(-70, -24, 88, 38), hb(18, -24, 88, 38)] }),
      nair: mv({ name: 'Nair', frames: 32, startup: 4, active: 9, damage: 8, bkb: 12, kbs: 48, angle: 45, hitboxes: [hb(-44, -80, 92, 66)] }),
      fair: mv({ name: 'Fair', frames: 36, startup: 7, active: 5, damage: 10, bkb: 16, kbs: 58, angle: 40, hitboxes: [hb(12, -86, 76, 60)] }),
      bair: mv({ name: 'Bair', frames: 34, startup: 6, active: 4, damage: 11, bkb: 18, kbs: 64, angle: 148, hitboxes: [hb(-82, -80, 70, 54)] }),
      uair: mv({ name: 'Uair', frames: 32, startup: 5, active: 6, damage: 8, bkb: 12, kbs: 50, angle: 88, hitboxes: [hb(-34, -120, 74, 56)] }),
      dair: mv({ name: 'Falling Fist', frames: 38, startup: 8, active: 5, damage: 11, bkb: 16, kbs: 54, angle: 264, hitboxes: [hb(-24, -16, 52, 60)], spike: 1 }),
    },
    specials: {
      neutral: { name: 'RIFT FIST COMBO', desc: 'A rapid punch combination with a heavy finish', type: 'punchcombo', frames: 44, startup: 5, active: 13, damage: 3, bkb: 2, kbs: 2, angle: 70, multi: 2, rehit: 5, finish: { damage: 6, bkb: 20, kbs: 50, angle: 48 }, hitboxes: [hb(6, -76, 110, 60)] },
      side: { name: 'RIFT RISING', desc: 'An advancing rising strike that launches foes', type: 'risingdash', frames: 44, startup: 5, active: 12, damage: 11, bkb: 22, kbs: 55, angle: 82, dist: 115, hitboxes: [hb(4, -92, 70, 80)] },
      up: { name: 'DRONE GRAPPLE', desc: 'Drone-assisted rising boost', type: 'recover', frames: 44, startup: 5, damage: 6, bkb: 12, kbs: 34, angle: 84, rise: 8.6, drift: 5.4 },
      down: { name: 'RUNE MINE', desc: 'Placed proximity trap', type: 'mine', frames: 40, startup: 12, damage: 11, bkb: 20, kbs: 52, angle: 60, cooldown: 44 },
    },
    finalSmash: { name: 'HEX BARRAGE', type: 'bullethell', duration: 160, damage: 44 },
    grabRange: 48, throwDmg: { f: 8, b: 10, u: 7, d: 6 },
  },
};

/* MARROW — a spectral halberd fighter with a deliberate, heavy moveset. */
FIGHTERS.marrow = {
  key:'marrow', artFacing:1, name:'MARROW', title:'THE HOLLOW KNIGHT', archetype:'Heavy / Sustain',
  description:'A skull-helmed spectral knight in indigo armor, wielding a violet crescent halberd beneath a tattered purple cape.',
  color:'#c47aff', theme:'#c47aff', body:{w:52,h:116},
  stats:{weight:126,walk:2.0,run:5.2,air:3.7,fall:12.0,fastfall:19.2,gravity:.69,jumps:2,jumpV:12.5,djumpV:11.4,airJumps:1,size:1.12,traction:.52,airAccel:.28,dashFrames:12},
  locomotion:'brute', weapon:'sword', weaponLen:60,
  palettes:[
    pal('Spectral','#e5dcc9','#1c1630','#26294d','#433270','#c47aff','#1b1b36'),
    pal('Glacier','#ddeaf2','#253049','#355784','#a3d5e6','#77dfff','#1b344e'),
    pal('Thorn','#d1d4bd','#1d3027','#35604d','#98caa1','#80e3a2','#1c3c30'),
    pal('Crimson','#e3c9c2','#341c2d','#6b263c','#c36a7e','#ff6484','#401927'),
    pal('Gilded','#e9d9ad','#372d25','#6e5833','#d5bd7b','#ffd777','#463519'),
    pal('Obsidian','#aaa8b5','#14131b','#272633','#555163','#cab8ff','#17151f')
  ],
  moves:{
    jab:mv({name:'Hollow Jabs',frames:26,startup:4,active:3,damage:4,bkb:9,kbs:25,angle:38,hitboxes:[hb(12,-67,60,38)]}),
    ftilt:mv({name:'Halberd Sweep',frames:39,startup:8,active:5,damage:11,bkb:20,kbs:55,angle:38,hitboxes:[hb(12,-86,80,60)]}),
    utilt:mv({name:'Crescent Lift',frames:37,startup:7,active:5,damage:10,bkb:21,kbs:57,angle:92,hitboxes:[hb(-26,-125,88,68)]}),
    dtilt:mv({name:'Grave Sweep',frames:34,startup:6,active:4,damage:8,bkb:16,kbs:43,angle:20,hitboxes:[hb(8,-28,76,38)]}),
    dashattack:mv({name:'Wraith Lunge',frames:43,startup:8,active:11,damage:12,bkb:25,kbs:50,angle:52,hitboxes:[hb(0,-88,78,70)]}),
    fsmash:mv({name:'Soul Splitter',frames:59,startup:15,active:5,damage:20,bkb:31,kbs:96,angle:34,charge:1,hitboxes:[hb(12,-91,96,76)]}),
    usmash:mv({name:'Grave Ascent',frames:55,startup:12,active:5,damage:18,bkb:28,kbs:90,angle:90,charge:1,hitboxes:[hb(-38,-136,105,78)]}),
    dsmash:mv({name:'Phantom Circle',frames:52,startup:11,active:5,damage:16,bkb:24,kbs:83,angle:22,charge:1,hitboxes:[hb(-76,-33,90,44),hb(18,-33,90,44)]}),
    nair:mv({name:'Spectral Wheel',frames:35,startup:5,active:8,damage:9,bkb:15,kbs:51,angle:45,hitboxes:[hb(-48,-90,102,76)]}),
    fair:mv({name:'Crescent Air',frames:40,startup:8,active:5,damage:13,bkb:20,kbs:62,angle:40,hitboxes:[hb(12,-96,82,68)]}),
    bair:mv({name:'Back Reaper',frames:38,startup:7,active:5,damage:14,bkb:22,kbs:68,angle:148,hitboxes:[hb(-92,-92,78,64)]}),
    uair:mv({name:'Soul Lift',frames:36,startup:6,active:5,damage:11,bkb:17,kbs:60,angle:88,hitboxes:[hb(-38,-131,82,64)]}),
    dair:mv({name:'Gravefall',frames:42,startup:10,active:5,damage:14,bkb:19,kbs:60,angle:268,spike:1,hitboxes:[hb(-28,-18,60,66)]})
  },
  specials:{
    neutral:{name:'SOUL REAP',desc:'Hold G, release a spectral blast (up to 2x damage); clean hits heal 2%',type:'soulreap',frames:46,startup:9,active:5,damage:11,bkb:22,kbs:48,angle:55,cooldown:28,chargeFrames:60,chargeMax:2,projectileSpeed:12,projectileLife:70,healOnHit:2},
    side:{name:'WRAITH CHARGE',desc:'A committed forward halberd rush',type:'dash',frames:45,startup:8,active:14,damage:13,bkb:26,kbs:58,angle:52,rushSpeed:11,dist:150,hitboxes:[hb(4,-85,78,72)]},
    up:{name:'GRAVE ASCENT',desc:'Rise with a full-circle spectral axe sweep',type:'recover',frames:42,startup:3,active:20,damage:10,bkb:19,kbs:47,angle:82,rise:11.75,drift:3.8,spinAxe:true,hitboxes:[hb(-78,-120,156,112)]},
    down:{name:'HOLLOW GUARD',desc:'Counter an incoming strike',type:'counter',frames:40,startup:1,window:19,mult:1.4}
  },
  finalSmash:{name:'HOLLOW REQUIEM',type:'spin',duration:150,damage:45},
  grabRange:50,throwDmg:{f:9,b:11,u:8,d:7}
};
/* TIDE — swift knife pressure and protective ocean magic. */
FIGHTERS.tide = {
  key:'tide', artFacing:1, name:'TIDE', title:'THE WAVE WARDEN', archetype:'Mobile / Counter',
  description:'A swift ocean warden in turquoise shell armor, wielding a curved wave knife and the power of the sea.',
  color:'#48d7df', theme:'#48d7df', body:{w:44,h:102},
  stats:{weight:94,walk:2.5,run:6.7,air:4.8,fall:10.8,fastfall:17.2,gravity:.56,jumps:2,jumpV:12.8,djumpV:11.8,airJumps:1,size:1,traction:.53,airAccel:.35,dashFrames:10},
  locomotion:'humanoid', weapon:'sword', weaponLen:42,
  palettes:[
    pal('Ocean','#d69670','#152936','#168a9b','#ef9d83','#48d7df','#15546b'),
    pal('Coral','#d69670','#152936','#bb5b61','#ffd1b7','#ff8c86','#72373e'),
    pal('Lagoon','#d69670','#152936','#367d63','#b8ddba','#73e2b3','#264d42'),
    pal('Pearl','#d69670','#152936','#a39fbc','#f3dbe3','#dcbaff','#5f576f'),
    pal('Sunset','#d69670','#152936','#ab7339','#ffe0a0','#ffd174','#664522'),
    pal('Deep Sea','#b77d63','#111c28','#1c344d','#5a8093','#8cbde5','#101f31')
  ],
  moves:{
    jab:mv({name:'Shell Prick',frames:22,startup:3,active:3,damage:3,bkb:8,kbs:24,angle:35,hitboxes:[hb(12,-62,48,36)]}),
    ftilt:mv({name:'Wave Cut',frames:31,startup:5,active:4,damage:8,bkb:18,kbs:50,angle:38,hitboxes:[hb(14,-75,65,52)]}),
    utilt:mv({name:'Crest Lift',frames:31,startup:5,active:5,damage:8,bkb:18,kbs:52,angle:92,hitboxes:[hb(-25,-115,75,58)]}),
    dtilt:mv({name:'Ebb Sweep',frames:28,startup:4,active:4,damage:7,bkb:14,kbs:40,angle:20,hitboxes:[hb(12,-30,58,35)]}),
    dashattack:mv({name:'Riptide Rush',frames:36,startup:6,active:10,damage:10,bkb:22,kbs:48,angle:50,hitboxes:[hb(3,-77,68,65)]}),
    fsmash:mv({name:'Breaker Blade',frames:49,startup:12,active:5,damage:15,bkb:27,kbs:84,angle:36,charge:1,hitboxes:[hb(14,-82,82,62)]}),
    usmash:mv({name:'High Tide',frames:46,startup:10,active:5,damage:14,bkb:25,kbs:80,angle:88,charge:1,hitboxes:[hb(-30,-122,84,68)]}),
    dsmash:mv({name:'Undercurrent',frames:45,startup:9,active:5,damage:12,bkb:22,kbs:75,angle:22,charge:1,hitboxes:[hb(-62,-30,76,38),hb(14,-30,76,38)]}),
    nair:mv({name:'Sea Circle',frames:31,startup:4,active:8,damage:8,bkb:14,kbs:48,angle:45,hitboxes:[hb(-43,-78,90,64)]}),
    fair:mv({name:'Foam Edge',frames:34,startup:6,active:5,damage:10,bkb:17,kbs:58,angle:40,hitboxes:[hb(12,-85,70,60)]}),
    bair:mv({name:'Backwash',frames:34,startup:6,active:4,damage:11,bkb:19,kbs:62,angle:148,hitboxes:[hb(-80,-80,68,55)]}),
    uair:mv({name:'Crest Arc',frames:31,startup:5,active:5,damage:9,bkb:15,kbs:55,angle:88,hitboxes:[hb(-34,-120,72,58)]}),
    dair:mv({name:'Diving Edge',frames:37,startup:8,active:5,damage:11,bkb:17,kbs:54,angle:268,spike:1,hitboxes:[hb(-24,-18,52,60)]})
  },
  specials:{
    neutral:{name:'TIDAL WAVE',desc:'Hold G, then release a traveling wave; each second held gives 2 seconds of wave',type:'tidewave',frames:40,startup:7,active:6,damage:2,bkb:16,kbs:20,angle:20,chargeFrames:300,waveLifeMultiplier:2,minWaveLife:18,waveSpeed:5,rehit:12},
    side:{name:'SURGE STEP',desc:'Rush forward through the surf with a knife strike',type:'dash',frames:42,startup:6,active:13,damage:11,bkb:22,kbs:53,angle:52,rushSpeed:13,dist:155,hitboxes:[hb(4,-72,66,58)]},
    up:{name:'GEYSER LEAP',desc:'Summon a looping wave that lifts you into the air',type:'recover',frames:52,startup:15,active:8,damage:9,bkb:17,kbs:46,angle:82,rise:9.8,drift:4.5,hitboxes:[hb(-48,-105,96,90)]},
    down:{name:'OCEAN GUARDIAN',desc:'Call the guardian to counter an incoming strike',type:'counter',frames:42,startup:1,window:20,mult:1.35}
  },
  finalSmash:{name:'OCEAN TEMPEST',type:'spin',duration:150,damage:43},
  grabRange:44,throwDmg:{f:7,b:9,u:7,d:6}
};
/* VECTOR — rocket-armed cyborg with a lock-on projectile game. */
FIGHTERS.vector = {
  key:'vector', artFacing:1, name:'VECTOR', title:'THE HUNTER PROTOCOL', archetype:'Tech / Zoner',
  description:'A relentless cybernetic hunter with a burning visor, thrusters, and shoulder-mounted tracking missiles.',
  color:'#ff963e', theme:'#ff963e', body:{w:48,h:111},
  stats:{weight:108,walk:2.2,run:6.0,air:4.2,fall:11.5,fastfall:18.5,gravity:.61,jumps:2,jumpV:12.3,djumpV:11.6,airJumps:1,size:1.03,traction:.53,airAccel:.32,dashFrames:10},
  locomotion:'humanoid', weapon:'fists', weaponLen:0,
  palettes:[
    pal('Hunter','#343b48','#111621','#252b36','#4b5461','#ff963e','#151b24'),
    pal('Ion','#343b48','#111621','#28384f','#697c94','#6cc8ff','#182638'),
    pal('Toxic','#343b48','#111621','#344132','#798e66','#a9ef57','#202a20'),
    pal('Overheat','#343b48','#111621','#532d32','#9c5961','#ff5a69','#301a20'),
    pal('Gold','#343b48','#111621','#51462c','#a3946b','#f7cf69','#2c271c'),
    pal('Shadow','#343b48','#111621','#171b25','#485169','#b8a9ff','#0e1119')
  ],
  moves:{
    jab:mv({name:'Servo Jab',frames:23,startup:3,active:3,damage:4,bkb:8,kbs:25,angle:35,hitboxes:[hb(13,-64,52,36)]}),
    ftilt:mv({name:'Plasma Claw',frames:34,startup:7,active:4,damage:9,bkb:19,kbs:51,angle:38,hitboxes:[hb(16,-78,68,53)]}),
    utilt:mv({name:'Rising Servo',frames:34,startup:6,active:5,damage:8,bkb:18,kbs:52,angle:90,hitboxes:[hb(-24,-119,76,64)]}),
    dtilt:mv({name:'Low Circuit',frames:30,startup:5,active:4,damage:7,bkb:16,kbs:42,angle:20,hitboxes:[hb(12,-30,64,36)]}),
    dashattack:mv({name:'Jet Tackle',frames:38,startup:6,active:10,damage:10,bkb:23,kbs:49,angle:48,hitboxes:[hb(2,-78,72,64)]}),
    fsmash:mv({name:'Reactor Slash',frames:52,startup:13,active:5,damage:17,bkb:30,kbs:88,angle:35,charge:1,hitboxes:[hb(15,-80,78,65)]}),
    usmash:mv({name:'Skybreaker',frames:49,startup:11,active:5,damage:15,bkb:25,kbs:82,angle:88,charge:1,hitboxes:[hb(-29,-126,84,68)]}),
    dsmash:mv({name:'Overload Sweep',frames:47,startup:10,active:4,damage:13,bkb:24,kbs:76,angle:22,charge:1,hitboxes:[hb(-62,-31,76,37),hb(14,-31,76,37)]}),
    nair:mv({name:'Reactor Spin',frames:32,startup:4,active:8,damage:8,bkb:14,kbs:48,angle:45,hitboxes:[hb(-45,-82,94,68)]}),
    fair:mv({name:'Forward Slash',frames:35,startup:7,active:5,damage:11,bkb:18,kbs:59,angle:40,hitboxes:[hb(13,-87,73,58)]}),
    bair:mv({name:'Reverse Claw',frames:34,startup:6,active:4,damage:11,bkb:20,kbs:62,angle:148,hitboxes:[hb(-82,-82,70,56)]}),
    uair:mv({name:'Upward Claw',frames:32,startup:5,active:5,damage:9,bkb:15,kbs:54,angle:88,hitboxes:[hb(-34,-122,76,59)]}),
    dair:mv({name:'Crash Drive',frames:38,startup:8,active:5,damage:12,bkb:18,kbs:55,angle:268,spike:1,hitboxes:[hb(-25,-18,54,62)]})
  },
  specials:{
    neutral:{name:'HUNTER MISSILES',desc:'Launch two missiles that curve toward nearby opponents',type:'huntermissiles',frames:48,startup:10,active:8,damage:6,bkb:16,kbs:43,angle:45,cooldown:50,missileSpeed:8.5,missileLife:90},
    side:{name:'OVERDRIVE RUSH',desc:'Back-mounted rockets thrust Vector forward in a shoulder charge',type:'dash',rocketRush:true,frames:46,startup:8,active:13,damage:12,bkb:25,kbs:56,angle:42,rushSpeed:13,dist:160,hitboxes:[hb(2,-78,70,64)]},
    up:{name:'ROCKET BOOST',desc:'Fire shoulder rockets downward to rise; impacts deal splash damage',type:'recover',frames:46,startup:5,active:16,damage:9,bkb:18,kbs:45,angle:85,rise:10.4,drift:4.3,rocketBoost:true,rocketRadius:70},
    down:{name:'TARGET LOCK',desc:'Scan a nearby opponent; the next missile volley tracks them more sharply',type:'targetlock',frames:43,startup:12,active:3,cooldown:50,range:550,lockDuration:240}
  },
  finalSmash:{name:'REDLINE BARRAGE',type:'barrage',duration:150,damage:48},
  grabRange:46,throwDmg:{f:8,b:10,u:8,d:7}
};

/* BRIAR — a swift forest guardian with a long vine and earth magic. */
FIGHTERS.briar = {
  key:'briar', artFacing:1, name:'BRIAR', title:'THE WILDWARDEN', archetype:'Range / Mobility',
  description:'A fierce forest guardian who lashes with living vines and raises jagged earth beneath her foes.',
  color:'#b4e65f', theme:'#83b842', body:{w:42,h:105},
  stats:{weight:94,walk:2.5,run:6.3,air:4.7,fall:11,fastfall:18,gravity:.57,jumps:2,jumpV:12.6,djumpV:11.9,airJumps:1,size:1,traction:.54,airAccel:.34,dashFrames:10},
  locomotion:'humanoid', weapon:'fists', weaponLen:0,
  palettes:[
    pal('Wildwood','#c58f66','#fff1c6','#335b25','#658c39','#b4e65f','#263d20'),
    pal('Autumn','#c58f66','#fff1c6','#89502c','#c3823f','#ffcb64','#593b26'),
    pal('Moonleaf','#c58f66','#fff1c6','#34506e','#7796a7','#9ddfff','#273749'),
    pal('Bloom','#c58f66','#fff1c6','#773f59','#c17a95','#ffb5cb','#4b2e3b'),
    pal('Golden','#c58f66','#fff1c6','#70602b','#bda84e','#f5df76','#494022'),
    pal('Nightshade','#c58f66','#fff1c6','#36334f','#746687','#d7a7ff','#292638')
  ],
  moves:{
    jab:mv({name:'Bramble Tap',frames:22,startup:3,active:3,damage:4,bkb:8,kbs:25,angle:35,hitboxes:[hb(12,-64,52,35)]}),
    ftilt:mv({name:'Vine Flick',frames:33,startup:6,active:5,damage:8,bkb:16,kbs:49,angle:38,hitboxes:[hb(15,-76,83,50)]}),
    utilt:mv({name:'Branch Rise',frames:32,startup:6,active:5,damage:8,bkb:17,kbs:50,angle:90,hitboxes:[hb(-24,-122,75,68)]}),
    dtilt:mv({name:'Root Sweep',frames:29,startup:5,active:4,damage:7,bkb:14,kbs:42,angle:20,hitboxes:[hb(10,-32,72,38)]}),
    dashattack:mv({name:'Thorn Rush',frames:36,startup:6,active:9,damage:10,bkb:21,kbs:49,angle:45,hitboxes:[hb(0,-75,70,60)]}),
    fsmash:mv({name:'Wild Lash',frames:50,startup:12,active:5,damage:15,bkb:27,kbs:82,angle:35,charge:1,hitboxes:[hb(14,-78,105,60)]}),
    usmash:mv({name:'Canopy Break',frames:48,startup:11,active:5,damage:14,bkb:25,kbs:80,angle:88,charge:1,hitboxes:[hb(-30,-128,84,72)]}),
    dsmash:mv({name:'Bramble Sweep',frames:47,startup:10,active:5,damage:13,bkb:23,kbs:75,angle:22,charge:1,hitboxes:[hb(-70,-32,80,40),hb(12,-32,80,40)]}),
    nair:mv({name:'Leaf Spiral',frames:32,startup:4,active:8,damage:8,bkb:14,kbs:46,angle:45,hitboxes:[hb(-46,-82,94,68)]}),
    fair:mv({name:'Vine Snap',frames:34,startup:7,active:5,damage:10,bkb:18,kbs:58,angle:40,hitboxes:[hb(12,-84,83,58)]}),
    bair:mv({name:'Reverse Thorn',frames:34,startup:6,active:5,damage:10,bkb:20,kbs:60,angle:148,hitboxes:[hb(-88,-82,76,56)]}),
    uair:mv({name:'Canopy Reach',frames:32,startup:5,active:5,damage:9,bkb:15,kbs:52,angle:88,hitboxes:[hb(-34,-122,76,60)]}),
    dair:mv({name:'Root Drop',frames:38,startup:8,active:5,damage:11,bkb:18,kbs:53,angle:268,spike:1,hitboxes:[hb(-26,-18,55,62)]})
  },
  specials:{
    neutral:{name:'VINE WHIP',desc:'Snap a long vine straight ahead',type:'vinelash',frames:48,startup:11,active:5,damage:10,bkb:18,kbs:53,angle:38,hitboxes:[hb(20,-75,270,54)]},
    side:{name:'BRAMBLE GRAPPLE',desc:'Dash with a vine that grabs, lifts and slams an opponent',type:'vinedash',frames:62,startup:7,active:13,damage:13,bkb:24,kbs:64,angle:65,rushSpeed:13,dist:155,vineReach:140,slamTicks:20},
    up:{name:'CANOPY LEAP',desc:'Shoot vines upward; tether and pull to nearby ledges offstage',type:'recover',frames:43,startup:4,active:15,damage:8,bkb:16,kbs:45,angle:82,rise:10.5,drift:4.5,leafRise:true,vineTether:true,tetherRange:351,queueRecoveryJump:true,hitboxes:[hb(-40,-98,80,85)]},
    down:{name:'EARTH SPIKE',desc:'Erupt jagged spikes around Briar',type:'earthspike',frames:47,startup:12,active:6,damage:14,bkb:24,kbs:72,angle:82,hitboxes:[hb(-88,-108,176,115)]}
  },
  finalSmash:{name:'WILD OVERGROWTH',type:'grove',duration:135,damage:44},
  grabRange:48,throwDmg:{f:7,b:9,u:8,d:7}
};

/* NOMAD — a caped frontier gunner with a grappling-hook recovery. */
FIGHTERS.nomad = {
  key:'nomad', artFacing:1, name:'NOMAD', title:'THE RIFT RANGER', archetype:'Ranged / Mobility',
  description:'A wandering armored gunner who fires rapid bolts, strikes with his rifle and hooks distant ledges.',
  color:'#65caff', theme:'#d5a16a', body:{w:46,h:108},
  stats:{weight:99,walk:2.3,run:6.1,air:4.4,fall:11.2,fastfall:18,gravity:.59,jumps:2,jumpV:12.4,djumpV:11.8,airJumps:1,size:1,traction:.54,airAccel:.33,dashFrames:10},
  locomotion:'humanoid',weapon:'fists',weaponLen:0,
  palettes:[
    pal('Frontier','#c59b6a','#f7d6a0','#3b3435','#a47a55','#65caff','#241e24'),
    pal('Arctic','#b6cbd6','#e6f6ff','#344a5d','#798fa1','#8debff','#202f41'),
    pal('Ember','#c59b6a','#f4c5a2','#51343a','#a36754','#ff835d','#302127'),
    pal('Forest','#abb593','#e3e9c5','#334b3b','#748967','#b3e780','#202d26'),
    pal('Dusk','#b8a7c3','#e9d9ef','#42344c','#806d8e','#d6a5ff','#272132'),
    pal('Shadow','#999eaa','#d9dbe1','#252b36','#596574','#9dbbff','#161b22')
  ],
  // Independent copies: the tuning pass replaces these without altering Vector.
  moves:Object.fromEntries(Object.entries(FIGHTERS.vector.moves).map(([k,v])=>[k,{...v,name:({jab:'Rifle Jab',ftilt:'Rifle Sweep',utilt:'Rising Strike',dtilt:'Low Sweep',dashattack:'Frontier Rush',fsmash:'Heavy Rifle',usmash:'Sky Strike',dsmash:'Ground Sweep',nair:'Aerial Sweep',fair:'Forward Strike',bair:'Reverse Strike',uair:'Overhead Strike',dair:'Falling Strike'})[k]}])),
  specials:{
    neutral:{name:'RAPID FIRE',desc:'Hold G to fire a stream of fast energy shots',type:'rapidfire',frames:27,startup:4,active:1,damage:2.5,bkb:4,kbs:17,angle:12,shotInterval:6,projectileSpeed:18,projectileLife:50},
    side:{name:'RIFLE RUSH',desc:'Dash forward and strike with the rifle',type:'dash',gunRush:true,frames:44,startup:7,active:11,damage:12,bkb:24,kbs:58,angle:42,rushSpeed:13,dist:160,hitboxes:[hb(12,-82,80,66)]},
    up:{name:'HOOK ROLL',desc:'Roll upward or grapple to a nearby ledge when over open air',type:'recover',frames:44,startup:4,active:14,damage:8,bkb:16,kbs:45,angle:82,rise:10.5,drift:4.5,vineTether:true,hookTether:true,tetherRange:351,queueRecoveryJump:true,hitboxes:[hb(-40,-98,80,85)]},
    down:{name:'ENERGY SLASH',desc:'Sweep with a close-range energy blade',type:'vinelash',frames:40,startup:8,active:5,damage:11,bkb:22,kbs:60,angle:40,hitboxes:[hb(8,-80,95,65)]}
  },
  finalSmash:{name:'FRONTIER BARRAGE',type:'barrage',duration:150,damage:48},
  grabRange:46,throwDmg:{f:8,b:10,u:8,d:7}
};

const FIGHTER_KEYS = ['valor', 'grim', 'astra', 'vesper', 'rook', 'marrow', 'tide', 'vector', 'briar', 'nomad'];

/* ============================================================
   FRAME-DATA TUNING PASS  —  one place, so every fighter moves alike
   ------------------------------------------------------------
   The numbers written into each move above are the design intent (how many
   frames a move wants, and in what proportion).  This pass is what ships: it
   keeps startup/active proportions per family and shortens the tail, because
   measured on the previous data a jab spent 17 of its 22 ticks doing nothing
   and a smash 30 of 52 — the single biggest reason the game reads as slow, and
   why a fighter standing in a follow-through pose gets walked up and punished.

   Damage, knockback, angles, boxes and hitboxes are deliberately untouched:
   this changes how long a move takes, never what it does.
   ============================================================ */
const TUNE = {
  jab:     { startup: 1.00, tail: 0.60, floor: 12 },
  tilt:    { startup: 0.85, tail: 0.66, floor: 16 },
  smash:   { startup: 1.00, tail: 0.60, floor: 26 },   // keep the telegraph; the charge reads it
  dash:    { startup: 0.90, tail: 0.56, floor: 20 },
  air:     { startup: 0.90, tail: 0.66, floor: 18 },
  special: { startup: 0.95, tail: 0.80, floor: 22 },
};
function tuneFamily(kind) {
  if (kind === 'jab') return 'jab';
  if (kind === 'dashattack') return 'dash';
  if (kind.includes('smash')) return 'smash';
  if (kind.includes('air')) return 'air';
  if (kind.includes('tilt') || kind === 'stilt') return 'tilt';
  return 'special';
}
/* `active` is now the exact number of frames the hitbox is live — the resolver
   used to check `t <= startup + active`, which made every move hit for one tick
   longer than it was written, and put that extra tick past the end of the
   animation window. */
// F attacks keep their original frames and damage, but reach farther in the
// direction each authored box covers. Centered attacks grow on both sides.
function extendAttackBox(box) {
  const b = Object.assign({}, box);
  const dx = box.w * 0.25, dy = box.h * 0.15;
  const centerX = box.x + box.w / 2;
  if (centerX < -box.w * 0.2) b.x -= dx;
  else if (centerX <= box.w * 0.2) b.x -= dx / 2;
  b.w += dx;
  const centerY = box.y + box.h / 2;
  if (centerY < -65) b.y -= dy;
  else if (centerY < -35) b.y -= dy / 2;
  b.h += dy;
  return b;
}
function tuneMove(m, kind, weight) {
  const fam = tuneFamily(kind), t = TUNE[fam];
  const startup = Math.max(kind === 'jab' ? 2 : 3, Math.min(m.startup, Math.round(m.startup * t.startup)));
  const active = Math.max(1, m.active || 1);
  const tail = Math.max(fam === 'smash' ? 9 : fam === 'jab' ? 4 : 5,
    Math.round(Math.max(0, m.frames - m.startup - (m.active || 1)) * t.tail));
  const out = Object.assign({}, m, {
    startup, active, tail, frames: Math.max(t.floor, startup + active + tail),
    hitboxes: m.hitboxes ? m.hitboxes.map(extendAttackBox) : m.hitboxes,
  });
  // A heavier fighter lands heavier: aerials get their lag from the landing,
  // which is what makes floaty characters feel light and Grim feel like a rock.
  if (fam === 'air') out.landingLag = clamp(Math.round(weight / 16) + (kind === 'dair' ? 2 : 0), 3, 9);
  /* `multi` is the number of EXTRA hits a move can land on the same target, so it
     needs room in the window to do it: every hit gets its own live ticks with a
     one-tick gap, and `rehit` is the spacing the resolver uses to re-arm the
     target.  Vesper's Dagger Flurry was authored as a 2-hit flurry inside a
     2-tick window with nothing re-arming it, so it hit exactly once — which is
     precisely how "my second jab did nothing" gets reported as a hitbox bug. */
  const hits = 1 + (out.multi || 0);
  if (hits > 1) {
    const per = Math.max(2, Math.ceil(active / hits));
    out.rehit = per + 1;
    out.active = per * hits + (hits - 1);
    out.frames = Math.max(t.floor, out.startup + out.active + out.tail);
  }
  return out;
}
function tuneSpecial(sp) {
  const t = TUNE.special;
  if (sp.type === 'counter') return sp;               // a stance is timed by its window
  const startup = Math.max(2, Math.min(sp.startup, Math.round((sp.startup || 4) * t.startup)));
  const tail = Math.max(5, Math.round(Math.max(0, (sp.frames || 30) - (sp.startup || 4)) * t.tail));
  return Object.assign({}, sp, { startup, frames: Math.max(t.floor, startup + tail) });
}
for (const k of FIGHTER_KEYS) {
  const def = FIGHTERS[k], weight = def.stats.weight;
  for (const kind in def.moves) def.moves[kind] = tuneMove(def.moves[kind], kind, weight);
  for (const d in def.specials) def.specials[d] = tuneSpecial(def.specials[d]);
}

/* ============================================================
   STAGES
   ============================================================ */
const STAGES = {
  grandrift: {
    key: 'grandrift', name: 'GRAND RIFT', sub: 'XL · wide open battlefield', theme: 'rift', size: 'XL',
    bg: ['#110c28', '#27214e', '#4e3979'], accent: '#d38cff',
    ground: { x: -1100, y: 0, w: 2200, h: 44 },
    platforms: [
      { x: -750, y: -170, w: 260, h: 18 },
      { x: -130, y: -170, w: 260, h: 18 },
      { x: 490, y: -170, w: 260, h: 18 },
      { x: -440, y: -320, w: 240, h: 18 },
      { x: 200, y: -320, w: 240, h: 18 },
    ], ledges: true, hazard: null,
  },
  colossalstadium: {
    key: 'colossalstadium', name: 'COLOSSAL STADIUM', sub: 'XL · five-platform arena', theme: 'arena', size: 'XL',
    bg: ['#071b20', '#13413c', '#276d63'], accent: '#55f1c4',
    ground: { x: -1000, y: 0, w: 2000, h: 44 },
    platforms: [
      { x: -740, y: -165, w: 250, h: 18 },
      { x: -125, y: -165, w: 250, h: 18 },
      { x: 490, y: -165, w: 250, h: 18 },
      { x: -450, y: -310, w: 220, h: 18 },
      { x: 230, y: -310, w: 220, h: 18 },
    ], ledges: true, hazard: null,
  },
  horizon: {
    key: 'horizon', name: 'HORIZON DECK', sub: 'XL · flat, no hazards', theme: 'comet', size: 'XL',
    bg: ['#0b102b', '#202b5d', '#424a87'], accent: '#81c8ff',
    ground: { x: -900, y: 0, w: 1800, h: 44 }, platforms: [],
    ledges: true, hazard: null,
  },
  skyshrine: {
    key: 'skyshrine', name: 'SKY SHRINE', sub: 'Balanced · 3 platforms', theme: 'shrine',
    bg: ['#0d1830', '#1b2f52', '#31547f'], accent: '#5aa9ff',
    ground: { x: -560, y: 0, w: 1120, h: 44 },
    platforms: [
      { x: -290, y: -190, w: 260, h: 18 },
      { x: 30, y: -190, w: 260, h: 18 },
      { x: -130, y: -350, w: 260, h: 18 },
    ],
    ledges: true, hazard: null,
  },
  terminal: {
    key: 'terminal', name: 'TERMINAL RIFT', sub: 'Flat · Final Destination style', theme: 'rift',
    bg: ['#140f26', '#282050', '#4a3a72'], accent: '#c77dff',
    ground: { x: -620, y: 0, w: 1240, h: 44 }, platforms: [],
    ledges: true, hazard: null,
  },
  foundry: {
    key: 'foundry', name: 'EMBER FOUNDRY', sub: 'Moving lift · lava and meteors', theme: 'foundry',
    bg: ['#1d0d09', '#3a1d14', '#6a3520'], accent: '#ff9330',
    ground: { x: -540, y: 0, w: 1080, h: 44 },
    platforms: [
      { x: -300, y: -200, w: 240, h: 18 },
      { x: 60, y: -200, w: 240, h: 18 },
      { x: -120, y: -360, w: 240, h: 18, move: { axis: 'x', amp: 120, speed: 0.012 } },
    ],
    ledges: true, hazard: { type: 'lava', y: 300, dmg: 12, kb: 0.8 },
  },
  cometreach: {
    key: 'cometreach', name: 'COMET REACH', sub: 'Wide · floaty platforms', theme: 'comet',
    bg: ['#100e28', '#211c4e', '#3d3478'], accent: '#7aa2ff',
    ground: { x: -500, y: 0, w: 1000, h: 44 },
    platforms: [
      { x: -330, y: -170, w: 200, h: 16, move: { axis: 'y', amp: 46, speed: 0.02 } },
      { x: 130, y: -170, w: 200, h: 16, move: { axis: 'y', amp: 46, speed: 0.02, phase: Math.PI } },
      { x: -100, y: -320, w: 200, h: 16 },
    ],
    ledges: true, hazard: null,
  },
  hollow: {
    key: 'hollow', name: 'BAMBOO HOLLOW', sub: 'Pillars · tight neutral', theme: 'hollow',
    bg: ['#08190f', '#123a26', '#255a3e'], accent: '#2fd6bb',
    ground: { x: -480, y: 0, w: 960, h: 44 },
    platforms: [
      { x: -250, y: -180, w: 190, h: 16 },
      { x: 60, y: -180, w: 190, h: 16 },
      { x: -95, y: -330, w: 190, h: 16 },
    ],
    ledges: true, hazard: { type: 'pillar', x: 0, w: 90, period: 420, dmg: 10, kb: 0.9 },
  },
  /* ---------- decks copied from the Super Smash Bros. Ultimate stage templates ----------
     Ultimate builds almost every stage out of four interchangeable *forms*, and the two
     that matter here are the ones the competitive set is made of:
       Battlefield — a flat main platform, three soft platforms above it (two to the
         sides, one high in the middle) and one low platform in the middle of the deck;
         no walls, no hazards, no moving parts.
       Final Destination / Omega — the same deck with every soft platform removed.
     Big Battlefield and Small Battlefield are the same layout at another size, and the
     tournament stages (Pokémon Stadium 2, Town & City, Smashville) are Battlefield
     variants with the low centre platform dropped, added or rearranged.  That is why
     these entries are proportions, not new mechanics: what is being copied is where the
     platforms sit and how far the deck reaches, so a rally plays the same shape here.
     Names, colours and backdrops are ours; the geometry is the template's.  */
  field: {
    key: 'field', name: 'RIFT FIELD', sub: 'Battlefield form · 4 soft platforms', theme: 'island',
    bg: ['#0a1428', '#17304f', '#2f5f86'], accent: '#7fd0ff',
    ground: { x: -590, y: 0, w: 1180, h: 44 },
    platforms: [
      { x: -330, y: -190, w: 200, h: 18 },
      { x: 130, y: -190, w: 200, h: 18 },
      { x: -100, y: -346, w: 200, h: 18 },
      { x: -70, y: -104, w: 140, h: 16 },
    ],
    ledges: true, hazard: null,
  },
  bigfield: {
    key: 'bigfield', name: 'BROADSIDE FIELD', sub: 'Big Battlefield form · widest deck', theme: 'island',
    bg: ['#0b1024', '#1b2547', '#3b4f7a'], accent: '#9ecbff',
    ground: { x: -700, y: 0, w: 1400, h: 44 },
    platforms: [
      { x: -400, y: -186, w: 190, h: 18 },
      { x: -95, y: -186, w: 190, h: 18 },
      { x: 210, y: -186, w: 190, h: 18 },
      { x: -100, y: -350, w: 200, h: 18 },
      { x: -70, y: -100, w: 140, h: 16 },
    ],
    ledges: true, hazard: null,
  },
  smallfield: {
    key: 'smallfield', name: 'LESSER FIELD', sub: 'Small Battlefield form · tight', theme: 'island',
    bg: ['#0d1730', '#22355c', '#41638f'], accent: '#69c8ff',
    ground: { x: -440, y: 0, w: 880, h: 44 },
    platforms: [
      { x: -250, y: -180, w: 170, h: 16 },
      { x: 80, y: -180, w: 170, h: 16 },
      { x: -60, y: -96, w: 120, h: 16 },
    ],
    ledges: true, hazard: null,
  },
  nullshore: {
    key: 'nullshore', name: 'NULL SHORE', sub: 'Final Destination form · flat, no platforms', theme: 'rift',
    bg: ['#120c22', '#241a44', '#43356b'], accent: '#b98cff',
    ground: { x: -700, y: 0, w: 1400, h: 44 }, platforms: [],
    ledges: true, hazard: null,
  },
  stadium: {
    key: 'stadium', name: 'STADIUM DECK', sub: 'Pokémon Stadium 2 form · wide, 2 soft platforms', theme: 'arena',
    bg: ['#0a1a12', '#14352a', '#2a5c42'], accent: '#4ce0a8',
    ground: { x: -590, y: 0, w: 1180, h: 44 },
    platforms: [
      { x: -340, y: -176, w: 210, h: 16 },
      { x: 130, y: -176, w: 210, h: 16 },
    ],
    ledges: true, hazard: null,
  },
  towncity: {
    key: 'towncity', name: 'CITY STREET', sub: 'Town & City form · long deck, traffic below', theme: 'city',
    bg: ['#101626', '#22304a', '#48566f'], accent: '#ffd166',
    ground: { x: -680, y: 0, w: 1360, h: 44 },
    platforms: [
      { x: -370, y: -186, w: 200, h: 16 },
      { x: 170, y: -186, w: 200, h: 16 },
      { x: -100, y: -330, w: 200, h: 16 },
      { x: -70, y: -100, w: 140, h: 16 },
    ],
    ledges: true, hazard: null,
  },
  village: {
    key: 'village', name: 'VILLAGE GREEN', sub: 'Smashville form · three soft platforms in a row', theme: 'city',
    bg: ['#12200f', '#26451f', '#4a7038'], accent: '#9be84f',
    ground: { x: -600, y: 0, w: 1200, h: 44 },
    platforms: [
      { x: -350, y: -184, w: 190, h: 16 },
      { x: -95, y: -184, w: 190, h: 16 },
      { x: 160, y: -184, w: 190, h: 16 },
    ],
    ledges: true, hazard: null,
  },
  cartoon: {
    key: 'cartoon', name: 'CARTOON PLAINS', sub: "Yoshi's Story form · flat deck, two ledges", theme: 'hollow',
    bg: ['#123a1d', '#2e7a3a', '#63c46a'], accent: '#ffe066',
    ground: { x: -575, y: 0, w: 1150, h: 44 },
    platforms: [
      { x: -300, y: -176, w: 190, h: 16 },
      { x: 110, y: -176, w: 190, h: 16 },
      { x: -95, y: -318, w: 190, h: 16 },
    ],
    ledges: true, hazard: null,
  },
  cruise: {
    key: 'cruise', name: 'CRUISE LINER', sub: 'Lylat Cruise form · two tiers, blast panels', theme: 'comet',
    bg: ['#0d0f2a', '#1f2350', '#3b3f7d'], accent: '#6ad0ff',
    ground: { x: -590, y: 0, w: 1180, h: 44 },
    platforms: [
      { x: -330, y: -150, w: 180, h: 16 },
      { x: 150, y: -150, w: 180, h: 16 },
      { x: -100, y: -286, w: 200, h: 16 },
    ],
    ledges: true, hazard: { type: 'pillar', x: 0, w: 84, period: 380, dmg: 9, kb: 1.0 },
  },
  league: {
    key: 'league', name: 'SNOW LEAGUE', sub: 'Kalos League form · high centre, cold edges', theme: 'arena',
    bg: ['#0f1b2b', '#23405c', '#5b7fa0'], accent: '#c8ecff',
    ground: { x: -560, y: 0, w: 1120, h: 44 },
    platforms: [
      { x: -330, y: -188, w: 200, h: 16 },
      { x: 130, y: -188, w: 200, h: 16 },
      { x: -100, y: -352, w: 200, h: 16 },
      { x: -70, y: -104, w: 140, h: 16, move: { axis: 'y', amp: 22, speed: 0.014 } },
    ],
    ledges: true, hazard: null,
  },
  range: {
    key: 'range', name: 'RUNE RANGE', sub: 'Sloped ruins · wide', theme: 'range',
    bg: ['#0f1710', '#22301c', '#3c5230'], accent: '#22e08a',
    ground: { x: -600, y: 0, w: 1200, h: 44 },
    platforms: [
      { x: -360, y: -160, w: 180, h: 16, move: { axis: 'x', amp: 60, speed: 0.015 } },
      { x: 180, y: -160, w: 180, h: 16, move: { axis: 'x', amp: 60, speed: 0.015, phase: Math.PI } },
      { x: -90, y: -310, w: 220, h: 16 },
    ],
    ledges: true, hazard: null,
  },
};
// Dynamic-stage interpretations: stage motion is simulated by Match on both
// local and authoritative online games; these are not exact recreations.
Object.assign(STAGES, {
  smashville: {
    key:'smashville', name:'SMASHVILLE', sub:'One gliding platform', theme:'city',
    bg:['#12200f','#26451f','#4a7038'], accent:'#9be84f',
    ground:{x:-600,y:0,w:1200,h:44},
    platforms:[{x:-145,y:-200,w:290,h:16,motion:{kind:'sine',ax:340,ay:0,speed:.006,hazardMotion:true}}],
    ledges:true, hazard:null,
  },
  townandcity: {
    key:'townandcity',name:'TOWN AND CITY',sub:'Platforms travel between formations',theme:'city',
    bg:['#101626','#22304a','#48566f'],accent:'#ffd166',ground:{x:-680,y:0,w:1360,h:44},
    platforms:[
      {x:-360,y:-185,w:200,h:16,motion:{kind:'town',slot:0}},
      {x:-100,y:-300,w:200,h:16,motion:{kind:'town',slot:1}},
      {x:160,y:-185,w:200,h:16,motion:{kind:'town',slot:2}},
      {x:-360,y:-185,w:200,h:16,motion:{kind:'town',slot:3}},
      {x:160,y:-185,w:200,h:16,motion:{kind:'town',slot:4}},
    ],ledges:true,hazard:null,
  },
  fountain: {
    key:'fountain',name:'FOUNTAIN OF DREAMS',sub:'Independent rising and sinking platforms',theme:'shrine',
    bg:['#19132e','#473168','#725288'],accent:'#ffaee9',ground:{x:-560,y:0,w:1120,h:44},
    platforms:[
      {x:-360,y:-125,w:220,h:16,motion:{kind:'fountain',amp:150,speed:.007,phase:0,hazardMotion:true}},
      {x:140,y:-145,w:220,h:16,motion:{kind:'fountain',amp:170,speed:.009,phase:1.7,hazardMotion:true}},
      {x:-110,y:-330,w:220,h:16},
    ],ledges:true,hazard:null,
  },
  hollowbastion: {
    key:'hollowbastion',name:'HOLLOW BASTION',sub:'A drifting platform that separates',theme:'comet',
    bg:['#17172d','#393251','#76658a'],accent:'#e6bcff',ground:{x:-570,y:0,w:1140,h:44},
    platforms:[
      {x:-130,y:-220,w:130,h:16,motion:{kind:'split',side:-1}},
      {x:0,y:-220,w:130,h:16,motion:{kind:'split',side:1}},
    ],ledges:true,hazard:null,
  },
  northerncave: {
    key:'northerncave',name:'NORTHERN CAVE',sub:'Diagonal moving platforms',theme:'comet',
    bg:['#071d27','#124459','#297c80'],accent:'#70f2d8',ground:{x:-580,y:0,w:1160,h:44},
    platforms:[
      {x:-360,y:-180,w:210,h:16,motion:{kind:'sine',ax:80,ay:95,speed:.008,phase:0}},
      {x:150,y:-180,w:210,h:16,motion:{kind:'sine',ax:-80,ay:95,speed:.008,phase:Math.PI}},
    ],ledges:true,hazard:null,
  },
  dreamland: {
    key:'dreamland',name:'DREAM LAND',sub:'Periodic crosswinds',theme:'hollow',
    bg:['#1b3423','#3c7545','#91b875'],accent:'#e7f9a3',ground:{x:-590,y:0,w:1180,h:44},
    platforms:[{x:-330,y:-190,w:200,h:16},{x:130,y:-190,w:200,h:16},{x:-100,y:-340,w:200,h:16}],
    ledges:true,hazard:{type:'wind',period:900,duration:240,strength:.18},
  },
  brinstar: {
    key:'brinstar',name:'BRINSTAR',sub:'Acid · meteors · floor spikes',theme:'foundry',
    bg:['#1b0f27','#3e2050','#734874'],accent:'#aaff70',ground:{x:-560,y:0,w:1120,h:44},
    platforms:[{x:-330,y:-190,w:200,h:16},{x:130,y:-190,w:200,h:16},{x:-100,y:-340,w:200,h:16}],
    ledges:true,hazard:{type:'acid',bottom:360,top:-75,period:900,dmg:8},
  },
});
// Reference-inspired arenas. The artwork is original; geometry is adapted to the
// engine's single solid deck and one-way platforms rather than a 1:1 recreation.
Object.assign(STAGES, {
  tortimerisland: {
    key:'tortimerisland', name:'TORTIMER ISLAND', sub:'Palm platforms · healing fruit', theme:'coast', backdrop:'island', surface:'sand',
    bg:['#16486a','#35a1b2','#d2b26b'], accent:'#e9d78e', ground:{x:-590,y:0,w:1180,h:44},
    platforms:[{x:-405,y:-155,w:165,h:16},{x:240,y:-155,w:165,h:16}], ledges:true,hazard:null,
  },
  pictochat2: {
    key:'pictochat2', name:'PICTOCHAT 2', sub:'Alternating sketch platforms', theme:'arena', backdrop:'picto', surface:'ink',
    bg:['#e9e6dd','#d7d4ca','#a7a49b'], accent:'#282522', ground:{x:-560,y:0,w:1120,h:44},
    platforms:[
      {x:-370,y:-160,w:220,h:14,motion:{kind:'sketch',group:0,hazardMotion:true}},
      {x:150,y:-160,w:220,h:14,motion:{kind:'sketch',group:0,hazardMotion:true}},
      {x:-120,y:-290,w:240,h:14,motion:{kind:'sketch',group:1,hazardMotion:true}},
      {x:-440,y:-255,w:180,h:14,motion:{kind:'sketch',group:1,hazardMotion:true}},
      {x:260,y:-255,w:180,h:14,motion:{kind:'sketch',group:1,hazardMotion:true}},
    ],ledges:true,hazard:null,
  },
  newdonkcityhall: {
    key:'newdonkcityhall',name:'NEW DONK CITY HALL',sub:'City hall with moving side lifts',theme:'city',backdrop:'cityhall',surface:'stone',
    bg:['#1e293c','#6c7483','#b4a899'],accent:'#f6d58e',ground:{x:-610,y:0,w:1220,h:44},
    platforms:[{x:-370,y:-170,w:200,h:16,motion:{kind:'sine',ax:0,ay:110,speed:.005}},{x:170,y:-170,w:200,h:16,motion:{kind:'sine',ax:0,ay:110,speed:.005,phase:3.14159}}],ledges:true,hazard:null,
  },
  minecraftworld: {
    key:'minecraftworld',name:'MINECRAFT WORLD',sub:'Split floor · breakable blocks',theme:'coast',backdrop:'blockworld',surface:'blocks',
    bg:['#4171a6','#7dbbdb','#785538'],accent:'#88c95a',ground:{x:-600,y:0,w:1200,h:44},
    platforms:[{x:-370,y:-160,w:200,h:24},{x:170,y:-160,w:200,h:24},{x:-90,y:-300,w:180,h:24},
      {x:-250,y:-80,w:120,h:24,breakHP:18},{x:130,y:-80,w:120,h:24,breakHP:18}],ledges:true,hazard:null,
  },
  mishimadojo: {
    key:'mishimadojo',name:'MISHIMA DOJO',sub:'Breakable dojo walls and ceiling',theme:'shrine',backdrop:'dojo',surface:'wood',
    bg:['#191011','#543321','#90704d'],accent:'#e5bc7f',ground:{x:-600,y:0,w:1200,h:44},platforms:[],ledges:true,hazard:null,
  },
  wreckingcrew: {
    key:'wreckingcrew',name:'WRECKING CREW',sub:'Demolition charge · floor spikes',theme:'foundry',backdrop:'wrecking',surface:'steel',
    bg:['#291a24','#79514d','#bd7353'],accent:'#f5ba72',ground:{x:-610,y:0,w:1220,h:44},
    platforms:[{x:-460,y:-140,w:280,h:18},{x:180,y:-140,w:280,h:18},{x:-190,y:-270,w:380,h:18},{x:-100,y:-400,w:200,h:18}],ledges:true,hazard:null,
  },
  flatzonex: {
    key:'flatzonex',name:'FLAT ZONE X',sub:'Changing scenes · slippery oil',theme:'arena',backdrop:'flatzone',surface:'ink',
    bg:['#dbd4b9','#c8bfa5','#8f8973'],accent:'#242722',ground:{x:-520,y:0,w:1040,h:44},
    platforms:[{x:-340,y:-150,w:210,h:14,motion:{kind:'sketch',group:0,hazardMotion:true}},{x:130,y:-150,w:210,h:14,motion:{kind:'sketch',group:0,hazardMotion:true}},{x:-110,y:-250,w:220,h:14,motion:{kind:'sketch',group:1,hazardMotion:true}}],ledges:true,hazard:null,
  },
  kingoffighters: {
    key:'kingoffighters',name:'KING OF FIGHTERS STADIUM',sub:'Ring · launch through the side barriers',theme:'arena',backdrop:'kof',surface:'steel',ringWalls:true,
    bg:['#10132d','#303b6c','#536894'],accent:'#a8c8ff',ground:{x:-620,y:0,w:1240,h:44},platforms:[],ledges:true,hazard:null,
  },
  greatcave: {
    key:'greatcave',name:'THE GREAT CAVE OFFENSIVE',sub:'Split floor · danger zones',theme:'foundry',surface:'stone',size:'XL',
    bg:['#17112b','#47315d','#936b76'],accent:'#de98ec',ground:{x:-1000,y:0,w:2000,h:44},
    platforms:[{x:-760,y:-180,w:300,h:18},{x:-150,y:-180,w:300,h:18},{x:460,y:-180,w:300,h:18},{x:-480,y:-330,w:260,h:18},{x:220,y:-330,w:260,h:18}],ledges:true,hazard:null,
  },
  midgar: {
    key:'midgar',name:'MIDGAR',sub:'Collect materia to summon attacks',theme:'foundry',backdrop:'midgar',surface:'steel',
    bg:['#091e28','#164552','#587879'],accent:'#75eacb',ground:{x:-590,y:0,w:1180,h:44},
    platforms:[{x:-335,y:-185,w:200,h:16},{x:135,y:-185,w:200,h:16},{x:-100,y:-330,w:200,h:16}],ledges:true,hazard:null,
  },
});
// Stadium transformations use distinct soft-platform layouts. Slopes and
// solid terrain are intentionally approximated as one-way platforms.
function stadiumLayout() {
  return [
    {x:-340,y:-176,w:210,h:16,motion:{kind:'forms',forms:['normal','ice']}},
    {x:130,y:-176,w:210,h:16,motion:{kind:'forms',forms:['normal','ice']}},
    {x:-105,y:-165,w:210,h:16,motion:{kind:'forms',forms:['electric','grass','water']}},
    {x:-105,y:-310,w:210,h:16,motion:{kind:'forms',forms:['electric','flying','rock']}},
    {x:-420,y:-205,w:180,h:16,motion:{kind:'forms',forms:['electric','ground','fire']}},
    {x:245,y:-150,w:180,h:16,motion:{kind:'forms',forms:['ground','flying','rock','grass']}},
    {x:-365,y:-260,w:180,h:16,motion:{kind:'forms',forms:['water','fire']}},
  ];
}
Object.assign(STAGES, {
 battlefield:{key:'battlefield',name:'BATTLEFIELD',sub:'Rising and falling platforms',theme:'island',backdrop:'battlefield',surface:'stone',bg:['#0a1428','#17304f','#2f5f86'],accent:'#7fd0ff',ground:{x:-590,y:0,w:1180,h:44},platforms:[{x:-330,y:-190,w:200,h:18},{x:130,y:-190,w:200,h:18},{x:-100,y:-346,w:200,h:18}],ledges:true,hazard:null},
 smallbattlefield:{key:'smallbattlefield',name:'SMALL BATTLEFIELD',sub:'Blinking platforms',theme:'island',backdrop:'battlefield',surface:'stone',bg:['#0a1428','#17304f','#2f5f86'],accent:'#7fd0ff',ground:{x:-540,y:0,w:1080,h:44},platforms:[{x:-280,y:-180,w:190,h:18},{x:90,y:-180,w:190,h:18}],ledges:true,hazard:null},
 bigbattlefield:{key:'bigbattlefield',name:'BIG BATTLEFIELD',sub:'Six platforms · shifting tiers',theme:'island',backdrop:'battlefield',surface:'stone',size:'XL',bg:['#0a1428','#17304f','#2f5f86'],accent:'#7fd0ff',ground:{x:-900,y:0,w:1800,h:44},platforms:[{x:-600,y:-160,w:200,h:18},{x:-100,y:-160,w:200,h:18},{x:400,y:-160,w:200,h:18},{x:-370,y:-290,w:200,h:18},{x:170,y:-290,w:200,h:18},{x:-100,y:-420,w:200,h:18}],ledges:true,hazard:null},
 finaldestination:{key:'finaldestination',name:'FINAL DESTINATION',sub:'Flat arena · energy strike',theme:'rift',backdrop:'northern',surface:'steel',bg:['#091b28','#164858','#527783'],accent:'#a7f6e7',ground:{x:-620,y:0,w:1240,h:44},platforms:[],ledges:true,hazard:null},
 pokemonstadium:{key:'pokemonstadium',name:'POKÉMON STADIUM',sub:'Grass · water · fire · rock',theme:'arena',backdrop:'pokemonarena',surface:'steel',bg:['#102638','#276250','#72a176'],accent:'#87f1bc',ground:{x:-590,y:0,w:1180,h:44},platforms:stadiumLayout(),stageForms:['grass','water','fire','rock'],ledges:true,hazard:null},
 pokemonstadium2:{key:'pokemonstadium2',name:'POKÉMON STADIUM 2',sub:'Electric · flying · ground · ice',theme:'arena',backdrop:'pokemonarena',surface:'steel',bg:['#102638','#276250','#72a176'],accent:'#87f1bc',ground:{x:-610,y:0,w:1220,h:44},platforms:stadiumLayout(),stageForms:['electric','flying','ground','ice'],ledges:true,hazard:null},
 castlesiege:{key:'castlesiege',name:'CASTLE SIEGE',sub:'Roof · throne room · cavern',theme:'shrine',backdrop:'fantasycastle',surface:'stone',bg:['#211e34','#51455c','#958577'],accent:'#ecd5a0',ground:{x:-590,y:0,w:1180,h:44},stageForms:['interior','cavern'],platforms:[
  {x:-350,y:-185,w:210,h:18,motion:{kind:'forms',forms:['normal','interior']}},
  {x:140,y:-185,w:210,h:18,motion:{kind:'forms',forms:['normal','interior']}},
  {x:-100,y:-315,w:200,h:18,motion:{kind:'forms',forms:['normal']}},
  {x:-130,y:-275,w:260,h:18,motion:{kind:'forms',forms:['interior']}},
  {x:-220,y:-145,w:440,h:18,motion:{kind:'forms',forms:['cavern']}}
 ],ledges:true,hazard:null},
 arenaferox:{key:'arenaferox',name:'ARENA FEROX',sub:'Changing coliseum layouts',theme:'arena',backdrop:'ruins',surface:'stone',bg:['#2c1d25','#75564b','#ac896c'],accent:'#f4d4a0',ground:{x:-580,y:0,w:1160,h:44},stageForms:['gears','pillars','ruins'],platforms:[
  {x:-370,y:-175,w:210,h:18,motion:{kind:'forms',forms:['normal','pillars']}},
  {x:160,y:-175,w:210,h:18,motion:{kind:'forms',forms:['normal','gears']}},
  {x:-105,y:-300,w:210,h:18,motion:{kind:'forms',forms:['normal','ruins']}},
  {x:-405,y:-260,w:180,h:18,motion:{kind:'forms',forms:['gears','ruins']}},
  {x:225,y:-260,w:180,h:18,motion:{kind:'forms',forms:['pillars','ruins']}},
  {x:-100,y:-150,w:200,h:18,motion:{kind:'forms',forms:['gears','pillars']}}
 ],ledges:true,hazard:null},
 springstadium:{key:'springstadium',name:'SPRING STADIUM',sub:'Timed launch pads',theme:'arena',backdrop:'pokemonarena',surface:'steel',bg:['#102638','#276250','#72a176'],accent:'#87f1bc',ground:{x:-600,y:0,w:1200,h:44},platforms:[{x:-120,y:-230,w:240,h:20}],springPads:true,ledges:true,hazard:null},
 yoshistory:{key:'yoshistory',name:"YOSHI'S STORY",sub:'Storybook island · roaming cloud',theme:'hollow',backdrop:'dreamland',surface:'grass',bg:['#397baf','#87bdc5','#b6d989'],accent:'#f4e07d',ground:{x:-500,y:0,w:1000,h:44},platforms:[{x:-375,y:-170,w:200,h:16},{x:175,y:-170,w:200,h:16},{x:-100,y:-320,w:200,h:16},{x:-80,y:-90,w:160,h:16,motion:{kind:'cloud',hazardMotion:true}}],ledges:true,hazard:null},
});
// Wider interpretations for multi-fighter play. Main decks are wider and extra
// soft platforms add useful routes while retaining each stage's core mechanic.
STAGES.tortimerisland.size='XL'; STAGES.tortimerisland.ground={x:-900,y:0,w:1800,h:44};
STAGES.tortimerisland.platforms=[
  {x:-750,y:-160,w:200,h:16},{x:550,y:-160,w:200,h:16},
  {x:-430,y:-170,w:200,h:16},{x:230,y:-170,w:200,h:16},{x:-105,y:-310,w:210,h:16},
];
STAGES.newdonkcityhall.size='XL'; STAGES.newdonkcityhall.ground={x:-900,y:0,w:1800,h:44};
STAGES.newdonkcityhall.platforms=[
  {x:-520,y:-170,w:220,h:16,motion:{kind:'sine',ax:0,ay:110,speed:.005}},
  {x:300,y:-170,w:220,h:16,motion:{kind:'sine',ax:0,ay:110,speed:.005,phase:Math.PI}},
  {x:-760,y:-225,w:200,h:16},{x:560,y:-225,w:200,h:16},{x:-115,y:-310,w:230,h:16},
];
STAGES.minecraftworld.size='XL'; STAGES.minecraftworld.ground={x:-900,y:0,w:1800,h:44};
STAGES.minecraftworld.platforms.push({x:-725,y:-165,w:200,h:24},{x:525,y:-165,w:200,h:24});
STAGES.wreckingcrew.size='XL'; STAGES.wreckingcrew.ground={x:-900,y:0,w:1800,h:44};
STAGES.wreckingcrew.platforms.push({x:-780,y:-185,w:260,h:18},{x:520,y:-185,w:260,h:18});

// Permanent openings are part of the layout, even with hazards disabled.
// Each deck segment is a real collision surface; the original ground remains
// the overall camera/blast-zone bounds. Each exposed deck face is a ledge.
for (const key of ['minecraftworld','greatcave']) {
  const stage=STAGES[key], gd=stage.ground, gap={x:-90,w:180};
  stage.groundGaps=[gap];
  stage.deckSegments=[{x:gd.x,y:gd.y,w:gap.x-gd.x,h:gd.h},
    {x:gap.x+gap.w,y:gd.y,w:gd.x+gd.w-gap.x-gap.w,h:gd.h}];
}
// Small contact hazards are separate from the permanently split decks.
STAGES.brinstar.floorSpikes=[{x:-555,y:-32,w:70,h:32},{x:485,y:-32,w:70,h:32}];
STAGES.wreckingcrew.floorSpikes=[{x:-735,y:-32,w:90,h:32},{x:645,y:-32,w:90,h:32}];
function deckSegments(stage) { return stage.deckSegments || [stage.ground]; }
function deckAt(stage,x,lip=0) {
  const segments=deckSegments(stage);
  return segments.find((p,i)=>x>p.x-(i===0?lip:0) && x<p.x+p.w+(i===segments.length-1?lip:0)) || null;
}
// One-way soft platforms are not solid ledges. Only exposed faces of solid
// deck segments can be grabbed; adjacent/overlapping segments have no seam ledge.
function stageLedges(stage) {
  if (stage.ledges === false) return [];
  const segments=deckSegments(stage).slice().sort((a,b)=>a.x-b.x), spans=[];
  for(const p of segments) {
    const last=spans[spans.length-1], end=p.x+p.w;
    if(last && p.x<=last.end) last.end=Math.max(last.end,end);
    else spans.push({start:p.x,end});
  }
  return spans.flatMap(p=>[{side:-1,x:p.start},{side:1,x:p.end}]);
}
function ledgeOccupied(match, fighter, side, x) {
  return match.fighters.some(f=>f!==fighter && !f.eliminated && f.state==='ledge' &&
    f.ledge && f.ledge.side===side && f.ledge.x===x);
}

// New stage-specific interactions. The Battlefield and meteor additions are
// original game variations, not features of their Smash originals.
STAGES.battlefield.platforms.forEach((p,i)=>{p.motion={kind:'sine',ax:0,ay:55,speed:.005,phase:i===2?Math.PI:0,hazardMotion:true};});
STAGES.smallbattlefield.platforms.forEach((p,i)=>{p.motion={kind:'blink',slot:i,hazardMotion:true};});
STAGES.bigbattlefield.platforms.forEach((p,i)=>{p.motion={kind:'sine',ax:i%2?55:-55,ay:0,speed:.004,phase:0,hazardMotion:true};});
STAGES.pokemonstadium.backdropForms={grass:'village',water:'island',fire:'forge',rock:'northern'};
STAGES.pokemonstadium2.backdropForms={electric:'pokemonarena',flying:'shrine',ground:'blockworld',ice:'northern'};
STAGES.castlesiege.backdropForms={interior:'dojo',cavern:'forge'};
// Refresh the older arenas without removing IDs used by classic mode, saved
// settings or online rooms. Their existing collision layouts remain compatible.
const REMASTERED_BACKDROPS = {
 grandrift:'battlefield',colossalstadium:'pokemonarena',horizon:'northern',skyshrine:'shrine',terminal:'northern',foundry:'forge',cometreach:'battlefield',hollow:'shrine',
 field:'battlefield',bigfield:'battlefield',smallfield:'battlefield',nullshore:'northern',stadium:'pokemonarena',towncity:'cityhall',village:'village',cartoon:'dreamland',cruise:'northern',league:'pokemonarena',range:'ruins',
 smashville:'village',townandcity:'village',fountain:'fountain',hollowbastion:'fantasycastle',northerncave:'northern',dreamland:'dreamland',brinstar:'forge',greatcave:'northern',
};
for (const [key, backdrop] of Object.entries(REMASTERED_BACKDROPS)) {
  STAGES[key].backdrop=backdrop;
  if (!STAGES[key].surface) STAGES[key].surface=({city:'wood',hollow:'grass',arena:'steel',range:'stone',foundry:'steel',shrine:'stone',island:'stone',comet:'steel',rift:'steel'})[STAGES[key].theme] || 'stone';
}
// Legacy keys stay registered for saves, classic/bonus modes and old clients,
// but the versus selectors and random pool use their new replacements.
const LEGACY_STAGE_KEYS = new Set(['grandrift','colossalstadium','horizon','skyshrine','terminal','foundry','cometreach','hollow','field','bigfield','smallfield','nullshore','stadium','towncity','village','cartoon','cruise','league','range']);
const STAGE_KEYS = Object.keys(STAGES).filter(k => !LEGACY_STAGE_KEYS.has(k));

// Player-facing descriptions describe the implemented behavior, not the source
// games' unimplemented mechanics. Shared by offline and online stage selectors.
const STAGE_INFO = {
 smashville: {about:'A village-style arena with a single soft platform above the main deck.', perk:'The platform glides from side to side and carries fighters standing on it.', hazards:'With hazards off, the platform stays in the center.'},
 townandcity: {about:'A long town-and-city arena with changing platform formations.', perk:'The three-platform town layout alternates with a two-platform city layout; platforms travel offstage between formations.', hazards:'The platform transitions continue with hazards off.'},
 fountain: {about:'A dreamlike fountain arena with three elevated platforms.', perk:'The two side platforms rise and sink independently, sometimes disappearing into the floor.', hazards:'With hazards off, both side platforms remain still.'},
 hollowbastion: {about:'A castle backdrop and a central platform above a flat deck.', perk:'The central platform drifts, splits into two halves, and rejoins.', hazards:'This custom moving layout remains active with hazards off.'},
 northerncave: {about:'A glowing crater arena with two elevated platforms.', perk:'The platforms travel diagonally, carrying riders along.', hazards:'This custom moving layout remains active with hazards off.'},
 dreamland: {about:'A bright, three-platform landscape inspired by Dream Land.', perk:'Periodic gusts push fighters, alternating direction over time.', hazards:'Wind is disabled with hazards off.'},
 brinstar: {about:'A cavern arena above a rising pool of acid.', perk:'Acid damages fighters on contact; warned meteors strike the marked area and floor spikes hurt on contact.', hazards:'Acid, meteors and spikes are disabled with hazards off. Meteors are an original addition.'},
 tortimerisland: {about:'An XL tropical island with palm-height platforms and extra fighting space.', perk:'Healing fruit periodically drops from the palms; pick it up to recover damage.', hazards:'Fruit requires hazards on, even when ordinary items are off.'},
 pictochat2: {about:'A sketchbook-style arena with hand-drawn platforms.', perk:'Two different sets of platforms alternate, changing the available routes.', hazards:'With hazards off, the first set remains in place.'},
 newdonkcityhall: {about:'An XL city-hall arena with a wider deck and elevated scaffolds.', perk:'Two side lifts move up and down, carrying fighters standing on them.', hazards:'The lifts continue moving with hazards off; the main deck does not travel up the building.'},
 minecraftworld: {about:'An XL block-built grassland with a central floor gap, grabbable inner edges, and multiple soft platforms.', perk:'Attack the two lower block platforms to break them; they stay broken for the match.', hazards:'The breakable blocks are removed with hazards off. The floor gap and other platforms remain.'},
 mishimadojo: {about:'A flat wooden dojo enclosed by barriers when hazards are enabled.', perk:'Strong launches or repeated attacks break the side walls and ceiling. They repair after a delay once fighters are clear.', hazards:'With hazards off, the barriers are absent.'},
 wreckingcrew: {about:'An XL construction site with multiple scaffold levels.', perk:'Hit the central demolition charge to light its fuse. Its explosion damages nearby fighters and collapses a scaffold. Outer floor spikes hurt on contact.', hazards:'The charge, collapse and floor spikes require hazards on.'},
 flatzonex: {about:'A retro LCD-style arena whose platform silhouettes change.', perk:'Platforms alternate between layouts, and a temporary oil spill makes part of the floor slippery.', hazards:'With hazards off, the first layout stays and oil does not appear.'},
 kingoffighters: {about:'A flat tournament ring with invisible side barriers.', perk:'The walls stop movement and weak launches; a sufficiently strong outward launch breaks through for a KO.', hazards:'The ring barriers remain active even with hazards off.'},
 greatcave: {about:'An XL crystal cavern with several levels, a central gap with grabbable edges, and marked danger zones.', perk:'Touching a danger zone deals damage; fighters already at 100% or higher are instantly KO’d.', hazards:'The danger zones are disabled with hazards off; the floor gap remains.'},
 midgar: {about:'An industrial city arena with three platforms.', perk:'Touch summon materia when it appears to call a warned fire blast, platform lightning, or energy beam against opponents.', hazards:'Materia and summons require hazards on; the collector is spared.'},
 battlefield: {about:'A three-platform floating battlefield.', perk:'The elevated platforms rise and fall in a custom layout.', hazards:'Platforms stay still with hazards off. This motion is an original addition.'},
 smallbattlefield: {about:'A compact two-platform battlefield.', perk:'Platforms flash before temporarily disappearing one at a time.', hazards:'Both platforms stay present with hazards off. This is an original addition.'},
 bigbattlefield: {about:'An XL battlefield with six elevated platforms.', perk:'The platforms shift horizontally to open up changing routes.', hazards:'Platforms stay still with hazards off. This is an original addition.'},
 finaldestination: {about:'A flat arena with no soft platforms.', perk:'A marked area warns of a periodic energy strike that damages nearby fighters.', hazards:'The strike is disabled with hazards off. This is an original addition.'},
 pokemonstadium: {about:'A stadium arena that changes between different themed layouts.', perk:'The platform arrangement cycles through grass, water, fire and rock variations.', hazards:'With hazards off, it stays in the standard two-platform layout.'},
 pokemonstadium2: {about:'A stadium with elemental transformations.', perk:'Electric belts push outward, flying creates an updraft, and ice makes movement slippery; ground changes the layout.', hazards:'With hazards off, it stays in its standard layout without elemental effects.'},
 castlesiege: {about:'A castle arena with roof, interior and cavern-inspired formations.', perk:'The soft-platform arrangement cycles between the three formations.', hazards:'With hazards off, it stays in the roof layout.'},
 arenaferox: {about:'A stone coliseum with changing platforms.', perk:'The arena cycles through several different soft-platform layouts.', hazards:'With hazards off, the initial layout remains.'},
 springstadium: {about:'A stadium with an elevated center platform and pads at the deck edges.', perk:'While the edge and center-platform pads are active, hold jump on one for an extra-high jump; a short tap does not boost.', hazards:'The pads are inactive with hazards off.'},
 yoshistory: {about:'A compact storybook island with three raised platforms.', perk:'A roaming cloud offers a moving extra platform and can carry fighters.', hazards:'The cloud does not appear with hazards off.'},
};

/* ============================================================
   ITEMS  (GDD §8)
   ============================================================ */
const ITEMS = {
  beamsword: { name: 'BEAM SWORD', cat: 'batter', color: '#7ad4ff', icon: 'sword', dmg: 11, bkb: 18, kbs: 60, reach: 60, perk: 'reach' },
  homerunbat: { name: 'HOME-RUN BAT', cat: 'batter', color: '#c8a06a', icon: 'bat', dmg: 22, bkb: 40, kbs: 110, reach: 58, smashKO: 1, perk: 'launch' },
  starrod: { name: 'STAR ROD', cat: 'batter', color: '#ffd23a', icon: 'rod', dmg: 9, bkb: 16, kbs: 48, reach: 52, shoot: 1, perk: 'star' },
  bobomb: { name: 'BOB-OMB', cat: 'throw', color: '#3a4a8a', icon: 'bomb', dmg: 26, bkb: 34, kbs: 70, radius: 120 },
  shell: { name: 'GREEN SHELL', cat: 'throw', color: '#4ac85a', icon: 'shell', dmg: 13, bkb: 22, kbs: 55, radius: 46 },
  bumper: { name: 'BUMPER', cat: 'throw', color: '#e84a6a', icon: 'bumper', dmg: 8, bkb: 30, kbs: 40, radius: 40 },
  raygun: { name: 'RAY GUN', cat: 'shoot', color: '#ff5a8a', icon: 'gun', dmg: 6, bkb: 10, kbs: 26, ammo: 12 },
  fireflower: { name: 'FIRE FLOWER', cat: 'shoot', color: '#ff7a2a', icon: 'flower', dmg: 2, bkb: 2, kbs: 2, ammo: 60, flame: 1 },
  heart: { name: 'HEART CONTAINER', cat: 'heal', color: '#ff4a6a', icon: 'heart', heal: 999 },
  tomato: { name: 'MAXIM TOMATO', cat: 'heal', color: '#ff2a2a', icon: 'tomato', heal: 50 },
  food: { name: 'FOOD', cat: 'heal', color: '#e8a04a', icon: 'food', heal: 6 },
  star: { name: 'SUPER STAR', cat: 'status', color: '#ffe04a', icon: 'star', dur: 540, invincible: 1 },
  mushroom: { name: 'SUPER MUSHROOM', cat: 'status', color: '#ff4a3a', icon: 'mushroom', dur: 600, scale: 1.35 },
  poison: { name: 'POISON MUSHROOM', cat: 'status', color: '#8a4aff', icon: 'poison', dur: 600, scale: 0.72 },
  metalbox: { name: 'METAL BOX', cat: 'status', color: '#9aa8b8', icon: 'metal', dur: 600, weight: 2.6, fallMul: 1.9 },
  bunnyhood: { name: 'BUNNY HOOD', cat: 'status', color: '#ffb8d8', icon: 'bunny', dur: 600, speed: 1.55 },
  crate: { name: 'CRATE', cat: 'container', color: '#b88a4a', icon: 'crate', hp: 22, spawns: 2 },
  capsule: { name: 'CAPSULE', cat: 'container', color: '#d8d8e8', icon: 'capsule', hp: 12, spawns: 1, explode: 0.2 },
  riftorb: { name: 'RIFT ORB', cat: 'summon', color: '#c77dff', icon: 'orb', dur: 480, summon: 'sprite' },
  assist: { name: 'SIGIL TROPHY', cat: 'summon', color: '#22e08a', icon: 'trophy', dur: 480, summon: 'sigil' },
  smashball: { name: 'SMASH BALL', cat: 'special', color: '#ffe04a', icon: 'smash', hp: 120 },
  hammer: { name: 'HAMMER', cat: 'special', color: '#c8a06a', icon: 'hammer', dur: 480, dmg: 18, headless: 0.25, perk: 'heavy' },
};
const ITEM_KEYS = Object.keys(ITEMS);
const ITEM_POOL_COMMON = ['beamsword', 'homerunbat', 'starrod', 'bobomb', 'shell', 'bumper', 'raygun', 'fireflower', 'heart', 'tomato', 'food', 'food', 'star', 'mushroom', 'poison', 'metalbox', 'bunnyhood', 'crate', 'capsule', 'riftorb', 'assist', 'hammer'];

/* ============================================================
   RULES DEFAULTS
   ============================================================ */
/* Blocking is not free.  A shield used to absorb a hit *entirely*: `shieldHit`
   spent shield HP and gave shield-stun, and the defender's damage meter never
   moved.  Against anyone who holds shield while you run at them — which is what
   a dash attack meets in every real rally — the attack looked and sounded like it
   connected (sparks, hitlag, the shield ring, shield HP draining) while the percent
   stayed frozen, so the overwhelmingly reasonable read was "my dash attack deals no
   damage".  A blocked hit now bleeds a fraction of its damage through — a house
   rule, chosen over "shields absorb everything" because a fight where blocking costs
   nothing has no answer to a shield except waiting — and the chip is credited to the
   attacker so it lands in the combo/records path like any other hit.
   `chip` is a fraction of the move's authored damage; 0 keeps the old behaviour. */
const SHIELD = {
  chip: 0.3,
  chipMin: 1,
};

const DEFAULT_RULES = {
  mode: 'stock',
  stocks: 3,
  time: 150,
  players: 2,
  cpus: [false, true, false, false],
  teams: false,
  teamAssign: [0, 1, 0, 1],
  teamAttack: false,
  items: 'medium',
  stage: 'battlefield',
  stageRandom: false,
  aiLevel: 5,
  hazards: true,
  damageRatio: 1,
  stocks8: false,
};
