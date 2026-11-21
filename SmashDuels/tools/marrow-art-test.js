'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {boot,cast,newMatch,makeCtx,GAME} = require('./harness');
(async () => {
  const h=boot({render:true,record:true});h.g.Sprites.load();await h.settle(30);
  const S=h.g.Sprites, meta=JSON.parse(fs.readFileSync(path.join(GAME,'assets/atlas/marrow.json')));
  assert(S.ready('marrow'),'atlas did not load');
  assert(meta.sourceFrames.length < 50,'only curated poses should be loaded');
  assert(!meta.variants,'animations must not randomly alternate incompatible sheets');
  const mapped=new Set(Object.values(meta.anims).flat().map(e=>e[0]));
  for(const frame of meta.sourceFrames) {
    assert(mapped.has(frame.tile),`unused ${frame.file}`);
    assert(fs.existsSync(path.join(GAME,'assets/frames/marrow',frame.file)),`missing ${frame.file}`);
  }
  const match=newMatch(h.ctx,cast(2,['marrow','valor'])), f=match.fighters[0];
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
      if(key==='n' && t>=sp.startup && t<sp.startup+sp.active) assert.strictEqual(sel.i,meta.actionTiming[name].strike,'soul reap impact not timed'); }
    assert(new Set(seq).size>=3,`${name} has no meaningful animation`);
  }
  // The dedicated axe tile follows a full rotation precisely across the live
  // window, then disappears; both facing directions and palette draws work.
  const blade=meta.tiles[meta.spinBlade], up=f.def.specials.up;
  assert(blade && blade.w>0 && blade.h>0, 'missing spectral axe tile');
  for(const facing of [-1,1]) {
    f.state='special';f.facing=facing;f.charging=false;f.palIdx=0;f.groundDist=-1;
    f.action=Object.assign({},up,{type:'special',specialType:up.type,specialKey:'u',dur:up.frames});
    function render(t) {f.actionT=t;f.animT++;const r={ops:[]};S.drawSpriteFighter(makeCtx(r),f,0);
      return r.ops.find(x=>x.op==='drawImage' && x.sx===blade.x && x.sy===blade.y && x.sw===blade.w && x.sh===blade.h);}
    assert(!render(up.startup-1),'axe shown before spin');
    const first=render(up.startup), middle=render(up.startup+Math.floor((up.active-1)/2)), last=render(up.startup+up.active-1);
    assert(first && middle && last && first.finite && middle.finite && last.finite,'axe missing or nonfinite');
    assert(Math.hypot(first.matrix[4]-middle.matrix[4],first.matrix[5]-middle.matrix[5])>100,'axe did not rotate around the fighter');
    assert(Math.hypot(first.matrix[4]-last.matrix[4],first.matrix[5]-last.matrix[5])<.01,'axe did not complete its circle');
    assert(!render(up.startup+up.active),'axe remained after spin');
  }
  // Charge bar and energy ring must be drawn only during the held special.
  f.state='special';f.action=Object.assign({},f.def.specials.neutral,{type:'special',specialType:'soulreap',specialKey:'n',dur:f.def.specials.neutral.frames});
  f.charging=true;f.chargeT=60;f.animT++;const chargeRec={ops:[]};const chargeCtx=makeCtx(chargeRec);chargeCtx.fillRect=(...a)=>chargeRec.ops.push({op:'fillRect',a});S.drawSpriteFighter(chargeCtx,f,0);
  assert(chargeRec.ops.filter(o=>o.op==='fillRect').length>=3,'charge gauge not drawn');
  f.charging=false;
  // The back-air hitbox is behind Marrow; its art must face behind too.
  for (const [key,sign] of [['fair',1],['bair',-1]]) {
    const move=f.def.moves[key];f.state='attack';f.facing=1;f.action={type:'move',key,dur:move.frames,startup:move.startup,active:move.active};
    f.actionT=move.startup;f.groundDist=-1;f.animT++;const rec={ops:[]};S.drawSpriteFighter(makeCtx(rec),f,0);
    const draw=rec.ops.find(x=>x.op==='drawImage');assert(draw && Math.sign(draw.matrix[0])===sign,`${key} art faces the wrong way`);
  }
  const hang=S.LEDGE_ART.marrow;assert(hang,'ledge art did not load');
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
  console.log(`Marrow: ${meta.sourceFrames.length} curated frames, stable move timing, four specials and anchored ledge sway on both sides.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
