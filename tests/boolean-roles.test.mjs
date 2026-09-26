import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';

test('explicit Boolean target can preserve or consume its tool',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const base=[{id:'target',op:'box',params:{width:10,depth:10,height:10},refs:[]},{id:'tool',op:'box',params:{width:10,depth:10,height:10},refs:[]},{id:'placedTool',op:'transform',params:{x:9,y:0,z:0,positionMode:'relative',rx:0,ry:0,rz:0,scale:1},refs:['tool']}];
  try{
    let result=await kernel.rebuild({version:2,features:[...base,{id:'result',op:'cut',params:{keepTools:true},refs:['target','placedTool']}],imports:{}});
    assert.deepEqual(result.bodies.map(body=>body.id),['placedTool','result']);
    assert.ok(Math.abs(result.bodies.find(body=>body.id==='result').volume-900)<1e-6);
    result=await kernel.rebuild({version:2,features:[...base,{id:'result',op:'cut',params:{keepTools:false},refs:['target','placedTool']}],imports:{}});
    assert.deepEqual(result.bodies.map(body=>body.id),['result']);
  }finally{kernel.dispose();}
});
