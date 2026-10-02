import {FILE_LIMITS} from './browser-file-contracts.js';

export const DOCUMENT_LIMITS=Object.freeze({maxFeatures:2000,maxBytes:FILE_LIMITS.maxBytes,preflightReserveBytes:4096});
function limit(path,message){throw Object.assign(new Error(message),{code:'SIZE_LIMIT',path,retryable:false,recoveryAction:'CORRECT_PARAMETERS'});}
export function assertFeatureCapacity(features,additionalCount=0){
  if(features.length+additionalCount>DOCUMENT_LIMITS.maxFeatures)limit('document.features',`工程操作最多 ${DOCUMENT_LIMITS.maxFeatures} 项；请减少操作或拆分工程。原工程保留。`);
}
// Check the same compact UTF-8 representation used by files.save. Preflight
// excludes the timeline because recordTimeline may trim it before commit.
export function serializeBoundedDocument(doc,{includeTimeline=true,reserveBytes=0}={}){
  assertFeatureCapacity(doc.features);
  const bytes=new TextEncoder().encode(JSON.stringify(includeTimeline?doc:{...doc,timeline:undefined}));
  if(bytes.byteLength>DOCUMENT_LIMITS.maxBytes-reserveBytes)limit('document','自包含工程超过 20 MiB 浏览器文件限额；请拆分工程。原工程保留。');
  return bytes;
}
