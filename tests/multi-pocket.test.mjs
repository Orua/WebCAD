import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {getOperation,normalizeOperationParams} from '../src/operation-registry.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const feature=(id,op,params,refs=[])=>({id,op,params,refs,name:id});
const plate=feature('plate','box',{width:40,depth:20,height:3});
const run=features=>kernel.rebuild({version:1,features,imports:{},hidden:[]});
const pockets=[{x:10,y:10,z:3,width:6,height:4},{x:25,y:10,z:3,width:6,height:4,cornerRadius:0.5}];
const params={depth:0.5,direction:-1,pockets};

const card=getOperation('multiPocket');
assert.equal(card.strictContract,true);
assert.equal(card.refsSchema.minItems,1);
assert.deepEqual(normalizeOperationParams('multiPocket',params),{axis:'Z',...params});
assert.throws(()=>normalizeOperationParams('multiPocket',{...params,pockets:[{...pockets[0],width:-1}]}),{code:'PARAM_RANGE_INVALID'});
assert.throws(()=>normalizeOperationParams('multiPocket',{...params,pockets:[{...pockets[0],through:true}]}),{code:'PARAM_SCHEMA_INVALID'});

const result=await run([plate,feature('recess','multiPocket',params,['plate'])]);
const removed=0.5*(24+24-(4-Math.PI)*0.5**2);
assert.ok(Math.abs(result.stats.volume-(2400-removed))<1e-4);
assert.equal(result.stats.solids,1);

for(const [axis,center] of [['X',[40,10,1.5]],['Y',[20,20,1.5]],['Z',[20,10,3]]]){
  const side=await run([plate,feature('side','multiPocket',{depth:0.5,axis,direction:-1,pockets:[{x:center[0],y:center[1],z:center[2],width:axis==='Y'?2:6,height:axis==='Y'?6:2,cornerRadius:0.5}]},['plate'])]);
  assert.ok(Math.abs(side.stats.volume-(2400-0.5*(12-(4-Math.PI)*0.25)))<1e-4,`${axis} pocket volume ${side.stats.volume}`);
}
await run([plate,feature('recess','multiPocket',params,['plate'])]);

const before=(await kernel.export('brep')).data;
for(const bad of [
  {...params,pockets:[...pockets,{x:100,y:10,z:3,width:4,height:4}]},
  {...params,pockets:[{...pockets[0],cornerRadius:2}]},
  {...params,direction:1},
]){
  await assert.rejects(run([plate,feature('bad','multiPocket',bad,['plate'])]),bad.pockets.length>2?{code:'NO_MATERIAL_REMOVED'}:undefined);
  assert.equal((await kernel.export('brep')).data,before);
}

const edited=await run([plate,feature('recess','multiPocket',{...params,depth:1},['plate'])]);
assert.ok(Math.abs(edited.stats.volume-(2400-removed*2))<1e-4);
console.log('multiPocket strict contract, exact B-Rep volume, atomic failure and historical rebuild passed');
