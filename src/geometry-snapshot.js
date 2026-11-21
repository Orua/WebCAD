import {binaryHash} from './contracts/operation-schema.js';
import {validateRigidMatrix} from './rigid-instance.js';
const fail=()=>{throw Object.assign(new Error('Geometry snapshot identity mismatch; committed snapshot retained'),{code:'ARTIFACT_CORRUPT',commitState:'not_committed'});};
export function snapshotLeafSources(sources){
  return sources.flatMap(source=>source.format==='assembly'?snapshotLeafSources(source.members.map(member=>member.source)):[source]);
}
export function snapshotDelta(sources,knownHashes=[],context){
  const known=new Set(knownHashes),assets={};
  function entry({data,...source}){
    if(source.format==='assembly')return {...source,members:source.members.map(member=>({...member,source:entry(member.source)}))};
    if(!known.has(source.sourceHash)){assets[source.sourceHash]=data;known.add(source.sourceHash);}
    return source;
  }
  return {context,entries:sources.map(entry),assets};
}
export function installSnapshotDelta(delta,previous,context){
  if(JSON.stringify(delta.context)!==JSON.stringify(context))fail();
  const assets=new Map(snapshotLeafSources(previous||[]).map(s=>[s.sourceHash,s.data]));
  for(const [hash,bytes]of Object.entries(delta.assets||{})){if(!(bytes instanceof Uint8Array)||binaryHash(bytes).slice(7)!==hash)fail();assets.set(hash,bytes);}
  function install(entry,depth=0){
    if(entry.format==='assembly'){
      if(depth>=20||!Array.isArray(entry.members)||!entry.members.length||entry.members.length>2000)fail();
      return {...entry,members:entry.members.map(member=>({...member,source:install(member.source,depth+1)}))};
    }
    const data=assets.get(entry.sourceHash);
    if(!data||!['mesh','brep'].includes(entry.format))fail();
    if(entry.location)validateRigidMatrix(entry.location);
    return {...entry,data};
  }
  const ids=new Set();return delta.entries.map(entry=>{if(ids.has(entry.id))fail();ids.add(entry.id);return install(entry);});
}
