export const bentSectionCaseIds=['S05'];
export const bentSectionToolIds={S05:['curveSweep']};
// These are product inputs derived from the public specimen; no oracle measurements.
export function s05Recipe(){
 const stations=Array.from({length:17},(_,i)=>{
  const t=i/16,angle=Math.PI*t/2,w=4+2*t,h=3+t;
  return {centerMm:[20*Math.cos(angle),20*Math.sin(angle),0],normal:[-Math.sin(angle),Math.cos(angle),0],widthDirection:[Math.cos(angle),Math.sin(angle),0],widthMm:w,depthMm:h,
   profile:{kind:'spline',coordinateMode:'millimeters',interpolation:'polyline',points2d:[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]],closed:true}};
 });
 return [{id:'bentSections',method:'add',args:{op:'curveSweep',params:{pathType:'sections',stations,loftDegree:3,autoAlign:false,volumeCheck:'warn',closed:false},refs:[],placement:{version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}}}}];
}
export async function observeBentSection({session,context,record}){
 const state=await session.client.getState(),current=await context(session),solids=state.bodies.filter(body=>body.solidCount===1);
 if(solids.length!==1||state.bodies.some(body=>body.solidCount>1))throw Error('BENT_SECTION_SINGLE_SOLID_REQUIRED');
 const bodyId=solids[0].id,measured=await session.client.call('measure',{context:current,bodyId});
 if(measured.status!=='read')throw Error('BENT_SECTION_READBACK_FAILED');
 await record?.({event:'bent-section-page-readback',context:current,bodyId,measured});
 return {geometry:{reader:{independent:false,source:'public-page-bent-section-readback'},brepValid:null,units:'mm',targetType:'solid',solidCount:measured.solidCount,volume:measured.volume,checks:{}},exportBodyIds:[bodyId],revision:current.expectedRevision,raw:{measured}};
}
