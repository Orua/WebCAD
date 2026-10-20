import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {CADViewport} from '../src/viewport.js';
import {createCommandService} from '../src/command-service.js';
import {createPageBatch} from '../src/page-batch.js';
import {createPageClient} from '../skills/webcad-page-api/scripts/page-client.mjs';
import {applySubdBrushes} from '../src/subd-brushes.js';
import {SUBD_EXAMPLE} from '../src/subd-contract.js';
import {validateSubdCage} from '../src/subd-catmark.js';
import {getTool,readDocs} from '../src/page-api-docs.js';
import {contextPolicy} from '../src/page-context-policy.js';
import {READ_METHODS} from '../src/agent/protocol.js';

test('kernel recovery revision does not turn an explicitly uncommitted error into unknown',async()=>{
  for(const commitState of ['not_committed',undefined]){
    const state={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:3,features:[],bodies:[],kernelReady:true};
    const service=createCommandService({snapshot:()=>structuredClone(state),execute:async()=>{
      state.revision++;throw Object.assign(new Error('memory access out of bounds'),{code:'GEOMETRY_INVALID',...(commitState?{commitState}:{})});
    }});
    const result=await service.execute({context:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:3},idempotencyKey:'fault',action:'history.undo',args:{}});
    assert.equal(result.status,commitState?'failed':'unknown');
    assert.equal(result.commitState,commitState||'unknown');
    assert.match(result.error.message,/memory access/);
  }
});

test('receipt lookup after a lost reply is read-only and uses original instance, not stale revision',async()=>{
  let revision=0,writes=0;
  const state=()=>({context:{sessionId:'s',documentId:'d',documentInstanceId:'i',revision},summary:{kernelReady:true,busy:false},preview:{active:false},bodies:[]});
  const run=createPageBatch({getState:state,getTool:()=>({version:1,schemaHash:'h'}),execute:async()=>{
    writes++;revision++;return {status:'committed',createdBodyIds:['new'],replacements:[{before:'old',after:'new'}],context:state().context};
  }});
  const request={context:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:0},idempotencyKey:'original',steps:[{id:'move',method:'add',args:{op:'transform',refs:['old'],params:{x:1}}}]};
  const receipt=await run(request);
  const query={idempotencyKey:'original',documentInstanceId:'i'};
  assert.equal(receipt.status,'completed');
  const result=run.getReceipt(query);assert.equal(result.found,true);assert.equal(writes,1);
  assert.equal(result.receipt.results[0].id,'move');
  assert.deepEqual(result.receipt.results[0].result.replacements,[{before:'old',after:'new'}]);
  result.receipt.results.length=0;assert.equal(run.getReceipt(query).receipt.results.length,1);
  assert.equal(run.getReceipt({...query,idempotencyKey:'pending-or-missing'}).found,false);
  assert.throws(()=>run.getReceipt({...query,documentInstanceId:'reloaded'}),{code:'INSTANCE_MISMATCH'});
  assert.equal(writes,1);
});

test('host helper queries the receipt without connecting or resubmitting stale geometry',async()=>{
  let calls=0;
  const client=createPageClient({send:async(method,args)=>{
    calls++;assert.equal(method,'Runtime.evaluate');assert.match(args.expression,/getBatchReceipt/);assert.doesNotMatch(args.expression,/expectedRevision/);
    return {result:{value:{status:'read',found:true}}};
  }});
  assert.equal((await client.getBatchReceipt({idempotencyKey:'lost',context:{documentInstanceId:'i',expectedRevision:0}})).found,true);assert.equal(calls,1);
  assert.equal(contextPolicy('getBatchReceipt'),'none');assert(READ_METHODS.has('getBatchReceipt'));
  assert.equal(getTool({id:'getBatchReceipt'}).inputSchema.required.length,2);
});

test('cage brushes expose zero hits, actual displacement and validate smooth strength even on a miss',()=>{
  const brush={centerMm:[0,0,0],radiusMm:1,strength:10};
  const miss=applySubdBrushes(SUBD_EXAMPLE.cage,[brush]);
  assert.deepEqual(miss.vertices,SUBD_EXAMPLE.cage.vertices);
  assert.equal(miss.brushReport[0].affectedControlPoints,0);
  assert.equal(miss.brushReport[0].warning.code,'SUBD_BRUSH_NO_HIT');
  assert.throws(()=>applySubdBrushes(SUBD_EXAMPLE.cage,[{...brush,mode:'smooth'}]),/0–1/);
  const hit=applySubdBrushes(SUBD_EXAMPLE.cage,[{...brush,centerMm:[10,10,10],strength:2}]);
  assert.equal(hit.brushReport[0].affectedControlPoints,1);
  assert.ok(Math.abs(hit.brushReport[0].maxDisplacementMm-2)<1e-12);
  const bad=structuredClone(SUBD_EXAMPLE.cage);bad.faces[0].reverse();
  assert.throws(()=>validateSubdCage(bad),error=>error.details.faceIndices.length===2&&error.details.faceIndices.includes(0)&&/faces\[/.test(error.message));
});

test('absolute camera pose drains actual OrbitControls damping and remains fixed on later updates',()=>{
  const root={addEventListener(){},removeEventListener(){}};
  const dom={...root,style:{},getRootNode:()=>root};
  const camera=new THREE.PerspectiveCamera(35,1,.01,10000);camera.position.set(20,-30,40);camera.up.set(0,0,1);
  const controls=new OrbitControls(camera,dom);controls.enableDamping=true;
  controls._sphericalDelta.theta=.7;controls._panOffset.set(5,2,0);controls.update();
  const viewport=Object.assign(Object.create(CADViewport.prototype),{camera,controls});
  viewport.setCamera({position:[100,-80,90],target:[3,4,5]});
  for(let i=0;i<5;i++)controls.update();
  assert(camera.position.distanceTo(new THREE.Vector3(100,-80,90))<1e-9);
  assert(controls.target.distanceTo(new THREE.Vector3(3,4,5))<1e-9);
  assert.equal(controls.enableDamping,true);controls.dispose();
});

test('pitfall contract covers frame, IDs, unknown receipt and correct undo action',()=>{
  const doc=readDocs({docId:'api.modeling-pitfalls'});
  const text=JSON.stringify(doc);
  for(const term of ['history.undo','getBatchReceipt','SUBD_BRUSH_NO_HIT','sampleDepth + 1','replacements','model-origin'])assert(text.includes(term),term);
});
