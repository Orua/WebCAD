import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {createReferenceSystem} from '../src/work-frame.js';
import {collectReferences,validateReferenceQuery} from '../src/reference-query.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
const kernel=new CadKernel(oc),context={sessionId:'test',documentId:'doc',documentInstanceId:'instance',revision:3};
try{
  const built=await kernel.rebuild({version:2,features:[{id:'plate',op:'box',params:{width:40,depth:30,height:6},refs:[]},{id:'hole',op:'hole',params:{radius:2,depth:3,x:20,y:15,z:6,axis:'Z',direction:-1},refs:['plate']}],imports:{}});
  const deps={context,referenceSystem:createReferenceSystem(),bodies:built.bodies,queryGeometry:(id,kind)=>kernel.queryGeometry(id,kind,{}),queryNearest:(id,kind,near)=>kernel.nearestGeometry(id,kind,near.point,{radiusMm:near.radiusMm}),assertFresh:()=>{}};
  const all=await collectReferences(validateReferenceQuery({kind:'point',bodyIds:['hole'],filter:{types:['circle-center']},limit:100}),deps);
  assert.equal(all.status,'read');assert.ok(all.matchCount>=2);assert.ok(all.items.every(item=>item.quality==='exact-brep'&&item.source.geometryFingerprint?.startsWith('brep-sha256:')));
  const ambiguous=await collectReferences(validateReferenceQuery({kind:'point',bodyIds:['hole'],filter:{types:['circle-center']},requireUnique:true}),deps);
  assert.equal(ambiguous.error.code,'AMBIGUOUS_REFERENCE');assert.ok(ambiguous.items.length>=2);
  const top=await collectReferences(validateReferenceQuery({kind:'point',bodyIds:['hole'],filter:{types:['circle-center'],near:{point:[20,15,6],radiusMm:.1}},requireUnique:true}),deps);
  assert.equal(top.status,'read');assert.deepEqual(top.items[0].worldPoint,[20,15,6]);
  const page=await collectReferences(validateReferenceQuery({kind:'point',bodyIds:['hole'],filter:{types:['circle-center']},limit:1,offset:1}),deps);
  assert.equal(page.items.length,1);assert.equal(page.matchCount,all.matchCount);
  const exactFace=await collectReferences(validateReferenceQuery({kind:'point',bodyIds:['hole'],filter:{types:['trimmed-face-point'],near:{point:[20,15,6],radiusMm:2.1}},limit:100}),deps);
  assert.ok(exactFace.items.some(item=>item.pointOnTrimmedFace&&Math.abs(item.residualMm-2)<1e-5));
  const exactEdge=await collectReferences(validateReferenceQuery({kind:'point',bodyIds:['hole'],filter:{types:['edge-nearest'],near:{point:[20,15,6],radiusMm:2.1}},limit:100}),deps);
  assert.ok(exactEdge.items.some(item=>Math.abs(item.residualMm-2)<1e-5));
  assert.throws(()=>validateReferenceQuery({kind:'point',bodyIds:['hole'],filter:{types:['trimmed-face-point']}}),{code:'PARAM_SCHEMA_INVALID'});
  assert.throws(()=>validateReferenceQuery({kind:'point',bodyIds:[],filter:{types:['made-up']}}),{code:'PARAM_SCHEMA_INVALID'});
  console.log('PASS reference candidates: exact circle centers, fingerprint, ambiguity, spatial narrowing and pagination');
}finally{kernel.dispose();}
