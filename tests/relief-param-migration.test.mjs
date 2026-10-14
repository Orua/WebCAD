import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import init from 'replicad-opencascadejs';import {CadKernel} from '../src/cad-kernel.js';
import {migrateReliefParams,legacyReliefParams} from '../src/relief-param-migration.js';
import {heightfieldReliefExample} from '../src/mesh/heightfield-relief.js';import {reliefPlateExample} from '../src/mesh/relief-plate.js';
import {reliefExample} from '../src/modeling/manufacturing/relief-contracts.js';import {getOperation} from '../src/operation-registry.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
test('old relief parameters roundtrip through v2 without changing executing values',()=>{
 for(const [op,p]of [['relief',reliefExample],['meshReliefPlate',reliefPlateExample],['meshHeightfieldRelief',heightfieldReliefExample]]){const v2=migrateReliefParams(op,p);assert.deepEqual(legacyReliefParams(op,v2),p);const schema=getOperation(op).inputSchema;assert.ok(schema.properties.sizeXMm.description.includes('mm'));assert.ok(schema.properties.sizeYMm.description.includes('Y'));assert.equal(schema.properties.widthMm,undefined);}
});
test('v1 and v2 meshes and precise relief rebuild to the same geometry hash',async()=>{
 for(const [op,p]of [['meshReliefPlate',reliefPlateExample],['meshHeightfieldRelief',heightfieldReliefExample],['relief',{...reliefExample,faceId:5,widthMm:4,heightMm:4,depthMm:.1}]]){
  const run=async params=>{const k=new CadKernel(oc),features=op==='relief'?[{id:'host',op:'box',params:{width:10,depth:10,height:2},refs:[]}]:[];features.push({id:'r',op,params,refs:op==='relief'?['host']:[]});const result=await k.rebuild({version:2,features,imports:{}});return result.bodies[0].meshReport?.geometryHash||k.geometrySourceSnapshot(k.shapes.get('r'));};
  assert.equal(await run(p),await run(migrateReliefParams(op,p)),op);
 }
});
