import test from 'node:test';import assert from 'node:assert/strict';
import {createPageAPI} from '../src/page-api.js';import {getTool,infoMetadata,readDocs} from '../src/page-api-docs.js';
import {contextPolicy} from '../src/page-context-policy.js';
test('identity view survives revision change; revision edits require revision',async()=>{
 let revision=1,calls=0;const identity={sessionId:'s',documentId:'d',documentInstanceId:'i'};
 const host={state:()=>({context:{...identity,revision},summary:{busy:false,kernelReady:true},preview:{},bodies:[]}),view:async()=>{calls++;},display:()=>({}),files:async()=>({}),confirmSaved:async()=>({saved:true}),execute:async()=>({status:'committed'})};const api=createPageAPI(host);revision=2;
 assert.equal((await api.setView({context:identity,fit:true})).status,'read');assert.equal(calls,1);
 assert.equal((await api.setView({context:{...identity,revision:1},fit:true})).status,'read');
 assert.equal((await api.setView({context:{...identity,documentInstanceId:'other'},fit:true})).error.code,'INSTANCE_MISMATCH');
 const missing=await api.execute({context:identity,action:'feature.add',args:{}});assert.equal(missing.error.code,'PARAM_SCHEMA_INVALID');assert.equal(missing.error.path,'context.expectedRevision');
 assert.equal(api.getState().context.revision,2);assert.equal(api.contextPolicies.setView,'identity');
});
test('method cards and docs declare the runtime context policy',()=>{
 assert.equal(readDocs({docId:'api.execute-v2',limitChars:16000}).text,readDocs({docId:'api.execute',limitChars:16000}).text);
 for(const name of infoMetadata().methods)assert.equal(getTool({id:name}).contextPolicy,contextPolicy(name),name);
 assert.match(readDocs({docId:'api.interaction',limitChars:16000}).text,/setView: contextPolicy=identity/);
});
