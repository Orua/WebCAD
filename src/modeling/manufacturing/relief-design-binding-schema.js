// Schema-only module: imported by relief-contracts without pulling routing/geometry helpers.
export const RELIEF_DESIGN_BINDING_VERSION=1;
export const RELIEF_DESIGN_MASK_GENERATOR='analyzeDesignMask-rowflip-exact-collinear-v1';
export const RELIEF_DESIGN_MASK_OPTIONS=Object.freeze({surfaceMode:'smooth',maskStrategy:'faceWithHolesExtrude',curvePolicy:'preserveTopology',curveToleranceMm:0,contourSnapMm:0});
const hex={type:'string',pattern:'^[a-f0-9]{64}$'},num={type:'number'},vec3={type:'array',minItems:3,maxItems:3,items:num};
const int=(minimum,maximum)=>({type:'integer',minimum,maximum});
const u8={type:'string',minLength:4,maxLength:24000,pattern:'^[A-Za-z0-9+/]+=*$'};
export const RELIEF_DESIGN_BINDING_SCHEMA={type:'object',additionalProperties:false,description:'Strict fit→planar relief binding (version 1). Physical inputs are re-verified before every kernel execution; audit is provenance only.',
 required:['version','kind','datum','support','placement','field','controls','mask','audit'],properties:{
 version:{type:'integer',const:RELIEF_DESIGN_BINDING_VERSION},kind:{type:'string',const:'reliefDesignFit'},
 datum:{type:'object',additionalProperties:false,required:['kind','baselineMm'],properties:{kind:{type:'string',const:'authoredBaselineOnSelectedFace'},baselineMm:num}},
 support:{type:'object',additionalProperties:false,required:['sourceSha256','faceId','centerMm','normal'],properties:{sourceSha256:hex,faceId:int(0,1000000),centerMm:vec3,normal:vec3}},
 placement:{type:'object',additionalProperties:false,required:['originMm','xDirection'],properties:{originMm:vec3,xDirection:vec3}},
 field:{type:'object',additionalProperties:false,required:['columns','rows','widthMm','heightMm','active','fixedMask','activeSha256','fixedMaskSha256'],properties:{columns:int(2,129),rows:int(2,129),widthMm:num,heightMm:num,active:u8,fixedMask:u8,activeSha256:hex,fixedMaskSha256:hex}},
 controls:{type:'object',additionalProperties:false,required:['columns','rows','mode','locked','lockedSha256','controlsSha256','maxDeltaMm'],properties:{columns:int(4,65),rows:int(4,65),mode:{type:'string',enum:['emboss','engrave']},locked:u8,lockedSha256:hex,controlsSha256:hex,maxDeltaMm:num}},
 mask:{type:'object',additionalProperties:false,required:['generator','regionsSha256'],properties:{generator:{type:'string',const:RELIEF_DESIGN_MASK_GENERATOR},regionsSha256:hex}},
 audit:{type:'object',additionalProperties:false,required:['designId','draftRevision','draftFingerprint','fieldFingerprint','optionsFingerprint','metrics'],properties:{designId:{type:'string',minLength:1,maxLength:200},draftRevision:int(0,1e9),draftFingerprint:{type:'string',maxLength:80},fieldFingerprint:{type:'string',maxLength:80},optionsFingerprint:{type:'string',maxLength:80},
  servicesFirstFit:{type:'object',additionalProperties:false,required:['acceptanceToleranceMm'],properties:{acceptanceToleranceMm:num}},
  metrics:{type:'object',additionalProperties:false,required:['trainingMaxMm','independentMaxMm','protectionMaxMm','deviationKind'],properties:{trainingMaxMm:num,independentMaxMm:num,protectionMaxMm:num,deviationKind:{type:'string',const:'sampled-not-global'}}}}}
}};

