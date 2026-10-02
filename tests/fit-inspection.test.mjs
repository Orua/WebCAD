import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';

test('J5 exact interference distinguishes overlap, contact, gap, and containment without history changes',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const features=[
    {id:'a',op:'box',params:{width:10,depth:10,height:10},refs:[]},
    {id:'b',op:'box',params:{width:10,depth:10,height:10},refs:[],placement:undefined},
  ];
  try{
    const inspect=(first,second)=>{
      const before=[first,second].map(id=>kernel.shapes.get(id).serialize());
      const report=kernel.inspectFit(first,second);
      assert.deepEqual([first,second].map(id=>kernel.shapes.get(id).serialize()),before,'read-only interference must preserve exact source BREP bytes');
      return report;
    };
    const move=x=>({id:'m',op:'transform',params:{x,y:0,z:0,rx:0,ry:0,rz:0,scale:1,positionMode:'relative'},refs:['b']});
    await kernel.rebuild({version:2,features:[...features,move(9)],imports:{}});
    let result=inspect('a','m');
    assert.equal(result.classification,'overlap');assert.ok(Math.abs(result.commonVolumeMm3-100)<1e-6);
    await kernel.rebuild({version:2,features:[...features,move(10)],imports:{}});
    result=inspect('a','m');assert.equal(result.classification,'contactWithinTolerance');assert.ok(result.distanceMm<1e-6);
    await kernel.rebuild({version:2,features:[...features,move(10.2)],imports:{}});
    result=inspect('a','m');assert.equal(result.classification,'separated');assert.ok(Math.abs(result.distanceMm-0.2)<1e-6);
    await kernel.rebuild({version:2,features:[features[0],{id:'small',op:'box',params:{width:2,depth:2,height:2},refs:[]},{id:'inside',op:'transform',params:{x:2,y:2,z:2,rx:0,ry:0,rz:0,scale:1,positionMode:'relative'},refs:['small']}],imports:{}});
    result=inspect('a','inside');assert.equal(result.classification,'overlap');assert.ok(Math.abs(result.commonVolumeMm3-8)<1e-6);
    await kernel.rebuild({version:2,features:[
      {id:'ring',op:'torus',params:{majorRadius:8,minorRadius:2},refs:[]},
      {id:'rod',op:'cylinder',params:{radius:3,height:8},refs:[]},
      {id:'offsetRod',op:'transform',params:{x:7,z:-4},refs:['rod']},
    ],imports:{}});
    result=inspect('ring','offsetRod');assert.equal(result.classification,'overlap');assert(result.commonVolumeMm3>0);
    const baseline=kernel.shapes.get('ring').serialize(),history=JSON.stringify(kernel.historySignature),renderVersion=kernel.renderVersion;
    const again=inspect('ring','offsetRod');assert(Math.abs(again.commonVolumeMm3-result.commonVolumeMm3)<1e-6);
    assert.equal(kernel.shapes.get('ring').serialize(),baseline);assert.equal(JSON.stringify(kernel.historySignature),history);assert.equal(kernel.renderVersion,renderVersion);
  }finally{kernel.dispose();}
});
