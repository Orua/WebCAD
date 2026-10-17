const GRID_CLEARANCE_MM=0.01;

// Keep the ground reference below the lowest committed body surface. The
// finite display mesh never participates in feature geometry or placement.
export function floorGridZ(bodies=[]){
  const minima=(bodies||[]).map(body=>body?.bounds?.min?.[2]).filter(Number.isFinite);
  return Math.min(0,...minima)-GRID_CLEARANCE_MM;
}
