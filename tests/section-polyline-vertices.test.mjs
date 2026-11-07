import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildSectionCurveLoft} from '../src/section-curve-loft.js';
cad.setOC(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const loft=points=>buildSectionCurveLoft({autoAlign:false,loftDegree:3,stations:[0,10].map(z=>({centerMm:[0,0,z],normal:[0,0,1],widthDirection:[1,0,0],widthMm:4,depthMm:3,profile:{kind:'spline',coordinateMode:'millimeters',interpolation:'polyline',points2d:points,closed:true}}))},cad);
test('explicit noncommensurate rectangle keeps its full source area and four corners',()=>{
 const points=[[-2,-1.5],[2,-1.5],[2,1.5],[-2,1.5]],original=structuredClone(points),shape=loft(points);
 try{assert(Math.abs(cad.measureVolume(shape)-120)<1e-6);assert.equal(shape.loftReport.stationsResolved[0].profileSampleCount,4);assert.equal(shape.loftReport.stationsResolved[0].preservesPolylineVertices,true);assert.deepEqual(points,original);}
 finally{shape.delete();}
});
test('irregular triangles and a repeated closing vertex retain literal polygon area',()=>{
 const shape=loft([[0,0],[4,0],[.7,3],[0,0]]);
 try{assert(Math.abs(cad.measureVolume(shape)-60)<1e-6);assert.equal(shape.loftReport.stationsResolved[0].profileSampleCount,3);}
 finally{shape.delete();}
});
