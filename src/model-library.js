import {QUICK_MODELS,QUICK_MODEL_VISIBLE_KINDS} from './quick-models.js';
import {getOperation} from './operation-registry.js';
import {assertJsonValue,validateSchema} from './contracts/operation-schema.js';
import {QUICK_CATALOG_ORDER_VERSION} from './quick-models/presentation.js';
import {normalizeChainSize} from './quick-models/chain-size.js';

export const MODEL_LIBRARY_KEY='webcad.model-library-order.v2';
export const LEGACY_MODEL_LIBRARY_KEY='webcad.model-library.v1';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,allowed)=>{if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('PARAM_SCHEMA_INVALID','模型库包含未知字段');};
const quickContract=getOperation('quickModel'),schemas=new Map(quickContract.inputSchema.oneOf.map(schema=>[schema.properties.kind.const,schema]));
function validateParams(kind,params){assertJsonValue(params);validateSchema(schemas.get(kind),params);for(const field of QUICK_MODELS[kind].fields){const value=params[field.key];if(field.type==='number'&&(typeof value!=='number'||!Number.isFinite(value)||field.min!==undefined&&value<field.min||field.max!==undefined&&value>field.max))fail('PARAM_RANGE_INVALID',field.label+' 超出允许范围');}}
export const defaultModelLibrary=()=>QUICK_MODEL_VISIBLE_KINDS.map(kind=>({id:kind,kind,label:QUICK_MODELS[kind].label,category:QUICK_MODELS[kind].category,categoryLabel:QUICK_MODELS[kind].categoryLabel,description:QUICK_MODELS[kind].description||'',defaults:structuredClone(QUICK_MODELS[kind].defaults)}));
// Kept as a trusted development/export helper. Runtime users cannot install it.
export function validateLibraryEntry(entry){keys(entry,['id','kind','label','category','categoryLabel','description','defaults']);if(entry.id!==entry.kind||!QUICK_MODEL_VISIBLE_KINDS.includes(entry.kind))fail('PARAM_SCHEMA_INVALID','快捷工具由软件内置，不接受自定义定义');const installed=defaultModelLibrary().find(x=>x.id===entry.id);if(JSON.stringify(entry)!==JSON.stringify(installed))fail('PARAM_SCHEMA_INVALID','快捷工具定义只读');return installed;}
const ordered=(order)=>{const entries=defaultModelLibrary(),byId=new Map(entries.map(x=>[x.id,x]));return [...new Set([...order,...byId.keys()])].flatMap(id=>byId.has(id)?[byId.get(id)]:[]);};
export function createModelLibrary(storageProvider=()=>globalThis.localStorage){
 function read(){
  let storage,raw,legacy;try{storage=storageProvider();raw=storage?.getItem(MODEL_LIBRARY_KEY);if(!raw)legacy=storage?.getItem(LEGACY_MODEL_LIBRARY_KEY);}catch{fail('LIBRARY_STORAGE_UNAVAILABLE','模型库存储不可用，请允许当前站点本地存储');}
  let revision=0,order=[];
  if(raw){try{const data=JSON.parse(raw);if(data.format!=='webcad-model-library-order'||data.version!==2||!Number.isSafeInteger(data.revision)||data.revision<0||!Array.isArray(data.order)||data.order.some(x=>typeof x!=='string')||data.order.length>200||new Set(data.order).size!==data.order.length)throw Error();revision=data.revision;order=data.catalogOrderVersion===QUICK_CATALOG_ORDER_VERSION?data.order:[];}catch{fail('LIBRARY_INVALID','工具排序无效；请显式恢复默认顺序');}}
  else if(legacy){try{const data=JSON.parse(legacy);if(Array.isArray(data.entries))order=[];}catch{/* Old definitions stay untouched; only a valid order is reused. */}}
  return {format:'webcad-model-library',version:2,catalogOrderVersion:QUICK_CATALOG_ORDER_VERSION,revision,entries:ordered(order),persistence:storage?'localStorage':'unavailable',readOnlyDefinitions:true,allowedOperations:['move','restore']};
 }
 function update(input){
  keys(input,['expectedLibraryRevision','operation','id','index']);
  if(!['move','restore'].includes(input.operation))fail('PARAM_SCHEMA_INVALID','快捷工具结构固定，只允许调整或恢复显示顺序');
  if(input.operation==='restore'&&(input.id!==undefined||input.index!==undefined))fail('PARAM_SCHEMA_INVALID','恢复顺序不接受工具或位置');
  let current;try{current=read();}catch(error){if(error.code!=='LIBRARY_INVALID'||input.operation!=='restore'||input.expectedLibraryRevision!==-1)throw error;current={revision:-1,entries:defaultModelLibrary()};}
  if(input.expectedLibraryRevision!==current.revision)fail('LIBRARY_REVISION_CONFLICT','模型库已改变，请重新读取后再修改');
  let entries=structuredClone(current.entries);
  if(input.operation==='move'){const index=entries.findIndex(x=>x.id===input.id);if(index<0)fail('LIBRARY_ENTRY_NOT_FOUND','模型条目不存在');if(!Number.isInteger(input.index)||input.index<0||input.index>=entries.length)fail('PARAM_SCHEMA_INVALID','排序位置必须是有效的零起始索引');const [entry]=entries.splice(index,1);entries.splice(input.index,0,entry);}else entries=defaultModelLibrary();
  const data={format:'webcad-model-library-order',version:2,catalogOrderVersion:QUICK_CATALOG_ORDER_VERSION,revision:current.revision+1,order:entries.map(x=>x.id)};
  try{const storage=storageProvider();if(!storage)throw Error();storage.setItem(MODEL_LIBRARY_KEY,JSON.stringify(data));}catch{fail('LIBRARY_STORAGE_UNAVAILABLE','显示顺序未保存：本地存储不可用或空间不足');}
  return read();
 }
 function resolve(input){keys(input,['id','expectedLibraryRevision','params']);const library=read();if(input.expectedLibraryRevision!==library.revision)fail('LIBRARY_REVISION_CONFLICT','请读取当前模型库版本');const entry=library.entries.find(x=>x.id===input.id);if(!entry)fail('LIBRARY_ENTRY_NOT_FOUND','模型条目不存在');keys(input.params??{},Object.keys(QUICK_MODELS[entry.kind].defaults));const params={...entry.defaults,...normalizeChainSize({...input.params,kind:entry.kind})};validateParams(entry.kind,params);return {libraryRevision:library.revision,entryId:entry.id,op:'quickModel',params,refs:[],name:entry.label};}
 function contracts(){const data=read();return {...data,entries:data.entries.map(entry=>({...entry,fields:structuredClone(QUICK_MODELS[entry.kind].fields),inputSchema:structuredClone(schemas.get(entry.kind)),toolId:'template.'+entry.kind,execution:{method:'add',args:{op:'quickModel',params:{...entry.defaults,kind:entry.kind},refs:[],name:entry.label}},knownUnsupportedCases:quickContract.templates?.find(t=>t.kind===entry.kind)?.knownUnsupportedCases||[]}))};}
 return {read,update,resolve,contracts};
}
export const modelLibrary=createModelLibrary();
