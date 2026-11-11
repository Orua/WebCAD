import {validBlendExecution} from '../src/modeling/blend-radius-contract.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCompilableFeature,compiledSemanticVersion} from '../src/services/geometry-exchange.js';
import {compileRemoteFeature} from '../src/services/remote-executor.js';
import {binaryHash} from '../src/contracts/operation-schema.js';
const sha=x=>binaryHash(x).slice(7);
test('remote seam contracts exclude unsupported laws and browser topology IDs',()=>{
 assert.equal(compiledSemanticVersion({op:'union'}),'boolean.union-seam-1.0');
 const union={op:'union',refs:['a','b'],params:{blendRadiusMm:.35}};assertCompilableFeature(union);
 for(const patch of [{refs:['a','a']},{params:{blendLaw:{startRadiusMm:.2,endRadiusMm:.3}}},{params:{blendRadiusMm:-1}}])assert.throws(()=>assertCompilableFeature({...union,...patch}));
 const spatial={op:'smoothTransition',refs:['a'],params:{radius:.2,selector:{edgesNear:{pointMm:[0,0,1],radiusMm:.1}}}};assertCompilableFeature(spatial);
 for(const params of [{radius:.2,edgeIds:[0]},{radius:{maxMm:.1,minMm:.2},selector:spatial.params.selector},{radius:.2,selector:{seamBetween:{a:'a',b:'b'}}}])assert.throws(()=>assertCompilableFeature({...spatial,params}));
});
test('union transports every ordered source and exact blend parameters, rejects mismatched tool hash',async()=>{
 const inputs=[new Uint8Array([1]),new Uint8Array([2])],doc={documentId:'doc',features:[{id:'a',op:'box',params:{},refs:[]},{id:'b',op:'box',params:{},refs:[]},{id:'u',op:'union',params:{blendRadiusMm:.35,keepTools:true,renameTarget:true},refs:['a','b']}],imports:{}};
 let request,bad=false,uploads=0;
 const client={capabilities:async()=>({operations:[{operation:'union',semanticVersion:'boolean.union-seam-1.0',enabled:true,acceptanceStatus:'passed'}]}),upload:async f=>{const data=new Uint8Array(await f.arrayBuffer());return {assetId:`asset-${++uploads}`,sha256:sha(data)};},submit:async(_,p)=>{request=p;return {jobId:'job'};},wait:async()=>({manifest:{sourceSha256:sha(inputs[0]),inputSha256:[sha(inputs[0]),bad?'mismatch':sha(inputs[1])]}})};
 await compileRemoteFeature(doc,'u',inputs,{documentId:'doc',documentInstanceId:'instance',expectedRevision:1},{allowUpload:true,client});
 assert.deepEqual(request.params,{blendRadiusMm:.35});assert.equal(request.inputs.length,2);assert.equal(request.strategy,'multi-source-union-seam');assert.deepEqual(request.selectionIntent,{kind:'whole-sources'});
 bad=true;await assert.rejects(compileRemoteFeature(doc,'u',inputs,{},{allowUpload:true,client}),{code:'RESULT_MISMATCH'});
});

 test('explicit radius windows validate and select versioned semantics without changing scalar semantics',()=>{
  const range={maxMm:.2,minMm:.02,stepRatio:.5,maxAttempts:3};
  const union={op:'union',params:{blendRadiusMm:range},refs:['a','b']};assertCompilableFeature(union);assert.equal(compiledSemanticVersion(union),'boolean.union-seam-1.1');
  const spatial={op:'fillet',params:{radius:range,selector:{edgesNear:{pointMm:[0,0,0],radiusMm:1}}},refs:['a']};assertCompilableFeature(spatial);assert.equal(compiledSemanticVersion(spatial),'blend.spatial-edges-1.1');
  for(const bad of [{maxMm:.2,minMm:0},{maxMm:.2,minMm:.1,maxAttempts:7},{maxMm:.2,minMm:.1,stepRatio:1},{maxMm:.2,minMm:.1,unknown:1}])assert.throws(()=>assertCompilableFeature({...union,params:{blendRadiusMm:bad}}));
 });

 test('range result rejects an unrequested radius, hidden attempts or tampered success report',()=>{
  const requested={maxMm:.2,minMm:.02,maxAttempts:3};const report={status:'applied',requestedRadiusMm:requested,radiusUsedMm:.02,attemptCount:2,tried:[{radiusMm:.2,ok:false},{radiusMm:.02,ok:true}]};
  assert(validBlendExecution(report,requested));
  for(const patch of [{radiusUsedMm:.01},{attemptCount:4},{requestedRadiusMm:{...requested,minMm:.01}},{tried:[{radiusMm:.2,ok:true},{radiusMm:.02,ok:true}]}])assert.equal(validBlendExecution({...report,...patch},requested),false);
  assert.equal(validBlendExecution({...report,radiusUsedMm:.1},.2),false);
 });
