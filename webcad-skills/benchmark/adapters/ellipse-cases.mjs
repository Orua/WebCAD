// S02 deterministic public-tool path; no reference answers enter model observations.
export const ellipseCaseIds=['S02'];
export const ellipseToolIds={S02:['curveSweep']};
export function s02Recipe(){
 const stations=Array.from({length:17},(_,i)=>{
  const t=i/16;return {centerMm:[0,0,40*t],normal:[0,0,1],widthDirection:[1,0,0],widthMm:2*(10-4*t),depthMm:2*(4+2*t),profile:{kind:'ellipse'}};
 });
 return [{id:'s02',method:'add',args:{op:'curveSweep',params:{pathType:'sections',stations,loftDegree:3,autoAlign:false,volumeCheck:'warn',closed:false},refs:[],placement:{version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}}}}];
}
export async function observeEllipseCase({caseId,session,context,record}){
 if(caseId!=='S02')throw Error('ELLIPSE_CASE_UNKNOWN');
 const current=await context(session),state=await session.client.getState();
 if(state.bodies.length!==1)throw Error('BASIC_SINGLE_BODY_REQUIRED');
 const bodyId=state.bodies[0].id,measured=await session.client.call('measure',{context:current,bodyId});
 if(measured.status!=='read')throw Error('ELLIPSE_CASE_READBACK_FAILED');
 let material=null;
 if(measured.solidCount===1){
  const inside=[],outside=[];
  for(const t of [.25,.5,.75]){inside.push([0,0,40*t]);outside.push([10-4*t+.2,0,40*t],[0,4+2*t+.2,40*t]);}
  const evidence={kind:'drawing',reference:'Synthetic S02 specification 1.0.0'};
  material=await session.client.call('inspectDesign',{context:current,requirements:[{id:'centers',bodyId,kind:'material',points:inside,expected:'inside',evidence},{id:'outside',bodyId,kind:'material',points:outside,expected:'outside',evidence}]});
  if(material.status!=='read')throw Error('ELLIPSE_CASE_READBACK_FAILED');
 }
 await record({event:'ellipse-case-page-readback',caseId,context:current,measured,material});
 // Expected a/b values above define sample locations only, never measured sections.
 return {geometry:{reader:{independent:false,source:'public-page-ellipse-volume-and-material-readback'},brepValid:null,units:'mm',targetType:measured.solidCount>0?'solid':'surface',solidCount:measured.solidCount,volume:measured.volume,checks:{}},revision:current.expectedRevision,raw:{measured,material}};
}
