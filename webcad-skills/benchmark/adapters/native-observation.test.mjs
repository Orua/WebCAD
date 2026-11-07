// Wire/accounting regression fixtures; never real model or geometry acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readResponsesSse} from './responses-sse.mjs';
import {createResponsesProvider} from './responses-provider.mjs';
import {createUsageRecorder} from './usage-meter.mjs';
import {createSingleBasicPlan} from '../single-basic-plan.mjs';
import {preflight} from '../runner.mjs';
const event={type:'response.completed',response:{id:'fixture-response',model:'fixture',status:'completed',output:[{type:'function_call',call_id:'fixture-call',name:'webcad_call',arguments:'{"method":"getState","args":{}}'}],usage:{total_tokens:25,input_tokens:20,input_tokens_details:{cached_tokens:12},output_tokens:5}}};
const wire=()=>new Response(new TextEncoder().encode('data: '+JSON.stringify(event)+'\n\n'));
test('missing MIME is native opt-in and still requires a valid terminal SSE response',async()=>{
 await assert.rejects(readResponsesSse(wire()),/CONTENT_TYPE_REQUIRED/);
 assert.equal((await readResponsesSse(wire(),{allowMissingContentType:true})).status,'completed');
 await assert.rejects(readResponsesSse(new Response(new TextEncoder().encode('<html>error</html>')),{allowMissingContentType:true}),/TERMINAL_MISSING/);
 await assert.rejects(readResponsesSse(new Response('{}',{headers:{'Content-Type':'application/json'}}),{allowMissingContentType:true}),/CONTENT_TYPE_REQUIRED/);
});
test('usage-only plan and native tool response work without invented token caps or cost',async()=>{
 const recorder=createUsageRecorder({authorizationSource:'MOCK_ONLY authorized native route'});
 const transport=createResponsesProvider({endpoint:'https://example.invalid/v1/responses',modelId:'fixture',provider:'native_codex',reasoning:'medium',contextBudget:128000,authorized:true,usageMeter:recorder,fetchImpl:async()=>wire()});
 const plan=createSingleBasicPlan({build:'fixture-build',applicationCommit:'fixture-commit',authorizationSource:'MOCK_ONLY'});
 const checked=preflight({model:transport.identity,realModel:true},plan.budget);
 assert(!checked.missing.some(x=>/BUDGET|METER|BOUND|RECORDER/.test(x)));
 const result=await transport.request({model:'fixture',messages:[{role:'user',content:'MOCK_ONLY'}],remainingBudget:{tokens:null,cost:null}});
 assert.equal(plan.budget.totalTokens,null);assert.equal(result.responseId,'fixture-response');assert.equal(result.toolCalls[0].id,'fixture-call');
 assert.equal(result.usage.cachedInputTokens,12);assert.equal(result.budgetMeter.actualCost,null);assert.equal(recorder.snapshot().actual.totalTokens,25);
});
test('observing use preserves unknown usage and blocks replay of an unknown request',()=>{
 const recorder=createUsageRecorder({authorizationSource:'MOCK_ONLY'});
 recorder.finish(recorder.begin(),{});assert.equal(recorder.snapshot().actual.totalTokens,null);
 recorder.finish(recorder.begin(),{totalTokens:7});assert.equal(recorder.snapshot().actual.totalTokens,null);assert.equal(recorder.snapshot().actual.knownTokens,7);
 recorder.abandon(recorder.begin());assert.throws(()=>recorder.begin(),/UNRESOLVED/);
});
