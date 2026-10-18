// XY placement for agent-created independent bodies. The decision uses the
// committed display bounds; it never feeds back into feature geometry.
const EPS=1e-6;

function validBounds(bounds){
  return bounds&&Array.isArray(bounds.min)&&bounds.min.length===3&&Array.isArray(bounds.max)&&bounds.max.length===3
    &&[...bounds.min,...bounds.max].every(Number.isFinite)&&bounds.min.every((value,index)=>value<=bounds.max[index]);
}

export function unionBounds(bounds){
  const rows=(bounds||[]).filter(validBounds);
  if(!rows.length)return null;
  return rows.reduce((out,row)=>({
    min:out.min.map((value,index)=>Math.min(value,row.min[index])),
    max:out.max.map((value,index)=>Math.max(value,row.max[index]))
  }),{min:[...rows[0].min],max:[...rows[0].max]});
}

export function findFreePlacement(existingBounds,newSize,{gapMm=5,axis='x'}={}){
  if(!Array.isArray(newSize)||newSize.length!==2||newSize.some(value=>!Number.isFinite(value)||value<0))throw new Error('Invalid new model size');
  if(!Number.isFinite(gapMm)||gapMm<0)throw new Error('Invalid placement gap');
  if(!['x','y'].includes(axis))throw new Error('Invalid placement axis');
  const u=unionBounds(existingBounds);
  if(!u)return [0,0,0];
  const center=[(u.min[0]+u.max[0])/2,(u.min[1]+u.max[1])/2];
  if(axis==='y')return [center[0],u.max[1]+gapMm+newSize[1]/2,0];
  return [u.max[0]+gapMm+newSize[0]/2,center[1],0];
}

export function boundsClearInXY(existingBounds,newBounds,{gapMm=5}={}){
  const u=unionBounds(existingBounds);
  if(!u||!validBounds(newBounds))return true;
  return newBounds.min[0]>=u.max[0]+gapMm-EPS
    ||u.min[0]>=newBounds.max[0]+gapMm-EPS
    ||newBounds.min[1]>=u.max[1]+gapMm-EPS
    ||u.min[1]>=newBounds.max[1]+gapMm-EPS;
}

export function xShiftToClear(existingBounds,newBounds,{gapMm=5}={}){
  const u=unionBounds(existingBounds);
  if(!u||!validBounds(newBounds)||boundsClearInXY([u],newBounds,{gapMm}))return 0;
  return Math.max(0,u.max[0]+gapMm-newBounds.min[0]);
}

// Finish placement on the uncommitted candidate. The caller commits and records
// history only after this geometry succeeds; the live document is never patched.
export async function placePendingFeature({document,result,existingBodies,featureId,rebuild}){
  const feature=document.features.find(row=>row.id===featureId),frame=feature?.placement?.frameSnapshot;
  if(!frame?.origin||frame.origin.length!==3)return {document,result};
  const existingIds=new Set(existingBodies.map(body=>body.id));
  const created=unionBounds(result.bodies.filter(body=>!existingIds.has(body.id)).map(body=>body.bounds));
  const dx=created?xShiftToClear(existingBodies.map(body=>body.bounds),created,{gapMm:5}):0;
  if(dx<=EPS)return {document,result};
  const placed=structuredClone(document),target=placed.features.find(row=>row.id===featureId);
  target.placement={...target.placement,frameSnapshot:{...frame,origin:frame.origin.map((value,index)=>index===0?value+dx:value)}};
  return {document:placed,result:await rebuild(placed),warning:{code:'AUTO_PLACED',message:`已放在已有模型右侧 5 mm 处（X=${(frame.origin[0]+dx).toFixed(3)} mm）`}};
}
