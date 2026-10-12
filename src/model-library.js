import {QUICK_MODELS, QUICK_MODEL_VISIBLE_KINDS} from './quick-models.js';
import {getOperation} from './operation-registry.js';
import {assertJsonValue,validateSchema} from './contracts/operation-schema.js';

export const MODEL_LIBRARY_KEY = 'webcad.model-library.v1';
const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => { if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('PARAM_SCHEMA_INVALID', '模型库包含未知字段'); };
const quickContract=getOperation('quickModel');
const schemas=new Map(quickContract.inputSchema.oneOf.map(schema=>[schema.properties.kind.const,schema]));
function validateParams(kind,params){
  assertJsonValue(params);validateSchema(schemas.get(kind),params);
  for(const field of QUICK_MODELS[kind].fields){const value=params[field.key];
    if(field.type==='number'&&(typeof value!=='number'||!Number.isFinite(value)||field.min!==undefined&&value<field.min||field.max!==undefined&&value>field.max))fail('PARAM_RANGE_INVALID',field.label+' 超出允许范围');
    if(field.type==='select'&&!field.options.some(option=>option.value===value))fail('PARAM_SCHEMA_INVALID',field.label+' 选项无效');
    if(field.type==='boolean'&&typeof value!=='boolean')fail('PARAM_SCHEMA_INVALID',field.label+' 必须是布尔值');
  }
}
export const defaultModelLibrary = () => QUICK_MODEL_VISIBLE_KINDS.map(kind => ({id:kind, kind, label:QUICK_MODELS[kind].label, description:QUICK_MODELS[kind].description || '', defaults:structuredClone(QUICK_MODELS[kind].defaults)}));

export function validateLibraryEntry(entry) {
  keys(entry, ['id','kind','label','description','defaults']);
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(entry.id) || !Object.hasOwn(QUICK_MODELS, entry.kind)) fail('PARAM_SCHEMA_INVALID', '模型 ID 或几何类型无效');
  if (typeof entry.label !== 'string' || !entry.label.trim() || entry.label.length > 100 || typeof (entry.description ?? '') !== 'string' || (entry.description || '').length > 1000) fail('PARAM_SCHEMA_INVALID', '模型名称必填且不超过 100 字');
  keys(entry.defaults ?? {}, Object.keys(QUICK_MODELS[entry.kind].defaults));
  const defaults = {...structuredClone(QUICK_MODELS[entry.kind].defaults), ...entry.defaults};
  validateParams(entry.kind,{kind:entry.kind,...defaults});
  return {id:entry.id, kind:entry.kind, label:entry.label.trim(), description:entry.description || '', defaults};
}

export function createModelLibrary(storageProvider = () => globalThis.localStorage) {
  function read() {
    let storage, raw;
    try { storage = storageProvider(); raw = storage?.getItem(MODEL_LIBRARY_KEY); } catch { fail('LIBRARY_STORAGE_UNAVAILABLE', '模型库存储不可用，请允许当前站点本地存储'); }
    if (!raw) return {format:'webcad-model-library', version:1, revision:0, entries:defaultModelLibrary(), persistence:storage ? 'localStorage' : 'unavailable'};
    try {
      const data = JSON.parse(raw);
      if (data.format !== 'webcad-model-library' || data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(data.entries) || data.entries.length > 200) throw Error();
      const entries = data.entries.map(validateLibraryEntry);
      if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw Error();
      return {...data, entries, persistence:'localStorage'};
    } catch { fail('LIBRARY_INVALID', '已保存模型库无效，请导出备份后显式恢复默认库'); }
  }
  function update(input) {
    keys(input, ['expectedLibraryRevision','operation','entry','id','index','library']);
    // Restore can recover invalid storage, but requires the explicitly advertised revision -1.
    let current;
    try { current = read(); } catch (error) { if (error.code !== 'LIBRARY_INVALID' || input.operation !== 'restore' || input.expectedLibraryRevision !== -1) throw error; current = {revision:-1, entries:[]}; }
    if (input.expectedLibraryRevision !== current.revision) fail('LIBRARY_REVISION_CONFLICT', '模型库已改变，请重新读取后再修改');
    let entries = structuredClone(current.entries);
    switch (input.operation) {
      case 'upsert': { const entry = validateLibraryEntry(input.entry); const index = entries.findIndex(item => item.id === entry.id); if (index < 0) entries.push(entry); else entries[index] = entry; break; }
      case 'remove': case 'move': {
        const index = entries.findIndex(item => item.id === input.id);
        if (index < 0) fail('LIBRARY_ENTRY_NOT_FOUND', '模型条目不存在');
        const [entry] = entries.splice(index, 1);
        if (input.operation === 'move') { if (!Number.isInteger(input.index) || input.index < 0 || input.index > entries.length) fail('PARAM_SCHEMA_INVALID', '排序位置必须是有效的零起始索引'); entries.splice(input.index, 0, entry); }
        break;
      }
      case 'restore': entries = defaultModelLibrary(); break;
      case 'import': {
        keys(input.library, ['format','version','revision','entries','persistence']);
        if (input.library.format !== 'webcad-model-library' || input.library.version !== 1 || !Array.isArray(input.library.entries)) fail('LIBRARY_INVALID', '请输入 webcad-model-library v1');
        entries = input.library.entries.map(validateLibraryEntry); break;
      }
      default: fail('PARAM_SCHEMA_INVALID', '未知模型库操作');
    }
    if (entries.length > 200 || new Set(entries.map(entry => entry.id)).size !== entries.length) fail('LIBRARY_INVALID', '模型库最多 200 个唯一 ID');
    const data = {format:'webcad-model-library', version:1, revision:current.revision + 1, entries};
    const json = JSON.stringify(data);
    if (json.length > 1024 * 1024) fail('RESOURCE_LIMIT', '模型库超过 1 MiB');
    try { const storage = storageProvider(); if (!storage) throw Error(); storage.setItem(MODEL_LIBRARY_KEY, json); } catch { fail('LIBRARY_STORAGE_UNAVAILABLE', '模型库未保存：本地存储不可用或空间不足'); }
    return {...data, persistence:'localStorage'};
  }
  function resolve(input) {
    keys(input, ['id','expectedLibraryRevision','params']);
    const library = read();
    if (input.expectedLibraryRevision !== library.revision) fail('LIBRARY_REVISION_CONFLICT', '请读取当前模型库版本');
    const entry = library.entries.find(item => item.id === input.id);
    if (!entry) fail('LIBRARY_ENTRY_NOT_FOUND', '模型条目不存在');
    keys(input.params ?? {}, Object.keys(QUICK_MODELS[entry.kind].defaults));
    const params = {...entry.defaults, ...input.params, kind:entry.kind};
    validateParams(entry.kind,params);
    return {libraryRevision:library.revision, entryId:entry.id, op:'quickModel', params, refs:[], name:entry.label};
  }
  function contracts() {
    const data = read(), parent = quickContract;
    return {...data, entries:data.entries.map(entry => ({...entry, fields:structuredClone(QUICK_MODELS[entry.kind].fields), inputSchema:structuredClone(parent.inputSchema.oneOf.find(schema => schema.properties.kind.const === entry.kind)), toolId:'template.' + entry.kind, execution:{method:'add', args:{op:'quickModel', params:{...entry.defaults, kind:entry.kind}, refs:[], name:entry.label}}, knownUnsupportedCases:parent.templates?.find(template => template.kind === entry.kind)?.knownUnsupportedCases || []}))};
  }
  return {read, update, resolve, contracts};
}
export const modelLibrary = createModelLibrary();
