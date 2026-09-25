import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const p={kind:'uEndHolePlate',...QUICK_MODELS.uEndHolePlate.defaults};
const run=params=>kernel.rebuild({version:1,features:[{id:'u',op:'quickModel',refs:[],params,name:'u'}],imports:{},hidden:[]});
assert.ok(quickModelIconKinds.includes('uEndHolePlate'));
for(const field of QUICK_MODELS.uEndHolePlate.fields)assert.ok(Object.hasOwn(QUICK_MODELS.uEndHolePlate.defaults,field.key));
const model=await run(p);
assert.equal(model.stats.solids,1);
const size=model.bodies[0].bounds.max.map((v,i)=>v-model.bodies[0].bounds.min[i]);
[22,31.7,3].forEach((v,i)=>assert.ok(Math.abs(size[i]-v)<1e-5,`${i}: ${size[i]}`));
const ro=p.outerWidth/2,ri=p.innerWidth/2,straight=p.totalHeight-ro;
const area=(p.outerWidth-p.innerWidth)*straight+Math.PI/2*(ro**2-ri**2)-2*Math.PI*(p.holeDiameter/2)**2;
assert.ok(Math.abs(model.stats.volume-area*p.thickness)<1e-4,`volume ${model.stats.volume}`);
const before=(await kernel.export('brep')).data;
for(const bad of [{outerWidth:10},{innerWidth:22},{totalHeight:10},{holeDiameter:6},{holeInset:1},{holeInset:21}]){
  await assert.rejects(run({...p,...bad}));
  assert.equal((await kernel.export('brep')).data,before);
}
kernel.dispose();
console.log(`PASS PG11804 A-piece U plate candidate: two through-holes, ${size.join('×')} mm, analytic volume ${model.stats.volume}`);
