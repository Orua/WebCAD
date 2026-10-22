import {assertJsonValue,validateSchema,contractError} from './contracts/operation-schema.js';
import {legacyReliefParams} from './relief-param-migration.js';

// Geometry intent is declared by the caller from the user's request. Keyword
// discovery never supplies it, and this module never estimates image depth.
const geometry=['constantDepthContours','layeredRelief','continuousRelief','mixed','unspecified'];
const interpretation=['reviewedVectors','rasterArtwork','authoredHeightMap','shadedReference','sculptMesh'];
const positive={type:'number',exclusiveMinimum:0,maximum:100000};
export const MACHINING_INTENT_SCHEMA={type:'object',additionalProperties:false,
 required:['version','requestedGeometry','sourceInterpretation','userIntentEvidence'],properties:{
 version:{type:'integer',const:1},requestedGeometry:{type:'string',enum:geometry},
 sourceInterpretation:{type:'string',enum:interpretation},
 userIntentEvidence:{type:'string',minLength:1,maxLength:1200},
 sourceHash:{type:'string',pattern:'^[a-f0-9]{64}$'},
 direction:{type:'string',enum:['emboss','engrave']},
 dimensionsMm:{type:'object',additionalProperties:false,required:['width','height'],properties:{width:positive,height:positive}},
 specifiedDepthsMm:{type:'array',minItems:1,maxItems:32,items:positive},targetPeakMm:positive,
 preserve:{type:'array',maxItems:32,items:{type:'string',minLength:1,maxLength:200}},
 supportBinding:{type:'object',additionalProperties:false,required:['bodyId','geometryFingerprint'],properties:{bodyId:{type:'string',minLength:1,maxLength:150},geometryFingerprint:{type:'string',minLength:1,maxLength:200}}},
 placementSnapshot:{type:'object',additionalProperties:false,required:['origin','quaternion'],properties:{origin:{type:'array',minItems:3,maxItems:3,items:{type:'number'}},quaternion:{type:'array',minItems:4,maxItems:4,items:{type:'number'}}}},
}};

export function validateMachiningIntent(value){
 assertJsonValue(value,'machiningIntent');
 validateSchema(MACHINING_INTENT_SCHEMA,value,'machiningIntent');
 if(!value.userIntentEvidence.trim())contractError('PARAM_SCHEMA_INVALID','machiningIntent.userIntentEvidence','Include the user request or confirmed context.');
 if(value.placementSnapshot){const norm=Math.hypot(...value.placementSnapshot.quaternion);if(Math.abs(norm-1)>1e-6)contractError('PARAM_RANGE_INVALID','machiningIntent.placementSnapshot.quaternion','Use a normalized placement quaternion.');}
 return structuredClone(value);
}

const routes={constantDepthContours:'logo',layeredRelief:'layered-relief',continuousRelief:'continuous-relief',mixed:'mixed',unspecified:'needs-intent'};
export function planPatternMachining(value){
 const intent=validateMachiningIntent(value),route=routes[intent.requestedGeometry];
 const missingInputs=[],capabilityBlockers=[],reasonCodes=[`GEOMETRY_${intent.requestedGeometry}`];
 const missing=field=>missingInputs.push(field);
 if(intent.requestedGeometry==='unspecified')missing('requestedGeometry');
 if(!intent.sourceHash)missing('sourceHash');
 if(!intent.dimensionsMm)missing('dimensionsMm');
 if(!intent.supportBinding)missing('supportBinding');
 if(!intent.placementSnapshot)missing('placementSnapshot');
 if(intent.requestedGeometry!=='mixed'&&!intent.direction)missing('direction');
 if(['constantDepthContours','layeredRelief'].includes(intent.requestedGeometry)&&!intent.specifiedDepthsMm)missing('specifiedDepthsMm');
 const block=(code,message)=>capabilityBlockers.push({code,message});
 if(intent.requestedGeometry==='constantDepthContours'&&intent.specifiedDepthsMm?.length!==1&&intent.specifiedDepthsMm)block('INTENT_CONFLICT','A constant-depth operation needs exactly one depth.');
 if(intent.requestedGeometry==='continuousRelief'&&!['authoredHeightMap','sculptMesh'].includes(intent.sourceInterpretation))block('CONTINUOUS_SCULPT_UNAVAILABLE','Automatic reconstruction of body/detail depth from an artwork or shaded reference is not enabled; keep the continuous-relief target.');
 if(intent.sourceInterpretation==='shadedReference'){
  reasonCodes.push('LIGHTING_IS_NOT_DEPTH');
  if(intent.requestedGeometry!=='continuousRelief'&&intent.requestedGeometry!=='mixed')block('INTENT_CONFLICT','A shaded reference requires an explicit reviewed contour/height design before this operation.');
 }
 if(intent.sourceInterpretation==='sculptMesh')block('MESH_SOURCE_CLASSIFICATION_REQUIRED','Mesh preservation and bounded editing are available. Inspect the current source/recipe first: authored heightfield recipes use heightfieldSculpt; closed single-valued meshes may use sampleMeshRelief and meshReliefEdit within their capacity limits. Arbitrary 3D sculpting and precise STEP reconstruction are not implied.');
 if(intent.requestedGeometry==='continuousRelief'&&intent.targetPeakMm!==undefined)block('TARGET_PEAK_UNAVAILABLE','Legacy B-spline control scale does not guarantee actual peak height.');
 if(intent.requestedGeometry==='continuousRelief'&&intent.targetPeakMm===undefined&&!intent.specifiedDepthsMm)missing('targetPeakMm or explicit legacy control scale in specifiedDepthsMm');
 if(intent.requestedGeometry==='mixed')block('MIXED_PLAN_REQUIRED','Create separately bound continuous/layered and LOGO steps; this declaration cannot be submitted as one operation.');
 const sourcePreparationRequired=intent.sourceInterpretation==='rasterArtwork'?['review-closed-contours-and-retained-holes']:intent.sourceInterpretation==='shadedReference'?['design-footprint-macro-shape-details-and-protected-regions']:intent.sourceInterpretation==='sculptMesh'?['inspect-current-mesh-recipe-geometry-and-capacity']:[];
 if(intent.sourceInterpretation==='rasterArtwork')block('SOURCE_PREPARATION_REQUIRED','Review the converted contour design before execution; preserve the original source hash.');
 const meshSource=intent.sourceInterpretation==='sculptMesh';
 const requiredTools=meshSource?[]:route==='logo'?['logo']:['layered-relief','continuous-relief'].includes(route)?['relief']:route==='mixed'?['relief','logo']:[];
 return {status:'planned',intent,route,reasonCodes,matchedEvidence:[intent.userIntentEvidence],sourcePreparationRequired,
 requiredDocs:['api.pattern-machining',...(meshSource?['api.relief-taxonomy','api.mesh-relief-edit']:route==='logo'?['api.logo']:requiredTools.length?['api.relief']:[])],requiredTools,
 missingInputs,capabilityBlockers,canExecute:missingInputs.length===0&&capabilityBlockers.length===0,
 executionAuthority:'planning only; current face, source, placement, service route and kernel checks still apply',
 sourceEvidenceVerified:false,fallbackAllowed:false};
}

export const PATTERN_OPERATIONS=['logo','curvedLogo','relief'];
// An actual UI parameter edit is new user input. Update only declared numerical
// controls; preserve source interpretation/evidence and never upgrade legacy data.
export function intentForUIParameterEdit(op,params){
 if(!PATTERN_OPERATIONS.includes(op)||!params?.machiningIntent)return params;
 const intent=validateMachiningIntent(params.machiningIntent);
 const runtime=legacyReliefParams(op,params);
 if(intent.direction!==undefined&&params.mode!==undefined)intent.direction=params.mode;
 if(['logo','curvedLogo'].includes(op)&&intent.specifiedDepthsMm&&runtime.depth!==undefined)intent.specifiedDepthsMm=[runtime.depth];
 if(op==='relief'&&intent.dimensionsMm&&runtime.widthMm!==undefined&&runtime.heightMm!==undefined)intent.dimensionsMm={width:runtime.widthMm,height:runtime.heightMm};
 return {...params,machiningIntent:intent};
}
export function assertPatternExecution(op,params,{required=false}={}){
 if(!PATTERN_OPERATIONS.includes(op))return;
 if(!params?.machiningIntent){
  if(required)contractError('MACHINING_INTENT_REQUIRED','params.machiningIntent','Read api.pattern-machining and declare the requested geometry/source for a new feature.','PLAN_PATTERN_MACHINING');
  return; // Legacy rebuild/edit retains its original contract.
 }
 const intent=validateMachiningIntent(params.machiningIntent),kind=intent.requestedGeometry;
 const conflict=message=>contractError('MACHINING_INTENT_CONFLICT','params.machiningIntent',message,'PLAN_PATTERN_MACHINING');
 if(kind==='unspecified'||kind==='mixed')conflict('Resolve the intent or split the mixed plan before committing.');
 if(['logo','curvedLogo'].includes(op)&&kind!=='constantDepthContours')conflict('LOGO only accepts constant-depth contours.');
 if(op==='relief'&&kind==='constantDepthContours')conflict('Constant-depth contours must use LOGO; do not use an image height field.');
 if(op==='relief'&&(kind==='layeredRelief')!==!!params.layers)conflict('Declared discrete layers must match the saved layer recipe.');
 if(op==='relief'&&kind==='continuousRelief'&&intent.sourceInterpretation!=='authoredHeightMap'&&!(intent.sourceInterpretation==='rasterArtwork'&&params.source?.style==='rounded'))conflict('A shaded reference/artwork is not an authored height map. Semantic sculpting is not yet enabled.');
 if(op==='relief'&&intent.targetPeakMm!==undefined)conflict('Legacy relief depth scales control poles; actual targetPeakMm requires the new mesh semantic.');
 if(['logo','curvedLogo'].includes(op)&&intent.sourceInterpretation!=='reviewedVectors')conflict('Review the contours before LOGO execution.');
 if(kind==='layeredRelief'&&intent.sourceInterpretation!=='reviewedVectors')conflict('Discrete layers require reviewed region designs.');
 if(intent.direction&&params.mode&&intent.direction!==params.mode)conflict('Direction differs from the declared user request.');
 const hash=params.source?.sha256??params.source?.original?.sha256;
 if(intent.sourceHash&&hash&&hash!==intent.sourceHash)conflict('Source hash differs from the declared design.');
 if(params.source?.sourceInterpretation&&params.source.sourceInterpretation!==intent.sourceInterpretation)conflict('Image preparation and execution interpret the source differently.');
 if(intent.specifiedDepthsMm&&kind==='constantDepthContours'){
  const depth=legacyReliefParams(op,params).depth;
  if(intent.specifiedDepthsMm.length!==1||!Number.isFinite(depth)||Math.abs(intent.specifiedDepthsMm[0]-depth)>1e-9)conflict('LOGO depth differs from the declared constant depth.');
 }
}

// One coordinate convention for image preparation, contours and draft views.
export const IMAGE_TO_RELIEF=Object.freeze({version:1,imageOrigin:'top-left',reliefOrigin:'image-center',reliefY:'up',units:'normalized',range:[-.5,.5],heightRows:'bottom-to-top',contourY:'up',contourSampling:'pixel-centers with clipped border',legacyHeightPoles:'endpoint-grid; unchanged historical semantics'});
export function imageToReliefPoint(x,y,width,height){return [(x+.5)/width-.5,.5-(y+.5)/height];}
export function reliefToImagePoint(x,y,width,height){return [(x+.5)*width-.5,(.5-y)*height-.5];}

export function uiPatternIntent(op,p){
 const source=p.source,kind=op==='relief'?(p.layers?'layeredRelief':p.surfaceMode==='flat'?'constantDepthContours':'continuousRelief'):'constantDepthContours';
 return {version:1,requestedGeometry:kind,sourceInterpretation:op==='relief'?(p.layers?'reviewedVectors':source?.sourceInterpretation??'rasterArtwork'):'reviewedVectors',userIntentEvidence:'UI explicit operation, source review and height controls',...(source?.sha256||source?.original?.sha256?{sourceHash:source.sha256??source.original.sha256}:{})};
}

export const PATTERN_MACHINING_GUIDANCE=`图案加工分流 v1
先解释用户要的几何，再发现工具。恒深文字/凹线条（如 stripes.png 凹下0.4mm）→ LOGO；离散层高→分层relief；连续耳、眼、鼻口体块→连续雕刻；连续主体加恒深文字→分开的组合步骤。颜色、格式、题材、深度大小和关键词搜索都不能单独决定路线。沿用已确认上下文；明确请求不重复问工具，含糊的“做上去”只问缺失的几何意义。
planPatternMachining({context,intent})只读规划。intent.version=1；requestedGeometry=constantDepthContours|layeredRelief|continuousRelief|mixed|unspecified；sourceInterpretation=reviewedVectors|rasterArtwork|authoredHeightMap|shadedReference|sculptMesh；userIntentEvidence保留用户原请求/已确认上下文。提供原始sourceHash、dimensionsMm:{width,height}、direction、specifiedDepthsMm或targetPeakMm、preserve、supportBinding:{bodyId,geometryFingerprint}、placementSnapshot:{origin,quaternion}。看route/missingInputs/capabilityBlockers/canExecute，不把关键词命中视为执行许可。规划不证明来源/支撑绑定；执行仍读当前面与几何、完整工具卡。
新LOGO/relief创建和预览params必须携带machiningIntent；Worker执行端再次核对声明，UI明确修改已声明的深度/方向时同步数值声明；旧文件重建、编辑、撤销保留旧版本，无字段不自动升级。新LOGO需reviewedVectors及原孔/空白；照片浮雕标shadedReference，当前语义雕刻未启用，不得把亮度映射后报成品。readRelief显式提供sourceInterpretation；灰度只能用于authoredHeightMap。旧depthMm是控制点比例，不是实际峰值；targetPeakMm不走旧算法。自然圆滑不等于固定R。
转换失败、超时或不支持保持原目标和原工程；不互换LOGO/浮雕，不去耳朵/封孔/改深度或盲目重提任务。任务completed、几何提交、生成文件、落盘、离线重开及造型验收分别报告；取消先读已提交revision和原commandId。`;

// Relief height sources (relief design import). Photos are shaded references: they may only feed a
// height field after the user explicitly confirms the converted grid as their own authored height map.
export const PHOTO_HEIGHTMAP_CONFIRMATION='我确认此结果为我制作的高度图';
export function assertReliefHeightSourceIntent(record){
 const conflict=message=>{throw Object.assign(new Error(message),{code:'MACHINING_SOURCE_CONFLICT'});};
 if(record?.interpretation!=='authoredHeightMap')conflict('浮雕高度来源必须是作者高度图；照片需先经用户确认转换。');
 const d=record.derivedFrom;
 if(d===undefined)return;
 if(!d||typeof d!=='object'||Object.keys(d).some(k=>!['kind','sourceSha256','settingsHash','confirmation'].includes(k))||d.kind!=='shadedReference')conflict('派生记录无效。');
 if(d.sourceSha256!==record.original?.sha256||d.settingsHash!==record.settingsHash)conflict('派生记录与原图或转换设置不一致，需要重新确认。');
 if(!d.confirmation||d.confirmation.text!==PHOTO_HEIGHTMAP_CONFIRMATION||typeof d.confirmation.confirmedAt!=='string'||Number.isNaN(Date.parse(d.confirmation.confirmedAt))||Object.keys(d.confirmation).some(k=>!['text','confirmedAt'].includes(k)))conflict(`照片转换缺少用户确认“${PHOTO_HEIGHTMAP_CONFIRMATION}”。`);
}
