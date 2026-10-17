import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import initOpenCascade from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {RebuildPool} from '../src/rebuild-pool.js';

const oc=await initOpenCascade({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
const feature=(id,op,params={},refs=[])=>({id,op,params,refs});
const makeDocument=()=>({version:2,imports:{},features:[
 feature('a0','box',{width:10,depth:10,height:10}),feature('a','transform',{x:0},['a0']),
 feature('b0','box',{width:10,depth:10,height:10}),feature('b','transform',{x:15},['b0']),
 feature('c0','box',{width:10,depth:10,height:10}),feature('c','transform',{x:30},['c0']),
 feature('d0','box',{width:10,depth:10,height:10}),feature('d','transform',{x:45},['d0']),
 feature('joined','union',{},['a','b','c','d'])
]});

test('Node worker_threads rebuilds independent branches then union and preserves source',async()=>{
 const document=makeDocument(),snapshot=structuredClone(document),serialKernel=new CadKernel(oc),parentKernel=new CadKernel(oc),pool=new RebuildPool({workers:2,runtime:'node'});
 try{
  await serialKernel.rebuild(document,{headless:true});
  const serialShape=serialKernel.shapes.get('joined'),serialFaces=serialShape.faces.length,serialVolume=serialKernel.measure('joined','body').volume;
  const rebuilt=await pool.rebuild(document,{kernel:parentKernel});
  assert.deepEqual(document,snapshot,'input document must remain unchanged');
  assert.deepEqual(rebuilt.perFeatureMs.map(row=>row.featureId),document.features.map(row=>row.id));
  const finished=new Map(rebuilt.completionOrder.map((id,i)=>[id,i]));for(const row of document.features)for(const ref of row.refs)assert.ok(finished.get(ref)<finished.get(row.id),`${ref} must finish before ${row.id}`);
  const threadIds=[...new Set(rebuilt.perFeatureMs.map(row=>row.threadId).filter(id=>id!==undefined))];assert.ok(threadIds.length>=2,`tasks must run on distinct Node threads; got ${JSON.stringify(threadIds)}`);
  const parallelShape=parentKernel.shapes.get('joined'),parallelFaces=parallelShape.faces.length,parallelVolume=parentKernel.measure('joined','body').volume;
  assert.equal(parallelFaces,serialFaces);assert.ok(Math.abs(parallelVolume-serialVolume)<1e-7);
  assert.equal(rebuilt.document.features.length,document.features.length);
  for(const row of rebuilt.document.features)assert.equal(row.compiledCheckpoint?.kind,'local-rebuild');
 }finally{await pool.dispose();serialKernel.dispose();parentKernel.dispose();}
});

test('worker failure carries featureId and terminates the pool',async()=>{
 const pool=new RebuildPool({workers:2,runtime:'node'}),document={version:2,imports:{},features:[feature('broken','noSuchFeature')]};
 await assert.rejects(pool.rebuild(document),error=>error.featureId==='broken');
 assert.equal(pool.closed,true);assert.ok(pool.workers.every(slot=>slot.worker===null));
});

test('dispose terminates live Node workers',async()=>{
 const pool=new RebuildPool({workers:2,runtime:'node'});await pool.ensureWorkers();
 const native=pool.workers.map(slot=>slot.worker.native),exits=native.map(worker=>new Promise(resolve=>worker.once('exit',resolve)));
 await pool.dispose();await Promise.all(exits);assert.ok(native.every(worker=>worker.threadId===-1));
});
