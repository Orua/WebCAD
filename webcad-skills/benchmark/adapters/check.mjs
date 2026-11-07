import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {preflight,defaultBudget,redact} from '../runner.mjs';

// Works inside a Playwright CLI run-code host as well as an authorized Node host.
// This does not construct a browser, discover ports, or launch any service.
export async function checkBrowserAdapter(adapter,{mode='preflight',signal}={}){
 if(!['preflight','s01-l1','b01-l1','b02-l1','b03-l1','m01-l1','m02-l1','m03-l1','m04-l1','m05-l1','s02-l1','s03-l1','s06-l1'].includes(mode))throw Error('CHECK_MODE_INVALID');
 if(mode==='s01-l1')return adapter.runBasicDiagnostic({caseId:'S01',signal});
 if(mode==='m02-l1')return adapter.runBasicDiagnostic({caseId:'M02',signal});
 if(mode==='m05-l1')return adapter.runBasicDiagnostic({caseId:'M05',signal});
 if(mode==='m03-l1')return adapter.runBasicDiagnostic({caseId:'M03',signal});
 if(mode==='s02-l1')return adapter.runBasicDiagnostic({caseId:'S02',signal});
 if(mode==='s06-l1')return adapter.runBasicDiagnostic({caseId:'S06',signal});
 if(mode==='s03-l1')return adapter.runBasicDiagnostic({caseId:'S03',signal});
 if(mode==='b01-l1')return adapter.runB01Diagnostic({signal});
 if(mode==='b02-l1'||mode==='b03-l1')return adapter.runBasicDiagnostic({caseId:mode==='b02-l1'?'B02':'B03',signal});
 if(mode==='m01-l1'||mode==='m04-l1')return adapter.runBasicDiagnostic({caseId:mode==='m01-l1'?'M01':'M04',signal});
 const identity=await adapter.preflight();
 const result=preflight(identity,defaultBudget,{layer:'L1'});
 return {recordType:'READ_ONLY_HOST_PREFLIGHT',status:result.status,missing:result.missing,identity:redact(identity)};
}
// --host is an explicitly supplied local module exporting a configured adapter.
// Model credentials must be supplied at runtime by that host, never placed in argv.
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const {values}=parseArgs({options:{host:{type:'string'},mode:{type:'string',default:'preflight'}}});
  if(!values.host)throw Error('EXPLICIT_AUTHORIZED_HOST_MODULE_REQUIRED');
  const adapter=(await import(pathToFileURL(resolve(values.host)))).default;
  const result=await checkBrowserAdapter(adapter,{mode:values.mode,signal:AbortSignal.timeout(values.mode==='preflight'?60000:600000)});
  console.log(JSON.stringify(redact(result)));
  process.exitCode=result.status==='PASS'?0:result.status==='FAIL'?1:2;
 }catch(error){console.error(error.code??error.message);process.exitCode=3;}
}
