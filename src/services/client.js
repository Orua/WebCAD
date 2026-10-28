import {getServicesConfig,getServicesCredential,normalizeServicesConfig,serviceError} from './settings.js';
import {binaryHash} from '../contracts/operation-schema.js';
import {debugJournal,traceDebug} from '../debug-journal.js';
export async function sha256(bytes){return binaryHash(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes)).slice(7);}

/** Body-size class for agent-readable timeout diagnostics (stable labels). */
export function servicesBodySizeClass(bytes=0){
 const n=Math.max(0,Number(bytes)||0);
 if(n<=0)return 'empty';
 if(n<64*1024)return 'small';
 if(n<1024*1024)return 'medium';
 if(n<5*1024*1024)return 'large';
 return 'xlarge';
}

/** Agent-readable Chinese message for Services timeout/disconnect (stable code SERVICES_CONNECTION_UNKNOWN). */
export function servicesConnectionTimeoutMessage({op,elapsedMs,timeoutMs,bytes=0,idempotencyKey}={}){
 const sizeClass=servicesBodySizeClass(bytes),body=Math.max(0,Number(bytes)||0);
 // Prefer route labels without a leading "/" so businessReason keeps the Chinese guidance.
 const label=String(op||'unknown').replace(/^\/+/, '');
 const key=idempotencyKey?`，请求/幂等键 ${idempotencyKey}`:'';
 return `SERVICES_CONNECTION_UNKNOWN：后台计算超时或断线，操作 ${label}，已用 ${Math.round(Number(elapsedMs)||0)}ms / 限时 ${Math.round(Number(timeoutMs)||0)}ms，请求体 ${sizeClass}（${body}B）${key}。先 getServicesRequest 查询，勿盲目重算。`;
}

/** Phase-specific Services HTTP timeouts (ms). Upload/result/submit scale with payload; submit floor matches serverWaitMs (180s). */
export function servicesRequestTimeoutMs(phase,{bytes=0}={}){
 const n=Math.max(0,Number(bytes)||0);
 if(phase==='upload')return Math.max(120000,Math.min(600000,120000+Math.ceil(n/1024)*25));
 if(phase==='result'||phase==='artifact')return Math.max(120000,Math.min(600000,120000+Math.ceil(n/1024)*15));
 // Live 2026-10-28: ~3MB POST /v1/compute/jobs aborted at client 30000 while upload already scaled (~209s).
 if(phase==='submit')return Math.max(180000,Math.min(600000,180000+Math.ceil(n/1024)*25));
 // Capabilities often 15–19s on goldenfu.cn; give headroom. Poll/cancel/recover aligned to 60s.
 if(phase==='capabilities'||phase==='poll'||phase==='cancel'||phase==='recover')return 60000;
 return 60000;
}

export function createServicesClient({config,credential,fetchImpl=globalThis.fetch,now=Date.now,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const read=()=>config?normalizeServicesConfig(config):getServicesConfig();
 let defaultWaitHandler=null;
 async function sendRequest(route,{method='GET',body,headers={},binary=false,timeoutMs,idempotencyKey}={}){
  const settings=read();if(!settings.enabled||!settings.url)throw serviceError('CAPABILITY_UNAVAILABLE','请先连接后台计算');
  let existing='';if(credential===undefined){const saved=getServicesConfig();if(settings.url===saved.url)existing=getServicesCredential();}
  const auth=credential??existing,siteSession=settings.authMode==='siteSession';if(!auth&&!siteSession)throw serviceError('SERVICES_AUTH_REQUIRED','请在“计算设置”连接后台计算');
  if(!/^\/v1\/[a-zA-Z0-9/_-]+$/.test(route))throw serviceError('PARAM_SCHEMA_INVALID','Services 路由无效');
  const url=new URL(settings.url);url.searchParams.set('route',route);let response;
  const bodyBytes=body?.byteLength??(typeof body==='string'?new TextEncoder().encode(body).length:body?.length??0);
  const limit=Number.isFinite(timeoutMs)&&timeoutMs>0?timeoutMs:60000;
  const began=now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),limit);
  try{response=await fetchImpl(url.href,{method,body,headers:{...headers,...(siteSession?{'X-WebCAD-Compute':'1'}:{Authorization:`Bearer ${auth}`})},redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal});}catch{clearTimeout(timer);const elapsedMs=Math.max(0,now()-began);throw serviceError('SERVICES_CONNECTION_UNKNOWN',servicesConnectionTimeoutMessage({op:route,elapsedMs,timeoutMs:limit,bytes:bodyBytes,idempotencyKey}),{observation:'unknown',op:route,elapsedMs,timeoutMs:limit,bodyBytes,bodySizeClass:servicesBodySizeClass(bodyBytes),...(idempotencyKey?{idempotencyKey}:{})});}
  try{
  if(!response.ok){let error;try{error=await response.json();}catch{}const fallback=response.status===404?'后台计算接口未找到，请核对当前计算地址':response.status===401?(siteSession?'同域计算版本尚未就绪，请核对 Services 发布':'计算端专用授权无效，请检查设置'):`后台计算请求失败（HTTP ${response.status}）`;throw serviceError(error?.code??'SERVICES_REQUEST_FAILED',error?.message??fallback,{httpStatus:response.status,supportBinding:error?.supportBinding,stage:error?.stage,diagnosticsRef:error?.diagnosticsRef,commitState:error?.commitState??error?.commit,recoveryAction:error?.recoveryAction});}
  return binary?new Uint8Array(await response.arrayBuffer()):await response.json();
  }finally{clearTimeout(timer);}
 }
 async function request(route,options={}){
  const bytes=options.body?.byteLength??(typeof options.body==='string'?options.body.length:options.body?.length??0);
  if(options.method===undefined&&/^\/v1\/jobs\/[^/]+$/.test(route)){
   try{return await sendRequest(route,options);}catch(error){debugJournal.record('services','poll-error',{route,error},'error');throw error;}
  }
  return traceDebug('services',route,{method:options.method||'GET',timeoutMs:options.timeoutMs,bytes},()=>sendRequest(route,options));
 }
 async function capabilities(){const value=await request('/v1/capabilities',{timeoutMs:servicesRequestTimeoutMs('capabilities')});if(value.protocolVersion!=='1.0'||!value.supportedClientProtocolRange?.includes('1.0'))throw serviceError('SERVICES_PROTOCOL_MISMATCH','Services 协议版本不兼容');return value;}
 async function handshake(){
  const challenge=globalThis.crypto.randomUUID().replaceAll('-',''),started=now();
  const value=await request('/v1/hello/'+challenge,{timeoutMs:5000});
  if(value.service!=='webcad-services'||value.protocolVersion!=='1.0'||value.handshakeVersion!==1||value.challenge!==challenge||value.authorized!==true)throw serviceError('SERVICES_PROTOCOL_MISMATCH','计算接口握手格式不匹配，请核对 Services 版本');
  return {status:'connected',protocolVersion:value.protocolVersion,gatewayBuildId:value.gatewayBuildId,elapsedMs:Math.max(0,now()-started)};
 }
 async function upload(file,{kind='logo'}={}){if(!['logo','brep','mesh','raster'].includes(kind)||file.size<1||file.size>(kind==='mesh'?128:20)*1024*1024)throw serviceError('SIZE_LIMIT','源资产超过当前 Services 的 20 MiB 输入上限');const bytes=new Uint8Array(await file.arrayBuffer()),hash=await sha256(bytes),asset=await request('/v1/assets',{method:'POST',body:bytes,headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name),'X-Asset-Kind':kind},timeoutMs:servicesRequestTimeoutMs('upload',{bytes:bytes.length})});if(asset.sha256!==hash||asset.bytes!==bytes.length)throw serviceError('ARTIFACT_CORRUPT','上传源文件哈希不一致');return asset;}
 async function submit(kind,payload,idempotencyKey){if(!['logo/inspect','logo/convert','compute/jobs'].includes(kind)||!idempotencyKey)throw serviceError('PARAM_SCHEMA_INVALID','请使用明确任务与幂等键');const body=JSON.stringify(payload);try{return await request(`/v1/${kind}`,{method:'POST',body,headers:{'Content-Type':'application/json','Idempotency-Key':idempotencyKey},timeoutMs:servicesRequestTimeoutMs('submit',{bytes:body.length}),idempotencyKey});}catch(error){error.idempotencyKey=idempotencyKey;if(error.code==='SERVICES_CONNECTION_UNKNOWN'&&!String(error.message||'').includes('getServicesRequest'))error.message=servicesConnectionTimeoutMessage({op:`v1/${kind}`,elapsedMs:error.elapsedMs,timeoutMs:error.timeoutMs,bytes:error.bodyBytes??body.length,idempotencyKey});throw error;}}
 const cancelJob=jobId=>request("/v1/jobs/"+jobId+"/cancel",{method:"POST",timeoutMs:servicesRequestTimeoutMs('cancel')});
 const getJob=jobId=>request(`/v1/jobs/${jobId}`,{timeoutMs:servicesRequestTimeoutMs('poll')});
 async function durableGetJob(jobId,{retries=6}={}){
  let last;
  for(let i=0;i<retries;i++){
   try{return await getJob(jobId);}catch(error){
    last=error;
    if(error?.code!=='SERVICES_CONNECTION_UNKNOWN'||i===retries-1)throw error;
    await delay(Math.min(2000,250*(i+1)));
   }
  }
  throw last;
 }
 async function wait(job,{signal,onWaitTimeout=defaultWaitHandler,waitTimeoutMs=read().serverWaitMs,pollIntervalMs=250}={}){
  if(!Number.isInteger(waitTimeoutMs)||waitTimeoutMs<1||waitTimeoutMs>900000)throw serviceError('PARAM_SCHEMA_INVALID','等待提醒时间无效');
  const began=now();let reminderAt=began,current=job,lastPhase='';
  while(['queued','running'].includes(current.execution)){
   const phase=String(current.execution)+':'+String(current.stage??'');if(phase!==lastPhase){lastPhase=phase;debugJournal.record('services','job-phase',{jobId:current.jobId,execution:current.execution,stage:current.stage,elapsedMs:now()-began});}
   if(signal?.aborted)throw serviceError('OBSERVATION_CANCELLED','已停止等待，任务须另行查询',{jobId:job.jobId,idempotencyKey:job.requestKey,commitState:'unknown'});
   if(now()-reminderAt>=waitTimeoutMs){
    if(!onWaitTimeout)throw serviceError('SERVICES_WAIT_DECISION_REQUIRED','任务仍在进行，请选择继续等待或停止运算',{jobId:job.jobId,idempotencyKey:job.requestKey,commitState:'unknown',requiresDecision:true,execution:current.execution});
    const decision=await onWaitTimeout({jobId:job.jobId,requestKey:job.requestKey,elapsedMs:now()-began,execution:current.execution});
    if(decision==='continue')reminderAt=now();
    else if(decision==='stop'){
     try{await cancelJob(job.jobId);const stopAt=now();let stopped=await durableGetJob(job.jobId);while(['queued','running'].includes(stopped.execution)&&now()-stopAt<10000){await delay(250);stopped=await durableGetJob(job.jobId);}if(['queued','running'].includes(stopped.execution))throw serviceError('SERVICES_CONNECTION_UNKNOWN','已请求停止，但终止结果仍需核对');throw serviceError('SERVICES_JOB_CANCELLED','已停止本次操作，当前工程保留',{jobId:job.jobId,idempotencyKey:job.requestKey,execution:stopped.execution,commitState:'notCommitted'});}catch(error){error.jobId=job.jobId;error.idempotencyKey=job.requestKey;if(error.code!=='SERVICES_JOB_CANCELLED')error.commitState='unknown';throw error;}
    }else throw serviceError('PARAM_SCHEMA_INVALID','等待决定必须为 continue 或 stop');
   }
   await delay(pollIntervalMs);
   try{current=await durableGetJob(job.jobId);}catch(error){
    // Connection blip after a known jobId: try request-key recovery before declaring unknown.
    if(job.requestKey&&error?.code==='SERVICES_CONNECTION_UNKNOWN'){
     try{const receipt=await request(`/v1/requests/${job.requestKey}`,{timeoutMs:servicesRequestTimeoutMs('poll')});
      if(receipt?.jobId){current=await durableGetJob(receipt.jobId);continue;}
     }catch{/* fall through */}
    }
    error.jobId=job.jobId;error.idempotencyKey=job.requestKey;error.commitState='unknown';throw error;
   }
  }
  debugJournal.record('services','job-finished',{jobId:current.jobId,execution:current.execution,elapsedMs:now()-began,error:current.error},current.execution==='succeeded'?'info':'error');
  if(current.execution!=='succeeded'){
   const failure=current.error??{},stage=failure.stage??current.stage;
   const code=failure.code??'SERVICES_JOB_FAILED',commitState=failure.commitState??failure.commit??current.commit??'notCommitted';
   throw serviceError(code,failure.message??`任务状态 ${current.execution}`,{job:current,jobId:current.jobId,idempotencyKey:job.requestKey,details:{...(failure.details||{}),serviceMessage:failure.message??null,execution:current.execution},supportBinding:failure.supportBinding,stage,diagnosticsRef:failure.diagnosticsRef,commitState,recoveryAction:failure.recoveryAction});
  }
  const manifest=await request(job.requestKey?`/v1/requests/${job.requestKey}/result`:`/v1/jobs/${job.jobId}/result`,{timeoutMs:servicesRequestTimeoutMs('result')});if(manifest.jobId!==job.jobId||manifest.inputFingerprint!==job.inputFingerprint)throw serviceError('RESULT_MISMATCH','任务结果指纹不一致');
  if(job.requestBinding&&JSON.stringify(manifest.requestBinding)!==JSON.stringify(job.requestBinding))throw serviceError('RESULT_MISMATCH','服务未返回对应请求的安装绑定');
  if(manifest.geometryArtifact){const artifact=manifest.geometryArtifact,geometryBytes=await request(`/v1/artifacts/${artifact.artifactId}`,{binary:true,timeoutMs:servicesRequestTimeoutMs('artifact',{bytes:artifact.bytes||0})});if(geometryBytes.length!==artifact.bytes||await sha256(geometryBytes)!==artifact.sha256)throw serviceError('ARTIFACT_CORRUPT','精确结果完整性失败');return {manifest,geometryBytes};}
  if(manifest.gridArtifact){const a=manifest.gridArtifact,bytes=await request(`/v1/artifacts/${a.artifactId}`,{binary:true,timeoutMs:servicesRequestTimeoutMs('artifact',{bytes:a.bytes||0})});if(bytes.length!==a.bytes||await sha256(bytes)!==a.sha256)throw serviceError('ARTIFACT_CORRUPT','高度网格产物校验失败');return {manifest,result:JSON.parse(new TextDecoder().decode(bytes))};}
  const bytes=await request(`/v1/artifacts/${manifest.artifactId}`,{binary:true,timeoutMs:servicesRequestTimeoutMs('artifact',{bytes:manifest.bytes||0})});if(bytes.length!==manifest.bytes||await sha256(bytes)!==manifest.artifactSha256)throw serviceError('ARTIFACT_CORRUPT','结果产物校验失败');return {manifest,result:JSON.parse(new TextDecoder().decode(bytes))};
 }
 return {setWaitHandler:handler=>{if(handler!==null&&typeof handler!=="function")throw serviceError("PARAM_SCHEMA_INVALID","Wait handler must be a function");defaultWaitHandler=handler;},handshake,capabilities,upload,submit,getJob,wait,getRequest:key=>request(`/v1/requests/${key}`,{timeoutMs:servicesRequestTimeoutMs('poll')}),cancelJob:jobId=>request(`/v1/jobs/${jobId}/cancel`,{method:'POST',timeoutMs:servicesRequestTimeoutMs('cancel')}),recoverJob:(jobId,approval,idempotencyKey)=>request(`/v1/jobs/${jobId}/recover`,{method:'POST',body:JSON.stringify(approval),headers:{'Content-Type':'application/json','Idempotency-Key':idempotencyKey},timeoutMs:servicesRequestTimeoutMs('recover')})};
}
export const servicesClient=createServicesClient();
