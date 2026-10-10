import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {prepareReliefSculpt} from '../src/relief-sculpt.js';
import {buildRelief} from '../src/modeling/manufacturing/relief.js';
import {validateLocalPatch} from '../src/relief-local-patch.js';
const region={outer:[[-.4,-.4],[.4,-.4],[.4,.4],[-.4,.4]]},params={widthMm:20,heightMm:20,depthMm:.5,baseMm:.005,curveToleranceMm:.005,maskStrategy:'faceWithHolesExtrude',curvePolicy:'preserveTopology',surfaceMode:'smooth',values:Array.from({length:4},()=>Array(4).fill(1)),regions:[region]},patch={id:'body-detail',domainMm:[-2,-2,2,2],samples:17,protectionMm:.1};
test('local domain uses millimetre brush spacing, stable identity and two zero boundary rows without global resampling',()=>{
 const layers=[{heightMm:.5,regions:[region]}],original={...params,layers},changed=prepareReliefSculpt(original,[{mode:'raise',radiusMm:.6,amountMm:.1,points:[[0,0]]}],{layerIndex:0,patch});
 assert.equal(changed.report.minRadiusMm,.25);assert.equal(changed.report.globalGridUnchanged,true);assert.equal(changed.params.layers[0].values,undefined);assert.deepEqual(changed.params.layers[0].regions,layers[0].regions);const p=changed.params.layers[0].localPatches[0];assert.equal(p.deltaMm.length,17);assert(p.deltaMm[8][8]>0);validateLocalPatch(p,params);
 assert.throws(()=>prepareReliefSculpt({...original,...changed.params},[],{layerIndex:0,patch:{...patch,samples:33}}),{code:'RELIEF_PATCH_INVALID'});const bad=structuredClone(p);bad.deltaMm[0][8]=.01;assert.throws(()=>validateLocalPatch(bad,params),{code:'RELIEF_PATCH_INVALID'});
});
test('independent cylindrical raise/lower changes precise material and preserves exterior crest',async()=>{
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);const host=cad.makeCylinder(50,20),faces=host.faces,faceId=faces.findIndex(f=>f.geomType==='CYLINDRE');faces.forEach(f=>f.delete());const p={...params,faceId,point:[0,50,10]},results=[];
 try{
  const baseline=buildRelief(host,p,oc,cad);results.push(baseline);const baseVolume=cad.measureVolume(baseline);
  for(const mode of ['raise','lower']){const prepared=prepareReliefSculpt(p,[{mode,radiusMm:.8,amountMm:.1,points:[[0,0]]}],{patch}),result=buildRelief(host,{...p,...prepared.params},oc,cad);results.push(result);const volume=cad.measureVolume(result);assert(mode==='raise'?volume>baseVolume:volume<baseVolume);
   const check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);try{assert(check.IsValid());}finally{check.delete();}const faces=result.faces;try{assert(faces.some(f=>f.geomType==='BSPLINE_SURFACE'));}finally{faces.forEach(f=>f.delete());}
   const solids=result.solids;try{assert.equal(solids.length,1);for(const h of [.49,.52]){const point=cad.makeVertex([-4,Math.sqrt((50+h)**2-16),10]);try{assert.equal(cad.measureDistanceBetween(solids[0],point)<=1e-7,h===.49,'Outside local domain keeps original crest');}finally{point.delete();}}}finally{solids.forEach(s=>s.delete());}
  }
 }finally{results.forEach(s=>s.delete());host.delete();}
});
