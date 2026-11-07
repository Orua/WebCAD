import {randomUUID} from 'node:crypto';
export const basicCaseIds=['B01','B02','B03'];
export const basicToolIds=['box','transform','multiHole','cylinder','cut','fillet'];
const world={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
const near=(a,b,tolerance=.01)=>Number.isFinite(a)&&Math.abs(a-b)<=tolerance;
const requireCompleted=receipt=>{if(receipt?.status!=='completed')throw Object.assign(Error('L1_STEP_NOT_COMPLETED'),{receipt});return receipt;};
export async function runAdditionalBasicCase({caseId,session,runSteps,history,context,record,signal,maxToolCalls}){
 if(!['B02','B03'].includes(caseId))throw Error('ADDITIONAL_BASIC_CASE_UNKNOWN');
 let calls=0;
 const call=async fn=>{signal?.throwIfAborted();if(++calls>maxToolCalls)throw Error('L1_TOOL_BUDGET_EXHAUSTED');return fn();};
 const run=async steps=>requireCompleted(await call(()=>runSteps(steps,{key:`t03-${caseId}-${randomUUID()}`,signal})));
 if(caseId==='B02')return run([
  {id:'outer',method:'add',args:{op:'cylinder',params:{radius:6,height:20},refs:[],placement:world}},
  {id:'bore',method:'add',args:{op:'cylinder',params:{radius:4,height:20},refs:[],placement:world}},
  {id:'sleeve',method:'add',args:{op:'cut',params:{},refs:[{$ref:'outer.createdBodyIds.0'},{$ref:'bore.createdBodyIds.0'}]}},
 ]);
 await run([
  {id:'stock',method:'add',args:{op:'box',params:{width:30,depth:20,height:5},refs:[],placement:world}},
  {id:'centered',method:'add',args:{op:'transform',params:{x:-15,y:-10,z:0},refs:[{$ref:'stock.createdBodyIds.0'}]}},
 ]);
 const state=await call(()=>session.client.getState());
 if(state.bodies.length!==1)throw Error('B03_SINGLE_BASE_REQUIRED');
 const selectionContext=await context(session),bodyId=state.bodies[0].id;
 const selection=await call(()=>session.client.call('queryGeometry',{context:selectionContext,bodyId,kind:'edge',filter:{curveType:'line',lengthRangeMm:{min:4.999999,max:5.000001}},requireUnique:false,expectedCount:4,limit:20}));
 const edges=selection.items??[];
 if(selection.status!=='read'||edges.length!==4||edges.some(e=>!Number.isInteger(e.edgeId)||!Array.isArray(e.startPoint)||!Array.isArray(e.endPoint)||!near(Math.abs(e.endPoint[2]-e.startPoint[2]),5)||!near(e.endPoint[0]-e.startPoint[0],0)||!near(e.endPoint[1]-e.startPoint[1],0)))throw Error('B03_FOUR_FRESH_VERTICAL_EDGES_REQUIRED');
 if((await context(session)).expectedRevision!==selectionContext.expectedRevision)throw Error('B03_TOPOLOGY_REVISION_CHANGED');
 await record({event:'b03-fresh-edge-selection',context:selectionContext,selection});
 await run([{id:'rounded',method:'add',args:{op:'fillet',params:{radius:1,edgeIds:edges.map(e=>e.edgeId)},refs:[bodyId]}}]);
 const measured=async()=>{
  const current=await context(session),s=await call(()=>session.client.getState());
  if(s.bodies.length!==1)throw Error('B03_SINGLE_RESULT_REQUIRED');
  const measurement=await call(()=>session.client.call('measure',{context:current,bodyId:s.bodies[0].id}));
  return {context:current,measurement};
 };
 const before=await measured();
 const undone=await call(()=>history('history.undo',{key:`t03-undo-${randomUUID()}`,signal}));requireCompleted(undone);
 const undo=await measured();
 const redone=await call(()=>history('history.redo',{key:`t03-redo-${randomUUID()}`,signal}));requireCompleted(redone);
 const redo=await measured();
 const expected=5*(596+Math.PI);
 const pass=near(before.measurement.volume,expected,expected*1e-4)&&near(undo.measurement.volume,3000,.3)&&near(redo.measurement.volume,before.measurement.volume,1e-6)&&
  [before,undo,redo].every(x=>x.measurement.status==='read'&&x.measurement.solidCount===1&&x.context.documentInstanceId===session.documentInstanceId)&&undo.context.expectedRevision>before.context.expectedRevision&&redo.context.expectedRevision>undo.context.expectedRevision;
 const undoEvidence={checkerId:'live-page-history-undo-redo-1',pass,evidence:{scope:'original-model-session-workflow',documentInstanceId:session.documentInstanceId,before,undo,redo,undone,redone}};
 session.workflowChecks={undo:undoEvidence};
 await record({event:'b03-undo-redo',check:undoEvidence});
 return {status:'completed',toolCalls:calls,workflowChecks:session.workflowChecks};
}

export async function observeAdditionalBasicCase({caseId,session,context,record}){
 if(!['B02','B03'].includes(caseId))throw Error('ADDITIONAL_BASIC_CASE_UNKNOWN');
 const current=await context(session),state=await session.client.getState();
 if(state.bodies.length!==1)throw Error('BASIC_SINGLE_BODY_REQUIRED');
 const bodyId=state.bodies[0].id;
 const measured=await session.client.call('measure',{context:current,bodyId});
 const surfaces=await session.client.call('queryGeometry',{context:current,bodyId,kind:'face',filter:{surfaceType:'cylinder'},requireUnique:false,limit:20});
 if(measured.status!=='read'||surfaces.status!=='read')throw Error('BASIC_READBACK_FAILED');
 const cylinders=(surfaces.items??[]).map(item=>item.cylinder).filter(Boolean);
 const bounds=Object.fromEntries(['X','Y','Z'].flatMap((axis,i)=>[[`min${axis}`,measured.bounds.min[i]],[`max${axis}`,measured.bounds.max[i]]]));
 const check=(pass,evidence)=>({checkerId:'page-cylinder-readback-1',pass,evidence});
 const checks={};let material=null;
 if(caseId==='B02'){
  checks.diameters=check(cylinders.length>=2&&cylinders.every(c=>near(c.radiusMm,4)||near(c.radiusMm,6))&&cylinders.some(c=>near(c.radiusMm,4))&&cylinders.some(c=>near(c.radiusMm,6)),{cylinders});
  checks.coaxial=check(cylinders.length>0&&cylinders.every(c=>near(c.origin[0],0)&&near(c.origin[1],0)&&Math.abs(c.axis[2])>1-1e-7),{cylinders});
  checks.height=check(near(bounds.minZ,0)&&near(bounds.maxZ,20),bounds);
  material=await session.client.call('inspectDesign',{context:current,requirements:[{id:'bore',bodyId,kind:'material',points:[[0,0,.1],[0,0,10],[0,0,19.9]],expected:'outside',evidence:{kind:'drawing',reference:'Synthetic B02 specification 1.0.0'}}]});
  const bore=material.results?.find(r=>r.id==='bore');checks.through=check(bore?.verdict==='pass',bore??null);
 }else{
  checks.radius=check(cylinders.length===4&&cylinders.every(c=>near(c.radiusMm,1)),{cylinders});
  checks.edgeScope=check(cylinders.length===4&&cylinders.every(c=>Math.abs(c.axis[2])>1-1e-7&&near(Math.abs(c.origin[0]),14)&&near(Math.abs(c.origin[1]),9)),{cylinders});
  checks.thickness=check(near(bounds.minZ,0)&&near(bounds.maxZ,5),bounds);
  if(session.workflowChecks?.undo)checks.undo=session.workflowChecks.undo;
 }
 await record({event:'basic-page-readback',caseId,context:current,measured,surfaces,material});
 return {geometry:{reader:{independent:false,source:'public-page-readback'},brepValid:null,units:'mm',targetType:measured.solidCount>0?'solid':'surface',solidCount:measured.solidCount,volume:measured.volume,bounds,checks},raw:{measured,surfaces,material},revision:current.expectedRevision};
}
