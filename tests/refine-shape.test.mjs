import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildRefineShape} from '../src/modeling/manufacturing/refine-shape.js';
import {getTool} from '../src/page-api-docs.js';
import {normalizeOperationParams} from '../src/operation-registry.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=s=>{try{s?.delete?.();}catch{}};

test('refine has an empty strict schema and explicit readback/errors',()=>{
 const card=getTool({id:'refineShape'});assert.equal(card.strictContract,true);assert.deepEqual(normalizeOperationParams('refineShape',{}),{});
 assert.throws(()=>normalizeOperationParams('refineShape',{tolerance:1}),{code:'PARAM_SCHEMA_INVALID'});
 assert(card.errorCodes.includes('NO_CHANGE'));assert(JSON.stringify(card).includes('refineReport'));assert.equal(card.refsSchema.maxItems,1);
});
for(const kind of ['planar','cylindrical'])test(`refine ${kind} split faces preserves exact source and material`,()=>{
 const a=kind==='planar'?cad.makeBox([0,0,0],[10,10,5]):cad.makeCylinder(5,5);
 const b=kind==='planar'?cad.makeBox([10,0,0],[20,10,5]):cad.makeCylinder(5,5,[0,0,5]);
 const raw=new oc.BRepAlgoAPI_Fuse(a.wrapped,b.wrapped),source=cad.cast(raw.Shape()),before=source.serialize();let result;
 try{result=buildRefineShape(source);const r=result.refineReport;assert.equal(source.serialize(),before);assert(r.removedFaceCount>0);assert(r.removedEdgeCount>0);assert.equal(r.after.solidCount,1);assert.equal(r.removedMm3,0);assert.equal(r.addedMm3,0);assert(r.volumeDeviationMm3<1e-8);assert.deepEqual(r.before.bounds,r.after.bounds);}
 finally{[result,source,raw,b,a].forEach(dispose);}
});
test('no splitter and non-solid inputs fail without modifying their source',()=>{
 const box=cad.makeBox([0,0,0],[10,10,5]),face=box.faces[0],before=box.serialize();
 try{assert.throws(()=>buildRefineShape(box),{code:'NO_CHANGE'});assert.equal(box.serialize(),before);assert.throws(()=>buildRefineShape(face),{code:'REFINE_UNSUPPORTED'});}
 finally{[face,box].forEach(dispose);}
});
test('a solid mixed with a loose wire is rejected rather than silently dropping the wire',()=>{
 const solid=cad.makeBox([0,0,0],[2,2,2]),line=cad.makeLine([5,0,0],[6,0,0]),mixed=cad.makeCompound([solid,line]),before=mixed.serialize();
 try{assert.throws(()=>buildRefineShape(mixed),{code:'REFINE_UNSUPPORTED'});assert.equal(mixed.serialize(),before);}
 finally{[mixed,line,solid].forEach(dispose);}
});
