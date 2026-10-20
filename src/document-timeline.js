// Forward state differences; v4 sources stay once in binaryAssets by hash.
import {validateReliefDesigns} from './relief-design-drafts.js';
import {validateReliefReferenceBindings} from './relief-design-reference-contract.js';
import {DOCUMENT_LIMITS} from './document-limits.js';
import {BINARY_SOURCE_FORMATS} from './mesh/mesh-assets.js';
import {PROJECT_V4_LIMITS} from './mesh/project-v4.js';
const clone=structuredClone;
const bytes=x=>new TextEncoder().encode(JSON.stringify(x)).length;
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const fail=m=>{throw Object.assign(new Error(m),{code:'HISTORY_INVALID'});};
const unsafe=k=>['__proto__','constructor','prototype'].includes(String(k));
function state(doc){const {timeline,imports,compiledArtifacts,binaryAssets,...rest}=doc;return clone(rest);}
// Heightfield reliefs keep their samples as a binary heightmap asset reached through imports.
function importKeys(snapshot){return [...(snapshot.features||[]).flatMap(f=>f.op==='import'?[f.params?.key]:f.op==='meshHeightfieldRelief'&&f.params?.heights?.importKey?[f.params.heights.importKey]:[]),...(snapshot.reliefDesigns||[]).flatMap(d=>d.draft?.reference?[d.draft.reference.importKey]:[])];}
function retainImports(doc,timeline){
 const needed=new Set(importKeys(doc));
 if(timeline){let s=timeline.base;for(const key of importKeys(s))needed.add(key);for(const e of timeline.entries){s=apply(s,e.patch);for(const key of importKeys(s))needed.add(key);}}
 // Replace the map, never mutate resources shared by the live undo/redo stacks.
  doc.imports=Object.fromEntries(Object.entries(doc.imports||{}).filter(([key])=>needed.has(key)));
  const hashes=new Set((doc.features||[]).map(f=>f.compiledCheckpoint?.artifactSha256).filter(Boolean));
  if(timeline){let s=timeline.base;for(const f of s.features||[])if(f.compiledCheckpoint)hashes.add(f.compiledCheckpoint.artifactSha256);for(const e of timeline.entries){s=apply(s,e.patch);for(const f of s.features||[])if(f.compiledCheckpoint)hashes.add(f.compiledCheckpoint.artifactSha256);}}
  if(doc.binaryAssets){const assetHashes=new Set(Object.values(doc.imports||{}).map(item=>item.assetHash).filter(Boolean));doc.binaryAssets=Object.fromEntries(Object.entries(doc.binaryAssets).filter(([hash])=>assetHashes.has(hash)));}
  if(doc.compiledArtifacts)doc.compiledArtifacts=Object.fromEntries(Object.entries(doc.compiledArtifacts).filter(([hash])=>hashes.has(hash)));
}
function validateImports(snapshot,imports){validateReliefDesigns(snapshot.reliefDesigns);validateReliefReferenceBindings(snapshot,imports);for(const key of importKeys(snapshot))if(typeof key!=='string'||!Object.hasOwn(imports||{},key)||(typeof imports[key]?.data!=='string'&&!(BINARY_SOURCE_FORMATS.includes(imports[key]?.format)&&/^[a-f0-9]{64}$/.test(imports[key]?.assetHash||''))))fail('历史工程缺少原始导入资源');}
function diff(a,b,path=[]){
 if(JSON.stringify(a)===JSON.stringify(b))return [];
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return [{path,value:clone(b)}];
 let out=[];
 if(Array.isArray(a)){
  const common=Math.min(a.length,b.length);for(let i=0;i<common;i++)out.push(...diff(a[i],b[i],[...path,i]));
  for(let i=a.length-1;i>=b.length;i--)out.push({path:[...path,i],remove:true});
  for(let i=common;i<b.length;i++)out.push({path:[...path,i],value:clone(b[i])});
 }else{
  for(const k of Object.keys(a))if(!Object.hasOwn(b,k))out.push({path:[...path,k],remove:true});
  for(const k of Object.keys(b))out.push(...diff(a[k],b[k],[...path,k]));
 }
 return path.length&&bytes(out)>bytes(b)+bytes(path)+24?[{path,value:clone(b)}]:out;
}
function apply(base,patch){
 let out=clone(base);if(!Array.isArray(patch)||patch.length>20000)fail('历史差异过大或无效');
 for(const item of patch){
  if(!Array.isArray(item.path)||item.path.length>40||item.path.some(unsafe)||['imports','timeline','compiledArtifacts','binaryAssets'].includes(item.path[0]))fail('历史路径无效');
  if(!item.path.length){if(item.remove)fail('不能删除历史根状态');out=clone(item.value);continue;}
  let parent=out;for(const k of item.path.slice(0,-1)){if(parent===null||typeof parent!=='object'||!Object.hasOwn(parent,k))fail('历史路径不存在');parent=parent[k];}
  const k=item.path.at(-1);if(Array.isArray(parent)&&(!Number.isInteger(k)||k<0||k>parent.length))fail('历史数组下标无效');
  if(item.remove){if(Array.isArray(parent))parent.splice(k,1);else delete parent[k];}else parent[k]=clone(item.value);
 }
 return out;
}
export function timelineList(doc){const t=doc.timeline;return t?{version:1,storedSteps:t.entries.length+1,prunedSteps:t.pruned||0,bytes:bytes(t),maxSteps:t.maxSteps,maxBytes:t.maxBytes,entries:[{id:t.baseId,label:t.baseLabel,at:t.baseAt},...t.entries.map(({id,label,at,featureId})=>({id,label,at,featureId}))]}:{version:1,storedSteps:0,prunedSteps:0,bytes:0,entries:[]};}
export function recordTimeline(previous,next,{label,featureId,maxSteps=100,maxBytes=2*1024*1024}={}){
 const before=state(previous),after=state(next),patch=diff(before,after);
 if(!patch.length){if(previous.timeline)next.timeline=previous.timeline;return next;}
 const now=new Date().toISOString();
 const t=previous.timeline?clone(previous.timeline):{version:1,baseId:crypto.randomUUID(),baseLabel:'开始记录时的工程',baseAt:now,base:before,entries:[],pruned:0,maxSteps,maxBytes};
 const added=next.features?.filter(f=>!previous.features?.some(p=>p.id===f.id))||[];
 t.entries.push({id:crypto.randomUUID(),at:now,label:label||(added.length?(added.at(-1).name||added.at(-1).op)+(added.length>1?` 等 ${added.length} 项`:''):'修改工程状态'),...(featureId||added.at(-1)?.id?{featureId:featureId||added.at(-1).id}:{}),patch});
 // Never duplicate source bytes. Keep imports needed by older retained states.
 next.imports={...previous.imports,...next.imports};
 if(previous.binaryAssets||next.binaryAssets)next.binaryAssets={...previous.binaryAssets,...next.binaryAssets};
 if(previous.compiledArtifacts||next.compiledArtifacts)next.compiledArtifacts={...previous.compiledArtifacts,...next.compiledArtifacts};
 const prune=()=>{
  const e=t.entries.shift();t.base=apply(t.base,e.patch);t.baseId=e.id;t.baseLabel=e.label;t.baseAt=e.at;t.pruned++;
 };
 while(t.entries.length&&t.entries.length+1>t.maxSteps)prune();
 retainImports(next,t);
 const artifactBytes=()=>[...Object.values(next.compiledArtifacts||{}),...Object.values(next.binaryAssets||{})].reduce((n,v)=>n+(v?.byteLength||0),0);
 const available=()=>{const metadataBytes=bytes({...next,timeline:undefined,compiledArtifacts:undefined,binaryAssets:undefined});return Math.min(t.maxBytes,Math.max(0,(next.version===4?PROJECT_V4_LIMITS.maxBytes:DOCUMENT_LIMITS.maxBytes)-8192-metadataBytes-artifactBytes()),...(next.version===4?[Math.max(0,PROJECT_V4_LIMITS.maxJsonBytes-8192-metadataBytes)]:[]));};
 let limit=available();
 while(t.entries.length&&bytes(t)>limit){prune();retainImports(next,t);limit=available();}
 // A full current state too large to checkpoint leaves explicit zero history.
 if(bytes(t)>limit){delete next.timeline;retainImports(next);return next;}
 next.timeline=t;return next;
}
export function restoreTimeline(doc,id){
 const t=doc.timeline;if(!t||id!==t.baseId&&!t.entries.some(e=>e.id===id))fail('该工程状态已不在保留的历史范围');
 let out=clone(t.base);if(id!==t.baseId)for(const e of t.entries){out=apply(out,e.patch);if(e.id===id)break;}
 if(out.documentId!==doc.documentId)fail('历史不属于当前工程');
 return {...out,...(doc.version>=3?{version:doc.version}:{}),imports:clone(doc.imports),...(doc.binaryAssets?{binaryAssets:{...doc.binaryAssets}}:{}),...(doc.compiledArtifacts?{compiledArtifacts:clone(doc.compiledArtifacts)}:{}),timeline:clone(t)};
}
export function validateTimeline(doc){
 const t=doc.timeline;if(!t)return;
 if(t.version!==1||typeof t.baseId!=='string'||!t.base||!Array.isArray(t.entries)||t.entries.length>200||!Number.isInteger(t.maxSteps)||t.maxSteps<1||t.maxSteps>200||!Number.isFinite(t.maxBytes)||t.maxBytes<1||t.maxBytes>4*1024*1024||bytes(t)>4*1024*1024)fail('不支持的历史格式或大小');
 if(t.base.imports||t.base.binaryAssets||t.base.compiledArtifacts||t.base.timeline||t.base.documentId!==doc.documentId||!Array.isArray(t.base.features)||t.base.features.length>DOCUMENT_LIMITS.maxFeatures)fail('历史基线无效');
 let s=clone(t.base);validateImports(s,doc.imports);const ids=new Set([t.baseId]);for(const e of t.entries){if(typeof e.id!=='string'||ids.has(e.id)||typeof e.label!=='string')fail('历史标识无效');ids.add(e.id);s=apply(s,e.patch);if(s.documentId!==doc.documentId||!Array.isArray(s.features)||s.features.length>DOCUMENT_LIMITS.maxFeatures)fail('历史工程状态无效');validateImports(s,doc.imports);}
 if(canonical(s)!==canonical(state(doc)))fail('历史末状态与工程内容不一致');
}
