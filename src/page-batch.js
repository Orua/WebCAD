// Structured batches over an authorized page script channel (or explicit manual debugging).
// Every mutation still goes through the existing page API / CommandService.
import {contractHash} from './contracts/operation-schema.js';
import {LIMITS} from './limits.js';
import {validatePageInput} from './page-input-contracts.js';
import {archiveReceiptResult} from './receipt-archive.js';
import {withErrorRecovery} from './error-recovery.js';
import {batchFacts} from './commit-facts.js';
const methods = new Set(['add','execute','connect','info','getState','searchTools','getTools','getTool','readDocs',
  'getQuickModelUsage','queryGeometry','queryReferences','resolvePlacement','measure','measureRelation','inspectProfile','prepareProfileEdit','inspectConstraints','projectProfile','inspectFit','inspectThickness','inspectDraft','readVector','connectVector','fitProfile','inspectPrintability','setView','setRenderQuality','setDisplayPreferences','redraw','files.capabilities','files.register',
  'files.import','files.save','files.export','files.release']);
methods.add('readLogo');
methods.add('reviewLogo');methods.add('logoWizard');methods.add('reliefDesignField');methods.add('reliefDesignReference');
const contextual = new Set(['execute','queryGeometry','queryReferences','resolvePlacement','measure','measureRelation','inspectProfile','prepareProfileEdit','inspectConstraints','projectProfile','inspectFit','inspectThickness','inspectDraft','readVector','connectVector','fitProfile','inspectPrintability','setView','setRenderQuality','setDisplayPreferences','redraw','files.import','files.save','files.export']);
contextual.add('readLogo');
contextual.add('reviewLogo');contextual.add('logoWizard');contextual.add('reliefDesignField');contextual.add('reliefDesignReference');
methods.add('inspectDesign');
methods.add('getMaterials');methods.add('measureMass');contextual.add('measureMass');
methods.add('inspectRound');
contextual.add('inspectRound');
methods.add('prepareReliefSculpt');
contextual.add('prepareReliefSculpt');
methods.add('sampleReliefHeight');
methods.add('sampleMeshRelief');
contextual.add('sampleMeshRelief');
methods.add('planPatternMachining');
contextual.add('sampleReliefHeight');
methods.add('addMany');
for(const name of ['getServices','setServices','getServicesCapabilities','getServicesRequest','clearServicesCredential','getServicesJob','cancelServicesJob'])methods.add(name);
for(const name of ['setServices','clearServicesCredential','cancelServicesJob'])contextual.add(name);
contextual.add('inspectDesign');
for(const method of ['getModelLibrary','updateModelLibrary','resolveModelLibrary'])methods.add(method);
for(const method of ['updateModelLibrary','resolveModelLibrary'])contextual.add(method);
export const BATCH_METHODS=Object.freeze([...methods]);
const bad = (code,message,path) => { throw Object.assign(new Error(message),{code,...(path?{path}:{})}); };
const plain = x => x && typeof x==='object' && !Array.isArray(x);
const keys = (x,allowed) => { if(!plain(x)||Object.keys(x).some(k=>!allowed.includes(k)))bad('PARAM_SCHEMA_INVALID','Unexpected object fields'); };
const context = c => ({sessionId:c.sessionId,documentId:c.documentId,documentInstanceId:c.documentInstanceId,expectedRevision:c.revision});
function safe(value,depth=0){
  if(depth>32)bad('RESOURCE_LIMIT','JSON nesting exceeds 32');
  if(typeof value==='number'&&!Number.isFinite(value))bad('PARAM_SCHEMA_INVALID','Numbers must be finite');
  if(value&&typeof value==='object')for(const [k,v]of Object.entries(value)){
    if(['__proto__','prototype','constructor'].includes(k))bad('PARAM_SCHEMA_INVALID','Unsafe JSON key');
    safe(v,depth+1);
  }
}
// Steps that read or change the rendered view see the committed model first.
const DISPLAY_STEPS=new Set(['setView','setRenderQuality','setDisplayPreferences','redraw','files.save','files.export']);
export function createPageBatch(api,{display}={}){
  const receipts=new Map(),archivedReceipts=new Map(),failedAttempts=new Map();let tail=Promise.resolve(),instance;
  const unresolved=receipt=>receipt?.status==='unknown'||receipt?.commitState==='unknown'||receipt?.results?.some(item=>unresolved(item.result));
  const archiveReceipt=(key,value)=>{archivedReceipts.set(key,{fingerprint:value.fingerprint,result:{...archiveReceiptResult(value.result),idempotencyKey:key,archivedAt:Date.now()}});};
  function makeReceiptRoom(){if(receipts.size<100)return true;for(const [key,value] of receipts){if(!unresolved(value.result)){archiveReceipt(key,value);receipts.delete(key);if(receipts.size<100)return true;}}return false;}
  const permanentFailureCodes=new Set(['GEOMETRY_INVALID','FEATURE_REBUILD_FAILED','PARAM_RANGE_INVALID','PARAM_SCHEMA_INVALID','SELECTION_INVALID','HISTORY_EDIT_UNSAFE']);
  const canonical=value=>JSON.stringify(value,(_,v)=>plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  const digest=value=>contractHash(JSON.parse(value)).slice(7);
  async function run(input,control){
    let results=[],key,fingerprint,started=false,activeStepId=null,beforeState;
    const standaloneRecoverySave=Array.isArray(input?.steps)&&input.steps.length===1&&input.steps[0]?.method==='files.save';
    const attempted=new Set();
    // Bounding boxes of bodies created/replaced by this batch (max 40), so callers can verify alignment without another read.
    const touchedBounds=s=>{const ids=[...new Set(results.flatMap(item=>[...(item.result?.createdBodyIds||[]),...(item.result?.replacements||[]).map(r=>r.after)]))].slice(0,40);
      const round=v=>Math.round(v*1000)/1000;
      return ids.map(id=>{const b=(s.bodies||[]).find(body=>body.id===id);if(!b?.bounds?.min||!b?.bounds?.max)return null;
        return {id,center:[0,1,2].map(i=>round((b.bounds.min[i]+b.bounds.max[i])/2)),size:[0,1,2].map(i=>round(b.bounds.max[i]-b.bounds.min[i]))};}).filter(Boolean);};
    const startedAt=performance.now();
    const finish=(status,error)=>{const s=api.getState();const receipt=withErrorRecovery({status,idempotencyKey:key,atomic:false,results,
      requestContext:context(s.context),
      progress:{completedStepIds:results.filter(item=>!['failed','unknown'].includes(item.result?.status)).map(item=>item.id),
        failedStepId:status==='completed'||error?.code==='BATCH_CANCELLED'?null:activeStepId,
        stoppedBeforeStepId:error?.code==='BATCH_CANCELLED'?activeStepId:null,
        unattemptedStepIds:(Array.isArray(input?.steps)?input.steps:[]).filter(step=>typeof step?.id==='string'&&!attempted.has(step.id)).map(step=>step.id)},
      recovery:status==='completed'?null:{action:status==='unknown'?'INSPECT_STATE_BEFORE_RETRY':'READ_STATE_AND_REPLAN_REMAINING',
        message:'Earlier committed steps remain. Read current state; do not recreate them. Use a new key for a revised remainder. An identical request/key only retrieves the original receipt.'},
      ...(error?{error:{code:error.code||'BATCH_FAILED',message:error.message||String(error)||'Batch step failed',...(error.path?{path:error.path}:{}),...(error.commitState?{commitState:error.commitState}:{}),...(error.jobId||error.pageJobId?{jobId:error.jobId||error.pageJobId}:{}),...(error.requestId?{requestId:error.requestId}:{}),...(error.featureId?{featureId:error.featureId}:{}),...(error.affectedFeatureIds?{affectedFeatureIds:error.affectedFeatureIds,changedFeatureIds:error.changedFeatureIds}:{}),...(error.recoveryAction?{recoveryAction:error.recoveryAction}: {})}}:{}),
      elapsedMs:Math.round(performance.now()-startedAt),context:s.context,bodyBounds:touchedBounds(s),
      summary:s.summary,display:s.display,
      displayMatchesContext:s.display?.status==='rendered'&&['documentId','documentInstanceId','revision'].every(k=>s.display.rendered?.[k]===s.context[k])});
      receipt.facts=batchFacts(s,receipt,Array.isArray(input?.steps)?input.steps:[],beforeState);return receipt;};
    try{
      safe(input);keys(input,['context','idempotencyKey','steps']);
      const signature=JSON.stringify(input);if(signature.length>3*1024*1024)bad('RESOURCE_LIMIT','Batch exceeds 3 MiB');fingerprint=contractHash(signature);
      const now=api.getState();beforeState={bodies:(now.bodies||[]).map(body=>({id:body.id}))};
      if(instance!==now.context.documentInstanceId){receipts.clear();archivedReceipts.clear();failedAttempts.clear();instance=now.context.documentInstanceId;}
      key=input.idempotencyKey;
      if(typeof key!=='string'||!key.length||key.length>80)bad('PARAM_SCHEMA_INVALID','idempotencyKey: 1..80 characters');
      if(receipts.has(key)){
        const cached=receipts.get(key);
        if(cached.fingerprint!==fingerprint)bad('IDEMPOTENCY_KEY_REUSED','Use a new key for a different batch');
        return structuredClone(cached.result);
      }
      if(archivedReceipts.has(key)){
        const cached=archivedReceipts.get(key);if(cached.fingerprint!==fingerprint)bad('IDEMPOTENCY_KEY_REUSED','Archived batch key belongs to a different request');
        return structuredClone(cached.result);
      }
      keys(input.context,['sessionId','documentId','documentInstanceId','expectedRevision']);
      let expected={...input.context};
      const check=(allowPreview=false,recoverySave=false)=>{
        const s=api.getState();
        for(const k of ['sessionId','documentId','documentInstanceId'])if(expected[k]!==s.context[k])bad('INSTANCE_MISMATCH','Read the current page state');
        if(expected.expectedRevision!==s.context.revision)bad('REVISION_CONFLICT','Document changed; read state and replan');
        if(!recoverySave&&(!s.summary.kernelReady||s.summary.busy||(s.preview.active&&!allowPreview)||s.preview.computing))bad('CAPABILITY_UNAVAILABLE','Wait for kernel/preview to finish');
      };
      check(true,standaloneRecoverySave);
      const maxSteps=LIMITS.batch.maxSteps;if(!Array.isArray(input.steps)||!input.steps.length||input.steps.length>maxSteps)bad('RESOURCE_LIMIT',`Expected 1..${maxSteps} steps`);
      const names=new Set();
      for(const [index,step] of input.steps.entries()){
        keys(step,['id','stage','method','args']);
        if(step.stage!==undefined&&(typeof step.stage!=='string'||!step.stage.trim()||step.stage.length>80))bad('PARAM_SCHEMA_INVALID','stage must be a short descriptive name');
        const idPath=`steps[${index}].id`;
        if(step.id===undefined)bad('PARAM_SCHEMA_INVALID',`第 ${index+1} 步缺少 id；请为每一步填写本批次内唯一的步骤名。`,idPath);
        if(typeof step.id!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(step.id))bad('PARAM_SCHEMA_INVALID',`第 ${index+1} 步的 id 格式无效；请使用字母开头的 1–40 位字母、数字、下划线或连字符。`,idPath);
        if(names.has(step.id))bad('PARAM_SCHEMA_INVALID',`第 ${index+1} 步的 id 在本批次中重复；请明确改为唯一名称，并同步核对引用该步骤的 $ref。`,idPath);
        if(!methods.has(step.method))bad('CAPABILITY_UNAVAILABLE',`Unsupported batch method: ${step.method}`);
        if(step.args!==undefined&&!plain(step.args))bad('PARAM_SCHEMA_INVALID','args must be an object');
        if(step.args&&('context' in step.args||'idempotencyKey' in step.args))bad('PARAM_SCHEMA_INVALID','Batch owns step context and receipt keys');
        names.add(step.id);
      }
      const receiptRoom=makeReceiptRoom();if(!receiptRoom&&!standaloneRecoverySave)bad('RESOURCE_LIMIT','100 unresolved batch receipts; inspect or reconcile an existing result before starting another');
      const resolved=Object.create(null);
      const resolve=value=>{
        if(Array.isArray(value))return value.map(resolve);
        if(!plain(value))return value;
        if(Object.hasOwn(value,'$ref')){
          keys(value,['$ref']);if(typeof value.$ref!=='string')bad('STALE_REFERENCE','Invalid result reference');
          let result=resolved;
          for(const part of value.$ref.split('.')){
            if(!result||!Object.hasOwn(result,part))bad('STALE_REFERENCE',`Unknown result reference: ${value.$ref}`);
            result=result[part];
          }
          return structuredClone(result);
        }
        return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolve(v)]));
      };
      started=true;
      // One display upload/UI refresh for the whole batch instead of per step.
      display?.begin?.();
      try{
      for(const step of input.steps){
        activeStepId=step.id;
        if(control.cancelled?.())bad('BATCH_CANCELLED','Stopped between stages; earlier committed steps remain');
        const stepStartedAt=performance.now();
        activeStepId=step.id;let args=resolve(step.args||{}),result;
        const allowPreview=step.method==='execute'&&['preview.update','preview.commit','preview.cancel'].includes(args.action);
        if(DISPLAY_STEPS.has(step.method)||(step.method==='execute'&&String(args.action||'').startsWith('preview.')))display?.flush?.();
        const recoverySave=step.method==='files.save';check(allowPreview,recoverySave);
        const attempt=canonical({context:expected,method:step.method,args});
        const inputFingerprint=await digest(attempt);
        const prior=failedAttempts.get(inputFingerprint);
        if(prior)bad(prior.status==='unknown'?'PREVIOUS_ATTEMPT_UNKNOWN':'PREVIOUS_ATTEMPT_FAILED',`Identical input already returned ${prior.status} in ${prior.key}:${prior.stepId} (${prior.code}); inspect its receipt and current state before replanning`);
        attempted.add(step.id);
        control.progress?.({phase:'stage',stepId:step.id,stage:step.stage||step.id,completedSteps:results.length,totalSteps:input.steps.length,inputFingerprint});
        if(step.method==='addMany'){
          validatePageInput('addMany',args,'steps.'+step.id+'.args');
          keys(args,['features']);
          if(!Array.isArray(args.features))bad('PARAM_SCHEMA_INVALID','features must be an array');
          const features=args.features.map(feature=>{
            keys(feature,['key','op','params','refs','name','placement']);
            const card=api.getTool({id:feature.op});
            return {...feature,refs:feature.refs||[],opVersion:card.version,schemaHash:card.schemaHash};
          });
          result=await api.execute({context:expected,idempotencyKey:`${key}:${step.id}`,action:'feature.addMany',args:{features}});
        }else if(step.method==='add'){
          validatePageInput('add',args,'steps.'+step.id+'.args');
          keys(args,['op','params','refs','name','placement']);
          const card=api.getTool({id:args.op});
          result=await api.execute({context:expected,idempotencyKey:`${key}:${step.id}`,action:'feature.add',
            args:{...args,refs:args.refs||[],opVersion:card.version,schemaHash:card.schemaHash}});
        }else if(step.method==='files.register'){
          keys(args,['name','base64','mime']);
          if(typeof args.base64!=='string')bad('PARAM_SCHEMA_INVALID','files.register requires base64');
          result=await api.files.register({name:args.name,mime:args.mime,data:Uint8Array.from(atob(args.base64),c=>c.charCodeAt(0))});
        }else{
          if(contextual.has(step.method))args.context=expected;
          if(step.method==='execute')args.idempotencyKey=`${key}:${step.id}`;
          if(step.method==='files.import'&&args.placement!==undefined)args.idempotencyKey=`${key}:${step.id}`;
          const parts=step.method.split('.');
          result=parts.length===2?await api.files[parts[1]](args):await api[step.method](args);
        }
        results.push({id:step.id,stage:step.stage||step.id,inputFingerprint,selection:args.selection||args.args?.selection||null,result,elapsedMs:Math.round((performance.now()-stepStartedAt)*100)/100});resolved[step.id]=result;
        if(['failed','unknown'].includes(result?.status)){
          if(['add','addMany','execute'].includes(step.method)&&result.status==='unknown'){
            failedAttempts.set(inputFingerprint,{key,stepId:step.id,status:result.status,code:result.error?.code||'BATCH_FAILED'});
          }else if(['add','addMany','execute'].includes(step.method)&&permanentFailureCodes.has(result.error?.code)){
            failedAttempts.set(inputFingerprint,{key,stepId:step.id,status:'failed',code:result.error.code});
          }
          const receipt=finish(result.status==='unknown'?'unknown':results.length>1?'partial':'failed',result.error||new Error('Step failed'));
          if(makeReceiptRoom())receipts.set(key,{fingerprint,result:structuredClone(receipt)});return receipt;
        }
        // Advance only using this step's receipt, never silently adopt another writer's revision.
        if(result?.status==='committed')expected=result.context?context(result.context):{...expected,expectedRevision:result.revisionAfter};
      }
      // Deferred end: the receipt is returned (and reported by the host) before the batched display upload;
      // capture/setView/export/redraw still flush first, so a frame never shows an older model.
      }finally{if(display?.endDeferred)display.endDeferred();else display?.end?.();}
      activeStepId=null;check(true,standaloneRecoverySave);const result=finish('completed');if(makeReceiptRoom())receipts.set(key,{fingerprint,result:structuredClone(result)});return result;
    }catch(e){
      const unknown=e?.status==='unknown'||e?.commitState==='unknown'||e?.result?.status==='unknown'||e?.error?.commitState==='unknown';
      const result=finish(unknown?'unknown':results.length?'partial':'failed',e);
      if(started&&!receipts.has(key)&&makeReceiptRoom())receipts.set(key,{fingerprint,result:structuredClone(result)});
      return result;
    }
  }
  const dispatch=(input,control={})=>{let snapshot;try{snapshot=structuredClone(input);}catch(e){return Promise.resolve({status:'failed',error:{code:'PARAM_SCHEMA_INVALID',message:e.message}});}if(snapshot?.steps?.length===1&&snapshot.steps[0]?.method==='files.save')return run(snapshot,control);const job=tail.then(()=>run(snapshot,control));tail=job.catch(()=>{});return job;};
  dispatch.getReceipt=({idempotencyKey,documentInstanceId})=>{
    const current=api.getState().context;
    if(typeof documentInstanceId!=='string'||documentInstanceId!==current.documentInstanceId)bad('INSTANCE_MISMATCH','Query the original document instance; receipts do not survive a reload');
    if(typeof idempotencyKey!=='string'||!idempotencyKey.length||idempotencyKey.length>80)bad('PARAM_SCHEMA_INVALID','idempotencyKey: 1..80 characters');
    const found=instance===current.documentInstanceId&&(receipts.get(idempotencyKey)||archivedReceipts.get(idempotencyKey));
    return {status:'read',idempotencyKey,documentInstanceId,found:!!found,receipt:found?structuredClone(found.result):null,
      recovery:found?null:'Receipt unavailable or still running. Absence does not prove not_committed; inspect the original job and current state before replanning.'};
  };
  return dispatch;
}
