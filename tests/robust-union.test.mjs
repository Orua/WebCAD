import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {robustUnion} from '../src/modeling/robust-union.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const volume=shape=>{const props=new oc.GProp_GProps();try{oc.BRepGProp.VolumePropertiesGK(shape.wrapped,props,1e-9,true,true,false,false,false);return Math.abs(props.Mass());}finally{props.delete();}};
test('coplanar touching end faces fuse with explicit shift glue',()=>{
  const a=cad.makeBox([0,0,0],[10,10,10]),b=cad.makeBox([10,0,0],[20,10,10]);let result;
  try{result=robustUnion([a,b],{glue:'shift',measure:volume});assert.equal(result.solids.length,1);assert(Math.abs(volume(result)-2000)<1e-6);assert.equal(result.booleanReport.strategy,'multi-fuse');}finally{result?.delete();a.delete();b.delete();}
});
test('ten-tool material and timing benchmark compares the prior sequential volume checks',()=>{
  const shapes=[cad.makeBox([0,0,0],[40,20,8]),...Array.from({length:10},(_,i)=>cad.makeSphere(3,[3+i*3.5,10,8]))];let serial,multi;
  try{
    let started=performance.now();serial=shapes[0].clone();
    for(const tool of shapes.slice(1)){const before=volume(serial),toolVolume=volume(tool),next=serial.fuse(tool),after=volume(next);assert(after>=Math.max(before,toolVolume)-1e-6&&after<=before+toolVolume+1e-6);serial.delete();serial=next;}
    const sequentialMs=performance.now()-started;started=performance.now();multi=robustUnion(shapes,{measure:volume});const multiMs=performance.now()-started;
    assert(Math.abs(volume(serial)-volume(multi))/volume(serial)<.001);
    console.log(JSON.stringify({case:'ten-tool-union',sequentialMs,multiMs,notSlower:multiMs<=sequentialMs,volumeMm3:volume(multi),faces:multi.faces.length,strategy:multi.booleanReport.strategy}));
  }finally{serial?.delete();multi?.delete();shapes.forEach(shape=>shape.delete());}
});
