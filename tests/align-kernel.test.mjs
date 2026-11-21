import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {createReferenceSystem,resolvePlacement} from '../src/work-frame.js';
import {finalStateProject} from '../src/project-final-state.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';

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

test('frame-aligned copies share exact sources and alignment reads the located geometry',async()=>{
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
 const kernel=new CadKernel(oc),reopened=new CadKernel(oc);
 const referenceSystem=createReferenceSystem(), angle=Math.PI/8;
 const feature=(id,sourceId,frame,params)=>({
  id,op:'copy',refs:[sourceId],params,
  placement:resolvePlacement({version:1,frame,sourceAnchor:{kind:'model-origin'}},referenceSystem,'copy',params)
 });
 const params={mode:'align',sourcePoint:[0,0,0],sourceAxis:[0,0,1],sourceUp:[1,0,0],targetPoint:[4,0,0],targetAxis:[0,0,1],targetUp:[1,0,0],axisRelation:'same',gapMm:1,twistAngleDeg:0};
 const center=[20+2*Math.SQRT2,30+2*Math.SQRT2,5];
 const doc={version:4,documentId:'copies',name:'Aligned copies',features:[
  {id:'source',op:'cylinder',params:{radius:2,height:3},refs:[]},
  feature('copy','source',{kind:'snapshot',origin:[20,30,4],quaternion:[0,0,Math.sin(angle),Math.cos(angle)]},params),
  feature('reference','copy',{kind:'world'},{...params,sourcePoint:center,sourceUp:[1,1,0],targetPoint:[60,0,10],gapMm:0})
 ],imports:{},colors:{copy:'#123456'}};
 const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);
 try{
  const {bodies}=await kernel.rebuild(doc,{deferMassProperties:true});
  assert.ok(bodies.find(b=>b.id==='copy').bounds.min[0]<center[0]-2.5);
  assert.ok(bodies.find(b=>b.id==='reference').bounds.max[0]>62.5);
  const input={bodyIds:['source','copy'],target:{kind:'body',bodyId:'reference'},axes:['X'],sourceSide:'min',targetSide:'max'};
  const group=kernel.planAlignment(input,referenceSystem);
  near(group.targetPoint[0],62);
  for(const move of group.moves)near(move.delta[0],64);
  const separate=kernel.planAlignment({...input,group:false},referenceSystem);
  near(separate.moves[1].delta[0],64-center[0]);
  const sources=kernel.finalShapeSources();
  for(const copy of sources.slice(1))assert.equal(copy.data,sources[0].data);
  near(sources[1].location[0],Math.SQRT1_2);
  near(sources[2].location[0],1);
  const saved=await decodeProject(encodeProjectV4(finalStateProject(doc,sources)));
  assert.equal(Object.keys(saved.binaryAssets).length,1);
  assert.deepEqual(saved.colors,doc.colors);
  await reopened.rebuild(saved,{deferMassProperties:true});
  const measured=reopened.measure('reference');
  assert.equal(measured.solidCount,1);
  near(measured.bounds.max[0],62);
  near(measured.bounds.min[2],10);
 }finally{reopened.dispose();kernel.dispose();}
});
