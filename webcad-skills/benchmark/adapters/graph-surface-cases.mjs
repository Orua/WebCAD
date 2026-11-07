export const graphSurfaceCaseIds=['S07','S08'];
export const graphSurfaceToolIds={S07:['fittedSurface','cylinder','transform','surfaceTrim'],S08:['fittedSurface']};
const placement={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
export function graphSurfaceRecipe(caseId){
 const points=Array.from({length:12},(_,i)=>Array.from({length:12},(_,j)=>{
  const u=j/11,v=i/11;
  if(caseId==='S07'){const x=20*u-10,y=20*v-10;return [x,y,(x*x-y*y)/100];}
  if(caseId==='S08')return [20*u,20*v,3*v*Math.sin(Math.PI*u)+2*Math.sin(Math.PI*v)];
  throw Error('GRAPH_SURFACE_CASE_UNKNOWN');
 }));
 const steps=[{id:'graph',method:'add',args:{op:'fittedSurface',params:{points,tolerance:caseId==='S08'?.01:.001,...(caseId==='S08'?{interpolation:'uniformCubic'}:{})},refs:[],placement}}];
 if(caseId==='S07')steps.push({id:'cutter',method:'add',args:{op:'cylinder',params:{radius:3,height:10},refs:[],placement}},
  {id:'centeredCutter',method:'add',args:{op:'transform',params:{x:0,y:0,z:-5},refs:[{$ref:'cutter.createdBodyIds.0'}]}});
 return steps;
}
export async function runGraphSurface({caseId,session,context,record,runSteps,signal,maxToolCalls}){
 if(maxToolCalls<2)throw Error('TOOL_BUDGET_EXHAUSTED');
 const first=await runSteps(graphSurfaceRecipe(caseId),{key:`graph-source-${crypto.randomUUID()}`,signal});
 if(first.status!=='completed'||caseId==='S08')return first;
 const created=id=>first.results.find(result=>result.id===id)?.result?.createdBodyIds?.[0];
 const source=created('graph'),cutter=created('centeredCutter');if(!source||!cutter)throw Error('GRAPH_SOURCE_RECEIPT_INCOMPLETE');
 const current=await context(session),faces=await session.client.call('queryGeometry',{context:current,bodyId:source,kind:'face',filter:{},requireUnique:true,limit:2});
 if(faces.status!=='read'||faces.items?.length!==1)throw Error('GRAPH_SOURCE_FACE_AMBIGUOUS');
 const faceId=faces.items[0].faceId;await record({event:'graph-surface-source-selection',context:current,bodyId:source,faceId});
 return runSteps([{id:'trimmed',method:'add',args:{op:'surfaceTrim',params:{faceId,mode:'cut'},refs:[source,cutter]}}],{key:`graph-trim-${crypto.randomUUID()}`,signal});
}
export async function observeGraphSurface({caseId,session,context,record}){
 const current=await context(session),state=await session.client.getState(),used=new Set(state.features.flatMap(feature=>feature.refs??[]));
 const leaves=state.bodies.filter(body=>!used.has(body.id));
 if(leaves.length!==1)throw Error('GRAPH_SURFACE_RESULT_AMBIGUOUS');
 const bodyId=leaves[0].id,measured=await session.client.call('measure',{context:current,bodyId}),faces=await session.client.call('queryGeometry',{context:current,bodyId,kind:'face',filter:{},requireUnique:false,limit:50});
 if(measured.status!=='read'||faces.status!=='read')throw Error('GRAPH_SURFACE_READBACK_FAILED');
 await record({event:'graph-surface-page-readback',caseId,context:current,bodyId,measured,faces});
 return {geometry:{reader:{independent:false,source:'public-page-graph-surface-readback'},brepValid:null,units:'mm',targetType:measured.solidCount>0?'solid':faces.items?.length?'surface':'wire',solidCount:measured.solidCount,volume:null,area:measured.area,checks:{}},exportBodyIds:[bodyId],revision:current.expectedRevision,raw:{measured,faces}};
}
