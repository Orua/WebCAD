const dispose=value=>{try{value?.delete?.();}catch{}};
const fail=(message,report)=>{throw Object.assign(new Error(message),{code:'CLOSED_GRINDING_CHAIN_REJECTED',report});};

/** Resolve native degree-two rims through an actual adjacent support face.
 * Connectivity is IsSame on current vertices. Position proximity never joins
 * different vertices, and a branched source network is returned as unresolved. */
export function resolveClosedContactContours(shape,requestedEdgeIds,rows,cad) {
  const edges=shape.edges,owned=[];
  try {
    const vertices=[],edgeVertices=new Map();
    for(const row of rows.filter(row=>row.sharp===true&&!row.degenerate&&row.adjacentFaceIds.length===2)) {
      const ids=[];
      for(const vertex of cad.iterTopo(edges[row.edgeId].wrapped,'vertex')) {
        owned.push(vertex);let id=vertices.findIndex(existing=>existing.IsSame(vertex));
        if(id<0){id=vertices.length;vertices.push(vertex);}
        if(!ids.includes(id))ids.push(id);
      }
      edgeVertices.set(row.edgeId,ids);
    }
    const resolved=[],covered=new Set();
    for(const selected of requestedEdgeIds) {
      if(covered.has(selected))continue;
      const row=rows[selected];
      if(!row||row.sharp!==true)fail('选中边的实际锐利程度无法用于闭合打磨',{selectedEdgeId:selected,normalMeasurementFailures:row?.normalMeasurementFailures});
      const candidates=[];
      for(const supportFaceId of row.adjacentFaceIds) {
        const eligible=rows.filter(candidate=>edgeVertices.has(candidate.edgeId)&&candidate.adjacentFaceIds.includes(supportFaceId));
        const memberIds=new Set(eligible.map(candidate=>candidate.edgeId)),visited=new Set(),queue=[selected];
        while(queue.length) {
          const id=queue.pop();if(visited.has(id))continue;visited.add(id);
          const ends=edgeVertices.get(id)||[];
          for(const other of eligible)if(!visited.has(other.edgeId)&&edgeVertices.get(other.edgeId).some(vertexId=>ends.includes(vertexId)))queue.push(other.edgeId);
        }
        if(!visited.size||visited.size>64||[...visited].some(id=>!memberIds.has(id)))continue;
        const degree=new Map();let invalid=false;
        for(const id of visited) {
          const ids=edgeVertices.get(id);if(ids.length<1||ids.length>2){invalid=true;break;}
          for(const vertexId of ids)degree.set(vertexId,(degree.get(vertexId)||0)+(ids.length===1?2:1));
        }
        if(invalid||[...degree.values()].some(value=>value!==2))continue;
        candidates.push({sourceEdgeIds:[...visited].sort((a,b)=>a-b),supportFaceId,
          nativeVertexIds:[...degree.keys()],method:'current-native-vertex-degree-two-component-on-adjacent-source-face'});
      }
      if(!candidates.length)fail('选中边需要端部或多边交汇曲面才能完成打磨',{selectedEdgeId:selected,sourceFaceIds:row.adjacentFaceIds});
      const unique=candidates.filter((candidate,index)=>candidates.findIndex(other=>JSON.stringify(other.sourceEdgeIds)===JSON.stringify(candidate.sourceEdgeIds))===index);
      if(unique.length!==1)fail('来源边对应多个闭合打磨范围',{selectedEdgeId:selected,candidateContours:unique});
      const contour=unique[0];
      if(contour.sourceEdgeIds.some(id=>covered.has(id)))fail('闭合打磨范围存在部分重叠',{selectedEdgeId:selected,sourceEdgeIds:contour.sourceEdgeIds});
      resolved.push(contour);contour.sourceEdgeIds.forEach(id=>covered.add(id));
    }
    return {contours:resolved,sourceEdgeIds:[...covered].sort((a,b)=>a-b),declaredBeforeConstruction:true,
      limitations:['Native degree-two topology does not prove source tangent compatibility, positive finite width or a valid final solid; the constructor and shared quality gate independently verify them.']};
  }finally{owned.forEach(dispose);edges.forEach(dispose);}
}
