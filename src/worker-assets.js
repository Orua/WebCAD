import {binaryHash} from './contracts/operation-schema.js';

export function packWorkerDocument(document,known=new Set()){
  const updates={},refs={};
  for(const table of ['binaryAssets','compiledArtifacts']){
    updates[table]={};refs[table]=Object.keys(document[table]||{});
    for(const [hash,bytes]of Object.entries(document[table]||{}))if(!known.has(`${table}:${hash}`))updates[table][hash]=bytes;
  }
  return {document:{...document,binaryAssets:undefined,compiledArtifacts:undefined},assetUpdates:updates,assetRefs:refs};
}
export function unpackWorkerDocument(packet,cache){
  if(!packet.assetRefs)return packet.document;
  const document={...packet.document};
  for(const table of ['binaryAssets','compiledArtifacts']){
    for(const [hash,bytes]of Object.entries(packet.assetUpdates?.[table]||{})){
      if(!(bytes instanceof Uint8Array)||binaryHash(bytes).slice(7)!==hash)throw Object.assign(new Error('Worker asset hash mismatch'),{code:'ARTIFACT_CORRUPT'});
      cache.set(`${table}:${hash}`,bytes);
    }
    document[table]={};for(const hash of packet.assetRefs[table]){const bytes=cache.get(`${table}:${hash}`);if(!bytes)throw Object.assign(new Error('Worker asset unavailable; resend original source'),{code:'ARTIFACT_CORRUPT'});document[table][hash]=bytes;}
  }
  return document;
}
