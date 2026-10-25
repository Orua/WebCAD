// Host-only binary handoff. A persisted opening marker is never replayed.
export function createProjectOpenController({rpc,download,api,rebind,settled,journal,notice,onBusy=()=>{},quiesce=()=>{},onAuthRequired=()=>{}}){
  let running=false;
  const same=(a,b)=>['sessionId','documentId','documentInstanceId'].every(key=>a?.[key]===b?.[key]);
  const ready=state=>!state.summary?.busy&&state.summary?.kernelReady&&!state.preview?.active&&!state.preview?.computing;
  const dirty=state=>state.summary?.dirty===true||state.persistence?.dirty===true;
  const friendly=code=>({
    PROJECT_OPEN_CANCELED:'原任务已停止，已取消历史工程打开；当前工程保留。',
    PROJECT_TASK_FAILED:'原任务未正常完成，未打开历史工程；请先核对原任务和回执。',
    UNSAVED_REPLACEMENT:'当前工程有未保存修改，请先保存，再安排打开。',
    PROJECT_OPEN_BLOCKED:'当前工程身份、修订或计算状态已变化，未打开；请先核对当前工程。',
    ASSET_INVALID:'工程文件未能登记，当前工程保留；请核对宿主与绘图页面版本，再在新任务中安排打开。',
    ARTIFACT_SIZE_MISMATCH:'原文件大小不符，未打开；请核对原附件。',
    ARTIFACT_HASH_MISMATCH:'原文件校验不符，未打开；请核对原附件。',
    PROJECT_DOWNLOAD_FAILED:'原工程下载未完成，请保留当前工程并稍后核对原附件。'
  }[code]||'工程保留；打开未完成，请查看交接详情。');
  async function poll(sessionId){
    if(running||!sessionId)return;
    running=true;
    let statusRead=false;
    try{
      let record;
      try{record=await rpc(sessionId,{method:'status'});}catch(error){if(error.code==='project_open_not_found')return;throw error;}
      statusRead=true;
      if(['ready','failed'].includes(record.phase)){journal.clear();onBusy(false);if(record.phase==='failed')notice(friendly(record.errorCode));return;}
      onBusy(true);
      const prior=journal.read();
      if(['opening','unknown'].includes(record.phase)||prior?.handoffId===record.handoffId&&['opening','unknown'].includes(prior.phase)){
        notice('原工程打开结果待核对；保留交接记录，不会再次打开。');return;
      }
      if(record.phase==='opened_rebind_pending'){
        notice('工程已打开，正在恢复新工程助手连接。');
        const newSession=await rebind(record.newContext);
        await rpc(sessionId,{method:'update',handoffId:record.handoffId,phase:'ready',newSessionId:newSession.cadSessionId});
        journal.clear();onBusy(false);notice('历史工程已打开，已建立新对话和工程连接。');return;
      }
      journal.write({sessionId,handoffId:record.handoffId,phase:record.phase});
      if(!await settled()){notice('已安排历史工程打开；等待当前任务和原工具回执结束。');return;}
      let state=await api().getState();
      if(!ready(state)||!same(state.context,record.oldContext)||state.context.revision!==(record.oldContext.expectedRevision??record.oldContext.revision))throw Object.assign(Error('当前工程身份、修订或计算状态已变化，未打开历史工程。'),{code:'PROJECT_OPEN_BLOCKED'});
      if(dirty(state))throw Object.assign(Error('当前工程有未保存修改，请先保存；未打开历史工程。'),{code:'UNSAVED_REPLACEMENT'});
      const bytes=await download(sessionId,record.file);
      if(bytes.byteLength!==record.file.size)throw Object.assign(Error('原文件大小不符，未打开。'),{code:'ARTIFACT_SIZE_MISMATCH'});
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
      if(hash!==record.file.sha256)throw Object.assign(Error('原文件SHA256不符，未打开。'),{code:'ARTIFACT_HASH_MISMATCH'});
      state=await api().getState();
      if(!ready(state)||!same(state.context,record.oldContext)||state.context.revision!==(record.oldContext.expectedRevision??record.oldContext.revision)||dirty(state))throw Object.assign(Error('工程在下载期间发生变化，未打开。'),{code:'PROJECT_OPEN_BLOCKED'});
      journal.write({sessionId,handoffId:record.handoffId,phase:'claiming'});
      record=await rpc(sessionId,{method:'claim',handoffId:record.handoffId,context:state.context});
      if(record.phase!=='claimed'){
        if(record.phase==='failed'){journal.clear();onBusy(false);notice(friendly(record.errorCode));}
        return;
      }
      journal.write({sessionId,handoffId:record.handoffId,phase:'claimed'});
      await quiesce();
      const resource=await api().files.register({name:record.file.name,data:bytes,mime:'application/octet-stream'});
      const latest=await api().getState();
      if(!ready(latest)||!same(latest.context,state.context)||latest.context.revision!==state.context.revision||dirty(latest))throw Object.assign(Error('打开前工程发生变化，未替换。'),{code:'PROJECT_OPEN_BLOCKED'});
      journal.write({sessionId,handoffId:record.handoffId,phase:'opening'});
      await rpc(sessionId,{method:'update',handoffId:record.handoffId,phase:'opening'});
      // Do not put any retry around this invocation. Its outcome may be unknown.
      let result;
      try{
        result=await api().files.open({context:{sessionId:latest.context.sessionId,documentId:latest.context.documentId,documentInstanceId:latest.context.documentInstanceId,expectedRevision:latest.context.revision},resourceId:resource.resourceId,unsaved:'fail'});
      }catch(error){error.openInvoked=true;throw error;}
      const opened=await api().getState();
      if(result?.status!=='committed'||same(opened.context,latest.context))throw Object.assign(Error('打开回执尚未确认，请核对原请求。'),{code:'RESULT_UNKNOWN',openInvoked:true});
      journal.write({sessionId,handoffId:record.handoffId,phase:'opened_rebind_pending',newContext:opened.context});
      await rpc(sessionId,{method:'update',handoffId:record.handoffId,phase:'opened_rebind_pending',context:opened.context});
      const next=await rebind(opened.context);
      await rpc(sessionId,{method:'update',handoffId:record.handoffId,phase:'ready',newSessionId:next.cadSessionId});
      journal.clear();onBusy(false);notice('历史工程已打开，已建立新对话和工程连接。');
    }catch(error){
      if(error?.code==='login_required'||[401,403].includes(error?.status)){onAuthRequired(error);return;}
      const saved=journal.read();
      if(!statusRead||saved?.phase==='claiming'){
        notice('交接状态待核对；下次先读取原交接结果，不会解锁或打开工程。');return;
      }
      if(['project_task_pending','cad_receipt_pending'].includes(error.code)){notice('原任务或工具回执尚未确认，等待对账后再打开。');return;}
      const uncertain=error.openInvoked||['opening','unknown'].includes(saved?.phase);
      const phase=uncertain?'unknown':saved?.phase==='opened_rebind_pending'?'opened_rebind_pending':'failed';
      if(saved&&phase!=='opened_rebind_pending'){
        journal.write({...saved,phase,errorCode:error.code||'PROJECT_OPEN_FAILED'});
        try{await rpc(saved.sessionId,{method:'update',handoffId:saved.handoffId,phase,errorCode:/^[a-zA-Z0-9_-]{1,100}$/.test(error.code||'')?error.code:'PROJECT_OPEN_FAILED'});}catch{/* Preserve journal; no replay. */}
      }
      if(phase==='failed')onBusy(false);
      notice(uncertain?'原工程打开结果待核对，不会自动再次打开。':phase==='opened_rebind_pending'?'工程已打开，助手重绑定尚未完成；不会重开文件。':friendly(error.code));
    }finally{running=false;}
  }
  return {poll};
}
