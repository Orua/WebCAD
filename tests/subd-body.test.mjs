import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import { makeCatmullClarkSampler, refineCatmullClark, sampleCatmullClarkLimit, validateSubdCage } from '../src/subd-catmark.js';
import { buildSubdBRep } from '../src/subd-brep.js';
import { diagnoseSurface } from '../src/surface-repair.js';

const oc = await init({ wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)) });
cad.setOC(oc);
const baseVertices = [[-10,-10,-10],[10,-10,-10],[10,10,-10],[-10,10,-10],[-10,-10,10],[10,-10,10],[10,10,10],[-10,10,10]];
const baseFaces = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
const faceCenters = baseFaces.map(face => face.reduce((sum,i) => sum.map((x,k) => x + baseVertices[i][k] / 4), [0,0,0]));
const cubeVertices = [...baseVertices, ...faceCenters];
const cubeEdges = new Map();
for (const face of baseFaces) for(let i=0;i<4;i++) {
  const a=face[i],b=face[(i+1)%4],key=[Math.min(a,b),Math.max(a,b)].join(':');
  const list=cubeEdges.get(key)??[];list.push([a,b]);cubeEdges.set(key,list);
}
const cubeFaces = [...cubeEdges.values()].map(([[a,b]]) => {
  const adjacent=baseFaces.map((face,i) => face.includes(a)&&face.includes(b)?i:-1).filter(i=>i>=0);
  assert.equal(adjacent.length,2);
  const c1=8+adjacent[0],c2=8+adjacent[1];
  let q=[a,c1,b,c2];
  const p=q.map(i=>cubeVertices[i]), u=p[1].map((x,k)=>x-p[0][k]),v=p[2].map((x,k)=>x-p[0][k]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],center=p.reduce((sum,x)=>sum.map((y,k)=>y+x[k]/4),[0,0,0]);
  if(n[0]*center[0]+n[1]*center[1]+n[2]*center[2]<0) q=[a,c2,b,c1];
  return q;
});
const cube = { vertices: cubeVertices, faces: cubeFaces };

// Topology is a closed 12-quad control cage and each CC step produces four quads per input face.
const coarse = refineCatmullClark(cube, 1);
assert.equal(cube.faces.length, 12, 'the cube control net contains twelve quads around its twelve edges');
assert.equal(coarse.faces.length, 48);
assert.equal(coarse.vertices.length, 50);
assert.throws(() => validateSubdCage({ ...cube, faces: cube.faces.slice(1) }), /closed/);
assert.throws(() => validateSubdCage({ ...cube, creases: [{ edge: [0,1], sharpness: 1.01 }] }), /\[0,1\]/);
assert.throws(() => validateSubdCage({ ...cube, faces: cube.faces.map((face,index) => index === 0 ? [...face].reverse() : face) }), /consistently oriented/);

// A full sharpness-1 edge remains its straight crease curve in the first limit sample band.
const withCrease = { ...cube, creases: [...new Map(cube.faces.flatMap(face => face.map((a,i) => {
  const b=face[(i+1)%4]; return [[Math.min(a,b),Math.max(a,b)].join(':'),{edge:[a,b],sharpness:1}];
}))).values()] };
const sharpSampler = makeCatmullClarkSampler(withCrease, 5);
const p0 = sharpSampler.sample(0, 0, 0), p1 = sharpSampler.sample(0, 1, 0), pm = sharpSampler.sample(0, .5, 0);
assert.ok(Math.hypot(...pm.map((x,i) => x - (p0[i] + p1[i]) / 2)) < 1e-7, 'sharpness 1 keeps the selected control edge straight');
const smoothMid = makeCatmullClarkSampler(cube, 5).sample(0, .5, 0);
assert.ok(Math.hypot(...pm.map((x,i) => x - smoothMid[i])) > .01, 'crease weight changes the limit curve');
const fractionalMid = makeCatmullClarkSampler({ ...cube, creases: [{ edge: [cube.faces[0][0],cube.faces[0][1]], sharpness: .5 }] }, 5).sample(0,.5,0);
assert.ok(Math.hypot(...fractionalMid.map((x,i) => x - smoothMid[i])) > 1e-4, 'fractional crease weight is applied');
assert.ok(sampleCatmullClarkLimit(cube, 0, .5, .5, 4).every(Number.isFinite));

const edgePoint = (sampler, faceIndex, edgeIndex, t) => {
  const uv = [[t,0],[1,t],[1-t,1],[0,1-t]][edgeIndex];
  return sampler.sample(faceIndex,uv[0],uv[1]);
};
const faceNormal = (sampler, faceIndex, u, v) => {
  const h=1e-4, um=Math.max(0,u-h),up=Math.min(1,u+h),vm=Math.max(0,v-h),vp=Math.min(1,v+h);
  const a=sampler.sample(faceIndex,um,v),b=sampler.sample(faceIndex,up,v),c=sampler.sample(faceIndex,u,vm),d=sampler.sample(faceIndex,u,vp);
  const du=b.map((x,i)=>(x-a[i])/(up-um)),dv=d.map((x,i)=>(x-c[i])/(vp-vm));
  const n=[du[1]*dv[2]-du[2]*dv[1],du[2]*dv[0]-du[0]*dv[2],du[0]*dv[1]-du[1]*dv[0]],length=Math.hypot(...n);
  return n.map(x=>x/length);
};
const edgeNormalDot = (sampler, faceIndex, edgeIndex, neighborIndex, neighborEdge) => {
  const inside=[[.5,.01],[.99,.5],[.5,.99],[.01,.5]][edgeIndex];
  const other=[[.5,.01],[.99,.5],[.5,.99],[.01,.5]][neighborEdge];
  const a=faceNormal(sampler,faceIndex,...inside),b=faceNormal(sampler,neighborIndex,...other);
  return a.reduce((sum,x,i)=>sum+x*b[i],0);
};
for (const testCage of [cube,withCrease]) {
  const sampler = makeCatmullClarkSampler(testCage,4);
  for (let fi=0;fi<testCage.faces.length;fi++) for(let ei=0;ei<4;ei++) {
    const face=testCage.faces[fi], a=face[ei],b=face[(ei+1)%4];
    const adjacent=testCage.faces.findIndex((other,index) => index!==fi && other.some((v,j) => v===b && other[(j+1)%4]===a));
    assert.notEqual(adjacent,-1);
    const other=testCage.faces[adjacent], otherEdge=other.findIndex((v,j) => v===b && other[(j+1)%4]===a);
    for(const t of [0,.25,.5,.75,1]) {
      const p=edgePoint(sampler,fi,ei,t),q=edgePoint(sampler,adjacent,otherEdge,1-t);
      assert.ok(Math.hypot(...p.map((x,k)=>x-q[k])) < 1e-8, `shared limit boundary ${fi}:${ei} must match its neighbor`);
    }
  }
}
const creaseAdjacent=withCrease.faces.findIndex((face,index) => index!==0 && face.some((v,j) => v===withCrease.faces[0][1] && face[(j+1)%4]===withCrease.faces[0][0]));
const creaseAdjacentEdge=withCrease.faces[creaseAdjacent].findIndex((v,j) => v===withCrease.faces[0][1] && withCrease.faces[creaseAdjacent][(j+1)%4]===withCrease.faces[0][0]);
const smoothDot=edgeNormalDot(makeCatmullClarkSampler(cube,5),0,0,creaseAdjacent,creaseAdjacentEdge);
const sharpDot=edgeNormalDot(sharpSampler,0,0,creaseAdjacent,creaseAdjacentEdge);
assert.ok(sharpDot < smoothDot - .05, `sharpness 1 must preserve a normal break (smooth=${smoothDot}, sharp=${sharpDot})`);

// Baseline uses level 4; the single mechanism alternative increases the custom evaluator depth to level 5.
const reports = [];
for (const [cage, sampleDepth, label] of [[cube,4,'baseline depth 4'],[cube,5,'mechanism alternative depth 5'],[withCrease,4,'weight-1 crease']]) {
  const solid = buildSubdBRep({ cage, sampleDepth, fitGrid: 9, referenceGrid: 20, fittingTolerance: .03, sewingTolerance: .05 }, cad);
  try {
    const checker = new oc.BRepCheck_Analyzer(solid.wrapped, true, false, false);
    try { assert.ok(checker.IsValid(), 'BRepCheck_Analyzer must accept the SubD solid'); } finally { checker.delete(); }
    assert.equal(solid.solids.length, 1);
    assert.equal(solid.subdApproximation.patchCount, 12);
    assert.equal(solid.subdApproximation.representation, 'sewn-occt-bspline-faces');
    assert.ok(solid.subdApproximation.volumeRelativeError < .02);
    assert.ok(solid.subdApproximation.area > 0 && solid.subdApproximation.referenceArea > 0);
    assert.ok(solid.subdApproximation.maxLimitSampleError >= 0);
    const sewing = diagnoseSurface(solid, cad);
    assert.equal(sewing.freeEdges, 0, 'sewn BRep must be watertight');
    assert.equal(sewing.multipleEdges, 0, 'sewn BRep must be two-manifold');
    reports.push({ case: label, ...solid.subdApproximation, freeEdges: sewing.freeEdges, multipleEdges: sewing.multipleEdges });
    const tool = cad.makeSphere(2, [0, 0, 0]);
    try {
      const fused = solid.fuse(tool);
    try { assert.equal(fused.solids.length, 1); assert.ok(cad.measureVolume(fused) >= cad.measureVolume(solid)); }
      finally { fused.delete(); }
    } finally { tool.delete(); }
  } finally { solid.delete(); }
}
assert.ok(reports[1].maxLimitSampleError < reports[0].maxLimitSampleError, 'deeper CC refinement must reduce the limit sample error');
reports.forEach(report => console.log(JSON.stringify(report)));
console.log('PASS 12-quad Catmull-Clark cube, depth-4/depth-5 limit convergence, weight-1 creases, watertight OCCT BRep, volume/area reference and Boolean');
