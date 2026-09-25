import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';

test('nearest references stay on exact edges and trimmed faces, including a hole boundary',async()=>{
 const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
 try{
  await kernel.rebuild({version:2,features:[{id:'plate',op:'box',params:{width:40,depth:30,height:6},refs:[]},{id:'hole',op:'hole',params:{radius:2,depth:3,x:20,y:15,z:6,axis:'Z',direction:-1},refs:['plate']}],imports:{}});
  const edge=await kernel.nearestGeometry('hole','edge',[20,15,6],{radiusMm:2.1});
  assert.ok(edge.items.some(item=>Math.abs(item.residualMm-2)<1e-5&&Math.abs(item.worldPoint[2]-6)<1e-5));
  const face=await kernel.nearestGeometry('hole','face',[20,15,6],{radiusMm:2.1});
  assert.ok(face.items.some(item=>Math.abs(item.residualMm-2)<1e-5&&item.pointOnTrimmedFace));
  assert.ok(face.items.every(item=>item.quality==='exact-brep'&&item.residualMm<=2.1));
 }finally{kernel.dispose();}
});
