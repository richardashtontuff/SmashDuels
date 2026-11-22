/* ============================================================
   tools/simtest.js — headless simulation tests
   ------------------------------------------------------------
   Physics, collision, state machine and facing rules, run through the real
   engine modules with a stubbed DOM (see tools/harness.js).  Rendering is out
   of scope here — the atlas/sprite layer is covered by tools/atlascheck.js.

     node tools/simtest.js            run everything
     node tools/simtest.js sides      run tests whose name matches
     V=1 node tools/simtest.js        print failure stacks
   ============================================================ */
'use strict';

const { boot, cast, control, newMatch, makeRunner } = require('./harness');

const T = makeRunner();
const { test, assert } = T;
const run = boot;

/* =================== boot =================== */
test('boot: modules load, classes resolve, a 1v1 steps', () => {
  const { g, ctx } = run();
  assert(typeof g.Match === 'function', 'Match missing');
  assert(typeof g.Fighter === 'function', 'Fighter missing');
  assert(Object.keys(g.FIGHTERS).length >= 5, 'roster missing');
  assert(g.WORLD && g.WORLD.blast, 'WORLD missing');
  assert(g.Sprites === undefined, 'simtest must not load the renderer');
  const m = ctx.newMatch ? null : null;
  const match = newMatch(ctx, cast(2, ['valor', 'grim']));
  control(match).tick(240);
  for (const f of match.fighters) {
    assert(Number.isFinite(f.x) && Number.isFinite(f.y), 'NaN position');
    assert(Math.abs(f.y) < 4000, 'fighter flew off: ' + f.y);
  }
});

/* =================== movement feel =================== */
test('movement: all fighters run faster while keeping their distinct speeds', () => {
  const oldRun = { valor: 5.4, grim: 4.1, astra: 4.3, vesper: 6.7, rook: 4.8 };
  const speeds = {};
  for (const key of Object.keys(oldRun)) {
    const { ctx } = run();
    const m = newMatch(ctx, cast(1, [key]), 'terminal');
    m.rules.items = 'none';
    const f = m.fighters[0];
    f.x = 0; f.y = m.stage.ground.y; f.onGround = true; f.state = 'idle';
    control(m, () => ({ right: true })).tick(30);
    speeds[key] = f.vx;
    assert(f.vx > oldRun[key] * 1.1, `${key} run speed ${f.vx} is not appreciably faster`);
  }
  assert(speeds.vesper > speeds.valor && speeds.valor > speeds.rook && speeds.rook > speeds.astra && speeds.astra > speeds.grim,
    'fighter run-speed ordering changed');
});

test('movement: direct reversals quickly regain full run speed in both directions', () => {
  for (const key of ['valor', 'grim', 'astra', 'vesper', 'rook']) {
    const { ctx } = run();
    const m = newMatch(ctx, cast(1, [key]), 'terminal');
    m.rules.items = 'none';
    const f = m.fighters[0];
    f.x = 0; f.y = m.stage.ground.y; f.onGround = true; f.state = 'idle';
    let direction = 1;
    const ctl = control(m, () => ({ right: direction > 0, left: direction < 0 }));
    ctl.tick(30);
    for (const next of [-1, 1, -1, 1]) {
      direction = next;
      const before = f.vx;
      ctl.tick(1);
      assert(f.facing === next && (f.vx - before) * next > 0, `${key} did not steer into the turn`);
      ctl.tick(5);
      assert(f.vx * next > 0, `${key} still moving the wrong way after a turn`);
      ctl.tick(24);
      assert(f.vx * next > f.def.stats.run * 0.9 && f.state === 'run',
        `${key} stuck below running speed after reversal: vx=${f.vx}, state=${f.state}`);
    }
  }
});

test('movement: overlapping direction inputs can transition into a run', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(1, ['valor']), 'terminal');
  m.rules.items = 'none';
  const f = m.fighters[0];
  f.x = 0; f.y = m.stage.ground.y; f.onGround = true; f.state = 'idle';
  let raw = { right: true };
  const ctl = control(m, () => raw);
  ctl.tick(30);
  raw = { left: true, right: true }; ctl.tick(2);
  raw = { left: true }; ctl.tick(30);
  assert(f.vx < -f.def.stats.run * 0.9 && f.state === 'run',
    `overlapping input left fighter at vx=${f.vx}, state=${f.state}`);
});

test('movement: running jumps retain momentum and resume running after landing', () => {
  for (const key of ['valor', 'grim', 'astra', 'vesper', 'rook']) {
    for (const direction of [-1, 1]) {
      const { ctx } = run();
      const m = newMatch(ctx, cast(1, [key]), 'terminal');
      m.rules.items = 'none';
      m.stage.platforms = [];
      const f = m.fighters[0];
      f.x = 0; f.y = m.stage.ground.y; f.onGround = true; f.state = 'idle';
      let jump = false;
      const ctl = control(m, () => ({ left: direction < 0, right: direction > 0, jump }));
      ctl.tick(25);
      const speed = f.vx * direction;
      jump = true; ctl.tick(1); jump = false;
      assert(!f.onGround, `${key} failed to jump`);
      ctl.tick(10);
      assert(f.vx * direction > speed * 0.88, `${key} running jump lost too much speed`);
      let landed = false;
      for (let i = 0; i < 110; i++) { ctl.tick(1); if (f.onGround) { landed = true; break; } }
      assert(landed, `${key} did not land`);
      ctl.tick(15);
      assert(f.onGround && f.state === 'run' && f.vx * direction > f.def.stats.run * 0.9,
        `${key} did not resume running after landing: state=${f.state}, vx=${f.vx}`);
    }
  }
});

test('movement: changing direction in the air and on landing remains responsive', () => {
  for (const key of ['valor', 'grim', 'astra', 'vesper', 'rook']) {
    const { ctx } = run();
    const m = newMatch(ctx, cast(1, [key]), 'terminal');
    m.rules.items = 'none';
    m.stage.platforms = [];
    const f = m.fighters[0];
    f.x = 0; f.y = m.stage.ground.y; f.onGround = true; f.state = 'idle';
    let direction = 1, jump = false;
    const ctl = control(m, () => ({ left: direction < 0, right: direction > 0, jump }));
    ctl.tick(25); jump = true; ctl.tick(4);
    direction = -1; ctl.tick(15); jump = false;
    assert(!f.onGround && f.vx < 0, `${key} could not turn in the air: vx=${f.vx}`);
    let landed = false;
    for (let i = 0; i < 110; i++) { ctl.tick(1); if (f.onGround) { landed = true; break; } }
    assert(landed, `${key} did not land after air turn`);
    ctl.tick(15);
    assert(f.state === 'run' && f.vx < -f.def.stats.run * 0.9,
      `${key} slowed to a walk after an air turn: ${f.vx}, ${f.state}`);
  }
});

test('movement: a direction held through crouch and action recovery resumes running', () => {
  for (const key of ['valor', 'grim', 'astra', 'vesper', 'rook']) {
    const { ctx } = run();
    const m = newMatch(ctx, cast(1, [key]), 'terminal');
    m.rules.items = 'none';
    const f = m.fighters[0];
    f.x = 0; f.y = m.stage.ground.y; f.onGround = true; f.state = 'idle';
    let raw = { right: true, down: true };
    const ctl = control(m, () => raw);
    ctl.tick(15); raw = { right: true }; ctl.tick(15);
    assert(f.state === 'run' && f.vx > f.def.stats.run * 0.9, `${key} did not run after crouch`);
    f.startAttack('jab', m);
    ctl.tick(f.def.moves.jab.frames + 20);
    assert(f.state === 'run' && f.vx > f.def.stats.run * 0.9, `${key} did not run after attack`);
  }
});

test('movement: dash windows do not linger through a jump and landing', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(1, ['valor']), 'terminal');
  m.rules.items = 'none';
  const f = m.fighters[0];
  f.x = 0; f.y = m.stage.ground.y; f.onGround = true; f.state = 'idle';
  let raw = { right: true };
  const ctl = control(m, () => raw);
  ctl.tick(1);
  assert(f.dashT > 0, 'dash window did not start');
  raw = { jump: true }; ctl.tick(1);
  assert(f.dashT === 0, 'jump left a stale dash window');
  raw = {}; for (let i = 0; i < 100 && !f.onGround; i++) ctl.tick(1);
  ctl.tick(20);
  assert(f.onGround && f.attackTypeFor() !== 'dashattack', 'stale dash changed a standing attack');
});

test('movement: shielding stops a held run and releasing it resumes movement', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(1, ['valor']), 'terminal');
  m.rules.items = 'none';
  const f = m.fighters[0];
  f.x = 0; f.y = m.stage.ground.y; f.onGround = true; f.state = 'idle';
  let shield = false;
  const ctl = control(m, () => ({ right: true, shield }));
  ctl.tick(20); shield = true; ctl.tick(15);
  assert(f.state === 'shield' && f.shieldHP > 0 && Math.abs(f.vx) < 0.1,
    `fighter moved through shield: state=${f.state}, vx=${f.vx}`);
  shield = false; ctl.tick(15);
  assert(f.state === 'run' && f.vx > f.def.stats.run * 0.9,
    `fighter failed to run after releasing shield: state=${f.state}, vx=${f.vx}`);
});

test('movement: holding a direction on a soft platform after landing resumes running', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(1, ['valor']), 'terminal');
  m.rules.items = 'none';
  const p = { x: -350, y: -100, cx: -350, cy: -100, w: 700, h: 12 };
  m.stage.platforms = [p];
  const f = m.fighters[0];
  f.x = -200; f.y = -150; f.vx = 0; f.vy = 2; f.onGround = false; f.state = 'fall';
  const ctl = control(m, () => ({ right: true }));
  let landed = false;
  for (let i = 0; i < 80; i++) { ctl.tick(1); if (f.onPlatform === p) { landed = true; break; } }
  assert(landed, 'did not land on the soft platform');
  ctl.tick(15);
  assert(f.onPlatform === p && f.state === 'run' && f.vx > f.def.stats.run * 0.9,
    `failed to resume running on platform: ${f.state}, vx=${f.vx}`);
});

test('movement: tapping jump eases ascent and gives a lower hop than holding', () => {
  for (const key of ['valor', 'grim', 'astra', 'vesper', 'rook']) {
    const measure = (hold) => {
      const { ctx } = run();
      const m = newMatch(ctx, cast(1, [key]), 'terminal');
      m.rules.items = 'none';
      const f = m.fighters[0];
      f.x = 0; f.y = m.stage.ground.y; f.onGround = true; f.state = 'idle';
      let minY = f.y, prevVy = null, releaseDelta = 0, landed = false;
      const ctl = control(m, () => ({ jump: m.frame < hold }));
      for (let t = 0; t < 120; t++) {
        ctl.tick(1);
        if (t === 1) releaseDelta = f.vy - prevVy;
        prevVy = f.vy; minY = Math.min(minY, f.y);
        if (t > 2 && f.onGround) { landed = true; break; }
      }
      assert(landed, `${key} failed to land`);
      return { height: m.stage.ground.y - minY, releaseDelta };
    };
    const tap = measure(1), held = measure(20);
    assert(tap.height < held.height * 0.8 && tap.height > held.height * 0.3,
      `${key} tap ${tap.height} vs held ${held.height}`);
    assert(tap.releaseDelta > 0 && tap.releaseDelta < 3, `${key} jump release jerk ${tap.releaseDelta}`);
  }
});

test('movement: landing preserves momentum, allows steering and settles', () => {
  for (const key of ['valor', 'grim', 'astra', 'vesper', 'rook']) {
    const { ctx } = run();
    const m = newMatch(ctx, cast(1, [key]), 'terminal');
    m.rules.items = 'none';
    const f = m.fighters[0];
    f.x = 0; f.y = m.stage.ground.y - 2; f.onGround = false; f.state = 'fall';
    f.vx = 4; f.vy = 5;
    const ctl = control(m, () => ({ right: true }));
    ctl.tick(1);
    assert(f.onGround && f.state === 'land', `${key} failed to land`);
    const before = f.vx;
    ctl.tick(2);
    assert(f.vx > before * 0.65, `${key} lost too much momentum on landing: ${before} to ${f.vx}`);
    ctl.tick(10);
    assert(f.onGround && f.state !== 'land', `${key} landing did not settle`);
  }
});

test('movement: an unused tech window is consumed on impact', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(1, ['valor']), 'terminal');
  m.rules.items = 'none';
  const f = m.fighters[0];
  f.x = 0; f.y = m.stage.ground.y - 2; f.vy = 2; f.onGround = false;
  f.state = 'fall'; f.hitstun = 0; f.techWindow = 10;
  control(m, () => ({})).tick(20);
  assert(f.techWindow === 0 && f.onGround, 'fighter repeatedly bounced on an expired tech opportunity');
});

/* =================== sides / collisions =================== */
test('sides: no fighter is ever embedded in the stage slab', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(4, ['valor', 'grim', 'astra', 'vesper']), 'skyshrine');
  const gd = m.stage.ground;
  let worst = null;
  const c = control(m, () => {
    const t = m.frame % 90;
    return {
      left: t < 60, right: t >= 60 && t < 70, down: t >= 70 && t < 78,
      attack: t % 23 === 0, jump: t % 37 === 0, shield: t >= 80,
    };
  });
  for (let i = 0; i < 900; i++) {
    c.tick(1);
    for (const f of m.fighters) {
      if (f.eliminated) continue;
      const inSlabY = f.y > gd.y + 6 && f.y < gd.y + gd.h + 8;
      const inSlabX = f.x > gd.x + 6 && f.x < gd.x + gd.w - 6;
      if (inSlabY && inSlabX) worst = { frame: i, x: Math.round(f.x), y: Math.round(f.y), key: f.key, state: f.state };
    }
  }
  assert(!worst, 'fighter stuck inside the stage slab: ' + JSON.stringify(worst));
});

test('sides: a crowd shoved into the edge separates instead of pinning', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(4, ['grim', 'valor', 'astra', 'rook']), 'skyshrine');
  const gd = m.stage.ground;
  m.fighters.forEach((f, i) => {                   // all four pressed on the left face
    f.x = gd.x - 24 - i * 2; f.y = gd.y; f.vx = 0; f.vy = 0;
    f.state = 'idle'; f.onGround = true; f.hitstun = 0; f.damage = 0;
  });
  control(m, () => ({ right: true })).tick(90);
  const xs = m.fighters.map(f => f.x).sort((a, b) => a - b);
  const spread = xs[xs.length - 1] - xs[0];
  assert(spread > 40, `crowd did not separate at the wall (spread ${spread.toFixed(1)}: ${xs.map(v => v.toFixed(0))})`);
  for (let i = 1; i < xs.length; i++) {
    assert(xs[i] - xs[i - 1] > 6, `still overlapping at the edge: ${xs.map(v => v.toFixed(1))}`);
  }
  for (const f of m.fighters) {
    const inSlab = f.y > gd.y + 6 && f.y < gd.y + gd.h + 8 && f.x > gd.x + 6 && f.x < gd.x + gd.w - 6;
    assert(!inSlab, `pushed into the slab by the crowd: x=${f.x.toFixed(1)} y=${f.y.toFixed(1)}`);
  }
});

test('sides: edge-up shoves never pop a fighter across the stage', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(2, ['grim', 'vesper']), 'skyshrine');
  const gd = m.stage.ground;
  const a = m.fighters[0], b = m.fighters[1];
  a.x = 0; b.x = 0; a.y = gd.y; b.y = gd.y; a.onGround = b.onGround = true;
  let maxJump = 0;
  const before = [a.x, b.x];
  for (let i = 0; i < 60; i++) {
    const p0 = a.x, p1 = b.x;
    m.update();
    maxJump = Math.max(maxJump, Math.abs(a.x - p0), Math.abs(b.x - p1));
  }
  assert(maxJump < 12, `separation moved a fighter ${maxJump.toFixed(1)}px in one frame`);
  assert(Math.abs(a.x - before[0]) < 300 && Math.abs(b.x - before[1]) < 300, 'fighter teleported');
});

test('sides: falling past the deck never teleports a fighter sideways', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(1, ['valor']), 'skyshrine');
  const gd = m.stage.ground;
  const f = m.fighters[0];
  // dropped straight down the middle of the stage (under-stage techs,
  // drop-throughs and clipped platforms all land here)
  f.x = -40; f.y = gd.y + 30; f.vx = 0; f.vy = 4; f.onGround = false;
  f.state = 'fall'; f.hitstun = 0;
  m.readPlayerInput = () => ({});
  let jump = 0, prev = f.x;
  for (let i = 0; i < 60; i++) {
    m.update();
    if (f.eliminated || f.state === 'respawn') break;   // a real KO/respawn may reposition
    jump = Math.max(jump, Math.abs(f.x - prev));
    prev = f.x;
    if (!Number.isFinite(f.x)) break;
  }
  assert(Number.isFinite(f.x), 'x went NaN below the deck');
  assert(jump < 30, `x moved ${jump.toFixed(0)}px in one frame — the wall push-out is snapping fighters across the stage`);
});

test('sides: a knocked-out fighter is not clamped back onto the platform', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(2, ['grim', 'vesper']), 'skyshrine');
  const gd = m.stage.ground;
  const a = m.fighters[0], b = m.fighters[1];
  // both far off the left side, overlapping in the air (a classic 2v1 edge-up)
  a.x = gd.x - 420; b.x = a.x + 6;
  a.y = b.y = gd.y + 120; a.onGround = b.onGround = false;
  a.vx = b.vx = -8; a.vy = b.vy = 2;
  a.state = b.state = 'launch'; a.hitstun = b.hitstun = 90;
  m.readPlayerInput = () => ({});
  let jump = 0, pa = a.x, pb = b.x;
  for (let i = 0; i < 24; i++) {
    m.update();
    if (a.eliminated || b.eliminated || a.state === 'respawn' || b.state === 'respawn') break;
    jump = Math.max(jump, Math.abs(a.x - pa), Math.abs(b.x - pb));
    pa = a.x; pb = b.x;
  }
  assert(jump < 30, `a fighter was yanked ${jump.toFixed(0)}px in one frame by the edge-up clamp`);
  assert(pa < gd.x - 300, `fighter was pulled back toward the stage (x=${pa.toFixed(0)})`);
});

test('sides: a fighter shoved past the side blast zone is KO’d', () => {
  const { ctx, g } = run();
  const m = newMatch(ctx, cast(2, ['valor', 'astra']), 'skyshrine');
  const gd = m.stage.ground, blast = g.WORLD.blast;
  const f = m.fighters[0];
  assert(f.x > blast.left, 'fighter already outside the blast zone');
  f.x = gd.x - 60; f.y = gd.y + 60; f.vx = -34; f.vy = 6;
  f.onGround = false; f.state = 'launch'; f.hitstun = 120;
  let ko = false;
  for (let i = 0; i < 240 && !ko; i++) { m.update(); ko = f.eliminated || f.stocks < 3; }
  assert(ko, 'fighter shoved off the side was never KO’d');
});

/* =================== vs-4: the sides of the stage ===================
   Playtest report: "in 4-player a character gets stuck on the sides".  Two things
   made that happen and both are cheap to prove: the crowd solver could not resolve
   a pile at a stage edge (its push and Fighter.confine undid each other), and a
   fighter shoved a few px past the deck face was caught by a ledge-hang whose only
   exit was a button press. */
function packAtWall(m, side) {
  const gd = m.stage.ground;
  const wall = side < 0 ? gd.x : gd.x + gd.w;
  m.fighters.forEach((f, i) => {
    f.x = wall - side * (30 + i * 12); f.y = gd.y; f.vx = 0; f.vy = 0;   // packed just inside the face
    f.onGround = true; f.onPlatform = null; f.state = 'idle'; f.onGround = true;
    f.hitstun = 0; f.hitlag = 0; f.shieldHP = 0; f.grabbedBy = null; f.held = null;
    f.invincT = 0; f.spawnProtect = 0; f.ledge = null; f.ledgeCD = 0; f.ledgeInvuln = 0;
    f.facing = -side; f.facing = side < 0 ? 1 : -1;
  });
  return wall;
}
const deepOverlap = (m) => {
  let worst = 0;
  for (let a = 0; a < m.fighters.length; a++) for (let b = a + 1; b < m.fighters.length; b++) {
    const A = m.fighters[a], B = m.fighters[b];
    if (A.eliminated || B.eliminated) continue;
    if (Math.abs(A.y - B.y) > 44 * (A.scale + B.scale)) continue;
    worst = Math.max(worst, 26 * (A.scale + B.scale) + 8 - Math.abs(B.x - A.x));
  }
  return worst;
};

test('sides: a packed 4-player pile at the wall unwinds and walks nobody off the deck', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(4, ['valor', 'grim', 'vesper', 'rook']), 'skyshrine');
  const gd = m.stage.ground;
  packAtWall(m, -1);
  const c = control(m, () => ({}));                      // nobody presses anything
  let deepRun = 0, worstRun = 0, ledge = 0;
  for (let i = 0; i < 240; i++) {
    c.tick(1);
    deepRun = deepOverlap(m) > 30 ? deepRun + 1 : 0;
    worstRun = Math.max(worstRun, deepRun);
    for (const f of m.fighters) {
      if (f.state === 'ledge') ledge++;
      assert(f.x > gd.x - 20, `a fighter was shoved off the deck by the pile: x=${f.x.toFixed(1)}`);
      assert(!f.eliminated, 'a fighter was KO’d by their own pile');
    }
  }
  assert(worstRun < 24, `the pile stayed welded together for ${worstRun} frames at the wall`);
  assert(ledge === 0, `${ledge} frames of ledge-hangs from a crowd that never left the ground`);
});

test('sides: holding into the wall cannot park you in a ledge-hang', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(4, ['valor', 'grim', 'vesper', 'rook']), 'skyshrine');
  packAtWall(m, -1);
  const me = m.fighters[0];
  const c = control(m, (f, k) => (k === 0 ? { left: true } : {}));   // P1 presses into the wall
  let hang = 0, worst = 0;
  for (let i = 0; i < 240; i++) {
    c.tick(1);
    hang = me.state === 'ledge' ? hang + 1 : 0;
    worst = Math.max(worst, hang);
  }
  assert(worst <= 96, `a ledge-hang lasted ${worst} frames (1.6s of not being in the fight)`);
});

test('ledge: both sides catch, reset hang clock and keep one owner per lip', () => {
  for (const side of [-1, 1]) {
    const { ctx } = run(); const m = newMatch(ctx, cast(2, ['valor', 'grim']), 'terminal');
    const [f, other] = m.fighters; const gd = m.stage.ground;
    const edge = side < 0 ? gd.x : gd.x + gd.w;
    f.x = edge + side * 20; f.y = gd.y + 65; f.onGround = false; f.vy = 2; f.state = 'fall'; f.stateT = 800;
    f.action = { type: 'special', specialKey: 'n' }; f.inputBuffer.jump = 8;
    assert(f.tryLedgeGrab(m), `side ${side}: no grab`);
    assert(f.state === 'ledge' && f.stateT === 0 && !f.action && !f.onGround, 'grab did not reset stale state');
    assert(f.facing === -side && f.inputBuffer.jump === 0, 'grab facing or buffer is wrong');
    assert(f.hurtbox.y >= gd.y && f.hurtbox.h > 40, 'hang hurtbox is not below the lip');
    assert(f.ledgeInvuln === 30, 'ledge invulnerability not granted');
    other.x = edge + side * 20; other.y = gd.y + 30; other.vy = 2; other.onGround = false; other.state = 'fall';
    assert(!other.tryLedgeGrab(m), 'two fighters occupied the same ledge');
    const c = control(m); f.__raw = {}; other.__raw = {}; c.tick(1);
    assert(f.ledgeInvuln === 29, 'ledge invulnerability should tick down once per frame');
  }
});

test('ledge: ascending up special catches from below, but jumps, hitstun and down do not', () => {
  const { ctx } = run(); const m = newMatch(ctx, cast(1, ['astra']), 'terminal');
  const f = m.fighters[0], gd = m.stage.ground;
  const place = () => { f.resetAt(gd.x - 20, gd.y + 60, 1); f.onGround = false; f.vy = -5; f.state = 'jump'; };
  place(); assert(!f.tryLedgeGrab(m), 'normal upward jump snapped to ledge');
  place(); f.state = 'special'; f.action = { type: 'special', specialKey: 'u' }; f.usedUpB = true;
  assert(f.tryLedgeGrab(m) && !f.action && !f.usedUpB, 'up special failed to catch or reset');
  place(); f.vy = 3; f.hitstun = 5; assert(!f.tryLedgeGrab(m), 'fighter in hitstun caught a ledge');
  place(); f.vy = 3; f.input.down = true; assert(!f.tryLedgeGrab(m), 'holding down should avoid the ledge');
  place(); f.vy = 3; m.stage.ledges = false; assert(!f.tryLedgeGrab(m), 'caught a disabled ledge');
});

test('ledge: recovery catches through the real physics update on standard and XL decks', () => {
  for (const stage of ['terminal', 'grandrift']) for (const side of [-1, 1]) {
    const { ctx } = run(); const m = newMatch(ctx, cast(1, ['valor']), stage);
    const f = m.fighters[0], gd = m.stage.ground, edge = side < 0 ? gd.x : gd.x + gd.w;
    const c = control(m); f.respawnT = 0; f.x = edge + side * 32; f.y = gd.y + 75;
    f.vx = 0; f.vy = -4; f.onGround = false; f.state = 'fall';
    f.__raw = { up: true, special: true }; c.tick(1); f.__raw = {};
    let caught = f.state === 'ledge';
    for (let i = 0; i < 15 && !caught; i++) { c.tick(1); caught = f.state === 'ledge'; }
    assert(caught, `${stage} ${side}: rising recovery missed the lip`);
    assert(!f.action && f.y === gd.y - 8, 'ledge left a recovery action running');
  }
});

test('ledge: climb, jump, attack, roll and drop are distinct and responsive', () => {
  for (const side of [-1, 1]) for (const [kind, raw] of [['climb', {up:true}], ['jump', {jump:true}], ['attack', {attack:true}], ['roll', {shield:true}], ['drop', {down:true}]]) {
    const { ctx } = run(); const m = newMatch(ctx, cast(1, ['valor']), 'terminal');
    const f = m.fighters[0], gd = m.stage.ground, edge = side < 0 ? gd.x : gd.x + gd.w;
    f.respawnT = 0; f.snapLedge(m, side, edge); f.prevInput = {}; f.__raw = raw;
    const c = control(m); c.tick(1);
    assert(f.state !== 'ledge' && !f.ledge && f.ledgeCD > 0, `${side} ${kind}: trapped on ledge`);
    if (kind === 'climb') assert(f.state === 'idle' && f.onGround, 'climb did not place fighter on deck');
    if (kind === 'jump') assert(f.state === 'jump' && !f.onGround && f.vy < 0 && f.airJumpsLeft === f.def.stats.airJumps, 'ledge jump must rise without spending double jump');
    if (kind === 'attack') assert(f.state === 'attack' && f.action.key === 'jab', 'ledge attack missing');
    if (kind === 'roll') assert(f.state === 'roll' && f.rollDir === -side, 'ledge roll did not head inward');
    if (kind === 'drop') {
      assert(f.state === 'fall' && f.vx * side > 0 && f.ledgeInvuln === 0, 'drop did not move away or clear invulnerability');
      f.__raw = {}; c.tick(3); assert(f.state !== 'ledge', 'drop instantly regrabbed');
    }
  }
});

test('ledge: recovery input climbs after a short hang, no input eventually climbs', () => {
  const { ctx } = run(); const m = newMatch(ctx, cast(1, ['rook']), 'terminal');
  const f = m.fighters[0], gd = m.stage.ground; const c = control(m);
  f.respawnT = 0; f.snapLedge(m, -1, gd.x); f.__raw = { right:true };
  c.tick(5); assert(f.state === 'ledge', 'held recovery climbed before grip');
  c.tick(3); assert(f.state !== 'ledge' && f.onGround, 'held inward direction did not climb');
});

test('ledge: a hang nobody presses a button for still ends', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(1, ['astra']), 'skyshrine');
  const gd = m.stage.ground;
  const f = m.fighters[0];
  f.x = gd.x - 12; f.y = gd.y + 18; f.vx = 0; f.vy = 2; f.onGround = false;
  f.state = 'fall'; f.hitstun = 0; f.ledgeCD = 0;
  m.readPlayerInput = () => ({});
  let hang = 0;
  for (let i = 0; i < 160; i++) {
    m.update();
    if (f.state === 'ledge') hang++;
  }
  assert(hang > 4, 'the fighter never even caught the ledge — the grab test is broken');
  assert(hang < 100, `the hang lasted ${hang} frames; a hang with no input must auto-get-up`);
  assert(f.onGround && f.x > gd.x + 8, `the get-up left them off-stage (x=${f.x.toFixed(0)} onGround=${f.onGround})`);
});

test('ledge: a fighter standing over solid deck is never caught by one', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(1, ['rook']), 'skyshrine');
  const gd = m.stage.ground;
  const f = m.fighters[0];
  // parked just inside the face, airborne for a moment (a hop off the deck)
  f.x = gd.x + 6; f.y = gd.y - 6; f.vx = 0; f.vy = 1; f.onGround = false; f.state = 'fall';
  f.ledgeCD = 0;
  m.readPlayerInput = () => ({});
  for (let i = 0; i < 12; i++) {
    f.x = gd.x + 6; f.y = gd.y - 6 - i; f.onGround = false; f.state = 'fall';
    m.update();
    assert(f.state !== 'ledge', 'a fighter over the deck was snapped into a ledge-hang');
  }
});

/* =================== platforms: standing on a block ===================
   Playtest report: "collision problems with the blocks and things".  Movers were
   integrated but their travel was never handed to whatever was riding them. */
test('platforms: a fighter rides the Ember Foundry lift', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(1, ['valor']), 'foundry');
  const p = m.stage.platforms.find(q => q.move && q.move.axis === 'x');
  assert(p, 'the foundry lift is gone from the stage data');
  const f = m.fighters[0];
  m.readPlayerInput = () => ({});
  let slipped = 0, fell = 0;
  for (let i = 0; i < 260; i++) {
    const py = p.cy !== undefined ? p.cy : p.y;
    if (!f.onPlatform || Math.abs(f.y - py) > 4) {
      f.x = p.cx + p.w / 2; f.y = py; f.vx = 0; f.vy = 0; f.onGround = true; f.onPlatform = p; f.state = 'idle';
    }
    m.update();
    const cx = p.cx + p.w / 2;
    if (Math.abs(f.x - cx) > 2.5) slipped = Math.max(slipped, Math.abs(f.x - cx));
    if (!f.onPlatform) fell++;
  }
  assert(slipped < 4, `the lift slid ${slipped.toFixed(1)}px out from under the fighter`);
  assert(fell <= 2, `the fighter left the lift ${fell} times while standing still on it`);
});

test('platforms: a rising block does not bounce a standing fighter', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(1, ['vesper']), 'cometreach');
  const p = m.stage.platforms.find(q => q.move && q.move.axis === 'y');
  assert(p, 'cometreach has no vertical mover');
  const f = m.fighters[0];
  m.readPlayerInput = () => ({});
  f.x = p.cx + p.w / 2; f.y = p.cy; f.vy = 0; f.onGround = true; f.onPlatform = p; f.state = 'idle';
  let maxJump = 0, off = 0;
  for (let i = 0; i < 260; i++) {
    const py0 = f.y;
    m.update();
    maxJump = Math.max(maxJump, Math.abs(f.y - py0));
    off = Math.max(off, Math.abs(f.y - p.cy));
    if (!f.onGround) off += 0;                            // counted below via maxJump
  }
  assert(maxJump < Math.abs(2 * (p.move.amp * p.move.speed)) + 2.2,
    `the block yanked the fighter ${maxJump.toFixed(2)}px in one frame`);
  assert(off < 3, `the fighter came ${off.toFixed(2)}px off the block's surface`);
});

test('platforms: dropping through a block never drops you through the floor', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(1, ['grim']), 'skyshrine');
  const gd = m.stage.ground;
  const p = m.stage.platforms[0];
  const f = m.fighters[0];
  f.x = p.x + p.w / 2; f.y = p.y; f.vx = 0; f.vy = 0; f.onGround = true; f.onPlatform = p; f.state = 'crouch';
  m.readPlayerInput = (fr) => (fr.__raw || {});
  f.__raw = { down: true };
  m.update();                                             // the crouch sets up the drop
  f.__raw = { down: true, jump: true };
  let below = false, landed = -1;
  for (let i = 0; i < 120 && landed < 0; i++) {
    f.__raw = {};
    m.update();
    if (f.y > gd.y + gd.h) below = true;
    if (f.onGround && f.y >= gd.y - 1) landed = i;
  }
  assert(!below, 'the fighter fell out through the stage deck');
  assert(landed >= 0, `never came back down onto the deck (y=${f.y.toFixed(0)} state=${f.state})`);
});

test('items: an item on a moving lift rides it, then falls when the lift leaves', () => {
  const { ctx, g } = run();
  const m = newMatch(ctx, cast(1, ['astra']), 'foundry', { rules: { items: 'off' } });
  const p = m.stage.platforms.find(q => q.move && q.move.axis === 'x');
  const gd = m.stage.ground;
  const it = m.spawnItem('bobomb', p.cx + p.w / 2, p.cy - 200);
  assert(it, 'spawnItem returned nothing');
  m.readPlayerInput = () => ({});
  let hung = 0, supported = true, tracked = 0;
  for (let i = 0; i < 300; i++) {
    m.update();
    if (it.dead) break;
    const overPlat = it.x > p.x && it.x < p.x + p.w;
    const overDeck = it.x > gd.x - 20 && it.x < gd.x + gd.w + 20;
    if (it.onGround && !overPlat && !overDeck) hung++;
    if (it.onGround && overPlat && Math.abs(it.y - (p.cy - 8)) > 6) hung++;
    tracked = Math.max(tracked, Math.abs(it.x - (p.cx + p.w / 2)));
    supported = !it.onGround || overPlat || overDeck;
  }
  assert(hung === 0, `an item rested on nothing for ${hung} frames`);
  assert(supported, 'the item ended up floating off any surface');
});

test('hazards: the bamboo pillar hits once per rise, not once per frame', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(1, ['rook']), 'hollow', { rules: { hazards: true } });
  const gd = m.stage.ground, hz = m.stage.hazard;
  const f = m.fighters[0];
  m.readPlayerInput = () => ({});
  for (let i = 0; i < hz.period; i++) {                              // exactly one rise
    f.x = hz.x; f.y = gd.y; f.vx = 0; f.vy = 0; f.onGround = true; f.state = 'idle';
    f.hitstun = 0; f.hitlag = 0; f.shieldHP = 60;         // parked in the beam, shield up
    m.update();
  }
  assert(!f.eliminated, 'standing in the pillar KO’d the fighter');
  assert(f.damage <= hz.dmg * 1.5,
    `the pillar did ${f.damage.toFixed(0)}% to a fighter standing in it for one rise (dmg ${hz.dmg})`);
});

test('hazards: lava burns on a rhythm, not every frame', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(1, ['valor']), 'foundry', { rules: { hazards: true } });
  const hz = m.stage.hazard;
  const f = m.fighters[0];
  m.readPlayerInput = () => ({});
  f.y = hz.y + 8; f.vy = 0; f.x = 0; f.onGround = false;
  let hits = 0, prev = 0;
  for (let i = 0; i < 120; i++) {
    f.y = hz.y + 8; f.vy = 0; f.hitstun = 0; f.state = 'fall';
    m.update();
    if (f.damage > prev) hits++;
    prev = f.damage;
    if (f.eliminated || f.stocks < 3) break;
  }
  assert(hits > 0, 'the lava never burned anybody');
  assert(hits <= 4, `the lava hit ${hits} times in 120 frames — that is a shredder, not a hazard`);
});

/* =================== facing =================== */
test('facing: a back-roll keeps the fighter turned toward the opponent', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(2, ['valor', 'grim']), 'terminal');
  const f = m.fighters[0], o = m.fighters[1];
  f.x = -80; o.x = 80; f.y = o.y = m.stage.ground.y;
  f.onGround = true; f.state = 'idle';
  m.readPlayerInput = (fr) => fr.__raw || {};
  f.__raw = { right: true }; o.__raw = {};
  for (let i = 0; i < 4; i++) m.update();
  assert(f.facing === 1, 'expected to face right, got ' + f.facing);
  // roll backwards (left): shield + direction on the same frame is the
  // shorthop-guard roll, so that's the path under test
  let sawRoll = false, flipped = false;
  for (let i = 0; i < 40; i++) {
    f.__raw = (i < 6) ? { shield: true, left: i >= 3 } : {};
    o.__raw = {};
    m.update();
    if (f.state === 'roll') {
      sawRoll = true;
      if (f.facing !== 1) flipped = true;
    }
  }
  assert(sawRoll, 'roll never started (state=' + f.state + ')');
  assert(!flipped, 'facing flipped during a back-roll');
  assert(f.facing === 1, 'fighter ended up facing away after rolling backwards');
});

test('facing: committed attacks keep their facing', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(2, ['vesper', 'rook']), 'terminal');
  const f = m.fighters[0];
  f.x = 0; f.y = m.stage.ground.y; f.onGround = true; f.state = 'idle';
  f.__raw = { right: true };
  m.readPlayerInput = () => f.__raw;
  m.update();
  assert(f.facing === 1, 'setup facing');
  f.__raw = { attack: true };
  m.update();
  assert(f.state === 'attack', 'attack did not start: ' + f.state);
  for (let i = 0; i < 30; i++) {
    f.__raw = { left: true };                 // hold the opposite direction
    m.update();
    if (f.state !== 'attack') break;
    assert(f.facing === 1, 'facing changed mid-attack at frame ' + i);
  }
});

test('facing: a grab turns toward the target', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(2, ['valor', 'grim']), 'terminal');
  const f = m.fighters[0], o = m.fighters[1];
  const gd = m.stage.ground;
  // opponent behind the input direction: the grab must still commit to them
  f.x = 40; o.x = -60; f.y = o.y = gd.y; f.onGround = o.onGround = true;
  f.facing = 1; f.state = 'idle';
  f.startGrab(m);
  assert(f.facing === -1, 'grab did not turn toward the target (facing ' + f.facing + ')');
});

test('facing: air turn still works (the fix is not a freeze)', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(1, ['astra']), 'terminal');
  const f = m.fighters[0];
  f.__raw = { left: true };
  m.readPlayerInput = () => f.__raw;
  f.x = 0; f.y = m.stage.ground.y - 260; f.vy = 0; f.onGround = false;
  f.state = 'fall'; f.facing = 1;
  let turned = false;
  for (let i = 0; i < 30 && !turned; i++) { m.update(); if (f.facing === -1) turned = true; }
  assert(turned, 'air turn did not happen (state=' + f.state + ')');
});

/* =================== states / stress =================== */
test('states: jump / land / crouch / fall are all reachable and settle', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(1, ['rook']), 'hollow');
  // This tests the state machine, not random item pickups or pillar interruptions.
  m.rules.items = 'none'; m.stage.hazard = null;
  const f = m.fighters[0];
  m.readPlayerInput = (fr) => fr.__raw || {};
  const gd = m.stage.ground;
  // spawn x is randomised, and where you land decides how long `land` lasts — so the
  // pose starts on the deck centre and the crouch window is wider than any landing
  f.x = gd.x + gd.w / 2;
  f.y = m.stage.ground.y - 320; f.vy = 0; f.onGround = false;
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const t = i % 80;
    f.__raw = { jump: t === 0, down: t > 34 && t < 76, left: t > 10 && t < 30, right: t > 60 };
    m.update();
    seen.add(f.state);
    assert(Number.isFinite(f.x) && Number.isFinite(f.y), 'NaN in ' + f.state);
  }
  for (const want of ['land', 'crouch', 'jump', 'fall']) {
    assert(seen.has(want), `state ${want} never reached (saw ${[...seen].join(',')})`);
  }
});

test('hitstun: a launched crowd gets pushed apart, not stacked', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(4, ['grim', 'valor', 'vesper', 'astra']), 'terminal');
  m.fighters.forEach((f, i) => {
    f.x = -20 + i * 6; f.y = m.stage.ground.y - 40; f.vx = 0; f.vy = -6;
    f.onGround = false; f.state = 'launch'; f.hitstun = 200; f.damage = 120;
  });
  let minGap = 1e9;
  for (let i = 0; i < 120; i++) {
    m.update();
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      const A = m.fighters[a], B = m.fighters[b];
      if (!A || !B || A.eliminated || B.eliminated) continue;
      if (Math.abs(A.y - B.y) > 40) continue;
      minGap = Math.min(minGap, Math.abs(A.x - B.x));
    }
  }
  assert(minGap > 6 || !Number.isFinite(minGap), 'launched fighters stayed stacked (gap ' + minGap.toFixed(1) + ')');
});

test('ledge: three fighters contesting one ledge never enter the slab', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(3, ['vesper', 'valor', 'grim']), 'skyshrine');
  const gd = m.stage.ground;
  m.fighters.forEach(f => {
    f.x = gd.x - 20; f.y = gd.y + 24; f.vx = -2; f.vy = 2;
    f.onGround = false; f.state = 'fall'; f.hitstun = 0;
  });
  m.readPlayerInput = (f) => f.__raw || {};
  for (let i = 0; i < 200; i++) {
    m.fighters.forEach((f, k) => { f.__raw = { right: k === 0, up: i % 40 === 0 }; });
    m.update();
    for (const f of m.fighters) {
      if (f.eliminated) continue;
      assert(Number.isFinite(f.x), 'NaN x at ledge');
      const inSlab = f.y > gd.y + 6 && f.y < gd.y + gd.h + 8 && f.x > gd.x + 6 && f.x < gd.x + gd.w - 6;
      assert(!inSlab, `fighter ${f.key} inside slab at (${f.x.toFixed(0)},${f.y.toFixed(0)}) state=${f.state}`);
    }
  }
});

test('4v4 teams + items: 30s of frames stays finite, in-bounds and unstacked', () => {
  const realRandom = Math.random;
  Math.random = seededRandom(3301);                 // an unseeded 4v4 flaked ~1 run in 3
  try { teamsMatch(); } finally { Math.random = realRandom; }
});

function teamsMatch() {
  const { ctx, g } = run();
  const m = newMatch(ctx, cast(4, ['valor', 'grim', 'astra', 'vesper'], { teams: true, cpu: true }), 'foundry', {
    rules: { items: 'medium', teams: true, mode: 'teams' },
  });
  const gd = m.stage.ground;
  const keys = Object.keys(g.ITEMS);
  let worstOverlap = 0, inSlab = 0, deepRun = 0, worstDeep = 0, fullRun = 0, worstFull = 0;
  for (let i = 0; i < 1800; i++) {
    if (i % 300 === 0) m.spawnItem(keys[Math.floor(i / 300) % keys.length], (i % 2 ? 140 : -140), -80);
    m.update();
    for (const f of m.fighters) {
      assert(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.vx),
        `NaN on ${f.key} frame ${i} state=${f.state}`);
      assert(Math.abs(f.x) < 3000, `fighter escaped the world: ${f.key} x=${f.x}`);
      if (f.y > gd.y + 6 && f.y < gd.y + gd.h + 8 && f.x > gd.x + 6 && f.x < gd.x + gd.w - 6) inSlab++;
    }
    // only fighters who are in the round can be "stacked"; the respawn waiting area
    // is deliberately a pile of fighters parked at the same point above the stage
    let deep = false, full = false;
    for (let a = 0; a < m.fighters.length; a++) {
      for (let b = a + 1; b < m.fighters.length; b++) {
        const A = m.fighters[a], B = m.fighters[b];
        if (A.eliminated || B.eliminated || A.state === 'respawn' || B.state === 'respawn') continue;
        // A grab intentionally holds the victim close until the throw or timeout.
        if (A.grabbing === B || B.grabbing === A) continue;
        if (Math.abs(A.y - B.y) > 40) continue;
        const gap = Math.abs(A.x - B.x);
        worstOverlap = Math.max(worstOverlap, 52 - gap);
        if (gap < 30) deep = true;
        if (gap < 6) full = true;
      }
    }
    deepRun = deep ? deepRun + 1 : 0;   worstDeep = Math.max(worstDeep, deepRun);
    fullRun = full ? fullRun + 1 : 0;   worstFull = Math.max(worstFull, fullRun);
  }
  assert(inSlab === 0, inSlab + ' frames had a fighter inside the stage slab');
  assert(worstFull <= 2, `two fighters were fully stacked for ${worstFull} frames`);
  assert(worstDeep < 40, `two fighters stayed >22px overlapped for ${worstDeep} frames`);
  console.log(`        worst overlap ${(52 - worstOverlap).toFixed(0)}px gap-based, deep run ${worstDeep}f, full run ${worstFull}f`);
}

test('stress: random mashers never produce NaN or a stuck overlap', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(4, ['valor', 'vesper', 'rook', 'grim']), 'range');
  const rnd = (n) => Math.floor(Math.random() * n);
  const BTN = ['left', 'right', 'up', 'down', 'attack', 'special', 'jump', 'shield', 'grab'];
  m.readPlayerInput = (f) => f.__raw || {};
  let stuckFrames = 0;
  for (let i = 0; i < 2400; i++) {
    if (i % 7 === 0) {
      for (const f of m.fighters) {
        const r = {};
        for (let k = 0; k < 3; k++) r[BTN[rnd(BTN.length)]] = true;
        f.__raw = r;
      }
    }
    m.update();
    for (const f of m.fighters) {
      if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) throw new Error(`NaN on ${f.key} at frame ${i}`);
    }
    const alive = m.fighters.filter(f => !f.eliminated);
    let anyOverlap = false;
    for (let a = 0; a < alive.length; a++) for (let b = a + 1; b < alive.length; b++) {
      if (Math.abs(alive[a].y - alive[b].y) < 30 && Math.abs(alive[a].x - alive[b].x) < 4) anyOverlap = true;
    }
    stuckFrames = anyOverlap ? stuckFrames + 1 : 0;
    assert(stuckFrames < 45, `fighters pinned on top of each other for ${stuckFrames} frames`);
  }
});

/* A 4-player CPU match is the stress case the playtesters reported as \"stuck at
   the sides / collisions with things\": twice the bodies to separate, twice the
   items, twice the projectiles.  Everything below is deterministic — Math.random
   is replaced by a seeded LCG for the whole match — because a stress test that
   only fails 1 run in 8 is a test people learn to ignore. */
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const VS4_SEEDS = [['skyshrine', 4242], ['foundry', 1337], ['terminal', 555]];

test('vs4: a 4-player CPU match never locks up, stalls or parks a fighter', () => {
  const realRandom = Math.random;
  try {
    for (const [stage, seed] of VS4_SEEDS) {
      Math.random = seededRandom(seed);
      console.log(`      ${stage} / seed ${seed}`);
      vs4Match(stage);
    }
  } finally { Math.random = realRandom; }
});

function vs4Match(stage) {
  const { ctx } = run();
  const m = newMatch(ctx, cast(4, ['valor', 'grim', 'astra', 'rook'], { cpu: true }), stage, { state: 'play' });
  const gd = m.stage.ground;
  const TICKS = 2400;                                     // 40 seconds of play
  const PARKED = ['helpless', 'respawn', 'ko', 'final', 'stun'];   // long by design
  const runs = m.fighters.map((f) => ({ key: f.key, state: null, n: 0, worst: 0, worstState: '', stale: 0, worstStale: 0, hang: 0, worstHang: 0 }));
  const hitsAt = m.fighters.map(() => []);
  const origHit = m.hitFighter.bind(m);
  m.hitFighter = (atk, tgt, o) => { const k = m.fighters.indexOf(tgt); if (k >= 0) hitsAt[k].push(m.frame); return origHit(atk, tgt, o); };
  let nan = 0, slab = 0, lock = 0, worstLock = 0;
  for (let i = 0; i < TICKS; i++) {
    m.update();
    /* A hitlag lock is the signature of the juggle loop: both fighters are frozen
       by hitlag, the attacker's action timer never advances past the active window,
       and the next tick re-arms the hit.  Nothing recovers from it on its own. */
    lock = m.fighters.some((a) => a.hitlag > 0 && !a.eliminated &&
      m.fighters.some((b) => b !== a && !b.eliminated && Math.abs(a.x - b.x) < 90 && Math.abs(a.y - b.y) < 90)) ? lock + 1 : 0;
    worstLock = Math.max(worstLock, lock);
    m.fighters.forEach((f, k) => {
      if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) nan++;
      if (f.y > gd.y + 6 && f.y < gd.y + gd.h + 8 && f.x > gd.x + 6 && f.x < gd.x + gd.w - 6) slab++;
      const r = runs[k];
      if (m.state !== 'play') { r.state = null; r.n = 0; r.hang = 0; return; }   // the KO pause freezes everybody
      if (f.state === r.state) r.n++; else { r.state = f.state; r.n = 1; }
      if (!PARKED.includes(f.state) && r.n > r.worst) { r.worst = r.n; r.worstState = f.state; r.worstAt = i; }
      /* a fighter with no hitstun left must not stay in a hit state: that is the
         "lying on the floor forever" report, and it also keeps the air drag on, so
         the body slides at a third of a pixel a tick */
      // hitlag is a designed freeze, and it holds the state still by definition
      r.stale = ((f.state === 'hitstun' || f.state === 'launch') && f.hitstun <= 0 && f.hitlag <= 0) ? r.stale + 1 : 0;
      r.worstStale = Math.max(r.worstStale, r.stale);
      r.hang = f.state === 'ledge' ? r.hang + 1 : 0;
      r.worstHang = Math.max(r.worstHang, r.hang);
    });
  }
  assert(!nan, `${nan} non-finite positions`);
  assert(!slab, `${slab} frames with a fighter inside the stage slab`);
  assert(worstLock <= 30, `hitlag lock of ${worstLock} frames — a juggle loop`);
  /* Every hit has to come out of an action that can end: at most a handful of hits
     per second on one victim, however many CPUs are crowding it. */
  let burst = 0;
  for (const arr of hitsAt) {
    for (let i = 0; i < arr.length; i++) { let j = i; while (j < arr.length && arr[j] - arr[i] < 60) j++; burst = Math.max(burst, j - i); }
  }
  assert(burst <= 10, `${burst} hits on one fighter inside 60 frames`);
  const stale = runs.reduce((a, r) => Math.max(a, r.worstStale), 0);
  assert(stale <= 2, `a fighter sat in a hit state with no hitstun left for ${stale} frames`);
  const hang = runs.reduce((a, r) => Math.max(a, r.worstHang || 0), 0);
  assert(hang < 100, `a ledge-hang lasted ${hang} frames — the auto-get-up is not firing`);
  const worst = runs.reduce((a, r) => Math.max(a, r.worst), 0);
  const who = runs.find((r) => r.worst === worst);
  assert(worst < 400, `${who.key} sat in ${who.worstState} for ${worst} frames from frame ${who.worstAt}`);
  const kos = m.fighters.reduce((a, f) => a + f.stats.kos, 0);
  const dealt = m.fighters.reduce((a, f) => a + f.stats.dealt, 0);
  console.log(`        worst state run ${worst}f (${who.worstState}); hits ${hitsAt.reduce((a, x) => a + x.length, 0)}, burst ${burst}/60f, ledge ${hang}f, kos ${kos}, damage dealt ${dealt.toFixed(0)}`);
  assert(kos > 0 || dealt > 60, `40 seconds of four CPUs and nothing happened (${kos} kos, ${dealt.toFixed(0)}% dealt)`);
}

/* The three regressions that test was hunting, pinned individually. */
test('vs4: a multi-hit move lands its authored hits on one target, no more', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(2, ['vesper', 'grim']), 'skyshrine', { state: 'play' });
  const a = m.fighters[0], b = m.fighters[1];
  const move = a.def.moves.jab;
  assert(1 + (move.multi || 0) === 2, 'expected Vesper\'s jab to be the two-hit test case');
  a.state = 'idle'; b.state = 'idle';
  b.x = a.x + 20; b.y = a.y; b.vx = b.vy = 0;
  a.startAttack('jab', m);
  let hits = 0;
  const orig = m.hitFighter.bind(m);
  m.hitFighter = (atk, tgt, o) => { if (atk === a) hits++; return orig(atk, tgt, o); };
  for (let i = 0; i < move.frames + 12; i++) { b.x = a.x + 20; b.vx = b.vy = 0; m.update(); }
  const authored = 1 + (move.multi || 0);
  assert(hits === authored, `${a.key} jab hit ${hits}x, authored ${authored}x`);
});
test('vs4: a grab releases its victim even if the grabber never presses throw', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(2, ['grim', 'vesper']), 'skyshrine', { state: 'play' });
  const a = m.fighters[0], b = m.fighters[1];
  a.state = 'idle'; b.state = 'idle'; b.grabbedBy = null; a.grabbing = null;
  m.beginGrab(a, b);
  assert(b.grabbedBy === a, 'beginGrab did not attach the victim');
  let held = 0, stuck = 0;
  for (let i = 0; i < 220; i++) {
    a.input = { attack: true, attackP: i % 10 === 0 };      // pummel, never a throw input
    b.input = {};
    if (a.grabbing) held++;
    if (b.grabbedBy) stuck++;
    m.update();
  }
  /* 120 ticks is GRAB_HOLD_MAX; pummelling every 10 frames must not extend it, or
     the victim has no way out and reads as a fighter that is stuck. */
  assert(held > 100 && held <= 125, `the grab lasted ${held} frames, expected ~120`);
  assert(stuck === held, `the victim stayed attached for ${stuck} of ${held} frames`);
  assert(!a.grabbing && !b.grabbedBy, 'the pair never un-grabbed');
  assert(b.state !== 'grabbed', `victim still in state ${b.state} after the throw`);
});

/* =================== actions keep their momentum ===================
   A locked action owns the input, never the body.  `updateAction` used to be the
   last thing a grounded action did in a tick, so nothing integrated the velocity it
   wrote: the run attack's lunge, the roll, the dash specials' `dist`, the landing
   slide — all of it was thrown away, and the fighter stood stock still while the
   move played.  This is the family behind "the dash attack doesn't work". */

function dashInto(m, g, c, key, ticks) {
  const move = g.def.moves[key];
  g.state = 'run'; g.facing = 1; g.vx = g.def.stats.run; g.dashT = 4; g.runArmed = true; g.onGround = true;
  g.startAttack(key, m);
  const x0 = g.x;
  let travel = 0, len = 0;
  for (let i = 0; i < ticks; i++) {
    c.tick(1);
    travel = Math.max(travel, Math.abs(g.x - x0));
    if (g.action && g.action.key === key) len = Math.max(len, g.actionT);
  }
  return { travel, len, move };
}

test('dash: a run attack keeps its lunge instead of stopping dead', () => {
  const { ctx } = run();
  for (const key of ['grim', 'valor', 'vesper', 'astra', 'rook']) {
    const m = newMatch(ctx, cast(2, [key, 'rook']), 'skyshrine', { state: 'play' });
    const g = m.fighters[0];
    control(m).tick(24);                                   // settle on the deck
    const c = control(m, () => ({}));
    const r = dashInto(m, g, c, 'dashattack', g.def.moves.dashattack.frames + 6);
    assert(r.len > 0, `${key}: the dash attack never started`);
    // Before the fix this was 0.0px for every fighter in the roster.
    assert(r.travel > 18, `${key} dash attack travelled only ${r.travel.toFixed(1)}px`);
    assert(r.travel < 130, `${key} dash attack slid ${r.travel.toFixed(1)}px — a budget, not a freight train`);
  }
});

test('dash: the lunge is what carries the run attack onto its target', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(2, ['grim', 'rook']), 'skyshrine', { state: 'play' });
  const g = m.fighters[0], t = m.fighters[1];
  control(m).tick(24);
  // parked just past what the box reaches standing still, well inside lunge + box
  const reach = Math.max(...g.def.moves.dashattack.hitboxes.map((b) => b.x + b.w)) * g.scale;
  t.x = g.x + reach + 14; t.y = g.y; t.vx = t.vy = 0;
  const x0 = t.x;
  const c = control(m, () => ({}));
  g.state = 'run'; g.facing = 1; g.vx = g.def.stats.run; g.runArmed = true;
  g.startAttack('dashattack', m);
  let hit = false;
  for (let i = 0; i < g.def.moves.dashattack.frames + 8; i++) {
    t.x = x0; t.vx = t.vy = 0; t.hitstun = 0; t.hitlag = 0;   // a dummy that never moves
    if (g.action && g.action.key === 'dashattack' && g.activeBoxes().length) hit = true;
    c.tick(1);
  }
  assert(t.damage > 0, `the dummy at +14px past the standing box took ${t.damage}% — the lunge does not close the gap`);
});

/* Each roster recovery must be reachable through the actual input path, not
   just by calling startSpecial directly. */
test('up special: all six fighters rise from jump + special and up + special', () => {
  const keys = ['valor', 'grim', 'astra', 'vesper', 'rook', 'marrow'];
  for (const key of keys) for (const input of [{ jump: true, special: true, right: true }, { up: true, special: true }]) {
    const { ctx } = run();
    const m = newMatch(ctx, cast(1, [key]), 'terminal');
    const f = m.fighters[0]; const c = control(m);
    f.respawnT = 0; f.spawnProtect = 0; f.x = 0; f.y = -350; f.onGround = false; f.state = 'fall'; f.vx = 0; f.vy = 0;
    f.fastfalled = true; f.__raw = input; c.tick(1);
    assert(!f.fastfalled, `${key}: recovery did not cancel fast-fall`);
    assert(f.action && f.action.specialKey === 'u', `${key}: combo selected ${f.action && f.action.specialKey}`);
    assert(f.usedUpB, `${key}: recovery was not marked used`);
    assert(f.inputBuffer.jump === 0, `${key}: combo left a jump buffered`);
    const start = f.y; f.__raw = {}; c.tick(20);
    assert(f.y < start - 60, `${key}: up special did not rise enough (${(start - f.y).toFixed(1)}px)`);
  }
});

test('up special: jump held before special activates recovery without a second jump', () => {
  const { ctx } = run(); const m = newMatch(ctx, cast(1, ['valor']), 'terminal');
  const f = m.fighters[0]; const c = control(m);
  f.respawnT = 0; f.x = 0; f.y = 0; f.onGround = true; f.state = 'idle';
  f.__raw = { jump: true }; c.tick(4);
  assert(!f.onGround && f.state === 'jump', 'normal jump did not begin');
  const remaining = f.airJumpsLeft;
  f.__raw = { jump: true, special: true }; c.tick(1);
  assert(f.action && f.action.specialKey === 'u', 'held jump + special did not activate up special');
  assert(f.airJumpsLeft === remaining, 'up special consumed an extra jump');
});

test('up special: only once per airtime, restored by landing, ledge and respawn', () => {
  for (const key of ['valor', 'grim', 'astra', 'vesper', 'rook']) {
    const { ctx } = run(); const m = newMatch(ctx, cast(1, [key]), 'terminal');
    const f = m.fighters[0]; const c = control(m);
    f.respawnT = 0; f.spawnProtect = 0; f.x = 0; f.y = -400; f.onGround = false; f.state = 'fall'; f.vy = 0;
    f.__raw = { up: true, special: true }; c.tick(1);
    f.__raw = {}; c.tick(f.def.specials.up.frames + 2);
    // Keep the second attempt in open air regardless of fighter or stage geometry.
    f.y = -450; f.vy = 0; f.onGround = false; f.state = 'fall';
    f.__raw = { up: true, special: true }; c.tick(1);
    assert(!f.action || f.action.specialKey !== 'u', `${key}: repeated recovery in the air`);
    f.__raw = {}; f.y = -2; f.vy = 4; f.onGround = false; f.state = 'fall'; c.tick(1);
    assert(f.onGround && !f.usedUpB, `${key}: landing did not restore recovery`);
    c.tick(6); // let ordinary landing lag finish
    f.__raw = { up: true, special: true }; c.tick(1);
    assert(f.action && f.action.specialKey === 'u', `${key}: recovery unavailable after landing`);
    f.snapLedge(m, -1, m.stage.ground.x);
    assert(!f.usedUpB, `${key}: ledge did not restore recovery`);
    f.usedUpB = true; f.resetAt(0, -300, 1);
    assert(!f.usedUpB, `${key}: respawn reset did not restore recovery`);
  }
});

test('up special: other directions, jump and final smash remain distinct', () => {
  const { ctx } = run(); const m = newMatch(ctx, cast(1, ['valor']), 'terminal');
  const f = m.fighters[0]; const c = control(m);
  const air = () => { f.resetAt(0, -350, 1); f.respawnT = 0; f.onGround = false; f.state = 'fall'; f.__raw = {}; };
  for (const [input, expected] of [[{ special: true }, 'n'], [{ right: true, special: true }, 's'], [{ down: true, jump: true, special: true }, 'd']]) {
    air(); f.__raw = input; c.tick(1);
    assert(f.action && f.action.specialKey === expected, `expected ${expected}, got ${f.action && f.action.specialKey}`);
  }
  air(); const before = f.airJumpsLeft; f.__raw = { jump: true }; c.tick(1);
  assert(f.airJumpsLeft === before - 1 && !f.usedUpB, 'ordinary double jump changed');
  f.resetAt(0, m.stage.ground.y, 1); f.onGround = true; f.state = 'idle'; f.respawnT = 0; f.hasSmashBall = true;
  f.__raw = { jump: true, special: true }; c.tick(1);
  assert(f.finalActive > 0, 'smash ball should retain its grounded activation priority');
});

test('up special: each recovery can damage a nearby opponent once', () => {
  for (const key of ['valor', 'grim', 'astra', 'vesper', 'rook']) {
    const { ctx } = run(); const m = newMatch(ctx, cast(2, [key, 'rook']), 'terminal');
    const f = m.fighters[0], enemy = m.fighters[1], c = control(m);
    f.respawnT = enemy.respawnT = 0; f.spawnProtect = enemy.spawnProtect = 0;
    f.x = 0; f.y = -320; f.vx = f.vy = 0; f.onGround = false; f.state = 'fall';
    enemy.x = 0; enemy.y = -900; enemy.onGround = false; enemy.state = 'fall';
    f.__raw = { up: true, special: true }; c.tick(1); f.__raw = {};
    const sp = f.def.specials.up;
    for (let i = 0; i < sp.startup + 5; i++) {
      // For the teleport place the target at its destination, otherwise near the rise.
      enemy.x = f.x; enemy.y = key === 'astra' && !f.specialData.tpFired ? f.y - sp.dist - 50 : f.y - 70;
      enemy.vx = enemy.vy = 0; enemy.onGround = false; enemy.state = 'fall'; enemy.hitstun = 0; enemy.invincT = 0;
      c.tick(1);
    }
    const openingDamage = sp.ascentCombo ? sp.ascentCombo.opening : sp.damage;
    assert(Math.abs(enemy.damage - openingDamage) < .01, `${key}: recovery dealt ${enemy.damage}%, expected ${openingDamage}%`);
  }
});

test('dash: a roll rolls, and a rush special covers the distance its data promises', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(2, ['grim', 'rook']), 'skyshrine', { state: 'play' });
  const g = m.fighters[0];
  control(m).tick(24);
  const c = control(m, () => ({}));
  g.onGround = true; g.vx = 0; g.hitstun = 0;
  g.startRoll(1, m);
  let roll = 0;
  const x0 = g.x;
  for (let i = 0; i < 32; i++) { c.tick(1); roll = Math.max(roll, Math.abs(g.x - x0)); }
  assert(roll > 12, `a dodge-roll covered ${roll.toFixed(1)}px — a roll is a movement, not a pose`);

  for (const key of ['grim', 'valor', 'astra']) {
    const mm = newMatch(ctx, cast(2, [key, 'rook']), 'skyshrine', { state: 'play' });
    const f = mm.fighters[0];
    control(mm).tick(24);
    const cc = control(mm, () => ({}));
    f.onGround = true; f.vx = 0; f.facing = 1; f.hitstun = 0;
    f.startSpecial('s', mm);
    assert(f.state === 'special', `${key}: no rush special fired`);
    let best = 0;
    const sx = f.x;
    for (let i = 0; i < 100; i++) { cc.tick(1); best = Math.max(best, Math.abs(f.x - sx)); }
    const want = f.def.specials.side.dist;
    assert(best > want * 0.45, `${key}'s rush covered ${best.toFixed(0)}px of its authored ${want}px`);
    assert(best < want * 1.9, `${key}'s rush covered ${best.toFixed(0)}px, more than its authored ${want}px`);
  }

/* The other half of a rush: it covers the distance AND it hits what is standing on
   that distance.  A side special used to be pure theatre — the dash branch of
   `updateSpecial` granted the speed, the travel budget and the speed lines, and the
   `damage/bkb/kbs/angle` the move was authored with were read by nothing, because
   `checkHit` only ran for `a.type === 'move'`.  Fixing that exposed a second bug in the
   resolver itself: the one-hit cap was charged before the overlap was tested, so the
   first live tick of a travelling box burned the hit two ticks early and the rush walked
   through the target with 0% on it.  A standing jab cannot show that, which is why it
   took a move that moves to find it. */
test('special: a rush special lands the hit it was authored with', () => {
  const { ctx } = run();
  const problems = [];
  for (const key of ['valor', 'grim', 'astra']) {
    const m = newMatch(ctx, cast(2, [key, 'rook']), 'skyshrine', { state: 'play' });
    const f = m.fighters[0], t = m.fighters[1];
    control(m).tick(24);
    const c = control(m, () => ({}));
    f.onGround = true; f.vx = 0; f.vy = 0; f.hitstun = 0; f.facing = 1;
    const sp = f.def.specials.side;
    const reach = Math.max(...sp.hitboxes.map((b) => b.x + b.w)) * f.scale;
    const dx = f.x + Math.max(reach + 40, 120);      // out of the box until the rush carries it there
    const pin = () => { t.x = dx; t.y = m.stage.ground.y; t.vx = t.vy = 0; t.hitstun = 0; t.onGround = true; };
    pin();
    f.startSpecial('s', m);
    let touched = false;
    for (let i = 0; i < sp.frames + 12; i++) {
      pin();
      c.tick(1);
      const b = f.activeBoxes()[0];
      if (b) {
        const t0 = t.hurtbox;
        if (b.box.x < t0.x + t0.w && b.box.x + b.box.w > t0.x && b.box.y < t0.y + t0.h && b.box.y + b.box.h > t0.y) touched = true;
      }
    }
    const spent = (f.hitCount && f.hitCount.get(t.id)) || 0;
    if (Math.round(t.damage) !== sp.damage) problems.push(`${key}: rush landed ${t.damage}% instead of its authored ${sp.damage}%`);
    if (spent !== 1) problems.push(`${key}: rush spent ${spent} hits on one target (the cap is 1)`);
    if (!touched) problems.push(`${key}: the box never overlapped the target, so the hit was not the rush's doing`);
  }
  assert(!problems.length, problems.join('\n        '));

  // and it still only hits what the body actually passes through
  const m2 = newMatch(ctx, cast(2, ['grim', 'rook']), 'skyshrine', { state: 'play' });
  const g = m2.fighters[0], r = m2.fighters[1];
  control(m2).tick(24);
  const c2 = control(m2, () => ({}));
  g.onGround = true; g.vx = 0; g.hitstun = 0; g.facing = 1;
  r.x = g.x - 140; r.y = g.y; r.vx = r.vy = 0; r.onGround = true;   // behind him, away from the lunge
  g.startSpecial('s', m2);
  for (let i = 0; i < 70; i++) { r.x = g.x - 140; c2.tick(1); }
  assert(r.damage === 0, `a rush hit a fighter standing behind it for ${r.damage}%`);

  // a shield eats it the way every other melee move does: no damage, shield gone
  const m3 = newMatch(ctx, cast(2, ['valor', 'rook']), 'skyshrine', { state: 'play' });
  const v = m3.fighters[0], d = m3.fighters[1];
  control(m3).tick(24);
  const c3 = control(m3, () => ({}));
  v.onGround = true; v.vx = 0; v.hitstun = 0; v.facing = 1;
  const dreach = Math.max(...v.def.specials.side.hitboxes.map((b) => b.x + b.w)) * v.scale;
  const shield0 = 60;
  const pin3 = () => {
    d.x = v.x + Math.max(dreach + 30, 100); d.y = m3.stage.ground.y; d.vx = d.vy = 0; d.hitstun = 0;
    d.onGround = true; d.shieldHP = shield0; d.shielding = true;
  };
  pin3();
  v.startSpecial('s', m3);
  for (let i = 0; i < v.def.specials.side.frames + 12; i++) { pin3(); c3.tick(1); }
  assert(d.damage === 0, `a rushed shield took ${d.damage}% — the box should be eaten by the bubble`);
  assert(d.shieldHP < shield0, 'the rush passed through a shield without touching it');
});

  // …and a plain grounded move still stays where it was put
  const m3 = newMatch(ctx, cast(2, ['grim', 'rook']), 'skyshrine', { state: 'play' });
  const j = m3.fighters[0];
  control(m3).tick(24);
  const c3 = control(m3, () => ({}));
  j.onGround = true; j.vx = 0; j.state = 'idle';
  j.startAttack('jab', m3);
  let drift = 0;
  const jx = j.x;
  for (let i = 0; i < 24; i++) { c3.tick(1); drift = Math.max(drift, Math.abs(j.x - jx)); }
  assert(drift < 6, `a standing jab slid ${drift.toFixed(1)}px — a tilt should stay planted`);
});

test('grab: a pummel damages its victim inside the grab instead of launching them', () => {
  const { ctx } = run();
  const m = newMatch(ctx, cast(2, ['grim', 'vesper']), 'skyshrine', { state: 'play' });
  const a = m.fighters[0], b = m.fighters[1];
  control(m).tick(24);
  const c = control(m, () => ({}));
  m.beginGrab(a, b);
  const d0 = b.damage, x0 = b.x, y0 = b.y;
  let held = 0;
  for (let i = 0; i < 40; i++) {
    if (i % 8 === 0) m.pummel(a);
    if (a.grabbing && b.grabbedBy) held++;
    c.tick(1);
  }
  assert(b.damage > d0, `three pummels dealt ${b.damage - d0}% — the pummel did nothing`);
  assert(held > 30, `the pair stayed attached for only ${held}/40 frames — a pummel must not break the hold`);
  assert(b.state === 'grabbed', `victim is in state ${b.state}, expected to still be grabbed`);
  assert(Math.abs(b.y - y0) < 40 && Math.abs(b.x - (a.x + a.facing * 30 * a.scale)) < 8,
    `victim drifted to (${b.x.toFixed(0)},${b.y.toFixed(0)}) — a pummel is not a throw`);
  void x0;
});

/* =================== blocked hits, lunge windows, and the copied decks ===================
   Playtest report: "dash attack still doesn't inflict damage — look at damage logic and
   hitboxes".  The hitboxes were already fine (see the reach tests above); what was not:
   a held shield absorbed a hit *entirely* — shield HP fell, hitlag fired, and the damage
   meter did not move a point, so every attack into a blocking CPU read as a dud — and a
   run attack's box died before its lunge stopped travelling, so a foe reached late was
   walked through with 0% on them.  Both are pinned below, and the decks the AI hides
   behind are now the templates they came from. */

/* `run` frames of held direction, then the attack button, then let it play out. */
function attackInto(h, key, foeKey, gap, foeShield, stage) {
  const m = newMatch(h.ctx, cast(2, [key, foeKey || 'rook']), stage || 'skyshrine', { state: 'play' });
  m.rules.items = 'off';
  m.rules.hazards = false;
  const a = m.fighters[0], b = m.fighters[1];
  control(m).tick(30);
  const gr = m.stage.ground, px = gr.x + 160;
  a.x = px; a.y = gr.y; a.vx = 0; a.vy = 0; a.state = 'idle'; a.onGround = true; a.facing = 1;
  b.x = px + gap; b.y = gr.y; b.vx = 0; b.vy = 0; b.state = 'idle'; b.onGround = true;
  b.spawnProtect = 0; b.invincT = 0;
  // 30 ticks of running first: that is what a player does — hold the direction, let the
  // dash come, then press.  Attacking off a standstill is a different move (a tilt).
  let n = 0;
  const ctl = control(m, (f) => {
    if (f === a) return { right: n < 30, attack: n >= 30 };
    return foeShield ? { shield: true } : {};
  });
  let move = null, live = 0, dealt = 0;
  for (let i = 0; i < 150; i++, n++) {
    m.items.length = 0;                       // rules.items='off' only stops the *next* spawn
    if (foeShield) { b.shieldHP = Math.max(b.shieldHP, 45); b.shielding = true; }
    const before = b.damage;
    ctl.tick(1);
    dealt += b.damage - before;
    if (a.action && !move) move = a.action.key || a.action.type;
    if (a.activeBoxes && a.activeBoxes().length) live++;
  }
  return { a, b, move, live, dealt, shieldHP: b.shieldHP };
}

test('shield: a blocked hit is damage with a discount, not nothing', () => {
  const h = boot();
  for (const key of ['grim', 'valor']) {
    const open = attackInto(h, key, 'rook', 110, false);
    const blocked = attackInto(h, key, 'rook', 110, true);
    assert(open.move === 'dashattack', `${key}: the run attack produced ${open.move}`);
    assert(open.dealt > 0, `${key}: a dash attack into an open foe dealt 0% — the move cannot hit`);
    assert(blocked.dealt > 0, `${key}: into a held shield the same attack dealt 0% of ${open.dealt}`);
    assert(blocked.dealt < open.dealt, `${key}: blocking is worth nothing (${blocked.dealt} vs ${open.dealt})`);
    assert(blocked.shieldHP < 60, `${key}: the shield did not even take the hit`);
  }
});

test('dash: the lunge keeps its hitbox for as long as it is still travelling', () => {
  const h = boot();
  for (const key of ['grim', 'valor', 'astra', 'vesper', 'rook']) {
    const r = attackInto(h, key, 'rook', 240, false);
    assert(r.move === 'dashattack', `${key}: expected a dash attack, got ${r.move}`);
    assert(r.live >= 8, `${key}: the box was live for ${r.live} ticks — shorter than the charge that carries it`);
    assert(r.dealt > 0, `${key}: a foe 240px away was walked through with 0% on them`);
  }
});

/* The Ultimate templates the decks below are copied from: Battlefield is a flat deck,
   three soft platforms above it and one low one over the middle; Final Destination is
   that deck with the soft platforms removed.  A deck that claims a form and does not
   have its shape is the bug worth catching, because the shape is the whole idea. */
const FORMS = {
  field: { platforms: 4, minAbove: 3, low: true, hazard: null },
  bigfield: { platforms: 5, minAbove: 4, low: true, hazard: null },
  smallfield: { platforms: 3, minAbove: 2, low: true, hazard: null },
  nullshore: { platforms: 0, minAbove: 0, low: false, hazard: null },
  terminal: { platforms: 0, minAbove: 0, low: false, hazard: null },
  stadium: { platforms: 2, minAbove: 2, low: false, hazard: null },
  village: { platforms: 3, minAbove: 3, low: false, hazard: null },
  towncity: { platforms: 4, minAbove: 3, low: true, hazard: null },
  cartoon: { platforms: 3, minAbove: 3, low: false, hazard: null },
  league: { platforms: 4, minAbove: 3, low: true, hazard: null },
  cruise: { platforms: 3, minAbove: 3, low: false, hazard: 'pillar' },
};

test('decks: every stage is playable, and the copied ones keep the template they name', () => {
  const h = boot();
  const { STAGES, WORLD } = h.g;
  const keys = Object.keys(STAGES);
  assert(keys.length >= 16, `only ${keys.length} decks in the roster`);
  for (const k of keys) {
    const s = STAGES[k], g = s.ground;
    assert(s.name && s.sub && s.theme && s.accent && s.bg.length === 3, `${k}: a deck needs name, sub, theme, accent and a 3-stop sky`);
    assert(g.w >= 800 && g.w <= 2200, `${k}: unsupported deck width ${g.w}px`);
    const zone = newMatch(h.ctx, cast(1, ['valor']), k).blast;
    assert(g.x >= zone.left && g.x + g.w <= zone.right, `${k}: the deck reaches past the blast lines`);
    for (const p of s.platforms) {
      assert(p.x >= g.x - 40 && p.x + p.w <= g.x + g.w + 40, `${k}: a platform hangs off the deck it sits over`);
      assert(p.y < -60, `${k}: a platform at y=${p.y} is inside the deck, not above it`);
      assert(p.w >= 100 && p.h >= 12, `${k}: a ${p.w}x${p.h} platform is a lip, not a ledge`);
    }
    const form = FORMS[k];
    if (form) {
      assert(s.platforms.length === form.platforms,
        `${k}: ${s.platforms.length} platforms, but it is sold as the form with ${form.platforms}`);
      const above = s.platforms.filter((p) => p.y < -140).length;
      assert(above >= form.minAbove, `${k}: ${above} high platforms, expected at least ${form.minAbove}`);
      assert(!!s.platforms.find((p) => p.y >= -140) === form.low, `${k}: the low centre platform this form is defined by is missing`);
      assert((s.hazard && s.hazard.type) === form.hazard, `${k}: hazard is ${s.hazard && s.hazard.type}, expected ${form.hazard}`);
    }
    // and it plays: enough time holding left must reach the far edge of the deck —
    // a wall, a platform in the way or a fighter that cannot turn is the usual way a
    // hand-tuned layout quietly stops being playable.  Ledges are allowed to catch them.
    const m = newMatch(h.ctx, cast(2, ['grim', 'valor']), k, { state: 'play' });
    m.rules.items = 'none';
    const f = m.fighters[0];
    let edge = 1e9;
    const ctl = control(m, (ff) => (ff === f ? { left: true } : {}));
    for (let i = 0; i < 340; i++) { ctl.tick(1); edge = Math.min(edge, f.x); }
    assert(m.frame > 200, `${k}: the match stopped ticking`);
    assert(edge <= m.stage.ground.x + 40 || f.eliminated,
      `${k}: a fighter held at the left edge got only to x=${edge.toFixed(0)} of deck edge ${m.stage.ground.x}`);
  }
});

test('XL stages: wider decks keep recoverable blast zones and projectiles', () => {
  const { ctx, g } = run();
  for (const key of ['grandrift', 'colossalstadium', 'horizon']) {
    const m = newMatch(ctx, cast(2, ['valor', 'grim']), key);
    m.rules.items = 'none';
    const gd = m.stage.ground, f = m.fighters[0];
    assert(gd.w > 1400, `${key} is not larger than existing decks`);
    assert(m.blast.left <= gd.x - 650 && m.blast.right >= gd.x + gd.w + 650,
      `${key} lacks recovery space beyond the deck`);
    f.x = gd.x + gd.w + 300; f.y = -100; f.onGround = false;
    assert(!f.checkBlastNow(m), `${key} KO'd a fighter in the recovery space`);
    m.spawnProjectile({ owner: f, x: gd.x + gd.w + 220, y: -100, vx: 1 });
    const p = m.projectiles[0]; p.update(m);
    assert(!p.dead, `${key} removed a projectile inside its blast zones`);
    f.x = m.blast.right + 1;
    assert(f.checkBlastNow(m), `${key} failed to KO past the blast zone`);
    m.cam.W = 400; m.cam.H = 225;
    m.cam.update(m.fighters);
    assert(m.cam.tz < 0.42, `${key} camera cannot zoom out for a narrow viewport`);
  }
  const regular = newMatch(ctx, cast(1, ['valor']), 'terminal');
  assert(regular.blast.left === g.WORLD.blast.left && regular.blast.right === g.WORLD.blast.right,
    'standard stage blast zones changed');
});


/* Real input and item lifecycle coverage, for every item category. */
function itemFixture(keys = ['valor', 'grim']) {
  const {ctx, g} = run();
  const m = newMatch(ctx, cast(keys.length, keys), 'skyshrine', {rules: {items: 'none'}});
  const a = m.fighters[0], b = m.fighters[1];
  for (const [i, f] of m.fighters.entries()) {
    f.x = i * 300; f.y = m.stage.ground.y; f.vx = f.vy = 0;
    f.onGround = true; f.state = 'idle'; f.spawnProtect = 0; f.invincT = 0;
  }
  a.facing = 1;
  let input = {};
  const ctl = control(m, (f, i) => i === 0 ? input : {});
  return {m, a, b, g, ctl, set: v => { input = v; }};
}
function itemAt(m, f, type) {
  const it = m.spawnItem(type, f.x, f.y - 8);
  it.spawnT = 0; it.onGround = true; it.vx = it.vy = 0;
  return it;
}

test('items: V uses all ranged and throwable items from actual input', () => {
  for (const key of ['bobomb', 'shell', 'bumper', 'raygun', 'fireflower']) {
    const {m, a, ctl, set} = itemFixture();
    const it = itemAt(m, a, key);
    ctl.tick(1); assert(a.held === it, `${key}: automatic pickup failed`);
    set({grab:true}); ctl.tick(1);
    assert(a.state === 'attack' && a.action.type === 'item', `${key}: V started a grab instead of using the item`);
    assert(m.projectiles.length === 1, `${key}: no projectile created`);
    if (it.def.cat === 'throw') assert(!a.held && it.dead && !it.heldBy, `${key}: not released`);
    else assert(a.held === it && it.ammo === it.def.ammo - 1, `${key}: shot did not consume ammo`);
  }
});

test('items: fired and thrown projectiles hit opponents', () => {
  for (const key of ['shell','bumper','raygun','fireflower']) {
    const {m,a,b,ctl,set} = itemFixture();
    itemAt(m,a,key); ctl.tick(1); b.x = a.x + 145; b.y = a.y; b.spawnProtect = b.invincT = 0;
    set({grab:true}); ctl.tick(1); set({}); ctl.tick(25);
    assert(b.damage > 0, `${key}: projectile did not hit opponent`);
  }
});

test('items: held items can be used in the air and while shielding', () => {
  for (const air of [true, false]) {
    const {m,a,ctl,set} = itemFixture(); itemAt(m,a,'bobomb'); ctl.tick(1);
    if (air) { a.y -= 120; a.onGround = false; a.state = 'fall'; }
    else { set({shield:true}); ctl.tick(1); assert(a.shieldHP > 0, 'held item disabled shield'); }
    set({grab:true, shield:!air}); ctl.tick(1);
    assert(!a.held && m.projectiles.length === 1 && a.shieldHP === 0, `item did not activate ${air ? 'in air' : 'out of shield'}`);
  }
});

test('items: CPU item decisions do not bypass hitstun or fighter action states', () => {
  const {m,a,b,g,ctl} = itemFixture();
  const gun = itemAt(m,a,'raygun'); ctl.tick(1); b.x = a.x + 100;
  const cpu = new g.CPU(a,m); cpu.target = b; cpu.plan = 'attack'; cpu.timer = 9999;
  a.hitstun = 90; a.state = 'hitstun';
  for (let i = 0; i < 100; i++) cpu.think(m);
  assert(a.held === gun && gun.ammo === undefined && m.projectiles.length === 0, 'CPU fired directly through hitstun');
});

test('items: hammer expires without leaving an orphaned item', () => {
  const {m,a,ctl} = itemFixture(); const hammer = itemAt(m,a,'hammer'); ctl.tick(1);
  hammer.heldTime = 2; ctl.tick(3);
  assert(!a.held && !hammer.heldBy && hammer.dead && !m.items.includes(hammer), 'hammer did not expire cleanly');
});

test('items: a shot buffered during recovery fires as soon as the cooldown ends', () => {
  const {m,a,ctl,set} = itemFixture(); const gun = itemAt(m,a,'raygun'); ctl.tick(1);
  set({grab:true}); ctl.tick(1); set({}); ctl.tick(18);
  set({grab:true}); ctl.tick(1); set({}); ctl.tick(8);
  assert(gun.ammo === gun.def.ammo - 2, `buffered shot was lost (ammo ${gun.ammo})`);
});

test('items: simultaneous pickup and V does not waste the item or start a grab', () => {
  const {m, a, ctl, set} = itemFixture();
  const it = itemAt(m, a, 'bobomb');
  set({grab:true}); ctl.tick(1);
  assert(a.held === it && m.projectiles.length === 0 && a.state !== 'grab', 'pickup input also consumed or grabbed');
  set({}); ctl.tick(1); set({grab:true}); ctl.tick(1);
  assert(!a.held && m.projectiles.length === 1, 'fresh V did not throw');
});

test('items: bomb detonates once on contact or ground and respects teams and shields', () => {
  for (const ground of [false, true]) {
    const {m, a, b, ctl, set} = itemFixture();
    const it = itemAt(m, a, 'bobomb'); ctl.tick(1);
    b.x = ground ? 160 : 100; b.y = a.y; b.spawnProtect = b.invincT = 0;
    if (ground) b.shieldHP = 60;
    set({grab:true}); ctl.tick(1); set({});
    let explosions = 0; const original = m.fx.explode.bind(m.fx);
    m.fx.explode = (...args) => { explosions++; return original(...args); };
    ctl.tick(30);
    assert(explosions === 1, `bomb ${ground ? 'ground' : 'contact'} exploded ${explosions} times`);
    assert(!m.projectiles.length && (ground ? b.shieldHP < 60 : b.damage > 0), 'bomb did not damage or pressure shield');
  }
  const {m, a, b, ctl, set} = itemFixture();
  m.rules.teams = true; a.team = b.team = 1; b.x = 105; b.y = a.y;
  itemAt(m, a, 'bobomb'); ctl.tick(1); set({grab:true}); ctl.tick(1); set({}); ctl.tick(30);
  assert(b.damage === 0 && a.damage === 0, 'bomb damaged owner or teammate');
});

test('items: F applies each melee perk to normal moves, while G remains special', () => {
  for (const key of ['beamsword', 'homerunbat', 'starrod', 'hammer']) {
    const {m, a, ctl, set} = itemFixture();
    const it = itemAt(m, a, key); ctl.tick(1);
    assert(a.held === it, `${key}: not picked up`);
    set({attack:true}); ctl.tick(1);
    const act = a.action, base = a.def.moves[act.key];
    assert(act.type === 'move' && act.key === 'jab' && act.itemPerk === it.def.perk, `${key}: F did not keep the regular move`);
    assert(act.damage > base.damage, `${key}: no damage perk`);
    if (key === 'beamsword') assert(act.hitboxes[0].w > base.hitboxes[0].w, 'sword did not extend reach');
    if (key === 'homerunbat') assert(act.kbs > base.kbs && act.bkb > base.bkb, 'bat did not boost launch');
    set({}); ctl.tick(act.startup + 2);
    if (key === 'starrod') assert(m.projectiles.some(p => p.kind === 'star'), 'rod fired no star');
    ctl.tick(70); set({special:true}); ctl.tick(1);
    assert(a.action && a.action.type === 'special', `${key}: G no longer starts special`);
  }
});

test('items: melee strikes use normal hit windows and cannot hit every frame', () => {
  for (const key of ['beamsword','homerunbat','starrod','hammer']) {
    const {m,a,b,ctl,set} = itemFixture();
    itemAt(m,a,key); ctl.tick(1); b.x = a.x + 48; b.y = a.y;
    let hits = 0; const orig = m.hitFighter.bind(m);
    m.hitFighter = (atk,tgt,o) => { if (atk === a && tgt === b) hits++; return orig(atk,tgt,o); };
    set({attack:true}); ctl.tick(1); set({}); ctl.tick(45);
    assert(hits === 1 && b.damage > 0, `${key}: ${hits} hits from one jab`);
  }
});

test('items: dropping, cooldown, ammo exhaustion, KO and disabled spawning preserve ownership', () => {
  const {m,a,ctl,set} = itemFixture();
  const it = itemAt(m,a,'beamsword'); ctl.tick(1);
  set({grab:true}); ctl.tick(1); set({});
  assert(!a.held && !it.heldBy && m.items.filter(x => x === it).length === 1, 'drop duplicated or retained item');
  a.x = it.x; it.y = a.y - 8; it.vx = it.vy = 0; it.onGround = true;
  ctl.tick(2); assert(!a.held, 'immediately re-picked the dropped weapon');
  ctl.tick(50); assert(a.held === it, 'dropped weapon never became pickable');
  a.die(m,null); assert(!a.held && !it.heldBy && it.dead, 'KO orphaned held weapon');
  ctl.tick(1); assert(!m.items.includes(it), 'dead item was not removed when spawning disabled');
  const x = itemFixture(); const gun = itemAt(x.m,x.a,'raygun'); gun.ammo = 1; x.ctl.tick(1);
  x.set({grab:true}); x.ctl.tick(1);
  assert(!x.a.held && !gun.heldBy && gun.dead && x.m.projectiles.length === 1, 'last shot did not release the empty gun');
});

test('items: pickups activate every instant category, containers and smash ball', () => {
  for (const key of ['heart','tomato','food','star','mushroom','poison','metalbox','bunnyhood','crate','capsule','riftorb','assist']) {
    const {m,a,ctl} = itemFixture(); a.damage = 80;
    const it = itemAt(m,a,key); ctl.tick(1);
    assert(it.dead && !a.held, `${key}: not activated on contact`);
    if (it.def.cat === 'heal') assert(a.damage < 80, `${key}: did not heal`);
    if (it.def.cat === 'status') assert(Object.values(a.buffs).some(v => v > 0), `${key}: no status`);
    if (it.def.cat === 'summon') assert(m.summons.length === 1, `${key}: no summon`);
    if (it.def.cat === 'container') assert(m.items.length > 1, `${key}: no contents`);
  }
  const {m,a} = itemFixture(); const sb = itemAt(m,a,'smashball'); sb.smashBall = true; sb.hp = 1;
  assert(!m.tryPickup(a), 'smash ball picked up instead of broken');
  m.itemsHitByAttack(a,sb.box,10);
  assert(sb.dead && a.hasSmashBall, 'smash ball did not award final smash');
});


/* Signature specials and combo attacks must work through real player input,
   hit unpinned opponents, and still end rather than trapping a victim. */
test('signature specials: all five neutral G moves are distinct, hit, and end', () => {
  const expected = { valor: ['bladecombo', 2], grim: ['quake', 1], astra: ['starfall', 3], vesper: ['flurry', 3], rook: ['punchcombo', 3] };
  for (const key of Object.keys(expected)) for (const facing of [-1, 1]) {
    const {m,a,b,ctl,set} = itemFixture([key,'grim']);
    a.facing = facing; b.x = facing * (key === 'astra' ? 120 : 50); b.y = a.y;
    const hits = []; const spawn = []; const original = m.hitFighter.bind(m), fire = m.spawnProjectile.bind(m);
    m.hitFighter = (atk,tgt,o) => { if (atk === a && tgt === b) hits.push(o); return original(atk,tgt,o); };
    m.spawnProjectile = o => { spawn.push(o.kind); return fire(o); };
    set({special:true}); ctl.tick(1);
    assert(a.action && a.action.specialType === expected[key][0], `${key}: wrong neutral special`);
    set({}); ctl.tick(100);
    const validHits = key === 'astra' ? hits.length >= 1 && hits.length <= 3 : hits.length === expected[key][1];
    assert(validHits, `${key} facing ${facing}: unexpected hit count ${hits.length}`);
    assert(b.damage > 0 && a.state !== 'special', `${key}: no damage or action did not end`);
    if (key === 'astra') assert(spawn.length === 3 && spawn.every(k => k === 'fallingStar'), 'Astra did not summon three stars');
    else assert(spawn.length === 0, `${key}: melee special fired a projectile`);
    if (hits.length > 1 && key !== 'astra') assert(hits.at(-1).bkb > hits[0].bkb, `${key}: final strike did not launch harder`);
    assert(Math.cos(hits.at(-1).angle * Math.PI / 180) * facing > 0, `${key}: final strike launches backward facing ${facing}`);
  }
});

test('signature specials: Rook side G follows input direction and rises into a launch', () => {
  for (const dir of [-1,1]) {
    const {m,a,b,ctl,set} = itemFixture(['rook','grim']);
    a.facing = -dir; b.x = dir * 80; b.y = a.y;
    const y = a.y; let lowest = y; let strike = null; const orig = m.hitFighter.bind(m);
    m.hitFighter = (atk,tgt,o) => { if (atk === a && tgt === b) strike = o; return orig(atk,tgt,o); };
    set({special:true,left:dir < 0,right:dir > 0}); ctl.tick(1);
    assert(a.action && a.action.specialType === 'risingdash' && a.facing === dir, 'side G ignored input direction');
    set({}); for(let i=0;i<65;i++) { ctl.tick(1); lowest = Math.min(lowest,a.y); }
    assert(lowest < y - 20 && strike && strike.angle > 70 && b.damage > 0, `Rook did not rise and launch facing ${dir}`);
    assert(a.state !== 'special', 'rising strike never ended');
  }
});

test('signature specials: Astra down G creates a pulling orb that damages an enemy', () => {
  const {m,a,b,ctl,set} = itemFixture(['astra','grim']);
  b.x = 60; b.y = a.y; set({down:true,special:true}); ctl.tick(1); set({});
  ctl.tick(a.def.specials.down.startup + 2);
  const orb = m.projectiles.find(p => p.kind === 'orb');
  assert(orb && orb.pull && orb.owner === a, 'Astra did not create her down-special orb');
  ctl.tick(25); assert(b.damage > 0, 'gravity orb did not damage nearby enemy');
});

test('signature specials: combo hits respect shields, teams, invincibility and hit caps', () => {
  for (const key of ['valor','grim','vesper','rook']) for (const defense of ['shield','team','invincible']) {
    const {m,a,b,ctl,set} = itemFixture([key,'grim']);
    b.x = 50; b.y = a.y; m.checkEnd = () => {};
    if (defense === 'shield') { b.shieldHP = 60; b.state = 'shield'; b.__raw = {shield:true}; m.readPlayerInput = f => f === a ? (a.__raw || {}) : {shield:true}; }
    if (defense === 'team') { m.rules.teams = true; a.team = b.team = 1; }
    if (defense === 'invincible') b.invincT = 150;
    const orig = m.hitFighter.bind(m); let hits = 0;
    m.hitFighter = (atk,tgt,o) => { if (atk === a && tgt === b) hits++; return orig(atk,tgt,o); };
    // control() normally provides inputs, so assign a real pressed edge directly.
    set({special:true}); ctl.tick(1); set({}); ctl.tick(80);
    if (defense === 'shield') assert(b.shieldHP < 60 && hits === 0, `${key}: shield bypassed`);
    else assert(b.damage === 0 && hits === 0, `${key}: hit ${defense} target`);
    assert(a.state !== 'special', `${key}: ${defense} caused a lock`);
  }
});

test('signature combos: dash and jab variations retain hit windows and item perks', () => {
  const {g} = run();
  assert(g.FIGHTERS.valor.moves.dashattack.angle !== g.FIGHTERS.grim.moves.dashattack.angle, 'Valor and Grim dash attacks launch alike');
  assert(g.FIGHTERS.vesper.moves.dashattack.multi > 0, 'Vesper dash has no combo');
  assert(g.FIGHTERS.rook.moves.jab.multi > 0, 'Rook has no punch combo');
  assert(g.FIGHTERS.astra.moves.dashattack.signature === 'comet', 'Astra has no comet dash');
  const {m,a,ctl,set} = itemFixture(['astra','grim']); a.held = {type:'beamsword',def:g.ITEMS.beamsword,heldBy:a};
  a.state='run'; a.vx=6; a.dashT=5;
  set({attack:true}); ctl.tick(1); set({}); ctl.tick(12);
  assert(m.projectiles.some(p => p.kind === 'fallingStar'), 'comet dash did not release its star');
});

test('signature combos: CPU drops through a platform to reach an opponent, even with an item', () => {
  for (const held of [false,true]) {
    const {m,a,b,g} = itemFixture(); const p = m.stage.platforms[0];
    a.x = (p.cx !== undefined ? p.cx : p.x) + p.w / 2; a.y = p.cy !== undefined ? p.cy : p.y;
    a.onGround = true; a.onPlatform = p; a.state = 'idle'; b.x = a.x; b.y = m.stage.ground.y;
    if (held) a.held = { type:'beamsword', def:g.ITEMS.beamsword, heldBy:a };
    const cpu = new g.CPU(a,m); cpu.level = 2; cpu.target = b; cpu.plan = 'approach'; cpu.timer = 200;
    a.readInput(cpu.think(m)); a.update(m);
    assert(!a.onGround && !a.onPlatform && a.dropThroughT > 0, `CPU stayed on platform with held=${held}`);
  }
});


test('range: every fighter F move has wider hitboxes without changing their windows', () => {
  const {ctx,g} = run();
  const keys = ['jab','ftilt','utilt','dtilt','dashattack','fsmash','usmash','dsmash','nair','fair','bair','uair','dair'];
  // Authored (pre-range-pass) widths; each move must retain all boxes and windows.
  const widths = {
    valor:[46,56,74,52,62,70,92,66,84,66,62,68,52],
    grim:[52,66,84,64,74,82,108,88,104,78,74,84,62],
    astra:[56,66,76,58,64,84,104,92,92,74,68,76,56],
    vesper:[40,50,68,46,58,62,84,76,80,58,58,64,46],
    rook:[54,62,74,56,66,92,96,88,92,76,70,74,52]
  };
  for (const [fighter, expected] of Object.entries(widths)) for (let i=0;i<keys.length;i++) {
    const move = g.FIGHTERS[fighter].moves[keys[i]];
    assert(Math.abs(move.hitboxes[0].w - expected[i] * 1.25) < 1e-8, `${fighter}.${keys[i]} did not gain 25% width`);
    assert(move.startup > 0 && move.active > 0 && move.frames >= move.startup + move.active, `${fighter}.${keys[i]} lost timing`);
    if (keys[i] === 'dsmash') assert(move.hitboxes.length === 2 && Math.abs(move.hitboxes[1].w - expected[i] * 1.25) < 1e-8,
      `${fighter}: rear or forward sweep not enlarged`);
  }
  const vm = require('vm');
  const test = vm.runInContext(`(() => {
    const b = {x: 10, y: -70, w: 40, h: 30, t0: 2, t1: 3};
    const m = {startup: 4, active: 4, frames: 20, damage: 9, bkb: 12, kbs: 25, hitboxes: [b]};
    const tuned = tuneMove(m, 'ftilt', 100);
    return {before: b, after: tuned.hitboxes[0], damage: tuned.damage, bkb: tuned.bkb, kbs: tuned.kbs};
  })()`, ctx);
  assert(test.before.w === 40 && test.before.h === 30, 'original hitbox was mutated');
  assert(test.after.w === 50 && test.after.h === 34.5 && test.after.t0 === 2 && test.after.t1 === 3, 'range or window changed incorrectly');
  assert(test.damage === 9 && test.bkb === 12 && test.kbs === 25, 'range pass altered damage or knockback');
});

test('range: forward F attacks hit beyond the old reach on both sides', () => {
  const old = {valor:[18,56], grim:[14,66], astra:[16,66], vesper:[12,50], rook:[14,62]};
  for (const key of Object.keys(old)) for (const face of [-1,1]) {
    const {m,a,b,ctl} = itemFixture([key,'rook']);
    a.facing = face; a.vx = 0; a.x = 0; b.y = a.y;
    // The target's near edge is two units beyond the old authored hitbox.
    const half = b.hurtbox.w / 2;
    const oldEdge = (old[key][0] + old[key][1]) * a.scale;
    b.x = face * (oldEdge + half + 2);
    a.startAttack('ftilt',m);
    for (let i=0;i<a.def.moves.ftilt.startup+3;i++) { a.x = 0; a.vx = 0; ctl.tick(1); }
    assert(b.damage > 0, `${key}: extended F attack missed facing ${face}`);
  }
});

test('range: Grim quake hits a wider area in front and behind once, not the whole stage', () => {
  for (const face of [-1,1]) {
    const {ctx} = run(); const m = newMatch(ctx, cast(4,['grim','valor','vesper','rook']), 'skyshrine', {rules:{items:'none'}});
    const [a,front,back,far] = m.fighters;
    for (const f of m.fighters) { f.y = m.stage.ground.y; f.vx = f.vy = 0; f.onGround = true; f.state = 'idle'; f.spawnProtect = 0; f.invincT = 0; }
    a.x = 0; a.facing = face; front.x = face * 180; back.x = -face * 85; far.x = face * 360;
    const angles = new Map(); const counts = new Map(); const orig = m.hitFighter.bind(m);
    m.hitFighter = (atk,tgt,o) => { if(atk===a) { angles.set(tgt,o.angle); counts.set(tgt,(counts.get(tgt)||0)+1); } return orig(atk,tgt,o); };
    let raw = {special:true}; const ctl = control(m,(f,i) => i === 0 ? raw : {});
    ctl.tick(1); raw = {}; ctl.tick(65);
    assert(front.damage > 0 && back.damage > 0, `quake missed an extended target facing ${face}`);
    assert(far.damage === 0 && counts.get(front) === 1 && counts.get(back) === 1, 'quake reached too far or hit repeatedly');
    assert(Math.cos(angles.get(front)*Math.PI/180)*face > 0 && Math.cos(angles.get(back)*Math.PI/180)*face < 0,
      'quake did not launch targets away from Grim');
  }
});


/* K28: recoveries, pickup feedback and expanded survival space. */
test('ascent: natural uppercut connects three times in both directions even at high damage', () => {
  for (const face of [-1,1]) for (const damage of [0,150]) {
    const {m,a,b,ctl,set} = itemFixture(); a.facing = face; b.x = face * 35; b.damage = damage;
    const hits = []; const orig = m.hitFighter.bind(m);
    m.hitFighter = (attacker,target,o) => { if (attacker === a && target === b) hits.push(o.damage); return orig(attacker,target,o); };
    set({up:true,special:true}); ctl.tick(1); set({}); ctl.tick(70);
    assert(hits.join(',') === '3,3,6' && b.damage === damage + 12, `face ${face}, ${damage}%: hits ${hits}`);
    assert(a.state !== 'special', 'ascent failed to end');
  }
});

test('ascent: an opening miss, shield, teammate or invincibility cannot start follow-ups', () => {
  for (const defense of ['miss','shield','team','invincible']) {
    const {m,a,b,ctl,set} = itemFixture(); b.x = defense === 'miss' ? 350 : 35;
    if (defense === 'team') { m.rules.teams = true; a.team = b.team = 1; }
    if (defense === 'invincible') b.invincT = 100;
    if (defense === 'shield') { b.shieldHP = 60; b.state = 'shield'; }
    let hits = 0, blocks = 0; const hit = m.hitFighter.bind(m), shield = m.shieldHit.bind(m);
    m.hitFighter = (x,y,o) => { if(x === a && y === b) hits++; return hit(x,y,o); };
    m.shieldHit = (x,y,...rest) => { if(x === a && y === b) blocks++; return shield(x,y,...rest); };
    set({up:true,special:true}); ctl.tick(1); set({});
    // Keep a shield active through the opening without needing a second player's input.
    for (let i=0;i<35;i++) { if (defense === 'shield') { b.shieldHP = 60; b.state = 'shield'; } ctl.tick(1); }
    assert(hits === 0 && (defense === 'shield' || b.damage === 0), `${defense}: combo hit a protected or missed target`);
    if (defense === 'shield') assert(blocks === 1, `shield got ${blocks} blocks instead of opening only`);
  }
});

test('ascent: follow-ups recheck range, defenses and interruption', () => {
  for (const mode of ['range','shield','team','invincible','interrupt']) {
    const {m,a,b,ctl,set} = itemFixture(); b.x = 35;
    const hits = []; const orig = m.hitFighter.bind(m);
    m.hitFighter = (x,y,o) => { if(x===a && y===b) hits.push(o.damage); return orig(x,y,o); };
    set({up:true,special:true}); ctl.tick(1); set({});
    for (let i=0;i<30 && !hits.length;i++) ctl.tick(1);
    assert(hits.length === 1, `${mode}: opening missed`);
    if (mode === 'range') { b.x = 900; b.vx = b.vy = 0; }
    if (mode === 'team') { m.rules.teams = true; a.team = b.team = 1; }
    if (mode === 'invincible') b.invincT = 100;
    if (mode === 'interrupt') m.hitFighter(null,a,{damage:1,bkb:20,kbs:0,angle:80});
    for (let i=0;i<45;i++) { if(mode === 'shield') { b.shieldHP = 60; b.state = 'shield'; } ctl.tick(1); }
    assert(hits.length === 1, `${mode}: follow-up landed despite changed conditions (${hits})`);
  }
});

test('items: every pickup category displays a local named label and ring, replacing old labels', () => {
  for (const key of ['heart','star','riftorb','crate','hammer','beamsword','bobomb','raygun']) {
    const {m,a} = itemFixture(); a.damage = 80; const it = itemAt(m,a,key);
    assert(m.tryPickup(a), `${key}: pickup failed`);
    assert(m.fx.texts.some(t => t.str === 'PICKUP: ' + it.def.name), `${key}: missing label`);
    assert(m.fx.rings.some(r => r.color === it.def.color), `${key}: missing ring`);
    if (it.def.cat === 'heal') assert(m.fx.texts.some(t => t.str.startsWith('-')), `${key}: missing heal amount`);
    a.held = null; const next = itemAt(m,a,'food'); assert(m.tryPickup(a), 'second pickup failed');
    assert(m.fx.texts.filter(t => t.str.startsWith('PICKUP: ')).length === 1, 'pickup labels piled up');
  }
  const {m,a} = itemFixture(); const it = itemAt(m,a,'smashball'); it.smashBall = true;
  assert(!m.tryPickup(a) && !m.fx.texts.some(t=>t.str.startsWith('PICKUP: ')), 'smash ball falsely announced as picked up');
});

test('blast: wider side and upper zones preserve bottom boundary and camera frames fighters', () => {
  for (const stage of ['skyshrine','grandrift','colossalstadium','horizon']) {
    const {ctx} = run(); const m = newMatch(ctx,cast(2,['valor','grim']),stage,{rules:{items:'none'}});
    const b = m.blast, gd = m.stage.ground, [a,f] = m.fighters;
    assert(m.stage.key === stage, `${stage}: stage fixture not found`);
    assert(b.left <= -1550 && b.right >= 1550 && b.top === -1150 && b.bottom === 780, `${stage}: wrong bounds`);
    if(m.stage.size === 'XL') assert(b.left <= gd.x-950 && b.right >= gd.x+gd.w+950, `${stage}: insufficient XL room`);
    a.x = b.left+50; a.y = b.top+100; f.x = b.right-50; f.y = gd.y;
    assert(!a.checkBlastNow(m) && !f.checkBlastNow(m), `${stage}: KO inside expanded zone`);
    m.cam.W = 900; m.cam.H = 600;
    for(let i=0;i<250;i++) m.cam.update([a,f]);
    const view = m.cam.viewBounds;
    assert(a.x > view.x && f.x < view.x+view.w && a.y-110 > view.y && f.y+30 < view.y+view.h, `${stage}: camera excludes fighters`);
    f.x=b.right+1; assert(f.checkBlastNow(m), `${stage}: no KO outside side bound`);
  }
});

test('physics: underside blocks an upward launch without pulling offstage fighters sideways', () => {
  const {m,a} = itemFixture(), gd = m.stage.ground;
  a.x = 0; a.y = gd.y+gd.h+16; a.vx=0; a.vy=-15; a.onGround=false; a.state='launch'; a.hitstun=20;
  a.applyPhysics(m);
  assert(a.y >= gd.y+gd.h+14 && a.vy === 0, 'fighter passed through the underside');
  a.x = gd.x-120; a.y = gd.y+gd.h+16; a.vy=-15; a.vx=0; a.applyPhysics(m);
  assert(a.x === gd.x-120 && a.y < gd.y+gd.h+14, 'underside collision affected an offstage recovery');
});


/* Marrow: real inputs, clean-hit healing, defenses, recovery and CPU safety. */
test('marrow: existing saves migrate and classic opponents are valid', () => {
  const vm = require('vm'); const {ctx,sandbox} = run();
  sandbox.localStorage.setItem('rift-rumble-save-v1', JSON.stringify({unlocked:['valor','grim','astra','vesper','rook'],coins:123,settings:{music:false}}));
  const migrated=vm.runInContext('SAVE.load()',ctx);
  assert(migrated.unlocked.includes('marrow') && migrated.coins===123 && !migrated.settings.music, 'existing save did not migrate');
  sandbox.Game={startMatch:opts=>{ sandbox.lastClassic=opts; }};sandbox.UI={toast:()=>{}};
  require('./harness').load(ctx,['js/modes.js']);
  for(const key of ['valor','grim','astra','vesper','rook','marrow']) {
    vm.runInContext(`Modes.startClassic('${key}',0,5)`,ctx);
    const stages=vm.runInContext('Modes.current.stages',ctx);
    assert(stages.slice(0,4).every(s=>s.enemy!==key && !!sandbox.lastClassic),key+' invalid classic opponent');
  }
  vm.runInContext("Modes.startClassic('valor',0,5)",ctx);
  assert(vm.runInContext('Modes.current.stages.some(s=>s.enemy==="marrow")',ctx),'Marrow cannot appear in classic');
});

test('marrow: soul reap hits once and heals only on clean enemy contact', () => {
  for (const face of [-1,1]) for (const mode of ['hit','miss','shield','team','invincible','counter']) {
    const {m,a,b,ctl,set}=itemFixture(['marrow','valor']); a.facing=face; a.damage=20;
    b.x=face*(mode==='miss'?1200:75);
    if(mode==='team') m.sameTeam=()=>true;
    if(mode==='invincible') b.invincT=100;
    if(mode==='counter') b.counterActive=true;
    const read=m.readPlayerInput; if(mode==='shield') m.readPlayerInput=f=>f===b ? {shield:true} : read(f);
    let hits=0; const hit=m.hitFighter.bind(m);
    m.hitFighter=(x,y,o)=>{if(x===a&&y===b)hits++;return hit(x,y,o);};
    set({special:true});ctl.tick(1);set({});
    for(let i=0;i<45;i++) {
      if(mode==='counter' && !b.counterHit) b.counterActive=true;
      ctl.tick(1);
    }
    assert(mode==='hit' ? hits===1 && a.damage===18 && b.damage>0 : hits===0 && a.damage===20,
      `${face} ${mode}: hits=${hits}, heal=${a.damage}, victim=${b.damage}`);
  }
});

test('marrow: Soul Reap holds until release and scales damage up to 2x', () => {
  function perform(hold) {
    const {m,a,b,ctl,set}=itemFixture(['marrow','valor']);b.x=75;a.damage=20;
    let hits=0;const hit=m.hitFighter.bind(m);m.hitFighter=(x,y,o)=>{if(x===a&&y===b)hits++;return hit(x,y,o);};
    set({special:true});ctl.tick(1);
    if(hold) ctl.tick(hold);
    assert(a.charging && a.actionT===0 && hits===0 && b.damage===0,'hit or advanced while holding G');
    if(hold>60) assert(a.chargeT===60,'charge exceeded cap');
    set({});ctl.tick(1);const mult=a.action.chargeMultiplier;ctl.tick(40);
    assert(hits===1 && a.damage===18, 'release failed to hit once or heal');
    return {d:b.damage,mult};
  }
  const tap=perform(0), half=perform(30), full=perform(60), over=perform(180);
  assert(tap.d<half.d && half.d<full.d, `damage did not grow: ${tap.d}, ${half.d}, ${full.d}`);
  assert(Math.abs(full.d/tap.d-2)<.001 && over.d===full.d && over.mult===2, 'maximum was not 2x');
});

test('marrow: Soul Reap is a traveling blast, not a melee hitbox', () => {
  for (const face of [-1,1]) {
    const {m,a,b,ctl,set}=itemFixture(['marrow','valor']);a.facing=face;b.x=face*400;a.damage=20;
    set({special:true});ctl.tick(61);
    assert(m.projectiles.length===0 && b.damage===0,'blast fired while holding');
    set({});ctl.tick(1);const startup=a.action.startup;ctl.tick(startup-1);
    const p=m.projectiles.find(p=>p.kind==='soulblast');
    assert(p && Math.sign(p.vx)===face && p.damage===22,'missing or incorrect charged projectile');
    assert(b.damage===0 && a.damage===20,'remote opponent was hit instantly');
    const before=p.x;ctl.tick(5);assert((p.x-before)*face>30,'blast did not travel forward');
    ctl.tick(45);assert(b.damage===22 && a.damage===18,'ranged blast failed to connect and heal');
  }
});

test('marrow: blast hits targets and vanishes on contact', () => {
  const {m,a,b,ctl,set}=itemFixture(['marrow','valor']);b.x=800;
  m.targets=[{x:220,y:a.y-62*a.scale,hp:3,dead:false}];
  set({special:true});ctl.tick(61);set({});ctl.tick(40);
  assert(m.targets[0].dead,'blast did not break target');
  assert(!m.projectiles.some(p=>p.kind==='soulblast'),'blast passed through target');
  assert(b.damage===0,'blast hit enemy after consuming target');
});

test('marrow: the projectile never heals a KOed or respawning owner', () => {
  const {m,a,b,ctl,set}=itemFixture(['marrow','valor']);b.x=400;a.damage=20;
  set({special:true});ctl.tick(1);set({});ctl.tick(12);
  assert(m.projectiles.some(p=>p.kind==='soulblast'),'blast did not spawn');
  a.state='respawn';a.respawnT=110;a.damage=20;ctl.tick(40);
  assert(b.damage>0 && a.damage===20,'projectile healed respawning owner');
});

test('marrow: Grave Ascent gains 30 percent peak height over original', () => {
  function height(rise,grounded) {
    const {ctx}=run(), m=newMatch(ctx,cast(1,['marrow']),'skyshrine',{rules:{items:'none'}}), f=m.fighters[0];
    if(rise!==null) f.def.specials.up.rise=rise;
    f.x=0;f.y=grounded?m.stage.ground.y:-300;f.onGround=grounded;f.state=grounded?'idle':'fall';f.spawnProtect=f.invincT=f.respawnT=0;f.vx=f.vy=0;
    const ctl=control(m);const y=f.y;let peak=y;f.__raw={up:true,special:true};ctl.tick(1);f.__raw={};
    for(let i=0;i<80;i++){ctl.tick(1);peak=Math.min(peak,f.y);}
    return y-peak;
  }
  for(const grounded of [false,true]) {
    const before=height(9.4,grounded), after=height(null,grounded), ratio=after/before;
    assert(Math.abs(ratio-1.3)<.01, `expected 30% more peak height, got ${(ratio*100-100).toFixed(1)}%`);
  }
});

test('marrow: charge cancels when hit and never fires afterward', () => {
  const {m,a,b,ctl,set}=itemFixture(['marrow','valor']);b.x=60;
  set({special:true});ctl.tick(15);assert(a.charging,'did not start charge');
  m.hitFighter(b,a,{damage:4,bkb:10,kbs:20,angle:60});
  assert(!a.charging && !a.action,'hit failed to interrupt');
  set({});ctl.tick(50);assert(b.damage===0,'interrupted charge fired on release');
  const grab=itemFixture(['marrow','valor']);grab.set({special:true});grab.ctl.tick(15);
  grab.m.beginGrab(grab.b,grab.a);
  assert(!grab.a.charging && !grab.a.action, 'grab failed to cancel charging');
});

test('marrow: Grave Ascent rises and hits both sides once, with defenses respected', () => {
  for(const side of [-1,1]) for(const mode of ['hit','shield','invincible','team','counter','late']) {
    const {m,a,b,ctl,set}=itemFixture(['marrow','valor']);a.facing=1;b.x=side*(mode==='late'?400:65);
    if(mode==='team') m.sameTeam=()=>true;
    if(mode==='invincible')b.invincT=100;
    let hits=0;const hit=m.hitFighter.bind(m);m.hitFighter=(x,y,o)=>{if(x===a&&y===b)hits++;return hit(x,y,o);};
    set({up:true,special:true});ctl.tick(1);set({});const start=a.y;
    for(let t=0;t<36;t++) {
      if(mode==='shield'){b.shieldHP=60;b.state='shield';}
      if(mode==='counter' && !b.counterHit)b.counterActive=true;
      if(mode==='late' && t===11){b.x=a.x+side*65;b.y=a.y;b.vx=b.vy=0;b.onGround=false;}
      ctl.tick(1);
    }
    if(mode!=='counter') assert(a.y<start-40 || a.ledge, `recovery did not rise: ${side} ${mode} ${a.y} / ${start}`);
    if(mode==='hit'||mode==='late') assert(hits===1 && b.damage>0,`${side} ${mode}: expected one hit, got ${hits}`);
    else assert(hits===0, `${side} ${mode}: defense bypassed`);
  }
});

test('marrow: Wraith Charge, Grave Ascent and Hollow Guard work through input', () => {
  for(const dir of [-1,1]) {
    const {m,a,b,ctl,set}=itemFixture(['marrow','valor']);a.facing=dir;b.x=dir*100;
    set({special:true,left:dir<0,right:dir>0});ctl.tick(1);set({});ctl.tick(50);
    assert(b.damage>0, `side special missed facing ${dir}`);
  }
  const x=itemFixture(['marrow','valor']);x.b.x=400;x.a.x=0;x.a.y=-130;x.a.onGround=false;x.a.state='fall';const y=x.a.y;
  x.set({up:true,special:true});x.ctl.tick(1);x.set({});x.ctl.tick(27);
  assert(x.a.usedUpB && x.a.y<y-50, 'up special failed to recover');
  const z=itemFixture(['marrow','valor']);z.b.x=55;
  z.set({down:true,special:true});z.ctl.tick(1);z.set({});z.ctl.tick(4);
  assert(z.a.counterActive, 'counter stance not active');
  z.a.counterHit=z.b;z.ctl.tick(5);assert(z.b.damage>0, 'counter did not retaliate');
});

test('marrow: melee items preserve F attacks and CPU fights remain finite', () => {
  const {m,a,ctl,set}=itemFixture(['marrow','valor']);const it=itemAt(m,a,'beamsword');ctl.tick(1);
  assert(a.held===it,'Marrow did not pick up weapon');set({attack:true});ctl.tick(1);
  assert(a.action && a.action.type==='move' && a.action.itemPerk==='reach','weapon did not modify his F attack');
  const {ctx}=run();const match=newMatch(ctx,cast(4,['marrow','valor','grim','marrow'],{cpu:true}),'foundry',{rules:{items:'none'}});
  for(let i=0;i<1200;i++) {match.update(); for(const f of match.fighters) assert(Number.isFinite(f.x)&&Number.isFinite(f.y), 'nonfinite CPU fighter');}
});

/* Tide: drive her actual player inputs and shared defensive resolver. */
test('tide: save migration and classic roster', () => {
  const vm=require('vm');const {ctx,sandbox}=run();
  sandbox.localStorage.setItem('rift-rumble-save-v1',JSON.stringify({unlocked:['valor','marrow'],coins:123,settings:{music:false}}));
  const save=vm.runInContext('SAVE.load()',ctx);
  assert(save.unlocked.includes('tide') && save.unlocked.includes('marrow') && save.coins===123 && !save.settings.music,'save migration');
  sandbox.Game={startMatch:opts=>{sandbox.lastClassic=opts;}};sandbox.UI={toast:()=>{}};
  require('./harness').load(ctx,['js/modes.js']);
  for(const key of ['valor','grim','astra','vesper','rook','marrow','tide']) {
    vm.runInContext(`Modes.startClassic('${key}',0,5)`,ctx);
    const stages=vm.runInContext('Modes.current.stages',ctx);
    assert(stages.slice(0,4).every(s=>s.enemy!==key && !!s.enemy),key+' has invalid opponent');
  }
  vm.runInContext("Modes.startClassic('marrow',0,5)",ctx);
  assert(vm.runInContext('Modes.current.stages.some(s=>s.enemy==="tide")',ctx),'Tide missing from classic');
  for(const mode of ['startTargets','startHomeRun','startMultiMan']) {
    vm.runInContext(`Modes.${mode}('tide',0)`,ctx);
    assert(sandbox.lastClassic.cast[0].key==='tide',mode+' does not select Tide');
  }
});

test('tide: Surge Step hits once, respecting defenses', () => {
  for(const side of [-1,1]) for(const special of ['side']) for(const mode of ['hit','shield','team','invincible','counter','miss']) {
    const {m,a,b,ctl,set}=itemFixture(['tide','valor']);a.facing=side;b.x=side*(mode==='miss'?1000:(special==='side'?100:60));
    if(mode==='team')m.sameTeam=()=>true;
    if(mode==='invincible')b.invincT=100;
    const read=m.readPlayerInput;if(mode==='shield')m.readPlayerInput=f=>f===b?{shield:true}:read(f);
    let hits=0;const hit=m.hitFighter.bind(m);m.hitFighter=(x,y,o)=>{if(x===a&&y===b)hits++;return hit(x,y,o);};
    set(Object.assign({special:true},special==='side'?{left:side<0,right:side>0}:{}));ctl.tick(1);set({});
    for(let i=0;i<55;i++){if(mode==='counter'&&!b.counterHit)b.counterActive=true;ctl.tick(1);}
    assert(mode==='hit'?hits===1 && b.damage>0:hits===0,`${side} ${special} ${mode}: ${hits} hits`);
  }
});

test('tide: holding and releasing G sets wave lifetime, direction and fade', () => {
  for(const side of [-1,1]) for(const hold of [1,30,90,300,350]) {
    const {m,a,b,ctl,set}=itemFixture(['tide','valor']);b.x=900;a.facing=side;
    set({special:true});ctl.tick(1);ctl.tick(hold);
    assert(a.charging && m.projectiles.length===0, 'wave fired before release');
    assert(a.chargeT===Math.min(hold,300),`charge ${a.chargeT}`);
    set({});ctl.tick(a.def.specials.neutral.startup+1);
    const p=m.projectiles.find(p=>p.kind==='tidewave');
    assert(p && p.life===Math.max(18,Math.min(hold,300)*2),`wrong life ${hold} ${p && p.life}`);
    assert(Math.sign(p.vx)===side && p.surface===m.stage.ground,'ground wave direction/surface');
    const x=p.x; const tickAtStart=p.t;
    // Isolate lifetime from blast-zone/edge/target interactions.
    m.stage.ground.x=-10000;m.stage.ground.w=20000;m.blast.left=-20000;m.blast.right=20000;
    for(let j=tickAtStart;j<p.life;j++) { p.update(m);assert(!p.dead,'wave faded too early'); }
    assert((p.x-x)*side>0, 'wave did not travel');
    p.update(m); assert(p.dead, 'wave did not expire');
  }
});

test('tide: wave persists through fighters and re-hits without bypassing defenses', () => {
  for(const side of [-1,1]) for(const mode of ['hit','shield','team','invincible']) {
    const {m,a,b,ctl,set}=itemFixture(['tide','valor']);a.facing=side;b.x=side*45;
    if(mode==='team')m.sameTeam=()=>true;if(mode==='invincible')b.invincT=200;
    const read=m.readPlayerInput;if(mode==='shield')m.readPlayerInput=f=>f===b?{shield:true}:read(f);
    let hits=0;const hit=m.hitFighter.bind(m);m.hitFighter=(x,y,o)=>{if(x===a&&y===b)hits++;return hit(x,y,o);};
    set({special:true});ctl.tick(45);set({});
    let wave;for(let i=0;i<25;i++){if(mode==='counter'&&!b.counterHit)b.counterActive=true;ctl.tick(1);wave=wave||m.projectiles.find(p=>p.kind==='tidewave');}
    assert(wave && !wave.dead,`${side} ${mode} wave died on contact`);
    assert(mode==='hit'?hits>=2:hits===0,`${side} ${mode}: ${hits} hits`);
  }
});

test('tide: wave hits produce real projectile-like recoil that scales with damage', () => {
  function impact(key, side, initialDamage) {
    const {m,a,b,ctl,set}=itemFixture([key,'valor']);a.facing=side;b.x=side*75;b.damage=initialDamage;
    let result=null;const hit=m.hitFighter.bind(m);
    m.hitFighter=(x,y,o)=>{hit(x,y,o);if(x===a && y===b && !result)
      result={vx:b.vx,vy:b.vy,stun:b.hitstun,state:b.state,damage:b.damage,kind:o.proj && o.proj.kind};};
    set({special:true});ctl.tick(31);set({});
    for(let i=0;i<35 && !result;i++)ctl.tick(1);
    assert(result,`${key} did not hit ${side}`);return {result,m,b};
  }
  for(const side of [-1,1]) {
    const low=impact('tide',side,0), high=impact('tide',side,100), blast=impact('marrow',side,0);
    assert(low.result.kind==='tidewave' && low.result.damage===2,'wave did not deal projectile damage');
    assert(low.result.state==='launch' && low.result.stun>0 && low.result.vx*side>4 && low.result.vy<0,'no visible directional recoil');
    assert(Math.hypot(low.result.vx,low.result.vy)>Math.hypot(blast.result.vx,blast.result.vy)*.5,'recoil is too weak relative to Soul Reap');
    assert(Math.hypot(high.result.vx,high.result.vy)>Math.hypot(low.result.vx,low.result.vy),'damage did not scale knockback');
    assert(low.m.projectiles.some(p=>p.kind==='tidewave'&&!p.dead),'impact destroyed the wave');
  }
});

test('tide: wave hits multiple opponents, not someone behind, and interacts with targets', () => {
  for(const side of [-1,1]) {
    const {ctx}=run(), m=newMatch(ctx,cast(4,['tide','valor','grim','rook']),'terminal',{rules:{items:'none'}});
    const [a,b,c,behind]=m.fighters;
    for(const f of m.fighters){f.y=0;f.onGround=true;f.state='idle';f.spawnProtect=0;f.invincT=0;f.vx=f.vy=0;}
    a.x=0;a.facing=side;b.x=side*90;c.x=side*180;behind.x=-side*100;
    m.targets=[{x:side*240,y:-35,hp:1,dead:false}];let input={};
    const ctl=control(m,(f,i)=>i===0?input:{});input={special:true};ctl.tick(60);input={};ctl.tick(65);
    assert(b.damage>0 && c.damage>0 && behind.damage===0,`wave did not sweep forwards across opponents: ${side} ${b.damage} ${c.damage} ${behind.damage}`);
    assert(m.targets[0].dead, 'wave did not hit target-mode target');
  }
});

test('tide: a counter intercepts the wave without destroying it', () => {
  const {m,a,b,ctl,set}=itemFixture(['tide','valor']);b.x=45;
  set({special:true});ctl.tick(40);set({});b.startSpecial('d',m);ctl.tick(10);
  assert(a.damage>0 && b.damage===0,'counter did not intercept the wave');
  assert(m.projectiles.some(p=>p.kind==='tidewave'&&!p.dead),'counter destroyed the wave');
});

test('tide: wave falls from platforms and airborne casts land on the surface', () => {
  const {m,a}=itemFixture(['tide','valor']);const plat=m.stage.platforms[0];
  const p=m.spawnProjectile({kind:'tidewave',owner:a,x:plat.x+plat.w-3,y:plat.y,vx:5,vy:0,life:160,fadeFrames:18,rehit:12,damage:2,bkb:3,kbs:2,angle:35,surface:plat});
  p.update(m);assert(!p.surface && p.y>plat.y,'did not leave platform');
  for(let i=0;i<45 && !p.surface;i++) p.update(m);
  assert(p.surface===m.stage.ground && p.y===m.stage.ground.y,'wave did not land on main stage');
  const airborne=m.spawnProjectile({kind:'tidewave',owner:a,x:0,y:-55,vx:0,vy:0,life:100,fadeFrames:18,rehit:12,damage:2,bkb:3,kbs:2,angle:35,surface:null});
  for(let i=0;i<30 && !airborne.surface;i++) airborne.update(m);
  assert(airborne.surface===m.stage.ground,'airborne wave failed to land');
});

test('tide: charge interrupt and landing droplets', () => {
  const {m,a,b,ctl,set}=itemFixture(['tide','valor']);b.x=500;
  set({special:true});ctl.tick(12);assert(a.charging,'not charging');
  m.hitFighter(b,a,{damage:1,bkb:20,kbs:0,angle:60});set({});ctl.tick(70);
  assert(!m.projectiles.some(p=>p.kind==='tidewave'),'interrupted charge released wave');
  a.hitstun=0;a.state='fall';a.y=-5;a.vy=7;a.onGround=false;
  const before=m.fx.parts.filter(p=>p.shape==='droplet').length;a.landOn(m.stage.ground.y,m,false);
  assert(m.fx.parts.filter(p=>p.shape==='droplet').length>before,'landing has no droplets');
});

test('tide: run reversals remain responsive', () => {
  const {ctx}=run();const m=newMatch(ctx,cast(1,['tide']),'terminal');
  const f=m.fighters[0];f.x=0;f.y=m.stage.ground.y;f.onGround=true;f.state='idle';let dir=1;
  const ctl=control(m,()=>({right:dir>0,left:dir<0}));ctl.tick(30);
  for(const d of [-1,1,-1,1]) {dir=d;ctl.tick(1);assert(f.facing===d && f.state==='turn','no braced turn');
    ctl.tick(7);assert(f.vx*d>0 && f.state==='run','turn did not flow into running');ctl.tick(20);}
});

test('tide: loop completes before takeoff and preserves airborne recovery', () => {
  for(const airborne of [false,true]) {
    const {ctx}=run();const m=newMatch(ctx,cast(2,['tide','valor']),'terminal',{rules:{items:'none'}});
    const [a,b]=m.fighters;const ground=m.stage.ground.y;
    a.x=0;a.y=airborne?-300:ground;a.vx=0;a.vy=airborne?16:0;a.onGround=!airborne;a.state=airborne?'fall':'idle';a.spawnProtect=0;
    b.x=40;b.y=a.y;b.onGround=!airborne;b.spawnProtect=0;b.invincT=0;const startY=a.y;
    let input={up:true,special:true};const ctl=control(m,(f,i)=>i===0?input:{});
    ctl.tick(1);input={};const startup=a.def.specials.up.startup;
    ctl.tick(startup-1);
    assert(b.damage===0,'recovery struck during the loop');
    if(!airborne) assert(a.onGround && Math.abs(a.y-ground)<.01,'lift started before the loop completed');
    else assert(a.y<startY+40,'falling too far during windup');
    const before=a.y;ctl.tick(1);assert(a.y<before && a.vy<0,'wave did not push at takeoff');
    let peak=a.y;for(let t=0;t<30;t++){ctl.tick(1);peak=Math.min(peak,a.y);}
    assert(peak<before-85,'recovery did not gain height');
  }
  const z=itemFixture(['tide','valor']);z.b.x=500;z.set({up:true,special:true});z.ctl.tick(5);z.set({});
  z.m.hitFighter(z.b,z.a,{damage:2,bkb:12,kbs:0,angle:40});z.ctl.tick(30);
  assert(!z.a.action || z.a.action.specialKey!=='u','interrupted wave kept lifting');
  const {m,a}=itemFixture(['tide','valor']);a.y=-300;a.onGround=false;a.state='fall';
  assert(a.startSpecial('u',m),'first recovery failed');a.action=null;a.state='fall';
  assert(!a.startSpecial('u',m),'second recovery used in midair');
  a.vy=5;a.landOn(m.stage.ground.y,m,false);assert(!a.usedUpB,'landing did not reset recovery');
  assert(a.startSpecial('u',m),'recovery did not reset after landing');
});

test('tide: Geyser Leap hits once and respects defenses on both sides', () => {
  for(const side of [-1,1]) for(const mode of ['hit','shield','team','invincible','counter']) {
    const {m,a,b,ctl,set}=itemFixture(['tide','valor']);a.facing=side;b.x=side*40;
    if(mode==='team')m.sameTeam=()=>true;if(mode==='invincible')b.invincT=100;
    const read=m.readPlayerInput;if(mode==='shield')m.readPlayerInput=f=>f===b?{shield:true}:read(f);
    let hits=0;const hit=m.hitFighter.bind(m);m.hitFighter=(x,y,o)=>{if(x===a&&y===b)hits++;return hit(x,y,o);};
    set({up:true,special:true});ctl.tick(1);set({});
    for(let i=0;i<35;i++){if(mode==='counter'&&!b.counterHit)b.counterActive=true;ctl.tick(1);}
    assert(mode==='hit'?hits===1:hits===0,`${side} ${mode}: ${hits} hits`);
  }
});

test('tide: Geyser Leap, Ocean Guardian, items and CPU', () => {
  const x=itemFixture(['tide','valor']);x.b.x=400;x.a.y=-130;x.a.onGround=false;x.a.state='fall';const y=x.a.y;
  x.set({up:true,special:true});x.ctl.tick(1);x.set({});x.ctl.tick(27);
  assert(x.a.usedUpB && x.a.y<y-50,'Geyser Leap failed');
  const z=itemFixture(['tide','valor']);z.b.x=55;z.set({down:true,special:true});z.ctl.tick(1);z.set({});z.ctl.tick(4);
  assert(z.a.counterActive,'guardian counter inactive');z.b.facing=-1;z.b.startAttack('jab',z.m);z.ctl.tick(18);assert(z.a.damage===0 && z.b.damage>0,'guardian did not counter a real strike');
  const v=itemFixture(['tide','valor']);const it=itemAt(v.m,v.a,'beamsword');v.ctl.tick(1);assert(v.a.held===it,'pickup');v.set({attack:true});v.ctl.tick(1);assert(v.a.action.itemPerk==='reach','item attack');
  const {ctx}=run();const m=newMatch(ctx,cast(4,['tide','valor','marrow','tide'],{cpu:true}),'foundry',{rules:{items:'none'}});
  for(let i=0;i<1200;i++){m.update();for(const f of m.fighters)assert(Number.isFinite(f.x)&&Number.isFinite(f.y),'CPU position');}
});

/* Vector: input-level coverage and homing/defense guarantees. */
test('vector: save migration and all modes include the new fighter', () => {
  const vm = require('vm'); const {ctx,sandbox} = run();
  sandbox.localStorage.setItem('rift-rumble-save-v1',JSON.stringify({unlocked:['valor'],coins:123,settings:{music:false}}));
  const save=vm.runInContext('SAVE.load()',ctx);
  assert(save.unlocked.includes('vector') && save.coins===123 && !save.settings.music,'save migration');
  sandbox.Game={startMatch:opts=>{sandbox.lastClassic=opts;}};sandbox.UI={toast:()=>{}};
  require('./harness').load(ctx,['js/modes.js']);
  for(const key of ['valor','grim','astra','vesper','rook','marrow','tide','vector']) {
    vm.runInContext(`Modes.startClassic('${key}',0,5)`,ctx);
    assert(vm.runInContext('Modes.current.stages.slice(0,4)',ctx).every(s=>s.enemy!==key),key+' fights self');
  }
  vm.runInContext("Modes.startClassic('tide',0,5)",ctx);
  assert(vm.runInContext('Modes.current.stages.some(s=>s.enemy==="vector")',ctx),'Vector absent from classic');
  for(const mode of ['startTargets','startHomeRun','startMultiMan']) {
    vm.runInContext(`Modes.${mode}('vector',0)`,ctx);
    assert(sandbox.lastClassic.cast[0].key==='vector',mode+' does not select Vector');
  }
});

test('vector: G launches exactly two heat-seeking missiles in either direction', () => {
  for(const side of [-1,1]) {
    const {m,a,b,ctl,set}=itemFixture(['vector','valor']);a.facing=side;b.x=side*400;
    set({special:true});ctl.tick(1);set({});ctl.tick(20);
    const shots=m.projectiles.filter(p=>p.kind==='hunterMissile');
    assert(shots.length===2,side+' expected two missiles, got '+shots.length);
    assert(shots.every(p=>p.owner===a && p.target===b && Math.sign(p.vx)===side),side+' target or launch direction wrong');
    ctl.tick(70);assert(b.damage>0,side+' missiles failed to hit target');
  }
});

test('vector: missiles turn gradually and ignore teammates and respawning fighters', () => {
  const {ctx}=run(),m=newMatch(ctx,cast(4,['vector','valor','grim','rook']),'terminal',{rules:{items:'none'}});
  const [a,ally,enemy,respawn]=m.fighters; for(const f of m.fighters){f.spawnProtect=0;f.invincT=0;f.y=0;}
  a.x=0;ally.x=60;enemy.x=300;enemy.y=-180;respawn.x=90;respawn.state='respawn';
  m.sameTeam=(x,y)=>x===a&&y===ally;
  const p=m.spawnProjectile({owner:a,x:0,y:-50,vx:8.5,vy:0,kind:'hunterMissile',speed:8.5,turnRate:.035,life:90,damage:6,size:9});
  p.update(m);assert(p.target===enemy,'missile chose teammate or respawn');
  assert(Math.abs(Math.atan2(p.vy,p.vx))<=.0351,'missile snapped to target');
  assert(!p.dead,'missile hit teammate');
  enemy.eliminated=true;const vx=p.vx,vy=p.vy;p.update(m);
  assert(Math.abs(p.vx-vx)<1e-6 && Math.abs(p.vy-vy)<1e-6,'missile steered toward eliminated target');
});

test('vector: lock scan boosts the next volley and expires', () => {
  for(const side of [-1,1]) {
    const {m,a,b,ctl,set}=itemFixture(['vector','valor']);a.facing=side;b.x=side*250;
    set({down:true,special:true});ctl.tick(1);set({});ctl.tick(16);
    assert(a.vectorLockTarget===b && a.vectorLockT>0,side+' scan did not acquire enemy');
    ctl.tick(45);set({special:true});ctl.tick(1);set({});ctl.tick(20);
    const missiles=m.projectiles.filter(p=>p.kind==='hunterMissile');
    assert(missiles.length===2 && missiles.every(p=>p.boosted && p.turnRate===.075 && p.target===b),'boosted volley missing');
    assert(!a.vectorLockTarget && !a.vectorLockT,'lock not consumed');
    a.vectorLockTarget=b;a.vectorLockT=2;ctl.tick(3);assert(!a.vectorLockTarget && !a.vectorLockT,'lock did not expire');
  }
});

test('vector: missiles respect shields, counters and targets', () => {
  for(const mode of ['hit','shield','counter','team','invincible']) {
    const {m,a,b,ctl,set}=itemFixture(['vector','valor']); b.x=80;
    if(mode==='team')m.sameTeam=()=>true;
    if(mode==='invincible')b.invincT=200;
    const read=m.readPlayerInput;if(mode==='shield')m.readPlayerInput=f=>f===b?{shield:true}:read(f);
    let hits=0,blocks=0;const hit=m.hitFighter.bind(m),shield=m.shieldHit.bind(m);
    m.hitFighter=(x,y,o)=>{if(x===a&&y===b)hits++;return hit(x,y,o);};
    m.shieldHit=(x,y,...args)=>{if(x===a&&y===b)blocks++;return shield(x,y,...args);};
    set({special:true});ctl.tick(1);set({});for(let i=0;i<45;i++){if(mode==='counter'&&!b.counterHit)b.counterActive=true;ctl.tick(1);}
    if(mode==='hit') assert(hits>0 && b.damage>0,'no real hits');
    else if(mode==='counter') assert(hits<=1,'counter failed to intercept a missile');
    else assert(hits===0,mode+' took damage through defense');
    if(mode==='shield')assert(blocks>0,'shield did not block missile');
    if(mode==='counter')assert(b.counterHit===a,'counter did not intercept');
  }
  const {m,a,b}=itemFixture(['vector','valor']);b.x=1000;m.targets=[{x:60,y:-55,dead:false}];
  const p=m.spawnProjectile({owner:a,x:55,y:-55,vx:1,vy:0,kind:'hunterMissile',speed:1,turnRate:.035,life:30,damage:6,size:9});p.update(m);
  assert(p.dead,'missile did not hit a target');
});

test('vector: lock does not mark a teammate or fighter behind, and clears on KO', () => {
  const {ctx}=run();const m=newMatch(ctx,cast(4,['vector','valor','grim','rook']),'terminal',{rules:{items:'none'}});
  const [a,ally,back,enemy]=m.fighters;for(const f of m.fighters){f.spawnProtect=0;f.invincT=0;f.y=0;f.onGround=true;}
  a.x=0;a.facing=1;ally.x=80;back.x=-100;enemy.x=280;m.sameTeam=(x,y)=>x===a&&y===ally;
  a.startSpecial('d',m);for(let i=0;i<20;i++)a.updateAction(m);
  assert(a.vectorLockTarget===enemy,'scan did not exclude allies and enemies behind');
  a.die(m,null);assert(!a.vectorLockT && !a.vectorLockTarget,'KO retained a lock');
});

test('vector: missiles expire and stop steering when their target respawns', () => {
  const {m,a,b}=itemFixture(['vector','valor']);b.x=400;
  const p=m.spawnProjectile({owner:a,x:0,y:-55,vx:8,vy:0,kind:'hunterMissile',speed:8,turnRate:.035,life:5,damage:6,size:9});
  p.update(m);assert(p.target===b,'no target');b.state='respawn';
  const vx=p.vx,vy=p.vy;p.update(m);assert(p.vx===vx&&p.vy===vy,'missile steered toward respawning target');
  for(let i=0;i<8;i++)p.update(m);assert(p.dead,'missile never expires');
});

test('vector: rush, rocket boost and final barrage function', () => {
  const x=itemFixture(['vector','valor']);x.b.x=100;x.set({right:true,special:true});x.ctl.tick(1);x.set({});x.ctl.tick(30);assert(x.b.damage>0,'rush failed to hit');
  const y=itemFixture(['vector','valor']);y.b.x=600;y.a.y=-130;y.a.onGround=false;y.a.state='fall';const start=y.a.y;
  y.set({up:true,special:true});y.ctl.tick(1);y.set({});y.ctl.tick(25);assert(y.a.usedUpB && y.a.y<start-50,'rocket boost failed');
  const z=itemFixture(['vector','valor']);z.b.x=450;z.a.startFinalSmash(z.m);z.ctl.tick(31);
  assert(z.m.projectiles.some(p=>p.kind==='hunterMissile'),'final did not fire barrage');
  const {ctx}=run();const m=newMatch(ctx,cast(4,['vector','valor','marrow','vector'],{cpu:true}),'foundry',{rules:{items:'none'}});
  for(let i=0;i<1200;i++){m.update();for(const f of m.fighters)assert(Number.isFinite(f.x)&&Number.isFinite(f.y),'CPU position');}
});

test('vector: side G fires back-mounted thrust rockets while rushing in either direction', () => {
  for (const side of [-1,1]) for (const airborne of [false,true]) {
    const {m,a,b,ctl,set}=itemFixture(['vector','valor']); b.x=-side*180;
    if(airborne) {a.y-=140;a.onGround=false;a.state='fall';}
    const shots=[],emit=m.fx.particle.bind(m.fx);
    m.fx.particle=o=>{if(o.shape==='rushRocket')shots.push({o,x:a.x,y:a.y,t:a.actionT,vx:a.vx});return emit(o);};
    set({special:true,[side===1?'right':'left']:true});ctl.tick(1);set({});
    ctl.tick(28);
    const sp=a.def.specials.side;
    assert(shots.length===3,'expected three rearward rockets');
    assert(shots.map(x=>x.t).join(',')===[sp.startup,sp.startup+5,sp.startup+10].join(','),'launches outside thrust window');
    for(const {o,x,y,vx} of shots) {
      assert((o.x-x)*side<0 && o.vx*side<0 && o.vy===0,'rocket not moving behind the fighter');
      assert(y-o.y>=76*a.scale-0.01 && y-o.y<=88*a.scale+0.01,'rocket not fired from back');
      assert(vx*side>0,'fighter was not propelled forward');
    }
    assert(b.damage===0 && m.projectiles.every(p=>p.kind!=='rushRocket'),'visual rockets added unintended hits');
    ctl.tick(30);assert(!m.fx.parts.some(p=>p.shape==='rushRocket'),'thrust rockets failed to expire');
  }
});

test('vector: interrupting side G stops later rocket launches', () => {
  const {m,a,b,ctl,set}=itemFixture(['vector','valor']);b.x=700;
  let count=0;const emit=m.fx.particle.bind(m.fx);m.fx.particle=o=>{if(o.shape==='rushRocket')count++;return emit(o);};
  set({right:true,special:true});ctl.tick(1);set({});ctl.tick(a.def.specials.side.startup+1);
  assert(count===1,'initial rocket missing');a.action=null;a.state='idle';ctl.tick(30);
  assert(count===1,'interrupted rush kept launching rockets');
});

test('vector: up or jump plus G fires two downward shoulder rockets during ascent', () => {
  for (const side of [-1,1]) for (const input of [{up:true,special:true},{jump:true,special:true}]) {
    const {m,a,b,ctl,set}=itemFixture(['vector','valor']);a.facing=side;b.x=700;
    a.y=m.stage.ground.y-300;a.onGround=false;a.state='fall';
    const launches=[],spawn=m.spawnProjectile.bind(m);
    m.spawnProjectile=o=>{if(o.kind==='boostRocket')launches.push({o, x:a.x,y:a.y,t:a.actionT});return spawn(o);};
    set(input);ctl.tick(1);set({});ctl.tick(24);
    assert(a.usedUpB && launches.length===2, 'boost failed to fire twice');
    const sp=a.def.specials.up;
    assert(launches[0].t===sp.startup && launches[1].t===sp.startup+8,'wrong firing timing');
    for(const {o,x,y} of launches) {
      assert(o.vx===0 && o.vy>0 && o.x*side<x*side && Math.abs(o.y-(y-82*a.scale))<.01,'rocket not fired downward from rear shoulder');
    }
    assert(a.vy<0,'rockets did not propel upward');
  }
});

test('vector: a jump pressed during rocket boost is performed after thrust', () => {
  // Include the early thrust, late thrust, and long recovery that used to
  // expire the ordinary eight-frame buffer while the button remained held.
  for(const tick of [2,10,23,27,35]) for(const hold of [false,true]) {
    const {m,a,b,ctl,set}=itemFixture(['vector','valor']);m.stage.platforms=[];b.x=700;
    a.y=m.stage.ground.y-350;a.onGround=false;a.state='fall';a.airJumpsLeft=1;
    let shots=0;const spawn=m.spawnProjectile.bind(m);m.spawnProjectile=o=>{if(o.kind==='boostRocket')shots++;return spawn(o);};
    set({up:true,special:true});ctl.tick(1);set({});ctl.tick(tick);
    assert(a.state==='special' && a.actionT===tick,'fixture left boost early');
    set({jump:true});ctl.tick(1);if(!hold)set({});
    for(let i=0;i<35 && a.airJumpsLeft===1;i++)ctl.tick(1);
    assert(a.airJumpsLeft===0 && a.vy<0 && a.state!=='special',`tick ${tick}: jump was lost in boost recovery`);
    assert(shots===2,'jump cut off a shoulder rocket');
    assert(a.usedUpB,'jump incorrectly restored the recovery in midair');
  }
});

test('vector: retrying an unavailable jump G never silently consumes an air jump', () => {
  for(const when of ['during','after']) {
    const {m,a,b,ctl,set}=itemFixture(['vector','valor']);m.stage.platforms=[];b.x=700;
    a.y=m.stage.ground.y-350;a.onGround=false;a.state='fall';a.airJumpsLeft=1;
    set({up:true,special:true});ctl.tick(1);set({});ctl.tick(when==='during'?10:48);
    assert(a.usedUpB && a.airJumpsLeft===1,'fixture did not preserve jump');
    set({jump:true,special:true});ctl.tick(1);set({});ctl.tick(when==='during'?40:2);
    assert(a.airJumpsLeft===1,'failed jump+G spent the air jump');
    set({jump:true});ctl.tick(1);
    assert(a.airJumpsLeft===0 && a.vy<0,'ordinary air jump unavailable afterward');
  }
});

test('vector: queued rocket-boost jump cannot create an extra jump and is canceled on interruption', () => {
  for(const interrupted of [false,true]) {
    const {m,a,b,ctl,set}=itemFixture(['vector','valor']);m.stage.platforms=[];b.x=700;
    a.y=m.stage.ground.y-350;a.onGround=false;a.state='fall';a.airJumpsLeft=interrupted?1:0;
    set({up:true,special:true});ctl.tick(1);set({});ctl.tick(10);
    set({jump:true});ctl.tick(1);set({});
    if(interrupted) {a.action=null;a.state='launch';a.hitstun=8;}
    ctl.tick(40);
    assert(a.airJumpsLeft===(interrupted?1:0),interrupted?'interruption fired queued jump':'created an extra air jump');
  }
});

test('vector: real up G recovery catches either ledge and can jump and double-jump', () => {
  for(const side of [-1,1]) for(const combo of [{up:true,special:true},{jump:true,special:true}]) {
    const {ctx}=run(),m=newMatch(ctx,cast(1,['vector']),'terminal');
    const f=m.fighters[0],gd=m.stage.ground,edge=side<0?gd.x:gd.x+gd.w,c=control(m);
    f.respawnT=0;f.spawnProtect=0;f.x=edge+side*30;f.y=gd.y+110;f.vx=f.vy=0;
    f.onGround=false;f.state='fall';f.facing=-side;f.__raw=combo;c.tick(1);
    assert(f.usedUpB && f.action.specialKey==='u','recovery did not start');
    // A held jump used to start the move must not automatically leave the ledge.
    for(let i=0;i<20 && f.state!=='ledge';i++) c.tick(1);
    assert(f.state==='ledge' && !f.usedUpB && f.airJumpsLeft===f.def.stats.airJumps,'recovery did not catch and restore jumps');
    if(combo.jump) {c.tick(2);assert(f.state==='ledge','held activation jump auto-jumped');}
    f.__raw={};c.tick(1);f.__raw={jump:true};c.tick(1);
    assert(f.state==='jump' && f.vy<0 && !f.onGround && f.airJumpsLeft===f.def.stats.airJumps,'ledge jump unavailable');
    const y=f.y;f.__raw={};c.tick(4);assert(f.y<y,'ledge jump did not rise');
    f.__raw={jump:true};c.tick(1);assert(f.airJumpsLeft===f.def.stats.airJumps-1 && f.vy<0,'double jump unavailable after ledge jump');
  }
});

test('vector: a jump buffered just before a recovery ledge catch is honored', () => {
  for(const side of [-1,1]) {
    const {ctx}=run(),m=newMatch(ctx,cast(1,['vector']),'terminal');
    const f=m.fighters[0],gd=m.stage.ground,edge=side<0?gd.x:gd.x+gd.w,c=control(m);
    f.respawnT=0;f.x=edge+side*30;f.y=gd.y+110;f.vx=f.vy=0;f.onGround=false;f.state='fall';f.facing=-side;
    f.__raw={up:true,special:true};c.tick(1);f.__raw={};c.tick(6);
    assert(f.state==='special','fixture did not approach ledge during recovery');
    f.__raw={jump:true};c.tick(1);assert(f.state==='ledge' && f.inputBuffer.jump>0,'catch discarded the fresh jump');
    f.__raw={};c.tick(1);assert(f.state==='jump' && f.vy<0,'buffered jump did not leave ledge');
  }
});

test('vector: remote rocket impact does not freeze ledge owner or eat jump presses', () => {
  for(const side of [-1,1]) {
    const {m,a,b,ctl,set}=itemFixture(['vector','valor']);const gd=m.stage.ground,edge=side<0?gd.x:gd.x+gd.w;
    a.snapLedge(m,side,edge);b.x=edge-side*35;b.y=gd.y;b.invincT=b.spawnProtect=0;
    const p=m.spawnProjectile({owner:a,x:b.x,y:gd.y-15,vx:0,vy:12,kind:'boostRocket',size:8,life:100,radius:70,damage:9,bkb:18,kbs:45,angle:85,color:'#f80'});
    p.update(m);assert(b.damage>0 && a.hitlag===0,'remote explosion froze hanging owner');
    set({jump:true});ctl.tick(1);assert(a.state==='jump'&&a.vy<0,'impact prevented ledge jump');
    // Other sources of hitlag can still overlap a short press: retain it.
    a.snapLedge(m,side,edge);a.hitlag=4;set({});ctl.tick(1);set({jump:true});ctl.tick(1);set({});ctl.tick(4);
    assert(a.state==='jump' && a.vy<0,'ledge jump pressed during hitlag was lost');
  }
});

test('vector: boost rocket impact is one splash and respects defenses and teams', () => {
  for (const mode of ['hit','shield','counter','team','invincible','respawn']) {
    const {m,a,b}=itemFixture(['vector','valor']);
    b.x=25; b.y=m.stage.ground.y; a.x=-200;
    if(mode==='team')m.sameTeam=()=>true;
    if(mode==='invincible')b.invincT=100;
    if(mode==='respawn')b.state='respawn';
    if(mode==='shield')b.shieldHP=50;
    if(mode==='counter')b.counterActive=true;
    let hits=0,blocks=0;
    const hit=m.hitFighter.bind(m),shield=m.shieldHit.bind(m);
    m.hitFighter=(x,y,o)=>{if(y===b)hits++;return hit(x,y,o);};
    m.shieldHit=(x,y,...args)=>{if(y===b)blocks++;return shield(x,y,...args);};
    const p=m.spawnProjectile({owner:a,x:0,y:m.stage.ground.y-15,vx:0,vy:12,kind:'boostRocket',size:8,life:100,radius:70,damage:9,bkb:18,kbs:45,angle:85,color:'#f80'});
    p.update(m);p.update(m);
    assert(p.dead,'rocket missed stage');
    assert(hits===(mode==='hit'?1:0),mode+' splash hit count '+hits);
    if(mode==='shield')assert(blocks===1,'shield did not block splash');
    if(mode==='counter')assert(b.counterHit===a,'counter did not intercept splash');
  }
});

test('vector: direct rocket contact splashes several foes without a separate direct hit', () => {
  const {ctx}=run();const m=newMatch(ctx,cast(3,['vector','valor','grim']),'terminal',{rules:{items:'none'}});
  const [a,b,c]=m.fighters; a.x=-200;b.x=0;c.x=45;
  for (const f of m.fighters) {f.y=-100;f.state='fall';f.invincT=f.spawnProtect=0;}
  const count=new Map(),hit=m.hitFighter.bind(m);m.hitFighter=(x,y,o)=>{count.set(y,(count.get(y)||0)+1);return hit(x,y,o);};
  const p=m.spawnProjectile({owner:a,x:0,y:b.y-65,vx:0,vy:12,kind:'boostRocket',size:8,life:30,radius:70,damage:9,bkb:18,kbs:45,angle:85,color:'#f80'});
  p.update(m);assert(p.dead && count.get(b)===1 && count.get(c)===1,'direct contact did not produce a single multi-target splash');
});

test('vector: rockets hit platforms and targets, but expire harmlessly offstage', () => {
  const {m,a,b}=itemFixture(['vector','valor']);b.x=1000;
  const y=m.stage.ground.y; m.stage.platforms=[{x:-100,y:y-100,w:200}];
  let explosions=0, items=0;
  m.fx.explode=()=>explosions++;m.itemsHitByAttack=()=>items++;
  const shot=(o)=>m.spawnProjectile(Object.assign({owner:a,x:0,y:y-115,vx:0,vy:12,kind:'boostRocket',size:8,life:100,radius:70,damage:9,color:'#f80'},o));
  let p=shot();p.update(m);assert(p.dead && p.y===y-100 && explosions===1 && items===1,'platform impact failed');
  m.targets=[{x:0,y:y-250,dead:false}];p=shot({y:y-270});p.update(m);assert(p.dead&&explosions===2&&items===2,'target impact failed');
  m.targets=[];p=shot({x:m.blast.right+250,life:1});p.update(m);assert(p.dead&&explosions===2,'offstage rocket exploded');
  p=shot({y:y-400,life:0});p.update(m);assert(p.dead&&explosions===2,'expired rocket exploded');
});

/* Briar: playable roster, directional vine and earth specials. */
test('briar: save migration and modes include the forest fighter', () => {
  const vm=require('vm'),{ctx,g,sandbox}=run();
  sandbox.localStorage.setItem('rift-rumble-save-v1',JSON.stringify({unlocked:['valor'],coins:123,settings:{music:false}}));
  const save=vm.runInContext('SAVE.load()',ctx);assert(save.unlocked.includes('briar') && save.coins===123 && !save.settings.music,'save migration');
  assert(vm.runInContext("FIGHTER_KEYS.includes('briar') && FIGHTERS.briar.palettes.length === 6",ctx),'roster or palettes missing');
  sandbox.Game={startMatch:opts=>{sandbox.lastBriarMatch=opts;}};sandbox.UI={toast:()=>{}};
  require('./harness').load(ctx,['js/modes.js']);
  vm.runInContext("Modes.startClassic('briar',0,5)",ctx);assert(vm.runInContext('Modes.current.stages.slice(0,4)',ctx).every(s=>s.enemy!=='briar'),'Briar fights herself');
  for(const mode of ['startTargets','startHomeRun','startMultiMan']) {vm.runInContext(`Modes.${mode}('briar',0)`,ctx);assert(sandbox.lastBriarMatch.cast[0].key==='briar',mode+' missing');}
  for(const stage of ['skyshrine','terminal']) {
    const m=newMatch(ctx,cast(2,['briar','valor']),stage);control(m).tick(60);
    assert(m.fighters.every(f=>Number.isFinite(f.x)&&Number.isFinite(f.y)),'bad fighter state');
  }
});

test('briar: vine whip reaches forward in both directions and hits once', () => {
  for(const side of [-1,1]) {
    const {m,a,b,ctl,set}=itemFixture(['briar','valor']);a.facing=side;b.x=side*245;
    let hits=0,angle=null;const hit=m.hitFighter.bind(m);m.hitFighter=(x,y,o)=>{if(y===b){hits++;angle=o.angle;}return hit(x,y,o);};
    set({special:true});ctl.tick(1);set({});ctl.tick(35);
    assert(hits===1 && b.damage>0,`side ${side}: whip hit ${hits} times`);
    assert(side===1?angle<90:angle>90,'whip launch direction wrong');
  }
});

test('briar: vine whip respects defenses, allies and direction', () => {
  for(const mode of ['shield','counter','team','invincible','behind']) {
    const {m,a,b,ctl,set}=itemFixture(['briar','valor']);b.x=mode==='behind'?-100:180;
    if(mode==='team')m.sameTeam=()=>true;if(mode==='invincible')b.invincT=200;
    const read=m.readPlayerInput;if(mode==='shield')m.readPlayerInput=f=>f===b?{shield:true}:read(f);
    let hits=0,blocks=0;const hit=m.hitFighter.bind(m),shield=m.shieldHit.bind(m);
    m.hitFighter=(x,y,o)=>{if(y===b)hits++;return hit(x,y,o);};m.shieldHit=(x,y,...o)=>{if(y===b)blocks++;return shield(x,y,...o);};
    set({special:true});ctl.tick(1);set({});for(let i=0;i<28;i++){if(mode==='counter'&&!b.counterHit)b.counterActive=true;ctl.tick(1);}
    assert(hits===0,mode+' bypassed defense');if(mode==='shield')assert(blocks===1,'shield failed');if(mode==='counter')assert(b.counterHit===a,'counter failed');
  }
});

test('briar: earth spikes hit both sides once and respect team and shield', () => {
  for(const mode of ['hit','team','shield']) {
    const {ctx}=run(),m=newMatch(ctx,cast(3,['briar','valor','grim']),'terminal',{rules:{items:'none'}});
    const [a,b,c]=m.fighters;for(const f of m.fighters){f.y=m.stage.ground.y;f.vx=f.vy=0;f.onGround=true;f.state='idle';f.spawnProtect=f.invincT=0;}
    a.x=0;b.x=70;c.x=-70;if(mode==='team')m.sameTeam=(x,y)=>x===a&&y===c;
    let blocks=0,fullHits=0;const shield=m.shieldHit.bind(m),hit=m.hitFighter.bind(m);
    m.shieldHit=(x,y,...args)=>{if(y===b)blocks++;return shield(x,y,...args);};m.hitFighter=(x,y,...args)=>{if(y===b)fullHits++;return hit(x,y,...args);};
    const ctl=control(m);if(mode==='shield')b.__raw={shield:true};a.__raw={down:true,special:true};ctl.tick(1);a.__raw={};ctl.tick(35);
    assert(mode==='shield'?blocks===1&&fullHits===0:b.damage>0,mode+' front target');
    assert(mode==='team'?c.damage===0:c.damage>0,mode+' rear target');
  }
});

test('briar: side rush hits and recovery rises, preserves and restores jump', () => {
  for(const side of [-1,1]) {
    const x=itemFixture(['briar','valor']);x.b.x=side*100;x.set({[side===1?'right':'left']:true,special:true});x.ctl.tick(1);x.set({});x.ctl.tick(30);assert(x.b.damage>0,'rush missed');
    for(const input of [{up:true,special:true},{jump:true,special:true}]) {
      const y=itemFixture(['briar','valor']);y.b.x=700;y.m.stage.platforms=[];y.a.y=-300;y.a.onGround=false;y.a.state='fall';const start=y.a.y;
      y.set(input);y.ctl.tick(1);y.set({});y.ctl.tick(10);assert(y.a.usedUpB && y.a.y<start,'recovery did not rise');
      y.set({jump:true});y.ctl.tick(1);y.set({});y.ctl.tick(20);
      assert(y.a.airJumpsLeft===0 && y.a.state!=='special','jump lost during ascent');
    }
  }
});

test('briar: unavailable recovery does not spend a jump or interrupt a held activation', () => {
  for(const when of ['during','after']) {
    const {m,a,b,ctl,set}=itemFixture(['briar','valor']);m.stage.platforms=[];b.x=700;
    a.y=-350;a.vx=a.vy=0;a.onGround=false;a.state='fall';a.airJumpsLeft=1;
    set({jump:true,special:true});ctl.tick(1);ctl.tick(when==='during'?10:48);
    assert(a.airJumpsLeft===1 && a.usedUpB,'held activation consumed a jump');
    set({});ctl.tick(1);set({jump:true,special:true});ctl.tick(1);set({});ctl.tick(when==='during'?40:2);
    assert(a.airJumpsLeft===1,'rejected recovery consumed the remaining jump');
    set({jump:true});ctl.tick(1);assert(a.airJumpsLeft===0 && a.vy<0,'air jump unavailable after retry');
  }
});

test('briar: recovery ledge catch resets recovery and can jump', () => {
  for(const side of [-1,1]) {
    const {ctx}=run(),m=newMatch(ctx,cast(1,['briar']),'terminal'),f=m.fighters[0],gd=m.stage.ground,edge=side<0?gd.x:gd.x+gd.w,c=control(m);
    f.respawnT=0;f.x=edge+side*30;f.y=gd.y+110;f.vx=f.vy=0;f.onGround=false;f.state='fall';f.facing=-side;
    f.__raw={up:true,special:true};c.tick(1);f.__raw={};for(let i=0;i<20&&f.state!=='ledge';i++)c.tick(1);
    assert(f.state==='ledge'&&!f.usedUpB&&f.airJumpsLeft===f.def.stats.airJumps,'no ledge reset');
    f.__raw={jump:true};c.tick(1);assert(f.state==='jump'&&f.vy<0,'could not jump from ledge');
  }
});

test('briar: grapple extends during dash, lifts, slams and launches once in either direction', () => {
  for (const side of [-1,1]) {
    const {m,a,b,ctl,set}=itemFixture(['briar','valor']); b.x=side*190;
    let hits=0; const hit=m.hitFighter.bind(m);m.hitFighter=(x,y,o)=>{if(x===a&&y===b)hits++;return hit(x,y,o);};
    set({[side===1?'right':'left']:true,special:true});ctl.tick(1);set({});
    for(let i=0;i<22&&!a.grabbing;i++)ctl.tick(1);
    assert(a.grabbing===b && b.grabbedBy===a && b.state==='grabbed','vine failed to grab');
    assert(side*a.x>0 && b.damage===0,'dash or early damage wrong');
    const y=b.y;ctl.tick(10);assert(b.y<y-60 && b.damage===0,'victim not lifted');
    ctl.tick(10);assert(!a.grabbing && !b.grabbedBy && b.damage>0 && hits===1,'slam failed or repeated');
    assert(b.state==='launch' && side*b.vx>0 && b.vy<0,'slam lacks launch recoil');
    ctl.tick(45);assert(hits===1,'grapple hit more than once');
  }
});

test('briar: grapple obeys range, facing, team, invincibility and grabs shields', () => {
  for (const mode of ['far','behind','team','invincible','shield']) {
    const {m,a,b,ctl,set}=itemFixture(['briar','valor']);b.x=mode==='far'?650:mode==='behind'?-100:160;
    if(mode==='team')m.sameTeam=()=>true;if(mode==='invincible')b.invincT=200;
    const read=m.readPlayerInput;if(mode==='shield')m.readPlayerInput=f=>f===b?{shield:true}:read(f);
    set({right:true,special:true});ctl.tick(1);set({});ctl.tick(55);
    assert(mode==='shield'?b.damage>0:b.damage===0,mode+' grapple eligibility');
  }
});

test('briar: interruption and KO safely release both grapple links', () => {
  for(const mode of ['attackerHit','victimHit','attackerKO','victimKO']) {
    const {m,a,b,ctl,set}=itemFixture(['briar','valor']);b.x=140;
    set({right:true,special:true});ctl.tick(1);set({});for(let i=0;i<20&&!a.grabbing;i++)ctl.tick(1);
    assert(a.grabbing===b,mode+' setup');
    if(mode==='attackerHit'||mode==='victimHit')m.hitFighter(null,mode==='attackerHit'?a:b,{damage:4,bkb:20,kbs:40,angle:45});
    else (mode==='attackerKO'?a:b).die(m,null);
    ctl.tick(1);assert(!a.grabbing&&!b.grabbedBy&&!b.vineGrabbed,mode+' left dangling grab');
    if(mode==='victimHit')assert(b.hitstun>0 && b.state==='launch','intervening hit lost launch');
    if(mode==='attackerHit'||mode==='attackerKO')assert(b.state!=='grabbed','victim stuck');
  }
});

test('briar: offstage tether travels visibly to either ledge, then restores recovery', () => {
  for(const side of [-1,1]) {
    const {ctx}=run(),m=newMatch(ctx,cast(1,['briar']),'terminal'),f=m.fighters[0],gd=m.stage.ground,edge=side<0?gd.x:gd.x+gd.w,c=control(m);
    f.x=edge+side*150;f.y=gd.y+125;f.vx=f.vy=0;f.onGround=false;f.state='fall';f.facing=-side;
    f.__raw={up:true,special:true};c.tick(1);f.__raw={};c.tick(4);
    assert(f.action&&f.action.vinePull && f.state==='special','tether failed');
    const before=Math.abs(f.x-edge);assert(before>30,'snapped instead of pulling');
    c.tick(7);assert(f.state==='special'&&Math.abs(f.x-edge)<before,'vine did not pull');
    c.tick(10);assert(f.state==='ledge'&&f.ledge.side===side&&!f.usedUpB,'tether did not hang/reset');
    f.__raw={jump:true};c.tick(1);assert(f.state==='jump','ledge jump unavailable');
  }
});

test('briar: tether cannot steal an occupied ledge or reach too far', () => {
  for(const mode of ['occupied','far','onstage','disabled']) {
    const {ctx}=run(),m=newMatch(ctx,cast(2,['briar','valor']),'terminal'),[f,b]=m.fighters,gd=m.stage.ground,c=control(m),edge=gd.x+gd.w;
    b.spawnProtect=b.invincT=0;b.x=0;b.y=gd.y;b.onGround=true;b.state='idle';
    f.x=mode==='far'?edge+400:mode==='onstage'?edge-60:edge+120;f.y=gd.y+(mode==='onstage'?-100:100);f.vx=f.vy=0;f.onGround=false;f.state='fall';
    if(mode==='occupied')b.snapLedge(m,1,edge);if(mode==='disabled')m.stage.ledges=false;
    f.__raw={up:true,special:true};c.tick(1);f.__raw={};c.tick(6);
    assert(!f.action?.vinePull,mode+' tether incorrectly activated');
    if(mode==='occupied')assert(b.state==='ledge','stole ledge');
  }
});

test('briar: tether reaches above either side at the increased range', () => {
  for (const side of [-1,1]) {
    const {ctx}=run(),m=newMatch(ctx,cast(1,['briar']),'terminal'),f=m.fighters[0],gd=m.stage.ground,edge=side<0?gd.x:gd.x+gd.w,c=control(m);
    assert(f.def.specials.up.tetherRange===351,'range is not 35% larger');
    f.x=edge+side*300;f.y=gd.y-85;f.vx=f.vy=0;f.onGround=false;f.state='fall';
    f.__raw={up:true,special:true};c.tick(1);f.__raw={};c.tick(4);
    assert(f.action?.vinePull && f.action.vinePull.side===side,'no above-stage tether beyond old range');
    assert(f.y<gd.y-30 && f.state==='special','snapped instead of visibly pulling');
    c.tick(18);assert(f.state==='ledge'&&f.ledge.side===side,'did not reach nearest ledge');
  }
});

test('briar: downward surface ray checks deck and moving platforms, and range is bounded', () => {
  const {ctx}=run(),m=newMatch(ctx,cast(1,['briar']),'terminal'),f=m.fighters[0],gd=m.stage.ground,edge=gd.x+gd.w;
  const makeAction=()=>({...f.def.specials.up});f.input={};f.onGround=false;f.ledgeCD=0;
  f.x=edge-20;f.y=gd.y-100;assert(f.hasSurfaceBelow(m.stage),'deck not detected below');let a=makeAction();f.tryVineTether(m,a);assert(!a.vinePull,'tether over ground');
  f.x=edge+100;f.y=gd.y-120;m.stage.platforms=[{x:-500,y:-500,cx:edge+50,cy:gd.y-40,w:100}];
  assert(f.hasSurfaceBelow(m.stage),'moving platform not detected at its live position');a=makeAction();f.tryVineTether(m,a);assert(!a.vinePull,'tether over soft platform');
  m.stage.platforms[0].cy=gd.y-180;assert(!f.hasSurfaceBelow(m.stage),'platform above counted as ground');a=makeAction();f.tryVineTether(m,a);assert(a.vinePull,'surface above should not block');
  m.stage.platforms=[];f.x=edge+351*f.scale+1;f.y=gd.y+55*f.scale;a=makeAction();f.tryVineTether(m,a);assert(!a.vinePull,'tether exceeded range');
  f.x=edge+351*f.scale-1;a=makeAction();f.tryVineTether(m,a);assert(a.vinePull,'tether missed inside range');
});

test('briar: tether from below the island goes around its solid underside', () => {
  for(const side of [-1,1]) {
    const {ctx}=run(),m=newMatch(ctx,cast(1,['briar']),'terminal'),f=m.fighters[0],gd=m.stage.ground,edge=side<0?gd.x:gd.x+gd.w,c=control(m);
    f.x=edge-side*100;f.y=gd.y+150;f.vx=f.vy=0;f.onGround=false;f.state='fall';
    f.__raw={up:true,special:true};c.tick(1);f.__raw={};c.tick(4);assert(f.action?.vinePull?.underDeck,'under-island tether missing');
    for(let i=0;i<18 && f.state!=='ledge';i++) {c.tick(1);assert(!(f.x>gd.x&&f.x<gd.x+gd.w&&f.y<gd.y+gd.h+14),'passed through deck');}
    assert(f.state==='ledge' && f.ledge.side===side,'under-island pull missed nearest ledge');
  }
});

test('briar: tether releases if ledge becomes occupied and carries buffered jump to the hang', () => {
  for(const mode of ['occupied','jump']) {
    const {ctx}=run(),m=newMatch(ctx,cast(2,['briar','valor']),'terminal'),[f,b]=m.fighters,gd=m.stage.ground,edge=gd.x+gd.w,c=control(m);
    b.x=0;b.y=gd.y;b.onGround=true;b.state='idle';b.spawnProtect=b.invincT=0;
    f.x=edge+150;f.y=gd.y+125;f.vx=f.vy=0;f.onGround=false;f.state='fall';
    f.__raw={up:true,special:true};c.tick(1);f.__raw={};c.tick(5);assert(f.action?.vinePull,'tether setup failed');
    if(mode==='occupied') {
      b.snapLedge(m,1,edge);c.tick(1);assert(!f.action?.vinePull && f.state!=='ledge' && b.state==='ledge','occupied ledge stolen');
    } else {
      f.__raw={jump:true};c.tick(1);f.__raw={};c.tick(20);
      assert(f.state==='jump' && f.vy<0 && f.ledgeCD>0,'buffered tether jump lost');
    }
  }
});

test('briar: final grows four thorn fields, hits enemies and leaves allies alone', () => {
  const {ctx}=run(),m=newMatch(ctx,cast(3,['briar','valor','grim']),'terminal',{rules:{items:'none'}});
  const [a,b,c]=m.fighters;for(const f of m.fighters){f.y=m.stage.ground.y;f.onGround=true;f.spawnProtect=f.invincT=0;f.state='idle';}
  a.x=0;b.x=60;c.x=-60;m.sameTeam=(x,y)=>x===a&&y===c;
  let pulses=0,fields=0;const aoe=m.aoeHit.bind(m),thorn=m.fx.thornField.bind(m.fx);
  m.aoeHit=(...args)=>{pulses++;return aoe(...args);};m.fx.thornField=(...args)=>{fields++;return thorn(...args);};
  a.startFinalSmash(m);control(m).tick(155);
  assert(pulses===4&&fields===4,'missing final pulses');assert(b.damage>0&&c.damage===0,'final ignored teams or failed to hit');assert(!a.finalActive,'final did not finish');
});

test('briar: CPU match remains finite with new fighter', () => {
  const {ctx}=run(),m=newMatch(ctx,cast(4,['briar','vector','tide','marrow'],{cpu:true}),'foundry',{rules:{items:'none'}});
  for(let i=0;i<1200;i++){m.update();for(const f of m.fighters)assert(Number.isFinite(f.x)&&Number.isFinite(f.y),'CPU position');}
});

/* Nomad: a rapid-fire rifle, rushing gun strike and roll/hook recovery. */
test('nomad: roster, save migration and classic mode include the gunner', () => {
  const vm=require('vm'),{ctx,sandbox}=run();
  sandbox.localStorage.setItem('rift-rumble-save-v1',JSON.stringify({unlocked:['valor'],coins:123,settings:{music:false}}));
  const save=vm.runInContext('SAVE.load()',ctx);assert(save.unlocked.includes('nomad') && save.coins===123,'save migration');
  sandbox.Game={startMatch:opts=>sandbox.lastMatch=opts};sandbox.UI={toast:()=>{}};require('./harness').load(ctx,['js/modes.js']);
  vm.runInContext("Modes.startClassic('nomad',0,5)",ctx);assert(vm.runInContext('Modes.current.stages.slice(0,4)',ctx).every(s=>s.enemy!=='nomad'),'classic self match');
  for(const mode of ['startTargets','startHomeRun','startMultiMan']) {vm.runInContext(`Modes.${mode}('nomad',0)`,ctx);assert(sandbox.lastMatch.cast[0].key==='nomad',mode);}
});

test('nomad: held G fires rapid bolts, release stops and tap fires once', () => {
  for(const side of [-1,1]) {
    const {m,a,b,ctl,set}=itemFixture(['nomad','valor']);b.x=side*500;a.facing=side;
    let shots=[];const spawn=m.spawnProjectile.bind(m);m.spawnProjectile=o=>{if(o.kind==='rapidBolt')shots.push({t:m.frame,vx:o.vx,angle:o.angle});return spawn(o);};
    set({special:true});ctl.tick(85);assert(shots.length>=10 && a.state==='special','held G did not sustain fire');
    assert(shots.every(x=>Math.sign(x.vx)===side && (side===1?x.angle<90:x.angle>90)),'shot direction');
    assert(b.damage>0,'shots missed opponent');const n=shots.length;set({});ctl.tick(30);assert(shots.length===n && a.state!=='special','fire persisted after release');
    const tap=itemFixture(['nomad','valor']);tap.b.x=800;let count=0;const sp=tap.m.spawnProjectile.bind(tap.m);tap.m.spawnProjectile=o=>{if(o.kind==='rapidBolt')count++;return sp(o);};
    tap.set({special:true});tap.ctl.tick(1);tap.set({});tap.ctl.tick(35);assert(count===1,'tap did not fire exactly once');
  }
});

test('nomad: rapid shots also hit at point-blank range', () => {
  for(const side of [-1,1]) {
    const {a,b,ctl,set}=itemFixture(['nomad','valor']);a.facing=side;b.x=side*50;
    set({special:true});ctl.tick(1);set({});ctl.tick(20);assert(b.damage>0,'point-blank shot skipped target');
  }
});

test('nomad: rapid shots honor shields, teams, invincibility and interruption', () => {
  for(const mode of ['shield','team','invincible','interrupt']) {
    const {m,a,b,ctl,set}=itemFixture(['nomad','valor']);b.x=200;
    if(mode==='team')m.sameTeam=()=>true;if(mode==='invincible')b.invincT=300;
    let shields=0;const sh=m.shieldHit.bind(m);m.shieldHit=(...args)=>{shields++;return sh(...args)};
    if(mode==='shield') {const read=m.readPlayerInput;m.readPlayerInput=f=>f===b?{shield:true}:read(f);}
    let shots=0;const spawn=m.spawnProjectile.bind(m);m.spawnProjectile=o=>{if(o.kind==='rapidBolt')shots++;return spawn(o);};
    set({special:true});ctl.tick(15);
    if(mode==='interrupt') {m.hitFighter(null,a,{damage:5,bkb:30,kbs:40,angle:50});const n=shots;ctl.tick(10);assert(shots===n,'kept shooting after hit');}
    else {ctl.tick(25);if(mode==='shield')assert(shields>0,'shield not used');else assert(b.damage===0,mode+' damaged');}
  }
});

test('nomad: side special dashes and strikes once in facing direction', () => {
  for(const side of [-1,1]) {
    const {m,a,b,ctl,set}=itemFixture(['nomad','valor']);b.x=side*145;
    let hits=0,angle=0;const hit=m.hitFighter.bind(m);m.hitFighter=(x,y,o)=>{if(x===a&&y===b){hits++;angle=o.angle}return hit(x,y,o);};
    set({[side===1?'right':'left']:true,special:true});ctl.tick(1);set({});ctl.tick(45);
    assert(side*a.x>15 && hits===1 && b.damage>0,'rush or gun strike failed');
    assert(side===1?angle<90:angle>90,'wrong knockback direction');
  }
});

test('nomad: hook uses Briar ledge rules and restores jump on both sides', () => {
  for(const side of [-1,1]) for(const y of [-85,125]) {
    const {ctx}=run(),m=newMatch(ctx,cast(1,['nomad']),'terminal'),f=m.fighters[0],gd=m.stage.ground,edge=side<0?gd.x:gd.x+gd.w,c=control(m);
    f.x=edge+side*(y<0?300:150);f.y=gd.y+y;f.vx=f.vy=0;f.onGround=false;f.state='fall';f.facing=-side;
    f.__raw={up:true,special:true};c.tick(1);f.__raw={};c.tick(4);assert(f.action?.hookTether&&f.action?.vinePull,'hook failed');
    assert(f.state==='special' && Math.abs(f.x-edge)>30,'hook snapped instantly');c.tick(18);
    assert(f.state==='ledge' && f.ledge.side===side && !f.usedUpB,'hook did not hang/reset');
    f.__raw={jump:true};c.tick(1);assert(f.state==='jump','ledge jump failed');
  }
});

test('nomad: hook respects ground ray, range, ledge occupancy and one recovery per airtime', () => {
  for(const mode of ['ground','far','occupied']) {
    const {ctx}=run(),m=newMatch(ctx,cast(2,['nomad','valor']),'terminal'),[f,b]=m.fighters,gd=m.stage.ground,edge=gd.x+gd.w,c=control(m);
    b.x=0;b.y=gd.y;b.onGround=true;b.state='idle';b.spawnProtect=b.invincT=0;
    f.x=mode==='ground'?edge-100:edge+(mode==='far'?500:140);f.y=gd.y+(mode==='ground'?-180:100);f.vx=f.vy=0;f.onGround=false;f.state='fall';
    if(mode==='occupied')b.snapLedge(m,1,edge);
    const y=f.y;f.__raw={up:true,special:true};c.tick(1);f.__raw={};c.tick(10);
    assert(!f.action?.vinePull,mode+' used hook');if(mode==='ground')assert(f.y<y,'normal roll recovery did not rise');
    assert(f.usedUpB,'recovery not spent');
  }
});

test('nomad: interrupted hook and queued ledge jump do not leave a stuck fighter', () => {
  for(const mode of ['hit','occupied','jump']) {
    const {ctx}=run(),m=newMatch(ctx,cast(2,['nomad','valor']),'terminal'),[f,b]=m.fighters,gd=m.stage.ground,edge=gd.x+gd.w,c=control(m);
    b.x=0;b.y=gd.y;b.onGround=true;b.state='idle';b.spawnProtect=b.invincT=0;
    f.x=edge+150;f.y=gd.y+125;f.vx=f.vy=0;f.onGround=false;f.state='fall';
    f.__raw={up:true,special:true};c.tick(1);f.__raw={};c.tick(5);assert(f.action?.vinePull,'hook setup');
    if(mode==='hit') {m.hitFighter(b,f,{damage:6,bkb:22,kbs:45,angle:50});c.tick(1);assert(f.state==='launch'&&!f.action,'hit did not cancel hook');}
    if(mode==='occupied') {b.snapLedge(m,1,edge);c.tick(1);assert(!f.action?.vinePull && b.state==='ledge','hook stole occupied ledge');}
    if(mode==='jump') {f.__raw={jump:true};c.tick(1);f.__raw={};c.tick(20);assert(f.state==='jump' && f.vy<0,'buffered hook jump lost');}
  }
});

test('nomad: CPU match remains finite', () => {
  const {ctx}=run(),m=newMatch(ctx,cast(4,['nomad','briar','vector','tide'],{cpu:true}),'foundry',{rules:{items:'none'}});
  for(let i=0;i<1200;i++){m.update();for(const f of m.fighters)assert(Number.isFinite(f.x)&&Number.isFinite(f.y),'CPU position');}
});

/* ---------------- entry ---------------- */
T.run(process.argv[2]).then(fail => process.exit(fail ? 1 : 0));
