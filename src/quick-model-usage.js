import {QUICK_MODEL_VISIBLE_KINDS} from './quick-models.js';
const key='webcad.quickModelUsage.v1';
export function createQuickModelUsage(storage){
 let fallback={},memoryOnly=!storage;
 const read=()=>{let raw=fallback;if(!memoryOnly)try{const saved=storage.getItem(key);if(saved){const value=JSON.parse(saved);if(value?.version===1&&value.counts&&typeof value.counts==='object')raw=value.counts;}}catch{memoryOnly=true;}return Object.fromEntries(QUICK_MODEL_VISIBLE_KINDS.filter(k=>Number.isSafeInteger(raw[k])&&raw[k]>0).map(k=>[k,raw[k]]));};
 const snapshot=()=>{const counts=read(),topKinds=[...QUICK_MODEL_VISIBLE_KINDS].sort((a,b)=>(counts[b]||0)-(counts[a]||0)).slice(0,5);return {version:1,counts,topKinds,maxVisible:5,storage:memoryOnly?'memory':'localStorage'};};
 return Object.freeze({get:snapshot,record(kind){if(!QUICK_MODEL_VISIBLE_KINDS.includes(kind))throw new Error('未知快捷模型');const counts=read();counts[kind]=Math.min(Number.MAX_SAFE_INTEGER,(counts[kind]||0)+1);fallback=counts;if(!memoryOnly)try{storage.setItem(key,JSON.stringify({version:1,counts}));}catch{memoryOnly=true;}return snapshot();}});
}
let singleton;
function usage(){if(!singleton){let storage;try{storage=globalThis.localStorage;}catch{}singleton=createQuickModelUsage(storage);}return singleton;}
export const getQuickModelUsage=()=>usage().get();
export const recordQuickModelUse=kind=>usage().record(kind);
