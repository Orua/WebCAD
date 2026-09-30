import * as cad from 'replicad';
import {topologyDetails} from './topology.js';

const dispose=value=>{try{value?.delete?.();}catch{}};
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const tuple=value=>{try{return value.toTuple();}finally{dispose(value);}};
const fail=(code,message,report)=>{throw Object.assign(new Error(message),{code,report,recoveryAction:'CORRECT_PARAMETERS'});};

// Resolve only the native builder's connected, nonbranching local contour.
// A small source segmentation angle is permitted for adaptive construction;
// this does not relax the separate result-surface tangency acceptance.
export function resolveRoundingEdges(shape,params){
  const rows=topologyDetails(shape),edges=shape.edges,requested=params.scope.edgeIds;
  let builder;
  try{
    if(requested.some(id=>!Number.isInteger(id)||!rows[id]))fail('STALE_REFERENCE','选中边不在当前来源实体中');
    if(requested.some(id=>rows[id].sharp!==true))fail('AMBIGUOUS_SELECTION','请选择尚未圆润的锐边');
    const oc=cad.getOC();builder=new oc.BRepFilletAPI_MakeFillet(shape.wrapped,oc.ChFi3d_FilletShape.ChFi3d_Rational);
    requested.forEach(id=>{if(!builder.Contour(edges[id].wrapped))builder.Add(params.sizeMm,edges[id].wrapped);});
    const resolved=new Set(requested),contours=[];
    for(let c=1;c<=builder.NbContours();c++){
      const ids=[];
      for(let j=1;j<=builder.NbEdges(c);j++){
        const edge=builder.Edge(c,j);let id;try{id=edges.findIndex(e=>e.wrapped.IsSame(edge));}finally{dispose(edge);}
        if(id<0||rows[id].sharp!==true)fail('SCOPE_EXPANSION_REQUIRED','自动边链包含未知或非锐边');
        ids.push(id);
      }
      if(ids.length>64)fail('SCOPE_EXPANSION_REQUIRED','自动边链超过本次局部处理预算');
      const neighbors=new Map(ids.map(id=>[id,new Set()]));
      for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
        const a=rows[ids[i]],b=rows[ids[j]];
        for(const sa of [true,false])for(const sb of [true,false]){
          if(distance(sa?a.startPoint:a.endPoint,sb?b.startPoint:b.endPoint)>1e-5)continue;
          const ta=tuple(edges[a.edgeId].tangentAt(sa?1e-5:1-1e-5)),tb=tuple(edges[b.edgeId].tangentAt(sb?1e-5:1-1e-5));
          const cosine=Math.abs(ta.reduce((sum,v,k)=>sum+v*tb[k],0))/(Math.hypot(...ta)*Math.hypot(...tb));
          if(cosine>=Math.cos(5*Math.PI/180)){neighbors.get(a.edgeId).add(b.edgeId);neighbors.get(b.edgeId).add(a.edgeId);}
        }
      }
      if([...neighbors.values()].some(n=>n.size>2))fail('SCOPE_EXPANSION_REQUIRED','自动边链存在分叉');
      const seen=new Set(),queue=ids.filter(id=>requested.includes(id));
      while(queue.length){const id=queue.pop();if(seen.has(id))continue;seen.add(id);queue.push(...neighbors.get(id));}
      if(seen.size!==ids.length)fail('SCOPE_EXPANSION_REQUIRED','自动边链不连续或转折超出局部处理范围',{requestedEdgeIds:requested,contourEdgeIds:ids});
      ids.forEach(id=>resolved.add(id));contours.push(ids);
    }
    return {edgeIds:[...resolved],contours,signatures:requested.map(id=>({startPoint:rows[id].startPoint,endPoint:rows[id].endPoint,midpoint:rows[id].midpoint,lengthMm:edges[id].length}))};
  }finally{dispose(builder);edges.forEach(dispose);}
}

export function buildUnifiedRounding(shape,params,legacySolve){
  if(params.specVersion!==2||!Number.isFinite(params.sizeMm)||params.sizeMm<=0||params.scope?.kind!=='edges'||!params.scope.edgeIds?.length)fail('PARAM_SCHEMA_INVALID','圆角需要当前选边和正数圆润大小');
  const scope=resolveRoundingEdges(shape,params);
  const result=legacySolve(shape,{specVersion:1,mode:'constant',radiusMm:params.sizeMm,scope:{kind:'edges',edgeIds:scope.edgeIds},propagation:'selected-only',boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}});
  const previous=result.roundingReport;
  result.roundingReport={...previous,specVersion:2,mode:'adaptive',solverVersion:2,requestedSpec:{sizeMm:params.sizeMm,scope:params.scope},
    effectiveSpec:{sizeMm:params.sizeMm,...previous.effectiveSpec},dimensionKind:'exact-radius',
    requestedSelection:[...params.scope.edgeIds],expandedSelection:scope.edgeIds.filter(id=>!params.scope.edgeIds.includes(id)),
    actualContourEdgeIds:scope.contours,selectionSignatures:scope.signatures};
  return result;
}
