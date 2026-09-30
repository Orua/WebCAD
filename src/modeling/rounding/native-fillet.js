import * as cad from 'replicad';
import {topologyDetails} from './topology.js';
import {measureGeneratedSurfaceRadius,measureBlendSectionRadius} from './section-metrics.js';

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

const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const unit=v=>{const length=Math.hypot(...v);return length>1e-12?v.map(x=>x/length):null;};
const difference=(a,b)=>a.map((v,i)=>v-b[i]);
function endpointTangent(edge,atStart){
  const point=edge.pointAt(atStart?.00001:.99999),end=atStart?edge.startPoint:edge.endPoint;
  try{return unit(atStart?difference(point.toTuple(),end.toTuple()):difference(end.toTuple(),point.toTuple()));}
  finally{dispose(point);dispose(end);}
}

function verifyTangentScope(params,plan,contours,edges){
  const requested=new Set(plan.sharpSeedEdgeIds),excluded=new Set(plan.excludedEdgeIds);
  const actual=[...new Set(contours.flat())],expanded=actual.filter(id=>!requested.has(id));
  if(!expanded.length)return {actual,expanded};
  const report={requestedEdgeIds:plan.selectedEdgeIds,sharpSeedEdgeIds:plan.sharpSeedEdgeIds,expandedEdgeIds:expanded,actualContourEdgeIds:contours};
  if(params.propagation!=='tangent-chain')error('SCOPE_EXPANSION_REQUIRED',`内核将沿相切链扩展到边 ${expanded.join(', ')}`,report);
  if(actual.some(id=>excluded.has(id)))error('SCOPE_EXPANSION_REQUIRED','相切传播碰到排除边',report);
  for(const chain of contours){
    if(chain.some(id=>plan.rows[id]?.sharp!==true))error('SCOPE_EXPANSION_REQUIRED','相切传播包含非锐边或未知边',report);
    const neighbors=new Map(chain.map(id=>[id,new Set()]));
    for(let i=0;i<chain.length;i++)for(let j=i+1;j<chain.length;j++){
      const a=plan.rows[chain[i]],b=plan.rows[chain[j]];
      let connection=null;
      for(const aStart of [true,false])for(const bStart of [true,false]){
        if(distance(aStart?a.startPoint:a.endPoint,bStart?b.startPoint:b.endPoint)<1e-5)connection={aStart,bStart};
      }
      if(!connection)continue;
      const ta=endpointTangent(edges[a.edgeId],connection.aStart),tb=endpointTangent(edges[b.edgeId],connection.bStart);
      const dot=ta&&tb?Math.abs(ta.reduce((sum,v,k)=>sum+v*tb[k],0)):0;
      if(dot<Math.cos(.1*Math.PI/180))continue;
      neighbors.get(a.edgeId).add(b.edgeId);neighbors.get(b.edgeId).add(a.edgeId);
    }
    if([...neighbors.values()].some(set=>set.size>2))error('SCOPE_EXPANSION_REQUIRED','相切传播出现分叉',report);
    const seen=new Set(),queue=chain.filter(id=>requested.has(id));
    while(queue.length){const id=queue.pop();if(seen.has(id))continue;seen.add(id);queue.push(...neighbors.get(id));}
    if(seen.size!==chain.length)error('SCOPE_EXPANSION_REQUIRED','内核轮廓包含不连续的传播边',report);
  }
  return {actual,expanded};
}

function normalSectionFrame(edge,row){
  const before=edge.pointAt(.499),after=edge.pointAt(.501);
  try{
    const tangent=unit(difference(after.toTuple(),before.toTuple()));
    if(!tangent)error('GEOMETRY_INVALID','圆角轮廓的中点切向无法核对');
    const q=tangent[0]<-.999999?[0,0,1,0]:[0,-tangent[2],tangent[1],1+tangent[0]];
    const length=Math.hypot(...q);
    return {origin:row.midpoint,quaternion:q.map(v=>v/length)};
  }finally{dispose(before);dispose(after);}
}

function generatedFaces(builder,sourceEdges,result,edgeIds,rows,radiusMm,oc,strict){
  const faces=result.faces,mapping=[];
  try{
    for(const edgeId of edgeIds){
      const list=builder.Generated(sourceEdges[edgeId].wrapped);
      let native,adaptor,surface;
      try{
        if(list.Extent()!==1){if(strict)error('GEOMETRY_INVALID',`边 ${edgeId} 的生成面无法唯一核对`);mapping.push({edgeId,status:'unknown',generatedFaceCount:list.Extent()});continue;}
        native=list.First();const faceId=faces.findIndex(face=>face.wrapped.IsSame(native));
        if(faceId<0)error('GEOMETRY_INVALID',`边 ${edgeId} 的生成面未在最终实体中找到`);
        const type=faces[faceId].geomType;
        if(type==='CYLINDRE'||type==='SPHERE'||type==='TORUS'){
          let measuredRadiusMm,sectionFitResidualMm=null;
          if(type==='TORUS'){
            const metric=measureBlendSectionRadius(result,{plane:'YZ',offset:0,frame:normalSectionFrame(sourceEdges[edgeId],rows[edgeId]),faceId,curveNear:rows[edgeId].midpoint},cad);
            measuredRadiusMm=metric.radiusMm;sectionFitResidualMm=metric.sectionFitResidualMm;
            if(strict&&(metric.sectionFitResidualMm>1e-5||metric.planeResidualMm>1e-5))error('GEOMETRY_INVALID',`边 ${edgeId} 的局部截面不是精确 R 圆`,{edgeId,metric});
          }else{
          adaptor=new oc.BRepAdaptor_Surface(faces[faceId].wrapped,true);
          surface=type==='CYLINDRE'?adaptor.Cylinder():adaptor.Sphere();
          measuredRadiusMm=surface.Radius();
          }
          if(strict&&Math.abs(measuredRadiusMm-radiusMm)>1e-5)error('GEOMETRY_INVALID',`边 ${edgeId} 实测 R 与请求不符`,{edgeId,requestedRadiusMm:radiusMm,measuredRadiusMm});
          mapping.push({edgeId,faceId,surfaceType:type,measuredRadiusMm,sectionFitResidualMm,status:Math.abs(measuredRadiusMm-radiusMm)<=1e-5?'passed':'mismatch'});
        }else{
          const metric=measureGeneratedSurfaceRadius(faces[faceId],radiusMm,cad);
          mapping.push({edgeId,faceId,surfaceType:type,measuredRadiusMm:metric.radiusMm,sectionFitResidualMm:metric.maxSectionFitResidualMm,sectionCount:metric.sectionCount,radiusMethod:metric.method,status:'passed'});
        }
      }finally{[surface,adaptor,native,list].forEach(dispose);}
    }
    return mapping;
  }finally{faces.forEach(dispose);}
}

function verifyGeneratedSeams(result,plan,actual,generatedFaceMap,radiusMm){
  const generated=new Set(generatedFaceMap.map(row=>row.faceId));
  const terminals=[];
  for(const id of actual)for(const point of [plan.rows[id].startPoint,plan.rows[id].endPoint]){
    const touches=actual.reduce((count,other)=>count+[plan.rows[other].startPoint,plan.rows[other].endPoint].filter(p=>distance(p,point)<1e-5).length,0);
    if(touches===1)terminals.push(point);
  }
  const seams=topologyDetails(result).filter(row=>row.adjacentFaceIds.some(id=>generated.has(id))&&row.adjacentFaceIds.length===2);
  const naturalTerminationEdgeIds=[];
  for(const row of seams){
    if(row.normalAngleDeg===null)error('GEOMETRY_INVALID',`生成面接缝 ${row.edgeId} 法向未知`);
    if(row.normalAngleDeg<=.1)continue;
    if(terminals.some(point=>distance(row.midpoint,point)<=2*radiusMm+1e-5)){naturalTerminationEdgeIds.push(row.edgeId);continue;}
    error('GEOMETRY_INVALID',`生成面内部接缝 ${row.edgeId} 未接顺`,{edgeId:row.edgeId,normalAngleDeg:row.normalAngleDeg});
  }
  return {status:'G1-contact-sampled',contactEdgeCount:seams.length-naturalTerminationEdgeIds.length,naturalTerminationEdgeIds,maxContactAngleDeg:Math.max(0,...seams.filter(row=>!naturalTerminationEdgeIds.includes(row.edgeId)).map(row=>row.normalAngleDeg))};
}

export function nativeConstantFillet(shape,params,plan){
  const oc=cad.getOC(),edges=shape.edges;
  let builder,result;
  try{
    builder=new oc.BRepFilletAPI_MakeFillet(shape.wrapped,oc.ChFi3d_FilletShape.ChFi3d_Rational);
    builder.SetParams(1e-6,1e-6,1e-6,1e-7,1e-7,1e-5);
    const contours=[];
    for(const row of plan.targets){
      if(builder.Contour(edges[row.edgeId].wrapped))continue;
      builder.Add(params.radiusMm,edges[row.edgeId].wrapped);
      const contour=builder.Contour(edges[row.edgeId].wrapped);
      if(!contour)error('KERNEL_BUILD_FAILED','内核未登记目标轮廓');
      contours.push(contour);
    }
    const contourEdgeIds=contours.map(contour=>contourEdges(builder,contour,edges));
    const {actual,expanded}=verifyTangentScope(params,plan,contourEdgeIds,edges);
    const progress=new oc.Message_ProgressRange();try{builder.Build(progress);}finally{dispose(progress);}
    if(!builder.IsDone())error('KERNEL_BUILD_FAILED','内核未完成指定半径的圆角构造',{requestedEdgeIds:plan.requestedEdgeIds,faultyContourCount:builder.NbFaultyContours()});
    result=cad.cast(builder.Shape());
    const closedContours=actual.every(id=>[plan.rows[id].startPoint,plan.rows[id].endPoint].every(point=>
      actual.reduce((count,other)=>count+[plan.rows[other].startPoint,plan.rows[other].endPoint].filter(p=>distance(p,point)<1e-5).length,0)===2));
    const generatedFaceMap=generatedFaces(builder,edges,result,actual,plan.rows,params.radiusMm,oc,expanded.length>0||closedContours);
    const seamValidation=expanded.length||closedContours?verifyGeneratedSeams(result,plan,actual,generatedFaceMap,params.radiusMm):null;
    const output={shape:result,actualEdgeIds:actual,expandedEdgeIds:expanded,contourEdgeIds,generatedFaceMap,seamValidation,contourCount:builder.NbContours(),surfaceCount:builder.NbSurfaces()};
    result=null;return output;
  }finally{dispose(result);dispose(builder);edges.forEach(dispose);}
}
