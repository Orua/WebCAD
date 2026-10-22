import {createHostAdapter} from './host-adapter.js';
import {workspaceThemeTokens} from '../ui/config/theme-colors.js';
import {createPanelLayout,isMobileLayout} from './panel-layout.js';
import {createFloatingToggle,validateFloatingPosition} from './floating-toggle.js';

const PROTOCOL='webcad.assistant-panel/1';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function validateAssistantUrl(value,base=location.href){
  const url=new URL(value,base);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.search)fail('AGENT_URL_INVALID','请填写不带参数、凭据的助手页面 HTTP/HTTPS 地址。');
  if(new URL(base).protocol==='https:'&&url.protocol!=='https:')fail('AGENT_URL_INVALID','HTTPS 页面须使用 HTTPS 助手地址。');
  return url.href;
}
export function createAssistantPanel({getApi,hostControl,onChange=()=>{},surface=document.body}){
  const defaultUrl=new URL('/AI/WebCAD/WebCADWorkspace.aspx',location.hostname==='127.0.0.1'&&location.port==='17674'?'http://127.0.0.1/':location.href).href;
  let url=defaultUrl,frame=null,channel=null,origin=null,adapter=null,visible=false,collapsed=false,panelToggle=null,phase='closed',error=null,external=null,exitOperation=null;
  let requestSeq=0,handshakeTimer=null,hostResponded=false,activity='idle',floating=null,channelState={transport:'unavailable',syncStatus:'pending'};const pending=new Map(),adapters=new Map(),revisionSubscriptions=new Map();
  try{const saved=localStorage.getItem('webcad.assistant-url.v1');if(saved)url=validateAssistantUrl(saved);}catch{}
  const state=()=>{const size=external?.getLayout?.()||layout.get();return {version:1,url,configured:Boolean(url),visible,collapsed:visible&&size.collapsed,expanded:visible&&!size.collapsed,layout:size,phase:external&&visible&&external.agentState?.()==='offline'?'agent_offline':external&&visible&&hostControl.get().connected?'connected':phase,error,connected:hostControl.get().connected,locked:hostControl.get().locked,externalHost:Boolean(external),channelState:{...channelState,configuredOrigin:new URL(url,location.href).origin}};};
  const notify=()=>{syncFloating();onChange({...state(),floating:floating?.get()||{visible:false,activity:'idle',position:null}});};
  const layout=createPanelLayout({root:surface,visible:()=>visible&&!external,collapsed:()=>collapsed,collapsedSize:()=>0,onCollapsed:setCollapsed,onChange:notify,widthProperty:'--agent-panel-width',heightProperty:'--agent-panel-height'});
  function ensureFloating(){
    const root=surface.querySelector?.('.canvas-panel');
    if(!floating&&root)floating=createFloatingToggle({root,onOpen:()=>{external?external.setLayout({collapsed:false}):layout.set({collapsed:false});notify();},onMove:()=>notify()});
  }
  function syncFloating(){
    const size=external?.getLayout?.()||{collapsed};
    if(visible&&size.collapsed)ensureFloating();
    const current=external?.getActivity?.()||activity;
    floating?.sync({visible:visible&&size.collapsed,activity:phase==='agent_offline'||external?.agentState?.()==='offline'?'offline':hostControl.get().locked?'working':current==='thinking'?'thinking':phase==='connecting'&&!hostControl.get().connected?'connecting':'idle'});
  }
  function syncPanelToggle(){
    if(!panelToggle)return;
    const header=isMobileLayout()?surface.querySelector?.('.app-header .header-actions'):null;
    (header||surface).append(panelToggle);
    const label=collapsed?'展开 Agent 对话框':'隐藏 Agent 对话框';
    panelToggle.title=label;panelToggle.setAttribute('aria-label',label);panelToggle.setAttribute('aria-expanded',String(!collapsed));
    if(frame)panelToggle.setAttribute('aria-controls',frame.id);
    panelToggle.innerHTML=collapsed?'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 4v16M10 8l-4 4 4 4"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 4v16M14 8l4 4-4 4"/></svg>';
  }
  window.addEventListener('resize',()=>{syncPanelToggle();syncFloating();});
  function setCollapsed(value){collapsed=Boolean(value);surface.classList.toggle('agent-panel-collapsed',collapsed);syncPanelToggle();layout.sync();notify();}
  function ensurePanelToggle(){
    if(panelToggle)return;
    panelToggle=document.createElement('button');panelToggle.type='button';panelToggle.className='agent-panel-toggle';if(frame)panelToggle.setAttribute('aria-controls',frame.id);
    panelToggle.addEventListener('click',()=>setCollapsed(!collapsed));surface.append(panelToggle);syncPanelToggle();
  }
  function removePanelToggle(){panelToggle?.remove();panelToggle=null;collapsed=false;surface.classList.remove('agent-panel-collapsed');layout.sync();}
  function post(data){frame?.contentWindow?.postMessage({protocol:PROTOCOL,channel,...data},origin);}
  function stopRevisionSubscriptions(){for(const stop of revisionSubscriptions.values())try{stop();}catch{}revisionSubscriptions.clear();}
  function request(method,args){
    const id='page-'+(++requestSeq);
    const timeout=['adapter.artifact','project.artifactReady'].includes(method)?900000:35000;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Object.assign(new Error('助手响应超时；原请求结果尚未确定，请查询原任务或重传已有回执。'),{code:'AGENT_PANEL_TIMEOUT',status:'unknown',commitState:'unknown',requestId:id}));},timeout);pending.set(id,{resolve,reject,timer});try{post({kind:'request',id,method,args});}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});
  }
  function theme(){const tokens=workspaceThemeTokens(getApi().getState().displayPreferences?.themeColor);post({kind:'theme',tokens});external?.setTheme?.(tokens);}
  window.addEventListener('webcad:artifact-ready',event=>{
    if(!visible||!event.detail?.resourceId)return;
    const operation=external?.stageArtifact?external.stageArtifact(event.detail):frame?request('project.artifactReady',event.detail):null;
    Promise.resolve(operation).catch(error=>{post({kind:'project-storage-error',code:error.code||'PROJECT_STORE_FAILED',message:error.message});});
  });
  function setHostState(patch){hostControl.set(patch);notify();}
  async function handle(method,args){
    if(method==='page.invoke'){
      if(['getAgentPanel','setAgentPanel','configureAgentPanel'].includes(args?.method))fail('AGENT_METHOD_DENIED','助手不能修改自己的接入配置。');
      return getApi().invoke(args);
    }
    if(method==='page.watchRevision.subscribe'){
      if(!visible)fail('lease_revoked','Agent 模式已退出。');
      const subscriptionId=args?.subscriptionId;
      if(typeof subscriptionId!=='string'||!/^revision-[a-zA-Z0-9_-]{1,80}$/.test(subscriptionId))fail('PARAM_SCHEMA_INVALID','无效的修订订阅 ID。');
      if(revisionSubscriptions.has(subscriptionId))return {status:'subscribed'};
      if(revisionSubscriptions.size>=16)fail('RESOURCE_LIMIT','修订订阅数量已达上限。');
      const stop=getApi().watchRevision(change=>{if(revisionSubscriptions.has(subscriptionId))post({kind:'revision',subscriptionId,change});},args?.options||{});
      revisionSubscriptions.set(subscriptionId,stop);return stop.ready?await stop.ready:{status:'subscribed',context:getApi().getState({compact:true}).context};
    }
    if(method==='page.watchRevision.unsubscribe'){
      const subscriptionId=args?.subscriptionId,stop=revisionSubscriptions.get(subscriptionId);
      if(stop){revisionSubscriptions.delete(subscriptionId);stop();}
      return {status:'unsubscribed'};
    }
    if(method==='adapter.create'){
      if(!visible)fail('lease_revoked','Agent 模式已退出。');
      adapter?.release();for(const [id,previous]of adapters)if(!previous.state().accepting&&!previous.state().pending.length)adapters.delete(id);if(adapters.size>=128)fail('RESOURCE_LIMIT','先核对旧会话回执，再连接新助手。');
      const adapterId=args.cadSessionId;
      const created=createHostAdapter({api:getApi(),session:args,report:(kind,command,body)=>request('adapter.report',{kind,command,body}),artifact:(command,result,bytes)=>request('adapter.artifact',{command,result,bytes}),onStateChange:()=>post({kind:'adapter-state',adapterId,state:created.state()})});
      adapter=created;adapters.set(adapterId,created);
      return adapter.state();
    }
    if(method.startsWith('adapter.')){const name=method.slice(8),bound=adapters.get(args?.adapterId);if(!bound||!['receive','endTask','release','retryReports','state'].includes(name))fail('AGENT_METHOD_DENIED','助手适配器尚未就绪。');const result=await bound[name](args.payload);if(name==='retryReports'&&bound!==adapter&&!bound.state().pending.length)adapters.delete(args.adapterId);return result;}
    if(method==='host.state'){if(!visible){setHostState({locked:false,connected:false});return state();}const {agent,conversation,activity:nextActivity,channelState:diagnostics,...control}=args;activity=nextActivity==='thinking'?'thinking':'idle';if(diagnostics&&['direct','bridge'].includes(diagnostics.transport)&&diagnostics.actualOrigin===origin)channelState={...diagnostics,conversation:Boolean(conversation),cad:Boolean(args.connected)};phase=agent==='offline'?'agent_offline':args.connected?'connected':'connecting';setHostState(control);return state();}
    if(method==='panel.userExit')return exit();
    if(method==='panel.close'){closeLocal();return state();}
    fail('AGENT_METHOD_DENIED','未知助手接入请求。');
  }
  window.addEventListener('message',async event=>{
    const data=event.data;
    if(!frame||event.source!==frame.contentWindow||event.origin!==origin||data?.protocol!==PROTOCOL||data.channel!==channel)return;
    hostResponded=true;
    if(data.kind==='response'){const item=pending.get(data.id);if(!item)return;clearTimeout(item.timer);pending.delete(data.id);if(data.error)item.reject(Object.assign(new Error(data.error.message),{code:data.error.code}));else item.resolve(data.result);return;}
    if(data.kind==='ready'){clearTimeout(handshakeTimer);phase='connecting';error=null;theme();notify();return;}
    if(data.kind==='request'){try{post({kind:'response',id:data.id,result:await handle(data.method,data.args)});}catch(e){post({kind:'response',id:data.id,error:{code:e.code||'AGENT_PANEL_FAILED',message:e.message}});}}
  });
  function closeLocal(){
    clearTimeout(handshakeTimer);stopRevisionSubscriptions();channelState={transport:'unavailable',syncStatus:'stopped'};adapter?.release();visible=false;phase='closed';error=null;hostControl.set({locked:false,connected:false});surface.classList.remove('has-agent-panel');removePanelToggle();if(frame)frame.hidden=true;notify();
  }
  async function exit(){
    if(exitOperation)return exitOperation;
    if(!external&&!hostResponded&&!adapter&&!adapters.size){closeLocal();return {status:'applied',release:null,releasePending:false,...state()};}
    // Revoke local writes and unlock immediately, retain the iframe until the
    // existing broker has reconciled cancel/release and outstanding receipts.
    clearTimeout(handshakeTimer);stopRevisionSubscriptions();channelState={transport:'unavailable',syncStatus:'stopped'};adapter?.release();hostControl.set({locked:false,connected:false});visible=false;surface.classList.remove('has-agent-panel');removePanelToggle();if(frame)frame.hidden=true;phase='releasing';notify();
    exitOperation=(async()=>{try{const receipt=external?await external.exit():frame?await request('panel.exit'):null;phase=receipt?.pendingRelease?'release_pending':'closed';return {status:'applied',release:receipt,releasePending:Boolean(receipt?.pendingRelease),...state()};}catch(e){phase='release_pending';error=e.message;return {status:'applied',releasePending:true,...state()};}finally{exitOperation=null;notify();}})();return exitOperation;
  }
  async function enter(){
    if(exitOperation)await exitOperation;
    error=null;visible=true;phase='connecting';notify();
    if(external){await external.enter();theme();return {status:'applied',...state()};}
    surface.classList.add('has-agent-panel');setCollapsed(false);ensurePanelToggle();
    if(frame){frame.hidden=false;try{await request('panel.connect');}catch(e){phase='error';error=e.message;notify();}return {status:'applied',...state()};}
    hostResponded=false;channel=crypto.randomUUID();origin=new URL(url).origin;
    frame=document.createElement('iframe');frame.id='webcad-agent-assistant-frame';frame.className='agent-assistant-panel';frame.title='CAD Agent 助手';frame.referrerPolicy='strict-origin';panelToggle?.setAttribute('aria-controls',frame.id);
    frame.addEventListener('load',()=>{stopRevisionSubscriptions();adapter?.release();channelState={transport:'unavailable',syncStatus:'pending'};hostControl.set({locked:false,connected:false});if(visible){phase='connecting';notify();}});
    const target=new URL(url);target.searchParams.set('assistant','1');target.hash=new URLSearchParams({channel,parentOrigin:location.origin}).toString();frame.src=target.href;surface.append(frame);
    handshakeTimer=setTimeout(()=>{if(visible&&phase==='connecting'){phase='error';error='助手尚未接入。若面板显示登录页，请在新标签打开“设置 → Agent 配置”中的同一助手地址完成登录，再退出并重新进入 Agent 模式。localhost 与 127.0.0.1 的登录态不通用；顶层已登录但嵌入仍要求登录时，说明嵌入认证未通过，不要重复发送作图任务。';notify();}},30000);
    return {status:'applied',...state()};
  }
  function localChannel(input){
    if(!visible||!frame||input?.source!==frame.contentWindow||input.channel!==channel||input.origin!==location.origin||origin!==location.origin)fail('AGENT_METHOD_DENIED','当前窗口没有直接通道授权。');
    const actual=new URL(frame.contentWindow.location.href),configured=new URL(url);
    if(actual.origin!==location.origin||actual.pathname!==configured.pathname)fail('AGENT_METHOD_DENIED','实际助手页面尚未通过验证。');
    const expected=channel;
    return Object.freeze({request(method,args){if(!visible||channel!==expected||input.source!==frame.contentWindow)fail('lease_revoked','原直接通道已释放。');const current=new URL(frame.contentWindow.location.href);if(current.origin!==configured.origin||current.pathname!==configured.pathname)fail('AGENT_METHOD_DENIED','助手页面已发生导航，原直接通道不可复用。');return handle(method,args);}});
  }
  async function insertLocation(marker){
    if(!hostControl.get().connected)fail('AGENT_COMPOSER_UNAVAILABLE','请先连接原生 Agent，再标记位置。');
    if(external?.insertLocation)return external.insertLocation(marker);
    if(frame&&hostResponded){if(frame.hidden)frame.hidden=false;visible=true;surface.classList.add('has-agent-panel');setCollapsed(false);return request('composer.insertLocation',marker);}
    fail('AGENT_COMPOSER_UNAVAILABLE','AI 输入框尚未连接。');
  }
  return Object.freeze({get:()=>({...state(),floating:floating?.get()||{visible:false,activity:'idle',position:null}}),enter,exit,theme,insertLocation,localChannel,setLayout(input){if(!input||typeof input!=='object'||Array.isArray(input))fail('PARAM_SCHEMA_INVALID','无效的助手布局字段');const {floatingPosition,...size}=input;if(floatingPosition!==undefined)validateFloatingPosition(floatingPosition);const result=external?external.setLayout(size):layout.set(size);syncFloating();if(floatingPosition!==undefined){ensureFloating();floating?.setPosition(floatingPosition);}notify();return {status:'applied',layout:result,floating:floating?.get()};},configure(value){if(visible||phase==='releasing'||phase==='release_pending')fail('AGENT_PANEL_ACTIVE','先退出并确认原连接释放，再修改助手地址。');url=validateAssistantUrl(value);frame?.remove();frame=null;try{localStorage.setItem('webcad.assistant-url.v1',url);}catch{return {status:'applied',persisted:false,...state()};}notify();return {status:'applied',persisted:true,...state()};},bindExternal(controller){external=controller;visible=true;phase='connecting';layout.sync();notify();theme();return state();},sync(){theme();layout.sync();notify();}});
}
