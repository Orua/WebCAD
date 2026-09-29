import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const run=params=>kernel.rebuild({version:1,features:[{id:'core',op:'quickModel',refs:[],params,name:'core'}],imports:{},hidden:[]});
const size=body=>body.bounds.max.map((value,index)=>value-body.bounds.min[index]);
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-5,`${label}: ${actual}`);

assert.ok(quickModelIconKinds.includes('buckleTongue'));
const tongue=await run({kind:'buckleTongue',...QUICK_MODELS.buckleTongue.defaults});
assert.equal(tongue.stats.solids,1);
assert.equal(tongue.bodies[0].solidCount,1);
assert.equal(tongue.bodies[0].shellCount,1);

assert.ok(quickModelIconKinds.includes('pullCoreBar'));
for(const field of QUICK_MODELS.pullCoreBar.fields)assert.ok(Object.hasOwn(QUICK_MODELS.pullCoreBar.defaults,field.key));

const pg11552Params={kind:'pullCoreBar',...QUICK_MODELS.pullCoreBar.defaults};
const pg11552=await run(pg11552Params);
assert.equal(pg11552.stats.solids,1);
size(pg11552.bodies[0]).forEach((value,index)=>near(value,[54.4,3.2,8.9][index],`PG11552 size ${index}`));
assert.equal(pg11552.bodies[0].solidCount,1);
assert.equal(pg11552.bodies[0].shellCount,1);

const pg14487Params={kind:'pullCoreBar',eyePitchMm:43.2,eyeInnerDiameterMm:5.2,widthMm:4,eyeWallMm:1.6,barThicknessMm:1.6,barCenterHeightMm:.2,outerTransitionRadiusMm:14,innerTransitionRadiusMm:15.6,tailLengthMm:4.62,tailAngleDeg:27.5};
const pg14487=await run(pg14487Params);
assert.equal(pg14487.stats.solids,1);
size(pg14487.bodies[0]).forEach((value,index)=>near(value,[51.6,4,8.4][index],`PG14487 size ${index}`));

const before=(await kernel.export('brep')).data;
for(const bad of [{eyePitchMm:8},{eyeInnerDiameterMm:0},{widthMm:0},{eyeWallMm:0},{barThicknessMm:0},{barCenterHeightMm:50},{outerTransitionRadiusMm:0},{innerTransitionRadiusMm:0},{tailLengthMm:0},{tailAngleDeg:61},{unknown:1}]){
  await assert.rejects(run({...pg11552Params,...bad}));
  assert.equal((await kernel.export('brep')).data,before);
}

kernel.dispose();
console.log('PASS buckleTongue and pullCoreBar: valid independent solids, two source-sized open-eye cores, bounded invalid-input rollback');
