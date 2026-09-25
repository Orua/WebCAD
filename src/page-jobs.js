// Page-local receipts survive a host call timeout, not a page reload. No server.
export function createPageJobs(api) {
  const jobs = new Map();
  const methods = new Set(['run','execute','queryGeometry','measure','setView','setRenderQuality','files.save','files.export','files.import']);
  const fail = (code,message) => {throw Object.assign(new Error(message),{code});};
  const snapshot = job => structuredClone(Object.fromEntries(Object.entries(job).filter(([k])=>!['fingerprint','args'].includes(k))));
  function getJob({jobId}={}) {
    const job=jobs.get(jobId);
    if(!job)fail('JOB_NOT_FOUND','Job is unknown in this page; read current state before retrying');
    return snapshot(job);
  }
  function submit(input={}) {
    if(Object.keys(input).some(k=>!['method','args','jobId'].includes(k))||!methods.has(input.method)||!input.args||typeof input.args!=='object')fail('PARAM_SCHEMA_INVALID','Provide method, args and a unique jobId');
    const {method,args,jobId}=input;
    if(typeof jobId!=='string'||!jobId.length||jobId.length>80)fail('PARAM_SCHEMA_INVALID','jobId must be 1..80 characters');
    const fingerprint=JSON.stringify({method,args});
    if(fingerprint.length>3*1024*1024)fail('RESOURCE_LIMIT','Job exceeds 3 MiB; register large file bytes separately');
    if(jobs.has(jobId)){
      if(jobs.get(jobId).fingerprint!==fingerprint)fail('IDEMPOTENCY_KEY_REUSED','Job ID already belongs to another request');
      return getJob({jobId});
    }
    if(jobs.size>=100)fail('RESOURCE_LIMIT','100 job receipts per page; retrieve results before starting another page');
    const job={jobId,method,args:structuredClone(args),fingerprint,status:'queued',progress:null,phase:'waiting',createdAt:Date.now(),context:api.getState().context};
    jobs.set(jobId,job);
    setTimeout(async()=>{
      if(job.status==='cancelled')return;
      job.status='running';job.phase='executing';job.startedAt=Date.now();
      const result=await api.invoke({method,args:job.args});
      job.result=result;
      job.status=['failed','unknown','partial'].includes(result?.status)?result.status:result?.status==='committed'||result?.status==='completed'?'committed':'completed';
      job.phase='finished';job.finishedAt=Date.now();job.elapsedMs=job.finishedAt-job.startedAt;
    },0);
    return snapshot(job);
  }
  function cancelJob({jobId}={}) {
    const job=jobs.get(jobId);if(!job)fail('JOB_NOT_FOUND','Unknown job');
    if(job.status==='running')return {...snapshot(job),cancelled:false,reason:'RUNNING_KERNEL_NOT_INTERRUPTIBLE'};
    if(job.status==='queued'){job.status='cancelled';job.phase='finished';job.finishedAt=Date.now();}
    return {...snapshot(job),cancelled:job.status==='cancelled'};
  }
  return {submit,getJob,cancelJob};
}
