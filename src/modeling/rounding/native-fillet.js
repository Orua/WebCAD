import * as cad from 'replicad';

const dispose=value=>{try{value?.delete?.();}catch{}};
const error=(code,message,report)=>{throw Object.assign(new Error(message),{code,recoveryAction:'CORRECT_PARAMETERS',report});};

function contourEdges(builder,contour,edges){
  const ids=[];
  for(let index=1;index<=builder.NbEdges(contour);index++){
    const native=builder.Edge(contour,index);
    try{const match=edges.findIndex(edge=>edge.wrapped.IsSame(native));if(match<0)error('KERNEL_BUILD_FAILED','内核传播边不在来源实体中');ids.push(match);}
    finally{dispose(native);}
  }
  return ids;
}

export function nativeConstantFillet(shape,params,plan){
  const oc=cad.getOC(),edges=shape.edges,allowed=new Set(plan.requestedEdgeIds);
  let builder,result;
  try{
    builder=new oc.BRepFilletAPI_MakeFillet(shape.wrapped,oc.ChFi3d_FilletShape.ChFi3d_Rational);
    const contours=[];
    for(const row of plan.targets){
      if(builder.Contour(edges[row.edgeId].wrapped))continue;
      builder.Add(params.radiusMm,edges[row.edgeId].wrapped);
      const contour=builder.Contour(edges[row.edgeId].wrapped);
      if(!contour)error('KERNEL_BUILD_FAILED','内核未登记目标轮廓');
      contours.push(contour);
    }
    const actual=[...new Set(contours.flatMap(contour=>contourEdges(builder,contour,edges)))];
    const expanded=actual.filter(id=>!allowed.has(id));
    if(expanded.length)error('SCOPE_EXPANSION_REQUIRED',`内核将沿相切链扩展到边 ${expanded.join(', ')}`,{expandedEdgeIds:expanded,requestedEdgeIds:plan.requestedEdgeIds});
    const progress=new oc.Message_ProgressRange();try{builder.Build(progress);}finally{dispose(progress);}
    if(!builder.IsDone())error('KERNEL_BUILD_FAILED','内核未完成指定半径的圆角构造',{requestedEdgeIds:plan.requestedEdgeIds,faultyContourCount:builder.NbFaultyContours()});
    result=cad.cast(builder.Shape());
    const output={shape:result,actualEdgeIds:actual,contourCount:builder.NbContours(),surfaceCount:builder.NbSurfaces()};
    result=null;return output;
  }finally{dispose(result);dispose(builder);edges.forEach(dispose);}
}
