import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import net from 'node:net';import {spawn,spawnSync} from 'node:child_process';import {randomBytes,createHash} from 'node:crypto';
import init from 'replicad-opencascadejs';import * as cad from 'replicad';import {CadKernel} from '../src/cad-kernel.js';import {createServicesClient} from '../src/services/client.js';import {compileRemoteFeature} from '../src/services/remote-executor.js';import {installCompiledCandidate} from '../src/services/geometry-exchange.js';
test('the actual clicked cylindrical support binds natively while a blank pattern center lies in a real opening',async()=>{
 if(process.env.WEBCAD_SUPPORT_DIRECT==='1'){await verifyDirectSupport();return;}
 const host=process.env.WEBCAD_SERVICES_TEST_HOST,worker=process.env.WEBCAD_NATIVE_WORKER,proof=process.env.WEBCAD_NATIVE_ACCEPTANCE,logo=process.env.WEBCAD_SERVICES_TEST_LOGO_WORKER,root=process.env.WEBCAD_NATIVE_TEST_ROOT;assert(host&&worker&&proof&&logo&&root);await fs.mkdir(root,{recursive:true});const data=await fs.mkdtemp(path.join(root,'support-')),server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));const token=randomBytes(32).toString('hex'),child=spawn(host,['--console'],{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,WEBCAD_SERVICES_TOKEN:token,WEBCAD_SERVICES_DATA_ROOT:data,WEBCAD_SERVICES_LOGO_WORKER:logo,WEBCAD_SERVICES_OCCT_WORKER:worker,WEBCAD_SERVICES_NATIVE_ACCEPTANCE:proof,WEBCAD_SERVICES_PIPE_NAME:'WebCADServices-support-test',WEBCAD_SERVICES_DEV_HTTP:`http://127.0.0.1:${port}/`}}),client=createServicesClient({config:{enabled:true,url:`http://127.0.0.1:${port}/api.ashx`},credential:token});let engine;const owned=[];let diagnostic='';child.stderr.on('data',b=>{diagnostic=(diagnostic+b).slice(-2048);});
 try{
  const deadline=Date.now()+15000;for(;;){try{await client.capabilities();break;}catch(error){if(child.exitCode!==null||Date.now()>deadline)throw Error(diagnostic||error.message);await new Promise(r=>setTimeout(r,100));}}
  const oc=await init({wasmBinary:await fs.readFile(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);const keep=s=>(owned.push(s),s),cylinder=keep(cad.makeCylinder(20,10)),rotated=keep(cylinder.clone().rotate(-90,[0,0,0],[1,0,0])),placed=keep(rotated.clone().translate([0,-5,-20])),hole=keep(cad.makeCylinder(.5,5,[0,0,2],[0,0,-1])),source=keep(placed.cut(hole)),faces=source.faces,faceId=faces.findIndex(f=>f.geomType==='CYLINDRE');faces.forEach(f=>f.delete());
  const point=[1.5,0,Math.sqrt(400-2.25)-20],rect=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d]],params={faceId,point,offsetX:-20*Math.asin(1.5/20),widthMm:6,heightMm:6,depthMm:.3,baseMm:.005,maskStrategy:'faceWithHolesExtrude',curvePolicy:'preserveTopology',curveToleranceMm:.005,layers:[{heightMm:.3,regions:[{outer:rect(-.4,-.3,-.12,.3)},{outer:rect(.12,-.3,.4,.3)}]}]},doc={version:2,documentId:'support-opening',imports:{source:{format:'brep',data:Buffer.from(source.serialize()).toString('base64')}},features:[{id:'source',op:'import',params:{key:'source'},refs:[]},{id:'relief',op:'relief',params,refs:['source']}]};engine=new CadKernel(oc);const local=await engine.rebuild({...doc,features:doc.features.filter(f=>f.op!=='relief')}),bytes=engine.serializeFeatureShape('source').data,plan=engine.prepareReliefPlan('source',params).plan;
  assert(Math.hypot(...plan.supportIntent.point.map((v,i)=>v-point[i]))<1e-7);assert(Math.hypot(...plan.layers[0].support.origin.map((v,i)=>v-[0,0,0][i]))<1e-7);const context={documentId:doc.documentId,documentInstanceId:'support-opening-instance',expectedRevision:1},candidate=await compileRemoteFeature(doc,'relief',bytes,context,{allowUpload:true,client,plan}),installed=installCompiledCandidate(doc,{manifest:candidate.manifest,bytes:candidate.geometryBytes,context,recipeFingerprint:candidate.recipeFingerprint}),native=await engine.rebuild(installed);assert.deepEqual(native.compiledReuse,['relief']);assert.equal(native.bodies[0].solidCount,1);assert.equal(candidate.manifest.topologyBinding.matchCount,1);assert.deepEqual(installed.features.at(-1).params,params);await fs.writeFile(path.join(data,'acceptance.json'),JSON.stringify({status:'passed',scope:'actual clicked support vs blank image center opening; not a product acceptance',jobId:candidate.manifest.jobId,sourceSelection:plan.supportIntent,imageCenter:plan.layers[0].support.origin,localVolumeMm3:local.bodies[0].volume,nativeVolumeMm3:native.bodies[0].volume},null,2));
 }finally{if(child.exitCode===null&&child.signalCode===null){child.kill();await new Promise(r=>child.once('exit',r));}if(engine)for(const s of engine.shapes.values())s.delete();owned.reverse().forEach(s=>s.delete());}
});

// The focused N2 route uses the actual new binary without a Host or an old
// acceptance file. It produces diagnostic evidence, never capability approval.
async function verifyDirectSupport(){
 const worker=process.env.WEBCAD_NATIVE_WORKER,root=process.env.WEBCAD_NATIVE_TEST_ROOT;
 assert(worker&&root,'Actual worker and external evidence directory required');
 await fs.mkdir(root,{recursive:true});const resume=process.env.WEBCAD_SUPPORT_CONTINUE_FROM,data=resume??await fs.mkdtemp(path.join(root,'support-direct-'));
 const hash=b=>createHash('sha256').update(b).digest('hex'),wasm=await fs.readFile(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url));
 const evidence={status:'running',scope:'generic R20 cylinder with real radius-0.5 opening; no real product, Host, capability or deployment acceptance',commitState:'notCommitted',workerPath:worker,workerSha256:hash(await fs.readFile(worker)),producerKernelBuildId:`native-occt@7.8.1:sha256:${hash(await fs.readFile(worker))}`,consumerKernelBuildId:`replicad-opencascadejs@1.1.0:sha256:${hash(wasm)}`,attempts:[],baselines:[]};
 let prior;
 if(resume){
  // Continue verification of the SAME actual new-worker result. Never rewrite
  // the failed proof, repeat its native invocation or transplant an A06 proof.
  const priorBytes=await fs.readFile(path.join(data,'support-binding-focused-proof.json'));prior=JSON.parse(priorBytes);
  assert.equal(prior.workerSha256,evidence.workerSha256);assert.equal(prior.consumerKernelBuildId,evidence.consumerKernelBuildId);assert.equal(prior.attempts.length,1);assert.equal(prior.attempts[0].name,'clicked-support');assert.equal(prior.attempts[0].exitCode,0);
  evidence.previousVerification={proofPath:path.join(data,'support-binding-focused-proof.json'),sha256:hash(priorBytes),status:prior.status,failure:prior.failure};evidence.baselines=prior.baselines;
 }
 const evidencePath=path.join(data,resume?'support-binding-continuation-proof.json':'support-binding-focused-proof.json'),save=()=>fs.writeFile(evidencePath,JSON.stringify(evidence,null,2));
 if(resume)await assert.rejects(fs.access(evidencePath),'Continuation is single-use');await save();
 const oc=await init({wasmBinary:wasm});cad.setOC(oc);const owned=[],keep=s=>(owned.push(s),s);let engine;
 const invoke=async(name,sourcePath,params)=>{
  const dir=path.join(data,name);await fs.mkdir(dir);const requestPath=path.join(dir,'request.json'),reportPath=path.join(dir,'report.json'),outputPath=path.join(dir,'result.brep');
  const sourceBytes=await fs.readFile(sourcePath),request={operation:'relief',semanticVersion:'relief.compiled-contours-1.0',strategy:'faceWithHolesExtrude',params,sourcePath,outputPath,reportPath,inputFingerprint:hash(sourceBytes),featureId:'generic-support',expectedRevision:1};
  assert(!JSON.stringify(params).includes('faceId'),'No numeric topology selection in native request');await fs.writeFile(requestPath,JSON.stringify(request));
  const started=Date.now(),run=spawnSync(worker,[requestPath],{cwd:dir,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:4096,env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR}});
  const bytes=await fs.readFile(reportPath),report=JSON.parse(bytes);assert(bytes.length<16384,'Diagnostic report must remain bounded');
  const attempt={name,command:[worker,requestPath],sourceSha256:hash(sourceBytes),requestSha256:hash(await fs.readFile(requestPath)),reportSha256:hash(bytes),reportPath,exitCode:run.status,elapsedMs:Date.now()-started,stage:report.stage??'completed',ok:report.ok,supportBinding:report.supportBinding};
  evidence.attempts.push(attempt);await save();assert(!run.error,run.error?.message);assert.equal(run.signal,null);
  return {run,report,outputPath,dir};
 };
 const rejected=async(name,sourcePath,intent,reason,count)=>{
  // A readable tool cannot be reached: each case must fail during binding,
  // before any layer geometry read, mask/prism or Boolean is attempted.
  const toolPath=path.join(data,'deliberately-absent-tool.brep');
  const {run,report,outputPath,dir}=await invoke(name,sourcePath,{supportIntent:intent,layers:[{toolPath,normal:[0,0,1],spanMm:1,regions:[],memberLayerIds:['test']}]});
  assert.equal(run.status,4);assert.equal(report.ok,false);assert.equal(report.stage,'support-binding');assert.equal(report.code,'NATIVE_BRIDGE_FAILED');
  assert.equal(report.supportBinding.status,'rejected');assert.equal(report.supportBinding.failureReason,reason);assert.equal(report.supportBinding.counts.matchCount,count);
  assert.equal(report.supportBinding.numericIndicesTransferred,false);assert(report.supportBinding.samples.length<=16);assert.deepEqual(report.supportBinding.intent,intent);
  await assert.rejects(fs.access(outputPath));await assert.rejects(fs.access(outputPath+'.partial'));
  const progress=JSON.parse(await fs.readFile(path.join(dir,'report.json.progress.json'),'utf8'));assert.equal(progress.stage,'support-binding');
  return report.supportBinding;
 };
 try{
  // This is the existing real-opening support fixture, with its source design,
  // selected point, radii, depth and explicit contours unchanged.
  let source,local,plan,layers;
  const sourcePath=path.join(data,'source.brep');
  if(resume){
   const actual=prior.attempts[0],sourceBytes=await fs.readFile(sourcePath),requestBytes=await fs.readFile(actual.command[1]);assert.equal(hash(sourceBytes),actual.sourceSha256);assert.equal(hash(requestBytes),actual.requestSha256);
   const request=JSON.parse(requestBytes);source=keep(cad.deserializeShape(sourceBytes.toString()));local={bodies:[{volume:prior.baselines[0].localReliefVolumeMm3}]};plan={supportIntent:request.params.supportIntent,layers:[{support:{origin:prior.baselines[0].imageCenter}}]};layers=request.params.layers;
  }else{
  const cylinder=keep(cad.makeCylinder(20,10)),rotated=keep(cylinder.clone().rotate(-90,[0,0,0],[1,0,0])),placed=keep(rotated.clone().translate([0,-5,-20])),hole=keep(cad.makeCylinder(.5,5,[0,0,2],[0,0,-1]));source=keep(placed.cut(hole));const faces=source.faces,faceId=faces.findIndex(f=>f.geomType==='CYLINDRE');faces.forEach(f=>f.delete());
  const point=[1.5,0,Math.sqrt(400-2.25)-20],rect=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d]],params={faceId,point,offsetX:-20*Math.asin(1.5/20),widthMm:6,heightMm:6,depthMm:.3,baseMm:.005,maskStrategy:'faceWithHolesExtrude',curvePolicy:'preserveTopology',curveToleranceMm:.005,layers:[{heightMm:.3,regions:[{outer:rect(-.4,-.3,-.12,.3)},{outer:rect(.12,-.3,.4,.3)}]}]},doc={version:2,documentId:'support-opening',imports:{source:{format:'brep',data:Buffer.from(source.serialize()).toString('base64')}},features:[{id:'source',op:'import',params:{key:'source'},refs:[]},{id:'relief',op:'relief',params,refs:['source']}]};
  engine=new CadKernel(oc);local=await engine.rebuild({...doc,features:doc.features.filter(f=>f.op!=='relief')});plan=engine.prepareReliefPlan('source',params).plan;await fs.writeFile(sourcePath,plan.sourceBrep);
  assert(Math.hypot(...plan.supportIntent.point.map((v,i)=>v-point[i]))<1e-7);assert.equal(plan.supportIntent.radiusMm,20);assert.equal(plan.supportIntent.axis.length,3);assert.equal(plan.supportIntent.normal.length,3);
  assert(Math.hypot(...plan.layers[0].support.origin)<1e-7);const checker=new oc.BRepCheck_Analyzer(source.wrapped,true,false,false);try{assert(checker.IsValid());}finally{checker.delete();}
  const sourceBytes=await fs.readFile(sourcePath),paths={};for(const artifact of plan.artifacts){paths[artifact.id]=path.join(data,artifact.id+'.brep');await fs.writeFile(paths[artifact.id],artifact.data);}
  layers=plan.layers.map(layer=>({toolPath:paths[layer.toolArtifactId],boundaryPath:paths[layer.boundaryArtifactId],normal:layer.normal,spanMm:layer.spanMm,regions:layer.regions,memberLayerIds:layer.memberLayerIds}));
  evidence.baselines.push({name:'real-opening-generic',sourceSha256:hash(sourceBytes),sourceVolumeMm3:cad.measureVolume(source),localReliefVolumeMm3:local.bodies[0].volume,sourceSelection:plan.supportIntent,imageCenter:plan.layers[0].support.origin,layerCount:1,regionCount:2,sourcePointValidated:true});await save();
  }
  const sourceBytes=await fs.readFile(sourcePath);let positive;
  if(resume){const actual=prior.attempts[0],reportBytes=await fs.readFile(actual.reportPath);assert.equal(hash(reportBytes),actual.reportSha256);positive={run:{status:actual.exitCode},report:JSON.parse(reportBytes),outputPath:path.join(data,'clicked-support','result.brep')};evidence.reusedActualPositive={...actual,verificationOnly:true,nativeInvokedAgain:false};await save();}
  else positive=await invoke('clicked-support',sourcePath,{supportIntent:plan.supportIntent,layers});
  const {run,report,outputPath}=positive;assert.equal(run.status,0);assert.equal(report.ok,true);assert.equal(report.kernelVersion,'7.8.1');assert.equal(report.validation.solidCount,1);
  assert.equal(report.supportBinding.status,'bound');assert.equal(report.supportBinding.counts.matchCount,1);assert.equal(report.topologyBinding.matchCount,1);assert.equal(report.topologyBinding.numericIndicesTransferred,false);assert.deepEqual(report.supportBinding.intent,plan.supportIntent);
  assert.equal(report.supportBinding.normalProbe.minusNormalState,'IN');assert.equal(report.supportBinding.normalProbe.plusNormalState,'OUT');assert(report.stages.some(s=>s.stage==='support-binding'));
  const resultBytes=await fs.readFile(outputPath),native=keep(cad.deserializeShape(resultBytes.toString())),nativeChecker=new oc.BRepCheck_Analyzer(native.wrapped,true,false,false);try{assert(nativeChecker.IsValid());}finally{nativeChecker.delete();}
  // Match CadKernel's adaptive integration, retaining the original tolerance.
  // The native report separately uses default VolumeProperties, so compare it
  // with the SAME default method rather than mixing the two quadratures.
  const props=new oc.GProp_GProps();let nativeVolume;
  try{const error=oc.BRepGProp.VolumePropertiesGK(native.wrapped,props,1e-9,true,true,false,false,false);assert(Number.isFinite(error)&&error>=0);nativeVolume=Math.abs(props.Mass());}finally{props.delete();}
  const defaultNativeVolume=cad.measureVolume(native);assert(nativeVolume>cad.measureVolume(source));assert(Math.abs(report.validation.volumeMm3-defaultNativeVolume)<1e-6);
  const opening=keep(cad.makeVertex([0,0,0])),openingDistance=cad.measureDistanceBetween(opening,native);assert(openingDistance>.1,'Real opening must remain open');
  let boundarySamples=0,maxBoundaryDistanceMm=0;const edges=source.edges;try{for(const edge of edges)for(const t of [0,.25,.5,.75,1]){const p=edge.pointAt(t);try{const vertex=cad.makeVertex(p.toTuple());try{maxBoundaryDistanceMm=Math.max(maxBoundaryDistanceMm,cad.measureDistanceBetween(vertex,native));boundarySamples++;}finally{vertex.delete();}}finally{p.delete();}}}finally{edges.forEach(e=>e.delete());}assert(maxBoundaryDistanceMm<1e-7);
  evidence.positiveGeometry={localVolumeMm3:local.bodies[0].volume,nativeVolumeMm3:nativeVolume,defaultNativeVolumeMm3:defaultNativeVolume,volumeMethod:'VolumePropertiesGK 1e-9 matching CadKernel; native report compared separately with default VolumeProperties',outputSha256:hash(resultBytes),openingDistanceMm:openingDistance,boundarySamples,maxBoundaryDistanceMm,scope:'sampled unchanged source boundary and actual opening; not global geometric equivalence'};await save();
  const wrongPoint=await rejected('wrong-point-in-opening',sourcePath,{...plan.supportIntent,point:plan.layers[0].support.origin},'no-match',0);assert(wrongPoint.rejections.outsideTrimmedDomain>=1);assert(wrongPoint.samples.some(s=>s.trimmedDistanceMm>.1));
  const noMatch=await rejected('no-radius-match',sourcePath,{...plan.supportIntent,radiusMm:21},'no-match',0);assert(noMatch.rejections.radiusMismatch>=1);assert.equal(noMatch.counts.trimmedDistanceChecks,0);
  const inward=await rejected('normal-not-outward',sourcePath,{...plan.supportIntent,normal:plan.supportIntent.normal.map(v=>-v)},'normal-not-outward',1);assert.equal(inward.normalProbe.minusNormalState,'OUT');assert.equal(inward.normalProbe.plusNormalState,'IN');
  // A separate, valid one-solid diagnostic fixture has two cylindrical patches
  // sharing y=0. Keep the split faces; no relief Boolean is performed on it.
  const lower=keep(cad.makeCylinder(20,5,[0,-5,-20],[0,1,0])),upper=keep(cad.makeCylinder(20,5,[0,0,-20],[0,1,0])),fuse=new oc.BRepAlgoAPI_Fuse(lower.wrapped,upper.wrapped);let split;
  try{fuse.Build();split=keep(cad.cast(fuse.Shape()));}finally{fuse.delete();}
  const splitCheck=new oc.BRepCheck_Analyzer(split.wrapped,true,false,false);try{assert(splitCheck.IsValid());}finally{splitCheck.delete();}
  const splitFaces=split.faces;try{assert.equal(splitFaces.filter(f=>f.geomType==='CYLINDRE').length,2);}finally{splitFaces.forEach(f=>f.delete());}
  const splitPath=path.join(data,'split-cylinder.brep');await fs.writeFile(splitPath,split.serialize());evidence.baselines.push({name:'shared-boundary-two-cylinder-patches',sourceSha256:hash(await fs.readFile(splitPath)),valid:true,sourceVolumeMm3:cad.measureVolume(split),clickedPoint:plan.supportIntent.point,scope:'synthetic ambiguity fixture only'});await save();
  await rejected('ambiguous-shared-boundary',splitPath,plan.supportIntent,'ambiguous',2);
  assert.equal(hash(await fs.readFile(sourcePath)),hash(sourceBytes),'Source bytes unchanged');evidence.status='focused-support-binding-passed; stable-subset-1.2-Host-page-save-deployment-gates-pending';await save();
 }catch(error){evidence.status='failed';evidence.failure={message:error.message.slice(0,1024)};await save();throw error;}
 finally{if(engine)for(const s of engine.shapes.values())s.delete();owned.reverse().forEach(s=>s.delete());}
}
