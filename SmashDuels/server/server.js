'use strict';
// A single-process, authoritative online match server. See ONLINE.md for the
// deployment limitations of in-memory rooms on Wasmer Edge.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const vm = require('vm');
const { boot, cast, newMatch } = require('../tools/harness');
const root = path.resolve(__dirname, '../game');
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon'};
const KEYS = ['left','right','up','down','attack','special','jump','shield','grab'];
const fighterFields = ['x','y','vx','vy','state','stateT','animT','actionT','action','facing','damage','stocks','eliminated','stats','buffs','invincT','spawnProtect','respawnT','ledgeInvuln','ledge','hitlag','hitT','stunT','dashT','rollDir','groundDist','shakeX','shakeY','shieldHP','charging','chargeT','tauntIdx','hasSmashBall','finalActive','vineGrabbed','fastfalled','onGround'];
const projectileFields = ['x','y','vx','vy','damage','bkb','kbs','angle','life','color','size','kind','t','rot','fadeFrames','chargePower','dead'];
const copyFields = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k,o[k]]));
function snapshot(m) {
  return {frame:m.frame,time:m.time,state:m.state,stateT:m.stateT,overT:m.overT,announcement:m.announcement,
    fighters:m.fighters.map(f=>({...copyFields(f,fighterFields),grabbing:f.grabbing ? f.grabbing.id : null})),
    projectiles:m.projectiles.map(p=>copyFields(p,projectileFields)),
    mines:m.mines.map(p=>copyFields(p,['x','y','t','life','dead'])),
    summons:m.summons.map(p=>copyFields(p,['x','y','t','life','kind','facing','dead'])),
    platforms:m.stage.platforms.map(p=>({x:p.x,y:p.y,cx:p.cx,cy:p.cy,dx:p.dx,dy:p.dy})),
    fx:{parts:m.fx.parts, texts:m.fx.texts, rings:m.fx.rings, arcs:m.fx.arcs, lines:m.fx.lines},
    winner:m.winner ? m.winner.map(f=>f.id) : null};
}
function createServer(options={}) {
  const registry=boot();
  const fighters=Object.keys(registry.g.FIGHTERS), stages=Object.keys(registry.g.STAGES);
  const rooms=new Map(), peers=new Set(); let waiting=null;
  const selectionMs=options.selectionMs || 10000;
  const server=http.createServer((req,res)=>{
    if(req.method!=='GET' && req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    let name;try{name=decodeURIComponent(new URL(req.url,'http://local').pathname)}catch{res.writeHead(400);res.end();return;}
    if(name==='/healthz'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"ok":true}');return;}
    const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    fs.stat(file,(err,st)=>{if(err||!st.isFile()){res.writeHead(404);res.end('Not found');return;}
      res.writeHead(200,{'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
    });
  });
  const wss=new WebSocketServer({server,path:'/online',maxPayload:65536,perMessageDeflate:false});
  const send=(p,msg)=>{if(p.ws.readyState===WebSocket.OPEN && p.ws.bufferedAmount<1024*1024)p.ws.send(JSON.stringify(msg));};
  const notify=(room,msg)=>room.players.forEach(p=>send(p,msg));
  function state(room) { for(const p of room.players)send(p,{type:'room',id:p.id,mode:room.mode,code:room.code,host:room.host.id,phase:room.phase,stage:room.stage,deadline:room.deadline||null,players:room.players.map(x=>({id:x.id,character:x.character,palIdx:x.palIdx,inLobby:x.inLobby,vote:x.vote||null,stageChoice:x.stageChoice||null}))}); }
  function makeRoom(mode,p) {
    let code;do{code=crypto.randomBytes(5).toString('hex').slice(0,6).toUpperCase()}while(rooms.has(code));
    const room={code,mode,players:[],host:p,phase:mode==='queue'?'voting':'lobby',stage:'skyshrine',timer:null,tick:null};rooms.set(code,room);join(room,p);return room;
  }
  function join(room,p){
    p.room=room;p.vote=null;p.stageChoice='skyshrine';p.palIdx=room.players.length%6;p.inLobby=true;
    room.players.push(p);
    if(room.players.length>1)notify(room,{type:'notice',message:`Player ${room.players.length} joined the ${room.mode==='queue'?'match':'room'}.`});
    state(room);
  }
  function stopTick(room){if(room.timer)clearTimeout(room.timer);if(room.tick)clearInterval(room.tick);room.timer=null;room.tick=null;room.match=null;}
  function stop(room){stopTick(room);rooms.delete(room.code);room.players.forEach(p=>p.room=null);room.players=[];}
  function leave(p,disconnected=false) {
    if(waiting===p)waiting=null;
    const room=p.room;if(!room)return;
    const index=room.players.indexOf(p), host=room.host===p;
    const verb=disconnected?'disconnected':'left';
    p.room=null;room.players=room.players.filter(x=>x!==p);
    if(!room.players.length){stop(room);return;}
    if(room.mode==='queue') {notify(room,{type:'ended',message:`Your opponent ${verb}. The match has ended.`});stop(room);return;}
    if(host) {notify(room,{type:'ended',message:`The host ${verb}. The room has closed.`});stop(room);return;}
    const message=`Player ${index+1} ${verb}.`;
    if(room.phase==='playing') {
      stopTick(room);room.phase='lobby';room.deadline=null;
      room.players.forEach(x=>{x.inLobby=true;x.mask=0;x.pending=0;});
      notify(room,{type:'round_aborted',message:message+' The round ended; you are back in the room.'});
    } else notify(room,{type:'notice',message});
    state(room);
  }
  function launch(room) {
    if(room.players.length<2||room.phase!==(room.mode==='queue'?'select':'lobby') || (room.mode==='private' && !room.players.every(p=>p.inLobby)))return;
    room.players.forEach(p=>{p.inLobby=false;p.mask=0;p.pending=0;});
    room.phase='playing';room.deadline=null;if(room.timer)clearTimeout(room.timer);
    const h=boot();vm.runInContext("SAVE.data={stats:{},coins:0,matches:0,challengesDone:[],records:{},settings:{}};SAVE.save=()=>{}",h.ctx);
    const choices=room.players.map(p=>p.character);
    const list=cast(choices.length,choices).map((c,i)=>({...c,palIdx:room.players[i].palIdx,isCPU:false,team:i,label:'P'+(i+1)}));
    const m=newMatch(h.ctx,list,room.stage,{rules:{items:'none',hazards:false,stocks:3,mode:'stock'}});m.state='intro';room.match=m;
    m.readPlayerInput=f=>{const p=room.players[f.id];if(!p)return {};const bits=p.mask|p.pending;p.pending=0;return Object.fromEntries(KEYS.map((k,i)=>[k,!!(bits&(1<<i))]));};
    notify(room,{type:'start',stage:room.stage,cast:list,rules:{items:'none',hazards:false,stocks:3,mode:'stock',teams:false,damageRatio:1,time:150}});notify(room,{type:'notice',message:'Round started!'});state(room);
    let count=0;
    room.tick=setInterval(()=>{
      try {
        m.update();
        if(m.state==='over' && room.phase==='playing') {
          room.phase='results';notify(room,{type:'notice',message:'Round complete.'});state(room);
        }
        if(++count%2===0)notify(room,{type:'snapshot',data:snapshot(m)});
        if(m.state==='over' && m.overT>100) {
          stopTick(room);
          if(room.mode==='private'){room.phase='lobby';state(room);}
          else stop(room);
        }
      }
      catch(err){console.error('match failed',err);notify(room,{type:'ended',message:'Match ended due to a server error.'});stop(room);}
    },1000/60);
  }
  function message(p,msg) {
    if(!msg||typeof msg!=='object'||Array.isArray(msg))return;
    if(msg.type==='leave'){leave(p,false);return;}
    if(msg.type==='queue'){
      if(p.room||waiting===p)return;
      if(waiting && waiting.ws.readyState===WebSocket.OPEN && waiting!==p) {const other=waiting;waiting=null;const room=makeRoom('queue',other);join(room,p);}
      else {waiting=p;send(p,{type:'waiting'});} return;
    }
    if(msg.type==='create'){if(p.room||waiting===p)return;makeRoom('private',p);return;}
    if(msg.type==='join'){
      if(p.room||waiting===p)return;const code=typeof msg.code==='string'?msg.code.toUpperCase().trim():'';const room=rooms.get(code);
      if(!room||room.mode!=='private'||room.phase!=='lobby'){send(p,{type:'error',message:'Room not found or already in a match.'});return;}
      if(room.players.length>=4){send(p,{type:'error',message:'This room is full.'});return;}join(room,p);return;
    }
    const room=p.room;if(!room)return;
    if(msg.type==='return_room' && room.mode==='private' && (room.phase==='results'||room.phase==='lobby') && !p.inLobby){
      p.inLobby=true;p.mask=0;p.pending=0;notify(room,{type:'notice',message:`Player ${room.players.indexOf(p)+1} returned to the room.`});state(room);return;
    }
    if(room.mode==='private' && !p.inLobby && room.phase!=='playing')return;
    if(msg.type==='character' && (room.phase==='lobby'||room.phase==='select') && fighters.includes(msg.key)){p.character=msg.key;p.palIdx=0;state(room);return;}
    if(msg.type==='palette' && (room.phase==='lobby'||room.phase==='select') && Number.isInteger(msg.index) && msg.index>=0 && msg.index<registry.g.FIGHTERS[p.character].palettes.length){p.palIdx=msg.index;state(room);return;}
    if(msg.type==='stage' && room.mode==='private' && room.phase==='lobby' && room.host===p && stages.includes(msg.key)){room.stage=msg.key;state(room);return;}
    if(msg.type==='stage_preview' && room.mode==='queue' && room.phase==='voting' && !p.vote && stages.includes(msg.key)){p.stageChoice=msg.key;state(room);return;}
    if(msg.type==='vote' && room.mode==='queue' && room.phase==='voting' && room.players.length===2 && stages.includes(msg.key)){
      if(p.vote)return;
      p.stageChoice=msg.key;p.vote=msg.key;
      if(room.players.every(x=>x.vote)){
        const votes=room.players.map(x=>x.vote);room.stage=votes[crypto.randomInt(votes.length)];room.phase='select';room.deadline=Date.now()+selectionMs;
        room.timer=setTimeout(()=>launch(room),selectionMs);
        notify(room,{type:'notice',message:'Stage selected. Choose your fighter!'});
      }
      state(room);return;
    }
    if(msg.type==='start' && room.mode==='private' && room.phase==='lobby' && room.host===p){launch(room);return;}
    if(msg.type==='input' && room.phase==='playing' && Number.isInteger(msg.mask) && msg.mask>=0 && msg.mask<512){p.pending|=msg.mask&~p.mask;p.mask=msg.mask;}
  }
  wss.on('connection',ws=>{
    const p={id:crypto.randomUUID(),ws,character:'valor',room:null,mask:0,pending:0,rate:0,rateAt:Date.now(),alive:true};peers.add(p);
    ws.on('pong',()=>p.alive=true);
    ws.on('message',raw=>{const now=Date.now();if(now-p.rateAt>1000){p.rate=0;p.rateAt=now;}if(++p.rate>150){ws.close(1008,'Rate limit');return;}let msg;try{msg=JSON.parse(raw.toString())}catch{return;}message(p,msg);});
    ws.on('close',()=>{leave(p,true);peers.delete(p);});ws.on('error',()=>{});send(p,{type:'hello'});
  });
  const heartbeat=setInterval(()=>{for(const p of peers){if(!p.alive){p.ws.terminate();continue;}p.alive=false;p.ws.ping();}},15000);
  server.on('close',()=>{clearInterval(heartbeat);for(const room of rooms.values())stop(room);wss.close();});
  return {server,wss,rooms};
}
if(require.main===module){const port=Number(process.env.PORT)||8080;const {server}=createServer();server.listen(port,'0.0.0.0',()=>console.log(`Rift Rumble online server listening on ${port}`));}
module.exports={createServer,snapshot};
