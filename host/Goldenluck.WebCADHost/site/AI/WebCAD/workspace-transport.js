// Transport recovery never resubmits a CAD command or replaces its page binding.
export function historyUserText(value){
  const text=String(value??'').split('\n\n位置引用（世界坐标mm，显示表面近似拾取；精确加工前按当前修订查询几何）：\n')[0],marker='\n\n【当前用户请求】\n';
  if(!text.startsWith('原生宿主模式：页面已绑定，不要调用 webcad_connect'))return text;
  const offset=text.indexOf(marker);
  return offset<0?text:text.slice(offset+marker.length);
}
// Cross-project conversation isolation (UP-01/06/34). A conversation stays bound
// to the document it was attached for; the Agent rejects reuse on another
// document and that ownership check is never relaxed here. When the page opens
// another project, the panel forgets the previous selection and asks for a new
// conversation instead of sending the old conversationId.
export const PROJECT_SWITCH_NOTICE='已切换工程，已新建对话（画布保留）';
export const FOREIGN_CONVERSATION_NOTICE='原对话不属于当前工程，已新建对话（画布保留）';
export const PROJECT_REOPEN_NOTICE='工程已重新打开，已新建对话（画布保留）';
export function documentKey(context){
  return context&&typeof context.documentId==='string'&&typeof context.documentInstanceId==='string'?context.documentId+'\n'+context.documentInstanceId:null;
}
// A remembered conversation is reused only for the exact document identity it
// was attached for. An unknown current identity is treated as a switch (strict
// isolation). reopened=true means the same documentId with a new instance.
export function planConversation({desiredConversation=null,conversationDocument=null,context=null,explicit=false,startNew=false}={}){
  if(startNew)return {conversationId:null,newConversation:true,switched:false,reopened:false,explicit:false};
  if(!desiredConversation)return {conversationId:null,newConversation:false,switched:false,reopened:false,explicit:false};
  if(explicit)return {conversationId:desiredConversation,newConversation:false,switched:false,reopened:false,explicit:true};
  const current=documentKey(context);
  if(conversationDocument&&conversationDocument!==current){
    const reopened=Boolean(current)&&conversationDocument.split('\n')[0]===current.split('\n')[0];
    return {conversationId:null,newConversation:true,switched:true,reopened,explicit:false};
  }
  return {conversationId:desiredConversation,newConversation:false,switched:false,reopened:false,explicit:false};
}
// Reconnect before a send only when both identities are known and differ;
// a missing identity on either side never triggers a reconnect loop.
export function documentChanged(pageContext,binding){
  const page=documentKey(pageContext),bound=documentKey(binding);
  return Boolean(page&&bound&&page!==bound);
}
// Agent refusals that mean "this conversation is not usable for the current
// document". Only an implicitly remembered selection may be replaced by a new
// conversation; an explicit history choice reports the refusal instead.
export function isForeignConversationError(error){
  return error?.code==='CONVERSATION_DOCUMENT_CHANGED'||(error?.code==='session_not_found'&&error?.status===404);
}
export async function readGatewayJson(response) {
  const raw=await response.text();
  let value;
  try { value=JSON.parse(raw); }
  catch {
    const login=response.status===401 || /\/Login\.aspx(?:[?#]|$)/i.test(response.url||'');
    throw Object.assign(new Error(login?'登录已过期，请重新登录后回到此页面；当前模型保留':'连接暂时中断，服务未返回有效数据'),{code:login?'login_required':'gateway_response_invalid',status:response.status});
  }
  if(!response.ok){
    const detail=value?.error || (typeof value?.detail==='object'?value.detail:{});
    throw Object.assign(new Error(detail.message || detail.code || (typeof value?.detail==='string'?value.detail:null) || '连接请求失败'),{code:response.status===401?'login_required':detail.code||'gateway_error',status:response.status,...(detail.requestId?{requestId:detail.requestId}:{})});
  }
  return value;
}

export async function gatewayFetch(fetcher,url,options,timeoutMs=35000) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try { return await readGatewayJson(await fetcher(url,{...options,signal:controller.signal})); }
  catch(error){
    if(controller.signal.aborted)throw Object.assign(new Error('连接响应超时，正在核对原请求'),{code:'request_timeout'});
    if(error instanceof TypeError)throw Object.assign(new Error('网络连接中断，正在恢复'),{code:'network_error'});
    throw error;
  } finally { clearTimeout(timer); }
}

export function isTransportError(error){
  return error instanceof TypeError || ['network_error','request_timeout','gateway_response_invalid','login_required','stream_unavailable','cad_agent_unavailable'].includes(error?.code) || error?.status>=500 || [401,403].includes(error?.status);
}

export function isModelSelectionError(error){return ['model_unavailable','model_forbidden','MODEL_SELECTION_REQUIRED'].includes(error?.code);}
export function modelSelectionMessage(error,{taskKnown=false,unresolved=false}={}){
  const reason=error?.code==='model_forbidden'?'当前账号无权使用所选模型。':error?.code==='model_unavailable'?'所选模型当前不可用。':'请先选择当前列表中的可用模型。';
  return reason+(taskKnown?'原任务已创建，请先核对原任务；不会更换其模型或自动重发。':unresolved?'原请求结果尚待核对，请保留原发送标识，不要更换模型重发。':'本次请求尚未创建任务，请刷新模型列表并明确选择后再次发送。')+'输入和当前工程已保留。';
}
export function modelCatalogPlan(data,previousModel='',{initial=false}={}){
  if(!Array.isArray(data?.models))throw Object.assign(new Error('模型列表暂时读取失败，请刷新后再选择。'),{code:'models_unavailable'});
  const models=[...new Map(data.models.filter(model=>typeof model?.id==='string'&&model.id).map(model=>[model.id,{id:model.id}])).values()];
  const ids=new Set(models.map(model=>model.id));
  const selected=ids.has(previousModel)?previousModel:initial&&!previousModel&&ids.has(data.defaultModel)?data.defaultModel:'';
  return {models,selected,placeholder:models.length?(previousModel&&!ids.has(previousModel)?'原模型不可用，请重新选择':'请选择可用模型'):'当前账号暂无可用模型'};
}

// Uses the existing authenticated gateway; geometry is never regenerated here.
export async function uploadHostArtifact({bytes,descriptor,post,onProgress=()=>{},wait=ms=>new Promise(r=>setTimeout(r,ms))}){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',value))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const sha256=await digest(bytes);
  if(sha256!==descriptor.sha256)throw Object.assign(new Error('文件摘要与生成回执不一致'),{code:'HASH_MISMATCH'});
  const retry=async operation=>{for(let attempt=0;;attempt++)try{return await operation();}catch(error){error.attempts=attempt+1;if(attempt>=3||['HASH_MISMATCH','SIZE_LIMIT','ASSET_INVALID'].includes(error.code)||[400,403,413].includes(error.status))throw error;await wait(300*2**attempt);}};
  const chunkBytes=4*1024*1024;
  if(bytes.length<=chunkBytes)return retry(()=>post('artifact',{name:descriptor.name,sha256},bytes));
  const session=await retry(()=>post('artifact-upload-start',{name:descriptor.name,sha256,size:bytes.length,chunkBytes}));
  const received=new Set(session.received||[]),total=Math.ceil(bytes.length/chunkBytes);let cursor=0,done=received.size;
  const worker=async()=>{while(cursor<total){const index=cursor++;if(received.has(index))continue;const chunk=bytes.subarray(index*chunkBytes,Math.min(bytes.length,(index+1)*chunkBytes));await retry(async()=>post('artifact-upload-chunk',{uploadId:session.uploadId,index,sha256:await digest(chunk)},chunk));onProgress({done:++done,total});}};
  await Promise.all([worker(),worker()]);
  return retry(()=>post('artifact-upload-complete',{uploadId:session.uploadId}));
}

export function createRecoveryLoop({recover,onIssue=()=>{},onExhausted=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now,maxMs=60000,maxAttempts=6}) {
  let timer=null,running=false,again=false,attempt=0,generation=0,lastError,started=null,failed=false,deadlineTimer=null;
  const reset=()=>{generation++;if(timer!==null)clearTimer(timer);clearTimeout(deadlineTimer);deadlineTimer=null;timer=null;again=false;attempt=0;started=null;failed=false;};
  const exhaust=error=>{if(failed)return;failed=true;generation++;if(timer!==null)clearTimer(timer);clearTimeout(deadlineTimer);timer=null;again=false;onExhausted(error||Object.assign(new Error('连接恢复已达上限，请重新连接；当前画布和原回执已保留。'),{code:'recover_timeout'}));};
  function schedule(error,{immediate=false}={}){
    if(failed)return;
    if(error?.code==='login_required'||[401,403].includes(error?.status)){onIssue(error);exhaust(error);return;}
    if(started===null){started=now();deadlineTimer=setTimeout(exhaust,maxMs);}
    if(now()-started>=maxMs||attempt>=maxAttempts){exhaust();return;}
    lastError=error;onIssue(error);
    if(running){again=true;return;}
    if(timer!==null){if(!immediate)return;clearTimer(timer);}
    const delay=immediate?0:Math.min(1500*2**Math.min(attempt,4),15000,maxMs-(now()-started));
    timer=setTimer(async()=>{
      if(failed||now()-started>=maxMs){exhaust();return;}
      attempt++;
      timer=null;running=true;again=false;const current=generation;
      try{await recover();if(current===generation)reset();}
      catch(error){if(current===generation){lastError=error;if(error?.code==='login_required'||[401,403].includes(error?.status)){onIssue(error);exhaust(error);}else again=true;}}
      finally{running=false;if(!failed&&again)schedule(lastError);}
    },delay);
  }
  function resume(error,options={immediate:true}){if(failed)reset();schedule(error,options);}
  return {schedule,resume,reset,exhausted:()=>failed};
}

export function publicProgressText(event){
  return event.type==='reasoning' && (['commentary','plan','agentMessage'].includes(event.itemType) || /summaryTextDelta/.test(event.sdkEventType||'')) ? String(event.text||'') : '';
}

export function toolActivityText(event,taskId){
  if(event.type!=='tool-activity'||event.taskId!==taskId)return '';
  const labels={route:'查找工具',searchTools:'查找工具',getTool:'读取工具',getTools:'读取工具',readDocs:'读取说明'};
  if(!Object.hasOwn(labels,event.method))return '';
  const operation=labels[event.method];
  const target=typeof event.target==='string'?event.target.slice(0,160):'';
  return operation+(target?'：'+target:'')+(event.status==='failed'?'（未完成）':'')+'\n';
}

export function cadOutcomeText(task){
  const outcome=task.cadOutcome;
  const stopped=task.status==='canceled'?'任务已停止；':'';
  if(!outcome)return stopped+'正在核对工具回执';
  if(outcome.status==='unknown')return stopped+'原结果待确认';
  if(outcome.status==='partial')return stopped+'工具部分完成';
  if(outcome.status==='not_executed')return stopped+'本轮未执行 CAD 工具';
  if(outcome.status==='completed')return stopped+'工具回执已确认';
  return stopped+'正在核对工具回执';
}

export function durationText(milliseconds){
  const seconds=Number.isFinite(milliseconds)?Math.max(0,milliseconds/1000):0;
  if(seconds<10)return seconds.toFixed(1)+' 秒';
  if(seconds<60)return Math.floor(seconds)+' 秒';
  return Math.floor(seconds/60)+' 分 '+String(Math.floor(seconds%60)).padStart(2,'0')+' 秒';
}

export async function registerHostAttachments(files,{register,copyBytes=value=>new Uint8Array(value)}){
  const registered=[];
  for(const file of files){
    if(!file.size)throw Object.assign(new Error('附件为空，请重新选择：'+file.name),{code:'EMPTY_ATTACHMENT',attachmentName:file.name});
    try{
      const resource=await register({name:file.name,data:copyBytes(await file.arrayBuffer()),mime:file.type||'application/octet-stream'});
      if(!resource.resourceId)throw Object.assign(new Error(resource.error?.message||'文件登记失败'),{code:resource.error?.code||'ATTACHMENT_REGISTER_FAILED'});
      const sha256=resource.sha256||[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
      registered.push({resourceId:resource.resourceId,name:file.name,size:file.size,sha256,file,kind:/\.(svg|dxf|logo\.json)$/i.test(file.name)?'vector':'file'});
    }catch(error){error.attachmentName=file.name;throw error;}
  }
  return registered;
}

export function attachmentIdentity(file){return JSON.stringify([file.originalName??file.name,Number(file.size),file.sha256]);}

export async function settleIndependent(operations,parallelism=4){
  let cursor=0;const results=new Array(operations.length);
  await Promise.all(Array.from({length:Math.min(parallelism,operations.length)},async()=>{while(cursor<operations.length){const index=cursor++;try{results[index]={status:'fulfilled',value:await operations[index]()};}catch(reason){results[index]={status:'rejected',reason};}}}));
  return results;
}

// References only: no grant, ticket, token, cookies or source geometry.
export function createHostRecoveryJournal(storage,key){
  const read=()=>{try{const value=JSON.parse(storage.getItem(key)||'null');return value?.version===1&&value.cadSessionId?value:null;}catch{return null;}};
  const write=value=>{try{if(!value){storage.removeItem(key);return;}const {cadSessionId,conversationId,taskId,leaseEpoch,lastSeq,binding,pageSessionId,pendingSend}=value;
    storage.setItem(key,JSON.stringify({version:1,cadSessionId,conversationId,taskId,leaseEpoch,lastSeq,binding,pageSessionId,pendingSend:pendingSend?{key:pendingSend.key,draftTaskId:pendingSend.draftTaskId,attachmentKeys:pendingSend.attachmentKeys}:null}));
  }catch{}};
  return {read,write};
}

// Render only common reply formatting. Model text never becomes raw HTML.
export function renderReply(element,value){
  const doc=element.ownerDocument,lines=String(value??'').split(/\r?\n/);
  const inline=(parent,text)=>{
    let offset=0;
    for(const match of text.matchAll(/\*\*([^*\n]+)\*\*|`([^`\n]+)`/g)){
      parent.append(doc.createTextNode(text.slice(offset,match.index)));
      const child=doc.createElement(match[1]!==undefined?'strong':'code');
      child.textContent=match[1]??match[2];parent.append(child);offset=match.index+match[0].length;
    }
    parent.append(doc.createTextNode(text.slice(offset)));
  };
  const cells=line=>line.trim().slice(1,-1).split('|').map(cell=>cell.trim());
  const row=line=>/^\s*\|.*\|\s*$/.test(line||'');
  const separator=line=>row(line)&&cells(line).every(cell=>/^:?-{3,}:?$/.test(cell));
  element.replaceChildren();
  for(let i=0;i<lines.length;i++){
    if(row(lines[i])&&separator(lines[i+1])){
      const headings=cells(lines[i]),rows=[];let end=i+2;
      while(row(lines[end])&&cells(lines[end]).length===headings.length){rows.push(cells(lines[end++]));}
      if(rows.length){
        const wrap=doc.createElement('div'),table=doc.createElement('table');
        wrap.style.cssText='overflow-x:auto;margin:6px 0;white-space:normal';
        table.style.cssText='border-collapse:collapse;font-size:12px;width:100%';
        for(const [index,values] of [headings,...rows].entries()){
          const tr=doc.createElement('tr');
          for(const value of values){const cell=doc.createElement(index?'td':'th');cell.style.cssText='border:1px solid #cbd5e1;padding:4px;text-align:left;vertical-align:top';inline(cell,value);tr.append(cell);}
          table.append(tr);
        }
        wrap.append(table);element.append(wrap);i=end-1;continue;
      }
    }
    if(/^\s*- /.test(lines[i])){
      const list=doc.createElement('ul');list.style.cssText='margin:4px 0;padding-left:18px;white-space:normal';
      do{const item=doc.createElement('li');inline(item,lines[i].replace(/^\s*- /,''));list.append(item);i++;}while(/^\s*- /.test(lines[i]||''));
      element.append(list);i--;continue;
    }
    const line=doc.createElement('div');inline(line,lines[i]);if(!lines[i])line.append(doc.createElement('br'));element.append(line);
  }
}
import './runtime-uuid.js?v=20261026-isolated';
