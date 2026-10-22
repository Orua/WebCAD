import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssistantPanel as createRealAssistantPanel,validateAssistantUrl} from '../src/agent/assistant-panel.js';
import {createHostControl} from '../src/host-control.js';

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

test('assistant URL rejects credentials, scripts and mixed content',()=>{
  assert.equal(validateAssistantUrl('/AI/WebCAD/WebCADWorkspace.aspx','https://goldenfu.cn/webcad/'),'https://goldenfu.cn/AI/WebCAD/WebCADWorkspace.aspx');
  for(const url of ['javascript:alert(1)','https://user:password@example.com/','http://example.com/','https://example.com/?token=x'])assert.throws(()=>validateAssistantUrl(url,'https://goldenfu.cn/webcad/'),{code:'AGENT_URL_INVALID'});
});

test('an unconnected login frame exits immediately and allows correcting its URL',async()=>{
 const listeners=[],sent=[];let frame,removed=false;
 const original={location:globalThis.location,window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage};
 Object.assign(globalThis,{location:new URL('https://goldenfu.cn/webcad/'),window:{addEventListener:(name,fn)=>listeners.push(fn)},localStorage:{getItem:()=>null,setItem:()=>{}},document:{createElement:tag=>tag==='iframe'?frame={hidden:false,contentWindow:{postMessage:value=>sent.push(value)},remove:()=>{removed=true;}}:{setAttribute(){},addEventListener(){},remove(){}}}});
 try{
  const hostControl=createHostControl(),surface={classList:{add(){},remove(){},toggle(){}},append(){}};
  const panel=createAssistantPanel({getApi:()=>({getState:()=>({displayPreferences:{}})}),hostControl,surface});
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
