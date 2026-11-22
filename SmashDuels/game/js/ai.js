/* ============================================================
   RIFT RUMBLE — CPU opponents (levels 1–9)
   ============================================================ */
'use strict';

class CPU {
  constructor(fighter, match) {
    this.f = fighter;
    this.level = clamp(fighter.cpuLevel || 5, 1, 9);
    this.react = 30 - this.level * 2.6;      // frames between decisions
    this.timer = randInt(0, 12);
    this.plan = 'approach';
    this.holdDir = 0;
    this.holdT = 0;
    this.attackCd = 0;
    this.jumpCd = 0;
    this.specialCd = 0;
    this.rollCd = 0;
    this.target = null;
    this.edgeCD = 0;
    this.recoverPlan = null;
    this.pressTimer = 0;
    this.lastState = '';
    this.tauntCd = 300;
    this.out = { left: false, right: false, up: false, down: false, attack: false, special: false, jump: false, shield: false, grab: false };
    this.press = {};
  }

  pressKey(k, frames = 1) { this.press[k] = frames; }

  think(match) {
    const f = this.f;
    const o = this.out;
    for (const k in o) o[k] = false;
    // consume scheduled presses
    if (this.pressTimer > 0) this.pressTimer--;
    for (const k in this.press) {
      if (this.press[k] > 0) { o[k] = true; this.press[k]--; }
    }
    this.attackCd = Math.max(0, this.attackCd - 1);
    this.jumpCd = Math.max(0, this.jumpCd - 1);
    this.specialCd = Math.max(0, this.specialCd - 1);
    this.rollCd = Math.max(0, this.rollCd - 1);
    this.tauntCd = Math.max(0, this.tauntCd - 1);

    // Choose an intentional get-up instead of waiting for a random combat plan.
    if (f.state === 'ledge') { if (f.stateT > 10) o.up = true; return o; }

    // ---- offstage recovery is handled every frame (high priority)
    const gd = match.stage.ground;
    const onStage = f.x > gd.x - 40 && f.x < gd.x + gd.w + 40 && f.y < gd.y + 40;
    if (!onStage && f.state !== 'respawn' && !f.eliminated) {
      return this.recover(match);
    }

    this.timer--;
    if (this.timer <= 0 || this.plan === 'react') {
      this.timer = this.react + randInt(0, 8);
      this.decide(match);
    }

    // ---- simple continuous behaviours
    if (this.plan === 'approach') {
      if (this.target) {
        const dx = this.target.x - f.x;
        o[dx > 0 ? 'right' : 'left'] = true;
        // dash sometimes
        if (Math.abs(dx) > 260 && chance(0.02 * this.level)) o[dx > 0 ? 'right' : 'left'] = true;
        if (Math.abs(dx) > 150 && this.target.y < f.y - 90 && this.jumpCd === 0 && chance(0.04 * this.level)) { this.press.jump = 2; this.jumpCd = 40; }
        // don't overshoot: stop pressing if already close
        if (Math.abs(dx) < 70) { o.left = false; o.right = false; }
      }
    } else if (this.plan === 'attack') {
      this.doAttack(match);
    }
    // sticky combat: if in range and cooldown is up, swing regardless of plan
    if (this.target && this.attackCd === 0 && this.level >= 2) {
      const t2 = this.target;
      const ad = Math.abs(t2.x - f.x), dy2 = t2.y - f.y;
      if (ad < 105 && Math.abs(dy2) < 85 && this.plan !== 'defend' && this.plan !== 'retreat') {
        if (this.press.attack === undefined || this.press.attack <= 0) {
          this.press[ad < 55 ? 'attack' : (t2.x > f.x ? 'right' : 'left')] = 2;
          if (ad >= 55) this.press.attack = 2;
          this.attackCd = Math.max(10, 30 - this.level * 2);
        }
      }
    } else if (this.plan === 'retreat') {
      if (this.target) o[this.target.x > f.x ? 'left' : 'right'] = true;
      if (this.rollCd === 0 && chance(0.05)) { o.shield = true; this.press.shield = 6; this.rollCd = 60; }
    } else if (this.plan === 'defend') {
      o.shield = true;
      if (chance(0.02 * this.level)) this.press.shield = 4;
    } else if (this.plan === 'ledge') {
      // recover handled elsewhere
    }
    // If an opponent is underneath a pass-through platform, do not idle above
    // them forever just because horizontal distance is small.
    if (this.target && f.onGround && f.onPlatform && this.target.y > f.y + 75 &&
        Math.abs(this.target.x - f.x) < 130 && f.canAct() && f.state !== 'land') {
      o.down = true; o.shield = false; o.attack = false; o.special = false;
    }
    // item pickup
    if (this.level >= 3) {
      let near = null, nd = 130;
      for (const it of match.items) {
        if (it.dead || it.heldBy || it.smashBall || it.spawnT > 0 || it.cooldown > 0) continue;
        const d = Math.hypot(it.x - f.x, it.y - f.y);
        if (d < nd) { nd = d; near = it; }
      }
      if (near && this.plan !== 'attack' && Math.abs(near.y - f.y) < 90) {
        // Item pursuit overrides the combat direction rather than pressing both.
        o.left = o.right = false;
        o[near.x > f.x ? 'right' : 'left'] = true;
      }
      // Fighters pick up on contact in their own action step. CPUs use the
      // same input path as players instead of firing through hitstun/actions.
      if (f.held && f.held.def.cat !== 'batter' && f.held.type !== 'hammer' && this.target &&
          Math.abs(this.target.x - f.x) < 420 && f.canAct() && chance(0.06 * this.level)) o.grab = true;
    }
    // smash ball priority
    const sb = match.items.find(it => it.smashBall && !it.dead);
    if (sb && this.level >= 5) {
      o[sb.x > f.x ? 'right' : 'left'] = true;
      if (sb.y < f.y - 60 && this.jumpCd === 0) { this.press.jump = 2; this.jumpCd = 30; }
      if (Math.abs(sb.x - f.x) < 60 && Math.abs(sb.y - (f.y - 60)) < 70 && this.attackCd === 0) { this.press.attack = 2; this.attackCd = 10; }
    }
    // Final smash once possessed
    if (f.hasSmashBall && f.onGround && f.canAct()) { this.press.special = 2; }
    // taunt rarely
    if (this.tauntCd === 0 && chance(0.005) && f.onGround) { this.press.down = 6; this.tauntCd = 600; }
    return o;
  }

  nearestEnemy(match) {
    let best = null, bd = 1e9;
    for (const o of match.fighters) {
      if (o === this.f || o.eliminated) continue;
      if (match.sameTeam(this.f, o)) continue;
      const d = Math.hypot(o.x - this.f.x, o.y - this.f.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best ? { f: best, d: bd } : null;
  }

  decide(match) {
    const f = this.f;
    const near = this.nearestEnemy(match);
    this.target = near ? near.f : null;
    const lvl = this.level;
    if (!near) { this.plan = 'approach'; return; }
    const dx = near.f.x - f.x;
    const dy = near.f.y - f.y;
    const adx = Math.abs(dx);
    const hp = f.damage;
    const threat = (hp > 110 ? 0.25 : 0) + (lvl <= 3 ? 0.1 : 0);

    // defend if opponent is attacking near us
    if (near.f.state === 'attack' && adx < 120 && this.rollCd === 0 && chance(0.35 + lvl * 0.05)) {
      this.plan = 'defend'; this.timer = 14; this.rollCd = 50;
      return;
    }
    // stay on stage
    const gd = match.stage.ground;
    const edgeDist = Math.min(f.x - gd.x, gd.x + gd.w - f.x);
    if (edgeDist < 90 && this.level >= 4 && chance(0.5)) {
      this.plan = 'retreat'; this.timer = 24;
      return;
    }
    if (hp > 90 && this.level >= 5 && chance(threat)) {
      this.plan = 'retreat'; this.timer = 30;
      return;
    }
    if (adx < (lvl >= 6 ? 120 : 90) && Math.abs(dy) < 80) { this.plan = 'attack'; this.timer = 28; this.attackCd = 0; return; }
    this.plan = 'approach';
  }

  doAttack(match) {
    const f = this.f, t = this.target;
    if (!t) return;
    const dx = t.x - f.x, dy = t.y - f.y, adx = Math.abs(dx);
    const lvl = this.level;
    const hasItem = !!f.held;

    if (hasItem && f.held.def.cat !== 'batter' && f.held.type !== 'hammer' && chance(0.25)) { this.press.grab = 2; return; }
    if (adx < f.def.grabRange + 8 && Math.abs(dy) < 40) {
      if (f.damage > 70) { this.plan = 'defend'; this.timer = 12; this.press.shield = 8; return; }
      if (!hasItem && chance(0.45 - 0.03 * lvl)) { this.press.grab = 2; this.attackCd = 40; return; }
      if (f.damage > 70) { this.plan = 'defend'; this.timer = 12; this.press.shield = 8; return; }
    }
    if (this.attackCd > 0) return;

    const pick = Math.random();
    if (dy < -60 && adx < 100) { this.press.up = 2; this.press.attack = 2; this.attackCd = 26; return; }
    if (adx > 140 && lvl >= 6 && this.specialCd === 0 && chance(0.35)) {
      // Tide needs time on the button to send her traveling wave far enough
      // to reach a distant target; other fighters keep their usual tap.
      if (f.key === 'vector' && !f.vectorLockT && adx < 500 && chance(.35)) this.press.down = 2;
      this.press.special = f.key === 'tide' ? 48 : 2; this.specialCd = 90; return;
    }
    if (adx > 90 && chance(0.5)) {
      // smash attack if high damage target (kill confirm)
      if (t.damage > 82 && chance(0.5) && lvl >= 5) { this.press[dx > 0 ? 'right' : 'left'] = 2; this.press.attack = 3; }
      else { this.press[dx > 0 ? 'right' : 'left'] = 2; this.press.attack = 2; }
      this.attackCd = 22; return;
    }
    if (adx < 60) {
      if (chance(0.3)) { this.press.attack = 2; }
      else if (chance(0.2) && this.specialCd === 0) { this.press.special = f.key === 'tide' ? 24 : 2; this.specialCd = 60; }
      else { this.press[dx > 0 ? 'right' : 'left'] = 2; this.press.attack = 2; }
      this.attackCd = 18;
    }
  }

  recover(match) {
    const f = this.f, o = this.out;
    const gd = match.stage.ground;
    const leftEdge = gd.x, rightEdge = gd.x + gd.w;
    const toLeft = Math.abs(f.x - leftEdge) < Math.abs(f.x - rightEdge);
    const edgeX = toLeft ? leftEdge : rightEdge;
    const outward = toLeft ? -1 : 1;
    const distToEdge = Math.abs(f.x - edgeX);
    const below = f.y > gd.y - 20;
    const lvl = this.level;

    // move toward stage horizontally
    o[f.x < edgeX ? 'right' : 'left'] = f.x < edgeX ? true : false;
    o[f.x > edgeX ? 'left' : 'right'] = f.x > edgeX ? true : f.x < edgeX ? false : false;
    if (f.x < edgeX) { o.right = true; o.left = false; } else { o.left = true; o.right = false; }

    if (f.state === 'ledge') return o;

    if (f.vy > 2 || below) {
      if (f.airJumpsLeft > 0 && f.y > gd.y - 60) { this.press.jump = 2; return o; }
      if (f.airJumpsLeft > 0 && distToEdge > 200) { this.press.jump = 2; return o; }
      if (!f.usedUpB && (f.vy > 3 || f.y > gd.y + 80)) { this.press.up = 2; this.press.special = 3; return o; }
    }
    if (f.usedUpB && !f.usedAirDodge && distToEdge < 160 && f.vy > 1) {
      o.up = true; o.shield = true; // air dodge up as last resort
    }
    // drift toward ledge
    if (f.y < gd.y - 20 && distToEdge < 60) { o[f.facing === 1 ? 'right' : 'left'] = true; }
    return o;
  }
}
