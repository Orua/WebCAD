import * as cad from 'replicad';
import {verifyUnionMaterial} from './union-material.js';
import {booleanFaceOrigins,copyFaceOrigins} from './face-origins.js';
import {topologyDetails} from './rounding/topology.js';
const dispose=x=>{try{x?.delete?.();}catch{}};
function bounds(shape){const b=shape.boundingBox;try{return b.bounds.map(p=>[...p]);}finally{dispose(b);}}
function solidCount(shape){const solids=shape.solids;try{return solids.length;}finally{solids.forEach(dispose);}}
export function unionSourceExtentLoss(inputBounds,resultBounds,toleranceMm){
  const [resultMin,resultMax]=resultBounds;
  const loss=[];
  inputBounds.forEach(([min,max],sourceIndex)=>{
    for(let axis=0;axis<3;axis++){
      const low=resultMin[axis]-min[axis],high=max[axis]-resultMax[axis];
      if(low>toleranceMm)loss.push({sourceIndex,axis:'XYZ'[axis],side:'min',missingMm:low});
      if(high>toleranceMm)loss.push({sourceIndex,axis:'XYZ'[axis],side:'max',missingMm:high});
    }
  });
  return loss;
}
function oneSidedNonPeriodicEdgeIds(shape,oc){
  const rows=topologyDetails(shape),faces=shape.faces,edges=shape.edges,ids=[];
  try{
    for(const row of rows){
      if(row.adjacentFaceIds.length!==1)continue;
      const face=faces[row.adjacentFaceIds[0]],edge=edges[row.edgeId];
      let periodic=false;
      try{periodic=!!(face&&edge&&oc.BRep_Tool.IsClosed(edge.wrapped,face.wrapped));}catch{periodic=false;}
      if(!periodic)ids.push(row.edgeId);
    }
  }finally{faces.forEach(dispose);edges.forEach(dispose);}
  return ids;
}
function groups(boxes){
  const pending=new Set(boxes.map((_,i)=>i)),result=[];
  while(pending.size){const group=[pending.values().next().value];pending.delete(group[0]);for(let k=0;k<group.length;k++)for(const i of [...pending])if([0,1,2].every(a=>boxes[i][0][a]<=boxes[group[k]][1][a]+1e-7&&boxes[group[k]][0][a]<=boxes[i][1][a]+1e-7)){group.push(i);pending.delete(i);}result.push(group);}
  return result;
}
export function robustUnion(shapes,{fuzzyMm=0,glue='off',toolIds=[],toolNames=[],measure=s=>Math.abs(cad.measureVolume(s)),allowFallback=true,simplifyResult=true,requireConnected=false,verifyMaterial=false}={}){
  if(typeof verifyMaterial!=='boolean')throw Object.assign(new Error('verifyMaterial须为boolean'),{code:'PARAM_SCHEMA_INVALID'});
  if(!Number.isFinite(fuzzyMm)||fuzzyMm<0||fuzzyMm>.1||!['off','shift','full'].includes(glue))throw Object.assign(new Error('fuzzyMm须为0–0.1mm，glue须为off/shift/full'),{code:'PARAM_SCHEMA_INVALID'});
  const oc=cad.getOC(),volumes=shapes.map(measure),lower=Math.max(...volumes),upper=volumes.reduce((a,b)=>a+b,0),start=performance.now(),attempts=[];
  const volumeTolerance=1e-7+upper*1e-8;
  const inputBounds=shapes.map(bounds);
  let invalidSubshapes;
  function check(shape,usedFuzzy=fuzzyMm){
    const analyzer=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false);
    try{if(!analyzer.IsValid()){
      const faces=shape.faces,edges=shape.edges,faceIds=[],edgeIds=[],pointsMm=[];
      try{
        for(const [i,face] of faces.entries())if(!analyzer.IsValid(face.wrapped)){faceIds.push(i);const [min,max]=bounds(face);pointsMm.push(min.map((v,j)=>(v+max[j])/2));}
        for(const [i,edge] of edges.entries())if(!analyzer.IsValid(edge.wrapped))edgeIds.push(i);
        invalidSubshapes={faceIds,edgeIds,pointsMm,topologyScope:'failed-transient-result'};
      }finally{faces.forEach(dispose);edges.forEach(dispose);}
      throw new Error('BRepCheck未通过');
    }}finally{dispose(analyzer);}
    const volume=measure(shape);
    if(!Number.isFinite(volume)||volume<lower-volumeTolerance||volume>upper+volumeTolerance)throw new Error('融合结果违反输入材料体积范围');
    // A valid, positive-volume result can still omit material from one input.
    // Check exact BRep extents before any optional seam blending removes material.
    const toleranceMm=usedFuzzy+1e-4;
    const missing=unionSourceExtentLoss(inputBounds,bounds(shape),toleranceMm);
    if(missing.length){
      throw Object.assign(new Error('融合结果未覆盖输入实体的外包围范围'),{
        sourceCoverage:{toleranceMm,missing:missing.map(row=>({...row,toolId:toolIds[row.sourceIndex]}))}
      });
    }
    return volume;
  }
  function fuse(items,opt={}){
    if(items.length===1)return copyFaceOrigins(items[0],items[0].clone());
    const useFuzzy=opt.fuzzyMm??fuzzyMm,useGlue=opt.glue??glue;
    let builder,args,tools,progress;
    try{
      builder=new oc.BRepAlgoAPI_Fuse();args=new oc.NCollection_List_TopoDS_Shape();tools=new oc.NCollection_List_TopoDS_Shape();args.Append(items[0].wrapped);items.slice(1).forEach(s=>tools.Append(s.wrapped));
      builder.SetArguments(args);builder.SetTools(tools);builder.SetNonDestructive(true);builder.SetRunParallel(false);builder.SetFuzzyValue(useFuzzy);builder.SetGlue(oc.BOPAlgo_GlueEnum[{off:'BOPAlgo_GlueOff',shift:'BOPAlgo_GlueShift',full:'BOPAlgo_GlueFull'}[useGlue]]);
      progress=new oc.Message_ProgressRange();builder.Build(progress);if(!builder.IsDone()||builder.HasErrors())throw new Error('多参数布尔运算失败');if(simplifyResult)builder.SimplifyResult(true,true,1e-7);return booleanFaceOrigins(items,cad.cast(builder.Shape()),builder);
    }finally{[progress,tools,args,builder].forEach(dispose);}
  }
  let lastError;
  for(let attempt=0;attempt<(allowFallback?2:1);attempt++){
    let result;const owned=[];let strategy=attempt===0?'multi-fuse':'bbox-clusters';
    try{
      if(attempt===0)result=fuse(shapes);
      else{
        const clusters=groups(inputBounds);
        if(clusters.length>1){for(const cluster of clusters)owned.push(fuse(cluster.map(i=>shapes[i])));result=fuse(owned);}
        else{strategy='sequential-fuse';result=copyFaceOrigins(shapes[0],shapes[0].clone());for(const tool of shapes.slice(1)){const next=fuse([result,tool]);dispose(result);result=next;}}
      }
      let volumeAfter=check(result),usedFuzzy=fuzzyMm,usedGlue=glue;
      let oneSided=oneSidedNonPeriodicEdgeIds(result,oc);
      // I-05: tangent/flush contacts can leave one-sided edges; retry with shift glue / a small fuzzy value.
      if(oneSided.length&&fuzzyMm===0&&glue==='off'){
        for(const retry of [{glue:'shift',fuzzyMm:0},{glue:'shift',fuzzyMm:1e-5},{glue:'off',fuzzyMm:1e-4}]){
          let repaired;
          try{
            repaired=fuse(shapes,retry);
            const repairedVolume=check(repaired,retry.fuzzyMm);
            // Improving edge incidence is only a topology repair if the material
            // remains equivalent to the accepted initial fuse.
            if(Math.abs(repairedVolume-volumeAfter)>volumeTolerance)continue;
            const repairedSides=oneSidedNonPeriodicEdgeIds(repaired,oc);
            if(repairedSides.length<oneSided.length){
              dispose(result);result=repaired;repaired=null;volumeAfter=repairedVolume;oneSided=repairedSides;usedFuzzy=retry.fuzzyMm;usedGlue=retry.glue;
              if(!oneSided.length)break;
            }
          }catch{/* keep the first valid fuse */}
          finally{dispose(repaired);}
        }
      }
      const materialCoverage=verifyMaterial?verifyUnionMaterial(shapes,result,{cad,measure,toolIds}):undefined;
      const solids=solidCount(result),fused=solids===1;
      if(requireConnected&&!fused){
        throw Object.assign(new Error(`指定必须融合为单一实体，结果有 ${solids} 个实体`),{solidCount:solids});
      }
      const warnings=[];
      if(!fused)warnings.push({code:'UNION_NOT_FUSED',message:`未融合、仍为 ${solids} 个实体。并集没有把它们做成单一实体；请先调整位置使实体相交后再合并，或改用组合（group）。`});
      if(oneSided.length)warnings.push({code:'UNION_ONE_SIDED_EDGES',message:`并集后仍有单侧面边 ${oneSided.join(', ')}，整件圆角将跳过这些边。`});
      result.booleanReport={strategy,attempts:[...attempts,{strategy,status:'completed'}],fuzzyMm:usedFuzzy,glue:usedGlue,simplified:simplifyResult,volumeBefore:volumes,volumeAfter,elapsedMs:performance.now()-start,fused,solidCount:solids,...(materialCoverage?{materialCoverage}:{}),...(oneSided.length?{oneSidedEdgeIds:oneSided}:{})};
      if(warnings.length)result.warnings=[...(result.warnings||[]),...warnings];
      const output=result;result=null;return output;
    }catch(error){
      lastError=error;
      attempts.push({strategy,status:'failed',message:String(error.message||error)});
      if(error.sourceCoverage||error.materialCoverage||error.solidCount!==undefined)break;
    }
    finally{dispose(result);owned.forEach(dispose);}
  }
  const tools=inputBounds.map(([min,max],i)=>({toolId:toolIds[i],toolName:toolNames[i],pointMm:min.map((v,j)=>(v+max[j])/2),volumeMm3:volumes[i]}));
  const pointsMm=invalidSubshapes?.pointsMm?.length?invalidSubshapes.pointsMm:tools.map(t=>t.pointMm);
  const sourceCoverage=lastError?.sourceCoverage;
  const details={...(lastError?.materialCoverage?{materialCoverage:lastError.materialCoverage}:{}),strategy:attempts.at(-1)?.strategy,attempts,tools,toolIds:tools.map(t=>t.toolId),...invalidSubshapes,...(sourceCoverage?{sourceCoverage}:{}),...(lastError?.solidCount!==undefined?{solidCount:lastError.solidCount,requiredSolidCount:1}:{}),pointsMm,pointSource:invalidSubshapes?.pointsMm?.length?'invalid-subshape-bounds-center':'participating-tool-bounds-center',volumeBefore:volumes,suggestion:lastError?.materialCoverage?'检查逐源精确差集覆盖报告；不自动放宽材料公差，保留输入并单独复现连接。':sourceCoverage?'检查报告中的源对象与缩水方向；未提交融合，保留原始实体。':lastError?.solidCount!==undefined?'核对接触面和真实重叠量；当前连接未提交。':"检查共面端面；可在确认公差后指定glue:'shift'或fuzzyMm。",elapsedMs:performance.now()-start};
  throw Object.assign(new Error('融合失败：'+String(lastError?.message||lastError)+'；原模型保留。'),{code:'GEOMETRY_INVALID',details,report:details});
}
