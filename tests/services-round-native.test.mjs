import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';
import {geometryRecipeFingerprint,installCompiledCandidate,compiledCheckpointBytes,VERIFIED_NATIVE_KERNELS,LOCAL_KERNEL_BUILD_ID} from '../src/services/geometry-exchange.js';
import {encodeProjectV3,decodeProject} from '../src/project-container.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const dispose=value=>{try{value?.delete?.();}catch{}};
const close=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} differs from ${expected}`);

test('native whole-face R retains the existing R, installs at the original feature and reopens offline',async()=>{
 const worker=process.env.WEBCAD_NATIVE_WORKER,root=process.env.WEBCAD_NATIVE_TEST_ROOT;
 assert.ok(worker&&root,'Actual native worker and an external evidence root are required');
 fs.mkdirSync(root,{recursive:true});const data=fs.mkdtempSync(path.join(root,'round-direct-'));
 const wasm=fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url));
 const kernelBuildId=`native-occt@7.8.1:sha256:${hash(fs.readFileSync(worker))}`;
 assert.ok(VERIFIED_NATIVE_KERNELS.has(kernelBuildId),'The actual worker must have an accepted client codec pair');
 assert.equal(`replicad-opencascadejs@1.1.0:sha256:${hash(wasm)}`,LOCAL_KERNEL_BUILD_ID);
 const oc=await init({wasmBinary:wasm}),engine=new CadKernel(oc),cold=new CadKernel(oc);
 const context={documentId:'whole-face-round-doc',documentInstanceId:'whole-face-round-instance',expectedRevision:1};
 const box={id:'box',op:'box',params:{width:40,depth:30,height:10},refs:[]};
 let sourceBytes;
 const execute=(name,plan)=>{
  const dir=path.join(data,name);fs.mkdirSync(dir);
  const sourcePath=path.join(dir,'source.brep'),outputPath=path.join(dir,'result.brep'),reportPath=path.join(dir,'report.json'),requestPath=path.join(dir,'request.json');
  fs.writeFileSync(sourcePath,sourceBytes);
  const inputFingerprint=hash(Buffer.from(JSON.stringify({sourceSha256:hash(sourceBytes),params:plan.params,intent:plan.selectionIntent})));
  fs.writeFileSync(requestPath,JSON.stringify({operation:'round',semanticVersion:plan.semanticVersion,strategy:'planar-boundary-cutter',params:{radius:plan.params.radius,faceIntent:plan.selectionIntent},sourcePath,outputPath,reportPath,inputFingerprint,featureId:'round',expectedRevision:context.expectedRevision}));
  const run=spawnSync(worker,[requestPath],{windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:4096});
  assert.ok(fs.existsSync(reportPath),`Missing native report: ${run.error??run.stderr}`);
  return {run,report:JSON.parse(fs.readFileSync(reportPath,'utf8')),outputPath,reportPath};
 };
 try{
  const base={version:2,documentId:context.documentId,imports:{},features:[box]};await engine.rebuild(base);
  const edges=await engine.queryGeometry('box','edge',{curveType:'line'});
  const frontTop=edges.items.filter(edge=>Math.hypot(...edge.lengthMidpoint.map((v,i)=>v-[20,0,10][i]))<1e-7);assert.equal(frontTop.length,1);
  const preRound={id:'source',op:'fillet',params:{edgeIds:[frontTop[0].edgeId],radius:2},refs:['box']};
  const sourceDoc={...base,features:[box,preRound]};await engine.rebuild(sourceDoc);
  const faces=await engine.queryGeometry('source','face',{surfaceType:'plane',normal:{direction:[0,0,1]},atExtreme:{axis:'Z',side:'max'}});assert.equal(faces.items.length,1);
  const params={mode:'edge',strength:.5,faceIds:[faces.items[0].faceId]},round={id:'round',op:'round',params,refs:['source']},doc={...sourceDoc,features:[...sourceDoc.features,round]};
  sourceBytes=engine.serializeFeatureShape('source').data;
  assert.equal(engine.faceRoundPlan('source',params).plan.candidate,true);
  const plan=engine.faceRoundPlan('source',params,true).plan;
  assert.equal(plan.params.radius,2);assert.equal(plan.sourceSha256,hash(sourceBytes));assert.equal(plan.selectionIntent.kind,'planar-face-geometric-intent');assert.deepEqual(plan.selectionIntent.normal,[0,0,1]);
  assert.deepEqual(Object.keys(plan.selectionIntent).sort(),['kind','normal','point']);
  const accepted=execute('accepted',plan);assert.equal(accepted.run.status,0,JSON.stringify(accepted.report));
  const report=accepted.report;assert.equal(report.ok,true);assert.equal(report.kernelVersion,'7.8.1');assert.deepEqual(report.topologyBinding,{kind:'planar-face-geometric-intent',matchCount:1,numericIndicesTransferred:false});
  const details=report.roundBoundary;assert.equal(details.radiusMm,2);assert.equal(details.cornerSemantics,'smooth-freeform-patches');assert.equal(details.isolatedCornerTerminations,4);
  assert.equal(details.cornerDetails.constantRadiusInEveryDirection,false);assert.equal(details.cornerDetails.terminationVertexUniqueNormalClaimed,false);
  assert.ok(details.regularSeams.maxOutwardNormalAngleDeg<.1);assert.ok(details.sideSections.maxRadiusErrorMm<1e-7);assert.equal(details.sideSections.sampleCount,28);
  const bytes=new Uint8Array(fs.readFileSync(accepted.outputPath)),recipeFingerprint=geometryRecipeFingerprint(doc,'round');
  const manifest={...report,...context,jobId:'direct-round',recipeFingerprint,kernelBuildId,sourceSha256:hash(sourceBytes),geometryArtifact:{artifactId:'direct-round',format:'occt-text-brep-v1',brepVersion:3,sha256:hash(bytes),bytes:bytes.length}};
  fs.writeFileSync(path.join(data,'manifest.json'),JSON.stringify(manifest,null,2));
  const installed=installCompiledCandidate(doc,{manifest,bytes,context,recipeFingerprint}),installedRound=installed.features.at(-1);
  assert.equal(installedRound.id,round.id);assert.equal(installedRound.op,round.op);assert.deepEqual(installedRound.params,params);assert.deepEqual(installedRound.refs,['source']);
  assert.equal(installedRound.compiledCheckpoint.recipeFingerprint,recipeFingerprint);assert.equal(installedRound.compiledCheckpoint.sourceSha256,plan.sourceSha256);
  assert.equal(hash(compiledCheckpointBytes(installed,installedRound,sourceBytes)),hash(bytes));
  assert.equal(compiledCheckpointBytes(installed,installedRound,new TextEncoder().encode('changed source')),null);
  const changedRecipe={...installed,features:installed.features.map(feature=>feature.id==='round'?{...feature,params:{...params,radiusMm:2.1}}:feature)};
  assert.equal(compiledCheckpointBytes(changedRecipe,changedRecipe.features.at(-1),sourceBytes),null);
  const built=await engine.rebuild(installed);assert.deepEqual(built.compiledReuse,['round']);assert.deepEqual(built.compiledInvalidated,[]);assert.equal(built.bodies.length,1);assert.equal(built.bodies[0].id,'round');assert.equal(built.bodies[0].solidCount,1);
  const roundReport=built.bodies[0].roundReport;assert.deepEqual(roundReport,installedRound.compiledCheckpoint.roundReport);assert.equal(roundReport.radiusMm,2);assert.equal(roundReport.control.kind,'fixed-radius');assert.equal(roundReport.cornerSemantics,'smooth-freeform-patches');assert.equal(roundReport.isolatedCornerTerminations,4);assert.deepEqual(roundReport.resolved.faceIds,params.faceIds);
  // A horizontal section has area WD - 2(W+D)d + pi*d^2,
  // d=R-sqrt(R^2-(z-H+R)^2), only in the top R band.
  const R=2,expectedVolumeMm3=40*30*10-2*(40+30)*R**2*(1-Math.PI/4)+Math.PI*R**3*(5/3-Math.PI/2);
  close(built.bodies[0].volume,expectedVolumeMm3);close(report.validation.volumeMm3,expectedVolumeMm3);
  const result=engine.shapes.get('round'),checker=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false),solids=result.solids,query=new cad.DistanceQuery(solids[0]);
  const distance=point=>{const vertex=cad.makeVertex(point);try{return query.distanceTo(vertex);}finally{dispose(vertex);}};
  let sectionSamples=0;
  try{
   assert.equal(checker.IsValid(),true);
   // Check the imported exact solid on both sides of four circular sections.
   for(let side=0;side<4;side++)for(const theta of [Math.PI/6,Math.PI/4,Math.PI/3]){
    const d=R*(1-Math.cos(theta)),z=8+R*Math.sin(theta),c=Math.cos(theta),s=Math.sin(theta);
    const point=[[20,d,z],[40-d,15,z],[20,30-d,z],[d,15,z]][side],normal=[[0,-c,s],[c,0,s],[0,c,s],[-c,0,s]][side];
    close(distance(point),0);close(distance(point.map((v,i)=>v+.01*normal[i])),.01);close(distance(point.map((v,i)=>v-.01*normal[i])),0);sectionSamples++;
   }
   const probes=[];for(const z of [.1,4,7.9])for(const [x,y]of [[.1,.1],[39.9,.1],[39.9,29.9],[.1,29.9]])probes.push({point:[x,y,z],present:true});
   for(const [x,y]of [[20,.1],[39.9,15],[20,29.9],[.1,15]])probes.push({point:[x,y,9.9],present:false});
   for(const [x,y]of [[20,1],[39,15],[20,29],[1,15]])probes.push({point:[x,y,9],present:true});
   probes.push({point:[20,15,9.9],present:true});
   for(const [x,y]of [[1.5,1.5],[38.5,1.5],[38.5,28.5],[1.5,28.5]])probes.push({point:[x,y,9.9],present:false});
   for(const [x,y]of [[1.5,2.7],[38.5,2.7],[38.5,27.3],[1.5,27.3]])probes.push({point:[x,y,9.9],present:true});
   for(const probe of probes)assert.equal(distance(probe.point)<1e-7,probe.present,JSON.stringify(probe));
   assert.equal(probes.length,29);
  }finally{dispose(query);solids.forEach(dispose);dispose(checker);}
  assert.equal(hash(engine.serializeFeatureShape('source').data),hash(sourceBytes),'Installing the result must preserve the source snapshot');
  const packet=encodeProjectV3(installed);fs.writeFileSync(path.join(data,'accepted.webcad'),packet);const reopened=await decodeProject(packet);
  assert.equal(geometryRecipeFingerprint(reopened,'round'),recipeFingerprint);assert.deepEqual(reopened.features.at(-1).compiledCheckpoint,installedRound.compiledCheckpoint);
  const operation=cold.operation.bind(cold);cold.operation=(feature,...args)=>{if(feature.id==='round')throw Error('Offline round must reuse its saved native geometry');return operation(feature,...args);};
  const opened=await cold.rebuild(reopened);assert.deepEqual(opened.compiledReuse,['round']);assert.deepEqual(opened.compiledInvalidated,[]);assert.deepEqual(opened.bodies[0].roundReport,roundReport);close(opened.bodies[0].volume,expectedVolumeMm3);
  const reversed=execute('reversed-normal',{...plan,selectionIntent:{...plan.selectionIntent,normal:plan.selectionIntent.normal.map(v=>-v)}});
  assert.notEqual(reversed.run.status,0);assert.equal(reversed.report.stage,'bind-planar-face');assert.equal(reversed.report.code,'NATIVE_BRIDGE_FAILED');assert.ok(!fs.existsSync(reversed.outputPath),'Rejected selection must not publish geometry');
  const evidence={status:'passed',scope:'fixed 40x30x10 one-edge R2 fixture; direct Native worker, actual WASM import/original-feature install/v3 offline reopen; no HTTP or product-model claim',producerKernelBuildId:kernelBuildId,consumerKernelBuildId:LOCAL_KERNEL_BUILD_ID,semanticVersion:plan.semanticVersion,sourceSha256:hash(sourceBytes),recipeFingerprint,artifactSha256:hash(bytes),expectedVolumeMm3,actualVolumeMm3:built.bodies[0].volume,sectionSamples,materialProbeCount:29,roundReport,sourceUnchanged:true,offlineCompiledReuse:opened.compiledReuse,rejected:reversed.report,reportPath:accepted.reportPath};
  fs.writeFileSync(path.join(data,'acceptance.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({evidence:path.join(data,'acceptance.json'),kernelBuildId,volumeMm3:built.bodies[0].volume}));
 }finally{engine.dispose();cold.dispose();}
});
