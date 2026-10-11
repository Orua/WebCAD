import test from 'node:test';
import assert from 'node:assert/strict';
import {binaryHash} from '../src/contracts/operation-schema.js';
import {aggregateSourceComplexity,collectRoutingSources,physicalExecutionKey} from '../src/services/execution-context.js';
import {chooseExecutor,classifyComplexity} from '../src/services/execution-router.js';
import {assertCompilableFeature,compiledSemanticVersion,geometryRecipeFingerprint,installCompiledCandidate,compiledCheckpointBytes,VERIFIED_NATIVE_KERNELS,GEOMETRY_CODEC} from '../src/services/geometry-exchange.js';
import {compileRemoteFeature} from '../src/services/remote-executor.js';
import {encodeProjectV3,decodeProject} from '../src/project-container.js';
const bytes=text=>new TextEncoder().encode(text),sha=buffer=>binaryHash(buffer).slice(7);
const inputs=[bytes('target'),bytes('first tool'),bytes('second tool')];
const context={documentId:'boolean-contract',documentInstanceId:'instance',expectedRevision:1};
const fixture=()=>({version:2,documentId:context.documentId,imports:{},features:[
 {id:'target',op:'box',params:{x:80,y:80,z:10},refs:[]},
 {id:'tool-a',op:'cylinder',params:{radius:2.5,height:12},refs:[]},
 {id:'tool-b',op:'cylinder',params:{radius:3,height:12},refs:[]},
 {id:'cut',op:'cut',params:{keepTools:true},refs:['target','tool-a','tool-b']}
]});
const manifestFor=doc=>({featureId:'cut',...context,operation:'cut',semanticVersion:'boolean.cut-1.0',codec:GEOMETRY_CODEC,units:'mm',coordinateSystem:'world-xyz-right-handed',kernelBuildId:[...VERIFIED_NATIVE_KERNELS][0],recipeFingerprint:geometryRecipeFingerprint(doc,'cut'),sourceSha256:sha(inputs[0]),inputSha256:inputs.map(sha),strategy:'multi-source-boolean',topologyBinding:{kind:'whole-sources',matchCount:3,numericIndicesTransferred:false},geometryArtifact:{sha256:sha(bytes('exact-test-container')),bytes:bytes('exact-test-container').length,format:GEOMETRY_CODEC,brepVersion:3},validation:{valid:true,solidCount:1}});
test('cut checkpoints bind every ordered input and survive the v3 container',async()=>{
 const doc=fixture(),manifest=manifestFor(doc),data=bytes('exact-test-container');
 const installed=installCompiledCandidate(doc,{manifest,bytes:data,context,recipeFingerprint:manifest.recipeFingerprint});
 const reopened=await decodeProject(encodeProjectV3(installed,{includeTimeline:false})),feature=reopened.features.at(-1);
 assert.deepEqual(compiledCheckpointBytes(reopened,feature,inputs),data);
 assert.equal(feature.params.keepTools,true);assert.deepEqual(feature.refs,['target','tool-a','tool-b']);
 assert.equal(compiledCheckpointBytes(reopened,feature,[inputs[0],inputs[1],bytes('changed second tool')]),null);
 assert.equal(compiledCheckpointBytes(reopened,feature,[inputs[0],inputs[2],inputs[1]]),null);
 const changed=structuredClone(reopened);changed.features[2].params.radius=4;
 assert.equal(compiledCheckpointBytes(changed,changed.features.at(-1),inputs),null);
 const damaged=structuredClone(feature);delete damaged.compiledCheckpoint.inputSha256;
 assert.throws(()=>compiledCheckpointBytes(reopened,damaged),{code:'ARTIFACT_CORRUPT'});
 const incomplete={...manifest,inputSha256:manifest.inputSha256.slice(0,2)};
 assert.throws(()=>installCompiledCandidate(doc,{manifest:incomplete,bytes:data,context,recipeFingerprint:manifest.recipeFingerprint}),{code:'RESULT_MISMATCH'});
});
test('many input routing aggregates all sources but keeps each source budget separate',()=>{
 const rows=Array.from({length:26},(_,i)=>({faces:6,edges:12,solids:1,bytes:1024,holes:0,sourceSha256:sha(bytes(String(i)))}));
 const source=aggregateSourceComplexity(rows),capability={operation:'cut',semanticVersion:'boolean.cut-1.0',enabled:true,acceptanceStatus:'passed',limits:{maxSolids:33,maxSolidsPerInput:1,maxSources:33,maxSourceBytes:20*1024*1024,maxTotalSourceBytes:64*1024*1024}};
 const args={operation:'cut',semanticVersion:capability.semanticVersion,source,servicesAvailable:true,clientImportReady:true,capabilities:{operations:[capability]}};
 assert.equal(source.faces,156);assert.equal(source.solids,26);assert.deepEqual(source.inputSha256,rows.map(row=>row.sourceSha256));
 assert.equal(chooseExecutor(args).executor,'remote');assert.equal(chooseExecutor({...args,servicesAvailable:false}).executor,'local');
 assert.equal(classifyComplexity({operation:'cut',source:{sourceCount:12}}).complex,false);
 assert.ok(classifyComplexity({operation:'cut',source:{sourceCount:13}}).reasons.includes('many-boolean-inputs'));
 assert.equal(chooseExecutor({...args,source:{...source,bytes:40*1024*1024,maxSourceBytes:10*1024*1024}}).executor,'remote');
 assert.equal(chooseExecutor({...args,source:{...source,bytes:65*1024*1024}}).routingReason,'source-budget-exceeded');
 assert.equal(chooseExecutor({...args,source:{...source,bytes:65*1024*1024},capabilities:{operations:[{...capability,limits:{...capability.limits,maxTotalSourceBytes:undefined,maxInputBytes:64*1024*1024}}]}}).routingReason,'source-budget-exceeded');
 assert.equal(chooseExecutor({...args,source:{...source,maxSolidsPerInput:2}}).routingReason,'source-solid-count-unsupported');
 const feature=fixture().features.at(-1),key=physicalExecutionKey(feature,source.inputSha256,'kernel','endpoint');
 assert.equal(key,physicalExecutionKey({...feature,params:{keepTools:false}},source.inputSha256,'kernel','endpoint'));
 assert.notEqual(key,physicalExecutionKey(feature,[...source.inputSha256.slice(0,-1),'changed'],'kernel','endpoint'));
});
test('remote cut uploads ordered snapshots once and rejects a mismatched second tool result',async()=>{
 const document=fixture(),submitted=[],uploads=[];let mismatch=false;
 const client={capabilities:async()=>({operations:[{operation:'cut',semanticVersion:'boolean.cut-1.0',enabled:true,acceptanceStatus:'passed'}]}),
  upload:async file=>{const data=new Uint8Array(await file.arrayBuffer());uploads.push(data);return {assetId:`asset-${uploads.length}`,sha256:sha(data)};},
  submit:async(_route,payload)=>{submitted.push(payload);return {jobId:'job'};},
  wait:async()=>({manifest:{sourceSha256:sha(inputs[0]),inputSha256:mismatch?[sha(inputs[0]),sha(inputs[1]),'wrong']:inputs.map(sha)}})};
 await compileRemoteFeature(document,'cut',inputs,context,{allowUpload:true,client});
 assert.equal(submitted.length,1);assert.equal(uploads.length,3);assert.deepEqual(submitted[0].params,{});
 assert.equal(submitted[0].strategy,'multi-source-boolean');assert.deepEqual(submitted[0].selectionIntent,{kind:'whole-sources'});
 assert.deepEqual(submitted[0].inputs.map(row=>[row.role,row.sourceFeatureId,row.sha256]),inputs.map((data,i)=>[i?'tool':'source',document.features[i].id,sha(data)]));
 mismatch=true;await assert.rejects(compileRemoteFeature(document,'cut',inputs,context,{allowUpload:true,client}),{code:'RESULT_MISMATCH'});
 assert.equal(submitted.length,2,'no automatic retry');
});
test('remote cut rejects unsupported semantics before any upload',()=>{
 const feature=fixture().features.at(-1);assert.equal(compiledSemanticVersion(feature),'boolean.cut-1.0');assert.deepEqual(assertCompilableFeature(feature),{});
 for(const patch of [{refs:['target']},{refs:['target','target']},{params:{keepTools:'yes'}},{params:{fuzzy:0.1}}])assert.throws(()=>assertCompilableFeature({...feature,...patch}),{code:'OPERATION_UNAVAILABLE'});
});

test('cancelling during the first cut upload stops remaining uploads and submits no job',async()=>{
 const controller=new AbortController();let uploads=0,submits=0,waits=0;
 const client={capabilities:async()=>({operations:[{operation:'cut',semanticVersion:'boolean.cut-1.0',enabled:true,acceptanceStatus:'passed'}]}),
  upload:async file=>{uploads++;const data=new Uint8Array(await file.arrayBuffer());controller.abort();return {assetId:'source-asset',sha256:sha(data)};},
  submit:async()=>{submits++;},wait:async()=>{waits++;}};
 await assert.rejects(compileRemoteFeature(fixture(),'cut',inputs,context,{allowUpload:true,client,signal:controller.signal}),{code:'CANCELLED',submitted:false,commitState:'notCommitted'});
 assert.equal(uploads,1);assert.equal(submits,0);assert.equal(waits,0);
});
test('consumed hidden inputs remain authoritative for routing; changed dependencies cannot become simple',async()=>{
 const features=[{id:'tool',op:'box',refs:[]},{id:'cut',op:'cut',params:{},refs:['target','tool']}],reads=[];
 const readSource=async id=>{reads.push(id);return id==='target'?{faces:160,edges:480,solids:1,bytes:1000}:{faces:6,edges:12,solids:1,bytes:500};};
 const summaries=await collectRoutingSources(features,{hasSource:()=>true,changedSourceIds:new Set(['tool']),readSource});
 assert.deepEqual(reads,['target','tool']);assert.equal(summaries.get('cut').faces,166);
 assert.equal(classifyComplexity({operation:'cut',source:summaries.get('cut')}).complex,true);
 const newSources=await collectRoutingSources(features,{hasSource:()=>false,readSource:()=>assert.fail('uncommitted sources cannot be read')});
 assert.equal(newSources.get('cut').sourceSnapshotReady,false);
 assert.ok(classifyComplexity({operation:'cut',source:newSources.get('cut')}).reasons.includes('changed-or-unmeasured-source'));
});
