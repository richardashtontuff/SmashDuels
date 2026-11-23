'use strict';
const assert=require('assert'), vm=require('vm');
const {boot,load,cast,newMatch}=require('./harness');
const h=boot();load(h.ctx,['js/tutorial.js']);
const {INPUT, SAVE, Tutorial}=vm.runInContext('({INPUT,SAVE,Tutorial})',h.ctx);
// Exercise persisted maps, migration, swapping and the real match input reader.
INPUT.loadBindings(null);assert.equal(INPUT.map.p1.attack,'KeyF');
assert(INPUT.bind('p1','attack','KeyQ'));assert.equal(INPUT.map.p1.attack,'KeyQ');
INPUT.loadBindings(JSON.parse(JSON.stringify(SAVE.data.settings.keyBindings)));assert.equal(INPUT.map.p1.attack,'KeyQ');
assert(INPUT.bind('p1','jump','KeyQ'));assert.equal(INPUT.map.p1.jump,'KeyQ');assert.equal(INPUT.map.p1.attack,'Space');
assert(!INPUT.bind('p1','attack','Escape'));assert(!INPUT.bind('p1','attack','KeyM'));
const corrupt=JSON.parse(JSON.stringify(INPUT.map));corrupt.p1.left='Escape';INPUT.loadBindings(corrupt);assert.equal(INPUT.map.p1.left,'KeyA');assert.equal(INPUT.map.p2.attack,'Numpad1');
INPUT.resetBindings('p1');assert.equal(INPUT.map.p1.jump,'Space');
const inputMatch=newMatch(h.ctx,cast(2,['valor','grim']),'battlefield');
INPUT.bind('p1','attack','KeyQ');INPUT.keys.KeyQ=true;assert(inputMatch.readPlayerInput(inputMatch.fighters[0]).attack);
INPUT.clear();INPUT.touch.attack=true;assert(inputMatch.readPlayerInput(inputMatch.fighters[0]).attack,'touch must be independent of keyboard bindings');assert(!inputMatch.readPlayerInput(inputMatch.fighters[1]).attack);
INPUT.clear();
function tutorial(key='valor'){
 const m=newMatch(h.ctx,cast(2,[key,key]),'battlefield',{rules:{items:'none',hazards:false,stocks:3}});
 m.fighters[1].isCPU=true;m.tutorial=Tutorial.create(m);m.fighters.forEach((f,i)=>{f.x=i?240:-240;f.y=m.stage.ground.y;f.onGround=true;f.onPlatform=null;f.state='idle';f.vx=f.vy=0;});
 m.readPlayerInput=f=>f.__raw || {};
 const step=(raw={},n=1)=>{for(let i=0;i<n;i++){m.fighters[0].__raw=raw;m.update();}};
 return {m,t:m.tutorial,step};
}
{
 const {m,t,step}=tutorial(); const f=m.fighters[0],dummy=m.fighters[1];
 const attempt=(name,run)=>{const previous=t.index;run();assert(t.success>0,`${name} was not recognized: ${t.feedback} / ${f.state} ${f.action?.key}`);step({},56);assert.equal(t.index,previous+1,`${name} did not advance`);step({},100);};
 const startX=dummy.x;step({},60);assert(Math.abs(dummy.x-startX)<2,'dummy must not use combat AI');
 attempt('move',()=>step({right:true},8));
 attempt('jump',()=>step({jump:true},1));
 attempt('double jump',()=>{step({jump:true},1);step({},8);step({jump:true},1);});
 attempt('jab',()=>step({attack:true},1));
 attempt('smash',()=>step({right:true,attack:true},1));
 step({special:true},1);assert.equal(t.success,0,'wrong move must not advance the lesson');assert.match(t.feedback,/That was neutral special/);step({},100);
 attempt('dash',()=>{step({right:true},8);step({right:true,attack:true},1);});
 attempt('neutral special',()=>step({special:true},1));
 attempt('side special',()=>step({left:true,special:true},1));
 attempt('up special',()=>step({up:true,special:true},1));
 attempt('down special',()=>step({down:true,special:true},1));
 attempt('aerial',()=>{step({jump:true},1);step({},8);step({attack:true},1);});
 attempt('shield',()=>step({shield:true},1));
 attempt('grab',()=>step({grab:true},1));
 assert.equal(t.lessons[t.index].id,'tether');assert.equal(f.key,'briar','Valor should switch to Briar for the tether lesson');assert.equal(m.state,'play','practice keeps running');
 const coins=SAVE.data.coins,done=SAVE.data.challengesDone.length;
 m.triggerChallenge('damage',f);assert.equal(SAVE.data.coins,coins);assert.equal(SAVE.data.challengesDone.length,done);
 for(let i=0;i<5;i++){m.koFighter(dummy,f);assert(!dummy.eliminated);assert.equal(dummy.stocks,3);}
 m.checkEnd();assert.equal(m.state,'play','practice must never end on a KO');
}
// Demonstrations use real dummy input, for every fighter and every lesson.
for(const key of Object.keys(h.g.FIGHTERS))for(let i=0;i<Tutorial.lessons.length;i++){
 const {m,t,step}=tutorial(key),d=m.fighters[1],id=Tutorial.lessons[i].id;t.index=i;
 assert(t.startDemo(),`${key} ${id} demo did not start`);
 let observed=false;
 for(let n=0;n<95;n++){
  step();const a=d.action;
  if(id==='move' && Math.abs(d.vx)>1)observed=true;
  if(id==='jump' && (d.state==='jump'||d.state==='doublejump'))observed=true;
  if(id==='doublejump' && d.state==='doublejump')observed=true;
  if(id==='jab' && a?.key==='jab')observed=true;
  if(id==='smash' && /smash$/.test(a?.key||''))observed=true;
  if(id==='dash' && a?.key==='dashattack')observed=true;
  if(id==='neutral' && a?.specialKey==='n')observed=true;
  if(id==='side' && a?.specialKey==='s')observed=true;
  if(id==='up' && a?.specialKey==='u')observed=true;
  if(id==='down' && a?.specialKey==='d')observed=true;
  if(id==='air' && /air$/.test(a?.key||''))observed=true;
  if(id==='shield' && d.state==='shield')observed=true;
  if(id==='grab' && a?.type==='grabbing')observed=true;
 }
 assert(observed,`${key} ${id} demo never performed the move`);
}
console.log('tutorial and controls: bindings, input, all lessons, safe dummy and all fighter demos passed');
// Character-specific ledge training uses the real rope, ledge and recovery physics.
for(const key of ['briar','nomad']) {
 const {m,t,step}=tutorial(key), f=m.fighters[0], d=m.fighters[1], edge=m.stage.ground.x+m.stage.ground.w;
 assert.equal(t.lessons.length,Tutorial.lessons.length+1);assert(t.openLedge());
 assert.equal(t.lessons[t.index].id,'tether');assert.equal(f.x,edge-130);assert(f.onGround && !f.usedUpB);
 // Onstage up-special and a regular ledge catch must not be mistaken for a tether.
 step({up:true,special:true});step({},12);assert.equal(t.success,0,'normal up-special incorrectly counted');
 t.setupLedge();f.snapLedge(m,1,edge);step({},1);assert.equal(t.success,0,'ordinary grab incorrectly counted');assert.match(t.feedback,/normal ledge grab/i);
 // An interrupted tether cannot later count as success.
 t.setupLedge();f.x=edge+150;f.y=125;f.onGround=false;f.state='fall';step({up:true,special:true});step({},6);
 assert(f.action?.vinePull);f.action=null;f.state='hitstun';f.hitstun=8;step({},1);assert.equal(t.success,0);assert.match(t.feedback,/interrupted/i);
 // Demo is the dummy's actual move, does not advance the player and clears the ledge.
 t.setupLedge();assert(t.startDemo());let sawPull=false,sawHang=false;
 for(let i=0;i<90;i++){step();if(d.action?.vinePull)sawPull=true;if(d.state==='ledge')sawHang=true;}
 assert(sawPull&&sawHang,`${key} dummy must really tether and hang`);assert.notEqual(d.state,'ledge','demo must clear the ledge');assert.equal(d.x,0,'dummy returns to center, clear of the jump path');assert.equal(f.x,edge-130,'demo must not push the learner away from the marker');assert.equal(t.success,0,'dummy demo cannot complete the player lesson');
 // Run and hold a full jump from the actual start marker, then use each supported input.
 for(const useJump of [false,true]){
  t.setupLedge();step({right:true},16);step({right:true,jump:true});
  for(let n=0;n<40 && f.x<edge+80;n++)step({right:true,jump:true});
  assert(f.x>edge && !f.onGround && f.state!=='ledge',`${key} could not jump from marker`);
  step(useJump?{jump:true,special:true}:{up:true,special:true});
  let rope=false;for(let n=0;n<35 && !t.success;n++){step();if(f.action?.vinePull){rope=true;assert.equal(t.success,0,'must wait for ledge hang');}}
  assert(rope && f.state==='ledge' && t.success>0,`${key} ${useJump?'jump':'up'} special did not complete: ${t.feedback}`);
  assert.match(t.feedback,/tethered and hanging/i);
 }
 // Shortcut returns to the previous lesson instead of falsely claiming all are done.
 step({},56);assert.equal(t.index,0);assert(!t.completed);assert.match(t.feedback,/continue your lesson/i);
 assert(t.openLedge());assert(t.backToLessons());assert.equal(t.index,0);
 // Natural progression into the lesson sets up the marked starting position.
 t.index=Tutorial.lessons.length-1;t.success=1;step();assert.equal(t.lessons[t.index].id,'tether');assert.equal(f.x,edge-130);assert.equal(t.returnTo,null);
 step({right:true},16);step({right:true,jump:true});for(let n=0;n<40 && f.x<edge+80;n++)step({right:true,jump:true});step({up:true,special:true});for(let n=0;n<35 && !t.success;n++)step();assert(t.success>0);step({},56);assert(t.completed,'natural lesson progression should finish after the tether');
}
// Every roster pick gets a usable tether character, and the original returns.
for(const key of Object.keys(h.g.FIGHTERS)) {
 const {m,t,step}=tutorial(key), f=m.fighters[0], d=m.fighters[1];
 const originalPal=f.palIdx, dummyPal=d.palIdx, chosen=(key==='nomad'?'nomad':'briar');
 assert.equal(t.lessons.length,Tutorial.lessons.length+1);assert(t.openLedge());
 assert.equal(f.key,chosen);assert.equal(d.key,chosen);assert.equal(f.def,h.g.FIGHTERS[chosen]);assert.equal(f.playerIndex,0);assert(!f.isCPU && d.isCPU);
 assert(t.backToLessons());assert.equal(f.key,key);assert.equal(f.palIdx,originalPal);assert.equal(d.key,key);assert.equal(d.palIdx,dummyPal);
 assert(t.openLedge());assert.equal(f.key,chosen);
 const edge=m.stage.ground.x+m.stage.ground.w;
 step({right:true},16);step({right:true,jump:true});for(let n=0;n<40 && f.x<edge+80;n++)step({right:true,jump:true});step({up:true,special:true});for(let n=0;n<35 && !t.success;n++)step();
 assert(t.success>0,`${key} switching into ${chosen} could not complete tether`);step({},56);
 assert.equal(f.key,key,`${key} not restored on completion`);assert.equal(f.palIdx,originalPal);assert.equal(d.key,key);assert.equal(t.index,0);assert(!t.completed);
 // Restarting during the lesson can restore the same selection and palette.
 t.openLedge();t.restoreFighters();const next=Tutorial.create(m);assert.equal(next.originals[0].key,key);assert.equal(next.originals[0].palIdx,originalPal);
 // Ordinary progression also switches automatically and restores on full completion.
 m.tutorial=next;next.index=Tutorial.lessons.length-1;next.success=1;step();assert.equal(f.key,chosen);assert.equal(next.lessons[next.index].id,'tether');
 step({right:true},16);step({right:true,jump:true});for(let n=0;n<40 && f.x<edge+80;n++)step({right:true,jump:true});step({up:true,special:true});for(let n=0;n<35 && !next.success;n++)step();assert(next.success>0,`${key} natural progression could not tether`);step({},56);assert(next.completed);assert.equal(f.key,key,`${key} not restored after full course`);
}
// On-screen labels describe every lesson, including the actual A/B and direction buttons.
for(const lesson of [...Tutorial.lessons,{id:'tether'}]) assert(Tutorial.touchHints[lesson.id],`missing touch instructions for ${lesson.id}`);
assert.match(Tutorial.touchHints.dash,/A/);assert.match(Tutorial.touchHints.side,/B/);assert.match(Tutorial.touchHints.tether,/▲ \+ B/);
// Drive the same lesson with the real P1 touch input reader rather than keyboard input.
{
 const {m,t}=tutorial('valor');t.openLedge();const f=m.fighters[0], edge=m.stage.ground.x+m.stage.ground.w;
 m.readPlayerInput=h.g.Match.prototype.readPlayerInput;
 const touch=(buttons,n=1)=>{INPUT.touch=buttons;for(let i=0;i<n;i++){m.update();INPUT.endFrame();}};
 touch({right:true},16);touch({right:true,jump:true});
 for(let i=0;i<40 && f.x<edge+80;i++)touch({right:true,jump:true});
 touch({up:true,special:true});for(let i=0;i<35&&!t.success;i++)touch({});
 assert(t.success>0,'touch controls must complete a real tether');INPUT.clear();
}
console.log('Briar and Nomad: ledge practice, real tether feedback, retry, demo and progression passed');
