import {getServicesConfig,getServicesCredential,normalizeServicesConfig,serviceError} from './settings.js';
export async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
export function createServicesClient({config,credential,fetchImpl=globalThis.fetch,now=Date.now,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const read=()=>config?normalizeServicesConfig(config):getServicesConfig();
 let defaultWaitHandler=null;
 async function request(route,{method='GET',body,headers={},binary=false}={}){
  const settings=read();if(!settings.enabled||!settings.url)throw serviceError('CAPABILITY_UNAVAILABLE','请先配置 Services');
  let existing='';if(credential===undefined){const saved=getServicesConfig();if(settings.url===saved.url)existing=getServicesCredential();}
  const auth=credential??existing;if(!auth)throw serviceError('SERVICES_AUTH_REQUIRED','请在 Services 设置中授权');
  if(!/^\/v1\/[a-zA-Z0-9/_-]+$/.test(route))throw serviceError('PARAM_SCHEMA_INVALID','Services 路由无效');
  const url=new URL(settings.url);url.searchParams.set('route',route);let response;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{response=await fetchImpl(url.href,{method,body,headers:{...headers,Authorization:`Bearer ${auth}`},redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal});}catch{clearTimeout(timer);throw serviceError('SERVICES_CONNECTION_UNKNOWN','服务连接中断或请求超时；任务结果未知，先查询既有任务，勿重复计算',{observation:'unknown'});}
  try{
  if(!response.ok){let error;try{error=await response.json();}catch{}throw serviceError(error?.code??'SERVICES_REQUEST_FAILED',error?.message??`Services HTTP ${response.status}`,{httpStatus:response.status,supportBinding:error?.supportBinding,stage:error?.stage,diagnosticsRef:error?.diagnosticsRef,commitState:error?.commitState??error?.commit,recoveryAction:error?.recoveryAction});}
  return binary?new Uint8Array(await response.arrayBuffer()):await response.json();
  }finally{clearTimeout(timer);}
 }
 async function capabilities(){const value=await request('/v1/capabilities');if(value.protocolVersion!=='1.0'||!value.supportedClientProtocolRange?.includes('1.0'))throw serviceError('SERVICES_PROTOCOL_MISMATCH','Services 协议版本不兼容');return value;}
 async function upload(file,{kind='logo'}={}){if(!['logo','brep'].includes(kind)||file.size<1||file.size>20*1024*1024)throw serviceError('SIZE_LIMIT','源资产超过当前 Services 的 20 MiB 输入上限');const bytes=new Uint8Array(await file.arrayBuffer()),hash=await sha256(bytes),asset=await request('/v1/assets',{method:'POST',body:bytes,headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name),'X-Asset-Kind':kind}});if(asset.sha256!==hash||asset.bytes!==bytes.length)throw serviceError('ARTIFACT_CORRUPT','上传源文件哈希不一致');return asset;}
 async function submit(kind,payload,idempotencyKey){if(!['logo/inspect','logo/convert','compute/jobs'].includes(kind)||!idempotencyKey)throw serviceError('PARAM_SCHEMA_INVALID','请使用明确任务与幂等键');try{return await request(`/v1/${kind}`,{method:'POST',body:JSON.stringify(payload),headers:{'Content-Type':'application/json','Idempotency-Key':idempotencyKey}});}catch(error){error.idempotencyKey=idempotencyKey;throw error;}}
 const cancelJob=jobId=>request("/v1/jobs/"+jobId+"/cancel",{method:"POST"});
 const getJob=jobId=>request(`/v1/jobs/${jobId}`);
 async function wait(job,{signal,onWaitTimeout=defaultWaitHandler,waitTimeoutMs=read().serverWaitMs,pollIntervalMs=250}={}){
  if(!Number.isInteger(waitTimeoutMs)||waitTimeoutMs<1||waitTimeoutMs>900000)throw serviceError('PARAM_SCHEMA_INVALID','等待提醒时间无效');
  const began=now();let reminderAt=began,current=job;
  while(['queued','running'].includes(current.execution)){
   if(signal?.aborted)throw serviceError('OBSERVATION_CANCELLED','已停止等待，任务须另行查询',{jobId:job.jobId,idempotencyKey:job.requestKey,commitState:'unknown'});
   if(now()-reminderAt>=waitTimeoutMs){
    if(!onWaitTimeout)throw serviceError('SERVICES_WAIT_DECISION_REQUIRED','任务仍在进行，请选择继续等待或停止运算',{jobId:job.jobId,idempotencyKey:job.requestKey,commitState:'unknown',requiresDecision:true,execution:current.execution});
    const decision=await onWaitTimeout({jobId:job.jobId,requestKey:job.requestKey,elapsedMs:now()-began,execution:current.execution});
    if(decision==='continue')reminderAt=now();
    else if(decision==='stop'){
     try{await cancelJob(job.jobId);const stopAt=now();let stopped=await getJob(job.jobId);while(['queued','running'].includes(stopped.execution)&&now()-stopAt<10000){await delay(250);stopped=await getJob(job.jobId);}if(['queued','running'].includes(stopped.execution))throw serviceError('SERVICES_CONNECTION_UNKNOWN','已请求停止，但终止结果仍需核对');throw serviceError('SERVICES_JOB_CANCELLED','已停止本次操作，当前工程保留',{jobId:job.jobId,idempotencyKey:job.requestKey,execution:stopped.execution,commitState:'notCommitted'});}catch(error){error.jobId=job.jobId;error.idempotencyKey=job.requestKey;if(error.code!=='SERVICES_JOB_CANCELLED')error.commitState='unknown';throw error;}
    }else throw serviceError('PARAM_SCHEMA_INVALID','等待决定必须为 continue 或 stop');
   }
   await delay(pollIntervalMs);try{current=await getJob(job.jobId);}catch(error){error.jobId=job.jobId;error.idempotencyKey=job.requestKey;error.commitState='unknown';throw error;}
  }
  if(current.execution!=='succeeded'){
   const failure=current.error??{},stage=failure.stage??current.stage;
   const code=failure.code??'SERVICES_JOB_FAILED',commitState=failure.commitState??failure.commit??current.commit??'notCommitted';
   throw serviceError(code,`${failure.message??`任务状态 ${current.execution}`}（${code}，jobId: ${current.jobId}${stage?`，阶段: ${stage}`:''}，提交: ${commitState}${failure.diagnosticsRef?`，诊断: ${failure.diagnosticsRef}`:''}）`,{job:current,jobId:current.jobId,supportBinding:failure.supportBinding,stage,diagnosticsRef:failure.diagnosticsRef,commitState,recoveryAction:failure.recoveryAction});
  }
  const manifest=await request(job.requestKey?`/v1/requests/${job.requestKey}/result`:`/v1/jobs/${job.jobId}/result`);if(manifest.jobId!==job.jobId||manifest.inputFingerprint!==job.inputFingerprint)throw serviceError('RESULT_MISMATCH','任务结果指纹不一致');
  if(job.requestBinding&&JSON.stringify(manifest.requestBinding)!==JSON.stringify(job.requestBinding))throw serviceError('RESULT_MISMATCH','服务未返回对应请求的安装绑定');
  if(manifest.geometryArtifact){const artifact=manifest.geometryArtifact,geometryBytes=await request(`/v1/artifacts/${artifact.artifactId}`,{binary:true});if(geometryBytes.length!==artifact.bytes||await sha256(geometryBytes)!==artifact.sha256)throw serviceError('ARTIFACT_CORRUPT','精确结果完整性失败');return {manifest,geometryBytes};}
  const bytes=await request(`/v1/artifacts/${manifest.artifactId}`,{binary:true});if(bytes.length!==manifest.bytes||await sha256(bytes)!==manifest.artifactSha256)throw serviceError('ARTIFACT_CORRUPT','结果产物校验失败');return {manifest,result:JSON.parse(new TextDecoder().decode(bytes))};
 }
 return {setWaitHandler:handler=>{if(handler!==null&&typeof handler!=="function")throw serviceError("PARAM_SCHEMA_INVALID","Wait handler must be a function");defaultWaitHandler=handler;},capabilities,upload,submit,getJob,wait,getRequest:key=>request(`/v1/requests/${key}`),cancelJob:jobId=>request(`/v1/jobs/${jobId}/cancel`,{method:'POST'}),recoverJob:(jobId,approval,idempotencyKey)=>request(`/v1/jobs/${jobId}/recover`,{method:'POST',body:JSON.stringify(approval),headers:{'Content-Type':'application/json','Idempotency-Key':idempotencyKey}})};
}
export const servicesClient=createServicesClient();
