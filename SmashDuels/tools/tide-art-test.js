'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {boot,cast,newMatch,makeCtx,GAME} = require('./harness');
(async () => {
  const h=boot({render:true,record:true});h.g.Sprites.load();await h.settle(30);
  const S=h.g.Sprites, meta=JSON.parse(fs.readFileSync(path.join(GAME,'assets/atlas/tide.json')));
  assert(S.ready('tide'),'atlas did not load');
  assert(meta.sourceFrames.length < 50,'only curated poses should be loaded');
  assert(!meta.variants,'animations must not randomly alternate incompatible sheets');
  const mapped=new Set(Object.values(meta.anims).flat().map(e=>e[0]));
  for(const frame of meta.sourceFrames) {
    assert(mapped.has(frame.tile),`unused ${frame.file}`);
    assert(fs.existsSync(path.join(GAME,'assets/frames/tide',frame.file)),`missing ${frame.file}`);
  }
  const match=newMatch(h.ctx,cast(2,['tide','valor'])), f=match.fighters[0];
  for(const [key,move] of Object.entries(f.def.moves)) {
    const name=S.MOVE_ANIM[key], row=meta.anims[name], timing=meta.actionTiming[name];
    assert(row && timing,`missing ${key} animation/timing`);
    let indices=[];
    for(let repeat=0;repeat<2;repeat++) {
      f.state='idle';f.action=null;f.animT++;S.pickAnim(f,0);
      f.state='attack';f.action={type:'move',key,dur:move.frames,startup:move.startup,active:move.active};
      const played=[];
      for(let t=0;t<move.frames;t++) {
        f.actionT=t;f.animT++;let sel=S.pickAnim(f,0);played.push(sel.frames[sel.i][0]);
        if(t>=move.startup && t<move.startup+move.active) assert.strictEqual(sel.i,timing.strike,`${key} strike not live`);
        if(t<move.startup) assert.notStrictEqual(sel.i,timing.strike,`${key} strikes during startup`);
      }
      if(repeat) assert.deepStrictEqual(played,indices,`${key} changes between uses`);
      else indices=played;
      assert(new Set(played).size>=3,`${key} lacks windup, strike and recovery`);
    }
  }
  for(const [key,name] of [['n','nspecial'],['s','sspecial'],['u','uspecial'],['d','dspecial']]) {
    let sp=f.def.specials[{n:'neutral',s:'side',u:'up',d:'down'}[key]];
    f.state='special';f.action={type:'special',specialKey:key,dur:sp.frames,startup:sp.startup,active:sp.active};
    const seq=[];
    for(let t=0;t<sp.frames;t++) { f.actionT=t;f.animT++;const sel=S.pickAnim(f,0);seq.push(sel.i);
      if(key==='n' && t>=sp.startup && t<sp.startup+sp.active) assert.strictEqual(sel.i,meta.actionTiming[name].strike,'Tidal Wave release pose not timed'); }
    assert(new Set(seq).size>=3,`${name} has no meaningful animation`);
  }
  // Forward-only authored stride, a braced turn and no special-lunge art
  // on ordinary dash/reversal. Check actual selections, not just metadata.
  const source=Object.fromEntries(meta.sourceFrames.map(x=>[x.file,x.tile]));
  assert.deepStrictEqual(meta.anims.run.map(e=>e[0]),['r1','r2','r3','r6','r8'].map(k=>source[k+'.png']),'stride is not forward ordered');
  for(const facing of [-1,1]) {
    f.state='run';f.facing=facing;f.vx=6*facing;f.dashT=8;f.animT++;
    assert.strictEqual(S.pickAnim(f,0).name,'run','ordinary run used lunge sprites');
    f.state='turn';f.animT++;assert.strictEqual(S.pickAnim(f,0).name,'turn','turn has no braced pose');
  }
  // Trace the actual water path: it starts at her back, descends, curls just
  // below her feet, and turns into a geyser. Verify both facing directions.
  f.groundDist=-1;f.state='special';const up=f.def.specials.up;
  f.action={type:'special',specialKey:'u',startup:up.startup,dur:up.frames};
  function water(t, facing) {f.actionT=t;f.facing=facing;f.animT++;const r={ops:[]};const c=makeCtx(r);
    c.moveTo=(x,y)=>r.ops.push({op:'waterMove',x,y});c.lineTo=(x,y)=>r.ops.push({op:'waterLine',x,y});
    c.arc=(x,y,radius)=>r.ops.push({op:'waterArc',x,y,radius});c.bezierCurveTo=(...p)=>r.ops.push({op:'waterCurve',p});
    c.stroke=()=>r.ops.push({op:'waterStroke'});S.drawSpriteFighter(c,f,0);return r.ops;}
  for(const facing of [-1,1]) {
    const start=water(0,facing), early=water(3,facing), middle=water(7,facing), end=water(up.startup-1,facing), rise=water(up.startup+5,facing), gone=water(up.startup+26,facing);
    const lines=o=>o.filter(x=>x.op==='waterLine').length;
    assert(start.some(o=>o.op==='waterArc' && o.x===-34 && o.y===-68),'water does not begin at the back');
    assert(lines(early)<lines(middle) && lines(middle)<lines(end),'water path does not grow');
    const initial=early.find(o=>o.op==='waterMove');
    assert(initial && initial.x===-34 && initial.y===-68,'stream origin is not behind her');
    const trace=end.filter(o=>o.op==='waterLine');
    assert(trace.some(o=>o.x < -40 && o.y < 0),'water did not descend behind her');
    assert(trace.some(o=>o.y>15 && o.y<35),'loop is not just below her feet');
    assert(trace.some(o=>Math.abs(o.x)<1 && Math.abs(o.y-7)<1),'loop does not end at her soles');
    assert(rise.some(o=>o.op==='waterCurve'),'rising geyser absent');
    assert(!gone.some(o=>o.op==='waterCurve'),'water remains after recovery');
    const image=middle.findIndex(o=>o.op==='drawImage');
    assert(middle.slice(0,image).some(o=>o.op==='waterLine') && middle.slice(image+1).some(o=>o.op==='waterLine'),'stream does not pass behind and below her');
    assert(middle.some(o=>o.op==='scale' && Math.sign(o.x)===facing),'water does not mirror');
    f.actionT=up.startup-1;f.animT++;const wind=S.pickAnim(f,0);
    f.actionT=up.startup;f.animT++;const lift=S.pickAnim(f,0);
    assert.notStrictEqual(wind.i,lift.i,'fighter does not change pose as the wave lifts her');
  }
  // The neutral wave fades without changing its hit lifetime.
  const wave=match.spawnProjectile({kind:'tidewave',owner:f,x:0,y:0,vx:5,life:60,fadeFrames:18,rehit:12,damage:2});
  function alpha(t) {wave.t=t;const r={ops:[]};wave.draw(makeCtx(r),0);return r.ops.find(o=>o.op==='set' && o.k==='globalAlpha').v;}
  assert.strictEqual(alpha(20),1);assert(alpha(58)>0 && alpha(58)<alpha(20),'wave does not fade at the end');
  f.state='special';f.action=Object.assign({},f.def.specials.neutral,{type:'special',specialType:'tidewave',specialKey:'n',dur:40});f.charging=true;f.chargeT=100;
  const recCharge={ops:[]};const ctxCharge=makeCtx(recCharge);ctxCharge.fillRect=(...args)=>recCharge.ops.push({op:'fillRect',args});
  S.drawSpriteFighter(ctxCharge,f,0);assert(recCharge.ops.filter(o=>o.op==='fillRect').length>=3,'missing wave duration gauge');f.charging=false;
  // The back-air hitbox is behind Tide; its art must face behind too.
  for (const [key,sign] of [['fair',1],['bair',-1]]) {
    const move=f.def.moves[key];f.state='attack';f.facing=1;f.action={type:'move',key,dur:move.frames,startup:move.startup,active:move.active};
    f.actionT=move.startup;f.groundDist=-1;f.animT++;const rec={ops:[]};S.drawSpriteFighter(makeCtx(rec),f,0);
    const draw=rec.ops.find(x=>x.op==='drawImage');assert(draw && Math.sign(draw.matrix[0])===sign,`${key} art faces the wrong way`);
  }
  const hang=S.LEDGE_ART.tide;assert(hang,'ledge art did not load');
  assert(hang.anchor.handX>=0 && hang.anchor.handX<hang.img.width && hang.anchor.handY>=0 && hang.anchor.handY<hang.img.height,'invalid hand');
  for(const side of [-1,1]) for(const time of [0,17,39]) {
    const edge=side<0?match.stage.ground.x:match.stage.ground.x+match.stage.ground.w;
    f.snapLedge(match,side,edge);f.animT=time;
    const rec={ops:[]};assert(S.drawSpriteFighter(makeCtx(rec),f,0));
    const d=rec.ops.find(x=>x.op==='drawImage');assert(d && d.img===hang.img && d.finite,'wrong hanging sprite');
    assert.strictEqual(Math.sign(d.matrix[0]),-side,'wrong ledge facing');
    const x=d.matrix[0]*(d.dx+hang.anchor.handX)+d.matrix[2]*(d.dy+hang.anchor.handY)+d.matrix[4];
    const y=d.matrix[1]*(d.dx+hang.anchor.handX)+d.matrix[3]*(d.dy+hang.anchor.handY)+d.matrix[5];
    assert(Math.abs(x-edge)<.01 && Math.abs(y-match.stage.ground.y)<.01,'hand slid off ledge');
  }
  console.log(`Tide: ${meta.sourceFrames.length} curated frames, stable move timing, four specials and anchored ledge sway on both sides.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
