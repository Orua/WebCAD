import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageAPI} from '../src/page-api.js';
import {createHostAdapter} from '../src/agent/host-adapter.js';
import {AGENT_CONTRACT,validatePayload} from '../src/agent/protocol.js';
import {getTool,readDocs} from '../src/page-api-docs.js';
import {getMetalMaterials,setMetalMaterialRegistry} from '../src/metal-presets.js';

const identity={sessionId:'page',documentId:'doc',documentInstanceId:'instance'};
const context={...identity,revision:42};
const scopes=['cad.read','cad.edit','cad.export'];
test('metal read and write cards point to allowed routes; invoke stays explicitly host-only',()=>{
 assert.equal(getTool({id:'getMetalMaterials'}).mcpCall.tool,'webcad_read');
 assert.equal(getTool({id:'setMetalMaterials'}).mcpCall.tool,'webcad_view');
 assert.equal(getTool({id:'invoke'}).mcpCall.agentCallable,false);
 assert.ok(getTool({id:'invoke'}).mcpCall.reason);
 assert.equal(AGENT_CONTRACT.contextPolicies.getMetalMaterials,'none');
 assert.equal(AGENT_CONTRACT.contextPolicies.setMetalMaterials,'identity');
 assert.doesNotThrow(()=>validatePayload({method:'getMetalMaterials',args:{}},identity,scopes));
 assert.throws(()=>validatePayload({method:'getMetalMaterials',args:{context}},identity,scopes));
 assert.throws(()=>validatePayload({method:'setMetalMaterials',args:{context:identity,configuration:{}}},identity,['cad.read']),{code:'scope_denied'});
 assert.match(readDocs({docId:'api.metal-materials',limitChars:16000}).text,/已有预设可直接应用/);
 assert.equal(getTool({id:'body.appearance'}).metalExample.args.finish,'light-gold');
});

test('real page and remote adapter can read/update material configuration without geometry or revision changes',async()=>{
 const before=getMetalMaterials();let writes=0;
 const api=createPageAPI({files(){},confirmSaved(){},display:()=>({}),state:()=>({context,summary:{kernelReady:true,busy:false},preview:{},bodies:[],features:[]}),
  metalMaterials:async config=>{writes++;setMetalMaterialRegistry(config);return {configuration:getMetalMaterials(),persisted:false};}});
 const session={cadSessionId:'cad',leaseEpoch:1,binding:identity,scopes};
 const adapter=createHostAdapter({api,session,report:async()=>{}});
 let sequence=0;
 const call=(method,args)=>adapter.receive({protocol:AGENT_CONTRACT.protocol,cadSessionId:'cad',leaseEpoch:1,taskId:'task',
  commandId:(++sequence).toString(16).padStart(32,'0'),requestHash:'hash-'+sequence,deadline:Date.now()/1000+30,payload:{method,args}});
 try{
  const read=await call('getMetalMaterials',{});assert.equal(read.status,'read');assert.deepEqual(read.configuration,before);
  const config=structuredClone(read.configuration);config.styles.mirror.roughness=.1;
  const applied=await call('setMetalMaterials',{context:identity,configuration:config});
  assert.equal(applied.status,'applied');assert.equal(applied.persisted,false);assert.equal(writes,1);
  assert.equal(api.getState().context.revision,42);assert.equal(api.getState().bodies.length,0);
  const wrong=await call('setMetalMaterials',{context:{...identity,documentInstanceId:'old'},configuration:config});
  assert.equal(wrong.error.code,'INSTANCE_MISMATCH');assert.equal(writes,1);
 }finally{setMetalMaterialRegistry(before);}
});
