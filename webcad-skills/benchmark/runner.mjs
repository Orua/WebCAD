import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {modelSession} from '../scripts/model-session.mjs';
import {cases} from './input/cases.mjs';
import {oracleVersion,readiness,required} from './oracle/reference.mjs';
import {judgeGeometry} from './oracle/judge.mjs';
import {missingHostMethods,missingSessionMethods} from './host-contract.mjs';

export const sha256=value=>createHash('sha256').update(typeof value==='string'||value instanceof Uint8Array?value:JSON.stringify(value)).digest('hex');
const oracleHash=sha256(['./oracle/reference.mjs','./oracle/judge.mjs'].map(file=>readFileSync(new URL(file,import.meta.url),'utf8')).join('\n'));
export const defaultBudget=Object.freeze({maxRounds:20,maxToolCalls:80,wallClockMs:600000,geometryAlternatives:1,concurrency:1,totalTokens:null,totalCost:null});
export function fixtureIndex(){return cases.map(input=>({caseId:input.caseId,caseVersion:input.caseVersion,sourceHash:sha256(input),units:input.units,coordinateFrame:input.coordinateFrame,targetType:input.targetType,expectedAssertions:required[input.caseId],oracleVersion,oracleHash,tolerance:{lengthMm:.01,surfaceMm:.05,relativeVolume:1e-4,g0Mm:.01,g1Deg:1},reference:readiness(input.caseId)}));}
export function createPlan({suite='baseline',layer='L2',repeat=3,group='B',caseId,build,sourceCommit,budget={}}={}){
 if(!['baseline','AB'].includes(suite)||!Number.isInteger(repeat)||repeat<1||repeat>3||!['A','B'].includes(group))throw Error('INVALID_PLAN');
 if(!build)throw Error('BUILD_REQUIRED');
 if(!['L1','L2'].includes(layer)||suite==='AB'&&layer!=='L2')throw Error('INVALID_LAYER');
 if(caseId&&!cases.some(c=>c.caseId===caseId))throw Error('UNKNOWN_CASE');
 const frozenBudget={...defaultBudget,...budget};
 for(const key of ['maxRounds','maxToolCalls','wallClockMs'])if(!Number.isInteger(frozenBudget[key])||frozenBudget[key]<1||frozenBudget[key]>defaultBudget[key])throw Error('INVALID_BUDGET');
 if(frozenBudget.concurrency!==1||frozenBudget.geometryAlternatives!==1)throw Error('INVALID_BUDGET');
 const selected=cases.filter(c=>!caseId||c.caseId===caseId);
 const representative=['B01','B02','B03','M03','S06','S09'];
 return {schemaVersion:1,suite,layer,build,sourceCommit:sourceCommit??null,repeat,group,budget:frozenBudget,fixtures:fixtureIndex(),runs:selected.filter(c=>suite!=='AB'||representative.includes(c.caseId)).flatMap(c=>(suite==='AB'?['A','B']:[group]).flatMap(g=>Array.from({length:repeat},(_,i)=>({caseId:c.caseId,group:g,trial:i+1,status:'NOT_RUN',artifact:null,reason:null}))))};
}
export function preflight(identity={},budget=defaultBudget,{layer='L2'}={}){
 const missing=[];
 for(const key of ['buildId','catalogHash','docsHash','wasmHash','browser','os','device','toolSetHash'])if(!identity.page?.[key])missing.push('PAGE_'+key.toUpperCase()+'_MISSING');
 if(layer==='L2'){
  for(const key of ['provider','modelId','reasoning','contextBudget'])if(!identity.model?.[key])missing.push('MODEL_'+key.toUpperCase()+'_MISSING');
  if(identity.realModel!==true)missing.push('REAL_MODEL_NOT_CONNECTED');
  const nativeQuota=budget.accountingMode==='native-account-token-cap'&&Boolean(budget.authorizationSource);
  const usageOnly=budget.accountingMode==='native-account-usage-only'&&Boolean(budget.authorizationSource);
  if(!usageOnly&&(!Number.isInteger(budget.totalTokens)||budget.totalTokens<1||!nativeQuota&&(!Number.isFinite(budget.totalCost)||budget.totalCost<0)))missing.push('TOTAL_USAGE_BUDGET_NOT_FROZEN');
  if(usageOnly&&(budget.totalTokens!==null||budget.totalCost!==null||identity.model?.accounting?.mode!=='native-account-usage-only'))missing.push('MODEL_USAGE_RECORDER_NOT_MATCHED_TO_PLAN');
  if(nativeQuota&&(identity.model?.accounting?.mode!=='native-account-token-cap'||identity.model.accounting.tokenLimit!==budget.totalTokens||identity.model.accounting.costLimit!==budget.totalCost))missing.push('MODEL_USAGE_METER_NOT_FROZEN_TO_PLAN');
  if(nativeQuota&&identity.model?.transport==='native-responses-sse'&&(!Number.isInteger(identity.model.nativeRequestTokenUpperBound)||identity.model.nativeRequestTokenUpperBound<1||identity.model.nativeRequestTokenUpperBound>budget.totalTokens||!identity.model.nativeBoundSource))missing.push('NATIVE_REQUEST_TOKEN_BOUND_NOT_VERIFIED');
 }
 if(identity.authorizedPageChannel!==true)missing.push('AUTHORIZED_PAGE_CHANNEL_NOT_CONNECTED');
 if(identity.supportsAbort!==true||identity.supportsReconcile!==true)missing.push('CANCEL_RECONCILE_REQUIRED');
 return {status:missing.length?'BLOCKED':'PASS',missing,identity};
}
export function summarize(runs){
 const counts=Object.fromEntries(['PASS','FAIL','BLOCKED','UNVERIFIED','NOT_RUN'].map(s=>[s,runs.filter(r=>r.status===s).length]));
 const executed=runs.filter(r=>['PASS','FAIL','UNVERIFIED'].includes(r.status)).length;
 const byCase=cases.map(c=>({caseId:c.caseId,trials:runs.filter(r=>r.caseId===c.caseId).map(({group,trial,status,reason})=>({group,trial,status,reason})),stability:['A','B'].map(group=>{
  const trials=runs.filter(r=>r.caseId===c.caseId&&r.group===group);
  return {group,planned:trials.length,passes:trials.filter(r=>r.status==='PASS').length,stable:trials.length===3&&trials.filter(r=>r.status==='PASS').length>=2};
 })}));
 return {counts,total:runs.length,executed,firstCorrectRate:null,allPassRate:runs.length?counts.PASS/runs.length:null,executedPassRate:executed?counts.PASS/executed:null,byCase};
}
const sensitive=/authorization|cookie|api[-_]?key|password|secret|grant|ticket|reasoning_content|chainOfThought|hiddenReasoning|token(?!Usage|s)/i;
export function redact(value){
 if(Array.isArray(value))return value.map(redact);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sensitive.test(k)?'[REDACTED]':redact(v)]));
 if(typeof value==='string')return value.replace(/Bearer\s+[^\s"']+/gi,'Bearer [REDACTED]').replace(/([?&](?:key|token|grant|ticket)=)[^&\s]+/gi,'$1[REDACTED]');
 return value;
}
function raceAbort(promise,signal){
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason??Error('DEADLINE'));
  if(signal.aborted)return abort();
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}
export function classifyRunError(error,{modelingFinished=false}={}){
 const reason=typeof error?.code==='string'?error.code:String(error?.message??'');
 // Known transport/authorization/unknown-outcome errors are never geometry failures.
 if(/^(?:MODEL_HTTP_|TRANSPORT_|PERMISSION|UNAUTHORIZED|FORBIDDEN|UNKNOWN_OUTCOME|UNRESOLVED_ORIGINAL_JOB)/.test(reason))return 'BLOCKED';
 // These explicit readback errors prove the completed task lacks its required single body.
 // Do not apply this rule to an initial empty document, or to arbitrary inspect exceptions.
 if(modelingFinished&&['B01_REQUIRES_SINGLE_BODY','BASIC_SINGLE_BODY_REQUIRED'].includes(reason))return 'FAIL';
 return /DEADLINE|BUDGET_EXHAUSTED/.test(reason)?'FAIL':'BLOCKED';
}
export async function runBenchmark({plan,adapter,preflightOnly=false,record=async()=>{},checkpoint=async()=>{}}){
 const report={...structuredClone(plan),runId:randomUUID(),startedAt:new Date().toISOString(),identity:null,preflight:null,status:'BLOCKED',unknownJobs:[]};
 const emit=async event=>record(redact(event));
 let identity={};
 try{identity=adapter?await raceAbort(adapter.preflight(),AbortSignal.timeout(10000)):{};}
 catch{identity={preflightError:'HOST_PREFLIGHT_FAILED_OR_TIMED_OUT'};}
 report.identity=redact(identity);report.preflight=redact(preflight(identity,plan.budget,{layer:plan.layer}));
 report.preflight.missing.push(...missingHostMethods(adapter,{preflightOnly}));
 if(identity.page?.buildId!==plan.build)report.preflight.missing.push('BUILD_MISMATCH');
 if(plan.sourceCommit&&identity.page?.sourceCommit!==plan.sourceCommit)report.preflight.missing.push('PAGE_SOURCE_COMMIT_MISSING_OR_MISMATCH');
 if(adapter?.testing===true)report.preflight.missing.push('MOCK_ADAPTER_NOT_FORMAL');
 if(report.preflight.missing.length){report.preflight.status='BLOCKED';for(const r of report.runs){r.status='BLOCKED';r.reason=report.preflight.missing.join(',');}report.summary=summarize(report.runs);await checkpoint(report);return report;}
 if(preflightOnly){report.status='NOT_RUN';report.summary=summarize(report.runs);await checkpoint(report);return report;}
 let usageTokens=0,usageCost=0,actualUsageTokens=0,actualUsageCost=0,unknownTokenUsage=false,unknownCostUsage=false,sharedExperimentLedger=null,stop=false;
 const usageOnly=plan.budget.accountingMode==='native-account-usage-only';
 const nativeQuota=usageOnly||plan.budget.accountingMode==='native-account-token-cap';
 const instances=new Set(),modelSessions=new Set();
 for(const run of report.runs){
  if(stop){run.reason='PRIOR_RUN_UNRESOLVED_OR_BUDGET';continue;}
  if(plan.layer==='L2'&&!run.caseId.startsWith('B')&&!['B01','B02','B03'].every(id=>report.runs.some(r=>r.caseId===id&&r.group===run.group&&r.status==='PASS'))){run.status='BLOCKED';run.reason='THREE_BASIC_CHAIN_RUNS_NOT_PASSED';continue;}
  const fixture=plan.fixtures.find(c=>c.caseId===run.caseId);
  // A validation receipt is produced by the evaluator, never by the modeling session.
  let validation;
  try{validation=await raceAbort(adapter.validateReference({fixture:structuredClone(fixture)}),AbortSignal.timeout(10000));}
  catch{validation=null;}
  if(validation?.status!=='PASS'||validation.sourceHash!==fixture.sourceHash||validation.oracleVersion!==oracleVersion||validation.oracleHash!==fixture.oracleHash){run.status='BLOCKED';run.reason='REFERENCE_NOT_VALIDATED';continue;}
  const input=cases.find(c=>c.caseId===run.caseId);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(Error('DEADLINE')),plan.budget.wallClockMs);
  const started=Date.now();let session,modelingFinished=false;
  try{
   session=await raceAbort(adapter.openSession({input:structuredClone(input),signal:controller.signal}),controller.signal);
   const missing=missingSessionMethods(session,{layer:plan.layer});
   if(missing.length)throw Error(missing.join(','));
   if(!session?.documentInstanceId||instances.has(session.documentInstanceId)||session.bodyCount!==0||session.busy||!session.initialStateHash)throw Error('INDEPENDENT_EMPTY_DOCUMENT_REQUIRED');
   if(plan.layer==='L2'&&(!session.llmSessionId||modelSessions.has(session.llmSessionId)))throw Error('INDEPENDENT_MODEL_SESSION_REQUIRED');
   instances.add(session.documentInstanceId);modelSessions.add(session.llmSessionId);run.documentInstanceId=session.documentInstanceId;run.initialStateHash=session.initialStateHash;
   const knowledge=await raceAbort(session.knowledge({group:run.group,signal:controller.signal}),controller.signal);
   if(knowledge.catalogHash!==identity.page.catalogHash||knowledge.docsHash!==identity.page.docsHash||knowledge.verified!==true||!Array.isArray(knowledge.files))throw Error('CURRENT_KNOWLEDGE_REQUIRED');
   if(run.group==='B'&&(!knowledge.content||!knowledge.files.length))throw Error('KNOWLEDGE_NOT_LOADED');
   await emit({event:'knowledge-exposure',...run,knowledge});
   const calls=new Set();let alternatives=0,contaminated=run.group==='A'&&Boolean(knowledge.content);
   const result=plan.layer==='L1'?await raceAbort(session.runDeterministic({input,signal:controller.signal,maxToolCalls:plan.budget.maxToolCalls}),controller.signal):await raceAbort(modelSession({task:JSON.stringify(input),group:run.group,modelId:identity.model.modelId,toolIdentity:identity.page.toolSetHash,initialStateId:session.documentInstanceId,knowledge,signal:controller.signal,maxRounds:plan.budget.maxRounds,maxToolCalls:plan.budget.maxToolCalls,
    record:emit,model:async request=>{
     let response;
     try{response=await raceAbort(session.model({...request,remainingBudget:{tokens:plan.budget.totalTokens===null?null:plan.budget.totalTokens-usageTokens,cost:plan.budget.totalCost===null?null:plan.budget.totalCost-usageCost,accountingMode:plan.budget.accountingMode}}),controller.signal);}
     catch(error){
      const snapshot=error.budgetSnapshot;
      if(nativeQuota&&snapshot){
       sharedExperimentLedger=snapshot;
       usageTokens=snapshot.guard.chargedTokens;usageCost=snapshot.guard.chargedCostUpperBound??0;
       unknownTokenUsage=snapshot.actual.totalTokens===null;actualUsageTokens=snapshot.actual.totalTokens??actualUsageTokens;
       unknownCostUsage=snapshot.actual.totalCost===null;actualUsageCost=snapshot.actual.totalCost??actualUsageCost;
      }else{unknownTokenUsage=true;unknownCostUsage=true;}
      stop=true;await emit({event:'model-request-failed',code:error.code??error.message,providerError:error.providerError??null,requestedModelId:error.requestedModelId??null,actualModelId:error.actualModelId??null,budgetSnapshot:snapshot??null});throw error;
     }
     const reportedTokens=Number.isInteger(response.usage?.totalTokens)&&response.usage.totalTokens>=0?response.usage.totalTokens:null;
     const reportedCost=Number.isFinite(response.usage?.cost)&&response.usage.cost>=0?response.usage.cost:null;
     if(reportedTokens===null)unknownTokenUsage=true;else actualUsageTokens+=reportedTokens;
     if(reportedCost===null)unknownCostUsage=true;else actualUsageCost+=reportedCost;
     if(nativeQuota){
      const meter=response.budgetMeter;
      if(!Number.isInteger(meter?.chargedTokens)||meter.chargedTokens<0||meter.configuration?.tokenLimit!==plan.budget.totalTokens||meter.configuration?.costLimit!==plan.budget.totalCost){stop=true;await emit({event:'usage-meter-invalid',response});throw Error('TRUSTED_USAGE_METER_REQUIRED');}
      usageTokens+=meter.chargedTokens;usageCost=meter.snapshot?.guard?.chargedCostUpperBound??0;
      sharedExperimentLedger=meter.snapshot??null;
      if(!usageOnly&&(meter.exhausted||usageTokens>plan.budget.totalTokens||plan.budget.totalCost!==null&&usageCost>plan.budget.totalCost)){stop=true;await emit({event:'model-budget-exhausted',response});throw Error('TOTAL_BUDGET_EXHAUSTED');}
      if(response.transportStatus&&response.transportStatus!=='completed'){stop=true;await emit({event:'model-incomplete',response});throw Error('MODEL_RESPONSE_NOT_COMPLETED');}
      return response;
     }
     if(!Number.isInteger(response.usage?.totalTokens)||response.usage.totalTokens<0||!Number.isFinite(response.usage?.cost)||response.usage.cost<0){
      await emit({event:'model-usage-unavailable',response});usageTokens=null;usageCost=null;stop=true;throw Error('USAGE_UNAVAILABLE');
     }
     usageTokens+=response.usage.totalTokens;usageCost+=response.usage.cost;
     if(usageTokens>plan.budget.totalTokens||usageCost>plan.budget.totalCost){await emit({event:'model-budget-exhausted',response});stop=true;throw Error('TOTAL_BUDGET_EXHAUSTED');}
     return response;
    },execute:async call=>{
     if(!call.id||calls.has(call.id))throw Error('DUPLICATE_CALL_RECONCILE_REQUIRED');calls.add(call.id);
     const classification=await session.classify(call);
     controller.signal.throwIfAborted();
     if(run.group==='A'&&classification.loadsMethodology)contaminated=true;
     if(classification.geometryAlternative&&(!classification.mechanism||++alternatives>1))throw Error('GEOMETRY_ALTERNATIVE_BUDGET');
     const receipt=await raceAbort(session.execute(call,{signal:controller.signal}),controller.signal);
     if(['unknown','running','pending'].includes(receipt?.status))throw Error('UNKNOWN_OUTCOME');
     return receipt;
    },judge:async()=>({status:'MODELING_FINISHED'})}),controller.signal);
   if(result.status==='budget_exhausted'){run.status='FAIL';run.reason='MODEL_OR_TOOL_BUDGET_EXHAUSTED';}
   else{
    modelingFinished=['MODELING_FINISHED','completed'].includes(result.status);
    const observation=await raceAbort(adapter.inspect({session,caseId:run.caseId,signal:controller.signal}),controller.signal);
    run.judgment=judgeGeometry(run.caseId,observation.geometry);
    run.roundTripJudgment=judgeGeometry(run.caseId,observation.roundTrip?.geometry);
    const bytes=observation.stepBytes;
    const hash=bytes instanceof Uint8Array?sha256(Buffer.from(bytes)):null;
    const artifacts=bytes instanceof Uint8Array&&bytes.length>0&&hash===observation.roundTrip?.sourceSha256&&observation.projectSha256&&observation.screenshotSha256&&observation.revision===observation.roundTrip?.sourceRevision&&observation.roundTrip?.documentInstanceId&&observation.roundTrip.documentInstanceId!==session.documentInstanceId;
    run.artifact=hash?{stepSha256:hash,stepBytes:bytes.length,projectSha256:observation.projectSha256??null,screenshotSha256:observation.screenshotSha256??null}:null;
    run.status=[run.judgment.status,run.roundTripJudgment.status].includes('FAIL')?'FAIL':run.judgment.status==='PASS'&&run.roundTripJudgment.status==='PASS'&&artifacts?'PASS':'UNVERIFIED';
    if(!artifacts)run.reason='ARTIFACT_OR_ROUNDTRIP_EVIDENCE_MISSING';
    if(contaminated){run.status='UNVERIFIED';run.reason='AB_METHOD_CONTAMINATION';}
   }
  }catch(error){
   run.status=classifyRunError(error,{modelingFinished});run.reason=error.message;
   if(!session){stop=true;report.unknownJobs.push({reason:'SESSION_OPEN_OUTCOME_UNRESOLVED'});}
  }finally{
   clearTimeout(timer);controller.abort();
   // Always reconcile before the next case. No automatic retry of a write.
   if(session){
    try{run.cleanup=await raceAbort(session.stopAndReconcile(),AbortSignal.timeout(10000));}
    catch{run.cleanup={status:'unknown'};}
    if(run.cleanup?.status!=='terminal'){stop=true;run.status='BLOCKED';run.reason='UNRESOLVED_ORIGINAL_JOB';report.unknownJobs.push({documentInstanceId:session.documentInstanceId});}
   }
   run.wallClockMs=Date.now()-started;await emit({event:'run-complete',run});await checkpoint(report);
  }
 }
 report.usage={scope:'current-run',totalTokens:unknownTokenUsage?null:actualUsageTokens,totalCost:unknownCostUsage?null:actualUsageCost,guard:{chargedTokens:usageTokens,chargedCostUpperBound:plan.budget.totalCost===null?null:usageCost},sharedExperimentLedger,accountingMode:plan.budget.accountingMode??'reported-token-and-cost-cap'};report.summary=summarize(report.runs);
 report.status=report.runs.every(r=>r.status==='PASS')?'PASS':report.runs.some(r=>r.status==='FAIL')?'FAIL':report.runs.some(r=>r.status==='BLOCKED')?'BLOCKED':'UNVERIFIED';
 await checkpoint(report);return report;
}
