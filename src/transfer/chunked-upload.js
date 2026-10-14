// Chunked, resumable artifact upload used by hosts (Goldenluck broker, future MCP).
// The page keeps ONE copy of the bytes and sends subarray views; no per-chunk copies.
// Transport is injected so the page never owns host URLs or credentials.
import {LIMITS} from '../limits.js';

const T=LIMITS.transport;
const hex=buffer=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function sha256Hex(bytes){return hex(await crypto.subtle.digest('SHA-256',bytes));}
const mb=n=>(n/1024/1024).toFixed(1);

export function transferError(code,message,extra={}){return Object.assign(new Error(message),{code,...extra});}

export function assertArtifactSize(size,limit=T.maxArtifactBytes){
  if(!Number.isInteger(size)||size<1)throw transferError('ASSET_INVALID','导出文件为空或大小无效。');
  if(size>limit)throw transferError('SIZE_LIMIT',`导出文件 ${mb(size)} MB 超过 ${mb(limit)} MB 上限；请降低网格精度、只导出所选实体或分体导出。`,{size,limit});
}

export function planChunks(size,chunkBytes=T.chunkBytes){
  if(!Number.isInteger(chunkBytes)||chunkBytes<1)throw transferError('PARAM_SCHEMA_INVALID','chunkBytes must be positive');
  const chunks=[];for(let offset=0,index=0;offset<size;offset+=chunkBytes,index++)chunks.push({index,offset,length:Math.min(chunkBytes,size-offset)});
  return chunks;
}

/**
 * client: {start({name,size,sha256,chunkBytes,chunkCount})->{uploadId,received:number[]},
 *          status(uploadId)->{received:number[]}, putChunk(uploadId,index,view,sha256)->void,
 *          complete(uploadId)->descriptor}
 */
export async function uploadChunked({bytes,name,client,limits=T,onProgress=()=>{},signal}={}){
  if(!(bytes instanceof Uint8Array))throw transferError('ASSET_INVALID','Upload requires Uint8Array bytes');
  assertArtifactSize(bytes.byteLength,limits.maxArtifactBytes);
  const chunkBytes=limits.chunkBytes,chunks=planChunks(bytes.byteLength,chunkBytes),sha256=await sha256Hex(bytes);
  const session=await client.start({name,size:bytes.byteLength,sha256,chunkBytes,chunkCount:chunks.length});
  const uploadId=session.uploadId;let received=new Set(session.received||[]);
  const sendAll=async()=>{
    const pending=chunks.filter(c=>!received.has(c.index));let cursor=0,done=received.size;
    const worker=async()=>{
      while(cursor<pending.length){
        if(signal?.aborted)throw transferError('CANCELLED','上传已取消；可用相同 uploadId 续传。',{uploadId});
        const chunk=pending[cursor++],view=bytes.subarray(chunk.offset,chunk.offset+chunk.length),digest=await sha256Hex(view);
        for(let attempt=0;;attempt++){
          try{await client.putChunk(uploadId,chunk.index,view,digest);break;}
          catch(error){if(attempt>=limits.chunkRetries||error?.code==='HASH_MISMATCH'&&attempt>=1||error?.status===413)throw error;await new Promise(r=>setTimeout(r,200*2**attempt));}
        }
        received.add(chunk.index);onProgress({uploadId,done:++done,total:chunks.length});
      }
    };
    await Promise.all(Array.from({length:Math.min(limits.chunkConcurrency,pending.length||1)},worker));
  };
  try{await sendAll();}
  catch(error){
    // One resume pass: ask the server what it really has, then send only the gaps.
    if(error?.code==='CANCELLED'||error?.status===413)throw error;
    received=new Set((await client.status(uploadId)).received||[]);await sendAll();
  }
  return {uploadId,sha256,size:bytes.byteLength,chunkCount:chunks.length,descriptor:await client.complete(uploadId)};
}

// Client for the Goldenluck broker routes (codexagent app/webcad/api.py). The host
// supplies fetch with its own credentials; WebCAD never stores tokens.
export function createBrokerUploadClient({apiBase,sessionId,commandId,fetchImpl=fetch,headers={}}){
  const root=`${String(apiBase).replace(/\/$/,'')}/api/webcad/sessions/${encodeURIComponent(sessionId)}/artifacts/uploads`,q=`commandId=${encodeURIComponent(commandId)}`;
  const call=async(url,init)=>{const response=await fetchImpl(url,{...init,headers:{...headers,...(init.headers||{})}});const body=await response.json().catch(()=>({}));
    if(!response.ok)throw transferError(body?.error?.code||'UPLOAD_FAILED',body?.error?.message||`上传失败（HTTP ${response.status}）`,{status:response.status});return body;};
  return {
    start:meta=>call(root,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commandId,name:meta.name,size:meta.size,sha256:meta.sha256,chunkBytes:meta.chunkBytes})}),
    status:uploadId=>call(`${root}/${uploadId}?${q}`,{method:'GET'}),
    putChunk:(uploadId,index,view,sha256)=>call(`${root}/${uploadId}/chunks/${index}?${q}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Chunk-Sha256':sha256},body:view}),
    complete:uploadId=>call(`${root}/${uploadId}/complete?${q}`,{method:'POST'}),
  };
}
