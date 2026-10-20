import {binaryHash} from './contracts/operation-schema.js';
import {validateReliefDesigns,updateReliefDesigns} from './relief-design-drafts.js';
import {RELIEF_REFERENCE_LIMIT,validateReliefReference,validateReliefReferenceBindings,referenceImageHeader} from './relief-design-reference-contract.js';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export async function prepareReliefReferenceSource({bytes,name,mime,expectedSha256,expectedSize}){
 if(typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256)||!Number.isSafeInteger(expectedSize)||expectedSize!==bytes?.length)fail('RELIEF_REFERENCE_INVALID','Provide the registered original SHA256 and exact size');
 const header=referenceImageHeader(bytes,mime),hash=binaryHash(bytes).slice(7);
 if(hash!==expectedSha256)fail('RELIEF_REFERENCE_INVALID','Reference bytes differ from the registered SHA256');
 if(typeof createImageBitmap!=='function')fail('CAPABILITY_UNAVAILABLE','The browser image decoder is unavailable');
 let bitmap;
 try{bitmap=await createImageBitmap(new Blob([bytes],{type:header.mime}));}catch{fail('RELIEF_REFERENCE_INVALID','The browser could not decode the original reference image');}
 try{const {width,height}=bitmap;if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||width*height>16777216||width/height<1/64||width/height>64||!((width===header.width&&height===header.height)||(width===header.height&&height===header.width)))fail('RELIEF_REFERENCE_INVALID','Decoded reference dimensions disagree with the bounded header');
  const ref=validateReliefReference({importKey:'reference-'+hash,assetHash:hash,name,mime:header.mime,sizeBytes:bytes.length,width,height});
  return {reference:ref,bytes:bytes.slice()};
 }finally{bitmap.close?.();}
}
export function applyReliefDesignReference(document,{designId,expectedDraftRevision,action,source}){
 const designs=validateReliefDesigns(document.reliefDesigns),entry=designs.find(d=>d.id===designId);
 if(!entry)fail('STALE_REFERENCE','Design draft not found');if(entry.revision!==expectedDraftRevision)fail('REVISION_CONFLICT','Read the current design draft revision');
 const draft={...entry.draft};let imports={...document.imports},binaryAssets={...document.binaryAssets};
 if(action==='attach'){
  const ref=validateReliefReference(source?.reference),bytes=source?.bytes;
  if(!(bytes instanceof Uint8Array)||bytes.length!==ref.sizeBytes||binaryHash(bytes).slice(7)!==ref.assetHash)fail('RELIEF_REFERENCE_INVALID','Original image bytes are missing or changed');
  const header=referenceImageHeader(bytes,ref.mime);if(!((header.width===ref.width&&header.height===ref.height)||(header.width===ref.height&&header.height===ref.width)))fail('RELIEF_REFERENCE_INVALID','Original image dimensions changed');
  const existing=imports[ref.importKey];if(existing&&(existing.assetHash!==ref.assetHash||existing.format!=='reference-image'))fail('RELIEF_REFERENCE_INVALID','Reference import key conflicts with an existing asset');
  const old=binaryAssets[ref.assetHash];if(old!==undefined&&(!(old instanceof Uint8Array)||old.length!==ref.sizeBytes||binaryHash(old).slice(7)!==ref.assetHash))fail('RELIEF_REFERENCE_INVALID','An existing source with this identity has corrupt bytes');
  imports[ref.importKey]={format:'reference-image',assetHash:ref.assetHash,mime:ref.mime,sizeBytes:ref.sizeBytes,width:ref.width,height:ref.height};binaryAssets[ref.assetHash]=old??bytes.slice();draft.reference=ref;
 }else if(action==='detach'){if(source!==undefined)fail('PARAM_SCHEMA_INVALID','Detach does not accept image bytes');delete draft.reference;}
 else fail('PARAM_SCHEMA_INVALID','Reference mutation supports attach or detach');
 const reliefDesigns=updateReliefDesigns(designs,{id:designId,expectedDraftRevision,draft});
 const next={...document,version:action==='attach'?4:document.version,reliefDesigns,imports,...(document.binaryAssets||action==='attach'?{binaryAssets}:{})};validateReliefReferenceBindings(next);return next;
}
export function readReliefDesignReference(document,designId,{bytes=false}={}){
 const entry=validateReliefDesigns(document.reliefDesigns).find(d=>d.id===designId);if(!entry)fail('STALE_REFERENCE','Design draft not found');
 validateReliefReferenceBindings({reliefDesigns:[entry]},document.imports);
 const reference=entry.draft.reference??null;if(!reference)return {reference:null,designId,draftRevision:entry.revision};
 if(!bytes)return {reference:{...reference},designId,draftRevision:entry.revision};
 const original=document.binaryAssets?.[reference.assetHash];if(!(original instanceof Uint8Array)||original.length!==reference.sizeBytes||binaryHash(original).slice(7)!==reference.assetHash)fail('RELIEF_REFERENCE_INVALID','Persistent original reference bytes are missing or corrupt');
 return {reference:{...reference},designId,draftRevision:entry.revision,bytes:original.slice()};
}
