import assert from 'node:assert/strict';
import test from 'node:test';
import {createPageAPI} from '../src/page-api.js';
import {getTool,infoMetadata,readDocs} from '../src/page-api-docs.js';
import {normalizeOperationParams} from '../src/operation-registry.js';
import {createQuickModelUsage} from '../src/quick-model-usage.js';
import {toolDisabledReason} from '../src/tool-state.js';
import {adaptUISelection} from '../src/ui-selection-adapter.js';
import {UI_LAYOUT} from '../src/ui/config/ui-layout.js';
import {ribbonGroupPolicy} from '../src/ui/config/ribbon-policy.js';
const usage=createQuickModelUsage(),identity={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1};
test('basic machining entries live in machining, directly unfolded and outside the quick-model catalog',()=>{const tab=UI_LAYOUT.tabs.find(t=>t.id==='machine'),group=tab.groups.find(g=>g[0]==='面加工');assert.ok(['faceGroove','innerTurn','outerTurn'].every(op=>group[1].includes(op)));assert.equal(ribbonGroupPolicy(UI_LAYOUT,tab,group[1],group[2]).folded,false);for(const op of ['faceGroove','innerTurn','outerTurn'])assert.throws(()=>getTool({id:'template.'+op}),{code:'UNKNOWN_OPERATION'});});
test('usage is discoverable and read-only during preview, with no context required',async()=>{
 const api=createPageAPI({buildId:'test',quickModelUsage:usage.get,state:()=>({context:identity,summary:{kernelReady:true,busy:false},preview:{active:true,computing:false}}),display:()=>({}),files:async()=>({}),confirmSaved:async()=>({}),execute:()=>{throw new Error('must not execute');}});
 usage.record('screw');const a=await api.getQuickModelUsage();assert.equal(a.status,'read');assert.equal(a.counts.screw,1);const invoked=await api.invoke({method:'getQuickModelUsage',args:{}});assert.equal(invoked.status,'read',JSON.stringify(invoked));assert.equal((await api.getQuickModelUsage({hidden:1})).error.code,'PARAM_SCHEMA_INVALID');assert.equal((await api.getQuickModelUsage()).counts.screw,1);assert.ok(infoMetadata({buildId:'test',browserReady:true}).methods.includes('getQuickModelUsage'));
});
test('hardware discovery has executable parameters, machining strict schemas and required topology',()=>{
 for(const kind of ['spring','screw','threadedSleeve','domedPin']){const card=getTool({id:'template.'+kind});assert.equal(card.operationId,'quickModel');assert.equal(card.minimalExample.params.kind,kind);assert.equal(card.placementPolicy.defaultInsertionAnchor,'model-origin');assert.equal(card.docs,'api.quick-hardware');}
 for(const op of ['faceGroove','innerTurn','outerTurn']){const c=getTool({id:op});assert.equal(c.strictContract,true);assert.equal(c.placementPolicy.placementSupported,false);assert.ok(c.errorCodes.includes('NO_MATERIAL_REMOVED'));assert.throws(()=>normalizeOperationParams(op,{...c.minimalExample.params,x:1}));assert.throws(()=>normalizeOperationParams(op,{...c.minimalExample.params,depthMm:0}));const state={kernelReady:true,busy:false,selectedIds:['part'],bodies:[{id:'part',solidCount:1}],selectedTopology:null};assert.ok(toolDisabledReason(op,state));state.selectedTopology={type:'face',bodyId:'part',ids:[4]};assert.equal(toolDisabledReason(op,state),'');const adapted=adaptUISelection(op,{},state.selectedIds,state.selectedTopology);assert.equal(adapted.faceId,4);}
 assert.ok(JSON.stringify(readDocs({docId:'api.quick-hardware'})).includes('0.20 mm'));
});
