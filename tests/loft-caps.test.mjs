import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildSectionCurveLoft} from '../src/section-curve-loft.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const stations=Array.from({length:3},(_,i)=>({centerMm:[0,0,i*5],normal:[0,0,1],widthDirection:[1,0,0],widthMm:2,depthMm:2}));
test('UP-24 accepts forty/sixty-four sections and closes point/round caps through AddVertex',()=>{
 for(const count of [40,64]){const many=Array.from({length:count},(_,i)=>({...stations[0],centerMm:[0,0,i]}));const plain=buildSectionCurveLoft({stations:many,loftDegree:2},cad);
  try{const solids=plain.solids;try{assert.equal(solids.length,1);}finally{solids.forEach(s=>s.delete?.());}if(count===64)assert.equal(plain.loftReport.warning?.code,'LOFT_COMPLEXITY');}finally{plain.delete();}}
 for(const cap of [{kind:'point'},{kind:'round',lengthMm:1}]){const shape=buildSectionCurveLoft({stations,endCap:cap,loftDegree:2,volumeCheck:'off'},cad);
  try{const solids=shape.solids;try{assert.equal(solids.length,1);}finally{solids.forEach(s=>s.delete?.());}assert.ok(cad.measureVolume(shape)>0);}finally{shape.delete();}}
});
