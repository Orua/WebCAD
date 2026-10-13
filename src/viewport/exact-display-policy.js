// Display tolerances only. Neither source BRep nor export tolerances use this policy.
export const EXACT_DISPLAY = Object.freeze({faceThreshold:200,initialTolerance:.12,initialAngle:.65,
  settledErrorPx:1,movingErrorPx:4,minTolerance:.0075,maxFacesPerRequest:2,maxRefinedTriangles:1500000});
export function requestedFaceTolerance(mmPerPixel,moving=false,quality='standard'){
  const target=mmPerPixel*(moving?EXACT_DISPLAY.movingErrorPx:({draft:2,standard:1,fine:.5,ultra:.25}[quality]??1));
  const levels=[.12,.06,.03,.015,.0075];
  return levels.find(v=>v<=target)??EXACT_DISPLAY.minTolerance;
}
