import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const p={...QUICK_MODELS.ellipseSectionRectFrame.defaults,kind:'ellipseSectionRectFrame'};
const run=async params=>kernel.rebuild({version:1,features:[{id:'frame',op:'quickModel',refs:[],params:{...p,...params}}],imports:{},hidden:[]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);

assert.ok(quickModelIconKinds.includes('ellipseSectionRectFrame'));
for(const depth of [6,5]){
  const result=await run({sectionDepth:depth});
  assert.equal(result.stats.solids,1);
  result.bodies[0].bounds.max.forEach((v,i)=>near(v-result.bodies[0].bounds.min[i],[36,30,depth][i]));
  const corner=p.innerRadius+p.sectionWidth/2;
  const centerline=2*(p.innerWidth+p.innerHeight+2*p.sectionWidth)-8*corner+2*Math.PI*corner;
  near(result.stats.volume,centerline*Math.PI*p.sectionWidth*depth/4);
}
for(const bad of [{sectionWidth:6,sectionDepth:6},{sectionWidth:0},{innerHeight:10},{innerRadius:10},{innerWidth:201}])await assert.rejects(run(bad));
console.log('PASS elliptical section rectangular frame dimensions, analytic volume and guards');
