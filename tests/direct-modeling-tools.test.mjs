import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {validateSchema} from '../src/contracts/operation-schema.js';
import {directModelingOperations,directModelingStrictDefinitions,directModelingExamples,directModelingFields} from '../src/modeling/manufacturing/direct-modeling-contracts.js';
import {buildOffsetSolid,buildOffsetSurface,buildDraftByPlane} from '../src/modeling/manufacturing/direct-modeling-tools.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=shape=>{try{shape?.delete?.();}catch{}};
const close=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=Math.max(tolerance,Math.abs(expected)*1e-8),`${actual} != ${expected}`);
function bounds(shape){const box=shape.boundingBox;try{return box.bounds;}finally{dispose(box);}}
function center(face){const point=face.center;try{return point.toTuple();}finally{dispose(point);}}
function faceIds(shape,predicate){const faces=shape.faces;try{return faces.map((face,index)=>predicate(face)?index:null).filter(index=>index!==null);}finally{faces.forEach(dispose);}}
function exact(shape,solidCount){
  const checker=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false),solids=shape.solids,areaProps=new oc.GProp_GProps(),volumeProps=new oc.GProp_GProps();
  try{
    assert.equal(checker.IsValid(),true);assert.equal(solids.length,solidCount);
    const areaError=oc.BRepGProp.SurfaceProperties(shape.wrapped,areaProps,1e-9,false);assert.ok(Number.isFinite(areaError)&&areaError>=0&&areaError<1e-5);assert.ok(areaProps.Mass()>0);
    if(solidCount){const volumeError=oc.BRepGProp.VolumePropertiesGK(shape.wrapped,volumeProps,1e-9,true,true,false,false,false);assert.ok(Number.isFinite(volumeError)&&volumeError>=0&&volumeError<1e-5);assert.ok(volumeProps.Mass()>0);}
    return {area:areaProps.Mass(),volume:solidCount?volumeProps.Mass():null};
  }finally{[checker,...solids,areaProps,volumeProps].forEach(dispose);}
}
const draft=(faceIds,angleDeg=5,extra={})=>({faceIds,neutralPoint:[0,0,0],neutralNormal:[0,0,1],pullDirection:[0,0,1],angleDeg,...extra});

test('three direct tools share executable strict schemas; no unsupported shell thickening is advertised',()=>{
  assert.deepEqual(Object.keys(directModelingOperations),['offsetSolid','offsetSurface','draftByPlane']);
  for(const [id,definition] of Object.entries(directModelingOperations)){
    assert.equal(definition.refs,1);validateSchema(definition.paramsSchema,directModelingExamples[id]);
    assert.deepEqual(directModelingStrictDefinitions[id].paramsSchema,definition.paramsSchema);
    for(const field of directModelingFields[id])assert.ok(Object.hasOwn(definition.paramsSchema.properties,field[0]));
    assert.throws(()=>validateSchema(definition.paramsSchema,{...directModelingExamples[id],unknown:true}),{code:'PARAM_SCHEMA_INVALID'});
  }
  assert.equal(directModelingStrictDefinitions.offsetSurface.preservesInputs,true);
  assert.equal(directModelingStrictDefinitions.offsetSolid.preservesInputs,false);
  assert.throws(()=>validateSchema(directModelingOperations.offsetSolid.paramsSchema,{distanceMm:0,join:'round'}),{code:'PARAM_SCHEMA_INVALID'});
  assert.throws(()=>validateSchema(directModelingOperations.draftByPlane.paramsSchema,draft([0,0])),{code:'PARAM_SCHEMA_INVALID'});
});

for(const [distance,volume,min,max] of [[1,960,[-1,-1,-1],[11,9,7]],[-.5,315,[.5,.5,.5],[9.5,7.5,5.5]]]){
  test(`box exact intersection offset ${distance} changes each boundary, preserves source`,()=>{
    const source=cad.makeBox([0,0,0],[10,8,6]),snapshot=source.serialize();let result;
    try{
      result=buildOffsetSolid(source,{distanceMm:distance,join:'intersection'},oc,cad);
      close(exact(result,1).volume,volume);const actual=bounds(result);actual[0].forEach((value,i)=>close(value,min[i]));actual[1].forEach((value,i)=>close(value,max[i]));
      assert.equal(source.serialize(),snapshot);close(exact(source,1).volume,480);
    }finally{[result,source].forEach(dispose);}
  });
}

test('round solid offset agrees with the exact convex-box parallel-body formula',()=>{
  const source=cad.makeBox([0,0,0],[10,8,6]);let result;
  try{result=buildOffsetSolid(source,{distanceMm:1,join:'round'},oc,cad);const measures=exact(result,1);close(measures.volume,480+376+Math.PI*24+4*Math.PI/3);close(measures.area,376+2*Math.PI*24+4*Math.PI);}
  finally{[result,source].forEach(dispose);}
});

test('cylinder solid offset changes radius and both caps, not uniform scale',()=>{
  const source=cad.makeCylinder(5,10);let result;
  try{result=buildOffsetSolid(source,{distanceMm:1,join:'intersection'},oc,cad);close(exact(result,1).volume,Math.PI*6**2*12);const actual=bounds(result);close(actual[0][2],-1);close(actual[1][2],11);close(actual[1][0],6);close(cad.measureVolume(source),Math.PI*5**2*10);}
  finally{[result,source].forEach(dispose);}
});

test('sphere solid offset is an exact radius increment',()=>{
  const source=cad.makeSphere(5);let result;
  try{result=buildOffsetSolid(source,{distanceMm:1,join:'intersection'},oc,cad);const measures=exact(result,1);close(measures.volume,4*Math.PI*6**3/3);close(measures.area,4*Math.PI*6**2);}
  finally{[result,source].forEach(dispose);}
});

test('torus solid offset and surface offset preserve major radius and increase tube radius',()=>{
  const maker=new oc.BRepPrimAPI_MakeTorus(10,2),source=cad.cast(maker.Shape());let solid,surface;
  try{
    solid=buildOffsetSolid(source,{distanceMm:1,join:'intersection'},oc,cad);close(exact(solid,1).volume,2*Math.PI**2*10*3**2);
    surface=buildOffsetSurface(source,{faceId:0,distanceMm:1},oc,cad);close(exact(surface,0).area,4*Math.PI**2*10*3);close(bounds(surface)[1][0],13);close(bounds(source)[1][0],12);
  }finally{[solid,surface,source,maker].forEach(dispose);}
});

test('signed planar face offset follows the oriented face normal and preserves the source',()=>{
  const source=cad.makeBox([0,0,0],[10,8,6]),snapshot=source.serialize(),ids=faceIds(source,face=>Math.abs(center(face)[2])<1e-7);assert.equal(ids.length,1);let result;
  try{
    result=buildOffsetSurface(source,{faceId:ids[0],distanceMm:2},oc,cad);close(exact(result,0).area,80);close(center(result)[2],-2);assert.equal(source.serialize(),snapshot);close(cad.measureVolume(source),480);
  }finally{[result,source].forEach(dispose);}
});

test('planar face offset retains inner holes and exact area',()=>{
  const outer=cad.makeBox([0,0,0],[10,8,6]),tool=cad.makeCylinder(1,8,[5,4,-1]),source=outer.cut(tool),ids=faceIds(source,face=>face.geomType==='PLANE'&&Math.abs(center(face)[2]-6)<1e-7);let result;
  try{result=buildOffsetSurface(source,{faceId:ids[0],distanceMm:1},oc,cad);close(exact(result,0).area,80-Math.PI);const wires=result.wires;try{assert.equal(wires.length,2);}finally{wires.forEach(dispose);}close(center(result)[2],7);}
  finally{[result,source,tool,outer].forEach(dispose);}
});

test('cylinder face offset changes exact lateral area without thickening or changing height',()=>{
  const source=cad.makeCylinder(5,10),ids=faceIds(source,face=>face.geomType==='CYLINDRE');let result;
  try{result=buildOffsetSurface(source,{faceId:ids[0],distanceMm:1},oc,cad);close(exact(result,0).area,2*Math.PI*6*10);close(bounds(result)[0][2],0);close(bounds(result)[1][2],10);}
  finally{[result,source].forEach(dispose);}
});

for(const angle of [5,-5]){
  test(`cylindrical side draft ${angle} matches a frustum and keeps its neutral radius`,()=>{
    const source=cad.makeCylinder(5,10),snapshot=source.serialize(),ids=faceIds(source,face=>face.geomType==='CYLINDRE');let result;
    try{
      result=buildDraftByPlane(source,draft(ids,angle,{pullDirection:[0,0,4],neutralNormal:[0,0,2]}),oc,cad);
      const top=5-10*Math.tan(angle*Math.PI/180);close(exact(result,1).volume,Math.PI*10/3*(25+5*top+top**2));
      const faces=result.faces;try{const bottom=faces.find(face=>face.geomType==='PLANE'&&Math.abs(center(face)[2])<1e-7);close(cad.measureArea(bottom),25*Math.PI);}finally{faces.forEach(dispose);}
      assert.equal(source.serialize(),snapshot);close(exact(source,1).volume,250*Math.PI);
    }finally{[result,source].forEach(dispose);}
  });
}

test('four planar side drafts match integrated prism volume without the legacy six-face restriction',()=>{
  const source=cad.makeBox([0,0,0],[10,8,6]),ids=faceIds(source,face=>Math.abs(center(face)[2]-3)<1e-7);let result;
  try{result=buildDraftByPlane(source,draft(ids),oc,cad);const tangent=Math.tan(5*Math.PI/180);close(exact(result,1).volume,480-tangent*18*36+4/3*tangent**2*216);}
  finally{[result,source].forEach(dispose);}
});

test('existing cone uses the specified target draft angle, not an incremental angle',()=>{
  const face=cad.makePolygon([[0,0,0],[5,0,0],[3,0,10],[0,0,10]]),source=cad.revolution(face,[0,0,0],[0,0,1],360),snapshot=source.serialize(),ids=faceIds(source,face=>face.geomType==='CONE');let result,offset,offsetFace;
  try{
    result=buildDraftByPlane(source,draft(ids),oc,cad);const top=5-10*Math.tan(5*Math.PI/180);close(exact(result,1).volume,Math.PI*10/3*(25+5*top+top**2));assert.equal(source.serialize(),snapshot);
    offset=buildOffsetSolid(source,{distanceMm:1,join:'intersection'},oc,cad);assert.ok(exact(offset,1).volume>cad.measureVolume(source));
    offsetFace=buildOffsetSurface(source,{faceId:ids[0],distanceMm:1},oc,cad);assert.ok(exact(offsetFace,0).area>0);
  }finally{[result,offset,offsetFace,source,face].forEach(dispose);}
});

test('tangent face propagation requires complete explicit selection, with failure preserving exact source',()=>{
  const drawing=cad.draw([0,0]).lineTo([5,0]).lineTo([10,0]).lineTo([10,8]).lineTo([0,8]).close(),sketch=drawing.sketchOnPlane('XY'),source=sketch.extrude(6),snapshot=source.serialize(),ids=faceIds(source,face=>{const c=center(face);return Math.abs(c[1])<1e-7&&Math.abs(c[2]-3)<1e-7;});let result;
  try{
    assert.equal(ids.length,2);assert.throws(()=>buildDraftByPlane(source,draft([ids[0]]),oc,cad),{code:'SELECTION_CONFLICT'});assert.equal(source.serialize(),snapshot);close(exact(source,1).volume,480);
    result=buildDraftByPlane(source,draft(ids),oc,cad);close(exact(result,1).volume,480-10*Math.tan(5*Math.PI/180)*36/2);assert.equal(source.serialize(),snapshot);
  }finally{[result,source,sketch,drawing].forEach(dispose);}
});

test('collapsed offsets, invalid topology and ambiguous draft direction fail without changing source',()=>{
  const source=cad.makeBox([0,0,0],[10,8,6]),snapshot=source.serialize();
  try{
    assert.throws(()=>buildOffsetSolid(source,{distanceMm:-4,join:'intersection'},oc,cad),{code:'GEOMETRY_INVALID'});
    assert.throws(()=>buildOffsetSurface(source,{faceId:999,distanceMm:1},oc,cad),{code:'STALE_REFERENCE'});
    assert.throws(()=>buildDraftByPlane(source,draft([999]),oc,cad),{code:'STALE_REFERENCE'});
    assert.throws(()=>buildDraftByPlane(source,draft([0],5,{pullDirection:[0,0,0]}),oc,cad),{code:'PARAM_RANGE_INVALID'});
    assert.throws(()=>buildDraftByPlane(source,draft([0],5,{neutralNormal:[1,0,0]}),oc,cad),{code:'PARAM_RANGE_INVALID'});
    assert.throws(()=>buildDraftByPlane(source,draft([0],45),oc,cad),{code:'PARAM_RANGE_INVALID'});
    assert.equal(source.serialize(),snapshot);close(exact(source,1).volume,480);
  }finally{dispose(source);}
});

test('a surface source cannot silently become a solid-offset or solid-draft target',()=>{
  const source=cad.makeBox([0,0,0],[10,8,6]),faces=source.faces,surface=faces[0].clone(),snapshot=surface.serialize();
  try{
    assert.throws(()=>buildOffsetSolid(surface,{distanceMm:1,join:'intersection'},oc,cad),{code:'CAPABILITY_UNAVAILABLE'});
    assert.throws(()=>buildDraftByPlane(surface,draft([0]),oc,cad),{code:'CAPABILITY_UNAVAILABLE'});
    assert.equal(surface.serialize(),snapshot);
  }finally{[surface,...faces,source].forEach(dispose);}
});

test('analytic curvature guards reject zero-radius rebound and spindle tori despite BRepCheck validity',()=>{
  const cylinder=cad.makeCylinder(5,10),sphere=cad.makeSphere(5),maker=new oc.BRepPrimAPI_MakeTorus(10,2),torus=cad.cast(maker.Shape());
  try{
    for(const [source,distance] of [[cylinder,-6],[sphere,-6],[torus,-3],[torus,9]]){
      const snapshot=source.serialize();
      assert.throws(()=>buildOffsetSurface(source,{faceId:0,distanceMm:distance},oc,cad),{code:'GEOMETRY_INVALID'});
      assert.throws(()=>buildOffsetSolid(source,{distanceMm:distance,join:'intersection'},oc,cad),{code:'GEOMETRY_INVALID'});
      assert.equal(source.serialize(),snapshot);exact(source,1);
    }
  }finally{[cylinder,sphere,torus,maker].forEach(dispose);}
});
