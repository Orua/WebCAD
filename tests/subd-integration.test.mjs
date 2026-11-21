import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {SUBD_EXAMPLE} from '../src/subd-contract.js';
import {applySubdBrushes} from '../src/subd-brushes.js';
import {sampleCatmullClarkLimit} from '../src/subd-catmark.js';
import {getOperation,normalizeOperationParams} from '../src/operation-registry.js';
import {recoveryRule} from '../src/error-recovery.js';
test('SubD brush replay is immutable and registered BRep exports through the shared kernel',async()=>{
  const before=structuredClone(SUBD_EXAMPLE.cage),brushes=[{centerMm:[0,0,10],radiusMm:20,strength:.2,mode:'inflate'}],changed=applySubdBrushes(before,brushes);
  assert.deepEqual(before,SUBD_EXAMPLE.cage);assert(changed.vertices.some((v,i)=>v[2]>before.vertices[i][2]));assert.deepEqual(changed,applySubdBrushes(before,brushes));
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc),params={...structuredClone(SUBD_EXAMPLE),brushes};
  try{
    normalizeOperationParams('subdBody',params);const result=await kernel.rebuild({version:2,features:[{id:'subd',op:'subdBody',params,refs:[]}],imports:{}});
    assert.equal(result.bodies[0].solidCount,1);assert(result.bodies[0].subdApproximation.volumeRelativeError<.02);const step=await kernel.export('step'),text=typeof step.data==='string'?step.data:new TextDecoder().decode(step.data);assert(text.includes('ISO-10303-21'));console.log(JSON.stringify(result.bodies[0].subdApproximation));
  }finally{kernel.dispose();}
});

test('directional SubD brush moves only hit cage points along the declared vector',()=>{
  const cage=structuredClone(SUBD_EXAMPLE.cage);
  const brush={mode:'move',centerMm:cage.vertices[4],radiusMm:5,deltaMm:[2.5,1,0]};
  const params={...SUBD_EXAMPLE,brushes:[brush]};
  assert.deepEqual(normalizeOperationParams('subdBody',params).brushes,[brush]);
  assert.throws(()=>normalizeOperationParams('subdBody',{...params,brushes:[{...brush,strength:1}]}));
  assert.throws(()=>normalizeOperationParams('subdBody',{...params,brushes:[{...brush,mode:'push'}]}));
  const next=applySubdBrushes(cage,[brush]);
  assert.deepEqual(next.vertices[4],[-7.5,-9,10]);
  assert.deepEqual(next.vertices.filter((_,i)=>i!==4),cage.vertices.filter((_,i)=>i!==4));
  assert.equal(next.brushReport[0].affectedControlPoints,1);
  assert.ok(Math.abs(next.brushReport[0].maxDisplacementMm-Math.hypot(2.5,1))<1e-9);
  assert.deepEqual(cage,SUBD_EXAMPLE.cage);
});


test('protectVertexIds pins listed cage handles for one brush and does not lock the limit surface',()=>{
  const cage=structuredClone(SUBD_EXAMPLE.cage);
  const schema=getOperation('subdBody').inputSchema.properties.brushes.items.properties.protectVertexIds;
  assert.equal(schema.uniqueItems,true);assert.equal(schema.items.maximum,255);
  assert.equal(recoveryRule('SUBD_BRUSH_PROTECTED_ONLY').id,'no-effect');
  const brush={mode:'move',centerMm:[10,10,10],radiusMm:25,deltaMm:[0,0,4],protectVertexIds:[6]};
  assert.deepEqual(normalizeOperationParams('subdBody',{...SUBD_EXAMPLE,brushes:[brush]}).brushes[0].protectVertexIds,[6]);
  for(const ids of [[6,6],[-1],['6'],[6.5]])assert.throws(()=>normalizeOperationParams('subdBody',{...SUBD_EXAMPLE,brushes:[{...brush,protectVertexIds:ids}]}));
  for(const fn of [normalizeOperationParams.bind(null,'subdBody',{...SUBD_EXAMPLE,brushes:[{...brush,protectVertexIds:[8]}]}),()=>applySubdBrushes(cage,[{...brush,protectVertexIds:[8]}])])assert.throws(fn,error=>error.code==='PARAM_SCHEMA_INVALID'&&/protectVertexIds/.test(error.message));
  const next=applySubdBrushes(cage,[brush]);
  const report=next.brushReport[0];
  assert.deepEqual(next.vertices[6],cage.vertices[6]);
  assert.deepEqual(report.protectVertexIds,[6]);
  assert.equal(report.protectedInRange,1);
  assert.equal(report.affectedControlPoints,3);
  for(const id of [2,5,7])assert.notDeepEqual(next.vertices[id],cage.vertices[id]);
  const before=sampleCatmullClarkLimit(cage,1,1,1,4),after=sampleCatmullClarkLimit({...cage,vertices:next.vertices},1,1,1,4);
  assert.ok(Math.hypot(...after.map((v,i)=>v-before[i]))>1e-4,'neighbors can still move the limit surface at a pinned handle');
  assert.deepEqual(cage,SUBD_EXAMPLE.cage);
});

test('all in-range protected handles leave the cage unchanged and use a distinct warning',()=>{
  const cage=structuredClone(SUBD_EXAMPLE.cage);
  const miss=applySubdBrushes(cage,[{mode:'push',centerMm:[0,0,0],radiusMm:1,strength:2,protectVertexIds:[6]}]);
  assert.equal(miss.brushReport[0].warning.code,'SUBD_BRUSH_NO_HIT');
  assert.equal(miss.brushReport[0].protectedInRange,0);
  const pinned=applySubdBrushes(cage,[{mode:'push',centerMm:[10,10,10],radiusMm:5,strength:2,protectVertexIds:[6]}]);
  assert.deepEqual(pinned.vertices,cage.vertices);
  assert.equal(pinned.brushReport[0].affectedControlPoints,0);
  assert.equal(pinned.brushReport[0].protectedInRange,1);
  assert.equal(pinned.brushReport[0].warning.code,'SUBD_BRUSH_PROTECTED_ONLY');
  assert.equal(pinned.brushReport[0].maxDisplacementMm,0);
});
