import {servicesClient} from './client.js';
import {assertCompilableFeature,compiledSemanticVersion,geometryRecipeFingerprint,GEOMETRY_CODEC} from './geometry-exchange.js';
import {binaryHash,contractHash} from '../contracts/operation-schema.js';
import {serviceError} from './settings.js';
export async function compileRemoteFeature(document,featureId,sourceBytes,context,{allowUpload=false,client=servicesClient,plan=null,signal,onWaitTimeout,waitTimeoutMs}={}){
 const began=performance.now();
 if(!allowUpload)throw serviceError('UPLOAD_AUTH_REQUIRED','须明确允许上传当前来源 BRep 到 Services');
 const checkBeforeSubmit=()=>{if(signal?.aborted)throw serviceError('CANCELLED','操作已取消，尚未提交计算任务',{submitted:false,commitState:'notCommitted'});};
 checkBeforeSubmit();
 const feature=document.features.find(f=>f.id===featureId);assertCompilableFeature(feature);let params=feature.op==='transform'?{x:feature.params.x??0,y:feature.params.y??0,z:feature.params.z??0}:null;const semanticVersion=compiledSemanticVersion(feature),capabilities=await client.capabilities();
 checkBeforeSubmit();
 const capability=capabilities.operations.find(op=>op.operation===feature.op&&op.semanticVersion===semanticVersion&&op.enabled);
 if(!capability||!['passed','bridge-passed-project-gates-pending'].includes(capability.acceptanceStatus))throw serviceError('OPERATION_UNAVAILABLE','此服务尚未通过所需原生几何桥接');
 const isCut=feature.op==='cut',snapshots=isCut?sourceBytes:[sourceBytes];
 if(!Array.isArray(snapshots)||snapshots.length!==(isCut?feature.refs.length:1)||snapshots.some(bytes=>!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>20*1024*1024)||snapshots.reduce((sum,bytes)=>sum+bytes.length,0)>64*1024*1024)throw serviceError('SOURCE_BUDGET_EXCEEDED','来源快照缺失或超出单件 20 MiB、总计 64 MiB 的预算');
 const recipeFingerprint=geometryRecipeFingerprint(document,featureId),requestId=crypto.randomUUID(),inputs=[];
 for(const [i,bytes] of snapshots.entries()){
  checkBeforeSubmit();
  const asset=await client.upload(new File([bytes],i===0?'source.brep':`tool-${i}.brep`),{kind:'brep'});
  checkBeforeSubmit();
  if(asset.sha256!==binaryHash(bytes).slice(7))throw serviceError('SOURCE_HASH_MISMATCH','上传结果与当前来源快照不一致');
  inputs.push({assetId:asset.assetId,sha256:asset.sha256,role:i===0?'source':'tool',sourceFeatureId:feature.refs[i]});
 }
 const source=inputs[0];if(isCut)params={};
 if(['round','reliefShoulder'].includes(feature.op)){
  if(!plan?.candidate||plan.paramsFingerprint!==contractHash(feature.params)||plan.semanticVersion!==semanticVersion||plan.sourceSha256!==source.sha256)throw serviceError('SOURCE_HASH_MISMATCH','圆润计划与当前来源或参数不一致');
  params=plan.params;
 }
 if(feature.op==='relief'){
  if(!plan||plan.paramsFingerprint!==contractHash(feature.params)||plan.semanticVersion!==semanticVersion||binaryHash(new TextEncoder().encode(plan.sourceBrep)).slice(7)!==source.sha256)throw serviceError('SOURCE_HASH_MISMATCH','浮雕编译计划与当前来源不一致');
  const uploaded=new Map();for(const artifact of plan.artifacts.filter(a=>a.id!=='boundary')){checkBeforeSubmit();const accepted=await client.upload(new File([artifact.data],artifact.id+'.brep'),{kind:'brep'});checkBeforeSubmit();uploaded.set(artifact.id,accepted);inputs.push({assetId:accepted.assetId,sha256:accepted.sha256,role:'tool',sourceFeatureId:feature.refs[0]});}
  params={layers:plan.layers.map(l=>({toolAssetId:uploaded.get(l.toolArtifactId).assetId,normal:l.normal,spanMm:l.spanMm,regions:l.regions,memberLayerIds:l.memberLayerIds,...(semanticVersion==='relief.compiled-contours-strokes-1.2'?{mode:l.mode}:{})}))};
 }
 const payload={requestId,documentId:context.documentId,documentInstanceId:context.documentInstanceId,expectedRevision:context.expectedRevision,featureId,operation:feature.op,schemaVersion:'1.0',semanticVersion,inputs,placementSnapshot:null,selectionIntent:['round','reliefShoulder'].includes(feature.op)?plan.selectionIntent:feature.op==='relief'?plan.supportIntent:{kind:isCut?'whole-sources':'whole-source'},params,strategy:feature.op==='reliefShoulder'?'source-boundary-replacement':feature.op==='round'?'planar-boundary-cutter':isCut?'multi-source-boolean':feature.op==='relief'?(feature.params.maskStrategy??'faceWithHolesExtrude'):'translation',requiredResultFormat:GEOMETRY_CODEC,recipeFingerprint};
 checkBeforeSubmit();
 try{const job=await client.submit('compute/jobs',payload,requestId),result=await client.wait(job,{signal,onWaitTimeout,waitTimeoutMs});if(result.manifest.sourceSha256!==source.sha256||isCut&&(!Array.isArray(result.manifest.inputSha256)||result.manifest.inputSha256.length!==inputs.length||inputs.some((input,i)=>input.sha256!==result.manifest.inputSha256[i])))throw serviceError('RESULT_MISMATCH','原生结果绑定的目标或刀具 BRep 不一致');if(feature.op==='round'&&(!Number.isFinite(result.manifest.roundBoundary?.radiusMm)||Math.abs(result.manifest.roundBoundary.radiusMm-plan.params.radius)>1e-7))throw serviceError('RESULT_MISMATCH','原生圆角半径与当前来源已有 R 不一致');return {...result,recipeFingerprint,executionMeasurements:{totalMs:performance.now()-began,computeMs:result.manifest.timings?.totalMs??null}};}
 catch(error){if(error.code==='SERVICES_CONNECTION_UNKNOWN')error.message+=`（用 getServicesRequest 查询请求键 ${requestId}，勿重算）`;throw error;}
}
