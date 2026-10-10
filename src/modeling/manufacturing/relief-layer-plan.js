const uniform=layer=>!layer.sculpt&&!layer.localPatches&&!layer.strokes&&Array.isArray(layer.regions)&&(!layer.values||layer.values.every(row=>row.every(v=>v===1)));
const vertices=regions=>regions.reduce((n,r)=>n+r.outer.length+(r.holes??[]).reduce((s,h)=>s+h.length,0),0);
export function planReliefLayers(layers,mode='logical'){
 if(!['logical','groupCompatible'].includes(mode))throw Object.assign(new Error('未知浮雕层编译策略'),{code:'RELIEF_INVALID'});
 const groups=[];
 for(const [index,layer]of layers.entries()){
  const memberLayerIds=[`layer-${index}`],previous=groups.at(-1),compatible=mode==='groupCompatible'&&uniform(layer)&&previous?.uniform&&previous.layer.heightMm===layer.heightMm&&(previous.layer.startHeightMm??0)===(layer.startHeightMm??0)&&(previous.layer.mode??'emboss')===(layer.mode??'emboss')&&previous.layer.regions.length+layer.regions.length<=1024&&vertices(previous.layer.regions)+vertices(layer.regions)<=64000;
  if(compatible){previous.layer={...previous.layer,regions:[...previous.layer.regions,...layer.regions]};previous.regionGroups.push(layer.regions);previous.memberLayerIds.push(...memberLayerIds);previous.memberIndices.push(index);}
  else groups.push({layer:{...layer},uniform:uniform(layer),memberLayerIds,memberIndices:[index],regionGroups:[layer.regions]});
 }
 return {mode,logicalLayerCount:layers.length,compiledGroupCount:groups.length,groups};
}
