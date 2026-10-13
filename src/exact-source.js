import {binaryHash} from './contracts/operation-schema.js';
import {fileByteBudget} from './browser-file-contracts.js';

// Source bytes are immutable shared assets; STEP is not an editable feature recipe.
export function attachExactSource(document,{key,name,format,data}){
  if(!['step','brep'].includes(format))throw Object.assign(new Error('Unsupported exact source format'),{code:'FORMAT_UNSUPPORTED'});
  const bytes=data instanceof Uint8Array?data:Uint8Array.from(atob(data),c=>c.charCodeAt(0));
  if(!bytes.length||bytes.length>fileByteBudget(`source.${format}`))throw Object.assign(new Error('Exact source exceeds its byte budget'),{code:'SIZE_LIMIT'});
  const assetHash=binaryHash(bytes).slice(7);
  document.version=4;
  document.binaryAssets={...document.binaryAssets,[assetHash]:bytes};
  document.imports[key]={format,assetHash,name};
}

export function exactSourceBytes(item,assets){
  if(item?.assetHash){
    const bytes=assets?.[item.assetHash];
    if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>fileByteBudget(`source.${item.format}`))throw Object.assign(new Error('Missing or oversized exact source asset'),{code:'ARTIFACT_CORRUPT'});
    return bytes;
  }
  if(typeof item?.data!=='string')throw Object.assign(new Error('工程中缺少原始导入文件'),{code:'ARTIFACT_CORRUPT'});
  return Uint8Array.from(atob(item.data),c=>c.charCodeAt(0));
}
