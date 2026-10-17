import * as cad from 'replicad';
import {booleanFaceOrigins,copyFaceOrigins} from './face-origins.js';
const dispose=x=>{try{x?.delete?.();}catch{}};
function bounds(shape){const b=shape.boundingBox;try{return b.bounds.map(p=>[...p]);}finally{dispose(b);}}
function groups(shapes){
  const boxes=shapes.map(bounds),pending=new Set(shapes.map((_,i)=>i)),result=[];
  while(pending.size){const group=[pending.values().next().value];pending.delete(group[0]);for(let k=0;k<group.length;k++)for(const i of [...pending])if([0,1,2].every(a=>boxes[i][0][a]<=boxes[group[k]][1][a]+1e-7&&boxes[group[k]][0][a]<=boxes[i][1][a]+1e-7)){group.push(i);pending.delete(i);}result.push(group);}
  return result;
}
export function robustUnion(shapes,{fuzzyMm=0,glue='off',toolIds=[],toolNames=[],measure=s=>Math.abs(cad.measureVolume(s)),allowFallback=true,simplifyResult=true}={}){
  if(!Number.isFinite(fuzzyMm)||fuzzyMm<0||fuzzyMm>.1||!['off','shift','full'].includes(glue))throw Object.assign(new Error('fuzzyMm须为0–0.1mm，glue须为off/shift/full'),{code:'PARAM_SCHEMA_INVALID'});
  const oc=cad.getOC(),volumes=shapes.map(measure),lower=Math.max(...volumes),upper=volumes.reduce((a,b)=>a+b,0),start=performance.now(),attempts=[];
  let invalidSubshapes;
  function check(shape){
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
    const volume=measure(shape),epsilon=1e-7+upper*1e-8;
    if(!Number.isFinite(volume)||volume<lower-epsilon||volume>upper+epsilon)throw new Error('融合结果违反输入材料体积范围');return volume;
  }
  function fuse(items){
    if(items.length===1)return copyFaceOrigins(items[0],items[0].clone());
    let builder,args,tools,progress;
    try{
      builder=new oc.BRepAlgoAPI_Fuse();args=new oc.NCollection_List_TopoDS_Shape();tools=new oc.NCollection_List_TopoDS_Shape();args.Append(items[0].wrapped);items.slice(1).forEach(s=>tools.Append(s.wrapped));
      builder.SetArguments(args);builder.SetTools(tools);builder.SetNonDestructive(true);builder.SetRunParallel(false);builder.SetFuzzyValue(fuzzyMm);builder.SetGlue(oc.BOPAlgo_GlueEnum[{off:'BOPAlgo_GlueOff',shift:'BOPAlgo_GlueShift',full:'BOPAlgo_GlueFull'}[glue]]);
      progress=new oc.Message_ProgressRange();builder.Build(progress);if(!builder.IsDone()||builder.HasErrors())throw new Error('多参数布尔运算失败');if(simplifyResult)builder.SimplifyResult(true,true,1e-7);return booleanFaceOrigins(items,cad.cast(builder.Shape()),builder);
    }finally{[progress,tools,args,builder].forEach(dispose);}
  }
  let lastError;
  for(let attempt=0;attempt<(allowFallback?2:1);attempt++){
    let result;const owned=[];let strategy=attempt===0?'multi-fuse':'bbox-clusters';
    try{
      if(attempt===0)result=fuse(shapes);
      else{
        const clusters=groups(shapes);
        if(clusters.length>1){for(const cluster of clusters)owned.push(fuse(cluster.map(i=>shapes[i])));result=fuse(owned);}
        else{strategy='sequential-fuse';result=copyFaceOrigins(shapes[0],shapes[0].clone());for(const tool of shapes.slice(1)){const next=fuse([result,tool]);dispose(result);result=next;}}
      }
      const volumeAfter=check(result);result.booleanReport={strategy,attempts:[...attempts,{strategy,status:'completed'}],fuzzyMm,glue,simplified:simplifyResult,volumeBefore:volumes,volumeAfter,elapsedMs:performance.now()-start};const output=result;result=null;return output;
    }catch(error){lastError=error;attempts.push({strategy,status:'failed',message:String(error.message||error)});}
    finally{dispose(result);owned.forEach(dispose);}
  }
  const tools=shapes.map((shape,i)=>{const [min,max]=bounds(shape);return {toolId:toolIds[i],toolName:toolNames[i],pointMm:min.map((v,j)=>(v+max[j])/2),volumeMm3:volumes[i]};});
  const pointsMm=invalidSubshapes?.pointsMm?.length?invalidSubshapes.pointsMm:tools.map(t=>t.pointMm);
  const details={strategy:attempts.at(-1)?.strategy,attempts,tools,toolIds:tools.map(t=>t.toolId),...invalidSubshapes,pointsMm,pointSource:invalidSubshapes?.pointsMm?.length?'invalid-subshape-bounds-center':'participating-tool-bounds-center',volumeBefore:volumes,suggestion:"检查共面端面；可在确认公差后指定glue:'shift'或fuzzyMm。",elapsedMs:performance.now()-start};
  throw Object.assign(new Error('融合失败：'+String(lastError?.message||lastError)+'；原模型保留。'),{code:'GEOMETRY_INVALID',details,report:details});
}
