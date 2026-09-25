const dispose=value=>{try{value?.delete();}catch{}};
const finitePoint=value=>Array.isArray(value)&&value.length===3&&value.every(n=>typeof n==='number'&&Number.isFinite(n));
export function nearestBrepReferences(shape,oc,kind,point,{radiusMm=Infinity,maxCandidates=10000}={}){
  if(!['edge','face'].includes(kind)||!finitePoint(point)||!Number.isFinite(radiusMm)&&radiusMm!==Infinity||radiusMm<=0)throw Object.assign(new Error('Invalid exact nearest-point query'),{code:'PARAM_SCHEMA_INVALID'});
  const probe=new oc.gp_Pnt(...point),maker=new oc.BRepBuilderAPI_MakeVertex(probe),vertex=maker.Vertex(),parts=kind==='edge'?shape.edges:shape.faces,items=[];
  try{
    if(parts.length>maxCandidates)throw Object.assign(new Error('Too many topology candidates; narrow the source body'),{code:'RESOURCE_LIMIT'});
    for(let topologyId=0;topologyId<parts.length;topologyId++){
      const distance=new oc.BRepExtrema_DistShapeShape(vertex,parts[topologyId].wrapped);
      try{if(!distance.IsDone()||distance.NbSolution()<1||distance.Value()>radiusMm)continue;const p=distance.PointOnShape2(1);try{items.push({topologyId,worldPoint:[p.X(),p.Y(),p.Z()],residualMm:distance.Value(),quality:'exact-brep',pointOnTrimmedFace:kind==='face'});}finally{dispose(p);}}
      finally{dispose(distance);}
    }
    return items.sort((a,b)=>a.residualMm-b.residualMm||a.topologyId-b.topologyId);
  }finally{parts.forEach(dispose);dispose(vertex);dispose(maker);dispose(probe);}
}
