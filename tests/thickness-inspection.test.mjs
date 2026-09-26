import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';

test('point-direction thickness follows the first continuous material interval',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  try{
    await kernel.rebuild({version:2,features:[{id:'box',op:'box',params:{width:10,depth:10,height:6},refs:[]}],imports:{}});
    const result=kernel.inspectThickness({bodyId:'box',point:[5,5,0],direction:[0,0,1]});
    assert.ok(Math.abs(result.thicknessMm-6)<1e-7);assert.deepEqual(result.exitPoint,[5,5,6]);
    const faces=(await kernel.queryGeometry('box','face',{})).items,bottom=faces.find(face=>Math.abs(face.center[2])<1e-8),top=faces.find(face=>Math.abs(face.center[2]-6)<1e-8);
    const between=kernel.inspectThickness({bodyId:'box',mode:'faces',faceAId:bottom.faceId,faceBId:top.faceId,point:[5,5,0]});
    assert.ok(Math.abs(between.thicknessMm-6)<1e-7);
    assert.throws(()=>kernel.inspectThickness({bodyId:'box',point:[5,5,0],direction:[0,0,-1]}),/未进入/);
    assert.throws(()=>kernel.inspectThickness({bodyId:'box',point:[5,5,-1],direction:[0,0,1]}),/真实边界/);
  }finally{kernel.dispose();}
});
