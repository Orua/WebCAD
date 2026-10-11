import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const dispose=shape=>{try{shape?.delete?.();}catch{}};

test('native multi-source Cut preserves the 25-hole intent, imports exact geometry and rejects empty/split outputs',async()=>{
 const worker=process.env.WEBCAD_NATIVE_WORKER,root=process.env.WEBCAD_NATIVE_TEST_ROOT;
 assert.ok(worker&&root,'Actual native OCCT binary and an external test root are required');
 fs.mkdirSync(root,{recursive:true});const data=fs.mkdtempSync(path.join(root,'boolean-'));
 const wasm=fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url)),oc=await init({wasmBinary:wasm});cad.setOC(oc);
 const source=cad.makeBox([0,0,0],[80,80,10]),points=Array.from({length:25},(_,i)=>[12+14*Math.floor(i/5),12+14*(i%5)]),tools=points.map(([x,y])=>cad.makeCylinder(2.5,12,[x,y,-1]));
 const sourceBytes=source.serialize(),toolBytes=tools.map(tool=>tool.serialize());let result;
 const execute=(name,sourceText,toolTexts)=>{
  const dir=path.join(data,name);fs.mkdirSync(dir);const sourcePath=path.join(dir,'source.brep'),outputPath=path.join(dir,'result.brep'),reportPath=path.join(dir,'report.json'),requestPath=path.join(dir,'request.json');fs.writeFileSync(sourcePath,sourceText);
  const toolPaths=toolTexts.map((bytes,i)=>{const file=path.join(dir,`tool-${i}.brep`);fs.writeFileSync(file,bytes);return file;});
  fs.writeFileSync(requestPath,JSON.stringify({operation:'cut',semanticVersion:'boolean.cut-1.0',strategy:'multi-source-boolean',params:{toolPaths},sourcePath,outputPath,reportPath,inputFingerprint:hash(Buffer.from([sourceText,...toolTexts].join('\n'))),featureId:name,expectedRevision:1}));
  const run=spawnSync(worker,[requestPath],{windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:16384});assert.ok(fs.existsSync(reportPath),`Native report missing: ${run.error??run.stderr}`);
  const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));return {run,report,outputPath,requestPath,sourcePath,toolPaths};
 };
 try{
  const accepted=execute('25-through-holes',sourceBytes,toolBytes);assert.equal(accepted.run.status,0,JSON.stringify(accepted.report));assert.equal(accepted.report.kernelVersion,'7.8.1');assert.equal(accepted.report.validation.solidCount,1);assert.deepEqual(accepted.report.topologyBinding,{kind:'whole-sources',matchCount:26,numericIndicesTransferred:false});
  const bytes=fs.readFileSync(accepted.outputPath);result=cad.deserializeShape(bytes.toString());const analyzer=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);try{assert.ok(analyzer.IsValid());}finally{dispose(analyzer);}
  const expectedVolumeMm3=64000-25*Math.PI*2.5**2*10,actualVolumeMm3=cad.measureVolume(result);assert.ok(Math.abs(actualVolumeMm3-expectedVolumeMm3)<1e-6);
  const solids=result.solids,query=new cad.DistanceQuery(solids[0]);
  const distance=point=>{const vertex=cad.makeVertex(point);try{return query.distanceTo(vertex);}finally{dispose(vertex);}};
  try{for(const [x,y]of points)assert.ok(Math.abs(distance([x,y,5])-2.5)<1e-6,'Every declared hole retains its empty center and radius');
   for(const point of [[3,3,5],[5,75,5],[75,5,5],[40,5,5],[5,40,5]])assert.ok(distance(point)<1e-7,'Non-target stock is retained');
  }finally{query.delete();solids.forEach(dispose);}
  assert.equal(source.serialize(),sourceBytes);assert.deepEqual(tools.map(tool=>tool.serialize()),toolBytes);
  const empty=execute('empty-result',sourceBytes,[sourceBytes]);assert.equal(empty.run.status,4);assert.equal(empty.report.code,'BOOLEAN_EMPTY_RESULT');assert.ok(!fs.existsSync(empty.outputPath));
  const splitter=cad.makeBox([39,-1,-1],[41,81,11]);let split;try{split=execute('split-result',sourceBytes,[splitter.serialize()]);}finally{dispose(splitter);}assert.equal(split.run.status,4);assert.equal(split.report.code,'BOOLEAN_MULTIPLE_SOLIDS');assert.ok(!fs.existsSync(split.outputPath));
  const invalid=execute('invalid-tool',sourceBytes,['Invalid BRep input fixture']);assert.notEqual(invalid.run.status,0);assert.equal(invalid.report.stage,'read-boolean-tools');assert.ok(!fs.existsSync(invalid.outputPath));
  const evidence={status:'native-cut-and-client-codec-passed',scope:'Native OCCT 7.8.1 multi-source Cut and real WASM import; HTTP/page/install/save gates remain pending',producerKernelBuildId:`native-occt@7.8.1:sha256:${hash(fs.readFileSync(worker))}`,consumerKernelBuildId:`replicad-opencascadejs@1.1.0:sha256:${hash(wasm)}`,codec:'occt-text-brep-v1',brepVersion:3,semanticVersion:'boolean.cut-1.0',sourceCount:26,expectedVolumeMm3,actualVolumeMm3,holeProbeCount:25,materialProbeCount:5,sourceUnchanged:true,toolInputsUnchanged:true,resultSha256:hash(bytes),validation:accepted.report.validation,topologyBinding:accepted.report.topologyBinding,timings:accepted.report.timings,rejected:[empty.report.code,split.report.code,invalid.report.code],fixture:{sourcePath:accepted.sourcePath,toolPaths:accepted.toolPaths},data};
  const evidencePath=path.join(data,'acceptance.json');fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  const buildRoot=process.env.WEBCAD_SERVICES_TEST_BUILD_ROOT,runtimeDirectory=process.env.WEBCAD_SERVICES_RUNTIME_DIRECTORY??(buildRoot?path.join(buildRoot,'bin/WebCADServices.Gateway/Release/net48'):null),protocolRoot=process.env.WEBCAD_BOOLEAN_PROTOCOL_ROOT??process.env.WEBCAD_SERVICES_TEST_ROOT;
  assert.ok(runtimeDirectory&&protocolRoot&&/^F:[\\/]/i.test(protocolRoot),'Actual managed Gateway/Runtime binaries and an explicit fixed F: protocol store root are required');
  fs.mkdirSync(protocolRoot,{recursive:true});const protocolData=fs.mkdtempSync(path.join(protocolRoot,'boolean-protocol-'));
  const protocol=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./services-boolean-protocol.ps1',import.meta.url)),'-RuntimeDirectory',runtimeDirectory,'-DataRoot',protocolData,'-NativeWorker',worker,'-NativeEvidence',evidencePath],{windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:16384});assert.equal(protocol.status,0,`${protocol.stdout}\n${protocol.stderr}`);assert.match(protocol.stdout,/passed:/);
  evidence.protocol=JSON.parse(fs.readFileSync(path.join(protocolData,'acceptance.json'),'utf8').replace(/^\uFEFF/,''));evidence.protocolData=protocolData;fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));console.log(JSON.stringify({evidence:evidencePath,kernelBuildId:evidence.producerKernelBuildId,volumeMm3:actualVolumeMm3,totalMs:evidence.timings.totalMs,protocolData}));
 }finally{dispose(result);dispose(source);tools.forEach(dispose);}
});
