const KEY='webcad.services.v1',OLD='webcad.logoConverter.v1',AUTH='webcad.services.credential.v1';
export const serviceError=(code,message,extra={})=>Object.assign(new Error(message),{code,...extra});
function storage(){try{if(!globalThis.localStorage)throw 0;return globalThis.localStorage;}catch{throw serviceError('CAPABILITY_UNAVAILABLE','浏览器本地存储不可用');}}
function credentials(){try{return globalThis.sessionStorage;}catch{return null;}}
export function defaultServicesConfig(){
 const location=globalThis.location;
 if(!location||!['goldenfu.cn','localhost','127.0.0.1','10.121.11.8','10.121.11.223'].includes(location.hostname))return {enabled:false,url:''};
 const origin=location.origin;
 const mount=location.pathname?.match(/^(.*)\/webcad(?:\/|$)/i)?.[1]??'';
 return {enabled:true,url:new URL(mount+'/cadservices/api.ashx',origin).href,authMode:'siteSession'};
}
export function normalizeServicesConfig(input){
 if(!input||Object.keys(input).some(k=>!['version','enabled','url','authMode','computeMode','allowGeometryUploads','authProfileId','credential','localTimeoutMs','serverWaitMs'].includes(k)))throw serviceError('PARAM_SCHEMA_INVALID','计算设置字段无效');
 let authMode=input.authMode;if(authMode!==undefined&&!['bearer','siteSession'].includes(authMode))throw serviceError('PARAM_SCHEMA_INVALID','计算授权方式无效');
 const enabled=input.enabled??true,computeMode=input.computeMode??'auto',localTimeoutMs=input.localTimeoutMs??60000,serverWaitMs=input.serverWaitMs??180000;
 if(!Number.isInteger(localTimeoutMs)||localTimeoutMs<1000||localTimeoutMs>600000||!Number.isInteger(serverWaitMs)||serverWaitMs<1000||serverWaitMs>900000)throw serviceError('PARAM_SCHEMA_INVALID','本地超时须为1–600秒，服务器提醒须为1–900秒');
 if(typeof enabled!=='boolean'||!['local','auto','serverPreferred'].includes(computeMode)||input.allowGeometryUploads!==undefined&&typeof input.allowGeometryUploads!=='boolean')throw serviceError('PARAM_SCHEMA_INVALID','执行模式或上传授权无效');
 if(input.credential!==undefined&&(typeof input.credential!=='string'||input.credential.length>512))throw serviceError('PARAM_SCHEMA_INVALID','凭据格式无效');
 let url='';if(input.url){let parsed;try{parsed=new URL(input.url,globalThis.location?.href);}catch{throw serviceError('PARAM_SCHEMA_INVALID','计算地址无效，请填写本站路径或完整地址');}
 const octets=parsed.hostname.split('.').map(Number),privateV4=/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)&&octets.every(v=>v>=0&&v<=255)&&(octets[0]===10||octets[0]===192&&octets[1]===168||octets[0]===172&&octets[1]>=16&&octets[1]<=31);
 const local=['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)||privateV4;
 if(parsed.username||parsed.password||parsed.hash||!(parsed.protocol==='https:'||parsed.protocol==='http:'&&local)||['userid','key','token'].some(k=>parsed.searchParams.has(k)))throw serviceError('PARAM_SCHEMA_INVALID','Services 支持 HTTPS 或内网 HTTP，地址不可带凭据或旧 userid');
 if(globalThis.location?.protocol==='https:'&&parsed.protocol==='http:')throw serviceError('PARAM_SCHEMA_INVALID','HTTPS页面不能直连HTTP计算端口，请使用HTTPS地址或本站转发入口');
 parsed.searchParams.delete('route');url=parsed.href;}
 if(enabled&&!url)throw serviceError('PARAM_SCHEMA_INVALID','启用 Services 须填写地址');
 if(authMode===undefined)authMode=url&&globalThis.location&&new URL(url).origin===globalThis.location.origin?'siteSession':'bearer';
 if(authMode==='siteSession'&&url){
  const expected=defaultServicesConfig().url;
  if(expected&&url===expected.replace('/cadservices/api.ashx','/AI/WebCAD/WebCADCompute.ashx'))url=expected;
  if(!globalThis.location||new URL(url).origin!==globalThis.location.origin)throw serviceError('PARAM_SCHEMA_INVALID','免鉴权连接仅限当前同域计算入口');
 }
 return {version:1,enabled,url,authMode,computeMode:'auto',localTimeoutMs,serverWaitMs,allowGeometryUploads:enabled,authProfileId:authMode==='siteSession'?'same-origin':'dedicated-services'};
}
export function getServicesCredential(){const config=getServicesConfig();try{const saved=JSON.parse(credentials()?.getItem(AUTH)||'null');return saved?.url===config.url?saved.credential:'';}catch{return '';}}
export function getServicesConfig(){
 const raw=storage().getItem(KEY);let saved;try{saved=JSON.parse(raw||'null');}catch{throw serviceError('SERVICES_CONFIG_INVALID','Services 配置损坏，请重新设置');}
 let config=saved?normalizeServicesConfig(saved):normalizeServicesConfig(defaultServicesConfig());
 let auth;try{auth=JSON.parse(credentials()?.getItem(AUTH)||'null');}catch{}
 // Known former deployment endpoints were saved per origin, but their bearer
 // authorization disappeared on every new tab. Restore them through the site's
 // same-origin entrance; keep custom endpoints, explicit off, timers and old data.
 let authorizationRestored=false;const defaults=defaultServicesConfig();
 if(config.enabled&&config.authMode==='bearer'&&!(auth?.url===config.url&&auth.credential)&&defaults.enabled){
  const previous=new URL(config.url);
  if(previous.pathname.toLowerCase()==='/cadservices/api.ashx'&&!previous.search&&!previous.port&&['goldenfu.cn','localhost','127.0.0.1','10.121.11.8','10.121.11.223'].includes(previous.hostname)){
   config=normalizeServicesConfig({...config,url:defaults.url,authMode:'siteSession',authProfileId:'same-origin'});authorizationRestored=true;
  }
 }
 return {...config,configured:!!(config.enabled&&config.url),hasCredential:!!(auth?.url===config.url&&auth.credential),authorizationRestored,migrationRequired:!saved&&!!storage().getItem(OLD),credentialStorage:config.authMode==='siteSession'?'none':'sessionStorage',storage:saved?'localStorage':'deployment-default'};
}
export function saveServicesConfig(input){
 const previous=getServicesConfig(),value=normalizeServicesConfig({localTimeoutMs:previous.localTimeoutMs,serverWaitMs:previous.serverWaitMs,...input}),store=storage(),auth=credentials();
 if(previous.url!==value.url||!value.enabled)auth?.removeItem(AUTH);
 if(input.credential&&value.enabled){if(!auth)throw serviceError('CAPABILITY_UNAVAILABLE','会话存储不可用，无法保存授权');auth.setItem(AUTH,JSON.stringify({url:value.url,credential:input.credential}));}
 // Old values remain untouched as migration backup and never authorize Services.
 store.setItem(KEY,JSON.stringify(value));return getServicesConfig();
}
export function clearServicesCredential(){credentials()?.removeItem(AUTH);return getServicesConfig();}
