'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const {boot,cast,newMatch,makeCtx,GAME}=require('./harness');
(async()=>{
 const h=boot({render:true,record:true});h.g.Sprites.load();await h.settle(35);
 const S=h.g.Sprites,meta=JSON.parse(fs.readFileSync(path.join(GAME,'assets/atlas/nomad.json')));
 assert(S.ready('nomad')&&S.LEDGE_ART.nomad,'atlas or hang missing');
 const source=Object.fromEntries(meta.sourceFrames.map(f=>[f.file,f.tile]));const used=new Set(Object.values(meta.anims).flat().map(f=>f[0]));
 for(const f of meta.sourceFrames)assert(used.has(f.tile)&&fs.existsSync(path.join(GAME,'assets/frames/nomad',f.file)),'unused/missing '+f.file);
 assert.deepStrictEqual(meta.anims.run.map(x=>x[0]),Array.from({length:8},(_,i)=>source['r'+(i+1)+'.png']));
 assert(meta.anims.idle.length===1 && meta.anims.idle[0][0]===source['gun.png'],'idle does not use the rifle-ready art');
 const idle=meta.tiles[source['gun.png']],runs=meta.anims.run.map(e=>meta.tiles[e[0]].h);
 const avgRun=runs.reduce((a,b)=>a+b,0)/runs.length;
 assert(idle.h/avgRun>.95 && idle.h/avgRun<1.12,'idle is not scaled to running art');
 const air=meta.anims.fall;assert(air.length===1 && air[0][0]===source['j4.png'],'fall must hold a clean airborne pose');
 assert(Math.abs(air[0][2]-meta.tiles[air[0][0]].h)<1,'fall feet are not anchored to physics');
 const roll=meta.anims.uspecial.map(x=>x[0]);for(const pose of ['roll1.png','roll2.png','roll3.png','roll4.png'])assert(roll.includes(source[pose]),'up G missing '+pose);
 assert(meta.anims.sspecial.some(x=>x[0]===source['strike.png']),'gun strike art missing');
 const m=newMatch(h.ctx,cast(2,['nomad','valor']),'terminal'),f=m.fighters[0];
 f.state='idle';for(const facing of [-1,1]) {f.facing=facing;const sel=S.pickAnim(f,0);assert(sel.frames[sel.i][0]===source['gun.png'],'gun missing in idle');const rec={ops:[]};S.drawSpriteFighter(makeCtx(rec),f,0);assert(rec.ops.some(o=>o.op==='drawImage' && Math.sign(o.matrix[0])===facing),'idle facing wrong');}
 for (const state of ['fall','fastfall']) {f.state=state;for (let t=0;t<60;t++){f.animT=t;const sel=S.pickAnim(f,0);assert(sel.frames[sel.i][0]===source['j4.png'],state+' flickers or switches pose');}}

 for(const side of [-1,1]) {
   f.facing=side;f.state='special';f.action={...f.def.specials.up,type:'special',specialType:'recover',specialKey:'u',dur:f.def.specials.up.frames};
   let seen=new Set();for(let t=0;t<f.action.dur;t++){f.actionT=t;seen.add(S.pickAnim(f,0).frames[S.pickAnim(f,0).i][0]);}
   for(const pose of ['roll1.png','roll2.png','roll3.png','roll4.png'])assert(seen.has(source[pose]),'normal recovery skips '+pose);
   f.action.vinePull={edgeX:side*100,edgeY:0,t:6,duration:16};const rec={ops:[]},ctx=makeCtx(rec);let curves=[],path=[],strokes=[];
   ctx.beginPath=()=>{path=[];};ctx.moveTo=(...a)=>path.push(['M',...a]);ctx.lineTo=(...a)=>path.push(['L',...a]);ctx.quadraticCurveTo=(...a)=>{curves.push(a);path.push(['Q',...a]);};ctx.stroke=()=>strokes.push({color:ctx.strokeStyle,path:[...path]});
   S.drawSpriteFighter(ctx,f,0);assert(curves.some(end=>end[2]===side*100&&end[3]===0),'hook cable not attached to ledge');
   const blue=strokes.find(st=>st.color==='#08c8ff');assert(blue && blue.path.filter(p=>p[0]==='M').length===4 && blue.path.filter(p=>p[0]==='Q').length===2,'blue hook needs three prongs');
   assert(rec.ops.some(o=>o.op==='set'&&o.k==='shadowColor'&&o.v==='#00aaff'),'electric glow missing');
   const edge=side<0?m.stage.ground.x:m.stage.ground.x+m.stage.ground.w;f.snapLedge(m,side,edge);
   const hang=S.LEDGE_ART.nomad,hr={ops:[]};S.drawSpriteFighter(makeCtx(hr),f,0);const d=hr.ops.find(o=>o.op==='drawImage');
   assert(d && d.img===hang.img && d.finite,'hang not rendered');
   const x=d.matrix[0]*(d.dx+hang.anchor.handX)+d.matrix[2]*(d.dy+hang.anchor.handY)+d.matrix[4];
   const y=d.matrix[1]*(d.dx+hang.anchor.handX)+d.matrix[3]*(d.dy+hang.anchor.handY)+d.matrix[5];
   assert(Math.abs(x-edge)<.01&&Math.abs(y-m.stage.ground.y)<.01,'hand not anchored');
 }
 console.log('Nomad: both supplied sheets, rolling recovery, gun strike and anchored hook/ledge art.');
})().catch(e=>{console.error(e);process.exitCode=1});
