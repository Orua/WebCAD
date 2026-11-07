// MOCK_ONLY contract tests. Never a model/geometry acceptance result.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createResponsesProvider} from './responses-provider.mjs';
import {createUsageMeter} from './usage-meter.mjs';
const configuration={tokenLimit:20000,authorizationSource:'MOCK_ONLY-existing-quota'};
const options={endpoint:'https://example.invalid/v1/responses',modelId:'fixture',provider:'native_codex',reasoning:'medium',contextBudget:128000,authorized:true,maxOutputTokens:4096};
test('native wire uses instructions and stream=true without unsupported output cap',async()=>{
 let calls=0;
 const transport=createResponsesProvider({...options,usageMeter:createUsageMeter(configuration),nativeRequestTokenUpperBound:10000,nativeBoundSource:'MOCK_ONLY-confirmed-server-bound',fetchImpl:async(url,request)=>{
  calls++;const body=JSON.parse(request.body);assert.equal(body.stream,true);assert.equal(body.store,false);assert.equal(body.instructions,'system policy');assert(body.input.every(item=>item.role!=='system'));assert(!('max_output_tokens' in body));
  return new Response('event: response.completed\r\ndata: '+JSON.stringify({type:'response.completed',response:{status:'completed',model:'fixture',output:[],usage:{input_tokens:12,output_tokens:3,total_tokens:15}}})+'\r\n\r\n',{headers:{'Content-Type':'text/event-stream'}});
 }});
 const result=await transport.request({model:'fixture',messages:[{role:'system',content:'system policy'},{role:'user',content:'synthetic'}],remainingBudget:{tokens:20000,cost:null}});
 assert.equal(calls,1);assert.equal(result.transportStatus,'completed');assert.equal(result.usage.cost,null);assert.equal(result.streamEvidence.terminalReceived,true);
});
test('native transport stays blocked before HTTP without a verified request token upper bound',async()=>{
 let calls=0;
 const provider=createResponsesProvider({...options,usageMeter:createUsageMeter(configuration),fetchImpl:async()=>{calls++;}});
 await assert.rejects(provider.request({model:'fixture',messages:[],remainingBudget:{tokens:20000,cost:null}}),/NATIVE_REQUEST_TOKEN_BOUND_NOT_VERIFIED/);
 assert.equal(calls,0);
});
test('HTTP error evidence is limited and redacted, and no request is retried',async()=>{
 let calls=0;
 const provider=createResponsesProvider({...options,authorization:'Bearer fixture-secret',usageMeter:createUsageMeter(configuration),nativeRequestTokenUpperBound:10000,nativeBoundSource:'MOCK_ONLY-bound',fetchImpl:async()=>{
  calls++;return Response.json({error:{code:'invalid_request',message:'Stream must be set to true; Bearer fixture-secret',hidden_reasoning:'not-retained'}},{status:400});
 }});
 await assert.rejects(provider.request({model:'fixture',messages:[],remainingBudget:{tokens:20000,cost:null}}),error=>error.code==='MODEL_HTTP_400'&&error.providerError.code==='invalid_request'&&!JSON.stringify(error.providerError).includes('fixture-secret')&&!JSON.stringify(error.providerError).includes('not-retained')&&error.budgetSnapshot.unknownRequest);
 assert.equal(calls,1);
});
test('shared guard may credit one confirmed pre-inference rejection without inventing actual billing',()=>{
 const original=createUsageMeter(configuration),ticket=original.begin({wireBody:{input:'fixture'},outputTokenLimit:64});
 const abandoned=original.abandon(ticket);
 const restored=createUsageMeter({...configuration,initialSnapshot:abandoned});
 assert.throws(()=>restored.reconcileRejectedReservation({reservationTokens:ticket.reservation,evidence:{}}),/CONFIRMED_REJECTION/);
 const evidence={approvedByCoordinator:true,kind:'confirmed-pre-inference-http-400',httpStatus:400,auditTokens:0,geometryWrites:0,terminal:true,sha256:'a'.repeat(64)};
 const result=restored.reconcileRejectedReservation({reservationTokens:ticket.reservation,evidence});
 assert.equal(result.guard.chargedTokens,0);assert.equal(result.actual.totalTokens,null);assert.equal(result.actual.totalCost,null);assert.equal(result.unknownRequest,false);
 assert.throws(()=>restored.reconcileRejectedReservation({reservationTokens:ticket.reservation,evidence}),/CONFIRMED_REJECTION/);
 const next=restored.begin({wireBody:{input:'corrected'},outputTokenLimit:64,totalTokenUpperBound:10000});
 assert.equal(next.reservation,10000);assert.equal(next.reservationSource,'host-verified-native-request-upper-bound');
});
