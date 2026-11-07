export const modelHistoryActions=Object.freeze(['history.undo','history.redo']);
export function assertModelHistoryArgs(args={}){if(!modelHistoryActions.includes(args.action)||args.args!==undefined&&(!args.args||typeof args.args!=='object'||Array.isArray(args.args)||Object.keys(args.args).length))throw Error('MODEL_HISTORY_ACTION_NOT_ALLOWED');}
const near=(a,b,tolerance=1e-6)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance;
export async function executeModelHistory({session,args,signal,context,run,record}){
 assertModelHistoryArgs(args);signal?.throwIfAborted();
 const observe=async()=>{const c=await context(session),state=await session.client.getState();if(state.bodies.length!==1)return {context:c,measurement:null,bodyCount:state.bodies.length};return {context:c,measurement:await session.client.call('measure',{context:c,bodyId:state.bodies[0].id})};};
 const before=session.caseId==='B03'?await observe():null;
 const receipt=await run(args.action);if(receipt.status!=='completed')return receipt;
 if(session.caseId==='B03'){
  const after=await observe(),event={action:args.action,before,after,receipt};
  session.modelHistoryEvents??=[];session.modelHistoryEvents.push(event);
  if(args.action==='history.undo')session.lastModelUndo=event;
  if(args.action==='history.redo'&&session.lastModelUndo){const u=session.lastModelUndo,expected=5*(596+Math.PI),stages=[u.before,u.after,after];
   const linked=stages.every(x=>x.context.documentInstanceId===session.documentInstanceId&&x.measurement?.status==='read'&&x.measurement.solidCount===1)&&u.after.context.expectedRevision===before.context.expectedRevision&&u.after.context.expectedRevision>u.before.context.expectedRevision&&after.context.expectedRevision>before.context.expectedRevision;
   const pass=linked&&near(u.before.measurement?.volume,expected,expected*1e-4)&&near(u.after.measurement?.volume,3000,.3)&&near(after.measurement?.volume,u.before.measurement?.volume);
   const check={checkerId:'real-model-page-history-undo-redo-1',pass,evidence:{scope:'original-real-model-session-workflow',documentInstanceId:session.documentInstanceId,before:u.before,undo:u.after,redo:after,undone:u.receipt,redone:receipt}};
   session.workflowChecks={...(session.workflowChecks??{}),undo:check};await record({event:'model-b03-undo-redo',check});
  }
 }
 return receipt;
}
