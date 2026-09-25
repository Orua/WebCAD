import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const f=(id,params)=>({id,op:'quickModel',params,refs:[],name:id});
const run=features=>kernel.rebuild({version:1,features,imports:{},hidden:[]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);

assert.ok(quickModelIconKinds.includes('ringBar'));
const definition=QUICK_MODELS.ringBar;
assert.ok(definition.label&&definition.labelEn&&definition.description&&definition.descriptionEn);
for(const field of definition.fields)assert.ok(Object.hasOwn(definition.defaults,field.key));

for(const section of ['round','square'])for(const offset of [0,2]){
  const p={kind:'ringBar',...definition.defaults,section,barOffset:offset};
  const result=await run([f('ringBar',p)]);
  assert.equal(result.stats.solids,1);
  const size=result.bodies[0].bounds.max.map((v,i)=>v-result.bodies[0].bounds.min[i]);
  near(size[0],p.innerDiameter+2*p.sectionSize);
  near(size[1],p.innerDiameter+2*p.sectionSize);
  near(size[2],p.sectionSize);
  const ring=await run([f('ring',{...p,kind:'ring',gapWidth:0})]);
  assert.ok(result.stats.volume>ring.stats.volume);
}

// Source side views put the bar axis 4 mm behind the ring midplane. The
// nominal connected envelope does not certify the source's R1.5 joint.
for(const [id,innerDiameter] of [['PG10225',21],['PG10226',26]]){
  const p={kind:'ringBar',section:'round',innerDiameter,sectionSize:5,barDiameter:5,barOffset:0,barDepthOffset:4};
  const result=await run([f(id,p)]);
  assert.equal(result.stats.solids,1);
  const size=result.bodies[0].bounds.max.map((v,i)=>v-result.bodies[0].bounds.min[i]);
  [innerDiameter+10,innerDiameter+10,9].forEach((value,i)=>near(size[i],value));
}
const before=(await kernel.export('brep')).data;
for(const bad of [{barDiameter:0},{barDiameter:4},{barOffset:10},{barDepthOffset:5},{innerDiameter:4},{gapWidth:0.5}]){
  await assert.rejects(run([f('bad',{kind:'ringBar',...definition.defaults,...bad})]));
  assert.equal((await kernel.export('brep')).data,before);
}
// PG5641 source drawing: OD 10, ID 7, side thickness 1.8 mm.
const washer=await run([f('PG5641',{kind:'washer',innerDiameter:7,sectionSize:1.5,innerHeight:1.8})]);
assert.equal(washer.stats.solids,1);
near(washer.stats.volume,Math.PI*(5**2-3.5**2)*1.8);
washer.bodies[0].bounds.max.map((v,i)=>v-washer.bodies[0].bounds.min[i]).forEach((value,i)=>near(value,[10,10,1.8][i]));
// PG8017: independently dimensioned front contours. Thickness is a 1 mm trial,
// because the reviewed source side view shows a rounded cross-section instead.
const frame=await run([f('PG8017',{kind:'flatFrame',outerWidth:58,outerHeight:28,innerWidth:50,innerHeight:20,outerRadius:5,innerRadius:1.5,thickness:1})]);
assert.equal(frame.stats.solids,1);
frame.bodies[0].bounds.max.map((v,i)=>v-frame.bodies[0].bounds.min[i]).forEach((value,i)=>near(value,[58,28,1][i]));
// PG3195 shows a 46.2 x 25.6 outer capsule and 35.2 x 14.6 inner capsule.
// A 6 mm extrusion verifies the frontal outline and depth envelope only.
const capsule=await run([f('PG3195',{kind:'flatFrame',outerWidth:46.2,outerHeight:25.6,innerWidth:35.2,innerHeight:14.6,outerRadius:12.8,innerRadius:7.3,thickness:6})]);
assert.equal(capsule.stats.solids,1);
capsule.bodies[0].bounds.max.map((v,i)=>v-capsule.bodies[0].bounds.min[i]).forEach((value,i)=>near(value,[46.2,25.6,6][i]));
console.log('PASS DWG ring crossbar template: Y/Z offsets, connected nominal envelopes and rollback');
console.log('PASS DWG category trials: PG5641 washer; PG8017 and PG3195 front contours');
