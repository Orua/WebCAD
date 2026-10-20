import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {errorRecovery,withErrorRecovery,recoveryRule,errorRecoveryCatalogDoc,humanError,errorAuditSnapshot} from '../src/error-recovery.js';
import {errorCodeInventory} from '../scripts/error-code-inventory.mjs';
import {createPageJobs} from '../src/page-jobs.js';
import {failure} from '../src/agent/protocol.js';
import {readDocs} from '../src/page-api-docs.js';

test('source literal inventory has a deliberate recovery family and exact published mapping',()=>{
 const inventory=errorCodeInventory(),published=JSON.parse(readFileSync(new URL('../contracts/error-recovery-codes.json',import.meta.url),'utf8'));
 assert.ok(inventory.codes.length>300);
 assert.deepEqual(published.codes,inventory.codes.map(entry=>entry.code));
 for(const {code,sources} of inventory.codes){assert.notEqual(recoveryRule(code).id,'unclassified',code);assert.ok(sources.length,code);}
 const guide=errorRecoveryCatalogDoc();for(const code of published.codes)assert.ok(guide.includes('`'+code+'`'),code);
 assert.equal(readDocs({docId:'api.error-recovery',limitChars:2000}).status,'read');
});

test('hard guards never turn into an automatic retry, fallback or preview authorization',()=>{
 for(const code of ['scope_denied','PARAM_SCHEMA_INVALID','SOURCE_HASH_MISMATCH','REVISION_CONFLICT','AMBIGUOUS_SELECTION','PREVIOUS_ATTEMPT_FAILED','RELIEF_PATCH_PROTECTION','UNSAFE_LEGACY_REFERENCE']){
  const r=errorRecovery({code},{status:'failed',commitState:'not_committed'});
  assert.equal(r.stop,true,code);assert.equal(r.automaticRetry,false);assert.equal(r.candidate.eligible,false);assert.equal(r.candidate.allowed,false);assert.equal(r.alternatives.automaticFallback,false);
 }
});

test('unknown wins over transient/cancel/error hints and must reconcile the original request',()=>{
 const raw={status:'unknown',commitState:'unknown',requestId:'r-7',error:{code:'CANCELLED',message:'private failure at F:/private/path token=secret',jobId:'original-job'}};
 const result=withErrorRecovery(raw),r=result.error.recovery;
 assert.equal(result.status,raw.status);assert.equal(result.error.message,raw.error.message);assert.equal(result.requestId,'r-7');assert.equal(result.error.jobId,'original-job');
 assert.equal(r.classification,'reconcile');assert.equal(r.candidate.eligible,false);assert.equal(r.stop,true);assert.match(r.userMessage,/尚未确认/);assert.doesNotMatch(r.userMessage,/F:|secret|token|已回滚/);
 for(const code of ['SERVICES_CONNECTION_UNKNOWN','JOB_NOT_FOUND','PREVIOUS_ATTEMPT_UNKNOWN','OBSERVATION_CANCELLED'])assert.equal(errorRecovery({code},{commitState:'not_committed'}).classification,'reconcile');
});

test('partial and post-commit errors preserve their actual proof level',()=>{
 const partial=withErrorRecovery({status:'partial',atomic:false,error:{code:'GEOMETRY_INVALID',message:'OCCT fail'},results:[{id:'made',result:{status:'committed'}},{id:'bad',result:{status:'failed',commitState:'not_committed',error:{code:'GEOMETRY_INVALID',message:'bad'}}}]});
 assert.match(partial.error.userMessage,/前面已提交/);assert.doesNotMatch(partial.error.userMessage,/本次失败步骤未提交/);
 assert.equal(partial.error.recovery.candidate.eligible,false);assert.equal(partial.results[0].result.status,'committed');
 assert.match(partial.results[1].result.error.userMessage,/本次失败步骤未提交/);
 const committed=errorRecovery({code:'DISPLAY_FAILED'},{commitState:'committed'});assert.match(committed.userMessage,/已有操作提交/);assert.doesNotMatch(committed.userMessage,/本次失败步骤未提交/);
});

test('candidate evaluation cannot grant execution, change intent or reset the shared budget',()=>{
 const r=errorRecovery({code:'GEOMETRY_INVALID'},{status:'failed',commitState:'not_committed'});
 assert.equal(r.candidate.eligible,true);assert.equal(r.candidate.allowed,false);assert.equal(r.automaticRetry,false);
 assert.ok(r.candidate.requires.includes('new-mechanism-evidence'));assert.ok(r.candidate.requires.includes('shared-budget-available'));assert.ok(r.candidate.requires.includes('unchanged-design-intent'));
 assert.equal(errorRecovery({code:'GEOMETRY_INVALID',budgetExhausted:true},{commitState:'not_committed'}).candidate.eligible,false);
 assert.equal(errorRecovery({code:'GEOMETRY_INVALID'}).candidate.eligible,false);
});

test('concise actionable Chinese survives while stack, path and credentials do not reach users',()=>{
 const friendly='请选择一个平面，再检查孔的深度。';assert.ok(errorRecovery({message:friendly}).userMessage.includes(friendly));
 for(const message of ['执行失败 F:\\private\\secret.txt','连接错误 Authorization: Bearer privatevalue','错误\n at worker (private.js:8)','处理失败 token=privatevalue','后台失败 jobId: aabbccdd']){
  const r=errorRecovery({code:'GEOMETRY_INVALID',message});assert.ok(!r.userMessage.includes(message),message);assert.doesNotMatch(r.userMessage,/privatevalue|secret.txt|worker \(|aabbccdd/);
 }
 assert.equal(errorRecovery({code:'FUTURE_VENDOR_ERROR',message:'not safe'}).classification,'unclassified');
});

test('binary resources and successful read objects retain their type and contents',()=>{
 const bytes=new Uint8Array([1,2,3]);assert.equal(withErrorRecovery(bytes),bytes);
 const blob=new Blob([bytes]);assert.equal(withErrorRecovery(blob),blob);
 assert.deepEqual(withErrorRecovery({status:'generated',resourceId:'x',size:3}),{status:'generated',resourceId:'x',size:3});
 assert.equal(failure('scope_denied','raw audit').message,'raw audit');assert.equal(failure('scope_denied','raw audit').recovery.classification,'authorization');
});

test('UI-only audit retains code, original diagnostic and request identity outside rendered text',()=>{
 const message=humanError({code:'PARAM_SCHEMA_INVALID',message:'native details F:/internal/file token=do-not-retain',requestId:'original-r'});
 const audit=errorAuditSnapshot().at(-1);assert.equal(audit.code,'PARAM_SCHEMA_INVALID');assert.equal(audit.requestId,'original-r');assert.match(audit.message,/native details F:/);assert.doesNotMatch(audit.message,/do-not-retain/);assert.doesNotMatch(message,/native details|F:\//);
 for(let i=0;i<105;i++)humanError({message:'请输入有效数值'});assert.equal(errorAuditSnapshot().length,100);
});

test('page jobs enrich terminal failure without replaying or changing cancel/unknown semantics',async()=>{
 let executions=0;const api={getState:()=>({context:{documentInstanceId:'d'}}),invoke:async()=>{executions++;return {status:'unknown',commitState:'unknown',error:{code:'JOB_TIMEOUT',message:'raw timeout'}};}};
 const jobs=createPageJobs(api),input={method:'execute',jobId:'original',args:{}};
 jobs.submit(input);await jobs.awaitJob({jobId:'original',timeoutMs:1000});
 const receipt=jobs.getJob({jobId:'original'});assert.equal(receipt.status,'unknown');assert.equal(receipt.result.error.recovery.classification,'reconcile');
 assert.equal(jobs.submit(input).status,'unknown');assert.equal(executions,1);
 jobs.submit({...input,jobId:'queued'});assert.equal(jobs.cancelJob({jobId:'queued'}).cancelled,true);assert.equal(jobs.getJob({jobId:'queued'}).status,'cancelled');
});
