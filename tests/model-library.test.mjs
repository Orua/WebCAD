import test from 'node:test';
import assert from 'node:assert/strict';
import {createModelLibrary,MODEL_LIBRARY_KEY,defaultModelLibrary} from '../src/model-library.js';
import {createPageAPI} from '../src/page-api.js';
import {getTool} from '../src/page-api-docs.js';
import {READ_METHODS,VIEW_METHODS,DISCOVERY_METHODS} from '../src/agent/protocol.js';

const storage = () => {const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
const preset={id:'ring_30',kind:'ring',label:'常用圆圈',defaults:{innerDiameter:30,sectionSize:4}};
test('model library CRUD, exact ordering, refresh persistence and full default restore',()=>{
  const disk=storage(),library=createModelLibrary(()=>disk),defaults=defaultModelLibrary();
  assert.equal(library.read().revision,0);
  library.update({expectedLibraryRevision:0,operation:'upsert',entry:preset});
  const next=createModelLibrary(()=>disk);assert.equal(next.read().entries.at(-1).defaults.innerDiameter,30);
  next.update({expectedLibraryRevision:1,operation:'move',id:preset.id,index:0});assert.equal(next.read().entries[0].id,preset.id);
  next.update({expectedLibraryRevision:2,operation:'upsert',entry:{...preset,label:'改名'}});assert.equal(next.read().entries[0].label,'改名');
  next.update({expectedLibraryRevision:3,operation:'remove',id:'ring'});assert(!next.read().entries.some(entry=>entry.id==='ring'));
  next.update({expectedLibraryRevision:4,operation:'restore'});assert.deepEqual(next.read().entries,defaults);
});
test('library deletion never changes already resolved feature recipe',()=>{
  const disk=storage(),saved=createModelLibrary(()=>disk);saved.update({expectedLibraryRevision:0,operation:'upsert',entry:preset});
  const recipe=saved.resolve({id:preset.id,expectedLibraryRevision:1,params:{sectionSize:5}}),copy=structuredClone(recipe);
  saved.update({expectedLibraryRevision:1,operation:'remove',id:preset.id});assert.deepEqual(recipe,copy);assert.equal(recipe.op,'quickModel');assert.equal(recipe.params.kind,'ring');assert.equal(recipe.params.sectionSize,5);
});
test('stale writes, malformed parameters and invalid import cannot modify persisted library',()=>{
  const disk=storage(),library=createModelLibrary(()=>disk);
  library.update({expectedLibraryRevision:0,operation:'upsert',entry:preset});const before=disk.getItem(MODEL_LIBRARY_KEY);
  for(const request of [
    {expectedLibraryRevision:0,operation:'remove',id:'ring'},
    {expectedLibraryRevision:1,operation:'upsert',entry:{...preset,defaults:{innerDiameter:-2}}},
    {expectedLibraryRevision:1,operation:'upsert',entry:{...preset,defaults:{script:'alert(1)'}}},
    {expectedLibraryRevision:1,operation:'upsert',entry:{...preset,kind:'missing'}},
    {expectedLibraryRevision:1,operation:'import',library:{format:'webcad-model-library',version:1,entries:[preset,preset]}},
  ]) {assert.throws(()=>library.update(request));assert.equal(disk.getItem(MODEL_LIBRARY_KEY),before);}
});
test('failed storage and corrupted storage are explicit; restore is deliberate',()=>{
  const library=createModelLibrary(()=>({getItem:()=>null,setItem:()=>{throw Error('quota');}}));
  assert.throws(()=>library.update({operation:'upsert',expectedLibraryRevision:0,entry:preset}),{code:'LIBRARY_STORAGE_UNAVAILABLE'});
  const disk=storage();disk.setItem(MODEL_LIBRARY_KEY,'broken');const broken=createModelLibrary(()=>disk);
  assert.throws(()=>broken.read(),{code:'LIBRARY_INVALID'});
  const restored=broken.update({expectedLibraryRevision:-1,operation:'restore'});assert.deepEqual(restored.entries,defaultModelLibrary());
});
test('every live entry advertises the exact geometry schema and executable recipe',()=>{
  const library=createModelLibrary(()=>storage());
  for(const entry of library.contracts().entries){assert.equal(entry.inputSchema.properties.kind.const,entry.kind);assert.equal(entry.execution.args.params.kind,entry.kind);assert.equal(entry.toolId,'template.'+entry.kind);assert(entry.fields.length);}
  for(const id of ['getModelLibrary','updateModelLibrary','resolveModelLibrary'])assert.equal(getTool({id}).implementationStatus,'implemented');
  assert(READ_METHODS.has('getModelLibrary'));assert(READ_METHODS.has('resolveModelLibrary'));assert(VIEW_METHODS.has('updateModelLibrary'));assert(DISCOVERY_METHODS.has('getModelLibrary'));
});
test('page library mutations reject stale document context before touching storage',async()=>{
  const current={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:7};
  const api=createPageAPI({confirmSaved:()=>({saved:false}),state:()=>({context:current,summary:{busy:false,kernelReady:true},preview:{active:false,computing:false},view:{workspaceLayout:{workspace:'modeling'}}})});
  const context={...current,expectedRevision:6};delete context.revision;
  assert.equal((await api.updateModelLibrary({context,expectedLibraryRevision:0,operation:'restore'})).error.code,'REVISION_CONFLICT');
  assert.equal((await api.resolveModelLibrary({context:{...context,documentInstanceId:'other'},id:'ring',expectedLibraryRevision:0})).error.code,'INSTANCE_MISMATCH');
});
test('legacy remote layout/view routes read and mutate the same library without view or document writes',async()=>{
  const previous=globalThis.localStorage;globalThis.localStorage=storage();
  try{
    const current={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:7};
    const state=()=>({context:current,summary:{busy:false,kernelReady:true},preview:{active:false,computing:false},view:{workspaceLayout:{workspace:'modeling'}}});
    const api=createPageAPI({confirmSaved:()=>({saved:false}),state,view:()=>{throw Error('Compatibility route must not change view');}});
    const context={sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:7};
    const before=api.getUILayout({includeModelLibrary:true});assert.equal(before.modelLibrary.revision,0);
    const applied=await api.setView({context,modelLibraryChange:{expectedLibraryRevision:0,operation:'upsert',entry:preset}});
    assert.equal(applied.status,'applied');assert.equal(applied.revision,1);
    assert.equal(api.getUILayout({includeModelLibrary:true}).modelLibrary.entries.at(-1).id,preset.id);
    assert.equal((await api.setView({context,workspace:'agent',modelLibraryChange:{expectedLibraryRevision:1,operation:'restore'}})).error.code,'PARAM_SCHEMA_INVALID');
    assert.equal(api.getUILayout({includeModelLibrary:true}).modelLibrary.revision,1);assert.equal(current.revision,7);
  }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
