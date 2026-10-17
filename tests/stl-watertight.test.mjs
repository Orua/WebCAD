import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {meshIntegrity,binaryStl} from '../src/modeling/io/mesh-integrity.js';
test('missing faces and open edges are explicit',()=>{
  const report=meshIntegrity([0,0,0,1,0,0,0,1,0],[0,1,2],{faceCount:3,faceGroups:[{faceId:0,count:3},{faceId:1,count:3}]});
  assert.deepEqual(report.untriangulatedFaceIds,[2]);assert.equal(report.boundaryEdges,3);assert.equal(report.watertight,false);
});
test('whole-shape box mesh and exported STL are closed and volume matches',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),k=new CadKernel(oc);
  try{
    const result=await k.rebuild({version:2,imports:{},features:[{id:'b',op:'box',params:{width:10,depth:8,height:6},refs:[]}]});
    const r=result.bodies[0].displayReport;assert.deepEqual(r.untriangulatedFaceIds,[]);assert.equal(r.boundaryEdges,0);assert.equal(r.nonManifoldEdges,0);assert.equal(r.watertight,true);assert(r.volumeErrorRatio<.01);
    const out=await k.export('stl');assert.equal(out.report.watertight,true);const view=new DataView(out.data.buffer);assert.equal(out.data.byteLength,84+50*view.getUint32(80,true));
  }finally{k.dispose();}
});
