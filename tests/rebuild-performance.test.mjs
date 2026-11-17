import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {binaryHash} from '../src/contracts/operation-schema.js';
import {createLoadingTracker} from '../src/loading-progress.js';
import {snapshotDelta,installSnapshotDelta} from '../src/geometry-snapshot.js';
import {packWorkerDocument,unpackWorkerDocument} from '../src/worker-assets.js';
import {finalStateProject} from '../src/project-final-state.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';
import {createKernelRequestClock} from '../src/kernel-timeout.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const box={id:'block',op:'box',params:{width:10,depth:8,height:6},refs:[]};
function fixture(){const data=new Uint8Array(134),v=new DataView(data.buffer);v.setUint32(80,1,true);[0,0,0,2,0,0,0,3,0].forEach((p,i)=>v.setFloat32(96+i*4,p,true));const hash=binaryHash(data).slice(7);return {version:4,features:[box,{id:'mesh',op:'import',params:{key:'source'},refs:[]}],imports:{source:{format:'stl',units:'mm',assetHash:hash}},binaryAssets:{[hash]:data},hidden:['mesh']};}
test('pending feature progress starts at zero and completion needs the rendered revision',()=>{
 const tracker=createLoadingTracker();tracker.update({kind:'rebuild',phase:'feature',completed:537,total:564,reused:537,pendingOnly:false});assert.equal(tracker.value,0);
 tracker.update({kind:'rebuild',phase:'save-snapshot'});assert.equal(tracker.value,null);
 tracker.update({kind:'rebuild',phase:'snapshot-ready'});assert.notEqual(tracker.value,1);
 tracker.update({kind:'rebuild',phase:'rendered'});assert.equal(tracker.value,1);
});
test('mesh and mixed removal keep undo sources; exact unsupported tools still fail',async()=>{
 const doc=fixture();await kernel.rebuild(doc);const before=kernel.finalShapeSources();
 const removed=await kernel.rebuild({...doc,features:[...doc.features,{id:'removed',op:'remove',params:{},refs:['block','mesh']}]});assert.equal(removed.bodies.length,0);
 const restored=await kernel.rebuild(doc);assert.deepEqual(restored.bodies.map(b=>b.id),['block','mesh']);assert.equal(kernel.finalShapeSources().find(s=>s.id==='mesh').data,before.find(s=>s.id==='mesh').data);
 await assert.rejects(kernel.rebuild({...doc,features:[...doc.features,{id:'invalid',op:'fillet',params:{radius:1,allEdges:true},refs:['mesh']}]}),{code:'MESH_TOOL_UNAVAILABLE'});
});
test('editing an independent early branch does not recompute or reencode the hidden mesh',async()=>{
 const doc=fixture();await kernel.rebuild(doc);const before=kernel.finalShapeSources().find(s=>s.id==='mesh'),encoded=kernel.snapshotEncodeCount;
 const result=await kernel.rebuild({...doc,features:[{...box,params:{...box.params,width:11}},doc.features[1]],imports:{...doc.imports,unused:{format:'brep',data:'unused'}}});
 assert.equal(result.perFeatureMs.find(f=>f.featureId==='mesh').reused,true);assert.equal(kernel.finalShapeSources().find(s=>s.id==='mesh').data,before.data);assert.equal(kernel.snapshotEncodeCount,encoded+1);
});
test('rigid copies retain exact bodies, share frozen save source and cold reopen at the same position',async()=>{
 const doc={version:4,features:[box],imports:{},binaryAssets:{},hidden:[]};await kernel.rebuild(doc);
 const before=kernel.serializeFeatureShape('block').data;
 const copied={...doc,features:[box,{id:'copy',op:'copy',params:{x:20,y:4,z:3,rz:90},refs:['block']}]};
 const result=await kernel.rebuild(copied);assert.equal(result.stats.solids,2);const a=kernel.measure('block'),b=kernel.measure('copy');assert.equal(b.solidCount,1);assert.ok(Math.abs(a.volume-b.volume)<1e-6);
 assert.deepEqual(kernel.serializeFeatureShape('block').data,before);
 const sources=kernel.finalShapeSources();assert.equal(sources[0].data,sources[1].data);assert.equal(sources[1].location[12],20);
 const snapshot=finalStateProject(copied,sources);assert.equal(Object.keys(snapshot.binaryAssets).length,1);
 assert.ok(Object.values(snapshot.imports).every(item=>item.format==='brep-instance'),'typed instance assets cannot be mistaken for ordinary BRep by older readers');
 const cold=await decodeProject(encodeProjectV4(snapshot));const result2=await kernel.rebuild(cold);assert.equal(result2.stats.solids,2);assert.deepEqual(kernel.measure('copy').bounds,b.bounds);
 const modified={...copied,features:[...copied.features,{id:'cutter',op:'cylinder',params:{radius:1,height:12},refs:[]},{id:'positioned-cutter',op:'transform',params:{x:16,y:9,z:0},refs:['cutter']},{id:'cut',op:'cut',params:{},refs:['copy','positioned-cutter']}]};
 await kernel.rebuild(modified);assert.deepEqual(kernel.serializeFeatureShape('block').data,before,'downstream builders cannot mutate shared source topology');
 const scaled={...doc,features:[box,{id:'scaled',op:'copy',params:{scale:.5},refs:['block']}]};await kernel.rebuild(scaled);const small=kernel.measure('scaled');assert.ok(Math.abs(small.volume-a.volume*.125)<1e-6);assert.ok(Math.abs(small.area-a.area*.25)<1e-6);
});
test('absolute instances share one exact bounds query and relative translation needs none',async()=>{
 const doc={version:4,features:[box],imports:{},binaryAssets:{},hidden:[]};await kernel.rebuild(doc);
 const source=kernel.shapes.get('block');let prototype=source,descriptor;
 while(prototype&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(prototype,'boundingBox');prototype=Object.getPrototypeOf(prototype);}
 let boundsQueries=0;Object.defineProperty(source,'boundingBox',{configurable:true,get(){boundsQueries++;return descriptor.get.call(this);}});
 try{
  const relative={id:'relative-copy',op:'copy',params:{x:25},refs:['block']};
  await kernel.rebuild({...doc,features:[box,relative]});assert.equal(boundsQueries,0);
  const copies=Array.from({length:27},(_,i)=>({id:'located-'+i,op:'copy',params:{positionMode:'absolute',x:20*i,y:4,z:3},refs:['block']}));
  const result=await kernel.rebuild({...doc,features:[box,...copies]});assert.equal(boundsQueries,1);assert.equal(result.stats.solids,28);
  for(const i of [0,13,26]){const m=kernel.measure(copies[i].id);assert.ok(Math.abs((m.bounds.min[0]+m.bounds.max[0])/2-20*i)<1e-6);}
 }finally{delete source.boundingBox;}
});
test('snapshot and asset deltas reject corruption and old context without detaching retained data',()=>{
 const data=new TextEncoder().encode('source'),source={id:'a',format:'brep',sourceHash:binaryHash(data).slice(7),data},context={instance:'a',revision:2};
 const first=snapshotDelta([source],[],context),installed=installSnapshotDelta(first,[],context);const next=snapshotDelta([source],[source.sourceHash],context);assert.equal(Object.keys(next.assets).length,0);assert.equal(installSnapshotDelta(next,installed,context)[0].data,data);
 assert.throws(()=>installSnapshotDelta(first,[],{instance:'b',revision:2}),{code:'ARTIFACT_CORRUPT'});
 const doc={binaryAssets:{[source.sourceHash]:data}},cache=new Map(),packet=packWorkerDocument(doc);unpackWorkerDocument(packet,cache);assert.equal(Object.keys(packWorkerDocument(doc,new Set(cache.keys())).assetUpdates.binaryAssets).length,0);
});
test('queued time never spends the execution budget and finite recovery has its own deadline',()=>{
 let time=0,id=0;const timers=new Map(),events=[];
 const advance=ms=>{time+=ms;for(const [key,t]of [...timers])if(t.at<=time){timers.delete(key);t.fn();}};
 const opts={now:()=>time,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),onSoft:()=>events.push('reminder'),onStop:e=>events.push(e.reason),localTimeoutMs:60000,hardTimeoutMs:180000};
 const clock=createKernelRequestClock('rebuild',opts);advance(100000);clock.started();advance(60000);assert.deepEqual(events,['reminder']);advance(120000);assert.deepEqual(events,['reminder','execution']);assert.equal(clock.state.queueMs,100000);
 events.length=0;const recovery=createKernelRequestClock('rebuild',{...opts,hardTimeoutMs:120000});recovery.started();advance(120000);assert.deepEqual(events,['reminder','execution']);
 events.length=0;createKernelRequestClock('rebuild',opts);advance(180000);assert.deepEqual(events,['queue']);
});
test.after(()=>kernel.dispose());
