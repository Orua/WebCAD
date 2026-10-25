const PROTOCOL='webcad.assistant-panel/1';
export function createAssistantBridge(){
  const hash=new URLSearchParams(location.hash.slice(1)),channel=hash.get('channel'),origin=hash.get('parentOrigin');
  if(!channel||!origin||window.parent===window||new URL(origin).origin!==origin)throw new Error('助手缺少有效的当前页面接入通道。');
  let sequence=0,handler=null,direct=null,syncStatus='pending',syncError=null;const pending=new Map(),states=new Map(),revisionHandlers=new Map();
  try{if(location.origin===origin)direct=parent.webcad?.assistantPanel?.localChannel?.({source:window,channel,origin:location.origin})||null;}catch{}
  const post=data=>parent.postMessage({protocol:PROTOCOL,channel,...data},origin);
  function request(method,args){const id='host-'+(++sequence),timeoutMs=method==='adapter.artifact'?900000:method==='page.invoke'&&args?.method==='recoverKernel'?120000:35000;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Object.assign(new Error('原请求观察超时，请核对原任务；不会自动重放'),{code:'AGENT_PAGE_TIMEOUT',requestId:id,commitState:'unknown',recoveryAction:'query_original_task'}));},timeoutMs);if(direct){Promise.resolve().then(()=>direct.request(method,args)).then(result=>{clearTimeout(timer);resolve(result);},error=>{clearTimeout(timer);reject(error);});return;}pending.set(id,{resolve,reject,timer});try{post({kind:'request',id,method,args});}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}});}
  window.addEventListener('message',async event=>{
    const data=event.data;if(event.source!==parent||event.origin!==origin||data?.protocol!==PROTOCOL||data.channel!==channel)return;
    if(data.kind==='response'){const item=pending.get(data.id);if(!item)return;clearTimeout(item.timer);pending.delete(data.id);if(data.error)item.reject(Object.assign(new Error(data.error.message),{code:data.error.code}));else item.resolve(data.result);return;}
    if(data.kind==='adapter-state'){states.set(data.adapterId,data.state);handler?.('adapter.stateChanged');return;}
    if(data.kind==='revision'){const callback=revisionHandlers.get(data.subscriptionId);if(callback)try{callback(data.change);}catch{}return;}
    if(data.kind==='theme'){setTheme(data.tokens);return;}
    if(data.kind==='project-storage-error'){handler?.('project.storageError',data);return;}
    if(data.kind==='request'){try{post({kind:'response',id:data.id,result:await handler?.(data.method,data.args)});}catch(error){post({kind:'response',id:data.id,error:{code:error.code||'ASSISTANT_FAILED',message:error.message}});}}
  });
  const call=(method,args={})=>request('page.invoke',{method,args});
  const api=Object.fromEntries(['getState','connect','recoverKernel'].map(method=>[method,args=>call(method,args)]));
  api.watchRevision=(callback,options={})=>{
    if(typeof callback!=='function')throw Object.assign(new Error('watchRevision needs a callback'),{code:'PARAM_SCHEMA_INVALID'});
    const subscriptionId=`revision-${++sequence}`;revisionHandlers.set(subscriptionId,callback);
    let stopped=false;
    const stop=()=>{stopped=true;syncStatus='stopped';revisionHandlers.delete(subscriptionId);void request('page.watchRevision.unsubscribe',{subscriptionId}).catch(()=>{});};
    stop.ready=request('page.watchRevision.subscribe',{subscriptionId,options}).then(receipt=>{
      if(stopped)throw Object.assign(Error('状态订阅已取消'),{code:'lease_revoked'});
      if(receipt?.status!=='subscribed')throw Object.assign(Error('页面未确认状态订阅'),{code:'STATE_SUBSCRIPTION_FAILED'});
      syncStatus='confirmed';syncError=null;return receipt;
    }).catch(error=>{revisionHandlers.delete(subscriptionId);if(!stopped){syncStatus='unavailable';syncError=error.code||'STATE_SUBSCRIPTION_FAILED';}throw error;});
    void stop.ready.catch(()=>{});return stop;
  };
  api.files=Object.fromEntries(['register','open','save','read','release','confirmWritten'].map(method=>[method,args=>call('files.'+method,args)]));
  return {api,origin,capabilities:()=>({transport:direct?'direct':'bridge',actualOrigin:location.origin,syncStatus,syncError}),ready(callback){handler=callback;post({kind:'ready'});},setHost:patch=>request('host.state',{...patch,channelState:{transport:direct?'direct':'bridge',actualOrigin:location.origin,syncStatus,syncError}}),exit:()=>request('panel.userExit'),close:()=>request('panel.close'),async createAdapter(session){const adapterId=session.cadSessionId;states.set(adapterId,await request('adapter.create',session));const callAdapter=(method,payload)=>request('adapter.'+method,{adapterId,payload});
    const refreshPending=async()=>{
      // Older page adapters publish execution completion before their report is
      // acknowledged. Refresh that stale cache once at the task boundary;
      // healthy adapters with a final pushed state need no extra round trip.
      if(states.get(adapterId)?.pending.length){states.set(adapterId,await callAdapter('state'));handler?.('adapter.stateChanged');}
    };
    return {state:()=>states.get(adapterId),receive:command=>callAdapter('receive',command),endTask:async id=>{await callAdapter('endTask',id);await refreshPending();},release:()=>{states.set(adapterId,{...states.get(adapterId),accepting:false,editing:false});return callAdapter('release');},retryReports:async()=>{await callAdapter('retryReports');await refreshPending();}};}};
}
export function setTheme(tokens){
  const map={'--accent':'--gl-blue','--accent-ink':'--gl-blue-deep','--accent-soft':'--gl-blue-soft','--accent-contrast':'--gl-accent-contrast'};
  for(const [key,target]of Object.entries(map))if(tokens?.[key])document.body.style.setProperty(target,tokens[key]);
}
