import test from 'node:test';
import assert from 'node:assert/strict';
import {auditAgentInterfaces,auditAgentMethodRoutes} from '../scripts/agent-interface-audit.mjs';
import {UI_API_ROUTES} from '../src/ui-api-coverage.js';
import {getTool} from '../src/page-api-docs.js';
import {AGENT_CONTRACT} from '../src/agent/protocol.js';

test('the build gate catches omitted registration, incorrect category, misleading cards and schema drift',()=>{
 const id='getMetalMaterials';
 for(const mutate of [c=>delete c.methodTools[id],c=>c.methodTools[id]='webcad_submit',c=>c.methodSchemas[id]={type:'string'}]){
  const contract=structuredClone(AGENT_CONTRACT);mutate(contract);
  assert.throws(()=>auditAgentMethodRoutes([id],{contract}));
 }
 assert.throws(()=>auditAgentMethodRoutes([id],{cardFor:()=>({...getTool({id}),mcpCall:{tool:'host-only',method:id}})}));
});
test('all registered tools and UI form actions have callable public Agent contracts',async()=>{const r=await auditAgentInterfaces(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));assert.ok(r.operationCount>70);assert.ok(r.uiSourceCount>10);});
test('specific relief routes retain preview, history and readback instead of generic spread override',()=>{
 for(const id of ['meshReliefEdit','meshReliefPlate']){const r=UI_API_ROUTES[id];for(const tool of ['preview.start','preview.commit','preview.cancel','getState'])assert.ok(r.tools.includes(tool),`${id}: ${tool}`);}
 assert.ok(getTool({id:'meshReliefPlate'}).errorCodes.includes('RELIEF_PLATE_INVALID'));
 assert.ok(getTool({id:'meshReliefEdit'}).errorCodes.includes('RELIEF_RESOLUTION_INSUFFICIENT'));
});
