import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';
import {geometryRecipeFingerprint,installCompiledCandidate,VERIFIED_NATIVE_KERNELS} from '../src/services/geometry-exchange.js';
import {encodeProjectV3,decodeProject} from '../src/project-container.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('native union and spatial seam blend preserve inputs, exact radius and atomic failure',async()=>{
 const worker=process.env.WEBCAD_NATIVE_WORKER,baseRoot=process.env.WEBCAD_NATIVE_TEST_ROOT;
 assert(worker&&baseRoot,'Actual worker and external evidence root required');fs.mkdirSync(baseRoot,{recursive:true});const root=fs.mkdtempSync(path.join(baseRoot,'seam-'));
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
 const a=cad.makeCylinder(3,12,[0,0,-6]),b=cad.makeCylinder(2,12,[0,-6,0],[0,1,0]);
 const sources=[a.serialize(),b.serialize()];const cases=[];
 const run=(name,op,params,texts=sources)=>{
  const dir=path.join(root,name);fs.mkdirSync(dir,{recursive:true});
  const files=texts.map((text,i)=>{const file=path.join(dir,`source-${i}.brep`);fs.writeFileSync(file,text);return file;});
  const request={operation:op,semanticVersion:op==='union'?(typeof params.blendRadiusMm==='object'?'boolean.union-seam-1.1':'boolean.union-seam-1.0'):(typeof params.radius==='object'?'blend.spatial-edges-1.1':'blend.spatial-edges-1.0'),strategy:op==='union'?'multi-source-union-seam':'spatial-sharp-edges',params:{...params,...(op==='union'?{toolPaths:files.slice(1)}:{})},sourcePath:files[0],outputPath:path.join(dir,'result.brep'),reportPath:path.join(dir,'report.json'),inputFingerprint:hash(Buffer.from(texts.join(''))),featureId:name,expectedRevision:1};
  fs.writeFileSync(path.join(dir,'request.json'),JSON.stringify(request));
  const child=spawnSync(worker,[path.join(dir,'request.json')],{windowsHide:true,encoding:'utf8',timeout:60000});
  assert(fs.existsSync(request.reportPath),String(child.error??child.stderr));const report=JSON.parse(fs.readFileSync(request.reportPath));
  assert.deepEqual(files.map(f=>fs.readFileSync(f,'utf8')),texts,'native source files unchanged');
  cases.push({name,exit:child.status,report});return {child,report,...request};
 };
 try{
  const fuse=run('fuse','union',{});assert.equal(fuse.child.status,0,JSON.stringify(fuse.report));
  const blend=run('seam','union',{blendRadiusMm:.2});assert.equal(blend.child.status,0,JSON.stringify(blend.report));
  assert.equal(blend.report.blendReport.radiusUsedMm,.2);assert(blend.report.blendReport.processedEdgeCount>0);
  const bounded=run('bounded-seam','union',{blendRadiusMm:{maxMm:1000,minMm:.2,maxAttempts:2}});assert.equal(bounded.child.status,0,JSON.stringify(bounded.report));assert.equal(bounded.report.blendReport.radiusUsedMm,.2);assert.equal(bounded.report.blendReport.attemptCount,2);assert.equal(bounded.report.blendReport.tried[0].ok,false);
  const engine=new CadKernel(oc),cold=new CadKernel(oc),context={documentId:'seam-doc',documentInstanceId:'seam-instance',expectedRevision:1};
  try{
   const doc={version:2,documentId:context.documentId,imports:{a:{format:'brep',data:Buffer.from(sources[0]).toString('base64')},b:{format:'brep',data:Buffer.from(sources[1]).toString('base64')}},features:[{id:'a',op:'import',params:{key:'a'},refs:[]},{id:'b',op:'import',params:{key:'b'},refs:[]}]};
   await engine.rebuild(doc);const bytes=fs.readFileSync(blend.outputPath),kernelBuildId=`native-occt@7.8.1:sha256:${hash(fs.readFileSync(worker))}`;
   assert(VERIFIED_NATIVE_KERNELS.has(kernelBuildId));doc.features.push({id:'seam',op:'union',params:{blendRadiusMm:.2},refs:['a','b']});
   const manifest={...blend.report,...context,featureId:'seam',kernelBuildId,recipeFingerprint:geometryRecipeFingerprint(doc,'seam'),sourceSha256:hash(engine.serializeFeatureShape('a').data),inputSha256:['a','b'].map(id=>hash(engine.serializeFeatureShape(id).data)),geometryArtifact:{format:'occt-text-brep-v1',brepVersion:3,sha256:hash(bytes),bytes:bytes.length}};
   const installed=installCompiledCandidate(doc,{manifest,bytes,context,recipeFingerprint:manifest.recipeFingerprint});
   const committed=await engine.rebuild(installed);assert(committed.compiledReuse.includes('seam'),'must install native result, never recompute locally');
   assert.equal(committed.bodies[0].blendReport.radiusUsedMm,.2);
   const reopened=await decodeProject(encodeProjectV3(installed,{includeTimeline:false})),restored=await cold.rebuild(reopened);
   assert(restored.compiledReuse.includes('seam'));assert.equal(restored.bodies[0].solidCount,1);
   doc.features.at(-1).params.blendRadiusMm={maxMm:1000,minMm:.2,maxAttempts:2};const boundedBytes=fs.readFileSync(bounded.outputPath);
   const boundedManifest={...manifest,...bounded.report,featureId:'seam',kernelBuildId,recipeFingerprint:geometryRecipeFingerprint(doc,'seam'),geometryArtifact:{format:'occt-text-brep-v1',brepVersion:3,sha256:hash(boundedBytes),bytes:boundedBytes.length}};
   const boundedDoc=installCompiledCandidate(doc,{manifest:boundedManifest,bytes:boundedBytes,context,recipeFingerprint:boundedManifest.recipeFingerprint});
   const boundedRestore=await cold.rebuild(await decodeProject(encodeProjectV3(boundedDoc,{includeTimeline:false})));assert(boundedRestore.compiledReuse.includes('seam'));assert.equal(boundedRestore.bodies[0].blendReport.attemptCount,2);

  }finally{engine.dispose();cold.dispose();}
  const box=cad.makeBox([0,0,0],[10,10,10]);let boxText;try{boxText=box.serialize();}finally{box.delete();}
  const spatial=run('spatial','fillet',{radius:.4,selector:{edgesNear:{pointMm:[0,0,5],radiusMm:.1}}},[boxText]);assert.equal(spatial.child.status,0,JSON.stringify(spatial.report));assert.equal(spatial.report.blendReport.processedEdgeCount,1);
  for(const r of [fuse,blend,spatial,bounded]){const result=cad.deserializeShape(fs.readFileSync(r.outputPath,'utf8'));try{const check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);try{assert(check.IsValid());}finally{check.delete();}assert(cad.measureVolume(result)>0);}finally{result.delete();}}
  const impossible=run('impossible','union',{blendRadiusMm:1000});assert.notEqual(impossible.child.status,0);assert(!fs.existsSync(impossible.outputPath),'no unblended fusion published');assert.equal(impossible.report.blendDiagnostics.tried.length,1);assert(impossible.report.blendDiagnostics.pointsMm.length<=16);
  const badRange=run('infeasible-range','union',{blendRadiusMm:{maxMm:1000,minMm:900,maxAttempts:2}});assert.notEqual(badRange.child.status,0);assert.equal(badRange.report.blendDiagnostics.tried.length,2);assert(!fs.existsSync(badRange.outputPath));
  const empty=run('empty-selection','fillet',{radius:.4,selector:{edgesNear:{pointMm:[100,100,100],radiusMm:.1}}},[boxText]);assert.notEqual(empty.child.status,0);assert.equal(empty.report.code,'SELECTOR_EMPTY');assert(!fs.existsSync(empty.outputPath));
  const remote=cad.makeBox([100,100,100],[101,101,101]);let remoteText;try{remoteText=remote.serialize();}finally{remote.delete();}
  const disjoint=run('disjoint','union',{},[sources[0],remoteText]);assert.notEqual(disjoint.child.status,0);assert(!fs.existsSync(disjoint.outputPath));
  assert.deepEqual([a.serialize(),b.serialize()],sources);
  fs.writeFileSync(path.join(root,'seam-acceptance.json'),JSON.stringify({status:'passed',producerKernelBuildId:`native-occt@7.8.1:sha256:${hash(fs.readFileSync(worker))}`,codec:'occt-text-brep-v1',brepVersion:3,seamStatus:'passed',seamRangeStatus:'passed',availableSemantics:['boolean.union-seam-1.0','blend.spatial-edges-1.0','boolean.union-seam-1.1','blend.spatial-edges-1.1'],cases},null,2));console.log(JSON.stringify({evidenceRoot:root}));
 }finally{a.delete();b.delete();}
});
