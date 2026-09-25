import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {readDocs} from '../src/page-api-docs.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
assert.ok(QUICK_MODELS.washer.fields.some(field=>field.key==='sectionSize'));
assert.match(readDocs({docId:'recipes.flat-washer'}).text,/径向壁宽/);
const run=(id,params)=>kernel.rebuild({version:1,features:[{id,op:'quickModel',params,refs:[],name:id}],imports:{},hidden:[]});
for(const p of [
  {id:'PG1797',innerDiameter:36.2,sectionSize:7,innerHeight:3.2,stepVolume:3040.056379025838},
  {id:'PG0203',innerDiameter:25,sectionSize:4.4,innerHeight:3.8,stepVolume:1544.306417539861},
]){
  const result=await run(p.id,{kind:'washer',innerDiameter:p.innerDiameter,sectionSize:p.sectionSize,innerHeight:p.innerHeight});
  assert.equal(result.stats.solids,1);
  const bounds=result.bodies[0].bounds;
  const size=bounds.max.map((v,i)=>v-bounds.min[i]);
  [p.innerDiameter+2*p.sectionSize,p.innerDiameter+2*p.sectionSize,p.innerHeight].forEach((n,i)=>assert.ok(Math.abs(size[i]-n)<1e-6,`${p.id} bound ${i}: ${size[i]}`));
  const analytic=Math.PI/4*((p.innerDiameter+2*p.sectionSize)**2-p.innerDiameter**2)*p.innerHeight;
  assert.ok(Math.abs(result.stats.volume-analytic)<1e-5,`${p.id} analytic volume`);
  assert.ok(Math.abs(result.stats.volume-p.stepVolume)<1e-5,`${p.id} independent STEP volume`);
}
const before=(await kernel.export('brep')).data;
for(const bad of [{innerDiameter:0},{sectionSize:0},{innerHeight:0},{innerDiameter:NaN}]){
  await assert.rejects(run('invalid',{kind:'washer',innerDiameter:25,sectionSize:4.4,innerHeight:3.8,...bad}));
  assert.equal((await kernel.export('brep')).data,before);
}
kernel.dispose();
console.log('PASS PG1797 and PG0203 flat washers: nominal bounds, analytical and independent STEP volumes, invalid rollback');
