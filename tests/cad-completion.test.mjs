import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGE_METHOD_SCHEMAS,validatePageInput} from '../src/page-input-contracts.js';
import {getTool,readDocs} from '../src/page-api-docs.js';
import {AGENT_CONTRACT} from '../src/agent/protocol.js';
import {resolvePlacement,identityFrame} from '../src/work-frame.js';
import vm from 'node:vm';
import {createPageAPI} from '../src/page-api.js';
const context={sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:1};
const placement={version:1,frame:{kind:'snapshot',origin:[0,0,8],quaternion:[0,Math.SQRT1_2,0,Math.SQRT1_2]},sourceAnchor:{kind:'bottom-center'}};
test('same-origin embedding host objects retain the public JSON contract across realms',()=>{
 const state={context:{...context,revision:1},summary:{kernelReady:true,busy:false},preview:{active:false,computing:false},bodies:[],features:[]};
 const api=createPageAPI({state:()=>state,display:()=>({status:'rendered'}),files:()=>({}),execute:()=>({}),confirmSaved:async()=>({saved:true})});
 const args=vm.runInNewContext('({include:["summary"]})');
 assert.equal(api.getState(args).summary.kernelReady,true);
});
test('runtime, cards and published protocol use the same high-frequency schemas',()=>{
 for(const id of ['run','setView','capture','queryGeometry','resolvePlacement'])assert.deepEqual(getTool({id}).inputSchema,PAGE_METHOD_SCHEMAS[id]);
 assert.deepEqual(AGENT_CONTRACT.methodSchemas,PAGE_METHOD_SCHEMAS);
 assert.equal(getTool({id:'resolvePlacement'}).mcpCall.tool,'webcad_read');
 assert.equal(AGENT_CONTRACT.methodTools.resolvePlacement,'webcad_read');
 assert(readDocs({docId:'api.placement',limitChars:16000}).text.includes("kind:'snapshot'"));
});
test('explicit snapshot preflight preserves requested position and quaternion',()=>{
 const input={context,op:'cylinder',params:{radius:2,height:10},refs:[],placement};
 assert.doesNotThrow(()=>validatePageInput('resolvePlacement',input));
 const actual=resolvePlacement(placement,{workFrame:{...identityFrame(),frameVersion:1},savedFrames:[],bodyAnchors:[]},'cylinder',input.params);
 assert.deepEqual(actual.frameSnapshot.origin,[0,0,8]);assert.deepEqual(actual.frameSnapshot.quaternion,placement.frame.quaternion);
 assert.throws(()=>validatePageInput('resolvePlacement',{...input,placement:{...placement,frame:{kind:'world',origin:[0,0,8]}}}),{code:'PARAM_SCHEMA_INVALID'});
});
test('view, capture, query and run steps reject extra fields and keep context policies distinct',()=>{
 assert.throws(()=>validatePageInput('capture',{context,maxWidth:20}),{code:'PARAM_RANGE_INVALID'});
 assert.throws(()=>validatePageInput('setView',{context,direction:'almost-top'}),{code:'PARAM_SCHEMA_INVALID'});
 assert.throws(()=>validatePageInput('getState',{context}),{code:'PARAM_SCHEMA_INVALID'});
 assert.doesNotThrow(()=>validatePageInput('add',{op:'cylinder',params:{radius:2,height:10},placement}));
 assert.throws(()=>validatePageInput('add',{op:'cylinder',params:{radius:2,height:10},context}),{code:'PARAM_SCHEMA_INVALID'});
});
