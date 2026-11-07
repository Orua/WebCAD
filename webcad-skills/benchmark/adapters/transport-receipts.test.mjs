// Protocol fixtures only, not model or geometry acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlaywrightTransport} from './browser-host.mjs';
const request={expression:'window.webcad.api.getTools({})',awaitPromise:true,returnByValue:true};
test('page validation errors stay distinct from a disconnected transport',async()=>{
 const send=createPlaywrightTransport({url:()=> 'http://localhost/webcad/',evaluate:async expression=>{assert(expression.includes('pageError'));return {pageError:{code:'INPUT_INVALID',message:'ids must be an array'}};}},{owned:true});
 const response=await send('Runtime.evaluate',request);
 assert.equal(response.exceptionDetails.code,'INPUT_INVALID');assert.equal(response.exceptionDetails.text,'ids must be an array');assert(!response.result);
 const lost=createPlaywrightTransport({url:()=> 'http://localhost/webcad/',evaluate:async()=>{throw Error('page closed');}},{owned:true});
 await assert.rejects(lost('Runtime.evaluate',request),error=>error.code==='TRANSPORT_ERROR');
});
test('successful page values keep the public result shape',async()=>{
 const send=createPlaywrightTransport({url:()=> 'http://localhost/webcad/',evaluate:async()=>({value:{status:'read',items:[]}})},{owned:true});
 assert.deepEqual(await send('Runtime.evaluate',request),{result:{value:{status:'read',items:[]}}});
});
