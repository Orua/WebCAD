// Saving committed bytes never waits for, initializes or restarts the geometry kernel.
import {serializeBoundedDocument} from './document-limits.js';
export function encodeCommittedProject(document,{createWorker=()=>new Worker(new URL('./project-codec-worker.js',import.meta.url),{type:'module'})}={}){
  if(document.version!==4)return Promise.resolve(serializeBoundedDocument(document));
  return new Promise((resolve,reject)=>{
    let codec;
    try{codec=createWorker();}catch(error){reject(error);return;}
    const finish=(error,bytes)=>{codec.terminate();error?reject(error):resolve(bytes);};
    codec.onmessage=({data})=>data.ok?finish(null,data.bytes):finish(Object.assign(new Error(data.error),{code:data.code||'PROJECT_ENCODING_FAILED'}));
    codec.onerror=event=>finish(Object.assign(new Error(event.message||'工程编码失败；原工程仍保留'),{code:'PROJECT_ENCODING_FAILED'}));
    try{codec.postMessage({document});}catch(error){finish(error);}
  });
}
