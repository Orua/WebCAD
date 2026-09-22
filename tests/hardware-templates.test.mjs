import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';

const wasm=fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url));
const kernel=new CadKernel(await init({wasmBinary:wasm}));
const f=(id,op,params={},refs=[])=>({id,op,params,refs,name:id});
const run=features=>kernel.rebuild({version:1,features,imports:{},hidden:[]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(1e-5,Math.abs(b)*1e-7),`${a} != ${b}`);
const size=b=>b.bounds.max.map((v,i)=>v-b.bounds.min[i]);

for(const kind of ['tube','counterboreTool']) {
  const model=QUICK_MODELS[kind];
  assert.ok(model.label&&model.labelEn&&model.description&&model.descriptionEn);
  for(const field of model.fields) assert.ok(field.label&&field.labelEn&&Object.hasOwn(model.defaults,field.key));
}
const tube=QUICK_MODELS.tube.defaults;
let result=await run([f('tube','quickModel',{kind:'tube',...tube})]);
assert.equal(result.stats.solids,1); size(result.bodies[0]).forEach((v,i)=>near(v,[tube.outerDiameter,tube.outerDiameter,tube.height][i]));
near(result.stats.volume,Math.PI*((tube.outerDiameter/2)**2-(tube.innerDiameter/2)**2)*tube.height);
for(const bad of [{innerDiameter:0},{innerDiameter:tube.outerDiameter},{outerDiameter:0},{height:0}]) await assert.rejects(run([f('bad','quickModel',{kind:'tube',...tube,...bad})]));

for(const style of ['bore','sink']) {
  const p={...QUICK_MODELS.counterboreTool.defaults,style}; result=await run([f('tool','quickModel',{kind:'counterboreTool',...p})]);
  assert.equal(result.stats.solids,1); size(result.bodies[0]).forEach((v,i)=>near(v,[p.headDiameter,p.headDiameter,p.depth][i]));
  const headExtra=style==='bore'?Math.PI*(p.headDiameter**2-p.holeDiameter**2)/4*p.headDepth:Math.PI*p.headDepth/12*(p.headDiameter**2+p.headDiameter*p.holeDiameter-2*p.holeDiameter**2);
  near(result.stats.volume,Math.PI*(p.holeDiameter/2)**2*p.depth+headExtra);
  const toolVolume=result.stats.volume;
  result=await run([f('plate','box',{width:30,depth:30,height:10}),f('tool','quickModel',{kind:'counterboreTool',...p}),f('placed','transform',{x:15,y:15},['tool']),f('drilled','cut',{},['plate','placed'])]);
  assert.equal(result.stats.solids,1);near(result.stats.volume,9000-toolVolume);
}
for(const bad of [{holeDiameter:0},{headDiameter:4},{headDepth:0},{headDepth:8},{style:'bad'}]) await assert.rejects(run([f('bad','quickModel',{kind:'counterboreTool',...QUICK_MODELS.counterboreTool.defaults,...bad})]));

for(const kind of ['tube','counterboreTool']) {
  await run([f('q','quickModel',{kind,...QUICK_MODELS[kind].defaults})]);
  const step=await kernel.export('step'); assert.ok(step.data.byteLength||step.data.length);
  const round=await kernel.rebuild({version:1,features:[f('i','import',{key:'s'})],imports:{s:{format:'step',data:Buffer.from(step.data).toString('base64')}},hidden:[]});
  assert.equal(round.stats.solids,1); near(round.stats.volume,(await kernel.rebuild({version:1,features:[f('q','quickModel',{kind,...QUICK_MODELS[kind].defaults})],imports:{},hidden:[]})).stats.volume);
}
kernel.dispose(); console.log('hardware template checks passed');
