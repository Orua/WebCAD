import * as cad from 'replicad';
const dispose=value=>{try{value?.delete?.();}catch{}};
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const clone=shape=>cad.deserializeShape(shape.serialize());

function inspect(shape,oc){
  const solids=shape.solids,faces=shape.faces,edges=shape.edges,box=shape.boundingBox;
  let solidFaces,solidEdges,checker;
  try{
    if(solids.length!==1)fail('REFINE_UNSUPPORTED','请先选择或提取一个封闭实体');
    solidFaces=solids[0].faces;
    solidEdges=solids[0].edges;
    if(solidFaces.length!==faces.length||solidEdges.length!==edges.length)fail('REFINE_UNSUPPORTED','来源含独立散面或线，请先提取实体');
    if(faces.length>400||edges.length>2000)fail('REFINE_LIMIT','清理上限为 400 面和 2000 边');
    checker=new oc.BRepCheck_Analyzer(shape.wrapped,true);
    if(!checker.IsValid())fail('GEOMETRY_INVALID','来源或清理结果不是有效 BRep');
    const volumeMm3=cad.measureVolume(shape);
    if(!Number.isFinite(volumeMm3)||volumeMm3<=1e-10)fail('GEOMETRY_INVALID','无法验证封闭实体体积');
    return {solidCount:1,faceCount:faces.length,edgeCount:edges.length,volumeMm3,bounds:box.bounds};
  }finally{[...solids,...faces,...edges,...(solidFaces||[]),...(solidEdges||[]),box,checker].forEach(dispose);}
}

// Boolean verification receives its own BREP copies: OCCT can otherwise adjust
// shared tolerances even when the high-level operation returns another shape.
function materialDifference(a,b){
  let left,right,cut;
  try{left=clone(a);right=clone(b);cut=left.cut(right);return Math.abs(cad.measureVolume(cut));}
  finally{[cut,right,left].forEach(dispose);}
}

export function buildRefineShape(source){
  const oc=cad.getOC();let input,worker,result;
  try{
    input=clone(source);const before=inspect(input,oc);
    worker=new oc.ShapeUpgrade_UnifySameDomain(input.wrapped,true,true,false);
    worker.SetSafeInputMode(true);worker.SetLinearTolerance(1e-7);worker.SetAngularTolerance(1e-7);worker.Build();
    result=cad.cast(worker.Shape());const after=inspect(result,oc);
    if(after.faceCount>=before.faceCount&&after.edgeCount>=before.edgeCount)fail('NO_CHANGE','没有可清理的多余分割线，原实体保持不变');
    const volumeToleranceMm3=Math.max(1e-7,before.volumeMm3*1e-9);
    const boundsDeviationMm=Math.max(...before.bounds.flat().map((v,i)=>Math.abs(v-after.bounds.flat()[i])));
    const volumeDeviationMm3=Math.abs(before.volumeMm3-after.volumeMm3);
    if(volumeDeviationMm3>volumeToleranceMm3||boundsDeviationMm>1e-6)fail('REFINE_GEOMETRY_CHANGED','清理候选改变了体积或外廓，已保留原实体');
    const removedMm3=materialDifference(source,result),addedMm3=materialDifference(result,source);
    if(!Number.isFinite(removedMm3+addedMm3)||Math.max(removedMm3,addedMm3)>volumeToleranceMm3)fail('REFINE_GEOMETRY_CHANGED','清理候选改变了材料区域，已保留原实体');
    result.refineReport={strategy:'occt-unify-same-domain',before,after,removedFaceCount:before.faceCount-after.faceCount,removedEdgeCount:before.edgeCount-after.edgeCount,linearToleranceMm:1e-7,angularToleranceRad:1e-7,boundsDeviationMm,volumeDeviationMm3,volumeToleranceMm3,removedMm3,addedMm3,sourceIsolated:true,topologyIdsChanged:true};
    const out=result;result=null;return out;
  }catch(error){if(error?.code)throw error;fail('REFINE_FAILED',`无法安全清理此实体：${error?.message||String(error)}`);}
  finally{[result,worker,input].forEach(dispose);}
}
