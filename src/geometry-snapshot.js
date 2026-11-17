import {binaryHash} from './contracts/operation-schema.js';
import {validateRigidMatrix} from './rigid-instance.js';
const fail=()=>{throw Object.assign(new Error('Geometry snapshot identity mismatch; committed snapshot retained'),{code:'ARTIFACT_CORRUPT',commitState:'not_committed'});};
export function snapshotDelta(sources,knownHashes=[],context){
  const known=new Set(knownHashes),assets={};
  for(const source of sources)if(!known.has(source.sourceHash)){assets[source.sourceHash]=source.data;known.add(source.sourceHash);}
  return {context,entries:sources.map(({data,...entry})=>entry),assets};
}
export function installSnapshotDelta(delta,previous,context){
  if(JSON.stringify(delta.context)!==JSON.stringify(context))fail();
  const assets=new Map((previous||[]).map(s=>[s.sourceHash,s.data]));
  for(const [hash,bytes]of Object.entries(delta.assets||{})){if(!(bytes instanceof Uint8Array)||binaryHash(bytes).slice(7)!==hash)fail();assets.set(hash,bytes);}
  const ids=new Set();return delta.entries.map(entry=>{const data=assets.get(entry.sourceHash);if(!data||ids.has(entry.id)||!['mesh','brep'].includes(entry.format))fail();ids.add(entry.id);if(entry.location)validateRigidMatrix(entry.location);return {...entry,data};});
}
