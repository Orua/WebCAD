import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {initializeFaceOrigins,originSignatures,restoreFaceOrigins} from '../src/modeling/face-origins.js';
test('geometry labels survive serialization rounding and reject ambiguous matches',async()=>{
  cad.setOC(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
  const source=cad.makeBox([0,0,0],[10,8,6]),target=cad.deserializeShape(source.serialize());
  try{
    initializeFaceOrigins(source,{id:'base'});const signatures=originSignatures(source).map(row=>({...row,key:JSON.stringify(JSON.parse(row.key).map(v=>typeof v==='number'?v+1e-7:v))}));
    restoreFaceOrigins(target,signatures);assert.equal(target.faceOrigins.filter(row=>row?.featureId==='base').length,6);
    restoreFaceOrigins(target,[...signatures,{...signatures[0],origin:{featureId:'ambiguous'}}]);assert.equal(target.faceOrigins[0],null);
  }finally{source.delete();target.delete();}
});
