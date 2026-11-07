import {randomUUID} from 'node:crypto';
export const shellDetailCaseIds=['S11','S12'];
export const shellDetailToolIds={S11:['cylinder','box','transform','intersect','extractFaces','thickenFace'],S12:['sphere','box','transform','intersect','cylinder','cut','fillet']};
const placement={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
const ref=id=>({$ref:id+'.createdBodyIds.0'});
const add=(id,op,params,refs=[])=>({id,method:'add',args:{op,params,refs,...(!refs.length?{placement}:{})}});
export function detailSourceSteps(caseId){
 if(caseId==='S12')return [add('sphere','sphere',{radius:20}),add('topbox','box',{width:50,depth:50,height:20}),add('topclip','transform',{x:-25,y:-25,z:10},[ref('topbox')]),
  add('cap','intersect',{},[ref('sphere'),ref('topclip')]),add('drill','cylinder',{radius:2,height:20}),add('placedDrill','transform',{x:5,y:0,z:5},[ref('drill')]),add('drilled','cut',{},[ref('cap'),ref('placedDrill')])];
 if(caseId!=='S11')throw Error('SHELL_DETAIL_CASE_UNKNOWN');
 return [add('cylinder','cylinder',{radius:20,height:15}),...[-30,30].flatMap((angle,i)=>[
  add('box'+i,'box',{width:30,depth:60,height:15}),add('center'+i,'transform',{x:0,y:-30,z:0},[ref('box'+i)]),add('clip'+i,'transform',{rz:angle},[ref('center'+i)])]),
  add('first','intersect',{},[ref('cylinder'),ref('clip0')]),add('sector','intersect',{},[ref('first'),ref('clip1')])];
}
export async function runShellDetail({caseId,session,context,record,runSteps,signal,maxToolCalls}){
 if(maxToolCalls<3)throw Error('TOOL_BUDGET_EXHAUSTED');
 const first=await runSteps(detailSourceSteps(caseId),{key:'detail-source-'+randomUUID(),signal});if(first.status!=='completed')return first;
 let current=await context(session),state=await session.client.getState();if(state.bodies.length!==1)throw Error('DETAIL_SOURCE_SINGLE_BODY_REQUIRED');
 let bodyId=state.bodies[0].id;
 if(caseId==='S12'){
  const selection=await session.client.call('queryGeometry',{context:current,bodyId,kind:'edge',filter:{adjacentSurfaceTypes:['sphere','cylinder']},requireUnique:false,limit:20});
  if(selection.status!=='read'||!selection.items?.length)throw Error('DETAIL_SPHERICAL_HOLE_RIM_MISSING');
  await record({event:'s12-fresh-spherical-hole-rim',context:current,bodyId,selection});
  return runSteps([add('rounded','fillet',{radius:.5,edgeIds:selection.items.map(e=>e.edgeId)},[bodyId])],{key:'detail-fillet-'+randomUUID(),signal});
 }
 const selection=await session.client.call('queryGeometry',{context:current,bodyId,kind:'face',filter:{surfaceType:'cylinder'},requireUnique:true,limit:2});
 if(selection.status!=='read'||selection.items?.length!==1)throw Error('DETAIL_CYLINDER_PATCH_MISSING');
 await record({event:'s11-fresh-cylinder-patch',context:current,bodyId,selection});
 const extracted=await runSteps([add('patch','extractFaces',{faceIds:[selection.items[0].faceId]},[bodyId])],{key:'detail-extract-'+randomUUID(),signal});
 if(extracted.status!=='completed')return extracted;
 bodyId=extracted.results[0]?.result?.createdBodyIds?.[0];if(!bodyId)throw Error('DETAIL_EXTRACT_RECEIPT_MISSING');
 current=await context(session);
 const patch=await session.client.call('queryGeometry',{context:current,bodyId,kind:'face',filter:{surfaceType:'cylinder'},requireUnique:true,limit:2});
 if(patch.status!=='read'||patch.items?.length!==1)throw Error('DETAIL_EXTRACTED_FACE_MISSING');
 await record({event:'s11-fresh-extracted-patch',context:current,bodyId,selection:patch});
 return runSteps([add('wall','thickenFace',{faceId:patch.items[0].faceId,thickness:1},[bodyId])],{key:'detail-thicken-'+randomUUID(),signal});
}
export async function observeShellDetail({caseId,session,context,record}){
 const current=await context(session),state=await session.client.getState(),used=new Set(state.features.flatMap(f=>f.refs??[])),leaves=state.bodies.filter(b=>!used.has(b.id));
 if(leaves.length!==1)throw Error('DETAIL_RESULT_AMBIGUOUS');
 const bodyId=leaves[0].id,measured=await session.client.call('measure',{context:current,bodyId}),faces=await session.client.call('queryGeometry',{context:current,bodyId,kind:'face',filter:{},requireUnique:false,limit:64});
 if(measured.status!=='read'||faces.status!=='read')throw Error('DETAIL_READBACK_FAILED');
 await record({event:'shell-detail-page-readback',caseId,context:current,bodyId,measured,faces});
 return {geometry:{reader:{independent:false,source:'public-page-detail-readback'},brepValid:null,units:'mm',targetType:measured.solidCount>0?'solid':'surface',solidCount:measured.solidCount,volume:measured.volume,checks:{}},exportBodyIds:[bodyId],revision:current.expectedRevision,raw:{measured,faces}};
}
