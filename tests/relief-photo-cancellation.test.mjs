import test from 'node:test';
import assert from 'node:assert/strict';
import {convertSourceOnServices,sourceConvertWorkerParams} from '../src/services/relief-pipeline.js';
const params=sourceConvertWorkerParams({width:2,height:2,settings:{columns:2,rows:2},depthMm:1,machiningPrecisionMm:.05});
const args={rgba:new Uint8Array(16),params,context:{documentId:'d',documentInstanceId:'i',revision:1},imageSha256:'a'.repeat(64)};
test('Services cancellation stops the submitted job and waits for terminal state',async()=>{
 const calls=[];const client={upload:async()=>({assetId:'a',sha256:'b'.repeat(64)}),submit:async()=>({jobId:'job-1'}),wait:async()=>{throw Object.assign(new Error('stop observation'),{code:'OBSERVATION_CANCELLED'});},cancelJob:async id=>calls.push(['cancel',id]),getJob:async id=>{calls.push(['read',id]);return {execution:'cancelled'};}};
 await assert.rejects(convertSourceOnServices({...args,client}),{code:'SERVICES_JOB_CANCELLED'});assert.deepEqual(calls,[['cancel','job-1'],['read','job-1']]);
});
test('unconfirmed cancellation preserves unknown state and job identity',async()=>{
 const client={upload:async()=>({assetId:'a',sha256:'b'.repeat(64)}),submit:async()=>({jobId:'job-2'}),wait:async()=>{throw Object.assign(new Error('stop observation'),{code:'OBSERVATION_CANCELLED'});},cancelJob:async()=>{throw Error('offline');}};
 await assert.rejects(convertSourceOnServices({...args,client}),e=>e.code==='SERVICES_CONNECTION_UNKNOWN'&&e.jobId==='job-2'&&e.commitState==='unknown');
});
test('cancel before upload does not start a job',async()=>{
 const signal=AbortSignal.abort();let touched=false;await assert.rejects(convertSourceOnServices({...args,signal,client:{upload:()=>{touched=true;}}}),{name:'AbortError'});assert.equal(touched,false);
});
