import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {readDocs} from '../src/page-api-docs.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const run=params=>kernel.rebuild({version:1,features:[{id:'compact',op:'quickModel',refs:[],params,name:'compact'}],imports:{},hidden:[]});
const source={kind:'rectBuckle',section:'round',innerWidth:10,innerHeight:25,sectionSize:3.5,innerRadius:0.9,gapWidth:0};
assert.ok(QUICK_MODELS.rectBuckle.description.includes('2.5'));
const result=await run(source);
assert.equal(result.stats.solids,1);
const bounds=result.bodies[0].bounds;
const size=bounds.max.map((v,i)=>v-bounds.min[i]);
[17,32,3.5].forEach((value,i)=>assert.ok(Math.abs(size[i]-value)<1e-5,`${i}: ${size[i]}`));
assert.ok(result.stats.volume>0);
const before=(await kernel.export('brep')).data;
for(const invalid of [
  {...source,innerWidth:8.7},
  {...source,gapWidth:0.2},
  {...source,section:'square'},
  {...source,kind:'sliderBuckle',barDiameter:2,barOffset:20},
]){
  await assert.rejects(run(invalid));
  assert.equal((await kernel.export('brep')).data,before);
}
const pg7440={kind:'rectBuckle',section:'round',innerWidth:25,innerHeight:15,innerRadius:0.5,sectionSize:4,gapWidth:0};
const sourceCase=await run(pg7440);
assert.equal(sourceCase.stats.solids,1);
const sourceSize=sourceCase.bodies[0].bounds.max.map((v,i)=>v-sourceCase.bodies[0].bounds.min[i]);
[33,23,4].forEach((value,i)=>assert.ok(Math.abs(sourceSize[i]-value)<1e-5,`${i}: ${sourceSize[i]}`));
const sourceVolume=Math.PI*2**2*(76+5*Math.PI);
assert.ok(Math.abs(sourceCase.stats.volume-sourceVolume)<1e-4);
assert.match(readDocs({docId:'recipes.source-round-rect'}).text,/PG7440/);
kernel.dispose();
console.log('PASS PG10251 and PG7440 round-wire frames: source dimensions, volume and guards');
