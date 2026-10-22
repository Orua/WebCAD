import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageBatch} from '../src/page-batch.js';
import {createPageJobs} from '../src/page-jobs.js';
import {getTool} from '../src/page-api-docs.js';

test('published run example uses valid add, measure refs and execute nesting',async()=>{
  const f=fixture(),card=getTool({id:'run'}),example=structuredClone(card.minimalExample);
  example.context=f.request().context;example.idempotencyKey='documented-run';
  assert.equal(card.docs,'api.run');assert.match(card.inputContract,/唯一 id/);
  assert.match(card.inputContract,/不接受 opVersion\/schemaHash/);
  assert.equal((await f.run(example)).status,'completed');
  const next=f.request();next.steps=[card.executeExample];next.idempotencyKey='documented-execute';
  assert.equal((await f.run(next)).status,'completed');
});

test('run.add rejects execute-only contract fields without committing geometry',async()=>{
 for(const field of ['opVersion','schemaHash']){
  const f=fixture(),request=f.request();request.steps[0].args[field]='wrong-place';
  const result=await f.run(request);
  assert.equal(result.status,'failed');assert.equal(result.error.code,'PARAM_SCHEMA_INVALID');assert.equal(f.count,0);
 }
});

test('new receipt keys cannot repeat a known failed mutation at unchanged geometry',async()=>{
  const f=fixture(),req=f.request();req.steps=[{id:'bad',stage:'收边',method:'add',args:{op:'round',params:{bad:true}}}];
  const first=await f.run(req);assert.equal(first.status,'failed');assert.match(first.results[0].inputFingerprint,/^[a-f0-9]{64}$/);
  const duplicate=await f.run({...req,idempotencyKey:'new-key'});
  assert.equal(duplicate.error.code,'PREVIOUS_ATTEMPT_FAILED');assert.equal(f.count,1);
  req.steps[0].args.params.radius=0.3;
  await f.run({...req,idempotencyKey:'changed'});assert.equal(f.count,2);
});
test('unknown batch exceptions preserve unknown status and original task identity',async()=>{
 const f=fixture();f.api.execute=async()=>{throw Object.assign(new Error('connection lost'),{commitState:'unknown',jobId:'remote-7'});};
 const receipt=await f.run(f.request());assert.equal(receipt.status,'unknown');assert.equal(receipt.error.commitState,'unknown');assert.equal(receipt.error.jobId,'remote-7');
 assert.equal(receipt.recovery.action,'INSPECT_STATE_BEFORE_RETRY');
});
test('temporary pre-commit errors do not permanently poison identical operations',async()=>{
 const f=fixture();let first=true;f.api.execute=async()=>{if(first){first=false;return {status:'failed',commitState:'not_committed',error:{code:'SERVICES_UNAVAILABLE'}};}return {status:'read'};};
 const request=f.request();request.steps=[request.steps[0]];
 assert.equal((await f.run(request)).status,'failed');assert.equal((await f.run({...request,idempotencyKey:'retry'})).status,'completed');
});
test('a standalone recovery save bypasses busy kernel checks and the batch tail',async()=>{
 const f=fixture();f.setUnavailable();const input=f.request();input.steps=[{id:'save',method:'files.save',args:{name:'rescue.webcad'}}];
 const receipt=await f.run(input);assert.equal(receipt.status,'completed');assert.equal(receipt.results[0].result.status,'read');
});
test('batch history evicts terminal entries while allowing further read batches',async()=>{
 const f=fixture();
 for(let i=0;i<1105;i++){
  const request=f.request();request.idempotencyKey=`read-${i}`;request.steps=[{id:'state',method:'measure',args:{bodyId:'b'}}];
  assert.equal((await f.run(request)).status,'completed');
 }
 const retired=f.request();retired.idempotencyKey='read-0';retired.steps=[{id:'state',method:'measure',args:{bodyId:'b'}}];
 const archived=await f.run(retired);assert.equal(archived.status,'completed');assert.equal(archived.archived,true);
});
test('page job history evicts finished jobs but keeps accepting work',async()=>{
 const context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:0};
 const jobs=createPageJobs({getState:()=>({context}),invoke:async()=>({status:'read'})});
 for(let i=0;i<1105;i++){
  jobs.submit({jobId:`job-${i}`,method:'measure',args:{}});await jobs.awaitJob({jobId:`job-${i}`,timeoutMs:1000});
 }
 assert.equal(jobs.getJob({jobId:'job-0'}).status,'completed');assert.equal(jobs.getJob({jobId:'job-0'}).archived,true);
 assert.equal(jobs.submit({jobId:'job-0',method:'measure',args:{}}).status,'completed');
 assert.throws(()=>jobs.submit({jobId:'job-0',method:'measure',args:{different:true}}),{code:'IDEMPOTENCY_KEY_REUSED'});
 assert.equal(jobs.submit({jobId:'job-last',method:'measure',args:{}}).status,'queued');
});
test('unresolved page jobs are retained and protect the receipt limit',async()=>{
 const context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:0};
 const jobs=createPageJobs({getState:()=>({context}),invoke:async()=>({status:'unknown',commitState:'unknown'})});
 for(let i=0;i<100;i++){jobs.submit({jobId:`unknown-${i}`,method:'measure',args:{}});await jobs.awaitJob({jobId:`unknown-${i}`,timeoutMs:1000});}
 assert.equal(jobs.getJob({jobId:'unknown-0'}).status,'unknown');
 assert.throws(()=>jobs.submit({jobId:'blocked',method:'measure',args:{}}),{code:'RESOURCE_LIMIT'});
});

test('running batch exposes its real stage and stops only after the current commit',async()=>{
  const f=fixture();let release,entered;const active=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
  const execute=f.api.execute;f.api.execute=async req=>{entered();await gate;return execute(req);};
  const jobs=createPageJobs(f.api,{runBatch:f.run});
  jobs.submit({jobId:'staged',method:'run',args:f.request()});await active;
  assert.equal(jobs.getJob({jobId:'staged'}).progress.stepId,'ring');
  assert.equal(jobs.cancelJob({jobId:'staged'}).reason,'STOP_REQUESTED_AFTER_CURRENT_STAGE');release();
  await new Promise(resolve=>setImmediate(resolve));
  const result=jobs.getJob({jobId:'staged'}).result;
  assert.equal(result.status,'partial');assert.equal(result.error.code,'BATCH_CANCELLED');
  assert.deepEqual(result.progress.completedStepIds,['ring']);assert.deepEqual(result.progress.unattemptedStepIds,['size','export']);assert.equal(f.count,1);
});

test('partial receipts identify committed, failed and remaining steps without redoing commits',async()=>{
  const f=fixture(),req=f.request();
  req.steps.splice(1,0,{id:'bad',method:'add',args:{op:'box',params:{bad:true}}});
  const r=await f.run(req);
  assert.equal(r.status,'partial');assert.equal(r.progress.failedStepId,'bad');
  assert.deepEqual(r.progress.completedStepIds,['ring']);
  assert.deepEqual(r.progress.unattemptedStepIds,['size','export']);
  assert.equal(r.requestContext.expectedRevision,1);
  assert.equal(r.recovery.action,'READ_STATE_AND_REPLAN_REMAINING');
  const count=f.count;assert.deepEqual(await f.run(req),r);assert.equal(f.count,count);
});
function fixture(display){
  let revision=0,count=0,busy=false,kernelReady=true;
  const context=()=>({sessionId:'s',documentId:'d',documentInstanceId:'i',revision});
  const api={getState:()=>({context:context(),summary:{kernelReady,busy},preview:{active:false,computing:false}}),
    getTool:()=>({version:'1',schemaHash:'hash'}),
    execute:async req=>{assert.equal(req.context.expectedRevision,revision);count++;if(req.args.params?.bad)return {status:'failed',error:{code:'GEOMETRY_INVALID',message:'bad shape'}};revision++;return {status:'committed',revisionAfter:revision,createdBodyIds:[`b${revision}`]};},
    measure:async req=>({status:'read',bodyId:req.bodyId,context:context(),volume:42}),
    files:{export:async req=>({status:'generated',context:context(),ids:req.ids,resourceId:'artifact'}),save:async()=>({status:'read',context:context(),resourceId:'rescue'})}};
  const run=createPageBatch(api,display?{display}:undefined);
  const request=()=>({context:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:revision},idempotencyKey:'test',steps:[
    {id:'ring',method:'add',args:{op:'torus',params:{majorRadius:15,minorRadius:2.5}}},
    {id:'size',method:'measure',args:{bodyId:{$ref:'ring.createdBodyIds.0'}}},
    {id:'export',method:'files.export',args:{format:'step',ids:{$ref:'ring.createdBodyIds'}}}]});
  return {api,run,request,get count(){return count;},bump:()=>revision++,setUnavailable(){busy=true;kernelReady=false;}};
}
test('JSON batch links real IDs, advances context, and replays one receipt',async()=>{
  const f=fixture(),req=f.request(),r=await f.run(req);assert.equal(r.status,'completed');assert.equal(r.atomic,false);
  assert.equal(r.results[1].result.bodyId,'b1');assert.deepEqual(r.results[2].result.ids,['b1']);
  assert.deepEqual(await f.run(req),r);assert.equal(f.count,1);
  req.steps[0].args.params.minorRadius=3;assert.equal((await f.run(req)).error.code,'IDEMPOTENCY_KEY_REUSED');
});
test('rejects stale context, unknown methods and dangerous keys before mutations',async()=>{
  for(const variant of ['stale','method','unsafe','duplicate','context']){const f=fixture(),r=f.request();
    if(variant==='stale')f.bump();if(variant==='method')r.steps.push({id:'evil',method:'eval',args:{}});
    if(variant==='unsafe')r.steps[0].args.params=JSON.parse('{"__proto__":{}}');
    if(variant==='duplicate')r.steps.push(r.steps[0]);if(variant==='context')r.steps[0].args.context={};
    assert.equal((await f.run(r)).status,'failed',variant);assert.equal(f.count,0,variant);
  }
});

test('missing, invalid and duplicate step IDs have actionable diagnostics before any execution',async()=>{
 for(const variant of ['missing','invalid','duplicate']){
  const f=fixture(),request=f.request();
  if(variant==='missing')delete request.steps[1].id;
  if(variant==='invalid')request.steps[1].id='not a valid id';
  if(variant==='duplicate')request.steps[1].id=request.steps[0].id;
  const original=structuredClone(request),receipt=await f.run(request);
  assert.equal(receipt.status,'failed');assert.equal(receipt.error.code,'PARAM_SCHEMA_INVALID');assert.equal(receipt.error.path,'steps[1].id');
  assert.match(receipt.error.message,variant==='missing'?/缺少 id/:variant==='invalid'?/格式无效/:/本批次中重复/);
  assert.match(receipt.error.userMessage,/第 2 步/);assert.equal(receipt.results.length,0);assert.equal(f.count,0);
  assert.equal(receipt.context.revision,0);assert.deepEqual(request,original);
 }
});
test('failure stops later steps, preserves prior commit and does not repeat it',async()=>{
  const f=fixture(),r=f.request();r.steps.splice(1,0,{id:'bad',method:'add',args:{op:'torus',params:{bad:true}}});
  const result=await f.run(r);assert.equal(result.status,'partial');assert.equal(result.results.length,2);assert.equal(f.count,2);
  assert.deepEqual(await f.run(r),result);assert.equal(f.count,2);
});
test('bad result reference fails and external edits are never silently adopted',async()=>{
  const f=fixture(),r=f.request();r.steps[1].args.bodyId={$ref:'missing.createdBodyIds.0'};
  assert.equal((await f.run(r)).error.code,'STALE_REFERENCE');assert.equal(f.count,1);
  const g=fixture();g.api.measure=async()=>{g.bump();return {status:'read'};};
  assert.equal((await g.run(g.request())).error.code,'REVISION_CONFLICT');
});
test('concurrent duplicate batches are serialized and create one feature',async()=>{
  const f=fixture(),r=f.request();const [a,b]=await Promise.all([f.run(r),f.run(r)]);assert.deepEqual(a,b);assert.equal(f.count,1);
});

function previewFixture(){
  let revision=0,active=false,computing=false,busy=false,count=0;
  const context=()=>({sessionId:'s',documentId:'d',documentInstanceId:'i',revision});
  const api={getState:()=>({context:context(),summary:{kernelReady:true,busy},preview:{active,computing}}),
    execute:async req=>{
      assert.equal(req.context.expectedRevision,revision);count++;
      if(req.action==='preview.start'||req.action==='preview.update'){
        active=true;return {status:'previewing',preview:{active:true,previewId:'p',generation:req.action==='preview.start'?1:2}};
      }
      active=false;if(req.action==='preview.commit')revision++;
      return {status:req.action==='preview.commit'?'committed':'no_change',revisionAfter:revision,preview:{active:false}};
    }};
  return {run:createPageBatch(api),get count(){return count;},setActive:()=>active=true,setComputing:()=>computing=true,setBusy:()=>busy=true,
    request:(key,steps)=>({context:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:revision},idempotencyKey:key,steps})};
}
const previewStep=(id,action,args={})=>({id,method:'execute',args:{action,args}});
test('preview start is a completed batch and can update then commit through another batch',async()=>{
  const f=previewFixture();
  const start=f.request('start',[previewStep('start','preview.start')]);
  const first=await f.run(start);assert.equal(first.status,'completed');assert.equal(first.results[0].result.status,'previewing');
  const next=f.request('finish',[previewStep('update','preview.update',{previewId:'p',expectedGeneration:1}),previewStep('commit','preview.commit',{previewId:'p',expectedGeneration:2})]);
  const completed=await f.run(next);assert.equal(completed.status,'completed');assert.equal(completed.requestContext.expectedRevision,1);
  assert.deepEqual(await f.run(next),completed);assert.equal(f.count,3);
});
test('an active preview permits explicit cancel but still blocks a new feature',async()=>{
  const f=previewFixture();f.setActive();
  const blocked=f.request('blocked',[{id:'new',method:'add',args:{op:'box'}}]);
  assert.equal((await f.run(blocked)).error.code,'CAPABILITY_UNAVAILABLE');assert.equal(f.count,0);
  const cancel=f.request('cancel',[previewStep('cancel','preview.cancel',{previewId:'p',expectedGeneration:1})]);
  assert.equal((await f.run(cancel)).status,'completed');assert.equal(f.count,1);
});
test('preview control batches remain blocked while the worker or preview computes',async()=>{
  for(const set of ['setComputing','setBusy']){
    const f=previewFixture();f.setActive();f[set]();
    const req=f.request(set,[previewStep('commit','preview.commit',{previewId:'p',expectedGeneration:1})]);
    assert.equal((await f.run(req)).error.code,'CAPABILITY_UNAVAILABLE');assert.equal(f.count,0);
  }
});

test('a batch defers display to one flush, flushing before view/export steps and on failure',async()=>{
  const log=[];const display={begin:()=>log.push('begin'),end:()=>log.push('end'),flush:()=>log.push('flush')};
  const f=fixture(display);const ok=await f.run(f.request());
  assert.equal(ok.status,'completed');assert.deepEqual(log,['begin','flush','end']);
  log.length=0;const req=f.request();req.idempotencyKey='fail';req.steps=[{id:'bad',method:'add',args:{op:'box',params:{bad:true}}}];
  const bad=await f.run(req);assert.equal(bad.status,'failed');assert.deepEqual(log,['begin','end']);
});
