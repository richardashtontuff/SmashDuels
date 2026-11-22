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

 // Airborne pose crops vary in height; normalize the drawing, not gameplay.
 // Exercise both facings and all power-up sizes while preserving each foot anchor.
 const at=S.atlas('nomad'),neutral=meta.tiles[meta.anims.idle[0][0]],expectedHeight=neutral.h*at.scale;
 for(const buff of ['normal','mushroom','poison']) for(const facing of [-1,1]) for(const state of ['jump','doublejump']) {
   f.buffs.mushroom=buff==='mushroom'?100:0;f.buffs.poison=buff==='poison'?100:0;f.facing=facing;f.x=37;f.y=-140;f.stateT=12;f.vy=0;f.action=null;
   f.state='idle';f.animT=0;S.pickAnim(f,0);f.state=state;
   const seen=new Set();
   for(let i=0;i<4;i++){
     f.animT=1+i*2;const rec={ops:[]};S.drawSpriteFighter(makeCtx(rec),f,0);
     const selected=S.pickAnim(f,0),entry=selected.frames[selected.i],tile=meta.tiles[entry[0]],d=rec.ops.find(o=>o.op==='drawImage');seen.add(entry[0]);
     assert(d && d.finite && Math.sign(d.matrix[0])===facing,'jump pose missing or mirrored incorrectly');
     const height=Math.abs(d.matrix[3])*tile.h,ratio=height/(expectedHeight*f.scale);
     assert(ratio>=.95 && ratio<=1.03,`jump frame ${i} wrong visual size: ${ratio}`);
     const footX=d.matrix[0]*(d.dx+entry[1])+d.matrix[2]*(d.dy+entry[2])+d.matrix[4];
     const footY=d.matrix[1]*(d.dx+entry[1])+d.matrix[3]*(d.dy+entry[2])+d.matrix[5];
     assert(Math.abs(footX-f.x)<.01 && Math.abs(footY-f.y)<.01,'jump frame lost its physics anchor');
   }
   assert.equal(seen.size,4,'jump sequence missing a frame');
 }
 for(const buff of ['normal','mushroom','poison']) for(const state of ['fall','fastfall']){
   f.buffs.mushroom=buff==='mushroom'?100:0;f.buffs.poison=buff==='poison'?100:0;f.state=state;f.stateT=12;f.animT++;f.vy=0;
   const rec={ops:[]};S.drawSpriteFighter(makeCtx(rec),f,0);const d=rec.ops.find(o=>o.op==='drawImage');
   const factor=state==='fastfall'?1.07:1, ratio=Math.abs(d.matrix[3])*meta.tiles[source['j4.png']].h/(expectedHeight*f.scale*factor);
   assert(ratio>.98 && ratio<1.03,'airborne fall pose not scaled to idle');
 }
 f.buffs.mushroom=f.buffs.poison=0;

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
 // The raised-arm hang is intentionally taller than idle, but its body is
 // scaled to Nomad's other poses. Its hand must stay fixed on all ledges.
 for(const buff of ['normal','mushroom','poison']) for(const edge of [-90,90]) {
   const gap=newMatch(h.ctx,cast(1,['nomad']),'greatcave'),g=gap.fighters[0],side=edge<0?1:-1;
   g.buffs.mushroom=buff==='mushroom'?100:0;g.buffs.poison=buff==='poison'?100:0;
   g.snapLedge(gap,side,edge);g.animT=0;const hang=S.LEDGE_ART.nomad,rec={ops:[]};
   S.drawSpriteFighter(makeCtx(rec),g,0);const d=rec.ops.find(o=>o.op==='drawImage');
   const scale=Math.hypot(d.matrix[0],d.matrix[1]),expected=S.height('nomad')*1.4*g.scale/hang.img.height;
   assert(Math.abs(scale-expected)<1e-6,'hanging size ignores Nomad scale or power-up');
   const x=d.matrix[0]*(d.dx+hang.anchor.handX)+d.matrix[2]*(d.dy+hang.anchor.handY)+d.matrix[4];
   const y=d.matrix[1]*(d.dx+hang.anchor.handX)+d.matrix[3]*(d.dy+hang.anchor.handY)+d.matrix[5];
   assert(Math.abs(x-edge)<.01 && Math.abs(y-gap.stage.ground.y)<.01,'scaled hand drifted from gap ledge');
 }
 console.log('Nomad: scaled jump and hanging poses, both sheets, rolling recovery, gun strike and anchored hook/ledge art.');
})().catch(e=>{console.error(e);process.exitCode=1});
