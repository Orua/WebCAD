import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';
import {buildSurfaceFill} from '../src/modeling/manufacturing/surface-fill.js';
import {surfaceFillExample} from '../src/modeling/manufacturing/surface-fill-contract.js';

let oc;
before(async () => {
  const wasmBinary = await fs.readFile(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url));
  oc = await init({wasmBinary});
  cad.setOC(oc);
});

function expectValid(shape,kind) {
  const check = new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false);
  try {
    assert.ok(check.IsValid());
    assert.ok(shape instanceof kind);
  } finally {check.delete();}
}

test('the document worker keeps a smooth XYZ outline and makes a new solid',async () => {
  const kernel = new CadKernel(oc);
  const document = {version:2, imports:{}, features:[
    {id:'shield',op:'surfaceFill',params:surfaceFillExample,refs:[]},
  ]};
  const {bodies} = await kernel.rebuild(document);
  assert.equal(bodies.length,1);
  assert.equal(bodies[0].solidCount,1);
  const solid = kernel.shapes.get('shield');
  expectValid(solid,cad.Solid);
  assert.ok(cad.measureVolume(solid)>0);
  const report = bodies[0].surfaceFillReport;
  assert.ok(report.boundaryDeviationMm<0.001);
  assert.ok(report.pointDeviationMm<0.01);
  assert.equal(report.thicknessMm,-1.2);
});

test('an exact guide and a selected edge endpoint both constrain the patch',() => {
  const ridge = cad.makeThreePointArc([-10,0,1],[0,0,3],[10,0,1]);
  const vertex = {refIndex:0,edgeId:0,nearMm:[-10,0,1]};
  const outline = [[-15,0,0],[-8,-6,0],[7,-6,0],[15,0,0],[8,6,0],[-7,6,0]];
  const params = {boundary:{kind:'points',curve:'smooth',points:outline},points:[vertex],
    guideEdges:[{refIndex:0,edgeId:0}],output:{kind:'surface'}};
  const face = buildSurfaceFill([ridge],params,cad);
  try {
    expectValid(face,cad.Face);
    assert.equal(face.surfaceFillReport.guideCount,1);
    assert.ok(face.surfaceFillReport.guideDeviationMm<0.01);
    assert.ok(face.surfaceFillReport.pointDeviationMm<0.01);
    assert.throws(()=>buildSurfaceFill([ridge],{...params,points:[{...vertex,nearMm:[1,1,1]}]},cad),
      {code:'SURFACE_FILL_REFERENCE'});
  } finally {face.delete();ridge.delete();}
});

test('a selected G2 seam matches actual surface derivatives and an open boundary is rejected',() => {
  const a=[-12,-7,0], b=[12,-7,0], c=[15,0,0], d=[9,8,0], e=[-6,8,0], f=[-14,1,0];
  const support = cad.makePolygon([b,a,[-12,-13,0],[12,-13,0]]);
  const edges = support.edges;
  const edgeId = edges.findIndex(edge=>Math.abs(edge.length-24)<1e-6);
  edges.forEach(edge=>edge.delete());
  const rim = [[b,c],[c,d],[d,e],[e,f],[f,a]].map(([from,to])=>cad.makeLine(from,to));
  const seam = {kind:'G2',refIndex:0,edgeId,supportFaceId:0};
  const others = rim.map((_,i)=>({kind:'G0',refIndex:i+1,edgeId:0}));
  const params = {boundary:{kind:'edges',edges:[others[2],seam,others[4],others[0],others[3],others[1]]},
    points:[[0,2,2.1]],output:{kind:'thickened',thicknessMm:-1}};
  const sources = [support,...rim], solid = buildSurfaceFill(sources,params,cad);
  try {
    expectValid(solid,cad.Solid);
    assert.equal(solid.surfaceFillReport.g2EdgeCount,1);
    assert.ok(solid.surfaceFillReport.maxNormalAngleDeg<0.1);
    assert.ok(solid.surfaceFillReport.curvatureErrorPerMm<0.01);
    assert.throws(()=>buildSurfaceFill(sources.slice(0,-1),{...params,
      boundary:{kind:'edges',edges:[seam,...others.slice(0,-1)]}},cad),{code:'SURFACE_FILL_BOUNDARY'});
    assert.throws(()=>buildSurfaceFill(sources,{...params,
      boundary:{kind:'edges',edges:[{...seam,supportFaceId:2},...others]}},cad),{code:'SURFACE_FILL_SUPPORT'});
  } finally {solid.delete();sources.forEach(shape=>shape.delete());}
});
