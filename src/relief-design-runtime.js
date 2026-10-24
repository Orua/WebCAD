// One bounded, cancellable numerical task per page. The current document stays authority.
import {reliefDesignCandidate} from './relief-design-field.js';
import {prepareReliefDesignFit,provisionalServicesFit} from './relief-design-fit.js';
import {prepareReliefDesignRelief} from './relief-design-brep.js';
let task=null,retained=null,retainedFit=null;
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
// Persist solve/fit retention across same-tab reload when the draft was saved to the project.
// Keyed by documentId+designId+draftRevision (not session/instance): IndexedDB recovery restores the
// document; this restores the fact that a field/fit existed so restoreRetained can auto re-solve.
const persistKey=(documentId,entry)=>`webcad.relief.retained.v1:${documentId}:${entry.id}:${entry.revision}`;
function writeRetainedHint(context,entry,kind,extra={}){
 try{
  const k=persistKey(context.documentId,entry);
  const prev=JSON.parse(sessionStorage.getItem(k)||'null')||{};
  sessionStorage.setItem(k,JSON.stringify({...prev,kind,documentId:context.documentId,designId:entry.id,draftRevision:entry.revision,savedAt:Date.now(),hasHeightSource:!!entry.draft?.heightSource,...extra}));
 }catch{/* sessionStorage may be unavailable */}
}
function readRetainedHint(context,entry){
 try{const v=JSON.parse(sessionStorage.getItem(persistKey(context.documentId,entry))||'null');return v&&v.designId===entry.id&&v.draftRevision===entry.revision?v:null;}catch{return null;}
}
export function reliefRetainedHint(context,entry){return entry?readRetainedHint(context,entry):null;}
// Bind retained field/fit to session + document instance + draft id/fingerprint (NOT whole-doc revision):
// reopening the dialog after unrelated edits must restore solve/fit for the same draft.
const key=(context,entry)=>JSON.stringify([context.sessionId,context.documentId,context.documentInstanceId,entry.id,entry.revision,entry.draft]);
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
  retained={binding,result,options:frozenOptions};writeRetainedHint(now.context,now.entry,'field',{field:[result.field?.columns,result.field?.rows],options:frozenOptions});return readReliefDesignField(now.context,now.entry);
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
export function candidateReliefDesignField(context,entry,baseMm,placement){const result=readReliefDesignField(context,entry);if(result.status!=='solved')fail('RELIEF_DESIGN_UNSOLVED','Solve current design first');return {...reliefDesignCandidate(result,entry.draft,baseMm,placement??null),designId:entry.id,draftRevision:entry.revision};}
export async function runReliefDesignFit(context,entry,options,current){
 const solved=readReliefDesignField(context,entry);
 if(solved.status!=='solved')fail('RELIEF_DESIGN_UNSOLVED','Solve the current design field before numerical fitting');
 let attempt={...options},lastBudget=null;
 for(let step=0;step<4;step++){
  const sourceField=retained,prepared=prepareReliefDesignFit(entry.draft,solved,attempt);
  cancelTask();retainedFit=null;
  const revision=context.revision??context.expectedRevision;
  const sourceBinding={sessionId:context.sessionId,documentId:context.documentId,documentInstanceId:context.documentInstanceId,revision,designId:entry.id,draftRevision:entry.revision,...prepared.source};
  try{
   return await runTask('fit',context,entry,{solved:sourceField.result,options:prepared.options},current,(result,binding,now)=>{
    if(retained!==sourceField||result.source?.fieldFingerprint!==prepared.source.fieldFingerprint||result.source?.draftFingerprint!==prepared.source.draftFingerprint||result.source?.optionsFingerprint!==prepared.source.optionsFingerprint)fail('RELIEF_DESIGN_STALE','The original solved field or fit options changed');
    retainedFit={binding,sourceField,result,sourceBinding};writeRetainedHint(now.context,now.entry,'fit',{fit:[result.fit?.columns,result.fit?.rows],baselineMm:result.fit?.baselineMm,workBudgetRetry:lastBudget});return readReliefDesignFit(now.context,now.entry);
   });
  }catch(error){
   if(error?.code!=='FIT_WORK_BUDGET')throw error;
   const cols=prepared.options.controlColumns,rows=prepared.options.controlRows;
   const nextCols=Math.max(9,Math.floor((cols-1)/2)+1),nextRows=Math.max(9,Math.floor((rows-1)/2)+1);
   if(nextCols>=cols&&nextRows>=rows)throw error;
   lastBudget={from:[cols,rows],to:[nextCols,nextRows],reason:'FIT_WORK_BUDGET'};
   attempt={...attempt,controlColumns:nextCols,controlRows:nextRows};
  }
 }
 fail('FIT_WORK_BUDGET','Numerical total work budget reached after control-net reductions');
}
// Services-first: install a provisional (non-geometry) net as the retained fit so 准备 needs no browser fit.
export function provisionalReliefDesignFit(context,entry,options){
 const solved=readReliefDesignField(context,entry);
 if(solved.status!=='solved')fail('RELIEF_DESIGN_UNSOLVED','Solve the current design field before preparing');
 const sourceField=retained,result=provisionalServicesFit(entry.draft,solved,options);
 cancelTask();const revision=context.revision??context.expectedRevision;
 retainedFit={binding:key(context,entry),sourceField,result,sourceBinding:{sessionId:context.sessionId,documentId:context.documentId,documentInstanceId:context.documentInstanceId,revision,designId:entry.id,draftRevision:entry.revision,...result.source}};
 writeRetainedHint(context,entry,'fit',{provisional:true,baselineMm:result.fit?.baselineMm});return readReliefDesignFit(context,entry);
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
