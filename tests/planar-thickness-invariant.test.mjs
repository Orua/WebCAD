import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildFaceThickness,checkPlanarThickness} from '../src/surface-thickness.js';
import {CadKernel} from '../src/cad-kernel.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);

test('planar normal thickness preserves footprint and holes in both directions',()=>{
  const outer=cad.sketchRectangle(10,8).wire,inner=cad.sketchCircle(1).wire;
  const face=cad.addHolesInFace(cad.makeFace(outer),[inner]);
  try{for(const thickness of [1,-1]){
    const solid=buildFaceThickness(face,{faceId:0,thickness},cad);
    try{assert.ok(Math.abs(cad.measureVolume(solid)-(80-Math.PI))<1e-6);const solids=solid.solids;assert.equal(solids.length,1);solids.forEach(x=>x.delete());}
    finally{solid.delete();}
  }}finally{face.delete();outer.delete();inner.delete();}
});
test('curved fitted face thickness remains supported without planar invariant',async()=>{
  const kernel=new CadKernel(oc),points=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>[i*10,j*10,1.5*Math.sin(i)*Math.sin(j)]));
  try{const result=await kernel.rebuild({version:1,features:[{id:'surface',op:'fittedSurface',params:{points,tolerance:0.01},refs:[]},{id:'thick',op:'thickenFace',params:{faceId:0,thickness:1},refs:['surface']}],imports:{},hidden:[]});assert.equal(result.bodies[0].solidCount,1);assert.ok(result.bodies[0].volume>100);}
  finally{kernel.dispose();}
});
test('planar footprint drift is rejected even if the proposed solid is valid',()=>{
  const face=cad.sketchRectangle(10,8).face(),wrong=cad.makeBox([0,0,0],[10,9,1]);
  try{assert.throws(()=>checkPlanarThickness(face,wrong,1,cad),/平面增厚改变了轮廓.*未提交结果/);}
  finally{face.delete();wrong.delete();}
});
