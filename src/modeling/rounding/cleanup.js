import * as cad from 'replicad';
import {topologyDetails} from './topology.js';
import {planConstantRounding} from './planner.js';
import {nativeConstantFillet} from './native-fillet.js';

const dispose=value=>{try{value?.delete?.();}catch{}};
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const fail=message=>{throw Object.assign(new Error(message),{code:'CLEANUP_NOT_APPLICABLE'});};

// This is a topology-only candidate. Rebuild the source BREP first so the
// unifier cannot change the caller's shape or its revision-local references.
export function controlledUnifiedNativeFillet(shape,params,plan){
  if(params.mode!=='constant'||params.scope?.kind!=='edges'||plan.targets.length!==1||plan.requestedEdgeIds.length!==1)fail('同域整理只试单条明确源边');
  const oc=cad.getOC(),sourceEdgeId=plan.requestedEdgeIds[0],sourceEdges=shape.edges,sourceFaces=shape.faces;
  let copy,worker,unified,differenceA,differenceB,checker,output;
  try{
    const sourceEdge=sourceEdges[sourceEdgeId],sourceRow=plan.targets[0];
    const before={edgeCount:sourceEdges.length,faceCount:sourceFaces.length,volumeMm3:cad.measureVolume(shape)};
    copy=cad.deserializeShape(shape.serialize()).asShape3D();
    worker=new oc.ShapeUpgrade_UnifySameDomain(copy.wrapped,true,true,true);
    worker.SetSafeInputMode(true);worker.SetLinearTolerance(1e-7);worker.SetAngularTolerance(1e-7);worker.Build();
    unified=cad.cast(worker.Shape());
    const candidateEdges=unified.edges,candidateFaces=unified.faces;
    try{
      const after={edgeCount:candidateEdges.length,faceCount:candidateFaces.length,volumeMm3:cad.measureVolume(unified)};
      if(after.edgeCount>=before.edgeCount&&after.faceCount>=before.faceCount)fail('同域整理没有减少冗余拓扑');
      checker=new oc.BRepCheck_Analyzer(unified.wrapped,true);
      if(!checker.IsValid())fail('整理候选 BRep 无效');
      differenceA=shape.cut(unified);differenceB=unified.cut(shape);
      const sourceMinusCandidateMm3=cad.measureVolume(differenceA),candidateMinusSourceMm3=cad.measureVolume(differenceB);
      if(Math.max(sourceMinusCandidateMm3,candidateMinusSourceMm3)>1e-7||Math.abs(after.volumeMm3-before.volumeMm3)>1e-7)fail('整理候选改变了材料区域');
      const sourceLength=sourceEdge.length,type=sourceEdge.geomType;
      const matches=topologyDetails(unified).filter(row=>{
        const edge=candidateEdges[row.edgeId];
        if(edge.geomType!==type||Math.abs(edge.length-sourceLength)>1e-5||distance(row.midpoint,sourceRow.midpoint)>1e-5)return false;
        return distance(row.startPoint,sourceRow.startPoint)<1e-5&&distance(row.endPoint,sourceRow.endPoint)<1e-5
          ||distance(row.startPoint,sourceRow.endPoint)<1e-5&&distance(row.endPoint,sourceRow.startPoint)<1e-5;
      });
      if(matches.length!==1)fail('原目标边在整理后没有唯一的等价边');
      const candidateEdgeId=matches[0].edgeId,candidateParams={...params,scope:{kind:'edges',edgeIds:[candidateEdgeId]}};
      const candidatePlan=planConstantRounding(unified,candidateParams);
      output=nativeConstantFillet(unified,candidateParams,candidatePlan);
      output.strategy='unified-native';output.actualEdgeIds=[sourceEdgeId];
      output.cleanup={kind:'same-domain',copyMethod:'BREP-serialize-deserialize',linearToleranceMm:1e-7,angularToleranceRad:1e-7,
        sourceEdgeId,candidateEdgeId,before,after,sourceMinusCandidateMm3,candidateMinusSourceMm3};
      return output;
    }finally{candidateEdges.forEach(dispose);candidateFaces.forEach(dispose);}
  }catch(error){dispose(output?.shape);throw error;}
  finally{[checker,differenceB,differenceA,unified,worker,copy].forEach(dispose);sourceEdges.forEach(dispose);sourceFaces.forEach(dispose);}
}
