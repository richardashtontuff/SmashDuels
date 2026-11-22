/* ============================================================
   RIFT RUMBLE — fighter physics + state machine
   ============================================================ */
'use strict';

const FRAME = 1; // logic frame unit

/* Maximum turn animation window while momentum changes direction. */
const SKID_FRAMES = 11;
const DASH_KICK = 0.28;               // fraction of run speed added on a fresh tap
/* Ledge grammar.  LEDGE_OUTSIDE is how far past the deck face a body has to be
   before it counts as hanging rather than standing; LEDGE_AUTO_CLIMB is how long
   a hang may last with no input at all — a fighter that got there by accident
   must not be parked out of the fight (the old value was effectively 5 seconds). */
const LEDGE_OUTSIDE = 4;
const LEDGE_AUTO_CLIMB = 72;
const DECK_LIP = 16;                  // px of overhang the deck still counts as floor
const SLAB_EASE = 8;                  // px/tick the stage wall pushes an overlapping body out
const HAZARD_REHIT = 45;              // ticks before a hazard may touch you again
const ITEM_SWING = 24;                // ticks of recovery on a held ranged item shot
const GRAB_HOLD_MAX = 120;            // ticks a grab can hold an opponent, pummels included
const LUNGE_SLIDE = 40;               // px a run attack's lunge is allowed to carry it
const GROUNDED_ACT = ['idle', 'walk', 'run', 'turn', 'crouch', 'air', 'jump', 'land',
  'shield', 'fall', 'doublejump', 'helpless', 'taunt'];
const MOVABLE = ['idle', 'walk', 'run', 'turn', 'crouch', 'air', 'jump', 'shield',
  'fall', 'doublejump', 'helpless', 'land'];

class Fighter {
  constructor(opts) {
    const def = FIGHTERS[opts.key];
    this.def = def;
    this.key = opts.key;
    this.palIdx = opts.palIdx || 0;
    this.pal = def.palettes[this.palIdx % def.palettes.length];
    this.playerIndex = opts.playerIndex;
    this.team = opts.team || 0;
    this.isCPU = !!opts.isCPU;
    this.cpuLevel = opts.cpuLevel || 5;
    this.label = opts.label || 'P' + (opts.playerIndex + 1);
    this.resetAt(opts.x, opts.y, opts.facing || 1);
    this.stocks = opts.stocks ?? 3;
    this.damage = 0;
    this.stats = { kos: 0, falls: 0, sd: 0, dealt: 0, taken: 0, maxCombo: 0 };
    this.cooldowns = {};
    this.buffs = { star: 0, mushroom: 0, poison: 0, metal: 0, bunny: 0, flower: 0 };
    this.held = null;      // item
    this.hasSmashBall = false;
    this.finalSmashUses = 0;
    this.ledgeCD = 0;
    this.techWindow = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.lastHitBy = null;
    this.spawnProtect = 60;
  }

  resetAt(x, y, facing) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.facing = facing || 1; this.facingInput = 0;
    this.state = 'idle'; this.stateT = 0; this.animT = 0;
    this.jumpsLeft = this.def.stats.jumps;
    this.airJumpsLeft = this.def.stats.airJumps;
    this.fastfalled = false; this.usedUpB = false; this.usedAirDodge = false;
    this.jumpHoldT = 0; this.jumpCut = false;
    this.dashT = 0; this.turnT = 0; this.runArmed = false; this.shieldDodging = false;
    this.hitstun = 0; this.hitlag = 0; this.shakeX = 0; this.shakeY = 0;
    this.invincT = 0; this.respawnT = 0; this.respawnDropT = 0; this.flashT = 0; this.hitT = 0;
    this.hazardCD = 0; this.itemCd = 0;
    this.shieldHP = 0; this.shieldStun = 0; this.shieldT = 0;
    this.action = null; this.actionT = 0; this.hitIds = new Map(); this.hitCount = new Map();
    this.ledge = null; this.ledgeCD = 0; this.ledgeInvuln = 0;
    this.grabbing = null; this.grabbedBy = null; this.grabT = 0;
    this.groundDist = 0; this.onGround = false;
    this.comboCount = 0; this.comboTimer = 0;
    this.dropThroughT = 0; this.tauntIdx = 0;
    this.chargeT = 0; this.charging = false; this.forceRelease = false; this.attackHoldT = 0;
    this.finalActive = 0; this.finalT = 0;
    this.diX = 0; this.diY = 0;
    this.stunT = 0;
    this.vectorLockTarget = null; this.vectorLockT = 0;
    this.crouchHeld = false;
    this.inputBuffer = { attack: 0, special: 0, jump: 0, shield: 0, grab: 0 };
    this.dirTapT = { left: 99, right: 99, up: 99, down: 99 };
    this.prevInput = {};
    // neutral input so update() is safe before the first readInput()
    this.input = {
      left: false, right: false, up: false, down: false,
      attack: false, special: false, jump: false, shield: false, grab: false,
      leftP: false, rightP: false, upP: false, downP: false,
      attackP: false, specialP: false, jumpP: false, shieldP: false, grabP: false,
    };
    this.touchedWall = false;
    this.staleQueue = [];       // last 10 move keys
  }

  staleMult(key) {
    if (!this.staleQueue) this.staleQueue = [];
    const uses = this.staleQueue.filter(k => k === key).length;
    // 1.0 fresh → ~0.62 at 5+ repeats
    return Math.max(0.62, 1 - uses * 0.075);
  }
  pushStale(key) {
    if (!this.staleQueue) this.staleQueue = [];
    this.staleQueue.push(key);
    while (this.staleQueue.length > 10) this.staleQueue.shift();
  }

  get size() { return this.def.stats.size; }
  get weight() {
    let w = this.def.stats.weight;
    if (this.buffs.metal > 0) w *= 2.6;
    if (this.buffs.mushroom > 0) w *= 1.3;
    if (this.buffs.poison > 0) w *= 0.75;
    return w;
  }
  get scale() {
    let s = this.def.stats.size;
    if (this.buffs.mushroom > 0) s *= 1.35;
    if (this.buffs.poison > 0) s *= 0.72;
    if (this.buffs.metal > 0) s *= 1.06;
    return s;
  }
  /* The hurtbox follows the pose.  A constant slab is why "I clearly hit their
     head and nothing happened" and "that sweep connected from a metre away" both
     happen: it was the same box while crouching, rolling and mid-lunge.
     Body size now comes from each fighter's `body` (sized to the drawn sprite —
     see the hurtbox test in tools/animtest.js) and is reshaped per state:
       crouch / a low move squashes it, rolls shrink it, lying down is short and
       wide, a held shield reaches out to where the bubble is actually drawn, and
       attacking pushes it forward by whatever the art sticks out past the
       silhouette — the same measurement the hitbox uses, so a big swing really
       does leave your own body open. That last one is the trade a whiff punish is
       made of; it is deliberately the only extension, never a shrink. */
  get hurtbox() {
    const b = this.def.body || { w: 44, h: 104 };
    const s = this.scale;
    let w = b.w * s, h = b.h * s;
    const st = this.state;
    if (st === 'ledge') return { x: this.x - w / 2, y: this.y + 8, w, h };
    if (st === 'crouch') { h *= 0.66; }
    else if (st === 'roll' || st === 'spotdodge' || st === 'airdodge') { h *= 0.76; w *= 1.1; }
    else if (st === 'down' || st === 'getup') { h *= 0.36; w *= 1.45; }
    else if (st === 'attack' || st === 'special') {
      const ext = this.attackExtent();
      w = Math.max(w, w + ext.back + ext.fwd);
      h = Math.max(h, h + ext.up);
      this._hurtShift = ext.fwd - ext.back;         // pushed out along the facing
    }
    if (st !== 'attack' && st !== 'special') this._hurtShift = 0;
    if (st === 'shield' || this.shieldHP > 0) w *= 1.1;
    return { x: this.x - w / 2 + (this._hurtShift || 0) / 2, y: this.y - h, w, h };
  }

  /* How far the current swing's *body* reaches past the resting body, in world px
     on each side — so lunging into a smash makes you hittable out where the arm
     actually is, instead of leaving the hurtbox on the spot you started from.

     Deliberately measured against `bodyBox`, the tiles without their baked VFX:
     a drawn crescent is part of what a swing hits with, but it is not a limb, and
     scoring it here is what turned a forward smash into a 220px-wide vulnerable
     slab you could trade through.  Zero without an atlas, so a fighter with no
     sheet art just keeps its plain box. */
  attackExtent() {
    const zero = { fwd: 0, back: 0, up: 0, down: 0 };
    const a = this.action;
    if (!a || !Number.isFinite(this.x) || typeof Sprites === 'undefined') return zero;
    const anim = Sprites.MOVE_ANIM[a.key] || Sprites.SPECIAL_ANIM[a.specialKey || a.specialDir];
    if (!anim) return zero;
    const sel = Sprites.pickAnim(this, 0);
    if (!sel) return zero;
    const art = Sprites.artReach(this.key, anim, sel.i, 'body');
    if (!art) return zero;
    const s = this.scale;
    return { fwd: art.over[2] * s, back: art.over[0] * s, up: art.over[1] * s, down: art.over[3] * s };
  }
  get center() { return { x: this.x, y: this.y - 52 * this.scale }; }
  get invincible() { return this.invincT > 0 || this.respawnT > 0 || this.ledgeInvuln > 0 || this.buffs.star > 0 || this.spawnProtect > 0; }

  speedMul() {
    let m = 1;
    if (this.buffs.bunny > 0) m *= 1.5;
    if (this.buffs.metal > 0) m *= 0.62;
    if (this.buffs.mushroom > 0) m *= 1.15;
    if (this.buffs.poison > 0) m *= 1.05;
    return m;
  }
  jumpMul() {
    let m = 1;
    if (this.buffs.bunny > 0) m *= 1.22;
    if (this.buffs.metal > 0) m *= 0.72;
    if (this.buffs.mushroom > 0) m *= 1.1;
    return m;
  }

  /* ---------------- input normalization ---------------- */
  readInput(raw) {
    const prev = this.prevInput;
    const inp = {
      left: !!raw.left, right: !!raw.right, up: !!raw.up, down: !!raw.down,
      attack: !!raw.attack, special: !!raw.special, jump: !!raw.jump, shield: !!raw.shield, grab: !!raw.grab,
      leftP: !!raw.left && !prev.left, rightP: !!raw.right && !prev.right,
      upP: !!raw.up && !prev.up, downP: !!raw.down && !prev.down,
      attackP: !!raw.attack && !prev.attack, specialP: !!raw.special && !prev.special,
      jumpP: !!raw.jump && !prev.jump, shieldP: !!raw.shield && !prev.shield, grabP: !!raw.grab && !prev.grab,
    };
    this.prevInput = { ...raw };
    // buffers
    for (const k of ['attack', 'special', 'jump', 'shield', 'grab']) {
      if (inp[k + 'P']) this.inputBuffer[k] = 8;
      else if (this.inputBuffer[k] > 0) this.inputBuffer[k]--;
    }
    // Retrying jump+G during Rocket Boost is a recovery input, not a
    // request to spend an air jump. This also works during hitlag, when the
    // action itself is not being updated.
    if (this.state === 'special' && this.action && this.action.rocketBoost &&
        inp.jump && inp.special && (inp.jumpP || inp.specialP)) {
      this.consume('jump'); this.action.boostJumpQueued = false;
    }
    for (const d of ['left', 'right', 'up', 'down']) {
      if (inp[d + 'P']) this.dirTapT[d] = 0; else this.dirTapT[d] = Math.min(99, this.dirTapT[d] + 1);
    }
    this.input = inp;
    this.attackHoldT = inp.attack ? this.attackHoldT + 1 : 0;
    return inp;
  }
  buf(k) { return this.inputBuffer[k] > 0; }
  consume(k) { this.inputBuffer[k] = 0; }
  horiz() { return (this.input.left ? -1 : 0) + (this.input.right ? 1 : 0); }
  vert() { return (this.input.up ? -1 : 0) + (this.input.down ? 1 : 0); }
  dirIsTap(d) { return this.dirTapT[d] <= 4; }

  /* ---------------- main update ---------------- */
  update(match) {
    this.stateT++; this.animT++; this.hitT++;
    if (this.hazardCD > 0) this.hazardCD--;
    if (this.itemCd > 0) this.itemCd--;
    this.comboTimer = Math.max(0, this.comboTimer - 1);
    if (this.comboTimer === 0) this.comboCount = 0;
    for (const k in this.buffs) if (this.buffs[k] > 0) {
      this.buffs[k]--;
      if (this.buffs[k] === 0 && k === 'star') AUDIO.sfx('beep');
    }
    if (this.cooldowns) for (const k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k]--;
    if (this.vectorLockT > 0) {
      this.vectorLockT--;
      const target = this.vectorLockTarget;
      if (!target || target.eliminated || target.state === 'respawn' || match.sameTeam(this, target)) {
        this.vectorLockT = 0; this.vectorLockTarget = null;
      } else if (this.vectorLockT % 30 === 0) match.fx.ring(target.x, target.y - 55 * target.scale, this.pal.accent, 42, 12);
      if (!this.vectorLockT) this.vectorLockTarget = null;
    }
    this.shakeX = this.shakeY = 0;

    // hitlag freeze
    // KO check first: nobody survives outside the blastzones
    if (!this.eliminated && this.state !== 'respawn' && this.checkBlastNow(match)) return;
    if (this.hitlag > 0) {
      this.hitlag--;
      const amt = Math.min(3.2, this.hitlag * 0.7);
      this.shakeX = rand(-amt, amt); this.shakeY = rand(-amt, amt);
      return;
    }

    /* Stale hit states with no hitstun left → get up, at the top of the tick.
       The check used to cover `launch` only, so a fighter who came out of a tumble
       while standing on the deck stayed in `hitstun` indefinitely: the state is not
       in the movement-lock list, but it *is* what keeps `applyPhysics` on the 0.995
       air drag instead of ground friction and what keeps the tumble animation on
       screen.  In a 4-player CPU match that showed up as someone lying on the floor
       for nine seconds, sliding a third of a pixel a tick, until a stray hit or a KO
       happened to move them on — the single most-reported shape of "the fighter is
       stuck".  Running before the state is read (not after) is what makes it an
       invariant rather than a repair. */
    if ((this.state === 'launch' || this.state === 'hitstun') && this.hitstun <= 0) {
      this.state = this.onGround ? 'idle' : 'fall';
      this.animT = 0;
    }

    if (this.flashT > 0) this.flashT--;
    if (this.invincT > 0) this.invincT--;
    if (this.respawnT > 0) { this.respawnT--; this.updateRespawn(match); return; }
    if (this.spawnProtect > 0) this.spawnProtect--;
    if (this.ledgeCD > 0) this.ledgeCD--;
    if (this.ledgeInvuln > 0) this.ledgeInvuln--;
    if (this.shieldStun > 0) this.shieldStun--;
    if (this.stunT > 0) { this.stunT--; this.applyPhysics(match); return; }
    if (this.dropThroughT > 0) this.dropThroughT--;
    if (this.respawnDropT > 0) this.respawnDropT--;

    // buffs visuals: flower damage
    if (this.buffs.flower > 0 && this.stateT % 40 === 0) this.takeDamage(1, this, match, { ignoreKB: true, noSound: true });

    // ---- final smash active
    if (this.finalActive > 0) { this.updateFinalSmash(match); return; }

    // ---- hitstun
    if (this.hitstun > 0) {
      this.hitstun--;
      // DI
      const diX = (this.input.left ? -1 : 0) + (this.input.right ? 1 : 0);
      const diY = (this.input.up ? -1 : 0) + (this.input.down ? 1 : 0);
      if (diX || diY) {
        // rotate the launch vector perpendicular to its direction (classic DI)
        const sp = Math.hypot(this.vx, this.vy);
        const ang = Math.atan2(this.vy, this.vx);
        const perp = Math.atan2(diY, diX) + Math.PI / 2;
        let diff = perp - ang;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const newAng = ang + sign(diff) * Math.min(Math.abs(diff), 0.20);
        this.vx = Math.cos(newAng) * sp;
        this.vy = Math.sin(newAng) * sp;
      }
      this.state = this.onGround ? 'hitstun' : 'launch';
      this.turnT = 0; this.endDash();
      this.applyPhysics(match);
      if (this.checkBlast(match)) return;
      // tech window
      if (this.input.shieldP && !this.onGround) this.techWindow = 22;
      if (this.techWindow > 0) this.techWindow--;
      if (this.onGround) this.state = 'hitstun';
      return;
    }

    // ---- grabbed by someone
    if (this.grabbedBy) {
      const g = this.grabbedBy;
      this.x = g.x + g.facing * 30 * g.scale; this.y = g.y - 2;
      this.vx = this.vy = 0;
      this.state = 'grabbed';
      this.facing = -g.facing;
      return;
    }

    // ---- ledge
    if (this.state === 'ledge') { this.updateLedge(match); return; }

    // ---- action states that lock movement
    if (this.state === 'attack' || this.state === 'special' || this.state === 'grab' || this.state === 'grabbing' || this.state === 'spotdodge' || this.state === 'roll' || this.state === 'airdodge' || this.state === 'land') {
      if (this.updateAction(match)) { this.stepAction(match); return; }
    }

    // ---- shield
    this.updateShield(match);

    // ---- final smash activation
    if (this.hasSmashBall && this.buf('special') && this.onGroundish() && this.canAct()) {
      this.startFinalSmash(match); return;
    }

    // ---- actions & movement
    if (this.canAct()) this.handleActions(match);
    if (this.canMove()) this.handleMovement(match);
    this.applyPhysics(match);
    this.checkBlast(match);
  }

  canAct() {
    return !this.grabbedBy && this.state !== 'grabbed' && this.ledge !== 'hang' &&
      GROUNDED_ACT.includes(this.state) &&
      this.shieldStun <= 0 && this.stunT <= 0;
  }
  canMove() { return MOVABLE.includes(this.state); }
  onGroundish() { return this.onGround; }
  airborne() { return !this.onGround && this.state !== 'ledge'; }

  /* ---------------- movement ----------------
     A direct reversal keeps the run armed. The turn animation plays only while
     velocity still points the old way, then the fighter runs in the new direction.
     Holding a direction resumes running after airborne and locked states, even
     when the original direction press is no longer fresh.
     ============================================================ */
  handleMovement(match) {
    const st = this.def.stats;
    const inp = this.input;
    const h = this.horiz();
    const spd = this.speedMul();

    if (this.onGround) {
      if (this.turnT > 0) this.turnT--;
      if (this.dashT > 0) this.dashT--;

      // A raised shield owns ground movement until it is released, jumped out
      // of, or turned into a dodge by updateShield.
      if (this.shieldHP > 0 && this.state === 'shield') {
        this.vx = approach(this.vx, 0, st.traction * 1.8);
        this.turnT = 0; this.endDash();
        return;
      }

      // Dropping through a platform works even with an equipped item.
      if (inp.downP && this.onPlatform && this.state !== 'land') {
        this.dropThroughT = 12; this.y += 6; this.onGround = false; this.onPlatform = null;
        this.state = 'fall'; return;
      }
      // crouch
      if (inp.down && this.state !== 'land' && !this.held) {
        this.state = 'crouch';
        this.vx = approach(this.vx, 0, st.traction * 2.6);
        this.turnT = 0; this.endDash();
        return;
      }

      if (h !== 0) {
        const speed = Math.abs(this.vx);
        if (h !== this.facing) {
          this.facing = h;
          this.runArmed = true;
          this.dashT = st.dashFrames;
          if (this.vx * h < -0.2) {
            this.turnT = SKID_FRAMES;
            if (this.key === 'tide') match.fx.waterSplash(this.x, this.y, .55, this.pal.accent);
            else match.fx.dust(this.x - h * 8 * this.scale, this.y, 6, this.pal.accent);
            AUDIO.sfx('land', { power: 0.18 });
          } else {
            this.turnT = 0;
            this.vx += h * st.run * DASH_KICK;
          }
        } else if ((h > 0 ? this.dirIsTap('right') : this.dirIsTap('left')) && this.turnT <= 0 && this.dashT <= 0) {
          // a fresh tap: short burst off the mark, and the run is armed
          this.dashT = st.dashFrames;
          this.runArmed = true;
          this.vx += h * st.run * DASH_KICK;
        }

        // Landing or an action can outlast the tap window and clear runArmed.
        // A held direction must still resume the run without another key press.
        this.runArmed = true;
        // Air steering can already have changed facing while momentum still
        // points the other way; that is a turn too.
        if (this.turnT <= 0 && this.vx * h < -0.2) this.turnT = SKID_FRAMES;
        if (this.turnT > 0 && this.vx * h < -0.2) {
          // Push toward the new run speed instead of braking to a walk first.
          this.vx = approach(this.vx, h * st.run * spd, st.traction * 4.5);
          this.state = 'turn';
        } else {
          this.turnT = 0;
          const running = this.runArmed;
          const target = h * (running ? st.run : st.walk) * spd;
          this.vx = approach(this.vx, target, st.traction * (running ? 1.9 : 1.7));
          this.state = speed < 0.25 ? (this.shieldHP > 0 ? 'shield' : 'idle')
            : running ? 'run' : (Math.abs(this.vx) > st.walk * 0.7 ? (running ? 'run' : 'walk') : 'walk');
        }
      } else {
        this.turnT = 0;
        if (this.dashT <= 0) this.runArmed = false;
        this.vx = approach(this.vx, 0, st.traction * 1.4);
        if (this.state !== 'land') this.state = Math.abs(this.vx) < 0.25 ? (this.shieldHP > 0 ? 'shield' : 'idle') : 'walk';
      }
      // jumps (jump button only — up-tap jump removed so up+attack can be utilts)
      if (this.buf('jump')) { this.tryJump(match); return; }
    } else {
      // air
      if (h !== 0) this.facing = h;
      const airSpeed = st.air * spd * (this.fastfalled ? 1.05 : 1);
      // Do not brake a running jump down to the lower air-speed cap while the
      // player keeps holding the same direction. From rest, air speed is still
      // limited by the fighter's normal air stat.
      const carried = h !== 0 && this.vx * h > 0 ? Math.min(Math.abs(this.vx), st.run * spd) : 0;
      const target = h * Math.max(airSpeed, carried);
      const reversing = h !== 0 && this.vx * h < 0;
      const accel = st.airAccel * (reversing ? 2.5 : 1);
      this.vx = approach(this.vx, target, accel);
      this.state = this.vy < -0.5 ? 'jump' : (this.fastfalled ? 'fastfall' : 'fall');
      if (this.def.stats.jumps > 2 && this.airJumpsLeft > 0 && this.vy < 0) this.state = this.vy < -1 ? 'jump' : 'fall';
      // fast fall
      if (inp.downP && this.vy > -1.5 && !this.fastfalled) { this.fastfalled = true; this.vy = Math.max(this.vy, 2); }
      // jumps in air
      if (this.buf('jump')) { this.tryJump(match); }
    }
  }

  /* A jump, landing, crouch or hit can drop you out of the run. */
  endDash() { this.runArmed = false; this.dashT = 0; }

  tryJump(match) {
    const st = this.def.stats;
    if (this.onGround) {
      this.consume('jump');
      this.vy = -st.jumpV * this.jumpMul();
      this.onGround = false; this.onPlatform = null;
      this.fastfalled = false; this.usedAirDodge = false;
      this.jumpsLeft = st.jumps; this.airJumpsLeft = st.airJumps;
      this.state = 'jump';
      this.endDash(); this.turnT = 0;
      this.jumpHoldT = 8; this.jumpCut = true;
      AUDIO.sfx('jump');
      match.fx.ring(this.x, this.y, this.pal.accent, 18);
      return true;
    }
    if (this.airJumpsLeft > 0) {
      this.consume('jump');
      this.airJumpsLeft--;
      this.jumpsLeft = this.airJumpsLeft;
      this.vy = -st.djumpV * this.jumpMul();
      this.vx += this.horiz() * 1.2;
      this.fastfalled = false;
      this.jumpHoldT = 0; this.jumpCut = true;
      this.state = 'doublejump'; this.animT = 0;
      AUDIO.sfx('djump');
      match.fx.ring(this.x, this.y - 20, this.pal.accent, 26);
      return true;
    }
    return false;
  }

  applyPhysics(match) {
    const st = this.def.stats;
    const gScale = this.buffs.metal > 0 ? 1.9 : 1;
    let maxFall = (this.fastfalled ? st.fastfall : st.fall) * (this.buffs.bunny > 0 ? 0.85 : 1) * gScale;
    if (this.state === 'helpless') maxFall *= 1.15;
    // Releasing jump early produces a short hop by easing the ascent down,
    // rather than instantly deleting nearly half of the upward velocity.
    if (this.vy < 0 && this.jumpHoldT > 0 && this.jumpCut && !this.input.jump) {
      this.jumpCut = false;
      this.jumpHoldT = 0;
    }
    if (this.jumpHoldT > 0) this.jumpHoldT--;
    let grav = st.gravity * gScale * (this.vy > 0 ? 1.05 : 1);
    if (!this.jumpCut && this.vy < 0 && this.state === 'jump' && this.hitstun <= 0) grav *= 2.2;
    this.vy = Math.min(this.vy + grav, maxFall);
    if (this.hitstun <= 0 && this.state !== 'launch') this.vx *= 0.995;

    const oldY = this.y;
    this.x += this.vx;
    this.y += this.vy;

    /* Ride the platform.  A fighter standing on a mover has to inherit its travel
       for the tick, otherwise the Ember Foundry lift and the Comet Reach blocks
       slide out from under them and drop them — and a descending platform left a
       standing fighter floating for a tick, then falling, then snapped back down:
       that one-frame bounce every time the block changed direction is what read as
       "collision problems with the platforms".  Applied before the stage tests so
       the surface check below still owns the final position. */
    if (this.onPlatform) {
      const p = this.onPlatform;
      if (p.dx || p.dy) { this.x += p.dx || 0; this.y += p.dy || 0; }
    }

    // stage collision
    const stage = match.stage;
    const gd = stage.ground;
    const wasGrounded = this.onGround;
    const wasY = this.y;
    this.onGround = false; this.onPlatform = null;

    {
      // main platform top — solid from above only, never snapped up from below
      if (this.x > gd.x - DECK_LIP && this.x < gd.x + gd.w + DECK_LIP) {
        const top = gd.y;
        const crossed = this.y - this.vy <= top + 2;   // was above the surface last frame
        if (this.y >= top - 1 && this.vy >= 0 && crossed) {
          if (wasGrounded) {
            // already standing — just rest on the surface
            this.y = top; this.vy = 0; this.onGround = true;
          } else {
            this.landOn(top, match, false);
          }
        }
      }
    }
    // soft platforms: a drop-through ignores these, never the deck above
    if (this.dropThroughT <= 0) {
      for (const p of stage.platforms) {
        if (this.respawnDropT > 0) break;              // drop-in ignores soft platforms
        const px = p.cx !== undefined ? p.cx : p.x, py = p.cy !== undefined ? p.cy : p.y;
        if (this.x > px - 4 && this.x < px + p.w + 4 && !(this.input.down && this.state === 'crouch')) {
          if (this.y >= py && this.y - this.vy <= py + 2) {
            if (wasGrounded) { this.y = py; this.vy = 0; this.onGround = true; this.onPlatform = p; }
            else this.landOn(py, match, true, p);
          }
        }
      }
    }
    // An upward launch from below cannot pass into the underside of the main
    // deck. Resolve the crossing vertically, without snapping anyone from deep
    // under the stage to a distant side wall.
    const underside = gd.y + gd.h + 14;
    if (!this.isMob && oldY >= underside && this.y < underside && this.vy < 0 &&
        this.x > gd.x && this.x < gd.x + gd.w) {
      this.y = underside; this.vy = 0; this.onGround = false; this.onPlatform = null;
    }
    this.prevY = this.y;

    // the stage slab is solid from the sides; see confine()
    this.confine(gd);
  }

  /* Keep a fighter out of the stage slab.
   *
   * This used to teleport anyone below `gd.y + 20` to a fixed offset outside
   * the platform (±24px).  That had no lower bound, so a fighter knocked past
   * the side of the stage was yanked sideways mid-fall, and combined with the
   * separation clamp in Match it pinned 3-4 fighters against an invisible
   * wall — the jitter/pinning at the stage edges, worst in 4v4/4-player.
   * Now the slab is resolved as a real body, only while they are actually
   * inside its vertical span, so they slide down the outside and get KO'd at
   * the blast zone like any other. */
  confine(gd) {
    if (this.isMob) return;                     // mobs walk through, by design
    const half = 24 * this.scale;
    if (this.y > gd.y + 2 && this.y < gd.y + gd.h + 14) {
      /* The slab is a wall, but it is a wall at the DECK FACE, not at the body
         box: a fighter standing beside the stage keeps its footing.  Ejecting the
         whole half-width every tick teleported a shoved fighter ~24px out into
         the void, and the solver then pushed them back — that argument is what
         made the crowd vibrate against an invisible wall in 4-player.  A shallow
         overlap is eased out (SLAB_EASE px/tick); only a body actually inside the
         rock is ejected in one go. */
      const lim0 = gd.x - half, lim1 = gd.x + gd.w + half;
      if (this.x > lim0 && this.x < gd.x) {
        this.x = Math.max(lim0, this.x - SLAB_EASE);
        if (this.vx > 0) this.vx = -this.vx * 0.22;
      } else if (this.x >= gd.x && this.x < gd.x + half) {
        this.x = lim0;
        if (this.vx > 0) this.vx = -this.vx * 0.22;
      } else if (this.x < lim1 && this.x > gd.x + gd.w) {
        this.x = Math.min(lim1, this.x + SLAB_EASE);
        if (this.vx < 0) this.vx = -this.vx * 0.22;
      } else if (this.x <= gd.x + gd.w && this.x > gd.x + gd.w - half) {
        this.x = lim1;
        if (this.vx < 0) this.vx = -this.vx * 0.22;
      }
    }
  }

  /* How hard this fighter is to shove around (used by the separation solver). */
  pushResist() {
    let r = 1 + (this.weight - 100) / 240;
    if (this.onGround) r += 0.9;
    if (this.shieldHP > 0 || this.state === 'shield') r += 0.6;
    if (this.state === 'ledge') r += 1.4;        // ledge hangs are tenacious
    if (this.hitstun > 0 || this.state === 'launch' || this.state === 'helpless') r -= 0.6;
    if (this.state === 'roll' || this.state === 'airdodge') r -= 0.25;
    return Math.max(0.3, r);
  }

  landOn(top, match, platform, p) {
    const impact = this.vy;
    this.y = top; this.vy = 0; this.onGround = true;
    this.onPlatform = p || null;
    if (this.respawnDropT > 0 && !platform) this.respawnDropT = 0;
    this.airJumpsLeft = this.def.stats.airJumps;
    this.jumpsLeft = this.def.stats.jumps;
    this.fastfalled = false; this.usedUpB = false; this.usedAirDodge = false;
    this.ledge = null; this.ledgeInvuln = 0;
    if (this.key === 'tide' && impact > 1) match.fx.waterSplash(this.x, this.y, clamp(impact / 10, .6, 1.5), this.pal.accent);
    // tech
    if (this.hitstun > 0 || this.techWindow > 0) {
      if (this.input.shield || this.input.shieldP) { this.startTech(match); return; }
      // The landing consumes the tech window even when no tech was pressed.
      this.techWindow = 0;
      // hard landing from hitstun → bounce
      this.hitstun = Math.floor(this.hitstun * 0.18);
      this.vy = -Math.abs(impact) * 0.24;
      if (Math.abs(this.vy) < 1.2) { this.vy = 0; this.hitstun = Math.min(this.hitstun, 4); }
      this.y -= 1; this.onGround = false;
      match.fx.dust(this.x, this.y, 8, this.pal.accent);
      AUDIO.sfx('land');
      return;
    }
    /* Landing lag belongs to aerial actions that end on the deck.  A grab in progress
       is not one of them: since a locked action now integrates the body, the grabber
       came down onto the deck inside their own hold and `landOn` used to replace the
       `holding` action with `landing` — dropping the victim and starting a buffered
       attack in the same motion. */
    const holding = this.state === 'grab' || this.state === 'grabbing' ||
      (this.action && (this.action.type === 'holding' || this.action.type === 'grabbing'));
    if (this.hitstun <= 0 && !holding && this.state !== 'attack' && this.state !== 'shield' && this.state !== 'special' && this.state !== 'land') {
      this.state = 'land'; this.stateT = 0;
      this.turnT = 0; this.endDash();
      this.landLag = impact > 14 ? 9 : 4;
      this.action = { type: 'landing', dur: this.landLag };
      this.actionT = 0;
    }
    if (impact > 4) {
      if (this.key !== 'tide') match.fx.dust(this.x, this.y, Math.min(10, 2 + impact * 0.4), '#ffffff');
      if (impact > 10) match.cam.shake(Math.min(6, impact * 0.3));
      AUDIO.sfx('land');
    }
  }

  startTech(match) {
    this.hitstun = 0; this.techWindow = 0;
    this.invincT = 22;
    this.state = 'land'; this.action = { type: 'landing', dur: 14 };
    this.techDir = (this.input.left ? -1 : this.input.right ? 1 : 0);
    if (this.techDir !== 0) { this.vx = this.techDir * 6; this.vy = -2; this.onGround = false; }
    match.fx.ring(this.x, this.y, '#ffffff', 28);
    AUDIO.sfx('dodge');
    match.fx.text(this.x, this.y - 110, 'TECH!', '#ffffff');
  }

  /* ---------------- shield ---------------- */
  updateShield(match) {
    if (this.grabbedBy) return;
    if (this.input.shield && this.onGround && this.canAct() && this.shieldHP === 0 && this.shieldStun <= 0) {
      // shorthop guard: shield + direction = roll
      const h = this.horiz();
      if (this.input.leftP || this.input.rightP) {
        this.startRoll(h, match); return;
      }
      if (this.input.downP) { this.startSpotDodge(match); return; }
      this.shieldHP = 60; this.shieldT = 0;
      this.state = 'shield';
      AUDIO.sfx('shieldUp');
    }
    if (this.shieldHP > 0) {
      this.shieldT++;
      // drain
      this.shieldHP -= 0.12 + (this.shieldT > 260 ? 0.4 : 0);
      if (this.input.shieldP && this.shieldT > 0) { }
      // roll / dodge out of shield
      if (this.input.leftP || this.input.rightP) this.startRoll(this.horiz(), match);
      else if (this.input.downP) this.startSpotDodge(match);
      else if (this.input.jumpP) { this.shieldHP = 0; this.tryJump(match); }
      else if (this.input.attackP) { this.shieldHP = 0; this.startGrab(match); }
      if (!this.input.shield) { this.shieldHP = 0; if (this.state === 'shield') this.state = 'idle'; }
      // only break from sustained depletion, never as a side-effect of rolling/dodging
      if (!this.shieldDodging && this.shieldHP <= 0 && this.state === 'shield') { this.shieldBreak(match); }
    }
    // shield regen
    if (this.shieldHP === 0 && !this.input.shield) this.shieldRegen = (this.shieldRegen || 0) + 0.08;
    if (this.shieldRegen > 0) {
      if (this.shieldRegen > 1) this.shieldRegen -= 1;
      else { this.shieldRegen = 0; }
    }
  }

  shieldBreak(match) {
    this.shieldHP = 0; this.stunT = 180;
    this.state = 'hitstun'; this.hitstun = 0;
    AUDIO.sfx('shieldBreak');
    match.fx.burst(this.x, this.y - 50, this.pal.accent, 30);
    match.fx.text(this.x, this.y - 120, 'SHIELD BREAK!', '#ff5a7a');
    match.cam.shake(10);
    this.shieldT = 0;
  }

  startRoll(dir, match) {
    if (dir === 0) dir = this.facing;
    this.shieldDodging = true; this.shieldHP = 0;
    this.state = 'roll'; this.action = { type: 'roll', dur: 26 }; this.actionT = 0;
    this.animT = 0; this.turnT = 0; this.endDash();
    this.rollDir = dir; this.invincT = 16;
    // facing is NOT snapped to the roll direction: a back-roll should still
    // leave you looking at the opponent, and the old snap left every roll
    // ending face-first into thin air (the "facing wrong way" report).
    AUDIO.sfx('dodge');
  }
  startSpotDodge(match) {
    this.shieldDodging = true; this.shieldHP = 0;
    this.state = 'spotdodge'; this.action = { type: 'spotdodge', dur: 22 }; this.actionT = 0;
    this.animT = 0; this.turnT = 0; this.endDash();
    this.invincT = 14;
    AUDIO.sfx('dodge');
  }
  startAirDodge(match) {
    this.usedAirDodge = true;
    this.state = 'airdodge'; this.action = { type: 'airdodge', dur: 26 }; this.actionT = 0;
    this.animT = 0;
    this.invincT = 18;
    const h = this.horiz(), v = this.vert();
    if (h || v) { this.vx = h * 5.4; this.vy = v * 5.4 * 0.8; }
    else this.vx *= 0.3;
    this.fastfalled = false;
    AUDIO.sfx('dodge');
  }

  /* ---------------- attacks ---------------- */
  /* true when a direction was tapped within 3 frames of the attack press */
  smashInput() {
    const d = this.dirTapT || {};
    const fresh = Math.min(d.left ?? 99, d.right ?? 99, d.up ?? 99, d.down ?? 99);
    return fresh <= 3;
  }

  attackTypeFor() {
    const inp = this.input;
    const h = this.horiz(), v = this.vert();
    const smash = this.smashInput();
    if (this.onGround) {
      /* A skid is not a dash: pivoting should give you a tilt or a smash, never
         the run attack.  The dash burst itself (dashT) does count, which is the
         frame window people actually press in. */
      if (this.state !== 'turn' && (this.dashT > 0 || this.state === 'run' ||
          Math.abs(this.vx) > this.def.stats.walk * 1.12)) return 'dashattack';
      if (v < 0 || (this.dirIsTap('up') && this.input.up)) return smash ? 'usmash' : 'utilt';
      if (v > 0 || (this.dirIsTap('down') && this.input.down)) return smash ? 'dsmash' : 'dtilt';
      if (h !== 0) return smash ? 'fsmash' : 'ftilt';
      return 'jab';
    } else {
      if (v < 0) return 'uair';
      if (v > 0) return 'dair';
      if (h !== 0) return (h === this.facing) ? 'fair' : 'bair';
      return 'nair';
    }
  }

  startAttack(kind, match) {
    const m = this.def.moves[kind];
    if (!m) return;
    this.state = 'attack';
    this.action = Object.assign({}, m, {
      dur: m.frames, type: 'move', key: kind,
      poseType: kind === 'jab' ? 'jab' : kind.includes('air') ? 'air' : kind.includes('smash') ? 'smash' : 'swing',
      dir: kind.startsWith('u') ? 'u' : kind.startsWith('d') ? 'd' : 'f',
      aerialDir: kind === 'nair' ? 'n' : kind === 'fair' ? 'f' : kind === 'bair' ? 'b' : kind === 'uair' ? 'u' : 'd',
      charge: !!m.charge, dirFacing: this.facing,
    });
    this.actionT = 0; this.hitIds = new Map(); this.hitCount = new Map();
    this.charging = false; this.chargeT = 0; this.forceRelease = false;
    // restart the animation clock with the action: the strike tile has to land on
    // the startup frame, so a mid-slide actionT would otherwise start it late
    this.animT = 0; this.turnT = 0; this.endDash();
    // per-box windows: a box with no explicit t0/t1 spans the whole active window
    this.action.hitboxes = (m.hitboxes || []).map((b) => Object.assign({}, b));
    // Melee items augment the fighter's own F moves, including their timing,
    // direction, animation and hit limits. G remains the normal special.
    const weapon = this.held && (this.held.def.cat === 'batter' || this.held.type === 'hammer') ? this.held : null;
    if (weapon) {
      const a = this.action, perk = weapon.def.perk, hits = 1 + (m.multi || 0);
      a.itemPerk = perk;
      a.itemDamageBonus = (perk === 'heavy' ? 4 : perk === 'launch' ? 3 : perk === 'reach' ? 2 : 1) / hits;
      a.damage += a.itemDamageBonus;
      if (a.finish) { a.finish = Object.assign({}, a.finish); if (perk === 'launch' || perk === 'heavy') { a.finish.bkb += perk === 'launch' ? 10 : 6; a.finish.kbs += perk === 'launch' ? 22 : 10; } }
      if (perk === 'launch' || perk === 'heavy') { a.bkb += perk === 'launch' ? 10 : 6; a.kbs += perk === 'launch' ? 22 : 10; }
      if (perk === 'reach') for (const b of a.hitboxes) {
        // Extend each box away from the fighter, including backwards aerials.
        if (b.x + b.w / 2 < 0) b.x -= 16;
        b.w += 16;
      }
    }
    if (!this.onGround) this.vy = Math.min(this.vy, 0) * 0.4; // slight float
    AUDIO.sfx('swing');
    match.fx.swoosh(this, (m.reach || 40) * 1.15);
    // small forward lunge for ground attacks
    if (this.onGround && (kind === 'ftilt' || kind === 'fsmash')) this.vx += this.facing * (kind === 'fsmash' ? 1.6 : 1.0);
    if (this.onGround && kind === 'dashattack') {
      // the run attack IS a lunge: `slide` hands stepAction its travel budget
      this.vx += this.facing * 2.6; this.dashT = 0;
      this.action.slide = LUNGE_SLIDE; this.action.slideFrom = this.x;
    }
  }

  startGrab(match) {
    // grabs auto-turn toward their target (Melee-style).  Use the same
    // candidate set the grab tests, so the animation and the hitbox agree;
    // fall back to the nearest opponent so a whiffed grab still faces out.
    let t = match && match.findGrabTarget ? match.findGrabTarget(this) : null;
    if (!t && match) {
      let bd = 200;
      for (const o of match.fighters) {
        if (o === this || o.eliminated || o.grabbedBy) continue;
        if (match.sameTeam && match.sameTeam(this, o)) continue;
        const d = Math.abs(o.x - this.x);
        if (d < bd && Math.abs(o.y - this.y) < 84) { bd = d; t = o; }
      }
    }
    if (t && Math.abs(t.x - this.x) > 2) this.facing = t.x > this.x ? 1 : -1;
    this.state = 'grab';
    this.action = { type: 'grabbing', dur: 30, poseType: 'grab', dir: 'f' };
    this.actionT = 0; this.grabAttempt = true;
    AUDIO.sfx('swing');
  }

  startSpecial(dir, match) {
    const sp = dir === 'n' ? this.def.specials.neutral : dir === 's' ? this.def.specials.side : dir === 'u' ? this.def.specials.up : this.def.specials.down;
    if (!sp) return false;
    // One recovery per airtime; landing, grabbing a ledge, and respawning reset it.
    if (dir === 'u' && this.usedUpB && !this.onGround) return false;
    if (sp.cooldown && (this.cooldowns[dir] || 0) > 0) return false;
    this.state = 'special';
    // keep the move's own kind (projectile / dash / recover / counter / mine …)
    // — overwriting `type` with 'special' made every special-type branch dead
    this.action = Object.assign({}, sp, { dur: sp.frames, kind: 'special', specialType: sp.type, type: 'special', specialKey: dir, poseType: 'special', specialDir: dir });
    this.actionT = 0; this.hitIds = new Map(); this.hitCount = new Map(); this.specPhase = 'startup';
    this.charging = sp.type === 'soulreap' || sp.type === 'tidewave'; this.chargeT = 0; this.forceRelease = false;
    if (sp.cooldown) this.cooldowns[dir] = sp.cooldown;
    this.specialData = { fired: 0, timer: 0, projFired: false, orbFired: false, dashFired: false, tpFired: false, lassoFired: false, riseHit: false, mineFired: false };
    if (dir === 'u') { this.usedUpB = true; this.fastfalled = false; }
    AUDIO.sfx((sp.type === 'soulreap' || sp.type === 'tidewave') ? 'shieldUp' : 'swing');
    return true;
  }

  handleActions(match) {
    const inp = this.input;
    // Contact pickup is automatic. A grab press on the pickup tick must not
    // immediately throw/fire the new item or also start a grab.
    const wasHolding = !!this.held;
    const pickedUp = !wasHolding && match.tryPickup(this);
    if (pickedUp && this.buf('grab')) { this.consume('grab'); return; }
    // V uses held ranged/throwable items and drops a melee weapon. Without an
    // item it is still the ordinary grab. Shield retains its normal behavior.
    if (this.held && this.buf('grab')) {
      this.consume('grab');
      const shooting = this.held.def.cat === 'shoot';
      const used = shooting ? match.useHeld(this) : match.throwHeld(this);
      if (used) { this.shieldHP = 0; this.state = 'attack'; this.action = { type: 'item', dur: shooting ? ITEM_SWING : 20 }; this.actionT = 0; }
      return;
    }
    // aerial dodge
    if (!this.onGround && this.buf('shield') && !this.usedAirDodge) { this.consume('shield'); this.startAirDodge(match); return; }
    if (this.buf('grab') || (this.buf('shield') && this.buf('attack'))) {
      this.consume('grab'); this.consume('attack');
      this.startGrab(match); return;
    }
    // attack — one press = one move. A held button does NOT auto-repeat, so
    // releasing always returns to idle; tapping again chains a fresh jab.
    if (this.buf('attack')) {
      this.consume('attack');
      const kind = this.attackTypeFor();
      this.startAttack(kind, match);
      match.fx.swoosh(this, 30);
      return;
    }
    // specials
    if (this.buf('special')) {
      this.consume('special');
      const h = this.horiz(), v = this.vert();
      let dir = 'n';
      // Up + special or jump + special both select the recovery. Explicit
      // down takes precedence over jump; horizontal input can still steer up-B.
      if (v < 0) dir = 'u'; else if (v > 0) dir = 'd'; else if (inp.jump) dir = 'u'; else if (h !== 0) dir = 's';
      if (dir === 's' && h) this.facing = h;
      const started = this.startSpecial(dir, match);
      // Vector's rejected recovery attempt must not silently turn jump+G into
      // a double jump and spend the remaining air jump.
      if (dir === 'u' && (started || this.key === 'vector')) this.consume('jump');
      return;
    }
    // taunt (down while idle on ground and not crouching handled in movement) — tap up on idle = taunt
    if (inp.upP && this.onGround && !this.held && this.state === 'idle') {
      // up-tap is a jump by default; taunt assigned to holding down+shield? keep jump priority
    }
  }

  /* A locked action still moves the body.
     `updateAction` owns the *velocity* — the dash-attack lunge, the roll arc, the
     landing drag — and then the tick used to end there: nothing integrated it.  A
     dash attack out of a run therefore stopped the fighter dead for the whole move
     and handed the same velocity back when it ended, so Grim's Freight Train
     travelled 0px across its 32 frames, its hitbox never reached the man standing in
     front of him, and the move read as simply broken; rolls did not roll and an
     aerial hung at the apex of its jump.  Only travel is granted here — the input
     stays locked, and `applyPhysics` still owns support, stage collision and
     platforms, so a lunge that runs out of deck cannot hover on a stale `onGround`. */
  stepAction(match) {
    const st = this.def.stats, a = this.action;
    if (a && a.slide) {
      /* A move with a travel budget keeps the speed it was granted until it has
         covered that distance — the dash attack's lunge, a rush special's authored
         `dist` — and then it settles, so the move reads as a commit rather than a
         slide clean across the stage. */
      if (a.slideFrom === undefined) a.slideFrom = this.x;
      if (Math.abs(this.x - a.slideFrom) >= a.slide) this.vx = approach(this.vx, 0, st.traction * 2.4);
    } else if (this.onGround && a && a.type === 'landing') {
      // Ground contact should not erase horizontal momentum: allow gentle
      // steering through normal landing lag instead of two layers of braking.
      const target = this.horiz() * st.run * this.speedMul();
      this.vx = approach(this.vx, target, st.traction * 0.55);
    } else if (this.onGround) {
      this.vx = approach(this.vx, 0, st.traction * (a && a.type === 'special' ? 1.1 : 1.8));
    } else if (a && a.type === 'special') {
      // the same rush off the deck, when it has no budget of its own
      this.vx = approach(this.vx, sign(this.vx) * st.air, 0.55);
    }
    this.applyPhysics(match);
    this.checkBlast(match);
  }

  updateAction(match) {
    const a = this.action;
    if (!a) { this.state = 'idle'; return false; }
    // Held neutral specials pause the action clock; releasing G commits the
    // stored power/duration. A buffered tap still works and interruption cancels it.
    if (a.type === 'special' && (a.specialType === 'soulreap' || a.specialType === 'tidewave') && this.charging) {
      if (this.input.special) {
        this.chargeT = Math.min(a.chargeFrames, this.chargeT + 1);
        this.actionT = 0;
        this.vx *= 0.8;
        match.fx.charge(this.x + this.facing * 16 * this.scale, this.y - 65 * this.scale, this.pal.accent, this.chargeT);
        if (this.chargeT === a.chargeFrames && !a.fullChargeCue) {
          a.fullChargeCue = true; AUDIO.sfx('beep');
          match.fx.ring(this.x, this.y - 60 * this.scale, this.pal.accent, 70 * this.scale, 18);
        }
        return true;
      }
      const power = clamp(this.chargeT / a.chargeFrames, 0, 1);
      if (a.specialType === 'tidewave') {
        // A tap still produces a visible wave. Longer holds yield two ticks
        // of wave life per held tick, up to ten seconds at full charge.
        a.waveLife = Math.max(a.minWaveLife, this.chargeT * a.waveLifeMultiplier);
      } else {
        a.chargeMultiplier = 1 + (a.chargeMax - 1) * power;
        a.damage *= a.chargeMultiplier;
      }
      this.charging = false;
      this.actionT = 0;
      if (a.cooldown) this.cooldowns.n = a.cooldown;
      match.fx.burst(this.x + this.facing * 30 * this.scale, this.y - 65 * this.scale, this.pal.accent, 5 + Math.round(power * 9), 3 + power * 3);
      AUDIO.sfx('swing');
    }
    this.actionT++;
    const t = this.actionT;

    // Rocket Boost keeps control locked throughout its 20-tick thrust, but a
    // fresh jump during that time should not expire unnoticed. Jump on the
    // first tick after thrust, consuming the usual ground/air jump. The jump
    // used to activate jump+G was consumed at startup and cannot queue this.
    if (a.type === 'special' && a.rocketBoost) {
      if (this.buf('jump') && !this.input.special) {
        a.boostJumpQueued = true; this.consume('jump');
      }
      if (a.boostJumpQueued && t >= a.startup + 20 && (this.onGround || this.airJumpsLeft > 0)) {
        this.action = null; this.actionT = 0;
        this.tryJump(match);
        return true;
      }
    }

    /* charge smashes */
    if (a.charge && a.type === 'move' && !this.forceRelease) {
      if (this.charging) {
        this.chargeT++;
        this.vx *= 0.7;
        // release: stop charging and let the timer run into the active window
        if (!this.input.attack || this.chargeT >= 60) {
          this.charging = false;
          this.forceRelease = true;
          this.actionT = Math.max(this.actionT, a.startup - 1);
        } else {
          match.fx.charge(this.x, this.y - 60, this.pal.accent, this.chargeT);
        }
      } else if (t === a.startup - 1 && this.input.attack) {
        // arm the charge exactly once, on the last startup frame
        this.charging = true; this.chargeT = 0;
        this.actionT = a.startup - 1;
      }
    }

    const dur = a.dur || 30;
    const ended = t >= dur;
    // resolve hitboxes
    if (a.type === 'special' && a.hitboxes) {
      /* A rush special used to be all theatre: the dash branch of `updateSpecial` grants
         the speed, the travel budget, the invincibility and the speed lines, and the move
         authored `damage/bkb/kbs/angle` that nothing ever read — so running into someone
         with B thrust them forward and dealt 0%.  It goes through the same resolver as a
         melee move now, which is the only reason a rush respects a shield, a counter, the
         re-hit cap and stale the way everything else does. */
      const n = a.active || 1;
      if (t >= a.startup && t < a.startup + n) this.checkHit(match, 1, 'special' + a.specialKey);
    } else if (a.type === 'move') {
      /* `t >= startup && t < startup + active` — `active` is the number of live
         frames, and the old `<= startup + active` made every move in the roster
         hit for one frame too long, with the extra tick landing after the
         animation had already left its strike pose. */
      const n = a.active || 1;
      if (t >= a.startup && t < a.startup + n) {
        this.checkHit(match, this.smashMultiplier());
        if (a.signature === 'comet' && !a.cometFired) {
          a.cometFired = true;
          const p = match.spawnProjectile({ owner: this, x: this.x + this.facing * 40, y: this.y - 56,
            vx: this.facing * 8, vy: 0, damage: 3, bkb: 8, kbs: 24, angle: this.facing < 0 ? 135 : 45,
            life: 24, color: this.pal.accent, size: 7, kind: 'fallingStar' });
          for (const id of this.hitIds.keys()) p.hitIds.add(id);
          match.fx.burst(p.x, p.y, this.pal.accent, 6, 2);
        }
        if (a.itemPerk === 'star' && !a.itemStarFired) {
          a.itemStarFired = true;
          const p = match.spawnProjectile({ owner: this, x: this.x + this.facing * 34 * this.scale, y: this.y - 56 * this.scale,
            vx: this.facing * 10, vy: 0, damage: 4, bkb: 8, kbs: 22, angle: 40, life: 28, color: '#ffd23a', size: 7, kind: 'star' });
          // An opponent already struck by the rod must not also eat its star.
          for (const id of this.hitIds.keys()) p.hitIds.add(id);
          match.fx.muzzle(p.x, p.y, '#ffd23a', this.facing);
        }
      }
      /* Re-arming a target is the resolver's job now (`rehitBlocked` compares the
         tick of the last hit against the move's re-hit spacing), so nothing clears
         this mid-move — the old blanket clear fired on a fixed tick and turned a
         2-hit flurry into a 3-hit one. */
    }
    if (a.type === 'special') this.updateSpecial(match, a, t);
    if (a.type === 'item') {
      if (ended) { this.action=null; this.state='idle'; }
      return !ended;
    }
    if (a.type === 'holding') {
      // holding a grabbed opponent
      const victim = this.grabbing;
      if (!victim || victim.eliminated) { this.grabbing = null; if (victim) victim.grabbedBy = null; this.action = null; this.state = 'idle'; return false; }
      const inp = this.input;
      if (inp.attackP) { match.pummel(this); this.actionT = 0; }
      if (inp.leftP || this.input.left && this.actionT > 4 && this.dirIsTap('left')) { match.throwGrabbed(this, 'b'); return true; }
      if (this.dirIsTap('right')) { match.throwGrabbed(this, 'f'); return true; }
      if (this.dirIsTap('up')) { match.throwGrabbed(this, 'u'); return true; }
      if (this.dirIsTap('down')) { match.throwGrabbed(this, 'd'); return true; }
      if (inp.upP) { match.throwGrabbed(this, 'u'); return true; }
      if (inp.downP) { match.throwGrabbed(this, 'd'); return true; }
      if (inp.leftP) { match.throwGrabbed(this, 'b'); return true; }
      if (inp.rightP) { match.throwGrabbed(this, 'f'); return true; }
      /* The hold used to end on `t >= 60`, but `t` had been shadowed by the grabbed
         *fighter*, so the comparison was always false and the throw never happened.
         Nothing else releases a grab in this engine — there is no mash-out — so a CPU
         that grabbed and held attack pummelled its victim for as long as it liked
         (108 frames and counting on Ember Foundry) with the other player frozen in
         `grabbed`; at a stage edge that is exactly "my fighter is stuck".  `grabT` is
         the hold clock, and unlike `actionT` a pummel does not restart it. */
      if (++this.grabT >= GRAB_HOLD_MAX) { match.throwGrabbed(this, 'f'); return true; }
      return true;
    }
    if (a.type === 'grabbing') {
      // grab check on first active frames
      if (t >= 4 && t <= 12 && this.grabAttempt) {
        const target = match.findGrabTarget(this);
        if (target) { this.grabAttempt = false; match.beginGrab(this, target); }
      }
      if (t > 12) this.grabAttempt = false;
    }
    if (a.type === 'roll') {
      const p = t / a.dur;
      this.vx = this.rollDir * 6.5 * (1 - p);
      this.vy = 0;
    }
    if (a.type === 'airdodge') {
      this.vx *= 0.95; this.vy *= 0.95;
    }
    if (a.type === 'landing' && this.horiz() === 0) { this.vx *= 0.96; }

    if (ended || (a.cancelable && t > a.cancelable)) {
      this.shieldDodging = false;
      if (this.state === 'roll' || this.state === 'spotdodge' || this.state === 'airdodge') this.invincT = Math.min(this.invincT, 2);
      this.action = null; this.actionT = 0; this.charging = false; this.chargeT = 0; this.forceRelease = false;
      this.state = this.onGround ? 'idle' : 'fall';
      return false;
    }
    return true;
  }

  smashMultiplier() {
    if (!this.action || !this.action.charge) return 1;
    const c = clamp(this.chargeT / 60, 0, 1);
    return 1 + c * 0.55;
  }

  updateSpecial(match, a, t) {
    const s = this.specialData || (this.specialData = { fired: 0, timer: 0 });
    // shadow `sp` with the move's own kind so `sp.type` means projectile/dash/etc.
    const sp = Object.assign({}, a, { type: a.specialType || a.type });
    s.timer++;
    if (['bladecombo', 'flurry', 'punchcombo', 'quake', 'risingdash'].includes(sp.type) &&
        t >= sp.startup && t < sp.startup + (sp.active || 1) &&
        (t - sp.startup) % (sp.rehit || 99) === 0) {
      if (sp.type === 'quake') {
        // The visual pulse follows the wider ground hitbox, without covering the playfield.
        match.fx.ring(this.x + this.facing * 50 * this.scale, this.y - 8, this.pal.accent, 110 * this.scale, 16);
        match.fx.dust(this.x + this.facing * 120 * this.scale, this.y, 6, this.pal.accent);
        match.fx.dust(this.x - this.facing * 30 * this.scale, this.y, 6, this.pal.accent);
        match.cam.shake(5);
      }
      else match.fx.arc(this.x + this.facing * 25, this.y - 55, -0.6 * this.facing, this.pal.accent, sp.type === 'bladecombo' ? 70 : 45, 10, this.facing);
    }
    switch (sp.specialKey) {
      case 'n': {
        if (sp.type === 'huntermissiles' && s.fired < 2 && t >= sp.startup + s.fired * 5) {
          if (s.fired === 0) {
            s.lockTarget = this.vectorLockT > 0 ? this.vectorLockTarget : null;
            this.vectorLockTarget = null; this.vectorLockT = 0;
          }
          const i = s.fired++;
          const x = this.x + this.facing * 23 * this.scale, y = this.y - (86 - i * 14) * this.scale;
          match.spawnProjectile({owner:this, x, y, vx:this.facing * sp.missileSpeed, vy:i ? 2 : -2,
            kind:'hunterMissile', target:s.lockTarget, boosted:!!s.lockTarget,
            speed:sp.missileSpeed, turnRate:s.lockTarget ? .075 : .035,
            life:sp.missileLife, damage:sp.damage, bkb:sp.bkb, kbs:sp.kbs,
            angle:this.facing < 0 ? 180-sp.angle : sp.angle, color:this.pal.accent, size:9});
          match.fx.muzzle(x, y, this.pal.accent, this.facing); AUDIO.sfx('shoot');
        }
        if (sp.type === 'tidewave' && t >= sp.startup && !s.projFired) {
          s.projFired = true;
          match.spawnProjectile({ owner:this, x:this.x + this.facing * 55 * this.scale, y:this.y,
            vx:this.facing * sp.waveSpeed, vy:0, kind:'tidewave',
            surface:this.onGround ? (this.onPlatform || match.stage.ground) : null,
            life:sp.waveLife || sp.minWaveLife, fadeFrames:18, rehit:sp.rehit,
            damage:sp.damage, bkb:sp.bkb, kbs:sp.kbs,
            angle:this.facing < 0 ? 180-sp.angle : sp.angle, color:this.pal.accent });
          match.fx.waterSplash(this.x, this.y, 1, this.pal.accent);
          AUDIO.sfx('shoot');
        }
        if (sp.type === 'soulreap' && t >= sp.startup && !s.projFired) {
          s.projFired = true;
          const power = clamp(((sp.chargeMultiplier || 1) - 1) / (sp.chargeMax - 1), 0, 1);
          const x = this.x + this.facing * 25 * this.scale, y = this.y - 62 * this.scale;
          match.spawnProjectile({ owner: this, x, y, vx: this.facing * sp.projectileSpeed,
            damage: sp.damage, bkb: sp.bkb, kbs: sp.kbs,
            angle: this.facing < 0 ? 180 - sp.angle : sp.angle,
            life: sp.projectileLife, color: this.pal.accent,
            size: (13 + 8 * power) * this.scale, kind: 'soulblast',
            chargePower: power, healOnHit: sp.healOnHit });
          match.fx.muzzle(x, y, this.pal.accent, this.facing);
          match.fx.ring(x, y, this.pal.accent, (35 + 25 * power) * this.scale, 12);
          AUDIO.sfx('shoot');
        }
        if (sp.type === 'starfall' && s.fired < 3 && t >= sp.startup + s.fired * 6) {
          const i = s.fired++;
          const x = this.x + this.facing * (85 + i * 45) * this.scale;
          match.spawnProjectile({ owner: this, x, y: this.y - 175 * this.scale, vx: this.facing * 1.2, vy: 8,
            damage: sp.damage, bkb: sp.bkb, kbs: sp.kbs, angle: this.facing < 0 ? 180 - sp.angle : sp.angle, life: 28,
            color: this.pal.accent, size: 10, kind: 'fallingStar' });
          match.fx.burst(x, this.y - 175 * this.scale, this.pal.accent, 6, 2);
          AUDIO.sfx('shoot');
        }
        if (sp.type === 'projectile' && t >= sp.startup && !s.projFired) { s.projFired = true;
          match.spawnProjectile({
            owner: this, x: this.x + this.facing * 26, y: this.y - 56,
            vx: this.facing * (sp.big ? 7.5 : 9), damage: sp.damage, bkb: sp.bkb, kbs: sp.kbs, angle: sp.angle,
            life: 80, color: this.pal.accent, size: sp.big ? 15 : 10, kind: 'bolt', pierce: sp.pierce,
            burst: sp.burst || 1, spread: sp.spread || 1,
          });
          AUDIO.sfx('shoot');
          match.fx.muzzle(this.x + this.facing * 30, this.y - 56, this.pal.accent, this.facing);
        }
        if (sp.type === 'orb' && t >= sp.startup && !s.orbFired) { s.orbFired = true;
          match.spawnProjectile({
            owner: this, x: this.x + this.facing * 40, y: this.y - 60,
            vx: this.facing * 1.2, damage: sp.damage, bkb: sp.bkb, kbs: sp.kbs, angle: sp.angle,
            life: 110, color: this.pal.accent, size: 26, kind: 'orb', pull: 1, static: true,
          });
          AUDIO.sfx('shoot');
        }
        break;
      }
      case 's': {
        if (sp.type === 'risingdash' && t >= sp.startup && !s.dashFired) {
          s.dashFired = true;
          this.vx = this.facing * 9; this.vy = -7;
          this.onGround = false; this.onPlatform = null;
          this.action.slide = sp.dist; this.action.slideFrom = this.x;
          match.fx.speedLines(this); match.fx.burst(this.x, this.y - 35, this.pal.accent, 12);
          AUDIO.sfx('swing');
        }
        if (sp.type === 'dash' && t >= sp.startup && !s.dashFired) { s.dashFired = true;
          this.vx = this.facing * (sp.rushSpeed || 12); this.vy = sp.float ? -1.4 : 0;
          // the rush is now allowed to actually go somewhere: `dist` is its budget
          this.action.slide = sp.dist || 150; this.action.slideFrom = this.x;
          this.invincT = Math.max(this.invincT, sp.rushInvuln || 6);
          if (this.key === 'grim') match.fx.dust(this.x, this.y, 10, this.pal.accent);
          if (this.key === 'astra') match.fx.burst(this.x, this.y - 45, this.pal.accent, 10, 3);
          AUDIO.sfx('dodge');
          match.fx.speedLines(this);
        }
        // Overdrive's back-mounted rockets fire rearward as the existing dash
        // accelerates. They are thrust visuals; the charge remains the hitbox.
        if (sp.rocketRush && t >= sp.startup && t < sp.startup + sp.active &&
            (t - sp.startup) % 5 === 0) {
          const x = this.x - this.facing * 29 * this.scale;
          const y = this.y - (76 + ((t - sp.startup) / 5 % 2) * 12) * this.scale;
          match.fx.particle({x, y, vx:-this.facing * 8, vy:0, life:22, size:8 * this.scale,
            color:this.pal.accent, grav:0, drag:1, shape:'rushRocket'});
          match.fx.muzzle(x, y, this.pal.accent, -this.facing);
          if (t === sp.startup) AUDIO.sfx('shoot');
        }
        if (sp.type === 'teleport' && t >= sp.startup && !s.tpFired) { s.tpFired = true;
          const px = this.x;
          const nx = clamp(this.x + this.facing * sp.dist, match.blast.left + 40, match.blast.right - 40);
          match.fx.burst(this.x, this.y - 50, this.pal.accent, 18);
          this.x = nx;
          this.invincT = Math.max(this.invincT, 8);
          match.fx.burst(this.x, this.y - 50, this.pal.accent, 18);
          AUDIO.sfx('dodge');
          /* Hit along the path, not at the landing point.  A single blast at the exit
             meant "Blink through foes" only ever hit whoever stood where Vesper arrived:
             a foe at arm's length — the range you actually blink *through* — took nothing,
             because the exit was 190px past them.  The segment is measured here rather than
             by two `aoeHit` calls so a target in the middle of the blink is cut once. */
          this.pathHit(match, px, nx, sp);
        }
        if (sp.type === 'lasso' && t >= sp.startup && !s.lassoFired) { s.lassoFired = true;
          match.spawnProjectile({ owner: this, x: this.x + this.facing * 26, y: this.y - 56, vx: this.facing * 14, damage: sp.damage, bkb: sp.bkb, kbs: sp.kbs, angle: sp.angle, life: 22, color: this.pal.accent, size: 9, kind: 'lasso', pull: 1 });
          AUDIO.sfx('shoot');
        }
        break;
      }
      case 'u': {
        if (sp.type === 'recover') {
          // Tide's wave gathers and circles first. Slow a downward fall during
          // that brief windup so the visual does not cost her the recovery.
          if (this.key === 'tide' && t < sp.startup && !this.onGround) this.vy = Math.min(this.vy, 1);
          // rise during early frames
          if (t >= sp.startup && t < sp.startup + 20) {
            this.vy = -sp.rise * (1 - (t - sp.startup) / 26);
            this.vx = lerp(this.vx, this.horiz() * sp.drift + this.facing * sp.drift * 0.4, 0.25);
            this.hitstun = 0;
            // Two shoulder-mounted rockets fire straight down as the boost starts.
            if (sp.rocketBoost && (t === sp.startup || t === sp.startup + 8)) {
              const x = this.x - this.facing * (t === sp.startup ? 22 : 32) * this.scale;
              const y = this.y - 82 * this.scale;
              match.spawnProjectile({owner:this,x,y,vx:0,vy:12,kind:'boostRocket',size:8,
                life:100,radius:sp.rocketRadius,damage:sp.damage,bkb:sp.bkb,kbs:sp.kbs,angle:sp.angle,color:this.pal.accent});
              match.fx.burst(x,y,this.pal.accent,8,3);
              AUDIO.sfx('shoot');
            }
            if (t === sp.startup) {
              if (this.key !== 'tide') match.fx.ring(this.x, this.y - 30, this.pal.accent, this.key === 'grim' ? 75 : 48, 15);
              if (this.key === 'valor' || this.key === 'vesper') match.fx.arc(this.x, this.y - 60, -Math.PI / 2, this.pal.accent, 55, 13, this.facing);
              if (this.key === 'grim') match.fx.burst(this.x, this.y, this.pal.accent, 18, 5);
            }
            if (this.key === 'tide' && (t - sp.startup) % 4 === 0)
              match.fx.waterSplash(this.x, this.y + 4 * this.scale, .55, this.pal.accent);
            if (this.key !== 'tide' && !sp.rocketBoost && (t - sp.startup) % 4 === 0) {
              match.fx.particle({ x: this.x + rand(-10, 10), y: this.y - 10, vx: rand(-1, 1), vy: rand(1, 3), life: 15, size: this.key === 'grim' ? 6 : 3, color: this.pal.accent, grav: 0, shape: this.key === 'grim' ? 'shard' : 'spark' });
              // A short energy line reads as Rook's drone assist, not a stage tether.
              if (this.key === 'rook') match.fx.lines.push({ x1: this.x, y1: this.y - 55, x2: this.x + this.facing * 18, y2: this.y - 135, color: this.pal.accent, w: 3, life: 5, t: 0 });
            }
          }
          if (sp.spinAxe) {
            // Collision is resolved by the normal active-box path above, once
            // per opponent, for the whole rising spin (including behind us).
            if (t >= sp.startup && t < sp.startup + sp.active && (t - sp.startup) % 5 === 0) {
              match.fx.arc(this.x, this.y - 57 * this.scale,
                -Math.PI / 2 + (t - sp.startup) * TAU / sp.active * this.facing,
                this.pal.accent, 72 * this.scale, 9, this.facing);
              if (t === sp.startup) AUDIO.sfx('swing');
            }
          } else if (sp.ascentCombo) {
            this.updateAscentCombo(match, sp, t, s);
          } else if (!sp.rocketBoost && !sp.hitboxes && t >= sp.startup + 2 && !s.riseHit) { s.riseHit = true;
            match.aoeHit(this, this.x, this.y - 70, 62, sp.damage, sp.bkb, sp.kbs, sp.angle);
            AUDIO.sfx('swing');
            match.fx.burst(this.x, this.y - 40, this.pal.accent, 14);
          }
        }
        if (sp.type === 'teleport' && t >= sp.startup && !s.tpFired) { s.tpFired = true;
          const up = sp.dist || 200;
          match.fx.burst(this.x, this.y - 50, this.pal.accent, 20);
          this.y = Math.max(match.blast.top + 80, this.y - up);
          this.vy = -2; this.vx = this.horiz() * 4;
          this.invincT = Math.max(this.invincT, 10);
          match.fx.burst(this.x, this.y - 50, this.pal.accent, 20);
          match.fx.ring(this.x, this.y - 50, this.pal.accent, 58, 16);
          // The blink's authored hit lands at the arrival point once, using the
          // same team, invincibility, and shield checks as other area attacks.
          match.aoeHit(this, this.x, this.y - 50, 55, sp.damage, sp.bkb, sp.kbs, sp.angle);
          AUDIO.sfx('dodge');
        }
        break;
      }
      case 'd': {
        if (sp.type === 'targetlock' && t >= sp.startup && !s.lockFired) {
          s.lockFired = true;
          let best = null, distance = sp.range;
          for (const other of match.fighters) {
            if (other === this || other.eliminated || other.state === 'respawn' || match.sameTeam(this, other)) continue;
            const dx = other.x - this.x, dy = other.y - this.y;
            const d = Math.hypot(dx, dy);
            if (dx * this.facing >= 0 && d < distance) { best = other; distance = d; }
          }
          this.vectorLockTarget = best; this.vectorLockT = best ? sp.lockDuration : 0;
          if (best) { match.fx.ring(best.x, best.y - 55 * best.scale, this.pal.accent, 65, 22); AUDIO.sfx('beep'); }
          else match.fx.ring(this.x + this.facing * 50, this.y - 55, this.pal.accent, 32, 12);
        }
        if (sp.type === 'orb' && t >= sp.startup && !s.orbFired) {
          s.orbFired = true;
          match.spawnProjectile({ owner: this, x: this.x + this.facing * 50, y: this.y - 60,
            damage: sp.damage, bkb: sp.bkb, kbs: sp.kbs, angle: sp.angle, life: 110,
            color: this.pal.accent, size: 26, kind: 'orb', pull: 1, static: true });
          match.fx.ring(this.x + this.facing * 50, this.y - 60, this.pal.accent, 45, 15);
          AUDIO.sfx('shoot');
        }
        if (sp.type === 'counter') {
          this.counterActive = t <= sp.window;
          if (this.counterHit) {
            // triggered
            const atk = this.counterHit;
            match.counterAttack(this, atk);
            this.counterHit = null; this.counterActive = false;
            this.actionT = sp.frames;
          }
        }
        if (sp.type === 'mine' && t >= sp.startup && !s.mineFired) { s.mineFired = true;
          match.spawnMine(this, this.x, this.y, sp.damage, sp.bkb, sp.kbs, sp.angle);
          AUDIO.sfx('itemSpawn');
        }
        break;
      }
    }
  }

  // Skyward Ascent only follows up on fighters struck by its opening hit. Each
  // follow-up rechecks range, shields, invulnerability and teams; nobody is pinned
  // or teleported, and the fixed schedule ends naturally if Valor is interrupted.
  updateAscentCombo(match, sp, t, s) {
    const cfg = sp.ascentCombo, start = sp.startup + 2;
    if (t === start && !s.riseHit) {
      s.riseHit = true; s.riseTargets = [];
      for (const target of match.fighters) {
        if (target === this || target.eliminated || target.invincible || match.sameTeam(this, target)) continue;
        const hb = target.hurtbox;
        if (Math.hypot(hb.x + hb.w / 2 - this.x, hb.y + hb.h / 2 - (this.y - 55 * this.scale)) >= 90) continue;
        if (target.shieldHP > 0) { match.shieldHit(this, target, cfg.opening, null); continue; }
        if (target.counterActive) { target.counterHit = this; target.counterActive = false; continue; }
        s.riseTargets.push(target);
        match.hitFighter(this, target, { damage: cfg.opening, bkb: 17, kbs: 4, angle: 90 });
      }
      AUDIO.sfx('swing');
      match.fx.burst(this.x, this.y - 40, this.pal.accent, 14);
    }
    const phase = t === start + cfg.interval ? 1 : t === start + cfg.interval * 2 ? 2 : 0;
    if (!phase || !s.riseTargets || !s.riseTargets.length) return;
    for (const target of s.riseTargets) {
      if (target.eliminated || target.invincible || match.sameTeam(this, target)) continue;
      const hb = target.hurtbox;
      if (Math.hypot(hb.x + hb.w / 2 - this.x, hb.y + hb.h / 2 - (this.y - 55 * this.scale)) >= cfg.reach) continue;
      const damage = phase === 1 ? cfg.follow : cfg.finish;
      if (target.shieldHP > 0) { match.shieldHit(this, target, damage, null); continue; }
      if (target.counterActive) { target.counterHit = this; target.counterActive = false; continue; }
      match.hitFighter(this, target, { damage, bkb: phase === 1 ? 17 : sp.bkb,
        kbs: phase === 1 ? 4 : sp.kbs, angle: phase === 1 ? 90 : (this.facing < 0 ? 180 - sp.angle : sp.angle) });
    }
    match.fx.arc(this.x, this.y - 65, -Math.PI / 2, this.pal.accent, 55 + phase * 7, 10, this.facing);
    AUDIO.sfx('swing');
  }

  /* The rectangles that are live on THIS tick, in world space, already mirrored by
     facing and scaled by the fighter's size.  Empty unless the active window is
     open right now.

     Kept as its own method so the film tool (tools/film.js) and any future debug
     overlay read the same boxes the engine resolves damage against, instead of
     reimplementing the maths and drifting.  Box windows are absolute actionT
     ticks (`b.t0`/`b.t1` are offsets into the active window), and `Sprites.attackBox`
     is what lets the drawn art widen a box: the hitbox and the picture come from
     the one measurement, so they cannot disagree. */
  activeBoxes() {
    const a = this.action;
    if (!a || !a.hitboxes) return [];
    const t = this.actionT - a.startup;
    if (t < 0 || t >= (a.active || 1)) return [];
    const anim = (a.type === 'move' && typeof Sprites !== 'undefined' && Sprites.atlas && Sprites.atlas(this.key))
      ? Sprites.MOVE_ANIM[a.key] : null;
    const sel = anim ? Sprites.pickAnim(this, 0) : null;
    const s = this.scale;
    const out = [];
    for (const b of a.hitboxes) {
      const w0 = b.t0 || 0;
      const w1 = b.t1 === undefined ? 99 : b.t1;
      if (t < w0 || t > w1) continue;
      let r = { x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.h, art: null };
      /* The art may only ever EXTEND a hitbox, at the edges where the drawing
         leaves the resting silhouette — never carve a hole in the authored one. */
      if (sel && Sprites.attackBox) r = Object.assign(r, Sprites.attackBox(this.key, anim, sel.i, b));
      out.push({
        box: {
          x: this.facing > 0 ? this.x + r.x0 * s : this.x - r.x1 * s,
          y: this.y + r.y0 * s, w: (r.x1 - r.x0) * s, h: (r.y1 - r.y0) * s,
        },
        art: r.art, b,
      });
    }
    return out;
  }

  /* `Match.aoeHit`, swept: the same radius measured against the nearest point of the
     line the fighter blinked along, instead of against its end.  One pass over the
     targets, so a fighter standing mid-path is cut once and not twice, and the same
     guards everything else uses (team, elimination, invincibility, shield). */
  pathHit(match, x0, x1, sp, radius = 70) {
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    for (const t of match.fighters) {
      if (t === this || t.eliminated || match.sameTeam(this, t)) continue;
      if (t.invincible) continue;
      const dx = t.x - clamp(t.x, lo, hi);
      if (Math.hypot(dx, (t.y - 50) - (this.y - 50)) >= radius + 22) continue;
      if (t.shieldHP > 0) { match.shieldHit(this, t, sp.damage, null); continue; }
      match.hitFighter(this, t, { damage: sp.damage, bkb: sp.bkb, kbs: sp.kbs, angle: sp.angle });
    }
  }

  /* Resolve one tick of the active window against every eligible target. */
  checkHit(match, mult = 1, staleKey = null) {
    const a = this.action;
    const live = this.activeBoxes();
    if (!live.length) return;
    for (const { box } of live) {
      for (const target of match.fighters) {
        if (target === this || target.eliminated) continue;
        if (match.sameTeam(this, target)) continue;
        if (this.rehitBlocked(target, a)) continue;
        if (target.invincible) continue;
        /* A move may only spend the hits it was authored with on one target, and
           that is a loop-breaker rather than flavour: every hit refreshes hitlag,
           hitlag freezes `actionT`, and `active` is counted in `actionT` — so the
           window of a two-hit flurry never advances far enough to close, the rehit
           gap re-arms a tick later, and the two fighters juggle each other in place
           forever.  A CPU 4-player match spent 1232 frames (20 seconds, 40 hits)
           locked exactly like that with nobody able to move.

           It is spent on a target the box actually *touches*, which is why the overlap is
           tested first: charged before the geometry was consulted, the cap let the first
           live tick of a travelling hitbox burn the only hit a dash or a rush special is
           authored with, two ticks short of anybody, and the move then walked through its
           target with 0% on it.  A standing jab cannot show that — its box is live for
           three ticks and either overlaps on the first one or never does. */
        if (!aabb(box, target.hurtbox)) continue;
        const cap = 1 + (a.multi || 0);
        const spent = (this.hitCount && this.hitCount.get(target.id)) || 0;
        if (spent >= cap) continue;
        if (this.hitCount) this.hitCount.set(target.id, spent + 1);
        const hit = a.finish && spent === (a.multi || 0) ? a.finish : a;
        // shield?
        if (target.shieldHP > 0 && !a.grab) {
          this.hitIds.set(target.id, this.actionT);
          match.shieldHit(this, target, hit.damage, box);
          continue;
        }
        if (target.counterActive) {
          target.counterHit = this; target.counterActive = false;
          this.hitIds.set(target.id, this.actionT);
          continue;
        }
        this.hitIds.set(target.id, this.actionT);
        // a special has no `key` of its own, and inheriting 'jab' here would make a
        // rush grind down the stale multiplier of the jab it was never part of
        const sk = staleKey || a.key || 'jab';
        const stale = this.staleMult(sk);
        this.pushStale(sk);
        // The new signature attacks use facing-relative launch angles, just as
        // their hitboxes mirror. A left-facing strike must launch left, not right.
        const signature = a.finish || a.key === 'dashattack' ||
          (a.type === 'special' && ['bladecombo', 'flurry', 'punchcombo', 'quake', 'risingdash', 'dash', 'soulreap'].includes(a.specialType));
        const launchLeft = a.specialType === 'quake' ? target.x < this.x : this.facing < 0;
        const hitAngle = signature && launchLeft ? 180 - hit.angle : hit.angle;
        match.hitFighter(this, target, {
          damage: (hit.damage + (hit === a ? 0 : (a.itemDamageBonus || 0))) * mult * stale,
          bkb: hit.bkb, kbs: hit.kbs, angle: hitAngle, spike: a.spike,
          heavy: a.charge ? 1 : 0, smashMult: mult,
        });
      }
      // hit items too
      match.itemsHitByAttack(this, box, a.damage);
    }
  }

  /* One target per hit unless the move is a multi-hit: then the same fighter can
     be hit again once `rehit` ticks have passed (data.js derives that spacing from
     the authored hit count, so a flurry actually flurries). */
  rehitBlocked(target, a) {
    const last = this.hitIds.get(target.id);
    if (last === undefined) return false;
    const gap = a.rehit || 1e9;
    return (this.actionT - last) < gap;
  }

  /* ---------------- damage ---------------- */
  takeDamage(dmg, attacker, match, opts = {}) {
    if (this.invincible && !opts.ignoreInv) return;
    this.damage = Math.min(999, this.damage + dmg);
    this.stats.taken += dmg;
    if (attacker && attacker !== this) attacker.stats.dealt += dmg;
    if (!opts.ignoreKB) {
      // GDD formula: kb = base + scaling * damage%
      const weightFactor = Math.pow(100 / this.weight, 0.62);
      const kb = (opts.bkb || 6 + (opts.kbs || 30) * 0) ;
      // handled by match.hitFighter
    }
    if (dmg >= 1) this.flashT = 6;
  }

  /* ---------------- ledge ---------------- */
  /* A ledge is the deck FACE, so it can only be caught from outside it.  The old
     test was a 30px window around the face with no side preference, so a fighter
     the crowd solver had merely shoved a few pixels past gd.x — still standing
     over solid floor, never off-stage — was snapped into a ledge-hang nobody asks
     for.  In 4-player that was the whole "my character gets stuck on the sides". */
  tryLedgeGrab(match) {
    if (this.ledgeCD > 0 || this.state === 'ledge' || this.onGround || this.hitstun > 0 ||
        this.grabbedBy || this.eliminated || this.input.down || match.stage.ledges === false) return false;
    // A rising recovery can catch the lip from below, while a normal rising
    // jump stays free of accidental snaps on its way up.
    const risingRecovery = this.state === 'special' && this.action && this.action.specialKey === 'u';
    if (this.vy < -1 && !risingRecovery) return false;
    const gd = match.stage.ground;
    for (const e of [{ side: -1, x: gd.x }, { side: 1, x: gd.x + gd.w }]) {
      // Feet can be a body length below the lip, but never over solid deck.
      if (this.y < gd.y - 30 || this.y > gd.y + 90 * this.scale) continue;
      const beyond = e.side < 0 ? gd.x - this.x : this.x - (gd.x + gd.w);
      if (beyond < LEDGE_OUTSIDE || beyond > 48 * this.scale + LEDGE_OUTSIDE) continue;
      // One fighter owns each ledge; a second can't stack invisibly on top.
      if (match.fighters.some(f => f !== this && !f.eliminated && f.state === 'ledge' && f.ledge && f.ledge.side === e.side)) continue;
      this.snapLedge(match, e.side, e.x);
      return true;
    }
    return false;
  }
  snapLedge(match, side, edgeX) {
    // Preserve a fresh jump pressed during an up-special just before catching
    // the ledge. The jump used to activate jump+G was already consumed.
    const recoveryJump = this.state === 'special' && this.action && this.action.specialKey === 'u'
      ? (this.action.boostJumpQueued ? 8 : this.inputBuffer.jump) : 0;
    this.state = 'ledge'; this.stateT = 0; this.animT = 0; this.ledge = { side, x: edgeX };
    this.x = edgeX + side * 30 * this.scale; this.y = match.stage.ground.y - 8;
    this.vx = this.vy = 0; this.facing = -side; this.onGround = false; this.onPlatform = null;
    this.action = null; this.actionT = 0; this.counterActive = false; this.charging = false;
    this.ledgeInvuln = 30;
    this.jumpsLeft = this.def.stats.jumps; this.airJumpsLeft = this.def.stats.airJumps;
    this.fastfalled = false; this.usedUpB = false; this.usedAirDodge = false;
    // Don't fire a previously buffered action the moment the hang ends.
    for (const key of Object.keys(this.inputBuffer)) this.inputBuffer[key] = 0;
    this.inputBuffer.jump = recoveryJump || 0;
    match.fx.ring(edgeX, match.stage.ground.y, this.pal.accent, 24, 10);
    AUDIO.sfx('ledge');
  }
  updateLedge(match) {
    const inp = this.input;
    if (!this.ledge) { this.state = 'fall'; return; }
    // A press during hitlag or just before the catch must not be lost.
    if (inp.jumpP || this.buf('jump')) { this.ledgeGetup(match, 'jump'); return; }
    if (inp.attackP) { this.ledgeGetup(match, 'attack'); return; }
    if (inp.shieldP) { this.ledgeGetup(match, 'roll'); return; }
    if (inp.downP) {
      const side = this.ledge.side;
      this.state = 'fall'; this.stateT = 0; this.vx = side * 2; this.vy = 2;
      this.ledge = null; this.ledgeInvuln = 0; this.ledgeCD = 30; return;
    }
    // Holding toward the stage or up after a short grip also climbs; this
    // lets a player continuing their recovery input get back into the fight.
    if (inp.upP || (this.stateT > 6 && (inp.up || this.horiz() === -this.ledge.side))) {
      this.ledgeGetup(match, 'climb'); return;
    }
    if (this.stateT > LEDGE_AUTO_CLIMB) {
      this.ledgeGetup(match, 'climb');
      this.ledgeCD = 12;
    }
  }
  ledgeGetup(match, kind) {
    if (!this.ledge) return;
    const gd = match.stage.ground;
    const side = this.ledge.side;
    this.ledge = null; this.ledgeCD = 24; this.ledgeInvuln = 0;
    this.facing = -side; this.stateT = 0; this.action = null; this.actionT = 0;
    if (kind === 'jump') {
      this.x = (side < 0 ? gd.x : gd.x + gd.w) + side * 20;
      this.y = gd.y - 4; this.onGround = false;
      this.vx = -side * this.def.stats.air * .7;
      this.vy = -this.def.stats.jumpV * this.jumpMul();
      this.jumpHoldT = 8; this.jumpCut = true; this.state = 'jump'; this.animT = 0;
      this.consume('jump'); AUDIO.sfx('jump');
    } else {
      this.x = side < 0 ? gd.x + 30 : gd.x + gd.w - 30;
      this.y = gd.y; this.onGround = true; this.vx = this.vy = 0;
      if (kind === 'attack') {
        this.consume('attack'); this.startAttack('jab', match);
      } else if (kind === 'roll') {
        this.consume('shield'); this.invincT = 20; this.x += side * -40;
        this.state = 'roll'; this.action = { type: 'roll', dur: 20 }; this.actionT = 0; this.rollDir = -side;
        AUDIO.sfx('dodge');
      } else {
        this.invincT = 10; this.state = 'idle';
      }
    }
    match.fx.dust(this.x, this.y, 8, '#ffffff');
  }

  /* ---------------- final smash ---------------- */
  startFinalSmash(match) {
    this.hasSmashBall = false;
    this.finalActive = this.def.finalSmash.duration;
    this.finalT = 0;
    this.invincT = 40;
    this.state = 'final';
    AUDIO.sfx('final');
    match.cam.zoomPunch(0.6);
    match.cam.shake(14);
    match.fx.finalBurst(this);
    match.announce(this.def.finalSmash.name, this.pal.accent);
  }
  updateFinalSmash(match) {
    this.finalActive--; this.finalT++;
    const fs = this.def.finalSmash;
    const t = this.finalT;
    this.vx *= 0.96;
    // a grounded final smash hovers: never sink through the deck
    const grounded = this.onGround || this.onPlatform;
    if (grounded) { this.vy = 0; }
    else { this.vy = Math.min(this.vy + 0.2, 3); }
    this.x += this.vx; this.y += this.vy;
    // hard floor guard for every surface we could be standing on
    const gd = match.stage.ground;
    if (this.x > gd.x - 16 && this.x < gd.x + gd.w + 16 && this.y > gd.y) {
      this.y = gd.y; this.vy = 0; this.onGround = true;
    }
    if (this.onPlatform) {
      const p = this.onPlatform;
      const py = p.cy !== undefined ? p.cy : p.y;
      if (this.y > py) { this.y = py; this.vy = 0; }
    }
    // damage pulses
    const pulseRate = 10;
    if (fs.type === 'barrage') {
      if (t % 15 === 0 && t <= fs.duration - 30) {
        for (const side of [-1, 1]) match.spawnProjectile({owner:this,
          x:this.x + side*20*this.scale, y:this.y - 85*this.scale,
          vx:side*9, vy:-1, kind:'hunterMissile', speed:9, turnRate:.055, life:80,
          damage:fs.damage/16, bkb:12, kbs:30, angle:side<0?135:45, color:this.pal.accent, size:9, final:1});
        match.fx.finalPulse(this, t); AUDIO.sfx('shoot');
      }
    } else if (t % pulseRate === 0 && t < fs.duration - 30) {
      match.aoeHit(this, this.x, this.y - 60, 240, fs.damage / (fs.duration / pulseRate - 3), 12, 30, 45, { final: 1 });
      match.fx.finalPulse(this, t);
      if (t % (pulseRate * 3) === 0) AUDIO.sfx('hit', { power: 0.5 });
    }
    if (this.finalActive <= 0) {
      this.finalActive = 0; this.state = 'idle';
      this.invincT = 10;
      match.cam.zoomPunch(0.3);
    }
  }

  checkBlastNow(match) {
    const b = match.blast;
    if (this.x < b.left || this.x > b.right || this.y < b.top || this.y > b.bottom) {
      match.koFighter(this, this.lastHitBy);
      return true;
    }
    return false;
  }

  /* ---------------- KO ---------------- */
  checkBlast(match) {
    const b = match.blast;
    if (this.x < b.left || this.x > b.right || this.y < b.top || this.y > b.bottom) {
      match.koFighter(this, this.lastHitBy);
      return true;
    }
    // ledge grab attempt
    if (!this.onGround && this.state !== 'ledge' && this.ledgeCD === 0) this.tryLedgeGrab(match);
    return false;
  }

  die(match, killer, opts = {}) {
    if (this.isMob && match.multiman) match.multiman.kos = (match.multiman.kos || 0) + 1;
    this.stocks--;
    this.stats.falls++;
    if (!killer || killer === this) this.stats.sd++;
    if (killer && killer !== this) killer.stats.kos++;
    this.eliminated = this.stocks <= 0;
    this.damage = 0;
    this.hitstun = 0; this.state = 'respawn'; this.respawnT = 110;
    // respawn above this fighter's own spawn slot, not the stage centre
    const gd0 = match.stage.ground;
    this.x = clamp(this.spawnX !== undefined ? this.spawnX : 0, gd0.x + 120, gd0.x + gd0.w - 120);
    this.y = WORLD.respawnY;
    this.vx = this.vy = 0;
    if (this.held) { this.held.heldBy = null; this.held.dead = true; this.held = null; }
    this.hasSmashBall = false;
    this.buffs = { star: 0, mushroom: 0, poison: 0, metal: 0, bunny: 0, flower: 0 };
    this.grabbedBy = null; this.grabbing = null;
    this.ledge = null; this.finalActive = 0; this.hazardCD = 0; this.itemCd = 0;
    this.vectorLockTarget = null; this.vectorLockT = 0;
    this.action = null;
    this.respawnPlatformT = 70;
  }
  updateRespawn(match) {
    const gd = match.stage.ground;
    this.x = clamp(this.x, gd.x + 80, gd.x + gd.w - 80);
    this.y = WORLD.respawnY;
    this.vy = 0; this.vx = 0;
    if (this.respawnT <= 0) {
      // drop out of the respawn bubble onto the stage
      this.state = 'fall'; this.onGround = false; this.onPlatform = null;
      this.vy = 2.4; this.spawnProtect = 90; this.respawnPlatformT = 0; this.respawnDropT = 120;
      AUDIO.sfx('respawn');
    }
  }
}

Fighter.prototype.id = 0;
let __fid = 1;
