// Local gesture state. The next completed drag after snapping is a free fine adjustment.
export async function snapReleasedDrag(viewport,{bodyId,pointWorld,translation,axis='XYZ',skip=false}){
  if(skip||!viewport.snapEnabled||!viewport.callbacks.onDragSnap||!(viewport.displayPreferences.snapThresholdMm>0))return null;
  const targetIds=[...viewport.objects].filter(([id,entry])=>id!==bodyId&&entry.root.visible).map(([id])=>id);
  if(!targetIds.length)return null;
  return viewport.callbacks.onDragSnap({bodyId,pointWorld,translation,axis:axis||'XYZ',targetIds,thresholdMm:viewport.displayPreferences.snapThresholdMm});
}
