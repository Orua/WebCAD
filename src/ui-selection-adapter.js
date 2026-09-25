// UI-only adapter: explicit parameters always win. Core/API never reads selection.
export function adaptUISelection(op, input, refs, topology) {
  const params=structuredClone(input);
  if(!topology || topology.bodyId!==refs[0])return params;
  if(op==='smoothTransition'&&params.faceIds===undefined&&topology.type==='face')params.faceIds=[...topology.ids];
  if(op==='extractFaces'&&(!Array.isArray(params.faceIds)||!params.faceIds.length)&&topology.type==='face')params.faceIds=[...topology.ids];
  if(['fillet','chamfer'].includes(op)&&params.edgeIds===undefined&&params.faceIds===undefined&&params.allEdges!==true){
    if(topology.type==='edge')params.edgeIds=[...topology.ids];
    if(topology.type==='face')params.faceIds=[...topology.ids];
  }
  if(op==='shell'&&params.faceIds===undefined&&topology.type==='face')params.faceIds=[...topology.ids];
  if(['faceHole','faceExtrude','logo','curvedLogo','thickenFace','faceBoundary'].includes(op)&&params.faceId===undefined&&topology.type==='face'&&topology.ids.length===1){
    params.faceId=topology.ids[0];
    if(['faceHole','curvedLogo'].includes(op)||op==='logo'&&params.placementVersion===2){if(params.point===undefined&&topology.point)params.point=[...topology.point];}
  }
  return params;
}
