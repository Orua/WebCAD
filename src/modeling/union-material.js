const coverageIdentity={method:'source-minus-result',stage:'before-seam-blend',scope:'input-containment-only'};
const dispose=value=>{try{value?.delete?.();}catch{}};

function sourceRemainder(source,result,cad){
  const oc=cad.getOC();let builder,args,tools,progress;
  try{
    builder=new oc.BRepAlgoAPI_Cut();
    args=new oc.NCollection_List_TopoDS_Shape();tools=new oc.NCollection_List_TopoDS_Shape();
    args.Append(source.wrapped);tools.Append(result.wrapped);
    builder.SetArguments(args);builder.SetTools(tools);builder.SetNonDestructive(true);builder.SetRunParallel(false);builder.SetFuzzyValue(0);
    progress=new oc.Message_ProgressRange();builder.Build(progress);
    if(!builder.IsDone()||builder.HasErrors())throw new Error('输入减结果的覆盖差集未完成');
    // Do not simplify this diagnostic: simplification can hide small residuals.
    return cad.cast(builder.Shape());
  }finally{[progress,tools,args,builder].forEach(dispose);}
}

// Unlike extents and total volume, source-minus-result detects a missing lobe
// inside the result's bounding box, including material with no source vertex.
export function verifyUnionMaterial(sources,result,{cad,measure,toolIds=[]}){
  const oc=cad.getOC(),checks=[];
  for(const [sourceIndex,source] of sources.entries()){
    let residual,analyzer;
    try{
      const sourceVolumeMm3=measure(source),toleranceMm3=1e-7+sourceVolumeMm3*1e-8;
      residual=sourceRemainder(source,result,cad);
      let missingVolumeMm3=0;
      if(!residual.isNull){
        analyzer=new oc.BRepCheck_Analyzer(residual.wrapped,true,false,false);
        if(!analyzer.IsValid())throw new Error('输入减结果的覆盖校验生成无效几何');
        const solids=residual.solids;
        try{
          if(solids.length)missingVolumeMm3=measure(residual);
          else{
            const faces=residual.faces;
            try{if(faces.length)throw new Error('覆盖差集包含非实体面，不能确认材料');}finally{faces.forEach(dispose);}
          }
        }finally{solids.forEach(dispose);}
      }
      const check={sourceIndex,...(toolIds[sourceIndex]!==undefined?{toolId:toolIds[sourceIndex]}:{}),sourceVolumeMm3,missingVolumeMm3,toleranceMm3};
      checks.push(check);
      if(!Number.isFinite(sourceVolumeMm3)||sourceVolumeMm3<=0||!Number.isFinite(missingVolumeMm3)||missingVolumeMm3<0||missingVolumeMm3>toleranceMm3){
        throw Object.assign(new Error('融合结果丢失输入材料，精确差集覆盖校验未通过'),{materialCoverage:{...coverageIdentity,status:'failed',checks}});
      }
    }catch(error){
      const materialCoverage=error.materialCoverage??{...coverageIdentity,status:'unverified',checks};
      throw Object.assign(new Error(`融合材料校验失败：${error.message}；原模型保留。`),{code:'GEOMETRY_INVALID',materialCoverage,details:{materialCoverage},report:{materialCoverage},cause:error});
    }finally{dispose(analyzer);dispose(residual);}
  }
  return {...coverageIdentity,status:'verified',checks};
}
