// Speed round 3: pushed job completion, receipt-before-display, receipt body bounds,
// background-tab-safe frames, capture budget and single-POST small artifacts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageJobs} from '../src/page-jobs.js';
import {createPageBatch} from '../src/page-batch.js';
import {createHostAdapter} from '../src/agent/host-adapter.js';
import {uploadArtifact} from '../src/transfer/chunked-upload.js';
import {LIMITS} from '../src/limits.js';

const ctx={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:0};

test('awaitJob resolves on completion without polling getState',async()=>{
  let stateReads=0,release;const gate=new Promise(r=>{release=r;});
  const api={getState:()=>{stateReads++;return {context:ctx};},invoke:async()=>{await gate;return {status:'read',value:1};}};
  const jobs=createPageJobs(api);
  jobs.submit({jobId:'j1',method:'measure',args:{}});
  const pending=jobs.awaitJob({jobId:'j1',timeoutMs:5000});
  const readsBefore=stateReads;
  await new Promise(r=>setTimeout(r,120));release();
  const t0=performance.now(),job=await pending;
  assert.equal(job.status,'completed');assert.ok(performance.now()-t0<50,'resolved promptly after completion');
  assert.ok(stateReads-readsBefore<=1,'no per-tick getState while waiting');
  const timed=createPageJobs({getState:()=>({context:ctx}),invoke:()=>new Promise(()=>{})});
  timed.submit({jobId:'j2',method:'measure',args:{}});
  const snap=await timed.awaitJob({jobId:'j2',timeoutMs:30});assert.ok(['queued','running'].includes(snap.status));
  await assert.rejects(()=>timed.awaitJob({jobId:'missing'}),/unknown/i);
  await assert.rejects(()=>timed.awaitJob({jobId:'j2',timeoutMs:25001}),e=>e.code==='PARAM_RANGE_INVALID');
});

test('host adapter monitor uses awaitJob (no waitFor tick) when the page offers it',async()=>{
  const context={...ctx},requestContext={sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:0};
  let waitForCalls=0,awaitCalls=0;
  const jobs=createPageJobs({getState:()=>({context}),invoke:async()=>({status:'read'})},{runBatch:async()=>({status:'completed',results:[]})});
  const api={connect:()=>({}),invoke:async()=>({}),getState:()=>({context}),...jobs,
    awaitJob:input=>{awaitCalls++;return jobs.awaitJob(input);},waitFor:async()=>{waitForCalls++;}};
  const reports=[];
  const adapter=createHostAdapter({api,session:{cadSessionId:'cad',leaseEpoch:1,binding:context,scopes:['cad.read','cad.edit','cad.export']},report:async(kind,command,body)=>{reports.push([kind,body]);}});
  const result=await adapter.receive({protocol:'goldenluck.webcad/1',cadSessionId:'cad',leaseEpoch:1,taskId:'t',commandId:'b'.repeat(32),requestHash:'h',deadline:Date.now()/1000+30,
    payload:{method:'run',args:{context:requestContext,idempotencyKey:'k',steps:[{id:'p',method:'add',args:{op:'box',params:{},refs:[]}}]}}});
  assert.equal(result.status,'completed');assert.ok(awaitCalls>=1);assert.equal(waitForCalls,0);
  assert.deepEqual(reports.map(r=>r[0]),['ack','result']);
});

test('run receipt reports moved/created body bounds and returns before the display flush',async()=>{
  let revision=0;const bodies=new Map();const order=[];
  const context=()=>({sessionId:'s',documentId:'d',documentInstanceId:'i',revision});
  const api={getState:()=>({context:context(),summary:{kernelReady:true,busy:false},preview:{active:false,computing:false},bodies:[...bodies.values()]}),
    getTool:()=>({version:'1',schemaHash:'h'}),
    execute:async req=>{revision++;const id='b'+revision;bodies.set(id,{id,bounds:{min:[0,0,0],max:[10,20,4]}});
      if(req.args?.action==='body.align'||req.action==='body.align'){bodies.delete('b1');bodies.set(id,{id,bounds:{min:[-5,-10,0],max:[5,10,4]}});return {status:'committed',revisionAfter:revision,createdBodyIds:[id],replacements:[{before:'b1',after:id}]};}
      return {status:'committed',revisionAfter:revision,createdBodyIds:[id]};}};
  const display={begin:()=>order.push('begin'),end:()=>order.push('end-sync'),endDeferred:()=>{order.push('end-deferred');setTimeout(()=>order.push('flushed'),0);},flush:()=>order.push('flush')};
  const run=createPageBatch(api,{display});
  const receipt=await run({context:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:0},idempotencyKey:'k',steps:[
    {id:'a',method:'add',args:{op:'box',params:{}}},
    {id:'al',method:'execute',args:{action:'body.align',args:{bodyIds:[{$ref:'a.createdBodyIds.0'}],target:{kind:'origin'},group:false}}}]});
  order.push('receipt');
  assert.equal(receipt.status,'completed');
  assert.deepEqual(receipt.bodyBounds.find(b=>b.id==='b2'),{id:'b2',center:[0,0,2],size:[10,20,4]});
  assert.ok(!order.includes('end-sync'));assert.ok(order.indexOf('receipt')<order.indexOf('flushed')||!order.includes('flushed'));
  await new Promise(r=>setTimeout(r,5));assert.ok(order.includes('flushed'));
});

test('viewport frame does not wait for requestAnimationFrame in a hidden tab, and falls back when rAF stalls',async()=>{
  const saved={document:globalThis.document,raf:globalThis.requestAnimationFrame};
  try{
    const {CADViewport:Viewport}=await import('../src/viewport.js').catch(e=>({error:e}));
    const frame=Viewport?.prototype?.frame;
    if(!frame){test.skip?.('viewport module needs a browser');return;}
    const self={renders:0,renderFrame(){this.renders++;},displayState(){return {frame:this.renders,frameSource:this.frameSource};}};
    globalThis.requestAnimationFrame=()=>{};// paused (background tab)
    globalThis.document={visibilityState:'hidden'};
    let t0=performance.now(),state=await frame.call(self);assert.equal(state.frameSource,'sync-hidden');assert.ok(performance.now()-t0<50);
    globalThis.document={visibilityState:'visible'};
    t0=performance.now();state=await frame.call(self,{fallbackMs:30});assert.equal(state.frameSource,'timer-fallback');assert.ok(performance.now()-t0<500);
    globalThis.requestAnimationFrame=cb=>setTimeout(cb,1);
    state=await frame.call(self,{fallbackMs:1000});assert.equal(state.frameSource,'animation-frame');assert.equal(self.renders,3);
  }finally{globalThis.document=saved.document;globalThis.requestAnimationFrame=saved.raf;}
});

test('capture has a dedicated 10 s budget, separate from the 90 s command timeout',()=>{
  assert.equal(LIMITS.transport.captureTimeoutMs,10000);
  assert.equal(LIMITS.transport.commandTimeoutMs,90000);assert.equal(LIMITS.transport.waitMaxMs,25000);
});

test('small artifacts use one POST; above chunkBytes the chunked path; caps unchanged',async()=>{
  const calls=[];
  const client={post:async(meta,bytes)=>{calls.push(['post',meta.size,bytes.byteLength]);return {status:'agent_write_verified',size:meta.size,sha256:meta.sha256};},
    start:async meta=>{calls.push(['start',meta.chunkCount]);return {uploadId:'u',received:[]};},status:async()=>({received:[]}),
    putChunk:async(id,i)=>{calls.push(['put',i]);},complete:async()=>{calls.push(['complete']);return {status:'agent_write_verified'};}};
  const small=await uploadArtifact({bytes:new Uint8Array(1024),name:'part.step',client,limits:{...LIMITS.transport}});
  assert.equal(small.mode,'single');assert.deepEqual(calls,[['post',1024,1024]]);
  calls.length=0;
  const big=await uploadArtifact({bytes:new Uint8Array(40),name:'part.step',client,limits:{...LIMITS.transport,chunkBytes:16}});
  assert.equal(big.mode,'chunked');assert.equal(calls[0][0],'start');assert.equal(calls.filter(c=>c[0]==='put').length,3);
  calls.length=0;
  const legacy={...client};delete legacy.post;
  assert.equal((await uploadArtifact({bytes:new Uint8Array(8),name:'a.stl',client:legacy})).mode,'chunked');
  assert.equal(LIMITS.transport.maxArtifactBytes,100*1024*1024);assert.equal(LIMITS.transport.chunkBytes,4*1024*1024);
  await assert.rejects(()=>uploadArtifact({bytes:new Uint8Array(0),name:'a.step',client}),e=>e.code==='ASSET_INVALID');
});
