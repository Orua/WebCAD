import {PROTOCOL, JOB_METHODS, EXPORT_METHODS, editsDocument, assertIdentity, failure, validatePayload} from './protocol.js?v=command-lock-20261010';
import {withErrorRecovery} from '../error-recovery.js';
import {debugJournal,traceDebug} from '../debug-journal.js';

/** Host capability is injected. No model-provided code, origins, URLs or disk paths. */
export function createHostAdapter({api, session, report, artifact, onStateChange=()=>{}, now=()=>Date.now(), wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  if (!api?.connect || !api?.invoke || !api?.getState || typeof report!=='function') throw failure('host_unavailable','Current public page API and an authorized result channel required');
  const binding={...session.binding}, scopes=[...session.scopes];
  const log=(action,data,level='info')=>debugJournal.record('agent',action,{cadSessionId:session.cadSessionId,leaseEpoch:session.leaseEpoch,...data},level);
  const identity=command=>({commandId:command.commandId,taskId:command.taskId,method:command.payload?.method,requestHash:command.requestHash,deadline:command.deadline});
  log('adapter-created',{binding,scopes});
  let accepting=true, activeTask=null, tail=Promise.resolve();
  const commands=new Map();
  const archived=new Map();
  const endedTasks=new Set();
  const pending=entry=>!entry.result || entry.result.status==='unknown';
  const indexSteps=steps=>{const methods=new Map();const visit=items=>{for(const step of items||[]){if(step?.id&&step?.method)methods.set(step.id,step.method);visit(step?.args?.steps);}};visit(steps);return methods;};
  const samePage=()=>assertIdentity(api.getState().context,binding);
  samePage();

  function archiveFinished() {
    for(const [id,entry] of commands)if(endedTasks.has(entry.command.taskId)&&entry.reported&&!pending(entry)){
      archived.set(id,{requestHash:entry.command.requestHash,payload:JSON.stringify(entry.command.payload),taskId:entry.command.taskId});
      commands.delete(id);
    }
  }

  async function transfer(entry,result,method){
    if(result?.attachment?.status==='agent_write_verified'&&result.attachment.sha256===result.sha256&&result.attachment.size===result.size)return result;
    if (artifact && result?.status==='generated' && result.resourceId) {
      try {
        const bytes=await api.files.read({resourceId:result.resourceId,as:'bytes'});
        let attachment;
        for(let attempt=0;;attempt++){
          try{attachment=await artifact(entry.command,result,bytes);break;}
          catch(error){
            error.attempts=error.attempts||attempt+1;
            if(attempt>=2||error.attempts>=4||['HASH_MISMATCH','SIZE_LIMIT','ASSET_INVALID','CANCELLED'].includes(error.code)||[400,403,413].includes(error.status))throw error;
            await wait(300*2**attempt);
          }
        }
        result={...result,attachment};
        log('artifact-delivered',{...identity(entry.command),resourceId:result.resourceId,size:result.size,sha256:result.sha256,attachment});
        if(method==='files.save' && attachment?.status==='agent_write_verified' && attachment.size===result.size && attachment.sha256===result.sha256){
          try {
            result.saveConfirmation=await api.files.confirmWritten({resourceId:result.resourceId,size:attachment.size,sha256:attachment.sha256});
            log('save-confirmed',{...identity(entry.command),resourceId:result.resourceId,confirmation:result.saveConfirmation});
          } catch(error) {
            result.saveConfirmation={status:'failed',error:{code:error.code||'SAVE_CONFIRMATION_FAILED',message:error.message}};
          }
        }
      } catch(error) {
        result={...result,attachment:{status:'failed',error:{code:'ARTIFACT_TRANSFER_FAILED',cause:error.code,message:error.message,httpStatus:error.status??null,attempts:error.attempts??1}}};
      }
    }
    return result;
  }

  async function finish(entry, result) {
    if(result && typeof result==='object' && !result.status)result={status:'read',...result};
    if(result?.status!=='unknown')entry.editing=false;
    entry.resolveExecution?.();
    onStateChange();
    result=withErrorRecovery(await transferTree(entry,result,entry.command.payload.method));
    entry.result=structuredClone(result);
    log('command-result',{...identity(entry.command),pageJobId:entry.jobId,status:result?.status,commitState:result?.commitState,error:result?.error},['failed','unknown','partial'].includes(result?.status)?'error':'info');
    if(endedTasks.has(entry.command.taskId)&&![...commands.values()].some(item=>item!==entry&&item.command.taskId===entry.command.taskId&&pending(item)))activeTask=null;
    void sendResult(entry);
    return entry.result;
  }

  async function transferTree(entry,value,method){
    if(!value||typeof value!=='object')return value;
    if(ArrayBuffer.isView(value)||value instanceof ArrayBuffer||value instanceof Blob)return value;
    if(value.status==='generated'&&value.resourceId&&EXPORT_METHODS.has(method))return transfer(entry,value,method);
    if(Array.isArray(value)){const items=[];for(const item of value)items.push(await transferTree(entry,item,method));return items;}
    const output={...value};
    if(Array.isArray(value.results)){
      output.results=[];for(const item of value.results){
        const childMethod=entry.stepMethods.get(item?.id)||method;
        const transferred=item&&typeof item==='object'&&Object.hasOwn(item,'result')
          ?{...item,result:await transferTree(entry,item.result,childMethod)}:await transferTree(entry,item,childMethod);
        output.results.push(transferred);
      }
    }
    for(const [key,child]of Object.entries(value))if(key!=='results'&&child&&typeof child==='object')output[key]=await transferTree(entry,child,method);
    return output;
  }

  async function sendResult(entry){
    if(entry.reported)return true;
    if(entry.resultReportPromise)return entry.resultReportPromise;
    entry.resultReportPromise=(async()=>{
      try{await report('result',entry.command,{result:entry.result});entry.reported=true;entry.reportError=null;log('result-delivered',{...identity(entry.command),status:entry.result?.status});return true;}
      catch(error){entry.reportError={code:error.code||'RESULT_REPORT_FAILED',message:error.message};log('result-delivery-failed',{...identity(entry.command),error},'error');return false;}
      finally{entry.resultReportPromise=null;if(endedTasks.has(entry.command.taskId)&&![...commands.values()].some(item=>item.command.taskId===entry.command.taskId&&pending(item)))activeTask=null;archiveFinished();onStateChange();}
    })();
    return entry.resultReportPromise;
  }

  async function monitor(entry) {
    let job=api.getJob({jobId:entry.jobId});
    while (job.status==='queued' || job.status==='running') {
      if (now()>=entry.command.deadline*1000) return finish(entry,{status:'unknown',commitState:'unknown',error:{code:'JOB_TIMEOUT',message:'Inspect the original page job; do not replay'},pageJobId:entry.jobId,context:api.getState().context});
      if (!accepting && job.status==='queued') api.cancelJob({jobId:entry.jobId});
      // One bounded in-page long wait (50 ms local tick) instead of 250 ms polling.
      const budget=Math.floor(Math.max(0,Math.min(25000,entry.command.deadline*1000-now())));
      // Pushed completion (page-jobs awaitJob) first; older pages fall back to the bounded waitFor tick.
      if(typeof api.awaitJob==='function')await api.awaitJob({jobId:entry.jobId,timeoutMs:budget});
      else if(typeof api.waitFor==='function')await api.waitFor({jobId:entry.jobId,timeoutMs:Math.floor(Math.max(0,Math.min(25000,entry.command.deadline*1000-now())))});else await wait(250);
      job=api.getJob({jobId:entry.jobId});
    }
    return finish(entry,job.result || {status:job.status==='cancelled'?'failed':'unknown',error:{code:job.status==='cancelled'?'JOB_CANCELLED':'JOB_RESULT_UNAVAILABLE'},context:api.getState().context});
  }

  async function execute(entry) {
    const command=entry.command;
    log('command-dispatch',identity(command));
    try {
      if (!accepting) throw failure('lease_revoked','Host page control has ended before CAD dispatch');
      if (command.deadline*1000<=now()) throw failure('COMMAND_EXPIRED','Command deadline passed before CAD dispatch; no page job was submitted');
      if (endedTasks.has(command.taskId)) throw failure('task_ended','Task control has already ended');
      samePage();
      validatePayload(command.payload,binding,scopes);
      const recoverySave=command.payload.method==='files.save'||command.payload.method==='run'&&command.payload.args?.steps?.length===1&&command.payload.args.steps[0]?.method==='files.save';
      if (!recoverySave&&activeTask && command.taskId!==activeTask) throw failure('task_binding_mismatch','A different task still has running commands');
      if(!recoverySave)activeTask=command.taskId;
      entry.editing=editsDocument(command.payload);
      onStateChange();
      if (JOB_METHODS.has(command.payload.method)) {
        entry.jobId='wc_'+command.commandId;
        api.submit({jobId:entry.jobId,method:command.payload.method,args:command.payload.args});
        entry.submitted=true;
        log('page-job-submitted',{...identity(command),pageJobId:entry.jobId});
        await report('ack',command,{pageJobId:entry.jobId});
        log('command-acknowledged',{...identity(command),pageJobId:entry.jobId});
        return await monitor(entry);
      }
      await report('ack',command,{});
      log('command-acknowledged',identity(command));
      return await finish(entry,await api.invoke(command.payload));
    } catch(error) {
      log('command-dispatch-error',{...identity(command),submitted:!!entry.submitted,pageJobId:entry.jobId,error},'error');
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
    log('command-received',{...identity(command),binding:command.payload?.args?.context});
    if (command.protocol!==PROTOCOL || command.cadSessionId!==session.cadSessionId || command.leaseEpoch!==session.leaseEpoch || !/^[a-f0-9]{32}$/.test(command.commandId||'') || typeof command.requestHash!=='string') throw failure('INSTANCE_MISMATCH','Invalid command envelope');
    const previous=commands.get(command.commandId);
    const saved=archived.get(command.commandId);
    if(saved){
      if(saved.requestHash!==command.requestHash||saved.payload!==JSON.stringify(command.payload))throw failure('idempotency_conflict','Command ID reused with a different payload');
      return Promise.resolve({status:'already_reported',commandId:command.commandId});
    }
    if (previous) {
      if (JSON.stringify(previous.command.payload)!==JSON.stringify(command.payload) || previous.command.requestHash!==command.requestHash) throw failure('idempotency_conflict','Command ID reused with a different payload');
      if (previous.result) return sendResult(previous).then(()=>previous.result);
      return previous.promise;
    }
    const entry={command:structuredClone(command)};
    entry.stepMethods=indexSteps(command.payload?.args?.steps);
    const executionDone=new Promise(resolve=>{entry.resolveExecution=resolve;});
    commands.set(command.commandId,entry);
    const recoverySave=command.payload.method==='files.save'||command.payload.method==='run'&&command.payload.args?.steps?.length===1&&command.payload.args.steps[0]?.method==='files.save';
    if(recoverySave)entry.promise=execute(entry).finally(entry.resolveExecution);
    else {entry.promise=tail.then(()=>execute(entry)).finally(entry.resolveExecution);tail=executionDone;}
    return entry.promise;
  }

  function endTask(taskId) {
    log('task-ended',{taskId});
    endedTasks.add(taskId);
    archiveFinished();
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

  return Object.freeze({receive:command=>traceDebug('agent','command-receive',{commandId:command?.commandId,taskId:command?.taskId,method:command?.payload?.method},()=>receive(command)),endTask,release(){log('adapter-released',{activeTask});accepting=false;endTask(activeTask);},
    reconcilePending,
    async retryReports(){await reconcilePending();await Promise.all([...commands.values()].filter(entry=>entry.result&&!entry.reported).map(sendResult));archiveFinished();},
    state(){return {accepting,activeTask,editing:accepting&&[...commands.values()].some(entry=>entry.editing),pending:[...commands.values()].filter(entry=>pending(entry)||!entry.reported).map(entry=>({commandId:entry.command.commandId,pageJobId:entry.jobId||null,deliveryState:entry.reportError?'retry_pending':entry.result?.status==='unknown'?'unknown':'pending',error:entry.reportError||null}))};},
    replay:async commandId=>{const entry=commands.get(commandId);if(!entry?.result)throw failure('receipt_unavailable','Original result not known');await report('result',entry.command,{result:entry.result});return entry.result;}});
}

