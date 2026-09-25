import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const run=params=>kernel.rebuild({version:1,features:[{id:'frame',op:'quickModel',refs:[],params,name:'frame'}],imports:{},hidden:[]});
const p={kind:'sliderBuckle',section:'round',innerWidth:19.9,innerHeight:20.5,sectionSize:5.8,innerRadius:3,barDiameter:3.5,barOffset:0,gapWidth:0};
assert.ok(QUICK_MODELS.sliderBuckle.description.includes('2.5'));
const frame=await run({...p,kind:'rectBuckle'});
const baseVolume=frame.stats.volume;
const model=await run(p);
assert.equal(model.stats.solids,1);
const bounds=model.bodies[0].bounds;
const size=bounds.max.map((v,i)=>v-bounds.min[i]);
[31.5,32.1,5.8].forEach((v,i)=>assert.ok(Math.abs(size[i]-v)<1e-4,`${i}: ${size[i]}`));
assert.ok(model.stats.volume>baseVolume,'the fixed bar must add material');
const before=(await kernel.export('brep')).data;
for(const invalid of [{innerHeight:15},{barOffset:5},{barDiameter:6},{section:'square',innerHeight:20.5}]){
  await assert.rejects(run({...p,...invalid}));
  assert.equal((await kernel.export('brep')).data,before);
}
kernel.dispose();
console.log(`PASS PG3014 compact round-wire slider candidate: one solid, ${size.map(v=>v.toFixed(3)).join('×')} mm`);
