import {createHostAdapter} from './host-adapter.js';
import {workspaceThemeTokens} from '../ui/config/theme-colors.js';

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
  let url=defaultUrl,frame=null,channel=null,origin=null,adapter=null,visible=false,phase='closed',error=null,external=null,exitOperation=null;
  let requestSeq=0,handshakeTimer=null;const pending=new Map(),adapters=new Map();
  try{const saved=localStorage.getItem('webcad.assistant-url.v1');if(saved)url=validateAssistantUrl(saved);}catch{}
  const state=()=>({version:1,url,configured:Boolean(url),visible,phase,error,connected:hostControl.get().connected,locked:hostControl.get().locked,externalHost:Boolean(external)});
  const notify=()=>onChange(state());
  function post(data){frame?.contentWindow?.postMessage({protocol:PROTOCOL,channel,...data},origin);}
  function request(method,args){
    const id='page-'+(++requestSeq);
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Object.assign(new Error('助手未响应；请确认已登录并配置正确的助手地址。'),{code:'AGENT_PANEL_TIMEOUT'}));},35000);pending.set(id,{resolve,reject,timer});post({kind:'request',id,method,args});});
  }
  function theme(){const tokens=workspaceThemeTokens(getApi().getState().displayPreferences?.themeColor);post({kind:'theme',tokens});external?.setTheme?.(tokens);}
  function setHostState(patch){hostControl.set(patch);notify();}
  async function handle(method,args){
    if(method==='page.invoke'){
      if(['getAgentPanel','setAgentPanel','configureAgentPanel'].includes(args?.method))fail('AGENT_METHOD_DENIED','助手不能修改自己的接入配置。');
      return getApi().invoke(args);
    }
    if(method==='adapter.create'){
      if(!visible)fail('lease_revoked','Agent 模式已退出。');
      adapter?.release();if(adapters.size>=128)fail('RESOURCE_LIMIT','先核对旧会话回执，再连接新助手。');
      const adapterId=args.cadSessionId;
      const created=createHostAdapter({api:getApi(),session:args,report:(kind,command,body)=>request('adapter.report',{kind,command,body}),artifact:(command,result,bytes)=>request('adapter.artifact',{command,result,bytes}),onStateChange:()=>post({kind:'adapter-state',adapterId,state:created.state()})});
      adapter=created;adapters.set(adapterId,created);
      return adapter.state();
    }
    if(method.startsWith('adapter.')){const name=method.slice(8),bound=adapters.get(args?.adapterId);if(!bound||!['receive','endTask','release','retryReports','state'].includes(name))fail('AGENT_METHOD_DENIED','助手适配器尚未就绪。');const result=await bound[name](args.payload);if(name==='retryReports'&&bound!==adapter&&!bound.state().pending.length)adapters.delete(args.adapterId);return result;}
    if(method==='host.state'){if(!visible){setHostState({locked:false,connected:false});return state();}setHostState(args);phase=args.connected?'connected':'connecting';notify();return state();}
    if(method==='panel.close'){closeLocal();return state();}
    fail('AGENT_METHOD_DENIED','未知助手接入请求。');
  }
  window.addEventListener('message',async event=>{
    const data=event.data;
    if(!frame||event.source!==frame.contentWindow||event.origin!==origin||data?.protocol!==PROTOCOL||data.channel!==channel)return;
    if(data.kind==='response'){const item=pending.get(data.id);if(!item)return;clearTimeout(item.timer);pending.delete(data.id);if(data.error)item.reject(Object.assign(new Error(data.error.message),{code:data.error.code}));else item.resolve(data.result);return;}
    if(data.kind==='ready'){clearTimeout(handshakeTimer);phase='connecting';error=null;theme();notify();return;}
    if(data.kind==='request'){try{post({kind:'response',id:data.id,result:await handle(data.method,data.args)});}catch(e){post({kind:'response',id:data.id,error:{code:e.code||'AGENT_PANEL_FAILED',message:e.message}});}}
  });
  function closeLocal(){
    clearTimeout(handshakeTimer);adapter?.release();visible=false;phase='closed';error=null;hostControl.set({locked:false,connected:false});surface.classList.remove('has-agent-panel');if(frame)frame.hidden=true;notify();
  }
  async function exit(){
    if(exitOperation)return exitOperation;
    // Revoke local writes and unlock immediately, retain the iframe until the
    // existing broker has reconciled cancel/release and outstanding receipts.
    clearTimeout(handshakeTimer);adapter?.release();hostControl.set({locked:false,connected:false});visible=false;surface.classList.remove('has-agent-panel');if(frame)frame.hidden=true;phase='releasing';notify();
    exitOperation=(async()=>{try{const receipt=external?await external.exit():frame?await request('panel.exit'):null;phase=receipt?.pendingRelease?'release_pending':'closed';return {status:'applied',release:receipt,releasePending:Boolean(receipt?.pendingRelease),...state()};}catch(e){phase='release_pending';error=e.message;return {status:'applied',releasePending:true,...state()};}finally{exitOperation=null;notify();}})();return exitOperation;
  }
  async function enter(){
    if(exitOperation)await exitOperation;
    error=null;visible=true;phase='connecting';notify();
    if(external){await external.enter();theme();return {status:'applied',...state()};}
    surface.classList.add('has-agent-panel');
    if(frame){frame.hidden=false;try{await request('panel.connect');}catch(e){phase='error';error=e.message;notify();}return {status:'applied',...state()};}
    channel=crypto.randomUUID();origin=new URL(url).origin;
    frame=document.createElement('iframe');frame.className='agent-assistant-panel';frame.title='CAD Agent 助手';frame.referrerPolicy='strict-origin';
    const target=new URL(url);target.searchParams.set('assistant','1');target.hash=new URLSearchParams({channel,parentOrigin:location.origin}).toString();frame.src=target.href;surface.append(frame);
    handshakeTimer=setTimeout(()=>{if(visible&&phase==='connecting'){phase='error';error='助手尚未接入，请在助手面板确认登录或检查配置地址。';notify();}},30000);
    return {status:'applied',...state()};
  }
  return Object.freeze({get:state,enter,exit,theme,configure(value){if(visible||phase==='releasing'||phase==='release_pending')fail('AGENT_PANEL_ACTIVE','先退出并确认原连接释放，再修改助手地址。');url=validateAssistantUrl(value);frame?.remove();frame=null;try{localStorage.setItem('webcad.assistant-url.v1',url);}catch{return {status:'applied',persisted:false,...state()};}notify();return {status:'applied',persisted:true,...state()};},bindExternal(controller){external=controller;visible=true;phase='connecting';notify();theme();return state();},sync(){theme();notify();}});
}
