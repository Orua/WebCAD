import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildRelief} from '../src/modeling/manufacturing/relief.js';
import {prepareReliefSculpt} from '../src/relief-sculpt.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=x=>{try{x?.delete?.();}catch{}};
test('edited flat and smooth relief rebuild on both supported hosts and directions',()=>{
 for(const cylindrical of [false,true])for(const surfaceMode of ['flat','smooth'])for(const mode of ['emboss','engrave']){
  const host=cylindrical?cad.makeCylinder(30,30):cad.makeBox([-15,-15,-5],[15,15,0]);let result;
  try{
   const faces=host.faces;let faceId;
   try{faceId=faces.findIndex(f=>cylindrical?f.geomType==='CYLINDRE':f.geomType==='PLANE'&&Math.abs(f.center.z)<1e-7);}finally{faces.forEach(dispose);}
   const p={faceId,...(cylindrical?{point:[0,30,15]}:{}),widthMm:10,heightMm:10,depthMm:1,mode,surfaceMode,values:Array.from({length:9},()=>Array(9).fill(.6)),regions:[{outer:[[-.4,-.4],[.4,-.4],[.4,.4],[-.4,.4]]}]};
   Object.assign(p,prepareReliefSculpt(p,[{mode:'raise',radiusMm:2.5,amountMm:.3,points:[[0,0]]}]).params);
   result=buildRelief(host,p,oc,cad);
   const solid=result.solids;assert.equal(solid.length,1);solid.forEach(dispose);
   const check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);try{assert.ok(check.IsValid(),`${cylindrical}/${surfaceMode}/${mode}`);}finally{dispose(check);}
   // At least one sculpted surface is curved, including a previously flat crest.
   const outputFaces=result.faces;try{assert.ok(outputFaces.some(f=>f.geomType==='BSPLINE_SURFACE'),'actual CAD surface must reflect edited controls');}finally{outputFaces.forEach(dispose);}
  }finally{dispose(result);dispose(host);}
 }
});
