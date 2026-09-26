import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {getTool,readDocs} from '../src/page-api-docs.js';
import {normalizeOperationParams} from '../src/operation-registry.js';
import {validateProfile} from '../src/profile-model.js';
import {createPageAPI} from '../src/page-api.js';
import {createCommandService} from '../src/command-service.js';
import {createReferenceSystem} from '../src/work-frame.js';
import {CadKernel} from '../src/cad-kernel.js';

test('public rectangle face example references the original primitive once and explains explicit regions',()=>{
  const card=getTool({id:'sketchProfile'}),example=card.normalExample;
  assert.equal(card.minimalExample.params.entities[0].type,'circle');
  assert.equal(example.params.entities[0].type,'rectangle');
  assert.deepEqual(example.params.entities[0].originMm,[0,0]);
  assert.equal(example.params.entities[0].widthMm,40);assert.equal(example.params.entities[0].heightMm,30);
  const normalized=normalizeOperationParams('sketchProfile',example.params),expanded=validateProfile(normalized);
  assert.equal(normalized.entities.length,1,'the saved source retains one parameterized rectangle');
  assert.deepEqual(normalized.loops[0].edges,[{entityId:normalized.entities[0].id,reversed:false}]);
  assert.equal(expanded.entities.length,4);assert.equal(expanded.loops[0].edges.length,4);
  assert.deepEqual(expanded.loops[0].edges.map(edge=>edge.entityId),expanded.entities.map(entity=>entity.id));
  const missingRegions=structuredClone(normalized);delete missingRegions.regions;
  assert.throws(()=>validateProfile(missingRegions),error=>error.code==='PROFILE_INVALID');
  assert.equal(card.closedPrimitiveRefs.explicitLoopsAndRegions,true);
  assert.ok(card.recipes.includes('recipes.rectangle-profile'));
  assert.ok(readDocs({docId:'recipes.rectangle-profile',limitChars:12000}).text.includes('distanceMm 不从二维 heightMm 推导'));
  assert.ok(readDocs({docId:'api.interaction',limitChars:12000}).text.includes('不自动生成 loops/regions'));
  example.params.entities[0].widthMm=999;
  assert.equal(getTool({id:'sketchProfile'}).normalExample.params.entities[0].widthMm,40);
});

test('Agent can execute the public rectangle card and explicit user depth through run and measure exact geometry',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const referenceSystem=createReferenceSystem();
  let document={version:2,documentId:'test-document',name:'Rectangle test',referenceSystem,features:[],imports:{}},bodies=[],revision=0;
  const identity={sessionId:'test-session',documentId:'test-document',documentInstanceId:'test-instance'};
  const service=createCommandService({
    snapshot:()=>({...identity,revision,documentName:document.name,features:structuredClone(document.features),bodies:structuredClone(bodies),selectedIds:[],selectedTopology:null,busy:false,kernelReady:true,dirty:revision>0,preview:false,referenceSystem}),
    execute:async(command,args)=>{
      assert.equal(command,'add_feature');
      const feature={id:`feature-${document.features.length+1}`,op:args.op,params:args.params,refs:args.refs,...(args.placement?{placement:args.placement}:{})};
      const next={...document,features:[...document.features,feature]},result=await kernel.rebuild(next);
      document=next;bodies=result.bodies.map(body=>({id:body.id,bounds:body.bounds,volume:body.volume,solidCount:body.solidCount,faceCount:body.faceGroups.length,edgeCount:body.edges.length}));revision++;
    },
  });
  const api=createPageAPI({buildId:'test',state:()=>service.getState({sessionId:identity.sessionId,include:['summary','features','bodies']}),display:()=>({status:'not_rendered'}),execute:input=>service.execute(input),measure:input=>kernel.measure(input.bodyId,input.kind,input.topologyId),files:async()=>({status:'read'}),confirmSaved:async()=>({saved:true})});
  try{
    const connection=api.connect({toolIds:['sketchProfile','profileExtrude'],includeContracts:true});
    const shape=connection.contracts.items.find(item=>item.id==='sketchProfile').card.normalExample;
    // This test fixture explicitly supplies the requested thickness. The public
    // recipe asks the user when depth/direction are missing; it does not infer 3.
    const requestedDepthMm=3;
    const result=await api.run({context:connection.requestContext,idempotencyKey:'rectangle-with-user-depth',steps:[
      {id:'outline',method:'add',args:{op:shape.op,params:shape.params,refs:shape.refs}},
      {id:'solid',method:'add',args:{op:'profileExtrude',params:{operation:'newBody',extent:'distance',distanceMm:requestedDepthMm,direction:1},refs:[{$ref:'outline.createdBodyIds.0'}]}},
      {id:'measure',method:'measure',args:{bodyId:{$ref:'solid.createdBodyIds.0'}}},
    ]});
    assert.equal(result.status,'completed',JSON.stringify(result));
    const outlineId=result.results[0].result.createdBodyIds[0],solidId=result.results[1].result.createdBodyIds[0];
    const measured=result.results[2].result;
    assert.equal(measured.solidCount,1);assert.ok(Math.abs(measured.volume-40*30*requestedDepthMm)<1e-6);
    assert.ok(Math.abs(measured.bounds.max[0]-40)<1e-6);assert.ok(Math.abs(measured.bounds.max[1]-30)<1e-6);assert.ok(Math.abs(measured.bounds.max[2]-requestedDepthMm)<1e-6);
    const state=api.getState();assert.equal(state.context.revision,2);
    assert.equal(state.bodies.find(body=>body.id===outlineId).solidCount,0);assert.equal(state.bodies.find(body=>body.id===outlineId).faceCount,1);
    assert.equal(state.bodies.find(body=>body.id===solidId).solidCount,1);
    const faceMeasure=await api.measure({context:state.context,bodyId:outlineId,kind:'face',topologyId:0});
    assert.equal(faceMeasure.status,'read');assert.ok(Math.abs(faceMeasure.area-1200)<1e-6);
    const replay=await api.run({context:connection.requestContext,idempotencyKey:'rectangle-with-user-depth',steps:[
      {id:'outline',method:'add',args:{op:shape.op,params:shape.params,refs:shape.refs}},
      {id:'solid',method:'add',args:{op:'profileExtrude',params:{operation:'newBody',extent:'distance',distanceMm:requestedDepthMm,direction:1},refs:[{$ref:'outline.createdBodyIds.0'}]}},
      {id:'measure',method:'measure',args:{bodyId:{$ref:'solid.createdBodyIds.0'}}},
    ]});
    assert.deepEqual(replay,result);assert.equal(revision,2);
    const incomplete=structuredClone(shape.params);delete incomplete.regions;
    const rejected=await api.run({context:api.getState().requestContext,idempotencyKey:'rectangle-missing-region',steps:[{id:'invalid',method:'add',args:{op:'sketchProfile',params:incomplete,refs:[]}}]});
    assert.equal(rejected.status,'failed');assert.equal(revision,2,'face regions are never silently inferred or committed');
    assert.equal(document.features.length,2);
    assert.ok(Math.abs(kernel.measure(solidId).volume-3600)<1e-6,'failed profile creation preserves the existing solid');
  }finally{kernel.dispose();}
});
