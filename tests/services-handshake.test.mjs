import test from 'node:test';
import assert from 'node:assert/strict';
import {createServicesClient} from '../src/services/client.js';
import {normalizeServicesConfig} from '../src/services/settings.js';

const config={url:'https://compute.invalid/api.ashx'};
const response=(url,extra={})=>Response.json({service:'webcad-services',protocolVersion:'1.0',handshakeVersion:1,challenge:new URL(url).searchParams.get('route').split('/').at(-1),authorized:true,gatewayBuildId:'sha256:test',...extra});

test('settings handshake uses one nonce request, checks the response and has a five second deadline',async()=>{
 let calls=0,time=1000;
 const client=createServicesClient({config,credential:'test-only',now:()=>time,fetchImpl:async(url,options)=>{
  calls++;assert.match(new URL(url).searchParams.get('route'),/^\/v1\/hello\/[a-f0-9]{32}$/);
  assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,'Bearer test-only');
  assert.ok(options.signal);time+=34;return response(url);
 }});
 assert.deepEqual(await client.handshake(),{status:'connected',protocolVersion:'1.0',gatewayBuildId:'sha256:test',elapsedMs:34});
 assert.equal(calls,1);
});

test('wrong nonce or protocol never validates a connection',async()=>{
 for(const extra of [{challenge:'replayed'},{protocolVersion:'2.0'},{service:'other'},{authorized:false}]){
  const client=createServicesClient({config,credential:'test-only',fetchImpl:async url=>response(url,extra)});
  await assert.rejects(client.handshake(),{code:'SERVICES_PROTOCOL_MISMATCH'});
 }
});

test('authorization failures remain explicit',async()=>{
 const client=createServicesClient({config,credential:'wrong',fetchImpl:async()=>Response.json({code:'UNAUTHORIZED',message:'denied'},{status:401})});
 await assert.rejects(client.handshake(),error=>error.code==='UNAUTHORIZED'&&error.httpStatus===401);
});
test('visitor writes reject a legacy shared-principal server before uploading bytes',async()=>{
 const previous=globalThis.location;globalThis.location=new URL('https://example.invalid/webcad/');
 try{
  const methods=[];
  const client=createServicesClient({config:{url:'/cadservices/api.ashx',authMode:'siteSession'},fetchImpl:async(url,options)=>{methods.push(options.method);return response(url);}});
  await assert.rejects(client.upload(new File([new Uint8Array([1,2,3])],'sample.svg')),{code:'SERVICES_PROTOCOL_MISMATCH'});
  assert.deepEqual(methods,['GET']);
 }finally{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}
});
test('an accepted isolated visitor handshake is reused and sends no internal bearer',async()=>{
 const previous=globalThis.location;globalThis.location=new URL('https://example.invalid/webcad/');
 try{
  const calls=[];
  const client=createServicesClient({config:{url:'/cadservices/api.ashx',authMode:'siteSession'},fetchImpl:async(url,options)=>{
   calls.push({url,options});assert.equal(options.credentials,'same-origin');assert.equal(options.headers.Authorization,undefined);
   if(options.method==='GET')return response(url,{visitorIsolationVersion:1});
   return Response.json({jobId:'test',execution:'queued'});
  }});
  await client.submit('logo/inspect',{},'one');await client.submit('logo/inspect',{},'two');
  assert.deepEqual(calls.map(c=>c.options.method),['GET','POST','POST']);
 }finally{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}
});

test('relative and same-origin settings infer website authorization; cross-origin retains bearer',()=>{
 const previous=globalThis.location;
 try{
  globalThis.location=new URL('https://goldenfu.cn/webcad/');
  assert.equal(normalizeServicesConfig({url:'/cadservices/api.ashx'}).authMode,'siteSession');
  assert.equal(normalizeServicesConfig({url:'https://goldenfu.cn/cadservices/api.ashx'}).authMode,'siteSession');
  assert.equal(normalizeServicesConfig(config).authMode,'bearer');
  assert.throws(()=>normalizeServicesConfig({...config,authMode:'siteSession'}),{code:'PARAM_SCHEMA_INVALID'});
 }finally{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}
});
