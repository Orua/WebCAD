import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {QUICK_MODELS,buildQuickModel} from '../src/quick-models.js';
import {QUICK_HIDDEN_KINDS} from '../src/quick-models/presentation.js';
import {buildSmoothTransition} from '../src/smooth-transition.js';
import {createQuickModelUsage} from '../src/quick-model-usage.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
cad.setOC(oc);
const dispose=value=>{try{value?.delete?.();}catch{}};

test('every registered quick model, including hidden kinds, builds and records without throwing',()=>{
  const usage=createQuickModelUsage();
  const kinds=Object.keys(QUICK_MODELS);
  assert.ok(QUICK_HIDDEN_KINDS.every(kind=>kinds.includes(kind)));
  for(const kind of kinds){
    const shape=buildQuickModel({kind,...QUICK_MODELS[kind].defaults},cad,{oc,roundAll:(body,radius)=>buildSmoothTransition(body,{radius,allEdges:true})});
    const solids=shape.solids,check=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false);
    try{
      assert.equal(check.IsValid(),true,kind);
      assert.ok(solids.length>=1,kind);
      assert.ok(cad.measureVolume(shape)>1e-9,kind);
      assert.doesNotThrow(()=>usage.record(kind),kind);
    }finally{dispose(check);solids.forEach(dispose);dispose(shape);}
  }
  for(const kind of QUICK_HIDDEN_KINDS)assert.equal(usage.get().counts[kind],undefined);
});
