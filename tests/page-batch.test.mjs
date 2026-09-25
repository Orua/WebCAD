import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageBatch} from '../src/page-batch.js';
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
