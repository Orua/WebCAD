import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {robustUnion,unionSourceExtentLoss} from '../src/modeling/robust-union.js';
import {usesOrdinalTopology} from '../src/legacy-topology-policy.js';
test('saved ordinal selections disable reordered Boolean recipes; semantic selections keep the optimized route',()=>{
  assert.equal(usesOrdinalTopology([{params:{faceIds:[3,4,6,7]}}]),true);
  assert.equal(usesOrdinalTopology([{params:{edgeIds:[0]}}]),true);
  assert.equal(usesOrdinalTopology([{params:{selector:{seamBetween:['a','b']}}}]),false);
});
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const volume=shape=>{const props=new oc.GProp_GProps();try{oc.BRepGProp.VolumePropertiesGK(shape.wrapped,props,1e-9,true,true,false,false,false);return Math.abs(props.Mass());}finally{props.delete();}};
test('union extent validation detects a missing lobe even when BRep and volume checks pass',()=>{
  const trunk=cad.makeBox([0,0,0],[10,10,10]);
  const lobe=cad.makeBox([6,3,7],[9,7,14]);
  const contained=cad.makeBox([3,3,3],[7,7,7]);
  const box=shape=>{const box=shape.boundingBox;try{return box.bounds;}finally{box.delete();}};
  try{
    const result=box(trunk),input=[result,box(lobe)];
    assert.ok(volume(trunk)>=Math.max(volume(trunk),volume(lobe)));
    const loss=unionSourceExtentLoss(input,result,1e-4);
    assert.equal(loss.length,1);
    assert.deepEqual({...loss[0],missingMm:Math.round(loss[0].missingMm)},{sourceIndex:1,axis:'Z',side:'max',missingMm:4});
    assert.deepEqual(unionSourceExtentLoss([result,box(contained)],result,1e-4),[]);
    const joined=robustUnion([trunk,lobe],{measure:volume});
    try{assert.deepEqual(unionSourceExtentLoss(input,box(joined),1e-4),[]);}
    finally{joined.delete();}
  }finally{[trunk,lobe,contained].forEach(shape=>shape.delete());}
});
test('coplanar touching end faces fuse with explicit shift glue',()=>{
  const a=cad.makeBox([0,0,0],[10,10,10]),b=cad.makeBox([10,0,0],[20,10,10]);let result;
  try{result=robustUnion([a,b],{glue:'shift',measure:volume});assert.equal(result.solids.length,1);assert(Math.abs(volume(result)-2000)<1e-6);assert.equal(result.booleanReport.strategy,'multi-fuse');}finally{result?.delete();a.delete();b.delete();}
});
test('connected union rejects disconnected inputs without changing the generic compound contract',()=>{
  const a=cad.makeBox([0,0,0],[10,10,10]),far=cad.makeBox([20,0,0],[28,8,8]);
  const overlapping=cad.makeBox([8,0,0],[14,8,8]);
  let generic,connected;
  try{
    assert.throws(()=>robustUnion([a,far],{measure:volume,requireConnected:true}),
      error=>error.code==='GEOMETRY_INVALID'&&error.details?.solidCount===2&&error.details?.requiredSolidCount===1);
    generic=robustUnion([a,far],{measure:volume});
    assert.equal(generic.booleanReport.solidCount,2);
    assert.equal(generic.booleanReport.fused,false);
    connected=robustUnion([a,overlapping],{measure:volume,requireConnected:true});
    assert.equal(connected.booleanReport.solidCount,1);
    assert.ok(Math.abs(volume(a)-1000)<1e-8);
  }finally{[generic,connected,a,far,overlapping].forEach(shape=>shape?.delete());}
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
