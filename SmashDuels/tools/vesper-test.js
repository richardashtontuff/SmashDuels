'use strict';
const assert = require('assert');
const { boot, cast, control, newMatch, makeCtx } = require('./harness');

async function main() {
  const h = boot({ render: true, record: true });
  h.g.Sprites.load();
  await h.settle(20);
  const m = newMatch(h.ctx, cast(1, ['vesper']), 'terminal');
  m.rules.items = 'none'; m.rules.hazards = false; m.stage.platforms = [];
  const f = m.fighters[0];
  f.x = 0; f.y = m.stage.ground.y; f.onGround = true; f.state = 'idle';
  let raw = { jump: true };
  const ctl = control(m, () => raw);
  let rise = 0, fall = 0;
  for (let i = 0; i < 100; i++) {
    ctl.tick(1);
    if (!f.onGround && (f.state === 'jump' || f.state === 'fall')) {
      const sel = h.g.Sprites.pickAnim(f, 0);
      const tile = sel.frames[sel.i][0];
      assert(tile >= 16 && tile <= 20, `${f.state} displayed grounded tile ${tile}`);
      if (f.state === 'jump') rise++; else fall++;
    }
    if (i > 5 && f.onGround) break;
  }
  assert(rise > 10 && fall > 10 && f.onGround, 'jump did not complete a full arc');
  // The jump animation must restart on an air jump and remain airborne.
  raw = {}; ctl.tick(10); raw = { jump: true }; ctl.tick(5);
  raw = {}; ctl.tick(1); raw = { jump: true }; ctl.tick(1);
  assert(!f.onGround && f.airJumpsLeft === 0 && f.vy < -8, 'double jump failed');
  const doubleJump = h.g.Sprites.pickAnim(f, 0);
  assert(doubleJump.frames[doubleJump.i][0] >= 16 && doubleJump.frames[doubleJump.i][0] <= 20);
  // Defensive states should never borrow the attack or airborne takeoff poses.
  for (const [state, tile] of [['crouch', 15], ['turn', 15], ['shield', 0], ['hitstun', 26], ['grabbed', 26]]) {
    f.state = state; f.animT++; f.stunT = 0; f.shieldHP = 60;
    const sel = h.g.Sprites.pickAnim(f, 0);
    assert.strictEqual(sel.frames[sel.i][0], tile, `${state} uses the wrong Vesper pose`);
  }
  f.state = 'launch'; f.animT++;
  let launch = h.g.Sprites.pickAnim(f, 0);
  assert(launch.frames[launch.i][0] >= 16 && launch.frames[launch.i][0] <= 20, 'launch used a crouched pose');
  // Back air uses forward-only art; it must be mirrored relative to facing.
  for (const facing of [-1, 1]) {
    f.facing = facing; f.onGround = false; f.state = 'attack';
    f.action = { type: 'move', key: 'bair', dur: 26, startup: 4, active: 4 };
    f.actionT = 4;
    const rec = { ops: [] };
    assert(h.g.Sprites.drawSpriteFighter(makeCtx(rec), f, 0));
    const body = rec.ops.find(op => op.op === 'drawImage');
    assert(body && Math.sign(body.matrix[0]) === -facing, 'back-air art points away from its hitbox');
  }
  // The actual long effect and its damage box must cover the same space on
  // the same ticks, including when the sprite is mirrored.
  for (const facing of [-1, 1]) {
    f.facing = facing; f.x = 0; f.y = 0; f.hitlag = 0; f.onGround = true;
    f.startSpecial('n', m);
    for (let t = 0; t < f.action.dur; t++) {
      f.actionT = t; f.animT++;
      const sel = h.g.Sprites.pickAnim(f, 0);
      const effects = sel.frames[sel.i][3] || [];
      const longFrame = effects.some(part => part[0] === 50);
      const isFinisher = t >= f.action.startup + f.action.finishAt && t < f.action.startup + f.action.active;
      assert.strictEqual(longFrame, isFinisher, `long effect out of sync at tick ${t}`);
      const boxes = f.activeBoxes();
      if (isFinisher) {
        assert.strictEqual(boxes.length, 1);
        const rec = {ops: []}; h.g.Sprites.drawSpriteFighter(makeCtx(rec), f, 0);
        const at = h.g.Sprites.atlas('vesper'), effect = at.tiles[50];
        const draw = rec.ops.find(op => op.op === 'drawImage' && op.sx === effect.x && op.sy === effect.y);
        assert(draw, 'finisher effect was not drawn');
        const artTip = draw.matrix[0] * (draw.dx + draw.dw) + draw.matrix[4];
        const box = boxes[0].box, boxTip = facing > 0 ? box.x + box.w : box.x;
        assert(Math.abs(artTip - boxTip) < 1, `hitbox tip ${boxTip} does not match effect tip ${artTip}`);
      } else if (t >= f.action.startup && t < f.action.startup + f.action.active) {
        assert(boxes.length === 1 && boxes[0].box.w < 120, 'long box active before the effect');
      } else assert.strictEqual(boxes.length, 0, 'box active outside the move window');
    }
  }
  console.log('Vesper: jump, fall, double jump, defensive poses, back air and finisher timing/reach passed.');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
