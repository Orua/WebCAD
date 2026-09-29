import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import { CadKernel } from '../src/cad-kernel.js';
import { normalizeOperationParams, normalizeOperationPatch } from '../src/operation-registry.js';
import { adaptUISelection } from '../src/ui-selection-adapter.js';

const box={id:'box',op:'box',params:{width:36,depth:10,height:2},refs:[]};
const doc=(op,params)=>({version:1,features:[box,{id:'rounded',op,params,refs:['box']}],imports:{}});

test('body, face boundary and edge scopes share strict API validation',()=>{
  assert.deepEqual(normalizeOperationParams('fillet',{radius:0.3,faceIds:[5]}),{radius:0.3,faceIds:[5]});
  assert.deepEqual(normalizeOperationParams('chamfer',{distance:0.3,edgeIds:[0]}),{distance:0.3,edgeIds:[0]});
  assert.deepEqual(normalizeOperationPatch('fillet',{radius:0.3,allEdges:true},{faceIds:[5]}),{radius:0.3,faceIds:[5]});
  assert.deepEqual(normalizeOperationPatch('fillet',{radius:0.3,faceIds:[5]},{allEdges:true}),{radius:0.3,allEdges:true});
  assert.throws(()=>normalizeOperationParams('fillet',{radius:0.3,faceIds:[5],edgeIds:[0]}),e=>e.code==='SELECTION_CONFLICT');
  assert.throws(()=>normalizeOperationParams('fillet',{radius:0.3,faceIds:[]}),e=>e.code==='PARAM_RANGE_INVALID');
  assert.throws(()=>normalizeOperationParams('fillet',{radius:0.3,allEdges:false}),e=>e.code==='PARAM_SCHEMA_INVALID');
});

test('UI selection explicitly maps body, face and edge scopes',()=>{
  assert.deepEqual(adaptUISelection('fillet',{radius:0.3,allEdges:true},['box'],null),{radius:0.3,allEdges:true});
  assert.deepEqual(adaptUISelection('fillet',{radius:0.3,allEdges:false},['box'],{bodyId:'box',type:'face',ids:[5]}),{radius:0.3,allEdges:false,faceIds:[5]});
  assert.deepEqual(adaptUISelection('chamfer',{distance:0.3,allEdges:false},['box'],{bodyId:'box',type:'edge',ids:[0]}),{distance:0.3,allEdges:false,edgeIds:[0]});
  const rounding=adaptUISelection('rounding',{mode:'constant',radiusMm:.5,allEdges:true,excludeEdgeIds:[2,5]},['box'],null);
  assert.deepEqual(rounding.scope,{kind:'body',excludeEdgeIds:[2,5]});
  assert.equal(Object.hasOwn(rounding,'excludeEdgeIds'),false);
  assert.deepEqual(normalizeOperationParams('rounding',rounding),rounding);
  const variable=adaptUISelection('rounding',{mode:'variable',radiusStartMm:.5,radiusEndMm:1.5,intermediateStations:[{s:.4,radiusMm:1.2}],chainDirection:'reverse',allEdges:false},['box'],{bodyId:'box',type:'edge',ids:[8]});
  assert.deepEqual(variable.laws,[{chainId:'edge:8',direction:'reverse',interpolation:'linear',stations:[{s:0,radiusMm:.5},{s:.4,radiusMm:1.2},{s:1,radiusMm:1.5}]}]);
  assert.deepEqual(normalizeOperationParams('rounding',variable),variable);
  const chain=adaptUISelection('rounding',{mode:'variable',radiusStartMm:.5,radiusEndMm:1.5,chainDirection:'forward',allEdges:false},['box'],{bodyId:'box',type:'edge',ids:[2,5]});
  assert.deepEqual(chain.scope,{kind:'edges',edgeIds:[2,5]});
  assert.deepEqual(chain.laws,[{chainId:'edges:2,5',direction:'forward',interpolation:'linear',stations:[{s:0,radiusMm:.5},{s:1,radiusMm:1.5}]}]);
  assert.deepEqual(normalizeOperationParams('rounding',chain),chain);
});

test('2 mm plate rounds whole body or selected face and chamfers a selected edge',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
  const kernel=new CadKernel(oc);
  try{
    await kernel.rebuild({version:1,features:[box],imports:{}});
    const faces=await kernel.queryGeometry('box','face',{atExtreme:{axis:'Z',side:'max'}});
    assert.equal(faces.matchCount,1);
    const faceId=faces.items[0].faceId;
    for(const [op,params] of [
      ['fillet',{radius:0.3,allEdges:true}],
      ['fillet',{radius:0.3,faceIds:[faceId]}],
      ['fillet',{radius:0.3,edgeIds:[0]}],
      ['chamfer',{distance:0.3,edgeIds:[0]}],
      ['chamfer',{distance:0.3,faceIds:[faceId]}],
    ]){
      const result=await kernel.rebuild(doc(op,params));
      assert.equal(result.bodies.length,1);
      assert.equal(result.bodies[0].solidCount,1);
      assert(result.bodies[0].volume>0&&result.bodies[0].volume<720);
    }
    const before=kernel.measure('rounded','body').volume;
    const rejected=doc('fillet',{radius:2,allEdges:true});
    await assert.rejects(kernel.rebuild(rejected),e=>e.code==='GEOMETRY_INVALID'&&/失败边/.test(e.message)&&/原模型保留/.test(e.message));
    assert.equal(rejected.features[1].params.radius,2,'failed request must keep the exact requested radius');
    assert.equal(kernel.measure('rounded','body').volume,before,'failed fillet must preserve the last valid body');
  }finally{kernel.dispose();}
});
