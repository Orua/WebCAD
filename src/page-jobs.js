// Page-local receipts survive a host call timeout, not a page reload. No server.
export function createPageJobs(api,{runBatch}={}) {
  const jobs = new Map();
  // Completion is pushed: each job owns a settled-once promise, so hosts await it instead of polling getState.
  const done = new Map();
  const settle = job => {const d=done.get(job.jobId);if(d){done.delete(job.jobId);d.resolve();}};
  const methods = new Set(['run','execute','queryGeometry','measure','measureRelation','inspectProfile','prepareProfileEdit','inspectConstraints','projectProfile','inspectFit','inspectThickness','inspectDraft','setView','setRenderQuality','files.save','files.export','files.import']);
  methods.add('inspectDesign');
  methods.add('inspectRound');
  methods.add('recoverKernel');
  methods.add('files.reattach');
  for(const name of ['createDrawing','exportDrawing','copySelection','pasteSelection'])methods.add(name);
  const fail = (code,message) => {throw Object.assign(new Error(message),{code});};
  const snapshot = job => structuredClone(Object.fromEntries(Object.entries(job).filter(([k])=>!['fingerprint','args'].includes(k))));
  function getJob({jobId}={}) {
    const job=jobs.get(jobId);
    if(!job)fail('JOB_NOT_FOUND','Job is unknown in this page; read current state before retrying');
    const result=snapshot(job);
    if(job.status==='running'){
      const state=api.getState(),progress=state.kernelProgress;
      if(progress&&progress.updatedAt>=job.startedAt&&state.context?.documentInstanceId===job.context.documentInstanceId){result.progress=job.progress?{...job.progress,kernel:progress}:progress;result.phase=job.progress?'stage':progress.phase;}
      result.elapsedMs=Date.now()-job.startedAt;
    }
    return result;
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
    {let resolve;const promise=new Promise(r=>{resolve=r;});done.set(jobId,{promise,resolve});}
    setTimeout(async()=>{
      if(job.status==='cancelled')return;
      job.status='running';job.phase='executing';job.startedAt=Date.now();
      let result;
      try { result=method==='run'&&runBatch?await runBatch(job.args,{cancelled:()=>job.cancelRequested===true,progress:progress=>{job.progress={...progress,updatedAt:Date.now()};job.phase='stage';}}):await api.invoke({method,args:job.args}); }
      catch(error) { result={status:'unknown',commitState:'unknown',error:{code:error.code||'JOB_EXECUTION_FAILED',message:error.message},context:api.getState().context}; }
      job.result=result;
      job.status=['failed','unknown','partial'].includes(result?.status)?result.status:result?.status==='committed'||result?.status==='completed'?'committed':'completed';
      job.phase='finished';job.finishedAt=Date.now();job.elapsedMs=job.finishedAt-job.startedAt;
      settle(job);
    },0);
    return snapshot(job);
  }
  function cancelJob({jobId}={}) {
    const job=jobs.get(jobId);if(!job)fail('JOB_NOT_FOUND','Unknown job');
    if(job.status==='running'){
      if(job.method==='run'&&runBatch){job.cancelRequested=true;return {...snapshot(job),cancelled:false,reason:'STOP_REQUESTED_AFTER_CURRENT_STAGE'};}
      return {...snapshot(job),cancelled:false,reason:'RUNNING_KERNEL_NOT_INTERRUPTIBLE'};
    }
    if(job.status==='queued'){job.status='cancelled';job.phase='finished';job.finishedAt=Date.now();settle(job);}
    return {...snapshot(job),cancelled:job.status==='cancelled'};
  }
  // Resolve as soon as the job is terminal (no 50 ms tick, no full getState per tick). A timeout returns the
  // current snapshot; it never cancels or replays the job.
  async function awaitJob({jobId,timeoutMs=25000}={}) {
    if(!jobs.has(jobId))fail('JOB_NOT_FOUND','Job is unknown in this page; read current state before retrying');
    if(!Number.isInteger(timeoutMs)||timeoutMs<0||timeoutMs>25000)fail('PARAM_RANGE_INVALID','timeoutMs must be 0..25000');
    const pending=done.get(jobId);
    if(pending&&timeoutMs>0){let timer;await Promise.race([pending.promise,new Promise(r=>{timer=setTimeout(r,timeoutMs);})]).finally(()=>clearTimeout(timer));}
    return getJob({jobId});
  }
  return {submit,getJob,cancelJob,awaitJob};
}
