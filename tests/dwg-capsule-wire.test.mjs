import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const model=QUICK_MODELS.capsuleWire;
assert.ok(quickModelIconKinds.includes('capsuleWire'));
assert.ok(model.label&&model.labelEn&&model.description&&model.descriptionEn);
for(const field of model.fields)assert.ok(Object.hasOwn(model.defaults,field.key));
const run=(id,params)=>kernel.rebuild({version:1,features:[{id,op:'quickModel',params,refs:[],name:id}],imports:{},hidden:[]});
const cases=[
  {id:'PG11140',innerWidth:34.9,innerHeight:13.9,sectionSize:6.1,stepVolume:3063.6758565430728},
  {id:'PG9782',innerWidth:12.3,innerHeight:8.4,sectionSize:3,stepVolume:308.29030395840766},
  {id:'PG4995',innerWidth:45,innerHeight:25,sectionSize:7},
];
for(const p of cases){
  const result=await run(p.id,{kind:'capsuleWire',...p});
  assert.equal(result.stats.solids,1);
  const size=result.bodies[0].bounds.max.map((v,i)=>v-result.bodies[0].bounds.min[i]);
  [p.innerWidth+2*p.sectionSize,p.innerHeight+2*p.sectionSize,p.sectionSize].forEach((n,i)=>assert.ok(Math.abs(size[i]-n)<1e-5,`${p.id} bound ${i}: ${size[i]}`));
  const pathLength=2*(p.innerWidth-p.innerHeight)+Math.PI*(p.innerHeight+p.sectionSize);
  const expected=Math.PI*p.sectionSize**2/4*pathLength;
  assert.ok(Math.abs(result.stats.volume-expected)<1e-4,`${p.id} analytic volume ${result.stats.volume}`);
  if(p.stepVolume)assert.ok(Math.abs(result.stats.volume-p.stepVolume)<1e-4,`${p.id} independent STEP volume`);
}
const before=(await kernel.export('brep')).data;
const valid={kind:'capsuleWire',innerWidth:12.3,innerHeight:8.4,sectionSize:3};
for(const bad of [{innerWidth:8.4},{innerHeight:0},{sectionSize:0},{sectionSize:NaN}]){
  await assert.rejects(run('bad',{...valid,...bad}));
  assert.equal((await kernel.export('brep')).data,before);
}
kernel.dispose();
console.log('PASS PG11140, PG9782 and PG4995 round-wire capsule: two independent STEP volumes, exact nominal bounds and invalid rollback');
