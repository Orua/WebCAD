import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildRelief} from '../src/modeling/manufacturing/relief.js';
import {prepareReliefSculpt} from '../src/relief-sculpt.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const dispose=x=>{try{x?.delete?.();}catch{}};
test('actual native OCCT text-BRep translation roundtrip preserves a box, hole and sculpted spline',async()=>{
 const worker=process.env.WEBCAD_NATIVE_WORKER,root=process.env.WEBCAD_NATIVE_TEST_ROOT;
 assert.ok(worker&&root,'Supply the actual native binary and an external test root');fs.mkdirSync(root,{recursive:true});
 const wasm=fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url));const oc=await init({wasmBinary:wasm});cad.setOC(oc);
 const solid=cad.makeBox([0,0,0],[10,8,3]),cutter=cad.makeCylinder(1,5,[5,4,-1]),hole=solid.cut(cutter);dispose(cutter);
 const host=cad.makeBox([-15,-15,-5],[15,15,0]),faces=host.faces;let faceId;
 try{faceId=faces.findIndex(face=>{const center=face.center;try{return face.geomType==='PLANE'&&Math.abs(center.z)<1e-7;}finally{dispose(center);}});}finally{faces.forEach(dispose);}
 const params={faceId,widthMm:10,heightMm:10,depthMm:1,mode:'emboss',surfaceMode:'smooth',values:Array.from({length:9},()=>Array(9).fill(.6)),regions:[{outer:[[-.4,-.4],[.4,-.4],[.4,.4],[-.4,.4]]}]};Object.assign(params,prepareReliefSculpt(params,[{mode:'raise',radiusMm:2.5,amountMm:.3,points:[[0,0]]}]).params);
 const spline=buildRelief(host,params,oc,cad);dispose(host);const evidence=[];
 try{for(const [name,source]of [['box',solid],['hole',hole],['spline',spline]]){
  const dir=fs.mkdtempSync(path.join(root,`${name}-`)),sourcePath=path.join(dir,'source.brep'),outputPath=path.join(dir,'result.brep'),reportPath=path.join(dir,'report.json'),requestPath=path.join(dir,'request.json'),before=source.serialize();fs.writeFileSync(sourcePath,before);
  fs.writeFileSync(requestPath,JSON.stringify({operation:'transform',semanticVersion:'transform.translation-1.0',strategy:'translation',params:{x:2,y:-3,z:1},sourcePath,outputPath,reportPath,inputFingerprint:hash(Buffer.from(before)),featureId:name,expectedRevision:1}));
  const run=spawnSync(worker,[requestPath],{windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:16384});assert.equal(run.status,0,`native exit=${run.status}, error=${run.stderr}, report=${fs.existsSync(reportPath)?fs.readFileSync(reportPath,'utf8'):'missing'}`);
  const report=JSON.parse(fs.readFileSync(reportPath,'utf8')),resultBytes=fs.readFileSync(outputPath);assert.equal(report.ok,true);assert.equal(report.codec,'occt-text-brep-v1');assert.equal(report.kernelVersion,'7.8.1');assert.equal(report.validation.solidCount,1);
  const result=cad.deserializeShape(resultBytes.toString()),reference=cad.deserializeShape(before).translate([2,-3,1]),volumeBefore=cad.measureVolume(source),volumeAfter=cad.measureVolume(result),a=reference.boundingBox,b=result.boundingBox;
  try{
   assert.ok(Math.abs(volumeBefore-volumeAfter)<1e-7,`${name} volume changed ${volumeAfter-volumeBefore}`);
   // AddOptimal on a trimmed spline is a numerical derived bound and is not
   // translation-covariant. Compare the real local operation at the same final
   // position, then independently check exact trimmed edge/surface samples.
   for(let side=0;side<2;side++)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(b.bounds[side][axis]-a.bounds[side][axis])<1e-6,`${name} differs from the local operation`);
   let maxSampleDistanceMm=0,sampleCount=0;
   const checkPoint=point=>{const vertex=cad.makeVertex(point.map((v,i)=>v+[2,-3,1][i]));try{maxSampleDistanceMm=Math.max(maxSampleDistanceMm,cad.measureDistanceBetween(vertex,result));sampleCount++;}finally{dispose(vertex);}};
   const exactEdges=source.edges;try{for(const edge of exactEdges)for(const t of [0,.25,.5,.75,1]){const point=edge.pointAt(t);try{checkPoint(point.toTuple());}finally{dispose(point);}}}finally{exactEdges.forEach(dispose);}
   const exactFaces=source.faces;try{for(const face of exactFaces){const uv=face.UVBounds,adaptor=new oc.BRepAdaptor_Surface(face.wrapped,true);try{for(const u of [.2,.5,.8])for(const v of [.2,.5,.8]){const p=adaptor.Value(uv.uMin+(uv.uMax-uv.uMin)*u,uv.vMin+(uv.vMax-uv.vMin)*v),point=[p.X(),p.Y(),p.Z()];dispose(p);const vertex=cad.makeVertex(point);let onFace;try{onFace=cad.measureDistanceBetween(vertex,face)<1e-8;}finally{dispose(vertex);}if(onFace)checkPoint(point);}}finally{dispose(adaptor);}}}finally{exactFaces.forEach(dispose);}
   assert.ok(maxSampleDistanceMm<1e-7,`${name} exact surface deviation ${maxSampleDistanceMm}`);
   const sourceFaces=source.faces,resultFaces=result.faces;try{assert.equal(resultFaces.length,sourceFaces.length);assert.deepEqual(resultFaces.map(f=>f.geomType).sort(),sourceFaces.map(f=>f.geomType).sort());}finally{sourceFaces.forEach(dispose);resultFaces.forEach(dispose);}
   const local=result.translate([1,0,0]),checked=new oc.BRepCheck_Analyzer(local.wrapped,true,false,false);try{assert(checked.IsValid());assert(Math.abs(cad.measureVolume(local)-volumeBefore)<1e-7);}finally{dispose(checked);dispose(local);}
   assert.equal(source.serialize(),before,'native roundtrip mutated source');
   evidence.push({name,inputSha256:hash(Buffer.from(before)),outputSha256:hash(resultBytes),volumeBefore,volumeAfter,sampleCount,maxSampleDistanceMm,validation:report.validation,timings:report.timings});
  }finally{dispose(a);dispose(b);dispose(reference);dispose(result);}
 }}finally{[solid,hole,spline].forEach(dispose);}
 fs.writeFileSync(path.join(root,'kernel-pair-geometry-evidence.json'),JSON.stringify({producerKernelBuildId:`native-occt@7.8.1:sha256:${hash(fs.readFileSync(worker))}`,consumerKernelBuildId:`replicad-opencascadejs@1.1.0:sha256:${hash(wasm)}`,codec:'occt-text-brep-v1',brepVersion:3,status:'geometry-bridge-passed; project-install/save-gates-pending',evidence},null,2));
});
