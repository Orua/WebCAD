// S01 exact rectangular polyline stations through the public section contract.
export const twistCaseIds=['S01'];
export const twistToolIds={S01:['curveSweep']};
export function s01Recipe(){
 const stations=Array.from({length:17},(_,i)=>{
  const t=i/16,angle=Math.PI*t/3;
  return {centerMm:[0,0,40*t],normal:[0,0,1],widthDirection:[Math.cos(angle),Math.sin(angle),0],widthMm:20,depthMm:12,profile:{kind:'spline',coordinateMode:'millimeters',interpolation:'polyline',points2d:[[-10,-6],[10,-6],[10,6],[-10,6]],closed:true}};
 });
 return [{id:'twisted',method:'add',args:{op:'curveSweep',params:{pathType:'sections',stations,loftDegree:3,autoAlign:false,volumeCheck:'warn',closed:false},refs:[],
  placement:{version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}}}}];
}
export async function observeTwistCase({caseId,session,context,record}){
 if(caseId!=='S01')throw Error('TWIST_CASE_UNKNOWN');
 const current=await context(session),state=await session.client.getState();
 if(state.bodies.length!==1)throw Error('BASIC_SINGLE_BODY_REQUIRED');
 const measured=await session.client.call('measure',{context:current,bodyId:state.bodies[0].id});
 if(measured.status!=='read')throw Error('TWIST_CASE_READBACK_FAILED');
 await record({event:'s01-page-volume-readback',context:current,measured});
 return {geometry:{reader:{independent:false,source:'public-page-volume-only; no inferred section dimensions'},brepValid:null,units:'mm',targetType:measured.solidCount>0?'solid':'surface',solidCount:measured.solidCount,volume:measured.volume,checks:{}},
  revision:current.expectedRevision,raw:{measured}};
}
