// Product input sampling only; evaluator measurements live in the native oracle.
export const spatialSweepCaseIds=['S04'];
export const spatialSweepToolIds={S04:['curveSweep']};
export function s04Recipe(){
 const points=Array.from({length:30},(_,i)=>{
  const t=i/29;
  return [45*t-120*t*t+80*t*t*t,30*t*t-30*t*t*t,30*t+15*t*t-5*t*t*t];
 });
 return [{id:'spatialSweep',method:'add',args:{op:'curveSweep',params:{pathType:'spline',points,radius:2,section:'round',tolerance:.001},refs:[],placement:{version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}}}}];
}
export async function observeSpatialSweep({session,context,record}){
 const state=await session.client.getState(),current=await context(session);
 const solids=state.bodies.filter(body=>body.solidCount===1);
 if(solids.length!==1||state.bodies.some(body=>body.solidCount>1))throw Error('SPATIAL_SWEEP_SINGLE_SOLID_REQUIRED');
 const bodyId=solids[0].id,measured=await session.client.call('measure',{context:current,bodyId});
 if(measured.status!=='read')throw Error('SPATIAL_SWEEP_READBACK_FAILED');
 await record?.({event:'spatial-sweep-page-readback',context:current,bodyId,measured});
 return {geometry:{reader:{independent:false,source:'public-page-spatial-sweep-readback'},brepValid:null,units:'mm',targetType:'solid',solidCount:measured.solidCount,volume:measured.volume,checks:{}},exportBodyIds:[bodyId],revision:current.expectedRevision,raw:{measured}};
}
