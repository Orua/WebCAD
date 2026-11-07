// MOCK_ONLY loop/error regressions. No model inference, geometry or formal benchmark score.
import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyRunError,summarize} from './runner.mjs';
import {modelSession} from '../scripts/model-session.mjs';
const controls={task:'synthetic B01',group:'A',modelId:'MOCK_ONLY',toolIdentity:'fixture',initialStateId:'empty-fixture',record:async()=>{},maxRounds:2};

test('model ends with zero bodies: explicit readback failure enters the executed failure denominator',async()=>{
 let writes=0;
 const modeled=await modelSession({...controls,model:async()=>({text:'finished'}),execute:async()=>{writes++;},judge:async()=>({status:'MODELING_FINISHED'})});
 assert.equal(writes,0);
 const status=classifyRunError(Error('B01_REQUIRES_SINGLE_BODY'),{modelingFinished:modeled.status==='MODELING_FINISHED'});
 assert.equal(status,'FAIL');
 const summary=summarize([{caseId:'B01',group:'B',trial:1,status}]);
 assert.equal(summary.executed,1);assert.equal(summary.counts.FAIL,1);assert.equal(summary.counts.BLOCKED,0);assert.equal(summary.executedPassRate,0);
});
test('explicit non-single-body result fails only after modeling has finished',()=>{
 assert.equal(classifyRunError(Error('BASIC_SINGLE_BODY_REQUIRED'),{modelingFinished:true}),'FAIL');
 assert.equal(classifyRunError(Error('B01_REQUIRES_SINGLE_BODY'),{modelingFinished:false}),'BLOCKED');
 assert.equal(classifyRunError(Error('BASIC_SINGLE_BODY_REQUIRED'),{modelingFinished:false}),'BLOCKED');
});
test('HTTP and permissions remain blocked without dispatching geometry',async()=>{
 let writes=0;
 const error=Object.assign(Error('MODEL_HTTP_400'),{code:'MODEL_HTTP_400'});
 await assert.rejects(modelSession({...controls,model:async()=>{throw error;},execute:async()=>{writes++;},judge:async()=>{}}),caught=>caught===error);
 assert.equal(writes,0);assert.equal(classifyRunError(error,{modelingFinished:true}),'BLOCKED');
 assert.equal(classifyRunError(Object.assign(Error('B01_REQUIRES_SINGLE_BODY'),{code:'PERMISSION_DENIED'}),{modelingFinished:true}),'BLOCKED');
});
test('unknown first write stops the tool loop and remains outside the executed denominator',async()=>{
 let writes=0,modelRequests=0;
 const unknown=Object.assign(Error('Original write outcome unknown'),{code:'UNKNOWN_OUTCOME'});
 await assert.rejects(modelSession({...controls,model:async()=>{modelRequests++;return {toolCalls:[{id:'first'},{id:'must-not-dispatch'}]};},execute:async()=>{writes++;throw unknown;},judge:async()=>{}}),caught=>caught===unknown);
 assert.equal(writes,1);assert.equal(modelRequests,1);
 const status=classifyRunError(unknown,{modelingFinished:true});assert.equal(status,'BLOCKED');
 assert.equal(summarize([{status}]).executed,0);
});
test('unrelated checker errors and unresolved outcomes never become geometry FAIL',()=>{
 for(const reason of ['CHECKER_MISSING','STEP_PARSE_FAILED','OBSERVATION_MAPPING_NOT_IMPLEMENTED','UNRESOLVED_ORIGINAL_JOB'])assert.equal(classifyRunError(Error(reason),{modelingFinished:true}),'BLOCKED');
 assert.equal(classifyRunError(Object.assign(Error('DEADLINE'),{code:'UNKNOWN_OUTCOME'}),{modelingFinished:true}),'BLOCKED');
 assert.equal(classifyRunError(Error('DEADLINE'),{modelingFinished:true}),'FAIL');
});
