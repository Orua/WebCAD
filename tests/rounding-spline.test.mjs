import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import init from 'replicad-opencascadejs';import * as cad from 'replicad';
import {buildRounding} from '../src/modeling/rounding/index.js';import {topologyDetails} from '../src/modeling/rounding/topology.js';import {measureGeneratedSurfaceRadius} from '../src/modeling/rounding/section-metrics.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);const dispose=x=>{try{x?.delete?.()}catch{}};
function source(){const a=cad.makeCylinder(3,14,[0,-7,0],[0,1,0]),b=cad.makeCylinder(2,14,[0,0,-7],[0,0,1]);try{return a.intersect(b)}finally{dispose(a);dispose(b)}}
test('v2 rounds a curved two-cylinder intersection instead of rejecting its spline face',()=>{
 const s=source(),saved=s.serialize();let r;
 try{const row=topologyDetails(s).find(row=>row.sharp&&row.bounds[0][2]>0);assert(row);r=buildRounding(s,{specVersion:2,sizeMm:.3,scope:{kind:'edges',edgeIds:[row.edgeId]}});assert(cad.measureVolume(r)<cad.measureVolume(s));const map=r.roundingReport.generatedFaceMap;assert(map.some(f=>f.surfaceType==='BSPLINE_SURFACE'&&f.radiusMethod==='BREP-surface-isocurve-circle-fit'));assert(map.every(f=>Math.abs(f.measuredRadiusMm-.3)<1e-5));const seams=topologyDetails(r).filter(row=>row.adjacentFaceIds.some(id=>map.some(f=>f.faceId===id)));assert(seams.every(row=>row.normalAngleDeg!==null&&row.normalAngleDeg<.1));assert.equal(s.serialize(),saved);assert.equal(r.roundingReport.validation.seams,'G1-contact-and-patch-end-sampled');assert.equal(r.roundingReport.validation.endpoints,'all-required-measured');
 const faces=r.faces;try{const spline=faces[map.find(f=>f.surfaceType==='BSPLINE_SURFACE').faceId];assert.throws(()=>measureGeneratedSurfaceRadius(spline,.15,cad),e=>e.code==='GEOMETRY_INVALID');}finally{faces.forEach(dispose)}
 }finally{dispose(r);dispose(s)}
});
