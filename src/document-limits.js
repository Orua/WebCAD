import {FILE_LIMITS} from './browser-file-contracts.js';
import {preflightProjectV4} from './mesh/project-v4.js';
import {encodeProjectV4} from './project-container.js';
import {encodeProjectV3} from './project-container.js';

export const DOCUMENT_LIMITS=Object.freeze({maxFeatures:2000,maxBytes:FILE_LIMITS.maxBytes,preflightReserveBytes:4096});
function limit(path,message){throw Object.assign(new Error(message),{code:'SIZE_LIMIT',path,retryable:false,recoveryAction:'CORRECT_PARAMETERS'});}
export function assertFeatureCapacity(features,additionalCount=0){
  if(features.length+additionalCount>DOCUMENT_LIMITS.maxFeatures)limit('document.features',`工程操作最多 ${DOCUMENT_LIMITS.maxFeatures} 项；请减少操作或拆分工程。原工程保留。`);
}
// Check the same compact UTF-8 representation used by files.save. Preflight
// excludes the timeline because recordTimeline may trim it before commit.
export function serializeBoundedDocument(doc,{includeTimeline=true,reserveBytes=0}={}){
  assertFeatureCapacity(doc.features);
  const bytes=doc.version===4?encodeProjectV4(doc,{includeTimeline}):doc.version===3?encodeProjectV3(doc,{includeTimeline}):new TextEncoder().encode(JSON.stringify(includeTimeline?doc:{...doc,timeline:undefined}));
  const maxBytes=doc.version===4?1024*1024*1024:DOCUMENT_LIMITS.maxBytes;
  if(bytes.byteLength>maxBytes-reserveBytes)limit('document',`自包含工程超过 ${maxBytes/1024/1024} MiB 浏览器文件限额；请拆分工程。原工程保留。`);
  return bytes;
}

export function assertDocumentCapacity(doc,options={}){assertFeatureCapacity(doc.features);return doc.version===4?preflightProjectV4(doc,options):serializeBoundedDocument(doc,options);}
