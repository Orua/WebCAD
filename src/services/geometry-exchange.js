import {contractHash,binaryHash} from '../contracts/operation-schema.js';
import {serviceError} from './settings.js';
import {geometryFeatureRecord} from './geometry-signature.js';
import {remotePlacementSupported} from './execution-context.js';
export const LOCAL_KERNEL_BUILD_ID='replicad-opencascadejs@1.1.0:sha256:4c9f22e9f3828dca6f3c95405934cdbe624e593c35266f47f392ab337478dbde';
export const VERIFIED_NATIVE_KERNELS=new Set(['native-occt@7.8.1:sha256:d717ef7bebadb247f7115565aa0d4b95b2a61f0a6650a69b21d9bb514d4c7fe9','native-occt@7.8.1:sha256:156207b5da408b4849c3eae5288566c1268d99c03b7ea1d9d6bad1c25fface4d','native-occt@7.8.1:sha256:a06e04a5ec36c8af9264ad2a2a97f3461739fcd7884554d224e9e726d8d63418','native-occt@7.8.1:sha256:09c49d81a7c71ec8be3a1095cc553ed3214e3d6ccd8a66277ea437d6dbe12491','native-occt@7.8.1:sha256:30230a58721f33434fba7e0e7d1841f8c588a999b60fc0993ab35b8790b55daa','native-occt@7.8.1:sha256:e0dbf5c23ad492c44f56e79c936b5bdf2d44205b0caa9dba398d111a17ba242c','native-occt@7.8.1:sha256:1c85cc9526ec6e70991b9a0e0499cb50655564470649d26e54bd4062932a4337','native-occt@7.8.1:sha256:a71e3a8c81e6b268928f9328c024dc61a0d049e8e3923075ca3e713f98a378f2']);
export const GEOMETRY_CODEC='occt-text-brep-v1';
export const TRANSLATION_SEMANTIC_VERSION='transform.translation-1.0';
export const RELIEF_SEMANTIC_VERSION='relief.compiled-contours-1.0';
export const RELIEF_PATCH_SEMANTIC_VERSION='relief.compiled-contours-local-patch-1.1';
export const RELIEF_STROKE_SEMANTIC_VERSION='relief.compiled-contours-strokes-1.2';
export const compiledSemanticVersion=feature=>feature?.op==='relief'?(feature.params?.layers?.some(layer=>layer.strokes||layer.mode==='engrave')?RELIEF_STROKE_SEMANTIC_VERSION:feature.params?.layers?.some(layer=>layer.localPatches)?RELIEF_PATCH_SEMANTIC_VERSION:RELIEF_SEMANTIC_VERSION):TRANSLATION_SEMANTIC_VERSION;
export function assertCompilableFeature(feature){
 if(feature&&!remotePlacementSupported(feature))throw serviceError('OPERATION_UNAVAILABLE','当前远程实现仅验收世界坐标放置；此特征继续使用本地放置语义');
 if(feature?.op!=='relief')return assertTranslationFeature(feature);
 if(feature.refs?.length!==1||!feature.params?.layers||feature.params.sculpt||feature.params.strokes||feature.params.contourSnapMm||feature.params.layers.some(l=>(!l.regions&&!l.strokes)||l.sculpt||l.values?.some(r=>r.some(v=>v!==1))))throw serviceError('OPERATION_UNAVAILABLE','此原生浮雕桥接支持等高柱面轮廓或显式开放刻线；各层高度和方式保持，不以二维并集冒充三维交织');
 return feature.params;
}
export function geometryRecipeFingerprint(document,featureId){
 const byId=new Map(document.features.map(f=>[f.id,f])),needed=new Set();
 const visit=id=>{if(needed.has(id))return;const f=byId.get(id);if(!f)throw serviceError('STALE_REFERENCE','编译配方引用不存在');needed.add(id);for(const ref of f.refs||[])visit(ref);};visit(featureId);
 const features=document.features.filter(f=>needed.has(f.id)).map(geometryFeatureRecord).map(({id,op,params,refs,placement,semanticsVersion,expressions})=>({id,op,params,refs,...(placement?{placement}:{}),...(semanticsVersion?{semanticsVersion}:{}),...(expressions?{expressions}:{})}));
 const importKeys=features.filter(f=>f.op==='import').map(f=>f.params.key),imports=Object.fromEntries(importKeys.map(key=>[key,document.imports[key]]));
 return contractHash({features,imports,consumerKernelBuildId:LOCAL_KERNEL_BUILD_ID,semanticVersion:compiledSemanticVersion(byId.get(featureId))});
}
export function assertTranslationFeature(feature){
 if(feature?.op!=='transform'||feature.refs?.length!==1||Object.keys(feature.params||{}).some(k=>!['x','y','z','rx','ry','rz','scale'].includes(k))||['rx','ry','rz'].some(k=>(feature.params[k]??0)!==0)||(feature.params.scale??1)!==1)throw serviceError('OPERATION_UNAVAILABLE','此已验证桥接仅支持现有 transform 的世界坐标纯平移');
 return {x:feature.params.x??0,y:feature.params.y??0,z:feature.params.z??0};
}
export function installCompiledCandidate(document,{manifest,bytes,context,recipeFingerprint}){
 const feature=document.features.find(f=>f.id===manifest.featureId);assertCompilableFeature(feature);
 const affected=new Set([feature.id]);for(const candidate of document.features.slice(document.features.indexOf(feature)+1)){if(!(candidate.refs||[]).some(id=>affected.has(id)))continue;affected.add(candidate.id);const topologySensitive=value=>value&&typeof value==='object'&&Object.entries(value).some(([key,item])=>['faceId','faceIds','edgeId','edgeIds','directionEdgeId'].includes(key)||topologySensitive(item));if(topologySensitive(candidate.params))throw serviceError('UNSAFE_LEGACY_REFERENCE','后续特征保存了旧内核的面/边索引，请先重新按几何意图定位',{affectedFeatureIds:[candidate.id]});}
 if(context.documentId!==document.documentId||manifest.documentId!==context.documentId||manifest.documentInstanceId!==context.documentInstanceId||manifest.expectedRevision!==context.expectedRevision)throw serviceError('REVISION_CONFLICT','原生结果属于另一个工程修订');
 if(manifest.operation!==feature.op||manifest.semanticVersion!==compiledSemanticVersion(feature)||manifest.codec!==GEOMETRY_CODEC||manifest.units!=='mm'||manifest.coordinateSystem!=='world-xyz-right-handed'||!VERIFIED_NATIVE_KERNELS.has(manifest.kernelBuildId))throw serviceError('GEOMETRY_CODEC_MISMATCH','原生内核/语义/几何 codec 未经验证');
 const binding=manifest.topologyBinding;
 if(binding?.kind!==(feature.op==='relief'?'outer-cylinder-geometric-intent':'whole-source')||binding.matchCount!==1||binding.numericIndicesTransferred!==false)throw serviceError('GEOMETRY_INVALID','服务未证明唯一的当前来源几何绑定');
 if(feature.op==='relief'){
  const members=manifest.stages?.flatMap(stage=>stage.memberLayerIds??[]);
  if(!['cutHoleSolids','faceWithHolesExtrude'].includes(manifest.strategy)||!members||members.length!==feature.params.layers.length||members.some((id,i)=>id!==`layer-${i}`))throw serviceError('RESULT_MISMATCH','服务返回的原浮雕层映射不完整');
 }
 if(geometryRecipeFingerprint(document,feature.id)!==recipeFingerprint||manifest.recipeFingerprint!==recipeFingerprint)throw serviceError('RESULT_MISMATCH','当前配方与原生输入指纹不匹配');
 const artifact=manifest.geometryArtifact;if(!(bytes instanceof Uint8Array)||!artifact||bytes.length!==artifact.bytes||binaryHash(bytes).slice(7)!==artifact.sha256||artifact.format!==GEOMETRY_CODEC||artifact.brepVersion!==3)throw serviceError('ARTIFACT_CORRUPT','精确几何产物校验失败');
 if(bytes.length>20*1024*1024)throw serviceError('RESULT_TOO_LARGE_FOR_CLIENT','结果超出当前精确工程导回预算；服务产物保留');
 if(!manifest.validation?.valid||manifest.validation.solidCount!==1)throw serviceError('GEOMETRY_INVALID','服务未返回已校验的单实体');
 const checkpoint={recipeFingerprint,sourceSha256:manifest.sourceSha256,sourceSnapshotVersion:1,artifactSha256:artifact.sha256,semanticVersion:manifest.semanticVersion,codec:manifest.codec,brepVersion:3,kernelBuildId:manifest.kernelBuildId,consumerKernelBuildId:LOCAL_KERNEL_BUILD_ID,jobId:manifest.jobId,inputFingerprint:manifest.inputFingerprint};
 return {...document,version:3,features:document.features.map(f=>f.id===feature.id?{...f,compiledCheckpoint:checkpoint}:f),compiledArtifacts:{...document.compiledArtifacts,[artifact.sha256]:new Uint8Array(bytes)}};
}
export function compiledCheckpointBytes(document,feature,sourceBytes){
 const c=feature.compiledCheckpoint;if(!c)return null;
 if(c.recipeFingerprint!==geometryRecipeFingerprint(document,feature.id))return null;
 if(sourceBytes&&binaryHash(sourceBytes).slice(7)!==c.sourceSha256)return null;
 if(c.codec!==GEOMETRY_CODEC||c.semanticVersion!==compiledSemanticVersion(feature)||c.consumerKernelBuildId!==LOCAL_KERNEL_BUILD_ID||!VERIFIED_NATIVE_KERNELS.has(c.kernelBuildId))throw serviceError('GEOMETRY_CODEC_MISMATCH','保存检查点的内核或 codec 不兼容');
 const bytes=document.compiledArtifacts?.[c.artifactSha256];if(!(bytes instanceof Uint8Array)||binaryHash(bytes).slice(7)!==c.artifactSha256)throw serviceError('ARTIFACT_CORRUPT','工程缺少完整精确检查点');return bytes;
}
