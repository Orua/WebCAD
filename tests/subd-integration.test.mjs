import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {SUBD_EXAMPLE} from '../src/subd-contract.js';
import {applySubdBrushes} from '../src/subd-brushes.js';
import {normalizeOperationParams} from '../src/operation-registry.js';
test('SubD brush replay is immutable and registered BRep exports through the shared kernel',async()=>{
  const before=structuredClone(SUBD_EXAMPLE.cage),brushes=[{centerMm:[0,0,10],radiusMm:20,strength:.2,mode:'inflate'}],changed=applySubdBrushes(before,brushes);
  assert.deepEqual(before,SUBD_EXAMPLE.cage);assert(changed.vertices.some((v,i)=>v[2]>before.vertices[i][2]));assert.deepEqual(changed,applySubdBrushes(before,brushes));
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc),params={...structuredClone(SUBD_EXAMPLE),brushes};
  try{
    normalizeOperationParams('subdBody',params);const result=await kernel.rebuild({version:2,features:[{id:'subd',op:'subdBody',params,refs:[]}],imports:{}});
    assert.equal(result.bodies[0].solidCount,1);assert(result.bodies[0].subdApproximation.volumeRelativeError<.02);const step=await kernel.export('step'),text=typeof step.data==='string'?step.data:new TextDecoder().decode(step.data);assert(text.includes('ISO-10303-21'));console.log(JSON.stringify(result.bodies[0].subdApproximation));
  }finally{kernel.dispose();}
});
