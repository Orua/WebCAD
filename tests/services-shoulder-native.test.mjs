import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {prepareShoulderPlan} from '../src/services/shoulder-plan.js';
import {assertCompilableFeature,geometryRecipeFingerprint,installCompiledCandidate} from '../src/services/geometry-exchange.js';
import {CadKernel} from '../src/cad-kernel.js';
import {encodeProjectV3,decodeProject} from '../src/project-container.js';
import {buildRelief} from '../src/modeling/manufacturing/relief.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('central shoulder binds a current selected source and preserves its through-hole across the native bridge',async()=>{
 const worker=process.env.WEBCAD_NATIVE_WORKER,root=process.env.WEBCAD_NATIVE_TEST_ROOT;
 assert.ok(worker&&root,'Actual Native Worker and external evidence root required');
 fs.mkdirSync(root,{recursive:true});const dir=fs.mkdtempSync(path.join(root,'shoulder-'));
 const fixture=process.env.WEBCAD_NATIVE_SHOULDER_CHECK||path.join(path.dirname(worker),'WebCADShoulderCheck.exe');
 const prepared=spawnSync(fixture,[dir],{windowsHide:true,encoding:'utf8',timeout:30000});
 assert.equal(prepared.status,0,prepared.stderr||prepared.stdout||String(prepared.error));
 const proof=JSON.parse(fs.readFileSync(path.join(dir,'native-local-replacement-result.json')));
 assert.equal(proof.accepted,true);assert.equal(proof.sourceBinding.retainedSourceFaceCount,6);assert.equal(proof.holeMaterialUnchanged,true);
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
 const source=cad.deserializeShape(fs.readFileSync(path.join(dir,'native-source-with-hole.brep'),'utf8')),faces=source.faces;
 try{
  const candidates=faces.map((f,i)=>({f,i})).filter(({f})=>{if(f.geomType!=='PLANE')return false;const center=f.center,normal=f.normalAt();try{return Math.abs(center.z-7)<1e-7&&normal.z<-.99;}finally{center.delete();normal.delete();}});
  assert.equal(candidates.length,1);
  const params={faceId:candidates[0].i,point:[0,50.2525,7],widthMm:.3,endProtectionMm:.3,endPolicy:'retained-step-with-planar-caps'};
  assertCompilableFeature({op:'reliefShoulder',refs:['source'],params});
  const sourceBrep=source.serialize(),plan=prepareShoulderPlan(source,params,oc,cad,{sourceBrep});
  assert.equal(plan.sourceSha256,hash(Buffer.from(sourceBrep)));
  assert.throws(()=>prepareShoulderPlan(source,{...params,point:[0,0,7]},oc,cad,{sourceBrep}),/内部/);
  const sourcePath=path.join(dir,'wasm-source.brep');fs.writeFileSync(sourcePath,sourceBrep);
  const request={operation:'reliefShoulder',semanticVersion:plan.semanticVersion,strategy:'source-boundary-replacement',params:{...plan.params,faceIntent:plan.selectionIntent},sourcePath,outputPath:path.join(dir,'worker-result.brep'),reportPath:path.join(dir,'worker-report.json'),inputFingerprint:plan.sourceSha256,featureId:'shoulder',expectedRevision:1};
  const requestPath=path.join(dir,'request.json');fs.writeFileSync(requestPath,JSON.stringify(request));
  const run=spawnSync(worker,[requestPath],{windowsHide:true,encoding:'utf8',timeout:30000});
  const report=JSON.parse(fs.readFileSync(request.reportPath));assert.equal(run.status,0,JSON.stringify(report));
  assert.equal(report.topologyBinding.numericIndicesTransferred,false);assert.equal(report.shoulderReport.endCapContinuity,'G0');
  const result=cad.deserializeShape(fs.readFileSync(request.outputPath,'utf8'));
  try{assert.ok(Math.abs(cad.measureVolume(result)-report.validation.volumeMm3)<1e-6);assert.equal(result.faces.length,13);}
  finally{result.delete();}
  const document={version:2,documentId:'shoulder-bridge',imports:{source:{format:'brep',data:Buffer.from(sourceBrep).toString('base64')}},features:[{id:'source',op:'import',params:{key:'source'},refs:[]},{id:'shoulder',op:'reliefShoulder',params,refs:['source']}]};
  const context={documentId:document.documentId,documentInstanceId:'shoulder-instance',expectedRevision:1};
  const bytes=new Uint8Array(fs.readFileSync(request.outputPath)),recipeFingerprint=geometryRecipeFingerprint(document,'shoulder');
  const manifest={...report,...context,jobId:'shoulder-test',recipeFingerprint,sourceSha256:plan.sourceSha256,kernelBuildId:`native-occt@7.8.1:sha256:${hash(fs.readFileSync(worker))}`,geometryArtifact:{artifactId:'shoulder-test',format:'occt-text-brep-v1',brepVersion:3,bytes:bytes.length,sha256:hash(bytes)}};
  const installed=installCompiledCandidate(document,{manifest,bytes,context,recipeFingerprint});
  const packet=encodeProjectV3(installed);fs.writeFileSync(path.join(dir,'accepted.webcad'),packet);
  const cold=new CadKernel(oc),operation=cold.operation.bind(cold);
  cold.operation=(feature,...args)=>{if(feature.op==='reliefShoulder')throw Error('Offline shoulder must not recompute');return operation(feature,...args);};
  try{const rebuilt=await cold.rebuild(await decodeProject(packet));assert.deepEqual(rebuilt.compiledReuse,['shoulder']);assert.equal(rebuilt.bodies.length,1);assert.equal(rebuilt.bodies[0].reliefReport.endCapContinuity,'G0');assert.ok(Math.abs(rebuilt.bodies[0].volume-report.validation.volumeMm3)<1e-6);}
  finally{cold.dispose();}
  const rejected={...request,outputPath:path.join(dir,'rejected.brep'),reportPath:path.join(dir,'rejected.json'),params:{...request.params,faceIntent:{...plan.selectionIntent,normal:[0,0,1]}}};
  fs.writeFileSync(requestPath,JSON.stringify(rejected));const failure=spawnSync(worker,[requestPath],{windowsHide:true,encoding:'utf8',timeout:30000});
  assert.notEqual(failure.status,0);assert.equal(fs.existsSync(rejected.outputPath),false);
  const rotated={...request,sourcePath:path.join(dir,'rotated-source.brep'),outputPath:path.join(dir,'rotated-result.brep'),reportPath:path.join(dir,'rotated-report.json'),params:{...plan.params,faceIntent:JSON.parse(fs.readFileSync(path.join(dir,'rotated-intent.json')))}};
  fs.writeFileSync(requestPath,JSON.stringify(rotated));const moved=spawnSync(worker,[requestPath],{windowsHide:true,encoding:'utf8',timeout:30000});
  const movedReport=JSON.parse(fs.readFileSync(rotated.reportPath));assert.equal(moved.status,0,JSON.stringify(movedReport));assert.equal(movedReport.shoulderReport.frameNormalized,true);
  const movedShape=cad.deserializeShape(fs.readFileSync(rotated.outputPath,'utf8'));try{assert.ok(Math.abs(cad.measureVolume(movedShape)-report.validation.volumeMm3)<1e-6);}finally{movedShape.delete();}
 }finally{faces.forEach(f=>f.delete());source.delete();}
});

test('actual single and nested relief steps preserve tangency, lower layers and a through-hole',async()=>{
 const worker=process.env.WEBCAD_NATIVE_WORKER,root=process.env.WEBCAD_NATIVE_TEST_ROOT;
 assert.ok(worker&&root);fs.mkdirSync(root,{recursive:true});const baseDir=fs.mkdtempSync(path.join(root,'shoulder-projected-'));
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
 for(const nested of [false,true]){
 const dir=path.join(baseDir,nested?'nested':'single');fs.mkdirSync(dir);
 const blank=cad.makeCylinder(50,20),hole=nested?cad.makeCylinder(2,22,[10,0,-1]):null,host=nested?blank.cut(hole):blank;hole?.delete();if(nested)blank.delete();const hostFaces=host.faces,faceId=hostFaces.findIndex(f=>f.geomType==='CYLINDRE');hostFaces.forEach(f=>f.delete());
 const source=buildRelief(host,{faceId,point:[0,50,10],widthMm:10,heightMm:10,depthMm:.5,baseMm:.005,maskStrategy:'faceWithHolesExtrude',curvePolicy:'preserveTopology',values:Array.from({length:4},()=>Array(4).fill(1)),regions:[{outer:[[-.3,-.3],[.3,-.3],[.3,.3],[-.3,.3]]}],...(nested?{layers:[{heightMm:.5,regions:[{outer:[[-.4,-.4],[.4,-.4],[.4,.4],[-.4,.4]]}]},{heightMm:1,startHeightMm:.5,regions:[{outer:[[-.2,-.2],[.2,-.2],[.2,.2],[-.2,.2]]}]}]}:{})},oc,cad);
 const z=nested?8:7,R=nested?50.505:50,H=nested?51.005:50.505,faces=source.faces;
 try{
  const faceId=faces.findIndex(f=>{if(f.geomType!=='PLANE')return false;const p=f.center,n=f.normalAt();try{return Math.abs(p.z-z)<1e-6&&n.z<-.99;}finally{p.delete();n.delete();}});
  assert.ok(faceId>=0);const params={faceId,point:[0,(R+H)/2,z],widthMm:.3,endProtectionMm:.3,endPolicy:'retained-step-with-planar-caps'},sourceBrep=source.serialize(),plan=prepareShoulderPlan(source,params,oc,cad,{sourceBrep});
  const sourcePath=path.join(dir,'source.brep');fs.writeFileSync(sourcePath,sourceBrep);
  const request={operation:'reliefShoulder',semanticVersion:plan.semanticVersion,strategy:'source-boundary-replacement',params:{...plan.params,faceIntent:plan.selectionIntent},sourcePath,outputPath:path.join(dir,'result.brep'),reportPath:path.join(dir,'report.json'),inputFingerprint:plan.sourceSha256,featureId:'shoulder',expectedRevision:1};
  const requestPath=path.join(dir,'request.json');fs.writeFileSync(requestPath,JSON.stringify(request));
  const run=spawnSync(worker,[requestPath],{windowsHide:true,encoding:'utf8',timeout:30000}),report=JSON.parse(fs.readFileSync(request.reportPath));
  assert.equal(run.status,0,JSON.stringify(report));assert.equal(report.shoulderReport.mechanism,'native-revolved-cutter');assert.equal(report.validation.solidCount,1);assert.equal(report.shoulderReport.retainedSourceFaces,nested?11:5);
  const result=cad.deserializeShape(fs.readFileSync(request.outputPath,'utf8')),resultFaces=result.faces;
  try{
   assert.ok(Math.abs(cad.measureVolume(result)-report.validation.volumeMm3)<1e-6);
   const shoulderFaces=resultFaces.filter(f=>!['PLANE','CYLINDRE'].includes(f.geomType));assert.equal(shoulderFaces.length,1);
   for(const point of [[0,R,z],[0,H,z+.3]]){const v=cad.makeVertex(point),n=shoulderFaces[0].normalAt(point);try{assert.ok(cad.measureDistanceBetween(shoulderFaces[0],v)<1e-7);const q=n.toTuple();assert.ok(Math.abs(Math.abs(q[1]/Math.hypot(...q))-1)<1e-8);}finally{v.delete();n.delete();}}
   if(nested){const solids=result.solids;try{for(const [point,inside] of [[[10,0,10],false],[[12.1,0,10],true],[[0,50.25,6.5],true],[[0,50.75,7.5],false]]){const p=cad.makeVertex(point),query=new cad.DistanceQuery(solids[0]);try{assert.equal(query.distanceTo(p)<1e-7,inside,'Existing hole and lower-layer material retained');}finally{query.delete();p.delete();}}}finally{solids.forEach(s=>s.delete());}}
  }finally{resultFaces.forEach(f=>f.delete());result.delete();}
 }finally{faces.forEach(f=>f.delete());source.delete();host.delete();}
 }
});
