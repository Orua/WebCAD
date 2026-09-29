import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildRounding} from '../src/modeling/rounding/index.js';
import {topologyDetails} from '../src/modeling/rounding/topology.js';
import {measureBlendSectionRadius} from './helpers/rounding-section-metrics.mjs';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=value=>{try{value?.delete?.();}catch{}};

test('real WASM section verifier reads the generated blend face at multiple positions',()=>{
  const source=cad.makeBox([0,0,0],[20,10,8]),initialVolume=cad.measureVolume(source);
  let result;
  try{
    const row=topologyDetails(source).find(edge=>Math.abs(edge.endPoint[0]-edge.startPoint[0])>19&&Math.abs(edge.midpoint[1])<1e-7&&Math.abs(edge.midpoint[2])<1e-7);
    result=buildRounding(source,{specVersion:1,mode:'constant',scope:{kind:'edges',edgeIds:[row.edgeId]},propagation:'selected-only',radiusMm:1,boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}});
    for(const x of [2,10,18]){
      const metric=measureBlendSectionRadius(result,{plane:'YZ',offset:x},cad);
      assert.equal(metric.blendFaceType,'CYLINDRE');
      assert(Math.abs(metric.radiusMm-1)<1e-5,`section x=${x}: R=${metric.radiusMm}`);
      assert(metric.sectionFitResidualMm<1e-5,`section x=${x} fit residual=${metric.sectionFitResidualMm}`);
      assert(metric.planeResidualMm<1e-5);
    }
    assert(Math.abs(cad.measureVolume(source)-initialVolume)<1e-9,'source unchanged');
  }finally{dispose(result);dispose(source);}
});
