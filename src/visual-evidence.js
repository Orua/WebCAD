// Read-only, bounded image cache. The page document remains the only CAD authority.
const identity=context=>['sessionId','documentId','documentInstanceId'].map(key=>context[key]).join('\n');
const error=(code,message)=>Object.assign(new Error(message),{code});
export const EVIDENCE_POLICY=Object.freeze({automatic:'off',profileVersion:1,maxEntries:12,maxBytes:8*1024*1024,maxImageBytes:1024*1024});
export function createVisualEvidence({state,signature,capture,hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join(''),now=()=>Date.now()}){
 const entries=new Map(),byId=new Map(),pending=new Map();let bytes=0,generation=null,tail=Promise.resolve(),queued=0;
 const stamp=()=>{const current=state();return {context:current.context,signature:signature()};};
 const clear=()=>{entries.clear();byId.clear();bytes=0;};
 const same=(a,b)=>identity(a.context)===identity(b.context)&&a.context.revision===b.context.revision&&a.signature===b.signature;
 const response=(entry,reused)=>({...structuredClone(entry.result),cache:{reused,policy:EVIDENCE_POLICY},generated:true,storage:'page-cache',forwardedToModelInput:'unknown'});
 async function read(input){
  const before=stamp(),binding=identity(before.context);
  if(binding!==identity(input.context))throw error('INSTANCE_MISMATCH','Evidence belongs to another page document instance.');
  if(generation!==binding){clear();generation=binding;}
  const revision=input.context.expectedRevision;
  if(input.evidenceId){const entry=byId.get(input.evidenceId);if(!entry||entry.result.context.revision!==revision||Object.keys(entry.spec).some(key=>input[key]!==undefined&&input[key]!==entry.spec[key]))throw error('EVIDENCE_UNAVAILABLE','The requested evidence image and specification are not retained.');return response(entry,true);}
  const spec={viewId:input.viewId??'iso',maxWidth:input.maxWidth??640,format:input.format??'webp',quality:input.quality??.8};
  const key=JSON.stringify([binding,revision,before.signature,EVIDENCE_POLICY.profileVersion,spec]);
  if(entries.has(key))return response(entries.get(key),true);
  if(revision!==before.context.revision)throw error('EVIDENCE_UNAVAILABLE','The requested historical revision has no cached image.');
  if(pending.has(key))return pending.get(key);
  if(queued>=2)throw error('EVIDENCE_QUEUE_FULL','One capture and one pending capture are already scheduled.');
  queued++;
  const operation=tail.catch(()=>{}).then(async()=>{
   if(!same(before,stamp()))throw error('EVIDENCE_SUPERSEDED','The document or display changed before capture.');
   const started=now(),shot=capture(spec);
   // Rendering and pixel readback are synchronous: no document can rebuild/dispose
   // shared geometry between render and readback. Encoding/hash are checked again.
   if(!same(before,stamp()))throw error('EVIDENCE_SUPERSEDED','The document or display changed during capture.');
   const match=/^data:image\/(png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(shot.dataUrl||'');
   if(!match)throw error('EVIDENCE_INVALID','Capture did not return a supported image.');
   const binary=atob(match[2]),size=binary.length;
   if(!size||size>EVIDENCE_POLICY.maxImageBytes)throw error('EVIDENCE_SIZE_LIMIT','Evidence exceeds 1 MB; request a smaller image.');
   const data=Uint8Array.from(binary,c=>c.charCodeAt(0)),digest=await hash(data),displaySignature=await hash(new TextEncoder().encode(before.signature));
   if(!same(before,stamp()))throw error('EVIDENCE_SUPERSEDED','The document or display changed while encoding evidence.');
   const evidenceId='ev_'+crypto.randomUUID().replaceAll('-','');
   const result={status:'read',evidenceStatus:'ready',evidenceId,hash:digest,displaySignature,mime:'image/'+match[1],dataUrl:shot.dataUrl,width:shot.width,height:shot.height,
    context:{...before.context},requestContext:{...input.context},viewId:spec.viewId,projection:'orthographic',profileVersion:EVIDENCE_POLICY.profileVersion,
    display:{...shot.display,status:'rendered',rendered:{documentId:before.context.documentId,documentInstanceId:before.context.documentInstanceId,revision},displayMatchesContext:true},
    bytes:size,generatedAt:new Date(now()).toISOString(),captureMs:now()-started,source:'isolated-current-scene',scope:'visible-bodies',measurement:false};
   const entry={result,size,spec};entries.set(key,entry);byId.set(evidenceId,entry);bytes+=size;
   while(entries.size>EVIDENCE_POLICY.maxEntries||bytes>EVIDENCE_POLICY.maxBytes){const oldest=entries.keys().next().value,removed=entries.get(oldest);entries.delete(oldest);byId.delete(removed.result.evidenceId);bytes-=removed.size;}
   return response(entry,false);
  }).finally(()=>{queued--;pending.delete(key);});
  pending.set(key,operation);tail=operation;return operation;
 }
 return Object.freeze({read,clear,policy:EVIDENCE_POLICY});
}
