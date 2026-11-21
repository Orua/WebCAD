import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {robustUnion,unionSourceExtentLoss} from '../src/modeling/robust-union.js';
import {verifyUnionMaterial} from '../src/modeling/union-material.js';
import {getOperation} from '../src/operation-registry.js';
import {assertCompilableFeature} from '../src/services/geometry-exchange.js';
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


test('exact union coverage detects a missing bridge with identical extents and covered vertices',()=>{
  const stock=cad.makeBox([0,0,0],[10,10,10]),hole=cad.makeBox([2,2,-1],[8,8,11]);
  const ring=stock.cut(hole),bridge=cad.makeBox([1,4,4],[9,6,6]);let joined;
  const box=shape=>{const b=shape.boundingBox;try{return b.bounds;}finally{b.delete();}};
  try{
    assert.deepEqual(unionSourceExtentLoss([box(ring),box(bridge)],box(ring),1e-4),[]);
    assert.ok(volume(ring)>=volume(bridge));
    const ringSolids=ring.solids,query=new cad.DistanceQuery(ringSolids[0]),vertices=[1,9].flatMap(x=>[4,6].flatMap(y=>[4,6].map(z=>cad.makeVertex([x,y,z]))));
    try{for(const vertex of vertices)assert.ok(query.distanceTo(vertex)<1e-7);}finally{query.delete();vertices.forEach(v=>v.delete());ringSolids.forEach(s=>s.delete());}
    assert.throws(()=>verifyUnionMaterial([ring,bridge],ring,{cad,measure:volume,toolIds:['ring','bridge']}),error=>{
      const report=error.details.materialCoverage;
      assert.equal(error.code,'GEOMETRY_INVALID');assert.equal(report.status,'failed');
      assert.equal(report.checks[1].toolId,'bridge');
      assert.ok(Math.abs(report.checks[1].missingVolumeMm3-24)<1e-6);
      return true;
    });
    joined=robustUnion([ring,bridge],{measure:volume,verifyMaterial:true,requireConnected:true,toolIds:['ring','bridge']});
    assert.equal(joined.booleanReport.materialCoverage.status,'verified');
    assert.equal(joined.booleanReport.materialCoverage.checks.length,2);
    assert.ok(joined.booleanReport.materialCoverage.checks.every(c=>c.missingVolumeMm3<=c.toleranceMm3));
    assert.ok(Math.abs(volume(joined)-664)<1e-6);
    assert.ok(Math.abs(volume(ring)-640)<1e-6,'read-only coverage must not alter its input');
  }finally{[joined,ring,bridge,hole,stock].forEach(s=>s?.delete());}
});

test('exact coverage accepts contained and disconnected material; connection is a separate policy',()=>{
  const a=cad.makeBox([0,0,0],[10,10,10]),inside=cad.makeBox([2,2,2],[3,3,3]),far=cad.makeBox([20,0,0],[21,1,1]);let joined;
  try{
    joined=robustUnion([a,inside,far],{measure:volume,verifyMaterial:true});
    assert.equal(joined.booleanReport.materialCoverage.status,'verified');
    assert.equal(joined.booleanReport.solidCount,2);
    assert.ok(Math.abs(volume(joined)-1001)<1e-6);
  }finally{[joined,a,inside,far].forEach(s=>s?.delete());}
});

test('material verification is opt-in, discoverable and never silently compiled without native support',()=>{
  assert.equal(getOperation('union').inputSchema.properties.verifyMaterial.type,'boolean');
  assert.throws(()=>assertCompilableFeature({op:'union',refs:['a','b'],params:{verifyMaterial:true}}),e=>e.code==='OPERATION_UNAVAILABLE');
  const a=cad.makeBox([0,0,0],[2,2,2]),b=cad.makeBox([1,0,0],[3,2,2]);let joined;
  try{
    joined=robustUnion([a,b],{measure:volume});assert.equal(joined.booleanReport.materialCoverage,undefined);
    assert.throws(()=>robustUnion([a,b],{verifyMaterial:'true'}),e=>e.code==='PARAM_SCHEMA_INVALID');
    const broken={cut(){throw new Error('controlled verification failure');}};
    assert.throws(()=>verifyUnionMaterial([broken],a,{cad,measure:()=>8}),e=>e.code==='GEOMETRY_INVALID'&&e.details.materialCoverage.status==='unverified');
  }finally{[joined,a,b].forEach(s=>s?.delete());}
});


test('requested exact verification fails closed without retrying or mutating sources',()=>{
  const a=cad.makeBox([0,0,0],[2,2,2]),b=cad.makeBox([1,0,0],[3,2,2]);
  const originalCut=oc.BRepAlgoAPI_Cut;
  oc.BRepAlgoAPI_Cut=class{constructor(){throw new Error('controlled exact verifier failure');}};
  try{
    assert.throws(()=>robustUnion([a,b],{measure:volume,verifyMaterial:true}),error=>{
      assert.equal(error.code,'GEOMETRY_INVALID');
      assert.equal(error.details.materialCoverage.status,'unverified');
      assert.equal(error.details.materialCoverage.stage,'before-seam-blend');
      assert.equal(error.details.attempts.length,1,'no fallback to a weaker check');
      return true;
    });
    assert.ok(Math.abs(volume(a)-8)<1e-8);assert.ok(Math.abs(volume(b)-8)<1e-8);
  }finally{oc.BRepAlgoAPI_Cut=originalCut;a.delete();b.delete();}
});


test('coverage keeps small positive residuals without changing source or candidate BReps',()=>{
  const candidate=cad.makeBox([0,0,0],[10,10,10]),source=cad.makeBox([0,0,0],[10,10,10.00001]);
  const before=[source.serialize(),candidate.serialize()];
  try{
    assert.throws(()=>verifyUnionMaterial([source],candidate,{cad,measure:volume}),error=>{
      const check=error.details.materialCoverage.checks[0];
      assert.equal(error.details.materialCoverage.status,'failed');
      assert.ok(Math.abs(check.missingVolumeMm3-.001)<1e-7);
      assert.ok(check.missingVolumeMm3>check.toleranceMm3);return true;
    });
    assert.deepEqual([source.serialize(),candidate.serialize()],before);
  }finally{source.delete();candidate.delete();}
});
