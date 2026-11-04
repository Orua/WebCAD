import test from 'node:test';
import assert from 'node:assert/strict';
import {getServicesConfig,getServicesCredential,saveServicesConfig,clearServicesCredential,defaultServicesConfig,normalizeServicesConfig} from '../src/services/settings.js';
import {createServicesClient} from '../src/services/client.js';
import {chooseExecutor} from '../src/services/execution-router.js';
import {getLogoConverterConfig,setLogoConverterConfig} from '../src/logo-converter-settings.js';
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
function servicesEnvironment(t,href='https://cad.invalid/webcad/'){
 const keys=['location','localStorage','sessionStorage','WEBCAD_DEPLOYMENT_CONFIG'],original=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
 t.after(()=>{for(const [key,value]of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 Object.assign(globalThis,{location:new URL(href),localStorage:memory(),sessionStorage:memory()});delete globalThis.WEBCAD_DEPLOYMENT_CONFIG;
}

test('部署配置沿用地址、同源、HTTPS 和字段校验',t=>{
 servicesEnvironment(t);
 for(const services of [null,[],{enabled:true},{enabled:'yes',url:'/compute'},
  {enabled:true,url:'https://other.invalid/compute',authMode:'siteSession'},
  {enabled:true,url:'http://127.0.0.1/compute'},
  {enabled:true,url:'https://user:secret@compute.invalid/api'},
  {enabled:true,url:'https://compute.invalid/api?token=secret'},
  {enabled:true,url:'https://compute.invalid/api#fragment'},
  {enabled:true,url:'javascript:alert(1)'},
  {enabled:true,url:'/compute',unknown:true}]){
  globalThis.WEBCAD_DEPLOYMENT_CONFIG={services};
  assert.throws(()=>defaultServicesConfig(),{code:'PARAM_SCHEMA_INVALID'});
 }
 globalThis.WEBCAD_DEPLOYMENT_CONFIG={services:{enabled:true,url:'https://compute.invalid:8443/api',authMode:'bearer'}};
 assert.equal(getServicesConfig().url,'https://compute.invalid:8443/api');assert.equal(getServicesConfig().authMode,'bearer');assert.equal(getServicesConfig().hasCredential,false);
});

test('已有配置、有效凭据与关闭选择优先于部署默认且不被读取改写',t=>{
 servicesEnvironment(t);
 const url='https://compute.invalid:8443/api.ashx',saved=JSON.stringify(normalizeServicesConfig({url,localTimeoutMs:125000,serverWaitMs:240000}));
 const auth=JSON.stringify({url,credential:'existing-test-only'}),legacy=JSON.stringify({url:'https://old.invalid/Convert.ashx?userid=2',key:'legacy-only'});
 localStorage.setItem('webcad.services.v1',saved);localStorage.setItem('webcad.logoConverter.v1',legacy);sessionStorage.setItem('webcad.services.credential.v1',auth);
 globalThis.WEBCAD_DEPLOYMENT_CONFIG={services:{enabled:true,url:'/compute'},servicesMigrationUrls:[url]};
 const config=getServicesConfig();assert.equal(config.url,url);assert.equal(config.authMode,'bearer');assert.equal(config.authorizationRestored,false);assert.equal(config.hasCredential,true);assert.equal(getServicesCredential(),'existing-test-only');
 assert.equal(config.localTimeoutMs,125000);assert.equal(config.serverWaitMs,240000);assert.equal(config.storage,'localStorage');
 assert.equal(localStorage.getItem('webcad.services.v1'),saved);assert.equal(sessionStorage.getItem('webcad.services.credential.v1'),auth);assert.equal(localStorage.getItem('webcad.logoConverter.v1'),legacy);
 const off=JSON.stringify({...JSON.parse(saved),enabled:false});localStorage.setItem('webcad.services.v1',off);
 assert.equal(getServicesConfig().enabled,false);assert.equal(getServicesConfig().authorizationRestored,false);assert.equal(getServicesCredential(),'existing-test-only');assert.equal(localStorage.getItem('webcad.services.v1'),off);
 globalThis.WEBCAD_DEPLOYMENT_CONFIG={services:{enabled:true,url:'http://public.invalid/unsafe'}};
 assert.equal(getServicesConfig().url,url);assert.equal(getServicesConfig().enabled,false);
});

test('旧 Services 地址仅在部署名单显式允许时迁移至同源入口',t=>{
 servicesEnvironment(t,'http://localhost/webcad/');
 const oldUrl='http://10.0.0.8/cadservices/api.ashx',saved=JSON.stringify(normalizeServicesConfig({url:oldUrl,authMode:'bearer',localTimeoutMs:90000,serverWaitMs:300000}));
 localStorage.setItem('webcad.services.v1',saved);
 assert.equal(getServicesConfig().url,oldUrl);assert.equal(getServicesConfig().authorizationRestored,false);
 globalThis.WEBCAD_DEPLOYMENT_CONFIG={services:{enabled:true,url:'/cadservices/api.ashx',authMode:'siteSession'}};
 assert.equal(getServicesConfig().url,oldUrl);
 globalThis.WEBCAD_DEPLOYMENT_CONFIG.servicesMigrationUrls=[oldUrl];
 const migrated=getServicesConfig();assert.equal(migrated.url,'http://localhost/cadservices/api.ashx');assert.equal(migrated.authMode,'siteSession');assert.equal(migrated.authorizationRestored,true);assert.equal(migrated.localTimeoutMs,90000);assert.equal(migrated.serverWaitMs,300000);assert.equal(localStorage.getItem('webcad.services.v1'),saved);
 globalThis.WEBCAD_DEPLOYMENT_CONFIG.servicesMigrationUrls=[oldUrl.replace('/api.ashx','/other.ashx')];assert.equal(getServicesConfig().url,oldUrl);
 globalThis.WEBCAD_DEPLOYMENT_CONFIG={services:{enabled:true,url:'https://other.invalid/compute',authMode:'bearer'},servicesMigrationUrls:[oldUrl]};assert.equal(getServicesConfig().url,oldUrl);
 globalThis.WEBCAD_DEPLOYMENT_CONFIG.services.authMode='siteSession';assert.throws(()=>getServicesConfig(),{code:'PARAM_SCHEMA_INVALID'});
 globalThis.WEBCAD_DEPLOYMENT_CONFIG={services:{enabled:true,url:'/compute'},servicesMigrationUrls:['http://public.invalid/unsafe']};assert.throws(()=>getServicesConfig(),{code:'PARAM_SCHEMA_INVALID'});
 globalThis.WEBCAD_DEPLOYMENT_CONFIG.servicesMigrationUrls='*';assert.throws(()=>getServicesConfig(),{code:'PARAM_SCHEMA_INVALID'});
});

test('同源旧入口不因部署默认被隐式改写，只有显式名单才允许迁移',t=>{
 servicesEnvironment(t,'https://cad.invalid/subdir/webcad/');
 const oldUrl='https://cad.invalid/subdir/AI/WebCAD/WebCADCompute.ashx',saved=JSON.stringify(normalizeServicesConfig({url:oldUrl,authMode:'siteSession'}));
 localStorage.setItem('webcad.services.v1',saved);globalThis.WEBCAD_DEPLOYMENT_CONFIG={services:{enabled:true,url:'/subdir/cadservices/api.ashx'}};
 assert.equal(getServicesConfig().url,oldUrl);
 globalThis.WEBCAD_DEPLOYMENT_CONFIG.servicesMigrationUrls=[oldUrl];assert.equal(getServicesConfig().url,'https://cad.invalid/subdir/cadservices/api.ashx');assert.equal(localStorage.getItem('webcad.services.v1'),saved);
});
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
 assert.equal(saveServicesConfig({url:'http://10.0.0.223/cadservices/api.ashx',credential:'test-only'}).configured,true);
 assert.equal(getServicesConfig().url,'http://10.0.0.223/cadservices/api.ashx');
 assert.throws(()=>saveServicesConfig({url:'http://8.8.8.8/api.ashx'}),{code:'PARAM_SCHEMA_INVALID'});
 assert.throws(()=>saveServicesConfig({url:'http://public.invalid/api.ashx'}),{code:'PARAM_SCHEMA_INVALID'});
});

test('新环境不按域名、IP 或挂载路径自动启用 Services',async t=>{
 servicesEnvironment(t);
 for(const href of ['https://goldenfu.cn/GOLDENLUCK/webcad/?document=fixture','https://goldenfu.cn/webcad/','http://localhost/webcad/','http://127.0.0.1/webcad/','http://10.0.0.8/webcad/','http://10.0.0.223/webcad/','https://cad.invalid/subdir/']){
  globalThis.location=new URL(href);
  assert.deepEqual(defaultServicesConfig(),{enabled:false,url:''});
  const config=getServicesConfig();assert.equal(config.enabled,false);assert.equal(config.configured,false);assert.equal(config.url,'');
  let requests=0;
  await assert.rejects(createServicesClient({fetchImpl:()=>{requests++;}}).capabilities(),{code:'CAPABILITY_UNAVAILABLE'});
  assert.equal(requests,0);assert.equal(localStorage.getItem('webcad.services.v1'),null);
 }
 delete globalThis.location;assert.deepEqual(defaultServicesConfig(),{enabled:false,url:''});
});

test('显式部署配置支持虚拟目录，普通规范化不迁移旧计算地址',t=>{
 servicesEnvironment(t,'https://cad.invalid/subdir/webcad/');
 globalThis.WEBCAD_DEPLOYMENT_CONFIG={services:{enabled:true,url:'/subdir/cadservices/api.ashx',authMode:'siteSession'}};
 assert.equal(defaultServicesConfig().url,'https://cad.invalid/subdir/cadservices/api.ashx');
 assert.equal(getServicesConfig().authProfileId,'same-origin');assert.equal(getServicesConfig().configured,true);
 assert.equal(getServicesConfig().storage,'deployment-default');
 assert.equal(normalizeServicesConfig({url:'/subdir/AI/WebCAD/WebCADCompute.ashx',authMode:'siteSession'}).url,'https://cad.invalid/subdir/AI/WebCAD/WebCADCompute.ashx');
 assert.throws(()=>normalizeServicesConfig({url:'https://other.invalid/cadservices/api.ashx',authMode:'siteSession'}),{code:'PARAM_SCHEMA_INVALID'});
 globalThis.WEBCAD_DEPLOYMENT_CONFIG={services:{url:'/subdir/cadservices/api.ashx'}};
 assert.equal(getServicesConfig().enabled,false);
 globalThis.WEBCAD_DEPLOYMENT_CONFIG.services.enabled=undefined;assert.equal(getServicesConfig().enabled,false);
});

test('an empty IIS 404 is a computation path error, never a successful capability response',async()=>{
 const client=createServicesClient({config:{url:'http://localhost/cadservices/api.ashx'},credential:'test-only',fetchImpl:async()=>new Response('',{status:404})});
 await assert.rejects(client.capabilities(),error=>error.httpStatus===404&&error.code==='SERVICES_REQUEST_FAILED'&&error.message.includes('计算接口未找到'));
});

test('same-origin compute omits cookies and bearer while custom endpoints retain explicit authorization',async()=>{
 const previous=globalThis.location;
 try{
  globalThis.location=new URL('https://goldenfu.cn/webcad/');globalThis.localStorage=memory();globalThis.sessionStorage=memory();
  const calls=[];const fetchImpl=async(url,options)=>{calls.push({url,options});return Response.json({protocolVersion:'1.0',supportedClientProtocolRange:['1.0']});};
  await createServicesClient({config:{url:'/cadservices/api.ashx',authMode:'siteSession'},fetchImpl}).capabilities();
  assert.equal(new URL(calls[0].url).pathname,'/cadservices/api.ashx');
  assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.headers.Authorization,undefined);
  await createServicesClient({config:{url:'https://compute.invalid/api.ashx'},credential:'explicit-test-only',fetchImpl}).capabilities();
  assert.equal(calls[1].options.headers.Authorization,'Bearer explicit-test-only');assert.equal(calls[1].options.credentials,'omit');
 }finally{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}
});

test('a custom compute authority preserves its port and cannot downgrade an HTTPS editor',()=>{
 const previous=globalThis.location;
 try{
  globalThis.location=new URL('https://goldenfu.cn/webcad/');
  const custom=normalizeServicesConfig({url:'https://compute.example:8443/cadservices/api.ashx'});
  assert.equal(custom.url,'https://compute.example:8443/cadservices/api.ashx');
  assert.equal(custom.authMode,'bearer');
  globalThis.localStorage=memory();globalThis.sessionStorage=memory();
  const configured=saveServicesConfig({url:'https://goldenfu.cn:8443/cadservices/api.ashx'});
  assert.equal(configured.url,'https://goldenfu.cn:8443/cadservices/api.ashx');
  assert.equal(configured.authMode,'bearer');
  assert.equal(getServicesConfig().authorizationRestored,false);
  assert.equal(getServicesConfig().url,configured.url);
  assert.throws(()=>normalizeServicesConfig({url:'http://10.0.0.8:8080/cadservices/api.ashx'}),error=>error.code==='PARAM_SCHEMA_INVALID'&&error.message.includes('HTTPS页面不能直连'));
  globalThis.location=new URL('http://127.0.0.1:17674/');
  assert.equal(normalizeServicesConfig({url:'http://10.0.0.8:8080/cadservices/api.ashx'}).url,'http://10.0.0.8:8080/cadservices/api.ashx');
 }finally{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}
});
