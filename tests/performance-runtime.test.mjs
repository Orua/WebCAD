import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerformanceRuntime} from '../src/performance/runtime.js';
import {createPerformanceSampler} from '../src/performance/sampling.js';

function fixture({cpu=15,objects=300}={}){
  let time=6000,context={documentInstanceId:'doc',geometryRevision:1,blocked:false},calls=[],changes=0;
  let sampler=createPerformanceSampler();
  const feed=(start,end,interval=100,submit=cpu)=>{for(let t=start;t<=end;t+=interval)sampler.record({timestampMs:t,...context,foreground:true,visible:true,interactive:true,
    frameSource:'animation-frame',cachedFrameReused:false,capture:false,kernelBusy:false,previewBusy:false,initializing:false,resizing:false,contextLost:false,
    cpuSubmitMs:submit,visibleObjectCount:objects});time=end;};
  feed(0,6000);
  const runtime=createPerformanceRuntime({getSnapshot:()=>sampler.snapshot(),getContext:()=>context,now:()=>time,onChange:()=>changes++,changeQuality:async(action,control)=>{
    calls.push(action);assert.equal(control.isCurrent(),true);sampler=createPerformanceSampler();return {status:'applied'};
  }});
  return {runtime,calls,context,feed,time:value=>time=value,changes:()=>changes};
}
test('real sampler feeds runtime: automatic display-only downgrade preserves preferred and is not repeated',async()=>{
  const f=fixture();await f.runtime.tick();assert.equal(f.calls.length,1);assert.equal(f.calls[0].targetQuality,'draft');
  const state=f.runtime.state();assert.equal(state.effectiveQuality,'draft');assert.equal(state.preferredQuality,'standard');assert.equal(state.policy.calibration,'UNVERIFIED');
  f.feed(31000,37000);await f.runtime.tick();assert.equal(f.calls.length,1);assert.equal(f.runtime.state().automaticState,'constrained');
  assert.ok(state.events.some(e=>e.type==='display-quality'));
});
test('high objects create one read-only suggestion, without LLM or geometry actions; refusal survives revisions',async()=>{
  const f=fixture({cpu:1});await f.runtime.tick();let state=f.runtime.state();assert.equal(f.calls.length,0);assert.equal(state.advisories.length,1);
  const advisory=state.advisories[0];f.runtime.acknowledgeAdvisory({advisoryId:advisory.advisoryId,status:'declined'});
  f.context.geometryRevision=2;f.feed(6100,12200);await f.runtime.tick();state=f.runtime.state();assert.equal(state.advisories.length,1);assert.equal(state.advisories[0].status,'declined');
  assert.equal(state.advisories[0].agentGroupingAllowed,false);assert.deepEqual(state.advisories[0].forbiddenAutomaticOperations,['union','fuse']);
});
test('manual lock and busy geometry prevent display changes; user quality updates preferred only on manual changes',async()=>{
  const f=fixture();f.runtime.configure({manualLock:true});await f.runtime.tick();assert.equal(f.calls.length,0);
  f.runtime.setEffectiveQuality('fine',{manual:true});assert.equal(f.runtime.state().preferredQuality,'fine');
  f.runtime.setEffectiveQuality('standard');assert.equal(f.runtime.state().preferredQuality,'fine');
  f.runtime.configure({manualLock:false});f.context.blocked=true;await f.runtime.tick();assert.equal(f.calls.length,0);
  assert.equal(f.runtime.state().automaticState,'deferred');
});
test('cheap CPU windows after automatic downgrade still recover to the preferred quality',async()=>{
 const f=fixture();await f.runtime.tick();assert.equal(f.runtime.state().effectiveQuality,'draft');
 for(let start=6020;start<51000;start+=5000){f.feed(start,start+4980,20,1);await f.runtime.tick();}
 assert.equal(f.runtime.state().effectiveQuality,'standard');
 assert.equal(f.runtime.state().preferredQuality,'standard');
 assert.deepEqual(f.calls.map(c=>c.direction),['downgrade','upgrade']);
});
test('busy deferral does not consume the first display attempt',async()=>{
 const f=fixture();f.context.blocked=true;await f.runtime.tick();
 assert.equal(f.calls.length,0);assert.equal(f.runtime.state().automaticState,'deferred');
 f.context.blocked=false;await f.runtime.tick();assert.equal(f.calls.length,1);
 assert.equal(f.runtime.state().effectiveQuality,'draft');
 assert.equal(f.runtime.state().events.filter(e=>e.type==='display-quality-failed').length,0);
});
test('in-flight requests are serialized, settings invalidation is visible before installation',async()=>{
  let resolve,control,calls=0,time=6000;
  const snapshot={documentInstanceId:'doc',geometryRevision:1,foreground:true,visible:true,interactive:true,valid:true,counts:{visibleObjectCount:0},
    window:{sampleCount:60,interactionMs:6000,startMs:0,endMs:6000},frameIntervalMs:{p95:100},cpuSubmitMs:{p95:15}};
  const runtime=createPerformanceRuntime({getSnapshot:()=>snapshot,getContext:()=>({documentInstanceId:'doc',geometryRevision:1}),now:()=>time,
    changeQuality:async(action,c)=>{calls++;control=c;await new Promise(r=>resolve=r);if(!c.isCurrent())throw Error('STALE_DISPLAY');return {status:'applied'};}});
  const first=runtime.tick();await runtime.tick();assert.equal(calls,1);assert.equal(runtime.state().inFlight,true);
  runtime.configure({manualLock:true});assert.equal(control.isCurrent(),false);time=6001;resolve();await first;
  assert.equal(runtime.state().effectiveQuality,'standard');assert.equal(runtime.state().inFlight,false);
});
test('advisory and event storage is bounded and changing document makes old responses stale',async()=>{
  const f=fixture({cpu:1});for(let i=0;i<40;i++){f.context.structureStage=String(i);await f.runtime.tick();}
  assert.equal(f.runtime.state().advisories.length,32);assert.equal(f.runtime.state().events.length,32);
  const old=f.runtime.state().advisories[0];f.context.documentInstanceId='other';
  assert.throws(()=>f.runtime.acknowledgeAdvisory({advisoryId:old.advisoryId,status:'declined'}),{code:'STALE_REFERENCE'});
  assert.throws(()=>f.runtime.configure({manualLock:'true'}),{code:'PARAM_SCHEMA_INVALID'});
  assert.throws(()=>f.runtime.configure({unexpected:1}),{code:'PARAM_SCHEMA_INVALID'});
});
