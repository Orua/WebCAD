import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const model=QUICK_MODELS.ellipseOpenWire;
assert.ok(quickModelIconKinds.includes('ellipseOpenWire'));
assert.ok(model.label&&model.labelEn&&model.description&&model.descriptionEn);
for(const field of model.fields)assert.ok(Object.hasOwn(model.defaults,field.key));
const run=params=>kernel.rebuild({version:1,features:[{id:'open',op:'quickModel',params,refs:[],name:'open'}],imports:{},hidden:[]});
const input={kind:'ellipseOpenWire',innerWidth:15,innerHeight:20,sectionSize:3.5,gapWidth:0.2};
const result=await run(input);
assert.equal(result.stats.solids,1);
// Independent text-to-cad STEP used adaptive integration and read 635.5139
// mm³. Replicad's default non-adaptive value for this WebCAD solid is
// 634.3985 mm³, so this check catches a misleading but plausible result.
assert.ok(Math.abs(result.stats.volume-635.5139)<0.05,`adaptive volume ${result.stats.volume}`);
assert.ok(Math.abs(kernel.measure(result.bodies[0].id).volume-result.stats.volume)<1e-6);
const bounds=result.bodies[0].bounds,size=bounds.max.map((v,i)=>v-bounds.min[i]);
assert.ok(Math.abs(size[0]-22)<1e-3,`width ${size[0]}`);
assert.ok(Math.abs(size[1]-27)<1e-3,`height ${size[1]}`);
assert.ok(Math.abs(size[2]-3.5)<1e-3,`depth ${size[2]}`);
const faces=kernel.activeShape(result.bodies[0].id).faces,caps=[];
for(const face of faces){
  const box=face.boundingBox;
  try{const [min,max]=box.bounds;if(max[0]-min[0]<1e-5&&max[1]<0)caps.push((min[0]+max[0])/2);}
  finally{box.delete();face.delete();}
}
caps.sort((a,b)=>a-b);
assert.equal(caps.length,2,`bottom flat cap count ${caps.length}`);
assert.ok(Math.abs(caps[0]+0.1)<1e-5&&Math.abs(caps[1]-0.1)<1e-5,`gap caps ${caps}`);
const before=(await kernel.export('brep')).data;
for(const bad of [{innerWidth:0},{innerHeight:15},{sectionSize:4},{gapWidth:0},{gapWidth:3.5},{gapWidth:NaN}]){
  await assert.rejects(run({...input,...bad}));
  assert.equal((await kernel.export('brep')).data,before);
}
kernel.dispose();
console.log(`PASS PG11580 inner-ellipse open wire: one solid, ${size.map(v=>v.toFixed(6)).join('×')} mm, actual 0.2 mm parallel gap, invalid input rollback`);
