import * as cad from 'replicad';
import {topologyDetails,sharpAngleDeg} from './modeling/rounding/topology.js';
import {resolveBlendSelector} from './semantic-blend-selector.js';
import {buildBlendRadius} from './blend-radius.js';
import {searchMaxFeasibleRadius} from './edge-blend.js';
export {topologyDetails,sharpAngleDeg} from './modeling/rounding/topology.js';
const dispose = value => { try { value?.delete(); } catch {} };
const fail = (message,extra={}) => { throw Object.assign(new Error(message), {code:'GEOMETRY_INVALID',...extra}); };
const noChange = message => { throw Object.assign(new Error(message), {code:'NO_CHANGE',recoveryAction:'NONE'}); };
export function buildSmoothTransition(shape,{faceIds,selector,context,radius,allEdges=false,radiusFallback}={}) {
  const faces=shape.faces,solids=shape.solids;
  try {
    if(allEdges)faceIds=faces.map((_,i)=>i);
    if(solids.length!==1)fail(`平滑过渡需要单一实体；当前仍为 ${solids.length} 个实体，尚未融合。请先合并为单一实体。`);
    // R9-P1: one face = its whole sharp boundary; whole body may have a single face (sphere/torus).
    if(!selector&&(!Array.isArray(faceIds)||faceIds.length<1||new Set(faceIds).size!==faceIds.length||faceIds.some(i=>!Number.isInteger(i)||i<0||i>=faces.length)))fail('请选择至少一个当前实体的面');
    if(typeof radius!=='number'||!Number.isFinite(radius)||radius<=0)fail('过渡半径必须为正数，单位 mm');
  }finally{faces.forEach(dispose);solids.forEach(dispose);}
  const before=topologyDetails(shape);
  const skippedOneSided=allEdges?before.filter(e=>e.sharp===null).map(e=>e.edgeId):[];
  let selection=null,shared;
  if(selector){
    try{selection=resolveBlendSelector(shape,{selector},context);}
    catch(error){throw Object.assign(error,{code:error.code||'GEOMETRY_INVALID'});}
    shared=selection.targets;
  }else{
    const selected=new Set(faceIds);
    shared=!allEdges&&faceIds.length===1?before.filter(e=>e.adjacentFaceIds.includes(faceIds[0])&&e.adjacentFaceIds.length===2):before.filter(e=>e.adjacentFaceIds.length===2&&e.adjacentFaceIds.every(i=>selected.has(i)));
  }
  if(!shared.length&&allEdges)noChange('实体没有锐边，无需修改，原模型保持不变。');
  if(!shared.length)fail('所选面没有公共接缝，请选择互相连接的面');
  const sharedUnknown=shared.filter(e=>e.sharp===null);
  if(sharedUnknown.length&&!allEdges)fail(`接缝 ${sharedUnknown.map(e=>e.edgeId).join(', ')} 法向无法可靠测量，未修改模型`);
  const targets=shared.filter(e=>e.sharp);
  const selected=selection?new Set(selection.selectorReport.resolvedFaceIds):new Set(faceIds||[]);
  if(!targets.length)noChange(allEdges?'实体没有锐边，无需修改，原模型保持不变。':'所选面之间已相切，没有需要处理的尖锐接缝，无需修改。');
  const inputEdges=shape.edges,inputFaces=shape.faces;
  let result,finder;
  try {
    // Solve all shared sharp seams together so their end patches meet in one OCCT build.
    result=buildBlendRadius(shape,{selector:{edgeIds:targets.map(e=>e.edgeId)},radiusMm:radius,context});
    const check=new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false);
    try{if(!check.IsValid())fail('过渡面自交或几何无效');}finally{dispose(check);}
    const resultSolids=result.solids;
    try{if(resultSolids.length!==1||Math.abs(cad.measureVolume(result))<1e-9)fail('过渡未形成单一封闭实心体');}finally{resultSolids.forEach(dispose);}
    const after=topologyDetails(result),sharpAfter=after.filter(e=>e.sharp),sourceSharp=before.filter(e=>e.sharp);
    if(after.some(e=>e.sharp===null))fail('结果含无法核对的接缝，未提交');
    const tolerance=1e-5;
    const onEdge=(point,row)=>{
      if(point.some((v,i)=>v<row.bounds[0][i]-tolerance||v>row.bounds[1][i]+tolerance))return false;
      const vertex=cad.makeVertex(point);
      try{return cad.measureDistanceBetween(vertex,inputEdges[row.edgeId])<=tolerance;}finally{dispose(vertex);}
    };
    const targetIds=new Set(targets.map(e=>e.edgeId)),boundarySharpEdges=[];
    for(const edge of sharpAfter){
      const inherited=sourceSharp.filter(old=>onEdge(edge.midpoint,old));
      if(inherited.some(old=>targetIds.has(old.edgeId)))fail('所选接缝未完全平滑；请调整面组或半径');
      if(!inherited.length){
        // A local blend can end on an unselected face. Report these boundary creases;
        // do not confuse them with failed continuity between the selected faces.
        const vertex=cad.makeVertex(edge.midpoint);
        let atBoundary=false;
        try{atBoundary=!allEdges&&inputFaces.some((face,i)=>!selected.has(i)&&cad.measureDistanceBetween(vertex,face)<=tolerance);}finally{dispose(vertex);}
        // One selected face: its boundary blends end against unselected neighbours;
        // such terminations are reported like boundary creases, never as smooth.
        if(!atBoundary&&!(!allEdges&&!selector&&faceIds?.length===1))fail('交汇处仍有新利角；请调整面组或半径');
        boundarySharpEdges.push(edge.edgeId);
      }
    }
    result.transitionReport={mode:allEdges?'body':selector?'semantic-selector':faceIds?.length===1?'face-boundary':'faces',radius,...(faceIds?{sourceFaceIds:[...faceIds]}:{}),...(selection?selection.selectorReport:{}),processedEdgeIds:targets.map(e=>e.edgeId),
      processedSeams:targets.length,remainingSharpEdges:sharpAfter.map(e=>e.edgeId),
      // R9-P3 unified receipt aliases (same names as fillet blendReport).
      status:'committed',failedEdgeIds:[],remainingSharpEdgeIds:sharpAfter.map(e=>e.edgeId),radiusPerEdge:targets.map(e=>({edgeId:e.edgeId,radiusMm:radius})),
      remainingSharpEdgeCount:sharpAfter.length,boundarySharpEdges,skippedOneSidedEdgeIds:skippedOneSided,maxFeasibleRadiusMm:null,normalSampleFractions:[.2,.5,.8],angleToleranceDeg:sharpAngleDeg,
      validation:boundarySharpEdges.length?'valid-solid; selected-sharp-seams-removed; unselected-boundary-creases-reported':'valid-solid; selected-sharp-seams-removed; no-new-sharp-seams-at-samples',
      scope:allEdges?'All sharp edges required; sampled continuity, not a vertex safety certification.':'Selected face intersections only; remaining and unselected-boundary sharp edges are reported, not certified smooth.'};
    const output=result;result=null;return output;
  }catch(error){
    if(error?.code==='NO_CHANGE')throw error;
    if(error?.report?.maxFeasibleRadiusMm!==undefined)throw error;
    const oc=cad.getOC(),edges=shape.edges;
    let search=null;
    try{
      search=searchMaxFeasibleRadius(shape,targets,edges,radius,allEdges?'body':(faceIds?.length===1?'face-boundaries':'edges'),oc);
      const maxR=search.maxFeasibleRadiusMm;
      if(maxR!==null&&radiusFallback==='maxFeasible'&&search.shape){
        const applied=search.shape;search.shape=null;
        applied.transitionReport={mode:allEdges?'body':selector?'semantic-selector':faceIds?.length===1?'face-boundary':'faces',radius:maxR,requestedRadiusMm:radius,radiusReduced:true,maxFeasibleRadiusMm:maxR,status:'committed',strategy:'native-max-feasible-radius',
          processedEdgeIds:targets.map(e=>e.edgeId),failedEdgeIds:[],remainingSharpEdgeIds:applied.blendReport?.remainingSharpEdgeIds||[],remainingSharpEdgeCount:applied.blendReport?.remainingSharpEdgeCount??null,
          radiusPerEdge:targets.map(e=>({edgeId:e.edgeId,radiusMm:maxR})),skippedOneSidedEdgeIds:skippedOneSided};
        applied.blendReport=applied.blendReport||null;
        return applied;
      }
      const reason=String(error.message||error).includes('WebAssembly')?'局部空间不足或过渡面无法构造':error.message||'内核运算失败';
      const suggestion=maxR!==null?`可用最大约 R${maxR} mm（已实际试算并通过验收，未应用；可改用该半径，或设置 radiusFallback:'maxFeasible'）。`:'已按 0.01 mm 网格试算，未找到可通过验收的更小半径。';
      fail(`平滑过渡 R${radius} mm 未完成；目标边 ${targets.map(e=>e.edgeId).join(', ')}：${reason}。${suggestion}请调整半径或面组，原模型保留。`,{report:{version:1,operation:allEdges?'autoRound':'smoothTransition',status:'failed',requestedAmountMm:radius,maxFeasibleRadiusMm:maxR,failedEdgeIds:targets.map(e=>e.edgeId),processedEdgeIds:[],skippedOneSidedEdgeIds:skippedOneSided,radiusSearch:search?{attempts:search.attempts,method:search.method,elapsedMs:search.elapsedMs}:null,failureReason:reason}});
    }finally{dispose(search?.shape);edges.forEach(dispose);}
  }
  finally{dispose(result);dispose(finder);inputEdges.forEach(dispose);inputFaces.forEach(dispose);}
}
