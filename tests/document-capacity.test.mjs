import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DOCUMENT_LIMITS,assertFeatureCapacity,serializeBoundedDocument} from '../src/document-limits.js';
import {recordTimeline,validateTimeline} from '../src/document-timeline.js';
import {createCommandService} from '../src/command-service.js';
import {getOperation} from '../src/operation-registry.js';
import {createReferenceSystem} from '../src/work-frame.js';
import {getTool} from '../src/page-api-docs.js';

const features=n=>Array.from({length:n},(_,i)=>({id:'f'+i,op:'box',params:{width:1,depth:1,height:1},refs:[]}));
const empty=()=>({version:2,documentId:'capacity-test',name:'test',features:[],imports:{},hidden:[],referenceSystem:{workFrame:{locked:true}}});
function mainHarness(){
 const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
 const calls=[];
 const c={TextEncoder,structuredClone,clone:structuredClone,crypto,DOCUMENT_LIMITS,serializeBoundedDocument,recordTimeline,validateTimeline,documentModel:empty(),revision:7,documentInstanceId:'instance',kernelReady:true,busy:false,bodies:[],selectedIds:[],lastWarnings:[],undoStack:[{sentinel:'undo'}],redoStack:[{sentinel:'redo'}],previewNext:null,previewIdentity:null,previewScopeReport:null,dirty:false,
  setBusy:v=>c.busy=v,checkTransaction:()=>{},assertHistoryEditSafe:()=>{},request:async(command,{document})=>{calls.push(structuredClone(document));return {bodies:[]};},synchronizeBodyAnchors:async()=>{},viewport:{cancelTask(){},setBodies(){},setWorkFrame(){},setSelection(){},markModel(){}},ui:{clearErrors(){}},applyAppearance(){},setStatus(){},recordQuickModelUse(){},validateReferenceSystem:x=>x};
 vm.createContext(c);vm.runInContext(slice('function pushUndo(','function setBusy(')+slice('async function rebuild(','function featureDocument(')+slice('function validateDocument(','async function openFiles(')+'\nthis.rebuild=rebuild;this.validateDocument=validateDocument;this.pushUndo=pushUndo;',c);
 return {c,calls};
}
test('the exact UTF-8 compact file limit and 2000 feature boundary are shared',()=>{
 const doc=empty();doc.features=features(2000);assert.doesNotThrow(()=>serializeBoundedDocument(doc));assert.throws(()=>assertFeatureCapacity(doc.features,1),{code:'SIZE_LIMIT'});
 const sized=empty();sized.padding='';const base=serializeBoundedDocument(sized).length;sized.padding='中'+'x'.repeat(DOCUMENT_LIMITS.maxBytes-base-3);
 assert.equal(serializeBoundedDocument(sized).length,DOCUMENT_LIMITS.maxBytes);
 sized.padding+='x';assert.throws(()=>serializeBoundedDocument(sized),{code:'SIZE_LIMIT',path:'document'});
});
test('actual main rebuild rejects an over-capacity mutation before Worker and preserves runtime history',async()=>{
 const {c,calls}=mainHarness(),next={...empty(),features:features(2001)},before=structuredClone(c.documentModel);
 await assert.rejects(c.rebuild(next,{save:false}),{code:'SIZE_LIMIT'});
 assert.equal(calls.length,0);assert.deepEqual(c.documentModel,before);assert.equal(c.revision,7);assert.equal(c.dirty,false);assert.equal(c.busy,false);
 assert.deepEqual(c.undoStack,[{sentinel:'undo'}]);assert.deepEqual(c.redoStack,[{sentinel:'redo'}]);assert.throws(()=>c.validateDocument(next),{code:'SIZE_LIMIT'});
});
test('actual main rebuild commits the feature boundary and the resulting document reopens',async()=>{
 const {c,calls}=mainHarness();await c.rebuild({...empty(),features:features(2000)},{save:false,restoring:true});
 assert.equal(calls.length,1);assert.equal(c.revision,8);assert.equal(c.documentModel.features.length,2000);assert.equal(c.validateDocument(c.documentModel).features.length,2000);
 assert.equal(c.undoStack.length,2);assert.equal(c.redoStack.length,0);validateTimeline(c.documentModel);
});
test('post-Worker anchor growth rolls back the Worker before touching document, undo or redo',async()=>{
 for(const record of [true,false]){
  const {c,calls}=mainHarness(),next={...empty(),features:features(1)},before=structuredClone(c.documentModel);
  c.synchronizeBodyAnchors=async(_old,doc)=>{doc.referenceSystem.padding='x'.repeat(DOCUMENT_LIMITS.maxBytes);};
  await assert.rejects(c.rebuild(next,{save:false,record}),{code:'SIZE_LIMIT'});
  assert.equal(calls.length,2);assert.deepEqual(calls[1],before);assert.deepEqual(c.documentModel,before);assert.equal(c.revision,7);assert.equal(c.dirty,false);assert.equal(c.busy,false);
  assert.deepEqual(c.undoStack,[{sentinel:'undo'}]);assert.deepEqual(c.redoStack,[{sentinel:'redo'}]);
 }
});
test('metadata-only writes validate capacity before changing undo and redo stacks',()=>{
 const {c}=mainHarness();const next=empty();next.name='x'.repeat(DOCUMENT_LIMITS.maxBytes);
 assert.throws(()=>c.pushUndo(next,'rename'),{code:'SIZE_LIMIT'});assert.equal(c.documentModel.name,'test');assert.deepEqual(c.undoStack,[{sentinel:'undo'}]);assert.deepEqual(c.redoStack,[{sentinel:'redo'}]);
});
test('public command guards account for bulk additions and retain edit/remove/cancel access at capacity',async()=>{
 const op=getOperation('box'),addArgs={op:'box',opVersion:op.version,schemaHash:op.schemaHash,params:{width:1,depth:1,height:1},refs:[]};
 for(const count of [1999,2000]){
  const s={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1,features:features(count),bodies:[{id:'f0',solidCount:2},{id:'f1'}],kernelReady:true,busy:false,referenceSystem:createReferenceSystem()};let calls=0;
  const service=createCommandService({snapshot:()=>structuredClone(s),execute:async()=>{calls++;}}),context={sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:1};
  const execute=(action,args)=>service.execute({context,idempotencyKey:crypto.randomUUID(),action,args});
  for(const [action,args]of [['body.align',{bodyIds:['f0','f1'],target:{kind:'origin'}}],['body.explode',{bodyId:'f0'}]]){
   const result=await execute(action,args);assert.equal(result.error?.code,'SIZE_LIMIT');assert.equal(result.commitState,'not_committed');
  }
  assert.equal(calls,0);
  const added=await execute('feature.add',addArgs);assert.equal(added.status,count===2000?'failed':'no_change');if(count===2000)assert.equal(added.error.code,'SIZE_LIMIT');
  const imported=await service.fileCommand({context,action:'import',args:{}});assert.equal(imported.status,count===2000?'failed':'committed');if(count===2000)assert.equal(imported.error.code,'SIZE_LIMIT');
  if(count===2000){
   assert.equal(calls,0);
   assert.equal((await execute('preview.start',addArgs)).error.code,'SIZE_LIMIT');
   assert.equal((await execute('feature.edit',{featureId:'f0',opVersion:op.version,schemaHash:op.schemaHash,params:{width:2}})).status,'no_change');
   assert.equal((await execute('feature.remove',{bodyIds:['f0']})).status,'no_change');
   s.preview=true;assert.equal((await execute('preview.commit',{})).error.code,'SIZE_LIMIT');assert.equal((await execute('preview.cancel',{})).status,'no_change');assert.equal(calls,3);
  }
 }
});
test('retained timeline baselines cannot hide over-capacity states',()=>{
 const before={...empty(),features:features(2001)},next={...empty(),features:features(2000)};recordTimeline(before,next);
 assert.throws(()=>validateTimeline(next),{code:'HISTORY_INVALID'});
});

test('AI cards expose the same document limits and coded errors for affected entry points',()=>{
 for(const id of ['box','body.align','body.explode','history.restore','preview.start','files.import','files.open','files.save','pasteSelection','execute','document.parameters']){
  const card=getTool({id});assert.deepEqual(card.documentLimits,DOCUMENT_LIMITS,id);assert.ok(card.errorCodes.includes('SIZE_LIMIT'),id);
 }
});
