import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {straightShoulderCutter} from '../src/modeling/manufacturing/cylindrical-relief.js';
import {buildRelief} from '../src/modeling/manufacturing/relief.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
test('a rational straight shoulder meets the actual cylinder and crest without claiming a fixed radius',()=>{
 const host=cad.makeCylinder(50,20),faces=host.faces,faceId=faces.findIndex(f=>f.geomType==='CYLINDRE');faces.forEach(f=>f.delete());const params={faceId,point:[0,50,10],widthMm:10,heightMm:10,depthMm:.5,baseMm:.005,maskStrategy:'faceWithHolesExtrude',curvePolicy:'preserveTopology',values:Array.from({length:4},()=>Array(4).fill(1)),regions:[{outer:[[-.3,-.3],[.3,-.3],[.3,.3],[-.3,.3]]}]},baseline=buildRelief(host,params,oc,cad),built=straightShoulderCutter({radius:50,normal:[0,1,0],axis:[0,0,1],origin:[0,50,10]},{start:[-2,-3],end:[2,-3],lowHeightMm:0,highHeightMm:.505,widthMm:.3},oc,cad);let result;
 try{
  const toolCheck=new oc.BRepCheck_Analyzer(built.tool.wrapped,true,false,false);try{assert(toolCheck.IsValid());}finally{toolCheck.delete();}result=baseline.cut(built.tool);const check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);try{assert(check.IsValid());}finally{check.delete();}const solids=result.solids;try{assert.equal(solids.length,1);}finally{solids.forEach(s=>s.delete());}assert(cad.measureVolume(result)<cad.measureVolume(baseline));assert.equal(built.report.fixedRadius,false);
  const faces=result.faces;try{const spline=faces.filter(f=>f.geomType==='BSPLINE_SURFACE');for(const [point,normal]of [[[0,50,7],[0,1,0]],[[0,50.505,7.3],[0,1,0]]]){const v=cad.makeVertex(point);try{const candidates=spline.filter(f=>cad.measureDistanceBetween(f,v)<1e-7);assert.equal(candidates.length,1);const n=candidates[0].normalAt(point);try{const q=n.toTuple();assert(Math.abs(Math.abs(q[1]/Math.hypot(...q))-1)<1e-10);}finally{n.delete();}}finally{v.delete();}}}finally{faces.forEach(f=>f.delete());}
 }finally{result?.delete();built.tool.delete();baseline.delete();host.delete();}
});
