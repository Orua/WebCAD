import {probeBlendRadius} from './blend-radius-search.js';
import {buildSmoothTransition,topologyDetails} from './smooth-transition.js';
import {buildBlendRadius} from './blend-radius.js';
import {blendContext} from './modeling/face-origins.js';
export function rangedBlend(shape,params,{smooth=false}={}){
  if(params.blendLaw)throw Object.assign(new Error('半径区间不能与变半径规律同时使用，请选择一种圆角定义'),{code:'PARAM_SCHEMA_INVALID'});
  const range=params.radius,context=blendContext(shape);
  let selector=params.selector;
  if(!selector&&smooth&&params.faceIds){const selected=new Set(params.faceIds);selector={edgeIds:topologyDetails(shape).filter(e=>e.sharp&&e.adjacentFaceIds.length===2&&e.adjacentFaceIds.every(id=>selected.has(id))).map(e=>e.edgeId)};}
  selector??=params.edgeIds?.length?{edgeIds:params.edgeIds}:params.faceIds?.length?{faceIds:params.faceIds}:{allEdges:true};
  const report=probeBlendRadius(shape,{selector,context,...range});
  if(report.status!=='feasible')throw Object.assign(new Error('指定区间内没有找到可行圆角半径，原模型保留'),{code:'BLEND_RADIUS_INFEASIBLE',report});
  const result=smooth?buildSmoothTransition(shape,{...params,radius:report.feasibleMaxMm,context}):buildBlendRadius(shape,{selector,context,radiusMm:report.feasibleMaxMm});
  result.radiusSearchReport={radiusUsedMm:report.feasibleMaxMm,tried:report.tried,elapsedMs:report.elapsedMs,sampledMaximum:true};return result;
}
