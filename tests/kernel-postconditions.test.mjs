import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildEdgeBlend} from '../src/edge-blend.js';
import {buildCurveSweep} from '../src/curve-sweep.js';
import {buildProfileSweep} from '../src/modeling/profiles/profile-solid-features.js';
import {buildSketchProfile} from '../src/modeling/profiles/profile-model.js';
import {buildShell} from '../src/modeling/shell-solid.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
cad.setOC(oc);
const dispose=value=>{try{value?.delete?.();}catch{}};
function volume(shape){return cad.measureVolume(shape);}
function shell(thickness){
  return buildShell(cad.makeBox([0,0,0],[10,10,10]),{thickness,faceIds:[0]},oc,cad);
}
const rectSegments=[
  {type:'line',points:[[0,0,0],[30,0,0]]},
  {type:'line',points:[[30,0,0],[30,20,0]]},
  {type:'line',points:[[30,20,0],[0,20,0]]},
  {type:'line',points:[[0,20,0],[0,0,0]]},
];

test('oversized single-edge and all-edge fillets leave the 10 mm box unchanged',()=>{
  const shape=cad.makeBox([0,0,0],[10,10,10]);
  try{
    const before=shape.serialize();
    for(const params of [{radius:20,edgeIds:[0]},{radius:50,edgeIds:[0]},{radius:20,allEdges:true}])
      assert.throws(()=>buildEdgeBlend(shape,'fillet',params),error=>error.code==='GEOMETRY_INVALID');
    assert.throws(()=>buildEdgeBlend(shape,'chamfer',{distance:20,edgeIds:[0]}),error=>error.code==='GEOMETRY_INVALID');
    assert.equal(shape.serialize(),before);
    const kept=buildEdgeBlend(shape,'fillet',{radius:1,edgeIds:[0]});
    try{assert.ok(volume(kept)<1000&&volume(kept)>900);assert.equal(kept.solids.length,1);}finally{kept.solids.forEach(dispose);dispose(kept);}
  }finally{dispose(shape);}
});

test('shell thickness sign and inward feasibility keep a valid solid',()=>{
  const inward=shell(1),outward=shell(-1);
  try{
    assert.ok(volume(inward)<1000&&volume(inward)>100);
    assert.ok(volume(outward)>1);
    const grown=outward.boundingBox;
    try{const [lo,hi]=grown.bounds;assert.ok([0,1,2].some(index=>hi[index]-lo[index]>10));}
    finally{dispose(grown);}
    const inwardSolids=inward.solids,outwardSolids=outward.solids;
    try{assert.equal(inwardSolids.length,1);assert.equal(outwardSolids.length,1);}
    finally{inwardSolids.forEach(dispose);outwardSolids.forEach(dispose);}
  }finally{[inward,outward].forEach(shape=>{shape?.solids?.forEach(dispose);dispose(shape);});}
  for(const thickness of [0,5,6])assert.throws(()=>shell(thickness));
});

test('closed smooth sweeps pass and closed sharp transformed sweeps explain the fix',()=>{
  const smooth=buildCurveSweep({pathType:'arc',points:[[10,0,0],[7.071,7.071,0],[0,10,0]],radius:1},cad);
  const sharpRight=buildCurveSweep({pathType:'segments',segments:rectSegments,closed:true,radius:1,transitionMode:'right'},cad);
  const sharpRound=buildCurveSweep({pathType:'segments',segments:rectSegments,closed:true,radius:1,transitionMode:'round'},cad);
  try{
    assert.ok(volume(smooth)>1);
    assert.ok(volume(sharpRight)>100);
    assert.ok(volume(sharpRound)>100);
  }finally{[smooth,sharpRight,sharpRound].forEach(dispose);}
  assert.throws(()=>buildCurveSweep({pathType:'segments',segments:rectSegments,closed:true,radius:1,transitionMode:'transformed'},cad),/right|round|圆弧/);
  const section=buildSketchProfile({profileVersion:1,entities:[{id:'c',type:'circle',centerMm:[0,0],diameterMm:2}],loops:[{id:'o',edges:[{entityId:'c',reversed:false}]}],regions:[{id:'r',outerLoopId:'o',holeLoopIds:[]}],output:'face'},cad);
  const edges=rectSegments.map(segment=>cad.makeLine(...segment.points));
  const path=cad.assembleWire(edges);
  const curve=path.curve;let start,tangent;
  try{start=curve.startPoint.toTuple();tangent=curve.tangentAt(0).toTuple();}finally{dispose(curve);}
  const profileEdge=cad.makeCircle(1,start,tangent),profile=cad.assembleWire([profileEdge]);
  let right,round;
  try{
    assert.throws(()=>buildProfileSweep([profile,path],{transitionMode:'transformed'},cad),error=>error.code==='PROFILE_SWEEP_INVALID'&&/right|round|圆弧/.test(error.message));
    right=buildProfileSweep([profile,path],{transitionMode:'right'},cad);
    round=buildProfileSweep([profile,path],{transitionMode:'round'},cad);
    assert.ok(volume(right)>100);assert.ok(volume(round)>100);
  }finally{[round,right,profile,profileEdge,path,...edges,section].forEach(dispose);}
});

test('open thin plate accepts a valid inward wall thicker than half its height',()=>{
  const source=cad.makeBox([0,0,0],[20,20,1]),before=source.serialize(),faces=source.faces;
  let result;
  try{
    const top=faces.findIndex(face=>face.center.z>.99);
    assert.notEqual(top,-1);
    result=buildShell(source,{thickness:.75,faceIds:[top]},oc,cad);
    assert.ok(Math.abs(volume(result)-314.4375)<1e-5);
    assert.equal(source.serialize(),before);
    const check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);
    try{assert.equal(check.IsValid(),true);}finally{dispose(check);}
  }finally{faces.forEach(dispose);dispose(result);dispose(source);}
});

test('valid explicit chamfer may remove more than 65 percent of a body',()=>{
  const source=cad.makeBox([0,0,0],[10,10,10]),before=source.serialize();
  let result;
  try{
    result=buildEdgeBlend(source,'chamfer',{distance:4.5,allEdges:true});
    assert.ok(Math.abs(volume(result)-271)<1e-5);
    assert.equal(source.serialize(),before);
    const check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);
    try{assert.equal(check.IsValid(),true);}finally{dispose(check);}
  }finally{dispose(result);dispose(source);}
});

test('closed tangent quarter-arcs sweep with the explicitly requested transformed transition',()=>{
  const point=angle=>[10*Math.cos(angle),10*Math.sin(angle),0];
  const segments=Array.from({length:4},(_,i)=>({type:'arc',points:[point(i*Math.PI/2),point((i+.5)*Math.PI/2),point((i+1)*Math.PI/2)]}));
  const result=buildCurveSweep({pathType:'segments',segments,closed:true,radius:1,transitionMode:'transformed'},cad);
  try{assert.ok(Math.abs(volume(result)-20*Math.PI*Math.PI)<.01);}finally{dispose(result);}
});
