'use strict';
const assert=require('assert');
const {WebSocket}=require('ws');
const {createServer,snapshot}=require('../server/server');
const {boot,cast,newMatch,control}=require('./harness');
const {once}=require('events');
async function main(){
 const h=boot(), stage=newMatch(h.ctx,cast(1,['valor']),'townandcity',{rules:{hazards:true,items:'none'}});control(stage).tick(1);assert(snapshot(stage).platforms.some(p=>p.active===false),'snapshot must include inactive platforms');
 const form=newMatch(h.ctx,cast(1,['valor']),'pokemonstadium2',{rules:{hazards:true,items:'none'}});form.frame=1799;form.update();assert.equal(snapshot(form).stageForm,'electric');
 const acid=newMatch(h.ctx,cast(1,['valor']),'brinstar',{rules:{hazards:true,items:'none'}});acid.frame=560;acid.updateHazards();const acidSnap=JSON.parse(JSON.stringify(snapshot(acid)));assert.equal(acidSnap.stageMechanic.strike.type,'meteor');assert(Number.isFinite(acidSnap.stageHazard.y));
 const app=createServer({selectionMs:100});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const url=`ws://127.0.0.1:${app.server.address().port}/online`;
 const peers=[];
 async function peer(){const ws=new WebSocket(url);const q=[];ws.on('message',b=>q.push(JSON.parse(b)));await once(ws,'open');const p={ws,q,send:x=>ws.send(JSON.stringify(x)),async wait(type,pred=()=>true,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){const i=q.findIndex(x=>x.type===type&&pred(x));if(i>=0)return q.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error(`timeout waiting ${type}: ${JSON.stringify(q.slice(-3))}`);}};peers.push(p);return p;}
 try {
 const a=await peer(), b=await peer(), c=await peer(),d=await peer(),e=await peer();
 a.send({type:'create'});let ar=await a.wait('room');assert.equal(ar.players.length,1);let code=ar.code;
 b.send({type:'join',code});let br=await b.wait('room');assert.equal(br.players.length,2);
 c.send({type:'join',code});await c.wait('room');d.send({type:'join',code});await d.wait('room');e.send({type:'join',code});assert.match((await e.wait('error')).message,/full/i);
 b.send({type:'character',key:'briar'});await a.wait('room',x=>x.players.some(p=>p.id===br.id&&p.character==='briar'));
 b.send({type:'palette',index:3});await a.wait('room',x=>x.players.some(p=>p.id===br.id&&p.palIdx===3));
 b.send({type:'hazards',enabled:true});await new Promise(r=>setTimeout(r,30));assert.equal(app.rooms.get(code).hazards,false,'guest changed hazards');
 a.send({type:'hazards',enabled:true});await b.wait('room',x=>x.hazards===true);
 b.send({type:'stage',key:'field'});b.send({type:'start'});await new Promise(r=>setTimeout(r,60));assert(!b.q.some(x=>x.type==='start'));
 a.send({type:'stage',key:'tortimerisland'});await b.wait('room',x=>x.stage==='tortimerisland');a.send({type:'start'});let start=await b.wait('start');assert.equal(start.stage,'tortimerisland');assert.equal(start.rules.hazards,true);assert.equal(start.cast.length,4);assert.equal(start.cast[1].key,'briar');assert.equal(start.cast[1].palIdx,3);
 let before=await b.wait('snapshot');assert.equal(before.data.fighters.length,4);assert.equal(before.data.stageForm,'normal');a.send({type:'input',mask:2});await new Promise(r=>setTimeout(r,2200));let after=await b.wait('snapshot',x=>x.data.frame>115);assert(after.data.fighters[0].x>before.data.fighters[0].x,'remote movement should be simulated by server');
 app.rooms.get(code).match.frame=359;const withFruit=await b.wait('snapshot',x=>x.data.items && x.data.items.some(it=>it.stageFruit));assert.equal(withFruit.data.items[0].type,'food');
 // Finish a real simulated match, return to the same room, and rematch.
 app.rooms.get(code).match.endMatch();
 await b.wait('room',x=>x.phase==='results');
 a.send({type:'return_room'});b.send({type:'return_room'});
 await a.wait('room',x=>x.phase==='lobby'&&x.code===code&&x.players.length===4&&x.players.filter(p=>p.inLobby).length===2);
 a.send({type:'start'});await new Promise(r=>setTimeout(r,100));assert.equal(app.rooms.get(code).phase,'lobby','cannot start while players are viewing results');
 c.send({type:'return_room'});d.send({type:'return_room'});
 await a.wait('room',x=>x.phase==='lobby'&&x.players.every(p=>p.inLobby));
 a.send({type:'stage',key:'minecraftworld'});await b.wait('room',x=>x.stage==='minecraftworld');a.send({type:'start'});start=await b.wait('start');assert.equal(start.stage,'minecraftworld');assert.equal(start.cast.length,4);assert.equal(start.rules.hazards,true);
 const live=app.rooms.get(code).match;live.state='play';const falling=live.fighters[0];
 falling.x=0;falling.y=-10;falling.vy=12;falling.vx=0;falling.state='fall';falling.onGround=false;falling.onPlatform=null;
 const gapSnap=await b.wait('snapshot',x=>x.data.fighters[0].y>10 && x.data.fighters[0].x===0);assert(gapSnap.data.fighters[0].y>10,'online fighter did not fall through gap');
 // A guest leaving mid-round returns the rest to the room, but the host closes it.
 d.send({type:'leave'});assert.match((await a.wait('round_aborted')).message,/Player 4 left/);
 await b.wait('room',x=>x.phase==='lobby'&&x.code===code&&x.players.length===3);
 a.ws.close();assert.match((await b.wait('ended')).message,/host disconnected.*closed/i);
 b.send({type:'queue'});await b.wait('waiting');c.send({type:'queue'});await b.wait('room',x=>x.mode==='queue'&&x.players.length===2);await c.wait('room',x=>x.mode==='queue'&&x.players.length===2);
 b.send({type:'stage_preview',key:'field'});await c.wait('room',x=>x.players.some(p=>p.stageChoice==='field'&&!p.vote));
 b.send({type:'vote',key:'field'});await c.wait('room',x=>x.players.some(p=>p.vote==='field'));c.send({type:'vote',key:'field'});const selection=await b.wait('room',x=>x.phase==='select');assert.equal(selection.stage,'field');b.send({type:'character',key:'nomad'});await b.wait('room',x=>x.phase==='select'&&x.players.some(p=>p.id===x.id&&p.character==='nomad'));start=await b.wait('start');assert.equal(start.cast[0].key,'nomad');assert.equal(start.rules.hazards,false,'queue must keep hazards off');await b.wait('snapshot');c.ws.close();await b.wait('ended');
 const res=await fetch(`http://127.0.0.1:${app.server.address().port}/`);assert.equal(res.status,200);assert.match(await res.text(),/ONLINE/);
 const art=await fetch(`http://127.0.0.1:${app.server.address().port}/assets/stages/kof.jpg`);assert.equal(art.status,200);assert.match(art.headers.get('content-type'),/image\/jpeg/);
 console.log('online integration: rooms, permissions, capacity, authoritative movement, queue vote, timed selection and disconnect passed');
 } finally {for(const p of peers)p.ws.terminate();await new Promise(r=>app.server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
