import {contractHash} from '../contracts/operation-schema.js';
const array=value=>Array.isArray(value)?value:[];
const gridPoints=grid=>array(grid).reduce((sum,row)=>sum+array(row).length,0);
export function patternComplexity(feature={}){
 const params=feature.params??{},layers=array(params.layers),parts=layers.length?layers:[params];
 const result={regions:0,holes:0,layers:layers.length,vertices:0,strokes:0,gridPoints:0};
 for(const part of parts){
  for(const region of array(part.regions)){
   const holes=array(region.holes);result.regions++;result.holes+=holes.length;
   result.vertices+=array(region.outer).length+holes.reduce((sum,hole)=>sum+array(hole).length,0);
  }
  const strokes=array(part.strokes);result.strokes+=strokes.length;
  result.vertices+=strokes.reduce((sum,stroke)=>sum+array(stroke.points).length,0);
  // values and sculpt describe the same lattice; mask does not add geometry.
  result.gridPoints+=Math.max(gridPoints(part.values),gridPoints(part.sculpt?.deltaMm));
  for(const patch of array(part.localPatches))result.gridPoints+=gridPoints(patch.deltaMm);
 }
 return result;
}
export function remotePlacementSupported(feature={}){
 const placement=feature.placement;if(!placement)return true;
 const frame=placement.frameSnapshot,origin=frame?.origin,quaternion=frame?.quaternion;
 return Boolean(placement.sourceAnchor?.kind==='model-origin'&&Array.isArray(origin)&&origin.length===3&&origin.every(value=>value===0)&&
  Array.isArray(quaternion)&&quaternion.length===4&&quaternion.every(Number.isFinite)&&quaternion.slice(0,3).every(value=>value===0)&&Math.abs(quaternion[3])===1);
}
export function physicalExecutionKey(feature,sourceSha256,kernelBuildId,endpoint){
 return contractHash({operation:feature.op,params:feature.params,placement:feature.placement??null,sourceSha256,kernelBuildId,endpoint});
}
