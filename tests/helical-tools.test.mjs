import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildHelix,buildCoil,buildThread} from '../src/modeling/manufacturing/helical-tools.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=s=>{try{s?.delete?.();}catch{}};
function valid(s){const checker=new oc.BRepCheck_Analyzer(s.wrapped,true,false,false);try{assert.equal(checker.IsValid(),true);}finally{dispose(checker);}}
function cylinderFace(shape,internal=false){const faces=shape.faces;try{return faces.findIndex(face=>face.geomType==='CYLINDRE'&&(face.normalAt().toTuple().reduce((n,x,i)=>n+x*face.center.toTuple()[i],0)<0)===internal);}finally{faces.forEach(dispose);}}
test('exact helix length, axial rise and handedness',()=>{
 for(const leftHanded of [false,true]){const s=buildHelix({radiusMm:10,pitchMm:3,turns:4,leftHanded},cad);try{valid(s);assert.ok(Math.abs(cad.measureLength(s)-4*Math.hypot(2*Math.PI*10,3))<1e-5);const edges=s.edges;try{const end=edges.at(-1).endPoint.toTuple(),t=edges[0].tangentAt(0).toTuple();assert.ok(Math.abs(end[2]-12)<1e-7);assert.equal(t[1]>0,!leftHanded);}finally{edges.forEach(dispose);}}finally{dispose(s);}}
});
test('round-wire coil has analytic volume and exports exact STEP',async()=>{
 const s=buildCoil({radiusMm:10,pitchMm:3,turns:4,wireDiameterMm:1.4},oc,cad);try{valid(s);const expected=Math.PI*.7**2*4*Math.hypot(2*Math.PI*10,3);assert.ok(Math.abs(cad.measureVolume(s)-expected)/expected<1e-5);const step=await cad.exportSTEP([{shape:s}]),restored=await cad.importSTEP(step);try{valid(restored);assert.ok(Math.abs(cad.measureVolume(restored)-expected)/expected<1e-4);}finally{dispose(restored);}}finally{dispose(s);}
 assert.throws(()=>buildCoil({radiusMm:10,pitchMm:1,turns:4,wireDiameterMm:1.4},oc,cad),/螺距/);
 assert.throws(()=>buildHelix({radiusMm:10,pitchMm:3,turns:101},cad),/100/);
});
test('external V-groove cuts real material, clips axial interval and preserves source',()=>{
 const source=cad.makeCylinder(10,15),before=source.serialize(),v=cad.measureVolume(source);
 try{const faceId=cylinderFace(source),s=buildThread(source,{faceId,kind:'external',pitchMm:2,depthMm:.6,lengthMm:8,startOffsetMm:3},oc,cad);try{valid(s);assert.ok(cad.measureVolume(s)<v);assert.equal(s.threadReport.standard,'none');assert.deepEqual(s.threadReport.axisOrigin,[0,0,3]);assert.equal(source.serialize(),before);const plane=cad.makeCylinder(10,2,[0,0,0]),uncut=s.intersect(plane);try{assert.ok(Math.abs(cad.measureVolume(uncut)-Math.PI*100*2)<1e-5);}finally{dispose(uncut);dispose(plane);}}finally{dispose(s);}}finally{dispose(source);}
});
test('internal left-hand thread and arbitrary oriented axis are exact cuts',()=>{
 let a=cad.makeCylinder(12,12),hole=cad.makeCylinder(8,12),tube=a.cut(hole);dispose(a);dispose(hole);
 const rotated=tube.rotate(90,[0,0,0],[1,0,0]),source=rotated.translate([4,7,10]);dispose(tube);dispose(rotated);
 try{const faces=source.faces;let faceId=-1;try{for(let i=0;i<faces.length;i++){if(faces[i].geomType!=='CYLINDRE')continue;const ad=new oc.BRepAdaptor_Surface(faces[i].wrapped,true),c=ad.Cylinder();try{if(Math.abs(c.Radius()-8)<1e-7)faceId=i;}finally{dispose(c);dispose(ad);}}}finally{faces.forEach(dispose);}const before=source.serialize(),v=cad.measureVolume(source);const result=buildThread(source,{faceId,kind:'internal',pitchMm:2,depthMm:.6,lengthMm:10,leftHanded:true},oc,cad);try{valid(result);assert.ok(cad.measureVolume(result)<v);assert.equal(source.serialize(),before);assert.ok(Math.abs(result.threadReport.axisDirection[1])>.99);}finally{dispose(result);}}finally{dispose(source);}
});
test('invalid face, wrong material side and exceeding length reject without touching source',()=>{
 const source=cad.makeCylinder(10,12),before=source.serialize(),faceId=cylinderFace(source),p={faceId,kind:'external',pitchMm:2,depthMm:.6,lengthMm:10};
 try{assert.throws(()=>buildThread(source,{...p,kind:'internal'},oc,cad),/材料侧/);assert.throws(()=>buildThread(source,{...p,lengthMm:13},oc,cad),/超出/);assert.throws(()=>buildThread(source,{...p,pitchMm:.2},oc,cad),/牙宽/);assert.throws(()=>buildThread(source,{...p,faceId:999},oc,cad),/圆柱面/);assert.equal(source.serialize(),before);}finally{dispose(source);}
});
