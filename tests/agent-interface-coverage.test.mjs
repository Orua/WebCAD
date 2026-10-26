import test from 'node:test';
import assert from 'node:assert/strict';
import {auditAgentInterfaces,auditAgentMethodRoutes} from '../scripts/agent-interface-audit.mjs';
import {UI_API_ROUTES} from '../src/ui-api-coverage.js';
import {getTool,listPublicToolCards} from '../src/page-api-docs.js';
import {AGENT_CONTRACT,validatePayload} from '../src/agent/protocol.js';
import {createToolCallPreparation} from '../src/tool-call-preparation.js';
import {createOperationPreparation} from '../src/prepared-operations.js';
import {normalizeOperationParams,normalizeOperationPatch} from '../src/operation-registry.js';
import {validateSchema} from '../src/contracts/operation-schema.js';

const dryState=()=>({context:{sessionId:'audit-s',documentId:'audit-d',documentInstanceId:'audit-i',revision:3},bodies:[{id:'body-a',name:'真实目标'}],features:[{id:'feature-a',op:'box',params:{width:20,depth:30,height:3}}]});
const newPreflight=()=>createToolCallPreparation({state:dryState,getCard:getTool,normalizePatch:normalizeOperationPatch});

test('every public card has a bounded read-only preparation route, including unavailable and host tools',async()=>{
 const before=JSON.stringify(dryState()),cards=listPublicToolCards();assert(cards.length>=285);
 for(const card of cards){
  assert(card.preparation?.readOnly,card.id);
  const result=await newPreflight()({toolId:card.id,args:{}});
  assert(['prepared','needs_input','routed','blocked','guidance'].includes(result.status),card.id);
  assert.notEqual(result.reason,'PREPARATION_CONTRACT_MISSING',card.id);assert.equal(result.commitState,'not_committed',card.id);
  if(card.mcpCall?.tool==='host-only')assert.equal(result.status,'blocked',card.id);
 }
 assert.equal(JSON.stringify(dryState()),before);
});

test('all addable operations including advisory and templates prepare their current published example without execution',async()=>{
 const cards=listPublicToolCards().filter(c=>c.refsSchema&&!['import','remove'].includes(c.id));assert(cards.length>=138);let writes=0;
 for(const card of cards){
  const refs=Array.from({length:card.refsSchema.minItems},(_,i)=>`body-${i}`),state=()=>({...dryState(),bodies:refs.map(id=>({id,name:id}))});
  const flow=createOperationPreparation({state,getCard:getTool,normalize:normalizeOperationParams,execute:()=>{writes++;},logoDrafts:()=>[],queryFaces:async()=>({status:'read',items:[{topologyId:0,surfaceType:'plane',planar:true,center:[0,0,1]}]}),pointOnFace:async()=>({status:'read',distanceMm:0})});
  const result=await flow.prepare({op:card.id,refs,params:card.minimalExample.params});
  if(['logo','relief'].includes(card.id))assert.equal(result.status,'needs_input',card.id);
  else assert.equal(result.status,'prepared',`${card.id}: ${JSON.stringify(result)}`);
 }
 assert.equal(writes,0);
});

test('page and command questions resume the same call while preserving original target permissions',async()=>{
 const prepare=newPreflight(),plan=await prepare({toolId:'inspectDraft',args:{}});
 assert.equal(plan.status,'needs_input');assert.deepEqual(plan.questions.map(q=>q.answerPath),['args.pullDirection','args.thresholdDeg']);
 const ready=await prepare({callPreparationId:plan.callPreparationId,answers:{'args.pullDirection':[0,0,1],'args.thresholdDeg':2}});
 assert.equal(ready.status,'prepared');assert.equal(ready.nextCall.method,'inspectDraft');assert.equal(ready.nextCall.args.bodyId,'body-a');
 const edit=await newPreflight()({toolId:'feature.edit',args:{featureId:'feature-a',params:{height:2}}});assert.equal(edit.status,'prepared',JSON.stringify(edit));assert.equal(edit.nextCall.args.args.opVersion,getTool({id:'box'}).version);assert.equal(edit.nextCall.args.args.schemaHash,getTool({id:'box'}).schemaHash);assert.equal(edit.nextCall.method,'execute');
 assert.throws(()=>validatePayload({method:'execute',args:edit.nextCall.args},dryState().context,['cad.read']),e=>e.code==='scope_denied');
 const file=await newPreflight()({toolId:'files.export',args:{}});assert.deepEqual(file.questions.map(q=>q.answerPath),['args.format']);
 const blocked=await newPreflight()({toolId:'convertLogoPdf',args:{}});assert.equal(blocked.status,'blocked');assert.equal(blocked.alternative.method,'readLogo');
});

test('alternatives select only explicit discriminators, nullable fields validate and unknown fields remain correctable',async()=>{
 const state=dryState,flow=createOperationPreparation({state,getCard:getTool,normalize:normalizeOperationParams,execute:()=>{throw Error('no write');},logoDrafts:()=>[]});
 const missing=await flow.prepare({op:'quickModel',params:{}});assert.equal(missing.status,'needs_input');assert(missing.questions.some(q=>q.answerPath==='params.kind'));
 const ready=await flow.prepare({preparationId:missing.preparationId,answers:{'params.kind':'washer'}});assert.equal(ready.status,'prepared',JSON.stringify(ready));
 const schema=getTool({id:'reviewLogo'}).inputSchema;assert.doesNotThrow(()=>validateSchema(schema,{context:{},logoId:'real-id',holeIndex:null}));assert.doesNotThrow(()=>validateSchema(schema,{context:{},logoId:'real-id',holeIndex:0}));
});

test('the build gate catches omitted registration, incorrect category, misleading cards and schema drift',()=>{
 const id='getMetalMaterials';
 for(const mutate of [c=>delete c.methodTools[id],c=>c.methodTools[id]='webcad_submit',c=>c.methodSchemas[id]={type:'string'}]){
  const contract=structuredClone(AGENT_CONTRACT);mutate(contract);
  assert.throws(()=>auditAgentMethodRoutes([id],{contract}));
 }
 assert.throws(()=>auditAgentMethodRoutes([id],{cardFor:()=>({...getTool({id}),mcpCall:{tool:'host-only',method:id}})}));
});
test('all registered tools and UI form actions have callable public Agent contracts',async()=>{const r=await auditAgentInterfaces(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));assert.ok(r.operationCount>70);assert.ok(r.uiSourceCount>10);});
test('specific relief routes retain preview, history and readback instead of generic spread override',()=>{
 for(const id of ['meshReliefEdit','meshReliefPlate']){const r=UI_API_ROUTES[id];for(const tool of ['preview.start','preview.commit','preview.cancel','getState'])assert.ok(r.tools.includes(tool),`${id}: ${tool}`);}
 assert.ok(getTool({id:'meshReliefPlate'}).errorCodes.includes('RELIEF_PLATE_INVALID'));
 assert.ok(getTool({id:'meshReliefEdit'}).errorCodes.includes('RELIEF_RESOLUTION_INSUFFICIENT'));
});
test('legacy PDF host-only adapter points to the callable unified LOGO source route',()=>{
 const legacy=getTool({id:'convertLogoPdf'}),read=getTool({id:'readLogo'});
 assert.equal(legacy.mcpCall.agentCallable,false);
 assert.equal(legacy.mcpCall.alternative.method,'readLogo');
 assert.equal(legacy.mcpCall.alternative.tool,read.mcpCall.tool);
 assert.ok(AGENT_CONTRACT.readMethods.includes('readLogo'));
 assert.match(legacy.inputContract,/sessionFileId/);
});
