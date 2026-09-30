// UI-only adapter: explicit parameters always win. Core/API never reads selection.
export function adaptUISelection(op, input, refs, topology) {
  const params=structuredClone(input);
  if(op==='rounding'&&(params.specVersion===2||Object.hasOwn(params,'sizeMm'))){
    if(params.scope)return params;
    if(topology?.bodyId!==refs[0]||topology.type!=='edge'||!topology.ids?.length)throw new Error('请先选择需要圆润的实体边。');
    return {specVersion:2,sizeMm:params.sizeMm,scope:{kind:'edges',edgeIds:[...topology.ids]}};
  }
  if(op==='rounding'&&!params.scope){
    const tangent=params.propagateTangent===true;delete params.propagateTangent;
    const allEdges=params.allEdges===true,excludeEdgeIds=params.excludeEdgeIds;delete params.allEdges;delete params.excludeEdgeIds;
    if(params.mode==='width'){delete params.radiusMm;delete params.radiusStartMm;delete params.radiusEndMm;delete params.chainDirection;}
    else if(params.mode==='variable'){delete params.radiusMm;delete params.widthAMm;delete params.widthBMm;}
    else{delete params.widthAMm;delete params.widthBMm;delete params.radiusStartMm;delete params.radiusEndMm;delete params.chainDirection;}
    let scope;
    if(allEdges)scope=excludeEdgeIds?.length?{kind:'body',excludeEdgeIds}:{kind:'body'};
    else if(topology?.bodyId===refs[0]&&topology.type==='edge'&&topology.ids.length)scope={kind:'edges',edgeIds:[...topology.ids]};
    else if(topology?.bodyId===refs[0]&&topology.type==='face'&&topology.ids.length===1)scope={kind:'face-boundaries',faceIds:[...topology.ids]};
    else if(topology?.bodyId===refs[0]&&topology.type==='face'&&topology.ids.length===2)scope={kind:'shared-faces',faceAIds:[topology.ids[0]],faceBIds:[topology.ids[1]]};
    if(scope){
      if(!allEdges&&excludeEdgeIds?.length)scope={...scope,excludeEdgeIds};
      if(params.mode==='variable'){
        const radiusStartMm=params.radiusStartMm,radiusEndMm=params.radiusEndMm,direction=params.chainDirection,intermediate=params.intermediateStations||[];
        delete params.radiusStartMm;delete params.radiusEndMm;delete params.chainDirection;delete params.intermediateStations;
        if(scope.kind==='edges'&&scope.edgeIds.length>=1&&scope.edgeIds.length<=16){const ids=scope.edgeIds;params.laws=[{chainId:ids.length===1?`edge:${ids[0]}`:`edges:${ids.join(',')}`,direction,interpolation:'linear',stations:[{s:0,radiusMm:radiusStartMm},...intermediate,{s:1,radiusMm:radiusEndMm}]}];}
      }
      return {specVersion:1,mode:'constant',propagation:tangent&&params.mode==='constant'?'tangent-chain':'selected-only',boundaryRequirement:'standard',endpoints:{defaultMode:'natural'},...params,scope};
    }
    return params;
  }
  if(!topology || topology.bodyId!==refs[0])return params;
  if(op==='smoothTransition'&&params.faceIds===undefined&&topology.type==='face')params.faceIds=[...topology.ids];
  if(op==='extractFaces'&&(!Array.isArray(params.faceIds)||!params.faceIds.length)&&topology.type==='face')params.faceIds=[...topology.ids];
  if(['fillet','chamfer'].includes(op)&&params.edgeIds===undefined&&params.faceIds===undefined&&params.allEdges!==true){
    if(topology.type==='edge')params.edgeIds=[...topology.ids];
    if(topology.type==='face'){params.faceIds=[...topology.ids];if(topology.ids.length>=2&&params.sharedFaces===undefined)params.sharedFaces=true;}
  }
  if(op==='shell'&&params.faceIds===undefined&&topology.type==='face')params.faceIds=[...topology.ids];
  if(['faceHole','faceExtrude','logo','curvedLogo','thickenFace','faceBoundary','offsetSurface','thread','faceGroove','innerTurn','outerTurn'].includes(op)&&params.faceId===undefined&&topology.type==='face'&&topology.ids.length===1){
    params.faceId=topology.ids[0];
    if(['faceHole','curvedLogo'].includes(op)||op==='logo'&&params.placementVersion===2){if(params.point===undefined&&topology.point)params.point=[...topology.point];}
  }
  return params;
}
