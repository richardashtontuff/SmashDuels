/* ============================================================
   RIFT RUMBLE — core: utils, math, input, audio, storage
   ============================================================ */
'use strict';

/* ---------- build ---------- */
/* The preview (and any plain static host) serves these files with no Cache-Control at
   all, so a browser tab is free to keep executing a js file it fetched hours ago and
   never ask again — which is how a fixed move stays "still broken" while every test
   about it is green.  The version rides on the URL, so a new build cannot be reused
   from cache.  Bump this in the same commit as any change under game/js or game/assets;
   tools/atlascheck.js fails the build if index.html or the asset loader drifts from it,
   and the preview is served by tools/serve.py, which sends no-cache headers for the same reason,
   and `UI.diag().build` / the console banner say which build is actually running. */
const BUILD = 'K49';

/* ---------- math / utils ---------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b = null) => b === null ? Math.random() * a : a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const chance = p => Math.random() < p;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sign = v => v < 0 ? -1 : v > 0 ? 1 : 0;
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
const deg = r => r * 180 / Math.PI;
const rad = d => d * 180 / Math.PI * 0 + d * Math.PI / 180;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const aabb = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/* sRGB lerp for color blending */
function hex2rgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const rgb2hex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
function mixColor(c1, c2, t) {
  const a = hex2rgb(c1), b = hex2rgb(c2);
  return rgb2hex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
}
function shade(c, amt) { // amt -1..1
  const [r, g, b] = hex2rgb(c);
  if (amt > 0) return rgb2hex(lerp(r, 255, amt), lerp(g, 255, amt), lerp(b, 255, amt));
  return rgb2hex(lerp(r, 0, -amt), lerp(g, 0, -amt), lerp(b, 0, -amt));
}
function withAlpha(hex, a) {
  const [r, g, b] = hex2rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* RNG for determinism in tests */
let __seed = 1;
function srand(s) { __seed = s >>> 0 || 1; }
function srandom() { // mulberry32
  __seed |= 0; __seed = __seed + 0x6D2B79F5 | 0;
  let t = Math.imul(__seed ^ __seed >>> 15, 1 | __seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

/* ---------- input ---------- */
const INPUT = {
  keys: {}, pressed: {}, released: {},
  map: {
    p1: { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', attack: 'KeyF', special: 'KeyG', jump: 'Space', shield: 'KeyC', grab: 'KeyV' },
    p2: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', attack: 'Numpad1', special: 'Numpad2', jump: 'Numpad3', shield: 'Numpad0', grab: 'Numpad4' },
    p3: { left: 'KeyJ', right: 'KeyL', up: 'KeyI', down: 'KeyK', attack: 'KeyU', special: 'KeyO', jump: 'KeyP', shield: 'KeyH', grab: 'KeyY' },
    p4: { left: 'Numpad4', right: 'Numpad6', up: 'Numpad8', down: 'Numpad5', attack: 'Numpad7', special: 'Numpad9', jump: 'Numpad0', shield: 'Numpad1', grab: 'Numpad2' },
  },
  init() {
    addEventListener('keydown', e => {
      const editing = e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if (editing) return;
      if (!e.repeat) { INPUT.pressed[e.code] = true; }
      INPUT.keys[e.code] = true;
      const inMatch = typeof UI !== 'undefined' && UI.current === 'screen-match';
      if (inMatch && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape') window.dispatchEvent(new Event('ui-escape'));
      if (e.code === 'Enter' && !e.repeat) window.dispatchEvent(new Event('ui-enter'));
      if (e.code === 'KeyM' && !e.repeat) AUDIO.toggleMute();
    });
    addEventListener('keyup', e => { INPUT.keys[e.code] = false; INPUT.released[e.code] = true; });
    addEventListener('blur', () => { INPUT.keys = {}; });
  },
  down(code) { return !!INPUT.keys[code]; },
  hit(code) { return !!INPUT.pressed[code]; },
  endFrame() { INPUT.pressed = {}; INPUT.released = {}; },
};

/* gamepad support */
const GAMEPADS = {
  state: [],
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    GAMEPADS.state = [];
    for (const pad of pads) {
      if (!pad) continue;
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      const b = i => !!(pad.buttons[i] && pad.buttons[i].pressed);
      GAMEPADS.state.push({
        left: ax < -0.35 || b(14), right: ax > 0.35 || b(15),
        up: ay < -0.5 || b(12), down: ay > 0.5 || b(13),
        attack: b(0), special: b(2) || b(1), jump: b(3), shield: b(4) || b(6), grab: b(5) || b(7),
      });
    }
  }
};

/* ---------- audio (procedural WebAudio) ---------- */
const AUDIO = {
  ctx: null, master: null, muted: false, musicGain: null, sfxGain: null,
  musicTimer: null, musicStep: 0, enabled: true,
  init() {
    if (AUDIO.ctx) return;
    try {
      AUDIO.ctx = new (window.AudioContext || window.webkitAudioContext)();
      AUDIO.master = AUDIO.ctx.createGain(); AUDIO.master.gain.value = AUDIO.muted ? 0 : 0.6; AUDIO.master.connect(AUDIO.ctx.destination);
      AUDIO.sfxGain = AUDIO.ctx.createGain(); AUDIO.sfxGain.gain.value = 0.9; AUDIO.sfxGain.connect(AUDIO.master);
      AUDIO.musicGain = AUDIO.ctx.createGain(); AUDIO.musicGain.gain.value = 0.22; AUDIO.musicGain.connect(AUDIO.master);
    } catch (e) { AUDIO.enabled = false; }
  },
  resume() { if (AUDIO.ctx && AUDIO.ctx.state === 'suspended') AUDIO.ctx.resume(); },
  toggleMute() {
    AUDIO.muted = !AUDIO.muted;
    if (AUDIO.master) AUDIO.master.gain.value = AUDIO.muted ? 0 : 0.6;
    UI.toast(AUDIO.muted ? 'SOUND OFF' : 'SOUND ON');
  },
  env(node, t0, a, d, peak = 0.5) {
    const g = AUDIO.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    node.connect(g); return g;
  },
  tone(freq, dur = 0.1, type = 'sine', vol = 0.3, slideTo = null, dest = null) {
    if (!AUDIO.enabled || !AUDIO.ctx) return;
    const t = AUDIO.ctx.currentTime;
    const o = AUDIO.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = AUDIO.env(o, t, 0.004, dur, vol);
    g.connect(dest || AUDIO.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur = 0.12, vol = 0.3, filterFreq = 1200, q = 1, slideTo = null) {
    if (!AUDIO.enabled || !AUDIO.ctx) return;
    const ctx = AUDIO.ctx, t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(filterFreq, t); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, slideTo), t + dur);
    src.connect(f);
    const g = AUDIO.env(f, t, 0.005, dur, vol);
    g.connect(AUDIO.sfxGain);
    src.start(t);
  },
  /* named SFX */
  sfx(name, opts = {}) {
    if (!AUDIO.enabled || (SAVE.data && SAVE.data.settings && SAVE.data.settings.sfx === false)) return;
    switch (name) {
      case 'hit': {
        const power = clamp(opts.power ?? 0.3, 0, 1);
        AUDIO.noise(0.06 + power * 0.18, 0.28 + power * 0.4, 900 + power * 3500, 0.8, 200);
        AUDIO.tone(150 + power * 120, 0.08 + power * 0.1, 'square', 0.12 + power * 0.22, 60 + power * 40);
        break;
      }
      case 'swing': AUDIO.noise(0.09, 0.12, 1800, 2, 700); break;
      case 'jump': AUDIO.tone(320, 0.12, 'triangle', 0.16, 620); break;
      case 'djump': AUDIO.tone(420, 0.16, 'triangle', 0.16, 900); break;
      case 'land': AUDIO.noise(0.07, 0.14, 500, 1, 120); break;
      case 'shieldUp': AUDIO.tone(700, 0.14, 'sine', 0.14, 1100); break;
      case 'shieldHit': AUDIO.tone(900, 0.08, 'square', 0.1, 500); AUDIO.noise(0.06, 0.12, 2200, 2); break;
      case 'shieldBreak': AUDIO.noise(0.35, 0.4, 4000, 1, 300); AUDIO.tone(1200, 0.4, 'sawtooth', 0.2, 90); break;
      case 'grab': AUDIO.tone(260, 0.08, 'square', 0.18, 190); break;
      case 'throw': AUDIO.noise(0.22, 0.3, 1400, 1, 200); AUDIO.tone(200, 0.2, 'triangle', 0.16, 80); break;
      case 'dodge': AUDIO.noise(0.16, 0.14, 2600, 1.4, 900); break;
      case 'ko': AUDIO.noise(0.7, 0.5, 3000, 0.6, 100); AUDIO.tone(180, 0.7, 'sawtooth', 0.3, 40); break;
      case 'starKO': AUDIO.tone(1200, 0.6, 'sine', 0.22, 2400); break;
      case 'respawn': AUDIO.tone(520, 0.3, 'sine', 0.18, 1040); break;
      case 'itemSpawn': AUDIO.tone(880, 0.1, 'sine', 0.12, 1320); break;
      case 'pickup': AUDIO.tone(660, 0.1, 'square', 0.14, 990); break;
      case 'smashBall': AUDIO.tone(440, 0.5, 'sawtooth', 0.16, 1760); AUDIO.tone(660, 0.5, 'square', 0.1, 2200); break;
      case 'final': AUDIO.noise(1.1, 0.5, 5000, 0.6, 200); AUDIO.tone(90, 1.1, 'sawtooth', 0.3, 30); break;
      case 'shoot': AUDIO.tone(1000, 0.07, 'square', 0.1, 380); break;
      case 'beep': AUDIO.tone(880, 0.09, 'square', 0.16); break;
      case 'beepHi': AUDIO.tone(1320, 0.12, 'square', 0.16); break;
      case 'go': AUDIO.tone(1760, 0.22, 'square', 0.2); AUDIO.tone(880, 0.22, 'square', 0.12); break;
      case 'game': AUDIO.tone(880, 0.5, 'square', 0.2, 440); break;
      case 'menu': AUDIO.tone(520, 0.06, 'square', 0.1, 700); break;
      case 'confirm': AUDIO.tone(720, 0.08, 'square', 0.14, 1080); AUDIO.tone(1440, 0.1, 'sine', 0.08, 1800); break;
      case 'back': AUDIO.tone(400, 0.08, 'square', 0.12, 260); break;
      case 'heal': AUDIO.tone(660, 0.12, 'sine', 0.16, 990); AUDIO.tone(990, 0.16, 'sine', 0.12, 1320); break;
      case 'bomb': AUDIO.noise(0.5, 0.5, 2500, 0.7, 90); AUDIO.tone(90, 0.5, 'sawtooth', 0.3, 30); break;
      case 'bat': AUDIO.noise(0.18, 0.4, 1200, 1, 300); AUDIO.tone(260, 0.18, 'square', 0.26, 90); break;
      case 'taunt': AUDIO.tone(600, 0.08, 'triangle', 0.1, 900); break;
      case 'ledge': AUDIO.noise(0.08, 0.1, 700, 1, 300); break;
    }
  },
  /* simple looping chiptune */
  startMusic() {
    if (!AUDIO.enabled || !AUDIO.ctx || (SAVE.data && SAVE.data.settings && SAVE.data.settings.music === false)) return;
    if (AUDIO.musicTimer) return;
    const scale = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19];
    const bass = [0, 0, 5, 5, 3, 3, 7, 7];
    let step = 0;
    const tick = () => {
      if (!AUDIO.ctx) return;
      const t = AUDIO.ctx.currentTime;
      if (step % 2 === 0) {
        const n = scale[(step / 2 | 0) % scale.length] + 12;
        const o = AUDIO.ctx.createOscillator(); o.type = 'square';
        o.frequency.value = 220 * Math.pow(2, n / 12);
        const g = AUDIO.env(o, t, 0.01, 0.14, 0.05);
        g.connect(AUDIO.musicGain); o.start(t); o.stop(t + 0.2);
      }
      if (step % 8 === 0) {
        const n = bass[(step / 8 | 0) % bass.length];
        const o = AUDIO.ctx.createOscillator(); o.type = 'triangle';
        o.frequency.value = 110 * Math.pow(2, n / 12);
        const g = AUDIO.env(o, t, 0.02, 0.5, 0.09);
        g.connect(AUDIO.musicGain); o.start(t); o.stop(t + 0.6);
      }
      step++;
    };
    AUDIO.musicTimer = setInterval(tick, 155);
  },
  stopMusic() { if (AUDIO.musicTimer) { clearInterval(AUDIO.musicTimer); AUDIO.musicTimer = null; } },
};

/* ---------- persistence ---------- */
const SAVE = {
  KEY: 'rift-rumble-save-v1',
  data: null,
  load() {
    try { SAVE.data = JSON.parse(localStorage.getItem(SAVE.KEY)) || null; } catch (e) { SAVE.data = null; }
    if (!SAVE.data) {
      SAVE.data = {
        unlocked: ['valor', 'grim', 'astra', 'vesper', 'rook'],
        stats: {}, coins: 0, matches: 0, challengesDone: [], records: {},
        settings: { music: true, sfx: true },
      };
    }
    SAVE.data.settings = Object.assign({ music: true, sfx: true }, SAVE.data.settings || {});
    if (!Array.isArray(SAVE.data.unlocked)) SAVE.data.unlocked = [];
    for (const k of FIGHTER_KEYS) if (!SAVE.data.unlocked.includes(k)) SAVE.data.unlocked.push(k);
    return SAVE.data;
  },
  save() {
    try { localStorage.setItem(SAVE.KEY, JSON.stringify(SAVE.data)); } catch (e) { }
    // Optional cross-device mirror (see js/cloud.js).  When cloud saves are off
    // this costs one boolean test; it can never block or break the local write.
    try { if (typeof CloudSave !== 'undefined' && CloudSave) CloudSave.queue(); } catch (e) { }
  },
  stat(key, inc = 1) {
    SAVE.data.stats[key] = (SAVE.data.stats[key] || 0) + inc;
    SAVE.save();
  },
  challengeDone(id) {
    if (!SAVE.data.challengesDone.includes(id)) { SAVE.data.challengesDone.push(id); SAVE.save(); return true; }
    return false;
  },
};
