import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildEllipsoid} from '../src/ellipsoid.js';
import {diagnoseSurface} from '../src/surface-repair.js';
import {CadKernel} from '../src/cad-kernel.js';
import {normalizeOperationParams} from '../src/operation-registry.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';
test('exact rational ellipsoid octants are watertight and match analytic volume',async()=>{
  cad.setOC(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
  const solid=buildEllipsoid({radiiMm:[2,3,4],centerMm:[5,6,7]},cad);
  try{assert.equal(solid.faces.length,8);assert.equal(solid.solids.length,1);assert(solid.ellipsoidReport.relativeVolumeError<.005);assert.equal(diagnoseSurface(solid,cad).freeEdges,0);console.log(JSON.stringify(solid.ellipsoidReport));}finally{solid.delete();}
});

test('registered ellipsoid keeps exact radii, creation placement, report and saved BRep',async()=>{
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),a=new CadKernel(oc),b=new CadKernel(oc),params={radiiMm:[2,3,4]};
 const doc={version:2,imports:{},features:[{id:'e',op:'ellipsoid',params,refs:[],placement:{frameSnapshot:{origin:[10,20,30],quaternion:[0,0,Math.sin(Math.PI/8),Math.cos(Math.PI/8)]},sourcePoint:[0,0,0]}}]};
 try{
  normalizeOperationParams('ellipsoid',params);const result=await a.rebuild(doc),body=result.bodies[0];assert.equal(body.solidCount,1);assert.equal(body.faceCount,8);assert(Math.abs(body.volume-32*Math.PI)<1e-6);assert.equal(body.ellipsoidReport.relativeVolumeError<.005,true);assert.equal(body.displayReport.watertight,true);
  body.bounds.min.forEach((min,i)=>assert(Math.abs((min+body.bounds.max[i])/2-[10,20,30][i])<1e-6));
  const saved=a.bakeProject(doc,{thresholdMs:0}),loaded=await decodeProject(encodeProjectV4(saved.document)),restored=await b.rebuild(loaded);assert.deepEqual(restored.compiledReuse,['e']);assert.deepEqual(restored.bodies[0].ellipsoidReport.radiiMm,[2,3,4]);assert(Math.abs(restored.bodies[0].volume-body.volume)<1e-8);assert((await b.export('step')).data.length>1000);
 }finally{a.dispose();b.dispose();}
});
