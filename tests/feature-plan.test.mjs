import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {compileFeaturePlan} from '../src/feature-plan.js';
import {getOperation} from '../src/operation-registry.js';
import {createCommandService} from '../src/command-service.js';
import {createPageBatch} from '../src/page-batch.js';
import {CadKernel} from '../src/cad-kernel.js';
test('multi-body BREP/STL export retains live kernel handles for later inspection and editing',async()=>{
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
 const doc={version:2,features:[{id:'a',op:'box',params:{width:10,depth:8,height:4},refs:[]},{id:'b',op:'cylinder',params:{radius:1,height:2},refs:[]}],imports:{}};
 try{
  await kernel.rebuild(doc);const before=['a','b'].map(id=>kernel.activeShape(id).serialize());
  for(const format of ['brep','stl']){const exported=await kernel.export(format);assert.ok(exported.data.length>0);for(const [i,id]of ['a','b'].entries()){assert.ok(kernel.activeShape(id).serialize()===before[i],format+' changed source BREP '+id);assert.ok(kernel.measure(id).volume>0);}}
  const edited=await kernel.rebuild({...doc,features:[doc.features[0],{...doc.features[1],params:{radius:1,height:3}}]});
  assert.equal(edited.bodies.length,2);assert.ok(Math.abs(kernel.measure('b').volume-3*Math.PI)<1e-7);
 }finally{kernel.dispose();}
});
const card=(key,op,params,refs=[])=>({key,op,params,refs,opVersion:getOperation(op).version,schemaHash:getOperation(op).schemaHash});
const state=()=>({sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1,features:[],bodies:[],selectedIds:[],kernelReady:true,busy:false});
const context=s=>({sessionId:s.sessionId,documentId:s.documentId,documentInstanceId:s.documentInstanceId,expectedRevision:s.revision});
test('feature plans validate the full graph before any commit and reject intermediate topology',async()=>{
 const s=state(),box=card('stock','box',{width:10,depth:8,height:4});
 const plan=await compileFeaturePlan({features:[box]},s,{uid:()=> 'first'});
 assert.equal(plan.features[0].id,'first');assert.equal(plan.featureIds.stock,'first');
 for(const features of [[box,{...box,key:'stock'}],[box,card('end','fillet',{radius:1,edgeIds:[0]},[{feature:'stock'}])],[card('end','fillet',{radius:1,allEdges:true},[{feature:'later'}])],[{...box,key:'constructor'}],[{...box,params:{width:10,depth:8,height:4,bogus:1}}]])
  await assert.rejects(()=>compileFeaturePlan({features},s));
});
test('consumed references cannot be used by later plan features',async()=>{
 const a=card('stock','box',{width:10,depth:8,height:4});
 const b=card('pattern','fillet',{radius:.1,allEdges:true},[{feature:'stock'}]);
 const c=card('round','fillet',{radius:.1,allEdges:true},[{feature:'stock'}]);
 await assert.rejects(()=>compileFeaturePlan({features:[a,b,c]},state()),e=>e.code==='STALE_REFERENCE');
});
test('one plan uses one command and revision, with idempotent replay',async()=>{
 const s=state();let calls=0;
 const service=createCommandService({snapshot:()=>structuredClone(s),execute:async(command,args)=>{assert.equal(command,'add_features');calls++;s.features.push(...args.features);s.bodies=args.features.map(f=>({id:f.id}));s.revision++;}});
 const input={context:context(s),idempotencyKey:'plan',action:'feature.addMany',args:{features:[card('a','box',{width:3,depth:4,height:5}),card('b','cylinder',{radius:1,height:2})]}};
 const r=await service.execute(input);assert.equal(r.status,'committed');assert.equal(r.featurePlan.atomic,true);assert.equal(r.featurePlan.featureCount,2);assert.equal(s.revision,2);
 assert.deepEqual(await service.execute(input),r);assert.equal(calls,1);
 const invalid=await service.execute({...input,idempotencyKey:'invalid',context:context(s),args:{features:[{...input.args.features[0],schemaHash:'stale'}]}});
 assert.equal(invalid.error.code,'SCHEMA_MISMATCH');assert.equal(calls,1);
});
test('run addMany injects current contracts and makes its feature map available to later steps',async()=>{
 const s=state();let invocation;
 const api={getState:()=>({context:{...s,revision:s.revision},summary:{kernelReady:true,busy:false},preview:{active:false},display:{status:'rendered',rendered:{documentId:'d',documentInstanceId:'i',revision:s.revision}}}),getTool:({id})=>getOperation(id),execute:async input=>{invocation=input;s.revision++;return {status:'committed',revisionAfter:s.revision,featurePlan:{atomic:true,featureIds:{stock:'actual'}}};},measure:async({bodyId})=>{assert.equal(bodyId,'actual');return {status:'read',volume:320};}};
 const r=await createPageBatch(api)({context:context(s),idempotencyKey:'batch',steps:[{id:'build',method:'addMany',args:{features:[{key:'stock',op:'box',params:{width:10,depth:8,height:4},refs:[]}]}},{id:'check',method:'measure',args:{bodyId:{$ref:'build.featurePlan.featureIds.stock'}}}]});
 assert.equal(r.status,'completed');assert.equal(invocation.action,'feature.addMany');assert.equal(invocation.args.features[0].schemaHash,getOperation('box').schemaHash);
});
test('real kernel failure in a later plan feature retains the previous geometry and revision',async()=>{
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc),s=state();
 const service=createCommandService({allowAdvisory:true,snapshot:()=>structuredClone(s),execute:async(_command,args)=>{const next={version:2,features:[...s.features,...args.features],imports:{}};const r=await kernel.rebuild(next);s.features=next.features;s.bodies=r.bodies;s.revision++;}});
 const request=features=>({context:context(s),idempotencyKey:crypto.randomUUID(),action:'feature.addMany',args:{features}});
 try{
  const r=await service.execute(request([card('stock','box',{width:10,depth:8,height:4}),card('tool','cylinder',{radius:1,height:4}),card('offset','transform',{x:5,y:4,z:0},[{feature:'tool'}]),card('part','cut',{},[{feature:'stock'},{feature:'offset'}])]));
  assert.equal(r.status,'committed');assert.equal(s.revision,2);assert.equal(s.features.length,4);assert.equal(s.bodies.length,1);
  const id=r.featurePlan.featureIds.part,before=kernel.activeShape(id).serialize(),volume=kernel.measure(id).volume;
  assert.ok(Math.abs(volume-(320-4*Math.PI))<1e-7);
  const failed=await service.execute(request([card('remote','box',{width:1,depth:1,height:1}),card('far','transform',{x:100},[{feature:'remote'}]),card('impossible','intersect',{},[id,{feature:'far'}])]));
  assert.equal(failed.status,'failed');assert.equal(failed.commitState,'not_committed');assert.equal(failed.error.featureKey,'impossible');assert.equal(s.revision,2);assert.equal(s.features.length,4);assert.equal(kernel.activeShape(id).serialize(),before);
 }finally{kernel.dispose();}
});
