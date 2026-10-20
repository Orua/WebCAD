import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareReliefReferenceSource,applyReliefDesignReference,readReliefDesignReference} from '../src/relief-design-reference.js';
import {RELIEF_REFERENCE_LIMIT,referenceImageHeader} from '../src/relief-design-reference-contract.js';
import {binaryHash} from '../src/contracts/operation-schema.js';
import {updateReliefDesigns} from '../src/relief-design-drafts.js';
import {validateBinaryAssets} from '../src/mesh/mesh-assets.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';
import {recordTimeline,restoreTimeline,validateTimeline} from '../src/document-timeline.js';
import {createPageAPI} from '../src/page-api.js';
import {createCommandService} from '../src/command-service.js';
import {validatePayload,editsDocument} from '../src/agent/protocol.js';
import {EDITOR_ACTIONS} from '../src/editor-actions.js';
const png=()=>Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1cAAAAASUVORK5CYII=','base64'));
const hash=bytes=>binaryHash(bytes).slice(7);
const design=()=>({schemaVersion:1,name:'人工设计',support:{kind:'circle',centerMm:[0,0],radiusMm:10},throughHoles:[],protectedZones:[],heightRangeMm:[0,2],points:[]});
const empty=()=>({version:2,documentId:'doc',name:'references',features:[],imports:{},reliefDesigns:[{id:'design',revision:1,draft:design()},{id:'other',revision:1,draft:design()}]});
async function source(name='original.png'){
 const bytes=png();return prepareReliefReferenceSource({name,mime:'image/png',bytes,expectedSha256:hash(bytes),expectedSize:bytes.length});
}
function decoder(fn=async()=>({width:1,height:1,close(){}})){
 const previous=globalThis.createImageBitmap;globalThis.createImageBitmap=fn;return ()=>{if(previous===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=previous;};
}
test('reference admission uses actual image signature, preallocation limits, full decoder and exact original identity',async()=>{
 let calls=0,closed=0;const restore=decoder(async blob=>{calls++;assert.equal(blob.type,'image/png');assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),png());return {width:1,height:1,close(){closed++;}};});
 try{
  const result=await source();assert.equal(calls,1);assert.equal(closed,1);assert.equal(result.reference.assetHash,hash(png()));assert.equal(result.reference.width,1);assert.deepEqual(result.bytes,png());
  const bytes=png();await assert.rejects(prepareReliefReferenceSource({name:'x.png',mime:'image/png',bytes,expectedSha256:'0'.repeat(64),expectedSize:bytes.length}),{code:'RELIEF_REFERENCE_INVALID'});
  await assert.rejects(prepareReliefReferenceSource({name:'x.png',mime:'image/jpeg',bytes,expectedSha256:hash(bytes),expectedSize:bytes.length}),{code:'RELIEF_REFERENCE_INVALID'});
  await assert.rejects(prepareReliefReferenceSource({name:'x.png',bytes,expectedSha256:hash(bytes),expectedSize:null}),{code:'RELIEF_REFERENCE_INVALID'});
  const huge=png();new DataView(huge.buffer).setUint32(16,20000);new DataView(huge.buffer).setUint32(20,20000);
  assert.throws(()=>referenceImageHeader(huge,'image/png'),{code:'RELIEF_LIMIT'});assert.equal(calls,1,'invalid identity/dimensions reject before decoding');
  globalThis.createImageBitmap=async()=>{throw Error('decode failed');};await assert.rejects(source(),{code:'RELIEF_REFERENCE_INVALID'});
 }finally{restore();}
});
test('v4 keeps one original across two drafts, delete/replace history and offline reopen, then reclaims only after history pruning',async()=>{
 const restore=decoder();try{
  const original=await source(),before=empty(),attached=applyReliefDesignReference(before,{designId:'design',expectedDraftRevision:1,action:'attach',source:original});recordTimeline(before,attached);
  const attachState=attached.timeline.entries.at(-1).id;assert.equal(attached.version,4);assert.equal(attached.reliefDesigns[0].revision,2);
  original.bytes[original.bytes.length-1]^=1;assert.deepEqual(readReliefDesignReference(attached,'design',{bytes:true}).bytes,png(),'document owns original bytes');
  const second=applyReliefDesignReference(attached,{designId:'other',expectedDraftRevision:1,action:'attach',source:await source('another-name.png')});recordTimeline(attached,second);assert.equal(Object.keys(second.binaryAssets).length,1);assert.equal(Object.keys(second.imports).length,1);
  const renamed=applyReliefDesignReference(second,{designId:'design',expectedDraftRevision:2,action:'attach',source:await source('renamed.png')});recordTimeline(second,renamed);assert.equal(renamed.reliefDesigns[0].revision,3);
  const detached=applyReliefDesignReference(renamed,{designId:'design',expectedDraftRevision:3,action:'detach'});recordTimeline(renamed,detached);
  const removed={...detached,reliefDesigns:updateReliefDesigns(detached.reliefDesigns,{id:'other',expectedDraftRevision:2,remove:true})};recordTimeline(detached,removed);assert.equal(Object.keys(removed.binaryAssets).length,1,'retained history still owns bytes');validateTimeline(removed);
  const reopened=await decodeProject(encodeProjectV4(removed));validateTimeline(reopened);assert.deepEqual(reopened.binaryAssets[hash(png())],png());
  const restored=restoreTimeline(reopened,attachState);assert.equal(restored.reliefDesigns[0].draft.reference.name,'original.png');assert.deepEqual(readReliefDesignReference(restored,'design',{bytes:true}).bytes,png());
  const pruning={...removed,timeline:{...removed.timeline,maxSteps:1}},final={...pruning,name:'pruned'};recordTimeline(pruning,final);validateTimeline(final);assert.equal(Object.keys(final.binaryAssets).length,0);assert.equal(Object.keys(final.imports).length,0);validateBinaryAssets(final);
 }finally{restore();}
});
test('dangling, corrupt or oversized reference identities cannot form a self-contained project',async()=>{
 const restore=decoder();try{
  const document=applyReliefDesignReference(empty(),{designId:'design',expectedDraftRevision:1,action:'attach',source:await source()});
  const missing={...document,binaryAssets:{}};assert.throws(()=>encodeProjectV4(missing));
  const corrupt={...document,binaryAssets:{[hash(png())]:png()}};corrupt.binaryAssets[hash(png())][40]^=1;assert.throws(()=>validateBinaryAssets(corrupt,{verifyHashes:true}));
  const dangling=structuredClone(document);dangling.reliefDesigns[0].draft.reference.importKey='forged';assert.throws(()=>encodeProjectV4(dangling),{code:'RELIEF_REFERENCE_INVALID'});
  const oversized=structuredClone(document);oversized.reliefDesigns[0].draft.reference.sizeBytes=RELIEF_REFERENCE_LIMIT+1;assert.throws(()=>encodeProjectV4(oversized),{code:'RELIEF_REFERENCE_INVALID'});
 }finally{restore();}
});
function fixture(){
 let document=empty(),revision=1,commits=0;
 const context=()=>({sessionId:'s',documentId:'doc',documentInstanceId:'i',revision});
 const service=createCommandService({snapshot:()=>({sessionId:'s',documentId:'doc',documentInstanceId:'i',revision,features:document.features,reliefDesigns:document.reliefDesigns,bodies:[],selectedIds:[],selectedTopology:null,kernelReady:true,busy:false,preview:false}),execute:async(command,args)=>{assert.equal(command,'editor_action');const next=applyReliefDesignReference(document,args.values);recordTimeline(document,next);document=next;revision++;commits++;}});
 const api=createPageAPI({state:()=>({context:context(),summary:{kernelReady:true,busy:false},preview:{active:false},bodies:[],reliefDesigns:document.reliefDesigns}),display:()=>({}),files:async()=>{throw Error('No model file operation');},confirmSaved:()=>({saved:false}),execute:input=>service.execute(input),reliefReferenceRead:(id,options)=>readReliefDesignReference(document,id,options),reliefReferenceCommit:input=>service.execute(input,{fromUI:true,referenceResourceValidated:true})});
 const args=()=>({context:{...context(),expectedRevision:revision},designId:'design',expectedDraftRevision:document.reliefDesigns[0].revision});
 return {api,args,service,document:()=>document,commits:()=>commits,change:()=>{revision++;}};
}
test('public resource-backed method commits the real CommandService action, reads original bytes and refuses JSON source insertion',async()=>{
 const restore=decoder();try{
  const f=fixture(),{api}=f,sourceResource=await api.files.register({name:'original.png',mime:'image/png',data:png()});
  assert.equal((await api.reliefDesignReference({...f.args(),action:'get'})).reference,null);
  const attached=await api.reliefDesignReference({...f.args(),action:'attach',resourceId:sourceResource.resourceId,expectedSha256:sourceResource.sha256,expectedSize:sourceResource.size});assert.equal(attached.status,'committed',JSON.stringify(attached));assert.equal(attached.draftRevision,2);assert.equal(f.commits(),1);
  await api.files.release({resourceId:sourceResource.resourceId});
  const resource=await api.reliefDesignReference({...f.args(),action:'resource'});assert.equal(resource.status,'generated',JSON.stringify(resource));assert.equal(resource.sha256,sourceResource.sha256);assert.deepEqual(await api.files.read({resourceId:resource.resourceId,as:'bytes'}),png());
  const wrongKind=await api.reliefDesignReference({...f.args(),action:'attach',resourceId:resource.resourceId});assert.equal(wrongKind.error.code,'ASSET_INVALID');
  assert.equal((await api.execute({context:f.args().context,idempotencyKey:'forged',action:'document.reliefDesignReference',args:{source:{bytes:png()}}})).error.code,'PARAM_SCHEMA_INVALID');
  assert.equal(EDITOR_ACTIONS['document.reliefDesignReference'],undefined,'internal source action is not a published JSON tool');
  const untrusted=await f.service.execute({context:f.args().context,idempotencyKey:'private',action:'document.reliefDesignReference',args:{designId:'design',expectedDraftRevision:2,action:'detach'}});assert.equal(untrusted.error.code,'PARAM_SCHEMA_INVALID');
  const detached=await api.reliefDesignReference({...f.args(),action:'detach'});assert.equal(detached.status,'committed');assert.equal(detached.reference,null);assert.equal(detached.draftRevision,3);assert.equal(f.commits(),2);
  const guessed=await api.execute({context:f.args().context,idempotencyKey:'metadata',action:'document.reliefDesign',args:{id:'design',expectedDraftRevision:3,draft:{...f.document().reliefDesigns[0].draft,reference:attached.reference}}});assert.equal(guessed.status,'failed');assert.equal(f.commits(),2);
  assert.equal((await api.reliefDesignReference({...f.args(),action:'resource'})).error.code,'RELIEF_REFERENCE_MISSING');
 }finally{restore();}
});
test('an image decoding race cannot attach to a changed document',async()=>{
 let finish,started;const entered=new Promise(resolve=>{started=resolve;}),restore=decoder(()=>{started();return new Promise(resolve=>{finish=resolve;});});
 try{const f=fixture(),resource=await f.api.files.register({name:'original.png',mime:'image/png',data:png()});const pending=f.api.reliefDesignReference({...f.args(),action:'attach',resourceId:resource.resourceId});await entered;f.change();finish({width:1,height:1,close(){}});const result=await pending;assert.equal(result.error.code,'REVISION_CONFLICT');assert.equal(f.commits(),0);assert.equal(f.document().reliefDesigns[0].draft.reference,undefined);}
 finally{restore();}
});
test('Agent reads only current reference resources; mutations need edit scope and reserve document control',()=>{
 const binding={sessionId:'s',documentId:'doc',documentInstanceId:'i'},request=action=>({method:'reliefDesignReference',args:{context:{...binding,expectedRevision:1},action,designId:'design',expectedDraftRevision:1}});
 for(const action of ['get','resource']){assert.doesNotThrow(()=>validatePayload(request(action),binding,['cad.read']));assert.equal(editsDocument(request(action)),false);}
 for(const action of ['attach','detach']){assert.throws(()=>validatePayload(request(action),binding,['cad.read']),{code:'scope_denied'});assert.doesNotThrow(()=>validatePayload(request(action),binding,['cad.read','cad.edit']));assert.equal(editsDocument(request(action)),true);}
});
