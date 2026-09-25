import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const model=QUICK_MODELS.twinWindowPlate;
const run=params=>kernel.rebuild({version:1,features:[{id:'plate',op:'quickModel',params,refs:[],name:'plate'}],imports:{},hidden:[]});
assert.ok(quickModelIconKinds.includes('twinWindowPlate'));
assert.ok(model.label&&model.labelEn&&model.description&&model.descriptionEn);
for(const field of model.fields)assert.ok(Object.hasOwn(model.defaults,field.key));
const p={kind:'twinWindowPlate',...model.defaults};
const plain=await run({...p,edgeRadius:0});
assert.equal(plain.stats.solids,1);
const windowHeight=(p.totalInnerHeight-p.barWidth)/2;
const area=(w,h,r)=>w*h-(4-Math.PI)*r*r;
const expected=(area(p.outerWidth,p.outerHeight,p.outerRadius)-2*area(p.windowWidth,windowHeight,p.windowRadius))*p.thickness;
assert.ok(Math.abs(plain.stats.volume-expected)<1e-5,`${plain.stats.volume} != ${expected}`);
const rounded=await run(p);
assert.equal(rounded.stats.solids,1);
assert.ok(rounded.stats.volume>0&&rounded.stats.volume<plain.stats.volume);
// Independent text-to-cad STEP readback from the same nominal DWG parameters.
assert.ok(Math.abs(rounded.stats.volume-1994.3859402226874)<1e-3);
rounded.bodies[0].bounds.max.map((v,i)=>v-rounded.bodies[0].bounds.min[i]).forEach((v,i)=>assert.ok(Math.abs(v-[44.8,26.6,3.5][i])<1e-5));
const before=(await kernel.export('brep')).data;
for(const bad of [{barWidth:19.6},{windowWidth:44.8},{windowRadius:4.1},{edgeRadius:1.8},{outerRadius:14}]){
  await assert.rejects(run({...p,...bad}));
  assert.equal((await kernel.export('brep')).data,before);
}
kernel.dispose();
console.log(`PASS PG6217 nominal twin-window plate: analytic unrounded volume, rounded solid ${rounded.stats.volume.toFixed(6)} mm3, envelope and rollback`);
