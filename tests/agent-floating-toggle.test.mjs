import test from 'node:test';
import assert from 'node:assert/strict';
import {createFloatingToggle,validateFloatingPosition} from '../src/agent/floating-toggle.js';

test('floating toggle clamps position, separates drag from click and keeps cancellation inert',()=>{
  const before={document:globalThis.document,ResizeObserver:globalThis.ResizeObserver};
  const handlers={},classes=new Set(),status={};let opened=0,moved=0,resize;
  const button={dataset:{},style:{},offsetWidth:136,offsetHeight:56,setAttribute(){},setPointerCapture(){},querySelector:()=>status,addEventListener:(name,handler)=>handlers[name]=handler,classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)},remove(){}};
  const root={clientWidth:800,clientHeight:500,append(){}};
  globalThis.document={createElement:()=>button};globalThis.ResizeObserver=class{constructor(callback){resize=callback;}observe(){}disconnect(){}};
  const event=(patch={})=>({button:0,pointerId:1,clientX:100,clientY:100,detail:1,preventDefault(){},stopPropagation(){},...patch});
  try{
    const floating=createFloatingToggle({root,onOpen:()=>opened++,onMove:()=>moved++});
    floating.sync({visible:true,activity:'thinking'});
    assert.equal(button.dataset.hostControlAllowed,'true');assert.equal(floating.get().visible,true);assert.ok(button.innerHTML.includes('agent-robot-eyes'));assert.ok(!button.innerHTML.includes('agent-floating-copy'));assert.ok(!button.innerHTML.includes('点击展开对话'));
    floating.setPosition({xPx:100000,yPx:100000});assert.deepEqual(floating.get().position,{xPx:656,yPx:436});
    floating.setPosition({xPx:100,yPx:100});
    handlers.pointerdown(event());handlers.pointermove(event({clientX:102,clientY:101}));handlers.pointerup(event());handlers.click(event());assert.equal(opened,1);
    handlers.pointerdown(event());handlers.pointermove(event({clientX:180,clientY:160}));handlers.pointerup(event());handlers.click(event());
    assert.equal(opened,1);assert.equal(moved,1);assert.deepEqual(floating.get().position,{xPx:180,yPx:160});
    handlers.pointerdown(event());handlers.pointercancel(event());handlers.click(event());assert.equal(opened,1);
    handlers.click(event({detail:0}));assert.equal(opened,2);
    handlers.keydown(event({key:'ArrowLeft'}));assert.deepEqual(floating.get().position,{xPx:164,yPx:160});
    root.clientWidth=260;root.clientHeight=160;resize();assert.deepEqual(floating.get().position,{xPx:116,yPx:96});
    for(const activity of ['idle','working','offline','connecting']){floating.sync({visible:true,activity});assert.equal(floating.get().visible,false,activity+' must not show a thinking robot');}
    floating.sync({visible:true,activity:'thinking'});assert.equal(floating.get().visible,true);
    floating.sync({visible:false,activity:'thinking'});assert.equal(floating.get().visible,false);floating.destroy();
  }finally{for(const [key,value]of Object.entries(before))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});

test('floating coordinates reject malformed values before layout mutation',()=>{
  for(const position of [null,[],{}, {xPx:-1,yPx:0},{xPx:NaN,yPx:1},{xPx:0,yPx:Infinity},{xPx:1,yPx:1,z:2}])assert.throws(()=>validateFloatingPosition(position),{code:'PARAM_SCHEMA_INVALID'});
  assert.deepEqual(validateFloatingPosition({xPx:0,yPx:100000}),{xPx:0,yPx:100000});
});
