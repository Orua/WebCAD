import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseExecutor,classifyComplexity,createExecutionHistory,EXECUTION_POLICY} from '../src/services/execution-router.js';
import {patternComplexity,physicalExecutionKey,remotePlacementSupported} from '../src/services/execution-context.js';
const codec='occt-text-brep-v1';
const capability={operation:'relief',semanticVersion:'relief.compiled-contours-1.0',enabled:true,acceptanceStatus:'bridge-passed-project-gates-pending',
 kernelBuildId:'actual-test-kernel',resultFormats:[codec],limits:{maxSourceBytes:20971520,maxSolids:1,maxLayers:32,maxPrimitives:64000}};
const input={servicesAvailable:true,operation:capability.operation,semanticVersion:capability.semanticVersion,kernelBuildId:capability.kernelBuildId,
 endpoint:'http://localhost/cadservices/api.ashx',clientImportReady:true,source:{bytes:234000,faces:19,edges:58,holes:6,solids:1},
 pattern:{regions:9,layers:3,holes:6,vertices:400,strokes:0,gridPoints:0},
 capabilities:{operations:[capability],geometryExchange:{supportedFormats:[codec],blockers:[]},executionRouting:{policyVersion:'cost-history-1.0',queue:{queued:99,running:99}}}};
const small={...input,pattern:{regions:1,layers:1,holes:0,vertices:16,strokes:0,gridPoints:16}};
const withCapability=patch=>({...input,capabilities:{...input.capabilities,operations:[{...capability,...patch}]}});
const matrix=(rows,columns)=>Array.from({length:rows},()=>Array(columns).fill(0));
const ring=size=>Array.from({length:size},(_,i)=>[i,0]);

test('shared complexity policy carries the agreed time budgets and is immutable',()=>{
 assert.equal(EXECUTION_POLICY.policyVersion,'complexity-routing-1.0');
 assert.equal(EXECUTION_POLICY.localTimeoutMs,60000);
 assert.equal(EXECUTION_POLICY.serverWaitMs,180000);
 assert.equal(EXECUTION_POLICY.maximumServerWallMs,900000);
 assert.throws(()=>{EXECUTION_POLICY.thresholds.vertices=1;},TypeError);
});

test('deterministic source and relief thresholds include the boundary and exclude one below',()=>{
 for(const [field,limit,reason] of [
  ['regions',24,'pattern-regions'],['aggregateRegions',24,'pattern-regions'],
  ['holes',24,'pattern-holes'],['vertices',256,'pattern-vertices'],
  ['strokes',12,'pattern-strokes'],['gridPoints',1024,'large-surface-grid']
 ]){
  const below=classifyComplexity({operation:'relief',pattern:{[field]:limit-1}});
  const boundary=classifyComplexity({operation:'relief',pattern:{[field]:limit}});
  assert.equal(below.complex,false,field);assert.equal(boundary.complex,true,field);
  assert.ok(boundary.reasons.includes(reason));assert.ok(boundary.score>=1);
 }
 for(const [field,limit,reason] of [['faces',150,'source-faces'],['edges',400,'source-edges'],['bytes',2097152,'source-bytes']]){
  assert.equal(classifyComplexity({operation:'relief',source:{[field]:limit-1}}).complex,false,field);
  const classified=classifyComplexity({operation:'relief',source:{[field]:limit}});
  assert.equal(classified.complex,true,field);assert.ok(classified.reasons.includes(reason));
 }
 for(const [layers,vertices,complex] of [[2,128,false],[3,127,false],[3,128,true],[2,256,true]]){
  assert.equal(classifyComplexity({operation:'relief',pattern:{layers,vertices}}).complex,complex);
 }
 assert.equal(classifyComplexity({operation:'box',source:{faces:NaN,edges:-1,bytes:Infinity}}).complex,false);
});

test('large surfaces, dense machining, edge treatment and unknown operations have conservative rules',()=>{
 for(const operation of ['profileLoft','profileSweep','curveSweep','advancedLoft','thickenFace','fittedSurface','offsetSurface','thread','coil','autoRound','futureUnsupportedSurface']){
  const classified=classifyComplexity({operation});assert.equal(classified.complex,true,operation);
  assert.equal(chooseExecutor({...small,operation}).executor,'blocked',operation);
 }
 for(const [operation,params,below] of [
  ['multiHole',{points:Array(12).fill([0,0,0])},{points:Array(11).fill([0,0,0])}],
  ['multiPocket',{pockets:Array(12).fill({})},{pockets:Array(11).fill({})}],
  ['multiBoss',{points:Array(12).fill([0,0,0])},{points:Array(11).fill([0,0,0])}],
  ['linearPattern',{count:24},{count:23}],
  ['circularPattern',{count:12,outputMode:'fuse'},{count:11,outputMode:'fuse'}],
  ['fillet',{edgeIds:Array.from({length:24},(_,i)=>i)},{edgeIds:Array.from({length:23},(_,i)=>i)}],
  ['smoothTransition',{faceIds:Array.from({length:12},(_,i)=>i)},{faceIds:Array.from({length:11},(_,i)=>i)}]
 ]){
  assert.equal(classifyComplexity({operation,params}).complex,true,operation);
  assert.equal(classifyComplexity({operation,params:below}).complex,false,operation);
 }
 assert.equal(classifyComplexity({operation:'fillet',params:{allEdges:true}}).complex,true);
 assert.equal(classifyComplexity({operation:'quickModel',params:{kind:'screw'}}).complex,true);
 assert.equal(classifyComplexity({operation:'quickModel',params:{kind:'threadedSleeve'}}).complex,true);
 assert.equal(chooseExecutor({...small,operation:'box'}).executor,'local');
 assert.equal(chooseExecutor({...small,operation:'multiHole',params:{points:Array(12).fill([0,0,0])}}).executor,'blocked');
});

test('patternComplexity aggregates actual layers, holes, stroke vertices and sculpt lattices',()=>{
 const params={layers:[
  {regions:[{outer:ring(4),holes:[ring(3)]}],strokes:[{points:ring(5)}],values:matrix(4,4),sculpt:{deltaMm:matrix(4,4)}},
  {regions:[{outer:ring(6),holes:[]}],strokes:[{points:ring(4)}],localPatches:[{deltaMm:matrix(7,7)}]}
 ]};
 assert.deepEqual(patternComplexity({params}),{regions:2,holes:1,layers:2,vertices:22,strokes:2,gridPoints:65});
 assert.deepEqual(patternComplexity(),{regions:0,holes:0,layers:0,vertices:0,strokes:0,gridPoints:0});
 assert.deepEqual(patternComplexity({params:{regions:[{outer:ring(3),holes:[ring(3)]}],strokes:[{points:ring(2)}],values:matrix(4,5)}}),
  {regions:1,holes:1,layers:0,vertices:8,strokes:1,gridPoints:20});
 const layered={layers:Array.from({length:3},()=>({regions:[{outer:ring(43)}]}))};
 const classified=classifyComplexity({operation:'relief',params:layered,pattern:{regions:0,vertices:0}});
 assert.equal(classified.input.contourVertices,129);assert.ok(classified.reasons.includes('relief-layered-contours'));
 assert.equal(chooseExecutor({...small,params:layered,pattern:{}}).executor,'remote');
 assert.equal(classifyComplexity({operation:'relief',params:{sculpt:{deltaMm:matrix(32,32)}}}).complex,true);
});

test('without configured Services all ordinary requests stay local, including explicit and unsupported complex requests',()=>{
 for(const options of [small,input,{...input,explicitRemote:true},{...input,operation:'futureUnsupportedSurface'},{...input,capabilities:null}]){
  const decision=chooseExecutor({...options,servicesAvailable:false});
  assert.equal(decision.executor,'local');assert.equal(decision.routingReason,'services-not-configured');
 }
 const {servicesAvailable,...legacy}=input;
 assert.equal(chooseExecutor(legacy).executor,'local');
 assert.equal(chooseExecutor({...input,servicesAvailable:false,localSupported:false}).executor,'local');
});

test('simple requests stay local and complex requests go remote without any timing or upload toggle gate',()=>{
 for(const mode of ['auto','local','serverPreferred']){
  assert.equal(chooseExecutor({...small,mode,capabilities:null,allowUpload:false}).executor,'local');
  const decision=chooseExecutor({...input,mode,allowUpload:false,timings:{localMs:1,remoteComputeMs:999999,transferMs:999999}});
  assert.equal(decision.executor,'remote');assert.equal(decision.routingReason,'complex-remote');assert.equal(decision.estimates,null);
 }
 assert.equal(chooseExecutor(input).executor,'remote');
 assert.equal(chooseExecutor({...small,explicitRemote:true}).routingReason,'explicit-server');
 const unread={...input};Object.defineProperty(unread,'timings',{get(){throw Error('Timing history must not be read');}});
 assert.equal(chooseExecutor(unread).executor,'remote');
 assert.equal(chooseExecutor({...small,localSupported:false}).executor,'blocked');
});

test('configured complex requests block on service, semantic, codec, placement and input budgets without local fallback',()=>{
 const cases=[
  [{...input,capabilities:null},'services-unavailable'],
  [{...input,capabilities:{...input.capabilities,available:false}},'services-unavailable'],
  [{...input,capabilities:{operations:{}}},'remote-semantic-not-accepted'],
  [{...input,capabilities:{operations:[null]}},'remote-semantic-not-accepted'],
  [withCapability({enabled:false}),'remote-semantic-not-accepted'],
  [withCapability({semanticVersion:'unsupported-version'}),'remote-semantic-not-accepted'],
  [withCapability({acceptanceStatus:'pending'}),'remote-semantic-not-accepted'],
  [withCapability({blockers:['UNAVAILABLE']}),'remote-semantic-not-accepted'],
  [{...input,remoteSemanticSupported:false},'remote-semantic-not-accepted'],
  [{...input,clientImportReady:false},'client-geometry-bridge-not-accepted'],
  [withCapability({resultFormats:['mesh-only']}),'client-geometry-bridge-not-accepted'],
  [{...input,capabilities:{...input.capabilities,geometryExchange:{supportedFormats:[]}}},'client-geometry-bridge-not-accepted'],
  [{...input,placementSupported:false},'unsupported-placement'],
  [{...input,placement:{sourceAnchor:{kind:'model-origin'},frameSnapshot:{origin:[1,0,0],quaternion:[0,0,0,1]}}},'unsupported-placement'],
  [{...input,sourceSnapshotReady:false},'source-snapshot-unavailable'],
  [{...input,source:{...input.source,solids:2}},'source-solid-count-unsupported'],
  [{...input,source:{...input.source,bytes:20971521}},'source-budget-exceeded'],
  [{...input,pattern:{...input.pattern,layers:33}},'pattern-budget-exceeded'],
  [{...input,pattern:{...input.pattern,vertices:64001}},'pattern-budget-exceeded']
 ];
 for(const [options,reason] of cases){
  for(const explicitRemote of [false,true]){
   const decision=chooseExecutor({...options,explicitRemote});
   assert.equal(decision.executor,'blocked',reason);assert.equal(decision.routingReason,reason);
   assert.equal(decision.failureFallback,'none');assert.ok(decision.reason.length>0);
  }
 }
 assert.equal(chooseExecutor(withCapability({acceptanceStatus:'passed'})).executor,'remote');
 assert.equal(chooseExecutor(withCapability({acceptanceStatus:'bridge-passed-project-gates-pending'})).executor,'remote');
});

test('only caller-validated exact local checkpoints bypass computation and unsupported Services',()=>{
 assert.equal(chooseExecutor({...input,cache:{remoteResult:true},clientImportReady:false}).executor,'blocked');
 const reuse=chooseExecutor({...input,capabilities:null,cache:{localCheckpoint:true},knownTask:{state:'failed'}});
 assert.equal(reuse.executor,'local');assert.equal(reuse.routingReason,'compiled-checkpoint-available');
 assert.equal(chooseExecutor({...input,cache:{localCheckpoint:false}}).routingReason,'complex-remote');
 assert.equal(chooseExecutor({...input,cache:{localCheckpoint:'true'},capabilities:null}).executor,'blocked');
});

test('same physical failed, unknown or unfinished tasks cannot recompute on either executor; feedback stays local',()=>{
 for(const state of ['failed','unknown','running','paused']){
  for(const servicesAvailable of [false,true]){
   for(const request of [small,input]){
    assert.equal(chooseExecutor({...request,servicesAvailable,knownTask:{state}}).routingReason,'known-task-unresolved');
    assert.equal(chooseExecutor({...request,servicesAvailable,knownTask:{state},explicitRemote:true}).executor,'blocked');
    assert.equal(chooseExecutor({...request,servicesAvailable,knownTask:{state},intent:'feedback'}).executor,'local');
   }
  }
 }
 assert.equal(chooseExecutor({...input,intent:'feedback',capabilities:null}).routingReason,'interactive-feedback');
});

test('Main history interface remains diagnostic and keeps exact physical failures apart',()=>{
 const history=createExecutionHistory(),feature={op:'relief',params:{depthMm:.3}};
 const key=physicalExecutionKey(feature,'source-hash','kernel','endpoint');
 assert.equal(physicalExecutionKey({...feature,id:'replacement-id'},'source-hash','kernel','endpoint'),key);
 for(const changed of [
  physicalExecutionKey({...feature,params:{depthMm:.4}},'source-hash','kernel','endpoint'),
  physicalExecutionKey(feature,'changed-source','kernel','endpoint'),
  physicalExecutionKey(feature,'source-hash','changed-kernel','endpoint'),
  physicalExecutionKey(feature,'source-hash','kernel','changed-endpoint'),
  physicalExecutionKey({...feature,placement:{sourceAnchor:{kind:'model-origin'}}},'source-hash','kernel','endpoint')
 ])assert.notEqual(changed,key);
 history.success(input,'local',{totalMs:1});history.success(input,'remote',{totalMs:30000,computeMs:20000});
 assert.deepEqual(history.timings(input),{localMs:1,remoteComputeMs:20000,transferMs:10000});
 assert.equal(chooseExecutor({...input,timings:history.timings(input)}).executor,'remote');
 assert.equal(chooseExecutor({...small,timings:{localMs:999999,remoteComputeMs:1}}).executor,'local');
 history.failure(key,{code:'SERVICES_CONNECTION_UNKNOWN',jobId:'persisted',idempotencyKey:'existing-request'});
 assert.equal(history.task(key).state,'unknown');assert.equal(history.task(key).jobId,'persisted');
 assert.equal(history.task(key).idempotencyKey,'existing-request');
 assert.equal(chooseExecutor({...input,knownTask:history.task(key)}).executor,'blocked');
 history.success(input,'remote',{totalMs:100,computeMs:90});
 assert.equal(history.task(key).state,'unknown');assert.equal(history.task('different-key'),null);
 history.failure('pre-job-disconnect',{code:'SERVICES_CONNECTION_UNKNOWN'});
 assert.equal(history.task('pre-job-disconnect').state,'unknown');
 history.failure('failed-key',{code:'GEOMETRY_FAILED'});assert.equal(history.task('failed-key').state,'failed');
 for(let i=0;i<=EXECUTION_POLICY.maxHistoryEntries;i++){
  history.failure('another-failure-'+i,{code:'GEOMETRY_FAILED'});
  history.success({...input,endpoint:'diagnostic-'+i},'local',{totalMs:i});
 }
 assert.equal(history.task(key).state,'unknown');assert.equal(history.task('failed-key').state,'failed');
 assert.equal(chooseExecutor({...input,knownTask:history.task(key)}).executor,'blocked');
 assert.deepEqual(history.timings(input),{});
 assert.deepEqual(history.timings({...input,source:{...input.source,faces:20}}),{});
 history.clear();assert.equal(history.task(key),null);assert.deepEqual(history.timings(input),{});
 history.success({operation:'box'},'local',{totalMs:1});
 assert.equal(history.timings({operation:'box'}).localMs,1);
});

test('placement support always returns a boolean and rejects incomplete or transformed frames',()=>{
 assert.equal(remotePlacementSupported({}),true);
 const world={sourceAnchor:{kind:'model-origin'},frameSnapshot:{origin:[0,0,0],quaternion:[0,0,0,1]}};
 assert.equal(remotePlacementSupported({placement:world}),true);
 assert.equal(remotePlacementSupported({placement:{...world,frameSnapshot:{...world.frameSnapshot,quaternion:[0,0,0,-1]}}}),true);
 for(const placement of [
  {},{sourceAnchor:{kind:'model-origin'}},{...world,frameSnapshot:{}},
  {...world,frameSnapshot:{origin:[0,0,0]}},{...world,frameSnapshot:{origin:[0,0],quaternion:[0,0,0,1]}},
  {...world,frameSnapshot:{origin:[0,0,0],quaternion:[0,0,0]}},
  {...world,frameSnapshot:{origin:[0,0,0],quaternion:[0,0,0,'1']}},
  {...world,frameSnapshot:{origin:[1,0,0],quaternion:[0,0,0,1]}},
  {...world,frameSnapshot:{origin:[0,0,0],quaternion:[0,1,0,0]}},
  {...world,sourceAnchor:{kind:'body-anchor'}},
  {frame:{kind:'snapshot',origin:[0,0,0],quaternion:[0,0,0,1]},sourceAnchor:{kind:'model-origin'}}
 ])assert.equal(remotePlacementSupported({placement}),false);
});

test('TBD dense strokes cannot execute locally or remotely, while saved exact checkpoints remain readable',()=>{
 const input={operation:'relief',semanticVersion:'relief.compiled-contours-strokes-1.2',params:{layers:[{strokes:Array.from({length:12},()=>({points:[[0,0],[1,1]],widthMm:.1}))}]}};
 for(const servicesAvailable of [false,true]){const result=chooseExecutor({...input,servicesAvailable});assert.equal(result.executor,'blocked');assert.equal(result.routingReason,'operation-tbd');}
 assert.equal(chooseExecutor({...input,cache:{localCheckpoint:true}}).routingReason,'compiled-checkpoint-available');
});