// M03 public recipe; expected points are probes, never measured geometry.
export const bendCaseIds=['M03'];
export const bendToolIds={M03:['torus','cut','box','transform','intersect']};
export function m03Recipe(){
 const placement={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
 const ref=id=>({$ref:id+'.createdBodyIds.0'});
 const add=(id,op,params,refs=[])=>({id,method:'add',args:{op,params,refs,...(!refs.length?{placement}:{})}});
 return [add('outer','torus',{majorRadius:20,minorRadius:3}),add('inner','torus',{majorRadius:20,minorRadius:2}),
  add('tube','cut',{},[ref('outer'),ref('inner')]),add('stock','box',{width:30,depth:30,height:10}),
  add('quadrant','transform',{x:0,y:0,z:-5},[ref('stock')]),add('result','intersect',{},[ref('tube'),ref('quadrant')])];
}
export async function observeBendCase({caseId,session,context,record}){
 if(caseId!=='M03')throw Error('BEND_CASE_UNKNOWN');
 const current=await context(session),state=await session.client.getState();
 if(state.bodies.length!==1)throw Error('BASIC_SINGLE_BODY_REQUIRED');
 const bodyId=state.bodies[0].id,measured=await session.client.call('measure',{context:current,bodyId});
 if(measured.status!=='read')throw Error('BEND_CASE_READBACK_FAILED');
 const bore=[],wall=[];
 for(const t of [.01,.173,.5,.719,.99]){
  const angle=t*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
  bore.push([20*c,20*s,0]);wall.push([22.5*c,22.5*s,0],[20*c,20*s,2.5]);
 }
 const evidence={kind:'drawing',reference:'Synthetic M03 specification 1.0.0'};
 const material=measured.solidCount===1?await session.client.call('inspectDesign',{context:current,requirements:[
  {id:'bore',bodyId,kind:'material',points:bore,expected:'outside',evidence},
  {id:'wall',bodyId,kind:'material',points:wall,expected:'inside',evidence},
 ]}):null;
 if(material&&material.status!=='read')throw Error('BEND_CASE_READBACK_FAILED');
 await record({event:'bend-case-page-readback',caseId,context:current,measured,material});
 return {geometry:{reader:{independent:false,source:'public-page-bend-volume-and-material-readback'},brepValid:null,units:'mm',targetType:measured.solidCount>0?'solid':'surface',solidCount:measured.solidCount,volume:measured.volume,checks:{}},revision:current.expectedRevision,raw:{measured,material}};
}
