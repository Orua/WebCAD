import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {snapReleasedDrag} from '../src/viewport/drag-snap-controller.js';
test('physical drag threshold uses exact finite BRep boundaries and respects axis, hidden targets and free fine adjustment',async()=>{
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
 try{
  await kernel.rebuild({version:2,features:[{id:'a',op:'box',params:{width:10,depth:10,height:10},refs:[]},{id:'b',op:'box',params:{width:10,depth:10,height:10},refs:[]},{id:'target',op:'transform',params:{x:20,y:0,z:0},refs:['b']}],imports:{}});
  const snap=kernel.dragSnap({bodyId:'a',translation:[9.85,0,0],targetIds:['target'],thresholdMm:.2,axis:'X'});
  assert.ok(Math.abs(snap.distanceMm-.15)<1e-6);assert.ok(Math.abs(snap.delta[0]-.15)<1e-6);
  assert.equal(kernel.dragSnap({bodyId:'a',translation:[9.79,0,0],targetIds:['target'],thresholdMm:.2,axis:'X'}),null);
  assert.equal(kernel.dragSnap({bodyId:'a',translation:[9.85,0,0],targetIds:['target'],thresholdMm:.2,axis:'Y'}),null);
  const face=kernel.dragSnap({pointWorld:[25,5,10.15],targetIds:['target'],thresholdMm:.2,axis:'Z'});assert.ok(Math.abs(face.to[2]-10)<1e-6);
  const edge=kernel.dragSnap({pointWorld:[25,-.1,10.1],targetIds:['target'],thresholdMm:.2});assert.deepEqual(edge.to,[25,0,10]);
  const point=kernel.dragSnap({pointWorld:[19.9,-.1,-.1],targetIds:['target'],thresholdMm:.2});assert.deepEqual(point.to,[20,0,0]);
  assert.equal(kernel.dragSnap({pointWorld:[25,5,10.15],targetIds:['target'],thresholdMm:0}),null);
  let calls=0;const viewport={snapEnabled:true,displayPreferences:{snapThresholdMm:.2},objects:new Map([['a',{root:{visible:true}}],['target',{root:{visible:true}}],['hidden',{root:{visible:false}}]]),callbacks:{onDragSnap:input=>{calls++;assert.deepEqual(input.targetIds,['target']);return snap;}}};
  assert.equal(await snapReleasedDrag(viewport,{bodyId:'a',translation:[9.85,0,0],skip:true}),null);assert.equal(calls,0);
  assert.equal(await snapReleasedDrag(viewport,{bodyId:'a',translation:[9.85,0,0]}),snap);assert.equal(calls,1);
 }finally{kernel.dispose();}
});
