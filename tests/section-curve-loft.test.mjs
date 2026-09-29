import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildSectionCurveLoft} from '../src/section-curve-loft.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
test('bounded degree keeps a symmetric rounded frame within its measured envelope',async()=>{
  const right=[
    [2.304,2.5,5,1,0],[7.467,2.5,5.001,1,.015],
    [12.739,2.521,5.158,.978,.211],[15.712,4.243,6.586,.426,.904],
    [14.937,7.333,5.002,-.258,.966],[14.137,9.967,4.999,-.291,.957],
    [13.074,13.470,5,-.291,.957],[12.029,16.912,5.001,-.311,.950],
    [10.745,20.697,5.005,-.465,.885],[8.221,24.198,5,-.725,.689],
    [4.465,26.630,5.001,-.927,.374],
  ];
  const rows=[...right,[0,27.5,5,-1,0],...right.toReversed().map(([x,y,w,nx,ny])=>[-x,y,w,nx,-ny])];
  const stations=rows.map(([x,y,w,nx,ny])=>{const n=Math.hypot(nx,ny);return {centerMm:[x,y,0],normal:[nx/n,ny/n,0],widthDirection:[ny/n,-nx/n,0],widthMm:w,depthMm:5};});
  const shape=buildSectionCurveLoft({stations,loftDegree:2},cad);
  try{
    const [min,max]=shape.boundingBox.bounds;
    assert.ok(Math.abs(max[0]-min[0]-37.4)<.04);
    assert.ok(min[1]>-.06&&max[1]<30.01);
    assert.ok(Math.abs(max[0]+min[0])<.01);
    assert.ok(Math.abs(max[2]-min[2]-5)<1e-5);
    assert.ok(await cad.exportSTEP([{shape}]));
  }finally{shape.delete();}
});
test('section loft rejects invalid degree before building',()=>{
  assert.throws(()=>buildSectionCurveLoft({stations:[{},{}],loftDegree:1},cad),/2–8/);
  assert.throws(()=>buildSectionCurveLoft({stations:[{},{}],loftDegree:2.5},cad),/2–8/);
});
