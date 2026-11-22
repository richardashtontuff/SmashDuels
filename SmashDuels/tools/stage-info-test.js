'use strict';
// Dependency-free interaction test for the shared dialog. The selector wiring
// is also exercised by the two-client browser DOM smoke test.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const handlers = {};
const nodes = {};
const doc = {
  activeElement: null,
  getElementById(id) { return nodes[id]; },
  addEventListener(type, fn) { handlers[type] = fn; },
};
function node(id) {
  return nodes[id] = { hidden:false, textContent:'', isConnected:true, events:{},
    addEventListener(type, fn) { this.events[type] = fn; },
    focus() { doc.activeElement = this; },
  };
}
for (const id of ['app','stage-info-dialog','stage-info-close','stage-info-title','stage-info-size','stage-info-about','stage-info-perk','stage-info-hazards']) node(id);
const dialog = nodes['stage-info-dialog']; dialog.hidden = true;
const panel = node('panel'); dialog.querySelector = () => panel;
const context = vm.createContext({document:doc, STAGES:{demo:{name:'DEMO',size:'XL'}}, STAGE_INFO:{demo:{about:'Arena',perk:'Ability',hazards:'Hazard guidance'}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../game/js/stage-info.js'),'utf8'),context);
const trigger = node('trigger');
context.trigger = trigger;
vm.runInContext("StageInfo.open('demo', trigger)",context);
assert(!dialog.hidden && nodes.app.inert && doc.activeElement===nodes['stage-info-close']);
assert.equal(nodes['stage-info-title'].textContent,'DEMO');
assert.equal(nodes['stage-info-size'].textContent,'XL ARENA');
assert.equal(nodes['stage-info-hazards'].textContent,'Hazard guidance');
let prevented=false, stopped=false;
handlers.keydown({key:'Tab',preventDefault(){prevented=true;}});
assert(prevented && doc.activeElement===panel);
handlers.keydown({key:'Tab',preventDefault(){}});
assert(doc.activeElement===nodes['stage-info-close']);
handlers.keydown({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
assert(stopped && dialog.hidden && !nodes.app.inert && doc.activeElement===trigger);
vm.runInContext("StageInfo.open('demo', trigger)",context);
nodes['stage-info-close'].events.click();
assert(dialog.hidden && doc.activeElement===trigger);
vm.runInContext("StageInfo.open('demo', trigger)",context);
dialog.events.click({target:dialog});
assert(dialog.hidden && doc.activeElement===trigger);
console.log('Stage info dialog: open, content, focus trap, Escape, close and backdrop passed.');
