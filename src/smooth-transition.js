import * as cad from 'replicad';

const dispose = value => { try { value?.delete(); } catch {} };
const fail = message => { throw Object.assign(new Error(message), {code:'GEOMETRY_INVALID'}); };
const tuple = value => { try { return value.toTuple(); } finally { dispose(value); } };
export const sharpAngleDeg = 1;

// Exact BRep adjacency with sampled surface normals; rendering normals are never used.
export function topologyDetails(shape, { connectivityOnly = false } = {}) {
  const faces=shape.faces, edges=shape.edges, boundaries=faces.map(face=>face.edges);
  try {
    // Hash buckets avoid comparing every source edge with every face edge.
    // isSame is still authoritative: hash collisions never imply adjacency.
    const buckets = new Map();
    edges.forEach((edge,id)=>{const key=edge.hashCode; if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(id);});
    const adjacency=edges.map(()=>new Set());
    boundaries.forEach((list,faceId)=>list.forEach(boundary=>{
      for(const id of buckets.get(boundary.hashCode)||[]) if(boundary.isSame(edges[id]))adjacency[id].add(faceId);
    }));
    return edges.map((edge,id)=>{
      const adjacentFaceIds=[...adjacency[id]];
      if(connectivityOnly)return {edgeId:id,adjacentFaceIds};
      const box=edge.boundingBox;
      const bounds=box.bounds;dispose(box);
      const degenerate=cad.getOC().BRep_Tool.Degenerated(edge.wrapped);
      const periodicSeam=adjacentFaceIds.length===1&&['CYLINDRE','CONE','SPHERE','TORUS'].includes(faces[adjacentFaceIds[0]].geomType)&&cad.getOC().BRep_Tool.IsClosed(edge.wrapped,faces[adjacentFaceIds[0]].wrapped);
      let normalAngleDeg=null;
      if(periodicSeam)normalAngleDeg=0;
      if(adjacentFaceIds.length===2){
        try {
          normalAngleDeg=Math.max(...[.2,.5,.8].map(t=>{
            const point=tuple(edge.pointAt(t));
            const normals=adjacentFaceIds.map(i=>tuple(faces[i].normalAt(point)));
            const lengths=normals.map(n=>Math.hypot(...n));
            if(lengths.some(n=>n<1e-12))throw new Error('undefined normal');
            const dot=normals[0].reduce((sum,n,i)=>sum+n*normals[1][i],0)/(lengths[0]*lengths[1]);
            return Math.acos(Math.min(1,Math.max(-1,dot)))*180/Math.PI;
          }));
        } catch { normalAngleDeg=null; }
      }
      return {edgeId:id, startPoint:tuple(edge.startPoint),endPoint:tuple(edge.endPoint),midpoint:tuple(edge.pointAt(.5)),bounds,
        adjacentFaceIds,degenerate,periodicSeam,normalAngleDeg,sharp:degenerate?false:normalAngleDeg===null?null:normalAngleDeg>sharpAngleDeg};
    });
  } finally {boundaries.flat().forEach(dispose);faces.forEach(dispose);edges.forEach(dispose);}
}

export function buildSmoothTransition(shape,{faceIds,radius,allEdges=false}={}) {
  const faces=shape.faces,solids=shape.solids;
  try {
    if(allEdges)faceIds=faces.map((_,i)=>i);
    if(solids.length!==1)fail('平滑过渡需要一个封闭实心体');
    if(!Array.isArray(faceIds)||faceIds.length<2||new Set(faceIds).size!==faceIds.length||faceIds.some(i=>!Number.isInteger(i)||i<0||i>=faces.length))fail('请选择至少两个不同的相邻面');
    if(typeof radius!=='number'||!Number.isFinite(radius)||radius<=0)fail('过渡半径必须为正数，单位 mm');
  }finally{faces.forEach(dispose);solids.forEach(dispose);}
  const selected=new Set(faceIds),before=topologyDetails(shape);
  if(allEdges&&before.some(e=>e.sharp===null))fail('整件圆边发现无法判定的边，未修改模型');
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
  }catch(error){fail(`平滑过渡 R${radius} mm 未完成：${String(error.message||error).includes('WebAssembly')?'局部空间不足或过渡面无法构造':error.message||'内核运算失败'}。请调整半径或面组，原模型保留。`);}
  finally{dispose(result);dispose(finder);inputEdges.forEach(dispose);inputFaces.forEach(dispose);}
}
