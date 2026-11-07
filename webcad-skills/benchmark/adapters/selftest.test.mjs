// MOCK_ONLY transport selftests. No geometry result or real model baseline is produced.
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertLocalTaskUrl,createPlaywrightTransport,createPlaywrightPageFactory,createBrowserBenchmarkAdapter,b01AnalyticReference} from './browser-host.mjs';
import {createJsonToolProvider} from './json-tool-provider.mjs';
import {createArtifactWriter} from './artifact-writer.mjs';
import {checkBrowserAdapter} from './check.mjs';
import {fileURLToPath} from 'node:url';
import {createPlaywrightBenchmarkHost} from './playwright-host.mjs';

test('only an explicitly owned page on the authorized local site can be bound',async()=>{
 for(const url of ['http://localhost:4173/','https://example.invalid/webcad/','http://127.0.0.1/webcad/','http://localhost/webcad/user-project'])assert.throws(()=>assertLocalTaskUrl(url));
 assert.equal(assertLocalTaskUrl('http://localhost/webcad/'),'http://localhost/webcad/');
 assert.throws(()=>createPlaywrightTransport({evaluate(){},url:()=> 'http://localhost/webcad/'}),/HOST_OWNED_PAGE_REQUIRED/);
 assert.throws(()=>createPlaywrightPageFactory({}),/AUTHORIZED_PLAYWRIGHT_BROWSER_REQUIRED/);
 assert.throws(()=>createBrowserBenchmarkAdapter({openPage(){},knowledge:{baseUrl:'http://localhost/webcad/'}}),/EXPLICIT_LOCAL_KNOWLEDGE_STORAGE_REQUIRED/);
 await assert.rejects(createPlaywrightBenchmarkHost({browser:{}}),/AUTHORIZED_BROWSER_AND_EXPLICIT_STORAGE_REQUIRED/);
});
test('CDP normalization preserves host expression semantics and blocks other commands',async()=>{
 let expression;
 const send=createPlaywrightTransport({url:()=> 'http://localhost/webcad/',evaluate:async value=>(expression=value,{value:{fixture:'MOCK_ONLY'}})},{owned:true});
 const result=await send('Runtime.evaluate',{expression:'fixed host expression',awaitPromise:true,returnByValue:true});
 assert(expression.includes('await (fixed host expression)'));assert.equal(result.result.value.fixture,'MOCK_ONLY');
 await assert.rejects(send('Page.navigate',{}),/UNSUPPORTED_TRANSPORT_METHOD/);
});
test('B01 analytical feasibility cannot turn into independent BRep PASS',()=>{
 const reference=b01AnalyticReference();assert.equal(reference.analyticStatus,'PASS');assert.equal(reference.status,'UNVERIFIED');
 assert.equal(reference.volume,4800-32*Math.PI);
});
test('evidence writer rejects repository output before creating files',async()=>{
 await assert.rejects(createArtifactWriter('relative-output'),/ABSOLUTE_EXTERNAL_EVIDENCE_DIRECTORY_REQUIRED/);
 await assert.rejects(createArtifactWriter(fileURLToPath(new URL('../../..',import.meta.url))),/EVIDENCE_MUST_BE_OUTSIDE_REPOSITORY/);
});
test('read-only adapter check does not enter the L1 diagnostic or call a model',async()=>{
 let diagnosticCalls=0;
 const report=await checkBrowserAdapter({preflight:async()=>({authorizedPageChannel:true}),runB01Diagnostic:async()=>{diagnosticCalls++;}});
 assert.equal(report.recordType,'READ_ONLY_HOST_PREFLIGHT');assert.equal(report.status,'BLOCKED');assert.equal(diagnosticCalls,0);
 assert(report.missing.includes('PAGE_BUILDID_MISSING'));
});
const config={endpoint:'https://example.invalid/v1/chat/completions',modelId:'fixture-model',provider:'selftest-only',reasoning:'configured',contextBudget:8192,authorized:true};
test('provider requires explicit existing authorization and does not retry 401',async()=>{
 assert.throws(()=>createJsonToolProvider({...config,authorized:false}),/EXISTING_MODEL_AUTHORIZATION_REQUIRED/);
 let requests=0;
 const provider=createJsonToolProvider({...config,fetchImpl:async()=>{requests++;return new Response('',{status:401});}});
 await assert.rejects(provider.request({model:config.modelId,messages:[],remainingBudget:{tokens:100,cost:0}}),/MODEL_HTTP_401/);
 assert.equal(requests,1);
});
test('model tool turns and unknown usage retain actual provider data without credentials or reasoning',async()=>{
 let request;
 const provider=createJsonToolProvider({...config,authorization:'selftest-secret',fetchImpl:async(url,options)=>{
  request=JSON.parse(options.body);
  assert.equal(options.headers.Authorization,'selftest-secret');
  return Response.json({model:'fixture-model',choices:[{message:{content:'plan',reasoning_content:'hidden-selftest',tool_calls:[{id:'call1',type:'function',function:{name:'webcad_call',arguments:JSON.stringify({method:'getState',args:{}})}}]}}],usage:{total_tokens:32}});
 }});
 const response=await provider.request({model:config.modelId,messages:[{role:'assistant',content:'plan',toolCalls:[{id:'old',name:'webcad_call',arguments:{method:'getState',args:{}}}]},{role:'tool',toolCallId:'old',content:'{}'}],remainingBudget:{tokens:100,cost:0}});
 assert.equal(request.messages[1].tool_call_id,'old');assert.equal(request.max_tokens,100);
 assert.equal(response.usage.cost,null);assert.equal(response.usage.totalTokens,32);
 assert.equal(response.toolCalls[0].arguments.method,'getState');
 assert(!JSON.stringify(response).includes('hidden-selftest'));assert(!JSON.stringify(response).includes('selftest-secret'));
});
