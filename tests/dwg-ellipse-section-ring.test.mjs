import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const model=QUICK_MODELS.ellipseSectionRing;
assert.ok(quickModelIconKinds.includes('ellipseSectionRing'));
assert.ok(model.label&&model.labelEn&&model.description&&model.descriptionEn);
for(const field of model.fields)assert.ok(Object.hasOwn(model.defaults,field.key));
const run=(id,params)=>kernel.rebuild({version:1,features:[{id,op:'quickModel',refs:[],params,name:id}],imports:{},hidden:[]});
const source={kind:'ellipseSectionRing',innerDiameter:37.4,sectionWidth:4.1,sectionDepth:5};
for(const [id,params] of [['PG6148',source],['wide-face',{...source,sectionWidth:5,sectionDepth:4.1}]]){
  const result=await run(id,params);
  assert.equal(result.stats.solids,1);
  const size=result.bodies[0].bounds.max.map((v,i)=>v-result.bodies[0].bounds.min[i]);
  [params.innerDiameter+2*params.sectionWidth,params.innerDiameter+2*params.sectionWidth,params.sectionDepth].forEach((n,i)=>assert.ok(Math.abs(size[i]-n)<1e-5,`${id} bound ${i}: ${size[i]}`));
  const expected=2*Math.PI*(params.innerDiameter+params.sectionWidth)/2*Math.PI*params.sectionWidth*params.sectionDepth/4;
  assert.ok(Math.abs(result.stats.volume-expected)<1e-4,`${id} analytic torus volume ${result.stats.volume}`);
  if(id==='PG6148'){
    assert.ok(Math.abs(result.stats.volume-2099.1414860566865)<1e-4,'PG6148 source-dimension candidate volume');
    const out=await kernel.export('step');
    const imported=await kernel.rebuild({version:1,features:[{id:'imported',op:'import',params:{key:'pg6148'},refs:[]}],imports:{pg6148:{format:'step',data:Buffer.from(out.data).toString('base64')}},hidden:[]});
    assert.equal(imported.stats.solids,1);
    assert.ok(Math.abs(imported.stats.volume-result.stats.volume)<1e-4,'STEP roundtrip volume');
  }
}
const before=(await kernel.export('brep')).data;
for(const bad of [{innerDiameter:0},{innerDiameter:10},{sectionWidth:0},{sectionDepth:0},{sectionDepth:4.1},{sectionWidth:NaN}]){
  await assert.rejects(run('invalid',{...source,...bad}));
  assert.equal((await kernel.export('brep')).data,before);
}
kernel.dispose();
console.log('PASS PG6148 ellipse-section ring: exact source diameters, two section directions, analytic volume, STEP roundtrip and rollback');
