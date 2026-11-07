import {randomUUID} from 'node:crypto';
export const radialHoleCaseIds=['M05'];
export const radialHoleToolIds={M05:['cylinder','transform','cut']};
const world={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
const ref=id=>({$ref:id+'.createdBodyIds.0'});
const add=(id,op,params,refs=[])=>({id,method:'add',args:{op,params,refs,...(!refs.length?{placement:world}:{})}});
export function radialHoleSteps(index,target){
 const angle=index*60,radians=angle*Math.PI/180;
 const tool='drill'+index,placed='radial'+index;
 return [add(tool,'cylinder',{radius:1,height:4}),
  add(placed,'transform',{ry:90,rz:angle,x:9*Math.cos(radians),y:9*Math.sin(radians),z:10},[ref(tool)]),
  add('cut'+index,'cut',{},[target,ref(placed)])];
}
export function m05FirstSteps(){
 return [add('outer','cylinder',{radius:12,height:20}),add('bore','cylinder',{radius:10,height:20}),
  add('sleeve','cut',{},[ref('outer'),ref('bore')]),...radialHoleSteps(0,ref('sleeve'))];
}
export function m05RemainingSteps(bodyId){
 return Array.from({length:5},(_,i)=>radialHoleSteps(i+1,i===0?bodyId:ref('cut'+i))).flat();
}
export function m05CutScopeCheck({firstArtifact,firstGeometry,probe,stages,finalContext,documentInstanceId}){
 const native=firstGeometry?.checks?.cutScope;
 const stored=firstArtifact?.saved?.verified===true&&firstArtifact.saved.sha256===firstArtifact.descriptor?.sha256;
 const linked=stored&&firstGeometry?.reader?.independent===true&&firstGeometry.reader.inputSha256===firstArtifact.descriptor.sha256;
 const probePass=probe?.status==='read'&&['firstVoid','oppositeKept'].every(id=>probe.results?.find(item=>item.id===id)?.verdict==='pass');
 const chain=stages?.length===2&&stages.every(stage=>stage.receipt?.status==='completed'&&stage.before?.documentInstanceId===documentInstanceId&&stage.after?.documentInstanceId===documentInstanceId&&stage.after.expectedRevision>stage.before.expectedRevision)
  &&stages[0].after.expectedRevision===stages[1].before.expectedRevision&&stages[1].after.expectedRevision===finalContext.expectedRevision;
 const exact=chain&&JSON.stringify(stages[0].steps)===JSON.stringify(m05FirstSteps())&&JSON.stringify(stages[1].steps)===JSON.stringify(m05RemainingSteps(stages[1].bodyId));
 const proven=linked&&native?.pass===true&&probePass&&exact;
 const failed=linked&&native?.pass===false||probe?.status==='read'&&probe.results?.some(item=>['firstVoid','oppositeKept'].includes(item.id)&&item.verdict==='fail');
 return {checkerId:'m05-original-workflow-first-STEP-and-exact-six-tool-spans-1',pass:proven?true:failed?false:null,
  evidence:{scope:'original modeling workflow; final STEP alone cannot distinguish opposite through-cuts',documentInstanceId,finalContext,
   firstStepSha256:firstArtifact?.descriptor?.sha256??null,firstStepSaved:firstArtifact?.saved??null,firstGeometry:firstGeometry??null,probe,stages,
   firstHoleIndependentCheck:native??null,exactSixToolSpans:exact,toolRadialIntervalMm:[9,13],
   limit:'the first intermediate STEP proves one-sided removal; exact recorded public-operation requests establish the six tool spans, including their portions in empty space'}};
}
export async function runRadialHoleCase({session,runSteps,context,record,exportFirst,readFirst,signal,maxToolCalls}){
 if(maxToolCalls<2)throw Error('L1_TOOL_BUDGET_EXHAUSTED');
 const stages=[];
 const run=async(steps,bodyId=null)=>{
  signal?.throwIfAborted();const before=await context(session);
  const receipt=await runSteps(steps,{key:'t03-M05-'+randomUUID(),signal});
  if(receipt.status!=='completed')throw Object.assign(Error('M05_STAGE_NOT_COMPLETED'),{receipt});
  const after=await context(session);stages.push({before,after,steps,bodyId,receipt});return after;
 };
 await run(m05FirstSteps());
 const state=await session.client.getState();
 if(state.bodies.length!==1)throw Error('M05_FIRST_SINGLE_BODY_REQUIRED');
 const probeContext=await context(session),bodyId=state.bodies[0].id;
 const evidence={kind:'drawing',reference:'Synthetic M05 specification 1.0.0; first-hole checkpoint'};
 const probe=await session.client.call('inspectDesign',{context:probeContext,requirements:[
  {id:'firstVoid',bodyId,kind:'material',points:[[10.1,0,10],[11,0,10],[11.9,0,10]],expected:'outside',evidence},
  {id:'oppositeKept',bodyId,kind:'material',points:[[-10.1,0,10],[-11,0,10],[-11.9,0,10]],expected:'inside',evidence},
 ]});
 const firstArtifact=await exportFirst(),firstGeometry=readFirst?await readFirst(firstArtifact.bytes):null;
 await record({event:'m05-first-hole-checkpoint',documentInstanceId:session.documentInstanceId,context:probeContext,probe,
  stepSha256:firstArtifact.descriptor.sha256,saved:firstArtifact.saved,geometry:firstGeometry});
 const unchanged=await context(session);
 if(unchanged.expectedRevision!==probeContext.expectedRevision)throw Error('M05_CHECKPOINT_REVISION_CHANGED');
 await run(m05RemainingSteps(bodyId),bodyId);
 const finalContext=await context(session);
 const check=m05CutScopeCheck({firstArtifact,firstGeometry,probe,stages,finalContext,documentInstanceId:session.documentInstanceId});
 session.workflowChecks={cutScope:check};
 await record({event:'m05-cut-scope-workflow',check});
 return {status:'completed',workflowChecks:session.workflowChecks};
}
export async function observeRadialHoleCase({caseId,session,context,record}){
 if(caseId!=='M05')throw Error('RADIAL_HOLE_CASE_UNKNOWN');
 const current=await context(session),state=await session.client.getState();
 if(state.bodies.length!==1)throw Error('BASIC_SINGLE_BODY_REQUIRED');
 const measured=await session.client.call('measure',{context:current,bodyId:state.bodies[0].id});
 if(measured.status!=='read')throw Error('RADIAL_HOLE_READBACK_FAILED');
 await record({event:'m05-final-page-readback',context:current,measured});
 return {geometry:{reader:{independent:false,source:'public-page-volume-only; final STEP has no cut history'},brepValid:null,units:'mm',targetType:measured.solidCount>0?'solid':'surface',solidCount:measured.solidCount,volume:measured.volume,checks:{}},revision:current.expectedRevision,raw:{measured}};
}
