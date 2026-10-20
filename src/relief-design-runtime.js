// One bounded, cancellable numerical task per page. The current document stays authority.
import {reliefDesignCandidate} from './relief-design-field.js';
let task=null,retained=null;
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const key=(context,entry)=>JSON.stringify([context.documentInstanceId,context.revision??context.expectedRevision,entry.id,entry.revision,entry.draft]);
export function cancelReliefDesignField(){if(!task)return {status:'idle'};const old=task;task=null;old.worker.terminate();clearTimeout(old.timer);old.reject(Object.assign(new Error('Design field cancelled'),{code:'FIELD_CANCELLED'}));return {status:'cancelled'};}
export async function runReliefDesignField(context,entry,options={},current){
 if(!entry)fail('STALE_REFERENCE','Design draft not found');
 cancelReliefDesignField();retained=null;
 if(typeof Worker==='undefined')fail('CAPABILITY_UNAVAILABLE','Numerical Worker is unavailable');
 const binding=key(context,entry),worker=new Worker(new URL('./relief-design-worker.js',import.meta.url),{type:'module'});
 return await new Promise((resolve,reject)=>{
  const finish=()=>{if(task?.worker===worker)task=null;worker.terminate();clearTimeout(timer);};
  const timer=setTimeout(()=>{finish();reject(Object.assign(new Error('Design field exceeded 30 seconds'),{code:'FIELD_TIMEOUT'}));},30000);
  task={worker,reject,timer,binding};
  worker.onerror=e=>{finish();reject(Object.assign(new Error(e.message||'Numerical Worker failed'),{code:'FIELD_WORKER_FAILED'}));};
  worker.onmessage=e=>{finish();if(!e.data.ok){reject(Object.assign(new Error(e.data.error.message),e.data.error));return;}
   const now=current();if(!now.entry||key(now.context,now.entry)!==binding){reject(Object.assign(new Error('Document or design changed during solve'),{code:'RELIEF_DESIGN_STALE'}));return;}
   retained={binding,result:e.data.result,options:structuredClone(options)};resolve(readReliefDesignField(now.context,now.entry));};
  worker.postMessage({draft:entry.draft,options});
 });
}
export function readReliefDesignField(context,entry){
 if(!entry)fail('STALE_REFERENCE','Design draft not found');
 const binding=key(context,entry);
 if(task?.binding===binding)return {status:'computing',designId:entry.id,draftRevision:entry.revision};
 if(!retained)return {status:'empty',designId:entry.id,draftRevision:entry.revision};
 if(retained.binding!==binding){retained=null;fail('RELIEF_DESIGN_STALE','Document or design changed; solve again');}
 return {status:'solved',designId:entry.id,draftRevision:entry.revision,...structuredClone(retained.result),options:structuredClone(retained.options)};
}
export function candidateReliefDesignField(context,entry,baseMm){const result=readReliefDesignField(context,entry);if(result.status!=='solved')fail('RELIEF_DESIGN_UNSOLVED','Solve current design first');return {...reliefDesignCandidate(result,entry.draft,baseMm),designId:entry.id,draftRevision:entry.revision};}
