import {binaryHash} from '../../contracts/operation-schema.js';
const encoder=new TextEncoder();
// Own serialized bytes, never wrappers/builders shared between transactions.
// A cache is per CadKernel session and does not make a failed job successful.
export class ReliefLayerCache{
 constructor(maxBytes=20*1024*1024){this.maxBytes=maxBytes;this.bytes=0;this.entries=new Map();}
 get(key){const entry=this.entries.get(key);if(!entry)return null;if(binaryHash(encoder.encode(entry.brep))!==entry.sha256)throw Object.assign(new Error('浮雕层缓存损坏'),{code:'ARTIFACT_CORRUPT'});this.entries.delete(key);this.entries.set(key,entry);return {brep:entry.brep,report:structuredClone(entry.report)};}
 set(key,brep,report){const size=encoder.encode(brep).length;if(size>this.maxBytes)return;const prior=this.entries.get(key);if(prior){this.bytes-=prior.size;this.entries.delete(key);}while(this.bytes+size>this.maxBytes&&this.entries.size){const [oldKey,old]=this.entries.entries().next().value;this.entries.delete(oldKey);this.bytes-=old.size;}this.entries.set(key,{brep,report:structuredClone(report),size,sha256:binaryHash(encoder.encode(brep))});this.bytes+=size;}
 clear(){this.entries.clear();this.bytes=0;}
}
