import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageAPI } from '../src/page-api.js';

function fixture(){
  const s={revision:1,busy:false};
  const host={buildId:'test',files:async()=>({}),confirmSaved:async()=>({}),displayBatch:{begin(){},end(){},endDeferred(){},flush(){}},revisionKey:()=>`i:${s.revision}:${s.busy?1:0}`,
    state:()=>({context:{sessionId:'p',documentId:'d',documentInstanceId:'i',revision:s.revision},summary:{busy:s.busy,kernelReady:true},preview:{},bodies:[]})};
  return {s,api:createPageAPI(host)};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('watchRevision fires once per stable change, debounced, and stops on unsubscribe',async()=>{
  const {s,api}=fixture(),seen=[];
  const stop=api.watchRevision(event=>{seen.push(event.context.revision);},{debounceMs:40,intervalMs:10});
  await sleep(80);assert.deepEqual(seen,[],'no callback without a change');
  s.revision=2;await sleep(5);s.revision=3;await sleep(120);
  assert.deepEqual(seen,[3],'burst of revisions collapses into one callback with the latest state');
  s.busy=true;await sleep(120);assert.deepEqual(seen,[3,3],'readiness change also notifies');
  stop();s.revision=4;await sleep(120);assert.deepEqual(seen,[3,3]);
});
test('watchRevision is host-only: not part of invoke, context policies or the agent contract and validates options',async()=>{
  const {api}=fixture();
  assert.equal(api.contextPolicies.watchRevision,undefined);
  assert.equal((await api.invoke({method:'watchRevision',args:{}})).error.code,'PARAM_SCHEMA_INVALID');
  assert.throws(()=>api.watchRevision(null),/callback/);
  assert.throws(()=>api.watchRevision(()=>{},{debounceMs:-1}),/debounceMs/);
  const stop=api.watchRevision(()=>{throw new Error('host bug');},{debounceMs:0,intervalMs:10});stop();
});
