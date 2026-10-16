import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {build} from '../src/quick-models/squareArchedBridge/build.js';
import definition from '../src/quick-models/squareArchedBridge/definition.js';
cad.setOC(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const p=definition.defaults;
const cases=[p,{...p,outerWidthMm:23,outerHeightMm:11,innerWidthMm:15,innerHeightMm:7,depthMm:6,outerRadiusMm:3,innerRadiusMm:1,edgeRadiusMm:0,holeDiameterMm:2.6,holeDepthMm:5}];
for(const params of cases){
 const shape=build({kind:'squareArchedBridge',...params},cad),box=shape.boundingBox;
 try{box.bounds[1].forEach((v,i)=>near(v-box.bounds[0][i],[params.outerWidthMm,params.outerHeightMm,params.depthMm][i]));const solids=shape.solids;assert.equal(solids.length,1);solids.forEach(s=>s.delete());assert.ok(cad.measureVolume(shape)>0);}finally{box.delete();shape.delete();}
}
const plain={...p,edgeRadiusMm:0,holeDiameterMm:0,holeDepthMm:0};
const solid=build(plain,cad),bored=build({...plain,holeDiameterMm:2.5,holeDepthMm:5},cad);
try{
 const expectedArea=p.outerWidthMm*p.outerHeightMm-p.innerWidthMm*p.innerHeightMm-2*(1-Math.PI/4)*(p.outerRadiusMm**2-p.innerRadiusMm**2);
 near(cad.measureVolume(solid),expectedArea*p.depthMm);
 near(cad.measureVolume(solid)-cad.measureVolume(bored),2*Math.PI*1.25**2*5);
}finally{solid.delete();bored.delete();}
const sharp=build({...plain,outerRadiusMm:0,innerRadiusMm:0},cad);sharp.delete();
for(const invalid of [{innerWidthMm:36},{innerHeightMm:12},{outerRadiusMm:5},{innerRadiusMm:8},{edgeRadiusMm:2},{holeDepthMm:7},{holeDiameterMm:3.1},{holeDiameterMm:0},{outerWidthMm:Infinity},{other:1}])assert.throws(()=>build({...p,...invalid},cad),/方线拱桥/);
console.log('PASS squareArchedBridge: both reference envelopes; valid solid; exact rounded-profile volume and paired blind bores; sharp corners; invalid dimensions rejected');
