import {parseArgs} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createPlan,fixtureIndex,runBenchmark,sha256,redact} from './runner.mjs';
const {values}=parseArgs({options:{help:{type:'boolean'},preflight:{type:'boolean'},'validate-fixtures':{type:'boolean'},suite:{type:'string',default:'baseline'},layer:{type:'string',default:'L2'},repeat:{type:'string',default:'3'},group:{type:'string',default:'B'},caseId:{type:'string'},build:{type:'string'},output:{type:'string'},adapter:{type:'string'},'total-tokens':{type:'string'},'total-cost':{type:'string'}}});
if(values.help){
 console.log(`node webcad-skills/benchmark/cli.mjs --build LIVE_BUILD_ID --output EXTERNAL_NEW_DIRECTORY [options]
 --preflight                    Read host identity only; never open a model session
 --validate-fixtures            Inventory references; unvalidated geometry remains UNVERIFIED
 --adapter HOST_MODULE          Authorized host module exporting default adapter; no credential discovery
 --suite baseline|AB            AB has six fixed representatives; cannot substitute for version comparison
 --layer L1|L2                  Deterministic public tools or isolated real-model sessions
 --repeat 1..3 --group A|B       Defaults: three trials, methods enabled
 --caseId ID                    Fresh reproduction under frozen input, never overwrites old run
 --total-tokens N --total-cost N Freeze shared run budget before inference
 Exit: 0 PASS; 1 FAIL; 2 BLOCKED/UNVERIFIED/NOT_RUN; 3 invalid invocation or storage failure.
 Missing model, page, independent reference or checker evidence never counts as PASS.
 Output: exclusive plan.json, final run.json, redacted events.json and resumable checkpoint.json.
 Framework selftest: node --test webcad-skills/benchmark/selftest.test.mjs
 A host must implement the adapter contract in host-contract.mjs; existing page-client and
 knowledge-cache helpers supply the authorized page boundary. This runner starts no server.`);
 process.exit(0);
}
try{
 if(!values.output)throw Error('OUTPUT_REQUIRED: choose an external, new evidence directory');
 const output=resolve(values.output);
 const repository=fileURLToPath(new URL('../..',import.meta.url));
 const relativeOutput=relative(repository,output);
 if(!isAbsolute(relativeOutput)&&relativeOutput!=='..'&&!relativeOutput.startsWith('..'+sep))throw Error('OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
 const gitOptions={encoding:'utf8',cwd:repository};
 const source={commit:execFileSync('git',['rev-parse','HEAD'],gitOptions).trim(),dirty:!!execFileSync('git',['status','--porcelain'],gitOptions).trim()};
 const plan=createPlan({suite:values.suite,layer:values.layer,repeat:Number(values.repeat),group:values.group,caseId:values.caseId,build:values.build,sourceCommit:source.commit,budget:{totalTokens:values['total-tokens']?Number(values['total-tokens']):null,totalCost:values['total-cost']?Number(values['total-cost']):null}});
 await mkdir(output,{recursive:true});
 // Exclusive claim prevents accidental replacement of an immutable baseline.
 await writeFile(join(output,'plan.json'),JSON.stringify({plan,planSha256:sha256(plan)},null,2),{flag:'wx'});
 let report;
 if(values['validate-fixtures'])report={status:'UNVERIFIED',source,fixtures:fixtureIndex(),reason:'Mathematical specifications present; independent reference geometry and calibrated checker receipts required.'};
 else{
  const adapter=values.adapter?(await import(pathToFileURL(resolve(values.adapter)))).default:null;
  const events=[];
  report=await runBenchmark({plan,adapter,preflightOnly:values.preflight,record:async event=>events.push(event),checkpoint:async snapshot=>writeFile(join(output,'checkpoint.json'),JSON.stringify(redact(snapshot),null,2))});
  await writeFile(join(output,'events.json'),JSON.stringify(events,null,2),{flag:'wx'});
  report.source=source;
 }
 await writeFile(join(output,'run.json'),JSON.stringify(redact(report),null,2),{flag:'wx'});
 console.log(JSON.stringify({status:report.status,summary:report.summary??null,missing:report.preflight?.missing??null}));
 process.exitCode=report.status==='PASS'?0:report.status==='FAIL'?1:2;
}catch(error){console.error(error.message);process.exitCode=3;}
