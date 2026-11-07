export const closedWireCaseIds=['M02'];
export const closedWireToolIds={M02:['sketchProfile','profileSweep']};
export function m02Recipe(){
 const placement={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
 const profile=(id,entity,output)=>({id,method:'add',args:{op:'sketchProfile',params:{profileVersion:1,entities:[entity],
  loops:[{id:'loop',edges:[{entityId:entity.id,reversed:false}]}],...(output==='face'?{regions:[{id:'region',outerLoopId:'loop',holeLoopIds:[]}]}:{}),output},refs:[],placement}});
 return [profile('path',{id:'rounded',type:'roundedRectangle',originMm:[-20,-12],widthMm:40,heightMm:24,cornerRadiusMm:6},'wire'),
  profile('section',{id:'circle',type:'circle',centerMm:[0,0],diameterMm:4},'face'),
  {id:'swept',method:'add',args:{op:'profileSweep',params:{operation:'newBody',transitionMode:'transformed',frenet:false,alignProfileToPath:true},refs:[{$ref:'section.createdBodyIds.0'},{$ref:'path.createdBodyIds.0'}]}}];
}
export async function observeClosedWireCase({caseId,session,context,record}){
 if(caseId!=='M02')throw Error('CLOSED_WIRE_CASE_UNKNOWN');
 const current=await context(session),state=await session.client.getState();
 // The public sweep deliberately retains its exact section/path source bodies.
 // Export the sole resulting solid, while retaining all sources in the project.
 const solids=state.bodies.filter(body=>body.solidCount===1);
 if(solids.length!==1||state.bodies.some(body=>body.solidCount>1))throw Error('M02_SINGLE_SOLID_RESULT_REQUIRED');
 const bodyId=solids[0].id,measured=await session.client.call('measure',{context:current,bodyId});
 if(measured.status!=='read')throw Error('CLOSED_WIRE_READBACK_FAILED');
 await record({event:'m02-page-readback',context:current,bodyId,sourceBodyIds:state.bodies.filter(body=>body.id!==bodyId).map(body=>body.id),measured});
 return {geometry:{reader:{independent:false,source:'public-page-closed-wire-volume-only'},brepValid:null,units:'mm',targetType:measured.solidCount>0?'solid':'surface',solidCount:measured.solidCount,volume:measured.volume,checks:{}},
  exportBodyIds:[bodyId],revision:current.expectedRevision,raw:{measured}};
}
