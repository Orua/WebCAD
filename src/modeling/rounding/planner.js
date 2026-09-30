import {topologyDetails} from './topology.js';

const invalid=(code,message)=>{throw Object.assign(new Error(message),{code,recoveryAction:'CORRECT_PARAMETERS'});};

export function planConstantRounding(shape,params){
  const rows=topologyDetails(shape),scope=params.scope,kind=scope?.kind;
  const faces=shape.faces;
  try{
    const chosen=new Set(kind==='edges'?scope.edgeIds:kind==='face-boundaries'?scope.faceIds:kind==='shared-faces'?[...scope.faceAIds,...scope.faceBIds]:[]);
    const excluded=new Set(scope?.excludeEdgeIds||[]);
    if([...excluded].some(id=>!Number.isInteger(id)||id<0||id>=rows.length))invalid('STALE_REFERENCE','排除边不在当前来源实体中');
    if(kind==='edges'&&[...chosen].some(id=>!Number.isInteger(id)||id<0||id>=rows.length))invalid('STALE_REFERENCE','选中边不在当前来源实体中');
    if(['face-boundaries','shared-faces'].includes(kind)&&[...chosen].some(id=>!Number.isInteger(id)||id<0||id>=faces.length))invalid('STALE_REFERENCE','选中面不在当前来源实体中');
    let candidates;
    if(kind==='edges'){
      if([...chosen].some(id=>excluded.has(id)))invalid('SELECTION_CONFLICT','同一条边不能同时选中和排除');
      candidates=rows.filter(row=>chosen.has(row.edgeId));
    }
    else if(kind==='face-boundaries')candidates=rows.filter(row=>row.adjacentFaceIds.some(id=>chosen.has(id)));
    else if(kind==='shared-faces'){
      const a=new Set(scope.faceAIds),b=new Set(scope.faceBIds);
      candidates=rows.filter(row=>row.adjacentFaceIds.length===2&&row.adjacentFaceIds.some(id=>a.has(id))&&row.adjacentFaceIds.some(id=>b.has(id)));
    }else if(kind==='body'){
      candidates=rows.filter(row=>!excluded.has(row.edgeId));
    }
    else invalid('PARAM_SCHEMA_INVALID','无效圆角作用范围');
    if(kind!=='edges'&&kind!=='body')candidates=candidates.filter(row=>!excluded.has(row.edgeId));
    if(!candidates.length)invalid('AMBIGUOUS_SELECTION','作用范围内没有边');
    const unknown=candidates.filter(row=>row.sharp===null);
    if(unknown.length)invalid('AMBIGUOUS_SELECTION',`边 ${unknown.map(row=>row.edgeId).join(', ')} 的锐利状态无法核对`);
    const targets=candidates.filter(row=>row.sharp);
    if(!targets.length)invalid('AMBIGUOUS_SELECTION','选区没有需要处理的锐边');
    const selectedEdgeIds=candidates.map(row=>row.edgeId),sharpSeedEdgeIds=targets.map(row=>row.edgeId);
    return {rows,targets,selectedEdgeIds,sharpSeedEdgeIds,requestedEdgeIds:sharpSeedEdgeIds,excludedEdgeIds:[...excluded],skippedTangentEdgeIds:candidates.filter(row=>!row.sharp).map(row=>row.edgeId)};
  }finally{faces.forEach(face=>face.delete());}
}
