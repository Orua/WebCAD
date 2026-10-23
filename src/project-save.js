// Saving committed bytes never waits for, initializes or restarts the geometry kernel.
import {serializeBoundedDocument} from './document-limits.js';
import {finalStateProject} from './project-final-state.js';

// A missing final BRep checkpoint must never prevent keeping the committed
// recipe and its original embedded assets. Recovery files use the same reader.
export async function saveCommittedProject(document,sources,options={}){
  let snapshot,reason;
  try{
    if(document.features?.length&&!sources?.length)throw Object.assign(new Error('Final geometry unavailable'),{code:'PROJECT_SNAPSHOT_UNAVAILABLE'});
    snapshot=finalStateProject(document,sources);
  }catch(error){reason=error.code||'PROJECT_SNAPSHOT_UNAVAILABLE';snapshot=document;}
  const encode=async value=>{
    try{return await encodeCommittedProject(value,options);}
    catch(error){
      // Codec startup, messaging and timeout failures do not lose the snapshot.
      if(!String(error.code||'').startsWith('PROJECT_ENCODING')&&error.code!=='WORKER_UNAVAILABLE')throw error;
      return serializeBoundedDocument(value,{includeTimeline:false});
    }
  };
  try{return {snapshot,bytes:await encode(snapshot),...(reason?{report:{saveMode:'recovery',reason}}:{})};}
  catch(error){
    if(snapshot===document)throw error;
    return {snapshot:document,bytes:await encode(document),report:{saveMode:'recovery',reason:error.code||'PROJECT_ENCODING_FAILED'}};
  }
}
export function encodeCommittedProject(document,{createWorker=()=>new Worker(new URL('./project-codec-worker.js',import.meta.url),{type:'module'}),timeoutMs=30000,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  if(document.version!==4)return Promise.resolve(serializeBoundedDocument(document));
  return new Promise((resolve,reject)=>{
    let codec;
    try{codec=createWorker();}catch(error){reject(Object.assign(error,{code:error.code||'WORKER_UNAVAILABLE'}));return;}
    let settled=false;const timer=setTimer(()=>finish(Object.assign(new Error('工程编码超时；原工程仍保留，可以重新保存'),{code:'PROJECT_ENCODING_TIMEOUT'})),timeoutMs);
    const finish=(error,bytes)=>{if(settled)return;settled=true;clearTimer(timer);codec.onmessage=codec.onerror=codec.onmessageerror=null;try{codec.terminate();}catch{}error?reject(error):resolve(bytes);};
    codec.onmessage=({data})=>data.ok?finish(null,data.bytes):finish(Object.assign(new Error(data.error),{code:data.code||'PROJECT_ENCODING_FAILED'}));
    codec.onerror=event=>finish(Object.assign(new Error(event.message||'工程编码失败；原工程仍保留'),{code:'PROJECT_ENCODING_FAILED'}));
    codec.onmessageerror=()=>finish(Object.assign(new Error('工程编码器无法返回结果；原工程仍保留，可以重新保存'),{code:'PROJECT_ENCODING_MESSAGE_ERROR'}));
    try{codec.postMessage({document});}catch(error){finish(Object.assign(error,{code:error.code||'PROJECT_ENCODING_SEND_FAILED'}));}
  });
}
