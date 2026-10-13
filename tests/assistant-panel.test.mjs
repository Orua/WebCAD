import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssistantPanel,validateAssistantUrl} from '../src/agent/assistant-panel.js';
import {createHostControl} from '../src/host-control.js';

test('assistant URL rejects credentials, scripts and mixed content',()=>{
  assert.equal(validateAssistantUrl('/AI/WebCAD/WebCADWorkspace.aspx','https://goldenfu.cn/webcad/'),'https://goldenfu.cn/AI/WebCAD/WebCADWorkspace.aspx');
  for(const url of ['javascript:alert(1)','https://user:password@example.com/','http://example.com/','https://example.com/?token=x'])assert.throws(()=>validateAssistantUrl(url,'https://goldenfu.cn/webcad/'),{code:'AGENT_URL_INVALID'});
});
test('one-click exit unlocks immediately, preserves document, and ignores late or forged host control',async()=>{
  const listeners=[],sent=[],classes=new Set();let frame;
  const original={location:globalThis.location,window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage};
  Object.assign(globalThis,{location:new URL('https://goldenfu.cn/webcad/'),window:{addEventListener:(name,fn)=>listeners.push(fn)},localStorage:{getItem:()=>null,setItem:()=>{}},document:{createElement:()=>frame={hidden:false,contentWindow:{postMessage:value=>sent.push(value)}}}});
  try{
    const current={context:{documentId:'same',revision:4},displayPreferences:{themeColor:'#0c827d'},dirty:true,view:{camera:{position:[1,2,3]}}},before=structuredClone(current);
    const hostControl=createHostControl(),surface={classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)},append:()=>{}};
    const panel=createAssistantPanel({getApi:()=>({getState:()=>current}),hostControl,surface});
    await panel.enter();const channel=new URLSearchParams(new URL(frame.src).hash.slice(1)).get('channel');
    const event=(data,origin='https://goldenfu.cn',source=frame.contentWindow)=>({origin,source,data:{protocol:'webcad.assistant-panel/1',channel,...data}});
    await listeners[0](event({kind:'request',id:'forged',method:'host.state',args:{connected:true,locked:true}},'https://other.example'));
    assert.equal(hostControl.get().locked,false);
    await listeners[0](event({kind:'request',id:'live',method:'host.state',args:{connected:true,locked:true}}));
    assert.equal(hostControl.get().locked,true);
    const exiting=panel.exit();assert.equal(hostControl.get().locked,false);assert.equal(panel.get().visible,false);assert.equal(frame.hidden,true);
    const request=sent.findLast(item=>item.method==='panel.exit');
    await listeners[0](event({kind:'response',id:request.id,result:{status:'released'}}));await exiting;
    await listeners[0](event({kind:'request',id:'late',method:'host.state',args:{connected:true,locked:true}}));
    assert.equal(hostControl.get().connected,false);assert.equal(hostControl.get().locked,false);assert.deepEqual(current,before);
    await listeners[0](event({kind:'request',id:'late-adapter',method:'adapter.create',args:{}}));assert.equal(sent.at(-1).error.code,'lease_revoked');
  }finally{for(const [key,value]of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
