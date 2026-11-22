'use strict';
const { boot, cast, control, newMatch, makeRunner, globals } = require('./harness');
const T=makeRunner(),{test,assert}=T;
const moving=['smashville','townandcity','fountain','hollowbastion','northerncave'];
function match(stage,extra={}){const h=boot();return newMatch(h.ctx,cast(1,['valor']),stage,{rules:{hazards:true,items:'none',...extra}});}
for(const key of moving){
  test(`${key}: stage and moving platforms stay finite`,()=>{
    const m=match(key), drive=control(m);let moved=false;
    const p=m.stage.platforms[0],x=p.x,y=p.y;
    for(let i=0;i<3600;i++){drive.tick();for(const q of m.stage.platforms)assert([q.x,q.y,q.dx,q.dy].every(Number.isFinite),'non-finite geometry');if(Math.abs(p.x-x)>5||Math.abs(p.y-y)>5)moved=true;}
    assert(moved,'platform never moved');
  });
  test(`${key}: fighter rides an active platform`,()=>{
    const m=match(key),p=m.stage.platforms[0],f=m.fighters[0];control(m).tick(1);
    f.x=p.x+p.w/2;f.y=p.y;f.vx=f.vy=0;f.state='idle';f.onGround=true;f.onPlatform=p;
    const x=f.x,y=f.y,px=p.x,py=p.y;control(m).tick(60);
    assert(f.onPlatform===p,'rider lost platform');
    assert(Math.abs((f.x-x)-(p.x-px))<2 && Math.abs((f.y-y)-(p.y-py))<2,'rider does not follow platform');
  });
}
test('fountain: submerged platform is intangible and hazards off freezes it',()=>{
 const m=match('fountain');let p=m.stage.platforms[0];let found=false;
 for(let i=0;i<2000;i++){m.update();if(p.active===false){found=true;break;}}
 assert(found,'side platform never submerged');
 const f=m.fighters[0];f.x=p.x+p.w/2;f.y=p.y-5;f.vy=10;f.onGround=false;f.onPlatform=null;f.state='fall';f.applyPhysics(m);
 assert(f.onPlatform!==p,'fighter landed on submerged platform');
 const off=match('fountain',{hazards:false}),q=off.stage.platforms[0],y=q.y;control(off).tick(500);assert(q.y===y && q.active,'hazards off did not freeze fountain');
});
test('town and city: platform formations exit and return without teleporting riders',()=>{
 const m=match('townandcity');const states=new Set();let max=0;
 for(let i=0;i<3600;i++){m.update();states.add(m.stage.platforms.filter(p=>p.active).length);for(const p of m.stage.platforms)max=Math.max(max,Math.abs(p.dx));}
 assert(states.has(3)&&states.has(2),'both layouts must appear');assert(max<5,'platform carried rider by teleport');
});
test('invisible platforms do not support riders or projectiles',()=>{
 const h=boot(),m=newMatch(h.ctx,cast(1,['valor']),'fountain',{rules:{hazards:true,items:'none'}});
 const p=m.stage.platforms[0];p.active=false;p.y=p.cy=-100;p.dx=100;
 const f=m.fighters[0];f.x=p.x+p.w/2;f.y=p.y;f.onGround=true;f.onPlatform=p;f.state='idle';f.vx=f.vy=0;
 f.applyPhysics(m);assert(f.onPlatform!==p,'rider stayed on invisible platform');
 f.eliminated=true;
 const Projectile=globals(h.ctx,['Projectile']).Projectile;
 const bullet=new Projectile({kind:'bomb',x:p.x+p.w/2,y:-110,vy:5,vx:0,size:4});
 bullet.update(m);assert(!bullet.dead,'projectile collided with invisible platform');
});
test('active moving platforms still allow falling through from below',()=>{
 const m=match('smashville'),p=m.stage.platforms[0],f=m.fighters[0];
 f.x=p.x+p.w/2;f.y=p.y+15;f.vy=-12;f.onGround=false;f.state='jump';f.applyPhysics(m);
 assert(!f.onPlatform && f.y<p.y+15,'soft platform blocked ascent');
});
test('dream land: wind pushes and hazards off disables the gust',()=>{
 const m=match('dreamland');m.frame=120;const f=m.fighters[0];f.vx=0;m.updateHazards();assert(f.vx>0,'wind did not push');
 const full=match('dreamland'),g=full.fighters[0];g.x=0;g.y=0;g.onGround=true;g.state='idle';control(full).tick(180);assert(g.x>30,'grounded fighter did not drift during gust');
 const off=match('dreamland',{hazards:false});off.frame=120;off.fighters[0].vx=0;off.updateHazards();assert(off.fighters[0].vx===0,'wind active with hazards off');
});
test('brinstar: acid rises, hits once per cooldown, and hazards off is safe',()=>{
 const m=match('brinstar');m.frame=450;const f=m.fighters[0];f.y=0;f.spawnProtect=0;f.invincT=0;f.respawnT=0;f.ledgeInvuln=0;m.updateHazards();assert(m.stage.hazard.y<0,'acid failed to rise');assert(f.damage>0,'acid did not hit');const damage=f.damage;m.updateHazards();assert(f.damage===damage,'acid rehit during cooldown');
 const off=match('brinstar',{hazards:false});off.frame=450;off.fighters[0].y=0;off.updateHazards();assert(off.fighters[0].damage===0,'acid hit with hazards off');
});
const references=['tortimerisland','pictochat2','newdonkcityhall','minecraftworld','mishimadojo','wreckingcrew','flatzonex','kingoffighters','greatcave','midgar'];
for (const key of references) test(`${key}: selectable stage geometry and deck collision`,()=>{
 const m=match(key),f=m.fighters[0],gd=m.stage.ground;
 assert(m.stage.key===key,'stage not registered');
 f.x=m.stage.groundGaps ? -250 : 0;f.y=gd.y-10;f.vy=12;f.onGround=false;f.onPlatform=null;f.state='fall';f.applyPhysics(m);
 assert(f.onGround && Math.abs(f.y-gd.y)<1,'fighter did not land on deck');
 control(m).tick(10);
 assert(m.stage.platforms.every(p=>[p.x,p.y,p.dx,p.dy].every(Number.isFinite)),'invalid platform geometry');
});
for (const key of ['pictochat2','flatzonex']) test(`${key}: sketch platforms alternate and hazards off freezes`,()=>{
 const m=match(key);m.update();assert(m.stage.platforms.filter(p=>p.active).every(p=>p.motion.group===0),'wrong initial layout');
 m.frame=899;m.update();assert(m.stage.platforms.filter(p=>p.active).every(p=>p.motion.group===1),'layout did not alternate');
 const p=m.stage.platforms.find(p=>p.motion.group===0),f=m.fighters[0];
 f.x=p.x+p.w/2;f.y=p.y-5;f.vy=10;f.state='fall';f.onGround=false;f.onPlatform=null;f.applyPhysics(m);assert(f.onPlatform!==p,'inactive sketch supports fighters');
 const off=match(key,{hazards:false});off.frame=899;off.update();assert(off.stage.platforms.every(q=>q.active===(q.motion.group===0)),'hazards off should freeze initial layout');
});
test('reference artwork: nine original JPEG assets exist',()=>{
 const fs=require('fs'),path=require('path');
 for(const name of ['island','picto','cityhall','blockworld','dojo','wrecking','flatzone','kof','midgar']) {
  const b=fs.readFileSync(path.join(__dirname,'../game/assets/stages',name+'.jpg'));
  assert(b[0]===0xff && b[1]===0xd8 && b.length>1000,'invalid artwork '+name);
 }
});
test('illustrated backdrops cover the viewport and surface rendering succeeds',()=>{
 const {makeCtx}=require('./harness');const h=boot({render:true});
 h.sandbox.Image=class {constructor(){this.complete=true;this.naturalWidth=1600;this.naturalHeight=700;} set src(s){this.url=s;}};
 for(const key of references){
   const m=newMatch(h.ctx,cast(1,['valor']),key,{rules:{hazards:true}}),rec={ops:[]},ctx=makeCtx(rec);
   h.g.Backdrop.draw(ctx,m.stage,{W:960,H:540,x:0,y:0},0);
   h.g.Backdrop.drawStageBody(ctx,m.stage,0);h.g.Backdrop.drawPlatforms(ctx,m.stage,0);
   if(m.stage.backdrop){const op=rec.ops.find(o=>o.op==='drawImage');assert(op && op.finite && op.dw>=960 && op.dh>=540,'backdrop does not cover viewport');}
 }
});
for (const key of ['pokemonstadium','pokemonstadium2','castlesiege','arenaferox']) test(`${key}: each transformation and hazards-off layout`,()=>{
 const m=match(key),forms=m.stage.stageForms;
 m.update();assert(m.stage.form==='normal','wrong initial form');
 assert(m.stage.platforms.every(p=>p.active===p.motion.forms.includes('normal')),'initial layout mismatch');
 for(let i=0;i<forms.length;i++){
   m.frame=(2*i+1)*1800-1;m.update();assert(m.stage.form===forms[i],'missing transformation '+forms[i]);
   assert(m.stage.platforms.some(p=>p.active),'transformation has no platforms');
   assert(m.stage.platforms.every(p=>p.active===p.motion.forms.includes(forms[i])),'wrong platform group');
 }
 const off=match(key,{hazards:false});off.frame=1799;off.update();assert(off.stage.form==='normal','hazards-off transformed');
 assert(off.stage.platforms.every(p=>p.active===p.motion.forms.includes('normal')),'hazards-off layout incorrect');
});
test('stadium 2: conveyors, updraft and ice affect fighters',()=>{
 const m=match('pokemonstadium2'),f=m.fighters[0];m.stage.form='electric';f.x=300;f.onGround=true;f.onPlatform=null;const x=f.x;m.updateHazards();assert(f.x>x,'belt did not move fighter');
 m.stage.form='flying';f.x=0;f.y=-200;f.onGround=false;f.vy=2;m.updateHazards();assert(f.vy<2,'updraft did not slow fall');
 f.vy=-20;m.updateHazards();assert(f.vy===-20,'updraft incorrectly slowed a strong ascent');
 f.onGround=true;f.state='idle';f.vx=5;f.readInput({});m.stage.form='normal';f.handleMovement(m);const normal=f.vx;
 f.vx=5;f.state='idle';m.stage.form='ice';f.handleMovement(m);assert(f.vx>normal,'ice did not reduce friction');
 const off=match('pokemonstadium2',{hazards:false});off.stage.form='electric';const g=off.fighters[0];g.x=300;g.onGround=true;off.updateHazards();assert(g.x===300,'belt active with hazards off');
});
test('king of fighters: walls contain weak movement but strong launch breaks out with hazards off too',()=>{
 for (const hazards of [true,false]) for (const side of [-1,1]) {
  const m=match('kingoffighters',{hazards}),f=m.fighters[0],wall=side*(m.stage.ground.w/2-16),stocks=f.stocks;
  f.x=wall+side*3;f.y=-100;f.vx=side*5;f.hitstun=8;assert(!m.resolveRingWall(f),'weak launch KO');assert(f.x===wall && f.vx*side<=0 && f.stocks===stocks,'weak launch not contained');
  f.x=wall-side*5;f.y=-100;f.vx=side*35;f.vy=0;f.hitstun=30;f.state='launch';f.onGround=false;f.applyPhysics(m);
  assert(f.stocks===stocks-1 && f.state==='respawn','strong launch did not KO');
 }
});
test('minecraft: melee damages blocks once per action, destruction persists and hazards off removes them',()=>{
 const m=match('minecraftworld'),f=m.fighters[0],p=m.stage.platforms.find(q=>q.breakHP),box={x:p.x,y:p.y,w:p.w,h:p.h};
 f.action={};m.itemsHitByAttack(f,box,9);m.itemsHitByAttack(f,box,9);assert(p.breakHP===9 && p.active,'same action hit block twice');
 f.action={};m.itemsHitByAttack(f,box,9);assert(p.broken && !p.active,'block did not break at zero hp');m.update();assert(!p.active,'broken block regenerated');
 const off=match('minecraftworld',{hazards:false});assert(off.stage.platforms.filter(q=>q.breakHP).every(q=>!q.active),'hazards-off blocks should be removed at start');
});
test('spring stadium: held jumps boost on active pads, taps and hazards off do not',()=>{
 function jump(hazards,frame,hold){
  const m=match('springstadium',{hazards}),f=m.fighters[0];m.frame=frame;f.x=m.stage.ground.x+40;f.y=0;f.onGround=true;f.state='idle';f.readInput({jump:true});f.tryJump(m);
  for(let i=0;i<4;i++){f.readInput({jump:hold});f.applyPhysics(m);}return f.vy;
 }
 const held=jump(true,100,true),tap=jump(true,100,false),off=jump(false,100,true),inactive=jump(true,400,true);
 assert(held<off-4 && held<tap-4 && held<inactive-4,'spring boost not gated by hold and hazards');
});
test('yoshi cloud moves and disappears with hazards off',()=>{
 const m=match('yoshistory'),p=m.stage.platforms[3],x=p.x;control(m).tick(200);assert(p.active && Math.abs(p.x-x)>100,'cloud did not move');
 const off=match('yoshistory',{hazards:false});assert(!off.stage.platforms[3].active,'cloud present with hazards off');
});
test('smashville platform freezes centrally with hazards off',()=>{
 const m=match('smashville',{hazards:false}),p=m.stage.platforms[0],x=p.x;control(m).tick(400);assert(p.x===x && p.active,'hazards-off platform moved');
});
test('versus selectors retire legacy maps but registered mode IDs remain usable',()=>{
 const h=boot(),g=globals(h.ctx,['STAGE_KEYS','STAGES','DEFAULT_RULES']);
 assert(g.STAGES.skyshrine && !g.STAGE_KEYS.includes('skyshrine'),'legacy map not retired from selectors');
 for(const k of ['battlefield','smallbattlefield','bigbattlefield','finaldestination','pokemonstadium','pokemonstadium2','castlesiege','arenaferox','springstadium','yoshistory']) assert(g.STAGE_KEYS.includes(k),'new stage missing '+k);
 assert(g.STAGE_KEYS.includes(g.DEFAULT_RULES.stage),'default not selectable');
});
test('brinstar meteor warns, strikes once, and is disabled with hazards off',()=>{
 const m=match('brinstar'),f=m.fighters[0];f.x=-350;f.y=-100;f.spawnProtect=0;f.invincT=0;
 m.frame=559;m.update();assert(m.stage.mechanic.strike && f.damage===0,'missing advance warning');
 m.frame=649;m.update();assert(f.damage>0,'meteor failed to damage fighter');const damage=f.damage;
 m.update();assert(f.damage===damage,'meteor hit more than once');
 const off=match('brinstar',{hazards:false});off.frame=649;off.update();assert(!off.stage.mechanic.strike && off.fighters[0].damage===0,'meteor active with hazards off');
});
test('legacy lava foundry also has the meteor strike',()=>{
 const m=match('foundry'),f=m.fighters[0];f.x=-350;f.y=0;f.spawnProtect=0;f.invincT=0;
 m.frame=559;m.update();assert(m.stage.mechanic.strike,'lava stage warning missing');m.frame=649;m.update();assert(f.damage>0,'lava stage meteor failed to damage');
});
test('final destination warns then strikes in the marked zone',()=>{
 const m=match('finaldestination'),f=m.fighters[0];f.x=-280;f.y=0;f.spawnProtect=0;f.invincT=0;
 m.frame=699;m.update();assert(m.stage.mechanic.strike && f.damage===0,'beam warning missing');
 m.frame=789;m.update();assert(f.damage>0,'beam failed to hit');
});
test('battlefield tiers move, small battlefield blinks, big battlefield shifts with hazards on only',()=>{
 for(const key of ['battlefield','bigbattlefield']){
  const m=match(key),p=m.stage.platforms[0],x=p.x,y=p.y;control(m).tick(150);assert(Math.abs(p.x-x)+Math.abs(p.y-y)>10,'no motion on '+key);
  const off=match(key,{hazards:false}),q=off.stage.platforms[0],qx=q.x,qy=q.y;control(off).tick(150);assert(q.x===qx && q.y===qy,'motion with hazards off on '+key);
 }
 const m=match('smallbattlefield');m.frame=539;m.update();assert(m.stage.platforms[0].warning,'blink warning missing');m.frame=599;m.update();assert(!m.stage.platforms[0].active && m.stage.platforms[1].active,'incorrect blink');
 const off=match('smallbattlefield',{hazards:false});off.frame=599;off.update();assert(off.stage.platforms.every(p=>p.active),'blink with hazards off');
});
test('tortimer fruit drops with hazards on even if item spawns are disabled, and heals',()=>{
 const m=match('tortimerisland'),f=m.fighters[0];m.frame=360;m.updateStageMechanics();const food=m.items.find(i=>i.stageFruit);assert(food && food.type==='food','fruit missing');
 food.spawnT=0;food.x=f.x;food.y=f.y-40;f.damage=30;assert(m.tryPickup(f) && f.damage<30,'fruit did not heal');
 const off=match('tortimerisland',{hazards:false});off.frame=359;off.update();assert(!off.items.some(i=>i.stageFruit),'fruit appeared with hazards off');
});
test('mishima walls resist weak launches, break by strong launches or attacks, and repair safely',()=>{
 const m=match('mishimadojo'),f=m.fighters[0],w=m.stage.mechanic.walls,edge=m.stage.ground.x+18;
 f.x=edge-10;f.y=-100;f.vx=-5;f.hitstun=5;m.resolveDojoWalls(f);assert(f.x===edge && !w.left.broken,'weak launch broke wall');
 f.x=edge-10;f.vx=-25;f.hitstun=20;m.resolveDojoWalls(f);assert(w.left.broken && f.x<edge,'strong launch did not break wall');
 w.left.broken=1;m.updateStageMechanics();assert(w.left.broken===1,'wall trapped an outside fighter on repair');
 f.x=0;f.y=0;m.updateStageMechanics();assert(!w.left.broken,'wall failed to repair');
 f.action={};const box={x:m.stage.ground.x-10,y:-150,w:50,h:100};m.itemsHitByAttack(f,box,20);m.itemsHitByAttack(f,box,20);assert(w.left.hp===15,'same action damaged wall twice');
 f.action={};m.itemsHitByAttack(f,box,20);assert(w.left.broken>0,'attacks failed to break wall');
 const off=match('mishimadojo',{hazards:false}),g=off.fighters[0];g.x=off.stage.ground.x-20;g.vx=-4;off.resolveDojoWalls(g);assert(g.x<off.stage.ground.x,'hazards-off wall caught fighter');
});
test('great cave danger zones hit below 100 percent and KO at 100 percent',()=>{
 const m=match('greatcave'),f=m.fighters[0];f.x=-620;f.y=0;f.damage=40;f.spawnProtect=0;f.invincT=0;m.updateStageMechanics();assert(f.damage>40 && f.stocks===3,'danger zone failed to hit');
 f.damage=100;f.hazardCD=0;f.invincT=0;f.hitlag=0;f.y=0;const stocks=f.stocks;m.updateStageMechanics();assert(f.stocks===stocks-1,'danger zone did not KO');
 const off=match('greatcave',{hazards:false});off.frame=1;off.fighters[0].x=-620;off.fighters[0].y=0;off.fighters[0].damage=100;off.updateHazards();assert(off.fighters[0].stocks===3,'danger zone active with hazards off');
});
test('wrecking crew bomb is armed by attacks, explodes once and collapses a scaffold',()=>{
 const m=match('wreckingcrew'),f=m.fighters[0];f.x=0;f.y=0;f.spawnProtect=0;f.invincT=0;m.updateStageMechanics();const b=m.stage.mechanic.bomb;
 f.action={};m.itemsHitByAttack(f,{x:-30,y:-60,w:60,h:60},10);assert(b.fuse===60,'bomb was not armed');
 for(let i=0;i<60;i++)m.updateStageMechanics();assert(f.damage>0 && b.respawn>0 && !m.stage.platforms[2].active,'bomb or collapsing platform failed');
 const damage=f.damage;m.updateStageMechanics();m.update();assert(!m.stage.platforms[2].active,'collapsed scaffold returned');assert(f.damage===damage,'bomb exploded twice');
});
test('midgar materia chooses an owner and damages opponents after a visible warning',()=>{
 const h=boot(),m=newMatch(h.ctx,cast(2,['valor','grim']),'midgar',{rules:{hazards:true,items:'none'}}),[owner,target]=m.fighters;
 owner.x=0;owner.y=-80;target.x=200;target.y=0;owner.spawnProtect=target.spawnProtect=0;owner.invincT=target.invincT=0;
 m.frame=450;m.updateStageMechanics();assert(m.stage.mechanic.summon && m.stage.mechanic.summon.owner===owner.id,'materia not collected');
 for(let i=0;i<88;i++)m.updateStageMechanics();assert(target.damage===0,'summon hit before warning');m.updateStageMechanics();
 assert(target.damage>0 && owner.damage===0,'summon target or immunity incorrect');
 const off=match('midgar',{hazards:false});off.frame=449;off.update();assert(!off.stage.mechanic.materia,'materia appeared with hazards off');
});
test('flat zone oil reduces traction only within the spill',()=>{
 const m=match('flatzonex'),f=m.fighters[0];m.frame=600;m.updateStageMechanics();const oil=m.stage.mechanic.oil;assert(oil,'oil missing');
 f.onGround=true;f.onPlatform=null;f.state='idle';f.x=oil.x;f.vx=5;f.readInput({});f.handleMovement(m);const slip=f.vx;
 f.x=0;f.vx=5;f.state='idle';f.handleMovement(m);assert(slip>f.vx,'oil did not reduce traction');
});
test('new stage mechanic overlays render without errors',()=>{
 const {makeCtx}=require('./harness');const h=boot({render:true});
 for(const key of ['brinstar','finaldestination','mishimadojo','greatcave','wreckingcrew','midgar','flatzonex']){
  const m=newMatch(h.ctx,cast(2,['valor','grim']),key,{rules:{hazards:true,items:'none'}});m.frame=key==='midgar'?450:key==='flatzonex'?600:key==='brinstar'?560:key==='finaldestination'?700:1;
  m.updateStageMechanics();const ctx=makeCtx({ops:[]});h.g.Backdrop.drawStageMechanics(ctx,m.stage,m.frame,true);
 }
});
test('every selectable stage remains finite over 3,000 hazard-on frames',()=>{
 const h=boot(),keys=globals(h.ctx,['STAGE_KEYS']).STAGE_KEYS;
 for(const key of keys){
  const m=newMatch(h.ctx,cast(1,['valor']),key,{rules:{hazards:true,items:'none'}}),drive=control(m);
  for(let t=0;t<3000;t++){
   drive.tick();
   assert(m.stage.platforms.every(p=>[p.x,p.y,p.dx,p.dy].every(Number.isFinite)),key+' invalid platform');
   assert(m.fighters.every(f=>[f.x,f.y,f.vx,f.vy,f.damage].every(Number.isFinite)),key+' invalid fighter state');
  }
 }
});
test('every selectable arena has stage-specific info and hazard guidance',()=>{
 const h=boot(),{STAGE_KEYS,STAGES,STAGE_INFO}=globals(h.ctx,['STAGE_KEYS','STAGES','STAGE_INFO']);
 assert(STAGE_KEYS.length===Object.keys(STAGE_INFO).length,'info coverage differs from selector');
 for(const key of STAGE_KEYS){const i=STAGE_INFO[key];assert(i && i.about && i.perk && i.hazards,`${key}: missing information`);assert(STAGES[key].name,'missing name');}
});
for(const [key,oldWidth,oldPlatforms] of [['tortimerisland',1180,2],['newdonkcityhall',1220,2],['minecraftworld',1200,5],['wreckingcrew',1220,4]]) test(`${key}: XL deck, added usable platforms, and safe outer landings`,()=>{
 const m=match(key),s=m.stage,f=m.fighters[0];
 assert(s.size==='XL' && s.ground.w>oldWidth && s.platforms.length>oldPlatforms,'not enlarged');
 assert(s.platforms.every(p=>p.x>=s.ground.x && p.x+p.w<=s.ground.x+s.ground.w),'platform out of bounds');
 for(const x of [s.ground.x+100,s.ground.x+s.ground.w-100]){f.x=x;f.y=-10;f.vy=12;f.onGround=false;f.onPlatform=null;f.state='fall';f.applyPhysics(m);assert(f.onGround && f.y===s.ground.y,'outer deck does not support fighters');}
 assert(m.blast.left<s.ground.x && m.blast.right>s.ground.x+s.ground.w,'blast zones too narrow');
});
test('XL New Donk lifts still carry riders with hazards off',()=>{
 const m=match('newdonkcityhall',{hazards:false}),p=m.stage.platforms[0],f=m.fighters[0];control(m).tick(1);
 f.x=p.x+p.w/2;f.y=p.y;f.vx=f.vy=0;f.state='idle';f.onGround=true;f.onPlatform=p;
 const y=f.y,py=p.y;control(m).tick(60);
 assert(f.onPlatform===p && Math.abs((f.y-y)-(p.y-py))<2,'XL lift did not carry its rider');
});
test('XL Tortimer fruit spawns over the expanded outer platforms',()=>{
 const m=match('tortimerisland');m.frame=360;m.updateStageMechanics();const item=m.items.find(i=>i.stageFruit);
 assert(item && m.stage.platforms.some(p=>item.x>=p.x && item.x<=p.x+p.w && p.y>item.y),'fruit did not spawn over a platform');
});
for (const key of ['minecraftworld','greatcave']) for (const hazards of [false,true]) test(`${key}: real floor opening with hazards ${hazards?'on':'off'}`,()=>{
 const h=boot(),m=newMatch(h.ctx,cast(8,['valor'] ),key,{rules:{hazards,items:'none'}}),f=m.fighters[0],gd=m.stage.ground;
 assert(m.stage.deckSegments.length===2 && m.stage.groundGaps.length===1,'split floor missing');
 assert(m.fighters.every(q=>Math.abs(q.spawnX)>90),'spawn over the gap');
 f.x=0;f.y=-5;f.vy=12;f.onGround=false;f.onPlatform=null;f.state='fall';f.applyPhysics(m);
 assert(!f.onGround && f.y>gd.y,'fighter landed on invisible floor');
 f.x=0;f.y=gd.y+gd.h+18;f.vy=-14;f.onGround=false;f.state='jump';f.applyPhysics(m);
 assert(f.vy<0 && f.y<gd.y+gd.h+14,'gap underside blocked recovery');
 f.x=-220;f.y=gd.y+gd.h+18;f.vy=-14;f.onGround=false;f.state='jump';f.applyPhysics(m);
 assert(f.vy===0 && f.y===gd.y+gd.h+14,'solid underside is missing');
 f.x=220;f.y=-10;f.vy=12;f.onGround=false;f.state='fall';f.applyPhysics(m);assert(f.onGround && f.y===gd.y,'solid deck missing');
 f.x=0;f.y=-1;assert(!f.hasSurfaceBelow({...m.stage,platforms:[]}),'gap reported as surface');
});
test('gap: items, mines, bombs, rockets and waves do not hover or collide with missing floor',()=>{
 const h=boot(),m=newMatch(h.ctx,cast(1,['valor']),'minecraftworld',{rules:{hazards:false,items:'none'}}),{Item,Projectile,Mine}=globals(h.ctx,['Item','Projectile','Mine']);
 for(const x of [0,200]){
  const it=new Item('food',x,-12,m);it.vy=6;it.update(m);assert(it.onGround===(x!==0),'item floor mismatch');
  const bomb=new Projectile({kind:'bomb',x,y:-15,vy:12,vx:0,size:4,life:100});bomb.update(m);assert(!!bomb.dead===(x!==0),'bomb floor mismatch');
  const rocket=new Projectile({kind:'boostRocket',x,y:-15,vy:12,vx:0,size:4,life:100});rocket.update(m);assert(!!rocket.dead===(x!==0),'rocket floor mismatch');
 }
 const mine=new Mine({x:0,y:-6});mine.update(m);assert(mine.y>-6,'mine hovered over gap');
 const wave=new Projectile({kind:'tidewave',x:-95,y:0,vx:10,vy:0,surface:m.stage.deckSegments[0],life:100,fadeFrames:18,rehit:12});wave.update(m);assert(!wave.surface && wave.y>0,'wave crossed the gap on invisible floor');
 const item=new Item('food',0,-8,m);item.onGround=true;item.update(m);assert(!item.onGround,'resting item floated over gap');
});
for (const key of ['brinstar','wreckingcrew']) test(`${key}: spikes damage on contact only with hazards on`,()=>{
 const m=match(key),f=m.fighters[0],sp=m.stage.floorSpikes[0];f.x=sp.x+sp.w/2;f.y=0;f.state='idle';f.spawnProtect=f.invincT=f.respawnT=0;
 m.updateHazards();const damage=f.damage;assert(damage>0 && f.hazardCD>0,'spike did not hurt');m.updateHazards();assert(f.damage===damage,'spike ignored cooldown');
 const off=match(key,{hazards:false}),g=off.fighters[0];g.x=sp.x+sp.w/2;g.y=0;off.updateHazards();assert(g.damage===0,'spike active with hazards off');
 const safe=match(key),q=safe.fighters[0];q.x=sp.x+sp.w/2;q.y=-200;safe.updateHazards();assert(q.damage===0,'spike hit a fighter above it');
 const protectedMatch=match(key),r=protectedMatch.fighters[0];r.x=sp.x+sp.w/2;r.y=0;r.spawnProtect=20;protectedMatch.updateHazards();assert(r.damage===0 && r.hazardCD===0,'spike hit invulnerable fighter');
});
test('CPU jumps near openings and tries to recover through them',()=>{
 const h=boot(),m=newMatch(h.ctx,cast(1,['valor']),'greatcave',{rules:{hazards:false,items:'none'}}),{CPU}=globals(h.ctx,['CPU']);
 const f=m.fighters[0],cpu=new CPU(f,m);cpu.timer=100;cpu.plan='approach';cpu.target={x:500,y:0};f.x=-140;f.y=0;f.onGround=true;f.onPlatform=null;f.state='idle';
 const approach=cpu.think(m);assert(approach.jump && approach.right,'CPU did not jump approaching gap');
 f.x=0;f.y=20;f.vy=4;f.onGround=false;f.airJumpsLeft=1;f.state='fall';const recovery=cpu.think(m);assert(recovery.jump,'CPU did not jump to recover from gap');
});
test('split-floor renderer draws separate pieces and visible spikes only with hazards on',()=>{
 const {makeCtx}=require('./harness'),h=boot({render:true}),m=newMatch(h.ctx,cast(1,['valor']),'minecraftworld',{rules:{hazards:false}}),ops=[];
 const ctx=makeCtx({ops:[]});ctx.fillRect=(x,y,w,height)=>ops.push({x,y,w,height});
 h.g.Backdrop.drawStageBody(ctx,m.stage,0);
 assert(ops.some(o=>o.y===0 && o.x<0 && o.x+o.w===-90) && ops.some(o=>o.y===0 && o.x===90),'floor segments not drawn');
 assert(!ops.some(o=>o.y===0 && o.x<0 && o.x+o.w>0),'rendered floor covers gap');
 const spikes=newMatch(h.ctx,cast(1,['valor']),'brinstar',{rules:{hazards:true}}),ops2=[];ctx.fillRect=(x,y,w,height)=>ops2.push({x,y,w,height});
 h.g.Backdrop.drawStageMechanics(ctx,spikes.stage,1,false);assert(!ops2.length,'disabled spikes rendered');
 h.g.Backdrop.drawStageMechanics(ctx,spikes.stage,1,true);assert(ops2.length>=2,'active spikes missing');
});
test('falling through the central gap causes a normal KO and safe respawn',()=>{
 const h=boot(),m=newMatch(h.ctx,cast(2,['valor','grim']),'greatcave',{rules:{hazards:false,items:'none'}}),f=m.fighters[0];
 f.x=0;f.y=-10;f.vy=12;f.vx=0;f.onGround=false;f.onPlatform=null;f.state='fall';const stocks=f.stocks;
 const run=control(m);for(let i=0;i<180 && f.stocks===stocks;i++)run.tick();
 assert(f.stocks===stocks-1 && f.state==='respawn' && Math.abs(f.x)>90,'gap did not KO or respawn safely');
});
test('final smash cannot hover on an invisible floor in a gap',()=>{
 const m=match('minecraftworld',{hazards:false}),f=m.fighters[0];f.x=0;f.y=0;f.vy=0;f.onGround=true;f.onPlatform=null;f.finalActive=20;f.finalT=0;
 f.updateFinalSmash(m);assert(!f.onGround && f.y>0,'final smash stayed on an imaginary floor');
});
test('spike clusters are clear of all standard spawn slots',()=>{
 const h=boot(),{FIGHTERS}=globals(h.ctx,['FIGHTERS']);
 for(const key of ['brinstar','wreckingcrew']) for(const fighter of Object.keys(FIGHTERS)){
  const m=newMatch(h.ctx,cast(8,[fighter]),key,{rules:{hazards:true,items:'none'}});
  for(const f of m.fighters){f.y=0;f.spawnProtect=f.invincT=f.respawnT=0;}m.updateHazards();
  assert(m.fighters.every(f=>f.damage===0),`${key} ${fighter}: spawn overlaps spikes`);
 }
});
test('all selectable solid decks expose their actual edges, not one-way platforms or seams',()=>{
 const h=boot(),{STAGE_KEYS,STAGES,stageLedges}=globals(h.ctx,['STAGE_KEYS','STAGES','stageLedges']);
 for(const key of STAGE_KEYS){const s=STAGES[key],edges=stageLedges(s),gd=s.ground;
  assert(edges.some(e=>e.x===gd.x && e.side===-1) && edges.some(e=>e.x===gd.x+gd.w && e.side===1),key+' missing outer edges');
  assert(edges.length===(s.groundGaps?4:2),key+' wrong number of solid ledges');
 }
 const seam={ground:{x:-200,y:0,w:400,h:44},deckSegments:[{x:-200,w:200},{x:0,w:200}]};
 assert(stageLedges(seam).length===2,'touching segments produced false ledges');
 seam.deckSegments=[{x:-200,w:400},{x:-100,w:20}];assert(stageLedges(seam).length===2,'overlapping segments produced false ledges');
 seam.ledges=false;assert(stageLedges(seam).length===0,'ledge-disabled stage has ledges');
});
for(const key of ['minecraftworld','greatcave']) for(const hazards of [true,false]) test(`${key}: both gap faces catch fighters and get-ups stay local (hazards ${hazards?'on':'off'})`,()=>{
 for(const face of [{x:-90,side:1},{x:90,side:-1}]) for(const kind of ['climb','roll','attack','jump']) {
  const m=match(key,{hazards}),f=m.fighters[0];f.x=face.x+face.side*25;f.y=20;f.vx=0;f.vy=2;f.state='fall';f.onGround=false;f.input={};f.hitstun=0;f.ledgeCD=0;
  assert(f.tryLedgeGrab(m) && f.ledge.x===face.x && f.ledge.side===face.side,'wrong or missing gap grab');
  assert(f.facing===-face.side && f.x===face.x+face.side*30*f.scale,'wrong hang location');
  f.ledgeGetup(m,kind);
  if(kind==='jump')assert(f.state==='jump' && f.vy<0 && Math.abs(f.x-(face.x+face.side*20))<1,'jump from wrong edge');
  else assert(f.onGround && Math.abs(f.x-face.x)<80 && (f.x-face.x)*face.side<0,'get-up did not land on adjacent segment');
 }
});
test('gap ledges respect solid floors, intentional drop, cooldown, rising and disabled ledges',()=>{
 const m=match('greatcave'),f=m.fighters[0];f.state='fall';f.onGround=false;f.ledgeCD=0;f.input={};f.vy=2;f.y=10;
 f.x=-100;assert(!f.tryLedgeGrab(m),'fighter over solid floor grabbed inside edge');
 f.x=-65;f.input={down:true};assert(!f.tryLedgeGrab(m),'down did not prevent ledge grab');
 f.input={};f.ledgeCD=5;assert(!f.tryLedgeGrab(m),'cooldown ignored');f.ledgeCD=0;
 f.vy=-5;f.state='jump';assert(!f.tryLedgeGrab(m),'normal rising jump snapped to ledge');
 f.vy=2;m.stage.ledges=false;assert(!f.tryLedgeGrab(m),'disabled ledge grabbed');m.stage.ledges=true;
 assert(f.tryLedgeGrab(m),'fixture failed to grab');f.input={downP:true};f.updateLedge(m);
 assert(f.state==='fall' && !f.ledge && f.ledgeCD>0 && !f.tryLedgeGrab(m),'drop immediately regrabbed');
});
test('ledge ownership distinguishes different faces with the same side and permits both gap edges',()=>{
 const h=boot(),m=newMatch(h.ctx,cast(4,['valor','grim','briar','nomad']),'minecraftworld',{rules:{hazards:false,items:'none'}}),[outer,left,right,contender]=m.fighters;
 outer.snapLedge(m,1,m.stage.ground.x+m.stage.ground.w);
 left.x=-65;left.y=15;left.vy=2;left.state='fall';left.onGround=false;left.input={};
 assert(left.tryLedgeGrab(m) && left.ledge.x===-90,'outer ledge incorrectly blocked same-side inner ledge');
 right.x=65;right.y=15;right.vy=2;right.state='fall';right.onGround=false;right.input={};
 assert(right.tryLedgeGrab(m) && right.ledge.x===90,'opposite gap edge incorrectly blocked');
 contender.x=-65;contender.y=15;contender.vy=2;contender.state='fall';contender.onGround=false;contender.input={};
 assert(!contender.tryLedgeGrab(m) && left.state==='ledge','occupied ledge was stolen');
});
for(const key of ['minecraftworld','greatcave']) for(const who of ['briar','nomad']) for(const hazards of [true,false]) test(`${key}: ${who} visibly grapples both gap ledges (hazards ${hazards?'on':'off'})`,()=>{
 for(const side of [-1,1]){
  const h=boot(),m=newMatch(h.ctx,cast(1,[who]),key,{rules:{hazards,items:'none'}}),f=m.fighters[0],c=control(m),edge=side*90;
  f.x=side*35;f.y=145;f.vx=f.vy=0;f.onGround=false;f.state='fall';f.facing=-side;
  f.__raw={up:true,special:true};c.tick(1);f.__raw={};c.tick(4);
  assert(f.action?.vinePull?.edgeX===edge && f.state==='special','grapple did not target nearest gap ledge');
  assert(who!=='nomad' || f.action.hookTether,'missing hook recovery');
  for(let i=0;i<18 && f.state!=='ledge';i++){c.tick(1);assert(f.x>-90 && f.x<90,'tether passed through solid deck');}
  assert(f.state==='ledge' && f.ledge.x===edge && !f.usedUpB && f.airJumpsLeft===f.def.stats.airJumps,'tether failed to hang/reset');
  f.__raw={jump:true};c.tick(1);assert(f.state==='jump' && f.vy<0 && Math.abs(f.x-edge)<30,'ledge jump teleported');
 }
});
test('tethers allow near-top gap recovery, avoid occupied faces, and release if claimed mid-pull',()=>{
 for(const who of ['briar','nomad']){
  const h=boot(),m=newMatch(h.ctx,cast(3,[who,'valor','grim']),'greatcave',{rules:{hazards:false,items:'none'}}),[f,a,b]=m.fighters;
  f.x=-40;f.y=10;f.onGround=false;f.input={};const move={...f.def.specials.up};f.tryVineTether(m,move);
  assert(move.vinePull?.edgeX===-90 && !move.vinePull.underDeck,'near-top gap treated as solid deck');
  a.snapLedge(m,1,-90);const fallback={...f.def.specials.up};f.tryVineTether(m,fallback);
  assert(fallback.vinePull?.edgeX===90,'tether did not use other free gap face');
  b.snapLedge(m,-1,90);const blocked={...f.def.specials.up};f.tryVineTether(m,blocked);assert(!blocked.vinePull,'tether stole occupied face');
  b.ledge=null;b.state='idle';f.action=fallback;f.state='special';f.ledgeCD=0;b.snapLedge(m,-1,90);f.stepVinePull(m);
  assert(!f.action?.vinePull && b.state==='ledge','tether did not release when target claimed');
 }
});
test('gap grapple from below a solid segment goes around its underside',()=>{
 for(const who of ['briar','nomad']) for(const side of [-1,1]){
  const h=boot(),m=newMatch(h.ctx,cast(1,[who]),'greatcave',{rules:{hazards:false,items:'none'}}),f=m.fighters[0],c=control(m);
  f.x=side*180;f.y=150;f.vx=f.vy=0;f.onGround=false;f.state='fall';f.__raw={up:true,special:true};c.tick(1);f.__raw={};c.tick(4);
  assert(f.action?.vinePull?.underDeck && f.action.vinePull.edgeX===side*90,'did not target gap from below segment');
  for(let i=0;i<18 && f.state!=='ledge';i++){
   c.tick(1);assert(!(Math.abs(f.x)>90 && f.y<m.stage.ground.h+14),'grapple passed through underside');
  }
  assert(f.state==='ledge' && f.ledge.x===side*90,'under-deck grapple did not finish');
 }
});
test('tether does not reach through a solid segment to another opening',()=>{
 const h=boot(),m=newMatch(h.ctx,cast(3,['briar','valor','grim']),'greatcave',{rules:{hazards:false,items:'none'}}),[f,a,b]=m.fighters;
 m.stage.deckSegments=[{x:-300,y:0,w:200,h:44},{x:100,y:0,w:100,h:44},{x:400,y:0,w:200,h:44}];
 a.snapLedge(m,1,-100);b.snapLedge(m,-1,100);f.x=0;f.y=10;f.onGround=false;f.input={};
 const action={...f.def.specials.up,tetherRange:1000};f.tryVineTether(m,action);
 assert(!action.vinePull,'grapple crossed a solid deck segment');
});
test('gap grapple cables and hang artwork anchor to each actual lip',async()=>{
 const {makeCtx}=require('./harness'),h=boot({render:true});h.g.Sprites.load();await h.settle(35);const S=h.g.Sprites;
 for(const key of ['minecraftworld','greatcave'])for(const who of ['briar','nomad'])for(const side of [-1,1]){
  const m=newMatch(h.ctx,cast(1,[who]),key,{rules:{hazards:false,items:'none'}}),f=m.fighters[0],c=control(m),edge=side*90;
  f.x=side*35;f.y=145;f.vx=f.vy=0;f.state='fall';f.onGround=false;f.__raw={up:true,special:true};c.tick(1);f.__raw={};c.tick(4);
  const rec={ops:[]},ctx=makeCtx(rec),curves=[];ctx.quadraticCurveTo=(...args)=>curves.push(args);
  assert(S.drawSpriteFighter(ctx,f,0),'grapple sprite missing');
  assert(curves.some(q=>q[2]===edge && q[3]===0),'grapple cable not anchored to gap lip');
  c.tick(18);assert(f.ledge?.x===edge,'no ledge hang to draw');const hang=S.LEDGE_ART[who],rec2={ops:[]};
  assert(S.drawSpriteFighter(makeCtx(rec2),f,0),'hang art missing');const op=rec2.ops.find(o=>o.op==='drawImage');
  const x=op.matrix[0]*(op.dx+hang.anchor.handX)+op.matrix[2]*(op.dy+hang.anchor.handY)+op.matrix[4];
  const y=op.matrix[1]*(op.dx+hang.anchor.handX)+op.matrix[3]*(op.dy+hang.anchor.handY)+op.matrix[5];
  assert(Math.abs(x-edge)<.01 && Math.abs(y)<.01,'hanging hand not fixed to gap lip');
 }
});
test('ordinary falling fighters grab and climb either gap edge in real match updates',()=>{
 for(const key of ['minecraftworld','greatcave'])for(const side of [-1,1]){
  const h=boot(),m=newMatch(h.ctx,cast(1,['valor']),key,{rules:{hazards:false,items:'none'}}),f=m.fighters[0],c=control(m),edge=side*90;
  f.x=side*65;f.y=10;f.vx=0;f.vy=2;f.state='fall';f.onGround=false;f.ledgeCD=0;f.__raw={};c.tick(1);
  assert(f.state==='ledge' && f.ledge.x===edge,'fall did not grab actual gap edge');
  f.__raw={up:true};c.tick(1);assert(f.onGround && f.state==='idle' && Math.abs(f.x-edge)<40,'climb did not reach nearby deck');
  f.__raw={};c.tick(4);assert(f.onGround && Math.abs(f.x-edge)<60,'climb did not stay on deck');
 }
});
T.run().then(fail=>{process.exitCode=fail?1:0;});
