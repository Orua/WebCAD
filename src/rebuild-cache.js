import {geometryFeatureSignature} from './services/geometry-signature.js';
import {binaryHash} from './contracts/operation-schema.js';
import {LOCAL_KERNEL_BUILD_ID,LOCAL_REBUILD_SEMANTICS} from './services/geometry-exchange.js';

// Assets are immutable within the document protocol. Never use body IDs alone
// as cache identities: a changed input invalidates its complete dependency chain.
export function rebuildFingerprints(document){
  const keys=new Map(),version=[LOCAL_KERNEL_BUILD_ID,LOCAL_REBUILD_SEMANTICS];
  for(const f of document.features){
    if(!f.id||keys.has(f.id))throw new Error('特征 ID 缺失或重复');
    const refs=(f.refs||[]).map(id=>{if(!keys.has(id))throw new Error(`找不到引用实体 ${id}`);return keys.get(id);});
    const importKey=f.op==='import'?f.params?.key:f.op==='meshHeightfieldRelief'?f.params?.heights?.importKey:null;
    const item=importKey?document.imports?.[importKey]:null;
    keys.set(f.id,binaryHash(new TextEncoder().encode(JSON.stringify([version,geometryFeatureSignature(f),refs,item]))));
  }
  return keys;
}
