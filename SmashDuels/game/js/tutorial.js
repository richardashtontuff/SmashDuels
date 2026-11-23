/* A guided practice session: the normal combat engine remains the source of truth. */
'use strict';
const Tutorial = (() => {
  const lessons = [
    {id:'move', title:'MOVE & DASH', hint:k=>`Hold ${k.left} or ${k.right} to move. Keep holding to run.`, demo:'move'},
    {id:'jump', title:'JUMP', hint:k=>`Press ${k.jump} to jump. Press it again in the air for a double jump.`, demo:'jump'},
    {id:'doublejump', title:'DOUBLE JUMP', hint:k=>`Jump with ${k.jump}, release it, then press ${k.jump} again while airborne.`, demo:'doublejump'},
    {id:'jab', title:'BASIC ATTACK', hint:k=>`Stand still and press ${k.attack} for a neutral attack.`, demo:'jab'},
    {id:'smash', title:'SMASH ATTACK', hint:k=>`From a standstill, tap a direction and ${k.attack} together. Hold ${k.attack} to charge.`, demo:'smash'},
    {id:'dash', title:'DASH ATTACK', hint:k=>`Run with ${k.left} or ${k.right}, then press ${k.attack} while moving.`, demo:'dash'},
    {id:'neutral', title:'NEUTRAL SPECIAL', hint:k=>`Release the directions and press ${k.special}. Some fighters charge by holding it.`, demo:'neutral'},
    {id:'side', title:'SIDE SPECIAL / DASH + SPECIAL', hint:k=>`Hold ${k.left} or ${k.right} and press ${k.special}. You can also do this while running.`, demo:'side'},
    {id:'up', title:'UP SPECIAL / RECOVERY', hint:k=>`Press ${k.up} + ${k.special}, or ${k.jump} + ${k.special}. Your recovery resets when you land.`, demo:'up'},
    {id:'down', title:'DOWN SPECIAL', hint:k=>`Hold ${k.down} and press ${k.special} for your fighter’s down special.`, demo:'down'},
    {id:'air', title:'AERIAL ATTACK', hint:k=>`Jump with ${k.jump}, then press ${k.attack} in the air. Add a direction to aim.`, demo:'air'},
    {id:'shield', title:'SHIELD', hint:k=>`Hold ${k.shield} on the ground to block. Release to move again.`, demo:'shield'},
    {id:'grab', title:'GRAB', hint:k=>`Press ${k.grab} to grab. Grabs beat shields; try it near the dummy.`, demo:'grab'},
  ];
  const tetherLesson={
    id:'tether', title:'LEDGE TETHER', demo:'tether',
    hint:k=>`Run to the right edge and hold ${k.jump} + ${k.right} to jump outward. Once over open air, press ${k.up} + ${k.special} (or ${k.jump} + ${k.special}) to tether and hang. Use RESET POSITION to retry.`,
  };
  function create(match) {
    const originals=match.fighters.map(f=>({key:f.key,palIdx:f.palIdx}));
    const practiceKey=['briar','nomad'].includes(originals[0].key) ? originals[0].key : 'briar';
    const t={originals,practiceKey,lessons:[...lessons,tetherLesson], index:0, completed:false, success:0, feedback:'Try the move. You do not need to hit the dummy.', lastAction:null, demoFrame:-1, demoDir:-1};
    const rightEdge=()=>match.stage.ground.x+match.stage.ground.w;
    // The reset affects only tutorial fighters, and releases any real grab first.
    function resetFighter(f,x,y,facing,onGround) {
      if(f.grabbing && f.grabbing.grabbedBy===f) {
        f.grabbing.grabbedBy=null; f.grabbing.vineGrabbed=false;
        if(f.grabbing.state==='grabbed') { f.grabbing.state='fall'; f.grabbing.onGround=false; }
      }
      if(f.grabbedBy && f.grabbedBy.grabbing===f) f.grabbedBy.grabbing=null;
      f.resetAt(x,y,facing);f.onGround=onGround;f.onPlatform=null;f.cooldowns={};
    }
    function setIdentity(f,key,palIdx) {
      f.key=key; f.def=FIGHTERS[key];
      f.palIdx=palIdx % f.def.palettes.length; f.pal=f.def.palettes[f.palIdx];
    }
    // Restore the selected fighter when leaving practice, restarting or finishing.
    t.restoreFighters = () => {
      if(!match.fighters.some((f,i)=>f.key!==originals[i].key || f.palIdx!==originals[i].palIdx))return;
      const gd=match.stage.ground;
      match.fighters.forEach((f,i)=>setIdentity(f,originals[i].key,originals[i].palIdx));
      resetFighter(match.fighters[0],Math.max(gd.x+100,Math.min(gd.x+gd.w-100,match.fighters[0].x)),gd.y,1,true);
      resetFighter(match.fighters[1],0,gd.y,1,true);
      match.projectiles=[];match.mines=[];match.summons=[];
    };
    t.setupLedge = () => {
      if(t.lessons[t.index]?.id!=='tether') return false;
      const gd=match.stage.ground;
      match.fighters.forEach((f,i)=>setIdentity(f,practiceKey,originals[i].key===practiceKey?originals[i].palIdx:i));
      resetFighter(match.fighters[0],rightEdge()-130,gd.y,1,true);
      resetFighter(match.fighters[1],0,gd.y,1,true);
      match.projectiles=[];match.mines=[];match.summons=[];
      t.demoFrame=-1;t.tetherAttempt=null;t.lastAction=null;t.lastState=null;t.success=0;
      t.feedback=(originals[0].key===practiceKey?'':`Temporarily switched to ${FIGHTERS[practiceKey].name}. `)+'Run from START, hold jump to leap off the right edge, then use your recovery.';
      return true;
    };
    t.openLedge = () => {
      if(t.lessons[t.index]?.id!=='tether') t.returnTo={index:t.index,completed:t.completed};
      t.index=t.lessons.length-1;t.completed=false;
      return t.setupLedge();
    };
    t.backToLessons = () => {
      if(!t.returnTo)return false;
      const previous=t.returnTo;t.restoreFighters();t.returnTo=null;t.index=previous.index;t.completed=previous.completed;
      t.success=0;t.tetherAttempt=null;t.demoFrame=-1;t.lastAction=match.fighters[0].action;
      resetFighter(match.fighters[1],0,match.stage.ground.y,1,true);
      t.feedback=t.completed?'Practice freely, restart the lessons, or quit from the pause menu.':'Back to your lesson. Try the move above.';
      return true;
    };
    t.update = () => {
      const f=match.fighters[0]; if(!f || match.state!=='play')return;
      const action=f.action, fresh=action && action!==t.lastAction;
      const id=t.lessons[t.index]?.id;
      if(t.success>0){
        if(--t.success===0){
          if(id==='tether' && t.returnTo){t.backToLessons();t.feedback=t.completed?'Tether complete! Practice freely.':'Tether complete! Continue your lesson.';}
          else {if(id==='tether')t.restoreFighters();t.index++; if(t.index>=t.lessons.length){t.completed=true;t.index=t.lessons.length;} t.feedback=t.completed?'All lessons complete! Keep practicing, restart the lessons, or quit from the pause menu.':'Try the move. You do not need to hit the dummy.'; if(t.lessons[t.index]?.id==='tether')t.setupLedge();}
        }
      } else if(!t.completed) {
        // A normal up special or an ordinary ledge catch is not a tether.
        // Record the actual rope targeting the practice ledge, then require its hang.
        let tetherSuccess=false;
        if(id==='tether') {
          const pull=action && action.specialKey==='u' && action.vinePull;
          if(pull && pull.side===1 && pull.edgeX===rightEdge()) {
            t.tetherAttempt={side:pull.side,x:pull.edgeX};
            t.feedback='Tether connected! Hold on until you reach the ledge.';
          } else if(t.tetherAttempt) {
            tetherSuccess=f.state==='ledge' && f.ledge?.side===t.tetherAttempt.side && f.ledge?.x===t.tetherAttempt.x;
            t.tetherAttempt=null;
            if(!tetherSuccess)t.feedback='Tether interrupted. Reset and try again.';
          } else if(f.state==='ledge' && t.lastState!=='ledge') {
            t.feedback='That was a normal ledge grab. Reset and use your tether from farther out.';
          } else if(fresh && action?.specialKey==='u') {
            t.feedback='Recovery started. The tether needs open air near the right ledge.';
          }
        }
        const ok = id==='move' ? f.onGround && Math.abs(f.vx)>1 && (f.input.left || f.input.right)
          : id==='jump' ? f.state==='jump' || f.state==='doublejump'
          : id==='doublejump' ? f.state==='doublejump'
          : id==='jab' ? fresh && action.type==='move' && action.key==='jab'
          : id==='smash' ? fresh && action.type==='move' && /smash$/.test(action.key)
          : id==='dash' ? fresh && action.type==='move' && action.key==='dashattack'
          : id==='neutral' ? fresh && action.type==='special' && action.specialKey==='n'
          : id==='side' ? fresh && action.type==='special' && action.specialKey==='s'
          : id==='up' ? fresh && action.type==='special' && action.specialKey==='u'
          : id==='down' ? fresh && action.type==='special' && action.specialKey==='d'
          : id==='air' ? fresh && action.type==='move' && /air$/.test(action.key)
          : id==='shield' ? f.state==='shield' && f.shieldHP>0
          : id==='grab' ? fresh && action.type==='grabbing'
          : id==='tether' ? tetherSuccess : false;
        if(ok){t.feedback=id==='tether'?'NICE! Tethered and hanging from the ledge.':'NICE! Move completed.';t.success=55;AUDIO.sfx('confirm');}
        else if(fresh && (action.type==='move' || action.type==='special' || action.type==='grabbing') && id!=='tether') {
          const name=action.type==='special' ? ({n:'neutral special',s:'side special',u:'up special',d:'down special'})[action.specialKey] : action.key || 'grab';
          t.feedback=`That was ${name || 'another move'} — try the move above.`;
        }
      }
      t.lastAction=action;t.lastState=f.state;
    };
    t.startDemo = () => {
      if(t.completed || t.success>0) return false;
      const d=match.fighters[1],p=match.fighters[0], lesson=t.lessons[t.index];
      if(lesson.id==='tether') {
        if((p.state==='ledge' && p.ledge?.side===1 && p.ledge.x===rightEdge()) || p.action?.vinePull) {
          t.feedback='Release the ledge or reset your position before the demo.';return false;
        }
        const gd=match.stage.ground;
        resetFighter(d,rightEdge()+150,gd.y+125,-1,false); d.state='fall';
        t.demoDir=-1;t.demoLesson='tether';t.demoFrame=0;p.invincT=Math.max(p.invincT,150);
        t.feedback='Watch the dummy tether from offstage; it will then clear the ledge.';return true;
      }
      if(!d || !d.onGround || !d.canAct() || d.grabbedBy || d.grabbing){t.feedback='Wait for the dummy to recover, then try DEMO again.';return false;}
      d.x=p.x < 0 ? 220 : -220; d.y=match.stage.ground.y; d.vx=d.vy=0; d.facing=p.x<d.x?-1:1;
      d.readInput({}); d.inputBuffer={attack:0,special:0,jump:0,shield:0,grab:0};
      t.demoDir=d.facing;t.demoLesson=lesson.demo;t.demoFrame=0;p.invincT=Math.max(p.invincT,150);
      t.feedback='Watch the dummy demonstrate, then try it yourself.';return true;
    };
    t.demoInput = () => {
      if(t.demoFrame<0)return {};
      const n=t.demoFrame++, id=t.demoLesson;
      if(n>100){t.demoFrame=-1;return {};}
      const dir=t.demoDir<0?'left':'right', input={};
      if(id==='move' && n<22)input[dir]=true;
      if((id==='jump' || id==='doublejump') && n===1)input.jump=true;
      if(id==='doublejump' && n===12)input.jump=true;
      if(id==='jab' && n===1)input.attack=true;
      if(id==='smash' && n===1){input[dir]=true;input.attack=true;}
      if(id==='neutral' && n===1)input.special=true;
      if(id==='dash'){if(n<12)input[dir]=true;if(n===8)input.attack=true;}
      if(id==='side' && n===1){input[dir]=true;input.special=true;}
      if((id==='up' || id==='tether') && n===1){input.up=true;input.special=true;}
      if(id==='tether' && n===40)input.up=true;
      if(id==='tether' && n===55) {
        resetFighter(match.fighters[1],0,match.stage.ground.y,1,true);
        t.demoFrame=-1;return {};
      }
      if(id==='down' && n===1){input.down=true;input.special=true;}
      if(id==='air'){if(n===1)input.jump=true;if(n===12)input.attack=true;}
      if(id==='shield' && n>0 && n<30)input.shield=true;
      if(id==='grab' && n===1)input.grab=true;
      return input;
    };
    return t;
  }
  const touchHints={
    move:'Hold ◀ or ▶ to move and run.', jump:'Press JMP to jump.',
    doublejump:'Press JMP, release it, then press JMP again in the air.',
    jab:'Stand still and press A.', smash:'Tap a direction + A; hold A to charge.',
    dash:'Run with ◀ or ▶, then press A.', neutral:'Release directions and press B.',
    side:'Hold ◀ or ▶ and press B.', up:'Press ▲ + B or JMP + B.',
    down:'Press ▼ + B.', air:'Press JMP, then A in the air.',
    shield:'Hold SHD on the ground.', grab:'Press GRB to grab.',
    tether:'Hold ▶ + JMP off the edge, then press ▲ + B or JMP + B.',
  };
  function render(match) {
    const box=document.getElementById('tutorial-panel');
    if(!box)return;
    const t=match && match.tutorial;box.hidden=!t;
    if(!t)return;
    const step=t.lessons[t.index], k=Object.fromEntries(Object.entries(INPUT.map.p1).map(([key,code])=>[key,INPUT.label(code)]));
    const setText=(id,value)=>{const el=document.getElementById(id);if(el.textContent!==value)el.textContent=value;};
    setText('tutorial-progress',t.completed?'TRAINING COMPLETE':`LESSON ${t.index+1} / ${t.lessons.length}`);
    setText('tutorial-title',t.completed?'YOU’RE READY.':step.id==='tether' ? (match.fighters[0].key==='briar'?'BRIAR / VINE TETHER':'NOMAD / HOOK TETHER') : step.title);
    setText('tutorial-hint',t.completed?'Practice freely against the dummy. Open the pause menu to quit.':step.hint(k));
    setText('tutorial-touch-hint',t.completed?'TOUCH: use the on-screen buttons to keep practicing.':'TOUCH: '+touchHints[step.id]);
    setText('tutorial-character-note',!t.completed && step?.id==='tether' && t.originals[0].key!==t.practiceKey ? `Using ${FIGHTERS[t.practiceKey].name} for this lesson. ${FIGHTERS[t.originals[0].key].name} returns afterward.` : '');
    setText('tutorial-feedback',t.feedback);
    document.getElementById('tutorial-feedback').classList.toggle('success',t.success>0 || t.completed);
    document.getElementById('tutorial-demo').disabled=t.completed || t.success>0;
    const ledgeButton=document.getElementById('tutorial-ledge');
    ledgeButton.hidden=false;
    setText('tutorial-ledge',step?.id==='tether' && !t.completed?'↻ RESET POSITION':'↗ LEDGE PRACTICE');
    ledgeButton.setAttribute('aria-label',step?.id==='tether' && !t.completed?'Reset ledge practice position':'Open ledge tether practice');
    document.getElementById('tutorial-back').hidden=!t.returnTo || step?.id!=='tether';
  }
  function draw(ctx,match) {
    const t=match.tutorial,gd=match.stage.ground;
    if(!t || t.completed || t.lessons[t.index]?.id!=='tether')return;
    const edge=gd.x+gd.w, start=edge-130;
    ctx.save();ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.lineWidth=4;
    ctx.strokeStyle='#142133';ctx.fillStyle='#ffe36c';
    ctx.strokeText('START',start,gd.y-115);ctx.fillText('START',start,gd.y-115);
    ctx.beginPath();ctx.moveTo(start,gd.y-106);ctx.lineTo(start,gd.y-65);ctx.stroke();
    ctx.strokeText('LEDGE →',edge-45,gd.y-32);ctx.fillText('LEDGE →',edge-45,gd.y-32);
    ctx.restore();
  }
  return {create,render,draw,lessons,touchHints};
})();
