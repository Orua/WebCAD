import {PROTOCOL, JOB_METHODS, assertIdentity, failure, validatePayload} from './protocol.js';

/** Host capability is injected. No model-provided code, origins, URLs or disk paths. */
export function createHostAdapter({api, session, report, artifact, now=()=>Date.now(), wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  if (!api?.connect || !api?.invoke || !api?.getState || typeof report!=='function') throw failure('host_unavailable','Current public page API and an authorized result channel required');
  const binding={...session.binding}, scopes=[...session.scopes];
  let accepting=true, activeTask=null, tail=Promise.resolve();
  const commands=new Map();
  const endedTasks=new Set();
  const pending=entry=>!entry.result || entry.result.status==='unknown';
  const samePage=()=>assertIdentity(api.getState().context,binding);
  samePage();

  async function finish(entry, result) {
    if(result && typeof result==='object' && !result.status)result={status:'read',...result};
    if (artifact && result?.status==='generated' && result.resourceId) {
      try {
        const bytes=await api.files.read({resourceId:result.resourceId,as:'bytes'});
        const attachment=await artifact(entry.command,result,bytes);
        result={...result,attachment};
        if(entry.command.payload.method==='files.save' && attachment?.status==='agent_write_verified' && attachment.size===result.size && attachment.sha256===result.sha256){
          try {
            result.saveConfirmation=await api.files.confirmWritten({resourceId:result.resourceId,size:attachment.size,sha256:attachment.sha256});
          } catch(error) {
            result.saveConfirmation={status:'failed',error:{code:error.code||'SAVE_CONFIRMATION_FAILED',message:error.message}};
          }
        }
      } catch(error) {
        result={...result,attachment:{status:'failed',error:{code:error.code||'ARTIFACT_TRANSFER_FAILED',message:error.message}}};
      }
    }
    entry.result=structuredClone(result);
    await report('result',entry.command,{result:entry.result});
    entry.reported=true;
    if (endedTasks.has(entry.command.taskId) && ![...commands.values()].some(item=>item.command.taskId===entry.command.taskId && pending(item))) activeTask=null;
    return entry.result;
  }

  async function monitor(entry) {
    let job=api.getJob({jobId:entry.jobId});
    while (job.status==='queued' || job.status==='running') {
      if (now()>=entry.command.deadline*1000) return finish(entry,{status:'unknown',commitState:'unknown',error:{code:'JOB_TIMEOUT',message:'Inspect the original page job; do not replay'},pageJobId:entry.jobId,context:api.getState().context});
      if (!accepting && job.status==='queued') api.cancelJob({jobId:entry.jobId});
      await wait(250);
      job=api.getJob({jobId:entry.jobId});
    }
    return finish(entry,job.result || {status:job.status==='cancelled'?'failed':'unknown',error:{code:job.status==='cancelled'?'JOB_CANCELLED':'JOB_RESULT_UNAVAILABLE'},context:api.getState().context});
  }

  async function execute(entry) {
    const command=entry.command;
    try {
      if (!accepting || command.deadline*1000<=now()) throw failure('lease_revoked','Command expired or page control ended');
      if (endedTasks.has(command.taskId)) throw failure('task_ended','Task control has already ended');
      samePage();
      validatePayload(command.payload,binding,scopes);
      if (activeTask && command.taskId!==activeTask) throw failure('task_binding_mismatch','A different task still has running commands');
      activeTask=command.taskId;
      if (JOB_METHODS.has(command.payload.method)) {
        entry.jobId='wc_'+command.commandId;
        api.submit({jobId:entry.jobId,method:command.payload.method,args:command.payload.args});
        entry.submitted=true;
        await report('ack',command,{pageJobId:entry.jobId});
        return await monitor(entry);
      }
      await report('ack',command,{});
      return await finish(entry,await api.invoke(command.payload));
    } catch(error) {
      // A lost HTTP acknowledgement may follow a real page submit. Keep its
      // job handle rather than claiming that nothing committed or resubmitting.
      if (entry.submitted && !entry.result) {
        try { return await monitor(entry); } catch (_) { /* recover via retained entry */ }
        if(!entry.result)return finish(entry,{status:'unknown',commitState:'unknown',error:{code:error.code||'JOB_RESULT_UNAVAILABLE',message:error.message},pageJobId:entry.jobId,context:api.getState().context});
      }
      if (entry.result) throw error;
      return finish(entry,{status:'failed',commitState:'not_committed',error:{code:error.code||'HOST_FAILED',message:error.message},context:api.getState().context});
    }
  }

  function receive(command) {
    if (command.protocol!==PROTOCOL || command.cadSessionId!==session.cadSessionId || command.leaseEpoch!==session.leaseEpoch || !/^[a-f0-9]{32}$/.test(command.commandId||'') || typeof command.requestHash!=='string') throw failure('INSTANCE_MISMATCH','Invalid command envelope');
    const previous=commands.get(command.commandId);
    if (previous) {
      if (JSON.stringify(previous.command.payload)!==JSON.stringify(command.payload) || previous.command.requestHash!==command.requestHash) throw failure('idempotency_conflict','Command ID reused with a different payload');
      if (previous.result) return report('result',previous.command,{result:previous.result}).then(()=>{previous.reported=true;return previous.result;});
      return previous.promise;
    }
    if(commands.size>=100) throw failure('RESOURCE_LIMIT','100 adapter receipts; save and reconnect before more tasks');
    const entry={command:structuredClone(command)};
    commands.set(command.commandId,entry);
    entry.promise=tail.then(()=>execute(entry));
    tail=entry.promise.catch(()=>{});
    return entry.promise;
  }

  function endTask(taskId) {
    endedTasks.add(taskId);
    if (taskId!==activeTask) return;
    for(const entry of commands.values()) if (entry.command.taskId===taskId && entry.jobId && pending(entry)) {
      try { api.cancelJob({jobId:entry.jobId}); } catch (_) { /* state readback still required */ }
    }
    if (![...commands.values()].some(entry=>entry.command.taskId===taskId && pending(entry))) activeTask=null;
  }

  async function reconcilePending(){
    for(const entry of commands.values())if(entry.submitted && entry.result?.status==='unknown'){
      const job=api.getJob({jobId:entry.jobId});
      if(!['queued','running'].includes(job.status) && job.result && job.result.status!=='unknown')await finish(entry,job.result);
    }
  }

  return Object.freeze({receive,endTask,release(){accepting=false;endTask(activeTask);},
    reconcilePending,
    async retryReports(){await reconcilePending();for(const entry of commands.values())if(entry.result&&!entry.reported){await report('result',entry.command,{result:entry.result});entry.reported=true;}},
    state(){return {accepting,activeTask,pending:[...commands.values()].filter(pending).map(entry=>({commandId:entry.command.commandId,pageJobId:entry.jobId||null}))};},
    replay:async commandId=>{const entry=commands.get(commandId);if(!entry?.result)throw failure('receipt_unavailable','Original result not known');await report('result',entry.command,{result:entry.result});return entry.result;}});
}

