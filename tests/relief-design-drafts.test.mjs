import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReliefDesign,validateReliefDesigns,updateReliefDesigns} from '../src/relief-design-drafts.js';
import {recordTimeline,restoreTimeline,validateTimeline} from '../src/document-timeline.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';
import {createCommandService} from '../src/command-service.js';
import {EDIT_ACTIONS} from '../src/agent/protocol.js';

const draft=()=>({schemaVersion:1,name:'人工毫米设计',support:{kind:'circle',centerMm:[0,0],radiusMm:30},throughHoles:[{kind:'circle',centerMm:[20,0],radiusMm:2}],protectedZones:[{kind:'rect',centerMm:[-20,0],widthMm:3,heightMm:4}],heightRangeMm:[0,3],points:[{id:'p1',pointMm:[0,0],heightMm:2}]});
test('authored constraints reject unsafe or ambiguous inputs without silently changing points',()=>{
 const source=draft(),result=validateReliefDesign(source);result.points[0].heightMm=1;assert.equal(source.points[0].heightMm,2);
 for(const [pointMm,code]of [[[31,0],'RELIEF_DESIGN_OUTSIDE'],[[20,0],'RELIEF_DESIGN_OUTSIDE'],[[-20,0],'RELIEF_DESIGN_PROTECTED']])assert.throws(()=>validateReliefDesign({...source,points:[{id:'p',pointMm,heightMm:2}]}),{code});
 for(const heightMm of ['2',Infinity,4])assert.throws(()=>validateReliefDesign({...source,points:[{id:'p',pointMm:[0,0],heightMm}]}));
 assert.throws(()=>validateReliefDesign({...source,imagePath:'c:/image.png'}),{code:'PARAM_SCHEMA_INVALID'});
 assert.throws(()=>validateReliefDesign({...source,points:[...source.points,...source.points]}),/ID 重复/);
 assert.throws(()=>validateReliefDesigns(Array(17).fill({})),/最多保留16/);
});
test('design revisions prevent stale overwrites and do not advance on unchanged content',()=>{
 const first=updateReliefDesigns([],{id:'d',expectedDraftRevision:0,draft:draft()});
 assert.equal(first[0].revision,1);assert.throws(()=>updateReliefDesigns(first,{id:'d',expectedDraftRevision:0,draft:draft()}),{code:'REVISION_CONFLICT'});
 assert.deepEqual(updateReliefDesigns(first,{id:'d',expectedDraftRevision:1,draft:draft()}),first);
 assert.throws(()=>updateReliefDesigns(first,{id:'d',expectedDraftRevision:1,remove:true,draft:draft()}));
 assert.deepEqual(updateReliefDesigns(first,{id:'d',expectedDraftRevision:1,remove:true}),[]);
 assert.equal(first[0].draft.points[0].heightMm,2);
});
test('v4 self contained draft survives save/reopen and history restore after deletion',async()=>{
 const empty={version:4,documentId:'doc',name:'草稿工程',features:[],imports:{},binaryAssets:{},compiledArtifacts:{}};
 const saved={...empty,reliefDesigns:updateReliefDesigns([],{id:'d',expectedDraftRevision:0,draft:draft()})};
 recordTimeline(empty,saved,{label:'创建设计约束'});const stateId=saved.timeline.entries.at(-1).id;
 const removed={...saved,reliefDesigns:[]};recordTimeline(saved,removed,{label:'删除设计约束'});
 const reopened=await decodeProject(encodeProjectV4(removed));validateTimeline(reopened);
 assert.deepEqual(reopened.reliefDesigns,[]);
 const restored=restoreTimeline(reopened,stateId);assert.deepEqual(restored.reliefDesigns,saved.reliefDesigns);
 const invalid=structuredClone(removed);invalid.timeline.base.reliefDesigns=[{id:'bad',revision:0,draft:draft()}];
 assert.throws(()=>validateTimeline(invalid));
});
test('same CommandService action reads back drafts and rejects stale document revisions',async()=>{
 assert.equal(EDIT_ACTIONS.has('document.reliefDesign'),true);
 let state={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1,features:[],bodies:[],selectedIds:[],selectedTopology:null,kernelReady:true,dirty:false,reliefDesigns:[]};
 let executions=0;
 const service=createCommandService({snapshot:()=>state,execute:async(command,args,options)=>{assert.equal(command,'editor_action');assert.equal(options.fromUI,true);state={...state,reliefDesigns:updateReliefDesigns(state.reliefDesigns,args.values),revision:state.revision+1,dirty:true};executions++;return state;}});
 const context={sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:1},input={context,idempotencyKey:'design1',action:'document.reliefDesign',args:{id:'draft',expectedDraftRevision:0,draft:draft()}};
 const receipt=await service.execute(input,{fromUI:true});assert.equal(receipt.status,'committed');assert.equal(receipt.validation.geometry,'unchanged');
 assert.equal(service.getState({sessionId:'s',include:['reliefDesigns']}).reliefDesigns[0].draft.points[0].heightMm,2);
 assert.equal((await service.execute(input)).status,'committed');assert.equal(executions,1);
 assert.equal((await service.execute({...input,idempotencyKey:'stale'})).error.code,'REVISION_CONFLICT');
});
