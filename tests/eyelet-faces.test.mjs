import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildQuickModel,QUICK_MODELS} from '../src/quick-models.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const pg15211={aFlangeDiameterMm:22,aBoreDiameterMm:14,aTubeOuterDiameterMm:14.5,aTubeLengthMm:4,aFlangeDepthMm:1.2,aBendRadiusMm:.8,bFlangeDiameterMm:22,bBoreDiameterMm:15,bTubeOuterDiameterMm:15.5,bOverallDepthMm:2.2,bFlangeDepthMm:1.2,bBendRadiusMm:.8};
for(const kind of ['twoPieceEyelet','alloyEyelet'])for(const faceStyle of ['flat','curved']){
 const params={kind,...QUICK_MODELS[kind].defaults,...(kind==='twoPieceEyelet'?pg15211:{}),faceStyle},shape=buildQuickModel(params,cad),parts=shape.solids;
 try{
  assert.equal(parts.length,2);const check=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false);try{assert.ok(check.IsValid());}finally{check.delete();}
  const common=parts[0].intersect(parts[1]);try{assert.ok(cad.measureVolume(common)<1e-7,'assembled parts do not penetrate');}finally{common.delete();}
  const boxes=parts.map(s=>{const box=s.boundingBox;try{return box.bounds.map(a=>[...a]);}finally{box.delete();}}).sort((a,b)=>a[0][2]-b[0][2]);
  for(const box of boxes){assert.ok(Math.abs(box[0][0]+box[1][0])<1e-5,'coaxial X');assert.ok(Math.abs(box[0][1]+box[1][1])<1e-5,'coaxial Y');}
  const top=kind==='twoPieceEyelet'?6:6.95,expectedHeight=top+(faceStyle==='curved'?1:0);
  const partZ=parts.map(part=>{const m=part.mesh({tolerance:.01,angularTolerance:.1});let min=Infinity,max=-Infinity;for(let i=2;i<m.vertices.length;i+=3){min=Math.min(min,m.vertices[i]);max=Math.max(max,m.vertices[i]);}return {min,max};});
  assert.ok(Math.abs(partZ[0].max-expectedHeight)<.02,'A long-shank face is uppermost');
  assert.ok(Math.abs(partZ[1].min)<.02,'B backplate is lowermost');
  assert.ok(partZ[0].min>partZ[1].min&&partZ[0].max>partZ[1].max,'A and B orientation is not reversed');
  // Bounding boxes of circular arcs may be conservative: check the rendered analytic tessellation.
  const mesh=shape.mesh({tolerance:.005,angularTolerance:.05}),zs=mesh.vertices.filter((_,i)=>i%3===2);
  const zmin=zs.reduce((a,b)=>Math.min(a,b),Infinity),zmax=zs.reduce((a,b)=>Math.max(a,b),-Infinity);
  assert.ok(Math.abs(zmin)<.01);assert.ok(Math.abs(zmax-expectedHeight)<.01,'faces bow outwards on both sides');
  console.log('PASS',kind,faceStyle,'2 valid coaxial solids, no overlap, outward faces');
 }finally{parts.forEach(p=>p.delete());shape.delete();}
}
for(const params of [{edgeChamferMm:1},{bNeckOuterDiameterMm:12},{materialGapMm:3},{faceStyle:'curved',faceRiseMm:4}])assert.throws(()=>buildQuickModel({kind:'alloyEyelet',...params},cad),/合金鸡眼/);
const old=buildQuickModel({kind:'twoPieceEyelet'},cad);try{const bb=old.boundingBox;try{assert.ok(Math.abs(bb.bounds[1][0]-bb.bounds[0][0]-42)<1e-5,'legacy bare recipe retains separated display');}finally{bb.delete();}}finally{old.delete();}
