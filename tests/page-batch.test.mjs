import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageBatch} from '../src/page-batch.js';
import {createPageJobs} from '../src/page-jobs.js';

test('new receipt keys cannot repeat a known failed mutation at unchanged geometry',async()=>{
  const f=fixture(),req=f.request();req.steps=[{id:'bad',stage:'收边',method:'add',args:{op:'round',params:{bad:true}}}];
  const first=await f.run(req);assert.equal(first.status,'failed');assert.match(first.results[0].inputFingerprint,/^[a-f0-9]{64}$/);
  const duplicate=await f.run({...req,idempotencyKey:'new-key'});
  assert.equal(duplicate.error.code,'PREVIOUS_ATTEMPT_FAILED');assert.equal(f.count,1);
  req.steps[0].args.params.radius=0.3;
  await f.run({...req,idempotencyKey:'changed'});assert.equal(f.count,2);
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
function fixture(){
  let revision=0,count=0;
  const context=()=>({sessionId:'s',documentId:'d',documentInstanceId:'i',revision});
  const api={getState:()=>({context:context(),summary:{kernelReady:true,busy:false},preview:{active:false,computing:false}}),
    getTool:()=>({version:'1',schemaHash:'hash'}),
    execute:async req=>{assert.equal(req.context.expectedRevision,revision);count++;if(req.args.params?.bad)return {status:'failed',error:{code:'GEOMETRY_INVALID',message:'bad shape'}};revision++;return {status:'committed',revisionAfter:revision,createdBodyIds:[`b${revision}`]};},
    measure:async req=>({status:'read',bodyId:req.bodyId,context:context(),volume:42}),
    files:{export:async req=>({status:'generated',context:context(),ids:req.ids,resourceId:'artifact'})}};
  const run=createPageBatch(api);
  const request=()=>({context:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:revision},idempotencyKey:'test',steps:[
    {id:'ring',method:'add',args:{op:'torus',params:{majorRadius:15,minorRadius:2.5}}},
    {id:'size',method:'measure',args:{bodyId:{$ref:'ring.createdBodyIds.0'}}},
    {id:'export',method:'files.export',args:{format:'step',ids:{$ref:'ring.createdBodyIds'}}}]});
  return {api,run,request,get count(){return count;},bump:()=>revision++};
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
