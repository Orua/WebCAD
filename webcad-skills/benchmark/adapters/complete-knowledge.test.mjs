import test from 'node:test';
import assert from 'node:assert/strict';
import {readCompleteSelection} from './browser-host.mjs';
test('a complete card omitted by aggregate budget is read separately without truncation or rereading other items',async()=>{
 const calls=[],identity={catalogHash:'fixture-catalog',docsHash:'fixture-docs'};
 const client={readLocal:async query=>{calls.push(query);return {...identity,items:calls.length===1?[{id:'doc',kind:'doc',status:'read',text:'full documentation'},{id:'tool',kind:'tool',status:'omitted',reason:'CHAR_BUDGET'}]:[{id:'tool',kind:'tool',status:'read',card:{full:true}}]};}};
 const result=await readCompleteSelection(client,{docIds:['doc'],toolIds:['tool']});
 assert.equal(calls.length,2);assert.deepEqual(calls[1].toolIds,['tool']);assert.equal(result.items[0].text,'full documentation');assert.deepEqual(result.items[1].card,{full:true});
});
test('individual oversized items and version drift remain explicit failures',async()=>{
 const item={id:'tool',kind:'tool',status:'omitted',reason:'CHAR_BUDGET'};
 await assert.rejects(readCompleteSelection({readLocal:async()=>({catalogHash:'a',docsHash:'b',items:[item]})},{}),/COMPLETE_SELECTED/);
 let calls=0;
 await assert.rejects(readCompleteSelection({readLocal:async()=>({catalogHash:++calls===1?'a':'changed',docsHash:'b',items:[item]})},{}),/KNOWLEDGE_CHANGED/);
});
