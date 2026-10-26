import {contractHash} from '../contracts/operation-schema.js';
import {LIMITS} from '../limits.js';
import {contextPolicy} from '../page-context-policy.js';
import {PAGE_METHOD_SCHEMAS,validatePageInput} from '../page-input-contracts.js';
import {errorRecovery} from '../error-recovery.js';
export const PROTOCOL = 'goldenluck.webcad/1';
export const IDENTITY_KEYS = Object.freeze(['sessionId','documentId','documentInstanceId']);
export const READ_METHODS = new Set(['getBatchReceipt','connect','info','getState','waitFor','getAgentPanel','getHistory','searchTools','getTools','getTool','readDocs',
  'getMetalMaterials','getMaterials','measureMass','queryGeometry','queryReferences','resolvePlacement','measure','measureRelation','inspectDesign','inspectProfile',
  'inspectConstraints','inspectFit','inspectThickness','inspectDraft','inspectPrintability','files.capabilities',
  'planPatternMachining','prepareProfileEdit','projectProfile','sampleMeshRelief','sampleReliefHeight','prepareReliefSculpt','reliefWizard','readRelief','readVector','connectVector',
  'fitProfile','traceTwinWindow','planAlignment','getUILayout','getQuickModelUsage','inspectRound','getModelLibrary','resolveModelLibrary']);
export const VIEW_METHODS = new Set(['setMetalMaterials','setView','setRenderQuality','setDisplayPreferences','selectRectangle','redraw','capture','getEvidenceImage','updateModelLibrary','markLocation']);
READ_METHODS.add('getDebugReport');
VIEW_METHODS.add('setDebugPanel');
export const DISCOVERY_METHODS = new Set(['getBatchReceipt','connect','info','getState','getAgentPanel','getHistory','searchTools','getTools','getTool','readDocs','files.capabilities','getUILayout','getQuickModelUsage','getModelLibrary']);
export const EDIT_ACTIONS = new Set(['feature.add','feature.addMany','feature.edit','feature.rename','document.rename',
  'document.materials','feature.compileServices','document.reliefDesign',
  'body.visibility','body.appearance','body.explode','document.appearance','history.undo','history.redo',
  'reference.setWorkFrame','reference.resetWorkFrame','reference.setLocked','reference.setBodyAnchor',
  'reference.saveFrame','reference.activateFrame','reference.renameFrame','reference.deleteFrame','reference.deleteBodyAnchor',
  'preview.start','preview.update','preview.commit','preview.cancel','feature.remove','document.parameters','document.refresh','body.align','history.restore']);
export const JOB_METHODS = new Set(['run','execute','queryGeometry','measure','measureRelation','inspectProfile','inspectConstraints',
  'inspectDesign','inspectFit','inspectThickness','inspectDraft','setView','setRenderQuality','files.save','files.export','files.import',
  'prepareProfileEdit','projectProfile','createDrawing','exportDrawing','copySelection','pasteSelection','inspectRound']);
export const EDIT_METHODS = new Set(['execute','files.import','copySelection','pasteSelection','recoverKernel','setMetalMaterials']);
export const EXPORT_METHODS = new Set(['files.save','files.export','files.reattach','createDrawing','exportDrawing']);
JOB_METHODS.add('recoverKernel');
JOB_METHODS.add('measureMass');
READ_METHODS.add('probeBlendRadius');
for(const method of ['getServices','getServicesCapabilities','getServicesRouting','readLogo'])READ_METHODS.add(method);
for(const method of ['reviewLogo','logoWizard','reliefDesignField','reliefDesignReference','reliefDesignFit']){READ_METHODS.add(method);JOB_METHODS.add(method);}
READ_METHODS.add('prepareReliefDesignRelief');
READ_METHODS.add('prepareOperation');JOB_METHODS.add('prepareOperation');JOB_METHODS.add('applyPreparedOperation');EDIT_METHODS.add('applyPreparedOperation');
READ_METHODS.add('prepareToolCall');
JOB_METHODS.add('readLogo');
JOB_METHODS.add('reliefWizard');
JOB_METHODS.add('probeBlendRadius');
JOB_METHODS.add('files.reattach');
// Host-managed resources and service credentials never enter model-controlled arguments.
export const HOST_ONLY_METHODS = Object.freeze({invoke:'dispatch wrapper',submit:'adapter owns job IDs',getJob:'original receipt via webcad_job',cancelJob:'host stop control',awaitJob:'adapter awaits page job completion',
  configureAgentPanel:'user-owned assistant destination',setAgentPanel:'user-owned connection lifetime',
  setServices:'host service credentials and upload consent',clearServicesCredential:'host authorization lifetime',
  getServicesJob:'host server job ownership',getServicesRequest:'host server request reconciliation',
  cancelServicesJob:'host server cancellation',decideServicesWait:'host user wait decision',recoverServicesJob:'requires explicit recovery approval',
  prepareReliefTopologyUpgrade:'host-approved saved topology migration planning',
  createRequestContext:'use live requestContext',executeText:'use explicit run steps',getLogoConverter:'service configuration',setLogoConverter:'service credentials',convertLogoPdf:'host binary conversion',
  'files.register':'host binary upload','files.read':'host artifact transport','files.download':'host download','files.write':'host disk capability',
  'files.confirmWritten':'host write receipt','files.release':'host resource lifetime','files.new':'requires new document binding','files.open':'requires new document binding'});
const contract={schemaVersion:1,adapterVersion:2,protocol:PROTOCOL,
  readMethods:[...READ_METHODS].sort(),viewMethods:[...VIEW_METHODS].sort(),jobMethods:[...JOB_METHODS].sort(),
  discoveryMethods:[...DISCOVERY_METHODS].sort(),editActions:[...EDIT_ACTIONS].sort(),
  editMethods:[...EDIT_METHODS].sort(),exportMethods:[...EXPORT_METHODS].sort(),
  // Hosts read timeouts and byte limits from here; WebCAD is their single source.
  limits:{transport:{...LIMITS.transport},batch:{...LIMITS.batch}},
  hostOnlyMethods:HOST_ONLY_METHODS,routingGuidance:{
    wrongTool:'按 allowedTool 调用相同 method，保留其参数；本次未提交，不需要重连或重画。',
    hostOnly:'该方法由宿主管理，不通过 invoke/submit 包装绕过。若工具卡给出 alternative，使用该公开入口；convertLogoPdf 的 PDF 转换由 webcad_read readLogo({context,sessionFileId,page,allowUpload:true})公开支持，不得把旧适配器 host-only 误报为 PDF 不可用。无公开替代时报告具体方法未开放。',
    notExposed:'当前绑定契约没有开放此方法；有页面文档不等于 MCP 可执行。核对 methodTools 和工具卡 mcpCall；同一版本无新证据时停止换入口/重连/反复查卡。'
  },
  methodSchemas:PAGE_METHOD_SCHEMAS,contextPolicies:Object.fromEntries([...READ_METHODS,...VIEW_METHODS,...EDIT_METHODS,...EXPORT_METHODS,'run','add','addMany'].map(name=>[name,contextPolicy(name)])),
  methodTools:Object.fromEntries([...READ_METHODS,...VIEW_METHODS,...EXPORT_METHODS,...JOB_METHODS].map(name=>[name,VIEW_METHODS.has(name)?'webcad_view':EXPORT_METHODS.has(name)?'webcad_artifact':READ_METHODS.has(name)?'webcad_read':'webcad_submit']))};
export const AGENT_CONTRACT=Object.freeze({...contract,contractHash:contractHash(contract)});
// A task may think/read for minutes; only a command that changes the document
// needs exclusive manual editing control. Page revision guards remain active.
export function editsDocument(payload) {
  if(payload?.method==='reliefDesignReference')return ['attach','detach'].includes(payload.args?.action);
  if(payload?.method==='run')return (payload.args?.steps||[]).some(editsDocument);
  return ['add','addMany','execute','files.import','pasteSelection','setMetalMaterials','applyPreparedOperation'].includes(payload?.method);
}
export function failure(code, message) { const error=Object.assign(new Error(message), {code});const recovery=errorRecovery(error);return Object.assign(error,{userMessage:recovery.userMessage,recovery}); }
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

export function bounded(value, depth=0) {
  if (depth > 32) throw failure('RESOURCE_LIMIT','JSON nesting exceeds 32');
  if (value && typeof value === 'object') {
    if (!Array.isArray(value) && !plain(value)) throw failure('PARAM_SCHEMA_INVALID','Plain JSON objects only');
    for (const [key,member] of Object.entries(value)) {
      if (['__proto__','prototype','constructor'].includes(key)) throw failure('PARAM_SCHEMA_INVALID','Unsafe JSON key');
      bounded(member, depth+1);
    }
  } else if (!['string','number','boolean'].includes(typeof value) && value !== null || typeof value === 'number' && !Number.isFinite(value)) {
    throw failure('PARAM_SCHEMA_INVALID','Finite JSON values required');
  }
  if (depth===0 && new TextEncoder().encode(JSON.stringify(value)).length > 3*1024*1024) throw failure('RESOURCE_LIMIT','Request exceeds 3 MiB');
}

export function assertIdentity(context, binding) {
  if (!context || IDENTITY_KEYS.some(key => typeof context[key] !== 'string' || context[key] !== binding[key])) {
    throw failure('INSTANCE_MISMATCH','Document instance differs from the authorized binding');
  }
}

export function validatePayload(payload, binding, scopes) {
  bounded(payload);
  if (!plain(payload) || Object.keys(payload).sort().join(',')!=='args,method' || !plain(payload.args)) throw failure('PARAM_SCHEMA_INVALID','Expected method and args');
  const {method,args}=payload;
  if (!scopes.includes('cad.read')) throw failure('scope_denied','CAD read access required');
  if(method==='reliefWizard'&&!['get','source'].includes(args.action??'get')&&!scopes.includes('cad.edit'))throw failure('scope_denied','CAD edit access required for relief draft control');
  if(method==='reliefDesignReference'&&!['get','resource'].includes(args.action??'get')&&!scopes.includes('cad.edit'))throw failure('scope_denied','CAD edit access required for reference attachment');
  if(method==='reliefDesignField'&&!['get','candidate'].includes(args.action??'get')&&!scopes.includes('cad.edit'))throw failure('scope_denied','CAD edit access required for numerical field tasks');
  if(method==='reliefDesignFit'&&(args.action??'get')!=='get'&&!scopes.includes('cad.edit'))throw failure('scope_denied','CAD edit access required for numerical fitting tasks');
  if(['reviewLogo','logoWizard'].includes(method)){
    const action=args.action??'get';
    if(action==='artifacts'&&!scopes.includes('cad.export'))throw failure('scope_denied','CAD export access required');
    if(!['get','artifacts',...(method==='logoWizard'?['attach']:[])].includes(action)&&!scopes.includes('cad.edit'))throw failure('scope_denied','CAD edit access required for contour draft changes');
  }
  if (method==='run') {
    if (Object.keys(args).sort().join(',')!=='context,idempotencyKey,steps' || typeof args.idempotencyKey!=='string' || !args.idempotencyKey.length || args.idempotencyKey.length>80 || !Array.isArray(args.steps) || !args.steps.length || args.steps.length>LIMITS.batch.maxSteps) throw failure('PARAM_SCHEMA_INVALID',`A run requires 1..${LIMITS.batch.maxSteps} steps`);
    const ids=new Set();
    for(const step of args.steps) {
      if (!plain(step) || !['args,id,method','args,id,method,stage'].includes(Object.keys(step).sort().join(',')) || (step.stage!==undefined&&(typeof step.stage!=='string'||!step.stage.trim()||step.stage.length>80)) || typeof step.id!=='string' || !step.id.length || ids.has(step.id) || step.method==='run') throw failure('PARAM_SCHEMA_INVALID','Unique bounded steps required');
      ids.add(step.id);
      validatePayload({method:step.method,args:{...step.args,context:args.context}},binding,scopes);
    }
  } else if (method==='add' || method==='addMany' || EDIT_METHODS.has(method)) {
    if (!scopes.includes('cad.edit')) throw failure('scope_denied','CAD edit access required');
    if (method==='execute' && !EDIT_ACTIONS.has(args.action)) throw failure('action_not_allowed','Action is outside the adapter allowlist');
  } else if (EXPORT_METHODS.has(method)) {
    if (!scopes.includes('cad.export')) throw failure('scope_denied','CAD export access required');
  } else if (!READ_METHODS.has(method) && !VIEW_METHODS.has(method)) {
    throw failure('method_not_allowed','Use structured public CAD methods only');
  }
  if (!DISCOVERY_METHODS.has(method)) {
    const contextlessRead=contextPolicy(method)==='none'&&READ_METHODS.has(method)&&(PAGE_METHOD_SCHEMAS[method]||Object.keys(args).length===0);
    if(contextlessRead&&PAGE_METHOD_SCHEMAS[method])validatePageInput(method,args);
    if(!contextlessRead){
      assertIdentity(args.context,binding);
      if (contextPolicy(method)!=='identity' && (!Number.isSafeInteger(args.context.expectedRevision) || args.context.expectedRevision<0)) throw failure('PARAM_SCHEMA_INVALID','expectedRevision required');
    }
  }
}

