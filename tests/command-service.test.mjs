import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommandService } from '../src/command-service.js';
import { getOperation } from '../src/operation-registry.js';
function setup(){
  let state={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1,features:[],bodies:[],selectedIds:[],selectedTopology:null,kernelReady:true,busy:false,preview:false,persistence:{level:'memory',checkpoint:'pending'}};
  let calls=0,lateAbort;
  const service=createCommandService({snapshot:()=>structuredClone(state),query:async({bodyId,kind})=>({bodyId,kind,geometryFingerprint:'fingerprint',matchCount:2,items:[{topologyId:0},{topologyId:1}]}),execute:async(command,args)=>{
    calls++;
    if(command==='add_feature'){state.features.push({id:'f'+calls,op:args.op,params:args.params,refs:args.refs});state.bodies=[{id:'f'+calls}];state.revision++;}
    if(command==='refresh')state.revision++;
    lateAbort?.abort();
  }});
  const context=()=>({sessionId:state.sessionId,documentId:state.documentId,documentInstanceId:state.documentInstanceId,expectedRevision:state.revision});
  const add=(params={width:50,depth:30,height:3},extra={})=>({context:context(),idempotencyKey:crypto.randomUUID(),action:'feature.add',args:{op:'box',opVersion:getOperation('box').version,schemaHash:getOperation('box').schemaHash,params,refs:[]},...extra});
  return {service,state,context,add,get calls(){return calls;},abortAfterCommit(c){lateAbort=c;}};
}
test('same-instance receipts replay exact result, conflicting reuse rejected, reconnect replay works',async()=>{
 const t=setup(),input=t.add();const first=await t.service.execute(input);assert.equal(first.status,'committed');
 assert.deepEqual(await t.service.execute(input),first);assert.equal(t.calls,1);
 const changed=structuredClone(input);changed.args.params.width=60;assert.equal((await t.service.execute(changed)).error.code,'IDEMPOTENCY_KEY_REUSED');
 t.state.sessionId='new-session';input.context.sessionId='new-session';assert.deepEqual(await t.service.execute(input),first);assert.equal(t.calls,1);
});
test('context checks and strict input rejection precede any model modification',async()=>{
 for(const field of ['documentId','documentInstanceId','expectedRevision']){
  const t=setup(),a=t.add();a.context[field]=field==='expectedRevision'?999:'wrong';const result=await t.service.execute(a);assert.equal(result.status,'failed');assert.equal(t.calls,0);
 }
 for(const params of [{width:1,depth:2,height:3,diameter:4},{width:NaN,depth:2,height:3},{width:'50',depth:30,height:3}]){
  const t=setup();assert.equal((await t.service.execute(t.add(params))).status,'failed');assert.equal(t.calls,0);
 }
});
test('late abort retains committed receipt and early abort does not execute',async()=>{
 const t=setup(),controller=new AbortController();t.abortAfterCommit(controller);const r=await t.service.execute(t.add(),{signal:controller.signal});assert.equal(r.status,'committed');assert(controller.signal.aborted);
 const q=setup();assert.equal((await q.service.execute(q.add(),{signal:controller.signal})).status,'failed');assert.equal(q.calls,0);
});
test('concurrent duplicate commands produce one edit',async()=>{
 const t=setup(),a=t.add(),[x,y]=await Promise.all([t.service.execute(a),t.service.execute(a)]);assert.deepEqual(x,y);assert.equal(t.calls,1);
});
test('query ambiguity, pagination, stale reference and preview isolation',async()=>{
 const t=setup();await t.service.execute(t.add());const q={context:t.context(),bodyId:'f1',kind:'edge',filter:{}};
 assert.equal((await t.service.queryGeometry({...q,limit:1})).error.code,'AMBIGUOUS_SELECTION');
 const page=await t.service.queryGeometry({...q,requireUnique:false,limit:1});assert.equal(page.matchCount,2);assert.equal(page.items.length,1);assert(page.nextCursor);
 const second=await t.service.queryGeometry({...q,requireUnique:false,limit:1,cursor:page.nextCursor});assert.equal(second.items[0].topologyId,1);
 t.state.preview=true;assert.equal((await t.service.queryGeometry(q)).error.code,'PREVIEW_ACTIVE');t.state.preview=false;t.state.revision++;
 assert.equal((await t.service.queryGeometry(q)).error.code,'REVISION_CONFLICT');
});
test('undo with no history is no_change and refresh increases revision',async()=>{
 const t=setup();let r=await t.service.execute({context:t.context(),idempotencyKey:'undo',action:'history.undo',args:{}});assert.equal(r.status,'no_change');assert.equal(t.state.revision,1);
 r=await t.service.execute({context:t.context(),idempotencyKey:'refresh',action:'document.refresh',args:{}});assert.equal(r.status,'committed');assert.equal(t.state.features.length,0);
});
test('upstream edit rejects unproven downstream index references',async()=>{
 const t=setup();await t.service.execute(t.add());t.state.features.push({id:'downstream',op:'fillet',params:{edgeIds:[1]},refs:['f1']});
 const card=getOperation('box');const r=await t.service.execute({context:t.context(),idempotencyKey:'edit',action:'feature.edit',args:{featureId:'f1',opVersion:card.version,schemaHash:card.schemaHash,params:{width:60}}});
 assert.equal(r.error.code,'UNSAFE_LEGACY_REFERENCE');assert.equal(t.calls,1);
});
test('state excludes imported file bytes and explicitly reports memory persistence',()=>{
 const t=setup();t.state.imports={key:{data:'secret bytes'}};const result=t.service.getState({sessionId:'s'});assert.equal(result.status,'read');assert(!JSON.stringify(result).includes('secret bytes'));assert.equal(result.persistence.level,'memory');
});
