import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageAPI} from '../src/page-api.js';
import {createBrowserFiles} from '../src/browser-files.js';
import {UI_LAYOUT} from '../src/ui-layout.js';
import {UI_API_ROUTES} from '../src/ui-api-coverage.js';
import {requestContext} from '../src/page-context.js';
const context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:7};
function fixture(){
 let calls=0,received;
 const api=createPageAPI({state:()=>({context,summary:{kernelReady:true,busy:false},preview:{active:false},bodies:[]}),display:()=>({}),
  view:async input=>{calls++;received=input;},execute:async input=>{calls++;received=input;return {status:'committed'};},
  files:async input=>({status:'read',revision:7,extension:'webcad',encoding:'base64',data:'e30='}),confirmSaved:()=>({saved:false})});
 return {api,get calls(){return calls;},get received(){return received;}};
}
test('snapshot contexts adapt without mutation; stale or conflicting revisions never reach host',async()=>{
 const f=fixture(),original=structuredClone(context);
 assert.equal((await f.api.setView({context,fit:true})).status,'read');
 assert.equal(f.received.context.expectedRevision,7);assert.deepEqual(context,original);
 for(const c of [{...context,revision:6},{...context,expectedRevision:6},{...context,documentInstanceId:'other'}])assert.equal((await f.api.setView({context:c,fit:true})).status,'failed');
 assert.equal(f.calls,1);assert.deepEqual(f.api.getState().requestContext,requestContext(context));
 assert.equal((await f.api.files.save({context})).status,'generated');
 const result=await f.api.invoke({method:'files.read',args:{resourceId:'missing'}});
 assert.equal(result.status,'failed');assert.equal(result.error.code,'RESOURCE_EXPIRED');assert.equal(result.error.retryable,false);
});
test('jobs retain a single receipt for timeouts; queued cancellation cannot execute',async()=>{
 const f=fixture(),input={jobId:'job',method:'execute',args:{context,idempotencyKey:'same',action:'document.rename',args:{name:'x'}}};
 assert.equal(f.api.submit(input).status,'queued');assert.equal(f.api.submit(input).status,'queued');
 await new Promise(resolve=>setTimeout(resolve,15));
 assert.equal(f.api.getJob({jobId:'job'}).status,'committed');assert.equal(f.calls,1);
 assert.equal(f.api.submit(input).result.status,'committed');assert.equal(f.calls,1);
 assert.throws(()=>f.api.submit({...input,args:{...input.args,idempotencyKey:'changed'}}),{code:'IDEMPOTENCY_KEY_REUSED'});
 f.api.submit({...input,jobId:'cancel'});assert.equal(f.api.cancelJob({jobId:'cancel'}).cancelled,true);
 await new Promise(resolve=>setTimeout(resolve,15));assert.equal(f.calls,1);
 assert.equal((await f.api.invoke({method:'getJob',args:{jobId:'job'}})).progress,null);
});
test('5 MiB project payload decodes exactly without regex stack overflow; larger files fail at declared limit',async()=>{
 const bytes=new Uint8Array(5*1024*1024).fill(0xab);bytes[0]=0;bytes[bytes.length-1]=0xff;
 const files=createBrowserFiles({command:async()=>({status:'read',revision:7,extension:'webcad',encoding:'base64',data:Buffer.from(bytes).toString('base64')}),confirmSaved:()=>({saved:false})});
 const out=await files.save({context:requestContext(context)});
 assert.equal(out.size,bytes.length);assert.deepEqual(await files.read({resourceId:out.resourceId,as:'bytes'}),bytes);
 for(const size of [25,100])await assert.rejects(files.register({name:'oversize.webcad',data:{byteLength:size*1024*1024}}),{code:'SIZE_LIMIT'});
 for(const data of ['AA=A','A===','AAA','AA$A']){
  const invalid=createBrowserFiles({command:async()=>({status:'read',revision:7,extension:'webcad',encoding:'base64',data}),confirmSaved:()=>({})});
  await assert.rejects(invalid.save({context:requestContext(context)}),{code:'ASSET_INVALID'});
 }
});
test('all configurable header/tab/control actions have public routes',()=>{
 assert.deepEqual(UI_LAYOUT.tabs.map(tab=>tab.id),['create','edit','machine','surface','inspect','view']);assert(Object.isFrozen(UI_LAYOUT.tabs));
 const actions=[...UI_LAYOUT.header.map(x=>x.action),...UI_LAYOUT.tabs.flatMap(tab=>tab.groups.flatMap(([,items])=>items)),...Object.values(UI_LAYOUT.controls).flatMap(c=>c.action?[c.action]:c.items.map(([,action])=>action))];
 for(const action of actions)assert(UI_API_ROUTES[action],action);
});
