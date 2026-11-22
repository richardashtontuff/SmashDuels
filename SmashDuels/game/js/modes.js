/* ============================================================
   RIFT RUMBLE — extra single-player modes (GDD §11.6–11.7)
   Classic Mode · Break the Targets · Home-Run Contest · Multi-Man
   ============================================================ */
'use strict';

const Modes = (() => {
  let current = null;   // {kind, ...state}

  const CLASSIC_ORDER = ['grim', 'vesper', 'astra', 'rook', 'valor', 'marrow', 'tide'];

  /* ---------------- Classic Mode ---------------- */
  function startClassic(fighterKey, palIdx, level) {
    current = {
      kind: 'classic',
      stageIdx: 0,
      fighterKey, palIdx,
      level,
      wins: 0,
      losses: 0,
      alive: true,     // two losses ends the run
      stages: [
        { label: 'STAGE 1 · DUEL', enemy: CLASSIC_ORDER[(CLASSIC_ORDER.indexOf(fighterKey) + 1) % CLASSIC_ORDER.length], stage: 'skyshrine', lives: 2 },
        { label: 'STAGE 2 · DUEL', enemy: CLASSIC_ORDER[(CLASSIC_ORDER.indexOf(fighterKey) + 2) % CLASSIC_ORDER.length], stage: 'hollow', lives: 2 },
        { label: 'STAGE 3 · BRAWL', enemy: CLASSIC_ORDER[(CLASSIC_ORDER.indexOf(fighterKey) + 3) % CLASSIC_ORDER.length], stage: 'range', lives: 2, doubles: true },
        { label: 'STAGE 4 · DUEL', enemy: CLASSIC_ORDER[(CLASSIC_ORDER.indexOf(fighterKey) + 4) % CLASSIC_ORDER.length], stage: 'cometreach', lives: 2 },
        { label: 'FINAL · BOSS', enemy: 'grim', stage: 'foundry', lives: 3, boss: true },
      ],
    };
    launchClassicStage();
  }

  function launchClassicStage() {
    const c = current;
    const s = c.stages[c.stageIdx];
    const cast = [{ key: c.fighterKey, palIdx: c.palIdx, isCPU: false, team: 0, label: 'P1' }];
    cast.push({ key: s.enemy, palIdx: 2, isCPU: true, team: 1, label: 'CPU' });
    if (s.doubles) cast.push({ key: CLASSIC_ORDER[(CLASSIC_ORDER.indexOf(s.enemy) + 1) % CLASSIC_ORDER.length], palIdx: 3, isCPU: true, team: 1, label: 'CPU' });
    const rules = Object.assign({}, DEFAULT_RULES, {
      mode: 'stock', stocks: s.boss ? 1 : 2, items: s.boss ? 'low' : 'medium',
      aiLevel: Math.min(9, c.level + (s.boss ? 2 : c.stageIdx)), hazards: true, stage: s.stage,
    });
    Game.startMatch({ rules, cast, stageKey: s.stage, metaMode: 'classic' });
    UI.toast(s.label);
    setTimeout(() => {
      if (window.__match) window.__match.announce(s.label, s.boss ? '#ff5a7a' : '#9fd4ff', 90);
    }, 120);
  }

  // called by Match.endMatch
  function reportMatchEnd(match) {
    if (!current) return false;
    if (current.kind === 'classic') {
      const p1 = match.fighters[0];
      const won = match.winner && match.winner.includes(p1);
      if (won) {
        current.wins++;
        current.stageIdx++;
        if (current.stageIdx >= current.stages.length) { classicVictory(); return true; }
        setTimeout(() => { UI.hideResults(); launchClassicStage(); }, 2200);
        return true;
      } else {
        current.losses++;
        if (current.losses >= 2) { classicDefeat(); return true; }
        setTimeout(() => { UI.hideResults(); launchClassicStage(); }, 2200);
        return true;
      }
    }
    if (current.kind === 'targets') {
      showTargetsResult(match);
      return true;
    }
    if (current.kind === 'homered') {
      // handled by custom HUD
      return true;
    }
    if (current.kind === 'multiman') {
      multimanEnd(match);
      return true;
    }
    return false;
  }

  function classicVictory() {
    const s = SAVE.data;
    s.coins += 300;
    SAVE.challengeDone('classic_clear');
    SAVE.save();
    current = null;
    UI.showCustomResults({
      title: 'CLASSIC CLEARED', color: '#ffe04a',
      sub: 'YOU BEAT THE RUN',
      lines: ['RIFT COINS +300', 'CHALLENGE COMPLETE'],
    });
  }
  function classicDefeat() {
    current = null;
    UI.showCustomResults({
      title: 'RUN OVER', color: '#ff5a7a',
      sub: 'TWO FALLS ENDS THE RUN',
      lines: ['Try a lower CPU level', 'Classic rewards patience'],
    });
  }

  /* ---------------- Break the Targets ---------------- */
  function startTargets(fighterKey, palIdx) {
    current = { kind: 'targets', hits: 0, total: 10, timer: 0, done: false, fighterKey };
    const rules = Object.assign({}, DEFAULT_RULES, { mode: 'stock', stocks: 1, items: 'none', hazards: false });
    Game.startMatch({
      rules,
      cast: [{ key: fighterKey, palIdx, isCPU: false, team: 0, label: 'P1' }],
      stageKey: 'skyshrine', metaMode: 'targets',
    });
    setTimeout(() => {
      const m = window.__match;
      if (!m) return;
      m.targets = [];
      const gd = m.stage.ground;
      const spots = [];
      // 4 on the main stage
      for (let i = 0; i < 4; i++) {
        spots.push({ x: gd.x + gd.w * (0.14 + i * 0.24), y: gd.y - 34 });
      }
      // 2 on each of the three lower/upper platforms
      const plats = m.stage.platforms.slice();
      for (let pi = 0; pi < plats.length && spots.length < 10; pi++) {
        const p = plats[pi];
        const px = p.cx !== undefined ? p.cx : p.x;
        const py = p.cy !== undefined ? p.cy : p.y;
        for (let k = 0; k < 2 && spots.length < 10; k++) {
          spots.push({ x: px + p.w * (0.3 + k * 0.4), y: py - 30 });
        }
      }
      // any remainder floats mid-air between the platforms
      let guard = 0;
      while (spots.length < 10 && guard++ < 30) {
        spots.push({ x: gd.x + gd.w * rand(0.15, 0.85), y: -110 - randInt(0, 240) });
      }
      m.targets = spots.slice(0, 10).map((s, i) => ({ ...s, id: i, dead: false, r: 16, wob: rand(TAU), hp: 2 }));
      m.onTargets = true;
      m.matchTime = 60 * 60; // 60s
      m.rules.mode = 'time';
      m.announce('BREAK THE TARGETS!', '#ffd23a', 80);
    }, 200);
    setTimeout(() => {
      const m = window.__match;
      if (m && m.onTargets) {
        const iv = setInterval(() => {
          if (!window.__match || window.__match !== m) { clearInterval(iv); return; }
          current.timer = m.matchTime;
          if (m.targets && m.targets.every(t => t.dead) && !current.done) {
            current.done = true;
            clearInterval(iv);
            const timeUsed = 60 * 60 - m.matchTime;
            const s = SAVE.data;
            s.records.targetsBest = Math.min(s.records.targetsBest || 9999, timeUsed);
            SAVE.challengeDone('targets_clear');
            s.coins += 150; SAVE.save();
            m.state = 'over';
            UI.showCustomResults({
              title: 'ALL TARGETS!', color: '#ffd23a',
              sub: 'TIME: ' + (timeUsed / 60).toFixed(2) + 's',
              lines: ['BEST: ' + (SAVE.data.records.targetsBest / 60).toFixed(2) + 's', 'RIFT COINS +150'],
            });
          }
        }, 100);
      }
    }, 320);
  }

  function showTargetsResult(match) {
    if (current && current.done) { current = null; return; }
    const hits = match.targets ? match.targets.filter(t => t.dead).length : 0;
    current = null;
    UI.showCustomResults({
      title: 'TIME UP', color: '#ff8a5a',
      sub: hits + ' / 10 TARGETS BROKEN',
      lines: ['Clear all targets to set a record'],
    });
  }

  /* ---------------- Home-Run Contest ---------------- */
  function startHomeRun(fighterKey, palIdx) {
    current = { kind: 'homered', best: 0, phase: 'start', timer: 600 };
    const rules = Object.assign({}, DEFAULT_RULES, { mode: 'stock', stocks: 1, items: 'none', hazards: false });
    Game.startMatch({
      rules,
      cast: [{ key: fighterKey, palIdx, isCPU: false, team: 0, label: 'P1' }],
      stageKey: 'terminal', metaMode: 'homered',
    });
    setTimeout(() => {
      const m = window.__match;
      if (!m) return;
      m.homerun = true;
      m.bag = { x: 260, y: -20, vx: 0, vy: 0, rot: 0, launched: false, dist: 0, startX: 260, dmg: 0 };
      m.announce('HOME-RUN CONTEST', '#ffd23a', 90);
    }, 200);
  }
  function homeRunSwing(match) {
    if (!match.bag || match.bag.launched) return;
    const p1 = match.fighters[0];
    if (!p1 || Math.abs(p1.x - match.bag.x) > 90) return;
    // damage accumulates like the GDD
    match.bag.dmg += 6 + Math.random() * 4;
    match.bag.vx += sign(match.bag.x - p1.x || 1) * 1.2;
    match.fx.hitSpark(match.bag.x, match.bag.y - 20, p1.pal.accent, 0.4, 0);
  }
  function homeRunLaunch(match) {
    const p1 = match.fighters[0];
    if (!p1 || !match.bag || match.bag.launched) return;
    const dmg = match.bag.dmg;
    const power = 6 + dmg * 0.55;
    match.bag.launched = true;
    match.bag.vx = power * 0.95;
    match.bag.vy = -power * 0.62;
    AUDIO.sfx('bat');
    match.cam.shake(12);
    match.fx.explode(match.bag.x, match.bag.y - 20, 90, p1.pal.accent);
  }
  function homeRunEnd(match) {
    const dist = Math.max(0, match.bag.x - match.bag.startX);
    const s = SAVE.data;
    const key = 'hr_' + match.fighters[0].key;
    if (dist > (s.records[key] || 0)) { s.records[key] = Math.round(dist); }
    if (dist > 2000) { SAVE.challengeDone('hr_2000'); }
    s.coins += Math.round(dist / 20); SAVE.save();
    current = null;
    UI.showCustomResults({
      title: Math.round(dist) + ' m', color: '#ffd23a',
      sub: 'SANDBAG DISTANCE',
      lines: ['BEST: ' + Math.round(s.records[key]) + ' m', 'RIFT COINS +' + Math.round(dist / 20)],
    });
  }

  /* ---------------- Multi-Man ---------------- */
  function startMultiMan(fighterKey, palIdx, level) {
    current = { kind: 'multiman', kos: 0, spawned: 0, target: 10, level };
    const rules = Object.assign({}, DEFAULT_RULES, { mode: 'stock', stocks: 2, items: 'low', hazards: true });
    Game.startMatch({
      rules,
      cast: [{ key: fighterKey, palIdx, isCPU: false, team: 0, label: 'P1' }],
      stageKey: 'cometreach', metaMode: 'multiman',
    });
    setTimeout(() => {
      const m = window.__match;
      if (!m) return;
      m.multiman = { kos: 0, spawned: 0, target: 10, wave: 0 };
      m.announce('MULTI-MAN BRAWL', '#c77dff', 80);
      spawnMob(m);
    }, 200);
  }
  function spawnMob(match) {
    if (!match.multiman) return;
    if (match.multiman.spawned >= match.multiman.target) return;
    const gd = match.stage.ground;
    const key = pick(FIGHTER_KEYS);
    const mob = new Fighter({
      key, palIdx: randInt(0, 5), playerIndex: 3, team: 1,
      isCPU: true, cpuLevel: 3, label: 'MOB', stocks: 1,
      x: gd.x + gd.w * rand(0.15, 0.85), y: -260, facing: 1,
    });
    mob.id = match.fighters.length;
    mob.match = match;
    mob.isMob = true;
    mob.ai = new CPU(mob, match);
    mob.ai.level = 2;
    mob.spriteMob = true;
    match.fighters.push(mob);
    match.multiman.spawned++;
    match.fx.burst(mob.x, mob.y - 40, '#c77dff', 14);
  }
  function multimanEnd(match) {
    const kos = match.multiman ? match.multiman.kos : 0;
    const s = SAVE.data;
    s.coins += kos * 30; SAVE.save();
    current = null;
    UI.showCustomResults({
      title: kos + ' KOs', color: '#c77dff',
      sub: 'MULTI-MAN BRAWL',
      lines: ['RIFT COINS +' + kos * 30, 'Keep launching the mob'],
    });
  }

  return {
    get current() { return current; },
    startClassic, launchClassicStage, reportMatchEnd,
    startTargets, startHomeRun, homeRunSwing, homeRunLaunch, homeRunEnd,
    startMultiMan, spawnMob,
    reset() { current = null; },
  };
})();
