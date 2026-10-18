import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandService} from '../src/command-service.js';
import {createReferenceSystem} from '../src/work-frame.js';

test('command history retains old write identity after 1000 terminal receipts',async()=>{
 const state={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1,kernelReady:true,busy:false,features:[],bodies:[],referenceSystem:createReferenceSystem()};let calls=0;
 const service=createCommandService({snapshot:()=>structuredClone(state),execute:async()=>{calls++;state.revision++;}});
 const request=index=>({context:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:state.revision},idempotencyKey:'rename-'+index,action:'document.rename',args:{name:'name-'+index}});
 let original;
 for(let i=0;i<1105;i++){const input=request(i);if(i===0)original=structuredClone(input);const result=await service.execute(input);assert.equal(result.status,'committed',JSON.stringify(result));}
 const replay=await service.execute(original);assert.equal(replay.status,'committed');assert.equal(replay.archived,true);assert.equal(calls,1105);
 assert.equal((await service.execute({...original,args:{name:'different'}})).error.code,'IDEMPOTENCY_KEY_REUSED');
 assert.equal((await service.execute(original)).status,'committed');assert.equal(calls,1105);
});

test('unknown accepted work remains unknown even before the page revision changes',async()=>{
 const state={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1,kernelReady:true,busy:false,features:[],bodies:[],referenceSystem:createReferenceSystem()};
 const service=createCommandService({snapshot:()=>structuredClone(state),execute:async()=>{throw Object.assign(new Error('response lost'),{commitState:'unknown',jobId:'original-job'});}});
 const result=await service.execute({context:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:1},idempotencyKey:'original',action:'document.rename',args:{name:'next'}});
 assert.equal(result.status,'unknown');assert.equal(result.commitState,'unknown');assert.equal(result.error.jobId,'original-job');
});
