import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPrintabilityMesh} from '../src/dfam-inspection.js';

test('elevated underside is counted, build-plate underside is excluded, and orientation changes the result',()=>{
  const body={id:'roof',positions:new Float32Array([
    0,0,5, 2,0,5, 2,2,5, 0,2,5,
    0,0,0, 2,0,0, 2,2,0, 0,2,0,
  ]),indices:new Uint32Array([
    0,2,1, 0,3,2, // elevated downward roof, 4 mm²
    4,6,5, 4,7,6, // downward face on the build plate
  ]),bounds:{min:[0,0,0],max:[2,2,5]},solidCount:1,volume:20};
  const report=inspectPrintabilityMesh(body,45);
  assert.equal(report.currentOrientation.overhangAreaMm2,4);
  assert.equal(report.currentOrientation.overhangPercent,50);
  assert.equal(report.currentOrientation.supportPrismMm3,20);
  assert.equal(report.orientations.length,6);
  assert.equal(report.orientations[1].overhangAreaMm2,0);
  assert.equal(report.geometry.exactVolumeMm3,20);
});

test('invalid angle and mesh indices are rejected',()=>{
  const body={id:'bad',positions:new Float32Array([0,0,0]),indices:new Uint32Array([0,1,2]),bounds:{min:[0,0,0],max:[1,1,1]}};
  assert.throws(()=>inspectPrintabilityMesh(body,90),{code:'PARAM_RANGE_INVALID'});
  assert.throws(()=>inspectPrintabilityMesh(body,45),{code:'CAPABILITY_UNAVAILABLE'});
});
