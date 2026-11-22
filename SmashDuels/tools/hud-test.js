'use strict';
// Exercise the real match HUD with a lightweight DOM; rendering is suppressed.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {boot, cast, GAME} = require('./harness');

const h = boot();
const nodes = {};
let nextFrame;
function node() {
  const el = {dataset:{}, style:{setProperty(k,v){this[k]=v;}}, children:[], textContent:'', hidden:false,
    classList:{add(){},remove(){},toggle(){}}, setAttribute(k,v){this[k]=v;},
    appendChild(child){this.children.push(child);if(child.id) nodes[child.id]=child;},
    querySelector(s){return this.parts && this.parts[s];},
  };
  Object.defineProperty(el,'innerHTML',{get(){return this.html || '';},set(html){
    this.html=html;this.children=[];
    if (html.includes('class="hud-dmg"')) {
      this.parts={'.pct':node(),'.hud-stocks':node(),'.damage-fill':node(),'.hud-ready':node()};
      this.parts['.hud-ready'].hidden=true;
    }
  }});
  return el;
}
for(const id of ['hud','hud-slots','hud-timer','stage-name']) nodes[id]=node();
const timerSmall=node(),timerSpan=node();
h.sandbox.document.querySelector = s => s==='#hud-timer small' ? timerSmall : s==='#hud-timer span' ? timerSpan : nodes[s.slice(1)];
h.sandbox.document.getElementById = id => nodes[id];
h.sandbox.document.createElement = () => node();
h.sandbox.requestAnimationFrame = cb => {nextFrame=cb;return 1;};
h.sandbox.cancelAnimationFrame = () => {};
h.sandbox.Online = {playing:false,leave(){}};
let source=fs.readFileSync(path.join(GAME,'js/ui.js'),'utf8');
// Keep the actual update loop and HUD logic, but skip canvas rendering.
source=source.replace('function render(alpha) {','function render(alpha) { return;');
vm.runInContext(source,h.ctx,{filename:'js/ui.js'});
vm.runInContext('UI.show=()=>{}; UI.showPause=()=>{};',h.ctx);
const Game=vm.runInContext('Game',h.ctx);
Game.init({style:{},getContext(){return {};}});
for (const count of [2,4]) {
  Game.startMatch({rules:Object.assign({},h.g.DEFAULT_RULES,{items:'none',stocks:3}),cast:cast(count,['valor','grim']),stageKey:'battlefield'});
  assert.equal(nodes['hud-slots'].children.length,count);
  assert.equal(nodes['hud-slots'].dataset.count,count);
  assert(nodes['hud-slots'].children.every(card=>card.html.includes('hud-meter') && card.html.includes('hud-ready')));
  const fighter=Game.getMatch().fighters[0];fighter.damage=125;fighter.stocks=2;fighter.hasSmashBall=true;
  // updateHUD runs every third frame, independent of the rendering mock.
  for(let i=0;i<4;i++) nextFrame(performance.now());
  const card=nodes['hud-0'];
  assert.equal(card.parts['.pct'].textContent,125);
  assert.equal(card.parts['.damage-fill'].style.width,'62.5%');
  assert.equal(card.parts['.hud-stocks']['aria-label'],'2 stocks');
  assert.equal(card.parts['.hud-ready'].hidden,false);
  fighter.hasSmashBall=false;
  for(let i=0;i<4;i++) nextFrame(performance.now());
  assert.equal(card.parts['.hud-ready'].hidden,true);
}
const css=fs.readFileSync(path.join(GAME,'css/style.css'),'utf8');
const html=fs.readFileSync(path.join(GAME,'index.html'),'utf8');
assert(css.includes('bottom: max(4px, env(safe-area-inset-bottom, 0px))'));
assert(!/bottom:\s*230px/.test(css));
assert(css.includes('translateY(calc(-48px - env(safe-area-inset-bottom, 0px)))'));
assert(css.includes('#hud-slots[data-count="4"]'));
assert(!html.includes('id="hud-matchup"'));
console.log('HUD: bottom positioning, touch spacing, 2/4-player damage, stocks and Smash readiness passed.');
