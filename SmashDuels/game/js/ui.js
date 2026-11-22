/* ============================================================
   RIFT RUMBLE — UI: screens, menus, select, results, records
   ============================================================ */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const UI = (() => {
  const $$ = s => Array.from(document.querySelectorAll(s));
  let current = 'screen-title';
  let fighters = ['valor', 'grim', 'vesper', 'rook'];   // per-slot keys (4 max)
  let pals = [0, 0, 0, 0];
  let isCPU = [false, true, true, true];
  let teamAssign = [0, 1, 0, 1];
  let activeSlots = 2;
  let selSlot = 0;
  let cursorFighter = 0;
  let rules = Object.assign({}, DEFAULT_RULES);
  let menuIndex = 0;
  let stageIdx = 0;
  let toastTimer = 0;
  let lastScreen = null;
  let vsCPULevel = 5;
  let modeTarget = 'vs';
  let settingsReturn = 'screen-title';
  let lastHeroKey = null;
  const PLAYER_COLORS = ['#ef3c43', '#2688e9', '#edb72c', '#35a669'];
  let toastEl = null;

  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }

  // Remember where a submenu was entered so reversing it zooms back toward
  // the same control. Screen state changes synchronously: animation never
  // delays a click, a match start, or a rapid second navigation.
  let navigation = [{ id: 'screen-title', trigger: null, origin: null }];
  let navigationTrigger = null;
  let transitionTimer = 0;
  const TRANSITION_CLASSES = ['screen-enter-forward', 'screen-enter-back', 'screen-exit-forward', 'screen-exit-back'];

  function show(id) {
    const next = document.getElementById(id);
    if (!next) return;
    const previous = document.getElementById(current);
    const changed = current !== id;
    let backwards = false;
    let origin = { x: 50, y: 50 };
    let restore = null;
    if (changed) {
      const button = navigationTrigger || (previous && previous.contains(document.activeElement) ? document.activeElement : null);
      const rect = button && button.getBoundingClientRect ? button.getBoundingClientRect() : null;
      if (rect && rect.width && rect.height) origin = { x: (rect.left + rect.width / 2) / innerWidth * 100, y: (rect.top + rect.height / 2) / innerHeight * 100 };
      const targetIndex = navigation.map(entry => entry.id).lastIndexOf(id);
      if (targetIndex !== -1 && targetIndex < navigation.length - 1) {
        backwards = true;
        navigation = navigation.slice(0, targetIndex + 1);
        const entry = navigation[targetIndex];
        origin = entry.origin || origin;
        restore = entry.trigger;
      } else {
        navigation[navigation.length - 1].trigger = button;
        navigation[navigation.length - 1].origin = origin;
        navigation.push({ id, trigger: null, origin: null });
      }
    }
    navigationTrigger = null;
    clearTimeout(transitionTimer);
    $$('.screen').forEach(screen => {
      screen.classList.remove('active', ...TRANSITION_CLASSES);
      screen.inert = false;
    });
    next.classList.add('active');
    current = id;

    // Do not zoom a live fight or the result of a match. A settings screen
    // opened from pause is the exception: it can zoom over the paused scene.
    const pauseSettings = (id === 'screen-settings' && previous && previous.id === 'screen-match') ||
      (id === 'screen-match' && previous && previous.id === 'screen-settings');
    const matchBoundary = (id === 'screen-match' || current === 'screen-results' ||
      (previous && (previous.id === 'screen-match' || previous.id === 'screen-results'))) && !pauseSettings;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (changed && !matchBoundary && !reduced) {
      const x = Math.max(0, Math.min(100, origin.x)) + '%';
      const y = Math.max(0, Math.min(100, origin.y)) + '%';
      for (const screen of [previous, next]) if (screen) {
        screen.style.setProperty('--zoom-x', x); screen.style.setProperty('--zoom-y', y);
      }
      if (previous && previous.id !== 'screen-match') {
        previous.inert = true;
        previous.classList.add(backwards ? 'screen-exit-back' : 'screen-exit-forward');
      }
      if (id !== 'screen-match') next.classList.add(backwards ? 'screen-enter-back' : 'screen-enter-forward');
      transitionTimer = setTimeout(() => {
        if (previous) { previous.classList.remove(...TRANSITION_CLASSES); previous.inert = false; }
        next.classList.remove(...TRANSITION_CLASSES);
      }, 480);
    }
    if (changed) {
      if (restore && restore.isConnected && (next.contains(restore) || (id === 'screen-match' && $('#hud').contains(restore)))) {
        restore.focus({ preventScroll: true });
      } else if (id !== 'screen-match') {
        next.setAttribute('tabindex', '-1');
        next.focus({ preventScroll: true });
      }
    }
    if (id === 'screen-settings' && settingsReturn === 'screen-match') AUDIO.stopMusic();
    else if (id !== 'screen-match') AUDIO.startMusic();
  }

  function toast(msg) {
    if (!toastEl) { toastEl = el(`<div class="toast"></div>`); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
  }

  /* ---------------- title ---------------- */
  function buildTitle() {
    const save = SAVE.data;
    $('#title-meta').innerHTML = `
      <span>${save.unlocked.length} FIGHTERS</span><span>·</span>
      <span>${save.matches} MATCHES</span><span>·</span>
      <span>${save.coins} RIFT COINS</span>`;
    AUDIO.startMusic();
  }

  // Previewing a mode never selects it: hover and keyboard focus use the same
  // presentation, while activation still follows the original menu flow.
  const MODE_PREVIEWS = {
    vs:      { index: '01 / BATTLE', title: 'VS MODE', copy: 'A CUSTOM BATTLE FOR UP TO FOUR FIGHTERS', front: 'valor', back: 'vesper', lead: 'YOUR RULES.', end: 'YOUR RIFT.' },
    classic: { index: '02 / CLASSIC', title: 'CLASSIC', copy: 'TAKE ON A FIVE-STAGE GAUNTLET', front: 'valor', back: 'grim', lead: 'FIVE STAGES.', end: 'ONE CHAMPION.' },
    targets: { index: '03 / TARGETS', title: 'TARGETS', copy: 'BREAK ALL TEN TARGETS AGAINST THE CLOCK', front: 'astra', back: 'vesper', lead: 'TEN TARGETS.', end: 'GO FOR SPEED.' },
    homered: { index: '04 / HOME-RUN', title: 'HOME-RUN', copy: 'POWER UP AND SEND THE BAG FLYING', front: 'rook', back: 'grim', lead: 'WIND IT UP.', end: 'SEND IT FLYING.' },
    online: { index: '05 / ONLINE', title: 'ONLINE', copy: 'FIND A RIVAL OR PLAY WITH FRIENDS', front: 'nomad', back: 'briar', lead: 'YOUR RIVALS.', end: 'ANYWHERE.' },
  };
  function setupModePreviews() {
    const screen = $('#screen-title');
    const board = screen.querySelector('.main-menu');
    let preview = '';
    function setPreview(mode) {
      if (!MODE_PREVIEWS[mode] || preview === mode) return;
      preview = mode;
      const data = MODE_PREVIEWS[mode];
      screen.dataset.preview = mode;
      $('.mode-preview-index').textContent = data.index;
      $('.mode-preview-copy').textContent = data.copy;
      $('.home-art-label').innerHTML = data.title + ' <span> / MODE PREVIEW</span>';
      $('.home-art-caption').innerHTML = data.lead + '<br><strong>' + data.end + '</strong>';
      $('.home-fighter-front').src = `assets/portraits/${data.front}_base.png?v=${BUILD}`;
      $('.home-fighter-back').src = `assets/portraits/${data.back}_base.png?v=${BUILD}`;
      const art = $('.home-art');
      art.classList.remove('preview-change'); void art.offsetWidth; art.classList.add('preview-change');
    }
    function modeOf(button) { return button.id === 'btn-vs' ? 'vs' : button.dataset.mode; }
    board.addEventListener('pointerover', e => {
      const button = e.target.closest('button');
      if (button && board.contains(button) && e.pointerType !== 'touch') setPreview(modeOf(button));
    });
    board.addEventListener('focusin', e => {
      const button = e.target.closest('button');
      if (button && board.contains(button)) setPreview(modeOf(button));
    });
    board.addEventListener('pointerleave', () => {
      const focused = board.querySelector('button:focus-visible');
      setPreview(focused ? modeOf(focused) : 'vs');
    });
    board.addEventListener('focusout', e => {
      if (!board.contains(e.relatedTarget) && !board.matches(':hover')) setPreview('vs');
    });
    setPreview('vs');
  }

  /* ---------------- character select ---------------- */
  function fighterCard(key, i) {
    const d = FIGHTERS[key];
    const locked = !SAVE.data.unlocked.includes(key);
    return `<button type="button" class="fcell ${locked ? 'locked' : ''}" data-key="${key}" data-i="${i}" style="--c:${d.color}" aria-label="${d.name}${locked ? ', locked' : ''}">
      <img src="assets/portraits/${key}_base.png?v=${BUILD}" alt="">
      <span class="fmeta"><b>${d.name}</b><small>${d.title}</small></span>
    </button>`;
  }

  function buildSelect() {
    const grid = $('#fighter-grid');
    grid.innerHTML = FIGHTER_KEYS.map((k, i) => fighterCard(k, i)).join('');
    grid.querySelectorAll('.fcell').forEach(c => c.addEventListener('click', () => {
      const key = c.dataset.key;
      if (!SAVE.data.unlocked.includes(key)) { AUDIO.sfx('back'); toast('LOCKED — WIN MATCHES TO UNLOCK'); return; }
      AUDIO.sfx('menu'); fighters[selSlot] = key; pals[selSlot] = 0; renderSelect();
      c.classList.remove('select-punch'); void c.offsetWidth; c.classList.add('select-punch');
    }));
    $('#slot-tabs').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      selSlot = +b.dataset.slot; AUDIO.sfx('menu'); renderSelect();
    }));
    $('#pal-row').addEventListener('click', e => {
      const sw = e.target.closest('.swatch'); if (!sw) return;
      pals[selSlot] = +sw.dataset.p; AUDIO.sfx('menu'); renderSelect();
    });
    $('#sel-summary').addEventListener('click', e => {
      const slot = e.target.closest('button[data-slot]'); if (!slot) return;
      selSlot = +slot.dataset.slot; AUDIO.sfx('menu'); renderSelect();
      const selected = $('#sel-summary').querySelector(`[data-slot="${selSlot}"]`);
      if (selected) selected.focus({ preventScroll: true });
    });
    $('#cpu-toggle').addEventListener('click', () => {
      isCPU[selSlot] = !isCPU[selSlot]; AUDIO.sfx('menu'); renderSelect();
    });
    $('#add-slot').addEventListener('click', () => {
      if (activeSlots < 4) { activeSlots++; selSlot = activeSlots - 1; isCPU[selSlot] = true; AUDIO.sfx('confirm'); renderSelect(); }
    });
    $('#rem-slot').addEventListener('click', () => {
      if (activeSlots > 2) { activeSlots--; selSlot = Math.min(selSlot, activeSlots - 1); AUDIO.sfx('back'); renderSelect(); }
    });
    $('#sel-rules').addEventListener('click', () => { AUDIO.sfx('menu'); buildRules(); show('screen-rules'); lastScreen = 'screen-select'; });
    $('#sel-fight').addEventListener('click', () => { AUDIO.sfx('confirm'); startFromSelect(); });
    $('#sel-stage').addEventListener('click', () => { AUDIO.sfx('menu'); buildStages(); show('screen-stage'); lastScreen = 'screen-select'; });
    $('#cpu-level').addEventListener('input', e => { rules.aiLevel = +e.target.value; vsCPULevel = +e.target.value; renderSelect(); });
  }

  // Backdrops are decorative interpretations, not playable stage names.
  const PROFILE_VIBES = {
    valor: 'RIFT<br>FORGED', grim: 'ANCIENT<br>STONE', astra: 'BORN OF<br>STARLIGHT',
    vesper: 'AFTER<br>DARK', rook: 'RIFT<br>DOJO', marrow: 'SPECTRAL<br>RUINS', tide: 'OCEAN’S<br>CALL', vector: 'HUNTER<br>PROTOCOL', briar: 'WILD<br>GROVE', nomad: 'DUST<br>FRONTIER',
  };

  let lastProfileKey = null;
  function renderFighterProfile(key) {
    const d = FIGHTERS[key], profile = $('#fighter-profile');
    profile.setAttribute('aria-label', d.name + ' fighter profile and stats');
    profile.style.setProperty('--scene', `url("../assets/select/${key}.jpg?v=${BUILD}")`);
    profile.style.setProperty('--fighter-accent', d.color);
    if (lastProfileKey !== key) {
      const screen = $('#screen-select'), showcase = $('#select-showcase');
      screen.style.setProperty('--scene', `url("../assets/select/${key}.jpg?v=${BUILD}")`);
      screen.style.setProperty('--fighter-accent', d.color);
      screen.dataset.fighter = key;
      const number = String(FIGHTER_KEYS.indexOf(key) + 1).padStart(2, '0');
      $('#showcase-number').textContent = number;
      $('#hero-number').textContent = number;
      showcase.classList.remove('showcase-swap'); void showcase.offsetWidth; showcase.classList.add('showcase-swap');
      lastProfileKey = key;
    }
    $('#profile-number').textContent = String(FIGHTER_KEYS.indexOf(key) + 1).padStart(2, '0') + ' / ' + String(FIGHTER_KEYS.length).padStart(2, '0');
    $('#profile-vibe').innerHTML = PROFILE_VIBES[key] || 'ENTER<br>THE RIFT';
    // Use actual base values with a common zero-to-roster-best scale. Weight
    // affects knockback rather than guaranteeing survival; f-smash is only one
    // representative attack, not a claim about every move or special.
    const metrics = [
      {label:'RUN SPEED', value:f=>f.stats.run, unit:'', precision:1, meaning:'ground run speed'},
      {label:'AIR SPEED', value:f=>f.stats.air, unit:'', precision:1, meaning:'air movement speed'},
      {label:'WEIGHT', value:f=>f.stats.weight, unit:'', precision:0, meaning:'weight; higher reduces knockback'},
      {label:'F-SMASH', value:f=>f.moves.fsmash.damage, unit:'%', precision:0, meaning:'forward smash base damage'},
    ];
    $('#profile-stat-bars').innerHTML = metrics.map(m => {
      const value = m.value(d), max = Math.max(...FIGHTER_KEYS.map(k => m.value(FIGHTERS[k])));
      const shown = value.toFixed(m.precision), high = max.toFixed(m.precision);
      const percent = Math.max(0, Math.min(100, value / max * 100));
      return `<div class="profile-stat"><div class="profile-stat-label"><span>${m.label}</span><b>${shown}${m.unit}</b></div>
        <div class="profile-stat-track" role="meter" aria-label="${m.meaning}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}" aria-valuetext="${shown}${m.unit} out of ${high}${m.unit}, roster best"><span style="width:${percent}%"></span></div></div>`;
    }).join('');
  }

  function renderSelect() {
    const tabs = [];
    for (let i = 0; i < activeSlots; i++) tabs.push(`<button data-slot="${i}" class="${i === selSlot ? 'on' : ''}" style="--c:${PLAYER_COLORS[i]}" aria-pressed="${i === selSlot}">P${i + 1}${isCPU[i] ? ' · CPU' : ''}</button>`);
    $('#slot-tabs').innerHTML = tabs.join('');
    $('#slot-tabs').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { selSlot = +b.dataset.slot; AUDIO.sfx('menu'); renderSelect(); const tab = $('#slot-tabs').querySelector(`[data-slot="${selSlot}"]`); if (tab) tab.focus({ preventScroll: true }); }));

    $$('#fighter-grid .fcell').forEach(c => { const selected = c.dataset.key === fighters[selSlot]; c.classList.toggle('sel', selected); c.setAttribute('aria-pressed', selected); });
    const d = FIGHTERS[fighters[selSlot]];
    renderFighterProfile(fighters[selSlot]);
    $('#hero-player').textContent = `P${selSlot + 1} / ${isCPU[selSlot] ? 'CPU' : 'PLAYER'} SELECT`;
    $('#hero-player').style.setProperty('--player', PLAYER_COLORS[selSlot]);
    $('#hero-name').textContent = d.name;
    $('#hero-title').textContent = d.title;
    $('#hero-arch').textContent = d.archetype;
    $('#hero-description').textContent = d.description;
    $('#hero-portrait').src = `assets/portraits/${fighters[selSlot]}_base.png?v=${BUILD}`;
    if (lastHeroKey !== fighters[selSlot]) {
      const hero = $('.hero-top');
      hero.classList.remove('hero-swap'); void hero.offsetWidth; hero.classList.add('hero-swap');
      lastHeroKey = fighters[selSlot];
    }
    $('#hero-portrait').alt = d.name;
    $('.hero-top').style.setProperty('--c', d.color);
    $('#hero-moves').innerHTML = Object.values(d.moves).slice(0, 6).map(m => `<span>${m.name}</span>`).join('') +
      Object.entries(d.specials).map(([dir, s]) => `<span class="sp" title="${s.desc}">${({ neutral: 'NEUTRAL', side: 'SIDE', up: 'UP', down: 'DOWN' })[dir]} · ${s.name}</span>`).join('');
    $('#pal-row').innerHTML = d.palettes.map((p, i) =>
      `<button type="button" class="swatch ${i === pals[selSlot] ? 'on' : ''}" data-p="${i}" aria-label="${p.name} palette" aria-pressed="${i === pals[selSlot]}" title="${p.name}" style="background:linear-gradient(135deg,${p.primary},${p.accent})"></button>`).join('');
    $('#cpu-toggle').textContent = isCPU[selSlot] ? 'CONTROL: CPU' : 'CONTROL: HUMAN';
    $('#cpu-toggle').setAttribute('aria-pressed', isCPU[selSlot]);
    $('#cpu-toggle').classList.toggle('on', isCPU[selSlot]);
    $('#cpu-level').value = rules.aiLevel;
    $('#cpu-level-val').textContent = rules.aiLevel;
    $('#cpu-level-wrap').style.opacity = isCPU.some((v, i) => v && i < activeSlots) ? 1 : 0.35;
    $('#sel-summary').innerHTML = Array.from({ length: activeSlots }, (_, i) =>
      `<button type="button" class="sum ${i === selSlot ? 'active' : ''}" data-slot="${i}" aria-pressed="${i === selSlot}" aria-label="Edit player ${i + 1}, ${FIGHTERS[fighters[i]].name}${isCPU[i] ? ', CPU' : ''}" style="--c:${PLAYER_COLORS[i]}"><img src="assets/portraits/${fighters[i]}_base.png?v=${BUILD}" alt=""><span>P${i + 1}${isCPU[i] ? ' · CPU' : ''}</span><b>${FIGHTERS[fighters[i]].name}</b></button>`).join('');
    $('#rule-summary').textContent = `${rules.mode.toUpperCase()} · ${rules.stocks} STOCK${rules.stocks > 1 ? 'S' : ''}${rules.mode !== 'stock' ? ' · ' + Math.floor(rules.time / 60) + ' MIN' : ''} · ${STAGES[rules.stage].name} · ITEMS ${rules.items.toUpperCase()}`;
  }

  /* ---------------- stages ---------------- */
  function buildStages() {
    const grid = $('#stage-grid');
    const scrollTop = grid.scrollTop;
    grid.innerHTML = STAGE_KEYS.map((k) => {
      const s = STAGES[k];
      const selected = k === rules.stage && !rules.stageRandom;
      return `<button type="button" class="scell ${selected ? 'sel' : ''}" data-k="${k}" style="--c:${s.accent}" aria-pressed="${selected}">
        <canvas class="sthumb" data-stage="${k}" width="260" height="130"></canvas>
        <span class="stage-card-meta"><span>${s.size === 'XL' ? 'XL ARENA' : 'STANDARD'}</span><span>${selected ? 'SELECTED ✓' : 'SELECT →'}</span></span>
        <b>${s.name}</b><small>${s.sub}</small>
      </button>`;
    }).join('');
    $$('#stage-grid .scell').forEach(c => c.addEventListener('click', () => {
      const key = c.dataset.k; rules.stage = key; rules.stageRandom = false; AUDIO.sfx('menu'); buildStages();
      const selected = document.querySelector(`#stage-grid .scell[data-k="${key}"]`);
      if (selected) { selected.classList.add('select-punch'); selected.focus({ preventScroll: true }); }
    }));
    grid.scrollTop = scrollTop;
    drawStageThumbs();
    const rnd = $('#stage-random');
    rnd.classList.toggle('on', rules.stageRandom);
    rnd.setAttribute('aria-pressed', !!rules.stageRandom);
    rnd.textContent = rules.stageRandom ? 'RANDOM: ON' : 'RANDOM: OFF';
    rnd.onclick = () => { rules.stageRandom = !rules.stageRandom; AUDIO.sfx('menu'); buildStages(); };
    $('#stage-back').onclick = () => { AUDIO.sfx('back'); if (lastScreen === 'screen-select') { renderSelect(); show('screen-select'); } else { openTitle(); } };
    $('#stage-go').onclick = () => { AUDIO.sfx('confirm'); startFromSelect(); };
  }

  function drawStageThumbs() {
    $$('#stage-grid canvas.sthumb').forEach(cv => {
      const ctx = cv.getContext('2d');
      const s = STAGES[cv.dataset.stage];
      const W = cv.width, H = cv.height;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, s.bg[0]); g.addColorStop(0.6, s.bg[1]); g.addColorStop(1, s.bg[2]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // ground
      const gd = s.ground;
      const sx = W / Math.max(1500, gd.w + 250);
      const ox = W / 2;
      ctx.fillStyle = shade(s.bg[2], 0.2);
      ctx.fillRect(ox + gd.x * sx, H * 0.72, gd.w * sx, 12);
      ctx.fillStyle = withAlpha(s.accent, 0.9);
      ctx.fillRect(ox + gd.x * sx, H * 0.72 - 2, gd.w * sx, 2.5);
      s.platforms.forEach(p => {
        ctx.fillStyle = shade(s.bg[2], 0.3);
        ctx.fillRect(ox + p.x * sx, H * 0.72 - (-p.y) * sx * 0.9, p.w * sx, 4);
        ctx.fillStyle = withAlpha(s.accent, 0.7);
        ctx.fillRect(ox + p.x * sx, H * 0.72 - (-p.y) * sx * 0.9 - 1, p.w * sx, 1.6);
      });
      // sparkle
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = i % 3 ? s.accent : '#ffffff';
        ctx.fillRect((i * 97 % W), (i * 53 % (H * 0.6)), 1.4, 1.4);
      }
      ctx.globalAlpha = 1;
    });
  }

  /* ---------------- rules ---------------- */
  function buildRules() {
    const r = rules;
    const rulesBody = $('#rules-body');
    const scrollTop = rulesBody.scrollTop;
    rulesBody.innerHTML = `
      <div class="rrow"><label>MODE</label><div class="seg" data-k="mode">
        ${['stock', 'time', 'stamina'].map(v => `<button data-v="${v}" class="${r.mode === v ? 'on' : ''}">${v.toUpperCase()}</button>`).join('')}
      </div></div>
      <div class="rrow"><label>STOCKS</label><div class="seg" data-k="stocks">
        ${[1, 2, 3, 4, 5, 8].map(v => `<button data-v="${v}" class="${r.stocks === v ? 'on' : ''}">${v}</button>`).join('')}
      </div></div>
      <div class="rrow"><label>TIME</label><div class="seg" data-k="time">
        ${[60, 120, 150, 180, 300, 420].map(v => `<button data-v="${v}" class="${r.time === v ? 'on' : ''}">${v / 60}M</button>`).join('')}
      </div></div>
      <div class="rrow"><label>ITEMS</label><div class="seg" data-k="items">
        ${['none', 'low', 'medium', 'high'].map(v => `<button data-v="${v}" class="${r.items === v ? 'on' : ''}">${v.toUpperCase()}</button>`).join('')}
      </div></div>
      <div class="rrow"><label>TEAMS</label><div class="seg" data-k="teams">
        <button data-v="0" class="${!r.teams ? 'on' : ''}">FREE-FOR-ALL</button>
        <button data-v="1" class="${r.teams ? 'on' : ''}">TEAM BATTLE</button>
      </div></div>
      <div class="rrow"><label>TEAM ATTACK</label><div class="seg" data-k="teamAttack">
        <button data-v="0" class="${!r.teamAttack ? 'on' : ''}">OFF</button>
        <button data-v="1" class="${r.teamAttack ? 'on' : ''}">ON</button>
      </div></div>
      <div class="rrow"><label>HAZARDS</label><div class="seg" data-k="hazards">
        <button data-v="0" class="${!r.hazards ? 'on' : ''}">OFF</button>
        <button data-v="1" class="${r.hazards ? 'on' : ''}">ON</button>
      </div></div>
      <div class="rrow"><label>DAMAGE RATIO</label><div class="seg" data-k="damageRatio">
        ${[0.5, 0.75, 1, 1.25, 1.5, 2].map(v => `<button data-v="${v}" class="${r.damageRatio === v ? 'on' : ''}">${v}x</button>`).join('')}
      </div></div>`;
    rulesBody.scrollTop = scrollTop;
    $$('#rules-body .seg button').forEach(b => { b.setAttribute('aria-pressed', b.classList.contains('on')); b.addEventListener('click', () => {
      const k = b.parentElement.dataset.k, v = b.dataset.v;
      rules[k] = ['mode', 'items'].includes(k) ? v : (isNaN(+v) ? v : +v);
      if (k === 'teams') rules.teams = v === '1';
      if (k === 'teamAttack') rules.teamAttack = v === '1';
      if (k === 'hazards') rules.hazards = v === '1';
      if (k === 'damageRatio') rules.damageRatio = +v;
      if (k === 'items') rules.items = v;
      AUDIO.sfx('menu'); buildRules();
      const selected = document.querySelector(`#rules-body .seg[data-k="${k}"] button[data-v="${v}"]`);
      if (selected) selected.focus({ preventScroll: true });
    }); });
    $('#rules-back').onclick = () => { AUDIO.sfx('back'); renderSelect(); show('screen-select'); };
    $('#rules-go').onclick = () => { AUDIO.sfx('confirm'); startFromSelect(); };
  }

  /* ---------------- start match ---------------- */
  function startFromSelect() {
    if (modeTarget === 'classic') { AUDIO.sfx('confirm'); Modes.startClassic(fighters[0], pals[0], rules.aiLevel); return; }
    if (modeTarget === 'targets') { AUDIO.sfx('confirm'); Modes.startTargets(fighters[0], pals[0]); return; }
    if (modeTarget === 'homered') { AUDIO.sfx('confirm'); Modes.startHomeRun(fighters[0], pals[0]); return; }
    if (modeTarget === 'multiman') { AUDIO.sfx('confirm'); Modes.startMultiMan(fighters[0], pals[0], rules.aiLevel); return; }
    const stageKey = rules.stageRandom ? pick(STAGE_KEYS) : rules.stage;
    const cast = [];
    for (let i = 0; i < activeSlots; i++) {
      cast.push({
        key: fighters[i], palIdx: pals[i] % FIGHTERS[fighters[i]].palettes.length,
        isCPU: isCPU[i], team: rules.teams ? (i % 2) : 0,
        label: isCPU[i] ? 'CPU' : 'P' + (i + 1),
      });
    }
    Game.startMatch({ rules: JSON.parse(JSON.stringify(rules)), cast, stageKey });
  }

  /* ---------------- results ---------------- */
  function showResults(match) {
    $('#btn-results-again').hidden = Online.playing;
    $('#btn-results-char').hidden = Online.playing;
    const ranks = match.fighters.slice().sort((a, b) => {
      if (a.stocks !== b.stocks) return b.stocks - a.stocks;
      if (a.stats.kos !== b.stats.kos) return b.stats.kos - a.stats.kos;
      return a.damage - b.damage;
    });
    const win = ranks[0];
    $('#res-winner').innerHTML = `<img class="win-img" src="assets/portraits/${win.key}_base.png?v=${BUILD}" alt=""><div><h2 style="color:${win.pal.accent}">${win.def.name}</h2><p>${win.isCPU ? 'CPU' : 'PLAYER ' + (win.playerIndex + 1)} WINS</p></div>`;
    $('#res-table').innerHTML = `<div class="rt head"><span>#</span><span>FIGHTER</span><span>STOCKS</span><span>KO</span><span>FALLS</span><span>DEALT</span><span>TAKEN</span></div>` +
      ranks.map((f, i) => `<div class="rt ${i === 0 ? 'first' : ''}" style="--c:${f.pal.accent}">
        <span>${i + 1}</span>
        <span class="fname"><img src="assets/portraits/${f.key}_base.png?v=${BUILD}" alt="">${f.def.name}${f.isCPU ? ' <em>CPU</em>' : ''}</span>
        <span>${f.stocks}</span><span>${f.stats.kos}</span><span>${f.stats.falls}</span>
        <span>${Math.round(f.stats.dealt)}%</span><span>${Math.round(f.stats.taken)}%</span>
      </div>`).join('');
    const s = SAVE.data;
    $('#res-challenges').innerHTML = s.challengesDone.map(id => `<span>✔ ${({ first_win: 'FIRST VICTORY', five_ko: 'FIVE KOs IN ONE MATCH', tank: 'SURVIVED PAST 200%', heal_up: 'USED A RECOVERY ITEM' })[id] || id}</span>`).join('') || '<span class="dim">No challenges yet</span>';
    show('screen-results');
  }

  /* ---------------- records ---------------- */
  function buildRecords() {
    const s = SAVE.data;
    const best = s.records;
    $('#records-body').innerHTML = `
      <div class="rec"><h3>LIFETIME</h3>
        <div class="rgrid">
          <div><b>${s.matches}</b><span>MATCHES</span></div>
          <div><b>${s.stats.kos || 0}</b><span>KOs</span></div>
          <div><b>${s.stats.falls || 0}</b><span>FALLS</span></div>
          <div><b>${s.coins}</b><span>RIFT COINS</span></div>
        </div>
      </div>
      <div class="rec"><h3>CHALLENGES</h3>
        <div class="chlist">
          ${[['first_win', 'Win your first match'], ['five_ko', 'Score 5 KOs in one match'], ['tank', 'Survive past 200% damage'], ['heal_up', 'Use a recovery item']]
        .map(([id, desc]) => `<div class="ch ${s.challengesDone.includes(id) ? 'done' : ''}"><span class="dot"></span>${desc}</div>`).join('')}
        </div>
      </div>
      <div class="rec"><h3>ROSTER</h3>
        <div class="rosterrow">${FIGHTER_KEYS.map(k => `<div class="rchip ${s.unlocked.includes(k) ? '' : 'locked'}" style="--c:${FIGHTERS[k].color}"><img src="assets/portraits/${k}_base.png?v=${BUILD}" alt=""><b>${FIGHTERS[k].name}</b></div>`).join('')}</div>
      </div>
      ${buildCloudPanel()}
      <p class="hint">Earn Rift Coins by completing challenges. All fighters are unlocked from the start — the coin system tracks mastery progress.</p>`;
    wireCloudPanel();
    show('screen-records');
  }

  /* ---- Cloud saves (Settings → js/cloud.js) ---- */
  function cloudState() {
    try { return (typeof CloudSave !== 'undefined' && CloudSave) ? CloudSave.state() : null; } catch (e) { return null; }
  }
  const CLOUD_LABEL = { off: 'OFF', idle: 'SYNCED', syncing: 'SYNCING…', error: 'NOT SYNCED' };

  function buildCloudPanel() {
    if (typeof CloudSave === 'undefined' || !CloudSave) return '';
    const st = cloudState() || { enabled: false, configured: false };
    const cfg = CloudSave.config();
    const when = st.lastSyncAt ? new Date(st.lastSyncAt).toLocaleString() : 'never';
    const note = st.enabled
      ? `${CLOUD_LABEL[st.status] || st.status}${st.detail ? ' · ' + st.detail : ''} · rev ${st.rev || 0} · last sync ${when}`
      : st.configured
        ? 'Turn it on to push this save to your Supabase project and pull it on any other device.'
        : 'Paste your project URL and publishable (anon) key to enable cross-device saves.';
    return `
      <div class="rec" id="cloud-panel">
        <h3>CLOUD SAVES</h3>
        <div class="cld">
          <div class="cld-row">
            <button class="pill ${st.enabled ? 'on' : ''}" id="cloud-toggle" aria-pressed="${!!st.enabled}">${st.enabled ? 'CLOUD: ENABLED' : 'CLOUD: DISABLED'}</button>
            <span class="cld-note">${note}</span>
          </div>
          <label class="cld-field"><span>PROJECT URL</span><input id="cloud-url" type="url" placeholder="https://xxxxxxxx.supabase.co" value="${cfg.url || ''}" autocomplete="off" spellcheck="false"></label>
          <label class="cld-field"><span>PUBLISHABLE KEY</span><input id="cloud-key" type="text" placeholder="${cfg.key ? 'saved — type to replace it' : 'sb_publishable_… (or the legacy anon key)'}" autocomplete="off" spellcheck="false"></label>
          <div class="cld-row">
            <button class="pill" id="cloud-sync">SYNC NOW</button>
            <button class="pill" id="cloud-forget">FORGET THIS DEVICE</button>
          </div>
        </div>
      </div>`;
  }

  let cloudUnsub = null;
  function refreshCloudPanel() {
    const host = document.getElementById('cloud-panel');
    if (!host) return;
    if (cloudUnsub) { try { cloudUnsub(); } catch (e) { } cloudUnsub = null; }
    const tmp = document.createElement('div');
    tmp.innerHTML = buildCloudPanel();
    const fresh = tmp.firstElementChild;
    if (!fresh) return;
    if (host.replaceWith) host.replaceWith(fresh); else host.parentElement.replaceChild(fresh, host);
    wireCloudPanel();
  }

  function wireCloudPanel() {
    if (typeof CloudSave === 'undefined' || !CloudSave) return;
    const $ = sel => document.querySelector(sel);
    const on = (sel, ev, fn) => { const n = $(sel); if (n) n.addEventListener(ev, fn); };
    on('#cloud-toggle', 'click', () => {
      const cfg = CloudSave.config();
      if (!cfg.url || !cfg.key) { AUDIO.sfx('back'); return; }
      const next = !cfg.enabled;
      CloudSave.saveConfig({ enabled: next });
      if (next) CloudSave.syncNow().catch(() => { });
      AUDIO.sfx('menu');
      refreshCloudPanel();
    });
    on('#cloud-sync', 'click', () => { AUDIO.sfx('menu'); CloudSave.syncNow().catch(() => { }); setTimeout(refreshCloudPanel, 1200); });
    on('#cloud-forget', 'click', () => { AUDIO.sfx('back'); CloudSave.disconnect(); refreshCloudPanel(); });
    for (const [sel, field] of [['#cloud-url', 'url'], ['#cloud-key', 'key']]) {
      const node = $(sel);
      if (!node) continue;
      node.addEventListener('change', () => {
        const v = node.value.trim();
        if (!v) return;                                  // untouched field, leave it alone
        CloudSave.saveConfig({ [field]: v });
        AUDIO.sfx('menu');
        refreshCloudPanel();
      });
    }
    const st = cloudState();
    if (st && st.enabled && CloudSave.onChange) cloudUnsub = CloudSave.onChange(() => { try { refreshCloudPanel(); } catch (e) { } });
  }

  function hideResults() { show('screen-match'); }

  function showCustomResults(cfg) {
    $('#btn-results-again').hidden = false;
    $('#btn-results-char').hidden = false;
    $('#res-winner').innerHTML = `<div><h2 style="color:${cfg.color}">${cfg.title}</h2><p>${cfg.sub}</p></div>`;
    $('#res-table').innerHTML = `<div class="res-table">${cfg.lines.map(l => `<div class="rt" style="grid-template-columns:1fr"><span>${l}</span></div>`).join('')}</div>`;
    $('#res-challenges').innerHTML = '';
    $('#hud').style.display = 'none';
    show('screen-results');
  }

  function openTitle() {
    Online.leave();
    buildTitle();
    show('screen-title');
    AUDIO.startMusic();
  }

  /* ---------------- settings ---------------- */
  function openSettings(from) {
    settingsReturn = from;
    renderSettings();
    show('screen-settings');
  }
  function renderSettings() {
    const settings = SAVE.data.settings;
    $$('#screen-settings [data-setting]').forEach(button => {
      const on = button.dataset.setting === 'master' ? !AUDIO.muted : settings[button.dataset.setting] !== false;
      const selected = (button.dataset.value === 'on') === on;
      button.classList.toggle('on', selected);
      button.setAttribute('aria-pressed', selected);
    });
  }
  function closeSettings() {
    if (settingsReturn === 'screen-match') show('screen-match');
    else openTitle();
  }

  /* ---------------- playback / pause ---------------- */
  function setupMatchScreen() {
    $('#pause-overlay').classList.remove('on');
    $('#btn-resume').onclick = () => { Game.togglePause(false); };
    $('#btn-pause-settings').onclick = () => openSettings('screen-match');
    $('#btn-restart').onclick = () => { Game.togglePause(false); Game.restart(); };
    $('#btn-quit').onclick = () => { Game.togglePause(false); Game.quitToMenu(); };
    $('#btn-pause').onclick = () => Game.togglePause(true);
  }

  function showPause(on) { $('#pause-overlay').classList.toggle('on', on); }

  function boot() {
    SAVE.load();
    INPUT.init();
    document.addEventListener('click', e => { navigationTrigger = e.target.closest('button'); }, true);
    /* Printed on boot so "is my tab running the new code?" is a one-glance answer. */
    console.info('[rift] build ' + (typeof BUILD !== 'undefined' ? BUILD : '?'));
    buildTitle();
    buildSelect();
    setupModePreviews();
    setupMatchScreen();
    $('#btn-vs').onclick = () => { AUDIO.sfx('confirm'); modeTarget = 'vs'; show('screen-select'); renderSelect(); };
    $$('#screen-title .modebtn').forEach(b => b.addEventListener('click', () => {
      AUDIO.sfx('confirm');
      modeTarget = b.dataset.mode;
      if (modeTarget === 'online') { Online.open(); return; }
      show('screen-select'); renderSelect();
    }));
    $('#btn-records').onclick = () => { AUDIO.sfx('menu'); buildRecords(); };
    $('#btn-settings').onclick = () => { AUDIO.sfx('menu'); openSettings('screen-title'); };
    $('#settings-back').onclick = closeSettings;
    window.addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat && current === 'screen-settings' && !e.target.isContentEditable && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) setTimeout(renderSettings, 0); });
    $$('#screen-settings [data-setting]').forEach(b => b.addEventListener('click', () => {
      const key = b.dataset.setting;
      const on = b.dataset.value === 'on';
      if (key === 'master') {
        if (on === AUDIO.muted) AUDIO.toggleMute();
      } else {
        SAVE.data.settings[key] = on;
        SAVE.save();
        if (key === 'music') {
          if (!on) AUDIO.stopMusic();
          else if (settingsReturn !== 'screen-match') AUDIO.startMusic();
        }
      }
      AUDIO.sfx('menu'); renderSettings();
    }));
    $('#records-back').onclick = () => { AUDIO.sfx('back'); openTitle(); };
    $('#btn-help').onclick = () => { AUDIO.sfx('menu'); show('screen-help'); };
    $('#help-back').onclick = () => { AUDIO.sfx('back'); openTitle(); };
    $('#btn-results-again').onclick = () => { AUDIO.sfx('confirm'); Game.restart(); };
    $('#btn-results-menu').onclick = () => { AUDIO.sfx('menu'); Modes.reset(); openTitle(); };
    $('#btn-results-char').onclick = () => { AUDIO.sfx('menu'); Modes.reset(); renderSelect(); show('screen-select'); };
    $('#sel-back').onclick = () => { AUDIO.sfx('back'); openTitle(); };

    window.addEventListener('ui-escape', () => {
      navigationTrigger = null;
      if (current === 'screen-match') { if (Online.playing) { Online.leave(); Game.quitToMenu(); } else Game.togglePause(); }
      else if (current === 'screen-online') { Online.leave(); openTitle(); }
      else if (current === 'screen-settings') { closeSettings(); }
      else if (['screen-select', 'screen-rules', 'screen-stage', 'screen-records', 'screen-help'].includes(current)) {
        if (current === 'screen-stage' || current === 'screen-rules') { renderSelect(); show('screen-select'); }
        else openTitle();
      }
    });
    window.addEventListener('ui-enter', () => {
      if (current === 'screen-title' && document.activeElement.tagName !== 'BUTTON') { AUDIO.sfx('confirm'); modeTarget = 'vs'; renderSelect(); show('screen-select'); }
    });
    $('[data-toucha]') && $$('.touchbtn').forEach(b => {
      const key = b.dataset.touch;
      const map = INPUT.map.p1;
      const code = { left: map.left, right: map.right, up: map.up, down: map.down, attack: map.attack, special: map.special, jump: map.jump, shield: map.shield, grab: map.grab }[key];
      const down = e => { e.preventDefault(); INPUT.keys[code] = true; INPUT.pressed[code] = true; b.classList.add('down'); };
      const up = e => { e.preventDefault(); INPUT.keys[code] = false; b.classList.remove('down'); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    });
    show('screen-title');
  }

  return {
    boot, show, toast, showResults, showCustomResults, hideResults, showPause, renderSelect, openTitle,
    get modeTarget() { return modeTarget; },
    get current() { return current; },
    get rules() { return rules; },
  };
})();

/* ============================================================
   GAME LOOP
   ============================================================ */
const Game = (() => {
  let canvas, ctx, match = null, raf = null, last = 0, acc = 0;
  const STEP = 1000 / 60;
  let frameDt = STEP;                 // smoothed rAF period: the panel-rate estimate
  let cameraIntro = 0;

  function init(cv) {
    canvas = cv; ctx = canvas.getContext('2d');
    resize();
    addEventListener('resize', resize);
  }
  function resize() {
    if (!canvas) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    if (match) { match.W = innerWidth; match.H = innerHeight; match.cam.W = innerWidth; match.cam.H = innerHeight; }
  }

  function startMatch(opts) {
    match = new Match({ rules: opts.rules, cast: opts.cast, stageKey: opts.stageKey, W: innerWidth, H: innerHeight });
    match.cam.x = 0; match.cam.y = -160; match.cam.zoom = 1.3;
    cameraIntro = 60;
    UI.show('screen-match');
    $('#hud').style.display = 'block';
    $('#stage-name').textContent = match.stage.name;
    buildHUD();
    AUDIO.init(); AUDIO.resume();
    if (SAVE.data.settings.music) AUDIO.startMusic();
    if (raf) cancelAnimationFrame(raf);
    last = performance.now(); acc = 0; frameDt = STEP;
    raf = requestAnimationFrame(loop);
  }
  function restart() {
    if (Online.playing) { Online.leave(); quitToMenu(); return; }
    if (!match) return;
    const rules = JSON.parse(JSON.stringify(match.rules));
    const cast = match.fighters.map(f => ({ key: f.key, palIdx: f.palIdx, isCPU: f.isCPU, team: f.team }));
    startMatch({ rules, cast, stageKey: match.stageDef.key });
  }
  function quitToMenu() {
    Online.leave();
    if (raf) cancelAnimationFrame(raf); raf = null;
    match = null;
    $('#hud').style.display = 'none';
    UI.openTitle();
  }
  function togglePause(force) {
    if (!match || Online.playing) return;
    match.paused = force === undefined ? !match.paused : force;
    UI.showPause(match.paused);
    if (match.paused) { AUDIO.stopMusic(); } else if (SAVE.data.settings.music) AUDIO.startMusic();
  }

  const HUD_PLAYER_COLORS = ['#ff5260', '#52aaff', '#ffcf47', '#58dc8a'];
  function buildHUD() {
    const hud = $('#hud-slots');
    hud.innerHTML = '';
    hud.dataset.count = match.fighters.length;
    const matchup = $('#hud-matchup');
    matchup.innerHTML = '';
    matchup.style.display = match.fighters.length === 2 ? 'block' : 'none';
    match.fighters.forEach((f, i) => {
      const color = HUD_PLAYER_COLORS[i % HUD_PLAYER_COLORS.length];
      const player = 'P' + (i + 1);
      const d = document.createElement('div');
      d.className = 'hud-slot';
      d.id = 'hud-' + i;
      d.style.setProperty('--c', color);
      d.innerHTML = `<div class="hud-portrait-wrap"><img class="hud-portrait" src="assets/portraits/${f.key}_base.png?v=${BUILD}" alt=""><span class="hud-player">${player}</span></div><div class="hud-info">
          <div class="hud-tag">${f.def.name}${f.isCPU ? ' · CPU' : ''}</div>
          <div class="hud-dmg"><span class="pct">0</span><span class="pctsign">%</span></div>
          <div class="hud-stocks" aria-label="${f.stocks} stocks">${renderStocks(f, color)}</div>
        </div>`;
      hud.appendChild(d);
      if (match.fighters.length === 2) {
        const panel = document.createElement('div');
        panel.className = 'matchup-panel ' + (i ? 'right' : 'left');
        panel.id = 'matchup-' + i;
        panel.style.setProperty('--c', color);
        panel.innerHTML = `<img src="assets/portraits/${f.key}_base.png?v=${BUILD}" alt=""><div class="matchup-info">
          <div class="matchup-name"><span>${player} · ${f.def.name}</span><span class="matchup-pct">0%</span></div>
          <div class="damage-track" aria-label="Damage"><div class="damage-fill"></div></div>
          <div class="matchup-bottom"><span>DAMAGE</span><span class="smash-status"><span class="smash-segments"><i></i><i></i><i></i><i></i></span> SMASH BALL</span></div>
        </div>`;
        matchup.appendChild(panel);
      }
    });
    $('#hud-timer small').textContent = match.rules.mode === 'stock' ? 'MODE' : 'TIME';
    $('#hud-timer span').textContent = match.rules.mode === 'stock' ? 'STOCK' : formatMatchTime(match.matchTime);
  }
  function renderStocks(f, color) {
    return Array.from({ length: Math.max(0, f.stocks) }, () => `<i class="stockdot" style="background:${color}"></i>`).join('');
  }
  function formatMatchTime(frames) {
    const seconds = Math.max(0, Math.ceil(frames / 60));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }

  let hudT = 0;
  function updateHUD() {
    if (!match || hudT++ % 3 !== 0) return;
    match.fighters.forEach((f, i) => {
      const el = document.getElementById('hud-' + i);
      if (!el) return;
      const pct = el.querySelector('.pct');
      const v = Math.floor(f.damage);
      if (el.dataset.damage !== undefined && v > Number(el.dataset.damage)) {
        el.classList.remove('damage-hit'); void el.offsetWidth; el.classList.add('damage-hit');
      }
      el.dataset.damage = v;
      pct.textContent = v;
      let col = '#ffffff';
      if (v > 150) col = '#ff343d'; else if (v > 110) col = '#ff792f'; else if (v > 70) col = '#ffd23a'; else if (v > 35) col = '#ffe9a8';
      pct.style.color = col;
      pct.style.textShadow = v > 100 ? `0 0 ${12 + Math.sin(performance.now() * 0.01) * 6}px ${col}` : 'none';
      const stocks = el.querySelector('.hud-stocks');
      stocks.innerHTML = renderStocks(f, HUD_PLAYER_COLORS[i % HUD_PLAYER_COLORS.length]);
      stocks.setAttribute('aria-label', Math.max(0, f.stocks) + ' stocks');
      el.classList.toggle('out', f.stocks <= 0);
      el.classList.toggle('lead', match.fighters.every(o => o === f || o.stocks < f.stocks));
      const panel = document.getElementById('matchup-' + i);
      if (panel) {
        panel.querySelector('.matchup-pct').textContent = v + '%';
        panel.querySelector('.damage-fill').style.width = Math.min(100, v / 2) + '%';
        panel.querySelector('.smash-status').classList.toggle('ready', !!f.hasSmashBall);
        panel.classList.toggle('out', f.stocks <= 0);
      }
    });
    if (match.rules.mode !== 'stock') $('#hud-timer span').textContent = formatMatchTime(match.matchTime);
  }

  /* -------- camera intro sweep -------- */
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(now - last, 100); last = now;
    if (dt > 0 && dt < 40) frameDt += (dt - frameDt) * 0.1;
    // fixed timestep 60fps
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      if (match && !match.paused) {
        GAMEPADS.poll();
        if (Online.playing) { Online.tick(match); match.cam.update(match.fighters); }
        else match.update();
        INPUT.endFrame();
      }
      acc -= STEP; steps++;
    }
    /* What fraction of a tick is still outstanding, handed to the draw pass so it
       can land between two physics frames (see Sprites.beginFrame).  Only asked for when the
       panel is outpacing the simulation: at 60 Hz the leftover is what a step was
       going to do anyway, and holding the blend off there keeps the drawn frame
       exactly the tick the engine produced — no added input latency on a normal
       monitor. */
    const alpha = frameDt < STEP * 1.3 ? Math.min(1, acc / STEP) : 0;
    if (match) render(alpha);
    updateHUD();
  }

  function render(alpha) {
    const W = match.W, H = match.H;
    const dpr = canvas.width / W;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cam = match.cam;
    cam.W = W; cam.H = H;
    // render-rate smoothing; see Sprites.beginFrame (skipped while paused, where
    // a frozen fighter has velocity but no motion to interpolate)
    const unblend = Sprites.beginFrame ? Sprites.beginFrame(match, match.paused ? 0 : (alpha || 0)) : null;

    // background (screen space parallax)
    ctx.save();
    Backdrop.draw(ctx, match.stage, cam, match.time);
    ctx.restore();

    // world
    ctx.save();
    cam.apply(ctx);

    Backdrop.drawStageBody(ctx, match.stage, match.time);
    Backdrop.drawPlatforms(ctx, match.stage, match.time);

    // haze / stage hazard
    if (match.stage.hazard && match.stage.hazard.type === 'lava' && match.rules.hazards) {
      const hy = match.stage.hazard.y;
      ctx.save();
      const g = ctx.createLinearGradient(0, hy - 40, 0, hy + 220);
      g.addColorStop(0, 'rgba(255,90,26,0.05)'); g.addColorStop(0.4, 'rgba(255,120,40,0.45)'); g.addColorStop(1, 'rgba(120,20,0,0.9)');
      ctx.fillStyle = g; ctx.fillRect(-2000, hy - 40, 5000, 320);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) {
        const bx = -1400 + ((i * 233 + match.time * 0.06) % 2800);
        ctx.fillStyle = 'rgba(255,160,60,0.22)';
        ctx.beginPath(); ctx.arc(bx, hy + 30 + Math.sin(match.time * 0.004 + i) * 12, 40 + (i % 4) * 12, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    if (match.stage.hazard && match.stage.hazard.type === 'pillar' && match.rules.hazards) {
      const hz = match.stage.hazard;
      const on = Math.floor(((match.pillarT || 0) % hz.period)) < 60;
      if (on) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5;
        const g = ctx.createLinearGradient(hz.x - hz.w / 2, 0, hz.x + hz.w / 2, 0);
        g.addColorStop(0, 'rgba(47,214,187,0)'); g.addColorStop(0.5, 'rgba(47,214,187,0.75)'); g.addColorStop(1, 'rgba(47,214,187,0)');
        ctx.fillStyle = g; ctx.fillRect(hz.x - hz.w / 2, -900, hz.w, 940);
        ctx.restore();
      }
    }

    // summons
    for (const s of match.summons) s.draw(ctx, match.time);
    // mines
    for (const m of match.mines) m.draw(ctx, match.time);

    // fighters sorted by y (depth illusion)
    const players = match.fighters.slice().filter(f => !f.eliminated || f.state === 'respawn').sort((a, b) => a.y - b.y);
    for (const f of players) {
      if (f.state === 'respawn') {
        // revival platform
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.7;
        const g = ctx.createRadialGradient(f.x, f.y + 10, 6, f.x, f.y + 10, 70);
        g.addColorStop(0, withAlpha(f.pal.accent, 0.8)); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(f.x, f.y + 10, 70, 18, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      if (!Sprites.drawSpriteFighter(ctx, f, match.time)) {
        // A simple marker keeps the match usable until the sheet has loaded.
        const body = f.def.body || { w: 44, h: 104 };
        ctx.save(); ctx.fillStyle = f.pal.primary;
        ctx.fillRect(f.x - body.w * f.scale / 2, f.y - body.h * f.scale, body.w * f.scale, body.h * f.scale);
        ctx.restore();
      }
      // final smash aura
      if (f.hasSmashBall) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const t = match.time * 0.006;
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = 0.28 + Math.sin(t * 3 + i) * 0.12;
          const g = ctx.createRadialGradient(f.x, f.y - 56 * f.scale, 8, f.x, f.y - 56 * f.scale, 60 + i * 14);
          g.addColorStop(0, withAlpha('#ffe04a', 0.55)); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y - 56, 60 + i * 14, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      // grab indicator
      if (f.grabbing) {
        ctx.save(); ctx.strokeStyle = f.pal.accent; ctx.globalAlpha = 0.7; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x + f.facing * 30, f.y - 60, 34, 0, TAU); ctx.stroke(); ctx.restore();
      }
      // cpu tag above head (GDD §13.1 player indicator)
      if (!f.eliminated) drawNameTag(ctx, f, match);
    }

    // Items in hand, after the bodies: a held sprite anchored to the knuckle line has
    // to draw over the fighter holding it, or the sword disappears into their back.
    for (const it of match.items) if (it.heldBy) it.draw(ctx, match.time);

    // projectiles & fx
    // ---- Break the Targets
    if (match.targets) {
      for (const t of match.targets) {
        if (t.dead) continue;
        ctx.save();
        const wob = Math.sin(match.time * 0.06 + t.wob) * 3;
        ctx.translate(t.x, t.y + wob);
        ctx.globalCompositeOperation = 'lighter';
        const tg = ctx.createRadialGradient(0, 0, 2, 0, 0, 32);
        tg.addColorStop(0, 'rgba(255,244,180,0.95)');
        tg.addColorStop(0.42, 'rgba(255,196,64,0.55)');
        tg.addColorStop(1, 'rgba(255,150,0,0)');
        ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(0, 0, 32, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, TAU); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-16, 0); ctx.lineTo(16, 0);
        ctx.moveTo(0, -16); ctx.lineTo(0, 16);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ---- Home-Run sandbag
    if (match.bag) {
      const b2 = match.bag;
      ctx.save();
      ctx.translate(b2.x, b2.y); ctx.rotate(b2.rot);
      ctx.fillStyle = '#cbb491';
      ctx.beginPath(); ctx.roundRect(-19, -38, 38, 52, 9); ctx.fill();
      ctx.fillStyle = '#a98a61'; ctx.fillRect(-19, -14, 38, 5);
      ctx.fillStyle = '#8d7150'; ctx.fillRect(-19, -34, 38, 4);
      ctx.fillStyle = '#241c14'; ctx.fillRect(-9, -27, 6, 6); ctx.fillRect(4, -27, 6, 6);
      ctx.strokeStyle = '#6f583c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -8, 7, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.restore();
      if (!b2.launched) {
        const dmg = Math.min(300, b2.dmg);
        ctx.save();
        ctx.fillStyle = 'rgba(8,12,18,0.82)';
        ctx.beginPath(); ctx.roundRect(b2.x - 42, b2.y - 78, 84, 12, 6); ctx.fill();
        ctx.fillStyle = mixColor('#5aa9ff', '#ff3a3a', dmg / 300);
        ctx.beginPath(); ctx.roundRect(b2.x - 40, b2.y - 76, 80 * (dmg / 300), 8, 4); ctx.fill();
        ctx.font = '800 11px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#e8f2ff'; ctx.fillText(Math.round(dmg) + '%', b2.x, b2.y - 84);
        ctx.restore();
      }
    }

    for (const p of match.projectiles) p.draw(ctx, match.time);
    for (const it of match.items) if (!it.heldBy) it.draw(ctx, match.time);
    match.fx.draw(ctx, cam);

    ctx.restore();
    if (unblend) unblend();          // sim state is exactly what the last tick left it

    // screen-space overlays
    ctx.save();
    // hit-flash / KO flash
    if (match.slowmo > 0) {
      ctx.fillStyle = `rgba(255,255,255,${clamp(match.slowmo / 90, 0, 0.35) * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (match.state === 'intro') {
      ctx.fillStyle = 'rgba(6,8,12,0.45)'; ctx.fillRect(0, 0, W, H);
      const t = match.stateT;
      if (t < 45) drawBigText(ctx, '3', W, H, (45 - t) / 45, '#9fd4ff');
      else if (t < 90) drawBigText(ctx, '2', W, H, (90 - t) / 45, '#9fd4ff');
    }
    if (match.announcement) {
      drawBanner(ctx, match.announcement.text, match.announcement.color, match.announcement.t, match.announcement.dur, W, H);
    }
    // ---- mode HUD counters
    if (match.targets) {
      const left = match.targets.filter(t => !t.dead).length;
      ctx.save();
      ctx.font = '900 20px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,12,18,0.7)';
      ctx.beginPath(); ctx.roundRect(W / 2 - 92, 52, 184, 34, 10); ctx.fill();
      ctx.fillStyle = '#ffd23a';
      ctx.fillText('TARGETS ' + (match.targets.length - left) + '/' + match.targets.length, W / 2, 76);
      ctx.restore();
    }
    if (match.multiman) {
      ctx.save();
      ctx.font = '900 20px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,12,18,0.7)';
      ctx.beginPath(); ctx.roundRect(W / 2 - 96, 52, 192, 34, 10); ctx.fill();
      ctx.fillStyle = '#c77dff';
      ctx.fillText('KO ' + (match.multiman.kos || 0) + ' / ' + match.multiman.target, W / 2, 76);
      ctx.restore();
    }

    // ---- hazard telegraph
    const hz = match.stage.hazard;
    if (hz && match.rules.hazards && hz.type === 'pillar') {
      const cyc = (match.pillarT || 0) % hz.period;
      if (cyc > hz.period - 70 && cyc < hz.period) {
        const k = (cyc - (hz.period - 70)) / 70;
        ctx.save();
        ctx.globalAlpha = 0.28 + 0.5 * (Math.floor(match.time / 90) % 2);
        ctx.strokeStyle = '#2fd6bb'; ctx.lineWidth = 3;
        const sx = W / 2 + (hz.x - match.cam.x) * match.cam.zoom;
        ctx.beginPath(); ctx.moveTo(sx - hz.w / 2, 0); ctx.lineTo(sx - hz.w / 2, H);
        ctx.moveTo(sx + hz.w / 2, 0); ctx.lineTo(sx + hz.w / 2, H); ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.font = '900 16px ui-sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#2fd6bb';
        ctx.fillText('!', sx, 40);
        ctx.restore();
      }
    }

    // sudden death / low timer flash
    if (match.rules.mode !== 'stock' && match.matchTime < 600 && Math.floor(match.matchTime / 15) % 2 === 0) {
      ctx.save(); ctx.globalAlpha = 0.1; ctx.fillStyle = '#ff2a2a'; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    Backdrop.drawVignette(ctx, W, H);
    ctx.restore();

    // results transition
    if (match.state === 'over' && match.overT > 70) {
      if (!match._resultsShown) {
        match._resultsShown = true;
        UI.showResults(match);
        $('#hud').style.display = 'none';
        AUDIO.startMusic();
      }
    }
  }

  function drawNameTag(ctx, f, m) {
    const y = f.state === 'ledge' ? f.y + (Sprites.height(f.key) * 1.15 + 16) * f.scale : f.y - 122 * f.scale;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const label = f.isCPU ? 'CPU' : 'P' + (f.playerIndex + 1);
    const w = ctx.measureText(label).width + 14;
    ctx.fillStyle = 'rgba(8,10,16,0.7)';
    ctx.beginPath(); ctx.roundRect(f.x - w / 2, y - 11, w, 16, 5); ctx.fill();
    ctx.strokeStyle = withAlpha(f.pal.accent, 0.7); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = f.pal.accent;
    ctx.fillText(label, f.x, y);
    // combo counter
    if (f.comboCount > 1 && f.comboTimer > 0) {
      ctx.font = '900 20px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#ffe04a'; ctx.globalAlpha = 0.95;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 4;
      const s = f.comboCount + ' HIT' + (f.comboCount > 1 ? 'S' : '');
      ctx.strokeText(s, f.x, y - 26); ctx.fillText(s, f.x, y - 26);
    }
    ctx.restore();
  }
  function drawBigText(ctx, txt, W, H, k, color) {
    ctx.save();
    ctx.globalAlpha = clamp(k * 1.4, 0, 1);
    ctx.translate(W / 2, H * 0.45);
    const s = lerp(2.4, 1, 1 - k);
    ctx.scale(s, s);
    ctx.textAlign = 'center';
    ctx.font = '900 120px ui-sans-serif, system-ui, sans-serif';
    ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(txt, 0, 0);
    ctx.fillStyle = color; ctx.fillText(txt, 0, 0);
    ctx.restore();
  }

  return { init, startMatch, restart, quitToMenu, togglePause, getMatch: () => match };
})();

/* ============================================================
   BOOT
   ============================================================ */
/* debug/test hooks */
window.RR = {
  get match() { return Game.__match ? Game.__match() : window.__match; },
  SAVE, CPU, FIGHTERS, STAGES, ITEMS, INPUT,
  startDuel(a, b, rules) {
    Game.startMatch({
      rules: Object.assign({}, DEFAULT_RULES, { items: 'medium', stocks: 3 }, rules || {}),
      cast: [{ key: a, palIdx: 0, isCPU: false, team: 0, label: 'P1' },
             { key: b, palIdx: 1, isCPU: true, team: 1, label: 'CPU' }],
      stageKey: 'skyshrine',
    });
  },
  makeAllCPU() {
    const m = window.__match;
    if (!m) return false;
    m.fighters.forEach(f => { if (!f.ai) f.ai = new CPU(f, m); f.isCPU = true; });
    return true;
  },
  diag() {
    const m = window.__match; if (!m) return null;
    const f = m.fighters[0];
    return {
      build: typeof BUILD !== 'undefined' ? BUILD : '?',
      st: f.state, keys: Object.keys(INPUT.keys).filter(k => INPUT.keys[k]),
      hit: Object.keys(INPUT.pressed).filter(k => INPUT.pressed[k]),
      buf: JSON.parse(JSON.stringify(f.inputBuffer)),
      prev: JSON.parse(JSON.stringify(f.prevInput)),
      act: f.action && { type: f.action.type, key: f.action.key },
      actT: f.actionT, canAct: f.canAct(), canMove: f.canMove(),
      hj: f.hitstun, hl: f.hitlag, onG: f.onGround, y: Math.round(f.y), vy: +f.vy.toFixed(2),
      pend: f.pendingSpecial || null, cd: m.fighters[0].cooldowns,
    };
  },
  /* drive input for N frames deterministically */
  feed(raw, frames = 1) {
    const m = window.__match; if (!m) return null;
    const f = m.fighters[0];
    for (let i = 0; i < frames; i++) {
      f.readInput(raw);
      f.update(m);
      INPUT.endFrame();
    }
    return window.RR.diag();
  },
  step(n = 1) {
    const m = window.__match;
    if (!m) return null;
    for (let i = 0; i < n && m.state === 'play'; i++) { m.update(); INPUT.endFrame(); }
    return { state: m.state, stocks: m.fighters.map(f => f.stocks), dmg: m.fighters.map(f => Math.round(f.damage)), kos: m.fighters.map(f => f.stats.kos), frame: m.frame };
  },
};

addEventListener('DOMContentLoaded', () => {
  Sprites.load();
  if (Sprites.loadItems) Sprites.loadItems();
  UI.boot();
  if (typeof CloudSave !== 'undefined' && CloudSave) CloudSave.boot();
  Game.init(document.getElementById('game-canvas'));
  // first interaction unlocks audio
  const unlock = () => { AUDIO.init(); AUDIO.resume(); if (SAVE.data.settings.music) AUDIO.startMusic(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
});
