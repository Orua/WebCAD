const ids={type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:128,uniqueItems:true};
const featureId={type:'string',minLength:1,maxLength:150};
export const BLEND_SELECTOR_SCHEMA={type:'object',additionalProperties:false,oneOf:['faceIds','edgeIds','allEdges','seamBetween','edgesNear','facesFromFeature'].map(key=>({required:[key]})),properties:{
  faceIds:ids,edgeIds:ids,allEdges:{const:true},
  seamBetween:{type:'object',additionalProperties:false,required:['a','b'],properties:{a:featureId,b:featureId}},
  edgesNear:{type:'object',additionalProperties:false,required:['pointMm','radiusMm'],properties:{pointMm:{type:'array',items:{type:'number'},minItems:3,maxItems:3},radiusMm:{type:'number',exclusiveMinimum:0},sharpOnly:{type:'boolean'}}},
  facesFromFeature:{type:'object',additionalProperties:false,required:['featureId'],properties:{featureId,role:{type:'string',enum:['all','side','cap']}}}
}};
