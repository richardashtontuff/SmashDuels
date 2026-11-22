/* ============================================================
   RIFT RUMBLE — items, projectiles, effects
   ============================================================ */
'use strict';

/* Stylized curling water: shared by Tide's ground wave and rising recovery.
   Draw relative to a baseline, facing right; callers own transforms and alpha. */
function drawWaterCrest(ctx, width, height, phase) {
  ctx.save(); ctx.scale(width / 140 * (1 + .025 * Math.sin(phase * .19)),
                        height / 90 * (1 + .035 * Math.sin(phase * .23)));
  ctx.fillStyle = '#168bab'; ctx.strokeStyle = '#70ebf3'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-72, 0); ctx.quadraticCurveTo(-45, -9, -25, -34);
  ctx.bezierCurveTo(-4, -62, 12, -87, 40, -83);
  ctx.bezierCurveTo(63, -80, 73, -60, 62, -45);
  ctx.bezierCurveTo(55, -35, 39, -35, 31, -43);
  ctx.bezierCurveTo(48, -41, 51, -56, 39, -61);
  ctx.bezierCurveTo(24, -66, 17, -45, 34, -27);
  ctx.quadraticCurveTo(47, -10, 72, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#44cddd';
  ctx.beginPath(); ctx.moveTo(-56,-3); ctx.quadraticCurveTo(-23,-18,-9,-44);
  ctx.quadraticCurveTo(12,-78,36,-76); ctx.quadraticCurveTo(19,-64,18,-50);
  ctx.quadraticCurveTo(10,-24,48,-3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#e5ffff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(2,-58); ctx.bezierCurveTo(18,-84,43,-88,57,-73);
  ctx.bezierCurveTo(67,-62,60,-48,48,-47); ctx.stroke();
  ctx.lineWidth = 2.5; ctx.globalAlpha *= .9;
  ctx.beginPath(); ctx.moveTo(-48,-7); ctx.quadraticCurveTo(-18,-12,0,-38); ctx.stroke();
  ctx.fillStyle = '#e8ffff';
  for (let i=0;i<3;i++) { const x=-38+i*30+Math.sin(phase*.22+i)*4;
    ctx.beginPath();ctx.arc(x,-6-(i%2)*4,2.5,0,TAU);ctx.fill(); }
  ctx.restore();
}

/* ---------------- FX ---------------- */
class FXSystem {
  constructor(match) { this.match = match; this.parts = []; this.texts = []; this.rings = []; this.arcs = []; this.lines = []; }
  particle(o) {
    if (this.parts.length > 420) this.parts.shift();
    this.parts.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, life: 30, t: 0, size: 3, color: '#fff', grav: 0.2, drag: 0.97, shape: 'dot', rot: 0, vr: 0 }, o));
  }
  text(x, y, str, color, size = 26, life = 50) { const t = { x, y, str, color, size, life, t: 0 }; this.texts.push(t); return t; }
  ring(x, y, color, r = 30, life = 18) { this.rings.push({ x, y, color, r0: r * 0.25, r1: r, t: 0, life }); }
  arc(x, y, ang, color, r = 40, life = 11, facing = 1) { this.arcs.push({ x, y, ang, color, r, t: 0, life, facing }); }

  dust(x, y, n = 6, color = '#cfd8e6') {
    for (let i = 0; i < n; i++) {
      this.particle({
        x: x + rand(-14, 14), y: y - rand(0, 6),
        vx: rand(-2.2, 2.2), vy: rand(-2.4, -0.3),
        life: randInt(16, 34), size: rand(2.5, 6.5), color,
        grav: 0.06, drag: 0.94, shape: 'smoke',
      });
    }
  }
  waterSplash(x, y, power = 1, color = '#48d7df') {
    // Droplets arc out of the landing point rather than lingering as smoke.
    const n = Math.round(8 * power) + 3;
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.particle({x:x + dir * rand(2, 14), y:y - rand(0, 4),
        vx:dir * rand(.8, 3.6) * power, vy:-rand(2.2, 5.8) * power,
        life:randInt(16, 29), size:rand(2, 4.5) * power,
        color:i % 3 ? color : '#e8ffff', grav:.24, drag:.98, shape:'droplet'});
    }
  }
  burst(x, y, color, n = 14, spd = 5) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU);
      this.particle({
        x, y, vx: Math.cos(a) * rand(1, spd), vy: Math.sin(a) * rand(1, spd),
        life: randInt(14, 30), size: rand(2, 6), color, grav: 0.05, drag: 0.93, shape: 'spark',
      });
    }
  }
  hitSpark(x, y, color, power = 1, angle = 0) {
    const n = Math.round(6 + power * 12);
    for (let i = 0; i < n; i++) {
      const a = angle + rand(-1.1, 1.1) + (i % 2 ? Math.PI : 0);
      const sp = rand(3, 9 + power * 7);
      this.particle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: randInt(8, 20), size: rand(2, 4 + power * 3), color,
        grav: 0.12, drag: 0.9, shape: 'spark',
      });
    }
    this.ring(x, y, color, 26 + power * 34, 12 + power * 6);
    for (let i = 0; i < 4; i++) {
      const a = rand(TAU);
      this.particle({ x, y, vx: Math.cos(a) * rand(0.4, 1.6), vy: Math.sin(a) * rand(0.4, 1.6), life: randInt(10, 20), size: rand(10, 26), color: '#ffffff', grav: 0, drag: 0.88, shape: 'flash' });
    }
  }
  impact(x, y, color, power = 1) {
    for (let i = 0; i < 4 + power * 8; i++) {
      const a = rand(TAU);
      this.particle({ x, y, vx: Math.cos(a) * rand(1, 3 + power * 4), vy: Math.sin(a) * rand(1, 3 + power * 4), life: randInt(8, 22), size: rand(2, 5), color, grav: 0.18, drag: 0.92, shape: 'shard' });
    }
    this.ring(x, y, '#ffffff', 18 + power * 18, 10);
  }
  swoosh(f, reach) {
    const c = f.pal ? f.pal.accent : '#fff';
    this.arc(f.x + f.facing * 16 * f.scale, f.y - 58 * f.scale, f.facing > 0 ? -0.9 : Math.PI + 0.9, c, reach * f.scale, 12, f.facing);
  }
  muzzle(x, y, color, facing) {
    this.particle({ x, y, vx: facing * 3, vy: 0, life: 9, size: 22, color, grav: 0, drag: 0.8, shape: 'flash' });
    for (let i = 0; i < 5; i++) this.particle({ x, y, vx: facing * rand(1, 5), vy: rand(-1.4, 1.4), life: randInt(6, 14), size: rand(1.5, 4), color, grav: 0, drag: 0.9, shape: 'spark' });
  }
  charge(x, y, color, t) {
    const a = rand(TAU), r = 40 + Math.sin(t * 0.4) * 6;
    this.particle({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.8, vx: -Math.cos(a) * 3, vy: -Math.sin(a) * 3, life: 12, size: rand(2, 4.4), color, grav: 0, drag: 1, shape: 'spark' });
  }
  speedLines(f) {
    for (let i = 0; i < 10; i++) {
      this.particle({ x: f.x - f.facing * rand(0, 60), y: f.y - rand(10, 100), vx: -f.facing * rand(4, 10), vy: rand(-0.6, 0.6), life: randInt(8, 18), size: rand(10, 34), color: f.pal.accent, grav: 0, drag: 1, shape: 'streak' });
    }
  }
  finalBurst(f) {
    for (let i = 0; i < 40; i++) {
      const a = rand(TAU), sp = rand(2, 12);
      this.particle({ x: f.x, y: f.y - 50, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: randInt(20, 50), size: rand(2, 8), color: f.pal.accent, grav: 0.02, drag: 0.96, shape: 'spark' });
    }
    this.ring(f.x, f.y - 50, '#ffffff', 220, 30);
  }
  finalPulse(f, t) {
    const a = rand(TAU), sp = rand(5, 14);
    this.particle({ x: f.x + Math.cos(a) * 40, y: f.y - 60 + Math.sin(a) * 40, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: randInt(14, 30), size: rand(3, 7), color: f.pal.accent, grav: 0, drag: 0.95, shape: 'spark' });
    if (t % 20 === 0) this.ring(f.x, f.y - 60, f.pal.accent, 200, 24);
  }
  explode(x, y, r, color) {
    this.ring(x, y, color, r, 22);
    this.ring(x, y, '#ffffff', r * 0.55, 14);
    for (let i = 0; i < 26; i++) {
      const a = rand(TAU), sp = rand(2, r * 0.09);
      this.particle({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: randInt(16, 40), size: rand(3, 9), color: i % 3 ? color : '#ffffff', grav: 0.1, drag: 0.94, shape: 'smoke' });
    }
  }
  update() {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.t++;
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.t >= p.life) this.parts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.t++; if (r.t >= r.life) this.rings.splice(i, 1); }
    for (let i = this.arcs.length - 1; i >= 0; i--) { const a = this.arcs[i]; a.t++; if (a.t >= a.life) this.arcs.splice(i, 1); }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.t++; t.y -= 0.8; if (t.t >= t.life) this.texts.splice(i, 1); }
    for (let i = this.lines.length - 1; i >= 0; i--) { const l = this.lines[i]; l.t++; if (l.t >= l.life) this.lines.splice(i, 1); }
  }
  draw(ctx, cam) {
    ctx.save();
    // streaks / arcs
    for (const l of this.lines) {
      const k = l.t / l.life;
      ctx.globalAlpha = (1 - k) * 0.75;
      ctx.strokeStyle = l.color; ctx.lineWidth = l.w || 3;
      ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    }
    for (const a of this.arcs) {
      const k = a.t / a.life;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 8 * (1 - k) + 2;
      ctx.lineCap = 'round';
      const spread = 1.5;
      const a0 = a.ang - spread / 2 + k * 0.4 * a.facing;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r * (0.7 + k * 0.35), a0, a0 + spread); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.strokeStyle = r.color; ctx.lineWidth = 3 + (1 - k) * 4;
      ctx.beginPath(); ctx.arc(r.x, r.y, lerp(r.r0, r.r1, k), 0, TAU); ctx.stroke();
    }
    for (const p of this.parts) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = clamp(k, 0, 1);
      ctx.fillStyle = p.color;
      switch (p.shape) {
        case 'spark': {
          ctx.save(); ctx.translate(p.x, p.y);
          const a = Math.atan2(p.vy, p.vx);
          ctx.rotate(a); ctx.fillRect(-p.size * 2.2, -p.size * 0.4, p.size * 4.4, p.size * 0.8);
          ctx.restore(); break;
        }
        case 'droplet': {
          ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx)+Math.PI/2);
          ctx.beginPath();ctx.ellipse(0,0,p.size*.6,p.size*1.15,0,0,TAU);ctx.fill();ctx.restore();break;
        }
        case 'smoke': ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, TAU); ctx.fill(); break;
        case 'flash': {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); break;
        }
        case 'shard': {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.t * 0.2);
          ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.6, p.size); ctx.lineTo(-p.size * 0.6, p.size * 0.6); ctx.closePath(); ctx.fill();
          ctx.restore(); break;
        }
        case 'streak': {
          ctx.save(); ctx.translate(p.x, p.y); ctx.fillRect(0, -p.size * 0.08, p.size, p.size * 0.16); ctx.restore(); break;
        }
        default: ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k, 0, TAU); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      const k = t.t / t.life;
      ctx.globalAlpha = clamp(1.4 - k * 1.6, 0, 1);
      ctx.font = `900 ${t.size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  }
}

/* ---------------- Item ---------------- */
class Item {
  constructor(type, x, y, match) {
    this.type = type; this.def = ITEMS[type]; this.match = match;
    this.x = x; this.y = y; this.vx = rand(-2, 2); this.vy = -3;
    this.rot = 0; this.vr = rand(-0.1, 0.1);
    this.life = 900; this.onGround = false; this.onPlatform = null; this.heldBy = null;
    this.hp = this.def.hp || 0;
    this.w = 26; this.h = 26;
    this.bobT = rand(100);
    this.spawnT = 40;
    this.cooldown = 0;
  }
  get box() { return { x: this.x - 15, y: this.y - 15, w: 30, h: 30 }; }
  /* The holder's hand, in world space.
     This used to be a flat `22px out, 62px up` — which is about right for one fighter
     and wrong for the rest, since the offset never followed scale. Deriving it from the
     holder's own hurtbox puts a sword at knuckle height on a 132px giant as well as on
     a 108px one, which is most of what "sits properly in the hand" means. */
  handPoint(f) {
    // The hurtbox is already scale-corrected by the fighter, so it must not be
    // multiplied by f.scale again here — doing that put Grim's sword at the top of
    // his head instead of his hand, because his hurtbox is 151px to everyone else's
    // ~110.  0.60 of that height is the knuckle line for every key in the roster.
    const hb = f.hurtbox || null;                       // a getter, and pose-dependent
    const hw = hb ? hb.w : 44, hh = hb ? hb.h : 92;
    return {
      x: f.x + f.facing * (hw * 0.5 + 6),
      y: f.y - hh * 0.60 + Math.sin((((this.match && this.match.time) || 0) + this.bobT) * 0.07) * 1.4,
    };
  }
  /* An item in hand swings with the attack that is using it, and sags to the hip
     otherwise. Without this a held Beamsword stays bolt upright through a full
     overhead swing, which is what made held items look pasted on. */
  heldAngle(f) {
    const a = f.action;
    if (a && a.type === 'move' && a.dur > 0) {
      const p = Math.max(0, Math.min(1, f.actionT / a.dur));
      return (Math.sin(p * Math.PI * 1.0) * 1.25 - 0.42) * f.facing;
    }
    return -0.28 * f.facing;
  }
  update(match) {
    if (this.spawnT > 0) this.spawnT--;
    if (this.cooldown > 0) this.cooldown--;
    if (this.heldBy) {
      const f = this.heldBy;
      if (this.type === 'hammer') {
        if (this.heldTime === undefined) this.heldTime = this.def.dur;
        if (--this.heldTime <= 0) { f.held = null; this.heldBy = null; this.dead = true; return; }
      }
      const hp = this.handPoint(f);
      this.x = hp.x;
      this.y = hp.y;
      this.rot = this.heldAngle(f);
      this.vx = this.vy = 0;
      // not resting on anything any more: leaving onGround set made the deck bob and
      // the floor-following checks apply to an item in someone's hand
      this.onGround = false; this.onPlatform = null;
      return;
    }
    this.life--;
    const gd = match.stage.ground;
    if (!this.onGround) {
      this.vy = Math.min(this.vy + 0.45, 12);
      this.x += this.vx; this.y += this.vy;
      this.rot += this.vr;
      // land on platform/ground — the deck uses the same lip the fighters do, so
      // an item can come to rest beside the stage instead of tunnelling past it
      if (this.y >= gd.y - 8 && this.x > gd.x - DECK_LIP && this.x < gd.x + gd.w + DECK_LIP) {
        this.y = gd.y - 8; this.onGround = true; this.onPlatform = null; this.vx *= 0.4; this.vy = 0;
      }
      for (const p of match.stage.platforms) {
        const px = p.cx !== undefined ? p.cx : p.x, py = p.cy !== undefined ? p.cy : p.y;
        if (this.vy > 0 && this.x > px && this.x < px + p.w && this.y > py - 6 && this.y < py + 20) {
          this.y = py - 8; this.onGround = true; this.onPlatform = p; this.vy = 0;
        }
      }
      if (this.y > match.blast.bottom) { this.dead = true; }
    } else {
      /* An item at rest has to keep checking what is under it.  It used to be
         told once that it had landed and never asked again, so a bob-omb that came
         down on the Ember Foundry lift hung in mid-air for its whole life — and on
         the way out of the pillar stage, sat on nothing at all. */
      const p = this.onPlatform;
      if (p) {
        this.x += p.dx || 0; this.y += p.dy || 0;
        const px = p.cx !== undefined ? p.cx : p.x, py = p.cy !== undefined ? p.cy : p.y;
        if (!(this.x > px && this.x < px + p.w) || Math.abs(this.y - (py - 8)) > 14) {
          this.onGround = false; this.onPlatform = null; this.vy = Math.max(this.vy, 0.4);
        }
      } else if (!(this.x > gd.x - DECK_LIP && this.x < gd.x + gd.w + DECK_LIP) || Math.abs(this.y - (gd.y - 8)) > 14) {
        this.onGround = false; this.onPlatform = null; this.vy = Math.max(this.vy, 0.4);
      }
      this.vx *= 0.9;
      this.x += this.vx;
      this.rot += this.vr * 0.4;
    }
    if (this.life < 180 && Math.floor(this.life / 6) % 2 === 0) { /* blink out */ }
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx, time) {
    const d = this.def;
    if (this.life < 180 && Math.floor(this.life / 5) % 2 === 0) return;
    const art = typeof Sprites !== 'undefined' && Sprites.itemArt ? Sprites.itemArt(this.type) : null;
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin((time + this.bobT) * 0.06) * (this.onGround ? 2 : 0));
    // glow, sized to the sprite rather than to the old 20px icon
    const gr = art ? Math.max(26, (art.w + art.h) * 0.42) : 26;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, art ? -2 : 0, 2, 0, 0, gr);
    g.addColorStop(0, withAlpha(d.color, 0.5)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, gr, 0, TAU); ctx.fill(); ctx.restore();
    if (art) {
      /* Placement, which the collision box does not describe: an item's origin is its
         centre, but it comes to rest with its origin 8px above the deck (update() snaps
         it to `gd.y - 8`), so a sprite drawn centred would sink half into the stage.
         Anchoring its bottom on that line is what makes a crate look like it is *on*
         the floor instead of stuck through it.  A held item has no floor to respect —
         it sits on the hand point and mirrors with the holder, so a sword points the
         way you are facing.  Everything in between spins, as it always did. */
      if (this.heldBy) {
        const flip = art.mirror && this.heldBy.facing < 0;
        if (flip) ctx.scale(-1, 1);
        ctx.rotate(this.rot * (flip ? -1 : 1));
        ctx.drawImage(art.img, -art.w / 2, -art.h / 2, art.w, art.h);
      } else if (this.onGround) {
        ctx.drawImage(art.img, -art.w / 2, 8 - art.h, art.w, art.h);
      } else {
        ctx.rotate(this.rot);
        ctx.drawImage(art.img, -art.w / 2, -art.h / 2, art.w, art.h);
      }
    } else {
      if (!this.heldBy) { ctx.rotate(this.rot); }
      drawItemIcon(ctx, this.type, d, 1);
    }
    ctx.restore();
    if (this.spawnT > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = this.spawnT / 40;
      ctx.strokeStyle = d.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, 40 * (1 - this.spawnT / 40) + 8, 0, TAU); ctx.stroke(); ctx.restore();
    }
  }
}

function drawItemIcon(ctx, type, d, scale = 1) {
  const S = scale;
  switch (d.icon) {
    case 'sword': {
      ctx.fillStyle = '#dfe8f5'; ctx.fillRect(-2 * S, -20 * S, 4 * S, 30 * S);
      ctx.fillStyle = d.color; ctx.fillRect(-2 * S, -20 * S, 4 * S, 10 * S);
      ctx.fillStyle = '#8a6a4a'; ctx.fillRect(-6 * S, 8 * S, 12 * S, 4 * S);
      ctx.fillStyle = '#5a4632'; ctx.fillRect(-2 * S, 12 * S, 4 * S, 8 * S);
      break;
    }
    case 'bat': {
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.moveTo(-4 * S, 10 * S); ctx.lineTo(4 * S, 10 * S); ctx.lineTo(8 * S, -18 * S); ctx.lineTo(-8 * S, -18 * S); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a6a4a'; ctx.fillRect(-3 * S, 10 * S, 6 * S, 12 * S);
      break;
    }
    case 'rod': {
      ctx.fillStyle = '#e8d8a8'; ctx.fillRect(-2 * S, -14 * S, 4 * S, 30 * S);
      ctx.fillStyle = d.color; ctx.beginPath(); star(ctx, 0, -18 * S, 8 * S); ctx.fill();
      break;
    }
    case 'bomb': {
      ctx.fillStyle = '#22283a'; ctx.beginPath(); ctx.arc(0, 2 * S, 12 * S, 0, TAU); ctx.fill();
      ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(0, 2 * S, 9 * S, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c8a06a'; ctx.fillRect(-2 * S, -14 * S, 4 * S, 8 * S);
      ctx.fillStyle = '#ff8a3a'; ctx.beginPath(); ctx.arc(0, -16 * S, 3 * S, 0, TAU); ctx.fill();
      break;
    }
    case 'shell': {
      ctx.fillStyle = '#2a8a3a'; ctx.beginPath(); ctx.ellipse(0, 0, 14 * S, 11 * S, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = d.color; ctx.beginPath(); ctx.ellipse(0, 0, 10 * S, 8 * S, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#1a5a2a'; ctx.lineWidth = 2 * S; ctx.beginPath(); ctx.ellipse(0, 0, 6 * S, 5 * S, 0, 0, TAU); ctx.stroke();
      break;
    }
    case 'bumper': {
      ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(0, 0, 13 * S, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 7 * S, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * S; ctx.beginPath(); ctx.arc(0, 0, 11 * S, 0, TAU); ctx.stroke();
      break;
    }
    case 'gun': {
      ctx.fillStyle = '#4a4a5a'; ctx.fillRect(-10 * S, -4 * S, 22 * S, 8 * S);
      ctx.fillStyle = d.color; ctx.fillRect(10 * S, -3 * S, 8 * S, 6 * S);
      ctx.fillStyle = '#2a2a3a'; ctx.fillRect(-10 * S, 2 * S, 8 * S, 10 * S);
      break;
    }
    case 'flower': {
      ctx.strokeStyle = '#2a7a2a'; ctx.lineWidth = 3 * S; ctx.beginPath(); ctx.moveTo(0, 14 * S); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = d.color;
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * 8 * S, -6 * S + Math.sin(a) * 8 * S, 6 * S, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#ffe04a'; ctx.beginPath(); ctx.arc(0, -6 * S, 4 * S, 0, TAU); ctx.fill();
      break;
    }
    case 'heart': {
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.moveTo(0, 12 * S);
      ctx.bezierCurveTo(-16 * S, -2 * S, -10 * S, -16 * S, 0, -8 * S);
      ctx.bezierCurveTo(10 * S, -16 * S, 16 * S, -2 * S, 0, 12 * S);
      ctx.fill();
      break;
    }
    case 'tomato': {
      ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(0, 0, 12 * S, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a8a3a'; ctx.beginPath(); ctx.ellipse(0, -12 * S, 6 * S, 3 * S, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'food': {
      ctx.fillStyle = '#e8a04a'; ctx.beginPath(); ctx.arc(0, 0, 11 * S, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff0d0'; ctx.beginPath(); ctx.arc(-3 * S, -3 * S, 5 * S, 0, TAU); ctx.fill();
      break;
    }
    case 'star': {
      ctx.fillStyle = d.color; ctx.beginPath(); star(ctx, 0, 0, 14 * S); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); star(ctx, 0, 0, 6 * S); ctx.fill();
      break;
    }
    case 'mushroom': case 'poison': {
      ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(0, -2 * S, 12 * S, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = '#fff0e0'; ctx.fillRect(-5 * S, -2 * S, 10 * S, 12 * S);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(-5 * S, -7 * S, 2.6 * S, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(5 * S, -6 * S, 2.2 * S, 0, TAU); ctx.fill();
      break;
    }
    case 'metal': {
      ctx.fillStyle = '#7a8898'; ctx.fillRect(-12 * S, -10 * S, 24 * S, 20 * S);
      ctx.fillStyle = '#b8c8d8'; ctx.fillRect(-12 * S, -10 * S, 24 * S, 5 * S);
      ctx.strokeStyle = '#4a5868'; ctx.lineWidth = 2 * S; ctx.strokeRect(-12 * S, -10 * S, 24 * S, 20 * S);
      break;
    }
    case 'bunny': {
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.ellipse(-5 * S, -14 * S, 3.4 * S, 11 * S, -0.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(5 * S, -14 * S, 3.4 * S, 11 * S, 0.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 2 * S, 10 * S, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-3 * S, 0, 2 * S, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(3 * S, 0, 2 * S, 0, TAU); ctx.fill();
      break;
    }
    case 'crate': {
      ctx.fillStyle = d.color; ctx.fillRect(-14 * S, -14 * S, 28 * S, 28 * S);
      ctx.strokeStyle = '#8a6432'; ctx.lineWidth = 3 * S; ctx.strokeRect(-14 * S, -14 * S, 28 * S, 28 * S);
      ctx.beginPath(); ctx.moveTo(-14 * S, -14 * S); ctx.lineTo(14 * S, 14 * S); ctx.moveTo(14 * S, -14 * S); ctx.lineTo(-14 * S, 14 * S); ctx.stroke();
      break;
    }
    case 'capsule': {
      ctx.fillStyle = d.color; ctx.beginPath(); ctx.roundRect(-10 * S, -14 * S, 20 * S, 28 * S, 9 * S); ctx.fill();
      ctx.fillStyle = d.color === '#d8d8e8' ? '#ff8a8a' : d.color; ctx.beginPath(); ctx.roundRect(-10 * S, -14 * S, 20 * S, 12 * S, 8 * S); ctx.fill();
      break;
    }
    case 'orb': {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 14 * S);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, d.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 14 * S, 0, TAU); ctx.fill(); ctx.restore();
      break;
    }
    case 'trophy': {
      ctx.fillStyle = '#c8b86a'; ctx.fillRect(-8 * S, 4 * S, 16 * S, 4 * S);
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.moveTo(-9 * S, 4 * S); ctx.lineTo(9 * S, 4 * S); ctx.lineTo(5 * S, -12 * S); ctx.lineTo(-5 * S, -12 * S); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); star(ctx, 0, -4 * S, 4 * S); ctx.fill();
      break;
    }
    case 'smash': {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 16 * S);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, d.color); g.addColorStop(1, 'rgba(255,224,74,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 16 * S, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4 * S;
      ctx.beginPath(); ctx.arc(0, 0, 9 * S, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5 * S, 0); ctx.lineTo(5 * S, 0); ctx.moveTo(0, -5 * S); ctx.lineTo(0, 5 * S); ctx.stroke();
      break;
    }
    case 'hammer': {
      ctx.fillStyle = '#8a6a4a'; ctx.fillRect(-2 * S, -6 * S, 4 * S, 22 * S);
      ctx.fillStyle = d.color; ctx.fillRect(-12 * S, -18 * S, 24 * S, 14 * S);
      ctx.strokeStyle = '#5a4632'; ctx.lineWidth = 2 * S; ctx.strokeRect(-12 * S, -18 * S, 24 * S, 14 * S);
      break;
    }
  }
}

function star(ctx, cx, cy, r, points = 5) {
  for (let i = 0; i < points * 2; i++) {
    const a = i / (points * 2) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
}

/* ---------------- Projectile ---------------- */
class Projectile {
  constructor(o) {
    Object.assign(this, {
      x: 0, y: 0, vx: 0, vy: 0, damage: 5, bkb: 8, kbs: 30, angle: 45,
      life: 60, color: '#fff', size: 10, kind: 'bolt', pierce: 0, burst: 1, pull: 0, static: false,
    }, o);
    this.t = 0; this.hitIds = new Set(); this.rot = 0;
    if (this.kind === 'tidewave') this.waveHits = new Map();
    this.startX = this.x; this.startY = this.y;
  }
  get box() {
    if (this.kind === 'tidewave') return {x:this.x-68, y:this.y-82, w:136, h:82};
    const s = this.size; return { x: this.x - s, y: this.y - s, w: s * 2, h: s * 2 };
  }
  update(match) {
    this.t++;
    if (this.kind === 'tidewave') { this.updateTideWave(match); return; }
    const oldY = this.y;
    if (!this.static) { this.x += this.vx; this.y += this.vy; this.vy += this.grav || 0; }
    this.rot += 0.3;
    if ((this.kind === 'bomb' || this.kind === 'thrown' || this.kind === 'fallingStar') && this.vy > 0) {
      const gd = match.stage.ground;
      const surfaces = [gd, ...match.stage.platforms];
      for (const p of surfaces) {
        const x = p.cx !== undefined ? p.cx : p.x, y = p.cy !== undefined ? p.cy : p.y;
        if (this.x >= x && this.x <= x + p.w && oldY + this.size <= y && this.y + this.size >= y) {
          this.y = y - this.size; this.dead = true; break;
        }
      }
    }
    if (this.pull) {
      // gravity orb: pull nearby fighters
      for (const f of match.fighters) {
        if (f === this.owner || f.eliminated) continue;
        const d = Math.hypot(f.x - this.x, f.y - 60 - this.y);
        if (d < 220 && d > 4) {
          f.vx += (this.x - f.x) / d * 0.35;
          f.vy += (this.y - (f.y - 60)) / d * 0.2;
        }
      }
    }
    if (this.life-- <= 0) this.dead = true;
    if (this.x < match.blast.left - 200 || this.x > match.blast.right + 200 || this.y < match.blast.top - 100 || this.y > match.blast.bottom + 100) this.dead = true;
    // A bomb explodes on contact rather than applying a direct hit AND an AoE.
    if (this.kind === 'bomb' && !this.dead) {
      for (const f of match.fighters) {
        if (f === this.owner || f.eliminated || f.invincible || (this.owner && match.sameTeam(this.owner, f))) continue;
        if (aabb(this.box, f.hurtbox)) { this.dead = true; break; }
      }
    }
    // hit fighters
    for (const f of match.fighters) {
      if (this.dead || this.kind === 'bomb') break;
      if (f === this.owner || f.eliminated || this.hitIds.has(f.id)) continue;
      if (match.sameTeam(this.owner, f) && this.owner) continue;
      if (!aabb(this.box, f.hurtbox)) continue;
      if (f.invincible) continue;
      this.hitIds.add(f.id);
      if (f.shieldHP > 0) { match.shieldHit(this.owner || f, f, this.damage, this.box); }
      else if (this.kind === 'soulblast' && f.counterActive && this.owner) {
        f.counterHit = this.owner; f.counterActive = false;
      } else {
        match.hitFighter(this.owner, f, { damage: this.damage, bkb: this.bkb, kbs: this.kbs, angle: this.angle, proj: this });
        // A blocked, countered, friendly or invincible target never heals the
        // caster. An old projectile must not heal a KO'd/respawning owner.
        if (this.kind === 'soulblast' && this.owner && !this.owner.eliminated &&
            this.owner.state !== 'respawn' && this.healOnHit) {
          const healed = Math.min(this.owner.damage, this.healOnHit);
          this.owner.damage -= healed;
          if (healed > 0) match.fx.text(this.owner.x, this.owner.y - 125 * this.owner.scale, '-' + Math.round(healed) + '%', '#b9ffb4', 16, 35);
        }
      }
      match.fx.hitSpark(this.x, this.y, this.color, 0.5, Math.atan2(this.vy, this.vx));
      if (this.pierce && this.hitIds.size < this.pierce) continue;
      if (!this.pull) this.dead = true;
    }
    // Soul Reap's blast can also break target-mode targets and item containers.
    if (!this.dead && this.kind === 'soulblast') {
      const touchesTarget = (match.targets || []).some(t => !t.dead && aabb(this.box, {x:t.x-18,y:t.y-18,w:36,h:36}));
      const touchesItem = match.items.some(it => !it.dead && !it.heldBy && aabb(this.box, it.box));
      if (touchesTarget || touchesItem) {
        match.itemsHitByAttack(this.owner, this.box, this.damage);
        match.fx.hitSpark(this.x, this.y, this.color, 0.7, 0);
        this.dead = true;
      }
    }
    if (this.dead && this.kind === 'bomb' && !this.exploded) {
      this.exploded = true;
      const r = this.radius || 120;
      match.fx.explode(this.x, this.y, r, this.color);
      // aoeHit measures fighter feet; offset to compare with fighter centers.
      match.aoeHit(this.owner, this.x, this.y + 50, r, this.damage, this.bkb, this.kbs, this.angle);
      AUDIO.sfx('bomb'); match.cam.shake(7);
    }
  }
  updateTideWave(match) {
    // `life` is a fixed tick budget, not a hit count: contacts never end the wave.
    if (this.t > this.life) { this.dead = true; return; }
    const oldY = this.y;
    if (this.surface) {
      const p = this.surface;
      this.x += this.vx + (p.dx || 0);
      if (this.x >= p.x && this.x <= p.x + p.w) {
        this.y = p.y; this.vy = 0;
      } else {
        // A wave does not travel across empty air as if a platform continued.
        this.surface = null; this.vy = .8; this.y += this.vy;
      }
    } else {
      this.x += this.vx; this.vy = Math.min(14, this.vy + .65); this.y += this.vy;
      // Falling from a platform or cast in midair: catch the first surface below.
      const surfaces = [match.stage.ground, ...match.stage.platforms];
      let landing = null;
      for (const p of surfaces) {
        if (this.x >= p.x && this.x <= p.x+p.w && oldY <= p.y && this.y >= p.y &&
            (!landing || p.y < landing.y)) landing = p;
      }
      if (landing) { this.surface = landing; this.y = landing.y; this.vy = 0; }
    }
    if (this.x < match.blast.left-200 || this.x > match.blast.right+200 || this.y > match.blast.bottom+100) { this.dead=true; return; }
    for (const f of match.fighters) {
      if (f === this.owner || f.eliminated || f.invincible || (this.owner && match.sameTeam(this.owner, f))) continue;
      if (!aabb(this.box, f.hurtbox)) continue;
      const last = this.waveHits.get(f.id);
      if (last !== undefined && this.t - last < this.rehit) continue;
      this.waveHits.set(f.id, this.t);
      if (f.shieldHP > 0) match.shieldHit(this.owner || f, f, this.damage, this.box);
      else if (f.counterActive && this.owner) { f.counterHit = this.owner; f.counterActive = false; }
      else match.hitFighter(this.owner, f, {damage:this.damage,bkb:this.bkb,kbs:this.kbs,angle:this.angle,proj:this});
      match.fx.waterSplash(f.x, this.y, .45, this.color);
    }
    if (this.t % this.rehit === 1) match.itemsHitByAttack(this.owner, this.box, this.damage);
    if (this.t % 8 === 0) match.fx.waterSplash(this.x, this.y, .32, this.color);
  }
  draw(ctx, time) {
    ctx.save(); ctx.translate(this.x, this.y);
    if (this.kind === 'tidewave') {
      ctx.scale(this.vx < 0 ? -1 : 1, 1);
      ctx.globalAlpha = clamp((this.life - this.t + 1) / this.fadeFrames, 0, 1);
      drawWaterCrest(ctx, 140, 82, this.t); ctx.restore(); return;
    }
    if (this.kind === 'soulblast') {
      // A bright violet comet: its core and trailing energy grow as it charges.
      const s = this.size, dir = this.vx < 0 ? -1 : 1;
      ctx.scale(dir, 1); ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 2.2);
      glow.addColorStop(0, '#fff'); glow.addColorStop(.25, '#efb9ff');
      glow.addColorStop(.55, this.color); glow.addColorStop(1, 'rgba(113,26,205,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, s * 2.2, 0, TAU); ctx.fill();
      ctx.globalAlpha = .68; ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.moveTo(s * .5, -s * .65);
      ctx.quadraticCurveTo(-s * 1.4, -s * 1.1, -s * 3.4, 0);
      ctx.quadraticCurveTo(-s * 1.4, s * 1.1, s * .5, s * .65); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = .95; ctx.fillStyle = '#fff1ff';
      ctx.beginPath(); ctx.ellipse(0, 0, s * .72, s * .58, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#e6a0ff'; ctx.lineWidth = Math.max(1.5, s * .12);
      ctx.beginPath(); ctx.arc(0, 0, s * 1.05, -.95, .95); ctx.stroke();
      ctx.restore(); return;
    }
    if (this.kind === 'fallingStar') {
      ctx.rotate(this.rot * 0.45); ctx.fillStyle = this.color;
      ctx.beginPath(); star(ctx, 0, 0, this.size * 1.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); star(ctx, 0, 0, this.size * 0.55); ctx.closePath(); ctx.fill();
      ctx.restore(); return;
    }
    if (this.thrownItem) {
      const it = this.thrownItem;
      const art = typeof Sprites !== 'undefined' && Sprites.itemArt ? Sprites.itemArt(it.type) : null;
      ctx.rotate(this.rot);
      if (art) ctx.drawImage(art.img, -art.w / 2, -art.h / 2, art.w, art.h);
      else drawItemIcon(ctx, it.type, it.def, 1);
      ctx.restore(); return;
    }
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, this.size * 1.9);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, this.color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, this.size * 1.9, 0, TAU); ctx.fill();
    // trail
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = this.color; ctx.lineWidth = this.size * 0.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-this.vx * 2.2, -this.vy * 2.2); ctx.stroke();
    ctx.restore();
  }
}

/* ---------------- Mine ---------------- */
class Mine {
  constructor(o) {
    Object.assign(this, { x: 0, y: 0, damage: 11, bkb: 20, kbs: 52, angle: 60, owner: null, armT: 30, life: 500 }, o);
    this.t = 0; this.dead = false;
  }
  update(match) {
    this.t++;
    if (this.t > this.life) this.dead = true;
    if (this.t < this.armT) return;
    for (const f of match.fighters) {
      if (f === this.owner || f.eliminated) continue;
      if (match.sameTeam(this.owner, f)) continue;
      if (Math.hypot(f.x - this.x, (f.y - 40) - this.y) < 62) {
        this.dead = true;
        match.fx.explode(this.x, this.y, 90, '#22e08a');
        match.aoeHit(this.owner, this.x, this.y, 90, this.damage, this.bkb, this.kbs, this.angle);
        AUDIO.sfx('bomb');
        match.cam.shake(7);
        break;
      }
    }
  }
  draw(ctx, time) {
    ctx.save(); ctx.translate(this.x, this.y);
    const pulse = Math.sin(time * 0.16) * 0.5 + 0.5;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + pulse * 0.4;
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
    g.addColorStop(0, '#22e08a'); g.addColorStop(1, 'rgba(34,224,138,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#22e08a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

/* ---------------- Summon (assist helper) ---------------- */
class Summon {
  constructor(o) { Object.assign(this, { x: 0, y: 0, owner: null, kind: 'sprite', life: 480 }, o); this.t = 0; this.dead = false; this.attT = 60; }
  update(match) {
    this.t++; this.life--;
    if (this.life <= 0) this.dead = true;
    this.attT--;
    const gd = match.stage.ground;
    if (this.y < gd.y) this.y = Math.min(gd.y, this.y + 3);
    // find nearest enemy
    let target = null, bd = 1e9;
    for (const f of match.fighters) {
      if (f === this.owner || f.eliminated || match.sameTeam(this.owner, f)) continue;
      const d = Math.abs(f.x - this.x);
      if (d < bd) { bd = d; target = f; }
    }
    if (target) {
      const dir = sign(target.x - this.x);
      this.x += dir * 2.2;
      this.facing = dir;
      if (this.attT <= 0 && bd < 150) {
        this.attT = 50;
        match.aoeHit(this.owner, this.x + dir * 30, this.y - 40, 48, 7, 14, 40, 45);
        match.fx.burst(this.x + dir * 30, this.y - 40, this.kind === 'sprite' ? '#c77dff' : '#22e08a', 10);
        AUDIO.sfx('hit', { power: 0.2 });
      }
    }
  }
  draw(ctx, time) {
    ctx.save(); ctx.translate(this.x, this.y);
    const c = this.kind === 'sprite' ? '#c77dff' : '#22e08a';
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9;
    const g = ctx.createRadialGradient(0, -26, 3, 0, -26, 30);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, c); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -26, 30, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff';
    ctx.beginPath(); star(ctx, 0, -26, 12); ctx.fill();
    ctx.restore();
  }
}

/* ---------------- Announcer text ---------------- */
function drawBanner(ctx, text, color, t, dur, W, H) {
  const k = t / dur;
  let a = 1, sc = 1;
  if (k < 0.12) { a = k / 0.12; sc = lerp(1.8, 1, k / 0.12); }
  else if (k > 0.8) { a = 1 - (k - 0.8) / 0.2; }
  ctx.save();
  ctx.globalAlpha = clamp(a, 0, 1);
  ctx.translate(W / 2, H * 0.34);
  ctx.scale(sc, sc);
  ctx.textAlign = 'center';
  ctx.font = '900 64px ui-sans-serif, system-ui, sans-serif';
  ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(text, 0, 0);
  const g = ctx.createLinearGradient(0, -40, 0, 24);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, color);
  ctx.fillStyle = g; ctx.fillText(text, 0, 0);
  ctx.restore();
}
