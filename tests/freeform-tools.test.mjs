import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildSpatialSpline} from '../src/modeling/freeform/spatial-spline.js';
import {buildNetworkSurface} from '../src/modeling/freeform/network-surface.js';
import {projectCurveOnFace} from '../src/modeling/freeform/project-curve.js';
import {buildSurfaceBridge} from '../src/modeling/freeform/surface-bridge.js';
import {buildSurfaceFill} from '../src/modeling/manufacturing/surface-fill.js';
import {replaceSurfacePatch} from '../src/modeling/freeform/replace-patch.js';
import {calculateSurfaceAnalysis} from '../src/modeling/freeform/surface-analysis.js';
import {CadKernel} from '../src/cad-kernel.js';

let oc;
before(async()=>{
  const wasmBinary=await fs.readFile(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url));
  oc=await init({wasmBinary});cad.setOC(oc);
});
const dispose=items=>items.forEach(item=>item.delete());
function findItem(xs,predicate){
  try{return xs.findIndex(predicate);}finally{dispose(xs);}
}
function edgeAtY(shape,y){
  return findItem(shape.edges,edge=>{
    const a=edge.startPoint,b=edge.endPoint;
    try{return [a,b].every(p=>Math.abs(p.y-y)<1e-7);}finally{dispose([a,b]);}
  });
}
const ref=(refIndex,edgeId=0)=>({refIndex,edgeId});

test('spatial spline binds a real edge endpoint and fits a reusable 3D edge',()=>{
  const source=cad.makeLine([0,0,0],[-2,-2,0]);
  const curve=buildSpatialSpline([source],{points:[{...ref(0),nearMm:[0,0,0]},[4,2,3],[8,0,4],[12,3,5]],
    closed:false,method:'fit',toleranceMm:.01},cad);
  try {
    assert.ok(curve instanceof cad.Edge);
    assert.ok(curve.freeformReport.deviationMm<=.01);
    assert.ok(curve.length>12);
  } finally {dispose([curve,source]);}
});

test('crossing curve families create and constrain a genuine saddle surface',()=>{
  const surfacePoint=(x,y)=>[x,y,.016*x*x+.009*x*y-.007*y*y];
  const quadratic=(p,m,q)=>cad.makeBezierCurve([p,m.map((value,i)=>2*value-(p[i]+q[i])/2),q]);
  const longitudinal=[0,6,12].map(y=>quadratic(surfacePoint(0,y),surfacePoint(10,y),surfacePoint(20,y)));
  const lateral=[0,9,20].map(x=>quadratic(surfacePoint(x,0),surfacePoint(x,6),surfacePoint(x,12)));
  const sources=[...longitudinal,...lateral], params={uEdges:[ref(0),ref(1),ref(2)],vEdges:[ref(3),ref(4),ref(5)]};
  let face;
  try {
    face=buildNetworkSurface(sources,params,cad);
    assert.ok(face instanceof cad.Face);
    assert.ok(face.freeformReport.uDeviationMm<.01);
    assert.ok(face.freeformReport.vDeviationMm<.01);
    assert.throws(()=>buildNetworkSurface(sources,{...params,vEdges:[ref(4),ref(3),ref(5)]},cad),{code:'FREEFORM_NETWORK'});
  } finally {dispose(face?[face,...sources]:sources);}
});

test('directional projection yields an exact edge and splits a face without changing area',()=>{
  const face=cad.makePolygon([[0,0,0],[12,0,0],[12,10,0],[0,10,0]]);
  const line=cad.makeLine([5,-2,3],[6,12,3]);
  const sources=[face,line], base={target:{refIndex:0,faceId:0},curves:[ref(1)],direction:[0,0,-1],reach:'forward'};
  let projection,split;
  try {
    projection=projectCurveOnFace(sources,{...base,output:'curves'},cad);
    assert.equal(projection.freeformReport.edgeCount,1);
    split=projectCurveOnFace(sources,{...base,output:'faces'},cad);
    assert.equal(split.freeformReport.faceCount,2);
    assert.ok(split.freeformReport.areaDeviationMm2<1e-6);
  } finally {dispose([face,line,projection,split].filter(Boolean));}
});

test('bridge fits two separate G2 edges and verifies the resulting seam',()=>{
  const a=cad.makePolygon([[0,-4,0],[12,-4,0],[12,0,0],[0,0,0]]);
  const b=cad.makePolygon([[0,8,1],[12,8,1],[12,12,1],[0,12,1]]);
  let face;
  try {
    face=buildSurfaceBridge([a,b],{a:{...ref(0,edgeAtY(a,0)),faceId:0,continuity:'G2'},
      b:{...ref(1,edgeAtY(b,8)),faceId:0,continuity:'G2'},pairing:'reverse'},cad);
    assert.ok(face instanceof cad.Face);
    assert.equal(face.freeformReport.g2EdgeCount,2);
    assert.ok(face.freeformReport.maxNormalAngleDeg<.57);
  } finally {dispose([a,b,face].filter(Boolean));}
});

test('replacement retains the walls and produces a single closed solid',()=>{
  const box=cad.makeBox([0,0,0],[12,10,2]);
  const faceId=findItem(box.faces,face=>{
    const center=face.center;
    try{return Math.abs(center.z-2)<1e-7;}finally{center.delete();}
  });
  const edges=box.edges, top=edges.flatMap((edge,i)=>{
    const a=edge.startPoint,b=edge.endPoint;
    try{return a.z===2&&b.z===2?[{kind:'G0',...ref(0,i)}]:[];}finally{dispose([a,b]);}
  });
  dispose(edges);
  let cap,solid;
  try {
    cap=buildSurfaceFill([box],{boundary:{kind:'edges',edges:top},points:[[6,5,3]],output:{kind:'surface'}},cad);
    solid=replaceSurfacePatch([box,cap],{removeFaceIds:[faceId],patches:[{refIndex:1,faceId:0}]},cad);
    assert.ok(solid instanceof cad.Solid);
    assert.equal(solid.freeformReport.retainedFaceCount,5);
    assert.ok(cad.measureVolume(solid)>cad.measureVolume(box));
    assert.throws(()=>replaceSurfacePatch([box,cap],{removeFaceIds:[(faceId+1)%6],patches:[{refIndex:1,faceId:0}]},cad),{code:'FREEFORM_TOLERANCE'});
  } finally {dispose([box,cap,solid].filter(Boolean));}
});

test('exact curvature comb reads radius and thickness map reads solid wall from trimmed face samples',async()=>{
  const arc=cad.makeThreePointArc([4,0,0],[0,4,0],[-4,0,0]);
  try {
    const comb=calculateSurfaceAnalysis(arc,{mode:'comb',edgeId:0,samples:16},cad);
    assert.equal(comb.samples.length,16);
    assert.ok(comb.samples.every(s=>Math.abs(s.curvaturePerMm-.25)<1e-9));
  } finally {arc.delete();}
  const kernel=new CadKernel(oc);
  await kernel.rebuild({version:2,imports:{},features:[{id:'wall',op:'box',params:{width:12,depth:10,height:2},refs:[]}]});
  const solid=kernel.shapes.get('wall');
  const faceId=findItem(solid.faces,face=>{
    const center=face.center;
    try{return Math.abs(center.z-2)<1e-6;}finally{center.delete();}
  });
  const samples=calculateSurfaceAnalysis(solid,{bodyId:'wall',mode:'thickness',faceIds:[faceId],grid:3,thresholdMm:2.1},cad,
    (point,direction)=>kernel.inspectThickness({bodyId:'wall',point,direction}));
  assert.equal(samples.samples.length,9);
  assert.ok(samples.samples.every(s=>Math.abs(s.thicknessMm-2)<1e-6));
  assert.equal(samples.belowThreshold,9);
});

test('a new spatial spline feeds the existing fill and locked-edge deformation tools',async()=>{
  const kernel=new CadKernel(oc);
  const features=[
    {id:'ridge',op:'spatialSpline',params:{closed:false,method:'interpolate',points:[[-8,0,.7],[0,0,2.4],[8,0,1]]},refs:[]},
    {id:'petal',op:'surfaceFill',params:{
      boundary:{kind:'points',curve:'smooth',points:[[-13,0,0],[-7,-6,0],[7,-6,0],[13,0,0],[7,6,0],[-7,6,0]]},
      guideEdges:[ref(0)],output:{kind:'surface'},
    },refs:['ridge']},
    {id:'lift',op:'surfaceSculpt',params:{faceId:0,scope:{kind:'point',pointMm:[0,0,2.4]},
      direction:{kind:'normal'},amountMm:.2,influenceMm:3},refs:['petal']},
  ];
  const {bodies}=await kernel.rebuild({version:2,imports:{},features});
  assert.ok(bodies.find(b=>b.id==='ridge')?.freeformReport);
  const sculpt=bodies.find(b=>b.id==='lift')?.surfaceSculptReport;
  assert.ok(sculpt);
  assert.ok(Math.abs(sculpt.actualDisplacementMm-.2)<.005);
  assert.ok(sculpt.lockedBoundaryEdgeCount>=1);
});
