import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const f=(id,params)=>({id,op:'quickModel',params,refs:[],name:id});
const run=feature=>kernel.rebuild({version:1,features:[feature],imports:{},hidden:[]});
const model=QUICK_MODELS.roundedFlatFrame;
assert.ok(model.label&&model.labelEn&&model.description&&model.descriptionEn);
assert.ok(quickModelIconKinds.includes('roundedFlatFrame'));
for(const field of model.fields)assert.ok(Object.hasOwn(model.defaults,field.key));

const base=await run(f('default',{kind:'roundedFlatFrame',...model.defaults}));
assert.equal(base.stats.solids,1);
for(const [id,outerWidth,innerWidth] of [['PG8016',48,40],['PG8017',58,50]]){
  const params={kind:'roundedFlatFrame',outerWidth,outerHeight:28,innerWidth,innerHeight:20,outerRadius:5,innerRadius:1.5,thickness:4,edgeRadius:1.9};
  const rounded=await run(f(id,params));
  assert.equal(rounded.stats.solids,1);
  const size=rounded.bodies[0].bounds.max.map((v,i)=>v-rounded.bodies[0].bounds.min[i]);
  [outerWidth,28,4].forEach((expected,i)=>assert.ok(Math.abs(size[i]-expected)<1e-5));
  const flat=await run(f('flat',{...params,kind:'flatFrame'}));
  assert.ok(rounded.stats.volume>0&&rounded.stats.volume<flat.stats.volume);
}
const pg3213={kind:'roundedFlatFrame',outerWidth:42,outerHeight:23,innerWidth:30,innerHeight:11,outerRadius:6,innerRadius:1.5,thickness:6,edgeRadius:2.9};
const migrated=await run(f('PG3213',pg3213));
assert.equal(migrated.stats.solids,1);
assert.ok(Math.abs(migrated.stats.volume-2923.4143439183854)<1e-5);
const migratedSize=migrated.bodies[0].bounds.max.map((v,i)=>v-migrated.bodies[0].bounds.min[i]);
[42,23,6].forEach((expected,i)=>assert.ok(Math.abs(migratedSize[i]-expected)<1e-5));
await assert.rejects(run(f('PG3213-half-round',{...pg3213,edgeRadius:3})));
const before=(await kernel.export('brep')).data;
for(const bad of [{edgeRadius:0},{edgeRadius:2.1},{edgeRadius:2},{innerWidth:58}]){
  await assert.rejects(run(f('bad',{kind:'roundedFlatFrame',outerWidth:58,outerHeight:28,innerWidth:50,innerHeight:20,outerRadius:5,innerRadius:1.5,thickness:4,edgeRadius:1.9,...bad})));
  assert.equal((await kernel.export('brep')).data,before);
}
kernel.dispose();
console.log('PASS independent-R rounded frame: defaults, two DWG cases, bounded radius and rollback');
