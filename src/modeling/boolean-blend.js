import {topologyDetails} from '../smooth-transition.js';
import {attemptBlendRadius} from '../blend-radius.js';
import {blendContext} from './face-origins.js';
const labels=row=>row?.featureIds||[row?.featureId];
export function finishBooleanBlend(shape,params,sourceIds){
  if(params.blendRadiusMm===undefined&&params.blendLaw===undefined)return shape;
  if(!Number.isFinite(params.blendRadiusMm)||params.blendRadiusMm<=0||params.blendMode!==undefined&&!['fillet','variable'].includes(params.blendMode)||params.blendMode==='variable'&&!params.blendLaw)throw Object.assign(new Error('提供正blendRadiusMm以及有效blendMode/变半径规律'),{code:'PARAM_SCHEMA_INVALID'});
  const origins=shape.faceOrigins,targets=topologyDetails(shape).filter(row=>{
    if(!row.sharp||row.adjacentFaceIds.length!==2||!origins)return false;const [left,right]=row.adjacentFaceIds.map(id=>labels(origins[id]));
    return sourceIds.some((a,i)=>sourceIds.slice(i+1).some(b=>left.includes(a)&&!left.includes(b)&&right.includes(b)&&!right.includes(a)||right.includes(a)&&!right.includes(b)&&left.includes(b)&&!left.includes(a)));
  });
  if(!targets.length){shape.delete();throw Object.assign(new Error('没有可靠来源交线；未提交融合或修顺'),{code:'SELECTOR_EMPTY'});}
  const selector={edgeIds:targets.map(row=>row.edgeId)},context=blendContext(shape),input={selector,context,radiusMm:params.blendRadiusMm,...(params.blendMode==='variable'?{blendLaw:params.blendLaw}:{})};
  const attempt=attemptBlendRadius(shape,input);
  if(!attempt.shape){shape.delete();throw Object.assign(new Error(attempt.warning?.message||'指定半径修顺失败；未提交融合'),{code:'BLEND_BUILD_FAILED'});}
  const result=attempt.shape;result.booleanReport=shape.booleanReport;result.blendRadiusReport={...result.blendRadiusReport,status:'applied',requestedRadiusMm:params.blendRadiusMm,radiusUsedMm:params.blendRadiusMm,attemptCount:1};shape.delete();return result;
}
