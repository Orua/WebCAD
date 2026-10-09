import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostAdapter} from '../src/agent/host-adapter.js';
import {validatePayload} from '../src/agent/protocol.js';

const context={sessionId:'page',documentId:'document',documentInstanceId:'instance',revision:0};
const requestContext={...context,expectedRevision:0};delete requestContext.revision;
const session={cadSessionId:'cad',leaseEpoch:1,binding:context,scopes:['cad.read','cad.edit','cad.export']};
const envelope=payload=>({protocol:'goldenluck.webcad/1',cadSessionId:'cad',leaseEpoch:1,taskId:'task',commandId:'a'.repeat(32),requestHash:'hash',deadline:Date.now()/1000+30,payload});
const payload={method:'run',args:{context:requestContext,idempotencyKey:'first',steps:[{id:'part',method:'add',args:{op:'box',params:{},refs:[]}}]}};

function setup({loseResult=false,loseAck=false}={}) {
  let invokes=0,submits=0,failed=false;
  const reports=[],jobs=new Map();
  const api={connect(){},getState:()=>({context}),invoke:async()=>{invokes++;return {status:'read',context};},
    submit(input){submits++;jobs.set(input.jobId,{status:'committed',result:{status:'completed',context,results:[]}});},
    getJob:({jobId})=>jobs.get(jobId),cancelJob:()=>({cancelled:false,reason:'RUNNING_KERNEL_NOT_INTERRUPTIBLE'})};
  const adapter=createHostAdapter({api,session,report:async(kind,command,body)=>{
    if(!failed && (loseResult && kind==='result' || loseAck && kind==='ack')) {failed=true;throw new Error('network lost');}
    reports.push({kind,command,body});
  }});
  return {adapter,reports,counts:()=>({invokes,submits}),api};
}

test('uses the public job and uploads its original receipt once',async()=>{
  const {adapter,reports,counts}=setup();
  const result=await adapter.receive(envelope(payload));
  assert.equal(result.status,'completed');assert.equal(counts().submits,1);
  assert.deepEqual(reports.map(item=>item.kind),['ack','result']);
});
test('lost result can be resent without geometry replay',async()=>{
  const {adapter,counts}=setup({loseResult:true});
  await assert.rejects(adapter.receive(envelope(payload)),/network lost/);
  const result=await adapter.receive(envelope(payload));
  assert.equal(result.status,'completed');assert.equal(counts().submits,1);
});
test('lost submit acknowledgement reconciles the existing job',async()=>{
  const {adapter,counts}=setup({loseAck:true});
  assert.equal((await adapter.receive(envelope(payload))).status,'completed');
  assert.equal(counts().submits,1);
});
test('changed command ID contents are rejected',async()=>{
  const {adapter}=setup();await adapter.receive(envelope(payload));
  assert.throws(()=>adapter.receive(envelope({method:'getState',args:{}})),/different payload/);
});
test('never evaluates arbitrary code, including within native run',()=>{
  assert.throws(()=>validatePayload({method:'eval',args:{code:'danger'}},context,session.scopes),/structured/);
  const nested=structuredClone(payload);nested.args.steps[0].method='invoke';
  assert.throws(()=>validatePayload(nested,context,session.scopes),/structured/);
});
test('old page instances and missing edit grants are rejected',()=>{
  const stale=structuredClone(payload);stale.args.context.documentInstanceId='old';
  assert.throws(()=>validatePayload(stale,context,session.scopes),/instance/);
  assert.throws(()=>validatePayload(payload,context,['cad.read']),/edit/);
});
test('released adapter retains receipts and stops new geometry',async()=>{
  const {adapter,counts}=setup();adapter.release();
  const result=await adapter.receive(envelope(payload));
  assert.equal(result.status,'failed');assert.equal(counts().submits,0);
});
test('wrong server binding cannot reach the page',()=>{
  const {adapter}=setup();assert.throws(()=>adapter.receive({...envelope(payload),cadSessionId:'other'}),/envelope/);
});
test('native partial results survive unchanged',async()=>{
  const {adapter,api}=setup();api.submit=input=>{};api.getJob=()=>({status:'partial',result:{status:'partial',progress:{completedStepIds:['part'],unattemptedStepIds:['later']},context}});
  const result=await adapter.receive(envelope(payload));assert.equal(result.status,'partial');assert.deepEqual(result.progress.completedStepIds,['part']);
});

test('native connect and getState objects are successful read receipts',async()=>{
  const {adapter,api}=setup();api.invoke=async()=>({product:'WebCAD',context});
  const result=await adapter.receive(envelope({method:'connect',args:{}}));
  assert.equal(result.status,'read');assert.equal(result.product,'WebCAD');
});

test('a missing submitted job result stays unknown and later reconciles without replay',async()=>{
  const {adapter,api,counts}=setup();let unavailable=true;
  api.getJob=()=>{if(unavailable)throw new Error('receipt unavailable');return {status:'committed',result:{status:'committed',context}};};
  assert.equal((await adapter.receive(envelope(payload))).status,'unknown');
  adapter.endTask('task');assert.equal(adapter.state().pending.length,1);
  unavailable=false;await adapter.reconcilePending();
  assert.equal(adapter.state().pending.length,0);assert.equal(adapter.state().activeTask,null);
  assert.equal(counts().submits,1);
});

test('ended tasks cannot dispatch queued new geometry',async()=>{
  const {adapter,counts}=setup();adapter.endTask('task');
  assert.equal((await adapter.receive(envelope(payload))).error.code,'task_ended');
  assert.equal(counts().submits,0);
});
