import test from 'node:test';
import assert from 'node:assert/strict';
import {makeReliefPlate} from '../src/mesh/relief-plate.js';
import {editMeshRelief,meshGeometryHash} from '../src/mesh/relief-edit.js';
import {sampleMeshRelief} from '../src/mesh/relief-sample.js';
import {reliefEditExample,reliefEditOperation} from '../src/mesh/relief-edit-contract.js';
import {validateSchema} from '../src/contracts/operation-schema.js';
const layer=(id,blend,heightMm,role='macro')=>({id,enabled:true,kind:'surface',role,attachment:blend==='replace'?'absolute':'followHeight',blend,region:{centerMm:[0,0],coreRadiusMm:1,transitionMm:.5},heightMm});
function fixture(){const mesh=makeReliefPlate({version:1,widthMm:8,depthMm:8,thicknessMm:2,spacingMm:.25,bumps:[]}),{value,...base}=reliefEditExample;return {mesh,p:{...base,inputGeometryHash:meshGeometryHash(mesh),seedMm:[0,0,0],region:{centerMm:[0,0],coreRadiusMm:2,transitionMm:1},mode:'layers',layers:[layer('macro','add',1),layer('detail','remove',.1,'detail')]}};}
const height=(mesh,p)=>sampleMeshRelief(mesh,{bodyId:'mesh',inputGeometryHash:meshGeometryHash(mesh),support:p.support,pointsMm:[[0,0]]}).samples[0].heightsMm.at(-1);
test('macro edits retain relative detail, while explicit absolute replacement follows its own height',()=>{
 const {mesh,p}=fixture();validateSchema(reliefEditOperation.paramsSchema,p);const r=editMeshRelief(mesh,p);assert.ok(Math.abs(height(r.mesh,p)-.9)<1e-12);
 const changed=structuredClone(p);changed.layers[0].heightMm=1.2;const later=editMeshRelief(mesh,changed);assert.ok(Math.abs(height(later.mesh,p)-1.1)<1e-12);
 changed.layers[1]=layer('fixed','replace',.6,'detail');assert.ok(Math.abs(height(editMeshRelief(mesh,changed).mesh,p)-.6)<1e-12);
 changed.layers.reverse();assert.ok(Math.abs(height(editMeshRelief(mesh,changed).mesh,p)-1.8)<1e-12);
 assert.equal(mesh.positions.some(z=>z===1.8),false);
});
test('freeze protects an already formed peak from later macro layers; contradictory final target rejects',()=>{
 const {mesh,p}=fixture();p.layers=[layer('eye','add',.8),{id:'freeze',kind:'freeze',enabled:true,regions:[{centerMm:[0,0],radiusMm:.5}]},layer('brow','add',.5)];
 const r=editMeshRelief(mesh,p);assert.ok(Math.abs(height(r.mesh,p)-.8)<1e-12);assert.equal(r.report.layers[1].status,'protected');
 const saved=mesh.positions.slice();assert.throws(()=>editMeshRelief(mesh,{...p,targets:[{pointMm:[0,0],heightMm:1.3,toleranceMm:.01}]}),{code:'RELIEF_CONSTRAINT_CONFLICT'});assert.deepEqual(mesh.positions,saved);
 const disabled=structuredClone(p);disabled.layers[2].enabled=false;assert.ok(Math.abs(height(editMeshRelief(mesh,disabled).mesh,p)-.8)<1e-12);
});
test('layer domain escape and duplicate identity reject instead of expanding ROI',()=>{const {mesh,p}=fixture();assert.throws(()=>editMeshRelief(mesh,{...p,layers:[p.layers[0],p.layers[0]]}),{code:'RELIEF_LAYERS_INVALID'});const changed=structuredClone(p);changed.layers[0].region.centerMm=[10,0];assert.throws(()=>editMeshRelief(mesh,changed),{code:'RELIEF_REGION_INVALID'});});
