/* ============================================================
   tools/animtest.js — animation timing, movement states, hitbox geometry
   ------------------------------------------------------------
   atlascheck.js proves the atlas is well-formed.  simtest.js proves the
   simulation stays finite.  Neither could catch the bug this suite exists for:
   the shipped animation was structurally valid and *still* felt wrong, because
   nothing checked WHEN a frame is shown against WHAT the sim is doing on that
   tick.  Every test here is an invariant across the two layers, driven at a fixed
   60 Hz tick through the real modules, with the wall clock out of it entirely
   (pickAnim takes a `time` argument for its callers and ignores it).

     node tools/animtest.js
     node tools/animtest.js strike      run tests whose name matches
     V=1 node tools/animtest.js         print failure stacks / the fallback list
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { boot, cast, control, newMatch, makeRunner, makeCtx, GAME } = require('./harness');

const T = makeRunner();
const { test, assert, near } = T;

const KEYS = ['valor', 'grim', 'astra', 'vesper', 'rook'];
const MOVES = ['jab', 'ftilt', 'utilt', 'dtilt', 'dashattack', 'fsmash', 'usmash', 'dsmash',
  'nair', 'fair', 'bair', 'uair', 'dair'];

let shared = null;
function roster() {
  if (shared) return shared;
  const h = boot({ render: true, record: true });
  h.g.Sprites.load();
  shared = h.settle(14).then(() => h);
  return shared;
}
const readMeta = (key) => JSON.parse(fs.readFileSync(path.join(GAME, 'assets/atlas', key + '.json'), 'utf8'));

/* A duel on the ground, planted, far enough apart that a movement test never
   ends up measuring a body collision. */
function pair(h, ka, kb, ax = 400, bx = 470) {
  const m = newMatch(h.ctx, cast(2, [ka, kb]), 'skyshrine', { state: 'play' });
  control(m).tick(2);
  m.fighters.forEach((f, i) => {
    f.x = i ? bx : ax; f.y = m.stage.ground.y; f.vx = 0; f.vy = 0;
    f.onGround = true; f.onPlatform = null; f.facing = i ? -1 : 1;
    f.hitstun = 0; f.hitlag = 0; f.shieldHP = 0; f.stunT = 0; f.grabbedBy = null;
    f.invincT = 0; f.spawnProtect = 0; f.comboCount = 0;
  });
  return m;
}
/* Drive both fighters; `sample` runs once per tick, after the sim has resolved. */
function play(m, n, input, sample) {
  const out = [];
  for (let i = 0; i < n; i++) {
    m.fighters.forEach((f, k) => { f.__raw = (input && input(f, k, i, m)) || {}; });
    m.update();
    if (sample) out.push(sample(m.fighters[0], i, m));
  }
  return out;
}
/* Which tile is on screen on the ticks this move can actually deal damage. */
async function liveFrames(key, kind) {
  const h = await roster();
  const S = h.g.Sprites;
  const m = pair(h, key, 'grim');
  const f = m.fighters[0];
  const a = h.g.FIGHTERS[key].moves[kind];
  const live = [];
  const orig = f.checkHit;
  f.checkHit = function (mm, mult) {
    const sel = S.pickAnim(f, 0);
    live.push({ t: f.actionT, i: sel ? sel.i : -1, name: sel && sel.name });
    return orig.call(this, mm, mult);
  };
  f.startAttack(kind, m);
  play(m, a.frames + 8);
  f.checkHit = orig;
  return { h, S, m, f, a, live, anim: S.MOVE_ANIM[kind], row: (readMeta(key).anims[S.MOVE_ANIM[kind]] || []) };
}

/* =================== the clock =================== */
test('clock: animation advances on game ticks, never on wall time', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  const m = pair(h, 'valor', 'grim');
  const f = m.fighters[0];
  for (let i = 0; i < 90; i++) {
    m.update();
    const a = S.pickAnim(f, i * 977).i;          // nonsense wall times must not matter
    const b = S.pickAnim(f, i * 13 + 4).i;       // a second reader in the same tick
    assert(a === b, `tick ${i}: two draws disagreed (${a} vs ${b})`);
  }
  const row = readMeta('valor').anims.idle.length;
  const seen = new Set();
  for (let i = 0; i < row * 8; i++) { m.update(); seen.add(S.pickAnim(f, 0).i); }
  assert(seen.size === row, `idle showed ${seen.size} of ${row} tiles over 8 cycles`);
  // and it must come round in the same order every cycle: a pure loop, not noise
  const period = row * S.STATE_ANIM.idle.step;
  const cyc = [];
  for (let i = 0; i < period * 3; i++) { m.update(); cyc.push(S.pickAnim(f, 0).i); }
  for (let i = period; i < cyc.length; i++) assert(cyc[i] === cyc[i - period], `the idle cycle is not periodic at tick ${i}`);
  assert(new Set(cyc.slice(0, period)).size === row, 'one full cycle did not show every frame');
});

test('clock: hitlag freezes the pose instead of cycling it', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  const m = pair(h, 'valor', 'grim');
  const f = m.fighters[0];
  play(m, 6);
  const before = S.pickAnim(f, 0).i;
  f.hitlag = 12;
  let moved = 0;
  for (let i = 0; i < 8; i++) { f.animT++; if (S.pickAnim(f, 0).i !== before) moved++; }
  assert(moved === 0, `the frame changed ${moved}x during an impact freeze`);
  f.hitlag = 0;
  play(m, 24);
  assert(S.pickAnim(f, 0).i !== before, 'the cycle never resumed after the freeze');
});

/* =================== strike ↔ hitbox =================== */
/* The point of the rework, stated exactly: on every tick a move can deal damage,
   the tile on screen must be the tile the art says the blow lands on — where the
   "art says" comes from the shipped tile geometry, not from a proxy metric. */
test('strike: the drawn strike frame is live for every tick of every move', async () => {
  const bad = [], broken = [];
  for (const key of KEYS) {
    for (const kind of MOVES) {
      const r = await liveFrames(key, kind);
      const geo = r.S.atlas(key).strike[r.anim];
      if (!r.live.length) { broken.push(`${key}.${kind}: the hitbox was never live`); continue; }
      if (r.live.length !== r.a.active) broken.push(`${key}.${kind}: ${r.live.length} live ticks for active=${r.a.active}`);
      for (const L of r.live) {
        if (L.name !== r.anim) bad.push(`${key}.${kind}: the hit window played the "${L.name}" row`);
        if (geo && L.i !== geo.k) bad.push(`${key}.${kind}: live on tile ${L.i}, art says the blow is tile ${geo.k}`);
        if (!(L.i >= 0 && L.i < Math.max(1, r.row.length))) bad.push(`${key}.${kind}: frame ${L.i} outside a row of ${r.row.length}`);
      }
      assert(r.a.frames - r.a.startup - r.a.active >= 4, `${key}.${kind}: no recovery to speak of`);
    }
  }
  assert(!broken.length, broken.join('\n        '));
  assert(!bad.length, bad.slice(0, 8).join('\n        ') + (bad.length > 8 ? `\n        …${bad.length} more` : ''));
});

test('strike: no move holds one frame for its whole animation', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  const stale = [];
  for (const key of KEYS) {
    for (const kind of MOVES) {
      const a = h.g.FIGHTERS[key].moves[kind];
      const row = readMeta(key).anims[S.MOVE_ANIM[kind]] || [];
      if (row.length < 2) continue;               // one frame of art: attackSwing carries it
      const m = pair(h, key, 'grim');
      const f = m.fighters[0];
      const seen = new Set();
      f.startAttack(kind, m);
      for (let i = 0; i < a.frames; i++) { m.update(); seen.add(S.pickAnim(f, 0).i); }
      if (seen.size < 2) stale.push(`${key}.${kind}: showed only frame ${[...seen]} for ${a.frames} ticks`);
      // and the strike pose must not still be up at the end of the recovery
      const geo = S.atlas(key).strike[S.MOVE_ANIM[kind]];
      if (geo && geo.poses > 1 && a.frames - a.startup - a.active > 6 && geo.k !== row.length - 1) {
        const q = pair(h, key, 'grim');
        const g = q.fighters[0];
        g.startAttack(kind, q);
        for (let i = 0; i < a.frames - 1; i++) q.update();
        if (S.pickAnim(g, 0).i === geo.k) stale.push(`${key}.${kind}: still on the strike pose on the last recovery tick`);
      }
    }
  }
  assert(!stale.length, stale.slice(0, 10).join('\n        '));
});

test('strike: a held charge waits in the anticipation pose and never shows the blow early', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  const bad = [];
  for (const key of KEYS) {
    for (const kind of ['fsmash', 'usmash', 'dsmash']) {
      const a = h.g.FIGHTERS[key].moves[kind];
      if (!a.charge) continue;
      const anim = S.MOVE_ANIM[kind];
      const geo = S.atlas(key).strike[anim];
      const row = readMeta(key).anims[anim] || [];
      // a charge can only hold a *different* pose if the row actually drew one
      if (!geo || row.length < 2 || geo.poses < 2) continue;
      const m = pair(h, key, 'grim');
      const f = m.fighters[0];
      f.startAttack(kind, m);
      let early = 0, charged = 0;
      for (let i = 0; i < 34; i++) {
        m.fighters.forEach((g, k) => { g.__raw = k === 0 ? { attack: true } : {}; });
        m.update();
        const sel = S.pickAnim(f, 0);
        if (f.charging) { charged++; if (sel.i === geo.k) early++; }
        else if (f.state === 'attack' && f.actionT < a.startup - 1 && sel.i === geo.k) early++;
      }
      if (!charged) bad.push(`${key}.${kind}: the charge never held a frame`);
      if (early) bad.push(`${key}.${kind}: the strike pose appeared ${early}x before the hit window`);
    }
  }
  assert(!bad.length, bad.join('\n        '));
});

/* =================== the effect layer ===================
   Half of why a one-tile smash read as a still image: the crescent is painted into
   the same tile as the pose, so the finished blow was on screen from tick 0 —
   anticipation, hit and recovery all looked identical.  Sprites.vfxGate fades the
   baked layers in across the wind-up, holds them at full strength for exactly the
   ticks the hitbox is live, and lets them fall away afterwards. */
test('vfx: the glow builds through the wind-up and is full only while the box is live', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  const bad = [], glow = [];
  for (const key of KEYS) {
    const at = S.atlas(key);
    for (const kind of MOVES) {
      const anim = S.MOVE_ANIM[kind];
      const rows = at.anims[anim];
      if (!rows || !rows.length) continue;
      const hasFx = rows.some((ent) => ent[3] && ent[3].length);
      if (hasFx) glow.push(`${key}.${kind}`);
      const m = pair(h, key, 'grim');
      const f = m.fighters[0];
      f.x = 500; f.y = m.stage.ground.y; f.facing = 1;
      const a = f.def.moves[kind];
      f.startAttack(kind, m); f.charging = false;
      let prev = -1, rising = true, rec0 = null, recEnd = null;
      for (let t = 0; t < a.frames + 1; t++) {
        f.actionT = t; f.animT = t;
        const sel = S.pickAnim(f, 0);
        const g = sel.vfx;
        if (!Number.isFinite(g) || g < 0 || g > 1.0001) { bad.push(`${key}.${kind} t${t}: gate ${g}`); break; }
        if (t < a.startup) {
          if (hasFx && g > 0.62) bad.push(`${key}.${kind}: the full effect is on screen at tick ${t} of ${a.startup} wind-up`);
          if (g < prev - 0.001) rising = false;
        } else if (t < a.startup + (a.active || 1)) {
          if (hasFx && Math.abs(g - 1) > 0.001) bad.push(`${key}.${kind}: the effect is ${g} while the hitbox is live (tick ${t})`);
        } else if (rec0 === null) rec0 = t;
        if (t >= a.startup + (a.active || 1)) recEnd = g;
        prev = g;
      }
      if (!rising) bad.push(`${key}.${kind}: the wind-up glow flickers instead of building`);
      /* The fade has to be a fade: full strength on the last live tick (that is the
         impact) and clearly off by the end of recovery, whenever recovery is long
         enough to be watched. */
      if (hasFx && rec0 !== null && a.frames - rec0 > 5 && recEnd > 0.5) {
        bad.push(`${key}.${kind}: the effect is still ${recEnd.toFixed(2)} ${a.frames - rec0} ticks after the hit`);
      }
      f.state = 'idle'; f.action = null; f.actionT = 0;
      if (S.pickAnim(f, 0).vfx !== 1) bad.push(`${key}.${kind}: a fighter outside the attack keeps a gated glow`);
    }
  }
  assert(!bad.length, bad.slice(0, 8).join('\n        ') + (bad.length > 8 ? `\n        …${bad.length} more` : ''));
  assert(glow.length >= 4, `only ${glow.length} attack rows carry a baked effect layer — the assert is vacuous`);
  console.log(`        (${glow.length} attack rows keep their VFX as a separate layer, and the gate holds those off through the wind-up)`);
});

test('vfx: it reaches the canvas as a dimmer blit, and the body stays opaque', async () => {
  const h = await roster({ render: true });
  const S = h.g.Sprites;
  const rec = { ops: [], stack: [] };
  const ctx = GAME.makeCtx ? GAME.makeCtx(rec) : require('./harness').makeCtx(rec);
  const m = pair(h, 'valor', 'grim');
  const f = m.fighters[0];
  f.x = 500; f.y = m.stage.ground.y; f.facing = 1;
  const a = f.def.moves.fsmash;
  f.startAttack('fsmash', m); f.charging = false;
  const sample = (t) => {
    f.actionT = t; f.animT = t;
    rec.ops.length = 0;
    ctx.globalAlpha = 1;
    S.drawSpriteFighter(ctx, f, t * 16.7);
    return rec.ops.filter((o) => o.op === 'drawImage' && o.finite).map((o) => Math.round(o.alpha * 100) / 100);
  };
  const first = sample(1);
  const wind = sample(Math.max(0, a.startup - 2));
  const live = sample(a.startup + 1);
  if (wind.length >= 2 && live.length >= 2 && wind.length === live.length) {
    assert(wind[0] > 0.99 && live[0] > 0.99, `the figure itself went translucent: wind-up ${wind.join('/')} active ${live.join('/')}`);
    const fxWind = wind[wind.length - 1], fxLive = live[live.length - 1];
    assert(fxWind < fxLive, `the glow is ${fxWind} at the end of the wind-up and ${fxLive} on impact — no build`);
    assert(first[0] > 0.99 && first[first.length - 1] < fxWind,
      `tick 1 glows at ${first[first.length - 1]} against ${fxWind} at the end of the wind-up: not building from cold`);
    console.log(`        (fsmash: glow alpha ${first[first.length - 1]} → ${fxWind} → ${fxLive} across wind-up, impact)`);
  }
});

test('attack: a thin row is never the same picture on wind-up, hit and recovery', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  const rec = { ops: [], stack: [] };
  const ctx = require('./harness').makeCtx(rec);
  const bad = [], thin = [];
  for (const key of KEYS) {
    const at = S.atlas(key);
    const m = pair(h, key, 'grim');
    const f = m.fighters[0];
    f.x = 500; f.y = m.stage.ground.y; f.facing = 1;
    for (const kind of MOVES) {
      const anim = S.MOVE_ANIM[kind];
      const rows = at.anims[anim];
      if (!rows || !rows.length) continue;
      const a = f.def.moves[kind];
      f.startAttack(kind, m); f.charging = false;
      /* What the canvas is actually told to do, tick by tick: the tile index *and*
         the transform it is drawn through.  Two ticks are "the same picture" only
         if both agree — which is precisely what a 1-frame smash used to be. */
      const shot = (t) => {
        f.actionT = t; f.animT = t;
        const sel = S.pickAnim(f, 0);
        rec.ops.length = 0;
        ctx.globalAlpha = 1;
        S.drawSpriteFighter(ctx, f, t * 16.7);
        const o = rec.ops.find((x) => x.op === 'drawImage' && x.finite);
        return { i: sel.i, m: o ? o.matrix.map((v) => Math.round(v * 100) / 100).join(',') : '' };
      };
      const wind = shot(1);
      const live = shot(a.startup + 1);
      const end = shot(Math.max(a.startup + (a.active || 1) + 1, a.frames - 1));
      if (rows.length <= 2) thin.push(`${key}.${kind}`);
      if (wind.i === live.i && wind.m === live.m) bad.push(`${key}.${kind}: the wind-up and the hit draw the identical picture`);
      if (live.i === end.i && live.m === end.m) bad.push(`${key}.${kind}: the hit and the end of recovery draw the identical picture`);
      f.state = 'idle'; f.action = null;
    }
  }
  assert(!bad.length, bad.slice(0, 8).join('\n        ') + (bad.length > 8 ? `\n        …${bad.length} more` : ''));
  console.log(`        (${thin.length} of ${KEYS.length * MOVES.length} attack rows have 1-2 tiles of art and lean on the swing transform)`);
});

/* =================== hitbox geometry ===================
   What the engine is allowed to do with the art (Sprites.attackBox), stated as
   four claims about shipped numbers rather than as a re-run of the engine:

     P1  where a pose paints past the authored edge — and the ink that does it is
         the limb itself, within one drawn body-height — the box must reach it;
     P2  no edge may move out further than that budget, so no swing gets a
         runaway box;
     P3  the band *across* the blow axis stays exactly as authored: Valor's side
         smash paints a crescent over his head, and when that got a vote the
         forward smash grew a 138px-tall box that reversed anyone standing above
         him;
     P4  the art may only ever push an edge out, never pull one in.

   The axis is derived here from the move's own name (`u`/`d` vertical, `b`
   backwards) instead of from Sprites.rowDir, so a wrong direction table shows up
   as a failure here rather than as an agreement between two copies of the same
   mistake.  Rows the slicer could not split have no usable geometry and keep
   their authored rectangle — LOG-14's list, counted so it cannot silently grow. */
test('hitbox: the art lines the box up with the limb, along the blow axis only', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  const bad = [], fallback = [];
  let followed = 0, worst = { add: 0, at: '' };
  const total = KEYS.length * MOVES.length;
  for (const key of KEYS) {
    const at = S.atlas(key);
    const budget = 0.85 * at.unit * at.scale;        // one drawn body-height
    for (const kind of MOVES) {
      const anim = S.MOVE_ANIM[kind];
      const geo = at.strike[anim];
      const ink = geo && at.box[anim] && at.box[anim][geo.k];
      if (!ink) { fallback.push(`${key}.${kind}`); continue; }
      /* which edge this move's blow travels along — spelled out per move rather
         than read back out of Sprites.rowDir, so a wrong direction table cannot
         agree with itself (`dashattack` is a forward move whose name starts with
         the letter that means "down" elsewhere) */
      const AXIS = { jab: 'f', ftilt: 'f', fsmash: 'f', dashattack: 'f', fair: 'f',
        bair: 'b', nair: 'n', utilt: 'u', usmash: 'u', uair: 'u',
        dtilt: 'd', dsmash: 'd', dair: 'd' };
      const ax = AXIS[kind] || 'f';
      const vert = ax === 'u' || ax === 'd';
      const mv = h.g.FIGHTERS[key].moves[kind];
      for (const b of (mv.hitboxes || [])) {
        const r = S.attackBox(key, anim, geo.k, b);
        // P2 + P4, on all four edges
        const add = Math.max(r.x1 - (b.x + b.w), b.x - r.x0, (b.y + b.h) - r.y1, r.y0 - b.y);
        if (add > worst.add) worst = { add, at: `${key}.${kind}` };
        if (add > budget + 0.01) bad.push(`${key}.${kind}: an edge moved out ${add.toFixed(1)}px (budget ${budget.toFixed(1)})`);
        if (r.x0 > b.x + 0.01 || r.x1 < b.x + b.w - 0.01 || r.y0 > b.y + 0.01 || r.y1 < b.y + b.h - 0.01) {
          bad.push(`${key}.${kind}: the art shrank the authored box`);
        }
        // P3, the cross-axis band is the authored one, untouched
        if (vert) {
          if (Math.abs(r.x0 - b.x) > 0.001 || Math.abs(r.x1 - (b.x + b.w)) > 0.001) bad.push(`${key}.${kind}: a vertical move's width moved`);
        } else if (ax !== 'n') {
          if (Math.abs(r.y0 - b.y) > 0.001 || Math.abs(r.y1 - (b.y + b.h)) > 0.001) bad.push(`${key}.${kind}: a horizontal move's height moved`);
        }
        // P1, the box has to meet the limb it is drawn with
        const sil = at.neutral.map((v) => v * at.scale);
        const edges = [
          { ax: 2, art: ink[2] * at.scale, got: r.x1, auth: b.x + b.w, on: ax === 'f' || ax === 'n', past: (v) => v > sil[2] },
          { ax: 0, art: ink[0] * at.scale, got: r.x0, auth: b.x, on: ax === 'b' || ax === 'n', past: (v) => v < sil[0] },
          { ax: 1, art: ink[1] * at.scale, got: r.y0, auth: b.y, on: ax === 'u', past: (v) => v < sil[1] },
          { ax: 3, art: ink[3] * at.scale, got: r.y1, auth: b.y + b.h, on: ax === 'd', past: (v) => v > sil[3] },
        ];
        for (const e of edges) {
          if (!e.on || !e.past(e.art)) continue;                 // that edge is not this move's business
          const reach = (e.ax === 0 || e.ax === 1) ? e.auth - e.art : e.art - e.auth;
          if (!(reach > 0.5) || reach > 0.8 * at.unit * at.scale) continue;   // nothing to gain / beyond budget
          const met = (e.ax === 0 || e.ax === 1) ? e.got <= e.art + 0.01 : e.got >= e.art - 0.01;
          if (!met) bad.push(`${key}.${kind}: the art reaches ${e.art.toFixed(1)} on edge ${e.ax} but the box stops at ${e.got.toFixed(1)}`);
          else followed++;
        }
        const w = r.x1 - r.x0, hh = r.y1 - r.y0, cap = 2.9 * at.unit * at.scale;
        if (!(w > 8 && w < cap) || !(hh > 8 && hh < cap)) bad.push(`${key}.${kind}: resolved box ${w.toFixed(1)}x${hh.toFixed(1)} (cap ${cap.toFixed(0)})`);
      }
    }
  }
  assert(!bad.length, bad.slice(0, 8).join('\n        ') + (bad.length > 8 ? `\n        …${bad.length} more` : ''));
  console.log(`        (${total - fallback.length} of ${total} moves follow their art, ${followed} edges verified against it; ${fallback.length} fall back to authored: ${fallback.join(', ') || 'none'})`);
  console.log(`        (largest art-derived growth: ${worst.at} +${worst.add.toFixed(1)}px)`);
  assert(followed >= 20, `only ${followed} boxes were checked against their art — the assert went vacuous`);
  assert(fallback.length <= 2, `too many moves have no usable art: ${fallback.join(', ')}`);
  /* The strips that tools/atlas_desmerge.py re-cut must stay re-cut: two frames
     minimum, and the row is only worth its entry in `desmerged` if the widest cell
     is the one the strike lands on.  A regenerated atlas that loses the split would
     otherwise go back to painting two overlapping poses every tick, silently. */
  for (const key of KEYS) {
    const at = S.atlas(key);
    for (const row of ((at.meta && at.meta.desmerged) || [])) {
      const fl = at.anims[row] || [];
      const g = at.strike[row];
      assert(fl.length >= 2, `${key}.${row}: listed as re-cut but only drew ${fl.length} frame(s)`);
      if (g) assert(g.k === g.k && g.poses >= 2, `${key}.${row}: re-cut row has ${g.poses} measurable frames`);
    }
  }
});

/* The reach ordering that survives the "smashes reach further than tilts" myth:
   a tilt's box must not out-reach the very pose it is drawn from, and an
   up-swing must reach wherever the drawing actually leaves the head. */
test('hitbox: reach follows the art between moves of the same fighter', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  const at = S.atlas('valor');
  const idle = at.neutral, s = at.scale;
  const boxOf = (kind) => S.attackBox('valor', S.MOVE_ANIM[kind], at.strike[S.MOVE_ANIM[kind]].k,
    h.g.FIGHTERS.valor.moves[kind].hitboxes[0]);
  const reachOf = (kind) => boxOf(kind).x1;
  const has = (key, kind) => { const b = S.atlas(key).box[S.MOVE_ANIM[kind]]; return !!(b && b[S.atlas(key).strike[S.MOVE_ANIM[kind]].k]); };
  assert(has('valor', 'ftilt') && has('valor', 'jab'), 'the baseline reach tests lost their art');
  assert(reachOf('ftilt') > idle[2] * s, 'the sword arc does not reach past the resting silhouette');
  assert(reachOf('jab') > idle[2] * s, 'the jab does not reach past the resting silhouette');
  assert(reachOf('ftilt') > reachOf('jab'), 'the jab out-reaches the sword arc — the box is not following the art');
  /* An up-swing only grows upward if the drawing actually paints above the
     resting head — Valor's up-tilt tile is shorter than his idle pose, so his
     authored box stands and that is correct, not a miss.  Assert the rule
     wherever the art supports it, and insist at least one fighter proves it. */
  let above = 0;
  for (const key of KEYS) {
    const A = S.atlas(key);
    const ink = A.box.utilt && A.box.utilt[A.strike.utilt.k];
    if (!ink || ink[1] >= A.neutral[1]) continue;
    above++;
    const r = S.attackBox(key, 'utilt', A.strike.utilt.k, h.g.FIGHTERS[key].moves.utilt.hitboxes[0]);
    const art = ink[1] * A.scale, auth = h.g.FIGHTERS[key].moves.utilt.hitboxes[0].y;
    const withinBudget = auth - art <= 0.8 * A.unit * A.scale;
    assert(withinBudget ? r.y0 <= art + 0.01 : r.y0 < auth - 0.01,
      `${key}: up-tilt art reaches ${art.toFixed(1)} above the feet, box top is ${r.y0.toFixed(1)}`);
  }
  assert(above >= 1, 'no fighter has up-tilt art above their head to check the extension against');
  /* and the art may only ever push an edge out, never pull one in */
  for (const kind of MOVES) {
    const b = h.g.FIGHTERS.valor.moves[kind].hitboxes[0];
    if (!b) continue;
    const r = boxOf(kind);
    assert(r.x0 <= b.x + 0.01 && r.x1 >= b.x + b.w - 0.01, `valor.${kind}: the art shrank the authored box`);
    assert(r.y0 <= b.y + 0.01 && r.y1 >= b.y + b.h - 0.01, `valor.${kind}: the art shrank the authored box vertically`);
  }
});

test('hitbox: exact active counts, one hit per target per window', async () => {
  const h = await roster();
  for (const key of KEYS) {
    const m = pair(h, key, 'grim');
    const f = m.fighters[0];
    const a = h.g.FIGHTERS[key].moves.jab;
    let live = 0, hits = 0;
    const origCheck = f.checkHit;
    f.checkHit = function (mm, mult) { live++; return origCheck.call(this, mm, mult); };
    const origHit = m.hitFighter;
    m.hitFighter = function (x, y, o) { hits++; return origHit.call(this, x, y, o); };
    f.startAttack('jab', m);
    play(m, a.frames + 6);
    f.checkHit = origCheck;
    delete m.hitFighter;
    assert(live === a.active, `${key}: the jab was live for ${live} ticks, data says ${a.active}`);
    const want = a.multi ? 1 + a.multi : 1;
    assert(hits === want, `${key}: the jab hit ${hits} times from point-blank range, the data says ${want}`);
  }
});

test('hitbox: a multi-hit move re-hits the same target', async () => {
  const h = await roster();
  const m = pair(h, 'vesper', 'grim', 400, 452);
  const f = m.fighters[0], t = m.fighters[1];
  const a = h.g.FIGHTERS.vesper.moves.jab;
  assert(a.multi >= 1 && a.rehit > 0, 'Vesper’s flurry lost its multi-hit wiring');
  let hits = 0;
  const orig = m.hitFighter;
  m.hitFighter = function (x, y, o) {
    hits++;
    t.x = 452; t.y = m.stage.ground.y; t.vx = 0; t.vy = 0; t.hitstun = 0; t.hitlag = 0;  // pin the dummy
    return orig.call(this, x, y, o);
  };
  f.startAttack('jab', m);
  for (let i = 0; i < a.frames + 8; i++) {
    t.x = 452; t.y = m.stage.ground.y; t.vx = 0; t.vy = 0;
    m.update();
  }
  delete m.hitFighter;
  assert(hits >= 2, `Dagger Flurry hit ${hits} time(s) — a 2-hit flurry must be able to hit twice`);
});

/* =================== hurtbox =================== */
test('hurtbox: it matches the drawn body, and the pose changes it', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  for (const key of KEYS) {
    const m = pair(h, key, 'grim');
    const f = m.fighters[0];
    const at = S.atlas(key), n = at.neutral;
    const artH = (n[3] - n[1]) * at.scale;
    const narrow = (at.neutralMin[2] - at.neutralMin[0]) * at.scale;   // the most compact resting frame
    const widest = (at.neutralMax[2] - at.neutralMax[0]) * at.scale;
    const idle = f.hurtbox;
    near(idle.h, artH, artH * 0.17, `${key}: hurtbox ${idle.h.toFixed(1)} tall vs ${artH.toFixed(1)} of drawn body`);
    // never wider than the art at its most extended, never so narrow that the
    // body itself is outside it (a resting weapon may stick out of the box)
    /* Width is deliberately looser than the drawing: a staff, cloak or resting
       sword sticks out of the box and must stay out of it, or every whiff becomes
       a trade.  What may not happen is a box so thin the body is not inside it. */
    assert(idle.w > narrow * 0.33, `${key}: hurtbox ${idle.w.toFixed(1)} wide vs ${narrow.toFixed(1)} of drawn body`);
    assert(idle.w <= widest, `${key}: hurtbox ${idle.w.toFixed(1)} is wider than the drawn body (${widest.toFixed(1)})`);
    near(idle.y + idle.h, f.y, 0.02, `${key}: the box does not sit on the feet`);

    f.state = 'crouch'; const c = f.hurtbox;
    assert(c.h < idle.h * 0.85, `${key}: crouching did not squash the box (${c.h.toFixed(1)} vs ${idle.h.toFixed(1)})`);
    f.state = 'down'; const d = f.hurtbox;
    assert(d.h < c.h, `${key}: lying down is not lower than crouching`);
    assert(d.w > c.w, `${key}: lying down did not widen the box`);
    f.state = 'roll'; const r = f.hurtbox;
    assert(r.h < idle.h, `${key}: rolling kept the full height`);
    f.state = 'attack';
    f.action = { type: 'move', key: 'ftilt', startup: 5, active: 4, dur: 20, hitboxes: [] };
    f.actionT = 5; f.animT = 5;
    const wide = f.hurtbox;
    assert(wide.w >= idle.w, `${key}: a swing did not push the hurtbox out with the art`);
    const shift = (wide.x + wide.w / 2) - f.x;
    assert(shift > 0.5, `${key}: the extended box was not moved to the facing side (shift ${shift.toFixed(2)})`);
    f.state = 'idle'; f.action = null;
    near((f.hurtbox.x + f.hurtbox.w / 2), f.x, 0.01, `${key}: the shift leaked into the idle box`);
  }
});

/* =================== movement states =================== */
test('rows: the dash attack has its own art, and plays it as a lunge', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  const problems = [];
  for (const key of KEYS) {
    const at = S.atlas(key);
    // tools/slice_rows.py injects these; a fighter missing them silently borrows
    // another row (dashattack used to be the side tilt) and reads as one squashed frame
    for (const row of ['dashattack', 'dash', 'rollfwd', 'rollback', 'dsmash', 'ssmash', 'nair',
      'nspecial', 'sspecial', 'uspecial', 'dspecial']) {
      const n = ((at.anims[row] || [])).length;
      if (n < 4) problems.push(`${key}.${row}: ${n} frames`);
    }
    // A generated row can survive with four indices while only holding two poses, if
    // the sheet's band split into cells that repeat a tile.  Four distinct tiles per
    // heavy row is what the fluidity pass bought; the count alone would not notice it
    // being quietly lost again.
    for (const row of ['dsmash', 'ssmash', 'nair', 'nspecial', 'sspecial', 'uspecial', 'dspecial']) {
      const a = at.anims[row] || [];
      const uniq = new Set(a.map((e) => e[0])).size;
      if (a.length >= 4 && uniq < a.length) problems.push(`${key}.${row}: ${uniq} distinct tiles for ${a.length} frames`);
      // and the cells are poses, not strips: a frame wider than it is tall, by more
      // than a weapon's reach, is a merged panorama (Grim's 232px down smash was)
      const odd = a.map((e) => at.tiles[e[0]]).filter((t) => t && t.w > 2.2 * t.h && t.w > 100);
      if (odd.length) problems.push(`${key}.${row}: ${odd.length} frame(s) ${odd.map((t) => t.w + 'x' + t.h).join(', ')} are strips, not poses`);
    }
    if (S.MOVE_ANIM.dashattack !== 'dashattack') problems.push(`${key}: MOVE_ANIM.dashattack is not its own row`);
    const da = at.anims.dashattack || [], st = at.anims.stilt || [];
    if (da.length && da.every((e, i) => st[i] && e[0] === st[i][0])) problems.push(`${key}: dashattack tiles are the side tilt's`);
    // the strike frame has to reach further forward than standing still does, or the
    // lunge is a picture of a lunge that hits at arm's length
    const geo = at.strike.dashattack;
    const ink = geo && at.box.dashattack && at.box.dashattack[geo.k];
    if (!ink) problems.push(`${key}: dashattack has no strike frame the hitbox can read`);
    // the row has to *move* along the blow: the strike frame reaching further forward
    // than the least-reaching one is what a lunge looks like.  Measured against the
    // idle silhouette instead, a gunslinger standing with a rifle out already "reaches"
    // further than any lunge, and the comparison says nothing.
    else {
      const reach = (at.box.dashattack || []).filter(Boolean).map((b) => b[2] * at.scale);
      const span = Math.max(...reach) - Math.min(...reach);
      if (span < 8) problems.push(`${key}: dashattack row barely extends along the blow (${span.toFixed(1)}px)`);
    }
  }
  assert(!problems.length, problems.join('\n        '));
  // and in play: a real dash attack turns over at least three of its frames
  const m = pair(h, 'grim', 'valor', 90, 300);
  const f = m.fighters[0];
  const seen = new Set();
  f.x = m.stage.ground.x + 200; f.facing = 1;
  m.readPlayerInput = () => ({ right: true });
  for (let i = 0; i < 6; i++) m.update();
  f.startAttack('dashattack', m);
  for (let i = 0; i < 34 && f.state === 'attack'; i++) {
    const sel = S.pickAnim(f, 0);
    if (sel.name === 'dashattack') seen.add(sel.i);
    m.readPlayerInput = () => ({});
    m.update();
  }
  assert(seen.size >= 3, `a dash attack drew ${seen.size} distinct frames (${[...seen].join(',')}), not a lunge`);
});

/* A four-cell row that the move never gets through is four frames of art and two of
   nothing, and a sheet can regress into that without any atlas test noticing: the row
   still exists, the rects are still clean.  This watches the real thing — a dash, a
   roll, each of the injected attacks — and counts how many of the row's cells the
   renderer actually spends while the move is live, at 60 Hz with blend off (worst case).
   Driven the way simtest drives it, so the state machine is telling the truth. */
test('flow: every injected row is spent in play, not just present', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  const problems = [];
  const START = {
    dashattack: (f, m) => { f.state = 'run'; f.runArmed = true; f.dashT = 12; f.vx = f.def.stats.run; f.startAttack('dashattack', m); },
    rollfwd: (f, m) => { f.startRoll(1, m); },
    rollback: (f, m) => { f.startRoll(-1, m); },
    dsmash: (f, m) => f.startAttack('dsmash', m),
    ssmash: (f, m) => f.startAttack('fsmash', m),
    nair: (f, m) => {
      f.y = m.stage.ground.y + 60; f.vy = 0; f.onGround = false; f.state = 'fall';
      f.startAttack('nair', m);
    },
  };
  const SPECIALS = { nspecial: 'n', sspecial: 's', uspecial: 'u', dspecial: 'd' };
  for (const key of KEYS) {
    for (const row of ['dashattack', 'dash', 'rollfwd', 'rollback', 'dsmash', 'ssmash', 'nair',
      'nspecial', 'sspecial', 'uspecial', 'dspecial']) {
      // roomy on purpose: the dummy at +70px pushes a dash back into `idle` after a
      // couple of ticks, and the burst then measures as three frames of a four-cell
      // row — which is the test setup, not the game
      const m = pair(h, key, 'rook', 240, 760);
      const f = m.fighters[0];
      const seq = [];
      let fired = false;
      for (let i = 0; i < 60; i++) {
        // a real dash is a tap then a hold, so it is driven from the input, not by
        // writing the state down (the sim recomputes it from speed every tick)
        f.__raw = row === 'dash'
          ? (i === 0 ? { right: true } : i < 4 ? {} : { right: true })
          : (fired ? { right: true } : {});
        m.fighters[1].__raw = {};
        if (!fired && i === 1 && row !== 'dash') {
          if (SPECIALS[row]) f.startSpecial(SPECIALS[row], m); else START[row](f, m);
          fired = true;
        }
        if (row === 'dash') fired = true;
        m.update();
        // sampled after the tick: the burst is what the panel draws while the state
        // machine is in it, and sampling before would quietly lop the last tick off
        const sel = S.pickAnim(f, 0);
        if (sel && sel.name === row) seq.push(sel.frames[sel.i][0]);
      }
      const shown = new Set(seq).size;
      const have = (S.atlas(key).anims[row] || []).length;
      // A dash burst is short and shorter on a light fighter: `dashT` starts counting
      // at the tap, five of its ticks go to the acceleration ramp before the state is
      // even `run`, and only then does the row get to show.  Two cells inside that is a
      // pose every two ticks, which is what a burst should read as.  Everything else
      // has the whole move to spend its row.
      // A counter stance gets the same allowance for the opposite reason: that move is
      // one long hold whose tiles are paced by the release at the end of it, so two of
      // four is the shape of a parry, not a thin row (BUGS.md §K6).
      const stance = row === 'dspecial' && (h.g.FIGHTERS[key].specials.down || {}).type === 'counter';
      const need = Math.min(row === 'dash' || stance ? 2 : 3, have);
      if (!seq.length) problems.push(`${key}.${row}: the move never drew a frame of its own row`);
      else if (shown < need) problems.push(`${key}.${row}: ${shown} of ${have} cells shown in ${seq.length} ticks`);
    }
  }
  assert(!problems.length, problems.join('\n        '));
});

test('movement: a fresh tap bursts, plays the dash row and arms the run', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  for (const key of KEYS) {
    const st = h.g.FIGHTERS[key].stats;
    // x=60 with a 30-tick window: Vesper at 6.7 px/tick walks off the deck otherwise
    const m = pair(h, key, 'grim', 60, 900);
    const f = m.fighters[0];
    let sawDash = false, peak = 0, heldRun = 0, topSpeed = 0;
    play(m, 40, (g, k, i) => (k === 0 ? { right: true } : {}), (g, idx) => {
      if (g.state === 'run' && g.dashT > 0) sawDash = true;
      if (idx < 30 && g.state === 'run') heldRun++;
      if (idx < 30) topSpeed = Math.max(topSpeed, Math.abs(g.vx));
      peak = Math.max(peak, Math.abs(g.vx));
    });
    assert(sawDash, `${key}: a tap never entered a dash with dashT counting down`);
    const names = new Set();
    const m2 = pair(h, key, 'grim', 60, 900);
    const f2 = m2.fighters[0];
    play(m2, 12, (g, k) => (k === 0 ? { right: true } : {}), () => names.add(S.pickAnim(f2, 0).name));
    assert(names.has('dash'), `${key}: the sliced dash row is still referenced by nothing (saw ${[...names]})`);
    assert(peak > st.walk * 1.02, `${key}: no burst off the mark (peak ${peak.toFixed(2)} vs walk ${st.walk})`);
    assert(peak <= st.run * 1.4, `${key}: the burst overshot run speed (${peak.toFixed(2)} vs run ${st.run})`);
    assert(heldRun > 12, `${key}: only ${heldRun} ticks of run cycle while holding a direction`);
    assert(topSpeed > st.walk * 1.3, `${key}: holding never got faster than a walk (top ${topSpeed.toFixed(2)} vs walk ${st.walk})`);
    assert(f.runArmed === true, `${key}: the run never armed`);
    play(m, 70);
    assert(!f.runArmed && f.dashT === 0, `${key}: the run stayed armed after releasing the direction`);
    assert(Math.abs(f.vx) <= st.walk * 1.05, `${key}: kept sprinting after letting go (vx ${f.vx.toFixed(2)})`);
  }
});

test('movement: reversing turns into a braced skid, never a moonwalk', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  for (const key of KEYS) {
    const st = h.g.FIGHTERS[key].stats;
    const m = pair(h, key, 'grim', 60, 900);
    const f = m.fighters[0];
    play(m, 26, (g, k) => (k === 0 ? { right: true } : {}));
    assert(f.facing === 1 && f.state === 'run' && Math.abs(f.vx) > st.walk * 1.05,
      `${key}: never got up to run speed (vx ${f.vx.toFixed(2)}, state ${f.state})`);
    const vx0 = f.vx;
    const seen = play(m, 30, (g, k) => (k === 0 ? { left: true } : {}),
      (g) => { const sel = S.pickAnim(g, 0); return { s: g.state, v: g.vx, i: sel.i, n: sel.name }; });
    assert(f.facing === -1, `${key}: a reversal did not turn the fighter around`);
    const turns = seen.filter((x) => x.s === 'turn');
    assert(turns.length >= 2, `${key}: a reversal never held a turn state (saw ${[...new Set(seen.map((x) => x.s))].join(',')})`);
    const names = new Set(turns.map((x) => x.n));
    assert(names.size === 1 && names.has('crouch'), `${key}: the skid played ${[...names]}, not the braced pose`);
    const idx = new Set(turns.map((x) => x.i));
    assert(idx.size === 1, `${key}: the skid cycled ${idx.size} frames — a stride under a turn is the moonwalk`);
    let prev = Math.abs(vx0);
    for (const x of turns) {
      assert(Math.abs(x.v) <= prev + 1e-6, `${key}: it sped up while skidding`);
      prev = Math.abs(x.v);
    }
    assert(!seen.some((x) => x.s === 'run' && Math.abs(x.v) > st.run * 1.05), `${key}: run speed survived the pivot`);
  }
});

test('movement: the cycle follows the ground, not the clock', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  /* Feed the renderer a velocity and count frame changes over 120 ticks.  Stride
     sync means frames advance with *distance*, so px-per-frame must be about one
     stride at any speed — and zero speed must be zero frames, which is the
     standing case that used to strobe. */
  const cycleAt = (v) => {
    const m = pair(h, 'valor', 'grim');
    const f = m.fighters[0];
    f.state = 'run'; f.vx = v;
    let steps = 0, last = -1;
    for (let i = 0; i < 120; i++) {
      f.animT++; f.vx = v;
      const i2 = S.pickAnim(f, 0).i;
      if (i2 !== last) { steps++; last = i2; }
    }
    return { steps, px: (120 * v) / Math.max(1, steps) };
  };
  const still = cycleAt(0);
  assert(still.steps <= 1, `standing still advanced ${still.steps} frames`);
  const crawl = cycleAt(0.3);
  assert(crawl.steps <= 1, `a 0.3 px/tick drift strobed through ${crawl.steps} frames`);
  const walk = cycleAt(2.4), run = cycleAt(5.4);
  assert(run.steps > walk.steps * 1.4, `run cycled ${run.steps} vs walk ${walk.steps} — not speed-scaled`);
  for (const [name, o] of [['walk', walk], ['run', run]]) {
    assert(o.px > 9 && o.px < 34, `${name}: ${o.px.toFixed(1)} px per frame is not a stride`);
  }
  assert(Math.abs(walk.px - run.px) / run.px < 0.75, `stride length changed with speed (${walk.px.toFixed(1)} vs ${run.px.toFixed(1)})`);
});

test('movement: a slide to a stop settles instead of walking in place', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  const m = pair(h, 'valor', 'grim', 60, 900);
  const f = m.fighters[0];
  play(m, 18, (g, k) => (k === 0 ? { right: true } : {}));
  /* A stride may keep turning while momentum bleeds off — that is the whole point
     of stride sync.  What must not happen is the picture changing once vx is zero. */
  const seq = play(m, 45, (g, k) => (k === 0 ? {} : {}),
    (g) => ({ s: g.state, v: g.vx, x: g.x, i: S.pickAnim(g, 0).i, n: S.pickAnim(g, 0).name }));
  const stopAt = seq.findIndex((x) => x.v === 0);
  assert(stopAt > 0, 'the fighter never came to a full stop');
  const stopped = seq.slice(stopAt);
  assert(stopped.length > 20, `stopped with only ${stopped.length} ticks left to prove it`);
  assert(stopped[stopped.length - 1].s === 'idle', `ended in "${stopped[stopped.length - 1].s}" instead of idle`);
  /* A stride may keep turning while momentum bleeds off — that is the point of
     stride sync — but it must cost ground: one frame per stride's worth of px,
     never a walk cycle playing on a fighter that has stopped. */
  const strideTicks = seq.filter((x) => x.n === 'walk' || x.n === 'run');
  let changes = 0;
  for (let i = 1; i < strideTicks.length; i++) if (strideTicks[i].i !== strideTicks[i - 1].i) changes++;
  const dist = strideTicks.length > 1 ? Math.abs(strideTicks[strideTicks.length - 1].x - strideTicks[0].x) : 0;
  assert(strideTicks.length >= 2, 'never sampled a stride during the slide');
  assert(changes <= Math.ceil(dist / 12) + 1, `${changes} stride frames advanced over ${dist.toFixed(0)}px of slide — walking in place`);
  assert(!strideTicks.some((x, i) => i && x.v === 0 && x.i !== strideTicks[i - 1].i), 'the stride advanced after vx hit zero');
});

test('movement: every state resolves to a row that exists and plays', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  const bad = [];
  for (const key of KEYS) {
    const mm = readMeta(key);
    const anims = Object.assign({}, mm.anims, mm.derived);
    for (const st of Object.keys(S.STATE_ANIM)) {
      const spec = S.STATE_ANIM[st];
      const row = anims[spec.anim] || (spec.fallback ? anims[spec.fallback] : null);
      if (!row || !row.length) bad.push(`${key}: ${st} → "${spec.anim}" is not in the atlas`);
    }
    for (const st of ['jump', 'land', 'dash', 'spotdodge', 'getup', 'respawn']) {
      const spec = S.STATE_ANIM[st];
      const row = anims[spec.anim];
      if (!row || row.length < 2) continue;
      const m = pair(h, key, 'grim');
      const f = m.fighters[0];
      f.state = st; f.action = spec.fit ? { dur: 24 } : null; f.actionT = 0; f.animT = 0;
      const seen = new Set();
      for (let i = 0; i < row.length * (spec.step || 6) + 10; i++) { f.animT++; seen.add(S.pickAnim(f, 0).i); }
      if (seen.size < 2) bad.push(`${key}.${st}: played a ${row.length}-frame row and showed ${[...seen]}`);
      // Vesper's last jump cell is a crouch, excluded from the airborne sequence.
      const last = key === 'vesper' && st === 'jump' ? 5 : Math.round((spec.to === undefined ? 1 : spec.to) * (row.length - 1));
      if (spec.once && !seen.has(last)) bad.push(`${key}.${st}: never reached its final frame ${last}`);
    }
  }
  assert(!bad.length, bad.slice(0, 10).join('\n        ') + (bad.length > 10 ? `\n        …${bad.length} more` : ''));
});

/* =================== the frame-data budget =================== */
test('timing: attacks fit a snappy budget and stay readable', async () => {
  const h = await roster();
  const F = h.g.FIGHTERS;
  const slow = [], rushed = [];
  for (const key of KEYS) {
    for (const kind of MOVES) {
      const a = F[key].moves[kind];
      const smash = kind.endsWith('smash');
      if (a.frames > (smash ? 47 : 34)) slow.push(`${key}.${kind} ${a.frames}f total`);
      if (a.frames < 8) rushed.push(`${key}.${kind} ${a.frames}f total`);
      const rec = a.frames - a.startup - a.active;
      if (rec < 4) rushed.push(`${key}.${kind} recovery ${rec}f`);
      if (a.startup < 2) rushed.push(`${key}.${kind} startup ${a.startup}f`);
      if (a.active < 1) rushed.push(`${key}.${kind} has no active frames`);
      if (a.startup >= a.frames - a.active) rushed.push(`${key}.${kind} startup runs past the window`);
    }
    const st = F[key].stats;
    if (F[key].moves.jab.frames > 18) slow.push(`${key}.jab ${F[key].moves.jab.frames}f`);
    if (st.walk > 3.2 || st.run > 6.8) slow.push(`${key} speeds ${st.walk}/${st.run}`);
    if (st.walk < 1.4) rushed.push(`${key} walk ${st.walk}`);
  }
  assert(!slow.length, 'still too slow: ' + slow.join(', '));
  assert(!rushed.length, 'too twitchy to read: ' + rushed.join(', '));
});

test('timing: the family ordering holds across weights', async () => {
  const h = await roster();
  const F = h.g.FIGHTERS;
  for (const key of KEYS) {
    const f = F[key].moves;
    assert(f.jab.startup < f.fsmash.startup, `${key}: a jab is not faster out than a smash`);
    assert(f.jab.frames < f.fsmash.frames, `${key}: a jab does not recover faster than a smash`);
    assert(f.dtilt.frames <= f.dsmash.frames, `${key}: dtilt recovers slower than dsmash`);
    assert(f.utilt.startup <= f.usmash.startup, `${key}: utilt/usmash startup inverted`);
    assert(f.dashattack.frames < f.fsmash.frames, `${key}: a dash attack out-recovers a smash`);
    assert(f.nair.frames <= f.fair.frames, `${key}: nair should be the fastest aerial`);
  }
  assert(F.grim.moves.jab.startup >= F.valor.moves.jab.startup, 'Grim is quicker out of a jab than Valor');
  assert(F.grim.moves.fsmash.frames > F.vesper.moves.fsmash.frames, 'the heavy hitter recovers sooner than the featherweight');
  assert(F.vesper.stats.walk >= F.grim.stats.walk, 'Grim out-walks Vesper');
});

/* =================== the states the match drives =================== */
test('match: the intro still breathes and the results state does not stall', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  const m = newMatch(h.ctx, cast(2, ['valor', 'grim']), 'skyshrine', { state: 'intro' });
  const before = m.fighters.map((f) => f.animT);
  for (let i = 0; i < 40; i++) m.update();
  const after = m.fighters.map((f) => f.animT);
  assert(after.every((v, i) => v === before[i] + 40), `animT advanced ${after.map((v, i) => v - before[i])} in the intro`);
  const seen = new Set();
  for (let i = 0; i < 60; i++) { m.update(); seen.add(S.pickAnim(m.fighters[0], 0).i); }
  assert(seen.size >= 2, `the intro idle froze: frames ${[...seen]}`);
  m.state = 'over';
  const b2 = m.fighters.map((f) => f.animT);
  for (let i = 0; i < 30; i++) m.update();
  assert(m.fighters.every((f, i) => f.animT === b2[i] + 30), 'the results state stopped the clock');
});

test('match: 20s of CPU duelling with the new frame data stays sane', async () => {
  const h = await roster();
  /* The CPU mashes on its own random schedule, so seed it: without this the
     "does anyone attack" line below flaps between 25 and 70 starts run to run,
     and a flaky test is just a future "the AI broke" ticket. */
  const hostRandom = Math.random;
  let seed = 0x5f3a91c;
  Math.random = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const m = newMatch(h.ctx, cast(4, KEYS, { cpu: true }), 'skyshrine', { state: 'play' });
  let turns = 0, dashes = 0, invalid = 0, starts = 0;
  /* Count *initiations*, not attack ticks: how many ticks land in the attack
     state depends on how often the CPU gets hit, which is unseeded. */
  const origStart = h.g.Fighter.prototype.startAttack;
  h.g.Fighter.prototype.startAttack = function (kind, mm) { starts++; return origStart.call(this, kind, mm); };
  for (let i = 0; i < 1200; i++) {
    m.update();
    for (const f of m.fighters) {
      if (f.state === 'turn') turns++;
      if (f.dashT > 0) dashes++;
      if (!Number.isFinite(f.x) || !Number.isFinite(f.vx)) invalid++;
      const hb = f.hurtbox;
      if (!(hb.w > 4 && hb.h > 8 && Number.isFinite(hb.x) && Number.isFinite(hb.y))) invalid++;
      if (f.state === 'turn' && !f.onGround) invalid++;
    }
  }
  Math.random = hostRandom;
  assert(!invalid, `${invalid} invalid positions, hurtboxes or airborne skids`);
  // baseline (pre-revamp) was ~55-68 starts on this seed range; the frame data must
  // not cost the AI its offence, and must not turn it into a button masher either
  assert(starts > 35 && starts < 400, `CPU attack starts = ${starts} per 1200 frames x 4 fighters`);
  assert(m.fighters.every((f) => f.state !== 'turn' || f.onGround), 'skidding in mid-air');
  assert(m.frame > 1150, 'the match stopped ticking');
  assert(m.fighters.some((f) => f.damage > 0 || f.stats.kos > 0), '20 seconds and nobody got hit — hitboxes regressed');
  console.log(`        (${starts} attack starts, ${turns} turn ticks, ${dashes} dash ticks over 1200 frames x 4 fighters)`);
});

/* =================== smoothness: the panel is not the simulation ===================
   Playtest report: "animations feel laggy when running — make them more fluid".
   The frame data was not the whole story: physics is locked to 60 Hz while rAF runs
   at the panel rate, so on a 120 Hz laptop or phone every other displayed frame
   re-drew the same tick.  Half the frames you were shown carried no new information,
   which is exactly what "laggy" feels like at any frame rate you can name.

   The renderer owns the fix (Sprites.beginFrame → a sub-tick lead on positions plus
   setBlend on the pose clock), so these tests replicate Game.loop's accumulator and
   then read the blit list the recording canvas was handed — the real draw output in
   world space, not a re-implementation of it. */
const STEP_MS = 1000 / 60;

/* Draw `frames` rAF frames at `hz` against a real ticking match.  Returns the x/y
   the canvas was asked to blit at, and the tile index each frame showed. */
function painted(h, opts) {
  const m = newMatch(h.ctx, cast(2, [opts.key || 'valor', 'grim']), opts.stage || 'skyshrine', { state: 'play' });
  const S = h.g.Sprites;
  const rec = { ops: [], stack: [] };
  const ctx = makeCtx(rec);
  const me = m.fighters[0];
  me.x = opts.x === undefined ? 60 : opts.x;
  me.vx = 0;
  const ctl = control(m, (f) => (f === me ? (opts.input ? opts.input(m.frame, f) : { right: true }) : {}));
  const dt = 1000 / opts.hz;
  let acc = 0, clock = 0;
  const xs = [], ys = [], tiles = [];
  for (let fr = 0; fr < opts.frames; fr++) {
    acc += dt;
    let steps = 0;
    while (acc >= STEP_MS && steps < 4) {
      if (opts.runArmed) me.runArmed = true;              // a held direction is a walk; a tap arms the run
      ctl.tick(1);
      acc -= STEP_MS; steps++;
    }
    const alpha = opts.blend ? Math.min(1, acc / STEP_MS) : 0;
    const undo = S.beginFrame(m, alpha);
    rec.ops.length = 0;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    S.drawSpriteFighter(ctx, me, clock);
    const sel = S.pickAnim(me, clock);
    if (undo) undo();
    const o = rec.ops.find((x) => x.op === 'drawImage' && x.finite);
    if (!o) throw new Error('the sprite pass drew nothing on frame ' + fr + ' (state=' + me.state + ')');
    xs.push(o.matrix[4]); ys.push(o.matrix[5]); tiles.push(sel ? sel.i : -1);
    clock += dt;
  }
  return { xs, ys, tiles, m, me };
}

const stutter = (xs) => {
  let repeats = 0, rev = 0, revMax = 0;
  for (let i = 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    if (d === 0) repeats++;
    else if (d < 0) { rev++; revMax = Math.max(revMax, -d); }
  }
  return { repeats, rev, revMax };
};

test('smooth: a 120 Hz panel gets a new position on nearly every frame', async () => {
  const h = await roster();
  const r = painted(h, { hz: 120, blend: true, frames: 240, runArmed: true });
  const st = stutter(r.xs);
  assert(st.repeats <= 14, `${st.repeats} of 240 frames re-drew the same position`);
  assert(st.rev <= 6, `${st.rev} frames moved the sprite backwards (max ${st.revMax.toFixed(2)}px)`);
  assert(st.revMax <= 0.8, `a frame moved the sprite ${st.revMax.toFixed(2)}px backwards`);
});

test('smooth: the same run without the blend is the bug being fixed', async () => {
  const h = await roster();
  const st = stutter(painted(h, { hz: 120, blend: false, frames: 240, runArmed: true }).xs);
  assert(st.repeats > 90, `expected the 60 Hz sim to double every frame on a 120 Hz panel, got ${st.repeats}`);
});

test('smooth: a 60 Hz panel draws the tick, untouched', async () => {
  const h = await roster();
  const a = painted(h, { hz: 60, blend: false, frames: 180, runArmed: true });
  const b = painted(h, { hz: 60, blend: true, frames: 180, runArmed: true });
  // identical sequences: the blend costs a normal monitor nothing, and adds no latency
  assert(a.xs.length === b.xs.length && a.xs.every((v, i) => Math.abs(v - b.xs[i]) < 1e-6),
    'the blend moved a 60 Hz frame — the smoothing is not a no-op at the sim rate');
});

test('smooth: the pose clock keeps its own rate at 120 Hz', async () => {
  const h = await roster();
  const r = painted(h, { hz: 120, blend: true, frames: 240, runArmed: true });
  let flips = 0, prev = r.tiles[0];
  for (let i = 0; i < r.tiles.length; i++) {
    if (r.tiles[i] !== prev) { flips++; prev = r.tiles[i]; }
  }
  const at = r.m.frame;
  assert(flips > 20 && flips < at, `${flips} pose changes over ${at} simulation ticks — the run cycle is not advancing with the ground`);
  assert(new Set(r.tiles).size >= 6, `only ${new Set(r.tiles).size} of the run row's tiles were shown`);
});

test('smooth: hitlag and a blocked body are never predicted past', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  const m = newMatch(h.ctx, cast(2, ['valor', 'grim']), 'skyshrine', { state: 'play' });
  control(m).tick(6);
  const f = m.fighters[0];
  // 1. a fighter in hitlag is frozen: beginFrame must not move it a pixel
  f.x = 120; f.vx = 12; f.vy = -6; f.hitlag = 6;
  const undoA = S.beginFrame(m, 0.5);
  const moved = f.x !== 120 ? f.x : null;
  if (undoA) undoA();
  assert(moved === null, `a fighter in hitlag was drawn at x=${moved}`);
  // 2. a fighter pressed into the stage edge has velocity but no travel: no lead
  f.hitlag = 0; f.onGround = true;
  const gd = m.stage.ground;
  f.x = gd.x - 14; f.y = gd.y; f.vx = -4; f.vy = 0; f.state = 'idle';
  const x0 = f.x;
  S.beginFrame(m, 0.5);            // no undo: read the position mid-draw
  const lead = f.x - x0;
  assert(lead <= 0.001, `a body pinned at the wall was drawn ${lead.toFixed(2)}px past where the sim put it`);
});

test('smooth: a fast body is led the whole way, not by a fixed cap', async () => {
  /* The bug the "stuttery" report came down to: the lead was clamped to 4px, and a
     fighter falls at 10-17px a tick, so every other frame threw two thirds of the
     movement away and handed it back on the next tick.  The bound that survives is the
     distance the body actually travelled, which is exact for anything in free motion. */
  const h = await roster();
  const S = h.g.Sprites;
  const m = newMatch(h.ctx, cast(2, ['valor', 'grim']), 'skyshrine', { state: 'play' });
  control(m).tick(6);
  const f = m.fighters[0];
  const at = (tick, alpha) => {
    f.animT = tick; f.hitlag = 0;
    f.x = tick * 12; f.y = -tick * 12; f.vx = 12; f.vy = -12;
    const undo = S.beginFrame(m, alpha);
    const led = [f.x - tick * 12, f.y + tick * 12];
    if (undo) undo();
    return led;
  };
  at(1, 0.5);                                 // first sample: no travel known yet, so no lead
  const [lx, ly] = at(2, 0.5);                 // second: the body moved 12px on the last tick
  assert(lx > 5.9, `a body travelling 12px a tick was led ${lx.toFixed(2)}px sideways`);
  assert(ly < -5.9, `a body falling 12px a tick was led ${ly.toFixed(2)}px`);
});

test('smooth: a loop row dissolves into the next cell, an attack row never does', async () => {
  const h = await roster();
  const S = h.g.Sprites;
  const m = newMatch(h.ctx, cast(2, ['grim', 'valor']), 'skyshrine', { state: 'play' });
  control(m).tick(6);
  const f = m.fighters[0];
  f.state = 'walk'; f.onGround = true; f.vx = 3.2;
  let mixes = 0, rows = new Set();
  for (let i = 0; i < 40; i++) {
    f.animT = i; f.y = 0;
    const sel = S.pickAnim(f, i * 16);
    if (sel && sel.mix) { mixes++; rows.add(sel.name); }
  }
  assert(mixes > 6, `only ${mixes} of 40 walk ticks had a real dissolve (f > 0.3)`);
  assert(rows.has('walk'), `the dissolve never ran on the walk row (saw: ${[...rows].join(',') || 'nothing'})`);
  /* and the drawing has to follow through: two cells of the row, painted at
     complementary alphas, so the pose you see is between the two rather than one of
     them.  One blit at full alpha means the mix was computed and then dropped. */
  const rec = { ops: [] };
  const rctx = makeCtx(rec);
  let pairs = 0, soloed = 0, litNeeded = 0, litOk = 0;
  for (let i = 0; i < 40; i++) {
    f.state = 'walk'; f.animT = i; f.y = 0;
    const sel = S.pickAnim(f, i * 16);
    rec.ops.length = 0;
    rctx.globalAlpha = 1; rctx.globalCompositeOperation = 'source-over';
    S.drawSpriteFighter(rctx, f, i * 16);
    const soft = rec.ops.filter((o) => o.op === 'drawImage' && o.alpha < 1 && o.sx !== undefined);
    if (sel && sel.mix && sel.mix.f > 0.3) {
      if (soft.length === 2 && new Set(soft.map((o) => o.sx)).size === 2) pairs++;
    } else if (!soft.length) soloed++;
    /* baked glow is light, not ink: a dissolve that takes the gauntlet fire with it
       makes the sprite flicker, which is a worse tell than the hard cell cut was */
    const parts = (sel && sel.frames && sel.frames[sel.i] && sel.frames[sel.i][3]) || [];
    if (parts.length) {
      litNeeded++;
      if (rec.ops.some((o) => o.op === 'drawImage' && o.blend === 'lighter')) litOk++;
    }
  }
  assert(pairs > 6, `only ${pairs} of the dissolving frames actually drew two cells of the row`);
  assert(soloed > 6, `only ${soloed} frames drew a single crisp cell — the dissolve is leaking everywhere`);
  if (litNeeded > 0) {
    assert(litOk === litNeeded, `${litNeeded - litOk} dissolving frames dropped the tile's baked glow — the sprite flickers`);
  }
  f.state = 'attack';
  f.action = { type: 'move', key: 'jab', startup: 4, active: 3, dur: 16, hitboxes: [] };
  let bad = 0;
  for (let i = 0; i < 16; i++) {
    f.animT = i; f.actionT = i;
    const sel = S.pickAnim(f, i * 16);
    if (sel && sel.mix) bad++;
  }
  assert(bad === 0, `${bad} attack frames were cross-dissolved — the strike tile is the hit window and has to stay crisp`);
});

/* ---------------- entry ---------------- */
(async () => {
  const fail = await T.run(process.argv[2]);
  process.exit(fail ? 1 : 0);
})();
