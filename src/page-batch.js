// Structured batches over an authorized page script channel (or explicit manual debugging).
// Every mutation still goes through the existing page API / CommandService.
const methods = new Set(['add','execute','connect','info','getState','searchTools','getTools','getTool','readDocs',
  'queryGeometry','queryReferences','resolvePlacement','measure','fitProfile','inspectPrintability','setView','setRenderQuality','setDisplayPreferences','redraw','files.capabilities','files.register',
  'files.import','files.save','files.export','files.release']);
const contextual = new Set(['execute','queryGeometry','queryReferences','resolvePlacement','measure','fitProfile','inspectPrintability','setView','setRenderQuality','setDisplayPreferences','redraw','files.import','files.save','files.export']);
const bad = (code,message) => { throw Object.assign(new Error(message),{code}); };
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
export function createPageBatch(api){
  const receipts=new Map();let tail=Promise.resolve(),instance;
  async function run(input){
    let results=[],key,fingerprint,started=false,activeStepId=null;
    const attempted=new Set();
    const startedAt=performance.now();
    const finish=(status,error)=>{const s=api.getState();return {status,idempotencyKey:key,atomic:false,results,
      requestContext:context(s.context),
      progress:{completedStepIds:results.filter(item=>!['failed','unknown'].includes(item.result?.status)).map(item=>item.id),
        failedStepId:status==='completed'?null:activeStepId,
        unattemptedStepIds:(Array.isArray(input?.steps)?input.steps:[]).filter(step=>typeof step?.id==='string'&&!attempted.has(step.id)).map(step=>step.id)},
      recovery:status==='completed'?null:{action:status==='unknown'?'INSPECT_STATE_BEFORE_RETRY':'READ_STATE_AND_REPLAN_REMAINING',
        message:'Earlier committed steps remain. Read current state; do not recreate them. Use a new key for a revised remainder. An identical request/key only retrieves the original receipt.'},
      ...(error?{error:{code:error.code||'BATCH_FAILED',message:error.message}}:{}),
      elapsedMs:Math.round(performance.now()-startedAt),context:s.context,
      summary:s.summary,display:s.display,
      displayMatchesContext:s.display?.status==='rendered'&&['documentId','documentInstanceId','revision'].every(k=>s.display.rendered?.[k]===s.context[k])};};
    try{
      safe(input);keys(input,['context','idempotencyKey','steps']);
      fingerprint=JSON.stringify(input);if(fingerprint.length>3*1024*1024)bad('RESOURCE_LIMIT','Batch exceeds 3 MiB');
      const now=api.getState();
      if(instance!==now.context.documentInstanceId){receipts.clear();instance=now.context.documentInstanceId;}
      key=input.idempotencyKey;
      if(typeof key!=='string'||!key.length||key.length>80)bad('PARAM_SCHEMA_INVALID','idempotencyKey: 1..80 characters');
      if(receipts.has(key)){
        const cached=receipts.get(key);
        if(cached.fingerprint!==fingerprint)bad('IDEMPOTENCY_KEY_REUSED','Use a new key for a different batch');
        return structuredClone(cached.result);
      }
      if(receipts.size>=100)bad('RESOURCE_LIMIT','100 batch receipts per document instance');
      keys(input.context,['sessionId','documentId','documentInstanceId','expectedRevision']);
      let expected={...input.context};
      const check=()=>{
        const s=api.getState();
        for(const k of ['sessionId','documentId','documentInstanceId'])if(expected[k]!==s.context[k])bad('INSTANCE_MISMATCH','Read the current page state');
        if(expected.expectedRevision!==s.context.revision)bad('REVISION_CONFLICT','Document changed; read state and replan');
        if(!s.summary.kernelReady||s.summary.busy||s.preview.active||s.preview.computing)bad('CAPABILITY_UNAVAILABLE','Wait for kernel/preview to finish');
      };
      check();
      if(!Array.isArray(input.steps)||!input.steps.length||input.steps.length>20)bad('RESOURCE_LIMIT','Expected 1..20 steps');
      const names=new Set();
      for(const step of input.steps){
        keys(step,['id','method','args']);
        if(typeof step.id!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(step.id)||names.has(step.id))bad('PARAM_SCHEMA_INVALID','Step IDs must be unique short names');
        if(!methods.has(step.method))bad('CAPABILITY_UNAVAILABLE',`Unsupported batch method: ${step.method}`);
        if(step.args!==undefined&&!plain(step.args))bad('PARAM_SCHEMA_INVALID','args must be an object');
        if(step.args&&('context' in step.args||'idempotencyKey' in step.args))bad('PARAM_SCHEMA_INVALID','Batch owns step context and receipt keys');
        names.add(step.id);
      }
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
      for(const step of input.steps){
        activeStepId=step.id;check();attempted.add(step.id);let args=resolve(step.args||{}),result;
        if(step.method==='add'){
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
        results.push({id:step.id,result});resolved[step.id]=result;
        if(['failed','unknown'].includes(result?.status)){
          const receipt=finish(result.status==='unknown'?'unknown':results.length>1?'partial':'failed',result.error||new Error('Step failed'));
          receipts.set(key,{fingerprint,result:structuredClone(receipt)});return receipt;
        }
        // Advance only using this step's receipt, never silently adopt another writer's revision.
        if(result?.status==='committed')expected=result.context?context(result.context):{...expected,expectedRevision:result.revisionAfter};
      }
      activeStepId=null;check();const result=finish('completed');receipts.set(key,{fingerprint,result:structuredClone(result)});return result;
    }catch(e){
      const result=finish(results.length?'partial':'failed',e);
      if(started&&!receipts.has(key))receipts.set(key,{fingerprint,result:structuredClone(result)});
      return result;
    }
  }
  return input=>{let snapshot;try{snapshot=structuredClone(input);}catch(e){return Promise.resolve({status:'failed',error:{code:'PARAM_SCHEMA_INVALID',message:e.message}});}const job=tail.then(()=>run(snapshot));tail=job.catch(()=>{});return job;};
}
