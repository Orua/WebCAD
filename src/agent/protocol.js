export const PROTOCOL = 'goldenluck.webcad/1';
export const IDENTITY_KEYS = Object.freeze(['sessionId','documentId','documentInstanceId']);
export const READ_METHODS = new Set(['connect','info','getState','getHistory','searchTools','getTools','getTool','readDocs',
  'queryGeometry','queryReferences','resolvePlacement','measure','measureRelation','inspectDesign','inspectProfile',
  'inspectConstraints','inspectFit','inspectThickness','inspectDraft','inspectPrintability','files.capabilities',
  'prepareProfileEdit','projectProfile','sampleReliefHeight','prepareReliefSculpt','readRelief','readVector','connectVector',
  'fitProfile','traceTwinWindow','planAlignment','getUILayout','getQuickModelUsage','inspectRound']);
export const VIEW_METHODS = new Set(['setView','setRenderQuality','setDisplayPreferences','selectRectangle','redraw','capture']);
export const DISCOVERY_METHODS = new Set(['connect','info','getState','getHistory','searchTools','getTools','getTool','readDocs','files.capabilities','getUILayout','getQuickModelUsage']);
export const EDIT_ACTIONS = new Set(['feature.add','feature.addMany','feature.edit','feature.rename','document.rename',
  'body.visibility','body.appearance','body.explode','document.appearance','history.undo','history.redo',
  'reference.setWorkFrame','reference.resetWorkFrame','reference.setLocked','reference.setBodyAnchor',
  'reference.saveFrame','reference.activateFrame','reference.renameFrame','reference.deleteFrame','reference.deleteBodyAnchor',
  'preview.start','preview.update','preview.commit','preview.cancel','feature.remove','document.parameters','document.refresh','body.align','history.restore']);
export const JOB_METHODS = new Set(['run','execute','queryGeometry','measure','measureRelation','inspectProfile','inspectConstraints',
  'inspectDesign','inspectFit','inspectThickness','inspectDraft','setView','setRenderQuality','files.save','files.export','files.import',
  'prepareProfileEdit','projectProfile','createDrawing','exportDrawing','copySelection','pasteSelection','inspectRound']);
const EDIT_METHODS = new Set(['execute','files.import','copySelection','pasteSelection']);
const EXPORT_METHODS = new Set(['files.save','files.export','createDrawing','exportDrawing']);
// Host-managed resources and service credentials never enter model-controlled arguments.
export const HOST_ONLY_METHODS = Object.freeze({invoke:'dispatch wrapper',submit:'adapter owns job IDs',getJob:'original receipt via webcad_job',cancelJob:'host stop control',
  createRequestContext:'use live requestContext',executeText:'use explicit run steps',getLogoConverter:'service configuration',setLogoConverter:'service credentials',convertLogoPdf:'host binary conversion',
  'files.register':'host binary upload','files.read':'host artifact transport','files.download':'host download','files.write':'host disk capability',
  'files.confirmWritten':'host write receipt','files.release':'host resource lifetime','files.new':'requires new document binding','files.open':'requires new document binding'});
export function failure(code, message) { return Object.assign(new Error(message), {code}); }
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
  if (method==='run') {
    if (Object.keys(args).sort().join(',')!=='context,idempotencyKey,steps' || typeof args.idempotencyKey!=='string' || !args.idempotencyKey.length || args.idempotencyKey.length>80 || !Array.isArray(args.steps) || !args.steps.length || args.steps.length>20) throw failure('PARAM_SCHEMA_INVALID','Bounded native run required');
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
    assertIdentity(args.context,binding);
    if (!Number.isSafeInteger(args.context.expectedRevision) || args.context.expectedRevision<0) throw failure('PARAM_SCHEMA_INVALID','expectedRevision required');
  }
}

