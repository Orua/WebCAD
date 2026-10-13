import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {encodeMesh} from '../src/mesh/mesh-codec.js';
import {binaryHash} from '../src/contracts/operation-schema.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';
import {reliefFixture,oracle} from './fixtures/relief-tools.mjs';
import {reliefEditExample} from '../src/mesh/relief-edit-contract.js';
import {reliefPlateExample} from '../src/mesh/relief-plate.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
test('generic public plate operation creates an editable wrong surface and shares the same edit operation',async()=>{
 const k=new CadKernel(oc),params={...reliefPlateExample,widthMm:50,depthMm:40,thicknessMm:2.5,spacingMm:.25,bumps:[{centerMm:[-10,0],heightMm:1.4,plateauRadiusMm:2,outerRadiusMm:4},{centerMm:[10,0],heightMm:.8,plateauRadiusMm:2,outerRadiusMm:4}]},doc={version:4,features:[{id:'plate',op:'meshReliefPlate',params,refs:[]}],imports:{},hidden:[]};
 try{const initial=await k.rebuild(doc);assert.equal(oracle(k.activeShape('plate').transformed(),1).passed,false);const edit={...reliefEditExample,inputGeometryHash:initial.bodies[0].meshReport.geometryHash,seedMm:[-10,0,1.4],region:{centerMm:[-10,0],coreRadiusMm:4,transitionMm:2},value:1/1.4,minThicknessMm:1.5};await k.rebuild({...doc,features:[...doc.features,{id:'fixed',op:'meshReliefEdit',params:edit,refs:['plate']}]});assert.equal(oracle(k.activeShape('fixed').transformed(),1).passed,true);}finally{k.dispose();}
});
test('real kernel imports recipe-free Float64 mesh, edits, restores, cold-reopens and continues',async()=>{
 const kernel=new CadKernel(oc),mesh=reliefFixture(),bytes=encodeMesh(mesh),hash=binaryHash(bytes).slice(7),source={version:4,features:[{id:'source',op:'import',params:{key:'source'},refs:[]}],imports:{source:{format:'mesh',units:'mm',assetHash:hash}},binaryAssets:{[hash]:bytes},hidden:[]};
 try{const initial=await kernel.rebuild(source),p={...reliefEditExample,inputGeometryHash:initial.bodies[0].meshReport.geometryHash,seedMm:[-10,0,1.4],region:{centerMm:[-10,0],coreRadiusMm:4,transitionMm:2},protectedRegions:[{centerMm:[10,0],radiusMm:6}],value:1/1.4,minThicknessMm:1.5};
 const doc={...source,features:[...source.features,{id:'edited',op:'meshReliefEdit',params:p,refs:['source']}]};
 await kernel.rebuild(doc);const correct=kernel.activeShape('edited').transformed();assert.equal(oracle(correct,1).passed,true);
 await kernel.rebuild(source);assert.deepEqual(kernel.activeShape('source').transformed().positions,mesh.positions);
 await kernel.rebuild(doc);assert.deepEqual(kernel.activeShape('edited').transformed().positions,correct.positions);
 const saved=encodeProjectV4(doc,{includeTimeline:false}),reopened=await decodeProject(saved),cold=new CadKernel(oc);
 try{const result=await cold.rebuild(reopened);assert.deepEqual(cold.activeShape('edited').transformed().positions,correct.positions);const next={...reopened,features:[...reopened.features,{id:'next',op:'meshReliefEdit',params:{...p,inputGeometryHash:result.bodies[0].meshReport.geometryHash,seedMm:[-10,0,1],value:1.1},refs:['edited']}]};await cold.rebuild(next);assert.equal(oracle(cold.activeShape('next').transformed(),1.1).passed,true);
 await assert.rejects(cold.rebuild({...next,features:[...next.features,{id:'stale',op:'meshReliefEdit',params:p,refs:['next']}]}),{code:'STALE_REFERENCE'});assert.equal(oracle(cold.activeShape('next').transformed(),1.1).passed,true);
 }finally{cold.dispose();}
 }finally{kernel.dispose();}
});
