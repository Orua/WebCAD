import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageAPI} from '../src/page-api.js';
import {getTool,infoMetadata} from '../src/page-api-docs.js';
import {resolveProfileRecipe,constrainProfileRecipe} from '../src/modeling/profiles/profile-constraint-history.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=2e-6,`${actual} != ${expected}`);
const rectangle=()=>({profileVersion:1,output:'face',entities:[{id:'rectangle-1',type:'rectangle',originMm:[5,7],widthMm:40,heightMm:30}],loops:[{id:'outer',edges:[{entityId:'rectangle-1',reversed:false}]}],chains:[],regions:[{id:'region-1',outerLoopId:'outer',holeLoopIds:[]}]});
const placement={version:1,frameSnapshot:{origin:[10,20,30],quaternion:[0,0,0,1]},frameVersion:4};
const feature=(id,op,params,refs=[])=>({id,op,params,refs,...(op==='sketchProfile'?{placement:structuredClone(placement)}:{})});
const length=entity=>Math.hypot(...entity.endMm.map((value,index)=>value-entity.startMm[index]));

function fixture(features=[feature('outline','sketchProfile',rectangle())]){
  const identity={sessionId:'mechanical-page',documentId:'mechanical-document',documentInstanceId:'mechanical-instance'};
  let revision=7,ready=true,busy=false,previewActive=false,previewComputing=false,inspections=0,executions=0;
  const recipes=structuredClone(features),before=structuredClone(recipes);
  // Match main.js' host implementation while retaining its real history solver.
  const inspect=bodyId=>{
    const solved=constrainProfileRecipe(resolveProfileRecipe(recipes,bodyId),[]);
    return structuredClone({profile:solved.profile,constraints:solved.constraints,diagnostics:solved.diagnostics,primitiveConversion:solved.primitiveConversion||[],intrinsicConstraints:solved.intrinsicConstraints||[],placement:solved.placement||null});
  };
  const host={
    buildId:'mechanical-test',
    state:()=>({status:'read',context:{...identity,revision},summary:{name:'Mechanical profile',kernelReady:ready,busy,dirty:false},preview:{active:previewActive,computing:previewComputing},features:structuredClone(recipes),bodies:recipes.map(item=>({id:item.id,solidCount:item.op==='box'?1:0,faceCount:1})),selectedIds:[]}),
    display:()=>({status:'rendered',rendered:{...identity,revision}}),
    inspectConstraints:async bodyId=>{inspections++;return inspect(bodyId);},
    execute:async()=>{executions++;throw new Error('Read-only inspection must never execute a command');},
    files:async()=>({status:'read'}),confirmSaved:async()=>({saved:true}),
  };
  const api=createPageAPI(host);
  return {api,host,recipes,before,identity,inspect,context:()=>api.createRequestContext(api.getState().context),
    assertUnchanged:()=>{assert.deepEqual(recipes,before);assert.equal(executions,0);},
    get inspections(){return inspections;},get revision(){return revision;},set revision(value){revision=value;},
    set ready(value){ready=value;},set busy(value){busy=value;},set previewActive(value){previewActive=value;},set previewComputing(value){previewComputing=value;}};
}

test('inspectConstraints exposes actual rectangle edge IDs, dimensions and free placement without a geometry transaction',async()=>{
  const f=fixture(),input={context:f.context(),bodyId:'outline'},result=await f.api.inspectConstraints(input);
  assert.equal(result.status,'read',JSON.stringify(result));assert.equal(result.source,'saved-local-constraint-graph');assert.deepEqual(result.units,{length:'mm',angle:'degree'});assert.equal(result.bodyId,'outline');assert.equal(result.context.revision,7);
  const ids=['rectangle-1_0','rectangle-1_1','rectangle-1_2','rectangle-1_3'];
  assert.deepEqual(result.profile.entities.map(entity=>entity.id),ids);assert.ok(result.profile.entities.every(entity=>entity.type==='line'));
  assert.deepEqual(result.profile.loops[0].edges.map(edge=>edge.entityId),ids);assert.deepEqual(result.profile.regions,rectangle().regions);
  assert.deepEqual(result.profile.entities[0].startMm,[5,7]);near(length(result.profile.entities[0]),40);near(length(result.profile.entities[1]),30);near(length(result.profile.entities[2]),40);near(length(result.profile.entities[3]),30);
  assert.deepEqual(result.primitiveConversion,[{sourceId:'rectangle-1',sourceType:'rectangle',entityIds:ids}]);
  assert.deepEqual(result.intrinsicConstraints,ids.map((entityId,index)=>({type:index%2?'vertical':'horizontal',entityId})));
  assert.deepEqual(result.constraints,[]);assert.equal(result.diagnostics.variableCount,8);assert.equal(result.diagnostics.rank,4);assert.equal(result.diagnostics.degreesOfFreedom,4);assert.equal(result.diagnostics.underconstrained,true);
  assert.equal(result.diagnostics.constraintResiduals.filter(item=>item.origin==='intrinsic').length,4);assert.equal(result.diagnostics.maxResidualMm,0);assert.ok(result.diagnostics.maxAngularResidualDeg<1e-8);assert.deepEqual(result.placement,placement);
  assert.equal(f.api.getState().context.revision,7);assert.equal(f.inspections,1);f.assertUnchanged();
  // Readback is detached from the saved source, including conversion and frame.
  result.profile.entities[0].startMm[0]=999;result.primitiveConversion[0].entityIds[0]='changed';result.placement.frameSnapshot.origin[0]=999;
  const again=await f.api.inspectConstraints(input);assert.deepEqual(again.profile.entities[0].startMm,[5,7]);assert.equal(again.primitiveConversion[0].entityIds[0],ids[0]);assert.deepEqual(again.placement,placement);f.assertUnchanged();
});

test('inspectConstraints resolves inherited driving dimensions and explicit fixed placement from the saved feature graph',async()=>{
  const width={id:'width-55',type:'length',entityId:'rectangle-1_0',lengthMm:55},height={id:'height-25',type:'length',entityId:'rectangle-1_1',lengthMm:25},origin={id:'origin',type:'fixPoint',point:{entityId:'rectangle-1_0',point:'start'},positionMm:[100,200]};
  const f=fixture([feature('outline','sketchProfile',rectangle()),feature('width','profileConstraints',{constraints:[width]},['outline']),feature('height','profileConstraints',{constraints:[height]},['width']),feature('positioned','profileConstraints',{constraints:[origin]},['height'])]);
  const dimensioned=await f.api.inspectConstraints({context:f.context(),bodyId:'height'});
  assert.equal(dimensioned.status,'read',JSON.stringify(dimensioned));assert.deepEqual(dimensioned.constraints,[width,height]);near(length(dimensioned.profile.entities[0]),55);near(length(dimensioned.profile.entities[1]),25);assert.equal(dimensioned.diagnostics.degreesOfFreedom,2);assert.equal(dimensioned.diagnostics.rank,6);
  const positioned=await f.api.inspectConstraints({context:f.context(),bodyId:'positioned'});
  assert.equal(positioned.status,'read',JSON.stringify(positioned));assert.deepEqual(positioned.constraints,[width,height,origin]);near(positioned.profile.entities[0].startMm[0],100);near(positioned.profile.entities[0].startMm[1],200);near(length(positioned.profile.entities[0]),55);near(length(positioned.profile.entities[1]),25);
  assert.equal(positioned.diagnostics.rank,8);assert.equal(positioned.diagnostics.degreesOfFreedom,0);assert.equal(positioned.diagnostics.underconstrained,false);assert.ok(positioned.diagnostics.maxResidualMm<=positioned.diagnostics.toleranceMm);assert.deepEqual(positioned.diagnostics.unsatisfiedConstraintIds,[]);
  assert.equal(positioned.intrinsicConstraints.length,4);assert.equal(positioned.primitiveConversion.length,1);assert.deepEqual(positioned.placement,placement);assert.equal(f.revision,7);assert.equal(f.api.getState().features.length,4);f.assertUnchanged();
});

test('inspectConstraints requires complete current context and an explicit current body before invoking the solver',async()=>{
  const f=fixture(),fresh=f.context();
  const cases=[
    [{bodyId:'outline'},'PARAM_SCHEMA_INVALID'],
    [{context:{...fresh,expectedRevision:6},bodyId:'outline'},'REVISION_CONFLICT'],
    [{context:{...fresh,documentInstanceId:'other'},bodyId:'outline'},'INSTANCE_MISMATCH'],
    [{context:{...fresh,sessionId:'other'},bodyId:'outline'},'INSTANCE_MISMATCH'],
    [{context:{...fresh,documentId:'other'},bodyId:'outline'},'INSTANCE_MISMATCH'],
    [{context:{sessionId:fresh.sessionId,documentId:fresh.documentId,documentInstanceId:fresh.documentInstanceId},bodyId:'outline'},'PARAM_SCHEMA_INVALID'],
    [{context:fresh,bodyId:'missing'},'STALE_REFERENCE'],
    [{context:fresh,bodyId:1},'STALE_REFERENCE'],
    [{context:fresh},'STALE_REFERENCE'],
    [{context:fresh,bodyId:'outline',constraints:[]},'PARAM_SCHEMA_INVALID'],
  ];
  for(const [input,code] of cases){const result=await f.api.inspectConstraints(input);assert.equal(result.status,'failed');assert.equal(result.commitState,'not_committed');assert.equal(result.error.code,code,JSON.stringify(result));assert.equal(result.profile,undefined);}
  assert.equal(f.inspections,0);assert.equal(f.revision,7);f.assertUnchanged();
  // Accept a fresh state snapshot through the existing normalization adapter.
  assert.equal((await f.api.inspectConstraints({context:f.api.getState().context,bodyId:'outline'})).status,'read');assert.equal(f.inspections,1);f.assertUnchanged();
});

test('inspectConstraints rejects a result if the revision changes while the host is awaited',async()=>{
  const f=fixture();let release,started;
  const hostStarted=new Promise(resolve=>{started=resolve;});
  f.host.inspectConstraints=async bodyId=>{const result=f.inspect(bodyId);started();return new Promise(resolve=>{release=()=>resolve(result);});};
  const pending=f.api.inspectConstraints({context:f.context(),bodyId:'outline'});await hostStarted;f.revision=8;release();
  const result=await pending;assert.equal(result.status,'failed');assert.equal(result.commitState,'not_committed');assert.equal(result.error.code,'REVISION_CONFLICT');assert.equal(result.context.revision,8);assert.equal(result.profile,undefined);assert.equal(result.diagnostics,undefined);f.assertUnchanged();
  f.host.inspectConstraints=bodyId=>f.inspect(bodyId);const fresh=await f.api.inspectConstraints({context:f.context(),bodyId:'outline'});assert.equal(fresh.status,'read');assert.equal(fresh.context.revision,8);assert.equal(f.revision,8);f.assertUnchanged();
});

test('inspectConstraints blocks kernel/preview work and never starts a hidden modeling operation',async()=>{
  for(const property of ['ready','busy','previewActive','previewComputing']){
    const f=fixture();f[property]=property!=='ready';const result=await f.api.inspectConstraints({context:f.context(),bodyId:'outline'});
    assert.equal(result.status,'failed');assert.equal(result.error.code,'CAPABILITY_UNAVAILABLE');assert.equal(f.inspections,0);assert.equal(f.revision,7);f.assertUnchanged();
  }
});

test('inspectConstraints reports unsupported recipes, unsupported arcs and conflicting inherited dimensions without writes',async()=>{
  const arc={profileVersion:1,output:'wire',entities:[{id:'arc',type:'arc3',startMm:[0,0],midMm:[2,3],endMm:[4,0]}],loops:[],chains:[{id:'path',edges:[{entityId:'arc',reversed:false}]}],regions:[]};
  const f=fixture([feature('outline','sketchProfile',rectangle()),feature('width','profileConstraints',{constraints:[{type:'length',entityId:'rectangle-1_0',lengthMm:40}]},['outline']),feature('conflict','profileConstraints',{constraints:[{type:'length',entityId:'rectangle-1_0',lengthMm:50}]},['width']),feature('arc','sketchProfile',arc),feature('solid','box',{width:10,depth:8,height:6})]);
  for(const [bodyId,code] of [['solid','PROFILE_CONSTRAINT_INVALID'],['arc','PROFILE_CONSTRAINT_UNSUPPORTED'],['conflict','PROFILE_CONSTRAINT_UNSATISFIED']]){
    const result=await f.api.inspectConstraints({context:f.context(),bodyId});assert.equal(result.status,'failed',JSON.stringify(result));assert.equal(result.error.code,code);assert.equal(result.commitState,'not_committed');assert.equal(result.profile,undefined);assert.equal(result.context.revision,7);f.assertUnchanged();
  }
  assert.equal(f.inspections,3);assert.equal(f.revision,7);
});

test('constraint inspection method and feature cards are discoverable and invoke shares the guarded read-only path',async()=>{
  const f=fixture(),card=getTool({id:'inspectConstraints'}),featureCard=getTool({id:'profileConstraints'});
  assert.equal(typeof f.api.inspectConstraints,'function');assert.equal(card.category,'page-method');assert.equal(card.implementationStatus,'implemented');assert.ok(card.inputContract.includes('bodyId'));assert.ok(card.outputContract.includes('degreesOfFreedom'));assert.ok(card.errorCodes.includes('REVISION_CONFLICT'));assert.ok(card.errorCodes.includes('PROFILE_CONSTRAINT_UNSUPPORTED'));
  assert.ok(infoMetadata().methods.includes('inspectConstraints'));assert.ok(featureCard.relatedTools.includes('inspectConstraints'));
  const connection=f.api.connect({toolIds:['inspectConstraints','profileConstraints'],includeContracts:true});assert.equal(connection.canExecute,true);assert.ok(connection.contracts.items.some(item=>item.id==='inspectConstraints'));assert.ok(connection.contracts.items.some(item=>item.id==='profileConstraints'));
  assert.ok(f.api.searchTools({query:'inspectConstraints',limit:5}).items.some(item=>item.id==='inspectConstraints'));
  const result=await f.api.invoke({method:'inspectConstraints',args:{context:connection.requestContext,bodyId:'outline'}});assert.equal(result.status,'read');assert.equal(result.diagnostics.degreesOfFreedom,4);assert.equal(result.context.revision,7);assert.equal(f.inspections,1);f.assertUnchanged();
});

test('run supplies fresh context to constraint reads, resolves body references and reuses isolated read receipts',async()=>{
  const f=fixture(),request={context:f.context(),idempotencyKey:'inspect-constraints-read',steps:[
    {id:'graph',method:'inspectConstraints',args:{bodyId:'outline'}},
    {id:'verify',method:'inspectConstraints',args:{bodyId:{$ref:'graph.bodyId'}}},
  ]},inputBefore=structuredClone(request);
  const result=await f.api.run(request);assert.equal(result.status,'completed',JSON.stringify(result));assert.equal(result.atomic,false);assert.equal(result.results.length,2);
  for(const step of result.results){assert.equal(step.result.status,'read');assert.equal(step.result.bodyId,'outline');assert.equal(step.result.context.revision,7);assert.equal(step.result.diagnostics.degreesOfFreedom,4);near(length(step.result.profile.entities[0]),40);}
  assert.deepEqual(result.progress.completedStepIds,['graph','verify']);assert.equal(result.progress.failedStepId,null);assert.deepEqual(result.progress.unattemptedStepIds,[]);assert.equal(result.requestContext.expectedRevision,7);assert.equal(result.context.revision,7);assert.equal(f.inspections,2);assert.equal(f.revision,7);f.assertUnchanged();assert.deepEqual(request,inputBefore);
  const saved=structuredClone(result);result.results[0].result.profile.entities[0].startMm[0]=999;
  const repeat=await f.api.run(request);assert.deepEqual(repeat,saved);assert.equal(f.inspections,2,'identical read request/key retrieves the receipt without rerunning the solver');assert.equal(f.revision,7);f.assertUnchanged();
});

test('run refuses stale constraint-read context before any solver or modeling call',async()=>{
  const f=fixture(),result=await f.api.run({context:{...f.context(),expectedRevision:6},idempotencyKey:'constraints-stale-read',steps:[{id:'graph',method:'inspectConstraints',args:{bodyId:'outline'}}]});
  assert.equal(result.status,'failed');assert.equal(result.error.code,'REVISION_CONFLICT');assert.deepEqual(result.results,[]);assert.equal(result.context.revision,7);assert.equal(result.requestContext.expectedRevision,7);assert.equal(f.inspections,0);assert.equal(f.revision,7);f.assertUnchanged();
});
