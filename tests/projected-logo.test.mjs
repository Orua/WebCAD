import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import { CadKernel } from '../src/cad-kernel.js';
import { buildProjectedLogo } from '../src/projected-logo.js';
import { getOperation, normalizeOperationParams } from '../src/operation-registry.js';
import { bodyState } from '../src/body-state.js';

const kernel = new CadKernel(await init({ wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)) }));
const dispose = o => { try { o?.delete(); } catch {} };
// Exact outer/inner cross-sections read from the user's original document
// 6e0042ab-b126-482d-bb0a-55efa564f448. No guessed dimensions or logo glyphs.
export const profile = (id, inner = false) => {
  const r = inner ? 6 : 7, left = inner ? 28.5 : 27.5;
  return { id, op: 'sketchProfile', name: id, refs: [], params: {
    profileVersion: 1, output: 'face', entities: [
      {id:'a',type:'line',startMm:[left,-r],endMm:[left,r]},
      {id:'b',type:'line',startMm:[left,r],endMm:[30.5,r]},
      {id:'c',type:'arc3',startMm:[30.5,r],midMm:[30.5+r,0],endMm:[30.5,-r]},
      {id:'d',type:'line',startMm:[30.5,-r],endMm:[left,-r]},
    ], loops:[{id:'loop',edges:['a','b','c','d'].map(entityId=>({entityId,reversed:false}))}],
    regions:[{id:'band',outerLoopId:'loop',holeLoopIds:[]}],
  }, placement:{version:1,resolverVersion:1,frameSnapshot:{origin:[0,0,0],quaternion:[0,0,0,1]},sourceAnchor:{kind:'model-origin'},sourcePoint:[0,0,0]},semanticsVersion:2 };
};
const features = [profile('outer'), {id:'outerSolid',op:'profileRevolve',params:{operation:'newBody',angleDeg:360,axisDirection:[0,1,0],axisPoint:[0,0,0]},refs:['outer']}, profile('inner',true), {id:'ring',op:'profileRevolve',params:{operation:'cut',angleDeg:360,axisDirection:[0,1,0],axisPoint:[0,0,0]},refs:['inner','outerSolid']}];
await kernel.rebuild({version:1,features,imports:{},hidden:[]});
const source = kernel.shapes.get('ring'), faces = source.faces;
const faceId = faces.findIndex(f=>{ const n=f.normalAt(); try { return f.geomType==='PLANE' && n.toTuple()[1]>.999; } finally {dispose(n);} });
faces.forEach(dispose); assert.ok(faceId>=0);
const params = {placementVersion:2,projectionMode:'connectedFaces',mode:'engrave',faceId,point:[30,7,0],depth:.6,scale:1,angle:0,offsetX:0,offsetY:0,draftAngle:0,
  regions:[{outer:[[-1,-2],[2,-2],[2,2],[-1,2]],holes:[[[-.4,-.5],[-.4,.5],[.4,.5],[.4,-.5]]]}]};
const hash=shape=>createHash('sha256').update(shape.serialize()).digest('hex');
const before=hash(source), start=performance.now();
const result=buildProjectedLogo(source,params,cad);
console.log('PROJECTION_REPORT',JSON.stringify(result.logoProjectionReport),'ms',performance.now()-start);
assert.ok(result.logoProjectionReport.sourceFaceIds.length>=2,'real ring planar/toroidal junction must be crossed');
assert.ok(Math.abs(result.logoProjectionReport.removedVolumeMm3-(12-.8)*.6)<1e-4);
assert.equal(hash(source),before,'source stays unchanged');
const distance=(point,shape=result)=>{const v=cad.makeVertex(point),fs=shape.faces;try{return Math.min(...fs.map(f=>cad.measureDistanceBetween(f,v)));}finally{dispose(v);fs.forEach(dispose);}};
// Exact bottom on both sides; hole island and rear wall stay material.
assert.ok(distance([29.2,6.4,0])<1e-6);
assert.ok(distance([31.2,Math.sqrt(49-(31.2-30.5)**2)-.6,0])<1e-6);
assert.ok(distance([30,7,0])<1e-6);
assert.ok(distance([31.2,-Math.sqrt(49-(31.2-30.5)**2),0])<1e-6);
assert.throws(()=>buildProjectedLogo(source,{...params,depth:1.5},cad),/薄壁/);
assert.throws(()=>buildProjectedLogo(source,{...params,offsetX:-2},cad),/完整覆盖/);
assert.throws(()=>buildProjectedLogo(source,{...params,mode:'emboss'},cad),/仅支持凹刻/);
assert.equal(hash(source),before,'failed preflights preserve the exact committed source');
const reviewed={...params,source:{kind:'reviewed-contours',reviewed:true},machiningIntent:{version:1,requestedGeometry:'constantDepthContours',sourceInterpretation:'reviewedVectors',userIntentEvidence:'Explicit directional projection engraving regression'}};
assert.equal(normalizeOperationParams('logo',reviewed).projectionMode,'connectedFaces');
assert.throws(()=>normalizeOperationParams('logo',{...reviewed,projectionMode:'invalid'}),{code:'PARAM_SCHEMA_INVALID'});
assert.ok(getOperation('logo').inputSchema.properties.projectionMode);
const rebuilt=await kernel.rebuild({version:1,features:[...features,{id:'engraved',op:'logo',params:reviewed,refs:['ring']}],imports:{},hidden:[]});
const body=bodyState(rebuilt.bodies.find(b=>b.id==='engraved'));
assert.deepEqual(body.logoProjectionReport.sourceFaceIds,result.logoProjectionReport.sourceFaceIds);
assert.equal(body.logoProjectionReport.depthDirection,'projection');
assert.equal(body.solidCount,1);
dispose(result);kernel.dispose();
console.log('PASS original 55/75x14 ring: plane/round junction, 0.6 directional depth, hole island, rear wall and thin-wall rejection');
