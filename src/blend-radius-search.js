import * as cad from 'replicad';
import {resolveBlendSelector} from './semantic-blend-selector.js';

const dispose=value=>{try{value?.delete();}catch{}};
const clampStep=(max,min,ratio)=>{const out=[];let r=max;for(let i=0;i<6&&r>=min-1e-12;i++,r*=ratio)out.push(Number(r.toPrecision(12)));if(out.length<6&&out.at(-1)>min+1e-12)out.push(min);return out;};

function tryRadius(shape,targets,radiusMm){
  const oc=cad.getOC(),edges=shape.edges;let builder,result,progress,check,solids;
  try{
    builder=new oc.BRepFilletAPI_MakeFillet(shape.wrapped,oc.ChFi3d_FilletShape.ChFi3d_Rational);
    for(const row of targets)builder.Add(radiusMm,edges[row.edgeId].wrapped);
    progress=new oc.Message_ProgressRange();builder.Build(progress);
    if(!builder.IsDone())throw new Error('OCCT 未完成');
    result=cad.cast(builder.Shape());check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);
    if(!check.IsValid())throw new Error('结果无效');solids=result.solids;
    if(solids.length!==1||cad.measureVolume(result)<=1e-9)throw new Error('结果不是单一正体积实体');
    return {ok:true};
  }catch(error){return {ok:false,reason:String(error?.message||error).slice(0,240)};}
  finally{solids?.forEach(dispose);[check,progress,builder,result].forEach(dispose);edges.forEach(dispose);}
}

/** Read-only, bounded descending search. No result is installed or returned as
 * document geometry. `feasibleMaxMm` is the largest sampled feasible radius,
 * not a mathematical supremum; OCCT feasibility need not be monotone. */
export function probeBlendRadius(shape,{selector,context,maxMm,minMm,stepRatio=.75,maxAttempts=6}={}){
  if(!Number.isFinite(maxMm)||!Number.isFinite(minMm)||minMm<=0||maxMm<minMm)throw Object.assign(new Error('需要 0 < minMm <= maxMm'),{code:'PARAM_RANGE_INVALID'});
  if(!Number.isFinite(stepRatio)||stepRatio<=0||stepRatio>=1||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>6)throw Object.assign(new Error('stepRatio 必须在 (0,1)，maxAttempts 为 1–6'),{code:'PARAM_RANGE_INVALID'});
  const resolved=resolveBlendSelector(shape,{selector},context),tried=[],started=performance.now();
  for(const radiusMm of clampStep(maxMm,minMm,stepRatio).slice(0,maxAttempts)){
    const outcome=tryRadius(shape,resolved.targets,radiusMm);tried.push({radiusMm,...outcome});
    if(outcome.ok)return {status:'feasible',feasibleMaxMm:radiusMm,limitingEdgeIds:resolved.targets.map(row=>row.edgeId),
      reason:'Largest feasible radius among the bounded descending samples; this is not a certified global maximum.',tried,elapsedMs:performance.now()-started,
      selectorReport:resolved.selectorReport,readOnly:true};
  }
  return {status:'infeasible',feasibleMaxMm:null,limitingEdgeIds:resolved.targets.map(row=>row.edgeId),
    reason:`No sampled radius in [${minMm}, ${maxMm}] produced a valid OCCT solid.`,tried,elapsedMs:performance.now()-started,
    selectorReport:resolved.selectorReport,readOnly:true};
}
