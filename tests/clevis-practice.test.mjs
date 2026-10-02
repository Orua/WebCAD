import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {createPageAPI} from '../src/page-api.js';
import {createCommandService} from '../src/command-service.js';
import {createReferenceSystem} from '../src/work-frame.js';
import {runClevisPractice} from '../docs/examples/clevis-practice.js';

test('four-piece clevis practice passes public operations and verifies real clearances without mutating inspected sources',async()=>{
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);kernel.quality='draft';
 const identity={sessionId:'clevis-s',documentId:'clevis-d',documentInstanceId:'clevis-i'};
 let document={version:2,features:[],imports:{},referenceSystem:createReferenceSystem()},bodies=[],revision=0;
 const service=createCommandService({allowAdvisory:true,
  snapshot:()=>({...identity,revision,features:structuredClone(document.features),bodies:structuredClone(bodies),referenceSystem:document.referenceSystem,selectedIds:[],selectedTopology:null,busy:false,kernelReady:true,dirty:revision>0,preview:false}),
  execute:async(command,args)=>{
   assert.equal(command,'add_feature');const feature={id:'clevis-'+(document.features.length+1),...args},next={...document,features:[...document.features,feature]};
   const result=await kernel.rebuild(next);document=next;bodies=result.bodies.map(({id,name,bounds,volume,area,solidCount,faceCount,edgeCount})=>({id,name,bounds,volume,area,solidCount,faceCount,edgeCount}));revision++;
  }
 });
 const readOnly=fn=>(...args)=>{const before=[...kernel.shapes].map(([id,s])=>[id,s.serialize()]),result=fn(...args);assert.deepEqual([...kernel.shapes].map(([id,s])=>[id,s.serialize()]),before);return result;};
 const api=createPageAPI({state:()=>service.getState({sessionId:identity.sessionId,include:['summary','features','bodies']}),execute:input=>service.execute(input),display:()=>({status:'not_rendered'}),view:async()=>{},
  measure:readOnly(input=>kernel.measure(input.bodyId,input.kind,input.topologyId)),inspectFit:readOnly((...args)=>kernel.inspectFit(...args)),measureRelation:readOnly(input=>kernel.measureRelation(input)),
  confirmSaved:()=>{throw new Error('No save is authorized by this test');}});
 try{
  const result=await runClevisPractice(api);assert.equal(result.status,'completed',JSON.stringify(result));assert.equal(result.verified,true,JSON.stringify(result.checks));
  assert.equal(result.receipt.results.length,14);assert.equal(revision,9);assert.equal(document.features.length,9);assert.equal(bodies.length,3);assert.equal(bodies.reduce((n,b)=>n+b.solidCount,0),4);
  assert.equal(result.saved,false);assert.equal(result.rendered,false);assert.equal(result.receipt.displayMatchesContext,false);
  const volumes=bodies.map(b=>b.volume);const rebuilt=await kernel.rebuild(JSON.parse(JSON.stringify(document)));
  rebuilt.bodies.forEach((b,i)=>assert(Math.abs(b.volume-volumes[i])<1e-5,'history replay preserves assembled part volumes'));
 }finally{kernel.dispose();}
});
