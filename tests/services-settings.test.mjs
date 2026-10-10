import test from 'node:test';
import assert from 'node:assert/strict';
import {getServicesConfig,saveServicesConfig,clearServicesCredential} from '../src/services/settings.js';
import {createServicesClient} from '../src/services/client.js';
import {chooseExecutor} from '../src/services/execution-router.js';
import {getLogoConverterConfig,setLogoConverterConfig} from '../src/logo-converter-settings.js';
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('a failed job retains actual worker diagnostics and an observation disconnect retains its job identity',async()=>{
 const failed={jobId:'fixture-job',execution:'failed',commit:'notCommitted',error:{code:'INVALID_CONTOUR',stage:'region-11-mask',message:'带孔面无效',diagnosticsRef:'fixture-report'}};
 const client=createServicesClient({config:{url:'http://localhost/cadservices/api.ashx'},credential:'test-only',fetchImpl:async()=>new Response(JSON.stringify(failed),{headers:{'Content-Type':'application/json'}})});
 await assert.rejects(client.wait(failed),error=>error.code==='INVALID_CONTOUR'&&error.jobId==='fixture-job'&&error.stage==='region-11-mask'&&error.diagnosticsRef==='fixture-report'&&error.commitState==='notCommitted'&&error.message.includes('带孔面无效'));
 const stopped=new AbortController();stopped.abort();
 await assert.rejects(client.wait({jobId:'accepted-job',execution:'running'},{signal:stopped.signal}),error=>error.code==='OBSERVATION_CANCELLED'&&error.jobId==='accepted-job');
 const disconnected=createServicesClient({config:{url:'http://localhost/cadservices/api.ashx'},credential:'test-only',fetchImpl:async()=>{throw new TypeError('network lost');}});
 await assert.rejects(disconnected.wait({jobId:'persisted-job',requestKey:'persisted-key',execution:'running'}),error=>error.code==='SERVICES_CONNECTION_UNKNOWN'&&error.jobId==='persisted-job'&&error.idempotencyKey==='persisted-key'&&error.commitState==='unknown');
 await assert.rejects(client.upload({size:20*1024*1024+1,arrayBuffer:()=>{throw Error('Oversized source must not be read');}},{kind:'brep'}),{code:'SIZE_LIMIT'});
});
test('one Services fact source never promotes legacy credentials or discloses authorization',async()=>{
 globalThis.localStorage=memory();globalThis.sessionStorage=memory();localStorage.setItem('webcad.logoConverter.v1',JSON.stringify({url:'https://old.invalid/Convert.ashx?userid=2',key:'old'}));
 assert.equal(getServicesConfig().migrationRequired,true);assert.equal(getServicesConfig().hasCredential,false);
 assert.throws(()=>setLogoConverterConfig({url:'https://old.invalid',key:'old'}),{code:'SERVICES_MIGRATION_REQUIRED'});
 const config=saveServicesConfig({url:'https://services.invalid/api.ashx',credential:'private-test-value',computeMode:'auto'});assert.equal(config.hasCredential,true);assert.equal(JSON.stringify(config).includes('private-test-value'),false);assert.equal('key' in getLogoConverterConfig(),false);assert.equal(localStorage.getItem('webcad.services.v1').includes('private-test-value'),false);
 let called=false;await assert.rejects(createServicesClient({config:{url:'https://different.invalid/api.ashx'},fetchImpl:()=>{called=true;}}).capabilities(),{code:'SERVICES_AUTH_REQUIRED'});assert.equal(called,false);
 saveServicesConfig({url:'https://different.invalid/api.ashx'});assert.equal(getServicesConfig().hasCredential,false);clearServicesCredential();
 assert.throws(()=>saveServicesConfig({url:'http://public.invalid/api.ashx'}),{code:'PARAM_SCHEMA_INVALID'});
 assert.throws(()=>saveServicesConfig({url:'https://services.invalid/api.ashx?userid=2'}),{code:'PARAM_SCHEMA_INVALID'});
});
test('authorized Services configuration routes complexity without the legacy upload toggle; unverified semantics and codec block',()=>{
 globalThis.localStorage=memory();globalThis.sessionStorage=memory();
 const config=saveServicesConfig({url:'https://services.invalid/api.ashx',credential:'test-only',computeMode:'auto',allowGeometryUploads:false});
 const caps={operations:[{operation:'relief',semanticVersion:'2',enabled:true,acceptanceStatus:'pending'}]};
 // A stale caller may still pass the retired upload flag, even when settings
 // normalizes Services configuration into upload authorization.
 const input={servicesAvailable:config.enabled&&!!config.url,mode:config.computeMode,operation:'relief',semanticVersion:'2',capabilities:caps,allowUpload:false,clientImportReady:true,pattern:{regions:24}};
 assert.equal(input.servicesAvailable,true);assert.equal(config.hasCredential,true);assert.equal(input.allowUpload,false);
 assert.equal(chooseExecutor(input).executor,'blocked');assert.equal(chooseExecutor(input).routingReason,'remote-semantic-not-accepted');
 caps.operations[0].acceptanceStatus='bridge-passed-project-gates-pending';
 assert.equal(chooseExecutor(input).executor,'remote');
 assert.equal(chooseExecutor({...input,clientImportReady:false}).executor,'blocked');
 assert.equal(chooseExecutor({...input,clientImportReady:false}).routingReason,'client-geometry-bridge-not-accepted');
 assert.equal(chooseExecutor({...input,pattern:{regions:1},capabilities:null}).executor,'local');
 clearServicesCredential();const cleared=getServicesConfig();
 assert.equal(cleared.hasCredential,false);
 assert.equal(chooseExecutor({...input,servicesAvailable:cleared.enabled&&!!cleared.url,capabilities:null}).executor,'blocked');
 assert.equal(chooseExecutor({...input,servicesAvailable:false}).executor,'local');
});

test('private LAN HTTP is accepted without admitting public HTTP endpoints',()=>{
 globalThis.localStorage=memory();globalThis.sessionStorage=memory();
 assert.equal(saveServicesConfig({url:'http://10.121.11.223/cadservices/api.ashx',credential:'test-only'}).configured,true);
 assert.equal(getServicesConfig().url,'http://10.121.11.223/cadservices/api.ashx');
 assert.throws(()=>saveServicesConfig({url:'http://8.8.8.8/api.ashx'}),{code:'PARAM_SCHEMA_INVALID'});
 assert.throws(()=>saveServicesConfig({url:'http://public.invalid/api.ashx'}),{code:'PARAM_SCHEMA_INVALID'});
});