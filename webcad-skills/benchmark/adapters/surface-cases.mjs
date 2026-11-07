// S06 product recipe/observation only. Independent distance evidence stays in OCP.
export const surfaceCaseIds=['S06'];
export const surfaceToolIds={S06:['fittedSurface']};
export function s06Recipe(){
 const points=Array.from({length:12},(_,row)=>{
  const t=row/11,sine=Math.sin(Math.PI*t);
  return Array.from({length:12},(_,column)=>{const w=2*column/11-1;return [w*(10+2*sine),40*t,5*sine+2*w*w];});
 });
 return [{id:'s06',method:'add',args:{op:'fittedSurface',params:{points,tolerance:.01},refs:[],placement:{version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}}}}];
}
export async function observeSurfaceCase({caseId,session,context,record}){
 if(caseId!=='S06')throw Error('SURFACE_CASE_UNKNOWN');
 const current=await context(session),state=await session.client.getState();
 if(state.bodies.length!==1)throw Error('BASIC_SINGLE_BODY_REQUIRED');
 const bodyId=state.bodies[0].id;
 const measured=await session.client.call('measure',{context:current,bodyId});
 const faces=await session.client.call('queryGeometry',{context:current,bodyId,kind:'face',filter:{},requireUnique:false,limit:20});
 if(measured.status!=='read'||faces.status!=='read')throw Error('SURFACE_CASE_READBACK_FAILED');
 // No material classification: inspectDesign material points require one solid.
 // Null volume and zero solidCount are valid for this open-surface target.
 const targetType=measured.solidCount>0?'solid':faces.items?.length?'surface':'wire';
 await record({event:'surface-case-page-readback',caseId,context:current,measured,faces});
 return {geometry:{reader:{independent:false,source:'public-page-open-surface-readback'},brepValid:null,units:'mm',targetType,solidCount:measured.solidCount,volume:measured.volume??null,area:measured.area??null,checks:{}},revision:current.expectedRevision,raw:{measured,faces}};
}
