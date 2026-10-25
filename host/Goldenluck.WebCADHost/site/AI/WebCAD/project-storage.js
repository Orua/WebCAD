// Native host checkpointing: bytes bypass the model and stay owner/conversation scoped.
export function createProjectStorage({api,binding,upload,info,download,settled,notice,status=()=>{},copyBytes=bytes=>bytes,hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')}){
  let saving=false,restoring=false,chain=Promise.resolve();
  const saved=new Set();
  const checkpoints=new Map();
  let lastCheckpoint=null;
  const report=(state,reason,context)=>status({status:state,reason,context,lastCheckpoint});
  const same=(a,b)=>['sessionId','documentId','documentInstanceId','revision'].every(k=>a?.[k]===b?.[k]);
  const context=s=>({sessionId:s.context.sessionId,documentId:s.context.documentId,documentInstanceId:s.context.documentInstanceId,expectedRevision:s.context.revision});
  const ready=s=>s.summary?.kernelReady&&!s.summary?.busy&&!s.preview?.active&&!s.preview?.computing;
  const fail=(message)=>{throw Object.assign(Error(message),{code:'PROJECT_STORE_BLOCKED'});};
  async function transfer(descriptor,kind,taskId,bound,state){
    const bytes=await api().files.read({resourceId:descriptor.resourceId,as:'bytes'});
    if(bytes.byteLength!==descriptor.size)fail('过程文件大小不符，未暂存。');
    if(binding()!==bound||!same(state.context,(await api().getState()).context))fail('工程已变化，未将文件记入其他工程。');
    const result=await upload(bound,{name:descriptor.name,sha256:descriptor.sha256,kind,revision:state.context.revision,taskId:taskId||''},bytes);
    if(result.status!=='agent_write_verified'||result.sha256!==descriptor.sha256||result.size!==bytes.byteLength)fail('Agent 文件回执不一致。');
    return result;
  }
  function stage(descriptor){
    if(saving||restoring||!binding()?.projectStorage||!/\.(svg|dxf|dwg|png|jpe?g|webp|pdf|json|step|stp|stl|brep)$/i.test(descriptor?.name||''))return Promise.resolve();
    const bound=binding(),key=bound.conversationId+':'+descriptor.sha256+':'+descriptor.name;
    if(saved.has(key))return Promise.resolve();
    const operation=chain.catch(()=>{}).then(async()=>{
      if(binding()!==bound||saved.has(key))return;
      const state=await api().getState();
      if(descriptor.context&&!['documentId','documentInstanceId'].every(k=>descriptor.context[k]===state.context[k]))fail('过程文件属于旧工程，未归档。');
      await transfer(descriptor,'artifact',null,bound,state);saved.add(key);
    });
    chain=operation;return operation;
  }
  async function checkpoint(taskId){
    const state=await api().getState(),bound=binding();
    const key=[bound?.conversationId,taskId,state.context.documentId,state.context.documentInstanceId,state.context.revision].join(':');
    if(lastCheckpoint&&lastCheckpoint.conversationId===bound?.conversationId&&same(lastCheckpoint.context,state.context)){report('saved',null,state.context);return lastCheckpoint;}
    if(!taskId)return saveCheckpoint(taskId);
    if(checkpoints.has(key))return checkpoints.get(key);
    const operation=saveCheckpoint(taskId).catch(error=>{checkpoints.delete(key);report('failed',error.message,state.context);throw error;});
    checkpoints.set(key,operation);return operation;
  }
  async function saveCheckpoint(taskId){
    if(!binding()?.projectStorage){report('unavailable','当前连接未提供工程暂存');return;}
    if(saving||restoring)fail('项目存储正在处理，请稍候。');
    saving=true;let descriptor;
    try{
      await chain.catch(()=>{});
      const bound=binding(),state=await api().getState();
      report('saving',null,state.context);
      if(!ready(state)||!settled())fail('当前计算或写入回执尚未完成，未生成恢复点。');
      descriptor=await api().files.save({context:context(state),name:'checkpoint.webcad'});
      const result=await transfer(descriptor,'checkpoint',taskId,bound,state);
      lastCheckpoint={...result,context:state.context,conversationId:bound.conversationId};
      if(binding()!==bound||!same(state.context,(await api().getState()).context))fail('恢复点已存盘，但工程继续发生变化，未标记当前工程已保存。');
      await api().files.confirmWritten({resourceId:descriptor.resourceId,size:result.size,sha256:result.sha256});
      report('saved',null,state.context);
      return result;
    }finally{if(descriptor)try{await api().files.release({resourceId:descriptor.resourceId});}catch{}saving=false;}
  }
  async function restore(conversationId,beforeOpen){
    const manifest=await info(conversationId),file=manifest.checkpoint;
    if(!file)return false;
    if(saving||restoring||!settled())fail('原任务或文件尚未结束，未恢复工程。');
    restoring=true;let resource;
    try{
      const initial=await api().getState();
      if(!ready(initial)||initial.summary?.dirty||initial.persistence?.dirty)fail('当前工程有未保存内容或正在计算，请先保存后再载入历史工程。');
      const bytes=await download(conversationId,file.fileId);
      if(bytes.byteLength!==file.sizeBytes||await hash(bytes)!==file.sha256)fail('恢复文件校验失败，当前工程保留。');
      const latest=await api().getState();
      if(!same(initial.context,latest.context)||!ready(latest)||latest.summary?.dirty||latest.persistence?.dirty||!settled())fail('工程在下载期间发生变化，未替换。');
      await beforeOpen();
      resource=await api().files.register({name:file.name,data:copyBytes(bytes),mime:'application/octet-stream'});
      const final=await api().getState();
      if(!same(initial.context,final.context)||!ready(final))fail('打开前工程已变化。');
      // Never retry an open: it may already have changed the document.
      const receipt=await api().files.open({context:context(final),resourceId:resource.resourceId,unsaved:'fail'});
      if(receipt?.status!=='committed')fail('恢复回执未确认，请核对当前画布，不会自动重开。');
      notice('已从 Agent 项目目录恢复本对话最后保存的工程。');return true;
    }finally{if(resource)try{await api().files.release({resourceId:resource.resourceId});}catch{}restoring=false;}
  }
  return {stage,checkpoint,restore,busy:()=>saving||restoring};
}
