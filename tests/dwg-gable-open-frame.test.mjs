import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const p={...QUICK_MODELS.gableOpenFrame.defaults,kind:'gableOpenFrame'};
const run=async params=>kernel.rebuild({version:1,features:[{id:'gable',op:'quickModel',refs:[],params:{...p,...params}}],imports:{},hidden:[]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);

assert.ok(quickModelIconKinds.includes('gableOpenFrame'));
const result=await run({});
assert.equal(result.stats.solids,1);
result.bodies[0].bounds.max.forEach((v,i)=>near(v-result.bodies[0].bounds.min[i],[25,16,4][i]));
const band=(p.outerWidth-p.innerWidth)/2,r=p.endRadius;
const baseline=p.outerWidth*(p.outerShoulderHeight-r)+p.outerWidth*(p.outerPeakHeight-p.outerShoulderHeight)/2-p.innerWidth*(p.innerShoulderHeight-r)-p.innerWidth*(p.innerPeakHeight-p.innerShoulderHeight)/2;
near(result.stats.volume,(baseline+2*((band-2*r)*r+Math.PI*r*r/2))*p.thickness);
for(const bad of [{outerWidth:19},{endRadius:1.3},{innerPeakHeight:17},{innerShoulderHeight:13.3},{outerShoulderHeight:0.5}])await assert.rejects(run(bad));
console.log('PASS open gable frame dimensions, round leg ends, analytic volume and guards');
