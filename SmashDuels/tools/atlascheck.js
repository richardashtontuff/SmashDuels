/* ============================================================
   tools/atlascheck.js — roster atlas + sprite renderer tests
   ------------------------------------------------------------
   Exercises the atlas produced by tools/slice_roster.py against the renderer
   in game/js/render.js: does every animation the game can ask for exist, do
   the anchors really keep a fighter planted at its feet, is the art mirrored
   the right way, and does everything degrade to the vector fallback when a
   sheet is missing.

     node tools/atlascheck.js
     node tools/atlascheck.js anchor       filter by name
     V=1 node tools/atlascheck.js          failure stacks
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { boot, cast, control, newMatch, makeCtx, makeRunner, pngSize, GAME } = require('./harness');

const T = makeRunner();
const { test, assert, near } = T;

const KEYS = ['valor', 'grim', 'astra', 'vesper', 'rook'];
const ATLAS_DIR = path.join(GAME, 'assets', 'atlas');
/* Every animation the renderer maps a game state or move onto. */
const REQUIRED = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'dash', 'spotdodge', 'rollfwd', 'rollback',
  'jab', 'utilt', 'stilt', 'dtilt', 'nair', 'fair', 'bair', 'uair', 'dair',
  'usmash', 'ssmash', 'dsmash', 'nspecial', 'sspecial', 'uspecial', 'dspecial'];
const REQUIRED_DERIVED = ['hurt', 'launch', 'ko', 'shieldbreak', 'grabbed', 'grab', 'throw',
  'airdodge', 'shield', 'crouch', 'down', 'getup', 'respawn'];

/* A match holding all five roster fighters (renderer loaded or not). */
function fighterMatch(h, cpu) {
  const m = newMatch(h.ctx, cast(5, KEYS, { cpu: !!cpu }), 'skyshrine');
  m.readPlayerInput = (f) => f.__raw || {};
  return m;
}

function bootRoster() {
  const h = boot({ render: true, record: true });
  h.g.Sprites.load();
  return h.settle(12).then(() => h);
}

function readMeta(key) {
  return JSON.parse(fs.readFileSync(path.join(ATLAS_DIR, key + '.json'), 'utf8'));
}

/* =================== the atlas itself =================== */
test('atlas: every fighter has a png + json of matching size', () => {
  assert(fs.existsSync(ATLAS_DIR), 'game/assets/atlas is missing — run tools/slice_roster.py');
  for (const key of KEYS) {
    const png = path.join(ATLAS_DIR, key + '.png');
    const json = path.join(ATLAS_DIR, key + '.json');
    assert(fs.existsSync(png), `missing ${key}.png`);
    assert(fs.existsSync(json), `missing ${key}.json`);
    const meta = readMeta(key);
    assert(meta.key === key, `${key}.json has key ${meta.key}`);
    assert(Array.isArray(meta.atlas) && meta.atlas.length === 2, `${key}.json atlas size missing`);
    const { w, h } = pngSize(fs.readFileSync(png));
    assert(w === meta.atlas[0] && h === meta.atlas[1],
      `${key}: png is ${w}x${h} but meta says ${meta.atlas[0]}x${meta.atlas[1]}`);
    assert(Array.isArray(meta.tiles) && meta.tiles.length > 40, `${key}: only ${meta.tiles && meta.tiles.length} tiles`);
    meta.tiles.forEach((t, i) => {
      assert(t.w > 0 && t.h > 0, `${key} tile ${i} is empty`);
      assert(t.x >= 0 && t.y >= 0 && t.x + t.w <= w && t.y + t.h <= h,
        `${key} tile ${i} lies outside the atlas: ${JSON.stringify(t)}`);
    });
    assert(Number.isFinite(meta.refH) && meta.refH > 10, `${key}: bad refH ${meta.refH}`);
  }
});

test('atlas: every required animation exists (source + derived)', () => {
  for (const key of KEYS) {
    const meta = readMeta(key);
    const anims = meta.anims || {}, derived = meta.derived || {};
    const missing = REQUIRED.filter(n => !(n in anims));
    assert(!missing.length, `${key}: missing source anims ${missing.join(', ')}`);
    const missingD = REQUIRED_DERIVED.filter(n => !(n in derived) && !(n in anims));
    assert(!missingD.length, `${key}: missing derived anims ${missingD.join(', ')}`);
    for (const t of ['taunt1', 'taunt2', 'taunt3']) {
      assert((t in anims) || (t in derived), `${key}: taunt ${t} missing`);
    }
    for (const [name, frames] of Object.entries(Object.assign({}, anims, derived))) {
      assert(Array.isArray(frames) && frames.length > 0, `${key}.${name} has no frames`);
      for (const ent of frames) {
        assert(Array.isArray(ent) && ent.length >= 3, `${key}.${name} entry is not [tile, ax, ay]: ${JSON.stringify(ent)}`);
        assert(Number.isInteger(ent[0]) && ent[0] >= 0 && ent[0] < meta.tiles.length,
          `${key}.${name} references tile ${ent[0]} of ${meta.tiles.length}`);
        assert(Number.isFinite(ent[1]) && Number.isFinite(ent[2]), `${key}.${name} anchor is not finite`);
        if (ent[3]) {
          assert(Array.isArray(ent[3]), `${key}.${name} fx must be an array of overlays`);
          for (const fx of ent[3]) {
            assert(Number.isInteger(fx[0]) && fx[0] >= 0 && fx[0] < meta.tiles.length,
              `${key}.${name} fx references tile ${fx[0]}`);
          }
        }
      }
    }
  }
});

test('atlas: locomotion rows are long enough to read as animation', () => {
  const problems = [];
  for (const key of KEYS) {
    const meta = readMeta(key);
    for (const name of ['idle', 'walk', 'run']) {
      const n = ((meta.anims || {})[name] || []).length;
      if (n < 4) problems.push(`${key}.${name}=${n}`);
    }
  }
  assert(!problems.length, 'short rows (the slicer under-extracted): ' + problems.join(', '));
});

test('atlas: one tile per distinct drawing, reused by id', () => {
  for (const key of KEYS) {
    const meta = readMeta(key);
    const seen = new Set();
    for (const frames of Object.values(Object.assign({}, meta.anims, meta.derived))) {
      for (const ent of frames) seen.add(ent[0]);
    }
    assert(seen.size <= meta.tiles.length, `${key}: anims reference ${seen.size} tiles but only ${meta.tiles.length} exist`);
    // dedup contract: no two tiles share an identical rect
    const rects = new Set(meta.tiles.map(t => `${t.x},${t.y},${t.w},${t.h}`));
    assert(rects.size === meta.tiles.length, `${key}: duplicate tile rects in the atlas (${meta.tiles.length - rects.size})`);
    // and no two rects may overlap at all: tiles are pasted into one PNG, so an
    // overlapping pair means one drawing was painted on top of the other, and both
    // animations now show a piece of the wrong pose.  tools/slice_rows.py packs into
    // whatever the roster left free, and a packer that forgets the used space does
    // exactly this — while every other check still passes, because the geometry is fine.
    const t2 = meta.tiles;
    const live = new Set();
    for (const frames of Object.values(Object.assign({}, meta.anims, meta.derived))) {
      for (const ent of frames) {
        live.add(ent[0]);
        for (const fx of ent[3] || []) live.add(fx[0]);
      }
    }
    const hits = [];
    for (let i = 0; i < t2.length && hits.length < 4; i++) {
      if (!live.has(i)) continue;
      for (let j = i + 1; j < t2.length; j++) {
        if (!live.has(j)) continue;
        const a = t2[i], b = t2[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
          hits.push(`${i}\u00b7${j}`);
          break;
        }
      }
    }
    assert(!hits.length, `${key}: ${hits.length} tile rects overlap another tile (first: ${hits.slice(0, 4).join(', ')})`);
  }
});

/* =================== renderer wiring =================== */
test('renderer: loads every fighter atlas', async () => {
  const h = await bootRoster();
  for (const key of KEYS) assert(h.g.Sprites.ready(key), `${key} atlas never became ready`);
  for (const key of KEYS) {
    const at = h.g.Sprites.atlas(key);
    assert(at.img.width > 0 && at.img.height > 0, `${key}: image has no size`);
    assert(at.scale > 0.4 && at.scale < 3, `${key}: implausible atlas scale ${at.scale.toFixed(2)}`);
  }
});

test('renderer: every state and move resolves to its own animation', () => {
  return bootRoster().then((h) => {
    const S = h.g.Sprites;
    const m = fighterMatch(h);
    const states = Object.keys(S.STATE_ANIM);
    const moves = Object.keys(S.MOVE_ANIM);
    const bad = [];
    for (const f of m.fighters) {
      for (const st of states) {
        f.state = st; f.action = null; f.actionT = 0; f.shieldHP = 0; f.stunT = 0;
        f.onGround = true; f.facing = 1; f.hitstun = 0;
        // Vesper's source sheet has grounded frames in its fall row and
        // attack art in its defensive rows; use the curated alternatives.
        const vesperRows = {fall:'jump', fastfall:'jump', helpless:'jump', launch:'jump', shield:'idle', hitstun:'land', grabbed:'land'};
        const want = (f.key === 'vesper' && vesperRows[st]) || (S.STATE_ANIM[st] && S.STATE_ANIM[st].anim);
        const got = S.pickAnim(f, 1000);
        if (!got) { bad.push(`${f.key}/${st}: no frame`); continue; }
        const okName = want && (got.name === want || (st === 'taunt' && /^taunt[123]$/.test(got.name)));
        if (want && !okName) bad.push(`${f.key}/${st}: asked ${want}, got ${got.name}`);
        if (got.i < 0 || got.i >= got.frames.length) bad.push(`${f.key}/${st}: index ${got.i} out of range`);
      }
      for (const mv of moves) {
        f.state = 'attack';
        f.action = { type: 'move', key: mv, startup: 5, active: 4, dur: 26 };
        f.actionT = 8;
        const got = S.pickAnim(f, 1000);
        if (!got || got.name !== S.MOVE_ANIM[mv]) bad.push(`${f.key}/move ${mv}: got ${got && got.name}`);
      }
      for (const dir of ['n', 's', 'u', 'd']) {
        f.state = 'special';
        f.action = { type: 'special', specialKey: dir, specialDir: dir, startup: 6, active: 5, dur: 30 };
        f.actionT = 9;
        const got = S.pickAnim(f, 1000);
        if (!got || got.name !== S.SPECIAL_ANIM[dir]) bad.push(`${f.key}/special ${dir}: got ${got && got.name}`);
      }
      // the palette strip must never be treated as an animation
      f.state = 'idle'; f.action = null;
      const idle = S.pickAnim(f, 300);
      assert(idle.name !== 'palette', `${f.key}: idle resolved to the palette strip`);
    }
    assert(!bad.length, bad.slice(0, 12).join('\n        ') + (bad.length > 12 ? `\n        …${bad.length - 12} more` : ''));
  });
});

/* =================== anchors / mirroring =================== */
test('renderer: the frame anchor lands exactly on the fighter’s feet', () => {
  return bootRoster().then((h) => {
    const S = h.g.Sprites;
    const m = fighterMatch(h);
    for (const f of m.fighters) {
      // states with no vertical bob, so the anchor maps onto f.y exactly
      for (const st of ['fall', 'jump', 'land', 'hitstun', 'grabbed']) {
        const rec = { ops: [] };
        const ctx = makeCtx(rec);
        f.state = st; f.action = null; f.actionT = 0; f.facing = 1;
        f.x = 300; f.y = -40; f.shakeX = 0; f.shakeY = 0; f.flashT = 0;
        f.shieldHP = 0; f.stunT = 0; f.hitlag = 0; f.invincT = 0; f.respawnT = 0; f.spawnProtect = 0;
        const sel = S.pickAnim(f, 4000);
        const ok = S.drawSpriteFighter(ctx, f, 4000);
        assert(ok, `${f.key}/${st}: drawSpriteFighter bailed out`);
        const body = rec.ops.filter(o => o.op === 'drawImage')[0];
        assert(body, `${f.key}/${st}: nothing was drawn`);
        const [ax, ay] = [sel.frames[sel.i][1], sel.frames[sel.i][2]];
        const mtx = body.matrix;
        const px = mtx[0] * (body.dx + ax) + mtx[2] * (body.dy + ay) + mtx[4];
        const py = mtx[1] * (body.dx + ax) + mtx[3] * (body.dy + ay) + mtx[5];
        near(px, f.x, 0.02, `${f.key}/${st}: anchor x`);
        near(py, f.y, 0.02, `${f.key}/${st}: anchor y`);
        assert(body.dw > 0 && body.dh > 0, `${f.key}/${st}: tile drawn with no size`);
      }
    }
  });
});

test('renderer: art mirrors on facing and never double-leans a launch', () => {
  return bootRoster().then((h) => {
    const S = h.g.Sprites;
    const m = fighterMatch(h);
    for (const f of m.fighters) {
      f.state = 'fall'; f.action = null; f.x = 0; f.y = 0; f.shieldHP = 0; f.stunT = 0;
      f.flashT = 0; f.invincT = 0; f.respawnT = 0; f.spawnProtect = 0; f.hitlag = 0;
      f.facing = 1;
      let rec = { ops: [] };
      S.drawSpriteFighter(makeCtx(rec), f, 222);
      const sxRight = rec.ops.find(o => o.op === 'scale').x;
      f.facing = -1;
      rec = { ops: [] };
      S.drawSpriteFighter(makeCtx(rec), f, 222);
      const sxLeft = rec.ops.find(o => o.op === 'scale').x;
      assert(sxRight > 0 && sxLeft < 0, `${f.key}: facing did not mirror the sprite (${sxRight} / ${sxLeft})`);
      // a launch must not be leaned a second time on top of the baked rotation
      f.state = 'launch'; f.hitstun = 30;
      rec = { ops: [] };
      S.drawSpriteFighter(makeCtx(rec), f, 222);
      assert(!rec.ops.some(o => o.op === 'rotate'), `${f.key}: renderer rotated a launch (double lean)`);
      f.state = 'roll'; f.action = { type: 'roll', dur: 26 }; f.actionT = 8; f.rollDir = -1;
      rec = { ops: [] };
      S.drawSpriteFighter(makeCtx(rec), f, 222);
      assert(rec.ops.some(o => o.op === 'rotate'), `${f.key}: roll spin missing`);
    }
  });
});

test('atlas: grounded rows keep their feet on one baseline', () => {
  // Frames are trimmed to their ink, so the anchor is measured per tile —
  // what must NOT move is the feet line: tile bottom relative to the frame
  // origin (ay - h) has to stay put for every frame of a grounded row, or the
  // fighter visibly bounces/sinks as the animation cycles.
  const GROUNDED = ['idle', 'walk', 'run', 'land', 'jab', 'utilt', 'stilt', 'dtilt', 'ssmash', 'dsmash',
    'taunt1', 'taunt2', 'taunt3', 'shield', 'spotdodge', 'dash', 'crouch', 'down'];
  const notes = [];
  for (const key of KEYS) {
    const meta = readMeta(key);
    const tiles = meta.tiles;
    for (const name of GROUNDED) {
      const frames = (meta.anims[name]) || [];
      // skip held frames: they deliberately borrow another row's body tile
      const gaps = frames.filter(e => e[4] !== 1).map(e => e[2] - tiles[e[0]].h);
      if (gaps.length < 2) continue;
      const planted = gaps.filter(g => g >= -2 && g <= 3);
      const frac = planted.length / gaps.length;
      if (frac < 0.8) notes.push(`${key}.${name}: ${planted.length}/${gaps.length} frames planted (gaps ${gaps.join(',')})`);
      const spread = Math.max(...planted) - Math.min(...planted);
      if (spread > 3) notes.push(`${key}.${name}: planted frames drift ${spread}px`);
    }
  }
  assert(!notes.length, '\n        ' + notes.join('\n        '));
});

test('atlas: nothing from the sheets is drawn below the feet line', () => {
  // A frame's art is trimmed to its ink, so the anchor sits outside the tile
  // whenever the pose lifts its feet (jump, aerials) — that is correct.  What
  // is never correct is ink sinking below the ground line the row was keyed to,
  // because the stage floor is drawn at that line.
  const bad = [];
  for (const key of KEYS) {
    const meta = readMeta(key);
    const refH = meta.refH;
    for (const [name, frames] of Object.entries(meta.anims)) {
      if (name === 'palette') continue;                  // not an animation
      frames.forEach((e, i) => {
        for (const p of [e].concat(e[3] || [])) {
          const t = meta.tiles[p[0]];
          const below = t.h - p[2];
          if (below > 3) bad.push(`${key}.${name}[${i}] ink sits ${below}px under the ground line`);
        }
        if (!Number.isFinite(e[1]) || !Number.isFinite(e[2])) bad.push(`${key}.${name}[${i}] NaN anchor`);
      });
    }
    // derived frames are rotated/sheared, so give them a body height of slack
    for (const [name, frames] of Object.entries(meta.derived)) {
      frames.forEach((e, i) => {
        const t = meta.tiles[e[0]];
        const below = t.h - e[2];
        if (below > refH) bad.push(`${key} derived ${name}[${i}] sits ${below}px under the line (refH ${refH})`);
      });
    }
  }
  assert(!bad.length, bad.slice(0, 8).join('\n        ') + (bad.length > 8 ? `\n        …${bad.length - 8} more` : ''));
});

test('renderer: single-frame rows and fx overlays still draw', () => {
  return bootRoster().then((h) => {
    const S = h.g.Sprites;
    const m = fighterMatch(h);
    let single = 0, withFx = 0;
    for (const f of m.fighters) {
      const at = S.atlas(f.key);
      for (const [name, frames] of Object.entries(at.anims)) {
        if (frames.length === 1) single++;
        if (frames.some(e => e[3] && e[3].length)) withFx++;
        f.state = 'idle';
        f.action = { type: 'move', key: name, startup: 2, active: 2, dur: 6 };
        f.state = 'attack'; f.actionT = 3; f.flashT = 4; f.shieldHP = 0;
        const rec = { ops: [] };
        const ok = S.drawSpriteFighter(makeCtx(rec), f, 77);
        assert(ok, `${f.key}.${name}: refused to draw`);
        const bad = rec.ops.filter(o => o.op === 'drawImage').filter(o => !o.finite);
        assert(!bad.length, `${f.key}.${name}: non-finite drawImage`);
      }
      // every attack for a fighter with a lone frame must still render a body
      f.flashT = 0;
    }
    assert(withFx > 0, 'no fx overlays found anywhere — the crescents went missing');
    console.log(`        (${single} single-frame rows still render, ${withFx} anims carry fx overlays)`);
  });
});

test('renderer: missing atlas falls back to the vector fighter', () => {
  const h = boot({ render: true, record: true });
  const S = h.g.Sprites;
  assert(!S.ready('nobody'), 'ready() true with no atlas loaded');
  const m = fighterMatch(h);
  const f = m.fighters[0];
  f.key = 'nobody';
  const rec = { ops: [] };
  assert(S.drawSpriteFighter(makeCtx(rec), f, 10) === false, 'drawSpriteFighter should refuse an unknown key');
  rec.ops.length = 0;
  S.drawFighter(makeCtx(rec), f, 10);          // legacy path must keep working
  assert(rec.ops.length > 5, 'vector fallback drew nothing');
});

test('renderer: a 600-frame match draws every fighter without throwing', () => {
  return bootRoster().then(() => {
    const h = boot({ render: true, record: true });
    h.g.Sprites.load();
    return h.settle(12).then(() => {
      const S = h.g.Sprites;
      const m = fighterMatch(h);
      const rec = { ops: [] };
      const ctx = makeCtx(rec);
      let drawn = 0;
      for (let i = 0; i < 600; i++) {
        m.fighters.forEach((f, k) => { f.__raw = { left: (i + k * 30) % 90 < 45, attack: i % 17 === 0, jump: i % 41 === 0, shield: i % 53 < 8, special: i % 71 === 0 }; });
        m.update();
        rec.ops.length = 0;
        for (const f of m.fighters) {
          if (f.eliminated) continue;
          const ok = S.drawSpriteFighter(ctx, f, m.time);
          drawn++;
          assert(ok, `${f.key} refused to draw in state ${f.state}`);
          for (const o of rec.ops) {
            if (o.op !== 'drawImage') continue;
            assert(o.finite, `${f.key} in state ${f.state}: drawImage got NaN/undefined`);
            assert(o.dx === o.dx && o.dy === o.dy, `${f.key}: NaN destination`);
            assert(o.sw > 0 && o.sh > 0 && o.dw > 0 && o.dh > 0,
              `${f.key}/${f.state}: degenerate tile ${o.sw}x${o.sh}`);
          }
          rec.ops.length = 0;
        }
      }
      assert(drawn > 1500, `only ${drawn} fighter-draws happened`);
    });
  });
});

test('renderer: palettes tint without touching the source atlas', () => {
  return bootRoster().then((h) => {
    const S = h.g.Sprites;
    const m = fighterMatch(h);
    for (const f of m.fighters) {
      const at = S.atlas(f.key);
      const before = at.img.width + 'x' + at.img.height;
      for (let vi = 0; vi < S.VARIANTS.length; vi++) {
        f.palIdx = vi;
        f.state = 'idle'; f.action = null; f.shieldHP = 0; f.flashT = 0; f.stunT = 0;
        f.invincT = 0; f.respawnT = 0; f.spawnProtect = 0; f.hitlag = 0;
        const rec = { ops: [] };
        assert(S.drawSpriteFighter(makeCtx(rec), f, 90 + vi * 13), `${f.key} palette ${vi} refused to draw`);
      }
      assert(at.img.width + 'x' + at.img.height === before, `${f.key}: source image mutated`);
    }
  });
});

/* ---------------- the build the browser actually fetches ---------------- */
/* A static host with no Cache-Control lets a tab reuse a script it fetched yesterday, so
   the version query on every subresource is what makes "I fixed it" observable in the
   browser instead of only in the test runner.  This checks the promise, because the
   failure mode of forgetting to bump it is a user playing an old build and reporting a
   bug that is already fixed — which has happened. */
test('build: every subresource index.html loads is versioned to the current build', () => {
  const html = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8');
  const core = fs.readFileSync(path.join(GAME, 'js', 'core.js'), 'utf8');
  const m = core.match(/const BUILD = '([^']+)'/);
  assert(m, 'core.js no longer defines BUILD');
  const build = m[1];
  const linked = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((x) => x[1]);
  assert(linked.length >= 10, `index.html links ${linked.length} scripts`);
  const stale = linked.filter((src) => !src.endsWith('?v=' + build));
  assert(!stale.length, `scripts linked without the current build token: ${stale.join(', ')}`);
  const css = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((x) => x[1]);
  assert(css.length && css.every((c) => c.endsWith('?v=' + build)), `stylesheet not versioned: ${css.join(', ')}`);
  // every file in js/ is linked, and core.js is first (everything else reads its consts)
  const files = fs.readdirSync(path.join(GAME, 'js')).filter((f) => f.endsWith('.js')).sort();
  const named = linked.map((src) => src.split('?')[0].replace('js/', '')).sort();
  assert(JSON.stringify(named) === JSON.stringify(files), `js/ and index.html disagree:\n        linked ${named.join(',')}\n        on disk ${files.join(',')}`);
  assert(linked[0].startsWith('js/core.js?'), 'core.js must be the first script');
  // the atlases and item art are fetched from JS, and a PNG from one build with a JSON
  // from another draws tiles out of the wrong rectangle
  const render = fs.readFileSync(path.join(GAME, 'js', 'render.js'), 'utf8');
  assert(/const VQ = '\?v=' \+ \(typeof BUILD/.test(render), 'render.js does not derive its asset query from BUILD');
  for (const pat of ['assets/atlas/${k}.json${VQ}', 'assets/atlas/${k}.png${VQ}', "assets/items/items.json' + VQ", 'assets/items/${rec.file}${VQ}']) {
    assert(render.includes(pat), `render.js fetches \`${pat.split('$')[0]}\` without the version: ${pat}`);
  }
});

/* ---------------- decks ---------------- */
/* The harness ctx paints with noops, so a NaN in a background shape would sail through
   untouched and only throw in the browser.  Watching the numeric arguments of every
   drawing call is what makes a per-deck render test mean something — and it is the
   guard the copied Ultimate decks needed, whose backdrops are new geometry. */
function watchOps(ctx) {
  const bad = [];
  const METHODS = ['fillRect', 'strokeRect', 'clearRect', 'drawImage', 'arc', 'arcTo', 'ellipse',
    'rect', 'roundRect', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'fillText', 'strokeText'];
  for (const k of METHODS) {
    const orig = ctx[k];
    if (typeof orig !== 'function') continue;
    ctx[k] = function (...a) {
      for (let i = 0; i < a.length; i++) {
        if (typeof a[i] === 'number' && !Number.isFinite(a[i])) { bad.push(`${k} arg ${i} = ${a[i]}`); break; }
      }
      return orig.apply(this, a);
    };
  }
  for (const k of ['createLinearGradient', 'createRadialGradient']) {
    const orig = ctx[k];
    if (typeof orig !== 'function') continue;
    ctx[k] = function (...a) {
      // a real canvas throws on a NaN or negative radius; the stub would just build it
      for (const v of a) if (!Number.isFinite(v)) { bad.push(`${k} arg = ${v}`); break; }
      if (k === 'createRadialGradient' && (a[2] < 0 || a[5] < 0)) bad.push(`${k} negative radius`);
      return orig.apply(this, a);
    };
  }
  return bad;
}

test('decks: every stage exists, and every backdrop theme paints without a bad number', () => {
  return bootRoster().then(() => {
    const h = boot({ render: true, record: true });
    h.g.Sprites.load();
    return h.settle(12).then(() => {
      const { STAGES, Backdrop } = h.g;
      const keys = Object.keys(STAGES);
      assert(keys.length >= 16, `only ${keys.length} decks — the copied Ultimate forms should be in the picker`);
      const rec = { ops: [] };
      const ctx = makeCtx(rec);
      const bad = watchOps(ctx);
      const themes = new Set();
      for (const k of keys) {
        themes.add(STAGES[k].theme);
        const m = newMatch(h.ctx, cast(5, KEYS, { cpu: false }), k, { state: 'play' });
        m.readPlayerInput = (f) => f.__raw || {};      // no keyboard is bound in a headless run
        for (let i = 0; i < 6; i++) {
          m.cam.x = -600 + i * 260; m.cam.y = -320 + i * 90; m.cam.zoom = 0.6 + i * 0.1;
          m.update();
          rec.ops.length = 0;
          Backdrop.draw(ctx, m.stage, m.cam, m.time);
        }
      }
      assert(!bad.length, `${bad.length} bad drawing arguments: ${bad.slice(0, 6).join(' | ')}`);
      const missing = keys.filter(k => !themes.has(STAGES[k].theme));
      assert(!missing.length, 'unthemed decks: ' + missing.join(','));
      // each deck must actually paint something (an empty backdrop is a silent regression)
      for (const k of keys) {
        const m = newMatch(h.ctx, cast(2, ['grim', 'valor']), k, { state: 'play' });
        m.readPlayerInput = (f) => f.__raw || {};
        rec.ops.length = 0;
        Backdrop.draw(ctx, m.stage, m.cam, 1000);
        const painted = rec.ops.filter(o => o.op === 'set' || o.op === 'drawImage').length;
        assert(painted > 4, `${k}: its backdrop painted ${painted} state changes — that is a theme nobody drew`);
      }
      console.log(`        (${keys.length} decks, ${themes.size} backdrop themes)`);
    });
  });
});

/* ---------------- entry ---------------- */
(async () => {
  const fail = await T.run(process.argv[2]);
  process.exit(fail ? 1 : 0);
})();
