import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerformanceSampler} from '../src/performance/sampling.js';
import {createPerformancePolicy,performancePolicy} from '../src/performance/policy.js';
import {pressureFixture,pressureComparisonPlan,pressureCounts,pressureFamilies} from './fixtures/performance-pressure.mjs';

const frame=(timestampMs,extra={})=>({timestampMs,documentInstanceId:'doc',geometryRevision:2,foreground:true,visible:true,interactive:true,frameSource:'animation-frame',
  cachedFrameReused:false,capture:false,kernelBusy:false,previewBusy:false,initializing:false,resizing:false,contextLost:false,...extra});
function measured(interval=100,count=60,extra={}){
  const sampler=createPerformanceSampler();let result;
  for(let i=0;i<=count;i++)sampler.record(frame(i*interval,extra));
  return sampler.snapshot();
}
const windowState=(start,end,p95=50,extra={})=>({documentInstanceId:'doc',geometryRevision:2,foreground:true,visible:true,interactive:true,valid:true,
  window:{sampleCount:100,interactionMs:end-start,startMs:start,endMs:end},frameIntervalMs:{p95},counts:{visibleObjectCount:300},...extra});

test('sampler requires both 5 seconds and 60 real interaction intervals',()=>{
  assert.equal(measured(16,60).valid,false);
  assert.equal(measured(100,59).valid,false);
  const snapshot=measured(100,60,{cpuSubmitMs:3,uniqueTriangles:40,submittedTriangles:80,drawCalls:7,toolTiming:{llmWaitMs:8000},brep:'not retained'});
  assert.equal(snapshot.valid,true);assert.equal(snapshot.frameIntervalMs.p95,100);assert.equal(snapshot.cpuSubmitMs.p50,3);
  assert.equal(snapshot.gpuMs,null);assert.equal(snapshot.counts.solidCount,null);
  assert.equal(snapshot.counts.uniqueTriangles,40);assert.equal(snapshot.counts.submittedTriangles,80);
  assert.equal(snapshot.toolTiming.llmWaitMs,8000);assert.equal(snapshot.brep,undefined);
});
test('all excluded frame sources break continuity and cannot bridge a hidden or busy gap',()=>{
  for(const change of [{visible:false},{foreground:false},{interactive:false},{capture:true},{cachedFrameReused:true},{kernelBusy:true},{previewBusy:true},
    {initializing:true},{resizing:true},{contextLost:true},{frameSource:'sync-hidden'},{frameSource:'timer-fallback'},{capture:undefined}]){
    const sampler=createPerformanceSampler();for(let i=0;i<=60;i++)sampler.record(frame(i*100));
    assert.equal(sampler.record(frame(6100,change)).accepted,false);
    sampler.record(frame(100000));const result=sampler.snapshot();assert.equal(result.window.sampleCount,0);assert.equal(result.window.interactionMs,0);
  }
});
test('revision/document changes reset samples; buffers and returned data are isolated',()=>{
  const sampler=createPerformanceSampler();let result;
  const input=frame(0,{geometryRevision:7,objectCount:10});const original=structuredClone(input);sampler.record(input);assert.deepEqual(input,original);
  for(let i=1;i<=1400;i++)sampler.record(frame(i*10,{geometryRevision:7}));
  result=sampler.snapshot();
  assert.equal(result.window.sampleCount,1200);assert.equal(result.geometryRevision,7);
  result.window.sampleCount=99999;assert.equal(sampler.snapshot().window.sampleCount,1200);
  sampler.record(frame(14010,{geometryRevision:8}));assert.equal(sampler.snapshot().window.sampleCount,0);
  sampler.record(frame(14020,{geometryRevision:8,documentInstanceId:'new'}));assert.equal(sampler.snapshot().window.sampleCount,0);
  assert.ok(sampler.record(frame(14020,{geometryRevision:8,documentInstanceId:'new'})).reasonCodes.includes('NON_MONOTONIC_TIMESTAMP'));
  sampler.record(frame(14030,{documentInstanceId:''}));assert.equal(sampler.snapshot().documentInstanceId,null);
  assert.throws(()=>createPerformanceSampler({maxSamples:1201}));
});
test('invalid counters and tool timing stay null rather than inventing measurements',()=>{
  const result=measured(100,60,{objectCount:-1,solidCount:NaN,edgeCount:1.5,cpuSubmitMs:Infinity,toolTiming:{geometryMs:-1}});
  assert.equal(result.counts.objectCount,null);assert.equal(result.counts.edgeCount,null);assert.equal(result.cpuSubmitMs.p95,null);assert.equal(result.toolTiming.geometryMs,null);
});
test('counts alone never lower display quality, even on high object load',()=>{
  const planner=createPerformancePolicy();
  const result=planner.evaluate(windowState(0,6000,16,{counts:{visibleObjectCount:500}}),{nowMs:6000});
  assert.equal(result.proposedAction,null);assert.equal(result.observation,'high');
  assert.equal(result.groupingRecommendation.agentGroupingAllowed,false);
  assert.deepEqual(result.groupingRecommendation.forbiddenAutomaticOperations,['union','fuse']);
});
test('lock, unconfirmed load, stale samples and invalid data do not schedule actions',()=>{
  for(const [snapshot,settings]of [
    [windowState(0,6000),{manualLock:true,displayLoadConfirmed:true}],
    [windowState(0,6000),{mode:'manual',displayLoadConfirmed:true}],
    [windowState(0,6000),{}],
    [windowState(0,6000,50,{valid:false}),{displayLoadConfirmed:true}],
    [windowState(0,6000,50,{window:{startMs:0,endMs:6000}}),{displayLoadConfirmed:true}]
  ])assert.equal(createPerformancePolicy().evaluate(snapshot,{nowMs:6000,...settings}).proposedAction,null);
  assert.equal(createPerformancePolicy().evaluate(windowState(0,6000),{nowMs:9000,displayLoadConfirmed:true}).proposedAction,null);
});
test('one-step proposal, unknown reconciliation and same-state failure deduplication',()=>{
  const planner=createPerformancePolicy();const snapshot=windowState(0,6000);
  const result=planner.evaluate(snapshot,{nowMs:6000,effectiveQuality:'fine',preferredQuality:'fine',displayLoadConfirmed:true});
  const action=result.proposedAction;assert.equal(action.targetQuality,'standard');assert.equal(result.effectiveQuality,'fine');
  assert.equal(planner.evaluate(snapshot,{nowMs:6001,effectiveQuality:'fine',preferredQuality:'fine',displayLoadConfirmed:true}).proposedAction,null);
  assert.throws(()=>planner.acknowledge({actionId:action.actionId,status:'applied',completedAtMs:6001,effectiveQuality:'draft'}));
  planner.acknowledge({actionId:action.actionId,status:'unknown',completedAtMs:6002});
  assert.equal(planner.evaluate(snapshot,{nowMs:6003,manualLock:true}).pendingActionId,action.actionId);
  assert.equal(planner.evaluate(snapshot,{nowMs:6004,displayLoadConfirmed:true}).reasonCodes[0],'AWAITING_ACTION_RECONCILIATION');
  planner.acknowledge({actionId:action.actionId,status:'failed',completedAtMs:6005});
  assert.equal(planner.evaluate(snapshot,{nowMs:6006,effectiveQuality:'fine',preferredQuality:'fine',displayLoadConfirmed:true}).reasonCodes[0],'SAME_DISPLAY_ACTION_ALREADY_ATTEMPTED');
});
test('applied downgrade requires new samples, cooldown and no repeat downgrade at same geometry',()=>{
  const planner=createPerformancePolicy(),settings={effectiveQuality:'fine',preferredQuality:'fine',displayLoadConfirmed:true};
  const {proposedAction:action}=planner.evaluate(windowState(0,6000),{nowMs:6000,...settings});
  planner.acknowledge({actionId:action.actionId,status:'applied',completedAtMs:6000,effectiveQuality:'standard'});
  assert.equal(planner.evaluate(windowState(0,6000),{nowMs:6000,...settings,effectiveQuality:'standard'}).state,'insufficient-data');
  assert.equal(planner.evaluate(windowState(6000,12000),{nowMs:12000,...settings,effectiveQuality:'standard'}).state,'cooldown');
  assert.equal(planner.evaluate(windowState(31000,37000),{nowMs:37000,...settings,effectiveQuality:'standard'}).state,'constrained');
});
test('recovery accumulates overlapping valid windows beyond the 1200-frame cap without counting repeated reads',()=>{
  const planner=createPerformancePolicy(),settings={effectiveQuality:'draft',preferredQuality:'fine',displayLoadConfirmed:true};
  assert.equal(planner.evaluate(windowState(0,20000,16),{nowMs:20000,...settings}).proposedAction,null);
  assert.equal(planner.evaluate(windowState(0,20000,16),{nowMs:20000,...settings}).proposedAction,null);
  const upgrade=planner.evaluate(windowState(10000,30000,16),{nowMs:30000,...settings}).proposedAction;
  assert.equal(upgrade.targetQuality,'standard');
  planner.acknowledge({actionId:upgrade.actionId,status:'applied',completedAtMs:30000,effectiveQuality:'standard'});
  assert.equal(planner.evaluate(windowState(30000,60000,16),{nowMs:60000,...settings,effectiveQuality:'standard'}).reasonCodes[0],'UPGRADE_INTERVAL');
  assert.equal(planner.evaluate(windowState(70000,90000,16),{nowMs:90000,...settings,effectiveQuality:'standard'}).proposedAction,null,'gap resets recovery');
  assert.equal(planner.evaluate(windowState(80000,100000,16),{nowMs:100000,...settings,effectiveQuality:'standard'}).proposedAction.targetQuality,'fine');
});
test('invalid interaction interrupts recovery and document switch invalidates old action receipt',()=>{
  const planner=createPerformancePolicy(),settings={effectiveQuality:'draft',preferredQuality:'standard',displayLoadConfirmed:true};
  planner.evaluate(windowState(0,20000,16),{nowMs:20000,...settings});
  planner.evaluate(windowState(0,20001,16,{valid:false}),{nowMs:20001,...settings});
  assert.equal(planner.evaluate(windowState(10000,30000,16),{nowMs:30000,...settings}).proposedAction,null);
  const action=createPerformancePolicy();const proposed=action.evaluate(windowState(0,6000),{nowMs:6000,displayLoadConfirmed:true}).proposedAction;
  const result=action.evaluate(windowState(6000,12000,16,{documentInstanceId:'next'}),{nowMs:12000});
  assert.equal(result.lastAction.status,'stale');assert.equal(result.lastAction.documentInstanceId,'doc');
  assert.throws(()=>action.acknowledge({actionId:proposed.actionId,status:'applied',completedAtMs:12000,effectiveQuality:'draft'}),/STALE/);
});
test('versioned configuration rejects invalid ordering/unsafe timing and does not alter defaults',()=>{
  assert.equal(performancePolicy().calibration,'UNVERIFIED');
  assert.equal(performancePolicy({version:'test-2',slowP95Ms:45}).version,'test-2');
  for(const config of [{recoverP95Ms:50},{minSamples:1},{observeObjects:999},{downgradeCooldownMs:1},{unknown:true},{version:''}])assert.throws(()=>performancePolicy(config));
});
test('public fixtures are deterministic definitions; all four contrast groups remain NOT_RUN',()=>{
  for(const objectCount of pressureCounts)for(const family of pressureFamilies){
    const fixture=pressureFixture({objectCount,family});assert.deepEqual(fixture,pressureFixture({objectCount,family}));
    assert.equal(fixture.members.length,objectCount);assert.equal(new Set(fixture.members.map(member=>member.id)).size,objectCount);
    assert.equal(fixture.source,'public-synthetic');
    const plan=pressureComparisonPlan({fixture});assert.equal(plan.status,'NOT_RUN');assert.equal(plan.runId,null);assert.equal(plan.sourceHash,null);
    assert.equal(plan.runs.length,12);for(const group of ['A','B','C','D'])assert.equal(plan.runs.filter(run=>run.group===group&&run.status==='NOT_RUN').length,3);
  }
  const mixed=pressureFixture({family:'mixed-material'});assert.equal(new Set(mixed.members.map(member=>member.materialClass)).size,2);
  mixed.members[0].positionMm[0]=999;assert.throws(()=>pressureComparisonPlan({fixture:mixed}),/MODIFIED/);
  assert.throws(()=>pressureFixture({objectCount:42}));
});
