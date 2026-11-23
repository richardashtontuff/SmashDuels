'use strict';
const assert=require('assert');
const {createBuffer,interpolate}=require('../game/js/online-presentation');
const {snapshot}=require('../server/server');
const {boot,cast,newMatch}=require('./harness');
const STEP=1000/60;
const snap=(frame,x=frame*4)=>({frame,time:frame*STEP,state:'play',stageForm:'normal',fighters:[{x,y:0,state:'run',stocks:3,animT:frame,actionT:frame,stateT:frame,hitlag:0}],platforms:[{x,y:0,active:true}],items:[],projectiles:[],mines:[],summons:[],fx:{parts:[],texts:[],rings:[],arcs:[],lines:[]}});
for(const hz of [60,120]) {
  const buf=createBuffer();let last=-Infinity, prevFrame=-Infinity, lastX=null, advances=0, holds=0;
  // Alternating packet delays, with occasional 50 ms packet gaps. Arrival remains ordered.
  const arrivals=[];for(let f=0;f<=360;f+=2)arrivals.push({at:f*STEP + (f%12===0?18:0),s:snap(f)});
  let i=0;
  for(let now=0;now<5900;now+=1000/hz){
    while(i<arrivals.length && arrivals[i].at<=now)buf.push(arrivals[i++].s);
    const sample=buf.sample(now);if(!sample)continue;
    const v=interpolate(sample);
    assert(v.fighters[0].x>=last-1e-8,'movement rewound at '+hz+'Hz');
    assert(sample.frame>=prevFrame-1e-8,'playhead rewound');
    assert(sample.frame<=arrivals[i-1].s.frame+1e-8,'must not predict beyond latest');
    if(lastX!==null && now>400){if(v.fighters[0].x>lastX+1e-6)advances++;else holds++;}
    last=v.fighters[0].x;lastX=last;prevFrame=sample.frame;
  }
  assert(advances>hz*4,`mostly smooth at ${hz}Hz`);
  assert(holds<hz*.35,`too many holds at ${hz}Hz: ${holds}`);
}
{
 const buf=createBuffer(); const a=snap(0),b=snap(2),c=snap(4);
 assert(buf.push(a));assert(!buf.push(a));assert(!buf.push(snap(-2)));assert(buf.push(b));assert(buf.push(c));
 let s=buf.sample(0);s=buf.sample(1000);assert(s.frame<=4);s=buf.sample(1300);const held=buf.sample(1600);assert.equal(held.frame,s.frame);
 buf.push(snap(6));assert(buf.sample(1616).frame>=held.frame,'resume never rewinds');
 buf.reset();assert.equal(buf.sample(1500),null);assert(buf.push(snap(0,99)));assert.equal(interpolate(buf.sample(1501)).fighters[0].x,99);
}
{
 const a=snap(10,0),b=snap(12,8),mid=(a,b,t=.5)=>interpolate({a,b,t,frame:11});
 assert.equal(mid(a,b).fighters[0].x,4);assert.equal(mid(a,b).fighters[0].animT,11);
 b.fighters[0].x=900;assert.equal(mid(a,b).fighters[0].x,0,'teleport held until boundary');
 b.fighters[0].x=8;b.fighters[0].stocks=2;assert.equal(mid(a,b).fighters[0].x,0);
 b.fighters[0].stocks=3;b.fighters[0].state='ledge';assert.equal(mid(a,b).fighters[0].x,0);
 b.fighters[0].state='run';b.fighters[0].hitlag=3;assert.equal(mid(a,b).fighters[0].x,0);
 assert.strictEqual(mid(a,b,1),b,'discontinuous state switches at snapshot boundary');
 const distant=snap(22,48);assert.strictEqual(mid(a,distant),a,'missing snapshots are not invented');
 b.fighters[0].hitlag=0;b.platforms[0].active=false;assert.equal(mid(a,b).platforms[0].x,a.platforms[0].x);
 a.projectiles=[{netId:1,x:0,y:0}];b.projectiles=[{netId:2,x:100,y:0},{netId:1,x:8,y:0}];
 a.fx.parts=[{netId:4,x:0,y:0,t:0,life:10}];b.fx.parts=[{netId:5,x:100,y:0,t:0,life:10},{netId:4,x:8,y:0,t:2,life:10}];
 let m=mid(a,b);assert.equal(m.projectiles.length,1);assert.equal(m.projectiles[0].x,4);assert.equal(m.fx.parts.length,1);assert.equal(m.fx.parts[0].t,1);
 b.projectiles=[{netId:2,x:100,y:0}];b.fx.parts=[{netId:5,x:100,y:0,t:0,life:10}];m=mid(a,b);assert.equal(m.projectiles[0].x,0);assert.equal(m.fx.parts[0].x,0);assert.equal(a.fx.parts[0].t,0,'snapshots remain immutable');
}
{
 const h=boot(),m=newMatch(h.ctx,cast(1,['valor']),'field');
 m.fx.particle({x:1,y:2});m.fx.particle({x:5,y:6});
 const a=snapshot(m);m.fx.parts.shift();m.fx.parts[0].x=7;m.fx.particle({x:11});const b=snapshot(m);
 assert.equal(a.fx.parts[1].netId,b.fx.parts[0].netId);assert.notEqual(a.fx.parts[0].netId,b.fx.parts[1].netId);
 assert.equal(a.fx.parts[1].x,5,'server snapshots copy effects');
}
console.log('online presentation: 60/120 Hz, jitter, holds, lifecycle, transitions and entity identities passed');
// Exercise the real client receive/presentation path without a browser or network.
{
 const fs=require('fs'),vm=require('vm');
 const nodes=new Map();
 function el(id){if(!nodes.has(id))nodes.set(id,{style:{setProperty(){}},classList:{add(){},remove(){}},children:[],append(){},replaceChildren(){}});return nodes.get(id);}
 const sent=[];let current=null;
 class WS {constructor(){this.readyState=1;WS.last=this;}send(v){sent.push(JSON.parse(v));}close(){} message(msg){this.onmessage({data:JSON.stringify(msg)});}}
 WS.OPEN=1;
 class Entity {constructor(...args){if(args.length===1)Object.assign(this,args[0]);}}
 const context=vm.createContext({OnlinePresentation:require('../game/js/online-presentation'),document:{getElementById:el,querySelector:()=>el('shell')},window:{addEventListener(){}},WebSocket:WS,location:{protocol:'https:',host:'example.test'},FIGHTERS:{},STAGE_KEYS:[],StageInfo:{close(){}},UI:{show(){},openTitle(){}},Game:{startMatch(){current={fighters:[{id:0}],stage:{platforms:[{}]},fx:{},readPlayerInput:()=>({right:true})};},getMatch(){return current;},stopMatchView(){current=null;}},INPUT:{map:{p1:{}},keys:{},pressed:{}},DEFAULT_RULES:{},Item:Entity,Projectile:Entity,Mine:Entity,Summon:Entity,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});
 vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../game/js/online.js'),'utf8')+'\nthis.Online=Online;',context);
 const online=context.Online;online.open();el('online-queue').onclick();const ws=WS.last;ws.onopen();
 const start=()=>ws.message({type:'start',rules:{},cast:[],stage:'field'});start();
 ws.message({type:'snapshot',data:snap(0,10)});assert.equal(current.fighters[0].x,undefined,'receipt does not immediately apply a snapshot');
 online.present(0);assert.equal(current.fighters[0].x,10);
 online.tick(current,false);assert(sent.some(x=>x.type==='input' && x.mask===2),'input is sent without waiting for presentation');
 ws.message({type:'round_aborted',message:'left'});assert.equal(online.playing,false);start();online.present(20);assert.equal(current.fighters[0].x,undefined,'aborted round history must not leak into rematch');
 ws.message({type:'snapshot',data:snap(0,77)});online.present(30);assert.equal(current.fighters[0].x,77);
 ws.onclose();assert.equal(online.playing,false);assert.equal(current,null);
 online.open();el('online-queue').onclick();WS.last.onopen();WS.last.message({type:'start',rules:{},cast:[],stage:'field'});online.present(40);assert.equal(current.fighters[0].x,undefined,'disconnect history must not leak into a new connection');
}
(async()=>{
 const h=boot({render:true,record:true});h.g.Sprites.load();await h.settle(14);
 const m=newMatch(h.ctx,cast(1,['valor']),'field',{state:'play'}), f=m.fighters[0];
 f.state='run';f.vx=5;f.onGround=true;
 h.g.Sprites.setSmooth(false);
 for(let t=0;t<100;t++){f.animT=t;const selection=h.g.Sprites.pickAnim(f,0);if(selection)assert(!selection.mix,'online animation must not draw overlapping cells');}
 h.g.Sprites.setSmooth(true);
 console.log('online client lifecycle, input and ghost-free sprite cells passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
