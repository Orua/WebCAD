import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {normalizeOperationParams} from '../src/operation-registry.js';

test('strict primitive normalization preserves legacy geometry, cone defaults and equal-radius cylinders',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
  const kernel=new CadKernel(oc);kernel.quality='draft';
  const cases=[
    ['cylinder',{radius:2,height:7},28*Math.PI,[4,4,7],36*Math.PI],
    ['sphere',{radius:2},32*Math.PI/3,[4,4,4],16*Math.PI],
    ['cone',{height:9},300*Math.PI,[20,20,9],10*Math.PI*(10+Math.sqrt(181))],
    ['cone',{radius1:2,radius2:4,height:6},56*Math.PI,[8,8,6],Math.PI*(20+6*Math.sqrt(40))],
    ['cone',{radius1:3,radius2:3,height:5},45*Math.PI,[6,6,5],48*Math.PI],
    ['torus',{majorRadius:8,minorRadius:1.5},36*Math.PI**2,[19,19,3],48*Math.PI**2],
  ];
  const near=(a,b)=>assert(Math.abs(a-b)<=Math.max(1e-5,Math.abs(b)*1e-7),`${a} != ${b}`);
  try{
    for(const [op,params,volume,size,area] of cases){
      const doc=p=>({version:1,features:[{id:'primitive',op,params:p,refs:[]}],imports:{}});
      await kernel.rebuild(doc(params));const before=kernel.measure('primitive');
      const normalized=normalizeOperationParams(op,params);
      const result=await kernel.rebuild(doc(normalized)),after=kernel.measure('primitive');
      near(before.volume,volume);near(after.volume,volume);assert.equal(after.solidCount,1);
      near(before.area,area);near(after.area,area);near(result.bodies[0].area,area);
      for(let i=0;i<3;i++){near(after.bounds.max[i]-after.bounds.min[i],size[i]);near(before.bounds.min[i],after.bounds.min[i]);near(before.bounds.max[i],after.bounds.max[i]);}
      assert(result.bodies[0].indices.length>0,'valid exact geometry also produces a render mesh');
      const replay=await kernel.rebuild(JSON.parse(JSON.stringify(doc(normalized))));
      near(replay.bodies[0].volume,volume);
      const originalBytes=kernel.shapes.get('primitive').serialize();kernel.measure('primitive');
      assert.equal(kernel.shapes.get('primitive').serialize(),originalBytes,'area and volume measurement preserve source bytes');
    }
    const plate=await kernel.rebuild({version:1,features:[
      {id:'plate',op:'box',params:{width:20,depth:10,height:3},refs:[]},
      {id:'bored',op:'hole',params:{radius:2,depth:5,x:10,y:5,z:-1,axis:'Z',direction:1},refs:['plate']},
    ],imports:{}});
    const report=kernel.measure('bored');
    near(report.area,580+4*Math.PI);near(plate.bodies[0].area,report.area);
    near(report.volume,600-12*Math.PI);
  }finally{kernel.dispose();}
});
