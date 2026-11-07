// MOCK_ONLY framework checks; no real browser/model/geometry acceptance scores.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runAdditionalBasicCase} from './basic-cases.mjs';
import {createUsageMeter} from './usage-meter.mjs';
import {createResponsesProvider} from './responses-provider.mjs';
import {createSingleBasicPlan} from '../single-basic-plan.mjs';
import {preflight} from '../runner.mjs';

test('B02 deterministic recipe uses exact coaxial dimensions through the public path',async()=>{
 let steps;
 const result=await runAdditionalBasicCase({caseId:'B02',session:{},maxToolCalls:1,runSteps:async s=>{steps=s;return {status:'completed',fixture:'MOCK_ONLY'};}});
 assert.equal(result.status,'completed');assert.deepEqual(steps.map(s=>s.args.params),[{radius:6,height:20},{radius:4,height:20},{}]);
 assert.equal(steps[2].args.op,'cut');assert.equal(steps[0].args.placement.frame.kind,'world');
});
test('B03 does not guess or reuse vertical edge IDs',async()=>{
 const used=[];let revision=0;const session={documentInstanceId:'fixture',client:{getState:async()=>({bodies:[{id:'fresh-body'}]}),call:async method=>method==='queryGeometry'?{status:'read',items:[41,57,88,103].map(edgeId=>({edgeId,startPoint:[0,0,0],endPoint:[0,0,5]}))}:{status:'read',solidCount:1,volume:revision===3?3000:5*(596+Math.PI)}}};
 const result=await runAdditionalBasicCase({caseId:'B03',session,maxToolCalls:12,context:async()=>({documentInstanceId:'fixture',expectedRevision:revision}),record:async()=>{},runSteps:async steps=>{used.push(steps);revision++;return {status:'completed'};},history:async()=>{revision++;return {status:'completed'};}});
 assert.deepEqual(used[1][0].args.params.edgeIds,[41,57,88,103]);assert.equal(result.workflowChecks.undo.pass,true);
 assert.equal(result.workflowChecks.undo.evidence.scope,'original-model-session-workflow');
});
test('B03 refuses an ambiguous selection before any fillet',async()=>{
 let writes=0;
 const session={client:{getState:async()=>({bodies:[{id:'fresh-body'}]}),call:async()=>({status:'read',items:[]})}};
 await assert.rejects(runAdditionalBasicCase({caseId:'B03',session,maxToolCalls:12,context:async()=>({expectedRevision:1}),record:async()=>{},runSteps:async()=>{writes++;return {status:'completed'};}}),/FOUR_FRESH_VERTICAL_EDGES_REQUIRED/);
 assert.equal(writes,1);
});
test('missing actual cost stays null while a frozen token guard continues',()=>{
 const meter=createUsageMeter({tokenLimit:10000,authorizationSource:'selftest-existing-quota'});
 const ticket=meter.begin({wireBody:{input:'synthetic'},outputTokenLimit:32,messageCount:1});
 const accounted=meter.finish(ticket,{totalTokens:25,cost:null});
 assert.equal(accounted.actualCost,null);assert.equal(accounted.snapshot.actual.totalCost,null);assert.equal(accounted.chargedTokens,25);
 assert.equal(meter.begin({wireBody:{input:'next'},outputTokenLimit:32}).id,2);
});
test('unknown token usage charges an explicit estimate and unknown transport blocks replay',()=>{
 const meter=createUsageMeter({tokenLimit:10000,authorizationSource:'selftest-existing-quota'});
 const ticket=meter.begin({wireBody:{input:'synthetic'},outputTokenLimit:32});
 const result=meter.finish(ticket,{totalTokens:null,cost:null});
 assert.equal(result.actualTokens,null);assert.equal(result.tokenSource,'reserved-estimated-upper-bound');assert(result.chargedTokens>32);
 const unknown=meter.begin({wireBody:{input:'no-response'},outputTokenLimit:32});meter.abandon(unknown);
 assert.throws(()=>meter.begin({wireBody:{input:'retry'},outputTokenLimit:32}),/UNRESOLVED/);
});
test('single basic plan cannot silently schedule sixty trials or invent a cost',()=>{
 const plan=createSingleBasicPlan({build:'fixture-build',applicationCommit:'fixture-source',totalTokens:120000,authorizationSource:'selftest-existing-quota'});
 assert.equal(plan.runs.length,1);assert.equal(plan.runs[0].caseId,'B01');assert.equal(plan.budget.totalCost,null);
 assert.equal(plan.budget.maxRounds,6);assert.equal(plan.budget.maxToolCalls,12);assert.equal(plan.budget.wallClockMs,180000);
 const result=preflight({model:{provider:'fixture',modelId:'fixture',reasoning:'low',contextBudget:128000,accounting:{mode:'native-account-token-cap',tokenLimit:120000,costLimit:null}},realModel:true},plan.budget);
 assert(!result.missing.includes('TOTAL_USAGE_BUDGET_NOT_FROZEN'));assert(!result.missing.includes('MODEL_USAGE_METER_NOT_FROZEN_TO_PLAN'));
});
test('Responses tool loop converts calls, omits hidden reasoning, and preserves unreported billing',async()=>{
 let requests=0,body;
 const meter=createUsageMeter({tokenLimit:20000,authorizationSource:'selftest-existing-quota'});
 const provider=createResponsesProvider({endpoint:'https://example.invalid/v1/responses',modelId:'fixture-model',provider:'MOCK_ONLY',reasoning:'low',contextBudget:128000,authorized:true,authorization:'selftest-secret',usageMeter:meter,nativeRequestTokenUpperBound:10000,nativeBoundSource:'MOCK_ONLY-authoritative-bound-fixture',fetchImpl:async(url,options)=>{
  requests++;body=JSON.parse(options.body);return new Response('data: '+JSON.stringify({type:'response.completed',response:{model:'fixture-model',status:'completed',output:[{type:'reasoning',summary:'hidden-fixture'},{type:'function_call',call_id:'one',name:'webcad_call',arguments:JSON.stringify({method:'getState',args:{}})}],usage:{input_tokens:20,output_tokens:5,total_tokens:25}}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
 }});
 const result=await provider.request({model:'fixture-model',messages:[{role:'user',content:'synthetic B01'}],remainingBudget:{tokens:20000,cost:null}});
 assert.equal(requests,1);assert.equal(body.store,false);assert.equal(body.stream,true);assert(!('max_output_tokens' in body));assert.equal(body.reasoning.effort,'low');assert.equal(result.toolCalls[0].id,'one');
 assert.equal(result.usage.cost,null);assert.equal(result.budgetMeter.actualCost,null);
 assert(!JSON.stringify(result).includes('hidden-fixture'));assert(!JSON.stringify(result).includes('selftest-secret'));
});
