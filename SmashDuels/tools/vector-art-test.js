'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {boot,cast,newMatch,makeCtx,GAME} = require('./harness');
(async () => {
  const h=boot({render:true,record:true});h.g.Sprites.load();await h.settle(30);
  const S=h.g.Sprites, meta=JSON.parse(fs.readFileSync(path.join(GAME,'assets/atlas/vector.json')));
  assert(S.ready('vector'),'atlas did not load');
  assert(meta.sourceFrames.length < 50,'only curated poses should be loaded');
  assert(!meta.variants,'animations must not randomly alternate incompatible sheets');
  const mapped=new Set(Object.values(meta.anims).flat().map(e=>e[0]));
  for(const frame of meta.sourceFrames) {
    assert(mapped.has(frame.tile),`unused ${frame.file}`);
    assert(fs.existsSync(path.join(GAME,'assets/frames/vector',frame.file)),`missing ${frame.file}`);
  }
  const match=newMatch(h.ctx,cast(2,['vector','valor'])), f=match.fighters[0];
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
      if(key==='n' && t>=sp.startup && t<sp.startup+sp.active) assert.strictEqual(sel.i,meta.actionTiming[name].strike,'missile launch pose not timed'); }
    assert(new Set(seq).size>=3,`${name} has no meaningful animation`);
  }
  const source=Object.fromEntries(meta.sourceFrames.map(x=>[x.file,x.tile]));
  assert.deepStrictEqual(meta.anims.run.map(e=>e[0]),['r1','r2','r3','r6','r7','r8'].map(k=>source[k+'.png']),'run order');
  for (const facing of [-1,1]) {
    f.state='run';f.facing=facing;f.vx=6*facing;f.dashT=8;f.animT++;
    assert.strictEqual(S.pickAnim(f,0).name,'run','run used attack dash');
    f.state='turn';f.animT++;assert.strictEqual(S.pickAnim(f,0).name,'turn','turn needs a brace');
    for (const [key,sign] of [['fair',1],['bair',-1]]) {
      const move=f.def.moves[key];f.state='attack';f.facing=facing;f.action={type:'move',key,dur:move.frames,startup:move.startup,active:move.active};
      f.actionT=move.startup;f.groundDist=-1;f.animT++;const rec={ops:[]};S.drawSpriteFighter(makeCtx(rec),f,0);
      const draw=rec.ops.find(x=>x.op==='drawImage');assert(draw && Math.sign(draw.matrix[0])===sign*facing,`${key} facing wrong`);
    }
  }
  // The active normal pose points in the attack's direction, not a reused
  // jump or a baked slash. Air and ground attacks share the appropriate art.
  for (const [move,pose] of Object.entries({jab:'punch',stilt:'punch',ssmash:'punch',fair:'punch',bair:'punch',utilt:'upper',usmash:'upper',uair:'upper',dtilt:'low',dsmash:'low',dair:'low'}))
    assert.strictEqual(meta.anims[move][meta.actionTiming[move].strike][0],source[pose+'.png'],`${move} uses wrong strike`);
  for (const name of ['jab','stilt','utilt','dtilt','ssmash','usmash','dsmash'])
    assert(!meta.anims[name].some(e=>e[0]===source['g1.png'] || e[0]===source['s2.png'] || e[0]===source['s4.png']), `${name} contains baked special effects`);
  // Airborne poses have different limb extensions. Guard width and height
  // independently against the previous under-scaled versions rather than
  // forcing the tucked and fully extended silhouettes to the same height.
  const idle=meta.tiles[source['idle.png']];
  for (const name of ['j1','j2','j3','j4','j5']) {
    const tile=meta.tiles[source[name+'.png']];
    assert(tile.w>=idle.w*.75 && tile.h>=idle.h*.94, `${name} too small next to idle: ${tile.w}x${tile.h}`);
    assert(tile.h<=idle.h*1.4, `${name} implausibly large: ${tile.h}`);
  }
  assert(meta.anims.uspecial.every(e => ['j2.png','j3.png','j4.png'].some(n=>source[n]===e[0])), 'boost uses tiny crouch pose');
  // Shoulder launch flash only exists during the actual rising window.
  const up=f.def.specials.up;f.state='special';f.action={type:'special',specialKey:'u',dur:up.frames,startup:up.startup,active:up.active};f.groundDist=-1;
  const curves=t=>{f.actionT=t;const rec={ops:[]},c=makeCtx(rec);let count=0;c.quadraticCurveTo=()=>count++;S.drawSpriteFighter(c,f,0);return count;};
  assert.strictEqual(curves(up.startup-1),0,'rocket flash during windup');
  assert(curves(up.startup+3)>=4,'missing shoulder launch flash during boost');
  assert.strictEqual(curves(up.startup+21),0,'rocket flash outlasted boost');
  const sideMove=f.def.specials.side;
  for (const facing of [-1,1]) {
    f.facing=facing;f.state='special';f.action={type:'special',specialKey:'s',rocketRush:true,dur:sideMove.frames,startup:sideMove.startup,active:sideMove.active};
    const flame=t=>{f.actionT=t;const rec={ops:[]},c=makeCtx(rec);let count=0;c.quadraticCurveTo=()=>count++;S.drawSpriteFighter(c,f,0);return {count,rec};};
    assert.strictEqual(flame(sideMove.startup-1).count,0,'rush flame during windup');
    const active=flame(sideMove.startup+1);
    assert(active.count>=4,'missing rear thruster flame');
    assert(active.rec.ops.some(o=>o.op==='translate' && Math.abs(o.x-(f.x-facing*28*f.scale))<.01 && Math.abs(o.y-(f.y-80*f.scale))<.01),'flame not anchored to back');
    assert(active.rec.ops.some(o=>o.op==='scale' && o.x===-facing),'flame not pointed behind fighter');
    assert.strictEqual(flame(sideMove.startup+sideMove.active).count,0,'rush flame outlasted boost');
  }
  // Cosmetic missile is actually painted and moves independently after launch.
  match.fx.parts=[];match.fx.particle({x:0,y:0,vx:-8,vy:0,life:22,size:8,color:'#ff8b24',grav:0,drag:1,shape:'rushRocket'});
  const rocket=match.fx.parts[0];match.fx.update();assert.strictEqual(rocket.x,-8,'rocket did not move rearward');
  const rec={ops:[]};match.fx.draw(makeCtx(rec));
  assert(rec.ops.some(o=>o.op==='rotate' && Math.abs(Math.abs(o.a)-Math.PI)<.001),'rocket was not drawn facing rearward');
  const hang=S.LEDGE_ART.vector;assert(hang,'ledge art did not load');
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
  console.log(`Vector: ${meta.sourceFrames.length} curated sheet frames, timed attacks, four specials and anchored ledge pose.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
