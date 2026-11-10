import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildFaceMachining} from '../src/modeling/manufacturing/face-machining.js';
import {logoFaceSignature} from '../src/logo-face-signature.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=x=>{try{x?.delete?.();}catch{}};
function faceWithNormal(s,normal){const faces=s.faces;try{return faces.findIndex(f=>{if(f.geomType!=='PLANE')return false;const n=f.normalAt();try{return n.toTuple().every((v,i)=>Math.abs(v-normal[i])<1e-6);}finally{dispose(n);}});}finally{faces.forEach(dispose);}}
function valid(s,volume){const a=new oc.BRepCheck_Analyzer(s.wrapped,true,false,false);try{assert.equal(a.IsValid(),true);assert.ok(Math.abs(cad.measureVolume(s)-volume)<1e-4);}finally{dispose(a);}}
for(const [kind,p,expected]of [['faceGroove',{lengthMm:8,widthMm:4,depthMm:2},1000-64],['innerTurn',{diameterMm:4,depthMm:5},1000-20*Math.PI]])test(`${kind} cuts inward from top and side without modifying source`,()=>{
 for(const normal of [[0,0,1],[1,0,0]]){const source=cad.makeBox([0,0,0],[10,10,10]),before=source.serialize(),s=buildFaceMachining(source,{faceId:faceWithNormal(source,normal),...p},kind,oc,cad);try{valid(s,expected);assert.equal(source.serialize(),before);}finally{dispose(s);dispose(source);}}
});
test('external turning retains material below depth and STEP geometry',async()=>{
 const source=cad.makeCylinder(5,10),before=source.serialize(),s=buildFaceMachining(source,{faceId:faceWithNormal(source,[0,0,1]),diameterMm:6,depthMm:4},'outerTurn',oc,cad);
 try{valid(s,186*Math.PI);assert.equal(source.serialize(),before);const data=await cad.exportSTEP([{shape:s}]),r=await cad.importSTEP(data);try{valid(r,186*Math.PI);}finally{dispose(r);}const bottom=cad.makeCylinder(5,5),uncut=s.intersect(bottom);try{valid(uncut,125*Math.PI);}finally{dispose(bottom);dispose(uncut);}}finally{dispose(s);dispose(source);}
});
test('faceGroove rejects a curved wall, shifts with offsets, and remaps a signed face',()=>{
  const cylinder=cad.makeCylinder(5,10),faces=cylinder.faces;let curved;
  try{curved=faces.findIndex(face=>face.geomType!=='PLANE');}finally{faces.forEach(dispose);}
  assert.throws(()=>buildFaceMachining(cylinder,{faceId:curved,lengthMm:4,widthMm:2,depthMm:1},'faceGroove',oc,cad),error=>/平面/.test(error.message));
  dispose(cylinder);
  const box=cad.makeBox([0,0,0],[10,10,10]),top=faceWithNormal(box,[0,0,1]);
  const centered=buildFaceMachining(box,{faceId:top,lengthMm:4,widthMm:4,depthMm:2},'faceGroove',oc,cad);
  const shifted=buildFaceMachining(box,{faceId:top,lengthMm:4,widthMm:4,depthMm:2,offsetXMm:6},'faceGroove',oc,cad);
  const boxFaces=box.faces;let signature,side;
  try{signature=logoFaceSignature(boxFaces[top],cad);side=boxFaces.findIndex((face,index)=>index!==top&&face.geomType==='PLANE');}
  finally{boxFaces.forEach(dispose);}
  const remapped=buildFaceMachining(box,{faceId:side,lengthMm:4,widthMm:4,depthMm:2,targetFaceSignature:signature},'faceGroove',oc,cad);
  try{
    assert.ok(Math.abs(cad.measureVolume(centered)-(1000-32))<1e-3);
    assert.ok(!centered.warnings);
    assert.ok(cad.measureVolume(shifted)>cad.measureVolume(centered));
    assert.ok(shifted.warnings?.some(warning=>warning.code==='PARTIAL_RECESS'));
    assert.ok(Math.abs(cad.measureVolume(remapped)-cad.measureVolume(centered))<1e-3);
  }finally{[centered,shifted,remapped,box].forEach(dispose);}
});
test('curved face, stale index, no material and invalid params fail preserving source',()=>{
 const source=cad.makeCylinder(5,10),before=source.serialize(),faces=source.faces;let curved;try{curved=faces.findIndex(f=>f.geomType==='CYLINDRE');}finally{faces.forEach(dispose);}const top=faceWithNormal(source,[0,0,1]);
 try{for(const p of [{faceId:curved,diameterMm:4,depthMm:2},{faceId:999,diameterMm:4,depthMm:2},{faceId:top,diameterMm:4,depthMm:0},{faceId:top,diameterMm:4,depthMm:2,x:1}])assert.throws(()=>buildFaceMachining(source,p,'innerTurn',oc,cad));assert.throws(()=>buildFaceMachining(source,{faceId:top,diameterMm:20,depthMm:2},'outerTurn',oc,cad));assert.equal(source.serialize(),before);}finally{dispose(source);}
});
