// Source-bound real L1 acceptance. No inference, service, port changes or publication.
import {parseArgs} from 'node:util';
import {createRequire} from 'node:module';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {platform,release,arch} from 'node:os';
import {createFrozenCandidateHost} from './adapters/frozen-candidate.mjs';
import {createBrowserBenchmarkAdapter} from './adapters/browser-host.mjs';
import {createArtifactWriter} from './adapters/artifact-writer.mjs';
import {createOcpStepReader} from './oracle/native/python-reader.mjs';
import {createS06StepReader} from './oracle/native/s06-reader.mjs';
import {createFrozenReferenceValidator} from './oracle/native/frozen-reference.mjs';
import {fixtureIndex,redact} from './runner.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const {values}=parseArgs({options:{case:{type:'string'},candidate:{type:'string'},'expected-build':{type:'string'},'expected-source-hash':{type:'string'},'playwright-package':{type:'string'},python:{type:'string'},'knowledge-dir':{type:'string'},'reference-dir':{type:'string'},output:{type:'string'}}});
let browser,adapter,output,claimed=false;
try{
 if(!['B02','B03','M01','M02','M03','M04','M05','S01','S02','S03','S06'].includes(values.case))throw Error('EXPLICIT_SUPPORTED_L1_CASE_REQUIRED_NO_B01_REPEAT');
 for(const key of ['candidate','playwright-package','python','knowledge-dir','reference-dir','output'])if(!isAbsolute(values[key]??''))throw Error('EXPLICIT_ABSOLUTE_RUNTIME_PATH_REQUIRED:'+key);
 output=resolve(values.output);const persist=await createArtifactWriter(output);
 // Exclusive plan claim: previously passed or unknown executions are never overwritten.
 await writeFile(join(output,'plan.json'),JSON.stringify({recordType:'FROZEN_CANDIDATE_REAL_L1_NOT_MODEL_BASELINE',caseId:values.case,expectedBuildId:values['expected-build'],expectedSourceHash:values['expected-source-hash'],inference:false,wallClockMs:180000},null,2),{flag:'wx'});
 claimed=true;
 const directories=await readdir(values['reference-dir'],{withFileTypes:true}),fixture=fixtureIndex().find(f=>f.caseId===values.case);
 let entry;
 for(const directory of directories.filter(d=>d.isDirectory()&&d.name.startsWith(values.case+'-reference-'))){
  const receiptPath=join(values['reference-dir'],directory.name,'reference-validation.json');
  try{const receipt=JSON.parse(await readFile(receiptPath,'utf8'));if(receipt.variant==='reference'&&receipt.geometryStatus==='PASS'){entry={...fixture,receiptPath,stepPath:join(values['reference-dir'],directory.name,'reference.step')};break;}}catch{}
 }
 if(!entry)throw Error('EXISTING_PASSED_REFERENCE_REQUIRED_NO_RECOMPUTE');
 const referenceValidator=createFrozenReferenceValidator({entries:[entry]});
 const validation=await referenceValidator({fixture});if(validation.status!=='PASS')throw Error('FROZEN_REFERENCE_INVALID');
 const independentReader=await (values.case==='S06'?createS06StepReader:createOcpStepReader)({python:values.python,directory:join(output,'independent-oracle')});
 const {chromium}=createRequire(values['playwright-package'])('playwright');
 browser=await chromium.launch({channel:'chrome',headless:true});
 const candidate=await createFrozenCandidateHost({browser,candidateDirectory:values.candidate,expectedBuildId:values['expected-build'],expectedSourceHash:values['expected-source-hash']});
 const record=async event=>{const bytes=Buffer.from(JSON.stringify(redact(event)));return persist({scope:'events',name:randomUUID()+'.json',bytes,sha256:hash(bytes)});};
 adapter=createBrowserBenchmarkAdapter({openPage:candidate.openPage,knowledge:{baseUrl:'http://localhost/webcad/',directory:values['knowledge-dir'],fetchImpl:candidate.fetchImpl},runtime:{browser:browser.version(),os:platform()+' '+release(),device:arch(),wasmHash:candidate.wasmHash},referenceValidator,independentReader,persist,record});
 const preflight=await adapter.preflight();candidate.verifyObservedWasm();
 if(preflight.page.buildId!==values['expected-build']||preflight.page.sourceCommit!==candidate.source.commit||preflight.page.catalogHash!==candidate.manifest.catalogHash||preflight.page.docsHash!==candidate.manifest.docsHash)throw Error('LIVE_CANDIDATE_PREFLIGHT_IDENTITY_MISMATCH');
 await writeFile(join(output,'preflight.json'),JSON.stringify({identity:preflight,applicationSnapshot:candidate.source,validation},null,2),{flag:'wx'});
 const result=await adapter.runBasicDiagnostic({caseId:values.case,signal:AbortSignal.timeout(180000)});
 await writeFile(join(output,'result.json'),JSON.stringify({recordType:'REAL_SOURCE_BOUND_L1_NOT_MODEL_BASELINE',applicationSnapshot:candidate.source,result,observedAssets:candidate.verifyObservedWasm()},null,2),{flag:'wx'});
 console.log(JSON.stringify({caseId:values.case,status:result.status,recordType:result.recordType,output}));process.exitCode=result.status==='PASS'?0:result.status==='FAIL'?1:2;
}catch(error){
 console.error(error.code??error.message);process.exitCode=2;
 if(claimed)await writeFile(join(output,'failure.json'),JSON.stringify({code:error.code??null,message:error.message},null,2),{flag:'wx'}).catch(()=>{});
}finally{
 if(adapter){const reconciliation=await adapter.reconcileOpenSessions();if(output)await writeFile(join(output,'reconciliation.json'),JSON.stringify(reconciliation,null,2),{flag:'wx'});if(reconciliation.status==='terminal')await browser?.close();else process.exitCode=2;}
 else await browser?.close();
}
