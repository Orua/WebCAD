import * as cad from 'replicad';
import {topologyDetails} from './smooth-transition.js';

const dispose=value=>{try{value?.delete();}catch{}};
const fail=message=>{throw Object.assign(new Error(message),{code:'GEOMETRY_INVALID',recoveryAction:'CORRECT_PARAMETERS'});};

// A failed requested radius must never be silently reduced. Probe a few smaller
// values only to give the operator one verified alternative. Fillet feasibility
// is not globally monotone, so this is a sampled success, not a maximum radius.
function sampledFilletRadius(shape,amount,targets,edges,oc){
  if(targets.length>8||amount<=0.02)return null;
  // Feasibility can have disconnected intervals on trimmed surfaces. Search
  // discrete radii from large to small instead of assuming binary monotonicity.
  for(let step=11;step>=1;step--){
    const radius=amount*step/12;
    let builder,progress,result,check,solids;
    try{
      builder=new oc.BRepFilletAPI_MakeFillet(shape.wrapped,oc.ChFi3d_FilletShape.ChFi3d_Rational);
      for(const row of targets)builder.Add(radius,edges[row.edgeId].wrapped);
      progress=new oc.Message_ProgressRange();builder.Build(progress);
      if(!builder.IsDone())throw new Error('fillet incomplete');
      result=cad.cast(builder.Shape());check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);
      if(!check.IsValid())throw new Error('invalid fillet');
      solids=result.solids;
      if(solids.length!==1||cad.measureVolume(result)<=1e-9)throw new Error('not a solid');
      return radius;
    }catch{}
    finally{solids?.forEach(dispose);dispose(check);dispose(result);dispose(progress);dispose(builder);}
  }
  return null;
}

// Resolve only real sharp BRep edges. Periodic seams and tangent boundaries
// belong to the surface representation, not to the machining selection.
export function blendTargets(shape,{edgeIds,faceIds,allEdges=false,sharedFaces=false}) {
  const rows=topologyDetails(shape),faces=shape.faces;
  try {
    const ids=edgeIds??faceIds,max=edgeIds?rows.length:faces.length;
    if(!allEdges&&(!ids?.length||ids.some(i=>!Number.isInteger(i)||i<0||i>=max)))fail('请选择当前实体的有效边或面');
    if(sharedFaces&&(!faceIds||faceIds.length<2))fail('公共边倒角需要至少两个相邻面');
  }finally{faces.forEach(dispose);}
  const chosen=new Set(edgeIds??faceIds);
  const candidates=rows.filter(row=>allEdges||edgeIds&&chosen.has(row.edgeId)||faceIds&&(sharedFaces
    ?row.adjacentFaceIds.length===2&&row.adjacentFaceIds.every(id=>chosen.has(id))
    :row.adjacentFaceIds.some(id=>chosen.has(id))));
  if(!candidates.length)fail('所选面没有公共边；请选择同一实体上互相接触的面');
  const unknown=candidates.filter(row=>row.sharp===null);
  if(unknown.length)fail(`边 ${unknown.map(row=>row.edgeId).join(', ')} 无法取得两侧有效面法向，请检查开口或无效曲面`);
  const targets=candidates.filter(row=>row.sharp);
  if(!targets.length)fail('所选范围没有锐边：相切边、周期接缝及退化边不需要倒角');
  return {targets,rows,skipped:candidates.filter(row=>!row.sharp).map(row=>row.edgeId)};
}

export function buildEdgeBlend(shape,op,params) {
  const amount=params[op==='fillet'?'radius':'distance'];
  const {targets,rows,skipped}=blendTargets(shape,params),oc=cad.getOC(),edges=shape.edges;
  let builder,result;
  try {
    builder=op==='fillet'?new oc.BRepFilletAPI_MakeFillet(shape.wrapped,oc.ChFi3d_FilletShape.ChFi3d_Rational):new oc.BRepFilletAPI_MakeChamfer(shape.wrapped);
    for(const row of targets)builder.Add(amount,edges[row.edgeId].wrapped);
    // Check completion before asking for the solid. BadShape() is never a result.
    const progress=new oc.Message_ProgressRange();
    try{builder.Build(progress);}finally{dispose(progress);}
    if(!builder.IsDone())throw new Error('内核未完成过渡面连接');
    result=cad.cast(builder.Shape());
    const check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);
    try{if(!check.IsValid())throw new Error('过渡面自交或实体无效');}finally{dispose(check);}
    result.blendReport={operation:op,amount,scope:params.allEdges?'body':params.faceIds?(params.sharedFaces?'shared-faces':'face-boundaries'):'edges',
      processedEdgeIds:targets.map(row=>row.edgeId),skippedTangentEdgeIds:skipped};
    const output=result;result=null;return output;
  }catch(error){
    let failedIds=[];
    if(op==='fillet'&&builder)try{
      const failed=new Set(Array.from({length:builder.NbFaultyContours()},(_,i)=>builder.FaultyContour(i+1)));
      failedIds=targets.filter(row=>failed.has(builder.Contour(edges[row.edgeId].wrapped))).map(row=>row.edgeId);
    }catch{}
    const ids=failedIds.length?failedIds:targets.map(row=>row.edgeId);
    const nearKinks=rows.filter(row=>row.normalAngleDeg>.05&&row.normalAngleDeg<5&&targets.some(target=>
      [row.startPoint,row.endPoint].some(a=>[target.startPoint,target.endPoint].some(b=>Math.hypot(...a.map((v,i)=>v-b[i]))<1e-5))));
    const continuity=nearKinks.length?`相连边存在小折角：${nearKinks.slice(0,8).map(row=>`${row.edgeId} (${row.normalAngleDeg.toFixed(3)}°)`).join(', ')}；视觉接近平滑不等于精确相切。`:'';
    const sampled=op==='fillet'?sampledFilletRadius(shape,amount,targets,edges,oc):null;
    const alternative=sampled===null?'':`较小半径 R${sampled.toFixed(6)} mm 已单独试算为有效单实体，仅供参考，未应用；这不是最大可用半径。`;
    let detail=error?.message;
    if(!detail)try{detail=oc.getExceptionMessage(error);}catch{}
    fail(`${op==='fillet'?'圆角 R':'斜角 C'}${amount} mm 无法完成，${failedIds.length?'失败边':'目标边'}：${ids.join(', ')}。${detail||'内核未返回有效实体'}。${continuity}${alternative}请检查接续轮廓是否相切、小面交汇及半径空间；必要时修正来源轮廓后重算。原模型保留。`);
  }finally{dispose(result);dispose(builder);edges.forEach(dispose);}
}
