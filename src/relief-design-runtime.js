// One bounded, cancellable numerical task per page. The current document stays authority.
import {reliefDesignCandidate} from './relief-design-field.js';
import {prepareReliefDesignFit} from './relief-design-fit.js';
import {prepareReliefDesignRelief} from './relief-design-brep.js';
let task=null,retained=null,retainedFit=null;
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const key=(context,entry)=>JSON.stringify([context.sessionId,context.documentId,context.documentInstanceId,context.revision??context.expectedRevision,entry.id,entry.revision,entry.draft]);
function cancelTask(kind){
 if(!task||kind&&task.kind!==kind)return {status:'idle'};
 const old=task;task=null;old.worker.terminate();clearTimeout(old.timer);
 if(old.kind==='fit')retainedFit=null;
 old.reject(Object.assign(new Error('Numerical design task cancelled'),{code:old.kind==='fit'?'FIT_CANCELLED':'FIELD_CANCELLED'}));
 return {status:'cancelled'};
}
export function cancelReliefDesignField(){return cancelTask();}
export function cancelReliefDesignFit(){return cancelTask('fit');}
async function runTask(kind,context,entry,payload,current,accept){
 if(typeof Worker==='undefined')fail('CAPABILITY_UNAVAILABLE','Numerical Worker is unavailable');
 if(typeof current!=='function')fail('PARAM_SCHEMA_INVALID','Current document reader is required');
 const binding=key(context,entry),worker=new Worker(new URL('./relief-design-worker.js',import.meta.url),{type:'module'});
 return await new Promise((resolve,reject)=>{
  const finish=()=>{if(task?.worker===worker)task=null;worker.terminate();clearTimeout(timer);};
  const timer=setTimeout(()=>{if(task?.worker!==worker)return;finish();reject(Object.assign(new Error('Numerical design task exceeded 30 seconds'),{code:kind==='fit'?'FIT_TIMEOUT':'FIELD_TIMEOUT'}));},30000);
  task={worker,reject,timer,binding,kind};
  worker.onerror=e=>{if(task?.worker!==worker)return;finish();reject(Object.assign(new Error(e.message||'Numerical Worker failed'),{code:kind==='fit'?'FIT_WORKER_FAILED':'FIELD_WORKER_FAILED'}));};
  worker.onmessage=e=>{
   if(task?.worker!==worker)return;finish();
   try{
    if(!e.data.ok)throw Object.assign(new Error(e.data.error.message),e.data.error);
    if(e.data.kind!==kind)fail('NUMERICAL_RESULT_MISMATCH','Worker result kind does not match its original request');
    const now=current();if(!now.entry||key(now.context,now.entry)!==binding)fail('RELIEF_DESIGN_STALE','Document or design changed during the numerical task');
    resolve(accept(e.data.result,binding,now));
   }catch(error){reject(error);}
  };
  try{worker.postMessage({...payload,kind,draft:structuredClone(entry.draft)});}catch(error){finish();reject(Object.assign(new Error('Numerical task input could not be transferred'),{code:kind==='fit'?'FIT_INPUT_INVALID':'FIELD_INPUT_INVALID'}));}
 });
}
export async function runReliefDesignField(context,entry,options={},current){
 if(!entry)fail('STALE_REFERENCE','Design draft not found');
 cancelTask();retained=null;retainedFit=null;
 const frozenOptions=structuredClone(options);
 return runTask('field',context,entry,{options:frozenOptions},current,(result,binding,now)=>{
  retained={binding,result,options:frozenOptions};return readReliefDesignField(now.context,now.entry);
 });
}
export function readReliefDesignField(context,entry){
 if(!entry)fail('STALE_REFERENCE','Design draft not found');
 const binding=key(context,entry);
 if(task?.kind==='field'&&task.binding===binding)return {status:'computing',designId:entry.id,draftRevision:entry.revision};
 if(!retained)return {status:'empty',designId:entry.id,draftRevision:entry.revision};
 if(retained.binding!==binding){retained=null;retainedFit=null;fail('RELIEF_DESIGN_STALE','Document or design changed; solve again');}
 return {status:'solved',designId:entry.id,draftRevision:entry.revision,...structuredClone(retained.result),options:structuredClone(retained.options)};
}
export function candidateReliefDesignField(context,entry,baseMm){const result=readReliefDesignField(context,entry);if(result.status!=='solved')fail('RELIEF_DESIGN_UNSOLVED','Solve current design first');return {...reliefDesignCandidate(result,entry.draft,baseMm),designId:entry.id,draftRevision:entry.revision};}
export async function runReliefDesignFit(context,entry,options,current){
 const solved=readReliefDesignField(context,entry);
 if(solved.status!=='solved')fail('RELIEF_DESIGN_UNSOLVED','Solve the current design field before numerical fitting');
 const sourceField=retained,prepared=prepareReliefDesignFit(entry.draft,solved,options);
 cancelTask();retainedFit=null;
 const revision=context.revision??context.expectedRevision;
 const sourceBinding={sessionId:context.sessionId,documentId:context.documentId,documentInstanceId:context.documentInstanceId,revision,designId:entry.id,draftRevision:entry.revision,...prepared.source};
 return runTask('fit',context,entry,{solved:sourceField.result,options:prepared.options},current,(result,binding,now)=>{
  if(retained!==sourceField||result.source?.fieldFingerprint!==prepared.source.fieldFingerprint||result.source?.draftFingerprint!==prepared.source.draftFingerprint||result.source?.optionsFingerprint!==prepared.source.optionsFingerprint)fail('RELIEF_DESIGN_STALE','The original solved field or fit options changed');
  retainedFit={binding,sourceField,result,sourceBinding};return readReliefDesignFit(now.context,now.entry);
 });
}
export function readReliefDesignFit(context,entry){
 if(!entry)fail('STALE_REFERENCE','Design draft not found');
 const binding=key(context,entry);
 if(task?.kind==='fit'&&task.binding===binding)return {status:'computing',designId:entry.id,draftRevision:entry.revision,geometryReady:false,brepComputed:false,commitState:'notCommitted'};
 if(!retainedFit)return {status:'empty',designId:entry.id,draftRevision:entry.revision,geometryReady:false,brepComputed:false,commitState:'notCommitted'};
 if(retainedFit.binding!==binding||retainedFit.sourceField!==retained){retainedFit=null;fail('RELIEF_DESIGN_STALE','Document, design or solved field changed; fit the current field again');}
 return {status:'fitted',designId:entry.id,draftRevision:entry.revision,...structuredClone(retainedFit.result),sourceBinding:structuredClone(retainedFit.sourceBinding)};
}
// Read-only bridge: current retained fit (stale-checked) -> relief preview args.
// `support` must come from the trusted kernel reliefDesignSupport(bodyId,faceId) read
// of the user's current selection. No preview/apply is started here.
export function prepareReliefDesignReliefFromRetained(context,entry,request,support){
 const fit=readReliefDesignFit(context,entry),solved=readReliefDesignField(context,entry);
 return prepareReliefDesignRelief({...request,fit,solved,entry,support});
}
