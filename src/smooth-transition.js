import * as cad from 'replicad';
import {topologyDetails,sharpAngleDeg} from './modeling/rounding/topology.js';
export {topologyDetails,sharpAngleDeg} from './modeling/rounding/topology.js';
const dispose = value => { try { value?.delete(); } catch {} };
const fail = message => { throw Object.assign(new Error(message), {code:'GEOMETRY_INVALID'}); };
export function buildSmoothTransition(shape,{faceIds,radius,allEdges=false}={}) {
  const faces=shape.faces,solids=shape.solids;
  try {
    if(allEdges)faceIds=faces.map((_,i)=>i);
    if(solids.length!==1)fail('平滑过渡需要一个封闭实心体');
    if(!Array.isArray(faceIds)||faceIds.length<2||new Set(faceIds).size!==faceIds.length||faceIds.some(i=>!Number.isInteger(i)||i<0||i>=faces.length))fail('请选择至少两个不同的相邻面');
    if(typeof radius!=='number'||!Number.isFinite(radius)||radius<=0)fail('过渡半径必须为正数，单位 mm');
  }finally{faces.forEach(dispose);solids.forEach(dispose);}
  const selected=new Set(faceIds),before=topologyDetails(shape);
  if(allEdges&&before.some(e=>e.sharp===null))fail(`整件圆边无法判定边 ${before.filter(e=>e.sharp===null).map(e=>e.edgeId).join(', ')} 的相邻面法向，请检查开口或无效曲面，未修改模型`);
  const shared=before.filter(e=>e.adjacentFaceIds.length===2&&e.adjacentFaceIds.every(i=>selected.has(i)));
  if(!shared.length)fail('所选面没有公共接缝，请选择互相连接的面');
  if(shared.some(e=>e.sharp===null))fail('接缝法向无法可靠测量，未修改模型');
  const targets=shared.filter(e=>e.sharp);
  if(!targets.length)fail('所选面之间已相切，没有需要处理的尖锐接缝');
  const inputEdges=shape.edges,inputFaces=shape.faces;
  let result,finder;
  try {
    finder=new cad.EdgeFinder().inList(targets.map(e=>inputEdges[e.edgeId]));
    // Solve all shared sharp seams together so their end patches meet in one OCCT build.
    result=shape.fillet({radius,filter:finder});
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
        if(!atBoundary)fail('交汇处仍有新利角；请调整面组或半径');
        boundarySharpEdges.push(edge.edgeId);
      }
    }
    result.transitionReport={mode:allEdges?'body':'faces',radius,sourceFaceIds:[...faceIds],processedEdgeIds:targets.map(e=>e.edgeId),
      processedSeams:targets.length,remainingSharpEdges:sharpAfter.map(e=>e.edgeId),
      remainingSharpEdgeCount:sharpAfter.length,boundarySharpEdges,normalSampleFractions:[.2,.5,.8],angleToleranceDeg:sharpAngleDeg,
      validation:boundarySharpEdges.length?'valid-solid; selected-sharp-seams-removed; unselected-boundary-creases-reported':'valid-solid; selected-sharp-seams-removed; no-new-sharp-seams-at-samples',
      scope:allEdges?'All sharp edges required; sampled continuity, not a vertex safety certification.':'Selected face intersections only; remaining and unselected-boundary sharp edges are reported, not certified smooth.'};
    const output=result;result=null;return output;
  }catch(error){fail(`平滑过渡 R${radius} mm 未完成；目标边 ${targets.map(e=>e.edgeId).join(', ')}：${String(error.message||error).includes('WebAssembly')?'局部空间不足或过渡面无法构造':error.message||'内核运算失败'}。请调整半径或面组，原模型保留。`);}
  finally{dispose(result);dispose(finder);inputEdges.forEach(dispose);inputFaces.forEach(dispose);}
}
