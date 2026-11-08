import test from 'node:test';
import assert from 'node:assert/strict';
import {getTool} from '../src/page-api-docs.js';
import {validateSchema} from '../src/contracts/operation-schema.js';
import {createToolCallPreparation} from '../src/tool-call-preparation.js';

test('job observation schemas describe page arguments without opening host-owned preparation',async()=>{
 const context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:0};
 const prepare=createToolCallPreparation({state:()=>({context,bodies:[]}),getCard:getTool});
 for(const id of ['getJob','cancelJob','awaitJob']){
  const card=getTool({id});
  assert.doesNotThrow(()=>validateSchema(card.inputSchema,{jobId:'original-page-job'}));
  assert.throws(()=>validateSchema(card.inputSchema,{}));
  assert.equal(card.mcpCall.agentCallable,false);
  assert.equal((await prepare({toolId:id,args:{jobId:'original-page-job'}})).reason,'HOST_MANAGED_TOOL');
 }
 const card=getTool({id:'awaitJob'});
 for(const timeoutMs of [0,25000])assert.doesNotThrow(()=>validateSchema(card.inputSchema,{jobId:'j',timeoutMs}));
 for(const timeoutMs of [-1,25001,1.5])assert.throws(()=>validateSchema(card.inputSchema,{jobId:'j',timeoutMs}));
 const route=getTool({id:'getJob'}).mcpCall;
 assert.equal(route.alternative.tool,'webcad_job');assert.ok(route.alternative.arguments.commandId);
 assert.match(route.identityNote,/not pageJobId/);
 for(const id of ['invoke','submit','setServices'])assert.equal(getTool({id}).inputSchema,undefined);
});
