import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildCurveSweep} from '../src/curve-sweep.js';
import {getOperation} from '../src/operation-registry.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);

test('UP-32 straight spine creates a measured round solid with compact station laws',()=>{
 const shape=buildCurveSweep({pathType:'spine',spine:{kind:'bspline',pointsMm:[[0,0,0],[0,0,10]]},stations:{count:8},widthLaw:2,depthLaw:2},cad);
 try{assert.equal(shape.solids.length,1);assert.ok(Math.abs(cad.measureVolume(shape)-Math.PI*10)<.3);assert.equal(shape.loftReport.stationsResolved.length,8);}finally{shape.delete();}
});
test('UP-32 RMF follows an S spine without a frame flip and reports orthogonalization',()=>{
 const shape=buildCurveSweep({pathType:'spine',spine:{kind:'bspline',pointsMm:[[0,0,0],[5,.3,0],[10,-.3,0],[15,0,0]]},stations:{count:64,distribution:'uniform'},widthLaw:{kind:'spline',samples:[[0,.5],[.5,.6],[1,.45]]},depthLaw:{kind:'spline',samples:[[0,.4],[1,.4]]}},cad);
 try{const frames=shape.loftReport.spineFrames;assert.ok(frames.length===64);for(let i=1;i<frames.length;i++){const a=frames[i-1].widthDirection,b=frames[i].widthDirection;assert.ok(Math.acos(Math.max(-1,Math.min(1,a.reduce((s,v,j)=>s+v*b[j],0))))*180/Math.PI<2);}
  const stations=[];for(let i=0;i<3;i++)stations.push({centerMm:[0,0,i*5],normal:[0,0,1],widthDirection:[Math.cos(.5*Math.PI/180),0,Math.sin(.5*Math.PI/180)],widthMm:2,depthMm:1});
  const fixed=buildCurveSweep({pathType:'sections',stations,loftDegree:2},cad);try{assert.equal(fixed.loftReport.orthogonalizedStations.length,3);assert.ok(fixed.loftReport.orthogonalizedStations.every(s=>Math.abs(s.correctionDeg-.5)<.01));}finally{fixed.delete();}
 }finally{shape.delete();}
});
