// 261024-v2 kernel: preferMillFallback must hit mill+boolean path.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildEdgeBlend} from '../src/edge-blend.js';
import {topologyDetails} from '../src/smooth-transition.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);

test('v2 preferMillFallback forces mill+boolean path even when native would run',()=>{
 const s=cad.makeBox([0,0,0],[10,8,4]);
 try{
  const edge=topologyDetails(s).find(e=>e.sharp);
  assert(edge);
  const out=buildEdgeBlend(s,'fillet',{radius:.3,edgeIds:[edge.edgeId],preferMillFallback:true});
  try{
   assert.equal(out.blendReport.strategy,'mill-complementary-r-fallback');
   assert.equal(out.blendReport.nativeFailure,'preferMillFallback');
   assert.ok(Array.isArray(out.blendReport.millReports));
   assert.ok(cad.measureVolume(out)<cad.measureVolume(s));
  }finally{out.delete();}
 }finally{s.delete();}
});
