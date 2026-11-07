/**
 * Authorized hosts inject these functions. This module has no browser discovery,
 * credential lookup, model provider, server or secondary geometry engine.
 *
 * adapter.preflight(): identity with actual page build/catalog/docs/WASM/tool hashes,
 * page.sourceCommit must match the plan's source commit (CLI captures current HEAD),
 * browser/OS/device, actual model provider/ID/reasoning/contextBudget and explicit
 * realModel/authorizedPageChannel/supportsAbort/supportsReconcile booleans.
 * adapter.validateReference({fixture}): independent evaluator receipt with status,
 * sourceHash, oracleVersion and oracleHash; PASS requires real geometry and calibrated checks.
 * adapter.openSession({input,signal}): new empty document AND new model context.
 * Only input is passed to the model side. Oracle paths/scripts/answers stay evaluator-only.
 * adapter.inspect({session,caseId,signal}): independent current and STEP-readback
 * observations, original STEP Uint8Array, saved-project and screenshot hashes;
 * roundTrip includes sourceSha256/sourceRevision and a distinct documentInstanceId.
 * The host stores actual bytes/images in the private evidence directory.
 *
 * session has documentInstanceId,llmSessionId,initialStateHash,bodyCount,busy;
 * knowledge({group,signal}) supplies verified current content, full doc IDs and
 * hashes, load order and omissions in files[], plus catalogHash/docsHash.
 * model({model,messages,signal}) returns text/toolCalls and usage.totalTokens/cost;
 * never return provider hidden reasoning, credentials or billing account details.
 * classify(call) is HOST-owned: geometryAlternative/mechanism/loadsMethodology.
 * execute(call,{signal}) dispatches public methods with fresh contexts and retained
 * original idempotency keys; it must enforce the declared geometry budget, not rely
 * on model-provided annotations. It returns a terminal receipt or explicit unknown.
 * runDeterministic({input,signal,maxToolCalls}) is L1-only; it uses the same public
 * page path, owns its call budget and retains all requests/receipts for inspection.
 * stopAndReconcile() cancels/ends this model session and queries original jobs.
 * Only {status:'terminal'} allows advancing to another run. It must quarantine
 * pending transport/late writes before declaring terminal, and not cancel user jobs.
 *
 * Framework fake adapters must set testing:true; formal runs reject that flag.
 * A method A run that loads methodology is contaminated, never a clean A success.
 * Baseline/AB complex cases require successful B01/B02/B03 chains in the same run;
 * do not pass a historical chain receipt from a different build or model.
 */
export const hostContractVersion='1.0.0';

export function missingHostMethods(adapter,{preflightOnly=false}={}){
 const methods=preflightOnly?['preflight']:['preflight','validateReference','openSession','inspect'];
 return methods.filter(method=>typeof adapter?.[method]!=='function').map(method=>'HOST_METHOD_MISSING:'+method);
}

export function missingSessionMethods(session,{layer='L2'}={}){
 const methods=['knowledge','stopAndReconcile',...(layer==='L1'?['runDeterministic']:['model','classify','execute'])];
 return methods.filter(method=>typeof session?.[method]!=='function').map(method=>'SESSION_METHOD_MISSING:'+method);
}
