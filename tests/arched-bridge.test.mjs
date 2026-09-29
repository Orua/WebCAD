import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const run=params=>kernel.rebuild({version:1,features:[{id:'bridge',op:'quickModel',refs:[],params,name:'bridge'}],imports:{},hidden:[]});
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-5,`${label}: ${actual}`);

assert.ok(quickModelIconKinds.includes('archedBridge'));
const withHoles=await run({kind:'archedBridge',...QUICK_MODELS.archedBridge.defaults});
assert.equal(withHoles.stats.solids,1);
assert.equal(withHoles.bodies[0].solidCount,1);
assert.equal(withHoles.bodies[0].shellCount,1);
const size=withHoles.bodies[0].bounds.max.map((value,index)=>value-withHoles.bodies[0].bounds.min[index]);
size.forEach((value,index)=>near(value,[11.3,7.5,3.3][index],`PG14749 size ${index}`));

const solidEnds=await run({kind:'archedBridge',...QUICK_MODELS.archedBridge.defaults,holeDiameterMm:0,holeDepthMm:0});
assert.equal(solidEnds.stats.solids,1);
assert.ok(solidEnds.bodies[0].volume>withHoles.bodies[0].volume);
await assert.rejects(run({kind:'archedBridge',...QUICK_MODELS.archedBridge.defaults,outerWidthMm:6}));

kernel.dispose();
console.log('PASS archedBridge: source-sized U bridge, optional paired end holes and bounded invalid input');
