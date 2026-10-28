// Module worker: relief.source-convert-1 off the main thread (photo relief on 1025² grids takes seconds).
// Protocol: in {id,rgba:ArrayBuffer,params} → out {id,type:'progress',fraction,stage} | {id,type:'result',grid,precision} | {id,type:'error',code,message}.
import {runSourceConvertJob} from './convert-client.js';
self.onmessage=e=>{
 const {id,rgba,params}=e.data||{};
 try{
  const out=runSourceConvertJob(new Uint8ClampedArray(rgba),params,(fraction,stage)=>self.postMessage({id,type:'progress',fraction,stage}));
  self.postMessage({id,type:'result',grid:out.grid,precision:out.precision});
 }catch(err){self.postMessage({id,type:'error',code:err?.code||'RELIEF_CONVERT_FAILED',message:String(err?.message||err)});}
};
