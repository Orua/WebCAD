import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const model=QUICK_MODELS.ellipseBar;
const run=params=>kernel.rebuild({version:1,features:[{id:'ellipse',op:'quickModel',params,refs:[],name:'ellipse'}],imports:{},hidden:[]});
assert.ok(quickModelIconKinds.includes('ellipseBar'));
assert.ok(model.label&&model.labelEn&&model.description&&model.descriptionEn);
for(const field of model.fields)assert.ok(Object.hasOwn(model.defaults,field.key));
const shape=await run({kind:'ellipseBar',...model.defaults});
assert.equal(shape.stats.solids,1);
assert.ok(shape.stats.volume>2800&&shape.stats.volume<2950);
const extents=shape.bodies[0].bounds.max.map((v,i)=>v-shape.bodies[0].bounds.min[i]);
assert.ok(Math.abs(extents[0]-45)<.1,`X ${extents[0]}`);
assert.ok(Math.abs(extents[1]-35)<1e-4,`Y ${extents[1]}`);
assert.ok(Math.abs(extents[2]-5)<1e-4,`Z ${extents[2]}`);
const before=(await kernel.export('brep')).data;
for(const bad of [{innerWidth:20},{innerHeight:19},{barDiameter:6},{barDepthOffset:5},{sectionSize:0}]){
  await assert.rejects(run({kind:'ellipseBar',...model.defaults,...bad}));
  assert.equal((await kernel.export('brep')).data,before);
}
kernel.dispose();
console.log(`PASS PG5155 elliptical ring/bar candidate: connected solid, ${extents.map(v=>v.toFixed(6)).join('×')} mm, invalid input rollback`);
