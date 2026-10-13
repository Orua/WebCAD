import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {displayMetadata,displayEdges,refineExactDisplay} from '../src/modeling/io/adaptive-display.js';
import {requestedFaceTolerance} from '../src/viewport/exact-display-policy.js';
import * as THREE from 'three';
import {ExactDisplayDetail} from '../src/viewport/exact-detail.js';

test('pixel budget refines zoomed views; movement coarsens without changing model units',()=>{
  assert.equal(requestedFaceTolerance(.1),.06);
  assert.equal(requestedFaceTolerance(.01),.0075);
  assert.equal(requestedFaceTolerance(.04,true),.12);
  assert.equal(requestedFaceTolerance(.04,false,'draft'),.06);
  assert.equal(requestedFaceTolerance(.04,false,'fine'),.015);
});
test('exact display readback counts base faces and reports the selected quality budget',()=>{
  const camera=new THREE.PerspectiveCamera(35,1,.1,100);camera.position.set(0,0,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));geometry.computeVertexNormals();
  const entry={root:new THREE.Group(),mesh:new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()),edges:new THREE.Group(),body:{id:'test',indices:new Uint32Array([0,1,2]),faceGroups:[{start:0,count:3,faceId:0,exactPolygon:true}],adaptiveDisplay:{requestedQuality:'draft'}}};
  const v={camera,host:{clientHeight:500},objects:new Map([['test',entry]]),mode:'solid',callbacks:{}};
  const detail=new ExactDisplayDetail(v);detail.attach(entry);const state=detail.update(false);
  assert.equal(state.fullTriangles,1);assert.equal(state.patchCount,1);assert.equal(state.screenErrorBudgetPx,2);assert.equal(state.visibleFaces,1);detail.release(entry);geometry.dispose();
});
test('display metadata and face refinement preserve exact geometry and reject stale topology',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
  const kernel=new CadKernel(oc);
  try{
    await kernel.rebuild({version:2,features:[{id:'body',op:'box',params:{width:10,depth:8,height:6},refs:[]}],imports:{}});
    const shape=kernel.shapes.get('body'),faces=shape.faces,edges=shape.edges;
    try{
      const meta=displayMetadata(shape,faces,edges,oc);assert.equal(meta.volume,null);assert.equal(meta.metricsDeferred,true);
      assert(meta.bounds.min[0]<=0&&meta.bounds.max[0]>=10);
      const lines=displayEdges(edges,.12,oc);assert.equal(lines.length,12);assert(lines.every(e=>e.positions.length>=6));
    }finally{[...faces,...edges].forEach(s=>s.delete());}
    const volume=kernel.measure('body').volume;
    const body=kernel.renderCache.get('body').body;body.adaptiveDisplay={initialTolerance:.12};
    assert.throws(()=>refineExactDisplay(kernel,{bodyId:'body',renderVersion:'stale',faceIds:[0],tolerance:.03}),{code:'STALE_DISPLAY'});
    const refined=refineExactDisplay(kernel,{bodyId:'body',renderVersion:body.renderVersion,faceIds:[0],tolerance:.03});
    assert(refined.patches[0].indices.length>=3);assert.equal(kernel.measure('body').volume,volume);
    assert.throws(()=>refineExactDisplay(kernel,{bodyId:'body',renderVersion:body.renderVersion,faceIds:[0,1,2],tolerance:.03}));
  }finally{kernel.dispose();}
});
