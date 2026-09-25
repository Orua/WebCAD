import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommandService } from '../src/command-service.js';
import { getOperation } from '../src/operation-registry.js';
import { EDITOR_ACTIONS, validateEditorAction } from '../src/editor-actions.js';
import { createReferenceSystem } from '../src/work-frame.js';

test('editor contracts reject invalid colors/materials/references and preserve exact intent',()=>{
 const state={bodies:[{id:'b',solidCount:2}],features:[{id:'f'}]};
 const valid={ 'document.rename':{name:'设计'},'feature.rename':{featureId:'f',name:'导入体'},'body.visibility':{bodyIds:['b'],visible:false},'body.appearance':{bodyIds:['b'],color:'#123abc',finish:'design'},'document.appearance':{finish:'nickel'},'body.explode':{bodyId:'b'}};
 for(const id of Object.keys(EDITOR_ACTIONS))assert.deepEqual(validateEditorAction(id,valid[id],state).args.values,valid[id]);
 for(const a of [{bodyIds:['b'],color:'red'},{bodyIds:['b'],color:'#123456',extra:1},{bodyIds:['wrong'],color:'#123456'},{bodyIds:['b','b'],finish:'design'},{bodyIds:['b'],finish:'fake'},{bodyIds:[]}])assert.throws(()=>validateEditorAction('body.appearance',a,state));
 assert.deepEqual(validateEditorAction('body.appearance',{bodyIds:['b'],color:null,finish:null},state).args.values,{bodyIds:['b'],color:null,finish:null});
});

test('editor changes share revision guards, queue and duplicate receipts',async()=>{
 let calls=0;const s={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1,features:[],bodies:[{id:'b'}],selectedIds:[],kernelReady:true,busy:false};
 const service=createCommandService({snapshot:()=>structuredClone(s),execute:async(command,args)=>{assert.equal(command,'editor_action');calls++;s.colors={b:args.values.color};s.revision++;}});
 const input={context:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:1},idempotencyKey:'color',action:'body.appearance',args:{bodyIds:['b'],color:'#123456'}};
 const [a,b]=await Promise.all([service.execute(input),service.execute(input)]);assert.deepEqual(a,b);assert.equal(calls,1);assert.equal(a.validation.geometry,'unchanged');
 const stale=await service.execute({...input,idempotencyKey:'stale'});assert.equal(stale.error.code,'REVISION_CONFLICT');assert.equal(calls,1);
});

test('active previews can be committed or cancelled through the same command queue',async()=>{
 const s={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1,features:[],bodies:[],kernelReady:true,busy:false,preview:true};
 const service=createCommandService({snapshot:()=>structuredClone(s),execute:async command=>{assert.equal(command,'preview.cancel');s.preview=false;}});
 const r=await service.execute({context:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:1},idempotencyKey:'cancel',action:'preview.cancel',args:{}});
 assert.equal(r.status,'no_change');assert.equal(r.preview.active,false);
});
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
test('versioned preview updates reject stale generations and keep draft edits out of model revision',async()=>{
 const s={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:4,features:[],bodies:[],kernelReady:true,busy:false,preview:true,referenceSystem:createReferenceSystem(),previewInfo:{previewId:'preview-1',generation:1,baseRevision:4,owner:'api'},previewDraft:{op:'box',params:{width:20,depth:10,height:3},refs:[],name:'板件'}};
 const service=createCommandService({snapshot:()=>structuredClone(s),execute:async(command,args)=>{if(command==='preview_update'){s.previewInfo=args.previewIdentity;s.previewDraft.params=args.params;}else if(command==='preview.cancel'){s.preview=false;s.previewInfo=null;}else throw Error(command);}});
 const context={sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:4};
 const update=(generation,key)=>service.execute({context,idempotencyKey:key,action:'preview.update',args:{previewId:'preview-1',expectedGeneration:generation,patch:{params:{width:25}}}});
 const first=await update(1,'update-1');assert.equal(first.status,'previewing');assert.equal(first.preview.generation,2);assert.equal(s.revision,4);assert.equal(s.features.length,0);
 assert.equal((await update(1,'stale')).error.code,'STALE_REFERENCE');
 assert.equal((await service.execute({context,idempotencyKey:'bad-commit',action:'preview.commit',args:{previewId:'preview-1',expectedGeneration:1}})).error.code,'STALE_REFERENCE');
 const cancelled=await service.execute({context,idempotencyKey:'cancel-2',action:'preview.cancel',args:{previewId:'preview-1',expectedGeneration:2}});assert.equal(cancelled.status,'no_change');assert.equal(cancelled.preview.active,false);
});
test('registered file preview uses explicit placement and versioned update before commit',async()=>{
 const s={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:2,features:[],bodies:[],kernelReady:true,busy:false,preview:false,referenceSystem:createReferenceSystem()};
 const service=createCommandService({snapshot:()=>structuredClone(s),execute:async(command,args)=>{if(command==='preview_file'){s.preview=true;s.previewInfo=args.previewIdentity;s.previewDraft={op:'import',params:{key:'input'},refs:[],placement:args.fileImport.placement};}else if(command==='preview_file_update'){s.previewInfo=args.previewIdentity;s.previewDraft.placement=args.placement;}else if(command==='preview.commit'){s.preview=false;s.previewInfo=null;s.previewDraft=null;s.revision++;}else throw Error(command);}});
 const context={sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:2},fileImport={resourceId:'registered',name:'part.step',data:'QQ==',placement:{version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}}};
 const start=await service.execute({context,idempotencyKey:'start-file',action:'preview.start',args:{fileImport}});assert.equal(start.status,'previewing',JSON.stringify(start));assert.equal(start.preview.generation,1);assert.equal(s.revision,2);
 const updated=await service.execute({context,idempotencyKey:'update-file',action:'preview.update',args:{previewId:start.preview.previewId,expectedGeneration:1,patch:{placement:{version:1,frame:{kind:'snapshot',origin:[100,50,0],quaternion:[0,0,0,1]},sourceAnchor:{kind:'bounds-center'}}}}});assert.equal(updated.status,'previewing',JSON.stringify(updated));assert.equal(updated.preview.generation,2);assert.equal(s.previewDraft.placement.frameSnapshot.origin[0],100);
 const committed=await service.execute({context,idempotencyKey:'commit-file',action:'preview.commit',args:{previewId:start.preview.previewId,expectedGeneration:2}});assert.equal(committed.status,'committed');assert.equal(s.revision,3);
});
test('reference candidates verify point, geometry fingerprint and revision before moving work frame',async()=>{
 const state={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1,features:[],bodies:[{id:'b'}],selectedIds:[],kernelReady:true,busy:false,preview:false,referenceSystem:createReferenceSystem()};
 let fingerprint='brep-sha256:first',calls=0;
 const service=createCommandService({snapshot:()=>structuredClone(state),query:async()=>({geometryFingerprint:fingerprint}),execute:async(command,args)=>{assert.equal(command,'reference_action');calls++;state.referenceSystem=args.referenceSystem;state.revision++;}});
 const context=()=>({sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:state.revision});
 const register=(id)=>service.registerReferenceCandidates(context(),[{referenceId:id,kind:'point',worldPoint:[2,3,4],source:{bodyId:'b',topologyKind:'edge',geometryFingerprint:fingerprint},context:{documentId:'d',documentInstanceId:'i',revision:state.revision}}]);
 const move=(id,origin,key)=>service.execute({context:context(),idempotencyKey:key,action:'reference.setWorkFrame',args:{referenceId:id,origin,quaternion:[0,0,0,1]}});
 register('a');assert.equal((await move('a',[2,3,5],'mismatch')).error.code,'SOURCE_ANCHOR_INVALID');assert.equal(calls,0);
 fingerprint='brep-sha256:changed';assert.equal((await move('a',[2,3,4],'changed')).error.code,'STALE_REFERENCE');assert.equal(calls,0);
 register('b');assert.equal((await move('b',[2,3,4],'valid')).status,'committed');assert.equal(calls,1);assert.deepEqual(state.referenceSystem.workFrame.origin,[2,3,4]);
 assert.equal((await move('b',[2,3,4],'old')).error.code,'STALE_REFERENCE');assert.equal(calls,1);
 state.documentInstanceId='next';state.revision=1;assert.throws(()=>service.registerReferenceCandidates({sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:1},[]),{code:'INSTANCE_MISMATCH'});
});
test('named body anchors are verified metadata with versioned update and deletion',async()=>{
 const state={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1,features:[],bodies:[{id:'b'}],selectedIds:[],kernelReady:true,busy:false,preview:false,referenceSystem:createReferenceSystem()};
 let fingerprint='brep-sha256:initial';
 const service=createCommandService({snapshot:()=>structuredClone(state),query:async()=>({geometryFingerprint:fingerprint}),execute:async(command,args)=>{assert.equal(command,'reference_action');state.referenceSystem=args.referenceSystem;state.revision++;}});
 const context=()=>({sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:state.revision});
 const register=(id)=>service.registerReferenceCandidates(context(),[{referenceId:id,kind:'point',worldPoint:[5,6,7],source:{bodyId:'b',topologyKind:'edge',geometryFingerprint:fingerprint},context:{documentId:'d',documentInstanceId:'i',revision:state.revision}}]);
 const action=(name,args)=>service.execute({context:context(),idempotencyKey:crypto.randomUUID(),action:name,args});
 register('p1');assert.equal((await action('reference.setBodyAnchor',{bodyId:'wrong',referenceId:'p1',name:'安装点',quaternion:[0,0,0,1]})).error.code,'STALE_REFERENCE');
 const created=await action('reference.setBodyAnchor',{bodyId:'b',referenceId:'p1',name:'安装点',quaternion:[0,0,0,1]});assert.equal(created.status,'committed');
 const anchor=state.referenceSystem.bodyAnchors[0];assert.equal(anchor.anchorVersion,1);assert.deepEqual(anchor.worldPoint,[5,6,7]);
 assert.equal((await action('reference.deleteBodyAnchor',{bodyId:'b',anchorId:anchor.anchorId,expectedAnchorVersion:2})).error.code,'STALE_REFERENCE');
 register('p2');fingerprint='brep-sha256:changed';assert.equal((await action('reference.setBodyAnchor',{bodyId:'b',anchorId:anchor.anchorId,expectedAnchorVersion:1,referenceId:'p2',name:'安装点2',quaternion:[0,0,0,1]})).error.code,'STALE_REFERENCE');
 register('p3');assert.equal((await action('reference.setBodyAnchor',{bodyId:'b',anchorId:anchor.anchorId,expectedAnchorVersion:1,referenceId:'p3',name:'安装点2',quaternion:[0,0,0,1]})).status,'committed');assert.equal(state.referenceSystem.bodyAnchors[0].anchorVersion,2);
 assert.equal((await action('reference.deleteBodyAnchor',{bodyId:'b',anchorId:anchor.anchorId,expectedAnchorVersion:2})).status,'committed');assert.equal(state.referenceSystem.bodyAnchors.length,0);
});
test('state excludes imported file bytes and explicitly reports memory persistence',()=>{
 const t=setup();t.state.imports={key:{data:'secret bytes'}};const result=t.service.getState({sessionId:'s'});assert.equal(result.status,'read');assert(!JSON.stringify(result).includes('secret bytes'));assert.equal(result.persistence.level,'memory');
});
