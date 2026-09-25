import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const p={...QUICK_MODELS.dFlatFrame.defaults,kind:'dFlatFrame'};
const run=async params=>kernel.rebuild({version:1,features:[{id:'d',op:'quickModel',refs:[],params:{...p,...params}}],imports:{},hidden:[]});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);
const dArea=(width,height,bottomR)=>width*(height-width/2)+Math.PI*width**2/8-2*bottomR**2*(1-Math.PI/4);

assert.ok(quickModelIconKinds.includes('dFlatFrame'));
const closed=await run({gapWidth:0});
assert.equal(closed.stats.solids,1);
closed.bodies[0].bounds.max.forEach((v,i)=>near(v-closed.bodies[0].bounds.min[i],[28,25,4][i]));
near(closed.stats.volume,(dArea(28,25,3.5)-dArea(20,17,2))*4);
const opened=await run({gapWidth:1});
assert.equal(opened.stats.solids,1);
near(closed.stats.volume-opened.stats.volume,1*4*4);
for(const bad of [{outerBottomRadius:14},{innerBottomRadius:10},{innerHeight:11},{gapWidth:16},{innerWidth:29}]){
  await assert.rejects(run(bad));
}
console.log('PASS flat D frame independent bottom radii, measured gap, one valid solid and guards');
