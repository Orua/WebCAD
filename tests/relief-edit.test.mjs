import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {editMeshRelief,meshGeometryHash} from '../src/mesh/relief-edit.js';
import {reliefFixture,oracle} from './fixtures/relief-tools.mjs';
import {validateSchema} from '../src/contracts/operation-schema.js';
import {reliefEditOperation} from '../src/mesh/relief-edit-contract.js';
const params=mesh=>({version:1,units:'mm',topologyEpoch:0,inputGeometryHash:meshGeometryHash(mesh),support:{originMm:[0,0,0],xAxis:[1,0,0],normal:[0,0,1]},seedMm:[-10,0,1.4],region:{centerMm:[-10,0],coreRadiusMm:4,transitionMm:2},protectedRegions:[{centerMm:[10,0],radiusMm:6}],mode:'scaleHeight',value:1/1.4,minThicknessMm:1.5});
test('page adapter forwards one source and exposes preview measurements',()=>{const s=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');assert.match(s,/const labels = \{[^\n]*meshReliefEdit:/);assert.match(s,/const single=\['meshReliefEdit'/);assert.match(s,/previewScopeReport=op==='meshReliefEdit'\?previewBody\?\.meshReport\?\.edit/);});
test('U0 independent analytic oracle rejects wrong and accepts independently generated correct mesh',()=>{assert.equal(oracle(reliefFixture(),1).passed,false);assert.equal(oracle(reliefFixture({left:1}),1).passed,true);});
test('T01 direct edit corrects existing mesh; all non-ROI coordinates and source retained exactly',()=>{const source=reliefFixture(),saved=source.positions.slice(),r=editMeshRelief(source,params(source));assert.equal(oracle(r.mesh,1).passed,true);assert.deepEqual(source.positions,saved);for(let i=0;i<saved.length;i+=3)if(Math.hypot(saved[i]+10,saved[i+1])>=6||saved[i+2]<0)assert.deepEqual(r.mesh.positions.slice(i,i+3),saved.slice(i,i+3));assert.equal(r.report.validation.closedOriented,true);});
test('stale, backside seed, crossing and insufficient thickness fail without changing source',()=>{const mesh=reliefFixture(),saved=mesh.positions.slice(),p=params(mesh);for(const [patch,code]of [[{inputGeometryHash:'stale'},'STALE_REFERENCE'],[{seedMm:[-10,0,-2.5]},'RELIEF_SELECTION_AMBIGUOUS'],[{mode:'offset',value:-5},'RELIEF_INTERSECTION'],[{mode:'flatten',value:-1.1},'RELIEF_THICKNESS']])assert.throws(()=>editMeshRelief(mesh,{...p,...patch}),{code});assert.deepEqual(mesh.positions,saved);});
test('T21 nearby independent shell is unchanged and stops an upward collision',()=>{const a=reliefFixture(),b=reliefFixture({left:1,thickness:2.5});for(let i=2;i<b.positions.length;i+=3)b.positions[i]+=4;const mesh={positions:new Float64Array([...a.positions,...b.positions]),indices:new Uint32Array([...a.indices,...b.indices.map(i=>i+a.positions.length/3)])},p=params(mesh),r=editMeshRelief(mesh,p);assert.deepEqual(r.mesh.positions.slice(a.positions.length),b.positions);assert.throws(()=>editMeshRelief(mesh,{...p,mode:'offset',value:4}),{code:'RELIEF_INTERSECTION'});});
test('hard protection takes precedence and topology requests never change identity',()=>{const m=reliefFixture(),p=params(m),r=editMeshRelief(m,{...p,protectedRegions:[{centerMm:[-10,0],radiusMm:1}]});for(let i=0;i<m.positions.length;i+=3)if(Math.hypot(m.positions[i]+10,m.positions[i+1])<=1)assert.deepEqual(r.mesh.positions.slice(i,i+3),m.positions.slice(i,i+3));assert.throws(()=>editMeshRelief(m,{...p,topologyEpoch:1}),{code:'RELIEF_EDIT_VERSION'});});
test('mandatory target conflicting with hard protection rejects atomically with the target position',()=>{
 const m=reliefFixture(),saved=m.positions.slice(),p={...params(m),targets:[{pointMm:[-10,0],heightMm:1,toleranceMm:.02}]};
 const r=editMeshRelief(m,p);assert.equal(r.report.constraints[0].actualHeightMm,1);
 assert.throws(()=>editMeshRelief(m,{...p,protectedRegions:[{centerMm:[-10,0],radiusMm:1}]}),{code:'RELIEF_CONSTRAINT_CONFLICT',path:'params.targets.0'});assert.deepEqual(m.positions,saved);
});
test('replace removes the previous surface in core, blends transition and protects every outside coordinate',()=>{
 const m=reliefFixture(),{value,...p}=params(m),field={originMm:[-16,-6],sizeMm:[12,12],heightsMm:[[-.2,.2],[-.2,.2]]};
 const r=editMeshRelief(m,{...p,mode:'replace',field});let changed=0;
 for(let i=0;i<m.positions.length;i+=3){const [x,y,z]=m.positions.slice(i,i+3),d=Math.hypot(x+10,y);if(z>=0&&d<=4){assert.ok(Math.abs(r.mesh.positions[i+2]-(x+10)/30)<1e-12);changed++;}if(z<0||d>=6)assert.deepEqual(r.mesh.positions.slice(i,i+3),m.positions.slice(i,i+3));}assert.ok(changed>0);
 assert.throws(()=>editMeshRelief(m,{...p,mode:'replace',field:{...field,sizeMm:[1,1]}}),{code:'RELIEF_FIELD_INVALID'});
 assert.throws(()=>editMeshRelief(m,{...p,mode:'replace',field:{...field,heightsMm:Array.from({length:257},()=>Array(257).fill(.2))}}),{code:'RELIEF_RESOLUTION_INSUFFICIENT'});
 const request={...p,mode:'replace',field};validateSchema(reliefEditOperation.paramsSchema,request);
 assert.throws(()=>validateSchema(reliefEditOperation.paramsSchema,{...request,value:1}),{code:'PARAM_SCHEMA_INVALID'});
 assert.throws(()=>validateSchema(reliefEditOperation.paramsSchema,{...p,mode:'replace'}),{code:'PARAM_SCHEMA_INVALID'});
});
