import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {recordTimeline,restoreTimeline,validateTimeline,timelineList} from '../src/document-timeline.js';
import {encodeProjectV3,encodeProjectV4,decodeProject} from '../src/project-container.js';
import {assertDocumentCapacity} from '../src/document-limits.js';
import {validateReferenceSystem,validateResolvedPlacement,createReferenceSystem} from '../src/work-frame.js';

const clone=structuredClone;
function loader(){
  const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('function validateDocument('),source.indexOf('function checkInputFile('));
  const context={clone,crypto,assertDocumentCapacity,validateTimeline,recordTimeline,validateReferenceSystem,validateResolvedPlacement,createReferenceSystem};
  vm.createContext(context);vm.runInContext(code+'\nthis.load=validateDocument;',context);return context.load;
}
const box={id:'block',op:'box',params:{width:10,depth:8,height:6},refs:[]};

test('legacy v1/v2 JSON and v3/v4 containers restore, edit and save real non-template geometry',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
  const engine=new CadKernel(oc),load=loader();
  try{
    for(const version of [1,2,3,4])for(const withHistory of [false,true]){
      const empty={version,documentId:`legacy-${version}`,features:[],imports:{},...(version===4?{binaryAssets:{}}:{})};
      const old=clone(empty);old.features=[clone(box)];if(withHistory)recordTimeline(empty,old);
      const legacyStateId=old.timeline?.entries.at(-1).id;
      const input=version===4?encodeProjectV4(old):version===3?encodeProjectV3(old):new TextEncoder().encode(JSON.stringify(old));
      const before=load(await decodeProject(input));validateTimeline(before);
      await engine.rebuild(before,{headless:true});
      const checkpointed=engine.bakeProject(before,{thresholdMs:0,recordHistory:false}).document;
      recordTimeline(before,checkpointed);validateTimeline(checkpointed);
      const originalState=legacyStateId||checkpointed.timeline.baseId;
      const edited=clone(checkpointed);
      edited.features.push({id:'post',op:'cylinder',params:{radius:2,height:5},refs:[]},{id:'moved',op:'transform',params:{x:3},refs:['block']});
      await engine.rebuild(edited,{headless:true});
      const final=engine.bakeProject(edited,{thresholdMs:0,recordHistory:false}).document;
      recordTimeline(checkpointed,final);validateTimeline(final);
      const reopened=load(await decodeProject(encodeProjectV4(final)));
      const restored=restoreTimeline(reopened,originalState);delete restored.timeline;
      const target=load(restored);await engine.rebuild(target,{headless:true});
      recordTimeline(reopened,target,{label:'恢复旧状态'});validateTimeline(target);
      assert.equal(target.features.length,1);assert(Math.abs(engine.measure('block').volume-480)<1e-7);
      const changed=clone(target);changed.features[0].params.width=12;
      await engine.rebuild(changed,{headless:true});recordTimeline(target,changed);validateTimeline(changed);
      assert(Math.abs(engine.measure('block').volume-576)<1e-7);
      const saved=load(await decodeProject(encodeProjectV4(changed)));validateTimeline(saved);
      await engine.rebuild(saved,{headless:true});assert(Math.abs(engine.measure('block').volume-576)<1e-7);
      assert.equal(old.referenceSystem,undefined,'never change the source legacy document');
      assert.equal(old.features[0].params.width,10);
    }
  }finally{engine.dispose();}
});

test('100 retained states can be restored, branched and saved after pruning',async()=>{
  let doc={version:2,documentId:'bounded-history',name:'start',features:[clone(box)],imports:{},referenceSystem:createReferenceSystem()};
  for(let i=1;i<=112;i++){const next=clone(doc);next.name=`state-${i}`;recordTimeline(doc,next);doc=next;}
  const history=timelineList(doc);assert.equal(history.storedSteps,100);assert.equal(history.prunedSteps,13);
  const old=restoreTimeline(doc,history.entries[9].id);recordTimeline(doc,old,{label:'恢复保留状态'});validateTimeline(old);
  const branch=clone(old);branch.features[0].params.height=9;recordTimeline(old,branch);validateTimeline(branch);
  const reopened=await decodeProject(new TextEncoder().encode(JSON.stringify(branch)));validateTimeline(reopened);
  assert.equal(reopened.features[0].params.height,9);assert.equal(timelineList(reopened).storedSteps,100);
});

test('genuinely inconsistent history and missing source bytes remain explicit failures without data loss',()=>{
  const load=loader(),empty={version:2,documentId:'invalid-history',features:[],imports:{},referenceSystem:createReferenceSystem()};
  const doc=clone(empty);doc.features=[clone(box)];recordTimeline(empty,doc);
  const broken=clone(doc);broken.features[0].params.width=123;
  const source=JSON.stringify(broken);assert.throws(()=>load(broken),{code:'HISTORY_INVALID'});assert.equal(JSON.stringify(broken),source);
  const imported=clone(empty);imported.features=[{id:'source',op:'import',params:{key:'missing'},refs:[]}];
  imported.imports={missing:{format:'brep',data:'source-bytes'}};recordTimeline(empty,imported);delete imported.imports.missing;
  assert.throws(()=>load(imported),{code:'HISTORY_INVALID'});
  const invalidFrame={...clone(empty),referenceSystem:{version:1}};assert.throws(()=>load(invalidFrame),{code:'FRAME_INVALID'});
});
