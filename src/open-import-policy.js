// 打开 (open) always replaces the current document; 导入/插入 (insert) always adds into it.
// Nothing here chooses by file extension alone: the caller states the intent.
export const PROJECT_EXTENSIONS=Object.freeze(['webcad','json']);
export const MODEL_EXTENSIONS=Object.freeze(['step','stp','brep','brp','stl','mesh']);
export const UNSAVED_MODES=Object.freeze(['fail','discard']);
const fail=(code,message,path)=>{throw Object.assign(new Error(message),{code,...(path?{path}:{})});};
export const extensionOf=name=>String(name||'').split('.').pop().toLowerCase();
export function classifyFile(name){const ext=extensionOf(name);return PROJECT_EXTENSIONS.includes(ext)?'project':MODEL_EXTENSIONS.includes(ext)?'model':['igs','iges'].includes(ext)?'iges':null;}

// Agent/API rule: replacing a document with unsaved edits needs an explicit decision.
export function assertOpenAllowed({unsaved,dirty}){
  if(!UNSAVED_MODES.includes(unsaved))fail('PARAM_SCHEMA_INVALID','files.open 需要显式 unsaved:"fail"|"discard"；打开会替换当前设计，从不合并。要加入当前设计请用 files.import。','unsaved');
  if(dirty&&unsaved==='fail')fail('UNSAVED_REPLACEMENT','当前设计有未保存修改；请先保存，或显式传 unsaved:"discard" 放弃修改后再打开。');
}
export function assertInsertable(name){
  const kind=classifyFile(name);
  if(kind==='project')fail('FORMAT_UNSUPPORTED','工程文件只能“打开”（替换当前设计），不能插入；插入请选择 STEP/BREP/STL 模型。');
  if(kind==='iges')fail('CAPABILITY_UNAVAILABLE','静态版不支持 IGES；请离线转换为 STEP / BREP。');
  if(kind!=='model')fail('FORMAT_UNSUPPORTED','请选择 STEP/STP、BREP 或 STL 模型文件。');
}
export function assertOpenable(name){
  const kind=classifyFile(name);
  if(kind==='iges')fail('CAPABILITY_UNAVAILABLE','静态版不支持 IGES；请离线转换为 STEP / BREP。');
  if(!kind)fail('FORMAT_UNSUPPORTED','请选择 .webcad 工程或 STEP/BREP/STL 模型文件。');
}
// Drag-and-drop cannot express intent. Only an empty, clean document opens directly;
// otherwise the user chooses, and Cancel is the default.
export function dropDecision({files,documentEmpty,dirty}){
  const kinds=files.map(f=>classifyFile(f.name));
  if(!files.length||kinds.some(k=>!k||k==='iges'))return {mode:'reject',reason:'FORMAT_UNSUPPORTED'};
  const hasProject=kinds.includes('project');
  if(hasProject&&files.length>1)return {mode:'reject',reason:'ONE_PROJECT_ONLY'};
  if(documentEmpty&&!dirty&&files.length===1)return {mode:'open'};
  return {mode:'ask',choices:hasProject?['open','cancel']:files.length>1?['insert','cancel']:['open','insert','cancel'],defaultChoice:'cancel'};
}
export const FILE_MENU_LABELS=Object.freeze({open:'打开…（替换当前设计）',importAtFrame:'插入模型到当前设计…'});
