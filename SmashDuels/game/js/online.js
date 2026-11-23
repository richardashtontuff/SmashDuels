/* Server-authoritative online play. The browser sends P1 controls and renders
   snapshots; it never advances combat or decides hits. */
'use strict';
const Online = (() => {
  const presentation=OnlinePresentation.createBuffer();
  const keys=['left','right','up','down','attack','special','jump','shield','grab'];
  let socket=null, room=null, playing=false, ready=false, timer=null, lastMask=-1, noticeTimer=null;
  const el=id=>document.getElementById('online-'+id);
  function status(text){el('status').textContent=text;}
  function notice(message){
    const box=el('notice');box.textContent=message;box.hidden=false;
    clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{box.hidden=true;},5000);
  }
  function send(msg){if(socket && socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(msg));}
  const colors=['#ef3c43','#2688e9','#d6a51c','#35a669'];
  function setup(){
    if(ready)return;ready=true;
    // Build selectable tiles once so server updates don't steal keyboard focus or scroll.
    for(const [key,f] of Object.entries(FIGHTERS)){
      const button=document.createElement('button');button.type='button';button.className='fcell';button.dataset.key=key;button.style.setProperty('--c',f.color);
      button.innerHTML=`<img src="assets/portraits/${key}_base.png?v=${BUILD}" alt=""><span class="fmeta"><b>${f.name}</b><small>${f.title}</small></span><span class="online-tile-players"></span>`;
      button.addEventListener('click',()=>send({type:'character',key}));el('fighters').append(button);
    }
    for(const key of STAGE_KEYS){
      const stage=STAGES[key];
      const button=document.createElement('button');button.type='button';button.className='scell';button.dataset.key=key;button.style.setProperty('--c',stage.accent);
      button.innerHTML=`<canvas width="260" height="130" aria-hidden="true"></canvas><b>${stage.name}</b><small>${stage.size==='XL'?'XL ARENA':'STANDARD'}</small><span class="online-stage-players"></span>`;
      drawStage(button.querySelector('canvas'),stage);
      button.addEventListener('click',()=>{if(!room)return;if(room.mode==='private')send({type:'stage',key});else send({type:'stage_preview',key});});
      const tile=document.createElement('div');tile.className='stage-tile';
      const info=document.createElement('button');info.type='button';info.className='stage-info-button';info.textContent='i';info.setAttribute('aria-label',`About ${stage.name}`);
      info.addEventListener('click',()=>StageInfo.open(key,info));tile.append(button,info);el('stages').append(tile);
    }
    el('back').onclick=()=>{leave();UI.openTitle();};
    el('leave').onclick=()=>{leave();entry();status('Connect to play online.');};
    el('queue').onclick=()=>connect({type:'queue'});
    el('create').onclick=()=>connect({type:'create'});
    el('join').onclick=()=>connect({type:'join',code:el('code').value});
    el('hazards').onclick=()=>{if(room && room.mode==='private' && room.id===room.host)send({type:'hazards',enabled:!room.hazards});};
    el('vote').onclick=()=>{const me=room && room.players.find(p=>p.id===room.id);if(me)send({type:'vote',key:me.stageChoice||'battlefield'});};
    el('start').onclick=()=>send({type:'start'});
    window.addEventListener('blur',()=>{
      for (const key of keys) { const code=INPUT.map.p1[key]; INPUT.keys[code]=false; INPUT.pressed[code]=false; }
      send({type:'input',mask:0});lastMask=-1;
    });
  }
  function drawStage(cv,s){
    const ctx=cv.getContext('2d'), W=cv.width,H=cv.height;
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,s.bg[0]);g.addColorStop(.6,s.bg[1]);g.addColorStop(1,s.bg[2]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    cv.dataset.thumbKey=s.key;
    const img=Backdrop.image(s);
    if(img && img.complete && img.naturalWidth)Backdrop.cover(ctx,img,W,H);
    else if(img && !img.complete)img.addEventListener('load',()=>{if(cv.dataset.thumbKey===s.key)drawStage(cv,s);},{once:true});
    const gd=s.ground,sx=W/Math.max(1500,gd.w+250),ox=W/2;
    for(const part of deckSegments(s)) {ctx.fillStyle=shade(s.bg[2],.2);ctx.fillRect(ox+part.x*sx,H*.72,part.w*sx,12);
      ctx.fillStyle=withAlpha(s.accent,.9);ctx.fillRect(ox+part.x*sx,H*.72-2,part.w*sx,2.5);}
    for(const spike of s.floorSpikes || []) {ctx.fillStyle='#ff9a50';ctx.fillRect(ox+spike.x*sx,H*.72-5,spike.w*sx,3);}
    s.platforms.forEach(p=>{if(p.motion && ((p.motion.kind==='forms' && !p.motion.forms.includes('normal')) || (p.motion.kind==='sketch' && p.motion.group!==0)))return;ctx.fillStyle=shade(s.bg[2],.3);ctx.fillRect(ox+p.x*sx,H*.72-(-p.y)*sx*.9,p.w*sx,4);ctx.fillStyle=withAlpha(s.accent,.7);ctx.fillRect(ox+p.x*sx,H*.72-(-p.y)*sx*.9-1,p.w*sx,1.6);});
    ctx.globalAlpha=.5;for(let i=0;i<18;i++){ctx.fillStyle=i%3?s.accent:'#fff';ctx.fillRect(i*97%W,i*53%(H*.6),1.4,1.4);}ctx.globalAlpha=1;
  }
  function entry(){StageInfo.close();room=null;el('entry').hidden=false;el('room').hidden=true;document.querySelector('.online-shell').classList.remove('in-room');}
  function open(){setup();entry();status('Connect to play online.');UI.show('screen-online');}
  function leave(){presentation.reset();playing=false;room=null;lastMask=-1;if(timer){clearInterval(timer);timer=null;}if(socket){send({type:'leave'});const old=socket;socket=null;old.close();}}
  function connect(first){
    if(socket)return;
    status('Connecting…');el('entry').hidden=true;el('room').hidden=false;document.querySelector('.online-shell').classList.add('in-room');el('room-info').textContent='CONNECTING…';el('players').replaceChildren();el('player-count').textContent='';el('fighter-section').hidden=el('stage-section').hidden=el('start').hidden=true;
    const scheme=location.protocol==='https:'?'wss:':'ws:';
    const ws=new WebSocket(scheme+'//'+location.host+'/online');socket=ws;
    ws.onopen=()=>{if(socket===ws)send(first);};
    ws.onmessage=e=>{if(socket!==ws)return;let msg;try{msg=JSON.parse(e.data)}catch{return;}receive(msg);};
    ws.onclose=()=>{if(socket!==ws)return;socket=null;presentation.reset();if(playing){playing=false;Game.stopMatchView();UI.show('screen-online');}entry();status('Disconnected from the online server.');notice('Disconnected from the online server.');};
    ws.onerror=()=>status('Could not connect to the online server.');
  }
  function receive(msg){
    if(msg.type==='waiting'){el('room-info').textContent='SEARCHING FOR A RIVAL…';status('Waiting for another player.');return;}
    if(msg.type==='error'){leave();entry();status(msg.message);notice(msg.message);return;}
    if(msg.type==='notice'){notice(msg.message);return;}
    if(msg.type==='round_aborted'){presentation.reset();playing=false;lastMask=-1;Game.stopMatchView();UI.show('screen-online');notice(msg.message);return;}
    if(msg.type==='ended'){const wasPlaying=playing;leave();if(wasPlaying){Game.stopMatchView();UI.show('screen-online');}entry();status(msg.message);notice(msg.message);return;}
    if(msg.type==='room'){room=msg;renderRoom();return;}
    if(msg.type==='start'){
      presentation.reset();playing=true;lastMask=-1;Game.startMatch({rules:Object.assign({},DEFAULT_RULES,msg.rules),cast:msg.cast,stageKey:msg.stage});return;
    }
    if(msg.type==='snapshot' && playing)presentation.push(msg.data);
  }
  function returnToRoom(){
    if(!playing || !room || room.mode!=='private' || !socket || socket.readyState!==WebSocket.OPEN)return;
    send({type:'return_room'});presentation.reset();playing=false;lastMask=-1;Game.stopMatchView();UI.show('screen-online');renderRoom();
  }
  function playerBadge(index,text){const badge=document.createElement('span');badge.className='online-player-badge';badge.style.setProperty('--player-color',colors[index]);badge.textContent=text||'P'+(index+1);return badge;}
  function renderRoom(){
    if(!room || playing)return;
    const me=room.players.find(p=>p.id===room.id);if(!me)return;
    const myIndex=room.players.indexOf(me), host=room.id===room.host, queue=room.mode==='queue';
    const voting=queue&&room.phase==='voting', select=queue&&room.phase==='select', lobby=!queue&&room.phase==='lobby';
    el('room-info').textContent=queue?'1v1 MATCH FOUND':`ROOM CODE / ${room.code}`;
    el('player-count').textContent=`${room.players.length} / ${queue?2:4} PLAYERS`;
    const slots=[];for(let i=0;i<(queue?2:4);i++){
      const p=room.players[i], card=document.createElement('div');card.className='online-player-slot'+(p?'':' empty')+(p&&p.id===room.id?' is-you':'');card.style.setProperty('--player-color',colors[i]);
      if(p){const f=FIGHTERS[p.character],pal=f.palettes[p.palIdx];card.innerHTML=`<div class="online-slot-head"><span>P${i+1}${p.id===room.id?' / YOU':''}</span><span>${!queue&&!p.inLobby?'⏳ RESULTS':!queue&&p.id===room.host?'★ HOST':queue&&voting&&p.vote?'✓ LOCKED':'● CONNECTED'}</span></div><img src="assets/portraits/${p.character}_base.png?v=${BUILD}" alt=""><div class="online-slot-name"><strong>${f.name}</strong><small><i class="online-palette-chip" style="background:${pal.primary};border-color:${pal.accent}"></i> ${pal.name}</small></div>`;}
      else card.innerHTML=`<div class="online-slot-head"><span>P${i+1}</span><span>OPEN SLOT</span></div><div class="online-slot-empty">+</div><div class="online-slot-name"><strong>AWAITING PLAYER</strong><small>Share the room code</small></div>`;
      slots.push(card);
    }el('players').replaceChildren(...slots);
    el('fighter-section').hidden=!(select||lobby);el('stage-section').hidden=!(voting||select||lobby);
    for(const button of el('fighters').children){const key=button.dataset.key, selected=me.character===key;button.classList.toggle('sel',selected);button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-label',FIGHTERS[key].name+(selected?', your selection':''));
      const badges=room.players.flatMap((p,i)=>p.character===key?[playerBadge(i)]:[]);button.querySelector('.online-tile-players').replaceChildren(...badges);
    }
    const f=FIGHTERS[me.character];el('showcase').style.setProperty('--c',f.color);el('showcase').style.setProperty('--scene',`url("../assets/select/${me.character}.jpg?v=${BUILD}")`);
    el('hero-image').src=`assets/portraits/${me.character}_base.png?v=${BUILD}`;el('hero-player').textContent=`P${myIndex+1} / YOUR PICK`;el('hero-name').textContent=f.name;el('hero-title').textContent=f.title;
    el('palette-name').textContent=f.palettes[me.palIdx].name;
    const paletteButtons=f.palettes.map((pal,i)=>{const b=document.createElement('button');b.type='button';b.className='online-palette'+(i===me.palIdx?' on':'');b.style.background=`linear-gradient(135deg,${pal.primary},${pal.accent})`;b.setAttribute('aria-label',pal.name+' palette');b.setAttribute('aria-pressed',String(i===me.palIdx));b.title=pal.name;b.onclick=()=>send({type:'palette',index:i});return b;});
    // Keep focused controls intact on unrelated room updates.
    const paletteSignature=me.character;
    if(el('palettes').dataset.signature!==paletteSignature){el('palettes').dataset.signature=paletteSignature;el('palettes').replaceChildren(...paletteButtons);}
    Array.from(el('palettes').children).forEach((b,i)=>{b.classList.toggle('on',i===me.palIdx);b.setAttribute('aria-pressed',String(i===me.palIdx));});
    el('stage-heading').textContent=voting?'01 / VOTE FOR AN ARENA':'03 / THE ARENA';
    el('stage-hint').textContent=voting?'BOTH PLAYERS VOTE':lobby?(host?'HOST CHOOSES THE STAGE':'HOST CONTROLS THE STAGE'):'STAGE SELECTED';
    if (select) StageInfo.close();
    el('stages').hidden=select;
    for(const button of el('stages').querySelectorAll('.scell')){const key=button.dataset.key,selected=voting?me.stageChoice===key:room.stage===key;
      button.classList.toggle('sel',selected);button.disabled=select||(lobby&&!host)||(voting&&!!me.vote);button.setAttribute('aria-pressed',String(selected));
      button.setAttribute('aria-label',`${STAGES[key].name}${selected?', selected':''}`);
      const badges=voting?room.players.flatMap((p,i)=>p.stageChoice===key?[playerBadge(i,'P'+(i+1)+(p.vote?' ✓':''))]:[]):[];
      button.querySelector('.online-stage-players').replaceChildren(...badges);
    }
    drawStage(el('selected-stage'),STAGES[voting?(me.stageChoice||'battlefield'):room.stage]);
    el('stage-current').textContent=voting?`YOUR VOTE: ${STAGES[me.stageChoice||'battlefield'].name}${me.vote?' · LOCKED':''}`:`SELECTED ARENA: ${STAGES[room.stage].name}`;
    el('hazards').hidden=!lobby;el('hazards').disabled=!host;
    el('hazards').textContent=`HAZARDS: ${room.hazards?'ON':'OFF'}`;
    el('hazards').setAttribute('aria-pressed',String(!!room.hazards));
    el('hazards').setAttribute('aria-label',`Stage hazards ${room.hazards?'on':'off'}${host?', toggle':', host controls'}`);
    el('vote').hidden=!voting;el('vote').disabled=!!me.vote;el('vote').textContent=me.vote?'STAGE LOCKED ✓':'LOCK IN STAGE ▶';
    el('start').hidden=!(lobby&&host);el('start').disabled=room.players.length<2 || !room.players.every(p=>p.inLobby);
    if(timer)clearInterval(timer);
    const update=()=>{if(!room)return;if(select)status(`Choose your fighter — ${Math.max(0,Math.ceil((room.deadline-Date.now())/1000))}s remaining`);else if(voting)status('Choose an arena and lock in. If votes differ, one is picked at random.');else if(lobby)status(!room.players.every(p=>p.inLobby)?'Waiting for players to return from results.':host?'Choose an arena and start when at least two players have joined.':'Choose your fighter. Waiting for the host to start.');else if(room.phase==='results')status('Round complete. Returning to the room…');};
    update();if(select)timer=setInterval(update,200);
  }
  function tick(m,blocked){
    const input=blocked?{}:m.readPlayerInput(m.fighters[0]);let mask=0;keys.forEach((k,i)=>{if(input[k])mask|=1<<i;});
    if(mask!==lastMask){send({type:'input',mask});lastMask=mask;}
  }
  function present(now){
    const s=OnlinePresentation.interpolate(presentation.sample(now));
    if(s)apply(s);
  }
  function apply(s){
    const m=Game.getMatch();if(!m)return;
    for(const k of ['frame','time','state','stateT','overT','announcement'])m[k]=s[k];
    s.fighters.forEach((f,i)=>{const grab=f.grabbing;Object.assign(m.fighters[i],f);m.fighters[i].grabbing=grab===null?null:m.fighters[grab];});
    m.stage.form=s.stageForm || 'normal';
    if(s.stageMechanic)m.stage.mechanic=s.stageMechanic;
    if(s.stageHazard)m.stage.hazard=s.stageHazard;
    m.items=(s.items||[]).map(p=>Object.assign(new Item(p.type,p.x,p.y,m),p));
    s.platforms.forEach((p,i)=>Object.assign(m.stage.platforms[i],p));
    m.projectiles=s.projectiles.map(p=>Object.assign(new Projectile(p),p));
    m.mines=s.mines.map(p=>Object.assign(new Mine(p),p));
    m.summons=s.summons.map(p=>Object.assign(new Summon(p),p));
    Object.assign(m.fx,s.fx);
    if(s.winner)m.winner=s.winner.map(i=>m.fighters[i]);
  }
  return {open,leave,tick,present,returnToRoom,get playing(){return playing;},get canReturn(){return playing && room && room.mode==='private';}};
})();
