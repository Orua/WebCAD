import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildHardwareModel,hardwareDefinitions} from '../src/quick-models/hardware-models.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=x=>{try{x?.delete?.();}catch{}};
function valid(s){const a=new oc.BRepCheck_Analyzer(s.wrapped,true,false,false),solids=s.solids;try{assert.equal(a.IsValid(),true);assert.equal(solids.length,1);assert.ok(cad.measureVolume(s)>0);}finally{dispose(a);solids.forEach(dispose);}}
for(const headType of ['flat','countersunk'])for(const drive of ['cross','slotted','star','hex'])test(`${headType} screw ${drive}: real thread, exposed drive and fixed head rim`,()=>{
 const p={...hardwareDefinitions.screw.defaults,headType,drive,threadLengthMm:3},s=buildHardwareModel('screw',p,cad,oc);
 try{valid(s);assert.equal(s.threadReport.nominalMetricSize,'M3');assert.equal(s.threadReport.standard,'none');const box=s.boundingBox;try{assert.ok(Math.abs(box.bounds[0][2])<1e-6);assert.ok(Math.abs(box.bounds[1][2]-5)<1e-6);}finally{dispose(box);}const shaft=cad.makeCylinder(1.5,3,[0,0,2]),cut=s.intersect(shaft);try{assert.ok(cad.measureVolume(cut)<Math.PI*1.5**2*3-.01);}finally{dispose(cut);dispose(shaft);}const lower=cad.makeCylinder(3,.1),base=s.intersect(lower);try{assert.ok(cad.measureVolume(base)<Math.PI*9*.1-.001);if(headType==='countersunk'){const faces=s.faces;try{assert.ok(faces.some(f=>f.geomType==='CONE'));assert.ok(faces.some(f=>{if(f.geomType!=='CYLINDRE')return false;const a=new oc.BRepAdaptor_Surface(f.wrapped,true),c=a.Cylinder(),b=f.boundingBox;try{return Math.abs(c.Radius()-3)<1e-6&&Math.abs(b.bounds[1][2]-.2)<1e-6;}finally{dispose(a);dispose(c);dispose(b);}}));}finally{faces.forEach(dispose);}}}finally{dispose(base);dispose(lower);}}
 finally{dispose(s);}
});
test('spring is a valid swept wire with both handednesses',()=>{for(const leftHanded of [false,true]){const p={...hardwareDefinitions.spring.defaults,leftHanded},s=buildHardwareModel('spring',p,cad,oc);try{valid(s);const expected=Math.PI*(p.wireDiameterMm/2)**2*p.turns*Math.hypot(2*Math.PI*p.radiusMm,p.pitchMm);assert.ok(Math.abs(cad.measureVolume(s)-expected)<1e-3);}finally{dispose(s);}}});
test('threaded sleeve extends downward and taps upward from its lower end',()=>{
 const p={...hardwareDefinitions.threadedSleeve.defaults,threadDepthMm:3},s=buildHardwareModel('threadedSleeve',p,cad,oc);try{valid(s);const b=s.boundingBox;try{assert.ok(Math.abs(b.bounds[0][2]+8)<1e-6);assert.ok(Math.abs(b.bounds[1][2])<1e-6);}finally{dispose(b);}assert.deepEqual(s.threadReport.axisOrigin,[0,0,-8]);assert.deepEqual(s.threadReport.axisDirection,[0,0,1]);assert.equal(s.threadReport.tappingDirection,'local-positive-Z');const uncut=cad.makeCylinder(.5,1,[0,0,-2]),top=s.intersect(uncut);try{assert.ok(Math.abs(cad.measureVolume(top)-Math.PI*.25)<1e-6);}finally{dispose(uncut);dispose(top);}}finally{dispose(s);}
});
test('domed pin independently controls diameter and height and round-trips STEP',async()=>{
 const s=buildHardwareModel('domedPin',{diameterMm:6,heightMm:1.2},cad,oc);try{valid(s);const box=s.boundingBox;try{box.bounds[1].map((n,i)=>n-box.bounds[0][i]).forEach((v,i)=>assert.ok(Math.abs(v-[6,6,1.2][i])<1e-6));}finally{dispose(box);}const data=await cad.exportSTEP([{shape:s}]),r=await cad.importSTEP(data);try{valid(r);assert.ok(Math.abs(cad.measureVolume(s)-cad.measureVolume(r))<1e-5);}finally{dispose(r);}}finally{dispose(s);}
});
test('invalid hardware dimensions and unknown fields are rejected',()=>{
 for(const [kind,p]of [['spring',{pitchMm:1}],['screw',{headType:'countersunk',headThicknessMm:.2}],['screw',{threadSize:'M9'}],['screw',{headWidthMm:2}],['threadedSleeve',{threadDepthMm:9}],['threadedSleeve',{faceDiameterMm:2}],['domedPin',{heightMm:0}],['screw',{unaskedField:2}]])assert.throws(()=>buildHardwareModel(kind,p,cad,oc));
});
