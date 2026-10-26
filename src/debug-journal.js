const SECRET=/(?:authorization|credential|password|secret|cookie|csrf|ticket|api[_-]?key|token|nonce|bearer|jwt|coaKey|privateKey)|^channel$/i;
const encoder=new TextEncoder(),encodedBytes=value=>encoder.encode(value).byteLength;
const BINARY=/^(?:base64|dataUrl|binaryAssets|brep|brepData|stepData|triangles|vertices|indices|meshData|pixelData|heights|renderedRaster|rasterOriginalContours|machiningOriginalContours)$/i;
export function debugText(value){
 return String(value).replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'[redacted]')
  .replace(/data:[^,\s]+;base64,[A-Za-z0-9+/=]+/gi,'[binary omitted]')
  .replace(/https?:\/\/[^\s<>"']+/gi,value=>{try{const u=new URL(value);return u.origin+u.pathname;}catch{return '[url]';}})
  .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi,'$1 [redacted]')
  .replace(/((?:authorization|set-cookie|cookie)\s*[:=])[^\r\n]*/gi,'$1 [redacted]')
  .replace(/((?:authorization|credential|password|secret|cookie|csrf|ticket|api[_-]?key|access[_-]?token|refresh[_-]?token|token|coaKey|密钥|令牌|密码)\s*[=:]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&]+)/gi,'$1[redacted]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted]')
  .replace(/\b[A-Z]:[\\/][^\s"'<>]+/gi,'[local path]').slice(0,2048);
}
export function debugValue(value,{maxNodes=1200,maxChars=24000}={}){
 let nodes=0,chars=0;const seen=new WeakSet();
 function visit(v,depth=0,key=''){
  if(typeof v==='boolean'&&['hasCredential','authorizationRestored'].includes(key))return v;
  if(key==='credentialStorage'&&['none','sessionStorage'].includes(v))return v;
  if(SECRET.test(key)||/^token$/i.test(key))return '[redacted]';
  if(BINARY.test(key))return '[binary/geometry omitted]';
  if(++nodes>maxNodes||chars>maxChars)return '[budget limit]';
  if(v===undefined)return '[undefined]';if(v===null||typeof v==='boolean')return v;
  if(typeof v==='number')return Number.isFinite(v)?v:`[${String(v)}]`;
  if(typeof v==='string'){const text=debugText(v).slice(0,Math.max(0,maxChars-chars));chars+=text.length;return text;}
  if(typeof v!=='object')return `[${typeof v}]`;
  if(v instanceof ArrayBuffer||ArrayBuffer.isView(v))return {type:'binary',bytes:v.byteLength};
  if(typeof Blob!=='undefined'&&v instanceof Blob)return {type:'file',bytes:v.size,mime:v.type};
  if(seen.has(v))return '[circular]';if(depth>=8)return '[depth limit]';seen.add(v);
  if(v instanceof Error||key==='error'){const result={};for(const k of ['name','code','path','stage','jobId','requestId','idempotencyKey','commitState','serviceCommitState','diagnosticsRef','message','details','report','supportBinding','stack'])if(v[k]!==undefined)result[k]=visit(v[k],depth+1,k);seen.delete(v);return result;}
  if(Array.isArray(v)){const sample=v.slice(0,16).map(x=>visit(x,depth+1,key));return v.length>16?{arrayLength:v.length,sample,truncated:true}:sample;}
  const out={};for(const k of Object.keys(v).slice(0,80)){const d=Object.getOwnPropertyDescriptor(v,k),name=debugText(k).slice(0,120);chars+=name.length;out[name]=d&&'value'in d?visit(d.value,depth+1,k):'[accessor omitted]';}return out;
 }
 return visit(value);
}
export function createDebugJournal({storage=null,now=Date.now,maxEvents=1500,maxBytes=1024*1024,maxEventBytes=8192}={}){
 const key='webcad.debug.v1';let sequence=0,events=[],sizes=[],bytes=0,dropped=0,persistTimer=null,storageError=null,restored=false,contextProvider=null;const listeners=new Set(),startedAt=now();
 try{const saved=JSON.parse(storage?.getItem(key)||'null');if(saved?.version===1&&Array.isArray(saved.events)){
  for(const e of saved.events.slice(-maxEvents)){if(!e||!Number.isSafeInteger(e.sequence)||!Number.isFinite(e.at))continue;const clean=debugValue(e);if(encodedBytes(JSON.stringify(clean))>maxEventBytes)continue;events.push(clean);sizes.push(encodedBytes(JSON.stringify(clean))+1);sequence=Math.max(sequence,e.sequence);}bytes=sizes.reduce((a,b)=>a+b,0);restored=events.length>0;
 }}catch{storageError='历史日志不可读取';}
 const trim=()=>{while(events.length&&(events.length>maxEvents||bytes>Math.max(0,maxBytes-512))){events.shift();bytes-=sizes.shift();dropped++;}};trim();
 function flush(){if(persistTimer){clearTimeout(persistTimer);persistTimer=null;}try{storage?.setItem(key,JSON.stringify({version:1,events}));}catch{storageError='会话存储不可用，日志仅保留在内存';}}
 function record(source,action,data={},level='info'){
  try{
   const event={sequence:++sequence,at:now(),source:debugText(source).slice(0,80),action:debugText(action).slice(0,160),level,data:debugValue(data)};
   if(contextProvider)try{event.context=debugValue(contextProvider(),{maxNodes:20,maxChars:500});}catch{}
   if(encodedBytes(JSON.stringify(event))>maxEventBytes){event.data=debugValue(data,{maxNodes:80,maxChars:1000});event.truncated=true;}
   if(encodedBytes(JSON.stringify(event))>maxEventBytes){event.data={truncated:true,error:debugValue(data?.error,{maxNodes:20,maxChars:300})};event.truncated=true;}
   events.push(event);const size=encodedBytes(JSON.stringify(event))+1;sizes.push(size);bytes+=size;trim();
   if(storage&&!persistTimer){persistTimer=setTimeout(flush,250);persistTimer.unref?.();}
   for(const listener of listeners)try{listener();}catch{}
   return event.sequence;
  }catch{return null;}
 }
 function read({source='all',level='all',query='',afterSequence=0,limit=500}={}){
  const needle=String(query).toLowerCase(),matching=events.filter(e=>e.sequence>afterSequence&&(source==='all'||e.source===source)&&(level==='all'||e.level===level)&&(!needle||JSON.stringify(e).toLowerCase().includes(needle)));
  return {coverage:{startedAt,oldestAt:events[0]?.at??null,restored,dropped,retained:events.length,retainedBytes:bytes,maxEvents,maxBytes,maxEventBytes,storage:storage?'sessionStorage':'memory',storageError,scope:'current tab; bounded recent events; no historical server disk logs'},matching:matching.length,events:structuredClone(matching.slice(-limit)),lastSequence:sequence};
 }
 return {record,read,flush,setContextProvider:fn=>{contextProvider=fn;},subscribe:listener=>{listeners.add(listener);return ()=>listeners.delete(listener);}};
}
let storage=null;try{storage=globalThis.sessionStorage??null;}catch{}
const slot=Symbol.for('webcad.debug.journal.v1');
const shared=globalThis[slot]??(globalThis[slot]={journal:createDebugJournal({storage}),runtimeInstalled:false});
export const debugJournal=shared.journal;
export function debugResult(value){
 if(!value||typeof value!=='object')return value;
 if(ArrayBuffer.isView(value)||value instanceof ArrayBuffer)return {bytes:value.byteLength};
 const keys=['requestId','status','code','commitState','context','nextContext','createdBodyIds','jobId','pageJobId','assetId','requestKey','execution','error','result','results','report','details','logoId','sourceResourceId','sizeMm','machiningReadiness','volume','area','bounds','solidCount','shellCount','geometryType','name','size','bytes','sha256','resourceId','saved','dirty','saveConfirmation','attachment','display','view','summary','protocolVersion','gatewayBuildId','pageApiVersion','catalogHash','docsHash','elapsedMs'];
 keys.push('preparationId','recipeHash','questions','autoFilled','nextCall','expiresAt','reused','baseline');
 return Object.fromEntries(keys.filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));
}
export function traceDebug(source,action,input,fn){
 const at=Date.now(),span=debugJournal.record(source,action,{phase:'start',input});
 const finish=value=>{const status=value===false?'failed':value?.status??'returned';debugJournal.record(source,action,{phase:'end',span,elapsedMs:Date.now()-at,status,commitState:value?.commitState,error:value?.error,result:debugResult(value)},['failed','unknown','partial'].includes(status)?'error':'info');return value;};
 const fail=error=>{debugJournal.record(source,action,{phase:'error',span,elapsedMs:Date.now()-at,error},'error');throw error;};
 try{const result=fn();return result&&typeof result.then==='function'?result.then(finish,fail):finish(result);}catch(error){return fail(error);}
}
export function makeDebugReport(state,options={}){
 return {format:'webcad-debug',version:1,capturedAt:new Date().toISOString(),...debugJournal.read(options),...(options.includeState===false?{}:{state:debugValue(state,{maxNodes:8000})}),redaction:{credentials:'removed',binaryGeometry:'omitted',largeArrays:'sampled; arrayLength preserved',undefinedAndNonFinite:'explicit markers'},limitations:['记录从本功能加载时开始，保留当前标签页最近日志；刷新可恢复同一标签页的脱敏日志。','不读取服务器磁盘日志、其他标签页或此前未记录的操作。','这是诊断快照，不能代替工程文件、精确几何或保存成功回执。']};
}
export function debugAIText(report){
 const bundle={...report,events:report.events.slice(-100),recentErrors:report.events.filter(e=>e.level==='error').slice(-12),exportScope:'AI compact report; full logs available as download'};
 let text=JSON.stringify(bundle,null,2);
 while(encodedBytes(text)>96000&&bundle.events.length){bundle.events.shift();text=JSON.stringify(bundle,null,2);}
 if(encodedBytes(text)>96000){bundle.state=debugValue(bundle.state,{maxNodes:300,maxChars:12000});bundle.recentErrors=bundle.recentErrors.slice(-3);bundle.truncated=true;text=JSON.stringify(bundle,null,2);}
 while(encodedBytes(text)>96000&&bundle.recentErrors.length){bundle.recentErrors.shift();text=JSON.stringify(bundle,null,2);}
 return text;
}
if(typeof window!=='undefined'&&!shared.runtimeInstalled){
 shared.runtimeInstalled=true;
 debugJournal.record('runtime','page-start',{url:location.href});
 window.addEventListener('error',e=>debugJournal.record('runtime','error',{error:e.error||e.message,filename:e.filename||e.target?.src||e.target?.href,line:e.lineno,column:e.colno},'error'),true);
 window.addEventListener('unhandledrejection',e=>debugJournal.record('runtime','unhandled-rejection',{error:e.reason},'error'));
 window.addEventListener('pagehide',()=>debugJournal.flush());
}
