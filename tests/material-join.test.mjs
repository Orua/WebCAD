import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import { buildProfileExtrude } from '../src/modeling/profiles/profile-extrude.js';
import { buildProfileRevolve, buildProfileSweep, buildProfileLoft } from '../src/modeling/profiles/profile-solid-features.js';
import { buildSketchProfile } from '../src/modeling/profiles/profile-model.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=value=>{try{value?.delete?.();}catch{}};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} != ${b}`);
const circle=z=>{const edge=cad.makeCircle(1,[0,0,z],[0,0,1]);try{return cad.assembleWire([edge]);}finally{dispose(edge);}};
const rectangle=(x,y,z=0,width=2,height=2)=>{
  const shape=buildSketchProfile({profileVersion:1,entities:[{id:'r',type:'rectangle',originMm:[x,y],widthMm:width,heightMm:height}],loops:[{id:'l',edges:[{entityId:'r',reversed:false}]}],regions:[{id:'region',outerLoopId:'l',holeLoopIds:[]}],output:'face'},cad);
  if(z){const moved=shape.translate(0,0,z);return moved;}return shape;
};
const valid=shape=>{const check=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false),solids=shape.solids;try{assert.equal(check.IsValid(),true);assert.equal(solids.length,1);}finally{dispose(check);solids.forEach(dispose);}};

for(const [label,build,prepare,toolVolume]of [
  ['extrude',(sources)=>buildProfileExtrude(sources,{operation:'join',extent:'distance',distanceMm:5,direction:1},cad),()=>[rectangle(-1,-1,5),cad.makeBox([-2,-2,0],[2,2,5])],20],
  ['sweep',(sources)=>buildProfileSweep(sources,{operation:'join'},cad),()=>[circle(5),cad.makeLine([0,0,5],[0,0,10]),cad.makeBox([-2,-2,0],[2,2,5])],5*Math.PI],
  ['loft',(sources)=>buildProfileLoft(sources,{operation:'join',ruled:true},cad),()=>[circle(5),circle(10),cad.makeBox([-2,-2,0],[2,2,5])],5*Math.PI],
  ['revolve',(sources)=>buildProfileRevolve(sources,{operation:'join',axisPoint:[0,0,0],axisDirection:[0,1,0],angleDeg:360},cad),()=>[rectangle(3,0,0,2,4),cad.makeBox([-6,-2,-6],[6,0,6])],64*Math.PI],
]){
  test(`${label}: exact shared-face join forms one valid solid and preserves all borrowed BReps`,()=>{
    const sources=prepare(),before=sources.map(shape=>shape.serialize());let result;
    try{const targetVolume=cad.measureVolume(sources.at(-1));result=build(sources);valid(result);near(cad.measureVolume(result),targetVolume+toolVolume);assert.deepEqual(sources.map(shape=>shape.serialize()),before);}
    finally{dispose(result);sources.forEach(dispose);}
  });
  test(`${label}: disconnected join rejects without modifying sources`,()=>{
    const sources=prepare();sources[sources.length-1]=sources.at(-1).translate(100,0,0);const before=sources.map(shape=>shape.serialize());
    try{assert.throws(()=>build(sources));assert.deepEqual(sources.map(shape=>shape.serialize()),before);}finally{sources.forEach(dispose);}
  });
}

test('extrude allows side-face and overlapping joins, rejects edge/point-only contact and no added material',()=>{
  const target=cad.makeBox([0,0,0],[10,10,2]);
  for(const [label,x,y,z,accepted,volume]of [['side',10,2,0,true,208],['overlap',9,2,0,true,204],['edge',10,10,0,false],['point',10,10,2,false],['contained',2,2,0,false]]){
    const profile=rectangle(x,y,z),before=[profile,target].map(shape=>shape.serialize());let result;
    try{const run=()=>buildProfileExtrude([profile,target],{operation:'join',extent:'distance',distanceMm:2,direction:1},cad);
      if(accepted){result=run();valid(result);near(cad.measureVolume(result),volume);}else assert.throws(run,undefined,label);
      assert.deepEqual([profile,target].map(shape=>shape.serialize()),before,label);
    }finally{dispose(result);dispose(profile);}
  }dispose(target);
});
