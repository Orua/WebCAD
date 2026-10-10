import test from 'node:test';import assert from 'node:assert/strict';
import {createServicesClient,sha256} from '../src/services/client.js';
async function fixture({terminal='succeeded'}={}){
 let time=0,polls=0;const calls=[],bytes=new TextEncoder().encode('{}'),digest=await sha256(bytes),job={jobId:'wait-fixture-job',execution:'queued',requestKey:'wait-fixture-key',inputFingerprint:'physical-input'};
 const client=createServicesClient({config:{url:'http://localhost/cadservices/api.ashx',enabled:true},credential:'test-only',now:()=>time,delay:async()=>{time+=2000;},fetchImpl:async(url,options)=>{const route=new URL(url).searchParams.get('route');calls.push({route,method:options.method});if(route.endsWith('/cancel'))return Response.json({...job,cancelRequested:true});if(route==='/v1/jobs/'+job.jobId){polls++;return Response.json({...job,execution:polls===1?'running':terminal,error:terminal==='terminated'?{code:'WORKER_TERMINATED',message:'Stopped by user'}:null});}if(route.endsWith('/result'))return Response.json({jobId:job.jobId,inputFingerprint:job.inputFingerprint,artifactId:'fixture-artifact',bytes:bytes.length,artifactSha256:digest});if(route.startsWith('/v1/artifacts/'))return new Response(bytes);throw Error('Unexpected new operation');}});
 return {client,job,calls};
}
test('continue observes the same accepted task without starting another computation',async()=>{
 const {client,job,calls}=await fixture();let choices=0;const result=await client.wait(job,{waitTimeoutMs:1000,onWaitTimeout:async current=>{assert.equal(current.jobId,job.jobId);choices++;return 'continue';}});assert.equal(result.manifest.jobId,job.jobId);assert.equal(choices,1);assert.equal(calls.some(call=>call.method==='POST'),false);
});
test('stop cancels exactly one controlled task and waits for its actual terminal state',async()=>{
 const {client,job,calls}=await fixture({terminal:'terminated'});await assert.rejects(client.wait(job,{waitTimeoutMs:1000,onWaitTimeout:async()=> 'stop'}),error=>error.code==='SERVICES_JOB_CANCELLED'&&error.jobId===job.jobId&&error.execution==='terminated');assert.equal(calls.filter(call=>call.route.endsWith('/cancel')).length,1);assert.equal(calls.some(call=>call.route.includes('compute/jobs')),false);
});
test('an API caller without a wait decision receives the same unresolved job identity',async()=>{
 const {client,job}=await fixture();await assert.rejects(client.wait(job,{waitTimeoutMs:1000}),error=>error.code==='SERVICES_WAIT_DECISION_REQUIRED'&&error.jobId===job.jobId&&error.requiresDecision===true&&error.commitState==='unknown');
});
