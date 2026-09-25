import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {getOperation,normalizeOperationParams} from '../src/operation-registry.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const feature=(id,op,params,refs=[])=>({id,op,params,refs,name:id});
const plate=feature('plate','box',{width:40,depth:20,height:3});
const run=features=>kernel.rebuild({version:1,features,imports:{},hidden:[]});
const params={radius:2,height:3,axis:'Z',direction:1,points:[[10,10,3],[30,10,3]]};
const expected=2400+2*Math.PI*4*3;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} != ${b}`);

assert.equal(getOperation('multiBoss').strictContract,true);
assert.deepEqual(normalizeOperationParams('multiBoss',params),params);
assert.throws(()=>normalizeOperationParams('multiBoss',{...params,radius:0}),{code:'PARAM_RANGE_INVALID'});
assert.throws(()=>normalizeOperationParams('multiBoss',{...params,points:[[10,10]]}),{code:'PARAM_RANGE_INVALID'});

const top=await run([plate,feature('boss','multiBoss',params,['plate'])]);
near(top.stats.volume,expected);assert.equal(top.stats.solids,1);
const before=(await kernel.export('brep')).data;
for(const bad of [
  {...params,points:[[10,10,3],[100,10,3]]},
  {...params,points:[[10,10,3],[10,10,3]]},
  {...params,direction:-1},
]){
  await assert.rejects(run([plate,feature('bad','multiBoss',bad,['plate'])]));
  assert.equal((await kernel.export('brep')).data,before);
}

for(const [axis,point] of [['X',[40,10,1.5]],['Y',[20,20,1.5]],['Z',[20,10,3]]]){
  const side=await run([plate,feature('side','multiBoss',{radius:1,height:2,axis,direction:1,points:[point]},['plate'])]);
  near(side.stats.volume,2400+2*Math.PI);
}

const edited=await run([plate,feature('boss','multiBoss',{...params,height:4},['plate'])]);
near(edited.stats.volume,2400+2*Math.PI*4*4);
console.log('multiBoss strict contract, exact B-Rep volume, atomic failure and history edit passed');
