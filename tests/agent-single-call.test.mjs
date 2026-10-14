import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LIMITS} from '../src/limits.js';
import {AGENT_CONTRACT} from '../src/agent/protocol.js';
import {FILE_TYPED_BYTE_BUDGETS} from '../src/browser-file-contracts.js';
import {createCommandService} from '../src/command-service.js';
import {getOperation} from '../src/operation-registry.js';
import {createReferenceSystem} from '../src/work-frame.js';

test('batch step cap is 40 and published in the agent contract',()=>{
  assert.equal(LIMITS.batch.maxSteps,40);
  assert.equal(AGENT_CONTRACT.limits.batch.maxSteps,40);
  assert.equal(AGENT_CONTRACT.limits.transport.waitMaxMs,25000);
});
test('every typed file budget and mesh budget is 100 MiB',()=>{
  for(const v of Object.values(FILE_TYPED_BYTE_BUDGETS))assert.equal(v,100*1024*1024);
  for(const k of ['maxSourceBytes','maxAssetBytes','maxProjectBytes'])assert.equal(LIMITS.mesh[k],100*1024*1024);
});
test('page-batch reads the published cap rather than a literal 20',()=>{
  const src=readFileSync(new URL('../src/page-batch.js',import.meta.url),'utf8');
  assert.match(src,/LIMITS\.batch\.maxSteps/);assert.doesNotMatch(src,/length>20\)/);
});
test('write receipts carry a reusable requestContext; capture supports maxWidth/webp',()=>{
  const cs=readFileSync(new URL('../src/command-service.js',import.meta.url),'utf8');
  assert.match(cs,/requestContext:\{sessionId:afterCtx\.sessionId/);
  assert.match(cs,/compact/);
  const api=readFileSync(new URL('../src/page-api.js',import.meta.url),'utf8');
  assert.match(api,/check\(input,\['context','maxWidth','format','quality'\]\)/);
  const vp=readFileSync(new URL('../src/viewport.js',import.meta.url),'utf8');
  assert.match(vp,/image\/webp/);
});

test('receipt requestContext chains writes without getState; stale revision still rejected; compact state',async()=>{
  const s={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1,features:[],bodies:[],kernelReady:true,busy:false,referenceSystem:createReferenceSystem()};
  const service=createCommandService({snapshot:()=>structuredClone(s),execute:async(command,args)=>{const f={id:'f'+(s.features.length+1),op:args.op,params:args.params,refs:args.refs};s.features.push(f);s.bodies.push({id:f.id,name:'B',kind:'solid'});s.revision++;}});
  const box=getOperation('box');
  const add=(context,key)=>service.execute({context,idempotencyKey:key,action:'feature.add',args:{op:'box',opVersion:box.version,schemaHash:box.schemaHash,refs:[],params:{width:10,depth:8,height:4}}});
  const first=await add({sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:1},'k1');
  assert.equal(first.status,'committed');assert.deepEqual(first.requestContext,{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:2});
  const second=await add(first.requestContext,'k2');assert.equal(second.status,'committed');assert.equal(second.requestContext.expectedRevision,3);
  const replay=await add({sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:1},'k1');
  assert.equal(replay.revisionAfter,2,'same idempotency key returns the original receipt, no re-execution');assert.equal(s.revision,3);
  const stale=await add(first.requestContext,'k3');
  assert.notEqual(stale.status,'committed');
  assert.equal(stale.error?.code??stale.code,'REVISION_CONFLICT');
  const compact=service.getState({sessionId:'s',compact:true});
  assert.deepEqual(compact.bodies,[{id:'f1',name:'B',kind:'solid'},{id:'f2',name:'B',kind:'solid'}]);
  assert.equal(compact.features,undefined);
  assert.equal(compact.requestContext.expectedRevision,3);
});
