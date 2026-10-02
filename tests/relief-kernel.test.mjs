import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildRelief} from '../src/modeling/manufacturing/relief.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=x=>{try{x?.delete?.();}catch{}};
const values=Array.from({length:9},(_,y)=>Array.from({length:9},(_,x)=>Math.max(0,1-Math.hypot(x-4,y-4)/4)));
function faceIndex(source,n){const faces=source.faces;try{return faces.findIndex(f=>{if(f.geomType!=='PLANE')return false;const normal=f.normalAt();try{return normal.toTuple().every((v,i)=>Math.abs(v-n[i])<1e-7);}finally{dispose(normal);}});}finally{faces.forEach(dispose);}}
function valid(s){const a=new oc.BRepCheck_Analyzer(s.wrapped,true,false,false),solids=s.solids;try{assert.ok(a.IsValid());assert.equal(solids.length,1);}finally{dispose(a);solids.forEach(dispose);}}
test('smooth multilevel relief and engraving on top, bottom and side preserve the source',()=>{
 for(const normal of [[0,0,1],[0,0,-1],[1,0,0]])for(const mode of ['emboss','engrave']){
  const source=cad.makeBox([0,0,0],[20,20,20]),before=source.serialize();let result;
  try{result=buildRelief(source,{faceId:faceIndex(source,normal),values,widthMm:10,heightMm:8,depthMm:1,mode,angleDeg:17},oc,cad);valid(result);assert.equal(source.serialize(),before);assert.ok(mode==='emboss'?cad.measureVolume(result)>8000:cad.measureVolume(result)<8000);assert.ok(result.reliefReport.valid);const faces=result.faces;try{assert.ok(faces.some(f=>f.geomType==='BSPLINE_SURFACE'));}finally{faces.forEach(dispose);}}
  finally{dispose(result);dispose(source);}
 }
});
test('outside face, face holes, curved targets and zero patterns reject without source changes',()=>{
 const cylinder=cad.makeCylinder(10,4),box=cad.makeBox([0,0,0],[20,20,4]),hole=cad.makeCylinder(2,5,[10,10,0]);let pierced=box.cut(hole);
 try{
  for(const [source,params,code]of [[box,{faceId:faceIndex(box,[0,0,1]),widthMm:24},'RELIEF_OUTSIDE_FACE'],[pierced,{faceId:faceIndex(pierced,[0,0,1])},'RELIEF_OUTSIDE_FACE'],[cylinder,{faceId:0},'RELIEF_UNSUPPORTED'],[box,{faceId:faceIndex(box,[0,0,1]),values:values.map(r=>r.map(()=>0))},'RELIEF_NO_CHANGE']]){
   const before=source.serialize();assert.throws(()=>buildRelief(source,{values,widthMm:10,heightMm:10,depthMm:1,...params},oc,cad),e=>e.code===code);assert.equal(source.serialize(),before);
  }
 }finally{[pierced,hole,box,cylinder].forEach(dispose);}
});
