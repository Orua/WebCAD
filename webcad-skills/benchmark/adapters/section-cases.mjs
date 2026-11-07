// Frozen S03 mathematics, expressed through currently registered explicit stations.
// This is an L1 recipe, not evidence of supported geometry or a reference model.
export const sectionCaseIds=['S03'];
export const sectionToolIds={S03:['curveSweep']};
export function s03Recipe(){
 const stations=Array.from({length:33},(_,i)=>{
  const t=i/32,radius=5-2*t;
  return {centerMm:[6*Math.sin(Math.PI*t),0,40*t],normal:[0,0,1],widthDirection:[1,0,0],widthMm:2*radius,depthMm:2*radius,profile:{kind:'ellipse'}};
 });
 return [{id:'s03',method:'add',args:{op:'curveSweep',params:{pathType:'sections',stations,loftDegree:3,autoAlign:false,volumeCheck:'warn',closed:false},refs:[],placement:{version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}}}}];
}
export async function observeSectionCase({caseId,session,context,record}){
 if(caseId!=='S03')throw Error('SECTION_CASE_UNKNOWN');
 const current=await context(session),state=await session.client.getState();
 if(state.bodies.length!==1)throw Error('BASIC_SINGLE_BODY_REQUIRED');
 const bodyId=state.bodies[0].id,measured=await session.client.call('measure',{context:current,bodyId});
 if(measured.status!=='read')throw Error('SECTION_CASE_READBACK_FAILED');
 const inside=[],outside=[];
 for(const t of [.25,.5,.75]){
  const center=[6*Math.sin(Math.PI*t),0,40*t],radius=5-2*t;
  inside.push(center);outside.push([center[0]+radius+.2,0,center[2]],[center[0],radius+.2,center[2]]);
 }
 const evidence={kind:'drawing',reference:'Synthetic S03 specification 1.0.0'};
 const material=await session.client.call('inspectDesign',{context:current,requirements:[{id:'sectionCenters',bodyId,kind:'material',points:inside,expected:'inside',evidence},{id:'outsideSections',bodyId,kind:'material',points:outside,expected:'outside',evidence}]});
 if(material.status!=='read')throw Error('SECTION_CASE_READBACK_FAILED');
 await record({event:'section-case-page-readback',caseId,context:current,measured,material});
 // Never copy expected centers/radii into measured sections. Only independent
 // intersections with actual exported STEP may populate geometry.sections.
 return {geometry:{reader:{independent:false,source:'public-page-volume-and-material-readback'},brepValid:null,units:'mm',targetType:measured.solidCount>0?'solid':'surface',solidCount:measured.solidCount,volume:measured.volume,checks:{}},revision:current.expectedRevision,raw:{measured,material}};
}
