// Single bounded long wait for agents: replaces client-side getState/getJob polling.
// The page checks locally (no network); callers repeat waitFor after a timeout.
import {LIMITS} from './limits.js';

const TERMINAL_JOB=new Set(['committed','completed','failed','unknown','partial','cancelled']);

export function createPageWait({getState,getJob,tickMs=50,now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
  const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
  return async function waitFor(input={}){
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['afterRevision','jobId','timeoutMs','documentInstanceId'].includes(k)))fail('PARAM_SCHEMA_INVALID','waitFor accepts afterRevision | jobId, timeoutMs and documentInstanceId');
    const byRevision=input.afterRevision!==undefined,byJob=input.jobId!==undefined;
    if(byRevision===byJob)fail('PARAM_SCHEMA_INVALID','Provide exactly one of afterRevision or jobId');
    if(byRevision&&(!Number.isInteger(input.afterRevision)||input.afterRevision<0))fail('PARAM_SCHEMA_INVALID','afterRevision must be a non-negative integer');
    if(byJob&&(typeof input.jobId!=='string'||!input.jobId))fail('PARAM_SCHEMA_INVALID','jobId must be a string');
    const max=LIMITS.transport.waitMaxMs,timeoutMs=input.timeoutMs??max;
    if(!Number.isInteger(timeoutMs)||timeoutMs<0||timeoutMs>max)fail('PARAM_RANGE_INVALID',`timeoutMs must be 0..${max}`);
    const start=now();
    for(;;){
      const state=await getState(),context=state.context;
      if(input.documentInstanceId!==undefined&&context.documentInstanceId!==input.documentInstanceId)
        return {status:'read',satisfied:true,reason:'DOCUMENT_REPLACED',timedOut:false,context,waitedMs:now()-start};
      if(byRevision&&context.revision>input.afterRevision)return {status:'read',satisfied:true,reason:'REVISION_ADVANCED',timedOut:false,context,waitedMs:now()-start};
      if(byJob){const job=await getJob({jobId:input.jobId});if(TERMINAL_JOB.has(job.status))return {status:'read',satisfied:true,reason:'JOB_TERMINAL',timedOut:false,job,context,waitedMs:now()-start};}
      if(now()-start>=timeoutMs)return {status:'read',satisfied:false,reason:'TIMEOUT',timedOut:true,context,waitedMs:now()-start,
        nextAction:'Call waitFor again with the same arguments; a timeout does not cancel the job.'};
      await sleep(Math.min(tickMs,Math.max(0,timeoutMs-(now()-start))));
    }
  };
}
