const none=new Set(['getMaterials','getBatchReceipt','info','getState','getUILayout','getHistory','createRequestContext','connect','connectVector','searchTools','getTools','getTool','readDocs','getQuickModelUsage','getModelLibrary','getAgentPanel','getLogoConverter','getServices','getServicesCapabilities','getServicesRouting','getServicesRequest','getServicesJob','getJob','cancelJob','waitFor','invoke','submit','decideServicesWait','recoverServicesJob']);
const identity=new Set(['measureMass','setView','selectRectangle','setDisplayPreferences','setRenderQuality','capture','redraw','measure','measureRelation','queryGeometry','queryReferences','resolvePlacement','resolveModelLibrary','planAlignment','planPatternMachining','prepareProfileEdit','projectProfile','fitProfile','traceTwinWindow','prepareReliefSculpt','prepareReliefTopologyUpgrade','readVector','readRelief']);
export function contextPolicy(method){
 if(['readLogo','reviewLogo','logoWizard'].includes(method))return 'identity';
 if(method==='probeBlendRadius')return 'identity';
 if(none.has(method))return 'none';
 if(identity.has(method)||/^(inspect|sample)/.test(method))return 'identity';
 if(method.startsWith('files.'))return ['import','export','open','save'].includes(method.slice(6))?'revision':'none';
 return 'revision';
}
export function identityContext(context){
 if(!context||typeof context!=='object'||Array.isArray(context)||Object.keys(context).some(k=>!['sessionId','documentId','documentInstanceId','revision','expectedRevision'].includes(k)))throw Object.assign(new Error('Full context is required: pass api.getState().context'),{code:'PARAM_SCHEMA_INVALID',path:'context'});
 const out={};for(const key of ['sessionId','documentId','documentInstanceId']){if(typeof context[key]!=='string'||!context[key])throw Object.assign(new Error('Full context is required: pass api.getState().context'),{code:'PARAM_SCHEMA_INVALID',path:'context.'+key});out[key]=context[key];}return out;
}
