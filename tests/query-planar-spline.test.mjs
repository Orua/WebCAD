import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import { buildFittedSurface } from '../src/fitted-surface.js';
import { queryShapeGeometry } from '../src/geometry-query.js';

const oc = await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
cad.setOC(oc);
for (const curved of [false,true]) {
  const points = Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>[i*5,j*5,curved ? i*j*.3 : 3]));
  const shape=buildFittedSurface({points,tolerance:1e-5},cad);
  try {
    const all=queryShapeGeometry(shape,oc,'face',{});
    assert.equal(all.items[0].geomType,'BSPLINE_SURFACE');
    assert.equal(queryShapeGeometry(shape,oc,'face',{surfaceType:'bspline'}).matchCount,1);
    assert(all.items[0].spline.degreeU>=1);
    assert(all.items[0].spline.poleCountV>=2);
    assert.equal(all.items[0].planar,!curved);
    const planes=queryShapeGeometry(shape,oc,'face',{surfaceType:'plane'});
    assert.equal(planes.matchCount,curved?0:1);
    if(!curved) {
      assert.equal(queryShapeGeometry(shape,oc,'face',{surfaceType:'plane',normal:{direction:[0,0,1],sameDirection:false},atExtreme:{axis:'Z',side:'max'}}).matchCount,1);
      assert.equal(planes.items[0].edgeIds.length,4);
      assert.equal(planes.items[0].surfaceType,'bspline_surface');
    }
  } finally {shape.delete();}
}
console.log('PASS geometric planar BSpline discovery; curved patch rejected; original encoding retained');
