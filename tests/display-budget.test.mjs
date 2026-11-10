import test from 'node:test';
import assert from 'node:assert/strict';
import {RENDER_QUALITIES} from '../src/render-quality.js';
import {DISPLAY_BUDGET,displayComplexity,displayRefinementError,isWasmMemoryError,meshFacesProgressively} from '../src/modeling/io/display-budget.js';
import {meshIntegrity} from '../src/modeling/io/mesh-integrity.js';
import {bodyWarnings} from '../src/body-state.js';
import {CadKernel} from '../src/cad-kernel.js';

function facesWithPoles(counts){
  return counts.map((n,i)=>({geomType:'BSPLINE_SURFACE',wrapped:{id:i},hashCode:i}));
}
function ocForPoles(counts){
  let i=0;
  return {BRepAdaptor_Surface:class{
    constructor(){this.n=counts[i++]??0;}
    BSpline(){const n=this.n;return {NbUPoles:()=>n,NbVPoles:()=>1,delete(){}};}
    Bezier(){return this.BSpline();}
    delete(){}
  }};
}
function complexity(counts,quality,extra={}){
  return displayComplexity({},facesWithPoles(counts),ocForPoles(counts),{requested:RENDER_QUALITIES[quality],faceThreshold:200,...extra});
}
function planar(hashCode,triangles){
  const vertices=new Float32Array(triangles.length?9:0);
  if(triangles.length)vertices.set([0,0,hashCode,1,0,hashCode,0,1,hashCode]);
  return {hashCode,geomType:'PLANE',mesh:()=>({vertices,normals:new Float32Array(vertices.length),triangles})};
}

test('already-adaptive 5000-pole faces keep budgeted standard tolerance when fine or ultra is requested',()=>{
  const counts=[2500,2500];
  const fine=complexity(counts,'fine');
  assert.equal(fine.totalPoles,5000);
  assert.equal(fine.adaptive,true);
  assert.equal(fine.heavy,false);
  assert.equal(fine.unsafeRequestedTolerance,true);
  assert.notEqual(fine.tolerance,RENDER_QUALITIES.fine.tolerance);
  assert.notEqual(fine.tolerance,0.025);
  assert.equal(fine.tolerance,RENDER_QUALITIES.standard.tolerance);
  assert.ok(fine.tolerance>=RENDER_QUALITIES.standard.tolerance);
  const ultra=complexity(counts,'ultra');
  assert.equal(ultra.unsafeRequestedTolerance,true);
  assert.notEqual(ultra.tolerance,RENDER_QUALITIES.ultra.tolerance);
  assert.notEqual(ultra.tolerance,0.008);
  assert.equal(ultra.tolerance,RENDER_QUALITIES.standard.tolerance);
});

test('standard and draft display tolerances are unchanged for the same 5000-pole fixture',()=>{
  const standard=complexity([5000],'standard');
  assert.equal(standard.adaptive,true);
  assert.equal(standard.heavy,false);
  assert.equal(standard.unsafeRequestedTolerance,false);
  assert.equal(standard.tolerance,RENDER_QUALITIES.standard.tolerance);
  const draft=complexity([5000],'draft');
  assert.equal(draft.unsafeRequestedTolerance,false);
  assert.equal(draft.tolerance,RENDER_QUALITIES.draft.tolerance);
});

test('small parts still receive the requested fine tolerance',()=>{
  const fine=complexity([80,80],'fine');
  assert.equal(fine.adaptive,false);
  assert.equal(fine.heavy,false);
  assert.equal(fine.unsafeRequestedTolerance,false);
  assert.equal(fine.tolerance,RENDER_QUALITIES.fine.tolerance);
});

test('truly heavy faces still use the diagonal budget rather than a silent skip of validation',()=>{
  const shape={boundingBox:{bounds:[[0,0,0],[128,0,0]],delete(){}}};
  const faces=facesWithPoles([DISPLAY_BUDGET.heavyFacePoles]);
  const result=displayComplexity(shape,faces,ocForPoles([DISPLAY_BUDGET.heavyFacePoles]),{requested:RENDER_QUALITIES.fine});
  assert.equal(result.heavy,true);
  assert.equal(result.unsafeRequestedTolerance,false);
  assert.ok(result.tolerance>=RENDER_QUALITIES.fine.tolerance);
  assert.equal(result.tolerance,Math.max(RENDER_QUALITIES.fine.tolerance,128*DISPLAY_BUDGET.heavyDiagonalFraction));
});

test('empty triangulation on one face keeps the others and surfaces DISPLAY_INCOMPLETE',()=>{
  const faces=[planar(0,new Uint32Array([0,1,2])),planar(1,new Uint32Array()),planar(2,new Uint32Array([0,1,2]))];
  faces[1].mesh=()=>({vertices:new Float32Array(),normals:new Float32Array(),triangles:new Uint32Array()});
  const mesh=meshFacesProgressively(faces,{tolerance:0.08,angularTolerance:0.15},null,null);
  assert.equal(mesh.faceGroups[0].count,3);
  assert.equal(mesh.faceGroups[1].count,0);
  assert.equal(mesh.faceGroups[2].count,3);
  assert.equal(mesh.triangles.length,6);
  const report=meshIntegrity(mesh.vertices,mesh.triangles,{faceCount:3,faceGroups:mesh.faceGroups});
  assert.equal(report.status,'incomplete');
  assert.deepEqual(report.untriangulatedFaceIds,[1]);
  const warnings=bodyWarnings([{id:'body',displayReport:report}]);
  assert.equal(warnings[0].code,'DISPLAY_INCOMPLETE');
  assert.deepEqual(warnings[0].faceIds,[1]);
});

test('a non-memory mesh failure on one face is isolated; wasm memory errors become DISPLAY_REFINEMENT_FAILED',()=>{
  const ok=planar(0,new Uint32Array([0,1,2]));
  const soft={hashCode:1,geomType:'PLANE',mesh:()=>{throw new Error('triangulation failed');}};
  const mesh=meshFacesProgressively([ok,soft,planar(2,new Uint32Array([0,1,2]))],{tolerance:0.08},null,null);
  assert.equal(mesh.faceGroups[0].count,3);
  assert.equal(mesh.faceGroups[1].count,0);
  assert.equal(mesh.faceGroups[2].count,3);
  const report=meshIntegrity(mesh.vertices,mesh.triangles,{faceCount:3,faceGroups:mesh.faceGroups});
  assert.deepEqual(report.untriangulatedFaceIds,[1]);
  const boom={hashCode:1,geomType:'PLANE',mesh:()=>{throw Object.assign(new Error('memory access out of bounds'),{name:'RuntimeError'});}};
  assert.throws(()=>meshFacesProgressively([ok,boom],{tolerance:0.025},null,null),{code:'DISPLAY_REFINEMENT_FAILED'});
  assert.equal(isWasmMemoryError(Object.assign(new Error('memory access out of bounds'),{name:'RuntimeError'})),true);
  assert.equal(displayRefinementError(new Error('memory access out of bounds')).code,'DISPLAY_REFINEMENT_FAILED');
  const preserved=Object.assign(new Error('limit'),{code:'RESOURCE_LIMIT'});
  assert.equal(displayRefinementError(preserved),preserved);
});

test('CadKernel.remesh maps wasm memory errors, rolls back quality and renderCache, and does not throw uncaught',()=>{
  const kernel=new CadKernel({});
  const previousCache=new Map([['box',{body:{id:'box',renderVersion:'1'}}]]);
  kernel.active=new Map([['box',{id:'box',name:'box'}]]);
  kernel.shapes=new Map([['box',{}]]);
  kernel.renderCache=previousCache;
  kernel.quality='standard';
  kernel.describe=()=>{throw Object.assign(new Error('memory access out of bounds'),{name:'RuntimeError'});};
  assert.throws(()=>kernel.remesh('fine'),error=>{
    assert.equal(error.code,'DISPLAY_REFINEMENT_FAILED');
    assert.match(error.message,/memory access out of bounds/);
    return true;
  });
  assert.equal(kernel.quality,'standard');
  assert.equal(kernel.renderCache,previousCache);
  assert.equal(kernel.renderCache.get('box').body.renderVersion,'1');
  assert.throws(()=>kernel.remesh('invalid'),{code:'PARAM_SCHEMA_INVALID'});
  assert.equal(kernel.quality,'standard');
});
