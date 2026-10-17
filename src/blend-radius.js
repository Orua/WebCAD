import * as cad from 'replicad';
import {resolveBlendSelector} from './semantic-blend-selector.js';
import {booleanFaceOrigins} from './modeling/face-origins.js';

const dispose=value=>{try{value?.delete();}catch{}};
const fail=(message,code='GEOMETRY_INVALID')=>{throw Object.assign(new Error(message),{code});};

function buildNative(shape,targets,{radiusMm,blendLaw},selectorReport){
  const oc=cad.getOC(),edges=shape.edges;let builder,result,progress,check,solids;
  const variable=Boolean(blendLaw);
  try{
    builder=new oc.BRepFilletAPI_MakeFillet(shape.wrapped,oc.ChFi3d_FilletShape.ChFi3d_Rational);
    for(const row of targets){
      const edge=edges[row.edgeId];
      if(variable)builder.Add(blendLaw.startRadiusMm,blendLaw.endRadiusMm,edge.wrapped);
      else builder.Add(radiusMm,edge.wrapped);
    }
    progress=new oc.Message_ProgressRange();builder.Build(progress);
    if(!builder.IsDone())fail('OCCT 未完成圆角构造');
    result=cad.cast(builder.Shape());check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);
    if(!check.IsValid())fail('OCCT 圆角结果无效');
    solids=result.solids;
    if(solids.length!==1||cad.measureVolume(result)<=1e-9)fail('圆角结果不是有效正体积单实体');
    result.blendRadiusReport={mode:variable?'variable':'constant',radiusMm:variable?undefined:radiusMm,
      ...(variable?{blendLaw:{...blendLaw,interpolation:'OCCT linear edge endpoint radii'}}:{}),
      ...selectorReport,processedEdgeIds:targets.map(row=>row.edgeId),validSolid:true};
    booleanFaceOrigins([shape],result,builder);
    const output=result;result=null;return output;
  }finally{solids?.forEach(dispose);[check,progress,builder,result].forEach(dispose);edges.forEach(dispose);}
}

/** Apply one real OCCT fillet. A variable law is linearly interpolated from
 * the oriented edge start to end and is rebuilt with the current BRep only. */
export function buildBlendRadius(shape,{selector,context,radiusMm,blendLaw}={}){
  if((typeof radiusMm!=='number'||!Number.isFinite(radiusMm)||radiusMm<=0)&&!blendLaw)fail('radiusMm 必须是正数');
  if(blendLaw&&(!Number.isFinite(blendLaw.startRadiusMm)||blendLaw.startRadiusMm<=0||!Number.isFinite(blendLaw.endRadiusMm)||blendLaw.endRadiusMm<=0))fail('blendLaw 需要正的 startRadiusMm 和 endRadiusMm');
  const solids=shape.solids;
  try{if(solids.length!==1)fail('圆角需要一个封闭实心体');}finally{solids.forEach(dispose);}
  const resolved=resolveBlendSelector(shape,{selector},context);
  return buildNative(shape,resolved.targets,{radiusMm,blendLaw},resolved.selectorReport);
}

/** Optional union/cut integration hook. On failure the caller retains its
 * already-built base boolean shape unchanged and receives an explicit warning. */
export function attemptBlendRadius(shape,params={}){
  try{return {shape:buildBlendRadius(shape,params),warning:null,report:{status:'applied'}};}
  catch(error){if(String(error?.code||'').startsWith('SELECTOR_')||error?.code==='PARAM_RANGE_INVALID')throw error;
    return {shape:null,warning:{code:'BLEND_SKIPPED',message:`圆角未应用，保留原布尔结果：${String(error?.message||error)}`},report:{status:'skipped',cause:error?.code||'GEOMETRY_INVALID'}};}
}
