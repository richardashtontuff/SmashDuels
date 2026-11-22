'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const {boot,cast,newMatch,makeCtx,GAME}=require('./harness');
(async()=>{
  const h=boot({render:true,record:true});h.g.Sprites.load();await h.settle(35);
  const S=h.g.Sprites, meta=JSON.parse(fs.readFileSync(path.join(GAME,'assets/atlas/briar.json')));
  assert(S.ready('briar'),'missing atlas');assert(!meta.variants,'incompatible art variants');
  const source=Object.fromEntries(meta.sourceFrames.map(x=>[x.file,x.tile]));
  const mapped=new Set(Object.values(meta.anims).flat().map(x=>x[0]));
  for(const f of meta.sourceFrames) {
    assert(mapped.has(f.tile),'unused pose '+f.file);
    assert(fs.existsSync(path.join(GAME,'assets/frames/briar',f.file)),'missing pose '+f.file);
  }
  const m=newMatch(h.ctx,cast(2,['briar','valor'])),f=m.fighters[0];
  for(const [key,move] of Object.entries(f.def.moves)) {
    const name=S.MOVE_ANIM[key],row=meta.anims[name],timing=meta.actionTiming[name];assert(row && timing,'missing '+key);
    f.state='attack';f.action={type:'move',key,dur:move.frames,startup:move.startup,active:move.active};
    let seen=new Set();
    for(let t=0;t<move.frames;t++) {f.actionT=t;f.animT++;const sel=S.pickAnim(f,0);seen.add(sel.frames[sel.i][0]);
      if(t>=move.startup && t<move.startup+move.active)assert.strictEqual(sel.i,timing.strike,key+' wrong active pose');
      else if(t<move.startup)assert.notStrictEqual(sel.i,timing.strike,key+' active before hit');
    }
    assert(seen.size>=3,key+' lacks windup and recovery');
  }
  assert.deepStrictEqual(meta.anims.run.map(e=>e[0]),Array.from({length:9},(_,i)=>source['r'+(i+1)+'.png']));
  for(const name of ['j1','j2','j3','j4']) {
    const tile=meta.tiles[source[name+'.png']],idle=meta.tiles[source['idle.png']];
    assert(tile.h>=idle.h && tile.w>=idle.w*.9,name+' shrinks in the air');
  }
  for(const [key,name,pose] of [['n','nspecial','w3.png'],['d','dspecial','e3.png']]) {
    const move=f.def.specials[key==='n'?'neutral':'down'];f.state='special';f.action={type:'special',specialKey:key,dur:move.frames,startup:move.startup,active:move.active};
    for(let t=0;t<move.frames;t++){f.actionT=t;f.animT++;const sel=S.pickAnim(f,0);if(t>=move.startup && t<move.startup+move.active)assert.strictEqual(sel.frames[sel.i][0],source[pose],name+' missing live artwork');}
  }
  for(const facing of [-1,1]) {
    f.facing=facing;f.groundDist=-1;
    for(const [key,sign] of [['fair',1],['bair',-1]]) {
      const move=f.def.moves[key];f.state='attack';f.action={type:'move',key,dur:move.frames,startup:move.startup,active:move.active};f.actionT=move.startup;f.animT++;
      const rec={ops:[]};S.drawSpriteFighter(makeCtx(rec),f,0);let draw=rec.ops.find(x=>x.op==='drawImage');assert(draw && Math.sign(draw.matrix[0])===sign*facing,key+' facing wrong');
    }
    const move=f.def.moves.utilt;f.state='attack';f.action={type:'move',key:'utilt',dur:move.frames,startup:move.startup,active:move.active};
    const curves=t=>{f.actionT=t;const rec={ops:[]},ctx=makeCtx(rec);let n=0;ctx.bezierCurveTo=()=>n++;S.drawSpriteFighter(ctx,f,0);return n;};
    assert.strictEqual(curves(move.startup-1),0,'vine during startup');assert(curves(move.startup)>0,'up attack has no directional vine');assert.strictEqual(curves(move.startup+move.active),0,'vine outlasted hit');
  }
  // New specials draw their actual world-space tether/attack vines.
  for(const facing of [-1,1]) {
    f.state='special';f.facing=facing;f.x=0;f.y=0;
    const rec={ops:[]},ctx=makeCtx(rec);let curves=[],quadratics=[];
    ctx.bezierCurveTo=(...args)=>curves.push(args);ctx.quadraticCurveTo=(...args)=>quadratics.push(args);
    const side=f.def.specials.side;f.action={...side,type:'special',specialType:'vinedash',specialKey:'s'};f.actionT=side.startup+4;S.drawSpriteFighter(ctx,f,0);
    assert(curves.length>=2 && Math.sign(curves[0][4])===facing,'dash vine not extended in facing direction');
    curves=[];const target=m.fighters[1];target.x=facing*80;target.y=-120;target.vineGrabbed=true;f.grabbing=target;S.drawSpriteFighter(ctx,f,0);
    assert(curves.some(c=>c[4]===target.x && c[5]===target.y-48*target.scale),'grapple vine detached from victim');f.grabbing=null;
    curves=[];const up=f.def.specials.up;f.action={...up,type:'special',specialType:'recover',specialKey:'u'};f.actionT=up.startup+3;S.drawSpriteFighter(ctx,f,0);
    assert(curves.length>=4,'normal up special needs multiple upward vines');
    f.action.vinePull={edgeX:facing*120,edgeY:0};S.drawSpriteFighter(ctx,f,0);
    assert(quadratics.some(c=>c[2]===facing*120 && c[3]===0),'tether not connected to ledge');
  }
  const hang=S.LEDGE_ART.briar;assert(hang,'ledge art missing');
  for(const side of [-1,1])for(const time of [0,17,39]){
    const edge=side<0?m.stage.ground.x:m.stage.ground.x+m.stage.ground.w;f.snapLedge(m,side,edge);f.animT=time;
    const rec={ops:[]};assert(S.drawSpriteFighter(makeCtx(rec),f,0));const d=rec.ops.find(o=>o.op==='drawImage');assert(d && d.img===hang.img && d.finite);
    const x=d.matrix[0]*(d.dx+hang.anchor.handX)+d.matrix[2]*(d.dy+hang.anchor.handY)+d.matrix[4];
    const y=d.matrix[1]*(d.dx+hang.anchor.handX)+d.matrix[3]*(d.dy+hang.anchor.handY)+d.matrix[5];
    assert(Math.abs(x-edge)<.01 && Math.abs(y-m.stage.ground.y)<.01,'ledge hand drift');
  }
  console.log('Briar: curated sheet poses, directional attacks, timed whip/spikes and anchored ledge art.');
})().catch(e=>{console.error(e);process.exitCode=1});
