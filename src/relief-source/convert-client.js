// Browser conversion client: worker with progress + cancel + timeout, main-thread fallback.
// Deterministic: worker and fallback run the same pure sourceConvertLocal, so results are bit-identical.
import {sourceConvertLocal} from '../services/relief-pipeline.js';

/** Long side / pixel budget for decoded images: larger photos are downscaled (area-average) before conversion. */
export const RELIEF_DECODE_LIMITS=Object.freeze({maxSide:4096,maxPixels:16*1024*1024});
export const RELIEF_CONVERT_TIMEOUT_MS=180000;

/** Pure: target size for a decoded image (keeps aspect; integer; never upscales). */
export function decodeTargetSize(width,height,{maxSide=RELIEF_DECODE_LIMITS.maxSide,maxPixels=RELIEF_DECODE_LIMITS.maxPixels}={}){
 if(!(width>0&&height>0))throw Object.assign(new Error('图片尺寸无效'),{code:'RELIEF_IMAGE_INVALID'});
 const k=Math.min(1,maxSide/Math.max(width,height),Math.sqrt(maxPixels/(width*height)));
 if(k>=1)return {width,height,scale:1,downscaled:false};
 const w=Math.max(1,Math.floor(width*k)),h=Math.max(1,Math.floor(height*k));
 return {width:w,height:h,scale:k,downscaled:true};
}
/** Pure deterministic area-average RGBA downscale (used when the canvas path is unavailable, and in tests). */
export function downscaleRgba(rgba,width,height,tw,th){
 const out=new Uint8ClampedArray(tw*th*4),sx=width/tw,sy=height/th;
 for(let y=0;y<th;y++){const y0=y*sy,y1=y0+sy;for(let x=0;x<tw;x++){const x0=x*sx,x1=x0+sx;const acc=[0,0,0,0];let wsum=0;
  for(let yy=Math.floor(y0);yy<Math.min(height,Math.ceil(y1));yy++){const wy=Math.min(y1,yy+1)-Math.max(y0,yy);
   for(let xx=Math.floor(x0);xx<Math.min(width,Math.ceil(x1));xx++){const w=wy*(Math.min(x1,xx+1)-Math.max(x0,xx)),k=(yy*width+xx)*4;acc[0]+=w*rgba[k];acc[1]+=w*rgba[k+1];acc[2]+=w*rgba[k+2];acc[3]+=w*rgba[k+3];wsum+=w;}}
  const o=(y*tw+x)*4;for(let c=0;c<4;c++)out[o+c]=Math.round(acc[c]/wsum);}}
 return out;
}
/** Pure job body shared by worker and fallback. */
export function runSourceConvertJob(rgba,params,onProgress){
 for(const v of [params?.width,params?.height])if(!Number.isInteger(v)||v<1)throw Object.assign(new Error('转换参数缺少有效的图像尺寸'),{code:'PARAM_SCHEMA_INVALID'});
 return sourceConvertLocal(rgba,params,{onProgress});
}
const abortError=()=>Object.assign(new Error('已取消转换'),{code:'RELIEF_CONVERT_CANCELLED',name:'AbortError'});

/** Convert in a worker when possible. opts: {onProgress(fraction,stage), signal, timeoutMs, workerFactory, allowFallback}. */
export function convertInBackground(rgba,params,{onProgress=()=>{},signal,timeoutMs=RELIEF_CONVERT_TIMEOUT_MS,workerFactory=defaultWorkerFactory,allowFallback=true}={}){
 if(signal?.aborted)return Promise.reject(abortError());
 let worker=null;try{worker=workerFactory();}catch{worker=null;}
 if(!worker){
  if(!allowFallback)return Promise.reject(Object.assign(new Error('浏览器不支持后台转换'),{code:'RELIEF_WORKER_UNAVAILABLE'}));
  // Main-thread fallback: yield one frame so the progress text paints, then run synchronously.
  return new Promise((res,rej)=>setTimeout(()=>{if(signal?.aborted)return rej(abortError());try{res({...runSourceConvertJob(rgba,params,onProgress),where:'main'});}catch(e){rej(e);}},0));
 }
 return new Promise((res,rej)=>{
  const id=Math.random().toString(36).slice(2);let done=false;
  const finish=(fn,v)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener?.('abort',onAbort);try{worker.terminate();}catch{}fn(v);};
  const onAbort=()=>finish(rej,abortError());
  const timer=setTimeout(()=>finish(rej,Object.assign(new Error(`转换超时（>${Math.round(timeoutMs/1000)} s）；请减小网格或图片尺寸`),{code:'RELIEF_CONVERT_TIMEOUT'})),timeoutMs);
  signal?.addEventListener?.('abort',onAbort,{once:true});
  worker.onmessage=e=>{const m=e.data||{};if(m.id!==id)return;
   if(m.type==='progress')onProgress(m.fraction,m.stage);
   else if(m.type==='result')finish(res,{grid:m.grid,precision:m.precision,where:'worker'});
   else if(m.type==='error')finish(rej,Object.assign(new Error(m.message),{code:m.code}));};
  worker.onerror=e=>{e?.preventDefault?.();
   // Worker failed to load (e.g. module workers unsupported): fall back once on the main thread.
   if(done)return;done=true;clearTimeout(timer);try{worker.terminate();}catch{}
   if(!allowFallback)return rej(Object.assign(new Error('后台转换失败：'+(e?.message||'worker error')),{code:'RELIEF_WORKER_FAILED'}));
   try{res({...runSourceConvertJob(rgba,params,onProgress),where:'main'});}catch(err){rej(err);}};
  // Copy so the caller keeps its image (preview re-conversions need it).
  const copy=new Uint8ClampedArray(rgba);worker.postMessage({id,rgba:copy.buffer,params},[copy.buffer]);
 });
}
function defaultWorkerFactory(){
 if(typeof Worker!=='function')return null;
 return new Worker(new URL('./convert-worker.js',import.meta.url),{type:'module'});
}
