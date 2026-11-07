// MOCK_ONLY wire fixtures; no model inference or geometry acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readResponsesSse,safeProviderError} from './responses-sse.mjs';
function stream(text,size=7){
 const bytes=new TextEncoder().encode(text);let offset=0;
 return new Response(new ReadableStream({pull(controller){if(offset>=bytes.length)return controller.close();controller.enqueue(bytes.slice(offset,offset+size));offset+=size;}}),{headers:{'Content-Type':'text/event-stream'}});
}
const completed={type:'response.completed',response:{model:'fixture',status:'completed',output:[{type:'reasoning',content:'hidden-fixture'},{type:'message',content:[{type:'output_text',text:'完成'}]},{type:'function_call',call_id:'one',name:'webcad_call',arguments:'{"method":"getState","args":{}}'}],usage:{input_tokens:10,output_tokens:5,total_tokens:15}}};
test('chunked CRLF and split UTF-8 preserve only completed output/usage',async()=>{
 const response=await readResponsesSse(stream(': ping\r\nevent: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"ignored"}\r\n\r\nevent: response.completed\r\ndata: '+JSON.stringify(completed)+'\r\n\r\ndata: [DONE]\r\n\r\n',1));
 assert.equal(response.status,'completed');assert.equal(response.output[0].content[0].text,'完成');assert.equal(response.usage.total_tokens,15);
 assert(!JSON.stringify(response).includes('hidden-fixture'));assert(!JSON.stringify(response).includes('ignored'));
});
test('200 and partial deltas never substitute for terminal completion',async()=>{
 await assert.rejects(readResponsesSse(stream('data: {"type":"response.output_text.delta","delta":"done"}\n\n')),/TERMINAL_MISSING/);
 await assert.rejects(readResponsesSse(stream('data: [DONE]\n\n')),/DONE_WITHOUT_TERMINAL/);
 await assert.rejects(readResponsesSse(new Response('{}',{headers:{'Content-Type':'application/json'}})),/CONTENT_TYPE_REQUIRED/);
});
test('failed/error and incomplete terminals remain distinct; diagnostics are bounded and redacted',async()=>{
 await assert.rejects(readResponsesSse(stream('data: '+JSON.stringify({type:'response.failed',response:{error:{code:'invalid_request',message:'Bearer test-secret-value key=abc'}}})+'\n\n'),{secrets:['test-secret-value']}),error=>error.code==='MODEL_SSE_FAILED'&&!JSON.stringify(error.providerError).includes('test-secret-value'));
 const result=await readResponsesSse(stream('data: '+JSON.stringify({type:'response.incomplete',response:{status:'incomplete',output:[],usage:{total_tokens:9},incomplete_details:{reason:'max_output_tokens'}}})+'\n\n'));
 assert.equal(result.status,'incomplete');assert.equal(result.incomplete_details.reason,'max_output_tokens');
 const error=safeProviderError({error:{code:'invalid_request',message:'Bearer test-secret-value '+ 'x'.repeat(500)}},{secrets:['test-secret-value']});
 assert(error.message.length<=384);assert(!error.message.includes('test-secret-value'));
});
test('malformed, oversized, duplicate-terminal and mismatched streams fail closed',async()=>{
 await assert.rejects(readResponsesSse(stream('data: not-json\n\n')),/JSON_INVALID/);
 await assert.rejects(readResponsesSse(stream('data: '+JSON.stringify(completed)+'\n\n'),{maxBytes:8}),/BYTE_LIMIT/);
 await assert.rejects(readResponsesSse(stream('data: '+JSON.stringify(completed)+'\n\n'),{maxFrameChars:12}),/LIMIT/);
 await assert.rejects(readResponsesSse(stream(('data: '+JSON.stringify(completed)+'\n\n').repeat(2))),/DUPLICATE_TERMINAL/);
 await assert.rejects(readResponsesSse(stream('data: '+JSON.stringify({...completed,response:{status:'incomplete',output:[]}})+'\n\n')),/STATUS_MISMATCH/);
});
test('abort cancels stream consumption and never yields a model response',async()=>{
 const controller=new AbortController();controller.abort(Error('fixture-abort'));
 await assert.rejects(readResponsesSse(stream('data: '+JSON.stringify(completed)+'\n\n'),{signal:controller.signal}),/fixture-abort/);
});
