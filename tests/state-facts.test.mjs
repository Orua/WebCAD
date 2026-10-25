import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandService} from '../src/command-service.js';
import {commitFacts,batchFacts} from '../src/commit-facts.js';
import {createPageBatch} from '../src/page-batch.js';

const context=revision=>({sessionId:'s',documentId:'d',documentInstanceId:'i',revision});
const body=(id='b')=>({id,name:'Measured body',kind:'solid',volume:12,bounds:{min:[0,0,0],max:[1.23456,2,3]}});
test('state coverage distinguishes lite bodies, full fields, missing features and an empty collection',()=>{
  const state={...context(1),features:[{id:'f',op:'box',params:{width:1}}],bodies:[body()],selectedIds:[],kernelReady:true,busy:false};
  const service=createCommandService({snapshot:()=>structuredClone(state)});
  const lite=service.getState({sessionId:'s',compact:true});
  assert.equal(lite.coverageDetails.bodies.profile,'lite');assert.equal(lite.coverageDetails.bodies.complete,true);
  assert.equal(Object.hasOwn(lite.bodies[0],'volume'),false);
  assert.equal(Object.hasOwn(lite,'features'),false);assert.equal(lite.coverageDetails.features.complete,false);
  const full=service.getState({sessionId:'s',include:['summary','bodies','features']});
  assert.equal(full.coverageDetails.bodies.profile,'full');assert.equal(full.bodies[0].volume,12);
  assert.equal(full.coverageDetails.features.returnedCount,1);
  state.bodies=[];state.features=[];
  const empty=service.getState({sessionId:'s',include:['summary','bodies','features']});
  for(const field of ['bodies','features'])assert.deepEqual([empty[field],empty.coverageDetails[field].complete,empty.coverageDetails[field].totalCount],[[],true,0]);
});
test('commit facts preserve actual replacements and label rounded bounds without inventing a measurement',()=>{
  const before={...context(1),bodies:[body('old')]},after={...context(2),bodies:[body('new')]};
  const facts=commitFacts(before,after,{status:'committed',requestId:'req',transactionId:'tx',createdBodyIds:['new'],replacements:[{before:'old',after:'new'}],validation:{geometry:'passed'}});
  assert.equal(facts.geometryCommitted,true);assert.deepEqual(facts.deletedBodyIds,['old']);
  assert.deepEqual(facts.replacements,[{before:'old',after:'new'}]);assert.equal(facts.nextContext.expectedRevision,2);
  assert.equal(facts.bounds.items[0].max[0],1.235);assert.equal(facts.bounds.quantizationMm,0.001);
  assert.equal(facts.bounds.accuracy,'not_asserted');assert.equal(facts.measurements.status,'not_measured');
  const missing=commitFacts(before,{...context(2),bodies:[{id:'new'}]},{status:'committed',createdBodyIds:['new'],validation:{geometry:'passed'}});
  assert.deepEqual(missing.bounds.missingBodyIds,['new']);assert.equal(missing.coverage.bounds.complete,false);
  assert.equal(missing.truncated,false,'unavailable source bounds are distinct from truncation');
  assert.equal(commitFacts(before,after,{status:'committed',validation:{geometry:'unchanged'}}).geometryCommitted,false);
});
test('partial batch facts preserve the committed prefix, unknown job and original receipt details',()=>{
  const receipt={status:'partial',idempotencyKey:'original',results:[
    {id:'first',result:{status:'committed',revisionBefore:1,createdBodyIds:['b'],deletedBodyIds:['old'],validation:{geometry:'passed'}}},
    {id:'next',result:{status:'unknown',pageJobId:'original-job'}}],
    progress:{completedStepIds:['first'],failedStepId:'next',unattemptedStepIds:['last']},error:{code:'ACK_LOST',path:'next'}};
  const facts=batchFacts({context:context(2),bodies:[body()],summary:{bodyCount:1}},receipt,[]);
  assert.equal(facts.commitState,'partial');assert.equal(facts.geometryCommitted,true);assert.deepEqual(facts.createdBodyIds,['b']);
  assert.deepEqual(facts.steps.committedStepIds,['first']);assert.deepEqual(facts.steps.pendingStepIds,['next']);assert.deepEqual(facts.steps.unattemptedStepIds,['last']);
  assert.deepEqual(facts.steps.pendingJobs,[{stepId:'next',pageJobId:'original-job'}]);
  assert.equal(facts.error.code,'ACK_LOST');assert.equal(facts.receipt.idempotencyKey,'original');
  assert.equal(receipt.results[1].result.pageJobId,'original-job');
});
test('large actual measurements have bounded facts with explicit coverage and unmodified full receipts',()=>{
  const steps=Array.from({length:40},(_,i)=>({id:'m'+i,method:'measure'}));
  const receipt={status:'completed',idempotencyKey:'original',results:steps.map(step=>({id:step.id,result:{status:'read',source:'exact-brep',units:{length:'mm'},volume:12,diagnostic:'x'.repeat(1750)}}))};
  const facts=batchFacts({context:context(2),bodies:[body()]},receipt,steps);
  assert(new TextEncoder().encode(JSON.stringify(facts)).length<=16*1024);
  assert.equal(facts.truncated,true);assert.equal(facts.coverage.measurements.totalCount,40);assert.equal(facts.coverage.measurements.complete,false);
  assert.equal(receipt.results.length,40);assert.equal(receipt.results[39].result.volume,12);
});
test('batch receipt integration adds facts once and replays the same prefix without a new write',async()=>{
  let revision=1,writes=0;const bodies=[];
  const api={getState:()=>({context:context(revision),bodies,summary:{bodyCount:bodies.length,kernelReady:true,busy:false},preview:{active:false,computing:false}}),
    getTool:()=>({version:'1',schemaHash:'hash'}),execute:async()=>{writes++;bodies.push(body());revision++;return {status:'committed',revisionBefore:1,revisionAfter:revision,createdBodyIds:['b'],validation:{geometry:'passed'}};}};
  const run=createPageBatch(api),request={context:{...context(1),expectedRevision:1},idempotencyKey:'batch',steps:[{id:'create',method:'add',args:{op:'box',params:{width:1,depth:2,height:3}}}]};delete request.context.revision;
  const receipt=await run(request);assert.equal(receipt.status,'completed');assert.equal(receipt.facts.geometryCommitted,true);assert.equal(receipt.facts.bodyCount,1);
  assert.deepEqual(await run(request),receipt);assert.equal(writes,1);
});
