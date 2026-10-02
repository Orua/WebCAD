const dispose=value=>{try{value?.delete?.();}catch{}};
const fail=(message,report)=>{throw Object.assign(new Error(message),{code:'NATIVE_POLISHING_NETWORK_UNAVAILABLE',report});};
const sameIds=(a,b)=>a.length===b.length&&a.every(id=>b.includes(id));
function shapesInHistory(builder,method,shape,oc) {
  let raw,list;const output=[];
  try{raw=builder[method](shape);list=new oc.NCollection_List_TopoDS_Shape(raw);while(list.Extent()){output.push(list.First());list.RemoveFirst();}return output;}
  catch(error){output.forEach(dispose);throw error;}
  finally{dispose(list);dispose(raw);}
}

/** A source-native component is declared before any construction. */
export function resolvePolishingNativeNetwork(shape,selectedEdgeIds,rows,cad) {
  const edges=shape.edges,owned=[],vertices=[],edgeVertices=new Map(),incident=new Map();
  try {
    for(const row of rows) {
      if(row.degenerate||row.periodicSeam)continue;
      const ids=[];
      for(const vertex of cad.iterTopo(edges[row.edgeId].wrapped,'vertex')) {
        owned.push(vertex);let id=vertices.findIndex(existing=>existing.IsSame(vertex));
        if(id<0){id=vertices.length;vertices.push(vertex);}
        if(!ids.includes(id))ids.push(id);
        if(!incident.has(id))incident.set(id,new Set());incident.get(id).add(row.edgeId);
      }
      edgeVertices.set(row.edgeId,ids);
    }
    const visited=new Set(),unknown=new Set(),queue=[...selectedEdgeIds];
    while(queue.length) {
      const edgeId=queue.pop();if(visited.has(edgeId))continue;
      if(rows[edgeId]?.sharp!==true)fail('打磨边网含无法确定的来源锐边',{edgeId});
      visited.add(edgeId);
      for(const vertexId of edgeVertices.get(edgeId)||[])for(const adjacent of incident.get(vertexId)||[]) {
        if(rows[adjacent].sharp===true&&!visited.has(adjacent))queue.push(adjacent);
        else if(rows[adjacent].sharp===null)unknown.add(adjacent);
      }
      if(visited.size>256)fail('关联打磨边网超过本次构造预算',{sourceEdgeCount:visited.size,maximumSourceEdges:256});
    }
    if(unknown.size)fail('关联打磨节点还有未能量测的来源边',{sourceEdgeIds:[...visited],unmeasuredSourceEdgeIds:[...unknown]});
    const sourceEdgeIds=[...visited].sort((a,b)=>a-b),sourceFaceIds=[...new Set(sourceEdgeIds.flatMap(id=>rows[id].adjacentFaceIds))].sort((a,b)=>a-b);
    const sourceNodes=[...new Set(sourceEdgeIds.flatMap(id=>edgeVertices.get(id)||[]))].map(id=>{
      const point=cad.getOC().BRep_Tool.Pnt(vertices[id]);
      try{return {id,point:[point.X(),point.Y(),point.Z()],incidentSourceEdgeIds:[...incident.get(id)].filter(edgeId=>visited.has(edgeId)),nativeIdentityVerified:true};}
      finally{dispose(point);}
    });
    return {sourceEdgeIds,sourceFaceIds,sourceNodes,declaredBeforeConstruction:true,
      planningMethod:'source-native-IsSame-connected-sharp-component-with-33-station-oriented-D1-measurement',
      expansionReason:'Close the connected sharp junctions and endpoints together.'};
  }finally{owned.forEach(dispose);edges.forEach(dispose);}
}

/** One complete registered network and one native Build. Internal radius is
 * construction data; the caller accepts actual v3 geometry and displacement. */
export function buildNativeNetworkPolishing(shape,{network,constructionScaleMm},cad) {
  const oc=cad.getOC(),edges=shape.edges,faces=shape.faces,vertices=[];let builder,result;
  try {
    builder=new oc.BRepFilletAPI_MakeFillet(shape.wrapped,oc.ChFi3d_FilletShape.ChFi3d_Rational);
    builder.SetParams(1e-6,1e-6,1e-6,1e-7,1e-7,1e-5);
    for(const id of network.sourceEdgeIds)if(!builder.Contour(edges[id].wrapped))builder.Add(constructionScaleMm,edges[id].wrapped);
    const contours=[],registered=[];
    for(let contour=1;contour<=builder.NbContours();contour++) {
      const ids=[];
      for(let at=1;at<=builder.NbEdges(contour);at++) {
        const edge=builder.Edge(contour,at);let id;
        try{id=edges.findIndex(source=>source.wrapped.IsSame(edge));}finally{dispose(edge);}
        if(id<0)fail('内核登记了未知来源边',{contour});ids.push(id);registered.push(id);
      }
      contours.push(ids);
    }
    const actual=[...new Set(registered)].sort((a,b)=>a-b);
    if(!sameIds(actual,network.sourceEdgeIds))fail('内核未完整登记关联打磨边网',{
      registeredSourceEdgeIds:actual,missingSourceEdgeIds:network.sourceEdgeIds.filter(id=>!actual.includes(id)),
      outsideSourceEdgeIds:actual.filter(id=>!network.sourceEdgeIds.includes(id)),nativeBuildCalls:0});
    const progress=new oc.Message_ProgressRange();try{builder.Build(progress);}finally{dispose(progress);}
    if(!builder.IsDone())fail('关联打磨边网构造未完成',{nativeBuildCalls:1,faultyContourCount:builder.NbFaultyContours(),faultyVertexCount:builder.NbFaultyVertices()});
    result=cad.cast(builder.Shape()).asShape3D();const resultFaces=result.faces,origins=resultFaces.map(()=>null),generatedNative=[];
    try {
      for(let sourceFaceId=0;sourceFaceId<faces.length;sourceFaceId++) {
        const changed=shapesInHistory(builder,'Modified',faces[sourceFaceId].wrapped,oc);
        try{resultFaces.forEach((face,faceId)=>{
          if(!face.wrapped.IsSame(faces[sourceFaceId].wrapped)&&!changed.some(native=>face.wrapped.IsSame(native)))return;
          if(origins[faceId]&&origins[faceId].sourceFaceId!==sourceFaceId)fail('打磨结果面存在矛盾的来源面记录',{faceId});
          origins[faceId]={kind:'source',sourceFaceId};
        });}finally{changed.forEach(dispose);}
      }
      for(const id of network.sourceEdgeIds) {
        generatedNative.push(...shapesInHistory(builder,'Generated',edges[id].wrapped,oc));
        for(const vertex of cad.iterTopo(edges[id].wrapped,'vertex')){
          if(vertices.some(existing=>existing.IsSame(vertex)))dispose(vertex);else vertices.push(vertex);
        }
      }
      vertices.forEach(vertex=>generatedNative.push(...shapesInHistory(builder,'Generated',vertex,oc)));
      resultFaces.forEach((face,faceId)=>{
        if(!origins[faceId]&&generatedNative.some(native=>face.wrapped.IsSame(native)))origins[faceId]={kind:'generated'};
      });
      const unknownFaceIds=origins.flatMap((origin,faceId)=>origin?[]:[faceId]);
      if(unknownFaceIds.length)fail('关联打磨结果面缺少原生来源记录',{unknownFaceIds,nativeBuildCalls:1});
      const generatedFaceIds=origins.flatMap((origin,faceId)=>origin.kind==='generated'?[faceId]:[]);
      const resultFaceSourceIds=origins.flatMap((origin,faceId)=>origin.kind==='source'?[{faceId,sourceFaceId:origin.sourceFaceId}]:[]);
      const output={shape:result,generatedFaceIds,resultFaceSourceIds,actualEdgeIds:actual,contours,nativeBuildCalls:1};result=null;return output;
    }finally{generatedNative.forEach(dispose);resultFaces.forEach(dispose);}
  }finally{dispose(result);dispose(builder);[...vertices,...faces,...edges].forEach(dispose);}
}
