import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssistantPanel as createRealAssistantPanel,validateAssistantUrl} from '../src/agent/assistant-panel.js';
import {createHostControl} from '../src/host-control.js';
import {showWorkspaceSettings} from '../src/ui/settings/workspace-settings.js';

function assistantEnvironment(t,{href='https://cad.invalid/webcad/',savedUrl,deployment}={}){
 const keys=['location','window','document','localStorage','fetch','WEBCAD_DEPLOYMENT_CONFIG'],original=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
 const saved=new Map(savedUrl===undefined?[]:[['webcad.assistant-url.v1',savedUrl]]),frames=[],sent=[];let requests=0;
 t.after(()=>{for(const [key,value]of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 Object.assign(globalThis,{location:new URL(href),window:{addEventListener(){}},fetch:()=>{requests++;throw Error('未配置时不应请求网络');},localStorage:{getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)},document:{createElement(tag){if(tag==='iframe'){const frame={contentWindow:{postMessage:value=>sent.push(value)},remove(){}};frames.push(frame);return frame;}return {setAttribute(){},remove(){}};}}});
 if(deployment===undefined)delete globalThis.WEBCAD_DEPLOYMENT_CONFIG;else globalThis.WEBCAD_DEPLOYMENT_CONFIG=deployment;
 const hostControl=createHostControl(),surface={classList:{add(){},remove(){},toggle(){}},append(){}};
 const panel=createAssistantPanel({getApi:()=>({getState:()=>({displayPreferences:{}})}),hostControl,surface});
 return {panel,hostControl,frames,sent,saved,requests:()=>requests};
}

test('未配置 Agent 时明确失败且不建立 iframe、计时握手或网络请求',async t=>{
 const env=assistantEnvironment(t,{href:'http://127.0.0.1:17674/'}),{panel}=env;
 assert.equal(panel.get().url,'');assert.equal(panel.get().configured,false);assert.equal(panel.get().channelState.configuredOrigin,null);
 await assert.rejects(panel.enter(),error=>error.code==='AGENT_NOT_CONFIGURED'&&/设置 → Agent 配置/.test(error.message));
 assert.equal(panel.get().visible,false);assert.equal(panel.get().phase,'error');assert.match(panel.get().error,/独立作图/);
 assert.equal(env.hostControl.get().locked,false);assert.equal(env.frames.length,0);assert.equal(env.sent.length,0);assert.equal(env.requests(),0);assert.equal(env.saved.size,0);
 await panel.exit();assert.equal(panel.get().phase,'closed');
});

test('保存的助手地址优先于部署配置并沿用原认证通道与协议',async t=>{
 const savedUrl='https://cad.invalid/AI/WebCAD/WebCADWorkspace.aspx',env=assistantEnvironment(t,{savedUrl,deployment:{assistantUrl:'https://other.invalid/assistant'}});
 assert.equal(env.panel.get().url,savedUrl);assert.equal(env.panel.get().configured,true);assert.equal(env.panel.get().channelState.configuredOrigin,'https://cad.invalid');
 try{
  await env.panel.enter();const target=new URL(env.frames[0].src);
  assert.equal(target.origin,'https://cad.invalid');assert.equal(target.pathname,'/AI/WebCAD/WebCADWorkspace.aspx');assert.equal(target.search,'?assistant=1');assert.equal(new URLSearchParams(target.hash.slice(1)).get('parentOrigin'),'https://cad.invalid');assert.ok(new URLSearchParams(target.hash.slice(1)).get('channel'));
  assert.equal(env.frames[0].referrerPolicy,'strict-origin');assert.equal(env.saved.get('webcad.assistant-url.v1'),savedUrl);
 }finally{await env.panel.exit();}
});

test('显式部署助手地址通过校验且不会自动保存为用户配置',async t=>{
 const env=assistantEnvironment(t,{deployment:{assistantUrl:'/custom/assistant.html'}});
 assert.equal(env.panel.get().url,'https://cad.invalid/custom/assistant.html');assert.equal(env.saved.size,0);
 try{await env.panel.enter();assert.equal(new URL(env.frames[0].src).pathname,'/custom/assistant.html');}finally{await env.panel.exit();}
});

test('无效部署助手地址不降级至默认宿主或发送请求',async t=>{
 const env=assistantEnvironment(t,{deployment:{assistantUrl:'http://cad.invalid/assistant'}});
 assert.equal(env.panel.get().configured,false);await assert.rejects(env.panel.enter(),{code:'AGENT_NOT_CONFIGURED'});assert.equal(env.frames.length,0);assert.equal(env.requests(),0);
});

test('保存地址的安全校验失败不会偷偷改用部署地址',async t=>{
 const env=assistantEnvironment(t,{savedUrl:'https://cad.invalid/assistant?token=private',deployment:{assistantUrl:'/fallback'}});
 assert.equal(env.panel.get().configured,false);await assert.rejects(env.panel.enter(),{code:'AGENT_NOT_CONFIGURED'});assert.equal(env.frames.length,0);assert.equal(env.saved.get('webcad.assistant-url.v1'),'https://cad.invalid/assistant?token=private');
});

test('未设助手 URL 仍可由外部宿主显式绑定并进入和释放',async t=>{
 const env=assistantEnvironment(t),calls=[];
 await assert.rejects(env.panel.enter(),{code:'AGENT_NOT_CONFIGURED'});
 const controller={enter:async()=>calls.push('enter'),exit:async()=>{calls.push('exit');return {status:'released'};},setTheme:()=>calls.push('theme')};
 const bound=env.panel.bindExternal(controller);assert.equal(bound.configured,true);assert.equal(bound.externalHost,true);assert.equal(bound.url,'');assert.equal(bound.error,null);
 await env.panel.enter();assert.ok(calls.includes('enter'));const receipt=await env.panel.exit();assert.equal(receipt.releasePending,false);assert.ok(calls.includes('exit'));assert.equal(env.frames.length,0);assert.equal(env.requests(),0);
});

test('配置助手 URL 可持久化并在配置失败时保留原地址',async t=>{
 const env=assistantEnvironment(t);await assert.rejects(env.panel.enter(),{code:'AGENT_NOT_CONFIGURED'});
 const configured=env.panel.configure('https://assistant.invalid/ui');assert.equal(configured.error,null);
 assert.equal(configured.persisted,true);assert.equal(configured.url,'https://assistant.invalid/ui');assert.equal(env.saved.get('webcad.assistant-url.v1'),'https://assistant.invalid/ui');
 assert.throws(()=>env.panel.configure('https://assistant.invalid/ui?token=secret'),{code:'AGENT_URL_INVALID'});assert.equal(env.panel.get().url,configured.url);
 try{await env.panel.enter();assert.equal(new URL(env.frames[0].src).origin,'https://assistant.invalid');}finally{await env.panel.exit();}
});

// Model the desktop layout APIs now used by the shared resizable panel.
function createAssistantPanel(options){
  const win=globalThis.window,listen=win.addEventListener;
  win.addEventListener=(name,handler)=>{if(name==='message')listen(name,handler);};
  Object.assign(win,{navigator:{userAgent:'Windows'},matchMedia:()=>({matches:false}),screen:{width:1200,height:800},innerHeight:800});
  options.surface.style={setProperty(){}};options.surface.dataset={};
  options.surface.getBoundingClientRect=()=>({width:1200,height:800});
  const create=globalThis.document.createElement;
  globalThis.document.createElement=tag=>Object.assign(create(tag),{style:{},addEventListener(){},removeEventListener(){}});
  const previous=globalThis.ResizeObserver;
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  try{return createRealAssistantPanel(options);}
  finally{if(previous===undefined)delete globalThis.ResizeObserver;else globalThis.ResizeObserver=previous;}
}

test('已配置助手的直接通道仍核对同源、窗口、路径和通道生命周期',async t=>{
 const env=assistantEnvironment(t,{savedUrl:'https://cad.invalid/assistant'});
 try{
  await env.panel.enter();const frame=env.frames[0],channel=new URLSearchParams(new URL(frame.src).hash.slice(1)).get('channel');frame.contentWindow.location=new URL(frame.src);
  const input={source:frame.contentWindow,channel,origin:'https://cad.invalid'};
  for(const patch of [{source:{}},{channel:'forged'},{origin:'https://other.invalid'}])assert.throws(()=>env.panel.localChannel({...input,...patch}),{code:'AGENT_METHOD_DENIED'});
  const direct=env.panel.localChannel(input);await direct.request('host.state',{connected:true,locked:true});assert.equal(env.hostControl.get().locked,true);
  frame.contentWindow.location=new URL('https://cad.invalid/other');assert.throws(()=>env.panel.localChannel(input),{code:'AGENT_METHOD_DENIED'});assert.throws(()=>direct.request('host.state',{connected:true}),{code:'AGENT_METHOD_DENIED'});
  frame.contentWindow.location=new URL(frame.src);await env.panel.exit();assert.equal(env.hostControl.get().locked,false);assert.throws(()=>direct.request('host.state',{connected:true}),{code:'lease_revoked'});
 }finally{await env.panel.exit();}
});

test('Agent 配置界面明确显示可选与未配置状态并保留保存入口',async t=>{
 const env=assistantEnvironment(t),elements=[];let configured=null,closed=false;
 const element=(tag,attrs={},text='')=>{const node={tag,attrs,text,children:[],style:{},dataset:{},value:'',append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},addEventListener(){},reportValidity:()=>true};elements.push(node);return node;};
 const page={getAgentPanel:()=>env.panel.get(),getState:()=>({context:{revision:1}}),connect:()=>({canExecute:true,blockers:[]}),configureAgentPanel:async input=>{configured=input;return {status:'applied'};}};
 window.webcad={api:page};document.baseURI='https://cad.invalid/webcad/';
 const dialog=element('dialog'),button=(label,handler)=>Object.assign(element('button',{},label),{click:handler});
 showWorkspaceSettings('agentGuide',{openDialog:()=>dialog,element,button,closeDialog:()=>{closed=true;},api:{showError:error=>assert.fail(String(error))}});
 assert.ok(elements.some(node=>/Agent 是可选扩展，未配置也可独立作图/.test(node.text)));
 assert.ok(elements.some(node=>node.tag==='dd'&&node.text==='未配置（可独立作图）'));
 const address=elements.find(node=>node.attrs['aria-label']==='Agent 助手页面地址');assert.equal(address.value,'');address.value='https://assistant.invalid/ui';
 await elements.find(node=>node.text==='保存配置').click();assert.deepEqual(configured,{context:{revision:1},url:'https://assistant.invalid/ui'});assert.equal(closed,true);assert.equal(env.frames.length,0);assert.equal(env.requests(),0);
});

test('assistant URL rejects credentials, scripts and mixed content',()=>{
  assert.equal(validateAssistantUrl('/AI/WebCAD/WebCADWorkspace.aspx','https://goldenfu.cn/webcad/'),'https://goldenfu.cn/AI/WebCAD/WebCADWorkspace.aspx');
  for(const url of ['', '   ', null, {}, 'http://[invalid', 'javascript:alert(1)','https://user:password@example.com/','http://example.com/','https://example.com/?token=x','https://example.com/#token'])assert.throws(()=>validateAssistantUrl(url,'https://goldenfu.cn/webcad/'),{code:'AGENT_URL_INVALID'});
});

test('an unconnected login frame exits immediately and allows correcting its URL',async()=>{
 const listeners=[],sent=[];let frame,removed=false;
 const original={location:globalThis.location,window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage};
 Object.assign(globalThis,{location:new URL('https://goldenfu.cn/webcad/'),window:{addEventListener:(name,fn)=>listeners.push(fn)},localStorage:{getItem:()=>null,setItem:()=>{}},document:{createElement:tag=>tag==='iframe'?frame={hidden:false,contentWindow:{postMessage:value=>sent.push(value)},remove:()=>{removed=true;}}:{setAttribute(){},addEventListener(){},remove(){}}}});
 try{
  const hostControl=createHostControl(),surface={classList:{add(){},remove(){},toggle(){}},append(){}};
  const panel=createAssistantPanel({getApi:()=>({getState:()=>({displayPreferences:{}})}),hostControl,surface});
  panel.configure('https://goldenfu.cn/AI/WebCAD/WebCADWorkspace.aspx');
  await panel.enter();const receipt=await panel.exit();
  assert.equal(receipt.releasePending,false);assert.equal(receipt.phase,'closed');assert.equal(frame.hidden,true);assert.equal(hostControl.get().locked,false);assert(!sent.some(message=>message.method==='panel.exit'));
  assert.equal(panel.configure('https://goldenfu.cn/AI/WebCAD/WebCADWorkspace.aspx').status,'applied');assert(removed);
 }finally{for(const [key,value]of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
test('one-click exit unlocks immediately, preserves document, and ignores late or forged host control',async()=>{
  const listeners=[],sent=[],classes=new Set();let frame;
  const original={location:globalThis.location,window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage};
  Object.assign(globalThis,{location:new URL('https://goldenfu.cn/webcad/'),window:{addEventListener:(name,fn)=>listeners.push(fn)},localStorage:{getItem:()=>null,setItem:()=>{}},document:{createElement:tag=>tag==='iframe'?frame={hidden:false,contentWindow:{postMessage:value=>sent.push(value)}}:{setAttribute(){},addEventListener(){},remove(){}}}});
  try{
    const current={context:{documentId:'same',revision:4},displayPreferences:{themeColor:'#0c827d'},dirty:true,view:{camera:{position:[1,2,3]}}},before=structuredClone(current);
    const hostControl=createHostControl(),surface={classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),toggle:(value,on)=>on?classes.add(value):classes.delete(value)},append:()=>{}};
    const panel=createAssistantPanel({getApi:()=>({getState:()=>current}),hostControl,surface});
    panel.configure('https://goldenfu.cn/AI/WebCAD/WebCADWorkspace.aspx');
    await panel.enter();const channel=new URLSearchParams(new URL(frame.src).hash.slice(1)).get('channel');
    const event=(data,origin='https://goldenfu.cn',source=frame.contentWindow)=>({origin,source,data:{protocol:'webcad.assistant-panel/1',channel,...data}});
    await listeners[0](event({kind:'request',id:'forged',method:'host.state',args:{connected:true,locked:true}},'https://other.example'));
    assert.equal(hostControl.get().locked,false);
    await listeners[0](event({kind:'request',id:'live',method:'host.state',args:{connected:true,locked:true}}));
    assert.equal(hostControl.get().locked,true);
    await listeners[0](event({kind:'request',id:'offline',method:'host.state',args:{connected:false,locked:true,agent:'offline'}}));
    assert.equal(panel.get().phase,'agent_offline');
    assert.equal(hostControl.get().connected,false);
    assert.equal(hostControl.get().locked,true);
    await listeners[0](event({kind:'request',id:'recovered',method:'host.state',args:{connected:true,locked:true,agent:'online'}}));
    assert.equal(panel.get().phase,'connected');
    const exiting=panel.exit();assert.equal(hostControl.get().locked,false);assert.equal(panel.get().visible,false);assert.equal(frame.hidden,true);
    const request=sent.findLast(item=>item.method==='panel.exit');
    await listeners[0](event({kind:'response',id:request.id,result:{status:'released'}}));await exiting;
    await listeners[0](event({kind:'request',id:'late',method:'host.state',args:{connected:true,locked:true}}));
    assert.equal(hostControl.get().connected,false);assert.equal(hostControl.get().locked,false);assert.deepEqual(current,before);
    await listeners[0](event({kind:'request',id:'late-adapter',method:'adapter.create',args:{}}));assert.equal(sent.at(-1).error.code,'lease_revoked');
  }finally{for(const [key,value]of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

test('assistant panel forwards bounded native revision subscriptions and removes them on unsubscribe',async()=>{
  const listeners=[],sent=[],classes=new Set();let frame,callback=null,stopped=false,receivedOptions=null;
  const original={location:globalThis.location,window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage};
  Object.assign(globalThis,{location:new URL('https://goldenfu.cn/webcad/'),window:{addEventListener:(name,fn)=>listeners.push(fn)},localStorage:{getItem:()=>null,setItem:()=>{}},document:{createElement:tag=>tag==='iframe'?frame={hidden:false,contentWindow:{postMessage:value=>sent.push(value)}}:{setAttribute(){},addEventListener(){},remove(){}}}});
  try{
    const hostControl=createHostControl(),surface={classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),toggle:(value,on)=>on?classes.add(value):classes.delete(value)},append:()=>{}};
    const panel=createAssistantPanel({getApi:()=>({getState:()=>({displayPreferences:{themeColor:'#0c827d'}}),watchRevision:(fn,options)=>{callback=fn;receivedOptions=options;return ()=>{stopped=true;};}}),hostControl,surface});
    panel.configure('https://goldenfu.cn/AI/WebCAD/WebCADWorkspace.aspx');
    await panel.enter();const channel=new URLSearchParams(new URL(frame.src).hash.slice(1)).get('channel');
    const event=(data)=>({origin:'https://goldenfu.cn',source:frame.contentWindow,data:{protocol:'webcad.assistant-panel/1',channel,...data}});
    await listeners[0](event({kind:'request',id:'subscribe',method:'page.watchRevision.subscribe',args:{subscriptionId:'revision-1',options:{debounceMs:150}}}));
    assert.deepEqual(receivedOptions,{debounceMs:150});
    assert.equal(sent.findLast(item=>item.id==='subscribe').result.status,'subscribed');
    callback({key:'revision-5',context:{revision:5}});
    assert.deepEqual(sent.findLast(item=>item.kind==='revision'),{protocol:'webcad.assistant-panel/1',channel,kind:'revision',subscriptionId:'revision-1',change:{key:'revision-5',context:{revision:5}}});
    await listeners[0](event({kind:'request',id:'unsubscribe',method:'page.watchRevision.unsubscribe',args:{subscriptionId:'revision-1'}}));
    assert.equal(stopped,true);assert.equal(sent.findLast(item=>item.id==='unsubscribe').result.status,'unsubscribed');
    const exiting=panel.exit(),exitRequest=sent.findLast(item=>item.method==='panel.exit');
    await listeners[0](event({kind:'response',id:exitRequest.id,result:{status:'released'}}));await exiting;
  }finally{for(const [key,value]of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
