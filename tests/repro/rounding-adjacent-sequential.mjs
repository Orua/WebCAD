import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildRounding} from '../../src/modeling/rounding/index.js';
import {topologyDetails} from '../../src/modeling/rounding/topology.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=value=>{try{value?.delete?.();}catch{}};
const params=(edgeId,radiusMm=.5)=>({specVersion:1,mode:'constant',scope:{kind:'edges',edgeIds:[edgeId]},propagation:'selected-only',radiusMm,boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}});
const source=cad.makeBox([0,0,0],[20,10,8]);let first,second;
try{
  const before=topologyDetails(source),initial=before.find(row=>Math.abs(row.midpoint[1])<1e-7&&Math.abs(row.midpoint[2])<1e-7&&Math.abs(row.endPoint[0]-row.startPoint[0])>19);
  first=buildRounding(source,params(initial.edgeId));
  const after=topologyDetails(first),adjacent=after.filter(row=>row.sharp&&row.adjacentFaceIds.length===2&&Math.abs(row.midpoint[0]-20)<1e-6&&Math.abs(row.midpoint[1])<1e-6&&Math.abs(row.endPoint[2]-row.startPoint[2])>1);
  const output={sourceVolume:cad.measureVolume(source),first:{edgeId:initial.edgeId,volume:cad.measureVolume(first),strategy:first.roundingReport.strategy},adjacent:adjacent.map(row=>({edgeId:row.edgeId,startPoint:row.startPoint,endPoint:row.endPoint,normalAngleDeg:row.normalAngleDeg}))};
  if(adjacent.length===1){
    try{second=buildRounding(first,params(adjacent[0].edgeId));output.second={status:'passed',volume:cad.measureVolume(second),strategy:second.roundingReport.strategy,validation:second.roundingReport.validation};}
    catch(error){output.second={status:'failed',code:error.code,message:error.message,report:error.report};}
    const edges=first.edges,builder=new oc.BRepFilletAPI_MakeFillet(first.wrapped,oc.ChFi3d_FilletShape.ChFi3d_Rational);let native;
    try{
      builder.Add(.5,edges[adjacent[0].edgeId].wrapped);
      const contour=builder.Contour(edges[adjacent[0].edgeId].wrapped),contourEdgeIds=[];
      for(let i=1;i<=builder.NbEdges(contour);i++){const edge=builder.Edge(contour,i);try{contourEdgeIds.push(edges.findIndex(sourceEdge=>sourceEdge.wrapped.IsSame(edge)));}finally{dispose(edge);}}
      const range=new oc.Message_ProgressRange();try{builder.Build(range);}finally{dispose(range);}
      output.nativeExpanded={contourEdgeIds,done:builder.IsDone(),faultyContours:builder.NbFaultyContours()};
      if(builder.IsDone()){
        native=cad.cast(builder.Shape());const analyzer=new oc.BRepCheck_Analyzer(native.wrapped,true,false,false),solids=native.solids;
        try{output.nativeExpanded.valid=analyzer.IsValid();output.nativeExpanded.solidCount=solids.length;output.nativeExpanded.volume=cad.measureVolume(native);}
        finally{dispose(analyzer);solids.forEach(dispose);}
      }
    }catch(error){output.nativeExpanded={error:String(error.message||error)};}
    finally{dispose(native);dispose(builder);edges.forEach(dispose);}
  }
  console.log(JSON.stringify(output,null,2));
}finally{dispose(second);dispose(first);dispose(source);}
