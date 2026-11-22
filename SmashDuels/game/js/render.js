/* ============================================================
   RIFT RUMBLE — procedural sprite renderer + stage art
   ============================================================ */
'use strict';

const Sprites = (() => {
  /* Fighter art is sliced into per-frame atlases; item art loads separately. */
  const A = {};                     // key -> {img, meta, tiles, anims, scale}
  const LEDGE_ART = {};             // separately keyed, approved hanging poses
  const ITEM_ART = {};              // item key -> {img, w, h, mirror} | false
  const VARIANTS = [
    { hue: 0,   alpha: 0.00, light: 0.00 },  // default palette (sheet art)
    { hue: 200, alpha: 0.24, light: 0.05 },  // blue
    { hue: 120, alpha: 0.28, light: 0.03 },  // green
    { hue: 300, alpha: 0.28, light: 0.05 },  // magenta
    { hue: 40,  alpha: 0.22, light: 0.07 },  // gold
    { hue: 220, alpha: 0.10, light: -0.26 }, // shadow / dark
  ];
  // drawn height per fighter, in world px (the atlas is scaled to match)
  const TARGET_H = { valor: 112, grim: 132, astra: 108, vesper: 108, rook: 110, marrow: 126, tide: 108, vector: 112, briar: 108, nomad: 112 };

  /* ============================================================
     ANIMATION
     ------------------------------------------------------------
     One clock and one model, shared by the sprite path and the vector fallback.
     Three rules, each here because the previous version broke it:

     1. Time is GAME TICKS (f.animT), never milliseconds.  A row used to advance
        on floor(wallClock * fps / 1000), so animation speed was decoupled from
        the simulation: a metal-slowed fighter kept cycling its legs at full
        speed, a throttled tab drifted, and two draws in one tick could disagree.
        The clock now advances at most once per game tick — which is also what
        makes the whole layer assertable.
     2. Grounded movement is stride-synced: the cycle advances by distance
        travelled, so the feet appear to grip the deck instead of skating.
     3. An attack is anticipation | strike | follow-through, pinned to the move's
        own startup / active / recovery — never to a fraction of its length.  The
        strike tile is the frame whose art reaches furthest (measured by the
        slicer, meta.strike) and it is HELD for exactly the ticks the hitbox is
        live.  Measured on the old model: 19 of 65 roster moves never showed their
        strike frame while hitting, and one tile was held for 25 ticks on average.
        That is "the animations are slow and nothing connects", quantified.

     Spec fields:
       anim    row name in the atlas
       step    ticks per tile (default 6)
       stride  px travelled per tile — overrides step for grounded movement,
               clamped to [min, max] ticks per tile so a crawl never strobes
       once    play to the end of the range and hold, instead of looping
       from/to sub-range of a row as fractions, so one long row can serve
               several states
       hold    pin to the last tile in range; `pulse` adds a breathing wobble
       fit     play the row exactly once across action.dur
     ============================================================ */
  const STATE_ANIM = {
    idle:        { anim: 'idle',        step: 7 },
    /* Stride length in px of ground per frame of the cycle, not ticks: 17/21 meant
       a walk held each pose for seven or eight ticks (~8 fps) and looked like it
       was playing in slow motion while the fighter slid along.  14 and 17 put both
       cycles at 10-12 fps for the light end of the roster and 2.5-4 for a sprint,
       which is what "running" and "walking" are supposed to sound like. */
    walk:        { anim: 'walk',        stride: 14, min: 3, max: 11 },
    run:         { anim: 'run',         stride: 17, min: 2, max: 8 },
    /* There is no skid row on any sheet (the artist drew a turn as a brace), so a
       pivot borrows the crouch pose — planted, low, held — rather than the old
       "run cycle, backwards" that read as a moonwalk.  `pulse` keeps it breathing
       so a held turn is never a freeze frame. */
    turn:        { anim: 'crouch',      hold: 1, pulse: 0.45, fallback: 'idle' },
    crouch:      { anim: 'crouch',      hold: 1, pulse: 0.5 },
    jump:        { anim: 'jump',        step: 2, once: 1 },
    doublejump:  { anim: 'jump',        step: 2, once: 1 },
    fall:        { anim: 'fall',        step: 4 },
    fastfall:    { anim: 'fall',        step: 4, from: 0.4, once: 1 },
    land:        { anim: 'land',        step: 1, once: 1 },
    shield:      { anim: 'shield',      hold: 1, pulse: 0.7 },
    shieldbreak: { anim: 'shieldbreak', step: 3, once: 1 },
    roll:        { anim: 'rollfwd',     fit: 1 },
    spotdodge:   { anim: 'spotdodge',   step: 3, once: 1 },
    airdodge:    { anim: 'airdodge',    step: 3, once: 1 },
    hitstun:     { anim: 'hurt',        step: 3 },
    launch:      { anim: 'launch',      step: 2 },
    grabbed:     { anim: 'grabbed',     step: 6 },
    grab:        { anim: 'grab',        step: 3, once: 1 },
    grabbing:    { anim: 'grab',        hold: 1, pulse: 1.4 },
    ledge:       { anim: 'fall',        step: 10, to: 0.4 },
    helpless:    { anim: 'fall',        step: 6 },
    down:        { anim: 'down',        hold: 1 },
    getup:       { anim: 'getup',       step: 4, once: 1 },
    respawn:     { anim: 'respawn',     step: 5, once: 1 },
    ko:          { anim: 'ko',          step: 3, once: 1 },
    taunt:       { anim: 'taunt1',      step: 5, once: 1 },
    final:       { anim: 'usmash',      step: 4 },
    stun:        { anim: 'hurt',        step: 5 },
    /* The row is four cells and a dash burst shows it for four ticks on astra, six on
       valor, ten on grim: dashT counts down from the tap, and the first five of those
       ticks are the acceleration ramp, played as `idle`/`walk`.  Two ticks a pose is
       what fits that window — the whole row for a heavy fighter, the two cells that
       matter for a light one — and it is purely which tile is on screen: dashT itself
       still runs at its authored length, so no window, no lock and no pixel of travel
       moves.  See BUGS.md §J10 for the engine-side version, which was not taken. */
    dash:        { anim: 'dash',        step: 2, once: 1 },
  };
  /* Moves and specials only name the row — pickAnim plays it by phase.
     `dashattack` used to borrow the run cycle, i.e. a 38-tick lunge drawn as a
     jog, and the sliced `dash` row was referenced by nothing.  A dash attack now
     plays the strike row (so the hit window has strike art under it) and the dash
     row plays during the dash burst itself, which is where the lunge reads.
     `stilt` is the shared side-swing row the slicer recovers as one sequence. */
  const MOVE_ANIM = {
    jab: 'jab', ftilt: 'stilt', utilt: 'utilt', dtilt: 'dtilt',
    dashattack: 'dashattack', fsmash: 'ssmash', usmash: 'usmash', dsmash: 'dsmash',
    nair: 'nair', fair: 'fair', bair: 'bair', uair: 'uair', dair: 'dair',
  };
  const SPECIAL_ANIM = { n: 'nspecial', s: 'sspecial', u: 'uspecial', d: 'dspecial' };
  /* A fighter whose atlas has not had the row injected still animates: rows added by
     tools/slice_rows.py are optional, and these are what they replace.  Without this a
     missing `dashattack` row would drop the whole move onto the idle cycle. */
  const ROW_ALT = { dashattack: 'stilt' };
  const DEFAULT_STEP = 6;
  const STALL_PX = 0.45;          // px/tick below which a stride is not happening
  const TAU2 = Math.PI * 2;

  /* Sub-tick render blend, handed in by the game loop (see ui.js loop → Sprites.beginFrame).
     Physics is locked to 60 Hz while rAF runs at the panel rate, so on a 120 Hz
     display two drawn frames share one tick.  `BLEND` is how far into the next
     tick the frame being drawn sits; it moves the continuous parts of a pose —
     the bob, the lean, the stride advance — and never the tile table a hitbox is
     derived from, so the collision timing stays exactly as the sim wrote it.
     Left at 0 the renderer draws the tick, which is what a 60 Hz monitor sees. */
  let BLEND = 0;
  function setBlend(a) { BLEND = a > 0 && a < 1 ? a : 0; }

  /* Cross-cell dissolve (see pickAnim's `mix`).  On by default; `Sprites.setSmooth(0)`
     turns it off and puts the hard cell cuts back, which is the look a pixel-art
     purist may prefer, and it is the switch to flip if a ghosting ever looks wrong.
     SMOOTH_K is how far the dissolve goes before the next tile simply takes over:
     0.8 leaves a 20% trace of the old pose rather than a hard hand-off. */
  let SMOOTH = true;
  const SMOOTH_K = 0.8;
  function setSmooth(on) { SMOOTH = !!on; }

  /* One clock per fighter, keyed on the row being played: switching rows restarts
     it, staying on a row advances it at most once per game tick.  Held in a
     WeakMap so nothing about it leaks into save data or the fighter's own state. */
  const clocks = new WeakMap();
  function clockFor(f, name, spec) {
    let c = clocks.get(f);
    if (!c) { c = { name: null, t: 0, p: 0, tick: -1 }; clocks.set(f, c); }
    const tick = f.animT | 0;
    if (c.name !== name) { c.name = name; c.t = 0; c.p = 0; c.tick = tick; return c; }
    /* Same tick twice — the second draw of a tick on a panel faster than 60 Hz.
       The pose is not re-advanced (that would double its rate); it is offset by the
       blend, which is the whole point: the frame lands between the two ticks. */
    if (c.tick === tick) return blended(f, spec, c);
    const d = tick - c.tick;
    c.tick = tick;
    if (d <= 0) { c.t = 0; c.p = 0; return c; }          // animT reset: respawn, land
    if (f.hitlag > 0) return c;                          // impact freeze holds the pose
    c.t += d;
    /* Stride sync: the cycle advances with the ground, not with the clock.  Below
       STALL_PX/tick a fighter is not putting a foot down, so nothing advances —
       that is what stops a 0.3 px drift while easing to a stop from playing a
       walk cycle in place.  Above it, the clamp keeps a crawl from strobing and a
       dash from spinning the legs faster than the art can read. */
    if (spec.stride) {
      const px = Math.abs(f.vx || 0);
      if (px > STALL_PX) {
        const ticks = clamp(spec.stride / px, spec.min || 2, spec.max || 14);
        c.p += d / ticks;
      }
    }
    return blended(f, spec, c);
  }

  /* ---------------- sub-tick render blend ----------------
   *
   * The mirror half of setBlend: positions, not poses.  setBlend moves the continuous
   * parts of a pose between two ticks; this moves the body itself, and the camera, so a
   * panel faster than 60 Hz gets a new frame instead of the same tick twice.
   *
   * What the frame is drawn at, and why it is a lead and not a lerp: Game.loop steps
   * the simulation *before* it draws, so `alpha` is the time already spent waiting for
   * the NEXT tick, not the fraction of a tick left over from the last one.  The tick is
   * therefore the freshest thing the engine knows, and the correct position is that plus
   * how far the body will travel before the panel answers.  Interpolating backwards
   * instead (px + alpha*d, the textbook fixed-step recipe) is only right for a loop that
   * draws before it steps — here it put every blended frame half a tick behind the frame
   * before it, and since the short-circuit at alpha = 0 draws the raw tick, a 120 Hz panel
   * saw the sprite jump forward on the step and slide back on the frame after it:
   * 117 of 240 frames moving backwards.  Measured, not theorised — tools/animtest.js
   * asserts on the blit matrix precisely so this cannot silently flip back.
   *
   * What is left of the old `LEAD_CAP` is the honesty bound: a body may only be led by
   * as much as it actually travelled last tick, which stops a wall, a grab or a body
   * scrubbing itself to a stop from being drawn somewhere the physics will not put it.
   * The fixed 4px cap on top of that was the stutter — a fighter falling at 12px a tick
   * had two thirds of its frame thrown away, then handed back on the next tick.  A
   * velocity that just changed sign is the one case where travel is not evidence, so
   * that gets no lead at all, and a fighter in hitlag is frozen and skipped outright.
   *
   * Returns the undo; the draw pass hands the positions straight back, so the
   * simulation never sees a number the physics did not produce.  alpha = 0 — a 60 Hz
   * panel, where there is nothing between the ticks to guess — is a no-op. */
  const MEMO = new WeakMap();     // entity -> where it stood on the tick it was last drawn
  function beginFrame(match, alpha) {
    setBlend(alpha);
    if (!(alpha > 0) || !match) return null;
    const moved = [];
    /* How far this body actually moved on the tick that just ran, measured once per
       tick (keyed on animT, so a doubled-up catch-up frame still only samples once). */
    const travelled = (e) => {
      const tick = e.animT | 0;
      let m = MEMO.get(e);
      if (!m) { m = { t: -1 }; MEMO.set(e, m); }
      if (m.t === tick) return m;
      m.t = tick;
      const dx = m.px === undefined ? 0 : e.x - m.px;
      const dy = m.py === undefined ? 0 : e.y - m.py;
      m.px = e.x; m.py = e.y; m.dx = dx; m.dy = dy;
      return m;
    };
    const step = (e, vx, vy, bound) => {
      if (!e || e.hitlag > 0) return;                     // a frozen fighter is not moving
      if (!Number.isFinite(vx) || !Number.isFinite(vy) || (!vx && !vy)) return;
      let mx = Infinity, my = Infinity;
      if (bound) {
        const m = travelled(e);
        // a body that just reversed is not going where its velocity says
        mx = vx * m.dx < 0 ? 0 : Math.abs(m.dx);
        my = vy * m.dy < 0 ? 0 : Math.abs(m.dy);
      }
      const dx = clamp(vx * alpha, -mx, mx);
      const dy = clamp(vy * alpha, -my, my);
      if (!dx && !dy) return;
      moved.push(e, e.x, e.y);
      e.x += dx; e.y += dy;
    };
    for (const f of match.fighters) step(f, f.vx, f.vy, true);
    for (const it of match.items) if (!it.heldBy) step(it, it.vx, it.vy);
    for (const pr of match.projectiles) step(pr, pr.vx, pr.vy);
    for (const su of (match.summons || [])) step(su, su.vx || 0, su.vy || 0);
    if (match.bag) step(match.bag, match.bag.vx || 0, match.bag.vy || 0);
    const cam = match.cam;
    let c = null;
    if (cam && Number.isFinite(cam.px)) {
      c = [cam.x, cam.y, cam.zoom];
      cam.x += (cam.x - cam.px) * alpha;
      cam.y += (cam.y - cam.py) * alpha;
      cam.zoom += (cam.zoom - cam.pz) * alpha;
    }
    return () => {
      if (c) { cam.x = c[0]; cam.y = c[1]; cam.zoom = c[2]; }
      for (let i = 0; i < moved.length; i += 3) { moved[i].x = moved[i + 1]; moved[i].y = moved[i + 2]; }
      setBlend(0);
    };
  }

  /* A looping row gets the fraction of the tick the frame is drawn at; anything
     with a scripted end (once / fit / hold) is owned by the action's own tick
     count, because that is what the hit window is measured in. */
  function blended(f, spec, c) {
    if (!BLEND || !c || spec.once || spec.fit || spec.hold) return c;
    const o = { name: c.name, t: c.t + BLEND, p: c.p, tick: c.tick };
    if (spec.stride) {
      const px = Math.abs(f.vx || 0);
      if (px > STALL_PX) o.p = c.p + BLEND / clamp(spec.stride / px, spec.min || 2, spec.max || 14);
    }
    return o;
  }

  /* Which tile a row should show: loop, hold, once, or fit an action's length. */
  function rowIndex(c, spec, frames, actionT, actionDur) {
    const n = frames.length;
    const from = Math.round((spec.from || 0) * (n - 1));
    const to = Math.round((spec.to === undefined ? 1 : spec.to) * (n - 1));
    const span = Math.max(1, to - from + 1);        // inclusive: a 6-frame row shows 6 frames
    if (spec.hold) return clamp(to, 0, n - 1);     // the settled frame, not the lead-in
    const step = Math.max(1, spec.step || DEFAULT_STEP);
    let i;
    if (spec.once) i = from + Math.floor(c.t / step);
    else if (spec.fit) i = from + Math.floor(clamp(actionT / Math.max(1, actionDur), 0, 0.999) * span);
    else if (spec.stride) i = from + (Math.floor(c.p) % span);
    else i = from + ((Math.floor(c.t / step) % span + span) % span);
    if (spec.rev && i > from && i <= to) i = to - (i - from);
    return clamp(i, 0, n - 1);
  }

  /* Attacks: anticipation -> strike (held across the whole active window) ->
     follow-through.  `k`, the strike tile, comes from the art itself: the frame
     of the row that reaches furthest in the direction of the blow. */
  function attackIndex(f, frames, geo) {
    const a = f.action || {};
    const n = frames.length;
    /* `geo` is meta.strike[row]: which tile of the row actually lands the blow,
       measured from the art.  Frames are authored in time order, so everything
       before k is anticipation and everything after is follow-through. */
    const k = clamp(geo ? geo.k : Math.round((n - 1) * 0.62), 0, n - 1);
    const wind = clamp(n > 2 && geo ? geo.wind : Math.max(0, k - 1), 0, n - 1);
    const startup = Math.max(1, a.startup | 0 || 4);
    const active = Math.max(1, a.active | 0 || 3);
    const dur = Math.max(startup + active, a.dur | 0 || startup + active + 8);
    const t = Math.max(0, f.actionT | 0);
    if (f.charging) return wind;                    // a charge holds the pulled-back pose
    if (t < startup) {
      if (!k) return n > 1 ? wind : 0;              // the blow is frame 0: wind up on the last frame
      const lead = k;                               // tiles before the strike
      const step = Math.max(1, Math.floor((startup - 1) / lead));
      return clamp(Math.floor(t / step), 0, k - 1);
    }
    if (t < startup + active) return k;             // the hit window IS the strike
    const rec = Math.max(1, dur - startup - active);
    const tail = n - 1 - k;
    if (tail > 0) {
      const step = Math.max(1, Math.floor(rec / (tail + 1)));
      return clamp(k + 1 + Math.floor((t - startup - active) / step), k + 1, n - 1);
    }
    /* The strike is the last frame the row drew (a jab's extension IS the end of
       its sequence), so there is no follow-through art to play.  Holding the
       extended pose for the whole recovery is precisely what made every attack
       look like it ended late; relax back through the earlier frames instead,
       and let attackSwing carry the last bit. */
    if (n <= 1) return 0;
    const back = Math.max(1, k - wind);
    const step = Math.max(1, Math.floor(rec / (back + 1)));
    return clamp(k - 1 - Math.floor((t - startup - active) / step), wind, k - 1);
  }

  /* Roughly a third of the roster has a single frame for its smashes and its
     down-air (LOG-14: the sheets pack those rows as one big pose, and the slicer
     cannot invent what the artist did not draw).  One tile cannot lean back and
     snap forward by itself, so the swing is synthesised: a procedural anticipation
     / follow-through applied on top of the sprite, timed by the same windows as
     the tiles and the hitbox.  Rows that do have art to play get a fifth of it —
     enough to give the blow weight, not enough to fight the drawing. */
  function attackSwing(f, amp) {
    const ph = attackPhase(f, BLEND);
    const A = amp;
    /* `sx` is a squash-stretch on top of the pose: below 1 the figure is wound up
       narrow and tall, at 1.1 it is flung long and flat.  Cartoon smear, and the
       only tool available for a row the sheets give us as one tile — which is most
       of the heavy attacks (LOG-14).  Applied to the whole body, it reads as the
       blow leaving the wind-up rather than as a scaling bug as long as it stays
       inside roughly ±12%. */
    if (f.charging) {
      const c = clamp((f.chargeT | 0) / 26, 0, 1);
      return { lean: (-0.08 - 0.14 * c) * A, dx: -5.4 * c * A, dy: 1.4 * c * A, sq: 1 - 0.05 * c * A, sx: 1 - 0.05 * c * A };
    }
    if (ph.phase === 0) {
      const w = eased(ph.p) * A;
      return { lean: -0.24 * w, dx: -11 * w, dy: -1.1 * w, sq: 1 + 0.04 * w, sx: 1 - 0.09 * w };
    }
    if (ph.phase === 1) {
      return { lean: 0.15 * A, dx: 14 * A, dy: -1.0 * A, sq: 1 - 0.03 * A, sx: 1 + 0.10 * A };
    }
    const w = (1 - eased(ph.p)) * A;                       // eases back, never past neutral
    return { lean: 0.15 * w, dx: 14 * w, dy: -1.0 * w, sq: 1, sx: 1 + 0.06 * w };
  }

  /* Baked VFX is painted into the same tile as the pose it belongs to, so a smash
     with one frame of art carries its full crescent from tick 0 — which is most of
     why the heavy attacks read as a still image that suddenly has a sword in it.
     The effect layers are gated to the move's own timing instead: they build
     through the wind-up, hit full strength exactly when the hitbox opens, and fade
     through recovery.  Glow and hitbox start on the same tick.
     Returns a 0..1 alpha for the frame's effect layers. */
  function vfxGate(f) {
    const a = f.action;
    if (!a || a.type !== 'move' || f.state !== 'attack') return 1;   // specials, grabs: their own art
    if (f.charging) return 0.18 + 0.72 * clamp((f.chargeT | 0) / 26, 0, 1);
    const ph = attackPhase(f);
    if (ph.phase === 0) return 0.10 + 0.42 * eased(ph.p);
    if (ph.phase === 1) return 1;
    return Math.max(0.26, 1 - 0.72 * eased(ph.p));
  }

  function attackPhase(f, extra = 0) {
    const a = f.action || {};
    const startup = Math.max(1, a.startup | 0 || 4);
    const active = Math.max(1, a.active | 0 || 3);
    const dur = Math.max(startup + active, a.dur | 0 || startup + active + 8);
    const t = Math.max(0, (f.actionT | 0) + extra);   // `extra`: sub-tick render blend only
    if (f.charging) return { phase: 0, p: 1 };
    if (t < startup) return { phase: 0, p: t / startup };
    if (t < startup + active) return { phase: 1, p: (t - startup) / active };
    return { phase: 2, p: clamp((t - startup - active) / Math.max(1, dur - startup - active), 0, 1) };
  }

  /* Same reason as `BUILD` in core.js: an atlas whose PNG and JSON come from two
     different builds draws tiles from the wrong rectangles. */
  const VQ = '?v=' + (typeof BUILD !== 'undefined' ? BUILD : '0');
  function load() {
    if (typeof fetch !== 'function' || typeof Image !== 'function') return;
    fetch(`assets/ledge/anchors.json${VQ}`).then(r => r.ok ? r.json() : Promise.reject())
      .then(anchors => {
        for (const [key, anchor] of Object.entries(anchors)) {
          const img = new Image();
          img.onload = () => { LEDGE_ART[key] = { img, anchor, tint: {} }; };
          img.src = `assets/ledge/${key}.png${VQ}`;
        }
      }).catch(() => {}); // fall back to the atlas if an optional pose cannot load
    for (const k of FIGHTER_KEYS) {
      fetch(`assets/atlas/${k}.json${VQ}`)
        .then(r => r && r.ok ? r.json() : Promise.reject(new Error('missing atlas ' + k)))
        .then(meta => {
          const img = new Image();
          img.onload = () => {
            const refH = Math.max(24, meta.refH || 64);
            A[k] = { img, meta, tiles: meta.tiles, anims: meta.anims, unit: refH,
              scale: (TARGET_H[k] || 108) / refH, tint: {}, desRows: new Set(),
              strike: {}, box: {}, bodyBox: {}, neutral: null };
          };
          img.onerror = () => { A[k] = null; };
          img.src = `assets/atlas/${k}.png${VQ}`;
        })
        .catch(() => { A[k] = null; });
    }
  }

  function atlas(key) { return A[key] || null; }

  /* ---------------- item art ----------------
     Items used to be drawn as a switch of fillRects — a "sword" was a 4px pale bar.
     That reads as a placeholder at 40px, and it is why an item on the deck is hard
     to identify at a glance. The sprites in `assets/items/` are real drawings (built
     by tools/slice_items.py from the generated sheets), and the manifest carries the
     size each one is drawn at, so the art can be anchored by the renderer rather than
     guessed at by whoever wrote the icon.

     `false` means "loaded and missing" — items.js keeps the vector icon for those, so
     a partial or absent art directory degrades instead of blanking. */
  function loadItems() {
    if (typeof fetch !== 'function' || typeof Image !== 'function') return;
    fetch('assets/items/items.json' + VQ)
      .then((r) => (r && r.ok ? r.json() : Promise.reject(new Error('no item manifest'))))
      .then((man) => {
        const items = (man && man.items) || {};
        const scale = man && man.scale ? man.scale : 2;
        for (const k in items) {
          const rec = items[k];
          const entry = ITEM_ART[k] = { img: null, w: rec.w, h: rec.h, mirror: !!rec.mirror, want: (rec.w * scale) | 0 };
          const img = new Image();
          img.onload = () => { entry.img = img; };
          img.onerror = () => { ITEM_ART[k] = false; };
          img.src = `assets/items/${rec.file}${VQ}`;
        }
      })
      .catch(() => { ITEM_ART.__failed = true; });
  }

  /* The sprite for an item key once it is on screen, or null to fall back. */
  function itemArt(key) {
    const e = ITEM_ART[key];
    if (!e || !e.img) return null;
    return e;
  }

  /* ---------------- art-derived geometry ----------------
     The slicer crops every tile tight to its ink, so a tile's rectangle *is*
     the silhouette of that drawing: no extra measurement pass is needed, and
     the boxes stay true whenever the sheets are re-sliced.  From those rects we
     read two things per animation row:

       box[row][i]   the frame's drawn extent, in fighter-local px at scale 1
                     (x right = the facing side, y down from the feet) — body
                     tile unioned with any baked VFX layer, because a drawn
                     crescent is part of what the player judges the swing by;
       strike[row]   the frame that reaches furthest in the direction of the
                     blow (that is the pose whose hitbox must be live), plus the
                     frame that reaches least, used as the anticipation tile.

     The strike tile is what the hit window is pinned to, so the animation and
     the hitbox come from the same measurement and cannot drift apart. */
  /* Which way a row's blow travels, as [axis, sign]: axis 0 = horizontal,
     1 = vertical, 2 = either side; sign is the direction along that axis (tile y
     grows downward, so -1 is up). */
  const ROW_DIR = [
    [/^b/, [0, -1]],                     // bair: the reach is behind you
    [/^u/, [1, -1]],                     // utilt / usmash / uair / uspecial
    [/^d/, [1, 1]],                      // dtilt / dsmash / dair / dspecial
    [/^n/, [2, 0]],                      // nair / nspecial: both sides count
  ];
  /* The rows the engine ships are named outright, and the prefix table above is only
     the fallback.  It has to be, because `dashattack` starts with the same letter the
     tilts and smashes use for "down": a prefix match turned a forward lunge into a
     downward blow, so the box grew at the feet while the drawn fist stayed unhit.  The
     dash attack used to borrow the `stilt` row, which hid that; giving it its own art
     is what made the two disagree out loud. */
  const ROW_DIR_NAMED = {
    jab: [0, 1], ftilt: [0, 1], stilt: [0, 1], dtilt: [1, 1], utilt: [1, -1],
    dashattack: [0, 1], dash: [0, 1], fsmash: [0, 1], ssmash: [0, 1], usmash: [1, -1],
    dsmash: [1, 1], nair: [2, 0], fair: [0, 1], bair: [0, -1], uair: [1, -1],
    dair: [1, 1], nspecial: [2, 0], sspecial: [0, 1], uspecial: [1, -1], dspecial: [1, 1],
    spotdodge: [0, 1], rollfwd: [0, 1], rollback: [0, -1], airdodge: [0, 1],
  };
  function rowDir(name) {
    const n = ROW_DIR_NAMED[name];
    if (n) return n;
    for (const [re, d] of ROW_DIR) if (re.test(name)) return d;
    return [0, 1];                       // forward: jab, tilts, smashes, fair, dash
  }

  function rectOf(at, parts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false;
    for (const part of parts) {
      if (!part) continue;                   // a malformed entry must not throw here
      const [tid, ax, ay, pad] = part;
      const t = at.tiles[tid];
      if (!t) continue;
      any = true;
      /* A tile drawn at (-ax, -ay) puts its ink from (-ax, -ay) to (w-ax, h-ay).
         `pad` = [empty rows above the ink, empty rows below it]: a tile can be
         taller than its drawing so every frame of a row shares one baseline
         (tools/atlas_desmerge.py re-cuts merged strips that way) while the box kept
         measuring the ink rather than the band. */
      const py0 = pad ? pad[0] : 0, py1 = pad ? pad[1] : 0;
      x0 = Math.min(x0, -ax); y0 = Math.min(y0, -ay + py0);
      x1 = Math.max(x1, t.w - ax); y1 = Math.max(y1, t.h - ay - py1);
    }
    return !any || x1 <= x0 || y1 <= y0 ? null : [x0, y0, x1, y1];
  }

  /* `body` is the figure alone, `all` adds any baked VFX layer (crescents,
     trailing arcs).  The plausibility test reads the body — a wide `all` is
     usually a legitimate arc, while a wide *body* is a merged strip the slicer
     could not split — and the geometry reads `all`, because what a player judges
     a swing by is the whole drawing. */
  function frameBox(at, ent) {
    const part = [ent[0], ent[1], ent[2], ent[5] || null];
    const body = rectOf(at, [part]);
    const all = rectOf(at, [part].concat(ent[3] || []));
    return all && body ? { body, all } : null;
  }

  /* A tile only carries usable geometry if it looks like ONE pose.  Rows the
     slicer could not split come out as one wide short strip (LOG-14: about a
     dozen attack rows across the roster, valor/grim `dsmash` being the worst at
     ~4x the body height in width) — measuring those would hand a merged contact
     sheet to the collision code, so they are rejected and the move keeps its
     authored box. */
  function usable(at, b, name) {
    if (!b) return false;
    const w = b[2] - b[0], h = b[3] - b[1];
    if (name && at.desRows && at.desRows.has(name)) {
      /* Rows tools/atlas_desmerge.py re-cut out of a merged strip.  Their cells
         are tight ink crops, so a wide cell is a real effect sweep — which is the
         whole point of the swing, not an unsplit montage — and the montage test
         above would throw the strike frame away.  Bounded by the strip's own span
         instead, so anything still unsplit stays rejected. */
      return w <= 3.4 * at.unit && h <= 2.6 * at.unit;
    }
    return w <= 2.2 * Math.max(h, 0.55 * at.unit) && w <= 2.4 * at.unit && h <= 2.6 * at.unit;
  }

  function measure(at) {
    for (const name in at.anims) {
      const fl = at.anims[name];
      if (!fl || !fl.length) continue;
      const boxes = fl.map((ent) => {
        const b = frameBox(at, ent);
        return b && usable(at, b.body, name) ? b.all : null;
      });
      at.box[name] = boxes;
      /* The same row measured without any baked VFX.  A drawn crescent is part of
         what the player judges the swing by, so it counts as a hit — but it is not
         a limb, so it must not count as something you can be hit *through*.  The
         hurtbox reads this copy, the hitbox reads `box`. */
      at.bodyBox[name] = fl.map((ent) => {
        const b = frameBox(at, ent);
        return b && usable(at, b.body, name) ? b.body : null;
      });
      /* meta.geo / meta.geoBody — the geometry a row is *judged* by, when that is not the
         row's own ink.  Everything here gives the drawing a vote on the hitbox and on the
         hurtbox, which is right for a sheet cut by hand and wrong for a re-skin: drop a new
         sheet over an old one and the sword gets longer, the resting pose gets wider, and a
         jab quietly loses the extension it used to gain past the silhouette (a wider idle
         swallows the reach a swing lived on).  So a re-skin carries the extents of the art
         it replaced, captured by tools/atlas_geo.js before the pixels move, and only the
         picture changes underneath it.  Rows the atlas does not name are measured as usual,
         so hand-cut art still follows its own drawing. */
      const geo = (name, cur) => {
        const g = at.meta && at.meta[name];
        const row = g && g[an];
        if (!row || !row.length) return cur;
        const m = row.length;
        /* The new sheet does not have to run the same number of frames — 8 idles over a
           6-frame row still describes the same blow — so the old extents are sampled
           across the new length rather than truncated. */
        return Array.from({ length: fl.length }, (_, i) => {
          const b = row[m === fl.length ? i : Math.round(i * (m - 1) / Math.max(1, fl.length - 1))];
          return b ? b.slice(0) : null;
        });
      };
      const an = name;
      at.box[an] = geo('geo', at.box[an]);
      at.bodyBox[an] = geo('geoBody', at.bodyBox[an]);
      const d = rowDir(name);
      /* Reach is signed, and "further along the blow" always wins.  The vertical
         axis has to negate: the frame that paints furthest UP is the one with the
         most negative top edge, and reading b[1] straight crowned the frame that
         reaches *least* as the strike — so every up-tilt and up-air held a tucked
         arm for the entire hit window while the live box was out at the top. */
      const reach = (b) => {
        if (!b) return -1e9;
        if (d[0] === 2) return Math.max(b[2], -b[0]);   // either side counts
        if (d[0] === 1) return d[1] > 0 ? b[3] : -b[1]; // vertical: low or high
        return d[1] > 0 ? b[2] : -b[0];                  // horizontal: front or back
      };
      let k = 0, w = 0, best = -1e9, worst = 1e9;
      boxes.forEach((b, i) => {
        const r = reach(b);
        if (r > best) { best = r; k = i; }
        if (r < worst) { worst = r; w = i; }
      });
      at.strike[name] = { k, wind: w, reach: best, poses: boxes.reduce((n2, b) => n2 + (b ? 1 : 0), 0) };
    }
    // the widest and narrowest single resting frames: a hurtbox is allowed to be
    // narrower than the art (what the art shows as a resting weapon is not a
    // limb), but it must sit between those two references
    at.neutralMax = (at.box.idle || []).reduce((acc, b) => (b && (!acc || (b[2] - b[0]) > (acc[2] - acc[0])) ? b : acc), null);
    at.neutralMin = (at.box.idle || []).reduce((acc, b) => (b && (!acc || (b[2] - b[0]) < (acc[2] - acc[0])) ? b : acc), at.neutralMax);
    at.neutralBody = (at.bodyBox.idle || []).reduce((acc, b) => (b ? [
      Math.min(acc ? acc[0] : 1e9, b[0]), Math.min(acc ? acc[1] : 1e9, b[1]),
      Math.max(acc ? acc[2] : -1e9, b[2]), Math.max(acc ? acc[3] : -1e9, b[3]),
    ] : acc), null);
    at.neutral = (at.box.idle || []).reduce((acc, b) => (b ? [
      Math.min(acc ? acc[0] : 1e9, b[0]), Math.min(acc ? acc[1] : 1e9, b[1]),
      Math.max(acc ? acc[2] : -1e9, b[2]), Math.max(acc ? acc[3] : -1e9, b[3]),
    ] : acc), null);
  }

  /* The drawn extension of an attack frame that sticks out past the resting
     silhouette, in fighter-local px at scale 1 — the part of the picture that
     reads as "the blade".  Null when the atlas has no row for this animation,
     which is what makes the authored rectangle the fallback. */
  function artReach(key, anim, i, mode) {
    const at = A[key];
    if (!at) return null;
    const body = mode === 'body';
    const boxes = body ? at.bodyBox && at.bodyBox[anim] : at.box && at.box[anim];
    if (!boxes) return null;
    const b = boxes[clamp(i | 0, 0, boxes.length - 1)] || boxes.find(Boolean);
    const n = body ? at.neutralBody : at.neutral;
    if (!b) return null;                        // merged/unusable tile: no art geometry
    const sc = at.scale;
    return {
      x0: b[0] * sc, y0: b[1] * sc, x1: b[2] * sc, y1: b[3] * sc,
      silhouette: (n || [0, 0, 0, 0]).map((v, j) => v * sc),
      // how far each edge paints past the resting silhouette, in the same units
      over: [
        n ? Math.max(0, (n[0] - b[0])) * sc : 0,   // past the back
        n ? Math.max(0, (n[1] - b[1])) * sc : 0,   // above the head
        n ? Math.max(0, (b[2] - n[2])) * sc : 0,   // past the blade tip
        n ? Math.max(0, (b[3] - n[3])) * sc : 0,   // below the feet
      ].map((v) => Math.round(v * 10) / 10),
    };
  }

  /* The rectangle a move's authored box becomes once the drawing gets a vote:
     each edge is pushed out by however far that frame paints beyond the resting
     silhouette, and never pulled in — so re-slicing the sheets can lengthen a
     swing but cannot silently nerf one, and a box never grows over the body
     itself (which is how you get a phantom point-blank trade).  Returns the
     authored rectangle untouched when there is no usable art for the frame. */
  function attackBox(key, anim, i, b) {
    const art = artReach(key, anim, i);
    const base = { x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.h, art: null };
    if (!art) return base;
    /* Grow the box only toward where the blow travels — never backwards, never
       sideways for a horizontal swing.  Valor's side smash bakes a trailing
       crescent that paints well behind the fighter, and a hitbox that followed it
       would turn a forward smash into a 220px swing that hits you for backing in. */
    const d = rowDir(anim);
    let fx = 0, bx = 0, fy = 0, by = 0;
    if (d[0] === 0) { if (d[1] > 0) fx = 1; else bx = 1; }        // forward: x1 / back: x0
    else if (d[0] === 1) { if (d[1] > 0) fy = 1; else by = 1; }   // down: y1 / up: y0
    else { fx = 1; bx = 1; }                                       // neutral air: both x edges
    /* The growth is one-dimensional on purpose.  The cross-axis band is authored
       and stays authored, because the ink that disagrees with it is almost never a
       limb: Valor's side smash paints its crescent up over his head, and letting
       that vote made a 60px-tall box 138px tall — a forward smash that suddenly
       reverses anyone standing above you.  Same story for a vertical move's
       sideways spread.  A box may reach where the blow goes, nowhere else. */
    const sil = art.silhouette;
    /* And only within a budget.  The ink of a swing is a brushstroke: a sparkle
       that trails two body-heights below a down-air is not two body-heights of
       hitbox, while a raised axe that clears the head by one is.  One drawn body
       (the atlas' reference height) is what a move is allowed to gain, so the art
       can line the box up with the limb but cannot inflate a 40px spike into a
       ground-clearing beam. */
    const at = A[key];
    const cap = 0.85 * at.unit * at.scale;
    return {
      x0: (bx && art.x0 < sil[0]) ? Math.max(base.x0 - cap, Math.min(base.x0, art.x0)) : base.x0,
      x1: (fx && art.x1 > sil[2]) ? Math.min(base.x1 + cap, Math.max(base.x1, art.x1)) : base.x1,
      y0: (by && art.y0 < sil[1]) ? Math.max(base.y0 - cap, Math.min(base.y0, art.y0)) : base.y0,
      y1: (fy && art.y1 > sil[3]) ? Math.min(base.y1 + cap, Math.max(base.y1, art.y1)) : base.y1,
      art, cap,
    };
  }

  function strikeIndex(key, anim) {
    const at = A[key];
    const g = at && at.strike[anim];
    return g ? g.k : -1;
  }
  function ready(key) { return !!A[key]; }
  function height(key) { return TARGET_H[key] || 108; }

  /* Tinted copy of a whole atlas per palette, built once per palette used. */
  function tinted(at, vi) {
    if (!at.tint[vi]) {
      const v = VARIANTS[vi % VARIANTS.length];
      const c = document.createElement('canvas');
      c.width = at.img.width; c.height = at.img.height;
      const g = c.getContext('2d');
      g.drawImage(at.img, 0, 0);
      if (v.alpha > 0) {
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = `hsl(${v.hue} 65% 55%)`;
        g.globalAlpha = v.alpha;
        g.fillRect(0, 0, c.width, c.height);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
      if (v.light !== 0) {
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = v.light > 0 ? '#ffffff' : '#000000';
        g.globalAlpha = Math.abs(v.light);
        g.fillRect(0, 0, c.width, c.height);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
      at.tint[vi] = c;
    }
    return at.tint[vi];
  }

  /* Which animation + frame a fighter should show right now.  `time` is kept in
     the signature for the callers that have it, but nothing reads it: the clock is
     f.animT. */
  function pickAnim(f, time) {
    const at = atlas(f.key);
    if (!at) return null;
    let name = null, spec = null;
    const act = f.action;
    const phase = (f.state === 'attack' && act && act.key) || f.state === 'special';
    if (f.state === 'attack' && act && act.key) {
      name = MOVE_ANIM[act.key] || 'jab';
    } else if (f.state === 'special' && act) {
      name = SPECIAL_ANIM[act.specialKey || act.specialDir || 'n'] || 'nspecial';
    } else if (f.state === 'grab') {
      name = 'grab'; spec = STATE_ANIM.grab;
    } else if (f.state === 'grabbed') {
      name = 'grabbed'; spec = STATE_ANIM.grabbed;
    } else {
      const cfg = STATE_ANIM[f.state];
      if (cfg) { name = cfg.anim; spec = cfg; }
    }
    if (f.state === 'taunt') { name = 'taunt' + (1 + ((f.tauntIdx | 0) % 3)); spec = STATE_ANIM.taunt; }
    // Tide and Vector use special lunge poses, not steps in their running
    // cycle. Use the continuous stride instead, including just after a turn.
    if (f.state === 'run' && (f.dashT | 0) > 0 && f.key !== 'tide' && f.key !== 'vector' && f.key !== 'briar' && f.key !== 'nomad') { name = 'dash'; spec = STATE_ANIM.dash; }
    if ((f.key === 'tide' || f.key === 'vector' || f.key === 'briar' || f.key === 'nomad') && f.state === 'turn' && at.anims.turn) { name = 'turn'; spec = STATE_ANIM.turn; }
    if (f.state === 'roll') {
      // roll backwards when rolling against your facing, forwards otherwise
      const back = (f.rollDir || 0) !== 0 && (f.rollDir || 0) !== f.facing;
      name = back ? 'rollback' : 'rollfwd';
      spec = STATE_ANIM.roll;
    }
    // shieldBreak() parks the fighter in hitstun with a 180-frame stun, which
    // is the only readable signal for "the bubble just shattered"
    if (f.stunT > 120 && f.shieldHP <= 0) { name = 'shieldbreak'; spec = STATE_ANIM.shieldbreak; }
    if (f.state === 'stun') { name = 'hurt'; spec = STATE_ANIM.stun; }
    let frames = at.anims[name];
    if ((!frames || !frames.length) && ROW_ALT[name]) {
      name = ROW_ALT[name];
      frames = at.anims[name];
    }
    if ((!frames || !frames.length) && spec && spec.fallback) {
      const alt = at.anims[spec.fallback];
      if (alt && alt.length) frames = alt;
    }
    if (!frames || !frames.length) { frames = at.anims.idle; spec = STATE_ANIM.idle; name = 'idle'; }
    spec = spec || { anim: name };
    const n = frames.length;
    let i, wob = 0;
    const c = clockFor(f, name, spec);
    let swing = null;
    if (phase) {
      // Play the whole authored sequence over the action, including effect-only
      // frames. Attack collision remains driven by the original move data.
      const dur = Math.max(n, (act && act.dur) || n);
      i = f.charging ? Math.min(n - 1, Math.floor(n * 0.35))
        : clamp(Math.floor((f.actionT || 0) * n / dur), 0, n - 1);
      const authored = at.meta.actionTiming && at.meta.actionTiming[name];
      if (authored && !authored.fit) {
        // Curated rows identify their actual impact pose. Never show its baked
        // slash during startup, and hold it precisely while the hitbox is live.
        i = attackIndex(f, frames, { k: authored.strike, wind: authored.wind });
      }
      if (f.key === 'tide' && name === 'uspecial' && act) {
        // Anticipation, gathering, takeoff and the flight each own a pose;
        // never advance into the jump before the water has completed its loop.
        const t = f.actionT | 0, start = act.startup || 1;
        i = t < 3 ? 0 : t < start ? 1 : t < start + 5 ? 2 :
          t < start + 10 ? 3 : t < start + 16 ? 4 : 5;
      }
      if (f.key === 'nomad' && name === 'uspecial' && act && act.vinePull)
        i = clamp(Math.floor(act.vinePull.t * n / act.vinePull.duration), 0, n-1);
      if (f.charging) wob = Math.sin((f.chargeT | 0) * 0.42);       // the windup shakes
      swing = act && (act.spinAxe || ((f.key === 'tide' || f.key === 'nomad') && name === 'uspecial')) ? null : attackSwing(f, frames.length >= 3 ? 0.34 : frames.length === 2 ? 0.72 : 1);
    } else {
      i = rowIndex(c, spec, frames, f.actionT | 0, (act && act.dur) || 1);
      if (spec.pulse) wob = Math.sin(c.t * 0.085) * spec.pulse;
    }
    const prog = spec.stride ? c.p : c.t / Math.max(1, spec.step || DEFAULT_STEP);
    /* Smooth transitions between sprite cells.  A loop row is a handful of tiles and
       the clock lands on whole ones, so the pose holds for 4-6 ticks and then changes
       instantly — with 8-frame rows now on every sheet, that hold is the only thing
       left that reads as stepping.  `mix` says how far into the current tile this frame
       sits and which tile follows it, so the draw can dissolve one into the other over
       the back half of the hold: the pose stays crisp for the first half of its life
       (that is what makes a frame readable) and is never 50/50 with its neighbour.
       Loops only.  A strike tile IS the hit window, and fading it into the
       follow-through is how you get a fighter that visually whiffs a connected move. */
    let mix = null;
    if (!phase && n > 2 && !spec.once && !spec.hold && !spec.fit && SMOOTH && !at.meta.actionTiming) {
      const fr = prog - Math.floor(prog);
      if (fr > 0.5) mix = { j: (i + 1) % n, f: SMOOTH_K * (fr - 0.5) / 0.5 };
    }
    return { at, name, frames, i: clamp(i, 0, n - 1), wob, prog, clock: c.t, swing, mix,
      vfx: phase ? vfxGate(f) : 1,
      phase: phase || undefined };
  }

  /* Legacy-compatible alias (used by the HUD portraits/tests). */
  function pickFrame(f, time) {
    const p = pickAnim(f, time);
    return p ? p.i : 0;
  }

  /* ---------------- pose derivation ---------------- */
  // returns a simple skeleton spec; all coords in unflipped local space, feet at 0,0, facing +x
  function getPose(f) {
    const t = f.animT;
    const st = f.state;
    const p = {
      hipY: -46, torso: -46, torsoLean: 0, headY: -92, headX: 2, headTilt: 0,
      armF: [-16, -34, 0.6, 0.35], armB: [-34, -30, 0.5, 0.3], // shoulder angle, elbow, upper len, fore len
      legF: [8, 0.0, -44, 0.02], legB: [-8, 0.0, -44, 0.02],
      weaponA: -0.6, weaponExt: 1, crouch: 0, squash: 1, tilt: 0,
      fx: null,
    };
    const spd = Math.abs(f.vx);
    switch (st) {
      case 'idle': {
        const b = Math.sin(t * 0.07) * 1.6;
        p.hipY = -46 + b * 0.4; p.headY = -92 + b; p.torsoLean = -0.04;
        p.armF = [-10, -40, 0.55, 0.32]; p.armB = [-38, -26, 0.5, 0.3];
        p.legF = [10, 0, -46, 0]; p.legB = [-10, 0, -46, 0];
        p.weaponA = -0.85 + Math.sin(t * 0.05) * 0.05;
        break;
      }
      case 'walk': {
        const s = Math.sin(t * 0.22);
        p.hipY = -45 + Math.abs(s) * -1.5; p.headY = -91 + Math.abs(s) * -1.5;
        p.legF = [10 + s * 16, Math.max(0, s) * 6, -46, s * 0.5];
        p.legB = [-10 - s * 16, Math.max(0, -s) * 6, -46, -s * 0.5];
        p.armF = [-8 - s * 14, -34, 0.55, 0.3]; p.armB = [-30 + s * 14, -28, 0.5, 0.3];
        p.torsoLean = 0.06 * f.dirX;
        break;
      }
      case 'run': {
        const s = Math.sin(t * 0.42);
        p.hipY = -44 - Math.abs(s) * 3; p.headY = -90 - Math.abs(s) * 3;
        p.legF = [12 + s * 26, Math.max(0, s) * 16, -46, s * 0.7];
        p.legB = [-12 - s * 26, Math.max(0, -s) * 16, -46, -s * 0.7];
        p.armF = [-4 - s * 30, -50, 0.55, 0.32]; p.armB = [-40 + s * 30, -22, 0.5, 0.3];
        p.torsoLean = 0.16;
        p.weaponA = 0.25;
        break;
      }
      case 'jump': case 'air': {
        const rising = f.vy < 0;
        p.legF = [16, rising ? 26 : 8, -40, 0.4]; p.legB = [-14, rising ? 10 : 34, -40, -0.3];
        p.armF = [-20, rising ? -80 : -20, 0.5, 0.32]; p.armB = [-50, rising ? -60 : 10, 0.5, 0.3];
        p.hipY = -48; p.headY = -94;
        p.weaponA = rising ? -1.4 : -0.4;
        break;
      }
      case 'doublejump': {
        const s = Math.sin(t * 0.5);
        p.legF = [22, 40, -38, 0.5]; p.legB = [-18, 20, -38, -0.5];
        p.armF = [-60, -40, 0.5, 0.3]; p.armB = [-80, -20, 0.5, 0.3];
        p.torsoLean = -0.1; p.weaponA = -1.9; p.spin = s;
        break;
      }
      case 'fall': {
        p.legF = [10, 8, -42, 0.1]; p.legB = [-14, 20, -42, -0.1];
        p.armF = [-30, -70, 0.5, 0.3]; p.armB = [-70, -50, 0.5, 0.3];
        p.weaponA = -0.2;
        break;
      }
      case 'fastfall': {
        p.legF = [6, 0, -46, 0]; p.legB = [-8, 6, -46, 0];
        p.armF = [-4, -100, 0.5, 0.3]; p.armB = [-100, -70, 0.5, 0.3];
        p.weaponA = 0.5; p.torsoLean = 0.08;
        break;
      }
      case 'crouch': {
        p.hipY = -30; p.headY = -74; p.legF = [16, 40, -30, 0]; p.legB = [-16, 40, -30, 0];
        p.armF = [-6, 10, 0.5, 0.3]; p.armB = [-34, -10, 0.5, 0.3];
        p.weaponA = 0.3; break;
      }
      case 'land': {
        const k = clamp(f.actionT / 10, 0, 1);
        p.hipY = -46 + k * 16; p.headY = -92 + k * 18;
        p.legF = [16 + k * 10, 40 * k, -46, 0]; p.legB = [-16 - k * 10, 40 * k, -46, 0];
        p.armF = [-6, 10 * k, 0.5, 0.3]; p.armB = [-34, -10, 0.5, 0.3];
        break;
      }
      case 'hitstun': case 'launch': {
        const k = clamp(f.hitT * 0.12, 0, 1);
        p.torsoLean = -0.35 * k; p.headTilt = -0.4 * k;
        p.armF = [20, -110, 0.5, 0.32]; p.armB = [30, -100, 0.5, 0.3];
        p.legF = [22, 30, -44, 0.2]; p.legB = [-20, 10, -44, -0.2];
        p.weaponA = 1.2;
        break;
      }
      case 'shield': {
        p.hipY = -40; p.headY = -86;
        p.legF = [12, 22, -42, 0]; p.legB = [-12, 22, -42, 0];
        p.armF = [10, -70, 0.5, 0.32]; p.armB = [-20, -70, 0.5, 0.3];
        p.weaponA = 0.4; p.crouch = 1; break;
      }
      case 'spotdodge': {
        const k = Math.sin(clamp(f.actionT / 18, 0, 1) * Math.PI);
        p.torsoLean = -0.3 * k; p.headX = -6 * k; p.hipY = -40 - 6 * k;
        break;
      }
      case 'roll': {
        const k = clamp(f.actionT / f.action.dur, 0, 1);
        p.spin = k * TAU * f.rollDir;
        break;
      }
      case 'airdodge': {
        p.torsoLean = -0.5; p.legF = [30, 60, -38, 0.6]; p.legB = [-30, 60, -38, -0.6];
        p.armF = [-30, -120, 0.5, 0.3]; p.armB = [-120, -120, 0.5, 0.3];
        break;
      }
      case 'grab': case 'grabbing': {
        p.armF = [10, 4, 0.62, 0.34]; p.armB = [-6, 0, 0.6, 0.32]; p.torsoLean = 0.12;
        p.weaponA = 0.9; break;
      }
      case 'grabbed': {
        p.torsoLean = 0.3; p.armF = [40, -30, 0.5, 0.3]; p.armB = [-40, -20, 0.5, 0.3];
        p.legF = [10, 20, -40, 0]; p.legB = [-10, 30, -40, 0]; p.weaponA = 1.4; break;
      }
      case 'ledge': {
        p.torsoLean = 0; p.hipY = -50; p.headY = -92;
        p.armF = [-70, -10, 0.55, 0.3]; p.armB = [-80, -10, 0.55, 0.3];
        p.legF = [10, 20, -42, 0]; p.legB = [-6, 40, -42, 0]; p.weaponA = 1.5; break;
      }
      case 'helpless': {
        p.legF = [8, 10, -42, 0]; p.legB = [-10, 16, -42, 0];
        p.armF = [-10, -60, 0.5, 0.3]; p.armB = [-60, -80, 0.5, 0.3]; p.headTilt = 0.2; break;
      }
      case 'respawn': {
        p.armF = [-20, -80, 0.5, 0.32]; p.armB = [-80, -80, 0.5, 0.3]; p.legF = [10, 30, -42, 0]; break;
      }
      case 'taunt': {
        const k = Math.sin(t * 0.16) * 0.5 + 0.5;
        p.armF = [-40 - k * 120, -20, 0.5, 0.3]; p.weaponA = -2.2 - k; p.headTilt = -0.15;
        break;
      }
      case 'grabbing_hold': break;
      default: break;
    }
    return p;
  }

  /* attack pose interpolation */
  function attackPose(f) {
    const a = f.action; if (!a) return null;
    const p = getPose(f);
    const type = a.poseType || 'swing';
    const dir = a.dir || 'f';
    /* attackPhase() is the same window map pickAnim uses, so the drawn limb is
       fully extended on exactly the ticks the hitbox is live: the vector fallback
       and the sprite can never disagree about when the blow lands.  Recovery used
       to ease the limb *back out* to full extension at the end of the move, which
       is what made attacks read as if they ended late. */
    const ph = attackPhase(f);
    const wind = ph.phase === 0 ? eased(ph.p) : ph.phase === 1 ? 1 : 1 - eased(ph.p);
    const swing = ph.phase === 0 ? -wind : ph.phase === 1 ? 1 : wind;
    switch (type) {
      case 'jab': {
        p.armF = [-6 + swing * 8, -88 - swing * 6, 0.55 + 0.25 * Math.max(0, swing), 0.3];
        p.torsoLean = 0.12 * swing; break;
      }
      case 'swing': {
        if (dir === 'f') { p.armF = [-30 + swing * 90, -70 + swing * 20, 0.58, 0.32]; p.weaponA = -2.0 + swing * 2.6; p.torsoLean = 0.14 * swing; }
        if (dir === 'u') { p.armF = [-90 + swing * 40, -120 + swing * 60, 0.6, 0.3]; p.weaponA = -2.4 + swing * 2.2; p.torsoLean = -0.1 * swing; }
        if (dir === 'd') { p.armF = [-10 + swing * 30, 40 - swing * 60, 0.55, 0.3]; p.weaponA = 1.2 - swing * 2.0; p.torsoLean = 0.24 * swing; p.hipY = -40; }
        break;
      }
      case 'punch': {
        p.armF = [-10 + swing * 14, -92 + swing * 4, 0.6 + 0.2 * Math.max(0, swing), 0.32];
        p.armB = [-40 + swing * 6, -40, 0.5, 0.3]; p.torsoLean = 0.2 * swing; break;
      }
      case 'kick': {
        p.legF = [20 + swing * 60, 0 + swing * 10, -44, 0.2]; p.torsoLean = -0.2 * swing; break;
      }
      case 'spin': {
        p.spin = swing * TAU; p.armF = [-20, -90, 0.6, 0.32]; p.weaponA = 0; break;
      }
      case 'air': {
        const d = a.aerialDir || 'n';
        if (d === 'n') { p.armF = [-20, -90, 0.6, 0.3]; p.armB = [-100, -60, 0.6, 0.3]; p.spin = swing * TAU; p.legF = [20, 60, -40, 0.4]; }
        if (d === 'f') { p.armF = [-10 + swing * 20, -100, 0.62, 0.32]; p.weaponA = -1.6 + swing * 1.8; p.legF = [30, 40, -40, 0.5]; }
        if (d === 'b') { p.torsoLean = -0.2; p.armF = [-140 + swing * 20, -60, 0.6, 0.32]; p.weaponA = 2.6 - swing * 2.0; p.legF = [-30, 20, -40, -0.4]; }
        if (d === 'u') { p.armF = [-60, -160, 0.6, 0.3]; p.weaponA = -1.2 + swing * 1.4; p.legF = [10, 30, -42, 0.2]; p.legB = [-10, 40, -42, -0.2]; }
        if (d === 'd') { p.armF = [-30, 60, 0.6, 0.3]; p.weaponA = 1.4 - swing * 0.4; p.legF = [10, 70, -40, 0.4]; p.legB = [-10, 60, -40, -0.4]; p.torsoLean = 0.3; }
        break;
      }
      case 'grab': {
        p.armF = [-4 + swing * 16, -20, 0.6, 0.34]; p.armB = [-14 + swing * 10, -14, 0.58, 0.32]; break;
      }
      case 'special': {
        const d = a.specialDir || 'n';
        if (d === 'n') { p.armF = [-20 + swing * 30, -80, 0.6, 0.34]; p.weaponA = -1.2 + swing * 1.0; p.torsoLean = -0.06; }
        if (d === 's') { p.armF = [0, 60, 0.6, 0.34]; p.weaponA = 0.6; p.torsoLean = 0.3; p.hipY = -40; }
        if (d === 'u') { p.armF = [-100, -160, 0.6, 0.32]; p.weaponA = -2.6; p.legF = [10, 50, -40, 0.2]; }
        if (d === 'd') { p.armF = [-30, 40, 0.6, 0.32]; p.weaponA = 1.2; p.torsoLean = 0.2; p.hipY = -38; }
        break;
      }
    }
    return p;
  }
  function eased(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  /* ---------------- weapons ---------------- */
  function drawWeapon(ctx, f, x, y, ang, pal) {
    const w = f.def.weapon;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    const L = f.def.weaponLen * (f.def.stats.size || 1);
    switch (w) {
      case 'sword': {
        poly(ctx, [[0, -3], [L * 0.82, -2.2], [L, 0], [L * 0.82, 2.2], [0, 3]], '#dfe8f5');
        poly(ctx, [[0, -1], [L * 0.8, -0.9], [L * 0.95, 0], [L * 0.8, 0.9], [0, 1]], '#ffffff');
        ctx.fillStyle = pal.accent; ctx.fillRect(-2, -6, 5, 12);
        ctx.fillStyle = shade(pal.accent, -0.4); ctx.fillRect(-12, -2, 12, 4);
        ctx.fillStyle = '#2a2f3a'; ctx.fillRect(-16, -3, 5, 6);
        break;
      }
      case 'staff': {
        ctx.fillStyle = shade(pal.secondary, 0.15);
        ctx.fillRect(-L * 0.35, -2.2, L * 1.05, 4.4);
        ctx.fillStyle = pal.accent;
        ctx.beginPath(); ctx.arc(L * 0.72, 0, 9, 0.4, TAU - 0.9); ctx.lineWidth = 4; ctx.strokeStyle = pal.accent; ctx.stroke();
        circle(ctx, L * 0.72, -8, 3.2, '#ffffff');
        break;
      }
      case 'fists': {
        circle(ctx, 2, 0, 11, shade(pal.primary, -0.25));
        circle(ctx, 3, -2, 8.5, pal.primary);
        ctx.strokeStyle = pal.accent; ctx.globalAlpha = 0.85; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(3, -2, 8.5, -0.6, 1.6); ctx.stroke(); ctx.globalAlpha = 1;
        break;
      }
      case 'daggers': {
        poly(ctx, [[0, -2], [L, -1.2], [L + 8, 0], [L, 1.2], [0, 2]], '#e6f2ee');
        ctx.fillStyle = pal.accent; ctx.fillRect(-3, -4, 4, 8);
        break;
      }
      case 'rifle': {
        ctx.fillStyle = shade(pal.primary, -0.45);
        ctx.fillRect(-14, -4, L * 0.9, 8);
        ctx.fillStyle = '#20262f'; ctx.fillRect(-14, -5.5, L * 0.35, 11);
        ctx.fillStyle = pal.accent; ctx.fillRect(L * 0.45, -3, L * 0.34, 6);
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.8; ctx.fillRect(L * 0.72, -1.4, L * 0.2, 2.8); ctx.globalAlpha = 1;
        break;
      }
      default: break;
    }
    ctx.restore();
  }

  /* ---------------- vector primitives ----------------
   * Filled shapes used by the fallback fighter below.  These were called by
   * drawFighter but never defined, so any fighter without raster art (the first
   * frames before the atlases resolve, mob/assist bodies, or a failed sheet)
   * threw a ReferenceError out of the whole render pass. */
  function circle(ctx, x, y, r, fill) {
    if (!(r > 0)) return;
    ctx.save();
    ctx.fillStyle = fill || '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function poly(ctx, pts, fill) {
    if (!pts || pts.length < 3) return;
    ctx.save();
    ctx.fillStyle = fill || '#ffffff';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* Tapered rounded segment — the limb primitive. */
  function capsule(ctx, x0, y0, x1, y1, r0, r1, fill) {
    if (!Number.isFinite(x0 + y0 + x1 + y1)) return;
    r0 = Math.max(0.2, r0 || 1); r1 = Math.max(0.2, r1 === undefined ? r0 : r1);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const len = Math.hypot(x1 - x0, y1 - y0);
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(ang);
    ctx.fillStyle = fill || '#ffffff';
    ctx.beginPath();
    // arc the wide end, straight edges, arc the narrow end
    ctx.arc(0, 0, r0, Math.PI * 0.5, -Math.PI * 0.5, false);
    ctx.lineTo(len, -r1);
    ctx.arc(len, 0, r1, -Math.PI * 0.5, Math.PI * 0.5, false);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- fighter ---------------- */
  function drawFighter(ctx, f, time) {
    const def = f.def, s = def.stats.size * 1.34, pal = f.pal;
    const pose = (f.action && f.state === 'attack') ? (attackPose(f) || getPose(f)) : getPose(f);

    ctx.save();
    ctx.translate(f.x, f.y);

    // ground shadow
    if (f.groundDist >= 0 && f.groundDist < 240) {
      const a = clamp(1 - f.groundDist / 240, 0, 1) * 0.42;
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(0, f.groundDist, 34 * s, 9 * s, 0, 0, TAU); ctx.fill(); ctx.restore();
    }

    // spin/rotation (rolls, spins)
    if (pose.spin) { ctx.translate(0, -46 * s); ctx.rotate(pose.spin); ctx.translate(0, 46 * s); }

    ctx.scale(f.facing * s, s);

    const flashing = f.flashT > 0;
    const inv = f.invincT > 0 || f.respawnT > 0;
    if (inv && Math.floor(time / 4) % 2 === 0) ctx.globalAlpha = 0.55;

    const skin = pal.skin, hair = pal.hair, prim = pal.primary, sec = pal.secondary, acc = pal.accent, cloth = pal.cloth;
    const dark = shade(prim, -0.35), light = shade(prim, 0.25);

    const lean = pose.torsoLean || 0;
    const hipY = pose.hipY * s, headY = pose.headY * s;
    const hipX = lean * 6 * s;

    // ---- back leg / arm
    const legB = pose.legB, armB = pose.armB;
    const lbFoot = [legB[0] * s * 0.5 + Math.sin(legB[3]) * 0, -Math.abs(legB[2]) * 0 + legB[2] * s * 0.02];
    capsule(ctx, hipX - 6 * s, hipY, (legB[0]) * 1.0 * s * 0.5, legB[2] * 0.46 * s, 7.5 * s, 5.5 * s, shade(cloth, -0.28));
    capsule(ctx, (legB[0]) * s * 0.5, legB[2] * 0.46 * s, (legB[0] + legB[1] * 0.4) * s * 0.6, legB[2] * s * 0.02, 5.5 * s, 4.2 * s, shade(cloth, -0.28));
    ctx.save(); ctx.translate((legB[0] + legB[1] * 0.4) * s * 0.6, legB[2] * s * 0.02);
    ctx.fillStyle = shade(hair, -0.1); ctx.fillRect(-6 * s, -2 * s, 15 * s, 5 * s); ctx.restore();

    const shB = [armB[0] * s * 0.3 + hipX, hipY - 32 * s];
    const elB = [shB[0] + Math.cos(armB[1] * Math.PI / 180) * armB[2] * 34 * s, shB[1] + Math.sin(armB[1] * Math.PI / 180) * armB[2] * 34 * s];
    const haB = [elB[0] + Math.cos(armB[1] * Math.PI / 180) * armB[3] * 40 * s, elB[1] + Math.sin(armB[1] * Math.PI / 180) * armB[3] * 40 * s];
    capsule(ctx, shB[0], shB[1], elB[0], elB[1], 6.5 * s, 5.4 * s, shade(prim, -0.3));
    capsule(ctx, elB[0], elB[1], haB[0], haB[1], 5.4 * s, 4.6 * s, shade(skin, -0.22));

    // ---- torso
    const shoulderY = headY + 14 * s;
    ctx.beginPath();
    ctx.moveTo(hipX - 11 * s, hipY + 4 * s);
    ctx.quadraticCurveTo(hipX - 13 * s + lean * 10 * s, (hipY + shoulderY) / 2, hipX - 14 * s + lean * 16 * s, shoulderY);
    ctx.lineTo(hipX + 14 * s + lean * 16 * s, shoulderY);
    ctx.quadraticCurveTo(hipX + 13 * s + lean * 8 * s, (hipY + shoulderY) / 2, hipX + 11 * s, hipY + 4 * s);
    ctx.closePath();
    const grd = ctx.createLinearGradient(-18 * s, shoulderY, 18 * s, hipY);
    grd.addColorStop(0, shade(prim, 0.4)); grd.addColorStop(0.45, light); grd.addColorStop(0.75, prim); grd.addColorStop(1, dark);
    ctx.fillStyle = grd; ctx.fill();
    // rim light (facing edge)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(acc, 0.5); ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.moveTo(hipX + 13 * s + lean * 15 * s, shoulderY + 2 * s);
    ctx.lineTo(hipX + 11 * s, hipY + 2 * s);
    ctx.stroke();
    ctx.restore();
    // chest accent stripe
    ctx.strokeStyle = acc; ctx.lineWidth = 2.4 * s; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(hipX + lean * 12 * s - 2 * s, shoulderY + 8 * s); ctx.lineTo(hipX + 3 * s, hipY - 2 * s); ctx.stroke();
    ctx.globalAlpha = 1;
    // belt
    ctx.fillStyle = shade(sec, -0.15); ctx.fillRect(hipX - 12 * s, hipY - 3 * s, 24 * s, 6 * s);
    ctx.fillStyle = acc; ctx.fillRect(hipX - 3 * s, hipY - 3.4 * s, 6 * s, 6.8 * s);

    // ---- cape / coat / scarf
    const capeSway = f.vx * 1.6 + Math.sin((f.animT | 0) * 0.045) * 3;
    if (def.locomotion === 'humanoid' || def.locomotion === 'mage') {
      ctx.beginPath();
      ctx.moveTo(hipX - 10 * s + lean * 10 * s, shoulderY + 2 * s);
      ctx.quadraticCurveTo(-30 * s - capeSway * s * 0.4, hipY + 4 * s, -26 * s - capeSway * s * 0.6, hipY + 30 * s);
      ctx.quadraticCurveTo(-8 * s, hipY + 20 * s, hipX + 8 * s, hipY + 2 * s);
      ctx.closePath();
      ctx.fillStyle = withAlpha(cloth, 0.92); ctx.fill();
      ctx.strokeStyle = withAlpha(acc, 0.5); ctx.lineWidth = 1.6 * s; ctx.stroke();
    }
    if (def.locomotion === 'ninja') {
      ctx.fillStyle = withAlpha(cloth, 0.95);
      ctx.beginPath();
      ctx.moveTo(hipX + 2 * s, shoulderY);
      ctx.quadraticCurveTo(-26 * s - capeSway * s, shoulderY - 4 * s, -40 * s - capeSway * 1.4 * s, shoulderY + 22 * s);
      ctx.quadraticCurveTo(-16 * s, shoulderY + 12 * s, hipX + 6 * s, shoulderY + 10 * s);
      ctx.closePath(); ctx.fill();
    }
    if (def.locomotion === 'gunner') {
      // duster tails
      ctx.fillStyle = withAlpha(cloth, 0.95);
      poly(ctx, [[hipX - 12 * s, hipY - 6 * s], [-24 * s - capeSway * 0.5 * s, hipY + 34 * s], [2 * s, hipY + 26 * s], [hipX + 10 * s, hipY - 4 * s]], withAlpha(cloth, 0.95));
      ctx.strokeStyle = withAlpha(acc, 0.55); ctx.lineWidth = 1.4 * s;
      ctx.beginPath(); ctx.moveTo(-22 * s - capeSway * 0.5 * s, hipY + 32 * s); ctx.lineTo(hipX - 8 * s, hipY + 4 * s); ctx.stroke();
    }
    if (def.locomotion === 'brute') {
      // rock shoulder plates
      circle(ctx, hipX - 12 * s + lean * 14 * s, shoulderY + 2 * s, 10 * s, shade(prim, -0.12));
      circle(ctx, hipX + 12 * s + lean * 14 * s, shoulderY + 2 * s, 10 * s, shade(prim, 0.06));
      ctx.strokeStyle = acc; ctx.lineWidth = 2 * s; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(hipX - 12 * s + lean * 14 * s, shoulderY + 2 * s, 6 * s, 0.4, 2.4); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ---- head
    const hx = hipX + lean * 20 * s + (pose.headX || 0) * s, hy = headY;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(pose.headTilt || 0);
    // neck
    ctx.fillStyle = shade(skin, -0.2); ctx.fillRect(-3.5 * s, 8 * s, 7 * s, 8 * s);
    // head shape
    circle(ctx, 0, 0, 13 * s, skin);
    ctx.fillStyle = withAlpha(shade(skin, -0.25), 0.5);
    ctx.beginPath(); ctx.arc(3 * s, 3 * s, 12 * s, -0.4, 1.9); ctx.fill();
    // hair
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(0, -2 * s, 13.4 * s, Math.PI * 0.92, Math.PI * 2.08);
    ctx.quadraticCurveTo(12 * s, -6 * s, 8 * s, 4 * s);
    ctx.quadraticCurveTo(2 * s, -2 * s, -13 * s, 4 * s);
    ctx.closePath(); ctx.fill();
    if (def.key === 'astra') {
      // long flowing hair
      ctx.beginPath();
      ctx.moveTo(-10 * s, -6 * s);
      ctx.quadraticCurveTo(-26 * s, 10 * s, -20 * s, 34 * s);
      ctx.quadraticCurveTo(-12 * s, 16 * s, -2 * s, 8 * s);
      ctx.closePath(); ctx.fillStyle = withAlpha(hair, 0.85); ctx.fill();
    }
    if (def.key === 'vesper') {
      // mask
      ctx.fillStyle = shade(cloth, -0.1);
      ctx.beginPath(); ctx.arc(1 * s, 3 * s, 11 * s, 0.15, Math.PI - 0.15); ctx.fill();
      ctx.fillStyle = acc; ctx.fillRect(4 * s, -3.5 * s, 7 * s, 2.4 * s);
    }
    if (def.key === 'rook') {
      // hat
      ctx.fillStyle = shade(cloth, -0.15);
      poly(ctx, [[-17 * s, -8 * s], [17 * s, -8 * s], [10 * s, -12 * s], [-9 * s, -12 * s]], shade(cloth, -0.1));
      ctx.fillRect(-9 * s, -21 * s, 18 * s, 10 * s);
      ctx.fillStyle = acc; ctx.fillRect(-9 * s, -13 * s, 18 * s, 2.2 * s);
      // goggle glint
      ctx.fillStyle = acc; ctx.fillRect(5 * s, -2 * s, 7 * s, 3 * s);
    } else {
      // eye
      ctx.fillStyle = '#10141c'; ctx.fillRect(5.5 * s, -1 * s, 3.4 * s, 3.6 * s);
      ctx.fillStyle = acc; ctx.globalAlpha = 0.9; ctx.fillRect(6.4 * s, -0.4 * s, 1.8 * s, 1.8 * s); ctx.globalAlpha = 1;
      // brow
      ctx.strokeStyle = shade(hair, -0.2); ctx.lineWidth = 1.6 * s;
      ctx.beginPath(); ctx.moveTo(4 * s, -4 * s); ctx.lineTo(10 * s, -3.4 * s); ctx.stroke();
    }
    if (def.key === 'grim') {
      // ember cracks
      ctx.strokeStyle = acc; ctx.lineWidth = 1.4 * s; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(-6 * s, -4 * s); ctx.lineTo(-2 * s, 2 * s); ctx.lineTo(-5 * s, 7 * s); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // ---- front leg
    const legF = pose.legF;
    capsule(ctx, hipX + 5 * s, hipY, legF[0] * s * 0.5, legF[2] * 0.46 * s, 8 * s, 6 * s, cloth);
    capsule(ctx, legF[0] * s * 0.5, legF[2] * 0.46 * s, (legF[0] + legF[1] * 0.4) * s * 0.6, legF[2] * s * 0.02, 6 * s, 4.6 * s, cloth);
    ctx.save(); ctx.translate((legF[0] + legF[1] * 0.4) * s * 0.6, legF[2] * s * 0.02);
    ctx.fillStyle = shade(prim, -0.2); ctx.fillRect(-7 * s, -2.4 * s, 17 * s, 5.4 * s);
    ctx.fillStyle = acc; ctx.globalAlpha = 0.6; ctx.fillRect(2 * s, -2.4 * s, 8 * s, 1.4 * s); ctx.globalAlpha = 1;
    ctx.restore();

    // ---- front arm + weapon
    const armF = pose.armF;
    const shF = [armF[0] * s * 0.3 + hipX, hipY - 32 * s];
    const elF = [shF[0] + Math.cos(armF[1] * Math.PI / 180) * armF[2] * 34 * s, shF[1] + Math.sin(armF[1] * Math.PI / 180) * armF[2] * 34 * s];
    const haF = [elF[0] + Math.cos(armF[1] * Math.PI / 180) * armF[3] * 40 * s, elF[1] + Math.sin(armF[1] * Math.PI / 180) * armF[3] * 40 * s];
    capsule(ctx, shF[0], shF[1], elF[0], elF[1], 7 * s, 5.8 * s, prim);
    capsule(ctx, elF[0], elF[1], haF[0], haF[1], 5.8 * s, 4.8 * s, shade(skin, 0.06));
    circle(ctx, haF[0], haF[1], 4.6 * s, skin);

    // weapon at hand
    let wang = pose.weaponA;      // already phase-mapped by attackPose()
    drawWeapon(ctx, f, haF[0], haF[1], wang, { primary: prim, secondary: sec, accent: acc });

    // ---- hit flash overlay
    if (flashing) {
      ctx.globalAlpha = clamp(f.flashT / 8, 0, 1) * 0.55;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(0, -52 * s, 26 * s, 46 * s, 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // ---- invincibility sparkle
    if (inv) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const a = time * 0.08 + i * 2.1;
        const sx = f.x + Math.cos(a) * 26 * s, sy = f.y - 52 * s + Math.sin(a * 1.3) * 34 * s;
        ctx.globalAlpha = 0.4 + Math.sin(a * 2) * 0.2;
        ctx.fillStyle = acc;
        ctx.beginPath(); ctx.arc(sx, sy, 2.4, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    // ---- shield bubble (drawn after)
    if (f.shieldHP > 0) {
      const r = 40 * s * (0.55 + 0.45 * f.shieldHP / 60);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(f.x, f.y - 50 * s, r * 0.2, f.x, f.y - 50 * s, r);
      g.addColorStop(0, withAlpha(acc, 0.05)); g.addColorStop(0.7, withAlpha(acc, 0.16)); g.addColorStop(1, withAlpha(acc, 0.42));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y - 50 * s, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = withAlpha('#ffffff', 0.5); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y - 50 * s, r, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  /* Tide's water emerges from her back, curves down behind her and curls
     just below her feet before changing into a vertical geyser. Coordinates
     are local to her feet, facing right; the whole effect is mirrored left. */
  function drawTideRecoveryWater(ctx, f, front) {
    const a = f.action, t = f.actionT | 0, start = a.startup || 1;
    if (t < 0 || t >= start + 26) return;
    const scale = f.scale || 1;
    ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.facing * scale, scale);

    // Three connected cubic segments: shoulder -> back -> underfoot loop ->
    // center of the soles. A growing stroke traces the path over startup.
    function cubic(p0, p1, p2, p3, q) {
      const k = 1-q;
      return {x:k*k*k*p0[0]+3*k*k*q*p1[0]+3*k*q*q*p2[0]+q*q*q*p3[0],
              y:k*k*k*p0[1]+3*k*k*q*p1[1]+3*k*q*q*p2[1]+q*q*q*p3[1]};
    }
    function point(u) {
      if (u < .48) return cubic([-34,-68],[-54,-67],[-65,-25],[-47,3],u/.48);
      if (u < .82) return cubic([-47,3],[-38,32],[36,34],[31,11],(u-.48)/.34);
      return cubic([31,11],[28,-2],[6,-2],[0,7],(u-.82)/.18);
    }
    const progress = clamp(t / Math.max(1, start - 1), 0, 1);
    const loopFade = t < start ? 1 : clamp(1 - (t - start + 1) / 4, 0, 1);
    if (loopFade > 0) {
      const steps = 60, end = Math.floor(progress * steps);
      const paint = (width, color) => {
        ctx.lineWidth=width;ctx.strokeStyle=color;ctx.lineCap='round';ctx.lineJoin='round';
        ctx.beginPath();let drawing=false;
        for (let j=0;j<=end;j++) {
          const u=j/steps, pt=point(u), isFront=u>=.48;
          if (isFront!==front) {drawing=false;continue;}
          if (!drawing) {ctx.moveTo(pt.x,pt.y);drawing=true;}
          else ctx.lineTo(pt.x,pt.y);
        }
        ctx.stroke();
      };
      ctx.globalAlpha=.95*loopFade;
      paint(15,'#087e9d');paint(9,'#4ad4e4');paint(2.5,'#e2ffff');
      const tip=point(progress), tipFront=progress>=.48 || t<=2;
      if (tipFront===front) {
        ctx.fillStyle='#b6faff';ctx.beginPath();ctx.arc(tip.x,tip.y,5,0,TAU);ctx.fill();
        ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(tip.x-1,tip.y-1,2,0,TAU);ctx.fill();
      }
    }

    // The completed curl compresses underfoot and becomes a vertical jet. Its
    // top stays attached to the soles while the trailing column extends below.
    if (!front && t >= start - 1) {
      const rise=t-start, grow=clamp((rise+2)/7,0,1), fade=clamp((26-rise)/6,0,1);
      const height=15+95*grow, w=18+16*grow, wob=Math.sin(t*.45)*3*grow;
      ctx.globalAlpha=.92*fade;
      ctx.fillStyle='#178caa';ctx.strokeStyle='#8ceef3';ctx.lineWidth=3;
      // The broad foamy head reaches both feet, including the rear foot in
      // the source's jump pose; the narrower jet trails down behind her.
      ctx.beginPath();ctx.moveTo(-45,-1);
      ctx.bezierCurveTo(-54,-6,-55,-18,-43,-22);
      ctx.bezierCurveTo(-36,-29,-25,-26,-21,-20);
      ctx.bezierCurveTo(-13,-30,0,-31,7,-22);
      ctx.bezierCurveTo(17,-29,30,-25,33,-16);
      ctx.bezierCurveTo(48,-16,49,-4,35,1);
      ctx.quadraticCurveTo(25,5,18,5);
      ctx.bezierCurveTo(18+wob,height*.35,w,height*.65,w+9,height);
      ctx.quadraticCurveTo(0,height-9,-w-9,height);
      ctx.bezierCurveTo(-w,height*.65,-18+wob,height*.35,-20,5);
      ctx.quadraticCurveTo(-31,5,-45,-1);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='#54d6e3';ctx.beginPath();ctx.moveTo(-10,4);
      ctx.bezierCurveTo(-12,height*.3,-w*.45,height*.67,-w*.55,height);
      ctx.quadraticCurveTo(0,height-12,w*.55,height);
      ctx.bezierCurveTo(w*.45,height*.67,12,height*.3,10,4);
      ctx.quadraticCurveTo(0,-3,-10,4);ctx.fill();
      ctx.strokeStyle='#e5ffff';ctx.lineCap='round';ctx.lineWidth=3;
      for (let i=0;i<3;i++) {
        const x=(i-1)*12, y=8+((t*6+i*23)%Math.max(16,height-8));
        ctx.beginPath();ctx.moveTo(x,y+12);ctx.quadraticCurveTo(x+4,y+6,x,y);ctx.stroke();
      }
      ctx.fillStyle='#ecffff';ctx.beginPath();ctx.arc(-40,-17,3,0,TAU);ctx.arc(-15,-22,2.5,0,TAU);ctx.arc(22,-19,3,0,TAU);ctx.fill();
    }
    ctx.restore();
  }

  // The launch flash is anchored to the rear shoulder, not the feet.
  function drawVectorRocket(ctx, f) {
    const dt=f.actionT-f.action.startup;
    if (dt < 0 || dt >= 20) return;
    const scale=f.scale || 1, pulse=1+0.18*Math.sin(dt*.8);
    ctx.save(); ctx.translate(f.x-f.facing*26*scale, f.y-82*scale);
    ctx.scale(scale*pulse,scale*pulse);ctx.globalAlpha=.85;
    ctx.fillStyle='#ff7a20';ctx.beginPath();ctx.moveTo(-9,0);ctx.quadraticCurveTo(-12,17,0,34);ctx.quadraticCurveTo(12,17,9,0);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fff2aa';ctx.beginPath();ctx.moveTo(-4,0);ctx.quadraticCurveTo(-5,10,0,20);ctx.quadraticCurveTo(5,10,4,0);ctx.closePath();ctx.fill();
    ctx.restore();
  }

  // Flames from the back thrusters bridge the launches and underline forward motion.
  function drawVectorRush(ctx, f) {
    const a=f.action, dt=f.actionT-a.startup;
    if (dt < 0 || dt >= a.active) return;
    const s=f.scale || 1, length=(38+8*Math.sin(dt*.9))*s;
    ctx.save();ctx.translate(f.x-f.facing*28*s,f.y-80*s);ctx.scale(-f.facing,1);
    ctx.globalAlpha=.9;ctx.fillStyle='#ff8025';ctx.beginPath();ctx.moveTo(0,-10*s);
    ctx.quadraticCurveTo(length*.55,-12*s,length,0);ctx.quadraticCurveTo(length*.55,12*s,0,10*s);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fff1ad';ctx.beginPath();ctx.moveTo(0,-4*s);ctx.quadraticCurveTo(length*.4,-5*s,length*.7,0);
    ctx.quadraticCurveTo(length*.4,5*s,0,4*s);ctx.closePath();ctx.fill();ctx.restore();
  }

  // Directional vine accents line up with the active F hitboxes and the
  // rising recovery; they are decorative and never add a second hitbox.
  function drawBriarVines(ctx, f) {
    const a=f.action, t=f.actionT;
    if (!a) return;
    const scale=f.scale||1;
    if (f.state==='special' && a.specialType==='vinedash' && t>=a.startup &&
        (t<a.startup+a.active || (f.grabbing && f.grabbing.vineGrabbed))) {
      const target=f.grabbing && f.grabbing.vineGrabbed ? f.grabbing : null;
      const reach=a.vineReach*Math.min(1,(t-a.startup+1)/4)*scale;
      const x0=f.x+f.facing*18*scale,y0=f.y-60*scale;
      const x1=target?target.x:f.x+f.facing*reach,y1=target?target.y-48*target.scale:f.y-60*scale;
      ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
      const vine=()=>{ctx.beginPath();ctx.moveTo(x0,y0);ctx.bezierCurveTo(x0+f.facing*38*scale,y0-22*scale,x1-f.facing*32*scale,y1+20*scale,x1,y1);};
      ctx.strokeStyle='#284a20';ctx.lineWidth=11*scale;vine();ctx.stroke();ctx.strokeStyle='#9acb54';ctx.lineWidth=4*scale;vine();ctx.stroke();
      ctx.fillStyle='#c7eb78';for(const q of [.35,.65,.9]){const x=lerp(x0,x1,q),y=lerp(y0,y1,q);ctx.beginPath();ctx.ellipse(x,y-5*scale,9*scale,4*scale,-f.facing*.55,0,TAU);ctx.fill();}
      ctx.restore();return;
    }
    if (f.state==='special' && a.vinePull) {
      const x0=f.x+f.facing*10*scale,y0=f.y-70*scale,x1=a.vinePull.edgeX,y1=a.vinePull.edgeY;
      ctx.save();ctx.lineCap='round';
      const vine=()=>{ctx.beginPath();ctx.moveTo(x0,y0);ctx.quadraticCurveTo((x0+x1)/2,(y0+y1)/2+18*scale,x1,y1);};
      ctx.strokeStyle='#26441e';ctx.lineWidth=11*scale;vine();ctx.stroke();ctx.strokeStyle='#b3df67';ctx.lineWidth=4*scale;vine();ctx.stroke();
      ctx.fillStyle='#d6f6a0';ctx.beginPath();ctx.arc(x1,y1,5*scale,0,TAU);ctx.fill();ctx.restore();return;
    }
    const rise=f.state==='special' && a.leafRise && t>=a.startup && t<a.startup+20;
    if (rise) {
      // Two vines visibly shoot upward as the recovery starts.
      const grow=Math.min(1,(t-a.startup+1)/5);
      ctx.save();ctx.translate(f.x,f.y);ctx.scale(f.facing*scale,scale);ctx.lineCap='round';
      for (const dir of [-1,1]) {
        const vine=()=>{ctx.beginPath();ctx.moveTo(dir*12,-48);ctx.bezierCurveTo(dir*50,-70,dir*18,-105*grow-48,dir*45,-48-128*grow);};
        ctx.strokeStyle='#274a20';ctx.lineWidth=9;vine();ctx.stroke();ctx.strokeStyle='#a9db64';ctx.lineWidth=3;vine();ctx.stroke();
        ctx.fillStyle='#c9ef83';ctx.beginPath();ctx.ellipse(dir*34,-48-95*grow,9,4,dir*.6,0,TAU);ctx.fill();
      }
      ctx.restore();return;
    }
    const attack=f.state==='attack' && t>=a.startup && t<a.startup+a.active;
    const key=attack && a.key;
    if (!rise && !['utilt','usmash','uair','dtilt','dsmash','dair'].includes(key)) return;
    const down=['dtilt','dsmash','dair'].includes(key), aerialDown=key==='dair';
    const s=f.scale||1;
    ctx.save();ctx.translate(f.x,f.y);ctx.scale(f.facing*s,s);
    ctx.lineCap='round';ctx.lineJoin='round';
    const path=()=>{
      ctx.beginPath();ctx.moveTo(-20,-55);
      if (down) ctx.bezierCurveTo(10,-55,35,-22,aerialDown?2:80,aerialDown?35:-8);
      else ctx.bezierCurveTo(25,-55,42,-96,10,-135);
    };
    ctx.strokeStyle='#2a4d22';ctx.lineWidth=9;path();ctx.stroke();
    ctx.strokeStyle='#9dd65b';ctx.lineWidth=3;path();ctx.stroke();
    ctx.fillStyle='#a7dc60';
    const lx=down?(aerialDown?4:48):20, ly=down?(aerialDown?12:-22):-108;
    ctx.beginPath();ctx.moveTo(lx,ly);ctx.quadraticCurveTo(lx+16,ly-14,lx+20,ly-4);
    ctx.quadraticCurveTo(lx+10,ly+4,lx,ly);ctx.fill();
    if (key==='dsmash') {
      ctx.strokeStyle='#7db84d';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-12,-42);
      ctx.quadraticCurveTo(-50,-25,-84,-8);ctx.stroke();
    }
    ctx.restore();
  }

  // A bright energized cable ends in a clearly readable three-pronged hook.
  function drawNomadHook(ctx, f) {
    const a=f.action, p=a && a.vinePull;
    if (f.state!=='special' || !a || !a.hookTether || !p) return;
    const s=f.scale||1, x=f.x+f.facing*10*s, y=f.y-70*s;
    const mx=(x+p.edgeX)/2, my=(y+p.edgeY)/2+12*s;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    const cable=()=>{ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(mx,my,p.edgeX,p.edgeY);};
    ctx.strokeStyle='#063965';ctx.lineWidth=8*s;cable();ctx.stroke();
    ctx.shadowColor='#00aaff';ctx.shadowBlur=13*s;
    ctx.strokeStyle='#00baff';ctx.lineWidth=4*s;cable();ctx.stroke();
    ctx.strokeStyle='#d5faff';ctx.lineWidth=1.5*s;cable();ctx.stroke();
    // Small animated lightning strokes travel down the cable.
    for (const q of [.25,.55,.8]) {
      const u=(q+(f.actionT%12)/40)%1, v=1-u;
      const px=v*v*x+2*v*u*mx+u*u*p.edgeX, py=v*v*y+2*v*u*my+u*u*p.edgeY;
      ctx.strokeStyle='#7ae8ff';ctx.lineWidth=2*s;ctx.beginPath();
      ctx.moveTo(px-5*s,py-6*s);ctx.lineTo(px-1*s,py-1*s);ctx.lineTo(px-4*s,py+1*s);ctx.lineTo(px+3*s,py+7*s);ctx.stroke();
    }
    ctx.translate(p.edgeX,p.edgeY);ctx.rotate(Math.atan2(y-p.edgeY,x-p.edgeX));
    // Three separate curved tines: center, upper and lower, all joined to a
    // common shank. Their silhouette remains visible on either ledge.
    const hook=()=>{
      ctx.beginPath();ctx.moveTo(17*s,0);ctx.lineTo(3*s,0);
      ctx.moveTo(3*s,0);ctx.lineTo(-13*s,0);ctx.lineTo(-16*s,-3*s);
      ctx.moveTo(3*s,0);ctx.quadraticCurveTo(-4*s,-3*s,-6*s,-10*s);ctx.lineTo(-14*s,-13*s);
      ctx.moveTo(3*s,0);ctx.quadraticCurveTo(-4*s,3*s,-6*s,10*s);ctx.lineTo(-14*s,13*s);
    };
    ctx.strokeStyle='#07395d';ctx.lineWidth=8*s;hook();ctx.stroke();
    ctx.strokeStyle='#08c8ff';ctx.lineWidth=4.5*s;hook();ctx.stroke();
    ctx.strokeStyle='#e4fbff';ctx.lineWidth=1.5*s;hook();ctx.stroke();
    ctx.fillStyle='#c6f8ff';ctx.beginPath();ctx.arc(3*s,0,3.5*s,0,TAU);ctx.fill();ctx.restore();
  }

  /* ---- draw a fighter from the roster atlas ----
   *
   * One transform for the whole frame: translate to the fighter's feet, mirror
   * on `facing`, then blit the body tile and any baked VFX tiles at their
   * anchor-relative offsets.  The atlas art is authored facing RIGHT, so
   * `artFacing` is only an escape hatch for hand-swapped art (data.js sets 1).
   * Rotations for hitstun/launch are baked into the derived tiles by the
   * slicer, so the renderer must not lean them a second time. */
  function drawSpriteFighter(ctx, f, time) {
    const hang = LEDGE_ART[f.key];
    if (f.state === 'ledge' && f.ledge && hang) {
      const scale = (TARGET_H[f.key] || 108) * 1.15 * (f.scale || 1) / hang.img.height;
      const vi = (f.palIdx || 0) % VARIANTS.length;
      const img = vi === 0 ? hang.img : tinted(hang, vi);
      ctx.save();
      if (f.ledgeInvuln > 0 && Math.floor(f.animT / 4) % 2 === 0) ctx.globalAlpha = .65;
      if (f.buffs.metal > 0) ctx.filter = 'grayscale(0.6) brightness(1.15)';
      // The approved art faces right; mirror it on the right-hand ledge.
      // Its hand, rather than its feet, is the point fixed to the stage lip.
      ctx.translate(f.ledge.x, f.y + 8);
      // A small anchored sway keeps a single approved pose alive; the gripping
      // hand remains fixed at the ledge instead of sliding around.
      ctx.rotate(Math.sin(f.animT * .055) * .025 * f.facing);
      ctx.scale(f.facing * scale, scale);
      ctx.drawImage(img, -hang.anchor.handX, -hang.anchor.handY);
      ctx.restore();
      return true;
    }
    const sel = pickAnim(f, time);
    if (!sel) return false;
    const at = sel.at;
    // The orbiting spectral weapon replaces the stationary axe in this pose.
    const spinning = f.state === 'special' && f.action && f.action.spinAxe &&
      f.actionT >= f.action.startup && f.actionT < f.action.startup + f.action.active;
    const ent = spinning && at.meta.spinBody ? at.meta.spinBody : sel.frames[sel.i];
    if (!ent) return false;
    const def = f.def;
    const s = at.scale * (f.scale || 1);
    const body = at.tiles[ent[0]];
    const w = body.w * s, h = body.h * s;

    /* The body drops at footfall (an integer tile) and rises mid-step, driven by
       the same stride progress the tiles use — so the bob speeds up and slows down
       with the fighter instead of drifting out of sync with it. */
    const moving = (f.state === 'walk' || f.state === 'run' || f.state === 'turn');
    const tk = f.animT | 0;                       // game ticks, never wall clock
    const ft = sel.clock === undefined ? tk : sel.clock;   // fractional: glides between ticks
    const step = (sel.prog || 0) % 1;
    const bob = f.state === 'idle' ? Math.sin(ft * 0.052 + f.id) * 0.7
      : f.state === 'turn' ? -0.7
      : moving ? (0.5 - Math.abs(step - 0.5)) * -2.8 : 0;   // stride-synced, so already fractional
    const dashing = (f.dashT | 0) > 0;
    let lean = f.state === 'run' ? (dashing ? 0.14 : 0.05) : 0;
    if (f.state === 'turn') lean = -0.07;                     // leaning on the brakes
    let squash = 1;
    if (f.state === 'land') squash = 1 + 0.11 * (1 - Math.min(1, (f.actionT | 0) / 7));
    if (f.state === 'jump' && (f.stateT | 0) < 6) squash *= 1.06;   // take-off stretch
    if (f.state === 'fastfall') squash *= 0.93;                    // vertical smear
    else if (f.state === 'fall' && f.vy > 6) squash *= 0.97;
    if (f.hitlag > 0) squash *= 0.985;                             // impact reaction
    if (sel.wob) {
      squash *= 1 + sel.wob * 0.012;                    // charge pulse / shield breath
      lean += sel.wob * 0.022;
    }
    /* The synthesised swing rides on top of the tile (see attackSwing): the drawn
       frame leans back through startup, is thrown forward for the whole hit
       window, and eases out during recovery — the lean is what makes a smash with
       only one frame of art still read as a wind-up rather than a teleport.  Most
       attack rows on these sheets are 1–2 tiles with the effect painted into the
       tile, so this transform is the whole difference between anticipation and
       impact: without it, the finished crescent is on screen from tick 0. */
    const sw = sel.swing;
    const fs = (f.scale || 1);
    if (sw) { lean += sw.lean; squash *= sw.sq; }

    // ground shadow
    if (f.groundDist >= 0 && f.groundDist < 240) {
      ctx.save();
      ctx.globalAlpha = clamp(1 - f.groundDist / 240, 0, 1) * 0.45;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(f.x, f.y + f.groundDist, w * 0.30, 7.2, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }

    const vi = (f.palIdx || 0) % VARIANTS.length;
    const src = vi === 0 ? at.img : tinted(at, vi);
    // Marrow, Tide and Vector reuse forward-facing sweep art for back air; mirror it
    // so the live strike reads on the same side as the hitbox.
    const backAir = (f.key === 'marrow' || f.key === 'tide' || f.key === 'vector' || f.key === 'briar' || f.key === 'nomad') && f.state === 'attack' && f.action && f.action.key === 'bair';
    const dir = f.facing * (def.artFacing === undefined ? 1 : def.artFacing) * (backAir ? -1 : 1);

    const tideRise = f.key === 'tide' && f.state === 'special' && f.action && f.action.specialKey === 'u';
    if (tideRise) drawTideRecoveryWater(ctx, f, false);
    if (f.key === 'vector' && f.state === 'special' && f.action && f.action.specialKey === 'u') drawVectorRocket(ctx, f);
    if (f.key === 'vector' && f.state === 'special' && f.action && f.action.specialKey === 's' && f.action.rocketRush) drawVectorRush(ctx, f);
    if (f.key === 'briar') drawBriarVines(ctx, f);
    if (f.key === 'nomad') drawNomadHook(ctx, f);

    ctx.save();
    const inv = f.invincT > 0 || f.respawnT > 0 || f.buffs.star > 0 || f.spawnProtect > 0;
    if (inv && Math.floor(tk / 4) % 2 === 0) ctx.globalAlpha = 0.45;
    if (f.buffs.metal > 0) ctx.filter = 'grayscale(0.6) brightness(1.15)';

    ctx.translate(f.x + (f.shakeX || 0), f.y + bob + (f.shakeY || 0));
    if (sw) ctx.translate(sw.dx * fs * dir, sw.dy * fs);   // thrown along the facing

    // roll spin (the sliced roll rows are a 2-frame tumble; finish the arc)
    if (f.state === 'roll') {
      const k = clamp((f.actionT || 0) / ((f.action && f.action.dur) || 26), 0, 1);
      /* How much of the turn the row leaves to finish.  The sheets drew two poses, so
         the renderer used to carry the whole revolution; a row with four real tumbles
         (tools/slice_rows.py injects those) already shows most of it, and spinning a
         full turn on top of that turns the roll into a washing machine. */
      const rest = (sel.frames && sel.frames.length >= 4) ? 0.25 : 1;
      ctx.translate(0, -h * 0.5);
      ctx.rotate(k * TAU * rest * ((f.rollDir || f.facing) > 0 ? 1 : -1));
      ctx.translate(0, h * 0.5);
    }
    if (f.state === 'ledge') { ctx.translate(0, 5); ctx.rotate(0.05); }

    const stx = sw && sw.sx ? sw.sx : 1;
    ctx.scale(dir * squash * stx * s, (2 - squash) / stx * s);
    if (lean) ctx.rotate(lean * dir);
    if (sel.mix && sel.frames[sel.mix.j]) {
      /* Two cells of the same row, one dissolve: the ink fades across, the baked glow
         keeps burning at full strength underneath it (see blit's `only`). */
      const pa = ctx.globalAlpha;
      ctx.globalAlpha = pa * (1 - sel.mix.f);
      blit(ctx, at, src, ent, false, 0, 'body');
      ctx.globalAlpha = pa * sel.mix.f;
      blit(ctx, at, src, sel.frames[sel.mix.j], false, 0, 'body');
      ctx.globalAlpha = pa;
      blit(ctx, at, src, ent, false, sel.vfx, 'vfx');
    } else {
      blit(ctx, at, src, ent, false, sel.vfx);
    }
    ctx.restore();                    // also drops the metal filter
    if (tideRise) drawTideRecoveryWater(ctx, f, true);

    // The neutral charge gauge shows Marrow's power or Tide's wave duration.
    const action = f.action;
    if (f.state === 'special' && action && (action.specialType === 'soulreap' || action.specialType === 'tidewave') && f.charging) {
      const p = clamp(f.chargeT / action.chargeFrames, 0, 1);
      const cx = f.x, cy = f.y - 68 * fs, radius = (30 + 16 * p) * fs;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = .25 + p * .4;
      ctx.strokeStyle = f.pal.accent; ctx.lineWidth = (2 + p * 4) * fs;
      ctx.beginPath(); ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(.04,p)); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = .95;
      const width = 68 * fs, barY = f.y - 158 * fs;
      ctx.fillStyle = '#121222'; ctx.fillRect(cx - width / 2 - 2, barY - 2, width + 4, 9 * fs + 4);
      ctx.fillStyle = action.specialType === 'tidewave' ? '#12657c' : '#6d2ca8'; ctx.fillRect(cx - width / 2, barY, width, 9 * fs);
      ctx.fillStyle = p >= 1 ? '#ffffff' : action.specialType === 'tidewave' ? '#72eef3' : '#d991ff'; ctx.fillRect(cx - width / 2, barY, width * p, 9 * fs);
      if (p >= 1) { ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('MAX', cx, barY - 5); }
      ctx.restore();
    }

    // An axe-shaped spectral echo sweeps a complete revolution around Marrow
    // during the entire live recovery hitbox, tracking his rising position.
    if (f.state === 'special' && action && action.spinAxe && at.meta.spinBlade !== undefined &&
        f.actionT >= action.startup && f.actionT < action.startup + action.active) {
      const p = clamp((f.actionT - action.startup) / Math.max(1, action.active - 1), 0, 1);
      const angle = -Math.PI / 2 + f.facing * TAU * p;
      const r = 69 * fs, cx = f.x, cy = f.y - 60 * fs;
      const tile = at.tiles[at.meta.spinBlade];
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = f.pal.accent; ctx.lineCap = 'round'; ctx.globalAlpha = .45;
      ctx.lineWidth = 12 * fs; ctx.beginPath();
      ctx.arc(cx, cy, r, angle - f.facing * 1.5, angle, f.facing < 0); ctx.stroke();
      ctx.globalAlpha = .95; ctx.strokeStyle = '#f2d7ff'; ctx.lineWidth = 3 * fs;
      ctx.beginPath(); ctx.arc(cx, cy, r, angle - f.facing * 1.2, angle, f.facing < 0); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.translate(cx, cy); ctx.rotate(angle); ctx.scale(fs, fs);
      ctx.strokeStyle = '#241832'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(68, 0); ctx.stroke();
      ctx.strokeStyle = '#ad7be2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(68, 0); ctx.stroke();
      ctx.translate(68, 0); ctx.rotate(2.45);
      ctx.drawImage(src, tile.x, tile.y, tile.w, tile.h, -36, -27, tile.w, tile.h);
      ctx.restore();
    }

    // ---- shield bubble: a readable dome, not a sprite-wide glow (a big
    //      shadowBlur turned Grim into a fireball and hid the fighter)
    if (f.shieldHP > 0) {
      const sc = h / 108;
      const r = 40 * sc * (0.58 + 0.42 * Math.max(0, f.shieldHP) / 60);
      const cy = f.y - 50 * sc;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(f.x, cy, r * 0.25, f.x, cy, r);
      g.addColorStop(0, withAlpha(f.pal.accent, 0.04));
      g.addColorStop(0.72, withAlpha(f.pal.accent, 0.14));
      g.addColorStop(1, withAlpha(f.pal.accent, 0.40));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, cy, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = withAlpha('#ffffff', 0.45); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(f.x, cy, r, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // white flash on hit — additive redraw of the same frame, no extra art
    if (f.flashT > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(f.flashT / 9, 0, 1) * 0.55;
      ctx.translate(f.x, f.y);
      ctx.scale(dir * s, s);
      blit(ctx, at, src, ent, true);
      ctx.restore();
    }
    return true;
  }

  /* Body tile first, then any baked VFX additively so crescents glow. */
  /* `only` picks a layer: 'body' for the ink alone, 'vfx' for the baked glow, and
     nothing for both.  A cross-dissolve between two cells of a row needs it — the ink
     is what should fade, while the glow is light and is already composited 'lighter',
     so fading it with the tile makes a gauntlet wink on and off mid-stride. */
  function blit(ctx, at, src, ent, flashPass, vfx, only) {
    const draw = (part) => {
      const t = at.tiles[part[0]];
      if (!t) return;
      ctx.drawImage(src, t.x, t.y, t.w, t.h, -part[1], -part[2], t.w, t.h);
    };
    if (only !== 'vfx') draw(ent);
    const fx = ent[3] || [];
    if (!fx.length || only === 'body') return;
    const k = vfx === undefined ? 1 : clamp(vfx, 0, 1);
    if (k <= 0.02) return;                  // not yet: the body alone is the pose
    const prev = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
    if (!flashPass) ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = pa * k;               // the wind-up glow builds, it does not sit
    for (const p of fx) draw(p);
    ctx.globalAlpha = pa;
    ctx.globalCompositeOperation = prev;
  }

  return { drawFighter, getPose, load, drawSpriteFighter, ready, pickFrame, pickAnim,
    atlas, height, artReach, attackBox, strikeIndex, attackPhase, vfxGate, usable,
    loadItems, itemArt, ITEM_ART, LEDGE_ART,
    setBlend, setSmooth, beginFrame, STATE_ANIM, MOVE_ANIM, SPECIAL_ANIM, VARIANTS };
})();

/* ============================================================
   STAGE BACKGROUNDS
   ============================================================ */
const Backdrop = (() => {
  const cache = {};
  function hash(i) { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); }

  function draw(ctx, stage, cam, time) {
    const W = 1600, H = 1000;
    const [c0, c1, c2] = stage.bg;
    // sky
    const skyTop = -H * 1.05, skyBot = H * 0.85;
    const g = ctx.createLinearGradient(0, skyTop, 0, skyBot);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      // c0 (deep top) -> c1 -> c2 (warm horizon)
      const col = t < 0.5 ? mixColor(shade(c0, -0.35), c1, t * 2) : mixColor(c1, shade(c2, -0.15), (t - 0.5) * 2);
      g.addColorStop(t, col);
    }
    ctx.fillStyle = g; ctx.fillRect(-2400, skyTop - 10, 6800, (skyBot - skyTop) + 20);
    // below the horizon: deep ground haze
    const gh = ctx.createLinearGradient(0, skyBot - 1, 0, H * 2);
    gh.addColorStop(0, shade(c2, -0.55)); gh.addColorStop(1, shade(c0, -0.6));
    ctx.fillStyle = gh; ctx.fillRect(-2400, skyBot, 6800, H * 2);
    // soft god-rays from above
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const rx = -700 + i * 360 + Math.sin(time * 0.0002 + i) * 40 - cam.x * 0.04;
      const rg = ctx.createLinearGradient(rx, -900, rx + 160, 300);
      rg.addColorStop(0, withAlpha(stage.accent, 0.13));
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(rx - 40, -900); ctx.lineTo(rx + 120, -900);
      ctx.lineTo(rx + 300, 400); ctx.lineTo(rx + 40, 400);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // horizon glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createRadialGradient(0, 60, 40, 0, 60, 900);
    hg.addColorStop(0, withAlpha(stage.accent, 0.18));
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg; ctx.fillRect(-1600, -600, 3200, 1400);
    ctx.restore();

    const theme = stage.theme;
    // parallax starfield / motes
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const px = (hash(i) * 2600 - 1300) - cam.x * 0.08;
      const py = (hash(i + 99) * 1600 - 1100) - cam.y * 0.05;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(time * 0.0012 + i));
      ctx.globalAlpha = 0.16 + hash(i + 7) * 0.5 * tw;
      ctx.fillStyle = i % 5 === 0 ? stage.accent : '#cfe0ff';
      const r = 0.8 + hash(i + 31) * 1.8;
      ctx.fillRect((px % 2600 + 2600) % 2600 - 1300, py, r, r);
    }
    ctx.restore();

    ctx.save();
    const par = (k) => -cam.x * k;

    if (theme === 'shrine') {
      // distant torii + mountains
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 6; i++) {
        const bx = -1500 + i * 520 + par(0.1);
        ctx.fillStyle = '#101a2c';
        ctx.beginPath(); ctx.moveTo(bx - 320, 210); ctx.lineTo(bx, -180 - hash(i) * 140); ctx.lineTo(bx + 340, 210); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 3; i++) {
        const bx = -600 + i * 700 + par(0.22);
        ctx.fillStyle = '#0d1422';
        ctx.fillRect(bx - 8, -320, 16, 520);
        ctx.fillRect(bx - 90, -326, 180, 16);
        ctx.fillRect(bx - 70, -292, 140, 11);
        ctx.fillStyle = withAlpha('#ff5a6a', 0.5);
        ctx.fillRect(bx - 90, -330, 180, 5);
      }
    } else if (theme === 'rift') {
      // floating monoliths + rift crack
      ctx.globalAlpha = 0.7;
      for (let i = 0; i < 7; i++) {
        const bx = -1200 + i * 400 + par(0.12), by = -260 + hash(i) * 200;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(hash(i + 4) * 0.5 - 0.25);
        ctx.fillStyle = '#141222';
        ctx.fillRect(-70, -140, 140, 280);
        ctx.strokeStyle = withAlpha('#c77dff', 0.5); ctx.lineWidth = 2;
        ctx.strokeRect(-70, -140, 140, 280);
        ctx.restore();
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const rg = ctx.createLinearGradient(0, -600, 0, 200);
      rg.addColorStop(0, withAlpha('#c77dff', 0.0)); rg.addColorStop(0.5, withAlpha('#c77dff', 0.25)); rg.addColorStop(1, withAlpha('#7aa2ff', 0));
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(par(0.2) + 60, -700);
      for (let i = 0; i < 9; i++) ctx.lineTo(par(0.2) + 60 + Math.sin(i * 2.1 + time * 0.0006) * 60, -700 + i * 110);
      for (let i = 8; i >= 0; i--) ctx.lineTo(par(0.2) + 150 + Math.sin(i * 2.1 + time * 0.0006) * 60, -700 + i * 110);
      ctx.closePath(); ctx.fill(); ctx.restore();
    } else if (theme === 'foundry') {
      // gears + chimneys + lava glow
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 5; i++) {
        const bx = -1000 + i * 500 + par(0.14);
        ctx.fillStyle = '#170a06';
        ctx.fillRect(bx, -420, 120, 620);
        ctx.fillStyle = withAlpha('#ff6a2a', 0.35);
        ctx.fillRect(bx + 30, -420, 60, 12);
      }
      for (let i = 0; i < 4; i++) {
        const bx = -800 + i * 620 + par(0.24), by = -120 + hash(i) * 90;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(time * 0.0004 * (i % 2 ? 1 : -1));
        ctx.strokeStyle = withAlpha('#c86a3a', 0.5); ctx.lineWidth = 9;
        ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.stroke();
        for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 70, Math.sin(a) * 70); ctx.lineTo(Math.cos(a) * 92, Math.sin(a) * 92); ctx.stroke(); }
        ctx.restore();
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createLinearGradient(0, 160, 0, 520);
      lg.addColorStop(0, withAlpha('#ff5a20', 0)); lg.addColorStop(1, withAlpha('#ff7a2a', 0.5));
      ctx.fillStyle = lg; ctx.fillRect(-2000, 160, 5000, 380); ctx.restore();
    } else if (theme === 'comet') {
      // big planet + comet trails
      ctx.globalAlpha = 0.55;
      const pg = ctx.createRadialGradient(par(0.08) - 300, -420, 40, par(0.08) - 300, -420, 300);
      pg.addColorStop(0, '#5a4a9a'); pg.addColorStop(1, 'rgba(30,22,60,0)');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(par(0.08) - 300, -420, 300, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < 5; i++) {
        const t2 = (time * 0.05 + i * 220) % 900;
        const cx = ((i * 520 + t2 * 2) % 2400) - 1200 + par(0.18), cy = -500 + i * 130 + t2 * 0.3;
        ctx.strokeStyle = withAlpha('#9ab8ff', 0.5); ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 120, cy + 46); ctx.stroke();
        ctx.fillStyle = '#dfe8ff'; ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, TAU); ctx.fill();
      }
    } else if (theme === 'hollow') {
      // bamboo forest
      for (let i = 0; i < 26; i++) {
        const bx = -1400 + i * 120 + par(0.16 + hash(i) * 0.1);
        const hgt = 500 + hash(i + 3) * 500;
        ctx.globalAlpha = 0.28 + hash(i) * 0.4;
        ctx.fillStyle = i % 3 === 0 ? '#1d5a44' : '#164234';
        ctx.fillRect(bx, -hgt, 9 + hash(i) * 5, hgt + 400);
        ctx.fillStyle = withAlpha('#0c2a20', 0.9);
        for (let k = 1; k < 5; k++) ctx.fillRect(bx, -hgt + k * hgt / 5, 12, 3);
      }
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#0a1a14';
      ctx.beginPath(); ctx.ellipse(par(0.1) - 200, 230, 700, 120, 0, 0, TAU); ctx.fill();
    } else if (theme === 'range') {
      // ruined arches
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 5; i++) {
        const bx = -1100 + i * 560 + par(0.15);
        ctx.fillStyle = '#16241a';
        ctx.fillRect(bx, -300, 40, 520);
        ctx.fillRect(bx + 200, -300, 40, 520);
        ctx.beginPath(); ctx.arc(bx + 120, -300, 120, Math.PI, TAU); ctx.lineWidth = 34; ctx.strokeStyle = '#16241a'; ctx.stroke();
        ctx.fillStyle = withAlpha('#22e08a', 0.35);
        ctx.fillRect(bx + 105, -300, 30, 16);
      }
    } else if (theme === 'island') {
      /* The Battlefield decks: a floating slab in open sky, so the background is the
         thing that says "arena" — a wide horizon of cloud below the stage and one
         large distant planet, both of which the camera parallaxes slowly past. */
      ctx.globalAlpha = 0.5;
      const pgx = -520 + par(0.05), pgy = -560;
      const pr = 210;
      const pg = ctx.createRadialGradient(pgx - pr * 0.3, pgy - pr * 0.35, pr * 0.2, pgx, pgy, pr);
      pg.addColorStop(0, withAlpha(stage.accent, 0.5));
      pg.addColorStop(0.7, withAlpha(stage.accent, 0.14));
      pg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(pgx, pgy, pr, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.24;
      ctx.strokeStyle = withAlpha('#ffffff', 0.5); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(pgx, pgy + 20, pr * 1.5, pr * 0.32, -0.32, 0, TAU); ctx.stroke();
      // cloud sea under the deck
      for (let i = 0; i < 9; i++) {
        const bx = -1500 + i * 380 + par(0.07);
        const by = 300 + hash(i) * 90;
        ctx.globalAlpha = 0.10 + hash(i + 5) * 0.16;
        ctx.fillStyle = '#dcecff';
        ctx.beginPath(); ctx.ellipse(bx, by, 240 + hash(i) * 120, 34 + hash(i + 2) * 20, 0, 0, TAU); ctx.fill();
      }
    } else if (theme === 'arena') {
      /* The stadium bowl: floodlights and a terraced crowd, drawn as bands of dots so
         it reads as a crowd rather than noise, and moves at a tenth of the camera. */
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 7; i++) {
        const bx = -1400 + i * 470 + par(0.09);
        ctx.fillStyle = withAlpha('#0d1a24', 0.9);
        ctx.fillRect(bx, -240, 26, 420);
        ctx.fillStyle = withAlpha(stage.accent, 0.5);
        ctx.fillRect(bx - 30, -250, 86, 18);
        ctx.globalAlpha = 0.16;
        const lg = ctx.createRadialGradient(bx, -230, 10, bx, -230, 420);
        lg.addColorStop(0, withAlpha(stage.accent, 0.4)); lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lg; ctx.fillRect(bx - 400, -240, 800, 600);
        ctx.globalAlpha = 0.5;
      }
      for (let band = 0; band < 4; band++) {
        const by = -120 + band * 62;
        for (let i = 0; i < 46; i++) {
          const bx = -1420 + i * 64 + par(0.12 + band * 0.01) + (band % 2) * 22;
          ctx.globalAlpha = 0.14 + hash(i * 7 + band) * 0.3;
          ctx.fillStyle = hash(i + band * 13) > 0.72 ? stage.accent : '#8ea6bd';
          ctx.fillRect(bx, by + Math.sin(i * 1.7 + band) * 4, 5, 5);
        }
      }
    } else if (theme === 'city') {
      /* Town & City: two skylines at different depths and the street itself, with a
         car running along it.  The traffic is scenery here, not a hazard — the deck it
         drives on is where the fighters are standing, so nothing on it can damage them
         without becoming a stage gimmick the platform physics has no room for. */
      for (let layer = 0; layer < 2; layer++) {
        const k = layer ? 0.16 : 0.09;
        ctx.globalAlpha = layer ? 0.55 : 0.32;
        for (let i = 0; i < 14; i++) {
          const bw = 90 + hash(i * 3 + layer) * 90;
          const bx = -1500 + i * 226 + hash(i + layer * 7) * 60 + par(k);
          const bh = 220 + hash(i * 5 + layer) * 420;
          ctx.fillStyle = layer ? '#182437' : '#111a2a';
          ctx.fillRect(bx, -bh, bw, bh + 260);
          ctx.fillStyle = withAlpha('#ffd166', layer ? 0.5 : 0.25);
          for (let wy = 0; wy < 9; wy++) {
            for (let wx2 = 0; wx2 < 3; wx2++) {
              if (hash(i * 31 + wy * 7 + wx2 + layer * 3) > 0.62) ctx.fillRect(bx + 12 + wx2 * 26, -bh + 26 + wy * 44, 12, 16);
            }
          }
        }
      }
      // the street, and something driving along it
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#1a2230';
      ctx.fillRect(-1600, 150, 3200, 120);
      ctx.fillStyle = withAlpha('#ffd166', 0.5);
      for (let i = 0; i < 22; i++) ctx.fillRect(-1500 + i * 150 + ((time * 0.9) % 150), 206, 46, 5);
      const carX = ((time * 1.5) % 3600) - 1700;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#e8556d';
      ctx.fillRect(carX, 176, 82, 26);
      ctx.fillRect(carX + 16, 162, 44, 18);
      ctx.fillStyle = withAlpha('#fff6c8', 0.9);
      ctx.fillRect(carX + 76, 182, 10, 6);
    }
    ctx.restore();

    // ground shadow gradient under stage
    ctx.save();
    const sd = ctx.createLinearGradient(0, 60, 0, 420);
    sd.addColorStop(0, 'rgba(0,0,0,0.35)'); sd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sd; ctx.fillRect(-1600, 60, 3200, 360);
    ctx.restore();
  }

  function drawPlatforms(ctx, stage, time) {
    ctx.save();
    for (const p of stage.platforms) {
      const px = p.cx !== undefined ? p.cx : p.x, py = p.cy !== undefined ? p.cy : p.y;
      const pg = ctx.createLinearGradient(0, py, 0, py + p.h + 6);
      pg.addColorStop(0, shade(stage.bg[2], 0.5));
      pg.addColorStop(0.5, shade(stage.bg[2], 0.16));
      pg.addColorStop(1, shade(stage.bg[1], -0.05));
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.roundRect(px, py, p.w, p.h, 4); ctx.fill();
      // bright leading edge
      ctx.fillStyle = withAlpha(stage.accent, 0.95);
      ctx.fillRect(px + 2, py - 2.5, p.w - 4, 3.5);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35;
      ctx.fillStyle = withAlpha(stage.accent, 0.6);
      ctx.fillRect(px + 6, py + p.h, p.w - 12, 6);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawStageBody(ctx, stage, time) {
    const gd = stage.ground;
    ctx.save();
    // main platform
    const grad = ctx.createLinearGradient(0, gd.y - 10, 0, gd.y + 100);
    grad.addColorStop(0, shade(stage.bg[2], 0.55));
    grad.addColorStop(0.10, shade(stage.bg[2], 0.28));
    grad.addColorStop(0.45, shade(stage.bg[2], -0.18));
    grad.addColorStop(1, shade(stage.bg[1], -0.55));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(gd.x, gd.y);
    ctx.lineTo(gd.x + gd.w, gd.y);
    ctx.lineTo(gd.x + gd.w - 26, gd.y + 96);
    ctx.lineTo(gd.x + 26, gd.y + 96);
    ctx.closePath(); ctx.fill();
    // top edge glow
    const eg = ctx.createLinearGradient(gd.x, 0, gd.x + gd.w, 0);
    eg.addColorStop(0, withAlpha(stage.accent, 0.2)); eg.addColorStop(0.5, withAlpha(stage.accent, 0.95)); eg.addColorStop(1, withAlpha(stage.accent, 0.2));
    ctx.fillStyle = eg; ctx.fillRect(gd.x - 4, gd.y - 5, gd.w + 8, 6);
    // under-lattice
    ctx.strokeStyle = withAlpha(stage.accent, 0.18); ctx.lineWidth = 2;
    for (let x = gd.x; x < gd.x + gd.w; x += 54) {
      ctx.beginPath(); ctx.moveTo(x, gd.y + 6); ctx.lineTo(x + 26, gd.y + 92); ctx.stroke();
    }
    // side walls
    ctx.fillStyle = shade(stage.bg[1], -0.2);
    ctx.fillRect(gd.x - 16, gd.y, 16, 300);
    ctx.fillRect(gd.x + gd.w, gd.y, 16, 300);

    ctx.restore();
  }

  function drawVignette(ctx, W, H) {
    ctx.save();
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.55, W / 2, H / 2, H * 1.08);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  return { draw, drawStageBody, drawPlatforms, drawVignette };
})();
