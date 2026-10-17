import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildEllipsoid} from '../src/ellipsoid.js';
import {diagnoseSurface} from '../src/surface-repair.js';
test('exact rational ellipsoid octants are watertight and match analytic volume',async()=>{
  cad.setOC(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
  const solid=buildEllipsoid({radiiMm:[2,3,4],centerMm:[5,6,7]},cad);
  try{assert.equal(solid.faces.length,8);assert.equal(solid.solids.length,1);assert(solid.ellipsoidReport.relativeVolumeError<.005);assert.equal(diagnoseSurface(solid,cad).freeEdges,0);console.log(JSON.stringify(solid.ellipsoidReport));}finally{solid.delete();}
});
