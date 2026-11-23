/* Render-only buffering for authoritative snapshots. No combat is simulated here. */
'use strict';
const OnlinePresentation = (() => {
  const TICK_MS=1000/60, DELAY=3, MAX_SNAPSHOTS=120;
  const lerp=(a,b,t)=>a+(b-a)*t;
  const finite=(a,b)=>Number.isFinite(a) && Number.isFinite(b);
  function createBuffer() {
    let queue=[], playhead=null, lastNow=null, ready=false;
    function reset(){queue=[];playhead=null;lastNow=null;ready=false;}
    function push(snapshot){
      if(!snapshot || !Number.isFinite(snapshot.frame) || (queue.length && snapshot.frame<=queue[queue.length-1].frame)) return false;
      queue.push(snapshot);
      if(queue.length>MAX_SNAPSHOTS)queue.splice(0,queue.length-MAX_SNAPSHOTS);
      if(playhead!==null && playhead<queue[0].frame)playhead=queue[0].frame;
      return true;
    }
    function sample(now){
      if(!queue.length || !Number.isFinite(now))return null;
      const first=queue[0], latest=queue[queue.length-1];
      if(playhead===null)playhead=first.frame;
      if(!ready && latest.frame-first.frame>=DELAY){ready=true;lastNow=now;}
      if(ready && lastNow!==null){
        const elapsed=Math.max(0,now-lastNow);
        // Returning from a suspended tab should not replay seconds of stale action.
        if(elapsed>750) playhead=Math.max(playhead,first.frame,latest.frame-DELAY);
        else {
          const behind=latest.frame-DELAY-playhead;
          const rate=Math.max(.8,Math.min(1.2,1+behind*.06));
          playhead=Math.min(latest.frame,playhead+elapsed/TICK_MS*rate);
        }
      }
      lastNow=now;
      while(queue.length>2 && queue[1].frame<=playhead)queue.shift();
      const a=queue[0], b=queue[1];
      const t=b ? Math.max(0,Math.min(1,(playhead-a.frame)/(b.frame-a.frame))) : 0;
      return {a,b:b||null,t,frame:playhead};
    }
    return {push,sample,reset};
  }
  // A KO, respawn, ledge snap or teleport must not be drawn as a long slide.
  function fighterCanBlend(a,b,frames){
    if(!a || !b || a.stocks!==b.stocks || a.eliminated!==b.eliminated || a.hitlag || b.hitlag) return false;
    if((a.state==='respawn')!==(b.state==='respawn') || (a.state==='ledge')!==(b.state==='ledge')) return false;
    if(a.state==='ledge' && (a.ledge?.x!==b.ledge?.x || a.ledge?.side!==b.ledge?.side)) return false;
    if(!finite(a.x,b.x) || !finite(a.y,b.y)) return false;
    return Math.hypot(b.x-a.x,b.y-a.y)<=Math.max(120,frames*70);
  }
  function fields(a,b,t,names){
    const out={...a};
    if(b)for(const k of names)if(finite(a[k],b[k]))out[k]=lerp(a[k],b[k],t);
    return out;
  }
  function byId(a,b,t,names){
    const next=new Map((b||[]).filter(x=>x.netId!==undefined).map(x=>[x.netId,x]));
    return (a||[]).map(x=>fields(x,x.netId!==undefined?next.get(x.netId):null,t,names));
  }
  function interpolate(sample){
    if(!sample)return null;
    const {a,b,t}=sample;
    if(!b || t<=0)return a;
    if(t>=1)return b;
    // Missing many snapshots is a discontinuity, not a path to invent.
    if(b.frame-a.frame>8)return a;
    const frames=b.frame-a.frame, out={...a};
    out.frame=Math.floor(lerp(a.frame,b.frame,t));
    if(finite(a.time,b.time))out.time=lerp(a.time,b.time,t);
    out.fighters=(a.fighters||[]).map((f,i)=>{
      const n=b.fighters && b.fighters[i];
      const ok=fighterCanBlend(f,n,frames);
      const v=fields(f,ok?n:null,t,['x','y']);
      // Advance animation clocks only inside the same uninterrupted state.
      if(ok && f.state===n.state && !f.hitlag && !n.hitlag) {
        for(const key of ['animT','stateT','actionT'])
          if(finite(f[key],n[key]) && n[key]>=f[key])v[key]=Math.floor(lerp(f[key],n[key],t));
      }
      return v;
    });
    out.platforms=(a.platforms||[]).map((p,i)=>{
      const n=b.platforms && b.platforms[i];
      return fields(p,n && a.stageForm===b.stageForm && p.active===n.active?n:null,t,['x','y','cx','cy']);
    });
    for(const key of ['items','projectiles','mines','summons'])out[key]=byId(a[key],b[key],t,['x','y','rot']);
    out.fx={};
    for(const key of ['parts','texts','rings','arcs','lines'])out.fx[key]=byId(a.fx?.[key],b.fx?.[key],t,['x','y','x1','x2','y1','y2','t','rot']);
    if(a.stageHazard && b.stageHazard && a.stageHazard.type===b.stageHazard.type)
      out.stageHazard=fields(a.stageHazard,b.stageHazard,t,['y']);
    return out;
  }
  return {createBuffer,interpolate};
})();
if(typeof module!=='undefined' && module.exports)module.exports=OnlinePresentation;
