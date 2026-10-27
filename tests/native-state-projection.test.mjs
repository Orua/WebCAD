import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandService} from '../src/command-service.js';
import {createHostAdapter} from '../src/agent/host-adapter.js';
import {createPageAPI} from '../src/page-api.js';
import {LIMITS} from '../src/limits.js';

const context={sessionId:'p',documentId:'d',documentInstanceId:'i',revision:3};
test('parameter reads select one feature and one scalar without unrelated contour bytes',()=>{
 const state={sessionId:'p',documentId:'d',documentInstanceId:'i',revision:3,features:[{id:'f',op:'logo',params:{depthMm:.3,regions:['large-data']}},{id:'other',params:{regions:['unrelated']}}],bodies:[],selectedIds:[],selectedTopology:[]};
 const service=createCommandService({snapshot:()=>state});
 const result=service.getState({sessionId:'p',compact:true,include:['features'],featureIds:['f'],featureFields:['params.depthMm']});
 assert.deepEqual(result.features,[{id:'f',params:{depthMm:.3}}]);assert.equal(result.coverageDetails.features.complete,false);
 assert.equal(result.coverageDetails.features.totalCount,2);assert.equal(result.bodies,undefined);
 assert.equal(service.getState({sessionId:'p',include:['features'],featureFields:['params.__proto__.x']}).error.code,'PARAM_SCHEMA_INVALID');
 assert.equal(service.getState({sessionId:'p',compact:true}).features,undefined);
});
test('page getState passes targeted parameters and excludes unrelated top-level fields',()=>{
 const inputs=[];
 const api=createPageAPI({state:args=>{inputs.push(args);return {context,features:[{id:'f',params:{depthMm:.3}}],view:{},huge:'omitted'};},files:async()=>({}),confirmSaved:async()=>({})});
 const result=api.getState({compact:true,include:['features'],featureIds:['f'],featureFields:['params.depthMm'],fields:['features']});
 assert.ok(inputs.some(input=>input?.featureIds?.[0]==='f'));assert.equal(result.huge,undefined);assert.equal(result.view,undefined);
 assert.equal(api.getState({compact:true}).display,undefined);
});
test('oversize transport response sends one small failure notice and never retries original',async()=>{
 const seen=[];let calls=0;
 const api={connect(){},getState:()=>({context}),invoke:async()=>({status:'read',context,value:'original'})};
 const adapter=createHostAdapter({api,session:{cadSessionId:'cad',leaseEpoch:1,binding:context,scopes:['cad.read']},report:async(kind,cmd,body)=>{if(kind!=='result')return;seen.push(body.result);calls++;if(calls===1)throw Object.assign(Error('Payload exceeds the transport limit.'),{code:'RESOURCE_LIMIT'});}});
 await adapter.receive({protocol:'goldenluck.webcad/1',cadSessionId:'cad',leaseEpoch:1,taskId:'t',commandId:'a'.repeat(32),requestHash:'h',deadline:Date.now()/1000+30,payload:{method:'getState',args:{compact:true}}});
 await new Promise(r=>setTimeout(r,0));for(let i=0;i<5;i++)await adapter.retryReports();
 assert.equal(calls,2);assert.equal(seen[1].error.code,'RESULT_TOO_LARGE');assert.equal(seen[1].originalStatus,'read');assert.equal(seen[1].value,undefined);assert.equal(adapter.state().pending.length,0);
});
test('even a rejected small failure notice stops automatic retry',async()=>{
 let count=0;const api={connect(){},getState:()=>({context}),invoke:async()=>({status:'read',context})};
 const adapter=createHostAdapter({api,session:{cadSessionId:'cad',leaseEpoch:1,binding:context,scopes:['cad.read']},report:async(kind)=>{if(kind==='result'){count++;throw Object.assign(Error('oversize'),{code:'RESOURCE_LIMIT'});}}});
 await adapter.receive({protocol:'goldenluck.webcad/1',cadSessionId:'cad',leaseEpoch:1,taskId:'t',commandId:'b'.repeat(32),requestHash:'h',deadline:Date.now()/1000+30,payload:{method:'getState',args:{compact:true}}});
 await new Promise(r=>setTimeout(r,0));await adapter.retryReports();await adapter.retryReports();assert.equal(count,2);assert.equal(adapter.state().pending[0].deliveryState,'blocked');
 assert.equal(LIMITS.transport.maxResultBytes,12*1024*1024);
});
