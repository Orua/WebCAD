import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {createReferenceSystem,resolvePlacement} from '../src/work-frame.js';

test('fully constrained axis alignment moves an actual solid to the declared point and axes',async()=>{
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
 try{
  const params={mode:'align',sourcePoint:[5,5,0],sourceAxis:[0,0,1],sourceUp:[1,0,0],targetPoint:[100,50,0],targetAxis:[1,0,0],targetUp:[0,1,0],axisRelation:'same',gapMm:0,twistAngleDeg:0};
  const placement=resolvePlacement({version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}},createReferenceSystem(),'transform',params);
  const result=await kernel.rebuild({version:2,features:[{id:'source',op:'box',params:{width:10,depth:10,height:2},refs:[]},{id:'aligned',op:'transform',params,refs:['source'],placement}],imports:{}});
  const bounds=result.bodies[0].bounds;
  for(const [actual,expected] of [[bounds.min,[100,45,-5]],[bounds.max,[102,55,5]]])assert.ok(Math.hypot(...actual.map((v,i)=>v-expected[i]))<1e-5,`${actual} != ${expected}`);
 }finally{kernel.dispose();}
});
