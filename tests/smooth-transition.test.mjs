import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildSmoothTransition,topologyDetails} from '../src/smooth-transition.js';
import {normalizeOperationParams,getOperation} from '../src/operation-registry.js';
import {adaptUISelection} from '../src/ui-selection-adapter.js';
import {CadKernel} from '../src/cad-kernel.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const allFaces=shape=>{const faces=shape.faces;try{return faces.map((_,i)=>i);}finally{faces.forEach(f=>f.delete());}};

test('strict face group contract and UI selection agree',()=>{
  assert.equal(getOperation('smoothTransition').v2Executable,true);
  assert.deepEqual(normalizeOperationParams('smoothTransition',{radius:.1,faceIds:[0,1]}),{radius:.1,faceIds:[0,1]});
  for(const faceIds of [[0],[0,0]])assert.throws(()=>normalizeOperationParams('smoothTransition',{radius:.1,faceIds}));
  assert.throws(()=>normalizeOperationParams('smoothTransition',{radius:.1,faceIds:[0,1],allEdges:true}));
  assert.deepEqual(adaptUISelection('smoothTransition',{radius:.1},['s'],{bodyId:'s',type:'face',ids:[0,1]}),{radius:.1,faceIds:[0,1]});
});
test('chamfered thin body gets coupled transitions without sharp sampled seams',()=>{
  const box=cad.makeBox([0,0,0],[36,10,2]),edges=box.edges;
  const shape=box.chamfer({radius:.5,filter:new cad.EdgeFinder().inList([edges[0]])});
  let result;
  try{
    assert(topologyDetails(shape).some(e=>e.sharp));
    result=buildSmoothTransition(shape,{radius:.1,faceIds:allFaces(shape)});
    assert.equal(result.transitionReport.remainingSharpEdgeCount,0);
    assert.equal(topologyDetails(result).filter(e=>e.sharp).length,0);
    assert(cad.measureVolume(result)<cad.measureVolume(shape));
  }finally{result?.delete();shape.delete();box.delete();edges.forEach(e=>{try{e.delete();}catch{}});}
});
test('failed transition keeps last committed body and geometry fingerprint',async()=>{
  const kernel=new CadKernel(oc),box={id:'box',op:'box',params:{width:36,depth:10,height:2},refs:[]};
  try{
    await kernel.rebuild({version:1,features:[box],imports:{}});
    const before=await kernel.queryGeometry('box','edge',{});
    assert.equal(before.items[0].adjacentFaceIds.length,2);
    assert.equal(before.items[0].startPoint.length,3);
    await assert.rejects(kernel.rebuild({version:1,features:[box,{id:'bad',op:'smoothTransition',params:{radius:5,faceIds:[0,1,2,3,4,5]},refs:['box']}],imports:{}}));
    assert.equal((await kernel.queryGeometry('box','edge',{})).geometryFingerprint,before.geometryFingerprint);
  }finally{kernel.dispose();}
});
test('authorized local STEP: outer junctions smooth, engraved edges remain reported',{skip:!process.env.WEBCAD_TEST_STEP},async()=>{
  const shape=(await cad.importSTEP(new Blob([fs.readFileSync(process.env.WEBCAD_TEST_STEP)]))).asShape3D();
  let result;
  try{
    result=buildSmoothTransition(shape,{radius:.1,faceIds:[0,1,2,3,4,5,72,73]});
    assert.equal(result.transitionReport.processedSeams,15);
    assert.equal(result.transitionReport.remainingSharpEdgeCount,234);
    assert(Math.abs(cad.measureVolume(result)-685.8209325348216)<1e-6);
    // Remaining creases must be inherited unselected edges; production builder checks this spatially.
    assert.equal(result.transitionReport.validation,'valid-solid; selected-sharp-seams-removed; no-new-sharp-seams-at-samples');
  }finally{result?.delete();shape.delete();}
});
