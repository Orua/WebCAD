import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildFittedSurface} from '../src/fitted-surface.js';
cad.setOC(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
test('uniform source parameters reproduce the original cubic bridge and horizontal end normals',()=>{
 const point=(u,v)=>[10*u,12*v-6,8*(3*u*u-2*u*u*u)];
 const points=Array.from({length:12},(_,i)=>Array.from({length:12},(_,j)=>point(j/11,i/11))),original=structuredClone(points);
 const shape=buildFittedSurface({points,interpolation:'uniformCubic',tolerance:.001},cad),faces=shape.faces;
 try{
  assert.equal(faces.length,1);assert.equal(shape.solids.length,0);
  for(const u of [0,.113,.337,.719,1])for(const v of [0,.219,.581,1]){
   const vertex=cad.makeVertex(point(u,v));try{assert(cad.measureDistanceBetween(shape,vertex)<1e-6);}finally{vertex.delete();}
  }
  for(const p of [[0,0,0],[10,0,8]]){const normal=faces[0].normalAt(p);try{assert(Math.abs(normal.z)>1-1e-10);}finally{normal.delete();}}
  assert.deepEqual(points,original);
 }finally{faces.forEach(f=>f.delete());shape.delete();}
});
