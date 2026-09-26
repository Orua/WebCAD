import test from 'node:test';
import assert from 'node:assert/strict';
import {AGENT_ONBOARDING} from '../src/agent-onboarding.js';
import {discoveryMetadata,infoMetadata,getTool,readDocs,pageDocsHash} from '../src/page-api-docs.js';
import {createPageAPI} from '../src/page-api.js';

test('static onboarding is compact JSON, ordered by actual host discovery, and carries no live identity',()=>{
  const json=JSON.stringify(AGENT_ONBOARDING),copy=JSON.parse(json);
  assert.deepEqual(copy,AGENT_ONBOARDING);
  assert.equal(copy.version,1);assert.equal(copy.entrypoint,'window.webcad.api.connect');
  assert.deepEqual(copy.steps.map(step=>step.id),['bind-tab','list-capabilities','read-cdp-docs','runtime-evaluate','contracts','run','readback']);
  assert.ok(copy.steps[3].check.includes('canExecute/blockers/requestContext'));
  assert.ok(copy.steps[3].check.includes('exceptionDetails/result'));
  assert.equal(copy.host.documentation,'current-host-first');
  assert.equal(copy.localKit.installation,'host-opt-in');
  assert.ok(json.length<5000,'first connection should not load a full knowledge library');
  const forbidden=new Set(['state','context','sessionId','documentId','documentInstanceId','bodyId','bodyIds','revision','selectedIds','ready','busy','canExecute']);
  const visit=value=>{if(value&&typeof value==='object')for(const[key,item]of Object.entries(value)){assert.ok(!forbidden.has(key),`live field ${key} must not be cached`);visit(item);}};
  visit(copy);
  for(const key of ['startUrl','bootstrapUrl'])assert.ok(copy[key].startsWith('automation/')&&!copy[key].includes('..'));
  for(const[key,path]of Object.entries(copy.localKit))if(key.endsWith('Url'))assert.ok(path.startsWith('automation/')&&!path.includes('..'));
});

test('runtime discovery and info return isolated onboarding and explain the matching entry documents',()=>{
  const discovery=discoveryMetadata(),info=infoMetadata();
  assert.equal(discovery.pageApiVersion,'1.13.0');assert.equal(info.pageApiVersion,'1.13.0');
  assert.deepEqual(discovery.onboarding,AGENT_ONBOARDING);
  assert.equal(info.knowledge.agentStart,AGENT_ONBOARDING.startUrl);
  assert.equal(info.knowledge.agentBootstrap,AGENT_ONBOARDING.bootstrapUrl);
  assert.equal(info.knowledge.agentKit,AGENT_ONBOARDING.localKit.manifestUrl);
  discovery.onboarding.steps[0].action='modified';discovery.onboarding.localKit.installation='modified';
  assert.deepEqual(discoveryMetadata().onboarding,AGENT_ONBOARDING);
  assert.deepEqual(info.discovery.onboarding,AGENT_ONBOARDING);
  assert.equal(getTool({id:'connect'}).version,'1.13.0');
  for(const id of ['start','api.discovery','api.connection']){
    const doc=readDocs({docId:id,limitChars:12000});
    assert.ok(doc.text.includes(AGENT_ONBOARDING.startUrl),id);
    assert.ok(doc.text.includes(AGENT_ONBOARDING.bootstrapUrl),id);
    assert.ok(doc.text.includes('host-opt-in'),id);
    assert.ok(doc.text.includes('canExecute'),id);
  }
  assert.ok(readDocs({docId:'api.connection',limitChars:12000}).text.includes('宿主超时/传输错误不证明页面或 API 不可用'));
  assert.ok(readDocs({docId:'api.connection',limitChars:12000}).text.includes('当前宿主文档与权限优先'));
  assert.ok(readDocs({docId:'api.workflow',limitChars:12000}).text.includes('context:c.requestContext,idempotencyKey:crypto.randomUUID(),steps:['));
});

test('handshake keeps cached guidance independent of fresh readiness and identity without writing the document',()=>{
  const state={context:{sessionId:'session-a',documentId:'document-a',documentInstanceId:'instance-a',revision:4},summary:{kernelReady:true,busy:false},preview:{active:false,computing:false},bodies:[]};
  let writes=0;
  const api=createPageAPI({buildId:'test',state:()=>state,display:()=>({status:'rendered'}),confirmSaved:async()=>({saved:true}),files:()=>{writes++;},execute:()=>{writes++;}});
  const first=api.connect();assert.equal(first.canExecute,true);assert.deepEqual(first.onboarding,AGENT_ONBOARDING);
  first.onboarding.localKit.skillUrl='modified';
  state.context.documentInstanceId='instance-b';state.context.revision=6;state.summary.busy=true;
  const second=api.connect();assert.equal(second.canExecute,false);assert.deepEqual(second.blockers,['BUSY']);
  assert.equal(second.requestContext.documentInstanceId,'instance-b');assert.equal(second.requestContext.expectedRevision,6);
  assert.deepEqual(second.onboarding,AGENT_ONBOARDING);assert.equal(second.docsHash,pageDocsHash);
  assert.equal(writes,0);
});
