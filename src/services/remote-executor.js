import {servicesClient} from './client.js';
import {assertCompilableFeature,compiledSemanticVersion,geometryRecipeFingerprint,GEOMETRY_CODEC} from './geometry-exchange.js';
import {binaryHash,contractHash} from '../contracts/operation-schema.js';
import {serviceError} from './settings.js';
export async function compileRemoteFeature(document,featureId,sourceBytes,context,{allowUpload=false,client=servicesClient,plan=null,signal,onWaitTimeout,waitTimeoutMs}={}){
 const began=performance.now();
 if(!allowUpload)throw serviceError('UPLOAD_AUTH_REQUIRED','须明确允许上传当前来源 BRep 到 Services');
 const feature=document.features.find(f=>f.id===featureId);assertCompilableFeature(feature);let params=feature.op==='transform'?{x:feature.params.x??0,y:feature.params.y??0,z:feature.params.z??0}:null;const semanticVersion=compiledSemanticVersion(feature),capabilities=await client.capabilities();
 const capability=capabilities.operations.find(op=>op.operation===feature.op&&op.semanticVersion===semanticVersion&&op.enabled);
 if(!capability||!['passed','bridge-passed-project-gates-pending'].includes(capability.acceptanceStatus))throw serviceError('OPERATION_UNAVAILABLE','此服务尚未通过所需原生几何桥接');
 const recipeFingerprint=geometryRecipeFingerprint(document,featureId),source=await client.upload(new File([sourceBytes],'source.brep'),{kind:'brep'}),requestId=crypto.randomUUID();
 const inputs=[{assetId:source.assetId,sha256:source.sha256,role:'source',sourceFeatureId:feature.refs[0]}];
 if(feature.op==='relief'){
  if(!plan||plan.paramsFingerprint!==contractHash(feature.params)||plan.semanticVersion!==semanticVersion||binaryHash(new TextEncoder().encode(plan.sourceBrep)).slice(7)!==source.sha256)throw serviceError('SOURCE_HASH_MISMATCH','浮雕编译计划与当前来源不一致');
  const uploaded=new Map();for(const artifact of plan.artifacts.filter(a=>a.id!=='boundary')){const accepted=await client.upload(new File([artifact.data],artifact.id+'.brep'),{kind:'brep'});uploaded.set(artifact.id,accepted);inputs.push({assetId:accepted.assetId,sha256:accepted.sha256,role:'tool',sourceFeatureId:feature.refs[0]});}
  params={layers:plan.layers.map(l=>({toolAssetId:uploaded.get(l.toolArtifactId).assetId,normal:l.normal,spanMm:l.spanMm,regions:l.regions,memberLayerIds:l.memberLayerIds,...(semanticVersion==='relief.compiled-contours-strokes-1.2'?{mode:l.mode}:{})}))};
 }
 const payload={requestId,documentId:context.documentId,documentInstanceId:context.documentInstanceId,expectedRevision:context.expectedRevision,featureId,operation:feature.op,schemaVersion:'1.0',semanticVersion,inputs,placementSnapshot:null,selectionIntent:feature.op==='relief'?plan.supportIntent:{kind:'whole-source'},params,strategy:feature.op==='relief'?(feature.params.maskStrategy??'faceWithHolesExtrude'):'translation',requiredResultFormat:GEOMETRY_CODEC,recipeFingerprint};
 try{const job=await client.submit('compute/jobs',payload,requestId),result=await client.wait(job,{signal,onWaitTimeout,waitTimeoutMs});if(result.manifest.sourceSha256!==source.sha256)throw serviceError('RESULT_MISMATCH','原生结果绑定的源 BRep 不一致');return {...result,recipeFingerprint,executionMeasurements:{totalMs:performance.now()-began,computeMs:result.manifest.timings?.totalMs??null}};}
 catch(error){if(error.code==='SERVICES_CONNECTION_UNKNOWN')error.message+=`（用 getServicesRequest 查询请求键 ${requestId}，勿重算）`;throw error;}
}
