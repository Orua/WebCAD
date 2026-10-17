import {topologyDetails} from '../smooth-transition.js';
import {attemptBlendRadius} from '../blend-radius.js';
import {probeBlendRadius} from '../blend-radius-search.js';
import {blendContext} from './face-origins.js';
const labels=row=>row?.featureIds||[row?.featureId];
export function finishBooleanBlend(shape,params,sourceIds){
  if(params.blendRadiusMm===undefined&&params.blendLaw===undefined)return shape;
  if(!Number.isFinite(params.blendRadiusMm)||params.blendRadiusMm<=0||params.blendMode!==undefined&&!['fillet','variable'].includes(params.blendMode)||params.blendMode==='variable'&&!params.blendLaw)throw Object.assign(new Error('提供正blendRadiusMm以及有效blendMode/变半径规律'),{code:'PARAM_SCHEMA_INVALID'});
  const origins=shape.faceOrigins,targets=topologyDetails(shape).filter(row=>{
    if(!row.sharp||row.adjacentFaceIds.length!==2||!origins)return false;const [left,right]=row.adjacentFaceIds.map(id=>labels(origins[id]));
    return sourceIds.some((a,i)=>sourceIds.slice(i+1).some(b=>left.includes(a)&&!left.includes(b)&&right.includes(b)&&!right.includes(a)||right.includes(a)&&!right.includes(b)&&left.includes(b)&&!left.includes(a)));
  });
  if(!targets.length){shape.warnings=[...(shape.warnings||[]),{code:'BLEND_SKIPPED',message:'布尔结果没有可可靠追溯的尖锐工具交线，保留原布尔结果'}];return shape;}
  const selector={edgeIds:targets.map(row=>row.edgeId)},context=blendContext(shape),input={selector,context,radiusMm:params.blendRadiusMm,...(params.blendMode==='variable'?{blendLaw:params.blendLaw}:{})};
  let attempt=attemptBlendRadius(shape,input),search;
  if(!attempt.shape&&params.blendMode!=='variable'){
    search=probeBlendRadius(shape,{selector,context,maxMm:params.blendRadiusMm*.75,minMm:params.blendRadiusMm*.75**5,maxAttempts:5});
    if(search.status==='feasible')attempt=attemptBlendRadius(shape,{...input,radiusMm:search.feasibleMaxMm});
  }
  if(!attempt.shape){shape.warnings=[...(shape.warnings||[]),attempt.warning];shape.blendRadiusReport={status:'skipped',requestedRadiusMm:params.blendRadiusMm,...(search?{tried:search.tried}:{})};return shape;}
  const result=attempt.shape;result.booleanReport=shape.booleanReport;result.blendRadiusReport={...result.blendRadiusReport,status:'applied',requestedRadiusMm:params.blendRadiusMm,radiusUsedMm:search?.feasibleMaxMm??params.blendRadiusMm,...(search?{tried:search.tried}:{})};shape.delete();return result;
}
