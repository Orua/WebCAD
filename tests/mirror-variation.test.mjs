import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {mirrorVariation,overriddenParams} from '../src/mirror-variation.js';
test('seeded mirror variation is repeatable and bounded',()=>{
  const input={seed:'fixture-42',translateMm:[.1,.2,.3],rotateDeg:[2,3,4],scale:[.97,1.03]},a=mirrorVariation(input);
  assert.deepEqual(a,mirrorVariation(input));a.translateMm.forEach((v,i)=>assert(Math.abs(v)<=input.translateMm[i]));a.rotateDeg.forEach((v,i)=>assert(Math.abs(v)<=input.rotateDeg[i]));assert(a.scale>=.97&&a.scale<=1.03);
  assert.throws(()=>overriddenParams({x:1},{'__proto__.x':2}));
});
test('mirrored geometry replays the same seed and linked overrides follow source changes',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),a=new CadKernel(oc),b=new CadKernel(oc);
  const doc={version:2,imports:{},features:[{id:'a',op:'box',params:{width:10,depth:8,height:6},refs:[]},{id:'m',op:'mirror',params:{plane:'YZ',keepOriginal:false,variation:{seed:'sample',translateMm:[.1,.1,.1],rotateDeg:[2,2,2],scale:[.97,1.03]},linkedOverrides:{width:12}},refs:['a']}]};
  try{
    doc.features[0].placement={version:1,frameSnapshot:{origin:[30,0,0],quaternion:[0,0,0,1]},sourceAnchor:{kind:'model-origin'},sourcePoint:[0,0,0]};
    const first=await a.rebuild(doc),again=await b.rebuild(doc);assert(Math.abs(first.stats.volume-again.stats.volume)<1e-6);assert.deepEqual(first.bodies[0].variationReport,again.bodies[0].variationReport);
    assert(Math.abs((first.bodies[0].bounds.min[0]+first.bodies[0].bounds.max[0])/2+36)<.11,'linked source must retain its placement snapshot and overridden width');
    doc.features[0].params.depth=9;const updated=await a.rebuild(doc);assert(Math.abs(updated.stats.volume/first.stats.volume-9/8)<1e-6);assert.equal(doc.features[1].params.linkedOverrides.width,12);
  }finally{a.dispose();b.dispose();}
});
