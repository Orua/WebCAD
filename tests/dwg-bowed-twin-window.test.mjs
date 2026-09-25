import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';
import {readDocs} from '../src/page-api-docs.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const p={kind:'bowedTwinWindowPlate',...QUICK_MODELS.bowedTwinWindowPlate.defaults};
assert.ok(quickModelIconKinds.includes(p.kind));
assert.match(readDocs({docId:'recipes.bowed-twin-window'}).text,/windowSpacing/);
for(const field of QUICK_MODELS.bowedTwinWindowPlate.fields)assert.ok(Object.hasOwn(QUICK_MODELS.bowedTwinWindowPlate.defaults,field.key));
const run=(id,params)=>kernel.rebuild({version:1,features:[{id,op:'quickModel',params,refs:[],name:id}],imports:{},hidden:[]});
const result=await run('PG3781',p);
assert.equal(result.stats.solids,1);
const size=result.bodies[0].bounds.max.map((v,i)=>v-result.bodies[0].bounds.min[i]);
assert.ok(Math.abs(size[0]-43.597846710995)<0.02);
assert.ok(Math.abs(size[1]-24.5)<1e-5);
assert.ok(Math.abs(size[2]-3.7)<1e-5);
assert.ok(Math.abs(result.stats.volume-2206.094500805238)<1.4);
const before=(await kernel.export('brep')).data;
for(const bad of [{sideRadius:6},{cornerRadius:13},{windowSpacing:6},{edgeRadius:2},{windowWidth:50}]){
  await assert.rejects(run('invalid',{...p,...bad}));
  assert.equal((await kernel.export('brep')).data,before);
}
const variant=await run('variant',{...p,topStraightWidth:36,windowWidth:28,edgeRadius:0});
assert.equal(variant.stats.solids,1);
assert.ok(variant.bodies[0].bounds.max[0]-variant.bodies[0].bounds.min[0]>size[0]);
kernel.dispose();
console.log('PASS PG3781 bowed-side symmetric approximation, alternate dimensions and invalid rollback');
